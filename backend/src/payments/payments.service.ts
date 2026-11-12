import { createHash, randomInt } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, HttpException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { QueryRunner } from 'typeorm';
import { DatabaseService } from '../database.service';
import { JwtPayload } from '../auth/auth.dto';
import { MockPaymentProvider, NormalizedPaymentEvent, SepayProvider, WebhookRequest } from './payment-provider';
import { EXPIRED, Outcome, PENDING, REFUNDED, SUCCESS, buildQrUrl, generateReference, paymentStatusFor, reconcile } from './payment-rules';
import { readPaymentsConfig } from './payments.config';
import { MockWebhookDto, RefundPaymentDto, UnreconciledQuery } from './payments.dto';

export const NOT_MIGRATED = 'Chức năng thanh toán SePay chưa sẵn sàng: cần áp dụng migration 007-sepay-payments.';
const NOT_CONFIGURED = 'Thanh toán SePay chưa được cấu hình.';
const NOT_FOUND = 'Không tìm thấy thanh toán.';
const SIMULATION_NOTICE = 'MÔ PHỎNG (test only) - không phải giao dịch ngân hàng thật.';

const PAYMENT_SELECT = `SELECT RTRIM(t.MaThanhToan) AS paymentId,RTRIM(t.MaLichHen) AS bookingId,t.MaThamChieu AS reference,
  CAST(t.SoTienThanhToan AS bigint) AS amount,t.TrangThaiGiaoDich AS status,CONVERT(varchar(19),t.HanThanhToan,126) AS expiresAt,
  CASE WHEN t.HanThanhToan<GETDATE() THEN 1 ELSE 0 END AS expired,t.SoTaiKhoanNhan AS account,RTRIM(l.MaKhachHang) AS customerId,
  CAST(ISNULL(t.KhoanHoanTien,0) AS bigint) AS refunded,l.TrangThaiLichHen AS bookingStatus,t.NhaCungCap AS provider
  FROM dbo.ThanhToan t JOIN dbo.LichHen l ON l.MaLichHen=t.MaLichHen`;

interface PaymentRow {
  paymentId: string; bookingId: string; reference: string; amount: number | string; status: string; expiresAt: string | null;
  expired: number; account: string | null; customerId: string | null; refunded: number | string; bookingStatus: string; provider?: string | null;
}

interface UnreconciledRow { eventId: number | string; provider: string; providerTxId: string; paymentId: string | null; amount: number | string | null; transferType: string | null; account: string | null; reference: string | null; outcome: string; receivedAt: string }

