import { BadRequestException, ConflictException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { QueryRunner } from 'typeorm';
import { DatabaseService } from '../database.service';

export interface BedInterval {bedId:string;startsAt:string;endsAt:string}
const conflict='Giường đã có lịch tại khung giờ này. Vui lòng chọn giường hoặc thời gian khác!';
function validTime(value:string) {
  const timestamp=Date.parse(value+'Z');
  return /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/.test(value)&&Number.isFinite(timestamp)&&new Date(timestamp).toISOString().slice(0,19)===value;
}

/** Every create/reschedule/cancel writer must use the same ordered bed locks.
 * Holds locks through the caller's write and commit, including currently empty beds.
 * Business policy (hours/status/duration from SQL) is validated by the caller.
 */
@Injectable()
export class BookingTransactionService {
  constructor(@Inject(DatabaseService) private readonly database:DatabaseService) {}

  async reserve<T>(slots:BedInterval[],write:(runner:QueryRunner)=>Promise<T>,excludeBookingId?:string):Promise<T> {
    if(!slots.length)throw new BadRequestException('Vui lòng nhập thông tin khách sử dụng dịch vụ!');
    for(const s of slots) {
      if(!/^G([1-9]|1[0-9]|20)$/.test(s.bedId)||![s.startsAt,s.endsAt].every(validTime)||s.endsAt<=s.startsAt)
        throw new BadRequestException('Giường hoặc khoảng thời gian không hợp lệ.');
    }
    for(let i=0;i<slots.length;i++)for(let j=i+1;j<slots.length;j++)if(slots[i].bedId===slots[j].bedId&&slots[i].startsAt<slots[j].endsAt&&slots[i].endsAt>slots[j].startsAt)throw new ConflictException(conflict);
    let runner:QueryRunner|undefined;
    try {
      runner=(await this.database.getDataSource()).createQueryRunner();
      await runner.connect();await runner.startTransaction();
      for(const bed of [...new Set(slots.map(s=>s.bedId))].sort((a,b)=>Number(a.slice(1))-Number(b.slice(1)))) {
        const rows=await runner.query('SELECT MaGiuong FROM dbo.Giuong WITH (UPDLOCK,HOLDLOCK) WHERE MaGiuong=@0',[bed]);
        if(rows.length!==1)throw new BadRequestException('Giường không tồn tại.');
      }
      for(const s of slots) {
        const rows=await runner.query(`SELECT TOP(1) c.MaChiTiet FROM dbo.KhachSuDungDichVu c
          JOIN dbo.LichHen l ON l.MaLichHen=c.MaLichHen
          WHERE c.MaGiuong=@0 AND c.ThoiDiemBatDau<CONVERT(datetime,@2,126) AND c.ThoiDiemKetThuc>CONVERT(datetime,@1,126)
          AND l.TrangThaiLichHen<>N'Đã hủy' AND (@3 IS NULL OR l.MaLichHen<>@3)`,[s.bedId,s.startsAt,s.endsAt,excludeBookingId??null]);
        if(rows.length)throw new ConflictException(conflict);
      }
      const result=await write(runner);
      await runner.commitTransaction();return result;
    } catch(error) {
      if(runner?.isTransactionActive)await runner.rollbackTransaction();
      if(error instanceof BadRequestException||error instanceof ConflictException)throw error;
      throw new ServiceUnavailableException('Không thể lưu lịch hẹn. Vui lòng thử lại sau!');
    } finally {if(runner)await runner.release();}
  }
}
