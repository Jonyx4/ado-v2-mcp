import { config as loadEnv } from "dotenv";
loadEnv({ path: process.env.ADO_V2_MCP_ENV_FILE || ".env.mcp", quiet: true });
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { ApiClientError, createApiClient } from "./api-client.js";

function createServer() {
  const server = new McpServer({ name: "ado-v2-mcp", version: "0.1.0" });
  const allowedScopes = new Set(["activity.read", "activity.search", "profile.read", "assignments.read", "contacts.search", "configuration.read"]);
  const scopes = new Set((process.env.ADO_V2_MCP_SCOPES || "activity.read").split(",").filter((scope) => allowedScopes.has(scope)));
  if (scopes.has("activity.read")) server.registerTool(
    "get_my_activity", {
      title: "Get my ADO activity",
      description: "Read the authenticated user's own ADO calls or ACK history through adov2. Results remain limited to the delegated user and current API permissions. No operational writes or notifications are performed.",
      inputSchema: z.object({
        kind: z.enum(["calls", "acks"]),
        days: z.union([z.literal(7), z.literal(30), z.literal(90)]),
        state: z.string().max(32).default("all"),
        before: z.number().int().positive().max(2147483647).optional(),
      }).strict(),
    },
    async (input) => {
      try {
        const result = await createApiClient().getMyActivity(input);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (error) {
        const message = error instanceof ApiClientError ? error.message : "MCP_REQUEST_FAILED";
        return { content: [{ type: "text", text: message }], isError: true };
      }
    },
  );
  if (scopes.has("activity.search")) server.registerTool("search_activity_log", {
    title: "Search permitted Activity Log",
    description: "Read events under the user's current Activity Log, privacy-policy, country, and queue permissions. Filters are bounded to 31 days; the response hides contact details and ACK actor.",
    inputSchema: z.object({
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      country: z.number().int().positive().optional(),
      customer: z.string().max(16).optional(),
      server: z.string().max(64).optional(),
      queue: z.number().int().positive().optional(),
      serial: z.number().int().positive().optional(),
      state: z.enum(["all", "pending", "acknowledged"]).default("all"),
    }).strict(),
  }, async (input) => {
    try { return { content: [{ type: "text", text: JSON.stringify(await createApiClient().searchActivityLog(input)) }] }; }
    catch (error) { return { content: [{ type: "text", text: error instanceof ApiClientError ? error.message : "MCP_REQUEST_FAILED" }], isError: true }; }
  });
  if (scopes.has("activity.search")) server.registerTool("get_event_diagnostics", {
    title: "Investigate an authorized event",
    description: "Investigate an event by serial alone. Omit country and dates unless the user specifies them: Next defaults to the user's country and last 30 days ending today. Ranges cannot exceed 31 inclusive days. Returns authorized DB2 ACK/attempt evidence plus up to two Infobip logs when enabled; hides contact values, credentials and digits. Missing logs are not proof of failure; provider retention is 48 hours. No writes.",
    inputSchema: z.object({
      serial: z.number().int().positive().max(2147483647),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      country: z.number().int().positive().max(2147483647).optional(),
    }).strict(),
  }, async (input) => {
    try { return { content: [{ type: "text", text: JSON.stringify(await createApiClient().getEventDiagnostics(input)) }] }; }
    catch (error) { return { content: [{ type: "text", text: error instanceof ApiClientError ? error.message : "MCP_REQUEST_FAILED" }], isError: true }; }
  });
  if (scopes.has("profile.read")) server.registerTool("get_my_profile", {
    title: "Get my profile status",
    description: "Read the authenticated user's own non-contact profile status and verification flags through adov2.",
    inputSchema: z.object({}).strict(),
  }, async () => {
    try { return { content: [{ type: "text", text: JSON.stringify(await createApiClient().getMyProfile()) }] }; }
    catch (error) { return { content: [{ type: "text", text: error instanceof ApiClientError ? error.message : "MCP_REQUEST_FAILED" }], isError: true }; }
  });
  if (scopes.has("assignments.read")) server.registerTool("get_my_assignments", {
    title: "Get my assignments",
    description: "Read the authenticated user's own queue, role, escalation, and schedule assignments through adov2.",
    inputSchema: z.object({ state: z.enum(["all", "active", "inactive"]).default("all"), before: z.number().int().positive().max(2147483647).optional() }).strict(),
  }, async (input) => {
    try { return { content: [{ type: "text", text: JSON.stringify(await createApiClient().getMyAssignments(input)) }] }; }
    catch (error) { return { content: [{ type: "text", text: error instanceof ApiClientError ? error.message : "MCP_REQUEST_FAILED" }], isError: true }; }
  });
  if (scopes.has("contacts.search")) server.registerTool("search_contacts", {
    title: "Search contacts",
    description: "Search contacts by exact identifier. Available only when current CONTACT_SEARCH and country permissions allow it; the response hides email and phone values.",
    inputSchema: z.object({ field: z.enum(["email", "userId", "mobile", "extension"]), query: z.string().min(2).max(254) }).strict(),
  }, async (input) => {
    try { return { content: [{ type: "text", text: JSON.stringify(await createApiClient().searchContacts(input)) }] }; }
    catch (error) { return { content: [{ type: "text", text: error instanceof ApiClientError ? error.message : "MCP_REQUEST_FAILED" }], isError: true }; }
  });
  if (scopes.has("configuration.read")) server.registerTool("get_queue_escalations", {
    title: "Get queue escalation rules",
    description: "Read escalation levels for a customer and country within current queue permissions. Does not expose contact data or make changes.",
    inputSchema: z.object({ country: z.number().int().positive().optional(), customer: z.string().min(1).max(16), query: z.string().max(80).optional() }).strict(),
  }, async (input) => {
    try { return { content: [{ type: "text", text: JSON.stringify(await createApiClient().getQueueEscalations(input)) }] }; }
    catch (error) { return { content: [{ type: "text", text: error instanceof ApiClientError ? error.message : "MCP_REQUEST_FAILED" }], isError: true }; }
  });
  if (scopes.has("configuration.read")) server.registerTool("get_queue_overview", {
    title: "Get queue contacts and escalation matrix",
    description: "Find a queue by its exact name across authorized customers (e.g. VENTANAS), defaulting to the user's country. Returns its resolved customer, state, four escalation levels with role names and assigned contacts grouped with roles/schedules when contacts.search and CONTACT_SEARCH permit. Does not expose emails, phones or credentials. If ambiguous, ask which returned customer; not-found means only no exact authorized match, not global absence. Never pass a queue name as a customer code to get_queue_escalations.",
    inputSchema: z.object({
      query: z.string().trim().min(2).max(64),
      country: z.number().int().positive().max(2147483647).optional(),
      customer: z.string().min(1).max(16).optional(),
    }).strict(),
  }, async (input) => {
    try { return { content: [{ type: "text", text: JSON.stringify(await createApiClient().getQueueOverview(input)) }] }; }
    catch (error) { return { content: [{ type: "text", text: error instanceof ApiClientError ? error.message : "MCP_REQUEST_FAILED" }], isError: true }; }
  });
  return server;
}

try {
  serveStdio(createServer);
} catch (error) {
  const message = error instanceof Error ? error.message : "MCP_START_FAILED";
  console.error(`[ado-v2-mcp] ${message}`);
  process.exitCode = 1;
}
