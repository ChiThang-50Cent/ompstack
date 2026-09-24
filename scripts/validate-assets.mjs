import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const errors = [];
const warnings = [];

async function exists(relative) {
  try { await stat(path.join(root, relative)); return true; } catch { return false; }
}
async function text(relative) { return readFile(path.join(root, relative), "utf8"); }
async function json(relative) {
  try { return JSON.parse(await text(relative)); }
  catch (error) { errors.push(`${relative}: invalid JSON (${error})`); return undefined; }
}
function assert(condition, message) { if (!condition) errors.push(message); }
function frontmatter(source, relative) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(source);
  if (!match) { errors.push(`${relative}: missing YAML frontmatter`); return ""; }
  return match[1];
}

const packageJson = await json("package.json");
assert(packageJson?.name === "pstack-omp", "package.json: name must be pstack-omp");
assert(packageJson?.omp?.extensions?.includes("./src/index.ts"), "package.json: omp.extensions must include ./src/index.ts");
assert(packageJson?.peerDependencies?.["@oh-my-pi/pi-coding-agent"] === ">=18.2.11", "package.json: OMP peer target must be >=18.2.11");
for (const required of ["src", "dist", "agents", "skills", "scripts", "test", "types", "tsconfig.json", "tsconfig.test.json"]) {
  assert(packageJson?.files?.includes(required), `package.json: files whitelist missing ${required}`);
}

const marketplace = await json(".omp-plugin/marketplace.json");
assert(marketplace?.name === "pstack-omp", ".omp-plugin/marketplace.json: name must be pstack-omp");
assert(typeof marketplace?.owner?.name === "string", ".omp-plugin/marketplace.json: owner.name is required");
assert(Array.isArray(marketplace?.plugins) && marketplace.plugins.some(plugin => plugin.name === "pstack-omp"), ".omp-plugin/marketplace.json: pstack-omp entry missing");

const requiredFiles = [
  "README.md", "LICENSE", "NOTICE.md", "CHANGELOG.md",
  "docs/architecture.md", "docs/installation.md", "docs/configuration.md",
  "docs/workflows.md", "docs/verification.md", "docs/model-routing.md",
  "docs/limitations.md", "docs/development.md", "docs/security-model.md",
  "eval/cases.json", "eval/README.md",
];
for (const file of requiredFiles) assert(await exists(file), `${file}: required file missing`);

const agentNames = ["scout", "architect", "builder", "reviewer", "judge", "synthesizer", "verifier"];

const toolCatalog = await json("scripts/omp-tool-names.json");
const knownToolNames = new Set(Array.isArray(toolCatalog?.tools) ? toolCatalog.tools : []);
assert(knownToolNames.size > 0, "scripts/omp-tool-names.json: tools allowlist must be non-empty");

for (const name of agentNames) {
  const relative = `agents/pstack-${name}.md`;
  assert(await exists(relative), `${relative}: missing`);
  if (!await exists(relative)) continue;
  const source = await text(relative);
  const fm = frontmatter(source, relative);
  assert(new RegExp(`^name:\\s*pstack-${name}$`, "m").test(fm), `${relative}: frontmatter name mismatch`);
  for (const field of ["description", "tools", "model", "output"]) {
    assert(new RegExp(`^${field}:`, "m").test(fm), `${relative}: ${field} missing`);
  }
  const declaredTools = /^tools:\s*(.+)$/m.exec(fm)?.[1].split(",").map(tool => tool.trim()).filter(Boolean) ?? [];
  for (const tool of declaredTools) {
    assert(knownToolNames.has(tool), `${relative}: unknown OMP tool '${tool}' (see scripts/omp-tool-names.json)`);
  }
  assert(!/^tools:.*\bpstack_/m.test(fm), `${relative}: child agent exposes a parent-state pstack_* tool`);
  if (["scout", "architect", "reviewer", "judge", "verifier"].includes(name)) {
    assert(!/^tools:.*\b(?:edit|write)\b/m.test(fm), `${relative}: read-only role exposes edit/write`);
  }
  if (name === "verifier") {
    assert(/^blocking:\s*true$/m.test(fm), `${relative}: final verifier must be blocking`);
    assert(/acceptance_results:/m.test(fm), `${relative}: verifier output must include acceptance_results`);
    assert(/tested_fingerprint:/m.test(fm), `${relative}: verifier output must include tested_fingerprint`);
  }
}

const playbooks = [
  "investigation", "bug-fix", "feature", "empirical-prototype", "performance", "refactor", "migration", "incident",
  "review", "arena", "multi-phase", "shipping", "security", "test-repair", "dependency-upgrade", "documentation",
];
const actualPlaybooks = (await readdir(path.join(root, "skills/pstack/playbooks"))).filter(name => name.endsWith(".md")).map(name => name.slice(0, -3)).sort();
assert(JSON.stringify(actualPlaybooks) === JSON.stringify([...playbooks].sort()), `playbook corpus mismatch: ${actualPlaybooks.join(", ")}`);

const principles = (await readdir(path.join(root, "skills/pstack/principles"))).filter(name => name.endsWith(".md"));
assert(principles.length === 23, `principle corpus: expected 23, found ${principles.length}`);
const operators = (await readdir(path.join(root, "skills/pstack/operators"))).filter(name => name.endsWith(".md"));
assert(operators.length === 12, `operator corpus: expected 12, found ${operators.length}`);

for (const directory of ["skills/pstack/schemas"]) {
  for (const file of await readdir(path.join(root, directory))) {
    if (file.endsWith(".json")) await json(`${directory}/${file}`);
  }
}

const negative = await json("test/fixtures/negative-topologies.json");
assert(Array.isArray(negative) && negative.length >= 12, "negative topology catalog must contain at least 12 cases");
const evalCases = await json("eval/cases.json");
assert(Array.isArray(evalCases) && evalCases.length >= 24, "eval corpus must contain at least 24 cases");
if (Array.isArray(evalCases)) {
  const ids = new Set();
  for (const item of evalCases) {
    assert(typeof item?.id === "string" && item.id.length > 0, "eval case id missing");
    assert(!ids.has(item?.id), `eval case id duplicated: ${item?.id}`);
    ids.add(item?.id);
    assert(["direct", "standard", "strict", "program"].includes(item?.expectedCeremony), `${item?.id}: invalid expectedCeremony`);
    assert(playbooks.includes(item?.expectedPlaybook), `${item?.id}: invalid expectedPlaybook`);
  }
}

const sourceFiles = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(absolute);
    else sourceFiles.push(absolute);
  }
}
for (const relative of ["src", "agents", "skills", "scripts", "docs", "examples", "eval", "test"]) {
  if (await exists(relative)) await walk(path.join(root, relative));
}
for (const absolute of sourceFiles) {
  const body = await readFile(absolute, "utf8").catch(() => "");
  if (body.includes("\r\n")) warnings.push(`${path.relative(root, absolute)}: CRLF line endings`);
  if (/\b(?:TODO|FIXME)(?:\([^)]+\))?:\s/.test(body) && !absolute.endsWith("eval/cases.json")) warnings.push(`${path.relative(root, absolute)}: contains actionable TODO/FIXME marker`);
}

if (warnings.length) {
  console.warn("Asset validation warnings:");
  for (const warning of warnings) console.warn(`- ${warning}`);
}
if (errors.length) {
  console.error("Asset validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`Asset validation passed (${agentNames.length} agents, ${playbooks.length} playbooks, ${operators.length} operators, ${principles.length} principles, ${evalCases?.length ?? 0} eval cases).`);
