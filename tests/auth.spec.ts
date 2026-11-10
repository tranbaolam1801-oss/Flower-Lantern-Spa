import { test, expect } from '@playwright/test';

// Opt-in against existing, synthetic development seed. No seed/migration run here.
// Successful login only clears failed-attempt state for the supplied dev accounts.
test.describe('React → NestJS → SQL Server authentication', () => {
  test.skip(process.env.RUN_AUTH_E2E !== '1', 'Requires reviewed development accounts');
  for (const [phone, role, route] of [
    ['0900000001', 'Chủ Spa', '/admin/lich-hen'],
    ['0900000002', 'Quản lý', '/admin/lich-hen'],
    ['0900000003', 'Nhân viên', '/admin/lich-hen'],
    ['0900000004', 'Khách hàng', '/lich-hen-cua-toi'],
  ]) {
    test(`${role}: login, reload, role boundary and logout`, async ({ page, context }) => {
      const password = process.env.E2E_DEV_PASSWORD;
      if (!password) throw new Error('E2E_DEV_PASSWORD required');
      await page.goto('/dang-nhap');
      await page.locator('#phone').fill(phone);
      await page.locator('#password').fill(password);
      await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${route}$`));
      if (role === 'Khách hàng') {
        await expect(page.getByRole('heading',{name:'Lịch hẹn của tôi'})).toBeVisible();
        await expect(page.getByText('Bạn chưa có lịch hẹn nào!',{exact:true})).toBeVisible();
        expect((await page.request.get('/api/bookings')).status()).toBe(403);
      } else {
        await expect(page.locator('.calendar-grid-header span')).toHaveCount(21);
        if (role === 'Nhân viên') await expect(page.getByRole('button',{name:'Quản lý nhân viên',exact:true})).toHaveCount(0);
      }
      await page.evaluate(()=>document.fonts.ready);
      for (const img of await page.locator('img:visible').all()) expect(await img.evaluate((el:HTMLImageElement)=>el.naturalWidth)).toBeGreaterThan(0);
      await page.screenshot({path:`test-results/dashboard-${phone}.png`,fullPage:true});
      await page.getByLabel('Tài khoản',{exact:true}).click();
      await expect(page.getByRole('button', { name: 'Đăng xuất' })).toBeVisible();
      const cookie = (await context.cookies()).find(c => c.name === 'access_token');
      expect(cookie?.httpOnly).toBe(true);
      expect(await page.evaluate(() => document.cookie)).not.toContain('access_token');
      await page.reload();
      await page.getByLabel('Tài khoản',{exact:true}).click();
      await expect(page.getByRole('button', { name: 'Đăng xuất' })).toBeVisible();
      await page.goto(role === 'Khách hàng' ? '/admin/lich-hen' : '/lich-hen-cua-toi');
      await expect(page).toHaveURL(new RegExp(`${route}$`));
      await page.getByLabel('Tài khoản',{exact:true}).click();
      await page.getByRole('button', { name: 'Đăng xuất' }).click();
      await expect(page).toHaveURL(/\/dang-nhap$/);
      expect((await context.cookies()).find(c => c.name === 'access_token')).toBeUndefined();
      await page.goto(route);
      await expect(page).toHaveURL(/\/dang-nhap$/);
    });
  }
});
