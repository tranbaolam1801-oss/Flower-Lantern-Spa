import { BadRequestException, ConflictException } from '@nestjs/common';
import { Allow } from 'class-validator';
import { normalizeVnPhone } from '../common/phone';

export class CustomerWriteBody {
  @Allow() name?: unknown;
  @Allow() phone?: unknown;
  @Allow() channel?: unknown;
  @Allow() gender?: unknown;
  @Allow() birthDate?: unknown;
  @Allow() address?: unknown;
  @Allow() notes?: unknown;
}

export interface CustomerValues {
  name: string; phone: string; channel: string | null; gender: string | null;
  birthDate: string | null; address: string | null; notes: string | null;
}

export const DUPLICATE_CUSTOMER_MESSAGE = 'Khách hàng đã tồn tại!';
export const CUSTOMER_ID = /^[A-Za-z0-9]{1,10}$/;

export const normalizePhone = normalizeVnPhone;

export function validateCustomer(body: CustomerWriteBody, today = new Date()): CustomerValues {
  const fields: Record<string, string> = {};
  const optional = (value: unknown, key: string, max: number) => {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string') { fields[key] = 'Dữ liệu không hợp lệ!'; return null; }
    const text = value.trim().replace(/\s+/g, ' ');
    if (text.length > max) fields[key] = `Tối đa ${max} ký tự!`;
    return text === '' ? null : text;
  };
  const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
  if (!name) fields.name = 'Không được để trống!';
  else if (name.length > 50) fields.name = 'Tối đa 50 ký tự!';
  const phoneRaw = typeof body.phone === 'string' ? body.phone.trim() : '';
  const phone = normalizePhone(body.phone);
  if (!phoneRaw) fields.phone = 'Không được để trống!';
  else if (!phone) fields.phone = 'Số điện thoại không hợp lệ!';
  const channel = optional(body.channel, 'channel', 50);
  const gender = optional(body.gender, 'gender', 10);
  const address = optional(body.address, 'address', 255);
  const notes = optional(body.notes, 'notes', 500);
  let birthDate: string | null = null;
  if (body.birthDate !== undefined && body.birthDate !== null && body.birthDate !== '') {
    const text = body.birthDate;
    const valid = typeof text === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(text)
      && new Date(`${text}T00:00:00Z`).toISOString().startsWith(text);
    if (!valid) fields.birthDate = 'Ngày sinh không hợp lệ!';
    else if ((text as string) >= today.toISOString().slice(0, 10)) fields.birthDate = 'Ngày sinh phải nhỏ hơn ngày hiện tại!';
    else birthDate = text as string;
  }
  if (Object.keys(fields).length) {
    throw new BadRequestException({ message: 'Dữ liệu không hợp lệ!', code: 'VALIDATION_ERROR', fields });
  }
  return { name, phone: phone as string, channel, gender, birthDate, address, notes };
}

export const duplicatePhoneError = () => new ConflictException({
  message: DUPLICATE_CUSTOMER_MESSAGE, code: 'DUPLICATE_PHONE', fields: { phone: DUPLICATE_CUSTOMER_MESSAGE },
});
