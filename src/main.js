// Game boot: scene, staged loading, main loop, interactions.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { World } from './world/index.js';
import { INTERIOR_LAYER, LAND_H, OUTDOOR_LIGHT_LAYER, stairwellView } from './world/interiors.js';
import { flatView, numberFlats, setFlatLight } from './world/flats.js';
import { WindowViews } from './windowview.js';
import { allEntrances } from './world/entrances.js';
import { Environment } from './environment.js';
import { Player } from './player.js';
import { Sound } from './audio.js';
import { UI } from './ui.js';
import { Smoke, smokeSpots } from './smoke.js';
import { Driving } from './driving.js';
import { Snowballs } from './snowballs.js';
import { DistrictMap } from './map.js';
import { PhotoMode } from './photo.js';
import { Snowmen } from './snowmen.js';
import { Bread, PRICE } from './bread.js';
import { Perf } from './perf.js';
import { PLAYER, QUALITY, SETTINGS_DEFAULTS } from './config.js';
import { DynamicResolution } from './resolution.js';
import { clamp } from './util.js';

const STORAGE_KEY = 'pervyj-sneg:settings';
const isTouch = window.matchMedia('(pointer: coarse)').matches;
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...SETTINGS_DEFAULTS };
    return { ...SETTINGS_DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...SETTINGS_DEFAULTS };
  }
}

function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable: no big deal */
  }
}

function resolveQuality(requested) {
  if (requested !== 'auto') return requested;
  if (isTouch) return 'medium';
  return window.devicePixelRatio > 2.2 ? 'medium' : 'high';
}

