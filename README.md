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
| `E` (looking up, on open snow) | lie back in the snow and watch it come down; `E` gets you up and leaves a snow angel behind (in winter) |
| `E` (at the kiosk window) | buy a loaf of bread (8:00 — 20:00) |
| `E` / `B` (at the soda machine behind the kiosk) | a glass of fizzy water with syrup (3 kop.) or plain (1 kop.), from the shared glass |
| `E` (at the phone box behind the kiosk) | 2 kop. and dial 100, the speaking clock: it tells you the time over the six pips; `E` again hangs up |
| `E` (by the puck on the hockey box, in winter) | shoot it the way you face (`⇧` for a slapshot), or skate into it; it rings off the boards, and through a goal mouth it scores |
| `E` (at the carpet frame by the playground) | beat the rug hung over it: the dust puffs out, less with every blow, until it is clean |
| `E` (under the bare bar of the carpet frame) | hang from it; `W` pulls you up, again and again until the arms give out; `E` drops you |
| Snowballs at the chalk target on a garage door | 10 in the middle, 5 and 2 in the rings; the score comes up as you hit; `E` at the door wipes it |
| `E` (at the post boxes by a stairwell's door) | look through the slots: the morning paper and its headline, a letter, a postcard, a bill; a few finds, then nothing until the post comes at seven |
| `B` | crumble a handful of bread for the pigeons: the flocks nearby come and feed round your feet |
| `E` (by a cat on a porch) | stroke it: it purrs (run past, or bring the dog, and it is down the basement vent) |
| `E` (by a playground swing) | sit on it: `W` on the way forward and `S` on the way back pump it higher, `E` gets off (or jumps off) |
| `E` (by a glint) | pick up a lost badge (значок): ten to find, the collection is on the pause screen and remembered between visits |
| `⇧` + `W` on winter ice | take a run at the pond or the hockey box and let go: you slide on for metres |
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
