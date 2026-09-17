import { access, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { classifyRoute } from "./routing/classify-route.mjs";
import { SIGNAL_FLAGS, collectSignals, loadSignalPolicy } from "./routing/collect-signals.mjs";
import { analyzeImportGraph } from "./routing/import-graph.mjs";
import { loadRoutingPolicy } from "./routing/policy.mjs";

const USAGE = "usage: bun scripts/eval-aacr.mjs --dataset PATH --workdir PATH [--limit N] [--language Go,Python] [--output FILE] [--resume]";
const SUPPORTED_LANGUAGES = Object.freeze({ Go: "go", Python: "python", TypeScript: "typescript", Java: "java" });
const SOURCE_EXTENSIONS = Object.freeze({ go: [".go"], python: [".py"], typescript: [".ts", ".tsx", ".mts", ".cts"], java: [".java"] });
const NEUTRAL_RISK_FACTS = Object.freeze({
  sharedSemanticBoundary: false,
  consumerFamilies: 1,
  executionModes: 1,
  graphTraversal: false,
  materialUnknown: false,
});
const LIMITATIONS = Object.freeze([
  "AACR-Bench has no clean-PR control group; this evaluation cannot measure or infer over-triage.",
  "Neutral fixed risk facts minimize assigned risk, so M1 is an upper bound on the real false-negative rate.",
]);
const INIT_OVERLAY = fileURLToPath(new URL("./init-overlay.mjs", import.meta.url));

function fail(message) {
  throw new Error(`AACR evaluation: ${message}`);
}

function plainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseArguments(argv) {
  let dataset;
  let workdir;
  let limit = null;
  let languages = null;
  let output = null;
  let resume = false;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--resume" && !resume) {
      resume = true;
      continue;
    }
    const value = argv[index + 1];
    if (typeof value !== "string") fail(USAGE);
    index += 1;
    if (flag === "--dataset" && dataset === undefined && value !== "") dataset = resolve(value);
    else if (flag === "--workdir" && workdir === undefined && value !== "") workdir = resolve(value);
    else if (flag === "--limit" && limit === null && /^\d+$/.test(value) && Number(value) > 0) limit = Number(value);
    else if (flag === "--language" && languages === null && value !== "") languages = new Set(value.split(",").map((entry) => entry.trim()).filter(Boolean));
    else if (flag === "--output" && output === null && value !== "") output = resolve(value);
    else fail(USAGE);
  }
  if (dataset === undefined || workdir === undefined || languages?.size === 0 || resume && output === null) fail(USAGE);
  return { dataset, workdir, limit, languages, output, resume };
}

