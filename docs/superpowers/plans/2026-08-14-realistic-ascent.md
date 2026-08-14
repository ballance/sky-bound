# Realistic Ascent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Skybound's powered ascent obey real physics — a rocket must earn ~9.4 km/s of delta-v (real rocket equation, real Earth gravity, atmosphere + drag) to reach true orbital velocity (~7.8 km/s), with time-warp pacing and delta-v/apoapsis readouts.

**Architecture:** Extend the existing pure `sim.js` core (deterministic `step(state, dt)`) with real constants, exhaust-velocity mass flow, exponential-atmosphere drag, a circular-velocity orbit test, and osculating apoapsis/periapsis. Retune `parts.js` to real exhaust velocities and propellant fractions. Add a time-warp multiplier and real-unit readouts in `main.js`/`index.html`. All physics is unit-tested headlessly via `node js/sim.test.js`; UI is verified in a browser.

**Tech Stack:** Vanilla JS ES modules, no build step. Tests are plain `node --` scripts using `node:assert` (no framework). Local preview via `python3 -m http.server`; UI verification with a browser.

---

## File Structure

- `js/config.js` — real constants block (G0, R_EARTH, GM, RHO0, H_ATM, CDA, orbit margin, dv target, time-warp tiers). One responsibility: tunable numbers.
- `js/sim.js` — pure physics. Gains: real gravity `GM/r²`, `vCirc(alt)`, atmosphere/drag, mass flow via `ve`, orbit test on `vCirc`, `orbitElements()` (apo/peri). No DOM.
- `js/parts.js` — part data. Engines gain `ve` (drop `burn`); tanks get realistic propellant fractions; a `STARTER_ROCKET` id list that reaches orbit.
- `js/sim.test.js` — headless self-test. Extended with real-physics assertions.
- `js/main.js` — glue. `normalizeRocket` carries `ve`; a `deltaVBudget()`; time-warp state + loop integration; real-unit HUD; build delta-v readout.
- `js/render.js` — camera spans real altitude (~250 km); nose-temp uses real density (already speed-based); warp indicator is drawn by HUD not render.
- `index.html` / `css/style.css` — warp buttons, apoapsis/periapsis/delta-v/warp readouts.

Build order below is bottom-up: constants → propulsion → atmosphere → orbit math → rebalance/tuning → UI. Each task leaves the tree green (`node js/sim.test.js` passes) or, for UI tasks, visibly working in a browser.

---

### Task 1: Real gravity constants and circular velocity

**Files:**
- Modify: `js/config.js` (constants block)
- Modify: `js/sim.js` (`gravity`, new `vCirc`)
- Test: `js/sim.test.js`

- [ ] **Step 1: Add the failing test** — append to `js/sim.test.js` (before the final `console.log`):

```js
import { gravity, vCirc } from "./sim.js"; // add to the existing import if not present
// Real gravity + circular velocity
assert.ok(Math.abs(gravity(0) - 9.81) < 0.05, `surface gravity ${gravity(0).toFixed(3)} should be ~9.81`);
assert.ok(Math.abs(vCirc(200_000) - 7789) < 20, `v_circ@200km ${vCirc(200_000).toFixed(0)} should be ~7789 m/s`);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node js/sim.test.js`
Expected: FAIL — `vCirc` is not exported / not a function.

- [ ] **Step 3: Add constants** in `js/config.js` inside the `CONFIG` object (add near the World block):

```js
  // Real Earth (SI)
  G0: 9.80665,
  R_EARTH: 6.371e6,
  GM: 3.986e14,
  // Atmosphere (exponential) and drag
  RHO0: 1.225,
  H_ATM: 8500,
  CDA: 0.9, // drag coefficient x reference area (tuned)
  // Orbit insertion: tangential speed >= vCirc, above this altitude
  ORBIT_MARGIN_ALT: 140_000,
  DV_TO_ORBIT: 9400, // build-screen "can reach orbit" threshold
```

- [ ] **Step 4: Real gravity + vCirc** in `js/sim.js` — replace the existing `gravity` and add `vCirc`:

