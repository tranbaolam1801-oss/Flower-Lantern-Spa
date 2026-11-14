import { test, expect, type Page } from '@playwright/test';

// Browser UI fixtures only; persistence/access boundaries are covered separately by PostgreSQL API tests.
async function fixture(page: Page, role = 'Chủ Spa') {
  const state = { avatar: '/api/uploads/avatars/one.png', thirdAvatar: null as string | null, employeeReads: 0, calendarReads: 0, outside: false };
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const user = { id: 'TK_UI', username: 'owner', role, fullName: 'Owner UI', phone: '0900000000', permissions: ['Q01', 'Q03', 'Q05'] };
    if (path === '/api/auth/me') return route.fulfill({ json: { success: true, user } });
    if (path === '/api/me') return route.fulfill({ json: { profile: { ...user, avatarUrl: null, editable: { avatar: true, fullName: true } } } });
    if (path.startsWith('/api/uploads/avatars/')) {
      const index = path.includes('two') ? 2 : path.includes('three') ? 3 : 1;
      return route.fulfill({ contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="${['', '#e4b69c', '#a1c5d0', '#d9c27f'][index]}"/><text x="32" y="42" text-anchor="middle" font-size="30">${index}</text></svg>` });
    }
    if (path === '/api/employees') {
      state.employeeReads++;
      return route.fulfill({ json: { items: [state.avatar, '/api/uploads/avatars/two.png', state.thirdAvatar].map((avatarUrl, i) => ({ id: `NV${i}`, accountId: `TK${i}`, fullName: `Nhân viên UI ${i}`, role: 'Nhân viên', workStatus: 'Đang làm việc', accountStatus: 'Hoạt động', avatarUrl })) } });
    }
    if (path === '/api/bookings') {
      state.calendarReads++;
      const date = url.searchParams.get('date') || '2026-11-14';
      const items = [{ id: 'ITEM', bookingId: 'LH_UI', bedId: 'G1', customerName: 'Khách UI', serviceName: 'Liệu trình UI', packageName: '120 phút', status: 'Chưa đến', paymentStatus: 'Chưa thanh toán', startsAt: `${date}T15:00:00`, endsAt: `${date}T17:00:00`, startMinute: 900, endMinute: 1020 }];
      if (state.outside) items.push({ ...items[0], id: 'LEGACY', bookingId: 'LH_OLD', startMinute: 420, endMinute: 450, startsAt: `${date}T07:00:00`, endsAt: `${date}T07:30:00` });
      return route.fulfill({ json: { date, beds: Array.from({ length: 15 }, (_, i) => ({ id: `G${i + 1}` })), items } });
    }
    return route.fulfill({ json: { items: [], total: 0, unread: 0 } });
  });
  return state;
}

for (const role of ['Chủ Spa', 'Quản lý']) {
  test(`Dashboard distinct avatars, fallback, cross-tab invalidation and reload: ${role}`, async ({ page, context }) => {
    const state = await fixture(page, role);
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('/admin/tong-quan');
    const images = page.locator('.dash-staff img');
    await expect(images).toHaveCount(3);
    await expect(images.nth(0)).toHaveAttribute('src', state.avatar);
    await expect(images.nth(1)).toHaveAttribute('src', '/api/uploads/avatars/two.png');
    await expect(images.nth(2)).toHaveAttribute('src', '/assets/admin-imgAdminAvatar.png');
    expect(await images.evaluateAll(imgs => imgs.every(i => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0))).toBe(true);
    const other = await context.newPage();
    await fixture(other, role);
    await other.goto('/admin/ho-so');
    state.avatar = '/api/uploads/avatars/new.png';
    state.thirdAvatar = '/api/uploads/avatars/three.png';
    const before = state.employeeReads;
    await other.evaluate(async () => { const { notifyAvatarUpdated } = await import('/src/lib/avatar-events.ts'); notifyAvatarUpdated(); });
    await expect.poll(() => state.employeeReads).toBeGreaterThan(before);
    await expect(images.nth(0)).toHaveAttribute('src', state.avatar);
    await expect(images.nth(2)).toHaveAttribute('src', state.thirdAvatar);
    await page.reload();
    await expect(images.nth(0)).toHaveAttribute('src', state.avatar);
    await page.screenshot({ path: `test-results/dashboard-avatars-${role === 'Chủ Spa' ? 'owner' : 'manager'}.png`, fullPage: true });
    expect(errors).toEqual([]);
  });
}

for (const [width, height] of [[1366, 768], [1536, 864], [1920, 1080], [2560, 1440]]) {
  test(`calendar hours, geometry, scroll, clicks and overflow ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    // UTC06:30 == Vietnam13:30; later frozen-time cases assert the exact requested hours.
    await page.clock.install({ time: new Date('2026-11-14T06:30:00Z') });
    await fixture(page);
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('/admin/lich-hen');
    const grid = page.locator('.bed-calendar');
    await expect(grid).toBeVisible();
    await expect(page.locator('.hour-row>span')).toHaveText(Array.from({ length: 14 }, (_, i) => `${String(i + 8).padStart(2, '0')}:00`));
    await expect(page.locator('.calendar-end-hour')).toHaveText('22:00');
    await expect(page.locator('.calendar-grid-header>span')).toHaveCount(16);
    const appointment = page.locator('button.calendar-appointment');
    await expect(appointment).toHaveCount(1);
    expect(await appointment.evaluate(el => ({ top: el.style.top, height: el.style.height }))).toEqual({ top: '394px', height: '108px' });
    await expect(page.locator('.calendar-now-line')).toHaveAttribute('aria-label', 'Giờ hiện tại 13:30');
    const manualScroll = await grid.evaluate(el => { el.scrollTop = 112; el.scrollLeft = 180; return el.scrollTop; });
    await page.clock.fastForward(60_000);
    expect(await grid.evaluate(el => el.scrollTop)).toBe(manualScroll);
    // Header and time column remain pinned to their scrollport while both axes scroll.
    const bounds = await grid.boundingBox();
    const heading = await page.locator('.calendar-grid-header').boundingBox();
    const label = await page.locator('.hour-row>span').nth(3).boundingBox();
    expect(Math.abs(heading!.y - bounds!.y)).toBeLessThan(3);
    expect(Math.abs(label!.x - bounds!.x)).toBeLessThan(3);
    await grid.evaluate(el => { el.scrollLeft = 0; el.scrollTop = 336; });
    await appointment.click();
    await expect(page.locator('.booking-detail')).toBeVisible();
    await page.keyboard.press('Escape');
    // Closing summary uses its existing button (not all dialogs implement native Escape).
    const close = page.locator('.booking-detail button').filter({ hasText: /Đóng|×/ }).first();
    if (await close.isVisible()) await close.click();
    await page.getByLabel('Ngày xem lịch').fill('2026-11-15');
    await expect.poll(() => grid.evaluate(el => el.scrollTop)).toBe(0);
    await expect(page.locator('.calendar-now-line')).toHaveCount(0);
    await page.getByTitle('Tạo lịch giường G1 lúc 08:00', { exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Tạo lịch hẹn', exact: true })).toBeVisible();
    await expect(page.getByLabel('Giờ bắt đầu (08:00–22:00)', { exact: true })).toHaveValue('08:00');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Hôm nay', exact: true }).click();
    const todayScroll = await grid.evaluate(el => Math.min(5 * 56, Math.max(0, el.scrollHeight - el.clientHeight)));
    await expect.poll(() => grid.evaluate(el => el.scrollTop)).toBe(todayScroll);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/calendar-${width}.png`, fullPage: true });
    expect(errors).toEqual([]);
  });
}

for (const time of ['06:30', '09:30', '14:45', '19:20', '22:30']) {
  test(`Vietnam initial scroll ${time}, same-day reset, no refetch reset`, async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    const hour = Number(time.slice(0, 2));
    await page.clock.install({ time: new Date(Date.UTC(2026, 10, 14, hour - 7, Number(time.slice(3)))) });
    const state = await fixture(page);
    await page.goto('/admin/lich-hen');
    const grid = page.locator('.bed-calendar');
    await expect(grid).toBeVisible();
    const expected = await grid.evaluate((el, h) => Math.min(Math.max(0, (h - 8) * 56), el.scrollHeight - el.clientHeight), hour);
    await expect.poll(() => grid.evaluate(el => el.scrollTop)).toBe(expected);
    await expect(page.locator('.calendar-now-line')).toHaveCount(hour >= 8 && hour < 22 ? 1 : 0);
    await grid.evaluate(el => { el.scrollTop = 100; });
    const before = state.calendarReads;
    await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
    await expect.poll(() => state.calendarReads).toBeGreaterThan(before);
    await page.clock.fastForward(60_000);
    expect(await grid.evaluate(el => el.scrollTop)).toBe(100);
    await page.getByRole('button', { name: 'Hôm nay', exact: true }).click();
    await expect.poll(() => grid.evaluate(el => el.scrollTop)).toBe(expected);
    if (hour >= 9) await expect(page.locator('.hour-cell-past').first()).toHaveAttribute('aria-disabled', 'true');
  });
}

test('out-of-hours history is reported, not removed from data or silently hidden', async ({ page }) => {
  const state = await fixture(page);
  state.outside = true;
  await page.goto('/admin/lich-hen');
  await expect(page.locator('.calendar-outside-hours')).toContainText('LH_OLD');
  await expect(page.locator('.calendar-outside-hours')).toContainText('07:00–07:30');
});
