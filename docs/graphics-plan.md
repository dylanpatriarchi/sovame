# PERVYJ SNEG — Graphics Plan

A first-person walking experience set in a Soviet microrayon (microdistrict) in the
near-winter period: late autumn sliding into the first snow. This document is the
visual contract for the whole project: art direction, palette, lighting, rendering
techniques, and performance budgets. Implementation phases must follow it; deviations
are discussed in the relevant pull request.

## 1. Concept & mood

- **Fantasy**: you step out for a walk in a quiet residential district of a late-USSR
  city. Nothing happens, and that is the point — you observe, walk, listen.
- **Mood words**: melancholic, liminal, ordinary, quiet, tender.
- **References**: 5-storey Khrushchyovka and 9–12-storey Brezhnevka panel blocks,
  courtyard playgrounds with welded steel structures, poplars and birches, kiosks,
  bus stops, mosaic panels, laundry lines, boxy Soviet-era cars.
- **Non-goals**: photorealism, characters/NPCs, combat, objectives, multiplayer.
  The game is a client-side static web experience ("online" = playable in a browser).

## 2. Visual pillars

1. **Overcast softness** — the sky is a low, bright-grey ceiling. Shadows are soft or
   absent; form comes from ambient occlusion in textures and hemisphere lighting.
2. **Cold world, warm windows** — the environment reads blue-grey; windows, stairwell
   lights and sodium street lamps read amber. This contrast is the emotional core.
3. **Ordinary detail** — storytelling through props: a swing, a sandbox, a transformer
   box, a faded sign. Small things at eye level, never decorative noise.
4. **The weather moves, not the world** — falling snow, drifting leaves, swaying bare
   branches, smoke from roof vents. Stillness + particle motion = life.

## 3. Palette

Environment colors live in a narrow, desaturated band; accents are warm.

| Role | Hex | Notes |
| --- | --- | --- |
| Concrete panels (light) | `#b8b3a8` | main facade, weathered |
| Concrete panels (grey) | `#8f9296` | Khrushchyovka grey series |
| Brick (faded red) | `#7d5a4c` | brick Khrushchyovka |
| Asphalt | `#4a4c4e` | wet, darker patches |
| Dirt / dead grass | `#6b5f4a` | courtyard ground |
| Snow (lit) | `#dde4ea` | slightly blue |
| Snow (shadow) | `#aab6c4` | |
| Bare bark | `#4c4239` | poplar/birch dark |
| Window glass (dark) | `#1d232b` | unlit |
| Window glass (lit) | `#ffb75e` | warm amber, emissive |
| Sodium lamp | `#ff9d3c` | street lamps |
| Metal paint (playground) | `#3f6d4e` | chipped green |
| Accent red (signs, star) | `#a63a2e` | faded, never pure red |

Rules of thumb: saturation stays below ~35% except for lit windows and lamps; warm
accents occupy < 5% of the frame.

## 4. Time of day & seasons

**The game is staged at blue hour.** The default and signature preset is **blue
hour** (≈18:40, −3 °C): the sun is below the horizon, the sky is a deep saturated
blue (zenith noticeably darker than the horizon band), the panel blocks read as
cool blue-grey masses, and every warm window and sodium lamp cuts through the blue.
This cold/warm contrast is the identity of the whole game; screenshots and the
title screen are art-directed around it.

Four time presets exist (values in `src/config.js`, interpolated smoothly when
switching): **afternoon** (15:20, +2 °C, bright overcast), **sunset** (17:05,
0 °C, low orange sun under the cloud deck), **blue hour** (18:40, −3 °C, deep blue
sky, lamps on, windows lit — the default), **night** (22:10, −6 °C, moon, stars,
pools of lamplight). Blue-hour art direction rules:

- Sky gradient goes from `#2a3c5c` zenith to `#8a90a8` at the horizon, with a
  faint warm remnant (`#c98a5a`, ≤10% of the sky) only on the sunset side.
