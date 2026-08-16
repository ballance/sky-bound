import assert from "node:assert";
import { CONFIG } from "./config.js";
import { vCirc } from "./sim.js";
import { seedFromAscent, step, orbitElements2D, burn, deploy } from "./orbit.js";

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
  console.log(`orbit: burns raise/lower orbit; de-orbit in ${burns} burns; deploy independent`);
}
console.log("orbit: circular stays circular; seed lands on the insertion orbit");
