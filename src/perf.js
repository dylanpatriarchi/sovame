// Performance overlay (open the game with `?perf` in the URL, or call
// `__perf.toggle()` from the console). Shows FPS, frame time, renderer.info
// and the cost of every pass of a frame: simulation update, window-view
// portal, shadow map, main render, bloom and output. CPU time is always
// measured; GPU time too when the browser exposes
// EXT_disjoint_timer_query_webgl2 (desktop Chrome usually does).
//
// A frame is cut into consecutive segments, one label at a time: GPU timer
// queries cannot nest, so a nested section (the shadow map inside a render)
// closes its parent's segment and reopens it when it is done.

import * as THREE from 'three';

const LABELS = ['update', 'windows', 'shadow', 'main', 'bloom', 'output', 'other'];
const HISTORY = 120;

export class Perf {
  constructor(renderer) {
    this.renderer = renderer;
    this.enabled = false;
    this.el = null;
    this.stack = [];
    this.label = null;
    this.segStart = 0;
    this.segCalls = 0;
    this.frameStart = 0;
    this.cur = this.blank();
    this.frames = [];
    this.lastDraw = 0;
    this.lastFrameEnd = 0;
    this.intervals = [];
    // GPU timing
    this.gl = renderer.getContext();
    this.ext = null;
    this.query = null;
    this.pending = [];
    // per-frame GPU times (ms by label), as they come back from the queries
    this.gpuFrames = [];
  }

  blank() {
    return { cpu: Object.fromEntries(LABELS.map((l) => [l, 0])), calls: Object.fromEntries(LABELS.map((l) => [l, 0])), total: 0 };
  }

  setEnabled(on) {
    this.enabled = on;
    if (on && !this.el) this.makePanel();
    if (this.el) this.el.style.display = on ? 'block' : 'none';
    if (on && !this.ext) this.ext = this.gl.getExtension('EXT_disjoint_timer_query_webgl2');
  }

  toggle() {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  makePanel() {
    const el = document.createElement('pre');
    el.id = 'perf';
    Object.assign(el.style, {
      position: 'fixed',
      left: '8px',
      top: '8px',
      zIndex: 50,
      margin: 0,
      padding: '6px 8px',
      font: '11px/1.35 ui-monospace, Menlo, Consolas, monospace',
      color: '#d8e4ea',
      background: 'rgba(8, 11, 15, 0.78)',
      pointerEvents: 'none',
      whiteSpace: 'pre',
    });
    document.body.appendChild(el);
    this.el = el;
  }

  /** Wraps the shadow map and every composer pass so they report themselves. */
  instrument(composer, names) {
    const shadowMap = this.renderer.shadowMap;
    const shadowRender = shadowMap.render;
    shadowMap.render = (lights, scene, camera) => {
      // only a real pass when some light actually casts
      if (!this.enabled || !lights.length) return shadowRender.call(shadowMap, lights, scene, camera);
      this.push('shadow');
      shadowRender.call(shadowMap, lights, scene, camera);
      this.pop();
    };
    composer.passes.forEach((pass, i) => {
      const label = names[i];
      if (!label) return;
      const render = pass.render;
      pass.render = (...args) => {
        if (!this.enabled) return render.apply(pass, args);
        this.push(label);
        render.apply(pass, args);
        this.pop();
      };
    });
  }

  /* --------------------------------------------------------- segments */

  switchTo(label) {
    const now = performance.now();
    const calls = this.renderer.info.render.calls;
    if (this.label) {
      this.cur.cpu[this.label] += now - this.segStart;
      this.cur.calls[this.label] += calls - this.segCalls;
    }
    this.label = label;
    this.segStart = now;
    this.segCalls = calls;
    if (this.ext) {
      const gl = this.gl;
      if (this.query) {
        gl.endQuery(this.ext.TIME_ELAPSED_EXT);
        this.query = null;
      }
      if (label) {
        const q = gl.createQuery();
        gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q);
        this.query = q;
        this.pending.push({ q, label, frame: this.frameIndex });
      }
    }
  }

  push(label) {
    if (!this.enabled) return;
    this.stack.push(this.label);
    this.switchTo(label);
  }

  pop() {
    if (!this.enabled) return;
    this.switchTo(this.stack.pop() ?? 'other');
  }

  begin() {
    if (!this.enabled) return;
    this.frameIndex = (this.frameIndex ?? 0) + 1;
    this.frameStart = performance.now();
    if (this.lastFrameStart) this.intervals.push(this.frameStart - this.lastFrameStart);
    this.lastFrameStart = this.frameStart;
    if (this.intervals.length > HISTORY) this.intervals.shift();
    this.cur = this.blank();
    this.stack.length = 0;
    this.switchTo('other');
  }

  end() {
    if (!this.enabled) return;
    this.switchTo(null);
    this.lastFrameEnd = performance.now();
    this.cur.total = this.lastFrameEnd - this.frameStart;
    const info = this.renderer.info;
    this.cur.info = {
      calls: info.render.calls,
      triangles: info.render.triangles,
      textures: info.memory.textures,
      geometries: info.memory.geometries,
      programs: info.programs?.length ?? 0,
    };
    this.frames.push(this.cur);
    if (this.frames.length > HISTORY) this.frames.shift();
    this.collectGpu();
    if (this.lastFrameEnd - this.lastDraw > 250) {
      this.lastDraw = this.lastFrameEnd;
      this.draw();
    }
  }

