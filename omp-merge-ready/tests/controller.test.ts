import { expect, test } from "bun:test";

import { createRun, isTerminal, proposeContract, transition } from "../extensions/merge-ready/state.ts";
import { addReceipt } from "../extensions/merge-ready/evidence.ts";
import { createController, MAX_CONSECUTIVE_BLOCKS } from "../extensions/merge-ready/index.ts";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type {
	EvidenceReceipt,
	ForgePort,
	GitPort,
	ProductContract,
	RunState,
	RunStore,
} from "../extensions/merge-ready/types.ts";

type Handler = (...args: unknown[]) => unknown;
type CapturedToolExecute = (
	toolCallId: string,
	params: unknown,
	signal: AbortSignal | undefined,
	onUpdate: unknown,
	ctx: unknown,
) => Promise<unknown>;

interface CapturedCommand {
	handler: Handler;
}

interface CapturedTool {
	execute: CapturedToolExecute;
}

interface FakePiApi {
	zod: Record<string, unknown>;
	registerCommand(name: string, definition: { handler: (args: string, ctx: unknown) => Promise<void> }): void;
	registerTool(definition: { name: string; execute: CapturedToolExecute }): void;
	on(event: string, handler: Handler): void;
	appendEntry(type: string, data: unknown): void;
	sendMessage(message: unknown, options: unknown): void;
}

interface FakePiCapture {
	pi: FakePiApi;
	commands: Map<string, CapturedCommand>;
	tools: Map<string, CapturedTool>;
	handlers: Map<string, Handler>;
	entries: Array<{ type: string; data: unknown }>;
	messages: Array<{ message: unknown; options: unknown }>;
}

class MemoryStore implements RunStore {
	readonly baseDir = "/tmp/omp-merge-ready-controller-state";
	private readonly states = new Map<string, RunState>();
	readonly trail: Array<{ runId: string; entry: Record<string, unknown> }> = [];

	async load(runId: string): Promise<RunState | undefined> {
		return this.states.get(runId);
	}

	async save(state: RunState): Promise<void> {
		this.states.set(state.runId, state);
	}

	async findActive(repoRoot: string): Promise<RunState | undefined> {
		const candidates = [...this.states.values()]
			.filter((state) => state.repo.root === repoRoot && !isTerminal(state.phase))
			.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
		return candidates[0];
	}

	async appendTrail(runId: string, entry: Record<string, unknown>): Promise<void> {
		this.trail.push({ runId, entry });
	}

	seed(state: RunState): void {
		this.states.set(state.runId, state);
	}

	replace(state: RunState): void {
		this.states.set(state.runId, state);
	}
}

interface FakeGitOptions {
	rootError?: Error;
	rootCalls?: { count: number };
	defaultBranch?: string;
	diff?: string;
	mergeTreeClean?: boolean;
	clean?: boolean;
}

function fakeGit(root = "/repo", options: FakeGitOptions = {}): GitPort {
	return {
		async revParse(ref: string): Promise<string> {
			return ref === "HEAD" ? "head" : "base";
		},
		async mergeBase(): Promise<string> {
			return "base";
		},
		async patchId(): Promise<string> {
			return "patch";
		},
		...(options.diff === undefined ? {} : { diff: async () => options.diff as string }),
		...(options.mergeTreeClean === undefined
			? {}
			: { mergeTreeClean: async () => options.mergeTreeClean as boolean }),
		async isClean(): Promise<boolean> {
			return options.clean ?? true;
		},
		async currentBranch(): Promise<string> {
			return "feature";
		},
		...(options.defaultBranch === undefined ? {} : { defaultBranch: async () => options.defaultBranch }),
		async remoteUrl(): Promise<string | undefined> {
			return "https://github.com/example/repo.git";
		},
		async root(): Promise<string> {
			if (options.rootCalls) options.rootCalls.count += 1;
			if (options.rootError) throw options.rootError;
			return root;
		},
	};
}

const fakeForge: ForgePort = {
	kind: "none",
	async fetchPr(): Promise<undefined> {
		return undefined;
	},
};

interface FakeSchema {
	optional(): FakeSchema;
}

function fakeSchema(): FakeSchema {
	return {
		optional(): FakeSchema {
			return this;
		},
	};
}

