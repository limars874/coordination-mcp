---
status: accepted
---

# Separate current state, history, and shared content

Coordination models a `Ticket` as mutable current state, an `Update` as immutable history, and an `Artifact` as immutable shared textual content. This separation preserves historical statements and stable content references while allowing current work state to change; a generic editable record or chat/thread model was rejected because it conflates objects with different lifecycles.
