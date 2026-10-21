// Audio synthesized with WebAudio: wind, footsteps, jumps, the kiosk radio,
// distant chimes. No external audio files.
import { clamp, Rng } from './util.js';

const midiHz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

export class Sound {
  constructor({ volume = 0.7 } = {}) {
    this.volume = volume;
    this.ready = false;
    this.rng = new Rng(2718);
    this.radioOn = false;
    this.nextClang = 0;
    this.windGust = 0;
    this.indoors = false;
    // the station's rotating tracks: pure seeded data, same sequence every session
    this.radioTracks = this.buildRadioTracks();
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
    this.windFilter = windFilter;
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

    // stairwell room tone: soft brown rumble and a 50 Hz mains hum in the
    // panel walls, silent outdoors, faded in by setIndoors
    this.roomGain = ctx.createGain();
    this.roomGain.gain.value = 0;
    this.roomGain.connect(this.master);
    const roomSrc = ctx.createBufferSource();
    roomSrc.buffer = this.noise;
    roomSrc.loop = true;
    const roomFilter = ctx.createBiquadFilter();
    roomFilter.type = 'lowpass';
    roomFilter.frequency.value = 210;
    roomSrc.connect(roomFilter).connect(this.roomGain);
    roomSrc.start();
    this.indoorHumGain = ctx.createGain();
    this.indoorHumGain.gain.value = 0;
    this.indoorHumGain.connect(this.master);
    for (const [freq, level] of [[50, 0.5], [100, 0.2]]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = level;
      osc.connect(g).connect(this.indoorHumGain);
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
    // instruments feed the radio through the shared lowpass
    this.radioFilter.connect(this.radioGain);
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

    // guitar "chorus": one shared feedback-delay bus that arpeggio notes tap into
    this.guitarBus = ctx.createGain();
    const chorusDelay = ctx.createDelay(0.06);
    chorusDelay.delayTime.value = 0.024;
    const chorusFeedback = ctx.createGain();
    chorusFeedback.gain.value = 0.3;
    const chorusWet = ctx.createGain();
    chorusWet.gain.value = 0.55;
    this.guitarBus.connect(chorusDelay);
    chorusDelay.connect(chorusFeedback).connect(chorusDelay);
    chorusDelay.connect(chorusWet);
    const guitarLowpass = ctx.createBiquadFilter();
    guitarLowpass.type = 'lowpass';
    guitarLowpass.frequency.value = 2400;
    this.guitarBus.connect(guitarLowpass);
    chorusWet.connect(guitarLowpass);
    guitarLowpass.connect(this.radioFilter);

    this.radioStep = 0;
    this.radioTrackIndex = 0;
    this.radioTrackStep = 0;
    this.radioGapSteps = 0;
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
    // through the stairwell walls the wind turns into a low rumble
    const muffle = this.indoors ? 0.35 : 1;
    this.windGain.gain.setTargetAtTime((0.05 + 0.16 * gust) * muffle, t, 0.6);
    this.hissGain.gain.setTargetAtTime((0.004 + 0.05 * gust * gust) * (this.indoors ? 0.12 : 1), t, 0.8);
  }

  /** Fades the interior room tone in and muffles the outdoor wind. */
  setIndoors(on) {
    this.indoors = on;
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.roomGain.gain.setTargetAtTime(on ? 0.05 : 0, t, 0.45);
    this.indoorHumGain.gain.setTargetAtTime(on ? 0.016 : 0, t, 0.4);
    this.windFilter.frequency.setTargetAtTime(on ? 150 : 320, t, 0.5);
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
    } else if (surface === 'wood') {
      // parquet: a dull knock, now and then a board creaks
      this.burst({ time: t, freq: this.rng.float(380, 620), q: 1.2, duration: 0.07, level: 0.09 * amp, type: 'lowpass' });
      this.burst({ time: t + 0.012, freq: this.rng.float(1300, 1900), q: 1.6, duration: 0.03, level: 0.035 * amp });
      if (this.rng.chance(0.14)) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(this.rng.float(180, 260), t + 0.05);
        osc.frequency.exponentialRampToValueAtTime(this.rng.float(120, 170), t + 0.3);
        gain.gain.setValueAtTime(0.0001, t + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.012, t + 0.09);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
        osc.connect(gain).connect(this.master);
        osc.start(t + 0.05);
        osc.stop(t + 0.34);
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

  /** Breath-shaped noise: a filter sweep under a slow attack/release. */
  breath({ time, duration, attack, from, to, q, level }) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.flatNoise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = q;
    filter.frequency.setValueAtTime(from, time);
    filter.frequency.exponentialRampToValueAtTime(to, time + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(level, time + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(time, this.rng.float(0, 1.5), duration + 0.1);
    src.stop(time + duration + 0.12);
  }

  /** Lighter: flint click, a short gas hiss. */
  lighter() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.burst({ time: t, freq: 3200, q: 2.5, duration: 0.03, level: 0.08, type: 'highpass' });
    this.burst({ time: t + 0.05, freq: 2400, q: 1.6, duration: 0.025, level: 0.05 });
    this.breath({ time: t + 0.07, duration: 0.9, attack: 0.05, from: 900, to: 700, q: 0.6, level: 0.018 });
  }

  /** A drag: soft inhale with the faint crackle of burning paper. */
  inhale(duration = 1.5) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.breath({ time: t, duration, attack: duration * 0.45, from: 900, to: 1500, q: 0.8, level: 0.03 });
    const crackles = 5 + Math.floor(this.rng.float(0, 5));
    for (let i = 0; i < crackles; i++) {
      this.burst({ time: t + this.rng.float(0.2, duration), freq: this.rng.float(2500, 5200), q: 3, duration: 0.012, level: this.rng.float(0.006, 0.016) });
    }
  }

  /** Long, low exhale. */
  exhale(duration = 2.2) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.breath({ time: t, duration, attack: 0.18, from: 650, to: 380, q: 0.7, level: 0.035 });
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

  /**
   * Builds the station's rotating tracks from seeded parameter sets:
   * chord progression, tempo, patterns and lead phrases. Deterministic.
   */
  buildRadioTracks() {
    const rng = new Rng(4510);
    const MINOR = [0, 2, 3, 5, 7, 8, 10];
    const deg = (tonic, d, oct = 0) => tonic + MINOR[((d % 7) + 7) % 7] + 12 * (oct + Math.floor(d / 7));
    const progressions = [
      [0, 5, 2, 6], // i–VI–III–VII
      [0, 6, 5, 6], // i–VII–VI–VII
      [0, 3, 5, 4], // i–iv–VI–v
    ];
    const bassPatterns = [
      [0, 0, 7, 0, 12, 0, 7, 0],
      [0, 0, 0, 7, 0, 0, 12, 7],
      [0, 7, 0, 12, 0, 7, 10, 12],
      [0, 0, 10, 0, 7, 0, 12, 0],
    ];
    const arpPatterns = [
      [0, 1, 2, 3, 2, 1],
      [0, 2, 1, 3, 0, 2, 1, 2],
      [0, 1, 2, 1, 3, 1, 2, 1],
      [0, 3, 1, 2, 0, 3, 2, 1],
    ];
    const hatPatterns = [
      [0.7, 0.35, 1, 0.35, 0.7, 0.35, 1, 0.35, 0.7, 0.35, 1, 0.35, 0.7, 0.35, 1, 0.45],
      [1, 0.35, 0.55, 0.35, 1, 0.35, 0.55, 0.35, 1, 0.35, 0.55, 0.35, 1, 0.35, 0.55, 0.45],
      [0.8, 0.3, 0.5, 0.3, 0.8, 0.3, 0.5, 0.55, 0.8, 0.3, 0.5, 0.3, 0.8, 0.55, 0.5, 0.55],
    ];
    // one distinct progression per track, in a seeded order
    const order = [0, 1, 2];
    for (let i = order.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      [order[i], order[j]] = [order[j], order[i]];
    }
    return order.map((pi) => {
      const tonic = rng.pick([33, 38]); // A1 or D2: A minor / D minor
      const degrees = progressions[pi];
      const bpm = rng.int(95, 115);
      const bars = rng.pick([16, 20, 24]);
      // sparse doomy lead phrases: a short motif every few bars, lots of space
      const lead = {};
      let bar = rng.int(1, 3);
      while (bar < bars) {
        const notes = [];
        let s = rng.pick([0, 4, 8]);
        const count = rng.int(1, 3);
        for (let n = 0; n < count && s < 15; n++) {
          const len = rng.pick([3, 4, 6, 8]);
          notes.push({ step: s, midi: tonic + 36 + rng.pick([0, 3, 5, 7, 10, 12]), len });
          s += len + rng.int(1, 3);
        }
        lead[bar] = notes;
        bar += rng.int(2, 5);
      }
      return {
        bpm,
        bars,
        sixteenth: 60 / bpm / 4,
        chordRoots: degrees.map((d) => deg(tonic, d)),
        chordTones: degrees.map((d) => [0, 2, 4, 7, 9, 14].map((x) => deg(tonic, d + x, 2))),
        bass: rng.pick(bassPatterns),
        bassGate: Array.from({ length: 8 }, () => rng.float(0.55, 0.95)),
        bassCutoff: rng.float(400, 700),
        arp: rng.pick(arpPatterns),
        arpRate: rng.pick([1, 2]), // 16ths or 8ths
        hats: rng.pick(hatPatterns),
        fill: rng.chance(0.6),
        lead,
      };
    });
  }

  /**
   * Post-punk station sequencer. Schedules one 16th step per while-loop
   * iteration, always a little ahead of the audio clock; tracks rotate with
   * a one-bar crackle-only gap in between, like a tape change.
   */
  scheduleRadio() {
    if (!this.ready || !this.radioOn) return;
    const ctx = this.ctx;
    if (this.radioNextTime < ctx.currentTime - 0.5) this.radioNextTime = ctx.currentTime + 0.1;
    while (this.radioNextTime < ctx.currentTime + 1.2) {
      const track = this.radioTracks[this.radioTrackIndex];
      const t = this.radioNextTime;
      if (this.radioGapSteps > 0) {
        this.radioGapSteps--; // between tracks: vinyl crackle only
      } else {
        this.scheduleRadioStep(track, this.radioTrackStep, t);
        this.radioTrackStep++;
        if (this.radioTrackStep >= track.bars * 16) {
          this.radioTrackStep = 0;
          this.radioTrackIndex = (this.radioTrackIndex + 1) % this.radioTracks.length;
          this.radioGapSteps = 16;
        }
      }
      this.radioStep++;
      this.radioNextTime += track.sixteenth;
    }
  }

  /** Schedules every instrument for one 16th step of a track. */
  scheduleRadioStep(track, step, t) {
    const bar = (step / 16) | 0;
    const s16 = step % 16;
    const ci = bar % track.chordRoots.length;
    if (s16 % 4 === 0) this.radioKick(t);
    if (s16 === 4 || s16 === 12) this.radioSnare(t, 1);
    if (track.fill && bar % 8 === 7 && s16 === 14) this.radioSnare(t, 0.55);
    const hatLevel = track.hats[s16];
    if (hatLevel > 0) this.radioHat(t, hatLevel);
    if (s16 % 2 === 0) {
      const i8 = (s16 / 2) | 0;
      this.radioBass(t, track.chordRoots[ci] + track.bass[i8], track.sixteenth * 2 * track.bassGate[i8], track.bassCutoff);
    }
    if (s16 % track.arpRate === 0) {
      const tone = track.arp[((step / track.arpRate) | 0) % track.arp.length];
      this.radioGuitar(t, track.chordTones[ci][tone], track.sixteenth * track.arpRate * 0.9);
    }
    const phrase = track.lead[bar];
    if (phrase) {
      for (const note of phrase) {
        if (note.step === s16) this.radioLead(t, note.midi, note.len * track.sixteenth);
      }
    }
  }

  /** Motorik kick: sine pitch-drop on the quarter notes. */
  radioKick(t) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.11);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.1, t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(gain).connect(this.radioFilter);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  /** Snare on 2 and 4: noise burst plus a short triangle body. */
  radioSnare(t, accent) {
    const ctx = this.ctx;
    const noise = ctx.createBufferSource();
    noise.buffer = this.flatNoise;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1900;
    band.Q.value = 0.8;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.0001, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.05 * accent, t + 0.004);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    noise.connect(band).connect(noiseGain).connect(this.radioFilter);
    noise.start(t, 0, 0.14);
    noise.stop(t + 0.15);
    const tone = ctx.createOscillator();
    tone.type = 'triangle';
    tone.frequency.setValueAtTime(210, t);
    tone.frequency.exponentialRampToValueAtTime(160, t + 0.08);
    const toneGain = ctx.createGain();
    toneGain.gain.setValueAtTime(0.0001, t);
    toneGain.gain.exponentialRampToValueAtTime(0.028 * accent, t + 0.004);
    toneGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    tone.connect(toneGain).connect(this.radioFilter);
    tone.start(t);
    tone.stop(t + 0.12);
  }

  /** Closed 16th hats: highpassed noise, velocity from the accent pattern. */
  radioHat(t, velocity) {
    const ctx = this.ctx;
    const noise = ctx.createBufferSource();
    noise.buffer = this.flatNoise;
    const high = ctx.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = 7200;
    high.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.035 * velocity, t + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    noise.connect(high).connect(gain).connect(this.radioFilter);
    noise.start(t, 0.6, 0.05);
    noise.stop(t + 0.06);
  }

  /** Driving bass: sawtooth through a lowpass, eighth-note gate. */
  radioBass(t, midi, dur, cutoff) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = midiHz(midi);
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = cutoff;
    low.Q.value = 1.2;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.085, t + 0.012);
    gain.gain.setValueAtTime(0.085, t + Math.max(0.03, dur - 0.05));
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(low).connect(gain).connect(this.radioFilter);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** Chorus-drenched guitar: two detuned saws into the feedback-delay bus. */
  radioGuitar(t, midi, dur) {
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.026, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const cents of [-7, 7]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = midiHz(midi);
      osc.detune.value = cents;
      osc.connect(gain);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    }
    gain.connect(this.guitarBus);
  }

  /** Doomy lead: triangle with slow vibrato, long notes, rare phrases. */
  radioLead(t, midi, dur) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = midiHz(midi);
    const vib = ctx.createOscillator();
    vib.frequency.value = 4.6;
    const vibGain = ctx.createGain();
    vibGain.gain.value = 7;
    vib.connect(vibGain).connect(osc.detune);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.06, t + 0.09);
    gain.gain.setValueAtTime(0.06, t + Math.max(0.1, dur - 0.12));
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.radioFilter);
    osc.start(t);
    osc.stop(t + dur + 0.05);
    vib.start(t);
    vib.stop(t + dur + 0.05);
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
