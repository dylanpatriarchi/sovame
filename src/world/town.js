// The town, as data. Streets, blocks, public buildings, heating mains,
// benches, parked cars, captions and the walks people take — everything a
// builder needs to know about where things are. No three.js in here: the
// layout can be checked from node (tools/check-town.mjs).
//
// Axes: +x east (the bay), +z north (the lighthouse). Streets are axis
// aligned. A block is `w` long and 12 m deep; `rot: 0` lays its long side
// along x, `rot: 1` along z.

export const CELL_W = 3.4;
export const FLOOR_H = 3.0;
export const BLOCK_D = 12;
export const SIDEWALK = 3.2;

/* ---------------------------------------------------------- streets */

/** axis 'z': runs north-south at x = `at`; axis 'x': east-west at z = `at`. */
export const STREETS = [
  { id: 'kosmonavtov', name: 'Улица Космонавтов', sub: 'Cosmonauts avenue', axis: 'z', at: 0, from: -200, to: 190, half: 6 },
  { id: 'stroiteley', name: 'Улица Строителей', sub: 'Builders street', axis: 'z', at: -170, from: -158, to: 156, half: 6 },
  { id: 'portovaya', name: 'Портовая улица', sub: 'Port street', axis: 'z', at: 118, from: -158, to: 134, half: 6 },
  { id: 'mira', name: 'Улица Мира', sub: 'Peace street', axis: 'x', at: 44, from: -244, to: 124, half: 6 },
  { id: 'zavodskaya', name: 'Заводская улица', sub: 'Factory street', axis: 'x', at: 128, from: 0, to: 124, half: 6 },
  { id: 'shkolnaya', name: 'Школьная улица', sub: 'School street', axis: 'x', at: -152, from: -176, to: 124, half: 6 },
  { id: 'severnaya', name: 'Северная улица', sub: 'North street', axis: 'x', at: 150, from: -176, to: 0, half: 6 },
];

/** Carriageway of a street as a rect. */
export function streetRect(s, grow = 0) {
  return s.axis === 'z'
    ? { x0: s.at - s.half - grow, x1: s.at + s.half + grow, z0: s.from, z1: s.to }
    : { x0: s.from, x1: s.to, z0: s.at - s.half - grow, z1: s.at + s.half + grow };
}

/* ---------------------------------------------------------- blocks */

function seedOf(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) % 100000;
}

const block = (id, x, z, rot, w, floors, street, number, extra = {}) => ({
  id,
  x,
  z,
  rot,
  w,
  d: BLOCK_D,
  floors,
  street,
  number,
  balcony: 0.34 + (seedOf(id) % 20) / 100,
  lit: 0.42 + (seedOf(id + 'l') % 14) / 100,
  seed: seedOf(id),
  tv: seedOf(id + 't') % 3 !== 0,
  ...extra,
});

const KOSM = 'ул. КОСМОНАВТОВ';
const MIRA = 'ул. МИРА';
const ZAV = 'ул. ЗАВОДСКАЯ';
const STR = 'ул. СТРОИТЕЛЕЙ';
const SHK = 'ул. ШКОЛЬНАЯ';
const PORT = 'ул. ПОРТОВАЯ';
const SEV = 'ул. СЕВЕРНАЯ';

/**
 * Panel blocks, grouped by the courtyard they wall in. The long blocks stand
 * shoulder to shoulder against the wind, the way Norilsk was laid out.
 */
