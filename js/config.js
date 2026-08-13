// The calibration knobs. Numbers get tuned by playtesting with Bash,
// not derived from real physics. Change these to make the game feel right.
export const CONFIG = {
  // World
  GRAVITY0: 9.8, // m/s^2 at the ground
  EARTH_RADIUS: 6_371_000, // m, used so gravity weakens with altitude
  SPACE_ALT: 100_000, // 100 km — the Karman line, "you reached space"
  ORBIT_ALT: 100_000, // must be this high AND fast to orbit
  ORBIT_SPEED: 1_600, // m/s sideways (arcade, not real orbital velocity)

  // Sim stepping
  DT: 0.05, // seconds per physics step (small = stable)
  TIME_SCALE: 8, // sim-seconds per real-second, so a long flight is watchable
  THROTTLE_RAMP: 2.5, // seconds for engines to spool from 0 to full thrust

  // Pitch program: the rocket flies straight up, then tilts over to build
  // sideways speed. Same in auto and hard mode (an 8-year-old flies the
  // staging, not a manual gravity turn).
  PITCH_START_ALT: 1_500, // start tilting here
  PITCH_END_ALT: 65_000, // fully tilted here
  PITCH_MAX: 1.15, // radians from vertical (~66°)

  // Failure
  CRASH_SPEED: 12, // m/s downward at touchdown you can survive without a chute

  // Fairings jettison once the air is thin enough that the payload is safe
  FAIRING_ALT: 45_000, // 45 km
};
