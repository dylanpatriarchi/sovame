# PERVYJ SNEG

A first-person walking experience in a Soviet microrayon at blue hour, on the edge
of winter. Built with three.js as a fully client-side web game: no build-time or
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
| `F` | have a smoke at a quiet spot (courtyard bench, bus stop, stairwell landing); `F` again to stop |
| Left mouse button / `G` | throw a snowball (in winter, outdoors) |
| `E` (looking down at open snow) | build a snowman (in winter; five stand at a time) |
| `E` (at the kiosk window) | buy a loaf of bread (8:00 — 20:00) |
| `B` | crumble a handful of bread for the pigeons: the flocks nearby come and feed round your feet |
| `E` (by a cat on a porch) | stroke it: it purrs (run past, or bring the dog, and it is down the basement vent) |
| `E` (by a glint) | pick up a lost badge (значок): ten to find, the collection is on the pause screen and remembered between visits |
| `M` | district map, with where you stand (outdoors, on foot or driving) |
| `P` | photo mode: mouse wheel zooms, left button or `Enter` takes a picture (saved as a PNG download) |
| `Esc` | pause / release the mouse |

`npm run drive` (with the dev server up) gets into a car, drives, crashes and
steps out again, with screenshots in `shots/drive/`.

Mouse look uses pointer lock. Season, time of day, snow amount, volume, mouse
sensitivity, quality and Y-inversion are set from the title or pause screen and
persisted in `localStorage`.

## Smoke test

`npm run smoke` opens the game in headless Chrome (the system Chrome binary via
`puppeteer-core`), enters the world, walks a couple of metres, writes seven
screenshots to `shots/` and prints draw calls, triangles, collider/zone/lamp
counts and any console error. Start `npm run dev` first; pass a URL and an output
directory as optional arguments (`npm run smoke -- http://localhost:5199 shots`).

## Documentation

- [docs/graphics-plan.md](docs/graphics-plan.md) — art direction and rendering
  contract for the project.
- [CONTRIBUTING.md](CONTRIBUTING.md) — workflow rules (English, PRs, commits).