- Ambient light is blue-dominant (hemisphere sky ≈ `#4b5c74`); unlit surfaces must
  never drift warm.
- Warm sources (windows `#ffb75e`, sodium lamps `#ff9d3c`) are the only saturated
  elements in frame; window-lit probability is high (≈0.5–0.85) so facades sparkle.
- Fog stays blue (`#6b7285`), density just high enough that distant blocks become
  flat blue silhouettes with lit windows floating in them.

Two season presets: **late autumn** (bare + few leaves, mud, litter, first frost) and
**winter** (snow cover, snow mounds, footprints, thicker fog, stronger wind).

Window-lit probability, lamp intensity, fog density and exposure are all per-preset
parameters; switching preset triggers a ~2 s cross-fade of every lighting value.

## 5. Lighting model

- **Hemisphere light** (sky/ground colors per preset) does most of the work — this is
  what makes the overcast look.
- **Directional sun/moon** with soft shadows (PCF, 2048 map on quality "high", off on
  "low"); elevation/azimuth per preset.
- **Street lamps**: emissive head + additive glow sprite; a small number of real
  `PointLight`s near the player's path (pooled, distance-culled), the rest fake it
  with baked blob-light decals on the ground.
- **Windows**: emissive map on the facade texture; a per-building random subset is
  lit, scaled by the preset's `windowLit` probability. Slight intensity variation
  per window; rare slow flicker on a few.
- **Tone mapping**: ACESFilmic, exposure per preset (1.0–1.12).
- **Renderer**: WebGL2, sRGB output, antialias on, `pixelRatio` capped at 2 (auto
  quality can lower it).

## 6. Sky, fog, weather

- **Sky dome**: custom shader on an inverted sphere — three-stop vertical gradient
  (zenith/horizon/ground per preset). No texture assets.
- **Sun/moon**: billboard disc with soft halo (glow strength per preset); moon at
  night. Stars: one `Points` cloud, opacity per preset.
- **Clouds** (cheap): 2–3 large, slow-scrolling noise alpha planes high above the
  district, tinted like the sky; sells the "low ceiling".
- **Fog**: `FogExp2`, per-preset density (≈0.009 afternoon → ≈0.013 dusk). Building
  silhouettes must melt into it at 150–250 m. Fog color matches sky horizon.
- **Snow**: GPU `Points` (~9k particles on high) falling inside a camera-following
  box with wraparound; size/drift/wind from config; amount scales with the snow
  setting and season. **Leaves** (autumn): same system, larger flakes, more tumble.
- **Smoke**: a few chimneys/vent stacks emit billboard smoke columns (looping alpha
  sprites, slow rise, wind drift).
- **Ground snow**: blend of snow/dirt/asphalt via a generated mask (courtyards snowy,
  roads slushy with tire tracks, sidewalks shoveled paths). Winter adds snow mounds
  (soft blobs) along edges and footprints behind the player (decal ring buffer).

## 7. Geometry & texturing strategy

- **No external assets**: every texture is generated at runtime on canvas
  (`src/util.js` helpers: deterministic RNG, wrapped blobs/shapes for tileability).
  Facades, concrete, brick, asphalt, ground, signs, mosaics.
- **Facade textures** per building archetype: window grid + panel seams + grime +
  floor lines; a shared emissive window layer. One 1024² canvas per archetype,
  reused by every instance of that archetype.
- **Instancing** for anything repeated: windows frames/balconies (when 3D), lamps,
  fence modules, trees, benches, cars, trash bins.
- **Merging**: each building is merged into ≤ a handful of draw calls; the whole
  district targets **< 300 draw calls** and **< 600k triangles**.
- **Buildings**: 3 archetypes — 5-storey panel Khrushchyovka (~15 m), 5-storey brick
  Khrushchyovka, 9-storey Brezhnevka tower (~27 m) — with parametric length
  (2–6 entrances), end walls, roof parapet, entrance blocks with numbers, balcony
  strips (Brezhnevka), random but seeded variation.
