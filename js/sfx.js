// Launch sound effects, synthesized with Web Audio — no files, no deps.
// One AudioContext, lazily created on the first user gesture (the Launch click).
let ctx, master;
let enabled = true;

function init() {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.32;
  master.connect(ctx.destination);
}

export function resume() {
  init();
  if (ctx.state === "suspended") ctx.resume();
}
export function setEnabled(v) { enabled = v; }

// A pitched blip; optional glide to `to`, start after `delay`.
function tone(freq, dur, { type = "sine", vol = 0.3, to, delay = 0 } = {}) {
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

// Filtered white-noise burst — the body of rumbles, pops and booms.
function noise(dur, { vol = 0.4, lp = 1000, delay = 0 } = {}) {
  const t0 = ctx.currentTime + delay;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = lp;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t0);
  src.stop(t0 + dur);
}

const ready = () => {
  if (!enabled) return false;
  resume();
  return true;
};

export function beep() { if (ready()) tone(680, 0.12, { type: "square", vol: 0.22 }); }
export function liftoff() {
  if (!ready()) return;
  tone(900, 0.5, { type: "square", vol: 0.26, to: 1300 });
  noise(1.6, { vol: 0.5, lp: 520 }); // engine rumble
}
export function stageSep() {
  if (!ready()) return;
  noise(0.18, { vol: 0.5, lp: 900 });
  tone(220, 0.16, { type: "square", vol: 0.2, to: 70 });
}
export function fairing() {
  if (!ready()) return;
  noise(0.1, { vol: 0.3, lp: 1600 });
  tone(340, 0.14, { type: "triangle", vol: 0.18, to: 180 });
}
export function deploy() {
  if (!ready()) return;
  tone(880, 0.3, { type: "sine", vol: 0.24 });
  tone(1320, 0.4, { type: "sine", vol: 0.18, delay: 0.08 });
}
export function orbit() {
  if (!ready()) return;
  [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.35, { type: "triangle", vol: 0.2, delay: i * 0.12 }));
}
export function boom() {
  if (!ready()) return;
  noise(0.7, { vol: 0.7, lp: 380 });
  tone(130, 0.5, { type: "sawtooth", vol: 0.32, to: 40 });
}
