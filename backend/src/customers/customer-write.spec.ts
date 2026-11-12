import 'reflect-metadata';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { CustomerWriteController } from './customer-write.controller';
import { normalizePhone, validateCustomer } from './customer-validation';
import { PERMISSIONS_KEY, ROLES_KEY } from '../auth/roles.decorator';

const make = (rows: unknown[][] = []) => {
  const query = jest.fn();
  rows.forEach(r => query.mockResolvedValueOnce(r));
  // transaction() runs the callback on the same mocked runner (commit/rollback is covered by the pg specs).
  const transaction = jest.fn(async (work: (r: { query: jest.Mock }) => Promise<unknown>) => work({ query }));
  return { query, controller: new CustomerWriteController({ query, transaction } as never) };
};
const sqlOf = (query: jest.Mock) => query.mock.calls.map(c => String(c[0]));

describe('customer validation', () => {
  it('normalizes Vietnamese phones to CHAR(10) form', () => {
    expect(normalizePhone(' 0912345678 ')).toBe('0912345678');
    expect(normalizePhone('0912 345 678')).toBeNull();
    expect(normalizePhone('+84912345678')).toBe('0912345678');
    expect(normalizePhone('12345')).toBeNull();
    expect(normalizePhone('09123456789')).toBeNull();
    expect(normalizePhone('0912abc678')).toBeNull();
  });
  it('returns field-level errors', () => {
    try { validateCustomer({ name: '  ', phone: '123', birthDate: '2999-01-01' }); fail('should throw'); }
    catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      expect((e as BadRequestException).getResponse()).toMatchObject({
        code: 'VALIDATION_ERROR',
        fields: { name: 'Không được để trống!', phone: 'Số điện thoại không hợp lệ!', birthDate: expect.any(String) },
      });
    }
  });
  it('trims and collapses whitespace, empties optional fields to null', () => {
    expect(validateCustomer({ name: '  Nguyễn   An ', phone: '+84912345678', notes: '  ' })).toMatchObject({
      name: 'Nguyễn An', phone: '0912345678', notes: null, channel: null,
    });
  });
});

describe('CustomerWriteController', () => {
  it('is restricted to staff with Q02 and exposes no delete route', () => {
    expect(Reflect.getMetadata(ROLES_KEY, CustomerWriteController)).toEqual(['Nhân viên', 'Quản lý']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, CustomerWriteController)).toEqual(['Q02']);
    expect((CustomerWriteController.prototype as unknown as Record<string, unknown>).delete).toBeUndefined();
    expect((CustomerWriteController.prototype as unknown as Record<string, unknown>).remove).toBeUndefined();
  });
  it('creates a customer with normalized phone and parameterized values', async () => {
    // advisory lock, duplicate check, next id, insert
    const { controller, query } = make([[], [], [{ id: 'KH00000009' }], []]);
    await expect(controller.create({ name: 'An', phone: '+84912345678', gender: 'Nữ' })).resolves.toMatchObject({ id: 'KH00000009' });
    const insert = query.mock.calls.find(c => String(c[0]).includes('INSERT INTO dbo.KhachHang'))!;
    expect(insert[1].slice(0, 5)).toEqual(['KH00000009', 'An', '0912345678', null, 'Nữ']);
  });
  it('rejects a duplicate phone with 409 and the approved message', async () => {
    const { controller } = make([[], [{ one: 1 }]]);
    const error = await controller.create({ name: 'An', phone: '0912345678' }).catch(e => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toMatchObject({ message: 'Khách hàng đã tồn tại!', code: 'DUPLICATE_PHONE', fields: { phone: 'Khách hàng đã tồn tại!' } });
  });
  it('does not touch the database when validation fails', async () => {
    const { controller, query } = make();
    await expect(controller.create({ name: '', phone: '' })).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });
  it('update: 404 for missing, 409 for duplicate, success otherwise', async () => {
    const body = { name: 'An', phone: '0912345678' };
    await expect(make([[]]).controller.update('KH1', body)).rejects.toBeInstanceOf(NotFoundException);
    // row lock, advisory lock, duplicate check -> duplicate
    await expect(make([[{ account: null }], [], [{ one: 1 }]]).controller.update('KH1', body)).rejects.toBeInstanceOf(ConflictException);
    await expect(make([[{ account: null }], [], [], []]).controller.update('KH1', body)).resolves.toMatchObject({ id: 'KH1' });
  });
  it('update syncs the linked TaiKhoan phone in the same transaction and rejects account-phone duplicates', async () => {
    // row lock, advisory lock, customer dup check (none), account dup check (none), 2 updates
    const { controller, query } = make([[{ account: 'TK00000001' }], [], [], [], [], []]);
    await controller.update('KH1', { name: 'An', phone: '0912345678' });
    const sqls = sqlOf(query);
    const sync = sqls.findIndex(q => q.includes('UPDATE dbo.TaiKhoan SET SoDienThoai=$1 WHERE MaTaiKhoan=$2'));
    expect(sync).toBeGreaterThan(-1);
    expect(sqls.findIndex(q => q.includes('UPDATE dbo.KhachHang'))).toBeLessThan(sync);
    expect(query.mock.calls[sync][1]).toEqual(['0912345678', 'TK00000001']);
    const error = await make([[{ account: 'TK00000001' }], [], [], [{ one: 1 }]]).controller.update('KH1', { name: 'An', phone: '0912345678' }).catch(e => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toMatchObject({ code: 'DUPLICATE_ACCOUNT_PHONE', fields: { phone: expect.stringContaining('tài khoản') } });
  });
  it('rejects malformed ids without querying', async () => {
    const { controller, query } = make();
    await expect(controller.detail("x'; DROP")).rejects.toBeInstanceOf(NotFoundException);
    expect(query).not.toHaveBeenCalled();
  });
  it('detail returns recentBookings with empty summary fallback; 404 when absent', async () => {
    const found = make([[{ id: 'KH1', name: 'An' }], [{ id: 'LH1', date: '2026-11-01', time: '09:00', status: 'Hoàn thành', serviceSummary: null }]]);
    await expect(found.controller.detail('KH1')).resolves.toMatchObject({ id: 'KH1', recentBookings: [{ id: 'LH1', serviceSummary: '' }] });
    await expect(make([[]]).controller.detail('KH2')).rejects.toBeInstanceOf(NotFoundException);
  });
});
