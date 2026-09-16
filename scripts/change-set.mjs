import { createHash } from "node:crypto";
import { lstat, readFile, readlink } from "node:fs/promises";
import { resolve } from "node:path";

function fail(message) {
  throw new Error(`change set: ${message}`);
}

async function runGit(root, args) {
  const process = Bun.spawn(["git", "-C", root, ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  if (exitCode !== 0) fail(`${args.join(" ")} failed: ${stderr.trim()}`);
  return stdout;
}

function parseNameStatus(output) {
  const fields = output.split("\0");
  fields.pop();
  const changes = [];
  for (let index = 0; index < fields.length;) {
    const status = fields[index++];
    const kind = status[0];
    if (!kind) fail("empty name-status entry");
    const sourcePath = fields[index++];
    if (!sourcePath) fail(`missing path for ${status}`);
    const path = kind === "R" || kind === "C" ? fields[index++] : sourcePath;
    if (!path) fail(`missing destination path for ${status}`);
    const changeType = {
      A: "added",
      M: "modified",
      D: "deleted",
      R: "renamed",
      C: "copied",
      T: "modified",
    }[kind];
    if (!changeType) fail(`unsupported Git change status: ${status}`);
    changes.push({ path, changeType });
  }
  return changes;
}

function parseNumstat(output) {
  const fields = output.split("\0");
  fields.pop();
  const entries = new Map();
  for (let index = 0; index < fields.length;) {
    const record = fields[index++];
    const firstTab = record.indexOf("\t");
    const secondTab = record.indexOf("\t", firstTab + 1);
    if (firstTab <= 0 || secondTab <= firstTab + 1) fail(`malformed numstat record: ${record}`);
    const added = record.slice(0, firstTab);
    const deleted = record.slice(firstTab + 1, secondTab);
    const pathField = record.slice(secondTab + 1);
    const sourcePath = pathField === "" ? fields[index++] : null;
    const path = pathField === "" ? fields[index++] : pathField;
    if (!/^(?:\d+|-)$/.test(added) || !/^(?:\d+|-)$/.test(deleted) || !path || (pathField === "" && !sourcePath)) {
      fail(`malformed numstat record: ${record}`);
    }
    entries.set(path, {
      binary: added === "-" || deleted === "-",
      addedLines: added === "-" ? 0 : Number(added),
      deletedLines: deleted === "-" ? 0 : Number(deleted),
    });
  }
  return entries;
}

function isMissing(error) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

async function untrackedStatistics(root, path) {
  const fullPath = resolve(root, path);
  try {
    if ((await lstat(fullPath)).isSymbolicLink()) return { binary: false, addedLines: 0 };
    const bytes = await readFile(fullPath);
    let addedLines = bytes.length === 0 ? 0 : 1;
    for (const byte of bytes) if (byte === 10) addedLines += 1;
    return { binary: bytes.includes(0), addedLines };
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

async function contentDigest(root, path) {
  const fullPath = resolve(root, path);
  try {
    if ((await lstat(fullPath)).isSymbolicLink()) return createHash("sha256").update(`symlink:${await readlink(fullPath)}`).digest("hex");
    return createHash("sha256").update(await readFile(fullPath)).digest("hex");
  } catch (error) {
    if (isMissing(error)) fail(`working-tree snapshot changed while reading ${path}`);
    throw error;
  }
}

/** Hashes the exact current content of a collected working-tree change set. */
export async function digestChangeSet({ changeSet, root = process.cwd() }) {
  const repositoryRoot = resolve(root);
  const snapshot = await Promise.all(changeSet.map(async (change) => ({
    ...change,
    contentDigest: change.changeType === "deleted" ? null : await contentDigest(repositoryRoot, change.path),
  })));
  return createHash("sha256").update(stable(snapshot)).digest("hex");
}

/** Collects declared revision changes plus current untracked files, optionally including the checked-out working tree. */
export async function collectChangeSet({ base, head, root = process.cwd(), workingTree = false }) {
  if (typeof base !== "string" || base.length === 0 || typeof head !== "string" || head.length === 0 || typeof workingTree !== "boolean") {
    fail("base and head must be non-empty Git revisions and workingTree must be boolean");
  }
  const repositoryRoot = resolve(root);
  const [untracked, revision] = await Promise.all([
    runGit(repositoryRoot, ["ls-files", "--others", "--exclude-standard", "-z"]),
    workingTree
      ? Promise.all([
          runGit(repositoryRoot, ["merge-base", base, head]),
          runGit(repositoryRoot, ["rev-parse", "HEAD"]),
          runGit(repositoryRoot, ["rev-parse", head]),
        ])
      : Promise.resolve([`${base}...${head}`]),
  ]);
  let diffTarget;
  if (workingTree) {
    const [mergeBase, currentHead, declaredHead] = revision;
    if (currentHead.trim() !== declaredHead.trim()) fail("head must resolve to the checked-out HEAD for a working-tree snapshot");
    diffTarget = mergeBase.trim();
    if (!diffTarget) fail("could not resolve merge base");
  } else {
    [diffTarget] = revision;
  }
  const [nameStatus, numstat] = await Promise.all([
    runGit(repositoryRoot, ["diff", "--name-status", "-z", "--find-renames", "--find-copies", diffTarget]),
    runGit(repositoryRoot, ["diff", "--numstat", "-z", "--find-renames", "--find-copies", diffTarget]),
  ]);
  const statistics = parseNumstat(numstat);
  const changed = parseNameStatus(nameStatus).map((entry) => ({
    ...entry,
    ...(statistics.get(entry.path) ?? { binary: false, addedLines: 0, deletedLines: 0 }),
  }));
  const knownPaths = new Set(changed.map((entry) => entry.path));
  for (const path of untracked.split("\0")) {
    if (!path || knownPaths.has(path)) continue;
    const statistics = await untrackedStatistics(repositoryRoot, path);
    if (!statistics) continue;
    changed.push({
      path,
      changeType: "untracked",
      ...statistics,
      deletedLines: 0,
    });
  }
  return changed.sort((left, right) => left.path.localeCompare(right.path));
}
