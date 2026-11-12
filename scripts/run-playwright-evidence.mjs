#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
let scope = 'ui-run';
let categoryDir = '';
let configFile = '';
let timeoutMs = 90000;
const extraArgs = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--scope' && args[i + 1]) {
    scope = args[++i].replace(/[^a-zA-Z0-9_-]/g, '-');
  } else if (args[i] === '--dir' && args[i + 1]) {
    categoryDir = args[++i].replace(/[^a-zA-Z0-9_/-]/g, '');
  } else if (args[i] === '--config' && args[i + 1]) {
    configFile = args[++i];
  } else if (args[i] === '--timeout-ms' && args[i + 1]) {
    timeoutMs = Math.max(10000, Number(args[++i]) || 90000);
  } else {
    extraArgs.push(args[i]);
  }
}

const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const runId = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}_${scope}`;
const rootDir = process.cwd();
const evidenceBase = categoryDir
  ? path.join(rootDir, 'audit', 'test-evidence', categoryDir)
  : path.join(rootDir, 'audit', 'test-evidence');
const evidenceDir = path.join(evidenceBase, runId);
const artifactsDir = path.join(evidenceDir, 'artifacts');
const htmlReportDir = path.join(evidenceDir, 'html-report');
const screenshotsDir = path.join(evidenceDir, 'screenshots');

fs.mkdirSync(artifactsDir, { recursive: true });
fs.mkdirSync(htmlReportDir, { recursive: true });
fs.mkdirSync(screenshotsDir, { recursive: true });

const playwrightCli = path.join(rootDir, 'node_modules', '@playwright', 'test', 'cli.js');
const playwrightArgs = [
  playwrightCli,
  'test',
  ...(configFile ? ['--config', configFile] : []),
  ...extraArgs,
  '--output',
  artifactsDir,
  '--reporter=list,html',
];

const commandText = `node node_modules/@playwright/test/cli.js ${playwrightArgs.slice(1).join(' ')}`;
console.log(`[evidence] Run ID: ${runId}`);
console.log(`[evidence] Output dir: ${evidenceDir}`);
console.log(`[evidence] Timeout: ${timeoutMs}ms`);
console.log(`[evidence] Command: ${commandText}`);

const startTime = Date.now();
let combinedOutput = '';
let timedOut = false;

const child = spawn(process.execPath, playwrightArgs, {
  cwd: rootDir,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH || 'C:/Spa/.playwright',
    PLAYWRIGHT_HTML_OUTPUT_DIR: htmlReportDir,
  },
});

child.stdout.on('data', (chunk) => {
  const text = chunk.toString('utf8');
  combinedOutput += text;
  process.stdout.write(text);
});

child.stderr.on('data', (chunk) => {
  const text = chunk.toString('utf8');
  combinedOutput += text;
  process.stderr.write(text);
});

const timer = setTimeout(() => {
  timedOut = true;
  const msg = `\n[evidence] ERROR: Timed out after ${timeoutMs}ms. Terminating process tree...\n`;
  combinedOutput += msg;
  process.stderr.write(msg);
  if (process.platform === 'win32' && child.pid) {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill('SIGKILL');
  }
}, timeoutMs);

child.on('close', (code) => {
  clearTimeout(timer);
  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  const exitCode = timedOut ? 124 : (code ?? 1);

  const legacyResultsDir = path.join(rootDir, 'test-results');
  const copiedScreenshots = [];
  if (fs.existsSync(legacyResultsDir)) {
    for (const entry of fs.readdirSync(legacyResultsDir, { withFileTypes: true })) {
      if (entry.isFile() && /\.(png|jpg|jpeg|webp)$/i.test(entry.name)) {
        fs.copyFileSync(path.join(legacyResultsDir, entry.name), path.join(screenshotsDir, entry.name));
        copiedScreenshots.push(entry.name);
      }
    }
  }

  const passMatch = combinedOutput.match(/(\d+)\s+passed/);
  const failMatch = combinedOutput.match(/(\d+)\s+failed/);
  const skipMatch = combinedOutput.match(/(\d+)\s+skipped/);

  const summary = [
    `# Test Evidence Summary — ${runId}`,
    '',
    `- **Thời gian chạy:** ${now.toISOString()} (${durationSec}s)`,
    `- **Phạm vi (\`--scope\`):** ${scope}`,
    `- **Lệnh thực hiện:** \`${commandText}\``,
    `- **Timeout limit:** ${timeoutMs}ms (${timedOut ? 'TIMED OUT' : 'completed within limit'})`,
    `- **Exit code:** ${exitCode}`,
    `- **Kết quả:** ${passMatch ? passMatch[1] : 0} passed, ${failMatch ? failMatch[1] : 0} failed, ${skipMatch ? skipMatch[1] : 0} skipped`,
    '- **Lưu ý:** Đây là bằng chứng mới được sinh ở lần chạy này, không phải bản khôi phục của các lần chạy trước đã bị xóa.',
    '',
    '## Thư mục lưu trữ',
    '- HTML Report: `html-report/index.html`',
    '- Playwright Artifacts / Traces / Videos: `artifacts/`',
    `- Screenshots (${copiedScreenshots.length}): ${copiedScreenshots.map((f) => `\`screenshots/${f}\``).join(', ') || '(không có)'}`,
    '',
    '## Output log',
    '```',
    combinedOutput.trim() || '(no output)',
    '```',
    '',
  ].join('\n');

  fs.writeFileSync(path.join(evidenceDir, 'SUMMARY.md'), summary, 'utf8');
  console.log(`[evidence] Saved SUMMARY.md (exit=${exitCode}) and ${copiedScreenshots.length} screenshot(s) to ${evidenceDir}`);
  process.exit(exitCode);
});
