import { createHash } from "node:crypto";
import { isAbsolute } from "node:path";

export const ROUTE_INTENTS = Object.freeze(["investigation", "bug-fix", "feature", "refactoring", "prototype", "perf-issue", "runtime-forensics", "trace-forensics", "eval"]);

const SOURCE_LANGUAGES = Object.freeze(["go", "python", "typescript", "java"]);

function fail(message) { throw new Error(`route input: ${message}`); }
function plainObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function normalizedPath(value, allowRoot = false) { return typeof value === "string" && value !== "" && (allowRoot || value !== ".") && !value.startsWith("/") && !value.startsWith("./") && !value.endsWith("/") && !value.includes("//") && !value.split("/").includes(".."); }
function validSourceRoots(value) { return plainObject(value) && Object.keys(value).length === SOURCE_LANGUAGES.length && SOURCE_LANGUAGES.every((language) => Array.isArray(value[language]) && value[language].every((path) => normalizedPath(path, true)) && new Set(value[language]).size === value[language].length); }
function stable(value) { if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`; if (plainObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`; return JSON.stringify(value); }

/** Validates and canonicalizes the one route-tool request contract. */
export function normalizeRouteInput(input) {
  if (!plainObject(input) || Object.hasOwn(input, "measurementPurpose") || !ROUTE_INTENTS.includes(input.intent) || !Array.isArray(input.targets) || input.targets.length === 0 || !input.targets.every(normalizedPath) || new Set(input.targets).size !== input.targets.length || !plainObject(input.taskFacts) || typeof input.taskFacts.behaviorAffecting !== "boolean" || !Array.isArray(input.taskFacts.plannedWriteLanes) || !input.taskFacts.plannedWriteLanes.every((lane) => typeof lane === "string" && lane !== "") || typeof input.taskFacts.proofSurface !== "string" || input.taskFacts.proofSurface === "" || !plainObject(input.repository) || !isAbsolute(input.repository.root) || !["base", "head"].every((key) => typeof input.repository[key] === "string" && input.repository[key] !== "") || !plainObject(input.riskFacts) || typeof input.riskFacts.sharedSemanticBoundary !== "boolean" || !Number.isInteger(input.riskFacts.consumerFamilies) || input.riskFacts.consumerFamilies < 0 || !Number.isInteger(input.riskFacts.executionModes) || input.riskFacts.executionModes < 0 || typeof input.riskFacts.graphTraversal !== "boolean" || typeof input.riskFacts.materialUnknown !== "boolean" || !plainObject(input.graphPolicy) || !validSourceRoots(input.graphPolicy.sourceRoots)) fail("has an invalid shape");
  const sourceRoots = Object.freeze(Object.fromEntries(SOURCE_LANGUAGES.map((language) => [language, Object.freeze([...input.graphPolicy.sourceRoots[language]].sort())])));
  const value = Object.freeze({ ...input, targets: Object.freeze([...input.targets].sort()), taskFacts: Object.freeze({ ...input.taskFacts, plannedWriteLanes: Object.freeze([...input.taskFacts.plannedWriteLanes].sort()) }), repository: Object.freeze({ ...input.repository }), riskFacts: Object.freeze({ ...input.riskFacts }), graphPolicy: Object.freeze({ ...input.graphPolicy, sourceRoots }) });
  return Object.freeze({ ...value, routeInputDigest: createHash("sha256").update(stable(value)).digest("hex") });
}
