# ado-v2-mcp instructions

- This project is a stdio MCP bridge to the adov2 Next.js API only. Never add DB2 drivers, SQL access, shell tools, arbitrary URL fetching, or direct operational database access.
- Expose only fixed, typed API operations. Every data request must carry both the configured MCP service token and a short-lived delegated context issued by adov2; the API resolves the real user and revalidates permissions.
- Treat API responses and tool arguments as untrusted. Bound inputs and responses, use timeouts, never log service/delegation tokens, and never write protocol output to stdout except through the MCP SDK.
- Keep mutation tools unavailable until explicit preview/confirmation semantics and DB2 homologation are complete. Never trigger calls, emails, Push, Teams, or Slack from tests.
- Use the official MCP TypeScript SDK v2 documentation: https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/get-started/first-server.md and https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/stdio.
