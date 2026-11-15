// Smoke test: boots the game in headless Chrome, looks around the town,
// drives a car for a few seconds and sits down at a spot. Fails (exit 1) on
// any console error. Usage (dev server running):
//   node tools/smoke.mjs [url] [outDir]
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const URL_BASE = process.argv[2] ?? 'http://localhost:5173';
const OUT = process.argv[3] ?? 'shots/smoke';
mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
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
const fail = (msg) => errors.push(msg);

await page.goto(URL_BASE, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.getElementById('loading')?.classList.contains('hidden'), { timeout: 180000 });
await page.click('#btn-start');
await wait(800);
const clock0 = await page.evaluate(() => ({ m: window.__game.env.minutes, text: window.__game.env.clock }));

// a few fixed looks at the town and the land
for (const [name, x, z, yaw] of [
  ['avenue', 7.6, 8, 0.08],
  ['courtyard', 50, 90, Math.PI / 2],
  ['port-road', 300, 90, -Math.PI / 2],
  ['south-avenue', 0, -215, Math.PI],
  ['whole-town', 0, 185, Math.PI],
  ['south-yard', 60, -340, 0.6],
]) {
  await page.evaluate((x, z, yaw) => window.__game.player.teleport(x, z, yaw), x, z, yaw);
  await wait(1200);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  const info = await page.evaluate(() => window.__game.renderer.info.render);
  console.log(`→ ${name}: ${info.calls} calls, ${info.triangles} triangles`);
}

// behind the wheel
const before = await page.evaluate(() => {
  const g = window.__game;
  const car = g.world.cars[0];
  car.x = 0;
  car.z = 230;
  car.heading = 0;
  car.vx = car.vz = 0;
  g.driving.enter(car);
  return { z: car.z, cars: g.world.cars.length };
});
await page.keyboard.down('KeyW');
await wait(6000);
await page.keyboard.up('KeyW');
await page.screenshot({ path: `${OUT}/driving.png` });
const after = await page.evaluate(() => ({ z: window.__game.driving.car.z, speed: window.__game.driving.car.speed }));
console.log(`→ drove ${(after.z - before.z).toFixed(1)} m, ${after.speed.toFixed(1)} m/s (${before.cars} cars)`);
if (after.z - before.z < 3) fail('[drive] the car did not move');
// brake until it actually stands still (the software renderer runs slow)
await page.keyboard.down('Space');
await page.waitForFunction(() => Math.abs(window.__game.driving.car.speed) < 0.5, { timeout: 60000 });
await page.keyboard.up('Space');
await wait(300);
await page.keyboard.press('KeyE');
await wait(2500);
if (await page.evaluate(() => window.__game.driving.active)) fail('[drive] could not get out of the car');

// a bench: tea from the thermos
const spot = await page.evaluate(() => {
  const g = window.__game;
  const s = g.world.spots[0];
  g.player.teleport(s.stand.x, s.stand.z, s.stand.yaw);
  return s.id;
});
await wait(800);
await page.keyboard.press('KeyG');
await wait(3000);
const sitting = await page.evaluate(() => ({ smoking: window.__game.state.smoking, mode: window.__game.smoke.mode }));
console.log(`→ ${spot}: ${JSON.stringify(sitting)}`);
if (!sitting.smoking || sitting.mode !== 'tea') fail('[spot] sitting down for tea did not start');
await page.screenshot({ path: `${OUT}/spot.png` });

// doors: the grocery and the flat open, the rest say they are locked
await page.keyboard.press('KeyG'); // up from the bench first
await wait(3000);
const doors = await page.evaluate(() => window.__game.world.doors.map((d, i) => ({ i, x: d.x, z: d.z, yaw: d.yaw, inside: d.inside })));
const promptText = () => page.evaluate(() => document.getElementById('prompt').textContent);
const useDoor = async (d, shot) => {
  await page.evaluate((d) => {
    const g = window.__game;
    g.env.setTime('afternoon');
    g.player.teleport(d.x - Math.sin(d.yaw) * 6, d.z - Math.cos(d.yaw) * 6, d.yaw + Math.PI);
    g.player.pitch = 0.08;
  }, d);
  await wait(2500);
  await page.screenshot({ path: `${OUT}/door-${shot}.png` });
  await page.evaluate((d) => window.__game.player.teleport(d.x, d.z, d.yaw + Math.PI), d);
  await wait(900);
};
for (const kind of ['shop', 'flat']) {
  const d = doors.find((x) => x.inside === kind);
  if (!d) {
    fail(`[doors] no door opens into the ${kind}`);
    continue;
  }
  await useDoor(d, kind);
  const prompt = await promptText();
  await page.keyboard.press('KeyE');
  await wait(2200);
  const inside = await page.evaluate(() => window.__game.world.inside?.id ?? null);
  console.log(`→ door "${prompt}" → ${inside}`);
  if (inside !== kind) fail(`[doors] E at the ${kind} door did not lead inside`);
  await page.evaluate(() => {
    const g = window.__game;
    const r = g.world.inside;
    if (r) g.player.teleport(r.spawn.x - 0.6, r.spawn.z, 0.75);
  });
  await wait(900);
  await page.screenshot({ path: `${OUT}/room-${kind}.png` });
  await page.evaluate(() => {
    const g = window.__game;
    const r = g.world.inside;
    if (r) g.player.teleport(r.door.x, r.door.z - 0.4, Math.PI);
  });
  await wait(900);
  await page.keyboard.press('KeyE');
  await wait(2200);
  const out = await page.evaluate((d) => {
    const g = window.__game;
    return { inside: g.world.inside?.id ?? null, far: Math.hypot(g.player.position.x - d.x, g.player.position.z - d.z) };
  }, d);
  if (out.inside || out.far > 1) fail(`[doors] could not leave the ${kind} by its door`);
}
{
  const d = doors.find((x) => !x.inside);
  await useDoor(d, 'locked');
  const prompt = await promptText();
  console.log(`→ any other door: "${prompt}"`);
  if (!/locked|closed/.test(prompt)) fail('[doors] a locked door does not say so');
}

