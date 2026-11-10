import 'reflect-metadata';
import { INestApplication, ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../app.module';
import { DatabaseService } from '../database.service';
import { setup } from '../setup';
import { AuthService } from './auth.service';
import { JwtTokenService } from './jwt-token.service';

describe('Auth HTTP security (explicit SQL double)', () => {
  let app: INestApplication;
  const user = { id: 'TKTEST0001', username: 'test', phone: '0999990001', role: 'Nhân viên', fullName: 'Test', permissions: [] };
  const auth = { login: jest.fn(), getMe: jest.fn() };
  const jwt = new JwtTokenService();
  const previous = process.env.JWT_SECRET;
  beforeAll(async () => {
    process.env.JWT_SECRET = randomBytes(32).toString('hex');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DatabaseService).useValue({ query: jest.fn() })
      .overrideProvider(AuthService).useValue(auth).compile();
    app = module.createNestApplication(); setup(app); await app.init();
  });
  afterAll(async () => { await app.close(); if (previous === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previous; });
  beforeEach(() => { auth.login.mockReset(); auth.getMe.mockReset(); });
  it('rejects missing CSRF header and foreign origin before authentication', async () => {
    await request(app.getHttpServer()).post('/api/auth/login').send({}).expect(403);
    await request(app.getHttpServer()).post('/api/auth/login').set('X-Spa-Request', '1').set('Origin', 'https://foreign.invalid').send({}).expect(403);
    expect(auth.login).not.toHaveBeenCalled();
  });
  it('validates payload and rejects unknown fields', async () => {
    await request(app.getHttpServer()).post('/api/auth/login').set('X-Spa-Request', '1').send({ phone: '', password: '', role: 'Chủ Spa' }).expect(400);
    expect(auth.login).not.toHaveBeenCalled();
  });
  it('returns user without token and sets HttpOnly SameSite cookie', async () => {
    auth.login.mockResolvedValue({ user, token: 'test-only-token' });
    const res = await request(app.getHttpServer()).post('/api/auth/login').set('X-Spa-Request', '1').send({ phone: user.phone, password: 'test-only' }).expect(200);
    expect(res.body).toEqual({ success: true, user });
    expect(res.headers['set-cookie'][0]).toMatch(/HttpOnly/);
    expect(res.headers['set-cookie'][0]).toMatch(/SameSite=Lax/);
  });
  it('reloads profile and permissions from SQL rather than trusting token claims', async () => {
    const token = await jwt.signAsync({ ...user, sub: user.id, role: 'Chủ Spa', permissions: ['Q05'] });
    auth.getMe.mockResolvedValue(user);
    const res = await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', `access_token=${token}`).expect(200);
    expect(res.body.user.role).toBe('Nhân viên');
    expect(res.body.user.permissions).toEqual([]);
  });
  it('preserves SQL outage as 503 for a valid token', async () => {
    const token = await jwt.signAsync({ ...user, sub: user.id });
    auth.getMe.mockRejectedValue(new ServiceUnavailableException());
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', `access_token=${token}`).expect(503);
  });
  it('rejects missing, tampered and expired sessions', async () => {
    const expired = await jwt.signAsync({ ...user, sub: user.id }, { expiresIn: -1 });
    for (const token of ['', 'invalid', expired]) {
      await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', `access_token=${token}`).expect(401);
    }
  });
  it('clears the cookie on logout', async () => {
    const res = await request(app.getHttpServer()).post('/api/auth/logout').set('X-Spa-Request', '1').expect(200);
    expect(res.headers['set-cookie'][0]).toContain('access_token=;');
    expect(res.headers['set-cookie'][0]).toContain('HttpOnly');
  });
  it('refuses signing when secret is missing', async () => {
    const secret = process.env.JWT_SECRET; delete process.env.JWT_SECRET;
    try { await expect(jwt.signAsync({ ...user, sub: user.id })).rejects.toThrow('JWT_SECRET'); }
    finally { process.env.JWT_SECRET = secret; }
  });
});
