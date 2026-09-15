import { routeRepository } from "../scripts/routing/route-repository.mjs";
type RouteInput = Parameters<typeof routeRepository>[0];

type ZodChain = {
  min(length: number): ZodChain;
  int(): ZodChain;
  nonnegative(): ZodChain;
  strict(): ZodChain;
};
type ZodApi = {
  object(shape: Record<string, unknown>): ZodChain;
  enum(values: string[]): ZodChain;
  array(schema: unknown): ZodChain;
  string(): ZodChain;
  boolean(): ZodChain;
  number(): ZodChain;
};
type SessionContext = { sessionManager: { getBranch(): Iterable<unknown> } };
type ToolCall = { toolName: string; input: Record<string, unknown> };
type ExtensionAPI = {
  zod: ZodApi;
  appendEntry(customType: string, data: unknown): Promise<unknown>;
  on(event: string, handler: (event: ToolCall, ctx: SessionContext) => unknown): void;
  registerTool(definition: Record<string, unknown>): void;
};

const DECISION_TYPE = "io.github.chithang-50cent.ompstack.route-decision.v1";
const DECISION_STATE_TYPE = "io.github.chithang-50cent.ompstack.route-decision-state.v1";
const READ_ONLY_TOOLS: Record<string, true> = { read: true, grep: true, glob: true, web_search: true, ompstack_route: true };
function isDecision(value: unknown): value is { decisionId: string } {
  return value !== null && typeof value === "object" && "decisionId" in value && typeof value.decisionId === "string" && /^[a-f0-9]{64}$/.test(value.decisionId);
}

function isDecisionState(value: unknown): value is { decisionId: string; state: "consumed" } {
  return isDecision(value) && "state" in value && value.state === "consumed";
}

function taskBindsDecision(input: Record<string, unknown>, decisionId: string) {
  const header = `Route-Decision: sha256:${decisionId}`;
  if (typeof input.context === "string") return input.context.split("\n").includes(header);
  if (typeof input.task === "string") return input.task.split("\n").includes(header);
  return false;
}


/** Persists one measured RouteDecision and consumes it before each mutable/unknown tool surface. */
export default function ompstackRuntime(pi: ExtensionAPI) {
  const z = pi.zod;
  let activeDecision: { decisionId: string } | null = null;

  async function rebuild(ctx: { sessionManager: { getBranch(): Iterable<unknown> } }) {
    activeDecision = null;
    for (const entry of ctx.sessionManager.getBranch()) {
      const record = entry as { type?: unknown; customType?: unknown; data?: unknown };
      if (record.type !== "custom") continue;
      if (record.customType === DECISION_TYPE && isDecision(record.data)) activeDecision = record.data;
      if (record.customType === DECISION_STATE_TYPE && isDecisionState(record.data) && activeDecision?.decisionId === record.data.decisionId) activeDecision = null;
    }
  }

  for (const event of ["session_start", "session_branch", "session_tree"] as const) pi.on(event, async (_event, ctx) => rebuild(ctx));

  pi.registerTool({
    name: "ompstack_route",
    label: "Route repository change",
    description: "Measure a declared repository revision pair and persist its immutable RouteDecision.",
    parameters: z.object({
      intent: z.enum(["investigation", "bug-fix", "feature", "refactoring", "prototype", "perf-issue", "runtime-forensics", "trace-forensics", "eval", "unresolved"]),
      targets: z.array(z.string()).min(1),
      taskFacts: z.object({ behaviorAffecting: z.boolean(), plannedWriteLanes: z.array(z.string()), proofSurface: z.string().min(1) }),
      repository: z.object({ root: z.string().min(1), base: z.string().min(1), head: z.string().min(1) }),
      riskFacts: z.object({ sharedSemanticBoundary: z.boolean(), consumerFamilies: z.number().int().nonnegative(), executionModes: z.number().int().nonnegative(), graphTraversal: z.boolean(), materialUnknown: z.boolean() }),
      graphPolicy: z.object({ sourceRoots: z.object({ go: z.array(z.string()), python: z.array(z.string()), typescript: z.array(z.string()), java: z.array(z.string()) }) }),
    }).strict(),
    async execute(_id: string, input: unknown) {
      // OMP validates tool input against `parameters` before calling execute.
      const validatedInput = input as unknown as RouteInput;
      const decision = await routeRepository(validatedInput);
      await pi.appendEntry(DECISION_TYPE, decision);
      activeDecision = decision;
      return { content: [{ type: "text", text: `Route-Decision: sha256:${decision.decisionId}` }], details: decision };
    },
  });

  pi.on("tool_call", async (event) => {
    if (event.toolName in READ_ONLY_TOOLS || (event.toolName === "write" && event.input.path === "xd://ompstack_route")) return;
    if (!activeDecision) return { block: true, reason: "ompstack requires a valid RouteDecision before mutable or unknown execution" };
    if (event.toolName === "task" && !taskBindsDecision(event.input, activeDecision.decisionId)) return { block: true, reason: "task requires an exact Route-Decision header" };
    await pi.appendEntry(DECISION_STATE_TYPE, { decisionId: activeDecision.decisionId, state: "consumed" });
    activeDecision = null;
  });
}
