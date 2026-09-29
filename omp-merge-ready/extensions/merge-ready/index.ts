import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
	SessionStopEvent,
	SessionStopEventResult,
	ToolCallEvent,
	ToolCallEventResult,
} from "@oh-my-pi/pi-coding-agent";

import { detectForge, NoForge } from "./github";
import { GitCli } from "./patch";
import { registerTools, type MergeReadyToolDependencies, type ToolPorts } from "./tools";
import { evaluateGate } from "./gate";
import { classifyCommand, touchesControllerState } from "./guards";
import { createRun, isTerminal, transition } from "./state";
import type { ForgePort, GitPort, RunState, RunStore } from "./types";
import { FileRunStore } from "./store";

export const MAX_CONSECUTIVE_BLOCKS = 20;

export interface ControllerDependencies {
	store: RunStore;
	git: GitPort;
	forge: ForgePort;
	now?: () => string;
	newId?: () => string;
	portsForCwd?: (cwd: string) => ToolPorts | Promise<ToolPorts>;
}

export interface MergeReadyController {
	register(pi: ExtensionAPI): void;
	start(args: string, ctx: ExtensionCommandContext): Promise<void>;
	status(ctx: ExtensionCommandContext | ExtensionContext): Promise<void>;
	abort(ctx: ExtensionCommandContext): Promise<void>;
	sessionStart(ctx: ExtensionContext): Promise<void>;
	sessionStop(event: SessionStopEvent, ctx: ExtensionContext): Promise<SessionStopEventResult | void>;
	toolCall(event: ToolCallEvent, ctx: ExtensionContext): Promise<ToolCallEventResult | void>;
}

function defaultNow(): string {
	return new Date().toISOString();
}

function defaultId(): string {
	return randomUUID();
}

function nonEmptyIntent(args: string): string {
	const intent = args.trim();
	if (intent.length === 0) throw new Error("usage: /merge-ready <intent>");
	return intent;
}

function renderStatus(state: RunState | undefined): string {
	if (!state) return "No active merge-ready run.";
	const contract = state.contracts.at(-1);
	const currentReceipts = state.receipts.filter(receipt => !receipt.stale);
	const localCompletion =
		(state.forge ?? "github") === "none" && state.phase === "MERGE_READY" && state.patch
			? `merge-ready branch ${state.repo.startBranch} @ ${state.patch.headSha}, merges cleanly into ${state.repo.baseBranch}`
			: undefined;
	return [
		`merge-ready run ${state.runId}`,
		`phase: ${state.phase}`,
		`intent: ${state.intent}`,
		`contract: ${contract ? `v${contract.version}` : "none"}`,
		`patch: ${state.patch?.patchId || "none"}`,
		`PR: ${state.pr ? `#${state.pr.number} (${state.pr.headSha})` : "none"}`,
		localCompletion,
		`current evidence receipts: ${currentReceipts.length}`,
		state.terminalReason ? `reason: ${state.terminalReason}` : undefined,
	].filter((line): line is string => Boolean(line)).join("\n");
}

function gateReason(gate: { status: string; missing: string[]; stale: string[]; failed: string[]; nextPhase?: string }): string {
	const lines = [`merge-ready cannot stop: ${gate.status}`];
	if (gate.nextPhase) lines.push(`next phase: ${gate.nextPhase}`);
	if (gate.missing.length > 0) lines.push(`missing: ${gate.missing.join("; ")}`);
	if (gate.stale.length > 0) lines.push(`stale: ${gate.stale.join("; ")}`);
	if (gate.failed.length > 0) lines.push(`failed: ${gate.failed.join("; ")}`);
	return lines.join("\n");
}

function pathValues(value: unknown): string[] {
	if (typeof value === "string") return [value];
	if (!Array.isArray(value)) return [];
	return value.filter((entry): entry is string => typeof entry === "string");
}
function hashlinePaths(input: string): string[] {
	const paths: string[] = [];
	const headers = /\[([^\]\r\n]+)#([0-9A-Fa-f]{4})\]/g;
	let match: RegExpExecArray | null;
	while ((match = headers.exec(input)) !== null) {
		const path = match[1]?.trim();
		if (path) paths.push(path);
	}
	return paths;
}

function isNotRepositoryError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return /not a git repository|outside(?: of)? a git work tree|not a git directory/i.test(message);
}
function gateFingerprint(state: RunState, gate: { missing: string[]; stale: string[]; failed: string[]; nextPhase?: string }): string {
	const payload = JSON.stringify({
		phase: state.phase,
		missing: gate.missing,
		stale: gate.stale,
		failed: gate.failed,
		nextPhase: gate.nextPhase,
	});
	return createHash("sha256").update(payload, "utf8").digest("hex");
}



function customMessage(content: string, display = false): { customType: string; content: string; display: boolean } {
	return { customType: "merge-ready", content, display };
}

