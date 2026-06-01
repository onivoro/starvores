# @onivoro/app-server-mcp

Stdio MCP server for the StarVores workspace.

Run locally with:

```sh
npm run mcp:server
```

The server uses stdin/stdout for MCP JSON-RPC traffic. Avoid writing logs to stdout from tools or bootstrap code.
