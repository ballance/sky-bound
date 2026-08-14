# Realistic Ascent — Design

Phase 1 of turning Skybound's arcade flight into a real orbital simulator.
This phase makes the **powered ascent** obey real physics: a rocket must earn
~9.4 km/s of delta-v to reach real orbital velocity (~7.8 km/s) at real
altitude. It stays in the existing side view. The top-down Orbit View and the
realistic de-orbit/re-entry are later phases (see Scope).

## Context

Today the sim is forgiving arcade physics: "orbit" is reached at ~1.6 km/s and
~100 km after a ~17 s flight, with tanks that are far too heavy dry and engines
with no notion of exhaust velocity. The goal set with the user is a real
orbital game with **true-to-Earth numbers**, built **ascent-first**, with
**Auto flying it by default and Manual as a sandbox**, and **time-warp** to keep
real-length flights watchable.

The full overhaul decomposes into three phases, each its own spec → plan → build:

1. **Realistic ascent (this spec).** Real rocket equation, masses, gravity,
   atmosphere; reach real orbital velocity; time-warp; delta-v/apoapsis readouts.
2. **Kepler Orbit View.** Top-down real two-body view (real Earth), orbital
   elements, apo/peri, prograde/retrograde burns (Auto + Manual), time-warp.
   Consumes the real position/velocity this phase produces at orbit insertion.
3. **Realistic de-orbit & re-entry.** De-orbit burn from the real orbit, real
   re-entry velocity and heating, landing.

## Goals

- A sensible 2–3-stage rocket reaches a real low orbit (~7.8 km/s, ~150–250 km)
  under real physics, and an underpowered one visibly falls short.
- The player can tell **before** launch whether a rocket can reach orbit
  (delta-v budget) and **during** flight how the orbit is building (apoapsis).
- Real-length flights (~8–9 min of burn) stay watchable via a time-warp control.
- Auto flies the whole ascent so an 8-year-old still succeeds; Manual is for a
  hands-on pilot.

## Non-Goals (this phase)

- No top-down / map view, no orbital maneuvering UI (Phase 2).
- No de-orbit or realistic re-entry rebalance (Phase 3).
- No manual pitch/attitude flying — the gravity turn stays auto-programmed even
  in Manual (a kid cannot hand-fly a gravity turn; Manual keeps Fire/Cut/Stage).
- Not a full 3-D or 3-DOF simulator — still a 2-D (vertical + downrange) model.

## Physics Model

Real constants (in `config.js`, the calibration block):

- `G0 = 9.80665` m/s², `R_EARTH = 6.371e6` m, `GM = 3.986e14` m³/s².
- Gravity: `g(r) = GM / r²`, `r = R_EARTH + altitude` (already inverse-square;
  now with real GM).
- Atmosphere: exponential density `rho = RHO0 * exp(-altitude / H)` with
  `RHO0 = 1.225` kg/m³, `H = 8500` m.
- Drag: `F_drag = 0.5 * rho * v² * CdA`, opposing the velocity vector, where
  `CdA` (drag coefficient × reference area) is a single tuned constant. This
  produces a real max-Q and real drag losses, and feeds the existing nose-cone
  heating (which already uses speed and a density proxy — switch it to `rho`).

Propulsion via the rocket equation:

- Each engine gains an **exhaust velocity** `ve` (≈ Isp·g₀). Mass flow
  `mdot = thrust / ve`; propellant burned per step `= mdot * throttle * dt`.
  (Current `burn` becomes derived, keeping thrust and ve as the primary stats.)
- Suggested tiers: **Big Engine** (first stage, kerolox-like) `ve ≈ 3000` m/s;
  **Small Engine** (upper stage, vacuum-optimized) `ve ≈ 3500` m/s.

Orbit condition (real):

