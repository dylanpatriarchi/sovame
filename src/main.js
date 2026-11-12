// Game boot: renderer and scene, staged loading, the modes (title, playing,
// paused), settings and the main loop. What the player does in the world
// lives in interactions.js.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { World } from './world/index.js';
import { Environment } from './environment.js';
import { Player } from './player.js';
import { Sound } from './audio.js';
import { UI } from './ui.js';
import { Smoke } from './smoke.js';
import { Driving } from './driving.js';
import { readSave, writeSave, clearSave } from './save.js';
import { Interactions } from './interactions.js';
import { isTouch, loadSettings, saveSettings, resolveQuality } from './settings.js';
import { PLAYER, TIME_PRESETS } from './config.js';
import { clamp } from './util.js';

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

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

  // post chain: bloom only haloes genuinely bright sources (windows, lamps, moon)
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.32, 0.4, 1.0);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
  // accumulate renderer.info across all composer passes (smoke test reads it)
  renderer.info.autoReset = false;

  const sound = new Sound({ volume: settings.volume });
  const state = { mode: 'loading', elapsed: 0, introT: 0, transitioning: false, smoking: false };

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

  const smoke = new Smoke({ scene, camera, world, env, sound });
  const driving = new Driving({ camera, world, player, sound, env });
  const actions = new Interactions({ world, player, ui, sound, smoke, driving, state, env });
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
    if (key === 'time') {
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

  /* --------------------------------------------------- the saved game */

  const round = (v) => Math.round(v * 100) / 100;
  const berth = (v) => [round(v.x), round(v.z), round(v.heading)];

  /** Everything needed to put the game back the way it was left. */
  function snapshot() {
    const seat = state.smoking ? smoke.active?.stand : null;
    return {
      player: { x: round(seat?.x ?? player.position.x), z: round(seat?.z ?? player.position.z), yaw: round(player.yaw), pitch: round(player.pitch) },
      room: world.inside ? { id: world.inside.id, door: world.doors.indexOf(actions.lastDoor) } : null,
      driving: driving.active ? { boat: !!driving.car.boat, id: driving.car.id } : null,
      cars: world.cars.map(berth),
      boats: world.boats.map(berth),
      time: TIME_PRESETS[env.timeIndex].id,
      radio: { ...actions.radioSets },
    };
  }

  function saveGame() {
    if (state.started) writeSave(snapshot());
  }

  function restore(save) {
    save.cars?.forEach(([x, z, heading], i) => {
      const car = world.cars[i];
      if (!car) return;
      Object.assign(car, { x, z, heading, vx: 0, vz: 0, speed: 0, y: world.heightAt(x, z) });
      car.updateCollider();
      car.sync();
    });
    save.boats?.forEach(([x, z, heading], i) => {
      const boat = world.boats[i];
      if (boat?.afloat(x, z, heading)) Object.assign(boat, { x, z, heading, speed: 0 });
    });
    if (save.time) env.setTime(save.time);
    Object.assign(actions.radioSets, save.radio ?? {});
    const door = save.room ? world.doors[save.room.door] : null;
    if (door?.inside) actions.enterRoomNow(door);
    const p = save.player;
    player.teleport(p.x, p.z, p.yaw);
    player.pitch = p.pitch ?? 0;
    const vehicle = save.driving ? (save.driving.boat ? world.boats : world.cars)[save.driving.id] : null;
    if (vehicle) driving.enter(vehicle);
  }

  setInterval(() => state.mode === 'playing' && saveGame(), 8000);
  window.addEventListener('pagehide', saveGame);
  window.addEventListener('beforeunload', saveGame);
  document.addEventListener('visibilitychange', () => document.hidden && saveGame());
  // a saved game changes what the title offers
  const startBtn = document.getElementById('btn-start');
  const newBtn = document.getElementById('btn-new');
  const offerSave = () => {
    const has = !!readSave();
    startBtn.textContent = has ? 'Continue' : 'Enter the district';
    newBtn.classList.toggle('hidden', !has);
  };
  newBtn.addEventListener('click', () => {
    state.started = false;
    clearSave();
    location.reload();
  });
  offerSave();

  function enterWorld() {
    actions.leaveCarNow();
    actions.leaveRoomNow();
    state.mode = 'playing';
    sound.init();
    sound.resume();
    const save = readSave();
    player.teleport(PLAYER.spawn.x, PLAYER.spawn.z, PLAYER.spawnYaw);
    if (save) {
      try {
        restore(save);
      } catch (error) {
        console.warn('saved game could not be restored', error);
        clearSave();
      }
    }
    state.started = true;
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
    saveGame();
    state.started = false;
    offerSave();
    if (state.smoking) actions.endSmoke(false);
    actions.leaveCarNow();
    actions.leaveRoomNow();
    state.mode = 'title';
    state.introT = 0;
    player.enabled = false;
    player.releaseLock();
    ui.showScreen('start');
    ui.setZone(null);
  }

  /* --------------------------------------------------- HUD */

  let zoneTimer = 0;
  let statusTimer = 0;
  let lastSprint = false;

  function updateStatus() {
    ui.setStatus({
      clock: env.clock,
      temp: env.temperature,
    });
  }

  function updateZone() {
    const zone = world.zoneAt(player.position.x, player.position.z);
    ui.setZone(zone ? zone.name : null, zone ? zone.sub : null);
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
    if (state.mode === 'playing') {
      actions.onKey(event);
      if (event.code === 'Escape') {
        // the browser exits pointer lock: the pause comes from onLockChange
        pause();
        player.releaseLock();
      }
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
  window.__game = { save: saveGame, renderer, scene, camera, world, env, player, settings, state, sound, smoke, driving, radioSets: actions.radioSets };

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
      if (smoke.update(dt, state.elapsed)) actions.endSmoke();
    } else if (driving.active) {
      // paused behind the wheel: idle the engine
      sound.engineUpdate(0, 0);
    }

    env.update(dt, state.elapsed, camera);
    world.update(dt, state.elapsed, camera);
    sound.updateWind(env.wind.gust);
    sound.update(dt, state.elapsed, camera.position, actions.updateRadio(camera.position));

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
      actions.updatePrompt();
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
