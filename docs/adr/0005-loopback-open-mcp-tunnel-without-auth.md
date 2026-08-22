---
status: accepted
---

# Keep V0.1 behind loopback and Open MCP Tunnel without authentication

The Coordination server listens only on `127.0.0.1:<port>`, local participants connect directly, and ChatGPT reaches the same `/mcp` endpoint through Open MCP Tunnel. V0.1 intentionally implements no authentication or authorization: this avoids direct public Internet exposure and keeps the initial deployment small, while accepting that anyone who can reach the tunnel endpoint may write state; direct public exposure of the Node service is not allowed.
