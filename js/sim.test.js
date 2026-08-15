// Runnable self-check for the one non-trivial path: physics + orbit. Builds
// rockets from the real PARTS so it also guards the flight balance/tuning.
// No framework. Run: node js/sim.test.js
import assert from "node:assert";
import { CONFIG } from "./config.js";
import { PARTS, STARTER_ROCKET } from "./parts.js";
import { initState, step, applyAction, triggerReady, simulate, gravity, vCirc, orbitElements } from "./sim.js";

// mini version of main's normalizeRocket (core parts only — enough for tests)
function normalize(ids) {
  const stages = [];
  let probeMass = 0;
  let cur = null;
  for (const id of ids) {
    const p = PARTS[id];
    if (p.kind === "engine") { cur = { thrust: p.thrust, ve: p.ve, dryMass: p.mass, fuel: 0 }; stages.push(cur); }
    else if (p.kind === "tank") { cur.fuel += p.fuel; cur.dryMass += p.mass; }
    else if (p.kind === "probe") probeMass += p.mass;
  }
  return { stages, probeMass, hasParachute: false };
}

const goodPlan = [
  { trigger: { type: "T", s: 0 }, action: "fire" },
  { trigger: { type: "fuelEmpty" }, action: "dropStage" },
  { trigger: { type: "then" }, action: "fire" },
];

// instrumented run: capture time-to-1km and altitude at a few marks
function profile(rocket, plan) {
  const s = initState(rocket);
  s.status = "flying";
  let i = 0;
  let prevFireT = 0;
  let t1km = null;
  const at = {};
  while (s.status === "flying" && !s.orbited && s.t < 3000) {
    while (i < plan.length && triggerReady(plan[i].trigger, s, prevFireT)) {
      applyAction(s, plan[i].action, rocket);
      prevFireT = s.t;
      i++;
    }
    step(s, CONFIG.DT, CONFIG, rocket);
    if (t1km == null && s.altitude >= 1000) t1km = s.t;
    for (const m of [3, 6, 10]) if (at[m] == null && s.t >= m) at[m] = s.altitude;
  }
  return { final: s, t1km, at };
}

// standalone delta-v budget (same per-stage field names normalize() produces)
function dvBudget(r) {
  const pay = r.probeMass + (r.fairingMass || 0);
  const above = (i) => r.stages.slice(i).reduce((m, s) => m + s.dryMass + s.fuel, 0) + pay;
  let d = 0;
  for (let i = 0; i < r.stages.length; i++) {
    const s = r.stages[i];
    const m0 = above(i);
    d += s.ve * Math.log(m0 / (m0 - s.fuel));
  }
  return d;
}

const good = normalize(STARTER_ROCKET);
const liftMass = good.probeMass + good.stages.reduce((n, st) => n + st.dryMass + st.fuel, 0);
const twr = good.stages[0].thrust / (liftMass * CONFIG.GRAVITY0);
const p = profile(good, goodPlan);

console.log(
  `liftoff TWR ${twr.toFixed(2)} · to 1km ${p.t1km == null ? "never" : p.t1km.toFixed(1) + "s"} · ` +
    `alt @3s ${(p.at[3] || 0).toFixed(0)}m @6s ${(p.at[6] || 0).toFixed(0)}m @10s ${(p.at[10] || 0).toFixed(0)}m`
);
console.log(
  `starter: reaches orbit=${p.final.orbited} · maxAlt ${(p.final.maxAlt / 1000).toFixed(0)}km · ` +
    `hSpeed ${p.final.maxHSpeed.toFixed(0)} · dv ${dvBudget(good).toFixed(0)} · at T+${p.final.t.toFixed(0)}s (real ~${(p.final.t / CONFIG.TIME_SCALE).toFixed(0)}s)`
);

