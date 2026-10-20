// Interface: settings panels, HUD, zone captions.
import { SEASONS, TIME_PRESETS } from './config.js';

export class UI {
  constructor({ settings, onChange, onStart, onResume, onQuit, sound }) {
    this.settings = settings;
    this.onChange = onChange;
    this.onStart = onStart;
    this.onResume = onResume;
    this.onQuit = onQuit;
    this.sound = sound;
    this.controlSets = [];
    this.currentZone = null;
    this.zoneTimer = null;

    const q = (id) => document.getElementById(id);
    this.el = {
      hud: q('hud'),
      crosshair: q('crosshair'),
      zone: q('zone'),
      zoneName: q('zone').querySelector('.zone-name'),
      zoneSub: q('zone').querySelector('.zone-sub'),
      clock: document.querySelector('#status .clock'),
      meta: document.querySelector('#status .meta'),
      temp: document.querySelector('#status .temp'),
      hints: q('hints'),
      prompt: q('prompt'),
      start: q('start'),
      pause: q('pause'),
      loading: q('loading'),
      fatal: q('fatal'),
      bar: document.querySelector('#loading .bar > span'),
      step: document.querySelector('#loading .step'),
      deviceNote: q('device-note'),
    };

    q('panel-start-fields').appendChild(this.createFields());
    q('panel-pause-fields').appendChild(this.createFields());
    this.sync();

    q('btn-start').addEventListener('click', () => {
      this.sound?.ui('confirm');
      this.onStart?.();
    });
    q('btn-resume').addEventListener('click', () => {
      this.sound?.ui('confirm');
      this.onResume?.();
    });
    q('btn-quit').addEventListener('click', () => {
      this.sound?.ui('tick');
      this.onQuit?.();
    });

    if (window.matchMedia('(pointer: coarse)').matches) {
      this.el.deviceNote.textContent = 'Best with mouse and keyboard: touch control is limited.';
    }
    setTimeout(() => this.el.hints.classList.add('fade'), 20000);
  }

  /* -------------------------------------------------- controls */

  createField(label, control, valueText) {
    const field = document.createElement('div');
    field.className = 'field';
    const labelEl = document.createElement('div');
    labelEl.className = 'field-label';
    const span = document.createElement('span');
    span.textContent = label;
    const value = document.createElement('span');
    value.className = 'value';
    value.textContent = valueText ?? '';
    labelEl.append(span, value);
    field.append(labelEl, control);
    field.dataset.valueSlot = '';
    return { field, value };
  }

  createFields() {
    const frag = document.createDocumentFragment();
    const slots = {};

    // season
    {
      const chips = document.createElement('div');
      chips.className = 'chips';
      const buttons = [];
      for (const key of ['winter', 'autumn']) {
        const season = SEASONS[key];
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'chip';
        btn.textContent = season.label;
        btn.title = season.hint;
        btn.addEventListener('click', () => this.change('season', key));
        chips.appendChild(btn);
        buttons.push({ btn, key });
      }
      const { field } = this.createField('Season', chips, '');
      frag.appendChild(field);
      slots.season = buttons;
    }

    // time of day
    {
      const chips = document.createElement('div');
      chips.className = 'chips';
      const buttons = [];
      for (const preset of TIME_PRESETS) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'chip';
        btn.textContent = preset.label;
        btn.title = `Time ${preset.clock}`;
        btn.addEventListener('click', () => this.change('time', preset.id));
        chips.appendChild(btn);
        buttons.push({ btn, key: preset.id });
      }
      const { field } = this.createField('Time of day', chips, '');
      frag.appendChild(field);
      slots.time = buttons;
    }

    // snow
    {
      const input = document.createElement('input');
      input.type = 'range';
      input.min = '0';
      input.max = '1.4';
      input.step = '0.05';
      input.addEventListener('input', () => this.change('snow', Number(input.value), true));
      const { field, value } = this.createField('Snow', input);
      frag.appendChild(field);
      slots.snow = { input, value };
    }

    // volume
    {
      const input = document.createElement('input');
      input.type = 'range';
      input.min = '0';
      input.max = '1';
      input.step = '0.05';
      input.addEventListener('input', () => this.change('volume', Number(input.value), true));
      const { field, value } = this.createField('Volume', input);
      frag.appendChild(field);
      slots.volume = { input, value };
    }

    // sensitivity
    {
      const input = document.createElement('input');
      input.type = 'range';
      input.min = '0.4';
      input.max = '2';
      input.step = '0.1';
      input.addEventListener('input', () => this.change('sensitivity', Number(input.value), true));
      const { field, value } = this.createField('Mouse sensitivity', input);
      frag.appendChild(field);
      slots.sensitivity = { input, value };
    }

