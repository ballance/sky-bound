// Inline SVG illustrations + spec lines for each part. No image files, no deps.
// ART_INNER holds the raw shapes (viewBox 0 0 40 56) so they can be reused both
// as catalog icons (partArt) and composed into a full rocket (rocketSVG).
import { PARTS } from "./parts.js";

const FALLBACK = `<rect x="10" y="10" width="20" height="36" rx="4" fill="#c7ccd6"/>`;

const ART_INNER = {
  bigEngine: `
    <rect x="13" y="5" width="14" height="11" rx="2" fill="#c7ccd6"/>
    <rect x="16" y="2" width="8" height="4" rx="1" fill="#9aa2ad"/>
    <path d="M12 16 L28 16 L35 46 L5 46 Z" fill="#8a9099"/>
    <path d="M12 16 L28 16 L31 30 L9 30 Z" fill="#aeb4be"/>
    <ellipse cx="20" cy="46" rx="15" ry="4" fill="#2f333c"/>
    <path d="M15 30 L25 30 L27 44 L13 44 Z" fill="#ff7a2a" opacity="0.55"/>`,
  smallEngine: `
    <rect x="16" y="8" width="8" height="9" rx="2" fill="#c7ccd6"/>
    <path d="M15 17 L25 17 L30 46 L10 46 Z" fill="#8a9099"/>
    <path d="M15 17 L25 17 L27 30 L13 30 Z" fill="#aeb4be"/>
    <ellipse cx="20" cy="46" rx="10" ry="3" fill="#2f333c"/>
    <path d="M16 30 L24 30 L25 44 L15 44 Z" fill="#4aa3ff" opacity="0.5"/>`,
  tank: `
    <rect x="9" y="7" width="22" height="42" rx="5" fill="#e9edf5"/>
    <ellipse cx="20" cy="7" rx="11" ry="3.5" fill="#f5f7fb"/>
    <ellipse cx="20" cy="49" rx="11" ry="3.5" fill="#cfd5e0"/>
    <rect x="9" y="24" width="22" height="6" fill="#c23b3b"/>
    <rect x="12" y="12" width="3" height="34" fill="#ffffff" opacity="0.5"/>`,
  bigTank: `
    <rect x="6" y="5" width="28" height="46" rx="6" fill="#e9edf5"/>
    <ellipse cx="20" cy="5" rx="14" ry="4" fill="#f5f7fb"/>
    <ellipse cx="20" cy="51" rx="14" ry="4" fill="#cfd5e0"/>
    <rect x="6" y="20" width="28" height="6" fill="#c23b3b"/>
    <rect x="6" y="32" width="28" height="6" fill="#c23b3b"/>
    <rect x="10" y="10" width="3" height="38" fill="#ffffff" opacity="0.5"/>`,
  probe: `
    <rect x="15" y="22" width="10" height="14" rx="1.5" fill="#c7ccd6"/>
    <rect x="3" y="26" width="11" height="6" fill="#2b6cd4"/>
    <rect x="26" y="26" width="11" height="6" fill="#2b6cd4"/>
    <line x1="14" y1="29" x2="26" y2="29" stroke="#8a9099" stroke-width="1"/>
    <path d="M13 15 A9 9 0 0 1 27 15 Z" fill="none" stroke="#9aa2ad" stroke-width="2"/>
    <circle cx="20" cy="14" r="2.2" fill="#9aa2ad"/>
    <line x1="20" y1="12" x2="20" y2="7" stroke="#9aa2ad" stroke-width="1.5"/>`,
  booster: `
    <path d="M20 3 L27 17 L27 44 L13 44 L13 17 Z" fill="#e9edf5"/>
    <path d="M20 3 L27 17 L13 17 Z" fill="#c23b3b"/>
    <path d="M13 44 L27 44 L24 53 L16 53 Z" fill="#8a9099"/>
    <rect x="14" y="22" width="12" height="4" fill="#c23b3b"/>`,
  parachute: `
    <path d="M5 24 A15 13 0 0 1 35 24 Z" fill="#ff7a2a"/>
    <path d="M15 24 A15 13 0 0 1 25 24 Z" fill="#ffd24a"/>
    <line x1="6" y1="24" x2="17" y2="40" stroke="#9aa2ad" stroke-width="1"/>
    <line x1="20" y1="24" x2="20" y2="40" stroke="#9aa2ad" stroke-width="1"/>
    <line x1="34" y1="24" x2="23" y2="40" stroke="#9aa2ad" stroke-width="1"/>
    <rect x="16" y="40" width="8" height="8" rx="1" fill="#c7ccd6"/>`,
  legs: `
    <rect x="16" y="6" width="8" height="26" rx="1.5" fill="#c7ccd6"/>
    <path d="M17 30 L6 48" stroke="#8a9099" stroke-width="3" fill="none"/>
    <path d="M23 30 L34 48" stroke="#8a9099" stroke-width="3" fill="none"/>
    <rect x="2" y="47" width="9" height="3" rx="1" fill="#5a6069"/>
    <rect x="29" y="47" width="9" height="3" rx="1" fill="#5a6069"/>`,
  fairing: `
    <path d="M20 3 C13 16 11 34 11 50 L29 50 C29 34 27 16 20 3 Z" fill="#eef1f7"/>
    <path d="M20 3 C13 16 11 34 11 50 L20 50 Z" fill="#dfe4ee"/>
    <line x1="20" y1="6" x2="20" y2="50" stroke="#b6bdcb" stroke-width="1"/>
    <line x1="11" y1="50" x2="29" y2="50" stroke="#c7ccd6" stroke-width="2"/>`,
};

