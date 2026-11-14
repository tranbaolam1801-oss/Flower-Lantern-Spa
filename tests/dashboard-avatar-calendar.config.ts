import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

/** Dashboard avatar and calendar UI regression only. No backend server or production database is started. */
export default defineConfig({
  testDir: '.',
  testMatch: 'dashboard-avatar-calendar.spec.ts',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5198',
    viewport: { width: 1366, height: 768 },
    channel: process.env.E2E_BROWSER_CHANNEL || undefined,
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js frontend --host 127.0.0.1 --port 5198',
    cwd: resolve(__dirname, '..'),
    url: 'http://127.0.0.1:5198',
    reuseExistingServer: !process.env.CI,
  },
  reporter: 'list',
  outputDir: '../test-results/dashboard-calendar-artifacts',
});
