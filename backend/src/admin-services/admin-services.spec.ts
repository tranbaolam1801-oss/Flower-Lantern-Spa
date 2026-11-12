import 'reflect-metadata';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { AdminServiceWriteDto, isSafeImage } from './admin-services.dto';
import { AdminServicesService, MSG } from './admin-services.service';
import { AdminServicesController } from './admin-services.controller';
import { ReportsController } from '../reports/reports.controller';
import { ROLES_KEY, PERMISSIONS_KEY } from '../auth/roles.decorator';

const base = { name: ' Massage ', categoryId: 'DM01', status: 'Hoạt động', packages: [{ name: 'Gói 60', durationMinutes: 60, price: 300000 }] };
const errs = (o: object) => validateSync(plainToInstance(AdminServiceWriteDto, o), { whitelist: true, forbidNonWhitelisted: true });

function makeService(handler: (sql: string, p: unknown[]) => unknown[]) {
  const runner = {
    isTransactionActive: true, connect: jest.fn(), startTransaction: jest.fn(), release: jest.fn(),
    commitTransaction: jest.fn(), rollbackTransaction: jest.fn(),
    query: jest.fn(async (sql: string, p: unknown[] = []) => handler(sql, p)),
  };
  const db = { getDataSource: async () => ({ createQueryRunner: () => runner }), query: jest.fn() };
  return { svc: new AdminServicesService(db as never), runner };
}

describe('admin services DTO', () => {
  it('accepts a valid payload and trims name', () => {
    const o = plainToInstance(AdminServiceWriteDto, base);
    expect(validateSync(o)).toHaveLength(0);
    expect(o.name).toBe('Massage');
  });
  it.each([
    [{ ...base, name: '  ' }], [{ ...base, categoryId: 'x y' }], [{ ...base, removePackageIds: ['a b'] }], [{ ...base, removePackageIds: Array(21).fill('G1') }],
    [{ ...base, packages: [{ name: 'a', durationMinutes: 0, price: 1 }] }],
    [{ ...base, packages: [{ name: 'a', durationMinutes: 10, price: -1 }] }],
    [{ ...base, status: 'Khác' }], [{ ...base, extra: 1 }],
  ])('rejects invalid payload %#', (o) => expect(errs(o).length).toBeGreaterThan(0));
  it('image safety', () => {
    expect(isSafeImage('/assets/a.png')).toBe(true);
    expect(isSafeImage('https://cdn.example.com/a.png')).toBe(true);
    for (const bad of ['javascript:alert(1)', 'data:image/png;base64,xx', '//evil.com/a.png', '/a/../b', 'http://x.com/a.png', 'a.png', '/a b.png'])
      expect(isSafeImage(bad)).toBe(false);
  });
});

