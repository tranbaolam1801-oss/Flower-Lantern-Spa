import 'reflect-metadata';
import { DatabaseService } from '../database.service';
import { PgTestServer, startPgTestServer } from '../testing/pg-test-server';
import { BookingTransactionService } from '../bookings/booking-transaction.service';
import { BookingWriteService } from '../bookings/booking-write.service';
import { FIXTURE_SQL, NOW, adminDto, guest } from '../bookings/booking-pg-fixtures';
import { MockMessageProvider, ProviderPermanentError, ProviderTemporaryError } from '../messaging/message-provider';
import { notificationClock } from './notification-config';
import { NotificationDispatcherService } from './notification-dispatcher.service';

jest.setTimeout(180_000);

const CLOCK = new Date('2026-11-12T03:00:00.000Z'); // 10:00 Vietnam time
const D2 = '2026-11-14';

describe('NotificationDispatcherService on real PostgreSQL (PGlite)', () => {
  let pg: PgTestServer;
  let db: DatabaseService;
  let service: BookingWriteService;
  let provider: MockMessageProvider;
  let dispatcher: NotificationDispatcherService;
  const q = <T = Record<string, unknown>>(sql: string, p: unknown[] = []) => db.query<T[]>(sql, p);
  const create = async (over: Record<string, unknown> = {}) => (await service.createAdmin(adminDto(over) as never)).id;
  const consent = () => q("INSERT INTO dbo.DongYNhanTin(SoDienThoai,Kenh,Nguon) VALUES('0900000001','ZALO','REGISTRATION') ON CONFLICT DO NOTHING");
  const makeDue = () => q("UPDATE dbo.ThongBaoCongViec SET GuiLuc='2000-01-01', ThuLaiLuc=NULL WHERE TrangThai IN ('PENDING','SENDING')");
  const job = async (id: string) => (await q<{ status: string; attempts: number; reason: string | null; retryMin: number | null }>(
    `SELECT TrangThai AS status, SoLanThu AS attempts, LyDoBoQua AS reason, round(extract(epoch FROM (ThuLaiLuc-CapNhatLuc))/60)::int AS "retryMin" FROM dbo.ThongBaoCongViec WHERE MaLichHen=$1 AND Loai='BOOKING_CONFIRMED'`, [id]))[0];
  const deliveries = () => q<{ provider: string; status: string; ref: string | null; code: string | null }>(
    'SELECT NhaCungCap AS provider, TrangThai AS status, MaThamChieuNhaCungCap AS ref, MaLoi AS code FROM dbo.ThongBaoGiaoNhan ORDER BY MaGiaoNhan');

  beforeAll(async () => {
    pg = await startPgTestServer({ notifications: true });
    db = new DatabaseService();
    service = new BookingWriteService(db, new BookingTransactionService(db));
    service.now = () => NOW;
    provider = new MockMessageProvider();
    dispatcher = new NotificationDispatcherService(db, provider);
  });
  afterAll(async () => { notificationClock.now = () => new Date(); await db.onApplicationShutdown(); await pg.stop(); });
  beforeEach(async () => {
    await pg.exec('DELETE FROM dbo.ThongBaoGiaoNhan; DELETE FROM dbo.ThongBaoCongViec; DELETE FROM dbo.DongYNhanTin;');
    await pg.reset(); await pg.exec(FIXTURE_SQL);
    provider.clear();
    notificationClock.now = () => CLOCK;
    delete process.env.REMINDER_LEAD_MINUTES; delete process.env.NOTIFY_CHANGES;
  });

  it('sends through the provider, records SENT and one delivery row; a second dispatch sends nothing', async () => {
    const id = await create({ guests: [guest({ packageId: 'GO90' })] });
    await consent(); await makeDue();
    expect(await dispatcher.dispatch()).toEqual({ claimed: 1, sent: 1, retried: 0, failed: 0, skipped: 0 });
    expect(provider.notifications).toEqual([{ phone: '0900000001', kind: 'BOOKING_CONFIRMED', data: expect.objectContaining({ bookingId: id, date: '13/11/2026', time: '09:00', packageName: 'Gói 90 phút' }) }]);
    expect(await job(id)).toMatchObject({ status: 'SENT', attempts: 1 });
    expect(await deliveries()).toEqual([{ provider: 'MOCK', status: 'SENT', ref: 'mock-msg-1', code: null }]);
    expect(await dispatcher.dispatch()).toEqual({ claimed: 0, sent: 0, retried: 0, failed: 0, skipped: 0 });
    expect(provider.notifications).toHaveLength(1);
  });

  it('does not claim jobs that are not due yet', async () => {
    await create(); await consent();
    await q("UPDATE dbo.ThongBaoCongViec SET GuiLuc=dbo.utc_now() + interval '1 hour'");
    expect((await dispatcher.dispatch()).claimed).toBe(0);
  });

  it('skips without an active consent (never opted in, or revoked)', async () => {
    const id = await create(); await makeDue();
    expect(await dispatcher.dispatch()).toMatchObject({ claimed: 1, skipped: 1, sent: 0 });
    expect(await job(id)).toMatchObject({ status: 'SKIPPED', reason: 'NO_CONSENT' });
    const id2 = await create({ guests: [guest({ bedId: 'G2' })] });
    await consent(); await q("UPDATE dbo.DongYNhanTin SET ThuHoiLuc=dbo.utc_now()"); await makeDue();
    await dispatcher.dispatch();
    expect(await job(id2)).toMatchObject({ status: 'SKIPPED', reason: 'NO_CONSENT' });
    expect(provider.notifications).toHaveLength(0);
  });

  it('skips when the booking is cancelled/missing status changed since enqueue (re-validated at send time)', async () => {
    const id = await create(); await consent(); await makeDue();
    await q("UPDATE dbo.LichHen SET TrangThaiLichHen='Đã hủy' WHERE MaLichHen=$1", [id]);
    expect(await dispatcher.dispatch()).toMatchObject({ skipped: 1, sent: 0 });
    expect(await job(id)).toMatchObject({ status: 'SKIPPED', reason: 'BOOKING_NOT_ELIGIBLE' });
    expect(provider.notifications).toHaveLength(0);
  });

  it('skips an expired reminder (start time already past) and a reminder whose booking time changed', async () => {
    process.env.REMINDER_LEAD_MINUTES = '120';
    const id = await create({ date: D2, guests: [guest({ startsAt: `${D2}T09:00:00` })] });
    await consent();
    await q("DELETE FROM dbo.ThongBaoCongViec WHERE Loai='BOOKING_CONFIRMED'");
    await makeDue();
    notificationClock.now = () => new Date('2026-11-14T03:00:00.000Z'); // 10:00 VN on the day, after the 09:00 start
    await dispatcher.dispatch();
    expect((await q<{ status: string; reason: string }>("SELECT TrangThai AS status, LyDoBoQua AS reason FROM dbo.ThongBaoCongViec WHERE Loai='BOOKING_REMINDER'"))[0]).toEqual({ status: 'SKIPPED', reason: 'EXPIRED' });

    notificationClock.now = () => CLOCK;
    await q("UPDATE dbo.ThongBaoCongViec SET TrangThai='PENDING', LyDoBoQua=NULL WHERE Loai='BOOKING_REMINDER'");
    await q("UPDATE dbo.KhachSuDungDichVu SET ThoiDiemBatDau=ThoiDiemBatDau + interval '1 hour', ThoiDiemKetThuc=ThoiDiemKetThuc + interval '1 hour' WHERE MaLichHen=$1", [id]);
    await makeDue();
    await dispatcher.dispatch();
    expect((await q<{ reason: string }>("SELECT LyDoBoQua AS reason FROM dbo.ThongBaoCongViec WHERE Loai='BOOKING_REMINDER'"))[0].reason).toBe('BOOKING_CHANGED');
    expect(provider.notifications).toHaveLength(0);
  });

  it('temporary error: RETRY row with backoff 1/5/15/30 minutes, then FAILED after 5 attempts', async () => {
    const id = await create(); await consent();
    const expected: [string, number | null][] = [['PENDING', 1], ['PENDING', 5], ['PENDING', 15], ['PENDING', 30], ['FAILED', null]];
    for (let attempt = 1; attempt <= 5; attempt++) {
      await makeDue();
      provider.failNext = new ProviderTemporaryError('RATE_LIMITED', 'Bearer SECRET-TOKEN-123 rate limit');
      const out = await dispatcher.dispatch();
      expect(out).toMatchObject(attempt < 5 ? { retried: 1, failed: 0 } : { retried: 0, failed: 1 });
      const j = await job(id);
      expect([j.status, j.retryMin]).toEqual(expected[attempt - 1]);
      expect(j.attempts).toBe(attempt);
    }
    expect((await deliveries()).map((d) => d.status)).toEqual(['RETRY', 'RETRY', 'RETRY', 'RETRY', 'FAILED']);
    // a retry waits for ThuLaiLuc: not claimable again immediately
    const id2 = await create({ guests: [guest({ bedId: 'G2' })] }); await makeDue();
    provider.failNext = new ProviderTemporaryError('NETWORK');
    await dispatcher.dispatch();
    expect((await dispatcher.dispatch()).claimed).toBe(0);
    expect(await job(id2)).toMatchObject({ status: 'PENDING', attempts: 1 });
  });

  it('permanent error: FAILED immediately with only the error code; unknown errors never leak their message', async () => {
    const id = await create(); await consent(); await makeDue();
    provider.failNext = new ProviderPermanentError('INVALID_PHONE', 'zalo token=ABCDEF failed for 0900000001');
    expect(await dispatcher.dispatch()).toMatchObject({ failed: 1, retried: 0 });
    expect(await job(id)).toMatchObject({ status: 'FAILED', attempts: 1, reason: 'INVALID_PHONE' });
    const id2 = await create({ guests: [guest({ bedId: 'G2' })] }); await makeDue();
    provider.failNext = new Error('connect ECONNREFUSED secret-host password=hunter2') as never;
    await dispatcher.dispatch();
    expect(await job(id2)).toMatchObject({ status: 'PENDING', attempts: 1 });
    const rows = await deliveries();
    expect(rows.map((r) => r.code)).toEqual(['INVALID_PHONE', 'UNKNOWN_ERROR']);
    expect(JSON.stringify(await q('SELECT * FROM dbo.ThongBaoGiaoNhan'))).not.toMatch(/token|secret|password|hunter2|ABCDEF|Bearer/i);
    expect(rows.every((r) => (r.code ?? '').length <= 40)).toBe(true);
  });

  it('one failing job never aborts the others in the same dispatch', async () => {
    const a = await create({ guests: [guest({ bedId: 'G1' })] });
    const b = await create({ guests: [guest({ bedId: 'G2' })] });
    const c = await create({ guests: [guest({ bedId: 'G3' })] });
    await consent(); await makeDue();
    provider.failNext = new ProviderPermanentError('BAD');
    expect(await dispatcher.dispatch()).toEqual({ claimed: 3, sent: 2, retried: 0, failed: 1, skipped: 0 });
    expect((await Promise.all([a, b, c].map(job))).map((j) => j.status).sort()).toEqual(['FAILED', 'SENT', 'SENT']);
  });

  it('lease: a SENDING job is not claimed while leased, is re-claimed after the lease expires; exhausted attempts fail without sending', async () => {
    const id = await create(); await consent(); await makeDue();
    await q("UPDATE dbo.ThongBaoCongViec SET TrangThai='SENDING', SoLanThu=1, KhoaDen=dbo.utc_now() + interval '2 minutes'");
    expect((await dispatcher.dispatch()).claimed).toBe(0);
    await q("UPDATE dbo.ThongBaoCongViec SET KhoaDen=dbo.utc_now() - interval '1 second'");
    expect(await dispatcher.dispatch()).toMatchObject({ claimed: 1, sent: 1 });
    expect(await job(id)).toMatchObject({ status: 'SENT', attempts: 2 });

    const id2 = await create({ guests: [guest({ bedId: 'G2' })] }); await makeDue();
    await q("UPDATE dbo.ThongBaoCongViec SET TrangThai='SENDING', SoLanThu=5, KhoaDen=dbo.utc_now() - interval '1 second' WHERE MaLichHen=$1", [id2]);
    provider.clear();
    expect(await dispatcher.dispatch()).toMatchObject({ claimed: 1, sent: 0, failed: 1 });
    expect(await job(id2)).toMatchObject({ status: 'FAILED', reason: 'MAX_ATTEMPTS' });
    expect(provider.notifications).toHaveLength(0);
  });

  it('the claim sets a ~2 minute lease and counts the attempt', async () => {
    await create(); await consent(); await makeDue();
    let leaseSeconds = 0;
    const original = provider.send.bind(provider);
    provider.send = async (m) => {
      leaseSeconds = Number((await q<{ s: number }>("SELECT round(extract(epoch FROM (KhoaDen - dbo.utc_now())))::int AS s FROM dbo.ThongBaoCongViec WHERE TrangThai='SENDING'"))[0].s);
      return original(m);
    };
    await dispatcher.dispatch();
    expect(leaseSeconds).toBeGreaterThan(100);
    expect(leaseSeconds).toBeLessThanOrEqual(120);
  });

  it('two concurrent dispatch calls send every job exactly once', async () => {
    const ids: string[] = [];
    for (let i = 1; i <= 8; i++) ids.push(await create({ guests: [guest({ bedId: `G${i}` })] }));
    await consent(); await makeDue();
    const [x, y] = await Promise.all([dispatcher.dispatch(4), dispatcher.dispatch(100)]);
    const total = await dispatcher.dispatch();
    expect(x.sent + y.sent + total.sent).toBe(8);
    expect(x.claimed + y.claimed + total.claimed).toBe(8);
    expect(provider.notifications).toHaveLength(8);
    expect(new Set(provider.notifications.map((m) => m.data.bookingId))).toEqual(new Set(ids));
    expect((await deliveries()).filter((d) => d.status === 'SENT')).toHaveLength(8);
  });

  it('BOOKING_CANCELLED is sent for a cancelled booking and the delivery rows carry no secrets', async () => {
    process.env.NOTIFY_CHANGES = 'true';
    const id = await create({ date: D2, guests: [guest({ startsAt: `${D2}T09:00:00` })] });
    await consent();
    await service.updateAdmin(id, { status: 'Đã hủy' });
    await makeDue();
    await dispatcher.dispatch();
    expect(provider.notifications.map((m) => m.kind)).toEqual(['BOOKING_CANCELLED']);
    expect(Object.keys((await q('SELECT * FROM dbo.ThongBaoGiaoNhan'))[0]).sort()).toEqual(['mathamchieunhacungcap', 'maloi', 'macongviec', 'magiaonhan', 'nhacungcap', 'thoidiem', 'trangthai'].sort());
  });
});
