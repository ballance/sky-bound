# Max-Q Throttle Mechanic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make maximum dynamic pressure (Max-Q) a real mechanic — a rocket that pushes the lower atmosphere at full throttle overheats and RUDs unless the throttle is eased; Auto flies the bucket safely, Manual gives the player throttle control and real stakes.

**Architecture:** Extend the pure `sim.js` core to compute dynamic pressure `q = ½ρv²`, an `aeroStress = q/Q_MAX`, an overstress→heat→RUD path, and a throttle-target model with an Auto governor. Retune the starter punchier so full throttle is dangerous at Max-Q. Add Manual throttle buttons, a stress gauge, and Max-Q callouts in `main.js`/`index.html`/`css`. All physics is unit-tested headlessly via `node js/sim.test.js`.

**Tech Stack:** Vanilla JS ES modules, no build step. Tests are plain `node js/sim.test.js` using `node:assert`. UI verified in a browser via a `python3 -m http.server` (no-store) instance.

---

## File Structure

- `js/config.js` — new tuned constants: `Q_MAX`, `MAXQ_RUD_SECONDS`, `NOSE_TEMP_LIMIT`, `BUCKET_STRESS`, `BUCKET_THROTTLE`, `OVERSTRESS_HEAT`. One responsibility: tunable numbers.
- `js/sim.js` — pure physics. Gains: `q`/`aeroStress`/`maxQ` tracking; overstress heating + `overStressT` + RUD; throttle-target model with Auto governor; new `initState` fields; two `applyAction` throttle cases.
- `js/parts.js` — first-stage thrust raised so liftoff TWR ≈ 2.1.
- `js/sim.test.js` — headless assertions for q-peaks-low, Auto-safe-and-orbits, full-throttle-RUDs, easing-off-survives.
- `js/main.js` — set `autoThrottle` per mode; Max-Q + throttle-up + ease-off HUD; stress gauge in `updateHUD`.
- `index.html` — two Manual throttle buttons; stress-gauge row; ease-off warning element.
- `css/style.css` — stress-gauge + ease-off styles.

Build order is bottom-up: pressure → throttle model → failure → retune/calibrate → Manual control → HUD → verify. Each physics task leaves `node js/sim.test.js` green; UI tasks are browser-verified.

State field names (used across tasks, keep consistent):
`aeroStress` (ratio), `maxQ` (Pa), `maxQAlt` (m), `overStressT` (s), `autoThrottle` (bool), `throttleTarget` (0–1).

---

### Task 1: Dynamic pressure and aero stress

**Files:**
- Modify: `js/config.js` (constants block)
- Modify: `js/sim.js` (`initState` fields; `step` computes q/aeroStress/maxQ)
- Test: `js/sim.test.js`

- [ ] **Step 1: Add the failing test** — append to `js/sim.test.js` before the final `console.log`. Uses the existing `_initState`/`_step` and `normalize`/`profile` helpers (already in the file from earlier work):

```js
// Max-Q: dynamic pressure peaks in the lower atmosphere, not on the pad or in space
import { STARTER_ROCKET as _STARTER } from "./parts.js"; // merge if already imported
{
  const good2 = normalize(_STARTER);
  const plan2 = [
    { trigger: { type: "T", s: 0 }, action: "fire" },
    { trigger: { type: "fuelEmpty" }, action: "dropStage" },
    { trigger: { type: "then" }, action: "fire" },
  ];
  const pq = profile(good2, plan2);
  assert.ok(pq.final.maxQ > 0, "maxQ should be recorded during ascent");
  assert.ok(pq.final.maxQAlt > 3000 && pq.final.maxQAlt < 30000,
    `Max-Q altitude ${(pq.final.maxQAlt/1000).toFixed(1)}km should be in the lower atmosphere`);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node js/sim.test.js`
Expected: FAIL — `maxQ`/`maxQAlt` are undefined (0 / not tracked).

- [ ] **Step 3: Add constants** in `js/config.js` inside `CONFIG` (near the atmosphere block from the realistic-ascent phase):

