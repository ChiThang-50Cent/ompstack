import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  readlink,
  readdir,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

const TRUST_LEVELS = new Set(["convenience", "isolated", "ci-attested"]);
const RESULT_ENVIRONMENT_VARIABLE = "OMPSTACK_ORACLE_RESULT_PATH";
const MAX_ORACLE_RESULT_BYTES = 1_048_576;

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertPlainObject(value, label) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
}

function assertStringArray(value, label, { allowEmpty = false } = {}) {
  assert(Array.isArray(value) && (allowEmpty || value.length > 0), `${label} must be a non-empty array`);
  for (const entry of value) assert(typeof entry === "string" && entry.length > 0, `${label} entries must be non-empty strings`);
}

function resolveInside(root, path, label) {
  assert(typeof path === "string" && path.length > 0, `${label} must be a non-empty path`);
  assert(!isAbsolute(path), `${label} must be relative to the candidate root`);
  const resolved = resolve(root, path);
  assert(resolved === root || resolved.startsWith(`${root}/`), `${label} escapes the candidate root`);
  return resolved;
}

function validateContract(contract) {
  assertPlainObject(contract, "contract");
  assert(contract.schemaVersion === 2, "contract.schemaVersion must be 2");
  assertStringArray(contract.candidatePaths, "contract.candidatePaths");
  assertStringArray(contract.protectedPaths, "contract.protectedPaths", { allowEmpty: true });
  assertPlainObject(contract.command, "contract.command");
  assertStringArray(contract.command.argv, "contract.command.argv");
  assert(Number.isInteger(contract.timeoutMs) && contract.timeoutMs > 0, "contract.timeoutMs must be a positive integer");
  assert(Number.isInteger(contract.maxOutputBytes) && contract.maxOutputBytes > 0, "contract.maxOutputBytes must be a positive integer");
  assert(TRUST_LEVELS.has(contract.trustLevel), "contract.trustLevel is invalid");
  assertPlainObject(contract.oracle, "contract.oracle");
  assert(contract.oracle.resultSchemaVersion === 1, "contract.oracle.resultSchemaVersion must be 1");
  assert(Number.isInteger(contract.oracle.minimumTests) && contract.oracle.minimumTests > 0, "contract.oracle.minimumTests must be a positive integer");
  if (contract.command.cwd !== undefined) assert(typeof contract.command.cwd === "string", "contract.command.cwd must be a string");
  if (contract.command.env !== undefined) {
    assertPlainObject(contract.command.env, "contract.command.env");
    for (const [key, value] of Object.entries(contract.command.env)) {
      assert(typeof key === "string" && key.length > 0 && typeof value === "string", "contract.command.env must contain string pairs");
    }
  }
}

async function snapshotPath(root, path) {
  const absolutePath = resolveInside(root, path, "snapshot path");
  const entries = [];

  async function visit(currentPath, currentRelativePath) {
    let metadata;
    try {
      metadata = await lstat(currentPath);
    } catch (error) {
      if (error && error.code === "ENOENT") {
        entries.push({ path: currentRelativePath, type: "missing" });
        return;
      }
      throw error;
    }

    if (metadata.isSymbolicLink()) {
      entries.push({ path: currentRelativePath, target: await readlink(currentPath), type: "symlink" });
      return;
    }
    if (metadata.isFile()) {
      entries.push({ digest: sha256(await readFile(currentPath)), path: currentRelativePath, type: "file" });
      return;
    }
    if (metadata.isDirectory()) {
      entries.push({ path: currentRelativePath, type: "directory" });
      const children = (await readdir(currentPath)).sort((left, right) => left.localeCompare(right));
      for (const child of children) {
        await visit(join(currentPath, child), join(currentRelativePath, child));
      }
      return;
    }
    entries.push({ path: currentRelativePath, type: "other" });
  }

  await visit(absolutePath, path);
  return entries;
}