async function run(command, args, { cwd } = {}) {
  const child = Bun.spawn([command, ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (exitCode !== 0) fail(`${command} ${args.join(" ")} failed${stderr.trim() === "" ? "" : `: ${stderr.trim()}`}`);
  return stdout;
}

function runGit(root, args) {
  return run("git", ["-C", root, ...args]);
}

function parseNameStatus(output) {
  const fields = output.split("\0");
  fields.pop();
  const changes = [];
  for (let index = 0; index < fields.length;) {
    const status = fields[index++];
    const kind = status[0];
    const sourcePath = fields[index++];
    const path = kind === "R" || kind === "C" ? fields[index++] : sourcePath;
    const changeType = { A: "added", M: "modified", D: "deleted", R: "renamed", C: "copied", T: "modified" }[kind];
    if (!changeType || !path) fail(`cannot parse name-status entry ${status}`);
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
    const added = record.slice(0, firstTab);
    const deleted = record.slice(firstTab + 1, secondTab);
    const pathField = record.slice(secondTab + 1);
    if (firstTab <= 0 || secondTab <= firstTab + 1) fail(`cannot parse numstat entry ${record}`);
    if (pathField === "") index += 1;
    const path = pathField === "" ? fields[index++] : pathField;
    if (!/^(?:\d+|-)$/.test(added) || !/^(?:\d+|-)$/.test(deleted) || !path) fail(`cannot parse numstat entry ${record}`);
    entries.set(path, {
      binary: added === "-" || deleted === "-",
      addedLines: added === "-" ? 0 : Number(added),
      deletedLines: deleted === "-" ? 0 : Number(deleted),
    });
  }
  return entries;
}

async function collectCommitChangeSet(repository, base, head) {
  const [nameStatus, numstat] = await Promise.all([
    runGit(repository, ["diff", "--name-status", "-z", "--find-renames", "--find-copies", base, head]),
    runGit(repository, ["diff", "--numstat", "-z", "--find-renames", "--find-copies", base, head]),
  ]);
  const statistics = parseNumstat(numstat);
  return parseNameStatus(nameStatus).map((change) => ({
    ...change,
    ...(statistics.get(change.path) ?? { binary: false, addedLines: 0, deletedLines: 0 }),
  }));
}

/** Maps one positive-sample comment set to the four benchmark label groups. */
export function labelsForComments(comments) {
  if (!Array.isArray(comments)) fail("sample comments must be an array");
  const categories = comments.map((comment) => comment?.category);
  return {
    security: categories.includes("Security Vulnerability"),
    defect: categories.includes("Code Defect"),
    repoLevel: comments.some((comment) => comment?.context === "Repo Level"),
    softOnly: comments.length > 0 && comments.every((comment) => ["Maintainability and Readability", "Performance"].includes(comment?.category)),
  };
}

/** Returns labeled paths absent from the target-parent change set. */
export function missingLabeledPaths(comments, changeSet) {
  if (!Array.isArray(comments) || !Array.isArray(changeSet)) fail("path-subset inputs must be arrays");
  const changedPaths = new Set(changeSet.map((change) => change?.path));
  return [...new Set(comments.map((comment) => comment?.path).filter((path) => typeof path === "string" && path !== "" && !changedPaths.has(path)))].sort();
}

function validateSamples(value) {
  if (!Array.isArray(value)) fail("dataset/positive_samples.json must contain an array");
  for (const [index, sample] of value.entries()) {
    if (!plainObject(sample) || typeof sample.project_main_language !== "string" || !/^[0-9a-f]{40}$/.test(sample.source_commit) || !/^[0-9a-f]{40}$/.test(sample.target_commit) || !/^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+$/.test(sample.githubPrUrl) || !Array.isArray(sample.comments)) {
      fail(`positive sample ${index} has an invalid shape`);
    }
  }
  return value;
}

function repositoryFor(sample) {
  const match = sample.githubPrUrl.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/pull\/\d+$/);
  return match[1];
}

function groupByRepository(samples) {
  const groups = new Map();
  for (const sample of samples) {
    const repository = repositoryFor(sample);
    if (!groups.has(repository)) groups.set(repository, []);
    groups.get(repository).push(sample);
  }
  return groups;
}

async function hasExtension(directory, extensions) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if ([".git", ".omp", "node_modules"].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isFile() && extensions.includes(extname(entry.name))) return true;
    if (entry.isDirectory() && await hasExtension(path, extensions)) return true;
  }
  return false;
}

async function inferSourceRoots(root, projectLanguage) {
  const sourceRoots = { go: [], python: [], typescript: [], java: [] };
  const graphLanguage = SUPPORTED_LANGUAGES[projectLanguage];
  if (graphLanguage === undefined) return sourceRoots;
  const extensions = SOURCE_EXTENSIONS[graphLanguage];
  const entries = await readdir(root, { withFileTypes: true });
  if (entries.some((entry) => entry.isFile() && extensions.includes(extname(entry.name)))) {
    sourceRoots[graphLanguage] = ["."];
    return sourceRoots;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || [".git", ".omp", "node_modules"].includes(entry.name)) continue;
    if (await hasExtension(join(root, entry.name), extensions)) sourceRoots[graphLanguage].push(entry.name);
  }
  sourceRoots[graphLanguage].sort();
  return sourceRoots;
}

function deriveTaskFacts(signals) {
  return { behaviorAffecting: signals.changedCodeFiles > 0 || SIGNAL_FLAGS.some((flag) => signals[flag] === true) };
}

async function generateOverlay(worktree) {
  await run(Bun.which("bun"), [INIT_OVERLAY, "--repo", worktree]);
}

