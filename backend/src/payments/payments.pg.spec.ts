import 'reflect-metadata';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import { JwtPayload } from '../auth/auth.dto';
import { PgTestServer, startPgTestServer } from '../testing/pg-test-server';
import { PaymentsService } from './payments.service';

jest.setTimeout(120_000);

const KEY = 'test-api-key-0123456789abcdef-0123456789';
const ENV = {
  SEPAY_API_KEY: KEY, SEPAY_ACCOUNT_NUMBER: '0123456789', SEPAY_BANK: 'TestBank', SEPAY_ACCOUNT_HOLDER: 'FLOWER LANTERN',
  SEPAY_PAYMENT_PREFIX: 'FLS', PAYMENT_EXPIRY_MINUTES: '15', PAYMENT_MOCK_ENABLED: 'true', NODE_ENV: 'test',
};
const saved = { ...process.env };
const customer = (sub = 'TK00000001'): JwtPayload => ({ sub, username: 'u', phone: '0900000000', role: 'Khách hàng', fullName: 'KH', permissions: [] });
const apiKeyReq = () => ({ headers: { authorization: `Apikey ${KEY}` } });
const body = (o: Record<string, unknown> = {}) => ({ id: 92704, gateway: 'TestBank', accountNumber: '0123456789', transferType: 'in', transferAmount: 500000, code: null, content: '', ...o });