export async function captureSnapshot(root, paths) {
  const normalizedPaths = [...new Set(paths)].sort((left, right) => left.localeCompare(right));
  const entries = [];
  for (const path of normalizedPaths) entries.push(...(await snapshotPath(root, path)));
  const manifest = { entries, paths: normalizedPaths };
  return { digest: sha256(stableJson(manifest)), manifest };
}

async function collectOutput(stream, maxBytes) {
  const chunks = [];
  let capturedBytes = 0;
  let totalBytes = 0;
  let truncated = false;
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (capturedBytes < maxBytes) {
        const remaining = maxBytes - capturedBytes;
        const captured = value.byteLength <= remaining ? value : value.slice(0, remaining);
        chunks.push(captured);
        capturedBytes += captured.byteLength;
        truncated ||= captured.byteLength !== value.byteLength;
      } else {
        truncated = true;
      }
    }
  } finally {
    reader.releaseLock();
  }
  return {
    capturedBytes,
    text: new TextDecoder().decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)))),
    totalBytes,
    truncated,
  };
}

async function runCommand({ argv, cwd, env, maxOutputBytes, timeoutMs }) {
  const process = Bun.spawn(argv, { cwd, env, stderr: "pipe", stdout: "pipe" });
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    process.kill();
  }, timeoutMs);

  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      collectOutput(process.stdout, maxOutputBytes),
      collectOutput(process.stderr, maxOutputBytes),
      process.exited,
    ]);
    return { exitCode, stderr, stdout, timedOut };
  } finally {
    clearTimeout(timeout);
  }
}

async function readOracleResult(path) {
  try {
    const resultMetadata = await stat(path);
    if (resultMetadata.size > MAX_ORACLE_RESULT_BYTES) return { error: "oracle_result_too_large" };
    const bytes = await readFile(path);
    const value = JSON.parse(bytes.toString("utf8"));
    assertPlainObject(value, "oracle result");
    if (value.schemaVersion !== 1) return { error: "oracle_result_schema_mismatch" };
    if (value.status !== "complete") return { error: "oracle_result_not_complete" };
    if (!Number.isInteger(value.testsExecuted) || value.testsExecuted < 0) return { error: "oracle_result_invalid_test_count" };
    if (!Number.isInteger(value.failed) || value.failed < 0) return { error: "oracle_result_invalid_failure_count" };
    return { digest: sha256(bytes), value };
  } catch (error) {
    if (error && error.code === "ENOENT") return { error: "oracle_result_missing" };
    if (error instanceof SyntaxError) return { error: "oracle_result_malformed" };
    return { error: "oracle_result_unreadable" };
  }
}

export async function writeJsonAtomically(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporaryPath, path);
}

