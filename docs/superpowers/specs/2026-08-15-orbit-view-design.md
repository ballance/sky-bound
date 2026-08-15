# Orbit View — Design (Phase 2)

The top-down Kepler orbit view that takes over when the rocket reaches orbit.
Its job is **payoff, deploy, and de-orbit**: see your ship circling a real
Earth, watch the satellite deploy and stay up there, then fire the de-orbit
burn to come home. Wonder over challenge — Auto flies the whole thing so an
8-year-old always succeeds; Manual gives burn buttons for a hands-on pilot.

This is Phase 2 of the three-phase overhaul (see
`2026-08-14-realistic-ascent-design.md`). Phase 1 (realistic ascent) is built.
Phase 3 (fiery de-orbit re-entry) is a separate spec; this phase hands off to the
**existing** side-view re-entry placeholder so it ships and is testable on its own.

## Context

Today, reaching orbit shows a placeholder in the side view: the rocket coasts
horizontally with an "ORBIT!" banner. The ascent already produces the real state
this phase needs at insertion — altitude (~186 km), tangential speed
(`hSpeed ≈ vCirc ≈ 7.8 km/s`), radial speed (`vSpeed ≈ 0`), and the upper stage's
leftover propellant/Δv. This phase consumes that state to seed a true top-down
two-body simulation and replaces the placeholder with the orbit view.

## Goals

- On reaching orbit, cut from the side view to a **top-down orbit view** seeded
  with the real insertion state.
- Show the orbit as a readable ellipse around a real Earth, with live apoapsis /
  periapsis / speed / eccentricity in real units.
- **Auto** coasts a lap, deploys the satellite (if the deploy toggle is set), and
  de-orbits — no input needed. **Manual** offers prograde / retrograde / deploy /
  de-orbit, spending the upper stage's remaining Δv.
