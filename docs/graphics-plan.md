# PERVYJ SNEG — Graphics Plan

A drive through a Soviet port town on the Arctic coast: painted panel blocks on
piles, a heating plant, a frozen bay, tundra with no edge. You drive out, find a
bench with a view, have a smoke or a mug of tea, and look at the town. This is the
visual contract: art direction, palette, lighting, techniques, budgets. Deviations
are discussed in the pull request that introduces them. The working log and the
state of the code live in [HANDOFF.md](HANDOFF.md).

## 1. Concept & mood

- **Fantasy**: an evening in Полярный, a town that should not exist this far
  north. Nothing happens. You drive, you stop, you look.
- **Mood words**: remote, cold, ordinary, quiet, stubbornly cheerful.
- **References**: Norilsk, Dudinka, Tiksi, Pevek — five- and nine-storey panel
  blocks painted in loud colours against the polar night, standing on piles over
  permafrost; heating mains boxed above ground and arched over every road;
  shipping containers and tin garages in the yards; a forest of aerials; port
  cranes; red-and-white stacks; a UAZ van on packed snow.
- **Nothing grows.** No trees, no grass. Crows are the only thing alive overhead.
- **Non-goals**: photorealism, objectives, combat, multiplayer. The game is a
  static client-side web page.

## 2. Visual pillars

1. **Painted town, white land** — the tundra and the sea ice are one pale field;
   the town is the only colour for a hundred kilometres. Facade paint is
   saturated and peeling; everything else is snow, concrete and rust.
2. **Cold world, warm windows** — after dark the land goes blue and the town
   glows amber: windows, porch bulbs, sodium lamps, the plant.
3. **A view worth the drive** — every road out ends somewhere to sit: the sopka
   lookout over the town, the lighthouse, the mole with the ship in the ice.
4. **The weather moves, not the world** — falling snow, ground mist, steam lying
   down on the wind, the lighthouse beam, the aurora.
5. **Ordinary detail** — a rocket in every playground, a carpet frame, a kiosk
   with a radio, a stele with the town's name.

## 3. Palette

| Role | Hex | Notes |
| --- | --- | --- |
| Snow (lit) | `#e9eef6` | slightly blue |
| Snow (ploughed, trodden) | `#c7cfd9` | kerbs, footpaths |
| Sea ice | pale blue-grey | flatter and colder than the land |
| Facade paints | pink, cream, yellow, turquoise… | `PAINT_SCHEMES` in `src/textures.js`; chosen per address |
| Pile caps | `#c8b255` | road-marking yellow |
| Concrete | `#8f8d86` | stairs, stele, obelisk |
| Brick (plant) | `#a46a52` | |
| Tin (garages, containers) | faded primaries | ribbed, rust weeping from the top |
| Stacks | `#b5392c` / `#dcdcd6` | red and white bands |
| Window (lit) | `#ffb75e` | emissive |
| Sodium lamp | `#ffd9a0` head, `#ffc480` pool | |
| Aurora | green hem, violet top | additive, night only |

Saturation belongs to paint and light. Snow, ice and sky stay cool and quiet.

## 4. Time of day

One season: winter. Four time presets (`src/config.js`, cross-faded when
switched): **afternoon** (15:20, bright overcast — where the painted facades
read best), **sunset** (17:05), **blue hour** (18:40, the default and the
signature look: deep blue land, every window and lamp cutting through it),
**night** (22:10: moon, stars, aurora in the north).

Blue-hour rules: sky `#2a3c5c` zenith to `#8a90a8` horizon with a faint warm
remnant on the sunset side; ambient light is blue; fog is blue and thin enough
that the town can be read from the lookout two thirds of a kilometre away.

## 5. Lighting model

- **Hemisphere light** per preset does most of the work; a directional sun/moon
  adds soft shadows (off on quality "low").
- **Street and yard lamps are not lights.** A glowing head, an additive pool on
  the ground and a halo sprite, all driven by `world.litLevel`. This is what
  keeps a whole town of lamps at a constant, tiny cost.
- **Real lights**: one porch `PointLight` that hops to the nearest lit entrance,
  the car's headlight spot, sun and hemisphere. Nothing else.
- **Windows**: emissive map per facade, lit share per block, a slow TV flicker
  on one window of most blocks.
- **Dusk lift**: facades, tin and brick add a fraction of their own colour as
  emission after dark (`facadeLift`), so unlit walls stay legible instead of
  dropping to silhouettes.
