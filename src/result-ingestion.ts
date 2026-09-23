import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import {
  EVIDENCE_KINDS,
  type AcceptanceState,
  type AgentRecord,
  type ArtifactFingerprint,
  type EvidenceKind,
  type EvidenceRecord,
  type PstackRun,
  type VerdictRecord,
  type VerdictValue,
} from "./domain.js";
import { computeArtifactFingerprint, type ExecRunner } from "./fingerprint.js";
import type { PstackStore } from "./store.js";
import { isRecord, nowIso, sha256, uniqueStrings } from "./utils.js";
import { validateVerdict } from "./validation.js";

interface StructuredOutputLike {
  status?: string;
  source?: string;
  data?: unknown;
  error?: string;
}

interface TaskResultRow {
  id?: string;
  agent?: string;
  exitCode?: number;
  structuredOutput?: StructuredOutputLike;
}

interface ReportedEvidence {
  kind: EvidenceKind;
  claim: string;
  ref: string;
}

interface AcceptanceResult {
  id: string;
  outcome: "passed" | "failed" | "inconclusive";
  evidenceRefs: string[];
  note?: string;
}

export interface StructuredIngestionReport {
  actors: string[];
  evidenceIds: string[];
  verdictIds: string[];
  warnings: string[];
}

function resultRows(details: unknown): TaskResultRow[] {
  if (!isRecord(details) || !Array.isArray(details.results)) return [];
  const rows: TaskResultRow[] = [];
  for (const value of details.results) {
    if (!isRecord(value)) continue;
    let structuredOutput: StructuredOutputLike | undefined;
    if (isRecord(value.structuredOutput)) {
      structuredOutput = {
        ...(typeof value.structuredOutput.status === "string" ? { status: value.structuredOutput.status } : {}),
        ...(typeof value.structuredOutput.source === "string" ? { source: value.structuredOutput.source } : {}),
        ...(Object.hasOwn(value.structuredOutput, "data") ? { data: value.structuredOutput.data } : {}),
        ...(typeof value.structuredOutput.error === "string" ? { error: value.structuredOutput.error } : {}),
      };
    }
    rows.push({
      ...(typeof value.id === "string" ? { id: value.id } : {}),
      ...(typeof value.agent === "string" ? { agent: value.agent } : {}),
      ...(typeof value.exitCode === "number" ? { exitCode: value.exitCode } : {}),
      ...(structuredOutput ? { structuredOutput } : {}),
    });
  }
  return rows;
}

