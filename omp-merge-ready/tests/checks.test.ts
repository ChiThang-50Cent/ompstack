import { expect, test } from "bun:test";
import { parseSkippedTests } from "../extensions/merge-ready/checks.ts";

test("skipped-test lines are extracted across runners and zero counts are ignored", () => {
	const output = [
		"INFO odoo.tests.result: 0 failed, 0 error(s) of 117 tests",
		"INFO mod.tests: skipped TestClose.test_reopening : MongoDB is not configured",
		"test_a (tests.T) ... skipped 'no gpu'",
		"SKIPPED [1] tests/test_x.py:3: needs redis",
		"===== 3 passed, 0 skipped in 1.2s =====",
		"OK (skipped=0)",
		"INFO mod.tests: skipped TestClose.test_reopening : MongoDB is not configured",
	].join("\n");
	expect(parseSkippedTests(output)).toEqual([
		"INFO mod.tests: skipped TestClose.test_reopening : MongoDB is not configured",
		"test_a (tests.T) ... skipped 'no gpu'",
		"SKIPPED [1] tests/test_x.py:3: needs redis",
	]);
});
