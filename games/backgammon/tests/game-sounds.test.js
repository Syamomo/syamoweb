import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameSounds } from '../game-sounds.js';

function media() {
  return {
    readyState: 4, currentTime: 0, paused: true, starts: [],
    pause() { this.paused = true; },
    play() { this.starts.push(this.currentTime); this.paused = false; return Promise.resolve(); },
  };
}

test('rapid moves restart the same effect and reset stops both sounds', () => {
  const dice = media(), move = media();
  const sounds = createGameSounds({ dice, move });
  sounds.playDice();
  sounds.playMove();
  move.currentTime = .1;
  sounds.playMove();
  assert.deepEqual(move.starts, [0, 0]);
  assert.deepEqual(dice.starts, [0]);
  dice.currentTime = .8;
  sounds.stop();
  for (const player of [dice, move]) {
    assert.equal(player.paused, true);
    assert.equal(player.currentTime, 0);
  }
});

test('blocked playback is handled without an unhandled rejection', async () => {
  const dice = media(), move = media();
  dice.play = () => Promise.reject(new Error('Playback is blocked'));
  const sounds = createGameSounds({ dice, move });
  sounds.playDice();
  sounds.stop();
  await new Promise(resolve => setImmediate(resolve));
  sounds.playMove();
  assert.deepEqual(move.starts, [0]);
});

test('a failed media element cannot interrupt playback or stopping the other effect', () => {
  const dice = media(), move = media();
  dice.pause = () => { throw new Error('Device unavailable'); };
  const sounds = createGameSounds({ dice, move });
  assert.doesNotThrow(() => sounds.playDice());
  sounds.playMove();
  assert.equal(move.paused, false);
  assert.doesNotThrow(() => sounds.stop());
  assert.equal(move.paused, true);
});
