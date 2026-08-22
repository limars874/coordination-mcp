# Coordination

Coordination is a durable shared work-state domain for multiple human and software participants. It preserves current work state, immutable history, and shared content without becoming chat, autonomous execution, or notification delivery.

## Language

### Shared work state

**Scope**:
A stable namespace that isolates one logical coordination space. It groups Tickets, Updates, and Artifacts but is not a project-management object with its own owner, workflow, or permissions.
_Avoid_: project, tenant, workspace

**Participant**:
A human or software actor that reads or writes Coordination state. A participant's label describes provenance and is not an authenticated security identity.
_Avoid_: agent identity, authenticated user

### Work state

**Ticket**:
A unit of work whose current state is worth tracking independently. A Ticket is mutable current state, not historical record or a reliable queue item.
_Avoid_: task message, queue item

**Ticket status**:
The current lifecycle classification of a Ticket. V0.1 uses `open`, `active`, `blocked`, and `done`; clients must tolerate future values.
_Avoid_: queue state, completion acknowledgment

**Update**:
An immutable durable statement about something that happened, was discovered, decided, or reported. An Update is historical work state, not a chat message or editable comment.
_Avoid_: message, comment, event to be edited

**Update type**:
A conventional classification for an Update. V0.1 uses `note`, `result`, `finding`, and `decision`, while allowing future values.
_Avoid_: workflow transition

**Artifact**:
Immutable shared textual content that every participant can retrieve through Coordination. An implementation spec, execution report, architecture proposal, or handoff is a kind of Artifact, not a separate protocol primitive.
_Avoid_: filesystem path, mutable attachment, document version

**Artifact association**:
A stable reference from a Ticket or Update to an Artifact. Associations are cumulative references, not version ordering or a generic relationship graph.
_Avoid_: attachment slot, version chain

### Synchronization

**Sequence (`seq`)**:
The authoritative Scope-local position assigned to an Update for incremental synchronization. It is not an object identifier or timestamp, and it does not need to be contiguous.
_Avoid_: global sequence, creation time, acknowledgment number

**Cursor**:
A participant's record of the highest Update sequence successfully retrieved for a Scope. A cursor does not mean that work is complete, accepted, processed, or reviewed.
_Avoid_: acknowledgment, task status, delivery receipt

**Wake-up**:
A best-effort hint that a Scope may have changed and should be synchronized from the participant's cursor. It is not authoritative Update delivery and correctness must not depend on receiving it.
_Avoid_: notification delivery, message queue

### Provenance and extension

**Provenance (`created_by`)**:
A descriptive label identifying the source that created a Ticket, Update, or Artifact. It supports human understanding but does not provide authentication, authorization, or capability checks.
_Avoid_: account, security principal, session identity

**Metadata (`meta`)**:
Optional extension data carried by a Ticket or Update without changing core Coordination semantics. Unknown metadata must remain safe for clients to ignore.
_Avoid_: hidden workflow state, required domain field

**Relationship**:
A semantic connection between work items that is intentionally not modeled as a generic graph in V0.1. Relationships should first be expressed in Updates, with metadata used only for temporary machine-readable hints.
_Avoid_: dependency edge, parent-child link, graph node

### Content boundary

**Long content**:
Content too large or detailed for a Ticket or short Update. It belongs in an Artifact, while the Ticket or Update keeps the compact coordination statement and reference.
_Avoid_: oversized Ticket body, transcript storage
