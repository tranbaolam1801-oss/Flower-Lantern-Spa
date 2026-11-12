import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import { PgTestServer, startPgTestServer } from '../testing/pg-test-server';
import { ReportsService } from './reports.service';

jest.setTimeout(120_000);

describe('ReportsService on real PostgreSQL (PGlite)', () => {
  let pg: PgTestServer;
  let db: DatabaseService;
  let svc: ReportsService;

  beforeAll(async () => {
    pg = await startPgTestServer();
    db = new DatabaseService();
  });
  afterAll(async () => {
    await db.onApplicationShutdown();
    await pg.stop();
  });
  beforeEach(async () => {
    await pg.reset();
    svc = new ReportsService(db);
    await pg.exec(`
      INSERT INTO dbo.KhachHang(MaKhachHang,HoTen,SoDienThoai,NgayTao) VALUES
        ('KH00000001','An','0900000001','2026-01-05 10:00'),
        ('KH00000002','Binh','0900000002','2026-11-03 10:00'),
        ('KH00000003','Chi','0900000003','2026-11-20 10:00');
      INSERT INTO dbo.DanhMuc VALUES ('DM00000001','Da','Hoạt động');
      INSERT INTO dbo.DichVu(MaDichVu,MaDanhMuc,TenDichVu,TrangThai) VALUES ('DV00000001','DM00000001','Massage','Hoạt động'),('DV00000002','DM00000001','Facial','Hoạt động');
      INSERT INTO dbo.GoiDichVu(MaGoi,MaDichVu,TenGoi,ThoiLuong,Gia) VALUES ('GD00000001','DV00000001','60',60,300000),('GD00000002','DV00000002','45',45,200000);
      INSERT INTO dbo.LichHen(MaLichHen,MaKhachHang,HoTenNguoiDat,SoDienThoaiNguoiDat,NgayHen,GioHen,TrangThaiLichHen,TrangThaiThanhToan) VALUES
        ('LH00000001','KH00000001','An','0900000001','2026-11-05','09:00','Hoàn thành','Đã thanh toán'),
        ('LH00000002','KH00000001','An','0900000001','2026-11-06','09:00','Hoàn thành','Đã thanh toán'),
        ('LH00000003','KH00000002','Binh','0900000002','2026-11-07','09:00','Hoàn thành','Chưa thanh toán'),
        ('LH00000004','KH00000002','Binh','0900000002','2026-11-08','09:00','Đã hủy','Chưa thanh toán'),
        ('LH00000005','KH00000003','Chi','0900000003','2026-12-25','09:00','Hoàn thành','Chưa thanh toán');
      INSERT INTO dbo.KhachSuDungDichVu(MaChiTiet,MaLichHen,MaGoi,MaGiuong,TenKhach,ThoiDiemBatDau,ThoiDiemKetThuc) VALUES
        ('CT00000001','LH00000001','GD00000001','G1','An','2026-11-05 09:00','2026-11-05 10:00'),
        ('CT00000002','LH00000002','GD00000001','G1','An','2026-11-06 09:00','2026-11-06 10:00'),
        ('CT00000003','LH00000003','GD00000002','G2','Binh','2026-11-07 09:00','2026-11-07 09:45'),
        ('CT00000004','LH00000004','GD00000002','G2','Binh','2026-11-08 09:00','2026-11-08 09:45'),
        ('CT00000005','LH00000005','GD00000002','G2','Chi','2026-12-25 09:00','2026-12-25 09:45');
      INSERT INTO dbo.ThanhToan(MaThanhToan,MaLichHen,SoTienThanhToan,NgayGhiNhan,TrangThaiGiaoDich,KhoanHoanTien,NhaCungCap) VALUES
        ('TT00000001','LH00000001',300000,'2026-11-05 10:00','Thành công',0,'SEPAY'),
        ('TT00000002','LH00000002',300000,'2026-11-06 10:00','Thành công',100000,NULL),
        ('TT00000003','LH00000002',999000,'2026-11-06 11:00','Chờ thanh toán',0,'SEPAY'),
        ('TT00000004','LH00000003',500000,'2026-11-07 10:00','Hết hạn',0,'SEPAY'),
        ('TT00000005','LH00000003',777000,'2026-11-07 11:00','Thành công',0,'MOCK'),
        ('TT00000006','LH00000001',50000,'2026-10-01 10:00','Thành công',0,'SEPAY');`);
  });

  it('services: counts only completed bookings in range, ordered by usage then name', async () => {
    const r = await svc.services('2026-11-01', '2026-11-30');
    expect(r).toEqual({ totalUsage: 3, items: [
      { serviceId: 'DV00000001', serviceName: 'Massage', usageCount: 2 },
      { serviceId: 'DV00000002', serviceName: 'Facial', usageCount: 1 },
    ] });
    expect((await svc.services('2026-12-01', '2026-12-31')).totalUsage).toBe(1);
  });

  it('customers: new in range, returning (created before, non-cancelled booking in range) and top list', async () => {
    const r = await svc.customers('2026-11-01', '2026-11-30');
    expect(r.newCustomers).toBe(2);
    expect(r.returningCustomers).toBe(1);
    expect(r.topCustomers).toEqual([
      { customerId: 'KH00000001', fullName: 'An', phone: '0900000001', bookingCount: 2 },
      { customerId: 'KH00000002', fullName: 'Binh', phone: '0900000002', bookingCount: 1 },
    ]);
  });

  it('revenue: only Thành công, net of refunds, MOCK excluded, date range inclusive, grouped', async () => {
    const day = await svc.revenue('2026-11-01', '2026-11-30', 'day');
    expect(day.totalRevenue).toBe(300000 + 200000);
    expect(day.series).toEqual([{ label: '05/11/2026', amount: 300000 }, { label: '06/11/2026', amount: 200000 }]);
    expect((await svc.revenue('2026-11-05', '2026-11-05', 'day')).totalRevenue).toBe(300000);
    const month = await svc.revenue('2026-10-01', '2026-11-30', 'month');
    expect(month.series).toEqual([{ label: '10/2026', amount: 50000 }, { label: '11/2026', amount: 500000 }]);
    expect((await svc.revenue('2026-01-01', '2026-12-31', 'year')).series).toEqual([{ label: '2026', amount: 550000 }]);
    expect((await svc.revenue('2026-11-07', '2026-11-07', 'day')).totalRevenue).toBe(0);
  });

  it('rejects invalid ranges before touching the database', async () => {
    await expect(svc.revenue('2026-11-10', '2026-11-01', 'day')).rejects.toBeInstanceOf(BadRequestException);
  });
});
