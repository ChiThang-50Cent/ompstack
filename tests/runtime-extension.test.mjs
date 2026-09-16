import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { ExtensionRunner, loadExtensions } from "@oh-my-pi/pi-coding-agent/extensibility/extensions";
import { SessionManager } from "@oh-my-pi/pi-coding-agent/session/session-manager";
import { join } from "node:path";
import { test } from "bun:test";
import ompstackRuntime from "../extensions/ompstack-runtime.ts";

function chain() {
  return { min: chain, int: chain, nonnegative: chain, strict: chain };
}

function createRuntime() {
  const handlers = new Map();
  const tools = new Map();
  const entries = [];
  const pi = {
    zod: {
      object: chain,
      enum: chain,
      array: chain,
      string: chain,
      boolean: chain,
      number: chain,
    },
    appendEntry: async (customType, data) => entries.push({ customType, data }),
    on: (event, handler) => handlers.set(event, handler),
    registerTool: (tool) => tools.set(tool.name, tool),
  };
  ompstackRuntime(pi);
  return { entries, handlers, tools };
}

const decisionId = "a".repeat(64);
const decision = {
  type: "custom",
  customType: "io.github.chithang-50cent.ompstack.route-decision.v1",
  data: { decisionId, requiredIndependentEvidence: ["reviewer", "verifier"] },
};
const invalidated = {
  type: "custom",
  customType: "io.github.chithang-50cent.ompstack.route-decision-state.v1",
  data: { decisionId, state: "invalidated", reason: "superseded-by-fresh-route" },
};

const activation = {
  type: "custom",
  customType: "io.github.chithang-50cent.ompstack.route-activation.v1",
  data: { workflow: "ompstack" },
};

async function restore(runtime, entries) {
  await runtime.handlers.get("session_start")({}, { sessionManager: { getBranch: () => entries } });
  return runtime.handlers.get("tool_call");
}

async function git(root, ...args) {
  const process = Bun.spawn(["git", "-C", root, ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited]);
  assert.equal(exitCode, 0, stderr);
  return stdout.trim();
}

