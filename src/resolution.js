// Dynamic resolution: when frames keep running over budget the render
// resolution steps down (to the preset's floor), and it climbs back once
// there is headroom again. A level that just failed is not retried for a
// while, so the picture does not pump between two sizes.

const WINDOW = 1; // s of frames averaged per decision
const SLOW = 1000 / 48; // ms: below ~48 fps, step down
const FAST = 1000 / 57; // ms: holding ~57+ fps, may step up
const STEP = 0.85;
const RETRY = 30; // s before a level that failed is tried again

export class DynamicResolution {
  constructor({ enabled = true } = {}) {
    this.enabled = enabled;
    this.max = 1;
    this.min = 1;
    this.ratio = 1;
    this.sum = 0;
    this.frames = 0;
    this.elapsed = 0;
    this.fastWindows = 0;
    this.cooldown = 0;
    this.clock = 0;
    this.failed = new Map(); // ratio -> time it was given up
  }

  /** New bounds (quality preset or screen change): starts again from the top. */
  setRange(max, min) {
    this.max = max;
    this.min = Math.min(min, max);
    this.ratio = max;
    this.failed.clear();
    this.reset();
  }

  reset() {
    this.sum = 0;
    this.frames = 0;
    this.elapsed = 0;
    this.fastWindows = 0;
  }

  /** Feeds one frame interval (ms). Returns the new pixel ratio when it changes. */
  sample(ms) {
    if (!this.enabled) return null;
    this.clock += ms / 1000;
    // a hitch (loading, a tab switch) says nothing about the steady load
    if (ms > 250) return null;
    this.sum += ms;
    this.frames++;
    this.elapsed += ms / 1000;
    this.cooldown -= ms / 1000;
    if (this.elapsed < WINDOW) return null;
    const avg = this.sum / this.frames;
    this.reset();
    if (this.cooldown > 0) return null;
    if (avg > SLOW && this.ratio > this.min + 1e-3) {
      this.failed.set(this.ratio, this.clock);
      return this.set(Math.max(this.min, this.ratio * STEP));
    }
    if (avg < FAST && this.ratio < this.max - 1e-3) {
      this.fastWindows++;
      const next = Math.min(this.max, this.ratio / STEP);
      const failedAt = [...this.failed].find(([r]) => Math.abs(r - next) < 1e-3)?.[1];
      if (this.fastWindows >= 4 && (failedAt === undefined || this.clock - failedAt > RETRY)) return this.set(next);
    } else {
      this.fastWindows = 0;
    }
    return null;
  }

  set(ratio) {
    this.ratio = ratio;
    this.fastWindows = 0;
    // let the new size settle before judging it
    this.cooldown = 1.5;
    return ratio;
  }
}
