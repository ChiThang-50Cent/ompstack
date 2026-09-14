import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import {
  PINNED_BASE_REPOSITORY_COMMIT,
  persistFrozenReconstruction,
  validateEvaluationRuns,
  validateReconstruction,
  verifyFrozenReconstruction,
} from "./reconstruction-evaluation.mjs";
import { writeJsonAtomically } from "./run-verification-contract.mjs";

const arms = new Set(["A", "B", "B-prime"]);
const commitHash = /^[0-9a-f]{40}$/;

function fail(message) { throw new Error(`reconstruction arm runner: ${message}`); }
function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`);
  return value;
}
function string(value, label) {
  if (typeof value !== "string" || value.trim() === "") fail(`${label} must be a non-empty string`);
  return value;
}
function relativePath(value, label) {
  string(value, label);
  if (value.startsWith("/") || value.split("/").includes("..")) fail(`${label} must be a relative path`);
  return value;
}
function exactKeys(value, keys, label) {
  object(value, label);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail(`${label} has unexpected or missing properties`);
}

function validateSpecification(specification) {
  exactKeys(specification, [
    "schema_version", "family_id", "twin_id", "rerun", "arm", "evaluation_repository_commit", "state_identity",
    "corpus_path", "cwd", "prompt", "output_path", "r1_path", "r1_freeze_path", "artifact_path", "session_directory",
    "model", "thinking", "max_time", "test_command_pattern", "plugin_directory", "omp_executable",
  ], "specification");
  if (specification.schema_version !== 1) fail("specification.schema_version must be 1");
  for (const key of ["family_id", "twin_id", "state_identity", "prompt", "model", "thinking", "max_time", "test_command_pattern", "plugin_directory", "omp_executable"]) string(specification[key], `specification.${key}`);
  for (const key of ["cwd", "corpus_path", "output_path", "artifact_path", "session_directory"]) relativePath(specification[key], `specification.${key}`);
  if (specification.arm === "B-prime") {
    relativePath(specification.r1_path, "specification.r1_path");
    relativePath(specification.r1_freeze_path, "specification.r1_freeze_path");
    if (new Set([specification.output_path, specification.r1_path, specification.r1_freeze_path]).size !== 3) {
      fail("B-prime output, R1, and freeze paths must be distinct");
    }
  } else if (specification.r1_path !== null || specification.r1_freeze_path !== null) {
    fail("specification R1 paths must be null outside B-prime");
  }
  if (!Number.isInteger(specification.rerun) || specification.rerun < 1) fail("specification.rerun must be a positive integer");
  if (!arms.has(specification.arm)) fail("specification.arm is invalid");
  if (!commitHash.test(specification.evaluation_repository_commit)) fail("specification.evaluation_repository_commit must be a commit SHA");
  if (specification.evaluation_repository_commit === PINNED_BASE_REPOSITORY_COMMIT) fail("specification.evaluation_repository_commit must not use the pre-policy base commit");
  try { new RegExp(specification.test_command_pattern); } catch { fail("specification.test_command_pattern must be a valid regular expression"); }
  return specification;
}

function armArguments(specification, { cwd, pluginDirectory, sessionDirectory, prompt }) {
  const common = ["-p", prompt, "--mode", "json", "--auto-approve", "--no-rules", "--no-extensions", "--model", specification.model, "--thinking", specification.thinking, "--max-time", specification.max_time, "--cwd", cwd, "--session-dir", sessionDirectory];
  if (specification.arm === "A") return [...common, "--no-skills"];
  return [...common, "--skills", "ompstack", "--plugin-dir", pluginDirectory];
}

async function runCommand(executable, argumentsList, cwd) {
  const process = Bun.spawn([executable, ...argumentsList], { cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited]);
  return { stdout, stderr, exit_code: exitCode };
}

async function gitCommit(directory) {
  const result = await runCommand("git", ["-C", directory, "rev-parse", "HEAD"], directory);
  if (result.exit_code !== 0 || !commitHash.test(result.stdout.trim())) {
    fail(`cannot resolve Git commit for evaluation plugin directory ${directory}`);
  }
  return result.stdout.trim();
}
async function onlySession(sessionDirectory) {
  const entries = (await readdir(sessionDirectory, { withFileTypes: true })).filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"));
  if (entries.length !== 1) fail(`expected exactly one session JSONL in ${sessionDirectory}`);
  return resolve(sessionDirectory, entries[0].name);
}
function sessionEvents(sessionText) {
  return sessionText.trim().split("\n").filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); } catch { fail(`session JSONL line ${index + 1} is not JSON`); }
  });
}
function textBytes(content) { return Array.isArray(content) ? content.reduce((total, item) => total + (typeof item?.text === "string" ? Buffer.byteLength(item.text) : 0), 0) : 0; }

export function collectTelemetry(events, testCommandPattern) {
  const testPattern = new RegExp(testCommandPattern);
  const tokens = { input: 0, output: 0, cache_read: 0, cache_write: 0, total: 0 };
  const by_tool = {};
  let model_turns = 0;
  let captured_output_bytes = 0;
  let test_command_reinvocations = 0;
  let compaction_events = 0;
  let pruning_events = 0;
  for (const event of events) {
    if (event.type === "message" && event.message?.role === "assistant") {
      const usage = event.message.usage;
      if (usage) {
        model_turns += 1;
        tokens.input += usage.input ?? 0;
        tokens.output += usage.output ?? 0;
        tokens.cache_read += usage.cacheRead ?? 0;
        tokens.cache_write += usage.cacheWrite ?? 0;
        tokens.total += usage.totalTokens ?? ((usage.input ?? 0) + (usage.output ?? 0) + (usage.cacheRead ?? 0) + (usage.cacheWrite ?? 0));
      }
      for (const item of event.message.content ?? []) if (item.type === "toolCall") by_tool[item.name] = (by_tool[item.name] ?? 0) + 1;
    }
    if (event.type === "message" && event.message?.role === "toolResult") captured_output_bytes += textBytes(event.message.content);
    if (event.type === "custom" && event.customType === "tool_execution_start" && event.data?.toolName === "bash") {
      testPattern.lastIndex = 0;
      if (testPattern.test(event.data.args?.command ?? "")) test_command_reinvocations += 1;
    }
    if (event.type === "custom" && /compact/i.test(event.customType ?? "")) compaction_events += 1;
    if ((event.type === "custom" && /prun/i.test(event.customType ?? "")) || event.prunedAt) pruning_events += 1;
  }
  return { model_turns, tokens, tool_invocations: { total: Object.values(by_tool).reduce((sum, count) => sum + count, 0), by_tool, captured_output_bytes }, test_command_reinvocations, compaction_events, pruning_events };
}
function mergeTelemetry(records, wall_time_ms) {
  const merged = { model_turns: 0, tokens: { input: 0, output: 0, cache_read: 0, cache_write: 0, total: 0 }, tool_invocations: { total: 0, by_tool: {}, captured_output_bytes: 0 }, test_command_reinvocations: 0, compaction_events: 0, pruning_events: 0, wall_time_ms };
  for (const record of records) {
    merged.model_turns += record.model_turns;
    for (const key of Object.keys(merged.tokens)) merged.tokens[key] += record.tokens[key];
    merged.tool_invocations.total += record.tool_invocations.total;
    merged.tool_invocations.captured_output_bytes += record.tool_invocations.captured_output_bytes;
    for (const [tool, count] of Object.entries(record.tool_invocations.by_tool)) merged.tool_invocations.by_tool[tool] = (merged.tool_invocations.by_tool[tool] ?? 0) + count;
    merged.test_command_reinvocations += record.test_command_reinvocations;
    merged.compaction_events += record.compaction_events;
    merged.pruning_events += record.pruning_events;
  }
  return merged;
}
function preflightProof(events) {
  const call = events.flatMap((event) => event.type === "message" && event.message?.role === "assistant" ? event.message.content ?? [] : []).find((item) => item.type === "toolCall" && item.name === "read" && item.arguments?.path === "skill://ompstack");
  return Boolean(call && events.some((event) => event.type === "message" && event.message?.role === "toolResult" && event.message.toolCallId === call.id && event.message.toolName === "read" && event.message.content?.some((item) => typeof item.text === "string" && item.text.includes("# ompstack"))));
}
function outputInstructions(path, arm) {
  return `\n\nEvaluation artifact protocol: after completing the task, write only this arm's structured output JSON to [${path}]. Arm ${arm} must not add wrapper fields; the harness adds identity and telemetry.`;
}

