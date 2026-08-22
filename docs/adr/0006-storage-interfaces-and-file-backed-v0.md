---
status: accepted
---

# Isolate storage behind StateStore and ArtifactStore

`CoordinationService` depends on separate `StateStore` and `ArtifactStore` interfaces, with V0.1 using human-readable file-backed adapters in one server process and simple in-process Scope synchronization. This preserves the protocol and service boundary while keeping the first implementation small and inspectable; cross-process file locking, distributed coordination, databases, and dynamic storage plugins are deliberately deferred until real usage justifies them.
