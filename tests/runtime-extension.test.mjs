import assert from "node:assert/strict";
import { test } from "bun:test";
import ompstackRuntime from "../extensions/ompstack-runtime.ts";

function chain() {
  return { min: chain, int: chain, nonnegative: chain, strict: chain };
}

function createRuntime() {
  const handlers = new Map();
  const pi = {
    zod: {
      object: chain,
      enum: chain,
      array: chain,
      string: chain,
      boolean: chain,
      number: chain,
    },
    appendEntry: async () => undefined,
    on: (event, handler) => handlers.set(event, handler),
    registerTool: () => {},
  };
  ompstackRuntime(pi);
  return handlers;
}

const decisionId = "a".repeat(64);

test("runtime extension blocks writes before a route and leaves known reads available", async () => {
  const handlers = createRuntime();
  const gate = handlers.get("tool_call");
  assert.deepEqual(await gate({ toolName: "write", input: {} }), {
    block: true,
    reason: "ompstack requires a valid RouteDecision before mutable or unknown execution",
  });
  assert.equal(await gate({ toolName: "write", input: { path: "xd://ompstack_route" } }), undefined);
  assert.equal(await gate({ toolName: "read", input: {} }), undefined);
});

test("runtime extension requires an exact task decision header and consumes authorization", async () => {
  const handlers = createRuntime();
  await handlers.get("session_start")({}, {
    sessionManager: {
      getBranch: () => [{ type: "custom", customType: "io.github.chithang-50cent.ompstack.route-decision.v1", data: { decisionId } }],
    },
  });
  const gate = handlers.get("tool_call");
  assert.deepEqual(await gate({ toolName: "task", input: { context: "# Context" } }), {
    block: true,
    reason: "task requires an exact Route-Decision header",
  });
  assert.equal(await gate({ toolName: "task", input: { context: `Route-Decision: sha256:${decisionId}` } }), undefined);
  assert.deepEqual(await gate({ toolName: "edit", input: {} }), {
    block: true,
    reason: "ompstack requires a valid RouteDecision before mutable or unknown execution",
  });
});


test("runtime extension does not restore a consumed persisted decision", async () => {
  const handlers = createRuntime();
  await handlers.get("session_start")({}, {
    sessionManager: {
      getBranch: () => [
        { type: "custom", customType: "io.github.chithang-50cent.ompstack.route-decision.v1", data: { decisionId } },
        { type: "custom", customType: "io.github.chithang-50cent.ompstack.route-decision-state.v1", data: { decisionId, state: "consumed" } },
      ],
    },
  });
  assert.deepEqual(await handlers.get("tool_call")({ toolName: "edit", input: {} }), {
    block: true,
    reason: "ompstack requires a valid RouteDecision before mutable or unknown execution",
  });
});