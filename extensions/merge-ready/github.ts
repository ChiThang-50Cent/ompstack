import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";
import { createHash } from "node:crypto";
import type { ForgePort, PrState } from "./types.js";

export type GhCommandResult = {
	code: number;
	stdout: string;
	stderr: string;
};

export type GhRunner = (args: string[]) => Promise<GhCommandResult>;

const PR_JSON_FIELDS =
	"number,url,headRefOid,isDraft,mergeable,statusCheckRollup,reviewDecision,body";

/**
 * The GraphQL query deliberately uses gh's repository placeholders.  gh
 * resolves {owner} and {repo} from the repository containing `cwd`, so the
 * adapter does not need a second repository-discovery command.
 */
const THREADS_QUERY = [
	"query($owner: String!, $name: String!, $number: Int!, $endCursor: String) {",
	"  repository(owner: $owner, name: $name) {",
	"    pullRequest(number: $number) {",
	"      reviewThreads(first: 100, after: $endCursor) {",
	"        nodes { isResolved }",
	"        pageInfo { hasNextPage endCursor }",
	"      }",
	"    }",
	"  }",
	"}",
].join(" ");

const NO_PULL_REQUEST = /no pull requests found/i;

function runGh(cwd: string, args: string[]): Promise<GhCommandResult> {
	const process = Bun.spawn(["gh", ...args], {
		cwd,
		stdout: "pipe",
		stderr: "pipe",
	});

	return Promise.all([
		new Response(process.stdout).text(),
		new Response(process.stderr).text(),
		process.exited,
	]).then(([stdout, stderr, code]) => ({ code, stdout, stderr }));
}

function sha256(value: string): string {
	return createHash("sha256").update(value, "utf8").digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function parseJson(stdout: string, command: string): unknown {
	try {
		return JSON.parse(stdout);
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		throw new Error(`gh ${command} returned invalid JSON: ${detail}`);
	}
}

function commandFailure(command: string, result: GhCommandResult): Error {
	const detail = result.stderr.trim() || result.stdout.trim() || `exit code ${result.code}`;
	return new Error(`gh ${command} failed (${result.code}): ${detail}`);
}

function asString(value: unknown, field: string): string {
	if (typeof value !== "string" || value.length === 0) {
		throw new Error(`gh pr view returned invalid ${field}`);
	}
	return value;
}

function asNumber(value: unknown, field: string): number {
	if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
		throw new Error(`gh pr view returned invalid ${field}`);
	}
	return value;
}

function asBoolean(value: unknown, field: string): boolean {
	if (typeof value !== "boolean") {
		throw new Error(`gh pr view returned invalid ${field}`);
	}
	return value;
}

function mapMergeable(value: unknown): PrState["mergeable"] {
	switch (typeof value === "string" ? value.toUpperCase() : "") {
		case "MERGEABLE":
			return "mergeable";
		case "CONFLICTING":
			return "conflicting";
		default:
			return "unknown";
	}
}

/**
 * Reduce gh's statusCheckRollup values to the four states used by the gate.
 * CheckRun entries expose `status` and (once complete) `conclusion`; legacy
 * StatusContext entries expose `state` instead.
 */
export function extractPrCheckStatus(rollup: unknown): PrState["checks"] {
	if (!Array.isArray(rollup) || rollup.length === 0) {
		return "none";
	}

	let hasPending = false;
	let hasFailure = false;

	for (const item of rollup) {
		if (!isRecord(item)) {
			hasPending = true;
			continue;
		}

		const status = typeof item.status === "string" ? item.status.toUpperCase() : undefined;
		const conclusion =
			typeof item.conclusion === "string" ? item.conclusion.toUpperCase() : undefined;
		const state = typeof item.state === "string" ? item.state.toUpperCase() : undefined;

		// CheckRun status is authoritative while a run is queued or executing.
		if (status !== undefined) {
			if (status !== "COMPLETED") {
				hasPending = true;
				continue;
			}
			switch (conclusion) {
				case "SUCCESS":
				case "SKIPPED":
				case "NEUTRAL":
					continue;
				case "FAILURE":
				case "TIMED_OUT":
				case "CANCELLED":
				case "ACTION_REQUIRED":
				case "STARTUP_FAILURE":
				case "STALE":
				default:
					// A completed CheckRun with an unknown or unsuccessful
					// conclusion cannot prove that the check passed.
					hasFailure = true;
					continue;
			}
		}

		// StatusContext uses state rather than status/conclusion.
		if (state !== undefined) {
			switch (state) {
				case "SUCCESS":
					continue;
				case "PENDING":
				case "EXPECTED":
					hasPending = true;
					continue;
				default:
					hasFailure = true;
					continue;
			}
		}

		// Missing status metadata cannot prove a passing check.
		hasPending = true;
	}

	if (hasFailure) {
		return "fail";
	}
	if (hasPending) {
		return "pending";
	}
	return "pass";
}

