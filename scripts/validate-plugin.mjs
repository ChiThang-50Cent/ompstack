import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (path) => readFile(resolve(root, path), "utf8");
const primaryPlaybooks = [
  "investigation",
  "bug-fix",
  "feature",
  "refactoring",
  "prototype",
  "perf-issue",
  "runtime-forensics",
  "trace-forensics",
  "eval",
];
const overlayNames = new Set(["queue"]);
const phaseNames = new Set(["verification"]);
const playbooks = [...primaryPlaybooks, ...overlayNames, ...phaseNames];
const risks = new Set(["low", "medium", "high", "critical"]);
const progressTrackingNames = new Set(["none", "native todo"]);
const evidence = new Set([
  "none",
  "reviewer",
  "verifier",
  "reviewer + verifier",
  "security-reviewer",
  "reviewer + verifier + security-reviewer",
]);
const verificationCapabilities = new Set([
  "existing",
  "repository",
  "create",
  "blocked",
  "maintain",
]);

function parseFrontmatter(content, path) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(match, `${path} needs YAML frontmatter`);

  const fields = {};
  for (const line of match[1].split("\n")) {
    const separator = line.indexOf(":");
    assert.ok(separator > 0, `${path} has malformed frontmatter: ${line}`);
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    fields[key] = value;
  }
  return fields;
}

function assertExactSet(actual, expected, label) {
  assert.deepEqual(
    [...new Set(actual)].sort(),
    [...expected].sort(),
    `${label} must match the supported contract`,
  );
}

const skill = await read("skills/ompstack/SKILL.md");
const command = await read("commands/ompstack.md");
const examples = await read("examples/usage.md");
const feature = await read("skills/ompstack/playbooks/feature.md");
const queue = await read("skills/ompstack/playbooks/queue.md");
const verification = await read("skills/ompstack/playbooks/verification.md");
const investigation = await read("skills/ompstack/playbooks/investigation.md");
const design = await read("docs/DESIGN.md");
const readme = await read("README.md");
const evaluation = await read("skills/ompstack/playbooks/eval.md");
const createVerification = await read("skills/ompstack-create-verification/SKILL.md");
const maintainVerification = await read("skills/ompstack-maintain-verification/SKILL.md");
const decisionTrail = await read("skills/ompstack-decision-trail/SKILL.md");
const featureMapTemplate = await read(
  "skills/ompstack-create-verification/references/feature-map-template.md",
);
const decisionTrailHelper = await read("scripts/append-decision-trail.mjs");
const maintainVerificationCommand = await read(
  "commands/ompstack-maintain-verification.md",
);
const cases = JSON.parse(await read("tests/fixtures/routing-cases.json"));
const manifest = JSON.parse(await read("package.json"));

assert.match(manifest.version, /^\d+\.\d+\.\d+$/, "package version must be a release semver");
assert.equal(manifest.private, undefined, "published plugin package must not be private");
assert.deepEqual(manifest.publishConfig, { access: "public" });
assertExactSet(
  manifest.files,
  new Set([
    "agents",
    "commands",
    "scripts",
    "skills",
    "NOTICE.md",
    "third_party/PSTACK_LICENSE",
  ]),
  "npm package files",
);

