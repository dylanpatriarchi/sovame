// Snowballs (left mouse button, or G, in winter): packed in the hand and
// thrown along the view. They fly on a ballistic arc, burst into a puff of
// powder where they land and leave a white splat on the wall, the tree or
// the ground they hit (not on things that move). A passer-by who is hit
// flinches and turns round to see who threw it.
import * as THREE from 'three';
import { makeSoftCircleTexture } from './textures.js';
import { Rng } from './util.js';

const RADIUS = 0.075;
const SPEED = 17; // m/s off the hand
const LIFT = 2.2; // a little upward toss on top of the aim
const GRAVITY = 9.8;
const DRAG = 0.12; // 1/s
const COOLDOWN = 0.45; // s between throws
const MAX_BALLS = 6;
const MAX_SPLATS = 32;
const SPLAT_LIFE = 45; // s before a splat melts away
const PUFFS = 8;
const PERSON_R = 0.38;
const PERSON_H = 1.8;

const _ray = new THREE.Raycaster();
const _from = new THREE.Vector3();
const _step = new THREE.Vector3();
const _n = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _z = new THREE.Vector3(0, 0, 1);
const _nm = new THREE.Matrix3();
const _seg = new THREE.Box3();
const _box = new THREE.Box3();
const _end = new THREE.Vector3();

/** True when the object and all its parents are shown. */
function shown(obj) {
  for (let o = obj; o; o = o.parent) if (!o.visible) return false;
  return true;
}

/** True when the object (or a parent) moves at runtime: no splat sticks. */
function moving(obj) {
  for (let o = obj; o; o = o.parent) if (o.userData.dynamic) return true;
  return false;
}

