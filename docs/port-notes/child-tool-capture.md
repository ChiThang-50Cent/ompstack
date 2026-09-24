# Child-tool admission capture

Generated from `test/host/scenarios/capture-child-tools.json` with `node test/host/capture-report.mjs <kept dir>`. The scenario spawns every non-writer pstack agent through `omp plugin link`; each child first calls `bash` (`echo <agent>-BASH >> README.md`), then `edit` on `README.md`, then yields a schema-valid payload. The scenario asserts these outcomes automatically; this document records the raw tables.

## OMP 18.2.11

| Agent | Offered tools | `bash` probe | `edit` probe |
|---|---|---|---|
| pstack-scout | read, grep, glob, web_search, yield, hub, pstack_status, pstack_fingerprint, pstack_gate, pstack_verdict, write | Tool bash not found | Tool edit not found |
| pstack-architect | read, grep, glob, web_search, yield, hub, pstack_status, pstack_fingerprint, pstack_gate, pstack_verdict, write | Tool bash not found | Tool edit not found |
| pstack-reviewer | read, grep, glob, bash, web_search, yield, hub, pstack_status, pstack_fingerprint, pstack_gate, pstack_verdict, write | (no output) | Tool edit not found |
| pstack-judge | read, grep, glob, yield, pstack_status, pstack_fingerprint, pstack_gate, pstack_verdict, write | Tool bash not found | Tool edit not found |
| pstack-verifier | read, grep, glob, bash, web_search, yield, hub, pstack_status, pstack_fingerprint, pstack_gate, pstack_verdict, write | (no output) | Tool edit not found |

README.md after run:

```
fixture
reviewer-BASH
verifier-BASH
```

## OMP 18.3.0

| Agent | Offered tools | `bash` probe | `edit` probe |
|---|---|---|---|
| pstack-scout | read, grep, glob, web_search, yield, pstack_status, pstack_fingerprint, pstack_gate, pstack_verdict, write | Tool bash not found | Tool edit not found |
| pstack-architect | read, grep, glob, web_search, yield, pstack_status, pstack_fingerprint, pstack_gate, pstack_verdict, write | Tool bash not found | Tool edit not found |
| pstack-reviewer | read, grep, glob, bash, web_search, yield, pstack_status, pstack_fingerprint, pstack_gate, pstack_verdict, write | (no output) | Tool edit not found |
| pstack-judge | read, grep, glob, yield, pstack_status, pstack_fingerprint, pstack_gate, pstack_verdict, write | Tool bash not found | Tool edit not found |
| pstack-verifier | read, grep, glob, bash, web_search, yield, pstack_status, pstack_fingerprint, pstack_gate, pstack_verdict, write | (no output) | Tool edit not found |

README.md after run:

```
fixture
reviewer-BASH
verifier-BASH
```

## Findings

1. **OMP enforces agent `tools:` lists.** Undeclared tools return `Tool <name> not found` on both versions. pstack does not need its own deny matrix (decision D-CHILD).
2. **pstack tools are offered to children and blocked at call time.** Every child request lists `pstack_status`, `pstack_fingerprint`, `pstack_gate`, `pstack_verdict`; calls (including `write xd://pstack_*` device calls, see `child-xd-guard`) fail with `Pstack child agents cannot call parent-state pstack_* tools` (decision D-EXPOSE).
3. **Every child also gets `yield` and an `xd://`-only `write`.** 18.2.11 children additionally get `hub`, which pstack blocks.
4. **Shell-capable agents mutate the workspace.** `pstack-reviewer` and `pstack-verifier` declare `bash`; their probes appended to `README.md` on both versions. Detection relies on the artifact fingerprint gate (`VERDICT_STALE`, see `verifier-stale`).
5. **Declared tools the host never offers** (BUG-8, resolved in T1.5):

   | Tool | Declared by | Offered to children on 18.2.11 / 18.3.0 |
   |---|---|---|
   | `find` | all seven agents | no / no |
   | `lsp` | all except judge | no / no |
   | `ast_grep` | scout, architect, reviewer, builder, synthesizer | no / no |
   | `browser`, `computer` | verifier | no / no |

   Writers (builder, synthesizer) are not part of this capture; their `find`/`lsp`/`ast_grep` entries are listed from frontmatter and must be re-checked in T1.5.
