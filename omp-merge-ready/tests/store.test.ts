import { test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createRun, transition } from "../extensions/merge-ready/state.ts";
import { FileRunStore } from "../extensions/merge-ready/store.ts";
import type { RunState } from "../extensions/merge-ready/types.ts";

let baseDir: string;

const sameRepo: RunState["repo"] = {
	root: "/repo-a",
	baseBranch: "main",
	startBranch: "feature/a",
};

beforeEach(async () => {
	baseDir = await mkdtemp(join(tmpdir(), "omp-merge-ready-store-"));
});

afterEach(async () => {
	await rm(baseDir, { recursive: true, force: true });
});

test("atomically saves and loads a run, including its append-only trail", async () => {
	const store = new FileRunStore(baseDir);
	const state = createRun({ runId: "run-1", intent: "add feature", repo: sameRepo, now: "2026-01-01T00:00:00Z" });

	await store.save(state);
	await store.appendTrail(state.runId, { timestamp: state.updatedAt, phase: state.phase, result: "created" });

	expect(await store.load(state.runId)).toEqual(state);
	expect(await readFile(join(baseDir, "runs", state.runId, "decisions.jsonl"), "utf8")).toBe(
		'{"timestamp":"2026-01-01T00:00:00Z","phase":"INTAKE","result":"created"}\n',
	);

	const runEntries = await readdir(join(baseDir, "runs", state.runId));
	expect(runEntries.sort()).toEqual(["decisions.jsonl", "state.json"]);
});

test("findActive ignores terminal runs and runs from another repository", async () => {
	const store = new FileRunStore(baseDir);
	const oldActive = createRun({
		runId: "run-old",
		intent: "old",
		repo: sameRepo,
		now: "2026-01-01T00:00:00Z",
	});
	const newestActive = createRun({
		runId: "run-new",
		intent: "new",
		repo: sameRepo,
		now: "2026-01-01T00:00:02Z",
	});
	const terminal = transition(
		createRun({
			runId: "run-terminal",
			intent: "terminal",
			repo: sameRepo,
			now: "2026-01-01T00:00:03Z",
		}),
		"ABORTED",
		"operator aborted",
		"2026-01-01T00:00:04Z",
	);
	const otherRepo = createRun({
		runId: "run-other-repo",
		intent: "other",
		repo: { ...sameRepo, root: "/repo-b" },
		now: "2026-01-01T00:00:05Z",
	});

	await Promise.all([oldActive, newestActive, terminal, otherRepo].map((state) => store.save(state)));

	expect((await store.findActive("/repo-a"))?.runId).toBe("run-new");
	expect(await store.findActive("/repo-b")).toEqual(otherRepo);
	expect(await store.findActive("/repo-c")).toBeUndefined();
});

test("load returns undefined for a run that has not been persisted", async () => {
	expect(await new FileRunStore(baseDir).load("missing")).toBeUndefined();
});
