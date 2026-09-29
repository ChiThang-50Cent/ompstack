import type { GitPort, PatchIdentity } from "./types.ts";

interface CommandResult {
	code: number;
	stdout: string;
	stderr: string;
}

/**
 * Thin, injectable git adapter.  It deliberately has no knowledge of the
 * controller state so patch identity can also be exercised against a real
 * repository in isolation.
 */
export class GitCli implements GitPort {
	readonly cwd: string;

	constructor(cwd: string) {
		this.cwd = cwd;
	}

	private async run(args: string[], stdin?: string): Promise<CommandResult> {
		const proc = Bun.spawn(["git", ...args], {
			cwd: this.cwd,
			stdin: stdin === undefined ? undefined : "pipe",
			stdout: "pipe",
			stderr: "pipe",
		});

		if (stdin !== undefined) {
			proc.stdin.write(stdin);
			proc.stdin.end();
		}

		const [stdout, stderr] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
		]);
		const code = await proc.exited;
		return { code, stdout, stderr };
	}

	private async checked(args: string[], stdin?: string): Promise<string> {
		const result = await this.run(args, stdin);
		if (result.code !== 0) {
			const detail = result.stderr.trim() || result.stdout.trim();
			throw new Error(`git ${args.join(" ")} failed (${result.code})${detail ? `: ${detail}` : ""}`);
		}
		return result.stdout;
	}

	async revParse(ref: string): Promise<string> {
		return (await this.checked(["rev-parse", ref])).trim();
	}

	async mergeBase(a: string, b: string): Promise<string> {
		return (await this.checked(["merge-base", a, b])).trim();
	}

	async diff(baseSha: string, headSha: string): Promise<string> {
		return this.checked(["diff", baseSha, headSha]);
	}

	async patchId(baseSha: string, headSha: string): Promise<string> {
		const diff = await this.checked(["diff", baseSha, headSha]);
		if (diff.length === 0) return "";

		const patchIdOutput = await this.checked(["patch-id", "--stable"], diff);
		return patchIdOutput.trim().split(/\s+/, 1)[0] ?? "";
	}

	/** Return whether a three-way merge of base and head is conflict-free. */
	async mergeTreeClean(base: string, head: string): Promise<boolean> {
		const result = await this.run(["merge-tree", "--write-tree", base, head]);
		if (result.code === 0) return true;
		if (result.code === 1) return false;
		const detail = result.stderr.trim() || result.stdout.trim();
		throw new Error(
			`git merge-tree --write-tree ${base} ${head} failed (${result.code})${detail ? `: ${detail}` : ""}`,
		);
	}

	async isClean(): Promise<boolean> {
		const status = await this.checked(["status", "--porcelain"]);
		return status.trim().length === 0;
	}

	async currentBranch(): Promise<string> {
		return (await this.checked(["rev-parse", "--abbrev-ref", "HEAD"])).trim();
	}

	async remoteUrl(name = "origin"): Promise<string | undefined> {
		const result = await this.run(["remote", "get-url", name]);
		if (result.code !== 0) return undefined;
		const url = result.stdout.trim();
		return url || undefined;
	}
	async defaultBranch(): Promise<string | undefined> {
		const result = await this.run(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]);
		if (result.code !== 0) return undefined;
		const ref = result.stdout.trim();
		return ref.startsWith("origin/") ? ref.slice("origin/".length) : ref || undefined;
	}

	async root(): Promise<string> {
		return (await this.checked(["rev-parse", "--show-toplevel"])).trim();
	}
}

/** Compute the semantic identity of the current HEAD against a base branch. */
export async function computePatchIdentity(
	git: GitPort,
	baseBranch: string,
): Promise<PatchIdentity> {
	const baseSha = await git.mergeBase(baseBranch, "HEAD");
	const headSha = await git.revParse("HEAD");
	const patchId = await git.patchId(baseSha, headSha);
	return { baseSha, headSha, patchId };
}
