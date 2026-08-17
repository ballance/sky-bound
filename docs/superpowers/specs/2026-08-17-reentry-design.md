# De-orbit & Re-entry — Design (Phase 3)

The finale of the three-phase overhaul: after the de-orbit burn, the capsule
falls back through the atmosphere in a real fiery re-entry and — if you built it
right — splashes down safely in the ocean. Reaching orbit and deploying the
satellite is already the mission win, so **re-entry is a bonus recovery** (like
the first-stage booster landing): bring the capsule home for extra knowledge, or
lose it without penalty to the mission.

Phase 1 (realistic ascent) and Phase 2 (orbit view) are built and live. Phase 2
already hands off to the side-view re-entry with the real state; today that
placeholder is drag-only, so a capsule with no parachute just crashes with the
wrong "Broke apart at Max-Q" message. This phase makes re-entry real and
dramatic, adds the gear that makes survival meaningful, and ends the flight with
a proper splashdown.

## Context

At de-orbit handoff (Phase 2), `main.js` seeds the side-view `sim` with the real
orbital state: altitude ~120 km, `hSpeed` ~7.8 km/s, a downward `vSpeed`,
`reentering = true`, `status = "flying"`. The side-view `sim.js` `step` already
runs the convective nose-heating model (`√(ρ·RHO0·dense)·v³`), which at orbital
velocity in thickening air spikes to thousands of °C, and already has a
`noseTemp ≥ NOSE_TEMP_LIMIT` RUD and a parachute drag path. This phase reuses all
of that: the heat-RUD **is** the "burn up" mechanic, and the render heat-glow
(already triggered at high nose-temp) **is** the plasma.

## Goals

- A real fiery re-entry in the side view: the capsule decelerates from orbital
  speed on atmospheric drag, glows bright plasma at peak heating (~50–60 km),
  and — with the right gear — slows to a soft parachute splashdown in the ocean.
- **Bringing the capsule home requires the right build:** a **Heat Shield** to
  survive the heating and a **Parachute** to land softly. Missing either loses
  the capsule, but the mission still counts (satellite already deployed).
- Auto flies the descent and always succeeds if the craft is built right; Manual
  gets a Deploy-Chute button with a real timing rule.
- A satisfying, correct ending: a "Welcome home" splashdown, a recovery
  knowledge bonus, and re-entry-specific result messages (no more "Max-Q").

## Non-Goals (this phase)

- No new top-down or map view — re-entry is the existing side view with an ocean
  swap.
- No re-entry *attitude* flying (angle of attack, roll) — a capsule falls; the
  only player input is chute-deploy timing (Manual).
- No re-entry corridor / skip-out mechanic — the de-orbit angle from Phase 2 is
  taken as-is; Auto's de-orbit already yields a survivable entry.
- No multi-capsule or crew mechanics.

## The Heat Shield part (new) — `parts.js`

- A new part `heatShield`: `{ kind: "utility", mass: ~300 kg, icon: "🛡️",
  name: "Heat Shield", blurb: "Survive the fire of re-entry." }`, unlockable with
  knowledge (like other parts). `normalizeRocket` sets `hasHeatShield = true`
  when present (mirroring `hasParachute`/`hasLegs`), and adds its mass to the
  payload/dry mass so it costs delta-v on ascent (a real trade).
- The heat shield rides the whole flight on the returning stage. It only matters
  during re-entry.

## Physics — `sim.js`

Re-entry is `sim.reentering === true` (set by the Phase-2 handoff). Per step:

- **Heating (reused):** the convective nose-heating already spikes at orbital
  entry — no formula change, but tune so a shielded capsule peaks a few
  thousand °C around 50–60 km and the glow reads as plasma.
- **Burn-up vs shield:** the existing `noseTemp ≥ NOSE_TEMP_LIMIT` RUD is the
  burn-up. Gate it on the shield: it fires (capsule destroyed, `status =
  "crashed"`, `crashReason = "burnup"`) **only when `!rocket.hasHeatShield`**.
  With a shield the capsule glows bright but survives; the heat still shows.
- **Deceleration (tuned):** atmospheric drag must bleed ~7.8 km/s down to a
  subsonic descent by the time the capsule reaches chute altitude. Reconcile the
  two drag paths currently active in `step` (the real exponential ascent-drag and
  the legacy re-entry-drag block) into one coherent re-entry deceleration, tuned
  so a shielded capsule survives the heat *and* slows enough for the chute.
- **Chute:** when `reentering`, `hasParachute`, altitude below `CHUTE_ALT`, and
  descending, the chute opens (auto in Auto). A `chuteRipped` state: if the chute
  is deployed while speed is above `CHUTE_SAFE_SPEED`, it rips (no chute drag) —
  the Manual timing rule. Auto only deploys inside the safe window.
