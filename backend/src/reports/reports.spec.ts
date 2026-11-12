import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { aggregateRevenue, bucketOf, INVALID_RANGE, ReportsService, validateRange } from './reports.service';

describe('report range validation', () => {
  it.each([['2026-11-10', '2026-11-01'], ['2026-13-01', '2026-13-02'], ['abc', '2026-11-01'], ['2026-02-30', '2026-03-01'], ['2000-01-01', '2026-01-01']])('rejects %s..%s', (a, b) => {
    expect(() => validateRange(a, b)).toThrow(INVALID_RANGE);
  });
  it('accepts valid and equal ranges', () => {
    expect(() => validateRange('2026-11-01', '2026-11-01')).not.toThrow();
    expect(() => validateRange('2026-01-01', '2026-11-12')).not.toThrow();
  });
});

describe('revenue aggregation', () => {
  const days = [{ day: '2026-11-02', amount: 100 }, { day: '2026-11-08', amount: 50 }, { day: '2026-11-09', amount: 25 }, { day: '2026-12-01', amount: 10 }, { day: '2026-11-03', amount: 0 }, { day: '2026-11-04', amount: -5 }];
  it('groups by day, skipping non-positive net', () => {
    const r = aggregateRevenue(days, 'day');
    expect(r.totalRevenue).toBe(185);
    expect(r.series.map((s) => s.label)).toEqual(['02/11/2026', '08/11/2026', '09/11/2026', '01/12/2026']);
  });
  it('groups by Monday-start week', () => {
    const r = aggregateRevenue(days, 'week');
    expect(r.series).toEqual([{ label: 'Tuần 02/11/2026', amount: 150 }, { label: 'Tuần 09/11/2026', amount: 25 }, { label: 'Tuần 30/11/2026', amount: 10 }]);
  });
  it('groups by month and year', () => {
    expect(aggregateRevenue(days, 'month').series).toEqual([{ label: '11/2026', amount: 175 }, { label: '12/2026', amount: 10 }]);
    expect(aggregateRevenue(days, 'year').series).toEqual([{ label: '2026', amount: 185 }]);
  });
  it('empty input gives empty series', () => expect(aggregateRevenue([], 'day')).toEqual({ totalRevenue: 0, series: [] }));
  it('week bucket of a Sunday is the previous Monday', () => expect(bucketOf('2026-11-08', 'week').key).toBe('2026-11-02'));
});

describe('ReportsService', () => {
  it('services: totals all, returns top 10, uses parameters', async () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ serviceId: `S${i}`, serviceName: `N${i}`, usageCount: 12 - i }));
    const db = { query: jest.fn().mockResolvedValue(rows) };
    const r = await new ReportsService(db as never).services('2026-11-01', '2026-11-30');
    expect(r.totalUsage).toBe(78);
    expect(r.items).toHaveLength(10);
    expect(db.query.mock.calls[0][1]).toEqual(['2026-11-01', '2026-11-30']);
  });
  it('customers maps counts and top list', async () => {
    const db = { query: jest.fn().mockResolvedValueOnce([{ newCustomers: 3, returningCustomers: 2 }]).mockResolvedValueOnce([{ customerId: 'K1', fullName: 'A', phone: '0900000000', bookingCount: 4 }]) };
    expect(await new ReportsService(db as never).customers('2026-11-01', '2026-11-30')).toEqual({ newCustomers: 3, returningCustomers: 2, topCustomers: [{ customerId: 'K1', fullName: 'A', phone: '0900000000', bookingCount: 4 }] });
  });
  it('revenue rejects invalid range before querying', async () => {
    const db = { query: jest.fn() };
    await expect(new ReportsService(db as never).revenue('2026-11-10', '2026-11-01', 'day')).rejects.toBeInstanceOf(BadRequestException);
    expect(db.query).not.toHaveBeenCalled();
  });
  it('revenue excludes MOCK payments only when NhaCungCap exists', async () => {
    const withCol = { query: jest.fn().mockResolvedValueOnce([{ present: true }]).mockResolvedValueOnce([]) };
    await new ReportsService(withCol as never).revenue('2026-11-01', '2026-11-30', 'day');
    expect(String(withCol.query.mock.calls[1][0])).toContain("COALESCE(NhaCungCap,'')<>'MOCK'");
    const without = { query: jest.fn().mockResolvedValueOnce([{ present: false }]).mockResolvedValueOnce([]) };
    await new ReportsService(without as never).revenue('2026-11-01', '2026-11-30', 'day');
    expect(String(without.query.mock.calls[1][0])).not.toContain('MOCK');
  });
  it('revenue aggregates SQL day rows', async () => {
    const db = { query: jest.fn().mockResolvedValueOnce([{ present: false }]).mockResolvedValue([{ day: '2026-11-02', amount: '120.50' }]) };
    expect(await new ReportsService(db as never).revenue('2026-11-01', '2026-11-30', 'month')).toEqual({ totalRevenue: 120.5, series: [{ label: '11/2026', amount: 120.5 }] });
  });
});
