import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "bun:test";
import { executeVerification } from "../scripts/run-verification-contract.mjs";

const oracleProgram = `
const failed = Number(process.env.TEST_FAILED ?? "0");
const testsExecuted = Number(process.env.TESTS_EXECUTED ?? "1");
if (process.env.MUTATE_CANDIDATE) await Bun.write("candidate.txt", "changed");
if (process.env.MUTATE_PROTECTED) await Bun.write("protected.txt", "changed");
if (process.env.PRINT_OUTPUT) console.log("x".repeat(Number(process.env.PRINT_OUTPUT)));
await Bun.write(process.env.OMPSTACK_ORACLE_RESULT_PATH, JSON.stringify({ schemaVersion: 1, status: "complete", testsExecuted, failed }));
process.exit(failed > 0 ? 1 : 0);
`;

async function withWorkspace(callback) {
  const workspace = await mkdtemp(join(tmpdir(), "ompstack-contract-"));
  await Promise.all([
    writeFile(join(workspace, "candidate.txt"), "candidate"),
    writeFile(join(workspace, "protected.txt"), "protected"),
  ]);
  try {
    await callback(workspace);
  } finally {
    await rm(workspace, { force: true, recursive: true });
  }
}

function contract(env = {}) {
  return {
    candidatePaths: ["candidate.txt"],
    command: {
      argv: [process.execPath, "-e", oracleProgram],
      env,
    },
    maxOutputBytes: 512,
    oracle: { minimumTests: 1, resultSchemaVersion: 1 },
    protectedPaths: ["protected.txt"],
    schemaVersion: 2,
    timeoutMs: 1_000,
    trustLevel: "convenience",
  };
}

test("verification runner accepts a complete positive oracle result", async () => {
  await withWorkspace(async (workspace) => {
    const result = await executeVerification({
      attemptId: "positive",
      contract: contract(),
      evidenceDirectory: join(workspace, "evidence"),
      root: workspace,
    });

    assert.equal(result.executionState, "COMPLETED");
    assert.equal(result.integrity, "VALID");
    assert.equal(result.verdict, "VERIFIED");
    assert.equal(result.oracleResult.testsExecuted, 1);
    const evidence = JSON.parse(await readFile(result.evidencePath, "utf8"));
    assert.equal(evidence.verdict, "VERIFIED");
  });
});

test("verification runner distinguishes predicate failures from inconclusive executions", async () => {
  await withWorkspace(async (workspace) => {
    const failed = await executeVerification({
      attemptId: "failed",
      contract: contract({ TEST_FAILED: "1" }),
      evidenceDirectory: join(workspace, "evidence"),
      root: workspace,
    });
    assert.equal(failed.verdict, "NOT_VERIFIED");
    assert.deepEqual(failed.reasonCodes, ["oracle_predicate_failed"]);

    const zeroTests = await executeVerification({
      attemptId: "zero-tests",
      contract: contract({ TESTS_EXECUTED: "0" }),
      evidenceDirectory: join(workspace, "evidence"),
      root: workspace,
    });
    assert.equal(zeroTests.verdict, "INCONCLUSIVE");
    assert.deepEqual(zeroTests.reasonCodes, ["oracle_executed_too_few_tests"]);
  });
});

test("verification runner rejects mutated candidates, protected paths, timeouts, and truncated output", async () => {
  await withWorkspace(async (workspace) => {
    const mutatedCandidate = await executeVerification({
      attemptId: "candidate-mutation",
      contract: contract({ MUTATE_CANDIDATE: "1" }),
      evidenceDirectory: join(workspace, "evidence"),
      root: workspace,
    });
    assert.equal(mutatedCandidate.integrity, "VIOLATED");
    assert.equal(mutatedCandidate.verdict, "INCONCLUSIVE");

    await writeFile(join(workspace, "candidate.txt"), "candidate");
    const mutatedProtected = await executeVerification({
      attemptId: "protected-mutation",
      contract: contract({ MUTATE_PROTECTED: "1" }),
      evidenceDirectory: join(workspace, "evidence"),
      root: workspace,
    });
    assert.equal(mutatedProtected.integrity, "VIOLATED");
    assert.equal(mutatedProtected.verdict, "INCONCLUSIVE");

    await writeFile(join(workspace, "protected.txt"), "protected");
    const truncated = await executeVerification({
      attemptId: "truncated",
      contract: { ...contract({ PRINT_OUTPUT: "1024" }), maxOutputBytes: 16 },
      evidenceDirectory: join(workspace, "evidence"),
      root: workspace,
    });
    assert.equal(truncated.verdict, "INCONCLUSIVE");
    assert.deepEqual(truncated.reasonCodes, ["command_output_truncated"]);

    const timedOut = await executeVerification({
      attemptId: "timeout",
      contract: {
        ...contract(),
        command: { argv: [process.execPath, "-e", "await new Promise(() => {})"] },
        timeoutMs: 20,
      },
      evidenceDirectory: join(workspace, "evidence"),
      root: workspace,
    });
    assert.equal(timedOut.executionState, "TIMEOUT");
    assert.equal(timedOut.verdict, "INCONCLUSIVE");
  });
});
