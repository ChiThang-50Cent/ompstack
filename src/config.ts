import { readFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_CONFIG, PSTACK_MODES, type PstackConfig, type PstackMode } from "./domain.js";
import { isRecord } from "./utils.js";

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asPositiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function asExitCode(value: unknown, fallback: number): number {
  return isNonNegativeInteger(value) && value <= 125 ? value : fallback;
}

function asMode(value: unknown, fallback: PstackMode): PstackMode {
  return typeof value === "string" && PSTACK_MODES.includes(value as PstackMode) ? (value as PstackMode) : fallback;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const values = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return values.length > 0 ? values : fallback;
}

export function parseConfig(value: unknown): PstackConfig {
  if (!isRecord(value)) return { ...DEFAULT_CONFIG, fingerprintIgnore: [...DEFAULT_CONFIG.fingerprintIgnore] };
  return {
    defaultMode: asMode(value.defaultMode, DEFAULT_CONFIG.defaultMode),
    writeAuditFiles: asBoolean(value.writeAuditFiles, DEFAULT_CONFIG.writeAuditFiles),
    enforceIndependentVerifier: asBoolean(value.enforceIndependentVerifier, DEFAULT_CONFIG.enforceIndependentVerifier),
    preferCrossFamilyVerifier: asBoolean(value.preferCrossFamilyVerifier, DEFAULT_CONFIG.preferCrossFamilyVerifier),
    requireEvidenceForPass: asBoolean(value.requireEvidenceForPass, DEFAULT_CONFIG.requireEvidenceForPass),
    requireArtifactFingerprint: asBoolean(value.requireArtifactFingerprint, DEFAULT_CONFIG.requireArtifactFingerprint),
    maxPolicyCharacters: asPositiveInteger(value.maxPolicyCharacters, DEFAULT_CONFIG.maxPolicyCharacters),
    ...(isNonNegativeInteger(value.maxStopGateBlocks) ? { maxStopGateBlocks: value.maxStopGateBlocks } : {}),
    headlessOpenGateExitCode: asExitCode(value.headlessOpenGateExitCode, DEFAULT_CONFIG.headlessOpenGateExitCode),
    auditDirectory: asString(value.auditDirectory, DEFAULT_CONFIG.auditDirectory),
    fingerprintIgnore: asStringArray(value.fingerprintIgnore, [...DEFAULT_CONFIG.fingerprintIgnore]),
    maxWorkspaceFiles: asPositiveInteger(value.maxWorkspaceFiles, DEFAULT_CONFIG.maxWorkspaceFiles),
    maxHashedFileBytes: asPositiveInteger(value.maxHashedFileBytes, DEFAULT_CONFIG.maxHashedFileBytes),
  };
}

export async function loadConfig(cwd: string): Promise<{ config: PstackConfig; source?: string; warning?: string }> {
  const candidates = [
    path.join(cwd, ".omp", "pstack.json"),
    path.join(cwd, "pstack.json"),
  ];
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(await readFile(candidate, "utf8")) as unknown;
      return { config: parseConfig(parsed), source: candidate };
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "ENOENT") continue;
      return {
        config: { ...DEFAULT_CONFIG, fingerprintIgnore: [...DEFAULT_CONFIG.fingerprintIgnore] },
        source: candidate,
        warning: `Could not load ${candidate}: ${String(error)}`,
      };
    }
  }
  return { config: { ...DEFAULT_CONFIG, fingerprintIgnore: [...DEFAULT_CONFIG.fingerprintIgnore] } };
}
