---
status: accepted
---

# Use stateless Streamable HTTP for MCP transport

V0.1 exposes the MCP service through stateless Streamable HTTP at `POST /mcp`, with durable Coordination state kept in storage rather than MCP connection or session state. This allows local and tunneled clients to reach the same service without coupling protocol correctness to connection lifetime; stdio and stateful session semantics are deferred until a concrete integration requires them.
