import { createHash, randomInt } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, HttpException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { QueryRunner } from 'typeorm';
import { DatabaseService } from '../database.service';
import { isUniqueViolation } from '../common/db-errors';
import { returnedRows } from '../common/pg-result';
import { JwtPayload } from '../auth/auth.dto';
import { MockPaymentProvider, NormalizedPaymentEvent, SepayProvider, WebhookRequest } from './payment-provider';
import { EXPIRED, Outcome, PENDING, REFUNDED, SUCCESS, buildQrUrl, generateReference, paymentStatusFor, reconcile } from './payment-rules';
import { readPaymentsConfig } from './payments.config';
import { MockWebhookDto, RefundPaymentDto, UnreconciledQuery } from './payments.dto';

export const NOT_MIGRATED = 'Chức năng thanh toán SePay chưa sẵn sàng: cần áp dụng migration 007-sepay-payments.';
const NOT_CONFIGURED = 'Thanh toán SePay chưa được cấu hình.';
const NOT_FOUND = 'Không tìm thấy thanh toán.';
const SIMULATION_NOTICE = 'MÔ PHỎNG (test only) - không phải giao dịch ngân hàng thật.';

const PAYMENT_SELECT = `SELECT rtrim(t.MaThanhToan) AS "paymentId",rtrim(t.MaLichHen) AS "bookingId",t.MaThamChieu AS "reference",
  t.SoTienThanhToan::bigint AS "amount",t.TrangThaiGiaoDich AS "status",to_char(t.HanThanhToan,'YYYY-MM-DD"T"HH24:MI:SS') AS "expiresAt",
  CASE WHEN t.HanThanhToan<dbo.vn_now() THEN 1 ELSE 0 END AS "expired",t.SoTaiKhoanNhan AS "account",rtrim(l.MaKhachHang) AS "customerId",
  COALESCE(t.KhoanHoanTien,0)::bigint AS "refunded",l.TrangThaiLichHen AS "bookingStatus",t.NhaCungCap AS "provider"
  FROM dbo.ThanhToan t JOIN dbo.LichHen l ON l.MaLichHen=t.MaLichHen`;
const TOTAL_SQL = 'SELECT round(COALESCE(SUM(g.Gia),0))::bigint AS v FROM dbo.KhachSuDungDichVu c JOIN dbo.GoiDichVu g ON g.MaGoi=c.MaGoi WHERE c.MaLichHen=$1';
const LOCK_BOOKING_SQL = 'SELECT MaLichHen FROM dbo.LichHen WHERE MaLichHen=$1 FOR UPDATE';
/** Transaction-scoped advisory lock (safe behind Neon's transaction-mode PgBouncer); replaces the HOLDLOCK key-range lock. */
const ADVISORY_LOCK_SQL = 'SELECT pg_advisory_xact_lock(hashtext($1))';
const EVENT_SEEN_SQL = 'SELECT 1 AS found FROM dbo.SePayWebhookEvent WHERE NhaCungCap=$1 AND MaGiaoDichNhaCungCap=$2';
const eventLockKey = (provider: string, providerTxId: string) => `dbo.SePayWebhookEvent:${provider}:${providerTxId}`;

interface PaymentRow {
  paymentId: string; bookingId: string; reference: string; amount: number | string; status: string; expiresAt: string | null;
  expired: number; account: string | null; customerId: string | null; refunded: number | string; bookingStatus: string; provider?: string | null;
}

interface UnreconciledRow { eventId: number | string; provider: string; providerTxId: string; paymentId: string | null; amount: number | string | null; transferType: string | null; account: string | null; reference: string | null; outcome: string; receivedAt: string }

const num = (v: unknown) => Number(v ?? 0);
const newPaymentId = () => 'TT' + String(randomInt(0, 100_000_000)).padStart(8, '0');
const ID_CONFLICT = 'Không thể tạo mã thanh toán. Vui lòng thử lại!';

