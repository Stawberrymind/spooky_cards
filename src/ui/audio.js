// All sound effects are synthesised with WebAudio, so there are no extra
// files to load. Music is the existing track in assets/audio.

let ac = null;
let master = null;
let enabled = true;
let volume = 0.8;

function ctx() {
  if (!ac) {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain();
    master.gain.value = 0.6 * volume;
    master.connect(ac.destination);
  }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}

export function setSound(on) {
  enabled = on;
}

/** Sound effects volume, 0–1. Zero switches them off entirely. */
export function setSoundVolume(v) {
  volume = Math.max(0, Math.min(1, v));
  enabled = volume > 0;
  if (master) master.gain.value = 0.6 * volume;
}

function tone({ freq = 440, type = 'square', dur = 0.12, vol = 0.2, slide = 0, delay = 0, attack = 0.005 }) {
  if (!enabled) return;
  const a = ctx();
  const t = a.currentTime + delay;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise({ dur = 0.08, vol = 0.2, freq = 2000, q = 1, delay = 0, type = 'bandpass' }) {
  if (!enabled) return;
  const a = ctx();
  const t = a.currentTime + delay;
  const len = Math.max(1, Math.floor(a.sampleRate * dur));
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = a.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

// A minor-ish scale so rising combos sound eerie rather than cheerful.
const SCALE = [0, 2, 3, 5, 7, 8, 11, 12, 14, 15, 17, 19, 20, 23, 24];
const note = (step, base = 220) => base * 2 ** (SCALE[Math.min(step, SCALE.length - 1)] / 12);

export const sfx = {
  pick() { noise({ dur: 0.05, vol: 0.18, freq: 3200, q: 2 }); },
  place() {
    noise({ dur: 0.07, vol: 0.25, freq: 1400, q: 1.5 });
    tone({ freq: 90, type: 'sine', dur: 0.09, vol: 0.25, slide: 0.6 });
  },
  flip() { noise({ dur: 0.11, vol: 0.14, freq: 5000, q: 0.8, type: 'highpass' }); },
  draw() { noise({ dur: 0.06, vol: 0.16, freq: 2600, q: 1.2 }); },
  shuffle() { for (let i = 0; i < 8; i++) noise({ dur: 0.05, vol: 0.12, freq: 2000 + i * 200, q: 1.5, delay: i * 0.035 }); },
  nope() { tone({ freq: 110, type: 'sawtooth', dur: 0.18, vol: 0.12, slide: 0.7 }); },
  foundation(combo) {
    tone({ freq: note(combo), type: 'square', dur: 0.16, vol: 0.12 });
    tone({ freq: note(combo) * 2, type: 'triangle', dur: 0.3, vol: 0.08, delay: 0.03 });
  },
  suitDone() {
    [0, 3, 7, 10].forEach((s, i) => tone({ freq: 110 * 2 ** (s / 12), type: 'sawtooth', dur: 0.9, vol: 0.07, delay: i * 0.06, attack: 0.05 }));
  },
  win() {
    [0, 3, 7, 12, 15, 19, 24].forEach((s, i) => tone({ freq: 220 * 2 ** (s / 12), type: 'square', dur: 0.4, vol: 0.09, delay: i * 0.09 }));
    tone({ freq: 55, type: 'sawtooth', dur: 2.2, vol: 0.12, attack: 0.3 });
  },
  whisper() {
    noise({ dur: 1.4, vol: 0.12, freq: 900, q: 6 });
    noise({ dur: 1.2, vol: 0.08, freq: 1700, q: 8, delay: 0.25 });
  },
  sting() {
    tone({ freq: 70, type: 'sawtooth', dur: 1.2, vol: 0.16, slide: 0.5, attack: 0.02 });
    tone({ freq: 1244, type: 'sine', dur: 0.8, vol: 0.05, slide: 1.06 });
  },
};

export function unlockAudio() {
  if (enabled) ctx();
}
