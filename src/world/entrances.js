// Entrance porches (подъезды from the outside): a concrete canopy with
// side cheeks, a real steel door with a lit transom, a bulb under the
// canopy washing the wall and the pad. Everything is merged per material
// across the whole district, and one shared PointLight follows the nearest
// porch so the light count never changes (no shader recompiles).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, Rng } from '../util.js';
import { makeSoftCircleTexture } from '../textures.js';
import { BUILDING_SPECS, EXPANSION_SPECS, SOUTH_SPECS, WEST_SPECS, entranceDoor } from './buildings.js';
import { OUTDOOR_LIGHT_LAYER } from './interiors.js';

const CELL_W = 3.4;
const PAD_TOP = 0.26;
const CONCRETE = new THREE.Color(0x8c8981);
const METAL = new THREE.Color(0x3c4144);
const DOOR_COLORS = [0x3f4a43, 0x4a3b30, 0x34404c, 0x5a4a36, 0x463f45];

/** Every painted entrance cell of every block, both long sides. */
export function allEntrances() {
  const list = [];
  for (const spec of [...BUILDING_SPECS, ...EXPANSION_SPECS, ...WEST_SPECS, ...SOUTH_SPECS]) {
    const cells = Math.max(4, Math.round(spec.w / CELL_W));
    let n = 0;
    for (let c = 0; c < cells; c++) {
      if (c % 4 !== 3) continue;
      n++;
      for (const side of [1, -1]) list.push({ spec, cell: c, side, number: n, ...entranceDoor(spec, c, side) });
    }
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
    const { side } = e;
    const ox = e.x;
    const oz = e.z;
    // canopy slab and two cheeks framing the porch
    concrete.push(part(3.0, 0.16, 1.55, 0, 2.78, 0.78, side, ox, oz, CONCRETE));
    concrete.push(part(3.1, 0.06, 0.08, 0, 2.68, 1.53, side, ox, oz, CONCRETE)); // drip edge
    // cheeks stay shallow: the facade path strips pass ~1.2 m off the wall
    for (const sx of [-1.43, 1.43]) {
      concrete.push(part(0.14, 2.52, 0.5, sx, PAD_TOP + 1.26, 0.25, side, ox, oz, CONCRETE));
      const cx = ox + (side > 0 ? sx : -sx);
      ctx.addBoxCollider(cx, oz + side * 0.25, 0.14, 0.5, 0.05, true);
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
      spots.push({ x: ox, y: 2.35, z: oz + side * 0.75 });
    }
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
  world.group.add(ctx.seasonable('winter', snowMesh));

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
  light.layers.set(OUTDOOR_LIGHT_LAYER);
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

/**
 * Facades read as black slabs at night: lift their diffuse a touch with a
 * shared uniform (moonlit concrete, light spill from the windows) so the
 * blocks stay legible against the sky.
 */
export function addFacadeLift(world) {
  world.facadeLift = { value: 0 };
  for (const mat of world.windowMats) {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uFacadeLift = world.facadeLift;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uFacadeLift;')
        .replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * uFacadeLift;'
        );
    };
    mat.needsUpdate = true;
  }
}
