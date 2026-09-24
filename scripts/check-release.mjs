import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = async relative => JSON.parse(await readFile(path.join(root, relative), "utf8"));
const packageJson = await readJson("package.json");
const pluginJson = await readJson(".omp-plugin/plugin.json");
const marketplace = await readJson(".omp-plugin/marketplace.json");
const marketplacePlugin = marketplace.plugins?.find(plugin => plugin.name === "pstack-omp");

if (packageJson.version !== pluginJson.version) {
  throw new Error(`package/plugin version mismatch: ${packageJson.version} !== ${pluginJson.version}`);
}
if (!marketplacePlugin) throw new Error("marketplace pstack-omp entry is missing");
if (marketplace.metadata?.version !== marketplacePlugin.version) {
  throw new Error("marketplace metadata.version does not match the plugin version");
}
if (marketplacePlugin.source?.ref !== `v${marketplacePlugin.version}`) {
  throw new Error("marketplace source.ref does not match the plugin version");
}

const ref = marketplacePlugin.source?.ref;
const expectedSha = marketplacePlugin.source?.sha;
let actualSha = "";
try {
  actualSha = execFileSync("git", ["rev-parse", "--verify", `${ref}^{commit}`], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
} catch {
  console.log(`Release metadata passed; local tag ${ref} is not present, so SHA verification was skipped.`);
  process.exit(0);
}
if (actualSha !== expectedSha) {
  throw new Error(`marketplace source.sha mismatch for ${ref}: ${expectedSha} !== ${actualSha}`);
}
console.log(`Release metadata passed: ${packageJson.version}, ${ref} -> ${actualSha}`);
