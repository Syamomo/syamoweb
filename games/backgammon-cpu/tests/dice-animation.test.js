import test from 'node:test';
import assert from 'node:assert/strict';
import { createDiceAnimator, ROLL_TIMING } from '../dice-animation.js';
import { createGame, rollOpening, rollDice } from '../engine.js';

function setup(onComplete = () => {}) {
  let now = 0;
  let serial = 0;
  const jobs = new Map();
  const callbacks = [];
  const frames = [];
  const results = [];
  const animator = createDiceAnimator({
    setTimer(callback, delay) {
      const id = ++serial;
      jobs.set(id, { at: now + delay, callback });
      callbacks.push(callback);
      return id;
    },
    clearTimer(id) { jobs.delete(id); },
    visualDie: () => 3,
    onFrame(frame) { frames.push(frame); },
    onComplete(dice) { results.push(dice); onComplete(dice); },
  });
  function advance(ms) {
    const end = now + ms;
    for (;;) {
      const next = [...jobs].filter(([, job]) => job.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) break;
      now = next[1].at;
      jobs.delete(next[0]);
      next[1].callback();
    }
    now = end;
  }
  return { animator, frames, results, jobs, callbacks, advance };
}

test('two faces roll, then stop individually at 720ms and 1080ms', () => {
  const t = setup();
  t.animator.start([2, 6]);
  assert.deepEqual(t.frames.at(-1).stopped, [false, false]);
  t.advance(ROLL_TIMING.frame);
  assert.notDeepEqual(t.frames[0].values, t.frames.at(-1).values);
  t.advance(ROLL_TIMING.first - ROLL_TIMING.frame);
  assert.deepEqual(t.frames.at(-1), { values: [2, 3], stopped: [true, false] });
  t.advance(ROLL_TIMING.frame);
  assert.equal(t.frames.at(-1).values[0], 2);
  assert.equal(t.frames.at(-1).stopped[1], false);
  t.advance(ROLL_TIMING.second - ROLL_TIMING.first - ROLL_TIMING.frame);
  assert.deepEqual(t.frames.at(-1), { values: [2, 6], stopped: [true, true] });
  assert.deepEqual(t.results, []);
  t.advance(ROLL_TIMING.complete - ROLL_TIMING.second);
  assert.deepEqual(t.results, [[2, 6]]);
  assert.equal(t.animator.active, false);
  assert.equal(t.jobs.size, 0);
});
test('repeated start cannot replace the already chosen dice', () => {
  const t = setup();
  t.animator.start([1, 4]);
  assert.equal(t.animator.start([6, 6]), false);
  t.advance(5000);
  assert.deepEqual(t.results, [[1, 4]]);
});
test('game remains unchanged until both dice have landed', () => {
  let game = createGame();
  const before = structuredClone(game);
  const t = setup(dice => { game = rollOpening(game, dice); });
  t.animator.start([5, 2]);
  t.advance(ROLL_TIMING.second);
  assert.deepEqual(game, before);
  t.advance(ROLL_TIMING.complete - ROLL_TIMING.second);
  assert.equal(game.turn, 'white');
  assert.deepEqual(game.remaining, [5, 2]);
});
test('opening ties remain ties, with no four-move double', () => {
  let game = createGame();
  const t = setup(dice => { game = rollOpening(game, dice); });
  t.animator.start([4, 4]); t.advance(ROLL_TIMING.complete);
  assert.equal(game.phase, 'opening');
  assert.deepEqual(game.remaining, []);
  t.animator.start([2, 5]); t.advance(ROLL_TIMING.complete);
  assert.equal(game.turn, 'black');
  assert.deepEqual(game.remaining, [2, 5]);
});
test('normal-turn doubles expand into four uses only after the animation', () => {
  let game = { ...createGame(), turn: 'black', phase: 'roll' };
  const t = setup(dice => { game = rollDice(game, dice); });
  t.animator.start([3, 3]); t.advance(ROLL_TIMING.first);
  assert.deepEqual(game.remaining, []);
  t.advance(ROLL_TIMING.complete - ROLL_TIMING.first);
  assert.deepEqual(game.remaining, [3, 3, 3, 3]);
});
test('reset cancellation clears timers and rejects even stale queued callbacks', () => {
  const t = setup();
  t.animator.start([4, 6]);
  t.advance(100);
  const stale = [...t.callbacks];
  t.animator.cancel();
  const frames = t.frames.length;
  stale.forEach(callback => callback());
  t.advance(5000);
  assert.equal(t.frames.length, frames);
  assert.equal(t.jobs.size, 0);
  assert.deepEqual(t.results, []);
});
test('a canceled roll never completes into a newly started game', () => {
  const t = setup();
  t.animator.start([6, 5]);
  const stale = [...t.callbacks];
  t.animator.cancel();
  t.animator.start([1, 2]);
  stale.forEach(callback => callback());
  t.advance(ROLL_TIMING.complete);
  assert.deepEqual(t.results, [[1, 2]]);
});
test('caller changes and old frames cannot change later frames or real dice', () => {
  const t = setup();
  const dice = [4, 2];
  t.animator.start(dice);
  dice[0] = 6;
  t.frames[0].values[0] = 1;
  t.frames[0].stopped[0] = true;
  t.advance(ROLL_TIMING.frame);
  assert.deepEqual(t.frames.at(-1).stopped, [false, false]);
  t.advance(ROLL_TIMING.complete);
  assert.deepEqual(t.results, [[4, 2]]);
});
test('invalid dice do not start or schedule an animation', () => {
  const t = setup();
  for (const dice of [[0, 2], [1, 7], [2], [3, 4, 5], [1.5, 3], null]) assert.throws(() => t.animator.start(dice));
  assert.equal(t.animator.active, false);
  assert.equal(t.jobs.size, 0);
});
