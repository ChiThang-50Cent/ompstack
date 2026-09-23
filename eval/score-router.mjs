import { readFile } from "node:fs/promises";
import { classifyTask } from "../dist/src/router.js";

const cases = JSON.parse(await readFile(new URL("./cases.json", import.meta.url), "utf8"));
const mismatches = [];
for (const item of cases) {
  const actual = classifyTask(item.prompt);
  const fields = [
    ["playbook", item.expectedPlaybook, actual.playbook],
    ["ceremony", item.expectedCeremony, actual.ceremony],
    ["verificationRequired", item.expectedVerificationRequired, actual.verificationRequired],
  ];
  for (const [field, expected, observed] of fields) {
    if (expected !== observed) mismatches.push({ id: item.id, field, expected, observed, reasons: actual.reasons });
  }
}
if (mismatches.length) {
  console.error(JSON.stringify(mismatches, null, 2));
  process.exit(1);
}
console.log(`Router corpus passed: ${cases.length}/${cases.length} cases.`);
