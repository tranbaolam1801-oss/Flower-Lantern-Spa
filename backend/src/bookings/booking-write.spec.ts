import 'reflect-metadata';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../auth/roles.guard';
import { BookingWriteService } from './booking-write.service';
import { BookingWriteController, MyBookingWriteController } from './booking-write.controller';
import { CreateAdminBookingDto, UpdateAdminBookingDto } from './booking-write.dto';
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
  const query = jest.fn(async (sql: string, p: unknown[]) => { const r = responses.shift(); return r ? r(sql, p) : []; });
  // Status changes run in a transaction (notification jobs commit with the booking); the double reuses the same scripted responses.
  const database = { query, transaction: jest.fn(async (work: (runner: { query: typeof query }) => unknown) => work({ query })) };
  const transactions = { reserve: jest.fn(async (...args: [unknown, (r: unknown) => unknown, string?]) => args[1]({ query: jest.fn(async (sql: string) => (sql.includes('FOR UPDATE') ? [{ status: 'Chờ xác nhận', pay: 'Chưa thanh toán' }] : [])) })) };
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
    expect(database.query.mock.calls[1][1]).toEqual(['L1', 'Chờ xác nhận', 'Đã xác nhận', 'Chưa thanh toán', 0, null, 'Chưa thanh toán', null, null, 0, null]);
  });
  it('status-only update reports stale concurrent change', async () => {
    const { service } = setup([() => [{ id: 'L1', status: 'Chờ xác nhận', pay: 'p', date: 'd' }], () => []]);
    await expect(service.updateAdmin('L1', { status: 'Đã xác nhận' })).rejects.toThrow('vừa được cập nhật');
  });
  it('status update is guarded by the payment status that was read (lost-update protection)', async () => {
    const { service, database } = setup([() => [{ id: 'L1', status: 'Chờ xác nhận', pay: 'Chưa thanh toán', date: 'd' }], () => []]);
    await expect(service.updateAdmin('L1', { status: 'Đã xác nhận' })).rejects.toThrow('vừa được cập nhật');
    expect(String(database.query.mock.calls[1][0])).toContain('AND TrangThaiThanhToan=$7::text');
  });
  it('manual payment status change is rejected when payment transactions exist', async () => {
    const { service, database } = setup([() => [{ id: 'L1', status: 'Chờ xác nhận', pay: 'Chưa thanh toán', date: 'd' }], () => [{ found: 1 }]]);
    await expect(service.updateAdmin('L1', { paymentStatus: 'Đã thanh toán' })).rejects.toThrow('không thể sửa thủ công');
    expect(database.query).toHaveBeenCalledTimes(2);
  });
  it('manual payment status change is allowed when no payment transactions exist', async () => {
    const { service, database } = setup([() => [{ id: 'L1', status: 'Chờ xác nhận', pay: 'Chưa thanh toán', date: 'd' }], () => [], () => [{ MaLichHen: 'L1' }]]);
    await service.updateAdmin('L1', { paymentStatus: 'Đã thanh toán' });
    expect(database.query.mock.calls[2][1]).toEqual(['L1', 'Chờ xác nhận', 'Chờ xác nhận', 'Đã thanh toán', 0, null, 'Chưa thanh toán', null, null, 0, null]);
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
  it('customer cannot reschedule a booking they do not own', async () => {
    const a = setup([() => []]);
    await expect(a.service.rescheduleMine('TK1', 'L9', '2026-11-13', '09:00')).rejects.toBeInstanceOf(NotFoundException);
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
  function cancelSetup(status?: string) {
    const calls: [string, unknown[]][] = [];
    const runner = { query: jest.fn(async (sql: string, p: unknown[]) => { calls.push([sql, p]); return sql.includes('FROM dbo.LichHen') ? (status ? [{ status }] : []) : []; }) };
    const database = { transaction: jest.fn(async (work: (r: unknown) => unknown) => work(runner)) };
    return { service: new BookingWriteService(database as never, {} as never), calls };
  }
  it('cancel maps results to Vietnamese messages and locks beds before the booking row', async () => {
    await expect(cancelSetup().service.cancelMine('TK1', 'L9')).rejects.toBeInstanceOf(NotFoundException);
    for (const [status, text] of [['Hoàn thành', 'đã hoàn thành'], ['Đã hủy', 'đã được hủy'], ['Đã đến', 'không thể hủy']]) {
      await expect(cancelSetup(status).service.cancelMine('TK1', 'L1')).rejects.toThrow(text);
    }
    const ok = cancelSetup('Chờ xác nhận');
    await expect(ok.service.cancelMine('TK1', 'L1')).resolves.toEqual({ message: 'Hủy lịch hẹn thành công!' });
    expect(ok.calls[0][0]).toContain('FROM dbo.KhachSuDungDichVu');
    expect(ok.calls[1][0]).toContain('FOR UPDATE OF l');
    expect(ok.calls[1][1]).toEqual(['L1', 'TK1']);
    expect(ok.calls[2][0]).toContain('UPDATE dbo.LichHen');
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

  it('booker fields are validated like create (phone normalised, bad email rejected, empty email allowed)', async () => {
    const ok = plainToInstance(UpdateAdminBookingDto, { bookerName: 'A', bookerPhone: '+84900000001', bookerEmail: '', notes: '' });
    expect(await validate(ok)).toHaveLength(0);
    expect(ok.bookerPhone).toBe('0900000001');
    expect((await validate(plainToInstance(UpdateAdminBookingDto, { bookerPhone: '123' }))).length).toBeGreaterThan(0);
    expect((await validate(plainToInstance(UpdateAdminBookingDto, { bookerEmail: 'nope' }))).length).toBeGreaterThan(0);
  });
  it('booker-only update is one guarded statement carrying the booker values', async () => {
    const { service, database } = setup([() => [{ id: 'L1', status: 'Chờ xác nhận', pay: 'Chưa thanh toán', date: 'd' }], () => [{ MaLichHen: 'L1' }]]);
    await service.updateAdmin('L1', { bookerName: ' Mai ', bookerPhone: '0912345678', bookerEmail: '' });
    expect(database.query.mock.calls[1][1]).toEqual(['L1', 'Chờ xác nhận', 'Chờ xác nhận', 'Chưa thanh toán', 0, null, 'Chưa thanh toán', 'Mai', '0912345678', 1, null]);
  });
  it('booker edits are still rejected for completed or cancelled bookings', async () => {
    for (const status of ['Hoàn thành', 'Đã hủy']) {
      const { service } = setup([() => [{ id: 'L1', status, pay: 'p', date: 'd' }]]);
      await expect(service.updateAdmin('L1', { bookerName: 'X' })).rejects.toBeInstanceOf(ConflictException);
    }
  });
  it('empty notes clear the column; undefined keeps it', async () => {
    const a = setup([() => [{ id: 'L1', status: 'Chờ xác nhận', pay: 'p', date: 'd' }], () => [{ MaLichHen: 'L1' }]]);
    await a.service.updateAdmin('L1', { notes: '' });
    expect(a.database.query.mock.calls[1][1].slice(4, 6)).toEqual([1, null]);
    const b = setup([() => [{ id: 'L1', status: 'Chờ xác nhận', pay: 'p', date: 'd' }], () => [{ MaLichHen: 'L1' }]]);
    await b.service.updateAdmin('L1', { notes: 'Dị ứng' });
    expect(b.database.query.mock.calls[1][1].slice(4, 6)).toEqual([1, 'Dị ứng']);
  });
  it('search keeps the q/date/status contract and parameterises the 9 Figma filters', async () => {
    const { service, database } = setup([() => []]);
    const out = await service.search({ q: 'lan', date: '2026-11-12', status: 'Chưa đến', name: 'Mai%', phone: '0912 345', email: 'a@b', code: 'LH1', service: 'Da', source: 'Zalo', dateFrom: '2026-11-01', dateTo: '2026-11-30' });
    const [sql, params] = database.query.mock.calls[0];
    expect(String(sql)).toContain('LIMIT 200');
    expect(String(sql)).not.toContain('Mai');
    expect(params).toEqual(['2026-11-12', 'Chưa đến', '%lan%', '%Mai~%%', '%0912345%', '%a@b%', '%LH1%', '%Da%', '2026-11-01', '2026-11-30']);
    expect(out.warnings).toHaveLength(1);
  });
  it('search with no filters passes nulls and no warnings', async () => {
    const { service, database } = setup([() => []]);
    const out = await service.search({});
    expect(database.query.mock.calls[0][1]).toEqual([null, null, null, null, null, null, null, null, null, null]);
    expect(out.warnings).toEqual([]);
  });
  it('create returns honest warnings when prepaid amount or source cannot be stored', async () => {
    const { service } = setup([() => [{ id: 'P1', duration: 60 }]]);
    const out = await service.createAdmin({ bookerName: 'A', bookerPhone: '0900000001', date: '2026-11-20', prepaidAmount: 100000, source: 'Zalo', guests: [{ customerName: 'B', bedId: 'G1', packageId: 'P1', startsAt: '2026-11-20T09:00:00' }] });
    expect(out.warnings).toHaveLength(2);
    const none = await setup([() => [{ id: 'P1', duration: 60 }]]).service.createAdmin({ bookerName: 'A', bookerPhone: '0900000001', date: '2026-11-20', guests: [{ customerName: 'B', bedId: 'G1', packageId: 'P1', startsAt: '2026-11-20T09:00:00' }] });
    expect(none.warnings).toEqual([]);
  });
});