function normalizeName(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function actorForResult(run: PstackRun, row: TaskResultRow, toolCallId: string | undefined): AgentRecord | undefined {
  if (row.id) {
    const exact = run.agents.find(agent => agent.runtimeAgentId === row.id);
    if (exact) return exact;
  }
  const name = normalizeName(row.agent);
  const candidates = run.agents
    .filter(agent => (!name || normalizeName(agent.agentName) === name) && (!toolCallId || agent.toolCallId === toolCallId))
    .sort((left, right) => right.spawnedAt.localeCompare(left.spawnedAt));
  return candidates[0];
}

function evidenceKind(value: unknown): EvidenceKind {
  if (typeof value === "string" && (EVIDENCE_KINDS as readonly string[]).includes(value)) return value as EvidenceKind;
  return "observation";
}

function parseEvidence(data: Record<string, unknown>): ReportedEvidence[] {
  if (!Array.isArray(data.evidence)) return [];
  const rows: ReportedEvidence[] = [];
  for (const value of data.evidence) {
    if (!isRecord(value)) continue;
    const claim = typeof value.claim === "string" ? value.claim.trim() : "";
    const ref = typeof value.ref === "string" ? value.ref.trim() : "";
    if (!claim || !ref) continue;
    rows.push({ kind: evidenceKind(value.kind), claim, ref });
  }
  return rows;
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return uniqueStrings(value.filter((item): item is string => typeof item === "string"));
}

function parseAcceptanceResults(data: Record<string, unknown>): AcceptanceResult[] {
  const parsed: AcceptanceResult[] = [];
  if (Array.isArray(data.acceptance_results)) {
    for (const value of data.acceptance_results) {
      if (!isRecord(value)) continue;
      const id = typeof value.id === "string" ? value.id.trim() : "";
      const outcome = value.outcome;
      if (!id || (outcome !== "passed" && outcome !== "failed" && outcome !== "inconclusive")) continue;
      parsed.push({
        id,
        outcome,
        evidenceRefs: parseStringArray(value.evidence_refs),
        ...(typeof value.note === "string" && value.note.trim() ? { note: value.note.trim() } : {}),
      });
    }
  }
  for (const id of parseStringArray(data.failed_acceptance)) {
    if (!parsed.some(item => item.id === id)) {
      parsed.push({ id, outcome: "failed", evidenceRefs: [], note: "Verifier reported this criterion as failed." });
    }
  }
  return parsed;
}

function parseVerdict(value: unknown): VerdictValue | undefined {
  return value === "PASS" || value === "FAIL" || value === "INCONCLUSIVE" ? value : undefined;
}

/**
 * Only reached with OMP-validated output against the pstack agent's own
 * frontmatter schema, which requires `tested_fingerprint {kind, digest, partial}`.
 */
function parseFingerprint(value: unknown, current: ArtifactFingerprint): { fingerprint: ArtifactFingerprint; reported: boolean } {
  if (!isRecord(value) || typeof value.digest !== "string" || !value.digest.trim()) {
    return { reported: false, fingerprint: { ...current, generatedAt: nowIso() } };
  }
  const digest = value.digest.trim();
  return {
    reported: true,
    fingerprint: {
      kind: value.kind === "git" || value.kind === "workspace" ? value.kind : current.kind,
      digest,
      generatedAt: nowIso(),
      ...(typeof value.head_sha === "string" && value.head_sha.trim() ? { headSha: value.head_sha.trim() } : {}),
      ...(typeof value.dirty_hash === "string" && value.dirty_hash.trim() ? { dirtyHash: value.dirty_hash.trim() } : {}),
      ...(typeof value.clean === "boolean" ? { clean: value.clean } : {}),
      partial: typeof value.partial === "boolean" ? value.partial : digest !== current.digest,
      notes: parseStringArray(value.notes),
    },
  };
}

function stableId(prefix: string, parts: readonly string[]): string {
  return `${prefix}-${sha256(parts.join("\u0000")).slice(0, 20)}`;
}

function normalizeEvidenceRefs(refs: readonly string[], byReportedRef: ReadonlyMap<string, string>): string[] {
  return uniqueStrings(refs.map(ref => byReportedRef.get(ref) ?? ref));
}

async function recordStructuredEvidence(
  store: PstackStore,
  ctx: ExtensionContext,
  run: PstackRun,
  actor: AgentRecord,
  row: TaskResultRow,
  data: Record<string, unknown>,
  fingerprintDigest: string | undefined,
): Promise<{ ids: string[]; byReportedRef: Map<string, string> }> {
  const ids: string[] = [];
  const byReportedRef = new Map<string, string>();
  const rows = parseEvidence(data);
  for (let index = 0; index < rows.length; index += 1) {
    const reported = rows[index];
    if (!reported) continue;
    const id = stableId("evidence", [run.id, actor.actorId, row.id ?? "no-runtime-id", String(index), reported.claim, reported.ref]);
    const at = nowIso();
    const evidence: EvidenceRecord = {
      id,
      kind: reported.kind,
      claim: reported.claim,
      ref: reported.ref,
      producedBy: actor.actorId,
      createdAt: at,
      ...(fingerprintDigest ? { fingerprintDigest } : {}),
      metadata: {
        source: "subagent_structured_output",
        role: actor.role,
        agentName: actor.agentName,
        ...(row.id ? { runtimeAgentId: row.id } : {}),
      },
    };
    await store.mutate(ctx, { type: "record_evidence", evidence, at }, "subagent_evidence_ingested");
    ids.push(id);
    byReportedRef.set(reported.ref, id);
  }
  return { ids, byReportedRef };
}

async function applyAcceptanceResults(
  store: PstackStore,
  ctx: ExtensionContext,
  run: PstackRun,
  results: readonly AcceptanceResult[],
  globalEvidenceRefs: readonly string[],
  byReportedRef: ReadonlyMap<string, string>,
  artifactMatches: boolean,
): Promise<string[]> {
  const problems: string[] = [];
  for (const result of results) {
    const criterion = run.acceptance.find(item => item.id === result.id);
    if (!criterion) {
      problems.push(`Verifier reported unknown acceptance criterion '${result.id}'.`);
      continue;
    }
    const evidenceRefs = normalizeEvidenceRefs(result.evidenceRefs, byReportedRef);
    const effectiveEvidence = evidenceRefs.length > 0 ? evidenceRefs : [...globalEvidenceRefs];
    if (!artifactMatches) {
      problems.push(`${criterion.id} outcome was not applied because the verifier fingerprint is missing or stale.`);
      continue;
    }
    let state: AcceptanceState = "open";
    if (result.outcome === "passed") {
      if (effectiveEvidence.length === 0) {
        problems.push(`${criterion.id} was reported passed without evidence.`);
        continue;
      }
      state = "passed";
    } else if (result.outcome === "failed") {
      state = "failed";
    }
    await store.mutate(ctx, {
      type: "update_acceptance",
      id: criterion.id,
      state,
      ...(result.note ? { reason: result.note } : {}),
      ...(effectiveEvidence.length > 0 ? { evidenceRefs: effectiveEvidence } : {}),
      at: nowIso(),
    }, "verifier_acceptance_ingested");
  }
  return problems;
}

async function ingestVerifier(
  exec: ExecRunner,
  store: PstackStore,
  ctx: ExtensionContext,
  run: PstackRun,
  actor: AgentRecord,
  row: TaskResultRow,
  data: Record<string, unknown>,
): Promise<{ evidenceIds: string[]; verdictId?: string; warnings: string[] }> {
  const warnings: string[] = [];
  const current = await computeArtifactFingerprint(exec, ctx.cwd, (await store.get(ctx)).config);
  const parsedFingerprint = parseFingerprint(data.tested_fingerprint, current);
  const evidence = await recordStructuredEvidence(store, ctx, run, actor, row, data, parsedFingerprint.fingerprint.digest);
  const directRefs = normalizeEvidenceRefs(parseStringArray(data.evidence_refs), evidence.byReportedRef);
  const evidenceRefs = uniqueStrings([...evidence.ids, ...directRefs]);
  const acceptanceResults = parseAcceptanceResults(data);

  const reportedVerdict = parseVerdict(data.verdict);
  if (!reportedVerdict) {
    return { evidenceIds: evidence.ids, warnings: [...warnings, "Verifier structured output omitted a valid verdict."] };
  }

  const required = run.acceptance.filter(item => item.required);
  const reportedById = new Map(acceptanceResults.map(item => [item.id, item]));
  if (!parsedFingerprint.reported) warnings.push("Verifier omitted tested_fingerprint.");
  const artifactMatches = parsedFingerprint.reported && parsedFingerprint.fingerprint.digest === current.digest;
  if (parsedFingerprint.reported && !artifactMatches) {
    warnings.push(`Verifier tested ${parsedFingerprint.fingerprint.digest}, but the current artifact is ${current.digest}.`);
  }
  if (reportedVerdict === "PASS") {
    for (const criterion of required) {
      const result = reportedById.get(criterion.id);
      if (!result) warnings.push(`Verifier PASS omitted required acceptance criterion ${criterion.id}.`);
      else if (result.outcome !== "passed") warnings.push(`Verifier PASS did not pass required acceptance criterion ${criterion.id}.`);
      else {
        const criterionRefs = normalizeEvidenceRefs(result.evidenceRefs, evidence.byReportedRef);
        if (criterionRefs.length === 0 && evidenceRefs.length === 0) {
          warnings.push(`Verifier PASS gave no evidence for required acceptance criterion ${criterion.id}.`);
        }
      }
    }
  }
  warnings.push(...await applyAcceptanceResults(
    store,
    ctx,
    run,
    acceptanceResults,
    evidenceRefs,
    evidence.byReportedRef,
    artifactMatches,
  ));

  const writerActorIds = run.agents
    .filter(candidate => candidate.role === "builder" || candidate.role === "synthesizer")
    .map(candidate => candidate.actorId);
  const observations = parseStringArray(data.observations);
  let limitations = parseStringArray(data.limitations);
  let verdictValue: VerdictValue = reportedVerdict;
  if (reportedVerdict === "INCONCLUSIVE" && limitations.length === 0) {
    limitations = ["Verifier returned INCONCLUSIVE without a more specific limitation."];
  }
  if (warnings.length > 0 && reportedVerdict === "PASS") {
    verdictValue = "INCONCLUSIVE";
    limitations = uniqueStrings([...limitations, ...warnings.map(item => `Rejected PASS: ${item}`)]);
  }

  const at = nowIso();
  const verdict: VerdictRecord = {
    id: stableId("verdict", [run.id, actor.actorId, row.id ?? "no-runtime-id", String(data.scope ?? "final"), parsedFingerprint.fingerprint.digest]),
    scope: typeof data.scope === "string" && data.scope.trim() ? data.scope.trim() : "final",
    verdict: verdictValue,
    verifierActorId: actor.actorId,
    writerActorIds: uniqueStrings(writerActorIds),
    evidenceRefs,
    testedFingerprint: parsedFingerprint.fingerprint,
    observations,
    limitations,
    createdAt: at,
  };

  const latest = (await store.get(ctx)).state.activeRun;
  if (!latest) return { evidenceIds: evidence.ids, warnings: [...warnings, "Run ended before verifier ingestion completed."] };
  const validationProblems = validateVerdict(latest, verdict, (await store.get(ctx)).config);
  if (validationProblems.length > 0) {
    if (verdict.verdict === "PASS") {
      verdict.verdict = "INCONCLUSIVE";
      verdict.limitations = uniqueStrings([...verdict.limitations, ...validationProblems.map(item => `Rejected PASS: ${item}`)]);
    } else {
      return { evidenceIds: evidence.ids, warnings: [...warnings, ...validationProblems] };
    }
  }
  const finalProblems = validateVerdict(latest, verdict, (await store.get(ctx)).config);
  if (finalProblems.length > 0) {
    return { evidenceIds: evidence.ids, warnings: [...warnings, ...finalProblems] };
  }

  await store.mutate(ctx, { type: "record_verdict", verdict, at }, "subagent_verdict_ingested");
  return { evidenceIds: evidence.ids, verdictId: verdict.id, warnings };
}

export async function ingestStructuredTaskResults(
  event: { toolCallId?: string; details?: unknown },
  ctx: ExtensionContext,
  store: PstackStore,
  exec: ExecRunner,
): Promise<StructuredIngestionReport> {
  const report: StructuredIngestionReport = { actors: [], evidenceIds: [], verdictIds: [], warnings: [] };
  for (const row of resultRows(event.details)) {
    const bucket = await store.get(ctx);
    const run = bucket.state.activeRun;
    if (!run) break;
    const actor = actorForResult(run, row, event.toolCallId);
    if (!actor) {
      report.warnings.push(`Could not correlate structured result ${row.id ?? "<unknown>"}/${row.agent ?? "<unknown>"} to a recorded pstack actor.`);
      continue;
    }
    report.actors.push(actor.actorId);
    const structured = row.structuredOutput;
    // Proof state is ingested only from output OMP validated against the pstack
    // agent's own frontmatter schema; a per-call `outputSchema` override
    // (source !== "agent") or invalid/missing output yields no evidence.
    if (!structured || structured.status !== "valid" || structured.source !== "agent" || !isRecord(structured.data)) {
      if (actor.role === "verifier") {
        const why = structured?.error ?? (structured && structured.source !== "agent" ? `schema source ${structured.source ?? "unknown"} is not the pstack agent schema` : "missing structured output");
        report.warnings.push(`Verifier ${actor.actorId} did not return schema-valid structured output: ${why}.`);
      }
      continue;
    }

    if (actor.role === "verifier") {
      const ingested = await ingestVerifier(exec, store, ctx, run, actor, row, structured.data);
      report.evidenceIds.push(...ingested.evidenceIds);
      if (ingested.verdictId) report.verdictIds.push(ingested.verdictId);
      report.warnings.push(...ingested.warnings);
      continue;
    }

    if (actor.role === "builder" || actor.role === "synthesizer") {
      const ingested = await recordStructuredEvidence(store, ctx, run, actor, row, structured.data, undefined);
      report.evidenceIds.push(...ingested.ids);
    }
  }
  report.actors = uniqueStrings(report.actors);
  report.evidenceIds = uniqueStrings(report.evidenceIds);
  report.verdictIds = uniqueStrings(report.verdictIds);
  report.warnings = uniqueStrings(report.warnings);
  return report;
}
