import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addReceipt } from "../extensions/merge-ready/evidence.ts";
import { evaluateGate } from "../extensions/merge-ready/gate.ts";
import { GitCli, computePatchIdentity, resolveBaseRef } from "../extensions/merge-ready/patch.ts";
import { createRun, proposeContract } from "../extensions/merge-ready/state.ts";
import type { EvidenceReceipt, RunState } from "../extensions/merge-ready/types.ts";

async function git(cwd: string, ...args: string[]): Promise<string> {
	const proc = Bun.spawn(["git", ...args], {
		cwd,
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	const code = await proc.exited;
	if (code !== 0) throw new Error(`git ${args.join(" ")} failed: ${stderr}`);
	return stdout.trim();
}

async function commit(cwd: string, message: string): Promise<string> {
	await git(cwd, "add", ".");
	await git(cwd, "commit", "-m", message);
	return git(cwd, "rev-parse", "HEAD");
}

test("patch-id stays stable across an equivalent rebase and changes with content", async () => {
	const root = await mkdtemp(join(tmpdir(), "omp-merge-ready-patch-"));
	try {
		await git(root, "init", "-b", "main");
		await git(root, "config", "user.email", "test@example.com");
		await git(root, "config", "user.name", "Merge Ready Test");
		await writeFile(join(root, "app.txt"), "value=1\n");
		await commit(root, "base");
		await git(root, "checkout", "-b", "feature");
		await writeFile(join(root, "app.txt"), "value=2\n");
		await commit(root, "feature change");

		const gitPort = new GitCli(root);
		const beforeRebase = await computePatchIdentity(gitPort, "main");
		await git(root, "checkout", "main");
		await writeFile(join(root, "README"), "unrelated base change\n");
		await commit(root, "advance base");
		await git(root, "checkout", "feature");
		await git(root, "rebase", "main");

		const afterRebase = await computePatchIdentity(gitPort, "main");
		expect(afterRebase.patchId).toBe(beforeRebase.patchId);
		expect(afterRebase.headSha).not.toBe(beforeRebase.headSha);
		expect(afterRebase.baseSha).not.toBe(beforeRebase.baseSha);

		await writeFile(join(root, "app.txt"), "value=3\n");
		await commit(root, "different feature change");
		const changed = await computePatchIdentity(gitPort, "main");
		expect(changed.patchId).not.toBe(afterRebase.patchId);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("base resolution prefers the remote-tracking ref over a stale local branch", async () => {
	const root = await mkdtemp(join(tmpdir(), "omp-merge-ready-remote-base-"));
	try {
		await git(root, "init", "-b", "main");
		await git(root, "config", "user.email", "test@example.com");
		await git(root, "config", "user.name", "Merge Ready Test");
		await writeFile(join(root, "a.txt"), "1\n");
		await commit(root, "c0");
		await git(root, "checkout", "-b", "release");
		await writeFile(join(root, "b.txt"), "release work\n");
		const releaseTip = await commit(root, "release work");
		await git(root, "update-ref", "refs/remotes/origin/release", releaseTip);
		await git(root, "checkout", "-b", "feature");
		await writeFile(join(root, "a.txt"), "2\n");
		await commit(root, "feature");

		const gitPort = new GitCli(root);
		expect(await resolveBaseRef(gitPort, "release")).toBe("origin/release");
		expect((await computePatchIdentity(gitPort, "release")).baseSha).toBe(releaseTip);
		// No remote-tracking ref for `main`: the local branch is used as-is.
		expect(await resolveBaseRef(gitPort, "main")).toBe("main");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("conflicting merge-tree evidence blocks a local merge-ready gate", async () => {
	const root = await mkdtemp(join(tmpdir(), "omp-merge-ready-conflict-"));
	try {
		await git(root, "init", "-b", "main");
		await git(root, "config", "user.email", "test@example.com");
		await git(root, "config", "user.name", "Merge Ready Test");
		await writeFile(join(root, "conflict.txt"), "base\n");
		await commit(root, "base");
		await git(root, "checkout", "-b", "feature");
		await writeFile(join(root, "conflict.txt"), "feature\n");
		await commit(root, "feature");
		await git(root, "checkout", "main");
		await writeFile(join(root, "conflict.txt"), "main\n");
		await commit(root, "main");
		await git(root, "checkout", "feature");

		const gitPort = new GitCli(root);
		expect(await gitPort.mergeTreeClean("main", "HEAD")).toBe(false);
		const baseSha = await gitPort.revParse("main");
		const headSha = await gitPort.revParse("HEAD");
		let state = createRun({
			runId: "local-conflict",
			intent: "intent",
			repo: { root, baseBranch: "main", startBranch: "feature" },
			forge: "none",
			now: "2026-01-01T00:00:00Z",
		});
		state = proposeContract(
			state,
			{
				summary: "local conflict",
				acceptance: [{
					id: "AC-1",
					behavior: "works",
					source: "derived",
					confidence: "high",
					required: true,
				}],
				constraints: [],
				verificationPlan: ["test"],
				rigor: "LOW",
				openQuestions: [],
				rootCause: {
					statement: "The old path lacks the requested behavior.",
					evidence: [{ kind: "command", ref: "repro", exitCode: 1 }],
				},
				siblingSites: [
					{
						location: "extensions/other",
						relation: "same lifecycle",
						decision: "unrelated",
						rationale: "The sibling is not affected.",
					},
				],
				behaviorMatrix: [
					{ dimension: "inverse_direction", expectation: "n/a", rationale: "One-way operation." },
					{ dimension: "round_trip", expectation: "n/a", rationale: "No reverse representation." },
					{ dimension: "backward_compat", expectation: "existing callers remain supported" },
				],
			},
			"2026-01-01T00:00:01Z",
		);
		state = {
			...state,
			phase: "FINAL_GATE",
			patch: { baseSha, headSha, patchId: "non-empty" },
			workingTreeClean: true,
			issuedPacketDigests: [{ digest: "packet", patchId: "non-empty", contractVersion: 1 }],
		};
		const receipt = (
			kind: EvidenceReceipt["kind"],
			id: string,
			producer: EvidenceReceipt["producer"],
			status: EvidenceReceipt["status"] = "pass",
		): Omit<EvidenceReceipt, "runId" | "stale" | "staleReason"> => ({
			id,
			kind,
			producer,
			baseSha,
			headSha,
			patchId: "non-empty",
			contractVersion: 1,
			status,
			covers: kind === "self_verification" ? ["AC-1"] : undefined,
			packetDigest: kind === "code_review" ? "packet" : undefined,
			evidence: [{ kind: "command", ref: id, exitCode: status === "fail" ? 1 : 0 }],
			summary: id,
			createdAt: "2026-01-01T00:00:02Z",
		});
		state = addReceipt(state, receipt("self_verification", "self", { type: "script", id: "self" }));
		state = addReceipt(state, receipt("code_review", "review", { type: "agent", id: "review" }));
		state = addReceipt(state, receipt("ci", "ci", { type: "script", id: "local-checks" }));
		state = addReceipt(
			state,
			receipt("mergeability", "merge-tree", { type: "script", id: "git-merge-tree" }, "fail"),
		);
		const gate = evaluateGate(state);
		expect(gate.status).toBe("blocked");
		expect(gate.failed.some((message) => message.includes("mergeability"))).toBe(true);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
