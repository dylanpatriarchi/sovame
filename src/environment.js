// Atmosphere: sky, lights, fog, stars, clouds, snow/leaves, smoke, wind.
import * as THREE from 'three';
import { clamp, damp, lerp, Rng, smoothstep, TAU } from './util.js';
import { QUALITY, SEASONS, TIME_PRESETS, WORLD, sunDirection } from './config.js';
import { makeLeafTexture, makeSoftCircleTexture, makeSmokeTexture } from './textures.js';
import { Mist } from './world/mist.js';
import { OUTDOOR_LIGHT_LAYER } from './world/interiors.js';

/** Street lamps closer than this to the camera get a real PointLight, from a
 * fixed pool (QUALITY[q].lampLights). On "high" the pool holds 11, the most
 * lamps ever within range of a walkable point: every lamp that should be
 * lit is. */
const LAMP_LIGHT_RANGE = 60;

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
  uniform float uRemnant;
  uniform vec3 uRemnantColor;
  uniform vec3 uRemnantDir;
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 sky = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.62));
    sky = mix(sky, uGround, smoothstep(0.0, -0.22, h));
    float sd = max(dot(d, normalize(uSunDir)), 0.0);
    sky += uSunColor * (pow(sd, 22.0) * 1.4 + pow(sd, 3.0) * 0.22) * uSunGlow;
    // faint warm band left by the set sun, hugging the horizon on its azimuth
    vec3 hd = normalize(vec3(d.x, 0.0, d.z));
    float az = max(dot(hd, normalize(uRemnantDir)), 0.0);
    float band = pow(az, 6.0) * smoothstep(0.3, 0.02, abs(h - 0.02));
    sky += uRemnantColor * band * uRemnant;
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

  dispose() {
    this.points.removeFromParent();
    this.points.geometry.dispose();
    this.points.material.map?.dispose();
    this.points.material.dispose();
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
    this.indoor = 0;
    this.indoorTarget = 0;
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
      remnant: 0,
      stars: 0,
      moon: 0,
      cloudOpacity: 0.6,
      clockMinutes: 18 * 60,
    };
    this.remnantDir = new THREE.Vector3(0, 0, 1);
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
    c.remnant = preset.remnant ?? 0;
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
        uRemnant: { value: 0 },
        uRemnantColor: { value: new THREE.Color(0xc98a5a) },
        uRemnantDir: { value: this.remnantDir },
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
    // decided by the same rule as every frame from the start, so the shaders
    // compiled while loading match the ones the first frames need
    this.sun.castShadow = this.sunCastsShadow();
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

    this.lampLights = [];
    this.lampFlicker = new Float32Array(this.world.lamps.length);
    this.lampOrder = [];
    this.buildLampLights();
  }

  /** The street-lamp light pool. Its size never changes while playing (only
   * with the quality preset): a varying light count would recompile the
   * shader of every lit material each time a lamp came into range. */
  buildLampLights() {
    const count = (QUALITY[this.quality] ?? QUALITY.high).lampLights;
    while (this.lampLights.length > count) this.lampLights.pop().removeFromParent();
    while (this.lampLights.length < count) {
      const light = new THREE.PointLight(0xff9d3c, 0, 30, 2);
      light.layers.set(OUTDOOR_LIGHT_LAYER);
      this.scene.add(light);
      this.lampLights.push(light);
    }
  }

  sunCastsShadow() {
    // NB: `this.sunIntensity` is never assigned (the value lives in
    // this.cur.sunIntensity), so this has always been false and the sun has
    // never cast a shadow. Kept as is: turning shadows on is a visual change.
    return this.sunIntensity > 0.16 && this.cur.elevation > 2 && this.quality !== 'low';
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

  buildWeather() {
    for (const layer of [...(this.snowLayers ?? []), ...(this.leaf ? [this.leaf] : [])]) layer.dispose();
    const q = (QUALITY[this.quality] ?? QUALITY.high).snow;
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

  /** Inside a stairwell the snowfall, leaves and ground mist fade out. */
  setIndoors(on) {
    this.indoorTarget = on ? 1 : 0;
  }

  setQuality(q) {
    if (q === this.quality) return;
    this.quality = q;
    this.buildLampLights();
    this.buildWeather();
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
    this.indoor = damp(this.indoor, this.indoorTarget, 5, dt);

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
    c.remnant = damp(c.remnant, target.remnant ?? 0, rate, dt);
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
    this.sun.castShadow = this.sunCastsShadow();
    const dist = 90;
    const px = camera ? Math.round(camera.position.x / 4) * 4 : 0;
    const pz = camera ? Math.round(camera.position.z / 4) * 4 : 0;
    this.sun.position.set(px + this.sunDir.x * dist, Math.max(10, this.sunDir.y * dist), pz + this.sunDir.z * dist);
    this.sunTarget.position.set(px, 0, pz);
    this.sun.shadow.camera.updateProjectionMatrix();

    // sky
    this.skyMat.uniforms.uSunDir.value.copy(this.sunDir);
    this.skyMat.uniforms.uSunGlow.value = c.sunGlow;
    // warm remnant band: pinned to the sunset azimuth, flat on the horizon
    const azRad = c.azimuth * (Math.PI / 180);
    this.remnantDir.set(Math.sin(azRad), 0, Math.cos(azRad)).normalize();
    this.skyMat.uniforms.uRemnant.value = c.remnant;

    // fog and exposure
    this.applyFog();
    this.renderer.toneMappingExposure = damp(this.renderer.toneMappingExposure, target.exposure ?? 1, rate, dt);

    // stars and moon
    this.starMat.opacity = c.stars;
    this.moonMat.opacity = c.moon * 0.9;
    // the sky dome, the stars and the moon travel with the camera: out on the
    // steppe highway it goes further from the district than their radius
    const ox = camera ? camera.position.x : 0;
    const oz = camera ? camera.position.z : 0;
    this.sky.position.set(ox, 0, oz);
    this.stars.position.set(ox, 0, oz);
    this.moon.position.set(ox + this.sunDir.x * -780, Math.abs(this.sunDir.y) * 500 + 120, oz + this.sunDir.z * -780);

    // clouds
    for (const cloud of this.clouds) {
      cloud.sprite.position.x += this.wind.x * cloud.speed * dt * 1.2;
      cloud.sprite.position.z += this.wind.z * cloud.speed * dt * 1.2;
      if (cloud.sprite.position.x > ox + 760) cloud.sprite.position.x -= 1520;
      if (cloud.sprite.position.x < ox - 760) cloud.sprite.position.x += 1520;
      if (cloud.sprite.position.z > oz + 760) cloud.sprite.position.z -= 1520;
      if (cloud.sprite.position.z < oz - 760) cloud.sprite.position.z += 1520;
      cloud.sprite.material.opacity = c.cloudOpacity;
      cloud.sprite.material.color.copy(c.horizon).lerp(new THREE.Color(0xffffff), 0.55);
    }

    // drifting ground mist: density follows the fog preset and season
    const seasonFog = SEASONS[this.season].fogMul;
    const mistDensity = clamp((c.fogDensity * seasonFog - 0.006) / 0.008, 0, 1) * (1 - this.indoor);
    this.mistColor.copy(c.horizon).lerp(new THREE.Color(0xffffff), 0.4);
    this.mist.update(dt, t, this.wind, camera.position, mistDensity, this.mistColor);

    // street lamps and windows
    const lampWarm = new THREE.Color(0xffb066);
    const lampDark = new THREE.Color(0x2a2c2c);
    this.world.lampMats.head.emissiveIntensity = c.lamp * 2.4;
    this.world.lampMats.glass.color.copy(lampDark).lerp(new THREE.Color(0xfff0d0), clamp(c.lamp * 1.2, 0, 1));
    // far northern micro-props appear only once the camera walks north of
    // the historic crossroad (the title dolly never does)
    if (camera) {
      this.world.farDetails.visible = camera.position.z > 48;
      this.world.westDetails.visible = camera.position.x < -64;
      this.world.southDetails.visible = camera.position.z < -60;
      this.world.highwayDetails.visible = camera.position.x > 60;
    }
    // only lamps near the camera borrow a real PointLight from the pool,
    // nearest first; the rest rely on the glow
    const camX = camera ? camera.position.x : 0;
    const camZ = camera ? camera.position.z : 0;
    const order = this.lampOrder;
    order.length = 0;
    this.world.lamps.forEach((lamp, i) => {
      const flicker = 0.94 + 0.06 * Math.sin(t * 7.3 + i * 2.1) + 0.03 * Math.sin(t * 23.1 + i);
      this.lampFlicker[i] = flicker;
      lamp.dist2 = (lamp.group.position.x - camX) ** 2 + (lamp.group.position.z - camZ) ** 2;
      if (lamp.dist2 < LAMP_LIGHT_RANGE * LAMP_LIGHT_RANGE) order.push(i);
      lamp.glow.material.opacity = c.lamp * 0.5 * flicker;
      lamp.pool.material.opacity = c.lamp * 0.3 * flicker;
      lamp.coneMat.opacity = c.lamp * 0.09 * flicker;
    });
    if (order.length > this.lampLights.length) order.sort((a, b) => this.world.lamps[a].dist2 - this.world.lamps[b].dist2);
    this.lampLights.forEach((light, k) => {
      const i = order[k];
      if (i === undefined) {
        light.intensity = 0;
        return;
      }
      light.position.copy(this.world.lamps[i].lightPos);
      light.intensity = c.lamp * 95 * this.lampFlicker[i];
    });
    // the factory beacon light sits on the chimney nearest to the camera
    if (this.world.beacon) {
      let best = Infinity;
      for (const spot of this.world.beacon.spots) {
        const d = (spot.x - camX) ** 2 + (spot.z - camZ) ** 2;
        if (d < best) {
          best = d;
          this.world.beacon.light.position.copy(spot);
        }
      }
    }
    this.world.setWindowLit(c.windowLit * 0.95);
    // entrance porches follow the street lamps; facades get a faint night lift
    this.world.porches?.update(c.lamp, camX, camZ, this.indoor > 0.5);
    if (this.world.facadeLift) this.world.facadeLift.value = 0.075 * clamp((1.05 - c.hemiIntensity) / 0.5, 0, 1) * c.lamp;
    // TV windows: slow cool flicker, gated by the window-light preset
    const tvGate = smoothstep(0.25, 0.5, c.windowLit);
    for (const tv of this.world.tvMats) {
      const wob = Math.sin(t * tv.speed + tv.phase) * Math.sin(t * tv.speed * 0.37 + tv.phase * 1.7);
      const dip = Math.sin(t * 0.31 + tv.phase * 2.3) > 0.93 ? 0.3 : 1;
      tv.mat.opacity = tvGate * (0.22 + 0.14 * wob) * dip;
    }
    // notice boards and posters: slightly backlit when the street lamps turn on
    for (const mat of this.world.posterMats) mat.emissiveIntensity = 0.1 + 0.45 * c.lamp;
    this.ambientLevel = c.lamp;

    // kiosk always lit, brighter in the evening
    if (this.world.kiosk) {
      const level = 0.35 + 0.65 * clamp(c.lamp + 0.15, 0, 1);
      this.world.kiosk.light.intensity = 3 + 9 * level;
      this.world.kiosk.glow.material.opacity = 0.08 + 0.22 * level;
      // the same hours the counter keeps (8:00 to 20:00): shut, the tube is off
      const k = this.world.kiosk;
      const m = (this.cur.clockMinutes ?? 12 * 60) % 1440;
      const open = m >= 8 * 60 && m < 20 * 60;
      const map = open ? k.openTex : k.shutTex;
      if (map && k.windowMat.map !== map) k.windowMat.map = map;
      const lit = open ? level : 0.3 * level;
      k.light.intensity *= open ? 1 : 0.25;
      k.glow.material.opacity *= open ? 1 : 0.35;
      // the texture carries the colours: the tint only warms and dims it
      k.windowMat.color.setRGB(0.3 + 0.75 * lit, 0.28 + 0.62 * lit, 0.24 + 0.42 * lit);
    }
    if (this.world.garlandMats) {
      // the fir lights turn on only when the street lamps are on
      this.world.garlandLevel = clamp(c.lamp * 1.2, 0, 1);
    }

    // precipitation
    this.snowLayers.forEach((layer) => {
      const visibleFrac = clamp(layer.density, 0, 1) * (1 - this.indoor);
      const shown = Math.max(0, Math.floor(layer.count * visibleFrac));
      layer.points.geometry.setDrawRange(0, shown);
      layer.update(dt, t, camera.position, this.wind, 1.6, 1);
    });
    const leafFrac = clamp(this.leaf.density, 0, 1) * (1 - this.indoor);
    if (this.leaf.points.visible) {
      this.leaf.points.geometry.setDrawRange(0, Math.max(0, Math.floor(this.leaf.count * leafFrac)));
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
