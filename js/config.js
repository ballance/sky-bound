// The calibration knobs. Numbers get tuned by playtesting with Bash,
// not derived from real physics. Change these to make the game feel right.
export const CONFIG = {
  // World
  GRAVITY0: 9.8, // m/s^2 at the ground
  EARTH_RADIUS: 6_371_000, // m, used so gravity weakens with altitude
  SPACE_ALT: 100_000, // 100 km — the Karman line, "you reached space"
  ORBIT_ALT: 100_000, // must be this high AND fast to orbit
  ORBIT_SPEED: 1_600, // m/s sideways (arcade, not real orbital velocity)

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

  // Sim stepping
  DT: 0.05, // seconds per physics step (small = stable)
  TIME_SCALE: 1, // base: real time; multiplied by the live warp factor
  WARP_TIERS: [1, 2, 5, 10, 25],
  THROTTLE_RAMP: 2.5, // seconds for engines to spool from 0 to full thrust

  // Pitch program: the rocket flies straight up, then tilts over to build
  // sideways speed. Same in auto and hard mode (an 8-year-old flies the
  // staging, not a manual gravity turn).
  PITCH_START_ALT: 1_500, // start tilting here
  PITCH_END_ALT: 105_000, // fully tilted here
  PITCH_MAX: 1.50, // radians from vertical (~86°, nearly horizontal near orbit)

  // Failure
  CRASH_SPEED: 12, // m/s downward at touchdown you can survive without a chute

  // Fairings jettison once the air is thin enough that the payload is safe
  FAIRING_ALT: 45_000, // 45 km

  // Re-entry: the parachute opens once the stage is low and slow enough
  CHUTE_ALT: 5_000, // 5 km
};
