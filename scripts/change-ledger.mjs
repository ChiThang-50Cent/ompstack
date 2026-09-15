import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { collectChangeSet } from "./change-set.mjs";

const POLICY_PATH = fileURLToPath(new URL("./change-ledger-policy.json", import.meta.url));
const dispositions = new Set(["pending", "reviewed", "skipped"]);

function fail(message) {
  throw new Error(`change ledger: ${message}`);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function plainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validatePolicy(policy) {
  if (
    !plainObject(policy) ||
    policy.schemaVersion !== 1 ||
    !Number.isInteger(policy.maxLines) || policy.maxLines < 1 ||
    !Array.isArray(policy.vendoredPrefixes) || !policy.vendoredPrefixes.every(nonEmptyString) ||
    !Array.isArray(policy.generatedPathPatterns) || !policy.generatedPathPatterns.every(nonEmptyString)
  ) {
    fail("policy has an invalid shape");
  }
  return {
    ...policy,
    generatedPathPatterns: policy.generatedPathPatterns.map((pattern) => new RegExp(pattern)),
  };
}

export async function loadChangeLedgerPolicy(path = POLICY_PATH) {
  try {
    return validatePolicy(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if (error instanceof SyntaxError) fail("policy is not valid JSON");
    throw error;
  }
}

async function exclusionFor(change, { policy, userExcludedPaths }) {
  if (userExcludedPaths.has(change.path)) return "user-excluded";
  if (change.binary) return "binary";
  if (policy.vendoredPrefixes.some((prefix) => change.path.startsWith(prefix))) return "vendored";
  if (policy.generatedPathPatterns.some((pattern) => pattern.test(change.path))) return "generated";
  if (change.addedLines + change.deletedLines > policy.maxLines) return "size-cap";
  return null;
}

function totals(entries) {
  return Object.fromEntries([...dispositions].map((disposition) => [
    disposition,
    entries.filter((entry) => entry.disposition === disposition).length,
  ]));
}

function validateLedger(ledger) {
  if (!plainObject(ledger) || ledger.schemaVersion !== 1 || !Array.isArray(ledger.entries)) {
    fail("ledger has an invalid shape");
  }
  for (const entry of ledger.entries) {
    if (!plainObject(entry) || !nonEmptyString(entry.path) || !nonEmptyString(entry.changeType) || !dispositions.has(entry.disposition)) {
      fail("ledger has an invalid entry");
    }
    if ((entry.disposition === "skipped") !== nonEmptyString(entry.reason)) {
      fail("skipped entries require a reason and non-skipped entries cannot have one");
    }
  }
}

/** Builds a complete ledger; each changed or untracked path gets exactly one entry. */
export async function createChangeLedger({ base, head, root = process.cwd(), policy, userExcludedPaths = [], generatedAt = new Date().toISOString() }) {
  if (!nonEmptyString(base) || !nonEmptyString(head) || !nonEmptyString(generatedAt)) {
    fail("base, head, and generatedAt must be non-empty strings");
  }
  if (!Array.isArray(userExcludedPaths) || !userExcludedPaths.every(nonEmptyString)) {
    fail("userExcludedPaths must contain only non-empty paths");
  }
  const effectivePolicy = policy === undefined ? await loadChangeLedgerPolicy() : validatePolicy(policy);
  const changes = await collectChangeSet({ base, head, root });
  const excludedPaths = new Set(userExcludedPaths);
  const entries = await Promise.all(changes.map(async (change) => {
    const reason = await exclusionFor(change, { policy: effectivePolicy, userExcludedPaths: excludedPaths });
    return {
      path: change.path,
      changeType: change.changeType,
      disposition: reason === null ? "pending" : "skipped",
      reason,
    };
  }));
  return {
    schemaVersion: 1,
    base,
    head,
    generatedAt,
    entries,
    totals: totals(entries),
  };
}

/** Records a terminal review decision without permitting entries to disappear. */
export function dispositionLedgerEntry(ledger, { path, disposition, reason = null }) {
  validateLedger(ledger);
  if (!nonEmptyString(path) || !["reviewed", "skipped"].includes(disposition)) {
    fail("a ledger entry must resolve to reviewed or skipped");
  }
  if ((disposition === "skipped") !== nonEmptyString(reason)) {
    fail("skipped resolutions require a reason and reviewed resolutions cannot have one");
  }
  let found = false;
  const entries = ledger.entries.map((entry) => {
    if (entry.path !== path) return entry;
    found = true;
    if (entry.disposition !== "pending") fail(`${path} is already terminal`);
    return { ...entry, disposition, reason };
  });
  if (!found) fail(`${path} is not in the ledger`);
  return { ...ledger, entries, totals: totals(entries) };
}

export function assertLedgerReadyForCloseout(ledger) {
  validateLedger(ledger);
  const pending = ledger.entries.filter((entry) => entry.disposition === "pending").map((entry) => entry.path);
  if (pending.length > 0) fail(`cannot close with pending entries: ${pending.join(", ")}`);
}

if (import.meta.main) {
  const [base, head] = process.argv.slice(2);
  const ledger = await createChangeLedger({ base, head });
  console.log(JSON.stringify(ledger, null, 2));
}
