import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  captureSnapshot,
  executeVerification,
  sha256,
  stableJson,
  writeJsonAtomically,
} from "./run-verification-contract.mjs";

const MAX_FEEDBACK_BYTES = 12_000;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertPlainObject(value, label) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
}

function assertWorker(worker, label) {
  assertPlainObject(worker, label);
  assert(Array.isArray(worker.argv) && worker.argv.length > 0, `${label}.argv must be a non-empty array`);
  for (const argument of worker.argv) assert(typeof argument === "string" && argument.length > 0, `${label}.argv must contain strings`);
  assert(Number.isInteger(worker.timeoutMs) && worker.timeoutMs > 0, `${label}.timeoutMs must be a positive integer`);
  if (worker.env !== undefined) {
    assertPlainObject(worker.env, `${label}.env`);
    for (const [key, value] of Object.entries(worker.env)) {
      assert(typeof key === "string" && key.length > 0 && typeof value === "string", `${label}.env must contain string pairs`);
    }
  }
}

function validateSpecification(specification) {
  assertPlainObject(specification, "orchestration spec");
  assert(specification.schemaVersion === 1, "orchestration spec schemaVersion must be 1");
  assert(Number.isInteger(specification.maxAttempts) && specification.maxAttempts >= 1 && specification.maxAttempts <= 2, "maxAttempts must be 1 or 2");
  assert(typeof specification.candidateRoot === "string" && specification.candidateRoot.length > 0, "candidateRoot must be a path");
  assert(typeof specification.contractPath === "string" && specification.contractPath.length > 0, "contractPath must be a path");
  assert(typeof specification.stateDirectory === "string" && specification.stateDirectory.length > 0, "stateDirectory must be a path");
  assertPlainObject(specification.workers, "workers");
  assertWorker(specification.workers.initial, "workers.initial");
  if (specification.workers.repair !== undefined) assertWorker(specification.workers.repair, "workers.repair");
}

async function captureTail(stream, maxBytes) {
  const chunks = [];
  let capturedBytes = 0;
  let totalBytes = 0;
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      chunks.push(value);
      capturedBytes += value.byteLength;
      while (capturedBytes > maxBytes) {
        const overflow = capturedBytes - maxBytes;
        if (chunks[0].byteLength <= overflow) {
          capturedBytes -= chunks.shift().byteLength;
        } else {
          chunks[0] = chunks[0].slice(overflow);
          capturedBytes -= overflow;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
  return {
    tail: new TextDecoder().decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)))),
    totalBytes,
  };
}

async function executeWorker({ worker, cwd, env }) {
  const process = Bun.spawn(worker.argv, { cwd, env: { ...env, ...worker.env }, stderr: "pipe", stdout: "pipe" });
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    process.kill();
  }, worker.timeoutMs);
  try {
    const [stderr, stdout, exitCode] = await Promise.all([
      captureTail(process.stderr, MAX_FEEDBACK_BYTES),
      captureTail(process.stdout, MAX_FEEDBACK_BYTES),
      process.exited,
    ]);
    return { exitCode, stderr, stdout, timedOut };
  } finally {
    clearTimeout(timeout);
  }
}

