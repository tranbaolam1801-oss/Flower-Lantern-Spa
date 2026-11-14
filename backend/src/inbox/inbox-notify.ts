import { returnedRows } from '../common/pg-result';

/**
 * In-app notifications for management users (the bell). Every helper takes the SQL runner of the BUSINESS transaction, so a notification
 * exists if and only if the business change committed. Creation is wrapped in a SAVEPOINT: a failure here (missing table, constraint,
 * anything) rolls back only the savepoint and is swallowed — it can never abort or roll back a booking, review or permission change.
 * Until migration 005 is applied every helper is a silent no-op. Recipients are resolved on the server from roles/permissions
 * (never from the client) and (recipient, dedupe key) is unique, so retries never create duplicates.
 */
export type InboxQuery = (sql: string, params?: unknown[]) => Promise<unknown>;

export type InboxType =
  | 'BOOKING_CREATED_ONLINE' | 'BOOKING_RESCHEDULED_BY_CUSTOMER' | 'BOOKING_CANCELLED_BY_CUSTOMER'
  | 'REVIEW_CREATED' | 'PERMISSION_CHANGED' | 'ACCOUNT_LOCKED' | 'ACCOUNT_UNLOCKED';

interface InboxEvent {
  type: InboxType; title: string; body: string;
  objectType: 'booking' | 'review' | 'employee'; objectId: string; dedupe: string;
  /** Permission whose holders (Quản lý / Nhân viên) receive it; null = Chủ Spa only. Falls back to Chủ Spa when nobody holds it. */
  permission: 'Q01' | 'Q03' | null;
  excludeAccountId?: string | null;
}

let tableKnown = false;

async function tablePresent(query: InboxQuery) {
  if (tableKnown) return true;
  const rows = returnedRows<{ ok: boolean }>(await query("SELECT to_regclass('dbo.ThongBaoNoiBo') IS NOT NULL AS ok"));
  tableKnown = rows[0]?.ok === true;
  return tableKnown;
}

/** Test hook: lets a spec that creates the table after startup see it. */
export function resetInboxTableCache() { tableKnown = false; }

const clip = (value: string, max: number) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);

async function insertEvent(query: InboxQuery, e: InboxEvent) {
  await query(
    `WITH holders AS (
       SELECT DISTINCT t.MaTaiKhoan AS id FROM dbo.TaiKhoan t JOIN dbo.TaiKhoanQuyen q ON q.MaTaiKhoan = t.MaTaiKhoan
        WHERE $7::text IS NOT NULL AND rtrim(q.MaQuyen) = $7::text AND t.VaiTro IN ('Quản lý', 'Nhân viên') AND t.TrangThai = 'Hoạt động'),
     owners AS (SELECT t.MaTaiKhoan AS id FROM dbo.TaiKhoan t WHERE t.VaiTro = 'Chủ Spa' AND t.TrangThai = 'Hoạt động'),
     pick AS (SELECT id FROM holders UNION SELECT id FROM owners WHERE NOT EXISTS (SELECT 1 FROM holders))
     INSERT INTO dbo.ThongBaoNoiBo (MaTaiKhoanNhan, Loai, TieuDe, NoiDung, LoaiDoiTuong, MaDoiTuong, KhoaChongTrung)
     SELECT id, $1, $2, $3, $4, $5, $6 FROM pick WHERE $8::text IS NULL OR rtrim(id) <> $8::text
     ON CONFLICT (MaTaiKhoanNhan, KhoaChongTrung) DO NOTHING`,
    [e.type, clip(e.title, 150), clip(e.body, 500), e.objectType, e.objectId, clip(e.dedupe, 160), e.permission, e.excludeAccountId ?? null]);
}

async function safely(query: InboxQuery, build: () => Promise<InboxEvent | null>) {
  try {
    if (!(await tablePresent(query))) return;
    await query('SAVEPOINT inbox_notify');
    try {
      const event = await build();
      if (event) await insertEvent(query, event);
      await query('RELEASE SAVEPOINT inbox_notify');
    } catch {
      await query('ROLLBACK TO SAVEPOINT inbox_notify');
    }
  } catch {
    // never let a notification problem reach the business operation
  }
}

async function bookingInfo(query: InboxQuery, id: string) {
  const rows = returnedRows<{ name: string; at: string | null; key: string | null }>(await query(
    `SELECT l.HoTenNguoiDat AS name, to_char(min(c.ThoiDiemBatDau), 'HH24:MI DD/MM/YYYY') AS at, to_char(min(c.ThoiDiemBatDau), 'YYYYMMDDHH24MI') AS key
       FROM dbo.LichHen l LEFT JOIN dbo.KhachSuDungDichVu c ON c.MaLichHen = l.MaLichHen WHERE l.MaLichHen = $1 GROUP BY l.HoTenNguoiDat`, [id]));
  return rows[0];
}

