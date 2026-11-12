import { defineConfig } from '@playwright/test';

/** Frontend-only visual & UI verification config (uses mocked API responses, never touches Backend/DB). */
export default defineConfig({
  testDir: './tests',
  testMatch: 'ui-coverage.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: 'http://127.0.0.1:5184',
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js frontend --host 127.0.0.1 --port 5184',
    url: 'http://127.0.0.1:5184',
    reuseExistingServer: false,
    timeout: 25000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
