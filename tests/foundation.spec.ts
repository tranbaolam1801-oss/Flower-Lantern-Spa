import { test, expect } from '@playwright/test';
import { checkResponsive } from './responsive';
test('UC_1 required fields and password visibility',async({page})=>{
  await page.goto('/dang-nhap');
  await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
  await expect(page.getByText('Không được để trống!',{exact:true})).toHaveCount(2);
  await page.getByLabel('Mật khẩu',{exact:false}).first().fill('test-only-password');
  await page.getByRole('button',{name:'Hiện mật khẩu'}).click();
  await expect(page.locator('#password')).toHaveAttribute('type','text');
  await page.getByRole('button',{name:'Ẩn mật khẩu'}).click();
  await expect(page.locator('#password')).toHaveAttribute('type','password');
  await page.getByRole('button',{name:'Quên mật khẩu?'}).click();
  await expect(page.getByRole('alert')).toContainText('khôi phục mật khẩu chưa được triển khai');
});
test('Figma login assets load at design geometry',async({page})=>{
  await page.goto('/dang-nhap');
  await page.evaluate(()=>document.fonts.ready);
  await expect(page.locator('.login-card')).toHaveCSS('width','520px');
  for(const img of await page.locator('img').all()) {
    await expect(img).toHaveJSProperty('complete',true);
    expect(await img.evaluate((element:HTMLImageElement)=>element.naturalWidth)).toBeGreaterThan(0);
  }
  await page.screenshot({path:'test-results/login-1440.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({path:'test-results/login-390.png',fullPage:true});
  await checkResponsive(page,'login');
});
test('React reaches real NestJS liveness',async({page})=>{
  await page.goto('/system');
  await expect(page.getByText('Backend: Đang hoạt động')).toBeVisible();
});
