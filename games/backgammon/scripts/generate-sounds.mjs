// Original, deterministic sound effects: damped resonances and filtered noise.
// No recordings, third-party samples, network calls, or synthesis dependencies.
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ROLL_TIMING } from '../dice-animation.js';

const sampleRate = 44100;
const root = new URL('../audio/', import.meta.url);
await mkdir(root, { recursive: true });

function noise(seed) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2147483648 - 1; };
}
function impact(buffer, time, strength, material, pitch, seed) {
  const random = noise(seed);
  const presets = {
    wood: { modes: [[510, .5, .017], [1140, .29, .012], [2270, .15, .006]], noise: .34, cut: .34, attack: .0008 },
    light: { modes: [[1060, .43, .012], [2480, .25, .008], [3900, .12, .004]], noise: .27, cut: .62, attack: .0005 },
    warm: { modes: [[430, .55, .023], [940, .3, .013], [1710, .12, .008]], noise: .3, cut: .25, attack: .001 },
    soft: { modes: [[235, .63, .032], [495, .26, .021], [860, .08, .012]], noise: .22, cut: .11, attack: .0018 },
  };
  const p = presets[material];
  const start = Math.round(time * sampleRate);
  const length = Math.round(.24 * sampleRate);
  let filtered = 0;
  for (let i = 0; i < length && start + i < buffer.length; i++) {
    const t = i / sampleRate;
    filtered += p.cut * (random() - filtered);
    const attack = 1 - Math.exp(-t / p.attack);
    const modes = p.modes.reduce((value, [frequency, weight, decay]) =>
      value + weight * Math.sin(2 * Math.PI * frequency * pitch * t) * Math.exp(-t / decay), 0);
    buffer[start + i] += strength * attack * (modes + p.noise * filtered * Math.exp(-t / .014));
  }
}

function rolling(variant) {
  const buffer = new Float32Array(Math.round(1.32 * sampleRate));
  const material = variant === 'a' ? 'wood' : 'light';
  // Two slightly different streams, with separate final landings matching the animation.
  const times = [
    [.025, .071, .126, .198, .285, .392, .517, .628, ROLL_TIMING.first / 1000],
    [.045, .099, .166, .245, .348, .471, .606, .765, .916, ROLL_TIMING.second / 1000],
  ];
  times.forEach((stream, die) => stream.forEach((time, i) => {
    const final = i === stream.length - 1;
    const amplitude = final ? .76 : .35 + .12 * Math.sin(i * 1.9 + die);
    impact(buffer, time, amplitude, material, 1 + die * .17 + Math.sin(i * 2.7) * .07, 914 + i * 137 + die * 59);
    if (!final && i < 5) impact(buffer, time + .015, amplitude * .29, material, 1.18 + die * .09, 38 + i * 53);
  }));
  return buffer;
}
function moving(variant) {
  const buffer = new Float32Array(Math.round(.28 * sampleRate));
  if (variant === 'a') {
    impact(buffer, .014, .9, 'warm', 1, 208);
    impact(buffer, .040, .15, 'wood', 1.16, 510);
  } else {
    impact(buffer, .014, 1.04, 'soft', 1, 305);
    impact(buffer, .033, .07, 'warm', .82, 412);
  }
  return buffer;
}

function encode(samples, targetPeak) {
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  const gain = targetPeak / peak;
  const wav = Buffer.alloc(44 + samples.length * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36);
  wav.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) wav.writeInt16LE(Math.round(samples[i] * gain * 32767), 44 + i * 2);
  return wav;
}

for (const variant of ['a', 'b']) {
  for (const [kind, samples, peak] of [['dice', rolling(variant), .63], ['move', moving(variant), .60]]) {
    const path = new URL(`${kind}-${variant}.wav`, root);
    await writeFile(path, encode(samples, peak));
    console.log(`${fileURLToPath(path)} (${(samples.length / sampleRate).toFixed(2)}s)`);
  }
}
