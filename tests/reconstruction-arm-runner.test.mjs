import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "bun:test";
import { runReconstructionArm } from "../scripts/run-reconstruction-arm.mjs";

const corpusFixture = await readFile(new URL("./fixtures/reconstruction-corpus.synthetic.json", import.meta.url), "utf8");
const evaluationCommit = "5296373ba78b9f0e1a629a45056a2cc7a8c04225";
const fakeOmp = `#!/usr/bin/env bun
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
const args = process.argv.slice(2);
const option = (name) => args[args.indexOf(name) + 1];
const prompt = option("-p");
const cwd = option("--cwd");
const sessionDirectory = option("--session-dir");
await mkdir(sessionDirectory, { recursive: true });
if (prompt.includes("Read skill://ompstack")) {
  await Bun.write(join(sessionDirectory, "preflight.jsonl"), [
    JSON.stringify({ type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: "read-skill", name: "read", arguments: { path: "skill://ompstack" } }] } }),
    JSON.stringify({ type: "message", message: { role: "toolResult", toolCallId: "read-skill", toolName: "read", content: [{ type: "text", text: "# ompstack" }] } }),
  ].join("\\n"));
  console.log("PREFLIGHT_OK");
  process.exit(0);
}
const outputPath = /(?:structured output JSON to|write it to|findings\\/closeout JSON to) \\[([^\\]]+)\\]/.exec(prompt)[1];
const isA = args.includes("--no-skills");
const isR1 = prompt.includes("B-prime R1 protocol");
await Bun.write(join(sessionDirectory, "task.jsonl"), [
  JSON.stringify({ type: "message", message: { role: "assistant", usage: { input: 10, output: 5, cacheRead: 2, cacheWrite: 1, totalTokens: 18 }, content: [{ type: "toolCall", name: "bash" }] } }),
  JSON.stringify({ type: "custom", customType: "tool_execution_start", data: { toolName: "bash", args: { command: "bun test tests/example.test.mjs" } } }),
  JSON.stringify({ type: "message", message: { role: "toolResult", content: [{ type: "text", text: "test output" }] } }),
].join("\\n"));
const map = { schema_version: 1, status: "COMPLETE", requirements: [{ requirement: "export --format", source_evidence: ["request"] }], derived_requirements: [], repo_invariants: [], affected_surfaces: [], unknowns: [], evidence: [{ id: "request", kind: "user_turn", locator: "turn:1", excerpt: "Add format." }] };
if (prompt.includes("B-prime R2 protocol") && prompt.includes("Tamper R1")) {
  const r1Path = /frozen R1 map at \\[([^\\]]+)\\]/.exec(prompt)[1];
  await Bun.write(join(cwd, r1Path), JSON.stringify({ ...map, requirements: [{ requirement: "tampered", source_evidence: ["request"] }] }));
}
const output = isR1 ? map : isA ? { findings: [{ title: "ordinary finding", body: "No reconstruction artifact." }] } : prompt.includes("B-prime R2 protocol") ? { findings: [] } : { reconstruction: map, findings: [] };
await Bun.write(join(cwd, outputPath), JSON.stringify(output));
console.log(JSON.stringify({ completed: true }));
`;

async function withWorkspace(callback) {
  const root = await mkdtemp(join(tmpdir(), "ompstack-reconstruction-arm-"));
  try {
    await mkdir(join(root, "candidate"));
    await writeFile(join(root, "corpus.json"), corpusFixture);
    const executable = join(root, "fake-omp.mjs");
    await writeFile(executable, fakeOmp, { mode: 0o755 });
    await chmod(executable, 0o755);
    await callback({ root, executable });
  } finally { await rm(root, { force: true, recursive: true }); }
}
function specification(executable, arm = "A") {
  return {
    schema_version: 1, family_id: "cli-output-format", twin_id: "cli", rerun: 1, arm,
    evaluation_repository_commit: evaluationCommit, state_identity: "candidate:test",
    corpus_path: "corpus.json", cwd: "candidate", prompt: "Assess the requested behavior.", output_path: "arm-output.json",
    r1_path: null, r1_freeze_path: null, artifact_path: `artifacts/${arm}.json`, session_directory: `sessions/${arm}`,
    model: "test-model", thinking: "low", max_time: "1m", test_command_pattern: "\\bbun test\\b", plugin_directory: ".", omp_executable: executable,
  };
}

test("A runner records a scorer-ready baseline artifact and Phase-0 telemetry", async () => {
  await withWorkspace(async ({ root, executable }) => {
    const artifact = await runReconstructionArm({ specification: specification(executable), root });
    assert.equal(artifact.run.arm, "A");
    assert.deepEqual(artifact.run.output, { findings: [{ title: "ordinary finding", body: "No reconstruction artifact." }] });
    assert.equal(artifact.invocation.preflight, null);
    assert.ok(artifact.invocation.arm_arguments.includes("--no-skills"));
    assert.deepEqual(artifact.telemetry.tokens, { input: 10, output: 5, cache_read: 2, cache_write: 1, total: 18 });
    assert.equal(artifact.telemetry.model_turns, 1);
    assert.equal(artifact.telemetry.tool_invocations.by_tool.bash, 1);
    assert.equal(artifact.telemetry.tool_invocations.captured_output_bytes, Buffer.byteLength("test output"));
    assert.equal(artifact.telemetry.test_command_reinvocations, 1);
    assert.equal(artifact.telemetry.compaction_events, 0);
    assert.equal(artifact.telemetry.pruning_events, 0);
  });
});

test("B runner retains verified preflight and its telemetry cost", async () => {
  await withWorkspace(async ({ root, executable }) => {
    const artifact = await runReconstructionArm({ specification: specification(executable, "B"), root });
    assert.equal(artifact.run.output.reconstruction.status, "COMPLETE");
    assert.ok(artifact.invocation.arm_arguments.includes("--skills"));
    assert.equal(await Bun.file(artifact.invocation.preflight.session_path).exists(), true);
    assert.equal(artifact.invocation.preflight.exit_code, 0);
    assert.equal(artifact.telemetry.model_turns, 1);
  });
});

test("B-prime executes and freezes R1 before digest-bound R2", async () => {
  await withWorkspace(async ({ root, executable }) => {
    const spec = { ...specification(executable, "B-prime"), r1_path: "r1.json", r1_freeze_path: "r1.freeze.json" };
    const artifact = await runReconstructionArm({ specification: spec, root });
    assert.equal(artifact.run.arm, "B-prime");
    assert.equal(artifact.run.r2.state_identity, "candidate:test");
    assert.equal(artifact.run.r2.expected_digest, artifact.run.r2.freeze_record.artifact_digest);
    assert.equal(await Bun.file(artifact.invocation.r1.freeze_record_path).exists(), true);
    assert.equal(artifact.telemetry.model_turns, 2);
  });
});

test("B-prime rejects an R2 rewrite of the frozen R1 map", async () => {
  await withWorkspace(async ({ root, executable }) => {
    const spec = { ...specification(executable, "B-prime"), prompt: "Tamper R1", r1_path: "r1.json", r1_freeze_path: "r1.freeze.json" };
    await assert.rejects(runReconstructionArm({ specification: spec, root }), /digest mismatch/);
  });
});

test("runner rejects paths that escape its declared root", async () => {
  await withWorkspace(async ({ root, executable }) => {
    await assert.rejects(runReconstructionArm({ specification: { ...specification(executable), cwd: ".." }, root }), /relative path/);
  });
});