/** Runs one fresh arm artifact, including Phase-0 telemetry from every model session. */
export async function runReconstructionArm({ specification, root = process.cwd() }) {
  const spec = validateSpecification(specification);
  const cwd = resolve(root, spec.cwd);
  const sessionDirectory = resolve(root, spec.session_directory);
  const outputPath = resolve(cwd, spec.output_path);
  const artifactPath = resolve(root, spec.artifact_path);
  const pluginDirectory = resolve(root, spec.plugin_directory);
  const r1Path = spec.r1_path && resolve(cwd, spec.r1_path);
  const r1FreezePath = spec.r1_freeze_path && resolve(cwd, spec.r1_freeze_path);
  const corpus = JSON.parse(await readFile(resolve(root, spec.corpus_path), "utf8"));
  if (await gitCommit(pluginDirectory) !== spec.evaluation_repository_commit) {
    fail("specification.evaluation_repository_commit does not match the evaluation plugin checkout");
  }
  await Promise.all([rm(outputPath, { force: true }), rm(sessionDirectory, { force: true, recursive: true }), ...(r1Path ? [rm(r1Path, { force: true }), rm(r1FreezePath, { force: true })] : [])]);
  await Promise.all([mkdir(sessionDirectory, { recursive: true }), mkdir(dirname(artifactPath), { recursive: true })]);
  const started = performance.now();
  const telemetryRecords = [];
  const invocation = { arm_arguments: null, session_paths: [], preflight: null, r1: null };

  const executeSession = async (name, prompt) => {
    const directory = resolve(sessionDirectory, name);
    await mkdir(directory, { recursive: true });
    const result = await runCommand(spec.omp_executable, armArguments(spec, { cwd, pluginDirectory, sessionDirectory: directory, prompt }), root);
    if (result.exit_code !== 0) fail(`${name} exited ${result.exit_code}: ${result.stderr}`);
    const sessionPath = await onlySession(directory);
    const events = sessionEvents(await readFile(sessionPath, "utf8"));
    telemetryRecords.push(collectTelemetry(events, spec.test_command_pattern));
    invocation.session_paths.push(sessionPath);
    return { result, events, sessionPath };
  };

  if (spec.arm !== "A") {
    const preflight = await executeSession("preflight", "Read skill://ompstack and reply exactly PREFLIGHT_OK.");
    const stdoutPath = `${artifactPath}.skill_preflight.stdout.jsonl`;
    await Bun.write(stdoutPath, preflight.result.stdout);
    if (!preflightProof(preflight.events)) fail("skill preflight failed to prove session-level ompstack resolution");
    invocation.preflight = { exit_code: preflight.result.exit_code, stdout_path: stdoutPath, session_path: preflight.sessionPath };
  }

  let r2 = null;
  if (spec.arm === "B-prime") {
    const r1 = await executeSession("r1", `${spec.prompt}\n\nB-prime R1 protocol: reconstruct only the strict requirement map and write it to [${spec.r1_path}].${outputInstructions(spec.r1_path, "B-prime R1")}`);
    const map = JSON.parse(await readFile(r1Path, "utf8"));
    validateReconstruction(map);
    const freezeRecord = await persistFrozenReconstruction(map, { artifact_path: spec.r1_path, freeze_record_path: spec.r1_freeze_path, state_identity: spec.state_identity, root: cwd });
    r2 = { frozen_map: map, freeze_record: freezeRecord, expected_digest: freezeRecord.artifact_digest, state_identity: spec.state_identity };
    invocation.r1 = { artifact_path: r1Path, freeze_record_path: r1FreezePath, artifact_digest: freezeRecord.artifact_digest, session_path: r1.sessionPath };
    await rm(outputPath, { force: true });
    await executeSession("r2", `${spec.prompt}\n\nB-prime R2 protocol: read the frozen R1 map at [${spec.r1_path}] without rewriting it, then write only R2 findings/closeout JSON to [${spec.output_path}].`);
    verifyFrozenReconstruction(JSON.parse(await readFile(r1Path, "utf8")), freezeRecord, {
      expected_digest: freezeRecord.artifact_digest,
      state_identity: spec.state_identity,
    });
  } else {
    await executeSession("task", `${spec.prompt}${outputInstructions(spec.output_path, spec.arm)}`);
  }

  const run = { family_id: spec.family_id, twin_id: spec.twin_id, rerun: spec.rerun, arm: spec.arm, evaluation_repository_commit: spec.evaluation_repository_commit, output: JSON.parse(await readFile(outputPath, "utf8")), ...(r2 ? { r2 } : {}) };
  validateEvaluationRuns(corpus, [run], { expectedStateIdentity: spec.state_identity });
  invocation.arm_arguments = armArguments(spec, { cwd, pluginDirectory, sessionDirectory: "<per-session directory>", prompt: "<redacted task prompt>" });
  const artifact = { schema_version: 1, run, telemetry: mergeTelemetry(telemetryRecords, performance.now() - started), invocation };
  await writeJsonAtomically(artifactPath, artifact);
  return artifact;
}

if (import.meta.main) {
  const specificationPath = process.argv[2];
  if (!specificationPath) fail("usage: bun scripts/run-reconstruction-arm.mjs <specification.json>");
  console.log(JSON.stringify(await runReconstructionArm({ specification: JSON.parse(await readFile(specificationPath, "utf8")), root: dirname(resolve(specificationPath)) })));
}
