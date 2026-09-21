import assert from "node:assert/strict";
import { test } from "bun:test";
import { parseSessionTelemetry } from "../scripts/session-telemetry.mjs";

const prefix = "io.github.chithang-50cent.ompstack.";
const decisionId = "a".repeat(64);

function custom(customType, data) {
  return { type: "custom", customType: `${prefix}${customType}`, data };
}

test("session telemetry correlates native tool lifecycle with Ompstack outcomes", () => {
  const telemetry = parseSessionTelemetry([
    custom("route-decision.v1", {
      decisionId,
      risk: "high",
      requiredIndependentEvidence: ["reviewer"],
    }),
    {
      type: "custom",
      customType: "tool_execution_start",
      data: {
        toolCallId: "task-1",
        toolName: "task",
        startedAt: "2026-09-20T12:00:00.000Z",
        args: { tasks: [{ agent: "reviewer" }] },
      },
    },
    custom("route-tool.v1", {
      phase: "call",
      toolCallId: "task-1",
      toolName: "task",
      decisionId,
      disposition: "allowed",
      paths: [],
    }),
    {
      type: "message",
      timestamp: "2026-09-20T12:00:00.100Z",
      message: {
        role: "toolResult",
        toolCallId: "task-1",
        toolName: "task",
        content: [{ type: "text", text: "task output" }],
        details: {
          results: [{ id: "VerifyTarget", agent: "verifier" }],
          progress: [{ id: "ReviewTarget", agent: "reviewer", status: "running" }],
        },
        isError: false,
      },
    },
    custom("route-tool.v1", {
      phase: "end",
      toolCallId: "task-1",
      toolName: "task",
      decisionId,
      outcome: "success",
      references: ["artifact://review"],
    }),
    custom("route-tool.v1", {
      phase: "call",
      toolCallId: "blocked-edit",
      toolName: "edit",
      decisionId,
      disposition: "blocked",
      reason: "outside scope",
      paths: ["README.md"],
    }),
  ]);

  assert.deepEqual(telemetry.metrics, {
    calls: 2,
    successes: 1,
    errors: 0,
    incomplete: 1,
    blocked: 1,
    byTool: {
      task: { calls: 1, successes: 1, errors: 0, incomplete: 0, blocked: 0 },
      edit: { calls: 1, successes: 0, errors: 0, incomplete: 1, blocked: 1 },
    },
  });
  assert.deepEqual(telemetry.tools, [
    {
      toolCallId: "task-1",
      toolName: "task",
      decisionId,
      disposition: "allowed",
      reason: null,
      paths: [],
      requestedEvidence: ["reviewer"],
      outcome: "success",
      startedAt: 1789905600000,
      completedAt: 1789905600100,
      durationMs: 100,
      references: ["artifact://review", "agent://VerifyTarget", "agent://ReviewTarget"],
      sequence: 1,
    },
    {
      toolCallId: "blocked-edit",
      toolName: "edit",
      decisionId,
      disposition: "blocked",
      reason: "outside scope",
      paths: ["README.md"],
      requestedEvidence: [],
      outcome: "incomplete",
      startedAt: null,
      completedAt: null,
      durationMs: null,
      references: [],
      sequence: 5,
    },
  ]);
  assert.deepEqual(telemetry.evidenceAttempts, [{
    decisionId,
    evidence: "reviewer",
    toolCallId: "task-1",
    outcome: "success",
    references: ["artifact://review", "agent://VerifyTarget", "agent://ReviewTarget"],
  }]);
  assert.deepEqual(telemetry.ompstack.evidence.attempts, telemetry.evidenceAttempts);
  assert.equal(telemetry.ompstack.routeCalls[0].risk, "high");
});

test("session telemetry reports malformed JSONL with its line number", () => {
  assert.throws(() => parseSessionTelemetry('{"type":"session"}\nbad'), /session JSONL line 2 is not JSON/);
});
