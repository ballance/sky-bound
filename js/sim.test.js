// Runnable self-check for the one non-trivial path: physics + orbit. Builds
// rockets from the real PARTS so it also guards the flight balance/tuning.
// No framework. Run: node js/sim.test.js
import assert from "node:assert";
import { CONFIG } from "./config.js";
import { PARTS } from "./parts.js";
import { initState, step, applyAction, triggerReady, simulate } from "./sim.js";

// mini version of main's normalizeRocket (core parts only — enough for tests)
function normalize(ids) {
  const stages = [];
  let probeMass = 0;
  let cur = null;
  for (const id of ids) {
    const p = PARTS[id];
    if (p.kind === "engine") { cur = { thrust: p.thrust, burn: p.burn, dryMass: p.mass, fuel: 0 }; stages.push(cur); }
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

const good = normalize(["bigEngine", "tank", "tank", "smallEngine", "tank", "probe"]);
const liftMass = good.probeMass + good.stages.reduce((n, st) => n + st.dryMass + st.fuel, 0);
const twr = good.stages[0].thrust / (liftMass * CONFIG.GRAVITY0);
const p = profile(good, goodPlan);

console.log(
  `liftoff TWR ${twr.toFixed(2)} · to 1km ${p.t1km == null ? "never" : p.t1km.toFixed(1) + "s"} · ` +
    `alt @3s ${(p.at[3] || 0).toFixed(0)}m @6s ${(p.at[6] || 0).toFixed(0)}m @10s ${(p.at[10] || 0).toFixed(0)}m`
);
console.log(
  `result ${p.final.orbited ? "orbit" : p.final.status} at T+${p.final.t.toFixed(0)}s (real ~${(p.final.t / CONFIG.TIME_SCALE).toFixed(0)}s) · ` +
    `maxAlt ${(p.final.maxAlt / 1000).toFixed(0)}km · hSpeed ${p.final.maxHSpeed.toFixed(0)}`
);

assert.ok(p.final.orbited, "expected the rocket to reach orbit");
assert(twr < 3.2, `liftoff TWR ${twr.toFixed(2)} too high — should lift off slowly like a real rocket`);
assert(p.t1km != null && p.t1km >= 4, `cleared 1km in ${p.t1km}s — still leaping off the pad`);

// no fuel: an engine with no tank can never thrust, so it can never orbit
const weak = normalize(["smallEngine", "probe"]);
assert.ok(!simulate(weak, goodPlan, CONFIG).orbited, "a rocket with no fuel must not reach orbit");

console.log("ok — orbit reached, liftoff is gradual, a fuel-less rocket falls short");