export const BLOCKS = [
  // north-east court: Kosmonavtov / Mira / Zavodskaya / Portovaya
  block('b01', 26, 86, 1, 44, 5, KOSM, '14'),
  block('b02', 70, 108, 0, 44, 9, ZAV, '3', { slogan: 'СЛАВА ТРУДУ' }),
  block('b03', 98, 78, 1, 38, 5, PORT, '9'),
  // north of Zavodskaya
  block('b04', 40, 158, 0, 40, 5, ZAV, '4'),
  block('b05', 92, 158, 0, 34, 5, ZAV, '8'),
  // east court: the kindergarten yard
  block('b06', 26, -4, 1, 48, 9, KOSM, '10'),
  block('b07', 66, 24, 0, 40, 5, MIRA, '5'),
  block('b08', 98, -6, 1, 44, 5, PORT, '5'),
  block('b09', 62, -36, 0, 48, 5, KOSM, '8'),
  // south of the square
  block('b10', 62, -126, 0, 44, 5, SHK, '6'),
  // west of the avenue, first court
  block('b11', -26, -4, 1, 48, 5, KOSM, '9'),
  block('b12', -66, 24, 0, 40, 9, MIRA, '12'),
  block('b13', -66, -36, 0, 44, 5, KOSM, '7'),
  block('b14', -104, -6, 1, 40, 5, MIRA, '16'),
  // second court, up to Stroiteley
  block('b15', -134, 24, 0, 36, 5, MIRA, '20'),
  block('b16', -144, -20, 1, 44, 9, STR, '11'),
  // the school quarter
  block('b17', -26, -92, 1, 52, 5, KOSM, '3'),
  block('b18', -134, -70, 0, 36, 5, STR, '7'),
  block('b19', -134, -120, 0, 36, 9, STR, '3'),
  // north-west court
  block('b20', -26, 96, 1, 52, 9, KOSM, '15'),
  block('b21', -70, 64, 0, 44, 5, MIRA, '11'),
  block('b22', -70, 128, 0, 44, 5, SEV, '6'),
  block('b23', -118, 96, 1, 48, 5, MIRA, '17'),
  block('b24', -144, 118, 1, 34, 12, STR, '21'),
  // north of Severnaya
  block('b25', -60, 172, 0, 48, 5, SEV, '5'),
  block('b26', -126, 172, 0, 40, 5, SEV, '9'),
  // the far side of Stroiteley
  block('b27', -206, 96, 1, 48, 5, STR, '24'),
  block('b28', -206, -4, 1, 52, 9, STR, '16'),
  block('b29', -206, -90, 1, 44, 5, STR, '8'),
  // south of Shkolnaya
  block('b30', -60, -178, 0, 48, 9, SHK, '11'),
  block('b31', 40, -178, 0, 44, 5, SHK, '5'),
  block('b32', -130, -178, 0, 40, 5, SHK, '15'),
  block('b33', 96, -178, 0, 30, 5, SHK, '1'),
];

/* ---------------------------------------------------------- frames */

/** Block-local point (lx along the long side, lz toward the front) to world. */
export function toWorld(spec, lx, lz) {
  return spec.rot ? { x: spec.x + lz, z: spec.z - lx } : { x: spec.x + lx, z: spec.z + lz };
}

/** Block-local rect to a world rect. */
export function rectToWorld(spec, x0, x1, z0, z1) {
  const a = toWorld(spec, x0, z0);
  const b = toWorld(spec, x1, z1);
  return { x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), z0: Math.min(a.z, b.z), z1: Math.max(a.z, b.z) };
}

/** Footprint of a block or building, optionally grown. */
export function footprint(spec, grow = 0) {
  return rectToWorld(spec, -spec.w / 2 - grow, spec.w / 2 + grow, -spec.d / 2 - grow, spec.d / 2 + grow);
}

export function blockCells(spec) {
  return Math.max(4, Math.round(spec.w / CELL_W));
}

/**
 * The entrance doors of a block, in block-local space: one in every fourth
 * cell, on both long sides (side +1 faces local +z). The facade texture is
 * mirrored on the far side, hence the x flip.
 */
export function blockDoors(spec) {
  const cells = blockCells(spec);
  const cw = spec.w / cells;
  const doors = [];
  let n = 0;
  for (let c = 0; c < cells; c++) {
    if (c % 4 !== 3) continue;
    n++;
    for (const side of [1, -1]) {
      doors.push({ cell: c, side, number: n, lx: side * (-spec.w / 2 + (c + 0.5) * cw), lz: side * (spec.d / 2) });
    }
  }
  return doors;
}

/* ---------------------------------------------------------- public buildings */

/**
 * Low buildings with a sign over the door. `w` × `d` footprint, `front`
 * says which way the entrance looks ('+x', '-x', '+z', '-z').
 */
