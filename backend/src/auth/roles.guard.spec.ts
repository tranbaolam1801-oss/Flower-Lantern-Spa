import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from './roles.decorator';

describe('RBAC matrix', () => {
  const reflector = { getAllAndOverride: jest.fn() };
  const guard = new RolesGuard(reflector as unknown as Reflector);
  const context = (role?: string, permissions: string[] = []) => ({
    getHandler: () => function endpoint() {}, getClass: () => class Endpoint {},
    switchToHttp: () => ({ getRequest: () => ({ user: role ? { role, permissions } : undefined }) }),
  }) as unknown as ExecutionContext;
  beforeEach(() => reflector.getAllAndOverride.mockImplementation((key: string) => key === ROLES_KEY ? ['Nhân viên', 'Quản lý'] : ['Q01']));
  it.each(['Nhân viên', 'Quản lý'])('allows %s with assigned permission', role => {
    expect(guard.canActivate(context(role, ['Q01']))).toBe(true);
  });
  it.each(['Nhân viên', 'Quản lý', 'Khách hàng', 'Quản trị', undefined])('denies %s without permission or authenticated identity', role => {
    expect(() => guard.canActivate(context(role))).toThrow(ForbiddenException);
  });
  it('does not allow customer even with an accidentally assigned staff permission', () => {
    expect(() => guard.canActivate(context('Khách hàng', ['Q01']))).toThrow(ForbiddenException);
  });
  it('recognizes the explicit owner role without treating Quản trị as owner', () => {
    expect(guard.canActivate(context('Chủ Spa'))).toBe(true);
    expect(() => guard.canActivate(context('Quản trị', ['Q01']))).toThrow(ForbiddenException);
  });
});
