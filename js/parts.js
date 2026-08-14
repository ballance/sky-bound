// Part stats and prices. Data-driven so adding parts later is just data.
// kind: engine | tank | probe | booster | utility
export const PARTS = {
  bigEngine: {
    id: "bigEngine", name: "Big Engine", kind: "engine", icon: "🔥",
    thrust: 900_000, ve: 3000, mass: 3_000,
    blurb: "Lots of push, drinks fuel fast.",
  },
  smallEngine: {
    id: "smallEngine", name: "Small Engine", kind: "engine", icon: "🔸",
    thrust: 500_000, ve: 3800, mass: 900,
    blurb: "Gentle push, sips fuel — good for space.",
  },
  tank: {
    id: "tank", name: "Fuel Tank", kind: "tank", icon: "🛢️",
    fuel: 22_000, mass: 1_800,
    blurb: "Holds the fuel your engine burns.",
  },
  probe: {
    id: "probe", name: "Probe", kind: "probe", icon: "📡",
    mass: 180,
    blurb: "The brain. No astronaut needed for satellites.",
  },

  // Unlockable
  booster: {
    id: "booster", name: "Side Booster", kind: "booster", icon: "🚀",
    thrust: 900_000, ve: 2900, mass: 2_500, fuel: 20_000, price: 8,
    blurb: "Straps on the side for extra kick at liftoff.",
  },
  bigTank: {
    id: "bigTank", name: "Bigger Tank", kind: "tank", icon: "🛢️",
    fuel: 44_000, mass: 3_500, price: 10,
    blurb: "Twice the fuel to go higher and faster.",
  },
  parachute: {
    id: "parachute", name: "Parachute", kind: "utility", icon: "🪂",
    mass: 120, price: 6,
    blurb: "Floats you down for a safe landing.",
  },
  fairing: {
    id: "fairing", name: "Payload Fairing", kind: "fairing", icon: "🔺",
    mass: 150, price: 7,
    blurb: "Nose cone that shields the payload, then splits away in space.",
  },
};

export const STARTING_PARTS = ["bigEngine", "smallEngine", "tank", "probe", "fairing"];
export const START_KNOWLEDGE = 10;

// A known-good rocket that reaches orbit — used for the "new player" default and tests.
export const STARTER_ROCKET = ["bigEngine", "tank", "smallEngine", "tank", "probe"];