    // quality
    {
      const select = document.createElement('select');
      select.className = 'chip';
      select.style.width = '100%';
      select.style.background = 'rgba(236,227,211,0.05)';
      select.style.color = 'var(--cream)';
      for (const [value, label] of [['auto', 'Auto'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']]) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        option.style.color = '#12151a';
        select.appendChild(option);
      }
      select.addEventListener('change', () => this.change('quality', select.value));
      const { field } = this.createField('Quality', select, '');
      frag.appendChild(field);
      slots.quality = { select };
    }

    // vertical inversion
    {
      const row = document.createElement('div');
      row.className = 'switch-row';
      const span = document.createElement('span');
      span.textContent = 'Invert Y axis';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.addEventListener('change', () => this.change('invertY', input.checked));
      row.append(span, input);
      const field = document.createElement('div');
      field.className = 'field';
      field.appendChild(row);
      frag.appendChild(field);
      slots.invertY = { input };
    }

    this.controlSets.push(slots);
    const wrapper = document.createElement('div');
    wrapper.appendChild(frag);
    return wrapper;
  }

  change(key, value, live = false) {
    this.settings[key] = value;
    this.onChange?.(key, value, live);
    if (!live) this.sound?.ui('tick');
    this.sync();
  }

  /** Aligns the controls to the current state. */
  sync() {
    const s = this.settings;
    for (const slots of this.controlSets) {
      for (const { btn, key } of slots.season) btn.setAttribute('aria-pressed', String(s.season === key));
      for (const { btn, key } of slots.time) btn.setAttribute('aria-pressed', String(s.time === key));
      slots.snow.input.value = String(s.snow);
      slots.snow.value.textContent = `${Math.round(s.snow * 100)}%`;
      slots.volume.input.value = String(s.volume);
      slots.volume.value.textContent = `${Math.round(s.volume * 100)}%`;
      slots.sensitivity.input.value = String(s.sensitivity);
      slots.sensitivity.value.textContent = `${s.sensitivity.toFixed(1)}×`;
      slots.quality.select.value = s.quality;
      slots.invertY.input.checked = !!s.invertY;
    }
  }

  /* -------------------------------------------------- state */

  setProgress(fraction, label) {
    this.el.bar.style.width = `${Math.round(fraction * 100)}%`;
    if (label) this.el.step.textContent = label;
  }

  hideLoading() {
    this.el.loading.classList.add('hidden');
  }

  showScreen(which) {
    this.el.start.classList.toggle('hidden', which !== 'start');
    this.el.pause.classList.toggle('hidden', which !== 'pause');
    this.el.hud.classList.toggle('hidden', which !== 'none');
    if (which === 'start') {
      const btn = document.getElementById('btn-start');
      if (btn) btn.focus({ preventScroll: true });
    }
    if (which === 'pause') {
      const btn = document.getElementById('btn-resume');
      if (btn) btn.focus({ preventScroll: true });
    }
  }

  setZone(name, sub) {
    if (name === this.currentZone) return;
    this.currentZone = name;
    this.el.zoneName.textContent = name ?? '';
    this.el.zoneSub.textContent = sub ?? '';
    clearTimeout(this.zoneTimer);
    if (!name) {
      this.el.zone.classList.remove('visible');
      return;
    }
    this.el.zone.classList.add('visible');
    this.zoneTimer = setTimeout(() => this.el.zone.classList.remove('visible'), 6000);
  }

  setStatus({ clock, timeLabel, seasonLabel, temp }) {
    this.el.clock.textContent = clock;
    this.el.meta.textContent = `${timeLabel} · ${seasonLabel}`;
    this.el.temp.textContent = `${temp > 0 ? '+' : '−'}${Math.abs(temp)} °C`;
  }

  setPrompt(text) {
    if (text) {
      this.el.prompt.textContent = text;
      this.el.prompt.classList.add('visible');
    } else {
      this.el.prompt.classList.remove('visible');
    }
  }

  setSprinting(on) {
    this.el.crosshair.classList.toggle('sprint', on);
  }

  fatal(error) {
    this.el.loading.classList.add('hidden');
    this.el.start.classList.add('hidden');
    this.el.pause.classList.add('hidden');
    this.el.fatal.classList.remove('hidden');
    this.el.fatal.innerHTML = `
      <h2 style="letter-spacing:.24em;text-transform:uppercase">WebGL not available</h2>
      <p>The game requires WebGL2 and the scene could not be started.</p>
      <pre style="white-space:pre-wrap;color:#8ea3b0">${String(error?.message ?? error ?? '')}</pre>
    `;
  }
}