```js
  // Max-Q dynamic-pressure mechanic
  Q_MAX: 40_000,          // structural dynamic-pressure limit (Pa) — stress = q / Q_MAX
  BUCKET_STRESS: 0.9,     // Auto eases the throttle when stress exceeds this
  BUCKET_THROTTLE: 0.65,  // throttle setting inside the Max-Q bucket
  OVERSTRESS_HEAT: 1_500, // °C added to heat target per unit of stress over 1
  MAXQ_RUD_SECONDS: 4,    // seconds over the limit before the airframe lets go
  NOSE_TEMP_LIMIT: 1_200, // °C airframe temperature that triggers a RUD
```

- [ ] **Step 4: Add `initState` fields** in `js/sim.js` — inside the object returned by `initState`, after `xDist: 0,`:

```js
    aeroStress: 0, // dynamic pressure / Q_MAX (1 = structural limit)
    maxQ: 0, // peak dynamic pressure seen (Pa)
    maxQAlt: 0, // altitude of peak dynamic pressure (m)
    overStressT: 0, // seconds spent over the Max-Q limit
    autoThrottle: true, // Auto flies the throttle bucket; Manual pilots it
    throttleTarget: 1, // throttle the engine ramps toward (Manual sets this)
```

- [ ] **Step 5: Compute q/aeroStress/maxQ** in `js/sim.js` `step`. Find the nose-temp block:

```js
  const speed = Math.hypot(state.vSpeed, state.hSpeed);
  const dense = Math.exp(-Math.max(0, state.altitude) / cfg.H_ATM); // real air-density ratio
  const heatTarget = 15 + dense * speed * speed * 7.5e-4;
```
Replace it with (adds q + aeroStress + maxQ tracking; leaves the heat easing line that follows unchanged for now):
```js
  const speed = Math.hypot(state.vSpeed, state.hSpeed);
  const dense = Math.exp(-Math.max(0, state.altitude) / cfg.H_ATM); // real air-density ratio
  // dynamic pressure q = 1/2 rho v^2 (rho = dense * RHO0); stress vs the structural limit
  const q = 0.5 * dense * cfg.RHO0 * speed * speed;
  state.aeroStress = q / cfg.Q_MAX;
  if (q > state.maxQ) { state.maxQ = q; state.maxQAlt = state.altitude; }
  const heatTarget = 15 + dense * speed * speed * 7.5e-4;
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node js/sim.test.js`
Expected: the Max-Q peak-altitude assertion PASSES. (Other assertions unchanged and still green.)

- [ ] **Step 7: Commit**

```bash
git add js/config.js js/sim.js js/sim.test.js
git commit -m "feat: compute Max-Q dynamic pressure and aero stress"
```

---

### Task 2: Throttle-target model and the Auto governor

Replace the "spool straight to full" throttle with a target the engine ramps toward. Auto's governor eases that target down when stress is high; Manual leaves it under player control.

**Files:**
- Modify: `js/sim.js` (`step` throttle spool)
- Test: `js/sim.test.js`

- [ ] **Step 1: Add the failing test** — append to `js/sim.test.js`:

```js
// Auto governor eases the throttle when aero stress is high; Manual holds it
{
  const r = { probeMass: 0, hasParachute: false, stages: [{ thrust: 1e6, ve: 3000, dryMass: 1000, fuel: 9000 }] };
  // AUTO: high stress -> throttle drops below full
  const a = _initState(r); a.status = "flying"; a.engineOn = true; a.throttle = 1; a.autoThrottle = true; a.aeroStress = 0.95;
  _step(a, 0.1, CONFIG, r);
  assert.ok(a.throttle < 1, "Auto should throttle down when stress is high");
  // MANUAL: same stress, autoThrottle off, target full -> throttle stays full
  const m = _initState(r); m.status = "flying"; m.engineOn = true; m.throttle = 1; m.autoThrottle = false; m.throttleTarget = 1; m.aeroStress = 0.95;
  _step(m, 0.1, CONFIG, r);
  assert.ok(Math.abs(m.throttle - 1) < 1e-9, "Manual full throttle should stay full regardless of stress");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node js/sim.test.js`
