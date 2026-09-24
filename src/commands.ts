import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import { CEREMONY_LEVELS, PLAYBOOKS, PSTACK_MODES, type PstackMode } from "./domain.js";
import { computeArtifactFingerprint } from "./fingerprint.js";
import { abandonGate, checkGate, initGate } from "./gate-control.js";
import { renderState } from "./status.js";
import type { PstackStore } from "./store.js";
import { nowIso } from "./utils.js";

export function tokenizeCommand(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: "\"" | "'" | undefined;
  let escaping = false;

  for (const char of input.trim()) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\" && quote !== "'") {
      escaping = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = undefined;
      else current += char;
      continue;
    }
    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (escaping) current += "\\";
  if (current) tokens.push(current);
  return tokens;
}

function notify(ctx: ExtensionCommandContext, message: string, type: "info" | "warning" | "error" = "info"): void {
  ctx.ui.notify(message, type);
}

function helpText(): string {
  return [
    "pstack-omp commands",
    "  /pstack                         Show status",
    "  /pstack auto|strict|off         Set sticky mode",
    "  /pstack init [playbook] [objective]  Open proof state in auto/strict (objective defaults to the active OMP goal)",
    "  /pstack check                   Evaluate gates; closes an auto/strict gate-only run when they pass",
    "  /pstack abandon <reason>        Mark the run failed with a reason",
    "  /pstack doctor                  Check configuration and runtime capabilities",
    "  /pstack export [path]           Export state JSON inside the workspace",
    "  /pstack help                    Show this help",
    "",
    `Playbooks: ${PLAYBOOKS.join(", ")}`,
  ].join("\n");
}

function safeExportPath(cwd: string, requested: string | undefined): string {
  const candidate = resolve(cwd, requested?.trim() || ".omp/pstack/export.json");
  const rel = relative(cwd, candidate);
  if (isAbsolute(rel) || rel === ".." || rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)) {
    throw new Error("Export path must stay inside the current workspace.");
  }
  return candidate;
}

const AGENT_MODEL_PATTERNS: ReadonlyArray<{ name: string; patterns: readonly string[] }> = [
  { name: "pstack-scout", patterns: ["@pstack_fast", "@smol"] },
  { name: "pstack-architect", patterns: ["@pstack_reason", "@slow"] },
  { name: "pstack-builder", patterns: ["@pstack_code", "@task", "@smol"] },
  { name: "pstack-reviewer", patterns: ["@pstack_review", "@slow"] },
  { name: "pstack-reviewer-a", patterns: ["@pstack_panel_a", "@pstack_review"] },
  { name: "pstack-reviewer-b", patterns: ["@pstack_panel_b", "@pstack_review"] },
  { name: "pstack-reviewer-c", patterns: ["@pstack_panel_c", "@pstack_review"] },
  { name: "pstack-comment-sicko", patterns: ["@pstack_review", "@slow"] },
  { name: "pstack-judge", patterns: ["@pstack_reason", "@slow"] },
  { name: "pstack-judge-b", patterns: ["@pstack_panel_b", "@pstack_reason"] },
  { name: "pstack-synthesizer", patterns: ["@pstack_code", "@task", "@smol"] },
  { name: "pstack-verifier", patterns: ["@pstack_verify", "@slow"] },
];


async function doctor(api: ExtensionAPI, store: PstackStore, ctx: ExtensionCommandContext): Promise<string> {
  const bucket = await store.get(ctx);
  const fingerprint = await computeArtifactFingerprint(api, ctx.cwd, bucket.config);
  const toolNames = api.getAllTools?.().map(tool => tool.name).sort() ?? [];
  const requiredTools = [
    "pstack_status",
    "pstack_fingerprint",
    "pstack_gate",
    "pstack_acceptance",
    "pstack_evidence",
    "pstack_decision",
    "pstack_verdict",
  ];
  const missingTools = requiredTools.filter(tool => !toolNames.includes(tool));
  const modelRows = AGENT_MODEL_PATTERNS.map(agent => {
    const candidates = agent.patterns.map(pattern => {
      try {
        const model = ctx.models.resolve(pattern);
        return `${pattern}=${model ? `${model.provider ?? "?"}/${model.id ?? model.name ?? "resolved"}` : "unresolved"}`;
      } catch {
        return `${pattern}=unavailable`;
      }
    });
    return `${agent.name}: ${candidates.join(" -> ")}`;
  });
  return [
    "pstack-omp doctor",
    `workspace: ${ctx.cwd}`,
    `mode: ${bucket.state.mode}`,
    `config: ${bucket.configSource ?? "defaults"}`,
    ...(bucket.configWarning ? [`config warning: ${bucket.configWarning}`] : []),
    `fingerprint: ${fingerprint.kind}:${fingerprint.digest}${fingerprint.partial ? " (partial)" : ""}`,
    `registered pstack tools: ${missingTools.length === 0 ? "ok" : `missing ${missingTools.join(", ")}`}`,
    "model roles:",
    ...modelRows.map(row => `  ${row}`),
    "runtime target: OMP >= 18.2.11 (before_subagent_spawn required for full routing/provenance)",
  ].join("\n");
}

