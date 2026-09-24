import path from "node:path";
import process from "node:process";
import { validate } from "./lib/validate.mjs";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const result = await validate(root);

if (result.warnings.length) {
  console.warn("Asset validation warnings:");
  for (const warning of result.warnings) console.warn(`- ${warning}`);
}
if (result.errors.length) {
  console.error("Asset validation failed:");
  for (const error of result.errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  const summary = result.summary;
  console.log(`Asset validation passed (${summary.agentCount} agents, ${summary.playbookCount} playbooks, ${summary.operatorCount} operators, ${summary.principleCount} principles, ${summary.evalCaseCount} eval cases).`);
}
