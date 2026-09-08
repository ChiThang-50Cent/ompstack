import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "bun:test";
import { checkFreshness, runOrchestratedTask } from "../scripts/run-orchestrated-task.mjs";

const oracleProgram = `
const value = await Bun.file("candidate.txt").text();
const failed = value === "fixed" ? 0 : 1;
await Bun.write(process.env.OMPSTACK_ORACLE_RESULT_PATH, JSON.stringify({ schemaVersion: 1, status: "complete", testsExecuted: 1, failed }));
process.exit(failed);
`;

async function withWorkspace(callback) {
  const workspace = await mkdtemp(join(tmpdir(), "ompstack-orchestrator-"));
  const candidate = join(workspace, "candidate");
  const state = join(workspace, "state");
  await mkdir(candidate);
  await Bun.write(join(candidate, "candidate.txt"), "broken");
  await Bun.write(join(candidate, "protected.txt"), "protected");
  try {
    await callback({ candidate, state, workspace });
  } finally {
    await rm(workspace, { force: true, recursive: true });
  }
}

test("controller records a bounded repair attempt and only completes on a fresh verdict", async () => {
  await withWorkspace(async ({ candidate, workspace }) => {
    const contractPath = join(workspace, "contract.json");
    const specificationPath = join(workspace, "orchestration.json");
    await writeFile(
      contractPath,
      JSON.stringify({
        candidatePaths: ["candidate.txt"],
        command: { argv: [process.execPath, "-e", oracleProgram] },
        maxOutputBytes: 512,
        oracle: { minimumTests: 1, resultSchemaVersion: 1 },
        protectedPaths: ["protected.txt"],
        schemaVersion: 2,
        timeoutMs: 1_000,
        trustLevel: "convenience",
      }),
    );
    await writeFile(
      specificationPath,
      JSON.stringify({
        candidateRoot: "candidate",
        contractPath: "contract.json",
        maxAttempts: 2,
        schemaVersion: 1,
        stateDirectory: "state",
        workers: {
          initial: { argv: [process.execPath, "-e", "process.exit(0)"], timeoutMs: 1_000 },
          repair: { argv: [process.execPath, "-e", "await Bun.write('candidate.txt', 'fixed')"], timeoutMs: 1_000 },
        },
      }),
    );

    const specification = JSON.parse(await readFile(specificationPath, "utf8"));
    await assert.rejects(
      runOrchestratedTask({ runId: "too-many-retries", specification: { ...specification, maxAttempts: 3 }, specificationPath }),
      /maxAttempts must be 1 or 2/,
    );
    const run = await runOrchestratedTask({ runId: "repair-flow", specification, specificationPath });

    assert.equal(run.final.verdict, "VERIFIED");
    assert.equal(run.freshness.fresh, true);
    const journal = (await readFile(run.journalPath, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.equal(journal.filter((event) => event.type === "oracle").length, 2);
    assert.ok(journal.some((event) => event.state === "REPAIRING"));
    assert.ok(journal.some((event) => event.state === "VERIFIED"));

    await Bun.write(join(candidate, "candidate.txt"), "regressed");
    assert.deepEqual(await checkFreshness(run), { fresh: false, reason: "candidate_changed" });
    await Bun.write(join(candidate, "candidate.txt"), "fixed");
    const changedContract = JSON.parse(await readFile(contractPath, "utf8"));
    changedContract.oracle.minimumTests = 2;
    await writeFile(contractPath, JSON.stringify(changedContract));
    assert.deepEqual(await checkFreshness(run), { fresh: false, reason: "contract_changed" });
  });
});
