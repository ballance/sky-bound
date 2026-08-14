// Screen switching + wiring input to the sim. The glue; no physics lives here.
import { CONFIG } from "./config.js";
import { PARTS } from "./parts.js";
import { MILESTONES, MISSIONS } from "./missions.js";
import { load, save, reset } from "./store.js";
import { initState, step, applyAction, triggerReady, simulate } from "./sim.js";
import { drawScene, resetEffects, startBoosterRecovery } from "./render.js";
import { toggleMusic } from "./music.js";
import * as sfx from "./sfx.js";
import { partArt, partSpecs, rocketSVG } from "./partart.js";

let game = load();
let build = []; // ordered { id, fuel } items, bottom -> top (fuel only for tanks/boosters)
let plan = [];

const $ = (id) => document.getElementById(id);
const ctx = $("sky").getContext("2d");

const makeItem = (id) => ({ id, fuel: PARTS[id].fuel }); // fuel is undefined for non-tank parts
const buildIds = () => build.map((b) => b.id);

// ---- rocket assembly: turn a flat part list into stages the sim understands ----
function normalizeRocket(partIds) {
  const stages = [];
  let probeMass = 0;
  let hasParachute = false;
  let hasLegs = false;
  let hasFairing = false;
  let fairingMass = 0;
  let cur = null;
  for (const item of partIds) {
    const id = item.id;
    const p = PARTS[id];
    if (!p) continue;
    const fuel = item.fuel ?? p.fuel; // per-tank amount, defaulting to capacity
    if (p.kind === "engine") {
      cur = { thrust: p.thrust, burn: p.burn, dryMass: p.mass, fuel: 0 };
      stages.push(cur);
    } else if (p.kind === "tank") {
      if (cur) { cur.fuel += fuel; cur.dryMass += p.mass; }
    } else if (p.kind === "booster") {
      // radial boosters fire with the bottom stage: just more thrust + fuel there
      const s = stages[0];
      if (s) { s.thrust += p.thrust; s.burn += p.burn; s.fuel += fuel; s.dryMass += p.mass; }
    } else if (p.kind === "probe") {
      probeMass += p.mass;
    } else if (p.kind === "utility") {
      probeMass += p.mass;
      if (id === "parachute") hasParachute = true;
      if (id === "legs") hasLegs = true;
    } else if (p.kind === "fairing") {
      hasFairing = true;
      fairingMass += p.mass;
    }
  }
  return { stages, probeMass, hasParachute, hasLegs, hasFairing, fairingMass };
}

function validate(rocket) {
  if (rocket.stages.length === 0) return "Add an engine so your rocket can fly.";
  if (rocket.probeMass === 0) return "Add a Probe — the rocket needs a brain.";
  if (rocket.stages.some((s) => s.fuel === 0)) return "Every engine needs a Fuel Tank above it.";
  const mass = rocket.probeMass + (rocket.fairingMass || 0) + rocket.stages.reduce((n, s) => n + s.dryMass + s.fuel, 0);
  if (rocket.stages[0].thrust < mass * CONFIG.GRAVITY0)
    return "Too heavy to lift off — add an engine or booster, or remove a tank.";
  return "";
}

function autoPlan(rocket, deploy) {
  const p = [{ trigger: { type: "T", s: 0 }, action: "fire", label: "Ignition — light the engine" }];
  for (let i = 1; i < rocket.stages.length; i++) {
    p.push({ trigger: { type: "fuelEmpty" }, action: "dropStage", label: `Drop empty stage ${i}` });
    p.push({ trigger: { type: "then" }, action: "fire", label: `Light stage ${i + 1}` });
  }
  if (rocket.hasFairing) p.push({ trigger: { type: "alt", m: CONFIG.FAIRING_ALT }, action: "jettisonFairing", label: "Jettison fairings" });
  if (deploy) p.push({ trigger: { type: "alt", m: CONFIG.SPACE_ALT }, action: "deploy", label: "Release satellite" });
  return p;
}

// Which build slot a drop at screen-y `y` maps to. Stack renders top-first
// (build is bottom-first), so a visual index converts to build.length - v.
function dropIndexFromY(stackEl, y) {
  const kids = [...stackEl.querySelectorAll(".rpart")];
  for (let i = 0; i < kids.length; i++) {
    const r = kids[i].getBoundingClientRect();
    if (y < r.top + r.height / 2) return i;
  }
  return kids.length;
}

