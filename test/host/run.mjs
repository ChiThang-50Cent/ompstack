// test/host/run.mjs — run host scenarios against a real OMP binary with the mock LLM.
// Usage: node test/host/run.mjs --omp <bin> [scenario.json ...]   (default: test/host/scenarios/*.json)
import { spawn, execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, "../..");
const argv = process.argv.slice(2);
const take = flag => { const i = argv.indexOf(flag); return i >= 0 ? argv.splice(i, 2)[1] : undefined; };
const ompBin = take("--omp") ?? process.env.PSTACK_OMP_BIN;
if (!ompBin) { console.error("host: pass --omp <bin> or PSTACK_OMP_BIN"); process.exit(2); }
const scenarioDir = path.join(here, "scenarios");
const files = argv.length ? argv : fs.readdirSync(scenarioDir).filter(f => f.endsWith(".json")).sort().map(f => path.join(scenarioDir, f));
const knownFailingFile = path.join(here, "known-failing.json");
const knownFailing = new Set(fs.existsSync(knownFailingFile) ? JSON.parse(fs.readFileSync(knownFailingFile, "utf8")) : []);
const SETUP = { "plugin-link": ctx => run(ompBin, ["plugin", "link", root], ctx) }; // whitelist

const sha256 = f => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
const readJsonl = f => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l)) : []);
const get = (obj, dotted) => dotted.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
const matches = (obj, where) => Object.entries(where ?? {}).every(([k, v]) => JSON.stringify(get(obj, k)) === JSON.stringify(v));
function glob(baseDir, pattern) { // "*" matches within one path segment
  let paths = [baseDir];
  for (const seg of pattern.split("/")) {
    const re = new RegExp("^" + seg.split("*").map(s => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$");
    paths = paths.flatMap(p => (fs.existsSync(p) && fs.statSync(p).isDirectory() ? fs.readdirSync(p).filter(n => re.test(n)).map(n => path.join(p, n)) : []));
  }
  return paths;
}
const freePort = () => new Promise(r => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => r(p)); }); });
function waitExit(child, ms) {
  return new Promise(r => {
    if (child.exitCode !== null) return r({ code: child.exitCode, timedOut: false });
    const t = setTimeout(() => { child.kill("SIGKILL"); r({ code: null, timedOut: true }); }, ms);
    child.on("exit", code => { clearTimeout(t); r({ code, timedOut: false }); });
  });
}
async function waitListening(port, ms = 5000) {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise(r => setTimeout(r, 100))) {
    if (await new Promise(r => { const s = net.connect(port, "127.0.0.1", () => { s.end(); r(true); }); s.on("error", () => r(false)); })) return;
  }
  throw new Error(`mock did not listen on ${port}`);
}
async function run(bin, args, ctx, timeoutSec = 90) {
  const child = spawn(bin, args, { cwd: ctx.ws, env: ctx.env, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  child.stdout.on("data", d => (out += d)); child.stderr.on("data", d => (out += d));
  const r = await waitExit(child, timeoutSec * 1000);
  return { ...r, out };
}

// Every assertion that names a rule first requires that rule to have been hit (no vacuous truth).
function check(a, ctx) {
  const scoped = a.rule ? ctx.log.filter(e => e.rule === a.rule) : ctx.log;
  if (a.rule && scoped.length === 0) return `rule ${a.rule} never hit`;
  const results = scoped.flatMap(e => e.toolResults).join("\n");
  const ok = (cond, msg) => (cond ? null : msg);
  const ws = p => path.join(ctx.ws, p);
  switch (a.type) {
    case "ruleHit": return ok(scoped.length >= (a.min ?? 1), `rule ${a.rule} hit ${scoped.length} < ${a.min ?? 1}`);
    case "toolResultContains": return ok(results.includes(a.text), `no tool result contains ${JSON.stringify(a.text)}`);
    case "toolResultLacks": return ok(!results.includes(a.text), `a tool result contains ${JSON.stringify(a.text)}`);
    case "toolResultMatches": return ok(new RegExp(a.regex).test(results), `no tool result matches /${a.regex}/`);
    case "systemContains": return ok(scoped.some(e => e.system.includes(a.text)), `system lacks ${JSON.stringify(a.text)}`);
    case "systemLacks": return ok(scoped.length > 0 && scoped.every(e => !e.system.includes(a.text)), `system contains ${JSON.stringify(a.text)} (or no requests)`);
    case "userContains": return ok(scoped.some(e => e.user.includes(a.text)), `user messages lack ${JSON.stringify(a.text)}`);
    case "toolsInclude": return ok(scoped.some(e => a.tools.every(t => e.tools.includes(t))), `offered tools lack one of ${a.tools}`);
    case "toolsExclude": return ok(scoped.length > 0 && scoped.every(e => a.tools.every(t => !e.tools.includes(t))), `offered tools include one of ${a.tools} (or no requests)`);
    case "toolsExcludeMatching": return ok(scoped.length > 0 && scoped.every(e => !e.tools.some(t => new RegExp(a.regex).test(t))), `an offered tool matches /${a.regex}/`);
    case "eventsContain": return ok(ctx.events.some(e => e.type === a.event), `no event ${a.event}`);
    case "eventsLack": return ok(ctx.events.every(e => e.type !== a.event), `event ${a.event} present`);
    case "eventWhere": return ok(ctx.events.some(e => e.type === a.event && matches(e, a.where)), `no event ${a.event} with ${JSON.stringify(a.where)}`);
    case "jsonlWhere": { const rows = glob(ctx.ws, a.file).flatMap(readJsonl); return ok(rows.filter(r => matches(r, a.where)).length >= (a.min ?? 1), `${a.file}: <${a.min ?? 1} rows with ${JSON.stringify(a.where)}`); }
    case "jsonWhere": { const docs = glob(ctx.ws, a.file).map(f => JSON.parse(fs.readFileSync(f, "utf8"))); return ok(docs.some(d => matches(d, a.where)), `${a.file}: no document with ${JSON.stringify(a.where)}`); }
    case "fileContains": return ok(fs.existsSync(ws(a.path)) && fs.readFileSync(ws(a.path), "utf8").includes(a.text), `${a.path} lacks ${JSON.stringify(a.text)}`);
    case "fileLacks": return ok(fs.existsSync(ws(a.path)) && !fs.readFileSync(ws(a.path), "utf8").includes(a.text), `${a.path} contains ${JSON.stringify(a.text)}`);
    case "fileUnchanged": return ok(fs.existsSync(ws(a.path)) && sha256(ws(a.path)) === ctx.initialHashes[a.path], `${a.path} changed`);
    case "fileChanged": return ok(!fs.existsSync(ws(a.path)) || sha256(ws(a.path)) !== ctx.initialHashes[a.path], `${a.path} unchanged`);
    case "pathExists": return ok(glob(a.base === "home" ? ctx.home : ctx.ws, a.path).length > 0, `${a.base ?? "ws"}:${a.path} missing`);
    case "pathAbsent": return ok(glob(a.base === "home" ? ctx.home : ctx.ws, a.path).length === 0, `${a.base ?? "ws"}:${a.path} exists`);
    case "outputContains": return ok(ctx.out.includes(a.text), `output lacks ${JSON.stringify(a.text)}`);
    case "gitBranchExists": return ok(execFileSync("git", ["branch", "--list", a.pattern], { cwd: ctx.ws }).toString().trim() !== "", `no branch ${a.pattern}`);
    default: return `unknown assertion type ${a.type}`;
  }
}

let failed = 0;
const rows = [];
for (const file of files) {
  const sc = JSON.parse(fs.readFileSync(file, "utf8"));
  const runs = sc.runs ?? [{ prompt: sc.prompt, mode: sc.mode, ompArgs: sc.ompArgs }];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `pstack-host-${sc.name}-`));
  const home = path.join(tmp, "home"), agentDir = path.join(home, ".omp", "agent"), ws = path.join(tmp, "ws"), log = path.join(tmp, "mock.jsonl");
  fs.mkdirSync(agentDir, { recursive: true }); fs.mkdirSync(ws, { recursive: true });
  const port = await freePort();
  fs.writeFileSync(path.join(agentDir, "models.yml"), `providers:\n  mock:\n    baseUrl: http://127.0.0.1:${port}/v1\n    apiKey: MOCK_KEY\n    api: openai-completions\n    models:\n      - id: mock-1\n        name: Mock One\n        api: openai-completions\n        reasoning: false\n        input: [text]\n        contextWindow: 128000\n        maxTokens: 4096\n      - id: mock-2\n        name: Mock Two\n        api: openai-completions\n        reasoning: false\n        input: [text]\n        contextWindow: 128000\n        maxTokens: 4096\n`);
  if (sc.ompConfig) fs.writeFileSync(path.join(agentDir, "config.yml"), sc.ompConfig);
  execFileSync("git", ["init", "-q"], { cwd: ws });
  execFileSync("git", ["-c", "user.email=host@test", "-c", "user.name=host", "commit", "-q", "--allow-empty", "-m", "init"], { cwd: ws });
  for (const [rel, body] of Object.entries(sc.files ?? { "README.md": "fixture\n" })) { fs.mkdirSync(path.dirname(path.join(ws, rel)), { recursive: true }); fs.writeFileSync(path.join(ws, rel), body); }
  if (sc.commitFiles) execFileSync("sh", ["-c", "git add -A && git -c user.email=host@test -c user.name=host commit -q -m fixtures"], { cwd: ws });
  if (sc.pstackConfig) { fs.mkdirSync(path.join(ws, ".omp"), { recursive: true }); fs.writeFileSync(path.join(ws, ".omp", "pstack.json"), JSON.stringify(sc.pstackConfig)); }
  const initialHashes = Object.fromEntries(Object.keys(sc.files ?? { "README.md": "" }).map(rel => [rel, sha256(path.join(ws, rel))]));
  const scenarioPath = path.join(tmp, "scenario.json");
  fs.writeFileSync(scenarioPath, JSON.stringify({ rules: sc.rules }));
  const env = { ...process.env, HOME: home, PI_CODING_AGENT_DIR: agentDir, MOCK_KEY: "x", NO_PROXY: "127.0.0.1,localhost", no_proxy: "127.0.0.1,localhost" };
  const ctx = { ws, home, env, out: "" };
  const failures = [];
  const mock = spawn(process.execPath, [path.join(here, "mock-llm.mjs")], { env: { ...env, SCENARIO: scenarioPath, PORT: String(port), LOG: log, WS: ws }, stdio: "ignore" });
  try {
    await waitListening(port);
    for (const step of sc.setup ?? []) {
      if (!SETUP[step]) { failures.push(`setup ${step} not whitelisted`); break; }
      const r = await SETUP[step](ctx); ctx.out += r.out;
      if (r.code !== 0) failures.push(`setup ${step} exit ${r.code}`);
    }
    for (const [i, r] of runs.entries()) {
      if (failures.length) break;
      const args = ["--cwd", ws, "--no-session", "--no-title", "--model", "mock/mock-1", ...(sc.loadExtension === false ? [] : ["-e", path.join(root, "src/index.ts")]), ...((r.mode ?? sc.mode) ? ["--pstack-mode", r.mode ?? sc.mode] : []), ...(r.ompArgs ?? sc.ompArgs ?? []), "-p", r.prompt];
      const res = await run(ompBin, args, ctx, sc.timeoutSec ?? 90);
      ctx.out += `\n=== run ${i} ===\n${res.out}`;
      if (res.timedOut) failures.push(`run ${i} timed out`);
      else if (res.code !== 0) failures.push(`run ${i} exited with code ${res.code}`);
    }
  } finally {
    mock.kill("SIGTERM"); await waitExit(mock, 3000);
  }
  const runsDir = path.join(ws, ".omp/pstack/runs");
  Object.assign(ctx, { log: readJsonl(log), initialHashes, events: fs.existsSync(runsDir) ? fs.readdirSync(runsDir).flatMap(d => readJsonl(path.join(runsDir, d, "events.jsonl"))) : [] });
  if (!failures.length) for (const a of sc.assert ?? []) { const f = check(a, ctx); if (f) failures.push(f); }
  const xfail = knownFailing.has(sc.name);
  const status = failures.length ? (xfail ? "XFAIL" : "FAIL") : (xfail ? "XPASS" : "PASS");
  rows.push([sc.name, status, failures.join("; ")]);
  if (status === "FAIL" || status === "XPASS") failed++;
  if (status !== "PASS" || process.env.PSTACK_HOST_KEEP) console.error(`--- ${sc.name} (${status}) kept ${tmp}\n${ctx.out.slice(-1500)}`);
  else fs.rmSync(tmp, { recursive: true, force: true });
}
for (const r of rows) console.log(r.join("\t"));
process.exit(failed ? 1 : 0);
