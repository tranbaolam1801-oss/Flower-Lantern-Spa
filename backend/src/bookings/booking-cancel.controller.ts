import { ConflictException, Controller, Inject, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Matches } from 'class-validator';
import { DatabaseService } from '../database.service';
import { cancelUnderLocks } from './booking-transaction.service';
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
    const result=await this.database.transaction(runner=>cancelUnderLocks(runner,params.id,{blockArrived:false}));
    if(result==='missing')throw new NotFoundException('Không tìm thấy lịch hẹn.');
    if(result==='completed')throw new ConflictException('Không thể hủy lịch hẹn đã hoàn thành!');
    if(result==='cancelled')throw new ConflictException('Lịch hẹn này đã được hủy!');
    return {message:'Hủy lịch hẹn thành công!'};
  }
}
