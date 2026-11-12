import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, ForbiddenException, HttpException } from '@nestjs/common';
import { PasswordService } from './password.service';
import { AuthService } from './auth.service';
import { JwtTokenService } from './jwt-token.service';
import { DatabaseService } from '../database.service';

describe('Auth Module (Unit & Logic)', () => {
  let passwordService: PasswordService;
  let authService: AuthService;
  const mockDatabase = {
    query: jest.fn(),
    transaction: jest.fn(),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PasswordService,
        AuthService,
        {
          provide: JwtTokenService,
          useValue: {
            signAsync: jest.fn().mockResolvedValue('test-jwt-token'),
            verifyAsync: jest.fn().mockResolvedValue({ sub: 'TK00000001', role: 'Quản lý' }),
          },
        },
        {
          provide: DatabaseService,
          useValue: mockDatabase,
        },
      ],
    }).compile();

    passwordService = module.get<PasswordService>(PasswordService);
    authService = module.get<AuthService>(AuthService);
  });

  beforeEach(() => {
    mockDatabase.query.mockReset();
    mockDatabase.transaction.mockReset();
  });

  describe('PasswordService (Argon2id)', () => {
    it('hashes and verifies plain text correctly', async () => {
      const plain = 'Spa@123456';
      const hash = await passwordService.hash(plain);
      expect(hash).toContain('$argon2id$');

      const isMatch = await passwordService.verify(plain, hash);
      expect(isMatch).toBe(true);

      const isWrong = await passwordService.verify('WrongPassword', hash);
      expect(isWrong).toBe(false);
    });
  });

  describe('AuthService Login & Lockout Rules', () => {
    it('blocks login immediately when account is temporarily locked within 15 minutes', async () => {
      const futureUnlock = new Date(Date.now() + 10 * 60 * 1000);
      mockDatabase.query.mockResolvedValueOnce([
        { SoLanSai: 5, ThoiDiemKhoaDen: futureUnlock, LanCuoiSai: new Date(), locked: true },
      ]);

      await expect(
        authService.login({ phone: '0900000001', password: 'password' }),
      ).rejects.toThrow(HttpException);

      expect(mockDatabase.query).toHaveBeenCalledTimes(1);
    });

    it('rejects nonexistent user and increments failed attempts without leaking user absence', async () => {
      // 1. Check lockout -> not locked
      mockDatabase.query.mockResolvedValueOnce([]);
      // 2. Query user -> not found
      mockDatabase.query.mockResolvedValueOnce([]);
      // 3. Record failed attempt (transaction) -> attempt 1
      mockDatabase.transaction.mockResolvedValueOnce(1);

      await expect(
        authService.login({ phone: '0999999999', password: 'password' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects locked account with SRS-defined message', async () => {
      // 1. Lockout check -> clean
      mockDatabase.query.mockResolvedValueOnce([]);
      // 2. Query user -> status is 'Đã khóa'
      mockDatabase.query.mockResolvedValueOnce([
        {
          id: 'TK00000005',
          username: 'khoa',
          phone: '0900000005',
          passwordHash: 'hash',
          role: 'Nhân viên',
          status: 'Đã khóa',
        },
      ]);

      await expect(
        authService.login({ phone: '0900000005', password: 'Spa@123456' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('triggers 15-minute temporary lockout on 5th consecutive failed password attempt', async () => {
      const validHash = await passwordService.hash('CorrectPass');

      // 1. Lockout check -> not locked
      mockDatabase.query.mockResolvedValueOnce([]);
      // 2. User exists
      mockDatabase.query.mockResolvedValueOnce([
        {
          id: 'TK00000002',
          username: 'quanly',
          phone: '0900000002',
          passwordHash: validHash,
          role: 'Quản lý',
          status: 'Hoạt động',
        },
      ]);
      // 3. Record failed attempt (transaction) -> reaches 5
      mockDatabase.transaction.mockResolvedValueOnce(5);

      await expect(
        authService.login({ phone: '0900000002', password: 'WrongPassword' }),
      ).rejects.toThrow('Bạn đã nhập sai quá số lần cho phép. Vui lòng thử lại sau 15 phút.');
    });

    it('successfully logs in, clears lockout history, returns profile and signs JWT', async () => {
      const validHash = await passwordService.hash('Spa@123456');

      // 1. Lockout check -> not locked
      mockDatabase.query.mockResolvedValueOnce([]);
      // 2. User query
      mockDatabase.query.mockResolvedValueOnce([
        {
          id: 'TK00000001',
          username: 'admin',
          phone: '0900000001',
          passwordHash: validHash,
          role: 'Chủ Spa',
          status: 'Hoạt động',
        },
      ]);
      // 3. Reset failed attempts (transaction) -> not locked
      mockDatabase.transaction.mockResolvedValueOnce(false);
      // 4. Permissions query
      mockDatabase.query.mockResolvedValueOnce([
        { code: 'Q01', name: 'Quản lý lịch hẹn' },
        { code: 'Q02', name: 'Quản lý khách hàng' },
      ]);
      // 5. NhanVien profile query
      mockDatabase.query.mockResolvedValueOnce([
        { entityId: 'NV00000001', fullName: 'Nguyễn Văn Chủ' },
      ]);

      const result = await authService.login({ phone: '0900000001', password: 'Spa@123456' });

      expect(mockDatabase.transaction).toHaveBeenCalledTimes(1);
      expect(result.token).toBe('test-jwt-token');
      expect(result.user).toEqual({
        id: 'TK00000001',
        username: 'admin',
        phone: '0900000001',
        role: 'Chủ Spa',
        fullName: 'Nguyễn Văn Chủ',
        permissions: ['Q01', 'Q02'],
        entityId: 'NV00000001',
      });
    });
  });

  describe('AuthService getMe (Session Validation)', () => {
    it('invalidates session if user is deactivated or deleted in database (NFR-05)', async () => {
      mockDatabase.query.mockResolvedValueOnce([
        { id: 'TK00000001', status: 'Đã khóa' },
      ]);

      await expect(authService.getMe('TK00000001')).rejects.toThrow(UnauthorizedException);
    });
  });
});
