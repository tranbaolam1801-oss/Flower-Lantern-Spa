import { BadRequestException, ConflictException, Body, Controller, ForbiddenException, Get, Inject, NotFoundException, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { Request } from 'express';
import { DatabaseService } from '../database.service';
import { isUniqueViolation } from '../common/db-errors';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Permissions, Roles } from '../auth/roles.decorator';
import { notifyReviewCreated } from '../inbox/inbox-notify';
import { JwtPayload } from '../auth/auth.dto';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
const PAGE_SIZE = 20;

export class ReviewListQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) @Transform(trim) q = '';
  @ApiPropertyOptional({ enum: ['Chưa phản hồi', 'Đã phản hồi'] }) @IsOptional() @IsIn(['', 'Chưa phản hồi', 'Đã phản hồi']) status = '';
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000000) page = 1;
}
export class ReviewIdParam { @Matches(/^[A-Za-z0-9]{1,10}$/) id!: string }
export class ReplyBody {
  @Transform(trim) @IsString({ message: 'Không được để trống!' }) @IsNotEmpty({ message: 'Không được để trống!' })
  @MaxLength(1000, { message: 'Tối đa 1000 ký tự!' }) content!: string;
}
export class CustomerReviewBody {
  @Type(() => Number) @IsInt({ message: 'Số sao phải từ 1 đến 5!' }) @Min(1, { message: 'Số sao phải từ 1 đến 5!' }) @Max(5, { message: 'Số sao phải từ 1 đến 5!' })
  rating!: number;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000, { message: 'Tối đa 1000 ký tự!' }) comment?: string;
}

interface ReviewRow {
  id: string; bookingId: string; customerName: string; customerPhone: string; serviceName: string;
  packageName: string | null; rating: number; comment: string | null; createdAt: string;
  replyId: string | null; replyContent: string | null; staffName: string | null; repliedAt: string | null;
}

const REPLIED_AT_UTC = `to_char(p.NgayPhanHoi,'YYYY-MM-DD"T"HH24:MI:SS')||'Z'`;
const COLUMN_RECHECK_MS = 60_000;

const reviewSelect = (hasReplyTimestamp: boolean) => `SELECT rtrim(r.MaDanhGia) AS "id",rtrim(r.MaLichHen) AS "bookingId",k.HoTen AS "customerName",
  rtrim(k.SoDienThoai) AS "customerPhone",d.TenDichVu AS "serviceName",
  (SELECT g.TenGoi FROM dbo.KhachSuDungDichVu c JOIN dbo.GoiDichVu g ON g.MaGoi=c.MaGoi
    WHERE c.MaLichHen=r.MaLichHen AND g.MaDichVu=r.MaDichVu ORDER BY c.MaChiTiet LIMIT 1) AS "packageName",
  r.SoSao AS "rating",r.NoiDungDanhGia AS "comment",to_char(r.NgayDanhGia,'YYYY-MM-DD"T"HH24:MI:SS') AS "createdAt",
  rtrim(p.MaPhanHoi) AS "replyId",p.NoiDungPhanHoi AS "replyContent",nv.HoTen AS "staffName",${hasReplyTimestamp ? REPLIED_AT_UTC : 'NULL::text'} AS "repliedAt"
  FROM dbo.DanhGia r JOIN dbo.KhachHang k ON k.MaKhachHang=r.MaKhachHang JOIN dbo.DichVu d ON d.MaDichVu=r.MaDichVu
  LEFT JOIN dbo.PhanHoi p ON p.MaDanhGia=r.MaDanhGia LEFT JOIN dbo.NhanVien nv ON nv.MaNhanVien=p.MaNhanVien`;

// NgayPhanHoi (migration 006) may be absent (not applied) or NULL (legacy replies); both yield repliedAt ''.
export const toReviewItem = (r: ReviewRow) => ({
  id: r.id, bookingId: r.bookingId, customerName: r.customerName, customerPhone: r.customerPhone,
  serviceName: r.serviceName, packageName: r.packageName ?? undefined, rating: Number(r.rating),
  comment: r.comment ?? '', createdAt: r.createdAt,
  status: r.replyId ? 'Đã phản hồi' as const : 'Chưa phản hồi' as const,
  reply: r.replyId ? { id: r.replyId, content: r.replyContent ?? '', staffName: r.staffName ?? '', repliedAt: r.repliedAt ?? '' } : null,
});