```js
// gravity from real GM, weakening with altitude (inverse-square)
export function gravity(alt, cfg = CONFIG) {
  const r = cfg.R_EARTH + Math.max(0, alt);
  return cfg.GM / (r * r);
}

// circular orbital velocity at this altitude
export function vCirc(alt, cfg = CONFIG) {
  return Math.sqrt(cfg.GM / (cfg.R_EARTH + Math.max(0, alt)));
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node js/sim.test.js`
Expected: PASS for the two new assertions (other assertions may now fail — that's fixed in later tasks; if the file aborts on an earlier assertion, temporarily move the new asserts above it to confirm, then restore).

- [ ] **Step 6: Commit**

```bash
git add js/config.js js/sim.js js/sim.test.js
git commit -m "feat: real Earth gravity constants and circular velocity"
```

---

### Task 2: Exhaust velocity and mass flow (rocket equation)

Engines get a real exhaust velocity `ve`; propellant burns at `mdot = thrust/ve`. `burn` is removed everywhere.

**Files:**
- Modify: `js/parts.js` (engine defs, `partSpecs` data if referenced)
- Modify: `js/sim.js` (`step` mass flow)
- Modify: `js/main.js` (`normalizeRocket` carries `ve`)
- Modify: `js/partart.js` (`partSpecs` engine line uses `ve`)
- Modify: `js/sim.test.js` (`normalize` helper carries `ve`; delta-v identity test)

- [ ] **Step 1: Add the failing test** — in `js/sim.test.js`, update the `normalize` helper's engine branch to carry `ve` and add a single-stage delta-v identity check. Change the engine line in `normalize` from:

```js
    if (p.kind === "engine") { cur = { thrust: p.thrust, burn: p.burn, dryMass: p.mass, fuel: 0 }; stages.push(cur); }
```
to:
```js
    if (p.kind === "engine") { cur = { thrust: p.thrust, ve: p.ve, dryMass: p.mass, fuel: 0 }; stages.push(cur); }
```

Then append this test:

```js
// rocket equation: a single stage delivers ve * ln(m0/mf), integrated by step()
import { initState as _initState, step as _step } from "./sim.js";
{
  const r = { probeMass: 0, hasParachute: false, stages: [{ thrust: 1e6, ve: 3000, dryMass: 1000, fuel: 9000 }] };
  const s = _initState(r); s.status = "flying"; s.engineOn = true; s.throttle = 1; // full throttle, no ramp
  // integrate in a gravity/drag-free vacuum far from Earth so only thrust acts
  const cfg = { ...CONFIG, GM: 0, RHO0: 0 };
  let v = 0;
  for (let i = 0; i < 100000 && s.fuel > 0; i++) { const before = s.hSpeed; _step(s, 0.01, cfg, r); }
  const expected = 3000 * Math.log(10000 / 1000); // ~6908 m/s
  // with pitch=0 near ground all thrust is vertical; measure total speed gained
  const got = Math.hypot(s.vSpeed, s.hSpeed);
  assert.ok(Math.abs(got - expected) < 60, `stage dv ${got.toFixed(0)} should be ~${expected.toFixed(0)}`);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node js/sim.test.js`
Expected: FAIL — engines have no `ve`; `step` still uses `burn`.

- [ ] **Step 3: Give engines `ve`** in `js/parts.js` — replace `burn` with `ve` on the two engine tiers (keep placeholder thrust/mass; final values in Task 5):

```js
  bigEngine: {
    id: "bigEngine", name: "Big Engine", kind: "engine", icon: "🔥",
    thrust: 560_000, ve: 3000, mass: 1_400,
    blurb: "Lots of push, kerosene-grade exhaust.",
  },
  smallEngine: {
    id: "smallEngine", name: "Small Engine", kind: "engine", icon: "🔸",
    thrust: 210_000, ve: 3500, mass: 600,
    blurb: "Efficient vacuum engine — great for the upper stage.",
  },
```

Also update the `booster` def: replace `burn: <n>` with `ve: 2900`.

- [ ] **Step 4: Mass flow in `step`** — in `js/sim.js`, replace the fuel-burn line. Find:

```js
  if (thrusting) state.fuel = Math.max(0, state.fuel - stage.burn * state.throttle * dt);
```
Replace with:
```js
  if (thrusting) {
    const mdot = stage.thrust / stage.ve; // rocket equation mass flow
    state.fuel = Math.max(0, state.fuel - mdot * state.throttle * dt);
  }
```

- [ ] **Step 5: `normalizeRocket` carries `ve`** — in `js/main.js`, in `normalizeRocket`, change the engine and booster branches:

Engine branch, from:
```js
      cur = { thrust: p.thrust, burn: p.burn, dryMass: p.mass, fuel: 0 };
```
to:
```js
      cur = { thrust: p.thrust, ve: p.ve, dryMass: p.mass, fuel: 0 };
```
Booster branch, from:
```js
      if (s) { s.thrust += p.thrust; s.burn += p.burn; s.fuel += fuel; s.dryMass += p.mass; }
```
to (a strap-on booster raises the stage's thrust; keep the stage `ve` as the core engine's — a simplification that's fine for the game):
```js
      if (s) { s.thrust += p.thrust; s.fuel += fuel; s.dryMass += p.mass; }
```

- [ ] **Step 6: `partSpecs` shows `ve`** — in `js/partart.js`, in `partSpecs`, replace the engine case:

```js
    case "engine":
      return `Thrust <b>${thrust(p.thrust)}</b> · Exhaust <b>${(p.ve / 1000).toFixed(1)} km/s</b>`;
```
And the booster case, replace `p.burn` usage with fuel only:
```js
    case "booster":
      return `Thrust <b>${thrust(p.thrust)}</b> · Fuel <b>${kg(p.fuel)}</b>`;
```

- [ ] **Step 7: Run test to verify it passes**

Run: `node js/sim.test.js`
Expected: the new delta-v identity assertion PASSES (other ascent asserts may still fail until Task 5).

- [ ] **Step 8: Commit**

```bash
git add js/parts.js js/sim.js js/main.js js/partart.js js/sim.test.js
git commit -m "feat: rocket equation via engine exhaust velocity (drop burn)"
```

---

### Task 3: Exponential atmosphere and drag

**Files:**
- Modify: `js/config.js` (already has RHO0/H_ATM/CDA from Task 1)
- Modify: `js/sim.js` (`step` drag; nose-temp uses real density)
- Test: `js/sim.test.js`

- [ ] **Step 1: Add the failing test** — append:

```js
// drag: a fast object low in the atmosphere loses horizontal speed to drag
{
  const r = { probeMass: 500, hasParachute: false, stages: [{ thrust: 0, ve: 3000, dryMass: 500, fuel: 0 }] };
  const lo = _initState(r); lo.status = "flying"; lo.altitude = 1000; lo.hSpeed = 2000;
  _step(lo, 0.1, CONFIG, r);
  assert.ok(lo.hSpeed < 2000, "drag should slow a fast object in thick air");
  const hi = _initState(r); hi.status = "flying"; hi.altitude = 200000; hi.hSpeed = 2000;
  _step(hi, 0.1, CONFIG, r);
  assert.ok(Math.abs(hi.hSpeed - 2000) < 0.01, "negligible drag in near-vacuum");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node js/sim.test.js`
Expected: FAIL — no drag; low object keeps 2000 m/s.

- [ ] **Step 3: Add drag** in `js/sim.js` `step`, immediately AFTER the velocity integration lines (`state.vSpeed += aUp*dt; state.hSpeed += aH*dt;`) and BEFORE any re-entry drag block:

```js
  // atmospheric drag: F = 0.5 * rho * v^2 * CdA, opposing the velocity vector
  const rho = cfg.RHO0 * Math.exp(-Math.max(0, state.altitude) / cfg.H_ATM);
  const spd = Math.hypot(state.vSpeed, state.hSpeed);
  if (spd > 0.01) {
    const dragAcc = (0.5 * rho * spd * spd * cfg.CDA) / mass;
    const k = Math.min(1, (dragAcc / spd) * dt); // fractional velocity removed this step
    state.vSpeed -= state.vSpeed * k;
    state.hSpeed -= state.hSpeed * k;
  }
```

- [ ] **Step 4: Nose-temp uses real density** — in `js/sim.js`, replace the existing nose-temp `dense` proxy line:

```js
  const dense = Math.max(0, 1 - state.altitude / cfg.SPACE_ALT);
```
with the true density ratio:
```js
  const dense = Math.exp(-Math.max(0, state.altitude) / cfg.H_ATM); // real air-density ratio
```
(Leave the `heatTarget`/easing lines as they are — they now use real density.)

- [ ] **Step 5: Run test to verify it passes**

Run: `node js/sim.test.js`
Expected: the two drag assertions PASS.

- [ ] **Step 6: Commit**

```bash
git add js/sim.js js/sim.test.js
git commit -m "feat: exponential atmosphere and aerodynamic drag"
```

---

### Task 4: Orbit at circular velocity, and apoapsis/periapsis

**Files:**
- Modify: `js/sim.js` (orbit condition; new `orbitElements`)
- Test: `js/sim.test.js`

- [ ] **Step 1: Add the failing test** — append:

```js
import { orbitElements } from "./sim.js";
{
  // a body at 200 km moving horizontally at exactly vCirc is in a circular orbit
  const st = { altitude: 200000, vSpeed: 0, hSpeed: vCirc(200000) };
  const el = orbitElements(st, CONFIG);
  assert.ok(Math.abs(el.apo - 200000) < 2000 && Math.abs(el.peri - 200000) < 2000,
    `circular orbit apo/peri ~200km, got apo ${el.apo.toFixed(0)} peri ${el.peri.toFixed(0)}`);
  // slightly faster -> apoapsis rises above 200 km
  const st2 = { altitude: 200000, vSpeed: 0, hSpeed: vCirc(200000) * 1.05 };
  assert.ok(orbitElements(st2, CONFIG).apo > 260000, "faster than circular raises apoapsis");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node js/sim.test.js`
Expected: FAIL — `orbitElements` not exported.

- [ ] **Step 3: Add `orbitElements`** in `js/sim.js`:

```js
// Osculating orbit apoapsis/periapsis ALTITUDES from the current state.
export function orbitElements(state, cfg = CONFIG) {
  const r = cfg.R_EARTH + Math.max(0, state.altitude);
  const v2 = state.vSpeed * state.vSpeed + state.hSpeed * state.hSpeed;
  const eps = v2 / 2 - cfg.GM / r; // specific orbital energy
  if (eps >= 0) return { apo: Infinity, peri: r - cfg.R_EARTH }; // unbound
  const a = -cfg.GM / (2 * eps);
  const h = r * state.hSpeed; // angular momentum ~ r * tangential(=horizontal) speed
  const e = Math.sqrt(Math.max(0, 1 + (2 * eps * h * h) / (cfg.GM * cfg.GM)));
  return { apo: a * (1 + e) - cfg.R_EARTH, peri: a * (1 - e) - cfg.R_EARTH };
}
```

- [ ] **Step 4: Real orbit condition** — in `js/sim.js` `step`, replace the current orbit block:

```js
  if (!state.orbited && state.altitude >= cfg.ORBIT_ALT && state.hSpeed >= cfg.ORBIT_SPEED) {
```
with:
```js
  if (!state.orbited && state.altitude >= cfg.ORBIT_MARGIN_ALT && state.hSpeed >= vCirc(state.altitude, cfg)) {
```
(Leave the body — `state.orbited = true; state.engineOn = false; state.vSpeed = 0;` — unchanged.)

- [ ] **Step 5: Run test to verify it passes**

Run: `node js/sim.test.js`
Expected: the apo/peri assertions PASS.

- [ ] **Step 6: Commit**

```bash
git add js/sim.js js/sim.test.js
git commit -m "feat: orbit at real circular velocity; apoapsis/periapsis math"
```

---

### Task 5: Parts rebalance, starter rocket, and gravity-turn tuning

The tuning task. Retune engines/tanks and the pitch program so a realistic 2–3-stage rocket reaches `vCirc` above the atmosphere, verified by the self-test. **Iterate the numbers until the test passes** — the test is the acceptance criterion.

**Files:**
- Modify: `js/parts.js` (engine thrust, tank propellant fractions, `STARTER_ROCKET`)
- Modify: `js/config.js` (pitch schedule constants if needed)
- Modify: `js/sim.js` (`pitch` program if the schedule shape changes)
- Modify: `js/main.js` (`deltaVBudget`)
- Rewrite: `js/sim.test.js` orbit assertions for the real regime

- [ ] **Step 1: Add `deltaVBudget`** in `js/main.js` (near `normalizeRocket`):

```js
// Serial-staging total delta-v: sum of ve * ln(m0/mf) per stage, lower stages
// carrying the upper stages + payload as dead weight.
function deltaVBudget(rocket) {
  const payload = rocket.probeMass + (rocket.fairingMass || 0);
  const above = (i) => rocket.stages.slice(i).reduce((m, s) => m + s.dryMass + s.fuel, 0) + payload;
  let dv = 0;
  for (let i = 0; i < rocket.stages.length; i++) {
    const s = rocket.stages[i];
    const m0 = above(i);
    const mf = m0 - s.fuel;
    if (mf > 0) dv += s.ve * Math.log(m0 / mf);
  }
  return dv;
}
```

- [ ] **Step 2: Retune parts** in `js/parts.js`. Target: a 2-stage starter makes ~9.4 km/s. Use light tanks (dry ≈ 8% of wet) and these starting values (calibration knobs — adjust in Step 5):

```js
  // engines
  bigEngine:   { id:"bigEngine", name:"Big Engine", kind:"engine", icon:"🔥", thrust: 1_600_000, ve: 3000, mass: 3_000, blurb:"High-thrust first-stage engine." },
  smallEngine: { id:"smallEngine", name:"Small Engine", kind:"engine", icon:"🔸", thrust: 260_000, ve: 3600, mass: 900, blurb:"Efficient vacuum engine for the upper stage." },
  // tanks: dry ~8% of wet
  tank:    { id:"tank", name:"Fuel Tank", kind:"tank", icon:"🛢️", fuel: 22_000, mass: 1_800, blurb:"Holds the propellant your engine burns." },
  bigTank: { id:"bigTank", name:"Bigger Tank", kind:"tank", icon:"🛢️", fuel: 44_000, mass: 3_500, price: 10, blurb:"Twice the propellant." },
```
Update `booster` to `{ ..., thrust: 900_000, ve: 2900, mass: 2_500, fuel: 20_000, price: 8 }`. Add a starter-rocket export at the bottom:
```js
// A known-good rocket that reaches orbit — used for the "new player" default and tests.
export const STARTER_ROCKET = ["bigEngine", "tank", "smallEngine", "tank", "probe"];
```

- [ ] **Step 3: Rewrite the orbit assertions** in `js/sim.test.js`. Replace the `good` rocket build + its `profile`/assertions with a real-regime check that builds from `STARTER_ROCKET`:

```js
import { STARTER_ROCKET } from "./parts.js";
const good = normalize(STARTER_ROCKET);
const goodPlan = [
  { trigger: { type: "T", s: 0 }, action: "fire" },
  { trigger: { type: "fuelEmpty" }, action: "dropStage" },
  { trigger: { type: "then" }, action: "fire" },
];
const p = profile(good, goodPlan); // profile() loops while flying && !orbited (already in file)
console.log(`starter: dv budget… reaches orbit=${p.final.orbited} maxAlt ${(p.final.maxAlt/1000).toFixed(0)}km hSpeed ${p.final.maxHSpeed.toFixed(0)}`);
assert.ok(p.final.orbited, "the starter rocket must reach orbit (hSpeed >= vCirc above the atmosphere)");
const els = orbitElements(p.final, CONFIG);
assert.ok(els.peri > 100000, `periapsis ${els.peri.toFixed(0)} must clear the atmosphere`);
// underpowered: one small engine + one tank cannot make orbit
assert.ok(!simulate(normalize(["smallEngine", "tank", "probe"]), goodPlan, CONFIG).orbited, "underpowered rocket must not orbit");
```
(Delete the now-obsolete TWR-to-1km assertions if they conflict; keep a gradual-liftoff sanity check if it still holds after retuning.)

- [ ] **Step 4: Retune the gravity turn** in `js/config.js` — widen the pitch program so horizontal velocity can reach ~7.8 km/s. Set:

```js
  PITCH_START_ALT: 1_500,
  PITCH_END_ALT: 120_000,
  PITCH_MAX: 1.50, // radians from vertical (~86°, nearly horizontal near orbit)
```
If `pitch(alt)` needs a different shape (e.g. hold horizontal above `PITCH_END_ALT`), it already clamps `f` to 1, giving `PITCH_MAX` — no code change needed unless tuning demands it.

- [ ] **Step 5: Iterate to green**

Run: `node js/sim.test.js`
Expected: `p.final.orbited === true`, periapsis > 100 km, underpowered rocket fails.
If it does not orbit: increase tank `fuel` / lower tank `mass` (more delta-v), raise `PITCH_MAX` or `PITCH_END_ALT` (more horizontal), or lower `CDA` (less drag). If it reaches orbit too easily, tighten the opposite way. Re-run until all assertions pass. Keep `deltaVBudget(good) >= CONFIG.DV_TO_ORBIT`.

- [ ] **Step 6: Add a delta-v budget assertion** to `js/sim.test.js`:

```js
// (this import lives in main.js, so replicate the tiny formula here to keep the test standalone)
function dvBudget(r){const pay=r.probeMass+(r.fairingMass||0);const above=i=>r.stages.slice(i).reduce((m,s)=>m+s.dryMass+s.fuel,0)+pay;let d=0;for(let i=0;i<r.stages.length;i++){const s=r.stages[i];const m0=above(i);d+=s.ve*Math.log(m0/(m0-s.fuel));}return d;}
assert.ok(dvBudget(good) >= CONFIG.DV_TO_ORBIT, `starter delta-v ${dvBudget(good).toFixed(0)} must exceed ${CONFIG.DV_TO_ORBIT}`);
```

- [ ] **Step 7: Commit**

```bash
git add js/parts.js js/config.js js/sim.js js/main.js js/sim.test.js
git commit -m "feat: rebalance parts to real regime; starter rocket reaches orbit"
```

---

### Task 6: Build-screen delta-v budget readout

**Files:**
- Modify: `js/main.js` (`updateBuildStats`)
- Modify: `js/css/style.css` (reuse `.twr` styles)

- [ ] **Step 1: Show delta-v in the build stats** — in `js/main.js` `updateBuildStats`, after the TWR block, compute and append delta-v:

```js
  const dv = deltaVBudget(rocket);
  const dvOk = dv >= CONFIG.DV_TO_ORBIT;
  const dvClass = dvOk ? "good" : "bad";
  const dvLabel = dvOk ? "enough to reach orbit ✅" : `need ${(CONFIG.DV_TO_ORBIT / 1000).toFixed(1)} km/s`;
```
Then extend the `$("rocketStats").innerHTML` string with a second line:
```js
    + `<div class="twr twr-${dvClass}">Delta-v = <b>${(dv / 1000).toFixed(2)} km/s</b> — ${dvLabel}</div>`
```

- [ ] **Step 2: Verify in a browser**

Run: `python3 -m http.server 8091` then open `http://localhost:8091`.
Build the starter (Big Engine, Fuel Tank, Small Engine, Fuel Tank, Probe). Confirm the "Your Rocket" panel shows `Delta-v = ~9–10 km/s — enough to reach orbit ✅`. Remove a tank and confirm it drops below and turns red.
Expected: delta-v readout matches, verdict flips correctly. No console errors (favicon 404 is fine).

- [ ] **Step 3: Commit**

```bash
git add js/main.js
git commit -m "feat: build-screen delta-v budget with orbit verdict"
```

---

### Task 7: Time-warp control

Replace the fixed `TIME_SCALE` with a base scale times a live warp multiplier the player controls.

**Files:**
- Modify: `js/config.js` (`TIME_SCALE` → base; add `WARP_TIERS`)
- Modify: `js/main.js` (warp state, loop, buttons)
- Modify: `index.html` (warp buttons)
- Modify: `css/style.css` (warp button styles)

- [ ] **Step 1: Config** — in `js/config.js` set the base near real time and list tiers:

```js
  TIME_SCALE: 1, // base: real time; multiplied by the live warp factor
  WARP_TIERS: [1, 2, 5, 10, 25],
```

- [ ] **Step 2: Warp state + loop** — in `js/main.js`, add near the other launch vars:

```js
let warp = 1;
```
In the flight loop, change the sim-advance line from:
```js
    let simDt = realDt * CONFIG.TIME_SCALE;
```
to:
```js
    let simDt = realDt * CONFIG.TIME_SCALE * warp;
```
Reset `warp = 1` at the top of `beginFlight` (near the other resets).

- [ ] **Step 3: Warp buttons markup** — in `index.html`, inside the `.hud`, just above `.launch-buttons`, add:

```html
          <div class="warp" id="warp">
            <span class="warp-label">Warp</span>
            <button data-warp="1" class="active">1×</button>
            <button data-warp="2">2×</button>
            <button data-warp="5">5×</button>
            <button data-warp="10">10×</button>
            <button data-warp="25">25×</button>
          </div>
```

- [ ] **Step 4: Wire the buttons** — in `js/main.js` events section:

```js
$("warp").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-warp]");
  if (!b) return;
  warp = Number(b.dataset.warp);
  $("warp").querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b));
});
```

- [ ] **Step 5: Styles** — in `css/style.css`:

```css
.warp { display: flex; align-items: center; gap: 6px; margin: 8px 0; flex-wrap: wrap; }
.warp-label { color: var(--dim); font-size: 13px; }
.warp button { background: var(--panel2); color: var(--dim); border: 1px solid #33407a; border-radius: 6px; padding: 4px 8px; font-size: 13px; cursor: pointer; }
.warp button.active { background: var(--accent); color: #04101f; border-color: var(--accent); font-weight: 700; }
```

- [ ] **Step 6: Verify in a browser**

Serve and launch the starter (tick Quick countdown). During flight click `10×` and confirm the mission clock advances ~10× faster; click `1×` and it slows to near real time.
Expected: warp changes flight speed live; the active tier highlights. No console errors.

- [ ] **Step 7: Commit**

```bash
git add js/config.js js/main.js index.html css/style.css
git commit -m "feat: time-warp control for real-length ascents"
```

---

### Task 8: Real-unit HUD (speed km/s, apoapsis, periapsis, delta-v remaining)

**Files:**
- Modify: `index.html` (telemetry rows)
- Modify: `js/main.js` (`updateHUD`; needs `vCirc`/`orbitElements` imports and a per-flight starting delta-v)

- [ ] **Step 1: Telemetry rows** — in `index.html`, replace the Speed row and add apo/peri/dv rows:

```html
            <div><span>Speed</span><b id="tSpd">0.00 km/s</b></div>
            <div><span>Apoapsis</span><b id="tApo">—</b></div>
            <div><span>Periapsis</span><b id="tPeri">—</b></div>
            <div><span>Δv left</span><b id="tDv">0.0 km/s</b></div>
```
(Keep the existing Altitude, Nose temp, and Fuel rows.)

- [ ] **Step 2: Imports + budget** — in `js/main.js`, ensure the sim import includes `orbitElements` and `vCirc`:

```js
import { initState, step, applyAction, triggerReady, simulate, orbitElements } from "./sim.js";
```
In `beginFlight`, capture the starting budget once (near the resets):
```js
launchDv = deltaVBudget(rocket); // module-level: let launchDv = 0;
```

- [ ] **Step 3: Update `updateHUD`** — replace the speed line and add apo/peri/dv. In `js/main.js` `updateHUD`:

```js
  $("tSpd").textContent = `${(spd / 1000).toFixed(2)} km/s`;
  const el = orbitElements(s, CONFIG);
  const km = (m) => (m === Infinity ? "escape" : `${(m / 1000).toFixed(0)} km`);
  $("tApo").textContent = s.altitude > 30000 ? km(el.apo) : "—";
  $("tPeri").textContent = s.altitude > 30000 ? km(el.peri) : "—";
  // delta-v spent so far ~ launchDv minus remaining stage capacity
  const remaining = (() => {
    let dv = 0; const stages = rocketNow.stages;
    // remaining = current stage's leftover + all not-yet-used upper stages
    const payload = rocketNow.probeMass + (rocketNow.fairingMass || 0);
    for (let i = s.stageIndex; i < stages.length; i++) {
      const above = stages.slice(i).reduce((m, st) => m + st.dryMass + st.fuel, 0) + payload;
      const fuelNow = i === s.stageIndex ? s.fuel : stages[i].fuel;
      const m0 = above - (stages[i].fuel - fuelNow); // account for already-burned current-stage fuel
      const mf = m0 - fuelNow;
      if (mf > 0) dv += stages[i].ve * Math.log(m0 / mf);
    }
    return dv;
  })();
  $("tDv").textContent = `${(remaining / 1000).toFixed(1)} km/s`;
```

- [ ] **Step 4: Verify in a browser**

Launch the starter. Confirm Speed reads in km/s and climbs toward ~7.8; Apoapsis rises as you burn; Δv-left falls toward 0; Periapsis rises above 100 km near insertion.
Expected: readouts are sensible and update live. No console errors.

- [ ] **Step 5: Commit**

```bash
git add index.html js/main.js
git commit -m "feat: real-unit HUD with apoapsis/periapsis and delta-v remaining"
```

---

### Task 9: Camera range for real altitude

The side view must remain readable from the pad up to ~250 km.

**Files:**
- Modify: `js/render.js` (`drawScene` camera `mPerPx`)

- [ ] **Step 1: Altitude-adaptive vertical scale** — in `js/render.js` `drawScene`, replace the fixed `const mPerPx = 6;` with a scale that zooms out as you climb so the rocket stays on-screen without astronomically large scroll:

```js
  // meters-per-pixel grows with altitude: fine detail near the pad, wide view high up
  const mPerPx = 6 + Math.min(2600, state.altitude / 90);
```
(At 0 km ≈ 6 m/px like today; by ~230 km ≈ ~2.6 km/px so space fits the panel.)

- [ ] **Step 2: Verify in a browser**

Launch the starter and watch the whole ascent (use warp). Confirm the rocket stays visible through the climb, the pad recedes smoothly, and the sky→space gradient still reads. The nose-temp glow appears during max-Q.
Expected: continuous, readable ascent from pad to orbit. No console errors.

- [ ] **Step 3: Commit**

```bash
git add js/render.js
git commit -m "feat: altitude-adaptive camera scale for real ascent"
```

---

### Task 10: Full-flight verification and green self-test

**Files:**
- None (verification), or small fixes surfaced by end-to-end testing.

- [ ] **Step 1: Headless test green**

Run: `node js/sim.test.js`
Expected: all assertions pass — real gravity/vCirc, rocket-equation delta-v, drag, apo/peri, starter reaches orbit, underpowered fails, delta-v budget ≥ target.

- [ ] **Step 2: End-to-end browser flight**

Serve on a fresh port. Build the starter, tick Quick countdown, launch in Auto. Use warp to fast-forward the upper-stage burn. Confirm: gradual liftoff, max-Q heating (~hundreds of °C), staging, apoapsis climbing past 100 km, speed reaching ~7.8 km/s, and the ORBIT announcement. Confirm existing features still work: fairing jettison, satellite deploy from the nose, and first-stage booster-cam recovery.
Expected: a coherent real-physics ascent to orbit; no regressions; no console errors (favicon 404 excepted).

- [ ] **Step 3: Deploy**

```bash
./deploy.sh
```
Confirm the sync + CloudFront invalidation succeed and `https://skybound.bastionforge.com` serves the new build.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A && git commit -m "test: verify realistic ascent end-to-end"
git push origin master
```

---

## Notes for the implementer

- **The self-test is the contract.** Tasks 1–5 are TDD against `node js/sim.test.js`; if a change breaks an assertion, the numbers are wrong, not the test.
- **Numbers are knobs.** Every value in Task 5 (thrust, `ve`, tank fuel/mass, `CDA`, pitch schedule) is a calibration knob. Tune to green, then sanity-check the feel in the browser; do not treat the starting values as sacred.
- **Keep it deterministic.** `sim.js` must stay pure (no `Date.now`/`Math.random`); the loop substeps by `CONFIG.DT` so warp only changes how many substeps run per frame.
- **Do not build Phase 2/3 here.** No top-down view, no de-orbit UI. Reaching orbit keeps the current "coast + announce" placeholder in the side view.
