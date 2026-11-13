import { BadRequestException, ConflictException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { QueryRunner } from 'typeorm';
import { DatabaseService } from '../database.service';
import { returnedRows } from '../common/pg-result';
import { syncBookingNotifications } from '../notifications/booking-notification-enqueue';

export interface BedInterval {bedId:string;startsAt:string;endsAt:string}
const conflict='Giường đã có lịch tại khung giờ này. Vui lòng chọn giường hoặc thời gian khác!';
function validTime(value:string) {
  const timestamp=Date.parse(value+'Z');
  return /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/.test(value)&&Number.isFinite(timestamp)&&new Date(timestamp).toISOString().slice(0,19)===value;
}
const bedOrder=(a:string,b:string)=>Number(a.slice(1))-Number(b.slice(1))||a.localeCompare(b);

/**
 * Global lock order shared by every booking writer (create, reschedule, cancel):
 *   1. dbo.Giuong rows, ascending bed number, `SELECT ... FOR UPDATE` (held until COMMIT/ROLLBACK);
 *   2. then, if needed, the booking's own dbo.LichHen row (`FOR UPDATE`).
 * One global order means two writers can never wait on each other in a cycle.
 * Locking the bed row even when the bed is currently empty is what serialises two inserts for the same bed:
 * the second writer blocks on the row lock and, in READ COMMITTED, its next overlap query sees the first commit.
 */
export async function lockBeds(runner:QueryRunner,bedIds:string[]) {
  for(const bed of [...new Set(bedIds)].sort(bedOrder)) {
    const rows=returnedRows(await runner.query('SELECT MaGiuong FROM dbo.Giuong WHERE MaGiuong=$1 FOR UPDATE',[bed]));
    if(rows.length!==1)throw new BadRequestException('Giường không tồn tại.');
  }
}

export type CancelOutcome='missing'|'completed'|'cancelled'|'arrived'|'ok';

/**
 * Status-only cancellation (details, payments and refunds are preserved) under the global lock order:
 * the booking's beds first, then its LichHen row, then the status re-check and UPDATE.
 * `ownerAccountId` restricts the booking to the customer's own account; `blockArrived` refuses 'Đã đến'.
 */
export async function cancelUnderLocks(runner:QueryRunner,id:string,options:{ownerAccountId?:string;blockArrived:boolean}):Promise<CancelOutcome> {
  const beds=returnedRows<{bedId:string}>(await runner.query(
    'SELECT DISTINCT rtrim(MaGiuong) AS "bedId" FROM dbo.KhachSuDungDichVu WHERE MaLichHen=$1 AND MaGiuong IS NOT NULL',[id]));
  await lockBeds(runner,beds.map(b=>b.bedId));
  const rows=returnedRows<{status:string}>(options.ownerAccountId===undefined
    ? await runner.query('SELECT TrangThaiLichHen AS status FROM dbo.LichHen WHERE MaLichHen=$1 FOR UPDATE',[id])
    : await runner.query(`SELECT l.TrangThaiLichHen AS status FROM dbo.LichHen l JOIN dbo.KhachHang k ON k.MaKhachHang=l.MaKhachHang
        WHERE l.MaLichHen=$1 AND k.MaTaiKhoan=$2 FOR UPDATE OF l`,[id,options.ownerAccountId]));
  const status=rows[0]?.status;
  if(status===undefined)return 'missing';
  if(status==='Hoàn thành')return 'completed';
  if(status==='Đã hủy')return 'cancelled';
  if(options.blockArrived&&status==='Đã đến')return 'arrived';
  await runner.query(`UPDATE dbo.LichHen SET TrangThaiLichHen='Đã hủy' WHERE MaLichHen=$1`,[id]);
  await syncBookingNotifications(runner,id,{status,startsAt:null}); // cancels pending jobs in the same transaction
  return 'ok';
}

/** Every create/reschedule/cancel writer must use the same ordered bed locks (see lockBeds).
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
    try {
      return await this.database.transaction(async (runner)=>{
        await lockBeds(runner,slots.map(s=>s.bedId));
        for(const s of slots) {
          const rows=returnedRows(await runner.query(`SELECT c.MaChiTiet FROM dbo.KhachSuDungDichVu c
            JOIN dbo.LichHen l ON l.MaLichHen=c.MaLichHen
            WHERE c.MaGiuong=$1 AND c.ThoiDiemBatDau<$3::timestamp AND c.ThoiDiemKetThuc>$2::timestamp
            AND l.TrangThaiLichHen<>'Đã hủy' AND ($4::text IS NULL OR l.MaLichHen<>$4::text) LIMIT 1`,[s.bedId,s.startsAt,s.endsAt,excludeBookingId??null]));
          if(rows.length)throw new ConflictException(conflict);
        }
        return await write(runner);
      });
    } catch(error) {
      if(error instanceof BadRequestException||error instanceof ConflictException)throw error;
      throw new ServiceUnavailableException('Không thể lưu lịch hẹn. Vui lòng thử lại sau!');
    }
  }
}
