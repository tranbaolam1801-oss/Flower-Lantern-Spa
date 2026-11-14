import { notifyAccountStatus, notifyPermissionChanged } from '../inbox/inbox-notify';
import {
  BadRequestException, ConflictException, ForbiddenException, HttpException, Inject, Injectable,
  NotFoundException, ServiceUnavailableException,
} from '@nestjs/common';
import { DatabaseService } from '../database.service';
import { PasswordService } from '../auth/password.service';
import { JwtPayload } from '../auth/auth.dto';
import { isUniqueViolation } from '../common/db-errors';
import { returnedRows } from '../common/pg-result';
import {
  CONFIRM_MISMATCH_MESSAGE, CreateEmployeeDto, EmployeeListQuery, UpdateAccountStatusDto, UpdateEmployeeDto, UpdatePermissionsDto,
} from './employees.dto';

export type Actor = Pick<JwtPayload, 'sub' | 'role' | 'permissions'>;
type Run = (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

export interface EmployeeItem {
  id: string; accountId: string | null; username: string; fullName: string; phone: string; email: string | null;
  gender: string | null; birthDate: string | null; address: string | null; notes: string | null;
  role: string; workStatus: string; accountStatus: string; permissions: string[];
}
interface Target { id: string; accountId: string | null; role: string | null; status: string | null }

const OWNER = 'Chủ Spa';
const MANAGER = 'Quản lý';
const STAFF = 'Nhân viên';
const DISABLED = 'Vô hiệu hóa';
const PAGE_SIZE = 20;

const SELECT_EMPLOYEE = `SELECT rtrim(n.MaNhanVien) AS id, rtrim(n.MaTaiKhoan) AS "accountId", t.TenDangNhap AS username,
    n.HoTen AS "fullName", rtrim(n.SoDienThoai) AS phone, n.Email AS email, n.GioiTinh AS gender,
    to_char(n.NgaySinh, 'YYYY-MM-DD') AS "birthDate", n.DiaChi AS address, n.GhiChu AS notes,
    COALESCE(t.VaiTro, '${STAFF}') AS role, COALESCE(n.TrangThaiLamViec, '') AS "workStatus",
    COALESCE(t.TrangThai, '${DISABLED}') AS "accountStatus"
  FROM dbo.NhanVien n LEFT JOIN dbo.TaiKhoan t ON t.MaTaiKhoan = n.MaTaiKhoan`;

@Injectable()
export class EmployeesService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(PasswordService) private readonly passwords: PasswordService,
  ) {}

  async list(query: EmployeeListQuery) {
    // SQL Server's case-insensitive collation → lower() on both sides of every text search.
    const rows = await this.database.query<EmployeeItem[]>(`${SELECT_EMPLOYEE}
      WHERE ($1::text = '' OR strpos(lower(n.HoTen), lower($1)) > 0 OR strpos(lower(t.TenDangNhap), lower($1)) > 0
             OR strpos(n.SoDienThoai, $1) > 0 OR strpos(lower(COALESCE(n.Email, '')), lower($1)) > 0)
        AND ($2::text = '' OR COALESCE(t.TrangThai, '${DISABLED}') = $2)
      ORDER BY lower(n.HoTen), n.MaNhanVien
      OFFSET $3 ROWS FETCH NEXT ${PAGE_SIZE + 1} ROWS ONLY`, [query.q, query.status, (query.page - 1) * PAGE_SIZE]);
    const items = rows.slice(0, PAGE_SIZE);
    await this.attachPermissions(items);
    return { items: items.map(toItem), page: query.page, hasNext: rows.length > PAGE_SIZE };
  }

  async get(id: string) {
    const rows = await this.database.query<EmployeeItem[]>(`${SELECT_EMPLOYEE} WHERE n.MaNhanVien = $1`, [id]);
    if (!rows[0]) throw new NotFoundException('Không tìm thấy nhân viên.');
    await this.attachPermissions(rows);
    return toItem(rows[0]);
  }

  async create(_actor: Actor, dto: CreateEmployeeDto) {
    if (dto.password !== dto.confirmPassword) throw new BadRequestException(CONFIRM_MISMATCH_MESSAGE);
    const hash = await this.passwords.hash(dto.password);
    return this.tx(async (run) => {
      await this.assertUnique(run, { username: dto.username, phone: dto.phone, email: dto.email });
      const accountId = await this.nextId(run, 'TaiKhoan', 'MaTaiKhoan', 'TK');
      const employeeId = await this.nextId(run, 'NhanVien', 'MaNhanVien', 'NV');
      await run(`INSERT INTO dbo.TaiKhoan (MaTaiKhoan, TenDangNhap, SoDienThoai, MatKhauBam, VaiTro, TrangThai)
        VALUES ($1, $2, $3, $4, '${STAFF}', 'Hoạt động')`, [accountId, dto.username, dto.phone, hash]);
      await run(`INSERT INTO dbo.NhanVien (MaNhanVien, MaTaiKhoan, HoTen, SoDienThoai, Email, GioiTinh, NgaySinh, DiaChi, GhiChu, TrangThaiLamViec, TrangThaiHoSo)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Đang làm việc', 'Hoạt động')`,
        [employeeId, accountId, dto.fullName, dto.phone, dto.email, dto.gender ?? null, dto.birthDate ?? null, dto.address ?? null, dto.notes ?? null]);
      return { id: employeeId, message: 'Thêm nhân viên thành công!' };
    });
  }

  async update(actor: Actor, id: string, dto: UpdateEmployeeDto) {
    return this.tx(async (run) => {
      const target = await this.loadTarget(run, id);
      if (target.accountId !== actor.sub) this.assertManageable(actor, target);
      await this.assertUnique(run, { phone: dto.phone, email: dto.email }, target);
      const sets = ['HoTen = $2', 'SoDienThoai = $3', 'Email = $4'];
      const params: unknown[] = [id, dto.fullName, dto.phone, dto.email];
      for (const [col, val] of [['GioiTinh', dto.gender], ['NgaySinh', dto.birthDate], ['DiaChi', dto.address], ['GhiChu', dto.notes]] as const) {
        if (val !== undefined) { params.push(val); sets.push(`${col} = $${params.length}`); }
      }
      await run(`UPDATE dbo.NhanVien SET ${sets.join(', ')} WHERE MaNhanVien = $1`, params);
      if (target.accountId) await run('UPDATE dbo.TaiKhoan SET SoDienThoai = $2 WHERE MaTaiKhoan = $1', [target.accountId, dto.phone]);
      return { id, message: 'Cập nhật nhân viên thành công!' };
    });
  }

  async softDelete(actor: Actor, id: string) {
    return this.tx(async (run) => {
      const target = await this.loadTarget(run, id);
      this.assertProtected(actor, target);
      await run(`UPDATE dbo.NhanVien SET TrangThaiHoSo = '${DISABLED}', TrangThaiLamViec = 'Ngừng làm việc' WHERE MaNhanVien = $1`, [id]);
      if (target.accountId) {
        await run(`UPDATE dbo.TaiKhoan SET TrangThai = '${DISABLED}' WHERE MaTaiKhoan = $1`, [target.accountId]);
        await this.revokeSessions(run, target.accountId);
      }
      return { message: 'Vô hiệu hóa nhân viên thành công!' };
    });
  }

  async setAccountStatus(actor: Actor, id: string, dto: UpdateAccountStatusDto) {
    return this.tx(async (run) => {
      const target = await this.loadTarget(run, id);
      this.assertProtected(actor, target);
      if (!target.accountId) throw new ConflictException('Nhân viên chưa có tài khoản!');
      if (target.status === DISABLED) throw new ConflictException('Tài khoản đã bị vô hiệu hóa!');
      await run('UPDATE dbo.TaiKhoan SET TrangThai = $2 WHERE MaTaiKhoan = $1', [target.accountId, dto.status]);
      if (dto.status === 'Đã khóa') await this.revokeSessions(run, target.accountId);
      await notifyAccountStatus(run, { actorAccountId: actor.sub, targetAccountId: target.accountId, targetEmployeeId: id, locked: dto.status === 'Đã khóa' });
      return { message: dto.status === 'Đã khóa' ? 'Khóa tài khoản thành công!' : 'Mở khóa tài khoản thành công!' };
    });
  }

  async setPermissions(actor: Actor, id: string, dto: UpdatePermissionsDto) {
    return this.tx(async (run) => {
      const target = await this.loadTarget(run, id);
      this.assertProtected(actor, target);
      if (!target.accountId) throw new ConflictException('Nhân viên chưa có tài khoản!');
      if (actor.role !== OWNER) {
        if (dto.role !== STAFF) throw new ForbiddenException('Chỉ Chủ Spa mới được gán vai trò Quản lý!');
        const own = new Set(actor.permissions ?? []);
        if (dto.permissions.some((p) => !own.has(p))) throw new ForbiddenException('Không thể cấp quyền mà bạn không có!');
      }
      const before = (await run('SELECT rtrim(MaQuyen) AS code FROM dbo.TaiKhoanQuyen WHERE MaTaiKhoan = $1 ORDER BY MaQuyen', [target.accountId])).map((r) => String(r.code));
      const after = [...dto.permissions].sort();
      await run('DELETE FROM dbo.TaiKhoanQuyen WHERE MaTaiKhoan = $1', [target.accountId]);
      for (const code of after) await run('INSERT INTO dbo.TaiKhoanQuyen (MaTaiKhoan, MaQuyen) VALUES ($1, $2)', [target.accountId, code]);
      await run('UPDATE dbo.TaiKhoan SET VaiTro = $2 WHERE MaTaiKhoan = $1', [target.accountId, dto.role]);
      const historyId = await this.nextId(run, 'LichSuPhanQuyen', 'MaLichSu', 'LS');
      const note = `Vai trò: ${target.role} -> ${dto.role}; Quyền: [${before.join(',')}] -> [${after.join(',')}]`.slice(0, 500);
      await run(`INSERT INTO dbo.LichSuPhanQuyen (MaLichSu, MaTaiKhoanThucHien, MaTaiKhoanDuocPhanQuyen, ThoiDiem, NoiDungThayDoi)
        VALUES ($1, $2, $3, dbo.vn_now(), $4)`, [historyId, actor.sub, target.accountId, note]);
      await notifyPermissionChanged(run, { actorAccountId: actor.sub, targetAccountId: target.accountId, targetEmployeeId: id, historyId, summary: `Vai trò: ${target.role} → ${dto.role}; quyền: [${before.join(', ')}] → [${after.join(', ')}].` });
      return { message: 'Cập nhật phân quyền thành công!' };
    });
  }

  // Owner is untouchable, nobody changes their own state, a Quản lý only manages Nhân viên.
  private assertProtected(actor: Actor, target: Target) {
    if (target.role === OWNER) throw new ForbiddenException('Không thể thay đổi tài khoản Chủ Spa!');
    if (target.accountId && target.accountId === actor.sub) throw new ForbiddenException('Không thể tự thay đổi tài khoản của chính mình!');
    this.assertManageable(actor, target);
  }

  private assertManageable(actor: Actor, target: Target) {
    if (actor.role === OWNER) return;
    if (target.role === OWNER || target.role === MANAGER) throw new ForbiddenException('Bạn không có quyền thao tác trên tài khoản này!');
  }

  // FOR UPDATE cannot lock the nullable side of an outer join: lock the employee row, then its account row.
  private async loadTarget(run: Run, id: string): Promise<Target> {
    const rows = await run(`SELECT rtrim(n.MaNhanVien) AS id, rtrim(n.MaTaiKhoan) AS "accountId", t.VaiTro AS role, t.TrangThai AS status
      FROM dbo.NhanVien n LEFT JOIN dbo.TaiKhoan t ON t.MaTaiKhoan = n.MaTaiKhoan
      WHERE n.MaNhanVien = $1 FOR UPDATE OF n`, [id]);
    if (!rows[0]) throw new NotFoundException('Không tìm thấy nhân viên.');
    const target = rows[0] as unknown as Target;
    if (target.accountId) await run('SELECT 1 AS x FROM dbo.TaiKhoan WHERE MaTaiKhoan = $1 FOR UPDATE', [target.accountId]);
    return target;
  }

  // Replaces the HOLDLOCK range locks: transaction-scoped advisory locks (fixed order username → phone → email)
  // serialise concurrent writers of the same value; the unique indexes remain the final guard (→ 409).
  private async assertUnique(run: Run, v: { username?: string; phone: string; email: string }, self?: Target) {
    const accountId = self?.accountId ?? '';
    const employeeId = self?.id ?? '';
    if (v.username) {
      await run(`SELECT pg_advisory_xact_lock(hashtext('username:' || lower($1)))`, [v.username]);
      const r = await run('SELECT 1 AS x FROM dbo.TaiKhoan WHERE lower(TenDangNhap) = lower($1)', [v.username]);
      if (r.length) throw new ConflictException({ message: 'Tên đăng nhập đã tồn tại!', field: 'username' });
    }
    await run(`SELECT pg_advisory_xact_lock(hashtext('phone:' || $1))`, [v.phone]);
    const phone = await run(`SELECT 1 AS x FROM dbo.TaiKhoan WHERE SoDienThoai = $1::text AND MaTaiKhoan <> $2::text
      UNION ALL SELECT 1 FROM dbo.NhanVien WHERE SoDienThoai = $1::text AND MaNhanVien <> $3::text`, [v.phone, accountId, employeeId]);
    if (phone.length) throw new ConflictException({ message: 'Số điện thoại đã tồn tại!', field: 'phone', conflictWith: await this.ownerOf(run, 'SoDienThoai', v.phone, employeeId) });
    await run(`SELECT pg_advisory_xact_lock(hashtext('email:' || lower($1)))`, [v.email]);
    const email = await run('SELECT 1 AS x FROM dbo.NhanVien WHERE lower(Email) = lower($1) AND MaNhanVien <> $2::text', [v.email, employeeId]);
    if (email.length) throw new ConflictException({ message: 'Email đã tồn tại!', field: 'email', conflictWith: await this.ownerOf(run, 'Email', v.email, employeeId) });
  }

  /** Employee code that already uses a phone/email (shown as "đã được sử dụng bởi nhân viên NV…"). Best effort: never blocks the 409. */
  private async ownerOf(run: Run, column: 'SoDienThoai' | 'Email', value: string, selfId: string): Promise<string | undefined> {
    try {
      const rows = await run(`SELECT rtrim(MaNhanVien) AS id FROM dbo.NhanVien WHERE lower(${column}::text) = lower($1::text) AND MaNhanVien <> $2::text LIMIT 1`, [value, selfId]);
      return rows[0]?.id ? String(rows[0].id).trim() : undefined;
    } catch { return undefined; }
  }

  /** MAX+1 key generation, serialised by a transaction-scoped advisory lock on `dbo.<table>:id`. */
  private async nextId(run: Run, table: string, column: string, prefix: string) {
    await run('SELECT pg_advisory_xact_lock(hashtext($1))', [`dbo.${table}:id`]);
    const rows = await run(`SELECT COALESCE(MAX(substring(${column}, 3, 8)::int), 0) + 1 AS n FROM dbo.${table}
      WHERE ${column} ~ $1`, [`^${prefix}[0-9]{8}$`]);
    return `${prefix}${String(rows[0].n).padStart(8, '0')}`;
  }

  // Revocation is applied only when the SQL session store is enabled (unchanged behaviour).
  private async revokeSessions(run: Run, accountId: string) {
    if (process.env.AUTH_SESSION_STORE === 'sql') {
      await run('UPDATE dbo.PhienDangNhap SET ThuHoiLuc = dbo.utc_now() WHERE MaTaiKhoan = $1 AND ThuHoiLuc IS NULL', [accountId]);
    }
  }

  private async attachPermissions(items: EmployeeItem[]) {
    const ids = items.map((i) => i.accountId).filter((x): x is string => !!x);
    const byAccount = new Map<string, string[]>();
    if (ids.length) {
      const rows = await this.database.query<{ accountId: string; code: string }[]>(
        `SELECT rtrim(MaTaiKhoan) AS "accountId", rtrim(MaQuyen) AS code FROM dbo.TaiKhoanQuyen
         WHERE MaTaiKhoan IN (${ids.map((_, i) => `$${i + 1}`).join(',')}) ORDER BY MaQuyen`, ids);
      for (const r of rows) byAccount.set(r.accountId, [...(byAccount.get(r.accountId) ?? []), r.code]);
    }
    for (const i of items) i.permissions = (i.accountId && byAccount.get(i.accountId)) || [];
  }

  private async tx<T>(work: (run: Run) => Promise<T>): Promise<T> {
    try {
      return await this.database.transaction((runner) =>
        work(async (sql, params) => returnedRows<Record<string, unknown>>(await runner.query(sql, params))));
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (isUniqueViolation(error)) throw new ConflictException('Thông tin đã tồn tại trong hệ thống!');
      // Never expose driver errors over HTTP.
      throw new ServiceUnavailableException('Không thể kết nối dữ liệu. Vui lòng thử lại!');
    }
  }
}

function toItem(row: EmployeeItem): EmployeeItem {
  // Explicit allow-list so no extra column (e.g. a password hash) can ever leak.
  return {
    id: row.id, accountId: row.accountId ?? null, username: row.username ?? '', fullName: row.fullName, phone: row.phone,
    email: row.email ?? null, gender: row.gender ?? null, birthDate: row.birthDate ?? null, address: row.address ?? null,
    notes: row.notes ?? null, role: row.role, workStatus: row.workStatus, accountStatus: row.accountStatus,
    permissions: row.permissions ?? [],
  };
}
