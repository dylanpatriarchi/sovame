// Saved settings and the quality they resolve to on this device.
import { SETTINGS_DEFAULTS } from './config.js';

const STORAGE_KEY = 'pervyj-sneg:settings';
export const isTouch = window.matchMedia('(pointer: coarse)').matches;

export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...SETTINGS_DEFAULTS };
    // it is always winter here; older saves may still say otherwise
    return { ...SETTINGS_DEFAULTS, ...JSON.parse(raw), season: 'winter' };
  } catch {
    return { ...SETTINGS_DEFAULTS };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable: no big deal */
  }
}

export function resolveQuality(requested) {
  if (requested !== 'auto') return requested;
  if (isTouch) return 'medium';
  return window.devicePixelRatio > 2.2 ? 'medium' : 'high';
}
