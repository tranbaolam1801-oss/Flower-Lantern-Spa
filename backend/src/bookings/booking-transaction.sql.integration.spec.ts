import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import { databaseOptions } from '../config';
import { DatabaseService } from '../database.service';
import { BookingTransactionService, BedInterval } from './booking-transaction.service';

const sqlDescribe=process.env.RUN_SQL_INTEGRATION==='1'?describe:describe.skip;
sqlDescribe('real SQL bed transaction serialization',()=>{
  let source:DataSource,service:BookingTransactionService,owned=false;
  const key='B'+randomBytes(4).toString('hex');
  const interval=(start='09:00:00',end='10:00:00'):BedInterval=>({bedId:'G20',startsAt:`2099-12-20T${start}`,endsAt:`2099-12-20T${end}`});
  beforeAll(async()=>{
    if(process.env.DB_NAME!=='FlowerLanternSpa_Test')throw new Error('Dedicated Test database required');
    const options=databaseOptions(process.env);if(!options)throw new Error('SQL required');
    source=await new DataSource(options).initialize();
    await source.transaction(async manager=>{
      await manager.query(`INSERT dbo.DanhMuc VALUES(@0,N'Concurrency fixture',N'Hoạt động');
        INSERT dbo.DichVu(MaDichVu,MaDanhMuc,TenDichVu,TrangThai) VALUES(@0,@0,N'Concurrency fixture',N'Hoạt động');
        INSERT dbo.GoiDichVu VALUES(@0,@0,N'Concurrency fixture',60,100000);
        INSERT dbo.KhachHang(MaKhachHang,HoTen,SoDienThoai) VALUES(@0,N'Concurrency fixture',@1);
        INSERT dbo.LichHen(MaLichHen,MaKhachHang,HoTenNguoiDat,SoDienThoaiNguoiDat,NgayHen,GioHen,TrangThaiLichHen,TrangThaiThanhToan)
        VALUES(@0,@0,N'Concurrency fixture',@1,'20991220','09:00',N'Chưa đến',N'Chưa thanh toán');`,[key,'08'+String(parseInt(key.slice(1),16)).padStart(10,'0').slice(-8)]);
    });owned=true;
    service=new BookingTransactionService({getDataSource:async()=>source} as DatabaseService);
  },30000);
  afterEach(async()=>{if(owned)await source.query('DELETE dbo.KhachSuDungDichVu WHERE MaLichHen=@0',[key]);});
  afterAll(async()=>{
    if(owned)await source.transaction(async m=>{await m.query(`DELETE dbo.KhachSuDungDichVu WHERE MaLichHen=@0; DELETE dbo.LichHen WHERE MaLichHen=@0; DELETE dbo.KhachHang WHERE MaKhachHang=@0; DELETE dbo.GoiDichVu WHERE MaGoi=@0; DELETE dbo.DichVu WHERE MaDichVu=@0; DELETE dbo.DanhMuc WHERE MaDanhMuc=@0;`,[key]);});
    if(source?.isInitialized)await source.destroy();
  },30000);
  async function insert(runner:QueryRunner,slot:BedInterval) {
    const id='C'+randomBytes(4).toString('hex');
    await runner.query(`INSERT dbo.KhachSuDungDichVu(MaChiTiet,MaLichHen,MaGoi,MaGiuong,TenKhach,ThoiDiemBatDau,ThoiDiemKetThuc) VALUES(@0,@1,@1,@2,N'Concurrency fixture',CONVERT(datetime,@3,126),CONVERT(datetime,@4,126))`,[id,key,slot.bedId,slot.startsAt,slot.endsAt]);
    return id;
  }
  it('allows exactly one of two simultaneous conflicting reservations',async()=>{
    const slot=interval();
    const results=await Promise.allSettled([service.reserve([slot],r=>insert(r,slot)),service.reserve([slot],r=>insert(r,slot))]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    const rejected=results.find(r=>r.status==='rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(ConflictException);
    expect(await source.query('SELECT COUNT(*) AS count FROM dbo.KhachSuDungDichVu WHERE MaLichHen=@0',[key])).toEqual([{count:1}]);
  },30000);
  it('allows touching endpoints but rejects overlap in the full service interval',async()=>{
    const slot=interval();await service.reserve([slot],r=>insert(r,slot));
    const touching=interval('10:00:00','11:00:00');await service.reserve([touching],r=>insert(r,touching));
    const overlapping=interval('09:59:00','10:30:00');
    await expect(service.reserve([overlapping],r=>insert(r,overlapping))).rejects.toBeInstanceOf(ConflictException);
  },30000);
  it('rolls back a failed writer and releases the bed for another transaction',async()=>{
    const slot=interval();
    await expect(service.reserve([slot],async r=>{await insert(r,slot);throw new Error('Test-only failure');})).rejects.toThrow('Không thể lưu lịch hẹn');
    await expect(service.reserve([slot],r=>insert(r,slot))).resolves.toMatch(/^C/);
  },30000);
});
