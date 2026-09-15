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


test('the packaged subtitle faces are served and the light state falls back when needed', async ({ page }) => {
  await page.goto('/');
  const probe = await page.evaluate(async () => {
    const status = {};
    for (const url of ['/assets/fonts/NetflixSans-Medium.otf', '/assets/fonts/NetflixSans-Regular.otf']) {
      try { const response = await fetch(url); status[url] = response.status; } catch { status[url] = 0; }
    }
    const load = async spec => { try { return (await document.fonts.load(spec)).length; } catch { return 0; } };
    const medium = await load('500 19px "Netflix Sans"');
    const regular = await load('400 19px "Netflix Sans Regular"');
    const inter = await load('350 19px Inter');
    return { status, medium, regular, inter, families: [...document.fonts].map(face => `${face.family}|${face.weight}`) };
  });
  // The Medium face is part of the package and must always answer.
  expect(probe.status['/assets/fonts/NetflixSans-Medium.otf']).toBe(200);
  expect(probe.medium).toBe(1);
  // The light state needs a thinner face: the exact Netflix Sans Regular when the file is
  // bundled, and the Inter variable font otherwise (never the Medium face again).
  const lightFace = probe.regular === 1 ? 'Netflix Sans Regular' : 'Inter';
  expect(probe.families.some(entry => entry.startsWith(`${lightFace}|`))).toBe(true);
  if (lightFace === 'Inter') expect(probe.inter).toBe(1);
});
