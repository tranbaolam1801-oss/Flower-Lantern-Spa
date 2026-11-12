// Structural + behavioural test of the n8n workflow. Run: node --test n8n/workflow.test.mjs
// n8n itself is NOT started here (it is a large install and has no free 24/7 host); instead the test (1) validates the
// exported workflow JSON the way n8n would load it, and (2) replays the exact HTTP request that the "Dispatch" node is
// configured to send against a local fake of the NestJS endpoint, proving the method/URL path/auth header/body are right.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import { test } from 'node:test';

const wf = JSON.parse(readFileSync(new URL('./flower-lantern-notification-dispatch.json', import.meta.url), 'utf8'));
const node = (name) => wf.nodes.find((n) => n.name === name);

test('workflow is well-formed and inactive until imported and enabled deliberately', () => {
  assert.equal(wf.active, false);
  assert.equal(wf.settings.timezone, 'Asia/Ho_Chi_Minh');
  const ids = wf.nodes.map((n) => n.id);
  assert.equal(new Set(ids).size, ids.length, 'node ids are unique');
  for (const [from, outs] of Object.entries(wf.connections)) {
    assert.ok(node(from), `connection source exists: ${from}`);
    for (const group of outs.main) for (const c of group) assert.ok(node(c.node), `connection target exists: ${c.node}`);
  }
});

test('schedule runs every minute and feeds the dispatch call', () => {
  const t = node('Every minute');
  assert.equal(t.type, 'n8n-nodes-base.scheduleTrigger');
  assert.deepEqual(t.parameters.rule.interval, [{ field: 'minutes', minutesInterval: 1 }]);
  assert.equal(wf.connections['Every minute'].main[0][0].node, 'Dispatch due notifications');
});

test('dispatch node targets the internal endpoint with header auth, retries and a timeout', () => {
  const n = node('Dispatch due notifications');
  assert.equal(n.parameters.method, 'POST');
  assert.match(n.parameters.url, /^https:\/\/[^/]+\/api\/internal\/notifications\/dispatch$/);
  assert.equal(n.parameters.authentication, 'genericCredentialType');
  assert.equal(n.parameters.genericAuthType, 'httpHeaderAuth');
  assert.equal(n.retryOnFail, true);
  assert.ok(n.maxTries >= 2);
  assert.ok(n.parameters.options.timeout <= 60000);
  assert.deepEqual(JSON.parse(n.parameters.jsonBody), { limit: 25 });
});

test('no secret, token or key is embedded in the exported workflow', () => {
  const text = JSON.stringify(wf);
  assert.doesNotMatch(text, /Bearer\s+[A-Za-z0-9_-]{16,}/);
  assert.doesNotMatch(text, /[0-9a-f]{40,}/i);
  assert.doesNotMatch(text, /access_token|refresh_token|postgres:\/\//i);
  assert.equal(node('Dispatch due notifications').credentials.httpHeaderAuth.id, 'REPLACE_AFTER_IMPORT');
});

test('the configured request works against a fake endpoint: right path, Bearer header, JSON body, response routing', async () => {
  const key = 'k'.repeat(40);
  const seen = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, body: JSON.parse(body) });
      const ok = req.headers.authorization === `Bearer ${key}`;
      res.writeHead(ok ? 200 : 401, { 'content-type': 'application/json' });
      res.end(JSON.stringify(ok ? { claimed: 3, sent: 2, retried: 0, failed: 1, skipped: 0 } : { message: 'Unauthorized' }));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const n = node('Dispatch due notifications');
    const path = new URL(n.parameters.url).pathname;
    // what n8n sends for Header Auth "Authorization: Bearer <key>"
    const ok = await fetch(base + path, { method: n.parameters.method, headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: n.parameters.jsonBody });
    const json = await ok.json();
    assert.equal(ok.status, 200);
    assert.deepEqual(seen[0], { method: 'POST', url: '/api/internal/notifications/dispatch', auth: `Bearer ${key}`, body: { limit: 25 } });
    // the IF node routes to the alert branch exactly when failed > 0
    const cond = node('Any failed jobs?').parameters.conditions.conditions[0];
    assert.equal(cond.leftValue, '={{ $json.failed }}');
    assert.equal(cond.operator.operation, 'gt');
    assert.equal(json.failed > cond.rightValue, true);
    const bad = await fetch(base + path, { method: 'POST', headers: { authorization: 'Bearer wrong' }, body: '{}' });
    assert.equal(bad.status, 401);
  } finally {
    server.close();
  }
});