async function resolveChangeSet(repositoryRoot, sample) {
  const fetched = await runGit(repositoryRoot, ["fetch", "--depth", "2", "origin", sample.target_commit, sample.source_commit])
    .then(() => true)
    .catch(() => false);
  if (!fetched) return { unavailable: true };

  const parent = (await runGit(repositoryRoot, ["rev-parse", `${sample.target_commit}^`])).trim();
  let changeSet = await collectCommitChangeSet(repositoryRoot, parent, sample.target_commit);
  let missingPaths = missingLabeledPaths(sample.comments, changeSet);
  if (missingPaths.length === 0) return { base: parent, baseStrategy: "target-parent", changeSet, missingPaths };

  for (const depth of [32, 128, 512, 2048]) {
    const deepened = await runGit(repositoryRoot, ["fetch", "--depth", String(depth), "origin", sample.target_commit, sample.source_commit])
      .then(() => true)
      .catch(() => false);
    if (!deepened) break;
    const mergeBase = await runGit(repositoryRoot, ["merge-base", sample.source_commit, sample.target_commit])
      .then((value) => value.trim())
      .catch(() => null);
    if (mergeBase === null) continue;
    changeSet = await collectCommitChangeSet(repositoryRoot, mergeBase, sample.target_commit);
    missingPaths = missingLabeledPaths(sample.comments, changeSet);
    return { base: mergeBase, baseStrategy: "merge-base-after-target-parent-mismatch", changeSet, missingPaths };
  }
  return { base: parent, baseStrategy: "target-parent", changeSet, missingPaths };
}

export async function classifySample(repository, repositoryRoot, sample, routingPolicy) {
  const resolved = await resolveChangeSet(repositoryRoot, sample);
  if (resolved.unavailable) {
    return { excluded: true, exclusionType: "commitUnavailable", prUrl: sample.githubPrUrl, language: sample.project_main_language, reason: "commit-unavailable" };
  }
  const { base, baseStrategy, changeSet, missingPaths } = resolved;
  if (missingPaths.length > 0) {
    return { excluded: true, exclusionType: "baseValidation", prUrl: sample.githubPrUrl, language: sample.project_main_language, reason: "labeled-paths-not-in-resolved-diff", baseStrategy, missingPaths };
  }

  const worktree = join(repositoryRoot, "worktree");
  try {
    await runGit(repositoryRoot, ["worktree", "add", "--detach", worktree, sample.target_commit]);
    await generateOverlay(worktree);
    const signalPolicy = await loadSignalPolicy({ root: worktree });
    const graphPolicy = { policyVersion: routingPolicy.policyVersion, sourceRoots: await inferSourceRoots(worktree, sample.project_main_language) };
    const [signals, graph] = await Promise.all([
      collectSignals({ root: worktree, changeSet, policy: signalPolicy }),
      analyzeImportGraph({ root: worktree, changeSet, policy: graphPolicy }),
    ]);
    const route = classifyRoute({ signals, graph, taskFacts: deriveTaskFacts(signals), riskFacts: NEUTRAL_RISK_FACTS, policy: routingPolicy });
    return {
      excluded: false,
      prUrl: sample.githubPrUrl,
      repository,
      language: sample.project_main_language,
      sourceCommit: sample.source_commit,
      targetCommit: sample.target_commit,
      baseCommit: base,
      baseStrategy,
      risk: route.risk,
      reasonCodes: [...route.reasonCodes],
      securityReviewRequired: route.securityReviewRequired,
      affectedModuleCount: graph.affectedModuleCount,
      graphStatus: graph.status,
      graphSourceRoots: graphPolicy.sourceRoots,
      labels: labelsForComments(sample.comments),
      overlay: { generated: true, reviewed: false },
    };
  } finally {
    await runGit(repositoryRoot, ["worktree", "remove", "--force", worktree]).catch(async () => {
      await rm(worktree, { recursive: true, force: true });
    });
  }
}

function ratio(numerator, denominator) {
  return { numerator, denominator, rate: denominator === 0 ? null : numerator / denominator };
}

function mean(values) {
  return values.length === 0 ? null : values.reduce((total, value) => total + value, 0) / values.length;
}

