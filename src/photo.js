// Photo mode (P): the HUD steps aside for a viewfinder frame; the mouse
// wheel zooms (an 18–135 mm lens on 35 mm film), the left button or Enter
// takes the picture. The frame is printed with a vignette and an orange date
// stamp in the corner, the way the cheap cameras of the day did it, and
// handed to the browser as a PNG download.

const ZOOM_MIN = 18; // mm
const ZOOM_MAX = 135;

/** Vertical field of view (deg) of a lens of `mm` on 24 × 36 mm film. */
export const fovOf = (mm) => (2 * Math.atan(12 / mm) * 180) / Math.PI;
/** The lens (mm) giving a vertical field of view of `fov` degrees. */
export const mmOf = (fov) => 12 / Math.tan((fov * Math.PI) / 360);

export class PhotoMode {
  constructor({ canvas, player, sound, env }) {
    this.canvas = canvas;
    this.player = player;
    this.sound = sound;
    this.env = env;
    this.active = false;
    this.mm = 35;
    this.count = 0;
    this.pending = false;
    /** The last picture taken (a Blob), for whoever wants it. */
    this.last = null;

    this.el = document.createElement("div");
    this.el.id = "photo";
    this.el.innerHTML = `
      <div class="corner tl"></div><div class="corner tr"></div>
      <div class="corner bl"></div><div class="corner br"></div>
      <div class="focus"></div>
      <div class="info"><span class="lens"></span><span class="frame"></span></div>
      <div class="help">wheel — zoom · click / Enter — shoot · P — done</div>
      <div class="flash"></div>`;
    document.body.appendChild(this.el);
    this.lensEl = this.el.querySelector(".lens");
    this.frameEl = this.el.querySelector(".frame");
    this.flashEl = this.el.querySelector(".flash");
  }

  toggle(force) {
    const on = force ?? !this.active;
    if (on === this.active) return on;
    this.active = on;
    document.body.classList.toggle("photo-mode", on);
    if (on) {
      this.savedFov = this.player.fovBase;
      this.mm = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, mmOf(this.savedFov)));
    } else if (this.savedFov !== undefined) {
      this.player.fovBase = this.savedFov;
    }
    this.apply();
    return on;
  }

  /** Mouse wheel: zooms in (negative delta) or out. */
  zoom(delta) {
    if (!this.active) return;
    const k = Math.exp(-delta * 0.0012);
    this.mm = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, this.mm * k));
    this.apply();
  }

  apply() {
    if (this.active) this.player.fovBase = fovOf(this.mm);
    this.lensEl.textContent = `${Math.round(this.mm)} мм`;
    this.frameEl.textContent = `кадр ${this.count + 1}`;
  }

  /** Asks for a picture of the next rendered frame. */
  shoot() {
    if (!this.active) return false;
    this.pending = true;
    return true;
  }

  /** Called right after the frame is rendered: the drawing buffer is still intact. */
  afterRender() {
    if (!this.pending) return;
    this.pending = false;
    const src = this.canvas;
    const w = src.width;
    const h = src.height;
    const print = document.createElement("canvas");
    print.width = w;
    print.height = h;
    const c = print.getContext("2d");
    c.drawImage(src, 0, 0);
    // the lens darkens the corners a little
    const g = c.createRadialGradient(
      w / 2,
      h / 2,
      Math.min(w, h) * 0.35,
      w / 2,
      h / 2,
      Math.hypot(w, h) * 0.55,
    );
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(8,10,16,0.45)");
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    // the date stamp, burnt into the bottom right corner
    const size = Math.round(h * 0.034);
    c.font = `bold ${size}px "Courier New", ui-monospace, monospace`;
    c.textAlign = "right";
    c.textBaseline = "alphabetic";
    const stamp = `'64 12 1  ${this.env?.clock ?? ""}`;
    c.shadowColor = "rgba(255, 120, 30, 0.85)";
    c.shadowBlur = size * 0.5;
    c.fillStyle = "rgba(255, 150, 60, 0.92)";
    c.fillText(stamp, w - size * 1.4, h - size * 1.2);
    c.shadowBlur = 0;
    this.count++;
    this.apply();
    this.sound?.shutter?.();
    this.flashEl.classList.remove("go");
    void this.flashEl.offsetWidth;
    this.flashEl.classList.add("go");
    const n = this.count;
    print.toBlob((blob) => {
      if (!blob) return;
      this.last = blob;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `pervyj-sneg-${String(n).padStart(3, "0")}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }, "image/png");
  }
}
