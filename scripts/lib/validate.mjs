import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const EXPECTED_PLAYBOOKS = [
  "investigation", "bug-fix", "feature", "empirical-prototype", "performance", "refactor", "migration", "incident",
  "review", "arena", "multi-phase", "shipping", "security", "test-repair", "dependency-upgrade", "documentation", "eval", "hillclimb", "trace-forensics", "runtime-forensics", "authoring-a-skill", "opening-a-pr", "babysit", "visual-parity", "autonomous-run", "pause-safely", "worktree-cleanup", "orchestrate", "autopilot-full", "autopilot-stack",
];
const REQUIRED_FILES = [
  "README.md", "LICENSE", "NOTICE.md", "CHANGELOG.md",
  "docs/architecture.md", "docs/installation.md", "docs/configuration.md",
  "docs/mcp-runtime-lifecycle.md", "docs/verification.md", "docs/model-routing.md",
  "docs/limitations.md", "docs/development.md", "docs/security-model.md",
  "eval/cases.json", "eval/README.md", "scripts/omp-tool-names.json", "scripts/upstream-map.json", "scripts/build-notice.mjs", "scripts/check-release.mjs",
];
const CORE_AGENTS = ["pstack-scout", "pstack-architect", "pstack-builder", "pstack-reviewer", "pstack-judge", "pstack-synthesizer", "pstack-verifier"];
const LEFTOVER_PATTERN = /(?:\bsubagent_type\b|\breadonly\s*:|\brun_in_background\b|\.mdc\b|~\/.cursor\b|\bAskQuestion\b|\bBugbot\b|\/loop\b|\b(?:claude-(?:opus|sonnet|haiku|fable|mythos)|gpt-\d|o[1-9](?:-mini|-pro)?|gemini-\d|grok-\d|deepseek-[\w.-]+|qwen\d[\w.-]+|kimi-[\w.-]+|glm-\d[\w.-]+|composer-\d[\w.-]+|mistral-[\w.-]+|llama-?\d[\w.-]+)\b)/i;

function slashPath(value) {
  return value.split(path.sep).join("/");
}

function wordCount(source) {
  const body = source.replace(/^---\n[\s\S]*?\n---\n/, "");
  return body.match(/\S+/g)?.length ?? 0;
}

function normalizePrompt(prompt) {
  return prompt.toLowerCase().replace(/\s+/g, " ").trim();
}

function frontmatter(source, relative, errors) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(source);
  if (!match) {
    errors.push(`${relative}: missing YAML frontmatter`);
    return "";
  }
  return match[1];
}

function assert(errors, condition, message) {
  if (!condition) errors.push(message);
}

async function walk(directory, output) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(absolute, output);
    else output.push(absolute);
  }
}

async function readJson(root, relative, errors) {
  try {
    return JSON.parse(await readFile(path.join(root, relative), "utf8"));
  } catch (error) {
    errors.push(`${relative}: invalid JSON (${error})`);
    return undefined;
  }
}

async function fileExists(root, relative) {
  try {
    await stat(path.join(root, relative));
    return true;
  } catch {
    return false;
  }
}

