import 'reflect-metadata';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { Actor, EmployeesService } from './employees.service';
import { CreateEmployeeDto, UpdateEmployeeDto } from './employees.dto';
import { DatabaseService } from '../database.service';
import { PgTestServer, startPgTestServer } from '../testing/pg-test-server';

jest.setTimeout(120_000);

const OWNER_ID = 'TK00000001';
const owner: Actor = { sub: OWNER_ID, role: 'Chủ Spa', permissions: ['Q01', 'Q02', 'Q03', 'Q04', 'Q05', 'Q06'] };
const createDto = (o: object = {}) => plainToInstance(CreateEmployeeDto, {
  username: 'nv.moi', fullName: 'Nhân Viên Mới', password: 'Abcdef1!x', confirmPassword: 'Abcdef1!x',
  phone: '0912345678', email: 'moi@example.com', ...o,
});
const updateDto = (o: object = {}) => plainToInstance(UpdateEmployeeDto, { fullName: 'Tên Mới', phone: '0912345678', email: 'moi@example.com', ...o });
const conflict = (message: string, field?: string) => new ConflictException(field ? { message, field } : message);

describe('employees on real PostgreSQL', () => {
  let pg: PgTestServer;
  let db: DatabaseService;
  let svc: EmployeesService;
  const hash = jest.fn(async (p: string) => `hashed:${p.length}`);
  const rows = <T>(sql: string, p: unknown[] = []) => db.query<T[]>(sql, p);
  const oldStore = process.env.AUTH_SESSION_STORE;

  beforeAll(async () => {
    pg = await startPgTestServer();
    db = new DatabaseService();
    svc = new EmployeesService(db, { hash } as never);
  });
  afterAll(async () => {
    if (oldStore === undefined) delete process.env.AUTH_SESSION_STORE; else process.env.AUTH_SESSION_STORE = oldStore;
    await db.onApplicationShutdown();
    await pg.stop();
  });
  beforeEach(async () => {
    delete process.env.AUTH_SESSION_STORE;
    await pg.reset();
    await pg.exec(`INSERT INTO dbo.TaiKhoan VALUES ('${OWNER_ID}','owner','0900000000','x','Chủ Spa','Hoạt động');`);
  });

  it('create: persists account + profile (Nhân viên, Hoạt động, Đang làm việc), hash never exposed, ids generated', async () => {
    const res = await svc.create(owner, createDto({ gender: 'Nữ', birthDate: '1990-05-20', address: 'HCM', notes: 'ghi chú' }));
    expect(res).toEqual({ id: 'NV00000001', message: 'Thêm nhân viên thành công!' });
    expect(hash).toHaveBeenCalledWith('Abcdef1!x');
    const [acc] = await rows<Record<string, string>>(`SELECT rtrim(MaTaiKhoan) AS id, MatKhauBam AS h, VaiTro AS r, TrangThai AS s, SoDienThoai AS p FROM dbo.TaiKhoan WHERE TenDangNhap='nv.moi'`);
    expect(acc).toEqual({ id: 'TK00000002', h: 'hashed:9', r: 'Nhân viên', s: 'Hoạt động', p: '0912345678' });
    const got = await svc.get('NV00000001');
    expect(got).toEqual({
      id: 'NV00000001', accountId: 'TK00000002', username: 'nv.moi', fullName: 'Nhân Viên Mới', phone: '0912345678', email: 'moi@example.com',
      gender: 'Nữ', birthDate: '1990-05-20', address: 'HCM', notes: 'ghi chú', role: 'Nhân viên', workStatus: 'Đang làm việc',
      accountStatus: 'Hoạt động', permissions: [],
    });
    expect(JSON.stringify(got)).not.toContain('hashed');
    await expect(svc.get('NV99999999')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('create: duplicate username / phone / email -> 409 with the exact messages (case-insensitive username and email)', async () => {
    await svc.create(owner, createDto());
    await expect(svc.create(owner, createDto({ username: 'NV.MOI', phone: '0900000099', email: 'x@y.vn' }))).rejects.toThrow(conflict('Tên đăng nhập đã tồn tại!', 'username'));
    await expect(svc.create(owner, createDto({ username: 'other', email: 'x@y.vn' }))).rejects.toThrow(conflict('Số điện thoại đã tồn tại!', 'phone'));
    await expect(svc.create(owner, createDto({ username: 'other', phone: '0900000099', email: 'MOI@Example.com' }))).rejects.toThrow(conflict('Email đã tồn tại!', 'email'));
    // phone owned by another account (the owner's TaiKhoan) also collides
    await expect(svc.create(owner, createDto({ username: 'other', phone: '0900000000', email: 'x@y.vn' }))).rejects.toThrow(conflict('Số điện thoại đã tồn tại!', 'phone'));
    expect((await rows<{ n: number }>('SELECT count(*) AS n FROM dbo.NhanVien'))[0].n).toBe(1);
  });

  it('create: the database unique indexes are the final guard and map to the generic 409', async () => {
    const original = db.transaction.bind(db);
    // Force the race: pre-check sees nothing, the unique index rejects the INSERT.
    await svc.create(owner, createDto());
    const spy = jest.spyOn(db, 'transaction').mockImplementation((work) => original(async (runner) => {
      const q = runner.query.bind(runner);
      runner.query = (async (sql: string, p?: unknown[]) => (/^\s*SELECT 1 AS x/.test(sql) ? [] : q(sql, p))) as typeof runner.query;
      return work(runner);
    }));
    await expect(svc.create(owner, createDto({ username: 'racer' }))).rejects.toThrow(new ConflictException('Thông tin đã tồn tại trong hệ thống!'));
    spy.mockRestore();
  });

  it('create: concurrent creates generate unique TK/NV ids and all succeed', async () => {
    const results = await Promise.all([1, 2, 3, 4, 5].map((i) =>
      svc.create(owner, createDto({ username: `user.${i}`, phone: `091000000${i}`, email: `u${i}@example.com` }))));
    expect(results.map((r) => r.id).sort()).toEqual(['NV00000001', 'NV00000002', 'NV00000003', 'NV00000004', 'NV00000005']);
    const acc = await rows<{ id: string }>(`SELECT rtrim(MaTaiKhoan) AS id FROM dbo.TaiKhoan WHERE VaiTro='Nhân viên' ORDER BY 1`);
    expect(acc.map((a) => a.id)).toEqual(['TK00000002', 'TK00000003', 'TK00000004', 'TK00000005', 'TK00000006']);
  });

  it('create: concurrent creates with the same phone -> exactly one succeeds, the rest 409', async () => {
    const settled = await Promise.allSettled([1, 2, 3].map((i) => svc.create(owner, createDto({ username: `same.${i}`, email: `s${i}@example.com` }))));
    expect(settled.filter((s) => s.status === 'fulfilled')).toHaveLength(1);
    for (const s of settled.filter((x) => x.status === 'rejected')) expect((s as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
    expect((await rows<{ n: number }>('SELECT count(*) AS n FROM dbo.NhanVien'))[0].n).toBe(1);
  });

  it('list: search by name/username/phone/email (case-insensitive), status filter, permissions, pagination', async () => {
    for (let i = 1; i <= 21; i++) {
      await svc.create(owner, createDto({ username: `staff.${String(i).padStart(2, '0')}`, fullName: i === 3 ? 'Lê Văn Cường' : `Staff ${String(i).padStart(2, '0')}`,
        phone: `09${String(10000000 + i)}`, email: `staff${i}@Example.com` }));
    }
    await pg.exec(`INSERT INTO dbo.TaiKhoanQuyen VALUES ('TK00000002','Q01'),('TK00000002','Q03')`);
    const p1 = await svc.list({ q: '', status: '', page: 1 });
    const p2 = await svc.list({ q: '', status: '', page: 2 });
    expect([p1.items.length, p1.hasNext, p2.items.length, p2.hasNext]).toEqual([20, true, 1, false]);
    const first = [...p1.items, ...p2.items].find((i) => i.accountId === 'TK00000002')!;
    expect(first.permissions).toEqual(['Q01', 'Q03']);
    expect((await svc.list({ q: 'STAFF 05', status: '', page: 1 })).items.map((i) => i.fullName)).toEqual(['Staff 05']);
    expect((await svc.list({ q: 'staff.07', status: '', page: 1 })).items).toHaveLength(1);
    expect((await svc.list({ q: '09' + '10000008', status: '', page: 1 })).items).toHaveLength(1);
    expect((await svc.list({ q: 'STAFF9@example', status: '', page: 1 })).items).toHaveLength(1);
    expect((await svc.list({ q: 'cường', status: '', page: 1 })).items.map((i) => i.fullName)).toEqual(['Lê Văn Cường']);
    expect((await svc.list({ q: 'LÊ VĂN', status: '', page: 1 })).items.map((i) => i.fullName)).toEqual(['Lê Văn Cường']);
    await svc.setAccountStatus(owner, 'NV00000004', { status: 'Đã khóa' });
    expect((await svc.list({ q: '', status: 'Đã khóa', page: 1 })).items.map((i) => i.id)).toEqual(['NV00000004']);
    expect((await svc.list({ q: '', status: 'Vô hiệu hóa', page: 1 })).items).toEqual([]);
  });

  it('update: edits profile, syncs TaiKhoan.SoDienThoai, optional fields only when sent, null clears', async () => {
    await svc.create(owner, createDto({ gender: 'Nữ', address: 'HCM' }));
    await svc.create(owner, createDto({ username: 'second', phone: '0922222222', email: 'two@example.com' }));
    await svc.update(owner, 'NV00000001', updateDto({ phone: '0933333333', email: 'new@example.com', notes: 'N' }));
    const got = await svc.get('NV00000001');
    expect(got).toMatchObject({ fullName: 'Tên Mới', phone: '0933333333', email: 'new@example.com', gender: 'Nữ', address: 'HCM', notes: 'N' });
    expect((await rows<{ p: string }>(`SELECT SoDienThoai AS p FROM dbo.TaiKhoan WHERE MaTaiKhoan='TK00000002'`))[0].p).toBe('0933333333');
    await svc.update(owner, 'NV00000001', updateDto({ phone: '0933333333', email: 'new@example.com', address: null, birthDate: '1991-01-02' }));
    expect(await svc.get('NV00000001')).toMatchObject({ address: null, gender: 'Nữ', birthDate: '1991-01-02' });
    await expect(svc.update(owner, 'NV00000001', updateDto({ phone: '0922222222', email: 'new@example.com' }))).rejects.toThrow(conflict('Số điện thoại đã tồn tại!', 'phone'));
    await expect(svc.update(owner, 'NV00000001', updateDto({ phone: '0933333333', email: 'TWO@example.com' }))).rejects.toThrow(conflict('Email đã tồn tại!', 'email'));
    await expect(svc.update(owner, 'NV00000404', updateDto())).rejects.toBeInstanceOf(NotFoundException);
  });

  it('setPermissions: replaces the set, changes role, writes an audit row; Quản lý actor is limited', async () => {
    await svc.create(owner, createDto());
    await svc.setPermissions(owner, 'NV00000001', { role: 'Quản lý', permissions: ['Q02', 'Q01'] });
    expect((await rows<{ c: string }>(`SELECT rtrim(MaQuyen) AS c FROM dbo.TaiKhoanQuyen WHERE MaTaiKhoan='TK00000002' ORDER BY 1`)).map((r) => r.c)).toEqual(['Q01', 'Q02']);
    expect((await rows<{ r: string }>(`SELECT VaiTro AS r FROM dbo.TaiKhoan WHERE MaTaiKhoan='TK00000002'`))[0].r).toBe('Quản lý');
    await svc.setPermissions(owner, 'NV00000001', { role: 'Nhân viên', permissions: ['Q03'] });
    const audit = await rows<{ id: string; a: string; t: string; n: string; at: Date }>(
      `SELECT rtrim(MaLichSu) AS id, rtrim(MaTaiKhoanThucHien) AS a, rtrim(MaTaiKhoanDuocPhanQuyen) AS t, NoiDungThayDoi AS n, ThoiDiem AS at FROM dbo.LichSuPhanQuyen ORDER BY MaLichSu`);
    expect(audit.map((a) => [a.id, a.a, a.t, a.n])).toEqual([
      ['LS00000001', OWNER_ID, 'TK00000002', 'Vai trò: Nhân viên -> Quản lý; Quyền: [] -> [Q01,Q02]'],
      ['LS00000002', OWNER_ID, 'TK00000002', 'Vai trò: Quản lý -> Nhân viên; Quyền: [Q01,Q02] -> [Q03]'],
    ]);
    expect(audit[0].at).toBeInstanceOf(Date);

    // a Quản lý (with Q03 only) may not grant Quản lý, nor permissions they lack, nor touch peers/owner
    await svc.create(owner, createDto({ username: 'staff2', phone: '0944444444', email: 's2@example.com' }));
    await pg.exec(`INSERT INTO dbo.TaiKhoan VALUES ('TK00000050','mgr','0955555555','x','Quản lý','Hoạt động')`);
    const mgr: Actor = { sub: 'TK00000050', role: 'Quản lý', permissions: ['Q03'] };
    await expect(svc.setPermissions(mgr, 'NV00000002', { role: 'Quản lý', permissions: ['Q03'] })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.setPermissions(mgr, 'NV00000002', { role: 'Nhân viên', permissions: ['Q04'] })).rejects.toBeInstanceOf(ForbiddenException);
    await svc.setPermissions(mgr, 'NV00000002', { role: 'Nhân viên', permissions: ['Q03'] });
    await expect(svc.setPermissions(owner, 'NV00000404', { role: 'Nhân viên', permissions: [] })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('setAccountStatus / softDelete: statuses, protections, session revocation with the SQL session store', async () => {
    process.env.AUTH_SESSION_STORE = 'sql';
    await svc.create(owner, createDto());
    await pg.exec(`INSERT INTO dbo.PhienDangNhap(MaPhien,MaTaiKhoan,HetHanLuc) VALUES ('11111111-1111-4111-8111-111111111111','TK00000002', dbo.utc_now() + interval '1 day')`);
    await svc.setAccountStatus(owner, 'NV00000001', { status: 'Đã khóa' });
    expect((await rows<{ s: string }>(`SELECT TrangThai AS s FROM dbo.TaiKhoan WHERE MaTaiKhoan='TK00000002'`))[0].s).toBe('Đã khóa');
    expect((await rows<{ r: Date | null }>('SELECT ThuHoiLuc AS r FROM dbo.PhienDangNhap'))[0].r).toBeInstanceOf(Date);
    await expect(svc.setAccountStatus(owner, 'NV00000001', { status: 'Hoạt động' })).resolves.toEqual({ message: 'Mở khóa tài khoản thành công!' });

    await expect(svc.softDelete(owner, 'NV00000001')).resolves.toEqual({ message: 'Vô hiệu hóa nhân viên thành công!' });
    expect(await rows(`SELECT TrangThaiHoSo AS h, TrangThaiLamViec AS w FROM dbo.NhanVien`)).toEqual([{ h: 'Vô hiệu hóa', w: 'Ngừng làm việc' }]);
    expect((await rows<{ s: string }>(`SELECT TrangThai AS s FROM dbo.TaiKhoan WHERE MaTaiKhoan='TK00000002'`))[0].s).toBe('Vô hiệu hóa');
    expect((await svc.get('NV00000001')).accountStatus).toBe('Vô hiệu hóa');
    await expect(svc.setAccountStatus(owner, 'NV00000001', { status: 'Hoạt động' })).rejects.toThrow(new ConflictException('Tài khoản đã bị vô hiệu hóa!'));

    // the owner and oneself are protected; history is preserved (no DELETE of the employee row)
    await pg.exec(`INSERT INTO dbo.NhanVien(MaNhanVien,MaTaiKhoan,HoTen,SoDienThoai,Email,TrangThaiLamViec,TrangThaiHoSo) VALUES ('NV00000099','${OWNER_ID}','Owner','0900000000','o@x.vn','Đang làm việc','Hoạt động')`);
    await expect(svc.softDelete({ ...owner, sub: 'TK00000002' }, 'NV00000099')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.setPermissions(owner, 'NV00000099', { role: 'Nhân viên', permissions: [] })).rejects.toBeInstanceOf(ForbiddenException);
    expect((await rows<{ n: number }>('SELECT count(*) AS n FROM dbo.NhanVien'))[0].n).toBe(2);
  });

  it('an employee without an account cannot be locked or given permissions (409)', async () => {
    await pg.exec(`INSERT INTO dbo.NhanVien(MaNhanVien,HoTen,SoDienThoai,Email,TrangThaiLamViec,TrangThaiHoSo) VALUES ('NV00000007','No Account','0966666666','na@x.vn','Đang làm việc','Hoạt động')`);
    await expect(svc.setAccountStatus(owner, 'NV00000007', { status: 'Đã khóa' })).rejects.toThrow(new ConflictException('Nhân viên chưa có tài khoản!'));
    await expect(svc.setPermissions(owner, 'NV00000007', { role: 'Nhân viên', permissions: [] })).rejects.toThrow(new ConflictException('Nhân viên chưa có tài khoản!'));
    expect(await svc.get('NV00000007')).toMatchObject({ accountId: null, username: '', role: 'Nhân viên', accountStatus: 'Vô hiệu hóa' });
    await expect(svc.softDelete(owner, 'NV00000007')).resolves.toBeDefined();
  });
});
