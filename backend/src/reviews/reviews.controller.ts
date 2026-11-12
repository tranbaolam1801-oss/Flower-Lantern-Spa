import { BadRequestException, ConflictException, Body, Controller, ForbiddenException, Get, Inject, NotFoundException, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { Request } from 'express';
import { DatabaseService } from '../database.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Permissions, Roles } from '../auth/roles.decorator';
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

const REPLIED_AT_UTC = `CONVERT(varchar(19),p.NgayPhanHoi,126)+'Z'`;
const COLUMN_RECHECK_MS = 60_000;

const reviewSelect = (hasReplyTimestamp: boolean) => `SELECT RTRIM(r.MaDanhGia) AS id,RTRIM(r.MaLichHen) AS bookingId,k.HoTen AS customerName,
  RTRIM(k.SoDienThoai) AS customerPhone,d.TenDichVu AS serviceName,
  (SELECT TOP 1 g.TenGoi FROM dbo.KhachSuDungDichVu c JOIN dbo.GoiDichVu g ON g.MaGoi=c.MaGoi
    WHERE c.MaLichHen=r.MaLichHen AND g.MaDichVu=r.MaDichVu ORDER BY c.MaChiTiet) AS packageName,
  r.SoSao AS rating,r.NoiDungDanhGia AS comment,CONVERT(varchar(19),r.NgayDanhGia,126) AS createdAt,
  RTRIM(p.MaPhanHoi) AS replyId,p.NoiDungPhanHoi AS replyContent,nv.HoTen AS staffName,${hasReplyTimestamp ? REPLIED_AT_UTC : 'NULL'} AS repliedAt
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
    const rows = await this.database.query<{ len: number | null }[]>(`SELECT COL_LENGTH('dbo.PhanHoi','NgayPhanHoi') AS len`);
    const present = rows[0]?.len != null;
    this.replyTimestamp = { present, checkedAt: Date.now() };
    return reviewSelect(present);
  }

  @Get('reviews') @Roles('Nhân viên', 'Quản lý') @Permissions('Q03')
  async list(@Query() query: ReviewListQuery) {
    const page = query.page ?? 1;
    const rows = await this.database.query<ReviewRow[]>(`${await this.reviewSelect()}
      WHERE (@0=N'' OR CHARINDEX(@0,k.HoTen COLLATE Vietnamese_100_CI_AS)>0 OR CHARINDEX(@0,k.SoDienThoai)>0
             OR CHARINDEX(@0,d.TenDichVu COLLATE Vietnamese_100_CI_AS)>0)
        AND (@1=N'' OR (@1=N'Đã phản hồi' AND p.MaPhanHoi IS NOT NULL) OR (@1=N'Chưa phản hồi' AND p.MaPhanHoi IS NULL))
      ORDER BY r.NgayDanhGia DESC,r.MaDanhGia DESC
      OFFSET @2 ROWS FETCH NEXT ${PAGE_SIZE + 1} ROWS ONLY`, [query.q ?? '', query.status ?? '', (page - 1) * PAGE_SIZE]);
    return { items: rows.slice(0, PAGE_SIZE).map(toReviewItem), page, hasNext: rows.length > PAGE_SIZE };
  }

  @Get('reviews/:id') @Roles('Nhân viên', 'Quản lý') @Permissions('Q03')
  async detail(@Param() params: ReviewIdParam) {
    const rows = await this.database.query<ReviewRow[]>(`${await this.reviewSelect()} WHERE r.MaDanhGia=@0`, [params.id]);
    if (!rows[0]) throw new NotFoundException('Không tìm thấy đánh giá.');
    return toReviewItem(rows[0]);
  }

  @Post('reviews/:id/reply') @Roles('Nhân viên', 'Quản lý') @Permissions('Q03')
  async reply(@Param() params: ReviewIdParam, @Body() body: ReplyBody, @Req() request: Request & { user: JwtPayload }) {
    const staffId = request.user.entityId;
    if (!staffId) throw new ForbiddenException('Tài khoản chưa gắn với hồ sơ nhân viên.');
    const rows = await this.database.query<{result:string}[]>(`SET XACT_ABORT ON;
      BEGIN TRY
        BEGIN TRANSACTION;
        IF NOT EXISTS(SELECT 1 FROM dbo.DanhGia WITH(UPDLOCK,HOLDLOCK) WHERE MaDanhGia=@0) SELECT 'missing' AS result;
        ELSE IF EXISTS(SELECT 1 FROM dbo.PhanHoi WITH(UPDLOCK,HOLDLOCK) WHERE MaDanhGia=@0) SELECT 'replied' AS result;
        ELSE BEGIN
          DECLARE @id char(10)=(SELECT 'PH'+RIGHT('00000000'+CAST(ISNULL(MAX(TRY_CONVERT(int,SUBSTRING(MaPhanHoi,3,8))),0)+1 AS varchar(8)),8)
            FROM dbo.PhanHoi WITH(UPDLOCK,HOLDLOCK) WHERE MaPhanHoi LIKE 'PH[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]');
          INSERT dbo.PhanHoi(MaPhanHoi,MaDanhGia,MaNhanVien,NoiDungPhanHoi) VALUES(@id,@0,@1,@2);
          SELECT 'ok' AS result;
        END;
        COMMIT;
      END TRY BEGIN CATCH
        IF @@TRANCOUNT>0 ROLLBACK;
        THROW;
      END CATCH`, [params.id, staffId, body.content]);
    if (rows[0]?.result === 'missing') throw new NotFoundException('Không tìm thấy đánh giá.');
    if (rows[0]?.result === 'replied') throw new ConflictException('Đánh giá này đã được phản hồi!');
    return { message: 'Gửi phản hồi thành công!' };
  }

  @Post('me/bookings/:id/review') @Roles('Khách hàng')
  async reviewMyBooking(@Param() params: ReviewIdParam, @Body() body: CustomerReviewBody, @Req() request: Request & { user: JwtPayload }) {
    if (!Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5) throw new BadRequestException('Số sao phải từ 1 đến 5!');
    // Ownership comes from the authenticated account; the booking row lock serializes duplicate submissions.
    const rows = await this.database.query<{result:string;id:string|null}[]>(`SET XACT_ABORT ON;
      BEGIN TRY
        BEGIN TRANSACTION;
        DECLARE @customer char(10),@status nvarchar(30),@service char(10);
        SELECT @customer=l.MaKhachHang,@status=l.TrangThaiLichHen
          FROM dbo.LichHen l WITH(UPDLOCK,HOLDLOCK) JOIN dbo.KhachHang k ON k.MaKhachHang=l.MaKhachHang
          WHERE l.MaLichHen=@0 AND k.MaTaiKhoan=@1;
        IF @customer IS NULL SELECT 'missing' AS result,CAST(NULL AS char(10)) AS id;
        ELSE IF @status<>N'Hoàn thành' SELECT 'notcompleted' AS result,CAST(NULL AS char(10)) AS id;
        ELSE IF EXISTS(SELECT 1 FROM dbo.DanhGia WITH(UPDLOCK,HOLDLOCK) WHERE MaLichHen=@0) SELECT 'exists' AS result,CAST(NULL AS char(10)) AS id;
        ELSE BEGIN
          SELECT TOP 1 @service=g.MaDichVu FROM dbo.KhachSuDungDichVu c JOIN dbo.GoiDichVu g ON g.MaGoi=c.MaGoi
            WHERE c.MaLichHen=@0 ORDER BY c.MaChiTiet;
          IF @service IS NULL SELECT 'noservice' AS result,CAST(NULL AS char(10)) AS id;
          ELSE BEGIN
            DECLARE @id char(10)=(SELECT 'DG'+RIGHT('00000000'+CAST(ISNULL(MAX(TRY_CONVERT(int,SUBSTRING(MaDanhGia,3,8))),0)+1 AS varchar(8)),8)
              FROM dbo.DanhGia WITH(UPDLOCK,HOLDLOCK) WHERE MaDanhGia LIKE 'DG[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]');
            INSERT dbo.DanhGia(MaDanhGia,MaLichHen,MaKhachHang,MaDichVu,SoSao,NoiDungDanhGia) VALUES(@id,@0,@customer,@service,@2,@3);
            SELECT 'ok' AS result,RTRIM(@id) AS id;
          END;
        END;
        COMMIT;
      END TRY BEGIN CATCH
        IF @@TRANCOUNT>0 ROLLBACK;
        THROW;
      END CATCH`, [params.id, request.user.sub, body.rating, body.comment ? body.comment : null]);
    const result = rows[0]?.result;
    if (result === 'missing') throw new NotFoundException('Không tìm thấy lịch hẹn.');
    if (result === 'notcompleted') throw new ConflictException('Chỉ có thể đánh giá lịch hẹn đã hoàn thành!');
    if (result === 'exists') throw new ConflictException('Lịch hẹn này đã được đánh giá!');
    if (result === 'noservice') throw new ConflictException('Lịch hẹn không có dịch vụ để đánh giá.');
    return { id: rows[0]?.id?.trim() ?? '', message: 'Gửi đánh giá thành công!' };
  }
}
