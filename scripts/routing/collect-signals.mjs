import { access, readFile } from "node:fs/promises";
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
  "touchesExposedParser",
]);

function fail(message) {
  throw new Error(`signals: ${message}`);
}

function plainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}


function isMissing(error) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function normalizedPath(value) {
  return typeof value === "string" && value !== "" && !value.startsWith("/") && !value.startsWith("./") && !value.split("/").includes("..");
}

function regexes(patterns, label) {
  if (Array.isArray(patterns) && patterns.length > 0 && patterns.every((pattern) => pattern instanceof RegExp)) return patterns;
  if (!Array.isArray(patterns) || patterns.length === 0 || !patterns.every((pattern) => typeof pattern === "string" && pattern !== "")) {
    fail(`${label} must be a non-empty pattern array`);
  }
  try {
    return patterns.map((pattern) => new RegExp(pattern));
  } catch {
    fail(`${label} contains an invalid pattern`);
  }
}

function exactKeys(value, keys) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function optionalRegexes(patterns, label) {
  return patterns === undefined || Array.isArray(patterns) && patterns.length === 0 ? [] : regexes(patterns, label);
}

function compilePathRules(value, label, { overlay = false } = {}) {
  if (!Array.isArray(value)) fail(`${label} has an invalid shape`);
  const ids = new Set();
  return value.map((rule) => {
    const keys = overlay ? ["id", "pathPattern", "flags", "knownFlags"] : ["id", "pathPattern", "flags"];
    if (
      !plainObject(rule) ||
      !exactKeys(rule, keys) ||
      typeof rule.id !== "string" || rule.id === "" || ids.has(rule.id) ||
      !(typeof rule.pathPattern === "string" && rule.pathPattern !== "" || rule.pathPattern instanceof RegExp) ||
      !Array.isArray(rule.flags) || !rule.flags.every((flag) => SIGNAL_FLAGS.includes(flag)) ||
      new Set(rule.flags).size !== rule.flags.length ||
      (!overlay && rule.flags.length === 0) ||
      (overlay && (!Array.isArray(rule.knownFlags) || !rule.knownFlags.every((flag) => SIGNAL_FLAGS.includes(flag)) || new Set(rule.knownFlags).size !== rule.knownFlags.length || rule.flags.some((flag) => rule.knownFlags.includes(flag)) || (rule.flags.length === 0 && rule.knownFlags.length === 0)))
    ) fail(`${label} has an invalid shape`);
    ids.add(rule.id);
    try {
      return { ...rule, pathPattern: rule.pathPattern instanceof RegExp ? rule.pathPattern : new RegExp(rule.pathPattern) };
    } catch {
      fail(`${label} contains an invalid pattern`);
    }
  });
}

function additiveOverlay(value) {
  if (
    !plainObject(value) ||
    ![2, 3].includes(Object.keys(value).length) ||
    !Object.keys(value).every((key) => ["schemaVersion", "knownPathPatterns", "pathRules"].includes(key)) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.knownPathPatterns) || value.knownPathPatterns.length === 0 ||
    !value.knownPathPatterns.every((pattern) => typeof pattern === "string" && pattern !== "") ||
    new Set(value.knownPathPatterns).size !== value.knownPathPatterns.length
  ) fail("repository routing overlay has an invalid shape");
  return { knownPathPatterns: value.knownPathPatterns, pathRules: compilePathRules(value.pathRules ?? [], "repository routing overlay", { overlay: true }) };
}

