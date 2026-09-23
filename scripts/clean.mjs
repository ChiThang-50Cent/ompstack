import { readdir, rm } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
for (const entry of ["dist", ".test-dist", ".tmp", "coverage"]) {
  await rm(path.join(root, entry), { recursive: true, force: true });
}
for (const name of await readdir(root)) {
  if (/^pstack-omp-.*\.(?:tgz|zip|tar\.gz)$/.test(name)) {
    await rm(path.join(root, name), { force: true });
  }
}
