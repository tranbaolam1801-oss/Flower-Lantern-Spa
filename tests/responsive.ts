import { expect, type Page } from '@playwright/test';

export const viewports = [
  {width:1920,height:1080}, {width:1600,height:900}, {width:1440,height:900},
  {width:1366,height:768}, {width:1280,height:720}, {width:1024,height:768},
  {width:768,height:1024}, {width:390,height:844}, {width:360,height:800},
];

export async function checkResponsive(page: Page, screen: 'login' | 'customer' | 'management') {
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
    const logo = page.locator('.brand-logo-shared:visible').first();
    if (screen !== 'management') {
      await expect(logo).toHaveAttribute('src', '/assets/flower-lantern-logo.png');
      const ratio = await logo.evaluate((img: HTMLImageElement) => ({
        actual: img.clientWidth / img.clientHeight, original: img.naturalWidth / img.naturalHeight,
      }));
      expect(Math.abs(ratio.actual / ratio.original - 1)).toBeLessThan(.03);
    }
    if (screen !== 'login' && viewport.width <= 1024) {
      const toggle = screen === 'management' ? page.locator('.navigation-toggle') : page.getByRole('button',{name:'Mở menu'});
      await toggle.click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      const box = await dialog.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
      expect(box!.height).toBeLessThanOrEqual(viewport.height);
      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible();
      await expect(toggle).toBeFocused();
    }
    if ([1440,390,360].includes(viewport.width)) await page.screenshot({path:`test-results/${screen}-${viewport.width}.png`,fullPage:true});
  }
  await page.setViewportSize({width:1440,height:900});
}
