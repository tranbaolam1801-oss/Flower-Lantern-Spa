#!/usr/bin/env node
// Applies ONE reviewed SQL file to a PostgreSQL database (Neon). Used for database/postgres/001-schema.sql and
// the demo catalog. NOT run automatically; every write needs explicit approval from the project owner.
//
//   node scripts/pg-apply.mjs <file.sql>            -> DRY-RUN: prints the target host/database and the file size, opens NO connection
//   node scripts/pg-apply.mjs <file.sql> --apply    -> executes the file (requires all guards below)
//
// Guards for --apply:
//   MIGRATION_DATABASE_URL   the DIRECT (non-pooler) Neon URL, supplied via the environment (never a CLI argument, never stored)
//   ALLOW_DB_WRITE=yes       explicit acknowledgement
//   host must NOT contain "-pooler" (schema scripts belong on the direct endpoint)
//   TLS is always verified.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.resolve(here, '../backend/package.json'));
const { Client } = require('pg');

const file = process.argv[2];
const apply = process.argv.includes('--apply');
const fail = (m) => { console.error(`REFUSED: ${m}`); process.exit(1); };

if (!file || file.startsWith('--')) fail('usage: node scripts/pg-apply.mjs <file.sql> [--apply]');
const sql = readFileSync(path.resolve(file), 'utf8');
const url = process.env.MIGRATION_DATABASE_URL?.trim();
let target = '(MIGRATION_DATABASE_URL not set)';
if (url) {
  let u;
  try { u = new URL(url); } catch { fail('MIGRATION_DATABASE_URL is not a valid URL'); }
  if (!/^postgres(ql)?:$/.test(u.protocol)) fail('MIGRATION_DATABASE_URL must be a postgres:// URL');
  target = `${u.hostname}${u.pathname}`; // host + database only: user and password are never printed
}

console.log(`File: ${file} (${sql.length} chars)\nTarget: ${target}\nMode: ${apply ? 'APPLY' : 'DRY-RUN (no connection opened)'}`);
if (!apply) {
  console.log('To apply: set MIGRATION_DATABASE_URL (direct URL) and ALLOW_DB_WRITE=yes, then pass --apply.');
  process.exit(0);
}

if (!url) fail('MIGRATION_DATABASE_URL is required.');
if (process.env.ALLOW_DB_WRITE !== 'yes') fail('ALLOW_DB_WRITE=yes is required.');
if (new URL(url).hostname.includes('-pooler')) fail('use the DIRECT Neon URL (host without "-pooler") for schema scripts.');

const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: true }, connectionTimeoutMillis: 30000 });
await client.connect();
try {
  await client.query(sql);
  const t = await client.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='dbo'");
  console.log(`OK. Tables in schema dbo: ${t.rows[0].n}`);
} finally {
  await client.end();
}
