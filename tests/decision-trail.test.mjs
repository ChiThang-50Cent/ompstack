import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "bun:test";
import { appendDecisionTrail, decisionTrailHeader } from "../scripts/append-decision-trail.mjs";

async function withTrail(callback) {
  const workspace = await mkdtemp(join(tmpdir(), "ompstack-trail-"));
  try {
    await callback(join(workspace, "audit", "task.tsv"));
  } finally {
    await rm(workspace, { force: true, recursive: true });
  }
}

test("decision trail creates one header and preserves prior entries", async () => {
  await withTrail(async (path) => {
    await appendDecisionTrail({
      path,
      phase: "routing",
      decision: "selected bug fix",
      why: "reported regression",
      evidence: "issue://42",
      result: "open",
      timestamp: "2026-09-08T00:00:00.000Z",
    });
    const first = await readFile(path, "utf8");

    await appendDecisionTrail({
      path,
      phase: "verification",
      decision: "drove\nactual\trequest",
      why: "needed direct observation",
      evidence: "artifact://proof",
      result: "tests green",
      timestamp: "2026-09-08T00:01:00.000Z",
    });
    const complete = await readFile(path, "utf8");

    assert.ok(complete.startsWith(first));
    assert.deepEqual(complete.trimEnd().split("\n"), [
      decisionTrailHeader,
      "2026-09-08T00:00:00.000Z\trouting\tselected bug fix\treported regression\tissue://42\topen",
      "2026-09-08T00:01:00.000Z\tverification\tdrove actual request\tneeded direct observation\tartifact://proof\ttests green",
    ]);
  });
});

test("decision trail CLI appends an evidence row", async () => {
  await withTrail(async (path) => {
    const script = fileURLToPath(
      new URL("../scripts/append-decision-trail.mjs", import.meta.url),
    );
    const child = Bun.spawn(
      [
        process.execPath,
        script,
        path,
        "verification",
        "drove API",
        "required consumer proof",
        "artifact://api-proof",
        "tests green",
      ],
      { stderr: "pipe", stdout: "pipe" },
    );

    assert.equal(await child.exited, 0);
    assert.match(await new Response(child.stdout).text(), /Appended decision trail entry/);
    assert.match(
      await readFile(path, "utf8"),
      new RegExp(
        `^${decisionTrailHeader}\\n[^\\n]+\\tverification\\tdrove API\\trequired consumer proof\\tartifact://api-proof\\ttests green\\n$`,
      ),
    );
  });
});

test("decision trail rejects empty required evidence", async () => {
  await withTrail(async (path) => {
    await assert.rejects(
      appendDecisionTrail({
        path,
        phase: "verification",
        decision: "ran check",
        why: "proof required",
        evidence: "\n\t",
        result: "open",
      }),
      /evidence must be nonempty/,
    );
  });
});
