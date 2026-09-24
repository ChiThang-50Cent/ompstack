# ompstack remediation progress

Commit SHAs are not recorded here; find a task's commit with `git log --grep='^Task: T0.1$' --format=%h`.

### T0.1 Pin upstream sources {#t01}
- Status: done
- Files: `scripts/fetch-upstream.sh`, `.gitignore`, `docs/port-notes/progress.md`
- Proof:
  - `sh scripts/fetch-upstream.sh` (first run) → `pinned …/.upstream/cursor-plugins at 12d587d`, `pinned …/.upstream/oh-my-pi at 62bc57b`
  - `sh scripts/fetch-upstream.sh` (second run) → same two lines, exit 0
  - `npm run check` → `# pass 42`, `# fail 0`, `Router corpus passed: 33/33 cases.`, `Asset validation passed (7 agents, 16 playbooks, 12 operators, 23 principles, 33 eval cases).`
- Sources read: none
- Decisions: none
- Deviations from spec: none
- Open questions: none

### T0.2 Host OMP resolver {#t02}
- Status: done
- Files: `scripts/lib/resolve-omp.sh`, `test/resolve-omp.test.mjs`
- Proof:
  - `npm run check` → `ok … resolve_omp skips node_modules/.bin and returns the host omp`, `ok … resolve_omp honors PSTACK_OMP_BIN`, `# pass 44`, `# fail 0`
- Sources read: none
- Decisions: none
- Deviations from spec: none
- Open questions: none
