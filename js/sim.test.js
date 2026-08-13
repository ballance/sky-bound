// Runnable self-check for the one non-trivial path: physics + orbit.
// No framework. Run: node js/sim.test.js
import assert from "node:assert";
import { CONFIG } from "./config.js";
import { simulate } from "./sim.js";

// A capable two-stage rocket + a sensible plan should reach orbit.
const goodRocket = {
  probeMass: 180,
  hasParachute: false,
  stages: [
    { thrust: 1_050_000, burn: 320, dryMass: 2_300, fuel: 9_000 }, // core
    { thrust: 380_000, burn: 95, dryMass: 1_500, fuel: 9_000 }, // upper
  ],
};
const goodPlan = [
  { trigger: { type: "T", s: 0 }, action: "fire" },
  { trigger: { type: "fuelEmpty" }, action: "dropStage" },
  { trigger: { type: "then" }, action: "fire" },
];
const orbitRun = simulate(goodRocket, goodPlan, CONFIG);
assert.equal(
  orbitRun.status,
  "orbit",
  `expected orbit, got ${orbitRun.status} (alt=${(orbitRun.maxAlt / 1000).toFixed(0)}km hSpeed=${orbitRun.maxHSpeed.toFixed(0)})`
);

// Too little fuel: cannot orbit.
const weakRocket = {
  probeMass: 180,
  hasParachute: false,
  stages: [{ thrust: 380_000, burn: 95, dryMass: 1_500, fuel: 1_200 }],
};
const weakRun = simulate(weakRocket, goodPlan, CONFIG);
assert.notEqual(weakRun.status, "orbit", "a starved rocket must not reach orbit");

console.log(
  `ok — orbit reached (maxAlt ${(orbitRun.maxAlt / 1000).toFixed(0)}km, ` +
    `hSpeed ${orbitRun.maxHSpeed.toFixed(0)} m/s); starved rocket ended '${weakRun.status}'`
);