function fakePi(): FakePiCapture {
	const commands = new Map<string, CapturedCommand>();
	const tools = new Map<string, CapturedTool>();
	const handlers = new Map<string, Handler>();
	const entries: Array<{ type: string; data: unknown }> = [];
	const messages: Array<{ message: unknown; options: unknown }> = [];
	const node = (): FakeSchema => fakeSchema();
	const zod: Record<string, unknown> = {
		string: node,
		number: node,
		boolean: node,
		any: node,
		unknown: node,
		enum: node,
		array: node,
		object: (_shape: unknown): FakeSchema => node(),
	};
	const pi: FakePiApi = {
		zod,
		registerCommand(name, definition) {
			commands.set(name, { handler: (args, ctx) => definition.handler(String(args), ctx) });
		},
		registerTool(definition) {
			tools.set(definition.name, { execute: definition.execute });
		},
		on(event, handler) {
			handlers.set(event, handler);
		},
		appendEntry(type, data) {
			entries.push({ type, data });
		},
		sendMessage(message, options) {
			messages.push({ message, options });
		},
	};
	return { pi, commands, tools, handlers, entries, messages };
}

function context(
	agentKind: "main" | "sub" = "main",
	notifications?: string[],
	cwd = "/repo",
): Record<string, unknown> {
	return {
		cwd,
		hasUI: true,
		agent: { kind: agentKind, id: agentKind, name: agentKind, depth: 0 },
		ui: {
			notify(message: string) {
				notifications?.push(message);
			},
		},
	};
}

function setup(store = new MemoryStore(), git = fakeGit()): { store: MemoryStore; fake: FakePiCapture } {
	const controller = createController({
		store,
		git,
		forge: fakeForge,
		now: () => "2026-01-01T00:00:00.000Z",
		newId: () => "run-1",
	});
	const fake = fakePi();
	controller.register(fake.pi as unknown as ExtensionAPI);
	return { store, fake };
}

async function invoke(handler: Handler | undefined, ...args: unknown[]): Promise<unknown> {
	if (!handler) throw new Error("expected captured handler");
	return await handler(...args);
}

function stringField(value: unknown, key: string): string {
	if (!value || typeof value !== "object" || !(key in value)) throw new Error(`missing ${key}`);
	const field = value[key];
	if (typeof field !== "string") throw new Error(`invalid ${key}`);
	return field;
}

async function startRun(fake: FakePiCapture): Promise<void> {
	await invoke(fake.commands.get("merge-ready")?.handler, "fix the thing", context());
}
function gateState(approvalRequired: boolean, failingReview = false): RunState {
	const initial = createRun({
		runId: "gate-run",
		intent: "intent",
		repo: { root: "/repo", baseBranch: "main", startBranch: "feature" },
		now: "2026-01-01T00:00:00.000Z",
	});
	const contract: ProductContract = {
		version: 1,
		summary: "contract",
		acceptance: [
			{
				id: "AC-1",
				behavior: "behavior",
				source: "derived",
				confidence: "high",
				required: true,
			},
		],
		constraints: [],
		verificationPlan: ["test"],
		rigor: "LOW",
		openQuestions: [],
		rootCause: {
			statement: "The old path lacks the requested behavior.",
			evidence: [{ kind: "command", ref: "repro", exitCode: 1 }],
		},
		siblingSites: [
			{
				location: "extensions/other",
				relation: "same lifecycle",
				decision: "unrelated",
				rationale: "The sibling does not handle this behavior.",
			},
		],
		behaviorMatrix: [
			{ dimension: "inverse_direction", expectation: "n/a", rationale: "One-way operation." },
			{ dimension: "round_trip", expectation: "n/a", rationale: "No reverse representation." },
			{ dimension: "backward_compat", expectation: "existing callers remain supported" },
		],
		createdAt: "2026-01-01T00:00:00.000Z",
	};
	let state: RunState = {
		...initial,
		phase: "FINAL_GATE",
		contracts: [contract],
		patch: { baseSha: "base", headSha: "head", patchId: "patch" },
		pr: {
			number: 1,
			url: "https://example.test/pr/1",
			headSha: "head",
			isDraft: false,
			mergeable: "mergeable",
			checks: "pass",
			unresolvedBlockingThreads: 0,
			approvalRequired,
			fetchedAt: "2026-01-01T00:00:00.000Z",
		},
		issuedPacketDigests: [{ digest: "packet", patchId: "patch", contractVersion: 1 }],
		prBodyContractVersion: 1,
	};
	const receipt = (
		kind: EvidenceReceipt["kind"],
		id: string,
		status: EvidenceReceipt["status"] = "pass",
	): Omit<EvidenceReceipt, "runId" | "stale" | "staleReason"> => ({
		id,
		kind,
		producer: { type: kind === "ci" ? "ci" : "agent", id },
		baseSha: "base",
		headSha: "head",
		patchId: "patch",
		contractVersion: 1,
		status,
		covers: kind === "self_verification" ? ["AC-1"] : undefined,
		packetDigest: kind === "code_review" || kind === "product_review" ? "packet" : undefined,
		evidence: [{ kind: "command", ref: id, exitCode: status === "fail" ? 1 : 0 }],
		summary: id,
		createdAt: "2026-01-01T00:00:00.000Z",
	});
	state = addReceipt(state, receipt("self_verification", "self"));
	state = addReceipt(state, receipt("code_review", "review", failingReview ? "fail" : "pass"));
	state = addReceipt(state, receipt("product_review", "product"));
	state = addReceipt(state, receipt("ci", "ci"));
	state = addReceipt(state, receipt("mergeability", "merge"));
	return state;
}

