import { ConflictException, Controller, Inject, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Matches } from 'class-validator';
import { DatabaseService } from '../database.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles, Permissions } from '../auth/roles.decorator';
class BookingId { @Matches(/^[A-Za-z0-9]{1,10}$/) id!:string }

@ApiTags('bookings') @Controller('bookings')
@UseGuards(AuthGuard,RolesGuard) @Roles('Nhân viên','Quản lý') @Permissions('Q01')
export class BookingCancelController {
  constructor(@Inject(DatabaseService) private readonly database:DatabaseService) {}
  @Post(':id/cancel')
  async cancel(@Param() params:BookingId) {
    // A status-only cancellation frees occupancy without deleting historical details.
    // Row lock serializes competing transitions; payment/refund records are untouched.
    const rows=await this.database.query<{result:string}[]>(`SET XACT_ABORT ON;
      BEGIN TRY
        BEGIN TRANSACTION;
        DECLARE @status nvarchar(30);
        SELECT @status=TrangThaiLichHen FROM dbo.LichHen WITH(UPDLOCK,HOLDLOCK) WHERE MaLichHen=@0;
        IF @status IS NULL SELECT 'missing' AS result;
        ELSE IF @status=N'Hoàn thành' SELECT 'completed' AS result;
        ELSE IF @status=N'Đã hủy' SELECT 'cancelled' AS result;
        ELSE BEGIN
          UPDATE dbo.LichHen SET TrangThaiLichHen=N'Đã hủy' WHERE MaLichHen=@0;
          SELECT 'ok' AS result;
        END;
        COMMIT;
      END TRY BEGIN CATCH
        IF @@TRANCOUNT>0 ROLLBACK;
        THROW;
      END CATCH`,[params.id]);
    if(rows[0]?.result==='missing')throw new NotFoundException('Không tìm thấy lịch hẹn.');
    if(rows[0]?.result==='completed')throw new ConflictException('Không thể hủy lịch hẹn đã hoàn thành!');
    if(rows[0]?.result==='cancelled')throw new ConflictException('Lịch hẹn này đã được hủy!');
    return {message:'Hủy lịch hẹn thành công!'};
  }
}
