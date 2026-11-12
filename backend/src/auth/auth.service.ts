import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { DatabaseService } from '../database.service';
import { PasswordService } from './password.service';
import { JwtTokenService } from './jwt-token.service';
import { AuthUser, LoginDto } from './auth.dto';
import { JwtPayload } from './auth.dto';
import { randomUUID } from 'node:crypto';
import { returnedRows } from '../common/pg-result';

interface LockoutRow {
  SoLanSai: number;
  ThoiDiemKhoaDen: Date | null;
  LanCuoiSai: Date | null;
  locked: boolean;
}

interface UserRow {
  id: string;
  username: string;
  phone: string;
  passwordHash: string;
  role: string;
  status: string;
}

interface PermissionRow {
  code: string;
  name: string;
}

interface ProfileRow {
  entityId: string;
  fullName: string;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(PasswordService) private readonly passwordService: PasswordService,
    @Inject(JwtTokenService) private readonly jwtService: JwtTokenService,
  ) {}

  async login(dto: LoginDto): Promise<{ user: AuthUser; token: string }> {
    const phone = dto.phone.trim();

    // 1. Kiểm tra trạng thái tạm khóa persistent (BR-UC1-02, Ngoại lệ 5a.3)
    // The comparison runs in SQL (dbo.vn_now() is the same clock that wrote ThoiDiemKhoaDen).
    const lockoutRows = await this.database.query<LockoutRow[]>(
      `SELECT SoLanSai AS "SoLanSai", ThoiDiemKhoaDen AS "ThoiDiemKhoaDen", LanCuoiSai AS "LanCuoiSai",
              COALESCE(ThoiDiemKhoaDen > dbo.vn_now(), false) AS "locked"
       FROM dbo.KhoaDangNhap WHERE SoDienThoai = $1`,
      [phone],
    );

    const lockout = lockoutRows[0];
    if (lockout && lockout.locked) {
      throw new HttpException(
        {
          message: 'Bạn đã nhập sai quá số lần cho phép. Vui lòng thử lại sau 15 phút.',
          code: 'ACCOUNT_TEMPORARILY_LOCKED',
          unlockAt: lockout.ThoiDiemKhoaDen,
        },
        HttpStatus.FORBIDDEN,
      );
    }

    // 2. Tìm tài khoản người dùng theo số điện thoại
    const users = await this.database.query<UserRow[]>(
      `SELECT RTRIM(MaTaiKhoan) AS "id", TenDangNhap AS "username", SoDienThoai AS "phone",
              MatKhauBam AS "passwordHash", VaiTro AS "role", TrangThai AS "status"
       FROM dbo.TaiKhoan WHERE SoDienThoai = $1`,
      [phone],
    );

    const user = users[0];

    // Nếu không tìm thấy tài khoản: ghi nhận nhập sai và báo lỗi chung để tránh user enumeration
    if (!user) {
      const isLocked = await this.recordFailedAttempt(phone);
      if (isLocked) {
        throw this.locked();
      }
      throw new UnauthorizedException('Số điện thoại hoặc mật khẩu không đúng');
    }

    // 3. Kiểm tra trạng thái tài khoản (NFR-05)
    if (user.status !== 'Hoạt động') {
      throw new ForbiddenException({ message: 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên.', code: 'ACCOUNT_INACTIVE' });
    }

    // 4. Kiểm tra mật khẩu băm Argon2
    const isPasswordValid = await this.passwordService.verify(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      const isLocked = await this.recordFailedAttempt(phone);
      if (isLocked) {
        throw this.locked();
      }
      throw new UnauthorizedException('Số điện thoại hoặc mật khẩu không đúng');
    }

    // 5. Đăng nhập thành công: Xóa số lần nhập sai trong dbo.KhoaDangNhap
    // FOR UPDATE on the lockout row serialises this reset against concurrent failed-attempt writers.
    const stillLocked = await this.database.transaction(async (r) => {
      const active = returnedRows<{ one: number }>(await r.query(
        `SELECT 1 AS one FROM dbo.KhoaDangNhap WHERE SoDienThoai = $1 AND ThoiDiemKhoaDen > dbo.vn_now() FOR UPDATE`,
        [phone],
      ));
      if (active.length > 0) return true;
      await r.query(
        `UPDATE dbo.KhoaDangNhap SET SoLanSai = 0, ThoiDiemKhoaDen = NULL, LanCuoiSai = NULL WHERE SoDienThoai = $1`,
        [phone],
      );
      return false;
    });
    if (stillLocked) throw this.locked();

    // 6. Truy vấn quyền (dbo.TaiKhoanQuyen + dbo.Quyen)
    const permissionRows = await this.database.query<PermissionRow[]>(
      `SELECT RTRIM(q.MaQuyen) AS "code", q.TenQuyen AS "name"
       FROM dbo.TaiKhoanQuyen tq
       JOIN dbo.Quyen q ON q.MaQuyen = tq.MaQuyen
       WHERE tq.MaTaiKhoan = $1`,
      [user.id],
    );
    const permissions = permissionRows.map((p) => p.code);

    // 7. Truy vấn tên hiển thị (từ NhanVien hoặc KhachHang)
    let fullName = user.username;
    let entityId: string | undefined;

    const nvRows = await this.database.query<ProfileRow[]>(
      `SELECT RTRIM(MaNhanVien) AS "entityId", HoTen AS "fullName" FROM dbo.NhanVien WHERE MaTaiKhoan = $1`,
      [user.id],
    );
    if (nvRows.length > 0) {
      fullName = nvRows[0].fullName;
      entityId = nvRows[0].entityId;
    } else {
      const khRows = await this.database.query<ProfileRow[]>(
        `SELECT RTRIM(MaKhachHang) AS "entityId", HoTen AS "fullName" FROM dbo.KhachHang WHERE MaTaiKhoan = $1`,
        [user.id],
      );
      if (khRows.length > 0) {
        fullName = khRows[0].fullName;
        entityId = khRows[0].entityId;
      }
    }

    const authUser: AuthUser = {
      id: user.id,
      username: user.username,
      phone: user.phone,
      role: user.role,
      fullName,
      permissions,
      entityId,
    };

    // 8. Ký JWT Access Token
    const payload = {
      sub: authUser.id,
      username: authUser.username,
      phone: authUser.phone,
      role: authUser.role,
      fullName: authUser.fullName,
      permissions: authUser.permissions,
      entityId: authUser.entityId,
    };

    const jti = this.sessionsEnabled() ? randomUUID() : undefined;
    const token = await this.jwtService.signAsync({ ...payload, ...(jti ? { jti } : {}) }, { expiresIn: '7d' });
    if (jti) {
      const created = await this.database.transaction(async (r) => {
        // Lock the account row so a concurrent deactivation cannot slip between the status check and the insert.
        const active = returnedRows<{ one: number }>(await r.query(
          `SELECT 1 AS one FROM dbo.TaiKhoan WHERE MaTaiKhoan = $1 AND TrangThai = 'Hoạt động' FOR UPDATE`,
          [authUser.id],
        ));
        if (active.length === 0) return false;
        await r.query(
          `INSERT INTO dbo.PhienDangNhap(MaPhien, MaTaiKhoan, HetHanLuc) VALUES ($1::uuid, $2, dbo.utc_now() + make_interval(days => 7))`,
          [jti, authUser.id],
        );
        return true;
      });
      if (!created) throw new UnauthorizedException('Tài khoản đã bị khóa.');
    }

    return { user: authUser, token };
  }

  async getMe(userId: string): Promise<AuthUser> {
    const users = await this.database.query<UserRow[]>(
      `SELECT RTRIM(MaTaiKhoan) AS "id", TenDangNhap AS "username", SoDienThoai AS "phone",
              VaiTro AS "role", TrangThai AS "status"
       FROM dbo.TaiKhoan WHERE MaTaiKhoan = $1`,
      [userId],
    );

    const user = users[0];
    if (!user || user.status !== 'Hoạt động') {
      if (this.sessionsEnabled()) await this.database.query('UPDATE dbo.PhienDangNhap SET ThuHoiLuc=dbo.utc_now() WHERE MaTaiKhoan=$1 AND ThuHoiLuc IS NULL', [userId]);
      throw new UnauthorizedException('Phiên đăng nhập đã hết hạn hoặc tài khoản đã bị khóa.');
    }

    const permissionRows = await this.database.query<PermissionRow[]>(
      `SELECT RTRIM(q.MaQuyen) AS "code", q.TenQuyen AS "name"
       FROM dbo.TaiKhoanQuyen tq
       JOIN dbo.Quyen q ON q.MaQuyen = tq.MaQuyen
       WHERE tq.MaTaiKhoan = $1`,
      [user.id],
    );

    let fullName = user.username;
    let entityId: string | undefined;

    const nvRows = await this.database.query<ProfileRow[]>(
      `SELECT RTRIM(MaNhanVien) AS "entityId", HoTen AS "fullName" FROM dbo.NhanVien WHERE MaTaiKhoan = $1`,
      [user.id],
    );
    if (nvRows.length > 0) {
      fullName = nvRows[0].fullName;
      entityId = nvRows[0].entityId;
    } else {
      const khRows = await this.database.query<ProfileRow[]>(
        `SELECT RTRIM(MaKhachHang) AS "entityId", HoTen AS "fullName" FROM dbo.KhachHang WHERE MaTaiKhoan = $1`,
        [user.id],
      );
      if (khRows.length > 0) {
        fullName = khRows[0].fullName;
        entityId = khRows[0].entityId;
      }
    }

    return {
      id: user.id,
      username: user.username,
      phone: user.phone,
      role: user.role,
      fullName,
      permissions: permissionRows.map((p) => p.code),
      entityId,
    };
  }

  sessionsEnabled() { return process.env.AUTH_SESSION_STORE === 'sql'; }

  async validateSession(payload: JwtPayload) {
    if (!this.sessionsEnabled()) return;
    if (!payload.jti || !isSessionId(payload.jti)) throw new UnauthorizedException('Vui lòng đăng nhập lại.');
    const rows = await this.database.query<{ valid: number }[]>(`SELECT 1 AS valid FROM dbo.PhienDangNhap
      WHERE MaPhien=$1::uuid AND MaTaiKhoan=$2 AND ThuHoiLuc IS NULL AND HetHanLuc>dbo.utc_now()`, [payload.jti, payload.sub]);
    if (rows.length !== 1) throw new UnauthorizedException('Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
  }

  async revokeToken(token?: string) {
    if (!this.sessionsEnabled() || !token) return;
    let payload: JwtPayload;
    try { payload = await this.jwtService.verifyAsync<JwtPayload>(token); } catch { return; }
    if (!payload.jti || !isSessionId(payload.jti)) return;
    await this.database.query('UPDATE dbo.PhienDangNhap SET ThuHoiLuc=COALESCE(ThuHoiLuc,dbo.utc_now()) WHERE MaPhien=$1::uuid AND MaTaiKhoan=$2', [payload.jti, payload.sub]);
  }

  private locked() {
    return new ForbiddenException({ message: 'Bạn đã nhập sai quá số lần cho phép. Vui lòng thử lại sau 15 phút.', code: 'ACCOUNT_TEMPORARILY_LOCKED' });
  }

  /**
   * Counts a failed attempt. The per-phone transaction-scoped advisory lock replaces the former
   * UPDLOCK/HOLDLOCK range lock: concurrent failures for the same phone are serialised (also while the row
   * does not exist yet), so no increment is lost. The primary key stays as the final guard.
   */
  private async recordFailedAttempt(phone: string): Promise<boolean> {
    const count = await this.database.transaction(async (r) => {
      await r.query(`SELECT pg_advisory_xact_lock(hashtext('dbo.KhoaDangNhap:' || $1::text))`, [phone]);
      const existing = returnedRows<{ one: number }>(await r.query(`SELECT 1 AS one FROM dbo.KhoaDangNhap WHERE SoDienThoai = $1`, [phone]));
      if (existing.length === 0) {
        await r.query(
          `INSERT INTO dbo.KhoaDangNhap (SoDienThoai, SoLanSai, LanCuoiSai, ThoiDiemKhoaDen) VALUES ($1, 1, dbo.vn_now(), NULL)`,
          [phone],
        );
        return 1;
      }
      const updated = returnedRows<{ NewCount: number }>(await r.query(
        `UPDATE dbo.KhoaDangNhap
         SET SoLanSai = CASE WHEN ThoiDiemKhoaDen > dbo.vn_now() THEN SoLanSai WHEN ThoiDiemKhoaDen IS NOT NULL AND ThoiDiemKhoaDen <= dbo.vn_now() THEN 1 ELSE SoLanSai + 1 END,
             LanCuoiSai = dbo.vn_now(),
             ThoiDiemKhoaDen = CASE
                 WHEN ThoiDiemKhoaDen > dbo.vn_now() THEN ThoiDiemKhoaDen
                 WHEN (CASE WHEN ThoiDiemKhoaDen IS NOT NULL AND ThoiDiemKhoaDen <= dbo.vn_now() THEN 1 ELSE SoLanSai + 1 END) >= 5
                 THEN dbo.vn_now() + make_interval(mins => 15)
                 ELSE NULL
             END
         WHERE SoDienThoai = $1
         RETURNING SoLanSai AS "NewCount"`,
        [phone],
      ));
      return updated[0]?.NewCount ?? 1;
    });
    return count >= 5;
  }
}

function isSessionId(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value); }
