import { Controller, Get, Inject, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { DatabaseService } from './database.service';

export class CatalogQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150)
  @Transform(({value}: {value: unknown}) => typeof value === 'string' ? value.trim() : value)
  q?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(12)
  category?: string;
  @ApiPropertyOptional({default:1}) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10000)
  page = 1;
  @ApiPropertyOptional({default:12}) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50)
  limit = 12;
}

// Escape SQL LIKE metacharacters independently of parameter binding.
export const literalLike = (value: string) => `%${value.replace(/[~%_[]/g, '~$&')}%`;

@ApiTags('services')
@Controller('services')
export class CatalogController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  @Get()
  async list(@Query() query: CatalogQuery) {
    // SRS BR-UC6-01 / BR-UC7: public catalog must only expose active services.
    const items = await this.database.query<Record<string, unknown>[]>(`
      SELECT RTRIM(d.MaDichVu) AS id, d.TenDichVu AS name, d.MoTaNgan AS description,
        d.HinhAnh AS image, RTRIM(d.MaDanhMuc) AS categoryId,
        (SELECT MIN(g.Gia) FROM dbo.GoiDichVu g WHERE g.MaDichVu=d.MaDichVu) AS priceFrom
      FROM dbo.DichVu d
      WHERE d.TrangThai=@0 AND (@1='' OR d.TenDichVu COLLATE Vietnamese_100_CI_AS LIKE @2 ESCAPE '~')
        AND (@3='' OR d.MaDanhMuc=@3)
      ORDER BY d.TenDichVu, d.MaDichVu
      OFFSET @4 ROWS FETCH NEXT @5 ROWS ONLY`,
    ['Hoạt động', query.q ?? '', literalLike(query.q ?? ''), query.category ?? '', (query.page-1)*query.limit, query.limit]);
    return { items, page: query.page, limit: query.limit };
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    if (!/^[A-Za-z0-9_-]{1,12}$/.test(id)) throw new NotFoundException('Không tìm thấy thông tin dịch vụ!');
    const rows = await this.database.query<Record<string, unknown>[]>(`
      SELECT RTRIM(MaDichVu) AS id, TenDichVu AS name, MoTaNgan AS description,
        MoTaChiTiet AS details, HinhAnh AS image, LoiIch AS benefits,
        QuyTrinhThucHien AS procedureSteps, DoiTuongPhuHop AS suitableFor,
        ThongTinLieuTrinhVaLuuY AS notes
      FROM dbo.DichVu WHERE MaDichVu=@0 AND TrangThai=@1`, [id,'Hoạt động']);
    if (!rows.length) throw new NotFoundException('Không tìm thấy thông tin dịch vụ!');
    const packages = await this.database.query<Record<string, unknown>[]>(`
      SELECT RTRIM(MaGoi) AS id, TenGoi AS name, ThoiLuong AS durationMinutes, Gia AS price
      FROM dbo.GoiDichVu WHERE MaDichVu=@0 ORDER BY ThoiLuong, MaGoi`, [id]);
    return { ...rows[0], packages };
  }
}
