---
status: accepted
---

# Synchronize with a Scope-local Update sequence

Coordination uses the server-assigned, monotonically increasing `Update.seq` within each `Scope` as the authoritative incremental synchronization position; `after_seq` is exclusive and sequence gaps are valid. Wake-up signals remain best-effort hints rather than delivery or acknowledgment mechanisms, so participants can recover correctly after lost, duplicated, delayed, or coalesced notifications without turning Coordination into a reliable queue.
