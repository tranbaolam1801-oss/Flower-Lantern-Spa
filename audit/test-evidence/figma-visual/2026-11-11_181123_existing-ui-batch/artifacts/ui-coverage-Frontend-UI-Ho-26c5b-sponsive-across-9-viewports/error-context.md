# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ui-coverage.spec.ts >> Frontend UI, Homepage & Public Routes (no DB mutation) >> Homepage renders all required sections, green booking CTAs, English logo & responsive across 9 viewports
- Location: tests\ui-coverage.spec.ts:46:3

# Error details

```
Error: expect(locator).toHaveAttribute(expected) failed

Locator: locator('.customer-header .brand-logo-shared')
Expected: "/assets/flower-lantern-logo.png"
Error: strict mode violation: locator('.customer-header .brand-logo-shared') resolved to 2 elements:
    1) <img alt="Flower Lantern Spa" src="/assets/flower-lantern-logo.png" class="brand-logo-shared customer-logo"/> aka getByRole('link', { name: 'Về trang chủ Flower Lantern' })
    2) <img alt="Flower Lantern Spa" class="brand-logo-shared " src="/assets/flower-lantern-logo.png"/> aka locator('#customer-navigation').getByAltText('Flower Lantern Spa')

Call log:
  - Expect "toHaveAttribute" locator('.customer-header .brand-logo-shared') with timeout 5000ms
  - waiting for locator('.customer-header .brand-logo-shared')

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
      - button "Tìm kiếm dịch vụ" [ref=e14] [cursor=pointer]
      - button "Đăng nhập" [ref=e15] [cursor=pointer]
      - button "Đặt lịch ngay" [ref=e16] [cursor=pointer]
  - generic [ref=e19]:
    - heading "Thư giãn, phục hồi và chăm sóc toàn diện" [level=1] [ref=e20]
    - paragraph [ref=e21]: Hoa Đăng Spa là điểm đến chăm sóc sức khỏe và sắc đẹp lấy cảm hứng từ vẻ đẹp an yên của Hội An, mang đến những liệu trình thư giãn, phục hồi năng lượng và cân bằng thân – tâm – trí.
    - generic [ref=e22]:
      - button "Khám phá dịch vụ ›" [ref=e23] [cursor=pointer]
      - button "Đặt lịch ngay" [ref=e24] [cursor=pointer]
  - generic [ref=e26]:
    - img "Không gian hoa sen thanh tịnh tại Hoa Đăng Spa" [ref=e28]
    - generic [ref=e29]:
      - generic [ref=e30]: GIỚI THIỆU
      - heading "Hoa Đăng Spa" [level=2] [ref=e31]
      - paragraph [ref=e32]: Hoa Đăng Spa là spa chăm sóc sức khỏe và sắc đẹp tại Hội An, nơi kết hợp giữa các liệu pháp trị liệu truyền thống và phương pháp chăm sóc hiện đại, đem đến trải nghiệm thư giãn sâu, phục hồi năng lượng và tái tạo vẻ đẹp tự nhiên.
      - paragraph [ref=e33]: Với không gian yên bình, đội ngũ kỹ thuật viên tận tâm và các liệu trình được thiết kế tinh tế, chúng tôi mong muốn mang đến cho bạn những phút giây thư thái trọn vẹn, nhẹ nhàng như ánh hoa đăng trên dòng sông Hội An.
      - generic [ref=e34]:
        - generic [ref=e35]:
          - strong [ref=e36]: Chăm sóc toàn diện
          - text: Sức khỏe – Sắc đẹp – Thư giãn
        - generic [ref=e37]:
          - strong [ref=e38]: Liệu pháp tự nhiên
          - text: An toàn, lành tính
        - generic [ref=e39]:
          - strong [ref=e40]: Trải nghiệm an yên
          - text: Cân bằng thân – tâm – trí
  - generic [ref=e42]:
    - generic [ref=e43]:
      - generic [ref=e44]: DỊCH VỤ NỔI BẬT
      - heading "Các liệu trình chăm sóc tại Hoa Đăng Spa" [level=2] [ref=e45]
      - paragraph [ref=e46]: Đa dạng dịch vụ từ thư giãn, chăm sóc da đến các gói trị liệu chuyên sâu, được thiết kế phù hợp với nhu cầu của từng khách hàng.
    - generic [ref=e47]:
      - article [ref=e48]:
        - img "Massage thư giãn toàn thân" [ref=e50]
        - generic [ref=e51]:
          - generic [ref=e52]: Massage
          - generic [ref=e53]: 🕒 90 phút
        - generic [ref=e54]:
          - heading "Massage thư giãn toàn thân" [level=3] [ref=e55]
          - paragraph [ref=e56]: Thả lỏng cơ thể với tinh dầu thiên nhiên và kỹ thuật ấn huyệt dịu nhẹ.
          - generic [ref=e57]:
            - strong [ref=e58]: 450.000đ
            - link "Xem chi tiết →" [ref=e59] [cursor=pointer]:
              - /url: /dich-vu/DV01
      - article [ref=e60]:
        - img "Chăm sóc da mặt chuyên sâu" [ref=e62]
        - generic [ref=e63]:
          - generic [ref=e64]: Chăm sóc da
          - generic [ref=e65]: 🕒 60 phút
        - generic [ref=e66]:
          - heading "Chăm sóc da mặt chuyên sâu" [level=3] [ref=e67]
          - paragraph [ref=e68]: Làm sạch sâu, cấp ẩm và phục hồi làn da rạng rỡ.
          - generic [ref=e69]:
            - strong [ref=e70]: 520.000đ
            - link "Xem chi tiết →" [ref=e71] [cursor=pointer]:
              - /url: /dich-vu/DV02
  - generic [ref=e73]:
    - generic [ref=e74]:
      - generic [ref=e75]: VÌ SAO CHỌN HOA ĐĂNG SPA?
      - heading "Trải nghiệm khác biệt và trọn vẹn" [level=2] [ref=e76]
    - generic [ref=e77]:
      - generic [ref=e78]:
        - generic [aria-hidden] [ref=e79]: 🏮
        - heading "Không gian yên tĩnh" [level=3] [ref=e80]
        - paragraph [ref=e81]: Thiết kế ấm cúng, gần gũi thiên nhiên, mang lại cảm giác an yên và thư thái.
      - generic [ref=e82]:
        - generic [aria-hidden] [ref=e83]: 👩‍⚕️
        - heading "Kỹ thuật viên chuyên nghiệp" [level=3] [ref=e84]
        - paragraph [ref=e85]: Đội ngũ giàu kinh nghiệm, được đào tạo bài bản và phục vụ tận tâm.
      - generic [ref=e86]:
        - generic [aria-hidden] [ref=e87]: 🌿
        - heading "Dịch vụ cá nhân hóa" [level=3] [ref=e88]
        - paragraph [ref=e89]: Liệu trình được tư vấn và thiết kế phù hợp với nhu cầu, thể trạng và mục tiêu của bạn.
      - generic [ref=e90]:
        - generic [aria-hidden] [ref=e91]: 📅
        - heading "Đặt lịch nhanh chóng" [level=3] [ref=e92]
        - paragraph [ref=e93]: Dễ dàng đặt lịch trực tuyến, chủ động khung giờ 08:00 – 22:00 và xác nhận tiện lợi.
  - generic [ref=e95]:
    - generic [ref=e96]:
      - generic [ref=e97]: KHÔNG GIAN SPA
      - heading "Không gian thư giãn, đậm chất Hội An" [level=2] [ref=e98]
      - paragraph [ref=e99]: Một không gian yên bình, tinh tế và ấm cúng, nơi bạn có thể tạm rời xa nhịp sống vội vã và tận hưởng những giây phút chăm sóc và tái tạo năng lượng.
    - generic [ref=e100]:
      - figure [ref=e101]:
        - img "Phố cổ Hội An và hoa đăng tại Hoa Đăng Spa" [ref=e102]
      - figure [ref=e103]:
        - img "Họa tiết hoa sen thanh khiết đặc trưng" [ref=e104]
      - figure [ref=e105]:
        - img "Không gian thư giãn với hương sen dịu nhẹ" [ref=e106]
      - figure [ref=e107]:
        - img "Góc đón tiếp nhẹ nhàng tại Hoa Đăng Spa" [ref=e108]
  - generic [ref=e110]:
    - generic [ref=e111]:
      - generic [ref=e112]: CẢM NHẬN KHÁCH HÀNG
      - heading "Khách hàng nói gì về chúng tôi?" [level=2] [ref=e113]
      - paragraph [ref=e114]: Sự hài lòng của bạn là nguồn cảm hứng để Hoa Đăng Spa không ngừng hoàn thiện.
    - paragraph [ref=e116]: Chưa có đánh giá công khai từ khách hàng. Các đánh giá xác thực sau khi hoàn thành dịch vụ sẽ hiển thị tại đây.
  - generic [ref=e118]:
    - generic [ref=e119]:
      - heading "Đặt lịch ngay hôm nay" [level=2] [ref=e120]
      - paragraph [ref=e121]: Dành tặng cho bản thân những phút giây thư giãn, phục hồi và chăm sóc toàn diện tại Hoa Đăng Spa.
    - button "Đặt lịch ngay" [ref=e122] [cursor=pointer]
  - generic [ref=e124]:
    - generic [ref=e125]:
      - generic [ref=e126]: LIÊN HỆ & ĐỊA CHỈ
      - heading "Đến với Hoa Đăng Spa" [level=2] [ref=e127]
      - paragraph [ref=e128]: Chúng tôi luôn sẵn sàng chào đón và mang đến cho bạn trải nghiệm chăm sóc tốt nhất!
    - generic [ref=e129]:
      - generic [ref=e131]:
        - generic [ref=e132]:
          - term [ref=e133]: Địa chỉ
          - definition [ref=e134]: 102 Bà Triệu, Phường Hội An, Thành Phố Đà Nẵng
        - generic [ref=e135]:
          - term [ref=e136]: Giờ mở cửa
          - definition [ref=e137]: 08:00 – 22:00 (Tất cả các ngày)
        - generic [ref=e138]:
          - term [ref=e139]: Đặt lịch trực tuyến
          - definition [ref=e140]:
            - link "Đặt lịch tại hệ thống trực tuyến Hoa Đăng Spa →" [ref=e141] [cursor=pointer]:
              - /url: /dat-lich
      - generic [ref=e142]:
        - img "Hoa Đăng Spa — 102 Bà Triệu, Hội An" [ref=e143]
        - generic [ref=e144]:
          - strong [ref=e145]: Hoa Đăng Spa
          - text: 102 Bà Triệu, Hội An · 08:00 – 22:00
  - contentinfo [ref=e146]:
    - generic [ref=e147]:
      - generic [ref=e148]:
        - img "Flower Lantern Spa" [ref=e150]
        - paragraph [ref=e151]: Hoa Đăng Spa (Flower Lantern Spa) mang đến liệu trình thư giãn, phục hồi năng lượng và chăm sóc sắc đẹp trong không gian yên bình đậm chất phố cổ Hội An.
        - list [ref=e152]:
          - listitem [ref=e153]: "Địa chỉ: 102 Bà Triệu, Phường Hội An, Thành Phố Đà Nẵng"
          - listitem [ref=e154]: "Giờ mở cửa: 08:00 – 22:00 (Tất cả các ngày)"
      - generic [ref=e155]:
        - heading "Liên kết nhanh" [level=3] [ref=e156]
        - list [ref=e157]:
          - listitem [ref=e158]:
            - link "Trang chủ" [ref=e159] [cursor=pointer]:
              - /url: /
          - listitem [ref=e160]:
            - link "Giới thiệu" [ref=e161] [cursor=pointer]:
              - /url: /#gioi-thieu
          - listitem [ref=e162]:
            - link "Dịch vụ" [ref=e163] [cursor=pointer]:
              - /url: /dich-vu
          - listitem [ref=e164]:
            - link "Đặt lịch ngay" [ref=e165] [cursor=pointer]:
              - /url: /dat-lich
          - listitem [ref=e166]:
            - link "Lịch hẹn của tôi" [ref=e167] [cursor=pointer]:
              - /url: /lich-hen-cua-toi
      - generic [ref=e168]:
        - heading "Trải nghiệm dịch vụ" [level=3] [ref=e169]
        - list [ref=e170]:
          - listitem [ref=e171]:
            - link "Massage thư giãn" [ref=e172] [cursor=pointer]:
              - /url: /dich-vu?q=Massage
          - listitem [ref=e173]:
            - link "Chăm sóc da" [ref=e174] [cursor=pointer]:
              - /url: /dich-vu?q=Ch%C4%83m%20s%C3%B3c%20da
          - listitem [ref=e175]:
            - link "Gội đầu dưỡng sinh" [ref=e176] [cursor=pointer]:
              - /url: /dich-vu?q=G%E1%BB%99i%20%C4%91%E1%BA%A7u
          - listitem [ref=e177]:
            - link "Tất cả dịch vụ" [ref=e178] [cursor=pointer]:
              - /url: /dich-vu
      - generic [ref=e179]:
        - heading "Hỗ trợ khách hàng" [level=3] [ref=e180]
        - list [ref=e181]:
          - listitem [ref=e182]:
            - link "Thông tin liên hệ" [ref=e183] [cursor=pointer]:
              - /url: /#lien-he
          - listitem [ref=e184]:
            - link "Đăng nhập tài khoản" [ref=e185] [cursor=pointer]:
              - /url: /dang-nhap
          - listitem [ref=e186]:
            - link "Trạng thái hệ thống" [ref=e187] [cursor=pointer]:
              - /url: /system
    - generic [ref=e188]:
      - generic [ref=e189]: © 2026 Flower Lantern Spa (Hoa Đăng Spa). Tất cả quyền được bảo lưu.
      - generic [ref=e190]: "Giờ hoạt động: 08:00 – 22:00"
```

# Test source

```ts
  1   | import { expect, test } from '@playwright/test';
  2   | import { viewports } from './responsive';
  3   | 
  4   | const mockServices = [
  5   |   {
  6   |     id: 'DV01',
  7   |     name: 'Massage thư giãn toàn thân',
  8   |     description: 'Thả lỏng cơ thể với tinh dầu thiên nhiên và kỹ thuật ấn huyệt dịu nhẹ.',
  9   |     image: null,
  10  |     categoryId: 'DM01',
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
> 59  |     await expect(logo).toHaveAttribute('src', '/assets/flower-lantern-logo.png');
      |                        ^ Error: expect(locator).toHaveAttribute(expected) failed
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
  111 |     await page.getByRole('link', { name: 'Xem chi tiết →' }).first().click();
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
```