export const PUBLIC = [
  { id: 'shop', kind: 'shop', sign: 'ПРОДУКТЫ', x: 62, z: 64, w: 22, d: 10, floors: 1, front: '-z', street: MIRA, number: '7' },
  { id: 'kindergarten', kind: 'kindergarten', sign: 'ДЕТСКИЙ САД № 5', x: 62, z: -4, w: 20, d: 12, floors: 2, front: '+z', street: KOSM, number: '10а' },
  { id: 'culture', kind: 'culture', sign: 'ДОМ КУЛЬТУРЫ «ПОЛЯРНИК»', x: 86, z: -84, w: 38, d: 18, floors: 3, front: '-x', street: PORT, number: '2' },
  { id: 'school', kind: 'school', sign: 'ШКОЛА № 3', x: -76, z: -100, w: 54, d: 14, floors: 3, front: '+z', street: SHK, number: '10' },
  { id: 'univermag', kind: 'shop', sign: 'УНИВЕРСАМ', x: -140, z: 66, w: 24, d: 14, floors: 1, front: '-z', street: MIRA, number: '19' },
  { id: 'clinic', kind: 'clinic', sign: 'ПОЛИКЛИНИКА', x: -212, z: 160, w: 16, d: 30, floors: 2, front: '+x', street: STR, number: '28' },
];

/** Footprint of a public building (its `w` runs along x unless it fronts x). */
export function publicRect(p, grow = 0) {
  return { x0: p.x - p.w / 2 - grow, x1: p.x + p.w / 2 + grow, z0: p.z - p.d / 2 - grow, z1: p.z + p.d / 2 + grow };
}

/* ---------------------------------------------------------- places */

/** The square in front of the House of Culture. */
export const SQUARE = { x0: 18, x1: 66, z0: -112, z1: -54 };
export const SQUARE_TREE = { x: 44, z: -84 };
export const OBELISK = { x: 56, z: -84 };

/** Playgrounds: centre of a ~14 m patch in a courtyard. */
export const PLAYGROUNDS = [
  { x: 62, z: 86 },
  { x: -66, z: -8 },
  { x: -72, z: 98 },
  { x: -98, z: -124 },
];

export const KIOSK = { x: -13.4, z: -62, front: '+x' };
export const BUS_STOP = { x: -11.4, z: 66 };

/** Heating mains: axis-aligned runs from the plant (see arctic.js). */
export const PIPES = [
  [
    [169, -94],
    [132, -94],
    [132, -139],
    [13, -139],
    [13, 190],
  ],
  [
    [13, -139],
    [-156, -139],
    [-156, 139],
  ],
  [
    [-156, -139],
    [-236, -139],
  ],
];

/** Tin garage rows inside the town: [x0, z, count, facing]. */
export const GARAGE_ROWS = [
  [-238, -124, 12, 1],
  [-238, 34, 0, 1],
  [28, -200, 0, 1],
].filter((r) => r[2] > 0);

/**
 * Benches: `yaw` is where the sitter looks (0 = -z, -PI/2 = +x). Every one
 * is a spot for a smoke or a mug of tea.
 */
export const BENCHES = [
  { id: 'spot:yard-ne', x: 56, z: 78, yaw: 0.3 },
  { id: 'spot:yard-kindergarten', x: 44, z: -14, yaw: -Math.PI / 2 },
  { id: 'spot:yard-west', x: -58, z: -18, yaw: Math.PI / 2 },
  { id: 'spot:yard-nw', x: -62, z: 106, yaw: Math.PI },
  { id: 'spot:square', x: 36, z: -70, yaw: Math.PI * 0.8 },
  { id: 'spot:school', x: -52, z: -76, yaw: Math.PI / 2 },
];

/* ---------------------------------------------------------- cars */

/** Parked cars: heading 0 points +z, PI/2 points +x. `curb` = on a street. */
export const PARKED = [
  { x: 4.75, z: 30, heading: 0, color: 0xc9c2a8, curb: true },
  { x: -4.75, z: -24, heading: Math.PI, color: 0x8c2f28, curb: true },
  { x: 4.75, z: 74, heading: 0, color: 0x6f7a68, curb: true, van: true },
  { x: 58, z: 48.6, heading: Math.PI / 2, color: 0x4a6076, curb: true },
  { x: -84, z: 39.4, heading: -Math.PI / 2, color: 0x8a7a62, curb: true },
  { x: -165.3, z: -58, heading: 0, color: 0x5a5f63, curb: true },
  // courtyards
  { x: 46, z: 96, heading: 0.06, color: 0x6d3a30 },
  { x: 49.2, z: 96, heading: -0.03, color: 0x3f4a45 },
  { x: 78, z: 6, heading: Math.PI / 2 + 0.05, color: 0x7d8078 },
  { x: 78, z: 9.2, heading: Math.PI / 2, color: 0x54585e },
  { x: -84, z: -14, heading: 0.04, color: 0x6b4a3a },
  { x: -80.8, z: -14, heading: -0.05, color: 0x4f6a5a },
  { x: -126, z: -2, heading: Math.PI / 2, color: 0x7a2f30 },
  { x: -92, z: 92, heading: 0.02, color: 0x59657a },
  { x: -88.8, z: 92, heading: 0.05, color: 0xb0a890 },
  { x: -186, z: 14, heading: 0, color: 0x5c5148 },
  // by the House of Culture and the school
  { x: 72, z: -58, heading: Math.PI / 2, color: 0x3e5a6e },
  { x: -100, z: -80, heading: Math.PI / 2 - 0.04, color: 0x8a8f94 },
  { x: 40, z: -196, heading: Math.PI / 2, color: 0x6a5a40 },
  // UAZ vans in the garage lane and out on the port mole
  { x: 166, z: 24.6, heading: Math.PI / 2, color: 0xb9b39c, van: true },
  { x: 572, z: 50, heading: Math.PI / 2 - 0.3, color: 0x54687a, van: true },
];