async function boot() {
  const canvas = document.getElementById('scene');
  const settings = loadSettings();
  let quality = resolveQuality(settings.quality);

  // no MSAA on the canvas: the scene is drawn into the composer's (non
  // multisampled) targets, so the canvas only ever receives the final quad
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance',
    stencil: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY[quality].pixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.shadowMap.enabled = quality !== 'low';
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.08, 1500);
  camera.position.set(2.4, 1.9, 44);
  // stairwell interiors live on their own layer, lit only by their own
  // bulbs; the district lights have one too. Outdoors the camera sees the
  // district and its lights, indoors the interiors and theirs: two fixed
  // light sets, so the shaders compiled for each are reused, never rebuilt
  let cameraIndoors = null;
  function setCameraIndoors(indoors) {
    if (indoors === cameraIndoors) return;
    cameraIndoors = indoors;
    if (indoors) {
      camera.layers.enable(INTERIOR_LAYER);
      camera.layers.disable(OUTDOOR_LIGHT_LAYER);
    } else {
      camera.layers.disable(INTERIOR_LAYER);
      camera.layers.enable(OUTDOOR_LIGHT_LAYER);
    }
  }
  setCameraIndoors(false);

  // post chain: bloom only haloes genuinely bright sources (windows, lamps, moon)
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.32, 0.4, 1.0);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
  // accumulate renderer.info across all composer passes (smoke test reads it)
  renderer.info.autoReset = false;
  // frames over budget lower the render resolution (?fixedres turns it off,
  // for comparable screenshots)
  const dynres = new DynamicResolution({ enabled: !new URLSearchParams(window.location.search).has('fixedres') });
  // ?perf in the URL: frame-time and per-pass overlay (also __perf.toggle())
  const perf = new Perf(renderer);
  perf.instrument(composer, ['main', 'bloom', 'output']);
  perf.lights = () => {
    let n = 0;
    scene.traverseVisible((o) => {
      if (o.isLight && !o.isAmbientLight && !o.isHemisphereLight && o.layers.test(camera.layers)) n++;
    });
    return n;
  };
  perf.setEnabled(new URLSearchParams(window.location.search).has('perf'));

  const sound = new Sound({ volume: settings.volume });
  const state = { mode: 'loading', elapsed: 0, introT: 0, interior: null, transitioning: false, smoking: false };

  const ui = new UI({
    settings,
    sound,
    onChange: (key, value) => applySetting(key, value),
    onStart: () => enterWorld(),
    onResume: () => resume(),
    onQuit: () => toTitle(),
  });

  /* --------------------------------------------------- build */

  ui.setProgress(0.04, 'Sky and light');
  await nextFrame();

  const world = new World({ season: settings.season, quality });
  scene.add(world.group);
  // interior windows look at the real district (portal renders)
  const windowViews = new WindowViews({ renderer, scene, quality });
  world.windowViews = windowViews;

  await world.build((fraction, label) => ui.setProgress(0.08 + fraction * 0.62, label));

  // interaction registry: the kiosk radio plus one in/out pair per stairwell
  const radio = world.points.radio;
  if (radio) {
    world.interactables.push({
      id: 'radio',
      x: radio.x,
      z: radio.z,
      radius: 7,
      prompt: () => (sound.radioOn ? 'E — turn off the radio' : 'E — turn on the radio'),
      onUse: () => {
        sound.toggleRadio();
        sound.ui('tick');
      },
    });
  }
  // every entrance door of every block opens: the three furnished
  // stairwells answer for all of them (the one behind its own door, the
  // others picked by a stable hash) and remember which door you came in by
  for (const door of allEntrances()) {
    const own = world.interiors.find((it) => Math.hypot(it.doorOut.x - door.pad.x, it.doorOut.z - door.pad.z) < 0.1);
    const hash = Math.abs(Math.round(door.x * 7.3 + door.z * 13.1));
    const interior = own ?? world.interiors[hash % world.interiors.length];
    const caption = `Entrance ${door.number} · building ${door.spec.number}`;
    world.interactables.push({
      id: `door-${door.spec.id}-${door.cell}-${door.side}`,
      x: door.pad.x,
      z: door.pad.z,
      radius: 2.4,
      prompt: () => 'E — enter the stairwell',
      onUse: () => {
        interior.outSpawn = door.out;
        interior.caption = caption;
        // the stairwell now stands behind this very door: its window, floor
        // numbers and flats follow the block, the entrance and the floor
        interior.address = { spec: door.spec, x: door.x, side: door.side, entrance: door.number };
        interior.floor = 1;
        interior.drawFloor?.(1);
        numberFlats(world, interior);
        useDoor(interior, true);
      },
    });
  }
  for (const interior of world.interiors) {
    world.interactables.push({
      id: `${interior.id}:exit`,
      x: interior.doorIn.x,
      z: interior.doorIn.z,
      radius: 1.5,
      prompt: () => 'E — step outside',
      onUse: () => useDoor(interior, false),
    });
    // the flight going up from the landing, and back down a floor
    const scx = (interior.bounds.x0 + interior.bounds.x1) / 2;
    const scz = (interior.bounds.z0 + interior.bounds.z1) / 2;
    const floors = () => interior.address?.spec.floors ?? 5;
    world.interactables.push({
      id: `${interior.id}:up`,
      x: scx + 1.42,
      z: scz + 2.3,
      y: LAND_H,
      radius: 0.95,
      facing: { x: 0, z: -1 },
      available: () => interior.floor < floors(),
      prompt: () => `E — up to floor ${interior.floor + 1}`,
      onUse: () => changeFloor(interior, 1),
    });
    world.interactables.push({
      id: `${interior.id}:down`,
      x: scx - 1.42,
      z: scz + 2.3,
      y: LAND_H,
      radius: 0.95,
      facing: { x: 0, z: -1 },
      available: () => interior.floor > 1,
      prompt: () => `E — down to floor ${interior.floor - 1}`,
      onUse: () => changeFloor(interior, -1),
    });
  }
  // one flat behind a padded door on each landing, with a kitchen radio
  const radioPrompt = () => (sound.radioOn ? 'E — turn off the radio' : 'E — turn on the radio');
  for (const flat of world.flats) {
    world.interactables.push({
      id: `${flat.id}:enter`,
      x: flat.doorOut.x,
      z: flat.doorOut.z,
      y: flat.doorOut.y,
      radius: 1.1,
      facing: flat.doorFacing,
      prompt: () => `E — go into flat ${flat.number}`,
      onUse: () => useDoor(flat, true),
    });
    world.interactables.push({
      id: `${flat.id}:exit`,
      x: flat.doorIn.x,
      z: flat.doorIn.z,
      radius: 1.0,
      prompt: () => 'E — back to the stairwell',
      onUse: () => useDoor(flat, false),
    });
    world.interactables.push({
      id: `${flat.id}:radio`,
      x: flat.radio.x + 0.9,
      z: flat.radio.z - 0.6,
      radius: 1.5,
      prompt: radioPrompt,
      onUse: () => {
        sound.toggleRadio();
        sound.ui('tick');
      },
    });
  }

  const env = new Environment({
    scene,
    renderer,
    world,
    time: settings.time,
    season: settings.season,
    snow: settings.snow,
    quality,
  });
  ui.setProgress(0.78, 'Wind, snow and street lamps');
  await nextFrame();

  const player = new Player({ camera, world, domElement: canvas, settings });

  // smoke spots: F at the bench, the bus stop and a stairwell landing
  const smoke = new Smoke({ scene, camera, world, env, sound });
  const snowballs = new Snowballs({ scene, world, sound });
  const map = new DistrictMap({ world, camera });
  const photo = new PhotoMode({ canvas, player, sound, env });
  const snowmen = new Snowmen({ world, sound, snowballs });
  // E on open snow in winter rolls a snowman: look down at the snow in front
  // of you, with nothing else at hand (it answers from just inside its
  // radius, so anything nearer wins)
  world.interactables.push({
    id: 'snowman',
    x: 0,
    z: 0,
    radius: 50,
    distanceTo: () =>
      player.pitch > -0.35 || state.interior || driving.active || state.smoking || !snowmen.spotFor(player.position, player.forwardVector) ? Infinity : 49.9,
    prompt: () => 'E — build a snowman',
    onUse: () => {
      const spot = snowmen.spotFor(player.position, player.forwardVector);
      if (spot) snowmen.build(spot);
    },
  });
  // the kiosk sells a loaf over the counter (8:00 to 20:00); B crumbles it
  // for the pigeons, a handful at a time, wherever a flock lives near enough
  const bread = new Bread({ world, sound, env });
  const counter = world.points.counter;
  if (counter) {
    world.interactables.push({
      id: 'kiosk',
      x: counter.x,
      z: counter.z,
      radius: 1,
      // right at the window it is the counter, not the radio, that answers
      distanceTo: (x, z) => (Math.hypot(x - counter.x, z - counter.z) < 1.4 ? 0 : Infinity),
      facing: { x: 0, z: 1 },
      available: () => !driving.active,
      prompt: () =>
        !bread.open ? 'The kiosk is shut · open 8:00 — 20:00' : bread.full ? 'Enough bread for now' : `E — buy a loaf (${PRICE} kop.)`,
      onUse: () => {
        if (!bread.buy()) sound.ui('tick');
      },
    });
  }
  world.interactables.push({
    id: 'crumbs',
    key: 'KeyB',
    x: 0,
    z: 0,
    radius: 50,
    distanceTo: () =>
      bread.handfuls <= 0 ||
      state.interior ||
      driving.active ||
      state.smoking ||
      !bread.pigeonsNear(player.position) ||
      !bread.spotFor(player.position, player.forwardVector)
        ? Infinity
        : 49.95,
    prompt: () => `B — crumble bread for the pigeons (${bread.handfuls} left)`,
    onUse: () => bread.crumble(player.position, player.forwardVector),
  });
  for (const spot of smokeSpots(world)) {
    world.interactables.push({
      id: spot.id,
      key: 'KeyF',
      x: spot.x,
      z: spot.z,
      y: spot.y,
      radius: spot.radius,
      available: () => smoke.available(spot),
      prompt: () => 'F — have a smoke',
      onUse: () => startSmoke(spot),
    });
  }
  // every parked car: E to get in (the prompt follows the car around)
  const driving = new Driving({ camera, world, player, sound, env });
  for (const car of world.cars ?? []) {
    world.interactables.push({
      id: `car-${car.id}`,
      get x() {
        return car.x;
      },
      get z() {
        return car.z;
      },
      // measured from the bodywork, not the car's center
      distanceTo: (x, z) => car.distanceTo(x, z),
      radius: 1.3,
      available: () => !driving.active && !state.interior,
      prompt: () => 'E — get in the car',
      onUse: () => enterCar(car),
    });
  }
  player.setFootprintStyle('snow', settings.season);
  ui.setProgress(0.94, 'Final touches');
  await nextFrame();

  player.onStep = (surface, speed) => {
    // concrete inside a stairwell rings like the shaft it is
    sound.step(surface === 'concrete' && state.interior && !state.interior.kind ? 'stairs' : surface, speed);
    player.setFootprintStyle(surface, settings.season);
  };
  player.onJump = () => sound.jump();
  player.onLand = (impact) => sound.land(impact);
  player.onLockChange = (locked) => {
    if (!locked && state.mode === 'playing') pause();
  };

  // compile now, behind the loading bar, every shader the walk will need:
  // both light sets (outdoors, indoors), the expansion details, both seasons
  ui.setProgress(0.97, 'Warming up');
  await nextFrame();
  await precompileShaders();

  ui.setProgress(1, 'Ready');
  ui.hideLoading();
  ui.showScreen('start');
  state.mode = 'title';

  async function precompileShaders() {
    // the scene is rendered into half-float targets, never straight to the
    // canvas: compile for that (no tone mapping in the material shaders)
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(composer.renderTarget1);
    const pending = [];
    // without parallel compilation there is nothing to wait for
    const parallel = renderer.extensions.has('KHR_parallel_shader_compile');
    for (const indoors of [true, false]) {
      setCameraIndoors(indoors);
      if (parallel) pending.push(renderer.compileAsync(scene, camera));
      else renderer.compile(scene, camera);
    }
    renderer.setRenderTarget(prev);
    await Promise.all(pending);
  }

  /* --------------------------------------------------- state */

  function applySetting(key, value, live) {
    if (key === 'season') {
      env.setSeason(value);
      player.setFootprintStyle(player.surface, value);
      ui.setZone(null);
    } else if (key === 'time') {
      env.setTime(value);
    } else if (key === 'snow') {
      env.setSnowAmount(value);
    } else if (key === 'volume') {
      sound.setVolume(value);
    } else if (key === 'sensitivity') {
      player.setSensitivity(value);
    } else if (key === 'invertY') {
      player.invertY = value;
    } else if (key === 'quality') {
      quality = resolveQuality(value);
      applyQuality();
    }
    if (!live) saveSettings({ ...settings });
    updateStatus();
  }

  function applyQuality() {
    const preset = QUALITY[quality];
    const max = Math.min(window.devicePixelRatio, preset.pixelRatio);
    dynres.setRange(max, Math.min(max, preset.minPixelRatio));
    renderer.shadowMap.enabled = quality !== 'low';
    bloomPass.enabled = preset.bloomScale > 0;
    applyResolution(dynres.ratio);
    env.setQuality(quality);
    windowViews.setQuality(quality);
  }

  /** Canvas, composer and bloom at a pixel ratio (preset or dynamic). */
  function applyResolution(pixelRatio) {
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    composer.setPixelRatio(pixelRatio);
    composer.setSize(window.innerWidth, window.innerHeight);
    // a softer preset blurs a smaller bloom chain
    const bloomScale = QUALITY[quality].bloomScale;
    if (bloomScale > 0 && bloomScale < 1) {
      bloomPass.setSize(Math.round(window.innerWidth * pixelRatio * bloomScale), Math.round(window.innerHeight * pixelRatio * bloomScale));
    }
  }

  function enterWorld() {
    leaveCarNow();
    state.mode = 'playing';
    state.interior = null;
    setFlatLight(world, null);
    windowViews.setView(null);
    sound.setIndoors(false);
    env.setIndoors(false);
    player.teleport(PLAYER.spawn.x, PLAYER.spawn.z, PLAYER.spawnYaw);
    player.enabled = true;
    ui.showScreen('none');
    ui.el.hints?.classList.remove('fade');
    setTimeout(() => ui.el.hints?.classList.add('fade'), 18000);
    sound.init();
    sound.resume();
    player.requestLock();
  }

  function pause() {
    map.toggle(false);
    photo.toggle(false);
    state.mode = 'paused';
    player.enabled = false;
    ui.showScreen('pause');
  }

  function resume() {
    state.mode = 'playing';
    player.enabled = !state.smoking;
    ui.showScreen('none');
    sound.resume();
    player.requestLock();
  }

  function toTitle() {
    if (state.smoking) endSmoke(false);
    leaveCarNow();
    state.mode = 'title';
    state.introT = 0;
    state.interior = null;
    setFlatLight(world, null);
    windowViews.setView(null);
    sound.setIndoors(false);
    env.setIndoors(false);
    player.enabled = false;
    player.releaseLock();
    ui.showScreen('start');
    ui.setZone(null);
  }

  /* --------------------------------------------------- interactions */

  /** Nearest interactable within its radius, indoors or out (optionally for one key). */
  function nearestInteractable(key) {
    let best = null;
    let bestDist = Infinity;
    for (const it of world.interactables) {
      if (key && (it.key ?? 'KeyE') !== key) continue;
      if (it.available && !it.available()) continue;
      if (it.y !== undefined && Math.abs(player.position.y - it.y) > 0.6) continue;
      // doors side by side on a landing: only the one you are looking at
      if (it.facing) {
        const f = player.forwardVector;
        if (f.x * it.facing.x + f.z * it.facing.z < 0.35) continue;
      }
      const d = it.distanceTo ? it.distanceTo(player.position.x, player.position.z) : Math.hypot(it.x - player.position.x, it.z - player.position.z);
      if (d < it.radius && d < bestDist) {
        best = it;
        bestDist = d;
      }
    }
    return best;
  }

  /** Steps through a door: fade to black, teleport, fade back. A flat's
   * outside is its stairwell, a stairwell's outside is the district. */
  function useDoor(interior, entering) {
    if (state.transitioning) return;
    state.transitioning = true;
    sound.ui('tick');
    ui.fadeTransition(() => {
      const spawn = entering ? interior.inSpawn : interior.outSpawn;
      player.teleport(spawn.x, spawn.z, spawn.yaw);
      player.pitch = entering ? 0.03 : -0.02;
      state.interior = entering ? interior : (interior.parent ?? null);
      sound.setIndoors(!!state.interior);
      env.setIndoors(!!state.interior);
      setFlatLight(world, state.interior?.kind === 'flat' ? state.interior : null, state.interior);
      refreshView();
      lastPrompt = null;
      updateZone();
    }).finally(() => {
      state.transitioning = false;
    });
  }

  /** One flight up or down: the same landing, another floor of the block. */
  function changeFloor(interior, delta) {
    if (state.transitioning) return;
    state.transitioning = true;
    sound.ui('tick');
    ui.fadeTransition(() => {
      setFloor(interior, interior.floor + delta);
      const scx = (interior.bounds.x0 + interior.bounds.x1) / 2;
      const scz = (interior.bounds.z0 + interior.bounds.z1) / 2;
      player.teleport(scx + 0.25, scz + 2.55, delta > 0 ? Math.PI * 0.85 : Math.PI * 1.15);
      player.pitch = 0.02;
      lastPrompt = null;
      updateZone();
    }).finally(() => {
      state.transitioning = false;
    });
  }

  function setFloor(interior, floor) {
    interior.floor = floor;
    interior.drawFloor?.(floor);
    numberFlats(world, interior);
    refreshView();
  }

  /** Points the interior windows at the real block, or back to the painted
   * views. With a live view the weather outside keeps falling past them. */
  function refreshView() {
    const it = state.interior;
    const view = !it ? null : it.kind === 'flat' ? flatView(it) : stairwellView(it);
    windowViews.setView(view);
    env.setIndoors(!!it && !view);
    // indoors only the bulbs bloom: lamp-lit walls would veil the window
    bloomPass.threshold = it ? 1.8 : 1.0;
  }

  /** Into the driver's seat: a short fade, the door, the starter. */
  function enterCar(car) {
    if (state.transitioning || driving.active) return;
    state.transitioning = true;
    ui.fadeTransition(() => {
      driving.enter(car);
      lastPrompt = null;
    }).finally(() => {
      state.transitioning = false;
    });
  }

  function leaveCar() {
    if (state.transitioning || !driving.active || Math.abs(driving.car.speed) > 1.5) return;
    state.transitioning = true;
    ui.fadeTransition(() => {
      if (!driving.exit()) sound.ui('tick');
      lastPrompt = null;
    }).finally(() => {
      state.transitioning = false;
    });
  }

  /** Back to the title (or a restart) with the engine still running. */
  function leaveCarNow() {
    if (!driving.active) return;
    driving.car.setDriven(false);
    driving.car = null;
    world.carBeam.light.intensity = 0;
    sound.engineStop();
  }

  /** Sits down (fade) or stays standing, then hands the view to the sequence. */
  function startSmoke(spot) {
    if (state.transitioning || state.smoking) return;
    const begin = () => {
      const seat = spot.seat;
      player.teleport(seat.x, seat.z, seat.yaw);
      player.pitch = seat.pitch;
      player.eyeOverride = seat.eyeY === null ? null : seat.eyeY - world.heightAt(seat.x, seat.z);
      if (player.eyeOverride !== null) player.eye = player.eyeOverride;
      player.enabled = false;
      state.smoking = true;
      smoke.start(spot);
      lastPrompt = null;
      ui.setPrompt(null);
    };
    if (!spot.stand) {
      begin();
      return;
    }
    state.transitioning = true;
    ui.fadeTransition(begin).finally(() => {
      state.transitioning = false;
    });
  }

  /** Back on your feet: fade up from the bench (or just carry on, standing). */
  function endSmoke(animate = true) {
    const spot = smoke.active;
    smoke.stop();
    state.smoking = false;
    const stand = () => {
      player.eyeOverride = null;
      if (spot?.stand) player.teleport(spot.stand.x, spot.stand.z, player.yaw);
      if (state.mode === 'playing') player.enabled = true;
    };
    if (!animate || !spot?.stand) {
      stand();
      return;
    }
    state.transitioning = true;
    ui.fadeTransition(stand).finally(() => {
      state.transitioning = false;
    });
  }

  /* --------------------------------------------------- HUD */

  let zoneTimer = 0;
  let statusTimer = 0;
  let lastPrompt = null;
  let lastSprint = false;

  function updateStatus() {
    ui.setStatus({
      clock: env.clock,
      temp: env.temperature,
    });
  }

  function updateZone() {
    if (state.interior) {
      const it = state.interior;
      if (it.kind === 'flat') ui.setZone(`Квартира ${it.number}`, it.caption);
      else ui.setZone('Подъезд', it.address ? `${it.caption} · floor ${it.floor}` : it.caption);
      return;
    }
    const zone = world.zoneAt(player.position.x, player.position.z);
    ui.setZone(zone ? zone.name : null, zone ? zone.sub : null);
  }

  function updatePrompt() {
    let text = null;
    if (driving.active) {
      text = !state.transitioning && Math.abs(driving.car.speed) < 1.5 ? 'E — get out · V — camera' : null;
    } else {
      const it = state.smoking ? null : nearestInteractable();
      text = it && !state.transitioning ? it.prompt() : null;
    }
    if (text !== lastPrompt) {
      lastPrompt = text;
      ui.setPrompt(text);
    }
  }

  /* --------------------------------------------------- events */

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    applyResolution(dynres.ratio);
    smoke.onResize();
  });

  window.addEventListener('keydown', (event) => {
    if (driving.active && state.mode === 'playing') {
      if (event.code === 'KeyE' && !event.repeat) leaveCar();
      if (event.code === 'KeyV' && !event.repeat) driving.toggleView();
      if (event.code === 'KeyM' && !event.repeat) toggleMap();
      if (event.code === 'Escape') {
        pause();
        player.releaseLock();
      }
      return;
    }
    if ((event.code === 'KeyE' || event.code === 'KeyF' || event.code === 'KeyB') && state.mode === 'playing' && !state.transitioning && !state.smoking) {
      nearestInteractable(event.code)?.onUse();
    }
    // F again cuts the break short
    if (event.code === 'KeyF' && state.mode === 'playing' && state.smoking && !state.transitioning && smoke.t > 0.3) endSmoke();
    if (event.code === 'Escape' && state.mode === 'playing') {
      // the browser exits pointer lock: the pause comes from onLockChange
      pause();
      player.releaseLock();
    }
    if (event.code === 'Enter' && state.mode === 'title') enterWorld();
    if (event.code === 'KeyG' && !event.repeat) throwSnowball();
    if (event.code === 'KeyM' && !event.repeat) toggleMap();
    if (event.code === 'KeyP' && !event.repeat) togglePhoto();
    if (event.code === 'Enter' && photo.active && !event.repeat) photo.shoot();
  });

  /** Photo mode: on foot, outdoors or in. */
  function togglePhoto(force) {
    if (state.mode !== 'playing' || driving.active || state.smoking) return photo.toggle(false);
    const on = photo.toggle(force);
    if (on) map.toggle(false);
    return on;
  }
  window.addEventListener('wheel', (event) => {
    if (photo.active && state.mode === 'playing') photo.zoom(event.deltaY);
  });

  /** The district map: open while walking or driving, shut indoors. */
  function toggleMap(force) {
    if (state.mode !== 'playing' || state.interior) return map.toggle(false);
    const on = map.toggle(force);
    if (on) photo.toggle(false);
    return on;
  }

  /* --------------------------------------------------- snowballs */

  const _aim = new THREE.Vector3();
  const _hand = new THREE.Vector3();
  /** Packs a snowball and throws it along the view (winter, outdoors, on foot). */
  function throwSnowball() {
    if (state.mode !== 'playing' || state.transitioning || state.smoking || state.interior || driving.active) return false;
    if (world.season !== 'winter') return false;
    camera.getWorldDirection(_aim);
    // from the right hand, a little below and in front of the eyes
    _hand.setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(0.22);
    _hand.add(camera.position).addScaledVector(_aim, 0.35);
    _hand.y -= 0.18;
    return snowballs.throw(_hand, _aim, player.velocity);
  }
  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0 && player.locked) {
      if (photo.active) photo.shoot();
      else throwSnowball();
    }
  });

  // retry pointer lock if the browser refused it (happens right after Esc)
  let lockRetry = 0;
  document.addEventListener('pointerlockerror', () => {
    if (state.mode !== 'playing' || lockRetry > 2) return;
    lockRetry++;
    setTimeout(() => {
      if (state.mode === 'playing') player.requestLock();
    }, 1300);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.mode === 'playing') {
      pause();
      player.releaseLock();
    }
  });

  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    ui.fatal(new Error('WebGL context lost. Reload the page.'));
  });

  // click on the scene: re-acquires pointer lock during play
  canvas.addEventListener('click', () => {
    if (state.mode === 'playing' && !player.locked) player.requestLock();
  });

  applyQuality();
  updateStatus();

  // handy for inspecting the scene from the browser console
  perf.breakdown = perf.breakdown.bind(perf, scene, camera, world.group);
  window.__perf = perf;
  window.__game = { renderer, scene, camera, world, env, player, settings, state, sound, smoke, snowballs, throwSnowball, snowmen, bread, map, toggleMap, photo, togglePhoto, driving, windowViews, dynres, changeFloor, setFloor };

  /* --------------------------------------------------- ambience */

  // where each sound comes from, seen from the camera: distance and pan
  const _right = new THREE.Vector3();
  const heard = (x, z) => {
    const dx = x - camera.position.x;
    const dz = z - camera.position.z;
    const dist = Math.hypot(dx, dz);
    return { dist, pan: dist > 0.01 ? (dx * _right.x + dz * _right.z) / dist : 0 };
  };

  function updateAmbience(dt) {
    if (!sound.ready) return;
    _right.setFromMatrixColumn(camera.matrixWorld, 0);
    // a stairwell: TVs behind the padded doors of the landing
    const tv = state.interior && !state.interior.kind ? 1 : 0;
    let car = null;
    if (!state.interior) {
      for (const c of world.trafficCars ?? []) {
        const h = heard(c.x, c.z);
        if (!car || h.dist < car.dist) car = { ...h, speed: Math.abs(c.speed), big: !!c.isBus };
      }
    }
    // the dog barking (or yelping)
    const dog = world.dog;
    if (dog?.voice) {
      const { kind, times } = dog.voice;
      dog.voice = null;
      const h = heard(dog.position.x, dog.position.z);
      sound.bark(h.dist * (state.interior ? 3 : 1), h.pan, kind, times);
    }
    // pigeons clattering up, or cooing on the ground
    const pigeons = world.pigeons;
    if (pigeons?.voice.length) {
      for (const v of pigeons.voice) {
        const h = heard(v.x, v.z);
        const dist = h.dist * (state.interior ? 3 : 1);
        if (v.kind === 'flutter') sound.flutter(dist, h.pan, v.n);
        else sound.coo(dist, h.pan);
      }
      pigeons.voice.length = 0;
    }
    // the bus's doors folding open or shut at the stop
    const bus = world.bus;
    if (bus?.hiss) {
      bus.hiss = false;
      if (!state.interior) {
        const h = heard(bus.x, bus.z);
        sound.hiss(h.dist, h.pan);
      }
    }
    const crows = (world.crows ?? []).map((c) => heard(c.crow.position.x, c.crow.position.z));
    sound.ambience(dt, { tv, car, crows });
    // skates on the hockey box: one stroke per push of a blade
    for (const p of world.people?.list ?? []) {
      if (!p.stroke) continue;
      p.stroke = false;
      if (state.interior) continue;
      const h = heard(p.position.x, p.position.z);
      sound.skate(h.dist, h.pan);
    }
  }

  /* --------------------------------------------------- loop */

  let last = performance.now();

  function frame(now) {
    requestAnimationFrame(frame);
    renderer.info.reset();
    perf.begin();
    perf.push('update');
    const frameMs = now - last;
    const dt = Math.min(0.05, frameMs / 1000);
    last = now;
    // only judge the frame rate while it is the game being drawn
    if (state.mode === 'playing' || state.mode === 'title') {
      const ratio = dynres.sample(frameMs);
      if (ratio !== null) applyResolution(ratio);
    }
    state.elapsed += dt;

    if (state.mode === 'title') {
      // slow dolly along the avenue while the menu is open
      state.introT += dt;
      const t = clamp(state.introT, 0, 46);
      const z = 46 - t * 0.62;
      camera.position.set(Math.sin(t * 0.09) * 3.4 - 1.2, 1.86 + Math.sin(t * 0.23) * 0.05, z);
      camera.rotation.set(0, 0, 0);
      camera.rotateY(Math.PI + Math.sin(t * 0.07) * 0.12);
      camera.rotateX(-0.015 + Math.sin(t * 0.11) * 0.012);
      camera.fov = 62;
      camera.updateProjectionMatrix();
    } else if (state.mode === 'playing') {
      if (driving.active) driving.update(dt, player.enabled ? player.keys : {});
      else player.update(dt);
      if (smoke.update(dt, state.elapsed)) endSmoke();
    } else if (driving.active) {
      // paused behind the wheel: idle the engine
      sound.engineUpdate(0, 0);
    }

    // from inside, the world outside is seen (and simulated) around the
    // real window: snow, lamps and passers-by gather there
    if (state.mode === 'playing' && state.interior && !state.interior.kind && state.interior.floor > 1 && player.position.y < 0.4) {
      // walked all the way down to the hall
      setFloor(state.interior, 1);
      updateZone();
    }
    const viewCam = windowViews.update(camera);
    env.update(dt, state.elapsed, viewCam ?? camera);
    world.update(dt, state.elapsed);
    world.people?.update(dt, state.elapsed, viewCam?.position ?? player.position, env.temperature);
    // drivers stop for the player on foot (on the title screen, the camera)
    const onFoot = state.mode === 'title' ? camera.position : !state.interior && !driving.active ? player.position : null;
    world.traffic?.update(dt, { keepClear: onFoot ? [onFoot] : [], lights: env.cur.lamp });
    // the stray dog takes an interest in the player on foot
    world.dog?.update(dt, { player: state.mode === 'playing' ? onFoot : null, cars: world.trafficCars ?? [], indoors: !!state.interior });
    world.pigeons?.update(dt, { player: state.mode === 'playing' ? onFoot : null });
    if (!sound.ready && world.pigeons) world.pigeons.voice.length = 0;
    if (photo.active && (state.mode !== 'playing' || driving.active || state.smoking)) photo.toggle(false);
    if (map.open) {
      if (state.mode !== 'playing' || state.interior) map.toggle(false);
      else map.update(driving.active ? driving.car : player.position);
    }
    sound.updateWind(env.wind.gust);
    updateAmbience(dt);
    snowballs.update(dt, sound.ready ? heard : null);
    snowmen.update(dt, sound.ready ? heard : null);
    // inside a flat the music comes from the kitchen radio
    sound.update(dt, state.elapsed, camera.position, state.interior?.radio ?? world.points.radio);

    if (state.mode === 'playing') {
      zoneTimer += dt;
      statusTimer += dt;
      if (zoneTimer > 0.4) {
        zoneTimer = 0;
        updateZone();
      }
      if (statusTimer > 0.5) {
        statusTimer = 0;
        updateStatus();
      }
      updatePrompt();
      if (player.sprinting !== lastSprint) {
        lastSprint = player.sprinting;
        ui.setSprinting(lastSprint);
      }
    }

    perf.pop();
    perf.push('windows');
    windowViews.render();
    perf.pop();
    setCameraIndoors(!!state.interior);
    // indoors the district is only ever seen through the windows (rendered
    // just above): keep it out of the main pass, behind the sealed walls
    let hidden = null;
    if (state.interior) {
      hidden = [];
      for (const child of world.group.children) {
        if (child.visible && !child.isLight && !child.layers.isEnabled(INTERIOR_LAYER)) {
          child.visible = false;
          hidden.push(child);
        }
      }
    }
    composer.render();
    photo.afterRender();
    if (hidden) for (const child of hidden) child.visible = true;
    perf.end();
  }

  requestAnimationFrame(frame);
}

boot().catch((error) => {
  console.error(error);
  const el = document.getElementById('fatal');
  const loading = document.getElementById('loading');
  loading?.classList.add('hidden');
  if (el) {
    el.classList.remove('hidden');
    el.innerHTML = `<h2 style="letter-spacing:.24em;text-transform:uppercase">Error</h2>
      <p>The district could not be started.</p>
      <pre style="white-space:pre-wrap;color:#8ea3b0">${String(error?.stack ?? error)}</pre>`;
  }
});