describe('AdminServicesService', () => {
  it('create: duplicate name -> 409 and rollback', async () => {
    const { svc, runner } = makeService((sql) => (sql.includes('DanhMuc') ? [{ x: 1 }] : sql.includes('TenDichVu COLLATE') ? [{ x: 1 }] : []));
    await expect(svc.create(plainToInstance(AdminServiceWriteDto, base))).rejects.toThrow(MSG.duplicate);
    expect(runner.rollbackTransaction).toHaveBeenCalled();
    expect(runner.commitTransaction).not.toHaveBeenCalled();
  });
  it('create: generates ids and commits service + packages', async () => {
    const { svc, runner } = makeService((sql) => (sql.includes('DanhMuc') ? [{ x: 1 }] : sql.includes('MAX(') ? [{ n: 4 }] : []));
    const res = await svc.create(plainToInstance(AdminServiceWriteDto, base));
    expect(res.id).toBe('DV00000005');
    expect(runner.query.mock.calls.filter((c) => String(c[0]).startsWith('INSERT'))).toHaveLength(2);
    expect(runner.commitTransaction).toHaveBeenCalled();
  });
  it('create: unsafe image -> 400 before any DB work', async () => {
    const { svc, runner } = makeService(() => []);
    await expect(svc.create(plainToInstance(AdminServiceWriteDto, { ...base, image: 'javascript:x' }))).rejects.toThrow(MSG.image);
    expect(runner.connect).not.toHaveBeenCalled();
  });
  it('update: 404 when missing', async () => {
    const { svc } = makeService(() => []);
    await expect(svc.update('DV1', plainToInstance(AdminServiceWriteDto, base))).rejects.toBeInstanceOf(NotFoundException);
  });
  const upd = (extra: object, history: string[] = [], existing = ['G1', 'G2', 'G3']) => {
    const m = makeService((sql, p) => {
      if (sql.includes('SELECT TrangThai')) return [{ TrangThai: 'Hoạt động' }];
      if (sql.includes('DanhMuc')) return [{ x: 1 }];
      if (sql.includes('RTRIM(MaGoi)')) return existing.map((id) => ({ id }));
      if (sql.includes('FROM dbo.KhachSuDungDichVu WHERE MaGoi')) return history.includes(p[0] as string) ? [{ x: 1 }] : [];
      if (sql.includes('MAX(')) return [{ n: 9 }];
      return [];
    });
    return { ...m, run: () => m.svc.update('DV1', plainToInstance(AdminServiceWriteDto, { ...base, ...extra })) };
  };
  const deleted = (r: { query: jest.Mock }) => r.query.mock.calls.filter((c) => String(c[0]).startsWith('DELETE')).map((c) => (c[1] as string[])[0]);
  it('update: upsert-only, omitted packages are untouched', async () => {
    const t = upd({ packages: [{ id: 'G1', name: 'A', durationMinutes: 30, price: 1 }, { name: 'New', durationMinutes: 45, price: 2 }] });
    const res = await t.run();
    const sqls = t.runner.query.mock.calls.map((c) => String(c[0]));
    expect(deleted(t.runner)).toEqual([]);
    expect(res.retainedPackageIds).toEqual([]);
    expect(sqls.some((x) => x.startsWith('UPDATE dbo.GoiDichVu'))).toBe(true);
    expect(sqls.some((x) => x.startsWith('INSERT dbo.GoiDichVu'))).toBe(true);
  });
  it('update: explicit remove deletes only unreferenced, retains those with history', async () => {
    const t = upd({ packages: [], removePackageIds: ['G2', 'G3'] }, ['G2']);
    const res = await t.run();
    expect(deleted(t.runner)).toEqual(['G3']);
    expect(res.retainedPackageIds).toEqual(['G2']);
  });
  it('update: remove id not in service -> 400, nothing committed', async () => {
    const t = upd({ packages: [], removePackageIds: ['ZZ'] });
    await expect(t.run()).rejects.toThrow(MSG.package);
    expect(t.runner.commitTransaction).not.toHaveBeenCalled();
  });
  it('update: id in both packages and removePackageIds -> 400', async () => {
    const t = upd({ packages: [{ id: 'G1', name: 'A', durationMinutes: 30, price: 1 }], removePackageIds: ['G1'] });
    await expect(t.run()).rejects.toThrow(MSG.removeConflict);
  });
  it('update: last remaining package cannot be removed', async () => {
    const t = upd({ packages: [], removePackageIds: ['G1'] }, [], ['G1']);
    await expect(t.run()).rejects.toThrow(MSG.lastPackage);
    expect(t.runner.rollbackTransaction).toHaveBeenCalled();
  });
  it('update: removing the last package is allowed when a new one is inserted', async () => {
    const t = upd({ packages: [{ name: 'New', durationMinutes: 45, price: 2 }], removePackageIds: ['G1'] }, [], ['G1']);
    await t.run();
    expect(deleted(t.runner)).toEqual(['G1']);
  });
  it('create: needs at least one package and rejects removePackageIds', async () => {
    const { svc } = makeService(() => []);
    await expect(svc.create(plainToInstance(AdminServiceWriteDto, { ...base, packages: [] }))).rejects.toThrow(MSG.lastPackage);
    await expect(svc.create(plainToInstance(AdminServiceWriteDto, { ...base, removePackageIds: ['G1'] }))).rejects.toThrow(MSG.lastPackage);
  });
  it('update: package id of another service -> 400', async () => {
    const { svc } = makeService((sql) => (sql.includes('SELECT TrangThai') ? [{ TrangThai: 'Hoạt động' }] : sql.includes('DanhMuc') ? [{ x: 1 }] : sql.includes('RTRIM(MaGoi)') ? [{ id: 'G1' }] : []));
    await expect(svc.update('DV1', plainToInstance(AdminServiceWriteDto, { ...base, packages: [{ id: 'ZZ', name: 'A', durationMinutes: 30, price: 1 }] }))).rejects.toThrow(MSG.package);
  });
  it('stop: blocked by future bookings -> 409, no update', async () => {
    const { svc, runner } = makeService((sql) => (sql.includes('SELECT TrangThai') ? [{ TrangThai: 'Hoạt động' }] : sql.includes('LichHen') ? [{ MaLichHen: 'L1' }] : []));
    await expect(svc.stop('DV1')).rejects.toBeInstanceOf(ConflictException);
    expect(runner.query.mock.calls.some((c) => String(c[0]).startsWith('UPDATE'))).toBe(false);
  });
  it('stop: soft-stops (UPDATE, never DELETE) and is idempotent', async () => {
    const a = makeService((sql) => (sql.includes('SELECT TrangThai') ? [{ TrangThai: 'Hoạt động' }] : []));
    await a.svc.stop('DV1');
    const sqls = a.runner.query.mock.calls.map((c) => String(c[0]));
    expect(sqls.some((s) => s.startsWith('UPDATE dbo.DichVu'))).toBe(true);
    expect(sqls.some((s) => /DELETE/i.test(s))).toBe(false);
    const b = makeService((sql) => (sql.includes('SELECT TrangThai') ? [{ TrangThai: 'Ngừng hoạt động' }] : []));
    await b.svc.stop('DV1');
    expect(b.runner.query.mock.calls.some((c) => String(c[0]).startsWith('UPDATE'))).toBe(false);
  });
  it('unique-violation from driver maps to 409', async () => {
    const { svc } = makeService((sql) => { if (sql.includes('DanhMuc')) return [{ x: 1 }]; if (sql.includes('INSERT')) throw Object.assign(new Error('dup'), { number: 2627 }); return sql.includes('MAX(') ? [{ n: 0 }] : []; });
    await expect(svc.create(plainToInstance(AdminServiceWriteDto, base))).rejects.toThrow(MSG.duplicate);
  });
});

describe('authorization metadata', () => {
  it('services need Q04 and reports Q06 with Quản lý role', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, AdminServicesController)).toEqual(['Q04']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, ReportsController)).toEqual(['Q06']);
    expect(Reflect.getMetadata(ROLES_KEY, AdminServicesController)).toEqual(['Quản lý']);
    expect(Reflect.getMetadata(ROLES_KEY, ReportsController)).toEqual(['Quản lý']);
  });
});
