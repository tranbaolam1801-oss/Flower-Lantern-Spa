import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../app.module';
import { DatabaseService } from '../database.service';
import { databaseOptions } from '../config';
import { setup } from '../setup';
import { PasswordService } from './password.service';
import { JwtTokenService } from './jwt-token.service';
import { AuthService } from './auth.service';

// Reviewed effects: inserts only synthetic AUTHSQL001/0999980011 inside an outer
// transaction, then ALWAYS rolls it back. No seed/migration or existing user edits.
const sqlDescribe = process.env.RUN_SQL_INTEGRATION === '1' ? describe : describe.skip;
sqlDescribe('Auth with real SQL Server and Argon2id', () => {
  let source: DataSource, runner: QueryRunner, app: INestApplication;
  const phone = '0999980011';
  const password = randomBytes(24).toString('hex');
  const previousSecret = process.env.JWT_SECRET;
  const previousStore = process.env.AUTH_SESSION_STORE;
  beforeAll(async () => {
    if (process.env.DB_NAME !== 'FlowerLanternSpa_Test') throw new Error('Dedicated test database required');
    process.env.JWT_SECRET = randomBytes(32).toString('hex');
    process.env.AUTH_SESSION_STORE = 'sql';
    const options = databaseOptions(process.env);
    if (!options) throw new Error('SQL configuration required');
    source = await new DataSource(options).initialize();
    runner = source.createQueryRunner(); await runner.connect();
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(DatabaseService)
      .useValue({ query: (sql: string, args: unknown[] = []) => runner.query(sql, args) }).compile();
    app = module.createNestApplication(); setup(app); await app.init();
  }, 30000);
  beforeEach(async () => {
    await runner.startTransaction();
    const hash = await new PasswordService().hash(password);
    await runner.query(`INSERT dbo.TaiKhoan (MaTaiKhoan,TenDangNhap,SoDienThoai,MatKhauBam,VaiTro,TrangThai)
      VALUES ('AUTHSQL001','auth-sql-fixture',@0,@1,N'Khách hàng',N'Hoạt động')`, [phone, hash]);
  });
  afterEach(async () => { if (runner?.isTransactionActive) await runner.rollbackTransaction(); });
  afterAll(async () => {
    if (app) await app.close();
    if (runner?.isTransactionActive) await runner.rollbackTransaction();
    if (runner) await runner.release();
    if (source?.isInitialized) await source.destroy();
    if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;
    if (previousStore === undefined) delete process.env.AUTH_SESSION_STORE; else process.env.AUTH_SESSION_STORE = previousStore;
  });
  const login = (value = password) => request(app.getHttpServer()).post('/api/auth/login').set('X-Spa-Request', '1').send({ phone, password: value });
  it('logs in, restores profile, and rejects the same session after account locking', async () => {
    const res = await login().expect(200);
    const cookie = res.headers['set-cookie'][0].split(';')[0];
    expect(res.body.user.id).toBe('AUTHSQL001');
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie).expect(200);
    await runner.query(`UPDATE dbo.TaiKhoan SET TrangThai=N'Đã khóa' WHERE MaTaiKhoan='AUTHSQL001'`);
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie).expect(401);
    await runner.query(`UPDATE dbo.TaiKhoan SET TrangThai=N'Hoạt động' WHERE MaTaiKhoan='AUTHSQL001'`);
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie).expect(401);
  });
  it('persists the fifth failure, denies correct password while locked, then allows expiry', async () => {
    for (let i = 0; i < 4; i++) await login('wrong').expect(401);
    const locked = await login('wrong').expect(403);
    expect(locked.body.code).toBe('ACCOUNT_TEMPORARILY_LOCKED');
    const rows = await runner.query(`SELECT SoLanSai, DATEDIFF(second,GETDATE(),ThoiDiemKhoaDen) AS Remaining FROM dbo.KhoaDangNhap WHERE SoDienThoai=@0`, [phone]);
    expect(rows[0].SoLanSai).toBe(5);
    expect(rows[0].Remaining).toBeGreaterThan(890);
    expect(rows[0].Remaining).toBeLessThanOrEqual(900);
    await login().expect(403);
    await runner.query(`UPDATE dbo.KhoaDangNhap SET ThoiDiemKhoaDen=DATEADD(minute,-1,GETDATE()) WHERE SoDienThoai=@0`, [phone]);
    await login().expect(200);
    const reset = await runner.query(`SELECT SoLanSai FROM dbo.KhoaDangNhap WHERE SoDienThoai=@0`, [phone]);
    expect(reset[0].SoLanSai).toBe(0);
  }, 30000);
  it('revokes only the logged-out device; retries and a fresh service instance cannot revive it',async()=>{
    const a=await login().expect(200),b=await login().expect(200);
    const cookieA=a.headers['set-cookie'][0].split(';')[0],cookieB=b.headers['set-cookie'][0].split(';')[0];
    for(let i=0;i<2;i++)await request(app.getHttpServer()).post('/api/auth/logout').set('X-Spa-Request','1').set('Cookie',cookieA).expect(200);
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie',cookieA).expect(401);
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie',cookieB).expect(200);
    const jwt=new JwtTokenService();
    const payload=await jwt.verifyAsync<import('./auth.dto').JwtPayload>(cookieA.slice('access_token='.length));
    const fresh=new AuthService({query:(sql:string,args:unknown[])=>runner.query(sql,args)} as DatabaseService,new PasswordService(),jwt);
    await expect(fresh.validateSession(payload)).rejects.toThrow('Phiên đăng nhập');
  },30000);
  it('rejects database expiry, unknown jti, missing jti and a mismatched account',async()=>{
    const res=await login().expect(200);const cookie=res.headers['set-cookie'][0].split(';')[0];
    const jwt=new JwtTokenService();const payload=await jwt.verifyAsync<import('./auth.dto').JwtPayload>(cookie.slice('access_token='.length));
    await runner.query(`UPDATE dbo.PhienDangNhap SET TaoLuc=DATEADD(day,-2,SYSUTCDATETIME()),HetHanLuc=DATEADD(day,-1,SYSUTCDATETIME()) WHERE MaTaiKhoan='AUTHSQL001'`);
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie',cookie).expect(401);
    for(const override of [{jti:undefined},{jti:'00000000-0000-4000-8000-000000000000'},{sub:'OTHERUSER'}]) {
      const token=await jwt.signAsync({sub:payload.sub,username:payload.username,phone:payload.phone,role:payload.role,fullName:payload.fullName,permissions:payload.permissions,jti:payload.jti,...override});
      await request(app.getHttpServer()).get('/api/auth/me').set('Cookie',`access_token=${token}`).expect(401);
    }
  },30000);
});
