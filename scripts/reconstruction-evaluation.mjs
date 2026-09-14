import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { sha256, stableJson, writeJsonAtomically } from "./run-verification-contract.mjs";

export const RECONSTRUCTION_SCHEMA_VERSION = 1;
export const CORPUS_SCHEMA_VERSION = 1;
export const PINNED_BASE_REPOSITORY_COMMIT = "ae2393137a26ee473677f453680813a18055c4cd";
export const ARMS = ["A", "B", "B-prime"];
export const TERMINAL_STATUSES = new Set([
  "OMISSION_MATERIALITY_NOT_ESTABLISHED",
  "FRAMING_HYPOTHESIS_NOT_TESTED_CHEAP_CONTROL_SUFFICIENT",
  "FRAMING_HYPOTHESIS_NOT_TESTED_EXTRA_REVIEW_SUFFICIENT",
  "STAGE_2_REQUIRED",
  "BORDERLINE",
]);

const reconstructionKeys = [
  "schema_version", "status", "requirements", "derived_requirements", "repo_invariants",
  "affected_surfaces", "unknowns", "evidence",
];
const evidenceKinds = new Set(["user_turn", "issue", "spec", "artifact", "repository_contract"]);
const anchorLabels = new Set(["VALID_EXPLICIT", "VALID_DERIVED", "REPO_INVARIANT", "UNSUPPORTED"]);
const forbiddenSlotPart = /(^|\.)(raw_evidence|evidence|tool_output|transcript|source|provenance)(\.|$)/i;
const canonicalSlots = {
  A: new Set(["findings", "closeout"]),
  B: new Set(["reconstruction.requirements", "reconstruction.derived_requirements", "reconstruction.affected_surfaces", "findings", "closeout"]),
  "B-prime": new Set(["requirements", "derived_requirements", "affected_surfaces", "findings", "closeout"]),
};
const sharedSlots = ["findings", "closeout"];
const commitHash = /^[0-9a-f]{40}$/;

