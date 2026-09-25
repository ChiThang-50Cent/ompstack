import { randomUUID } from "node:crypto";
import { appendFile, copyFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { PstackConfig, PstackSessionState } from "./domain.js";
import type { ExecRunner } from "./fingerprint.js";

/**
 * Engagement tripwire.
 *
 * The Stage A bench showed the failure the gates cannot see: in every
 * false completion the model never opened a pstack run, so there was nothing
 * to block and the process exited 0. Guessing intent from the prompt is what
 * failed, so it measures the artifact instead: at session/lifecycle start or
 * mode activation we snapshot the working tree into a git tree object (through
 * a throwaway index, so the user's index and refs are untouched); at
 * stop/shutdown we snapshot again and diff. A session that changed more than
 * the direct-change budget without opening a run is treated like one with open
 * gates.
 */

export interface ChangeBaseline {
  tree: string;
  at: string;
}

export interface ChangeStat {
  files: number;
  lines: number;
  paths: string[];
}

export interface EngagementFinding {
  stat: ChangeStat;
  budget: { files: number; lines: number };
}

async function git(exec: ExecRunner, cwd: string, args: string[], index?: string, signal?: AbortSignal) {
  // ExecRunner has no env option; `env` sets GIT_INDEX_FILE portably on POSIX.
  const options = { cwd, timeout: 60_000, ...(signal ? { signal } : {}) };
  return index
    ? exec.exec("env", [`GIT_INDEX_FILE=${index}`, "git", ...args], options)
    : exec.exec("git", args, options);
}

function excludedPaths(config: PstackConfig): string[] {
  return [".omp/pstack", config.auditDirectory, ...config.fingerprintIgnore]
    .map(entry => entry.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/$/, ""))
    .filter(entry => entry && entry !== "." && !entry.startsWith(".."));
}

