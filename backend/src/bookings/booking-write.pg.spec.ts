import 'reflect-metadata';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import { PgTestServer, startPgTestServer } from '../testing/pg-test-server';
import { BookingTransactionService } from './booking-transaction.service';
import { BookingWriteService } from './booking-write.service';
import { BookingCancelController } from './booking-cancel.controller';
import { CONFLICT, DAY, FIXTURE_SQL, NOW, adminDto, guest } from './booking-pg-fixtures';

jest.setTimeout(120_000);

describe('BookingWriteService on real PostgreSQL (PGlite)', () => {
  let pg: PgTestServer;
  let db: DatabaseService;
  let service: BookingWriteService;
  let cancel: BookingCancelController;

  const q = <T = Record<string, unknown>>(sql: string, p: unknown[] = []) => db.query<T[]>(sql, p);
  const booking = async (id: string) => (await q<{ status: string; pay: string; date: string; time: string; name: string }>(
    `SELECT TrangThaiLichHen AS status,TrangThaiThanhToan AS pay,to_char(NgayHen,'YYYY-MM-DD') AS date,to_char(GioHen,'HH24:MI') AS time,HoTenNguoiDat AS name FROM dbo.LichHen WHERE MaLichHen=$1`, [id]))[0];
  const details = (id: string) => q<{ bed: string; start: string; end: string }>(
    `SELECT rtrim(MaGiuong) AS bed,to_char(ThoiDiemBatDau,'YYYY-MM-DD"T"HH24:MI:SS') AS start,to_char(ThoiDiemKetThuc,'YYYY-MM-DD"T"HH24:MI:SS') AS "end" FROM dbo.KhachSuDungDichVu WHERE MaLichHen=$1 ORDER BY ThoiDiemBatDau,MaChiTiet`, [id]);
  const create = async (over: Record<string, unknown> = {}) => (await service.createAdmin(adminDto(over) as never)).id;

  beforeAll(async () => {
    pg = await startPgTestServer();
    db = new DatabaseService();
    service = new BookingWriteService(db, new BookingTransactionService(db));
    service.now = () => NOW;
    cancel = new BookingCancelController(db);
  });
  afterAll(async () => { await db.onApplicationShutdown(); await pg.stop(); });
  beforeEach(async () => { await pg.reset(); await pg.exec(FIXTURE_SQL); });

  it('admin create: persists booking + detail, status Chưa đến, links the customer by phone, SQL duration drives the end', async () => {
    const out = await service.createAdmin(adminDto({ notes: 'Dị ứng', guests: [guest({ packageId: 'GO90', customerPhone: '0911111111' })] }) as never);
    expect(out.message).toBe('Tạo lịch hẹn thành công!');
    const b = await booking(out.id);
    expect(b).toMatchObject({ status: 'Chưa đến', pay: 'Chưa thanh toán', date: DAY, time: '09:00' });
    expect(await details(out.id)).toEqual([{ bed: 'G1', start: `${DAY}T09:00:00`, end: `${DAY}T10:30:00` }]);
    const link = await q<{ k: string }>('SELECT rtrim(MaKhachHang) AS k FROM dbo.LichHen WHERE MaLichHen=$1', [out.id]);
    expect(link[0].k).toBe('KH01');
  });

  it('admin create: overlap on the same bed is rejected with the exact message; touching intervals and other beds are fine', async () => {
    await create();
    const err = await create({ guests: [guest({ startsAt: `${DAY}T09:30:00` })] }).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.message).toBe(CONFLICT);
    await create({ guests: [guest({ startsAt: `${DAY}T10:00:00` })] });
    await create({ guests: [guest({ startsAt: `${DAY}T09:30:00`, bedId: 'G2' })] });
  });

  it('admin create: multi-guest booking is atomic (second guest conflict rolls back the first)', async () => {
    await create({ guests: [guest({ bedId: 'G3' })] });
    const before = Number((await q<{ n: number }>('SELECT count(*) AS n FROM dbo.LichHen'))[0].n);
    await expect(create({ guests: [guest({ bedId: 'G4' }), guest({ bedId: 'G3', customerName: 'B' })] })).rejects.toBeInstanceOf(ConflictException);
    expect(Number((await q<{ n: number }>('SELECT count(*) AS n FROM dbo.LichHen'))[0].n)).toBe(before);
  });

  it('admin create: past, out-of-hours, unknown/inactive package are rejected', async () => {
    await expect(create({ date: '2026-11-12', guests: [guest({ startsAt: '2026-11-12T09:00:00' })] })).rejects.toThrow('quá khứ');
    await expect(create({ guests: [guest({ startsAt: `${DAY}T07:30:00` })] })).rejects.toThrow('08:00');
    await expect(create({ guests: [guest({ startsAt: `${DAY}T21:30:00` })] })).rejects.toThrow('08:00');
    await create({ guests: [guest({ startsAt: `${DAY}T21:00:00` })] });
    await expect(create({ guests: [guest({ packageId: 'NOPE' })] })).rejects.toThrow('gói dịch vụ');
    await expect(create({ guests: [guest({ packageId: 'GOOFF' })] })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('cancelled booking frees its slot for a new booking (staff cancel controller)', async () => {
    const id = await create();
    await expect(create()).rejects.toBeInstanceOf(ConflictException);
    await expect(cancel.cancel({ id })).resolves.toEqual({ message: 'Hủy lịch hẹn thành công!' });
    expect((await booking(id)).status).toBe('Đã hủy');
    expect(await details(id)).toHaveLength(1); // history preserved
    await create();
  });

  it('admin update: status-only is optimistic, follows the transition table, rejects locked bookings', async () => {
    const id = await create();
    await expect(service.updateAdmin(id, { status: 'Hoàn thành' })).rejects.toBeInstanceOf(ConflictException);
    await expect(service.updateAdmin(id, { status: 'Đã xác nhận', notes: ' Ghi chú ', bookerName: ' Mai ', bookerEmail: 'a@b.vn' })).resolves.toMatchObject({ message: 'Cập nhật lịch hẹn thành công!' });
    const row = (await q<{ notes: string; name: string; email: string }>('SELECT GhiChu AS notes,HoTenNguoiDat AS name,EmailNguoiDat AS email FROM dbo.LichHen WHERE MaLichHen=$1', [id]))[0];
    expect(row).toEqual({ notes: ' Ghi chú ', name: 'Mai', email: 'a@b.vn' });
    expect((await booking(id)).status).toBe('Đã xác nhận');
    await service.updateAdmin(id, { notes: '', bookerEmail: '' });
    expect((await q<{ notes: string | null; email: string | null }>('SELECT GhiChu AS notes,EmailNguoiDat AS email FROM dbo.LichHen WHERE MaLichHen=$1', [id]))[0]).toEqual({ notes: null, email: null });
    await service.updateAdmin(id, { status: 'Đã đến' });
    await service.updateAdmin(id, { status: 'Hoàn thành' });
    await expect(service.updateAdmin(id, { notes: 'x' })).rejects.toThrow('Không thể chỉnh sửa lịch hẹn đã hoàn thành!');
    await expect(service.updateAdmin('LHNONE', {})).rejects.toBeInstanceOf(NotFoundException);
  });

  it('admin update: payment status is managed by transactions once a payment exists; free edit before', async () => {
    const id = await create();
    await service.updateAdmin(id, { paymentStatus: 'Thanh toán một phần' });
    expect((await booking(id)).pay).toBe('Thanh toán một phần');
    await pg.exec(`INSERT INTO dbo.ThanhToan(MaThanhToan,MaLichHen,SoTienThanhToan,NgayGhiNhan,TrangThaiGiaoDich) VALUES ('TT01','${id}',1000,dbo.vn_now(),'Thành công')`);
    await expect(service.updateAdmin(id, { paymentStatus: 'Đã thanh toán' })).rejects.toThrow('không thể sửa thủ công');
  });

  it('admin update: reschedule by date keeps the time, moves the intervals and is conflict-checked excluding itself', async () => {
    const id = await create({ guests: [guest({ bedId: 'G6' })] });
    await service.updateAdmin(id, { date: '2026-11-14' });
    expect(await details(id)).toEqual([{ bed: 'G6', start: '2026-11-14T09:00:00', end: '2026-11-14T10:00:00' }]);
    expect((await booking(id)).date).toBe('2026-11-14');
    await service.updateAdmin(id, { date: '2026-11-14' }); // same slot: must not conflict with itself
    const other = await create({ date: '2026-11-15', guests: [guest({ bedId: 'G6', startsAt: '2026-11-15T09:00:00' })] });
    expect(other).not.toBe(id);
    // Staff reschedule is strict: it keeps the bed, so a busy bed is a conflict (not a silent bed swap).
    await expect(service.updateAdmin(id, { date: '2026-11-15' })).rejects.toThrow(CONFLICT);
    expect((await details(id))[0]).toEqual({ bed: 'G6', start: '2026-11-14T09:00:00', end: '2026-11-14T10:00:00' });
  });

  it('admin update: replacing guests deletes old details and inserts the new ones under bed locks', async () => {
    const id = await create();
    await service.updateAdmin(id, { guests: [guest({ bedId: 'G7', startsAt: `${DAY}T11:00:00`, packageId: 'GO90' }), guest({ bedId: 'G8', startsAt: `${DAY}T11:00:00`, customerName: 'B' })] } as never);
    expect([...(await details(id))].sort((a, b) => a.bed.localeCompare(b.bed))).toEqual([
      { bed: 'G7', start: `${DAY}T11:00:00`, end: `${DAY}T12:30:00` },
      { bed: 'G8', start: `${DAY}T11:00:00`, end: `${DAY}T12:00:00` },
    ]);
    expect((await booking(id)).time).toBe('11:00');
  });

  it('customer: create assigns the first free active bed, status Chờ xác nhận; needs a customer profile', async () => {
    await create({ guests: [guest({ bedId: 'G1' })] });
    const out = await service.createCustomer('TK01', { fullName: 'Nguyễn Lan', phone: '0900000001', date: DAY, time: '09:00', guests: [{ customerName: 'A', packageId: 'GO60' }] } as never);
    expect(out.status).toBe('Chờ xác nhận');
    expect(await details(out.id)).toEqual([{ bed: 'G2', start: `${DAY}T09:00:00`, end: `${DAY}T10:00:00` }]);
    expect((await booking(out.id)).status).toBe('Chờ xác nhận');
    await expect(service.createCustomer('TKNONE', { fullName: 'A', phone: '0900000001', date: DAY, time: '09:00', guests: [{ customerName: 'A', packageId: 'GO60' }] } as never)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('customer: all 15 beds busy gives the conflict message', async () => {
    for (let i = 1; i <= 15; i++) await create({ guests: [guest({ bedId: `G${i}` })] });
    await expect(service.createCustomer('TK01', { fullName: 'A', phone: '0900000001', date: DAY, time: '09:00', guests: [{ customerName: 'A', packageId: 'GO60' }] } as never)).rejects.toThrow(CONFLICT);
  });

  it('customer: reschedule moves the interval (own booking excluded), only for editable owned bookings', async () => {
    const mine = await service.createCustomer('TK01', { fullName: 'Nguyễn Lan', phone: '0900000001', date: DAY, time: '09:00', guests: [{ customerName: 'A', packageId: 'GO60' }] } as never);
    await expect(service.rescheduleMine('TK01', mine.id, DAY, '09:30')).resolves.toEqual({ id: mine.id, message: 'Đổi lịch hẹn thành công!' });
    expect(await details(mine.id)).toEqual([{ bed: 'G1', start: `${DAY}T09:30:00`, end: `${DAY}T10:30:00` }]);
    await expect(service.rescheduleMine('TK02', mine.id, DAY, '11:00')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.rescheduleMine('TK01', mine.id, '2026-11-12', '09:00')).rejects.toThrow('quá khứ');
    await expect(service.rescheduleMine('TK01', mine.id, DAY, '21:30')).rejects.toThrow('08:00');
    await pg.exec(`UPDATE dbo.LichHen SET TrangThaiLichHen='Đã đến' WHERE MaLichHen='${mine.id}'`);
    await expect(service.rescheduleMine('TK01', mine.id, DAY, '11:00')).rejects.toThrow('không thể đổi');
  });

  it('customer: cancelMine handles ok, repeat, not-owner, arrived and completed', async () => {
    const mine = await service.createCustomer('TK01', { fullName: 'Nguyễn Lan', phone: '0900000001', date: DAY, time: '09:00', guests: [{ customerName: 'A', packageId: 'GO60' }] } as never);
    await expect(service.cancelMine('TK02', mine.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.cancelMine('TK01', mine.id)).resolves.toEqual({ message: 'Hủy lịch hẹn thành công!' });
    await expect(service.cancelMine('TK01', mine.id)).rejects.toThrow('đã được hủy');
    const arrived = await create({ guests: [guest({ bedId: 'G9' })] });
    await pg.exec(`UPDATE dbo.LichHen SET MaKhachHang='KH01',TrangThaiLichHen='Đã đến' WHERE MaLichHen='${arrived}'`);
    await expect(service.cancelMine('TK01', arrived)).rejects.toThrow('không thể hủy');
    await pg.exec(`UPDATE dbo.LichHen SET TrangThaiLichHen='Hoàn thành' WHERE MaLichHen='${arrived}'`);
    await expect(service.cancelMine('TK01', arrived)).rejects.toThrow('đã hoàn thành');
  });

  it('search: filters by date/status/keyword/name/phone/email/code/service/date range, escapes wildcards, case-insensitive', async () => {
    const a = await create({ bookerName: 'Nguyễn Lan', guests: [guest({ customerName: 'Hoa Hồng', customerPhone: '0911222333' })], notes: 'x' });
    const b = await create({ bookerName: 'Trần Mai', bookerPhone: '0900000002', bookerEmail: 'mai@spa.vn', date: '2026-11-20', guests: [guest({ bedId: 'G2', customerName: 'Cúc', startsAt: '2026-11-20T14:00:00', packageId: 'GO90' })] });
    await pg.exec(`UPDATE dbo.LichHen SET TrangThaiLichHen='Đã xác nhận' WHERE MaLichHen='${b}'`);
    const ids = async (query: Record<string, unknown>) => (await service.search(query as never)).items.map((i) => i.bookingId);
    expect(await ids({})).toEqual([a, b]);
    expect(await ids({ date: DAY })).toEqual([a]);
    expect(await ids({ status: 'Đã xác nhận' })).toEqual([b]);
    expect(await ids({ q: 'HOA hồng' })).toEqual([a]);
    expect(await ids({ q: a.toLowerCase() })).toEqual([a]);
    expect(await ids({ name: 'trần' })).toEqual([b]);
    expect(await ids({ phone: '+84911222333' })).toEqual([a]);
    expect(await ids({ email: 'MAI@' })).toEqual([b]);
    expect(await ids({ code: b })).toEqual([b]);
    expect(await ids({ service: 'thư giãn' })).toEqual([a, b]);
    expect(await ids({ service: '90 phút' })).toEqual([b]);
    expect(await ids({ dateFrom: '2026-11-15', dateTo: '2026-11-30' })).toEqual([b]);
    expect(await ids({ q: '%' })).toEqual([]);
    expect(await ids({ q: '[' })).toEqual([]);
    const full = (await service.search({ date: '2026-11-20' } as never)).items[0];
    expect(full).toMatchObject({ bedId: 'G2', customerName: 'Cúc', packageId: 'GO90', status: 'Đã xác nhận', startsAt: '2026-11-20T14:00:00', endsAt: '2026-11-20T15:30:00', startMinute: 840, endMinute: 930 });
    expect((await service.search({ source: 'Zalo' } as never)).warnings).toHaveLength(1);
  });
});