// ---------------- BUILD screen ----------------
function renderBuild() {
  const pal = $("palette");
  pal.innerHTML = "";
  for (const id of game.unlockedParts) {
    const p = PARTS[id];
    if (!p) continue; // skip parts that no longer exist (e.g. removed from a save)
    const b = document.createElement("button");
    b.className = "part";
    b.draggable = true;
    b.innerHTML = `<div class="pi">${partArt(id)}</div><div class="pn">${p.name}</div><div class="pb">${p.blurb}</div><div class="pspec">${partSpecs(id)}</div>`;
    b.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", id);
      e.dataTransfer.effectAllowed = "copy";
    });
    b.onclick = () => { build.push(makeItem(id)); renderBuild(); }; // click = quick-add on top
    pal.appendChild(b);
  }

  const stack = $("stack");
  stack.innerHTML = "";
  if (build.length === 0) {
    stack.innerHTML = `<div class="empty">Empty pad — drag parts here to build a rocket.</div>`;
  } else {
    const coreIdx = [];
    const boosterIdx = [];
    build.forEach((item, idx) => (PARTS[item.id].kind === "booster" ? boosterIdx : coreIdx).push(idx));

    // core stacks vertically, top-first (build[0] is the bottom engine)
    [...coreIdx].reverse().forEach((idx) => {
      const el = document.createElement("div");
      el.className = "rpart";
      el.title = `${PARTS[build[idx].id].name} — click to remove`;
      el.innerHTML = partArt(build[idx].id);
      el.onclick = () => { build.splice(idx, 1); renderBuild(); };
      stack.appendChild(el);
    });

    // side boosters attach radially to the base, alternating left/right
    boosterIdx.forEach((idx, i) => {
      const el = document.createElement("div");
      el.className = "booster-side";
      el.style[i % 2 === 0 ? "left" : "right"] = "calc(50% - 68px)";
      el.style.bottom = `${44 + Math.floor(i / 2) * 44}px`;
      el.title = `${PARTS[build[idx].id].name} — click to remove`;
      el.innerHTML = partArt(build[idx].id);
      el.onclick = () => { build.splice(idx, 1); renderBuild(); };
      stack.appendChild(el);
    });
  }

  renderFuelLoadout();
  updateBuildStats();
}

// A slider per fuel-holding part (tank/booster) to set how much fuel it carries.
function renderFuelLoadout() {
  const fl = $("fuelLoadout");
  fl.innerHTML = "";
  const fuelItems = build.map((item, idx) => ({ item, idx })).filter(({ item }) => PARTS[item.id].fuel != null);
  if (!fuelItems.length) return;
  fl.innerHTML = `<div class="fuel-title">Fuel loadout</div>`;
  fuelItems.forEach(({ item }) => {
    const p = PARTS[item.id];
    const row = document.createElement("div");
    row.className = "fuel-row";
    row.innerHTML =
      `<span class="fuel-name">${p.icon} ${p.name}</span>` +
      `<input type="range" min="0" max="${p.fuel}" step="${Math.max(1, Math.round(p.fuel / 20))}" value="${item.fuel}" />` +
      `<span class="fuel-val">${item.fuel.toLocaleString()} kg</span>`;
    const slider = row.querySelector("input");
    const val = row.querySelector(".fuel-val");
    slider.addEventListener("input", () => {
      item.fuel = Number(slider.value);
      val.textContent = item.fuel.toLocaleString() + " kg";
      updateBuildStats(); // live weight/TWR feedback without rebuilding the sliders
    });
    fl.appendChild(row);
  });
}

