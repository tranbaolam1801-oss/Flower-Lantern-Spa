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

// Reviewed effects: inserts only synthetic AUTHSQL001/0999980011 inside an outer
// transaction, then ALWAYS rolls it back. No seed/migration or existing user edits.
const sqlDescribe = process.env.RUN_SQL_INTEGRATION === '1' ? describe : describe.skip;
sqlDescribe('Auth with real SQL Server and Argon2id', () => {
  let source: DataSource, runner: QueryRunner, app: INestApplication;
  const phone = '0999980011';
  const password = randomBytes(24).toString('hex');
  const previousSecret = process.env.JWT_SECRET;
  beforeAll(async () => {
    if (process.env.DB_NAME !== 'FlowerLanternSpa_Test') throw new Error('Dedicated test database required');
    process.env.JWT_SECRET = randomBytes(32).toString('hex');
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
  });
  const login = (value = password) => request(app.getHttpServer()).post('/api/auth/login').set('X-Spa-Request', '1').send({ phone, password: value });
  it('logs in, restores profile, and rejects the same session after account locking', async () => {
    const res = await login().expect(200);
    const cookie = res.headers['set-cookie'][0].split(';')[0];
    expect(res.body.user.id).toBe('AUTHSQL001');
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie).expect(200);
    await runner.query(`UPDATE dbo.TaiKhoan SET TrangThai=N'Đã khóa' WHERE MaTaiKhoan='AUTHSQL001'`);
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
});
