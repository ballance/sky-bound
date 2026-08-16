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
