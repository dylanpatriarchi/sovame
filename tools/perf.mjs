// Performance probe: opens the game with ?perf and records renderer.info and
// per-pass costs from fixed viewpoints (title, old centre, north, west, south,
// inside a flat with a window in view). Also breaks the draw calls of the
// main pass down by what issues them, so the biggest offenders stand out.
// Usage: node tools/perf.mjs [url] [out.json]   (dev server must run)
// Timings from a software renderer (swiftshader) are only indicative; the
// draw-call, triangle and object counts are exact on any machine.
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';

const URL_BASE = process.argv[2] ?? 'http://localhost:5173';
const OUT = process.argv[3] ?? null;
// CHROME_PATH overrides the default (macOS) browser binary, e.g. on Linux
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const GPU = !!process.env.PERF_GPU;

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  protocolTimeout: 420000,
  args: [
    ...(GPU ? [] : ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']),
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--window-size=1280,760',
  ],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const sep = URL_BASE.includes('?') ? '&' : '?';
await page.goto(`${URL_BASE}${sep}perf`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => document.getElementById('loading')?.classList.contains('hidden'), { timeout: 180000 });

// yaw: the player faces (-sin yaw, -cos yaw); 0 looks south, π north
const VIEWS = [
  { name: 'title', title: true },
  { name: 'centre', x: 7.2, z: 19.5, yaw: 0.08 },
  { name: 'north', x: 2, z: 107, yaw: Math.PI },
  { name: 'north-back', x: 2, z: 107, yaw: 0 },
  { name: 'west', x: -170, z: -40, yaw: Math.PI },
  { name: 'south', x: -40, z: -150, yaw: -Math.PI / 2 },
  { name: 'flat', flat: true },
];

const results = {};
for (const v of VIEWS) {
  await page.evaluate(async (v) => {
    const g = window.__game;
    g.env.setTime('dusk');
    g.env.snapTo(g.env.preset);
    if (v.title) {
      g.state.mode = 'title';
      g.state.introT = 6;
      return;
    }
    if (g.state.mode === 'title') document.getElementById('btn-start').click();
    g.state.mode = 'playing';
    if (v.flat) {
      // in through a street door (so the window looks at the real block),
      // up to the landing and into the first flat behind it
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      g.world.interactables.find((it) => it.id.startsWith('door-')).onUse();
      for (let i = 0; i < 200 && (!g.state.interior || g.state.transitioning); i++) await sleep(100);
      const flat = g.world.flats.find((f) => f.parent === g.state.interior);
      g.world.interactables.find((it) => it.id === `${flat.id}:enter`).onUse();
      for (let i = 0; i < 200 && (g.state.interior?.kind !== 'flat' || g.state.transitioning); i++) await sleep(100);
      const b = g.state.interior.bounds;
      g.player.teleport(b.x0 + 4.4, b.z0 + 3.0, Math.PI + 0.6);
      g.player.pitch = 0;
      // look around, then face the middle of the arc where a pane is in view
      const seen = [];
      for (let k = 0; k < 16; k++) {
        g.player.yaw = (k / 16) * Math.PI * 2;
        for (let f = 0; f < 3; f++) await new Promise((r) => requestAnimationFrame(r));
        if (g.windowViews.visible) seen.push(k);
      }
      if (seen.length) g.player.yaw = (seen[Math.floor(seen.length / 2)] / 16) * Math.PI * 2;
      return;
    }
    g.state.interior = null;
    g.windowViews.setView(null);
    g.env.setIndoors(false);
    g.player.teleport(v.x, v.z, v.yaw);
    g.player.pitch = -0.05;
  }, v);
  await wait(1500);
  const stats = await page.evaluate(async (frames) => {
    const raf = () => new Promise((r) => requestAnimationFrame(r));
    for (let i = 0; i < frames; i++) await raf();
    return window.__perf.snapshot(frames);
  }, 6);
  const breakdown = await page.evaluate(() => window.__perf.breakdown?.() ?? null);
  results[v.name] = { ...stats, breakdown };
  const s = stats;
  console.log(
    `${v.name.padEnd(7)} calls ${String(s.info.calls).padStart(4)}  tris ${String(Math.round(s.info.triangles / 1000)).padStart(4)}k  ` +
      `prg ${s.info.programs}  tex ${s.info.textures}  geo ${s.info.geometries}  lights ${s.lights}  ` +
      `| calls main ${s.calls.main} win ${s.calls.windows} shadow ${s.calls.shadow} bloom ${s.calls.bloom} | ` +
      `cpu ms: update ${s.cpu.update.toFixed(1)} win ${s.cpu.windows.toFixed(1)} shadow ${s.cpu.shadow.toFixed(1)} main ${s.cpu.main.toFixed(1)} bloom ${s.cpu.bloom.toFixed(1)}` +
      (s.gpu ? ` | gpu ms: win ${s.gpu.windows.toFixed(2)} shadow ${s.gpu.shadow.toFixed(2)} main ${s.gpu.main.toFixed(2)} bloom ${s.gpu.bloom.toFixed(2)}` : '')
  );
  if (breakdown) {
    const top = Object.entries(breakdown).sort((a, b) => b[1] - a[1]).slice(0, 14);
    console.log('        main-pass objects by origin:', top.map(([k, n]) => `${k} ${n}`).join(', '));
  }
}
if (OUT) writeFileSync(OUT, JSON.stringify(results, null, 2));
await browser.close();
