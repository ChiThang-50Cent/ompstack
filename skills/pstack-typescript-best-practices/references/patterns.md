# TypeScript patterns

Code examples for each rule in `SKILL.md`. The underlying principles are language-agnostic. See the `type-system-discipline` and `boundary-discipline` principle skills.

## Branded types

Brand primitives so they cannot be mixed up. Validate once at the boundary. Downstream code trusts the type.

```ts
type AgentId = string & { readonly __brand: "AgentId" };

function parseAgentId(input: string): AgentId {
  if (!isUUID(input)) throw new Error(`Invalid agent id: ${input}`);
  return input as AgentId;
}

function focusAgent(id: AgentId): void {
  /* input is trusted */
}
```

Match the `readonly __brand: 'X'` shape. Do not invent a new convention.

## Discriminated unions

Model variants with a literal discriminant. Every variant shares the field name and each variant's value is unique, so impossible combinations cannot be represented.

```ts
// Do not. Boolean plus optionals lets contradictory states exist.
type DiffState = { loading: boolean; diff?: GitDiff; error?: string };

// Do. Only valid states exist.
type DiffState =
  | { kind: "loading" }
  | { kind: "ready"; diff: GitDiff }
  | { kind: "error"; error: string };
```

Pick one discriminant name such as `kind`, `type`, or `tag` and keep it consistent.

## Constructive modeling

Build the type from parts that are all legal instead of restricting a loose type with runtime checks.

Non-empty, via a variadic tuple:

```ts
type NonEmpty<T> = [T, ...T[]];

// Do not. T[] plus a length check every caller must repeat.
function pickWinner(entries: string[]): string {
  if (entries.length === 0) throw new Error("no entries");
  return entries[Math.floor(Math.random() * entries.length)];
}

// Do. An empty value of the type cannot exist.
function pickWinner(entries: NonEmpty<string>): string {
  return entries[Math.floor(Math.random() * entries.length)];
}
```

When a plain `T[]` arrives, narrow once with a guard. The fact then travels in the type:

```ts
const isNonEmpty = <T>(arr: T[]): arr is NonEmpty<T> => arr.length > 0;
```

Even length, as pairs:

```ts
type Pairs<T> = [T, T][];
```

A time range, as start plus duration:

```ts
// Do not. A comment holds the invariant.
type TimeRange = { start: Date; end: Date }; // start <= end

// Do. A negative range cannot be written. Derive end when needed.
type TimeRange = { start: Date; durationMs: number };
```

Keep `durationMs` a plain number. Brand it, per branded types, only if a raw number could be passed where a duration is expected. Pick the representation that makes the bad state unconstructable, then expose the reading you need on top, such as `pairs.flat()` or a `rangeEnd()` helper.

## Simplest total type

Do not strengthen everything. Keep `T[]` when every operation on it is total:

```ts
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0); // [] is 0, fine
```

Strengthen when the loose type forces a lie at a use site. The tells are `!`, `arr[0] as T`, and a “should never happen” throw:

```ts
// Do not. Partiality is smuggled past the compiler.
function newestSession(sessions: Session[]): Session {
  return sessions.at(0)!;
}

// Do. Strengthen the input. The assertion disappears.
function newestSession(sessions: NonEmpty<Session>): Session {
  return sessions[0];
}
```

Weakening the result to `Session | undefined` is the other total signature.

## `unknown` over `any`

External data is always `unknown`. Narrow before use.

```ts
// Do not.
function handle(input: any) {
  return input.foo.bar;
}

// Do.
function handle(input: unknown) {
  if (typeof input === "object" && input !== null && "foo" in input) {
    // narrowed; the compiler verifies access
  }
}
```

External sources include RPC payloads, `JSON.parse`, `postMessage`, IPC, file contents, environment variables, and database results.

## Schemas before hand-rolled guards

Before writing a property-by-property type guard for external data, look for the repository's runtime schema library and existing schemas. Let one schema own validation and derive the TypeScript type from it. Do not maintain a schema, a duplicate interface, and a guard that can drift apart.

```ts
import { z } from "zod";

const UserSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(["admin", "member"]),
});

type User = z.infer<typeof UserSchema>;

function parseUser(input: unknown): User {
  return UserSchema.parse(input);
}
```

Use `safeParse` when failure is an expected branch. Use the equivalent inference helper when the repository uses another schema library. Do not add a schema dependency for one guard. Prefer the schema system the codebase already trusts.