export async function executeVerification({ contract, root = process.cwd(), evidenceDirectory, attemptId = randomUUID() }) {
  validateContract(contract);
  const candidateRoot = resolve(root);
  for (const path of [...contract.candidatePaths, ...contract.protectedPaths]) resolveInside(candidateRoot, path, "contract path");
  const evidenceRoot = resolve(evidenceDirectory ?? join(candidateRoot, ".ompstack", "evidence"));
  await mkdir(evidenceRoot, { recursive: true });
  const startedAt = new Date().toISOString();
  const contractDigest = sha256(stableJson(contract));
  const oracleDigest = sha256(stableJson({ argv: contract.command.argv, oracle: contract.oracle }));
  const candidateBefore = await captureSnapshot(candidateRoot, contract.candidatePaths);
  const protectedBefore = await captureSnapshot(candidateRoot, contract.protectedPaths);
  const oracleResultPath = join(evidenceRoot, `${attemptId}.oracle-result.json`);
  const commandCwd = contract.command.cwd ? resolveInside(candidateRoot, contract.command.cwd, "contract.command.cwd") : candidateRoot;

  let command;
  try {
    command = await runCommand({
      argv: contract.command.argv,
      cwd: commandCwd,
      env: { ...process.env, ...contract.command.env, [RESULT_ENVIRONMENT_VARIABLE]: oracleResultPath },
      maxOutputBytes: contract.maxOutputBytes,
      timeoutMs: contract.timeoutMs,
    });
  } catch (error) {
    command = {
      error: error instanceof Error ? error.message : String(error),
      exitCode: null,
      stderr: { capturedBytes: 0, text: "", totalBytes: 0, truncated: false },
      stdout: { capturedBytes: 0, text: "", totalBytes: 0, truncated: false },
      timedOut: false,
    };
  }

  const [candidateAfter, protectedAfter, oracle] = await Promise.all([
    captureSnapshot(candidateRoot, contract.candidatePaths),
    captureSnapshot(candidateRoot, contract.protectedPaths),
    readOracleResult(oracleResultPath),
  ]);
  const outputTruncated = command.stdout.truncated || command.stderr.truncated;
  const integrity = candidateBefore.digest === candidateAfter.digest && protectedBefore.digest === protectedAfter.digest ? "VALID" : "VIOLATED";
  const reasonCodes = [];
  let executionState = "COMPLETED";
  let verdict = "INCONCLUSIVE";

  if (command.error) {
    executionState = "ERROR";
    reasonCodes.push("command_launch_failed");
  } else if (command.timedOut) {
    executionState = "TIMEOUT";
    reasonCodes.push("command_timed_out");
  } else if (integrity !== "VALID") {
    reasonCodes.push("candidate_or_protected_paths_changed");
  } else if (outputTruncated) {
    reasonCodes.push("command_output_truncated");
  } else if (oracle.error) {
    reasonCodes.push(oracle.error);
  } else if (oracle.value.testsExecuted < contract.oracle.minimumTests) {
    reasonCodes.push("oracle_executed_too_few_tests");
  } else if (command.exitCode !== 0 && oracle.value.failed === 0) {
    reasonCodes.push("command_failed_without_oracle_failure");
  } else if (oracle.value.failed > 0) {
    verdict = "NOT_VERIFIED";
    reasonCodes.push("oracle_predicate_failed");
  } else if (command.exitCode === 0) {
    verdict = "VERIFIED";
  } else {
    reasonCodes.push("command_failed");
  }

  const result = {
    attemptId,
    candidatePaths: contract.candidatePaths,
    completedAt: new Date().toISOString(),
    contractDigest,
    executionState,
    integrity,
    oracleDigest,
    oracleResult: oracle.value ?? null,
    oracleResultDigest: oracle.digest ?? null,
    provenance: {
      command: contract.command.argv,
      cwd: relative(candidateRoot, commandCwd) || ".",
      runtime: { bun: Bun.version, executable: process.execPath, node: process.version },
      declaredTrustLevel: contract.trustLevel,
    },
    reasonCodes,
    snapshot: {
      candidate: candidateBefore,
      candidateAfter,
      protected: protectedBefore,
      protectedAfter,
    },
    startedAt,
    stream: { stderr: command.stderr, stdout: command.stdout },
    verdict,
  };
  const evidencePath = join(evidenceRoot, `${attemptId}.json`);
  await writeJsonAtomically(evidencePath, result);
  return { ...result, evidencePath };
}

function readCliArguments(argumentsList) {
  const options = {};
  for (let index = 0; index < argumentsList.length; index += 2) {
    const key = argumentsList[index];
    const value = argumentsList[index + 1];
    assert(key?.startsWith("--") && value, "usage: --contract <path> [--root <path>] [--evidence-dir <path>] [--attempt-id <id>");
    options[key.slice(2)] = value;
  }
  return options;
}

if (import.meta.main) {
  const options = readCliArguments(process.argv.slice(2));
  const contract = JSON.parse(await readFile(resolve(options.contract), "utf8"));
  const result = await executeVerification({
    attemptId: options["attempt-id"],
    contract,
    evidenceDirectory: options["evidence-dir"],
    root: options.root,
  });
  console.log(JSON.stringify(result, null, 2));
}