// a marker post goes down when a car runs into it
{
  const post = await page.evaluate(() => {
    const g = window.__game;
    const s = g.world.posts.stakes.find((p) => p.z > 320 && p.z < 520);
    const car = g.world.cars[0];
    Object.assign(car, { x: s.x, z: s.z - 6, heading: 0, vx: 0, vz: 0, speed: 0 });
    g.driving.enter(car);
    return s.i;
  });
  await page.keyboard.down('KeyW');
  await wait(7000);
  await page.keyboard.up('KeyW');
  const hit = await page.evaluate((i) => {
    const g = window.__game;
    const out = { down: g.world.posts.stakes[i].down, speed: +g.driving.car.speed.toFixed(1) };
    g.driving.car.speed = g.driving.car.vx = g.driving.car.vz = 0;
    const s = g.world.posts.stakes[i];
    out.car = [g.driving.car.x - s.x, g.driving.car.z - s.z].map((v) => +v.toFixed(1));
    return out;
  }, post);
  console.log(`→ marker post: ${JSON.stringify(hit)}`);
  if (!hit.down) fail('[posts] the car went through a marker post without knocking it over');
  if (hit.speed < 2) fail('[posts] a marker post stopped the car dead');
  await page.screenshot({ path: `${OUT}/post.png` });
  await wait(600);
  await page.keyboard.press('KeyE');
  await wait(2200);
}

// errands: a parcel from the counter to a door, a rod, a fish, the map
{
  const g0 = await page.evaluate(() => {
    const g = window.__game;
    const door = g.world.doors.find((d) => d.inside === 'shop');
    g.actions.enterRoomNow(door);
    const c = g.world.rooms.shop.counter;
    g.player.teleport(c.x, c.z, 0);
    return true;
  });
  await wait(700);
  const counter = await promptText();
  await page.keyboard.press('KeyE');
  await wait(400);
  const job = await page.evaluate(() => {
    const g = window.__game;
    const j = g.errands.job;
    if (!j) return null;
    g.actions.leaveRoomNow();
    g.player.teleport(j.door.x, j.door.z, j.door.yaw);
    return { address: j.door.address, pay: j.pay, task: document.querySelector('#task .label').textContent };
  });
  console.log(`→ counter: "${counter}" → ${JSON.stringify(job)}`);
  if (!job) fail('[errands] E at the counter did not hand out a parcel');
  else {
    await wait(900);
    await page.screenshot({ path: `${OUT}/parcel.png` });
    await page.keyboard.press('KeyM');
    await wait(900);
    await page.screenshot({ path: `${OUT}/map.png` });
    const open = await page.evaluate(() => !document.getElementById('map').classList.contains('hidden'));
    if (!open) fail('[map] M did not open the map');
    await page.keyboard.press('KeyM');
    const at = await promptText();
    await page.keyboard.press('KeyE');
    await wait(400);
    const paid = await page.evaluate(() => ({ rubles: window.__game.errands.rubles, job: !!window.__game.errands.job }));
    console.log(`→ parcel: "${at}" → ${paid.rubles} ₽`);
    if (paid.rubles !== job.pay || paid.job) fail('[errands] the parcel was not paid for at its door');
  }
  // a rod over the counter, then out on the bay ice
  await page.evaluate(() => {
    const g = window.__game;
    g.errands.rubles = 200;
    g.actions.enterRoomNow(g.world.doors.find((d) => d.inside === 'shop'));
    const c = g.world.rooms.shop.counter;
    g.player.teleport(c.x, c.z, 0);
  });
  await wait(600);
  await page.keyboard.press('KeyF');
  await wait(300);
  const spot = await page.evaluate(async () => {
    const g = window.__game;
    const { isIce } = await import('/src/world/land.js');
    g.actions.leaveRoomNow();
    for (let x = 500; x < 760; x += 4) {
      if (isIce(x, 520) && isIce(x - 12, 520) && isIce(x + 12, 520)) {
        g.player.teleport(x, 520, -Math.PI / 2);
        return { x, rod: g.errands.rod, rubles: g.errands.rubles };
      }
    }
    return null;
  });
  if (!spot?.rod) fail('[errands] F at the counter did not sell a rod');
  await wait(800);
  const ice = await promptText();
  await page.keyboard.press('KeyF');
  await wait(500);
  await page.evaluate(() => window.__game.errands.fishing && (window.__game.errands.fishing.wait = 0));
  await wait(500);
  const bite = await promptText();
  await page.screenshot({ path: `${OUT}/fishing.png` });
  await page.keyboard.press('KeyE');
  await wait(300);
  const fish = await page.evaluate(() => window.__game.errands.fish);
  await page.keyboard.press('KeyF');
  await wait(300);
  const free = await page.evaluate(() => window.__game.player.enabled && !window.__game.errands.fishing);
  console.log(`→ ice: "${ice}" → "${bite}" → ${JSON.stringify(fish)}`);
  if (fish.length !== 1) fail('[errands] a strike on a bite did not land a fish');
  if (!free) fail('[errands] F did not pack the rod up');
}

