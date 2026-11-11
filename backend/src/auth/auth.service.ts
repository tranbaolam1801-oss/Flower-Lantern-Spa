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

interface LockoutRow {
  SoLanSai: number;
  ThoiDiemKhoaDen: Date | null;
  LanCuoiSai: Date | null;
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
    const now = new Date();

    // 1. Kiểm tra trạng thái tạm khóa persistent (BR-UC1-02, Ngoại lệ 5a.3)
    const lockoutRows = await this.database.query<LockoutRow[]>(
      `SELECT SoLanSai, ThoiDiemKhoaDen, LanCuoiSai FROM dbo.KhoaDangNhap WHERE SoDienThoai = @0`,
      [phone],
    );

    const lockout = lockoutRows[0];
    if (lockout && lockout.ThoiDiemKhoaDen && new Date(lockout.ThoiDiemKhoaDen) > now) {
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
      `SELECT RTRIM(MaTaiKhoan) AS id, TenDangNhap AS username, SoDienThoai AS phone,
              MatKhauBam AS passwordHash, VaiTro AS role, TrangThai AS status
       FROM dbo.TaiKhoan WHERE SoDienThoai = @0`,
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
    const reset = await this.database.query<{ Locked: number }[]>(
      `SET XACT_ABORT ON;
       BEGIN TRY
         BEGIN TRANSACTION;
         IF EXISTS (SELECT 1 FROM dbo.KhoaDangNhap WITH (UPDLOCK,HOLDLOCK) WHERE SoDienThoai=@0 AND ThoiDiemKhoaDen > GETDATE())
           SELECT 1 AS Locked;
         ELSE BEGIN
           UPDATE dbo.KhoaDangNhap SET SoLanSai=0, ThoiDiemKhoaDen=NULL, LanCuoiSai=NULL WHERE SoDienThoai=@0;
           SELECT 0 AS Locked;
         END;
         COMMIT;
       END TRY
       BEGIN CATCH
         IF @@TRANCOUNT > 0 ROLLBACK;
         THROW;
       END CATCH`,
      [phone],
    );
    if (reset[0]?.Locked) throw this.locked();

    // 6. Truy vấn quyền (dbo.TaiKhoanQuyen + dbo.Quyen)
    const permissionRows = await this.database.query<PermissionRow[]>(
      `SELECT RTRIM(q.MaQuyen) AS code, q.TenQuyen AS name
       FROM dbo.TaiKhoanQuyen tq
       JOIN dbo.Quyen q ON q.MaQuyen = tq.MaQuyen
       WHERE tq.MaTaiKhoan = @0`,
      [user.id],
    );
    const permissions = permissionRows.map((p) => p.code);

    // 7. Truy vấn tên hiển thị (từ NhanVien hoặc KhachHang)
    let fullName = user.username;
    let entityId: string | undefined;

    const nvRows = await this.database.query<ProfileRow[]>(
      `SELECT RTRIM(MaNhanVien) AS entityId, HoTen AS fullName FROM dbo.NhanVien WHERE MaTaiKhoan = @0`,
      [user.id],
    );
    if (nvRows.length > 0) {
      fullName = nvRows[0].fullName;
      entityId = nvRows[0].entityId;
    } else {
      const khRows = await this.database.query<ProfileRow[]>(
        `SELECT RTRIM(MaKhachHang) AS entityId, HoTen AS fullName FROM dbo.KhachHang WHERE MaTaiKhoan = @0`,
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
    const token = await this.jwtService.signAsync({...payload,...(jti?{jti}:{})}, { expiresIn: '7d' });
    if(jti) {
      const rows=await this.database.query<{created:number}[]>(`SET XACT_ABORT ON;
        BEGIN TRY BEGIN TRANSACTION;
        IF EXISTS(SELECT 1 FROM dbo.TaiKhoan WITH(UPDLOCK,HOLDLOCK) WHERE MaTaiKhoan=@1 AND TrangThai=N'Hoạt động')
        BEGIN
          INSERT dbo.PhienDangNhap(MaPhien,MaTaiKhoan,HetHanLuc) VALUES(@0,@1,DATEADD(day,7,SYSUTCDATETIME()));
          SELECT 1 AS created;
        END ELSE SELECT 0 AS created;
        COMMIT; END TRY BEGIN CATCH IF @@TRANCOUNT>0 ROLLBACK; THROW; END CATCH`,[jti,authUser.id]);
      if(rows[0]?.created!==1)throw new UnauthorizedException('Tài khoản đã bị khóa.');
    }

    return { user: authUser, token };
  }

  async getMe(userId: string): Promise<AuthUser> {
    const users = await this.database.query<UserRow[]>(
      `SELECT RTRIM(MaTaiKhoan) AS id, TenDangNhap AS username, SoDienThoai AS phone,
              VaiTro AS role, TrangThai AS status
       FROM dbo.TaiKhoan WHERE MaTaiKhoan = @0`,
      [userId],
    );

    const user = users[0];
    if (!user || user.status !== 'Hoạt động') {
      if(this.sessionsEnabled())await this.database.query('UPDATE dbo.PhienDangNhap SET ThuHoiLuc=SYSUTCDATETIME() WHERE MaTaiKhoan=@0 AND ThuHoiLuc IS NULL',[userId]);
      throw new UnauthorizedException('Phiên đăng nhập đã hết hạn hoặc tài khoản đã bị khóa.');
    }

    const permissionRows = await this.database.query<PermissionRow[]>(
      `SELECT RTRIM(q.MaQuyen) AS code, q.TenQuyen AS name
       FROM dbo.TaiKhoanQuyen tq
       JOIN dbo.Quyen q ON q.MaQuyen = tq.MaQuyen
       WHERE tq.MaTaiKhoan = @0`,
      [user.id],
    );

    let fullName = user.username;
    let entityId: string | undefined;

    const nvRows = await this.database.query<ProfileRow[]>(
      `SELECT RTRIM(MaNhanVien) AS entityId, HoTen AS fullName FROM dbo.NhanVien WHERE MaTaiKhoan = @0`,
      [user.id],
    );
    if (nvRows.length > 0) {
      fullName = nvRows[0].fullName;
      entityId = nvRows[0].entityId;
    } else {
      const khRows = await this.database.query<ProfileRow[]>(
        `SELECT RTRIM(MaKhachHang) AS entityId, HoTen AS fullName FROM dbo.KhachHang WHERE MaTaiKhoan = @0`,
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

  async validateSession(payload:JwtPayload) {
    if(!this.sessionsEnabled())return;
    if(!payload.jti||!isSessionId(payload.jti))throw new UnauthorizedException('Vui lòng đăng nhập lại.');
    const rows=await this.database.query<{valid:number}[]>(`SELECT 1 AS valid FROM dbo.PhienDangNhap
      WHERE MaPhien=@0 AND MaTaiKhoan=@1 AND ThuHoiLuc IS NULL AND HetHanLuc>SYSUTCDATETIME()`,[payload.jti,payload.sub]);
    if(rows.length!==1)throw new UnauthorizedException('Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
  }

  async revokeToken(token?:string) {
    if(!this.sessionsEnabled()||!token)return;
    let payload:JwtPayload;
    try { payload=await this.jwtService.verifyAsync<JwtPayload>(token); } catch { return; }
    if(!payload.jti||!isSessionId(payload.jti))return;
    await this.database.query('UPDATE dbo.PhienDangNhap SET ThuHoiLuc=COALESCE(ThuHoiLuc,SYSUTCDATETIME()) WHERE MaPhien=@0 AND MaTaiKhoan=@1',[payload.jti,payload.sub]);
  }

  private locked() {
    return new ForbiddenException({ message: 'Bạn đã nhập sai quá số lần cho phép. Vui lòng thử lại sau 15 phút.', code: 'ACCOUNT_TEMPORARILY_LOCKED' });
  }

  private async recordFailedAttempt(phone: string): Promise<boolean> {
    const result = await this.database.query<{ NewCount: number }[]>(
      `SET XACT_ABORT ON;
       BEGIN TRY
       BEGIN TRANSACTION;
       IF NOT EXISTS (SELECT 1 FROM dbo.KhoaDangNhap WITH (UPDLOCK,HOLDLOCK) WHERE SoDienThoai = @0)
       BEGIN
           INSERT INTO dbo.KhoaDangNhap (SoDienThoai, SoLanSai, LanCuoiSai, ThoiDiemKhoaDen)
           VALUES (@0, 1, GETDATE(), NULL);
           SELECT 1 AS NewCount;
       END
       ELSE
       BEGIN
           UPDATE dbo.KhoaDangNhap
           SET SoLanSai = CASE WHEN ThoiDiemKhoaDen > GETDATE() THEN SoLanSai WHEN ThoiDiemKhoaDen IS NOT NULL AND ThoiDiemKhoaDen <= GETDATE() THEN 1 ELSE SoLanSai + 1 END,
               LanCuoiSai = GETDATE(),
               ThoiDiemKhoaDen = CASE 
                   WHEN ThoiDiemKhoaDen > GETDATE() THEN ThoiDiemKhoaDen
                   WHEN (CASE WHEN ThoiDiemKhoaDen IS NOT NULL AND ThoiDiemKhoaDen <= GETDATE() THEN 1 ELSE SoLanSai + 1 END) >= 5 
                   THEN DATEADD(minute, 15, GETDATE()) 
                   ELSE NULL 
               END
           WHERE SoDienThoai = @0;
           SELECT SoLanSai AS NewCount FROM dbo.KhoaDangNhap WHERE SoDienThoai = @0;
       END;
       COMMIT;
       END TRY
       BEGIN CATCH
         IF @@TRANCOUNT > 0 ROLLBACK;
         THROW;
       END CATCH`,
      [phone],
    );

    const count = result[0]?.NewCount ?? 1;
    return count >= 5;
  }
}

function isSessionId(value:string) {return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);}
