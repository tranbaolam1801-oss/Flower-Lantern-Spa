import 'reflect-metadata';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { AdminServiceListQuery, AdminServiceWriteDto } from './admin-services.dto';
import { AdminServicesService, MSG } from './admin-services.service';
import { DatabaseService } from '../database.service';
import { PgTestServer, startPgTestServer } from '../testing/pg-test-server';

jest.setTimeout(120_000);

const dto = (o: object = {}) => plainToInstance(AdminServiceWriteDto, {
  name: 'Massage', categoryId: 'DM01', status: 'Hoạt động', description: 'mô tả', details: 'chi tiết', image: '/assets/m.png',
  packages: [{ name: 'Gói 60', durationMinutes: 60, price: 300000 }, { name: 'Gói 90', durationMinutes: 90, price: 450000 }], ...o,
});
const listQuery = (o: object = {}) => plainToInstance(AdminServiceListQuery, { page: 1, ...o });
type Listed = { items: Record<string, unknown>[]; categories: Record<string, unknown>[]; hasNext: boolean };

describe('admin services on real PostgreSQL', () => {
  let pg: PgTestServer;
  let db: DatabaseService;
  let svc: AdminServicesService;
  const list = async (o: object = {}) => (await svc.list(listQuery(o))) as unknown as Listed;
  const rows = <T>(sql: string, p: unknown[] = []) => db.query<T[]>(sql, p);

  beforeAll(async () => {
    pg = await startPgTestServer();
    db = new DatabaseService();
    svc = new AdminServicesService(db);
  });
  afterAll(async () => {
    await db.onApplicationShutdown();
    await pg.stop();
  });
  beforeEach(async () => {
    await pg.reset();
    await pg.exec(`INSERT INTO dbo.DanhMuc VALUES ('DM01','Chăm sóc da','Hoạt động'),('DM02','Massage','Hoạt động');`);
  });

  const packagesOf = (id: string) => rows<{ id: string; name: string; d: number; price: number }>(
    'SELECT rtrim(MaGoi) AS id, TenGoi AS name, ThoiLuong AS d, Gia AS price FROM dbo.GoiDichVu WHERE MaDichVu=$1 ORDER BY MaGoi', [id]);
  const historyFor = async (goi: string) => {
    const k = goi.slice(2);
    await pg.exec(`INSERT INTO dbo.LichHen(MaLichHen,HoTenNguoiDat,SoDienThoaiNguoiDat,NgayHen,GioHen,TrangThaiLichHen,TrangThaiThanhToan)
        VALUES ('LH${k}','Khách','0900000001','2020-01-01','09:00','Hoàn thành','Đã thanh toán');
      INSERT INTO dbo.KhachSuDungDichVu(MaChiTiet,MaLichHen,MaGoi,TenKhach,ThoiDiemBatDau,ThoiDiemKetThuc)
        VALUES ('CT${k}','LH${k}','${goi}','Khách','2020-01-01 09:00','2020-01-01 10:00');`);
  };

  it('create: generates DV/GV ids, stores image path in HinhAnh and packages with numeric prices', async () => {
    const res = await svc.create(dto());
    expect(res).toEqual({ id: 'DV00000001', message: 'Thêm mới dịch vụ thành công!' });
    const [dv] = await rows<{ img: string; st: string; cat: string }>(
      'SELECT HinhAnh AS img, TrangThai AS st, rtrim(MaDanhMuc) AS cat FROM dbo.DichVu WHERE MaDichVu=$1', ['DV00000001']);
    expect(dv).toEqual({ img: '/assets/m.png', st: 'Hoạt động', cat: 'DM01' });
    expect(await packagesOf('DV00000001')).toEqual([
      { id: 'GV00000001', name: 'Gói 60', d: 60, price: 300000 }, { id: 'GV00000002', name: 'Gói 90', d: 90, price: 450000 }]);
    const second = await svc.create(dto({ name: 'Facial', packages: [{ name: 'Gói', durationMinutes: 30, price: 1 }] }));
    expect(second.id).toBe('DV00000002');
    expect((await packagesOf('DV00000002'))[0].id).toBe('GV00000003');
  });

  it('create: explicit id, duplicate id -> 409, bad category -> 400', async () => {
    expect((await svc.create(dto({ id: 'DVX1' }))).id).toBe('DVX1');
    await expect(svc.create(dto({ id: 'DVX1', name: 'Other' }))).rejects.toThrow(new ConflictException(MSG.idExists));
    await expect(svc.create(dto({ name: 'Zeta', categoryId: 'NOPE' }))).rejects.toThrow(new BadRequestException(MSG.category));
  });

  it('create: duplicate name is case-insensitive -> 409 and nothing is stored', async () => {
    await svc.create(dto());
    for (const name of ['Massage', 'MASSAGE', 'massage']) {
      await expect(svc.create(dto({ name }))).rejects.toThrow(new ConflictException(MSG.duplicate));
    }
    expect((await rows<{ n: number }>('SELECT count(*) AS n FROM dbo.DichVu'))[0].n).toBe(1);
    expect((await rows<{ n: number }>('SELECT count(*) AS n FROM dbo.GoiDichVu'))[0].n).toBe(2);
  });

  it('create: concurrent creates all get distinct ids', async () => {
    const results = await Promise.all(['A', 'B', 'C', 'D', 'E'].map((n) => svc.create(dto({ name: `Svc ${n}`, image: undefined }))));
    expect(new Set(results.map((r) => r.id)).size).toBe(5);
    const goi = await rows<{ id: string }>('SELECT rtrim(MaGoi) AS id FROM dbo.GoiDichVu');
    expect(new Set(goi.map((g) => g.id)).size).toBe(10);
  });

  it('create: concurrent creates of the same name -> exactly one wins, the rest get 409', async () => {
    const settled = await Promise.allSettled([1, 2, 3].map((i) => svc.create(dto({ name: i === 2 ? 'SAME' : 'same' }))));
    expect(settled.filter((s) => s.status === 'fulfilled')).toHaveLength(1);
    for (const s of settled.filter((x) => x.status === 'rejected')) expect((s as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
  });

  it('list: search (case-insensitive), category/status filters, packages, categories, pagination', async () => {
    await svc.create(dto());
    await svc.create(dto({ name: 'Facial Rose', categoryId: 'DM02', status: 'Ngừng hoạt động', packages: [{ name: 'G', durationMinutes: 30, price: 99000 }] }));
    const all = await list();
    expect(all.items).toHaveLength(2);
    expect(all.categories.map((c) => c.id).sort()).toEqual(['DM01', 'DM02']);
    const massage = all.items.find((i) => i.name === 'Massage')!;
    expect(massage).toMatchObject({ id: 'DV00000001', categoryId: 'DM01', categoryName: 'Chăm sóc da', description: 'mô tả', details: 'chi tiết', image: '/assets/m.png', status: 'Hoạt động' });
    expect(massage.packages).toEqual([
      { id: 'GV00000001', name: 'Gói 60', durationMinutes: 60, price: 300000 }, { id: 'GV00000002', name: 'Gói 90', durationMinutes: 90, price: 450000 }]);
    expect((await list({ q: 'ROSE' })).items.map((i) => i.name)).toEqual(['Facial Rose']);
    expect((await list({ category: 'DM02' })).items).toHaveLength(1);
    expect((await list({ status: 'Hoạt động' })).items.map((i) => i.id)).toEqual(['DV00000001']);
    expect((await list({ q: 'zzz' })).items).toEqual([]);
    for (let i = 0; i < 10; i++) await svc.create(dto({ name: `Bulk ${String(i).padStart(2, '0')}`, image: undefined, packages: [{ name: 'G', durationMinutes: 10, price: 1 }] }));
    const p1 = await list({ page: 1 });
    const p2 = await list({ page: 2 });
    expect([p1.items.length, p1.hasNext, p2.items.length, p2.hasNext]).toEqual([10, true, 2, false]);
  });

  it('update: edits the service, 404 when missing, duplicate name of another service 409, same name on itself is fine', async () => {
    await svc.create(dto());
    await svc.create(dto({ name: 'Facial', packages: [{ name: 'G', durationMinutes: 10, price: 1 }] }));
    await expect(svc.update('DV99999999', dto({ name: 'X' }))).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.update('DV00000002', dto({ name: 'MASSAGE', packages: [] }))).rejects.toThrow(new ConflictException(MSG.duplicate));
    const res = await svc.update('DV00000001', dto({ name: 'MASSAGE', description: 'mới', image: '', packages: [] }));
    expect(res).toMatchObject({ id: 'DV00000001', message: 'Cập nhật dịch vụ thành công!', retainedPackageIds: [] });
    const [dv] = await rows<{ n: string; d: string; img: string | null }>('SELECT TenDichVu AS n, MoTaNgan AS d, HinhAnh AS img FROM dbo.DichVu WHERE MaDichVu=$1', ['DV00000001']);
    expect(dv).toEqual({ n: 'MASSAGE', d: 'mới', img: null });
    await expect(svc.update('DV00000001', dto({ categoryId: 'NOPE', packages: [] }))).rejects.toThrow(new BadRequestException(MSG.category));
  });

  it('update: upsert-only packages (omitted untouched), package of another service -> 400 and rolled back', async () => {
    await svc.create(dto());
    await svc.create(dto({ name: 'Other', packages: [{ name: 'O', durationMinutes: 5, price: 5 }] }));
    const res = await svc.update('DV00000001', dto({ packages: [
      { id: 'GV00000001', name: 'Gói 60 mới', durationMinutes: 65, price: 310000 }, { name: 'Gói 120', durationMinutes: 120, price: 600000 }] }));
    expect(res.retainedPackageIds).toEqual([]);
    expect(await packagesOf('DV00000001')).toEqual([
      { id: 'GV00000001', name: 'Gói 60 mới', d: 65, price: 310000 },
      { id: 'GV00000002', name: 'Gói 90', d: 90, price: 450000 }, // omitted -> untouched
      { id: 'GV00000004', name: 'Gói 120', d: 120, price: 600000 }]);
    await expect(svc.update('DV00000001', dto({ name: 'Changed', packages: [{ id: 'GV00000003', name: 'x', durationMinutes: 1, price: 1 }] })))
      .rejects.toThrow(new BadRequestException(MSG.package));
    expect((await rows<{ n: string }>('SELECT TenDichVu AS n FROM dbo.DichVu WHERE MaDichVu=$1', ['DV00000001']))[0].n).toBe('Massage'); // rollback
  });

  it('update: removePackageIds deletes unreferenced packages; packages with booking history are retained', async () => {
    await svc.create(dto({ packages: [1, 2, 3].map((i) => ({ name: `P${i}`, durationMinutes: 10 * i, price: i })) }));
    await historyFor('GV00000002');
    const res = await svc.update('DV00000001', dto({ packages: [], removePackageIds: ['GV00000002', 'GV00000003'] }));
    expect(res.retainedPackageIds).toEqual(['GV00000002']);
    expect((await packagesOf('DV00000001')).map((p) => p.id)).toEqual(['GV00000001', 'GV00000002']);
    await expect(svc.update('DV00000001', dto({ packages: [], removePackageIds: ['GV00000777'] }))).rejects.toThrow(new BadRequestException(MSG.package));
  });

  it('update: cannot leave the service without packages (rolled back), unless a new one is inserted', async () => {
    await svc.create(dto({ packages: [{ name: 'Only', durationMinutes: 10, price: 1 }] }));
    await expect(svc.update('DV00000001', dto({ name: 'Changed', packages: [], removePackageIds: ['GV00000001'] }))).rejects.toThrow(new BadRequestException(MSG.lastPackage));
    expect(await packagesOf('DV00000001')).toHaveLength(1);
    expect((await rows<{ n: string }>('SELECT TenDichVu AS n FROM dbo.DichVu'))[0].n).toBe('Massage');
    await svc.update('DV00000001', dto({ packages: [{ name: 'New', durationMinutes: 20, price: 2 }], removePackageIds: ['GV00000001'] }));
    expect((await packagesOf('DV00000001')).map((p) => p.name)).toEqual(['New']);
  });

  it('stop / deactivate: blocked by upcoming pending bookings (409), allowed for past or completed ones, idempotent', async () => {
    await svc.create(dto());
    await historyFor('GV00000001'); // completed booking in 2020: does not block
    await svc.stop('DV00000001');
    expect((await rows<{ s: string }>('SELECT TrangThai AS s FROM dbo.DichVu'))[0].s).toBe('Ngừng hoạt động');
    await expect(svc.stop('DV00000001')).resolves.toEqual({ message: 'Đã chuyển dịch vụ sang Ngừng hoạt động!' });
    await expect(svc.stop('DV00000404')).rejects.toBeInstanceOf(NotFoundException);

    await svc.update('DV00000001', dto({ packages: [] })); // reactivate (status Hoạt động)
    await pg.exec(`INSERT INTO dbo.LichHen(MaLichHen,HoTenNguoiDat,SoDienThoaiNguoiDat,NgayHen,GioHen,TrangThaiLichHen,TrangThaiThanhToan)
        VALUES ('LH_FUT','Khách','0900000001', dbo.vn_now()::date + 1,'09:00','Chờ xác nhận','Chưa thanh toán');
      INSERT INTO dbo.KhachSuDungDichVu(MaChiTiet,MaLichHen,MaGoi,TenKhach,ThoiDiemBatDau,ThoiDiemKetThuc)
        VALUES ('CT_FUT','LH_FUT','GV00000001','Khách', dbo.vn_now() + interval '1 day', dbo.vn_now() + interval '1 day 1 hour');`);
    await expect(svc.stop('DV00000001')).rejects.toThrow(new ConflictException(MSG.futureBookings));
    await expect(svc.update('DV00000001', dto({ status: 'Ngừng hoạt động', packages: [] }))).rejects.toThrow(new ConflictException(MSG.futureBookings));
    expect((await rows<{ s: string }>('SELECT TrangThai AS s FROM dbo.DichVu'))[0].s).toBe('Hoạt động');
    await pg.exec(`UPDATE dbo.LichHen SET TrangThaiLichHen='Đã hủy' WHERE MaLichHen='LH_FUT'`);
    await expect(svc.stop('DV00000001')).resolves.toBeDefined();
  });

  it('rejects unsafe images before touching the database', async () => {
    await expect(svc.create(dto({ image: 'javascript:alert(1)' }))).rejects.toThrow(new BadRequestException(MSG.image));
  });
});
