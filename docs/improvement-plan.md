# Improvement Plan — atmosphere, realism, people

Follow-up to `docs/graphics-plan.md`. Three goals from playtest feedback:

1. **Less text** — the district talks too much; signage should be sparse and weathered.
2. **More realism** — push the blue-hour environment from "stylized diorama" to
   "photograph of a real place".
3. **People** — a few pedestrians, so the district feels lived-in.

Each section is one pull request, verified with `npm run build` + `npm run smoke`
and screenshot review against the budgets (<300 draw calls, <600k triangles).

## A. Text reduction (PR: `feat/less-signage`)

In-world text currently lives in `src/textures.js` (posters, rink sign),
`src/world/props.js` (kiosk, bus stop), `src/world/buildings.js` (mosaic plaque),
`src/ui.js` (HUD meta line).

Remove entirely:
- Kiosk goods list `хлеб · молоко · рыба` — the dotted list is exactly the kind of
  clutter to kill. The kiosk keeps its one-word `ПРОДУКТЫ` sign.
- `КАТОК` / `ЗАКРЫТ` rink notice (two stacked texts).
- `С НОВЫМ ГОДОМ!` poster and `БЕРЕГИ ЛЕС` poster.
- Propaganda poster words `СЛАВА ТРУДУ!` / `ГЕРОЯМ ПЯТИЛЕТКИ — СЛАВА` — keep the
  poster as a *graphic* panel (red star, worker silhouette, weathering) with no
  readable words, or drop the poster where a bare wall reads better.

Simplify:
- Mosaic plaque `СЕВЕРНЫЙ · 1964` → just the year `1964`.
- HUD meta `BLUE HOUR · WINTER` → remove the line; clock and temperature stay.
  Zone captions (Cyrillic name + translation) stay — they are the one deliberate
  piece of typography in the game.

Rule of thumb after this PR: at most one short word per sign, no sentences,
no `·`-separated lists anywhere (world or UI).

## B. Environment realism (PR: `feat/realism-pass`)

Targeted upgrades, cheapest-first, all procedural:

1. **Facade weathering** (`src/textures.js`): grime streaks running down from
   window sills and balcony slabs, staining along panel joints, a darker
   splash-zone band on the ground floor, slight per-panel albedo variance,
   snow line along roof parapets and ledges (winter only).
2. **Wet ground** (`src/textures.js`, `src/world/terrain.js`): darker wet asphalt
   with a broad low-roughness sheen; a few puddle decals near drains and curb
   breaks — glossy dark planes that catch sky color and lamp glints; slushy
   tire-track strips on the main road.
3. **Drifting mist** (`src/environment.js` or `src/world/`): 4–8 large soft-alpha
   planes at 1–6 m height, slowly scrolling across courtyards and the far end of
   the avenue; sells depth more than any texture work. Density scales with fog
   preset and season.
4. **Lamp presence**: fake volumetric cones under street lamps (additive gradient
   cone meshes, subtle) plus a warm pool decal on the ground; snowflakes brighten
   when crossing the cone (handled by existing particle lighting if cheap,
   otherwise skip).
5. **Sky & windows**: faint warm remnant band toward the sunset azimuth on the
   dusk gradient; per-window curtain variation (half-lit, top-lit) and 2–3 cool
   TV-flicker windows in the whole district (slow random intensity, blue-white).

Constraints: no new lights (keep the existing lamp pool), no real reflections,
everything seeded-deterministic.

## C. The effect: subtle bloom (PR: `feat/bloom`)

The single "nice effect": **UnrealBloomPass** from `three/addons`, tuned to be
felt, not seen — threshold ≈ 1.0 so only genuinely bright sources (lit windows,
lamp heads, moon) bloom, strength ≈ 0.25–0.4, radius small. Replaces the direct
`renderer.render` call in `src/main.js` with an `EffectComposer`
(RenderPass → UnrealBloomPass → OutputPass). Quality scaler: bloom on for
`high`/`medium`, off for `low`; pixel-ratio caps unchanged. Existing CSS
vignette/grain stays.

Success check: with and without bloom, the frame rate on real hardware stays
within ~10%; in screenshots, lamps and windows gain a soft halo and the scene
keeps its muted contrast (no "glow soup").

