# Coordination MCP Implementation Architecture V0.1 Draft

**Status:** Draft  
**Version:** 0.1  
**Related protocol:** `COORDINATION_PROTOCOL_V0.1.md`

## 1. Purpose

This document records the initial implementation architecture for Coordination MCP.

The protocol specification and implementation architecture are intentionally separate:

- `COORDINATION_PROTOCOL_V0.1.md` defines externally meaningful coordination semantics.
- This document defines the initial technical implementation and deployment choices.
- Storage, runtime, transport, and deployment choices MAY evolve without changing the protocol where possible.

The implementation should remain smaller and easier to maintain than the coordination friction it removes.

---

## 2. Initial technology choices

### Runtime

```text
Node.js 24 LTS
```

### Language

```text
TypeScript
ESM
```

Reasons:

- mature and predictable Node.js runtime;
- strong compatibility with the TypeScript MCP ecosystem;
- same general stack as Local Files MCP;
- no project requirement currently benefits materially from Python, Bun, or Deno;
- modern Node provides the required HTTP, filesystem, crypto, streams, and async primitives without a large dependency stack.

The implementation SHOULD target modern Node rather than carrying compatibility code for old Node versions.

---

## 3. MCP transport

V0.1 uses:

```text
Stateless Streamable HTTP
```

The intended endpoint is:

```text
POST /mcp
```

The MCP transport layer should remain stateless.

Durable state belongs in Coordination storage, not in MCP connection/session state.

V0.1 does not need a second stdio transport unless a concrete future integration requires it.

---

## 4. Network topology

The Coordination server runs locally and listens only on loopback:

```text
127.0.0.1:<port>
```

Local agents connect directly:

```text
Local AI
   |
   | HTTP localhost
   v
Coordination MCP
```

ChatGPT reaches the same server through a secure tunnel:

```text
ChatGPT
   |
   | HTTPS
   v
Secure Tunnel
   |
   v
127.0.0.1:<port>/mcp
   |
   v
Coordination MCP
```

Both paths reach the same Coordination process and the same persistent state.

### V0.1 deployment decision

Prefer:

```text
local server + secure tunnel
```

over:

```text
direct public Internet exposure
```

This avoids making domains, public hosting, TLS termination, reverse proxies, and Internet-facing server administration part of the initial Coordination implementation.

The tunnel is a deployment concern.

Coordination core logic MUST NOT depend on a specific tunnel provider.

A future deployment MAY move the same MCP server behind a normal public HTTPS endpoint without changing the Coordination protocol.

---

## 5. High-level architecture

```text
                 MCP / HTTP
                     |
                     v
             CoordinationService
                /          \
               /            \
              v              v
        StateStore       ArtifactStore
```

The service layer owns Coordination semantics.

Storage implementations own persistence mechanics.

The MCP layer should remain thin and primarily:

1. validate tool input;
2. call `CoordinationService`;
3. translate results/errors into MCP responses.

---

## 6. Storage abstraction

V0.1 should introduce storage interfaces from the beginning.

This is a deliberately small abstraction, not a dynamic plugin framework.

Conceptually:

```ts
interface StateStore {
  createTicket(...)
  getTicket(...)
  listTickets(...)
  updateTicket(...)

  addUpdate(...)
  listUpdates(...)
}

interface ArtifactStore {
  createArtifact(...)
  getArtifact(...)
}
```

Construction can use ordinary dependency injection:

```ts
new CoordinationService({
  stateStore,
  artifactStore,
})
```

Do not introduce:

```text
plugin registries
dynamic adapter discovery
runtime plugin loading
adapter marketplaces
generic storage DSLs
```

until a real use case requires them.

---

## 7. Why StateStore and ArtifactStore are separate

Ticket/Update state and Artifact content have different storage characteristics.

State:

```text
Ticket  -> small mutable structured object
Update  -> small immutable append-only structured record
```

Artifact:

```text
immutable shared textual content
```

Keeping Artifact storage separate permits combinations such as:

```text
FileStateStore + FileArtifactStore
SQLiteStateStore + FileArtifactStore
SQLiteStateStore + SQLiteArtifactStore
SQLiteStateStore + future remote ArtifactStore
```

without changing protocol semantics.

---

## 8. V0.1 file-backed storage

The first implementation should use local human-readable files.

Suggested conceptual layout:

```text
data/
  scopes/
    <scope>/
      tickets/
        T-....json
        T-....json

      updates.jsonl

      artifacts/
        ...
```

Exact internal filenames and metadata layout are implementation details and are not part of the protocol.

---

## 9. Ticket persistence

Each Ticket is stored independently as JSON.

Example:

```text
tickets/T-123.json
```

This matches Ticket semantics:

```text
small
structured
mutable current state
```

Ticket updates should use:

```text
write temporary file
        |
        v
atomic rename/replace
```

rather than overwriting the target file in place.

This reduces the chance of leaving partially written JSON after interruption.

---

## 10. Update persistence

Updates are immutable and append-only.

Each Scope therefore uses an append-only JSONL stream:

```text
updates.jsonl
```

Conceptually:

```json
{"id":"U-1","seq":1,"ticket_id":"T-1","type":"result"}
{"id":"U-2","seq":2,"ticket_id":"T-1","type":"finding"}
{"id":"U-3","seq":3,"type":"decision"}
```

For the expected V0.1 scale, `list_updates(after_seq)` MAY scan the JSONL file directly.

Do not introduce indexing until actual usage demonstrates a need.

---

## 11. Artifact persistence

Artifacts are:

```text
immutable
text-oriented
globally uniquely identified
append-only
```

The first `FileArtifactStore` should store Artifact content as ordinary local files.

Metadata MAY be stored separately if useful.

The exact representation is internal to `FileArtifactStore`.

