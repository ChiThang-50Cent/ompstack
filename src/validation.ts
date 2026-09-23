import type { AgentRole, PstackConfig, PstackRun, VerdictRecord } from "./domain.js";
import { normalizeActorId, uniqueStrings } from "./utils.js";

const WRITER_ROLES = new Set<AgentRole>(["builder", "synthesizer"]);

export function validateVerdict(run: PstackRun, verdict: VerdictRecord, config: PstackConfig): string[] {
  const problems: string[] = [];
  const verifier = normalizeActorId(verdict.verifierActorId);
  const writers = uniqueStrings(verdict.writerActorIds.map(normalizeActorId));
  if (!verifier) problems.push("verifierActorId is required");

  const verifierRecord = run.agents.find(agent => normalizeActorId(agent.actorId) === verifier);
  if (config.enforceIndependentVerifier) {
    if (!verifierRecord) problems.push(`verifierActorId '${verdict.verifierActorId}' does not reference a recorded pstack actor`);
    else if (verifierRecord.role !== "verifier") {
      problems.push(`verifierActorId '${verdict.verifierActorId}' has role '${verifierRecord.role}', not 'verifier'`);
    } else if (verifierRecord.status !== "completed") {
      problems.push(`verifierActorId '${verdict.verifierActorId}' is '${verifierRecord.status}', not completed`);
    }
  }

  if (config.enforceIndependentVerifier && writers.includes(verifier)) {
    problems.push("verifierActorId must not also appear in writerActorIds");
  }
  for (const writer of writers) {
    const record = run.agents.find(agent => normalizeActorId(agent.actorId) === writer);
    if (!record) {
      problems.push(`writerActorId '${writer}' does not reference a recorded pstack actor`);
    } else if (!WRITER_ROLES.has(record.role)) {
      problems.push(`writerActorId '${writer}' has role '${record.role}', not a writer role`);
    }
  }

  if (verdict.verdict === "PASS" && config.requireEvidenceForPass && verdict.evidenceRefs.length === 0) {
    problems.push("PASS requires at least one evidence reference");
  }
  if (config.requireArtifactFingerprint && !verdict.testedFingerprint.digest) {
    problems.push("testedFingerprint.digest is required");
  }
  if (verdict.verdict === "INCONCLUSIVE" && verdict.limitations.length === 0) {
    problems.push("INCONCLUSIVE requires at least one limitation");
  }
  const knownEvidence = new Set(run.evidence.map(item => item.id));
  for (const reference of verdict.evidenceRefs) {
    if (!knownEvidence.has(reference) && !reference.includes("/") && !reference.includes(".") && !reference.includes(":")) {
      problems.push(`evidence reference '${reference}' is neither a known evidence id nor a path-like reference`);
    }
  }
  return problems;
}
