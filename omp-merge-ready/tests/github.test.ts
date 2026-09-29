import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "bun:test";
import {
	GhForge,
	extractPrCheckStatus,
	type GhCommandResult,
	type GhRunner,
} from "../extensions/merge-ready/github";

const fixtureDir = join(import.meta.dir, "fixtures");

async function fixture(name: string): Promise<unknown> {
	return JSON.parse(await readFile(join(fixtureDir, name), "utf8"));
}

function injectedRun(view: unknown, threads: unknown, calls: string[][]): GhRunner {
	return async (args): Promise<GhCommandResult> => {
		calls.push(args);
		if (args[0] === "pr" && args[1] === "view") {
			return { code: 0, stdout: JSON.stringify(view), stderr: "" };
		}
		if (args[0] === "api" && args[1] === "graphql") {
			return { code: 0, stdout: JSON.stringify(threads), stderr: "" };
		}
		throw new Error(`unexpected gh command: ${args.join(" ")}`);
	};
}

test("maps a green PR and queries unresolved review threads", async () => {
	const view = await fixture("green.json") as Record<string, unknown>;
	const threads = await fixture("threads.json");
	const calls: string[][] = [];
	const pr = await new GhForge("/repo", injectedRun(view, threads, calls)).fetchPr("feature");

	expect(pr).toMatchObject({
		number: 42,
		url: "https://github.com/example/project/pull/42",
		headSha: "0123456789abcdef0123456789abcdef01234567",
		isDraft: false,
		mergeable: "mergeable",
		checks: "pass",
		unresolvedBlockingThreads: 2,
		approvalRequired: false,
	});
	expect(pr?.bodyDigest).toBe(
		createHash("sha256").update("Contract-Version: 3", "utf8").digest("hex"),
	);
	expect(typeof pr?.fetchedAt).toBe("string");
	expect(calls[0]).toEqual([
		"pr",
		"view",
		"feature",
		"--json",
		"number,url,headRefOid,isDraft,mergeable,statusCheckRollup,reviewDecision,body",
	]);
	expect(calls[1]?.slice(0, 2)).toEqual(["api", "graphql"]);
	expect(calls[1]?.join(" ")).toContain("reviewThreads");
});

test("maps a failing check", async () => {
	const view = await fixture("failing-check.json");
	const threads = await fixture("threads.json");
	const pr = await new GhForge("/repo", injectedRun(view, threads, [])).fetchPr("feature");
	expect(pr?.checks).toBe("fail");
});

test("maps an in-progress check to pending", async () => {
	const view = await fixture("pending-check.json");
	const threads = await fixture("threads.json");
	const pr = await new GhForge("/repo", injectedRun(view, threads, [])).fetchPr("feature");
	expect(pr?.checks).toBe("pending");
});

test("treats neutral and skipped completed CheckRuns as passing", async () => {
	const view = await fixture("neutral-skipped.json");
	const threads = await fixture("threads.json");
	const pr = await new GhForge("/repo", injectedRun(view, threads, [])).fetchPr("feature");
	expect(pr?.checks).toBe("pass");
});


test("maps conflicting, unknown, draft, and review-required PR state", async () => {
	const cases = [
		["conflicting.json", { mergeable: "conflicting", isDraft: false, approvalRequired: false }],
		["unknown.json", { mergeable: "unknown", isDraft: false, approvalRequired: false }],
		["draft.json", { mergeable: "mergeable", isDraft: true, approvalRequired: false }],
		["review-required.json", { mergeable: "mergeable", isDraft: false, approvalRequired: true }],
	] as const;

	for (const [name, expected] of cases) {
		const view = await fixture(name);
		const threads = await fixture("threads.json");
		const pr = await new GhForge("/repo", injectedRun(view, threads, [])).fetchPr("feature");
		expect(pr).toMatchObject(expected);
	}
});

test("returns undefined when gh reports no pull requests", async () => {
	const calls: string[][] = [];
	const run: GhRunner = async (args) => {
		calls.push(args);
		return {
			code: 1,
			stdout: "",
			stderr: "no pull requests found for branch \"feature\"",
		};
	};

	expect(await new GhForge("/repo", run).fetchPr("feature")).toBeUndefined();
	expect(calls).toHaveLength(1);
});

test("extracts CheckRun and StatusContext outcomes", () => {
	expect(extractPrCheckStatus([])).toBe("none");
	expect(extractPrCheckStatus([{ status: "COMPLETED", conclusion: "SUCCESS" }])).toBe("pass");
	expect(extractPrCheckStatus([{ state: "SUCCESS" }])).toBe("pass");
	expect(extractPrCheckStatus([{ status: "COMPLETED", conclusion: "NEUTRAL" }])).toBe("pass");
	expect(extractPrCheckStatus([{ status: "COMPLETED", conclusion: "SKIPPED" }])).toBe("pass");
	expect(extractPrCheckStatus([{ status: "COMPLETED", conclusion: "FAILURE" }])).toBe("fail");
	expect(extractPrCheckStatus([{ state: "FAILURE" }])).toBe("fail");
	expect(extractPrCheckStatus([{ status: "QUEUED", conclusion: null }])).toBe("pending");
	expect(extractPrCheckStatus([{ state: "EXPECTED" }])).toBe("pending");
});
