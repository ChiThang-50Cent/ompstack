import type { ArtifactFingerprint, PstackRun } from "./domain.js";
import { isRecord } from "./utils.js";

const CONTRACT_START = "<!-- pstack-task-contract:start -->";
const CONTRACT_END = "<!-- pstack-task-contract:end -->";

function appendContract(task: string, contract: string): string {
  const cleaned = task.replace(new RegExp(`${CONTRACT_START}[\\s\\S]*?${CONTRACT_END}`, "g"), "").trimEnd();
  return `${cleaned}\n\n${CONTRACT_START}\n${contract}\n${CONTRACT_END}`;
}

function acceptanceText(run: PstackRun): string {
  const required = run.acceptance.filter(item => item.required);
  if (required.length === 0) return "No explicit acceptance criteria were recorded; verify the objective and original reproduction surface.";
  return required.map(item => `- ${item.id}: ${item.text}`).join("\n");
}

function writerIds(run: PstackRun): string[] {
  return run.agents
    .filter(agent => agent.role === "builder" || agent.role === "synthesizer")
    .map(agent => agent.actorId);
}

export interface RewriteOptions {
  run?: PstackRun;
  fingerprint?: ArtifactFingerprint;
}

export interface RewriteResult {
  input: Record<string, unknown>;
  changed: boolean;
  reasons: string[];
}

function rewriteItem(item: Record<string, unknown>, options: RewriteOptions, reasons: string[]): Record<string, unknown> {
  const agent = typeof item.agent === "string" ? item.agent.trim().toLowerCase() : "";
  let changed = false;
  const next = { ...item };

  if (agent.startsWith("pstack-") && next.schemaMode !== "strict") {
    next.schemaMode = "strict";
    changed = true;
    reasons.push(`${agent}: forced strict structured-output validation`);
  }

  if (agent === "pstack-verifier" && options.run) {
    const rawTask = typeof next.task === "string" ? next.task : "Verify the active pstack run.";
    const contract = [
      "PSTACK VERIFICATION CONTRACT",
      `Run: ${options.run.id}`,
      `Objective: ${options.run.objective}`,
      `Target fingerprint: ${options.fingerprint?.digest ?? "UNAVAILABLE - return INCONCLUSIVE unless you compute it"}`,
      `Writers: ${writerIds(options.run).join(", ") || "not recorded"}`,
      "Required acceptance:",
      acceptanceText(options.run),
      "Drive the real behavior surface. Do not edit files or call pstack_* tools: this child session is isolated from parent state.",
      "Return schema-valid PASS, FAIL, or INCONCLUSIVE output. Include a tested_fingerprint object, structured evidence, and one acceptance_results entry per required criterion.",
      "A PASS is invalid if the tested fingerprint differs from the target or evidence is absent.",
    ].join("\n");
    const updated = appendContract(rawTask, contract);
    if (updated !== rawTask) {
      next.task = updated;
      changed = true;
      reasons.push("pstack-verifier: attached artifact-bound verification contract");
    }
  }

  if (agent === "pstack-reviewer" && options.run) {
    const rawTask = typeof next.task === "string" ? next.task : "Review the active pstack artifact.";
    const contract = [
      "PSTACK REVIEW CONTRACT",
      `Run: ${options.run.id}`,
      `Frozen intent: ${options.run.objective}`,
      "Review the actual diff/artifact, not the builder's confidence statement.",
      "Every finding needs a concrete location, trigger, impact, and evidence or reproduction path.",
      "Do not edit the artifact and do not grant the final verification verdict.",
      "Return schema-valid structured output; the parent session owns all pstack state.",
    ].join("\n");
    next.task = appendContract(rawTask, contract);
    changed = true;
    reasons.push("pstack-reviewer: attached frozen-intent review contract");
  }

  return changed ? next : item;
}

export function rewriteTaskInput(input: Record<string, unknown>, options: RewriteOptions): RewriteResult {
  const reasons: string[] = [];
  let changed = false;
  const next = { ...input };

  if (Array.isArray(input.tasks)) {
    next.tasks = input.tasks.map(item => {
      if (!isRecord(item)) return item;
      const rewritten = rewriteItem(item, options, reasons);
      changed ||= rewritten !== item;
      return rewritten;
    });
  } else if (isRecord(input.task)) {
    const rewritten = rewriteItem(input.task, options, reasons);
    next.task = rewritten;
    changed ||= rewritten !== input.task;
  } else if (typeof input.agent === "string") {
    const rewritten = rewriteItem(input, options, reasons);
    changed ||= rewritten !== input;
    return { input: rewritten, changed, reasons };
  }

  return { input: changed ? next : input, changed, reasons };
}

export function taskInputContainsAgent(input: Record<string, unknown>, agentName: string): boolean {
  const expected = agentName.trim().toLowerCase();
  if (typeof input.agent === "string" && input.agent.trim().toLowerCase() === expected) return true;
  if (isRecord(input.task) && typeof input.task.agent === "string" && input.task.agent.trim().toLowerCase() === expected) return true;
  if (Array.isArray(input.tasks)) {
    return input.tasks.some(item => isRecord(item) && typeof item.agent === "string" && item.agent.trim().toLowerCase() === expected);
  }
  return false;
}
