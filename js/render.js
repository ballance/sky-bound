// Draws a sim `state` to the canvas — the side-view launch you watch.
// This is the part a future game engine would replace. No game logic here.
import { CONFIG } from "./config.js";
import { pitch } from "./sim.js";

const GROUND_H = 38;

const lerp = (a, b, t) => a + (b - a) * t;
function mix(c1, c2, t) {
  return [0, 1, 2].map((i) => Math.round(lerp(c1[i], c2[i], t)));
}
const rgb = ([r, g, b]) => `rgb(${r},${g},${b})`;

const DAY = [126, 200, 227]; // horizon blue
const HIGH = [27, 42, 94]; // upper atmosphere
const SPACE = [5, 6, 15]; // black of space

// Randomized once so the field is varied but stable frame-to-frame (no shimmer
// from regenerating positions). Varied size, brightness, twinkle and color.
function starColor(tint) {
  if (tint > 0.86) return "220,228,255"; // blue-white
  if (tint < 0.14) return "255,236,208"; // warm
  return "255,255,255";
}
const STARS = Array.from({ length: 150 }, () => ({
  x: Math.random(),
  y: Math.random(),
  s: 0.5 + Math.random() * Math.random() * 2.6, // biased small, a few big
  base: 0.35 + Math.random() * 0.5,
  tw: 0.015 + Math.random() * 0.075, // twinkle speed
  ph: Math.random() * Math.PI * 2, // twinkle phase
  col: starColor(Math.random()),
}));

// ---- stage/fairing separation effects (screen-space, short-lived) ----
let effects = [];
let prevStage = 0;
let prevFairing = false;
let prevStatus = "ready";
let deployFrame = null; // frame the satellite was released, for the drift animation
let boosterCam = null; // { t } — SpaceX-style first-stage landing inset

export function resetEffects() {
  effects = [];
  prevStage = 0;
  prevFairing = false;
  prevStatus = "ready";
  deployFrame = null;
  boosterCam = null;
}

