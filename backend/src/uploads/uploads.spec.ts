import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { AppModule } from '../app.module';
import { DatabaseService } from '../database.service';
import { setup, parseTrustProxy } from '../setup';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { isSafeImage } from '../admin-services/admin-services.dto';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32, 2)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(16, 3)]);
const ROUTE = '/api/admin/services/image';
const H = { 'X-Spa-Request': '1' };

async function makeApp(allowGuards: boolean) {
  let builder = Test.createTestingModule({ imports: [AppModule] }).overrideProvider(DatabaseService).useValue({ query: jest.fn() });
  if (allowGuards) builder = builder.overrideGuard(AuthGuard).useValue({ canActivate: () => true }).overrideGuard(RolesGuard).useValue({ canActivate: () => true });
  const app = (await builder.compile()).createNestApplication();
  setup(app);
  await app.init();
  return app;
}

describe('service image upload (test-only database/guard doubles)', () => {
  let dir: string; let app: INestApplication; let denied: INestApplication;
  beforeAll(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'spa-up-'));
    process.env.UPLOAD_DIR = dir;
    app = await makeApp(true); denied = await makeApp(false);
  });
  afterAll(async () => { await app.close(); await denied.close(); delete process.env.UPLOAD_DIR; rmSync(dir, { recursive: true, force: true }); });

  it.each([['image/png', PNG, 'png'], ['image/jpeg', JPG, 'jpg'], ['image/webp', WEBP, 'webp']])('accepts %s, names the file itself and serves it back', async (type, bytes, ext) => {
    const res = await request(app.getHttpServer()).post(ROUTE).set(H).set('Content-Type', type).set('X-File-Name', '../../evil.php').send(bytes).expect(201);
    expect(res.body.path).toMatch(new RegExp(`^/api/uploads/services/[a-f0-9]{32}\\.${ext}$`));
    expect(isSafeImage(res.body.path)).toBe(true);
    const got = await request(app.getHttpServer()).get(res.body.path).expect(200);
    expect(got.headers['content-type']).toContain(type);
    expect(got.headers['x-content-type-options']).toBe('nosniff');
    expect(got.headers['cache-control']).toContain('max-age');
  });
  it('rejects wrong magic bytes and header/bytes mismatch', async () => {
    await request(app.getHttpServer()).post(ROUTE).set(H).set('Content-Type', 'image/png').send(Buffer.from('not an image at all')).expect(400);
    await request(app.getHttpServer()).post(ROUTE).set(H).set('Content-Type', 'image/jpeg').send(PNG).expect(400);
  });
  it('rejects other content types with 415 and JSON bodies', async () => {
    await request(app.getHttpServer()).post(ROUTE).set(H).set('Content-Type', 'image/svg+xml').send('<svg/>').expect(415);
    await request(app.getHttpServer()).post(ROUTE).set(H).send({ a: 1 }).expect(415);
  });
  it('rejects oversize bodies with 413', async () => {
    await request(app.getHttpServer()).post(ROUTE).set(H).set('Content-Type', 'image/png').send(Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)])).expect(413);
  });
  it('requires the CSRF header', async () => {
    await request(app.getHttpServer()).post(ROUTE).set('Content-Type', 'image/png').send(PNG).expect(403);
  });
  it('requires authentication', async () => {
    await request(denied.getHttpServer()).post(ROUTE).set(H).set('Content-Type', 'image/png').send(PNG).expect(401);
  });
  it('rejects traversal and malformed names on GET', async () => {
    for (const p of ['/api/uploads/services/..%2f..%2fpackage.json', '/api/uploads/services/evil.png', `/api/uploads/services/${'a'.repeat(32)}.svg`, `/api/uploads/services/${'a'.repeat(32)}.png`])
      await request(app.getHttpServer()).get(p).expect(404);
  });
  it('JSON routes still work', async () => {
    await request(app.getHttpServer()).post('/api/auth/login').set(H).send({}).expect(400);
  });
  it('parses TRUST_PROXY', () => {
    expect([parseTrustProxy(undefined), parseTrustProxy('false'), parseTrustProxy('1'), parseTrustProxy('true'), parseTrustProxy('loopback')]).toEqual([undefined, undefined, 1, true, 'loopback']);
  });
});

describe('rate limiting wiring', () => {
  it('login returns 429 + Retry-After after the limit', async () => {
    process.env.RATE_LIMIT_LOGIN_PER_WINDOW = '2';
    const app = await makeApp(true);
    try {
      for (let i = 0; i < 2; i++) await request(app.getHttpServer()).post('/api/auth/login').set(H).send({});
      const res = await request(app.getHttpServer()).post('/api/auth/login').set(H).send({}).expect(429);
      expect(res.headers['retry-after']).toBeDefined();
      expect(res.body.message).toBe('Bạn thao tác quá nhanh. Vui lòng thử lại sau!');
    } finally { delete process.env.RATE_LIMIT_LOGIN_PER_WINDOW; await app.close(); }
  });
  it('webhook is limited and does not block below the limit', async () => {
    process.env.RATE_LIMIT_WEBHOOK_PER_WINDOW = '2';
    const app = await makeApp(true);
    try {
      const codes: number[] = [];
      for (let i = 0; i < 3; i++) codes.push((await request(app.getHttpServer()).post('/api/payments/sepay/webhook').send({})).status);
      expect(codes[0]).not.toBe(429); expect(codes[1]).not.toBe(429); expect(codes[2]).toBe(429);
    } finally { delete process.env.RATE_LIMIT_WEBHOOK_PER_WINDOW; await app.close(); }
  });
});
