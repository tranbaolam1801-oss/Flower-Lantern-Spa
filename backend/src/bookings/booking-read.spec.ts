import { BookingReadController } from './booking-read.controller';

describe('BookingReadController.calendar (mock)', () => {
  it('returns packageId and guest phone so the UC_2.3 modal can resend every guest unchanged', async () => {
    const sql: string[] = [];
    const database = {
      query: jest.fn(async (text: string) => {
        sql.push(text);
        return [];
      }),
    };
    const controller = new BookingReadController(database as never);
    await controller.calendar({ date: '2026-11-12' } as never);
    const itemsSql = sql.find((text) => text.includes('KhachSuDungDichVu')) ?? '';
    expect(itemsSql).toContain('RTRIM(g.MaGoi) AS "packageId"');
    expect(itemsSql).toContain('RTRIM(c.SoDienThoai) AS "customerPhone"');
  });
});
