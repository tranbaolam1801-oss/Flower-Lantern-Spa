// Browser test of the registration / forgotten-password OTP screens against a MOCKED API (page.route on /api/auth/**).
//   node scripts/otp-screens-browser.cjs      (needs `npm run build --workspace @spa/frontend` first)
// Starts `vite preview` itself and stops it at the end. Screenshots go to the OS temp folder.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require(path.resolve(__dirname, '../node_modules/@playwright/test'));

const PORT = 4173;
const BASE = `http://localhost:${PORT}`;
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

async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try { const r = await fetch(BASE); if (r.ok) return; } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('vite preview did not start');
}

const json = (route, status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

// Mock state per page
async function mockApi(page, calls, opts = {}) {
  await page.route('**/api/auth/**', async (route) => {
    const url = new URL(route.request().url());
    const ep = url.pathname.replace('/api/auth/', '');
    const body = route.request().postDataJSON?.() ?? {};
    if (ep === 'me') return json(route, 401, { message: 'no session' });
    calls.push({ ep, body });
    if (ep === 'otp/request') {
      if (opts.rateLimit) return json(route, 429, { message: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau.', retryAfterSeconds: 42 });
      return json(route, 202, { message: 'Nếu số điện thoại hợp lệ, mã xác thực đã được gửi.', resendAfterSeconds: 60, expiresInSeconds: 300 });
    }
    if (ep === 'otp/verify') {
      if (body.code !== '123456') return json(route, 400, { message: 'Mã xác thực không đúng hoặc đã hết hạn.' });
      return json(route, 200, { completionToken: 'tok-mock', expiresInSeconds: 600 });
    }
    if (ep === 'register') {
      if (!/\d/.test(body.password) || body.password.length < 8) return json(route, 400, { message: 'Mật khẩu không hợp lệ', fields: { password: 'Mật khẩu tối thiểu 8 ký tự, gồm chữ và số.' } });
      if (opts.backendPasswordError) return json(route, 400, { message: 'Mật khẩu không hợp lệ', fields: { password: 'Mật khẩu quá phổ biến. Vui lòng chọn mật khẩu khác.' } });
      return json(route, 201, { success: true });
    }
    if (ep === 'password/reset') return json(route, 200, { success: true });
    return json(route, 404, { message: 'not mocked' });
  });
}

(async () => {
  const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: path.resolve(__dirname, '../frontend'), shell: true, stdio: 'ignore',
  });
  const browser = await chromium.launch({ headless: true, timeout: 45000, executablePath: chromiumExecutable() });
  const shots = path.join(os.tmpdir(), 'spa-otp-shots'); fs.mkdirSync(shots, { recursive: true });
  const errors = [];
  try {
    await waitForServer();
    const newPage = async (viewport = { width: 1280, height: 900 }, opts = {}) => {
      const ctx = await browser.newContext({ viewport });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push(e.message));
      const calls = [];
      await mockApi(page, calls, opts);
      return { page, calls, ctx };
    };
    const shot = (page, name) => page.screenshot({ path: path.join(shots, `${name}.png`) });
    const text = async (page) => (await page.locator('main').innerText());

    // ---- Login placeholder handlers now navigate ----
    {
      const { page, ctx } = await newPage();
      await page.goto(`${BASE}/dang-nhap`, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: 'Đăng ký ngay' }).click();
      check('login "Đăng ký ngay" navigates to /dang-ky', page.url().endsWith('/dang-ky'), page.url());
      await page.goto(`${BASE}/dang-nhap`, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: /Quên mật khẩu\?/ }).click();
      check('login "Quên mật khẩu?" navigates to /quen-mat-khau', page.url().endsWith('/quen-mat-khau'), page.url());
      await ctx.close();
    }

    // ---- Register happy path + validations ----
    {
      const { page, calls, ctx } = await newPage();
      await page.goto(`${BASE}/dang-ky`, { waitUntil: 'networkidle' });
      await shot(page, 'register-1-phone');
      await page.getByRole('button', { name: 'Gửi mã xác thực' }).click();
      check('[register] empty phone shows required message', (await text(page)).includes('Không được để trống!'));
      await page.fill('#otp-phone', '12345');
      await page.getByRole('button', { name: 'Gửi mã xác thực' }).click();
      check('[register] invalid phone rejected client-side', (await text(page)).includes('Số điện thoại không hợp lệ!') && calls.length === 0);
      await page.fill('#otp-phone', '+84901234567');
      await page.getByRole('button', { name: 'Gửi mã xác thực' }).click();
      await page.waitForSelector('#otp-code');
      check('[register] +84 phone normalised to 0xxxxxxxxx in request', calls[0]?.body.phone === '0901234567' && calls[0]?.body.purpose === 'REGISTER', JSON.stringify(calls[0]));
      check('[register] generic sentence shown', (await text(page)).includes('Nếu số điện thoại hợp lệ, mã xác thực đã được gửi.'));
      const attrs = await page.locator('#otp-code').evaluate((el) => [el.inputMode, el.autocomplete]);
      check('[register] code input numeric + one-time-code', attrs[0] === 'numeric' && attrs[1] === 'one-time-code', attrs.join());
      check('[register] resend disabled with countdown', await page.getByRole('button', { name: /Gửi lại mã sau \d+s/ }).isDisabled());
      const c1 = Number((await page.getByRole('button', { name: /Gửi lại mã sau/ }).innerText()).match(/\d+/)[0]);
      await page.waitForTimeout(2200);
      const c2 = Number((await page.getByRole('button', { name: /Gửi lại mã sau/ }).innerText()).match(/\d+/)[0]);
      check('[register] countdown ticks down', c2 < c1, `${c1} -> ${c2}`);
      await shot(page, 'register-2-code');
      // wrong code (paste-like with non-digits), auto-submit at 6 digits
      await page.fill('#otp-code', '999-999');
      await page.waitForFunction(() => document.body.innerText.includes('Mã xác thực không đúng hoặc đã hết hạn.'));
      check('[register] wrong code shows backend message', true);
      await shot(page, 'register-2b-wrong-code');
      await page.fill('#otp-code', '123456');
      await page.waitForSelector('#reg-name');
      check('[register] correct code auto-submits to step 3', true);
      check('[register] consent checkbox unchecked by default', !(await page.locator('input[type=checkbox]').isChecked()));
      // validations
      await page.fill('#reg-name', 'Nguyen Van A');
      await page.fill('#reg-password', 'abcdefgh');
      await page.fill('#reg-confirm', 'abcdefgh');
      await page.getByRole('button', { name: 'Đăng ký', exact: true }).click();
      check('[register] client password policy message', (await text(page)).includes('Mật khẩu tối thiểu 8 ký tự, gồm chữ và số.'));
      await page.fill('#reg-password', 'Matkhau123');
      await page.fill('#reg-confirm', 'Matkhau124');
      await page.getByRole('button', { name: 'Đăng ký', exact: true }).click();
      check('[register] password mismatch message', (await text(page)).includes('Mật khẩu xác nhận không khớp!'));
      const type1 = await page.locator('#reg-password').getAttribute('type');
      await page.getByRole('button', { name: 'Hiện mật khẩu' }).click();
      check('[register] show/hide toggles password type', type1 === 'password' && (await page.locator('#reg-password').getAttribute('type')) === 'text');
      await shot(page, 'register-3-details-errors');
      await page.fill('#reg-confirm', 'Matkhau123');
      await page.getByLabel('Tôi đồng ý nhận thông báo lịch hẹn qua Zalo').check();
      await page.getByRole('button', { name: 'Đăng ký', exact: true }).click();
      await page.waitForSelector('a[href="/dang-nhap"].otp-login-link');
      const reg = calls.find((c) => c.ep === 'register');
      check('[register] register body contract', reg && reg.body.phone === '0901234567' && reg.body.completionToken === 'tok-mock' && reg.body.fullName === 'Nguyen Van A' && reg.body.consentZalo === true && !('confirm' in reg.body), JSON.stringify(reg && { ...reg.body, password: '***' }));
      check('[register] success state links to /dang-nhap', (await text(page)).includes('Đăng ký thành công'));
      const storage = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }) + location.href);
      check('[register] completion token not in storage/URL', !storage.includes('tok-mock'));
      await shot(page, 'register-4-done');
      await ctx.close();
    }

    // ---- Backend password error is shown on the field ----
    {
      const { page, ctx } = await newPage({ width: 1280, height: 900 }, { backendPasswordError: true });
      await page.goto(`${BASE}/dang-ky`, { waitUntil: 'networkidle' });
      await page.fill('#otp-phone', '0901234567');
      await page.getByRole('button', { name: 'Gửi mã xác thực' }).click();
      await page.fill('#otp-code', '123456');
      await page.waitForSelector('#reg-name');
      await page.fill('#reg-name', 'Tran B');
      await page.fill('#reg-password', 'Password1');
      await page.fill('#reg-confirm', 'Password1');
      await page.getByRole('button', { name: 'Đăng ký', exact: true }).click();
      await page.waitForFunction(() => document.body.innerText.includes('Mật khẩu quá phổ biến'));
      check('[register] backend {fields.password} error shown on field', (await page.locator('#reg-password').getAttribute('aria-invalid')) === 'true');
      await shot(page, 'register-5-backend-password-error');
      await ctx.close();
    }

    // ---- 429 countdown ----
    {
      const { page, ctx } = await newPage({ width: 1280, height: 900 }, { rateLimit: true });
      await page.goto(`${BASE}/dang-ky`, { waitUntil: 'networkidle' });
      await page.fill('#otp-phone', '0901234567');
      await page.getByRole('button', { name: 'Gửi mã xác thực' }).click();
      await page.getByRole('button', { name: /Gửi lại sau \d+s/ }).waitFor();
      const n = Number((await page.getByRole('button', { name: /Gửi lại sau/ }).innerText()).match(/\d+/)[0]);
      check('[register] 429 shows retryAfterSeconds countdown and disables submit', n > 30 && n <= 42 && (await page.getByRole('button', { name: /Gửi lại sau/ }).isDisabled()), `n=${n}`);
      check('[register] 429 shows backend message', (await text(page)).includes('Bạn thao tác quá nhanh.'));
      await shot(page, 'register-6-429');
      await ctx.close();
    }

    // ---- Forgot-password happy path ----
    {
      const { page, calls, ctx } = await newPage();
      await page.goto(`${BASE}/quen-mat-khau`, { waitUntil: 'networkidle' });
      await shot(page, 'forgot-1-phone');
      await page.fill('#otp-phone', '0901234567');
      await page.getByRole('button', { name: 'Gửi mã xác thực' }).click();
      await page.waitForSelector('#otp-code');
      check('[forgot] purpose RESET_PASSWORD + generic sentence', calls[0].body.purpose === 'RESET_PASSWORD' && (await text(page)).includes('Nếu số điện thoại hợp lệ, mã xác thực đã được gửi.'));
      await page.fill('#otp-code', '123456');
      await page.waitForSelector('#reg-password');
      check('[forgot] step 3 has no full-name/consent fields', (await page.locator('#reg-name').count()) === 0 && (await page.locator('input[type=checkbox]').count()) === 0);
      await shot(page, 'forgot-3-new-password');
      await page.fill('#reg-password', 'Newpass123');
      await page.fill('#reg-confirm', 'Newpass123');
      await page.getByRole('button', { name: 'Đặt lại mật khẩu' }).click();
      await page.waitForSelector('a[href="/dang-nhap"]');
      const rs = calls.find((c) => c.ep === 'password/reset');
      check('[forgot] reset body contract', rs && rs.body.phone === '0901234567' && rs.body.completionToken === 'tok-mock' && rs.body.newPassword === 'Newpass123', JSON.stringify(rs && { ...rs.body, newPassword: '***' }));
      check('[forgot] success state', (await text(page)).includes('Đặt lại mật khẩu thành công'));
      await shot(page, 'forgot-4-done');
      // "Đổi số điện thoại" in a new run
      await ctx.close();
    }
    {
      const { page, ctx } = await newPage();
      await page.goto(`${BASE}/quen-mat-khau`, { waitUntil: 'networkidle' });
      await page.fill('#otp-phone', '0901234567');
      await page.getByRole('button', { name: 'Gửi mã xác thực' }).click();
      await page.waitForSelector('#otp-code');
      await page.getByRole('button', { name: 'Đổi số điện thoại' }).click();
      check('[forgot] "Đổi số điện thoại" returns to step 1', (await page.locator('#otp-phone').count()) === 1);
      await ctx.close();
    }

    // ---- Mobile ----
    for (const route of ['/dang-ky', '/quen-mat-khau']) {
      const { page, ctx } = await newPage({ width: 390, height: 844 });
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
      const ov1 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      await page.fill('#otp-phone', '0901234567');
      await page.getByRole('button', { name: 'Gửi mã xác thực' }).click();
      await page.waitForSelector('#otp-code');
      const ov2 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      await shot(page, `mobile${route.replace('/', '-')}-code`);
      await page.fill('#otp-code', '123456');
      await page.waitForSelector('#reg-password');
      const ov3 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      await shot(page, `mobile${route.replace('/', '-')}-details`);
      check(`[mobile 390x844 ${route}] no horizontal overflow on all steps`, ov1 <= 0 && ov2 <= 0 && ov3 <= 0, `${ov1},${ov2},${ov3}`);
      await ctx.close();
    }

    check('no uncaught page errors', errors.length === 0, errors.join(' | '));
    console.log(`Screenshots: ${shots}`);
  } finally {
    await browser.close();
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(preview.pid), '/T', '/F'], { stdio: 'ignore' });
    else preview.kill();
  }
  const failed = results.filter((r) => !r).length;
  console.log(`${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('FAIL  script error', e); process.exit(1); });
