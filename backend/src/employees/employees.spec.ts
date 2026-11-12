import 'reflect-metadata';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { EmployeesService, Actor } from './employees.service';
import { CreateEmployeeDto, UpdatePermissionsDto } from './employees.dto';

type Call = { sql: string; params: unknown[] };
const owner: Actor = { sub: 'TK00000001', role: 'Chủ Spa', permissions: ['Q01', 'Q02', 'Q03', 'Q04', 'Q05', 'Q06'] };
const manager: Actor = { sub: 'TK00000002', role: 'Quản lý', permissions: ['Q01', 'Q02', 'Q05'] };

function build(handler: (sql: string, params: unknown[]) => unknown[]) {
  const calls: Call[] = [];
  const manager_ = { query: jest.fn(async (sql: string, params: unknown[] = []) => { calls.push({ sql, params }); return handler(sql, params); }) };
  const database = {
    getDataSource: async () => ({ transaction: async (fn: (m: typeof manager_) => unknown) => fn(manager_) }),
    query: jest.fn(async () => []),
  };
  const passwords = { hash: jest.fn(async () => '$argon2id$fake-hash') };
  const service = new EmployeesService(database as never, passwords as never);
  return { service, calls, database, passwords };
}
const target = (role: string, accountId = 'TK00000009', status = 'Hoạt động') => [{ id: 'NV00000009', accountId, role, status }];
const base = (role: string, accountId?: string) => (sql: string) => {
  if (sql.includes('FROM dbo.NhanVien n WITH')) return target(role, accountId);
  if (sql.includes('MAX(CAST')) return [{ n: 7 }];
  if (sql.includes('FROM dbo.TaiKhoanQuyen')) return [{ code: 'Q01' }];
  return [];
};
const createDto = (over: Partial<CreateEmployeeDto> = {}) => ({
  username: 'nv.moi', fullName: 'Nhân Viên Mới', password: 'Abcdef1!x', confirmPassword: 'Abcdef1!x',
  phone: '0912345678', email: 'moi@example.com', ...over,
}) as CreateEmployeeDto;