function fail(message) {
  throw new Error(`reconstruction evaluation: ${message}`);
}

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`);
  return value;
}

function exactKeys(value, keys, label) {
  object(value, label);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(`${label} has unexpected or missing properties`);
  }
}

function string(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) fail(`${label} must be a non-empty string`);
  return value;
}

function array(value, label, { min = 0 } = {}) {
  if (!Array.isArray(value) || value.length < min) fail(`${label} must be an array${min ? ` with at least ${min} entries` : ""}`);
  return value;
}

function unique(values, label) {
  if (new Set(values).size !== values.length) fail(`${label} must not contain duplicates`);
}

function evidenceReferences(value, label, knownEvidence) {
  const references = array(value, label, { min: 1 });
  for (const reference of references) {
    string(reference, `${label} entry`);
    if (!knownEvidence.has(reference)) fail(`${label} references unknown evidence ${reference}`);
  }
  unique(references, label);
}

function evidenceBoundStatements(value, label, knownEvidence) {
  for (const [index, entry] of array(value, label).entries()) {
    exactKeys(entry, ["statement", "source_evidence"], `${label}[${index}]`);
    string(entry.statement, `${label}[${index}].statement`);
    evidenceReferences(entry.source_evidence, `${label}[${index}].source_evidence`, knownEvidence);
  }
}

/** Rejects maps that cannot be used as a strict reconstruction-v1 artifact. */
export function validateReconstruction(map) {
  exactKeys(map, reconstructionKeys, "reconstruction map");
  if (map.schema_version !== RECONSTRUCTION_SCHEMA_VERSION) fail("reconstruction map schema_version must be 1");
  if (map.status !== "COMPLETE" && map.status !== "INSUFFICIENT_EVIDENCE") fail("reconstruction map status is invalid");

  const evidence = array(map.evidence, "reconstruction map.evidence");
  const evidenceIds = new Set();
  for (const [index, entry] of evidence.entries()) {
    exactKeys(entry, ["id", "kind", "locator", "excerpt"], `evidence[${index}]`);
    string(entry.id, `evidence[${index}].id`);
    if (evidenceIds.has(entry.id)) fail(`duplicate evidence id ${entry.id}`);
    evidenceIds.add(entry.id);
    if (!evidenceKinds.has(entry.kind)) fail(`evidence[${index}].kind is invalid`);
    string(entry.locator, `evidence[${index}].locator`);
    string(entry.excerpt, `evidence[${index}].excerpt`);
  }

  const requirements = array(map.requirements, "reconstruction map.requirements");
  for (const [index, entry] of requirements.entries()) {
    exactKeys(entry, ["requirement", "source_evidence"], `requirements[${index}]`);
    string(entry.requirement, `requirements[${index}].requirement`);
    evidenceReferences(entry.source_evidence, `requirements[${index}].source_evidence`, evidenceIds);
  }
  const derived = array(map.derived_requirements, "reconstruction map.derived_requirements");
  for (const [index, entry] of derived.entries()) {
    exactKeys(entry, ["requirement", "source_evidence", "derivation"], `derived_requirements[${index}]`);
    string(entry.requirement, `derived_requirements[${index}].requirement`);
    evidenceReferences(entry.source_evidence, `derived_requirements[${index}].source_evidence`, evidenceIds);
    string(entry.derivation, `derived_requirements[${index}].derivation`);
  }
  evidenceBoundStatements(map.repo_invariants, "repo_invariants", evidenceIds);
  evidenceBoundStatements(map.affected_surfaces, "affected_surfaces", evidenceIds);
  evidenceBoundStatements(map.unknowns, "unknowns", evidenceIds);

  if (map.status === "COMPLETE" && requirements.length === 0) fail("COMPLETE maps require at least one explicit requirement");
  if (map.status === "INSUFFICIENT_EVIDENCE") {
    if (requirements.length || derived.length) fail("INSUFFICIENT_EVIDENCE maps must not invent requirements");
    if (map.unknowns.length === 0) fail("INSUFFICIENT_EVIDENCE maps must identify an unknown");
  }
  return map;
}

function exactOptionalKeys(value, required, optional, label) {
  exactKeys(value, [...required, ...optional.filter((key) => Object.hasOwn(value, key))], label);
}

function validateReviewerFindings(findings, evidenceIds, label) {
  for (const [index, finding] of array(findings, label).entries()) {
    exactOptionalKeys(finding, ["finding_id", "finding", "blocking", "source_evidence"], ["derivation"], `${label}[${index}]`);
    string(finding.finding_id, `${label}[${index}].finding_id`);
    string(finding.finding, `${label}[${index}].finding`);
    if (typeof finding.blocking !== "boolean") fail(`${label}[${index}].blocking must be boolean`);
    evidenceReferences(finding.source_evidence, `${label}[${index}].source_evidence`, evidenceIds);
    if (Object.hasOwn(finding, "derivation")) string(finding.derivation, `${label}[${index}].derivation`);
  }
}

/** Validates B's strict reconstruction-plus-ordinary-review envelope. */
export function validateBundledReviewerOutput(envelope) {
  exactOptionalKeys(envelope, ["reconstruction", "findings"], ["closeout"], "B reviewer output");
  validateReconstruction(envelope.reconstruction);
  const evidenceIds = new Set(envelope.reconstruction.evidence.map((entry) => entry.id));
  validateReviewerFindings(envelope.findings, evidenceIds, "B reviewer output.findings");
  if (Object.hasOwn(envelope, "closeout")) {
    evidenceBoundStatements([envelope.closeout], "B reviewer output.closeout", evidenceIds);
  }
  return envelope;
}

/** Validates B-prime R2 findings against the frozen R1 evidence map. */
export function validateBPrimeOutput(output, frozenMap) {
  exactOptionalKeys(output, ["findings"], ["closeout"], "B-prime output");
  validateReconstruction(frozenMap);
  const evidenceIds = new Set(frozenMap.evidence.map((entry) => entry.id));
  validateReviewerFindings(output.findings, evidenceIds, "B-prime output.findings");
  if (Object.hasOwn(output, "closeout")) {
    evidenceBoundStatements([output.closeout], "B-prime output.closeout", evidenceIds);
  }
  return output;
}

function validateFreezeRecord(record) {
  exactKeys(record, ["artifact_path", "artifact_digest", "state_identity"], "freeze record");
  string(record.artifact_path, "freeze record.artifact_path");
  if (record.artifact_path.startsWith("/") || record.artifact_path.split("/").includes("..")) fail("freeze record.artifact_path must be relative");
  if (!/^[a-f0-9]{64}$/.test(record.artifact_digest)) fail("freeze record.artifact_digest must be a SHA-256 digest");
  string(record.state_identity, "freeze record.state_identity");
  return record;
}

/** Creates the immutable, canonical B-prime R1 binding. */
export function freezeReconstruction(map, { artifact_path, state_identity }) {
  validateReconstruction(map);
  string(artifact_path, "artifact_path");
  string(state_identity, "state_identity");
  const record = { artifact_path, artifact_digest: sha256(stableJson(map)), state_identity };
  validateFreezeRecord(record);
  return record;
}

/** Persists canonical B-prime artifacts so R2 can verify their content binding. */
export async function persistFrozenReconstruction(
  map,
  { artifact_path, freeze_record_path, state_identity, root = process.cwd() },
) {
  const record = freezeReconstruction(map, { artifact_path, state_identity });
  string(freeze_record_path, "freeze_record_path");
  if (freeze_record_path.startsWith("/") || freeze_record_path.split("/").includes("..")) {
    fail("freeze_record_path must be relative");
  }
  await writeJsonAtomically(resolve(root, artifact_path), map);
  await writeJsonAtomically(resolve(root, freeze_record_path), record);
  return record;
}

/** Fails closed before B-prime R2 or scoring when any binding changes. */
export function verifyFrozenReconstruction(map, record, { expected_digest, state_identity }) {
  validateReconstruction(map);
  validateFreezeRecord(record);
  if (expected_digest !== record.artifact_digest) fail("expected digest does not match freeze record");
  if (state_identity !== record.state_identity) fail("state identity does not match freeze record");
  if (sha256(stableJson(map)) !== record.artifact_digest) fail("frozen reconstruction digest mismatch");
  return true;
}

function validateSlots(slots, label, arm) {
  const values = array(slots, label, { min: 1 });
  unique(values, label);
  for (const slot of values) {
    string(slot, `${label} entry`);
    if (forbiddenSlotPart.test(slot) || !canonicalSlots[arm].has(slot)) {
      fail(`${label} contains an ineligible recovery slot ${slot}`);
    }
  }
}

function validateTargetManifest(manifest, label) {
  exactKeys(manifest, ["target_id", "canonical_target", "aliases", "eligible_slots"], label);
  string(manifest.target_id, `${label}.target_id`);
  string(manifest.canonical_target, `${label}.canonical_target`);
  const aliases = array(manifest.aliases, `${label}.aliases`);
  for (const alias of aliases) string(alias, `${label}.aliases entry`);
  unique([manifest.canonical_target, ...aliases].map(normalizeTarget), `${label}.canonical target aliases`);
  exactKeys(manifest.eligible_slots, ARMS, `${label}.eligible_slots`);
  for (const arm of ARMS) validateSlots(manifest.eligible_slots[arm], `${label}.eligible_slots.${arm}`, arm);
  for (const slot of sharedSlots) {
    const eligibility = ARMS.map((arm) => manifest.eligible_slots[arm].includes(slot));
    if (eligibility.some(Boolean) && !eligibility.every(Boolean)) {
      fail(`${label}.eligible_slots must expose shared ${slot} slots to every arm`);
    }
  }
}

/** Validates the pinned eight-family, two-twin, three-rerun pilot corpus. */
export function validateCorpus(corpus) {
  exactKeys(corpus, ["schema_version", "experiment_id", "base_repository_commit", "provenance", "families"], "corpus");
  if (corpus.schema_version !== CORPUS_SCHEMA_VERSION) fail("corpus schema_version must be 1");
  string(corpus.experiment_id, "corpus.experiment_id");
  if (corpus.base_repository_commit !== PINNED_BASE_REPOSITORY_COMMIT) fail("corpus must use the pinned base repository commit");
  exactKeys(corpus.provenance, ["kind", "note"], "corpus.provenance");
  if (!new Set(["synthetic_test_data", "observed_failure"]).has(corpus.provenance.kind)) fail("corpus provenance.kind is invalid");
  string(corpus.provenance.note, "corpus.provenance.note");
  const families = array(corpus.families, "corpus.families", { min: 1 });
  if (families.length !== 8) fail("corpus must contain exactly eight fixture families");
  const ids = [];
  let positive = 0;
  let controls = 0;
  const controlDifficulties = new Set();
  for (const [index, family] of families.entries()) {
    exactKeys(family, ["family_id", "classification", "provenance", "difficulty", "target_manifest", "twins"], `families[${index}]`);
    string(family.family_id, `families[${index}].family_id`);
    ids.push(family.family_id);
    if (family.classification === "seeded_positive") positive += 1;
    else if (family.classification === "control") controls += 1;
    else fail(`families[${index}].classification is invalid`);
    exactKeys(family.provenance, ["class", "note"], `families[${index}].provenance`);
    string(family.provenance.class, `families[${index}].provenance.class`);
    string(family.provenance.note, `families[${index}].provenance.note`);
    string(family.difficulty, `families[${index}].difficulty`);
    if (family.classification === "seeded_positive") validateTargetManifest(family.target_manifest, `families[${index}].target_manifest`);
    else {
      controlDifficulties.add(family.difficulty);
      if (family.target_manifest !== null) fail(`control ${family.family_id} must not declare a seeded target`);
    }
    const twins = array(family.twins, `families[${index}].twins`);
    if (twins.length !== 2) fail(`family ${family.family_id} must have exactly two domain-shifted twins`);
    const twinIds = [];
    for (const [twinIndex, twin] of twins.entries()) {
      exactKeys(twin, ["twin_id", "domain", "reruns"], `families[${index}].twins[${twinIndex}]`);
      string(twin.twin_id, `families[${index}].twins[${twinIndex}].twin_id`);
      twinIds.push(twin.twin_id);
      string(twin.domain, `families[${index}].twins[${twinIndex}].domain`);
      if (twin.reruns.join(",") !== "1,2,3,4,5") fail(`twin ${twin.twin_id} must declare initial reruns 1,2,3 and permitted reruns 4,5`);
    }
    unique(twinIds, `family ${family.family_id} twin ids`);
  }
  unique(ids, "corpus family ids");
  if (positive !== 6 || controls !== 2) fail("corpus must contain six seeded-positive and two control families");
  if (!controlDifficulties.has("underspecified") || !controlDifficulties.has("local-uncertainty")) {
    fail("corpus controls must cover underspecification and local/material uncertainty");
  }
  return corpus;
}

function normalizeTarget(value) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function getPath(value, path) {
  return path.split(".").reduce((current, key) => (current && typeof current === "object" ? current[key] : undefined), value);
}

function semanticStrings(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(semanticStrings);
  if (!value || typeof value !== "object") return [];
  const allowed = ["target_id", "requirement", "statement", "surface", "omission", "finding", "text", "title", "body"];
  return allowed.flatMap((key) => semanticStrings(value[key]));
}

function locateFamily(corpus, familyId) {
  const family = corpus.families.find((entry) => entry.family_id === familyId);
  if (!family) fail(`unknown corpus family ${familyId}`);
  return family;
}

function validateEvaluationRepositoryCommit(value, label) {
  if (!commitHash.test(string(value, label))) {
    fail(`${label} must be a 40-character commit SHA`);
  }
  if (value === PINNED_BASE_REPOSITORY_COMMIT) {
    fail(`${label} must not use the pre-policy base commit`);
  }
}

function validateRunIdentity(corpus, run) {
  exactKeys(run, ["family_id", "twin_id", "rerun", "arm", "evaluation_repository_commit", "output", ...(run.arm === "B-prime" ? ["r2"] : [])], "run");
  const family = locateFamily(corpus, run.family_id);
  const twin = family.twins.find((entry) => entry.twin_id === run.twin_id);
  if (!twin) fail(`unknown twin ${run.twin_id} for ${run.family_id}`);
  if (!twin.reruns.includes(run.rerun)) fail(`undeclared rerun ${run.rerun} for ${run.twin_id}`);
  if (!ARMS.includes(run.arm)) fail(`unknown arm ${run.arm}`);
  validateEvaluationRepositoryCommit(run.evaluation_repository_commit, "run.evaluation_repository_commit");
  object(run.output, "run.output");
  if (run.arm === "A") {
    exactOptionalKeys(run.output, ["findings"], ["closeout"], "A output");
  }
  if (run.arm === "B") validateBundledReviewerOutput(run.output);
  if (run.arm === "B-prime") {
    exactKeys(run.r2, ["frozen_map", "freeze_record", "expected_digest", "state_identity"], "B-prime run.r2");
    verifyFrozenReconstruction(run.r2.frozen_map, run.r2.freeze_record, {
      expected_digest: run.r2.expected_digest,
      state_identity: run.r2.state_identity,
    });
    validateBPrimeOutput(run.output, run.r2.frozen_map);
  }
  return family;
}

/** Binds a scored comparison to one post-policy repository revision across all arms. */
export function validateEvaluationRuns(corpus, runs) {
  const revisions = array(runs, "runs", { min: 1 })
    .map((run) => {
      validateRunIdentity(corpus, run);
      return run.evaluation_repository_commit;
    });
  if (new Set(revisions).size !== 1) {
    fail("runs must share exactly one evaluation_repository_commit");
  }
  return revisions[0];
}

/** Scores only corpus-declared semantic slots; raw evidence and transcripts are never scanned. */
export function extractSorr(corpus, run) {
  validateCorpus(corpus);
  const family = validateRunIdentity(corpus, run);
  if (family.classification === "control") return { ...runIdentity(run), recovered: false, target_id: null, matches: [] };
  const manifest = family.target_manifest;
  const acceptable = new Set([manifest.canonical_target, ...manifest.aliases].map(normalizeTarget));
  const matches = [];
  for (const slot of manifest.eligible_slots[run.arm]) {
    const source = run.arm === "B-prime" && ["requirements", "derived_requirements", "repo_invariants", "affected_surfaces", "unknowns"].includes(slot)
      ? run.r2.frozen_map
      : run.output;
    for (const candidate of semanticStrings(getPath(source, slot))) {
      if (acceptable.has(normalizeTarget(candidate))) matches.push({ slot, value: candidate });
    }
  }
  return { ...runIdentity(run), recovered: matches.length > 0, target_id: manifest.target_id, matches };
}

function runIdentity(run) {
  return {
    family_id: run.family_id,
    twin_id: run.twin_id,
    rerun: run.rerun,
    arm: run.arm,
    evaluation_repository_commit: run.evaluation_repository_commit,
  };
}

/** Produces arm-neutral packets; arm, family, target and source provenance never leave this boundary. */
export function createBlindedPackets(findings) {
  const packets = [];
  for (const [index, finding] of array(findings, "findings").entries()) {
    exactKeys(finding, ["finding_id", "text", "blocking"], `findings[${index}]`);
    string(finding.finding_id, `findings[${index}].finding_id`);
    string(finding.text, `findings[${index}].text`);
    if (typeof finding.blocking !== "boolean") fail(`findings[${index}].blocking must be boolean`);
    const packet_id = sha256(stableJson({ finding_id: finding.finding_id, text: finding.text, blocking: finding.blocking }));
    packets.push({ packet_id, finding: finding.text, blocking: finding.blocking });
  }
  unique(packets.map((packet) => packet.packet_id), "blinded packet ids");
  return packets;
}

/** Joins a complete, blinded anchor decision set and computes the required unsupported rate. */
export function joinAnchorResults(packets, results) {
  const packetList = array(packets, "packets");
  const packetIds = new Set(packetList.map((packet) => packet.packet_id));
  if (packetIds.size !== packetList.length) fail("packets must have unique packet ids");
  const joined = [];
  for (const [index, result] of array(results, "anchor results").entries()) {
    exactKeys(result, ["packet_id", "label"], `anchor results[${index}]`);
    if (!packetIds.has(result.packet_id)) fail(`anchor result references unknown packet ${result.packet_id}`);
    if (!anchorLabels.has(result.label)) fail(`anchor result ${result.packet_id} has invalid label`);
    if (joined.some((entry) => entry.packet_id === result.packet_id)) fail(`duplicate anchor result ${result.packet_id}`);
    joined.push({ ...result, blocking: packetList.find((packet) => packet.packet_id === result.packet_id).blocking });
  }
  if (joined.length !== packetList.length) fail("anchor results must cover every blinded packet exactly once");
  const blocking = joined.filter((entry) => entry.blocking);
  const measurable = blocking.length > 0;
  return {
    results: joined,
    unsupported_blocking_rate: measurable
      ? blocking.filter((entry) => entry.label === "UNSUPPORTED").length / blocking.length
      : null,
    unsupported_blocking_rate_status: measurable ? "MEASURED" : "NOT_MEASURABLE",
  };
}

function expectedClusters(corpus, positiveOnly, reruns) {
  return corpus.families
    .filter((family) => !positiveOnly || family.classification === "seeded_positive")
    .flatMap((family) => family.twins.flatMap((twin) => twin.reruns
      .filter((rerun) => rerun <= reruns)
      .map((rerun) => ({ family_id: family.family_id, twin_id: twin.twin_id, rerun }))));
}

function scoreArm(corpus, recoveries, arm, positiveOnly, reruns) {
  const expected = expectedClusters(corpus, positiveOnly, reruns);
  const byKey = new Map();
  for (const recovery of recoveries.filter((entry) => entry.arm === arm)) {
    const key = `${recovery.family_id}/${recovery.twin_id}/${recovery.rerun}`;
    if (byKey.has(key)) fail(`duplicate recovery record ${key} for arm ${arm}`);
    if (typeof recovery.recovered !== "boolean") fail(`recovery ${key} must provide recovered boolean`);
    byKey.set(key, recovery);
  }
  for (const cluster of expected) {
    const key = `${cluster.family_id}/${cluster.twin_id}/${cluster.rerun}`;
    if (!byKey.has(key)) fail(`missing recovery ${key} for arm ${arm}`);
  }
  const familyScores = [];
  for (const family of corpus.families.filter((entry) => !positiveOnly || entry.classification === "seeded_positive")) {
    const twinScores = family.twins.map((twin) => {
      const values = twin.reruns.filter((rerun) => rerun <= reruns).map((rerun) => byKey.get(`${family.family_id}/${twin.twin_id}/${rerun}`).recovered ? 1 : 0);
      return { twin_id: twin.twin_id, score: values.reduce((sum, value) => sum + value, 0) / values.length };
    });
    familyScores.push({ family_id: family.family_id, score: twinScores.reduce((sum, twin) => sum + twin.score, 0) / twinScores.length, twins: twinScores });
  }
  return { score: familyScores.reduce((sum, family) => sum + family.score, 0) / familyScores.length, families: familyScores };
}

/** Equal-weights reruns within twins, twins within families, and families within an arm. */
export function aggregateRecoveries(corpus, recoveries, { arms = ARMS, positiveOnly = true, reruns = 3 } = {}) {
  if (reruns !== 3 && reruns !== 5) fail("aggregation accepts only the preregistered 3 or 5 rerun selections");
  validateCorpus(corpus);
  array(recoveries, "recoveries");
  const selectedRecoveries = recoveries.filter((entry) => arms.includes(entry.arm));
  const revisions = selectedRecoveries.map((entry, index) => {
    validateEvaluationRepositoryCommit(entry.evaluation_repository_commit, `recoveries[${index}].evaluation_repository_commit`);
    return entry.evaluation_repository_commit;
  });
  if (new Set(revisions).size !== 1) fail("recoveries must share exactly one evaluation_repository_commit");
  const output = {};
  for (const arm of arms) {
    if (!ARMS.includes(arm)) fail(`unknown requested arm ${arm}`);
    output[arm] = scoreArm(corpus, recoveries, arm, positiveOnly, reruns);
  }
  return output;
}
function seededRandom(seed) {
  let state = Number.parseInt(sha256(String(seed)).slice(0, 8), 16) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

/** Deterministic paired bootstrap resamples whole families, retaining every twin and rerun together. */
export function clusteredBootstrap(corpus, recoveries, { baseline = "A", candidate = "B", iterations = 1_000, seed = "reconstruction-v1", reruns = 3 } = {}) {
  if (!Number.isInteger(iterations) || iterations < 1) fail("bootstrap iterations must be a positive integer");
  const aggregates = aggregateRecoveries(corpus, recoveries, { arms: [baseline, candidate], reruns });
  const base = new Map(aggregates[baseline].families.map((entry) => [entry.family_id, entry.score]));
  const proposed = new Map(aggregates[candidate].families.map((entry) => [entry.family_id, entry.score]));
  const ids = [...base.keys()];
  const random = seededRandom(seed);
  const samples = Array.from({ length: iterations }, () => {
    let difference = 0;
    for (let index = 0; index < ids.length; index += 1) {
      const id = ids[Math.floor(random() * ids.length)];
      difference += proposed.get(id) - base.get(id);
    }
    return difference / ids.length;
  }).sort((left, right) => left - right);
  const percentile = (p) => samples[Math.min(samples.length - 1, Math.floor(p * (samples.length - 1)))];
  return { baseline, candidate, iterations, seed, lower: percentile(0.025), upper: percentile(0.975), estimate: aggregates[candidate].score - aggregates[baseline].score };
}

/** The sole pre-registered 3-to-5 ladder; it never permits additional reruns. */
export function rerunLadder({ reruns, intervals }) {
  if (reruns !== 3 && reruns !== 5) fail("rerun ladder accepts only 3 or 5 reruns");
  const borderline = array(intervals, "intervals").some((interval, index) => {
    exactKeys(interval, ["lower", "upper", "threshold"], `intervals[${index}]`);
    if (![interval.lower, interval.upper, interval.threshold].every(Number.isFinite) || interval.lower > interval.upper) fail(`intervals[${index}] is invalid`);
    return interval.lower <= interval.threshold && interval.threshold <= interval.upper;
  });
  if (!borderline) return { borderline: false, next_reruns: null, terminal: false };
  return reruns === 3
    ? { borderline: true, next_reruns: 5, terminal: false }
    : { borderline: true, next_reruns: null, terminal: true };
}

function familyImprovements(candidate, baseline) {
  const baselineScores = new Map(baseline.family_scores.map((entry) => [entry.family_id, entry.score]));
  return candidate.family_scores.filter((entry) => entry.score > baselineScores.get(entry.family_id)).length;
}

function promotedB(stage) {
  const { A, B } = stage;
  return A.unsupported_rate_status === "MEASURED"
    && B.unsupported_rate_status === "MEASURED"
    && B.sorr - A.sorr >= 0.10
    && familyImprovements(B, A) >= 3
    && B.unsupported_rate - A.unsupported_rate <= 0.05
    && B.median_tokens <= 1.20 * A.median_tokens;
}

function promotedBPrime(stage) {
  const { A, B, "B-prime": BPrime } = stage;
  return A.unsupported_rate_status === "MEASURED"
    && B.unsupported_rate_status === "MEASURED"
    && BPrime.unsupported_rate_status === "MEASURED"
    && BPrime.sorr - A.sorr >= 0.10
    && BPrime.sorr - B.sorr >= 0.10
    && familyImprovements(BPrime, B) >= 3
    && BPrime.unsupported_rate - A.unsupported_rate <= 0.05
    && BPrime.median_tokens <= 1.50 * B.median_tokens;
}

function validateStage(stage) {
  exactKeys(stage, ARMS, "stage1");
  for (const arm of ARMS) {
    exactKeys(stage[arm], ["sorr", "unsupported_rate", "unsupported_rate_status", "median_tokens", "family_scores", "persistent_miss_families"], `stage1.${arm}`);
    if (!["MEASURED", "NOT_MEASURABLE"].includes(stage[arm].unsupported_rate_status)) fail(`stage1.${arm}.unsupported_rate_status is invalid`);
    for (const metric of ["sorr", "median_tokens"]) if (!Number.isFinite(stage[arm][metric]) || stage[arm][metric] < 0) fail(`stage1.${arm}.${metric} must be non-negative`);
    if (stage[arm].unsupported_rate_status === "MEASURED" && (!Number.isFinite(stage[arm].unsupported_rate) || stage[arm].unsupported_rate < 0 || stage[arm].unsupported_rate > 1)) fail(`stage1.${arm}.unsupported_rate must be in [0, 1] when measured`);
    if (stage[arm].unsupported_rate_status === "NOT_MEASURABLE" && stage[arm].unsupported_rate !== null) fail(`stage1.${arm}.unsupported_rate must be null when not measurable`);
    const scores = array(stage[arm].family_scores, `stage1.${arm}.family_scores`);
    if (scores.length !== 6) fail(`stage1.${arm}.family_scores must describe six positive families`);
    for (const score of scores) {
      exactKeys(score, ["family_id", "score"], `stage1.${arm}.family_scores entry`);
      string(score.family_id, "stage1 family_id");
      if (!Number.isFinite(score.score) || score.score < 0 || score.score > 1) fail("stage1 family score must be in [0, 1]");
    }
    if (!Number.isInteger(stage[arm].persistent_miss_families) || stage[arm].persistent_miss_families < 0) fail(`stage1.${arm}.persistent_miss_families must be a non-negative integer`);
  }
  const expectedFamilies = [...stage.A.family_scores.map((entry) => entry.family_id)].sort();
  unique(expectedFamilies, "stage1.A family ids");
  for (const arm of ["B", "B-prime"]) {
    const actualFamilies = [...stage[arm].family_scores.map((entry) => entry.family_id)].sort();
    unique(actualFamilies, `stage1.${arm} family ids`);
    if (actualFamilies.length !== expectedFamilies.length || actualFamilies.some((id, index) => id !== expectedFamilies[index])) {
      fail(`stage1.${arm} family scores must be paired with stage1.A`);
    }
  }
}

const decisionThresholds = {
  a_miss_rate: 0.15,
  b_sorr_delta: 0.10,
  b_family_improvements: 3,
  b_unsupported_regression: 0.05,
  b_token_ratio: 1.20,
  b_residual_miss_rate: 0.10,
  bprime_sorr_delta_a: 0.10,
  bprime_sorr_delta_b: 0.10,
  bprime_family_improvements: 3,
  bprime_unsupported_regression: 0.05,
  bprime_token_ratio: 1.50,
  bprime_residual_miss_rate: 0.10,
  stage2_residual_miss_rate: 0.10,
  stage2_persistent_miss_families: 2,
};

function decisionIntervals(intervals, keys) {
  exactKeys(intervals, keys, "decision intervals");
  return keys.map((key) => {
    const interval = intervals[key];
    exactKeys(interval, ["lower", "upper", "threshold"], `decision intervals.${key}`);
    if (![interval.lower, interval.upper, interval.threshold].every(Number.isFinite) || interval.lower > interval.upper) {
      fail(`decision intervals.${key} is invalid`);
    }
    if (interval.threshold !== decisionThresholds[key]) fail(`decision intervals.${key} has the wrong pre-registered threshold`);
    return interval;
  });
}

const stageDecisionIntervalKeys = Object.keys(decisionThresholds).filter((key) => key !== "a_miss_rate");

/** Applies Phase-0 and Stage-1 gates only with intervals for every applicable decision threshold. */
export function decideExperiment({ phase0, stage1 = null, reruns, intervals }) {
  exactKeys(phase0, ["a_sorr"], "phase0");
  if (!Number.isFinite(phase0.a_sorr) || phase0.a_sorr < 0 || phase0.a_sorr > 1) fail("phase0.a_sorr must be in [0, 1]");
  const phaseIntervals = decisionIntervals(intervals, stage1 ? Object.keys(decisionThresholds) : ["a_miss_rate"]);
  const phaseLadder = rerunLadder({ reruns, intervals: phaseIntervals.filter((entry) => entry.threshold === 0.15) });
  if (phaseLadder.borderline) return { status: "BORDERLINE", phase: "phase0", ...phaseLadder };
  const aMissRate = 1 - phase0.a_sorr;
  if (aMissRate < 0.15) return { status: "OMISSION_MATERIALITY_NOT_ESTABLISHED", phase: "phase0", a_miss_rate: aMissRate };
  if (!stage1) fail("stage1 observations are required after materiality is established");
  validateStage(stage1);
  const stageLadder = rerunLadder({ reruns, intervals: decisionIntervals(intervals, Object.keys(decisionThresholds)) });
  if (stageLadder.borderline) return { status: "BORDERLINE", phase: "stage1", ...stageLadder };
  const bPromoted = promotedB(stage1);
  const bPrimePromoted = promotedBPrime(stage1);
  const selected = bPrimePromoted ? "B-prime" : bPromoted ? "B" : "A";
  const selectedResult = stage1[selected];
  const residualMissRate = 1 - selectedResult.sorr;
  const persistentMisses = selectedResult.persistent_miss_families >= 2;
  if (bPrimePromoted && residualMissRate < 0.10) {
    return { status: "FRAMING_HYPOTHESIS_NOT_TESTED_EXTRA_REVIEW_SUFFICIENT", selected_arm: selected, residual_miss_rate: residualMissRate };
  }
  if (bPromoted && residualMissRate < 0.10) {
    return { status: "FRAMING_HYPOTHESIS_NOT_TESTED_CHEAP_CONTROL_SUFFICIENT", selected_arm: selected, residual_miss_rate: residualMissRate };
  }
  return { status: "STAGE_2_REQUIRED", selected_arm: selected, residual_miss_rate: residualMissRate, persistent_miss_families: selectedResult.persistent_miss_families, stage2_open: residualMissRate >= 0.10 || persistentMisses };
}

async function cli() {
  const input = JSON.parse(await readFile(0, "utf8"));
  let output;
  switch (input.operation) {
    case "validate-corpus": output = validateCorpus(input.corpus); break;
    case "score": output = extractSorr(input.corpus, input.run); break;
    case "aggregate": output = aggregateRecoveries(input.corpus, input.recoveries, input.options); break;
    case "decide": fail("CLI decision input is unbound; derive metrics from verified corpus, run, and anchor artifacts in the importing API"); break;
    default: fail("CLI operation must be validate-corpus, score, or aggregate");
  }
  process.stdout.write(`${stableJson(output)}\n`);
}

if (import.meta.main) {
  cli().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
