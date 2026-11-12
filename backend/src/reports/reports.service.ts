import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service';

export const INVALID_RANGE = 'Khoảng thời gian không hợp lệ. Vui lòng chọn lại!';
export const MAX_RANGE_DAYS = 1830;
export type GroupBy = 'day' | 'week' | 'month' | 'year';

const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');

function parseDate(value: string): number | undefined {
  if (!/^\d{4}-\d\d-\d\d$/.test(value)) return undefined;
  const t = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === value ? t : undefined;
}

/** Validates ISO dates, from<=to and the maximum range; throws the Vietnamese copy the UI shows. */
export function validateRange(from: string, to: string): void {
  const a = parseDate(from);
  const b = parseDate(to);
  if (a === undefined || b === undefined || a > b || (b - a) / DAY_MS > MAX_RANGE_DAYS) throw new BadRequestException(INVALID_RANGE);
}

/** Bucket sort key and display label for a yyyy-mm-dd day. Weeks start on Monday. */
export function bucketOf(day: string, groupBy: GroupBy): { key: string; label: string } {
  const [y, m, d] = day.split('-');
  if (groupBy === 'day') return { key: day, label: `${d}/${m}/${y}` };
  if (groupBy === 'month') return { key: `${y}-${m}`, label: `${m}/${y}` };
  if (groupBy === 'year') return { key: y, label: y };
  const t = Date.parse(`${day}T00:00:00Z`);
  const monday = new Date(t - ((new Date(t).getUTCDay() + 6) % 7) * DAY_MS);
  const key = monday.toISOString().slice(0, 10);
  return { key, label: `Tuần ${pad(monday.getUTCDate())}/${pad(monday.getUTCMonth() + 1)}/${monday.getUTCFullYear()}` };
}

export function aggregateRevenue(days: { day: string; amount: number }[], groupBy: GroupBy) {
  const buckets = new Map<string, { label: string; amount: number }>();
  let totalRevenue = 0;
  for (const r of days) {
    const amount = Number(r.amount);
    if (!(amount > 0)) continue;
    const { key, label } = bucketOf(r.day, groupBy);
    const cur = buckets.get(key) ?? { label, amount: 0 };
    cur.amount += amount;
    buckets.set(key, cur);
    totalRevenue += amount;
  }
  return { totalRevenue, series: [...buckets.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, v]) => v) };
}

const TOP_LIMIT = 10;

@Injectable()
export class ReportsService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  /** Usage = service lines of bookings with status 'Hoàn thành' whose NgayHen is in the range. */
  async services(from: string, to: string) {
    validateRange(from, to);
    const rows = await this.database.query<{ serviceId: string; serviceName: string; usageCount: number }[]>(`
      SELECT RTRIM(d.MaDichVu) AS serviceId, d.TenDichVu AS serviceName, COUNT(*) AS usageCount
      FROM dbo.KhachSuDungDichVu c
      JOIN dbo.LichHen l ON l.MaLichHen=c.MaLichHen
      JOIN dbo.GoiDichVu g ON g.MaGoi=c.MaGoi
      JOIN dbo.DichVu d ON d.MaDichVu=g.MaDichVu
      WHERE l.TrangThaiLichHen=N'Hoàn thành' AND l.NgayHen BETWEEN @0 AND @1
      GROUP BY d.MaDichVu, d.TenDichVu
      ORDER BY COUNT(*) DESC, d.TenDichVu`, [from, to]);
    const items = rows.map((r) => ({ ...r, usageCount: Number(r.usageCount) }));
    return { totalUsage: items.reduce((s, r) => s + r.usageCount, 0), items: items.slice(0, TOP_LIMIT) };
  }

  /** New = customers created in range; returning = customers created before the range with a non-cancelled booking in it. */
  async customers(from: string, to: string) {
    validateRange(from, to);
    const counts = await this.database.query<{ newCustomers: number; returningCustomers: number }[]>(`
      SELECT (SELECT COUNT(*) FROM dbo.KhachHang WHERE CAST(NgayTao AS date) BETWEEN @0 AND @1) AS newCustomers,
        (SELECT COUNT(DISTINCT k.MaKhachHang) FROM dbo.KhachHang k JOIN dbo.LichHen l ON l.MaKhachHang=k.MaKhachHang
          WHERE CAST(k.NgayTao AS date)<@0 AND l.NgayHen BETWEEN @0 AND @1 AND l.TrangThaiLichHen<>N'Đã hủy') AS returningCustomers`, [from, to]);
    const top = await this.database.query<{ customerId: string; fullName: string; phone: string; bookingCount: number }[]>(`
      SELECT TOP(${TOP_LIMIT}) RTRIM(k.MaKhachHang) AS customerId, k.HoTen AS fullName, RTRIM(k.SoDienThoai) AS phone, COUNT(*) AS bookingCount
      FROM dbo.KhachHang k JOIN dbo.LichHen l ON l.MaKhachHang=k.MaKhachHang
      WHERE l.NgayHen BETWEEN @0 AND @1 AND l.TrangThaiLichHen<>N'Đã hủy'
      GROUP BY k.MaKhachHang, k.HoTen, k.SoDienThoai
      ORDER BY COUNT(*) DESC, k.HoTen COLLATE Vietnamese_100_CI_AS, k.MaKhachHang`, [from, to]);
    return {
      newCustomers: Number(counts[0]?.newCustomers ?? 0),
      returningCustomers: Number(counts[0]?.returningCustomers ?? 0),
      topCustomers: top.map((t) => ({ ...t, bookingCount: Number(t.bookingCount) })),
    };
  }

  /** Revenue = sum over ThanhToan 'Thành công' recorded in range of (SoTienThanhToan - KhoanHoanTien), net of refunds. */
  async revenue(from: string, to: string, groupBy: GroupBy) {
    validateRange(from, to);
    const excludeMock = await this.hasProviderColumn() ? " AND ISNULL(NhaCungCap,'')<>'MOCK'" : '';
    const rows = await this.database.query<{ day: string; amount: number }[]>(`
      SELECT CONVERT(char(10), CAST(NgayGhiNhan AS date), 23) AS day,
        SUM(CAST(SoTienThanhToan AS decimal(19,2)) - CAST(ISNULL(KhoanHoanTien,0) AS decimal(19,2))) AS amount
      FROM dbo.ThanhToan
      WHERE TrangThaiGiaoDich=N'Thành công' AND CAST(NgayGhiNhan AS date) BETWEEN @0 AND @1${excludeMock}
      GROUP BY CAST(NgayGhiNhan AS date)`, [from, to]);
    return aggregateRevenue(rows, groupBy);
  }

  /** Migration 007 adds NhaCungCap; simulated (MOCK) payments are excluded from revenue only once it exists. Absent column is rechecked periodically. */
  private providerColumn: { present: boolean; checkedAt: number } | undefined;
  private async hasProviderColumn() {
    const cached = this.providerColumn;
    if (cached && (cached.present || Date.now() - cached.checkedAt < 60_000)) return cached.present;
    const rows = await this.database.query<{ len: number | null }[]>(`SELECT COL_LENGTH('dbo.ThanhToan','NhaCungCap') AS len`);
    const present = rows[0]?.len != null;
    this.providerColumn = { present, checkedAt: Date.now() };
    return present;
  }
}
