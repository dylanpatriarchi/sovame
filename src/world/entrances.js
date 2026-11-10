// Entrance porches (подъезды from the outside): a concrete canopy with
// side cheeks, a real steel door with a lit transom, a bulb under the
// canopy washing the wall and the pad. Everything is merged per material
// across the whole district, and one shared PointLight follows the nearest
// porch so the light count never changes (no shader recompiles).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, Rng } from '../util.js';
import { makeSoftCircleTexture } from '../textures.js';
import { BLOCKS, PUBLIC, blockDoors } from './town.js';
import { blockMatrix, publicFrame } from './blocks.js';

const PAD_TOP = 0.26;
/** The ground floor stands on piles: the door is a flight of steps up. */
const RISE = 0.78;
const LANDING = PAD_TOP + RISE;
const STEPS = 5;
const CONCRETE = new THREE.Color(0x8c8981);
const METAL = new THREE.Color(0x3c4144);
const DOOR_COLORS = [0x3f4a43, 0x4a3b30, 0x34404c, 0x5a4a36, 0x463f45];

/**
 * Every door in town: `matrix` sets the building's own frame down in the
 * world, (`lx`, `lz`) is the door in that frame, `side` the way it faces
 * (+1 looks along local +z).
 */
export function allEntrances() {
  const list = [];
  for (const spec of BLOCKS) {
    const matrix = blockMatrix(spec);
    for (const door of blockDoors(spec)) list.push({ ...door, matrix });
  }
  for (const p of PUBLIC) {
    const frame = publicFrame(p);
    list.push({ matrix: frame.matrix, side: frame.side, lx: 0, lz: frame.lz });
  }
  return list;
}

/** Box geometry placed in porch-local space (x along the wall, +z outward). */
function part(w, h, d, x, y, z, side, ox, oz, color) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  if (side < 0) g.rotateY(Math.PI);
  g.translate(ox, 0, oz);
  if (color) {
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) color.toArray(col, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  return g;
}

function plane(w, h, x, y, z, side, ox, oz, flat, level) {
  const g = new THREE.PlaneGeometry(w, h);
  if (flat) g.rotateX(-Math.PI / 2);
  g.translate(x, y, z);
  if (side < 0) g.rotateY(Math.PI);
  g.translate(ox, 0, oz);
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(level), 3));
  return g;
}

