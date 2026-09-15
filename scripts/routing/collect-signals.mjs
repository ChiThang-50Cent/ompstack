import { access } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { loadPolicy } from "../policy.mjs";

export const SIGNAL_FLAGS = Object.freeze([
  "touchesAuth",
  "touchesAuthorization",
  "touchesCryptoOrSecrets",
  "touchesTenantIsolation",
  "touchesMoneyMovement",
  "touchesMigration",
  "destructiveMigration",
  "touchesRuntimeConfig",
  "touchesPublicAPI",
  "touchesPersistence",
  "touchesConcurrency",
  "touchesGeneratedCode",
]);

function fail(message) {
  throw new Error(`signals: ${message}`);
}

function plainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizedPath(value) {
  return typeof value === "string" && value !== "" && !value.startsWith("/") && !value.startsWith("./") && !value.split("/").includes("..");
}

function regexes(patterns, label) {
  if (!Array.isArray(patterns) || patterns.length === 0 || !patterns.every((pattern) => typeof pattern === "string" && pattern !== "")) {
    fail(`${label} must be a non-empty pattern array`);
  }
  try {
    return patterns.map((pattern) => new RegExp(pattern));
  } catch {
    fail(`${label} contains an invalid pattern`);
  }
}

export function validateSignalPolicy(policy) {
  if (
    !plainObject(policy) ||
    policy.schemaVersion !== 1 ||
    typeof policy.policyVersion !== "string" || policy.policyVersion.trim() === "" ||
    !Array.isArray(policy.packageRootMarkers) || policy.packageRootMarkers.length === 0 ||
    !policy.packageRootMarkers.every((marker) => typeof marker === "string" && marker !== "" && !marker.includes("/")) ||
    !Array.isArray(policy.knownFlags) || !policy.knownFlags.every((flag) => SIGNAL_FLAGS.includes(flag)) ||
    new Set(policy.knownFlags).size !== policy.knownFlags.length ||
    !Array.isArray(policy.pathRules)
  ) {
    fail("policy has an invalid shape");
  }
  const codePathPatterns = regexes(policy.codePathPatterns, "codePathPatterns");
  const ids = new Set();
  const pathRules = policy.pathRules.map((rule) => {
    if (
      !plainObject(rule) ||
      typeof rule.id !== "string" || rule.id === "" || ids.has(rule.id) ||
      typeof rule.pathPattern !== "string" || rule.pathPattern === "" ||
      !Array.isArray(rule.flags) || rule.flags.length === 0 || !rule.flags.every((flag) => SIGNAL_FLAGS.includes(flag)) ||
      new Set(rule.flags).size !== rule.flags.length
    ) {
      fail("pathRules has an invalid shape");
    }
    ids.add(rule.id);
    try {
      return { ...rule, pathPattern: new RegExp(rule.pathPattern) };
    } catch {
      fail("pathRules contains an invalid pattern");
    }
  });
  return { ...policy, codePathPatterns, pathRules };
}

export async function loadSignalPolicy() {
  return validateSignalPolicy(await loadPolicy("signals"));
}

function validateChangeSet(changeSet) {
  if (!Array.isArray(changeSet)) fail("changeSet must be an array");
  for (const change of changeSet) {
    if (
      !plainObject(change) || !normalizedPath(change.path) || typeof change.changeType !== "string" || change.changeType === "" ||
      typeof change.binary !== "boolean" || !Number.isInteger(change.addedLines) || change.addedLines < 0 ||
      !Number.isInteger(change.deletedLines) || change.deletedLines < 0
    ) {
      fail("changeSet has an invalid entry");
    }
  }
}

async function nearestPackageRoot(root, path, markers) {
  let directory = dirname(resolve(root, path));
  const repositoryRoot = resolve(root);
  while (directory === repositoryRoot || directory.startsWith(`${repositoryRoot}/`)) {
    for (const marker of markers) {
      try {
        await access(join(directory, marker));
        return directory.slice(repositoryRoot.length).replace(/^\//, "") || ".";
      } catch {}
    }
    if (directory === repositoryRoot) return null;
    directory = dirname(directory);
  }
  return null;
}

/** Measures one supplied change-set; it never calls Git or infers unmapped sensitive surfaces. */
export async function collectSignals({ root = process.cwd(), changeSet, policy } = {}) {
  validateChangeSet(changeSet);
  const effectivePolicy = policy === undefined ? await loadSignalPolicy() : validateSignalPolicy(policy);
  const codeChanges = changeSet.filter((change) => effectivePolicy.codePathPatterns.some((pattern) => pattern.test(change.path)));
  const packageRoots = new Set();
  for (const change of codeChanges) {
    const packageRoot = await nearestPackageRoot(root, change.path, effectivePolicy.packageRootMarkers);
    if (packageRoot !== null) packageRoots.add(packageRoot);
  }
  const matchedFlags = new Set();
  for (const change of changeSet) {
    for (const rule of effectivePolicy.pathRules) {
      if (rule.pathPattern.test(change.path)) for (const flag of rule.flags) matchedFlags.add(flag);
    }
  }
  const flags = Object.fromEntries(SIGNAL_FLAGS.map((flag) => [
    flag,
    matchedFlags.has(flag) ? true : effectivePolicy.knownFlags.includes(flag) ? false : "unknown",
  ]));
  return {
    schemaVersion: 1,
    policyVersion: effectivePolicy.policyVersion,
    changedCodeFiles: codeChanges.length,
    changedLines: codeChanges.reduce((total, change) => total + change.addedLines + change.deletedLines, 0),
    packageRoots: packageRoots.size,
    ...flags,
  };
}
