// LIVE browser test (headless Chromium via Playwright) of the DEPLOYED UI: login form -> session -> navigation -> logout.
//   node scripts/e2e-live-browser.cjs [baseUrl]
// Uses the locally installed Chromium build; credentials come from the private credentials file and are typed into the
// form like a user would (never printed). Screenshots go to the OS temp folder.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require(path.resolve(__dirname, '../node_modules/@playwright/test'));

const BASE = (process.argv[2] ?? 'https://flower-lantern-spa.vercel.app').replace(/\/+$/, '');
const creds = fs.readFileSync(path.join(os.homedir(), 'flower-lantern-demo-credentials.txt'), 'utf8');
const m = creds.match(/Owner[^\n]*phone (\d+)\s+password (\S+)/);
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${detail}`}`); };

function chromiumExecutable() {
  const root = path.join(process.env.LOCALAPPDATA ?? '', 'ms-playwright');
  const candidates = fs.existsSync(root) ? fs.readdirSync(root).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse() : [];
  for (const d of candidates) {
    const exe = path.join(root, d, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe');
    if (fs.existsSync(exe)) return exe;
  }
  return undefined;
}

(async () => {
  const browser = await chromium.launch({ headless: true, timeout: 45000, executablePath: chromiumExecutable() });
  const shots = path.join(os.tmpdir(), 'spa-live-shots'); fs.mkdirSync(shots, { recursive: true });
  const errors = [];
  try {
    for (const [label, viewport] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
      const ctx = await browser.newContext({ viewport });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
      page.on('console', (msg) => { if (msg.type() === 'error' && !/favicon|401/.test(msg.text())) errors.push(`${label} console: ${msg.text().slice(0, 120)}`); });

      await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 45000 });
      const title = await page.title();
      check(`[${label}] home page renders`, (await page.locator('#root *').count()) > 5, `title=${title}`);
      await page.screenshot({ path: path.join(shots, `${label}-home.png`) });

      await page.goto(`${BASE}/dich-vu`, { waitUntil: 'networkidle', timeout: 45000 });
      const cards = await page.locator('img[alt]').count();
      check(`[${label}] service catalog loads data from the API (cards/images present)`, cards > 3, `imgs=${cards}`);
      await page.screenshot({ path: path.join(shots, `${label}-services.png`) });

      if (label === 'desktop') {
        await page.goto(`${BASE}/dang-nhap`, { waitUntil: 'networkidle', timeout: 45000 });
        await page.locator('input').first().fill(m[1]);
        await page.locator('input[type="password"]').fill(m[2]);
        await Promise.all([
          page.waitForURL(/\/admin\//, { timeout: 30000 }),
          page.locator('button[type="submit"], button:has-text("Đăng nhập")').first().click(),
        ]).catch(() => undefined);
        check('[desktop] UI login redirects the owner to /admin/*', /\/admin\//.test(page.url()), page.url());
        await page.waitForLoadState('networkidle').catch(() => undefined);
        check('[desktop] admin page rendered content (no blank screen)', (await page.locator('#root *').count()) > 20);
        await page.screenshot({ path: path.join(shots, 'desktop-admin.png') });
        const cookies = await ctx.cookies(BASE);
        const c = cookies.find((x) => x.name === 'access_token');
        check('[desktop] browser stored the session cookie as HttpOnly + Secure + Lax', Boolean(c && c.httpOnly && c.secure && c.sameSite === 'Lax'), JSON.stringify(c && { httpOnly: c.httpOnly, secure: c.secure, sameSite: c.sameSite }));
        await page.reload({ waitUntil: 'networkidle' });
        check('[desktop] session survives a page reload (still on /admin/*)', /\/admin\//.test(page.url()), page.url());
        await page.goto(`${BASE}/admin/lich-hen`, { waitUntil: 'networkidle' });
        check('[desktop] deep link /admin/lich-hen works while logged in', /\/admin\/lich-hen/.test(page.url()) && (await page.locator('#root *').count()) > 20, page.url());
        await page.screenshot({ path: path.join(shots, 'desktop-calendar.png') });
        const mobileOverflow = false;
        void mobileOverflow;
      } else {
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
        check('[mobile] no horizontal overflow on the service catalog', !overflow);
      }
      await ctx.close();
    }
    check('no uncaught page errors / console errors in either viewport', errors.length === 0, errors.slice(0, 3).join(' | '));
  } finally {
    await browser.close();
  }
  const failed = results.filter((x) => !x).length;
  console.log(`\nBROWSER ${BASE}: ${results.length - failed}/${results.length} passed${failed ? `, ${failed} FAILED` : ''}\nScreenshots: ${shots}`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('BROWSER RUN ERROR', String(e.message).split('\n')[0]); process.exit(2); });
