import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { classifyRoute } from "./routing/classify-route.mjs";
import { collectSignals, loadSignalPolicy } from "./routing/collect-signals.mjs";
import { analyzeImportGraph } from "./routing/import-graph.mjs";
import { loadRoutingPolicy } from "./routing/policy.mjs";

const risks = Object.freeze(["low", "medium", "high", "critical"]);
const neutralRiskFacts = Object.freeze({
  sharedSemanticBoundary: false,
  consumerFamilies: 1,
  executionModes: 1,
  graphTraversal: false,
  materialUnknown: false,
});
const graphPolicy = Object.freeze({
  sourceRoots: Object.freeze({ go: Object.freeze([]), python: Object.freeze([]), typescript: Object.freeze(["."]), java: Object.freeze([]) }),
});

function fail(message) { throw new Error(`risk distribution eval: ${message}`); }

async function runGit(root, args) {
  const process = Bun.spawn(["git", "-C", root, ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited]);
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
    entries.set(path, { binary: added === "-" || deleted === "-", addedLines: added === "-" ? 0 : Number(added), deletedLines: deleted === "-" ? 0 : Number(deleted) });
  }
  return entries;
}

async function collectCommitChangeSet(root, base, head) {
  const [nameStatus, numstat] = await Promise.all([
    runGit(root, ["diff", "--name-status", "-z", "--find-renames", "--find-copies", base, head]),
    runGit(root, ["diff", "--numstat", "-z", "--find-renames", "--find-copies", base, head]),
  ]);
  const statistics = parseNumstat(numstat);
  return parseNameStatus(nameStatus).map((change) => ({ ...change, ...(statistics.get(change.path) ?? { binary: false, addedLines: 0, deletedLines: 0 }) }));
}

function argumentsFor(argv) {
  let count = 30;
  let repository = process.cwd();
  let output = null;
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (typeof value !== "string") fail("usage: bun scripts/eval-risk-distribution.mjs [--repo PATH] [--count N] [--output FILE]");
    if (flag === "--count" && /^\d+$/.test(value) && Number(value) > 0) count = Number(value);
    else if (flag === "--repo" && value !== "") repository = value;
    else if (flag === "--output" && value !== "") output = value;
    else fail("usage: bun scripts/eval-risk-distribution.mjs [--repo PATH] [--count N] [--output FILE]");
  }
  return { count, root: resolve(repository), output: output === null ? null : resolve(output) };
}

async function parentOf(root, commit) {
  const fields = (await runGit(root, ["rev-list", "--parents", "-n", "1", commit])).trim().split(" ");
  return fields.length > 1 ? fields[1] : null;
}

async function classifyCommit(root, commit, base, signalPolicy, routingPolicy) {
  const worktree = await mkdtemp(join(tmpdir(), "ompstack-risk-eval-"));
  await rm(worktree, { force: true, recursive: true });
  try {
    await runGit(root, ["worktree", "add", "--detach", worktree, commit]);
    const changeSet = await collectCommitChangeSet(root, base, commit);
    const [signals, graph] = await Promise.all([
      collectSignals({ root: worktree, changeSet, policy: signalPolicy }),
      analyzeImportGraph({ root: worktree, changeSet, policy: { ...graphPolicy, policyVersion: routingPolicy.policyVersion } }),
    ]);
    return classifyRoute({ signals, graph, taskFacts: { behaviorAffecting: true }, riskFacts: neutralRiskFacts, policy: routingPolicy });
  } finally {
    await runGit(root, ["worktree", "remove", "--force", worktree]).catch(() => rm(worktree, { force: true, recursive: true }));
  }
}

const { count, root, output } = argumentsFor(Bun.argv.slice(2));
const commits = (await runGit(root, ["rev-list", "--first-parent", `--max-count=${count + 1}`, "HEAD"])).trim().split("\n").filter(Boolean);
const parents = await Promise.all(commits.map((commit) => parentOf(root, commit)));
const candidates = commits.filter((_, index) => parents[index] !== null).slice(0, count);
if (candidates.length !== count) fail(`requires ${count} commits with parents, found ${candidates.length}`);
const [signalPolicy, routingPolicy] = await Promise.all([loadSignalPolicy({ root }), loadRoutingPolicy()]);
console.log(`repository: ${root}`);
console.log(`sample: ${candidates.length} first-parent commits ending at ${commits[0].slice(0, 12)}`);
const distribution = Object.fromEntries(risks.map((risk) => [risk, 0]));
for (const [index, commit] of candidates.entries()) {
  const result = await classifyCommit(root, commit, parents[commits.indexOf(commit)], signalPolicy, routingPolicy);
  distribution[result.risk] += 1;
  console.log(`${index + 1}. ${commit.slice(0, 12)} ${result.risk} ${result.reasonCodes.join(",") || "no-escalation"}`);
}
const record = { schemaVersion: 1, repository: root, head: commits[0], sampleCount: candidates.length, distribution };
console.log(`risk distribution (${candidates.length} commits): ${risks.map((risk) => `${risk}=${distribution[risk]}`).join(" ")}`);
if (output !== null) {
  await writeFile(output, `${JSON.stringify(record, null, 2)}\n`);
  console.log(`record: ${output}`);
}
if (risks.some((risk) => distribution[risk] === candidates.length)) fail(`degenerate risk distribution: every commit is ${risks.find((risk) => distribution[risk] === candidates.length)}`);
