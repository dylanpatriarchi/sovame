// Spot check: walks up to the lookout bench, drinks tea, then smokes at the
// lighthouse. Usage (dev server running): node tools/spot-test.mjs [time]
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const TIME = process.argv[2] ?? 'dusk';
const OUT = 'shots/spots';
mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  protocolTimeout: 420000,
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--window-size=1280,760'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.getElementById('loading')?.classList.contains('hidden'), { timeout: 180000 });
await page.click('#btn-start');
await wait(800);

for (const [id, key, seek] of [
  ['spot:lookout', 'KeyG', 4.2],
  ['spot:lighthouse', 'KeyF', 4.2],
  ['spot:mole', 'KeyG', 9.8],
]) {
  const info = await page.evaluate(
    (id, time) => {
      const g = window.__game;
      g.env.setTime(time);
      const spot = g.world.spots.find((s) => s.id === id);
      g.player.teleport(spot.stand.x, spot.stand.z, spot.stand.yaw);
      const it = g.world.interactables.filter((i) => i.id.startsWith(id));
      return { spot: [spot.x, spot.z].map((v) => +v.toFixed(1)), interactables: it.map((i) => `${i.id} ${i.prompt()}`) };
    },
    id,
    TIME,
  );
  console.log(id, JSON.stringify(info));
  await wait(1200);
  await page.screenshot({ path: `${OUT}/${TIME}-${id.replace(':', '-')}-prompt.png` });
  await page.keyboard.press(key);
  await wait(2500);
  await page.evaluate((seek) => window.__game.smoke.seek(seek), seek);
  await wait(900);
  await page.screenshot({ path: `${OUT}/${TIME}-${id.replace(':', '-')}-${key}.png` });
  console.log(' ', JSON.stringify(await page.evaluate(() => ({ smoking: window.__game.state.smoking, mode: window.__game.smoke.mode, t: +window.__game.smoke.t.toFixed(1) }))));
  await page.keyboard.press(key);
  await wait(2200);
}
console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no console errors');
await browser.close();