@ApiTags('reviews')
@UseGuards(AuthGuard, RolesGuard)
@Controller()
export class ReviewsController {
  private replyTimestamp: { present: boolean; checkedAt: number } | undefined;

  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  private async reviewSelect() {
    const cached = this.replyTimestamp;
    if (cached && (cached.present || Date.now() - cached.checkedAt < COLUMN_RECHECK_MS)) return reviewSelect(cached.present);
    const rows = await this.database.query<{ present: boolean }[]>(`SELECT EXISTS(SELECT 1 FROM information_schema.columns
      WHERE table_schema='dbo' AND table_name='phanhoi' AND column_name='ngayphanhoi') AS "present"`);
    const present = rows[0]?.present === true;
    this.replyTimestamp = { present, checkedAt: Date.now() };
    return reviewSelect(present);
  }

  @Get('reviews') @Roles('Nhân viên', 'Quản lý') @Permissions('Q03')
  async list(@Query() query: ReviewListQuery) {
    const page = query.page ?? 1;
    const rows = await this.database.query<ReviewRow[]>(`${await this.reviewSelect()}
      WHERE ($1::text='' OR strpos(lower(k.HoTen),lower($1::text))>0 OR strpos(k.SoDienThoai,$1::text)>0
             OR strpos(lower(d.TenDichVu),lower($1::text))>0)
        AND ($2::text='' OR ($2::text='Đã phản hồi' AND p.MaPhanHoi IS NOT NULL) OR ($2::text='Chưa phản hồi' AND p.MaPhanHoi IS NULL))
      ORDER BY r.NgayDanhGia DESC,r.MaDanhGia DESC
      OFFSET $3 ROWS FETCH NEXT ${PAGE_SIZE + 1} ROWS ONLY`, [query.q ?? '', query.status ?? '', (page - 1) * PAGE_SIZE]);
    return { items: rows.slice(0, PAGE_SIZE).map(toReviewItem), page, hasNext: rows.length > PAGE_SIZE };
  }

  @Get('reviews/:id') @Roles('Nhân viên', 'Quản lý') @Permissions('Q03')
  async detail(@Param() params: ReviewIdParam) {
    const rows = await this.database.query<ReviewRow[]>(`${await this.reviewSelect()} WHERE r.MaDanhGia=$1`, [params.id]);
    if (!rows[0]) throw new NotFoundException('Không tìm thấy đánh giá.');
    return toReviewItem(rows[0]);
  }

  @Post('reviews/:id/reply') @Roles('Nhân viên', 'Quản lý') @Permissions('Q03')
  async reply(@Param() params: ReviewIdParam, @Body() body: ReplyBody, @Req() request: Request & { user: JwtPayload }) {
    const staffId = request.user.entityId;
    if (!staffId) throw new ForbiddenException('Tài khoản chưa gắn với hồ sơ nhân viên.');
    const result = await this.database.transaction(async (runner) => {
      // Row lock on the review serialises concurrent replies; UX_PhanHoi_DanhGia is the final guard.
      if (!(await runner.query('SELECT 1 AS found FROM dbo.DanhGia WHERE MaDanhGia=$1 FOR UPDATE', [params.id])).length) return 'missing';
      if ((await runner.query('SELECT 1 AS found FROM dbo.PhanHoi WHERE MaDanhGia=$1', [params.id])).length) return 'replied';
      await runner.query(`SELECT pg_advisory_xact_lock(hashtext('dbo.PhanHoi:id'))`);
      const next = await runner.query(`SELECT 'PH'||lpad((COALESCE(MAX(substring(MaPhanHoi from 3 for 8)::int),0)+1)::text,8,'0') AS "id"
        FROM dbo.PhanHoi WHERE MaPhanHoi ~ '^PH[0-9]{8}$'`);
      await runner.query('INSERT INTO dbo.PhanHoi(MaPhanHoi,MaDanhGia,MaNhanVien,NoiDungPhanHoi) VALUES($1,$2,$3,$4)', [next[0].id, params.id, staffId, body.content]);
      return 'ok';
    }).catch((error: unknown) => {
      if (isUniqueViolation(error)) return 'replied';
      throw error;
    });
    if (result === 'missing') throw new NotFoundException('Không tìm thấy đánh giá.');
    if (result === 'replied') throw new ConflictException('Đánh giá này đã được phản hồi!');
    return { message: 'Gửi phản hồi thành công!' };
  }

