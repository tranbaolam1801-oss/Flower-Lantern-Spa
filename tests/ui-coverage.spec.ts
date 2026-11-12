import { expect, test } from '@playwright/test';
import { viewports } from './responsive';

const mockServices = [
  {
    id: 'DV01',
    name: 'Massage thư giãn toàn thân',
    description: 'Thả lỏng cơ thể với tinh dầu thiên nhiên và kỹ thuật ấn huyệt dịu nhẹ.',
    image: null,
    categoryId: 'DM01',
    categoryName: 'Massage',
    minDuration: 90,
    priceFrom: 450000,
  },
  {
    id: 'DV02',
    name: 'Chăm sóc da mặt chuyên sâu',
    description: 'Làm sạch sâu, cấp ẩm và phục hồi làn da rạng rỡ.',
    image: null,
    categoryId: 'DM02',
    categoryName: 'Chăm sóc da',
    minDuration: 60,
    priceFrom: 520000,
  },
];

const mockDetail = {
  id: 'DV01',
  name: 'Massage thư giãn toàn thân',
  categoryId: 'DM01',
  categoryName: 'Massage',
  description: 'Thả lỏng cơ thể với tinh dầu thiên nhiên.',
  details: 'Liệu trình kéo dài 60–90 phút giúp lưu thông khí huyết và phục hồi năng lượng.',
  image: null,
  benefits: 'Giảm căng cơ\nNgủ ngon sâu giấc',
  procedureSteps: 'Tư vấn liệu trình\nMassage tinh dầu\nThưởng trà thảo mộc',
  suitableFor: 'Nhân viên văn phòng\nNgười cần thư giãn',
  notes: 'Đến sớm 10 phút trước giờ hẹn.',
  packages: [
    { id: 'GOI01', name: 'Gói 60 phút', durationMinutes: 60, price: 450000 },
    { id: 'GOI02', name: 'Gói 90 phút', durationMinutes: 90, price: 620000 },
  ],
};

