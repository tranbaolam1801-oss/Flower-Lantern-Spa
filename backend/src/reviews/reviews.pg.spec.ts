import 'reflect-metadata';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import { PgTestServer, startPgTestServer } from '../testing/pg-test-server';
import { ReviewsController } from './reviews.controller';

jest.setTimeout(120_000);

const staffReq = { user: { sub: 'TK00000009', entityId: 'NV00000001' } } as never;
const customerReq = (sub = 'TK00000001') => ({ user: { sub } }) as never;

describe('ReviewsController on real PostgreSQL (PGlite)', () => {
  let pg: PgTestServer;
  let db: DatabaseService;
  let ctrl: ReviewsController;
  const rows = async <T>(sql: string, p: unknown[] = []) => await db.query<T[]>(sql, p);

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
    ctrl = new ReviewsController(db);
    await pg.exec(`
      INSERT INTO dbo.TaiKhoan VALUES ('TK00000001','kh1','0900000001','x','Khách hàng','Hoạt động'),('TK00000002','kh2','0900000002','x','Khách hàng','Hoạt động'),('TK00000009','nv','0900000009','x','Nhân viên','Hoạt động');
      INSERT INTO dbo.KhachHang(MaKhachHang,MaTaiKhoan,HoTen,SoDienThoai) VALUES ('KH00000001','TK00000001','Nguyễn An','0900000001'),('KH00000002','TK00000002','Lê Bình','0900000002');
      INSERT INTO dbo.NhanVien(MaNhanVien,MaTaiKhoan,HoTen,SoDienThoai,TrangThaiLamViec,TrangThaiHoSo) VALUES ('NV00000001','TK00000009','Trần Lan','0900000009','Đang làm việc','Hoạt động');
      INSERT INTO dbo.DanhMuc VALUES ('DM00000001','Da','Hoạt động');
      INSERT INTO dbo.DichVu(MaDichVu,MaDanhMuc,TenDichVu,TrangThai) VALUES ('DV00000001','DM00000001','Massage đá nóng','Hoạt động'),('DV00000002','DM00000001','Facial','Hoạt động');
      INSERT INTO dbo.GoiDichVu(MaGoi,MaDichVu,TenGoi,ThoiLuong,Gia) VALUES ('GD00000001','DV00000001','60 phút',60,300000),('GD00000002','DV00000002','45 phút',45,200000);
      INSERT INTO dbo.LichHen(MaLichHen,MaKhachHang,HoTenNguoiDat,SoDienThoaiNguoiDat,NgayHen,GioHen,TrangThaiLichHen,TrangThaiThanhToan) VALUES
        ('LH00000001','KH00000001','An','0900000001','2026-11-05','09:00','Hoàn thành','Đã thanh toán'),
        ('LH00000002','KH00000001','An','0900000001','2026-11-06','09:00','Chưa đến','Chưa thanh toán'),
        ('LH00000003','KH00000002','Binh','0900000002','2026-11-07','09:00','Hoàn thành','Đã thanh toán'),
        ('LH00000004','KH00000001','An','0900000001','2026-11-08','09:00','Hoàn thành','Đã thanh toán');
      INSERT INTO dbo.KhachSuDungDichVu(MaChiTiet,MaLichHen,MaGoi,MaGiuong,TenKhach,ThoiDiemBatDau,ThoiDiemKetThuc) VALUES
        ('CT00000001','LH00000001','GD00000001','G1','An','2026-11-05 09:00','2026-11-05 10:00'),
        ('CT00000002','LH00000002','GD00000001','G1','An','2026-11-06 09:00','2026-11-06 10:00'),
        ('CT00000003','LH00000003','GD00000002','G2','Binh','2026-11-07 09:00','2026-11-07 09:45');`);
  });

  it('customer reviews only their own completed booking, once; ids are sequential DGnnnnnnnn', async () => {
    expect(await ctrl.reviewMyBooking({ id: 'LH00000001' }, { rating: 5, comment: 'Rất tốt' }, customerReq())).toEqual({ id: 'DG00000001', message: 'Gửi đánh giá thành công!' });
    const stored = await rows<{ stars: number; comment: string; svc: string; cust: string }>(`SELECT SoSao AS stars, NoiDungDanhGia AS comment, rtrim(MaDichVu) AS svc, rtrim(MaKhachHang) AS cust FROM dbo.DanhGia`);
    expect(stored).toEqual([{ stars: 5, comment: 'Rất tốt', svc: 'DV00000001', cust: 'KH00000001' }]);
    await expect(ctrl.reviewMyBooking({ id: 'LH00000001' }, { rating: 4 }, customerReq())).rejects.toThrow('Lịch hẹn này đã được đánh giá!');
    await expect(ctrl.reviewMyBooking({ id: 'LH00000002' }, { rating: 4 }, customerReq())).rejects.toThrow('Chỉ có thể đánh giá lịch hẹn đã hoàn thành!');
    await expect(ctrl.reviewMyBooking({ id: 'LH00000003' }, { rating: 4 }, customerReq())).rejects.toBeInstanceOf(NotFoundException);
    await expect(ctrl.reviewMyBooking({ id: 'LH00000004' }, { rating: 4 }, customerReq())).rejects.toThrow('Lịch hẹn không có dịch vụ để đánh giá.');
    await expect(ctrl.reviewMyBooking({ id: 'LH00000099' }, { rating: 4 }, customerReq())).rejects.toBeInstanceOf(NotFoundException);
    expect(await ctrl.reviewMyBooking({ id: 'LH00000003' }, { rating: 3, comment: '' }, customerReq('TK00000002'))).toMatchObject({ id: 'DG00000002' });
  });

  it('concurrent duplicate submissions create exactly one review', async () => {
    const res = await Promise.allSettled([
      ctrl.reviewMyBooking({ id: 'LH00000001' }, { rating: 5 }, customerReq()),
      ctrl.reviewMyBooking({ id: 'LH00000001' }, { rating: 5 }, customerReq()),
    ]);
    expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(res.filter((r) => r.status === 'rejected')[0]).toMatchObject({ reason: expect.any(ConflictException) });
    expect((await rows<{ n: number }>('SELECT count(*) AS n FROM dbo.DanhGia'))[0].n).toBe(1);
  });

  it('reply stores NgayPhanHoi (UTC), is returned as repliedAt, and a review can be replied to only once', async () => {
    await ctrl.reviewMyBooking({ id: 'LH00000001' }, { rating: 5, comment: 'Rất tốt' }, customerReq());
    expect((await ctrl.detail({ id: 'DG00000001' })).status).toBe('Chưa phản hồi');
    expect(await ctrl.reply({ id: 'DG00000001' }, { content: 'Cảm ơn bạn' }, staffReq)).toEqual({ message: 'Gửi phản hồi thành công!' });
    const stored = await rows<{ id: string; at: Date | null }>(`SELECT rtrim(MaPhanHoi) AS id, NgayPhanHoi AS at FROM dbo.PhanHoi`);
    expect(stored[0].id).toBe('PH00000001');
    expect(stored[0].at).toBeInstanceOf(Date);
    const item = await ctrl.detail({ id: 'DG00000001' });
    expect(item).toMatchObject({ status: 'Đã phản hồi', serviceName: 'Massage đá nóng', packageName: '60 phút', customerName: 'Nguyễn An', customerPhone: '0900000001', rating: 5, comment: 'Rất tốt' });
    expect(item.reply).toMatchObject({ id: 'PH00000001', content: 'Cảm ơn bạn', staffName: 'Trần Lan' });
    expect(item.reply?.repliedAt).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
    expect(item.createdAt).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/);
    await expect(ctrl.reply({ id: 'DG00000001' }, { content: 'again' }, staffReq)).rejects.toBeInstanceOf(ConflictException);
    await expect(ctrl.reply({ id: 'DG00000099' }, { content: 'x' }, staffReq)).rejects.toBeInstanceOf(NotFoundException);
    await expect(ctrl.detail({ id: 'DG00000099' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('legacy reply with NULL NgayPhanHoi yields repliedAt empty', async () => {
    await ctrl.reviewMyBooking({ id: 'LH00000001' }, { rating: 5 }, customerReq());
    await pg.exec(`INSERT INTO dbo.PhanHoi(MaPhanHoi,MaDanhGia,MaNhanVien,NoiDungPhanHoi,NgayPhanHoi) VALUES ('PH00000005','DG00000001','NV00000001','Cũ',NULL)`);
    expect((await ctrl.detail({ id: 'DG00000001' })).reply).toMatchObject({ id: 'PH00000005', repliedAt: '' });
  });

  it('list filters by text (case-insensitive name/phone/service), reply status, and paginates newest first', async () => {
    await ctrl.reviewMyBooking({ id: 'LH00000001' }, { rating: 5 }, customerReq());
    await ctrl.reviewMyBooking({ id: 'LH00000003' }, { rating: 2, comment: 'Tạm' }, customerReq('TK00000002'));
    await pg.exec(`UPDATE dbo.DanhGia SET NgayDanhGia='2026-11-10 10:00' WHERE MaDanhGia='DG00000001'; UPDATE dbo.DanhGia SET NgayDanhGia='2026-11-11 10:00' WHERE MaDanhGia='DG00000002'`);
    await ctrl.reply({ id: 'DG00000001' }, { content: 'Cảm ơn' }, staffReq);
    const ids = async (q: object) => (await ctrl.list({ q: '', status: '', page: 1, ...q })).items.map((i) => i.id);
    expect(await ids({})).toEqual(['DG00000002', 'DG00000001']);
    expect(await ids({ status: 'Đã phản hồi' })).toEqual(['DG00000001']);
    expect(await ids({ status: 'Chưa phản hồi' })).toEqual(['DG00000002']);
    expect(await ids({ q: 'nguyễn' })).toEqual(['DG00000001']);
    expect(await ids({ q: '0900000002' })).toEqual(['DG00000002']);
    expect(await ids({ q: 'FACIAL' })).toEqual(['DG00000002']);
    expect(await ids({ q: 'khongco' })).toEqual([]);
    const p2 = await ctrl.list({ q: '', status: '', page: 2 });
    expect(p2).toMatchObject({ items: [], page: 2, hasNext: false });
  });
});
