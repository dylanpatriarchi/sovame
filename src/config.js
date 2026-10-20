// World, palette and atmosphere presets configuration.
import { DEG } from './util.js';

export const WORLD = {
  /** Half side of the playable area (m). */
  bounds: 108,
  groundSize: 700,
  roadHalfWidth: 6,
  sidewalkWidth: 3.2,
  crossroadZ: 44,
  /** Reference snow volume used by the particle systems. */
  snowBox: { w: 76, h: 34, d: 76 },
};

export const PLAYER = {
  eyeHeight: 1.72,
  crouchHeight: 1.08,
  walkSpeed: 2.75,
  sprintSpeed: 5.6,
  crouchSpeed: 1.35,
  accel: 11,
  radius: 0.36,
  jumpSpeed: 5.0,
  gravity: 15.5,
  stepDistance: 0.78,
  spawn: { x: 7.2, z: 19.5 },
  spawnYaw: 0.08,
};

/**
 * Four moments of the day. Values are interpolated over time, so switching
 * preset produces a smooth transition (lights, sky, fog). Blue hour is the
 * default and signature look of the game.
 */
export const TIME_PRESETS = [
  {
    id: 'afternoon',
    label: 'Afternoon',
    clock: '15:20',
    baseTemp: 2,
    sky: { zenith: 0x7f9cbb, horizon: 0xc9d2d6, ground: 0x9aa1a4 },
    sun: { color: 0xffe9c9, intensity: 0.95, elevation: 24, azimuth: 205, glow: 0.45 },
    hemi: { sky: 0xb6c6d6, ground: 0x8f9296, intensity: 1.25 },
    fog: { color: 0xc6cfd4, density: 0.0087 },
    lamp: 0,
    windowLit: 0.05,
    remnant: 0,
    stars: 0,
    moon: 0,
    exposure: 1.0,
  },
  {
    id: 'sunset',
    label: 'Sunset',
    clock: '17:05',
    baseTemp: 0,
    sky: { zenith: 0x6d86a6, horizon: 0xe4b48c, ground: 0x8b8785 },
    sun: { color: 0xffb066, intensity: 1.1, elevation: 5.5, azimuth: 242, glow: 1.35 },
    hemi: { sky: 0xa2b1c4, ground: 0x7d7a78, intensity: 1.0 },
    fog: { color: 0xc2a795, density: 0.0108 },
    lamp: 0.35,
    windowLit: 0.35,
    remnant: 0.5,
    stars: 0,
    moon: 0,
    exposure: 1.02,
  },
  {
    id: 'dusk',
    label: 'Blue hour',
    clock: '18:40',
    baseTemp: -3,
    sky: { zenith: 0x2a3c5c, horizon: 0x8a90a8, ground: 0x3d434b },
    sun: { color: 0x9db0d0, intensity: 0.2, elevation: -5, azimuth: 250, glow: 0.85 },
    hemi: { sky: 0x4b5c74, ground: 0x2b3037, intensity: 0.9 },
    fog: { color: 0x6b7285, density: 0.0124 },
    lamp: 1,
    windowLit: 0.85,
    remnant: 0.55,
    stars: 0.2,
    moon: 0.3,
    exposure: 1.12,
  },
  {
    id: 'night',
    label: 'Night',
    clock: '22:10',
    baseTemp: -6,
    sky: { zenith: 0x0a111d, horizon: 0x1b2231, ground: 0x10141c },
    sun: { color: 0x93a7c9, intensity: 0.14, elevation: 32, azimuth: 62, glow: 0.3 },
    hemi: { sky: 0x223047, ground: 0x1a2230, intensity: 0.55 },
    fog: { color: 0x121825, density: 0.0105 },
    lamp: 1,
    windowLit: 1,
    remnant: 0,
    stars: 1,
    moon: 1,
    exposure: 1.12,
  },
];

export const SEASONS = {
  autumn: {
    id: 'autumn',
    label: 'Late autumn',
    hint: 'Leaves, mud and first frost',
    tempShift: 4,
    snowAmount: 0.3,
    leavesAmount: 1,
    foliage: 1,
    mounds: 0.28,
    litter: 1,
    footprint: 0.4,
    fogMul: 1.0,
    wind: 0.85,
    groundTex: 'autumn',
    snowEdge: 0.35,
  },
  winter: {
    id: 'winter',
    label: 'Winter',
    hint: 'Deep snow, low sky',
    tempShift: -6,
    snowAmount: 1,
    leavesAmount: 0.1,
    foliage: 0,
    mounds: 1,
    litter: 0.15,
    footprint: 1,
    fogMul: 1.14,
    wind: 1.15,
    groundTex: 'winter',
    snowEdge: 1,
  },
};

export const SETTINGS_DEFAULTS = {
  season: 'winter',
  time: 'dusk',
  snow: 1,
  volume: 0.7,
  sensitivity: 1,
  quality: 'auto',
  invertY: false,
};

/** Soviet place names, used by buildings, plaques and captions. */
export const NAME_POOL = {
  streets: ['ул. КОСМОНАВТОВ', 'ул. МИРА', 'ул. ЗАВОДСКАЯ', 'пр. ЛЕНИНА', 'ул. СЕВЕРНАЯ'],
  busLines: ['12', '24', '31', '7'],
};

export const sunDirection = (preset, out = { x: 0, y: 0, z: 0 }) => {
  const el = preset.sun.elevation * DEG;
  const az = preset.sun.azimuth * DEG;
  out.x = Math.cos(el) * Math.sin(az);
  out.y = Math.sin(el);
  out.z = Math.cos(el) * Math.cos(az);
  return out;
};