// Recompute the weight-vs-propulsion readout + validation from the current build.
function updateBuildStats() {
  const rocket = normalizeRocket(build);
  const totalFuel = rocket.stages.reduce((n, s) => n + s.fuel, 0);
  const mass = rocket.probeMass + rocket.fairingMass + rocket.stages.reduce((n, s) => n + s.dryMass + s.fuel, 0);
  // weight vs propulsion: liftoff thrust ÷ weight. Stage-0 thrust already
  // includes any side boosters (they fold into the bottom stage).
  const liftThrust = rocket.stages[0] ? rocket.stages[0].thrust : 0;
  const twr = mass > 0 && liftThrust > 0 ? liftThrust / (mass * CONFIG.GRAVITY0) : 0;
  const twrClass = twr >= 1.3 ? "good" : twr >= 1 ? "mid" : "bad";
  const twrLabel = twr >= 1.3 ? "lifts off strong 🚀" : twr >= 1 ? "lifts off slowly" : "too heavy to fly 🚫";
  $("rocketStats").innerHTML =
    `Stages <b>${rocket.stages.length}</b> &nbsp;·&nbsp; Fuel <b>${totalFuel.toLocaleString()}</b> kg &nbsp;·&nbsp; ` +
    `Weight <b>${Math.round(mass).toLocaleString()}</b> kg &nbsp;·&nbsp; Thrust <b>${Math.round(liftThrust / 1000).toLocaleString()}</b> kN` +
    `<div class="twr twr-${twrClass}">Thrust ÷ Weight = <b>${twr.toFixed(2)}</b> — ${twrLabel}</div>`;
  $("buildWarn").textContent = validate(rocket);
}

// ---------------- PLAN screen ----------------
function renderPlan() {
  const rocket = normalizeRocket(build);
  plan = autoPlan(rocket, $("deployToggle").checked);
  const ol = $("planList");
  ol.innerHTML = "";
  for (const s of plan) {
    const li = document.createElement("li");
    li.textContent = s.label;
    ol.appendChild(li);
  }
  if (plan.length === 0) ol.innerHTML = "<li>Build a rocket first.</li>";
}

// ---------------- KNOWLEDGE screen ----------------
function renderKnowledge() {
  $("kbal").textContent = game.knowledge;
  $("kbal2").textContent = game.knowledge;
  const grid = $("unlockGrid");
  grid.innerHTML = "";
  for (const id of Object.keys(PARTS)) {
    const p = PARTS[id];
    const owned = game.unlockedParts.includes(id);
    const b = document.createElement("button");
    b.className = "part " + (owned ? "owned" : "locked");
    const priceLine = owned ? `<div class="price" style="color:var(--go)">Owned ✓</div>`
      : `<div class="price">🧠 ${p.price}</div>`;
    b.innerHTML = `<div class="pi">${partArt(id)}</div><div class="pn">${p.name}</div><div class="pb">${p.blurb}</div><div class="pspec">${partSpecs(id)}</div>${priceLine}`;
    if (owned) b.disabled = true;
    else if (game.knowledge < p.price) b.disabled = true;
    else b.onclick = () => {
      game.knowledge -= p.price;
      game.unlockedParts.push(id);
      save(game);
      renderKnowledge();
      renderBuild();
    };
    grid.appendChild(b);
  }
}

// ---------------- MISSIONS screen ----------------
function renderMissions() {
  const list = $("missionList");
  list.innerHTML = "";
  for (const m of MISSIONS) {
    const done = game.missionsDone.includes(m.id);
    const d = document.createElement("div");
    d.className = "mission " + (done ? "done" : "");
    d.innerHTML = `<h3>${m.name} ${done ? "✅" : ""}</h3><p class="hint" style="margin:0 0 6px">${m.blurb}</p><span class="r">🧠 ${m.reward}${done ? " earned" : ""}</span>`;
    list.appendChild(d);
  }
}

// ---------------- LAUNCH screen ----------------
let anim = null;
let sim = null;
let rocketNow = null;
let mode = "auto";
let stepIdx = 0;
let prevFireT = 0;
let frame = 0;
let rocketImg = null;
let lastStageIndex = 0;
let lastFairing = false;
let lastDeployed = false;
let lastThrusting = false;
let postFrames = -1; // frames to keep animating effects after the flight ends
let countdownTimers = []; // all scheduled callouts/ticks of the launch sequence
let paused = false;
let orbitAwarded = false;
let reentryTimer = 0;
let loopFn = null; // the flight's rAF callback, so pause/resume can restart it

// Rasterize the assembled build into one image the launch view can draw.
function buildRocketImage(ids) {
  if (!ids.length) return null;
  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(rocketSVG(ids));
  return img;
}

