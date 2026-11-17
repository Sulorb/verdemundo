let ctx = null, master = null;
export function initAudio() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain(); master.gain.value = 0.35; master.connect(ctx.destination);
}
function tone(freq, dur, type = 'sine', vol = 0.3, slide = 0) {
  if (!ctx) return;
  const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol = 0.4, lp = 800) {
  if (!ctx) return;
  const n = Math.floor(ctx.sampleRate * dur), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  f.type = 'lowpass'; f.frequency.value = lp; g.gain.value = vol;
  s.buffer = b; s.connect(f); f.connect(g); g.connect(master); s.start();
}
let lastEat = 0;
export const sfx = {
  eat(combo, size) {
    if (!ctx || ctx.currentTime - lastEat < 0.035) return;
    lastEat = ctx.currentTime;
    const base = 330 * Math.pow(2, Math.min(combo, 24) / 12);
    tone(base / Math.max(1, size * 0.6), 0.09, 'triangle', 0.18);
  },
  gold() { tone(880, 0.08, 'square', 0.12); setTimeout(() => tone(1320, 0.12, 'square', 0.12), 70); },
  bombPick() { tone(220, 0.12, 'sawtooth', 0.12, 2); },
  throw() { tone(600, 0.25, 'sawtooth', 0.12, 0.3); },
  boom() { noise(0.7, 0.6, 500); tone(70, 0.6, 'sine', 0.5, 0.5); },
  hole() { tone(160, 0.5, 'sawtooth', 0.25, 0.25); noise(0.4, 0.3, 300); },
  landmark() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.25, 'triangle', 0.22), i * 90)); },
  level() { [392, 523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'square', 0.1), i * 70)); },
  death() { tone(300, 1.0, 'sawtooth', 0.25, 0.15); },
  camo() { tone(520, 1.2, 'sine', 0.2, 0.25); },
  warn() { [880, 660, 880].forEach((f, i) => setTimeout(() => tone(f, 0.12, 'square', 0.12), i * 140)); },
  event() { [659, 784, 659, 988].forEach((f, i) => setTimeout(() => tone(f, 0.15, 'triangle', 0.18), i * 110)); },
};
