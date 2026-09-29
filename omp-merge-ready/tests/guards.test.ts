import { expect, test } from "bun:test";

import { classifyCommand, touchesControllerState } from "../extensions/merge-ready/guards.ts";

test("classifies dangerous commands by shell structure", () => {
	expect(classifyCommand("gh pr merge 1").kind).toBe("merge");
	expect(classifyCommand("cd x && git push --force").kind).toBe("force_push");
	expect(classifyCommand("git push --force-with-lease origin feature").kind).toBe("force_push");
	expect(classifyCommand("git push origin +feature:feature").kind).toBe("force_push");
	expect(classifyCommand("git reset --hard HEAD~1").kind).toBe("hard_reset");
	expect(classifyCommand("FOO=1 git -C repo push -f origin feature").kind).toBe("force_push");
});

test("does not classify dangerous words in ordinary arguments", () => {
	expect(classifyCommand('echo "gh pr merge"').kind).toBe("ok");
	expect(classifyCommand("git push origin main").kind).toBe("ok");
	expect(classifyCommand("git log --hard").kind).toBe("ok");
	expect(classifyCommand("printf '%s' 'git reset --hard'").kind).toBe("ok");
});

test("inspects command substitutions without treating quoted prose as commands", () => {
	expect(classifyCommand("echo $(gh pr merge 1)").kind).toBe("merge");
	expect(classifyCommand("echo \"$(git push --force)\"").kind).toBe("force_push");
	expect(classifyCommand("echo '$(git push --force)'").kind).toBe("ok");
	expect(classifyCommand("echo gh pr merge 1").kind).toBe("ok");
});

test("recognizes controller state paths with boundaries", () => {
	const baseDir = "/tmp/omp-merge-ready-state";
	expect(touchesControllerState(`${baseDir}/runs/run-1/state.json`, baseDir)).toBe(true);
	expect(touchesControllerState(`cat '${baseDir}/runs/run-1/state.json'`, baseDir)).toBe(true);
	expect(touchesControllerState("/tmp/omp-merge-ready-state-old/file", baseDir)).toBe(false);
	expect(touchesControllerState("/tmp/unrelated/state.json", baseDir)).toBe(false);
});

test("treats an unquoted newline as a command separator", () => {
	expect(classifyCommand(`echo hi
gh pr merge 1`).kind).toBe("merge");
});

test("recurses through shell -c flags, backticks, and eval", () => {
	expect(classifyCommand("sh -c 'gh pr merge 1'").kind).toBe("merge");
	expect(classifyCommand("bash -lc 'git push --force origin main'").kind).toBe("force_push");
	expect(classifyCommand("zsh -ec 'git reset --hard HEAD'").kind).toBe("hard_reset");
	expect(classifyCommand("echo `gh pr merge 1`").kind).toBe("merge");
	expect(classifyCommand("eval git push --force origin main").kind).toBe("force_push");
});

test("blocks GitHub REST and GraphQL merge APIs", () => {
	expect(classifyCommand("gh api --method POST repos/o/r/pulls/12/merge").kind).toBe("merge");
	expect(classifyCommand("gh api graphql -f query=mergePullRequest").kind).toBe("merge");
	expect(classifyCommand("gh api graphql -f query=enablePullRequestAutoMerge").kind).toBe("merge");
	expect(classifyCommand("gh --repo o/r pr merge 12").kind).toBe("merge");
});

test("recurses through command wrappers and their option values", () => {
	const mergeCommands = [
		"sudo -u alice gh pr merge 1",
		"command gh pr merge 1",
		"exec gh pr merge 1",
		"env VAR=1 gh pr merge 1",
		"env -u SECRET gh pr merge 1",
		"time gh pr merge 1",
		"timeout --preserve-status 10s gh pr merge 1",
		"nohup gh pr merge 1",
		"xargs -0 gh pr merge 1",
	];
	for (const command of mergeCommands) expect(classifyCommand(command).kind).toBe("merge");
	expect(classifyCommand("sudo -g release git push --force origin main").kind).toBe("force_push");
	expect(classifyCommand("nice -n 5 git push --force origin main").kind).toBe("force_push");
});

test("handles git global options before the subcommand", () => {
	expect(classifyCommand("git -C repo push --force origin main").kind).toBe("force_push");
	expect(classifyCommand("git -c key=value push --force origin main").kind).toBe("force_push");
	expect(classifyCommand("git --git-dir=repo push --force origin main").kind).toBe("force_push");
	expect(classifyCommand("git --work-tree repo push --force origin main").kind).toBe("force_push");
});