// Which build parts are still attached: drops shed stages and a jettisoned fairing.
function visibleParts(items, stageIndex, fairingGone) {
  let stage = -1;
  const keep = [];
  for (const it of items) {
    const p = PARTS[it.id];
    if (!p) continue;
    if (p.kind === "engine") { stage++; if (stage >= stageIndex) keep.push(it.id); }
    else if (p.kind === "tank") { if (stage >= stageIndex) keep.push(it.id); }
    else if (p.kind === "booster") { if (stageIndex <= 0) keep.push(it.id); }
    else if (p.kind === "fairing") { if (!fairingGone) keep.push(it.id); }
    else keep.push(it.id); // probe / utility ride all the way up
  }
  return keep;
}

function idleScene() {
  resetEffects();
  const rocket = normalizeRocket(build);
  const s = initState(rocket);
  rocketImg = buildRocketImage(buildIds());
  const paint = () => drawScene(ctx, s, rocket, CONFIG, 0, rocketImg);
  if (rocketImg && !rocketImg.complete) rocketImg.onload = paint;
  paint();
}

function updateHUD() {
  const s = sim;
  const mm = String(Math.floor(s.t / 60)).padStart(2, "0");
  const ss = String(Math.floor(s.t % 60)).padStart(2, "0");
  $("clock").textContent = `T+ ${mm}:${ss}`;
  $("tAlt").textContent = `${(s.altitude / 1000).toFixed(1)} km`;
  const spd = Math.hypot(s.vSpeed, s.hSpeed);
  $("tSpd").textContent = `${Math.round(spd)} m/s`;
  const temp = Math.round(s.noseTemp);
  const tt = $("tTemp");
  tt.textContent = `${temp}°C`;
  tt.style.color = temp > 1000 ? "#ff6b6b" : temp > 300 ? "#ffb020" : "";
  const stage = rocketNow.stages[s.stageIndex];
  const pct = stage ? (s.fuel / stage.fuel) * 100 : 0;
  $("tFuel").style.width = `${Math.max(0, pct)}%`;
}

function renderChecklist(done) {
  const box = $("checklist");
  box.innerHTML = "";
  plan.forEach((p, i) => {
    const d = document.createElement("div");
    d.className = "step" + (i < done ? " done" : "");
    d.textContent = p.label;
    box.appendChild(d);
  });
}

function startLaunch() {
  const rocket = normalizeRocket(build);
  const err = validate(rocket);
  if (err) { $("launchResult").textContent = "🚫 " + err; return; }

  sfx.resume(); // the click is our gesture to enable audio
  if (anim) { cancelAnimationFrame(anim); anim = null; } // stop a coasting orbit
  sfx.setRumble(false);
  paused = false;
  $("launchResult").textContent = "";
  $("launchBtn").disabled = true;
  $("abortBtn").disabled = true;
  $("pauseBtn").disabled = true;
  setHardEnabled(false);
  idleScene(); // rocket waits on the pad through the countdown
  runCountdown(rocket, $("quickCountdown").checked ? 10 : 60);
}

function clearCountdown() {
  for (const id of countdownTimers) clearTimeout(id);
  countdownTimers = [];
  sfx.cancelSpeech();
  const c = document.getElementById("callout");
  if (c) { c.textContent = ""; c.className = "callout"; }
}

