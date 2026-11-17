export type ActivityRequest = {
  kind: "calls" | "acks";
  days: 7 | 30 | 90;
  state: string;
  before?: number | undefined;
};

export type AssistantOperation = "get_my_profile" | "get_my_assignments" | "search_activity_log" | "get_event_diagnostics" | "search_contacts" | "get_queue_escalations" | "get_queue_overview";
const assistantOperations = new Set<AssistantOperation>(["get_my_profile", "get_my_assignments", "search_activity_log", "get_event_diagnostics", "search_contacts", "get_queue_escalations", "get_queue_overview"]);

export class ApiClientError extends Error {
  constructor(message: string) { super(message); this.name = "ApiClientError"; }
}

type Fetcher = typeof fetch;

function apiOrigin(value: string | undefined) {
  if (!value) throw new ApiClientError("API_ORIGIN_REQUIRED");
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new ApiClientError("API_ORIGIN_INVALID"); }
  const local = parsed.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  const prefix = parsed.pathname.replace(/\/$/, "");
  if ((!local && parsed.protocol !== "https:") || parsed.username || parsed.password || !/^(\/[a-z0-9-]+)?$/.test(prefix) || parsed.search || parsed.hash) throw new ApiClientError("API_ORIGIN_INVALID");
  return `${parsed.origin}${prefix}`;
}

export function createApiClient(env: NodeJS.ProcessEnv = process.env, fetcher: Fetcher = fetch) {
  const origin = apiOrigin(env.ADO_V2_API_ORIGIN);
  const serviceToken = env.ADO_V2_MCP_SERVICE_TOKEN || "";
  const contextToken = env.ADO_V2_MCP_CONTEXT_TOKEN || "";

  async function postRead(operation: AssistantOperation, args: Record<string, unknown> = {}) {
    if (!assistantOperations.has(operation) || JSON.stringify(args).length > 4096) throw new ApiClientError("MCP_OPERATION_INVALID");
    if (!/^[A-Za-z0-9_-]{32,512}$/.test(serviceToken) || !/^[A-Za-z0-9_-]{32,512}$/.test(contextToken)) throw new ApiClientError("MCP_CREDENTIALS_REQUIRED");
    const response = await fetcher(`${origin}/api/mcp/assistant`, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(["get_event_diagnostics", "get_queue_overview"].includes(operation) ? 20000 : 10000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceToken}`,
        "X-ADO-Context": contextToken,
      },
      body: JSON.stringify({ operation, args }),
    });
    if (!response.ok) {
      const status = response.status;
      if (status === 401 || status === 403 || status === 410) throw new ApiClientError("DELEGATED_CONTEXT_EXPIRED_OR_FORBIDDEN");
      if (status === 429) throw new ApiClientError("MCP_RATE_LIMITED");
      if (status === 400) throw new ApiClientError("MCP_INPUT_INVALID");
      if (status === 413) throw new ApiClientError("MCP_RANGE_OR_RESULT_LIMIT");
      throw new ApiClientError("ADO_API_UNAVAILABLE");
    }
    const result = await response.json();
    if (JSON.stringify(result).length > 32000) throw new ApiClientError("MCP_RESULT_TOO_LARGE");
    return result as unknown;
  }

  return {
    async getMyActivity(input: ActivityRequest) {
      if (!/^[A-Za-z0-9_-]{32,512}$/.test(serviceToken) || !/^[A-Za-z0-9_-]{32,512}$/.test(contextToken)) throw new ApiClientError("MCP_CREDENTIALS_REQUIRED");
      const response = await fetcher(`${origin}/api/mcp/activity`, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(10000),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceToken}`,
          "X-ADO-Context": contextToken,
        },
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        const status = response.status;
        if (status === 401 || status === 403 || status === 410) throw new ApiClientError("DELEGATED_CONTEXT_EXPIRED_OR_FORBIDDEN");
        if (status === 429) throw new ApiClientError("MCP_RATE_LIMITED");
        throw new ApiClientError("ADO_API_UNAVAILABLE");
      }
      return response.json() as Promise<unknown>;
    },
    getMyProfile() { return postRead("get_my_profile"); },
    getMyAssignments(input: { state: "all" | "active" | "inactive"; before?: number | undefined }) { return postRead("get_my_assignments", input); },
    searchActivityLog(input: { from: string; to: string; country?: number | undefined; customer?: string | undefined; server?: string | undefined; queue?: number | undefined; serial?: number | undefined; state: "all" | "pending" | "acknowledged" }) { return postRead("search_activity_log", input); },
    getEventDiagnostics(input: { serial: number; from?: string | undefined; to?: string | undefined; country?: number | undefined }) { return postRead("get_event_diagnostics", input); },
    searchContacts(input: { field: "email" | "userId" | "mobile" | "extension"; query: string }) { return postRead("search_contacts", input); },
    getQueueEscalations(input: { country?: number | undefined; customer: string; query?: string | undefined }) { return postRead("get_queue_escalations", input); },
    getQueueOverview(input: { query: string; country?: number | undefined; customer?: string | undefined }) { return postRead("get_queue_overview", input); },
  };
}
