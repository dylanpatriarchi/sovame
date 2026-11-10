# PERVYJ SNEG

A drive through Полярный, a Soviet port town on the Arctic coast: painted panel
blocks on piles, a frozen bay, tundra with no edge, and benches with a view where
you can have a smoke or a mug of tea. Built with three.js as a fully client-side web game: no build-time or
runtime assets — every texture and sound is generated procedurally at load.

## Run

```sh
npm install
npm run dev      # dev server on http://localhost:5173
npm run build    # static bundle in dist/
npm run preview  # serve the production build
```

## Controls

| Key | Action |
| --- | --- |
| `W` `A` `S` `D` | walk |
| `Shift` | sprint |
| `Space` | jump |
| `C` | crouch |
| `E` | turn the kiosk radio on/off (within ~7 m) |
| `E` (by a car) | get in / out of any parked car — then `W` `S` throttle and brake/reverse, `A` `D` steer, `Space` handbrake |
| `V` | driver's seat ↔ chase camera |
| `R` (in a car) | dashboard radio on/off |
| `F` | have a smoke at a spot (any bench: the yards, the square, the bus shelter, the lookout, the lighthouse, the port mole); `F` again to stop |
| `G` | tea from the thermos at the same spots; `G` again to stop |
| `Esc` | pause / release the mouse |

`npm run drive` (with the dev server up) lets an autopilot take a car through the
town into a courtyard, then checks the radio, the aurora and a bench, with
screenshots in `shots/drive/`.

Mouse look uses pointer lock. Time of day, snow amount, volume, mouse
sensitivity, quality and Y-inversion are set from the title or pause screen and
persisted in `localStorage`.

## Smoke test

`npm run smoke` opens the game in headless Chrome (the system Chrome binary via
`puppeteer-core`), enters the world, looks at three places, drives a car and sits down on a bench;
it prints draw calls and triangles and fails on any console error. Start `npm run dev` first; pass a URL and an output
directory as optional arguments (`npm run smoke -- http://localhost:5199 shots`).

## The town plan

The town is data: `src/world/town.js`. `npm run check:town` validates it in node
(nothing on a street, no footprints touching, pipes and lanes clear of walls).

## Documentation

- [docs/HANDOFF.md](docs/HANDOFF.md) — where the game is going, the state of the
  code and the working log.

- [docs/graphics-plan.md](docs/graphics-plan.md) — art direction and rendering
  contract for the project.
- [CONTRIBUTING.md](CONTRIBUTING.md) — workflow rules (English, PRs, commits).
