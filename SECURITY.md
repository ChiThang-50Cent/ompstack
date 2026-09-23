# Security policy

## Supported versions

The 0.1.x line is the current development line. Security fixes are applied to the newest published 0.1.x release unless a later support policy states otherwise.

## Reporting a vulnerability

Do not include secrets, production credentials, private transcripts, or customer data in a public report. Provide a minimal redacted reproduction containing:

- OMP version and plugin version/commit;
- operating system and installation method;
- pstack mode and relevant configuration;
- event/task sequence;
- expected and observed state/gate behavior;
- whether the issue depends on a provider/model;
- redacted audit entries and artifact fingerprint metadata.

Until a private disclosure channel is configured for the eventual repository owner, keep sensitive reports private to that owner rather than opening a public issue with exploitable details.

## Scope

Examples in scope:

- child agents mutating or impersonating parent pstack state;
- stale artifacts satisfying a PASS gate;
- writer/verifier provenance bypass;
- background tasks being treated as complete while still running;
- unsafe package/install behavior introduced by this plugin;
- secret leakage caused by audit or evidence handling.

Pstack-OMP is not a process/container sandbox. Executing untrusted repository code, malicious dependencies, provider compromise, and OMP host compromise remain outside the plugin's isolation guarantees. See `docs/security-model.md`.