// A real-time T-60 launch sequence: flight director go/no-go poll, then the
// terminal count. Each callout is a scheduled speech line; the clock ticks 1/s.
function runCountdown(rocket, fromSec = 60) {
  clearCountdown();
  // schedule fn at the given T-minus second (real-time), if it falls in the window
  const at = (sec, fn) => {
    if (sec <= fromSec) countdownTimers.push(setTimeout(fn, (fromSec - sec) * 1000));
  };
  // show the line on screen (with a speaker style) AND speak it
  const show = (caption, cls) => { const el = $("callout"); el.textContent = caption; el.className = "callout " + cls; };
  const dir = (spoken, caption) => { show(caption ?? `Flight Director: ${spoken}`, "flight"); sfx.speak(spoken, { pitch: 0.66, rate: 0.95 }); };
  const call = (spoken, caption) => { show(caption ?? spoken, "announcer"); sfx.speak(spoken, { pitch: 0.72, rate: 1.0 }); };

  for (let s = fromSec; s >= 0; s--) {
    at(s, () => {
      $("clock").textContent = s > 0 ? `T- 00:${String(s).padStart(2, "0")}` : "T+ 00:00";
      if (s <= 10 && s >= 1) sfx.beep();
    });
  }

  at(60, () => dir("T minus sixty seconds and counting.", "T minus 60 seconds and counting."));
  at(52, () => dir("All stations, this is the flight director. Stand by for go, no go for launch.",
    "Flight Director: all stations, stand by for go / no-go for launch."));

  // flight director polls each system lead for a go
  const poll = [
    { name: "Booster", reply: "Go, flight!" },
    { name: "Guidance", reply: "Guidance is go!" },
    { name: "Propulsion", reply: "Propulsion, go!" },
    { name: "FIDO", say: "Fido", reply: "Fido is go!" },
    { name: "EECOM", say: "E com", reply: "Go, flight!" },
    { name: "Range Safety", reply: "Range is go!" },
  ];
  let sec = 47;
  for (const { name, say, reply } of poll) {
    const q = sec;
    const r = sec - 1;
    at(q, () => dir(`${say ?? name}?`, `Flight Director: ${name}?`));
    at(r, () => {
      const el = $("callout");
      el.textContent = `${name.toUpperCase()}: ${reply}`;
      el.className = "callout lead";
      sfx.speak(reply, { pitch: 0.92, rate: 1.12 });
    });
    sec -= 2;
  }

  at(34, () => dir("Copy that. We are go for launch!", "Flight Director: we are GO for launch!"));
  at(20, () => call("T minus twenty seconds."));
  at(15, () => call("Guidance is internal."));
  at(10, () => call("Ten")); at(9, () => call("nine")); at(8, () => call("eight")); at(7, () => call("seven"));
  at(6, () => call("six. Ignition sequence start.", "Ignition sequence start."));
  at(5, () => call("five")); at(4, () => call("four")); at(3, () => call("three"));
  at(2, () => call("two")); at(1, () => call("one"));
  at(0, () => {
    countdownTimers = [];
    $("clock").textContent = "T+ 00:00";
    call("Zero. We have liftoff!", "🔥 WE HAVE LIFTOFF!");
    beginFlight(rocket);
  });
}

