// Milestones (auto-awarded firsts) and missions (jobs you choose to do).
// Each check gets the final flight state and returns true if earned.

export const MILESTONES = [
  { id: "alt10k", name: "First to 10 km", reward: 5, check: (s) => s.maxAlt >= 10_000 },
  { id: "space", name: "First to Space (100 km)", reward: 10, check: (s) => s.maxAlt >= 100_000 },
  { id: "orbit", name: "First Orbit", reward: 20, check: (s) => s.orbited },
  { id: "deploy", name: "First Satellite Deployed", reward: 10, check: (s) => s.deployed },
  { id: "fairing", name: "First Fairing Separation", reward: 8, check: (s) => s.fairingJettisoned },
  { id: "landing", name: "First Booster Landing", reward: 15, check: (s) => s.boosterRecovered },
  { id: "reentry", name: "First Splashdown", reward: 15, check: (s) => s.reentering && s.status === "splashed" },
];

export const MISSIONS = [
  {
    id: "reachSpace",
    name: "Touch Space",
    blurb: "Fly a rocket past 100 km — the edge of space.",
    reward: 8,
    check: (s) => s.maxAlt >= 100_000,
  },
  {
    id: "satellite",
    name: "Put a Satellite in Orbit",
    blurb: "Reach orbit and release your probe as a satellite.",
    reward: 15,
    check: (s) => s.orbited && s.deployed,
  },
  {
    id: "landBooster",
    name: "Land the Booster",
    blurb: "Fly a multi-stage rocket and land the first stage on the droneship.",
    reward: 12,
    check: (s) => s.boosterRecovered,
  },
  {
    id: "returnHome",
    name: "Bring It Home",
    blurb: "Fit a heat shield and parachute, reach orbit, then splash the capsule down safely.",
    reward: 15,
    check: (s) => s.reentering && s.status === "splashed",
  },
];
