# HANDOFF — 2026-10-20 (remaining tasks)

Working note for resuming the project. Delete when the list is empty.

## State right now

- Repo: https://github.com/dylanpatriarchi/sovame, default branch `main`.
- **Merged (PR #1–#13)**: graphics plan + foundation; full game; improvement plan;
  signage reduction; environment realism pass; plan extension; movement-direction
  fix (+regression test); post-punk radio; subtle bloom; ambient pedestrians;
  enterable stairwells; title-screen declutter; realistic trees + road-placement
  fix (recursive generator, zero trunks on hard surfaces asserted in smoke).
- **No open branches, working tree clean.** The map-expansion task (below) was
  started but stopped by the user before any commit — no `feat/bigger-district`
  branch exists; start it from scratch.

## Remaining tasks (in order)

1. **Map expansion** (user: "la mappa finisce troppo presto") → PR
   `feat/bigger-district`. Enlarge `WORLD.bounds` (108 → ~170–190), extend the
   district coherently: more blocks/courtyards/roads (reuse `BUILDING_SPECS`
   archetypes), move boundary fences and skyline belt outward, extend sidewalks,
   keep spawn unchanged, re-validate pedestrian routes and tree scatter zones,
   keep budgets (<300 calls title view / <600k tris — region culling already
   exists for trees; consider the same for props).
2. **Bug-hunt pass** (user: "bug qua e là", unspecified) → PR `fix/playtest-pass`.
   Scripted playtest via the smoke harness: long walks along every road/path,
   collision probe grid, prompt/zone checks, season+time switching, interior
   round trips, sprint/jump/crouch edge cases; log and fix findings.
   Known candidates: footprints stamp indoors; one stairwell's bulb light
   reaches the others; curb blue glint near lamps (pre-existing); the
   cream billboard back panel is conspicuous from some angles.
3. **Cigarette spots** → PR `feat/smoke-spots`, spec in
   `docs/improvement-plan.md` section H: courtyard bench, a stairwell landing
   (anchor to `world.interiors[*]` coordinates), bus stop; key `F`; ~25 s
   first-person hand+cigarette sequence (ember glow, drifting smoke, soft
   inhale/exhale); per-spot cooldown.
4. **Final report** to the user (in Italian): what shipped, PR list, what to
   check by playing (radio musicality, bloom on real GPU).

## Rules and tools (unchanged)

- English codebase; conventional commits, no `Co-authored-by` trailers; every
  change via PR (squash-merge, delete branch); build/verify with npm CLI.
- Verification loop per PR: build green → dev server bg → `npm run smoke` →
  zero console errors → read the screenshots → budgets.
- Smoke harness: `tools/smoke.mjs` drives `window.__game` (player.teleport/yaw,
  env.setSeason/setTime, world.*, sound.toggleRadio) — keep that API intact.
- Subagents used so far hold useful context if resumable: agent-5 (trees),
  agent-4 (interiors), agent-3 (pedestrians), agent-2 (radio). They failed
  with a 429 credit error on 2026-10-20 — resume only if credits returned;
  otherwise work manually.
- Known accepted caveats: radio musicality unverified by ear; ~830–860 draw
  calls in very dense views (props-merge pass is future work); stairwell
  landing window is a painted texture by design.
