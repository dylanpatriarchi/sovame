// Audio synthesized with WebAudio: wind, footsteps, jumps, the kiosk radio,
// distant chimes. No external audio files.
import { clamp, Rng } from './util.js';

export class Sound {
  constructor({ volume = 0.7 } = {}) {
    this.volume = volume;
    this.ready = false;
    this.rng = new Rng(2718);
    this.radioOn = false;
    this.nextClang = 0;
    this.windGust = 0;
  }

  init() {
    if (this.ready) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(ctx.destination);

    // reusable noise buffer
    const seconds = 3;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = white * 0.6 + last * 3.2;
    }
    this.noise = buffer;
    this.flatNoise = (() => {
      const b = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      return b;
    })();

    // wind: two layers (rumble + hiss)
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    this.windGain.connect(this.master);
    const windSrc = ctx.createBufferSource();
    windSrc.buffer = this.noise;
    windSrc.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 320;
    windFilter.Q.value = 0.8;
    windSrc.connect(windFilter).connect(this.windGain);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 130;
    lfo.connect(lfoGain).connect(windFilter.frequency);
    windSrc.start();
    lfo.start();

    this.hissGain = ctx.createGain();
    this.hissGain.gain.value = 0;
    this.hissGain.connect(this.master);
    const hissSrc = ctx.createBufferSource();
    hissSrc.buffer = this.noise;
    hissSrc.loop = true;
    const hissFilter = ctx.createBiquadFilter();
    hissFilter.type = 'bandpass';
    hissFilter.frequency.value = 780;
    hissFilter.Q.value = 0.9;
    hissSrc.connect(hissFilter).connect(this.hissGain);
    hissSrc.start();

    // background hum of the district
    const humGain = ctx.createGain();
    humGain.gain.value = 0.022;
    humGain.connect(this.master);
    for (const [freq, detune] of [[55, -4], [82.5, 5]]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = 0.5;
      osc.connect(g).connect(humGain);
      osc.start();
    }

    // radio
    this.radioGain = ctx.createGain();
    this.radioGain.gain.value = 0;
    this.radioFilter = ctx.createBiquadFilter();
    this.radioFilter.type = 'lowpass';
    this.radioFilter.frequency.value = 2000;
    this.radioPanner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (this.radioPanner) {
      this.radioGain.connect(this.radioPanner);
      this.radioPanner.connect(this.master);
    } else {
      this.radioGain.connect(this.master);
    }
    const vinyl = ctx.createBufferSource();
    vinyl.buffer = this.flatNoise;
    vinyl.loop = true;
    const vinylFilter = ctx.createBiquadFilter();
    vinylFilter.type = 'highpass';
    vinylFilter.frequency.value = 1800;
    const vinylGain = ctx.createGain();
    vinylGain.gain.value = 0.02;
    vinyl.connect(vinylFilter).connect(vinylGain).connect(this.radioGain);
    vinyl.start();
    this.radioStep = 0;
    this.radioNextTime = ctx.currentTime + 0.2;

    this.ready = true;
    this.updateWind(0.4);
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setVolume(v) {
    this.volume = clamp(v, 0, 1);
    if (this.master) this.master.gain.value = this.volume;
  }

  /** Updates the wind from the gust computed by the environment. */
  updateWind(gust) {
    if (!this.ready) return;
    this.windGust = gust;
    const t = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(0.05 + 0.16 * gust, t, 0.6);
    this.hissGain.gain.setTargetAtTime(0.004 + 0.05 * gust * gust, t, 0.8);
  }

