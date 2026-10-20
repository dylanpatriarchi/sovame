// World assembly: shared materials, collisions, terrain heights,
// captioned zones and updating of ambient animations.
import * as THREE from 'three';
import { Rng } from '../util.js';
import { WORLD, SEASONS } from '../config.js';
import * as TX from '../textures.js';
import { buildTerrain } from './terrain.js';
import { buildBuildings } from './buildings.js';
import { buildProps } from './props.js';
import { buildVegetation } from './vegetation.js';

export class World {
  constructor({ season = 'winter', quality = 'high' } = {}) {
    this.season = season;
    this.quality = quality;
    this.group = new THREE.Group();
    this.group.name = 'world';
    this.rng = new Rng(20260119);
    this.colliders = [];
    this.heightRects = [];
    this.surfaceRects = [];
    this.zones = [];
    this.autumnOnly = [];
    this.winterOnly = [];
    this.windowMats = [];
    this.tvMats = [];
    this.roofMats = [];
    this.roadMats = [];
    this.posterMats = [];
    this.lamps = [];
    this.updaters = [];
    this.points = {};

    this.initMaterials();
    this.initTextures();
    this.ctx = this.makeContext();
  }

  /**
   * Builds the world in stages (lets the UI show progress).
   * Buildings come first because they register the colliders used by the others.
   */
  async build(onProgress) {
    const stages = [
      ['Apartment blocks and courtyards', () => buildBuildings(this.ctx)],
      ['Roads, snow and paths', () => buildTerrain(this.ctx)],
      ['District props', () => buildProps(this.ctx)],
      ['Trees, bushes and crows', () => buildVegetation(this.ctx)],
    ];
    for (let i = 0; i < stages.length; i++) {
      onProgress?.(i / stages.length, stages[i][0]);
      // let the browser breathe to update the loading bar
      await new Promise((resolve) => setTimeout(resolve, 24));
      stages[i][1]();
    }
    onProgress?.(1, 'Ready');
  }

  /* ---------------------------------------------------------- materials */

  initMaterials() {
    const std = (params) => new THREE.MeshStandardMaterial(params);
    this.materials = {
      concrete: std({ color: 0xb5b0a4, roughness: 0.94 }),
      concreteDark: std({ color: 0x8b877d, roughness: 0.95 }),
      concreteWhite: std({ color: 0xd8dae0, roughness: 0.9 }),
      snow: std({ color: 0xe9eef6, roughness: 0.86 }),
      snowDirty: std({ color: 0xcfd6e0, roughness: 0.9 }),
      metal: std({ color: 0x4a4f52, roughness: 0.62, metalness: 0.55 }),
      metalLight: std({ color: 0x9aa0a2, roughness: 0.55, metalness: 0.5 }),
      paintRed: std({ color: 0x9c2a22, roughness: 0.7 }),
      paintBlue: std({ color: 0x2f4a68, roughness: 0.72 }),
      paintGreen: std({ color: 0x3b5c46, roughness: 0.75 }),
      paintYellow: std({ color: 0xc9a13f, roughness: 0.7 }),
      wood: std({ color: 0x7a5b3c, roughness: 0.9 }),
      woodDark: std({ color: 0x51402d, roughness: 0.92 }),
      rubber: std({ color: 0x1c1e20, roughness: 0.95 }),
      glass: std({ color: 0x1e2a33, roughness: 0.22, metalness: 0.15 }),
      glassPane: new THREE.MeshPhysicalMaterial({
        color: 0x8fa6a8,
        roughness: 0.14,
        metalness: 0,
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide,
      }),
      lampHead: std({ color: 0xdfe6e8, roughness: 0.4, metalness: 0.2 }),
    };
  }

  initTextures() {
    this.textures = {
      groundWinter: TX.makeGroundTexture('winter'),
      groundAutumn: TX.makeGroundTexture('autumn'),
      asphalt: TX.makeAsphaltTexture({ dashes: true }),
      asphaltPlain: TX.makeAsphaltTexture({ dashes: false }),
      asphaltWinter: TX.makeAsphaltTexture({ dashes: true, winter: true }),
      asphaltPlainWinter: TX.makeAsphaltTexture({ dashes: false, winter: true }),
      asphaltRough: TX.makeAsphaltRoughnessTexture({ dashes: true }),
      asphaltPlainRough: TX.makeAsphaltRoughnessTexture({ dashes: false }),
      asphaltRoughWinter: TX.makeAsphaltRoughnessTexture({ dashes: true, winter: true }),
      asphaltPlainRoughWinter: TX.makeAsphaltRoughnessTexture({ dashes: false, winter: true }),
      sidewalk: TX.makeSidewalkTexture(),
      path: TX.makeTrampledSnowTexture(),
      snowEdge: TX.makeSnowEdgeTexture(),
      ice: TX.makeIceTexture(),
      roofWinter: TX.makeRoofTexture(true),
      roofAutumn: TX.makeRoofTexture(false),
      snowLedge: TX.makeSnowLedgeTexture(),
      tvGlow: TX.makeTvGlowTexture(),
      rust: TX.makeRustTexture(),
      corrugated: TX.makeCorrugatedTexture(),
      birch: TX.makeBirchTexture(),
      bark: TX.makeBarkTexture(),
      brick: TX.makeBrickTexture(),
      metalScratch: TX.makeMetalTexture(),
      manhole: TX.makeManholeTexture(),
    };
    this.textures.birch.repeat.set(1, 3);
    this.textures.bark.repeat.set(1, 2);
    this.textures.brick.repeat.set(3, 6);
    this.textures.corrugated.repeat.set(1, 1);
    this.textures.roofWinter.repeat.set(3, 3);
    this.textures.roofAutumn.repeat.set(3, 3);
    this.textures.metalScratch.repeat.set(1, 1);

    this.materials.rust = new THREE.MeshStandardMaterial({ map: this.textures.rust, roughness: 0.9, metalness: 0.25 });
    this.materials.corrugated = new THREE.MeshStandardMaterial({ map: this.textures.corrugated, roughness: 0.72, metalness: 0.4 });
    this.materials.brick = new THREE.MeshStandardMaterial({ map: this.textures.brick, roughness: 0.95 });
    this.materials.metalTexture = new THREE.MeshStandardMaterial({ map: this.textures.metalScratch, roughness: 0.6, metalness: 0.5 });
    this.materials.birch = new THREE.MeshStandardMaterial({ map: this.textures.birch, roughness: 0.9 });
    this.materials.bark = new THREE.MeshStandardMaterial({ map: this.textures.bark, roughness: 0.95 });
  }

