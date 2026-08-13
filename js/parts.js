// Part stats and prices. Data-driven so adding parts later is just data.
// kind: engine | tank | probe | booster | utility
export const PARTS = {
  bigEngine: {
    id: "bigEngine", name: "Big Engine", kind: "engine", icon: "🔥",
    thrust: 1_050_000, burn: 320, mass: 1_400,
    blurb: "Lots of push, drinks fuel fast.",
  },
  smallEngine: {
    id: "smallEngine", name: "Small Engine", kind: "engine", icon: "🔸",
    thrust: 380_000, burn: 95, mass: 600,
    blurb: "Gentle push, sips fuel — good for space.",
  },
  tank: {
    id: "tank", name: "Fuel Tank", kind: "tank", icon: "🛢️",
    fuel: 9_000, mass: 900,
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
    thrust: 600_000, burn: 200, mass: 800, fuel: 4_000, price: 8,
    blurb: "Straps on the side for extra kick at liftoff.",
  },
  bigTank: {
    id: "bigTank", name: "Bigger Tank", kind: "tank", icon: "🛢️",
    fuel: 18_000, mass: 1_600, price: 10,
    blurb: "Twice the fuel to go higher and faster.",
  },
  parachute: {
    id: "parachute", name: "Parachute", kind: "utility", icon: "🪂",
    mass: 120, price: 6,
    blurb: "Floats you down for a safe landing.",
  },
  legs: {
    id: "legs", name: "Landing Legs", kind: "utility", icon: "🦵",
    mass: 200, price: 12,
    blurb: "Land the booster upright, SpaceX-style.",
  },
  fairing: {
    id: "fairing", name: "Payload Fairing", kind: "fairing", icon: "🔺",
    mass: 150, price: 7,
    blurb: "Nose cone that shields the payload, then splits away in space.",
  },
};

export const STARTING_PARTS = ["bigEngine", "smallEngine", "tank", "probe"];
export const START_KNOWLEDGE = 10;
