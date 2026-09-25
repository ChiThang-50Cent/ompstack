import type { ExtensionAPI, ExtensionContext, SessionEntry } from "@oh-my-pi/pi-coding-agent";
import path from "node:path";
import { writeAuditSnapshot, type AuditEvent } from "./audit.js";
import { loadConfig } from "./config.js";
import {
  PSTACK_STATE_ENTRY,
  PSTACK_STATE_VERSION,
  type PstackConfig,
  type PstackMode,
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

function storeKey(ctx: ExtensionContext): string {
  return `${sessionId(ctx)}\0${path.resolve(ctx.cwd)}`;
}

function isPersistedState(value: unknown): value is PstackSessionState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PstackSessionState>;
  return candidate.version === PSTACK_STATE_VERSION && typeof candidate.mode === "string" && Array.isArray(candidate.completedRuns);
}

function restoreFromBranch(
  entries: SessionEntry[],
  fallback: PstackSessionState,
  workspace: string,
): PstackSessionState {
  let restored: PstackSessionState | undefined;
  let inheritedMode: PstackMode | undefined;
  for (const entry of entries) {
    if (entry.type !== "custom" || entry.customType !== PSTACK_STATE_ENTRY) continue;
    if (!isPersistedState(entry.data)) continue;
    if (entry.data.workspace === workspace) {
      restored = entry.data;
    } else {
      inheritedMode = entry.data.mode;
    }
  }
  return restored ?? (inheritedMode === undefined ? fallback : { ...fallback, mode: inheritedMode });
}

export class PstackStore {
  readonly #sessions = new Map<string, SessionBucket>();
  readonly #api: ExtensionAPI;

  constructor(api: ExtensionAPI) {
    this.#api = api;
  }

  async hydrate(ctx: ExtensionContext): Promise<SessionBucket> {
    const id = storeKey(ctx);
    const workspace = path.resolve(ctx.cwd);
    const loaded = await loadConfig(ctx.cwd);
    let branch: SessionEntry[] = [];
    try {
      branch = ctx.sessionManager.getBranch();
    } catch (error) {
      this.#api.logger.warn("pstack: failed to read session branch", { error: String(error) });
    }
    const state = { ...restoreFromBranch(branch, createInitialState(loaded.config), workspace), workspace };
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
    const id = storeKey(ctx);
    return this.#sessions.get(id) ?? this.hydrate(ctx);
  }

  async mutate(ctx: ExtensionContext, action: PstackStateAction, eventType: string = action.type): Promise<SessionBucket> {
    const bucket = await this.get(ctx);
    const state = reduceState(bucket.state, action);
    bucket.state = state;
    const audit: AuditEvent = { at: action.at, type: eventType, data: action };
    this.#api.appendEntry(PSTACK_STATE_ENTRY, { ...state, workspace: path.resolve(ctx.cwd) });
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
    const prefix = `${sessionId(ctx)}\0`;
    for (const key of this.#sessions.keys()) {
      if (key.startsWith(prefix)) this.#sessions.delete(key);
    }
  }

}

export type { SessionBucket };
