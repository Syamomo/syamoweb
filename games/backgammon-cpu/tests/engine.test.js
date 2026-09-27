import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, rollOpening, rollDice, legalMoves, playMove, undoMove, finishTurn, canFinishTurn, classifyWin, allHome, randomDie } from '../engine.js';

function position({ white = [], black = [], bar = {}, dice = [1, 2], turn = 'white' } = {}) {
  const state = createGame();
  state.board.fill(0);
  for (const [i, n] of white) state.board[i] = n;
  for (const [i, n] of black) { assert.equal(state.board[i], 0, 'fixture overlap'); state.board[i] = -n; }
  state.bar = { white: 0, black: 0, ...bar };
  state.off.white = 15 - white.reduce((n, p) => n + p[1], 0) - state.bar.white;
  state.off.black = 15 - black.reduce((n, p) => n + p[1], 0) - state.bar.black;
  assert.ok(state.off.white >= 0 && state.off.black >= 0);
  return { ...state, turn, phase: 'moving', rolled: dice.slice(0, 2), remaining: dice, turnNumber: 5 };
}
const has = (s, from, to, die) => legalMoves(s).some(m => m.from === from && m.to === to && m.die === die);
const move = (s, from, to, die) => playMove(s, { from, to, die });
function conserved(s) {
  for (const [p, sign] of [['white', 1], ['black', -1]]) {
    assert.equal(s.board.reduce((n, v) => n + Math.max(0, v * sign), 0) + s.bar[p] + s.off[p], 15);
    assert.ok(s.bar[p] >= 0 && s.off[p] >= 0 && s.off[p] <= 15);
  }
  assert.ok(s.board.every(Number.isInteger));
}

