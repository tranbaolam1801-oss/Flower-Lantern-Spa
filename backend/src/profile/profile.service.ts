import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { returnedRows } from '../common/pg-result';
import { DatabaseService } from '../database.service';
import { JwtPayload } from '../auth/auth.dto';
import { CONTENT_TYPE_BY_EXTENSION, IMAGE_MIME_TYPES, ImageExtension, ImageStorage, MAX_IMAGE_BYTES, detectImageExtension } from '../uploads/image-storage';
import { UpdateProfileDto } from './profile.dto';

export const AVATAR_STORAGE = 'AVATAR_STORAGE';
export const AVATAR_ERROR = 'Ảnh đại diện không hợp lệ! Chỉ hỗ trợ JPG, PNG, WebP tối đa 2MB.';
const AVATAR_URL_PREFIX = '/api/uploads/avatars/';

type Row = Record<string, unknown>;
export interface ProfileView {
  id: string; role: string; status: string; phone: string; entityId: string | null;
  fullName: string; email: string | null; gender: string | null; birthDate: string | null; address: string | null;
  avatarUrl: string | null;
  /** What this account may edit right now (e.g. customer email / avatar need migration 006). */
  editable: { fullName: boolean; email: boolean; gender: boolean; birthDate: boolean; address: boolean; avatar: boolean };
}

