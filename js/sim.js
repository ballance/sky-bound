// Pure physics + game state. No DOM, no canvas. Deterministic: step(state,dt).
// This is the swappable core a real engine could sit behind, and the tested part.
import { CONFIG } from "./config.js";

// gravity from real GM, weakening with altitude (inverse-square)
export function gravity(alt, cfg = CONFIG) {
  const r = cfg.R_EARTH + Math.max(0, alt);
  return cfg.GM / (r * r);
}

// circular orbital velocity at this altitude
export function vCirc(alt, cfg = CONFIG) {
  return Math.sqrt(cfg.GM / (cfg.R_EARTH + Math.max(0, alt)));
}

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

// Straight up, then tilt over to build sideways speed. Same in both modes.
export function pitch(alt, cfg = CONFIG) {
  const f = clamp((alt - cfg.PITCH_START_ALT) / (cfg.PITCH_END_ALT - cfg.PITCH_START_ALT), 0, 1);
  return f * cfg.PITCH_MAX; // radians from vertical
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// rocket = { stages:[{thrust,ve,dryMass,fuel}], probeMass, hasParachute }
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
    orbited: false,
    boosterRecovered: false,
    reentering: false,
    chuteOpen: false,
    chuteRipped: false, // a parachute deployed too fast is torn away
    noseTemp: 15, // °C, aerodynamic heating of the nose cone
    crashReason: null, // set to "maxq" when a Max-Q overstress RUD ends the flight
    maxAlt: 0,
    maxHSpeed: 0,
    xDist: 0, // horizontal distance travelled, for star parallax
    aeroStress: 0, // dynamic pressure / Q_MAX (1 = structural limit)
    maxQ: 0, // peak dynamic pressure seen (Pa)
    maxQAlt: 0, // altitude of peak dynamic pressure (m)
    overStressT: 0, // seconds spent over the Max-Q limit
    autoThrottle: true, // Auto flies the throttle bucket; Manual pilots it
    throttleTarget: 1, // throttle the engine ramps toward (Manual sets this)
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
  if (thrusting) {
    // Auto flies the Max-Q bucket automatically; Manual uses the player's target.
    const target = state.autoThrottle
      ? (state.aeroStress > cfg.BUCKET_STRESS ? cfg.BUCKET_THROTTLE : 1)
      : state.throttleTarget;
    const rate = dt / cfg.THROTTLE_RAMP;
    state.throttle = clamp(state.throttle + clamp(target - state.throttle, -rate, rate), 0, 1);
  }
  const F = thrusting ? stage.thrust * state.throttle : 0;
  if (thrusting) {
    const mdot = stage.thrust / stage.ve; // rocket equation mass flow
    state.fuel = Math.max(0, state.fuel - mdot * state.throttle * dt);
  }

  const mass = currentMass(state, rocket);
  const p = pitch(state.altitude, cfg);
  // in a stable orbit the rocket coasts (no gravity loss); on re-entry gravity
  // returns and pulls it back down.
  const g = state.orbited && !state.reentering ? 0 : gravity(state.altitude, cfg);
  const aUp = (F * Math.cos(p)) / mass - g;
  const aH = (F * Math.sin(p)) / mass;

  state.vSpeed += aUp * dt;
  state.hSpeed += aH * dt;

  // atmospheric drag: F = 0.5 * rho * v^2 * CdA, opposing the velocity vector.
  // On re-entry the capsule flies blunt (heat shield forward) — far higher drag
  // than the streamlined ascent — so it slows to subsonic before the chute opens.
  const rho = cfg.RHO0 * Math.exp(-Math.max(0, state.altitude) / cfg.H_ATM);
  const spd = Math.hypot(state.vSpeed, state.hSpeed);
  if (spd > 0.01) {
    const cda = cfg.CDA * (state.reentering && !state.chuteOpen ? cfg.REENTRY_DRAG_MULT : 1);
    const dragAcc = (0.5 * rho * spd * spd * cda) / mass;
    const k = Math.min(1, (dragAcc / spd) * dt); // fractional velocity removed this step
    state.vSpeed -= state.vSpeed * k;
    state.hSpeed -= state.hSpeed * k;
  }

  // re-entry: the parachute adds heavy extra drag for a gentle splashdown. It
  // auto-opens once the capsule has slowed into the safe window (Auto + a passive
  // pilot); deploying early via applyAction rips it (chuteRipped).
  if (state.reentering) {
    if (rocket.hasParachute && !state.chuteOpen && !state.chuteRipped &&
        state.altitude < cfg.CHUTE_ALT && state.vSpeed < 0 &&
        Math.hypot(state.vSpeed, state.hSpeed) <= cfg.CHUTE_SAFE_SPEED) {
      state.chuteOpen = true;
    }
    if (state.chuteOpen) {
      const k = Math.min(1, cfg.CHUTE_DRAG * dt);
      state.hSpeed -= state.hSpeed * k;
      if (state.vSpeed < 0) state.vSpeed -= state.vSpeed * k;
    }
  }

  state.altitude += state.vSpeed * dt;
  state.xDist += state.hSpeed * dt;
  state.t += dt;

  // nose-cone temperature: heating from speed through the air, with thermal lag
  const speed = Math.hypot(state.vSpeed, state.hSpeed);
  const dense = Math.exp(-Math.max(0, state.altitude) / cfg.H_ATM); // real air-density ratio
  // dynamic pressure q = 1/2 rho v^2 (rho = dense * RHO0); stress vs the structural limit
  const q = 0.5 * dense * cfg.RHO0 * speed * speed;
  state.aeroStress = q / cfg.Q_MAX;
  if (q > state.maxQ) { state.maxQ = q; state.maxQAlt = state.altitude; }
  // convective aeroheating ~ sqrt(rho) * v^3 (rho = real air density) peaks high up
  // as the rocket goes hypersonic (not at max-Q), plus a spike when over the
  // structural stress limit. Using real rho means no air (RHO0=0) => no heating.
  const heatTarget = 15 + Math.sqrt(cfg.RHO0 * dense) * speed * speed * speed * cfg.NOSE_HEAT_K + Math.max(0, state.aeroStress - 1) * cfg.OVERSTRESS_HEAT;
  state.noseTemp += (heatTarget - state.noseTemp) * Math.min(1, 0.6 * dt);
  // time spent over the Max-Q limit; ease off in time (it cools) or the airframe fails
  if (state.aeroStress > 1) state.overStressT += dt;
  else state.overStressT = Math.max(0, state.overStressT - dt * 2); // recovers at 2x
  if (state.status === "flying") {
    // Max-Q overstress is an ascent structural limit; a heat-shielded re-entry is
    // built to plow through far higher dynamic pressure, so don't RUD on it here.
    if (!state.reentering && state.overStressT >= cfg.MAXQ_RUD_SECONDS) {
      state.status = "crashed"; state.crashReason = "maxq"; return state;
    }
    if (state.noseTemp >= cfg.NOSE_TEMP_LIMIT && !rocket.hasHeatShield) {
      state.status = "crashed"; state.crashReason = "burnup"; return state; // burned up in the fire
    }
  }

  state.maxAlt = Math.max(state.maxAlt, state.altitude);
  state.maxHSpeed = Math.max(state.maxHSpeed, state.hSpeed);

  // ground: the pad holds the rocket during spool-up (thrust < weight). Only a
  // return from actual flight (it climbed away) counts as a landing or crash.
  if (state.altitude <= 0) {
    state.altitude = 0;
    if (state.maxAlt > 20 && state.vSpeed < 0) {
      const soft = -state.vSpeed <= cfg.CRASH_SPEED;
      if (state.reentering) {
        state.status = soft ? "splashed" : "crashed";
        if (!soft) state.crashReason = "hardsplash";
      } else {
        state.status = soft || rocket.hasParachute ? "landed" : "crashed";
      }
    }
    if (state.vSpeed < 0) state.vSpeed = 0; // pad (or standing) holds it down at 0
    if (state.status !== "flying") return state;
  }

  // orbit: not an end state — the sim keeps running and the rocket coasts.
  if (!state.orbited && state.altitude >= cfg.ORBIT_MARGIN_ALT && state.hSpeed >= vCirc(state.altitude, cfg)) {
    state.orbited = true;
    state.engineOn = false; // cut the engine; coast around
    state.vSpeed = 0; // level off into a stable orbit
  }
  return state;
}

// Player action or plan step. action: fire | cut | dropStage | deploy
export function applyAction(state, action, rocket) {
  if (action === "fire") state.engineOn = true;
  else if (action === "cut") state.engineOn = false;
  else if (action === "deploy") state.deployed = true;
  else if (action === "jettisonFairing") state.fairingJettisoned = true;
  else if (action === "reenter") state.reentering = true;
  else if (action === "throttleDown") state.throttleTarget = CONFIG.BUCKET_THROTTLE;
  else if (action === "throttleUp") state.throttleTarget = 1;
  else if (action === "deployChute") {
    if (!state.chuteOpen && !state.chuteRipped) {
      if (Math.hypot(state.vSpeed, state.hSpeed) > CONFIG.CHUTE_SAFE_SPEED) state.chuteRipped = true;
      else state.chuteOpen = true;
    }
  }
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
