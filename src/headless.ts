import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import type { GateReport, PstackRun } from "./domain.js";
import { renderGateReport } from "./gates.js";

/**
 * Print mode (`omp -p`) has no UI, so `ctx.ui.notify` is invisible and OMP
 * exits 0 after a clean turn even when the model stopped with required gates
 * open. An unattended caller (CI, cron, an overnight loop) then reads success.
 * This module makes that outcome visible on stderr and in the exit status.
 */

interface ExitableProcess {
  exit: (code?: number) => never;
  exitCode?: number | string | undefined;
  stderr: { write(chunk: string): boolean };
}

let installedCode: number | undefined;
let override: ExitableProcess | undefined;

function target(): ExitableProcess {
  return override ?? (process as unknown as ExitableProcess);
}

/**
 * OMP ends print mode with an explicit `process.exit(code)` after its own
 * cleanup, so `process.exitCode` alone would be overwritten. Wrap `exit` once
 * so a clean 0 becomes `code`; any non-zero code OMP chose is passed through.
 */
export function signalOpenGatesOnExit(code: number, proc: ExitableProcess = target()): void {
  if (code <= 0) return;
  if (installedCode !== undefined) {
    installedCode = code;
    return;
  }
  installedCode = code;
  const original = proc.exit.bind(proc);
  proc.exit = ((requested?: number) => {
    const effective = requested === undefined || requested === 0 ? (installedCode ?? 0) : requested;
    return original(effective);
  }) as ExitableProcess["exit"];
  if (proc.exitCode === undefined || proc.exitCode === 0) proc.exitCode = code;
}

/** Test hook: route stderr/exit to a fake process (undefined restores the real one) and forget any override. */
export function setHeadlessProcessForTests(fake: ExitableProcess | undefined): void {
  override = fake;
  installedCode = undefined;
}

export function renderHeadlessOpenGates(run: PstackRun, report: GateReport, exitCode: number): string {
  const tail = exitCode > 0
    ? `Exit status ${exitCode} signals an unfinished run (set headlessOpenGateExitCode to 0 to disable).`
    : "Exit status unchanged (headlessOpenGateExitCode is 0).";
  const body = report.allowed
    ? "All gates evaluate as passing, but the run was never closed with pstack_gate action=check."
    : renderGateReport(report);
  return [
    `pstack: headless session ended with run ${run.id} (${run.playbook}/${run.ceremony}) still active.`,
    body,
    `Resume with --continue (or --resume) and finish the gates, or abandon the run with a reason. ${tail}`,
  ].join("\n");
}

export function isHeadless(ctx: ExtensionContext): boolean {
  return ctx.hasUI !== true;
}

export function writeStderr(text: string, proc: ExitableProcess = target()): void {
  try {
    proc.stderr.write(text.endsWith("\n") ? text : `${text}\n`);
  } catch {
    // stderr closed: the audit event still records the outcome.
  }
}
