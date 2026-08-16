// Top-down orbit view. Exaggerated altitude: the angle is real, the radius is
// stretched so the orbit reads clearly outside a modest Earth. Pure drawing.
import { CONFIG } from "./config.js";
import { step, orbitElements2D } from "./orbit.js";

const STARS = Array.from({ length: 90 }, (_, i) => {
  const a = i * 2.399963; // golden-angle scatter, deterministic
  return { x: (Math.cos(a) * 0.5 + 0.5), y: (Math.sin(a * 1.7) * 0.5 + 0.5), s: (i % 3) ? 1 : 1.6 };
});

// real radius (m) -> screen radius (px): surface at EARTH_PX, altitude stretched
function screenR(r, cfg) { return cfg.EARTH_PX + ((r - cfg.R_EARTH) / cfg.ALT_REF) * cfg.ORBIT_GAP; }

function tracePath(body, cfg) {
  const els = orbitElements2D(body, cfg);
  const period = isFinite(els.period) ? els.period : 6000;
  const pts = [];
  const c = { ...body };
  const n = 128, pdt = period / n;
  for (let i = 0; i <= n; i++) {
    const r = Math.hypot(c.x, c.y), R = screenR(r, cfg), th = Math.atan2(c.y, c.x);
    pts.push([Math.cos(th) * R, Math.sin(th) * R]);
    step(c, pdt, cfg);
  }
  return pts;
}

export function drawOrbit(ctx, ship, sat, cfg = CONFIG, frame = 0) {
  const w = ctx.canvas.width, h = ctx.canvas.height, cx = w / 2, cy = h / 2;
  ctx.fillStyle = "#04060f"; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#8a93b5";
  for (const s of STARS) { ctx.globalAlpha = 0.5 + 0.4 * Math.sin(frame * 0.02 + s.x * 30); ctx.fillRect(s.x * w, s.y * h, s.s, s.s); }
  ctx.globalAlpha = 1;

  // Earth
  const g = ctx.createRadialGradient(cx - cfg.EARTH_PX * 0.3, cy - cfg.EARTH_PX * 0.3, cfg.EARTH_PX * 0.2, cx, cy, cfg.EARTH_PX);
  g.addColorStop(0, "#6fb0e6"); g.addColorStop(0.7, "#1f4f8c"); g.addColorStop(1, "#0e2a52");
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, cfg.EARTH_PX, 0, Math.PI * 2); ctx.fill();

  ctx.save(); ctx.translate(cx, cy);

  // deployed satellite path (solid, dim) + dot
  if (sat) {
    const sp = tracePath(sat, cfg);
    ctx.strokeStyle = "rgba(120,200,255,0.35)"; ctx.lineWidth = 1;
    ctx.beginPath(); sp.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    const sr = screenR(Math.hypot(sat.x, sat.y), cfg), sth = Math.atan2(sat.y, sat.x);
    ctx.fillStyle = "#7fd0ff"; ctx.beginPath(); ctx.arc(Math.cos(sth) * sr, Math.sin(sth) * sr, 3, 0, Math.PI * 2); ctx.fill();
  }

  // ship orbit path (dashed) + apo/peri markers
  const pts = tracePath(ship, cfg);
  ctx.setLineDash([4, 5]); ctx.strokeStyle = "#5aa0e0"; ctx.lineWidth = 1.4;
  ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
  ctx.setLineDash([]);
  // apoapsis = farthest point, periapsis = nearest point on the traced path
  let apoI = 0, periI = 0, dMax = 0, dMin = Infinity;
  pts.forEach(([x, y], i) => { const d = Math.hypot(x, y); if (d > dMax) { dMax = d; apoI = i; } if (d < dMin) { dMin = d; periI = i; } });
  const el = orbitElements2D(ship, cfg);
  const mark = (i, color, label) => {
    const [x, y] = pts[i];
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    ctx.font = "10px system-ui, sans-serif"; ctx.textAlign = x < 0 ? "right" : "left";
    ctx.fillText(label, x + (x < 0 ? -6 : 6), y + 3);
  };
  mark(apoI, "#ffd24a", `Apo ${(el.apo / 1000).toFixed(0)} km`);
  mark(periI, "#7fe0ff", `Peri ${(el.peri / 1000).toFixed(0)} km`);

  // the ship: a small triangle pointing along its velocity, with a prograde arrow
  const R = screenR(Math.hypot(ship.x, ship.y), cfg), th = Math.atan2(ship.y, ship.x);
  const px = Math.cos(th) * R, py = Math.sin(th) * R;
  const va = Math.atan2(ship.vy, ship.vx);
  ctx.save(); ctx.translate(px, py); ctx.rotate(va);
  ctx.fillStyle = "#e9edf5"; ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -3.5); ctx.lineTo(-4, 3.5); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "#37d67a"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(16, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(12, -3); ctx.lineTo(12, 3); ctx.closePath(); ctx.fillStyle = "#37d67a"; ctx.fill();
  ctx.restore();

  ctx.restore();
}