test("session_stop blocks while the gate is blocked and returns an actionable reason", async () => {
	const { store, fake } = setup();
	await startRun(fake);
	const result = await invoke(fake.handlers.get("session_stop"), { type: "session_stop" }, context());
	expect(result).toMatchObject({ decision: "block" });
	expect(stringField(result, "reason")).toContain("merge-ready cannot stop");
	expect((await store.findActive("/repo"))?.consecutiveBlocks).toBe(1);
});

test("session_stop allows no active and terminal runs", async () => {
	const noRun = setup();
	expect(await invoke(noRun.fake.handlers.get("session_stop"), { type: "session_stop" }, context())).toBeUndefined();

	const terminal = setup();
	const state = createRun({
		runId: "terminal",
		intent: "intent",
		repo: { root: "/repo", baseBranch: "main", startBranch: "feature" },
		now: "2026-01-01T00:00:00.000Z",
	});
	terminal.store.seed(transition(state, "ABORTED", "operator stopped", "2026-01-01T00:00:01.000Z"));
	expect(await invoke(terminal.fake.handlers.get("session_stop"), { type: "session_stop" }, context())).toBeUndefined();
});

test("repeated no-progress stop blocks become inconclusive after the policy bound", async () => {
	const { store, fake } = setup();
	await startRun(fake);
	const stop = fake.handlers.get("session_stop");
	for (let index = 0; index < MAX_CONSECUTIVE_BLOCKS; index += 1) {
		expect(await invoke(stop, { type: "session_stop" }, context())).toMatchObject({ decision: "block" });
	}
	expect(await invoke(stop, { type: "session_stop" }, context())).toBeUndefined();
	const state = await store.load("run-1");
	expect(state?.phase).toBe("INCONCLUSIVE");
	expect(state?.terminalReason).toContain("without state progress");
});

test("mutating controller tools reject calls from subagents", async () => {
	const { fake } = setup();
	const execute = fake.tools.get("mr_receipt")?.execute;
	expect(execute).toBeDefined();
	await expect(invoke(execute, "tool-1", {}, new AbortController().signal, undefined, context("sub"))).rejects.toThrow("main merge-ready session");
});

test("tool_call blocks merge and force-push commands only while active", async () => {
	const active = setup();
	await startRun(active.fake);
	const toolCall = active.fake.handlers.get("tool_call");
	await expect(invoke(toolCall, { type: "tool_call", toolCallId: "1", toolName: "bash", input: { command: "gh pr merge 1" } }, context())).resolves.toMatchObject({ block: true });
	await expect(invoke(toolCall, { type: "tool_call", toolCallId: "2", toolName: "bash", input: { command: "cd x && git push --force" } }, context())).resolves.toMatchObject({ block: true });

	const inactive = setup();
	expect(await invoke(inactive.fake.handlers.get("tool_call"), { type: "tool_call", toolCallId: "3", toolName: "bash", input: { command: "gh pr merge 1" } }, context())).toBeUndefined();
});

