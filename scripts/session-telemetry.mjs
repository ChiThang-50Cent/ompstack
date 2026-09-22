import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseSessionReport } from "./session-report.mjs";
const EVIDENCE_ALIASES = Object.freeze({
  reviewer: "reviewer",
  verifier: "verifier",
  "ompstack-verifier": "verifier",
  "security-reviewer": "security-reviewer",
});
const TOOL_START_TYPE = "tool_execution_start";
const ROUTE_TOOL_TYPE = "io.github.chithang-50cent.ompstack.route-tool.v1";
const REFERENCE = /^(?:agent|artifact|history):\/\/\S+$/;

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function stringOrNull(value) {
  return typeof value === "string" && value !== "" ? value : null;
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value !== ""))];
}
function requestedEvidence(args) {
  const candidate = object(args);
  if (!Array.isArray(candidate?.tasks)) return [];
  return uniqueStrings(candidate.tasks
    .map((task) => stringOrNull(object(task)?.agent))
    .map((agent) => EVIDENCE_ALIASES[agent] ?? null)
    .filter((agent) => agent !== null));
}


function collectReferences(value, references = [], seen = new Set(), depth = 0) {
  if (references.length >= 8 || depth > 5) return references;
  if (typeof value === "string") {
    if (REFERENCE.test(value) && !references.includes(value)) references.push(value);
    return references;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectReferences(item, references, seen, depth + 1);
    return references;
  }
  const candidate = object(value);
  if (candidate === null || seen.has(candidate)) return references;
  seen.add(candidate);
  for (const item of Object.values(candidate)) collectReferences(item, references, seen, depth + 1);
  return references;
}
function collectTaskReferences(value, references = []) {
  if (references.length >= 8) return references;
  const candidate = object(value);
  const details = object(candidate?.details);
  const metadata = [
    ...(Array.isArray(details?.results) ? details.results : []),
    ...(Array.isArray(details?.progress) ? details.progress : []),
  ];
  for (const result of metadata) {
    if (references.length >= 8) break;
    const id = object(result)?.id;
    if (typeof id !== "string" || id === "") continue;
    const reference = `agent://${id}`;
    if (REFERENCE.test(reference) && !references.includes(reference)) references.push(reference);
  }
  return references;
}
function completedTaskAgents(entry) {
  const candidate = object(entry);
  if (candidate?.type !== "custom_message" || candidate.customType !== "async-result" || typeof candidate.content !== "string") return [];
  return [...candidate.content.matchAll(/<task-result\s+id="([^"]+)"\s+agent="([^"]+)"/g)]
    .map((match) => ({ id: match[1], evidence: EVIDENCE_ALIASES[match[2]] ?? null }))
    .filter((result) => result.id !== "" && result.evidence !== null);
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

function timestamp(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}
const DEFAULT_TEST_COMMAND_PATTERN = "\\b(?:pytest|tox|nox|unittest|mvn|gradle|go\\s+test|cargo\\s+test)\\b";

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function textBytes(content) {
  if (!Array.isArray(content)) return 0;
  return content.reduce((total, item) => total + (typeof item?.text === "string" ? Buffer.byteLength(item.text) : 0), 0);
}

export function collectCostTelemetry(entries, testCommandPattern = DEFAULT_TEST_COMMAND_PATTERN) {
  const testPattern = new RegExp(testCommandPattern);
  const tokens = { input: 0, output: 0, cache_read: 0, cache_write: 0, total: 0 };
  const byTool = {};
  let modelTurns = 0;
  let capturedOutputBytes = 0;
  let testCommandReinvocations = 0;
  let compactionEvents = 0;
  let pruningEvents = 0;
  const timestamps = [];

  for (const entry of entries) {
    const eventTimestamp = timestamp(entry?.timestamp);
    if (eventTimestamp !== null) timestamps.push(eventTimestamp);
    if (entry?.type === "message" && entry.message?.role === "assistant") {
      const usage = object(entry.message.usage);
      if (usage !== null) {
        modelTurns += 1;
        tokens.input += finiteNumber(usage.input);
        tokens.output += finiteNumber(usage.output);
        tokens.cache_read += finiteNumber(usage.cacheRead);
        tokens.cache_write += finiteNumber(usage.cacheWrite);
        tokens.total += typeof usage.totalTokens === "number" && Number.isFinite(usage.totalTokens)
          ? usage.totalTokens
          : finiteNumber(usage.input) + finiteNumber(usage.output) + finiteNumber(usage.cacheRead) + finiteNumber(usage.cacheWrite);
      }
      for (const item of entry.message.content ?? []) {
        if (item?.type !== "toolCall") continue;
        const name = stringOrNull(item.name) ?? "unknown";
        byTool[name] = (byTool[name] ?? 0) + 1;
      }
    }
    if (entry?.type === "message" && entry.message?.role === "toolResult") {
      capturedOutputBytes += textBytes(entry.message.content);
    }
    if (entry?.type === "custom" && entry.customType === TOOL_START_TYPE && entry.data?.toolName === "bash") {
      testPattern.lastIndex = 0;
      if (testPattern.test(entry.data.args?.command ?? "")) testCommandReinvocations += 1;
    }
    if (entry?.type === "custom" && /compact/i.test(entry.customType ?? "")) compactionEvents += 1;
    if ((entry?.type === "custom" && /prun/i.test(entry.customType ?? "")) || entry?.prunedAt) pruningEvents += 1;
  }

  return {
    model_turns: modelTurns,
    tokens,
    tool_invocations: {
      total: Object.values(byTool).reduce((sum, count) => sum + count, 0),
      by_tool: byTool,
      captured_output_bytes: capturedOutputBytes,
    },
    test_command_reinvocations: testCommandReinvocations,
    compaction_events: compactionEvents,
    pruning_events: pruningEvents,
    wall_time_ms: timestamps.length > 1 ? Math.max(...timestamps) - Math.min(...timestamps) : null,
  };
}


function toolCallFromAssistant(entry, sequence) {
  const message = object(entry.message);
  if (message?.role !== "assistant" || !Array.isArray(message.content)) return null;
  const call = message.content.find((item) => object(item)?.type === "toolCall");
  const data = object(call);
  if (data === null || typeof data.id !== "string") return null;
  return { toolCallId: data.id, toolName: stringOrNull(data.name), args: data.arguments, sequence };
}

function toolResultFromMessage(entry) {
  const message = object(entry.message);
  if (message?.role !== "toolResult" || typeof message.toolCallId !== "string") return null;
  const references = collectReferences(message);
  if (message.toolName === "task") collectTaskReferences(message, references);
  return {
    toolCallId: message.toolCallId,
    toolName: stringOrNull(message.toolName),
    isError: message.isError === true,
    timestamp: timestamp(message.timestamp ?? entry.timestamp),
    references,
  };
}

export function parseSessionTelemetry(session, { testCommandPattern = DEFAULT_TEST_COMMAND_PATTERN } = {}) {
  const entries = Array.isArray(session) ? session : parseSessionEntries(session);
  const starts = new Map();
  const assistantCalls = new Map();
  const results = new Map();
  const routeEvents = new Map();
  const completedAgents = [];
  entries.forEach((entry, sequence) => {
    const candidate = object(entry);
    if (candidate?.type === "custom" && candidate.customType === TOOL_START_TYPE) {
      const data = object(candidate.data);
      if (data?.toolCallId) starts.set(data.toolCallId, { ...data, sequence });
    }
    const assistantCall = toolCallFromAssistant(candidate ?? {}, sequence);
    if (assistantCall) assistantCalls.set(assistantCall.toolCallId, assistantCall);
    const result = toolResultFromMessage(candidate ?? {});
    if (result) results.set(result.toolCallId, result);
    completedAgents.push(...completedTaskAgents(candidate ?? {}));
    if (candidate?.type === "custom" && candidate.customType === ROUTE_TOOL_TYPE) {
      const data = object(candidate.data);
      if (data?.toolCallId) {
        const existing = routeEvents.get(data.toolCallId) ?? {};
        routeEvents.set(data.toolCallId, { ...existing, [data.phase]: { ...data, sequence } });
      }
    }
  });

  const toolCallIds = new Set([...starts.keys(), ...assistantCalls.keys(), ...results.keys(), ...routeEvents.keys()]);
  const tools = [...toolCallIds].map((toolCallId) => {
    const start = starts.get(toolCallId);
    const assistantCall = assistantCalls.get(toolCallId);
    const result = results.get(toolCallId);
    const route = routeEvents.get(toolCallId) ?? {};
    const call = route.call ?? {};
    const end = route.end ?? {};
    const toolName = stringOrNull(call.toolName) ?? stringOrNull(start?.toolName) ?? assistantCall?.toolName ?? result?.toolName;
    const requested = requestedEvidence(start?.args ?? assistantCall?.args);
    const completedReferences = toolName === "task"
      ? completedAgents.filter((agent) => requested.includes(agent.evidence)).map((agent) => `agent://${agent.id}`)
      : [];
    const startedAt = timestamp(start?.startedAt);
    const completedAt = timestamp(end.timestamp) ?? result?.timestamp ?? null;
    const durationMs = startedAt !== null && completedAt !== null && completedAt >= startedAt ? completedAt - startedAt : null;
    const references = uniqueStrings([
      ...collectReferences(end.references),
      ...(result?.references ?? []),
      ...completedReferences,
    ]);
    const sequence = Math.min(start?.sequence ?? Infinity, assistantCall?.sequence ?? Infinity, call.sequence ?? Infinity);
    return {
      toolCallId,
      toolName,
      decisionId: stringOrNull(call.decisionId) ?? stringOrNull(end.decisionId),
      disposition: stringOrNull(call.disposition) ?? "unobserved",
      reason: stringOrNull(call.reason),
      paths: Array.isArray(call.paths) ? call.paths.filter((path) => typeof path === "string") : [],
      requestedEvidence: requested,
      outcome: stringOrNull(end.outcome) ?? (result ? (result.isError ? "error" : "success") : "incomplete"),
      startedAt,
      completedAt,
      durationMs,
      references,
      sequence: Number.isFinite(sequence) ? sequence : null,
    };
  }).sort((left, right) => (left.sequence ?? Infinity) - (right.sequence ?? Infinity));

  const report = parseSessionReport(entries);
  const requiredEvidence = new Set(report.evidence.required);
  const inferredEvidenceAttempts = report.evidence.decisionId === null ? [] : tools.flatMap((tool) => {
    if (tool.toolName !== "task") return [];
    return tool.requestedEvidence
      .filter((evidence) => requiredEvidence.has(evidence))
      .map((evidence) => ({
        decisionId: tool.decisionId ?? report.evidence.decisionId,
        evidence,
        toolCallId: tool.toolCallId,
        outcome: tool.outcome,
        references: tool.references,
      }));
  });
  const attemptsByKey = new Map();
  for (const attempt of [...report.evidenceAttempts, ...inferredEvidenceAttempts]) {
    attemptsByKey.set(`${attempt.decisionId}:${attempt.evidence}:${attempt.toolCallId}`, attempt);
  }
  const toolByCallId = new Map(tools.map((tool) => [tool.toolCallId, tool]));
  const evidenceAttempts = [...attemptsByKey.values()].map((attempt) => ({
    ...attempt,
    references: uniqueStrings([
      ...(Array.isArray(attempt.references) ? attempt.references : []),
      ...(toolByCallId.get(attempt.toolCallId)?.references ?? []),
    ]),
  }));
  const latestEvidenceAttempts = evidenceAttempts.filter((attempt) => attempt.decisionId === report.evidence.decisionId);
  const ompstack = {
    ...report,
    evidenceAttempts,
    evidence: {
      ...report.evidence,
      attempts: latestEvidenceAttempts,
      references: uniqueStrings(latestEvidenceAttempts.flatMap((attempt) => attempt.references)),
    },
  };

  const byTool = {};
  for (const tool of tools) {
    const name = tool.toolName ?? "unknown";
    const metric = byTool[name] ??= { calls: 0, successes: 0, errors: 0, incomplete: 0, blocked: 0 };
    metric.calls += 1;
    if (tool.outcome === "success") metric.successes += 1;
    if (tool.outcome === "error") metric.errors += 1;
    if (tool.outcome === "incomplete") metric.incomplete += 1;
    if (tool.disposition === "blocked") metric.blocked += 1;
  }
  const cost = collectCostTelemetry(entries, testCommandPattern);
  return {
    schemaVersion: 1,
    tools,
    metrics: {
      calls: tools.length,
      successes: tools.filter((tool) => tool.outcome === "success").length,
      errors: tools.filter((tool) => tool.outcome === "error").length,
      incomplete: tools.filter((tool) => tool.outcome === "incomplete").length,
      blocked: tools.filter((tool) => tool.disposition === "blocked").length,
      byTool,
    },
    cost,
    evidenceAttempts,
    ompstack,
  };
}

function usage() {
  return [
    "Usage:",
    "  bun scripts/session-telemetry.mjs --session <path/to/session.jsonl> [--test-command-pattern <regex>] [--json]",
  ].join("\n");
}

function parseArguments(args) {
  let session;
  let json = false;
  let testCommandPattern = DEFAULT_TEST_COMMAND_PATTERN;
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
    if (argument === "--test-command-pattern") {
      testCommandPattern = args[++index];
      continue;
    }
    if (argument.startsWith("--test-command-pattern=")) {
      testCommandPattern = argument.slice("--test-command-pattern=".length);
      continue;
    }
    throw new Error(`unknown argument: ${argument}`);
  }
  if (!session) throw new Error(usage());
  return { session, json, testCommandPattern };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArguments(process.argv.slice(2));
    const telemetry = parseSessionTelemetry(await readFile(options.session, "utf8"), { testCommandPattern: options.testCommandPattern });
    if (options.json) {
      console.log(JSON.stringify(telemetry, null, 2));
    } else {
      const { metrics, ompstack } = telemetry;
      console.log(`tool calls      : ${metrics.calls}`);
      console.log(`successes       : ${metrics.successes}`);
      console.log(`errors          : ${metrics.errors}`);
      console.log(`incomplete      : ${metrics.incomplete}`);
      console.log(`blocked         : ${metrics.blocked}`);
      console.log(`route calls     : ${ompstack.routeCalls.length}`);
      console.log(`evidence tries  : ${ompstack.evidence.attempts.length}`);
      console.log(`model turns     : ${telemetry.cost.model_turns}`);
      console.log(`total tokens    : ${telemetry.cost.tokens.total}`);
      console.log(`wall time (ms)  : ${telemetry.cost.wall_time_ms ?? "unknown"}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