function isWithin(root: string, candidate: string): boolean {
  const normalizedRoot = path.resolve(root);
  const normalizedCandidate = path.resolve(candidate);
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}${path.sep}`);
}

function workspaceScope(root: string, cwd: string): string | undefined {
  const relative = path.relative(root, cwd).replaceAll("\\", "/");
  if (relative === "" || relative === ".") return ".";
  if (relative === ".." || relative.startsWith("../") || path.isAbsolute(relative)) return undefined;
  return relative;
}

function excludedPathspecs(root: string, cwd: string, config: PstackConfig): string[] {
  return excludedPaths(config)
    .map(entry => {
      const absolute = path.resolve(cwd, entry);
      if (!isWithin(root, absolute)) return undefined;
      const relative = path.relative(root, absolute).replaceAll("\\", "/");
      return relative && relative !== "." ? `:(top,literal)${relative}` : undefined;
    })
    .filter((entry): entry is string => entry !== undefined);
}

function scratchIndexPath(root: string, gitDirectory: string): string | undefined {
  const normalizedGitDirectory = path.resolve(gitDirectory);
  const normalizedGitMarker = path.resolve(root, ".git");
  const gitPrivate = normalizedGitDirectory === normalizedGitMarker
    || normalizedGitDirectory.startsWith(`${normalizedGitMarker}${path.sep}`);
  if (gitPrivate || !isWithin(root, normalizedGitDirectory)) {
    return path.join(normalizedGitDirectory, `pstack-index-${randomUUID()}`);
  }
  const candidates = [path.dirname(root), tmpdir(), "/tmp", "/var/tmp"];
  for (const candidate of candidates) {
    if (!isWithin(root, candidate)) return path.join(candidate, `pstack-index-${randomUUID()}`);
  }
  return undefined;
}

/**
 * Write the current working tree (tracked, modified and untracked files that
 * are not ignored) as a git tree object and return its id. Returns undefined
 * outside a git work tree or when git/env is unavailable: the tripwire then
 * stays silent rather than guessing.
 */
export async function snapshotWorkingTree(
  exec: ExecRunner,
  cwd: string,
  config: PstackConfig,
  signal?: AbortSignal,
): Promise<string | undefined> {
  try {
    if (signal?.aborted) return undefined;
    const inside = await git(exec, cwd, ["rev-parse", "--is-inside-work-tree"], undefined, signal);
    if (inside.code !== 0 || inside.stdout.trim() !== "true") return undefined;
    const indexPath = await git(
      exec,
      cwd,
      ["rev-parse", "--path-format=absolute", "--git-path", "index"],
      undefined,
      signal,
    );
    const top = await git(exec, cwd, ["rev-parse", "--show-toplevel"], undefined, signal);
    if (top.code !== 0) return undefined;
    const root = top.stdout.trim();
    const scope = workspaceScope(root, cwd);
    if (!scope) return undefined;
    const gitDir = await git(exec, root, ["rev-parse", "--path-format=absolute", "--git-dir"], undefined, signal);
    if (gitDir.code !== 0) return undefined;
    const scratch = scratchIndexPath(root, gitDir.stdout.trim());
    if (!scratch) return undefined;
    try {
      let seeded = false;
      if (indexPath.code === 0 && indexPath.stdout.trim()) {
        // Copying the real index keeps git's stat cache, so `add -A` only rehashes changed files.
        seeded = await copyFile(indexPath.stdout.trim(), scratch).then(() => true, () => false);
      }
      if (!seeded) {
        const head = await git(exec, root, ["read-tree", "HEAD"], scratch, signal);
        if (head.code !== 0 && (await git(exec, root, ["read-tree", "--empty"], scratch, signal)).code !== 0) return undefined;
      }
      const indexed = await git(exec, root, ["ls-files", "-v", "-z"], scratch, signal);
      if (indexed.code !== 0) return undefined;
      const hidden = indexed.stdout.split("\0")
        .filter(Boolean)
        .filter(entry => entry[0] !== "H")
        .map(entry => entry.slice(2));
      if (hidden.length > 0) {
        const resetAssume = await git(exec, root, ["update-index", "--no-assume-unchanged", "--", ...hidden], scratch, signal);
        if (resetAssume.code !== 0) return undefined;
        const resetSkip = await git(exec, root, ["update-index", "--no-skip-worktree", "--", ...hidden], scratch, signal);
        if (resetSkip.code !== 0) return undefined;
      }
      const added = await git(exec, root, ["add", "-A", "--", scope], scratch, signal);
      if (added.code !== 0) return undefined;
      const normalized = await git(exec, root, ["add", "--renormalize", "-u", "--", scope], scratch, signal);
      if (normalized.code !== 0) return undefined;
      const removed = await git(
        exec,
        root,
        ["rm", "--cached", "--ignore-unmatch", "-r", "--", ...excludedPathspecs(root, cwd, config)],
        scratch,
        signal,
      );
      if (removed.code !== 0) return undefined;
      const tree = await git(exec, root, ["write-tree"], scratch, signal);
      const id = tree.stdout.trim();
      return tree.code === 0 && /^[0-9a-f]{40,64}$/.test(id) ? id : undefined;
    } finally {
      await rm(scratch, { force: true }).catch(() => undefined);
    }
  } catch {
    return undefined;
  }
}

export async function diffTrees(
  exec: ExecRunner,
  cwd: string,
  from: string,
  to: string,
  signal?: AbortSignal,
): Promise<ChangeStat | undefined> {
  if (from === to) return { files: 0, lines: 0, paths: [] };
  const top = await git(exec, cwd, ["rev-parse", "--show-toplevel"], undefined, signal).catch(() => undefined);
  if (!top || top.code !== 0) return undefined;
  const root = top.stdout.trim();
  const scope = workspaceScope(root, cwd);
  if (!scope) return undefined;
  const result = await git(
    exec,
    root,
    ["diff", "--numstat", "--no-renames", "--no-ext-diff", from, to, "--", scope],
    undefined,
    signal,
  ).catch(() => undefined);
  if (!result || result.code !== 0) return undefined;
  const paths: string[] = [];
  let lines = 0;
  for (const row of result.stdout.split("\n")) {
    const match = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(row);
    if (!match) continue;
    paths.push(match[3] as string);
    // Binary files report "-": count the file, not lines.
    lines += (match[1] === "-" ? 0 : Number(match[1])) + (match[2] === "-" ? 0 : Number(match[2]));
  }
  return { files: paths.length, lines, paths };
}

/** A run opened (or still open) since the baseline counts as engagement, whatever became of it. */
export function engagedSince(state: PstackSessionState, baselineAt: string): boolean {
  if (state.activeRun?.status === "active") return true;
  const since = Date.parse(baselineAt);
  return state.completedRuns.some(run => !Number.isFinite(since) || Date.parse(run.createdAt) >= since);
}

export function exceedsDirectBudget(stat: ChangeStat, config: PstackConfig): boolean {
  return stat.files > config.directMaxFiles || stat.lines > config.directMaxLines;
}

export function renderEngagementFinding(finding: EngagementFinding, headless: boolean): string {
  const shown = finding.stat.paths.slice(0, 8).join(", ") + (finding.stat.paths.length > 8 ? ", ..." : "");
  return [
    `pstack: this session changed ${finding.stat.files} file(s) / ${finding.stat.lines} line(s) without a pstack run`
      + ` (direct budget: ${finding.budget.files} file(s) / ${finding.budget.lines} line(s)).`,
    `Changed: ${shown}`,
    headless
      ? "The change is unverified by pstack gates."
      : "Open a run for what you changed (pstack_gate action=init with acceptance criteria that describe the change), verify it, and close it with pstack_gate action=check. Revert anything you did not intend to change.",
  ].join("\n");
}

/** Session-level audit trail for events that happen without a run (runs have their own directory). */
export async function appendSessionAudit(cwd: string, config: PstackConfig, type: string, data: unknown): Promise<void> {
  try {
    if (!config.writeAuditFiles) return;
    const directory = path.resolve(cwd, config.auditDirectory);
    await mkdir(directory, { recursive: true });
    await appendFile(path.join(directory, "session-events.jsonl"), `${JSON.stringify({ at: new Date().toISOString(), type, data })}\n`, "utf8");
  } catch {
    // Audit failures must not change enforcement or exit behavior.
  }
}
