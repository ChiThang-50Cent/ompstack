import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { ArtifactFingerprint, PstackConfig } from "./domain.js";
import { nowIso, sha256 } from "./utils.js";

/** Process runner seam; `ExtensionAPI.exec` satisfies it. */
export interface ExecRunner {
  exec(command: string, args: string[], options?: { cwd?: string; timeout?: number }): Promise<{ stdout: string; stderr: string; code: number }>;
}

async function runGit(exec: ExecRunner, cwd: string, args: string[]): Promise<string> {
  const result = await exec.exec("git", args, { cwd });
  if (result.code !== 0) throw new Error(`git ${args.join(" ")} exited ${result.code}: ${result.stderr.trim()}`);
  return result.stdout;
}

function normalizeRelative(value: string): string {
  return value.replaceAll(path.sep, "/").replace(/^\.\//, "");
}

/**
 * Pstack's own state must never change the artifact it attests to, whatever
 * the user's `fingerprintIgnore` says; otherwise every audit write makes all
 * verdicts stale.
 */
function ignored(relative: string, config: PstackConfig): boolean {
  const normalized = normalizeRelative(relative);
  const matches = (entry: string): boolean => {
    const candidate = normalizeRelative(entry).replace(/\/$/, "");
    return normalized === candidate || normalized.startsWith(`${candidate}/`);
  };
  return matches(".omp/pstack") || matches(config.auditDirectory) || config.fingerprintIgnore.some(matches);
}

async function hashFile(filePath: string, maxBytes: number): Promise<{ digest: string; partial: boolean; size: number }> {
  const info = await lstat(filePath);
  if (info.size > maxBytes) {
    return {
      digest: sha256(`oversize\0${info.size}\0${Math.floor(info.mtimeMs)}`),
      partial: true,
      size: info.size,
    };
  }
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", chunk => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return { digest: hash.digest("hex"), partial: false, size: info.size };
}

async function gitFingerprint(exec: ExecRunner, cwd: string, config: PstackConfig): Promise<ArtifactFingerprint | undefined> {
  try {
    const inside = (await runGit(exec, cwd, ["rev-parse", "--is-inside-work-tree"])).trim();
    if (inside !== "true") return undefined;

    let headSha = "unborn";
    try {
      headSha = (await runGit(exec, cwd, ["rev-parse", "HEAD"])).trim();
    } catch {
      // An unborn repository still has a meaningful working-tree fingerprint.
    }

    let trackedDiff = "";
    try {
      trackedDiff = await runGit(exec, cwd, ["diff", "--binary", "--no-ext-diff", "HEAD", "--", "."]);
    } catch {
      trackedDiff = await runGit(exec, cwd, ["diff", "--binary", "--no-ext-diff", "--", "."]);
    }

    const untrackedRaw = await runGit(exec, cwd, ["ls-files", "--others", "--exclude-standard", "-z"]);
    const untracked = untrackedRaw
      .split("\0")
      .map(normalizeRelative)
      .filter(Boolean)
      .filter(relative => !ignored(relative, config))
      .sort();

    const manifest: string[] = [];
    let partial = false;
    for (const relative of untracked) {
      const absolute = path.join(cwd, relative);
      try {
        const hashed = await hashFile(absolute, config.maxHashedFileBytes);
        partial ||= hashed.partial;
        manifest.push(`${relative}\0${hashed.size}\0${hashed.digest}`);
      } catch (error) {
        partial = true;
        manifest.push(`${relative}\0unreadable\0${String(error)}`);
      }
    }

    const dirtyHash = sha256(`${trackedDiff}\0${manifest.join("\n")}`);
    const digest = sha256(`git\0${headSha}\0${dirtyHash}`);
    return {
      kind: "git",
      digest,
      generatedAt: nowIso(),
      headSha,
      dirtyHash,
      clean: trackedDiff.length === 0 && untracked.length === 0,
      partial,
      notes: partial ? ["One or more oversized or unreadable untracked files were represented by metadata."] : [],
    };
  } catch {
    return undefined;
  }
}

async function workspaceFingerprint(cwd: string, config: PstackConfig): Promise<ArtifactFingerprint> {
  const entries: string[] = [];
  const notes: string[] = [];
  let partial = false;
  let visited = 0;

  async function walk(directory: string): Promise<void> {
    if (visited >= config.maxWorkspaceFiles) return;
    let children;
    try {
      children = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      partial = true;
      notes.push(`Could not read ${normalizeRelative(path.relative(cwd, directory))}: ${String(error)}`);
      return;
    }
    children.sort((left, right) => left.name.localeCompare(right.name));
    for (const child of children) {
      if (visited >= config.maxWorkspaceFiles) {
        partial = true;
        notes.push(`Workspace scan stopped at ${config.maxWorkspaceFiles} files.`);
        return;
      }
      const absolute = path.join(directory, child.name);
      const relative = normalizeRelative(path.relative(cwd, absolute));
      if (ignored(relative, config)) continue;
      if (child.isSymbolicLink()) {
        entries.push(`${relative}\0symlink`);
        visited += 1;
      } else if (child.isDirectory()) {
        await walk(absolute);
      } else if (child.isFile()) {
        try {
          const hashed = await hashFile(absolute, config.maxHashedFileBytes);
          partial ||= hashed.partial;
          entries.push(`${relative}\0${hashed.size}\0${hashed.digest}`);
        } catch (error) {
          partial = true;
          entries.push(`${relative}\0unreadable\0${String(error)}`);
        }
        visited += 1;
      }
    }
  }

  await walk(cwd);
  return {
    kind: "workspace",
    digest: sha256(entries.join("\n")),
    generatedAt: nowIso(),
    partial,
    notes,
  };
}

export async function computeArtifactFingerprint(exec: ExecRunner, cwd: string, config: PstackConfig): Promise<ArtifactFingerprint> {
  return (await gitFingerprint(exec, cwd, config)) ?? workspaceFingerprint(cwd, config);
}

export async function readFingerprintFromFile(filePath: string): Promise<ArtifactFingerprint | undefined> {
  try {
    const value = JSON.parse(await readFile(filePath, "utf8")) as ArtifactFingerprint;
    if (!value || typeof value.digest !== "string" || (value.kind !== "git" && value.kind !== "workspace")) return undefined;
    return value;
  } catch {
    return undefined;
  }
}
