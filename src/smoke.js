// Cigarette spots: a few quiet places where F plays a short first-person
// smoke — hand and cigarette rise into frame, the ember glows on each drag,
// thin smoke drifts with the wind. No mechanics, just the pause.
import * as THREE from 'three';
import { makeSmokeTexture, makeGlowTexture } from './textures.js';
import { clamp, lerp, smoothstep } from './util.js';

const DURATION = 25;
const COOLDOWN = 90;
// drags: [start, hold] in seconds; the hand travels ~0.75 s each way
const DRAGS = [
  [3.0, 1.5],
  [9.2, 1.3],
  [15.0, 1.6],
  [20.4, 1.2],
];
const LIGHT_AT = 1.1;
const LOWER_AT = 23.4;
const TRAVEL = 0.75;

// hand poses in camera space (camera looks down -Z)
const REST = { pos: new THREE.Vector3(0.15, -0.2, -0.36), rot: new THREE.Euler(0.15, -0.35, 0.5) };
// at the lips: hand right under the face, cigarette angled up and away
const MOUTH = { pos: new THREE.Vector3(0.025, -0.125, -0.1), rot: new THREE.Euler(1.0, -0.2, 0.3) };
const LOW = { pos: new THREE.Vector3(0.2, -0.52, -0.3), rot: new THREE.Euler(-0.2, -0.3, 0.6) };
const LIGHTING = { pos: new THREE.Vector3(0.06, -0.14, -0.27), rot: new THREE.Euler(0.45, -0.75, 0.7) };

const PAPER_LEN = 0.062;
const FILTER_LEN = 0.022;
const MAX_PARTICLES = 160;

const ease = (t) => t * t * (3 - 2 * t);

/** Builds the smoke spot list from world points: bench, landing, bus stop. */
export function smokeSpots(world) {
  const spots = [];
  // courtyard bench behind building 12 (sitter faces +z)
  spots.push({
    id: 'smoke:bench',
    x: -27.2,
    z: -15.2,
    radius: 1.9,
    seat: { x: -27.4, z: -15.92, yaw: Math.PI, eyeY: 1.2, pitch: -0.08 },
    stand: { x: -27.4, z: -14.9, yaw: Math.PI },
  });
  // bus stop bench inside the shelter (sitter faces -x, toward the road)
  const bus = world.points.busStop;
  if (bus) {
    spots.push({
      id: 'smoke:bus',
      x: bus.x + 0.2,
      z: bus.z,
      radius: 2.2,
      seat: { x: bus.x + 0.86, z: bus.z + 0.4, yaw: Math.PI / 2, eyeY: 1.68, pitch: -0.05 },
      stand: { x: bus.x - 0.2, z: bus.z + 0.4, yaw: Math.PI / 2 },
    });
  }
  // stairwell landing window, standing (the courtyard stairwell of building 7)
  const interior = world.interiors.find((i) => i.id === 'b7-court') ?? world.interiors[0];
  if (interior) {
    const cx = (interior.bounds.x0 + interior.bounds.x1) / 2;
    const cz = (interior.bounds.z0 + interior.bounds.z1) / 2;
    spots.push({
      id: 'smoke:landing',
      x: cx,
      z: cz + 2.6,
      y: world.heightAt(cx, cz + 2.6), // only on the landing, not from the floor below
      radius: 2.3,
      seat: { x: cx + 0.35, z: cz + 2.28, yaw: Math.PI, eyeY: null, pitch: -0.2 },
      stand: null,
      indoor: true,
    });
  }
  return spots;
}

export class Smoke {
  constructor({ scene, camera, world, env, sound }) {
    this.scene = scene;
    this.camera = camera;
    this.world = world;
    this.env = env;
    this.sound = sound;
    this.active = null;
    this.t = 0;
    this.cooldowns = {};
    this.burn = 0;
    this.glow = 0;
    this.dragIndex = -1;
    this.exhaled = new Set();
    this.tmp = new THREE.Vector3();
    this.tmp2 = new THREE.Vector3();

    // the hand rides on the camera, so the camera has to be in the graph
    if (!camera.parent) scene.add(camera);
    this.buildHand();
    this.buildParticles();
  }

