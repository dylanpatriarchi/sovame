// Game boot: scene, staged loading, main loop, interactions.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { World } from './world/index.js';
import { INTERIOR_LAYER } from './world/interiors.js';
import { setFlatLight } from './world/flats.js';
import { Environment } from './environment.js';
import { Player } from './player.js';
import { Sound } from './audio.js';
import { UI } from './ui.js';
import { Smoke, smokeSpots } from './smoke.js';
import { Driving } from './driving.js';
import { PLAYER, SETTINGS_DEFAULTS } from './config.js';
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

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !isTouch,
    powerPreference: 'high-performance',
    stencil: false,
  });
  renderer.setPixelRatio(quality === 'high' ? Math.min(window.devicePixelRatio, 1.8) : Math.min(window.devicePixelRatio, 1.25));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.shadowMap.enabled = quality !== 'low';
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.08, 1500);
  camera.position.set(2.4, 1.9, 44);
  // stairwell interiors live on their own layer, lit only by their own bulbs
  camera.layers.enable(INTERIOR_LAYER);

  // post chain: bloom only haloes genuinely bright sources (windows, lamps, moon)
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.32, 0.4, 1.0);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
  // accumulate renderer.info across all composer passes (smoke test reads it)
  renderer.info.autoReset = false;

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
  for (const interior of world.interiors) {
    world.interactables.push({
      id: `${interior.id}:enter`,
      x: interior.doorOut.x,
      z: interior.doorOut.z,
      radius: 2.6,
      prompt: () => 'E — enter the stairwell',
      onUse: () => useDoor(interior, true),
    });
    world.interactables.push({
      id: `${interior.id}:exit`,
      x: interior.doorIn.x,
      z: interior.doorIn.z,
      radius: 1.5,
      prompt: () => 'E — step outside',
      onUse: () => useDoor(interior, false),
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
    sound.step(surface, speed);
    player.setFootprintStyle(surface, settings.season);
  };
  player.onJump = () => sound.jump();
  player.onLand = (impact) => sound.land(impact);
  player.onLockChange = (locked) => {
    if (!locked && state.mode === 'playing') pause();
  };

  ui.setProgress(1, 'Ready');
  ui.hideLoading();
  ui.showScreen('start');
  state.mode = 'title';

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
    const high = quality === 'high';
    const pixelRatio = high ? Math.min(window.devicePixelRatio, 1.8) : Math.min(window.devicePixelRatio, 1.2);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.shadowMap.enabled = quality !== 'low';
    bloomPass.enabled = quality !== 'low';
    composer.setPixelRatio(pixelRatio);
    composer.setSize(window.innerWidth, window.innerHeight);
    env.setQuality(quality);
  }

  function enterWorld() {
    leaveCarNow();
    state.mode = 'playing';
    state.interior = null;
    setFlatLight(world, null);
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
      lastPrompt = null;
      updateZone();
    }).finally(() => {
      state.transitioning = false;
    });
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
      ui.setZone(state.interior.kind === 'flat' ? `Квартира ${state.interior.number}` : 'Подъезд', state.interior.caption);
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
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    composer.setSize(window.innerWidth, window.innerHeight);
    smoke.onResize();
  });

  window.addEventListener('keydown', (event) => {
    if (driving.active && state.mode === 'playing') {
      if (event.code === 'KeyE' && !event.repeat) leaveCar();
      if (event.code === 'KeyV' && !event.repeat) driving.toggleView();
      if (event.code === 'Escape') {
        pause();
        player.releaseLock();
      }
      return;
    }
    if ((event.code === 'KeyE' || event.code === 'KeyF') && state.mode === 'playing' && !state.transitioning && !state.smoking) {
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
  window.__game = { renderer, scene, camera, world, env, player, settings, state, sound, smoke, driving };

  /* --------------------------------------------------- loop */

  let last = performance.now();

  function frame(now) {
    requestAnimationFrame(frame);
    renderer.info.reset();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
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

    env.update(dt, state.elapsed, camera);
    world.update(dt, state.elapsed);
    world.people?.update(dt, state.elapsed, player.position, env.temperature);
    sound.updateWind(env.wind.gust);
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

    composer.render();
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
