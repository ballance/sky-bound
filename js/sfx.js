// Launch sound effects, synthesized with Web Audio — no files, no deps.
// One AudioContext, lazily created on the first user gesture (the Launch click).
let ctx, master;
let enabled = true;

function init() {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.4;
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

// Spoken launch callouts via the browser's built-in speech synthesis (no deps).
// Picks a male English voice and speaks low and steady, mission-control style.
let voice = null;
let voicePicked = false;
function pickMale(vs) {
  return (
    vs.find((v) => /male/i.test(v.name) && /^en/i.test(v.lang)) ||
    vs.find((v) => /(daniel|alex|fred|arthur|george|david|mark|guy|aaron|rishi)/i.test(v.name)) ||
    vs.find((v) => /^en/i.test(v.lang)) ||
    vs[0] ||
    null
  );
}
function ensureVoice() {
  if (voicePicked) return;
  const synth = window.speechSynthesis;
  if (!synth) return;
  const vs = synth.getVoices();
  if (vs.length) { voice = pickMale(vs); voicePicked = true; }
  else if (!synth.onvoiceschanged) synth.onvoiceschanged = () => { voice = pickMale(synth.getVoices()); voicePicked = true; };
}
// Sebastian's recorded voice: list the clip ids you've recorded as audio/<id>.mp3.
// A tagged line (speak(text, {clip:"ten"})) plays audio/ten.mp3 when its id is listed
// here; otherwise it falls back to the synthesized mission-control voice below.
// To add his voice to a line: record audio/<id>.mp3 and add "<id>" to this set.
const VOICE_CLIPS = new Set([
  // e.g. "ten", "nine", "eight", "seven", "ignition", "three", "two", "one", "liftoff",
]);
const CLIP_EXT = "wav"; // file format of the recordings — "wav" or "mp3" (both play fine)

let clip = null; // the currently-playing voice clip, so cancelSpeech can stop it
function playClip(id) {
  if (!enabled || !id || !VOICE_CLIPS.has(id)) return false;
  try {
    clip = new Audio(`audio/${id}.${CLIP_EXT}`);
    clip.volume = 1;
    clip.play().catch(() => {}); // autoplay policies satisfied once launch is clicked
    return true;
  } catch { return false; }
}

// Degrades silently where speechSynthesis or voices are unavailable.
export function speak(text, { rate = 0.95, pitch = 0.7, clip: clipId = null } = {}) {
  if (!enabled) return;
  if (playClip(clipId)) return; // Sebastian's voice for this line, when recorded
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    ensureVoice();
    const u = new SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice;
    u.rate = rate;
    u.pitch = pitch; // low, male mission-control tone
    u.volume = 1;
    synth.speak(u);
  } catch { /* no TTS available */ }
}
export function cancelSpeech() {
  try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
  try { if (clip) { clip.pause(); clip = null; } } catch { /* ignore */ }
}

// A loud, sustained engine rumble: filtered noise + a sub-bass tone, held on
// while the engines burn. setRumble(false) fades it out.
let rumble = null;
export function setRumble(on) {
  if (!enabled) return;
  resume();
  const t = ctx.currentTime;
  if (on && !rumble) {
    const dur = 1.0;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 170;
    const nGain = ctx.createGain();
    nGain.gain.value = 1.4;
    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.value = 42;
    const sGain = ctx.createGain();
    sGain.gain.value = 0.6;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(1.0, t + 0.6); // swell in
    src.connect(lp).connect(nGain).connect(env);
    sub.connect(sGain).connect(env);
    env.connect(master);
    src.start(t);
    sub.start(t);
    rumble = { src, sub, env };
  } else if (!on && rumble) {
    const { src, sub, env } = rumble;
    env.gain.cancelScheduledValues(t);
    env.gain.setValueAtTime(Math.max(0.0001, env.gain.value), t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    src.stop(t + 0.4);
    sub.stop(t + 0.4);
    rumble = null;
  }
}

export function liftoff() {
  if (!ready()) return; // punchy ignition; the sustained rumble carries the rest
  noise(0.5, { vol: 0.7, lp: 420 });
  tone(90, 0.5, { type: "sawtooth", vol: 0.4, to: 45 });
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
