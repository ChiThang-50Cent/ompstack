import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const POLICY_DIRECTORY = fileURLToPath(new URL("../policy", import.meta.url));
const MANIFEST_PATH = fileURLToPath(new URL("../policy/manifest.json", import.meta.url));

function fail(message) {
  throw new Error(`policy: ${message}`);
}

function plainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function readJson(path, label) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) fail(`${label} is not valid JSON`);
    throw error;
  }
}

export async function loadPolicyManifest(path = MANIFEST_PATH) {
  const manifest = await readJson(path, "manifest");
  if (
    !plainObject(manifest) ||
    manifest.schemaVersion !== 1 ||
    typeof manifest.policyVersion !== "string" ||
    manifest.policyVersion.trim() === "" ||
    !Array.isArray(manifest.policies) ||
    manifest.policies.length === 0 ||
    !manifest.policies.every((name) => typeof name === "string" && /^[a-z][a-z-]*$/.test(name)) ||
    new Set(manifest.policies).size !== manifest.policies.length
  ) {
    fail("manifest has an invalid shape");
  }
  return manifest;
}

export async function loadPolicy(name, { directory = POLICY_DIRECTORY, manifest } = {}) {
  if (typeof name !== "string" || !/^[a-z][a-z-]*$/.test(name)) {
    fail("name must be a lowercase policy identifier");
  }
  const effectiveManifest = manifest === undefined ? await loadPolicyManifest() : manifest;
  if (!effectiveManifest.policies.includes(name)) fail(`${name} is not declared by the manifest`);
  const document = await readJson(`${directory}/${name}.json`, name);
  if (!plainObject(document) || document.schemaVersion !== 1) {
    fail(`${name} has an invalid shape`);
  }
  return { policyVersion: effectiveManifest.policyVersion, ...document };
}