const num = (v: unknown) => Number(v ?? 0);
const isUnique = (e: unknown) => [2601, 2627].includes((e as { driverError?: { number?: number }; number?: number })?.driverError?.number ?? (e as { number?: number })?.number ?? 0);

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
      const bookings = await runner.query('SELECT RTRIM(MaKhachHang) AS customerId,TrangThaiLichHen AS status,TrangThaiThanhToan AS pay FROM dbo.LichHen WITH(UPDLOCK,HOLDLOCK) WHERE MaLichHen=@0', [bookingId]);
      if (!bookings.length) throw new NotFoundException('Không tìm thấy lịch hẹn.');
      await this.assertAccess(user, bookings[0].customerId, runner, 'Không tìm thấy lịch hẹn.');
      if (bookings[0].status === 'Đã hủy') throw new ConflictException('Không thể thanh toán lịch hẹn đã hủy!');
      if (bookings[0].pay === 'Đã thanh toán') throw new ConflictException('Lịch hẹn đã được thanh toán.');
      const total = num((await runner.query('SELECT CAST(ROUND(ISNULL(SUM(g.Gia),0),0) AS bigint) AS v FROM dbo.KhachSuDungDichVu c JOIN dbo.GoiDichVu g ON g.MaGoi=c.MaGoi WHERE c.MaLichHen=@0', [bookingId]))[0]?.v);
      const paid = await this.netPaid(runner, bookingId);
      const payable = total - paid;
      if (total <= 0 || payable <= 0) throw new ConflictException('Lịch hẹn không có khoản cần thanh toán.');
      const open = await runner.query("SELECT TOP(1) RTRIM(MaThanhToan) AS id,CAST(SoTienThanhToan AS bigint) AS amount FROM dbo.ThanhToan WHERE MaLichHen=@0 AND TrangThaiGiaoDich=@1 AND NhaCungCap='SEPAY' AND HanThanhToan>GETDATE() AND ISNULL(SoTaiKhoanNhan,@2)=@2 ORDER BY NgayGhiNhan DESC", [bookingId, PENDING, cfg.accountNumber]);
      if (open.length && num(open[0].amount) === payable) return open[0].id as string;
      await runner.query('UPDATE dbo.ThanhToan SET TrangThaiGiaoDich=@1 WHERE MaLichHen=@0 AND TrangThaiGiaoDich=@2', [bookingId, EXPIRED, PENDING]);
      const paymentId = await this.freeValue(runner, 'TT' + String(randomInt(0, 100_000_000)).padStart(8, '0'), () => 'TT' + String(randomInt(0, 100_000_000)).padStart(8, '0'), 'MaThanhToan');
      const reference = await this.freeValue(runner, generateReference(cfg.prefix), () => generateReference(cfg.prefix), 'MaThamChieu');
      await runner.query(`INSERT dbo.ThanhToan(MaThanhToan,MaLichHen,SoTienThanhToan,NgayGhiNhan,TrangThaiGiaoDich,KhoanHoanTien,MaThamChieu,NhaCungCap,HanThanhToan,SoTaiKhoanNhan)
        VALUES(@0,@1,@2,GETDATE(),@3,0,@4,'SEPAY',DATEADD(minute,@5,GETDATE()),@6)`, [paymentId, bookingId, payable, PENDING, reference, cfg.expiryMinutes, cfg.accountNumber]);
      return paymentId;
    });
    return this.status(user, id);
  }

  async status(user: JwtPayload, paymentId: string) {
    await this.ensureSchema();
    const rows = await this.database.query<PaymentRow[]>(`${PAYMENT_SELECT} WHERE t.MaThanhToan=@0`, [paymentId]);
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
        if ((await runner.query('SELECT 1 AS found FROM dbo.SePayWebhookEvent WITH(UPDLOCK,HOLDLOCK) WHERE NhaCungCap=@0 AND MaGiaoDichNhaCungCap=@1', ['SEPAY', key])).length) return;
        await runner.query(`INSERT dbo.SePayWebhookEvent(NhaCungCap,MaGiaoDichNhaCungCap,MaThanhToan,SoTienNhan,LoaiGiaoDich,SoTaiKhoanNhan,ThamChieu,KetQuaXuLy,DuLieuTho)
          VALUES(@0,@1,NULL,NULL,NULL,NULL,NULL,'INVALID_PAYLOAD',@2)`, ['SEPAY', key, raw.slice(0, 20000)]);
      });
    } catch (error) {
      if (!isUnique(error)) throw error;
    }
  }

  /** Staff view of webhook events that did not confirm a payment (held transfers). Never returns the raw payload. */
  async unreconciled(query: UnreconciledQuery) {
    await this.ensureSchema();
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const total = num((await this.database.query<{ v: number }[]>("SELECT COUNT(*) AS v FROM dbo.SePayWebhookEvent WHERE KetQuaXuLy<>'CONFIRMED'"))[0]?.v);
    const items = await this.database.query<UnreconciledRow[]>(`SELECT MaSuKien AS eventId,NhaCungCap AS provider,MaGiaoDichNhaCungCap AS providerTxId,RTRIM(MaThanhToan) AS paymentId,
      CAST(SoTienNhan AS bigint) AS amount,LoaiGiaoDich AS transferType,SoTaiKhoanNhan AS account,ThamChieu AS reference,KetQuaXuLy AS outcome,CONVERT(varchar(19),NgayNhan,126) AS receivedAt
      FROM dbo.SePayWebhookEvent WHERE KetQuaXuLy<>'CONFIRMED' ORDER BY NgayNhan DESC,MaSuKien DESC OFFSET @0 ROWS FETCH NEXT @1 ROWS ONLY`, [(page - 1) * pageSize, pageSize]);
    return { items: items.map((i) => ({ ...i, amount: i.amount == null ? null : num(i.amount) })), total, page, pageSize };
  }

  async mockSettle(dto: MockWebhookDto) {
    this.mock.assertEnabled();
    await this.ensureSchema();
    const rows = await this.database.query<PaymentRow[]>(`${PAYMENT_SELECT} WHERE t.MaThanhToan=@0`, [dto.paymentId]);
    if (!rows.length) throw new NotFoundException(NOT_FOUND);
    const event = this.mock.simulate(rows[0].reference, dto.amount ?? num(rows[0].amount), dto.transferType);
    const outcome = await this.processEvent(event, JSON.stringify({ simulated: true, ...event }));
    return { simulated: true, notice: SIMULATION_NOTICE, outcome };
  }

  /** Records a refund decided by management (reason and actor audited in the same transaction); no money is moved by this system. */
  async refund(paymentId: string, dto: RefundPaymentDto, actorId: string) {
    await this.ensureSchema();
    await this.tx(async (runner) => {
      const first = await runner.query('SELECT RTRIM(MaLichHen) AS bookingId FROM dbo.ThanhToan WHERE MaThanhToan=@0', [paymentId]);
      if (!first.length) throw new NotFoundException(NOT_FOUND);
      const bookingId = first[0].bookingId as string;
      await runner.query('SELECT MaLichHen FROM dbo.LichHen WITH(UPDLOCK,HOLDLOCK) WHERE MaLichHen=@0', [bookingId]);
      const rows = await runner.query('SELECT TrangThaiGiaoDich AS status,CAST(SoTienThanhToan AS bigint) AS amount,CAST(ISNULL(KhoanHoanTien,0) AS bigint) AS refunded FROM dbo.ThanhToan WITH(UPDLOCK,HOLDLOCK) WHERE MaThanhToan=@0', [paymentId]);
      if (!rows.length || rows[0].status !== SUCCESS) throw new ConflictException('Chỉ có thể hoàn tiền cho giao dịch thành công.');
      const refunded = num(rows[0].refunded) + dto.amount;
      if (refunded > num(rows[0].amount)) throw new ConflictException('Số tiền hoàn vượt quá số tiền đã thanh toán.');
      await runner.query('UPDATE dbo.ThanhToan SET KhoanHoanTien=@1,TrangThaiGiaoDich=@2 WHERE MaThanhToan=@0', [paymentId, refunded, refunded === num(rows[0].amount) ? REFUNDED : SUCCESS]);
      await runner.query('INSERT dbo.ThanhToanHoanTien(MaThanhToan,SoTien,LyDo,MaTaiKhoanThucHien) VALUES(@0,@1,@2,@3)', [paymentId, dto.amount, dto.reason.trim(), actorId]);
      await this.syncBookingPayment(runner, bookingId);
    });
    return this.toDto((await this.database.query<PaymentRow[]>(`${PAYMENT_SELECT} WHERE t.MaThanhToan=@0`, [paymentId]))[0]);
  }

  /** One SQL transaction: audit row (unique provider tx id) + payment/booking-payment update under row locks. */
  async processEvent(event: NormalizedPaymentEvent, raw: string): Promise<Outcome | 'DUPLICATE_EVENT'> {
    const cfg = readPaymentsConfig();
    try {
      return await this.tx(async (runner) => {
        const seen = await runner.query('SELECT 1 AS found FROM dbo.SePayWebhookEvent WITH(UPDLOCK,HOLDLOCK) WHERE NhaCungCap=@0 AND MaGiaoDichNhaCungCap=@1', [event.provider, event.providerTxId]);
        if (seen.length) return 'DUPLICATE_EVENT' as const;
        let payment: PaymentRow | undefined;
        if (event.reference) {
          const first = await runner.query('SELECT RTRIM(MaLichHen) AS bookingId FROM dbo.ThanhToan WHERE MaThamChieu=@0', [event.reference]);
          if (first.length) {
            await runner.query('SELECT MaLichHen FROM dbo.LichHen WITH(UPDLOCK,HOLDLOCK) WHERE MaLichHen=@0', [first[0].bookingId]);
            await runner.query('SELECT MaThanhToan FROM dbo.ThanhToan WITH(UPDLOCK,HOLDLOCK) WHERE MaThamChieu=@0', [event.reference]);
            payment = (await runner.query(`${PAYMENT_SELECT} WHERE t.MaThamChieu=@0`, [event.reference]))[0];
          }
        }
        const outcome = reconcile({
          transferType: event.transferType, eventAccount: event.accountNumber, expectedAccount: payment?.account || cfg.accountNumber, eventAmount: event.amount,
          payment: payment && { status: payment.status, amount: num(payment.amount), expired: payment.expired === 1 }, bookingStatus: payment?.bookingStatus,
        });
        await runner.query(`INSERT dbo.SePayWebhookEvent(NhaCungCap,MaGiaoDichNhaCungCap,MaThanhToan,SoTienNhan,LoaiGiaoDich,SoTaiKhoanNhan,ThamChieu,KetQuaXuLy,DuLieuTho)
          VALUES(@0,@1,@2,@3,@4,@5,@6,@7,@8)`, [event.provider, event.providerTxId, payment?.paymentId ?? null, event.amount, event.transferType.slice(0, 10), event.accountNumber.slice(0, 30), event.reference, outcome, raw.slice(0, 20000)]);
        if (outcome === 'CONFIRMED' && payment) {
          const rows = await runner.query('UPDATE dbo.ThanhToan SET TrangThaiGiaoDich=@1,NgayGhiNhan=GETDATE(),NhaCungCap=@2,MaGiaoDichNhaCungCap=@3 OUTPUT inserted.MaThanhToan WHERE MaThanhToan=@0 AND TrangThaiGiaoDich=@4',
            [payment.paymentId, SUCCESS, event.provider, event.providerTxId, PENDING]);
          if (!rows.length) throw new ConflictException('Thanh toán vừa được cập nhật.');
          await this.syncBookingPayment(runner, payment.bookingId);
        }
        return outcome;
      });
    } catch (error) {
      if (isUnique(error)) return 'DUPLICATE_EVENT';
      throw error;
    }
  }

  private async syncBookingPayment(runner: QueryRunner, bookingId: string) {
    const total = num((await runner.query('SELECT CAST(ROUND(ISNULL(SUM(g.Gia),0),0) AS bigint) AS v FROM dbo.KhachSuDungDichVu c JOIN dbo.GoiDichVu g ON g.MaGoi=c.MaGoi WHERE c.MaLichHen=@0', [bookingId]))[0]?.v);
    const paid = await this.netPaid(runner, bookingId);
    await runner.query('UPDATE dbo.LichHen SET TrangThaiThanhToan=@1 WHERE MaLichHen=@0', [bookingId, paymentStatusFor(paid, total)]);
  }

  private async netPaid(runner: QueryRunner, bookingId: string) {
    const rows = await runner.query('SELECT CAST(ROUND(ISNULL(SUM(SoTienThanhToan-ISNULL(KhoanHoanTien,0)),0),0) AS bigint) AS v FROM dbo.ThanhToan WHERE MaLichHen=@0 AND TrangThaiGiaoDich=@1', [bookingId, SUCCESS]);
    return num(rows[0]?.v);
  }

  private async assertAccess(user: JwtPayload, bookingCustomerId: string | null | undefined, runner: QueryRunner | undefined, notFound: string) {
    if (user.role === 'Khách hàng') {
      const sql = 'SELECT 1 AS ok FROM dbo.KhachHang WHERE MaKhachHang=@0 AND MaTaiKhoan=@1';
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

  private async freeValue(runner: QueryRunner, first: string, next: () => string, column: string) {
    for (let value = first, i = 0; i < 5; value = next(), i++) {
      if (!(await runner.query(`SELECT 1 AS found FROM dbo.ThanhToan WHERE ${column}=@0`, [value])).length) return value;
    }
    throw new ConflictException('Không thể tạo mã thanh toán. Vui lòng thử lại!');
  }

  private async ensureSchema() {
    if (this.migrated) return;
    const rows = await this.database.query<{ ready: number }[]>(`SELECT CASE WHEN COL_LENGTH('dbo.ThanhToan','MaThamChieu') IS NOT NULL AND COL_LENGTH('dbo.ThanhToan','NhaCungCap') IS NOT NULL
      AND COL_LENGTH('dbo.ThanhToan','MaGiaoDichNhaCungCap') IS NOT NULL AND COL_LENGTH('dbo.ThanhToan','HanThanhToan') IS NOT NULL AND COL_LENGTH('dbo.ThanhToan','SoTaiKhoanNhan') IS NOT NULL
      AND OBJECT_ID('dbo.SePayWebhookEvent','U') IS NOT NULL AND OBJECT_ID('dbo.ThanhToanHoanTien','U') IS NOT NULL THEN 1 ELSE 0 END AS ready`);
    if (rows[0]?.ready !== 1) throw new ServiceUnavailableException(NOT_MIGRATED);
    this.migrated = true;
  }

  private async tx<T>(work: (runner: QueryRunner) => Promise<T>): Promise<T> {
    let runner: QueryRunner | undefined;
    try {
      runner = (await this.database.getDataSource()).createQueryRunner();
      await runner.connect();
      await runner.startTransaction();
      const result = await work(runner);
      await runner.commitTransaction();
      return result;
    } catch (error) {
      if (runner?.isTransactionActive) await runner.rollbackTransaction();
      if (error instanceof HttpException || isUnique(error)) throw error;
      throw new ServiceUnavailableException('Không thể xử lý thanh toán. Vui lòng thử lại sau!');
    } finally {
      if (runner) await runner.release();
    }
  }
}
