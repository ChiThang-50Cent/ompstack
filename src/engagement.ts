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
 * failed, so this measures the artifact instead: at session start we snapshot
 * the working tree into a git tree object (through a throwaway index, so the
 * user's index and refs are untouched); at stop/shutdown we snapshot again and
 * diff. A session that changed more than the direct-change budget without
 * opening a run is treated like one with open gates.
 */

export interface ChangeBaseline {
  tree: string;
  at: string;
  /** pstack mode when the snapshot was taken; an `off` baseline is retaken when pstack activates. */
  mode: string;
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

async function git(exec: ExecRunner, cwd: string, args: string[], index?: string) {
  // ExecRunner has no env option; `env` sets GIT_INDEX_FILE portably on POSIX.
  return index
    ? exec.exec("env", [`GIT_INDEX_FILE=${index}`, "git", ...args], { cwd, timeout: 60_000 })
    : exec.exec("git", args, { cwd, timeout: 60_000 });
}

function excludes(config: PstackConfig): string[] {
  const entries = [".omp/pstack", config.auditDirectory, ...config.fingerprintIgnore]
    .map(entry => entry.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/$/, ""))
    .filter(entry => entry && entry !== "." && !entry.startsWith(".."));
  return [...new Set(entries)].map(entry => `:(exclude)${entry}`);
}

/**
 * Write the current working tree (tracked, modified and untracked files that
 * are not ignored) as a git tree object and return its id. Returns undefined
 * outside a git work tree or when git/env is unavailable: the tripwire then
 * stays silent rather than guessing.
 */
export async function snapshotWorkingTree(exec: ExecRunner, cwd: string, config: PstackConfig): Promise<string | undefined> {
  try {
    const inside = await git(exec, cwd, ["rev-parse", "--is-inside-work-tree"]);
    if (inside.code !== 0 || inside.stdout.trim() !== "true") return undefined;
    const indexPath = await git(exec, cwd, ["rev-parse", "--path-format=absolute", "--git-path", "index"]);
    const top = await git(exec, cwd, ["rev-parse", "--show-toplevel"]);
    if (top.code !== 0) return undefined;
    const root = top.stdout.trim();
    const scratch = path.join(tmpdir(), `pstack-index-${randomUUID()}`);
    try {
      let seeded = false;
      if (indexPath.code === 0 && indexPath.stdout.trim()) {
        // Copying the real index keeps git's stat cache, so `add -A` only rehashes changed files.
        seeded = await copyFile(indexPath.stdout.trim(), scratch).then(() => true, () => false);
      }
      if (!seeded) {
        const head = await git(exec, root, ["read-tree", "HEAD"], scratch);
        if (head.code !== 0 && (await git(exec, root, ["read-tree", "--empty"], scratch)).code !== 0) return undefined;
      }
      // assume-unchanged (lowercase tag) and skip-worktree (S) entries make `add -A`
      // ignore edits to those files; clear the bits in the scratch index only.
      const listed = await git(exec, root, ["ls-files", "-v", "-z"], scratch);
      if (listed.code !== 0) return undefined;
      const hidden = listed.stdout.split("\0").filter(entry => /^[a-zS] /.test(entry)).map(entry => entry.slice(2));
      for (let start = 0; start < hidden.length; start += 500) {
        const batch = hidden.slice(start, start + 500);
        // One flag per call: git applies only the first of these two in a single update-index.
        for (const flag of ["--no-assume-unchanged", "--no-skip-worktree"]) {
          const cleared = await git(exec, root, ["update-index", flag, "--", ...batch], scratch);
          if (cleared.code !== 0) return undefined;
        }
      }
      const added = await git(exec, root, ["add", "-A", "--", ".", ...excludes(config)], scratch);
      if (added.code !== 0) return undefined;
      const tree = await git(exec, root, ["write-tree"], scratch);
      const id = tree.stdout.trim();
      return tree.code === 0 && /^[0-9a-f]{40,64}$/.test(id) ? id : undefined;
    } finally {
      await rm(scratch, { force: true }).catch(() => undefined);
    }
  } catch {
    return undefined;
  }
}

export async function diffTrees(exec: ExecRunner, cwd: string, from: string, to: string): Promise<ChangeStat | undefined> {
  if (from === to) return { files: 0, lines: 0, paths: [] };
  const result = await git(exec, cwd, ["diff", "--numstat", "--no-renames", from, to]).catch(() => undefined);
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
  if (state.activeRun) return true;
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
  if (!config.writeAuditFiles) return;
  const directory = path.resolve(cwd, config.auditDirectory);
  await mkdir(directory, { recursive: true });
  await appendFile(path.join(directory, "session-events.jsonl"), `${JSON.stringify({ at: new Date().toISOString(), type, data })}\n`, "utf8");
}

/** URL-like targets (xd://, local://, agent://, ssh://, ...) are OMP devices or sandboxes, not workspace files. */
const SCHEME_TARGET = /^[a-z][a-z0-9+.-]*:\/\//i;

/** `edit` hashline headers wrap the path as `[path#ABCD]`. */
function unwrapHashlinePath(target: string): string {
  const match = /^\[(.+?)(?:#[0-9A-Fa-f]{4})?\]$/.exec(target.trim());
  return match ? (match[1] as string) : target.trim();
}

/**
 * Whether a direct write tool call targets a file in the workspace. Unknown
 * shapes count as workspace writes, so strict stays strict when in doubt.
 */
export function targetsWorkspace(toolName: string, input: unknown, cwd: string): boolean {
  const record = typeof input === "object" && input !== null ? input as Record<string, unknown> : {};
  const targets = toolName === "ast_edit"
    ? (Array.isArray(record.paths) ? record.paths : [])
    : (typeof record.path === "string" ? [record.path] : []);
  if (targets.length === 0 || targets.some(target => typeof target !== "string")) return true;
  const root = path.resolve(cwd);
  return (targets as string[]).some(target => {
    const clean = unwrapHashlinePath(target);
    if (SCHEME_TARGET.test(clean)) return false;
    const absolute = path.resolve(root, clean);
    return absolute === root || absolute.startsWith(`${root}${path.sep}`);
  });
}
