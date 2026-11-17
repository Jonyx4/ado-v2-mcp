import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiClientError, createApiClient } from '../dist/api-client.js';

const env = { ADO_V2_API_ORIGIN: 'http://localhost:3100', ADO_V2_MCP_SERVICE_TOKEN: 's'.repeat(43), ADO_V2_MCP_CONTEXT_TOKEN: 'c'.repeat(43) };

test('client uses only the fixed adov2 activity endpoint and binds service plus delegated context', async () => {
  let request;
  const api = createApiClient(env, async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  assert.deepEqual(await api.getMyActivity({ kind: 'acks', days: 30, state: 'all' }), { items: [] });
  assert.equal(request.url, 'http://localhost:3100/api/mcp/activity');
  assert.equal(request.options.redirect, 'error');
  assert.equal(request.options.headers.Authorization, `Bearer ${env.ADO_V2_MCP_SERVICE_TOKEN}`);
  assert.equal(request.options.headers['X-ADO-Context'], env.ADO_V2_MCP_CONTEXT_TOKEN);
  assert.deepEqual(JSON.parse(request.options.body), { kind: 'acks', days: 30, state: 'all' });
});

test('client keeps a single-segment API base path and rejects nested or query paths', async () => {
  let url;
  const api = createApiClient({ ...env, ADO_V2_API_ORIGIN: 'http://127.0.0.1:3100/v2' }, async (target) => {
    url = target;
    return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  await api.getMyActivity({ kind: 'calls', days: 7, state: 'all' });
  assert.equal(url, 'http://127.0.0.1:3100/v2/api/mcp/activity');
  for (const value of ['http://localhost:3100/v2/x', 'http://localhost:3100/v2?x=1']) {
    assert.throws(() => createApiClient({ ...env, ADO_V2_API_ORIGIN: value }), { message: 'API_ORIGIN_INVALID' });
  }
});

test('client rejects insecure non-local origins, missing tokens and API error details', async () => {
  assert.throws(() => createApiClient({ ...env, ADO_V2_API_ORIGIN: 'http://example.invalid' }), { message: 'API_ORIGIN_INVALID' });
  const missing = createApiClient({ ADO_V2_API_ORIGIN: env.ADO_V2_API_ORIGIN });
  await assert.rejects(() => missing.getMyActivity({ kind: 'calls', days: 7, state: 'all' }), { message: 'MCP_CREDENTIALS_REQUIRED' });
  const rejected = createApiClient(env, async () => new Response('{"error":"SECRET_DETAIL"}', { status: 503 }));
  await assert.rejects(() => rejected.getMyActivity({ kind: 'calls', days: 7, state: 'all' }), { message: 'ADO_API_UNAVAILABLE' });
});

test('assistant input and range errors preserve safe actionable codes without forwarding private error bodies', async () => {
  for (const [status, message] of [[400, 'MCP_INPUT_INVALID'], [413, 'MCP_RANGE_OR_RESULT_LIMIT']]) {
    const api = createApiClient(env, async () => new Response('{"error":"private-detail"}', { status }));
    await assert.rejects(() => api.getEventDiagnostics({ serial: 322802, from: '2026-01-01', to: '2026-11-13' }), { message });
  }
});

test('assistant tools use the fixed private Next BFF with typed, bounded operation payloads', async () => {
  const requests = [];
  const api = createApiClient(env, async (url, options) => {
    requests.push({ url, options });
    return new Response('{"items":[]}', { status: 200 });
  });
  await api.getMyProfile();
  await api.getMyAssignments({ state: 'active' });
  await api.searchContacts({ field: 'userId', query: 'AB1234' });
  await api.getQueueEscalations({ customer: 'abc' });
  await api.searchActivityLog({ from: '2026-11-01', to: '2026-11-06', state: 'all' });
  await api.getEventDiagnostics({ serial: 322802, from: '2026-11-05', to: '2026-11-12' });
  await api.getQueueOverview({ query: 'VENTANAS' });
  assert.equal(requests.length, 7);
  for (const request of requests) {
    assert.equal(request.url, 'http://localhost:3100/api/mcp/assistant');
    assert.equal(request.options.redirect, 'error');
    assert.equal(request.options.headers.Authorization, `Bearer ${env.ADO_V2_MCP_SERVICE_TOKEN}`);
    assert.equal(request.options.headers['X-ADO-Context'], env.ADO_V2_MCP_CONTEXT_TOKEN);
  }
  assert.deepEqual(JSON.parse(requests[0].options.body), { operation: 'get_my_profile', args: {} });
  assert.deepEqual(JSON.parse(requests[3].options.body), { operation: 'get_queue_escalations', args: { customer: 'abc' } });
  assert.deepEqual(JSON.parse(requests[4].options.body), { operation: 'search_activity_log', args: { from: '2026-11-01', to: '2026-11-06', state: 'all' } });
  assert.deepEqual(JSON.parse(requests[5].options.body), { operation: 'get_event_diagnostics', args: { serial: 322802, from: '2026-11-05', to: '2026-11-12' } });
  assert.deepEqual(JSON.parse(requests[6].options.body), { operation: 'get_queue_overview', args: { query: 'VENTANAS' } });
  await assert.rejects(() => api.searchContacts({ field: 'userId', query: 'x'.repeat(5000) }), { message: 'MCP_OPERATION_INVALID' });
});