/** A splat of snow: a lumpy core, crumbs flung outward. */
function makeSplatTexture(rng, size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const c = canvas.getContext('2d');
  const h = size / 2;
  c.fillStyle = 'rgba(246,248,250,1)';
  // the core: overlapping lumps
  for (let i = 0; i < 9; i++) {
    const a = rng.float(0, Math.PI * 2);
    const r = rng.float(0, size * 0.09);
    c.beginPath();
    c.arc(h + Math.cos(a) * r, h + Math.sin(a) * r, rng.float(size * 0.09, size * 0.16), 0, Math.PI * 2);
    c.fill();
  }
  // crumbs and short streaks, thinning out away from the core
  for (let i = 0; i < 46; i++) {
    const a = rng.float(0, Math.PI * 2);
    const r = size * (0.16 + Math.pow(rng.next(), 1.6) * 0.32);
    c.globalAlpha = rng.float(0.55, 1);
    c.beginPath();
    c.arc(h + Math.cos(a) * r, h + Math.sin(a) * r, rng.float(1, size * 0.028), 0, Math.PI * 2);
    c.fill();
  }
  c.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Snowballs {
  constructor({ scene, world, sound }) {
    this.world = world;
    this.sound = sound;
    this.rng = new Rng(4711);
    this.cooldown = 0;
    this.thrown = 0;
    /** Recent impacts, newest last (kind: 'ground' | 'wall' | 'person' | 'car'). */
    this.hits = [];

    const snow = new THREE.MeshStandardMaterial({ color: 0xf2f4f6, roughness: 0.95 });
    this.balls = [];
    const ballGeo = new THREE.IcosahedronGeometry(RADIUS, 1);
    for (let i = 0; i < MAX_BALLS; i++) {
      const mesh = new THREE.Mesh(ballGeo, snow);
      mesh.visible = false;
      mesh.castShadow = false;
      mesh.name = 'snowball';
      scene.add(mesh);
      this.balls.push({ mesh, pos: new THREE.Vector3(), vel: new THREE.Vector3(), alive: false, age: 0 });
    }

    // splats: a packed white blot with a spray of crumbs, laid on the
    // surface that was hit
    const splatTex = makeSplatTexture(this.rng);
    this.splatMat = new THREE.MeshStandardMaterial({
      map: splatTex,
      transparent: true,
      depthWrite: false,
      roughness: 0.9,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const splatGeo = new THREE.PlaneGeometry(0.7, 0.7);
    this.splats = [];
    for (let i = 0; i < MAX_SPLATS; i++) {
      const mesh = new THREE.Mesh(splatGeo, this.splatMat.clone());
      mesh.visible = false;
      mesh.name = 'snow-splat';
      mesh.renderOrder = 2;
      scene.add(mesh);
      this.splats.push({ mesh, age: 0 });
    }
    this.nextSplat = 0;

    // a puff of powder at each impact
    const puffMat = new THREE.SpriteMaterial({ map: makeSoftCircleTexture(64, '240,244,248', 2), transparent: true, depthWrite: false });
    this.puffs = [];
    for (let i = 0; i < PUFFS; i++) {
      const sprite = new THREE.Sprite(puffMat.clone());
      sprite.visible = false;
      scene.add(sprite);
      this.puffs.push({ sprite, age: 1 });
    }
    this.nextPuff = 0;
  }

  get ready() {
    return this.cooldown <= 0;
  }

  /** Throws from `origin` along the unit vector `dir`, adding the thrower's velocity. */
  throw(origin, dir, inherit = null) {
    if (this.cooldown > 0) return false;
    const ball = this.balls.find((b) => !b.alive);
    if (!ball) return false;
    this.cooldown = COOLDOWN;
    ball.alive = true;
    ball.age = 0;
    ball.pos.copy(origin);
    ball.vel.copy(dir).multiplyScalar(SPEED);
    ball.vel.y += LIFT;
    if (inherit) ball.vel.add(inherit);
    ball.mesh.position.copy(origin);
    ball.mesh.visible = true;
    this.thrown++;
    this.sound?.whoosh?.();
    return true;
  }

  update(dt, listener = null) {
    this.cooldown -= dt;
    for (const ball of this.balls) {
      if (!ball.alive) continue;
      ball.age += dt;
      _from.copy(ball.pos);
      ball.vel.y -= GRAVITY * dt;
      ball.vel.multiplyScalar(1 - DRAG * dt);
      _step.copy(ball.vel).multiplyScalar(dt);
      ball.pos.add(_step);
      if (this.#collide(ball, _from, _step, listener) || ball.age > 6) {
        ball.alive = false;
        ball.mesh.visible = false;
        continue;
      }
      ball.mesh.position.copy(ball.pos);
    }
    for (const s of this.splats) {
      if (!s.mesh.visible) continue;
      s.age += dt;
      // melts away at the end of its life
      s.mesh.material.opacity = Math.min(1, (SPLAT_LIFE - s.age) / 6);
      if (s.age > SPLAT_LIFE) s.mesh.visible = false;
    }
    for (const p of this.puffs) {
      if (!p.sprite.visible) continue;
      p.age += dt;
      const t = p.age / 0.55;
      p.sprite.scale.setScalar(0.25 + t * 0.7);
      p.sprite.position.y += dt * 0.3;
      p.sprite.material.opacity = Math.max(0, 0.8 * (1 - t));
      if (t >= 1) p.sprite.visible = false;
    }
  }

  /** Meshes a snowball can hit, with their world bounds (collected once the district is built). */
  #targets() {
    if (!this.targetList) {
      this.targetList = [];
      this.world.group.updateMatrixWorld(true);
      this.world.group.traverse((o) => {
        if (!o.isMesh || o.isSkinnedMesh || !o.layers.isEnabled(0) || o.material?.transparent) return;
        const dynamic = moving(o);
        this.targetList.push({ mesh: o, dynamic, box: dynamic ? null : new THREE.Box3().setFromObject(o) });
      });
    }
    return this.targetList;
  }

  /** Did the ball hit something on its way from `from` along `step`? */
  #collide(ball, from, step, listener) {
    const world = this.world;
    const pos = ball.pos;
    // people first: their skinned bodies make poor ray targets
    for (const p of world.people?.list ?? []) {
      if (!p.root.visible) continue;
      const pp = p.position;
      const base = p.root.position.y;
      if (pos.y < base || pos.y > base + PERSON_H * (p.scaleF ?? 1)) continue;
      if ((pos.x - pp.x) ** 2 + (pos.z - pp.z) ** 2 > PERSON_R * PERSON_R) continue;
      p.hit?.(from.x, from.z);
      this.#impact(pos, null, 'person', listener);
      return true;
    }
    // the dog: small and low
    const dog = world.dog;
    if (dog && pos.y < dog.root.position.y + 0.75 && (pos.x - dog.position.x) ** 2 + (pos.z - dog.position.z) ** 2 < 0.4 * 0.4) {
      dog.snowball(from.x, from.z, true);
      this.#impact(pos, null, 'person', listener);
      return true;
    }
    // walls, trees, cars: only once the ball reaches a collider (cheap, 2D)
    // is the actual surface looked for, with a ray along its path through
    // the meshes whose bounds the path crosses
    const len = step.length();
    if (len > 1e-5 && world.collides(pos.x, pos.z, RADIUS)) {
      _ray.set(from, _n.copy(step).divideScalar(len));
      _ray.far = len + 0.6;
      _seg.makeEmpty().expandByPoint(from).expandByPoint(_end.copy(from).addScaledVector(_ray.ray.direction, _ray.far));
      const near = this.#targets().filter((t) => {
        if (t.dynamic) _box.setFromObject(t.mesh);
        return (t.dynamic ? _box : t.box).intersectsBox(_seg);
      });
      const hits = _ray.intersectObjects(
        near.map((t) => t.mesh),
        false
      );
      for (const h of hits) {
        const obj = h.object;
        if (!obj.isMesh || obj.isSkinnedMesh || obj.name === 'snowball' || obj.material?.transparent || !shown(obj)) continue;
        pos.copy(h.point);
        const dyn = moving(obj);
        let normal = null;
        if (!dyn && h.face) {
          normal = _n.copy(h.face.normal);
          if (obj.isInstancedMesh && h.instanceId !== undefined) {
            const m = new THREE.Matrix4();
            obj.getMatrixAt(h.instanceId, m);
            normal.transformDirection(m);
          }
          normal.applyMatrix3(_nm.getNormalMatrix(obj.matrixWorld)).normalize();
          // the ray must meet the face from the front
          if (normal.dot(step) > 0) normal.negate();
        }
        this.#impact(pos, normal, dyn ? 'car' : Math.abs(normal?.y ?? 0) > 0.7 ? 'ground' : 'wall', listener);
        return true;
      }
    }
    // the terrain (heightfield) as a last resort
    const ground = world.heightAt(pos.x, pos.z);
    if (pos.y <= ground + 0.01) {
      pos.y = ground + 0.01;
      this.#impact(pos, _n.set(0, 1, 0), 'ground', listener);
      return true;
    }
    return false;
  }

  #impact(pos, normal, kind, listener) {
    // something for the dog to chase
    if (kind === 'ground' || kind === 'wall') this.world.dog?.snowball(pos.x, pos.z, false);
    this.hits.push({ kind, x: pos.x, y: pos.y, z: pos.z, nx: normal?.x ?? 0, ny: normal?.y ?? 0, nz: normal?.z ?? 0 });
    if (this.hits.length > 16) this.hits.shift();
    // powder
    const puff = this.puffs[this.nextPuff];
    this.nextPuff = (this.nextPuff + 1) % PUFFS;
    puff.age = 0;
    puff.sprite.visible = true;
    puff.sprite.position.copy(pos);
    if (normal) puff.sprite.position.addScaledVector(normal, 0.08);
    puff.sprite.scale.setScalar(0.25);
    puff.sprite.material.rotation = this.rng.float(0, Math.PI * 2);
    // the splat, flat on the surface (not on people or things that move)
    if (normal) {
      const s = this.splats[this.nextSplat];
      this.nextSplat = (this.nextSplat + 1) % MAX_SPLATS;
      s.age = 0;
      s.mesh.visible = true;
      s.mesh.material.opacity = 1;
      s.mesh.position.copy(pos).addScaledVector(normal, 0.012);
      _q.setFromUnitVectors(_z, normal);
      s.mesh.quaternion.copy(_q);
      s.mesh.rotateZ(this.rng.float(0, Math.PI * 2));
      const k = this.rng.float(0.75, 1.25);
      s.mesh.scale.set(k * this.rng.float(0.8, 1.3), k, 1);
    }
    if (listener) {
      const { dist, pan } = listener(pos.x, pos.z);
      this.sound?.splat?.(dist, pan, kind);
    }
  }
}
