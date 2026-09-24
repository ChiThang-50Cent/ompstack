import type { PstackConfig, PstackSessionState, RouterDecision } from "./domain.js";
import { truncate } from "./utils.js";

const START = "<!-- pstack-omp-policy:start -->";
const END = "<!-- pstack-omp-policy:end -->";

export function stripPstackPolicy(segments: readonly string[]): string[] {
  return segments.filter(segment => !(segment.includes(START) && segment.includes(END)));
}

function activeRunPolicy(state: PstackSessionState): string {
  const run = state.activeRun;
  if (!run) return "";
  const required = run.acceptance.filter(item => item.required);
  const passed = required.filter(item => item.state === "passed").length;
  const latestVerdict = run.verdicts.at(-1);
  return [
    `Active run: ${run.id}`,
    `Objective: ${run.objective}`,
    `Playbook: ${run.playbook}; ceremony: ${run.ceremony}; status: ${run.status}.`,
    `Required acceptance: ${passed}/${required.length} passed. Final verdict: ${latestVerdict?.verdict ?? "missing"}.`,
    run.goalRef
      ? `Completion gate: OMP goal ${run.goalRef}; goal op=complete is refused until the gates below pass.`
      : "Completion gate: auto/strict gate-only run; close it with pstack_gate action=check.",
    "Record acceptance, evidence, decisions, and verdicts with pstack tools; OMP owns planning and orchestration.",
    "The coordinator owns correctness. Subagent summaries are claims, not acceptance evidence.",
    "Do not finish while required criteria, independent verification, or artifact-bound evidence gates remain open.",
    "If work cannot continue, record INCONCLUSIVE evidence and abandon the run with a reason instead of claiming success.",
  ].join("\n");
}

function routerPolicy(decision: RouterDecision): string {
  if (decision.ceremony === "direct") {
    return [
      `Router suggestion: ${decision.playbook}/${decision.ceremony} (${Math.round(decision.confidence * 100)}% confidence).`,
      "Keep this task direct. Do not spawn a panel or create a pstack run unless new risk or cross-boundary scope appears.",
      "Still verify the changed behavior proportionately before reporting completion.",
    ].join("\n");
  }
  if (!decision.grounded) {
    const floor = decision.ceremony === "strict" || decision.ceremony === "program"
      ? `Risk signals set a ${decision.ceremony} ceremony floor: open proof state with pstack_gate action=init and an explicit playbook before implementation.`
      : "Size it yourself: a small, local, reversible edit stays direct (no pstack run; verify proportionately). Anything larger opens proof state with pstack_gate action=init and an explicit playbook before implementation.";
    return [
      "Router: no playbook signal in this request (keyword router; it cannot read intent or non-English text).",
      "Choose the playbook yourself from the routing table in skill://pstack; if no row fits, use its no-playbook-fits path instead of defaulting to feature.",
      floor,
      "Ground observable facts before design. Resolve empirical uncertainty by running or measuring, not by asking the user.",
    ].join("\n");
  }
  return [
    `Router suggestion: ${decision.playbook}/${decision.ceremony} (${Math.round(decision.confidence * 100)}% confidence).`,
    `Load skill://pstack/playbooks/${decision.playbook}.md for the workflow, unless a better row in the skill://pstack routing table fits the request; then use that one.`,
    "Open proof state with pstack_gate action=init, naming the playbook you chose, before implementation.",
    "Ground observable facts before design. Resolve empirical uncertainty by running or measuring, not by asking the user.",
    "Delegate bounded artifacts only; use an independent verifier for final acceptance.",
  ].join("\n");
}

export function buildPolicySegment(
  state: PstackSessionState,
  decision: RouterDecision,
  config: PstackConfig,
): string | undefined {
  if (state.mode === "off") return undefined;
  const body = state.activeRun ? activeRunPolicy(state) : routerPolicy(decision);
  return truncate(`${START}\n[PSTACK OMP - ${state.mode.toUpperCase()}]\n${body}\n${END}`, config.maxPolicyCharacters);
}