@Injectable()
export class ProfileService {
  private caps?: { avatar: boolean; customerEmail: boolean };

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AVATAR_STORAGE) private readonly storage: ImageStorage,
  ) {}

  /** Migration 006 may not be applied yet; a fully positive answer is cached, otherwise it is re-checked (cheap). */
  private async capabilities() {
    if (this.caps?.avatar && this.caps.customerEmail) return this.caps;
    const rows = returnedRows<{ t: string }>(await this.database.query(
      `SELECT lower(table_name) AS t FROM information_schema.columns WHERE table_schema='dbo'
         AND ((lower(table_name)='taikhoan' AND lower(column_name)='anhdaidien') OR (lower(table_name)='khachhang' AND lower(column_name)='email'))`));
    this.caps = { avatar: rows.some((r) => r.t === 'taikhoan'), customerEmail: rows.some((r) => r.t === 'khachhang') };
    return this.caps;
  }

  private isCustomer(user: JwtPayload) { return user.role === 'Khách hàng'; }

  async get(user: JwtPayload): Promise<ProfileView> {
    const caps = await this.capabilities();
    const customer = this.isCustomer(user);
    const account = returnedRows<Row>(await this.database.query(
      `SELECT rtrim(MaTaiKhoan) AS id, rtrim(SoDienThoai) AS phone, VaiTro AS role, TrangThai AS status${caps.avatar ? ', AnhDaiDien AS avatar' : ''}
         FROM dbo.TaiKhoan WHERE MaTaiKhoan = $1`, [user.sub]))[0];
    if (!account) throw new NotFoundException('Không tìm thấy tài khoản.');
    const entity = returnedRows<Row>(await this.database.query(customer
      ? `SELECT rtrim(MaKhachHang) AS id, HoTen AS "fullName", ${caps.customerEmail ? 'Email' : 'NULL::text'} AS email, GioiTinh AS gender,
           to_char(NgaySinh,'YYYY-MM-DD') AS "birthDate", DiaChi AS address FROM dbo.KhachHang WHERE MaTaiKhoan = $1`
      : `SELECT rtrim(MaNhanVien) AS id, HoTen AS "fullName", Email AS email, GioiTinh AS gender,
           to_char(NgaySinh,'YYYY-MM-DD') AS "birthDate", DiaChi AS address FROM dbo.NhanVien WHERE MaTaiKhoan = $1`, [user.sub]))[0];
    const avatar = typeof account.avatar === 'string' && account.avatar ? account.avatar : null;
    const hasEntity = Boolean(entity);
    return {
      id: String(account.id), role: String(account.role), status: String(account.status), phone: String(account.phone),
      entityId: entity ? String(entity.id) : null,
      fullName: entity ? String(entity.fullName) : user.fullName,
      email: (entity?.email as string | null) ?? null, gender: (entity?.gender as string | null) ?? null,
      birthDate: (entity?.birthDate as string | null) ?? null, address: (entity?.address as string | null) ?? null,
      avatarUrl: avatar ? `${AVATAR_URL_PREFIX}${avatar}` : null,
      editable: {
        fullName: hasEntity, gender: hasEntity, birthDate: hasEntity, address: hasEntity,
        email: hasEntity && (!customer || caps.customerEmail), avatar: caps.avatar,
      },
    };
  }

  async update(user: JwtPayload, dto: UpdateProfileDto): Promise<ProfileView> {
    const current = await this.get(user);
    if (!current.entityId) throw new ConflictException('Tài khoản chưa có hồ sơ cá nhân để cập nhật.');
    const customer = this.isCustomer(user);
    const sets: string[] = [];
    const params: unknown[] = [current.entityId];
    const add = (column: string, value: unknown) => { params.push(value); sets.push(`${column} = $${params.length}`); };
    if (dto.fullName !== undefined) add('HoTen', dto.fullName);
    if (dto.gender !== undefined) add('GioiTinh', dto.gender);
    if (dto.address !== undefined) add('DiaChi', dto.address);
    if (dto.birthDate !== undefined) {
      if (dto.birthDate !== null) {
        const real = new Date(`${dto.birthDate}T00:00:00Z`);
        const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
        if (Number.isNaN(real.getTime()) || !real.toISOString().startsWith(dto.birthDate) || dto.birthDate >= today) throw new BadRequestException('Ngày sinh không hợp lệ!');
      }
      add('NgaySinh', dto.birthDate);
    }
    if (dto.email !== undefined) {
      if (!current.editable.email) throw new ConflictException('Chưa hỗ trợ cập nhật email cho tài khoản này.');
      add('Email', dto.email);
    }
    if (!sets.length) return current;
    const table = customer ? 'KhachHang' : 'NhanVien';
    const key = customer ? 'MaKhachHang' : 'MaNhanVien';
    const customerEmail = (await this.capabilities()).customerEmail;
    await this.database.transaction(async (runner) => {
      if (dto.email) {
        // Serialise concurrent claims of the same address, then reject one already used by ANOTHER person.
        await runner.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`email:${dto.email.toLowerCase()}`]);
        const staff = returnedRows<Row>(await runner.query(
          `SELECT 1 AS x FROM dbo.NhanVien WHERE lower(Email) = lower($1) AND ($3::boolean OR MaNhanVien <> $2::text) LIMIT 1`, [dto.email, current.entityId, customer]));
        const guests = customerEmail
          ? returnedRows<Row>(await runner.query(
            `SELECT 1 AS x FROM dbo.KhachHang WHERE lower(Email) = lower($1) AND (NOT $3::boolean OR MaKhachHang <> $2::text) LIMIT 1`, [dto.email, current.entityId, customer]))
          : [];
        if (staff.length || guests.length) throw new ConflictException({ message: 'Email đã tồn tại!', field: 'email' });
      }
      await runner.query(`UPDATE dbo.${table} SET ${sets.join(', ')} WHERE ${key} = $1`, params);
    });
    return this.get(user);
  }

  async setAvatar(user: JwtPayload, declared: string, body: unknown): Promise<{ avatarUrl: string }> {
    if (!(IMAGE_MIME_TYPES as readonly string[]).includes(declared)) throw new BadRequestException(AVATAR_ERROR);
    if (!Buffer.isBuffer(body) || body.length === 0 || body.length > MAX_IMAGE_BYTES) throw new BadRequestException(AVATAR_ERROR);
    const extension: ImageExtension | null = detectImageExtension(body);
    if (!extension || CONTENT_TYPE_BY_EXTENSION[extension] !== declared) throw new BadRequestException(AVATAR_ERROR);
    if (!(await this.capabilities()).avatar) throw new ServiceUnavailableException('Chưa hỗ trợ đổi ảnh đại diện. Vui lòng thử lại sau!');
    let fileName: string;
    try { fileName = await this.storage.save(body, extension); }
    catch { throw new ServiceUnavailableException('Chưa thể lưu ảnh đại diện. Vui lòng thử lại sau!'); }
    // The previous avatar is replaced only after the new object is stored, so a failed upload keeps the old one.
    let previous: string | null = null;
    try {
      const rows = returnedRows<{ previous: string | null }>(await this.database.query(
        `WITH old AS (SELECT AnhDaiDien FROM dbo.TaiKhoan WHERE MaTaiKhoan = $2)
         UPDATE dbo.TaiKhoan SET AnhDaiDien = $1 WHERE MaTaiKhoan = $2 RETURNING (SELECT AnhDaiDien FROM old) AS previous`, [fileName, user.sub]));
      if (!rows.length) throw new Error('NO_ROW');
      previous = rows[0].previous;
    } catch {
      // The new object is not referenced by anything: remove it so storage does not fill with orphans, keep the old avatar.
      await this.storage.remove?.(fileName);
      throw new ServiceUnavailableException('Chưa thể lưu ảnh đại diện. Vui lòng thử lại sau!');
    }
    if (previous && previous !== fileName) await this.storage.remove?.(previous);
    return { avatarUrl: `${AVATAR_URL_PREFIX}${fileName}` };
  }

  readAvatar(file: string) { return this.storage.read(file); }
}
