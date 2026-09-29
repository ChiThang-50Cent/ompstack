import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import type { RunState, RunStore } from "./types.ts";
import { isTerminal } from "./state.ts";

/**
 * Durable storage for merge-ready runs.
 *
 * State files are replaced with a same-directory temporary file and rename so a
 * reader sees either the old complete JSON document or the new complete one,
 * never a partially written document.
 */
export class FileRunStore implements RunStore {
	readonly baseDir: string;

	constructor(baseDir = join(homedir(), ".omp", "merge-ready")) {
		this.baseDir = baseDir;
	}

	private runsDir(): string {
		return join(this.baseDir, "runs");
	}

	private runDir(runId: string): string {
		return join(this.runsDir(), runId);
	}

	private statePath(runId: string): string {
		return join(this.runDir(runId), "state.json");
	}

	async load(runId: string): Promise<RunState | undefined> {
		try {
			const content = await readFile(this.statePath(runId), "utf8");
			return JSON.parse(content) as RunState;
		} catch (error) {
			if (isMissingFile(error)) return undefined;
			throw error;
		}
	}

	async save(state: RunState): Promise<void> {
		const runDir = this.runDir(state.runId);
		await mkdir(runDir, { recursive: true });

		const statePath = this.statePath(state.runId);
		const temporaryPath = `${statePath}.${process.pid}.${randomUUID()}.tmp`;
		try {
			await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
			await rename(temporaryPath, statePath);
		} finally {
			// A failed write/rename must not leave controller-looking temporary files
			// behind.  ENOENT is expected after a successful rename.
			await rm(temporaryPath, { force: true });
		}
	}

	async findActive(repoRoot: string): Promise<RunState | undefined> {
		let entries;
		try {
			entries = await readdir(this.runsDir(), { withFileTypes: true });
		} catch (error) {
			if (isMissingFile(error)) return undefined;
			throw error;
		}

		let newest: RunState | undefined;
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			const candidate = await this.load(entry.name);
			if (!candidate || isTerminal(candidate.phase) || candidate.repo.root !== repoRoot) continue;
			if (!newest || isNewer(candidate, newest)) newest = candidate;
		}
		return newest;
	}

	async appendTrail(runId: string, entry: Record<string, unknown>): Promise<void> {
		const runDir = this.runDir(runId);
		await mkdir(runDir, { recursive: true });
		await appendFile(join(runDir, "decisions.jsonl"), `${JSON.stringify(entry)}\n`, "utf8");
	}
}

function isMissingFile(error: unknown): boolean {
	if (typeof error !== "object" || error === null || !("code" in error)) return false;
	return error.code === "ENOENT";
}

function isNewer(candidate: RunState, current: RunState): boolean {
	const candidateTime = Date.parse(candidate.updatedAt);
	const currentTime = Date.parse(current.updatedAt);
	if (Number.isFinite(candidateTime) && Number.isFinite(currentTime) && candidateTime !== currentTime) {
		return candidateTime > currentTime;
	}
	if (candidate.updatedAt !== current.updatedAt) return candidate.updatedAt > current.updatedAt;
	return candidate.runId > current.runId;
}
