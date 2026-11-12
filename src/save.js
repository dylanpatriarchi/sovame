// The game in progress, kept in the browser: where you are, what you were
// driving, where every car and boat was left, what time of day it is.
// Written every few seconds and whenever the tab is hidden or closed.
const STORAGE_KEY = 'pervyj-sneg:save';
const VERSION = 1;

export function readSave() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    return data && data.v === VERSION ? data : null;
  } catch {
    return null;
  }
}

export function writeSave(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: VERSION, ...data }));
  } catch {
    /* storage unavailable: the game simply starts over next time */
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to clear */
  }
}
