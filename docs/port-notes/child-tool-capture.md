# Child-tool admission capture

Generated from `test/host/scenarios/capture-child-tools.json` and `test/host/scenarios/capture-writer-tools.json` with `node test/host/capture-report.mjs <kept-dir> [writers]`. Each scenario runs against a real OMP binary with `omp plugin link`; writer capture sets `modelRoles.pstack_code: mock/mock-1` and disables task isolation so the probes are observable in the workspace.

## OMP 18.2.11

| Agent | Offered tools |
|---|---|
| pstack-scout | `read, grep, glob, web_search, yield, hub, pstack_status, pstack_fingerprint, pstack_gate, pstack_verdict, write` |
| pstack-architect | `read, grep, glob, web_search, yield, hub, pstack_status, pstack_fingerprint, pstack_gate, pstack_verdict, write` |
| pstack-reviewer | `read, grep, glob, bash, web_search, yield, hub, pstack_status, pstack_fingerprint, pstack_gate, pstack_verdict, write` |
| pstack-judge | `read, grep, glob, yield, pstack_status, pstack_fingerprint, pstack_gate, pstack_verdict, write` |
| pstack-verifier | `read, grep, glob, bash, web_search, eval, yield, hub, pstack_status, pstack_fingerprint, pstack_gate, pstack_verdict, write` |
| pstack-builder | `read, grep, glob, bash, edit, write, yield, hub, pstack_status, pstack_fingerprint, pstack_gate, pstack_verdict` |
| pstack-synthesizer | `read, grep, glob, bash, edit, write, yield, hub, pstack_status, pstack_fingerprint, pstack_gate, pstack_verdict` |

`bash` probes appended `reviewer-BASH`, `verifier-BASH`, `builder-BASH`, and `synthesizer-BASH` to `README.md`. Inspect-only probes returned `Tool bash not found` and `Tool edit not found`. Writer `write` probes created `builder.txt` and `synthesizer.txt`.

## OMP 18.3.0

| Agent | Offered tools |
|---|---|
| pstack-scout | `read, grep, glob, web_search, yield, pstack_status, pstack_fingerprint, pstack_gate, pstack_verdict, write` |
| pstack-architect | `read, grep, glob, web_search, yield, pstack_status, pstack_fingerprint, pstack_gate, pstack_verdict, write` |
| pstack-reviewer | `read, grep, glob, bash, web_search, yield, pstack_status, pstack_fingerprint, pstack_gate, pstack_verdict, write` |
| pstack-judge | `read, grep, glob, yield, pstack_status, pstack_fingerprint, pstack_gate, pstack_verdict, write` |
| pstack-verifier | `read, grep, glob, bash, web_search, eval, yield, pstack_status, pstack_fingerprint, pstack_gate, pstack_verdict, write` |
| pstack-builder | `read, grep, glob, bash, edit, write, yield, pstack_status, pstack_fingerprint, pstack_gate, pstack_verdict` |
| pstack-synthesizer | `read, grep, glob, bash, edit, write, yield, pstack_status, pstack_fingerprint, pstack_gate, pstack_verdict` |

`README.md` and the writer files had the same probe results as 18.2.11. OMP 18.3.0 does not add `hub` to these child tool lists.

## Declared vs offered

| Declared entry before T1.5 | Default child offer | Decision |
|---|---|---|
| `find` | no / no | **remove**; it requires the host `find.enabled` setting and a resolved native judge model, which is not part of the pstack child default |
| `lsp` | no / no | **remove**; child availability depends on `lsp.enabled`, session `enableLsp`, and task LSP inheritance |
| `ast_grep` | no / no | **remove**; the host defaults `astGrep.enabled` to false |
| `browser`, `computer` on verifier | no / no; neither is an AgentTool | **replace** with declared `eval`; use the `browser`/`computer` Eval preludes only when `browser.enabled`/`computer.enabled` is enabled |
| `eval` on verifier | yes / yes | **keep** as the host-supported bridge to those optional Eval preludes |

The agent frontmatter now declares only tools that the capture can offer by default, plus verifier `eval` for the documented prelude path. `scripts/omp-tool-names.json` is the pinned 18.3.0 docs/tool-basename catalog (`oh-my-pi` commit `62bc57b`) plus `yield`; the validator rejects undeclared names outside that catalog.

## Findings

1. OMP enforces agent `tools:` lists. Undeclared tools return `Tool <name> not found` on both versions.
2. pstack tools are offered to children and blocked at call time. Every child request lists `pstack_status`, `pstack_fingerprint`, `pstack_gate`, and `pstack_verdict`; calls fail with `Pstack child agents cannot call parent-state pstack_* tools`.
3. Every child gets `yield` and an `xd://`-only `write`; OMP 18.2.11 additionally gets `hub`, which pstack blocks.
4. Shell-capable reviewer, verifier, builder, and synthesizer agents mutate the workspace through their declared `bash`/writer tools. Reviewer/verifier remain shell-capable rather than read-only.
5. Browser/computer headless interaction was not promoted to a host scenario: the supported declaration is `eval`, while the prelude settings and actual UI target remain project/environment prerequisites.
