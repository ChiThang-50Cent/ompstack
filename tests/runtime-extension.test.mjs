import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createAgentSession } from "@oh-my-pi/pi-coding-agent";
import { ExtensionRunner, loadExtensions } from "@oh-my-pi/pi-coding-agent/extensibility/extensions";
import { createMockModel, registerMockApi } from "@oh-my-pi/pi-ai/providers/mock";
import { SessionManager } from "@oh-my-pi/pi-coding-agent/session/session-manager";
import { join } from "node:path";
import { test } from "bun:test";

import ompstackRuntime from "../extensions/ompstack-runtime.ts";
registerMockApi("ompstack-runtime-test");

function chain() {
  return { min: chain, int: chain, nonnegative: chain, strict: chain, describe: chain };
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
function stateEntries(runtime) {
  return runtime.entries.filter((entry) => !entry.customType.endsWith("route-tool.v1") && !entry.customType.endsWith("route-evidence-attempt.v1"));
}


const decisionId = "a".repeat(64);
const decision = {
  type: "custom",
  customType: "io.github.chithang-50cent.ompstack.route-decision.v1",
  data: { decisionId, measurementPurpose: "material", repositoryRoot: process.cwd(), targets: ["tests"], requiredIndependentEvidence: ["reviewer", "verifier"] },
};
const invalidated = {
  type: "custom",
  customType: "io.github.chithang-50cent.ompstack.route-decision-state.v1",
  data: { decisionId, state: "invalidated", reason: "superseded-by-fresh-route" },
};

const activation = {
  type: "custom",
  customType: "io.github.chithang-50cent.ompstack.route-activation.v1",
  data: { workflow: "ompstack", source: "skill-read" },
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
    taskFacts: { behaviorAffecting: true },
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
test("AgentSession turns a route gate block into a blocked write execution", async () => {
  await withRepository(async (root) => {
    const mock = createMockModel({
      provider: "ollama",
      responses: [
        { content: [{ type: "toolCall", name: "write", arguments: { path: "blocked.txt", content: "must not exist" } }] },
        { content: ["Write was blocked."] },
      ],
    });
    const sessionManager = SessionManager.create(root, join(root, ".sessions"));
    sessionManager.appendCustomEntry("io.github.chithang-50cent.ompstack.route-activation.v1", activation.data);
    const { session, extensionsResult } = await createAgentSession({
      cwd: root,
      agentDir: join(root, ".agent"),
      model: mock.model,
      sessionManager,
      additionalExtensionPaths: [extensionPath()],
      disableExtensionDiscovery: true,
      skills: [],
      rules: [],
      contextFiles: [],
      promptTemplates: [],
      slashCommands: [],
      enableMCP: false,
      enableLsp: false,
      enableIrc: false,
      skipPythonPreflight: true,
      toolNames: ["write"],
      autoApprove: true,
    });
    assert.deepEqual(extensionsResult.errors, []);
    assert.ok(extensionsResult.extensions.some((extension) => extension.resolvedPath === extensionPath()));
    const extensionRunner = session.extensionRunner;
    assert.ok(extensionRunner);
    extensionRunner.initialize(
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
      await sessionManager.flush();
      assert.equal(await session.fork(), true);
    try {
      await session.prompt("Create blocked.txt");
      await assert.rejects(access(join(root, "blocked.txt")));
      const blocked = session.agent.state.messages.find((message) => message.role === "toolResult" && message.toolName === "write");
      assert.equal(blocked?.isError, true);
      assert.match(blocked?.content[0]?.text ?? "", /ompstack requires a valid RouteDecision/);
    } finally {
      await session.dispose();
    }
  });
});




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
test("ExtensionRunner records one skip when an unactivated write passes", async () => {
  const { runner, sessionManager } = await createHostRuntime();
  await runner.emit({ type: "session_start" });
  assert.equal(
    await runner.emitToolCall({ toolCallId: "unactivated-write", toolName: "write", input: { path: "new.txt", content: "" } }),
    undefined,
  );
  await runner.emit({ type: "session_switch", reason: "resume", previousSessionFile: undefined });
  assert.equal(
    await runner.emitToolCall({ toolCallId: "unactivated-write-after-rebuild", toolName: "write", input: { path: "again.txt", content: "" } }),
    undefined,
  );
  const observabilityEntries = sessionManager.getBranch().filter((entry) =>
    entry.type === "custom" && entry.customType.startsWith("io.github.chithang-50cent.ompstack."),
  );
  assert.deepEqual(observabilityEntries.map((entry) => entry.customType), [
    "io.github.chithang-50cent.ompstack.route-skip.v1",
  ]);
  assert.deepEqual(observabilityEntries[0].data, { reason: "enforcement-inactive", firstToolName: "write" });
});

test("runtime stays inactive until Ompstack records a decision", async () => {
  const runtime = createRuntime();
  const gate = runtime.handlers.get("tool_call");
  assert.equal(await gate({ toolName: "write", input: { path: "unrelated.txt" } }), undefined);
  assert.equal(await gate({ toolName: "todo", input: { op: "view" } }), undefined);
  assert.deepEqual(stateEntries(runtime), [{
    customType: "io.github.chithang-50cent.ompstack.route-skip.v1",
    data: { reason: "enforcement-inactive", firstToolName: "write" },
  }]);
});

test("runtime records at most one inactive-enforcement skip", async () => {
  const runtime = createRuntime();
  const gate = runtime.handlers.get("tool_call");
  assert.equal(await gate({ toolName: "write", input: { path: "first.txt" } }), undefined);
  assert.equal(await gate({ toolName: "bash", input: { command: "echo second" } }), undefined);
  assert.deepEqual(stateEntries(runtime), [{
    customType: "io.github.chithang-50cent.ompstack.route-skip.v1",
    data: { reason: "enforcement-inactive", firstToolName: "write" },
  }]);
});


test("interactive Ompstack invocation activates write-before-route enforcement", async () => {
  const runtime = createRuntime();
  await runtime.handlers.get("input")({ text: "/skill:ompstack add a route", source: "interactive" });
  assert.deepEqual(await runtime.handlers.get("tool_call")({ toolName: "edit", input: {} }), {
    block: true,
    reason: "ompstack requires a valid RouteDecision before mutable or unknown execution",
  });
  assert.deepEqual(stateEntries(runtime), [
    {
      customType: "io.github.chithang-50cent.ompstack.route-activation.v1",
      data: { workflow: "ompstack", source: "input" },
    },
    {
      customType: "io.github.chithang-50cent.ompstack.route-block.v1",
      data: {
        toolName: "edit",
        reason: "ompstack requires a valid RouteDecision before mutable or unknown execution",
        decisionId: null,
        path: null,
      },
    },
  ]);
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
  assert.equal(await gate({ toolName: "edit", input: { path: "tests/runtime-extension.test.mjs" } }), undefined);
  assert.equal(await gate({ toolName: "edit", input: { path: "tests/runtime-extension.test.mjs" } }), undefined);
  assert.equal(await gate({ toolName: "bash", input: {} }), undefined);
  assert.equal(await gate({ toolName: "todo", input: { op: "view" } }), undefined);
  assert.deepEqual(stateEntries(runtime), [{
    customType: "io.github.chithang-50cent.ompstack.route-block.v1",
    data: {
      toolName: "task",
      reason: "task requires an exact Route-Decision header",
      decisionId,
      path: null,
    },
  }]);
});

test("runtime fails closed after an invalidated persisted decision", async () => {
  const runtime = createRuntime();
  const gate = await restore(runtime, [decision, invalidated]);
  assert.deepEqual(await gate({ toolName: "bash", input: { command: "echo blocked" } }), {
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
    materialRouteCurrent: true,
    requiredIndependentEvidence: ["reviewer", "verifier"],
    observedIndependentEvidence: ["reviewer"],
    missingIndependentEvidence: ["verifier"],
    runtimeEvidenceCoverage: "partial",
  });
  assert.deepEqual(stateEntries(runtime), [{
    customType: "io.github.chithang-50cent.ompstack.route-evidence.v1",
    data: { decisionId, evidence: "reviewer" },
  }]);
});
test("runtime records tool outcomes and evidence references", async () => {
  const runtime = createRuntime();
  const gate = await restore(runtime, [decision]);
  await gate({
    toolCallId: "failed-task",
    toolName: "task",
    input: {
      context: `Route-Decision: sha256:${decisionId}`,
      tasks: [{ agent: "reviewer" }],
    },
  });
  await runtime.handlers.get("tool_execution_end")({
    toolCallId: "failed-task",
    toolName: "task",
    result: {
      artifact: "artifact://failed-review",
      history: "history://failed-task",
      details: {
        results: [{ id: "FailedReview", agent: "reviewer" }],
        progress: [{ id: "PendingReview", agent: "reviewer", status: "running" }],
      },
    },
    isError: true,
  });
  assert.deepEqual(runtime.entries, [
    {
      customType: "io.github.chithang-50cent.ompstack.route-tool.v1",
      data: {
        phase: "call",
        toolCallId: "failed-task",
        toolName: "task",
        decisionId,
        disposition: "allowed",
        reason: null,
        paths: [],
      },
    },
    {
      customType: "io.github.chithang-50cent.ompstack.route-tool.v1",
      data: {
        phase: "end",
        toolCallId: "failed-task",
        toolName: "task",
        decisionId,
        outcome: "error",
        references: ["artifact://failed-review", "history://failed-task", "agent://FailedReview", "agent://PendingReview"],
      },
    },
    {
      customType: "io.github.chithang-50cent.ompstack.route-evidence-attempt.v1",
      data: {
        decisionId,
        evidence: ["reviewer"],
        toolCallId: "failed-task",
        outcome: "error",
        references: ["artifact://failed-review", "history://failed-task", "agent://FailedReview", "agent://PendingReview"],
      },
    },
  ]);
});


test("runtime restores only valid evidence for the active decision", async () => {
  const runtime = createRuntime();
  const previousDecisionId = "b".repeat(64);
  const gate = await restore(runtime, [
    decision,
    {
      type: "custom",
      customType: "io.github.chithang-50cent.ompstack.route-evidence.v1",
      data: { decisionId, evidence: "reviewer" },
    },
    {
      type: "custom",
      customType: "io.github.chithang-50cent.ompstack.route-evidence.v1",
      data: { decisionId, evidence: "not-a-lane" },
    },
    {
      type: "custom",
      customType: "io.github.chithang-50cent.ompstack.route-evidence.v1",
      data: { decisionId: previousDecisionId, evidence: "verifier" },
    },
  ]);
  assert.equal(await gate({ toolName: "todo", input: { op: "view" } }), undefined);
  const phase = await runtime.tools.get("ompstack_phase").execute("phase", {});
  assert.deepEqual(phase.details, {
    decisionId,
    materialRouteCurrent: true,
    requiredIndependentEvidence: ["reviewer", "verifier"],
    observedIndependentEvidence: ["reviewer"],
    missingIndependentEvidence: ["verifier"],
    runtimeEvidenceCoverage: "partial",
  });
});

test("runtime clears restored evidence after a stale decision state", async () => {
  const runtime = createRuntime();
  const gate = await restore(runtime, [
    decision,
    {
      type: "custom",
      customType: "io.github.chithang-50cent.ompstack.route-decision-state.v1",
      data: { decisionId, state: "material-stale", reason: "workspace-mutation-after-route" },
    },
    {
      type: "custom",
      customType: "io.github.chithang-50cent.ompstack.route-evidence.v1",
      data: { decisionId, evidence: "ompstack-verifier" },
    },
  ]);
  assert.equal(await gate({ toolName: "todo", input: { op: "view" } }), undefined);
  const phase = await runtime.tools.get("ompstack_phase").execute("phase", {});
  assert.equal(phase.details.materialRouteCurrent, false);
  assert.deepEqual(phase.details.observedIndependentEvidence, []);
});

test("runtime normalizes and deduplicates canonical evidence lanes", async () => {
  const runtime = createRuntime();
  const normalizedDecision = {
    ...decision,
    data: {
      ...decision.data,
      requiredIndependentEvidence: ["security-reviewer", "reviewer", "verifier", "reviewer", "unknown"],
    },
  };
  const gate = await restore(runtime, [normalizedDecision]);
  assert.equal(
    await gate({
      toolCallId: "normalized-evidence",
      toolName: "task",
      input: {
        context: `Route-Decision: sha256:${decisionId}`,
        tasks: [
          { agent: "security-reviewer" },
          { agent: "reviewer" },
          { agent: "verifier" },
          { agent: "reviewer" },
          { agent: "scout" },
        ],
      },
    }),
    undefined,
  );
  await runtime.handlers.get("tool_execution_end")({ toolCallId: "normalized-evidence", toolName: "task", isError: false });
  const phase = await runtime.tools.get("ompstack_phase").execute("phase", {});
  assert.deepEqual(phase.details, {
    decisionId,
    materialRouteCurrent: true,
    requiredIndependentEvidence: ["reviewer", "verifier", "security-reviewer"],
    observedIndependentEvidence: ["reviewer", "security-reviewer", "verifier"],
    missingIndependentEvidence: [],
    runtimeEvidenceCoverage: "partial",
  });
});

test("runtime normalizes ompstack-verifier evidence for launch and restoration", async () => {
  const persisted = createRuntime();
  const persistedGate = await restore(persisted, [
    decision,
    {
      type: "custom",
      customType: "io.github.chithang-50cent.ompstack.route-evidence.v1",
      data: { decisionId, evidence: "ompstack-verifier" },
    },
  ]);
  assert.equal(await persistedGate({ toolName: "todo", input: { op: "view" } }), undefined);
  const persistedPhase = await persisted.tools.get("ompstack_phase").execute("phase", {});
  assert.deepEqual(persistedPhase.details.observedIndependentEvidence, ["verifier"]);

  const launched = createRuntime();
  const launchedGate = await restore(launched, [{
    ...decision,
    data: { ...decision.data, requiredIndependentEvidence: ["ompstack-verifier"] },
  }]);
  assert.equal(
    await launchedGate({
      toolCallId: "ompstack-verifier-evidence",
      toolName: "task",
      input: {
        context: `Route-Decision: sha256:${decisionId}`,
        tasks: [{ agent: "ompstack-verifier" }],
      },
    }),
    undefined,
  );
  await launched.handlers.get("tool_execution_end")({ toolCallId: "ompstack-verifier-evidence", toolName: "task", isError: false });
  const launchedPhase = await launched.tools.get("ompstack_phase").execute("phase", {});
  assert.deepEqual(launchedPhase.details, {
    decisionId,
    materialRouteCurrent: true,
    requiredIndependentEvidence: ["verifier"],
    observedIndependentEvidence: ["verifier"],
    missingIndependentEvidence: [],
    runtimeEvidenceCoverage: "partial",
  });
});

test("route protocol bootstrap is read-only and never stales a route", async () => {
  const bootstrap = createRuntime();
  const bootstrapGate = bootstrap.handlers.get("tool_call");
  assert.equal(
    await bootstrapGate({ toolCallId: "route-protocol-bootstrap", toolName: "write", input: { path: "xd://ompstack_route", content: "{}" } }),
    undefined,
  );
  assert.deepEqual(stateEntries(bootstrap), []);

  const material = createRuntime();
  const materialGate = await restore(material, [decision]);
  assert.equal(
    await materialGate({ toolCallId: "route-protocol-material", toolName: "write", input: { path: "xd://ompstack_route", content: "{}" } }),
    undefined,
  );
  await material.handlers.get("tool_execution_end")({ toolCallId: "route-protocol-material", toolName: "write", isError: false });
  const phase = await material.tools.get("ompstack_phase").execute("phase", {});
  assert.equal(phase.details.materialRouteCurrent, true);
  assert.deepEqual(stateEntries(material), []);
});
test("phase protocol is read-only and never stales a route", async () => {
  const runtime = createRuntime();
  const gate = await restore(runtime, [decision]);
  assert.equal(
    await gate({ toolCallId: "phase-protocol", toolName: "write", input: { path: "xd://ompstack_phase", content: "{}" } }),
    undefined,
  );
  await runtime.handlers.get("tool_execution_end")({ toolCallId: "phase-protocol", toolName: "write", isError: false });
  const phase = await runtime.tools.get("ompstack_phase").execute("phase", {});
  assert.equal(phase.details.materialRouteCurrent, true);
  assert.deepEqual(stateEntries(runtime), []);
});

test("bootstrap routes allow the first declared mutation", async () => {
  await withRepository(async (root, revision) => {
    const runtime = createRuntime();
    const route = runtime.tools.get("ompstack_route");
    const first = await route.execute("bootstrap", routeInput(root, revision));
    assert.equal(first.details.measurementPurpose, "bootstrap");
    const gate = runtime.handlers.get("tool_call");
    assert.equal(
      await gate({ toolCallId: "bootstrap-write", toolName: "write", input: { path: "src/example.ts", content: "export {};\n" } }),
      undefined,
    );
    await runtime.handlers.get("tool_execution_end")({ toolCallId: "bootstrap-write", toolName: "write", isError: false });
    assert.deepEqual(stateEntries(runtime).map((entry) => entry.customType), [
      "io.github.chithang-50cent.ompstack.route-decision.v1",
    ]);
  });
});

test("bootstrap decisions do not deadlock their first evidence task", async () => {
  const runtime = createRuntime();
  const bootstrapDecision = {
    ...decision,
    data: {
      ...decision.data,
      measurementPurpose: "bootstrap",
      requiredIndependentEvidence: ["reviewer"],
    },
  };
  const gate = await restore(runtime, [bootstrapDecision]);
  assert.equal(
    await gate({
      toolCallId: "bootstrap-evidence",
      toolName: "task",
      input: {
        context: `Route-Decision: sha256:${decisionId}`,
        tasks: [{ agent: "reviewer" }],
      },
    }),
    undefined,
  );
  await runtime.handlers.get("tool_execution_end")({ toolCallId: "bootstrap-evidence", toolName: "task", isError: false });
  const phase = await runtime.tools.get("ompstack_phase").execute("phase", {});
  assert.deepEqual(phase.details.observedIndependentEvidence, ["reviewer"]);
});


test("late mutation completion cannot stale a superseding route", async () => {
  await withRepository(async (root, revision) => {
    const runtime = createRuntime();
    const route = runtime.tools.get("ompstack_route");
    await route.execute("bootstrap", routeInput(root, revision));
    const gate = runtime.handlers.get("tool_call");
    assert.equal(
      await gate({ toolCallId: "late-write", toolName: "write", input: { path: "src/example.ts", content: "export {};\n" } }),
      undefined,
    );
    await mkdir(join(root, "src"));
    await writeFile(join(root, "src", "example.ts"), "export {};\n");
    const second = await route.execute("material", routeInput(root, revision));
    assert.equal(second.details.measurementPurpose, "material");
    await runtime.handlers.get("tool_execution_end")({ toolCallId: "late-write", toolName: "write", isError: false });
    assert.equal(stateEntries(runtime).at(-1).customType, "io.github.chithang-50cent.ompstack.route-decision.v1");
  });
});
test("material route drops evidence that completes after mutation", async () => {
  const runtime = createRuntime();
  const gate = await restore(runtime, [decision]);
  assert.equal(
    await gate({
      toolCallId: "late-evidence",
      toolName: "task",
      input: {
        context: `Route-Decision: sha256:${decisionId}`,
        tasks: [{ agent: "reviewer" }],
      },
    }),
    undefined,
  );
  assert.equal(
    await gate({ toolCallId: "mutation", toolName: "write", input: { path: "tests/new-test-file.mjs" } }),
    undefined,
  );
  await runtime.handlers.get("tool_execution_end")({ toolCallId: "mutation", toolName: "write", isError: false });
  await runtime.handlers.get("tool_execution_end")({ toolCallId: "late-evidence", toolName: "task", isError: false });
  const phase = await runtime.tools.get("ompstack_phase").execute("phase", {});
  assert.deepEqual(phase.details.observedIndependentEvidence, []);
  assert.deepEqual(stateEntries(runtime), [{
    customType: "io.github.chithang-50cent.ompstack.route-decision-state.v1",
    data: { decisionId, state: "material-stale", reason: "workspace-mutation-after-route" },
  }]);
});

test("material routes enforce declared write scope and become stale after mutation", async () => {
  const runtime = createRuntime();
  const gate = await restore(runtime, [decision]);
  assert.equal(await gate({ toolCallId: "in-scope-write", toolName: "write", input: { path: "tests/new-test-file.mjs" } }), undefined);
  assert.deepEqual(
    await gate({ toolCallId: "outside-write", toolName: "write", input: { path: "README.md" } }),
    { block: true, reason: "ompstack target is outside the RouteDecision scope: README.md" },
  );
  assert.deepEqual(
    await gate({ toolCallId: "mixed-hashline-edit", toolName: "edit", input: { paths: ["tests/runtime-extension.test.mjs", "README.md"] } }),
    { block: true, reason: "ompstack target is outside the RouteDecision scope: README.md" },
  );
  await runtime.handlers.get("tool_execution_end")({ toolCallId: "in-scope-write", toolName: "write", isError: false });
  assert.deepEqual(stateEntries(runtime), [
    {
      customType: "io.github.chithang-50cent.ompstack.route-block.v1",
      data: {
        toolName: "write",
        reason: "ompstack target is outside the RouteDecision scope: README.md",
        decisionId,
        path: "README.md",
      },
    },
    {
      customType: "io.github.chithang-50cent.ompstack.route-block.v1",
      data: {
        toolName: "edit",
        reason: "ompstack target is outside the RouteDecision scope: README.md",
        decisionId,
        path: "README.md",
      },
    },
    {
      customType: "io.github.chithang-50cent.ompstack.route-decision-state.v1",
      data: { decisionId, state: "material-stale", reason: "workspace-mutation-after-route" },
    },
  ]);
  assert.deepEqual(
    await gate({
      toolCallId: "review-after-mutation",
      toolName: "task",
      input: { context: `Route-Decision: sha256:${decisionId}`, tasks: [{ agent: "reviewer" }] },
    }),
    { block: true, reason: "task requires a fresh material RouteDecision before independent evidence" },
  );
  assert.deepEqual(stateEntries(runtime).at(-1), {
    customType: "io.github.chithang-50cent.ompstack.route-block.v1",
    data: {
      toolName: "task",
      reason: "task requires a fresh material RouteDecision before independent evidence",
      decisionId,
      path: null,
    },
  });
});

test("runtime rejects a symlink that escapes its declared target", async () => {
  await withRepository(async (root) => {
    await Promise.all([
      mkdir(join(root, "scripts")),
      mkdir(join(root, "tests")),
    ]);
    await symlink("../scripts", join(root, "tests", "link"));
    const runtime = createRuntime();
    const gate = await restore(runtime, [{
      ...decision,
      data: { ...decision.data, repositoryRoot: root },
    }]);
    assert.deepEqual(
      await gate({ toolName: "write", input: { path: "tests/link/escaped.mjs" } }),
      { block: true, reason: "ompstack target escapes the RouteDecision scope through a symlink: tests/link/escaped.mjs" },
    );
  });
});

test("fresh routing invalidates and replaces the prior decision", async () => {
  await withRepository(async (root, revision) => {
    const runtime = createRuntime();
    const route = runtime.tools.get("ompstack_route");
    const first = await route.execute("first", routeInput(root, revision));
    assert.equal(first.details.measurementPurpose, "bootstrap");
    await mkdir(join(root, "src"));
    await writeFile(join(root, "src", "example.ts"), "export {};\n");
    const second = await route.execute("second", routeInput(root, revision));
    assert.equal(second.details.measurementPurpose, "material");
    assert.notEqual(first.details.decisionId, second.details.decisionId);
    assert.deepEqual(
      stateEntries(runtime).map((entry) => entry.customType),
      [
        "io.github.chithang-50cent.ompstack.route-decision.v1",
        "io.github.chithang-50cent.ompstack.route-decision-state.v1",
        "io.github.chithang-50cent.ompstack.route-decision.v1",
      ],
    );
    assert.equal(stateEntries(runtime)[0].data.decisionId, first.details.decisionId);
    assert.deepEqual(stateEntries(runtime)[1].data, {
      decisionId: first.details.decisionId,
      state: "invalidated",
      reason: "superseded-by-fresh-route",
    });
    assert.deepEqual(first.details.declaredRiskFacts, routeInput(root, revision).riskFacts);
    assert.equal(await runtime.handlers.get("tool_call")({ toolName: "edit", input: { path: "src/example.ts" } }), undefined);
  });
});