test("registers controller tools and emits the required kickoff/result shapes", async () => {
	const { fake } = setup();
	expect([...fake.tools.keys()]).toEqual([
		"mr_state",
		"mr_contract",
		"mr_receipt",
		"mr_gate",
		"mr_run_checks",
		"mr_transition",
		"mr_refresh",
		"mr_review_packet",
	]);
	await startRun(fake);
	const kickoff = fake.messages[0]?.message;
	expect(kickoff).toMatchObject({ customType: "merge-ready", display: false });
	if (!kickoff || typeof kickoff !== "object" || !("content" in kickoff)) throw new Error("missing kickoff content");
	expect(kickoff.content).toContain("skill://merge-ready");
	expect(kickoff.content).toContain("mr_state");

	const result = await invoke(fake.tools.get("mr_state")?.execute, "tool-1", {}, undefined, undefined, context());
	expect(result).toMatchObject({ content: [{ type: "text" }] });
	if (!result || typeof result !== "object" || !("details" in result)) throw new Error("missing tool details");
	expect(result.details).toMatchObject({ active: true, runId: "run-1" });
	expect(result.details).toMatchObject({ active: true, runId: "run-1", forge: "none" });
});
test("session_stop allows clarification waits and external-approval-ready runs", async () => {
	const clarification = setup();
	let state = createRun({
		runId: "clarification",
		intent: "intent",
		repo: { root: "/repo", baseBranch: "main", startBranch: "feature" },
		now: "2026-01-01T00:00:00.000Z",
	});
	state = transition(state, "SPEC_DISCOVERY", "discovery", "2026-01-01T00:00:01.000Z");
	state = proposeContract(
		state,
		{
			summary: "clarify",
			acceptance: [],
			constraints: [],
			verificationPlan: [],
			rigor: "LOW",
			openQuestions: [{ id: "Q-1", question: "Which policy?", blocking: true }],
		},
		"2026-01-01T00:00:01.500Z",
	);
	state = transition(state, "CLARIFICATION_REQUIRED", "operator decision needed", "2026-01-01T00:00:02.000Z");
	clarification.store.seed(state);
	expect(await invoke(clarification.fake.handlers.get("session_stop"), { type: "session_stop" }, context())).toBeUndefined();
	expect((await clarification.store.load("clarification"))?.consecutiveBlocks).toBe(0);

	const approval = setup();
	approval.store.seed(gateState(true));
	expect(await invoke(approval.fake.handlers.get("session_stop"), { type: "session_stop" }, context())).toBeUndefined();
	expect((await approval.store.load("gate-run"))?.consecutiveBlocks).toBe(0);
});

test("session_start notifies the operator and tells the model to refresh without triggering a turn", async () => {
	const { fake } = setup();
	await startRun(fake);
	const messagesBefore = fake.messages.length;
	const notifications: string[] = [];
	await invoke(fake.handlers.get("session_start"), { type: "session_start" }, context("main", notifications));
	expect(notifications).toHaveLength(1);
	expect(notifications[0]).toContain("run-1");
	expect(notifications[0]).toContain("INTAKE");
	expect(fake.messages.length).toBe(messagesBefore + 1);
	expect(fake.messages.at(-1)?.options).toMatchObject({ triggerTurn: false });
	const resumed = fake.messages.at(-1)?.message;
	expect(resumed).toMatchObject({ content: expect.stringContaining("mr_refresh") });
});

test("non-git cwd tool calls are allowed and root lookup is cached", async () => {
	const rootCalls = { count: 0 };
	const { fake } = setup(
		new MemoryStore(),
		fakeGit("/repo", { rootError: new Error("git rev-parse failed: not a git repository"), rootCalls }),
	);
	const event = { type: "tool_call", toolCallId: "non-git", toolName: "bash", input: { command: "gh pr merge 1" } };
	expect(await invoke(fake.handlers.get("tool_call"), event, context())).toBeUndefined();
	expect(await invoke(fake.handlers.get("tool_call"), event, context())).toBeUndefined();
	expect(rootCalls.count).toBe(1);
});