@Injectable()
export class PaymentsService {
  sepay = new SepayProvider();
  mock = new MockPaymentProvider();
  private migrated = false;

  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async createIntent(user: JwtPayload, bookingId: string) {
    const cfg = readPaymentsConfig();
    if (!cfg.accountNumber || !cfg.bank) throw new ServiceUnavailableException(NOT_CONFIGURED);
    await this.ensureSchema();
    const id = await this.tx(async (runner) => {
      const bookings = await runner.query('SELECT rtrim(MaKhachHang) AS "customerId",TrangThaiLichHen AS "status",TrangThaiThanhToan AS "pay" FROM dbo.LichHen WHERE MaLichHen=$1 FOR UPDATE', [bookingId]);
      if (!bookings.length) throw new NotFoundException('Không tìm thấy lịch hẹn.');
      await this.assertAccess(user, bookings[0].customerId, runner, 'Không tìm thấy lịch hẹn.');
      if (bookings[0].status === 'Đã hủy') throw new ConflictException('Không thể thanh toán lịch hẹn đã hủy!');
      if (bookings[0].pay === 'Đã thanh toán') throw new ConflictException('Lịch hẹn đã được thanh toán.');
      const total = num((await runner.query(TOTAL_SQL, [bookingId]))[0]?.v);
      const paid = await this.netPaid(runner, bookingId);
      const payable = total - paid;
      if (total <= 0 || payable <= 0) throw new ConflictException('Lịch hẹn không có khoản cần thanh toán.');
      const open = await runner.query(`SELECT rtrim(MaThanhToan) AS "id",SoTienThanhToan::bigint AS "amount" FROM dbo.ThanhToan WHERE MaLichHen=$1 AND TrangThaiGiaoDich=$2
        AND NhaCungCap='SEPAY' AND HanThanhToan>dbo.vn_now() AND COALESCE(SoTaiKhoanNhan,$3::varchar)=$3::varchar ORDER BY NgayGhiNhan DESC LIMIT 1`, [bookingId, PENDING, cfg.accountNumber]);
      if (open.length && num(open[0].amount) === payable) return open[0].id as string;
      await runner.query('UPDATE dbo.ThanhToan SET TrangThaiGiaoDich=$2 WHERE MaLichHen=$1 AND TrangThaiGiaoDich=$3', [bookingId, EXPIRED, PENDING]);
      const paymentId = await this.freeValue(runner, newPaymentId(), newPaymentId, 'MaThanhToan');
      const reference = await this.freeValue(runner, generateReference(cfg.prefix), () => generateReference(cfg.prefix), 'MaThamChieu');
      await runner.query(`INSERT INTO dbo.ThanhToan(MaThanhToan,MaLichHen,SoTienThanhToan,NgayGhiNhan,TrangThaiGiaoDich,KhoanHoanTien,MaThamChieu,NhaCungCap,HanThanhToan,SoTaiKhoanNhan)
        VALUES($1,$2,$3,dbo.vn_now(),$4,0,$5,'SEPAY',dbo.vn_now()+make_interval(mins => $6::int),$7)`, [paymentId, bookingId, payable, PENDING, reference, cfg.expiryMinutes, cfg.accountNumber]);
      return paymentId;
    }).catch((error: unknown) => {
      // Unique indexes (PK MaThanhToan, UX_ThanhToan_MaThamChieu) are the final guard against a concurrent id/reference collision.
      if (isUniqueViolation(error)) throw new ConflictException(ID_CONFLICT);
      throw error;
    });
    return this.status(user, id);
  }

  async status(user: JwtPayload, paymentId: string) {
    await this.ensureSchema();
    const rows = await this.database.query<PaymentRow[]>(`${PAYMENT_SELECT} WHERE t.MaThanhToan=$1`, [paymentId]);
    if (!rows.length) throw new NotFoundException(NOT_FOUND);
    await this.assertAccess(user, rows[0].customerId, undefined, NOT_FOUND);
    return this.toDto(rows[0]);
  }

  async handleSepayWebhook(req: WebhookRequest, body: unknown) {
    this.sepay.verifyWebhook(req);
    await this.ensureSchema();
    const raw = typeof req.rawBody === 'string' ? req.rawBody : req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(body) ?? '';
    let event: NormalizedPaymentEvent;
    try {
      event = this.sepay.parseWebhook(body);
    } catch (error) {
      if (!(error instanceof BadRequestException)) throw error;
      await this.auditInvalid(body, raw);
      return { success: true };
    }
    await this.processEvent(event, raw);
    return { success: true };
  }

