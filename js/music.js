// Original trance loop, inspired by the driving minor-key arpeggio of
// "Exploration of Space". Synthesized live with Web Audio — no files, no deps.
// ponytail: fixed 4-chord loop; swap PROG / BPM to retune, no engine needed.

const BPM = 130;
const SPB = 60 / BPM; // seconds per beat
const S16 = SPB / 4; // seconds per 16th note
const AHEAD = 0.12; // schedule this far in advance
const TICK = 25; // scheduler wake-up (ms)

// i – VI – III – VII in A minor: the classic uplifting-trance progression.
const PROG = [
  { bass: 45, arp: [69, 72, 76, 81] }, // Am
  { bass: 41, arp: [65, 69, 72, 77] }, // F
  { bass: 48, arp: [72, 76, 79, 84] }, // C
  { bass: 43, arp: [67, 71, 74, 79] }, // G
];

const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

let ctx, master, timer;
let playing = false;
let step = 0;
let nextTime = 0;

function init() {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.16; // keep it in the background
  master.connect(ctx.destination);
}

function kick(t) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(50, t + 0.11);
  g.gain.setValueAtTime(0.9, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + 0.18);
}

function bass(t, midi) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  const f = ctx.createBiquadFilter();
  o.type = "sawtooth";
  o.frequency.value = mtof(midi);
  f.type = "lowpass";
  f.frequency.value = 420;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.5, t + 0.02);
  g.gain.setValueAtTime(0.5, t + SPB * 0.85);
  g.gain.exponentialRampToValueAtTime(0.001, t + SPB);
  o.connect(f).connect(g).connect(master);
  o.start(t);
  o.stop(t + SPB + 0.02);
}

function lead(t, midi) {
  const o = ctx.createOscillator();
  const o2 = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "square";
  o2.type = "sawtooth";
  o.frequency.value = mtof(midi);
  o2.frequency.value = mtof(midi) * 1.005; // slight detune for width
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.22, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.001, t + S16 * 0.9);
  o.connect(g);
  o2.connect(g);
  g.connect(master);
  o.start(t);
  o2.start(t);
  o.stop(t + S16);
  o2.stop(t + S16);
}

function scheduler() {
  while (nextTime < ctx.currentTime + AHEAD) {
    const bar = Math.floor(step / 16) % PROG.length;
    const s = step % 16;
    const ch = PROG[bar];
    if (s % 4 === 0) kick(nextTime);
    if (s === 0) bass(nextTime, ch.bass);
    // arpeggio lifts an octave in the second half of the bar for momentum
    lead(nextTime, ch.arp[s % 4] + (s >= 8 ? 12 : 0));
    step++;
    nextTime += S16;
  }
}

function start() {
  init();
  if (ctx.state === "suspended") ctx.resume();
  playing = true;
  nextTime = ctx.currentTime + 0.05;
  timer = setInterval(scheduler, TICK);
}

function stop() {
  playing = false;
  clearInterval(timer);
}

// Returns the new playing state so the caller can update its icon.
export function toggleMusic() {
  if (playing) stop();
  else start();
  return playing;
}

export function ensureStarted() {
  if (!playing) start();
}

export function isPlaying() {
  return playing;
}