describe('PaymentsService on real PostgreSQL (PGlite)', () => {
  let pg: PgTestServer;
  let db: DatabaseService;
  let svc: PaymentsService;
  const rows = async <T>(sql: string, p: unknown[] = []) => await db.query<T[]>(sql, p);

  beforeAll(async () => {
    pg = await startPgTestServer();
    Object.assign(process.env, ENV);
    delete process.env.SEPAY_WEBHOOK_AUTH;
    db = new DatabaseService();
  });
  afterAll(async () => {
    process.env = saved;
    await db.onApplicationShutdown();
    await pg.stop();
  });
  beforeEach(async () => {
    Object.assign(process.env, ENV);
    await pg.reset();
    svc = new PaymentsService(db);
    await pg.exec(`
      INSERT INTO dbo.TaiKhoan VALUES ('TK00000001','kh','0900000001','x','Khách hàng','Hoạt động'),('TK00000002','kh2','0900000002','x','Khách hàng','Hoạt động'),('TK00000009','ql','0900000009','x','Quản lý','Hoạt động');
      INSERT INTO dbo.KhachHang(MaKhachHang,MaTaiKhoan,HoTen,SoDienThoai) VALUES ('KH00000001','TK00000001','An','0900000001'),('KH00000002','TK00000002','Binh','0900000002');
      INSERT INTO dbo.DanhMuc VALUES ('DM00000001','Da','Hoạt động');
      INSERT INTO dbo.DichVu(MaDichVu,MaDanhMuc,TenDichVu,TrangThai) VALUES ('DV00000001','DM00000001','Massage','Hoạt động');
      INSERT INTO dbo.GoiDichVu(MaGoi,MaDichVu,TenGoi,ThoiLuong,Gia) VALUES ('GD00000001','DV00000001','60 phút',60,300000),('GD00000002','DV00000001','45 phút',45,200000);
      INSERT INTO dbo.LichHen(MaLichHen,MaKhachHang,HoTenNguoiDat,SoDienThoaiNguoiDat,NgayHen,GioHen,TrangThaiLichHen,TrangThaiThanhToan)
        VALUES ('LH00000001','KH00000001','An','0900000001','2030-01-10','09:00','Chưa đến','Chưa thanh toán');
      INSERT INTO dbo.KhachSuDungDichVu(MaChiTiet,MaLichHen,MaGoi,MaGiuong,TenKhach,ThoiDiemBatDau,ThoiDiemKetThuc)
        VALUES ('CT00000001','LH00000001','GD00000001','G1','An','2030-01-10 09:00','2030-01-10 10:00'),('CT00000002','LH00000001','GD00000002','G2','Binh','2030-01-10 09:00','2030-01-10 09:45');`);
  });

  const hook = (ref: string, o: Record<string, unknown> = {}) => svc.handleSepayWebhook(apiKeyReq(), body({ code: ref, content: `${ref} chuyen tien`, ...o }));
  const events = () => rows<{ tx: string; outcome: string; paymentid: string | null }>(`SELECT MaGiaoDichNhaCungCap AS tx, KetQuaXuLy AS outcome, MaThanhToan AS paymentid FROM dbo.SePayWebhookEvent ORDER BY MaSuKien`);
  const bookingPay = async () => (await rows<{ p: string; s: string }>(`SELECT TrangThaiThanhToan AS p, TrangThaiLichHen AS s FROM dbo.LichHen WHERE MaLichHen='LH00000001'`))[0];

  it('ensureSchema passes on the real schema and createIntent computes the amount from SQL with a unique reference and amount-specific QR', async () => {
    const dto = await svc.createIntent(customer(), 'LH00000001');
    expect(dto).toMatchObject({ bookingId: 'LH00000001', amount: 500000, status: 'Chờ thanh toán', accountNumber: '0123456789', provider: 'SEPAY' });
    expect(dto.reference).toMatch(/^FLS[A-HJ-NP-Z2-9]{10}$/);
    expect(dto.qrUrl).toContain('amount=500000');
    expect(dto.expiresAt).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/);
    const stored = await rows<{ ref: string; n: number }>(`SELECT MaThamChieu AS ref, (SELECT count(*) FROM dbo.ThanhToan) AS n FROM dbo.ThanhToan`);
    expect(stored).toEqual([{ ref: dto.reference, n: 1 }]);
    const other = await svc.createIntent(customer(), 'LH00000001');
    expect(other.paymentId).toBe(dto.paymentId);
    await pg.exec(`UPDATE dbo.GoiDichVu SET Gia=350000 WHERE MaGoi='GD00000001'`);
    const replaced = await svc.createIntent(customer(), 'LH00000001');
    expect(replaced.amount).toBe(550000);
    expect(replaced.reference).not.toBe(dto.reference);
    expect((await svc.status(customer(), dto.paymentId)).status).toBe('Hết hạn');
  });

  it('the diagnostic CLI reads matching evidence without changing payments or bookings', async () => {
    const dto = await svc.createIntent(customer(), 'LH00000001');
    const script = join(__dirname, '..', '..', '..', 'scripts', 'diagnose-sepay-payment.mjs');
    // PGlite's socket adapter has one session. Release the app pool before the CLI connects.
    await db.onApplicationShutdown();
    const { stdout } = await promisify(execFile)(process.execPath, [script, '--booking', 'LH00000001', '--reference', dto.reference, '--amount', '500000'], {
      env: { ...process.env, SEPAY_DIAGNOSTIC_DATABASE_URL: pg.url }, timeout: 15000,
    });
    const report = JSON.parse(stdout);
    expect(report).toMatchObject({ readOnly: true, settlementPerformed: false, verdict: 'REVIEW_REQUIRED', events: [] });
    expect(report.payments).toHaveLength(1);
    expect(report.payments[0]).toMatchObject({ id: dto.paymentId, requestedAmountMatches: true, storedAccountPresent: true });
    expect(stdout).not.toContain('0123456789');
    expect(stdout).not.toContain('postgres://');
    expect((await svc.status(customer(), dto.paymentId)).status).toBe('Chờ thanh toán');
    expect((await bookingPay()).p).toBe('Chưa thanh toán');
  });

  it('customer cannot see another customer booking; cancelled, paid and unknown bookings are rejected', async () => {
    await expect(svc.createIntent(customer('TK00000002'), 'LH00000001')).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.createIntent(customer(), 'LH99999999')).rejects.toBeInstanceOf(NotFoundException);
    await pg.exec(`UPDATE dbo.LichHen SET TrangThaiLichHen='Đã hủy'`);
    await expect(svc.createIntent(customer(), 'LH00000001')).rejects.toBeInstanceOf(ConflictException);
    await pg.exec(`UPDATE dbo.LichHen SET TrangThaiLichHen='Chưa đến', TrangThaiThanhToan='Đã thanh toán'`);
    await expect(svc.createIntent(customer(), 'LH00000001')).rejects.toBeInstanceOf(ConflictException);
    const dto = await (async () => { await pg.exec(`UPDATE dbo.LichHen SET TrangThaiThanhToan='Chưa thanh toán'`); return svc.createIntent(customer(), 'LH00000001'); })();
    await expect(svc.status(customer('TK00000002'), dto.paymentId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('valid webhook confirms the payment and the booking payment status; booking status is untouched', async () => {
    const dto = await svc.createIntent(customer(), 'LH00000001');
    expect(await hook(dto.reference)).toEqual({ success: true });
    expect(await events()).toEqual([{ tx: '92704', outcome: 'CONFIRMED', paymentid: dto.paymentId }]);
    expect(await bookingPay()).toEqual({ p: 'Đã thanh toán', s: 'Chưa đến' });
    const t = await rows<{ st: string; prov: string; tx: string }>(`SELECT TrangThaiGiaoDich AS st, NhaCungCap AS prov, MaGiaoDichNhaCungCap AS tx FROM dbo.ThanhToan`);
    expect(t).toEqual([{ st: 'Thành công', prov: 'SEPAY', tx: '92704' }]);
    expect((await svc.status(customer(), dto.paymentId)).status).toBe('Đã thanh toán');
  });

  it('settling one booking leaves a different customer booking untouched', async () => {
    const dto = await svc.createIntent(customer(), 'LH00000001');
    await pg.exec(`INSERT INTO dbo.LichHen(MaLichHen,MaKhachHang,HoTenNguoiDat,SoDienThoaiNguoiDat,NgayHen,GioHen,TrangThaiLichHen,TrangThaiThanhToan)
      VALUES('LH00000002','KH00000002','Test other','0900000002','2030-01-10','11:00','Chưa đến','Chưa thanh toán');`);
    await hook(dto.reference);
    const other = await rows<{ pay: string; status: string }>(`SELECT TrangThaiThanhToan AS pay,TrangThaiLichHen AS status FROM dbo.LichHen WHERE MaLichHen='LH00000002'`);
    expect(other).toEqual([{ pay: 'Chưa thanh toán', status: 'Chưa đến' }]);
    expect((await bookingPay()).p).toBe('Đã thanh toán');
  });

  it('the same provider transaction id replayed (sequentially and concurrently) is not applied twice', async () => {
    const dto = await svc.createIntent(customer(), 'LH00000001');
    await hook(dto.reference);
    await pg.exec(`UPDATE dbo.LichHen SET TrangThaiThanhToan='Chưa thanh toán'`);
    expect(await hook(dto.reference)).toEqual({ success: true });
    expect(await bookingPay()).toMatchObject({ p: 'Chưa thanh toán' });
    expect(await events()).toHaveLength(1);
    const both = await Promise.all([hook(dto.reference, { id: 777 }), hook(dto.reference, { id: 777 })]);
    expect(both).toEqual([{ success: true }, { success: true }]);
    expect((await events()).filter((e) => e.tx === '777')).toHaveLength(1);
    expect(await svc.processEvent({ provider: 'SEPAY', providerTxId: '777', transferType: 'in', amount: 1, accountNumber: '0123456789', reference: null, content: '' }, '{}')).toBe('DUPLICATE_EVENT');
  });

  it.each([
    ['underpayment', { transferAmount: 499999 }, 'UNDERPAID'],
    ['overpayment', { transferAmount: 500001 }, 'OVERPAID'],
    ['wrong receiving account', { accountNumber: '111' }, 'ACCOUNT_MISMATCH'],
    ['outgoing transfer', { transferType: 'out' }, 'IGNORED_OUT'],
  ])('%s is recorded but does not confirm', async (_n, over, outcome) => {
    const dto = await svc.createIntent(customer(), 'LH00000001');
    expect(await hook(dto.reference, over)).toEqual({ success: true });
    expect((await events())[0].outcome).toBe(outcome);
    expect((await svc.status(customer(), dto.paymentId)).status).toBe('Chờ thanh toán');
    expect(await bookingPay()).toMatchObject({ p: 'Chưa thanh toán' });
  });

  it('unknown reference, expired payment, cancelled booking and a second transfer are recorded for reconciliation', async () => {
    const dto = await svc.createIntent(customer(), 'LH00000001');
    await hook('FLSZZZZZZZZZZ', { id: 1 });
    await svc.handleSepayWebhook(apiKeyReq(), body({ id: 2, code: null, content: 'khong co ma' }));
    await pg.exec(`UPDATE dbo.ThanhToan SET HanThanhToan=dbo.vn_now()-interval '1 minute'`);
    await hook(dto.reference, { id: 3 });
    await pg.exec(`UPDATE dbo.ThanhToan SET HanThanhToan=dbo.vn_now()+interval '10 minute'; UPDATE dbo.LichHen SET TrangThaiLichHen='Đã hủy'`);
    await hook(dto.reference, { id: 4 });
    await pg.exec(`UPDATE dbo.LichHen SET TrangThaiLichHen='Chưa đến'`);
    await hook(dto.reference, { id: 5 });
    await hook(dto.reference, { id: 6 });
    expect((await events()).map((e) => e.outcome)).toEqual(['UNKNOWN_REFERENCE', 'UNKNOWN_REFERENCE', 'EXPIRED', 'BOOKING_CANCELLED', 'CONFIRMED', 'DUPLICATE_PAYMENT']);
  });

  it('unrelated unique-index failure rolls back and returns 503, never a false duplicate acknowledgement', async () => {
    const dto = await svc.createIntent(customer(), 'LH00000001');
    await pg.exec(`INSERT INTO dbo.SePayWebhookEvent(NhaCungCap,MaGiaoDichNhaCungCap,KetQuaXuLy,DuLieuTho)
      VALUES('SEPAY','111','UNKNOWN_REFERENCE','{}');
      CREATE UNIQUE INDEX test_sepay_single_event ON dbo.SePayWebhookEvent ((true));`);
    try {
      await expect(hook(dto.reference)).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect((await events()).map(e => e.tx)).toEqual(['111']);
      expect((await svc.status(customer(), dto.paymentId)).status).toBe('Chờ thanh toán');
      expect((await bookingPay()).p).toBe('Chưa thanh toán');
    } finally {
      await pg.exec('DROP INDEX dbo.test_sepay_single_event');
    }
  });

  it('invalid but authenticated payload is audited once as INVALID_PAYLOAD and acknowledged', async () => {
    const raw = { headers: apiKeyReq().headers, rawBody: Buffer.from('{"id":1}') };
    expect(await svc.handleSepayWebhook(raw, { id: 1 })).toEqual({ success: true });
    expect(await svc.handleSepayWebhook(raw, { id: 1 })).toEqual({ success: true });
    expect(await svc.handleSepayWebhook(apiKeyReq(), { id: 'bad' })).toEqual({ success: true });
    const ev = await rows<{ tx: string; outcome: string }>(`SELECT MaGiaoDichNhaCungCap AS tx, KetQuaXuLy AS outcome FROM dbo.SePayWebhookEvent ORDER BY MaSuKien`);
    expect(ev.map((e) => e.outcome)).toEqual(['INVALID_PAYLOAD', 'INVALID_PAYLOAD']);
    expect(ev[0].tx).toBe('1');
  });

  it('unreconciled lists non-confirmed events newest first, paged, without the raw payload', async () => {
    const dto = await svc.createIntent(customer(), 'LH00000001');
    await hook(dto.reference, { id: 11, transferAmount: 1 });
    await hook(dto.reference, { id: 12, accountNumber: '111' });
    await hook('FLSZZZZZZZZZZ', { id: 13 });
    await hook(dto.reference, { id: 10 });
    const all = await svc.unreconciled({});
    expect(all.total).toBe(3);
    expect(all.items.map((i) => i.providerTxId)).toEqual(['13', '12', '11']);
    expect(all.items[2]).toMatchObject({ amount: 1, outcome: 'UNDERPAID', paymentId: dto.paymentId, provider: 'SEPAY' });
    expect(all.items[0].receivedAt).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/);
    expect(JSON.stringify(all)).not.toContain('DuLieuTho');
    expect((await svc.unreconciled({ page: 2, pageSize: 1 })).items.map((i) => i.providerTxId)).toEqual(['12']);
  });

  it('mock settle is labelled MOCK and uses the same reconciliation path', async () => {
    const dto = await svc.createIntent(customer(), 'LH00000001');
    expect((await svc.mockSettle({ paymentId: dto.paymentId, amount: 1 })).outcome).toBe('UNDERPAID');
    const res = await svc.mockSettle({ paymentId: dto.paymentId });
    expect(res).toMatchObject({ simulated: true, outcome: 'CONFIRMED' });
    expect(await svc.status(customer(), dto.paymentId)).toMatchObject({ provider: 'MOCK', simulated: true });
    await expect(svc.mockSettle({ paymentId: 'TT00000000' })).rejects.toBeInstanceOf(NotFoundException);
    process.env.PAYMENT_MOCK_ENABLED = 'false';
    await expect(svc.mockSettle({ paymentId: dto.paymentId })).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('refund', () => {
    const paid = async () => { const dto = await svc.createIntent(customer(), 'LH00000001'); await hook(dto.reference); return dto; };
    const audit = () => rows<{ pid: string; amount: number; reason: string; actor: string }>(`SELECT rtrim(MaThanhToan) AS pid, SoTien::bigint AS amount, LyDo AS reason, rtrim(MaTaiKhoanThucHien) AS actor FROM dbo.ThanhToanHoanTien ORDER BY MaHoanTien`);

    it('partial refund keeps Thành công, writes the audit row and recomputes the booking payment status', async () => {
      const dto = await paid();
      const out = await svc.refund(dto.paymentId, { amount: 100000, reason: '  Khách hủy dịch vụ  ' }, 'TK00000009');
      expect(out.refundedAmount).toBe(100000);
      expect(await audit()).toEqual([{ pid: dto.paymentId, amount: 100000, reason: 'Khách hủy dịch vụ', actor: 'TK00000009' }]);
      expect(await bookingPay()).toMatchObject({ p: 'Thanh toán một phần' });
      expect((await rows<{ s: string }>(`SELECT TrangThaiGiaoDich AS s FROM dbo.ThanhToan`))[0].s).toBe('Thành công');
    });

    it('full refund sets Đã hoàn tiền and the booking returns to Chưa thanh toán', async () => {
      const dto = await paid();
      await svc.refund(dto.paymentId, { amount: 500000, reason: 'Khách hủy dịch vụ' }, 'TK00000009');
      expect((await rows<{ s: string }>(`SELECT TrangThaiGiaoDich AS s FROM dbo.ThanhToan`))[0].s).toBe('Đã hoàn tiền');
      expect(await bookingPay()).toMatchObject({ p: 'Chưa thanh toán' });
    });

    it('the audit insert and the refund update are atomic: an unknown actor (FK) rolls the refund back', async () => {
      const dto = await paid();
      await expect(svc.refund(dto.paymentId, { amount: 100000, reason: 'Khách hủy dịch vụ' }, 'TKNONE0000')).rejects.toBeDefined();
      expect(await audit()).toEqual([]);
      expect((await rows<{ r: number; s: string }>(`SELECT COALESCE(KhoanHoanTien,0)::bigint AS r, TrangThaiGiaoDich AS s FROM dbo.ThanhToan`))[0]).toEqual({ r: 0, s: 'Thành công' });
      expect(await bookingPay()).toMatchObject({ p: 'Đã thanh toán' });
    });

    it('rejects over-refund, unpaid payment and unknown id', async () => {
      const dto = await paid();
      await expect(svc.refund(dto.paymentId, { amount: 500001, reason: 'Khách hủy dịch vụ' }, 'TK00000009')).rejects.toBeInstanceOf(ConflictException);
      await expect(svc.refund('TT00000000', { amount: 1, reason: 'Khách hủy dịch vụ' }, 'TK00000009')).rejects.toBeInstanceOf(NotFoundException);
      await pg.exec(`UPDATE dbo.ThanhToan SET TrangThaiGiaoDich='Chờ thanh toán'`);
      await expect(svc.refund(dto.paymentId, { amount: 1, reason: 'Khách hủy dịch vụ' }, 'TK00000009')).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