export function registerCommands(
  api: ExtensionAPI,
  store: PstackStore,
  reconcile?: (ctx: ExtensionCommandContext) => Promise<void>,
): void {
  api.registerCommand("pstack", {
    description: "Control pstack evidence-first workflows (/pstack help)",
    getArgumentCompletions: (prefix: string) => {
      const values = [
        "status", "auto", "strict", "off", "init", "check", "abandon", "doctor", "export", "help",
        ...PLAYBOOKS,
      ];
      return values.filter(value => value.startsWith(prefix)).map(value => ({ value, label: value }));
    },
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      try {
        const tokens = tokenizeCommand(args);
        const command = tokens.shift()?.toLowerCase() ?? "status";
        const at = nowIso();

        if (command === "help" || command === "--help" || command === "-h") {
          notify(ctx, helpText());
          return;
        }
        if ((PSTACK_MODES as readonly string[]).includes(command)) {
          const mode = command as PstackMode;
          await store.mutate(ctx, { type: "set_mode", mode, at });
          return;
        }

        await reconcile?.(ctx);
        const bucket = await store.get(ctx);
        if (command === "status") {
          notify(ctx, renderState(bucket.state, bucket.config));
          return;
        }
        if (command === "init") {
          const maybePlaybook = tokens[0];
          const playbook = maybePlaybook && (PLAYBOOKS as readonly string[]).includes(maybePlaybook)
            ? (tokens.shift() as (typeof PLAYBOOKS)[number])
            : undefined;
          const objective = tokens.join(" ").trim();
          const outcome = await initGate(api, store, ctx, { ...(objective ? { objective } : {}), ...(playbook ? { playbook } : {}) });
          notify(ctx, outcome.text, outcome.ok ? "info" : "error");
          return;
        }
        if (command === "check") {
          const outcome = await checkGate(api, store, ctx);
          notify(ctx, outcome.text, outcome.ok ? "info" : "warning");
          return;
        }
        if (command === "abandon") {
          const outcome = await abandonGate(store, ctx, tokens.join(" "));
          notify(ctx, outcome.text, outcome.ok ? "warning" : "error");
          return;
        }
        if (command === "doctor") {
          notify(ctx, await doctor(api, store, ctx));
          return;
        }
        if (command === "export") {
          const path = safeExportPath(ctx.cwd, tokens.shift());
          await mkdir(dirname(path), { recursive: true });
          await writeFile(path, `${JSON.stringify(bucket.state, null, 2)}\n`, "utf8");
          notify(ctx, `Exported pstack state to ${relative(ctx.cwd, path) || path}.`);
          return;
        }

        throw new Error(`Unknown command '${command}'.\n${helpText()}`);
      } catch (error) {
        api.logger.warn("pstack command failed", { error: String(error) });
        notify(ctx, String(error instanceof Error ? error.message : error), "error");
      }
    },
  });
}

export function parseModeFlag(value: boolean | string | undefined): PstackMode | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  return (PSTACK_MODES as readonly string[]).includes(normalized) ? normalized as PstackMode : undefined;
}

export function validatePlaybook(value: string): boolean {
  return (PLAYBOOKS as readonly string[]).includes(value);
}

export function validateCeremony(value: string): boolean {
  return (CEREMONY_LEVELS as readonly string[]).includes(value);
}
