#!/usr/bin/env node
// REAL browser E2E (headless Chromium) of registration and forgotten-password through the built frontend, served together with the
// REAL API entry (api/index.js) on a real PostgreSQL engine (PGlite). The OTP is read from the in-process MOCK provider outbox
// (a real phone is never contacted). Requires `npm run build` first.
//   node scripts/e2e-local-otp-browser.mjs
import { createRequire } from 'node:module';
import { existsSync, readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'backend/package.json'));
const { PGlite } = await import(pathToFileURL(require.resolve('@electric-sql/pglite')).href);
const { PGLiteSocketServer } = await import(pathToFileURL(require.resolve('@electric-sql/pglite-socket')).href);
const { chromium } = require(path.join(root, 'node_modules/@playwright/test'));

const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${detail}`}`); };

const db = await PGlite.create();
for (const f of ['001-schema.sql']) await db.exec(readFileSync(path.join(root, 'database/postgres', f), 'utf8'));
const dbServer = new PGLiteSocketServer({ db, port: 54342, host: '127.0.0.1' });
await dbServer.start();

Object.assign(process.env, {
  NODE_ENV: 'test', MESSAGING_MOCK: 'true', DATABASE_URL: 'postgres://postgres@127.0.0.1:54342/postgres', DB_SSL: 'disable', DB_POOL_MAX: '1',
  JWT_SECRET: 'e2e-local-secret-not-for-production-use-0123456789', AUTH_SESSION_STORE: 'sql', RATE_LIMIT_ENABLED: 'false', OTP_PEPPER: 'p'.repeat(48),
  OTP_RESEND_COOLDOWN_SECONDS: '60',
});
const handler = require(path.join(root, 'api/index.js'));


// One origin for UI + API (like Vercel): /api/* -> NestJS handler, everything else -> frontend/dist with SPA fallback.
const dist = path.resolve(process.env.AUTH_UI_DIST || path.join(root, 'frontend/dist'));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) return handler(req, res);
  let file = path.join(dist, decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) file = path.join(dist, 'index.html');
  res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
process.env.FRONTEND_ORIGIN = origin;


const {randomBytes}=require('node:crypto');const password=randomBytes(24).toString('hex');const hash=await require('argon2').hash(password,{type:2});
const roles=['Chủ Spa','Quản lý','Nhân viên','Khách hàng'];
await db.query("INSERT INTO dbo.Quyen(MaQuyen,TenQuyen) VALUES('Q01','Test booking permission') ON CONFLICT DO NOTHING");
for(let i=0;i<roles.length;i++){await db.query('INSERT INTO dbo.TaiKhoan(MaTaiKhoan,TenDangNhap,SoDienThoai,MatKhauBam,VaiTro,TrangThai) VALUES($1,$2,$3,$4,$5,$6)',['AUTH'+i,'auth-test-'+i,'094411000'+i,hash,roles[i],'Hoạt động']);if(i<3)await db.query("INSERT INTO dbo.TaiKhoanQuyen VALUES($1,'Q01')",['AUTH'+i]);}
const browser=await chromium.launch({headless:true});const measurements=[];
try{for(let i=0;i<roles.length;i++){const context=await browser.newContext();const page=await context.newPage();const authRequests=[];page.on('requestfinished',r=>{if(r.url().includes('/api/auth/')){const t=r.timing();authRequests.push({path:new URL(r.url()).pathname,ms:Math.round(t.responseEnd-t.startTime+t.startTime)});}});await page.goto(origin+'/dang-nhap');await page.locator('#phone').fill('094411000'+i);await page.locator('#password').fill(password);const start=Date.now();const response=page.waitForResponse(r=>r.url().endsWith('/api/auth/login'));await page.locator('button[type=submit]').click();const res=await response;if(res.status()!==200)throw Error('Login failed '+res.status());const target=i===3?'/lich-hen-cua-toi':'/admin/lich-hen';await page.waitForURL('**'+target);await page.locator(i===3?'.customer-header':'.admin-header').waitFor();const navigationMs=Date.now()-start;const copied=(await context.cookies()).find(c=>c.name==='access_token');if(!copied?.httpOnly)throw Error('Cookie not HttpOnly');await page.reload();await page.locator(i===3?'.customer-header':'.admin-header').waitFor();if((await context.request.get(origin+'/api/auth/me')).status()!==200)throw Error('Reload session failed');await page.getByLabel('Tài khoản',{exact:true}).click();await page.getByRole('button',{name:'Đăng xuất',exact:true}).click();await page.waitForURL('**/dang-nhap');const replay=await context.request.get(origin+'/api/auth/me',{headers:{Cookie:'access_token='+copied.value}});if(replay.status()!==401)throw Error('Logout replay allowed');const result={role:roles[i],navigationMs,authRequests};measurements.push(result);console.log('PASS real-stack '+JSON.stringify(result));await context.close();}writeFileSync(path.join(root,'test-results/auth-real-stack-'+(process.env.AUTH_RUN_LABEL||'after')+'.json'),JSON.stringify(measurements,null,2));}finally{await browser.close();server.close();await dbServer.stop();}process.exit(0);