function pointBiserial(records) {
  if (records.length < 2) return null;
  const values = records.map((record) => record.affectedModuleCount);
  const labels = records.map((record) => Number(record.labels.repoLevel));
  const valueMean = mean(values);
  const labelMean = mean(labels);
  const numerator = values.reduce((total, value, index) => total + (value - valueMean) * (labels[index] - labelMean), 0);
  const valueVariance = values.reduce((total, value) => total + (value - valueMean) ** 2, 0);
  const labelVariance = labels.reduce((total, value) => total + (value - labelMean) ** 2, 0);
  const denominator = Math.sqrt(valueVariance * labelVariance);
  return denominator === 0 ? null : numerator / denominator;
}

export function summarizeLanguage(records, language) {
  const low = records.filter((record) => record.risk === "low");
  const medium = records.filter((record) => record.risk === "medium");
  const security = records.filter((record) => record.labels.security);
  const serious = (record) => record.labels.security || record.labels.defect;
  const supported = Object.hasOwn(SUPPORTED_LANGUAGES, language);
  const repoLevel = records.filter((record) => record.labels.repoLevel);
  const notRepoLevel = records.filter((record) => !record.labels.repoLevel);
  return {
    sampleCount: records.length,
    M1: { ...ratio(low.filter(serious).length, low.length), interpretation: "upper-bound-false-negative-rate" },
    M2: ratio(medium.filter(serious).length, medium.length),
    M3: { escalated: security.filter((record) => record.risk === "critical").length, securityLabeled: security.length },
    M4: supported ? {
      supportedImportGraphLanguage: true,
      repoLevelCount: repoLevel.length,
      nonRepoLevelCount: notRepoLevel.length,
      repoLevelMeanAffectedModuleCount: mean(repoLevel.map((record) => record.affectedModuleCount)),
      nonRepoLevelMeanAffectedModuleCount: mean(notRepoLevel.map((record) => record.affectedModuleCount)),
      pointBiserialCorrelation: pointBiserial(records),
    } : { supportedImportGraphLanguage: false, reason: "project language is unsupported by the import graph" },
  };
}

function summarizeByLanguage(records) {
  const languages = [...new Set(records.map((record) => record.language))].sort();
  return Object.fromEntries(languages.map((language) => [language, summarizeLanguage(records.filter((record) => record.language === language), language)]));
}

async function ensureDirectory(path) {
  await mkdir(path, { recursive: true });
  try {
    await access(path);
  } catch {
    fail(`cannot access workdir ${path}`);
  }
}

