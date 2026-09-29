import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const AGENTS_DIR = fileURLToPath(new URL("../../agents/", import.meta.url));

/**
 * Model role a merge-ready agent is configured with (`model:` frontmatter of
 * agents/<id>.md, e.g. "@slow"). The controller derives reviewer model identity
 * from this instead of trusting the root session's claim.
 */
export async function agentModelRole(agentId: string, agentsDir: string = AGENTS_DIR): Promise<string | undefined> {
	if (!/^[A-Za-z0-9_-]+$/.test(agentId)) return undefined;
	let text: string;
	try {
		text = await readFile(`${agentsDir}${agentId}.md`, "utf8");
	} catch {
		return undefined;
	}
	const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? "";
	return /^model:\s*["']?([^"'\r\n]+?)["']?\s*$/m.exec(frontmatter)?.[1];
}