Expected: FAIL — Auto branch never reduces throttle (old spool goes to 1 unconditionally).

- [ ] **Step 3: Replace the throttle spool** in `js/sim.js` `step`. Find:

```js
  if (thrusting) state.throttle = Math.min(1, state.throttle + dt / cfg.THROTTLE_RAMP);
```
Replace with (governor picks the target in Auto; player's `throttleTarget` drives it in Manual; existing `THROTTLE_RAMP` limits how fast it moves; `clamp` already exists in sim.js):
```js
  if (thrusting) {
    // Auto flies the Max-Q bucket automatically; Manual uses the player's target.
    const target = state.autoThrottle
      ? (state.aeroStress > cfg.BUCKET_STRESS ? cfg.BUCKET_THROTTLE : 1)
      : state.throttleTarget;
    const rate = dt / cfg.THROTTLE_RAMP;
    state.throttle = clamp(state.throttle + clamp(target - state.throttle, -rate, rate), 0, 1);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node js/sim.test.js`
Expected: both governor assertions PASS. The pre-existing "starter reaches orbit" assertion still passes (Auto's bucket only engages when stress > 0.9, which the current gentle rocket rarely hits; confirm the console still prints `reaches orbit=true`).

- [ ] **Step 5: Commit**

```bash
git add js/sim.js js/sim.test.js
git commit -m "feat: throttle-target model with Auto Max-Q governor"
```

---

### Task 3: Overstress heating and RUD

**Files:**
- Modify: `js/sim.js` (`step` overstress heat + `overStressT` + RUD)
- Test: `js/sim.test.js`

- [ ] **Step 1: Add the failing test** — append to `js/sim.test.js`:

```js
// Overstress heats the airframe and, if sustained, causes a RUD; safe stress does not
{
  const r = { probeMass: 0, hasParachute: false, stages: [{ thrust: 0, ve: 3000, dryMass: 1000, fuel: 0 }] };
  // dangerous: fast and low -> stress >> 1
  const bad = _initState(r); bad.status = "flying"; bad.altitude = 10000; bad.hSpeed = 1000;
  let crashed = false;
  for (let i = 0; i < 200; i++) { _step(bad, 0.1, CONFIG, r); if (bad.status === "crashed") { crashed = true; break; } }
  assert.ok(crashed, "sustained overstress should RUD");
  // safe: slow and low -> stress < 1, survives
  const ok = _initState(r); ok.status = "flying"; ok.altitude = 10000; ok.hSpeed = 200;
  for (let i = 0; i < 200; i++) _step(ok, 0.1, CONFIG, r);
  assert.ok(ok.status !== "crashed", "sub-limit stress should not RUD");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node js/sim.test.js`
Expected: FAIL — nothing tracks `overStressT` or crashes from stress; the `bad` case never sets `status === "crashed"`.

- [ ] **Step 3: Add overstress heat + RUD** in `js/sim.js` `step`. First fold the overstress term into `heatTarget` — change the line added in Task 1:

```js
  const heatTarget = 15 + dense * speed * speed * 7.5e-4;
```
to:
```js
  const heatTarget = 15 + dense * speed * speed * 7.5e-4 + Math.max(0, state.aeroStress - 1) * cfg.OVERSTRESS_HEAT;
```
Then, immediately AFTER the existing nose-temp easing line:
```js
  state.noseTemp += (heatTarget - state.noseTemp) * Math.min(1, 0.6 * dt);
```
add the overstress accumulator and RUD check:
```js
  // time spent over the Max-Q limit; ease off in time (it cools) or the airframe fails
  if (state.aeroStress > 1) state.overStressT += dt;
  else state.overStressT = Math.max(0, state.overStressT - dt * 2); // recovers at 2x
  if (state.status === "flying" && (state.overStressT >= cfg.MAXQ_RUD_SECONDS || state.noseTemp >= cfg.NOSE_TEMP_LIMIT)) {
    state.status = "crashed"; // rapid unplanned disassembly
    return state;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node js/sim.test.js`
Expected: both RUD assertions PASS (dangerous case crashes, safe case survives). The starter orbit assertion should still pass — the current gentle starter's stress peaks below 1 (verify the console still prints `reaches orbit=true`; if the gentle starter now RUDs, that means its stress exceeds 1 and Task 4's retune/`Q_MAX` calibration will address it — note it and proceed).

- [ ] **Step 5: Commit**

```bash
git add js/sim.js js/sim.test.js
git commit -m "feat: overstress heating and Max-Q RUD"
```

---

### Task 4: Punchy retune and Q_MAX calibration

The tuning task. Raise first-stage thrust so full throttle is genuinely dangerous at Max-Q, and calibrate `Q_MAX` so: the Auto-governed starter stays under the limit and still orbits, a forced full-throttle run RUDs, and easing off survives. **Iterate the numbers until the self-test passes.**

**Files:**
- Modify: `js/parts.js` (`bigEngine.thrust`)
- Modify: `js/config.js` (`Q_MAX` if needed)
- Rewrite: `js/sim.test.js` Max-Q ascent assertions

- [ ] **Step 1: Raise first-stage thrust** in `js/parts.js` — set `bigEngine.thrust` for liftoff TWR ≈ 2.1. Starter weight ≈ 51,680 kg → weight ≈ 506 kN, so TWR 2.1 ≈ 1,060 kN. Set:

```js
  bigEngine: { id:"bigEngine", name:"Big Engine", kind:"engine", icon:"🔥", thrust: 1_060_000, ve: 3000, mass: 3_000, blurb:"High-thrust first-stage engine." },
```
(Keep `ve`, `mass`, and other fields from the realistic-ascent phase; only `thrust` changes. This is a calibration knob — adjust in Step 4.)

- [ ] **Step 2: Add the failing/target assertions** in `js/sim.test.js`. After the existing starter-orbit block, add a Max-Q behavior block (reuse the `good`/`goodPlan` already built in the file; if their names differ, use the file's real starter rocket + auto plan):

```js
// Max-Q under real flight: Auto is safe and orbits; full throttle is fatal; easing off survives.
// NOTE: bound the full-throttle / eased runs to the ascent below 40 km so a later
// ground-impact "crashed" (a suborbital lob falling back) can't be mistaken for a Max-Q RUD.
{
  const sr = normalize(STARTER_ROCKET); // read-only in step(); safe to share across runs
  const autoRun = simulate(normalize(STARTER_ROCKET), goodPlan, CONFIG);
  assert.ok(autoRun.orbited, "Auto (governed) starter still reaches orbit");
  // Auto never exceeds the structural limit (track peak stress over a fresh governed flight)
  const gov = _initState(sr); gov.status = "flying"; gov.autoThrottle = true;
  let peak = 0, si = 0, pf = 0;
  while (gov.status === "flying" && gov.t < 1200) {
    while (si < goodPlan.length && triggerReady(goodPlan[si].trigger, gov, pf)) { applyAction(gov, goodPlan[si].action, sr); pf = gov.t; si++; }
    _step(gov, CONFIG.DT, CONFIG, sr);
    if (gov.aeroStress > peak) peak = gov.aeroStress;
  }
  console.log(`maxQ: autoPeakStress ${peak.toFixed(2)} orbited ${gov.orbited}`);
  assert.ok(peak < 1, `Auto peak stress ${peak.toFixed(2)} must stay under the limit`);
  // full throttle (no governor, target pinned to 1) RUDs during the low-altitude ascent
  const full = _initState(sr); full.status = "flying"; full.autoThrottle = false; full.throttleTarget = 1; full.engineOn = true;
  let fullCrashed = false;
  for (let i = 0; i < 100000 && full.status === "flying" && full.altitude < 40000; i++) {
    _step(full, CONFIG.DT, CONFIG, sr); if (full.status === "crashed") { fullCrashed = true; break; }
  }
  assert.ok(fullCrashed, "full-throttle ascent through Max-Q must RUD below 40 km");
  // easing to the bucket the whole way keeps stress sub-limit → no RUD through Max-Q
  const eased = _initState(sr); eased.status = "flying"; eased.autoThrottle = false; eased.throttleTarget = CONFIG.BUCKET_THROTTLE; eased.engineOn = true;
  let easedCrashed = false;
  for (let i = 0; i < 100000 && eased.status === "flying" && eased.altitude < 40000; i++) {
    _step(eased, CONFIG.DT, CONFIG, sr); if (eased.status === "crashed") { easedCrashed = true; break; }
  }
  assert.ok(!easedCrashed, "easing to the bucket through Max-Q avoids the RUD");
}
```
Note: `triggerReady`, `applyAction`, `simulate`, `normalize`, `STARTER_ROCKET`, `goodPlan`, `_initState`, `_step` are all already imported/defined in `sim.test.js`. If `triggerReady`/`applyAction` are not yet imported, add them to the existing `./sim.js` import. Sharing one `sr` rocket across runs is safe because `step()` mutates the state object, never the rocket.

- [ ] **Step 3: Run to see where it stands**

Run: `node js/sim.test.js`
Expected: initially some of {Auto orbits, Auto peak < 1, full-throttle RUDs} may fail — this is the calibration target.

- [ ] **Step 4: Iterate to green** — tune `js/parts.js` `bigEngine.thrust` and `js/config.js` `Q_MAX` (and if needed `BUCKET_STRESS`/`BUCKET_THROTTLE`) until ALL pass:
  - **Full-throttle must RUD but Auto must stay < 1:** raise `bigEngine.thrust` (more speed low down → higher q) or lower `Q_MAX` to make full throttle dangerous. If Auto's governed peak also crosses 1, lower `BUCKET_THROTTLE` (deeper bucket) or `BUCKET_STRESS` (throttle sooner) so the governor holds it under 1.
  - **Auto must still orbit:** if the deeper/earlier bucket costs too much and it falls short, nudge thrust back up or the bucket shallower — balance until Auto both stays < 1 and orbits.
  - Keep liftoff gradual (the throttle still ramps from 0) and keep `deltaVBudget(good) >= CONFIG.DV_TO_ORBIT` (unchanged — thrust doesn't affect delta-v).
  Change one knob at a time; watch the `maxQ: autoPeakStress … orbited …` console line each run.

- [ ] **Step 5: Confirm green**

Run: `node js/sim.test.js`
Expected: all assertions pass — Auto orbits with peak stress < 1, full throttle RUDs, plus every earlier assertion (realistic-ascent orbit, delta-v budget, drag, rocket equation, Max-Q peak-low, governor, RUD).

- [ ] **Step 6: Commit**

```bash
git add js/parts.js js/config.js js/sim.test.js
git commit -m "feat: punchier starter and Q_MAX calibration so Max-Q bites"
```

---

### Task 5: Manual throttle control

**Files:**
- Modify: `js/sim.js` (`applyAction` throttle cases)
- Modify: `js/main.js` (`beginFlight` sets `autoThrottle` per mode)
- Modify: `index.html` (two Manual buttons)

- [ ] **Step 1: Add the failing test** — append to `js/sim.test.js`:

```js
// Manual throttle actions set the throttle target
{
  const r = { probeMass: 0, hasParachute: false, stages: [{ thrust: 1e6, ve: 3000, dryMass: 1000, fuel: 9000 }] };
  const s = _initState(r);
  applyAction(s, "throttleDown", r);
  assert.ok(Math.abs(s.throttleTarget - CONFIG.BUCKET_THROTTLE) < 1e-9, "throttleDown sets bucket throttle");
  applyAction(s, "throttleUp", r);
  assert.ok(Math.abs(s.throttleTarget - 1) < 1e-9, "throttleUp restores full throttle");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node js/sim.test.js`
Expected: FAIL — `throttleDown`/`throttleUp` actions are not handled; `throttleTarget` unchanged.

- [ ] **Step 3: Add the actions** in `js/sim.js` `applyAction`. After the `jettisonFairing` / `reenter` cases and before the `dropStage` case, add:

```js
  else if (action === "throttleDown") state.throttleTarget = CONFIG.BUCKET_THROTTLE;
  else if (action === "throttleUp") state.throttleTarget = 1;
```
(`CONFIG` is already imported at the top of `sim.js`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `node js/sim.test.js`
Expected: both throttle-action assertions PASS.

- [ ] **Step 5: Set `autoThrottle` per mode** in `js/main.js` `beginFlight`. Just after the sim state is created and `rocketNow = rocket;` is set (near `setHardEnabled(mode === "manual");`), add:

```js
  sim.autoThrottle = mode === "auto";
```
(Find the line where `sim` is assigned from `initState(...)` in `beginFlight`; place this immediately after it so the flag reflects the selected mode.)

- [ ] **Step 6: Add Manual buttons** in `index.html` — inside `#hardControls`, after the Cut button (`<button data-act="cut">✋ Cut</button>`), add:

```html
            <button data-act="throttleDown">🔽 Throttle</button>
            <button data-act="throttleUp">🔼 Full</button>
```
(The existing `#hardControls` click handler already delegates `applyAction(sim, b.dataset.act, rocketNow)`, so no new JS wiring is needed.)

- [ ] **Step 7: Verify**

Run: `node --check js/main.js` (parse) and `node js/sim.test.js` (green).
Then serve (`python3 -m http.server 8093`), open `http://localhost:8093`, build the starter, switch to **Manual**, launch, and confirm the 🔽 Throttle / 🔼 Full buttons appear and are clickable. (Full behavior is exercised in Task 7.)
Expected: parse OK, test green, buttons present in Manual. No console errors (favicon 404 excepted).

- [ ] **Step 8: Commit**

```bash
git add js/sim.js js/main.js index.html js/sim.test.js
git commit -m "feat: Manual throttle control (down/full) for the Max-Q bucket"
```

---

### Task 6: Max-Q HUD — stress gauge and callouts

**Files:**
- Modify: `index.html` (stress row + ease-off warning)
- Modify: `css/style.css` (gauge + warning styles)
- Modify: `js/main.js` (`updateHUD` gauge + ease-off; Max-Q / throttle-up callouts + reset flags in `beginFlight`)

- [ ] **Step 1: Add the HUD markup** in `index.html` — in the `.telemetry` block, after the Fuel row, add a Max-Q gauge; and after the telemetry block (or near the callout), add an ease-off warning:

```html
            <div class="stress"><span>Max-Q</span><div class="bar"><i id="tStress"></i></div></div>
```
and, just after the `<div class="callout" id="callout" ...></div>` element:
```html
          <div id="maxqWarn" class="maxq-warn" aria-live="assertive"></div>
```

- [ ] **Step 2: Add styles** in `css/style.css`:

```css
.stress .bar i { background: #37d67a; transition: width .1s linear, background .2s linear; }
.maxq-warn { min-height: 20px; color: #ff5252; font-weight: 700; text-align: center; margin: 4px 0; }
```
(The `.bar` container styles are shared with the existing Fuel bar; only the fill color/behavior for the stress fill is set here.)

- [ ] **Step 3: Update the gauge** in `js/main.js` `updateHUD` — after the fuel-bar line (`$("tFuel").style.width = ...`), add:

```js
  const stress = s.aeroStress || 0;
  const st = $("tStress");
  st.style.width = `${Math.min(100, stress * 100)}%`;
  st.style.background = stress > 1 ? "#ff5252" : stress > 0.75 ? "#ffb020" : "#37d67a";
  // Manual pilots get a loud warning while over the limit
  $("maxqWarn").textContent = !s.autoThrottle && stress > 1 ? "⚠️ EASE OFF THE THROTTLE!" : "";
```

- [ ] **Step 4: Add Max-Q callouts** in `js/main.js`. Add two module-level flags near the other flight vars (e.g. by `let rocketNow = null;`):

```js
let maxQCalled = false, throttleUpCalled = false;
```
Reset them in `beginFlight` (near the other resets, e.g. by `sim.autoThrottle = ...`):
```js
  maxQCalled = false; throttleUpCalled = false;
```
Then in the flight loop, after `step(sim, dt, CONFIG, rocketNow);` (the same place other in-flight callouts fire), add:
```js
      if (!maxQCalled && sim.aeroStress > 0.8 && sim.altitude > 4000) {
        maxQCalled = true;
        const c = $("callout"); c.textContent = "🔺 MAX-Q"; c.className = "callout";
      } else if (maxQCalled && !throttleUpCalled && sim.maxQ > 0 && sim.aeroStress < 0.4 && sim.altitude > 12000) {
        throttleUpCalled = true;
        const c = $("callout"); c.textContent = "🚀 GO AT THROTTLE UP"; c.className = "callout";
      }
```
(If the loop advances multiple sim substeps per frame, place this once per frame after the substep `while` loop, using the post-substep `sim` state.)

- [ ] **Step 5: Verify**

Run: `node --check js/main.js` and `node js/sim.test.js` (green).
Serve and launch the starter in **Auto**: confirm the Max-Q gauge fills green→amber as it climbs, "🔺 MAX-Q" then "🚀 GO AT THROTTLE UP" callouts fire, and the gauge never goes red (Auto governs it). No ease-off warning in Auto.
Expected: gauge + callouts behave; no console errors.

- [ ] **Step 6: Commit**

```bash
git add index.html css/style.css js/main.js
git commit -m "feat: Max-Q HUD stress gauge and throttle callouts"
```

---

### Task 7: Full-flight verification and deploy

**Files:** None (verification), or small fixes surfaced by end-to-end testing.

- [ ] **Step 1: Headless test green**

Run: `node js/sim.test.js`
Expected: all assertions pass — Max-Q peaks low, governor, RUD, Auto orbits with peak stress < 1, full-throttle RUDs, Manual throttle actions, plus all realistic-ascent assertions.

- [ ] **Step 2: Auto end-to-end (browser)**

Serve on a fresh port. Build the starter, tick Quick countdown, launch in **Auto**, warp as needed. Confirm: liftoff, the Max-Q gauge rises then the throttle visibly eases (flame dips) with "🔺 MAX-Q", gauge stays out of the red, "🚀 GO AT THROTTLE UP" as it clears, then a normal climb to ORBIT. No RUD in Auto.
Expected: a clean governed ascent to orbit; no console errors (favicon 404 excepted).

- [ ] **Step 3: Manual failure + save (browser)**

Reset, switch to **Manual**, launch, fire, and hold full throttle through the climb: confirm the gauge redlines, "⚠️ EASE OFF THE THROTTLE!" shows, and a sustained overshoot ends in a RUD (explosion). Reset and repeat, this time pressing **🔽 Throttle** as the gauge nears red and **🔼 Full** after it falls — confirm the rocket survives Max-Q and continues.
Expected: full throttle RUDs; easing off saves it; both read clearly.

- [ ] **Step 4: Deploy**

```bash
./deploy.sh
```
Confirm the S3 sync + CloudFront invalidation succeed and `https://skybound.bastionforge.com` serves the new build.

- [ ] **Step 5: Commit any fixes and push**

```bash
git add -A && git commit -m "test: verify Max-Q throttle mechanic end-to-end"
git push origin master
```

---

## Notes for the implementer

- **The self-test is the contract.** Tasks 1–5 are TDD against `node js/sim.test.js`. Task 4 is pure calibration — tune the knobs until green, don't weaken the assertions.
- **Numbers are knobs.** `Q_MAX`, `bigEngine.thrust`, `BUCKET_STRESS`, `BUCKET_THROTTLE`, `OVERSTRESS_HEAT`, `MAXQ_RUD_SECONDS`, `NOSE_TEMP_LIMIT` are all calibration knobs. Tune to green, then sanity-check the feel in the browser.
- **Keep it deterministic.** `sim.js` stays pure (no `Date.now`/`Math.random`); `aeroStress` used by the governor is the previous tick's value (computed at end of `step`) — a one-tick lag that's fine at `DT` 0.05.
- **Auto must never fail from Max-Q.** If any tuning makes the Auto-governed starter RUD or miss orbit, that's a calibration bug, not acceptable — fix the knobs.
