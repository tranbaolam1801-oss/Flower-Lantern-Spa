import 'reflect-metadata';
import { randomInt } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../app.module';
import { DatabaseService } from '../database.service';
import { setup } from '../setup';

const sqlDescribe = process.env.RUN_SQL_INTEGRATION === '1' ? describe : describe.skip;
sqlDescribe('persistent lockout across competing SQL connections', () => {
  let app: INestApplication;
  let database: DatabaseService;
  const phone = `099${randomInt(100000000,999999999)}`;
  let ownsFixture = false;
  async function createApp() {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const instance = module.createNestApplication(); setup(instance); await instance.init();
    return instance;
  }
  beforeAll(async () => {
    if (process.env.DB_NAME !== 'FlowerLanternSpa_Test') throw new Error('Dedicated test database required');
    app = await createApp(); database = app.get(DatabaseService);
    // Reserve a unique synthetic lockout row first. A collision fails before cleanup ownership.
    await database.query(`INSERT dbo.KhoaDangNhap(SoDienThoai,SoLanSai) VALUES(@0,0)`, [phone]);
    ownsFixture = true;
  }, 30000);
  afterAll(async () => {
    if (ownsFixture) await database.query('DELETE dbo.KhoaDangNhap WHERE SoDienThoai=@0', [phone]);
    if (app) await app.close();
  });
  const login = () => request(app.getHttpServer()).post('/api/auth/login').set('X-Spa-Request','1')
    .send({phone,password:'synthetic-unknown-account'});
  it('counts exactly five failures across 12 concurrent HTTP requests, with no 500 or lost increments', async () => {
    const results = await Promise.all(Array.from({length:12}, () => login()));
    expect(results.filter(r => r.status===401)).toHaveLength(4);
    expect(results.filter(r => r.status===403)).toHaveLength(8);
    const rows = await database.query<{count:number;remaining:number}[]>(
      'SELECT SoLanSai AS count,DATEDIFF(second,GETDATE(),ThoiDiemKhoaDen) AS remaining FROM dbo.KhoaDangNhap WHERE SoDienThoai=@0',[phone]);
    expect(rows[0].count).toBe(5);
    expect(rows[0].remaining).toBeGreaterThan(880);
    expect(rows[0].remaining).toBeLessThanOrEqual(900);
  },30000);
  it('retains the lock after app restart and does not extend it on replay', async () => {
    const before = await database.query<{until:Date}[]>('SELECT ThoiDiemKhoaDen AS until FROM dbo.KhoaDangNhap WHERE SoDienThoai=@0',[phone]);
    await app.close(); app = await createApp(); database = app.get(DatabaseService);
    await login().expect(403);
    const after = await database.query<{until:Date}[]>('SELECT ThoiDiemKhoaDen AS until FROM dbo.KhoaDangNhap WHERE SoDienThoai=@0',[phone]);
    expect(after[0].until).toEqual(before[0].until);
  });
  it('restarts counting at one after the persisted deadline passes', async () => {
    await database.query('UPDATE dbo.KhoaDangNhap SET ThoiDiemKhoaDen=DATEADD(minute,-1,GETDATE()) WHERE SoDienThoai=@0',[phone]);
    await login().expect(401);
    const rows = await database.query<{count:number;until:Date|null}[]>('SELECT SoLanSai AS count,ThoiDiemKhoaDen AS until FROM dbo.KhoaDangNhap WHERE SoDienThoai=@0',[phone]);
    expect(rows[0]).toEqual({count:1,until:null});
  });
});
