import { randomUUID } from "node:crypto";
import { appendFile, mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PstackConfig, PstackSessionState } from "./domain.js";
import { safeFileName } from "./utils.js";

export interface AuditEvent {
  at: string;
  type: string;
  data: unknown;
}

export function auditRunDirectory(cwd: string, config: PstackConfig, runId: string): string {
  return path.resolve(cwd, config.auditDirectory, safeFileName(runId));
}

async function atomicJson(filePath: string, value: unknown): Promise<void> {
  const temporary = `${filePath}.tmp-${process.pid}-${randomUUID()}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, filePath);
}

function renderRunReadme(state: PstackSessionState): string {
  const run = state.activeRun;
  if (!run) return "# Pstack run\n\nNo active run.\n";
  const acceptance = run.acceptance.length === 0
    ? "- No acceptance criteria recorded."
    : run.acceptance.map(item => `- [${item.state === "passed" ? "x" : " "}] ${item.id}: ${item.text} (${item.state})`).join("\n");
  const verdict = run.verdicts.at(-1);
  return [
    `# ${run.id}`,
    "",
    `- Objective: ${run.objective}`,
    `- Playbook: ${run.playbook}`,
    `- Ceremony: ${run.ceremony}`,
    `- Status: ${run.status}`,
    ...(run.goalRef ? [`- OMP goal: ${run.goalRef}`] : []),
    `- Created: ${run.createdAt}`,
    `- Updated: ${run.updatedAt}`,
    `- Final verdict: ${verdict?.verdict ?? "not recorded"}`,
    "",
    "## Acceptance",
    "",
    acceptance,
    "",
    "## Files",
    "",
    "- `state.json`: latest machine-readable state",
    "- `events.jsonl`: append-only audit trail",
    "- `evidence.jsonl`: evidence records",
    "- `decisions.jsonl`: decision records",
    "- `verdicts.jsonl`: verifier verdicts",
    "",
  ].join("\n");
}

export async function writeAuditSnapshot(
  cwd: string,
  config: PstackConfig,
  state: PstackSessionState,
  event?: AuditEvent,
): Promise<void> {
  if (!config.writeAuditFiles || !state.activeRun) return;
  const directory = auditRunDirectory(cwd, config, state.activeRun.id);
  await mkdir(directory, { recursive: true });
  await atomicJson(path.join(directory, "state.json"), state);
  await writeFile(path.join(directory, "README.md"), renderRunReadme(state), "utf8");
  if (event) {
    await appendFile(path.join(directory, "events.jsonl"), `${JSON.stringify(event)}\n`, "utf8");
  }
  const run = state.activeRun;
  await writeFile(path.join(directory, "evidence.jsonl"), run.evidence.map(item => JSON.stringify(item)).join("\n") + (run.evidence.length ? "\n" : ""), "utf8");
  await writeFile(path.join(directory, "decisions.jsonl"), run.decisions.map(item => JSON.stringify(item)).join("\n") + (run.decisions.length ? "\n" : ""), "utf8");
  await writeFile(path.join(directory, "verdicts.jsonl"), run.verdicts.map(item => JSON.stringify(item)).join("\n") + (run.verdicts.length ? "\n" : ""), "utf8");
}
