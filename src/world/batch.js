// Static batching: once the district is built, the meshes that never move
// are baked into one mesh per material and per 48 m cell, so a view of the
// district costs a few hundred draw calls instead of a thousand and more.
// The cells keep the merged bounding spheres small enough for frustum
// culling to keep working.
//
// A mesh stays as it is when anything could change it at runtime: it (or an
// ancestor) is flagged `userData.dynamic`, it lives on the interior layer,
// it is transparent (draw order between transparent objects would change),
// instanced, multi-material, morphed, mirrored, hidden, or has its own
// render hooks. Seasonal meshes (shown only in winter or in autumn) are
// baked per season and the merged mesh takes their place in the season list.
// `staticBatchDrift` re-checks the baked sources later: the playtest uses it
// to prove that nothing baked is ever animated.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const CELL = 48;
const _m = new THREE.Matrix4();
const _inv = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _box = new THREE.Box3();
const _toOrigin = new THREE.Matrix4();

function signature(geometry) {
  const attrs = Object.keys(geometry.attributes)
    .sort()
    .map((name) => {
      const a = geometry.attributes[name];
      return `${name}:${a.itemSize}:${a.normalized ? 1 : 0}:${a.array.constructor.name}`;
    });
  return `${attrs.join('|')}${geometry.index ? ':i' : ''}`;
}

function radiusOf(mesh) {
  if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
  return mesh.geometry.boundingSphere.radius * mesh.matrixWorld.getMaxScaleOnAxis();
}

function geometryVersion(geometry) {
  let v = geometry.index?.version ?? 0;
  for (const name in geometry.attributes) v += geometry.attributes[name].version;
  return v;
}

/**
 * Bakes the static meshes of `world.group` and of its detail groups. Returns
 * a short report ({ sources, batches, kept }).
 */
export function batchStatic(world) {
  const containers = [world.group, world.farDetails, world.westDetails, world.southDetails, world.highwayDetails, world.eastDetails, world.portDetails].filter(Boolean);
  const containerSet = new Set(containers);
  const seasonOf = new Map();
  for (const o of world.winterOnly) seasonOf.set(o, 'winter');
  for (const o of world.autumnOnly) seasonOf.set(o, 'autumn');
  const noHook = THREE.Object3D.prototype.onBeforeRender;

  world.group.updateMatrixWorld(true);
  const buckets = new Map();
  const sources = [];
  let kept = 0;

  const visit = (obj, container, season, chain) => {
    if (obj.userData.dynamic) return;
    if (containerSet.has(obj)) container = obj;
    if (seasonOf.has(obj)) season = seasonOf.get(obj);
    // hidden for another reason than the season: may be shown later
    else if (!obj.visible) return;
    if (obj.isLight || obj.isSprite || obj.isPoints || obj.isLine) return;
    if (obj.isMesh) {
      const material = obj.material;
      const ok =
        // a parent mesh would take its children along when it is removed
        !obj.children.length &&
        !obj.isInstancedMesh &&
        !obj.isSkinnedMesh &&
        obj.layers.mask === 1 &&
        !Array.isArray(material) &&
        !material.transparent &&
        !Object.keys(obj.geometry.morphAttributes).length &&
        obj.onBeforeRender === noHook &&
        material.onBeforeRender === THREE.Material.prototype.onBeforeRender &&
        obj.matrixWorld.determinant() > 0 &&
        // roads, sidewalks and other long surfaces stay as built: one draw
        // each anyway, and surfaces laid 1 mm apart over hundreds of meters
        // only keep their depth order with the exact same vertex math
        radiusOf(obj) <= CELL / 2;
      if (!ok) {
        kept++;
      } else {
        _p.setFromMatrixPosition(obj.matrixWorld);
        const key = [
          container.id,
          season ?? '',
          Math.floor(_p.x / CELL),
          Math.floor(_p.z / CELL),
          material.id,
          signature(obj.geometry),
          obj.renderOrder,
          obj.castShadow ? 1 : 0,
          obj.receiveShadow ? 1 : 0,
          obj.frustumCulled ? 1 : 0,
        ].join(',');
        let bucket = buckets.get(key);
        if (!bucket) {
          bucket = { container, season, material, meshes: [] };
          buckets.set(key, bucket);
        }
        bucket.meshes.push({ mesh: obj, chain });
      }
    }
    // the transforms between the container and each mesh (for the drift check)
    const next = containerSet.has(obj) ? [] : [...chain, obj];
    for (const child of obj.children) visit(child, container, season, next);
  };
  for (const child of world.group.children) visit(child, world.group, null, []);

  let batches = 0;
  for (const bucket of buckets.values()) {
    if (bucket.meshes.length < 2) continue;
    const { container, season, material } = bucket;
    _inv.copy(container.matrixWorld).invert();
    // vertices stay relative to the batch's own center, the offset goes in
    // its matrix: big world coordinates in the vertices would cost float
    // precision on the GPU (z-fighting between surfaces 1 mm apart)
    _box.makeEmpty();
    for (const { mesh } of bucket.meshes) _box.expandByPoint(_p.setFromMatrixPosition(mesh.matrixWorld).applyMatrix4(_inv));
    _box.getCenter(_origin);
    _toOrigin.makeTranslation(-_origin.x, -_origin.y, -_origin.z).multiply(_inv);
    const geos = bucket.meshes.map(({ mesh }) => mesh.geometry.clone().applyMatrix4(_m.multiplyMatrices(_toOrigin, mesh.matrixWorld)));
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) {
      kept += bucket.meshes.length;
      continue;
    }
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    const first = bucket.meshes[0].mesh;
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = 'static-batch';
    mesh.castShadow = first.castShadow;
    mesh.receiveShadow = first.receiveShadow;
    mesh.renderOrder = first.renderOrder;
    mesh.frustumCulled = first.frustumCulled;
    mesh.position.copy(_origin);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    container.add(mesh);
    if (season) {
      (season === 'winter' ? world.winterOnly : world.autumnOnly).push(mesh);
      mesh.visible = world.season === season;
    }
    for (const { mesh: src, chain } of bucket.meshes) {
      sources.push({
        mesh: src,
        chain,
        relative: new THREE.Matrix4().multiplyMatrices(_inv, src.matrixWorld),
        material: src.material,
        geometryVersion: geometryVersion(src.geometry),
      });
      src.removeFromParent();
    }
    batches++;
  }
  world.staticSources = sources;
  return { sources: sources.length, batches, kept };
}

/** Baked meshes whose transform, visibility, material or geometry changed
 * since baking (each one would be a frozen animation): empty when all is well. */
export function staticBatchDrift(world) {
  const seasonal = new Set([...world.winterOnly, ...world.autumnOnly]);
  const drift = [];
  for (const s of world.staticSources ?? []) {
    _m.identity();
    for (const node of s.chain) {
      node.updateMatrix();
      _m.multiply(node.matrix);
    }
    s.mesh.updateMatrix();
    _m.multiply(s.mesh.matrix);
    let moved = false;
    for (let i = 0; i < 16; i++) if (Math.abs(_m.elements[i] - s.relative.elements[i]) > 1e-5) moved = true;
    const changed = s.mesh.material !== s.material || geometryVersion(s.mesh.geometry) !== s.geometryVersion;
    const hidden = [...s.chain, s.mesh].some((node) => !node.visible && !seasonal.has(node));
    if (moved || changed || hidden) drift.push({ name: s.mesh.name || s.mesh.geometry.type, parent: s.chain.at(-1)?.name ?? '', moved, changed, hidden });
  }
  return drift;
}
