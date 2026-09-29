import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agentModelRole } from "../extensions/merge-ready/agents.ts";

test("reviewer model roles come from the shipped agent definitions", async () => {
	expect(await agentModelRole("mr-code-reviewer-a")).toBe("@task");
	expect(await agentModelRole("mr-code-reviewer-b")).toBe("@slow");
	expect(await agentModelRole("mr-code-reviewer-c")).toBe("@default");
});

test("unknown agents and path-like ids yield no model role", async () => {
	expect(await agentModelRole("no-such-agent")).toBeUndefined();
	expect(await agentModelRole("../package")).toBeUndefined();
});

test("model is read only from frontmatter", async () => {
	const dir = await mkdtemp(join(tmpdir(), "omp-agents-"));
	try {
		await writeFile(join(dir, "x.md"), "---\nname: x\nmodel: '@slow'\n---\nmodel: \"@fast\"\n");
		expect(await agentModelRole("x", `${dir}/`)).toBe("@slow");
		await writeFile(join(dir, "y.md"), "---\nname: y\n---\nmodel: @fast\n");
		expect(await agentModelRole("y", `${dir}/`)).toBeUndefined();
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
