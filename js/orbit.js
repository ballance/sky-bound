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
