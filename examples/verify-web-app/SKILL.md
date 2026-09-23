---
name: verify-example-web-app
description: Example pstack verification adapter for a local browser application. Replace scripts, selectors, and fixtures with repository-specific evidence.
---
# Verify the web application

## Scope

Verify user-visible behavior in a local disposable environment through the browser surface. Build/lint/unit tests are supporting checks only.

## Preconditions

- Dependency manager and version are determined from the repository lockfile.
- Test API/database endpoints are disposable.
- Browser relay/computer tool is available when the flow requires it.
- Test account contains no production personal data.

## Start

Use repository-native commands. Example only:

```bash
mkdir -p .omp/pstack/artifacts
npm ci
npm run dev -- --host 127.0.0.1 --port 14173 \
  >.omp/pstack/artifacts/web.log 2>&1 &
echo $! >.omp/pstack/artifacts/web.pid
```

Readiness:

```bash
for i in $(seq 1 60); do
  curl -fsS http://127.0.0.1:14173/ >/dev/null && break
  sleep 1
done
curl -fsS http://127.0.0.1:14173/ >/dev/null
```

## Fixture setup

Prefer an existing seed script or test API. Make setup idempotent and record identifiers. Never use production credentials merely because they are available in the shell.

## Browser surface

For every required criterion:

1. state starting URL and fixture;
2. perform user actions through browser/computer tooling;
3. assert visible state, accessibility/DOM state where appropriate, and relevant network/API result;
4. capture a screenshot only when it proves a visual/state claim;
5. preserve console/network errors relevant to the flow;
6. repeat the original regression path if this is a bug fix.

Example reset flow observations:

```text
- reset link loads the intended account flow;
- valid submission shows success;
- the same token cannot be reused;
- previous authenticated session becomes invalid when required;
- keyboard/focus/error behavior remains usable.
```

Do not infer backend success solely from a toast.

## Supporting checks

Use repository commands, for example:

```bash
npm run typecheck
npm test -- --runInBand
npm run build
```

A build is not a substitute for browser behavior.

## Evidence

Store in `.omp/pstack/artifacts/`:

- startup log;
- screenshot(s) with descriptive names;
- browser/network trace or request summary;
- console log excerpt;
- test/build output;
- fixture identifiers with secrets removed.

Record claims with `pstack_evidence`. Compute a fingerprint before and after testing. If the dev server generates source artifacts, include them in the final target and rerun affected observations.

## Cleanup

```bash
if [ -f .omp/pstack/artifacts/web.pid ]; then
  kill "$(cat .omp/pstack/artifacts/web.pid)" 2>/dev/null || true
  rm -f .omp/pstack/artifacts/web.pid
fi
```

Remove only fixtures created by this run.

## Limitations

Return `INCONCLUSIVE` when the required browser/control surface, external identity provider sandbox, or safe fixture environment is unavailable. Name exactly which acceptance criteria remain unobserved.
