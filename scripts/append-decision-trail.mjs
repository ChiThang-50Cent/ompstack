import assert from "node:assert/strict";
import { mkdir, open } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const decisionTrailHeader = "ts\tphase\tdecision\twhy\tevidence\tresult";

function normalizeCell(value, field) {
  assert.equal(typeof value, "string", `${field} must be a string`);
  const normalized = value.replace(/[\t\r\n]+/g, " ").trim();
  assert.ok(normalized, `${field} must be nonempty`);
  return normalized;
}

export async function appendDecisionTrail({
  path,
  phase,
  decision,
  why,
  evidence,
  result,
  timestamp = new Date().toISOString(),
}) {
  const target = resolve(path);
  const cells = [
    normalizeCell(timestamp, "timestamp"),
    normalizeCell(phase, "phase"),
    normalizeCell(decision, "decision"),
    normalizeCell(why, "why"),
    normalizeCell(evidence, "evidence"),
    normalizeCell(result, "result"),
  ];

  await mkdir(dirname(target), { recursive: true });
  const handle = await open(target, "a+");
  try {
    const { size } = await handle.stat();
    if (size === 0) await handle.write(`${decisionTrailHeader}\n`);
    await handle.write(`${cells.join("\t")}\n`);
  } finally {
    await handle.close();
  }

  return target;
}

function usage() {
  return [
    "Usage:",
    "  bun scripts/append-decision-trail.mjs <path> <phase> <decision> <why> <evidence> <result>",
  ].join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [, , path, phase, decision, why, evidence, result] = process.argv;
  if ([path, phase, decision, why, evidence, result].some((value) => value === undefined)) {
    console.error(usage());
    process.exitCode = 1;
  } else {
    const target = await appendDecisionTrail({ path, phase, decision, why, evidence, result });
    console.log(`Appended decision trail entry to ${target}`);
  }
}