async function writeRecord(path, record) {
  if (path === null) return;
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`);
  await rename(temporary, path);
}

export function buildRecord({ dataset, datasetCommit, limit, languages, samples, records, baseExclusions, unavailable, status }) {
  const baseDenominator = records.length + baseExclusions.length;
  const baseExclusionRate = baseDenominator === 0 ? 0 : baseExclusions.length / baseDenominator;
  const invalidBaseDesign = baseExclusionRate > 0.15;
  return {
    schemaVersion: 2,
    status: invalidBaseDesign ? "invalid-base-design" : status,
    dataset: { path: dataset, commit: datasetCommit, file: "dataset/positive_samples.json" },
    selection: {
      limit,
      languages: languages === null ? null : [...languages].sort(),
      selectedCount: samples.length,
      processedCount: records.length + baseExclusions.length + unavailable.length,
    },
    limitations: LIMITATIONS,
    overlay: { generated: true, reviewed: false },
    exclusions: {
      commitUnavailable: { count: unavailable.length, records: unavailable },
      baseValidation: { count: baseExclusions.length, denominator: baseDenominator, rate: baseExclusionRate, threshold: 0.15, records: baseExclusions },
    },
    metricsByLanguage: invalidBaseDesign ? {} : summarizeByLanguage(records),
    records,
  };
}

export async function resumeState(output, datasetCommit, limit, languages, samples) {
  const record = JSON.parse(await readFile(output, "utf8"));
  const selectedUrls = new Set(samples.map((sample) => sample.githubPrUrl));
  const expectedLanguages = languages === null ? null : [...languages].sort();
  if (
    record?.schemaVersion !== 2 ||
    record.dataset?.commit !== datasetCommit ||
    record.selection?.limit !== limit ||
    JSON.stringify(record.selection?.languages) !== JSON.stringify(expectedLanguages) ||
    record.selection?.selectedCount !== samples.length
  ) fail("resume record does not match the selected dataset and filters");
  const records = record.records ?? [];
  const baseExclusions = record.exclusions?.baseValidation?.records ?? [];
  const unavailable = record.exclusions?.commitUnavailable?.records ?? [];
  const outcomes = [...records, ...baseExclusions, ...unavailable];
  if (!outcomes.every((entry) => selectedUrls.has(entry.prUrl)) || new Set(outcomes.map((entry) => entry.prUrl)).size !== outcomes.length) {
    fail("resume record contains invalid or duplicate PR outcomes");
  }
  return { records, baseExclusions, unavailable };
}

async function main(argv) {
  const { dataset, workdir, limit, languages, output, resume } = parseArguments(argv);
  console.log(`LIMITATION: ${LIMITATIONS[0]}`);
  console.log(`LIMITATION: ${LIMITATIONS[1]}`);
  const [datasetCommit, routingPolicy, samplesJson] = await Promise.all([
    runGit(dataset, ["rev-parse", "HEAD"]).then((value) => value.trim()),
    loadRoutingPolicy(),
    readFile(join(dataset, "dataset", "positive_samples.json"), "utf8"),
  ]);
  let samples = validateSamples(JSON.parse(samplesJson));
  if (languages !== null) samples = samples.filter((sample) => languages.has(sample.project_main_language));
  if (limit !== null) samples = samples.slice(0, limit);
  if (samples.length === 0) fail("the selected dataset sample is empty");

  await ensureDirectory(workdir);
  const state = resume
    ? await resumeState(output, datasetCommit, limit, languages, samples)
    : { records: [], baseExclusions: [], unavailable: [] };
  const { records, baseExclusions, unavailable } = state;
  const completed = new Set([...records, ...baseExclusions, ...unavailable].map((entry) => entry.prUrl));
  if (resume) console.log(`resuming: ${completed.size}/${samples.length} PRs already recorded`);
  const pendingSamples = samples.filter((sample) => !completed.has(sample.githubPrUrl));
  const runRoot = await mkdtemp(join(workdir, "ompstack-aacr-"));
  try {
    for (const [repository, repositorySamples] of groupByRepository(pendingSamples)) {
      const repositoryRoot = join(runRoot, repository.replace("/", "--"));
      try {
        await run("git", ["init", "--bare", repositoryRoot]);
        await runGit(repositoryRoot, ["remote", "add", "origin", `https://github.com/${repository}.git`]);
        for (const sample of repositorySamples) {
          const result = await classifySample(repository, repositoryRoot, sample, routingPolicy);
          if (!result.excluded) records.push(result);
          else if (result.exclusionType === "commitUnavailable") unavailable.push(result);
          else baseExclusions.push(result);
          const processed = records.length + baseExclusions.length + unavailable.length;
          console.log(`${processed}/${samples.length} ${sample.githubPrUrl} ${result.excluded ? `excluded:${result.reason}` : `${result.risk} affected=${result.affectedModuleCount}`}`);
          await writeRecord(output, buildRecord({ dataset, datasetCommit, limit, languages, samples, records, baseExclusions, unavailable, status: "in-progress" }));
        }
      } finally {
        await rm(repositoryRoot, { recursive: true, force: true });
      }
    }
  } finally {
    await rm(runRoot, { recursive: true, force: true });
  }

  const record = buildRecord({ dataset, datasetCommit, limit, languages, samples, records, baseExclusions, unavailable, status: "complete" });
  await writeRecord(output, record);
  if (output !== null) console.log(`record: ${output}`);
  const base = record.exclusions.baseValidation;
  console.log(`commit unavailable: ${unavailable.length}/${samples.length}`);
  console.log(`base validation excluded: ${base.count}/${base.denominator} (${(base.rate * 100).toFixed(1)}%)`);
  if (record.status === "invalid-base-design") fail("more than 15% of fetchable PRs failed the labeled-path subset check; resolved base is not valid for evaluation");
  for (const [language, metrics] of Object.entries(record.metricsByLanguage)) console.log(`${language}: ${JSON.stringify(metrics)}`);
  return record;
}

if (import.meta.main) {
  await main(Bun.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
