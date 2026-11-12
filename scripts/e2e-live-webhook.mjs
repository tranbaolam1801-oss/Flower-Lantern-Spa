#!/usr/bin/env node
// LIVE synthetic SePay webhook checks (authentication + idempotency + audit consistency) against the deployed demo.
//   node scripts/e2e-live-webhook.mjs [baseUrl]
// Needs: the webhook key in %USERPROFILE%\flower-lantern-demo-credentials.txt and MIGRATION_DATABASE_URL (direct Neon URL)
// in the environment for the read/cleanup of synthetic audit rows. Sends NO real payment; ids are in a reserved synthetic range.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = (process.argv[2] ?? 'https://flower-lantern-spa.vercel.app').replace(/\/+$/, '');
const here = path.dirname(fileURLToPath(import.meta.url));
const { Client } = createRequire(path.resolve(here, '../backend/package.json'))('pg');
const creds = readFileSync(path.join(os.homedir(), 'flower-lantern-demo-credentials.txt'), 'utf8');
const KEY = creds.match(/SePay webhook API key[^:]*:\s*(\S+)/)?.[1];
if (!KEY) throw new Error('webhook key not found in the credentials file');
if (!process.env.MIGRATION_DATABASE_URL) throw new Error('MIGRATION_DATABASE_URL is required');

const results = [];
const check = (name, ok, detail = '') => { results.push([name, ok]); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${detail}`}`); };
const post = async (body, headers = {}) => {
  const r = await fetch(`${BASE}/api/payments/sepay/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  let json; try { json = await r.json(); } catch { json = null; }
  return { status: r.status, json };
};
const auth = { authorization: `Apikey ${KEY}` };
const ID = 990000000 + Math.floor(Math.random() * 1000000); // synthetic range
const event = { id: ID, transferType: 'in', transferAmount: 123000, accountNumber: '0000000000', content: 'FLS-DOES-NOT-EXIST synthetic test', gateway: 'TEST', transactionDate: '2026-11-12 10:00:00' };

const db = new Client({ connectionString: process.env.MIGRATION_DATABASE_URL, ssl: { rejectUnauthorized: true } });
await db.connect();
const rows = async (id) => (await db.query("SELECT KetQuaXuLy, MaThanhToan, SoTienNhan::int AS amount FROM dbo.SePayWebhookEvent WHERE NhaCungCap='SEPAY' AND MaGiaoDichNhaCungCap=$1", [String(id)])).rows;

try {
  let r = await post(event);
  check('no Authorization header -> 401', r.status === 401, String(r.status));
  r = await post(event, { authorization: 'Apikey wrong-wrong-wrong-wrong-wrong-wrong-key' });
  check('wrong API key -> 401', r.status === 401, String(r.status));
  r = await post(event, { authorization: `Bearer ${KEY}` });
  check('right key but wrong scheme (Bearer) -> 401', r.status === 401, String(r.status));
  check('rejected requests wrote no audit row', (await rows(ID)).length === 0);

  r = await post(event, auth);
  check('valid key + synthetic transfer with unknown reference -> 200 {"success":true}', r.status === 200 && r.json?.success === true, `${r.status} ${JSON.stringify(r.json)}`);
  let a = await rows(ID);
  check('exactly one audit row, NOT confirmed, no payment attached', a.length === 1 && a[0].ketquaxuly !== 'CONFIRMED' && a[0].mathanhtoan === null, JSON.stringify(a));
  const first = a[0]?.ketquaxuly;

  const replays = await Promise.all([1, 2, 3, 4, 5].map(() => post(event, auth)));
  check('replaying the same transaction id 5x concurrently -> every response 200 (provider will not retry)', replays.every((x) => x.status === 200 && x.json?.success === true), replays.map((x) => x.status).join(','));
  a = await rows(ID);
  check('after 6 deliveries there is still exactly ONE audit row (idempotent)', a.length === 1 && a[0].ketquaxuly === first, JSON.stringify(a));

  const invalidBefore = (await db.query("SELECT count(*)::int n FROM dbo.SePayWebhookEvent WHERE KetQuaXuLy='INVALID_PAYLOAD'")).rows[0].n;
  const badBody = { id: 'not-a-number', transferType: 'in', marker: String(ID) };
  r = await post(badBody, auth);
  const r2 = await post(badBody, auth);
  const invalidAfter = (await db.query("SELECT count(*)::int n FROM dbo.SePayWebhookEvent WHERE KetQuaXuLy='INVALID_PAYLOAD'")).rows[0].n;
  check('authenticated but malformed payload is acknowledged (200) and audited as INVALID_PAYLOAD exactly once, even when re-sent',
    r.status === 200 && r2.status === 200 && invalidAfter - invalidBefore === 1, `${r.status}/${r2.status} audit rows +${invalidAfter - invalidBefore}`);
  const out = { ...event, id: ID + 1, transferType: 'out' };
  r = await post(out, auth);
  const o = await rows(ID + 1);
  check('outgoing transfer is acknowledged but never confirms anything', r.status === 200 && o.every((x) => x.ketquaxuly !== 'CONFIRMED'), `${r.status} ${JSON.stringify(o)}`);

  const pay = (await db.query("SELECT count(*)::int n FROM dbo.ThanhToan WHERE NhaCungCap='SEPAY' AND MaGiaoDichNhaCungCap = ANY($1)", [[String(ID), String(ID + 1)]])).rows[0].n;
  check('no ThanhToan row was created or changed by the synthetic events', pay === 0, String(pay));
  const intent = await fetch(`${BASE}/api/payments/sepay/intent`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-spa-request': '1', origin: BASE }, body: '{}' });
  check('payment intent without a session is refused (401/403)', intent.status === 401 || intent.status === 403, String(intent.status));
  const mock = await fetch(`${BASE}/api/payments/mock/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-spa-request': '1', origin: BASE }, body: '{}' });
  check('mock payment route is not available on the public deployment (401/403/404)', [401, 403, 404].includes(mock.status), String(mock.status));
} catch (e) {
  check('webhook run completed without an exception', false, String(e?.stack ?? e));
} finally {
  await db.query("DELETE FROM dbo.SePayWebhookEvent WHERE NhaCungCap='SEPAY' AND MaGiaoDichNhaCungCap = ANY($1) OR MaGiaoDichNhaCungCap LIKE 'INVALID-%'", [[String(ID), String(ID + 1)]]);
  const left = (await db.query("SELECT count(*)::int n FROM dbo.SePayWebhookEvent")).rows[0].n;
  console.log(`cleanup: synthetic webhook rows removed (SePayWebhookEvent now has ${left} rows)`);
  await db.end();
}
const failed = results.filter(([, ok]) => !ok).length;
console.log(`\nLIVE WEBHOOK ${BASE}: ${results.length - failed}/${results.length} passed${failed ? `, ${failed} FAILED` : ''}`);
process.exit(failed ? 1 : 0);
