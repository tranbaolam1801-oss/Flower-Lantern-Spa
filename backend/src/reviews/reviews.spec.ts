import 'reflect-metadata';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CustomerReviewBody, ReplyBody, ReviewsController, toReviewItem } from './reviews.controller';
import { PERMISSIONS_KEY, ROLES_KEY } from '../auth/roles.decorator';

const make = (rows: unknown[][] = []) => {
  const query = jest.fn();
  rows.forEach(r => query.mockResolvedValueOnce(r));
  const transaction = jest.fn(async (work: (r: { query: typeof query }) => Promise<unknown>) => work({ query }));
  return { query, transaction, controller: new ReviewsController({ query, transaction } as never) };
};
const staff = { user: { sub: 'TK1', entityId: 'NV00000001' } } as never;
const customer = { user: { sub: 'TK2' } } as never;
const row = (extra = {}) => ({ id: 'DG1', bookingId: 'LH1', customerName: 'An', customerPhone: '0912345678', serviceName: 'Massage',
  packageName: null, rating: 5, comment: null, createdAt: '2026-11-01T10:00:00', replyId: null, replyContent: null, staffName: null, repliedAt: null, ...extra });

describe('reviews mapping and authorization', () => {
  it('derives status from the presence of a reply', () => {
    expect(toReviewItem(row())).toMatchObject({ status: 'Chưa phản hồi', reply: null, comment: '' });
    expect(toReviewItem(row({ replyId: 'PH1', replyContent: 'Cảm ơn', staffName: 'Lan' }))).toMatchObject({
      status: 'Đã phản hồi', reply: { id: 'PH1', content: 'Cảm ơn', staffName: 'Lan' },
    });
  });
  it('staff endpoints require Q03 and customer endpoint requires the customer role', () => {
    const proto = ReviewsController.prototype;
    for (const name of ['list', 'detail', 'reply'] as const) {
      expect(Reflect.getMetadata(ROLES_KEY, proto[name])).toEqual(['Nhân viên', 'Quản lý']);
      expect(Reflect.getMetadata(PERMISSIONS_KEY, proto[name])).toEqual(['Q03']);
    }
    expect(Reflect.getMetadata(ROLES_KEY, proto.reviewMyBooking)).toEqual(['Khách hàng']);
  });
  it('list paginates with hasNext', async () => {
    const rows = Array.from({ length: 21 }, (_, i) => row({ id: `DG${i}` }));
    const { controller } = make([[{ present: false }], rows]);
    const result = await controller.list({ q: '', status: '', page: 1 });
    expect(result.items).toHaveLength(20);
    expect(result.hasNext).toBe(true);
  });
  it('detail 404 when absent', async () => {
    await expect(make([[{ present: false }], []]).controller.detail({ id: 'DG9' })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('reply timestamp (NgayPhanHoi, migration 006)', () => {
  it('column absent: selects NULL, repliedAt is empty, no schema reference to the column', async () => {
    const { controller, query } = make([[{ present: false }], [row({ replyId: 'PH1', replyContent: 'Cảm ơn', staffName: 'Lan' })]]);
    const result = await controller.detail({ id: 'DG1' });
    expect(query.mock.calls[1][0]).not.toContain('NgayPhanHoi');
    expect(result.reply?.repliedAt).toBe('');
  });
  it('column present: selects it as UTC ISO and maps the value', async () => {
    const { controller, query } = make([[{ present: true }], [row({ replyId: 'PH1', replyContent: 'Cảm ơn', staffName: 'Lan', repliedAt: '2026-11-12T03:04:05Z' })]]);
    const result = await controller.detail({ id: 'DG1' });
    expect(query.mock.calls[1][0]).toContain("to_char(p.NgayPhanHoi,'YYYY-MM-DD\"T\"HH24:MI:SS')||'Z'");
    expect(result.reply?.repliedAt).toBe('2026-11-12T03:04:05Z');
  });
  it('column present but legacy NULL: repliedAt is empty, reply still returned', async () => {
    const { controller } = make([[{ present: true }], [row({ replyId: 'PH1', replyContent: 'Cảm ơn', staffName: 'Lan', repliedAt: null })]]);
    expect((await controller.detail({ id: 'DG1' })).reply).toMatchObject({ id: 'PH1', repliedAt: '' });
  });
  it('caches a present column and rechecks an absent one only after the interval', async () => {
    const { controller, query } = make([[{ present: true }], [row()], [row()]]);
    await controller.detail({ id: 'DG1' });
    await controller.detail({ id: 'DG1' });
    expect(query.mock.calls.filter(c => String(c[0]).includes('information_schema.columns'))).toHaveLength(1);
    const absent = make([[{ present: false }], [row()], [row()]]);
    await absent.controller.detail({ id: 'DG1' });
    await absent.controller.detail({ id: 'DG1' });
    expect(absent.query.mock.calls.filter(c => String(c[0]).includes('information_schema.columns'))).toHaveLength(1);
  });
});

describe('reply', () => {
  it('rejects empty/whitespace content at DTO validation', async () => {
    expect((await validate(plainToInstance(ReplyBody, { content: '   ' }))).length).toBeGreaterThan(0);
    expect((await validate(plainToInstance(ReplyBody, { content: 'Cảm ơn' }))).length).toBe(0);
  });
  it('stores reply tied to the authenticated employee inside one transaction', async () => {
    const { controller, query, transaction } = make([[{ found: 1 }], [], [], [{ id: 'PH00000001' }], []]);
    await controller.reply({ id: 'DG1' }, { content: 'Cảm ơn' }, staff);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[4][1]).toEqual(['PH00000001', 'DG1', 'NV00000001', 'Cảm ơn']);
  });
  it('403 when account has no employee profile; 404 missing; 409 already replied', async () => {
    await expect(make().controller.reply({ id: 'DG1' }, { content: 'x' }, { user: { sub: 'TK1' } } as never)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(make([[]]).controller.reply({ id: 'DG1' }, { content: 'x' }, staff)).rejects.toBeInstanceOf(NotFoundException);
    await expect(make([[{ found: 1 }], [{ found: 1 }]]).controller.reply({ id: 'DG1' }, { content: 'x' }, staff)).rejects.toBeInstanceOf(ConflictException);
  });
  it('a unique violation on the reply insert (race) is reported as already replied', async () => {
    const { controller, query } = make([[{ found: 1 }], [], [], [{ id: 'PH00000001' }]]);
    query.mockRejectedValueOnce(Object.assign(new Error('dup'), { driverError: { code: '23505' } }));
    await expect(controller.reply({ id: 'DG1' }, { content: 'x' }, staff)).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('customer review of own booking', () => {
  it('validates rating range 1-5', async () => {
    for (const rating of [0, 6, 2.5]) expect((await validate(plainToInstance(CustomerReviewBody, { rating }))).length).toBeGreaterThan(0);
    expect((await validate(plainToInstance(CustomerReviewBody, { rating: 5, comment: 'Tốt' }))).length).toBe(0);
  });
  it('scopes by the authenticated account, never a client-supplied customer', async () => {
    const { controller, query } = make([[{ customer: 'KH1', status: 'Hoàn thành' }], [], [{ service: 'DV1' }], [], [{ id: 'DG00000001' }], []]);
    await expect(controller.reviewMyBooking({ id: 'LH1' }, { rating: 4, comment: 'Tốt' }, customer)).resolves.toMatchObject({ id: 'DG00000001' });
    expect(query.mock.calls[0][1]).toEqual(['LH1', 'TK2']);
    expect(query.mock.calls[5][1]).toEqual(['DG00000001', 'LH1', 'KH1', 'DV1', 4, 'Tốt']);
  });
  it('404 for not-owned/missing, 409 for not completed and for duplicate review', async () => {
    const body = { rating: 5, comment: '' };
    await expect(make([[]]).controller.reviewMyBooking({ id: 'LH1' }, body, customer)).rejects.toBeInstanceOf(NotFoundException);
    await expect(make([[{ customer: 'KH1', status: 'Chưa đến' }]]).controller.reviewMyBooking({ id: 'LH1' }, body, customer)).rejects.toBeInstanceOf(ConflictException);
    await expect(make([[{ customer: 'KH1', status: 'Hoàn thành' }], [{ found: 1 }]]).controller.reviewMyBooking({ id: 'LH1' }, body, customer)).rejects.toBeInstanceOf(ConflictException);
    await expect(make([[{ customer: 'KH1', status: 'Hoàn thành' }], [], []]).controller.reviewMyBooking({ id: 'LH1' }, body, customer)).rejects.toBeInstanceOf(ConflictException);
  });
});
