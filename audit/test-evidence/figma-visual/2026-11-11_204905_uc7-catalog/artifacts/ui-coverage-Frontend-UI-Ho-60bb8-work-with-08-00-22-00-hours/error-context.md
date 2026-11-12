# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ui-coverage.spec.ts >> Frontend UI, Homepage & Public Routes (no DB mutation) >> Public catalog (/dich-vu), detail (/dich-vu/:id) and booking (/dat-lich) routes work with 08:00-22:00 hours
- Location: tests\ui-coverage.spec.ts:94:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('link', { name: 'Xem chi tiết →' }).first()

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - banner [ref=e4]:
    - link "Về trang chủ Flower Lantern Spa" [ref=e5] [cursor=pointer]:
      - /url: /
      - img "Flower Lantern Spa" [ref=e6]
    - navigation "Điều hướng khách hàng" [ref=e7]:
      - button "Trang chủ" [ref=e8] [cursor=pointer]
      - button "Giới thiệu" [ref=e9] [cursor=pointer]
      - button "Dịch vụ" [ref=e10] [cursor=pointer]
      - button "Đặt lịch" [ref=e11] [cursor=pointer]
      - button "Liên hệ" [ref=e12] [cursor=pointer]
    - generic [ref=e13]:
      - button "Đăng nhập" [ref=e14] [cursor=pointer]
      - button "Đặt lịch ngay" [ref=e15] [cursor=pointer]
  - generic [ref=e17]:
    - paragraph [ref=e18]: DỊCH VỤ
    - heading "Liệu trình chăm sóc & thư giãn" [level=1] [ref=e20]
    - generic [ref=e21]: Trải nghiệm các dịch vụ massage, chăm sóc da và dưỡng sinh được thiết kế riêng tại FLOWERLANTERN SPA.
  - main [ref=e22]:
    - generic [ref=e24]:
      - searchbox "Nhập tên dịch vụ cần tìm" [ref=e25]
      - button "Tìm kiếm" [ref=e26] [cursor=pointer]
    - group "Lọc theo danh mục" [ref=e27]:
      - button "Tất cả" [pressed] [ref=e28] [cursor=pointer]
      - button "Massage" [ref=e30] [cursor=pointer]
      - button "Chăm sóc da" [ref=e32] [cursor=pointer]
      - button "Dưỡng sinh" [ref=e34] [cursor=pointer]
      - button "Chăm sóc body" [ref=e36] [cursor=pointer]
      - button "Gội đầu dưỡng sinh" [ref=e38] [cursor=pointer]
    - generic [ref=e40]:
      - article [ref=e41]:
        - img "Massage thư giãn toàn thân" [ref=e43]
        - generic [ref=e44]:
          - generic [ref=e45]: Massage
          - generic [ref=e46]: 90 phút
        - generic [ref=e48]:
          - heading "Massage thư giãn toàn thân" [level=3] [ref=e49]
          - paragraph [ref=e50]: Thả lỏng cơ thể với tinh dầu thiên nhiên và kỹ thuật ấn huyệt dịu nhẹ.
          - generic [ref=e51]:
            - strong [ref=e52]: 450.000đ
            - link "Xem chi tiết" [ref=e53] [cursor=pointer]:
              - /url: /dich-vu/DV01
      - article [ref=e56]:
        - img "Chăm sóc da mặt chuyên sâu" [ref=e58]
        - generic [ref=e59]:
          - generic [ref=e60]: Chăm sóc da
          - generic [ref=e61]: 60 phút
        - generic [ref=e63]:
          - heading "Chăm sóc da mặt chuyên sâu" [level=3] [ref=e64]
          - paragraph [ref=e65]: Làm sạch sâu, cấp ẩm và phục hồi làn da rạng rỡ.
          - generic [ref=e66]:
            - strong [ref=e67]: 520.000đ
            - link "Xem chi tiết" [ref=e68] [cursor=pointer]:
              - /url: /dich-vu/DV02
    - navigation "Phân trang dịch vụ" [ref=e71]:
      - button "Trang trước" [disabled]
      - generic [ref=e72]: Trang 1
      - button "Trang sau" [disabled]
  - contentinfo [ref=e73]: © 2026 Hoa Đăng Spa · 102 Bà Triệu, Hội An · Giờ hoạt động 08:00 – 22:00