  /** Authenticated but structurally invalid payload: keep evidence (idempotent per payload) and acknowledge so SePay does not retry forever. */
  private async auditInvalid(body: unknown, raw: string) {
    const id = (body as { id?: unknown } | null)?.id;
    const txId = typeof id === 'number' || typeof id === 'string' ? String(id) : '';
    const key = /^\d{1,20}$/.test(txId) ? txId : 'INVALID-' + createHash('sha256').update(raw).digest('hex').slice(0, 32);
    try {
      await this.tx(async (runner) => {
        await runner.query(ADVISORY_LOCK_SQL, [eventLockKey('SEPAY', key)]);
        if ((await runner.query(EVENT_SEEN_SQL, ['SEPAY', key])).length) return;
        await runner.query(`INSERT INTO dbo.SePayWebhookEvent(NhaCungCap,MaGiaoDichNhaCungCap,MaThanhToan,SoTienNhan,LoaiGiaoDich,SoTaiKhoanNhan,ThamChieu,KetQuaXuLy,DuLieuTho)
          VALUES($1,$2,NULL,NULL,NULL,NULL,NULL,'INVALID_PAYLOAD',$3)`, ['SEPAY', key, raw.slice(0, 20000)]);
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }

  /** Staff view of webhook events that did not confirm a payment (held transfers). Never returns the raw payload. */
  async unreconciled(query: UnreconciledQuery) {
    await this.ensureSchema();
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const total = num((await this.database.query<{ v: number }[]>("SELECT COUNT(*) AS v FROM dbo.SePayWebhookEvent WHERE KetQuaXuLy<>'CONFIRMED'"))[0]?.v);
    const items = await this.database.query<UnreconciledRow[]>(`SELECT MaSuKien AS "eventId",NhaCungCap AS "provider",MaGiaoDichNhaCungCap AS "providerTxId",rtrim(MaThanhToan) AS "paymentId",
      SoTienNhan::bigint AS "amount",LoaiGiaoDich AS "transferType",SoTaiKhoanNhan AS "account",ThamChieu AS "reference",KetQuaXuLy AS "outcome",
      to_char(NgayNhan,'YYYY-MM-DD"T"HH24:MI:SS') AS "receivedAt"
      FROM dbo.SePayWebhookEvent WHERE KetQuaXuLy<>'CONFIRMED' ORDER BY NgayNhan DESC,MaSuKien DESC OFFSET $1 ROWS FETCH NEXT $2 ROWS ONLY`, [(page - 1) * pageSize, pageSize]);
    return { items: items.map((i) => ({ ...i, amount: i.amount == null ? null : num(i.amount) })), total, page, pageSize };
  }

  async mockSettle(dto: MockWebhookDto) {
    this.mock.assertEnabled();
    await this.ensureSchema();
    const rows = await this.database.query<PaymentRow[]>(`${PAYMENT_SELECT} WHERE t.MaThanhToan=$1`, [dto.paymentId]);
    if (!rows.length) throw new NotFoundException(NOT_FOUND);
    const event = this.mock.simulate(rows[0].reference, dto.amount ?? num(rows[0].amount), dto.transferType);
    const outcome = await this.processEvent(event, JSON.stringify({ simulated: true, ...event }));
    return { simulated: true, notice: SIMULATION_NOTICE, outcome };
  }

  /** Records a refund decided by management (reason and actor audited in the same transaction); no money is moved by this system. */
  async refund(paymentId: string, dto: RefundPaymentDto, actorId: string) {
    await this.ensureSchema();
    await this.tx(async (runner) => {
      const first = await runner.query('SELECT rtrim(MaLichHen) AS "bookingId" FROM dbo.ThanhToan WHERE MaThanhToan=$1', [paymentId]);
      if (!first.length) throw new NotFoundException(NOT_FOUND);
      const bookingId = first[0].bookingId as string;
      await runner.query(LOCK_BOOKING_SQL, [bookingId]);
      const rows = await runner.query('SELECT TrangThaiGiaoDich AS "status",SoTienThanhToan::bigint AS "amount",COALESCE(KhoanHoanTien,0)::bigint AS "refunded" FROM dbo.ThanhToan WHERE MaThanhToan=$1 FOR UPDATE', [paymentId]);
      if (!rows.length || rows[0].status !== SUCCESS) throw new ConflictException('Chỉ có thể hoàn tiền cho giao dịch thành công.');
      const refunded = num(rows[0].refunded) + dto.amount;
      if (refunded > num(rows[0].amount)) throw new ConflictException('Số tiền hoàn vượt quá số tiền đã thanh toán.');
      await runner.query('UPDATE dbo.ThanhToan SET KhoanHoanTien=$2,TrangThaiGiaoDich=$3 WHERE MaThanhToan=$1', [paymentId, refunded, refunded === num(rows[0].amount) ? REFUNDED : SUCCESS]);
      await runner.query('INSERT INTO dbo.ThanhToanHoanTien(MaThanhToan,SoTien,LyDo,MaTaiKhoanThucHien) VALUES($1,$2,$3,$4)', [paymentId, dto.amount, dto.reason.trim(), actorId]);
      await this.syncBookingPayment(runner, bookingId);
    });
    return this.toDto((await this.database.query<PaymentRow[]>(`${PAYMENT_SELECT} WHERE t.MaThanhToan=$1`, [paymentId]))[0]);
  }

  /**
   * One SQL transaction: audit row (unique provider tx id) + payment/booking-payment update under row locks.
   * Idempotency: an advisory lock on (provider, tx id) serialises concurrent deliveries of the same event, the existence
   * check then sees the committed row, and UQ_SePayWebhookEvent_GiaoDich is the final guard (23505 -> DUPLICATE_EVENT).
   */
  async processEvent(event: NormalizedPaymentEvent, raw: string): Promise<Outcome | 'DUPLICATE_EVENT'> {
    const cfg = readPaymentsConfig();
    try {
      return await this.tx(async (runner) => {
        await runner.query(ADVISORY_LOCK_SQL, [eventLockKey(event.provider, event.providerTxId)]);
        const seen = await runner.query(EVENT_SEEN_SQL, [event.provider, event.providerTxId]);
        if (seen.length) return 'DUPLICATE_EVENT' as const;
        let payment: PaymentRow | undefined;
        if (event.reference) {
          const first = await runner.query('SELECT rtrim(MaLichHen) AS "bookingId" FROM dbo.ThanhToan WHERE MaThamChieu=$1', [event.reference]);
          if (first.length) {
            await runner.query(LOCK_BOOKING_SQL, [first[0].bookingId]);
            await runner.query('SELECT MaThanhToan FROM dbo.ThanhToan WHERE MaThamChieu=$1 FOR UPDATE', [event.reference]);
            payment = (await runner.query(`${PAYMENT_SELECT} WHERE t.MaThamChieu=$1`, [event.reference]))[0];
          }
        }
        const outcome = reconcile({
          transferType: event.transferType, eventAccount: event.accountNumber, expectedAccount: payment?.account || cfg.accountNumber, eventAmount: event.amount,
          payment: payment && { status: payment.status, amount: num(payment.amount), expired: payment.expired === 1 }, bookingStatus: payment?.bookingStatus,
        });
        await runner.query(`INSERT INTO dbo.SePayWebhookEvent(NhaCungCap,MaGiaoDichNhaCungCap,MaThanhToan,SoTienNhan,LoaiGiaoDich,SoTaiKhoanNhan,ThamChieu,KetQuaXuLy,DuLieuTho)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [event.provider, event.providerTxId, payment?.paymentId ?? null, event.amount, event.transferType.slice(0, 10), event.accountNumber.slice(0, 30), event.reference, outcome, raw.slice(0, 20000)]);
        if (outcome === 'CONFIRMED' && payment) {
          const updated = await runner.query(`UPDATE dbo.ThanhToan SET TrangThaiGiaoDich=$2,NgayGhiNhan=dbo.vn_now(),NhaCungCap=$3,MaGiaoDichNhaCungCap=$4
            WHERE MaThanhToan=$1 AND TrangThaiGiaoDich=$5 RETURNING rtrim(MaThanhToan) AS "paymentId"`, [payment.paymentId, SUCCESS, event.provider, event.providerTxId, PENDING]);
          if (!returnedRows(updated).length) throw new ConflictException('Thanh toán vừa được cập nhật.');
          await this.syncBookingPayment(runner, payment.bookingId);
        }
        return outcome;
      });
    } catch (error) {
      if (isUniqueViolation(error)) return 'DUPLICATE_EVENT';
      throw error;
    }
  }

  private async syncBookingPayment(runner: QueryRunner, bookingId: string) {
    const total = num((await runner.query(TOTAL_SQL, [bookingId]))[0]?.v);
    const paid = await this.netPaid(runner, bookingId);
    await runner.query('UPDATE dbo.LichHen SET TrangThaiThanhToan=$2 WHERE MaLichHen=$1', [bookingId, paymentStatusFor(paid, total)]);
  }

  private async netPaid(runner: QueryRunner, bookingId: string) {
    const rows = await runner.query('SELECT round(COALESCE(SUM(SoTienThanhToan-COALESCE(KhoanHoanTien,0)),0))::bigint AS v FROM dbo.ThanhToan WHERE MaLichHen=$1 AND TrangThaiGiaoDich=$2', [bookingId, SUCCESS]);
    return num(rows[0]?.v);
  }

  private async assertAccess(user: JwtPayload, bookingCustomerId: string | null | undefined, runner: QueryRunner | undefined, notFound: string) {
    if (user.role === 'Khách hàng') {
      const sql = 'SELECT 1 AS ok FROM dbo.KhachHang WHERE MaKhachHang=$1 AND MaTaiKhoan=$2';
      const params = [bookingCustomerId ?? '', user.sub];
      const rows = runner ? await runner.query(sql, params) : await this.database.query<unknown[]>(sql, params);
      if (!bookingCustomerId || !rows.length) throw new NotFoundException(notFound);
      return;
    }
    if (user.role !== 'Chủ Spa' && !(['Nhân viên', 'Quản lý'].includes(user.role) && (user.permissions ?? []).includes('Q01'))) {
      throw new ForbiddenException('Bạn không có quyền hạn để thực hiện thao tác này.');
    }
  }

  private toDto(row: PaymentRow) {
    const cfg = readPaymentsConfig();
    const amount = num(row.amount);
    const status = row.status === PENDING && row.expired === 1 ? EXPIRED : row.status;
    return {
      paymentId: row.paymentId, bookingId: row.bookingId, reference: row.reference, amount,
      qrUrl: buildQrUrl({ ...cfg, accountNumber: row.account || cfg.accountNumber }, amount, row.reference), accountNumber: row.account || cfg.accountNumber,
      provider: row.provider === 'MOCK' ? 'MOCK' : 'SEPAY', simulated: row.provider === 'MOCK', bankName: cfg.bank, accountHolder: cfg.accountHolder,
      expiresAt: row.expiresAt ?? '', status: status === SUCCESS ? 'Đã thanh toán' : status, refundedAmount: num(row.refunded),
    };
  }

  private async freeValue(runner: QueryRunner, first: string, next: () => string, column: 'MaThanhToan' | 'MaThamChieu') {
    for (let value = first, i = 0; i < 5; value = next(), i++) {
      if (!(await runner.query(`SELECT 1 AS found FROM dbo.ThanhToan WHERE ${column}=$1`, [value])).length) return value;
    }
    throw new ConflictException(ID_CONFLICT);
  }

  private async ensureSchema() {
    if (this.migrated) return;
    // PostgreSQL catalog probe (unquoted identifiers are stored lowercase); an older schema degrades to 503 NOT_MIGRATED.
    const rows = await this.database.query<{ ready: number }[]>(`SELECT CASE WHEN (SELECT count(*) FROM information_schema.columns WHERE table_schema='dbo' AND table_name='thanhtoan'
      AND column_name IN ('mathamchieu','nhacungcap','magiaodichnhacungcap','hanthanhtoan','sotaikhoannhan'))=5
      AND to_regclass('dbo.sepaywebhookevent') IS NOT NULL AND to_regclass('dbo.thanhtoanhoantien') IS NOT NULL THEN 1 ELSE 0 END AS "ready"`);
    if (rows[0]?.ready !== 1) throw new ServiceUnavailableException(NOT_MIGRATED);
    this.migrated = true;
  }

  /** DatabaseService.transaction rolls back on any error; driver errors (other than unique violations, handled by callers) become 503. */
  private async tx<T>(work: (runner: QueryRunner) => Promise<T>): Promise<T> {
    try {
      return await this.database.transaction(work);
    } catch (error) {
      if (error instanceof HttpException || isUniqueViolation(error)) throw error;
      throw new ServiceUnavailableException('Không thể xử lý thanh toán. Vui lòng thử lại sau!');
    }
  }
}
