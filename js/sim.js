// Pure physics + game state. No DOM, no canvas. Deterministic: step(state,dt).
// This is the swappable core a real engine could sit behind, and the tested part.
import { CONFIG } from "./config.js";

// gravity weakens with altitude (inverse-square, arcade-tuned constants)
export function gravity(alt, cfg = CONFIG) {
  const r = cfg.EARTH_RADIUS;
  return cfg.GRAVITY0 * (r / (r + Math.max(0, alt))) ** 2;
}

// Straight up, then tilt over to build sideways speed. Same in both modes.
export function pitch(alt, cfg = CONFIG) {
  const f = clamp((alt - cfg.PITCH_START_ALT) / (cfg.PITCH_END_ALT - cfg.PITCH_START_ALT), 0, 1);
  return f * cfg.PITCH_MAX; // radians from vertical
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// rocket = { stages:[{thrust,burn,dryMass,fuel}], probeMass, hasParachute }
// stages fire bottom (index 0) first.
export function initState(rocket) {
  return {
    t: 0,
    altitude: 0,
    vSpeed: 0,
    hSpeed: 0,
    stageIndex: 0,
    fuel: rocket.stages[0] ? rocket.stages[0].fuel : 0,
    engineOn: false,
    throttle: 0, // engines spool up from 0 → 1 so liftoff is gradual
    status: "ready", // ready | flying | orbit | landed | crashed
    deployed: false,
    fairingJettisoned: false,
    maxAlt: 0,
    maxHSpeed: 0,
  };
}

// remaining mass = probe + every stage not yet dropped (current burns its fuel)
function currentMass(state, rocket) {
  let m = rocket.probeMass;
  if (rocket.hasFairing && !state.fairingJettisoned) m += rocket.fairingMass || 0;
  for (let i = state.stageIndex; i < rocket.stages.length; i++) {
    m += rocket.stages[i].dryMass;
    m += i === state.stageIndex ? state.fuel : rocket.stages[i].fuel;
  }
  return m;
}

export function activeStage(state, rocket) {
  return rocket.stages[state.stageIndex] || null;
}

// One physics tick. Mutates and returns state.
export function step(state, dt, cfg = CONFIG, rocket) {
  if (state.status !== "flying") return state;

  const stage = activeStage(state, rocket);
  const thrusting = state.engineOn && stage && state.fuel > 0;
  // spool the throttle toward full while firing; thrust and fuel burn both
  // scale with it, so a real gradual liftoff costs no extra fuel.
  if (thrusting) state.throttle = Math.min(1, state.throttle + dt / cfg.THROTTLE_RAMP);
  const F = thrusting ? stage.thrust * state.throttle : 0;
  if (thrusting) state.fuel = Math.max(0, state.fuel - stage.burn * state.throttle * dt);

  const mass = currentMass(state, rocket);
  const p = pitch(state.altitude, cfg);
  const aUp = (F * Math.cos(p)) / mass - gravity(state.altitude, cfg);
  const aH = (F * Math.sin(p)) / mass;

  state.vSpeed += aUp * dt;
  state.hSpeed += aH * dt;
  state.altitude += state.vSpeed * dt;
  state.t += dt;

  state.maxAlt = Math.max(state.maxAlt, state.altitude);
  state.maxHSpeed = Math.max(state.maxHSpeed, state.hSpeed);

  // ground: the pad holds the rocket during spool-up (thrust < weight). Only a
  // return from actual flight (it climbed away) counts as a landing or crash.
  if (state.altitude <= 0) {
    state.altitude = 0;
    if (state.maxAlt > 20 && state.vSpeed < 0) {
      const soft = -state.vSpeed <= cfg.CRASH_SPEED || rocket.hasParachute;
      state.status = soft ? "landed" : "crashed";
    }
    if (state.vSpeed < 0) state.vSpeed = 0; // pad (or standing) holds it down at 0
    if (state.status !== "flying") return state;
  }

  // orbit
  if (state.altitude >= cfg.ORBIT_ALT && state.hSpeed >= cfg.ORBIT_SPEED) {
    state.status = "orbit";
  }
  return state;
}

// Player action or plan step. action: fire | cut | dropStage | deploy
export function applyAction(state, action, rocket) {
  if (action === "fire") state.engineOn = true;
  else if (action === "cut") state.engineOn = false;
  else if (action === "deploy") state.deployed = true;
  else if (action === "jettisonFairing") state.fairingJettisoned = true;
  else if (action === "dropStage") {
    if (state.stageIndex < rocket.stages.length - 1) {
      state.stageIndex += 1;
      state.fuel = rocket.stages[state.stageIndex].fuel;
      state.throttle = 0; // the next engine spools up from zero too
      // next stage auto-ignites if the engine was already running
    } else {
      state.stageIndex = rocket.stages.length; // nothing left to burn
      state.fuel = 0;
      state.engineOn = false;
    }
  }
  return state;
}

// trigger: {type:'T',s} | {type:'alt',m} | {type:'then'} | {type:'delay',s} | {type:'fuelEmpty'}
// Steps fire in order; a step is only eligible once the previous one has fired.
export function triggerReady(trigger, state, prevFireT) {
  switch (trigger.type) {
    case "T": return state.t >= trigger.s;
    case "alt": return state.altitude >= trigger.m;
    case "then": return true;
    case "delay": return state.t >= prevFireT + trigger.s;
    case "fuelEmpty": return state.fuel <= 0;
    default: return false;
  }
}

// Run a whole flight headlessly (used by the self-test and to preflight a plan).
export function simulate(rocket, plan, cfg = CONFIG, maxT = 1200) {
  const s = initState(rocket);
  s.status = "flying";
  let i = 0;
  let prevFireT = 0;
  let guard = 0;
  while (s.status === "flying" && s.t < maxT && guard++ < 1e6) {
    while (i < plan.length && triggerReady(plan[i].trigger, s, prevFireT)) {
      applyAction(s, plan[i].action, rocket);
      prevFireT = s.t;
      i++;
    }
    step(s, cfg.DT, cfg, rocket);
  }
  return s;
}