  /* --------------------------------------------------------- props */

  buildHand() {
    const hand = new THREE.Group();
    // faint warm emissive: the ember lights the fingers from below
    const skin = new THREE.MeshStandardMaterial({ color: 0xb08a74, roughness: 0.78, emissive: 0x3a1c0c, emissiveIntensity: 0.25 });
    const sleeve = new THREE.MeshStandardMaterial({ color: 0x24262b, roughness: 0.95, emissive: 0x0b0c10, emissiveIntensity: 1 });
    this.skinMat = skin;

    const palmG = new THREE.CapsuleGeometry(0.034, 0.03, 4, 12);
    palmG.rotateX(Math.PI / 2);
    palmG.scale(1, 0.38, 1);
    const palm = new THREE.Mesh(palmG, skin);
    palm.position.set(0, 0, 0.03);
    hand.add(palm);
    const finger = (len, x, z, bend) => {
      const g = new THREE.CapsuleGeometry(0.0085, len, 3, 8);
      g.rotateX(Math.PI / 2);
      const m = new THREE.Mesh(g, skin);
      m.position.set(x, 0.002, z - len / 2);
      m.rotation.x = bend;
      hand.add(m);
      return m;
    };
    // index and middle hold the cigarette straight out; ring and pinky curl
    finger(0.046, -0.026, -0.008, 0.08);
    finger(0.05, -0.008, -0.01, 0.1);
    finger(0.026, 0.01, -0.006, 0.9).position.y = -0.012;
    finger(0.02, 0.026, -0.004, 1.1).position.y = -0.014;
    const thumbG = new THREE.CapsuleGeometry(0.0095, 0.034, 3, 8);
    thumbG.rotateX(Math.PI / 2);
    const thumb = new THREE.Mesh(thumbG, skin);
    thumb.position.set(-0.043, -0.008, 0.02);
    thumb.rotation.set(0.2, 0.75, 0);
    hand.add(thumb);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.048, 0.22, 12), sleeve);
    cuff.rotation.x = Math.PI / 2;
    cuff.position.set(0, -0.004, 0.18);
    hand.add(cuff);

    // cigarette clamped between index and middle: filter at the fingers
    const cig = new THREE.Group();
    cig.position.set(-0.017, 0.006, -0.03);
    const filterMat = new THREE.MeshStandardMaterial({ color: 0xc58a4e, roughness: 0.7 });
    const paperMat = new THREE.MeshStandardMaterial({ color: 0xe9e6de, roughness: 0.6, emissive: 0x151515 });
    const filter = new THREE.Mesh(new THREE.CylinderGeometry(0.0042, 0.0042, FILTER_LEN, 10), filterMat);
    filter.rotation.x = Math.PI / 2;
    filter.position.z = FILTER_LEN / 2 - 0.006;
    cig.add(filter);
    // paper is a unit cylinder scaled to the unburnt length
    const paperG = new THREE.CylinderGeometry(0.004, 0.004, 1, 10);
    paperG.translate(0, -0.5, 0);
    paperG.rotateX(Math.PI / 2); // extends along -z from the filter
    this.paper = new THREE.Mesh(paperG, paperMat);
    this.paper.position.z = -0.006;
    cig.add(this.paper);
    this.ash = new THREE.Mesh(new THREE.CylinderGeometry(0.0039, 0.0036, 1, 8), new THREE.MeshStandardMaterial({ color: 0x77736c, roughness: 1 }));
    this.ash.rotation.x = Math.PI / 2;
    cig.add(this.ash);
    // ember: HDR color so the bloom pass haloes it on each drag
    this.emberMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.35, 0.08) });
    this.ember = new THREE.Mesh(new THREE.SphereGeometry(0.0043, 10, 6), this.emberMat);
    this.ember.scale.set(1, 1, 0.55);
    cig.add(this.ember);
    this.emberGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeGlowTexture(64, '255,140,60'),
        color: 0xff8a40,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0,
      })
    );
    this.emberGlow.scale.setScalar(0.05);
    cig.add(this.emberGlow);
    hand.add(cig);
    this.cig = cig;

    // lighter flame, only for the first second
    this.flame = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeGlowTexture(64, '255,200,120'),
        color: new THREE.Color(2.2, 1.3, 0.55),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0,
      })
    );
    this.flame.scale.set(0.018, 0.034, 1);
    hand.add(this.flame);

    hand.traverse((o) => {
      o.frustumCulled = false;
      o.castShadow = false;
      o.receiveShadow = false;
    });
    hand.visible = false;
    this.hand = hand;
    this.camera.add(hand);
    this.setBurn(0);
  }

  buildParticles() {
    const geo = new THREE.BufferGeometry();
    this.pPos = new Float32Array(MAX_PARTICLES * 3);
    this.pSize = new Float32Array(MAX_PARTICLES);
    this.pAlpha = new Float32Array(MAX_PARTICLES);
    this.pSeed = new Float32Array(MAX_PARTICLES);
    for (let i = 0; i < MAX_PARTICLES; i++) this.pSeed[i] = Math.random();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.pSize, 1));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.pAlpha, 1));
    geo.setAttribute('seed', new THREE.BufferAttribute(this.pSeed, 1));
    this.particles = [];
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({ alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), age: 0, life: 1, size0: 0.02, size1: 0.2, alpha: 0.3 });
    }
    this.pCursor = 0;
    this.pointsMat = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: makeSmokeTexture(128) },
        tint: { value: new THREE.Color(0.62, 0.66, 0.74) },
        scale: { value: window.innerHeight / 2 },
      },
      vertexShader: /* glsl */ `
        attribute float size;
        attribute float alpha;
        attribute float seed;
        varying float vAlpha;
        varying float vRot;
        uniform float scale;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = size * scale / max(0.05, -mv.z);
          vAlpha = alpha;
          vRot = seed * 6.2831;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        uniform vec3 tint;
        varying float vAlpha;
        varying float vRot;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float c = cos(vRot), s = sin(vRot);
          uv = mat2(c, -s, s, c) * uv + 0.5;
          vec4 tex = texture2D(map, uv);
          float a = tex.a * vAlpha * 3.0;
          if (a < 0.003) discard;
          gl_FragColor = vec4(tint * tex.rgb, a);
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(geo, this.pointsMat);
    this.points.frustumCulled = false;
    this.points.visible = false;
    this.points.renderOrder = 5;
    this.scene.add(this.points);
  }

  /** Burnt fraction 0..1: shortens the paper, grows a little ash. */
  setBurn(f) {
    this.burn = f;
    const paperLen = PAPER_LEN * (1 - f * 0.72);
    const ashLen = Math.min(0.006, 0.0015 + f * 0.01);
    this.paper.scale.set(1, 1, paperLen);
    const tip = -0.006 - paperLen;
    this.ash.scale.set(1, ashLen, 1);
    this.ash.position.z = tip - ashLen / 2 + 0.001;
    this.ember.position.z = tip + 0.0005;
    this.emberGlow.position.z = tip - 0.002;
    this.flame.position.set(-0.017, 0.012, -0.03 + tip - 0.012);
  }

  /* --------------------------------------------------------- particles */

  emit(pos, vel, { life, size0, size1, alpha }) {
    const p = this.particles[this.pCursor];
    this.pCursor = (this.pCursor + 1) % MAX_PARTICLES;
    p.alive = true;
    p.pos.copy(pos);
    p.vel.copy(vel);
    p.age = 0;
    p.life = life;
    p.size0 = size0;
    p.size1 = size1;
    p.alpha = alpha;
  }

  updateParticles(dt, elapsed) {
    const indoor = this.active?.indoor;
    const wind = this.env.wind;
    // indoors only a lazy draught; outside the smoke leans with the wind
    const wx = indoor ? 0.03 : wind.x * 0.22;
    const wz = indoor ? 0.02 : wind.z * 0.22;
    let any = false;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.alive) {
        this.pAlpha[i] = 0;
        this.pSize[i] = 0;
        continue;
      }
      p.age += dt;
      if (p.age >= p.life) {
        p.alive = false;
        this.pAlpha[i] = 0;
        continue;
      }
      any = true;
      const k = p.age / p.life;
      // velocity relaxes toward a slow rise plus the wind, with a curl
      const curl = Math.sin(elapsed * 1.7 + this.pSeed[i] * 20) * 0.05;
      p.vel.x = lerp(p.vel.x, wx + curl, 1 - Math.exp(-dt * 1.4));
      p.vel.z = lerp(p.vel.z, wz + Math.cos(elapsed * 1.3 + this.pSeed[i] * 13) * 0.05, 1 - Math.exp(-dt * 1.4));
      p.vel.y = lerp(p.vel.y, 0.14, 1 - Math.exp(-dt * 0.9));
      p.pos.addScaledVector(p.vel, dt);
      this.pPos[i * 3] = p.pos.x;
      this.pPos[i * 3 + 1] = p.pos.y;
      this.pPos[i * 3 + 2] = p.pos.z;
      this.pSize[i] = lerp(p.size0, p.size1, Math.sqrt(k));
      this.pAlpha[i] = p.alpha * smoothstep(0, 0.08, k) * (1 - smoothstep(0.45, 1, k));
    }
    const geo = this.points.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.size.needsUpdate = true;
    geo.attributes.alpha.needsUpdate = true;
    this.points.visible = any;
  }

  /* --------------------------------------------------------- sequence */

  available(spot) {
    return !this.active && !(this.cooldowns[spot.id] > 0);
  }

  get running() {
    return !!this.active;
  }

  /** Starts the sequence at a spot; the caller has already placed the player. */
  start(spot) {
    this.active = spot;
    this.t = 0;
    this.dragIndex = -1;
    this.exhaled.clear();
    this.lit = false;
    this.setBurn(0);
    this.glow = 0;
    this.hand.visible = true;
    this.pointsMat.uniforms.tint.value.setRGB(...(spot.indoor ? [0.7, 0.66, 0.6] : [0.62, 0.66, 0.74]));
    this.applyPose(LOW, LOW, 0);
  }

  stop() {
    if (this.active) this.cooldowns[this.active.id] = COOLDOWN;
    this.active = null;
    this.hand.visible = false;
  }

  /** Lerps the hand between two poses. */
  applyPose(a, b, k) {
    this.hand.position.lerpVectors(a.pos, b.pos, k);
    this.hand.rotation.set(lerp(a.rot.x, b.rot.x, k), lerp(a.rot.y, b.rot.y, k), lerp(a.rot.z, b.rot.z, k));
  }

  /** Which drag the hand is in and how far toward the mouth (0..1). */
  dragState(t) {
    for (let i = 0; i < DRAGS.length; i++) {
      const [s, hold] = DRAGS[i];
      const e = s + TRAVEL + hold + TRAVEL;
      if (t < s || t > e) continue;
      let k;
      if (t < s + TRAVEL) k = ease((t - s) / TRAVEL);
      else if (t < s + TRAVEL + hold) k = 1;
      else k = 1 - ease((t - s - TRAVEL - hold) / TRAVEL);
      const inhale = t >= s + TRAVEL * 0.8 && t < s + TRAVEL + hold;
      return { index: i, k, inhale, released: t >= s + TRAVEL + hold };
    }
    return { index: -1, k: 0, inhale: false, released: false };
  }

  update(dt, elapsed) {
    for (const id in this.cooldowns) this.cooldowns[id] = Math.max(0, this.cooldowns[id] - dt);
    if (!this.active) {
      if (this.points.visible) this.updateParticles(dt, elapsed);
      return false;
    }
    this.t += dt;
    const t = this.t;
    const drag = this.dragState(t);

    // pose: rise, light up near the face, rest/drags, lower away
    if (t < LIGHT_AT) this.applyPose(LOW, LIGHTING, ease(clamp(t / LIGHT_AT, 0, 1)));
    else if (t < LIGHT_AT + 1.3) this.applyPose(LIGHTING, LIGHTING, 0);
    else if (t < DRAGS[0][0]) this.applyPose(LIGHTING, REST, ease(clamp((t - LIGHT_AT - 1.3) / 0.6, 0, 1)));
    else if (t > LOWER_AT) this.applyPose(REST, LOW, ease(clamp((t - LOWER_AT) / 1.4, 0, 1)));
    else this.applyPose(REST, MOUTH, drag.k);
    // idle sway, a touch of cold-hand tremor
    this.hand.position.x += Math.sin(elapsed * 0.9) * 0.004;
    this.hand.position.y += Math.sin(elapsed * 1.3 + 1) * 0.003 + Math.sin(elapsed * 23) * 0.0004;

    // lighter
    const flameK = t > LIGHT_AT && t < LIGHT_AT + 1.2 ? 1 - smoothstep(0.9, 1.2, t - LIGHT_AT) : 0;
    this.flame.material.opacity = flameK * (0.85 + Math.sin(elapsed * 41) * 0.15);
    this.flame.scale.set(0.018, 0.03 + Math.sin(elapsed * 29) * 0.004, 1);
    if (!this.lit && t > LIGHT_AT) {
      this.lit = true;
      this.sound.lighter?.();
    }
    if (t > LIGHT_AT + 0.4 && t < LIGHT_AT + 1.1) this.glow = Math.max(this.glow, 0.7);

    // drags: ember glows hot, the paper burns faster, then the exhale
    if (drag.index !== this.dragIndex && drag.index >= 0 && drag.k > 0) {
      this.dragIndex = drag.index;
      this.sound.inhale?.(DRAGS[drag.index][1] + TRAVEL * 0.4);
    }
    if (drag.inhale) this.glow = Math.min(1, this.glow + dt * 2.2);
    else this.glow = Math.max(0.18, this.glow - dt * 0.8);
    if (t < LIGHT_AT + 0.4) this.glow = 0;
    if (t > LIGHT_AT) this.setBurn(Math.min(1, this.burn + dt * (drag.inhale ? 0.032 : 0.0075)));
    if (drag.released && !this.exhaled.has(drag.index)) {
      this.exhaled.add(drag.index);
      this.sound.exhale?.(2.2);
      this.exhaleT = 0;
      this.exhaleLeft = 1.6;
    }

    const glow = this.glow;
    this.emberMat.color.setRGB(0.5 + glow * 2.6, 0.12 + glow * 0.55, 0.03 + glow * 0.08);
    this.emberGlow.material.opacity = (0.15 + glow * 0.65) * (t > LIGHT_AT + 0.4 ? 1 : 0);
    this.emberGlow.scale.setScalar(0.028 + glow * 0.03);
    this.skinMat.emissiveIntensity = 0.12 + glow * 0.3;

    // particles: a thin stream off the ember, puffs out of the mouth
    if (t > LIGHT_AT + 0.4 && t < LOWER_AT + 1.2) {
      this.ember.getWorldPosition(this.tmp);
      const rate = drag.inhale ? 4 : 16;
      if (Math.random() < rate * dt * 3) {
        this.tmp2.set((Math.random() - 0.5) * 0.01, 0.08 + Math.random() * 0.05, (Math.random() - 0.5) * 0.01);
        this.emit(this.tmp, this.tmp2, { life: 3.2 + Math.random() * 1.5, size0: 0.012, size1: 0.16, alpha: 0.2 });
      }
    }
    if (this.exhaleLeft > 0) {
      this.exhaleT += dt;
      this.exhaleLeft -= dt;
      const strength = Math.exp(-this.exhaleT * 1.6);
      const mouth = this.tmp.set(0, -0.09, -0.08).applyMatrix4(this.camera.matrixWorld);
      const dir = this.tmp2.set((Math.random() - 0.5) * 0.25, -0.12 + Math.random() * 0.12, -1).transformDirection(this.camera.matrixWorld);
      const n = Math.random() < strength * dt * 34 ? 1 : 0;
      for (let i = 0; i < n; i++) {
        this.emit(mouth, dir.multiplyScalar(0.45 + strength * 0.65), { life: 2.6 + Math.random() * 1.4, size0: 0.05, size1: 0.55, alpha: 0.22 * (0.4 + strength) });
      }
    }
    this.updateParticles(dt, elapsed);

    // the caller stands the player up and calls stop()
    return t >= DURATION;
  }

  /** Jumps the sequence clock (smoke test screenshots). */
  seek(t) {
    if (this.active) this.t = t;
  }

  onResize() {
    this.pointsMat.uniforms.scale.value = window.innerHeight / 2;
  }
}
