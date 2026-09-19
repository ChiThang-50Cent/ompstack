import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const CUSTOM_TYPE_PREFIX = "io.github.chithang-50cent.ompstack.";

const ENTRY_TYPES = Object.freeze({
  activation: `${CUSTOM_TYPE_PREFIX}route-activation.v1`,
  decision: `${CUSTOM_TYPE_PREFIX}route-decision.v1`,
  decisionState: `${CUSTOM_TYPE_PREFIX}route-decision-state.v1`,
  evidence: `${CUSTOM_TYPE_PREFIX}route-evidence.v1`,
  block: `${CUSTOM_TYPE_PREFIX}route-block.v1`,
  skip: `${CUSTOM_TYPE_PREFIX}route-skip.v1`,
});
const EVIDENCE_LANES = Object.freeze(["reviewer", "verifier", "security-reviewer"]);

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function stringOrNull(value) {
  return typeof value === "string" && value !== "" ? value : null;
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value !== ""))];
}

function parseSessionEntries(sessionText) {
  if (typeof sessionText !== "string") throw new TypeError("session JSONL must be a string");
  const entries = [];
  for (const [index, line] of sessionText.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`session JSONL line ${index + 1} is not JSON: ${detail}`);
    }
  }
  return entries;
}

export function parseSessionReport(session) {
  const entries = Array.isArray(session) ? session : parseSessionEntries(session);
  const customEntries = entries.filter((entry) => {
    const candidate = object(entry);
    return candidate?.type === "custom" && typeof candidate.customType === "string" && candidate.customType.startsWith(CUSTOM_TYPE_PREFIX);
  });
  const byType = (type) => customEntries.filter((entry) => entry.customType === type);
  const activationEntries = byType(ENTRY_TYPES.activation);
  const decisionEntries = byType(ENTRY_TYPES.decision);
  const stateEntries = byType(ENTRY_TYPES.decisionState);
  const evidenceEntries = byType(ENTRY_TYPES.evidence);
  const blockEntries = byType(ENTRY_TYPES.block);
  const skipEntries = byType(ENTRY_TYPES.skip);
  const activationSources = activationEntries.map((entry) => stringOrNull(object(entry.data)?.source));
  const routeCalls = decisionEntries.map((entry) => {
    const data = object(entry.data) ?? {};
    const decisionId = stringOrNull(data.decisionId);
    const states = stateEntries
      .map((stateEntry) => object(stateEntry.data))
      .filter((state) => state?.decisionId === decisionId);
    const latestState = states.at(-1) ?? null;
    const declaredRiskFacts = object(data.declaredRiskFacts) ?? object(data.riskFacts);
    return {
      decisionId,
      risk: stringOrNull(data.risk),
      targets: Array.isArray(data.targets) ? data.targets.filter((target) => typeof target === "string") : [],
      riskFacts: declaredRiskFacts,
      measurementPurpose: stringOrNull(data.measurementPurpose),
      state: stringOrNull(latestState?.state),
      reason: stringOrNull(latestState?.reason),
    };
  });
  const latestDecisionId = routeCalls.at(-1)?.decisionId ?? null;
  const latestDecisionData = object(decisionEntries.at(-1)?.data);
  const requiredEvidence = uniqueStrings(Array.isArray(latestDecisionData?.requiredIndependentEvidence) ? latestDecisionData.requiredIndependentEvidence : []);
  const observedEvidence = uniqueStrings(
    evidenceEntries
      .map((entry) => object(entry.data))
      .filter((data) => data?.decisionId === latestDecisionId)
      .map((data) => data?.evidence),
  );
  const evidenceLanes = EVIDENCE_LANES.filter((lane) => requiredEvidence.includes(lane) || observedEvidence.includes(lane));
  const blocks = blockEntries.map((entry) => {
    const data = object(entry.data) ?? {};
    return {
      toolName: stringOrNull(data.toolName),
      reason: stringOrNull(data.reason),
      decisionId: stringOrNull(data.decisionId),
      path: stringOrNull(data.path),
    };
  });
  const skips = skipEntries.map((entry) => {
    const data = object(entry.data) ?? {};
    return {
      reason: stringOrNull(data.reason),
      firstToolName: stringOrNull(data.firstToolName),
    };
  });
  return {
    schemaVersion: 1,
    activation: activationEntries.length === 0 ? null : activationSources[0] ?? "unknown",
    activationSources,
    routeCalls,
    blocks,
    skips,
    evidence: {
      decisionId: latestDecisionId,
      required: requiredEvidence,
      observed: observedEvidence,
      missing: requiredEvidence.filter((lane) => !observedEvidence.includes(lane)),
      lanes: evidenceLanes,
    },
    materialStale: stateEntries.filter((entry) => object(entry.data)?.state === "material-stale").length,
  };
}

function compactObject(value) {
  if (!value) return "{}";
  return `{${Object.keys(value).sort().map((key) => `${key}:${JSON.stringify(value[key])}`).join(",")}}`;
}

export function formatSessionReport(report) {
  const activationText = report.activation === null ? "(không có)" : report.activation === "unknown" ? "(không rõ source)" : report.activation;
  const lines = [
    `activation      : ${activationText}`,
    `route calls     : ${report.routeCalls.length}`,
  ];
  report.routeCalls.forEach((route, index) => {
    let line = `  #${index + 1} risk=${route.risk ?? "unknown"} targets=[${route.targets.join(", ")}]`;
    if (route.riskFacts) line += ` riskFacts=${compactObject(route.riskFacts)}`;
    if (route.reason) line += ` reason=${route.reason}`;
    lines.push(line);
  });
  lines.push(`blocks          : ${report.blocks.length}`);
  for (const block of report.blocks) {
    lines.push(`  ${block.toolName ?? "unknown"} ${block.path ?? "—"} ${block.reason ?? "unknown"}`);
  }
  const firstSkip = report.skips[0];
  const skipSummary = firstSkip ? `  (${firstSkip.reason ?? "unknown"}, first tool: ${firstSkip.firstToolName ?? "unknown"})` : "";
  lines.push(`skips           : ${report.skips.length}${skipSummary}`);
  const evidenceSummary = report.evidence.lanes.length === 0
    ? "none"
    : report.evidence.lanes.map((lane) => `${lane} ${report.evidence.observed.includes(lane) ? "✓" : "✗"}`).join(" ");
  lines.push(`evidence        : ${evidenceSummary}`);
  lines.push(`material stale  : ${report.materialStale}`);
  return lines.join("\n");
}

function usage() {
  return [
    "Usage:",
    "  bun scripts/session-report.mjs --session <path/to/session.jsonl> [--json]",
  ].join("\n");
}

function parseArguments(args) {
  let session;
  let json = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--json") {
      json = true;
      continue;
    }
    if (argument === "--session") {
      session = args[++index];
      continue;
    }
    if (argument.startsWith("--session=")) {
      session = argument.slice("--session=".length);
      continue;
    }
    throw new Error(`unknown argument: ${argument}`);
  }
  if (!session) throw new Error(usage());
  return { session, json };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArguments(process.argv.slice(2));
    const report = parseSessionReport(await readFile(options.session, "utf8"));
    console.log(options.json ? JSON.stringify(report, null, 2) : formatSessionReport(report));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
