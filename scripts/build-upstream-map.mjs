import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = path.resolve(new URL("..", import.meta.url).pathname);
const upstreamRoot = path.join(root, ".upstream", "cursor-plugins");
const mapPath = path.join(root, "scripts", "upstream-map.json");
const PINNED_COMMIT = "12d587d";

const principleNames = [
  "attack-the-premise", "boundary-discipline", "build-the-lever", "encode-lessons-in-structure", "exhaust-the-design-space",
  "experience-first", "fix-root-causes", "foundational-thinking", "guard-the-context-window", "laziness-protocol",
  "make-operations-idempotent", "migrate-callers-then-delete-legacy-apis", "minimize-reader-load", "model-the-domain",
  "never-block-on-the-human", "outcome-oriented-execution", "prove-it-works", "redesign-from-first-principles",
  "separate-before-serializing-shared-state", "sequence-verifiable-units", "subtract-before-you-add", "test-behavior-not-implementation",
  "type-system-discipline",
];
const referenceMappings = [
  ["skills/architect/references/design-red-flags.md", "skills/pstack/operators/references/architect/design-red-flags.md"],
  ["skills/architect/references/rationale-template.md", "skills/pstack/operators/references/architect/rationale-template.md"],
  ["skills/architect/references/runner-prompt.md", "skills/pstack/operators/references/architect/runner-prompt.md"],
  ["skills/create-verification-skill/references/feature-map-example/README.md", "skills/pstack-create-verification/references/feature-map-example/README.md"],
  ["skills/create-verification-skill/references/feature-map-example/create-note.md", "skills/pstack-create-verification/references/feature-map-example/create-note.md"],
  ["skills/create-verification-skill/references/feature-map-example/search.md", "skills/pstack-create-verification/references/feature-map-example/search.md"],
  ["skills/how/references/explainer-prompt.md", "skills/pstack/operators/references/how/explainer-prompt.md"],
  ["skills/how/references/explorer-prompt.md", "skills/pstack/operators/references/how/explorer-prompt.md"],
  ["skills/interrogate/references/code-quality-review.md", "skills/pstack/operators/references/interrogate/code-quality-review.md"],
  ["skills/interrogate/references/lead-judgment.md", "skills/pstack/operators/references/interrogate/lead-judgment.md"],
  ["skills/interrogate/references/reviewer-prompt.md", "skills/pstack/operators/references/interrogate/reviewer-prompt.md"],
  ["skills/interrogate/references/rubric.md", "skills/pstack/operators/references/interrogate/rubric.md"],
  ["skills/poteto-mode/references/bugbot-triage.md", "skills/pstack/playbooks/references/bugbot-triage.md"],
  ["skills/poteto-mode/scripts/worktree-audit.sh", "scripts/worktree-audit.sh"],
  ["skills/reflect/references/divergent-reviewer.md", "skills/pstack-reflect/references/divergent-reviewer.md"],
  ["skills/reflect/references/judgment-reviewer.md", "skills/pstack-reflect/references/judgment-reviewer.md"],
  ["skills/reflect/references/synthesizer.md", "skills/pstack-reflect/references/synthesizer.md"],
  ["skills/reflect/references/tooling-reviewer.md", "skills/pstack-reflect/references/tooling-reviewer.md"],
  ["skills/show-me-your-work/references/decision-log-template.tsv", "skills/pstack-show-me-your-work/references/decision-log-template.tsv"],
  ["skills/typescript-best-practices/references/patterns.md", "skills/pstack-typescript-best-practices/references/patterns.md"],
  ["skills/why/references/epistemics.md", "skills/pstack/operators/references/why/epistemics.md"],
  ["skills/why/references/investigator-prompt.md", "skills/pstack/operators/references/why/investigator-prompt.md"],
  ["skills/why/references/source-playbook.md", "skills/pstack/operators/references/why/source-playbook.md"],
  ["skills/why/references/sources/code-archaeology.md", "skills/pstack/operators/references/why/sources/code-archaeology.md"],
  ["skills/why/references/sources/databricks.md", "skills/pstack/operators/references/why/sources/databricks.md"],
  ["skills/why/references/sources/datadog.md", "skills/pstack/operators/references/why/sources/datadog.md"],
  ["skills/why/references/sources/incident-postmortem.md", "skills/pstack/operators/references/why/sources/incident-postmortem.md"],
  ["skills/why/references/sources/linear.md", "skills/pstack/operators/references/why/sources/linear.md"],
  ["skills/why/references/sources/notion.md", "skills/pstack/operators/references/why/sources/notion.md"],
  ["skills/why/references/sources/sentry.md", "skills/pstack/operators/references/why/sources/sentry.md"],
  ["skills/why/references/sources/slack.md", "skills/pstack/operators/references/why/sources/slack.md"],
  ["skills/why/references/synthesizer-prompt.md", "skills/pstack/operators/references/why/synthesizer-prompt.md"],
];
const skillMappings = [
  ["skills/how/SKILL.md", "skills/pstack/operators/how.md"],
  ["skills/why/SKILL.md", "skills/pstack/operators/why.md"],
  ["skills/interrogate/SKILL.md", "skills/pstack/operators/interrogate.md"],
  ["skills/architect/SKILL.md", "skills/pstack/operators/architect.md"],
  ["skills/arena/SKILL.md", "skills/pstack/operators/arena.md"],
  ["skills/swarm/SKILL.md", "skills/pstack/operators/swarm.md"],
  ["skills/unslop/SKILL.md", "skills/pstack-unslop/SKILL.md"],
  ["skills/poteto-mode/SKILL.md", "skills/pstack/SKILL.md", { aggregate: true }],
  ["skills/no-comments/SKILL.md", "skills/pstack-no-comments/SKILL.md"],
  ["skills/tdd/SKILL.md", "skills/pstack-tdd/SKILL.md"],
  ["skills/blast-radius/SKILL.md", "skills/pstack-blast-radius/SKILL.md"],
  ["skills/technical-writing/SKILL.md", "skills/pstack-technical-writing/SKILL.md"],
  ["skills/typescript-best-practices/SKILL.md", "skills/pstack-typescript-best-practices/SKILL.md"],
  ["skills/create-verification-skill/SKILL.md", "skills/pstack-create-verification/SKILL.md"],
  ["skills/maintain-verification-skill/SKILL.md", "skills/pstack-maintain-verification/SKILL.md"],
  ["skills/recall/SKILL.md", "skills/pstack-recall/SKILL.md"],
  ["skills/reflect/SKILL.md", "skills/pstack-reflect/SKILL.md"],
  ["skills/automate-me/SKILL.md", "skills/pstack-automate-me/SKILL.md"],
  ["skills/figure-it-out/SKILL.md", "skills/pstack-figure-it-out/SKILL.md"],
  ["skills/teach/SKILL.md", "skills/pstack-teach/SKILL.md"],
  ["skills/bro/SKILL.md", "skills/pstack-bro/SKILL.md"],
  ["skills/show-me-your-work/SKILL.md", "skills/pstack-show-me-your-work/SKILL.md"],
  ["skills/poteto-mode/playbooks/prototype.md", "skills/pstack/playbooks/empirical-prototype.md", { aggregate: true }],
  ["agents/comment-sicko.md", "agents/pstack-comment-sicko.md"],
  ["skills/show-me-your-work/scripts/log.sh", "skills/pstack-show-me-your-work/scripts/log.sh"],
];
const playbookNames = [
  "authoring-a-skill", "autonomous-run", "autopilot-full", "autopilot-stack", "babysit", "eval", "hillclimb",
  "opening-a-pr", "orchestrate", "pause-safely", "runtime-forensics", "trace-forensics", "visual-parity", "worktree-cleanup",
];

