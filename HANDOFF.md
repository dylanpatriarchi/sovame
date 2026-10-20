# HANDOFF — 2026-10-20 (remaining tasks)

Working note for resuming the project. Delete when the list is empty.

## State right now

- Repo: https://github.com/dylanpatriarchi/sovame, default branch `main`.
- **Merged (PR #1–#12)**: graphics plan + foundation; full game; improvement plan;
  signage reduction; environment realism pass; plan extension; movement-direction
  fix (+regression test); post-punk radio; subtle bloom; ambient pedestrians;
  enterable stairwells; title-screen declutter.
- **Current branch: `feat/realistic-trees`** (NOT pushed, NOT merged):
  - `72c38df` committed: recursive-branching tree generator (4 orders, poplar/
    birch/yard species, autumn clustered foliage, winter snow crusts/drifts/
    pillows, vertex-shader sway). Verified: 256 calls / 182.4k tris at title
    view, zero console errors, colliders/positions bit-exact vs old build.
  - **UNCOMMITTED work-in-progress** (tree placement fix, interrupted by a 429
    credit error mid-task): modified `src/world/vegetation.js`,
    `src/world/terrain.js`, `tools/smoke.mjs`, plus scratch scripts
    `tools/.analyze-trees.tmp.mjs`, `tools/.moved-trees.tmp.mjs`,
    `tools/.overlap-check.tmp.mjs`, `tools/.spruce-check.tmp.mjs`.
    Goal of the fix: user reported trees in the middle of the road — relocate
    any trunk on road/sidewalk/crossing/parking rects (derive exclusion rects
    from terrain.js constants), colliders follow positions, keep determinism
    and counts, smoke gains a `12-roadside.png` shot.

## Remaining tasks (in order)

1. **Finish + merge the tree placement fix** → PR #13 (`feat/realistic-trees`).
   Review the uncommitted diff, run the tmp analysis scripts if useful then
   DELETE them, verify: `npm run build`; `npm run dev` (background) +
   `npm run smoke` (needs system Chrome at the path in tools/smoke.mjs; ~70 s);
   read `shots/10-trees.png`, `11-trees-autumn.png`, `12-roadside.png` — no tree
   on asphalt/sidewalk, trunks on verges. Commit, push, `gh pr create`,
   `gh pr merge --squash --delete-branch`.
2. **Map expansion** (user: "la mappa finisce troppo presto") → PR
   `feat/bigger-district`. Enlarge `WORLD.bounds` (108 → ~170–190), extend the
   district coherently: more blocks/courtyards/roads (reuse `BUILDING_SPECS`
   archetypes), move boundary fences and skyline belt outward, extend sidewalks,
   keep spawn unchanged, re-validate pedestrian routes and tree scatter zones,
   keep budgets (<300 calls title view / <600k tris — region culling already
   exists for trees; consider the same for props).
3. **Bug-hunt pass** (user: "bug qua e là", unspecified) → PR `fix/playtest-pass`.
   Scripted playtest via the smoke harness: long walks along every road/path,
   collision probe grid, prompt/zone checks, season+time switching, interior
   round trips, sprint/jump/crouch edge cases; log and fix findings.
   Known candidates: footprints stamp indoors; one stairwell's bulb light
   reaches the others; curb blue glint near lamps (pre-existing); the
   cream billboard back panel is conspicuous from some angles.
4. **Cigarette spots** → PR `feat/smoke-spots`, spec in
   `docs/improvement-plan.md` section H: courtyard bench, a stairwell landing
   (anchor to `world.interiors[*]` coordinates), bus stop; key `F`; ~25 s
   first-person hand+cigarette sequence (ember glow, drifting smoke, soft
   inhale/exhale); per-spot cooldown.
5. **Final report** to the user (in Italian): what shipped, PR list, what to
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
