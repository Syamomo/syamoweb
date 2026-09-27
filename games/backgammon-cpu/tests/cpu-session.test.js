import test from 'node:test';
import assert from 'node:assert/strict';
import { createCpuSession } from '../cpu-session.js';
import { createGame, rollOpening, rollDice, playMove, legalTurns, finishTurn } from '../engine.js';

function setup(initial = rollOpening(createGame(), [1, 6])) {
  let state = initial, paused = false, level = 'pro', now = 0, timerId = 0;
  const workers = [], jobs = new Map(), callbacks = [], calls = [], errors = [];
  const cpu = createCpuSession({
    getState: () => state, getLevel: () => level, isPaused: () => paused,
    onRoll() { calls.push('roll'); state = rollDice(state, [3, 4]); },
    onMove(move) { calls.push('move'); state = playMove(state, move); cpu.pump(); },
    onFinish() { calls.push('finish'); state = finishTurn(state); cpu.pump(); },
    onStatus() {}, onError: error => errors.push(error.message),
    createWorker() {
      const w = { terminated: false, postMessage(data) { this.request = data; }, terminate() { this.terminated = true; } };
      workers.push(w); return w;
    },
    setTimer(fn, ms) { const id = ++timerId; jobs.set(id, { fn, at: now + ms }); callbacks.push(fn); return id; },
    clearTimer: id => jobs.delete(id),
  });
  return { cpu, calls, errors, workers, callbacks,
    get state() { return state; }, set state(s) { state = s; }, set paused(p) { paused = p; }, set level(v) { level = v; },
    reply(w = workers.at(-1), moves = legalTurns(state)[0].moves) { w.onmessage({ data: { id: w.request.id, moves } }); },
    advance(ms) { const end = now + ms; for (;;) {
      const next = [...jobs].filter(([, j]) => j.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = next[1].at; jobs.delete(next[0]); next[1].fn();
    } now = end; },
  };
}

test('opening CPU turn uses existing dice, moves stepwise, then hands control to white', () => {
  const t = setup(); t.cpu.pump(); t.cpu.pump();
  assert.equal(t.workers.length, 1);
  assert.deepEqual(t.workers[0].request.state.rolled, [1, 6]);
  assert.deepEqual(t.workers[0].request.state.history, []);
  t.reply(); t.advance(549); assert.deepEqual(t.calls, []);
  t.advance(1); assert.deepEqual(t.calls, ['move']);
  t.advance(2000); assert.deepEqual(t.calls, ['move', 'move', 'finish']);
  assert.equal(t.state.turn, 'white'); assert.equal(t.state.phase, 'roll');
});

test('CPU rolls exactly once despite repeated render notifications', () => {
  const t = setup({ ...createGame(), turn: 'black', phase: 'roll' });
  t.cpu.pump(); t.cpu.pump(); t.advance(1000);
  assert.deepEqual(t.calls, ['roll']); assert.deepEqual(t.state.rolled, [3, 4]);
  t.cpu.pump(); assert.equal(t.workers.length, 1);
});

test('no automatic actions before opening, during human turn, or after game over', () => {
  for (const s of [createGame(), rollOpening(createGame(), [6, 1]), { ...createGame(), turn: 'black', phase: 'finished' }]) {
    const t = setup(s); t.cpu.pump(); t.advance(5000);
    assert.equal(t.workers.length, 0); assert.deepEqual(t.calls, []);
  }
});

test('reset during thinking terminates worker and ignores stale success/error replies', () => {
  const t = setup(); t.cpu.pump(); const w = t.workers[0], moves = legalTurns(t.state)[0].moves;
  t.cpu.cancel(); t.state = createGame();
  t.reply(w, moves); w.onerror(); t.advance(5000);
  assert.ok(w.terminated); assert.deepEqual(t.calls, []); assert.deepEqual(t.errors, []);
  assert.equal(t.state.phase, 'opening');
});

test('reset during animation ignores even a previously queued timer callback', () => {
  const t = setup(); t.cpu.pump(); t.reply(); t.advance(550);
  t.cpu.cancel(); t.state = createGame();
  for (const fn of t.callbacks) fn();
  t.advance(5000); assert.deepEqual(t.calls, ['move']); assert.equal(t.state.phase, 'opening');
});

test('a new difficulty/session cannot receive an old worker result', () => {
  const t = setup(); t.cpu.pump(); const old = t.workers[0], moves = legalTurns(t.state)[0].moves;
  t.cpu.cancel(); t.state = rollOpening(createGame(), [2, 5]); t.level = 'beginner'; t.cpu.pump();
  t.reply(old, moves); t.advance(2000); assert.deepEqual(t.calls, []);
  assert.equal(t.workers[1].request.level, 'beginner'); t.reply(); t.advance(3000);
  assert.equal(t.state.turn, 'white');
});

test('open dialogs pause move animation; closing resumes the same dice', () => {
  const t = setup(); t.cpu.pump(); t.paused = true; t.reply(); t.advance(3000);
  assert.deepEqual(t.calls, []); assert.deepEqual(t.state.rolled, [1, 6]);
  t.paused = false; t.advance(3000); assert.equal(t.state.turn, 'white');
});

test('invalid or incomplete worker output applies no moves; retry keeps the position', () => {
  for (const moves of [[], [{ from: 18, to: 'off', die: 6 }], null]) {
    const t = setup(); const before = t.state; t.cpu.pump(); t.reply(t.workers[0], moves); t.advance(3000);
    assert.equal(t.errors.length, 1); assert.equal(t.state, before); assert.deepEqual(t.calls, []);
    t.cpu.pump(); assert.equal(t.workers.length, 1);
    t.cpu.retry(); assert.equal(t.workers.length, 2); t.reply(); t.advance(3000);
    assert.equal(t.state.turn, 'white');
  }
});

test('worker failure is recoverable without changing dice', () => {
  const t = setup(); const before = t.state; t.cpu.pump(); t.workers[0].onerror();
  assert.equal(t.state, before); assert.equal(t.errors.length, 1);
  t.cpu.retry(); t.reply(); t.advance(3000); assert.equal(t.state.turn, 'white');
});

test('blocked CPU automatically passes; last checker automatically confirms victory', () => {
  const blocked = rollOpening(createGame(), [1, 2]);
  blocked.board.fill(0); blocked.board[0] = 2; blocked.board[1] = 2; blocked.board[10] = -14;
  blocked.bar.black = 1; blocked.off.white = 11;
  const t = setup(blocked); t.cpu.pump(); t.advance(1000);
  assert.deepEqual(t.calls, ['finish']); assert.equal(t.state.turn, 'white');
  const won = { ...blocked, board: [...blocked.board], bar: { white: 0, black: 0 }, off: { white: 11, black: 15 } };
  won.board[10] = 0;
  const u = setup(won); u.cpu.pump(); u.advance(1000);
  assert.equal(u.state.phase, 'finished'); assert.equal(u.state.result.winner, 'black');
});
