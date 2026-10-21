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
| `F` | have a smoke at a quiet spot (courtyard bench, bus stop, stairwell landing); `F` again to stop |
| `Esc` | pause / release the mouse |

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