  collectGpu() {
    if (!this.ext) return;
    const gl = this.gl;
    if (gl.getParameter(this.ext.GPU_DISJOINT_EXT)) {
      // timings of this window are garbage: drop them
      for (const p of this.pending) gl.deleteQuery(p.q);
      this.pending.length = 0;
      return;
    }
    // a frame counts once all of its queries are back
    while (this.pending.length) {
      const frame = this.pending[0].frame;
      if (frame === this.frameIndex) break;
      const queries = this.pending.filter((p) => p.frame === frame);
      if (!queries.every((p) => gl.getQueryParameter(p.q, gl.QUERY_RESULT_AVAILABLE))) break;
      const times = Object.fromEntries(LABELS.map((l) => [l, 0]));
      for (const p of queries) {
        times[p.label] += gl.getQueryParameter(p.q, gl.QUERY_RESULT) / 1e6;
        gl.deleteQuery(p.q);
      }
      this.pending.splice(0, queries.length);
      this.gpuFrames.push(times);
      if (this.gpuFrames.length > HISTORY) this.gpuFrames.shift();
    }
  }

  /* --------------------------------------------------------- reports */

  /** Averages over the last `n` frames (also used by tools/perf.mjs). */
  snapshot(n = 60) {
    const frames = this.frames.slice(-n);
    if (!frames.length) return null;
    const avg = (fn) => frames.reduce((s, f) => s + fn(f), 0) / frames.length;
    const intervals = this.intervals.slice(-n);
    const sorted = [...intervals].sort((a, b) => a - b);
    const last = frames[frames.length - 1].info;
    return {
      fps: intervals.length ? 1000 / (intervals.reduce((s, v) => s + v, 0) / intervals.length) : 0,
      frameMs: intervals.length ? intervals.reduce((s, v) => s + v, 0) / intervals.length : 0,
      frameMsP95: sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : 0,
      cpuMs: avg((f) => f.total),
      cpu: Object.fromEntries(LABELS.map((l) => [l, avg((f) => f.cpu[l])])),
      calls: Object.fromEntries(LABELS.map((l) => [l, Math.round(avg((f) => f.calls[l]))])),
      gpu: this.gpuFrames.length ? this.gpuAverage(n) : null,
      info: last,
      pixelRatio: this.renderer.getPixelRatio(),
      lights: this.lights?.() ?? null,
    };
  }

  /**
   * Objects the main camera draws this frame (visible, on its layers, inside
   * its frustum), counted by origin: the top-level group they belong to and
   * their own name or geometry type. A debugging aid, not cheap.
   */
  breakdown(scene, camera, root) {
    camera.updateMatrixWorld();
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const counts = {};
    const visit = (obj, origin) => {
      if (!obj.visible) return;
      const here = obj.parent === scene || obj.parent === root ? obj.name || obj.type : origin;
      if ((obj.isMesh || obj.isPoints || obj.isSprite || obj.isLine) && obj.layers.test(camera.layers)) {
        if (!obj.frustumCulled || frustum.intersectsObject(obj)) {
          const key = obj.parent === scene || obj.parent === root ? `${obj.isInstancedMesh ? 'inst:' : ''}${obj.name || obj.geometry?.type || obj.type}` : `${here}/${obj.name || obj.geometry?.type || obj.type}`;
          counts[key] = (counts[key] ?? 0) + (Array.isArray(obj.material) ? obj.material.length : 1);
        }
      }
      for (const child of obj.children) visit(child, here);
    };
    visit(scene, '');
    return counts;
  }

  gpuAverage(n) {
    const frames = this.gpuFrames.slice(-n);
    const out = Object.fromEntries(LABELS.map((l) => [l, frames.reduce((s, f) => s + f[l], 0) / frames.length]));
    out.total = LABELS.reduce((s, l) => s + out[l], 0);
    return out;
  }

  draw() {
    const s = this.snapshot(30);
    if (!s || !this.el) return;
    const f = (v, d = 1) => v.toFixed(d).padStart(6);
    const canvas = this.renderer.domElement;
    const lines = [
      `fps ${f(s.fps, 0)}   frame ${f(s.frameMs)} ms  p95 ${f(s.frameMsP95)}`,
      `cpu ${f(s.cpuMs)} ms   dpr ${s.pixelRatio.toFixed(2)}  ${canvas.width}×${canvas.height}`,
      `calls ${s.info.calls}  tris ${(s.info.triangles / 1000).toFixed(0)}k  programs ${s.info.programs}`,
      `textures ${s.info.textures}  geometries ${s.info.geometries}${s.lights !== null ? `  lights ${s.lights}` : ''}`,
      '',
      `pass       cpu ms  ${s.gpu ? 'gpu ms' : '      '}  calls`,
    ];
    for (const l of LABELS) {
      const gpu = s.gpu ? f(s.gpu[l], 2) : '      ';
      lines.push(`${l.padEnd(9)} ${f(s.cpu[l], 2)}  ${gpu}  ${String(s.calls[l]).padStart(5)}`);
    }
    if (s.gpu) lines.push(`${'total'.padEnd(9)} ${f(s.cpuMs, 2)}  ${f(s.gpu.total, 2)}`);
    else lines.push('', '(no GPU timer queries in this browser)');
    this.el.textContent = lines.join('\n');
  }
}
