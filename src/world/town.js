// The town, as data. Streets, blocks, public buildings, heating mains,
// benches, parked cars and captions — everything a
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

/**
 * Flat ground at y = 0 that things are built on: the town, and the pads of
 * the two island settlements out in the bay. The land shapes itself round
 * them (land.js).
 */
export const PADS = [
  { id: 'town', x0: -250, x1: 250, z0: -600, z1: 200 },
  { id: 'medvezhiy', x0: 1400, x1: 1640, z0: 120, z1: 330, island: true },
  { id: 'rudny', x0: 1180, x1: 1400, z0: -900, z1: -700, island: true },
];

/* ---------------------------------------------------------- streets */

/** axis 'z': runs north-south at x = `at`; axis 'x': east-west at z = `at`. */
export const STREETS = [
  { id: 'kosmonavtov', name: 'Улица Космонавтов', sub: 'Cosmonauts avenue', axis: 'z', at: 0, from: -556, to: 190, half: 6 },
  { id: 'stroiteley', name: 'Улица Строителей', sub: 'Builders street', axis: 'z', at: -170, from: -556, to: 156, half: 6 },
  { id: 'portovaya', name: 'Портовая улица', sub: 'Port street', axis: 'z', at: 118, from: -556, to: 134, half: 6 },
  { id: 'mira', name: 'Улица Мира', sub: 'Peace street', axis: 'x', at: 44, from: -244, to: 124, half: 6 },
  { id: 'zavodskaya', name: 'Заводская улица', sub: 'Factory street', axis: 'x', at: 128, from: 0, to: 124, half: 6 },
  { id: 'shkolnaya', name: 'Школьная улица', sub: 'School street', axis: 'x', at: -152, from: -176, to: 124, half: 6 },
  { id: 'severnaya', name: 'Северная улица', sub: 'North street', axis: 'x', at: 150, from: -176, to: 0, half: 6 },
  // the south district
  { id: 'polyarnaya', name: 'Полярная улица', sub: 'Polar street', axis: 'x', at: -290, from: -176, to: 124, half: 6 },
  { id: 'yuzhnaya', name: 'Южная улица', sub: 'South street', axis: 'x', at: -420, from: -176, to: 124, half: 6 },
  { id: 'geologov', name: 'Улица Геологов', sub: 'Geologists street', axis: 'x', at: -550, from: -176, to: 124, half: 6 },
  // the islands: one street each
  { id: 'rybatskaya', name: 'Рыбацкая улица', sub: 'Fishermen street', axis: 'x', at: 225, from: 1410, to: 1630, half: 6 },
  { id: 'shakhtyorskaya', name: 'Шахтёрская улица', sub: 'Miners street', axis: 'z', at: 1290, from: -890, to: -710, half: 6 },
];

/** Carriageway of a street as a rect. */
export function streetRect(s, grow = 0) {
  return s.axis === 'z'
    ? { x0: s.at - s.half - grow, x1: s.at + s.half + grow, z0: s.from, z1: s.to }
    : { x0: s.from, x1: s.to, z0: s.at - s.half - grow, z1: s.at + s.half + grow };
}

/**
 * Lanes into the yards: plain asphalt from the edge of a street. The
 * sidewalk drops where one starts and the heating mains arch over it.
 */
export const DRIVEWAYS = [
  { x0: 38, x1: 43, z0: 50, z1: 100 },
  { x0: 37, x1: 42, z0: -22, z1: 38 },
  { x0: -43, x1: -38, z0: -22, z1: 38 },
  { x0: -44, x1: -39, z0: 50, z1: 110 },
  { x0: 6, x1: 18, z0: -86, z1: -80 },
  { x0: -46, x1: -41, z0: -146, z1: -112 },
  // south district courts
  { x0: 35.5, x1: 40.5, z0: -340, z1: -296 },
  { x0: -41, x1: -36, z0: -340, z1: -296 },
  { x0: 35.5, x1: 40.5, z0: -470, z1: -426 },
  { x0: -41, x1: -36, z0: -470, z1: -426 },
];