async function appendJournal(path, event) {
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`);
}

function repairFeedback(result) {
  return {
    executionState: result.executionState,
    oracle: result.oracleResult
      ? { failed: result.oracleResult.failed, testsExecuted: result.oracleResult.testsExecuted }
      : null,
    reasonCodes: result.reasonCodes,
    verdict: result.verdict,
  };
}

function resolveFromSpec(specificationPath, path) {
  return resolve(dirname(specificationPath), path);
}

export async function checkFreshness(run) {
  if (run.final?.verdict !== "VERIFIED") return { fresh: false, reason: "final_verdict_is_not_verified" };
  try {
    const contract = JSON.parse(await readFile(run.contractPath, "utf8"));
    if (sha256(stableJson(contract)) !== run.contractDigest) return { fresh: false, reason: "contract_changed" };
    const snapshot = await captureSnapshot(run.candidateRoot, run.candidatePaths);
    if (snapshot.digest !== run.final.candidateDigest) return { fresh: false, reason: "candidate_changed" };
    return { fresh: true, reason: null };
  } catch {
    return { fresh: false, reason: "freshness_inputs_unavailable" };
  }
}

export async function runOrchestratedTask({ specification, specificationPath, runId = randomUUID() }) {
  validateSpecification(specification);
  const absoluteSpecificationPath = resolve(specificationPath);
  const candidateRoot = resolveFromSpec(absoluteSpecificationPath, specification.candidateRoot);
  const contractPath = resolveFromSpec(absoluteSpecificationPath, specification.contractPath);
  const stateDirectory = resolveFromSpec(absoluteSpecificationPath, specification.stateDirectory);
  const contract = JSON.parse(await readFile(contractPath, "utf8"));
  const runDirectory = resolve(stateDirectory, runId);
  const journalPath = resolve(runDirectory, "journal.jsonl");
  const runPath = resolve(runDirectory, "run.json");
  const baseRun = {
    candidateRoot,
    contractDigest: sha256(stableJson(contract)),
    contractPath,
    candidatePaths: contract.candidatePaths,
    runId,
    schemaVersion: 1,
    specificationDigest: sha256(stableJson(specification)),
  };
  await appendJournal(journalPath, { state: "QUEUED", type: "state" });
  await writeJsonAtomically(runPath, { ...baseRun, final: null, status: "RUNNING" });

  let attemptNumber = 1;
  let worker = specification.workers.initial;
  let workerKind = "initial";
  let final = null;

  while (attemptNumber <= specification.maxAttempts) {
    await appendJournal(journalPath, { attemptNumber, state: "EXECUTING", type: "state", workerKind });
    let workerResult;
    try {
      workerResult = await executeWorker({
        cwd: candidateRoot,
        env: process.env,
        worker,
      });
    } catch (error) {
      workerResult = { error: error instanceof Error ? error.message : String(error) };
    }
    await appendJournal(journalPath, { attemptNumber, result: workerResult, state: "EXECUTED", type: "worker" });

    if (workerResult.error || workerResult.timedOut || workerResult.exitCode !== 0) {
      final = {
        candidateDigest: null,
        reasonCodes: [workerResult.error ? "worker_launch_failed" : workerResult.timedOut ? "worker_timed_out" : "worker_failed"],
        verdict: "INCONCLUSIVE",
      };
      await appendJournal(journalPath, { attemptNumber, final, state: "INCONCLUSIVE", type: "state" });
      break;
    }

    await appendJournal(journalPath, { attemptNumber, state: "ORACLE_RUNNING", type: "state" });
    const result = await executeVerification({
      attemptId: `${runId}-attempt-${attemptNumber}`,
      contract,
      evidenceDirectory: resolve(runDirectory, "evidence"),
      root: candidateRoot,
    });
    await appendJournal(journalPath, {
      attemptNumber,
      evidencePath: result.evidencePath,
      integrity: result.integrity,
      reasonCodes: result.reasonCodes,
      state: "ORACLE_COMPLETED",
      type: "oracle",
      verdict: result.verdict,
    });

    if (result.verdict === "VERIFIED") {
      final = {
        candidateDigest: result.snapshot.candidate.digest,
        evidencePath: result.evidencePath,
        reasonCodes: result.reasonCodes,
        verdict: "VERIFIED",
      };
      await appendJournal(journalPath, { attemptNumber, final, state: "VERIFIED", type: "state" });
      break;
    }

    if (result.verdict !== "NOT_VERIFIED") {
      final = {
        candidateDigest: result.snapshot.candidate.digest,
        evidencePath: result.evidencePath,
        reasonCodes: result.reasonCodes,
        verdict: "INCONCLUSIVE",
      };
      await appendJournal(journalPath, { attemptNumber, final, state: "INCONCLUSIVE", type: "state" });
      break;
    }

    if (!specification.workers.repair || attemptNumber === specification.maxAttempts) {
      final = {
        candidateDigest: result.snapshot.candidate.digest,
        evidencePath: result.evidencePath,
        reasonCodes: result.reasonCodes,
        verdict: "NOT_VERIFIED",
      };
      await appendJournal(journalPath, { attemptNumber, final, state: "EXHAUSTED", type: "state" });
      break;
    }

    const feedbackPath = resolve(runDirectory, `repair-${attemptNumber}.json`);
    await writeJsonAtomically(feedbackPath, repairFeedback(result));
    await appendJournal(journalPath, { attemptNumber, feedbackPath, state: "REPAIRING", type: "state" });
    worker = {
      ...specification.workers.repair,
      env: { ...specification.workers.repair.env, OMPSTACK_REPAIR_FEEDBACK_PATH: feedbackPath },
    };
    workerKind = "repair";
    attemptNumber += 1;
  }

  const run = { ...baseRun, final, journalPath, runPath, status: final.verdict };
  await writeJsonAtomically(runPath, run);
  const freshness = await checkFreshness(run);
  await appendJournal(journalPath, { freshness, state: freshness.fresh ? "FRESH" : "STALE", type: "freshness" });
  return { ...run, freshness };
}

function parseCli(argumentsList) {
  if (argumentsList[0] === "--check" && argumentsList[1] && argumentsList.length === 2) return { checkPath: argumentsList[1] };
  if (argumentsList[0] === "--spec" && argumentsList[1] && argumentsList.length === 2) return { specificationPath: argumentsList[1] };
  throw new Error("usage: --spec <path> | --check <run.json>");
}

if (import.meta.main) {
  const options = parseCli(process.argv.slice(2));
  if (options.checkPath) {
    const run = JSON.parse(await readFile(resolve(options.checkPath), "utf8"));
    const freshness = await checkFreshness(run);
    console.log(JSON.stringify(freshness, null, 2));
    if (!freshness.fresh) process.exitCode = 1;
  } else {
    const specificationPath = resolve(options.specificationPath);
    const specification = JSON.parse(await readFile(specificationPath, "utf8"));
    const run = await runOrchestratedTask({ specification, specificationPath });
    console.log(JSON.stringify(run, null, 2));
    if (!run.freshness.fresh) process.exitCode = 1;
  }
}