assert.match(skill, /^---\nname: ompstack\ndescription: .+/m);
assert.match(command, /Read `skill:\/\/ompstack` and use it as the control plane/);
assert.match(skill, /# Goal[\s\S]*# Constraints[\s\S]*# Contract/);
assert.match(skill, /Primary route:/);
assert.match(skill, /Execution overlays\/phases:/);
assert.match(skill, /Independent evidence:/);
assert.match(skill, /reviewer \+ verifier \+ security-reviewer/);
assert.match(skill, /Never mix design and implementation lanes in one batch\./);
assert.match(skill, /A successful `task` call is not itself fan-in\./);
assert.match(feature, /design-only `tasks\[\]` batch/);
assert.match(queue, /execution topology, not a replacement primary route/);
assert.match(queue, /canonical preflight contract in `skill:\/\/ompstack`/);
assert.match(queue, /one owner for every shared type, schema, or API/);
assert.match(verification, /not a permanent badge or a replacement primary route/);
assert.match(verification, /Bash and Eval are not a write sandbox/);
assert.match(investigation, /commit history, blame, issues, pull requests/);
assert.match(skill, /## Verification capability/);
assert.match(skill, /project-native `verify-<surface>` skill/);
assert.match(skill, /skill:\/\/ompstack-create-verification/);
assert.match(skill, /skill:\/\/ompstack-maintain-verification/);
assert.match(skill, /skill:\/\/ompstack-decision-trail/);
assert.match(skill, /Progress tracking: <none\|native todo>/);
assert.match(skill, /todo\.view/);
assert.match(skill, /Never call `todo\.init` over a non-empty list/);
assert.match(skill, /Only the parent calls `todo\.init`/);
assert.match(skill, /Only after selecting `Progress tracking: native todo`/);
assert.match(skill, /do not merely describe or defer Todo calls/);
assert.match(skill, /full `list` of named phases, never `phase`\/`task` shorthand/);
assert.match(skill, /`Progress tracking: native todo` → `todo\.view` → `todo\.init\(\{ list \}\)`/);
assert.match(skill, /The reverse order is invalid/);
assert.match(skill, /Todo state is deliberately separate from Hub\/task lifecycle/);
assert.match(verification, /## Native Todo lifecycle/);
assert.match(verification, /Keep the shared proof item pending until every required implementation result/);
assert.match(queue, /Native Todo is separate from queue topology/);
assert.match(design, /Native Todo is a separate conditional parent progress layer/);
assert.match(readme, /conditional native Todo progress state/);
assert.match(verification, /DOCTOR: BLOCKED/);
assert.match(verification, /optional unattended evidence adapters/);
assert.match(createVerification, /^---\nname: ompstack-create-verification\n/m);
assert.match(createVerification, /\.omp\/skills\/verify-<surface>\/SKILL\.md/);
assert.match(createVerification, /## Launch[\s\S]*## Doctor[\s\S]*## Drive[\s\S]*## Evidence[\s\S]*## Cleanup[\s\S]*## Helpers/);
assert.match(createVerification, /DOCTOR: READY \| BLOCKED/);
assert.match(maintainVerification, /^---\nname: ompstack-maintain-verification\n/m);
assert.match(maintainVerification, /`CLEAN`[\s\S]*`CHANGED`[\s\S]*`BLOCKED`/);
assert.match(maintainVerification, /documentation drift[\s\S]*harness gap[\s\S]*product gap/);
assert.match(decisionTrail, /^---\nname: ompstack-decision-trail\n/m);
assert.match(decisionTrail, /ts\tphase\tdecision\twhy\tevidence\tresult/);
assert.match(decisionTrail, /append-decision-trail\.mjs/);
assert.match(featureMapTemplate, /^## Sub-features[\s\S]*## How to get to it \(user POV\)[\s\S]*## Driving it with <harness>[\s\S]*## Gotchas/m);
assert.match(decisionTrailHelper, /export async function appendDecisionTrail/);
assert.match(maintainVerificationCommand, /Read `skill:\/\/ompstack-maintain-verification`/);

const requiredExampleTerms = [
  "# Constraints\\nPrimary route: feature\\nExecution overlays/phases: none\\nRisk: high\\nProgress tracking: native todo",
  "Established repository contract: reserveDelivery(eventKey)",
  "Consume this established contract without changing it: reserveDelivery(eventKey)",
  "# Constraints\\nPrimary route: feature\\nExecution overlays/phases: verification\\nRisk: high\\nProgress tracking: native todo",
  "Fan-in order: collect both verdicts, inspect unexpected worktree mutations, then parent synthesis.",
  "The `task` call starts asynchronous jobs.",
  "`hub wait`",
  "`agent://`, `history://`, or artifact payloads",
  "todo.view",
  "Only the parent mutates Todo.",
];
for (const term of requiredExampleTerms) {
  assert.ok(examples.includes(term), `usage examples are missing ${term}`);
}

const examplePayloads = [...examples.matchAll(/```json\n([\s\S]*?)\n```/g)].map(
  (match) => JSON.parse(match[1]),
);
assert.ok(examplePayloads.length >= 3, "need parseable implementation and evidence batches");
const exampleTasks = examplePayloads.flatMap((payload) => {
  assert.ok(Array.isArray(payload.tasks), "each task example needs a tasks array");
  return payload.tasks.map((item) => item.task);
});
assert.ok(exampleTasks.length >= 4, "need implementation and evidence task examples");
for (const task of exampleTasks) {
  assert.equal(typeof task, "string", "example task body must be a string");
  for (const heading of ["# Target\n", "# Change\n", "# Acceptance\n"]) {
    assert.ok(task.includes(heading), `example task is missing ${heading.trim()}`);
  }
  assert.match(task, /Skip project-wide/, "example task must skip repeated broad validation");
}

assert.match(evaluation, /plugin\/skill disabled/);
assert.match(evaluation, /neutral identifiers/);
assert.match(evaluation, /one blinded judge/);
assert.match(evaluation, /transcripts, tool calls, and produced artifacts/);
assert.match(evaluation, /project capability creation[\s\S]*Doctor-blocked runtime[\s\S]*stale feature map/);
assert.match(evaluation, /narrow\/read-only no-Todo[\s\S]*multi-phase Todo[\s\S]*queue\/fan-in Todo[\s\S]*Doctor-blocked Todo/);
assert.match(
  evaluation,
  /"type": "object"[\s\S]*"additionalProperties": false[\s\S]*"overlays"[\s\S]*"phases"[\s\S]*"progressTracking"[\s\S]*"required":/,
);
assert.match(evaluation, /"progressTracking"[\s\S]*"none"[\s\S]*"native todo"/);
assert.match(evaluation, /"reviewer \+ verifier \+ security-reviewer"/);

for (const playbook of playbooks) {
  const path = `skills/ompstack/playbooks/${playbook}.md`;
  const content = await read(path);
  assert.match(content, /^# .+/m, `${path} needs a title`);
  assert.match(skill, new RegExp(`playbooks/${playbook}\\.md`), `${playbook} is not routed`);
}
const expectedAgents = new Map([
  [
    "ompstack-architect",
    {
      tools: ["read", "grep", "glob"],
      model: "@slow",
      blocking: "true",
    },
  ],
  [
    "ompstack-verifier",
    {
      tools: ["read", "grep", "glob", "bash", "eval"],
      model: "@task",
      blocking: "true",
    },
  ],
]);
const agentFiles = await readdir(resolve(root, "agents"));
const agents = new Map();
for (const file of agentFiles.filter((entry) => entry.endsWith(".md"))) {
  const path = `agents/${file}`;
  const content = await read(path);
  const frontmatter = parseFrontmatter(content, path);
  assert.ok(frontmatter.name, `${path} needs a name`);
  assert.ok(frontmatter.description, `${path} needs a description`);
  assert.ok(frontmatter.tools, `${path} needs explicit tools`);
  assert.ok(frontmatter.model, `${path} needs a model role`);
  assert.ok(frontmatter.blocking, `${path} needs blocking semantics`);
  agents.set(frontmatter.name, { path, content, frontmatter });
}
for (const [name, expected] of expectedAgents) {
  const agent = agents.get(name);
  assert.ok(agent, `${name} is referenced but not defined`);
  assert.match(skill, new RegExp(`\`${name}\``));
  assertExactSet(
    agent.frontmatter.tools.split(",").map((tool) => tool.trim()),
    expected.tools,
    `${name} tools`,
  );
  assert.equal(agent.frontmatter.model, expected.model, `${name} model role changed`);
  assert.equal(agent.frontmatter.blocking, expected.blocking, `${name} blocking changed`);
}
const verifier = agents.get("ompstack-verifier");
assert.ok(verifier.frontmatter.tools.split(",").map((tool) => tool.trim()).includes("eval"));
assert.ok(!verifier.frontmatter.tools.split(",").map((tool) => tool.trim()).includes("browser"));
assert.match(verifier.content, /advisory evidence/);
assert.match(verifier.content, /return `BLOCKED` rather than substituting weaker evidence/);

assert.ok(Array.isArray(cases) && cases.length >= 18, "need at least eighteen routing cases");
const caseIds = new Set();
const coveredRoutes = new Set();
const coveredOverlays = new Set();
const coveredPhases = new Set();
const coveredVerificationCapabilities = new Set();
const coveredProgressTracking = new Set();
const requiredTodoProgressCases = new Map([
  ["read-only-explanation", "none"],
  ["multi-phase-progress-tracking", "native todo"],
  ["independent-package-queue", "native todo"],
  ["doctor-blocked-runtime", "native todo"],
]);
for (const testCase of cases) {
  assert.equal(typeof testCase.id, "string");
  assert.ok(testCase.id.trim(), "routing case id must be nonempty");
  assert.ok(!caseIds.has(testCase.id), `duplicate case id: ${testCase.id}`);
  caseIds.add(testCase.id);
  assert.equal(typeof testCase.prompt, "string");
  assert.ok(testCase.prompt.trim(), `${testCase.id} needs a nonempty prompt`);
  assert.equal(typeof testCase.expected, "object");
  assert.ok(testCase.expected, `${testCase.id} needs expected routing`);
  assert.ok(
    primaryPlaybooks.includes(testCase.expected.route),
    `unknown primary route: ${testCase.expected.route}`,
  );
  coveredRoutes.add(testCase.expected.route);
  assert.ok(Array.isArray(testCase.expected.overlays), `${testCase.id} needs overlays`);
  assert.ok(Array.isArray(testCase.expected.phases), `${testCase.id} needs phases`);
  assert.equal(
    new Set(testCase.expected.overlays).size,
    testCase.expected.overlays.length,
    `${testCase.id} has duplicate overlays`,
  );
  assert.equal(
    new Set(testCase.expected.phases).size,
    testCase.expected.phases.length,
    `${testCase.id} has duplicate phases`,
  );
  for (const overlay of testCase.expected.overlays) {
    assert.ok(overlayNames.has(overlay), `${testCase.id} has unknown overlay: ${overlay}`);
    coveredOverlays.add(overlay);
  }
  for (const phase of testCase.expected.phases) {
    assert.ok(phaseNames.has(phase), `${testCase.id} has unknown phase: ${phase}`);
    coveredPhases.add(phase);
  }
  assert.ok(
    progressTrackingNames.has(testCase.expected.progressTracking),
    `${testCase.id} has unknown progress tracking`,
  );
  coveredProgressTracking.add(testCase.expected.progressTracking);
  assert.ok(risks.has(testCase.expected.risk), `unknown risk: ${testCase.expected.risk}`);
  assert.equal(typeof testCase.expected.proofSurface, "string");
  assert.ok(testCase.expected.proofSurface.trim(), `${testCase.id} needs a proof surface`);
  assert.equal(typeof testCase.expected.writeOwnership, "string");
  assert.ok(testCase.expected.writeOwnership.trim(), `${testCase.id} needs write ownership`);
  assert.ok(evidence.has(testCase.expected.independentEvidence), "unknown evidence lane");
  if (testCase.expected.verificationCapability !== undefined) {
    assert.ok(
      verificationCapabilities.has(testCase.expected.verificationCapability),
      `${testCase.id} has unknown verification capability`,
    );
    coveredVerificationCapabilities.add(testCase.expected.verificationCapability);
  }
}
assertExactSet(coveredRoutes, primaryPlaybooks, "covered primary routes");
assertExactSet(coveredOverlays, overlayNames, "covered execution overlays");
assertExactSet(coveredPhases, phaseNames, "covered verification phases");
assertExactSet(
  coveredProgressTracking,
  progressTrackingNames,
  "covered progress tracking modes",
);
for (const [id, progressTracking] of requiredTodoProgressCases) {
  const testCase = cases.find((candidate) => candidate.id === id);
  assert.ok(testCase, `missing Todo progress case: ${id}`);
  assert.equal(
    testCase.expected.progressTracking,
    progressTracking,
    `${id} has wrong Todo progress tracking`,
  );
}
assertExactSet(
  coveredVerificationCapabilities,
  verificationCapabilities,
  "covered verification capabilities",
);

console.log(
  `Validated ${primaryPlaybooks.length} primary routes, ${overlayNames.size} overlay, ${phaseNames.size} phase, ${progressTrackingNames.size} progress tracking modes, ${verificationCapabilities.size} verification capabilities, ${agents.size} custom agents, and ${cases.length} routing cases.`,
);
