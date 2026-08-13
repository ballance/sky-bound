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

// deterministic star field so it doesn't shimmer randomly each frame
const STARS = Array.from({ length: 90 }, (_, i) => ({
  x: (i * 97.13) % 1,
  y: (i * 61.7) % 1,
  s: 0.6 + ((i * 7) % 5) * 0.35,
}));

export function drawScene(ctx, state, rocket, cfg = CONFIG, frame = 0) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const mPerPx = 6; // vertical meters per pixel

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
  const top = mix(HIGH, SPACE, t);
  const bottom = mix(DAY, HIGH, t);
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, rgb(top));
  grad.addColorStop(1, rgb(bottom));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // --- stars fade in as you climb ---
  if (t > 0.05) {
    ctx.fillStyle = `rgba(255,255,255,${Math.min(1, t * 1.4)})`;
    for (const st of STARS) {
      ctx.globalAlpha = Math.min(1, t * 1.4) * (0.5 + 0.5 * Math.sin(frame * 0.05 + st.x * 30));
      ctx.fillRect(st.x * w, ((st.y + camShift / (h * 4)) % 1) * h, st.s, st.s);
    }
    ctx.globalAlpha = 1;
  }

  // --- ground + launch pad ---
  const groundY = h - GROUND_H + camShift;
  if (groundY < h) {
    ctx.fillStyle = "#3f6b2f";
    ctx.fillRect(0, groundY, w, h - groundY);
    ctx.fillStyle = "#2c4a21";
    ctx.fillRect(0, groundY, w, 4);
    ctx.fillStyle = "#555";
    ctx.fillRect(w / 2 - 26, groundY, 52, 8); // pad
  }

  // --- the rocket ---
  const tilt = pitch(state.altitude, cfg); // radians from vertical
  const thrusting = state.engineOn && state.fuel > 0 && state.stageIndex < rocket.stages.length;
  ctx.save();
  ctx.translate(w / 2, rocketY);
  ctx.rotate(tilt * 0.9); // lean over as it pitches
  drawRocket(ctx, thrusting, frame);
  ctx.restore();

  // --- deployed satellite drifts near the rocket ---
  if (state.deployed) {
    ctx.save();
    ctx.translate(w / 2 + 34, rocketY - 6);
    ctx.font = "18px system-ui";
    ctx.fillText("🛰️", -9, 6);
    ctx.restore();
  }

  // --- big status banner on end states ---
  if (state.status === "orbit") banner(ctx, w, "🛰️  ORBIT!  🛰️", "#7ef");
  else if (state.status === "landed") banner(ctx, w, "🪂  SAFE LANDING", "#8f8");
  else if (state.status === "crashed") banner(ctx, w, "💥  CRASH", "#f88");
}

function drawRocket(ctx, thrusting, frame) {
  // flame first (below the rocket) so the body sits on top
  if (thrusting) {
    const flick = 0.7 + 0.3 * Math.sin(frame * 0.9);
    const len = 26 * flick + (frame % 3);
    ctx.fillStyle = "#ffd24a";
    ctx.beginPath();
    ctx.moveTo(-6, 16);
    ctx.lineTo(6, 16);
    ctx.lineTo(0, 16 + len);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#ff7a2a";
    ctx.beginPath();
    ctx.moveTo(-3, 16);
    ctx.lineTo(3, 16);
    ctx.lineTo(0, 16 + len * 0.6);
    ctx.closePath();
    ctx.fill();
  }
  // body
  ctx.fillStyle = "#e9edf5";
  ctx.beginPath();
  ctx.moveTo(0, -22); // nose
  ctx.lineTo(7, -6);
  ctx.lineTo(7, 16);
  ctx.lineTo(-7, 16);
  ctx.lineTo(-7, -6);
  ctx.closePath();
  ctx.fill();
  // window
  ctx.fillStyle = "#4aa3ff";
  ctx.beginPath();
  ctx.arc(0, -2, 3.2, 0, Math.PI * 2);
  ctx.fill();
  // fins
  ctx.fillStyle = "#c23b3b";
  ctx.beginPath();
  ctx.moveTo(-7, 6); ctx.lineTo(-13, 18); ctx.lineTo(-7, 16); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(7, 6); ctx.lineTo(13, 18); ctx.lineTo(7, 16); ctx.fill();
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
