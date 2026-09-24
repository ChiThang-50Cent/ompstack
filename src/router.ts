import type { CeremonyLevel, Playbook, RouterDecision } from "./domain.js";
import { clamp } from "./utils.js";

interface SignalGroup {
  playbook: Playbook;
  patterns: RegExp[];
  weight: number;
}

const PLAYBOOK_SIGNALS: SignalGroup[] = [
  { playbook: "incident", weight: 6, patterns: [/\bincident\b/i, /\boutage\b/i, /production is down/i, /sev[- ]?[0-3]/i] },
  { playbook: "security", weight: 5, patterns: [/\bsecurity\b/i, /vulnerab/i, /exploit/i, /threat model/i, /authentication bypass/i, /\bauthentication\b/i, /\bauthorization\b/i, /\bpermissions?\b/i, /\bsecrets?\b/i] },
  { playbook: "bug-fix", weight: 4, patterns: [/\bbug\b/i, /\bregression\b/i, /stack trace/i, /failing/i, /doesn['’]?t work/i, /error:/i, /race condition/i, /deadlock/i] },
  { playbook: "performance", weight: 4, patterns: [/performance/i, /latency/i, /throughput/i, /benchmark/i, /memory leak/i, /too slow/i] },
  { playbook: "migration", weight: 4, patterns: [/\bmigrat/i, /schema change/i, /data backfill/i, /rollout/i, /compatib/i] },
  { playbook: "dependency-upgrade", weight: 4, patterns: [/upgrade depend/i, /bump version/i, /dependency update/i, /major version/i] },
  { playbook: "test-repair", weight: 4, patterns: [/fix tests?/i, /flaky test/i, /test suite/i, /snapshot failure/i] },
  { playbook: "refactor", weight: 3, patterns: [/\brefactor\b/i, /simplif/i, /cleanup/i, /remove duplication/i] },
  { playbook: "review", weight: 3, patterns: [/code review/i, /review (?:this|the) (?:diff|patch|pr)/i, /audit (?:this|the) change/i] },
  { playbook: "arena", weight: 3, patterns: [/compare (?:multiple|several) designs/i, /multiple candidates/i, /arena/i, /competing implementations/i] },
  { playbook: "eval", weight: 5, patterns: [/\b(?:eval|evaluation)\b/i, /blind(?:ed)? (?:evaluation|review)/i, /score (?:multiple|two) variants?/i] },
  { playbook: "hillclimb", weight: 5, patterns: [/\bhillclimb\b/i, /iterative(?:ly)? improve/i, /one metric.*(?:iterations?|attempts?)/i, /keep or revert/i] },
  { playbook: "runtime-forensics", weight: 6, patterns: [/runtime forensics/i, /live process/i, /instrument(?:ing)? the live process/i, /runtime smoking gun/i] },
  { playbook: "trace-forensics", weight: 5, patterns: [/trace forensics/i, /captured (?:cpu|performance) profile/i, /heapsnapshot/i, /cpuprofile/i, /spindump/i] },
  { playbook: "authoring-a-skill", weight: 6, patterns: [/author(?:ing)? (?:a |an )?(?:new )?(?:omp )?skill/i, /new (?:omp )?skill/i, /update .*skill/i] },
  { playbook: "opening-a-pr", weight: 5, patterns: [/open(?:ing)? (?:a )?(?:pull request|pr)/i, /create (?:a )?(?:pull request|pr)/i, /\bpull request\b/i] },
  { playbook: "babysit", weight: 5, patterns: [/\bbabysit\b/i, /merge-ready/i, /review thread(?:s)?/i, /get it green/i] },
  { playbook: "visual-parity", weight: 5, patterns: [/visual parity/i, /pixel diff/i, /screenshot baseline/i, /visual regression harness/i] },
  { playbook: "autonomous-run", weight: 5, patterns: [/autonomous run/i, /declared exit predicate/i, /long[- ]running goal/i, /keep going without stopping/i] },
  { playbook: "pause-safely", weight: 5, patterns: [/pause safely/i, /safe pause/i, /resume note/i, /cold[- ]start resume/i] },
  { playbook: "worktree-cleanup", weight: 5, patterns: [/worktree (?:cleanup|audit|prune)/i, /prune (?:merged|stale) worktrees/i, /stale worktree/i] },
  { playbook: "shipping", weight: 3, patterns: [/stacked pr/i, /merge queue/i, /release train/i, /land (?:the|these) prs?/i] },
  { playbook: "empirical-prototype", weight: 3, patterns: [/prototype/i, /measure/i, /which (?:option|approach).*better/i, /a\/b/i, /experiment/i] },
  { playbook: "documentation", weight: 3, patterns: [/write docs?/i, /documentation/i, /readme/i, /runbook/i] },
  { playbook: "investigation", weight: 2, patterns: [/investigat/i, /research/i, /trace (?:how|why|the)/i, /explain (?:how|why)/i, /understand/i, /what does/i] },
  { playbook: "multi-phase", weight: 2, patterns: [/multi[- ]phase/i, /several phases/i, /end[- ]to[- ]end program/i, /multiple workstreams/i] },
  { playbook: "feature", weight: 1, patterns: [/implement/i, /add (?:a |an )?(?:feature|endpoint|flow|capability)/i, /build/i, /create/i] },
];

const HIGH_RISK_PATTERNS = [
  /authentication|authorization|permission/i,
  /payment|billing|money|financial/i,
  /cryptograph|secret|credential|token/i,
  /database migration|schema migration|data loss|destructive/i,
  /concurren|race condition|distributed/i,
  /public api|wire protocol|backward compat/i,
  /production|deploy|release/i,
  /cross[- ](?:module|service|boundary)/i,
  /privacy|personal data|pii/i,
];

const PROGRAM_PATTERNS = [
  /multi[- ]day/i,
  /multiple prs?/i,
  /whole (?:repository|codebase|system)/i,
  /many modules/i,
  /multiple workstreams/i,
  /program[- ]scale/i,
  /large migration/i,
];

const DIRECT_PATTERNS = [
  /\btypo\b/i,
  /rename (?:a |the )?(?:local )?(?:variable|symbol)/i,
  /format(?:ting)? only/i,
  /one[- ]line/i,
  /update (?:a |the )?comment/i,
  /change (?:a |the )?(?:label|string|copy)/i,
  /docs? only/i,
];

export function defaultVerificationRequired(playbook: Playbook, ceremony: CeremonyLevel): boolean {
  if (ceremony === "direct") return false;
  if (playbook === "investigation" || playbook === "documentation") return ceremony === "strict" || ceremony === "program";
  return true;
}

export function classifyTask(prompt: string): RouterDecision {
  const text = prompt.trim();
  const scores = new Map<Playbook, number>();
  const matchedReasons: string[] = [];

  for (const group of PLAYBOOK_SIGNALS) {
    for (const pattern of group.patterns) {
      if (pattern.test(text)) {
        scores.set(group.playbook, (scores.get(group.playbook) ?? 0) + group.weight);
        matchedReasons.push(`${group.playbook}: ${pattern.source}`);
      }
    }
  }

  let playbook: Playbook = "feature";
  let bestScore = 0;
  for (const [candidate, score] of scores) {
    if (score > bestScore) {
      playbook = candidate;
      bestScore = score;
    }
  }

  const directMatches = DIRECT_PATTERNS.filter(pattern => pattern.test(text)).length;
  const highRiskMatches = HIGH_RISK_PATTERNS.filter(pattern => pattern.test(text)).length;
  const programMatches = PROGRAM_PATTERNS.filter(pattern => pattern.test(text)).length;
  const complexitySignals = [
    /multiple files/i,
    /end[- ]to[- ]end/i,
    /architecture/i,
    /redesign/i,
    /new subsystem/i,
    /root cause/i,
    /unknown/i,
  ].filter(pattern => pattern.test(text)).length;

  let ceremony: CeremonyLevel;
  if (programMatches > 0) ceremony = "program";
  else if (highRiskMatches > 0 || complexitySignals >= 2) ceremony = "strict";
  else if (directMatches > 0 && highRiskMatches === 0 && complexitySignals === 0 && text.length < 500) ceremony = "direct";
  else ceremony = "standard";

  if (playbook === "incident" || playbook === "security" || playbook === "migration") {
    ceremony = ceremony === "program" ? "program" : "strict";
  }

  if (playbook === "multi-phase") ceremony = programMatches > 0 ? "program" : "strict";

  const reasons = [
    `selected playbook=${playbook} (score=${bestScore})`,
    `ceremony=${ceremony}; high-risk=${highRiskMatches}; program=${programMatches}; complexity=${complexitySignals}; direct=${directMatches}`,
    ...matchedReasons.slice(0, 6),
  ];

  const confidence = clamp(0.45 + Math.min(bestScore, 8) * 0.05 + (highRiskMatches + programMatches) * 0.04, 0.45, 0.96);
  return {
    playbook,
    ceremony,
    confidence,
    reasons,
    verificationRequired: defaultVerificationRequired(playbook, ceremony),
  };
}
