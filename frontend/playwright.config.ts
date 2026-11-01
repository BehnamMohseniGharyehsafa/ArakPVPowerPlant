import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  timeout: 120000,
  expect: { timeout: 30000 },
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:8000',
    viewport: { width: 1512, height: 1050 },
    headless: true,
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
        (process.platform === 'win32'
          ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
          : undefined),
      args: ['--enable-unsafe-swiftshader'],
    },
  },
  reporter: 'list',
});