test("genuine git root errors still fail closed", async () => {
	const { fake } = setup(new MemoryStore(), fakeGit("/repo", { rootError: new Error("permission denied") }));
	await expect(
		invoke(
			fake.handlers.get("tool_call"),
			{ type: "tool_call", toolCallId: "error", toolName: "bash", input: { command: "echo safe" } },
			context(),
		),
	).rejects.toThrow("permission denied");
});

test("edit hashline headers and write paths protect controller state", async () => {
	const { store, fake } = setup();
	await startRun(fake);
	const toolCall = fake.handlers.get("tool_call");
	const editInput = `[${store.baseDir}/runs/run-1/state.json#A1B2]\\nPUT 1.=1:\\n+changed`;
	await expect(
		invoke(toolCall, { type: "tool_call", toolCallId: "edit", toolName: "edit", input: { input: editInput } }, context()),
	).resolves.toMatchObject({ block: true });
	await expect(
		invoke(
			toolCall,
			{ type: "tool_call", toolCallId: "write", toolName: "write", input: { path: `${store.baseDir}/runs/run-1/state.json` } },
			context(),
		),
	).resolves.toMatchObject({ block: true });
});

test("repeated failing review receipts do not reset the stop bound", async () => {
	const { store, fake } = setup();
	let state = gateState(false, true);
	store.seed(state);
	const stop = fake.handlers.get("session_stop");
	for (let index = 0; index < MAX_CONSECUTIVE_BLOCKS; index += 1) {
		expect(await invoke(stop, { type: "session_stop" }, context())).toMatchObject({ decision: "block" });
		state = await store.load("gate-run") ?? state;
		state = addReceipt(
			state,
			{
				id: `review-${index}`,
				kind: "code_review",
				producer: { type: "agent", id: "review" },
				baseSha: "base",
				headSha: "head",
				patchId: "patch",
				contractVersion: 1,
				status: "fail",
				packetDigest: "packet",
				evidence: [{ kind: "command", ref: "review", exitCode: 1 }],
				summary: "same failing review",
				createdAt: "2026-01-01T00:00:00.000Z",
			},
		);
		store.replace(state);
	}
	expect(await invoke(stop, { type: "session_stop" }, context())).toBeUndefined();
	expect((await store.load("gate-run"))?.phase).toBe("INCONCLUSIVE");
});

test("intake uses the configured remote default branch and falls back to current branch", async () => {
	const configured = setup(new MemoryStore(), fakeGit("/repo", { defaultBranch: "develop" }));
	await startRun(configured.fake);
	expect((await configured.store.findActive("/repo"))?.repo.baseBranch).toBe("develop");

	const fallback = setup();
	await startRun(fallback.fake);
	expect((await fallback.store.findActive("/repo"))?.repo.baseBranch).toBe("feature");
});
test("review packets use the current git diff and persist issued binding", async () => {
	const store = new MemoryStore();
	const { fake } = setup(store, fakeGit("/repo", { diff: "diff --git a/file b/file\n" }));
	store.seed(gateState(false));
	const result = await invoke(
		fake.tools.get("mr_review_packet")?.execute,
		"packet",
		{ contextPointers: ["file.ts"], rubricVersion: "rubric-1" },
		undefined,
		undefined,
		context(),
	);
	expect(result).toMatchObject({ content: [{ type: "text" }] });
	expect((await store.load("gate-run"))?.issuedPacketDigests).toHaveLength(2);

	const empty = setup(new MemoryStore(), fakeGit("/repo", { diff: " \n" }));
	empty.store.seed(gateState(false));
	await expect(
		invoke(
			empty.fake.tools.get("mr_review_packet")?.execute,
			"packet",
			{},
			undefined,
			undefined,
			context(),
		),
	).rejects.toThrow("empty diff");
});
test("mr_receipt rejects model-asserted ci evidence even when it claims a script producer", async () => {
	const store = new MemoryStore();
	const { fake } = setup(store);
	store.seed({ ...gateState(false), forge: "none", pr: undefined });
	const submit = (kind: string, producerType: string) =>
		invoke(
			fake.tools.get("mr_receipt")?.execute,
			kind,
			{
				id: `model-${kind}-${producerType}`,
				kind,
				producer: { type: producerType, id: "local-checks" },
				baseSha: "base",
				headSha: "head",
				patchId: "patch",
				contractVersion: 1,
				status: "pass",
				evidence: [{ kind: "command", ref: "bun test", exitCode: 0 }],
				summary: "claimed pass",
				createdAt: "2026-01-01T00:00:00.000Z",
			},
			undefined,
			undefined,
			context(),
		);
	await expect(submit("ci", "script")).rejects.toThrow("produced by the controller");
	await expect(submit("mergeability", "agent")).rejects.toThrow("produced by the controller");
	await expect(submit("code_review", "script")).rejects.toThrow("reserved for the controller");
});

