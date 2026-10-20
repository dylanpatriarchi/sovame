// Atmosphere: sky, lights, fog, stars, clouds, snow/leaves, smoke, wind.
import * as THREE from 'three';
import { clamp, damp, lerp, Rng, smoothstep, TAU } from './util.js';
import { SEASONS, TIME_PRESETS, WORLD, sunDirection } from './config.js';
import { makeLeafTexture, makeSoftCircleTexture, makeSmokeTexture } from './textures.js';
import { Mist } from './world/mist.js';

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const SKY_FRAG = /* glsl */ `
  varying vec3 vDir;
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uGround;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform float uSunGlow;
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 sky = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.62));
    sky = mix(sky, uGround, smoothstep(0.0, -0.22, h));
    float sd = max(dot(d, normalize(uSunDir)), 0.0);
    sky += uSunColor * (pow(sd, 22.0) * 1.4 + pow(sd, 3.0) * 0.22) * uSunGlow;
    gl_FragColor = vec4(sky, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

class Weather {
  constructor(scene, kind, count, size, opts = {}) {
    this.kind = kind;
    this.count = count;
    this.box = WORLD.snowBox;
    this.rng = new Rng(kind === 'snow' ? 4711 : 4712);
    const positions = new Float32Array(count * 3);
    this.vel = new Float32Array(count);
    this.spin = new Float32Array(count);
    this.state = [];
    for (let i = 0; i < count; i++) {
      positions[i * 3] = this.rng.float(-this.box.w / 2, this.box.w / 2);
      positions[i * 3 + 1] = this.rng.float(0, this.box.h);
      positions[i * 3 + 2] = this.rng.float(-this.box.d / 2, this.box.d / 2);
      this.vel[i] = this.rng.float(0.7, 1.6);
      this.spin[i] = this.rng.float(-1, 1);
      this.state.push({ phase: this.rng.float(0, TAU), sway: this.rng.float(0.4, 1.6) });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const tex = opts.leaf ? opts.leafTexture : makeSoftCircleTexture(64, '255,255,255', 2.0);
    const mat = new THREE.PointsMaterial({
      size,
      map: tex,
      transparent: true,
      opacity: opts.opacity ?? 0.9,
      depthWrite: false,
      sizeAttenuation: true,
      color: opts.color ?? 0xffffff,
      alphaTest: 0.02,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.positions = positions;
    scene.add(this.points);
  }

  update(dt, t, cam, wind, fall, sizeScale = 1) {
    const p = this.positions;
    const halfW = this.box.w / 2;
    const halfD = this.box.d / 2;
    for (let i = 0; i < this.count; i++) {
      const ix = i * 3;
      const st = this.state[i];
      let x = p[ix];
      let y = p[ix + 1];
      let z = p[ix + 2];
      const sway = Math.sin(t * st.sway + st.phase) * (this.kind === 'leaf' ? 1.5 : 0.5);
      y -= this.vel[i] * fall * dt;
      x += (wind.x * (1 + sway * 0.4) + sway * 0.35) * dt;
      z += (wind.z * (1 + sway * 0.3) + Math.cos(t * st.sway * 0.7 + st.phase) * 0.3) * dt;
      // recycle around the camera
      const rx = x - cam.x;
      const rz = z - cam.z;
      if (y < -0.3) {
        y += this.box.h;
        x = cam.x + this.rng.float(-halfW, halfW);
        z = cam.z + this.rng.float(-halfD, halfD);
      }
      if (rx > halfW) x -= this.box.w;
      else if (rx < -halfW) x += this.box.w;
      if (rz > halfD) z -= this.box.d;
      else if (rz < -halfD) z += this.box.d;
      p[ix] = x;
      p[ix + 1] = y;
      p[ix + 2] = z;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.material.size = this.baseSize * sizeScale;
  }
}

export class Environment {
  constructor({ scene, renderer, world, time = 'dusk', season = 'winter', snow = 1, quality = 'high' }) {
    this.scene = scene;
    this.renderer = renderer;
    this.world = world;
    this.rng = new Rng(31415);
    this.season = season;
    this.snowSetting = snow;
    this.quality = quality;
    this.wind = { x: 0.6, z: -0.3, gust: 0.5 };
    this.ambientLevel = 1;
    this.timeIndex = Math.max(0, TIME_PRESETS.findIndex((p) => p.id === time));
    this.sunDir = new THREE.Vector3(0, 1, 0);
    // immediately align road surfaces, roofs and canopies with the starting season
    this.world.setSeason(season);

    // interpolated state
    this.cur = {
      zenith: new THREE.Color(),
      horizon: new THREE.Color(),
      ground: new THREE.Color(),
      sunColor: new THREE.Color(),
      hemiSky: new THREE.Color(),
      hemiGround: new THREE.Color(),
      fogColor: new THREE.Color(),
      sunIntensity: 0,
      elevation: 10,
      azimuth: 200,
      sunGlow: 0,
      hemiIntensity: 1,
      fogDensity: 0.01,
      lamp: 0,
      windowLit: 0,
      stars: 0,
      moon: 0,
      cloudOpacity: 0.6,
      clockMinutes: 18 * 60,
    };
    const start = TIME_PRESETS[this.timeIndex];
    this.snapTo(start);
    this.buildSky();
    this.buildLights();
    this.buildStars();
    this.buildClouds();
    this.buildMist();
    this.buildWeather();
    this.buildSmoke();
    this.applyFog();
  }

  snapTo(preset) {
    const c = this.cur;
    c.zenith.setHex(preset.sky.zenith);
    c.horizon.setHex(preset.fog.color);
    c.ground.setHex(preset.sky.ground);
    c.sunColor.setHex(preset.sun.color);
    c.hemiSky.setHex(preset.hemi.sky);
    c.hemiGround.setHex(preset.hemi.ground);
    c.fogColor.setHex(preset.fog.color);
    c.sunIntensity = preset.sun.intensity;
    c.elevation = preset.sun.elevation;
    c.azimuth = preset.sun.azimuth;
    c.sunGlow = preset.sun.glow;
    c.hemiIntensity = preset.hemi.intensity;
    c.fogDensity = preset.fog.density;
    c.lamp = preset.lamp;
    c.windowLit = preset.windowLit;
    c.stars = preset.stars;
    c.moon = preset.moon;
    c.cloudOpacity = 0.55 + preset.stars * 0.25;
    c.clockMinutes = Environment.parseClock(preset.clock);
  }

  static parseClock(clock) {
    const [h, m] = clock.split(':').map(Number);
    return h * 60 + m;
  }

  get preset() {
    return TIME_PRESETS[this.timeIndex];
  }

  get clock() {
    const total = Math.round(this.cur.clockMinutes) % 1440;
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  get temperature() {
    const base = this.preset.baseTemp + SEASONS[this.season].tempShift;
    return Math.round(base + this.cur.stars * -1.5);
  }

  get timeLabel() {
    return this.preset.label;
  }

  /* ------------------------------------------------------------ build */

  buildSky() {
    const geo = new THREE.SphereGeometry(880, 32, 18);
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uZenith: { value: this.cur.zenith },
        uHorizon: { value: this.cur.horizon },
        uGround: { value: this.cur.ground },
        uSunColor: { value: this.cur.sunColor },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunGlow: { value: 0 },
      },
    });
    this.sky = new THREE.Mesh(geo, this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);
  }

  buildLights() {
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xffffff, 1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(this.quality === 'high' ? 2048 : 1024, this.quality === 'high' ? 2048 : 1024);
    const cam = this.sun.shadow.camera;
    cam.left = -58;
    cam.right = 58;
    cam.top = 58;
    cam.bottom = -58;
    cam.near = 1;
    cam.far = 220;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun);
    this.sunTarget = new THREE.Object3D();
    this.scene.add(this.sunTarget);
    this.sun.target = this.sunTarget;

    this.ambient = new THREE.AmbientLight(0xffffff, 0.08);
    this.scene.add(this.ambient);
  }

  buildStars() {
    const count = 1400;
    const rng = new Rng(808);
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3(rng.float(-1, 1), rng.float(0.02, 1), rng.float(-1, 1)).normalize().multiplyScalar(820);
      positions[i * 3] = v.x;
      positions[i * 3 + 1] = v.y;
      positions[i * 3 + 2] = v.z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.starMat = new THREE.PointsMaterial({
      size: 2.6,
      sizeAttenuation: false,
      map: makeSoftCircleTexture(32, '255,255,255', 2.0),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      color: 0xd6e4ff,
      fog: false,
    });
    this.stars = new THREE.Points(geo, this.starMat);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -9;
    this.scene.add(this.stars);

    this.moonMat = new THREE.SpriteMaterial({
      map: makeSoftCircleTexture(128, '236,244,255', 1.6),
      color: 0xdfe9ff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    });
    this.moon = new THREE.Sprite(this.moonMat);
    this.moon.scale.set(90, 90, 1);
    this.moon.renderOrder = -8;
    this.scene.add(this.moon);
  }

  buildClouds() {
    this.clouds = [];
    const tex = makeSmokeTexture(256);
    const rng = new Rng(606);
    for (let i = 0; i < 14; i++) {
      const mat = new THREE.SpriteMaterial({ map: tex, color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false, fog: false });
      const sprite = new THREE.Sprite(mat);
      const s = rng.float(180, 420);
      sprite.scale.set(s, s * rng.float(0.35, 0.55), 1);
      sprite.position.set(rng.float(-700, 700), rng.float(130, 220), rng.float(-700, 700));
      sprite.renderOrder = -7;
      this.scene.add(sprite);
      this.clouds.push({ sprite, speed: rng.float(0.4, 1.1) });
    }
  }

  buildMist() {
    this.mist = new Mist(this.scene);
    this.mistColor = new THREE.Color();
  }

  buildWeather() {    const q = this.quality === 'high' ? 1 : 0.55;
    this.snowLayers = [
      new Weather(this.scene, 'snow', Math.round(2200 * q), 0.11, { opacity: 0.95, color: 0xf2f7ff }),
      new Weather(this.scene, 'snow', Math.round(1200 * q), 0.2, { opacity: 0.7, color: 0xe8f0ff }),
    ];
    this.leaf = new Weather(this.scene, 'leaf', Math.round(220 * q), 0.34, {
      opacity: 0.95,
      color: 0xffffff,
      leafTexture: makeLeafTexture(),
    });
    for (const layer of this.snowLayers) layer.baseSize = layer.points.material.size;
    this.leaf.baseSize = this.leaf.points.material.size;
    this.updateWeatherDensity(false);
  }

  buildSmoke() {
    const tex = makeSmokeTexture(192);
    this.spritePool = [];
    const rng = new Rng(9090);
    this.smokeAnchor = this.world.points.chimney ? this.world.points.chimney.clone() : new THREE.Vector3(-76, 24.6, -64);
    for (let i = 0; i < 26; i++) {
      const mat = new THREE.SpriteMaterial({ map: tex, color: 0x9aa3ad, transparent: true, opacity: 0, depthWrite: false });
      const sprite = new THREE.Sprite(mat);
      sprite.position.copy(this.smokeAnchor);
      this.scene.add(sprite);
      this.spritePool.push({
        sprite,
        life: rng.float(0, 1),
        speed: rng.float(1.4, 2.6),
        size: rng.float(3, 6),
        drift: rng.float(-1, 1),
      });
    }
  }

  applyFog() {
    const season = SEASONS[this.season];
    if (!this.scene.fog) this.scene.fog = new THREE.FogExp2(this.cur.fogColor.getHex(), this.cur.fogDensity * season.fogMul);
    this.scene.fog.color.copy(this.cur.fogColor);
    this.scene.fog.density = this.cur.fogDensity * season.fogMul;
  }

  /* ------------------------------------------------------------ API */

  setTime(id) {
    const idx = TIME_PRESETS.findIndex((p) => p.id === id);
    if (idx >= 0) this.timeIndex = idx;
  }

  setSeason(id) {
    if (!SEASONS[id]) return;
    this.season = id;
    this.world.setSeason(id);
    this.updateWeatherDensity();
  }

  setSnowAmount(value) {
    this.snowSetting = clamp(value, 0, 1.5);
    this.updateWeatherDensity();
  }

  setQuality(q) {
    this.quality = q;
  }

  updateWeatherDensity(animate = true) {
    const season = SEASONS[this.season];
    const factor = season.snowAmount * this.snowSetting;
    this.snowFactor = factor;
    this.snowLayers.forEach((layer, i) => {
      const frac = i === 0 ? 0.65 : 0.35;
      layer.points.visible = factor > 0.02;
      layer.points.material.opacity = (i === 0 ? 0.95 : 0.7) * smoothstep(0, 0.35, factor);
      layer.density = frac * factor;
    });
    const leafFactor = season.leavesAmount * (this.snowSetting > 0 ? 1 : 0.6);
    this.leaf.points.visible = leafFactor > 0.05;
    this.leaf.density = leafFactor;
    this.leaf.points.material.opacity = smoothstep(0, 0.3, leafFactor) * 0.95;
  }

  /* ------------------------------------------------------------ update */

  update(dt, elapsed, camera) {
    const target = this.preset;
    const c = this.cur;
    const rate = 1.5;

    c.zenith.lerp(new THREE.Color(target.sky.zenith), 1 - Math.exp(-rate * dt));
    c.horizon.lerp(new THREE.Color(target.fog.color), 1 - Math.exp(-rate * dt));
    c.ground.lerp(new THREE.Color(target.sky.ground), 1 - Math.exp(-rate * dt));
    c.sunColor.lerp(new THREE.Color(target.sun.color), 1 - Math.exp(-rate * dt));
    c.hemiSky.lerp(new THREE.Color(target.hemi.sky), 1 - Math.exp(-rate * dt));
    c.hemiGround.lerp(new THREE.Color(target.hemi.ground), 1 - Math.exp(-rate * dt));
    c.fogColor.lerp(new THREE.Color(target.fog.color), 1 - Math.exp(-rate * dt));
    c.sunIntensity = damp(c.sunIntensity, target.sun.intensity, rate, dt);
    c.elevation = damp(c.elevation, target.sun.elevation, rate, dt);
    c.azimuth = damp(c.azimuth, target.sun.azimuth, rate, dt);
    c.sunGlow = damp(c.sunGlow, target.sun.glow, rate, dt);
    c.hemiIntensity = damp(c.hemiIntensity, target.hemi.intensity, rate, dt);
    c.fogDensity = damp(c.fogDensity, target.fog.density, rate, dt);
    c.lamp = damp(c.lamp, target.lamp, rate, dt);
    c.windowLit = damp(c.windowLit, target.windowLit, rate, dt);
    c.stars = damp(c.stars, target.stars, rate, dt);
    c.moon = damp(c.moon, target.moon, rate, dt);
    c.cloudOpacity = damp(c.cloudOpacity, 0.5 + target.stars * 0.2, rate, dt);
    let diff = Environment.parseClock(target.clock) - c.clockMinutes;
    if (diff > 720) diff -= 1440;
    if (diff < -720) diff += 1440;
    c.clockMinutes = (c.clockMinutes + diff * (1 - Math.exp(-rate * dt)) + 1440) % 1440;

    // sun/moon direction
    const dir = sunDirection({ sun: { elevation: c.elevation, azimuth: c.azimuth } }, {});
    this.sunDir.set(dir.x, dir.y, dir.z).normalize();

    // wind
    const t = elapsed;
    const gustRaw = 0.5 + 0.5 * Math.sin(t * 0.07) * Math.sin(t * 0.031 + 1.7) + 0.3 * Math.sin(t * 0.19 + 0.4);
    this.wind.gust = clamp(gustRaw, 0.08, 1.4);
    const windStrength = SEASONS[this.season].wind * this.wind.gust;
    this.wind.x = Math.cos(t * 0.03) * windStrength * 1.1;
    this.wind.z = Math.sin(t * 0.024 + 1.1) * windStrength * 0.9;

    // lights
    this.hemi.color.copy(c.hemiSky);
    this.hemi.groundColor.copy(c.hemiGround);
    this.hemi.intensity = c.hemiIntensity;
    this.ambient.color.copy(c.hemiSky);
    this.ambient.intensity = 0.05 + c.hemiIntensity * 0.1;
    this.sun.color.copy(c.sunColor);
    this.sun.intensity = c.sunIntensity;
    // With the sun below the horizon (dusk), shadows cast by a grazing
    // light become a black veil over the whole terrain: they get disabled.
    this.sun.castShadow = this.sunIntensity > 0.16 && c.elevation > 2 && this.quality !== 'low';
    const dist = 90;
    const px = camera ? Math.round(camera.position.x / 4) * 4 : 0;
    const pz = camera ? Math.round(camera.position.z / 4) * 4 : 0;
    this.sun.position.set(px + this.sunDir.x * dist, Math.max(10, this.sunDir.y * dist), pz + this.sunDir.z * dist);
    this.sunTarget.position.set(px, 0, pz);
    this.sun.shadow.camera.updateProjectionMatrix();

    // sky
    this.skyMat.uniforms.uSunDir.value.copy(this.sunDir);
    this.skyMat.uniforms.uSunGlow.value = c.sunGlow;

    // fog and exposure
    this.applyFog();
    this.renderer.toneMappingExposure = damp(this.renderer.toneMappingExposure, target.exposure ?? 1, rate, dt);

    // stars and moon
    this.starMat.opacity = c.stars;
    this.moonMat.opacity = c.moon * 0.9;
    this.moon.position.set(this.sunDir.x * -780, Math.abs(this.sunDir.y) * 500 + 120, this.sunDir.z * -780);

    // clouds
    for (const cloud of this.clouds) {
      cloud.sprite.position.x += this.wind.x * cloud.speed * dt * 1.2;
      cloud.sprite.position.z += this.wind.z * cloud.speed * dt * 1.2;
      if (cloud.sprite.position.x > 760) cloud.sprite.position.x = -760;
      if (cloud.sprite.position.x < -760) cloud.sprite.position.x = 760;
      if (cloud.sprite.position.z > 760) cloud.sprite.position.z = -760;
      if (cloud.sprite.position.z < -760) cloud.sprite.position.z = 760;
      cloud.sprite.material.opacity = c.cloudOpacity;
      cloud.sprite.material.color.copy(c.horizon).lerp(new THREE.Color(0xffffff), 0.55);
    }

    // drifting ground mist: density follows the fog preset and season
    const seasonFog = SEASONS[this.season].fogMul;
    const mistDensity = clamp((c.fogDensity * seasonFog - 0.006) / 0.008, 0, 1);
    this.mistColor.copy(c.horizon).lerp(new THREE.Color(0xffffff), 0.4);
    this.mist.update(dt, t, this.wind, camera.position, mistDensity, this.mistColor);

    // street lamps and windows
    const lampWarm = new THREE.Color(0xffb066);
    const lampDark = new THREE.Color(0x2a2c2c);
    this.world.lampMats.head.emissiveIntensity = c.lamp * 2.4;
    this.world.lampMats.glass.color.copy(lampDark).lerp(new THREE.Color(0xfff0d0), clamp(c.lamp * 1.2, 0, 1));
    // only lamps near the camera keep a real PointLight; the rest rely on the glow
    const camX = camera ? camera.position.x : 0;
    const camZ = camera ? camera.position.z : 0;
    this.world.lamps.forEach((lamp, i) => {
      const flicker = 0.94 + 0.06 * Math.sin(t * 7.3 + i * 2.1) + 0.03 * Math.sin(t * 23.1 + i);
      const near = (lamp.group.position.x - camX) ** 2 + (lamp.group.position.z - camZ) ** 2 < 60 * 60;
      lamp.light.visible = near && this.quality !== 'low';
      lamp.light.intensity = c.lamp * 95 * flicker;
      lamp.glow.material.opacity = c.lamp * 0.5 * flicker;
      lamp.pool.material.opacity = c.lamp * 0.3 * flicker;
      lamp.coneMat.opacity = c.lamp * 0.09 * flicker;
    });
    this.world.setWindowLit(c.windowLit * 0.95);
    // notice boards and posters: slightly backlit when the street lamps turn on
    for (const mat of this.world.posterMats) mat.emissiveIntensity = 0.1 + 0.45 * c.lamp;
    this.ambientLevel = c.lamp;

    // kiosk always lit, brighter in the evening
    if (this.world.kiosk) {
      const level = 0.35 + 0.65 * clamp(c.lamp + 0.15, 0, 1);
      this.world.kiosk.light.intensity = 5 + 16 * level;
      this.world.kiosk.glow.material.opacity = 0.22 + 0.5 * level;
      this.world.kiosk.windowMat.color.setRGB(0.22 + 0.78 * level, 0.19 + 0.62 * level, 0.13 + 0.36 * level);
    }
    if (this.world.garlandMats) {
      // the fir lights turn on only when the street lamps are on
      this.world.garlandLevel = clamp(c.lamp * 1.2, 0, 1);
    }

    // precipitation
    this.snowLayers.forEach((layer) => {
      const visibleFrac = clamp(layer.density, 0, 1);
      const shown = Math.max(1, Math.floor(layer.count * visibleFrac));
      layer.points.geometry.setDrawRange(0, shown);
      layer.update(dt, t, camera.position, this.wind, 1.6, 1);
    });
    const leafFrac = clamp(this.leaf.density, 0, 1);
    if (this.leaf.points.visible) {
      this.leaf.points.geometry.setDrawRange(0, Math.max(1, Math.floor(this.leaf.count * leafFrac)));
      this.leaf.update(dt, t, camera.position, this.wind, 0.55, 1);
    }

    // chimney smoke
    for (const puff of this.spritePool) {
      puff.life += dt * 0.085 * puff.speed;
      if (puff.life > 1) puff.life -= 1;
      const life = puff.life;
      puff.sprite.position.set(
        this.smokeAnchor.x + this.wind.x * life * 30 + puff.drift * life * 5,
        this.smokeAnchor.y + life * 48,
        this.smokeAnchor.z + this.wind.z * life * 30 + puff.drift * life * 4
      );
      const scale = puff.size * (0.6 + life * 3.4);
      puff.sprite.scale.set(scale, scale * 0.9, 1);
      puff.sprite.material.opacity = Math.sin(clamp(life, 0, 1) * Math.PI) * 0.34;
      puff.sprite.material.color.copy(this.cur.horizon).lerp(new THREE.Color(0x8f959c), 0.55);
    }
  }
}
