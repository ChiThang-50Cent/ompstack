import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (path) => readFile(resolve(root, path), "utf8");
const playbooks = [
  "investigation",
  "bug-fix",
  "feature",
  "refactoring",
  "prototype",
  "perf-issue",
  "runtime-forensics",
  "trace-forensics",
  "queue",
  "eval",
  "verification",
];
const risks = new Set(["low", "medium", "high", "critical"]);
const evidence = new Set([
  "none",
  "reviewer",
  "verifier",
  "reviewer + verifier",
  "security-reviewer",
  "reviewer + verifier + security-reviewer",
]);

const skill = await read("skills/ompstack/SKILL.md");
const command = await read("commands/ompstack.md");
const examples = await read("examples/usage.md");
const feature = await read("skills/ompstack/playbooks/feature.md");
const queue = await read("skills/ompstack/playbooks/queue.md");
const evaluation = await read("skills/ompstack/playbooks/eval.md");
const cases = JSON.parse(await read("tests/fixtures/routing-cases.json"));

assert.match(skill, /^---\nname: ompstack\ndescription: .+/m);
assert.match(command, /Read `skill:\/\/ompstack` and use it as the control plane/);
assert.match(skill, /# Goal[\s\S]*# Constraints[\s\S]*# Contract/);
assert.match(skill, /Independent evidence:/);
assert.match(skill, /reviewer \+ verifier \+ security-reviewer/);
assert.match(skill, /Never mix design and implementation lanes in one batch\./);
assert.match(feature, /design-only `tasks\[\]` batch/);
assert.match(queue, /one owner for every shared type\/schema\/API/);
const highRiskContexts = [
  [
    "persistence batch",
    [
      "# Goal\\nImplement the agreed webhook idempotency repository.",
      "# Constraints\\nRoute: feature\\nRisk: high",
      "# Contract\\nWrite owner: PersistenceLane.",
      "PersistenceLane writable: persistence/repository layer.",
      "HandlerLane is not started in this batch.",
      "Shared idempotency repository contract owner: PersistenceLane.",
      "Integration owner: parent.",
      "Fan-in order: persistence contract, then HandlerLane in a separate batch.",
      "Shared gate: parent reruns duplicate-delivery reproduction",
      "Independent evidence: reviewer + verifier.",
    ],
  ],
  [
    "handler batch",
    [
      "# Goal\\nConsume the established webhook idempotency repository contract.",
      "# Constraints\\nRoute: feature\\nRisk: high",
      "# Contract\\nWrite owner: HandlerLane.",
      "HandlerLane writable: webhook handler/service path.",
      "Shared idempotency repository contract owner: PersistenceLane.",
      "HandlerLane reads the established repository contract and does not change it.",
      "Integration owner: parent.",
      "Fan-in order: handler implementation, then parent integration.",
      "Shared gate: parent reruns duplicate-delivery reproduction",
      "Independent evidence: reviewer + verifier.",
    ],
  ],
  [
    "evidence batch",
    [
      "# Goal\\nVerify webhook idempotency against the combined change.",
      "# Constraints\\nRoute: verification\\nRisk: high",
      "# Contract\\nWrite owner: parent.",
      "Writable files: none.",
      "Review scope: combined persistence and handler diff.",
      "Review lanes: PatchReview static review; BehaviorVerification duplicate-delivery execution.",
      "Integration owner: parent.",
      "Fan-in order: collect both verdicts, then parent synthesis.",
      "Shared gate: duplicate-delivery reproduction and targeted tests already passed",
      "Independent evidence: reviewer + verifier.",
    ],
  ],
];
for (const [label, requiredTerms] of highRiskContexts) {
  for (const term of requiredTerms) {
    assert.ok(examples.includes(term), `${label} is missing ${term}`);
  }
}
assert.match(examples, /After `PersistenceLane` returns its concrete contract, the parent starts `HandlerLane` in a separate batch/);
assert.match(evaluation, /plugin\/skill disabled/);
assert.match(evaluation, /"type": "object"[\s\S]*"additionalProperties": false[\s\S]*"required":/);
assert.match(evaluation, /"reviewer \+ verifier \+ security-reviewer"/);

for (const playbook of playbooks) {
  const path = `skills/ompstack/playbooks/${playbook}.md`;
  const content = await read(path);
  assert.match(content, /^# .+/m, `${path} needs a title`);
  assert.match(skill, new RegExp(`playbooks/${playbook}\\.md`), `${playbook} is not routed`);
}

const agentFiles = await readdir(resolve(root, "agents"));
const agents = new Set();
for (const file of agentFiles.filter((entry) => entry.endsWith(".md"))) {
  const content = await read(`agents/${file}`);
  const name = content.match(/^name: ([^\n]+)$/m)?.[1];
  assert.ok(name, `agents/${file} needs a name`);
  assert.match(content, /^description: .+/m, `agents/${file} needs a description`);
  agents.add(name);
}
for (const agent of ["ompstack-architect", "ompstack-verifier"]) {
  assert.ok(agents.has(agent), `${agent} is referenced but not defined`);
  assert.match(skill, new RegExp(`\`${agent}\``));
}

assert.ok(Array.isArray(cases) && cases.length >= 10, "need at least ten routing cases");
const caseIds = new Set();
for (const testCase of cases) {
  assert.equal(typeof testCase.id, "string");
  assert.ok(testCase.id.trim(), "routing case id must be nonempty");
  assert.ok(!caseIds.has(testCase.id), `duplicate case id: ${testCase.id}`);
  caseIds.add(testCase.id);
  assert.equal(typeof testCase.prompt, "string");
  assert.ok(testCase.prompt.trim(), `${testCase.id} needs a nonempty prompt`);
  assert.equal(typeof testCase.expected, "object");
  assert.ok(testCase.expected, `${testCase.id} needs expected routing`);
  assert.ok(playbooks.includes(testCase.expected.route), `unknown route: ${testCase.expected.route}`);
  assert.ok(risks.has(testCase.expected.risk), `unknown risk: ${testCase.expected.risk}`);
  assert.equal(typeof testCase.expected.proofSurface, "string");
  assert.ok(testCase.expected.proofSurface.trim(), `${testCase.id} needs a proof surface`);
  assert.equal(typeof testCase.expected.writeOwnership, "string");
  assert.ok(testCase.expected.writeOwnership.trim(), `${testCase.id} needs write ownership`);
  assert.ok(evidence.has(testCase.expected.independentEvidence), "unknown evidence lane");
}

console.log(`Validated ${playbooks.length} playbooks, ${agents.size} custom agents, and ${cases.length} routing cases.`);