function beginFlight(rocket) {
  plan = autoPlan(rocket, $("deployToggle").checked);
  rocketNow = rocket;
  sim = initState(rocket);
  sim.status = "flying";
  stepIdx = 0; prevFireT = 0; frame = 0;
  lastStageIndex = 0;
  lastFairing = false;
  lastDeployed = false;
  lastThrusting = false;
  postFrames = -1;
  orbitAwarded = false;
  reentryTimer = 0;
  resetEffects();
  rocketImg = buildRocketImage(buildIds());
  renderChecklist(0);
  setHardEnabled(mode === "manual");
  $("abortBtn").disabled = false;
  paused = false;
  $("pauseBtn").disabled = false;
  $("pauseBtn").textContent = "⏸ Pause";
  sfx.liftoff();

  // Fire every plan step whose trigger is now satisfied (auto mode only).
  const fireDue = () => {
    if (mode !== "auto") return;
    while (stepIdx < plan.length && triggerReady(plan[stepIdx].trigger, sim, prevFireT)) {
      applyAction(sim, plan[stepIdx].action, rocketNow);
      prevFireT = sim.t;
      stepIdx++;
      renderChecklist(stepIdx);
    }
  };

  let last = null;
  const loop = (ts) => {
    if (last == null) last = ts;
    const realDt = Math.min(0.05, (ts - last) / 1000);
    last = ts;
    // advance the sim by TIME_SCALE sim-seconds per real second, in small steps
    let simDt = realDt * CONFIG.TIME_SCALE;
    while (simDt > 0 && sim.status === "flying") {
      const dt = Math.min(CONFIG.DT, simDt);
      fireDue();
      step(sim, dt, CONFIG, rocketNow);
      simDt -= dt;
    }
    // final sweep so end-of-flight triggers still fire — e.g. release the
    // satellite the instant orbit is reached (orbit ends the sim same-tick).
    fireDue();
    // sound effects on state changes (checked before the trackers update)
    if (sim.stageIndex > lastStageIndex) {
      sfx.stageSep();
      // first-stage separation → always fly the booster back (legs are standard)
      if (sim.stageIndex === 1 && !sim.boosterRecovered) {
        sim.boosterRecovered = true;
        startBoosterRecovery();
      }
    }
    if (sim.fairingJettisoned && !lastFairing) sfx.fairing();
    if (sim.deployed && !lastDeployed) { lastDeployed = true; sfx.deploy(); }
    // engine rumble follows the throttle: on while burning, off when it cuts
    const thrusting = sim.engineOn && sim.fuel > 0 && sim.stageIndex < rocketNow.stages.length;
    if (thrusting !== lastThrusting) { sfx.setRumble(thrusting); lastThrusting = thrusting; }
    // shed parts from the drawn rocket when a stage drops or the fairing jettisons
    if (sim.stageIndex !== lastStageIndex || sim.fairingJettisoned !== lastFairing) {
      lastStageIndex = sim.stageIndex;
      lastFairing = sim.fairingJettisoned;
      rocketImg = buildRocketImage(visibleParts(build, sim.stageIndex, sim.fairingJettisoned));
    }
    // reached orbit: announce + award once, but the sim keeps coasting around
    if (sim.orbited && !orbitAwarded) {
      orbitAwarded = true;
      sfx.orbit();
      awardResults(sim);
      $("launchBtn").disabled = false; // free to fly again while it orbits
      const c = $("callout"); c.textContent = ""; c.className = "callout";
    }
    // a parachute-equipped stage de-orbits after a short coast and re-enters
    if (sim.orbited && rocketNow.hasParachute && !sim.reentering) {
      reentryTimer += 1;
      const deployDone = !$("deployToggle").checked || sim.deployed;
      if (reentryTimer > 200 && deployDone) applyAction(sim, "reenter", rocketNow);
    }
    frame++;
    drawScene(ctx, sim, rocketNow, CONFIG, frame, rocketImg);
    updateHUD();
    if (sim.status === "flying") {
      anim = requestAnimationFrame(loop); // orbiting counts as flying — keep going
    } else {
      // ending tail: explosion for crash/abort, short for a clean landing
      if (postFrames < 0) {
        postFrames = sim.status === "crashed" || sim.status === "aborted" ? 80 : 6;
        if (sim.status === "landed") sfx.deploy();
        else sfx.boom();
      }
      if (postFrames > 0) { postFrames--; anim = requestAnimationFrame(loop); }
      else finishFlight(sim);
    }
  };
  loopFn = loop;
  anim = requestAnimationFrame(loop);
}

// Pause/resume the flight. The loop clamps dt, so a stale timestamp on resume
// costs at most one small step — no need to track elapsed paused time.
function pauseFlight() {
  if (anim) { cancelAnimationFrame(anim); anim = null; }
  paused = true;
  sfx.setRumble(false);
  $("pauseBtn").textContent = "▶ Resume";
}
function resumeFlight() {
  if (!paused) return;
  paused = false;
  $("pauseBtn").textContent = "⏸ Pause";
  if (lastThrusting) sfx.setRumble(true);
  if (loopFn) anim = requestAnimationFrame(loopFn);
}

// Tally milestones/missions and show the outcome. Idempotent (milestones only
// award once), so it's safe to call on orbit and again if the flight later ends.
function awardResults(finalState) {
  const earned = [];
  for (const m of MILESTONES) {
    if (!game.milestonesEarned.includes(m.id) && m.check(finalState)) {
      game.milestonesEarned.push(m.id);
      game.knowledge += m.reward;
      earned.push(`⭐ ${m.name}  +${m.reward} 🧠`);
    }
  }
  for (const ms of MISSIONS) {
    if (!game.missionsDone.includes(ms.id) && ms.check(finalState)) {
      game.missionsDone.push(ms.id);
      game.knowledge += ms.reward;
      earned.push(`🎯 Mission complete: ${ms.name}  +${ms.reward} 🧠`);
    }
  }
  save(game);
  $("kbal").textContent = game.knowledge;

  const head =
    finalState.status === "aborted" ? "💥 Rapid Unscheduled Disassembly! (You hit ABORT.)" :
    finalState.status === "crashed" ? "💥 Crashed — try more fuel or a parachute." :
    finalState.orbited ? "🛰️ You reached ORBIT! Coasting around…" :
    finalState.status === "landed" ? "🪂 Safe landing!" :
    "Flight over.";
  const prev = $("launchResult").textContent;
  const text = [head, ...earned].join("\n");
  if (text !== prev) $("launchResult").textContent = text;
  renderKnowledge();
  renderMissions();
}