## D. Pedestrians (PR: `feat/pedestrians`)

New module `src/world/people.js`, driven from the main loop
(`people.update(dt, elapsed, playerPos)`).

- **Look**: procedural low-poly figures (~1.7 m, <500 tris each): long winter
  coat (box torso), cylinder legs, mittens, head with ushanka / hood / beanie
  variants. Palette: near-black muted tones — at blue hour they read as
  silhouettes with a faint warm rim when crossing lamplight. 4–6 pedestrians
  total. One may carry a plastic bag (small swinging box — very Soviet).
- **Animation**: procedural walk — sin-phase leg/arm swing, slight torso bob and
  counter-sway, speed-matched stride; idle pose (weight shift, occasional head
  turn) for waiting figures.
- **Routes**: waypoint loops along existing sidewalks and courtyard paths —
  avenue both sides, to the bus stop (one figure waits there), past the kiosk,
  one pair walking side by side. Routes are deterministic; figures walk through
  the fog and re-emerge. No player collision (ambient ghosts — acceptable and
  cheap); no interaction.
- **Breath vapor**: a small soft sprite puff from the head every 2–4 s when the
  temperature is ≤ 0 °C; drifts with wind, fades in ~1 s.
- **Audio hook** (optional, only if trivial): soft distant footsteps/мuffs when a
  pedestrian passes within ~8 m of the player; otherwise silent.
- **Smoke test**: one screenshot frames a pedestrian on the avenue.

Non-goals: crowds, dialogue, AI, pathfinding around dynamic obstacles, children,
vehicles in motion.

## E. Movement-direction bug (PR: `fix/player-movement-direction`)

Reported: turning the mouse left and pressing W moves the player *backwards*.
Suspect a sign inconsistency between the yaw applied to the camera and the yaw
used for the movement basis in `src/player.js` (invisible near spawn yaw ≈ 0,
grows with rotation). Audit the whole controller while at it: pitch clamp,
crouch/sprint speeds, collision slide.

## F. Post-punk radio (PR: `feat/postpunk-radio`)

The kiosk radio gets a proper station: a **procedurally synthesized Russian
post-punk-style loop** (WebAudio only — no external files, no copyrighted
material; original composition in the genre's idiom). Cold minor-key bassline
(eighth-note drive), motorik drum machine (tight kick/snare, ticking hats),
chorus-drenched guitar arpeggio (detuned saws through a feedback-delay "chorus"),
sparse doomy synth lead phrases. 2–3 rotating "tracks" from seeded parameter
sets (progression, tempo 95–115 BPM, lead motif) so the station is not a single
loop. Radio on/off stays on `E`; the station keeps playing softly from the
kiosk with distance attenuation.

## G. Building entrances (PR: `feat/entrances`)

2–3 stairwells (подъезды) become enterable. Prompt on the entrance door (`E`),
a dim warm interior: vestibule with mailboxes and a notice board, one or two
flights of stairs, a landing window looking out on the courtyard, the hum of
the heating pipes and a stronger room-tone echo inside. Interiors are minimal
boxes built from the same procedural textures; warm incandescent light against
the blue exterior is the whole point. Entering/exiting fades the camera.
Colliders included; the smoke harness keeps working outdoors.

## H. Cigarette spots (PR: `feat/smoke-spots`)

A few marked quiet spots — the courtyard bench, a stairwell landing window
(from G), the bus stop — show a prompt (`F`). Using it plays a ~25 s
first-person sequence: a simple hand-and-cigarette prop rises into frame, the
ember glows on each drag, thin smoke drifts and bends with the wind, a soft
inhale/exhale; the world keeps living around you (snow, mist, pedestrians).
No mechanics, no counters — just the pause. Cooldown per spot.

## Rollout order

1. `docs: improvement plan` (this file)
2. `feat/less-signage` — quick, do first (touches `textures.js` before realism)
3. `feat/realism-pass`
4. `fix/player-movement-direction`
5. `feat/postpunk-radio`
6. `feat/bloom`
7. `feat/pedestrians`
8. `feat/entrances`
9. `feat/smoke-spots`
