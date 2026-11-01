import { test, expect } from '@playwright/test';
test('annual simulation, field navigation, faults, optimisation and export', async ({ page }) => {
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(error.stack ?? error.message));
  const completed = page.waitForResponse(
    (response) =>
      /\/api\/runs\/[a-f0-9]{24}$/.test(response.url()) && response.request().method() === 'GET',
  );
  await page.goto('/');
  await expect(page.getByText('A living view of your solar field')).toBeVisible();
  const actual = await (await completed).json();
  await expect(page.locator('.metric-value').first()).toContainText(
    new Intl.NumberFormat('en-GB', { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(
      actual.summary.annual_energy_kwh / 1e6,
    ),
  );
  await page.screenshot({
    path: '../docs/screenshots/overview.png',
    fullPage: true,
    style: '.timeline-container{position:static!important}',
  });
  await page.getByRole('button', { name: 'Interactive solar field', exact: true }).click();
  await page.getByRole('combobox', { name: 'Select inverter' }).selectOption('2');
  await expect(page.getByRole('heading', { name: 'INV-03', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close inspector' }).click();
  await page.getByRole('button', { name: 'Top view', exact: true }).click();
  await page.getByRole('button', { name: 'Isometric view', exact: true }).click();
  await page.getByRole('combobox', { name: 'Field heatmap' }).selectOption('temperature');
  await page.getByRole('spinbutton', { name: 'Timeline hour' }).fill('10');
  await expect(page.getByRole('spinbutton', { name: 'Timeline hour' })).toHaveValue('10');
  await page.getByRole('button', { name: 'Toggle 2D field' }).click();
  await page.getByRole('button', { name: 'Select string 1', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'S-001', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close inspector' }).click();
  await page.getByRole('button', { name: 'Select module 1', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'M-00001', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close inspector' }).click();
  await page.getByRole('button', { name: 'Toggle 2D field' }).click();
  await page.getByRole('button', { name: 'Fault laboratory', exact: true }).click();
  await page.getByRole('button', { name: 'Inject event & rerun physics' }).click();
  await expect(page.getByText('1 INJECTED EVENTS', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Analyse residuals' }).click();
  await expect(page.getByText('Healthy vs faulty power')).toBeVisible();
  await page.getByRole('button', { name: 'Interactive solar field', exact: true }).click();
  await page.getByRole('combobox', { name: 'Field heatmap' }).selectOption('fault');
  await page.screenshot({ path: '../docs/screenshots/fault-field.png', fullPage: true });
  await page.getByRole('button', { name: 'Cleaning optimisation', exact: true }).click();
  await page.getByRole('button', { name: 'Optimise schedule', exact: true }).click();
  await expect(page.getByText('Strategy comparison', { exact: true })).toBeVisible();
  await page.screenshot({ path: '../docs/screenshots/cleaning.png', fullPage: true });
  await page.getByRole('button', { name: 'Results & reporting', exact: true }).click();
  const popupPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Plant CSV', exact: true }).click();
  const download = await popupPromise;
  expect(download.suggestedFilename()).toContain('plant.csv');
  await page.getByRole('button', { name: 'Scientific methodology', exact: true }).click();
  await expect(page.getByText('Science you can inspect')).toBeVisible();
  expect(failures).toEqual([]);
});

test('all engineering pages and tablet navigation use real run data', async ({ page }) => {
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(error.message));
  await page.goto('/');
  await expect(page.getByText('A living view of your solar field')).toBeVisible();
  for (const [button, title] of [
    ['Weather & resource', 'Weather & solar resource.'],
    ['Physical simulation', 'Physical simulation.'],
    ['Energy losses', 'Energy loss decomposition.'],
    ['Financial performance', 'Financial performance.'],
    ['Predictive maintenance', 'Maintenance decisions.'],
    ['Uncertainty & sensitivity', 'Uncertainty & sensitivity.'],
    ['Scenario comparison', 'Scenario comparison.'],
  ]) {
    await page.getByRole('button', { name: button, exact: true }).click();
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  }
  await page.setViewportSize({ width: 834, height: 1112 });
  await page.getByRole('button', { name: 'Plant overview', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Plant overview.', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({
    path: '../docs/screenshots/tablet.png',
    fullPage: true,
    style: '.timeline-container{position:static!important}',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('button', { name: 'Results & reporting', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Results & reporting.', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(failures).toEqual([]);
});

test('3D module raycasting opens the modelled equipment inspector', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('A living view of your solar field')).toBeVisible();
  await page.getByRole('button', { name: 'Interactive solar field', exact: true }).click();
  await page.getByRole('button', { name: 'Top view', exact: true }).click();
  await page.waitForTimeout(700); // Allow the camera animation to settle before raycasting.
  const bounds = await page.locator('.field-canvas canvas').boundingBox();
  expect(bounds).not.toBeNull();
  let selected = false;
  for (const x of [0.43, 0.47, 0.53, 0.57]) {
    if (selected) break;
    for (const y of [0.38, 0.42, 0.46, 0.5, 0.54, 0.58, 0.62]) {
      const px = bounds!.x + bounds!.width * x,
        py = bounds!.y + bounds!.height * y;
      await page.mouse.move(px, py);
      await page.waitForTimeout(45); // Wait one render frame for the pointer tooltip.
      if (await page.locator('.module-tooltip-host').isVisible()) {
        await page.mouse.click(px, py);
        selected = true;
        break;
      }
    }
  }
  expect(selected).toBe(true);
  await expect(page.locator('.inspection h2')).toHaveText(/^M-\d{5}$/);
  await expect(page.getByText('W DC · allocated', { exact: true })).toBeVisible();
});