const inner = (id) => ART_INNER[id] || FALLBACK;

export function partArt(id) {
  return `<svg viewBox="0 0 40 56" class="part-svg">${inner(id)}</svg>`;
}

// A side booster silhouette (nose cone + body + flared nozzle) centred at cx,
// standing on bottomY with height h. Used to flank the core radially.
function boosterShape(cx, bottomY, h) {
  const topY = bottomY - h;
  const nose = topY + 12;
  return (
    `<g>` +
    `<path d="M${cx} ${topY} L${cx + 6} ${nose} L${cx + 6} ${bottomY - 6} L${cx - 6} ${bottomY - 6} L${cx - 6} ${nose} Z" fill="#e9edf5"/>` +
    `<path d="M${cx} ${topY} L${cx + 6} ${nose} L${cx - 6} ${nose} Z" fill="#c23b3b"/>` +
    `<path d="M${cx - 6} ${bottomY - 6} L${cx - 8} ${bottomY} L${cx + 8} ${bottomY} L${cx + 6} ${bottomY - 6} Z" fill="#8a9099"/>` +
    `</g>`
  );
}

// Compose stacked part ids (bottom-first, as stored in `build`) into ONE rocket
// SVG matching the build. Side boosters attach radially to the core's base.
const STACK_STEP = 48; // vertical units per part (56 tall, ~8 overlap)
export function rocketSVG(ids) {
  if (!ids.length) return "";
  const isBooster = (id) => (PARTS[id] || {}).kind === "booster";
  const coreIds = ids.filter((id) => !isBooster(id));
  const boosters = ids.filter(isBooster).length;

  const topFirst = [...coreIds].reverse();
  const coreH = 56 + STACK_STEP * (Math.max(1, topFirst.length) - 1);
  const coreParts = topFirst
    .map((id, i) => `<g transform="translate(0,${i * STACK_STEP})">${inner(id)}</g>`)
    .join("");

  if (!boosters) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 ${coreH}" width="40" height="${coreH}">${coreParts}</svg>`;
  }

  const W = 96;
  const coreX = (W - 40) / 2; // centre the 40-wide core in the wider box
  const bH = Math.min(coreH * 0.6, coreH - 20);
  let boosterSvg = "";
  for (let i = 0; i < boosters; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const tier = Math.floor(i / 2);
    boosterSvg += boosterShape(coreX + 20 + side * (24 + tier * 12), coreH - 6 - tier * 10, bH - tier * 8);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${coreH}" width="${W}" height="${coreH}">${boosterSvg}<g transform="translate(${coreX},0)">${coreParts}</g></svg>`;
}

// Thrust like 1.05 MN / 380 kN
function thrust(n) {
  return n >= 1_000_000 ? `${(n / 1e6).toFixed(2)} MN` : `${Math.round(n / 1000)} kN`;
}
const kg = (n) => `${n.toLocaleString()} kg`;

export function partSpecs(id) {
  const p = PARTS[id];
  switch (p.kind) {
    case "engine":
      return `Thrust <b>${thrust(p.thrust)}</b> · Burn <b>${p.burn} kg/s</b>`;
    case "tank":
      return `Fuel <b>${kg(p.fuel)}</b> · Dry <b>${kg(p.mass)}</b>`;
    case "booster":
      return `Thrust <b>${thrust(p.thrust)}</b> · Fuel <b>${kg(p.fuel)}</b>`;
    case "probe":
      return `Control core · <b>${kg(p.mass)}</b>`;
    case "utility":
      return id === "parachute" ? `Safe landing · <b>${kg(p.mass)}</b>` : `Land upright · <b>${kg(p.mass)}</b>`;
    case "fairing":
      return `Shields payload · <b>${kg(p.mass)}</b>`;
    default:
      return kg(p.mass || 0);
  }
}
