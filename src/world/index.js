// World assembly: shared materials, collisions, terrain heights,
// captioned zones and updating of ambient animations.
import * as THREE from 'three';
import { Rng } from '../util.js';
import { SEASONS } from '../config.js';
import * as TX from '../textures.js';
import { buildStreets } from './streets.js';
import { buildBlocks } from './blocks.js';
import { buildCrows } from './crows.js';
import { buildPeople } from './people.js';
import { buildEntrances, addFacadeLift } from './entrances.js';
import { buildVehicles } from './vehicles.js';
import { landHeight } from './land.js';
import { buildPiles } from './piles.js';
import { buildRoads } from './roads.js';
import { buildArctic } from './arctic.js';

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
    this.windowMats = [];
    this.tvMats = [];
    this.roofMats = [];
    this.posterMats = [];
    this.updaters = [];
    this.points = {};
    this.interactables = [];

    this.initMaterials();
    this.initTextures();
    this.ctx = this.makeContext();
  }

  /**
   * Builds the world in stages (lets the UI show progress). The walls come
   * first: everything after them asks the world what is already standing.
   */
  async build(onProgress) {
    const stages = [
      [
        'Apartment blocks and courtyards',
        () => {
          buildBlocks(this.ctx);
          buildEntrances(this.ctx);
          buildPiles(this.ctx);
          addFacadeLift(this);
        },
      ],
      ['Streets and snow', () => buildStreets(this.ctx)],
      ['Roads out of town', () => buildRoads(this.ctx)],
      ['Plant, port and street lamps', () => buildArctic(this.ctx)],
      ['Parked cars', () => buildVehicles(this.ctx)],
      ['Passers-by and crows', () => {
        buildPeople(this.ctx);
        buildCrows(this.ctx);
      }],
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
      snowLedge: TX.makeSnowLedgeTexture(),
      tvGlow: TX.makeTvGlowTexture(),
      rust: TX.makeRustTexture(),
      corrugated: TX.makeCorrugatedTexture(),
      bark: TX.makeBarkTexture(),
      brick: TX.makeBrickTexture(),
      metalScratch: TX.makeMetalTexture(),
      manhole: TX.makeManholeTexture(),
    };
    this.textures.bark.repeat.set(1, 2);
    this.textures.brick.repeat.set(3, 6);
    this.textures.corrugated.repeat.set(1, 1);
    this.textures.roofWinter.repeat.set(3, 3);
    this.textures.metalScratch.repeat.set(1, 1);

    this.materials.rust = new THREE.MeshStandardMaterial({ map: this.textures.rust, roughness: 0.9, metalness: 0.25 });
    this.materials.corrugated = new THREE.MeshStandardMaterial({ map: this.textures.corrugated, roughness: 0.72, metalness: 0.4 });
    this.materials.brick = new THREE.MeshStandardMaterial({ map: this.textures.brick, roughness: 0.95 });
    this.materials.metalTexture = new THREE.MeshStandardMaterial({ map: this.textures.metalScratch, roughness: 0.6, metalness: 0.5 });
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
        self.group.add(mesh);
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
    // kerbs and steps stand on the town pad; past it the tundra rolls away
    return h + landHeight(x, z);
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
    // no world edge: past the last block the tundra goes on forever
    for (const c of this.colliders) {
      const cx = Math.max(c.minX, Math.min(x, c.maxX));
      const cz = Math.max(c.minZ, Math.min(z, c.maxZ));
      const dx = x - cx;
      const dz = z - cz;
      // a car's rect is only its bounding box: test the oriented body
      if (dx * dx + dz * dz < r * r && (!c.car || c.car.overlapsCircle(x, z, r))) return true;
    }
    return false;
  }

  /* ---------------------------------------------------------- seasons/lights */

  /** There is one season. Kept so the settings code has something to call. */
  setSeason(key) {
    this.season = key;
  }

  setWindowLit(value) {
    this.litLevel = value;
    for (const m of this.windowMats) m.emissiveIntensity = value;
  }

  /* ---------------------------------------------------------- loop */

  update(dt, elapsed, camera) {
    for (const fn of this.updaters) fn(dt, elapsed);
    if (camera) this.land?.update(camera.position.x, camera.position.z);
  }
}
