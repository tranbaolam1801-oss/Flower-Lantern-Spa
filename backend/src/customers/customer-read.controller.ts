import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { DatabaseService } from '../database.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Permissions, Roles } from '../auth/roles.decorator';

export class CustomerSearchQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100)
  // A NUL byte cannot be stored/compared by PostgreSQL and would surface as a 5xx: refuse it as a bad request.
  // eslint-disable-next-line no-control-regex
  @Matches(/^[^\u0000]*$/, { message: 'Từ khóa tìm kiếm không hợp lệ!' })
  @Transform(({value}: {value:unknown}) => typeof value === 'string' ? value.trim() : value)
  q = '';
  @ApiPropertyOptional({default:1}) @Type(() => Number) @IsInt() @Min(1) @Max(1000000)
  page = 1;
}

@ApiTags('customers')
@Controller('customers')
@UseGuards(AuthGuard, RolesGuard)
@Roles('Nhân viên', 'Quản lý') @Permissions('Q02')
export class CustomerReadController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  @Get()
  async search(@Query() query: CustomerSearchQuery) {
    // ILIKE is case-insensitive (SQL Server's collation was). \, % and _ are escaped so the search text is
    // always literal, never a LIKE pattern.
    const pattern = `%${query.q.replace(/[\\%_]/g, '\\$&')}%`;
    const result = await this.database.query<{id:string;name:string;phone:string;channel:string|null;bookingCount:number}[]>(`
      SELECT RTRIM(k.MaKhachHang) AS "id",k.HoTen AS "name",RTRIM(k.SoDienThoai) AS "phone",k.KenhLienHe AS "channel",
        (SELECT COUNT(*) FROM dbo.LichHen l WHERE l.MaKhachHang=k.MaKhachHang) AS "bookingCount"
      FROM dbo.KhachHang k
      WHERE k.HoTen ILIKE $1 OR k.SoDienThoai::text ILIKE $1 OR k.MaKhachHang::text ILIKE $1 OR $2::text=''
      ORDER BY k.HoTen,k.MaKhachHang
      LIMIT 21 OFFSET $3::int`, [pattern,query.q,(query.page-1)*20]);
    return {items:result.slice(0,20),page:query.page,hasNext:result.length>20};
  }
}
