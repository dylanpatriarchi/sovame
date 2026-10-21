# HANDOFF — 2026-10-21 (remaining tasks)

Working note for resuming the project. Delete when the list is empty.

## State right now

- Repo: https://github.com/dylanpatriarchi/sovame, default branch `main`.
- **Merged (PR #1–#16)**: graphics plan + foundation; full game; improvement plan;
  signage reduction; environment realism pass; plan extension; movement-direction
  fix (+regression test); post-punk radio; subtle bloom; ambient pedestrians;
  enterable stairwells; title-screen declutter; realistic trees + road-placement
  fix; handoff docs; **district doubled northward** (216×288 m, 6 new buildings,
  Zavodskaya arm, 2 new courtyards, 2 new pedestrian routes); **scripted
  playtest pass** (`npm run playtest`, tools/playtest.mjs) with 4 confirmed
  fixes (indoor footprints, stairwell bulb containment, 2 buried walk paths).
- **No open branches, working tree clean.** Both harnesses green:
  `npm run smoke` + `npm run playtest` (needs `npm run dev` on :5173 first).

## Remaining tasks (in order)

1. **Cigarette spots** → PR `feat/smoke-spots`, spec in
   `docs/improvement-plan.md` section H: courtyard bench, a stairwell landing
   (anchor to `world.interiors[*]` coordinates), bus stop; key `F`; ~25 s
   first-person hand+cigarette sequence (ember glow, drifting smoke, soft
   inhale/exhale); per-spot cooldown. Interactions go through
   `world.interactables` (see how doors/radio are registered in src/main.js);
   add the F key handling next to the existing KeyE handler.
2. **Final report** to the user (in Italian): what shipped, PR list, what to
   check by playing (radio musicality, bloom on real GPU, dense-view draw
   calls on real hardware).

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