## No `as` casts

Every `as` is a potential runtime crash. Cast only after the type system has verified the claim.

```ts
// Do not.
const user = data as User;

// Do. Earn the cast at the boundary.
function parseUser(data: unknown): User {
  if (typeof data !== "object" || data === null) {
    throw new Error("expected object");
  }
  if (!("id" in data) || typeof (data as Record<string, unknown>).id !== "string") {
    throw new Error("expected id");
  }
  // Validate all fields before returning.
  return data as User; // OK only after full validation
}
```

When refactoring an `as` out of existing code, identify why TypeScript cannot infer:

- Missing discriminant: add one and switch to a discriminated union.
- Overly wide source type, such as `Record<string, unknown>`: narrow it.
- Untyped boundary: add a parse function or schema.
- Genuinely inexpressible fact: use a branded type or `satisfies`.

## Narrowing hierarchy

From best to last resort:

1. **Discriminated union switch or if.** The compiler narrows automatically.
2. **`in` operator.** `"key" in obj` narrows to variants containing that key.
3. **`typeof` or `instanceof`.** Use them for primitives and class instances.
4. **User-defined type guard.** Use one when the above are not enough.
5. **`as` cast.** Use one only after validation.

```ts
function area(s: Shape): number {
  if ("radius" in s) return Math.PI * s.radius ** 2; // narrowed to circle
  return s.width * s.height; // narrowed to rect
}
```

## Type guards

A guard must actually verify the claim. A lying guard is worse than `as`.

```ts
function isCircle(s: Shape): s is Shape & { kind: "circle" } {
  return s.kind === "circle";
}
```

Prefer discriminant narrowing when possible.

## Exhaustiveness

In default arms, assign the discriminant to a `never`-typed local.

```ts
// Value-returning switch.
function area(s: Shape): number {
  switch (s.kind) {
    case "circle":
      return Math.PI * s.radius ** 2;
    case "rect":
      return s.width * s.height;
    default: {
      const _exhaustive: never = s;
      return _exhaustive;
    }
  }
}

// Void switch.
function handle(s: Shape): void {
  switch (s.kind) {
    case "circle":
      drawCircle(s);
      break;
    case "rect":
      drawRect(s);
      break;
    default: {
      const _exhaustive: never = s;
      void _exhaustive;
    }
  }
}
```

Use return-style in value-returning switches and void-style in statement switches.

## `satisfies` over `as`

`satisfies` validates without widening literal types.

```ts
// Do not. This widens and loses literal types.
const config = { theme: "dark", cols: 3 } as Config;

// Do. This validates and preserves literal types.
const config = { theme: "dark", cols: 3 } satisfies Config;
// config.theme is "dark", a literal, not string
```

## Boundary validation

Validate once where data crosses in. Trust types inside. See the `boundary-discipline` principle skill.

- **Wire formats** such as proto and JSON-RPC: parse with `ignoreUnknownFields` so forward-compatible changes do not break old clients.
- **Persisted JSON:** use a versioned blob with a try/catch around the parse.
- **Do not re-validate** deep in call chains.

## Schema-derived types

When a `.proto`, OpenAPI spec, GraphQL schema, or database migration already defines a shape, derive from generated types instead of duplicating them.

```ts
// Do not. The shape drifts when the schema changes.
type CheckSummary = {
  totalCount: number;
  checks: { name: string; status: string }[];
};
function renderChecks(s: CheckSummary) {
  /* ... */
}

// Do. Derive from the generated schema type.
import type { ChecksMessage } from "<generated module>";
function renderChecks(s: Pick<ChecksMessage, "totalCount" | "checks">) {
  /* ... */
}
```

Reach for `Pick`, `Omit`, `Parameters`, `ReturnType`, `Awaited`, and `typeof` before writing a new interface.

## Object args

```ts
// Do not. Swapping two arguments still compiles.
openFile(uri, {
  startLineNumber: 10,
  startColumn: 1,
  endLineNumber: 10,
  endColumn: 1,
});

// Do. This is order-independent and self-documenting.
openFile({
  uri,
  selection: {
    startLineNumber: 10,
    startColumn: 1,
    endLineNumber: 10,
    endColumn: 1,
  },
});
```

Skip object arguments on hot paths such as per-frame rendering, tokenizers, parsers, and any tight loop where allocation cost matters.
