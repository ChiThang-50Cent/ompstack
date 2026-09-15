import { loadPolicy } from "../policy.mjs";

function fail(message) {
  throw new Error(`routing policy: ${message}`);
}

export async function loadRoutingPolicy() {
  const policy = await loadPolicy("routing");
  const { thresholds } = policy;
  if (
    thresholds === null ||
    typeof thresholds !== "object" ||
    Array.isArray(thresholds) ||
    !Object.entries(thresholds).every(([name, value]) =>
      [
        "maxMediumConsumerFamilies",
        "maxMediumCodeFiles",
        "maxMediumAffectedModules",
        "maxMediumReverseDependents",
        "maxMediumChangedLines",
      ].includes(name) && Number.isInteger(value) && value >= 0,
    ) ||
    Object.keys(thresholds).length !== 5
  ) {
    fail("thresholds have an invalid shape");
  }
  return policy;
}