- "In orbit" when horizontal (tangential) velocity ≥ **circular velocity**
  `v_circ = sqrt(GM / r)` at the current radius (~7.8 km/s at 200 km), with
  altitude above the sensible atmosphere (e.g. ≥ 140 km so drag won't decay it).
  This exact position + velocity is the hand-off state for Phase 2.

Apoapsis / periapsis preview (osculating orbit from current state):

- Specific energy `eps = v²/2 - GM/r`; if `eps < 0` (bound), semi-major axis
  `a = -GM / (2*eps)`. Angular momentum `h = r * v_tangential`; eccentricity
  `e = sqrt(1 + 2*eps*h² / GM²)`. Then `r_apo = a*(1+e)`, `r_peri = a*(1-e)`.
  Report apoapsis/periapsis **altitudes** (`r - R_EARTH`). This lets the player
  watch the projected apoapsis climb as they burn — the core "am I making it?"
  feedback, and it's already the real math Phase 2 needs.

## Parts Rebalance

The key change is **tank propellant fraction**: dry mass ≈ 6–8% of wet, so
staging yields real mass ratios (a stage delta-v of `ve·ln(m0/mf)` around
4–5 km/s per stage, summing to ~9.4 km/s across 2–3 stages). Concretely:

- Tanks: increase propellant and/or cut dry mass so a full tank is ~10–15×
  its dry mass. Provide a "starter" 2-stage rocket that reaches orbit.
- Engines: real `thrust` + `ve` per tier (above). Liftoff TWR stays ~1.3–1.6
  (the gradual-liftoff work already in place still applies).
- Boosters/fairing/probe: rescale masses to the new regime so existing features
  (side-booster recovery, fairing, deploy) keep working.

Exact numbers are calibration knobs, tuned by the self-test and playtesting, not
derived on paper. The self-test is the source of truth for "reaches orbit."

## Ascent Guidance

Auto flies a tuned **gravity turn**: vertical off the pad, begin pitching over
around 1–2 km, and steer thrust increasingly horizontal so tangential velocity
reaches `v_circ` as altitude levels near the target orbit. Implemented as a
pitch schedule (extend the current `pitch(altitude)` program) — retuned so the
horizontal-velocity target is actually met, verified by the self-test. Staging
fires on fuel-empty (Auto) or by the player (Manual). Pitch is auto in both
modes.

## Pacing & Time-Warp

- Base runs **near real time**. A **time-warp control** offers `1× / 2× / 5× /
  10×` (higher tiers possible for quiet coasts). Warp multiplies the sim time
  advanced per frame; the loop keeps sub-stepping by `DT` (0.05 s) for stability,
  so high warp just means more sub-steps per frame (deterministic, CPU-bounded —
  cap warp so sub-steps per frame stay reasonable).
- Auto flights may raise warp automatically during the long, quiet upper-stage
  burn and drop back to 1× for eventful moments (liftoff, max-Q, staging,
  orbit insertion) — optional polish; manual warp buttons are the baseline.
- Replaces the current fixed `TIME_SCALE`: base scale + a live warp multiplier.

## Readouts

Side-view HUD, in real units:

- Altitude (km), speed (km/s), **apoapsis** and **periapsis** (km, live preview),
  **delta-v remaining** (km/s), TWR, nose temp, and a max-Q indicator.
- Current warp factor shown (e.g. `▶▶ 5×`).

Build screen:

- **Delta-v budget**: total `Σ ve·ln(m0/mf)` across stages vs the ~9.4 km/s
  needed, with a clear "can / cannot reach orbit" verdict alongside the existing
  thrust-to-weight readout.

## Rendering / Camera

The side view already follows altitude and scrolls stars with downrange travel;
it must now span up to ~150–250 km cleanly (larger vertical range) and show the
rocket pitching to near-horizontal as it approaches orbital velocity. Sky→space
gradient and heating glow stay. Earth's curvature and the orbit itself are
deliberately **not** shown here — that's Phase 2's top-down view.

## Handoff to Phase 2

On reaching orbit, the sim holds a real 2-D state (position `r`, velocity vector,
tangential/radial components) at real orbital velocity. Phase 2 consumes this to
seed the top-down Kepler view. This phase can keep the current "coast + announce"
behavior in the side view as a placeholder until Phase 2 replaces it.

## Components Touched

- `config.js` — real constants (G0, R_EARTH, GM, RHO0, H, CdA), warp tiers,
  delta-v target/loss budget.
- `parts.js` — engine `ve`, retuned thrust/masses, tank propellant fractions,
  starter rocket definition.
- `sim.js` — real gravity + atmosphere/drag, mass flow via `ve`, orbit =
  `v_tangential ≥ v_circ`, apoapsis/periapsis computation, nose-temp uses `rho`.
- `main.js` — warp control + loop integration, real-unit HUD, build delta-v
  budget, gravity-turn tuning hooks.
- `render.js` — wider altitude range; keep heating/max-Q; warp indicator.
- `index.html` / `css` — warp buttons, apoapsis/periapsis/delta-v readouts.
- `sim.test.js` — rebalanced: a good rocket reaches `v_circ` at real altitude;
  an underpowered one does not; delta-v budget matches flown delta-v within
  tolerance.

## Testing

Extend the headless self-test:

- A capable 2–3-stage rocket reaches horizontal velocity ≥ `v_circ` above the
  atmosphere, and its apoapsis/periapsis are both above the atmosphere.
- An underpowered rocket's apoapsis stays suborbital (falls back).
- The build delta-v budget predicts the flown result (reaches orbit ⇔ budget
  ≥ ~9.4 km/s), within a tolerance for gravity/drag losses.
- Existing guards still hold (gradual liftoff TWR, fuel-less rocket fails).

## Open Calibration Knobs

`CdA` (drag), the pitch schedule (gravity turn), engine `ve`/thrust, tank
propellant fractions, warp tiers/caps, and the atmosphere `H`. All live in the
config/parts blocks and are tuned by the self-test + playtesting with Sebastian,
not fixed by this document.