/** Online customer booking created / rescheduled / cancelled. Call inside the booking transaction after the write succeeded. */
export function notifyBookingByCustomer(query: InboxQuery, kind: 'created' | 'rescheduled' | 'cancelled', bookingId: string) {
  return safely(query, async () => {
    const b = await bookingInfo(query, bookingId);
    if (!b) return null;
    const code = bookingId.trim();
    if (kind === 'created') return { type: 'BOOKING_CREATED_ONLINE', title: 'Lịch hẹn mới từ website', body: `${b.name} vừa đặt lịch ${code}${b.at ? ` lúc ${b.at}` : ''}.`, objectType: 'booking', objectId: code, dedupe: `BOOKING_CREATED_ONLINE:${code}`, permission: 'Q01' };
    if (kind === 'rescheduled') return { type: 'BOOKING_RESCHEDULED_BY_CUSTOMER', title: 'Khách hàng đổi lịch hẹn', body: `${b.name} đã đổi lịch ${code}${b.at ? ` sang ${b.at}` : ''}.`, objectType: 'booking', objectId: code, dedupe: `BOOKING_RESCHEDULED_BY_CUSTOMER:${code}:${b.key ?? ''}`, permission: 'Q01' };
    return { type: 'BOOKING_CANCELLED_BY_CUSTOMER', title: 'Khách hàng hủy lịch hẹn', body: `${b.name} đã hủy lịch ${code}.`, objectType: 'booking', objectId: code, dedupe: `BOOKING_CANCELLED_BY_CUSTOMER:${code}`, permission: 'Q01' };
  });
}

export function notifyReviewCreated(query: InboxQuery, reviewId: string) {
  return safely(query, async () => {
    const rows = returnedRows<{ name: string; stars: number; booking: string }>(await query(
      `SELECT k.HoTen AS name, d.SoSao AS stars, rtrim(d.MaLichHen) AS booking FROM dbo.DanhGia d JOIN dbo.KhachHang k ON k.MaKhachHang = d.MaKhachHang WHERE d.MaDanhGia = $1`, [reviewId]));
    if (!rows[0]) return null;
    const code = reviewId.trim();
    return { type: 'REVIEW_CREATED', title: 'Đánh giá mới', body: `${rows[0].name} đã đánh giá ${rows[0].stars} sao cho lịch ${rows[0].booking}.`, objectType: 'review', objectId: code, dedupe: `REVIEW_CREATED:${code}`, permission: 'Q03' };
  });
}

async function accountName(query: InboxQuery, accountId: string) {
  const rows = returnedRows<{ name: string }>(await query(
    `SELECT COALESCE((SELECT HoTen FROM dbo.NhanVien WHERE MaTaiKhoan = t.MaTaiKhoan LIMIT 1), t.TenDangNhap) AS name FROM dbo.TaiKhoan t WHERE t.MaTaiKhoan = $1`, [accountId]));
  return rows[0]?.name ?? 'Tài khoản';
}

/** Permission/role change of an employee -> Chủ Spa (except the actor). Only the audit summary is included: no token, password or session data. */
export function notifyPermissionChanged(query: InboxQuery, a: { actorAccountId: string; targetAccountId: string; targetEmployeeId: string; historyId: string; summary: string }) {
  return safely(query, async () => {
    const [actor, target] = [await accountName(query, a.actorAccountId), await accountName(query, a.targetAccountId)];
    return { type: 'PERMISSION_CHANGED', title: 'Thay đổi phân quyền nhân viên', body: `${actor} đã thay đổi phân quyền của ${target}. ${a.summary}`, objectType: 'employee', objectId: a.targetEmployeeId.trim(), dedupe: `PERMISSION_CHANGED:${a.historyId.trim()}`, permission: null, excludeAccountId: a.actorAccountId.trim() };
  });
}

export function notifyAccountStatus(query: InboxQuery, a: { actorAccountId: string; targetAccountId: string; targetEmployeeId: string; locked: boolean }) {
  return safely(query, async () => {
    const [actor, target] = [await accountName(query, a.actorAccountId), await accountName(query, a.targetAccountId)];
    const type = a.locked ? 'ACCOUNT_LOCKED' : 'ACCOUNT_UNLOCKED';
    return { type, title: a.locked ? 'Tài khoản nhân viên bị khóa' : 'Tài khoản nhân viên được mở khóa', body: `${actor} đã ${a.locked ? 'khóa' : 'mở khóa'} tài khoản của ${target}.`, objectType: 'employee', objectId: a.targetEmployeeId.trim(), dedupe: `${type}:${a.targetEmployeeId.trim()}:${Math.floor(Date.now() / 1000)}`, permission: null, excludeAccountId: a.actorAccountId.trim() };
  });
}
