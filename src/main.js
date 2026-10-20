// Game boot: scene, staged loading, main loop, interactions.
import * as THREE from 'three';
import { World } from './world/index.js';
import { Environment } from './environment.js';
import { Player } from './player.js';
import { Sound } from './audio.js';
import { UI } from './ui.js';
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

  const sound = new Sound({ volume: settings.volume });
  const state = { mode: 'loading', elapsed: 0, introT: 0 };

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
    renderer.setPixelRatio(high ? Math.min(window.devicePixelRatio, 1.8) : Math.min(window.devicePixelRatio, 1.2));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.shadowMap.enabled = quality !== 'low';
    env.setQuality(quality);
  }

  function enterWorld() {
    state.mode = 'playing';
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
    player.enabled = true;
    ui.showScreen('none');
    sound.resume();
    player.requestLock();
  }

  function toTitle() {
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
  let lastPrompt = null;
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

  function updatePrompt() {
    const radio = world.points.radio;
    let text = null;
    if (radio) {
      const dist = Math.hypot(radio.x - player.position.x, radio.z - player.position.z);
      if (dist < 7) {
        text = sound.radioOn ? 'E — turn off the radio' : 'E — turn on the radio';
      }
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
  });

  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyE' && state.mode === 'playing') {
      const radio = world.points.radio;
      if (radio && Math.hypot(radio.x - player.position.x, radio.z - player.position.z) < 7) {
        const on = sound.toggleRadio();
        sound.ui('tick');
        ui.setPrompt(on ? 'E — turn off the radio' : 'E — turn on the radio');
        lastPrompt = null;
      }
    }
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
  window.__game = { renderer, scene, camera, world, env, player, settings, state };

  /* --------------------------------------------------- loop */

  let last = performance.now();

  function frame(now) {
    requestAnimationFrame(frame);
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
      player.update(dt);
    }

    env.update(dt, state.elapsed, camera);
    world.update(dt, state.elapsed);
    sound.updateWind(env.wind.gust);
    sound.update(dt, state.elapsed, camera.position, world.points.radio);

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

    renderer.render(scene, camera);
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
