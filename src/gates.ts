import type {
  ArtifactFingerprint,
  GateIssue,
  GateReport,
  PstackConfig,
  PstackSessionState,
  VerdictRecord,
} from "./domain.js";
import { normalizeActorId, nowIso } from "./utils.js";

export function fingerprintsEqual(left: ArtifactFingerprint | undefined, right: ArtifactFingerprint | undefined): boolean {
  return Boolean(left && right && left.digest === right.digest && left.kind === right.kind);
}

export function latestFinalVerdict(verdicts: readonly VerdictRecord[]): VerdictRecord | undefined {
  for (let index = verdicts.length - 1; index >= 0; index -= 1) {
    const verdict = verdicts[index];
    if (verdict?.scope === "final") return verdict;
  }
  return verdicts.at(-1);
}

function issue(code: GateIssue["code"], message: string, refs: string[] = []): GateIssue {
  return { code, message, blocking: true, refs };
}

export function evaluateCompletionGates(
  state: PstackSessionState,
  currentFingerprint: ArtifactFingerprint | undefined,
  config: PstackConfig,
  options: { ignoreRunStatus?: boolean } = {},
): GateReport {
  const issues: GateIssue[] = [];
  const run = state.activeRun;
  if (!run) {
    return { allowed: true, issues, checkedAt: nowIso() };
  }

  if (!options.ignoreRunStatus && run.status !== "done" && run.status !== "failed") {
    issues.push(issue("RUN_ACTIVE", `Run ${run.id} is still open; close it with pstack_gate action=check.`, [run.id]));
  }

  for (const criterion of run.acceptance) {
    if (!criterion.required) continue;
    if (criterion.state === "open") {
      issues.push(issue("ACCEPTANCE_OPEN", `${criterion.id} is still open: ${criterion.text}`, [criterion.id]));
    } else if (criterion.state === "failed") {
      issues.push(issue("ACCEPTANCE_FAILED", `${criterion.id} failed: ${criterion.text}`, [criterion.id]));
    } else if (criterion.state === "waived" && !criterion.reason?.trim()) {
      issues.push(issue("SKIP_REASON_MISSING", `${criterion.id} was waived without a reason.`, [criterion.id]));
    } else if (criterion.state === "passed" && config.requireEvidenceForPass && criterion.evidenceRefs.length === 0) {
      issues.push(issue("PASS_WITHOUT_EVIDENCE", `${criterion.id} is marked passed without evidence references.`, [criterion.id]));
    }
  }

  const pendingAgents = run.agents.filter(agent => agent.invocationKind === "task" && agent.role !== "coordinator" && ["spawned", "running", "unknown"].includes(agent.status));
  if (pendingAgents.length > 0) {
    issues.push(
      issue(
        "AGENT_PENDING",
        `Subagents are still pending: ${pendingAgents.map(agent => `${agent.agentName}/${agent.actorId}`).join(", ")}.`,
        pendingAgents.map(agent => agent.actorId),
      ),
    );
  }

  if (run.verificationRequired) {
    const verdict = latestFinalVerdict(run.verdicts);
    if (!verdict) {
      issues.push(issue("VERDICT_MISSING", "Independent final verification has not produced a verdict."));
    } else {
      if (verdict.verdict === "FAIL") {
        issues.push(issue("VERDICT_FAIL", "Final verifier returned FAIL.", [verdict.id]));
      } else if (verdict.verdict === "INCONCLUSIVE") {
        issues.push(issue("VERDICT_INCONCLUSIVE", "Final verifier returned INCONCLUSIVE.", [verdict.id]));
      }

      if (config.enforceIndependentVerifier) {
        const verifier = normalizeActorId(verdict.verifierActorId);
        const verifierRecord = run.agents.find(agent => normalizeActorId(agent.actorId) === verifier);
        if (!verifierRecord) {
          issues.push(issue("ACTOR_UNKNOWN", `Final verifier '${verdict.verifierActorId}' is not a recorded pstack actor.`, [verdict.id]));
        } else if (verifierRecord.role !== "verifier") {
          issues.push(issue("ROLE_MISMATCH", `Final verifier '${verdict.verifierActorId}' has role '${verifierRecord.role}'.`, [verdict.id]));
        } else if (verifierRecord.status !== "completed") {
          issues.push(issue("VERIFIER_NOT_COMPLETED", `Final verifier '${verdict.verifierActorId}' is '${verifierRecord.status}', not completed.`, [verdict.id]));
        }
        const collision = verdict.writerActorIds.some(writer => normalizeActorId(writer) === verifier);
        if (collision) {
          issues.push(issue("ACTOR_COLLISION", "The final verifier is also listed as a writer.", [verdict.id]));
        }
        for (const writer of verdict.writerActorIds) {
          const writerRecord = run.agents.find(agent => normalizeActorId(agent.actorId) === normalizeActorId(writer));
          if (!writerRecord) {
            issues.push(issue("ACTOR_UNKNOWN", `Final verdict writer '${writer}' is not a recorded pstack actor.`, [verdict.id]));
          } else if (writerRecord.role !== "builder" && writerRecord.role !== "synthesizer") {
            issues.push(issue("ROLE_MISMATCH", `Final verdict writer '${writer}' has role '${writerRecord.role}'.`, [verdict.id]));
          }
        }
      }

      if (config.requireEvidenceForPass && verdict.verdict === "PASS" && verdict.evidenceRefs.length === 0) {
        issues.push(issue("PASS_WITHOUT_EVIDENCE", "PASS has no evidence references.", [verdict.id]));
      }

      if (config.requireArtifactFingerprint) {
        if (!currentFingerprint) {
          issues.push(issue("FINGERPRINT_MISSING", "Current artifact fingerprint is unavailable."));
        } else if (!fingerprintsEqual(verdict.testedFingerprint, currentFingerprint)) {
          issues.push(
            issue(
              "VERDICT_STALE",
              `Final verdict tested ${verdict.testedFingerprint.digest}, but current artifact is ${currentFingerprint.digest}.`,
              [verdict.id],
            ),
          );
        }
      }
    }
  }

  return { allowed: issues.every(candidate => !candidate.blocking), issues, checkedAt: nowIso() };
}

export function renderGateReport(report: GateReport): string {
  if (report.allowed) return "All pstack completion gates passed.";
  const lines = ["Pstack completion is blocked by the following gates:"];
  for (const candidate of report.issues) {
    lines.push(`- [${candidate.code}] ${candidate.message}`);
  }
  lines.push("Resolve the gates or waive non-required criteria with reasons. Abandon with pstack_gate action=abandon only when the objective cannot be met.");
  return lines.join("\n");
}