function wordCount(source) {
  const body = source.toString("utf8").replace(/^---\n[\s\S]*?\n---\n/, "");
  return body.match(/\S+/g)?.length ?? 0;
}

async function assertPinnedCheckout() {
  try {
    const result = await execFileAsync("git", ["-C", upstreamRoot, "rev-parse", "HEAD"]);
    const head = result.stdout.trim();
    if (head !== PINNED_COMMIT && !head.startsWith(`${PINNED_COMMIT}`)) {
      throw new Error(`expected ${PINNED_COMMIT}, found ${head}`);
    }
  } catch (error) {
    throw new Error(`pinned checkout must be ${PINNED_COMMIT}: ${error}`);
  }
}

function plannedEntries() {
  const entries = [];
  const add = (upstream, target, options = {}) => entries.push({ upstream: `pstack/${upstream}`, target, ...options });
  for (const name of principleNames) {
    add(`skills/principle-${name}/SKILL.md`, `skills/pstack/principles/${name === "guard-the-context-window" ? "guard-context-window" : name}.md`);
  }
  for (const [upstream, target] of referenceMappings) add(upstream, target);
  for (const [upstream, target, options] of skillMappings) add(upstream, target, options);
  for (const name of playbookNames) add(`skills/poteto-mode/playbooks/${name}.md`, `skills/pstack/playbooks/${name}.md`);
  return entries;
}

async function loadExisting() {
  try {
    return JSON.parse(await readFile(mapPath, "utf8"));
  } catch {
    return [];
  }
}

async function buildEntries(existing) {
  const oldByTarget = new Map((Array.isArray(existing) ? existing : []).map(entry => [entry.target, entry]));
  const entries = [];
  for (const planned of plannedEntries()) {
    const sourcePath = path.join(upstreamRoot, planned.upstream);
    const source = await readFile(sourcePath);
    const old = oldByTarget.get(planned.target);
    entries.push({
      upstream: planned.upstream,
      upstreamSha256: createHash("sha256").update(source).digest("hex"),
      upstreamWords: wordCount(source),
      target: planned.target,
      minRatio: old?.minRatio ?? 0.85,
      status: old?.status ?? "planned",
      reason: old?.reason ?? null,
      ...(planned.aggregate || old?.aggregate ? { aggregate: true } : {}),
    });
  }
  return entries;
}

const args = new Set(process.argv.slice(2));
await assertPinnedCheckout();
const existing = await loadExisting();
const entries = await buildEntries(existing);
if (args.has("--check")) {
  const expected = JSON.stringify(entries, null, 2);
  const actual = JSON.stringify(existing, null, 2);
  if (expected !== actual) throw new Error("scripts/upstream-map.json is stale; run node scripts/build-upstream-map.mjs");
  console.log(`Upstream map is current (${entries.length} entries, ${PINNED_COMMIT}).`);
} else {
  await writeFile(mapPath, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
  console.log(`Wrote ${entries.length} upstream map entries from ${PINNED_COMMIT}.`);
}
