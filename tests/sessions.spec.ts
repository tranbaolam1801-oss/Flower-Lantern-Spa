import { test, expect } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { DataSource } from 'typeorm';
import * as argon2 from 'argon2';
const load=createRequire(import.meta.url);

test.describe('Migration 004 Test-only browser acceptance',()=>{
  test.skip(process.env.RUN_SESSION_E2E!=='1','Opt-in Test database fixture');
  let source:DataSource,owned=false;
  const password=randomBytes(24).toString('hex');
  const id='E2ESES0001',phone='0999970001';
  test.beforeAll(async()=>{
    const {databaseOptions}=load('../backend/dist/config.js');
    source=await new DataSource(databaseOptions({DB_AUTH:'windows',DB_HOST:'localhost',DB_NAME:'FlowerLanternSpa_Test'})).initialize();
    const database=await source.query('SELECT DB_NAME() AS name');
    if(database[0].name!=='FlowerLanternSpa_Test')throw new Error('Test-only fixture');
    const hash=await argon2.hash(password,{type:argon2.argon2id});
    await source.query(`INSERT dbo.TaiKhoan(MaTaiKhoan,TenDangNhap,SoDienThoai,MatKhauBam,VaiTro,TrangThai) VALUES(@0,'session-e2e',@1,@2,N'Khách hàng',N'Hoạt động')`,[id,phone,hash]);owned=true;
  });
  test.afterAll(async()=>{
    if(owned)await source.transaction(async m=>{await m.query('DELETE dbo.PhienDangNhap WHERE MaTaiKhoan=@0; DELETE dbo.KhoaDangNhap WHERE SoDienThoai=@1; DELETE dbo.TaiKhoan WHERE MaTaiKhoan=@0',[id,phone]);});
    if(source?.isInitialized)await source.destroy();
  });
  test('real login, refresh, logout and copied-cookie replay across devices',async({page,browser})=>{
    async function login(target:typeof page) {
      await target.goto('/dang-nhap');await target.locator('#phone').fill(phone);await target.locator('#password').fill(password);
      const response=target.waitForResponse(r=>r.url().endsWith('/api/auth/login'));
      await target.getByRole('button',{name:'Đăng nhập',exact:true}).click();expect((await response).status()).toBe(200);
      await expect(target).toHaveURL(/\/lich-hen-cua-toi$/);
    }
    await login(page);
    const cookie=(await page.context().cookies()).find(c=>c.name==='access_token')!;expect(cookie.httpOnly).toBe(true);
    const other=await browser.newContext({baseURL:'http://127.0.0.1:5183'});
    try {
      const second=await other.newPage();await login(second);
      await page.reload();await page.getByLabel('Tài khoản',{exact:true}).click();await page.getByRole('button',{name:'Đăng xuất'}).click();
      await expect(page).toHaveURL(/\/dang-nhap$/);
      expect((await page.request.get('/api/auth/me',{headers:{Cookie:`access_token=${cookie.value}`}})).status()).toBe(401);
      expect((await other.request.get('/api/auth/me')).status()).toBe(200);
      await second.reload();await expect(second.getByRole('heading',{name:'Lịch hẹn của tôi'})).toBeVisible();
      await source.query(`UPDATE dbo.TaiKhoan SET TrangThai=N'Đã khóa' WHERE MaTaiKhoan=@0`,[id]);
      expect((await other.request.get('/api/auth/me')).status()).toBe(401);
      await source.query(`UPDATE dbo.TaiKhoan SET TrangThai=N'Hoạt động' WHERE MaTaiKhoan=@0`,[id]);
      expect((await other.request.get('/api/auth/me')).status()).toBe(401);
    } finally {await other.close();}
  });
});