test('standard initial placement: 15 per side and home / movement orientation', () => {
  const s = createGame();
  assert.deepEqual(s.board, [-2, 0, 0, 0, 0, 5, 0, 3, 0, 0, 0, -5, 5, 0, 0, 0, -3, 0, -5, 0, 0, 0, 0, 2]);
  conserved(s);
  assert.equal(s.phase, 'opening');
  assert.deepEqual(legalMoves(s), []);
});
test('opening tie does not set a turn; each player rerolls a single die', () => {
  const s = rollOpening(createGame(), [4, 4]);
  assert.equal(s.phase, 'opening');
  assert.equal(s.turn, null);
  assert.deepEqual(s.remaining, []);
  assert.deepEqual(s.openingDice, [4, 4]);
});
test('opening winner uses the two original dice, no extra roll', () => {
  for (const [dice, turn] of [[[6, 2], 'white'], [[1, 5], 'black']]) {
    const s = rollOpening(createGame(), dice);
    assert.equal(s.turn, turn);
    assert.deepEqual(s.remaining, dice);
    assert.throws(() => rollDice(s, [3, 4]));
    assert.throws(() => rollOpening(s, [3, 4]));
  }
});
test('invalid dice and dice outside the correct phase are rejected', () => {
  for (const dice of [[0, 2], [7, 2], [1.5, 4], [3], [3, 2, 1], null]) assert.throws(() => rollOpening(createGame(), dice));
  assert.throws(() => rollDice(createGame(), [1, 2]));
});
test('white moves downward in indices and black moves upward', () => {
  assert.ok(has(position({ white: [[12, 15]] }), 12, 11, 1));
  assert.ok(has(position({ black: [[11, 15]], turn: 'black' }), 11, 12, 1));
});
test('opposing pairs block landing but can be jumped over', () => {
  const s = position({ white: [[10, 15]], black: [[9, 2]] });
  assert.ok(!has(s, 10, 9, 1));
  assert.ok(has(s, 10, 8, 2));
});
test('a blot is hit onto the bar, with exact counts', () => {
  const s = position({ white: [[10, 15]], black: [[9, 1]] });
  const t = move(s, 10, 9, 1);
  assert.equal(t.board[9], 1);
  assert.equal(t.bar.black, 1);
  assert.equal(t.board[10], 14);
  assert.equal(t.lastMove.hit, true);
  conserved(t);
});
test('black can hit a white blot', () => {
  const t = move(position({ black: [[4, 15]], white: [[5, 1]], turn: 'black' }), 4, 5, 1);
  assert.equal(t.board[5], -1);
  assert.equal(t.bar.white, 1);
  conserved(t);
});
test('bar pieces must reenter before any board piece moves', () => {
  const s = position({ white: [[8, 14]], bar: { white: 1 } });
  assert.ok(legalMoves(s).every(m => m.from === 'bar'));
  assert.throws(() => move(s, 8, 7, 1));
});
test('entry points are correct for both players; reentry can hit', () => {
  const w = move(position({ bar: { white: 1 }, black: [[21, 1]], dice: [3] }), 'bar', 21, 3);
  const b = move(position({ bar: { black: 1 }, white: [[2, 1]], dice: [3], turn: 'black' }), 'bar', 2, 3);
  assert.equal(w.bar.white, 0); assert.equal(w.bar.black, 1);
  assert.equal(b.bar.black, 0); assert.equal(b.bar.white, 1);
  conserved(w); conserved(b);
});
test('two blocked entry points force a pass without reroll or undo', () => {
  const s = position({ bar: { white: 1 }, black: [[23, 2], [22, 2]] });
  assert.equal(legalMoves(s).length, 0);
  assert.equal(canFinishTurn(s), true);
  assert.equal(finishTurn(s).turn, 'black');
  assert.throws(() => undoMove(s));
  assert.throws(() => rollDice(s, [3, 3]));
});
test('must continue entering while another piece remains on the bar', () => {
  const s = position({ bar: { white: 2 }, white: [[8, 13]] });
  const t = move(s, 'bar', 23, 1);
  assert.ok(legalMoves(t).every(m => m.from === 'bar'));
});
test('remaining die is usable for another piece after last reentry', () => {
  const s = move(position({ bar: { white: 1 }, white: [[8, 14]] }), 'bar', 23, 1);
  assert.ok(has(s, 8, 6, 2));
  assert.ok(has(s, 23, 21, 2));
});
test('a non-double requires both dice when possible, including choosing the right entry order', () => {
  const s = position({ white: [[6, 14]], black: [[5, 2], [17, 2]], bar: { white: 1 }, dice: [1, 6] });
  assert.ok(has(s, 'bar', 23, 1));
  assert.ok(!has(s, 'bar', 18, 6));
  assert.throws(() => move(s, 'bar', 18, 6));
  assert.throws(() => finishTurn(s));
  const t = move(s, 'bar', 23, 1);
  assert.ok(has(t, 6, 0, 6));
});
test('if either die alone is possible, the larger die is mandatory', () => {
  const s = position({ white: [[8, 1]], black: [[5, 2]], dice: [1, 2] });
  assert.deepEqual(legalMoves(s).map(m => m.die), [2]);
});
test('the smaller die is allowed when the larger has no legal move', () => {
  const s = position({ bar: { white: 1 }, black: [[22, 2], [21, 2]], dice: [1, 2] });
  assert.ok(has(s, 'bar', 23, 1));
  const t = move(s, 'bar', 23, 1);
  assert.ok(canFinishTurn(t));
});
test('rolling doubles provides four uses', () => {
  const s = rollDice({ ...createGame(), turn: 'white', phase: 'roll' }, [3, 3]);
  assert.deepEqual(s.remaining, [3, 3, 3, 3]);
  let t = s;
  for (let i = 0; i < 4; i++) { assert.equal(canFinishTurn(t), false); t = playMove(t, legalMoves(t)[0]); }
  assert.equal(canFinishTurn(t), true);
});
test('partially blocked doubles use the maximum playable count', () => {
  let s = position({ bar: { white: 1 }, black: [[20, 2]], dice: [1, 1, 1, 1] });
  for (let i = 0; i < 3; i++) s = playMove(s, legalMoves(s)[0]);
  assert.equal(s.history.length, 3);
  assert.deepEqual(s.remaining, [1]);
  assert.ok(canFinishTurn(s));
});
test('bearing off requires every active checker in home and an empty bar', () => {
  const outside = position({ white: [[0, 14], [6, 1]], dice: [1] });
  const bar = position({ white: [[0, 14]], bar: { white: 1 }, dice: [1] });
  assert.equal(allHome(outside, 'white'), false);
  assert.ok(!has(outside, 0, 'off', 1));
  assert.equal(allHome(bar, 'white'), false);
});
test('exact bear off is allowed even with higher checkers', () => {
  const s = position({ white: [[1, 1], [5, 14]], dice: [2] });
  assert.ok(has(s, 1, 'off', 2));
});
test('oversized die can bear off only the furthest remaining checker', () => {
  const s = position({ white: [[0, 14], [3, 1]], dice: [6] });
  assert.ok(has(s, 3, 'off', 6));
  assert.ok(!has(s, 0, 'off', 6));
});
test('black home and overshoot mirror white correctly', () => {
  const s = position({ black: [[23, 14], [20, 1]], dice: [6], turn: 'black' });
  assert.ok(allHome(s, 'black'));
  assert.ok(has(s, 20, 'off', 6));
  assert.ok(!has(s, 23, 'off', 6));
});
test('home movement remains legal instead of bearing off', () => {
  const s = position({ white: [[5, 14], [1, 1]], dice: [2] });
  assert.ok(has(s, 5, 3, 2));
  assert.ok(has(s, 1, 'off', 2));
});
test('same checker must stop on a legal intermediate point for each die', () => {
  const s = position({ white: [[10, 1]], black: [[9, 2], [8, 2]], dice: [1, 2] });
  assert.deepEqual(legalMoves(s), []);
  assert.throws(() => move(s, 10, 7, 3));
});
test('undo restores a hit, both bars, and the consumed die exactly', () => {
  const s = position({ white: [[10, 15]], black: [[9, 1]] });
  assert.deepEqual(undoMove(move(s, 10, 9, 1)), s);
});
test('undo restores reentry and bearing off exactly', () => {
  const bar = position({ bar: { white: 1 }, white: [[8, 14]] });
  assert.deepEqual(undoMove(move(bar, 'bar', 23, 1)), bar);
  const off = position({ white: [[0, 15]], dice: [1, 1, 1, 1] });
  assert.deepEqual(undoMove(move(off, 0, 'off', 1)), off);
});
test('multiple undo steps restore the turn but never the dice roll', () => {
  const start = rollOpening(createGame(), [4, 2]);
  let s = start;
  for (let i = 0; i < 2; i++) s = playMove(s, legalMoves(s)[0]);
  s = undoMove(undoMove(s));
  assert.deepEqual(s, start);
  assert.throws(() => undoMove(s));
  assert.throws(() => rollDice(s, [6, 6]));
});
test('last bear off can still be undone before victory confirmation', () => {
  const s = position({ white: [[0, 1]], black: [[10, 15]], dice: [2] });
  const t = move(s, 0, 'off', 2);
  assert.equal(t.result, null);
  assert.equal(t.phase, 'moving');
  assert.equal(t.off.white, 15);
  assert.deepEqual(undoMove(t), s);
  const won = finishTurn(t);
  assert.equal(won.phase, 'finished');
  assert.deepEqual(won.result, { winner: 'white', kind: 'gammon' });
  assert.throws(() => undoMove(won));
  assert.throws(() => finishTurn(won));
});
test('turn confirmation clears undo history and changes the active player', () => {
  let s = rollOpening(createGame(), [3, 2]);
  while (legalMoves(s).length) s = playMove(s, legalMoves(s)[0]);
  const t = finishTurn(s);
  assert.equal(t.phase, 'roll');
  assert.equal(t.turn, 'black');
  assert.deepEqual(t.history, []);
  assert.throws(() => undoMove(t));
  assert.throws(() => undoMove(rollDice(t, [1, 2])));
});
test('normal win when loser has borne off at least one checker', () => {
  const s = position({ black: [[0, 14]] });
  assert.deepEqual(classifyWin(s, 'white'), { winner: 'white', kind: 'single' });
});
test('gammon if loser has borne off none and is outside winner home/bar', () => {
  const s = position({ black: [[15, 15]] });
  assert.equal(classifyWin(s, 'white').kind, 'gammon');
});
test('backgammon if loser remains in winner home or on bar, for either side', () => {
  assert.equal(classifyWin(position({ black: [[3, 15]] }), 'white').kind, 'backgammon');
  assert.equal(classifyWin(position({ black: [[12, 14]], bar: { black: 1 } }), 'white').kind, 'backgammon');
  assert.equal(classifyWin(position({ white: [[20, 15]] }), 'black').kind, 'backgammon');
});
test('engine commands are immutable, including history snapshots', () => {
  const s = rollOpening(createGame(), [6, 1]);
  const copy = structuredClone(s);
  const t = playMove(s, legalMoves(s)[0]);
  legalMoves(t);
  undoMove(t);
  assert.deepEqual(s, copy);
});
test('random dice reject biased byte values 252 through 255', () => {
  const bytes = [255, 254, 253, 252, 251, 0, 1, 2, 3, 4];
  const draw = array => { array[0] = bytes.shift(); };
  assert.deepEqual(Array.from({ length: 6 }, () => randomDie(draw)), [6, 1, 2, 3, 4, 5]);
});
test('12 seeded full games finish with conserved pieces and reversible moves', () => {
  let seed = 137;
  const rand = n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return Math.floor(seed / 2 ** 32 * n); };
  for (let round = 0; round < 12; round++) {
    let s = createGame();
    let turns = 0;
    while (s.phase !== 'finished' && turns++ < 2000) {
      if (s.phase === 'opening') s = rollOpening(s, [rand(6) + 1, rand(6) + 1]);
      if (s.phase === 'roll') s = rollDice(s, [rand(6) + 1, rand(6) + 1]);
      if (s.phase !== 'moving') continue;
      let moves = legalMoves(s);
      while (moves.length) {
        const before = s;
        s = playMove(s, moves[rand(moves.length)]);
        assert.deepEqual(undoMove(s), before);
        conserved(s);
        moves = legalMoves(s);
      }
      s = finishTurn(s);
      conserved(s);
    }
    assert.equal(s.phase, 'finished');
    assert.equal(s.off[s.result.winner], 15);
  }
});