For example, an implementation could use:

```text
artifacts/
  A-123
  A-123.meta.json
```

or an equivalent simple layout.

The service layer MUST NOT depend on filesystem extensions or paths.

It should only know:

```text
createArtifact(...)
getArtifact(id)
```

This permits future ArtifactStore implementations backed by SQLite, object storage, or another persistence mechanism.

---

## 12. File storage support boundary

`FileStateStore` V0.1 supports:

> One Coordination server process accessing its data directory.

Multi-process or multi-host concurrent access to the same FileStateStore is explicitly unsupported.

Do not implement:

```text
cross-process file locking
distributed locking
network filesystem coordination
leader election
```

for V0.1.

If multi-process storage becomes necessary, prefer a storage adapter designed for that requirement.

---

## 13. Concurrency model

Expected write concurrency is extremely low.

V0.1 should use simple in-process synchronization.

Conceptually:

```text
Map<scope, Mutex>
```

A single global mutex would also be acceptable initially, but per-Scope locking keeps unrelated scopes independent at very little conceptual cost.

No external queue or distributed lock is required.

---

## 14. Update sequence allocation

`Update.seq` is:

```text
monotonically increasing within a Scope
```

It does NOT need to be contiguous.

Gaps are allowed.

Example:

```text
100
101
103
```

is valid.

This avoids unnecessary transactional complexity around failed writes.

### Source of truth

For FileStateStore:

```text
updates.jsonl
```

is the durable source of truth for persisted Update sequences.

Do not maintain a second persistent `latest_seq` file unless a demonstrated performance requirement justifies it.

At startup, FileStateStore can recover the latest persisted sequence from Update storage.

During runtime it may keep the current value in memory.

### Write path

Conceptually:

```text
lock(scope)

nextSeq = latestSeq + 1
construct Update
append Update to updates.jsonl

if append succeeds:
    latestSeq = nextSeq
    return success

unlock(scope)
```

An append failure MUST NOT be reported as success.

A failed allocation MAY create a sequence gap if implementation details require it.

Protocol correctness does not depend on contiguous sequence numbers.

---

## 15. Ticket concurrency

Ticket writes should occur under the appropriate in-process lock.

A simple V0.1 model is acceptable:

```text
serialized write
+
last-write-wins
```

The protocol does not currently require optimistic concurrency control, revisions, CAS, or ETags.

Artifact associations should preferably use append semantics internally so two participants adding Artifacts do not accidentally replace each other's associations.

---

## 16. Artifact concurrency

Artifact IDs are globally unique and Artifact content is immutable.

Creation therefore has minimal coordination requirements:

```text
generate unique ID
write temporary content
atomically publish final Artifact
```

Existing Artifact content is never modified.

---

## 17. Future storage adapters

The architecture deliberately permits future adapters such as:

```text
StateStore
  FileStateStore
  SQLiteStateStore
  future database-backed stores

ArtifactStore
  FileArtifactStore
  SQLiteArtifactStore
  future object/remote stores
```

These are extension possibilities, not V0.1 implementation requirements.

V0.1 should implement only the storage adapters actually needed to run the system.

---

## 18. Wake-up integration

The Coordination Protocol defines a Wake-up Contract:

```text
scope
latest_seq
```

V0.1 server implementation does not need to implement agent-specific wake-up adapters.

Future integrations may include agent-specific mechanisms, but they remain outside the durable state model.

The authoritative recovery path remains:

```text
list_updates(scope, after_seq=local_cursor)
```

Wake-up is only a hint to resynchronize.

---

## 19. Authentication

Authentication is a deployment concern that still needs to be finalized against the actual ChatGPT MCP/tunnel integration used during implementation.

V0.1 should avoid prematurely building a large authentication subsystem.

In particular, do not introduce OAuth solely because it may be useful in a future multi-user deployment.

The chosen deployment MUST nevertheless avoid exposing an unauthenticated writable Coordination MCP endpoint to the public Internet.

---

## 20. Explicit implementation non-goals

Do not add to V0.1 without demonstrated need:

```text
multiple MCP transports
public hosting platform
reverse proxy management
dynamic storage plugins
cross-process FileStateStore locking
distributed locks
message queues
database migrations framework
ORM
workflow engine
background workers
agent runtime framework
wake-up adapters
binary Artifact storage
search indexes
full-text search
vector search
artifact garbage collection
```

---

## 21. Initial implementation stack

The initial implementation target is therefore:

```text
Runtime
  Node.js 24 LTS

Language
  TypeScript
  ESM

MCP
  Streamable HTTP
  stateless
  /mcp

Network
  listen on 127.0.0.1
  Local AI -> localhost
  ChatGPT -> secure tunnel -> localhost

Service
  CoordinationService

Persistence abstraction
  StateStore
  ArtifactStore

V0 persistence
  FileStateStore
    Ticket -> JSON
    Update -> per-Scope JSONL

  FileArtifactStore
    immutable text files

Concurrency
  single process
  in-memory per-Scope mutex
  atomic filesystem writes

Update ordering
  Scope-local monotonic seq
  gaps allowed
  Update storage is persistent source of truth

Wake-up
  protocol contract only
  no agent-specific adapter yet
```

---

## 22. Architecture principle

The implementation should preserve one important boundary:

> Coordination semantics belong above storage; persistence mechanics belong below them.

Changing:

```text
FileStateStore -> SQLiteStateStore
```

or:

```text
FileArtifactStore -> another ArtifactStore
```

should not require changing the MCP protocol or the meaning of Ticket, Update, Artifact, Scope, or `seq`.

The V0.1 architecture should stay deliberately boring: one process, one HTTP endpoint, simple files, simple locks, explicit interfaces, and no infrastructure that has not yet earned its complexity.