async function withRepository(callback) {
  const root = await mkdtemp(join(tmpdir(), "ompstack-runtime-"));
  try {
    await git(root, "init");
    await git(root, "config", "user.email", "runtime@example.test");
    await git(root, "config", "user.name", "Runtime test");
    await git(root, "commit", "--allow-empty", "-m", "base");
    await callback(root, await git(root, "rev-parse", "HEAD"));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}

function routeInput(root, revision) {
  return {
    intent: "feature",
    targets: ["src/example.ts"],
    taskFacts: { behaviorAffecting: true, plannedWriteLanes: ["parent"], proofSurface: "runtime test" },
    repository: { root, base: revision, head: revision },
    riskFacts: { sharedSemanticBoundary: false, consumerFamilies: 1, executionModes: 1, graphTraversal: false, materialUnknown: false },
    graphPolicy: { sourceRoots: { go: [], python: [], typescript: [], java: [] } },
  };
}
function extensionPath() {
  return fileURLToPath(new URL("../extensions/ompstack-runtime.ts", import.meta.url));
}

async function createHostRuntime() {
  const result = await loadExtensions([extensionPath()], process.cwd());
  assert.deepEqual(result.errors, []);
  const sessionManager = SessionManager.inMemory(process.cwd());
  const runner = new ExtensionRunner(result.extensions, result.runtime, process.cwd(), sessionManager, {});
  runner.initialize(
    {
      sendMessage() {},
      sendUserMessage() {},
      appendEntry: (customType, data) => sessionManager.appendCustomEntry(customType, data),
      setLabel() {},
      getActiveTools: () => [],
      getAllTools: () => [],
      setActiveTools: async () => {},
      getCommands: () => [],
      setModel: async () => false,
      getThinkingLevel: () => undefined,
      setThinkingLevel() {},
      getSessionName: () => undefined,
      setSessionName: async () => {},
    },
    {
      getModel: () => undefined,
      isIdle: () => true,
      abort() {},
      hasPendingMessages: () => false,
      shutdown() {},
      getContextUsage: () => undefined,
      compact: async () => {},
      getSystemPrompt: () => [],
    },
  );
  return { runner, sessionManager };
}


test("runtime registers every session rebuild handler through the OMP loader", async () => {
  const result = await loadExtensions([extensionPath()], process.cwd());
  assert.deepEqual(result.errors, []);
  assert.equal(result.extensions.length, 1);
  for (const event of ["session_start", "session_switch", "session_branch", "session_tree"]) {
    assert.ok(result.extensions[0].handlers.has(event), event);
  }
});

test("session switches rebuild runtime state through the OMP runner", async () => {
  const { runner, sessionManager } = await createHostRuntime();
  await runner.emit({ type: "session_start" });
  sessionManager.appendCustomEntry("io.github.chithang-50cent.ompstack.route-decision.v1", decision.data);
  await runner.emit({ type: "session_switch", reason: "resume", previousSessionFile: undefined });
  assert.deepEqual(
    await runner.emitToolCall({ toolCallId: "routed-task", toolName: "task", input: { context: "# Context" } }),
    { block: true, reason: "task requires an exact Route-Decision header" },
  );
  await sessionManager.newSession();
  await runner.emit({ type: "session_switch", reason: "new", previousSessionFile: undefined });
  assert.equal(
    await runner.emitToolCall({ toolCallId: "new-task", toolName: "task", input: { context: "# Context" } }),
    undefined,
  );
  await runner.emitInput("/ompstack", undefined, "interactive");
  assert.ok(
    sessionManager.getBranch().some((entry) =>
      entry.type === "custom" && entry.customType === "io.github.chithang-50cent.ompstack.route-activation.v1",
    ),
  );
  assert.deepEqual(
    await runner.emitToolCall({ toolCallId: "activated-write", toolName: "write", input: { path: "new.txt", content: "" } }),
    { block: true, reason: "ompstack requires a valid RouteDecision before mutable or unknown execution" },
  );
});

test("runtime stays inactive until Ompstack records a decision", async () => {
  const runtime = createRuntime();
  const gate = runtime.handlers.get("tool_call");
  assert.equal(await gate({ toolName: "write", input: { path: "unrelated.txt" } }), undefined);
  assert.equal(await gate({ toolName: "todo", input: { op: "view" } }), undefined);
});

test("interactive Ompstack invocation activates write-before-route enforcement", async () => {
  const runtime = createRuntime();
  await runtime.handlers.get("input")({ text: "/skill:ompstack add a route", source: "interactive" });
  assert.deepEqual(await runtime.handlers.get("tool_call")({ toolName: "edit", input: {} }), {
    block: true,
    reason: "ompstack requires a valid RouteDecision before mutable or unknown execution",
  });
  assert.deepEqual(runtime.entries, [{
    customType: "io.github.chithang-50cent.ompstack.route-activation.v1",
    data: { workflow: "ompstack" },
  }]);
});

test("persisted explicit activation retains write-before-route enforcement", async () => {
  const runtime = createRuntime();
  const gate = await restore(runtime, [activation]);
  assert.deepEqual(await gate({ toolName: "write", input: {} }), {
    block: true,
    reason: "ompstack requires a valid RouteDecision before mutable or unknown execution",
  });
});

test("runtime keeps an active decision across mutable calls and Todo inspection", async () => {
  const runtime = createRuntime();
  const gate = await restore(runtime, [decision]);
  assert.deepEqual(await gate({ toolName: "task", input: { context: "# Context" } }), {
    block: true,
    reason: "task requires an exact Route-Decision header",
  });
  assert.equal(await gate({ toolName: "task", input: { context: `Route-Decision: sha256:${decisionId}` } }), undefined);
  assert.equal(await gate({ toolName: "edit", input: {} }), undefined);
  assert.equal(await gate({ toolName: "edit", input: {} }), undefined);
  assert.equal(await gate({ toolName: "bash", input: {} }), undefined);
  assert.equal(await gate({ toolName: "todo", input: { op: "view" } }), undefined);
  assert.deepEqual(runtime.entries, []);
});

test("runtime fails closed after an invalidated persisted decision", async () => {
  const runtime = createRuntime();
  const gate = await restore(runtime, [decision, invalidated]);
  assert.deepEqual(await gate({ toolName: "write", input: { path: "xd://ompstack_route" } }), {
    block: true,
    reason: "ompstack requires a valid RouteDecision before mutable or unknown execution",
  });
  assert.equal(await gate({ toolName: "todo", input: { op: "view" } }), undefined);
});

test("runtime records only successfully launched required evidence lanes", async () => {
  const runtime = createRuntime();
  const gate = await restore(runtime, [decision]);
  await gate({
    toolCallId: "task-1",
    toolName: "task",
    input: {
      context: `Route-Decision: sha256:${decisionId}`,
      tasks: [{ agent: "reviewer" }, { agent: "security-reviewer" }],
    },
  });
  await runtime.handlers.get("tool_execution_end")({ toolCallId: "task-1", toolName: "task", isError: false });
  const phase = await runtime.tools.get("ompstack_phase").execute("phase", {});
  assert.deepEqual(phase.details, {
    decisionId,
    requiredIndependentEvidence: ["reviewer", "verifier"],
    observedIndependentEvidence: ["reviewer"],
    missingIndependentEvidence: ["verifier"],
    runtimeEvidenceCoverage: "partial",
  });
  assert.deepEqual(runtime.entries, [{
    customType: "io.github.chithang-50cent.ompstack.route-evidence.v1",
    data: { decisionId, evidence: "reviewer" },
  }]);
});

test("fresh routing invalidates and replaces the prior decision", async () => {
  await withRepository(async (root, revision) => {
    const runtime = createRuntime();
    const route = runtime.tools.get("ompstack_route");
    const first = await route.execute("first", routeInput(root, revision));
    const second = await route.execute("second", routeInput(root, revision));
    assert.equal(first.details.decisionId, second.details.decisionId);
    assert.deepEqual(
      runtime.entries.map((entry) => entry.customType),
      [
        "io.github.chithang-50cent.ompstack.route-decision.v1",
        "io.github.chithang-50cent.ompstack.route-decision-state.v1",
        "io.github.chithang-50cent.ompstack.route-decision.v1",
      ],
    );
    assert.deepEqual(runtime.entries[1].data, {
      decisionId: first.details.decisionId,
      state: "invalidated",
      reason: "superseded-by-fresh-route",
    });
    assert.equal(await runtime.handlers.get("tool_call")({ toolName: "edit", input: {} }), undefined);
  });
});