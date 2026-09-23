import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import type { AgentRole, PstackConfig, PstackRun } from "./domain.js";

/** OMP's `Model` lives in @oh-my-pi/pi-ai, which pstack does not depend on directly. */
type OmpModel = Parameters<ExtensionContext["models"]["family"]>[0];

const ROLE_BY_AGENT: Record<string, AgentRole> = {
  "pstack-scout": "scout",
  "pstack-architect": "architect",
  "pstack-builder": "builder",
  "pstack-reviewer": "reviewer",
  "pstack-judge": "judge",
  "pstack-synthesizer": "synthesizer",
  "pstack-verifier": "verifier",
};

export function roleForAgent(agentName: string): AgentRole | undefined {
  return ROLE_BY_AGENT[agentName.trim().toLowerCase()];
}

function resolve(ctx: ExtensionContext, spec: string): OmpModel | undefined {
  try {
    return ctx.models.resolve(spec);
  } catch {
    return undefined;
  }
}

function family(ctx: ExtensionContext, model: OmpModel | undefined): string | undefined {
  if (!model) return undefined;
  try {
    return ctx.models.family(model);
  } catch {
    return undefined;
  }
}

export function modelFamilyForPatterns(ctx: ExtensionContext, patterns: readonly string[]): string | undefined {
  for (const pattern of patterns) {
    const candidate = resolve(ctx, pattern);
    const candidateFamily = family(ctx, candidate);
    if (candidateFamily) return candidateFamily;
  }
  return undefined;
}

function latestBuilderFamily(run: PstackRun | undefined): string | undefined {
  if (!run) return undefined;
  for (let index = run.agents.length - 1; index >= 0; index -= 1) {
    const agent = run.agents[index];
    if (agent?.role === "builder" || agent?.role === "synthesizer") return agent.modelFamily;
  }
  return undefined;
}

export interface ModelRoutingDecision {
  patterns?: string[];
  note?: string;
  resolvedFamily?: string;
}

/**
 * OMP already resolves `task.agentModelOverrides` → agent frontmatter → session
 * fallback into `before_subagent_spawn.patterns`. Pstack only reorders those
 * patterns for its own invariant: a verifier from a different model family than
 * the latest writer. Every other spawn keeps OMP's decision untouched.
 */
export function chooseModelPatterns(
  ctx: ExtensionContext,
  agentName: string,
  currentPatterns: readonly string[],
  run: PstackRun | undefined,
  config: PstackConfig,
): ModelRoutingDecision {
  if (roleForAgent(agentName) !== "verifier" || !config.preferCrossFamilyVerifier) return {};
  const writerFamily = latestBuilderFamily(run);
  if (!writerFamily) return {};
  const resolvable = currentPatterns.filter(candidate => resolve(ctx, candidate));
  if (resolvable.length === 0) return {};

  const reordered = [...resolvable].sort((left, right) => {
    const leftDifferent = family(ctx, resolve(ctx, left)) !== writerFamily;
    const rightDifferent = family(ctx, resolve(ctx, right)) !== writerFamily;
    return Number(rightDifferent) - Number(leftDifferent);
  });
  const selectedFamily = family(ctx, resolve(ctx, reordered[0] ?? ""));
  const changed = reordered.some((pattern, index) => pattern !== currentPatterns[index]) || reordered.length !== currentPatterns.length;
  return {
    ...(changed ? { patterns: reordered } : {}),
    ...(selectedFamily !== undefined ? { resolvedFamily: selectedFamily } : {}),
    note: selectedFamily && selectedFamily !== writerFamily
      ? `pstack routed verifier away from writer family ${writerFamily}`
      : `pstack could not find a verifier outside writer family ${writerFamily}; using an independent context`,
  };
}
