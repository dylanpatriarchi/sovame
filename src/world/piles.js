// Piles: on permafrost a block never touches the ground. Each one stands on
// a row of concrete piles carrying a painted beam, with a dark ventilated
// gap underneath. The facade texture paints the gap and the inner rows;
// this is the outer row, real geometry, merged into a single mesh.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { facadePaint } from '../textures.js';
import { BLOCKS, CELL_W, FLOOR_H } from './town.js';
import { blockMatrix } from './blocks.js';

/** Height of the gap: the band the facade texture leaves dark. */
export const PILE_H = FLOOR_H * 0.34;

function box(w, h, d, x, y, z, color) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) color.toArray(col, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export function buildPiles(ctx) {
  const { world } = ctx;
  const parts = [];
  const beamH = PILE_H * 0.2;
  for (const block of BLOCKS) {
    // modelled around the block's own origin, then set down
    const spec = { ...block, x: 0, z: 0 };
    const mark = parts.length;
    const { scheme } = facadePaint(spec.street, spec.number);
    const paint = new THREE.Color(scheme.pile).convertSRGBToLinear();
    // the lower half of every pile is road dirt and old snow
    const dirty = paint.clone().multiplyScalar(0.55);
    const cells = Math.max(4, Math.round(spec.w / CELL_W));
    const sideCells = Math.max(2, Math.round(spec.d / CELL_W));
    const cw = spec.w / cells;
    const sw = spec.d / sideCells;
    const pile = (x, z, alongX) => {
      const w = alongX ? 0.44 : 0.3;
      const d = alongX ? 0.3 : 0.44;
      parts.push(box(w, (PILE_H - beamH) * 0.5, d, x, (PILE_H - beamH) * 0.75, z, paint));
      parts.push(box(w + 0.04, (PILE_H - beamH) * 0.5, d + 0.04, x, (PILE_H - beamH) * 0.25, z, dirty));
    };
    for (const side of [1, -1]) {
      const z = spec.z + side * (spec.d / 2 + 0.1);
      for (let c = 0; c <= cells; c++) pile(spec.x - spec.w / 2 + c * cw, z, true);
      for (let c = 0; c < cells; c++) {
        // the porch stands in the entrance bays: no beam across the door
        if (c % 4 === 3) continue;
        const localX = -spec.w / 2 + (c + 0.5) * cw;
        parts.push(box(cw, beamH, 0.16, spec.x + side * localX, PILE_H - beamH / 2, z - side * 0.02, paint));
      }
      const x = spec.x + side * (spec.w / 2 + 0.1);
      for (let c = 1; c < sideCells; c++) pile(x, spec.z - spec.d / 2 + c * sw, false);
      parts.push(box(0.16, beamH, spec.d + 0.2, x - side * 0.02, PILE_H - beamH / 2, spec.z, paint));
    }
    const matrix = blockMatrix(block);
    for (let k = mark; k < parts.length; k++) parts[k].applyMatrix4(matrix);
  }
  const mesh = new THREE.Mesh(mergeGeometries(parts, false), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
  mesh.name = 'piles';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  world.group.add(mesh);
}
