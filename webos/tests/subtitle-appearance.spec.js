import { test, expect } from '@playwright/test';
// The remote walks the screen geometrically. A narrow control directly below a wide one
// (the bold toggle of the subtitle editor) used to be skipped in favour of a far row, so
// the whole editor must stay reachable with one key: ArrowDown.
test('the narrow toggles of the subtitle editor are reachable and usable with the remote', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { localStorage.setItem('nuvio-fork.webos.v1', JSON.stringify({ guestMode: true, addons: [], progress: {}, library: {}, watched: {}, settings: {} })); });
  await page.goto('/');
  await page.keyboard.press('Escape');
  if (!await page.locator('.sidebar').count()) await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await page.getByRole('button', { name: 'Reprodução', exact: true }).click();
  await page.getByRole('button', { name: /^Aparência das legendas/ }).click();
  await expect(page.getByRole('heading', { name: 'Aparência das legendas' })).toBeVisible();
  // Walk down from the first control: the bold toggle sits below a wider stepper row and
  // used to be skipped in favour of a row much further down.
  const walk = async () => {
    await page.locator('.subtitle-style-editor button').first().evaluate(node => node.focus({ preventScroll: true }));
    const visited = [];
    for (let step = 0; step < 12; step++) {
      await page.keyboard.press('ArrowDown');
      const seen = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') || '');
      visited.push(seen);
      if (seen === 'Contorno') break;
    }
    return visited;
  };
  const visited = await walk();
  expect(visited).toContain('Negrito');
  expect(visited).toContain('Contorno');
  for (const label of ['Negrito', 'Contorno']) {
    const control = page.getByRole('button', { name: label, exact: true });
    const before = await control.getAttribute('aria-pressed');
    expect(visited.indexOf(label)).toBeGreaterThanOrEqual(0);
    await control.evaluate(node => node.focus({ preventScroll: true }));
    await page.keyboard.press('Enter');
    await expect(control).toHaveAttribute('aria-pressed', before === 'true' ? 'false' : 'true');
  }
  expect(errors).toEqual([]);
});