test("local refresh records mergeability and local checks", async () => {
	const store = new MemoryStore();
	const root = process.cwd();
	const git = fakeGit(root, { mergeTreeClean: true, clean: true });
	const { fake } = setup(store, git);
	const initial = gateState(false);
	store.seed({
		...initial,
		repo: { ...initial.repo, root },
		forge: "none",
		pr: undefined,
	});
	await invoke(fake.tools.get("mr_refresh")?.execute, "refresh", {}, undefined, undefined, context("main", undefined, root));
	let state = await store.load("gate-run");
	expect(state?.workingTreeClean).toBe(true);
	expect(state?.receipts.some((receipt) => receipt.kind === "mergeability" && receipt.producer.type === "script")).toBe(true);

	const result = await invoke(
		fake.tools.get("mr_run_checks")?.execute,
		"checks",
		{ command: "printf local-check-output" },
		undefined,
		undefined,
		context("main", undefined, root),
	);
	expect(result).toMatchObject({ details: { exitCode: 0, timedOut: false } });
	state = await store.load("gate-run");
	expect(state?.checkCommand).toBe("printf local-check-output");
	const check = state?.receipts.find((receipt) => receipt.kind === "ci" && receipt.producer.type === "script");
	expect(check?.producer).toMatchObject({ type: "script", id: "local-checks" });
	if (!check) throw new Error("missing local check receipt");
	const outputPath = check.evidence.find((pointer) => pointer.kind === "file")?.ref;
	expect(outputPath).toBeString();
	if (!outputPath) throw new Error("missing local check output path");
	expect(await Bun.file(outputPath).text()).toContain("local-check-output");
});

test("mr_run_checks records skipped-test lines and mr_contract set_base rebinds the base", async () => {
	const store = new MemoryStore();
	const root = process.cwd();
	const { fake } = setup(store, fakeGit(root, { mergeTreeClean: true, clean: true }));
	const initial = gateState(false);
	store.seed({ ...initial, repo: { ...initial.repo, root }, forge: "none", pr: undefined });
	const ctx = context("main", undefined, root);

	await invoke(fake.tools.get("mr_contract")?.execute, "base", { op: "set_base", baseBranch: "release/2026-09-15" }, undefined, undefined, ctx);
	const rebased = await store.load("gate-run");
	expect(rebased?.repo.baseBranch).toBe("release/2026-09-15");
	expect(rebased?.receipts.some((r) => r.kind === "mergeability" && !r.stale && r.evidence[0]?.ref.includes("release/2026-09-15"))).toBe(true);

	const result = await invoke(
		fake.tools.get("mr_run_checks")?.execute,
		"checks",
		{ command: "echo 'skipped TestX.test_y: MongoDB is not configured'" },
		undefined,
		undefined,
		ctx,
	);
	expect(result).toMatchObject({ details: { skipped: ["skipped TestX.test_y: MongoDB is not configured"] } });
	const check = (await store.load("gate-run"))?.receipts.find((r) => r.kind === "ci" && !r.stale && r.producer.id === "local-checks");
	expect(check?.skipped).toEqual(["skipped TestX.test_y: MongoDB is not configured"]);
});

test("local mode refuses environment or external blockers while local work remains", async () => {
	const store = new MemoryStore();
	const { fake } = setup(store);
	store.seed({ ...gateState(false), forge: "none", pr: undefined });
	await expect(
		invoke(
			fake.tools.get("mr_transition")?.execute,
			"blocked",
			{ to: "BLOCKED_ENVIRONMENT", reason: "there is no pull request" },
			undefined,
			undefined,
			context(),
		),
	).rejects.toThrow("local merge-ready mode");
});