```

# Test source

```ts
  11  |     categoryName: 'Massage',
  12  |     minDuration: 90,
  13  |     priceFrom: 450000,
  14  |   },
  15  |   {
  16  |     id: 'DV02',
  17  |     name: 'Chăm sóc da mặt chuyên sâu',
  18  |     description: 'Làm sạch sâu, cấp ẩm và phục hồi làn da rạng rỡ.',
  19  |     image: null,
  20  |     categoryId: 'DM02',
  21  |     categoryName: 'Chăm sóc da',
  22  |     minDuration: 60,
  23  |     priceFrom: 520000,
  24  |   },
  25  | ];
  26  | 
  27  | const mockDetail = {
  28  |   id: 'DV01',
  29  |   name: 'Massage thư giãn toàn thân',
  30  |   categoryId: 'DM01',
  31  |   categoryName: 'Massage',
  32  |   description: 'Thả lỏng cơ thể với tinh dầu thiên nhiên.',
  33  |   details: 'Liệu trình kéo dài 60–90 phút giúp lưu thông khí huyết và phục hồi năng lượng.',
  34  |   image: null,
  35  |   benefits: 'Giảm căng cơ\nNgủ ngon sâu giấc',
  36  |   procedureSteps: 'Tư vấn liệu trình\nMassage tinh dầu\nThưởng trà thảo mộc',
  37  |   suitableFor: 'Nhân viên văn phòng\nNgười cần thư giãn',
  38  |   notes: 'Đến sớm 10 phút trước giờ hẹn.',
  39  |   packages: [
  40  |     { id: 'GOI01', name: 'Gói 60 phút', durationMinutes: 60, price: 450000 },
  41  |     { id: 'GOI02', name: 'Gói 90 phút', durationMinutes: 90, price: 620000 },
  42  |   ],
  43  | };
  44  | 
  45  | test.describe('Frontend UI, Homepage & Public Routes (no DB mutation)', () => {
  46  |   test('Homepage renders all required sections, green booking CTAs, English logo & responsive across 9 viewports', async ({ page }) => {
  47  |     await page.route('**/api/services*', (route) =>
  48  |       route.fulfill({ json: { items: mockServices, page: 1, limit: 4 } }),
  49  |     );
  50  |     await page.route('**/api/reviews/public', (route) =>
  51  |       route.fulfill({ status: 404, json: { message: 'Not Found' } }),
  52  |     );
  53  | 
  54  |     await page.goto('/');
  55  |     await page.evaluate(() => document.fonts.ready);
  56  | 
  57  |     // Logo tiếng Anh chuẩn Figma 3:3233
  58  |     const logo = page.locator('.customer-header .brand-logo-shared');
  59  |     await expect(logo).toHaveAttribute('src', '/assets/flower-lantern-logo.png');
  60  | 
  61  |     // Sections cốt lõi của Trang chủ
  62  |     await expect(page.getByRole('heading', { name: 'Thư giãn, phục hồi và chăm sóc toàn diện' })).toBeVisible();
  63  |     await expect(page.getByRole('heading', { name: 'Hoa Đăng Spa', exact: true })).toBeVisible();
  64  |     await expect(page.getByRole('heading', { name: 'Các liệu trình chăm sóc tại Hoa Đăng Spa' })).toBeVisible();
  65  |     await expect(page.getByRole('heading', { name: 'Đặt lịch ngay hôm nay' })).toBeVisible();
  66  |     await expect(page.getByText('102 Bà Triệu, Phường Hội An, Thành Phố Đà Nẵng').first()).toBeVisible();
  67  |     await expect(page.getByText('08:00 – 22:00 (Tất cả các ngày)').first()).toBeVisible();
  68  | 
  69  |     // Kiểm tra nút CTA "Đặt lịch ngay" có màu xanh lá (green channel > red channel)
  70  |     const ctaBtn = page.locator('.home-cta-button');
  71  |     await expect(ctaBtn).toBeVisible();
  72  |     const bgColor = await ctaBtn.evaluate((el) => getComputedStyle(el).backgroundColor);
  73  |     const match = bgColor.match(/\d+/g);
  74  |     expect(match).not.toBeNull();
  75  |     const [r, g, b] = match!.map(Number);
  76  |     expect(g).toBeGreaterThan(r);
  77  |     expect(g).toBeGreaterThan(b);
  78  | 
  79  |     // Kiểm tra ảnh không bị lỗi
  80  |     for (const img of await page.locator('img:visible').all()) {
  81  |       expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  82  |     }
  83  | 
  84  |     // Kiểm tra responsive cả 9 viewport
  85  |     for (const vp of viewports) {
  86  |       await page.setViewportSize(vp);
  87  |       await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(vp.width);
  88  |       if ([1440, 390].includes(vp.width)) {
  89  |         await page.screenshot({ path: `test-results/homepage-${vp.width}.png`, fullPage: true });
  90  |       }
  91  |     }
  92  |   });
  93  | 
  94  |   test('Public catalog (/dich-vu), detail (/dich-vu/:id) and booking (/dat-lich) routes work with 08:00-22:00 hours', async ({ page }) => {
  95  |     await page.route('**/api/services', (route) =>
  96  |       route.fulfill({ json: { items: mockServices, page: 1, limit: 12 } }),
  97  |     );
  98  |     await page.route('**/api/services?*', (route) =>
  99  |       route.fulfill({ json: { items: mockServices, page: 1, limit: 12 } }),
  100 |     );
  101 |     await page.route('**/api/services/DV01', (route) =>
  102 |       route.fulfill({ json: mockDetail }),
  103 |     );
  104 | 
  105 |     await page.goto('/dich-vu');
  106 |     await expect(page.getByRole('heading', { name: 'Liệu trình chăm sóc & thư giãn' })).toBeVisible();
  107 |     await expect(page.getByText('Massage thư giãn toàn thân')).toBeVisible();
  108 |     await page.setViewportSize({ width: 1440, height: 900 });
  109 |     await page.screenshot({ path: 'test-results/services-1440.png', fullPage: true });
  110 | 
> 111 |     await page.getByRole('link', { name: 'Xem chi tiết →' }).first().click();
      |                                                                      ^ Error: locator.click: Test timeout of 30000ms exceeded.
  112 |     await expect(page).toHaveURL(/\/dich-vu\/DV01$/);
  113 |     await expect(page.getByRole('heading', { name: 'Massage thư giãn toàn thân' })).toBeVisible();
  114 |     await expect(page.getByText('Gói 90 phút')).toBeVisible();
  115 |     await page.screenshot({ path: 'test-results/service-detail-1440.png', fullPage: true });
  116 | 
  117 |     await page.getByRole('button', { name: 'Đặt lịch ngay' }).last().click();
  118 |     await expect(page).toHaveURL(/\/dat-lich/);
  119 |     await expect(page.getByRole('heading', { name: 'Đặt lịch hẹn' })).toBeVisible();
  120 |     await expect(page.getByText('Giờ hẹn (08:00 – 22:00)')).toBeVisible();
  121 |     await page.screenshot({ path: 'test-results/booking-1440.png', fullPage: true });
  122 | 
  123 |     for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  124 |       await page.setViewportSize(vp);
  125 |       await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(vp.width);
  126 |     }
  127 |   });
  128 | 
  129 |   test('Customer login (/dang-nhap) and personal bookings (/lich-hen-cua-toi) visual capture', async ({ page }) => {
  130 |     await page.route('**/api/auth/me', (route) => route.fulfill({ status: 401, json: { message: 'Unauthorized' } }));
  131 |     await page.setViewportSize({ width: 1440, height: 900 });
  132 |     await page.goto('/dang-nhap');
  133 |     await expect(page.getByRole('heading', { name: 'Đăng nhập' })).toBeVisible();
  134 |     await page.screenshot({ path: 'test-results/customer-login-1440.png', fullPage: true });
  135 | 
  136 |     await page.route('**/api/auth/me', (route) =>
  137 |       route.fulfill({
  138 |         json: {
  139 |           success: true,
  140 |           user: {
  141 |             id: 'TK00000004',
  142 |             username: 'khachhang',
  143 |             phone: '0900000004',
  144 |             role: 'Khách hàng',
  145 |             fullName: 'Phạm Thị Khách',
  146 |             permissions: [],
  147 |           },
  148 |         },
  149 |       }),
  150 |     );
  151 |     await page.route('**/api/me/bookings', (route) =>
  152 |       route.fulfill({
  153 |         json: {
  154 |           items: [
  155 |             {
  156 |               id: 'LH00128',
  157 |               date: '2026-11-15',
  158 |               time: '10:00',
  159 |               createdAt: '2026-11-11T09:00:00',
  160 |               status: 'Chờ xác nhận',
  161 |               paymentStatus: 'Chưa thanh toán',
  162 |               services: [
  163 |                 {
  164 |                   id: 'CT01',
  165 |                   name: 'Massage thư giãn toàn thân',
  166 |                   packageName: 'Gói thư giãn 90 phút',
  167 |                   startsAt: '10:00',
  168 |                   endsAt: '11:30',
  169 |                 },
  170 |               ],
  171 |             },
  172 |             {
  173 |               id: 'LH00112',
  174 |               date: '2026-11-05',
  175 |               time: '09:30',
  176 |               createdAt: '2026-11-01T10:00:00',
  177 |               status: 'Hoàn thành',
  178 |               paymentStatus: 'Đã thanh toán',
  179 |               hasReview: false,
  180 |               services: [
  181 |                 {
  182 |                   id: 'CT02',
  183 |                   name: 'Gội đầu dưỡng sinh',
  184 |                   packageName: 'Gói gội đầu 45 phút',
  185 |                   startsAt: '09:30',
  186 |                   endsAt: '10:15',
  187 |                 },
  188 |               ],
  189 |             },
  190 |           ],
  191 |         },
  192 |       }),
  193 |     );
  194 | 
  195 |     await page.goto('/lich-hen-cua-toi');
  196 |     await expect(page.getByRole('heading', { name: 'Lịch hẹn của tôi' })).toBeVisible();
  197 |     await expect(page.getByText('LH00128')).toBeVisible();
  198 |     await page.screenshot({ path: 'test-results/my-bookings-1440.png', fullPage: true });
  199 |     for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  200 |       await page.setViewportSize(vp);
  201 |       await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(vp.width);
  202 |     }
  203 |   });
  204 | 
  205 |   test('Admin management screens render shared ManagementSidebar and responsive layout', async ({ page }) => {
  206 |     await page.route('**/api/auth/me', (route) =>
  207 |       route.fulfill({
  208 |         json: {
  209 |           success: true,
  210 |           user: {
  211 |             id: 'TK00000001',
```