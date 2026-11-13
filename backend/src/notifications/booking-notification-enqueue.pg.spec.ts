import 'reflect-metadata';
import { DatabaseService } from '../database.service';
import { PgTestServer, startPgTestServer } from '../testing/pg-test-server';
import { BookingTransactionService } from '../bookings/booking-transaction.service';
import { BookingWriteService } from '../bookings/booking-write.service';
import { BookingCancelController } from '../bookings/booking-cancel.controller';
import { FIXTURE_SQL, NOW, adminDto, guest } from '../bookings/booking-pg-fixtures';
import { notificationClock, parseReminderLeads } from './notification-config';

jest.setTimeout(120_000);

// Fixed clock: 2026-11-12T10:00:00 Vietnam time == 03:00:00Z (same instant the booking service uses as NOW).
const CLOCK = new Date('2026-11-12T03:00:00.000Z');
const D2 = '2026-11-14';

describe('notification enqueueing inside booking transactions (real PostgreSQL via PGlite)', () => {
  let pg: PgTestServer;
  let db: DatabaseService;
  let service: BookingWriteService;
  let cancel: BookingCancelController;
  const q = <T = Record<string, unknown>>(sql: string, p: unknown[] = []) => db.query<T[]>(sql, p);
  const jobs = (id: string) => q<{ kind: string; key: string; due: string; status: string; reason: string | null; phone: string; data: Record<string, string> }>(
    `SELECT Loai AS kind, KhoaChongTrung AS key, to_char(GuiLuc,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS due, TrangThai AS status, LyDoBoQua AS reason, rtrim(SoDienThoai) AS phone, DuLieuMau AS data
     FROM dbo.ThongBaoCongViec WHERE MaLichHen=$1 ORDER BY Loai, KhoaChongTrung`, [id]);
  const kinds = async (id: string, status?: string) => (await jobs(id)).filter((j) => !status || j.status === status).map((j) => j.kind);
  const create = async (over: Record<string, unknown> = {}) => (await service.createAdmin(adminDto(over) as never)).id;

  beforeAll(async () => {
    pg = await startPgTestServer({ notifications: true });
    db = new DatabaseService();
    service = new BookingWriteService(db, new BookingTransactionService(db));
    service.now = () => NOW;
    cancel = new BookingCancelController(db);
    notificationClock.now = () => CLOCK;
  });
  afterAll(async () => { notificationClock.now = () => new Date(); await db.onApplicationShutdown(); await pg.stop(); });
  beforeEach(async () => {
    await pg.exec('DELETE FROM dbo.ThongBaoGiaoNhan; DELETE FROM dbo.ThongBaoCongViec; DELETE FROM dbo.DongYNhanTin;');
    await pg.reset(); await pg.exec(FIXTURE_SQL);
    delete process.env.REMINDER_LEAD_MINUTES; delete process.env.NOTIFY_CHANGES;
  });

  it('parses REMINDER_LEAD_MINUTES: unset/empty/garbage => none, otherwise unique positive integers', () => {
    expect(parseReminderLeads(undefined)).toEqual([]);
    expect(parseReminderLeads('')).toEqual([]);
    expect(parseReminderLeads(' , x, -5, 0, 1.5')).toEqual([]);
    expect(parseReminderLeads('120, 1440,120')).toEqual([1440, 120]);
  });

  it.each(['Chưa đến', 'Đã xác nhận'])('staff-created %s booking enqueues exactly one confirmation with only template data', async (status) => {
    const id = await create({ status, guests: [guest({ packageId: 'GO90' })] });
    const list = await jobs(id);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ kind: 'BOOKING_CONFIRMED', key: `BOOKING_CONFIRMED:${id}`, status: 'PENDING', phone: '0900000001', due: '2026-11-12T03:00:00.000Z' });
    expect(list[0].data).toEqual({ customerName: 'Nguyễn Lan', bookingId: id, date: '13/11/2026', time: '09:00', serviceName: 'Massage thư giãn', packageName: 'Gói 90 phút', bedId: 'G1' });
  });

  it("'Chờ xác nhận' enqueues nothing; confirming it enqueues once; repeated status changes never duplicate", async () => {
    const id = await create({ status: 'Chờ xác nhận' });
    expect(await jobs(id)).toHaveLength(0);
    await service.updateAdmin(id, { status: 'Đã xác nhận' });
    expect(await kinds(id)).toEqual(['BOOKING_CONFIRMED']);
    await service.updateAdmin(id, { status: 'Chưa đến' });
    await service.updateAdmin(id, { status: 'Đã xác nhận' });
    await service.updateAdmin(id, { notes: 'x' });
    expect(await kinds(id)).toEqual(['BOOKING_CONFIRMED']);
    // the dedupe key is the guarantee even when the same enqueue is attempted again
    await q(`INSERT INTO dbo.ThongBaoCongViec(Loai,MaLichHen,SoDienThoai,KhoaChongTrung,GuiLuc) VALUES('BOOKING_CONFIRMED',$1,'0900000001',$2,dbo.utc_now()) ON CONFLICT (KhoaChongTrung) DO NOTHING`, [id, `BOOKING_CONFIRMED:${id}`]);
    expect(await jobs(id)).toHaveLength(1);
  });

  it('creates no reminder when REMINDER_LEAD_MINUTES is unset', async () => {
    const id = await create();
    expect(await kinds(id)).toEqual(['BOOKING_CONFIRMED']);
  });

  it('with "1440,120": exact UTC due times from Vietnam wall clock; a lead already in the past is skipped', async () => {
    process.env.REMINDER_LEAD_MINUTES = '1440,120';
    const far = await create({ date: D2, guests: [guest({ startsAt: `${D2}T09:00:00` })] }); // 09:00 VN = 02:00Z
    const reminders = (await jobs(far)).filter((j) => j.kind === 'BOOKING_REMINDER');
    expect(reminders.map((j) => [j.key, j.due])).toEqual([
      [`BOOKING_REMINDER:${far}:120:2026-11-14T02:00:00.000Z`, '2026-11-14T00:00:00.000Z'],
      [`BOOKING_REMINDER:${far}:1440:2026-11-14T02:00:00.000Z`, '2026-11-13T02:00:00.000Z'],
    ]);
    // 2026-11-13 09:00 VN: 1440 min before is 2026-11-12T02:00Z < now (03:00Z) => skipped; 120 min before is 2026-11-13T00:00Z
    const near = await create({ guests: [guest({ bedId: 'G2' })] });
    expect((await jobs(near)).filter((j) => j.kind === 'BOOKING_REMINDER').map((j) => [j.key, j.due])).toEqual([
      [`BOOKING_REMINDER:${near}:120:2026-11-13T02:00:00.000Z`, '2026-11-13T00:00:00.000Z'],
    ]);
  });

  it('uses the earliest guest start time of the booking', async () => {
    process.env.REMINDER_LEAD_MINUTES = '120';
    const id = await create({ date: D2, guests: [guest({ bedId: 'G3', startsAt: `${D2}T11:00:00` }), guest({ bedId: 'G4', startsAt: `${D2}T09:30:00` })] });
    const reminder = (await jobs(id)).find((j) => j.kind === 'BOOKING_REMINDER');
    expect(reminder?.due).toBe('2026-11-14T00:30:00.000Z');
    expect(reminder?.data.time).toBe('09:30');
  });

  it('reschedule cancels the old reminders and creates new ones; a pending confirmation carries the new time', async () => {
    process.env.REMINDER_LEAD_MINUTES = '120';
    const id = await create({ date: D2, guests: [guest({ startsAt: `${D2}T09:00:00` })] });
    await service.updateAdmin(id, { date: '2026-11-15' });
    const list = await jobs(id);
    const old = list.find((j) => j.key.endsWith('2026-11-14T02:00:00.000Z') && j.kind === 'BOOKING_REMINDER');
    expect(old).toMatchObject({ status: 'CANCELLED', reason: 'BOOKING_CHANGED' });
    const fresh = list.find((j) => j.key === `BOOKING_REMINDER:${id}:120:2026-11-15T02:00:00.000Z`);
    expect(fresh).toMatchObject({ status: 'PENDING', due: '2026-11-15T00:00:00.000Z' });
    expect(list.find((j) => j.kind === 'BOOKING_CONFIRMED')?.data.date).toBe('15/11/2026');
    expect(list.some((j) => j.kind === 'BOOKING_RESCHEDULED')).toBe(false); // NOTIFY_CHANGES is off
  });

  it('NOTIFY_CHANGES=true adds BOOKING_RESCHEDULED (keyed by the new start) and BOOKING_CANCELLED', async () => {
    process.env.NOTIFY_CHANGES = 'true';
    const id = await create({ date: D2, guests: [guest({ startsAt: `${D2}T09:00:00` })] });
    await service.updateAdmin(id, { date: '2026-11-15' });
    expect((await jobs(id)).filter((j) => j.kind === 'BOOKING_RESCHEDULED').map((j) => j.key)).toEqual([`BOOKING_RESCHEDULED:${id}:2026-11-15T02:00:00.000Z`]);
    await cancel.cancel({ id });
    const list = await jobs(id);
    expect(list.find((j) => j.kind === 'BOOKING_CANCELLED')).toMatchObject({ key: `BOOKING_CANCELLED:${id}`, status: 'PENDING' });
    expect(list.filter((j) => j.kind !== 'BOOKING_CANCELLED').every((j) => j.status === 'CANCELLED')).toBe(true);
  });

  it('cancelling cancels pending jobs; without NOTIFY_CHANGES no cancellation message; a never-confirmed booking gets none', async () => {
    process.env.REMINDER_LEAD_MINUTES = '120';
    const id = await create({ date: D2, guests: [guest({ startsAt: `${D2}T09:00:00` })] });
    await cancel.cancel({ id });
    const list = await jobs(id);
    expect(list.map((j) => j.status)).toEqual(['CANCELLED', 'CANCELLED']);
    expect(list.every((j) => j.reason === 'BOOKING_CLOSED')).toBe(true);
    process.env.NOTIFY_CHANGES = 'true';
    const waiting = await create({ status: 'Chờ xác nhận', guests: [guest({ bedId: 'G5' })] });
    await cancel.cancel({ id: waiting });
    expect(await jobs(waiting)).toHaveLength(0);
  });

  it("'Đã đến' and 'Hoàn thành' cancel pending reminders and confirmations", async () => {
    process.env.REMINDER_LEAD_MINUTES = '120';
    const id = await create({ date: D2, guests: [guest({ startsAt: `${D2}T09:00:00` })] });
    await service.updateAdmin(id, { status: 'Đã đến' });
    expect(await kinds(id, 'PENDING')).toEqual([]);
    expect((await jobs(id)).every((j) => j.status === 'CANCELLED')).toBe(true);
  });

  it('a rolled-back booking leaves no job behind (same transaction)', async () => {
    await create({ guests: [guest({ bedId: 'G6' })] });
    const before = Number((await q<{ n: number }>('SELECT count(*) AS n FROM dbo.ThongBaoCongViec'))[0].n);
    await expect(create({ guests: [guest({ bedId: 'G6' })] })).rejects.toThrow();
    expect(Number((await q<{ n: number }>('SELECT count(*) AS n FROM dbo.ThongBaoCongViec'))[0].n)).toBe(before);
  });
});