function threadPage(result: unknown): {
	nodes: unknown[];
	hasNextPage: boolean;
	nextCursor?: string;
} {
	if (!isRecord(result)) {
		throw new Error("gh api graphql returned an invalid response");
	}
	const data = isRecord(result.data) ? result.data : undefined;
	if (!data || (Array.isArray(result.errors) && result.errors.length > 0)) {
		const errors = Array.isArray(result.errors)
			? result.errors.map((error) => (isRecord(error) && typeof error.message === "string" ? error.message : String(error))).join("; ")
			: "missing data";
		throw new Error(`gh api graphql returned errors: ${errors}`);
	}
	const repository = isRecord(data.repository) ? data.repository : undefined;
	const pullRequest = repository && isRecord(repository.pullRequest) ? repository.pullRequest : undefined;
	const threads = pullRequest && isRecord(pullRequest.reviewThreads) ? pullRequest.reviewThreads : undefined;
	if (!threads) {
		throw new Error("gh api graphql returned no reviewThreads connection");
	}
	const nodes = Array.isArray(threads.nodes) ? threads.nodes : [];
	const pageInfo = isRecord(threads.pageInfo) ? threads.pageInfo : undefined;
	const hasNextPage = pageInfo?.hasNextPage === true;
	const nextCursor = typeof pageInfo?.endCursor === "string" ? pageInfo.endCursor : undefined;
	if (hasNextPage && !nextCursor) {
		throw new Error("gh api graphql indicated another reviewThreads page without a cursor");
	}
	return { nodes, hasNextPage, nextCursor };
}

function countUnresolved(nodes: readonly unknown[]): number {
	let count = 0;
	for (const node of nodes) {
		if (isRecord(node) && node.isResolved === false) {
			count += 1;
		}
	}
	return count;
}

function ghAvailable(): boolean {
	const path = process.env.PATH ?? "";
	for (const directory of path.split(delimiter)) {
		if (!directory) continue;
		try {
			accessSync(join(directory, "gh"), constants.X_OK);
			return true;
		} catch {
			// Continue looking in PATH.
		}
	}
	return false;
}

function isGithubRemote(remoteUrl: string): boolean {
	try {
		const normalized = remoteUrl.trim();
		if (/^git@github\.com:/i.test(normalized)) return true;
		const parsed = new URL(normalized);
		return parsed.hostname.toLowerCase() === "github.com";
	} catch {
		return false;
	}
}

export class GhForge implements ForgePort {
	readonly kind = "github" as const;
	private readonly run: GhRunner;

	constructor(private readonly cwd: string, run?: GhRunner) {
		this.run = run ?? ((args) => runGh(this.cwd, args));
	}

	async fetchPr(branchOrNumber: string | number): Promise<PrState | undefined> {
		const viewResult = await this.run([
			"pr",
			"view",
			String(branchOrNumber),
			"--json",
			PR_JSON_FIELDS,
		]);
		if (viewResult.code !== 0) {
			if (NO_PULL_REQUEST.test(viewResult.stderr) || NO_PULL_REQUEST.test(viewResult.stdout)) {
				return undefined;
			}
			throw commandFailure("pr view", viewResult);
		}

		const value = parseJson(viewResult.stdout, "pr view");
		if (!isRecord(value)) {
			throw new Error("gh pr view returned an invalid pull request object");
		}
		const body = typeof value.body === "string" ? value.body : "";
		const number = asNumber(value.number, "number");
		const url = asString(value.url, "url");
		const headSha = asString(value.headRefOid, "headRefOid");
		const isDraft = asBoolean(value.isDraft, "isDraft");
		const unresolvedBlockingThreads = await this.fetchUnresolvedThreads(number);

		return {
			number,
			url,
			headSha,
			isDraft,
			mergeable: mapMergeable(value.mergeable),
			checks: extractPrCheckStatus(value.statusCheckRollup),
			unresolvedBlockingThreads,
			approvalRequired: value.reviewDecision === "REVIEW_REQUIRED",
			bodyDigest: sha256(body),
			fetchedAt: new Date().toISOString(),
		};
	}

	private async fetchUnresolvedThreads(number: number): Promise<number> {
		let cursor: string | undefined;
		let unresolved = 0;
		const seenCursors = new Set<string>();

		for (;;) {
			const args = [
				"api",
				"graphql",
				"-F",
				"owner={owner}",
				"-F",
				"name={repo}",
				"-F",
				`number=${number}`,
				"-f",
				`query=${THREADS_QUERY}`,
			];
			if (cursor !== undefined) {
				args.push("-f", `endCursor=${cursor}`);
			}

			const result = await this.run(args);
			if (result.code !== 0) {
				throw commandFailure("api graphql", result);
			}
			const page = threadPage(parseJson(result.stdout, "api graphql"));
			unresolved += countUnresolved(page.nodes);
			if (!page.hasNextPage) {
				return unresolved;
			}
			const nextCursor = page.nextCursor!;
			if (seenCursors.has(nextCursor)) {
				throw new Error(`gh api graphql repeated reviewThreads cursor ${nextCursor}`);
			}
			seenCursors.add(nextCursor);
			cursor = nextCursor;
		}
	}
}

export class NoForge implements ForgePort {
	readonly kind = "none" as const;

	async fetchPr(_branchOrNumber: string | number): Promise<PrState | undefined> {
		return undefined;
	}
}

export function detectForge(remoteUrl: string | undefined, cwd: string): ForgePort {
	if (remoteUrl && isGithubRemote(remoteUrl) && ghAvailable()) {
		return new GhForge(cwd);
	}
	return new NoForge();
}
