import 'reflect-metadata';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { CustomerWriteController } from './customer-write.controller';
import { normalizePhone, validateCustomer } from './customer-validation';
import { PERMISSIONS_KEY, ROLES_KEY } from '../auth/roles.decorator';

const make = (rows: unknown[][] = []) => {
  const query = jest.fn();
  rows.forEach(r => query.mockResolvedValueOnce(r));
  return { query, controller: new CustomerWriteController({ query } as never) };
};

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
    const { controller, query } = make([[{ result: 'ok', id: 'KH00000009' }]]);
    await expect(controller.create({ name: 'An', phone: '+84912345678', gender: 'Nữ' })).resolves.toMatchObject({ id: 'KH00000009' });
    expect(query.mock.calls[0][1].slice(0, 4)).toEqual(['0912345678', 'An', null, 'Nữ']);
  });
  it('rejects a duplicate phone with 409 and the approved message', async () => {
    const { controller } = make([[{ result: 'duplicate', id: null }]]);
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
    await expect(make([[{ result: 'missing' }]]).controller.update('KH1', { name: 'An', phone: '0912345678' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(make([[{ result: 'duplicate' }]]).controller.update('KH1', { name: 'An', phone: '0912345678' })).rejects.toBeInstanceOf(ConflictException);
    await expect(make([[{ result: 'ok' }]]).controller.update('KH1', { name: 'An', phone: '0912345678' })).resolves.toMatchObject({ id: 'KH1' });
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
