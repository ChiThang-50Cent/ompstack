import { readFile, readdir } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";

const extensions = { go: [".go"], python: [".py"], typescript: [".ts", ".tsx", ".mts", ".cts"], java: [".java"] };
const languages = Object.keys(extensions);

function fail(message) { throw new Error(`import graph: ${message}`); }
function plainObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function normalizedPath(value) { return typeof value === "string" && value !== "" && !value.startsWith("/") && !value.startsWith("./") && !value.split("/").includes(".."); }
function languageFor(path) { return languages.find((language) => extensions[language].includes(extname(path))) ?? null; }

function validatePolicy(policy) {
  if (!plainObject(policy) || typeof policy.policyVersion !== "string" || policy.policyVersion === "" || !plainObject(policy.sourceRoots) || Object.keys(policy.sourceRoots).length !== languages.length || !languages.every((language) => Array.isArray(policy.sourceRoots[language]) && policy.sourceRoots[language].every(normalizedPath))) fail("policy has an invalid shape");
  return policy;
}

async function filesUnder(root, sourceRoot, language) {
  const directory = resolve(root, sourceRoot);
  const files = [];
  async function visit(current) {
    let entries;
    try { entries = await readdir(current, { withFileTypes: true }); } catch { throw new Error(`import graph: cannot read source root ${sourceRoot}`); }
    for (const entry of entries) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && extensions[language].includes(extname(entry.name))) files.push(relative(root, path));
    }
  }
  await visit(directory);
  return files;
}

function specifiers(language, content) {
  if (language === "typescript") {
    if (/\brequire\s*\(|\bimport\s*\(\s*[^"']/.test(content)) return { partial: true, values: [] };
    return { partial: false, values: [...content.matchAll(/(?:\bimport|\bexport)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)].map((match) => match[1] ?? match[2]) };
  }
  if (language === "python") {
    if (/\b(?:__import__|importlib|exec|eval)\b/.test(content)) return { partial: true, values: [] };
    return { partial: false, values: [...content.matchAll(/^\s*(?:from\s+([\.\w]+)\s+import|import\s+([\w.]+))/gm)].map((match) => match[1] ?? match[2]) };
  }
  if (language === "go") return { partial: /import\s+"C"/.test(content), values: [...content.matchAll(/"([^"\n]+)"/g)].map((match) => match[1]) };
  return { partial: false, values: [...content.matchAll(/^\s*import\s+(?:static\s+)?([\w.]+)/gm)].map((match) => match[1]) };
}

function resolveSpecifier(root, language, source, specifier, files) {
  if (language === "typescript") {
    if (specifier.startsWith("node:")) return [];
    if (!specifier.startsWith(".")) return null;
    const base = resolve(root, dirname(source), specifier);
    return files.filter((file) => extensions.typescript.some((extension) => resolve(root, file) === `${base}${extension}` || resolve(root, file) === join(base, `index${extension}`)));
  }
  if (language === "python") {
    if (specifier.startsWith(".")) return null;
    const suffix = `/${specifier.replaceAll(".", "/")}`;
    const matched = files.filter((file) => file.endsWith(`${suffix}.py`) || file.endsWith(`${suffix}/__init__.py`));
    return matched.length ? matched : null;
  }
  if (language === "go") return null;
  return [];
}

/** Returns a conservative lower-bound static import graph for a supplied change set. */
export async function analyzeImportGraph({ root = process.cwd(), changeSet, policy } = {}) {
  if (!Array.isArray(changeSet) || !changeSet.every((change) => plainObject(change) && normalizedPath(change.path) && typeof change.changeType === "string")) fail("changeSet has an invalid shape");
  const effectivePolicy = validatePolicy(policy);
  const sourceFiles = [];
  for (const language of languages) for (const sourceRoot of effectivePolicy.sourceRoots[language]) sourceFiles.push(...await filesUnder(root, sourceRoot, language));
  const known = new Set(sourceFiles);
  const reasons = new Set();
  const changedModules = [];
  for (const change of changeSet) {
    const language = languageFor(change.path);
    if (!language) {
      reasons.add(`unsupported-language:${extname(change.path) || "[none]"}`);
      continue;
    }
    if (!known.has(change.path) || /^(deleted|renamed)$/.test(change.changeType)) reasons.add("deleted-or-unowned-source");
    else changedModules.push(change.path);
  }
  const reverse = new Map(sourceFiles.map((file) => [file, new Set()]));
  for (const file of sourceFiles) {
    const language = languageFor(file);
    const parsed = specifiers(language, await readFile(resolve(root, file), "utf8"));
    if (parsed.partial) reasons.add(`${language}-unsupported-static-construct`);
    for (const specifier of parsed.values) {
      const resolved = resolveSpecifier(root, language, file, specifier, sourceFiles);
      if (resolved === null) reasons.add(`${language}-unresolved-import`);
      else for (const target of resolved) reverse.get(target).add(file);
    }
    if (language === "java") reasons.add("java-semantic-dependencies-unsupported");
  }
  const depths = new Map(changedModules.map((file) => [file, 0]));
  const queue = [...changedModules];
  while (queue.length) {
    const current = queue.shift();
    for (const dependent of reverse.get(current) ?? []) if (!depths.has(dependent)) { depths.set(dependent, depths.get(current) + 1); queue.push(dependent); }
  }
  const changed = [...new Set(changedModules)].sort();
  const reverseDependents = [...depths.keys()].filter((file) => !changed.includes(file)).sort();
  const status = reasons.size === 0 ? "complete" : "partial";
  return { schemaVersion: 1, policyVersion: effectivePolicy.policyVersion, status, materialUnknown: status === "partial", partialReasons: [...reasons].sort(), changedModules: changed, affectedModules: [...depths.keys()].sort(), affectedModuleCount: depths.size, reverseDependents, reverseDependentCount: reverseDependents.length, maxDepth: Math.max(0, ...depths.values()) };
}
