import { test, expect } from '@playwright/test';

test.use({ timezoneId: 'America/Los_Angeles' });

test('Arak clock drives real TMY values across local midnight and supports the GitHub clock link', async ({
  page,
}) => {
  const errors: string[] = [];
  let annualRuns = 0;
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/runs')) annualRuns++;
  });
  // Keep timers running normally while controlling the clock independently of the visitor's zone.
  await page.clock.setFixedTime(new Date('2026-12-31T20:29:58Z'));
  await page.goto('/');
  await expect(page.getByText('A living view of your solar field')).toBeVisible();
  const clock = page.getByRole('button', { name: 'Use Arak local time' });
  await clock.click();
  await expect(clock).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Timeline date')).toHaveValue('2001-12-31');
  await expect(page.getByLabel('Timeline hour')).toHaveValue('23');
  await expect(page.locator('.site-clock-status')).toContainText('31 Dec 2026');
  await expect(page.locator('.site-clock-status')).toContainText('23:59:58');
  await expect(page.getByText('Night / zero output', { exact: true })).toBeVisible();

  await page.clock.setFixedTime(new Date('2026-12-31T20:30:00Z'));
  await expect(page.getByLabel('Timeline date')).toHaveValue('2001-01-01');
  await expect(page.getByLabel('Timeline hour')).toHaveValue('0');
  await expect(page.locator('.site-clock-status')).toContainText('1 Jan 2027');
  await page.clock.setFixedTime(new Date('2027-01-01T09:00:00Z'));
  await expect(page.getByLabel('Timeline hour')).toHaveValue('12');
  await expect(page.getByText('Generating', { exact: true })).toBeVisible();
  expect(
    Number((await page.locator('.current-power > div').innerText()).replace(/[^\d.]/g, '')),
  ).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Interactive solar field', exact: true }).click();
  await expect(clock).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Timeline hour').fill('6');
  await expect(clock).toHaveAttribute('aria-pressed', 'false');
  expect(annualRuns).toBe(1);

  await page.goto('/?clock=arak');
  await expect(page.getByText('A living view of your solar field')).toBeVisible();
  await expect(clock).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Timeline date')).toHaveValue('2001-01-01');
  await expect(page.getByLabel('Timeline hour')).toHaveValue('12');
  for (const width of [834, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(clock).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  expect(annualRuns).toBe(2);
  expect(errors).toEqual([]);
});
