import { access, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

import { SIGNAL_FLAGS, validateSignalPolicy } from "./routing/collect-signals.mjs";
import { loadPolicy } from "./policy.mjs";

const IGNORED_DIRECTORIES = new Set([".git", ".omp", "node_modules"]);
const ALL_FLAGS = Object.freeze([...SIGNAL_FLAGS].sort());
const USAGE = "usage: bun scripts/init-overlay.mjs --repo <absolute-path> [--force] [--dry-run]";

function fail(message) {
  throw new Error(`init overlay: ${message}`);
}

function compareNames(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function escapePattern(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseArguments(argv) {
  let repository;
  let force = false;
  let dryRun = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--force" && !force) force = true;
    else if (argument === "--dry-run" && !dryRun) dryRun = true;
    else if (argument === "--repo" && repository === undefined && typeof argv[index + 1] === "string") repository = argv[++index];
    else fail(USAGE);
  }
  if (repository === undefined || !isAbsolute(repository)) fail(USAGE);
  return { repository, force, dryRun };
}

async function scanRepository(root) {
  const files = [];
  const topDirectories = [];

  async function visit(directory, relativeDirectory = "") {
    const entries = (await readdir(directory, { withFileTypes: true })).sort((left, right) => compareNames(left.name, right.name));
    for (const entry of entries) {
      const relativePath = relativeDirectory === "" ? entry.name : `${relativeDirectory}/${entry.name}`;
      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(entry.name)) continue;
        if (relativeDirectory === "") topDirectories.push(entry.name);
        await visit(join(directory, entry.name), relativePath);
      } else {
        files.push(relativePath);
      }
    }
  }

  await visit(root);
  return { files, topDirectories };
}

function rootFilesPattern(files) {
  const rootFiles = files.filter((path) => !path.includes("/")).sort(compareNames);
  return rootFiles.length === 0 ? null : `^(?:${rootFiles.map(escapePattern).join("|")})$`;
}

function heuristicFlags(path, rules) {
  const flags = new Set();
  for (const rule of rules) {
    if (rule.pattern.test(path)) for (const flag of rule.flags) flags.add(flag);
  }
  return [...flags].sort(compareNames);
}

function buildOverlay({ files, topDirectories, heuristics }) {
  const knownPathPatterns = topDirectories.map((directory) => `^${escapePattern(directory)}/`);
  const rootPattern = rootFilesPattern(files);
  if (rootPattern !== null) knownPathPatterns.push(rootPattern);
  knownPathPatterns.sort(compareNames);

  const ordinaryRules = topDirectories.map((directory) => ({
    id: `ordinary-${directory}`,
    pathPattern: `^${escapePattern(directory)}/`,
    flags: [],
    knownFlags: [...ALL_FLAGS],
    reviewed: false,
  }));
  const hitRules = files.flatMap((path) => {
    const flags = heuristicFlags(path, heuristics.distinctive);
    const uncertainFlags = heuristicFlags(path, heuristics.common);
    const coveredFlags = new Set([...flags, ...uncertainFlags]);
    return coveredFlags.size === 0 ? [] : [{
      id: `heuristic-${path}`,
      pathPattern: `^${escapePattern(path)}$`,
      flags,
      knownFlags: ALL_FLAGS.filter((flag) => !coveredFlags.has(flag)),
      reviewed: false,
    }];
  });

  return {
    overlay: {
      schemaVersion: 1,
      knownPathPatterns,
      pathRules: [...ordinaryRules, ...hitRules],
    },
    hitCount: hitRules.length,
  };
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

async function main(argv) {
  const { repository, force, dryRun } = parseArguments(argv);
  let repositoryStat;
  try {
    repositoryStat = await stat(repository);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") fail(`repository does not exist: ${repository}`);
    throw error;
  }
  if (!repositoryStat.isDirectory()) fail(`repository is not a directory: ${repository}`);

  const outputPath = join(repository, ".omp", "ompstack-routing.json");
  if (!dryRun && !force && await pathExists(outputPath)) fail(`${outputPath} already exists; pass --force to replace it`);

  const scanned = await scanRepository(repository);
  const signalPolicy = validateSignalPolicy(await loadPolicy("signals"));
  const { overlay, hitCount } = buildOverlay({ ...scanned, heuristics: signalPolicy.overlayHeuristics });
  const output = `${JSON.stringify(overlay, null, 2)}\n`;
  if (dryRun) process.stdout.write(output);
  else {
    await mkdir(join(repository, ".omp"), { recursive: true });
    await writeFile(outputPath, output);
  }
  console.error(`scanned ${scanned.files.length} files; top-level directories ${scanned.topDirectories.length}; generated ${overlay.pathRules.length} rules; paths requiring confirmation ${hitCount}`);
}

await main(Bun.argv.slice(2)).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
