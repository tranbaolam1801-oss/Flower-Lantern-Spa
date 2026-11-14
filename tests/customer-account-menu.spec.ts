import { test, expect, type Page } from '@playwright/test';

// UI regression only: every API request is intercepted; no real account/session/data is changed.
async function accountFixture(page: Page, role = 'Khách hàng') {
  let authenticated = true;
  let logoutCalls = 0;
  const profile = {
    id: 'TK_UI', role, status: 'Hoạt động', phone: '0900000000', entityId: 'KH_UI',
    fullName: 'Customer UI', email: null, gender: null, birthDate: null, address: null, avatarUrl: null as string | null,
    editable: { fullName: true, avatar: true, email: true, gender: true, birthDate: true, address: true },
  };
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me') return route.fulfill({ status: authenticated ? 200 : 401,
      json: authenticated ? { success: true, user: { ...profile, permissions: ['Q01', 'Q02', 'Q03', 'Q04', 'Q05', 'Q06'] } } : { message: 'Unauthenticated UI fixture' } });
    if (path === '/api/auth/logout') { authenticated = false; logoutCalls++; return route.fulfill({ json: { success: true } }); }
    if (path === '/api/me/avatar') { profile.avatarUrl = '/assets/lotus-decor.png'; return route.fulfill({ json: { avatarUrl: profile.avatarUrl } }); }
    if (path === '/api/me') {
      if (route.request().method() === 'PATCH') Object.assign(profile, route.request().postDataJSON());
      return route.fulfill({ json: { profile } });
    }
    return route.fulfill({ json: { items: [], page: 1, limit: 12, unread: 0 } });
  });
  return { logoutCalls: () => logoutCalls, profile };
}

for (const [width, height] of [[1920, 1080], [1366, 768], [1024, 768], [768, 1024], [390, 844], [375, 812]]) {
  test(`CUSTOMER menu/navigation/accessibility ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const fixture = await accountFixture(page);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    const trigger = page.getByRole('button', { name: 'Tài khoản khách hàng', exact: true });
    const menu = page.getByRole('menu');
    await expect(trigger).toBeVisible();
    await expect(page.locator('.customer-header .account-menu')).toHaveCount(1);
    await expect(page.locator('.customer-header .account-text-link,.customer-header .account-logout')).toHaveCount(0);
    await expect(menu).toHaveCount(0);
    await trigger.click();
    await expect(page).toHaveURL(/\/$/); // Avatar opens menu, never navigates straight to profile.
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(menu.getByRole('menuitem')).toHaveText(['Thông tin cá nhân', 'Lịch hẹn của tôi', 'Đăng xuất']);
    const box = await menu.boundingBox();
    const avatar = await trigger.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    expect(box!.y).toBeGreaterThanOrEqual(avatar!.y + avatar!.height);
    const centerIsMenu = await menu.evaluate(el => {
      const r = el.getBoundingClientRect();
      return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    });
    expect(centerIsMenu).toBe(true);
    if (width === 1366 || width === 375) await page.screenshot({ path: `test-results/customer-menu-${width}.png`, clip: { x: 0, y: 0, width, height: 330 } });
    await trigger.click();
    await expect(menu).toHaveCount(0);
    await trigger.click();
    await page.mouse.click(8, 300); // Outside the panel at every tested viewport (no covered text target).
    await expect(menu).toHaveCount(0);
    await trigger.focus();
    await page.keyboard.press('ArrowUp');
    await expect(menu.getByRole('menuitem').last()).toBeFocused();
    await page.keyboard.press('Home');
    await expect(menu.getByRole('menuitem').first()).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(menu.getByRole('menuitem').nth(1)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(menu.getByRole('menuitem').first()).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(menu).toHaveCount(0);
    await trigger.click();
    await menu.getByRole('menuitem', { name: 'Thông tin cá nhân', exact: true }).click();
    await expect(page).toHaveURL(/\/ho-so$/);
    await expect(menu).toHaveCount(0);
    await expect(page.locator('.profile-hero-text strong')).toHaveText(fixture.profile.fullName);
    if (width === 1366) {
      await page.getByRole('button', { name: 'Chỉnh sửa thông tin', exact: true }).click();
      await page.locator('#pf-name').fill('Updated UI customer');
      await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
      await expect(page.locator('.profile-hero-text strong')).toHaveText('Updated UI customer');
      await page.getByTestId('avatar-input').setInputFiles({ name: 'ui-avatar.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') });
      await page.getByRole('button', { name: 'Lưu ảnh', exact: true }).click();
      await expect(trigger.locator('img')).toHaveAttribute('src', '/assets/lotus-decor.png');
    }
    await trigger.click();
    await menu.getByRole('menuitem', { name: 'Lịch hẹn của tôi', exact: true }).click();
    await expect(page).toHaveURL(/\/lich-hen-cua-toi$/);
    await expect(menu).toHaveCount(0);
    await page.reload();
    await expect(trigger).toBeVisible();
    await expect(menu).toHaveCount(0);
    await trigger.click();
    // A route change initiated outside the menu must dismiss it too.
    await page.locator('.brand-home-link').click();
    await expect(page).toHaveURL(/\/$/);
    await expect(menu).toHaveCount(0);
    if (width <= 1024) {
      await page.getByRole('button', { name: 'Mở menu', exact: true }).click();
      await expect(page.locator('.customer-drawer[open] a[href="/lich-hen-cua-toi"]')).toHaveCount(0);
      await page.getByRole('button', { name: 'Đóng menu', exact: true }).click();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await trigger.click();
    await menu.getByRole('menuitem', { name: 'Đăng xuất', exact: true }).click();
    await expect(page).toHaveURL(/\/dang-nhap$/);
    expect(fixture.logoutCalls()).toBe(1);
    await page.goto('/');
    await expect(trigger).toHaveCount(0);
    await expect(page.locator('.header-account-icon-btn')).toBeVisible();
    expect(errors).toEqual([]);
  });
}

for (const role of ['Chủ Spa', 'Quản lý', 'Nhân viên']) {
  test(`admin header unchanged for ${role}`, async ({ page }) => {
    await accountFixture(page, role);
    await page.goto('/admin/ho-so?menu-test=start');
    const root = page.locator('.account-menu-admin');
    await expect(root.locator('.account-profile-link')).toHaveAttribute('href', '/admin/ho-so');
    await root.locator('.account-role-trigger').click();
    await expect(root.locator('.account-dropdown button')).toHaveText(['Đăng xuất']);
    await expect(root.locator('.account-dropdown a')).toHaveCount(0);
    await expect(root.locator('.account-menu-customer')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(root.locator('.account-dropdown')).toHaveCount(0);
    await root.locator('.account-profile-link').click();
    await expect(page).toHaveURL(/\/admin\/ho-so$/);
  });
}
