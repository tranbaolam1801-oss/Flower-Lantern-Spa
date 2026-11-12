import 'reflect-metadata';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import { PgTestServer, startPgTestServer } from '../testing/pg-test-server';
import { BookingReadController } from './booking-read.controller';
import { BookingCancelController } from './booking-cancel.controller';
import { FIXTURE_SQL } from './booking-pg-fixtures';

jest.setTimeout(120_000);

describe('BookingReadController / BookingCancelController on real PostgreSQL (PGlite)', () => {
  let pg: PgTestServer;
  let db: DatabaseService;
  let read: BookingReadController;
  let cancel: BookingCancelController;

  beforeAll(async () => { pg = await startPgTestServer(); db = new DatabaseService(); read = new BookingReadController(db); cancel = new BookingCancelController(db); });
  afterAll(async () => { await db.onApplicationShutdown(); await pg.stop(); });
  beforeEach(async () => {
    await pg.reset();
    await pg.exec(FIXTURE_SQL + `
      INSERT INTO dbo.LichHen(MaLichHen,MaKhachHang,HoTenNguoiDat,SoDienThoaiNguoiDat,NgayHen,GioHen,TrangThaiLichHen,TrangThaiThanhToan,ThoiGianDat) VALUES
        ('LH01','KH01','Nguyễn Lan','0900000001','2026-11-10','09:00','Chưa đến','Chưa thanh toán','2026-11-01 08:00:00'),
        ('LH02','KH02','Trần Mai','0900000002','2026-11-10','10:00','Chờ xác nhận','Chưa thanh toán','2026-11-02 08:00:00');
      INSERT INTO dbo.KhachSuDungDichVu(MaChiTiet,MaLichHen,MaGoi,MaGiuong,TenKhach,SoDienThoai,ThoiDiemBatDau,ThoiDiemKetThuc) VALUES
        ('CT01','LH01','GO60','G1','Nguyễn Lan','0900000001','2026-11-10 09:00:00','2026-11-10 10:00:00'),
        ('CT02','LH02','GO90','G10','Trần Mai',NULL,'2026-11-10 10:00:00','2026-11-10 11:30:00');`);
  });

  it('calendar: 15 beds in numeric order, items with actual minutes, packageId and guest phone', async () => {
    const out = await read.calendar({ date: '2026-11-10' }) as { date: string; beds: { id: string }[]; items: Record<string, unknown>[] };
    expect(out.date).toBe('2026-11-10');
    expect(out.beds.map((b) => b.id)).toEqual(Array.from({ length: 15 }, (_, i) => `G${i + 1}`));
    expect(out.items).toHaveLength(2);
    expect(out.items[0]).toMatchObject({ id: 'CT01', bookingId: 'LH01', bedId: 'G1', customerName: 'Nguyễn Lan', customerPhone: '0900000001', packageId: 'GO60', serviceName: 'Massage thư giãn', packageName: 'Gói 60 phút', status: 'Chưa đến', paymentStatus: 'Chưa thanh toán', bookerName: 'Nguyễn Lan', bookerPhone: '0900000001', startsAt: '2026-11-10T09:00:00', endsAt: '2026-11-10T10:00:00', startMinute: 540, endMinute: 600 });
    expect(out.items[1]).toMatchObject({ bedId: 'G10', startMinute: 600, endMinute: 690, customerPhone: null });
  });

  it('calendar: empty day returns all beds and no items; default date is today in Vietnam', async () => {
    const empty = await read.calendar({ date: '2026-11-11' }) as { items: unknown[]; beds: unknown[] };
    expect(empty.items).toEqual([]);
    expect(empty.beds).toHaveLength(15);
    expect((await read.calendar({})).date).toMatch(/^\d{4}-\d\d-\d\d$/);
  });

  it('me/bookings: only owned bookings, newest first, confirmed-status mapping, service lines', async () => {
    const req = (sub: string) => ({ user: { sub } }) as never;
    const mine = await read.mine(req('TK01'));
    expect(mine.items).toHaveLength(1);
    expect(mine.items[0]).toMatchObject({ id: 'LH01', date: '2026-11-10', time: '09:00', createdAt: '2026-11-01T08:00:00', status: 'Đã xác nhận', paymentStatus: 'Chưa thanh toán' });
    expect(mine.items[0].services).toEqual([{ id: 'CT01', name: 'Massage thư giãn', packageName: 'Gói 60 phút', startsAt: '09:00', endsAt: '10:00' }]);
    expect(JSON.stringify(mine)).not.toContain('Trần Mai');
    const other = await read.mine(req('TK02'));
    expect(other.items[0]).toMatchObject({ id: 'LH02', status: 'Chờ xác nhận' });
    expect((await read.mine(req('TKNONE'))).items).toEqual([]);
  });

  it('cancel controller: 404 missing, 409 completed/cancelled, success keeps details and payment status', async () => {
    await expect(cancel.cancel({ id: 'MISSING' })).rejects.toBeInstanceOf(NotFoundException);
    await pg.exec(`UPDATE dbo.LichHen SET TrangThaiLichHen='Hoàn thành' WHERE MaLichHen='LH02'`);
    await expect(cancel.cancel({ id: 'LH02' })).rejects.toThrow('Không thể hủy lịch hẹn đã hoàn thành!');
    await pg.exec(`UPDATE dbo.LichHen SET TrangThaiLichHen='Chưa đến' WHERE MaLichHen='LH02'`);
    await expect(cancel.cancel({ id: 'LH02' })).resolves.toEqual({ message: 'Hủy lịch hẹn thành công!' });
    await expect(cancel.cancel({ id: 'LH02' })).rejects.toBeInstanceOf(ConflictException);
    await expect(cancel.cancel({ id: 'LH02' })).rejects.toThrow('Lịch hẹn này đã được hủy!');
    const rows = await db.query<{ s: string; p: string; n: number }[]>(
      `SELECT l.TrangThaiLichHen AS s,l.TrangThaiThanhToan AS p,(SELECT count(*) FROM dbo.KhachSuDungDichVu WHERE MaLichHen='LH02') AS n FROM dbo.LichHen l WHERE MaLichHen='LH02'`);
    expect(rows[0]).toEqual({ s: 'Đã hủy', p: 'Chưa thanh toán', n: 1 });
  });
});
