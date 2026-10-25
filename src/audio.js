// Audio synthesized with WebAudio: wind, footsteps (snow, asphalt, stone, ice,
// parquet, stairwell concrete), jumps, the kiosk radio, distant chimes, and the
// ambience of where you are: a TV muffled behind the doors of a stairwell,
// skates on the hockey box, crows, the cars going round the block.
// No external audio files.
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

  /** Starts the audio graph (an OfflineAudioContext can be passed in, to
   * render sound previews). */
  init(context = null) {
    if (this.ready) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC && !context) return;
    const ctx = context ?? new AC();
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

    this.buildAmbience();

    this.radioStep = 0;
    this.radioTrackIndex = 0;
    this.radioTrackStep = 0;
    this.radioGapSteps = 0;
    this.radioNextTime = ctx.currentTime + 0.2;

    this.ready = true;
    this.updateWind(0.4);
  }

  /** Stairwell echo, the TV behind the doors and the passing cars. */
  buildAmbience() {
    const ctx = this.ctx;
    // stairwell: a bare concrete shaft, ~1.4 s of hard, bright reflections
    const len = Math.floor(ctx.sampleRate * 1.4);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    this.verb = ctx.createConvolver();
    this.verb.buffer = ir;
    this.verbGain = ctx.createGain();
    this.verbGain.gain.value = 0.55;
    this.verb.connect(this.verbGain).connect(this.master);

    // TV through a padded door: voice-band noise shaped into syllables by a
    // scheduled envelope, then dulled by the door and the landing
    this.tvGain = ctx.createGain();
    this.tvGain.gain.value = 0;
    this.tvPanner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const tvOut = this.tvPanner ? this.tvGain.connect(this.tvPanner) : this.tvGain;
    tvOut.connect(this.master);
    this.tvGain.connect(this.verb);
    // the voice: a buzzing glottal tone with a breath of noise, through two
    // vowel formants that move with every syllable
    this.tvVoice = ctx.createOscillator();
    this.tvVoice.type = 'sawtooth';
    this.tvVoice.frequency.value = 150;
    const breath = ctx.createBufferSource();
    breath.buffer = this.flatNoise;
    breath.loop = true;
    const breathGain = ctx.createGain();
    breathGain.gain.value = 0.25;
    const voice = ctx.createGain();
    this.tvVoice.connect(voice);
    breath.connect(breathGain).connect(voice);
    this.tvFormant = ctx.createBiquadFilter();
    this.tvFormant.type = 'bandpass';
    this.tvFormant.frequency.value = 650;
    this.tvFormant.Q.value = 3;
    this.tvFormant2 = ctx.createBiquadFilter();
    this.tvFormant2.type = 'bandpass';
    this.tvFormant2.frequency.value = 1400;
    this.tvFormant2.Q.value = 4;
    const f2Gain = ctx.createGain();
    f2Gain.gain.value = 0.6;
    this.tvSyllable = ctx.createGain();
    this.tvSyllable.gain.value = 0;
    voice.connect(this.tvFormant).connect(this.tvSyllable);
    voice.connect(this.tvFormant2).connect(f2Gain).connect(this.tvSyllable);
    // the padded door and the landing take the consonants away
    const tvDoor = ctx.createBiquadFilter();
    tvDoor.type = 'lowpass';
    tvDoor.frequency.value = 900;
    tvDoor.Q.value = 0.5;
    this.tvSyllable.connect(tvDoor).connect(this.tvGain);
    this.tvVoice.start();
    breath.start();
    // the program's music bed: two soft tones under the voices
    this.tvMusic = ctx.createGain();
    this.tvMusic.gain.value = 0;
    for (const f of [196, 247]) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = f;
      osc.connect(this.tvMusic);
      osc.start();
    }
    this.tvMusic.connect(tvDoor);
    this.tvLevel = 0;
    this.tvNext = 0;
    this.tvPitch = 140;

    // the traffic: one engine voice following the nearest car of the block
    this.carGain = ctx.createGain();
    this.carGain.gain.value = 0;
    this.carPanner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    (this.carPanner ? this.carGain.connect(this.carPanner) : this.carGain).connect(this.master);
    this.carOsc = ctx.createOscillator();
    this.carOsc.type = 'sawtooth';
    this.carOsc.frequency.value = 38;
    const carLow = ctx.createBiquadFilter();
    carLow.type = 'lowpass';
    carLow.frequency.value = 260;
    this.carOsc.connect(carLow).connect(this.carGain);
    this.carOsc.start();
    // tyres on packed snow: a band of noise rising with the speed
    const tyres = ctx.createBufferSource();
    tyres.buffer = this.noise;
    tyres.loop = true;
    this.tyreFilter = ctx.createBiquadFilter();
    this.tyreFilter.type = 'bandpass';
    this.tyreFilter.frequency.value = 500;
    this.tyreFilter.Q.value = 0.7;
    this.tyreGain = ctx.createGain();
    this.tyreGain.gain.value = 0.6;
    tyres.connect(this.tyreFilter).connect(this.tyreGain).connect(this.carGain);
    tyres.start();

    this.nextCaw = 4;
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

  burst({ time, freq, q, duration, level, type = 'bandpass', buffer = null, rate = 1, out = null }) {
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
    src.connect(filter).connect(gain).connect(out ?? this.master);
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
      // boots slipping on ice: a glassy tick and a short scuff
      this.burst({ time: t, freq: 3400, q: 2.4, duration: 0.05, level: 0.1 * amp, rate: 2.2 });
      this.burst({ time: t + 0.01, freq: 900, q: 1.2, duration: 0.08, level: 0.05 * amp });
      if (this.rng.chance(0.35)) this.burst({ time: t + 0.03, freq: this.rng.float(1800, 2600), q: 0.8, duration: 0.16, level: 0.03 * amp, type: 'highpass' });
    } else if (surface === 'asphalt') {
      // gritty asphalt: a duller heel, then the grit of salt and sand
      this.burst({ time: t, freq: this.rng.float(700, 1000), q: 1.1, duration: 0.05, level: 0.1 * amp, rate: 1.8 });
      for (let i = 0; i < 3; i++) {
        this.burst({ time: t + 0.015 + i * 0.012, freq: this.rng.float(3200, 5200), q: 1.6, duration: 0.025, level: 0.022 * amp });
      }
    } else if (surface === 'stairs') {
      // concrete steps in the stairwell shaft: a hard heel and its echo
      for (const [send, level] of [[false, 0.12], [true, 0.07]]) {
        this.burst({ time: t, freq: this.rng.float(1700, 2300), q: 1.5, duration: 0.03, level: level * amp, rate: 2.4, out: send ? this.verb : null });
        this.burst({ time: t + 0.012, freq: this.rng.float(320, 480), q: 1.2, duration: 0.06, level: level * 0.7 * amp, type: 'lowpass', out: send ? this.verb : null });
      }
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

  /* ------------------------------------------------ car */

  /** A tired four-cylinder: firing-rate saw + sub square through a lowpass,
   * a breath of intake noise on top; pitch follows a 4-speed gearbox. */
  engineStart() {
    if (!this.ready || this.engine) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.11, t + 0.35);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 380;
    filter.Q.value = 2.2;
    const saw = ctx.createOscillator();
    saw.type = 'sawtooth';
    const sub = ctx.createOscillator();
    sub.type = 'square';
    const subGain = ctx.createGain();
    subGain.gain.value = 0.45;
    const noise = ctx.createBufferSource();
    noise.buffer = this.noise;
    noise.loop = true;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 620;
    noiseFilter.Q.value = 0.9;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.05;
    saw.connect(filter);
    sub.connect(subGain).connect(filter);
    noise.connect(noiseFilter).connect(noiseGain).connect(filter);
    filter.connect(out).connect(this.master);
    saw.start(t);
    sub.start(t);
    noise.start(t);
    // starter motor grinding before it catches
    this.burst({ time: t, freq: 220, q: 3, duration: 0.45, level: 0.07, type: 'bandpass', rate: 0.6 });
    this.engine = { out, filter, saw, sub, noise, noiseGain, rpm: 850 };
    this.engineUpdate(0, 0);
  }

  engineUpdate(speed, throttle) {
    const e = this.engine;
    if (!e) return;
    const gears = [0, 6.5, 12, 17.5, 30];
    let g = 0;
    while (g < gears.length - 2 && speed > gears[g + 1]) g++;
    const span = gears[g + 1] - gears[g];
    const inGear = clamp((speed - gears[g]) / span, 0, 1);
    const target = 850 + inGear * 3300 * (g === 0 ? 0.9 : 0.75) + throttle * (g === 0 ? 900 : 350) + (g > 0 ? 1100 : 0);
    e.rpm += (target - e.rpm) * 0.08;
    const t = this.ctx.currentTime;
    const firing = (e.rpm / 60) * 2;
    e.saw.frequency.setTargetAtTime(firing, t, 0.05);
    e.sub.frequency.setTargetAtTime(firing / 2, t, 0.05);
    e.filter.frequency.setTargetAtTime(260 + throttle * 520 + e.rpm * 0.12, t, 0.08);
    e.noiseGain.gain.setTargetAtTime(0.03 + throttle * 0.06, t, 0.1);
    e.out.gain.setTargetAtTime(0.08 + throttle * 0.05 + Math.min(speed / 23, 1) * 0.03, t, 0.1);
  }

  engineStop() {
    const e = this.engine;
    if (!e) return;
    this.engine = null;
    const t = this.ctx.currentTime;
    e.out.gain.setTargetAtTime(0.0001, t, 0.12);
    for (const node of [e.saw, e.sub, e.noise]) node.stop(t + 0.7);
  }

  /** Door: a latch click and a sheet-metal thump. */
  door() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.burst({ time: t, freq: 2600, q: 2, duration: 0.03, level: 0.05 });
    this.burst({ time: t + 0.02, freq: 160, q: 1.2, duration: 0.18, level: 0.16, type: 'lowpass' });
  }

  /** Bodywork meeting a wall, a fence or another car. */
  thud(impact = 0.5) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.burst({ time: t, freq: 120, q: 0.9, duration: 0.35, level: 0.12 + impact * 0.25, type: 'lowpass' });
    this.burst({ time: t + 0.01, freq: 1800, q: 1.4, duration: 0.12, level: 0.04 + impact * 0.08, rate: 1.6 });
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

  /* ------------------------------------------------ ambience by zone */

  /** One skate stroke on the hockey box, `dist` m away, `pan` -1..1. */
  /** The soda machine: a coin dropping through, the valve's thunk, then
   * water hissing into the glass and fizzing for `secs`. */
  soda(secs = 2.6) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.02;
    // the coin rattling down the chute
    for (let i = 0; i < 4; i++) {
      const at = t + i * 0.07 + i * i * 0.01;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 2400 - i * 220;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, at);
      env.gain.exponentialRampToValueAtTime(0.03 / (1 + i * 0.4), at + 0.004);
      env.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
      osc.connect(env).connect(this.master);
      osc.start(at);
      osc.stop(at + 0.08);
    }
    // the valve
    this.burst({ time: t + 0.32, freq: 140, q: 0.9, duration: 0.18, level: 0.06, type: 'lowpass' });
    // the pour, then the fizz settling
    const at = t + 0.45;
    const src = ctx.createBufferSource();
    src.buffer = this.flatNoise;
    src.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.setValueAtTime(900, at);
    band.frequency.linearRampToValueAtTime(1500, at + secs);
    band.Q.value = 1.2;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(0.035, at + 0.1);
    env.gain.setValueAtTime(0.035, at + secs - 0.4);
    env.gain.exponentialRampToValueAtTime(0.0001, at + secs + 0.3);
    src.connect(band).connect(env).connect(this.master);
    src.start(at, this.rng.float(0, 1));
    src.stop(at + secs + 0.35);
    for (let i = 0; i < 26; i++) {
      this.burst({ time: at + this.rng.float(0.2, secs + 1.2), freq: this.rng.float(5000, 9000), q: 6, duration: 0.012, level: this.rng.float(0.004, 0.012), type: 'bandpass' });
    }
  }

  /** The payphone's line, heard down the handset (300–3400 Hz): the dial
   * tone, the dial's pulses, a ring, the speaking clock and its six pips,
   * the short beeps of a dead line, the hook. */
  phone(kind, len = 1, digit = 1) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.02;
    const line = ctx.createBiquadFilter();
    line.type = 'bandpass';
    line.frequency.value = 1000;
    line.Q.value = 0.35;
    line.connect(this.master);
    const tone = (at, dur, freq = 425, level = 0.025) => {
      const osc = ctx.createOscillator();
      osc.frequency.value = freq;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, at);
      env.gain.exponentialRampToValueAtTime(level, at + 0.01);
      env.gain.setValueAtTime(level, at + dur - 0.01);
      env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      osc.connect(env).connect(line);
      osc.start(at);
      osc.stop(at + dur + 0.02);
    };
    const click = (at, level = 0.05) => this.burst({ time: at, freq: 1800, q: 1.2, duration: 0.02, level, out: line });
    if (kind === 'tone') tone(t, 1.15);
    else if (kind === 'dial') {
      // the finger-stop's whirr, then one pulse a tenth of a second
      this.burst({ time: t, freq: 600, q: 2, duration: 0.3, level: 0.012 });
      const n = digit === 0 ? 10 : digit;
      for (let i = 0; i < n; i++) click(t + 0.35 + i * 0.1, 0.03);
    } else if (kind === 'ring') tone(t + 0.3, 0.8);
    else if (kind === 'time') {
      // a woman's voice, too far down the line to make out
      for (let i = 0; i < 7; i++) {
        const at = t + 0.1 + i * 0.14;
        this.burst({ time: at, freq: this.rng.float(500, 900), q: 3, duration: 0.12, level: 0.03, out: line });
      }
      // six pips, a second apart, the last one long
      for (let i = 0; i < 6; i++) tone(t + 1.3 + i, i === 5 ? 0.35 : 0.1, 1000, 0.03);
    } else if (kind === 'dead') for (let i = 0; i < 3; i++) tone(t + i * 0.7, 0.35);
    else if (kind === 'hangup') click(t, 0.08);
  }

  /** Arms and legs sweeping a snow angel: a long soft brush of snow. */
  swish() {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.02;
    const src = ctx.createBufferSource();
    src.buffer = this.flatNoise;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.setValueAtTime(700, t);
    band.frequency.linearRampToValueAtTime(1400, t + 0.45);
    band.frequency.linearRampToValueAtTime(800, t + 0.9);
    band.Q.value = 0.8;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.05, t + 0.3);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
    src.connect(band).connect(env).connect(this.master);
    src.start(t, this.rng.float(0, 1));
    src.stop(t + 1);
  }

  /** A carpet beater on a hanging rug: a dull flat slap, and the dust in it. */
  thwack(level = 1) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + 0.01;
    this.burst({ time: t, freq: 380, q: 0.9, duration: 0.12, level: 0.12 * level, type: 'lowpass' });
    this.burst({ time: t, freq: 1500, q: 0.7, duration: 0.07, level: 0.05 * level });
    this.burst({ time: t + 0.03, freq: 2800, q: 0.5, duration: 0.35, level: 0.012 * level, type: 'highpass' });
  }

  /** The puck: a stick's crack on a shot, the boards' hollow bang, and the
   * net's rattle on a goal. */
  puck(kind, level = 1) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + 0.01;
    if (kind === 'shot') {
      this.burst({ time: t, freq: 2600, q: 0.8, duration: 0.05, level: 0.09, type: 'highpass' });
      this.burst({ time: t, freq: 320, q: 1.2, duration: 0.08, level: 0.05 });
    } else if (kind === 'board') {
      this.burst({ time: t, freq: 140, q: 0.9, duration: 0.3, level: 0.05 + 0.1 * level, type: 'lowpass' });
      this.burst({ time: t + 0.01, freq: 900, q: 2.5, duration: 0.18, level: 0.02 + 0.04 * level });
    } else if (kind === 'goal') {
      // the net bellies out, the frame clanks
      this.burst({ time: t, freq: 1800, q: 0.7, duration: 0.45, level: 0.05 });
      for (let i = 0; i < 3; i++) this.burst({ time: t + 0.03 + i * 0.05, freq: 2400 - i * 300, q: 14, duration: 0.25, level: 0.03 });
    }
  }

  /** Three swallows from the glass. */
  gulp() {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.05;
    for (let i = 0; i < 3; i++) {
      const at = t + i * 0.45;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(260, at);
      osc.frequency.exponentialRampToValueAtTime(120, at + 0.12);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, at);
      env.gain.exponentialRampToValueAtTime(0.05, at + 0.02);
      env.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
      osc.connect(env).connect(this.master);
      osc.start(at);
      osc.stop(at + 0.18);
    }
  }

  /** Boot soles gliding on ice: a soft hiss, brighter the faster. */
  slide(speed = 2) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.01;
    const level = 0.012 + 0.006 * clamp(speed / 5, 0, 1);
    const src = ctx.createBufferSource();
    src.buffer = this.flatNoise;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 2200 + speed * 260;
    band.Q.value = 0.9;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(level, t + 0.08);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    src.connect(band).connect(env).connect(this.master);
    src.start(t, this.rng.float(0, 1));
    src.stop(t + 0.52);
  }

  skate(dist, pan = 0) {
    if (!this.ready || dist > 70) return;
    const t = this.ctx.currentTime + 0.001;
    const level = 0.09 / (1 + dist * dist * 0.012);
    if (level < 0.002) return;
    // the blade bites and carves: a hiss sweeping down, a faint scrape
    const src = this.ctx.createBufferSource();
    src.buffer = this.flatNoise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 3;
    filter.frequency.setValueAtTime(this.rng.float(5200, 6400), t);
    filter.frequency.exponentialRampToValueAtTime(this.rng.float(2200, 2800), t + 0.32);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(level, t + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
    const panner = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    if (panner) panner.pan.value = clamp(pan, -1, 1);
    src.connect(filter).connect(gain);
    (panner ? gain.connect(panner) : gain).connect(this.master);
    src.start(t, this.rng.float(0, 2));
    src.stop(t + 0.4);
  }

  /** The bus's doors: a burst of compressed air, `dist` m away. */
  hiss(dist, pan = 0) {
    if (!this.ready) return;
    const level = 0.08 / (1 + dist * dist * 0.006);
    if (level < 0.002) return;
    const t = this.ctx.currentTime + 0.01;
    const src = this.ctx.createBufferSource();
    src.buffer = this.flatNoise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.9;
    filter.frequency.setValueAtTime(4200, t);
    filter.frequency.exponentialRampToValueAtTime(2600, t + 0.9);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(level, t + 0.03);
    gain.gain.setValueAtTime(level, t + 0.18);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
    const panner = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    if (panner) panner.pan.value = clamp(pan, -1, 1);
    src.connect(filter).connect(gain);
    (panner ? gain.connect(panner) : gain).connect(this.master);
    src.start(t, this.rng.float(0, 1));
    src.stop(t + 1);
  }

  /** A snowball leaving the hand: a short swish of air. */
  whoosh() {
    if (!this.ready) return;
    const t = this.ctx.currentTime + 0.005;
    const src = this.ctx.createBufferSource();
    src.buffer = this.flatNoise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.4;
    filter.frequency.setValueAtTime(700, t);
    filter.frequency.exponentialRampToValueAtTime(1900, t + 0.16);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.05, t + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t, this.rng.float(0, 1));
    src.stop(t + 0.25);
  }

  /** A camera shutter: the blind's snap, then the film advancing. */
  shutter() {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.005;
    const click = (at, level, freq, dur) => {
      const src = ctx.createBufferSource();
      src.buffer = this.flatNoise;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = freq;
      band.Q.value = 1.2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(level, at + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      src.connect(band).connect(g).connect(this.master);
      src.start(at, this.rng.float(0, 1));
      src.stop(at + dur + 0.02);
    };
    click(t, 0.09, 3200, 0.03);
    click(t + 0.045, 0.06, 2400, 0.04);
    // the lever winding on: a short ratchet
    for (let i = 0; i < 6; i++) click(t + 0.22 + i * 0.028, 0.025, 1800, 0.018);
  }

  /** Coppers on the kiosk's tin counter, and the paper round the loaf. */
  till() {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.005;
    // two or three coins, each a short bright ring
    for (let i = 0; i < 3; i++) {
      const at = t + i * 0.07 + this.rng.float(0, 0.03);
      for (const f of [2900, 4300]) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = f * this.rng.float(0.94, 1.06);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(f > 3000 ? 0.012 : 0.02, at + 0.003);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
        osc.connect(g).connect(this.master);
        osc.start(at);
        osc.stop(at + 0.2);
      }
    }
    this.crumble(0.35, 0.03);
  }

  /** Bread torn and crumbled in the hand: a dry, papery crackle. */
  crumble(delay = 0, level = 0.04) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + 0.005 + delay;
    for (let i = 0; i < 7; i++) {
      this.burst({
        time: t + i * 0.035 + this.rng.float(0, 0.02),
        freq: this.rng.float(2200, 4200),
        q: 1.4,
        duration: 0.04,
        level: level * this.rng.float(0.5, 1),
        rate: 1.4,
      });
    }
  }

  /** A snowball bursting `dist` m away: a soft thump and the crunch of powder. */
  splat(dist, pan = 0, kind = 'wall') {
    if (!this.ready) return;
    const level = 0.12 / (1 + dist * dist * 0.02);
    if (level < 0.002) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.005;
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (panner) {
      panner.pan.value = clamp(pan, -1, 1);
      panner.connect(this.master);
    }
    const out = panner ?? this.master;
    // the thump: lower and duller on the ground, sharper on a wall or a car
    const thump = ctx.createOscillator();
    thump.type = 'sine';
    const f0 = kind === 'car' ? 180 : kind === 'ground' ? 90 : 130;
    thump.frequency.setValueAtTime(f0, t);
    thump.frequency.exponentialRampToValueAtTime(f0 * 0.45, t + 0.09);
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0.0001, t);
    tg.gain.exponentialRampToValueAtTime(level, t + 0.006);
    tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    thump.connect(tg).connect(out);
    thump.start(t);
    thump.stop(t + 0.14);
    // the crunch
    const src = ctx.createBufferSource();
    src.buffer = this.flatNoise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.8;
    filter.frequency.value = kind === 'ground' ? 1800 : 2600;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(level * 0.6, t + 0.01);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    src.connect(filter).connect(ng).connect(out);
    src.start(t, this.rng.float(0, 1));
    src.stop(t + 0.22);
  }

  /**
   * The stray dog: a few hoarse barks ("гав"), or one high yelp. A buzzy
   * voice through a mouth formant that opens and drops at each bark.
   */
  bark(dist, pan = 0, kind = 'bark', times = 2) {
    if (!this.ready) return;
    const level = 0.11 / (1 + dist * dist * 0.006);
    if (level < 0.0015) return;
    const ctx = this.ctx;
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (panner) {
      panner.pan.value = clamp(pan, -1, 1);
      panner.connect(this.master);
    }
    const out = panner ?? this.master;
    let t = ctx.currentTime + 0.02;
    const yelp = kind === 'yelp';
    for (let i = 0; i < (yelp ? 1 : times); i++) {
      const dur = yelp ? 0.32 : this.rng.float(0.11, 0.16);
      const f = yelp ? 900 : this.rng.float(260, 320);
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f * (yelp ? 1.3 : 1.25), t);
      osc.frequency.exponentialRampToValueAtTime(f * (yelp ? 0.55 : 0.7), t + dur);
      const formant = ctx.createBiquadFilter();
      formant.type = 'bandpass';
      formant.Q.value = 3;
      formant.frequency.setValueAtTime(yelp ? 2200 : 1100, t);
      formant.frequency.exponentialRampToValueAtTime(yelp ? 1300 : 650, t + dur);
      // a breathy edge
      const noise = ctx.createBufferSource();
      noise.buffer = this.flatNoise;
      const ng = ctx.createGain();
      ng.gain.value = 0.25;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(level, t + 0.012);
      env.gain.setValueAtTime(level, t + dur * 0.35);
      env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(formant);
      noise.connect(ng).connect(formant);
      formant.connect(env).connect(out);
      osc.start(t);
      noise.start(t, this.rng.float(0, 1));
      osc.stop(t + dur + 0.02);
      noise.stop(t + dur + 0.02);
      t += dur + this.rng.float(0.14, 0.26);
    }
  }

  /** A flock of `n` pigeons clattering up: a rattle of wingbeats that thins out. */
  flutter(dist, pan = 0, n = 8) {
    if (!this.ready) return;
    const level = 0.09 / (1 + dist * dist * 0.008);
    if (level < 0.0015) return;
    const ctx = this.ctx;
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (panner) {
      panner.pan.value = clamp(pan, -1, 1);
      panner.connect(this.master);
    }
    const out = panner ?? this.master;
    const t0 = ctx.currentTime + 0.02;
    // each bird its own burst of claps, staggered as they lift off
    for (let i = 0; i < Math.min(n, 9); i++) {
      const t = t0 + this.rng.float(0, 0.35);
      const dur = this.rng.float(0.7, 1.3);
      const rate = this.rng.float(9, 13);
      const noise = ctx.createBufferSource();
      noise.buffer = this.flatNoise;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = this.rng.float(900, 1600);
      band.Q.value = 0.9;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t);
      // the claps: a sharp gain spike every wingbeat, fading
      const beats = Math.floor(dur * rate);
      const each = level / Math.sqrt(Math.min(n, 9));
      for (let k = 0; k < beats; k++) {
        const bt = t + k / rate;
        const g = each * (1 - k / beats) * this.rng.float(0.6, 1);
        env.gain.setValueAtTime(0.0001, bt);
        env.gain.linearRampToValueAtTime(g, bt + 0.008);
        env.gain.exponentialRampToValueAtTime(0.0001, bt + 0.05);
      }
      noise.connect(band).connect(env).connect(out);
      noise.start(t, this.rng.float(0, 1));
      noise.stop(t + dur + 0.1);
    }
  }

  /** A pigeon's soft throaty coo, `dist` m away. */
  coo(dist, pan = 0) {
    if (!this.ready) return;
    const level = 0.03 / (1 + dist * dist * 0.02);
    if (level < 0.0015) return;
    const ctx = this.ctx;
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (panner) {
      panner.pan.value = clamp(pan, -1, 1);
      panner.connect(this.master);
    }
    const out = panner ?? this.master;
    let t = ctx.currentTime + 0.03;
    const base = this.rng.float(330, 390);
    // "croo-oo-oo": a swelling note, then two falling ones
    for (const [len, from, to] of [
      [0.32, 0.92, 1.08],
      [0.22, 1.02, 0.86],
      [0.26, 0.98, 0.8],
    ]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(base * from, t);
      osc.frequency.exponentialRampToValueAtTime(base * to, t + len);
      // the throaty burr
      const trem = ctx.createOscillator();
      trem.frequency.value = 28;
      const tg = ctx.createGain();
      tg.gain.value = 0.35;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(level, t + len * 0.4);
      env.gain.exponentialRampToValueAtTime(0.0001, t + len);
      trem.connect(tg).connect(env.gain);
      osc.connect(env).connect(out);
      osc.start(t);
      trem.start(t);
      osc.stop(t + len + 0.02);
      trem.stop(t + len + 0.02);
      t += len + 0.04;
    }
  }

  /** Out to a panner at `pan`, or straight to the master. */
  #out(pan) {
    const ctx = this.ctx;
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (!panner) return this.master;
    panner.pan.value = clamp(pan, -1, 1);
    panner.connect(this.master);
    return panner;
  }

  /** A rusty swing pivot at the end of a swing: a squeal gliding down,
   * louder the higher it goes (`strength` 0..1). */
  creak(strength = 0.5, dist = 0, pan = 0) {
    if (!this.ready) return;
    const level = (0.012 + 0.028 * clamp(strength, 0, 1)) / (1 + dist * dist * 0.05);
    if (level < 0.0015) return;
    const ctx = this.ctx;
    const out = this.#out(pan);
    const t = ctx.currentTime + 0.01;
    const base = this.rng.float(780, 1050);
    for (const [at, len, f] of [
      [0, 0.16, base],
      [0.13, 0.22, base * 0.82],
    ]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f * 1.12, t + at);
      osc.frequency.exponentialRampToValueAtTime(f, t + at + len);
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = f * 1.6;
      band.Q.value = 3.5;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t + at);
      env.gain.exponentialRampToValueAtTime(level, t + at + 0.03);
      env.gain.exponentialRampToValueAtTime(0.0001, t + at + len);
      osc.connect(band).connect(env).connect(out);
      osc.start(t + at);
      osc.stop(t + at + len + 0.02);
    }
  }

  /** A pebble on new ice: the sheet sings, a falling "pew" that rings on
   * (the high notes outrun the low along the ice), softer with every hop. */
  iceSing(level = 1) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.01;
    const peak = 0.05 * clamp(level, 0, 1);
    if (peak < 0.002) return;
    const delay = ctx.createDelay(0.5);
    delay.delayTime.value = 0.07;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.45;
    delay.connect(feedback).connect(delay);
    delay.connect(this.master);
    for (const [at, f0, f1, len, k] of [
      [0, 3400, 520, 0.22, 1],
      [0.03, 2600, 380, 0.3, 0.55],
    ]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f0, t + at);
      osc.frequency.exponentialRampToValueAtTime(f1, t + at + len);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t + at);
      env.gain.exponentialRampToValueAtTime(peak * k, t + at + 0.008);
      env.gain.exponentialRampToValueAtTime(0.0001, t + at + len);
      osc.connect(env);
      env.connect(this.master);
      env.connect(delay);
      osc.start(t + at);
      osc.stop(t + at + len + 0.02);
    }
    // the knock of the stone itself
    this.burst({ time: t, freq: 1800, q: 1.2, duration: 0.04, level: peak * 0.6 });
    // the echo loop would ring on forever, unheard: cut it once it has died away
    setTimeout(() => {
      delay.disconnect();
      feedback.disconnect();
    }, 2000);
  }

  /** The kettle on the stove, all 0..1: the hiss of the gas, the rumble of
   * the water coming to the boil, and the whistle on the spout. The nodes
   * are built the first time, then only their levels follow. */
  kettle({ gas = 0, boil = 0, whistle = 0 } = {}) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    if (!this.kettleNodes) {
      if (gas + boil + whistle <= 0) return;
      const hiss = ctx.createBufferSource();
      hiss.buffer = this.flatNoise;
      hiss.loop = true;
      const hissFilter = ctx.createBiquadFilter();
      hissFilter.type = 'bandpass';
      hissFilter.frequency.value = 2400;
      hissFilter.Q.value = 0.8;
      const gasGain = ctx.createGain();
      gasGain.gain.value = 0;
      hiss.connect(hissFilter).connect(gasGain).connect(this.master);
      const rumble = ctx.createBufferSource();
      rumble.buffer = this.noise;
      rumble.loop = true;
      const rumbleFilter = ctx.createBiquadFilter();
      rumbleFilter.type = 'lowpass';
      rumbleFilter.frequency.value = 380;
      const boilGain = ctx.createGain();
      boilGain.gain.value = 0;
      rumble.connect(rumbleFilter).connect(boilGain).connect(this.master);
      // the whistle: two close tones beating, with a wobble in the pitch
      const whistleGain = ctx.createGain();
      whistleGain.gain.value = 0;
      whistleGain.connect(this.master);
      const tones = [2150, 2185].map((f) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = f;
        osc.connect(whistleGain);
        return osc;
      });
      const wobble = ctx.createOscillator();
      wobble.frequency.value = 5.5;
      const depth = ctx.createGain();
      depth.gain.value = 18;
      wobble.connect(depth);
      for (const osc of tones) depth.connect(osc.frequency);
      for (const src of [hiss, rumble, wobble, ...tones]) src.start();
      this.kettleNodes = { gasGain, boilGain, whistleGain, tones };
    }
    const n = this.kettleNodes;
    n.gasGain.gain.setTargetAtTime(0.012 * clamp(gas, 0, 1), now, 0.15);
    n.boilGain.gain.setTargetAtTime(0.05 * clamp(boil, 0, 1) ** 2, now, 0.5);
    // it rises as it comes in, from a breathy note to the full shriek
    const w = clamp(whistle, 0, 1);
    n.whistleGain.gain.setTargetAtTime(0.022 * w, now, 0.6);
    n.tones[0].frequency.setTargetAtTime(1700 + 450 * w, now, 0.8);
    n.tones[1].frequency.setTargetAtTime(1730 + 455 * w, now, 0.8);
  }

  /** An icicle shattering on the ground `dist` m away: a crack, then a
   * scatter of glassy pings as the pieces skitter off. */
  tinkle(dist, pan = 0) {
    if (!this.ready || dist > 60) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.01;
    const level = 0.05 / (1 + dist * dist * 0.02);
    if (level < 0.002) return;
    const out = this.#out(pan);
    this.burst({ time: t, freq: 4200, q: 0.8, duration: 0.05, level: level * 1.2, type: 'highpass', out });
    const pings = this.rng.int(5, 9);
    for (let i = 0; i < pings; i++) {
      const at = t + 0.01 + this.rng.float(0, 0.35) * (i / pings + 0.1);
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = this.rng.float(2600, 6200);
      const env = ctx.createGain();
      const peak = level * this.rng.float(0.25, 0.7);
      const len = this.rng.float(0.05, 0.16);
      env.gain.setValueAtTime(0.0001, at);
      env.gain.exponentialRampToValueAtTime(peak, at + 0.003);
      env.gain.exponentialRampToValueAtTime(0.0001, at + len);
      osc.connect(env).connect(out);
      osc.start(at);
      osc.stop(at + len + 0.02);
    }
  }

  /** A cat's "mrrow", `dist` m away: a nasal voice rising, then falling away. */
  meow(dist, pan = 0) {
    if (!this.ready) return;
    const level = 0.05 / (1 + dist * dist * 0.03);
    if (level < 0.0015) return;
    const ctx = this.ctx;
    const out = this.#out(pan);
    const t = ctx.currentTime + 0.02;
    const len = this.rng.float(0.5, 0.75);
    const f0 = this.rng.float(480, 620);
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f0 * 0.8, t);
    osc.frequency.exponentialRampToValueAtTime(f0 * 1.25, t + len * 0.35);
    osc.frequency.exponentialRampToValueAtTime(f0 * 0.7, t + len);
    // the mouth opening ("m-") and closing ("-ow")
    const mouth = ctx.createBiquadFilter();
    mouth.type = 'bandpass';
    mouth.Q.value = 4;
    mouth.frequency.setValueAtTime(700, t);
    mouth.frequency.exponentialRampToValueAtTime(1800, t + len * 0.4);
    mouth.frequency.exponentialRampToValueAtTime(800, t + len);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(level, t + 0.08);
    env.gain.setValueAtTime(level, t + len * 0.6);
    env.gain.exponentialRampToValueAtTime(0.0001, t + len);
    osc.connect(mouth).connect(env).connect(out);
    osc.start(t);
    osc.stop(t + len + 0.02);
  }

  /** Purring for `secs` s: a low rumble, in on the breath and out again. */
  purr(dist, pan = 0, secs = 3) {
    if (!this.ready) return;
    const level = 0.07 / (1 + dist * dist * 0.08);
    if (level < 0.0015) return;
    const ctx = this.ctx;
    const out = this.#out(pan);
    const t = ctx.currentTime + 0.02;
    const breaths = Math.max(1, Math.round(secs / 0.9));
    for (let i = 0; i < breaths; i++) {
      const at = t + i * 0.9;
      const len = i % 2 ? 0.5 : 0.36;
      const src = ctx.createBufferSource();
      src.buffer = this.flatNoise;
      const low = ctx.createBiquadFilter();
      low.type = 'lowpass';
      low.frequency.value = 180;
      // the rattle: the noise chopped ~26 times a second
      const am = ctx.createOscillator();
      am.type = 'square';
      am.frequency.value = i % 2 ? 24 : 27;
      const amg = ctx.createGain();
      amg.gain.value = 0.5;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, at);
      env.gain.exponentialRampToValueAtTime(level, at + 0.08);
      env.gain.exponentialRampToValueAtTime(0.0001, at + len);
      am.connect(amg).connect(env.gain);
      src.connect(low).connect(env).connect(out);
      src.start(at, this.rng.float(0, 1));
      am.start(at);
      src.stop(at + len + 0.02);
      am.stop(at + len + 0.02);
    }
  }

  /** A cat hissing at the dog. */
  catHiss(dist, pan = 0) {
    if (!this.ready) return;
    const level = 0.06 / (1 + dist * dist * 0.03);
    if (level < 0.0015) return;
    const t = this.ctx.currentTime + 0.02;
    this.burst({ time: t, freq: 5200, q: 0.7, duration: 0.6, level, type: 'highpass', out: this.#out(pan) });
  }

  /** A crow's caw: two or three hoarse "kraa"s, `dist` m away. */
  caw(dist, pan = 0) {
    if (!this.ready) return;
    const level = 0.05 / (1 + dist * dist * 0.004);
    if (level < 0.0015) return;
    const ctx = this.ctx;
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (panner) {
      panner.pan.value = clamp(pan, -1, 1);
      panner.connect(this.master);
    }
    const out = panner ?? this.master;
    let t = ctx.currentTime + 0.05;
    const calls = this.rng.int(2, 3);
    const base = this.rng.float(520, 700);
    for (let i = 0; i < calls; i++) {
      const dur = this.rng.float(0.22, 0.32);
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(base * 1.12, t);
      osc.frequency.exponentialRampToValueAtTime(base * 0.82, t + dur);
      // hoarse: the voice buzzes through a nasal formant, roughened by
      // a fast tremolo
      const formant = ctx.createBiquadFilter();
      formant.type = 'bandpass';
      formant.frequency.value = 1300;
      formant.Q.value = 2.5;
      const rough = ctx.createGain();
      const lfo = ctx.createOscillator();
      lfo.frequency.value = this.rng.float(55, 75);
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.45;
      lfo.connect(lfoGain).connect(rough.gain);
      rough.gain.value = 0.55;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(level, t + 0.03);
      env.gain.setValueAtTime(level, t + dur * 0.6);
      env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(formant).connect(rough).connect(env).connect(out);
      osc.start(t);
      lfo.start(t);
      osc.stop(t + dur + 0.02);
      lfo.stop(t + dur + 0.02);
      t += dur + this.rng.float(0.12, 0.22);
    }
  }

  /**
   * Per-frame ambience. tv: 0..1 (a stairwell's muffled TVs), car: the
   * nearest moving car { dist, speed, pan, big } or null (big: the bus),
   * crows: [{ dist, pan }].
   */
  ambience(dt, { tv = 0, car = null, crows = [] } = {}) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    // the TV: a new phrase of syllables every couple of seconds
    this.tvGain.gain.setTargetAtTime(0.05 * tv, now, 0.6);
    this.tvMusic.gain.setTargetAtTime(tv > 0 ? 0.035 : 0, now, 1.5);
    if (tv > 0.01 && now > this.tvNext - 0.3) {
      let t = Math.max(now, this.tvNext);
      const words = this.rng.int(4, 11);
      // a new line: sometimes a different speaker
      if (this.rng.chance(0.35)) this.tvPitch = this.rng.chance(0.5) ? this.rng.float(105, 135) : this.rng.float(185, 230);
      for (let i = 0; i < words; i++) {
        const syllables = this.rng.int(1, 3);
        for (let k = 0; k < syllables; k++) {
          const d = this.rng.float(0.07, 0.16);
          this.tvSyllable.gain.setTargetAtTime(this.rng.float(0.5, 1), t, 0.015);
          this.tvSyllable.gain.setTargetAtTime(0.03, t + d, 0.03);
          // a vowel, and the speaker's pitch drifting along the phrase
          this.tvFormant.frequency.setTargetAtTime(this.rng.float(400, 850), t, 0.02);
          this.tvFormant2.frequency.setTargetAtTime(this.rng.float(1000, 2000), t, 0.02);
          this.tvVoice.frequency.setTargetAtTime(this.tvPitch * this.rng.float(0.88, 1.15), t, 0.04);
          t += d + 0.03;
        }
        t += this.rng.float(0.08, 0.25);
      }
      // a pause between lines, sometimes a longer one
      this.tvNext = t + (this.rng.chance(0.2) ? this.rng.float(1.2, 2.6) : this.rng.float(0.2, 0.6));
    }
    // the car going by
    // (the bus: a deeper diesel that keeps idling at the stop)
    const carLevel = car ? ((car.big ? 0.1 : 0.07) * clamp(car.speed / 7, car.big ? 0.5 : 0.25, 1)) / (1 + car.dist * car.dist * 0.01) : 0;
    this.carGain.gain.setTargetAtTime(this.indoors ? carLevel * 0.25 : carLevel, now, 0.25);
    if (car) {
      this.carOsc.frequency.setTargetAtTime(car.big ? 24 + car.speed * 3.2 : 30 + car.speed * 4.5, now, 0.3);
      this.tyreFilter.frequency.setTargetAtTime(300 + car.speed * 90, now, 0.3);
      if (this.carPanner) this.carPanner.pan.setTargetAtTime(clamp(car.pan, -1, 1), now, 0.2);
    }
    // crows: a caw from one of them now and then, if any is near enough
    this.nextCaw -= dt;
    if (this.nextCaw <= 0) {
      this.nextCaw = this.rng.float(7, 19);
      const near = crows.filter((c) => c.dist < 110);
      if (near.length && !this.indoors) {
        const c = near[this.rng.int(0, near.length - 1)];
        this.caw(c.dist, c.pan);
      }
    }
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