test.describe('Frontend UI, Homepage & Public Routes (no DB mutation)', () => {
  test('Homepage renders all required sections, green booking CTAs, English logo & responsive across 9 viewports', async ({ page }) => {
    await page.route('**/api/services*', (route) =>
      route.fulfill({ json: { items: mockServices, page: 1, limit: 4 } }),
    );
    await page.route('**/api/reviews/public', (route) =>
      route.fulfill({ status: 404, json: { message: 'Not Found' } }),
    );

    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);

    // Logo tiếng Anh chuẩn Figma 3:3233
    const logo = page.locator('.customer-header .brand-logo-shared');
    await expect(logo).toHaveAttribute('src', '/assets/flower-lantern-logo.png');

    // Sections cốt lõi của Trang chủ
    await expect(page.getByRole('heading', { name: 'Thư giãn, phục hồi và chăm sóc toàn diện' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Hoa Đăng Spa', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Các liệu trình chăm sóc tại Hoa Đăng Spa' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Đặt lịch ngay hôm nay' })).toBeVisible();
    await expect(page.getByText('102 Bà Triệu, Phường Hội An, Thành Phố Đà Nẵng').first()).toBeVisible();
    await expect(page.getByText('08:00 – 22:00 (Tất cả các ngày)').first()).toBeVisible();

    // Kiểm tra nút CTA "Đặt lịch ngay" có màu xanh lá (green channel > red channel)
    const ctaBtn = page.locator('.home-cta-button');
    await expect(ctaBtn).toBeVisible();
    const bgColor = await ctaBtn.evaluate((el) => getComputedStyle(el).backgroundColor);
    const match = bgColor.match(/\d+/g);
    expect(match).not.toBeNull();
    const [r, g, b] = match!.map(Number);
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);

    // Kiểm tra ảnh không bị lỗi
    for (const img of await page.locator('img:visible').all()) {
      expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
    }

    // Kiểm tra responsive cả 9 viewport
    for (const vp of viewports) {
      await page.setViewportSize(vp);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(vp.width);
      if ([1440, 390].includes(vp.width)) {
        await page.screenshot({ path: `test-results/homepage-${vp.width}.png`, fullPage: true });
      }
    }
  });

  test('Public catalog (/dich-vu), detail (/dich-vu/:id) and booking (/dat-lich) routes work with 08:00-22:00 hours', async ({ page }) => {
    await page.route('**/api/services', (route) =>
      route.fulfill({ json: { items: mockServices, page: 1, limit: 12 } }),
    );
    await page.route('**/api/services?*', (route) =>
      route.fulfill({ json: { items: mockServices, page: 1, limit: 12 } }),
    );
    await page.route('**/api/services/DV01', (route) =>
      route.fulfill({ json: mockDetail }),
    );

    await page.goto('/dich-vu');
    await expect(page.getByRole('heading', { name: 'Liệu trình chăm sóc & thư giãn' })).toBeVisible();
    await expect(page.getByText('Massage thư giãn toàn thân')).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: 'test-results/services-1440.png', fullPage: true });

    await page.getByRole('link', { name: 'Xem chi tiết →' }).first().click();
    await expect(page).toHaveURL(/\/dich-vu\/DV01$/);
    await expect(page.getByRole('heading', { name: 'Massage thư giãn toàn thân' })).toBeVisible();
    await expect(page.getByText('Gói 90 phút')).toBeVisible();
    await page.screenshot({ path: 'test-results/service-detail-1440.png', fullPage: true });

    await page.getByRole('button', { name: 'Đặt lịch ngay' }).last().click();
    await expect(page).toHaveURL(/\/dat-lich/);
    await expect(page.getByRole('heading', { name: 'Đặt lịch hẹn' })).toBeVisible();
    await expect(page.getByText('Giờ hẹn (08:00 – 22:00)')).toBeVisible();
    await page.screenshot({ path: 'test-results/booking-1440.png', fullPage: true });

    for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(vp);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(vp.width);
    }
  });

  test('Customer login (/dang-nhap) and personal bookings (/lich-hen-cua-toi) visual capture', async ({ page }) => {
    await page.route('**/api/auth/me', (route) => route.fulfill({ status: 401, json: { message: 'Unauthorized' } }));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/dang-nhap');
    await expect(page.getByRole('heading', { name: 'Đăng nhập' })).toBeVisible();
    await page.screenshot({ path: 'test-results/customer-login-1440.png', fullPage: true });

    await page.route('**/api/auth/me', (route) =>
      route.fulfill({
        json: {
          success: true,
          user: {
            id: 'TK00000004',
            username: 'khachhang',
            phone: '0900000004',
            role: 'Khách hàng',
            fullName: 'Phạm Thị Khách',
            permissions: [],
          },
        },
      }),
    );
    await page.route('**/api/me/bookings', (route) =>
      route.fulfill({
        json: {
          items: [
            {
              id: 'LH00128',
              date: '2026-11-15',
              time: '10:00',
              createdAt: '2026-11-11T09:00:00',
              status: 'Chờ xác nhận',
              paymentStatus: 'Chưa thanh toán',
              services: [
                {
                  id: 'CT01',
                  name: 'Massage thư giãn toàn thân',
                  packageName: 'Gói thư giãn 90 phút',
                  startsAt: '10:00',
                  endsAt: '11:30',
                },
              ],
            },
            {
              id: 'LH00112',
              date: '2026-11-05',
              time: '09:30',
              createdAt: '2026-11-01T10:00:00',
              status: 'Hoàn thành',
              paymentStatus: 'Đã thanh toán',
              hasReview: false,
              services: [
                {
                  id: 'CT02',
                  name: 'Gội đầu dưỡng sinh',
                  packageName: 'Gói gội đầu 45 phút',
                  startsAt: '09:30',
                  endsAt: '10:15',
                },
              ],
            },
          ],
        },
      }),
    );

    await page.goto('/lich-hen-cua-toi');
    await expect(page.getByRole('heading', { name: 'Lịch hẹn của tôi' })).toBeVisible();
    await expect(page.getByText('LH00128')).toBeVisible();
    await page.screenshot({ path: 'test-results/my-bookings-1440.png', fullPage: true });
    for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(vp);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(vp.width);
    }
  });

  test('Admin management screens render shared ManagementSidebar and responsive layout', async ({ page }) => {
    await page.route('**/api/auth/me', (route) =>
      route.fulfill({
        json: {
          success: true,
          user: {
            id: 'TK00000001',
            username: 'admin',
            phone: '0900000001',
            role: 'Chủ Spa',
            fullName: 'Nguyễn Văn Chủ',
            permissions: ['Q01', 'Q02', 'Q03', 'Q04', 'Q05', 'Q06'],
          },
        },
      }),
    );
    await page.route('**/api/reviews?*', (route) =>
      route.fulfill({ json: { items: [], page: 1, hasNext: false } }),
    );
    await page.route('**/api/employees?*', (route) =>
      route.fulfill({ json: { items: [], page: 1, hasNext: false } }),
    );
    await page.route('**/api/admin/services?*', (route) =>
      route.fulfill({ json: { items: [], categories: [{ id: 'DM01', name: 'Massage' }], page: 1, hasNext: false } }),
    );
    await page.route('**/api/reports/**', (route) =>
      route.fulfill({ json: { totalUsage: 0, items: [], newCustomers: 0, returningCustomers: 0, topCustomers: [], totalRevenue: 0, series: [] } }),
    );

    for (const [path, heading, shot] of [
      ['/admin/tong-quan', 'Tổng quan vận hành Hoa Đăng Spa', 'admin-overview-1440.png'],
      ['/admin/danh-gia', 'Quản lý đánh giá & phản hồi', 'admin-reviews-1440.png'],
      ['/admin/nhan-vien', 'Danh sách nhân viên', 'admin-employees-1440.png'],
      ['/admin/dich-vu', 'Quản lý dịch vụ', 'admin-services-1440.png'],
      ['/admin/bao-cao', 'Báo cáo thống kê', 'admin-reports-1440.png'],
    ] as const) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(path);
      await expect(page.getByRole('heading', { name: heading })).toBeAttached();
      await expect(page.locator('.desktop-sidebar .admin-sidebar')).toBeVisible();
      await expect(page.locator('.desktop-sidebar .admin-sidebar button.active')).toHaveCount(1);
      await page.screenshot({ path: `test-results/${shot}`, fullPage: true });

      for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(vp);
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(vp.width);
      }
    }
  });
});
