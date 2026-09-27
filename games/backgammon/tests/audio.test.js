import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const hashes = new Set();
for (const id of ['dice-a', 'dice-b', 'move-a', 'move-b']) {
  test(`${id}: valid, distinct, non-clipping PCM WAV with a silent head/tail`, async () => {
    const wav = await readFile(new URL(`../audio/${id}.wav`, import.meta.url));
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
    assert.equal(wav.readUInt32LE(4), wav.length - 8);
    assert.equal(wav.readUInt16LE(20), 1);
    assert.equal(wav.readUInt16LE(22), 1);
    assert.equal(wav.readUInt32LE(24), 44100);
    assert.equal(wav.readUInt16LE(34), 16);
    assert.equal(wav.readUInt32LE(40), wav.length - 44);
    assert.ok(Math.abs((wav.length - 44) / 2 / 44100 - (id.startsWith('dice') ? 1.32 : .28)) < .0001);
    let peak = 0;
    let squares = 0;
    for (let i = 44; i < wav.length; i += 2) { const value = wav.readInt16LE(i); peak = Math.max(peak, Math.abs(value)); squares += value * value; }
    assert.ok(peak > 16000 && peak < 22000);
    assert.ok(Math.sqrt(squares / ((wav.length - 44) / 2)) > 500);
    assert.equal(wav.readInt16LE(44), 0);
    assert.ok(Math.abs(wav.readInt16LE(wav.length - 2)) < 5);
    const hash = createHash('sha256').update(wav).digest('hex');
    assert.ok(!hashes.has(hash), 'each candidate must be different');
    hashes.add(hash);
  });
}