  /* ---------------------------------------------------------- context */

  makeContext() {
    const self = this;
    return {
      world: this,
      rng: this.rng,
      group: this.group,
      materials: this.materials,
      textures: this.textures,
      season: this.season,
      SEASONS,
      TEXTURES: TX,
      addColliderRect(x0, x1, z0, z1) {
        self.colliders.push({ minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1) });
      },
      addBoxCollider(cx, cz, w, d, pad = 0.1) {
        this.addColliderRect(cx - w / 2 - pad, cx + w / 2 + pad, cz - d / 2 - pad, cz + d / 2 + pad);
      },
      addHeightRect(x0, x1, z0, z1, h) {
        self.heightRects.push({ minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1), h });
      },
      addSurfaceRect(x0, x1, z0, z1, type) {
        self.surfaceRects.push({ minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1), type });
      },
      addZone(name, sub, x0, x1, z0, z1) {
        self.zones.push({ name, sub, x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), area: Math.abs((x1 - x0) * (z1 - z0)) });
      },
      /** Object visible only in the given season. */
      seasonable(season, object) {
        if (season === 'autumn') self.autumnOnly.push(object);
        else self.winterOnly.push(object);
        object.visible = self.season === season;
        return object;
      },
      addUpdater(fn) {
        self.updaters.push(fn);
      },
      /** Adds a mesh to the world with shadows configured. */
      place(mesh, { cast = true, receive = true } = {}) {
        mesh.castShadow = cast;
        mesh.receiveShadow = receive;
        self.group.add(mesh);
        return mesh;
      },
      /** Helper box. */
      box(w, h, d, material, x, y, z, parent = self.group) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        parent.add(mesh);
        return mesh;
      },
      cyl(rTop, rBottom, h, material, x, y, z, segments = 12) {
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), material);
        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        parent ? parent.add(mesh) : self.group.add(mesh);
        return mesh;
      },
    };
  }

  /* ---------------------------------------------------------- queries */

  heightAt(x, z) {
    let h = 0;
    for (const r of this.heightRects) {
      if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ && r.h > h) h = r.h;
    }
    return h;
  }

  surfaceAt(x, z) {
    let type = 'snow';
    for (const r of this.surfaceRects) {
      if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) type = r.type;
    }
    return type;
  }

  zoneAt(x, z) {
    let best = null;
    for (const zone of this.zones) {
      if (x < zone.x0 || x > zone.x1 || z < zone.z0 || z > zone.z1) continue;
      if (!best || zone.area < best.area) best = zone;
    }
    return best;
  }

  /** Checks whether a circle of radius r collides with the environment. */
  collides(x, z, r) {
    if (Math.abs(x) > WORLD.bounds || Math.abs(z) > WORLD.bounds) return true;
    for (const c of this.colliders) {
      const cx = Math.max(c.minX, Math.min(x, c.maxX));
      const cz = Math.max(c.minZ, Math.min(z, c.maxZ));
      const dx = x - cx;
      const dz = z - cz;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }

  /* ---------------------------------------------------------- seasons/lights */

  setSeason(key) {
    this.season = key;
    const s = SEASONS[key];
    const gm = this.materials.ground;
    if (gm) {
      gm.map = key === 'winter' ? this.textures.groundWinter : this.textures.groundAutumn;
      gm.color.setHex(key === 'winter' ? 0xffffff : 0xf0ece4);
      gm.needsUpdate = true;
    }
    for (const m of this.roofMats) {
      m.map = key === 'winter' ? this.textures.roofWinter : this.textures.roofAutumn;
      m.needsUpdate = true;
    }
    for (const m of this.roadMats) {
      m.map = key === 'winter' ? (m.userData.winterTex ?? this.textures.asphaltWinter) : (m.userData.autumnTex ?? this.textures.asphalt);
      if (m.userData.winterRough) m.roughnessMap = key === 'winter' ? m.userData.winterRough : m.userData.autumnRough;
      m.needsUpdate = true;
    }
    if (this.materials.snowEdge) this.materials.snowEdge.opacity = s.snowEdge;
    for (const o of this.autumnOnly) o.visible = key === 'autumn';
    for (const o of this.winterOnly) o.visible = key === 'winter';
    if (this.snowMounds) this.snowMounds.count = Math.max(1, Math.floor(this.snowMounds.userData.total * s.mounds));
    if (this.leafLitter) this.leafLitter.count = Math.max(0, Math.floor(this.leafLitter.userData.total * (key === 'autumn' ? 1 : s.litter)));
  }

  setWindowLit(value) {
    for (const m of this.windowMats) m.emissiveIntensity = value;
  }

  /* ---------------------------------------------------------- loop */

  update(dt, elapsed) {
    for (const fn of this.updaters) fn(dt, elapsed);
  }
}
