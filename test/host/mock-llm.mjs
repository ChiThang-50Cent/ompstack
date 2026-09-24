// test/host/mock-llm.mjs — scripted OpenAI-compatible chat-completions server for OMP host tests.
// Env: SCENARIO (json with {rules}), PORT, LOG (jsonl), WS (workspace root, for mutate steps).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const { rules } = JSON.parse(fs.readFileSync(process.env.SCENARIO, "utf8"));
const port = Number(process.env.PORT || 18080);
const log = process.env.LOG || "/tmp/pstack-mock.jsonl";
const ws = process.env.WS || process.cwd();
const base = { id: "mock", object: "chat.completion.chunk", created: 0, model: "mock-1" };
const text = c => (typeof c === "string" ? c : Array.isArray(c) ? c.map(p => p?.text ?? "").join("") : JSON.stringify(c ?? ""));
const mutated = new Set(); // "ruleId:step" mutations already applied (requests can be retried)

function sse(res, chunks) {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  for (const c of chunks) res.write(`data: ${JSON.stringify(c)}\n\n`);
  res.write("data: [DONE]\n\n");
  res.end();
}
function substitute(value, vars) {
  if (typeof value === "string") return value.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? vars[k] : m));
  if (Array.isArray(value)) return value.map(v => substitute(v, vars));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, substitute(v, vars)]));
  return value;
}
function captureVars(rule, sources) {
  const vars = {};
  for (const c of rule.captures ?? []) {
    const src = c.from === "result" ? sources.toolResults[c.step ?? 0] : sources[c.from];
    const m = src && new RegExp(c.regex).exec(src);
    if (m) vars[c.name] = m[1] ?? m[0];
  }
  return vars;
}
function applyMutation(m) {
  const file = path.join(ws, m.path);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (m.write !== undefined) fs.writeFileSync(file, m.write);
  if (m.append !== undefined) fs.appendFileSync(file, m.append);
}

http.createServer((req, res) => {
  let body = "";
  req.on("data", d => (body += d));
  req.on("end", () => {
    if (req.url.endsWith("/models")) {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ data: [{ id: "mock-1", object: "model" }] }));
    }
    const p = JSON.parse(body || "{}");
    const msgs = p.messages ?? [];
    const system = msgs.filter(m => m.role === "system" || m.role === "developer").map(m => text(m.content)).join("\n");
    const user = msgs.filter(m => m.role === "user").map(m => text(m.content)).join("\n");
    const toolResults = msgs.filter(m => m.role === "tool").map(m => text(m.content));
    const rule = rules.find(r => (!r.matchSystem || system.includes(r.matchSystem)) && (!r.matchUser || user.includes(r.matchUser)));
    const stepIndex = toolResults.length;
    const entry = { rule: rule?.id ?? null, step: stepIndex, tools: (p.tools ?? []).map(t => t.function?.name), system, user, toolResults };
    fs.appendFileSync(log, JSON.stringify(entry) + "\n");
    if (!rule) return sse(res, [{ ...base, choices: [{ index: 0, delta: { role: "assistant", content: "MOCK_NO_RULE" }, finish_reason: "stop" }] }]);
    const vars = captureVars(rule, { system, user, toolResults });
    let step = rule.steps[stepIndex] ?? { final: `MOCK_FINAL\n${toolResults.join("\n---\n")}` };
    if (step.mutate && !mutated.has(`${rule.id}:${stepIndex}`)) { mutated.add(`${rule.id}:${stepIndex}`); for (const m of [].concat(step.mutate)) applyMutation(m); }
    if (step.oneOf) { // version-agnostic step: first alternative whose tool is offered in this request
      const offered = new Set(entry.tools);
      const alt = step.oneOf.find(a => offered.has(a.tool));
      step = alt ? { ...step, ...alt, oneOf: undefined } : { final: `MOCK_NO_ALTERNATIVE ${step.oneOf.map(a => a.tool).join("|")}` };
    }
    if (step.yield !== undefined) step = { tool: "yield", args: { data: step.yield } };
    step = substitute(step, vars);
    if (step.final !== undefined) {
      return sse(res, [
        { ...base, choices: [{ index: 0, delta: { role: "assistant", content: step.final }, finish_reason: null }] },
        { ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
      ]);
    }
    return sse(res, [
      { ...base, choices: [{ index: 0, delta: { role: "assistant", tool_calls: [{ index: 0, id: `call_${rule.id}_${stepIndex}`, type: "function", function: { name: step.tool, arguments: JSON.stringify(step.args ?? {}) } }] }, finish_reason: null }] },
      { ...base, choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] },
    ]);
  });
}).listen(port, "127.0.0.1");