// the boat off the mole: aboard from the shore, under way, only on water
{
  const ok = await page.evaluate(() => {
    const g = window.__game;
    const boat = g.world.boats[0];
    if (!boat) return false;
    let x = boat.x - 14;
    while (!g.world.collides(x + 0.5, boat.z, 0.35) && x < boat.x) x += 0.5;
    g.player.teleport(x, boat.z, -Math.PI / 2);
    return true;
  });
  if (!ok) fail('[boat] there is no boat at the mole');
  await wait(900);
  await page.screenshot({ path: `${OUT}/boat.png` });
  await page.keyboard.press('KeyE');
  await wait(2200);
  const start = await page.evaluate(() => {
    const g = window.__game;
    const b = g.driving.car;
    if (!b?.boat) return null;
    return { x: b.x };
  });
  if (!start) fail('[boat] E on the shore next to the boat did not take the helm');
  else {
    await page.keyboard.down('KeyW');
    await wait(6000);
    await page.keyboard.up('KeyW');
    const sea = await page.evaluate(() => {
      const b = window.__game.driving.car;
      return { x: b.x, afloat: b.afloat(b.x, b.z, b.heading) };
    });
    console.log(`→ boat: ${(sea.x - start.x).toFixed(1)} m out, afloat ${sea.afloat}`);
    if (sea.x - start.x < 8 || !sea.afloat) fail('[boat] the boat did not get under way');
    await page.screenshot({ path: `${OUT}/at-sea.png` });
  }
}

// the clock runs, and the sofa moves it on
{
  const now = await page.evaluate(() => {
    const g = window.__game;
    const out = { m: g.env.minutes, text: g.env.clock };
    g.env.setClock(3 * 60);
    return out;
  });
  await wait(2500);
  const night = await page.evaluate(() => ({ stars: +window.__game.env.cur.stars.toFixed(2), text: window.__game.env.clock }));
  await page.evaluate(() => window.__game.env.setClock(13 * 60 + 30));
  await wait(2500);
  const day = await page.evaluate(() => ({ stars: +window.__game.env.cur.stars.toFixed(2), sun: +window.__game.env.cur.sunIntensity.toFixed(2), text: window.__game.env.clock }));
  await page.screenshot({ path: `${OUT}/midday.png` });
  console.log(`→ clock: ${clock0.text} → ${now.text}; ${night.text} stars ${night.stars}; ${day.text} stars ${day.stars}, sun ${day.sun}`);
  if (((now.m - clock0.m + 1440) % 1440) < 20) fail('[clock] the time of day does not move while playing');
  if (night.stars < 0.5 || day.stars > 0.3) fail('[clock] the sky does not follow the clock');
}

// the game is saved when the tab goes away and comes back as it was left
{
  const left = await page.evaluate(() => {
    const g = window.__game;
    g.save();
    const b = g.driving.car;
    return { boat: !!b?.boat, x: b?.x ?? g.player.position.x, z: b?.z ?? g.player.position.z };
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.getElementById('loading')?.classList.contains('hidden'), { timeout: 180000 });
  const label = await page.evaluate(() => document.getElementById('btn-start').textContent);
  await page.click('#btn-start');
  await wait(1500);
  const back = await page.evaluate(() => {
    const g = window.__game;
    const b = g.driving.car;
    return { boat: !!b?.boat, x: b?.x ?? g.player.position.x, z: b?.z ?? g.player.position.z, rod: g.errands.rod, fish: g.errands.fish.length };
  });
  if (!back.rod || back.fish !== 1) fail('[save] the rod and the catch were not kept');
  console.log(`→ save: "${label}", back ${Math.hypot(back.x - left.x, back.z - left.z).toFixed(1)} m from where the tab closed, at the helm ${back.boat}`);
  if (label !== 'Continue') fail('[save] the title does not offer to continue');
  if (back.boat !== left.boat || Math.hypot(back.x - left.x, back.z - left.z) > 12) fail('[save] the game did not come back where it was left');
}

await browser.close();
if (errors.length) {
  console.error(`FAILED:\n${errors.join('\n')}`);
  process.exit(1);
}
console.log('smoke test passed');