async function validateSkillLinks(root, sourceFiles, errors) {
  for (const absolute of sourceFiles.filter(file => {
    const relative = slashPath(path.relative(root, file));
    return relative.startsWith("skills/") || relative.startsWith("agents/");
  })) {
    const source = await readFile(absolute, "utf8");
    for (const rawMatch of source.matchAll(/skill:\/\/([^\s)`"'<>]+)/g)) {
      const raw = rawMatch[1].replace(/[.,;:!?]+$/, "");
      if (raw.startsWith("verify-")) continue;
      const [name, ...parts] = raw.split("/");
      const relativeTarget = parts.length > 0
        ? path.join("skills", name, ...parts)
        : path.join("skills", name, "SKILL.md");
      if (!await fileExists(root, relativeTarget)) {
        errors.push(`${slashPath(path.relative(root, absolute))}: unresolved skill link skill://${raw}`);
      }
    }
  }
}

async function validateFeatureMaps(root, errors) {
  const examplesRoot = path.join(root, "examples");
  if (!await fileExists(root, "examples")) return;
  for (const entry of await readdir(examplesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const featureRoot = path.join(examplesRoot, entry.name, "features");
    try {
      if (!(await stat(featureRoot)).isDirectory()) continue;
    } catch {
      continue;
    }
    const files = (await readdir(featureRoot)).filter(file => file.endsWith(".md") && file !== "README.md").sort();
    const indexPath = path.join(featureRoot, "README.md");
    if (!await fileExists(root, slashPath(path.relative(root, indexPath)))) {
      errors.push(`examples/${entry.name}/features/README.md: feature index missing`);
      continue;
    }
    const index = await readFile(indexPath, "utf8");
    const links = [...index.matchAll(/\]\(([^)]+\.md)\)/g)].map(match => path.basename(match[1])).sort();
    assert(errors, JSON.stringify(links) === JSON.stringify(files), `examples/${entry.name}/features/README.md: feature links do not match files`);
    for (const file of files) {
      const relative = slashPath(path.relative(root, path.join(featureRoot, file)));
      const source = await readFile(path.join(featureRoot, file), "utf8");
      const fm = frontmatter(source, relative, errors);
      for (const key of ["feature", "slug", "surface", "reach", "handles", "states"]) {
        assert(errors, new RegExp(`^${key}:`, "m").test(fm), `${relative}: feature frontmatter missing ${key}`);
      }
      assert(errors, new RegExp(`^slug:\\s*${file.slice(0, -3)}\\s*$`, "m").test(fm), `${relative}: slug must match filename`);
      assert(errors, /^(?:surface:\s*)(ui|cli|api|tui)\s*$/m.test(fm), `${relative}: invalid surface`);
      for (const key of ["reach", "handles", "states"]) {
        const section = new RegExp(`^${key}:\\n((?:\\s+- .*(?:\\n|$))+)`, "m").exec(fm);
        assert(errors, Boolean(section), `${relative}: ${key} must be a non-empty list`);
      }
    }
  }
}

async function validateUpstreamMap(root, map, errors, options) {
  assert(errors, Array.isArray(map), "scripts/upstream-map.json: expected an array");
  if (!Array.isArray(map)) return;
  const targets = new Map();
  for (const entry of map) {
    const upstream = entry?.upstream;
    const target = entry?.target;
    assert(errors, typeof upstream === "string" && upstream.startsWith("pstack/"), `scripts/upstream-map.json: upstream must start with pstack/: ${upstream}`);
    assert(errors, typeof target === "string" && target.length > 0, "scripts/upstream-map.json: target is required");
    assert(errors, !["operators/", "playbooks/", "principles/"].some(prefix => target?.startsWith(prefix)), `scripts/upstream-map.json: target uses forbidden root path: ${target}`);
    assert(errors, ["planned", "imported"].includes(entry?.status), `scripts/upstream-map.json: invalid status for ${target}`);
    assert(errors, typeof entry?.upstreamSha256 === "string" && /^[0-9a-f]{64}$/.test(entry.upstreamSha256), `scripts/upstream-map.json: invalid upstreamSha256 for ${target}`);
    assert(errors, Number.isInteger(entry?.upstreamWords) && entry.upstreamWords >= 0, `scripts/upstream-map.json: invalid upstreamWords for ${target}`);
    assert(errors, typeof entry?.minRatio === "number" && entry.minRatio > 0, `scripts/upstream-map.json: invalid minRatio for ${target}`);
    if (typeof target === "string") {
      const previous = targets.get(target);
      if (previous && entry.aggregate !== true && previous.aggregate !== true) {
        errors.push(`scripts/upstream-map.json: duplicate target without aggregate=true: ${target}`);
      }
      targets.set(target, entry);
    }
    if (entry?.status !== "imported" || typeof target !== "string") continue;
    assert(errors, await fileExists(root, target), `scripts/upstream-map.json: imported target missing: ${target}`);
    if (!await fileExists(root, target)) continue;
    const actual = wordCount(await readFile(path.join(root, target), "utf8"));
    const reason = typeof entry.reason === "string" && entry.reason.trim();
    if (entry.minRatio < 0.85 && !reason) errors.push(`scripts/upstream-map.json: ${target} lowers minRatio without reason`);
    assert(errors, actual >= entry.upstreamWords * entry.minRatio, `scripts/upstream-map.json: fidelity below ratio for ${target} (${actual} < ${entry.upstreamWords * entry.minRatio})`);
  }
  if (!options.checkUpstream) return;
  const upstreamRoot = options.upstreamRoot ?? path.join(root, ".upstream", "cursor-plugins");
  if (!await fileExists(root, slashPath(path.relative(root, upstreamRoot)))) {
    errors.push(`upstream drift check: pinned checkout missing at ${upstreamRoot}`);
    return;
  }
  for (const entry of map) {
    const sourcePath = path.join(upstreamRoot, entry.upstream);
    try {
      const source = await readFile(sourcePath);
      const digest = createHash("sha256").update(source).digest("hex");
      const words = wordCount(source.toString("utf8"));
      assert(errors, digest === entry.upstreamSha256, `upstream drift: ${entry.upstream} SHA changed`);
      assert(errors, words === entry.upstreamWords, `upstream drift: ${entry.upstream} word count changed`);
    } catch (error) {
      errors.push(`upstream drift: cannot read ${entry.upstream} (${error})`);
    }
  }
}

