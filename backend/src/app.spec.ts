import 'reflect-metadata';
import { INestApplication, ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './app.module';
import { DatabaseService } from './database.service';
import { setup } from './setup';
import { databaseOptions } from './config';
import { literalLike } from './catalog.controller';

// Explicit HTTP contract tests with a test-only database double, not SQL integration.
describe('API contract (test-only database double)',()=>{
  let app:INestApplication;
  const database = {query:jest.fn()};
  beforeAll(async()=>{
    const module = await Test.createTestingModule({imports:[AppModule]}).overrideProvider(DatabaseService).useValue(database).compile();
    app = module.createNestApplication(); setup(app); await app.init();
  });
  afterAll(async()=>{await app.close();});
  beforeEach(()=>database.query.mockReset());
  it('liveness does not pretend the database is ready',async()=>{
    await request(app.getHttpServer()).get('/api/health/live').expect(200).expect({status:'ok',service:'flower-lantern-spa'});
    expect(database.query).not.toHaveBeenCalled();
  });
  it('readiness fails closed on SQL outage',async()=>{
    database.query.mockRejectedValue(new ServiceUnavailableException('Không thể kết nối dữ liệu. Vui lòng thử lại!'));
    await request(app.getHttpServer()).get('/api/health/ready').expect(503);
  });
  it('readiness probes SQL',async()=>{
    database.query.mockResolvedValue([{ok:1}]);
    await request(app.getHttpServer()).get('/api/health/ready').expect(200);
    expect(database.query).toHaveBeenCalledWith('SELECT 1 AS ok');
  });
  it.each(['limit=51','page=-1','page=1.5','q[x]=bad','admin=true'])('rejects invalid query %s',async(query)=>{
    await request(app.getHttpServer()).get(`/api/services?${query}`).expect(400);
    expect(database.query).not.toHaveBeenCalled();
  });
  it('binds search values and filters inactive services',async()=>{
    database.query.mockResolvedValue([]);
    await request(app.getHttpServer()).get('/api/services').query({q:"%' OR 1=1--",page:2,limit:10}).expect(200).expect({items:[],page:2,limit:10});
    const [sql,params] = database.query.mock.calls[0] as [string,unknown[]];
    expect(sql).not.toContain("%' OR");
    expect(sql).toContain('d.TrangThai=@0');
    expect(params).toEqual(['Hoạt động',"%' OR 1=1--","%~%' OR 1=1--%",'',10,10]);
  });
  it('returns SRS not-found message for unavailable service',async()=>{
    database.query.mockResolvedValue([]);
    const response = await request(app.getHttpServer()).get('/api/services/DV001').expect(404);
    expect(response.body.message).toBe('Không tìm thấy thông tin dịch vụ!');
  });
  it('returns service and packages without account information',async()=>{
    database.query.mockResolvedValueOnce([{id:'DV001',name:'Test-only service'}]).mockResolvedValueOnce([{id:'GOI001',price:100000,durationMinutes:60}]);
    const response = await request(app.getHttpServer()).get('/api/services/DV001').expect(200);
    expect(response.body.packages).toHaveLength(1);
    expect(database.query.mock.calls[0][1]).toEqual(['DV001','Hoạt động']);
  });
  describe('browser request guard and the SePay webhook exemption',()=>{
    it('still rejects state-changing requests without the app header',async()=>{
      await request(app.getHttpServer()).post('/api/bookings').send({}).expect(403);
      await request(app.getHttpServer()).post('/api/payments/mock/webhook').send({}).expect(403);
      await request(app.getHttpServer()).post('/api/payments/sepay/intent').send({}).expect(403);
    });
    it('exempts only the exact webhook route, and it is still authenticated (no header, no credentials)',async()=>{
      const response = await request(app.getHttpServer()).post('/api/payments/sepay/webhook').send({id:1,transferType:'in'});
      expect(response.status).not.toBe(403);
      expect(response.status).toBeGreaterThanOrEqual(401);
      expect(response.body.success).not.toBe(true);
      expect(database.query).not.toHaveBeenCalled();
    });
    it('does not extend the exemption to near-miss paths or other methods',async()=>{
      await request(app.getHttpServer()).post('/api/payments/sepay/webhook/').send({}).expect(403);
      await request(app.getHttpServer()).post('/api/payments/sepay/webhook/extra').send({}).expect(403);
      await request(app.getHttpServer()).put('/api/payments/sepay/webhook').send({}).expect(403);
      await request(app.getHttpServer()).patch('/api/payments/sepay/webhook').send({}).expect(403);
    });
  });
});
describe('configuration invariants',()=>{
  it('never silently falls back to fake data',()=>expect(databaseOptions({})).toBeUndefined());
  it('disables schema synchronization and migration auto-run',()=>{
    const options = databaseOptions({DB_HOST:'localhost',DB_NAME:'test',DB_USER:'test',DB_PASSWORD:'test-only'});
    expect(options).toMatchObject({type:'mssql',synchronize:false,migrationsRun:false});
  });
  it('rejects an invalid port',()=>expect(()=>databaseOptions({DB_HOST:'localhost',DB_NAME:'test',DB_USER:'test',DB_PASSWORD:'test-only',DB_PORT:'oops'})).toThrow());
  it('escapes wildcard characters',()=>expect(literalLike('a%_[~')).toBe('%a~%~_~[~~%'));
});
