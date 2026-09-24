# MCP runtime lifecycle

MCP availability is a property of the active parent OMP session. An operator MUST inspect the tools exposed to that session before claiming that a category was searched.

## Operator contract

1. The parent inventories exposed MCP servers, tools, schemas, and resources at the start of an investigation.
2. The parent assigns each available source to one evidence category and records ambiguous mappings.
3. A missing or unauthenticated MCP is an explicit gap. The operator does not invent a result or silently substitute a different source.
4. Parent-owned MCP work stays in the parent session. Child agents receive only the evidence slice and tools declared by their agent contract.
5. Child findings are evidence for the parent; they do not mutate MCP configuration, pstack state, or repository files.

This boundary is why `pstack-why` runs repository/code and in-repository incident searches through `pstack-scout` items, while MCP-backed categories are queried by the parent using the tools actually exposed in that session.