async function validateNotice(root, map, errors) {
  if (!Array.isArray(map)) return;
  const notice = await readFile(path.join(root, "NOTICE.md"), "utf8").catch(() => "");
  for (const entry of map.filter(item => item?.status === "imported")) {
    assert(errors, notice.includes(entry.upstream), `NOTICE.md: imported upstream path missing: ${entry.upstream}`);
    assert(errors, notice.includes(entry.target), `NOTICE.md: imported target missing: ${entry.target}`);
  }
}

export async function validate(repoRoot, options = {}) {
  const root = path.resolve(repoRoot);
  const errors = [];
  const warnings = [];
  const exists = relative => fileExists(root, relative);
  const text = relative => readFile(path.join(root, relative), "utf8");
  const packageJson = await readJson(root, "package.json", errors);
  const pluginJson = await readJson(root, ".omp-plugin/plugin.json", errors);
  assert(errors, packageJson?.name === "pstack-omp", "package.json: name must be pstack-omp");
  assert(errors, packageJson?.omp?.extensions?.includes("./src/index.ts"), "package.json: omp.extensions must include ./src/index.ts");
  assert(errors, packageJson?.peerDependencies?.["@oh-my-pi/pi-coding-agent"] === ">=18.2.11", "package.json: OMP peer target must be >=18.2.11");
  assert(errors, packageJson?.version === pluginJson?.version, "package.json.version must equal .omp-plugin/plugin.json.version");
  for (const required of ["src", "dist", "agents", "skills", "scripts", "test", "types", "tsconfig.json", "tsconfig.test.json"]) {
    assert(errors, packageJson?.files?.includes(required), `package.json: files whitelist missing ${required}`);
  }

  const marketplace = await readJson(root, ".omp-plugin/marketplace.json", errors);
  const marketplacePlugin = Array.isArray(marketplace?.plugins)
    ? marketplace.plugins.find(plugin => plugin.name === "pstack-omp")
    : undefined;
  assert(errors, pluginJson?.name === "pstack-omp", ".omp-plugin/plugin.json: name must be pstack-omp");
  assert(errors, typeof pluginJson?.version === "string", ".omp-plugin/plugin.json: version is required");
  assert(errors, marketplace?.name === "pstack-omp", ".omp-plugin/marketplace.json: name must be pstack-omp");
  assert(errors, typeof marketplace?.owner?.name === "string", ".omp-plugin/marketplace.json: owner.name is required");
  assert(errors, Boolean(marketplacePlugin), ".omp-plugin/marketplace.json: pstack-omp entry missing");
  assert(errors, marketplace?.metadata?.version === marketplacePlugin?.version, ".omp-plugin/marketplace.json: metadata.version must equal plugin version");
  assert(errors, marketplacePlugin?.source?.ref === `v${marketplacePlugin?.version}`, ".omp-plugin/marketplace.json: source.ref must match plugin version");
  for (const file of REQUIRED_FILES) assert(errors, await exists(file), `${file}: required file missing`);

  const agentFiles = await readdir(path.join(root, "agents")).catch(() => []);
  const agentNames = agentFiles
    .filter(file => file.startsWith("pstack-") && file.endsWith(".md"))
    .map(file => file.slice(0, -3))
    .sort();
  for (const core of CORE_AGENTS) assert(errors, agentNames.includes(core), `agents/${core}.md: missing`);
  const toolCatalog = await readJson(root, "scripts/omp-tool-names.json", errors);
  const knownToolNames = new Set(Array.isArray(toolCatalog?.tools) ? toolCatalog.tools : []);
  assert(errors, knownToolNames.size > 0, "scripts/omp-tool-names.json: tools allowlist must be non-empty");
  for (const name of agentNames) {
    const relative = `agents/${name}.md`;
    const source = await text(relative);
    const fm = frontmatter(source, relative, errors);
    assert(errors, new RegExp(`^name:\\s*${name}$`, "m").test(fm), `${relative}: frontmatter name mismatch`);
    for (const field of ["description", "tools", "model", "output"]) {
      assert(errors, new RegExp(`^${field}:`, "m").test(fm), `${relative}: ${field} missing`);
    }
    const declaredTools = /^tools:\s*(.+)$/m.exec(fm)?.[1]?.split(",").map(tool => tool.trim()).filter(Boolean) ?? [];
    for (const tool of declaredTools) assert(errors, knownToolNames.has(tool), `${relative}: unknown OMP tool '${tool}' (see scripts/omp-tool-names.json)`);
    assert(errors, !/^tools:.*\bpstack_/m.test(fm), `${relative}: child agent exposes a parent-state pstack_* tool`);
    const role = name.slice("pstack-".length);
    if (/^(?:scout|architect|reviewer(?:-[a-z])?|judge(?:-[a-z])?|comment-sicko)$/.test(role)) {
      assert(errors, !/^tools:.*\b(?:edit|write)\b/m.test(fm), `${relative}: inspect-only role exposes edit/write`);
    }
    if (role === "verifier") {
      assert(errors, /^blocking:\s*true$/m.test(fm), `${relative}: final verifier must be blocking`);
      assert(errors, /acceptance_results:/m.test(fm), `${relative}: verifier output must include acceptance_results`);
      assert(errors, /tested_fingerprint:/m.test(fm), `${relative}: verifier output must include tested_fingerprint`);
    }
  }

  const playbooks = EXPECTED_PLAYBOOKS;
  const actualPlaybooks = (await readdir(path.join(root, "skills/pstack/playbooks")).catch(() => [])).filter(name => name.endsWith(".md")).map(name => name.slice(0, -3)).sort();
  assert(errors, JSON.stringify(actualPlaybooks) === JSON.stringify([...playbooks].sort()), `playbook corpus mismatch: ${actualPlaybooks.join(", ")}`);
  const principles = (await readdir(path.join(root, "skills/pstack/principles")).catch(() => [])).filter(name => name.endsWith(".md"));
  assert(errors, principles.length === 23, `principle corpus: expected 23, found ${principles.length}`);
  const operators = (await readdir(path.join(root, "skills/pstack/operators")).catch(() => [])).filter(name => name.endsWith(".md"));
  assert(errors, operators.length === 12, `operator corpus: expected 12, found ${operators.length}`);
  for (const directory of ["skills/pstack/schemas"]) {
    for (const file of await readdir(path.join(root, directory)).catch(() => [])) {
      if (file.endsWith(".json")) await readJson(root, `${directory}/${file}`, errors);
    }
  }

  const negative = await readJson(root, "test/fixtures/negative-topologies.json", errors);
  assert(errors, Array.isArray(negative) && negative.length >= 12, "negative topology catalog must contain at least 12 cases");
  const evalCases = await readJson(root, "eval/cases.json", errors);
  assert(errors, Array.isArray(evalCases) && evalCases.length >= 24, "eval corpus must contain at least 24 cases");
  if (Array.isArray(evalCases)) {
    const ids = new Set();
    const prompts = new Set();
    const positiveByPlaybook = new Map(playbooks.map(playbook => [playbook, 0]));
    const nearMissByPlaybook = new Map(playbooks.map(playbook => [playbook, 0]));
    for (const item of evalCases) {
      assert(errors, typeof item?.id === "string" && item.id.length > 0, "eval case id missing");
      assert(errors, !ids.has(item?.id), `eval case id duplicated: ${item?.id}`);
      ids.add(item?.id);
      assert(errors, ["direct", "standard", "strict", "program"].includes(item?.expectedCeremony), `${item?.id}: invalid expectedCeremony`);
      assert(errors, playbooks.includes(item?.expectedPlaybook), `${item?.id}: invalid expectedPlaybook`);
      assert(errors, ["positive", "near-miss"].includes(item?.kind), `${item?.id}: kind must be positive or near-miss`);
      assert(errors, typeof item?.prompt === "string" && item.prompt.trim().length > 0, `${item?.id}: prompt is required`);
      if (typeof item?.prompt === "string") {
        const normalized = normalizePrompt(item.prompt);
        assert(errors, !prompts.has(normalized), `${item?.id}: normalized prompt duplicated`);
        prompts.add(normalized);
      }
      if (item?.kind === "positive") {
        assert(errors, !("nearMissOf" in item), `${item?.id}: positive case must not set nearMissOf`);
        if (playbooks.includes(item?.expectedPlaybook)) {
          positiveByPlaybook.set(item.expectedPlaybook, positiveByPlaybook.get(item.expectedPlaybook) + 1);
        }
      }
      if (item?.kind === "near-miss") {
        assert(errors, typeof item?.nearMissOf === "string" && playbooks.includes(item.nearMissOf), `${item?.id}: near-miss must name a known nearMissOf playbook`);
        assert(errors, item?.expectedPlaybook !== item?.nearMissOf, `${item?.id}: near-miss expectedPlaybook must differ from nearMissOf`);
        if (playbooks.includes(item?.nearMissOf)) {
          nearMissByPlaybook.set(item.nearMissOf, nearMissByPlaybook.get(item.nearMissOf) + 1);
        }
      }
    }
    for (const playbook of playbooks) {
      assert(errors, positiveByPlaybook.get(playbook) > 0, `eval corpus missing positive case for ${playbook}`);
      assert(errors, nearMissByPlaybook.get(playbook) > 0, `eval corpus missing near-miss case for ${playbook}`);
    }
  }

  const sourceFiles = [];
  for (const relative of ["src", "agents", "skills", "scripts", "docs", "examples", "eval", "test"]) {
    if (await exists(relative)) await walk(path.join(root, relative), sourceFiles);
  }
  for (const absolute of sourceFiles) {
    const body = await readFile(absolute, "utf8").catch(() => "");
    const relative = slashPath(path.relative(root, absolute));
    if (body.includes("\r\n")) warnings.push(`${relative}: CRLF line endings`);
    if (/\b(?:TODO|FIXME)(?:\([^)]+\))?:\s/.test(body) && !relative.endsWith("eval/cases.json")) warnings.push(`${relative}: contains actionable TODO/FIXME marker`);
    if ((relative.startsWith("skills/") || relative.startsWith("agents/")) && LEFTOVER_PATTERN.test(body)) {
      errors.push(`${relative}: contains a forbidden Cursor leftover`);
    }
  }
  await validateSkillLinks(root, sourceFiles, errors);
  await validateFeatureMaps(root, errors);
  const upstreamMap = await readJson(root, "scripts/upstream-map.json", errors);
  await validateUpstreamMap(root, upstreamMap, errors, options);
  await validateNotice(root, upstreamMap, errors);

  return {
    errors,
    warnings,
    summary: {
      agentCount: agentNames.length,
      playbookCount: playbooks.length,
      operatorCount: operators.length,
      principleCount: principles.length,
      evalCaseCount: Array.isArray(evalCases) ? evalCases.length : 0,
      upstreamEntryCount: Array.isArray(upstreamMap) ? upstreamMap.length : 0,
    },
  };
}