- **Splashdown:** at `altitude ≤ 0` while `reentering`, a soft touchdown
  (descent speed ≤ `CRASH_SPEED`, i.e. the chute worked) → `status = "splashed"`
  (recovered); otherwise `status = "crashed"` with `crashReason = "hardsplash"`.
  ("splashed" is a new terminal status the loop treats as a successful landing.)

Determinism preserved; `sim.js` stays pure.

## Rendering — `render.js`

- **Ocean scene:** while `reentering`, draw the side view with **ocean** at the
  bottom (blue water band + gentle swell) instead of the KSC pad/ground. Optional
  small recovery ship on the water.
- **Plasma streak:** the existing nose-heat glow, intensified at re-entry
  temperatures — a bright leading-edge plasma cap and a trailing streak while the
  capsule is fast and hot.
- **Splash:** on `splashed`, a water plume + spreading ripples; the capsule bobs
  under the collapsed chute.
- Reuse the existing parachute drawing; reuse the RUD explosion for a burn-up.

## Controls & Flow — `main.js`

- **Auto:** flies the descent hands-off — the chute auto-deploys in the safe
  window; success if the build has shield + chute.
- **Manual:** a **🪂 Deploy Chute** button appears during re-entry. Early deploy
  (too fast) rips the chute (teaches "wait until you've slowed"); the safe window
  is generous.
- **Outcome messages** (replace the generic crash text for re-entry):
  - `splashed` → "🌊 Splashdown! Capsule recovered." + a recovery knowledge
    bonus (a new milestone/mission, e.g. "Recover the capsule").
  - burn-up (`crashReason === "burnup"`) → "☄️ Burned up on re-entry — add a
    Heat Shield to survive the fire." (mission still won).
  - hard splash (`crashReason === "hardsplash"`) → "💥 Hit the water too hard —
    add a Parachute." (mission still won).

## Components Touched

- `js/parts.js` — new `heatShield` part; `normalizeRocket` (`hasHeatShield`).
- `js/config.js` — `CHUTE_SAFE_SPEED`, re-entry drag/heat tuning, splashdown
  constants; heat-shield mass.
- `js/sim.js` — shield-gated burn-up RUD; reconciled re-entry deceleration;
  `chuteRipped`; `splashed` terminal status; `crashReason` values.
- `js/render.js` — ocean scene, plasma streak, splash plume.
- `js/main.js` — Manual Deploy-Chute button in re-entry; recovery bonus + the
  three re-entry result messages; treat `splashed` as a successful end.
- `js/missions.js` — a "Recover the capsule" milestone/mission reward.
- `js/sim.test.js` — re-entry assertions (below).

## Testing (headless `node js/sim.test.js`)

Seed a re-entry state (altitude ~120 km, hSpeed ~7.8 km/s, downward vSpeed,
`reentering = true`) and step to completion:

- **Shielded + chute → splashdown:** a capsule with `hasHeatShield` and
  `hasParachute` reaches `status === "splashed"` (survives the heat, soft water
  landing under `CRASH_SPEED`).
- **No shield → burn-up:** the same entry without `hasHeatShield` ends
  `crashed` with `crashReason === "burnup"` (nose-temp exceeded the limit).
- **Shield but no chute → hard splash:** survives the heat but hits the water
  above `CRASH_SPEED` → `crashed` with `crashReason === "hardsplash"`.
- **Chute rip:** deploying the chute above `CHUTE_SAFE_SPEED` leaves it
  ineffective (no soft landing).
- Existing guards still hold (ascent, orbit, Max-Q unaffected — re-entry logic
  is gated on `reentering`).

Browser verification: fly Auto to orbit with a heat shield + parachute in the
build, deploy, de-orbit → the side view shows the fiery plasma fall → chute →
ocean splashdown → "Splashdown! Capsule recovered" + knowledge. Then fly one
without a heat shield and confirm the capsule burns up with the correct message
(mission still credited).

## Open Calibration Knobs

Heat-shield mass, `NOSE_TEMP_LIMIT` vs the re-entry heat peak, the re-entry drag
tuning (must slow 7.8 km/s to a chute-safe speed), `CHUTE_SAFE_SPEED`,
`CHUTE_ALT`, `CRASH_SPEED` at splashdown, and the recovery knowledge reward —
tuned by the self-test and a browser playtest with Sebastian.

**Ascent-mass trade:** the heat shield + parachute add ~400 kg of payload, which
cuts into the ascent delta-v margin (the current starter clears orbit by only
~460 m/s). Tune so a **sensible build can carry the recovery gear to orbit and
still splash down** — e.g. lighten the heat-shield mass, and/or provide a
recovery-capable starter/loadout. Reaching orbit must not become impossible just
because the player added the gear to bring the capsule home.
