// World assembly: shared materials, collisions, terrain heights,
// captioned zones and updating of ambient animations.
import * as THREE from 'three';
import { Rng } from '../util.js';
import { WORLD, SEASONS } from '../config.js';
import * as TX from '../textures.js';
import { buildTerrain } from './terrain.js';
import { buildBuildings } from './buildings.js';
import { buildIcicles } from './icicles.js';
import { buildProps } from './props.js';
import { buildVegetation } from './vegetation.js';
import { buildPeople } from './people.js';
import { buildInteriors } from './interiors.js';
import { buildFlats } from './flats.js';
import { buildEntrances, addFacadeLift } from './entrances.js';
import { buildVehicles } from './vehicles.js';
import { batchStatic } from './batch.js';
import { buildTraffic } from './traffic.js';
import { buildBusStops } from './busstops.js';
import { buildDog } from './dog.js';
import { buildPigeons } from './pigeons.js';
import { buildCats } from './cats.js';
import { buildHighway, openRoad, highwaySurface } from './highway.js';
import { buildEast, inEastSector } from './east.js';

export class World {
  constructor({ season = 'winter', quality = 'high' } = {}) {
    this.season = season;
    this.quality = quality;
    this.group = new THREE.Group();
    this.group.name = 'world';
    // small props of the far northern cluster: hidden while the camera is
    // in the historic district, where they would only cost draw calls
    // (sub-pixel and fog-shrouded at that distance anyway)
    this.farDetails = new THREE.Group();
    this.farDetails.name = 'far-north-details';
    this.group.add(this.farDetails);
    // same idea for the western cluster on ул. Строителей
    this.westDetails = new THREE.Group();
    this.westDetails.name = 'far-west-details';
    this.group.add(this.westDetails);
    this.southDetails = new THREE.Group();
    this.southDetails.name = 'far-south-details';
    this.group.add(this.southDetails);
    // and the steppe highway, out past the east fence
    this.highwayDetails = new THREE.Group();
    this.highwayDetails.name = 'highway-details';
    this.group.add(this.highwayDetails);
    // and the private sector on ул. Таёжная, off the highway
    this.eastDetails = new THREE.Group();
    this.eastDetails.name = 'east-details';
    this.group.add(this.eastDetails);
    this.rng = new Rng(20260119);
    this.colliders = [];
    // the world as it stood before the northern expansion: colliders and
    // heights of the historic district, used by the legacy scatter passes
    // (mounds, litter, tree relocation) so their seeded placement does not
    // drift when the playable edge moves
    this.legacyColliders = [];
    this.lateColliders = [];
    this.legacyHeightRects = [];
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
    this.interiors = [];
    this.interactables = [];

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
      [
        'Apartment blocks and courtyards',
        () => {
          buildBuildings(this.ctx);
          buildIcicles(this.ctx);
          buildEntrances(this.ctx);
          addFacadeLift(this);
        },
      ],
      ['Roads, snow and paths', () => buildTerrain(this.ctx)],
      [
        'District props',
        () => {
          buildProps(this.ctx);
          buildVehicles(this.ctx);
          buildTraffic(this.ctx);
          buildDog(this.ctx);
          buildPigeons(this.ctx);
          buildCats(this.ctx);
        },
      ],
      // routes are validated lazily on the first update, once the trees
      // planted by the next stage have registered their colliders too
      ['Passers-by', () => buildPeople(this.ctx)],
      [
        'Trees, bushes and crows',
        () => {
          buildVegetation(this.ctx);
          buildBusStops(this.ctx);
          buildHighway(this.ctx);
          buildEast(this.ctx);
        },
      ],
      [
        'Warm stairwells and flats',
        () => {
          buildInteriors(this.ctx);
          buildFlats(this.ctx);
        },
      ],
    ];
    for (let i = 0; i < stages.length; i++) {
      onProgress?.(i / stages.length, stages[i][0]);
      // let the browser breathe to update the loading bar
      await new Promise((resolve) => setTimeout(resolve, 24));
      stages[i][1]();
    }
    this.colliders.push(...this.lateColliders);
    // the private sector opens with its fences up (the scatter never walked there)
    this.eastOpen = true;
    // the parked cars' historic footprints only shaped the scatter passes:
    // from now on each car's own (moving) collider stands for it
    this.colliders = this.colliders.filter((c) => !c.buildOnly);
    for (const car of this.cars ?? []) car.updateCollider();
    // everything that never moves becomes a handful of meshes per cell
    // (?nobatch in the URL keeps the meshes apart, to compare)
    if (!new URLSearchParams(globalThis.location?.search ?? '').has('nobatch')) this.batchReport = batchStatic(this);
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
      addColliderRect(x0, x1, z0, z1, north = false) {
        const rect = { minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1) };
        self.colliders.push(rect);
        if (!north) self.legacyColliders.push(rect);
      },
      /** A collider that only goes up once the world is built: the seeded
       * scatter passes never see it, so the trees stay where they were. */
      addLateColliderRect(x0, x1, z0, z1) {
        self.lateColliders.push({ minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1) });
      },
      addBoxCollider(cx, cz, w, d, pad = 0.1, north = false) {
        this.addColliderRect(cx - w / 2 - pad, cx + w / 2 + pad, cz - d / 2 - pad, cz + d / 2 + pad, north);
      },
      /** A collider of the pre-expansion district that no longer exists:
       * keeps the historic scatter math identical without blocking anyone. */
      addLegacyGhostRect(x0, x1, z0, z1) {
        self.legacyColliders.push({ minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1) });
      },
      addHeightRect(x0, x1, z0, z1, h, north = false) {
        const rect = { minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1), h };
        self.heightRects.push(rect);
        if (!north) self.legacyHeightRects.push(rect);
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
    if (x > WORLD.bounds) return highwaySurface(x, z);
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

  /** The stairwell or flat interior containing the point, if any. */
  interiorAt(x, z) {
    for (const it of this.flats ?? []) {
      const b = it.bounds;
      if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) return it;
    }
    for (const it of this.interiors) {
      const b = it.bounds;
      if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) return it;
    }
    return null;
  }

  /** Checks whether a circle of radius r collides with the environment. */
  collides(x, z, r) {
    // interiors sit far outside the district: their own walls bound the
    // player there, the world edge only applies outdoors
    // past the east edge only the highway's corridor and the private sector
    // off it are open ground
    if (!this.interiorAt(x, z) && (x > WORLD.bounds || x < -WORLD.boundsWest || z < -WORLD.boundsSouth || z > WORLD.boundsNorth)) {
      if (x <= WORLD.bounds || !(openRoad(x, z, r) || (this.eastOpen && inEastSector(x, z, r)))) return true;
    }
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

  /**
   * A vehicle that moved onto someone (a car still braking, a bus pulling
   * over) would otherwise leave them inside its body, where every step
   * collides: the nearest free spot just clear of it, or null if not caught.
   */
  escapeVehicles(x, z, r) {
    for (const c of this.colliders) {
      if (!c.car?.escapes || !c.car.overlapsCircle(x, z, r)) continue;
      for (const spot of c.car.escapes(x, z, r)) if (!this.collides(spot.x, spot.z, r)) return spot;
    }
    return null;
  }

  /** Whether the point is out on the steppe highway (open road, higher speeds). */
  onHighway(x, z) {
    return x > WORLD.bounds + 4 && openRoad(x, z);
  }

  /** Same check against the pre-expansion district (legacy scatter passes). */
  collidesHistoric(x, z, r) {
    if (Math.abs(x) > WORLD.bounds || Math.abs(z) > WORLD.bounds) return true;
    for (const c of this.legacyColliders) {
      const cx = Math.max(c.minX, Math.min(x, c.maxX));
      const cz = Math.max(c.minZ, Math.min(z, c.maxZ));
      const dx = x - cx;
      const dz = z - cz;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }

  /** Historic height lookup (sidewalks as they were before the expansion). */
  heightAtHistoric(x, z) {
    let h = 0;
    for (const r of this.legacyHeightRects) {
      if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ && r.h > h) h = r.h;
    }
    return h;
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
    // the northern expansion keeps its own instanced meshes (seeded apart)
    if (this.snowMoundsNorth) this.snowMoundsNorth.count = Math.max(1, Math.floor(this.snowMoundsNorth.userData.total * s.mounds));
    if (this.snowMoundsWest) this.snowMoundsWest.count = Math.max(1, Math.floor(this.snowMoundsWest.userData.total * s.mounds));
    if (this.snowMoundsSouth) this.snowMoundsSouth.count = Math.max(1, Math.floor(this.snowMoundsSouth.userData.total * s.mounds));
    if (this.leafLitterNorth) this.leafLitterNorth.count = Math.max(0, Math.floor(this.leafLitterNorth.userData.total * (key === 'autumn' ? 1 : s.litter)));
  }

  setWindowLit(value) {
    for (const m of this.windowMats) m.emissiveIntensity = value;
  }

  /* ---------------------------------------------------------- loop */

  update(dt, elapsed) {
    for (const fn of this.updaters) fn(dt, elapsed);
  }
}