- A deployed satellite **stays in orbit** as its own marker (the payoff: "your
  satellite is up there").
- Time-warp keeps a ~90-minute orbit watchable (a lap in seconds).
- De-orbit lowers periapsis into the atmosphere and hands back to the side-view
  re-entry (the existing placeholder for now; Phase 3 makes it fiery).

## Non-Goals (this phase)

- No fiery re-entry rebalance, plasma, or landing rework — that's Phase 3. This
  phase triggers the existing re-entry path on de-orbit.
- No rendezvous, plane changes, or multi-body (Moon) gravity.
- No manual throttle magnitude control — burns apply a fixed Δv per press/tick.
- Not a to-scale view — altitude is deliberately exaggerated for readability.

## Physics Model — `orbit.js` (new, pure)

A true 2-D two-body simulation in SI units, Earth's centre at the origin.

- **State:** `{ x, y, vx, vy, fuel, ve, dryMass, payloadMass, ... }` — position
  and velocity in metres / m·s⁻¹, plus the mass/propellant carried over from the
  upper stage so burns spend real Δv.
- **Gravity:** `a = -GM · (x, y) / r³`, `r = hypot(x, y)` (`GM` from config).
- **Integrator:** velocity-Verlet (leapfrog) sub-stepped by a bounded `dt`, so
  energy is conserved over many orbits even at high warp (a plain Euler step
  would spiral). Warp multiplies sim-time per frame; the loop sub-steps by `dt`.
- **Seed from insertion (`seedFromAscent`):** place the ship at radius
  `R_EARTH + altitude` at the top of the circle `(0, -(R_EARTH+alt))`, velocity
  tangential (prograde) with magnitude = insertion `hSpeed`, plus the small
  radial `vSpeed`. So it starts on the real, near-circular orbit.
- **Orbital elements (`orbitElements2D(state)`):** from `{x,y,vx,vy}` compute
  specific energy `eps = v²/2 - GM/r`, semi-major axis `a = -GM/(2·eps)`,
  angular momentum `h = x·vy - y·vx`, eccentricity
  `e = sqrt(max(0, 1 + 2·eps·h²/GM²))`; report apoapsis/periapsis **altitudes**
  `a(1±e) - R_EARTH`, plus `speed`, `e`, and period `2π·sqrt(a³/GM)`. (Same
  math as Phase 1's 1-D `orbitElements`, generalised to a 2-D state.)
- **Burn (`burn(state, dir, dv)`):** `dir` is `+1` prograde / `-1` retrograde;
  add `dir·dv` along the unit velocity vector, and spend propellant for that Δv
  via the rocket equation (`fuel -= mass·(1 - exp(-dv/ve))`, clamped at 0 — no
  fuel, no burn). A fixed `BURN_DV` (m/s) is applied per Manual press and per
  Auto governor tick.
- **Deploy (`deploy(state)`):** returns a **satellite** state = a copy of the
  ship's `{x,y,vx,vy}` at that instant (its own `orbit.js` body), and marks the
  ship `deployed`. The satellite thereafter steps independently and keeps
  orbiting; the ship continues.

Determinism preserved (pure functions of state + cfg; no time/random).

## Rendering — `orbitRender.js` (new)

Top-down, **exaggerated-altitude** mapping so the orbit reads clearly outside a
modest Earth while keeping the true orbital *shape*:

- Preserve the angle `θ = atan2(y, x)`; map the real radius to a screen radius
  that exaggerates altitude: `screenR = EARTH_PX + (r - R_EARTH)/ALT_REF · ORBIT_GAP`.
  So the surface sits at `EARTH_PX` and, e.g., 200 km maps to a clear gap; apo
  and peri (different `r`) map to different `screenR`, so the ellipse is visible.
- Draw: starfield; an Earth disc (`EARTH_PX`, blue radial gradient, simple
  day/terminator shading); the **orbit path** (trace the ellipse by sampling the
  osculating orbit, dashed for the ship, solid for the deployed satellite);
  **apoapsis** (☀ marker + "Apoapsis N km") and **periapsis** markers; the
  **ship** (small rocket glyph oriented along velocity) with a green **prograde
  arrow**; the deployed **satellite** as its own dot on its path.
- The Earth and orbit stay centred; the ship moves around it. No camera scroll.

`render.js` (side view) is untouched; the two views are separate modules selected
by `main.js`.

## Controls, HUD & View Switch — `main.js`

- **View state machine:** a `view` of `"ascent" | "orbit" | "reentry"`. The
  flight loop and HUD route to the active view. On ascent `orbited`, switch to
  `"orbit"`, call `orbit.seedFromAscent(ascentState, rocket)`, and start the
  orbit loop/render (replacing the current side-view coast placeholder).
- **HUD (reuse the launch panel):** in orbit view show Speed (km/s), Apoapsis,
  Periapsis (km), Eccentricity, Orbits completed, Δv left. Warp buttons switch to
  orbit tiers (e.g. `1× / 100× / 1000×`, in `ORBIT_WARP_TIERS`).
- **Manual controls:** 🔥 Prograde, 🔥 Retrograde, 🛰️ Deploy, 🔥 De-orbit
  (in the existing `#hardControls` row, shown in orbit view / Manual).
- **Auto sequence** (a small state machine on the orbit state): `COAST` one lap
  with a "You're in orbit!" callout → `DEPLOY` the satellite if the deploy toggle
  is set (callout "Satellite deployed") → `DEORBIT`: apply retrograde `BURN_DV`
  per tick until periapsis < `ATM_ENTRY_ALT` → hand off. Pitch/attitude is
  automatic in both modes (a kid can't hand-fly a burn vector).

## Handoff to Re-entry

When the ship is descending and its altitude reaches `ATM_ENTRY_ALT` (~120 km)
with periapsis below it, `main.js` switches `view` to `"reentry"` and seeds the
side-view re-entry with the real state (a fast, ~7+ km/s horizontal entry). For
**this phase**, that triggers the **existing** side-view re-entry
(`reentering = true`, the current drag + parachute path) as a placeholder so
Phase 2 ships whole. **Phase 3** replaces this with real orbital-velocity heating,
plasma, and landing. The handoff contract (entry position + velocity) is the
seam Phase 3 consumes.

## Components Touched

- `js/orbit.js` — new: pure two-body state, `seedFromAscent`, `step`,
  `orbitElements2D`, `burn`, `deploy`.
- `js/orbitRender.js` — new: exaggerated top-down drawing.
- `js/config.js` — orbit constants: `EARTH_PX`, `ALT_REF`, `ORBIT_GAP`,
  `BURN_DV`, `ORBIT_WARP_TIERS`, `ATM_ENTRY_ALT`.
- `js/main.js` — `view` state machine; seed/transition; orbit HUD + buttons;
  Auto sequence; route the loop to the active view.
- `index.html` / `css/style.css` — orbit-view readout rows and the burn/deploy/
  de-orbit buttons; orbit warp tiers.
- `js/orbit.test.js` — new headless self-test (below).

## Testing (headless `node js/orbit.test.js`)

- **Circular stays circular:** seeded at `vCirc`, radial 0, `e` stays < 0.01 and
  `r` within ~1% over several orbits (integrator conserves the orbit).
- **Energy/period conserved:** specific energy drifts < ~1% over 5 orbits.
- **Prograde raises the far apsis:** a prograde `BURN_DV` at periapsis raises
  apoapsis; **retrograde lowers periapsis.**
- **De-orbit terminates:** repeated retrograde `BURN_DV` drives periapsis below
  `ATM_ENTRY_ALT` in a finite number of burns, and fuel is spent (not free).
- **`orbitElements2D` sanity:** a circular orbit gives apo ≈ peri ≈ altitude;
  a prograde burst gives apo > peri.
- **Deploy:** the satellite state is an independent copy that keeps orbiting
  (its `r` stays bounded) after the ship burns away.

Browser verification: reach orbit → view switches to the top-down map → Auto
coasts, deploys (satellite stays up), de-orbits → cuts to the side-view re-entry
placeholder → lands. Manual: prograde/retrograde reshape the ellipse live;
de-orbit brings it home. Real units sane; no console errors.

## Open Calibration Knobs

`EARTH_PX` / `ALT_REF` / `ORBIT_GAP` (the exaggeration), `BURN_DV`,
`ORBIT_WARP_TIERS`, `ATM_ENTRY_ALT`, the Auto coast-lap duration, and the
Verlet sub-step `dt`. Tuned by the self-test and a browser playtest with
Sebastian, not fixed here.
