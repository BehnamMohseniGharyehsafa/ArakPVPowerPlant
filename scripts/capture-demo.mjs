// Capture actual field interaction frames. Run against the local production server.
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const directory = new URL('../docs/screenshots/demo-frames/', import.meta.url);
await fs.mkdir(directory, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
    (process.platform === 'win32'
      ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
      : undefined),
  args: ['--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1300, height: 1050 } });
await page.goto('http://127.0.0.1:8000');
await page.getByText('A living view of your solar field').waitFor({ timeout: 60000 });
await page.getByRole('button', { name: 'Interactive solar field', exact: true }).click();
await page.getByRole('button', { name: 'Top view', exact: true }).click();
for (const [i, hour] of [6, 8, 10, 12, 14, 16, 18].entries()) {
  await page.getByRole('spinbutton', { name: 'Timeline hour' }).fill(String(hour));
  await page.waitForTimeout(650); // Capture after the camera transition and equipment request settle.
  await page
    .locator('.solar-field')
    .screenshot({ path: fileURLToPath(new URL(`${String(i).padStart(2, '0')}.png`, directory)) });
}
await browser.close();
