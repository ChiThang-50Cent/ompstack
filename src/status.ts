import type { GateReport, PstackConfig, PstackSessionState } from "./domain.js";

export function renderState(state: PstackSessionState, config: PstackConfig, gate?: GateReport): string {
  const lines = [
    `Pstack mode: ${state.mode}`,
    `State version: ${state.version}`,
    `Audit files: ${config.writeAuditFiles ? "enabled" : "disabled"} (${config.auditDirectory})`,
  ];
  const run = state.activeRun;
  if (!run) {
    lines.push("Active run: none");
    return lines.join("\n");
  }
  const required = run.acceptance.filter(item => item.required);
  const passed = required.filter(item => item.state === "passed").length;
  const latest = run.verdicts.at(-1);
  lines.push(
    `Run: ${run.id}`,
    `Objective: ${run.objective}`,
    `Playbook / ceremony: ${run.playbook} / ${run.ceremony}`,
    `Status: ${run.status}${run.goalRef ? ` (gates OMP goal ${run.goalRef})` : " (gate-only)"}`,
    `Acceptance: ${passed}/${required.length} required passed`,
    `Evidence: ${run.evidence.length}; decisions: ${run.decisions.length}; agents: ${run.agents.length}`,
    `Latest verdict: ${latest ? `${latest.verdict} (${latest.scope})` : "none"}`,
    `Fingerprint: ${run.lastKnownFingerprint?.digest ?? "not recorded"}`,
  );
  if (gate) {
    lines.push(`Completion gate: ${gate.allowed ? "PASS" : "BLOCKED"}`);
    for (const candidate of gate.issues) lines.push(`- ${candidate.code}: ${candidate.message}`);
  }
  return lines.join("\n");
}
