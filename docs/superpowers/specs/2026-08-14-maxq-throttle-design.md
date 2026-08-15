# Max-Q Throttle Mechanic — Design

Add a real **maximum dynamic pressure (Max-Q)** mechanic to Skybound's ascent.
A rocket that barrels through the lower atmosphere at full throttle builds
dangerous aerodynamic pressure, overheats, and — if the pilot ignores it —
suffers a RUD. Auto flies the classic **throttle bucket** automatically and is
always safe; Manual gives the player a throttle control and real stakes.

## Context

The realistic-ascent overhaul (see `2026-08-14-realistic-ascent-design.md`) made
the ascent obey real physics, but the gravity turn is gentle enough that dynamic
pressure stays low — nose temperature peaks around 28 °C and the existing
heating/max-Q glow barely triggers. There is currently nothing to throttle for.
This design makes Max-Q a genuine event with stakes, mirroring the most iconic
launch callout ("Max-Q… go at throttle up").

The sim core `sim.js` already computes an exponential-atmosphere density `rho`,
a speed, a per-tick `throttle` that spools 0→1, and a nose-temperature channel.
This mechanic builds on those; it does not add new subsystems.

## Goals

- Dynamic pressure `q = ½·ρ·v²` is computed each tick and peaks in the lower
  atmosphere (~8–13 km) — a real Max-Q.
- At full throttle the (retuned, punchier) starter rocket exceeds the stress
  limit around Max-Q, so throttling down is genuinely necessary.
- **Auto** throttles the bucket automatically, holds stress below the limit, and
  always reaches orbit — an 8-year-old never fails from Max-Q.
- **Manual** pilots manage the throttle themselves and can RUD if they ignore
  the warning.
- The player can see the danger building (a Max-Q stress gauge) and hear the
  callouts.

## Non-Goals

- No change to the orbit/insertion physics, delta-v budget, time-warp, or
  camera from the realistic-ascent phase.
- No throttle *scheduling* UI (no programmable throttle curve) — Manual throttle
  is two buttons, Auto is automatic.
- No new failure types beyond overheating→RUD (reuse the existing RUD path).
- Not Phase 2/3 (orbit view, re-entry).

## Physics Model (`sim.js`)

Per tick, after velocity is known:

- **Dynamic pressure:** `q = 0.5 * rho * speed²` where `rho = RHO0 * exp(-alt/H_ATM)`
  (already computed for drag) and `speed = hypot(vSpeed, hSpeed)`.
- **Aero stress:** `aeroStress = q / cfg.Q_MAX` (new tuned constant `Q_MAX`,
  units N/m²). `aeroStress ≥ 1` means over the structural limit. Store
  `state.aeroStress` and `state.maxQ` (peak q, for post-flight interest).
- **Overheat from overstress:** when `aeroStress > 1`, drive the nose/airframe
  temperature up quickly — add an overstress term to the existing `heatTarget`
  proportional to `(aeroStress - 1)`, so the nose-temp gauge visibly spikes and
  the existing heat-glow render triggers. This reuses `state.noseTemp`.
- **RUD:** track `state.overStressT` — seconds spent with `aeroStress > 1`.
  When it exceeds `cfg.MAXQ_RUD_SECONDS` (~4 s) **or** `noseTemp` exceeds a
  structural limit `cfg.NOSE_TEMP_LIMIT`, set `status = "crashed"` (the RUD /
  "rapidly unplanned disassembly" path the ABORT button already uses). Reset
  `overStressT` toward zero while `aeroStress <= 1` (a short cool-down), so
  easing off in time saves the vehicle.

Determinism is preserved (pure functions of state + cfg; no time/random).

## Auto Guidance — the throttle bucket (`sim.js` / ascent logic)

Auto currently spools `throttle` to 1 and holds it. Add a **throttle governor**
active only when the flight is Auto-guided (a flag on state or rocket, e.g.
`state.autoThrottle`, set true for Auto flights, false for Manual):

- If `autoThrottle` and `aeroStress` is near/over a target (e.g. `> 0.9`),
  ease the throttle *target* down (toward ~0.65) proportionally so stress holds
  at ~0.9; when `q` falls and stress drops, return the target to 1.
- The existing spool-rate (`THROTTLE_RAMP`) governs how fast throttle moves
  toward its target, so the bucket is smooth, not instant.

This keeps Auto safe and produces the real "ease down then throttle back up"
profile. Manual flights leave `throttle` under player control (below).

## Manual Control (`main.js` / `index.html`)

Add two buttons to the Manual control row (`hardControls`):

