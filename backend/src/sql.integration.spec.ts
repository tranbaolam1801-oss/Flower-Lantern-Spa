import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource, QueryRunner } from 'typeorm';
import request from 'supertest';
import { AppModule } from './app.module';
import { DatabaseService } from './database.service';
import { databaseOptions } from './config';
import { setup } from './setup';

// Opt-in real SQL Server integration. All synthetic fixtures roll back.
const sqlDescribe = process.env.RUN_SQL_INTEGRATION === '1' ? describe : describe.skip;
sqlDescribe('real SQL Server catalog integration',()=>{
  let source:DataSource;
  let runner:QueryRunner;
  let app:INestApplication;
  beforeAll(async()=>{
    if(process.env.DB_NAME !== 'FlowerLanternSpa_Test') throw new Error('Integration tests require the dedicated test database');
    const options = databaseOptions(process.env);
    if(!options) throw new Error('SQL configuration required');
    source = await new DataSource(options).initialize();
    runner = source.createQueryRunner(); await runner.connect(); await runner.startTransaction();
    await runner.query(`SET QUOTED_IDENTIFIER ON; SET ANSI_NULLS ON; SET ANSI_PADDING ON; SET ANSI_WARNINGS ON; SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET NUMERIC_ROUNDABORT OFF;
      INSERT dbo.DanhMuc VALUES('TESTCAT',N'Test-only category',N'Hoạt động');
      INSERT dbo.DichVu(MaDichVu,MaDanhMuc,TenDichVu,TrangThai) VALUES('TESTDV1','TESTCAT',N'Test-only Massage',N'Hoạt động'),('TESTDV2','TESTCAT',N'Test-only hidden',N'Ngừng hoạt động');
      INSERT dbo.GoiDichVu VALUES('TESTGOI','TESTDV1',N'Test-only package',60,100000);`);
    const module = await Test.createTestingModule({imports:[AppModule]}).overrideProvider(DatabaseService)
      .useValue({query:(sql:string,params:unknown[]=[])=>runner.query(sql,params)}).compile();
    app = module.createNestApplication();setup(app);await app.init();
  },30000);
  afterAll(async()=>{
    if(app) await app.close();
    if(runner?.isTransactionActive) await runner.rollbackTransaction();
    if(runner) await runner.release();
    if(source?.isInitialized) await source.destroy();
  });
  it('filters active services and searches case-insensitively in real SQL',async()=>{
    const response = await request(app.getHttpServer()).get('/api/services?q=test-only&category=TESTCAT').expect(200);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0]).toMatchObject({id:'TESTDV1',name:'Test-only Massage'});
  });
  it('reads real package price and duration',async()=>{
    const response = await request(app.getHttpServer()).get('/api/services/TESTDV1').expect(200);
    expect(response.body.packages[0]).toMatchObject({id:'TESTGOI',durationMinutes:60});
    expect(Number(response.body.packages[0].price)).toBe(100000);
  });
  it('does not expose inactive service details',async()=>{
    await request(app.getHttpServer()).get('/api/services/TESTDV2').expect(404);
  });
  it('treats SQL injection and wildcards as literal text',async()=>{
    const response = await request(app.getHttpServer()).get('/api/services').query({q:"%' OR 1=1--"}).expect(200);
    expect(response.body.items).toEqual([]);
  });
});
