import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { returnedRows } from '../common/pg-result';
import { DatabaseService } from '../database.service';

export interface InboxItem {
  id: string; type: string; title: string; body: string; objectType: string | null; objectId: string | null; createdAt: string; read: boolean;
}

const PAGE_MAX = 50;

/** Reads/updates the notifications of ONE account. The account id always comes from the authenticated session, never from the request. */
@Injectable()
export class InboxService {
  private known = false;

  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  /** Migration 005 may not be applied yet: every call then answers "no notifications" instead of failing. */
  private async available() {
    if (this.known) return true;
    const rows = returnedRows<{ ok: boolean }>(await this.database.query("SELECT to_regclass('dbo.ThongBaoNoiBo') IS NOT NULL AS ok"));
    this.known = rows[0]?.ok === true;
    return this.known;
  }

  async unread(accountId: string) {
    if (!(await this.available())) return 0;
    const rows = returnedRows<{ n: number }>(await this.database.query(
      'SELECT count(*)::int AS n FROM dbo.ThongBaoNoiBo WHERE MaTaiKhoanNhan = $1 AND DaDocLuc IS NULL', [accountId]));
    return rows[0]?.n ?? 0;
  }

  async list(accountId: string, page: number, limit: number) {
    const size = Math.min(Math.max(limit, 1), PAGE_MAX);
    if (!(await this.available())) return { available: false, items: [] as InboxItem[], unread: 0, page, hasNext: false };
    const rows = returnedRows<InboxItem>(await this.database.query(
      `SELECT MaThongBao::text AS id, Loai AS type, TieuDe AS title, NoiDung AS body, LoaiDoiTuong AS "objectType", rtrim(MaDoiTuong) AS "objectId",
              to_char(TaoLuc, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "createdAt", (DaDocLuc IS NOT NULL) AS read
         FROM dbo.ThongBaoNoiBo WHERE MaTaiKhoanNhan = $1 ORDER BY TaoLuc DESC, MaThongBao DESC LIMIT $2::int OFFSET $3::int`,
      [accountId, size + 1, (page - 1) * size]));
    return { available: true, items: rows.slice(0, size), unread: await this.unread(accountId), page, hasNext: rows.length > size };
  }

  /** 404 for an id that does not exist OR belongs to someone else (indistinguishable on purpose). Re-reading is harmless (idempotent). */
  async markRead(accountId: string, id: string) {
    if (!(await this.available())) throw new NotFoundException('Không tìm thấy thông báo.');
    const rows = returnedRows<{ id: string }>(await this.database.query(
      `UPDATE dbo.ThongBaoNoiBo SET DaDocLuc = COALESCE(DaDocLuc, dbo.utc_now()) WHERE MaThongBao = $1::uuid AND MaTaiKhoanNhan = $2 RETURNING MaThongBao::text AS id`, [id, accountId]));
    if (!rows.length) throw new NotFoundException('Không tìm thấy thông báo.');
    return { unread: await this.unread(accountId) };
  }

  async markAllRead(accountId: string) {
    if (!(await this.available())) return { updated: 0, unread: 0 };
    const rows = returnedRows<{ id: string }>(await this.database.query(
      `UPDATE dbo.ThongBaoNoiBo SET DaDocLuc = dbo.utc_now() WHERE MaTaiKhoanNhan = $1 AND DaDocLuc IS NULL RETURNING MaThongBao::text AS id`, [accountId]));
    return { updated: rows.length, unread: await this.unread(accountId) };
  }
}