/**
 * Footpaths trodden across the yards, on top of the ones every block gets
 * along its two long sides (streets.js): [x0, x1, z0, z1].
 */
export const PATHS = [
  [43, 55, 77.2, 78.8],
  [61.2, 62.8, 5, 14.4],
  [-56.5, -43, -18.8, -17.2],
  [-60.5, -44, 105.2, 106.8],
  [-76.8, -75.2, -90, -46],
  [-110, -79, -80.8, -79.2],
  [9.2, 18, -70.8, -69.2],
  [-17.2, -9.2, -62.8, -61.2],
];

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
const POL = 'ул. ПОЛЯРНАЯ';
const YUZH = 'ул. ЮЖНАЯ';
const GEO = 'ул. ГЕОЛОГОВ';
const RYB = 'ул. РЫБАЦКАЯ';
const SHA = 'ул. ШАХТЁРСКАЯ';

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
  block('b33', 92, -178, 0, 30, 5, SHK, '1'),

  // ---- the south district (микрорайон Южный), built a decade later:
  // three bands of courts between Polyarnaya, Yuzhnaya and Geologov
  // band 1, east of the avenue: the cinema court
  block('s01', 26, -226, 1, 40, 5, KOSM, '2'),
  block('s02', 98, -226, 1, 40, 5, PORT, '1'),
  block('s03', 62, -266, 0, 44, 9, POL, '4'),
  // band 1, west
  block('s04', -26, -226, 1, 40, 5, KOSM, '1'),
  block('s05', -144, -226, 1, 40, 9, STR, '2'),
  block('s06', -62, -266, 0, 44, 5, POL, '7'),
  block('s07', -112, -266, 0, 40, 5, POL, '11'),
  // band 2, east
  block('s08', 26, -352, 1, 52, 9, KOSM, '2а'),
  block('s09', 98, -352, 1, 44, 5, PORT, '1а'),
  block('s10', 62, -312, 0, 40, 5, POL, '3'),
  block('s11', 62, -396, 0, 44, 5, YUZH, '4'),
  // band 2, west: the bathhouse court
  block('s12', -26, -352, 1, 48, 5, KOSM, '1а'),
  block('s13', -144, -352, 1, 52, 9, STR, '2а'),
  block('s14', -62, -312, 0, 40, 5, POL, '8'),
  block('s15', -110, -312, 0, 40, 9, POL, '12'),
  block('s16', -86, -396, 0, 52, 5, YUZH, '9'),
  // band 3, east
  block('s17', 26, -485, 1, 48, 5, KOSM, '2б'),
  block('s18', 98, -485, 1, 52, 9, PORT, '1б'),
  block('s19', 62, -442, 0, 40, 5, YUZH, '3'),
  block('s20', 62, -528, 0, 44, 9, GEO, '4', { slogan: 'МИРУ — МИР' }),
  // band 3, west: the canteen court
  block('s21', -26, -485, 1, 52, 9, KOSM, '1б'),
  block('s22', -144, -485, 1, 44, 5, STR, '2б'),
  block('s23', -86, -442, 0, 48, 5, YUZH, '10'),
  block('s24', -62, -528, 0, 40, 5, GEO, '7'),
  block('s25', -110, -528, 0, 40, 5, GEO, '11'),
  // beyond Stroiteley and Portovaya, facing the tundra and the bay
  block('s26', -206, -240, 1, 48, 5, STR, '4'),
  block('s27', -206, -352, 1, 52, 9, STR, '4а'),
  block('s28', -206, -485, 1, 48, 5, STR, '4б'),
  block('s29', 146, -240, 1, 44, 5, PORT, '4'),
  block('s30', 146, -352, 1, 48, 9, PORT, '6'),
  block('s31', 146, -485, 1, 44, 5, PORT, '8'),

  // ---- Bear island: the fishing settlement Рыбачий, two rows on a street
  block('i01', 1460, 262, 0, 44, 5, RYB, '2'),
  block('i02', 1530, 262, 0, 40, 5, RYB, '4'),
  block('i03', 1595, 262, 0, 36, 5, RYB, '6'),
  block('i04', 1470, 188, 0, 40, 5, RYB, '1'),
  block('i05', 1585, 188, 0, 44, 5, RYB, '5'),
  // ---- Rudny island: the mine's settlement, either side of its street
  block('r01', 1262, -760, 1, 44, 5, SHA, '3'),
  block('r02', 1262, -840, 1, 40, 5, SHA, '7'),
  block('r03', 1318, -750, 1, 40, 5, SHA, '2'),
  block('r04', 1318, -830, 1, 48, 9, SHA, '6'),
];

