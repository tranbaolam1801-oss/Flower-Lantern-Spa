import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource, QueryRunner } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../app.module';
import { DatabaseService } from '../database.service';
import { databaseOptions } from '../config';
import { setup } from '../setup';
import { JwtTokenService } from '../auth/jwt-token.service';

const sqlDescribe=process.env.RUN_SQL_INTEGRATION==='1'?describe:describe.skip;
sqlDescribe('booking read ownership and permissions on real SQL',()=>{
  let source:DataSource,runner:QueryRunner,app:INestApplication;
  const previous=process.env.JWT_SECRET;
  beforeAll(async()=>{
    if(process.env.DB_NAME!=='FlowerLanternSpa_Test')throw new Error('Dedicated test database required');
    process.env.JWT_SECRET=randomBytes(32).toString('hex');
    const options=databaseOptions(process.env);if(!options)throw new Error('SQL required');
    source=await new DataSource(options).initialize();runner=source.createQueryRunner();await runner.connect();await runner.startTransaction();
    await runner.query(`SET QUOTED_IDENTIFIER ON; SET ANSI_NULLS ON; SET ANSI_WARNINGS ON; SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET NUMERIC_ROUNDABORT OFF;
      INSERT dbo.TaiKhoan VALUES('READTK001','read-customer-1','0999800001','unused',N'Khách hàng',N'Hoạt động'),
        ('READTK002','read-customer-2','0999800002','unused',N'Khách hàng',N'Hoạt động'),
        ('READTK003','read-staff','0999800003','unused',N'Nhân viên',N'Hoạt động'),
        ('READTK004','read-no-right','0999800004','unused',N'Nhân viên',N'Hoạt động');
      INSERT dbo.Quyen VALUES('Q01',N'Quản lý lịch hẹn'),('Q02',N'Quản lý khách hàng'); INSERT dbo.TaiKhoanQuyen VALUES('READTK003','Q01'),('READTK003','Q02');
      INSERT dbo.KhachHang(MaKhachHang,MaTaiKhoan,HoTen,SoDienThoai) VALUES('READKH001','READTK001',N'Test One','0999800001'),('READKH002','READTK002',N'Test Two','0999800002');
      INSERT dbo.DanhMuc VALUES('READCAT',N'Read test',N'Hoạt động');
      INSERT dbo.DichVu(MaDichVu,MaDanhMuc,TenDichVu,TrangThai) VALUES('READDV','READCAT',N'Read service',N'Hoạt động');
      INSERT dbo.GoiDichVu VALUES('READGOI','READDV',N'Read package',60,100000);
      INSERT dbo.LichHen(MaLichHen,MaKhachHang,HoTenNguoiDat,SoDienThoaiNguoiDat,NgayHen,GioHen,TrangThaiLichHen,TrangThaiThanhToan)
      VALUES('READLH001','READKH001',N'Test One','0999800001','20261110','09:00',N'Chưa đến',N'Chưa thanh toán'),
        ('READLH002','READKH002',N'Test Two','0999800002','20261110','10:00',N'Chờ xác nhận',N'Chưa thanh toán');
      INSERT dbo.KhachSuDungDichVu(MaChiTiet,MaLichHen,MaGoi,MaGiuong,TenKhach,ThoiDiemBatDau,ThoiDiemKetThuc)
      VALUES('READCT001','READLH001','READGOI','G1',N'Test One','2026-11-10T09:00:00','2026-11-10T10:00:00'),
        ('READCT002','READLH002','READGOI','G2',N'Test Two','2026-11-10T10:00:00','2026-11-10T11:00:00');`);
    const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(DatabaseService).useValue({query:(sql:string,args:unknown[]=[])=>runner.query(sql,args)}).compile();
    app=module.createNestApplication();setup(app);await app.init();
  },30000);
  afterAll(async()=>{
    if(app)await app.close();if(runner?.isTransactionActive)await runner.rollbackTransaction();if(runner)await runner.release();if(source?.isInitialized)await source.destroy();
    if(previous===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=previous;
  });
  async function cookie(id:string) {
    // Deliberately stale owner claims: real guard must replace these using SQL.
    const token=await new JwtTokenService().signAsync({sub:id,username:'test',phone:'0999800001',role:'Chủ Spa',fullName:'Test',permissions:['Q01']});
    return `access_token=${token}`;
  }
  it('denies unauthenticated access',async()=>{await request(app.getHttpServer()).get('/api/bookings').expect(401);});
  it('denies customer and staff without Q01 despite forged old role claims',async()=>{
    for(const id of ['READTK001','READTK004'])await request(app.getHttpServer()).get('/api/bookings').set('Cookie',await cookie(id)).expect(403);
  });
  it('returns exactly 20 persisted beds and correct actual time/bed assignments',async()=>{
    const res=await request(app.getHttpServer()).get('/api/bookings?date=2026-11-10').set('Cookie',await cookie('READTK003')).expect(200);
    expect(res.body.beds).toHaveLength(20);expect(res.body.beds[19].id).toBe('G20');
    expect(res.body.items).toHaveLength(2);expect(res.body.items[0]).toMatchObject({bookingId:'READLH001',bedId:'G1',startMinute:540,endMinute:600});
  });
  it('rejects impossible dates and unknown query input',async()=>{
    const token=await cookie('READTK003');
    for(const query of ['date=2026-02-30','date=invalid','accountId=READTK001'])await request(app.getHttpServer()).get(`/api/bookings?${query}`).set('Cookie',token).expect(400);
  });
  it('returns only owned appointments and maps confirmed status for customer',async()=>{
    const res=await request(app.getHttpServer()).get('/api/me/bookings?accountId=READTK002').set('Cookie',await cookie('READTK001')).expect(200);
    expect(res.body.items).toHaveLength(1);expect(res.body.items[0]).toMatchObject({id:'READLH001',status:'Đã xác nhận'});
    expect(res.body.items[0].services).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toContain('Test Two');
  });
  it('returns an empty day with all beds, not fake appointments',async()=>{
    const res=await request(app.getHttpServer()).get('/api/bookings?date=2026-11-11').set('Cookie',await cookie('READTK003')).expect(200);
    expect(res.body.items).toEqual([]);expect(res.body.beds).toHaveLength(20);
  });
  it('UC3.4 denies unauthenticated, customer and staff without Q02',async()=>{
    await request(app.getHttpServer()).get('/api/customers').expect(401);
    for(const id of ['READTK001','READTK004'])await request(app.getHttpServer()).get('/api/customers').set('Cookie',await cookie(id)).expect(403);
  });
  it('UC3.4 searches case-insensitive name and phone with real appointment counts',async()=>{
    const token=await cookie('READTK003');
    for(const q of ['tEsT oNe','0999800001']) {
      const res=await request(app.getHttpServer()).get('/api/customers').query({q}).set('Cookie',token).expect(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0]).toMatchObject({id:'READKH001',name:'Test One',phone:'0999800001',bookingCount:1});
      expect(res.body.hasNext).toBe(false);
      expect(res.body.items[0]).not.toHaveProperty('passwordHash');
    }
  });
  it('UC3.4 treats SQL and wildcard text literally; validates pagination and query',async()=>{
    const token=await cookie('READTK003');
    for(const q of ['%','_','[',"' OR 1=1--",'no matching customer']) {
      const res=await request(app.getHttpServer()).get('/api/customers').query({q}).set('Cookie',token).expect(200);
      expect(res.body.items).toEqual([]);
    }
    for(const query of [{page:0},{page:'abc'},{q:'x'.repeat(101)},{accountId:'READTK001'}])await request(app.getHttpServer()).get('/api/customers').query(query).set('Cookie',token).expect(400);
  });
  it('UC2.5 enforces Q01 and CSRF before cancelling',async()=>{
    await request(app.getHttpServer()).post('/api/bookings/READLH002/cancel').set('X-Spa-Request','1').expect(401);
    await request(app.getHttpServer()).post('/api/bookings/READLH002/cancel').set('Cookie',await cookie('READTK003')).expect(403);
    for(const id of ['READTK001','READTK004'])await request(app.getHttpServer()).post('/api/bookings/READLH002/cancel').set('X-Spa-Request','1').set('Cookie',await cookie(id)).expect(403);
  });
  it('UC2.5 preserves details/payment and rejects completed, missing and already-cancelled bookings',async()=>{
    const token=await cookie('READTK003');
    const cancel=(id:string)=>request(app.getHttpServer()).post(`/api/bookings/${id}/cancel`).set('X-Spa-Request','1').set('Cookie',token);
    await cancel('MISSING').expect(404);
    await runner.query("UPDATE dbo.LichHen SET TrangThaiLichHen=N'Hoàn thành' WHERE MaLichHen='READLH002'");
    await cancel('READLH002').expect(409);
    await runner.query("UPDATE dbo.LichHen SET TrangThaiLichHen=N'Chưa đến' WHERE MaLichHen='READLH002'");
    await cancel('READLH002').expect(201);
    await cancel('READLH002').expect(409);
    const rows=await runner.query("SELECT TrangThaiLichHen,TrangThaiThanhToan FROM dbo.LichHen WHERE MaLichHen='READLH002'");
    expect(rows[0]).toEqual({TrangThaiLichHen:'Đã hủy',TrangThaiThanhToan:'Chưa thanh toán'});
    expect(await runner.query("SELECT COUNT(*) AS count FROM dbo.KhachSuDungDichVu WHERE MaLichHen='READLH002'")).toEqual([{count:1}]);
  });
});
