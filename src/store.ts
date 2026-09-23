import type { ExtensionAPI, ExtensionContext, SessionEntry } from "@oh-my-pi/pi-coding-agent";
import { writeAuditSnapshot, type AuditEvent } from "./audit.js";
import { loadConfig } from "./config.js";
import {
  PSTACK_STATE_ENTRY,
  PSTACK_STATE_VERSION,
  type PstackConfig,
  type PstackSessionState,
  type PstackStateAction,
} from "./domain.js";
import { createInitialState, reduceState } from "./state.js";

interface SessionBucket {
  state: PstackSessionState;
  config: PstackConfig;
  configSource?: string;
  configWarning?: string;
}

function sessionId(ctx: ExtensionContext): string {
  try {
    return ctx.sessionManager.getSessionId();
  } catch {
    return `cwd:${ctx.cwd}`;
  }
}

function isPersistedState(value: unknown): value is PstackSessionState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PstackSessionState>;
  return candidate.version === PSTACK_STATE_VERSION && typeof candidate.mode === "string" && Array.isArray(candidate.completedRuns);
}

function restoreFromBranch(entries: SessionEntry[], fallback: PstackSessionState): PstackSessionState {
  let restored = fallback;
  for (const entry of entries) {
    if (entry.type !== "custom" || entry.customType !== PSTACK_STATE_ENTRY) continue;
    if (isPersistedState(entry.data)) restored = entry.data;
  }
  return restored;
}

export class PstackStore {
  readonly #sessions = new Map<string, SessionBucket>();
  readonly #api: ExtensionAPI;

  constructor(api: ExtensionAPI) {
    this.#api = api;
  }

  async hydrate(ctx: ExtensionContext): Promise<SessionBucket> {
    const id = sessionId(ctx);
    const loaded = await loadConfig(ctx.cwd);
    let branch: SessionEntry[] = [];
    try {
      branch = ctx.sessionManager.getBranch();
    } catch (error) {
      this.#api.logger.warn("pstack: failed to read session branch", { error: String(error) });
    }
    const state = restoreFromBranch(branch, createInitialState(loaded.config));
    const bucket: SessionBucket = {
      state,
      config: loaded.config,
      ...(loaded.source !== undefined ? { configSource: loaded.source } : {}),
      ...(loaded.warning !== undefined ? { configWarning: loaded.warning } : {}),
    };
    this.#sessions.set(id, bucket);
    return bucket;
  }

  async get(ctx: ExtensionContext): Promise<SessionBucket> {
    const id = sessionId(ctx);
    return this.#sessions.get(id) ?? this.hydrate(ctx);
  }

  async mutate(ctx: ExtensionContext, action: PstackStateAction, eventType: string = action.type): Promise<SessionBucket> {
    const bucket = await this.get(ctx);
    const state = reduceState(bucket.state, action);
    bucket.state = state;
    this.#api.appendEntry(PSTACK_STATE_ENTRY, state);
    const audit: AuditEvent = { at: action.at, type: eventType, data: action };
    try {
      await writeAuditSnapshot(ctx.cwd, bucket.config, state, audit);
    } catch (error) {
      this.#api.logger.warn("pstack: failed to write audit snapshot", { error: String(error) });
    }
    return bucket;
  }

  async checkpoint(ctx: ExtensionContext, eventType: string, data: unknown): Promise<void> {
    const bucket = await this.get(ctx);
    try {
      await writeAuditSnapshot(ctx.cwd, bucket.config, bucket.state, {
        at: new Date().toISOString(),
        type: eventType,
        data,
      });
    } catch (error) {
      this.#api.logger.warn("pstack: failed to append audit event", { error: String(error) });
    }
  }

  clearSession(ctx: ExtensionContext): void {
    this.#sessions.delete(sessionId(ctx));
  }

}

export type { SessionBucket };
