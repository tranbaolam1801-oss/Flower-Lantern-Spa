import 'reflect-metadata';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../auth/roles.guard';
import { BookingWriteService } from './booking-write.service';
import { BookingWriteController, MyBookingWriteController } from './booking-write.controller';
import { CreateAdminBookingDto } from './booking-write.dto';
import { canTransition, checkSlot, vietnamNow } from './booking-rules';

const NOW = '2026-11-12T10:00:00';
describe('booking rules', () => {
  it('vietnamNow has local datetime format', () => expect(vietnamNow()).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/));
  it('accepts a slot ending exactly 22:00', () => expect(checkSlot('2026-11-12T21:00:00', 60, NOW)).toBe('2026-11-12T22:00:00'));
  it('rejects past, early and late slots', () => {
    expect(() => checkSlot('2026-11-12T09:00:00', 60, NOW)).toThrow('quá khứ');
    expect(() => checkSlot('2026-11-13T07:30:00', 60, NOW)).toThrow('08:00');
    expect(() => checkSlot('2026-11-13T21:30:00', 60, NOW)).toThrow('08:00');
    expect(() => checkSlot('2026-13-13T10:00:00', 60, NOW)).toThrow(BadRequestException);
  });
  it('transition table locks terminal states', () => {
    expect(canTransition('Chờ xác nhận', 'Đã xác nhận')).toBe(true);
    expect(canTransition('Chưa đến', 'Hoàn thành')).toBe(false);
    expect(canTransition('Hoàn thành', 'Đã hủy')).toBe(false);
    expect(canTransition('Đã hủy', 'Chưa đến')).toBe(false);
  });
});

describe('DTO validation', () => {
  const base = { bookerName: 'A', bookerPhone: '0900000001', date: '2026-11-20', guests: [{ customerName: 'B', bedId: 'G1', packageId: 'P1', startsAt: '2026-11-20T09:00:00' }] };
  it('rejects bed G16 and bad phone', async () => {
    const dto = plainToInstance(CreateAdminBookingDto, { ...base, bookerPhone: '123', guests: [{ ...base.guests[0], bedId: 'G16' }] });
    expect((await validate(dto, { whitelist: true })).length).toBeGreaterThan(0);
  });
  it('accepts a valid payload', async () => expect(await validate(plainToInstance(CreateAdminBookingDto, base))).toHaveLength(0));
});

function setup(responses: ((sql: string, p: unknown[]) => unknown)[]) {
  const database = { query: jest.fn(async (sql: string, p: unknown[]) => { const r = responses.shift(); return r ? r(sql, p) : []; }) };
  const transactions = { reserve: jest.fn(async (...args: [unknown, (r: unknown) => unknown, string?]) => args[1]({ query: jest.fn(async (sql: string) => (sql.includes('UPDLOCK') ? [{ status: 'Chờ xác nhận', pay: 'Chưa thanh toán' }] : [])) })) };
  const service = new BookingWriteService(database as never, transactions as never);
  service.now = () => NOW;
  return { service, database, transactions };
}