- **🔽 Throttle Down** — sets the throttle target to ~0.65 (the bucket).
- **🔼 Throttle Up** — sets the throttle target back to 1.0.

These set a target the existing spool logic ramps toward (same as Auto), so
manual throttle changes are smooth. In Manual, `autoThrottle` is false, so the
governor does not intervene — the pilot alone decides. Fire/Cut/Drop/Fairings/
Deploy are unchanged. (Cut still = engine off; Throttle Down ≠ Cut — the engine
keeps running at reduced power.)

## Callouts & HUD (`main.js` / `index.html` / `css`)

- **Callouts** (the existing `#callout` aria-live channel): **"MAX-Q"** fires
  once when `q` first crosses ~80 % of peak on the way up; **"GO AT THROTTLE UP"**
  fires when `q` has clearly fallen past the bucket. In Manual, if stress > 1,
  a red **"EASE OFF!"** warning shows while the danger persists.
- **Max-Q stress gauge:** a horizontal bar in the telemetry block bound to
  `aeroStress` (0→1+), colored green < 0.75, amber 0.75–1.0, red > 1.0. Reuse
  the existing bar styling (`.bar`/`#tFuel` pattern) with a new `#tStress`.

## Parts Rebalance (`parts.js` / `config.js`)

Nudge the starter punchier so full throttle is dangerous at Max-Q:

- Raise first-stage thrust so **liftoff TWR ≈ 2.1** (from ~1.78). Exact value is
  a calibration knob tuned by the self-test.
- Tune `Q_MAX` so that: at full throttle the punchy starter's `aeroStress`
  clearly exceeds 1 around 8–13 km, while Auto's bucket holds it below 1 and
  still reaches orbit. `Q_MAX`, `MAXQ_RUD_SECONDS`, `NOSE_TEMP_LIMIT`, and the
  bucket target/threshold are all calibration knobs.

Auto must still reach orbit (delta-v budget unchanged in spirit; a punchier
first stage burns faster but the bucket recovers the efficiency). The headless
test is the contract.

## Rendering (`render.js`)

No new art required — overstress drives `noseTemp` up, and the existing
heat-glow (triggered above a temperature threshold) already visualizes it. The
RUD reuses the existing explosion effect. Optionally, the flame already scales
with throttle; confirm it visibly shrinks during the bucket (it reads `throttle`
if it does; if not, that is a small follow-on, not required here).

## Components Touched

- `config.js` — `Q_MAX`, `MAXQ_RUD_SECONDS`, `NOSE_TEMP_LIMIT`, bucket target/
  threshold constants; punchier first-stage thrust lives in `parts.js`.
- `parts.js` — first-stage thrust raised for TWR ≈ 2.1.
- `sim.js` — compute `q`/`aeroStress`/`maxQ`; overstress heating; `overStressT`
  + RUD; Auto throttle governor; Manual throttle target; `initState` fields
  (`aeroStress`, `maxQ`, `overStressT`, `autoThrottle`, `throttleTarget`).
- `main.js` — Manual Throttle Down/Up buttons; set `autoThrottle` per mode;
  Max-Q / throttle-up / ease-off callouts; stress gauge update in `updateHUD`.
- `index.html` — two Manual buttons; a stress gauge row.
- `css/style.css` — stress-gauge colors (green/amber/red).
- `sim.test.js` — new assertions (below).

## Testing (headless `sim.test.js`)

- **q peaks low:** across a full auto ascent, `maxQ` occurs at an altitude in
  the lower atmosphere (e.g. between ~5 km and ~20 km), not at the pad or in
  space.
- **Auto is safe & orbits:** the Auto-guided starter's `aeroStress` never
  exceeds 1 (bucket holds), and it still reaches orbit with periapsis above the
  atmosphere (the realistic-ascent orbit assertions still pass).
- **Full throttle is fatal:** the same punchy rocket flown at a forced full
  throttle with no governor (autoThrottle=false, throttle pinned to 1) exceeds
  `aeroStress` 1 and ends `status === "crashed"` (RUD) — proving the mechanic
  bites.
- **Easing off saves it:** a run that throttles to the bucket through Max-Q
  (autoThrottle off, throttle target 0.65 during the window) does **not** RUD.
- Existing guards still hold (delta-v budget ≥ target, gradual liftoff,
  underpowered rocket fails to orbit).

## Open Calibration Knobs

`Q_MAX`, first-stage thrust (TWR), `MAXQ_RUD_SECONDS`, `NOSE_TEMP_LIMIT`, the
bucket throttle target (~0.65) and the governor's stress target (~0.9), and the
overstress→heat coefficient. All tuned by the self-test and a browser playtest
with Sebastian, not fixed by this document.
