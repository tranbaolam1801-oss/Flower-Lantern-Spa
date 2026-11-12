import { BadRequestException } from '@nestjs/common';

export const OPEN_MINUTE = 8 * 60;
export const CLOSE_MINUTE = 22 * 60;
export const ACTIVE_BED = /^G([1-9]|1[0-5])$/;
export const ACTIVE_BEDS = Array.from({ length: 15 }, (_, i) => `G${i + 1}`);
export const LOCAL_DATETIME = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/;
export const PHONE = /^0\d{9}$/;

export const BOOKING_STATUSES = ['Chờ xác nhận', 'Đã xác nhận', 'Chưa đến', 'Đã đến', 'Hoàn thành', 'Đã hủy'] as const;
export const PAYMENT_STATUSES = ['Chưa thanh toán', 'Thanh toán một phần', 'Đã thanh toán'] as const;
export const LOCKED_STATUSES: readonly string[] = ['Hoàn thành', 'Đã hủy'];
export const CUSTOMER_EDITABLE_STATUSES: readonly string[] = ['Chờ xác nhận', 'Đã xác nhận', 'Chưa đến'];
export const STATUS_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  'Chờ xác nhận': ['Đã xác nhận', 'Chưa đến', 'Đã hủy'],
  'Đã xác nhận': ['Chưa đến', 'Đã đến', 'Đã hủy'],
  'Chưa đến': ['Đã xác nhận', 'Đã đến', 'Đã hủy'],
  'Đã đến': ['Hoàn thành', 'Đã hủy'],
  'Hoàn thành': [],
  'Đã hủy': [],
};

export const MESSAGES = {
  past: 'Không thể đặt lịch vào thời gian trong quá khứ!',
  hours: 'Giờ kết thúc dịch vụ phải nằm trong khung giờ 08:00 – 22:00!',
  package: 'Vui lòng chọn dịch vụ và gói dịch vụ!',
  guest: 'Vui lòng nhập thông tin khách sử dụng dịch vụ!',
  bed: 'Giường không hợp lệ hoặc không còn hoạt động.',
  date: 'Ngày hẹn không hợp lệ!',
  conflict: 'Giường đã có lịch tại khung giờ này. Vui lòng chọn giường hoặc thời gian khác!',
  completed: 'Không thể chỉnh sửa lịch hẹn đã hoàn thành!',
  cancelled: 'Không thể chỉnh sửa lịch hẹn đã hủy!',
  transition: 'Trạng thái lịch hẹn không thể chuyển đổi theo yêu cầu!',
  notFound: 'Không tìm thấy lịch hẹn.',
  save: 'Không thể lưu lịch hẹn. Vui lòng thử lại sau!',
} as const;

export function canTransition(from: string, to: string) {
  return from === to || (STATUS_TRANSITIONS[from] ?? []).includes(to);
}

export function vietnamNow(now = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false, dateStyle: 'short', timeStyle: 'medium' })
    .format(now).replace(' ', 'T');
}

export function addMinutes(local: string, minutes: number) {
  return new Date(Date.parse(local + 'Z') + minutes * 60000).toISOString().slice(0, 19);
}

export function minuteOfDay(local: string) {
  return Number(local.slice(11, 13)) * 60 + Number(local.slice(14, 16));
}

export function validDate(value: string) {
  const time = Date.parse(value + 'T00:00:00Z');
  return /^\d{4}-\d\d-\d\d$/.test(value) && Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

/** Returns the service end time or throws the Vietnamese rule violation. */
export function checkSlot(startsAt: string, durationMinutes: number, now = vietnamNow()) {
  if (!LOCAL_DATETIME.test(startsAt) || !validDate(startsAt.slice(0, 10)) || Number.isNaN(Date.parse(startsAt + 'Z'))) throw new BadRequestException(MESSAGES.date);
  if (startsAt < now) throw new BadRequestException(MESSAGES.past);
  const endsAt = addMinutes(startsAt, durationMinutes);
  if (endsAt.slice(0, 10) !== startsAt.slice(0, 10) || minuteOfDay(startsAt) < OPEN_MINUTE || minuteOfDay(endsAt) > CLOSE_MINUTE) throw new BadRequestException(MESSAGES.hours);
  return endsAt;
}
