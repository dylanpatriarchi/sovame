// Land check: aerial and ground views of the hill road, the coast road, the
// port and the bay. Usage (dev server running):
//   node tools/land-test.mjs [time] [only-name-prefix]
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const TIME = process.argv[2] ?? 'afternoon';
const ONLY = process.argv[3];
const OUT = 'shots/land';
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

// name, x, z, yaw, pitch, eye height above ground (null = standing), fog scale
const VIEWS = [
  ['map-town', 0, 0, 0, -1.5, 420, 0],
  ['map-east', 380, 40, 0, -1.5, 420, 0],
  ['map-sopka', -520, 30, 0, -1.5, 420, 0],
  ['viewpoint', -508, 30, -Math.PI / 2, -0.12, null],
  ['sopka-road', -330, 60, 0.4, -0.02, null],
  ['port', 420, 75, -Math.PI / 2 - 0.3, 0, null],
  ['port-air', 330, 140, -Math.PI / 2 - 0.6, -0.35, 45],
  ['coast-road', 150, 590, Math.PI + 0.5, -0.02, null],
  ['coast-far', 440, 1500, Math.PI, -0.03, null],
  ['town-air', -120, -260, Math.PI - 0.5, -0.4, 70],
  ['industrial', 132, 11, -Math.PI / 2, 0, null],
  ['mole', 470, 62, -Math.PI / 2 + 0.25, 0.12, null],
  ['ship', 600, 110, 0.9, 0.1, null],
  ['plant', 128, -40, -Math.PI / 4 - 0.25, 0.28, null],
  ['pipes', 30, 30, 0.5, -0.05, null],
  ['pipes-west', -150, -80, Math.PI / 2 + 0.6, 0, null],
  ['lighthouse', 0, 0, 0, 0, null],
  ['tanks', 140, 128, -Math.PI * 0.75, 0.1, null],
  ['avenue', 7.2, 19.5, 0.08, 0.05, null],
  ['courtyard', -8, -30, Math.PI / 2, 0.08, null],
];
for (const [name, x, z, yaw, pitch, eye, fog] of VIEWS) {
  if (ONLY && !name.startsWith(ONLY)) continue;
  let [vx, vz] = [x, z];
  if (name === 'lighthouse') {
    const p = await page.evaluate(() => window.__game.world.points.lighthouse);
    vx = p.x - 34;
    vz = p.z - 30;
  }
  const info = await page.evaluate(
    (x, z, yaw, pitch, eye, fog, time) => {
      const g = window.__game;
      g.env.setTime(time);
      g.env.fogScale = fog ?? undefined;
      g.player.teleport(x, z, yaw);
      g.player.pitch = pitch;
      g.player.eyeOverride = eye;
      if (eye !== null) g.player.eye = eye;
      return { y: +g.world.heightAt(x, z).toFixed(1) };
    },
    vx, vz, name === 'lighthouse' ? -2.4 : yaw, name === 'lighthouse' ? 0.2 : pitch, eye, fog, TIME,
  );
  await wait(1600);
  await page.screenshot({ path: `${OUT}/${TIME}-${name}.png` });
  const stats = await page.evaluate(() => {
    const i = window.__game.renderer.info.render;
    return { calls: i.calls, tris: i.triangles };
  });
  console.log(name, info, stats);
}
console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no console errors');
await browser.close();
