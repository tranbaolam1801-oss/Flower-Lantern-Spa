import { randomInt } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { QueryRunner } from 'typeorm';
import { DatabaseService } from '../database.service';
import { returnedRows } from '../common/pg-result';
import { BedInterval, BookingTransactionService, cancelUnderLocks } from './booking-transaction.service';
import { ACTIVE_BEDS, ACTIVE_BED, CUSTOMER_EDITABLE_STATUSES, LOCKED_STATUSES, MESSAGES, addMinutes, canTransition, checkSlot, vietnamNow } from './booking-rules';
import { captureBookingBefore, syncBookingNotifications } from '../notifications/booking-notification-enqueue';
import { CreateAdminBookingDto, CreateCustomerBookingDto, SearchBookingsQuery, UpdateAdminBookingDto } from './booking-write.dto';

interface Planned extends BedInterval { packageId: string; customerName: string; customerPhone?: string }
interface ExistingDetail { id: string; bedId: string | null; packageId: string; startsAt: string; duration: number }
interface BookingRow { id: string; status: string; pay: string; date: string }
interface Patch { status: string; pay: string; notes?: string | null; readPay?: string; name?: string; phone?: string; email?: string | null }
interface AutoGuest { startsAt: string; endsAt: string; preferred?: string | null }

const stale = 'Lịch hẹn vừa được cập nhật. Vui lòng tải lại và thử lại!';
const PAYMENT_MANAGED = 'Trạng thái thanh toán được quản lý theo giao dịch; không thể sửa thủ công.';