- **Tone mapping**: ACESFilmic, exposure per preset; a restrained bloom pass
  haloes only genuinely bright sources.

## 6. Sky, fog, weather

- **Sky dome** shader (three-stop gradient per preset), sun/moon discs, a star
  `Points` cloud, a few slow cloud sprites. All of it travels with the camera:
  the world has no edge to stand at.
- **Aurora**: two folded curtains in the northern sky (toward the lighthouse),
  a shader of drifting vertical rays; a hint at blue hour, full at night.
- **Fog**: `FogExp2`, per-preset density scaled by `fogScale`; drifting ground
  mist on top.
- **Snow**: GPU `Points` in a camera-following box.
- **Steam and smoke**: sprite plumes from the plant's stacks, rising a little
  and then lying down on the wind toward the bay.

## 7. Geometry & texturing

- **No external assets.** Every texture is drawn on a canvas at load, every
  sound is synthesised.
- **The land** is one analytic height function (`src/world/land.js`): flat under
  the town, hills and the sopka beyond, the frozen bay to the east, forever
  north and south. Ground rings follow the camera. Roads out of town are data
  (`routes.js`); the land cuts and fills itself under them.
- **The town is data** (`src/world/town.js`): streets, blocks, public buildings,
  lanes, footpaths, pipes, benches, cars, walks. Each block owns its seed and
  may stand along either axis. `npm run check:town` validates the plan.
- **Blocks**: one box per block with a painted facade map (drawn finer on
  quality "high") plus a pebble-dash grain in the shader; real geometry for the
  pile row, the raised porches with their steps, parapets, aerials and dishes.
- **Merging**: trim, porches, piles, the industrial zone and all street
  furniture are merged into a handful of vertex-coloured meshes; posts, poles
  and snow lumps are instanced.
- **Determinism**: everything is seeded from its own id or position, so a
  screenshot is reproducible and adding one thing never moves another.

## 8. Post-processing & UI

- Render pass → bloom → output. Vignette and film grain are a CSS overlay.
- UI: title screen, a small HUD (place caption, clock, temperature, one prompt
  line), pause menu with settings persisted to `localStorage`.
- Typography: condensed uppercase sans with generous tracking; accent red used
  sparingly. Place captions are in Russian with an English sub-line.

## 9. Audio

Procedural WebAudio: wind that follows the gusts, footsteps per surface, the
engine, door and thud of the cars, and a post-punk radio broadcast that plays
from the kiosk or from the dashboard (`R` behind the wheel).

## 10. Performance budget

- 60 fps on a 2019+ integrated-GPU laptop at 1080p; quality `high` / `medium` /
  `low` / `auto`.
- **Draw calls < 300 anywhere in town**, triangles < 600k, no network requests
  after load. `npm run smoke` prints both for three views.

## 11. Module map

```
index.html                 canvas, UI overlay, styles
src/main.js                boot, modes (title / playing / paused), settings, loop
src/interactions.js        what the player can do: radio, benches, cars, prompts
src/settings.js            saved settings, quality resolution
src/config.js              player, time presets, tuning
src/player.js              first-person movement on foot
src/driving.js             behind the wheel: cameras, headlights
src/smoke.js               the smoke and the mug of tea
src/environment.js         sky, aurora, fog, snow, lights per preset
src/audio.js               wind, steps, engine, radio
src/textures.js            canvas texture factory
src/ui.js                  screens and HUD
src/world/index.js         World: build stages, colliders, heights, zones
src/world/town.js          the town plan, as data
src/world/blocks.js        panel blocks and public buildings
src/world/entrances.js     porches, steps, the hopping porch light
src/world/piles.js         the pile row under every block
src/world/streets.js       land, asphalt, sidewalks, lanes, footpaths, ploughed snow
src/world/furniture.js     lamps, benches, kiosk, bus shelter, playgrounds, square, stele
src/world/arctic.js        plant, fuel depot, garages, containers, pipes, port, lighthouse
src/world/routes.js        roads out of town, as data
src/world/roads.js         their surface, marker posts, power line
src/world/land.js          the height function, ground rings, tundra scatter, sea ice
src/world/vehicles.js      cars and the UAZ van
src/world/people.js        passers-by
src/world/crows.js         crows
tools/                     check-town, smoke, drive-test, town-test and other probes
```