export function validateSignalPolicy(policy) {
  if (
    !plainObject(policy) ||
    policy.schemaVersion !== 1 ||
    typeof policy.policyVersion !== "string" || policy.policyVersion.trim() === "" ||
    policy.changedLinesScope !== "code-files-only" ||
    !Array.isArray(policy.packageRootMarkers) || policy.packageRootMarkers.length === 0 ||
    !policy.packageRootMarkers.every((marker) => typeof marker === "string" && marker !== "" && !marker.includes("/")) ||
    !Array.isArray(policy.knownFlags) || !policy.knownFlags.every((flag) => SIGNAL_FLAGS.includes(flag)) ||
    new Set(policy.knownFlags).size !== policy.knownFlags.length ||
    !Array.isArray(policy.nonCodePathPatterns) ||
    !Array.isArray(policy.pathRules)
  ) {
    fail("policy has an invalid shape");
  }
  const generatedPathPatterns = regexes(policy.generatedPathPatterns, "generatedPathPatterns");
  const codePathPatterns = regexes(policy.codePathPatterns, "codePathPatterns");
  const nonCodePathPatterns = regexes(policy.nonCodePathPatterns, "nonCodePathPatterns");
  const knownPathPatterns = regexes(policy.knownPathPatterns, "knownPathPatterns");
  const repositoryKnownPathPatterns = optionalRegexes(policy.repositoryKnownPathPatterns, "repositoryKnownPathPatterns");
  const pathRules = compilePathRules(policy.pathRules, "pathRules");
  const repositoryPathRules = policy.repositoryPathRules === undefined ? [] : compilePathRules(policy.repositoryPathRules, "repository routing overlay", { overlay: true });
  return { ...policy, codePathPatterns, nonCodePathPatterns, generatedPathPatterns, knownPathPatterns, repositoryKnownPathPatterns, pathRules, repositoryPathRules };
}

/** Loads shipped signal policy plus an additive repository coverage overlay. */
export async function loadSignalPolicy({ root = process.cwd() } = {}) {
  const policy = await loadPolicy("signals");
  let overlay;
  try {
    overlay = additiveOverlay(JSON.parse(await readFile(join(root, ".omp", "ompstack-routing.json"), "utf8")));
  } catch (error) {
    if (isMissing(error)) return validateSignalPolicy(policy);
    if (error instanceof SyntaxError) fail("repository routing overlay is not valid JSON");
    throw error;
  }
  return validateSignalPolicy({
    ...policy,
    repositoryKnownPathPatterns: overlay.knownPathPatterns,
    repositoryPathRules: overlay.pathRules,
  });
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
  // Import-graph support is narrower; every path outside explicit non-code coverage counts as code.
  const codeChanges = changeSet.filter((change) => effectivePolicy.codePathPatterns.some((pattern) => pattern.test(change.path)) || !effectivePolicy.nonCodePathPatterns.some((pattern) => pattern.test(change.path)));
  const shippedKnown = (path) => effectivePolicy.knownPathPatterns.some((pattern) => pattern.test(path));
  const repositoryKnown = (path) => effectivePolicy.repositoryKnownPathPatterns.some((pattern) => pattern.test(path));
  const packageRoots = new Set();
  for (const change of codeChanges) {
    const packageRoot = await nearestPackageRoot(root, change.path, effectivePolicy.packageRootMarkers);
    if (packageRoot !== null) packageRoots.add(packageRoot);
  }
  const matchedFlags = new Set();
  for (const change of changeSet) {
    for (const rule of [...effectivePolicy.pathRules, ...effectivePolicy.repositoryPathRules]) {
      if (rule.pathPattern.test(change.path)) for (const flag of rule.flags) matchedFlags.add(flag);
    }
  }
  for (const change of changeSet) {
    if (effectivePolicy.generatedPathPatterns.some((pattern) => pattern.test(change.path))) matchedFlags.add("touchesGeneratedCode");
  }
  const flags = Object.fromEntries(SIGNAL_FLAGS.map((flag) => [
    flag,
    matchedFlags.has(flag)
      ? true
      : effectivePolicy.knownFlags.includes(flag) && changeSet.every((change) =>
        shippedKnown(change.path) || effectivePolicy.repositoryPathRules.some((rule) => rule.pathPattern.test(change.path) && rule.knownFlags.includes(flag)),
      )
        ? false
        : "unknown",
  ]));
  return {
    schemaVersion: 1,
    policyVersion: effectivePolicy.policyVersion,
    changedLinesScope: effectivePolicy.changedLinesScope,
    changedCodeFiles: codeChanges.length,
    changedLines: codeChanges.reduce((total, change) => total + change.addedLines + change.deletedLines, 0),
    unclassifiedChangedFiles: changeSet.filter((change) => !shippedKnown(change.path) && !repositoryKnown(change.path)).length,
    packageRoots: packageRoots.size,
    ...flags,
  };
}