/** Which stretch of town a point is in: merged meshes are split by this
 * (about 200 m a side) so the renderer can cull the ones out of view. */
export const zoneKey = (x, z) => `${Math.floor((x + 250) / 250)}:${Math.floor((z + 600) / 200)}`;

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
  { id: 'shop', kind: 'shop', sign: 'ПРОДУКТЫ', x: 62, z: 64, w: 22, d: 10, floors: 1, front: '-z', street: MIRA, number: '7', inside: 'shop' },
  { id: 'kindergarten', kind: 'kindergarten', sign: 'ДЕТСКИЙ САД № 5', x: 62, z: -4, w: 20, d: 12, floors: 2, front: '+z', street: KOSM, number: '10а' },
  { id: 'culture', kind: 'culture', sign: 'ДОМ КУЛЬТУРЫ «ПОЛЯРНИК»', x: 86, z: -84, w: 38, d: 18, floors: 3, front: '-x', street: PORT, number: '2' },
  { id: 'school', kind: 'school', sign: 'ШКОЛА № 3', x: -76, z: -100, w: 54, d: 14, floors: 3, front: '+z', street: SHK, number: '10' },
  { id: 'univermag', kind: 'shop', sign: 'УНИВЕРСАМ', x: -140, z: 66, w: 24, d: 14, floors: 1, front: '-z', street: MIRA, number: '19', inside: 'shop' },
  { id: 'clinic', kind: 'clinic', sign: 'ПОЛИКЛИНИКА', x: -212, z: 160, w: 16, d: 30, floors: 2, front: '+x', street: STR, number: '28' },
  // the south district
  { id: 'cinema', kind: 'cinema', sign: 'КИНОТЕАТР «АВРОРА»', x: 62, z: -226, w: 26, d: 16, floors: 2, front: '-z', street: KOSM, number: '2в' },
  { id: 'banya', kind: 'bath', sign: 'БАНЯ', x: -86, z: -356, w: 22, d: 14, floors: 1, front: '+z', street: POL, number: '10' },
  { id: 'canteen', kind: 'canteen', sign: 'СТОЛОВАЯ № 2', x: -86, z: -486, w: 24, d: 12, floors: 1, front: '+z', street: YUZH, number: '12' },
  { id: 'gastronom', kind: 'shop', sign: 'ГАСТРОНОМ', x: 62, z: -486, w: 22, d: 12, floors: 1, front: '+z', street: YUZH, number: '5', inside: 'shop' },
];

/** Footprint of a public building (its `w` runs along x unless it fronts x). */
export function publicRect(p, grow = 0) {
  return { x0: p.x - p.w / 2 - grow, x1: p.x + p.w / 2 + grow, z0: p.z - p.d / 2 - grow, z1: p.z + p.d / 2 + grow };
}

PUBLIC.push(
  { id: 'rybkoop', kind: 'shop', sign: 'РЫБКООП', x: 1525, z: 190, w: 20, d: 10, floors: 1, front: '+z', street: RYB, number: '3', inside: 'shop' },
  { id: 'club', kind: 'club', sign: 'КЛУБ РЫБАКОВ', x: 1530, z: 300, w: 22, d: 12, floors: 1, front: '-z', street: RYB, number: '4а' },
  { id: 'rudny-shop', kind: 'shop', sign: 'ПРОДУКТЫ', x: 1355, z: -790, w: 10, d: 20, floors: 1, front: '-x', street: SHA, number: '4', inside: 'shop' },
  { id: 'mine-office', kind: 'clinic', sign: 'РУДОУПРАВЛЕНИЕ', x: 1215, z: -800, w: 14, d: 26, floors: 2, front: '+x', street: SHA, number: '5' },
);

