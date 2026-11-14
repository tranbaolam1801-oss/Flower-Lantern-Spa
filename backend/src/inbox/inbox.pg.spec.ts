import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { AuthModule } from '../auth/auth.module';
import { PasswordService } from '../auth/password.service';
import { BookingCancelController } from '../bookings/booking-cancel.controller';
import { BookingTransactionService } from '../bookings/booking-transaction.service';
import { BookingWriteService } from '../bookings/booking-write.service';
import { DAY, FIXTURE_SQL, NOW, adminDto } from '../bookings/booking-pg-fixtures';
import { DatabaseModule } from '../database.module';
import { DatabaseService } from '../database.service';
import { EmployeesService } from '../employees/employees.service';
import { ReviewsController } from '../reviews/reviews.controller';
import { setup } from '../setup';
import { PgTestServer, startPgTestServer } from '../testing/pg-test-server';
import { resetInboxTableCache } from './inbox-notify';
import { InboxController } from './inbox.controller';
import { InboxService } from './inbox.service';

jest.setTimeout(180_000);

const OWNER = 'TK10', MANAGER = 'TK11', STAFF_BOOK = 'TK12', STAFF_REVIEW = 'TK13', LOCKED = 'TK14', CUSTOMER = 'TK01';

describe('In-app notifications (inbox) on real PostgreSQL with migration 005', () => {
  let pg: PgTestServer;
  let app: INestApplication;
  let db: DatabaseService;
  let booking: BookingWriteService;
  let reviews: ReviewsController;
  let employees: EmployeesService;
  const password = randomBytes(18).toString('hex');
  const cookies: Record<string, string> = {};
  const saved: Record<string, string | undefined> = {};
  const q = <T = Record<string, unknown>>(sql: string, p: unknown[] = []) => db.query<T[]>(sql, p);
  const http = () => request(app.getHttpServer());
  const as = (a: string) => ({ Cookie: cookies[a], 'X-Spa-Request': '1' });
  const forAccount = async (acc: string, type?: string) =>
    (await q<{ id: string; type: string; title: string; body: string }>(`SELECT MaThongBao::text AS id, Loai AS type, TieuDe AS title, NoiDung AS body FROM dbo.ThongBaoNoiBo WHERE MaTaiKhoanNhan=$1 ${type ? 'AND Loai=$2' : ''} ORDER BY TaoLuc`, type ? [acc, type] : [acc]));
  const total = async () => (await q<{ n: number }>('SELECT count(*)::int AS n FROM dbo.ThongBaoNoiBo'))[0].n;

  beforeAll(async () => {
    for (const k of ['JWT_SECRET', 'AUTH_SESSION_STORE', 'RATE_LIMIT_ENABLED']) saved[k] = process.env[k];
    process.env.JWT_SECRET = randomBytes(32).toString('hex');
    process.env.AUTH_SESSION_STORE = 'sql';
    process.env.RATE_LIMIT_ENABLED = 'false';
    pg = await startPgTestServer({ inbox: true });
    const module = await Test.createTestingModule({ imports: [DatabaseModule, AuthModule], controllers: [InboxController], providers: [InboxService] }).compile();
    app = module.createNestApplication();
    setup(app);
    await app.init();
    db = app.get(DatabaseService);
    booking = new BookingWriteService(db, new BookingTransactionService(db));
    booking.now = () => NOW;
    reviews = new ReviewsController(db);
    employees = new EmployeesService(db, { hash: async (p: string) => `h:${p.length}` } as never);
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  });

  beforeEach(async () => {
    await pg.reset();
    resetInboxTableCache();
    const hash = await new PasswordService().hash(password);
    await pg.exec(`${FIXTURE_SQL}
      UPDATE dbo.TaiKhoan SET MatKhauBam='${hash}';
      INSERT INTO dbo.TaiKhoan(MaTaiKhoan,TenDangNhap,SoDienThoai,MatKhauBam,VaiTro,TrangThai) VALUES
        ('${OWNER}','owner','0910000010','${hash}','Chủ Spa','Hoạt động'),('${MANAGER}','manager','0910000011','${hash}','Quản lý','Hoạt động'),
        ('${STAFF_BOOK}','staffbook','0910000012','${hash}','Nhân viên','Hoạt động'),('${STAFF_REVIEW}','staffrev','0910000013','${hash}','Nhân viên','Hoạt động'),
        ('${LOCKED}','locked','0910000014','${hash}','Nhân viên','Đã khóa');
      INSERT INTO dbo.TaiKhoanQuyen(MaTaiKhoan,MaQuyen) VALUES ('${MANAGER}','Q01'),('${MANAGER}','Q03'),('${MANAGER}','Q05'),('${STAFF_BOOK}','Q01'),('${STAFF_REVIEW}','Q03'),('${LOCKED}','Q01');
      INSERT INTO dbo.NhanVien(MaNhanVien,MaTaiKhoan,HoTen,SoDienThoai,TrangThaiLamViec,TrangThaiHoSo) VALUES
        ('NV10','${OWNER}','Chủ Spa Demo','0910000010','Đang làm việc','Hoạt động'),('NV11','${MANAGER}','Quản Lý Demo','0910000011','Đang làm việc','Hoạt động'),
        ('NV12','${STAFF_BOOK}','Lễ Tân Một','0910000012','Đang làm việc','Hoạt động'),('NV13','${STAFF_REVIEW}','Nhân Viên Hai','0910000013','Đang làm việc','Hoạt động'),
        ('NV14','${LOCKED}','Đã Khóa','0910000014','Đang làm việc','Hoạt động');`);
    for (const [name, phone] of [['owner', '0910000010'], ['manager', '0910000011'], ['staffbook', '0910000012'], ['staffrev', '0910000013']] as const) {
      const res = await http().post('/api/auth/login').set('X-Spa-Request', '1').send({ phone, password }).expect(200);
      cookies[name] = (res.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
    }
    const cust = await http().post('/api/auth/login').set('X-Spa-Request', '1').send({ phone: '0900000001', password }).expect(200);
    cookies.customer = (cust.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
  });

  const customerBooking = () => booking.createCustomer(CUSTOMER, { fullName: 'Nguyễn Lan', phone: '0900000001', date: DAY, time: '09:00', guests: [{ customerName: 'A', packageId: 'GO60' }] } as never);

  describe('events and recipients (created in the SAME transaction as the business change)', () => {
    it('online booking by a customer -> Q01 holders (Quản lý + Nhân viên), not unrelated accounts, not locked accounts, not the owner', async () => {
      const out = await customerBooking();
      expect((await forAccount(MANAGER, 'BOOKING_CREATED_ONLINE'))).toHaveLength(1);
      expect((await forAccount(STAFF_BOOK, 'BOOKING_CREATED_ONLINE'))).toHaveLength(1);
      expect(await forAccount(STAFF_REVIEW)).toHaveLength(0);   // only Q03
      expect(await forAccount(LOCKED)).toHaveLength(0);         // locked account
      expect(await forAccount(OWNER)).toHaveLength(0);          // owner is only a fallback
      const n = (await forAccount(STAFF_BOOK))[0];
      expect(n.title).toBe('Lịch hẹn mới từ website');
      expect(n.body).toContain(out.id.trim());
      expect(n.body).toContain('Nguyễn Lan');
      expect(n.body).not.toMatch(/0900000001/);                 // no phone number in the notification
    });

    it('falls back to Chủ Spa when nobody holds the permission', async () => {
      await pg.exec(`DELETE FROM dbo.TaiKhoanQuyen WHERE MaQuyen='Q01'`);
      await customerBooking();
      expect(await forAccount(OWNER, 'BOOKING_CREATED_ONLINE')).toHaveLength(1);
      expect(await forAccount(MANAGER, 'BOOKING_CREATED_ONLINE')).toHaveLength(0);
    });

    it('a booking made by STAFF in the admin area creates NO notification', async () => {
      await booking.createAdmin(adminDto() as never);
      expect(await total()).toBe(0);
    });

    it('customer reschedule and cancel -> notify Q01 holders; admin cancel does not', async () => {
      const mine = await customerBooking();
      await q('DELETE FROM dbo.ThongBaoNoiBo');
      await booking.rescheduleMine(CUSTOMER, mine.id, DAY, '09:30');
      expect(await forAccount(MANAGER, 'BOOKING_RESCHEDULED_BY_CUSTOMER')).toHaveLength(1);
      expect((await forAccount(STAFF_BOOK, 'BOOKING_RESCHEDULED_BY_CUSTOMER'))[0].body).toContain('09:30');
      await booking.cancelMine(CUSTOMER, mine.id);
      expect(await forAccount(MANAGER, 'BOOKING_CANCELLED_BY_CUSTOMER')).toHaveLength(1);
      const other = await booking.createAdmin(adminDto({ guests: [{ customerName: 'B', bedId: 'G2', packageId: 'GO60', startsAt: `${DAY}T12:00:00` }] }) as never);
      await q('DELETE FROM dbo.ThongBaoNoiBo');
      await new BookingCancelController(db).cancel({ id: other.id } as never);
      expect(await total()).toBe(0);
    });

    it('new review -> Q03 holders (Quản lý + the Nhân viên with Q03), nobody else', async () => {
      const mine = await customerBooking();
      await q(`UPDATE dbo.LichHen SET TrangThaiLichHen='Hoàn thành' WHERE MaLichHen=$1`, [mine.id]);
      await q('DELETE FROM dbo.ThongBaoNoiBo');
      await reviews.reviewMyBooking({ id: mine.id } as never, { rating: 5, comment: 'Rất tốt' } as never, { user: { sub: CUSTOMER } } as never);
      expect(await forAccount(MANAGER, 'REVIEW_CREATED')).toHaveLength(1);
      expect(await forAccount(STAFF_REVIEW, 'REVIEW_CREATED')).toHaveLength(1);
      expect(await forAccount(STAFF_BOOK)).toHaveLength(0);
      expect((await forAccount(STAFF_REVIEW))[0].body).toMatch(/5 sao/);
    });

    it('permission change -> Chủ Spa only, with who changed whom, no secrets; the actor is not notified of their own action', async () => {
      await employees.setPermissions({ sub: MANAGER, role: 'Quản lý', permissions: ['Q01', 'Q03', 'Q05'] }, 'NV12', { role: 'Nhân viên', permissions: ['Q01', 'Q03'] } as never);
      const n = await forAccount(OWNER, 'PERMISSION_CHANGED');
      expect(n).toHaveLength(1);
      expect(n[0].body).toContain('Quản Lý Demo');
      expect(n[0].body).toContain('Lễ Tân Một');
      expect(n[0].body).toMatch(/Q01, Q03/);
      expect(n[0].body).not.toMatch(/token|mật khẩu|password|jwt/i);
      expect(await forAccount(MANAGER)).toHaveLength(0);
      expect(await total()).toBe(1);
      // the owner changing it themselves: the owner (actor) gets nothing
      await employees.setPermissions({ sub: OWNER, role: 'Chủ Spa', permissions: ['Q01', 'Q02', 'Q03', 'Q04', 'Q05', 'Q06'] }, 'NV12', { role: 'Nhân viên', permissions: ['Q01'] } as never);
      expect(await total()).toBe(1);
    });

    it('lock / unlock of an employee account -> Chủ Spa', async () => {
      await employees.setAccountStatus({ sub: MANAGER, role: 'Quản lý', permissions: ['Q05'] }, 'NV12', { status: 'Đã khóa' } as never);
      expect(await forAccount(OWNER, 'ACCOUNT_LOCKED')).toHaveLength(1);
      await new Promise((r) => setTimeout(r, 1100));
      await employees.setAccountStatus({ sub: MANAGER, role: 'Quản lý', permissions: ['Q05'] }, 'NV12', { status: 'Hoạt động' } as never);
      const u = await forAccount(OWNER, 'ACCOUNT_UNLOCKED');
      expect(u).toHaveLength(1);
      expect(u[0].body).toContain('mở khóa');
    });
  });

  describe('integrity: no notification for failed work, never breaks the business operation, no duplicates', () => {
    it('a failed business operation creates no notification (conflict / not found / forbidden)', async () => {
      await booking.createAdmin(adminDto() as never); // occupies the only matching slot for G1 09:00 for the first guest
      await expect(booking.createCustomer('TKNONE', { fullName: 'A', phone: '0900000001', date: DAY, time: '09:00', guests: [{ customerName: 'A', packageId: 'GO60' }] } as never)).rejects.toBeDefined();
      await expect(employees.setPermissions({ sub: MANAGER, role: 'Quản lý', permissions: ['Q01'] }, 'NV12', { role: 'Quản lý', permissions: ['Q01'] } as never)).rejects.toBeDefined(); // only owner can assign Quản lý
      await expect(employees.setAccountStatus({ sub: MANAGER, role: 'Quản lý', permissions: ['Q05'] }, 'NV10', { status: 'Đã khóa' } as never)).rejects.toBeDefined(); // owner untouchable
      expect(await total()).toBe(0);
    });

    it('a failure INSIDE notification creation (savepoint) does not abort or roll back the booking, and leaves no partial rows', async () => {
      await pg.exec(`CREATE OR REPLACE FUNCTION dbo.deny_notify() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'denied'; END $$ LANGUAGE plpgsql;
        CREATE TRIGGER trg_deny_notify BEFORE INSERT ON dbo.ThongBaoNoiBo FOR EACH ROW EXECUTE FUNCTION dbo.deny_notify();`);
      try {
        const out = await customerBooking();                          // must still succeed
        expect((await q('SELECT 1 FROM dbo.LichHen WHERE MaLichHen=$1', [out.id]))).toHaveLength(1);
        expect(await total()).toBe(0);
        const mine = out.id;
        await expect(booking.cancelMine(CUSTOMER, mine)).resolves.toEqual({ message: 'Hủy lịch hẹn thành công!' });
        expect((await q<{ s: string }>('SELECT TrangThaiLichHen AS s FROM dbo.LichHen WHERE MaLichHen=$1', [mine]))[0].s).toBe('Đã hủy');
        await expect(employees.setAccountStatus({ sub: MANAGER, role: 'Quản lý', permissions: ['Q05'] }, 'NV12', { status: 'Đã khóa' } as never)).resolves.toBeDefined();
        expect((await q<{ s: string }>(`SELECT TrangThai AS s FROM dbo.TaiKhoan WHERE MaTaiKhoan='${STAFF_BOOK}'`))[0].s).toBe('Đã khóa');
      } finally { await pg.exec('DROP TRIGGER trg_deny_notify ON dbo.ThongBaoNoiBo; DROP FUNCTION dbo.deny_notify();'); }
    });

    it('before migration 005 is applied everything still works and notifications are silently skipped (production state today)', async () => {
      await pg.exec('DROP TABLE dbo.ThongBaoNoiBo');
      resetInboxTableCache();
      try {
        const out = await customerBooking();
        await expect(booking.cancelMine(CUSTOMER, out.id)).resolves.toBeDefined();
        const list = await http().get('/api/notifications').set(as('manager')).expect(200);
        expect(list.body).toMatchObject({ available: false, items: [], unread: 0 });
        expect((await http().get('/api/notifications/unread-count').set(as('manager')).expect(200)).body).toEqual({ unread: 0 });
        await http().patch('/api/notifications/read-all').set(as('manager')).expect(200);
      } finally {
        await pg.exec(readFileSync(join(__dirname, '..', '..', '..', 'database', 'postgres', '005-in-app-notifications.sql'), 'utf8'));
        resetInboxTableCache();
      }
    });

    it('dedupe: the same event cannot create a second row for the same recipient (unique key), whatever the retry', async () => {
      await pg.exec(`INSERT INTO dbo.ThongBaoNoiBo(MaTaiKhoanNhan,Loai,TieuDe,NoiDung,KhoaChongTrung) VALUES ('${MANAGER}','REVIEW_CREATED','t','c','REVIEW_CREATED:DG1')`);
      await expect(pg.exec(`INSERT INTO dbo.ThongBaoNoiBo(MaTaiKhoanNhan,Loai,TieuDe,NoiDung,KhoaChongTrung) VALUES ('${MANAGER}','REVIEW_CREATED','t','c','REVIEW_CREATED:DG1')`)).rejects.toBeDefined();
      // the helper uses ON CONFLICT DO NOTHING: replaying the same permission change history id adds nothing
      await employees.setPermissions({ sub: MANAGER, role: 'Quản lý', permissions: ['Q01', 'Q03', 'Q05'] }, 'NV12', { role: 'Nhân viên', permissions: ['Q01'] } as never);
      const before = await total();
      await pg.exec(`INSERT INTO dbo.ThongBaoNoiBo(MaTaiKhoanNhan,Loai,TieuDe,NoiDung,KhoaChongTrung) SELECT MaTaiKhoanNhan,Loai,TieuDe,NoiDung,KhoaChongTrung FROM dbo.ThongBaoNoiBo WHERE Loai='PERMISSION_CHANGED' ON CONFLICT DO NOTHING`);
      expect(await total()).toBe(before);
    });
  });

  describe('API: GET /api/notifications, unread-count, PATCH :id/read, PATCH read-all', () => {
    const seed = async (acc: string, n: number, prefix = 'k') => {
      for (let i = 0; i < n; i++) await pg.exec(`INSERT INTO dbo.ThongBaoNoiBo(MaTaiKhoanNhan,Loai,TieuDe,NoiDung,KhoaChongTrung,TaoLuc) VALUES ('${acc}','REVIEW_CREATED','Tiêu đề ${prefix}${i}','Nội dung','${prefix}${acc}${i}', dbo.utc_now() + interval '${i} seconds')`);
    };

    it('requires a session; customers are refused; invalid ids/pages are 400', async () => {
      await http().get('/api/notifications').expect(401);
      await http().get('/api/notifications').set(as('customer')).expect(403);
      await http().get('/api/notifications/unread-count').set(as('customer')).expect(403);
      await http().patch('/api/notifications/not-a-uuid/read').set(as('manager')).expect(400);
      await http().get('/api/notifications?page=0').set(as('manager')).expect(400);
      await http().get('/api/notifications?limit=999').set(as('manager')).expect(400);
      await http().patch('/api/notifications/read-all').set('Cookie', cookies.manager).expect(403); // CSRF header required
    });

    it('lists newest first with pagination and an accurate unread count; responses are not cacheable', async () => {
      await seed(MANAGER, 25);
      const p1 = await http().get('/api/notifications?limit=10').set(as('manager')).expect(200);
      expect(p1.headers['cache-control']).toBe('no-store');
      expect(p1.body).toMatchObject({ available: true, unread: 25, page: 1, hasNext: true });
      expect(p1.body.items).toHaveLength(10);
      expect(p1.body.items[0].title).toBe('Tiêu đề k24');
      expect(p1.body.items[0]).toMatchObject({ read: false, type: 'REVIEW_CREATED', body: 'Nội dung' });
      expect(p1.body.items[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
      const p3 = await http().get('/api/notifications?limit=10&page=3').set(as('manager')).expect(200);
      expect(p3.body.items).toHaveLength(5);
      expect(p3.body.hasNext).toBe(false);
      expect((await http().get('/api/notifications/unread-count').set(as('manager')).expect(200)).body).toEqual({ unread: 25 });
    });

    it('mark one as read: persists, is idempotent, lowers the count, and survives a "refresh" (new request)', async () => {
      await seed(MANAGER, 3);
      const first = (await http().get('/api/notifications').set(as('manager'))).body.items[0];
      const r1 = await http().patch(`/api/notifications/${first.id}/read`).set(as('manager')).expect(200);
      expect(r1.body).toEqual({ unread: 2 });
      await http().patch(`/api/notifications/${first.id}/read`).set(as('manager')).expect(200);
      const again = (await http().get('/api/notifications').set(as('manager'))).body;
      expect(again.unread).toBe(2);
      expect(again.items.find((i: { id: string }) => i.id === first.id).read).toBe(true);
      const t1 = await q<{ t: string }>(`SELECT DaDocLuc::text AS t FROM dbo.ThongBaoNoiBo WHERE MaThongBao=$1::uuid`, [first.id]);
      await http().patch(`/api/notifications/${first.id}/read`).set(as('manager')).expect(200);
      expect((await q<{ t: string }>(`SELECT DaDocLuc::text AS t FROM dbo.ThongBaoNoiBo WHERE MaThongBao=$1::uuid`, [first.id]))[0].t).toBe(t1[0].t); // read time is not rewritten
    });

    it('listing / opening never marks anything as read; read-all marks only the caller\'s notifications', async () => {
      await seed(MANAGER, 4); await seed(STAFF_BOOK, 2, 's');
      await http().get('/api/notifications').set(as('manager')).expect(200);
      expect((await http().get('/api/notifications/unread-count').set(as('manager'))).body.unread).toBe(4);
      const all = await http().patch('/api/notifications/read-all').set(as('manager')).expect(200);
      expect(all.body).toEqual({ updated: 4, unread: 0 });
      expect((await http().get('/api/notifications/unread-count').set(as('staffbook'))).body.unread).toBe(2);
      expect((await http().patch('/api/notifications/read-all').set(as('manager'))).body).toEqual({ updated: 0, unread: 0 });
    });

    it('account A can never read or mark account B\'s notifications (404, indistinguishable from a missing id)', async () => {
      await seed(MANAGER, 2); await seed(STAFF_BOOK, 2, 's');
      const mine = (await http().get('/api/notifications').set(as('staffbook'))).body;
      expect(mine.items).toHaveLength(2);
      expect(mine.items.every((i: { title: string }) => i.title.startsWith('Tiêu đề s'))).toBe(true);
      const managerItem = (await http().get('/api/notifications').set(as('manager'))).body.items[0];
      await http().patch(`/api/notifications/${managerItem.id}/read`).set(as('staffbook')).expect(404);
      await http().patch('/api/notifications/00000000-0000-4000-8000-000000000000/read').set(as('staffbook')).expect(404);
      expect((await http().get('/api/notifications/unread-count').set(as('manager'))).body.unread).toBe(2);
      // a recipientId in the query/body is ignored: the account always comes from the session
      const spoof = await http().get(`/api/notifications?recipientId=${MANAGER}`).set(as('staffbook'));
      expect([200, 400]).toContain(spoof.status);
      if (spoof.status === 200) expect(spoof.body.items.every((i: { title: string }) => i.title.startsWith('Tiêu đề s'))).toBe(true);
    });

    it('migration 005 is idempotent and its rollback drops only the notification table (accounts, customers, bookings untouched), then re-applies', async () => {
      const read = (n: string) => readFileSync(join(__dirname, '..', '..', '..', 'database', 'postgres', n), 'utf8');
      await customerBooking();
      const counts = async () => (await q<{ a: number; k: number; l: number }>('SELECT (SELECT count(*)::int FROM dbo.TaiKhoan) a,(SELECT count(*)::int FROM dbo.KhachHang) k,(SELECT count(*)::int FROM dbo.LichHen) l'))[0];
      const before = await counts();
      await pg.exec(read('005-in-app-notifications.sql'));                        // second apply: no error, no data change
      expect(await total()).toBeGreaterThan(0);
      await pg.exec(read('005-in-app-notifications.rollback.sql'));
      await pg.exec(read('005-in-app-notifications.rollback.sql'));               // rollback is repeatable
      expect((await q<{ ok: boolean }>("SELECT to_regclass('dbo.ThongBaoNoiBo') IS NOT NULL AS ok"))[0].ok).toBe(false);
      expect(await counts()).toEqual(before);
      await pg.exec(read('005-in-app-notifications.sql'));
      expect(await total()).toBe(0);
    });
  });
});
