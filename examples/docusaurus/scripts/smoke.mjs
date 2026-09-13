import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const port = 3456;
const baseUrl = `http://127.0.0.1:${port}`;
const demoUrl = baseUrl;
const rootDir = fileURLToPath(new URL('..', import.meta.url));
const docusaurusBin = join(rootDir, 'node_modules', '@docusaurus', 'core', 'bin', 'docusaurus.mjs');

if (!existsSync(join(rootDir, 'build', 'index.html'))) {
  console.error('Missing build/. Run `npm run build` in examples/docusaurus first');
  process.exit(1);
}

const serverErrors = [];
const server = spawn(process.execPath, [docusaurusBin, 'serve', '--port', String(port), '--host', '127.0.0.1'], {
  cwd: rootDir,
  detached: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});

server.stdout?.on('data', (chunk) => serverErrors.push(String(chunk)));
server.stderr?.on('data', (chunk) => serverErrors.push(String(chunk)));

let serverExited = false;
server.on('exit', (code, signal) => {
  serverExited = true;
  if (code !== 0 && code !== null) {
    serverErrors.push(`Server exited with code ${code}${signal ? ` (${signal})` : ''}`);
  }
});

async function waitForServer(url, timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (serverExited) {
      throw new Error(`Server exited before becoming ready:\n${serverErrors.join('\n')}`);
    }
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // keep polling
    }
    await delay(500);
  }
  throw new Error(
    `Server did not respond at ${url} within ${timeoutMs}ms` +
      (serverErrors.length ? `\n${serverErrors.join('\n')}` : ''),
  );
}

function killServer() {
  if (server.pid) {
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {
      try {
        server.kill('SIGTERM');
      } catch {
        // already exited
      }
    }
  }
}

let browser;

try {
  await waitForServer(demoUrl);

  browser = await chromium.launch();
  const page = await browser.newPage();
  const consoleErrors = [];
  const hydrationWarnings = [];

  page.on('console', (msg) => {
    const text = msg.text();
    if (msg.type() === 'error') consoleErrors.push(text);
    if (/hydration/i.test(text)) hydrationWarnings.push(text);
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.goto(demoUrl, { waitUntil: 'networkidle' });

  const preview = page.locator('[data-testid="next-live-preview"]');
  const expectedLiveBlocks = 3;
  const previewCount = await preview.count();
  if (previewCount !== expectedLiveBlocks) {
    throw new Error(
      `Expected ${expectedLiveBlocks} live preview blocks, got ${previewCount}. isLiveBlock may be broken`,
    );
  }
  await preview.getByText('Hello from Docusaurus').waitFor({ timeout: 10_000 });
  await preview.getByText('Live preview').waitFor({ timeout: 10_000 });

  const counterTextarea = page.locator('textarea').nth(1);
  await counterTextarea.fill(`import { useState } from 'react';
import { Button } from '@next-live-docusaurus/modules';

export default function Counter() {
  const [n, setN] = useState(42);
  return (
    <Button onClick={() => setN((v) => v + 1)}>
      Count: {n}
    </Button>
  );
}`);
  await preview.getByRole('button', { name: 'Count: 42' }).waitFor({ timeout: 10_000 });
  await page.getByTestId('next-live-block-title').filter({ hasText: 'Counter' }).waitFor({
    timeout: 10_000,
  });

  for (const label of ['a live demo', 'delivery.tsx']) {
    const staticFences = page.locator('div[class*="codeBlockContainer"]').filter({ hasText: label });
    await staticFences.first().waitFor({ timeout: 10_000 });
    const fenceCount = await staticFences.count();
    for (let i = 0; i < fenceCount; i++) {
      const fence = staticFences.nth(i);
      if ((await fence.locator('textarea').count()) > 0) {
        throw new Error(`Static title="${label}" fence must not render a live textarea`);
      }
    }
  }

  if (consoleErrors.length > 0) {
    throw new Error(`Console errors: ${consoleErrors.join('\n')}`);
  }
  if (hydrationWarnings.length > 0) {
    throw new Error(`Hydration warnings: ${hydrationWarnings.join('\n')}`);
  }
  if (serverErrors.some((line) => /\berror\b/i.test(line) && !/webpack/i.test(line))) {
    throw new Error(`Server stderr: ${serverErrors.join('\n')}`);
  }

  console.log('Docusaurus smoke test passed');
} finally {
  if (browser) await browser.close();
  killServer();
}
