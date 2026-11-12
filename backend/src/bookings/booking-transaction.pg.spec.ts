import 'reflect-metadata';
import { BadRequestException, ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { QueryRunner } from 'typeorm';
import { DatabaseService } from '../database.service';
import { PgTestServer, startPgTestServer } from '../testing/pg-test-server';
import { BedInterval, BookingTransactionService, cancelUnderLocks } from './booking-transaction.service';
import { CONFLICT, FIXTURE_SQL } from './booking-pg-fixtures';

jest.setTimeout(120_000);

describe('BookingTransactionService on real PostgreSQL (PGlite)', () => {
  let pg: PgTestServer;
  let db: DatabaseService;
  let service: BookingTransactionService;
  let seq = 0;
  const slot = (start = '09:00:00', end = '10:00:00', bedId = 'G1'): BedInterval => ({ bedId, startsAt: `2099-12-20T${start}`, endsAt: `2099-12-20T${end}` });
  const insert = async (runner: QueryRunner, s: BedInterval, booking = 'LH01') => {
    const id = 'CT' + String(++seq).padStart(4, '0');
    await runner.query(`INSERT INTO dbo.KhachSuDungDichVu(MaChiTiet,MaLichHen,MaGoi,MaGiuong,TenKhach,ThoiDiemBatDau,ThoiDiemKetThuc)
      VALUES($1,$2,'GO60',$3,'Khách',$4::timestamp,$5::timestamp)`, [id, booking, s.bedId, s.startsAt, s.endsAt]);
    return id;
  };
  const count = async () => Number((await db.query<{ n: number }[]>('SELECT count(*) AS n FROM dbo.KhachSuDungDichVu'))[0].n);

  beforeAll(async () => { pg = await startPgTestServer(); db = new DatabaseService(); service = new BookingTransactionService(db); });
  afterAll(async () => { await db.onApplicationShutdown(); await pg.stop(); });
  beforeEach(async () => {
    await pg.reset();
    await pg.exec(FIXTURE_SQL + `INSERT INTO dbo.LichHen(MaLichHen,MaKhachHang,HoTenNguoiDat,SoDienThoaiNguoiDat,NgayHen,GioHen,TrangThaiLichHen,TrangThaiThanhToan)
      VALUES ('LH01','KH01','Nguyễn Lan','0900000001','2099-12-20','09:00','Chưa đến','Chưa thanh toán'),('LH02','KH02','Trần Mai','0900000002','2099-12-20','09:00','Chưa đến','Chưa thanh toán');`);
  });

  it('reserves a free slot and commits the write', async () => {
    await expect(service.reserve([slot()], (r) => insert(r, slot()))).resolves.toMatch(/^CT/);
    expect(await count()).toBe(1);
  });

  it('rejects an overlapping slot on the same bed with the exact conflict message, but not another bed', async () => {
    await service.reserve([slot()], (r) => insert(r, slot()));
    const overlap = slot('09:30:00', '10:30:00');
    const err = await service.reserve([overlap], (r) => insert(r, overlap)).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.message).toBe(CONFLICT);
    const other = slot('09:30:00', '10:30:00', 'G2');
    await expect(service.reserve([other], (r) => insert(r, other))).resolves.toMatch(/^CT/);
    expect(await count()).toBe(2);
  });

  it('allows touching intervals and rejects a one-minute overlap', async () => {
    await service.reserve([slot()], (r) => insert(r, slot()));
    const after = slot('10:00:00', '11:00:00');
    await service.reserve([after], (r) => insert(r, after));
    const before = slot('08:00:00', '09:00:00');
    await service.reserve([before], (r) => insert(r, before));
    const overlap = slot('09:59:00', '10:30:00');
    await expect(service.reserve([overlap], (r) => insert(r, overlap))).rejects.toBeInstanceOf(ConflictException);
  });

  it('frees the slot of a cancelled booking and lets excludeBookingId ignore the booking being moved', async () => {
    await service.reserve([slot()], (r) => insert(r, slot()));
    await expect(service.reserve([slot()], (r) => insert(r, slot(), 'LH02'))).rejects.toBeInstanceOf(ConflictException);
    await expect(service.reserve([slot()], (r) => insert(r, slot(), 'LH02'), 'LH01')).resolves.toMatch(/^CT/);
    await pg.exec(`DELETE FROM dbo.KhachSuDungDichVu WHERE MaLichHen='LH02'`);
    await pg.exec(`UPDATE dbo.LichHen SET TrangThaiLichHen='Đã hủy' WHERE MaLichHen='LH01'`);
    await expect(service.reserve([slot()], (r) => insert(r, slot(), 'LH02'))).resolves.toMatch(/^CT/);
  });

  it('rejects overlapping guests of the same request, bad input, unknown beds', async () => {
    const a = slot('09:00:00', '10:00:00'), b = slot('09:30:00', '10:30:00');
    await expect(service.reserve([a, b], async () => 1)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.reserve([], async () => 1)).rejects.toThrow('Vui lòng nhập thông tin khách');
    await expect(service.reserve([{ ...a, bedId: 'G99' }], async () => 1)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.reserve([{ ...a, endsAt: a.startsAt }], async () => 1)).rejects.toBeInstanceOf(BadRequestException);
    // G17 is syntactically valid but not seeded (only G1-G15): the bed-lock query finds no row.
    await expect(service.reserve([slot('09:00:00', '10:00:00', 'G17')], async () => 1)).rejects.toThrow('Giường không tồn tại.');
  });

  it('rolls back a failed writer (503) and releases the bed', async () => {
    await expect(service.reserve([slot()], async (r) => { await insert(r, slot()); throw new Error('Test-only failure'); })).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(await count()).toBe(0);
    await expect(service.reserve([slot()], (r) => insert(r, slot()))).resolves.toMatch(/^CT/);
  });

  it('locks several beds in ascending order inside one reservation', async () => {
    const s = [slot('09:00:00', '10:00:00', 'G10'), slot('09:00:00', '10:00:00', 'G2'), slot('09:00:00', '10:00:00', 'G1')];
    await service.reserve(s, async (r) => { for (const x of s) await insert(r, x); });
    expect(await count()).toBe(3);
  });

  it('cancelUnderLocks: missing, completed, cancelled, arrived, ok and ownership filter', async () => {
    const run = (id: string, o: { ownerAccountId?: string; blockArrived: boolean }) => db.transaction((r) => cancelUnderLocks(r, id, o));
    await service.reserve([slot()], (r) => insert(r, slot()));
    expect(await run('NOPE', { blockArrived: false })).toBe('missing');
    expect(await run('LH01', { ownerAccountId: 'TK02', blockArrived: true })).toBe('missing');
    await pg.exec(`UPDATE dbo.LichHen SET TrangThaiLichHen='Đã đến' WHERE MaLichHen='LH01'`);
    expect(await run('LH01', { ownerAccountId: 'TK01', blockArrived: true })).toBe('arrived');
    expect(await run('LH01', { blockArrived: false })).toBe('ok');
    expect(await run('LH01', { blockArrived: false })).toBe('cancelled');
    await pg.exec(`UPDATE dbo.LichHen SET TrangThaiLichHen='Hoàn thành' WHERE MaLichHen='LH02'`);
    expect(await run('LH02', { blockArrived: false })).toBe('completed');
    expect(await count()).toBe(1);
  });

  it('serialises concurrent overlapping reservations of one bed: exactly one wins, the rest get the conflict', async () => {
    const s = slot('14:00:00', '15:00:00', 'G5');
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => service.reserve([s], (r) => insert(r, s))));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rejected).toHaveLength(5);
    for (const r of rejected) { expect(r.reason).toBeInstanceOf(ConflictException); expect(r.reason.message).toBe(CONFLICT); }
    expect(await count()).toBe(1);
  });
});