/**
 * Home: the one flat in town that is yours. A door of a block, by its
 * entrance number and the side it faces (see blockDoors).
 */
export const HOME = { block: 'b06', number: 2, side: -1, flat: 'кв. 24' };

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
  { x: 62, z: -354 },
  { x: -56, z: -356 },
  { x: -56, z: -486 },
  { x: 1575, z: 300 },
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
  // the south district's main and its west branch
  [
    [13, -139],
    [13, -572],
  ],
  [
    [13, -278],
    [-156, -278],
    [-156, -572],
  ],
];

/** Tin garage rows inside the town: [x0, z, count, facing]. */
export const GARAGE_ROWS = [
  [-238, -124, 12, 1],
  [-238, 34, 0, 1],
  [28, -200, 0, 1],
  [-150, -578, 14, 1],
  [30, -578, 12, 1],
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
  { id: 'spot:cinema', x: 62, z: -246, yaw: Math.PI },
  { id: 'spot:yard-south-east', x: 52, z: -368, yaw: 0 },
  { id: 'spot:yard-banya', x: -70, z: -374, yaw: Math.PI / 2 },
  { id: 'spot:yard-canteen', x: -100, z: -504, yaw: 0.4 },
  { id: 'spot:island-fishers', x: 1500, z: 244, yaw: 0 },
  { id: 'spot:island-mine', x: 1342, z: -740, yaw: -Math.PI / 2 },
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
  // the south district: at the kerb and in the courts
  { x: 4.75, z: -240, heading: 0, color: 0x7a2f30, curb: true },
  { x: -4.75, z: -330, heading: Math.PI, color: 0x4f6a5a, curb: true },
  { x: 4.75, z: -470, heading: 0, color: 0xb0a890, curb: true },
  { x: 70, z: -285.4, heading: Math.PI / 2, color: 0x59657a, curb: true },
  { x: -70, z: -424.6, heading: -Math.PI / 2, color: 0x8a7a62, curb: true, van: true },
  { x: -165.3, z: -380, heading: 0, color: 0x6d3a30, curb: true },
  { x: 50, z: -338, heading: 0.04, color: 0x3e5a6e },
  { x: 53.2, z: -338, heading: -0.03, color: 0xc9c2a8 },
  { x: -120, z: -340, heading: 0, color: 0x5a5f63 },
  { x: -116.8, z: -340, heading: 0.05, color: 0x8c2f28 },
  { x: 84, z: -468, heading: Math.PI / 2, color: 0x6b4a3a },
  { x: -120, z: -468, heading: Math.PI / 2 + 0.04, color: 0x54585e },
  // the islands: what came over on the barge
  { x: 1450, z: 229.6, heading: Math.PI / 2, color: 0x6f7a68, curb: true, van: true },
  { x: 1605, z: 300, heading: 0.1, color: 0x8a7a62 },
  { x: 1294.75, z: -800, heading: 0, color: 0x4a6076, curb: true },
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
  ['Микрорайон Южный', 'South district', -250, 250, -600, -210],
  ['Двор кинотеатра', 'Cinema yard', 34, 90, -256, -200],
  ['Остров Медвежий', 'Bear island', 1270, 1770, -10, 460],
  ['Посёлок Рыбачий', 'Fishing settlement', 1400, 1640, 120, 330],
  ['Остров Рудный', 'Rudny island', 1050, 1530, -1030, -570],
  ['Посёлок Рудный', 'Mine settlement', 1180, 1400, -900, -700],
  ['Нефтебаза', 'Fuel depot', 150, 250, 150, 200],
];