@Injectable()
export class BookingWriteService {
  now = () => vietnamNow();
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(BookingTransactionService) private readonly transactions: BookingTransactionService,
  ) {}

  async search(query: SearchBookingsQuery) {
    // PostgreSQL LIKE only treats % and _ as wildcards ('[' is literal, unlike T-SQL); '~' is the escape character.
    const like = (v?: string) => (v?.trim() ? `%${v.trim().replace(/[~%_]/g, (c) => '~' + c)}%` : null);
    const digits = query.phone?.replace(/[^0-9+]/g, '').replace(/^\+84/, '0');
    // ILIKE reproduces the case-insensitive, accent-sensitive Vietnamese_100_CI_AS / default CI collation matching.
    const items = await this.database.query<Record<string, unknown>[]>(`SELECT RTRIM(c.MaChiTiet) AS id,RTRIM(l.MaLichHen) AS "bookingId",
      RTRIM(c.MaGiuong) AS "bedId",c.TenKhach AS "customerName",COALESCE(c.SoDienThoai,l.SoDienThoaiNguoiDat) AS "customerPhone",
      d.TenDichVu AS "serviceName",g.TenGoi AS "packageName",RTRIM(g.MaGoi) AS "packageId",
      l.TrangThaiLichHen AS status,l.TrangThaiThanhToan AS "paymentStatus",
      l.HoTenNguoiDat AS "bookerName",RTRIM(l.SoDienThoaiNguoiDat) AS "bookerPhone",l.EmailNguoiDat AS "bookerEmail",l.GhiChu AS notes,
      to_char(c.ThoiDiemBatDau,'YYYY-MM-DD"T"HH24:MI:SS') AS "startsAt",to_char(c.ThoiDiemKetThuc,'YYYY-MM-DD"T"HH24:MI:SS') AS "endsAt",
      floor(extract(epoch FROM (c.ThoiDiemBatDau-c.ThoiDiemBatDau::date::timestamp))/60)::int AS "startMinute",
      floor(extract(epoch FROM (c.ThoiDiemKetThuc-c.ThoiDiemBatDau::date::timestamp))/60)::int AS "endMinute"
      FROM dbo.KhachSuDungDichVu c JOIN dbo.LichHen l ON l.MaLichHen=c.MaLichHen
      JOIN dbo.GoiDichVu g ON g.MaGoi=c.MaGoi JOIN dbo.DichVu d ON d.MaDichVu=g.MaDichVu
      WHERE ($1::date IS NULL OR (c.ThoiDiemBatDau<($1::date+1)::timestamp AND c.ThoiDiemKetThuc>$1::date::timestamp))
      AND ($2::text IS NULL OR l.TrangThaiLichHen=$2::text)
      AND ($3::text IS NULL OR l.MaLichHen ILIKE $3::text ESCAPE '~' OR l.HoTenNguoiDat ILIKE $3::text ESCAPE '~'
        OR c.TenKhach ILIKE $3::text ESCAPE '~' OR l.SoDienThoaiNguoiDat LIKE $3::text ESCAPE '~' OR c.SoDienThoai LIKE $3::text ESCAPE '~')
      AND ($4::text IS NULL OR l.HoTenNguoiDat ILIKE $4::text ESCAPE '~' OR c.TenKhach ILIKE $4::text ESCAPE '~')
      AND ($5::text IS NULL OR l.SoDienThoaiNguoiDat LIKE $5::text ESCAPE '~' OR c.SoDienThoai LIKE $5::text ESCAPE '~')
      AND ($6::text IS NULL OR l.EmailNguoiDat ILIKE $6::text ESCAPE '~')
      AND ($7::text IS NULL OR l.MaLichHen ILIKE $7::text ESCAPE '~')
      AND ($8::text IS NULL OR d.TenDichVu ILIKE $8::text ESCAPE '~' OR g.TenGoi ILIKE $8::text ESCAPE '~')
      AND ($9::date IS NULL OR l.NgayHen>=$9::date) AND ($10::date IS NULL OR l.NgayHen<=$10::date)
      ORDER BY c.ThoiDiemBatDau,c.MaChiTiet LIMIT 200`, [query.date ?? null, query.status ?? null, like(query.q), like(query.name), like(digits), like(query.email), like(query.code), like(query.service), query.dateFrom ?? null, query.dateTo ?? null]);
    // Booking source is not persisted (no LichHen column), so the "Nguồn" filter cannot be applied; say so instead of silently ignoring it.
    const warnings = query.source?.trim() ? ['Nguồn đặt lịch chưa được lưu trữ nên bộ lọc "Nguồn" chưa được áp dụng.'] : [];
    return { items, warnings };
  }

  async createAdmin(dto: CreateAdminBookingDto) {
    const packages = await this.packages(dto.guests.map((g) => g.packageId), true);
    const planned: Planned[] = dto.guests.map((g) => {
      const duration = packages.get(g.packageId);
      if (duration === undefined) throw new BadRequestException(MESSAGES.package);
      if (g.startsAt.slice(0, 10) !== dto.date) throw new BadRequestException(MESSAGES.date);
      return { bedId: g.bedId, startsAt: g.startsAt, endsAt: checkSlot(g.startsAt, duration, this.now()), packageId: g.packageId, customerName: g.customerName.trim(), customerPhone: g.customerPhone };
    });
    const id = await this.transactions.reserve(planned, async (runner) => {
      const customer = returnedRows<{ id: string }>(await runner.query('SELECT RTRIM(MaKhachHang) AS id FROM dbo.KhachHang WHERE SoDienThoai=$1 LIMIT 1', [dto.bookerPhone]));
      const bookingId = await this.insertBooking(runner, planned, {
        customerId: customer[0]?.id ?? null, name: dto.bookerName.trim(), phone: dto.bookerPhone, email: dto.bookerEmail ?? null,
        notes: dto.notes ?? null, date: dto.date, status: dto.status ?? 'Chưa đến', pay: dto.paymentStatus ?? 'Chưa thanh toán',
      });
      await syncBookingNotifications(runner, bookingId, null); // notification jobs commit atomically with the booking
      return bookingId;
    });
    const warnings: string[] = [];
    if (dto.prepaidAmount) warnings.push('Số tiền thanh toán trả trước chưa được lưu (hệ thống chưa có nơi ghi nhận). Vui lòng ghi nhận qua giao dịch thanh toán.');
    if (dto.source) warnings.push('Nguồn đặt lịch chưa được lưu (hệ thống chưa có nơi ghi nhận).');
    return { id, message: 'Tạo lịch hẹn thành công!', warnings };
  }

  async updateAdmin(id: string, dto: UpdateAdminBookingDto) {
    const booking = await this.load(id);
    this.assertUnlocked(booking.status);
    const status = dto.status ?? booking.status;
    if (!canTransition(booking.status, status)) throw new ConflictException(MESSAGES.transition);
    if (dto.paymentStatus !== undefined && dto.paymentStatus !== booking.pay) {
      const recorded = returnedRows(await this.database.query<unknown>('SELECT 1 AS found FROM dbo.ThanhToan WHERE MaLichHen=$1 LIMIT 1', [id]));
      if (recorded.length) throw new ConflictException(PAYMENT_MANAGED);
    }
    const patch: Patch = {
      status, pay: dto.paymentStatus ?? booking.pay, readPay: booking.pay,
      notes: dto.notes === undefined ? undefined : dto.notes.trim() === '' ? null : dto.notes,
      name: dto.bookerName?.trim() || undefined, phone: dto.bookerPhone,
      email: dto.bookerEmail === undefined ? undefined : dto.bookerEmail.trim() === '' ? null : dto.bookerEmail.trim(),
    };
    if (!dto.date && !dto.guests) {
      // Single optimistic statement: the row lock taken by UPDATE plus the status/payment guards replace UPDLOCK.
      const sql = `UPDATE dbo.LichHen SET TrangThaiLichHen=$3::text,TrangThaiThanhToan=$4::text,
        GhiChu=CASE WHEN $5::int=1 THEN $6::text ELSE GhiChu END,
        HoTenNguoiDat=COALESCE($8::text,HoTenNguoiDat),SoDienThoaiNguoiDat=COALESCE($9::text,SoDienThoaiNguoiDat),
        EmailNguoiDat=CASE WHEN $10::int=1 THEN $11::text ELSE EmailNguoiDat END
        WHERE MaLichHen=$1 AND TrangThaiLichHen=$2::text AND TrangThaiThanhToan=$7::text RETURNING MaLichHen`;
      const params = [id, booking.status, patch.status, patch.pay, patch.notes === undefined ? 0 : 1, patch.notes ?? null, booking.pay, patch.name ?? null, patch.phone ?? null, patch.email === undefined ? 0 : 1, patch.email ?? null];
      // Status/recipient changes enqueue or cancel notification jobs in the same transaction; other edits keep the single statement.
      const rows = patch.status !== booking.status || patch.name !== undefined || patch.phone !== undefined
        ? await this.database.transaction(async (runner) => {
          const changed = returnedRows(await runner.query(sql, params));
          if (changed.length) await syncBookingNotifications(runner, id, { status: booking.status, startsAt: null });
          return changed;
        })
        : returnedRows(await this.database.query<unknown>(sql, params));
      if (!rows.length) throw new ConflictException(stale);
      return { id, message: 'Cập nhật lịch hẹn thành công!' };
    }
    if (status === 'Đã hủy' || !CUSTOMER_EDITABLE_STATUSES.includes(booking.status)) throw new ConflictException(MESSAGES.transition);
    const date = dto.date ?? booking.date;
    if (dto.guests) {
      const packages = await this.packages(dto.guests.map((g) => g.packageId), true);
      const planned: Planned[] = dto.guests.map((g) => {
        const duration = packages.get(g.packageId);
        if (duration === undefined) throw new BadRequestException(MESSAGES.package);
        if (g.startsAt.slice(0, 10) !== date) throw new BadRequestException(MESSAGES.date);
        return { bedId: g.bedId, startsAt: g.startsAt, endsAt: checkSlot(g.startsAt, duration, this.now()), packageId: g.packageId, customerName: g.customerName.trim(), customerPhone: g.customerPhone };
      });
      await this.transactions.reserve(planned, async (runner) => {
        await this.lockStatus(runner, id, booking.status, booking.pay);
        const before = await captureBookingBefore(runner, id);
        await runner.query('DELETE FROM dbo.KhachSuDungDichVu WHERE MaLichHen=$1', [id]);
        for (const p of planned) await this.insertDetail(runner, id, p);
        await this.updateBooking(runner, id, patch, date, planned.map((p) => p.startsAt).sort()[0]);
        await syncBookingNotifications(runner, id, before);
      }, id);
      return { id, message: 'Cập nhật lịch hẹn thành công!' };
    }
    const details = await this.details(id);
    if (!details.length) throw new BadRequestException(MESSAGES.guest);
    const first = details.map((d) => d.startsAt).sort()[0];
    await this.shift(id, booking.status, details, `${date}T${first.slice(11)}`, true, patch);
    return { id, message: 'Cập nhật lịch hẹn thành công!' };
  }

  async createCustomer(sub: string, dto: CreateCustomerBookingDto) {
    const customerId = await this.customerId(sub);
    const packages = await this.packages(dto.guests.map((g) => g.packageId), true);
    const startsAt = `${dto.date}T${dto.time}:00`;
    const guests = dto.guests.map((g) => {
      const duration = packages.get(g.packageId);
      if (duration === undefined) throw new BadRequestException(MESSAGES.package);
      return { g, startsAt, endsAt: checkSlot(startsAt, duration, this.now()) };
    });
    const id = await this.reserveAuto(guests, false, undefined, (beds) => {
      const planned: Planned[] = guests.map((x, i) => ({ bedId: beds[i], startsAt: x.startsAt, endsAt: x.endsAt, packageId: x.g.packageId, customerName: x.g.customerName.trim(), customerPhone: x.g.customerPhone }));
      return [planned, (runner) => this.insertBooking(runner, planned, {
        customerId, name: dto.fullName.trim(), phone: dto.phone, email: dto.email ?? null, notes: dto.notes ?? null,
        date: dto.date, status: 'Chờ xác nhận', pay: 'Chưa thanh toán',
      })];
    });
    return { id, status: 'Chờ xác nhận', message: 'Đặt lịch hẹn thành công! Lịch hẹn đang chờ xác nhận.' };
  }

  async rescheduleMine(sub: string, id: string, date: string, time: string) {
    const booking = await this.loadOwn(id, sub);
    this.assertUnlocked(booking.status);
    if (!CUSTOMER_EDITABLE_STATUSES.includes(booking.status)) throw new ConflictException('Lịch hẹn này không thể đổi!');
    const details = await this.details(id);
    if (!details.length) throw new BadRequestException(MESSAGES.guest);
    await this.shift(id, booking.status, details, `${date}T${time}:00`, false, { status: booking.status, pay: booking.pay });
    return { id, message: 'Đổi lịch hẹn thành công!' };
  }

  async cancelMine(sub: string, id: string) {
    // Ownership comes from the authenticated account; locks follow the global order (beds, then LichHen).
    const result = await this.database.transaction((runner) => cancelUnderLocks(runner, id, { ownerAccountId: sub, blockArrived: true }));
    if (result === 'missing') throw new NotFoundException(MESSAGES.notFound);
    if (result === 'completed') throw new ConflictException('Không thể hủy lịch hẹn đã hoàn thành!');
    if (result === 'cancelled') throw new ConflictException('Lịch hẹn này đã được hủy!');
    if (result !== 'ok') throw new ConflictException('Lịch hẹn này không thể hủy!');
    return { message: 'Hủy lịch hẹn thành công!' };
  }

  private async shift(id: string, current: string, details: ExistingDetail[], newFirst: string, strict: boolean, patch: Patch) {
    const first = details.map((d) => d.startsAt).sort()[0];
    const delta = (Date.parse(newFirst + 'Z') - Date.parse(first + 'Z')) / 60000;
    const guests = details.map((d) => {
      const startsAt = addMinutes(d.startsAt, delta);
      return { d, startsAt, endsAt: checkSlot(startsAt, d.duration, this.now()), preferred: d.bedId };
    });
    await this.reserveAuto(guests, strict, id, (beds) => {
      const slots = guests.map((x, i) => ({ bedId: beds[i], startsAt: x.startsAt, endsAt: x.endsAt }));
      return [slots, async (runner) => {
        await this.lockStatus(runner, id, current, patch.readPay);
        const before = await captureBookingBefore(runner, id);
        for (let i = 0; i < guests.length; i++) {
          await runner.query('UPDATE dbo.KhachSuDungDichVu SET MaGiuong=$2,ThoiDiemBatDau=$3::timestamp,ThoiDiemKetThuc=$4::timestamp WHERE MaChiTiet=$1', [guests[i].d.id, slots[i].bedId, slots[i].startsAt, slots[i].endsAt]);
        }
        await this.updateBooking(runner, id, patch, newFirst.slice(0, 10), newFirst);
        await syncBookingNotifications(runner, id, before);
      }];
    });
  }

  /** Picks free active beds (preferred first), then reserves under bed locks; retries when a concurrent writer wins. */
  private async reserveAuto<T>(guests: AutoGuest[], strict: boolean, excludeId: string | undefined, build: (beds: string[]) => [BedInterval[], (runner: QueryRunner) => Promise<T>]): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const beds = await this.assign(guests, strict, excludeId);
      const [slots, write] = build(beds);
      try { return await this.transactions.reserve(slots, write, excludeId); }
      catch (error) { if (!(error instanceof ConflictException) || attempt >= 2 || error.message !== MESSAGES.conflict) throw error; }
    }
  }

  private async assign(guests: AutoGuest[], strict: boolean, excludeId?: string) {
    const chosen: BedInterval[] = [];
    for (const guest of guests) {
      const busy = await this.database.query<{ bedId: string }[]>(`SELECT DISTINCT RTRIM(c.MaGiuong) AS "bedId" FROM dbo.KhachSuDungDichVu c JOIN dbo.LichHen l ON l.MaLichHen=c.MaLichHen
        WHERE c.MaGiuong IS NOT NULL AND c.ThoiDiemBatDau<$2::timestamp AND c.ThoiDiemKetThuc>$1::timestamp
        AND l.TrangThaiLichHen<>'Đã hủy' AND ($3::text IS NULL OR l.MaLichHen<>$3::text)`, [guest.startsAt, guest.endsAt, excludeId ?? null]);
      const taken = new Set([...busy.map((b) => b.bedId), ...chosen.filter((c) => c.startsAt < guest.endsAt && c.endsAt > guest.startsAt).map((c) => c.bedId)]);
      const keep = guest.preferred && ACTIVE_BED.test(guest.preferred) ? guest.preferred : null;
      const candidates = keep ? (strict ? [keep] : [keep, ...ACTIVE_BEDS]) : ACTIVE_BEDS;
      const bedId = candidates.find((b) => !taken.has(b));
      if (!bedId) throw new ConflictException(MESSAGES.conflict);
      chosen.push({ bedId, startsAt: guest.startsAt, endsAt: guest.endsAt });
    }
    return chosen.map((c) => c.bedId);
  }

  private async packages(ids: string[], activeOnly: boolean) {
    const unique = [...new Set(ids)];
    const rows = await this.database.query<{ id: string; duration: number }[]>(`SELECT RTRIM(g.MaGoi) AS id,g.ThoiLuong AS duration FROM dbo.GoiDichVu g
      JOIN dbo.DichVu d ON d.MaDichVu=g.MaDichVu WHERE ($1::int=0 OR d.TrangThai='Hoạt động') AND g.MaGoi IN (${unique.map((_, i) => '$' + (i + 2)).join(',')})`, [activeOnly ? 1 : 0, ...unique]);
    return new Map(rows.map((r) => [r.id, Number(r.duration)]));
  }

  private async details(id: string): Promise<ExistingDetail[]> {
    const rows = await this.database.query<{ id: string; bedId: string | null; packageId: string; startsAt: string; duration: number }[]>(`SELECT RTRIM(c.MaChiTiet) AS id,RTRIM(c.MaGiuong) AS "bedId",
      RTRIM(c.MaGoi) AS "packageId",to_char(c.ThoiDiemBatDau,'YYYY-MM-DD"T"HH24:MI:SS') AS "startsAt",g.ThoiLuong AS duration
      FROM dbo.KhachSuDungDichVu c JOIN dbo.GoiDichVu g ON g.MaGoi=c.MaGoi WHERE c.MaLichHen=$1 ORDER BY c.ThoiDiemBatDau,c.MaChiTiet`, [id]);
    return rows.map((r) => ({ ...r, duration: Number(r.duration) }));
  }

  private async load(id: string): Promise<BookingRow> {
    const rows = await this.database.query<BookingRow[]>(`SELECT RTRIM(MaLichHen) AS id,TrangThaiLichHen AS status,TrangThaiThanhToan AS pay,to_char(NgayHen,'YYYY-MM-DD') AS "date"
      FROM dbo.LichHen WHERE MaLichHen=$1`, [id]);
    if (!rows.length) throw new NotFoundException(MESSAGES.notFound);
    return rows[0];
  }

  private async loadOwn(id: string, sub: string): Promise<BookingRow> {
    const rows = await this.database.query<BookingRow[]>(`SELECT RTRIM(l.MaLichHen) AS id,l.TrangThaiLichHen AS status,l.TrangThaiThanhToan AS pay,to_char(l.NgayHen,'YYYY-MM-DD') AS "date"
      FROM dbo.LichHen l JOIN dbo.KhachHang k ON k.MaKhachHang=l.MaKhachHang WHERE l.MaLichHen=$1 AND k.MaTaiKhoan=$2`, [id, sub]);
    if (!rows.length) throw new NotFoundException(MESSAGES.notFound);
    return rows[0];
  }

  private async customerId(sub: string) {
    const rows = await this.database.query<{ id: string }[]>('SELECT RTRIM(MaKhachHang) AS id FROM dbo.KhachHang WHERE MaTaiKhoan=$1', [sub]);
    if (!rows.length) throw new ForbiddenException('Không tìm thấy hồ sơ khách hàng của tài khoản.');
    return rows[0].id;
  }

  private assertUnlocked(status: string) {
    if (LOCKED_STATUSES.includes(status)) throw new ConflictException(status === 'Hoàn thành' ? MESSAGES.completed : MESSAGES.cancelled);
  }

  private async lockStatus(runner: QueryRunner, id: string, expected: string, expectedPay?: string) {
    // Runs inside reserve() after the bed locks: LichHen is always the last lock taken (global lock order).
    const rows = returnedRows<{ status: string; pay: string }>(await runner.query('SELECT TrangThaiLichHen AS status,TrangThaiThanhToan AS pay FROM dbo.LichHen WHERE MaLichHen=$1 FOR UPDATE', [id]));
    if (rows[0]?.status !== expected || (expectedPay !== undefined && rows[0]?.pay !== expectedPay)) throw new ConflictException(stale);
  }

  private async updateBooking(runner: QueryRunner, id: string, patch: Patch, date: string, firstStart: string) {
    await runner.query(`UPDATE dbo.LichHen SET NgayHen=$2::date,GioHen=$3::timestamp::time(0),TrangThaiLichHen=$4::text,TrangThaiThanhToan=$5::text,
      GhiChu=CASE WHEN $6::int=1 THEN $7::text ELSE GhiChu END,HoTenNguoiDat=COALESCE($8::text,HoTenNguoiDat),SoDienThoaiNguoiDat=COALESCE($9::text,SoDienThoaiNguoiDat),
      EmailNguoiDat=CASE WHEN $10::int=1 THEN $11::text ELSE EmailNguoiDat END WHERE MaLichHen=$1`,
    [id, date, firstStart, patch.status, patch.pay, patch.notes === undefined ? 0 : 1, patch.notes ?? null, patch.name ?? null, patch.phone ?? null, patch.email === undefined ? 0 : 1, patch.email ?? null]);
  }

  private async newId(runner: QueryRunner, prefix: string, table: string, column: string) {
    for (let i = 0; i < 5; i++) {
      const id = prefix + String(randomInt(0, 100_000_000)).padStart(8, '0');
      if (!returnedRows(await runner.query(`SELECT 1 AS found FROM dbo.${table} WHERE ${column}=$1`, [id])).length) return id;
    }
    throw new ConflictException(MESSAGES.save);
  }

  private async insertDetail(runner: QueryRunner, bookingId: string, p: Planned) {
    const id = await this.newId(runner, 'CT', 'KhachSuDungDichVu', 'MaChiTiet');
    await runner.query(`INSERT INTO dbo.KhachSuDungDichVu(MaChiTiet,MaLichHen,MaGoi,MaGiuong,TenKhach,SoDienThoai,ThoiDiemBatDau,ThoiDiemKetThuc)
      VALUES($1,$2,$3,$4,$5,$6,$7::timestamp,$8::timestamp)`, [id, bookingId, p.packageId, p.bedId, p.customerName, p.customerPhone ?? null, p.startsAt, p.endsAt]);
  }

  private async insertBooking(runner: QueryRunner, planned: Planned[], b: { customerId: string | null; name: string; phone: string; email: string | null; notes: string | null; date: string; status: string; pay: string }) {
    const id = await this.newId(runner, 'LH', 'LichHen', 'MaLichHen');
    const first = planned.map((p) => p.startsAt).sort()[0];
    await runner.query(`INSERT INTO dbo.LichHen(MaLichHen,MaKhachHang,HoTenNguoiDat,SoDienThoaiNguoiDat,EmailNguoiDat,GhiChu,NgayHen,GioHen,TrangThaiLichHen,TrangThaiThanhToan)
      VALUES($1,$2,$3,$4,$5,$6,$7::date,$8::timestamp::time(0),$9,$10)`, [id, b.customerId, b.name, b.phone, b.email, b.notes, b.date, first, b.status, b.pay]);
    for (const p of planned) await this.insertDetail(runner, id, p);
    return id;
  }
}
