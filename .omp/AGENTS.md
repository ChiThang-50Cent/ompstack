# Ompstack project guidance

This file is native OMP project context for work in this repository. It is not a plugin runtime surface.

- Treat skills, commands, custom agents, routing policy, validation scripts, and evaluation fixtures as plugin-behavior changes. Run `bun run check` and affected tests.
- Before publishing, run `bun test tests`; keep `package.json` and `.omp-plugin/marketplace.json` versions aligned and bind the marketplace source to the release tag's dereferenced commit SHA.
- Do not add local logs, benchmark candidates, research exports, `node_modules`, or `.omp/audit/` artifacts to release commits.
- Every `git push` is a release: increment the version, update `.omp-plugin/marketplace.json` with the matching version, `v<version>` ref, and dereferenced release-commit SHA, create an annotated `v<version>` tag on that commit, then push both the branch and tag.
- Before every `git push`, run `git status --short`; remove, archive, or add ignore coverage for generated artifacts and abandoned local experiments. Do not push while unexplained files remain.
- Do not claim empirical policy results from synthetic evaluator fixtures or fake-OMP tests.
