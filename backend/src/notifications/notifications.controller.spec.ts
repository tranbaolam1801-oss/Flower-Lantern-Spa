import 'reflect-metadata';
import * as nodeCrypto from 'node:crypto';
import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { InternalApiGuard } from './internal-api.guard';
import { NotificationDispatcherService } from './notification-dispatcher.service';
import { NotificationsController } from './notifications.controller';

jest.mock('node:crypto', () => {
  const actual = jest.requireActual('node:crypto');
  return { ...actual, timingSafeEqual: jest.fn(actual.timingSafeEqual) };
});

const KEY = 'k'.repeat(16) + 'Z'.repeat(16) + '0123';
const ROUTE = '/api/internal/notifications/dispatch';
const SUMMARY = { claimed: 3, sent: 2, retried: 1, failed: 0, skipped: 0 };

describe('POST /api/internal/notifications/dispatch (internal API key, test-only dispatcher double)', () => {
  let app: INestApplication;
  const dispatcher = { dispatch: jest.fn() };
  let errorLog: jest.SpyInstance;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [InternalApiGuard, { provide: NotificationDispatcherService, useValue: dispatcher }],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  afterAll(async () => { await app.close(); delete process.env.INTERNAL_API_KEY; });
  beforeEach(() => {
    process.env.INTERNAL_API_KEY = KEY;
    dispatcher.dispatch.mockResolvedValue(SUMMARY);
    errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => { errorLog.mockRestore(); });

  it('accepts the correct key, returns 200 with the summary and uses the default limit', async () => {
    await request(app.getHttpServer()).post(ROUTE).set('Authorization', `Bearer ${KEY}`).expect(200).expect(SUMMARY);
    expect(dispatcher.dispatch).toHaveBeenCalledWith(25);
  });

  it('passes a validated limit and rejects out-of-range or unknown fields', async () => {
    await request(app.getHttpServer()).post(ROUTE).set('Authorization', `Bearer ${KEY}`).send({ limit: 100 }).expect(200);
    expect(dispatcher.dispatch).toHaveBeenLastCalledWith(100);
    for (const body of [{ limit: 101 }, { limit: 0 }, { limit: 1.5 }, { limit: 'x' }, { other: 1 }]) {
      await request(app.getHttpServer()).post(ROUTE).set('Authorization', `Bearer ${KEY}`).send(body).expect(400);
    }
  });

  it.each([
    ['no header', undefined],
    ['wrong key of equal length', `Bearer ${'x'.repeat(KEY.length)}`],
    ['wrong key of different length', 'Bearer short'],
    ['key prefix', `Bearer ${KEY.slice(0, -1)}`],
    ['key with suffix', `Bearer ${KEY}x`],
    ['no Bearer scheme', KEY],
    ['empty bearer', 'Bearer '],
  ])('rejects %s with 401 and never dispatches', async (_name, header) => {
    const req = request(app.getHttpServer()).post(ROUTE);
    await (header === undefined ? req : req.set('Authorization', header)).expect(401);
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it('compares equal-length SHA-256 digests with crypto.timingSafeEqual', async () => {
    const spy = nodeCrypto.timingSafeEqual as unknown as jest.Mock;
    spy.mockClear();
    await request(app.getHttpServer()).post(ROUTE).set('Authorization', 'Bearer a').expect(401);
    await request(app.getHttpServer()).post(ROUTE).set('Authorization', `Bearer ${KEY}`).expect(200);
    expect(spy).toHaveBeenCalledTimes(2);
    for (const [a, b] of spy.mock.calls) { expect((a as Buffer).length).toBe(32); expect((b as Buffer).length).toBe(32); }
  });

  it.each([['unset', undefined], ['empty', ''], ['31 characters', 'k'.repeat(31)]])('rejects every call when INTERNAL_API_KEY is %s and logs without the secret', async (_name, value) => {
    if (value === undefined) delete process.env.INTERNAL_API_KEY; else process.env.INTERNAL_API_KEY = value;
    await request(app.getHttpServer()).post(ROUTE).set('Authorization', `Bearer ${value ?? ''}`).expect(401);
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalled();
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain('kkkkkkkk');
  });
});
