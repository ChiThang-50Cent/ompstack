import { createHash } from "node:crypto";
import { isAbsolute } from "node:path";

export const ROUTE_INTENTS = Object.freeze(["investigation", "bug-fix", "feature", "refactoring", "prototype", "perf-issue", "runtime-forensics", "trace-forensics", "eval"]);

const SOURCE_LANGUAGES = Object.freeze(["go", "python", "typescript", "java"]);

function fail(message) { throw new Error(`route input: ${message}`); }
function plainObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function normalizedPath(value, allowRoot = false) { return typeof value === "string" && value !== "" && (allowRoot || value !== ".") && !value.startsWith("/") && !value.startsWith("./") && !value.endsWith("/") && !value.includes("//") && !value.split("/").includes("..") && !value.includes(":"); }
function normalizedTarget(value) {
  if (typeof value !== "string" || value === "") return false;
  const separator = value.indexOf(":");
  if (separator < 0) return normalizedPath(value);
  const file = value.slice(0, separator);
  const symbol = value.slice(separator + 1);
  return normalizedPath(file) && symbol !== "" && symbol.trim() === symbol && !symbol.includes(":") && !symbol.includes("/") && !symbol.includes("\\");
}
function scratchPath(value) {
  if (typeof value !== "string" || !value.startsWith("local://")) return false;
  const relative = value.slice("local://".length);
  return normalizedPath(relative) && !relative.startsWith("/") && !relative.split("/").includes(".");
}
function exactKeys(value, keys) { return plainObject(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function validSourceRoots(value) { return plainObject(value) && Object.keys(value).length === SOURCE_LANGUAGES.length && SOURCE_LANGUAGES.every((language) => Array.isArray(value[language]) && value[language].every((path) => normalizedPath(path, true)) && new Set(value[language]).size === value[language].length); }
function stable(value) { if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`; if (plainObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`; return JSON.stringify(value); }

export function physicalTargetPath(target) {
  if (!normalizedTarget(target)) throw new Error(`route input: target has an invalid shape: ${target}`);
  const separator = target.indexOf(":");
  return separator < 0 ? target : target.slice(0, separator);
}

/** Validates and canonicalizes the one route-tool request contract. */
export function normalizeRouteInput(input) {
  const repositoryKeysValid = plainObject(input?.repository) && Object.keys(input.repository).every((key) => key === "root" || key === "base" || key === "head" || key === "scratchPaths");
  const scratchPathsValid = input?.repository?.scratchPaths === undefined ||
    (Array.isArray(input.repository.scratchPaths) && input.repository.scratchPaths.every(scratchPath) && new Set(input.repository.scratchPaths).size === input.repository.scratchPaths.length);
  if (!plainObject(input) || Object.hasOwn(input, "measurementPurpose") || !ROUTE_INTENTS.includes(input.intent) || !Array.isArray(input.targets) || input.targets.length === 0 || !input.targets.every(normalizedTarget) || new Set(input.targets).size !== input.targets.length || !exactKeys(input.taskFacts, ["behaviorAffecting"]) || typeof input.taskFacts.behaviorAffecting !== "boolean" || !repositoryKeysValid || !isAbsolute(input.repository.root) || !["base", "head"].every((key) => typeof input.repository[key] === "string" && input.repository[key] !== "") || !scratchPathsValid || !plainObject(input.riskFacts) || typeof input.riskFacts.sharedSemanticBoundary !== "boolean" || !Number.isInteger(input.riskFacts.consumerFamilies) || input.riskFacts.consumerFamilies < 0 || !Number.isInteger(input.riskFacts.executionModes) || input.riskFacts.executionModes < 0 || typeof input.riskFacts.graphTraversal !== "boolean" || typeof input.riskFacts.materialUnknown !== "boolean" || !plainObject(input.graphPolicy) || !validSourceRoots(input.graphPolicy.sourceRoots)) fail("has an invalid shape");
  const sourceRoots = Object.freeze(Object.fromEntries(SOURCE_LANGUAGES.map((language) => [language, Object.freeze([...input.graphPolicy.sourceRoots[language]].sort())])));
  const repository = {
    root: input.repository.root,
    base: input.repository.base,
    head: input.repository.head,
    ...(input.repository.scratchPaths === undefined ? {} : { scratchPaths: Object.freeze([...input.repository.scratchPaths].sort()) }),
  };
  const value = Object.freeze({ ...input, targets: Object.freeze([...input.targets].sort()), taskFacts: Object.freeze({ ...input.taskFacts }), repository: Object.freeze(repository), riskFacts: Object.freeze({ ...input.riskFacts }), graphPolicy: Object.freeze({ ...input.graphPolicy, sourceRoots }) });
  return Object.freeze({ ...value, routeInputDigest: createHash("sha256").update(stable(value)).digest("hex") });
}