  burst({ time, freq, q, duration, level, type = 'bandpass', buffer = null, rate = 1 }) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buffer || this.flatNoise;
    src.playbackRate.value = rate;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, level), time + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    src.connect(filter).connect(gain).connect(this.master);
    const offset = this.rng.float(0, 1.5);
    src.start(time, offset, duration + 0.05);
    src.stop(time + duration + 0.06);
  }

  /** Footstep: the sound changes with the surface. */
  step(surface, speed = 2.7) {
    if (!this.ready) return;
    this.resume();
    this.surface = surface;
    const t = this.ctx.currentTime + 0.001;
    const amp = clamp(0.35 + speed / 8, 0.3, 0.95);
    if (surface === 'snow') {
      for (let i = 0; i < 5; i++) {
        this.burst({
          time: t + i * 0.018,
          freq: this.rng.float(420, 1500),
          q: 0.9,
          duration: this.rng.float(0.06, 0.12),
          level: 0.1 * amp * (1 - i * 0.16),
          rate: this.rng.float(1.4, 2.2),
        });
      }
    } else if (surface === 'ice') {
      this.burst({ time: t, freq: 3400, q: 2.4, duration: 0.05, level: 0.1 * amp, rate: 2.2 });
      this.burst({ time: t + 0.01, freq: 900, q: 1.2, duration: 0.08, level: 0.05 * amp });
    } else {
      this.burst({ time: t, freq: this.rng.float(1500, 2400), q: 1.4, duration: 0.035, level: 0.11 * amp, rate: 2.4 });
      this.burst({ time: t + 0.018, freq: this.rng.float(600, 950), q: 1.1, duration: 0.07, level: 0.06 * amp });
    }
  }

  jump() {
    if (!this.ready) return;
    this.burst({ time: this.ctx.currentTime, freq: 700, q: 1.1, duration: 0.09, level: 0.07, type: 'lowpass' });
  }

  land(impact = 0.5) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const level = 0.08 + impact * 0.14;
    if (this.surface === 'snow' || this.lastSurface === 'snow') {
      for (let i = 0; i < 4; i++) {
        this.burst({ time: t + i * 0.02, freq: this.rng.float(400, 1200), q: 0.9, duration: 0.1, level: level * (1 - i * 0.2), rate: 1.6 });
      }
    } else {
      this.burst({ time: t, freq: 1400, q: 1.2, duration: 0.05, level, rate: 2.2 });
    }
  }

  ui(kind = 'tick') {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = kind === 'confirm' ? 520 : 760;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(kind === 'confirm' ? 0.06 : 0.035, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  toggleRadio(force) {
    if (!this.ready) return false;
    this.radioOn = force === undefined ? !this.radioOn : force;
    return this.radioOn;
  }

  /** Distant metallic clang, once in a while. */
  scheduleClang(now) {
    if (now < this.nextClang) return;
    this.nextClang = now + this.rng.float(26, 78);
    const t = this.ctx.currentTime + this.rng.float(0.1, 1.2);
    for (const [freq, level] of [[this.rng.float(120, 180), 0.03], [this.rng.float(280, 420), 0.018], [this.rng.float(700, 950), 0.008]]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(level, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + this.rng.float(1.6, 3.4));
      osc.connect(gain).connect(this.master);
      osc.start(t);
      osc.stop(t + 3.6);
    }
    this.burst({ time: t, freq: 900, q: 0.7, duration: 0.5, level: 0.02, type: 'bandpass' });
  }

  /** Slow, weary melody from the kiosk radio. */
  scheduleRadio() {
    if (!this.ready || !this.radioOn) return;
    const ctx = this.ctx;
    const bar = 2.6;
    if (this.radioNextTime < ctx.currentTime - 0.5) this.radioNextTime = ctx.currentTime + 0.1;
    while (this.radioNextTime < ctx.currentTime + 1.2) {
      const t = this.radioNextTime;
      const step = this.radioStep;
      const scale = [57, 60, 62, 64, 65, 67, 69, 72, 64, 62, 60, 57];
      const midi = scale[step % scale.length];
      const freq = 440 * Math.pow(2, (midi - 69) / 12);
      const osc = ctx.createOscillator();
      osc.type = step % 4 === 0 ? 'triangle' : 'sine';
      osc.frequency.value = step % 8 === 0 ? freq * 0.5 : freq;
      const gain = ctx.createGain();
      const level = step % 4 === 0 ? 0.08 : 0.05;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(level, t + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      osc.connect(gain).connect(this.radioFilter).connect(this.radioGain);
      osc.start(t);
      osc.stop(t + 1.0);
      // slight vibrato
      const vib = ctx.createOscillator();
      vib.frequency.value = 5.2;
      const vibGain = ctx.createGain();
      vibGain.gain.value = 4;
      vib.connect(vibGain).connect(osc.detune);
      vib.start(t);
      vib.stop(t + 1.0);
      this.radioStep++;
      this.radioNextTime += bar / 4;
    }
  }

  update(dt, now, listenerPos, radioPos) {
    if (!this.ready) return;
    this.scheduleRadio();
    this.scheduleClang(now);
    if (radioPos && listenerPos) {
      const dx = radioPos.x - listenerPos.x;
      const dz = radioPos.z - listenerPos.z;
      const dist = Math.hypot(dx, dz);
      const target = this.radioOn ? 0.9 / (1 + dist * dist * 0.012) : 0;
      this.radioGain.gain.setTargetAtTime(clamp(target, 0, 0.9), this.ctx.currentTime, 0.4);
      if (this.radioPanner) {
        // approximate stereo: projection onto the camera's right side
        const pan = clamp(dx / (14 + dist), -1, 1);
        this.radioPanner.pan.setTargetAtTime(pan, this.ctx.currentTime, 0.3);
      }
      this.radioFilter.frequency.setTargetAtTime(900 + 1600 / (1 + dist * 0.06), this.ctx.currentTime, 0.5);
    }
  }
}