// Open the booster-cam: the separated first stage flies itself back to a droneship.
export function startBoosterRecovery() {
  boosterCam = { t: 0 };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// A slim first stage: base at (x,y), body up, optional landing burn + legs.
function drawMiniBooster(ctx, x, y, burning, legsOut, t) {
  ctx.save();
  ctx.translate(x, y);
  if (burning) {
    const fl = 8 + (t % 3) * 2;
    ctx.fillStyle = "#ffd24a";
    ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(3, 0); ctx.lineTo(0, fl); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#ff7a2a";
    ctx.beginPath(); ctx.moveTo(-1.6, 0); ctx.lineTo(1.6, 0); ctx.lineTo(0, fl * 0.6); ctx.closePath(); ctx.fill();
  }
  if (legsOut) {
    ctx.strokeStyle = "#8a9099";
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(-4, -2); ctx.lineTo(-9, 1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(4, -2); ctx.lineTo(9, 1); ctx.stroke();
  }
  ctx.fillStyle = "#e9edf5";
  ctx.fillRect(-4, -34, 8, 34);
  ctx.fillStyle = "#c23b3b";
  ctx.fillRect(-4, -34, 8, 4); // interstage band
  ctx.fillStyle = "#9aa2ad";
  ctx.fillRect(-4, -3, 8, 3); // engine section
  ctx.restore();
}

// The booster-cam inset: sky, sea, droneship, and the stage flying itself down.
function drawBoosterCam(ctx, w, h) {
  if (!boosterCam) return;
  const cam = boosterCam;
  cam.t += 1;
  const pw = 156, ph = 190, px = 12, py = h - ph - 12;

  ctx.save();
  roundRect(ctx, px, py, pw, ph, 10);
  ctx.fillStyle = "#05070f";
  ctx.fill();
  ctx.clip();

  const sky = ctx.createLinearGradient(0, py, 0, py + ph);
  sky.addColorStop(0, "#1b2a5e");
  sky.addColorStop(0.68, "#3a6ea5");
  sky.addColorStop(1, "#123a5f");
  ctx.fillStyle = sky;
  ctx.fillRect(px, py, pw, ph);
  ctx.fillStyle = "#0f2742"; // sea
  ctx.fillRect(px, py + ph - 32, pw, 32);

  const deckW = 68, deckX = px + pw / 2 - deckW / 2, deckY = py + ph - 40;
  ctx.fillStyle = "#22262e";
  ctx.fillRect(deckX, deckY, deckW, 12);
  ctx.fillStyle = "#3a3f4a";
  ctx.fillRect(deckX, deckY, deckW, 3);
  ctx.strokeStyle = "#c7ccd6"; // the landing X
  ctx.lineWidth = 1.5;
  const mx = deckX + deckW / 2;
  ctx.beginPath(); ctx.moveTo(mx - 6, deckY - 7); ctx.lineTo(mx + 6, deckY + 1); ctx.moveTo(mx + 6, deckY - 7); ctx.lineTo(mx - 6, deckY + 1); ctx.stroke();

  const topY = py + 30;
  const landY = deckY - 2; // booster base rests on the deck (legs touch the X)
  const midY = topY + 0.62 * (landY - topY);
  const LAND = 360; // frames to touchdown (~6s): free-fall, then a landing burn
  let by;
  if (cam.t < 180) {
    const u = cam.t / 180;
    by = topY + u * u * (midY - topY); // falling, accelerating
  } else if (cam.t < LAND) {
    const u = (cam.t - 180) / 180;
    by = midY + (1 - (1 - u) * (1 - u)) * (landY - midY); // burn, decelerating to the deck
  } else {
    by = landY;
  }
  const landed = cam.t >= LAND;
  drawMiniBooster(ctx, mx, by, cam.t > 168 && !landed, cam.t > LAND - 60, cam.t);
  if (cam.t >= LAND - 4 && cam.t < LAND + 50) { // touchdown dust
    const a = 1 - (cam.t - (LAND - 4)) / 54;
    ctx.fillStyle = `rgba(220,225,235,${a * 0.5})`;
    for (const dx of [-16, -7, 7, 16]) {
      ctx.beginPath();
      ctx.arc(mx + dx, deckY, 3 + (cam.t - (LAND - 4)) * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(px, py, pw, 16);
  ctx.fillStyle = cam.t % 40 < 20 ? "#ff5a5a" : "#9fd4ff";
  ctx.font = "bold 9px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("● BOOSTER CAM", px + 6, py + 11);
  if (landed) {
    ctx.fillStyle = "#37d67a";
    ctx.font = "bold 13px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("✓ RECOVERED", px + pw / 2, py + 15 + (ph - 15) / 2 + 4);
  }
  ctx.strokeStyle = "#33407a";
  ctx.lineWidth = 1.5;
  roundRect(ctx, px, py, pw, ph, 10);
  ctx.stroke();
  ctx.restore();
  // the cam stays up (showing ✓ RECOVERED) for the rest of the flight; cleared on reset
}

// A released satellite: body, dish, and solar panels that unfold after deploy.
function drawSatellite(ctx, x, y, age) {
  const panel = Math.min(age * 0.5, 13); // panels extend over the first ~26 frames
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#2b6cd4";
  ctx.fillRect(-6 - panel, -3, panel, 6);
  ctx.fillRect(6, -3, panel, 6);
  ctx.fillStyle = "#c7ccd6";
  ctx.fillRect(-6, -6, 12, 12);
  ctx.fillStyle = "#9aa2ad";
  ctx.beginPath(); ctx.arc(0, -9, 3.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#5a6270";
  ctx.beginPath(); ctx.arc(0, -9, 1.4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function spawnPuff(x, y, n) {
  for (let i = 0; i < n; i++) {
    effects.push({
      type: "smoke", x, y,
      vx: (Math.random() - 0.5) * 2.6,
      vy: (Math.random() - 0.35) * 2,
      r: 3 + Math.random() * 4,
      grow: 0.5 + Math.random() * 0.6,
      life: 26 + ((Math.random() * 12) | 0), max: 40,
    });
  }
}
function spawnStageSep(x, y) {
  spawnPuff(x, y, 10);
  // the spent stage tumbles away downward
  effects.push({
    type: "chunk", x, y: y - 4,
    vx: (Math.random() - 0.5) * 1.6, vy: 1.1,
    rot: 0, vr: (Math.random() - 0.5) * 0.36,
    w: 16, h: 26, life: 75, max: 75,
  });
}
function spawnFairingSep(x, y) {
  spawnPuff(x, y, 6);
  // two halves split apart and arc away
  effects.push({ type: "half", dir: -1, x: x - 3, y, vx: -2.4, vy: -0.6, rot: 0, vr: -0.17, life: 75, max: 75 });
  effects.push({ type: "half", dir: 1, x: x + 3, y, vx: 2.4, vy: -0.6, rot: 0, vr: 0.17, life: 75, max: 75 });
}

// Rapid Unscheduled Disassembly: the whole rocket bursts into fire + debris.
function spawnExplosion(x, y) {
  spawnPuff(x, y, 20);
  for (let i = 0; i < 12; i++) {
    effects.push({
      type: "chunk", x, y,
      vx: (Math.random() - 0.5) * 7, vy: (Math.random() - 0.7) * 7,
      rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.7,
      w: 5 + Math.random() * 11, h: 7 + Math.random() * 17,
      life: 55 + ((Math.random() * 35) | 0), max: 90,
    });
  }
  for (let i = 0; i < 16; i++) {
    effects.push({
      type: "fire", x, y,
      vx: (Math.random() - 0.5) * 4.5, vy: (Math.random() - 0.6) * 4.5,
      r: 3 + Math.random() * 6, grow: -0.06,
      life: 16 + ((Math.random() * 16) | 0), max: 34,
    });
  }
}

function updateEffects() {
  for (const e of effects) {
    e.x += e.vx;
    e.y += e.vy;
    e.vy += 0.05; // gravity
    if (e.rot !== undefined) e.rot += e.vr;
    if (e.grow) e.r += e.grow;
    e.life--;
  }
  effects = effects.filter((e) => e.life > 0);
}
function drawEffects(ctx) {
  for (const e of effects) {
    const a = e.life / e.max;
    if (e.type === "smoke") {
      ctx.fillStyle = `rgba(206,211,222,${a * 0.5})`;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
      ctx.fill();
    } else if (e.type === "chunk") {
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.rot);
      ctx.globalAlpha = Math.min(1, a * 1.5);
      ctx.fillStyle = "#8a9099";
      ctx.fillRect(-e.w / 2, -e.h / 2, e.w, e.h);
      ctx.fillStyle = "#c7ccd6";
      ctx.fillRect(-e.w / 2, -e.h / 2, e.w, 4);
      ctx.fillStyle = "#2f333c"; // spent nozzle
      ctx.beginPath();
      ctx.ellipse(0, e.h / 2, e.w / 2, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
    } else if (e.type === "fire") {
      ctx.fillStyle = `rgba(255,${120 + Math.floor(120 * a)},40,${a})`;
      ctx.beginPath();
      ctx.arc(e.x, e.y, Math.max(0, e.r), 0, Math.PI * 2);
      ctx.fill();
    } else if (e.type === "half") {
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.rot);
      ctx.globalAlpha = Math.min(1, a * 1.5);
      ctx.fillStyle = "#e9edf5";
      ctx.beginPath();
      ctx.moveTo(0, -16);
      ctx.quadraticCurveTo(e.dir * 10, -2, e.dir * 9, 14);
      ctx.lineTo(0, 14);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }
}

function drawMoon(ctx, w, h, t) {
  const mx = w * 0.76;
  const my = h * 0.16; // effectively infinitely far — fixed in the sky
  const r = 24;
  const vis = 0.35 + 0.65 * t; // faint by day, bright in space
  ctx.save();
  ctx.globalAlpha = vis;
  const glow = ctx.createRadialGradient(mx, my, r * 0.6, mx, my, r * 2.2);
  glow.addColorStop(0, "rgba(232,236,246,0.35)");
  glow.addColorStop(1, "rgba(232,236,246,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(mx, my, r * 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#d9dde6";
  ctx.beginPath();
  ctx.arc(mx, my, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#c2c7d2";
  for (const [cx, cy, cr] of [[-8, -6, 5], [6, -9, 3], [9, 6, 4], [-4, 9, 3], [-11, 4, 2.5], [2, 1, 2.2]]) {
    ctx.beginPath();
    ctx.arc(mx + cx, my + cy, cr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Kennedy Space Center Launch Complex 39A, stylized: concrete deck + flame
// trench, the dark Fixed Service Structure, crew access arm, the leaning
// transporter-erector, a SPACEX water tower, and lightning masts. Anchored at
// the ground line `y`, drawn in the fixed 560-wide canvas space.
function drawPad(ctx, w, y) {
  const cx = w / 2;

  // water tower (far left): sphere on braced legs with a readable SkyBound label
  const wx = cx - 168;
  const wtop = y - 112; // sphere centre
  ctx.strokeStyle = "#c8ccd4";
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(wx - 16, y); ctx.lineTo(wx - 4, wtop + 14); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(wx + 16, y); ctx.lineTo(wx + 4, wtop + 14); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(wx - 11, y - 46); ctx.lineTo(wx + 11, y - 46); ctx.stroke(); // cross-brace
  ctx.fillStyle = "#eef1f7";
  ctx.beginPath(); ctx.arc(wx, wtop, 25, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#5a6270";
  ctx.font = "bold 7.5px system-ui, sans-serif"; // sits inside the sphere with margin
  ctx.textAlign = "center";
  ctx.fillText("SkyBound", wx, wtop + 2.5);

  // lightning mast (far right): tall mast with guy wires
  const lx = cx + 172;
  ctx.fillStyle = "#cfd3db";
  ctx.fillRect(lx - 2, y - 158, 4, 158);
  ctx.strokeStyle = "#9aa2ad";
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(lx, y - 154); ctx.lineTo(lx - 22, y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(lx, y - 154); ctx.lineTo(lx + 22, y); ctx.stroke();

  // concrete pad deck + flame trench under the rocket
  ctx.fillStyle = "#9a9488";
  ctx.fillRect(cx - 120, y - 9, 240, 16);
  ctx.fillStyle = "#6f6a60";
  ctx.fillRect(cx - 120, y - 9, 240, 4);
  ctx.fillStyle = "#17171b";
  ctx.fillRect(cx - 23, y - 6, 46, 13); // trench opening

  // Fixed Service Structure — dark steel lattice tower, left of the rocket
  const tx = cx - 98;
  const tw = 40;
  const tTop = y - 214;
  ctx.fillStyle = "#2b2b30";
  ctx.fillRect(tx, tTop, tw, y - tTop);
  ctx.strokeStyle = "#474751";
  ctx.lineWidth = 1.2;
  for (let yy = tTop + 8; yy < y - 2; yy += 16) {
    ctx.beginPath(); ctx.moveTo(tx, yy); ctx.lineTo(tx + tw, yy + 11); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(tx + tw, yy); ctx.lineTo(tx, yy + 11); ctx.stroke();
  }
  ctx.fillStyle = "#3a3a41"; // top platform
  ctx.fillRect(tx - 6, tTop, tw + 12, 11);
  ctx.fillStyle = "#d8dbe2"; // hammerhead lightning mast
  ctx.fillRect(tx + tw / 2 - 2, tTop - 60, 4, 60);

  // Crew Access Arm — white beam reaching from the tower to the rocket
  ctx.fillStyle = "#e9edf5";
  ctx.fillRect(tx + tw, y - 150, cx - 14 - (tx + tw), 9);
}

export function drawScene(ctx, state, rocket, cfg = CONFIG, frame = 0, rocketImg = null) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  // Fixed scale: the rocket lifts off, then the camera pins it near the top and
  // scrolls the world past — so it stays on-screen at any altitude. (An earlier
  // altitude-adaptive scale zoomed out in lock-step with the climb and made the
  // rocket appear stuck on the pad; the camera-follow below already handles range.)
  const mPerPx = 6;

  // --- camera: rocket lifts off the pad, then the camera follows it up ---
  const ceil = h * 0.35;
  let rocketY = h - GROUND_H - state.altitude / mPerPx;
  let camShift = 0;
  if (rocketY < ceil) {
    camShift = ceil - rocketY;
    rocketY = ceil;
  }

  // --- sky: blue near the ground, fading to black space with altitude ---
  const t = Math.min(1, state.altitude / cfg.SPACE_ALT);
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, rgb(mix(HIGH, SPACE, t)));
  grad.addColorStop(1, rgb(mix(DAY, HIGH, t)));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // --- stars twinkle in and grow brighter as you climb ---
  const fade = Math.min(1, t * 1.5);
  if (fade > 0.02) {
    // stars drift opposite our sideways travel (parallax) as the rocket pitches over
    const drift = (state.xDist || 0) * 0.008;
    for (const st of STARS) {
      const a = fade * st.base * (0.55 + 0.45 * Math.sin(frame * st.tw + st.ph));
      ctx.fillStyle = `rgba(${st.col},${a})`;
      const sx = (((st.x * w - drift) % w) + w) % w;
      const sy = ((st.y + camShift * 0.00022) % 1) * h;
      ctx.fillRect(sx, sy, st.s, st.s);
      if (st.s > 2) { // faint glint on the big ones
        ctx.fillStyle = `rgba(${st.col},${a * 0.4})`;
        ctx.fillRect(sx - st.s, sy + st.s / 2, st.s * 3, 0.6);
        ctx.fillRect(sx + st.s / 2, sy - st.s, 0.6, st.s * 3);
      }
    }
  }

  // --- the moon (for Sebastian) ---
  drawMoon(ctx, w, h, t);

  // --- ground + KSC Pad 39A (structures poke above the ground line) ---
  const groundY = h - GROUND_H + camShift;
  if (groundY < h + 320) {
    if (groundY < h) {
      ctx.fillStyle = "#3f6b2f"; // Florida scrub
      ctx.fillRect(0, groundY, w, h - groundY);
      ctx.fillStyle = "#2c4a21";
      ctx.fillRect(0, groundY, w, 4);
    }
    drawPad(ctx, w, groundY);
  }

  // --- the rocket: the actual assembled build, rasterized from its part art ---
  const tilt = pitch(state.altitude, cfg) * 0.9; // lean over as it pitches
  const thrusting = state.engineOn && state.fuel > 0 && state.stageIndex < rocket.stages.length;
  const wrecked = state.status === "crashed" || state.status === "aborted";
  const loaded = rocketImg && rocketImg.complete && rocketImg.naturalWidth;
  let dh = 60;
  if (loaded) {
    const n = Math.max(1, Math.round((rocketImg.naturalHeight - 8) / 48)); // parts stacked
    dh = 34 + 26 * n; // taller rockets draw bigger
  }
  if (loaded && !wrecked) {
    const dw = dh * (rocketImg.naturalWidth / rocketImg.naturalHeight);
    ctx.save();
    ctx.translate(w / 2, rocketY);
    ctx.rotate(tilt);
    if (thrusting) drawFlame(ctx, frame);
    ctx.drawImage(rocketImg, -dw / 2, -dh, dw, dh); // engine base sits at y=0
    ctx.restore();
  }

  // --- aero heating glow on the leading edge (scales with nose temperature) ---
  if ((state.noseTemp || 0) > 600 && !state.chuteOpen) {
    const heat = Math.min(1, (state.noseTemp - 600) / 900);
    const gy = rocketY + 8;
    const r = 18 + heat * 18;
    const glow = ctx.createRadialGradient(w / 2, gy, 2, w / 2, gy, r);
    glow.addColorStop(0, `rgba(255,210,110,${0.85 * heat})`);
    glow.addColorStop(0.5, `rgba(255,110,45,${0.55 * heat})`);
    glow.addColorStop(1, "rgba(255,70,25,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(w / 2, gy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  if (state.chuteOpen) drawParachute(ctx, w / 2, rocketY - dh, frame);

  // --- separation & disassembly effects: spawn on the transition, then animate ---
  if (state.stageIndex > prevStage) spawnStageSep(w / 2, rocketY);
  prevStage = state.stageIndex;
  if (state.fairingJettisoned && !prevFairing) spawnFairingSep(w / 2, rocketY - dh);
  prevFairing = state.fairingJettisoned;
  if (wrecked && prevStatus !== "crashed" && prevStatus !== "aborted") {
    spawnExplosion(w / 2, rocketY - dh / 2);
  }
  prevStatus = state.status;
  updateEffects();
  drawEffects(ctx);

  // --- deployed satellite: releases from the nose (top) and drifts ahead ---
  if (state.deployed) {
    if (deployFrame == null) deployFrame = frame;
    const age = frame - deployFrame;
    const off = Math.min(age * 0.7, 140); // drift just clear of the nose, then float
    // the rocket's nose, accounting for its pitch-over tilt
    const noseX = w / 2 + dh * Math.sin(tilt);
    const noseY = rocketY - dh * Math.cos(tilt);
    drawSatellite(ctx, noseX + Math.sin(tilt) * off, noseY - Math.cos(tilt) * off, age);
  } else {
    deployFrame = null;
  }

  // --- big status banner ---
  if (state.status === "aborted") banner(ctx, w, "💥  R.U.D.!", "#f88");
  else if (state.status === "crashed") banner(ctx, w, "💥  CRASH", "#f88");
  else if (state.status === "landed") banner(ctx, w, "🪂  SAFE LANDING", "#8f8");
  else if (state.reentering && state.chuteOpen) banner(ctx, w, "🪂  CHUTES OUT", "#ffd27a");
  else if (state.reentering) banner(ctx, w, "🔥  RE-ENTRY", "#ffb060");
  else if (state.orbited) banner(ctx, w, "🛰️  ORBIT!  🛰️", "#7ef");

  drawBoosterCam(ctx, w, h); // first-stage recovery inset (when active)
}

// Engine exhaust, drawn from the base (y=0) downward in the rocket's frame.
function drawFlame(ctx, frame) {
  const flick = 0.7 + 0.3 * Math.sin(frame * 0.9);
  const len = (22 * flick + (frame % 3)) * 3; // 3x longer plume
  ctx.fillStyle = "#ffd24a";
  ctx.beginPath();
  ctx.moveTo(-16, 0); ctx.lineTo(16, 0); ctx.lineTo(0, len); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#ff7a2a";
  ctx.beginPath();
  ctx.moveTo(-9, 0); ctx.lineTo(9, 0); ctx.lineTo(0, len * 0.6); ctx.closePath(); ctx.fill();
}

// A swaying parachute canopy above the descending stage (nose at topY).
function drawParachute(ctx, x, topY, frame) {
  const cx = x + Math.sin(frame * 0.06) * 4;
  const chuteY = topY - 50;
  const cw = 46;
  ctx.strokeStyle = "#c8ccd4";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - 6, topY); ctx.lineTo(cx - cw / 2, chuteY);
  ctx.moveTo(x + 6, topY); ctx.lineTo(cx + cw / 2, chuteY);
  ctx.moveTo(x, topY); ctx.lineTo(cx, chuteY);
  ctx.stroke();
  ctx.fillStyle = "#ff7a2a";
  ctx.beginPath();
  ctx.moveTo(cx - cw / 2, chuteY);
  ctx.quadraticCurveTo(cx, chuteY - 34, cx + cw / 2, chuteY);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#ffd24a";
  ctx.beginPath();
  ctx.moveTo(cx - 9, chuteY);
  ctx.quadraticCurveTo(cx, chuteY - 28, cx + 9, chuteY);
  ctx.closePath();
  ctx.fill();
}

function banner(ctx, w, text, color) {
  ctx.save();
  ctx.font = "bold 26px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(0, 24, w, 44);
  ctx.fillStyle = color;
  ctx.fillText(text, w / 2, 55);
  ctx.restore();
}
