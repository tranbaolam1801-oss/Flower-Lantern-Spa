import { randomInt } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { QueryRunner } from 'typeorm';
import { DatabaseService } from '../database.service';
import { BedInterval, BookingTransactionService } from './booking-transaction.service';
import { ACTIVE_BEDS, ACTIVE_BED, CUSTOMER_EDITABLE_STATUSES, LOCKED_STATUSES, MESSAGES, addMinutes, canTransition, checkSlot, vietnamNow } from './booking-rules';
import { CreateAdminBookingDto, CreateCustomerBookingDto, SearchBookingsQuery, UpdateAdminBookingDto } from './booking-write.dto';

interface Planned extends BedInterval { packageId: string; customerName: string; customerPhone?: string }
interface ExistingDetail { id: string; bedId: string | null; packageId: string; startsAt: string; duration: number }
interface BookingRow { id: string; status: string; pay: string; date: string }
interface Patch { status: string; pay: string; notes?: string; readPay?: string }
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
    const like = query.q?.trim() ? `%${query.q.trim().replace(/[~%_[]/g, (c) => '~' + c)}%` : null;
    const items = await this.database.query(`SELECT TOP(200) RTRIM(c.MaChiTiet) AS id,RTRIM(l.MaLichHen) AS bookingId,
      RTRIM(c.MaGiuong) AS bedId,c.TenKhach AS customerName,COALESCE(c.SoDienThoai,l.SoDienThoaiNguoiDat) AS customerPhone,
      d.TenDichVu AS serviceName,g.TenGoi AS packageName,RTRIM(g.MaGoi) AS packageId,
      l.TrangThaiLichHen AS status,l.TrangThaiThanhToan AS paymentStatus,
      CONVERT(varchar(19),c.ThoiDiemBatDau,126) AS startsAt,CONVERT(varchar(19),c.ThoiDiemKetThuc,126) AS endsAt,
      DATEDIFF(minute,CAST(CAST(c.ThoiDiemBatDau AS date) AS datetime),c.ThoiDiemBatDau) AS startMinute,
      DATEDIFF(minute,CAST(CAST(c.ThoiDiemBatDau AS date) AS datetime),c.ThoiDiemKetThuc) AS endMinute
      FROM dbo.KhachSuDungDichVu c JOIN dbo.LichHen l ON l.MaLichHen=c.MaLichHen
      JOIN dbo.GoiDichVu g ON g.MaGoi=c.MaGoi JOIN dbo.DichVu d ON d.MaDichVu=g.MaDichVu
      WHERE (@0 IS NULL OR (c.ThoiDiemBatDau<DATEADD(day,1,CONVERT(datetime,@0,23)) AND c.ThoiDiemKetThuc>CONVERT(datetime,@0,23)))
      AND (@1 IS NULL OR l.TrangThaiLichHen=@1)
      AND (@2 IS NULL OR l.MaLichHen LIKE @2 ESCAPE '~' OR l.HoTenNguoiDat COLLATE Vietnamese_100_CI_AS LIKE @2 ESCAPE '~'
        OR c.TenKhach COLLATE Vietnamese_100_CI_AS LIKE @2 ESCAPE '~' OR l.SoDienThoaiNguoiDat LIKE @2 ESCAPE '~' OR c.SoDienThoai LIKE @2 ESCAPE '~')
      ORDER BY c.ThoiDiemBatDau,c.MaChiTiet`, [query.date ?? null, query.status ?? null, like]);
    return { items };
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
      const customer = await runner.query('SELECT TOP(1) RTRIM(MaKhachHang) AS id FROM dbo.KhachHang WHERE SoDienThoai=@0', [dto.bookerPhone]);
      return this.insertBooking(runner, planned, {
        customerId: customer[0]?.id ?? null, name: dto.bookerName.trim(), phone: dto.bookerPhone, email: dto.bookerEmail ?? null,
        notes: dto.notes ?? null, date: dto.date, status: dto.status ?? 'Chưa đến', pay: dto.paymentStatus ?? 'Chưa thanh toán',
      });
    });
    return { id, message: 'Tạo lịch hẹn thành công!' };
  }

  async updateAdmin(id: string, dto: UpdateAdminBookingDto) {
    const booking = await this.load(id);
    this.assertUnlocked(booking.status);
    const status = dto.status ?? booking.status;
    if (!canTransition(booking.status, status)) throw new ConflictException(MESSAGES.transition);
    if (dto.paymentStatus !== undefined && dto.paymentStatus !== booking.pay) {
      const recorded = await this.database.query<unknown[]>('SELECT TOP(1) 1 AS found FROM dbo.ThanhToan WHERE MaLichHen=@0', [id]);
      if (recorded.length) throw new ConflictException(PAYMENT_MANAGED);
    }
    const patch: Patch = { status, pay: dto.paymentStatus ?? booking.pay, notes: dto.notes, readPay: booking.pay };
    if (!dto.date && !dto.guests) {
      const rows = await this.database.query<unknown[]>(`UPDATE dbo.LichHen SET TrangThaiLichHen=@2,TrangThaiThanhToan=@3,GhiChu=CASE WHEN @4=1 THEN @5 ELSE GhiChu END
        OUTPUT inserted.MaLichHen WHERE MaLichHen=@0 AND TrangThaiLichHen=@1 AND TrangThaiThanhToan=@6`, [id, booking.status, patch.status, patch.pay, patch.notes === undefined ? 0 : 1, patch.notes ?? null, booking.pay]);
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
        await runner.query('DELETE dbo.KhachSuDungDichVu WHERE MaLichHen=@0', [id]);
        for (const p of planned) await this.insertDetail(runner, id, p);
        await this.updateBooking(runner, id, patch, date, planned.map((p) => p.startsAt).sort()[0]);
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
    const rows = await this.database.query<{ result: string }[]>(`SET XACT_ABORT ON;
      BEGIN TRY
        BEGIN TRANSACTION;
        DECLARE @status nvarchar(30);
        SELECT @status=l.TrangThaiLichHen FROM dbo.LichHen l WITH(UPDLOCK,HOLDLOCK) JOIN dbo.KhachHang k ON k.MaKhachHang=l.MaKhachHang
          WHERE l.MaLichHen=@0 AND k.MaTaiKhoan=@1;
        IF @status IS NULL SELECT 'missing' AS result;
        ELSE IF @status=N'Hoàn thành' SELECT 'completed' AS result;
        ELSE IF @status=N'Đã hủy' SELECT 'cancelled' AS result;
        ELSE IF @status=N'Đã đến' SELECT 'arrived' AS result;
        ELSE BEGIN
          UPDATE dbo.LichHen SET TrangThaiLichHen=N'Đã hủy' WHERE MaLichHen=@0;
          SELECT 'ok' AS result;
        END;
        COMMIT;
      END TRY BEGIN CATCH
        IF @@TRANCOUNT>0 ROLLBACK;
        THROW;
      END CATCH`, [id, sub]);
    const result = rows[0]?.result;
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
        for (let i = 0; i < guests.length; i++) {
          await runner.query('UPDATE dbo.KhachSuDungDichVu SET MaGiuong=@1,ThoiDiemBatDau=CONVERT(datetime,@2,126),ThoiDiemKetThuc=CONVERT(datetime,@3,126) WHERE MaChiTiet=@0', [guests[i].d.id, slots[i].bedId, slots[i].startsAt, slots[i].endsAt]);
        }
        await this.updateBooking(runner, id, patch, newFirst.slice(0, 10), newFirst);
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
      const busy = await this.database.query<{ bedId: string }[]>(`SELECT DISTINCT RTRIM(c.MaGiuong) AS bedId FROM dbo.KhachSuDungDichVu c JOIN dbo.LichHen l ON l.MaLichHen=c.MaLichHen
        WHERE c.MaGiuong IS NOT NULL AND c.ThoiDiemBatDau<CONVERT(datetime,@1,126) AND c.ThoiDiemKetThuc>CONVERT(datetime,@0,126)
        AND l.TrangThaiLichHen<>N'Đã hủy' AND (@2 IS NULL OR l.MaLichHen<>@2)`, [guest.startsAt, guest.endsAt, excludeId ?? null]);
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
      JOIN dbo.DichVu d ON d.MaDichVu=g.MaDichVu WHERE (@0=0 OR d.TrangThai=N'Hoạt động') AND g.MaGoi IN (${unique.map((_, i) => '@' + (i + 1)).join(',')})`, [activeOnly ? 1 : 0, ...unique]);
    return new Map(rows.map((r) => [r.id, Number(r.duration)]));
  }

  private async details(id: string): Promise<ExistingDetail[]> {
    const rows = await this.database.query<{ id: string; bedId: string | null; packageId: string; startsAt: string; duration: number }[]>(`SELECT RTRIM(c.MaChiTiet) AS id,RTRIM(c.MaGiuong) AS bedId,
      RTRIM(c.MaGoi) AS packageId,CONVERT(varchar(19),c.ThoiDiemBatDau,126) AS startsAt,g.ThoiLuong AS duration
      FROM dbo.KhachSuDungDichVu c JOIN dbo.GoiDichVu g ON g.MaGoi=c.MaGoi WHERE c.MaLichHen=@0 ORDER BY c.ThoiDiemBatDau,c.MaChiTiet`, [id]);
    return rows.map((r) => ({ ...r, duration: Number(r.duration) }));
  }

  private async load(id: string): Promise<BookingRow> {
    const rows = await this.database.query<BookingRow[]>(`SELECT RTRIM(MaLichHen) AS id,TrangThaiLichHen AS status,TrangThaiThanhToan AS pay,CONVERT(varchar(10),NgayHen,23) AS date
      FROM dbo.LichHen WHERE MaLichHen=@0`, [id]);
    if (!rows.length) throw new NotFoundException(MESSAGES.notFound);
    return rows[0];
  }

  private async loadOwn(id: string, sub: string): Promise<BookingRow> {
    const rows = await this.database.query<BookingRow[]>(`SELECT RTRIM(l.MaLichHen) AS id,l.TrangThaiLichHen AS status,l.TrangThaiThanhToan AS pay,CONVERT(varchar(10),l.NgayHen,23) AS date
      FROM dbo.LichHen l JOIN dbo.KhachHang k ON k.MaKhachHang=l.MaKhachHang WHERE l.MaLichHen=@0 AND k.MaTaiKhoan=@1`, [id, sub]);
    if (!rows.length) throw new NotFoundException(MESSAGES.notFound);
    return rows[0];
  }

  private async customerId(sub: string) {
    const rows = await this.database.query<{ id: string }[]>('SELECT RTRIM(MaKhachHang) AS id FROM dbo.KhachHang WHERE MaTaiKhoan=@0', [sub]);
    if (!rows.length) throw new ForbiddenException('Không tìm thấy hồ sơ khách hàng của tài khoản.');
    return rows[0].id;
  }

  private assertUnlocked(status: string) {
    if (LOCKED_STATUSES.includes(status)) throw new ConflictException(status === 'Hoàn thành' ? MESSAGES.completed : MESSAGES.cancelled);
  }

  private async lockStatus(runner: QueryRunner, id: string, expected: string, expectedPay?: string) {
    const rows = await runner.query('SELECT TrangThaiLichHen AS status,TrangThaiThanhToan AS pay FROM dbo.LichHen WITH(UPDLOCK,HOLDLOCK) WHERE MaLichHen=@0', [id]);
    if (rows[0]?.status !== expected || (expectedPay !== undefined && rows[0]?.pay !== expectedPay)) throw new ConflictException(stale);
  }

  private async updateBooking(runner: QueryRunner, id: string, patch: Patch, date: string, firstStart: string) {
    await runner.query(`UPDATE dbo.LichHen SET NgayHen=CONVERT(date,@1,23),GioHen=CONVERT(time(0),SUBSTRING(@2,12,8),108),TrangThaiLichHen=@3,TrangThaiThanhToan=@4,
      GhiChu=CASE WHEN @5=1 THEN @6 ELSE GhiChu END WHERE MaLichHen=@0`, [id, date, firstStart, patch.status, patch.pay, patch.notes === undefined ? 0 : 1, patch.notes ?? null]);
  }

  private async newId(runner: QueryRunner, prefix: string, table: string, column: string) {
    for (let i = 0; i < 5; i++) {
      const id = prefix + String(randomInt(0, 100_000_000)).padStart(8, '0');
      if (!(await runner.query(`SELECT 1 AS found FROM dbo.${table} WHERE ${column}=@0`, [id])).length) return id;
    }
    throw new ConflictException(MESSAGES.save);
  }

  private async insertDetail(runner: QueryRunner, bookingId: string, p: Planned) {
    const id = await this.newId(runner, 'CT', 'KhachSuDungDichVu', 'MaChiTiet');
    await runner.query(`INSERT dbo.KhachSuDungDichVu(MaChiTiet,MaLichHen,MaGoi,MaGiuong,TenKhach,SoDienThoai,ThoiDiemBatDau,ThoiDiemKetThuc)
      VALUES(@0,@1,@2,@3,@4,@5,CONVERT(datetime,@6,126),CONVERT(datetime,@7,126))`, [id, bookingId, p.packageId, p.bedId, p.customerName, p.customerPhone ?? null, p.startsAt, p.endsAt]);
  }

  private async insertBooking(runner: QueryRunner, planned: Planned[], b: { customerId: string | null; name: string; phone: string; email: string | null; notes: string | null; date: string; status: string; pay: string }) {
    const id = await this.newId(runner, 'LH', 'LichHen', 'MaLichHen');
    const first = planned.map((p) => p.startsAt).sort()[0];
    await runner.query(`INSERT dbo.LichHen(MaLichHen,MaKhachHang,HoTenNguoiDat,SoDienThoaiNguoiDat,EmailNguoiDat,GhiChu,NgayHen,GioHen,TrangThaiLichHen,TrangThaiThanhToan)
      VALUES(@0,@1,@2,@3,@4,@5,CONVERT(date,@6,23),CONVERT(time(0),SUBSTRING(@7,12,8),108),@8,@9)`, [id, b.customerId, b.name, b.phone, b.email, b.notes, b.date, first, b.status, b.pay]);
    for (const p of planned) await this.insertDetail(runner, id, p);
    return id;
  }
}
