import { BadRequestException, ConflictException, HttpException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { QueryRunner } from 'typeorm';
import { DatabaseService } from '../database.service';
import { isUniqueViolation } from '../common/db-errors';
import { AdminServiceListQuery, AdminServiceWriteDto, INACTIVE, isSafeImage } from './admin-services.dto';

export const PAGE_SIZE = 10;
export const MSG = {
  notFound: 'Không tìm thấy dịch vụ!',
  duplicate: 'Tên dịch vụ đã tồn tại!',
  category: 'Danh mục không hợp lệ!',
  image: 'Hình ảnh không hợp lệ!',
  futureBookings: 'Không thể ngừng hoạt động dịch vụ đang có lịch hẹn sắp tới!',
  idExists: 'Mã dịch vụ đã tồn tại!',
  package: 'Gói dịch vụ không thuộc dịch vụ này!',
  lastPackage: 'Dịch vụ phải còn ít nhất một gói dịch vụ!',
  removeConflict: 'Gói dịch vụ không thể vừa cập nhật vừa xóa!',
  save: 'Có lỗi khi lưu dữ liệu, vui lòng thử lại sau!',
};
const PENDING_STATUSES = ['Chờ xác nhận', 'Đã xác nhận', 'Chưa đến'];

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

@Injectable()
export class AdminServicesService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async list(q: AdminServiceListQuery) {
    // SQL Server compared names with Vietnamese_100_CI_AS (case-insensitive): lower() on both sides here,
    // the same semantics as the unique index UX_DichVu_TenDichVu ON lower(TenDichVu).
    const rows = await this.database.query<Row[]>(`
      SELECT rtrim(d.MaDichVu) AS id, d.TenDichVu AS name, rtrim(d.MaDanhMuc) AS "categoryId", m.TenDanhMuc AS "categoryName",
        d.MoTaNgan AS description, d.MoTaChiTiet AS details, d.HinhAnh AS image, d.TrangThai AS status
      FROM dbo.DichVu d JOIN dbo.DanhMuc m ON m.MaDanhMuc=d.MaDanhMuc
      WHERE ($1::text='' OR strpos(lower(d.TenDichVu), lower($1))>0)
        AND ($2::text='' OR d.MaDanhMuc=$2) AND ($3::text='' OR d.TrangThai=$3)
      ORDER BY lower(d.TenDichVu), d.MaDichVu
      OFFSET $4 ROWS FETCH NEXT ${PAGE_SIZE + 1} ROWS ONLY`,
      [q.q ?? '', q.category ?? '', q.status ?? '', (q.page - 1) * PAGE_SIZE]);
    const items = rows.slice(0, PAGE_SIZE);
    const ids = items.map((r) => r.id as string);
    const packages = ids.length ? await this.database.query<Row[]>(`
      SELECT rtrim(MaGoi) AS id, rtrim(MaDichVu) AS "serviceId", TenGoi AS name, ThoiLuong AS "durationMinutes", Gia::bigint AS price
      FROM dbo.GoiDichVu WHERE MaDichVu IN (${ids.map((_, i) => `$${i + 1}`).join(',')}) ORDER BY ThoiLuong, MaGoi`, ids) : [];
    const categories = await this.database.query<Row[]>(
      'SELECT rtrim(MaDanhMuc) AS id, TenDanhMuc AS name FROM dbo.DanhMuc ORDER BY lower(TenDanhMuc), MaDanhMuc');
    return {
      items: items.map((r) => ({
        ...r,
        packages: packages.filter((p) => p.serviceId === r.id)
          .map((p) => ({ id: p.id, name: p.name, durationMinutes: Number(p.durationMinutes), price: Number(p.price) })),
      })),
      categories, page: q.page, hasNext: rows.length > PAGE_SIZE,
    };
  }

  async create(dto: AdminServiceWriteDto) {
    this.checkInput(dto);
    return await this.tx(async (r) => {
      await this.checkCategory(r, dto.categoryId);
      await this.checkDuplicateName(r, dto.name);
      let id = dto.id;
      if (id) {
        // Same key as nextId(): serialises explicit ids with generated ids (the PK stays the final guard).
        await r.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['dbo.DichVu:id']);
        if ((await r.query('SELECT 1 AS x FROM dbo.DichVu WHERE MaDichVu=$1', [id])).length) throw new ConflictException(MSG.idExists);
      } else id = await this.nextId(r, 'dbo.DichVu', 'MaDichVu', 'DV');
      await r.query(`INSERT INTO dbo.DichVu(MaDichVu,MaDanhMuc,TenDichVu,HinhAnh,MoTaNgan,MoTaChiTiet,TrangThai) VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [id, dto.categoryId, dto.name, dto.image ?? null, dto.description ?? null, dto.details ?? null, dto.status]);
      for (const p of dto.packages) await this.insertPackage(r, id, p);
      return { id, message: 'Thêm mới dịch vụ thành công!' };
    });
  }

  async update(id: string, dto: AdminServiceWriteDto) {
    this.checkInput(dto, true);
    return await this.tx(async (r) => {
      // Row lock on the service serialises concurrent edits/stops of the same service.
      const cur = await r.query('SELECT TrangThai AS "TrangThai" FROM dbo.DichVu WHERE MaDichVu=$1 FOR UPDATE', [id]);
      if (!cur.length) throw new NotFoundException(MSG.notFound);
      await this.checkCategory(r, dto.categoryId);
      await this.checkDuplicateName(r, dto.name, id);
      if (dto.status === INACTIVE && cur[0].TrangThai !== INACTIVE) await this.assertNoFutureBookings(r, id);
      await r.query(`UPDATE dbo.DichVu SET MaDanhMuc=$2,TenDichVu=$3,HinhAnh=$4,MoTaNgan=$5,MoTaChiTiet=$6,TrangThai=$7 WHERE MaDichVu=$1`,
        [id, dto.categoryId, dto.name, dto.image ?? null, dto.description ?? null, dto.details ?? null, dto.status]);
      const existing: string[] = (await r.query('SELECT rtrim(MaGoi) AS id FROM dbo.GoiDichVu WHERE MaDichVu=$1 ORDER BY MaGoi FOR UPDATE', [id]))
        .map((x: Row) => x.id);
      if ((dto.removePackageIds ?? []).some((x) => !existing.includes(x))) throw new BadRequestException(MSG.package);
      const touched = new Set<string>();
      let inserted = 0;
      for (const p of dto.packages) {
        if (p.id) {
          if (!existing.includes(p.id) || touched.has(p.id)) throw new BadRequestException(MSG.package);
          touched.add(p.id);
          await r.query('UPDATE dbo.GoiDichVu SET TenGoi=$2,ThoiLuong=$3,Gia=$4 WHERE MaGoi=$1', [p.id, p.name, p.durationMinutes, p.price]);
        } else {
          await this.insertPackage(r, id, p);
          inserted++;
        }
      }
      // Upsert-only: absent packages are untouched. Deletion happens only for explicit removePackageIds;
      // packages with booking history are retained.
      let deleted = 0;
      const retained: string[] = [];
      for (const pid of dto.removePackageIds ?? []) {
        if ((await r.query('SELECT 1 AS x FROM dbo.KhachSuDungDichVu WHERE MaGoi=$1 LIMIT 1', [pid])).length) retained.push(pid);
        else {
          await r.query('DELETE FROM dbo.GoiDichVu WHERE MaGoi=$1', [pid]);
          deleted++;
        }
      }
      if (existing.length - deleted + inserted < 1) throw new BadRequestException(MSG.lastPackage);
      return { id, message: 'Cập nhật dịch vụ thành công!', retainedPackageIds: retained };
    });
  }

  async stop(id: string) {
    return await this.tx(async (r) => {
      const cur = await r.query('SELECT TrangThai AS "TrangThai" FROM dbo.DichVu WHERE MaDichVu=$1 FOR UPDATE', [id]);
      if (!cur.length) throw new NotFoundException(MSG.notFound);
      if (cur[0].TrangThai !== INACTIVE) {
        await this.assertNoFutureBookings(r, id);
        await r.query('UPDATE dbo.DichVu SET TrangThai=$2 WHERE MaDichVu=$1', [id, INACTIVE]);
      }
      return { message: 'Đã chuyển dịch vụ sang Ngừng hoạt động!' };
    });
  }

  private checkInput(dto: AdminServiceWriteDto, isUpdate = false) {
    if (!isUpdate && (dto.removePackageIds?.length || !dto.packages.length)) throw new BadRequestException(MSG.lastPackage);
    const rm = new Set(dto.removePackageIds ?? []);
    if (rm.size !== (dto.removePackageIds ?? []).length || dto.packages.some((p) => p.id && rm.has(p.id))) throw new BadRequestException(MSG.removeConflict);
    if (dto.image === '') dto.image = undefined;
    if (dto.image && !isSafeImage(dto.image)) throw new BadRequestException(MSG.image);
    const seen = new Set<string>();
    for (const p of dto.packages) {
      const k = p.name.toLowerCase();
      if (seen.has(k)) throw new BadRequestException('Tên gói dịch vụ bị trùng!');
      seen.add(k);
    }
  }

  private async checkCategory(r: QueryRunner, id: string) {
    if (!(await r.query('SELECT 1 AS x FROM dbo.DanhMuc WHERE MaDanhMuc=$1', [id])).length) throw new BadRequestException(MSG.category);
  }

  // Replaces the HOLDLOCK range lock: a per-name advisory lock serialises concurrent writers of the same
  // (case-insensitive) name; UX_DichVu_TenDichVu ON lower(TenDichVu) stays the final guard (→ same 409).
  private async checkDuplicateName(r: QueryRunner, name: string, exceptId?: string) {
    await r.query(`SELECT pg_advisory_xact_lock(hashtext('dbo.DichVu:name:' || lower($1)))`, [name]);
    const rows = await r.query(`SELECT 1 AS x FROM dbo.DichVu
      WHERE lower(TenDichVu)=lower($1) AND ($2::text IS NULL OR MaDichVu<>$2) LIMIT 1`, [name, exceptId ?? null]);
    if (rows.length) throw new ConflictException(MSG.duplicate);
  }

  private async assertNoFutureBookings(r: QueryRunner, id: string) {
    const rows = await r.query(`SELECT l.MaLichHen FROM dbo.KhachSuDungDichVu c
      JOIN dbo.GoiDichVu g ON g.MaGoi=c.MaGoi JOIN dbo.LichHen l ON l.MaLichHen=c.MaLichHen
      WHERE g.MaDichVu=$1 AND l.NgayHen>=dbo.vn_now()::date
        AND l.TrangThaiLichHen IN (${PENDING_STATUSES.map((_, i) => `$${i + 2}`).join(',')})
      LIMIT 1`, [id, ...PENDING_STATUSES]);
    if (rows.length) throw new ConflictException(MSG.futureBookings);
  }

  /** MAX+1 key generation, serialised by a transaction-scoped advisory lock on `<table>:id`. */
  private async nextId(r: QueryRunner, table: string, col: string, prefix: string): Promise<string> {
    await r.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${table}:id`]);
    const rows = await r.query(`SELECT COALESCE(MAX(substring(${col}, 3, 8)::int), 0) AS n FROM ${table}
      WHERE ${col} ~ $1`, [`^${prefix}[0-9]{8}$`]);
    return `${prefix}${String(Number(rows[0].n) + 1).padStart(8, '0')}`;
  }

  private async insertPackage(r: QueryRunner, serviceId: string, p: { name: string; durationMinutes: number; price: number }) {
    const pid = await this.nextId(r, 'dbo.GoiDichVu', 'MaGoi', 'GV');
    await r.query('INSERT INTO dbo.GoiDichVu(MaGoi,MaDichVu,TenGoi,ThoiLuong,Gia) VALUES($1,$2,$3,$4,$5)', [pid, serviceId, p.name, p.durationMinutes, p.price]);
    return pid;
  }

  private async tx<T>(work: (r: QueryRunner) => Promise<T>): Promise<T> {
    try {
      return await this.database.transaction(work);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (isUniqueViolation(error)) throw new ConflictException(MSG.duplicate);
      throw new ServiceUnavailableException(MSG.save);
    }
  }
}
