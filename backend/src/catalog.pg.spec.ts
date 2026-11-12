import 'reflect-metadata';
import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { CatalogController, CatalogQuery } from './catalog.controller';
import { HealthController } from './health.controller';
import { DatabaseService } from './database.service';
import { PgTestServer, startPgTestServer } from './testing/pg-test-server';

jest.setTimeout(120_000);

const query = (o: Partial<CatalogQuery> = {}) => ({ page: 1, limit: 12, ...o }) as CatalogQuery;

describe('public catalog and health on real PostgreSQL', () => {
  let pg: PgTestServer;
  let db: DatabaseService;
  let catalog: CatalogController;

  beforeAll(async () => {
    pg = await startPgTestServer();
    db = new DatabaseService();
    catalog = new CatalogController(db);
  });
  afterAll(async () => {
    await db.onApplicationShutdown();
    await pg.stop();
  });
  beforeEach(async () => {
    await pg.reset();
    await pg.exec(`INSERT INTO dbo.DanhMuc VALUES ('DM01','Chăm sóc da','Hoạt động'),('DM02','Massage','Hoạt động');
      INSERT INTO dbo.DichVu(MaDichVu,MaDanhMuc,TenDichVu,MoTaNgan,MoTaChiTiet,LoiIch,QuyTrinhThucHien,DoiTuongPhuHop,ThongTinLieuTrinhVaLuuY,HinhAnh,TrangThai) VALUES
        ('DV01','DM01','Test-only Massage','ngắn','chi tiết','lợi ích','quy trình','mọi người','lưu ý','/assets/a.png','Hoạt động'),
        ('DV02','DM02','Hidden service',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Ngừng hoạt động'),
        ('DV03','DM02','Khác 100%',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Hoạt động');
      INSERT INTO dbo.GoiDichVu(MaGoi,MaDichVu,TenGoi,ThoiLuong,Gia) VALUES
        ('GV01','DV01','Gói 90',90,450000),('GV02','DV01','Gói 60',60,300000),('GV03','DV02','Gói ẩn',30,100000);`);
  });

  it('lists only active services; priceFrom and package prices are numbers', async () => {
    const res = await catalog.list(query());
    expect(res.items.map((i) => i.id).sort()).toEqual(['DV01', 'DV03']);
    const dv01 = res.items.find((i) => i.id === 'DV01')!;
    expect(dv01).toMatchObject({ name: 'Test-only Massage', description: 'ngắn', image: '/assets/a.png', categoryId: 'DM01' });
    expect(dv01.priceFrom).toBe(300000);
    expect(typeof dv01.priceFrom).toBe('number');
    expect(res.items.find((i) => i.id === 'DV03')!.priceFrom).toBeNull();
    expect(res.items.some((i) => i.id === 'DV02')).toBe(false);
    expect(res).toMatchObject({ page: 1, limit: 12 });
  });

  it('searches case-insensitively, filters by category and paginates', async () => {
    expect((await catalog.list(query({ q: 'TEST-ONLY mass' }))).items.map((i) => i.id)).toEqual(['DV01']);
    expect((await catalog.list(query({ category: 'DM02' }))).items.map((i) => i.id)).toEqual(['DV03']);
    expect((await catalog.list(query({ limit: 1, page: 2 }))).items).toHaveLength(1);
    expect((await catalog.list(query({ limit: 1, page: 3 }))).items).toHaveLength(0);
  });

  it('treats LIKE wildcards and SQL injection text as literals', async () => {
    expect((await catalog.list(query({ q: '%' }))).items.map((i) => i.id)).toEqual(['DV03']); // only the name containing a literal %
    expect((await catalog.list(query({ q: '_' }))).items).toEqual([]);
    expect((await catalog.list(query({ q: '[' }))).items).toEqual([]);
    expect((await catalog.list(query({ q: "%' OR 1=1--" }))).items).toEqual([]);
  });

  it('returns service detail with numeric package prices ordered by duration; hides inactive', async () => {
    const d = await catalog.detail('DV01');
    expect(d).toMatchObject({ id: 'DV01', details: 'chi tiết', benefits: 'lợi ích', procedureSteps: 'quy trình', suitableFor: 'mọi người', notes: 'lưu ý' });
    expect((d.packages as { id: string; price: number; durationMinutes: number }[]).map((p) => [p.id, p.durationMinutes, p.price])).toEqual([['GV02', 60, 300000], ['GV01', 90, 450000]]);
    await expect(catalog.detail('DV02')).rejects.toBeInstanceOf(NotFoundException);
    await expect(catalog.detail('NOPE')).rejects.toBeInstanceOf(NotFoundException);
    await expect(catalog.detail('bad id!')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('health: live needs no database, ready runs SELECT 1', async () => {
    const dead = { query: jest.fn() };
    expect(new HealthController(dead as never).live()).toEqual({ status: 'ok', service: 'flower-lantern-spa' });
    expect(dead.query).not.toHaveBeenCalled();
    await expect(new HealthController(db).ready()).resolves.toEqual({ status: 'ok', database: 'postgres' });
    const down = { query: jest.fn().mockRejectedValue(new ServiceUnavailableException('x')) };
    await expect(new HealthController(down as never).ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