function finishFlight(finalState) {
  cancelAnimationFrame(anim);
  anim = null;
  lastThrusting = false;
  paused = false;
  sfx.setRumble(false);
  setHardEnabled(false);
  $("launchBtn").disabled = false;
  $("abortBtn").disabled = true;
  $("pauseBtn").disabled = true;
  $("pauseBtn").textContent = "⏸ Pause";
  { const c = $("callout"); c.textContent = ""; c.className = "callout"; }
  awardResults(finalState);
}

function setHardEnabled(on) {
  $("hardControls").querySelectorAll("button").forEach((b) => (b.disabled = !on));
}

// ---------------- nav + events ----------------
function show(screen) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("active", s.id === screen));
  document.querySelectorAll("#nav button").forEach((b) => b.classList.toggle("active", b.dataset.screen === screen));
  if (screen === "plan") renderPlan();
  if (screen === "knowledge") renderKnowledge();
  if (screen === "missions") renderMissions();
  if (screen === "launch") { if (!anim && !paused) idleScene(); }
}

$("musicToggle").addEventListener("click", () => {
  $("musicToggle").textContent = toggleMusic() ? "🔊" : "🔇";
});

$("nav").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (b) show(b.dataset.screen);
});

// keep the flight-plan list in sync with the deploy toggle
$("deployToggle").addEventListener("change", renderPlan);

// drag a part from the palette and drop it onto the rocket to place it
const stackEl = $("stack");
stackEl.addEventListener("dragover", (e) => { e.preventDefault(); stackEl.classList.add("drop-hot"); });
stackEl.addEventListener("dragleave", () => stackEl.classList.remove("drop-hot"));
stackEl.addEventListener("drop", (e) => {
  e.preventDefault();
  stackEl.classList.remove("drop-hot");
  const id = e.dataTransfer.getData("text/plain");
  if (!PARTS[id]) return;
  const v = dropIndexFromY(stackEl, e.clientY);
  build.splice(build.length - v, 0, makeItem(id)); // convert visual slot to build index
  renderBuild();
});

document.querySelectorAll('input[name="mode"]').forEach((r) =>
  r.addEventListener("change", (e) => {
    mode = e.target.value;
    $("hardControls").hidden = mode !== "manual";
    if (mode === "manual" && anim) setHardEnabled(true);
  })
);

$("hardControls").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b || b.disabled || !sim || sim.status !== "flying") return;
  applyAction(sim, b.dataset.act, rocketNow);
});

$("launchBtn").addEventListener("click", startLaunch);
$("pauseBtn").addEventListener("click", () => {
  if (!sim || sim.status !== "flying") return; // pause only mid-flight
  if (paused) resumeFlight();
  else pauseFlight();
});
$("abortBtn").addEventListener("click", () => {
  // Rapid Unscheduled Disassembly — the loop handles the explosion + ending.
  if (sim && sim.status === "flying") {
    sim.status = "aborted";
    sim.engineOn = false;
    if (paused) resumeFlight(); // let the loop run to play the explosion
  }
});
$("resetBtn").addEventListener("click", () => {
  if (anim) { cancelAnimationFrame(anim); anim = null; }
  clearCountdown();
  sfx.setRumble(false);
  lastThrusting = false;
  paused = false;
  sim = null;
  $("launchResult").textContent = "";
  $("clock").textContent = "T+ 00:00";
  renderChecklist(0);
  setHardEnabled(false);
  $("launchBtn").disabled = false;
  $("abortBtn").disabled = true;
  $("pauseBtn").disabled = true;
  $("pauseBtn").textContent = "⏸ Pause";
  idleScene();
});

// boot
$("kbal").textContent = game.knowledge;
renderBuild();
show("build");