// the starter rocket must reach a real circular orbit above the atmosphere
assert.ok(p.final.orbited, "the starter rocket must reach orbit (hSpeed >= vCirc above the atmosphere)");
const els = orbitElements(p.final, CONFIG);
assert.ok(els.peri > 100000, `periapsis ${els.peri.toFixed(0)} must clear the atmosphere`);
assert.ok(dvBudget(good) >= CONFIG.DV_TO_ORBIT, `starter delta-v ${dvBudget(good).toFixed(0)} must exceed ${CONFIG.DV_TO_ORBIT}`);

// liftoff stays gradual, like a real rocket — not a leap off the pad
assert(twr < 3.2, `liftoff TWR ${twr.toFixed(2)} too high — should lift off slowly like a real rocket`);
assert(p.t1km != null && p.t1km >= 4, `cleared 1km in ${p.t1km}s — still leaping off the pad`);

// Max-Q under real flight: Auto is safe and orbits; full throttle is fatal; easing off survives.
{
  const sr = normalize(STARTER_ROCKET); // read-only in step(); safe to share across runs
  const autoRun = simulate(normalize(STARTER_ROCKET), goodPlan, CONFIG);
  assert.ok(autoRun.orbited, "Auto (governed) starter still reaches orbit");
  // Auto never exceeds the structural limit (track peak stress over a governed flight)
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

// underpowered: one small engine + one tank cannot make orbit
assert.ok(!simulate(normalize(["smallEngine", "tank", "probe"]), goodPlan, CONFIG).orbited, "underpowered rocket must not orbit");
// no fuel: an engine with no tank can never thrust, so it can never orbit
assert.ok(!simulate(normalize(["smallEngine", "probe"]), goodPlan, CONFIG).orbited, "a rocket with no fuel must not reach orbit");

// Real gravity + circular velocity
assert.ok(Math.abs(gravity(0) - 9.81) < 0.05, `surface gravity ${gravity(0).toFixed(3)} should be ~9.81`);
assert.ok(Math.abs(vCirc(200_000) - 7789) < 20, `v_circ@200km ${vCirc(200_000).toFixed(0)} should be ~7789 m/s`);

// rocket equation: a single stage delivers ve * ln(m0/mf), integrated by step()
import { initState as _initState, step as _step } from "./sim.js";
{
  const r = { probeMass: 0, hasParachute: false, stages: [{ thrust: 1e6, ve: 3000, dryMass: 1000, fuel: 9000 }] };
  const s = _initState(r); s.status = "flying"; s.engineOn = true; s.throttle = 1; // full throttle, no ramp
  const cfg = { ...CONFIG, GM: 0, RHO0: 0, PITCH_MAX: 0 }; // straight up: isolate the rocket equation
  for (let i = 0; i < 100000 && s.fuel > 0; i++) { _step(s, 0.01, cfg, r); }
  const expected = 3000 * Math.log(10000 / 1000); // ~6908 m/s
  const got = Math.hypot(s.vSpeed, s.hSpeed);
  assert.ok(Math.abs(got - expected) < 60, `stage dv ${got.toFixed(0)} should be ~${expected.toFixed(0)}`);
}

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

// Max-Q: dynamic pressure peaks in the lower atmosphere, not on the pad or in space
{
  const good2 = normalize(STARTER_ROCKET);
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

// Manual throttle actions set the throttle target
{
  const r = { probeMass: 0, hasParachute: false, stages: [{ thrust: 1e6, ve: 3000, dryMass: 1000, fuel: 9000 }] };
  const s = _initState(r);
  applyAction(s, "throttleDown", r);
  assert.ok(Math.abs(s.throttleTarget - CONFIG.BUCKET_THROTTLE) < 1e-9, "throttleDown sets bucket throttle");
  applyAction(s, "throttleUp", r);
  assert.ok(Math.abs(s.throttleTarget - 1) < 1e-9, "throttleUp restores full throttle");
}

console.log("ok — starter reaches real circular orbit, liftoff is gradual, underpowered rockets fall short");
