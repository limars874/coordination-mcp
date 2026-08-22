---
status: accepted
---

# Keep shared long content in immutable Artifacts

Long or detailed shared content is represented by a separate immutable `Artifact` with a stable global ID and scope-bounded references from Tickets or Updates. This is preferred over local filesystem paths or embedding large content in core objects because participants may run in different environments and historical references must remain retrievable; binary content, deletion, and built-in version chains remain outside V0.1.
