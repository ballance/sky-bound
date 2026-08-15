# Orbit View Implementation Plan (Phase 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the rocket reaches orbit, cut from the side view to a readable top-down two-body orbit view where the player watches their ship circle a real Earth, deploys a satellite that keeps orbiting, and fires a de-orbit burn — Auto flies it all, Manual gets burn buttons.

**Architecture:** A new pure `orbit.js` (Earth-centered `{x,y,vx,vy}` two-body sim, velocity-Verlet, seeded from the ascent's insertion state) and a new `orbitRender.js` (exaggerated-altitude top-down drawing). `main.js` gains a `view` state machine (`ascent → orbit → reentry`) that routes the flight loop, HUD, and controls to the active view. De-orbit hands back to the existing side-view re-entry placeholder (Phase 3 makes it fiery).

**Tech Stack:** Vanilla JS ES modules, no build step. Physics tested headlessly via `node js/orbit.test.js` (node:assert). UI verified in a browser via a no-store `python3 -m http.server`.

---

## File Structure

- `js/orbit.js` — new, pure. Two-body state, `seedFromAscent`, `step` (Verlet), `orbitElements2D`, `burn`, `deploy`. No DOM.
- `js/orbit.test.js` — new headless self-test.
- `js/orbitRender.js` — new. `drawOrbit(ctx, ship, sat, els, cfg, frame)` — exaggerated top-down draw. Imports `step` from `orbit.js` to trace paths.
- `js/config.js` — orbit constants (EARTH_PX, ALT_REF, ORBIT_GAP, BURN_DV, ORBIT_WARP_TIERS, ATM_ENTRY_ALT, ORBIT_DT).
- `js/main.js` — `view` state machine; ascent→orbit transition + seed; orbit loop branch; orbit HUD; Manual burn/deploy/de-orbit buttons; Auto sequence; de-orbit→re-entry handoff.
- `index.html` / `css/style.css` — orbit readout rows and buttons (reuse the launch HUD panel).

Build order: pure physics (Tasks 1–2, TDD) → rendering (3) → view switch + loop (4) → HUD/warp (5) → controls + Auto (6) → de-orbit handoff (7) → verify (8).

---

### Task 1: `orbit.js` core — state, seed, elements, Verlet step

**Files:**
- Modify: `js/config.js`
- Create: `js/orbit.js`
- Create: `js/orbit.test.js`

- [ ] **Step 1: Add config constants** in `js/config.js` inside `CONFIG` (near the other real-Earth constants):

```js
  // Orbit view (phase 2)
  ORBIT_DT: 2,               // velocity-Verlet sub-step (s) — period ~5300s
  BURN_DV: 100,              // m/s applied per prograde/retrograde burn
  ORBIT_WARP_TIERS: [1, 100, 1000],
  ATM_ENTRY_ALT: 120_000,    // altitude where re-entry takes over
  EARTH_PX: 90,              // Earth disc radius on the map (px)
  ALT_REF: 200_000,          // reference altitude for the exaggerated mapping
  ORBIT_GAP: 60,             // px added at ALT_REF altitude (readability)
```

- [ ] **Step 2: Write the failing test** — create `js/orbit.test.js`:

```js
import assert from "node:assert";
import { CONFIG } from "./config.js";
import { vCirc } from "./sim.js";
import { seedFromAscent, step, orbitElements2D } from "./orbit.js";

// a body at circular velocity stays circular (e ~ 0, r ~ constant) over an orbit
{
  const alt = 200_000, r = CONFIG.R_EARTH + alt;
  const s = { x: 0, y: -r, vx: vCirc(alt), vy: 0, fuel: 0, ve: 3000, dryMass: 1000, deployed: false, t: 0 };
  const r0 = Math.hypot(s.x, s.y);
  let rMin = r0, rMax = r0;
  for (let i = 0; i < 4000; i++) { step(s, CONFIG.ORBIT_DT, CONFIG); const rr = Math.hypot(s.x, s.y); rMin = Math.min(rMin, rr); rMax = Math.max(rMax, rr); }
  const el = orbitElements2D(s, CONFIG);
  assert.ok(el.e < 0.02, `circular orbit e ${el.e.toFixed(3)} should be ~0`);
  assert.ok((rMax - rMin) / r0 < 0.02, `radius should stay ~constant (spread ${((rMax - rMin) / r0 * 100).toFixed(1)}%)`);
}

// seedFromAscent places the ship on a near-circular orbit at the insertion altitude
{
  const ascent = { altitude: 186_000, hSpeed: vCirc(186_000), vSpeed: 0, stageIndex: 1, fuel: 500 };
  const rocket = { stages: [{ ve: 3000, dryMass: 3000, fuel: 0 }, { ve: 3600, dryMass: 900, fuel: 0 }], probeMass: 180 };
  const s = seedFromAscent(ascent, rocket, CONFIG);
  const el = orbitElements2D(s, CONFIG);
  assert.ok(Math.abs(el.apo - 186_000) < 8000 && Math.abs(el.peri - 186_000) < 8000,
    `seeded orbit apo/peri ~186km, got apo ${(el.apo/1000).toFixed(0)} peri ${(el.peri/1000).toFixed(0)}`);
  assert.ok(s.fuel === 500 && s.ve === 3600, "seed carries the upper stage fuel + ve");
}
console.log("orbit: circular stays circular; seed lands on the insertion orbit");
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node js/orbit.test.js`
Expected: FAIL — `./orbit.js` does not exist.

- [ ] **Step 4: Create `js/orbit.js`:**

```js
// Pure top-down two-body orbital mechanics. Earth's centre at the origin.
// State: { x, y, vx, vy, fuel, ve, dryMass, deployed, t }. Deterministic.
import { CONFIG } from "./config.js";

// Seed the orbit state from the ascent state at insertion: place the ship at the
// top of the circle moving prograde (counter-clockwise), carrying the upper
// stage's leftover propellant so orbital burns spend real delta-v.
export function seedFromAscent(ascent, rocket, cfg = CONFIG) {
  const r = cfg.R_EARTH + Math.max(0, ascent.altitude);
  const stage = rocket.stages[ascent.stageIndex] || rocket.stages[rocket.stages.length - 1];
  const dryMass = (stage ? stage.dryMass : 0) + (rocket.probeMass || 0);
  return {
    x: 0, y: -r,
    vx: ascent.hSpeed, vy: -ascent.vSpeed, // prograde (+x) at the top, radial-out = -y
    fuel: ascent.fuel, ve: stage ? stage.ve : 3000, dryMass,
    deployed: false, t: 0,
  };
}

// One velocity-Verlet step. Conserves energy across many orbits (a plain Euler
// integrator would spiral outward), so high time-warp stays stable.
export function step(state, dt, cfg = CONFIG) {
  const r0 = Math.hypot(state.x, state.y) || 1;
  const k0 = -cfg.GM / (r0 * r0 * r0);
  const ax0 = k0 * state.x, ay0 = k0 * state.y;
  const nx = state.x + state.vx * dt + 0.5 * ax0 * dt * dt;
  const ny = state.y + state.vy * dt + 0.5 * ay0 * dt * dt;
  const r1 = Math.hypot(nx, ny) || 1;
  const k1 = -cfg.GM / (r1 * r1 * r1);
  const ax1 = k1 * nx, ay1 = k1 * ny;
  state.vx += 0.5 * (ax0 + ax1) * dt;
  state.vy += 0.5 * (ay0 + ay1) * dt;
  state.x = nx; state.y = ny;
  state.t += dt;
  return state;
}

// Osculating orbital elements from the current state. apo/peri are ALTITUDES.
export function orbitElements2D(state, cfg = CONFIG) {
  const r = Math.hypot(state.x, state.y) || 1;
  const v2 = state.vx * state.vx + state.vy * state.vy;
  const eps = v2 / 2 - cfg.GM / r;
  const a = -cfg.GM / (2 * eps);
  const h = state.x * state.vy - state.y * state.vx; // specific angular momentum (z)
  const e = Math.sqrt(Math.max(0, 1 + (2 * eps * h * h) / (cfg.GM * cfg.GM)));
  const period = eps < 0 ? 2 * Math.PI * Math.sqrt((a * a * a) / cfg.GM) : Infinity;
  return { a, e, period, apo: a * (1 + e) - cfg.R_EARTH, peri: a * (1 - e) - cfg.R_EARTH, speed: Math.sqrt(v2), alt: r - cfg.R_EARTH };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node js/orbit.test.js`
Expected: PASS — both assertions hold (circular stays circular, seed lands on the insertion orbit).

- [ ] **Step 6: Commit**

```bash
git add js/config.js js/orbit.js js/orbit.test.js
git commit -m "feat: two-body orbit core (seed, verlet step, elements)"
```

---

### Task 2: `orbit.js` — burns and deploy

**Files:**
- Modify: `js/orbit.js`
- Modify: `js/orbit.test.js`

- [ ] **Step 1: Add the failing test** — append to `js/orbit.test.js` (before the final `console.log`):

```js
import { burn, deploy } from "./orbit.js";
// prograde raises the far side; retrograde lowers periapsis; both spend fuel; de-orbit terminates
{
  const alt = 200_000, r = CONFIG.R_EARTH + alt;
  const mk = () => ({ x: 0, y: -r, vx: vCirc(alt), vy: 0, fuel: 2000, ve: 3600, dryMass: 1000, deployed: false, t: 0 });
  const pro = mk(); const apo0 = orbitElements2D(pro, CONFIG).apo;
  burn(pro, +1, CONFIG.BURN_DV, CONFIG);
  assert.ok(orbitElements2D(pro, CONFIG).apo > apo0 + 1000, "prograde burn raises apoapsis");
  assert.ok(pro.fuel < 2000, "burn spends fuel");

  const retro = mk(); let burns = 0;
  while (orbitElements2D(retro, CONFIG).peri > CONFIG.ATM_ENTRY_ALT && burns < 500) { burn(retro, -1, CONFIG.BURN_DV, CONFIG); burns++; }
  assert.ok(orbitElements2D(retro, CONFIG).peri <= CONFIG.ATM_ENTRY_ALT, "retrograde burns drop periapsis into the atmosphere");
  assert.ok(burns > 0 && burns < 500, `de-orbit terminates in a finite number of burns (${burns})`);

  // no fuel -> burn is a no-op
  const dry = mk(); dry.fuel = 0; const v0 = Math.hypot(dry.vx, dry.vy);
  burn(dry, -1, CONFIG.BURN_DV, CONFIG);
  assert.ok(Math.abs(Math.hypot(dry.vx, dry.vy) - v0) < 1e-9, "no fuel, no burn");

  // deploy: the satellite is an independent copy that keeps orbiting
  const ship = mk(); const sat = deploy(ship);
  assert.ok(ship.deployed && sat.x === ship.x && sat.y === ship.y, "deploy returns a copy at the ship's position");
  for (let i = 0; i < 4000; i++) step(sat, CONFIG.ORBIT_DT, CONFIG);
  const rr = Math.hypot(sat.x, sat.y);
  assert.ok(rr > CONFIG.R_EARTH && rr < CONFIG.R_EARTH + 400_000, "the deployed satellite keeps orbiting");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node js/orbit.test.js`
Expected: FAIL — `burn`/`deploy` are not exported.

- [ ] **Step 3: Add `burn` and `deploy`** to `js/orbit.js`:

```js
// Apply a delta-v along the velocity vector (dir +1 prograde, -1 retrograde),
// spending propellant per the rocket equation. No fuel for the burn => no-op.
export function burn(state, dir, dv, cfg = CONFIG) {
  const v = Math.hypot(state.vx, state.vy);
  if (v < 1e-6 || dv <= 0) return state;
  const mass = state.dryMass + state.fuel;
  const used = mass * (1 - Math.exp(-dv / state.ve));
  if (state.fuel < used) return state; // not enough propellant to complete the burn
  state.fuel -= used;
  const ux = state.vx / v, uy = state.vy / v;
  state.vx += dir * dv * ux;
  state.vy += dir * dv * uy;
  return state;
}

// Release the payload: returns a satellite body (independent copy of the ship's
// position + velocity) that thereafter orbits on its own. Marks the ship deployed.
export function deploy(state) {
  state.deployed = true;
  return { x: state.x, y: state.y, vx: state.vx, vy: state.vy, t: 0 };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node js/orbit.test.js`
Expected: PASS — prograde raises apoapsis, retrograde de-orbits, no-fuel no-op, deploy independent.

- [ ] **Step 5: Commit**

```bash
git add js/orbit.js js/orbit.test.js
git commit -m "feat: orbital burns (prograde/retrograde) and satellite deploy"
```

---

### Task 3: `orbitRender.js` — exaggerated top-down drawing

**Files:**
- Create: `js/orbitRender.js`

- [ ] **Step 1: Create `js/orbitRender.js`:**

```js
// Top-down orbit view. Exaggerated altitude: the angle is real, the radius is
// stretched so the orbit reads clearly outside a modest Earth. Pure drawing.
import { CONFIG } from "./config.js";
import { step, orbitElements2D } from "./orbit.js";

const STARS = Array.from({ length: 90 }, (_, i) => {
  const a = i * 2.399963; // golden-angle scatter, deterministic
  return { x: (Math.cos(a) * 0.5 + 0.5), y: (Math.sin(a * 1.7) * 0.5 + 0.5), s: (i % 3) ? 1 : 1.6 };
});

// real radius (m) -> screen radius (px): surface at EARTH_PX, altitude stretched
function screenR(r, cfg) { return cfg.EARTH_PX + ((r - cfg.R_EARTH) / cfg.ALT_REF) * cfg.ORBIT_GAP; }

function tracePath(body, cfg) {
  const els = orbitElements2D(body, cfg);
  const period = isFinite(els.period) ? els.period : 6000;
  const pts = [];
  const c = { ...body };
  const n = 128, pdt = period / n;
  for (let i = 0; i <= n; i++) {
    const r = Math.hypot(c.x, c.y), R = screenR(r, cfg), th = Math.atan2(c.y, c.x);
    pts.push([Math.cos(th) * R, Math.sin(th) * R]);
    step(c, pdt, cfg);
  }
  return pts;
}

export function drawOrbit(ctx, ship, sat, cfg = CONFIG, frame = 0) {
  const w = ctx.canvas.width, h = ctx.canvas.height, cx = w / 2, cy = h / 2;
  ctx.fillStyle = "#04060f"; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#8a93b5";
  for (const s of STARS) { ctx.globalAlpha = 0.5 + 0.4 * Math.sin(frame * 0.02 + s.x * 30); ctx.fillRect(s.x * w, s.y * h, s.s, s.s); }
  ctx.globalAlpha = 1;

  // Earth
  const g = ctx.createRadialGradient(cx - cfg.EARTH_PX * 0.3, cy - cfg.EARTH_PX * 0.3, cfg.EARTH_PX * 0.2, cx, cy, cfg.EARTH_PX);
  g.addColorStop(0, "#6fb0e6"); g.addColorStop(0.7, "#1f4f8c"); g.addColorStop(1, "#0e2a52");
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, cfg.EARTH_PX, 0, Math.PI * 2); ctx.fill();

  ctx.save(); ctx.translate(cx, cy);

  // deployed satellite path (solid, dim) + dot
  if (sat) {
    const sp = tracePath(sat, cfg);
    ctx.strokeStyle = "rgba(120,200,255,0.35)"; ctx.lineWidth = 1;
    ctx.beginPath(); sp.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    const sr = screenR(Math.hypot(sat.x, sat.y), cfg), sth = Math.atan2(sat.y, sat.x);
    ctx.fillStyle = "#7fd0ff"; ctx.beginPath(); ctx.arc(Math.cos(sth) * sr, Math.sin(sth) * sr, 3, 0, Math.PI * 2); ctx.fill();
  }

  // ship orbit path (dashed) + apo/peri markers
  const pts = tracePath(ship, cfg);
  ctx.setLineDash([4, 5]); ctx.strokeStyle = "#5aa0e0"; ctx.lineWidth = 1.4;
  ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
  ctx.setLineDash([]);
  // apoapsis = farthest point, periapsis = nearest point on the traced path
  let apoI = 0, periI = 0, dMax = 0, dMin = Infinity;
  pts.forEach(([x, y], i) => { const d = Math.hypot(x, y); if (d > dMax) { dMax = d; apoI = i; } if (d < dMin) { dMin = d; periI = i; } });
  const el = orbitElements2D(ship, cfg);
  const mark = (i, color, label) => {
    const [x, y] = pts[i];
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    ctx.font = "10px system-ui, sans-serif"; ctx.textAlign = x < 0 ? "right" : "left";
    ctx.fillText(label, x + (x < 0 ? -6 : 6), y + 3);
  };
  mark(apoI, "#ffd24a", `Apo ${(el.apo / 1000).toFixed(0)} km`);
  mark(periI, "#7fe0ff", `Peri ${(el.peri / 1000).toFixed(0)} km`);

  // the ship: a small triangle pointing along its velocity, with a prograde arrow
  const R = screenR(Math.hypot(ship.x, ship.y), cfg), th = Math.atan2(ship.y, ship.x);
  const px = Math.cos(th) * R, py = Math.sin(th) * R;
  const va = Math.atan2(ship.vy, ship.vx);
  ctx.save(); ctx.translate(px, py); ctx.rotate(va);
  ctx.fillStyle = "#e9edf5"; ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -3.5); ctx.lineTo(-4, 3.5); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "#37d67a"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(16, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(12, -3); ctx.lineTo(12, 3); ctx.closePath(); ctx.fillStyle = "#37d67a"; ctx.fill();
  ctx.restore();

  ctx.restore();
}
```

- [ ] **Step 2: Syntax check**

Run: `node --check js/orbitRender.js`
Expected: no output (valid module). `node js/orbit.test.js` still passes (unchanged).

- [ ] **Step 3: Commit**

```bash
git add js/orbitRender.js
git commit -m "feat: exaggerated top-down orbit renderer"
```

---

### Task 4: View state machine + ascent→orbit transition

**Files:**
- Modify: `js/main.js`

- [ ] **Step 1: Imports + module state** — in `js/main.js`, add to the imports and near `let rocketNow = null;`:

```js
import * as orbit from "./orbit.js";
import { drawOrbit } from "./orbitRender.js";
```
```js
let view = "ascent";      // "ascent" | "orbit" | "reentry"
let orbitState = null;    // the ship's two-body state in orbit view
let satState = null;      // deployed satellite (independent body) or null
let orbitPhase = "coast"; // Auto sequence: "coast" | "deploy" | "deorbit" | "done"
let orbitLap = 0;         // sim-seconds coasted, for the Auto coast-a-lap
```

- [ ] **Step 2: Reset view state in `beginFlight`** — add near the other resets (by `warp = 1;` at line ~480):

```js
  view = "ascent"; orbitState = null; satState = null; orbitPhase = "coast"; orbitLap = 0;
```

- [ ] **Step 3: Branch the loop to the orbit view** — in the `loop` function, immediately after `last = ts;` (line ~507, before computing `simDt`), add:

```js
    if (view === "orbit") { orbitFrame(realDt); return; }
```

- [ ] **Step 4: Trigger the transition on orbit** — replace the existing post-orbit placeholder. Find this block (lines ~547–559):

```js
    if (sim.orbited && !orbitAwarded) {
      orbitAwarded = true;
      sfx.orbit();
      awardResults(sim);
      $("launchBtn").disabled = false; // free to fly again while it orbits
      const c = $("callout"); c.textContent = ""; c.className = "callout";
    }
    // a parachute-equipped stage de-orbits after a short coast and re-enters
    if (sim.orbited && rocketNow.hasParachute && !sim.reentering) {
      reentryTimer += 1;
      const deployDone = !$("deployToggle").checked || sim.deployed;
      if (reentryTimer > 200 && deployDone) applyAction(sim, "reenter", rocketNow);
    }
```
Replace it with (award once, then hand off to the orbit view; the old side-view coast/re-entry placeholder is removed — the orbit view owns the post-orbit flow now):

```js
    if (sim.orbited && !orbitAwarded) {
      orbitAwarded = true;
      sfx.orbit();
      awardResults(sim);
      enterOrbitView();
    }
```

- [ ] **Step 5: Add `enterOrbitView` and `orbitFrame`** — add these functions in `js/main.js` (near `beginFlight`):

```js
function enterOrbitView() {
  view = "orbit";
  orbitState = orbit.seedFromAscent(sim, rocketNow, CONFIG);
  satState = null; orbitPhase = "coast"; orbitLap = 0;
  warp = 1;
  setOrbitWarpButtons();
  setHardEnabled(mode === "manual");
  const c = $("callout"); c.textContent = "🛰️ You're in orbit!"; c.className = "callout";
}

function orbitFrame(realDt) {
  let simDt = realDt * warp; // orbit warp tiers are the multiplier directly
  while (simDt > 0) {
    const dt = Math.min(CONFIG.ORBIT_DT, simDt);
    orbit.step(orbitState, dt, CONFIG);
    if (satState) orbit.step(satState, dt, CONFIG);
    orbitLap += dt;
    autoOrbitSequence(dt); // no-op in Manual (Task 6)
    simDt -= dt;
  }
  handleDeorbitHandoff(); // Task 7 (define as a no-op stub for now)
  // the handoff (Task 7) sets view="reentry" and nulls orbitState — don't draw the
  // orbit map afterward; let the next frame fall through to the side-view body.
  if (view !== "orbit") { anim = requestAnimationFrame(loopFn); return; }
  frame++;
  drawOrbit(ctx, orbitState, satState, CONFIG, frame);
  updateOrbitHUD();
  anim = requestAnimationFrame(loopFn);
}
```

- [ ] **Step 6: Temporary stubs** so the tree runs before Tasks 5–7 land. Add near `orbitFrame`:

```js
function setOrbitWarpButtons() {} // real version in Task 5
function updateOrbitHUD() {}      // real version in Task 5
function autoOrbitSequence() {}   // real version in Task 6
function handleDeorbitHandoff() {} // real version in Task 7
```

- [ ] **Step 7: Verify in a browser**

Run: `node --check js/main.js` (parse), then serve (`python3 -m http.server 8094`) and open it. Build the starter, tick Quick countdown, launch in Auto, warp up. When it reaches orbit the canvas should switch to the top-down map: Earth centered, a dashed orbit ellipse with Apo/Peri markers, and the ship dot tracking the orbit. It won't deploy or de-orbit yet (stubs).
Expected: the view switches cleanly to a live orbit map; the ship moves around Earth; no console errors (favicon 404 excepted).

- [ ] **Step 8: Commit**

```bash
git add js/main.js
git commit -m "feat: view state machine; switch to the orbit map on insertion"
```

---

### Task 5: Orbit HUD readouts and warp tiers

**Files:**
- Modify: `js/main.js` (`updateOrbitHUD`, `setOrbitWarpButtons`)
- Modify: `index.html` (orbit readout rows)
- Modify: `css/style.css` (if needed)

- [ ] **Step 1: Add orbit readout rows** in `index.html` — inside the `.hud` panel, after the existing telemetry block, add a hidden orbit block:

```html
          <div id="orbitHud" class="telemetry" hidden>
            <div><span>Speed</span><b id="oSpd">0.00 km/s</b></div>
            <div><span>Apoapsis</span><b id="oApo">—</b></div>
            <div><span>Periapsis</span><b id="oPeri">—</b></div>
            <div><span>Eccentricity</span><b id="oEcc">0.00</b></div>
            <div><span>Δv left</span><b id="oDv">0.0 km/s</b></div>
          </div>
```

- [ ] **Step 2: Real `setOrbitWarpButtons`** — replace the stub in `js/main.js`:

```js
function setOrbitWarpButtons() {
  const box = $("warp");
  box.querySelectorAll("button").forEach((b) => b.remove());
  CONFIG.ORBIT_WARP_TIERS.forEach((t, i) => {
    const b = document.createElement("button");
    b.dataset.warp = String(t); b.textContent = `${t}×`;
    if (i === 0) b.classList.add("active");
    box.appendChild(b);
  });
}
```
(The existing `#warp` click handler reads `data-warp` and sets `warp`, so the new buttons work with no extra wiring. On `beginFlight`, the ascent warp tiers are already rebuilt from the static `index.html` — but since we now mutate them, Step 5 restores them on reset.)

- [ ] **Step 3: Real `updateOrbitHUD`** — replace the stub. Show the orbit block, hide the ascent telemetry:

```js
function updateOrbitHUD() {
  $("orbitHud").hidden = false;
  const el = orbit.orbitElements2D(orbitState, CONFIG);
  const km = (m) => (isFinite(m) ? `${(m / 1000).toFixed(0)} km` : "escape");
  $("oSpd").textContent = `${(el.speed / 1000).toFixed(2)} km/s`;
  $("oApo").textContent = km(el.apo);
  $("oPeri").textContent = km(el.peri);
  $("oEcc").textContent = el.e.toFixed(2);
  const dvLeft = orbitState.ve * Math.log((orbitState.dryMass + orbitState.fuel) / orbitState.dryMass);
  $("oDv").textContent = `${(dvLeft / 1000).toFixed(1)} km/s`;
  const clock = Math.floor(orbitState.t);
  $("clock").textContent = `ORBIT ${String(Math.floor(clock / 60)).padStart(2, "0")}:${String(clock % 60).padStart(2, "0")}`;
}
```

- [ ] **Step 4: Hide the ascent telemetry in orbit** — in `enterOrbitView` (Task 4), add after setting the view:

```js
  document.querySelector(".hud .telemetry:not(#orbitHud)").hidden = true;
```

- [ ] **Step 5: Restore ascent HUD + warp on reset** — in `beginFlight`, near the resets, add:

```js
  $("orbitHud").hidden = true;
  document.querySelector(".hud .telemetry:not(#orbitHud)").hidden = false;
  rebuildAscentWarpButtons();
```
and add the helper near `setOrbitWarpButtons`:
```js
function rebuildAscentWarpButtons() {
  const box = $("warp");
  box.querySelectorAll("button").forEach((b) => b.remove());
  CONFIG.WARP_TIERS.forEach((t, i) => {
    const b = document.createElement("button");
    b.dataset.warp = String(t); b.textContent = `${t}×`;
    if (i === 0) b.classList.add("active");
    box.appendChild(b);
  });
}
```
(`CONFIG.WARP_TIERS` is the ascent set `[1,2,5,10,25]`. This makes the warp row data-driven for both views.)

- [ ] **Step 6: Verify in a browser**

Serve and fly to orbit. Confirm the orbit readouts show sensible values (Speed ~7.8 km/s, Apoapsis/Periapsis ~190 km, Eccentricity ~0.0, Δv left > 0) and the warp row switches to 1× / 100× / 1000× — clicking 1000× visibly speeds up the orbit. Reset and confirm the ascent HUD + 1×–25× warp return.
Expected: correct orbit readouts; warp tiers swap per view; reset restores ascent. No console errors.

- [ ] **Step 7: Commit**

```bash
git add index.html js/main.js css/style.css
git commit -m "feat: orbit HUD readouts and orbital time-warp tiers"
```

---

### Task 6: Manual burn/deploy/de-orbit buttons + Auto sequence

**Files:**
- Modify: `index.html` (orbit control buttons)
- Modify: `js/main.js` (`autoOrbitSequence`, orbit button wiring)

- [ ] **Step 1: Add orbit control buttons** in `index.html` — a hidden row in the `.hud`, near `#hardControls`:

```html
          <div id="orbitControls" class="hard-controls" hidden>
            <button data-orbit="prograde">🔥 Prograde</button>
            <button data-orbit="retro">🔥 Retrograde</button>
            <button data-orbit="deploy">🛰️ Deploy</button>
            <button data-orbit="deorbit">🔥 De-orbit</button>
          </div>
```

- [ ] **Step 2: Wire the buttons** — in `js/main.js` events section (near the `#hardControls` handler):

```js
$("orbitControls").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-orbit]"); if (!b || view !== "orbit") return;
  const act = b.dataset.orbit;
  if (act === "prograde") orbit.burn(orbitState, +1, CONFIG.BURN_DV, CONFIG);
  else if (act === "retro" || act === "deorbit") orbit.burn(orbitState, -1, CONFIG.BURN_DV, CONFIG);
  else if (act === "deploy" && !orbitState.deployed) { satState = orbit.deploy(orbitState); sfx.deploy(); }
});
```

- [ ] **Step 3: Show orbit controls in Manual** — in `enterOrbitView`, replace `setHardEnabled(mode === "manual");` with:

```js
  $("hardControls").hidden = true;
  $("orbitControls").hidden = mode !== "manual";
```
And in `beginFlight` resets add `$("orbitControls").hidden = true;`.

- [ ] **Step 4: Real `autoOrbitSequence`** — replace the stub. Auto coasts a lap, deploys if the toggle is set, then de-orbits:

```js
function autoOrbitSequence(dt) {
  if (mode !== "auto") return;
  if (orbitPhase === "coast") {
    if (orbitLap > 90) { // ~90 sim-seconds of coasting for the "wonder" beat
      orbitPhase = $("deployToggle").checked ? "deploy" : "deorbit";
    }
  } else if (orbitPhase === "deploy") {
    if (!orbitState.deployed) { satState = orbit.deploy(orbitState); sfx.deploy();
      const c = $("callout"); c.textContent = "🛰️ Satellite deployed"; c.className = "callout"; }
    orbitPhase = "deorbit";
  } else if (orbitPhase === "deorbit") {
    const peri = orbit.orbitElements2D(orbitState, CONFIG).peri;
    if (peri > CONFIG.ATM_ENTRY_ALT) orbit.burn(orbitState, -1, CONFIG.BURN_DV, CONFIG);
    else { orbitPhase = "done"; const c = $("callout"); c.textContent = "🔥 De-orbit burn complete"; c.className = "callout"; }
  }
}
```

- [ ] **Step 5: Verify in a browser**

Auto: fly to orbit, confirm it coasts briefly, deploys a satellite (a second dot with its own solid path that keeps orbiting), then de-orbits (periapsis drops toward 120 km). Manual: switch to Manual, fly to orbit, and confirm 🔥 Prograde raises apoapsis live, 🔥 Retrograde lowers periapsis, 🛰️ Deploy leaves a satellite behind, 🔥 De-orbit lowers periapsis.
Expected: Auto runs the whole sequence; Manual burns reshape the orbit live; the deployed satellite persists on its own orbit. No console errors.

- [ ] **Step 6: Commit**

```bash
git add index.html js/main.js
git commit -m "feat: orbit controls (burns/deploy/de-orbit) and Auto sequence"
```

---

### Task 7: De-orbit → side-view re-entry handoff

**Files:**
- Modify: `js/main.js` (`handleDeorbitHandoff`)

- [ ] **Step 1: Real `handleDeorbitHandoff`** — replace the stub. Once periapsis is in the atmosphere and the ship is descending through `ATM_ENTRY_ALT`, cut back to the side view and trigger the existing re-entry path:

```js
function handleDeorbitHandoff() {
  const el = orbit.orbitElements2D(orbitState, CONFIG);
  const descending = (orbitState.x * orbitState.vx + orbitState.y * orbitState.vy) < 0; // r·v < 0
  if (el.peri <= CONFIG.ATM_ENTRY_ALT && el.alt <= CONFIG.ATM_ENTRY_ALT && descending) {
    view = "reentry";
    // seed the side-view re-entry with the real orbital state (Phase 3 makes it fiery)
    sim.altitude = el.alt;
    sim.hSpeed = Math.hypot(orbitState.vx, orbitState.vy);
    sim.vSpeed = -Math.abs(orbitState.x * orbitState.vx + orbitState.y * orbitState.vy) / (Math.hypot(orbitState.x, orbitState.y) || 1);
    sim.orbited = false;      // leaving orbit
    sim.reentering = true;    // existing side-view re-entry drag + parachute
    orbitState = null; satState = null;
    $("orbitControls").hidden = true; $("orbitHud").hidden = true;
    document.querySelector(".hud .telemetry:not(#orbitHud)").hidden = false;
    rebuildAscentWarpButtons(); warp = 1;
    const c = $("callout"); c.textContent = "🔥 Re-entry"; c.className = "callout";
  }
}
```

- [ ] **Step 2: Resume the side-view loop after handoff** — the main `loop` branches to `orbitFrame` only when `view === "orbit"`. After `handleDeorbitHandoff` sets `view = "reentry"`, the next frame falls through to the normal side-view body, which already renders re-entry (drag, heat, parachute) via `drawScene` and lands. No extra change needed, but confirm the loop's `while (simDt > 0 && sim.status === "flying")` runs — set `sim.status = "flying"` in the handoff if it isn't already:

Add to `handleDeorbitHandoff`, before the callout line:
```js
    sim.status = "flying";
```

- [ ] **Step 3: Verify in a browser**

Fly to orbit in Auto and let it de-orbit. When periapsis drops into the atmosphere and the ship is falling, the view should cut back to the side view showing the capsule re-entering (drag slows it, the existing parachute deploys low), then a landing. The ascent HUD + 1×–25× warp return.
Expected: a clean cut from map to side-view re-entry; the stage descends, chute opens, it lands; no console errors. (The fiery heating/plasma is Phase 3 — for now the existing re-entry visuals are fine.)

- [ ] **Step 4: Commit**

```bash
git add js/main.js
git commit -m "feat: de-orbit hands off to the side-view re-entry"
```

---

### Task 8: Full verification and deploy

**Files:** None (verification), or small fixes surfaced by end-to-end testing.

- [ ] **Step 1: Headless tests green**

Run: `node js/orbit.test.js` and `node js/sim.test.js`
Expected: both pass — orbit core (circular/seed/burns/deploy/de-orbit) and the ascent self-test (unchanged).

- [ ] **Step 2: End-to-end browser flight (Auto)**

Serve on a fresh port. Build the starter, tick Quick countdown + Deploy toggle, launch in Auto, warp through the ascent. Confirm: reach orbit → cut to the top-down map (Earth, dashed ellipse, Apo/Peri, ship) → coast → satellite deploys and keeps orbiting on its own path → de-orbit burn drops periapsis → cut back to the side view → re-entry + parachute + landing. Real units sane throughout.
Expected: the whole ascent→orbit→deploy→de-orbit→re-entry→landing flow works; no console errors (favicon 404 excepted).

- [ ] **Step 3: End-to-end browser flight (Manual)**

Reset, switch to Manual, fly to orbit, and confirm the orbit buttons work: prograde raises apoapsis, retrograde lowers periapsis, deploy leaves a satellite, de-orbit brings it home to a side-view landing.
Expected: Manual orbital piloting reshapes the orbit live and can de-orbit to a landing.

- [ ] **Step 4: Deploy**

```bash
./deploy.sh
```
Confirm the sync (now includes `js/orbit.js`, `js/orbitRender.js`) + CloudFront invalidation succeed and `https://skybound.bastionforge.com` serves the new build.

- [ ] **Step 5: Commit any fixes and push**

```bash
git add -A && git commit -m "test: verify the orbit view end-to-end"
git push origin master
```

---

## Notes for the implementer

- **Pure core, tested headlessly.** `orbit.js` stays pure (no DOM/Date/Math.random); Tasks 1–2 are the contract. Tasks 3–8 are integration/UI, verified in a browser.
- **Numbers are knobs.** `ORBIT_DT`, `BURN_DV`, `ORBIT_WARP_TIERS`, `EARTH_PX`/`ALT_REF`/`ORBIT_GAP`, the Auto coast duration (~90 s), and `ATM_ENTRY_ALT` are calibration knobs — tune to green then sanity-check the feel in the browser.
- **Don't build Phase 3 here.** De-orbit hands to the *existing* side-view re-entry. The fiery orbital-velocity heating, plasma, and landing rework are Phase 3's spec.
- **The warp row is now data-driven** (`rebuildAscentWarpButtons` / `setOrbitWarpButtons`) — keep both views in sync through those helpers, not hard-coded HTML.
