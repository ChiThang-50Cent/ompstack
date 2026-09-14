import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "bun:test";
import {
  aggregateRecoveries,
  clusteredBootstrap,
  createBlindedPackets,
  decideExperiment,
  extractSorr,
  freezeReconstruction,
  joinAnchorResults,
  persistFrozenReconstruction,
  rerunLadder,
  validateBundledReviewerOutput,
  validateCorpus,
  validateReconstruction,
  verifyFrozenReconstruction,
} from "../scripts/reconstruction-evaluation.mjs";

const corpus = JSON.parse(await readFile(new URL("./fixtures/reconstruction-corpus.synthetic.json", import.meta.url), "utf8"));

function completeMap() {
  return {
    schema_version: 1,
    status: "COMPLETE",
    requirements: [{ requirement: "cli:export --format", source_evidence: ["request"] }],
    derived_requirements: [],
    repo_invariants: [],
    affected_surfaces: [],
    unknowns: [],
    evidence: [{ id: "request", kind: "user_turn", locator: "turn:1", excerpt: "Add --format." }],
  };
}

function run({ arm = "A", output, family_id = "cli-output-format", twin_id = "cli", rerun = 1 } = {}) {
  return { family_id, twin_id, rerun, arm, output };
}

function recoverySet(arm, recovered) {
  return corpus.families
    .filter((family) => family.classification === "seeded_positive")
    .flatMap((family) => family.twins.flatMap((twin) => twin.reruns.map((rerun) => ({
      family_id: family.family_id, twin_id: twin.twin_id, rerun, arm, recovered,
    }))));
}

function familyScores(score) {
  return corpus.families
    .filter((family) => family.classification === "seeded_positive")
    .map((family) => ({ family_id: family.family_id, score }));
}

function stage({ a = 0.5, b = 0.5, bPrime = 0.5, bTokens = 110, bPrimeTokens = 150 } = {}) {
  const arm = (sorr, median_tokens) => ({
    sorr,
    unsupported_rate: 0.10,
    unsupported_rate_status: "MEASURED",
    median_tokens,
    family_scores: familyScores(sorr),
    persistent_miss_families: sorr < 0.9 ? 2 : 0,
  });
  return { A: arm(a, 100), B: arm(b, bTokens), "B-prime": arm(bPrime, bPrimeTokens) };
}