  @Post('me/bookings/:id/review') @Roles('Khách hàng')
  async reviewMyBooking(@Param() params: ReviewIdParam, @Body() body: CustomerReviewBody, @Req() request: Request & { user: JwtPayload }) {
    if (!Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5) throw new BadRequestException('Số sao phải từ 1 đến 5!');
    // Ownership comes from the authenticated account; the booking row lock serializes duplicate submissions.
    const outcome = await this.database.transaction(async (runner): Promise<{ result: string; id: string | null }> => {
      const own = await runner.query(`SELECT l.MaKhachHang AS "customer",l.TrangThaiLichHen AS "status" FROM dbo.LichHen l JOIN dbo.KhachHang k ON k.MaKhachHang=l.MaKhachHang
        WHERE l.MaLichHen=$1 AND k.MaTaiKhoan=$2 FOR UPDATE OF l`, [params.id, request.user.sub]);
      if (!own.length) return { result: 'missing', id: null };
      if (own[0].status !== 'Hoàn thành') return { result: 'notcompleted', id: null };
      if ((await runner.query('SELECT 1 AS found FROM dbo.DanhGia WHERE MaLichHen=$1', [params.id])).length) return { result: 'exists', id: null };
      const svc = await runner.query(`SELECT g.MaDichVu AS "service" FROM dbo.KhachSuDungDichVu c JOIN dbo.GoiDichVu g ON g.MaGoi=c.MaGoi
        WHERE c.MaLichHen=$1 ORDER BY c.MaChiTiet LIMIT 1`, [params.id]);
      if (!svc.length) return { result: 'noservice', id: null };
      await runner.query(`SELECT pg_advisory_xact_lock(hashtext('dbo.DanhGia:id'))`);
      const next = await runner.query(`SELECT 'DG'||lpad((COALESCE(MAX(substring(MaDanhGia from 3 for 8)::int),0)+1)::text,8,'0') AS "id"
        FROM dbo.DanhGia WHERE MaDanhGia ~ '^DG[0-9]{8}$'`);
      await runner.query('INSERT INTO dbo.DanhGia(MaDanhGia,MaLichHen,MaKhachHang,MaDichVu,SoSao,NoiDungDanhGia) VALUES($1,$2,$3,$4,$5,$6)',
        [next[0].id, params.id, own[0].customer, svc[0].service, body.rating, body.comment ? body.comment : null]);
      await notifyReviewCreated((sql, params) => runner.query(sql, params), next[0].id as string); // same transaction, savepoint-isolated
      return { result: 'ok', id: next[0].id as string };
    }).catch((error: unknown): { result: string; id: string | null } => {
      if (isUniqueViolation(error)) return { result: 'exists', id: null };
      throw error;
    });
    const result = outcome.result;
    if (result === 'missing') throw new NotFoundException('Không tìm thấy lịch hẹn.');
    if (result === 'notcompleted') throw new ConflictException('Chỉ có thể đánh giá lịch hẹn đã hoàn thành!');
    if (result === 'exists') throw new ConflictException('Lịch hẹn này đã được đánh giá!');
    if (result === 'noservice') throw new ConflictException('Lịch hẹn không có dịch vụ để đánh giá.');
    return { id: outcome.id?.trim() ?? '', message: 'Gửi đánh giá thành công!' };
  }
}
