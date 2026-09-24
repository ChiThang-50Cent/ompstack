import type { AgentToolResult, ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import {
  ACCEPTANCE_STATES,
  AGENT_ROLES,
  CEREMONY_LEVELS,
  EVIDENCE_KINDS,
  PLAYBOOKS,
  RUN_STATUSES,
  VERDICTS,
  type AcceptanceState,
  type AgentRole,
  type CeremonyLevel,
  type EvidenceKind,
  type Playbook,
  type RunStatus,
  type VerdictValue,
} from "./domain.js";
import { computeArtifactFingerprint } from "./fingerprint.js";
import { abandonGate, checkGate, initGate, type GateInitInput } from "./gate-control.js";
import { evaluateCompletionGates, renderGateReport } from "./gates.js";
import { renderState } from "./status.js";
import type { PstackStore } from "./store.js";
import { validateVerdict } from "./validation.js";
import { asStringArray, createId, nowIso, normalizeActorId, uniqueStrings } from "./utils.js";

function textResult(text: string, details?: unknown, isError = false): AgentToolResult<unknown> {
  return {
    content: [{ type: "text", text }],
    ...(details !== undefined ? { details } : {}),
    ...(isError ? { isError: true } : {}),
  };
}

type TypeBuilder = ExtensionAPI["typebox"]["Type"];

function enumSchema(Type: TypeBuilder, values: readonly string[]) {
  return Type.Union(values.map(value => Type.Literal(value)));
}

interface GateParams extends GateInitInput {
  action: "init" | "check" | "abandon";
  reason?: string;
}

interface AcceptanceParams {
  action: "add" | "update" | "remove" | "list";
  id?: string;
  text?: string;
  required?: boolean;
  state?: AcceptanceState;
  reason?: string;
  evidenceRefs?: string[];
}

interface EvidenceParams {
  action: "record" | "list";
  id?: string;
  kind?: EvidenceKind;
  claim?: string;
  ref?: string;
  producedBy?: string;
  attachFingerprint?: boolean;
  metadataJson?: string;
}

interface DecisionParams {
  phase?: string;
  decision: string;
  why: string;
  evidenceRefs?: string[];
  result?: string;
}

interface VerdictParams {
  scope?: string;
  verdict: VerdictValue;
  verifierActorId: string;
  writerActorIds?: string[];
  evidenceRefs?: string[];
  observations?: string[];
  limitations?: string[];
  testedFingerprintDigest?: string;
  testedFingerprintKind?: "git" | "workspace";
  testedHeadSha?: string;
  testedDirtyHash?: string;
  testedFingerprintPartial?: boolean;
}

function activeRunOrError(bucket: Awaited<ReturnType<PstackStore["get"]>>): NonNullable<typeof bucket.state.activeRun> {
  if (!bucket.state.activeRun) throw new Error("No active pstack run. Open one with pstack_gate action=init.");
  return bucket.state.activeRun;
}

export function registerPstackTools(
  api: ExtensionAPI,
  store: PstackStore,
  reconcile?: (ctx: ExtensionContext) => Promise<void>,
): void {
  const { Type } = api.typebox;

  api.registerTool({
    name: "pstack_status",
    label: "Pstack status",
    description: "Read the current pstack mode, run state, acceptance criteria, evidence, and completion gates.",
    parameters: Type.Object({}, { additionalProperties: false }),
    approval: "read",
    loadMode: "essential",
    strict: true,
    execute: async (_id: string, _params: unknown, _signal: AbortSignal | undefined, _update: unknown, ctx: ExtensionContext) => {
      await reconcile?.(ctx);
      const bucket = await store.get(ctx);
      const fingerprint = bucket.state.activeRun ? await computeArtifactFingerprint(api, ctx.cwd, bucket.config) : undefined;
      const gate = evaluateCompletionGates(bucket.state, fingerprint, bucket.config);
      return textResult(renderState(bucket.state, bucket.config, gate), { state: bucket.state, gate, fingerprint });
    },
  });

  api.registerTool({
    name: "pstack_fingerprint",
    label: "Pstack artifact fingerprint",
    description: "Compute the current git/workspace fingerprint used to bind verification verdicts to an exact artifact.",
    parameters: Type.Object({}, { additionalProperties: false }),
    approval: "read",
    loadMode: "essential",
    strict: true,
    execute: async (_id: string, _params: unknown, _signal: AbortSignal | undefined, _update: unknown, ctx: ExtensionContext) => {
      const bucket = await store.get(ctx);
      const fingerprint = await computeArtifactFingerprint(api, ctx.cwd, bucket.config);
      if (bucket.state.activeRun) {
        await store.mutate(ctx, { type: "set_fingerprint", target: "lastKnown", fingerprint, at: nowIso() });
      }
      return textResult(`Artifact fingerprint: ${fingerprint.digest}\nKind: ${fingerprint.kind}\nPartial: ${fingerprint.partial}`, fingerprint);
    },
  });

  api.registerTool({
    name: "pstack_gate",
    label: "Pstack completion gate",
    description: "Open (init), evaluate and close (check), or abandon pstack proof state. OMP owns planning and lifecycle; with an active OMP goal, goal op=complete is refused until gates pass.",
    parameters: Type.Object(
      {
        action: enumSchema(Type, ["init", "check", "abandon"]),
        objective: Type.Optional(Type.String()),
        playbook: Type.Optional(enumSchema(Type, PLAYBOOKS)),
        ceremony: Type.Optional(enumSchema(Type, CEREMONY_LEVELS)),
        verificationRequired: Type.Optional(Type.Boolean()),
        acceptance: Type.Optional(Type.Array(Type.Object({
          id: Type.Optional(Type.String()),
          text: Type.String(),
          required: Type.Optional(Type.Boolean()),
        }, { additionalProperties: false }))),
        reason: Type.Optional(Type.String()),
      },
      { additionalProperties: false },
    ),
    approval: "write",
    loadMode: "essential",
    strict: true,
    execute: async (_id: string, raw: GateParams, _signal: AbortSignal | undefined, _update: unknown, ctx: ExtensionContext) => {
      try {
        if (raw.action === "check") await reconcile?.(ctx);
        const outcome = raw.action === "init"
          ? await initGate(api, store, ctx, raw)
          : raw.action === "check"
            ? await checkGate(api, store, ctx)
            : await abandonGate(store, ctx, raw.reason);
        return textResult(outcome.text, outcome.details, !outcome.ok);
      } catch (error) {
        return textResult(`pstack_gate failed: ${String(error)}`, undefined, true);
      }
    },
  });

  api.registerTool({
    name: "pstack_acceptance",
    label: "Pstack acceptance criteria",
    description: "Add, update, waive, remove, or list explicit acceptance criteria for the active run.",
    parameters: Type.Object({
      action: enumSchema(Type, ["add", "update", "remove", "list"]),
      id: Type.Optional(Type.String()),
      text: Type.Optional(Type.String()),
      required: Type.Optional(Type.Boolean()),
      state: Type.Optional(enumSchema(Type, ACCEPTANCE_STATES)),
      reason: Type.Optional(Type.String()),
      evidenceRefs: Type.Optional(Type.Array(Type.String())),
    }, { additionalProperties: false }),
    approval: "write",
    strict: true,
    execute: async (_id: string, raw: AcceptanceParams, _signal: AbortSignal | undefined, _update: unknown, ctx: ExtensionContext) => {
      try {
        const bucket = await store.get(ctx);
        const run = activeRunOrError(bucket);
        if (raw.action === "list") return textResult(JSON.stringify(run.acceptance, null, 2), run.acceptance);
        const at = nowIso();
        if (raw.action === "add") {
          if (!raw.text?.trim()) return textResult("text is required for action=add", undefined, true);
          const id = raw.id?.trim() || `AC-${run.acceptance.length + 1}`;
          const updated = await store.mutate(ctx, {
            type: "add_acceptance",
            criterion: {
              id,
              text: raw.text,
              required: raw.required ?? true,
              state: raw.state ?? "open",
              ...(raw.reason?.trim() ? { reason: raw.reason.trim() } : {}),
              evidenceRefs: uniqueStrings(raw.evidenceRefs ?? []),
              updatedAt: at,
            },
            at,
          });
          return textResult(`Added ${id}.`, updated.state.activeRun?.acceptance);
        }
        if (!raw.id?.trim()) return textResult("id is required for update/remove", undefined, true);
        if (raw.action === "remove") {
          const updated = await store.mutate(ctx, { type: "remove_acceptance", id: raw.id, at });
          return textResult(`Removed ${raw.id}.`, updated.state.activeRun?.acceptance);
        }
        if (raw.state === "waived" && !raw.reason?.trim()) {
          return textResult("Waiving an acceptance criterion requires a non-empty reason.", undefined, true);
        }
        const updated = await store.mutate(ctx, {
          type: "update_acceptance",
          id: raw.id,
          ...(raw.state !== undefined ? { state: raw.state } : {}),
          ...(raw.text !== undefined ? { text: raw.text } : {}),
          ...(raw.required !== undefined ? { required: raw.required } : {}),
          ...(raw.reason !== undefined ? { reason: raw.reason } : {}),
          ...(raw.evidenceRefs !== undefined ? { evidenceRefs: raw.evidenceRefs } : {}),
          at,
        });
        return textResult(`Updated ${raw.id}.`, updated.state.activeRun?.acceptance);
      } catch (error) {
        return textResult(`pstack_acceptance failed: ${String(error)}`, undefined, true);
      }
    },
  });

  api.registerTool({
    name: "pstack_evidence",
    label: "Pstack evidence",
    description: "Record or list evidence. Evidence is a claim plus a reproducible reference, optionally bound to the current artifact fingerprint.",
    parameters: Type.Object({
      action: enumSchema(Type, ["record", "list"]),
      id: Type.Optional(Type.String()),
      kind: Type.Optional(enumSchema(Type, EVIDENCE_KINDS)),
      claim: Type.Optional(Type.String()),
      ref: Type.Optional(Type.String()),
      producedBy: Type.Optional(Type.String()),
      attachFingerprint: Type.Optional(Type.Boolean()),
      metadataJson: Type.Optional(Type.String()),
    }, { additionalProperties: false }),
    approval: "write",
    strict: true,
    execute: async (_id: string, raw: EvidenceParams, _signal: AbortSignal | undefined, _update: unknown, ctx: ExtensionContext) => {
      try {
        const bucket = await store.get(ctx);
        const run = activeRunOrError(bucket);
        if (raw.action === "list") return textResult(JSON.stringify(run.evidence, null, 2), run.evidence);
        if (!raw.kind || !raw.claim?.trim() || !raw.ref?.trim() || !raw.producedBy?.trim()) {
          return textResult("kind, claim, ref, and producedBy are required for action=record", undefined, true);
        }
        let metadata: Record<string, unknown> | undefined;
        if (raw.metadataJson?.trim()) {
          const parsed = JSON.parse(raw.metadataJson) as unknown;
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return textResult("metadataJson must decode to an object", undefined, true);
          }
          metadata = parsed as Record<string, unknown>;
        }
        const fingerprint = raw.attachFingerprint === false ? undefined : await computeArtifactFingerprint(api, ctx.cwd, bucket.config);
        const at = nowIso();
        const evidence = {
          id: raw.id?.trim() || createId("evidence"),
          kind: raw.kind,
          claim: raw.claim.trim(),
          ref: raw.ref.trim(),
          producedBy: raw.producedBy.trim(),
          createdAt: at,
          ...(fingerprint ? { fingerprintDigest: fingerprint.digest } : {}),
          ...(metadata ? { metadata } : {}),
        };
        const updated = await store.mutate(ctx, { type: "record_evidence", evidence, at });
        return textResult(`Recorded evidence ${evidence.id}.`, updated.state.activeRun?.evidence.at(-1));
      } catch (error) {
        return textResult(`pstack_evidence failed: ${String(error)}`, undefined, true);
      }
    },
  });

  api.registerTool({
    name: "pstack_decision",
    label: "Pstack decision log",
    description: "Record a durable decision, its rationale, evidence references, and observed result.",
    parameters: Type.Object({
      phase: Type.Optional(Type.String()),
      decision: Type.String(),
      why: Type.String(),
      evidenceRefs: Type.Optional(Type.Array(Type.String())),
      result: Type.Optional(Type.String()),
    }, { additionalProperties: false }),
    approval: "write",
    strict: true,
    execute: async (_id: string, raw: DecisionParams, _signal: AbortSignal | undefined, _update: unknown, ctx: ExtensionContext) => {
      try {
        const bucket = await store.get(ctx);
        const run = activeRunOrError(bucket);
        const at = nowIso();
        const decision = {
          id: createId("decision"),
          ...(raw.phase?.trim() ? { phase: raw.phase.trim() } : {}),
          decision: raw.decision.trim(),
          why: raw.why.trim(),
          evidenceRefs: uniqueStrings(raw.evidenceRefs ?? []),
          ...(raw.result?.trim() ? { result: raw.result.trim() } : {}),
          createdAt: at,
        };
        const updated = await store.mutate(ctx, { type: "record_decision", decision, at });
        return textResult(`Recorded decision ${decision.id}.`, updated.state.activeRun?.decisions.at(-1));
      } catch (error) {
        return textResult(`pstack_decision failed: ${String(error)}`, undefined, true);
      }
    },
  });

  api.registerTool({
    name: "pstack_verdict",
    label: "Pstack verifier verdict",
    description: "Record an artifact-bound independent verification verdict. PASS requires evidence and writer/verifier separation.",
    parameters: Type.Object({
      scope: Type.Optional(Type.String()),
      verdict: enumSchema(Type, VERDICTS),
      verifierActorId: Type.String(),
      writerActorIds: Type.Optional(Type.Array(Type.String())),
      evidenceRefs: Type.Optional(Type.Array(Type.String())),
      observations: Type.Optional(Type.Array(Type.String())),
      limitations: Type.Optional(Type.Array(Type.String())),
      testedFingerprintDigest: Type.Optional(Type.String()),
      testedFingerprintKind: Type.Optional(enumSchema(Type, ["git", "workspace"])),
      testedHeadSha: Type.Optional(Type.String()),
      testedDirtyHash: Type.Optional(Type.String()),
      testedFingerprintPartial: Type.Optional(Type.Boolean()),
    }, { additionalProperties: false }),
    approval: "write",
    loadMode: "essential",
    strict: true,
    execute: async (_id: string, raw: VerdictParams, _signal: AbortSignal | undefined, _update: unknown, ctx: ExtensionContext) => {
      try {
        const bucket = await store.get(ctx);
        const run = activeRunOrError(bucket);
        const current = await computeArtifactFingerprint(api, ctx.cwd, bucket.config);
        const digest = raw.testedFingerprintDigest?.trim() || current.digest;
        const testedFingerprint = {
          kind: raw.testedFingerprintKind ?? current.kind,
          digest,
          generatedAt: nowIso(),
          ...(raw.testedHeadSha?.trim() ? { headSha: raw.testedHeadSha.trim() } : current.headSha ? { headSha: current.headSha } : {}),
          ...(raw.testedDirtyHash?.trim() ? { dirtyHash: raw.testedDirtyHash.trim() } : current.dirtyHash ? { dirtyHash: current.dirtyHash } : {}),
          ...(current.clean !== undefined ? { clean: current.clean } : {}),
          partial: raw.testedFingerprintPartial ?? current.partial,
          notes: digest === current.digest ? [...current.notes] : ["Fingerprint supplied by verifier; current artifact differs."],
        };
        const inferredWriters = run.agents
          .filter(agent => agent.role === "builder" || agent.role === "synthesizer")
          .map(agent => agent.actorId);
        const at = nowIso();
        const verdict = {
          id: createId("verdict"),
          scope: raw.scope?.trim() || "final",
          verdict: raw.verdict,
          verifierActorId: raw.verifierActorId.trim(),
          writerActorIds: uniqueStrings(raw.writerActorIds ?? inferredWriters),
          evidenceRefs: uniqueStrings(raw.evidenceRefs ?? []),
          testedFingerprint,
          observations: uniqueStrings(raw.observations ?? []),
          limitations: uniqueStrings(raw.limitations ?? []),
          createdAt: at,
        };
        const problems = validateVerdict(run, verdict, bucket.config);
        if (verdict.verdict === "PASS" && digest !== current.digest) {
          problems.push(`PASS is stale at record time: tested ${digest}, current ${current.digest}`);
        }
        if (problems.length > 0) return textResult(`Verdict rejected:\n- ${problems.join("\n- ")}`, { problems, verdict }, true);
        const updated = await store.mutate(ctx, { type: "record_verdict", verdict, at });
        return textResult(`Recorded ${verdict.verdict} verdict ${verdict.id} for ${verdict.scope}.`, updated.state.activeRun?.verdicts.at(-1));
      } catch (error) {
        return textResult(`pstack_verdict failed: ${String(error)}`, undefined, true);
      }
    },
  });
}

export const TOOL_AGENT_ROLES: readonly AgentRole[] = AGENT_ROLES;
