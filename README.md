# ado-v2-mcp

Independent stdio MCP bridge for adov2. It calls a fixed Next.js API origin; it has no DB2 driver, credentials, SQL, arbitrary fetch, or shell tools.

## Status

The tools are read-only and registered per bounded delegated scope: own activity, permitted Activity Log, minimal own-profile status, own assignments, contact search, and queue escalations. Each API request requires a local MCP service token and a short-lived delegated context issued by adov2. Next re-resolves the contact and permissions. Tool mutations are intentionally not exposed.

The bridge is disabled until adov2 and this process are configured with matching service credentials and a current delegated context. The integrated adov2 assistant launches a dedicated stdio child per turn and passes a short-lived, per-user context plus only the scopes granted for that request; it does not share the profile token or `.env.mcp` context. Do not put credentials in source control or chat. Azure URL/API key belong only in the ignored frontend `.env`; never place them in `.env.mcp`. This MCP process has no Azure configuration or DB2 access. `.env.mcp` is ignored; `.env.mcp.example` contains placeholders only.

Available tools are read-only and scope-gated: own activity, Activity Log when its tab, privacy, country, and queue checks pass; minimal own-profile status; own assignments; contact search when `CONTACT_SEARCH` is granted; and queue escalations when `QUEUES_SEARCH` is granted. Tool responses are bounded and minimized by the Next API. No mutation, SQL, arbitrary fetch, or shell tools are registered.

## Setup

```sh
npm ci
cp .env.mcp.example .env.mcp
npm run build
npm start
```

Configure the two tokens privately in adov2 and `.env.mcp`; obtain the user context from the adov2 profile page once enabled. Restart the MCP server when its context expires. The service will not call or notify anyone.

## Checks

```sh
npm test
```

The server uses the official MCP TypeScript SDK v2 and stdio transport. MCP protocol messages use stdout; diagnostics use stderr.