export function buildEntrances(ctx) {
  const { world, materials: M } = ctx;
  const rng = new Rng(4242);
  const concrete = []; // concrete, doors and metal share one vertex-colored material
  const snow = [];

  const glow = [];
  const wash = [];
  const spots = [];

  for (const e of allEntrances()) {
    const { side, matrix } = e;
    const ox = e.lx;
    const oz = e.lz;
    const marks = [concrete.length, snow.length, glow.length, wash.length];
    const first = marks.slice();
    const v = new THREE.Vector3();
    const at = (x, z) => v.set(x, 0, z).applyMatrix4(matrix).clone();
    const worldRect = (x0, x1, z0, z1) => {
      const a = at(x0, z0);
      const b = at(x1, z1);
      return [Math.min(a.x, b.x), Math.max(a.x, b.x), Math.min(a.z, b.z), Math.max(a.z, b.z)];
    };
    // canopy slab and two cheeks framing the porch
    concrete.push(part(3.0, 0.16, 1.55, 0, 2.78, 0.78, side, ox, oz, CONCRETE));
    concrete.push(part(3.1, 0.06, 0.08, 0, 2.68, 1.53, side, ox, oz, CONCRETE)); // drip edge
    // cheeks stay shallow: the facade path strips pass ~1.2 m off the wall
    for (const sx of [-1.43, 1.43]) {
      concrete.push(part(0.14, 2.52, 0.5, sx, PAD_TOP + 1.26, 0.25, side, ox, oz, CONCRETE));
      const cx = ox + (side > 0 ? sx : -sx);
      ctx.addColliderRect(...worldRect(cx - 0.12, cx + 0.12, oz + side * 0.25 - 0.3, oz + side * 0.25 + 0.3));
    }
    snow.push(part(3.04, 0.09, 1.58, 0, 2.9, 0.78, side, ox, oz));

    // steel double door with a frame, a transom above, handles, intercom
    const doorColor = new THREE.Color(DOOR_COLORS[rng.int(0, DOOR_COLORS.length - 1)]);
    concrete.push(part(0.69, 2.08, 0.06, -0.36, PAD_TOP + 1.04, 0.05, side, ox, oz, doorColor));
    concrete.push(part(0.69, 2.08, 0.06, 0.36, PAD_TOP + 1.04, 0.05, side, ox, oz, doorColor));
    concrete.push(part(1.62, 0.1, 0.1, 0, PAD_TOP + 2.13, 0.05, side, ox, oz, METAL)); // lintel
    concrete.push(part(1.62, 0.1, 0.1, 0, PAD_TOP + 2.64, 0.05, side, ox, oz, METAL)); // transom head
    for (const sx of [-0.78, 0.78]) concrete.push(part(0.08, 2.44, 0.1, sx, PAD_TOP + 1.22, 0.05, side, ox, oz, METAL));
    for (const sx of [-0.1, 0.1]) concrete.push(part(0.03, 0.3, 0.05, sx, PAD_TOP + 1.05, 0.1, side, ox, oz, METAL));
    concrete.push(part(0.14, 0.22, 0.05, 0.98, PAD_TOP + 1.35, 0.03, side, ox, oz, METAL)); // intercom
    // lamp housing under the canopy
    concrete.push(part(0.34, 0.1, 0.22, 0, 2.64, 0.32, side, ox, oz, METAL));

    // emissive bits: the bulb (hot) and the transom (stairwell glow behind)
    const lit = rng.chance(0.86);
    glow.push(part(0.22, 0.07, 0.15, 0, 2.565, 0.32, side, ox, oz, new THREE.Color(lit ? 2.6 : 0.05, lit ? 1.75 : 0.05, lit ? 0.9 : 0.05)));
    const trans = rng.float(0.25, 0.5);
    glow.push(part(1.44, 0.36, 0.02, 0, PAD_TOP + 2.385, 0.04, side, ox, oz, new THREE.Color(trans, trans * 0.78, trans * 0.48)));

    if (lit) {
      wash.push(plane(3.4, 2.8, 0, 1.75, 0.035, side, ox, oz, false, 1));
      wash.push(plane(3.4, 3.0, 0, PAD_TOP + 0.02, 1.15, side, ox, oz, true, 0.75));
      const p = at(ox, oz + side * 0.75);
      spots.push({ x: p.x, y: 2.35 + RISE, z: p.z });
    }
    // everything so far was built at street level: lift it to the door
    [concrete, snow, glow, wash].forEach((list, i) => {
      for (let k = marks[i]; k < list.length; k++) list[k].translate(0, RISE, 0);
    });
    // the landing (a closed concrete box over the pile gap) and the steps
    concrete.push(part(3.0, LANDING, 1.3, 0, LANDING / 2, 0.65, side, ox, oz, CONCRETE));
    snow.push(part(2.7, 0.05, 0.9, 0, LANDING + 0.025, 0.8, side, ox, oz));
    ctx.addHeightRect(...worldRect(ox - 1.5, ox + 1.5, oz, oz + side * 1.3), LANDING);
    for (let k = 0; k < STEPS; k++) {
      const h = LANDING * (1 - (k + 1) / (STEPS + 1));
      concrete.push(part(2.2, h, 0.3, 0, h / 2, 1.45 + k * 0.3, side, ox, oz, CONCRETE));
      ctx.addHeightRect(...worldRect(ox - 1.1, ox + 1.1, oz + side * (1.3 + k * 0.3), oz + side * (1.6 + k * 0.3)), h);
    }
    // welded pipe rails either side of the flight
    for (const sx of [-1.1, 1.1]) {
      for (const [z, base] of [
        [1.34, LANDING],
        [1.3 + STEPS * 0.3 - 0.05, LANDING / (STEPS + 1)],
      ]) {
        concrete.push(part(0.05, 0.9, 0.05, sx, base + 0.45, z, side, ox, oz, METAL));
      }
      const rail = new THREE.BoxGeometry(0.05, 0.05, Math.hypot(STEPS * 0.3, LANDING * 0.83));
      rail.rotateX(Math.atan2(LANDING * 0.83, STEPS * 0.3));
      rail.translate(sx, LANDING * 0.58 + 0.88, 1.3 + STEPS * 0.15);
      if (side < 0) rail.rotateY(Math.PI);
      rail.translate(ox, 0, oz);
      const col = new Float32Array(rail.attributes.position.count * 3);
      for (let i = 0; i < rail.attributes.position.count; i++) METAL.toArray(col, i * 3);
      rail.setAttribute('color', new THREE.BufferAttribute(col, 3));
      concrete.push(rail);
    }
    // built in the building's own frame: set it down in the world
    [concrete, snow, glow, wash].forEach((list, i) => {
      for (let k = first[i]; k < list.length; k++) list[k].applyMatrix4(matrix);
    });
  }

  const add = (geos, material, { cast = true, receive = true, order = 0 } = {}) => {
    if (!geos.length) return null;
    const mesh = new THREE.Mesh(mergeGeometries(geos), material);
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    mesh.renderOrder = order;
    world.group.add(mesh);
    return mesh;
  };

  add(concrete, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.15 }));
  const snowMesh = new THREE.Mesh(mergeGeometries(snow), M.snow);
  snowMesh.receiveShadow = true;
  world.group.add(snowMesh);

  // the emissive color scales with the lamp level (bulbs off in daylight)
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  add(glow, glowMat, { cast: false });
  const warm = makeSoftCircleTexture(128, '255,196,130', 2.2);
  const washMat = new THREE.MeshBasicMaterial({
    map: warm,
    color: 0xffb877,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  add(wash, washMat, { cast: false, receive: false, order: 2 });

  // one real light that hops to the nearest lit porch
  const light = new THREE.PointLight(0xffc48a, 0, 9, 1.6);
  light.castShadow = false;
  world.group.add(light);

  world.entrances = spots;
  world.porches = {
    update(level, camX, camZ, indoor) {
      const k = clamp(level, 0, 1);
      glowMat.color.setScalar(0.08 + 0.92 * k);
      washMat.opacity = 0.42 * k;
      let best = null;
      let bestD = Infinity;
      for (const s of spots) {
        const d = (s.x - camX) ** 2 + (s.z - camZ) ** 2;
        if (d < bestD) {
          bestD = d;
          best = s;
        }
      }
      if (best) light.position.set(best.x, best.y, best.z);
      // fade with distance so the hop between porches is never visible
      const fade = 1 - clamp((Math.sqrt(bestD) - 14) / 10, 0, 1);
      light.intensity = indoor ? 0 : 14 * k * fade;
    },
  };
}

function makeGrainTexture() {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  let s = 9973;
  for (let i = 0; i < size * size; i++) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    const coarse = (s >>> 16) & 255;
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    // mostly mid-grey with the odd dark or bright stone
    const v = 128 + (coarse - 128) * 0.55 + ((s >>> 20) % 9 === 0 ? ((s >>> 8) & 1 ? 70 : -70) : 0);
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = Math.max(0, Math.min(255, v));
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Facades read as black slabs at night: lift their diffuse a touch with a
 * shared uniform (moonlit concrete, light spill from the windows) so the
 * blocks stay legible against the sky.
 */
export function addFacadeLift(world) {
  world.facadeLift = { value: 0 };
  const grain = { value: makeGrainTexture() };
  for (const mat of world.windowMats) {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uFacadeLift = world.facadeLift;
      shader.uniforms.uGrain = grain;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uFacadeLift;\nuniform sampler2D uGrain;')
        // pebble-dash grain far finer than the facade texture can hold
        .replace('#include <map_fragment>', '#include <map_fragment>\n#ifdef USE_MAP\ndiffuseColor.rgb *= 0.72 + 0.56 * texture2D(uGrain, vMapUv * vec2(46.0, 23.0)).r;\n#endif')
        .replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * uFacadeLift;'
        );
    };
    mat.needsUpdate = true;
  }
}