describe('BookingWriteService', () => {
  it('rejects editing a completed booking', async () => {
    const { service } = setup([() => [{ id: 'L1', status: 'Hoàn thành', pay: 'Chưa thanh toán', date: '2026-11-20' }]]);
    await expect(service.updateAdmin('L1', { notes: 'x' })).rejects.toThrow('đã hoàn thành');
  });
  it('rejects invalid transition and missing booking', async () => {
    const a = setup([() => [{ id: 'L1', status: 'Chưa đến', pay: 'x', date: 'd' }]]);
    await expect(a.service.updateAdmin('L1', { status: 'Hoàn thành' })).rejects.toBeInstanceOf(ConflictException);
    const b = setup([() => []]);
    await expect(b.service.updateAdmin('L1', {})).rejects.toBeInstanceOf(NotFoundException);
  });
  it('status-only update is one optimistic parameterized statement', async () => {
    const { service, database } = setup([() => [{ id: 'L1', status: 'Chờ xác nhận', pay: 'Chưa thanh toán', date: '2026-11-20' }], () => [{ MaLichHen: 'L1' }]]);
    await service.updateAdmin('L1', { status: 'Đã xác nhận' });
    expect(database.query.mock.calls[1][1]).toEqual(['L1', 'Chờ xác nhận', 'Đã xác nhận', 'Chưa thanh toán', 0, null, 'Chưa thanh toán']);
  });
  it('status-only update reports stale concurrent change', async () => {
    const { service } = setup([() => [{ id: 'L1', status: 'Chờ xác nhận', pay: 'p', date: 'd' }], () => []]);
    await expect(service.updateAdmin('L1', { status: 'Đã xác nhận' })).rejects.toThrow('vừa được cập nhật');
  });
  it('status update is guarded by the payment status that was read (lost-update protection)', async () => {
    const { service, database } = setup([() => [{ id: 'L1', status: 'Chờ xác nhận', pay: 'Chưa thanh toán', date: 'd' }], () => []]);
    await expect(service.updateAdmin('L1', { status: 'Đã xác nhận' })).rejects.toThrow('vừa được cập nhật');
    expect(String(database.query.mock.calls[1][0])).toContain('AND TrangThaiThanhToan=@6');
  });
  it('manual payment status change is rejected when payment transactions exist', async () => {
    const { service, database } = setup([() => [{ id: 'L1', status: 'Chờ xác nhận', pay: 'Chưa thanh toán', date: 'd' }], () => [{ found: 1 }]]);
    await expect(service.updateAdmin('L1', { paymentStatus: 'Đã thanh toán' })).rejects.toThrow('không thể sửa thủ công');
    expect(database.query).toHaveBeenCalledTimes(2);
  });
  it('manual payment status change is allowed when no payment transactions exist', async () => {
    const { service, database } = setup([() => [{ id: 'L1', status: 'Chờ xác nhận', pay: 'Chưa thanh toán', date: 'd' }], () => [], () => [{ MaLichHen: 'L1' }]]);
    await service.updateAdmin('L1', { paymentStatus: 'Đã thanh toán' });
    expect(database.query.mock.calls[2][1]).toEqual(['L1', 'Chờ xác nhận', 'Chờ xác nhận', 'Đã thanh toán', 0, null, 'Chưa thanh toán']);
  });
  it('admin create rejects past start and unknown package before locking', async () => {
    const guest = { customerName: 'B', bedId: 'G1', packageId: 'P1', startsAt: '2026-11-12T09:00:00' };
    const dto = { bookerName: 'A', bookerPhone: '0900000001', date: '2026-11-12', guests: [guest] };
    const a = setup([() => [{ id: 'P1', duration: 60 }]]);
    await expect(a.service.createAdmin(dto)).rejects.toThrow('quá khứ');
    const b = setup([() => []]);
    await expect(b.service.createAdmin(dto)).rejects.toThrow('gói dịch vụ');
    expect(a.transactions.reserve).not.toHaveBeenCalled();
  });
  it('admin create uses SQL duration for the interval', async () => {
    const guest = { customerName: 'B', bedId: 'G2', packageId: 'P1', startsAt: '2026-11-12T20:00:00' };
    const dto = { bookerName: 'A', bookerPhone: '0900000001', date: '2026-11-12', guests: [guest] };
    const { service, transactions } = setup([() => [{ id: 'P1', duration: 90 }]]);
    await service.createAdmin(dto);
    expect(transactions.reserve.mock.calls[0][0]).toMatchObject([{ bedId: 'G2', endsAt: '2026-11-12T21:30:00' }]);
    const late = setup([() => [{ id: 'P1', duration: 150 }]]);
    await expect(late.service.createAdmin(dto)).rejects.toThrow('08:00');
  });
  it('customer create picks first free active bed and ties to account', async () => {
    const { service, transactions, database } = setup([() => [{ id: 'KH1' }], () => [{ id: 'P1', duration: 60 }], () => [{ bedId: 'G1' }, { bedId: 'G2' }]]);
    const result = await service.createCustomer('TK1', { fullName: 'A', phone: '0900000001', date: '2026-11-13', time: '09:00', guests: [{ customerName: 'B', packageId: 'P1' }] });
    expect(result.status).toBe('Chờ xác nhận');
    expect(database.query.mock.calls[0][1]).toEqual(['TK1']);
    expect(transactions.reserve.mock.calls[0][0]).toMatchObject([{ bedId: 'G3' }]);
  });
  it('customer create conflicts when all 15 active beds are busy', async () => {
    const busy = Array.from({ length: 15 }, (_, i) => ({ bedId: `G${i + 1}` }));
    const { service } = setup([() => [{ id: 'KH1' }], () => [{ id: 'P1', duration: 60 }], () => busy]);
    await expect(service.createCustomer('TK1', { fullName: 'A', phone: '0900000001', date: '2026-11-13', time: '09:00', guests: [{ customerName: 'B', packageId: 'P1' }] })).rejects.toBeInstanceOf(ConflictException);
  });
  it('customer cannot reschedule or cancel a booking they do not own', async () => {
    const a = setup([() => []]);
    await expect(a.service.rescheduleMine('TK1', 'L9', '2026-11-13', '09:00')).rejects.toBeInstanceOf(NotFoundException);
    const b = setup([() => [{ result: 'missing' }]]);
    await expect(b.service.cancelMine('TK1', 'L9')).rejects.toBeInstanceOf(NotFoundException);
  });
  it('customer reschedule blocks non-editable status', async () => {
    const { service } = setup([() => [{ id: 'L1', status: 'Đã đến', pay: 'p', date: 'd' }]]);
    await expect(service.rescheduleMine('TK1', 'L1', '2026-11-13', '09:00')).rejects.toBeInstanceOf(ConflictException);
  });
  it('customer reschedule shifts details and excludes own booking from overlap', async () => {
    const { service, transactions } = setup([
      () => [{ id: 'L1', status: 'Chờ xác nhận', pay: 'p', date: '2026-11-12' }],
      () => [{ id: 'C1', bedId: 'G4', packageId: 'P1', startsAt: '2026-11-12T11:00:00', duration: 60 }],
      () => [],
    ]);
    await service.rescheduleMine('TK1', 'L1', '2026-11-14', '15:00');
    expect(transactions.reserve.mock.calls[0][0]).toMatchObject([{ bedId: 'G4', startsAt: '2026-11-14T15:00:00', endsAt: '2026-11-14T16:00:00' }]);
    expect(transactions.reserve.mock.calls[0][2]).toBe('L1');
  });
  it('cancel maps results to Vietnamese messages', async () => {
    for (const [result, text] of [['completed', 'đã hoàn thành'], ['cancelled', 'đã được hủy'], ['arrived', 'không thể hủy']]) {
      const { service } = setup([() => [{ result }]]);
      await expect(service.cancelMine('TK1', 'L1')).rejects.toThrow(text);
    }
    const ok = setup([() => [{ result: 'ok' }]]);
    await expect(ok.service.cancelMine('TK1', 'L1')).resolves.toEqual({ message: 'Hủy lịch hẹn thành công!' });
  });
});

describe('authorization metadata', () => {
  const reflector = new Reflector();
  it('staff routes require Q01, customer routes require Khách hàng', () => {
    expect(reflector.get('roles', BookingWriteController)).toEqual(['Nhân viên', 'Quản lý']);
    expect(reflector.get('permissions', BookingWriteController)).toEqual(['Q01']);
    expect(reflector.get('roles', MyBookingWriteController)).toEqual(['Khách hàng']);
  });
  it('RolesGuard denies a customer on staff routes', () => {
    const guard = new RolesGuard(reflector);
    const ctx = { getHandler: () => BookingWriteController.prototype.create, getClass: () => BookingWriteController, switchToHttp: () => ({ getRequest: () => ({ user: { role: 'Khách hàng', permissions: [] } }) }) };
    expect(() => guard.canActivate(ctx as never)).toThrow();
  });
});
