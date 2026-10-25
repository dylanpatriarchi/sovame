// A loaf from the kiosk (батон, 13 kopecks): bought at the window while it is
// open, then crumbled a handful at a time (B) for the pigeons, on the snow in
// front of you. The flocks near enough flutter over and feed round your feet.
import { FEED_REACH } from './world/pigeons.js';

export const PRICE = 13; // kopecks
export const HANDFULS = 4; // to a loaf
const MAX = 2 * HANDFULS; // two loaves under the arm at most
const OPEN = 8 * 60; // the kiosk's hours, in minutes after midnight
const CLOSE = 20 * 60;
const AHEAD = 1.4; // m in front of the player

export class Bread {
  constructor({ world, sound, env }) {
    this.world = world;
    this.sound = sound;
    this.env = env;
    /** Handfuls left. */
    this.handfuls = 0;
    this.bought = 0;
    this.thrown = 0;
  }

  /** Is the kiosk serving at this hour? */
  get open() {
    const m = (this.env?.cur?.clockMinutes ?? 12 * 60) % 1440;
    return m >= OPEN && m < CLOSE;
  }

  get full() {
    return this.handfuls > MAX - HANDFULS;
  }

  /** A loaf over the counter: true if one was sold. */
  buy() {
    if (!this.open || this.full) return false;
    this.handfuls += HANDFULS;
    this.bought++;
    this.sound?.till?.();
    return true;
  }

  /** Where a handful would land, or null if there is nothing to crumble. */
  spotFor(pos, forward) {
    if (this.handfuls <= 0) return null;
    const len = Math.hypot(forward.x, forward.z) || 1;
    const x = pos.x + (forward.x / len) * AHEAD;
    const z = pos.z + (forward.z / len) * AHEAD;
    if (this.world.collides(x, z, 0.2)) return null;
    // never out on the carriageway, never on the rink
    const ground = this.world.surfaceAt(x, z);
    if (ground === 'asphalt' || ground === 'ice') return null;
    return { x, z };
  }

  /** Do any pigeons live near enough to come for it? */
  pigeonsNear(pos) {
    return (this.world.pigeons?.flocks ?? []).some((f) => Math.hypot(f.home.x - pos.x, f.home.z - pos.z) < FEED_REACH);
  }

  /** A handful of crumbs on the ground ahead: true if any were thrown. */
  crumble(pos, forward) {
    const spot = this.spotFor(pos, forward);
    if (!spot) return false;
    this.handfuls--;
    this.thrown++;
    this.world.pigeons?.feed(spot.x, spot.z);
    this.sound?.crumble?.();
    return true;
  }
}
