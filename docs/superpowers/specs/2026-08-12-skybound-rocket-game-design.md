# SKYBOUND — Design Doc

A web-based rocket assembly and space-flight simulator for kids. Build a rocket
from parts, plan its flight, launch it SpaceX-webcast style, earn knowledge by
discovering firsts and completing missions, and spend that knowledge to unlock
more parts. Inspired by Kerbal Space Program, simplified for an 8-year-old.

Audience: Bash (8) and Dad. Runs in any browser, no install, shareable by link.

## Goals

- Build → Plan → Launch → Discover → Unlock loop that's fun in the first minute.
- Runs on any browser with no install; shared by sending a URL or a file.
- Simple enough for a kid; "real enough" that thrust, fuel, and orbit feel true.
- Keep the door open to a real game engine later without a rewrite.

## Non-Goals (YAGNI for now)

- No accounts, no backend, no multiplayer. Progress is local to the browser.
- Not a real orbital-mechanics simulator — arcade physics.
- No level editor, no modding, no in-app part designer.

## Core Loop

1. **Build** a rocket from owned parts.
2. **Plan** the flight (an ordered sequence of timed/triggered steps).
3. **Launch** — the rocket runs the plan automatically (Hard Mode = fly by hand).
4. **Discover** — earn knowledge points from first-time milestones and missions.
5. **Unlock** — spend knowledge to buy new parts, enabling bigger missions.

## Screens

- **Build** — parts palette on the left; rocket assembled on the right. Parts
  stack vertically (engine → tank → probe) and side boosters attach radially,
  Falcon-Heavy style.
- **Plan** — an ordered list of steps. Each step = a *trigger* + an *action*.
  - Triggers: `T+<seconds>`, `at <altitude>`, `then` (immediately after prev),
    `+<seconds>` (delay after prev), `on fuel empty`.
  - Actions: fire engine, cut engine, drop stage, release payload (satellite).
- **Launch** — SpaceX-webcast HUD: mission clock (`T+ mm:ss`), the sequence
  checklist lighting up green as steps fire, and a telemetry bar (speed,
  altitude, fuel). Auto mode runs the plan; Hard Mode shows live buttons.
- **Knowledge** — points balance and a grid of parts to unlock (owned / locked
  with a price).
- **Missions** — a short list of NASA jobs; completing one grants knowledge.

## Parts

**Starting parts:** Fuel Tank, Big Engine (high thrust, high burn), Small Engine
(low thrust, low burn), Probe (control brain, no astronaut needed for satellites).

**Unlockable (initial set):** Side Booster, Parachute, Bigger Tank, Landing Legs.
The unlock list is data-driven so more parts are easy to add later.

## Progression

- Start with **10** knowledge points and the four starting parts.
- **Milestones** (each awarded once): first to 10 km, first to space (~100 km),
  first orbit (**+20**), first booster landing, first satellite deployed.
- **Missions**: e.g. "Put a satellite in orbit" → grants knowledge on completion.
- Spend knowledge to unlock parts. Prices are data-driven.

## Physics (arcade, not orbital)

Deliberately simplified. The rocket tracks **altitude** and **horizontal speed**;
each tick applies thrust (up/forward), gravity (down, weaker with altitude), and
fuel burn based on the active engine(s). Stage separation drops that stage's dry
mass and fuel. Mass falls as fuel burns.

- **Orbit** is achieved when `altitude ≥ ORBIT_ALT` **and** `hSpeed ≥ ORBIT_SPEED`.
- **Failure**: fuel runs out before orbit and the rocket falls back → crash
  (unless a parachute/landing legs let it survive). Forgiving, retry instantly.

Constants (`ORBIT_ALT`, `ORBIT_SPEED`, gravity, engine thrust/burn, part masses)
live in one tunable config block — the calibration knobs. Numbers get tuned by
playtesting with Bash, not derived from real physics.

## Architecture

Single static site. **No framework, no build step.** Plain HTML + CSS + ES
modules, one `<canvas>` for the launch view. Deployable to any static host or
opened as a file.

Keep the game-engine door open by splitting **simulation from rendering**:

- `sim.js` — pure game state + physics step. No DOM, no canvas. Deterministic:
  `step(state, dt) → state`. This is the swappable core and the tested part.
- `render.js` — draws a `state` to the canvas / DOM HUD. The part a future game
  engine would replace.
- `parts.js`, `missions.js` — data (part stats, prices, mission definitions).
- `store.js` — load/save progress to `localStorage`.
- `ui.js` / `main.js` — screen switching (Build / Plan / Launch / Knowledge /
  Missions) and wiring input to the sim.

## Data & Persistence

`localStorage` holds one save object: `{ knowledge, unlockedParts[],
milestonesEarned[], missionsDone[], savedRockets[] }`. No backend. "Share" =
share the URL or the HTML file; each player has their own local progress.

## Error Handling

- Corrupt/absent save → start fresh with defaults (never crash on load).
- Invalid rocket (no engine, no probe/crew) → block launch with a friendly
  message, don't run a broken sim.
- Sim guards against NaN/negative fuel; a failed flight ends in a clean "crash"
  state, never a hang.

## Testing

Per the lazy-but-checked rule: the physics/orbit logic is the one non-trivial
path that needs a runnable check. One small assert-based self-test on `sim.js`:
a sensible plan reaches orbit; a plan with too little fuel does not. No test
framework. Screens/UI are validated by playing it.

## Open Questions / Deferred

- Real game engine (Phaser/PixiJS): deferred. The sim/render split is the
  insurance so it's a rendering swap, not a rewrite.
- Extra parts, planets, re-entry, docking: future, once the core loop is fun.
