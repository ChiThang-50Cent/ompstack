const MAX_SKIPPED_LINES = 50;
const MAX_LINE_LENGTH = 300;

/** Lines that only report a zero count, e.g. "0 skipped" or "skipped=0". */
const ZERO_SKIP = /\b0 skipped\b|skipped=0\b|\bskipped: 0\b/i;

/**
 * Extract lines from test-runner output that report skipped tests.
 * Runner-agnostic on purpose (Odoo/unittest/pytest/jest all say "skipped"):
 * over-matching is harmless because it is informational unless an acceptance
 * criterion names the test in `evidenceTests`.
 */
export function parseSkippedTests(output: string): string[] {
	const seen = new Set<string>();
	for (const raw of output.split(/\r?\n/)) {
		if (!/\bskipped\b/i.test(raw) || ZERO_SKIP.test(raw)) continue;
		seen.add(raw.trim().slice(0, MAX_LINE_LENGTH));
		if (seen.size >= MAX_SKIPPED_LINES) break;
	}
	return [...seen];
}
