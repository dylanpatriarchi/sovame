# Handoff — the Arctic drive pivot

Living document. Update it whenever a decision is made or a phase lands, so
a fresh session can pick the work up without the chat history.

Last updated: 2026-11-10.

## Where the game is going

PERVYJ SNEG stops being a walk through a generic microrayon and becomes a
**driving game in a Soviet Arctic port town** (think Pevek, Tiksi, Dikson,
Norilsk): you get in a car at blue hour, turn the radio on, and drive out
through the town into endless tundra and along a frozen sea, stopping at
spots to get out, smoke or drink, and look.

Decisions taken with the owner (Dylan), in order:

1. **The car is the core.** Driving stays and gets better; everything else
   is judged by whether it serves the drive.
2. **Spots.** Places to stop for a smoke / a drink. Some must be
   **viewpoints over the town from above** (a hill road, a rooftop, the
   cape). Smoking already exists (`src/smoke.js`, key `F`); drinking is new.
3. **No world edge.** Leaving town never hits a wall: the tundra goes on
   forever, procedurally, with the odd plant, rock, pole. The old
   `WORLD.bounds*` limits must go.
4. **A sea.** Arctic Ocean / frozen bay on one side (the owner said "North
   Sea"; the real one for Siberia is the Kara / Laptev / East Siberian Sea).
5. **The town does not read as Soviet today** — the owner's words. The look
   must be rebuilt from real reference (see below), not tweaked.
6. **Graphics up across the board**: building exteriors, interiors, roads.
7. Cut hard. The owner agreed the codebase is bloated (see "What to cut").

8. 2026-11-10: "dai continua tu anche ad immaginazione" — the owner
   handed over the creative decisions. Invent freely; report what was
   decided instead of asking.

Decisions taken on that mandate (the owner can still overrule them):

- **Interiors**: the teleport stairwells and flats are switched off (not
  built, doors do not open). `interiors.js`, `flats.js`, `windowview.js`
  and their wiring in `main.js` are dead code waiting for the Phase 0
  cut. A real in-place stairwell with a roof exit is a later spot.
- **Geography**: town on a flat pad; frozen bay to the east (x > ~520);
  the sopka with the lookout to the west; the coast road north to a
  lighthouse; plant, garages, fuel depot and port between town and bay.

Still open:

- **Pedestrians**: still in; cut or keep?
- **Seasons / times**: proposal is winter only, blue hour + night
  (+ polar-night aurora later). Not confirmed.

## Reference: what these towns actually look like

Photos reviewed on 2026-11-10 (Wikimedia Commons: Pevek, Tiksi, Norilsk).

Town
- **Painted facades.** Whole blocks or panel bays in saturated yellow,
  pink, turquoise, orange, mint — on purpose, against the polar night.
  Often colour blocks / giant supergraphics on end walls. Paint is peeling.
  This is the single biggest "Soviet Arctic" signal and the game has none.
- **Buildings on piles.** Permafrost: the ground floor is raised ~1–1.5 m
  over a ventilated gap (open or slatted). Entrances are reached by a
  flight of steps / metal ramp with railings and a small canopy.
- **Windbreak walls.** In Norilsk long 9-storey blocks join into closed
  courtyards; streets are canyons. Red brick as well as panels.
- **Above-ground utilities.** Heating pipes cannot be buried: insulated
  pipes in wooden/tin boxes (короба) run along every street at knee-to-
  waist height, with П-shaped arches over roads and little wooden
  stair-bridges for pedestrians. Wooden boardwalks on top of them.
- **Low rise near the coast** (Tiksi: 2–5 floors), rooftops bristling with
  antennas; rusty shipping containers and tin garages as sheds everywhere.
- **No trees at all.** Bare gravel, mud, snow, wooden boardwalks.
- Courtyards = parked Ladas/UAZ in snow, a kiosk, a playground.
- Port: gantry cranes on the waterline, visible from everywhere.
- CHP plant chimneys with steam plumes.

Landscape
- Treeless tundra: yellow-brown grass tussocks poking through thin snow,
  dark rock scree, wind-scoured patches, low bald hills (sopki) behind
  the town, snow in gullies.
- Roads: gravel/ice, black-and-white striped marker posts on both sides,
  the occasional guardrail, power-line poles marching along.
- Sea: flat white bay ice to the horizon, pressure ridges, dark leads,
  low white far shore; pack-ice floes where water is open.

Sources: Commons categories `Pevek`, `Tiksi`, Norilsk street photos;
zupagrafika "Norilsk: Landscapes From Outer Space"; gw2ru "The Empire style
beyond the Arctic Circle"; RFE/RL "Abandoned Mining Towns Of The Russian
Arctic"; CNN "Inside Russia's deep-frozen ghost towns" (Vorkuta);
National Geographic / Evgenia Arbugaeva (Tiksi, Dikson).

## Diagnosis of the current code (2026-11-10)

~13k lines in `src/`, written in four days by accretion.

- World = hand-placed absolute coordinates in four clusters
  (`BUILDING_SPECS`, `EXPANSION_SPECS`, `WEST_SPECS`, `SOUTH_SPECS` in
  `src/world/buildings.js`; `west.js`, `south.js`).
- One shared RNG stream consumed in build order, so any addition shifts
  everything; worked around with `legacyColliders`, `collidesHistoric`,
  `heightAtHistoric`, `addLegacyGhostRect`, `north` flags (~70 references).
- Ground is a flat 700 m plane; height comes from `heightRects` (kerbs).
  Hard playable bounds in `World.collides`.
- Interiors are three boxes far east of the map, entered by fade-teleport,
  shared by every door via a hash; floors change by fade; windows are
  render-to-texture portals (`windowview.js`). ~1500 lines.
- `src/main.js` is one 700-line `boot()` closure wiring every interaction.
- Worth keeping: car physics (`src/world/vehicles.js`, `src/driving.js`),
  `environment.js` (sky, fog, snow), `audio.js` (engine, wind, procedural
  post-punk radio), `player.js`, `smoke.js`, the canvas-texture toolkit.

## Target architecture

- **Terrain**: one analytic height function `h(x, z)` (seeded noise), flat
  under the town and under roads, the sea where it drops below 0. Ground
  meshes are chunks streamed around the camera — this is what makes the
  world endless. Car and player sample `h`.
- **World as data**: one layout file (blocks, streets, pipes, props,
  spots). Every object derives its RNG from its own id — no shared stream,
  no legacy shadows.
- **Collisions**: spatial hash grid instead of a linear list.
- **Scatter** (tussocks, rocks, poles, marker posts): per chunk,
  deterministic from chunk coordinates, instanced.
- **Spots as data**: position, seat pose, what you can do (smoke / drink),
  what you look at.
- **Explicit game state machine** (title, driving, on foot, sitting,
  paused) instead of scattered flags.

## Phases

0. **Cuts** — flats, portal windows, floor hopping, autumn, extra times,
   west/south clusters, legacy scatter machinery, debug tools.
1. **Endless terrain** — height function, streamed chunks, no bounds,
   car follows slopes, tundra scatter.  ← start here
2. **Town rebuild from reference** — layout as data; painted panel blocks
   on piles, raised entrances, pipe boxes, containers, antennas, port
   cranes, CHP chimney; no trees.
3. **Roads** — splines, marker posts, guardrails, power lines; the hill
   road up to the viewpoint.
4. **Sea** — bay ice, ridges, leads, far shore, port.
5. **Spots** — viewpoints first; drinking; radio in the car.
6. **Graphics pass** — facade materials, road surface, lighting, post.

## Working rules

- `CONTRIBUTING.md`: English in code/docs/commits, Conventional Commits,
  feature branches + PRs, **no Co-authored-by trailers**.
- The owner writes in Italian; answer in Italian.
- Verify with `npm run build` and `npm run smoke` (needs `npm run dev`
  running; uses system Chrome through `puppeteer-core`).
- `tools/_*.mjs` are untracked debug probes from earlier sessions — not
  deleted yet (untracked = unrecoverable); ask before removing.

## Log

- 2026-11-10 — pivot agreed, reference gathered, this file created.
- 2026-11-10 — **Phase 1 started** on branch `feat/endless-tundra`
  (uncommitted): `src/world/land.js` (height function `landExact` /
  `landHeight`, two camera-following ground rings, tussock + stone scatter
  hashed per 7 m cell); `World.heightAt` adds the land; world bounds and
  the outer perimeter fences removed; fake skyline boxes hidden; sky, stars
  and moon follow the camera; car tilts with the slope (`slopePitch`,
  `slopeRoll`) and feels gravity on hills. Check with
  `node tools/tundra-test.mjs` (screenshots in `shots/tundra/`).
  Known leftovers:
  - a large dark ground plane east of town (~x 300) left over from the old
    layout, and three fake "distant" factories + water tower without
    colliders — all go with the Phase 2 town rebuild;
  - looking back at the whole town from outside costs ~1900 draw calls
    (fog hides it; needs distance culling or the Phase 2 merge);
  - fog is still the town's dense fog: the tundra needs a longer view;
  - phase 0 cuts not done yet (waiting on the interiors answer);
  - the town pad is a hard-coded rect `TOWN_PAD` in `land.js`; roads do
    not continue past the old fence line yet (Phase 3).
- 2026-11-10 — owner sent eight reference photos (Anadyr-style blocks in
  pink/lilac/yellow/blue bays with a dark-red ground floor; a peeling red
  street at sunset with UAZ vans; Norilsk Stalinist yellow + coral; a
  pebble-dash block on yellow-capped piles with a green ground floor and
  a drive-through passage; the Dikson airport tower and its red-and-white
  striped sign; ruined blocks on a hillside with a suspension bridge).
  Did not answer the interiors question — still open.
- 2026-11-10 — **Phase 2, first slice** (same branch, uncommitted):
  - `src/textures.js`: `PAINT_SCHEMES` (8 schemes), `facadePaint(street,
    number)` picks one per block by hashing its address, `paintFacade`
    paints bays, accent stripes, window-row bars, a darker ground floor,
    peeling and pebble-dash. The plinth band is now a dark pile gap.
    `spec.base` / `spec.plinth` are no longer used.
  - `src/world/piles.js`: outer pile row + painted beam for every block,
    one merged vertex-coloured mesh.
  - `World.buildTreeless()` in `src/world/index.js`: runs the old
    vegetation pass (crows, RNG draws) and removes every tree, spruce,
    bush and trunk collider it adds. Temporary until the rebuild.
  - `node tools/town-test.mjs` → `shots/town/` (day + blue hour).
  Next in Phase 2: enclosed porch boxes with outside stairs, above-ground
  pipe boxes with road arches, containers/tin garages in courtyards, roof
  antenna clutter and satellite dishes, drive-through passages, end-wall
  supergraphics, UAZ van as a second vehicle, softer (non-rectangular)
  peeling, higher facade texel density; then port cranes + CHP chimney,
  then the hill road and the first viewpoint spot. The New Year tree and
  the kiosk stay. Old props that no longer fit (honour board, playground
  swings among trees, "woodland" snow mounds) need a pass.

- 2026-11-10 — **Land, roads, sea, industry, spots** (same branch,
  uncommitted). Map of the new pieces:
  - `src/world/noise.js` — `hash2`, `noise2`, `seeded`.
  - `src/world/routes.js` — roads as data: `ROUTES` (`sopka` spiral up
    the hill, `coast` north to the lighthouse ~2.5 km, `port` out onto
    the mole), each resampled every 5 m with a smoothed height profile
    (`initRoutes`), `routeAt(x, z)` spatial-hash lookup, `coastX(z)`,
    `SEA_Y`, `SOPKA`.
  - `src/world/land.js` — `landBase` (hills + sopka + shore), `landExact`
    (roads cut/filled in), `landHeight` (drawn surface or the ice),
    `isIce`; sea-ice sheet following the camera; rafted ice along
    pressure ridges; no grass on roads. `TOWN_PAD` now reaches x = 250
    (industrial strip).
  - `src/world/roads.js` — packed-snow ribbons, plazas, striped marker
    posts, the leaning power line along the coast road.
  - `src/world/arctic.js` — heat-and-power plant with striped chimneys,
    beacons and steam; fuel tanks; garage cooperative; containers hashed
    into courtyards + a yard by the port road; boxed heating mains with
    arches over every road and wooden step-overs; roof aerials and
    dishes; port cranes, harbour office, the ship frozen in the bay;
    lighthouse with sweeping beams; lookout rail, benches. Baked into
    four merged meshes (flat / tin / brick / glow). Fake lamp light:
    additive ground pools + halo points driven by `world.litLevel`.
    Exposes `world.spots` (benches) and `world.points.{plant, ship,
    lighthouse, lookout}`.
  - Spots: every bench in `world.spots` offers **F — smoke** and
    **G — tea from the thermos** (`Smoke.start(spot, 'tea')`,
    `updateTea`). Lookout (sopka), lighthouse, port mole.
  - Fog: `Environment.fogScale` (default 0.13) multiplies every preset —
    the town is now visible from the hill.
  - Removed: fake distant factories and water tower.
  - Check with `node tools/land-test.mjs [time] [view-prefix]` →
    `shots/land/`.
  Known rough edges: dusk is very dark outside the lamps (materials go
  to silhouette); pipe run along the avenue passes close to old props
  (billboard, bus stop); the mug sits on a hand modelled for a cigarette;
  draw calls in town still ~1800; old town roads are still flat planes
  with a different surface from the new ribbons.
  Verified 2026-11-10: `npm run build` passes; `tools/land-test.mjs`,
  `tools/spot-test.mjs` (tea at the lookout and the mole, smoke at the
  lighthouse) and `tools/tundra-test.mjs` (car along the coast road) run
  with no console errors. Driving up the sopka spiral was not tested by
  car, only on foot.
  **Next**: second vehicle (UAZ van); raised entrance porches with
  outside stairs; softer paint peeling and sharper facades; the town's
  own streets redone as ribbons; a brighter blue hour outside the lamps
  (plant and garages are near-silhouettes); a town-name stele on the
  coast road; aurora; then the Phase 0 cuts and the draw-call diet.
- 2026-11-10 — **Van, porches, facades, blue hour** (same branch,
  uncommitted):
  - `vehicles.js`: `vanParts()` — the UAZ-452 "loaf" on the sedan's
    running gear; `Car.eye` (per-model driver eye, used by `driving.js`).
    Three vans in `PARKED` (`van: true`): avenue curb, garage lane, port
    mole.
  - `entrances.js`: porches lifted by `RISE` onto a closed landing with
    five steps, pipe rails and height rects (walkable); `addFacadeLift`
    now also multiplies a fine tiling grain into every facade.
  - `textures.js`: peeling is ragged polygons with a hairline shadow
    instead of rectangles.
  - `config.js`: blue-hour hemisphere colours raised (snow and unlit
    walls read; intensity unchanged so the facade lift still works).
  - `tools/climb-test.mjs`: autopilot drives a van up the sopka spiral —
    reached the lookout (y 48) within ~2.4 m of the centre line, no
    console errors. `tools/town-test.mjs` takes a 4th arg (one time).
  Rough edges: facades are still soft at arm's length (64 px per panel;
  the grain helps little); the van body is a plain box from behind;
  `env.setTime` did not visibly switch from dusk within the test's wait
  in the last runs (not investigated).
  **Next**: Phase 0 cuts (interiors/flats/windowview, autumn, legacy
  scatter machinery), town streets as ribbons, town-name stele, aurora,
  draw-call diet, radio toggle from the driver's seat.
- 2026-11-10 — committed `f386168` (everything up to here), then
  **Phase 0 cuts, first pass**:
  - deleted `src/world/interiors.js`, `src/world/flats.js`,
    `src/windowview.js` and all their wiring in `main.js` (doors, floors,
    portal renders, interior layer); `World.interiorAt` and the landing
    smoke spot are gone. `Environment.setIndoors` / `Sound.setIndoors`
    stay for the future real stairwell.
  - deleted `src/world/vegetation.js` (and the tree scatter helpers in
    `west.js` / `south.js`); crows live in `src/world/crows.js` with
    their own seed.
  - `tools/smoke.mjs` rewritten for the new game (boot, three views, a
    short drive, tea at a bench; exits 1 on console errors);
    `tools/playtest.mjs` removed (it walked the old stairwells).
    `tools/tour.mjs` and `tools/drive-test.mjs` were not re-run.
  Still to cut: autumn season and the extra time presets, the legacy
  scatter machinery (`legacyColliders`, `collidesHistoric`,
  `heightAtHistoric`, `addLegacyGhostRect`, `north` flags), unused
  texture makers, `WORLD.bounds*`, the far-detail groups.
