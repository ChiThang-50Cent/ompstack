// test/host/capture-report.mjs <kept-scenario-dir> — markdown table from a kept capture-child-tools run.
import fs from "node:fs";
import path from "node:path";
const dir = process.argv[2];
const log = fs.readFileSync(path.join(dir, "mock.jsonl"), "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l));
const clip = s => (s ?? "(none)").split("\n")[0].slice(0, 60).replace(/\|/g, "\\|");
console.log("| Agent | Offered tools | `bash` probe | `edit` probe |\n|---|---|---|---|");
for (const agent of ["scout", "architect", "reviewer", "judge", "verifier"]) {
  const last = log.filter(e => e.rule === `child-${agent}`).at(-1);
  if (!last) { console.log(`| pstack-${agent} | NOT SPAWNED | | |`); continue; }
  console.log(`| pstack-${agent} | ${last.tools.join(", ")} | ${clip(last.toolResults[0])} | ${clip(last.toolResults[1])} |`);
}
console.log(`\nREADME.md after run:\n\n\`\`\`\n${fs.readFileSync(path.join(dir, "ws", "README.md"), "utf8")}\`\`\``);