/* ---------------------------------------------------------- captions */

export const ZONES = [
  ['Полярный', 'The town', -250, 250, -210, 200],
  ['Площадь Первопроходцев', 'Pioneers square', SQUARE.x0, SQUARE.x1, SQUARE.z0, SQUARE.z1],
  ['Двор детского сада', 'Kindergarten yard', 34, 90, -28, 16],
  ['Школьный двор', 'School yard', -110, -40, -132, -64],
  ['Промзона', 'Industrial zone', 128, 250, -150, 60],
  ['Нефтебаза', 'Fuel depot', 150, 250, 150, 200],
];

/* ---------------------------------------------------------- people */

/**
 * Walks. A point is [x, z] or { x, z, wait, face: [dx, dz] }; the people
 * module checks every point and segment against the built world and bends
 * a route round anything in its way.
 */
export const WALKS = {
  avenue: {
    mode: 'loop',
    points: [
      [7.6, -140], [7.6, -60], [7.6, 30], [7.6, 120], [7.6, 180],
      [-7.6, 180], [-7.6, 120], [-7.6, 30], [-7.6, -60], [-7.6, -140],
    ],
  },
  mira: {
    mode: 'pingpong',
    points: [{ x: 110, z: 51.6, wait: 2 }, [40, 51.6], [-40, 51.6], [-120, 51.6], { x: -160, z: 51.6, wait: 3 }],
  },
  kiosk: {
    mode: 'pingpong',
    points: [{ x: -7.6, z: -20, wait: 2 }, [-7.6, -56], { x: -10.6, z: -62, wait: 7, face: [-1, 0] }],
  },
  busStop: { mode: 'idle', points: [{ x: -9.6, z: 67.5, face: [1, 0] }] },
  yard: {
    mode: 'pingpong',
    points: [{ x: 40, z: -8, wait: 3 }, [40, 8], [56, 10], { x: 74, z: 10, wait: 2 }],
  },
  square: {
    mode: 'pingpong',
    points: [{ x: 22, z: -60, wait: 2 }, [36, -78], { x: 52, z: -92, wait: 4, face: [-1, 0] }, [70, -100]],
  },
  school: {
    mode: 'pingpong',
    points: [{ x: -7.6, z: -80, wait: 1 }, [-14, -84], [-40, -84], { x: -60, z: -86, wait: 3, face: [0, -1] }],
  },
};

export const WALKERS = [
  { walk: 'avenue', variant: 0, speed: 1.35, scale: 1.03, phase: 0.7, start: 0.33 },
  { walk: 'avenue', variant: 2, speed: 1.2, scale: 0.97, phase: 2.2, start: 0.8 },
  { walk: 'mira', variant: 1, speed: 1.15, scale: 1.0, phase: 0, start: 0.45 },
  { walk: 'kiosk', variant: 2, speed: 1.25, scale: 1.04, phase: 2.8, start: 0.55, bag: true },
  { walk: 'busStop', variant: 1, scale: 0.97, phase: 4.1 },
  { walk: 'yard', variant: 0, speed: 1.1, scale: 1.01, phase: 3.6, start: 0.4 },
  { walk: 'square', variant: 2, speed: 1.2, scale: 0.96, phase: 5.2, start: 0.6, bag: true },
  { walk: 'school', variant: 1, speed: 1.1, scale: 0.95, phase: 1.9, start: 0.3 },
];