- **District layout** (deterministic seed): a main road with a crossroads, courtyard
  clusters of buildings around green cores, a playground, a kiosk row, a bus stop,
  a small square with a monument. Playable bounds fenced by fog + distant silhouettes
  (flat dark building cards far out) so the world feels bigger than it is.
- **Props** (low-poly primitives, vertex-color or small canvas textures): playground
  (swing, slide, sandbox, steel climber), benches, lamps, kiosk, bus stop with route
  sign, transformer box, trash bins, fences, laundry lines, parked boxy cars,
  entrance awnings, CCTV-free simplicity. Trees: procedural bare poplar/birch
  (recursive branches), slight wind sway via vertex shader or per-instance rotation.

## 8. Post-processing & UI look

- Cheap by design: no EffectComposer chain. ACES tone mapping + fog carry the look.
- **Vignette + film grain**: a single CSS/canvas overlay (radial gradient +
  animated noise at ~8% opacity). No GPU cost.
- **UI**: title screen with Cyrillic-flavored display type (system fonts styled with
  letter-spacing), small HUD (place caption bottom-left, time/temperature
  bottom-right), pause menu with settings (season, time of day, snow, volume,
  mouse sensitivity, quality, invert Y). Settings persist to `localStorage`.
- Typography: condensed sans, uppercase, generous tracking; UI accents use the
  accent red sparingly.

## 9. Audio–visual coupling

Audio is procedural WebAudio (no assets): filtered-noise wind (stronger in winter /
at night), faint distant traffic hum, occasional dog bark / door slam / crow
(synthesized or skipped if unconvincing), snow-muffled footsteps vs. gravel footsteps
(season-dependent). Visual presets drive audio parameters (wind gain ↔ fog density).

## 10. Performance budget

- 60 fps on a 2019+ integrated-GPU laptop at 1080p; quality scaler: `high` /
  `medium` / `low` / `auto` (drops pixelRatio, particle count, shadows when slow).
- Draw calls < 300, triangles < 600k, textures < 16 MB total, zero network
  requests after load, first interactive frame < 3 s on broadband.
- All generation is deterministic (seeded RNG) so screenshots are reproducible and
  debugging is sane.

## 11. Module map (implementation contract)

```
index.html                  entry, canvas, UI overlay root
src/main.js                 bootstrap, game state (menu → playing → paused)
src/config.js               world/player/preset parameters (single source of truth)
src/util.js                 math, RNG, canvas helpers
src/core/engine.js          renderer, scene, camera, loop, resize, quality scaler
src/core/input.js           keyboard/mouse, pointer lock
src/core/audio.js           WebAudio: wind, footsteps, ambience
src/player/controller.js    FPS movement, AABB collision, head bob
src/world/district.js       layout generation (roads, lots, placement)
src/world/buildings.js      building archetypes + facade textures
src/world/props.js          playground, kiosk, benches, lamps, cars, trees...
src/world/ground.js         terrain, roads, sidewalks, snow blend, footprints
src/world/sky.js            sky dome shader, sun/moon, stars, clouds
src/world/weather.js        snow/leaves particles, smoke columns
src/world/lighting.js       lights, lamp pool, window emissive control
src/world/colliders.js      static AABB registry used by the player
src/world/textures.js       canvas texture factory shared by world modules
src/ui/menu.js              title/pause/settings screens
src/ui/hud.js               captions, clock, temperature, hints
style.css                   UI overlay, vignette/grain, fonts
```

Delivery phases (each its own pull request):
1. **Project foundation** — this plan, English scaffold, README/CONTRIBUTING.
2. **Core engine** — boot, loop, input, player controller, placeholder ground/sky.
3. **District** — layout, buildings, ground, props, colliders.
4. **Atmosphere & UI** — sky/weather/lighting presets, audio, menus, polish.