function intervals(withStage = false) {
  const thresholds = {
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
  return Object.fromEntries(Object.entries(withStage ? thresholds : { a_miss_rate: 0.15 })
    .map(([key, threshold]) => [key, { lower: threshold + 0.01, upper: threshold + 0.02, threshold }]));
}

test("validates the pinned, explicitly synthetic eight-family corpus", () => {
  assert.equal(validateCorpus(corpus), corpus);
  assert.equal(corpus.provenance.kind, "synthetic_test_data");
  assert.match(corpus.provenance.note, /not a live rollout/i);
});

test("SORR never recovers a target from forbidden raw evidence, but accepts a declared alias in an eligible slot", () => {
  const forbidden = extractSorr(corpus, run({ output: { raw_evidence: ["cli:export --format"] } }));
  assert.equal(forbidden.recovered, false);
  const map = completeMap();
  map.requirements = [{ requirement: "export --format", source_evidence: ["request"] }];
  const recovered = extractSorr(corpus, run({
    arm: "B",
    output: { reconstruction: map, findings: [] },
  }));
  assert.equal(recovered.recovered, true);
  assert.deepEqual(recovered.matches, [{ slot: "reconstruction.requirements", value: "export --format" }]);

  const frozenMap = completeMap();
  const freezeRecord = freezeReconstruction(frozenMap, { artifact_path: "evidence/r1.json", state_identity: "candidate:abc" });
  assert.throws(() => extractSorr(corpus, {
    ...run({ arm: "B-prime", output: { reconstruction: { requirements: ["export --format"] } } }),
    r2: { frozen_map: { ...frozenMap, requirements: [] }, freeze_record: freezeRecord, expected_digest: freezeRecord.artifact_digest, state_identity: "candidate:abc" },
  }), /COMPLETE maps require/);

  const frozenSource = completeMap();
  frozenSource.requirements = [{ requirement: "export --format", source_evidence: ["request"] }];
  const frozenSourceRecord = freezeReconstruction(frozenSource, { artifact_path: "evidence/r1.json", state_identity: "candidate:abc" });
  const frozenRecovery = extractSorr(corpus, {
    ...run({ arm: "B-prime", output: { requirements: ["not the frozen map"] } }),
    r2: { frozen_map: frozenSource, freeze_record: frozenSourceRecord, expected_digest: frozenSourceRecord.artifact_digest, state_identity: "candidate:abc" },
  });
  assert.equal(frozenRecovery.recovered, true);

  const frozenMiss = completeMap();
  frozenMiss.requirements = [{ requirement: "unrelated requirement", source_evidence: ["request"] }];
  const frozenMissRecord = freezeReconstruction(frozenMiss, { artifact_path: "evidence/r1.json", state_identity: "candidate:abc" });
  assert.equal(extractSorr(corpus, {
    ...run({ arm: "B-prime", output: { requirements: ["cli:export --format"] } }),
    r2: { frozen_map: frozenMiss, freeze_record: frozenMissRecord, expected_digest: frozenMissRecord.artifact_digest, state_identity: "candidate:abc" },
  }).recovered, false);

  assert.equal(extractSorr(corpus, run({ output: { findings: [{ title: "cli:export --format", body: "Required export format is absent." }] } })).recovered, true);
});

test("strict maps preserve underspecification and B-prime freezes reject altered maps, state, or digest", () => {
  const insufficient = {
    schema_version: 1,
    status: "INSUFFICIENT_EVIDENCE",
    requirements: [],
    derived_requirements: [],
    repo_invariants: [],
    affected_surfaces: [],
    unknowns: [{ statement: "The requested output format is not specified.", source_evidence: ["request"] }],
    evidence: [{ id: "request", kind: "user_turn", locator: "turn:1", excerpt: "Export data." }],
  };
  assert.equal(validateReconstruction(insufficient), insufficient);
  assert.throws(() => validateReconstruction({ ...insufficient, requirements: [{ requirement: "Invent CSV output", source_evidence: ["request"] }] }), /must not invent requirements/);

  const map = completeMap();
  const frozen = freezeReconstruction(map, { artifact_path: "evidence/r1.json", state_identity: "candidate:abc" });
  assert.equal(verifyFrozenReconstruction(map, frozen, { expected_digest: frozen.artifact_digest, state_identity: "candidate:abc" }), true);
  assert.throws(() => verifyFrozenReconstruction({ ...map, requirements: [{ requirement: "cli:export --format", source_evidence: ["request"] }, { requirement: "invented", source_evidence: ["request"] }] }, frozen, { expected_digest: frozen.artifact_digest, state_identity: "candidate:abc" }), /digest mismatch/);
  assert.throws(() => verifyFrozenReconstruction(map, frozen, { expected_digest: frozen.artifact_digest, state_identity: "candidate:def" }), /state identity/);
});

test("B's strict envelope binds every ordinary finding to map evidence", () => {
  const envelope = { reconstruction: completeMap(), findings: [{ finding_id: "f1", finding: "Missing format option.", blocking: true, source_evidence: ["request"] }] };
  assert.equal(validateBundledReviewerOutput(envelope), envelope);
  assert.throws(() => validateBundledReviewerOutput({ ...envelope, findings: [{ ...envelope.findings[0], source_evidence: ["unknown"] }] }), /unknown evidence/);
});

test("persists a canonical B-prime map and freeze record", async () => {
  const root = await mkdtemp(join(tmpdir(), "ompstack-reconstruction-"));
  try {
    const map = completeMap();
    const record = await persistFrozenReconstruction(map, {
      artifact_path: "artifacts/r1.json",
      freeze_record_path: "artifacts/r1.freeze.json",
      state_identity: "candidate:abc",
      root,
    });
    assert.deepEqual(
      JSON.parse(await readFile(join(root, "artifacts/r1.json"), "utf8")),
      map,
    );
    assert.deepEqual(
      JSON.parse(await readFile(join(root, "artifacts/r1.freeze.json"), "utf8")),
      record,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("anchor packets are neutral and joins are complete and strict", () => {
  const packets = createBlindedPackets([{ finding_id: "f1", text: "The endpoint omits cursor handling.", blocking: true }]);
  assert.deepEqual(Object.keys(packets[0]).sort(), ["blocking", "finding", "packet_id"]);
  assert.equal(JSON.stringify(packets[0]).includes("arm"), false);
  const joined = joinAnchorResults(packets, [{ packet_id: packets[0].packet_id, label: "UNSUPPORTED" }]);
  assert.equal(joined.unsupported_blocking_rate, 1);
  assert.throws(() => joinAnchorResults(packets, []), /cover every/);

  const unblocked = createBlindedPackets([{ finding_id: "f2", text: "Optional note.", blocking: false }]);
  assert.deepEqual(
    joinAnchorResults(unblocked, [{ packet_id: unblocked[0].packet_id, label: "VALID_EXPLICIT" }]),
    {
      results: [{ packet_id: unblocked[0].packet_id, label: "VALID_EXPLICIT", blocking: false }],
      unsupported_blocking_rate: null,
      unsupported_blocking_rate_status: "NOT_MEASURABLE",
    },
  );
});

test("a not-measurable blocking rate cannot promote B", () => {
  const input = stage({ b: 0.95, bPrime: 0.5 });
  for (const arm of Object.values(input)) {
    arm.unsupported_rate = null;
    arm.unsupported_rate_status = "NOT_MEASURABLE";
  }
  assert.equal(decideExperiment({ phase0: { a_sorr: 0.5 }, stage1: input, reruns: 3, intervals: intervals(true) }).status, "STAGE_2_REQUIRED");
});

test("aggregates reruns into twins and families with equal family weights", () => {
  const recoveries = [...recoverySet("A", false), ...recoverySet("B", true)];
  const aggregate = aggregateRecoveries(corpus, recoveries, { arms: ["A", "B"] });
  assert.equal(aggregate.A.score, 0);
  assert.equal(aggregate.B.score, 1);
  assert.equal(aggregate.B.families.length, 6);
  assert.equal(aggregate.B.families[0].twins.length, 2);
  assert.equal(aggregateRecoveries(corpus, recoveries, { arms: ["A", "B"], reruns: 5 }).B.score, 1);
});

test("clustered bootstrap is deterministic and retains the paired family estimate", () => {
  const recoveries = [...recoverySet("A", false), ...recoverySet("B", true)];
  const first = clusteredBootstrap(corpus, recoveries, { iterations: 40, seed: "fixed" });
  const second = clusteredBootstrap(corpus, recoveries, { iterations: 40, seed: "fixed" });
  assert.deepEqual(first, second);
  assert.equal(first.estimate, 1);
});

test("phase and stage decisions expose only permitted terminal outcomes", () => {
  assert.equal(decideExperiment({ phase0: { a_sorr: 0.9 }, reruns: 3, intervals: intervals() }).status, "OMISSION_MATERIALITY_NOT_ESTABLISHED");
  assert.equal(decideExperiment({ phase0: { a_sorr: 0.5 }, stage1: stage({ b: 0.95, bPrime: 0.5 }), reruns: 3, intervals: intervals(true) }).status, "FRAMING_HYPOTHESIS_NOT_TESTED_CHEAP_CONTROL_SUFFICIENT");
  assert.equal(decideExperiment({ phase0: { a_sorr: 0.5 }, stage1: stage({ b: 0.7, bPrime: 0.95 }), reruns: 3, intervals: intervals(true) }).status, "FRAMING_HYPOTHESIS_NOT_TESTED_EXTRA_REVIEW_SUFFICIENT");
  assert.equal(decideExperiment({ phase0: { a_sorr: 0.5 }, stage1: stage(), reruns: 3, intervals: intervals(true) }).status, "STAGE_2_REQUIRED");
});

test("non-borderline decisions require every pre-registered uncertainty interval", () => {
  assert.throws(() => decideExperiment({ phase0: { a_sorr: 0.5 }, stage1: stage(), reruns: 3, intervals: intervals() }), /decision intervals/);
});

test("the CLI rejects unbound point-estimate promotion requests", async () => {
  const process = Bun.spawn(["bun", "scripts/reconstruction-evaluation.mjs"], {
    cwd: new URL("..", import.meta.url).pathname,
    stdin: new Blob([JSON.stringify({ operation: "decide", phase0: { a_sorr: 1 } })]),
    stderr: "pipe",
  });
  assert.equal(await process.exited, 1);
  assert.match(await new Response(process.stderr).text(), /unbound/);
});

test("the only uncertainty ladder is three runs to five, then terminal borderline", () => {
  const interval = [{ lower: 0.10, upper: 0.20, threshold: 0.15 }];
  assert.deepEqual(rerunLadder({ reruns: 3, intervals: interval }), { borderline: true, next_reruns: 5, terminal: false });
  assert.deepEqual(rerunLadder({ reruns: 5, intervals: interval }), { borderline: true, next_reruns: null, terminal: true });
  assert.equal(decideExperiment({ phase0: { a_sorr: 0.5 }, reruns: 3, intervals: { a_miss_rate: interval[0] } }).status, "BORDERLINE");
});