describe('Employees DTO validation', () => {
  const errs = async (o: object) => (await validate(plainToInstance(CreateEmployeeDto, o))).flatMap((e) => Object.values(e.constraints ?? {}));
  const valid = { username: 'nv.moi', fullName: 'A', password: 'Abcdef1!x', confirmPassword: 'Abcdef1!x', phone: '0912345678', email: 'a@b.vn' };
  it('accepts valid payload and normalises +84 phone', async () => {
    const dto = plainToInstance(CreateEmployeeDto, { ...valid, phone: '+84912345678' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.phone).toBe('0912345678');
  });
  it('rejects bad phone, email, weak password, bad username', async () => {
    expect(await errs({ ...valid, phone: '12345' })).toContain('Số điện thoại không hợp lệ!');
    expect(await errs({ ...valid, email: 'x' })).toContain('Email không hợp lệ!');
    expect((await errs({ ...valid, password: 'abc' })).join()).toContain('Mật khẩu không đáp ứng');
    expect((await errs({ ...valid, username: 'a b' })).join()).toContain('Tên đăng nhập');
  });
  it('rejects unknown permission codes and duplicates', async () => {
    expect(await validate(plainToInstance(UpdatePermissionsDto, { role: 'Nhân viên', permissions: ['Q99'] }))).not.toHaveLength(0);
    expect(await validate(plainToInstance(UpdatePermissionsDto, { role: 'Nhân viên', permissions: ['Q01', 'Q01'] }))).not.toHaveLength(0);
    expect(await validate(plainToInstance(UpdatePermissionsDto, { role: 'Chủ Spa', permissions: [] }))).not.toHaveLength(0);
  });
});

describe('EmployeesService.create', () => {
  it('rejects mismatched confirmPassword with the exact message', async () => {
    const { service } = build(() => []);
    await expect(service.create(owner, createDto({ confirmPassword: 'other' }))).rejects.toThrow(new BadRequestException('Mật khẩu xác nhận không khớp!'));
  });
  it('hashes with PasswordService, creates Nhân viên account + profile, never stores plaintext', async () => {
    const { service, calls, passwords } = build(base('Nhân viên'));
    const res = await service.create(owner, createDto());
    expect(res.id).toBe('NV00000007');
    expect(passwords.hash).toHaveBeenCalledWith('Abcdef1!x');
    const insert = calls.find((c) => c.sql.includes('INSERT dbo.TaiKhoan '));
    expect(insert?.params).toContain('$argon2id$fake-hash');
    expect(insert?.params).not.toContain('Abcdef1!x');
    expect(insert?.sql).toContain("N'Nhân viên'");
    expect(JSON.stringify(res)).not.toContain('argon2');
  });
  it.each([
    ['TenDangNhap', 'Tên đăng nhập đã tồn tại!'],
    ['SoDienThoai = @0 AND MaTaiKhoan', 'Số điện thoại đã tồn tại!'],
    ['Email = @0', 'Email đã tồn tại!'],
  ])('returns 409 on duplicate (%s)', async (marker, message) => {
    const { service } = build((sql) => (sql.includes(marker) ? [{ x: 1 }] : base('Nhân viên')(sql)));
    await expect(service.create(owner, createDto())).rejects.toThrow(new ConflictException(message));
  });
  it('maps SQL unique-violation races to 409 and hides other driver errors', async () => {
    const dup = build(() => { throw Object.assign(new Error('boom: connection string xyz'), { number: 2627 }); });
    await expect(dup.service.create(owner, createDto())).rejects.toBeInstanceOf(ConflictException);
    const other = build(() => { throw new Error('secret driver detail'); });
    await expect(other.service.create(owner, createDto())).rejects.toThrow('Không thể kết nối dữ liệu. Vui lòng thử lại!');
  });
});

describe('EmployeesService read', () => {
  it('maps EmployeeItem and never returns hashes', async () => {
    const { service, database } = build(() => []);
    database.query
      .mockResolvedValueOnce([{ id: 'NV1', accountId: 'TK1', username: 'u', fullName: 'F', phone: '0900000001', email: null, role: 'Nhân viên', workStatus: 'Đang làm việc', accountStatus: 'Hoạt động', MatKhauBam: 'HASH' }] as never)
      .mockResolvedValueOnce([{ accountId: 'TK1', code: 'Q01' }, { accountId: 'TK1', code: 'Q02' }] as never);
    const res = await service.list({ q: '', status: '', page: 1 });
    expect(res).toMatchObject({ page: 1, hasNext: false });
    expect(res.items[0].permissions).toEqual(['Q01', 'Q02']);
    expect(JSON.stringify(res)).not.toContain('HASH');
  });
  it('404 for unknown employee', async () => {
    const { service } = build(() => []);
    await expect(service.get('NV404')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('EmployeesService protections', () => {
  const dto = { role: 'Nhân viên', permissions: ['Q01'] } as UpdatePermissionsDto;
  it('owner cannot be deleted, locked or have permissions changed', async () => {
    const { service } = build(base('Chủ Spa', 'TK00000001'));
    const other = { ...manager };
    await expect(service.softDelete(other, 'NV00000001')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.setAccountStatus(owner, 'NV00000001', { status: 'Đã khóa' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.setPermissions(owner, 'NV00000001', dto)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('actor cannot change own permissions, lock or delete themselves', async () => {
    const { service, calls } = build(base('Quản lý', manager.sub));
    await expect(service.setPermissions(manager, 'NV00000002', dto)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.setAccountStatus(manager, 'NV00000002', { status: 'Đã khóa' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.softDelete(manager, 'NV00000002')).rejects.toBeInstanceOf(ForbiddenException);
    expect(calls.some((c) => /^(UPDATE|DELETE|INSERT)/.test(c.sql.trim()))).toBe(false);
  });
  it('a Quản lý cannot touch peers, grant Quản lý, or grant permissions they lack', async () => {
    const peer = build(base('Quản lý'));
    await expect(peer.service.setAccountStatus(manager, 'NV00000009', { status: 'Đã khóa' })).rejects.toBeInstanceOf(ForbiddenException);
    const staff = build(base('Nhân viên'));
    await expect(staff.service.setPermissions(manager, 'NV00000009', { role: 'Quản lý', permissions: ['Q01'] })).rejects.toThrow('Chỉ Chủ Spa');
    await expect(staff.service.setPermissions(manager, 'NV00000009', { role: 'Nhân viên', permissions: ['Q04'] })).rejects.toThrow('không có');
  });
});

describe('EmployeesService.setPermissions', () => {
  it('replaces the permission set and writes an audit row with before/after and the actor', async () => {
    const { service, calls } = build(base('Nhân viên'));
    await service.setPermissions(owner, 'NV00000009', { role: 'Quản lý', permissions: ['Q02', 'Q01'] });
    const sqls = calls.map((c) => c.sql);
    expect(sqls.findIndex((s) => s.includes('DELETE FROM dbo.TaiKhoanQuyen'))).toBeLessThan(sqls.findIndex((s) => s.includes('INSERT dbo.TaiKhoanQuyen')));
    expect(calls.filter((c) => c.sql.includes('INSERT dbo.TaiKhoanQuyen')).map((c) => c.params[1])).toEqual(['Q01', 'Q02']);
    const audit = calls.find((c) => c.sql.includes('INSERT dbo.LichSuPhanQuyen'))!;
    expect(audit.params.slice(0, 3)).toEqual(['LS00000007', owner.sub, 'TK00000009']);
    expect(String(audit.params[3])).toBe('Vai trò: Nhân viên -> Quản lý; Quyền: [Q01] -> [Q01,Q02]');
  });
});

describe('EmployeesService status / delete', () => {
  const oldStore = process.env.AUTH_SESSION_STORE;
  afterEach(() => { if (oldStore === undefined) delete process.env.AUTH_SESSION_STORE; else process.env.AUTH_SESSION_STORE = oldStore; });
  it('locking revokes sessions when the SQL session store is enabled', async () => {
    process.env.AUTH_SESSION_STORE = 'sql';
    const { service, calls } = build(base('Nhân viên'));
    await service.setAccountStatus(owner, 'NV00000009', { status: 'Đã khóa' });
    expect(calls.some((c) => c.sql.includes('UPDATE dbo.PhienDangNhap SET ThuHoiLuc'))).toBe(true);
  });
  it('unlocking does not revoke sessions; session table untouched without sql store', async () => {
    delete process.env.AUTH_SESSION_STORE;
    const { service, calls } = build(base('Nhân viên'));
    await service.setAccountStatus(owner, 'NV00000009', { status: 'Hoạt động' });
    await service.softDelete(owner, 'NV00000009');
    expect(calls.some((c) => c.sql.includes('PhienDangNhap'))).toBe(false);
  });
  it('soft delete only updates statuses (no DELETE statements)', async () => {
    const { service, calls } = build(base('Nhân viên'));
    await service.softDelete(owner, 'NV00000009');
    expect(calls.some((c) => /DELETE\s/i.test(c.sql))).toBe(false);
    expect(calls.some((c) => c.sql.includes("TrangThai = N'Vô hiệu hóa'"))).toBe(true);
  });
});