function createDefaultDependencies(): ControllerDependencies {
	const store = new FileRunStore();
	return {
		store,
		// The fixed ports are only a fallback; the cwd-aware factory below is used
		// by every command/event in the extension's normal runtime.
		git: new GitCli(process.cwd()),
		forge: new NoForge(),
		portsForCwd: async (cwd: string) => {
			const git = new GitCli(cwd);
			const remote = await git.remoteUrl();
			return { git, forge: detectForge(remote, cwd) };
		},
	};
}

/** Build an injectable lifecycle controller without registering it globally. */
export function createController(options: ControllerDependencies): MergeReadyController {
	const now = options.now ?? defaultNow;
	const newId = options.newId ?? defaultId;
	let appendEntry: ((customType: string, data: unknown) => void) | undefined;
	let sendMessage: ExtensionAPI["sendMessage"] | undefined;


	const portsCache = new Map<string, Promise<ToolPorts>>();
	const rootCache = new Map<string, string | undefined>();

	const portsFor = (cwd: string): Promise<ToolPorts> => {
		const cached = portsCache.get(cwd);
		if (cached) return cached;
		const pending = options.portsForCwd
			? Promise.resolve(options.portsForCwd(cwd))
			: Promise.resolve({ git: options.git, forge: options.forge });
		const guarded = pending.catch((error: unknown) => {
			portsCache.delete(cwd);
			throw error;
		});
		portsCache.set(cwd, guarded);
		return guarded;
	};

	const loadActive = async (
		ctx: ExtensionContext | ExtensionCommandContext,
	): Promise<{ run: RunState | undefined; ports: ToolPorts; root: string | undefined }> => {
		const ports = await portsFor(ctx.cwd);
		let root: string | undefined;
		if (rootCache.has(ctx.cwd)) {
			root = rootCache.get(ctx.cwd);
		} else {
			try {
				root = await ports.git.root();
			} catch (error) {
				if (!isNotRepositoryError(error)) throw error;
				root = undefined;
			}
			rootCache.set(ctx.cwd, root);
		}
		if (!root) return { run: undefined, ports, root: undefined };
		const run = await options.store.findActive(root);
		return { run, ports, root };
	};

	const persist = async (state: RunState, operation: string): Promise<void> => {
		await options.store.save(state);
		await options.store.appendTrail(state.runId, { at: now(), operation, phase: state.phase });
	};

	const controller: MergeReadyController = {
		register(pi: ExtensionAPI): void {
			appendEntry = (customType, data) => pi.appendEntry(customType, data);
			sendMessage = (message, messageOptions) => pi.sendMessage(message, messageOptions);
			const toolDeps: MergeReadyToolDependencies = {
				store: options.store,
				git: options.git,
				forge: options.forge,
				now,
				newId,
				portsForCwd: portsFor,
				appendEntry,
			};
			registerTools(pi, toolDeps);

			pi.registerCommand("merge-ready", {
				description: "Drive an intent to a merge-ready branch or pull request without merging",
				handler: async (args, ctx) => controller.start(args, ctx),
			});
			pi.registerCommand("merge-ready-status", {
				description: "Show the active merge-ready controller state",
				handler: async (_args, ctx) => controller.status(ctx),
			});
			pi.registerCommand("merge-ready-abort", {
				description: "Abort the active merge-ready run",
				handler: async (_args, ctx) => controller.abort(ctx),
			});

			pi.on("session_start", async (_event, ctx) => controller.sessionStart(ctx));
			pi.on("session_stop", async (event, ctx) => controller.sessionStop(event, ctx));
			pi.on("tool_call", async (event, ctx) => controller.toolCall(event, ctx));
		},

		async start(args: string, ctx: ExtensionCommandContext): Promise<void> {
			const intent = nonEmptyIntent(args);
			const active = await loadActive(ctx);
			if (active.run && !isTerminal(active.run.phase)) {
				throw new Error(`an active merge-ready run already owns ${active.root}: ${active.run.runId}`);
			}
			if (!active.root) throw new Error("merge-ready must start inside a git repository");
			const startBranch = await active.ports.git.currentBranch();
			const baseBranch = (await active.ports.git.defaultBranch?.()) ?? startBranch;
			const remote = await active.ports.git.remoteUrl();
			const state = createRun({
				runId: newId(),
				intent,
				repo: {
					root: active.root,
					remote,
					baseBranch,
					startBranch,
				},
				forge: active.ports.forge.kind,
				now: now(),
			});
			await persist(state, "merge-ready:start");
			appendEntry?.("merge-ready/run", { runId: state.runId });
			const target = state.forge === "none" ? "a merge-ready branch; no PR is required" : "a merge-ready PR";
			const kickoff = customMessage(
				`Read skill://merge-ready first. Then call mr_state and begin intent modeling and repository spec discovery for run ${state.runId}. The goal is ${target}; do not merge it.`,
			);
			const commandActions = ctx as unknown as {
				sendMessage?: (message: unknown, options?: { triggerTurn?: boolean }) => void;
			};
			if (typeof commandActions.sendMessage === "function") {
				commandActions.sendMessage(kickoff, { triggerTurn: true });
			} else {
				sendMessage?.(kickoff, { triggerTurn: true });
			}
		},

		async status(ctx: ExtensionCommandContext | ExtensionContext): Promise<void> {
			const active = await loadActive(ctx);
			const message = renderStatus(active.run);
			if (ctx.ui && typeof ctx.ui.notify === "function") {
				ctx.ui.notify(message, "info");
				return;
			}
			sendMessage?.(customMessage(message, true), { triggerTurn: false });
		},

		async abort(ctx: ExtensionCommandContext): Promise<void> {
			const active = await loadActive(ctx);
			if (!active.run) {
				if (ctx.ui && typeof ctx.ui.notify === "function") ctx.ui.notify("No active merge-ready run.", "info");
				return;
			}
			if (isTerminal(active.run.phase)) {
				ctx.ui.notify(`Run ${active.run.runId} is already terminal (${active.run.phase}).`, "info");
				return;
			}
			const next = transition(active.run, "ABORTED", "aborted by operator", now());
			await persist(next, "merge-ready:abort");
			ctx.ui.notify(`Aborted merge-ready run ${next.runId}.`, "info");
		},
		async sessionStart(ctx: ExtensionContext): Promise<void> {
			const active = await loadActive(ctx);
			if (!active.run) return;
			if (ctx.hasUI && typeof ctx.ui.notify === "function") {
				ctx.ui.notify(
					`Merge-ready run ${active.run.runId} is active in phase ${active.run.phase}; call mr_refresh before continuing.`,
					"info",
				);
			}
			sendMessage?.(
				customMessage(
					`Merge-ready run ${active.run.runId} resumed in phase ${active.run.phase}. Call mr_refresh before taking the next workflow action.`,
				),
				{ triggerTurn: false },
			);
		},

		async sessionStop(_event: SessionStopEvent, ctx: ExtensionContext): Promise<SessionStopEventResult | void> {
			if (ctx.agent.kind !== "main") return;
			const active = await loadActive(ctx);
			const run = active.run;
			if (!run || isTerminal(run.phase)) return;

			const gate = evaluateGate(run);
			if (
				run.phase === "CLARIFICATION_REQUIRED" ||
				run.phase === "AWAITING_APPROVAL" ||
				gate.status === "merge_ready" ||
				gate.status === "ready_except_external_approval" ||
				gate.status === "terminal_blocked"
			) return;

			const fingerprint = gateFingerprint(run, gate);
			const consecutiveBlocks = run.lastBlockFingerprint === fingerprint ? run.consecutiveBlocks + 1 : 1;
			if (consecutiveBlocks > MAX_CONSECUTIVE_BLOCKS) {
				const inconclusive = transition(run, "INCONCLUSIVE", "stop gate blocked repeatedly without state progress", now());
				const bounded = {
					...inconclusive,
					consecutiveBlocks,
					lastBlockFingerprint: fingerprint,
				};
				await persist(bounded, "merge-ready:inconclusive");
				return;
			}

			const blocked = {
				...run,
				consecutiveBlocks,
				lastBlockFingerprint: fingerprint,
				updatedAt: now(),
			};
			await persist(blocked, "merge-ready:stop-block");
			return { decision: "block", reason: gateReason(gate) };
		},

		async toolCall(event: ToolCallEvent, ctx: ExtensionContext): Promise<ToolCallEventResult | void> {
			const active = await loadActive(ctx);
			if (!active.run || isTerminal(active.run.phase)) return;
			const eventRecord = event as unknown as { toolName?: unknown; input?: unknown };
			const toolName = typeof eventRecord.toolName === "string" ? eventRecord.toolName : "";
			const input = eventRecord.input && typeof eventRecord.input === "object" ? eventRecord.input as Record<string, unknown> : {};

			if (toolName === "bash") {
				const command = typeof input.command === "string" ? input.command : "";
				const classification = classifyCommand(command);
				if (classification.kind !== "ok") return { block: true, reason: classification.reason };
				if (touchesControllerState(command, options.store.baseDir)) {
					return { block: true, reason: "bash commands may not mutate merge-ready controller state" };
				}
			}
			if (toolName === "edit" || toolName === "write") {
				const rawPaths =
					toolName === "edit"
						? typeof input.input === "string"
							? hashlinePaths(input.input)
							: []
						: pathValues(input.path);
				const paths = rawPaths.map(path => resolve(ctx.cwd, path));
				if (paths.some(path => touchesControllerState(path, options.store.baseDir))) {
					return { block: true, reason: `${toolName} may not modify merge-ready controller state` };
				}
			}
		},
	};

	return controller;
}

/** OMP extension entry point. The optional second argument is a test seam. */
export default function mergeReadyExtension(pi: ExtensionAPI, injected?: ControllerDependencies): MergeReadyController {
	const controller = createController(injected ?? createDefaultDependencies());
	controller.register(pi);
	return controller;
}