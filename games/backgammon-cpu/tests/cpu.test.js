import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, rollOpening, rollDice, legalMoves, legalTurns, playMove, finishTurn, randomDie } from '../engine.js';
import { chooseTurn, LEVELS, ROLLS, evaluate } from '../cpu.js';

const key = s => `${s.board}|${s.bar.white},${s.bar.black}|${s.off.white},${s.off.black}|${[...s.remaining].sort()}`;
function reference(s, results = new Set()) {
  const moves = legalMoves(s);
  if (!moves.length) results.add(key(s));
  for (const move of moves) reference(playMove(s, move), results);
  return results;
}
function validate(s, moves) {
  for (const m of moves) s = playMove(s, m);
  assert.equal(legalMoves(s).length, 0);
  for (const [p, sign] of [['white', 1], ['black', -1]]) {
    assert.equal(s.board.reduce((sum, n) => sum + Math.max(0, n * sign), 0) + s.bar[p] + s.off[p], 15);
  }
  return s;
}
function seed(n) { return () => { n = (Math.imul(n, 1664525) + 1013904223) >>> 0; return n / 2 ** 32; }; }
function fixture(white, black, dice = [1, 2], bar = { white: 0, black: 0 }, turn = 'black') {
  const s = createGame(); s.board.fill(0);
  for (const [i, n] of white) s.board[i] = n;
  for (const [i, n] of black) { assert.equal(s.board[i], 0); s.board[i] = -n; }
  s.bar = bar; s.off = { white: 15 - white.reduce((n, p) => n + p[1], 0) - bar.white, black: 15 - black.reduce((n, p) => n + p[1], 0) - bar.black };
  return { ...s, turn, phase: 'moving', rolled: dice.slice(0, 2), remaining: dice };
}

test('complete-turn search equals interactive legal moves for all 21 rolls and both colors', () => {
  for (const turn of ['white', 'black']) for (const { dice } of ROLLS) {
    const s = rollDice({ ...createGame(), turn, phase: 'roll' }, dice);
    const results = legalTurns(s);
    assert.deepEqual(new Set(results.map(t => key(t.state))), reference(s));
    for (const t of results) assert.equal(key(validate(s, t.moves)), key(t.state));
  }
});

test('search covers blocked bar, maximum dice, larger die, partial doubles and bearoff', () => {
  const positions = [
    fixture([[0, 2], [1, 2]], [[9, 14]], [1, 2], { white: 0, black: 1 }),
    fixture([[2, 2]], [[10, 14]], [1, 2], { white: 0, black: 1 }),
    fixture([[3, 2]], [[10, 14]], [1, 3], { white: 0, black: 1 }),
    fixture([[1, 2]], [[10, 12]], [1, 1, 1, 1], { white: 0, black: 3 }),
    fixture([[2, 15]], [[20, 3], [22, 3], [23, 2]], [2, 6]),
    fixture([[2, 15]], [[23, 1]], [1, 2]),
  ];
  for (const s of positions) {
    assert.deepEqual(new Set(legalTurns(s).map(t => key(t.state))), reference(s));
    for (const level of Object.keys(LEVELS)) validate(s, chooseTurn(s, level));
  }
});

test('CPU cannot mutate the supplied board, dice, or undo history', () => {
  for (const level of Object.keys(LEVELS)) {
    const s = rollOpening(createGame(), [1, 6]), before = structuredClone(s);
    chooseTurn(s, level); assert.deepEqual(s, before);
  }
});

test('all levels take an available immediate victory', () => {
  const s = fixture([[0, 15]], [[22, 1]], [1, 2]);
  for (const level of Object.keys(LEVELS)) assert.equal(validate(s, chooseTurn(s, level)).off.black, 15);
});

test('upper levels make the six-one opening bar point', () => {
  const s = rollOpening(createGame(), [1, 6]);
  for (const level of ['advanced', 'pro']) {
    const after = validate(s, chooseTurn(s, level));
    assert.equal(after.board[17], -2);
  }
});

test('advanced and pro never request weakening randomness; pro completes all candidates', () => {
  const s = rollOpening(createGame(), [2, 5]);
  const random = () => { throw new Error('No noise allowed'); }, progress = [];
  for (const level of ['advanced', 'pro']) {
    const moves = chooseTurn(s, level, { random, onProgress: p => progress.push(p) });
    assert.deepEqual(moves, chooseTurn(s, level, { random }));
  }
  assert.ok(progress.length > 1);
  assert.equal(progress.at(-1).done, progress.at(-1).total);
});

test('dice probabilities include six doubles and weight all 36 ordered outcomes equally', () => {
  assert.equal(ROLLS.length, 21);
  assert.equal(ROLLS.reduce((n, r) => n + r.weight, 0), 36);
  assert.equal(ROLLS.filter(r => r.weight === 1).length, 6);
  const counts = Array(6).fill(0);
  for (let b = 0; b < 252; b++) counts[randomDie(bytes => { bytes[0] = b; }) - 1]++;
  assert.deepEqual(counts, Array(6).fill(42));
});

test('evaluation is symmetric when the board and player colors are mirrored', () => {
  const s = fixture([[0, 2], [5, 3], [20, 1]], [[4, 2], [12, 1], [23, 4]], [3, 4], { white: 1, black: 2 });
  const mirror = { ...s, board: [...s.board].reverse().map(n => -n), bar: { white: s.bar.black, black: s.bar.white }, off: { white: s.off.black, black: s.off.white } };
  assert.equal(evaluate(s, 'white'), evaluate(mirror, 'black'));
  assert.equal(evaluate(s, 'white'), -evaluate(s, 'black'));
});

test('each difficulty finishes seeded complete games with legal moves and conserved checkers', () => {
  for (const [index, level] of Object.keys(LEVELS).entries()) for (let gameNo = 0; gameNo < 2; gameNo++) {
    const diceRandom = seed(92027 + gameNo), moveRandom = seed(index + 100);
    const dice = () => [1 + Math.floor(diceRandom() * 6), 1 + Math.floor(diceRandom() * 6)];
    let s = createGame();
    for (let n = 0; n < 800 && s.phase !== 'finished'; n++) {
      if (s.phase === 'opening') { s = rollOpening(s, dice()); continue; }
      if (s.phase === 'roll') s = rollDice(s, dice());
      const original = structuredClone(s);
      const moves = chooseTurn(s, s.turn === 'black' ? level : 'intermediate', { random: moveRandom });
      assert.deepEqual(s, original);
      s = finishTurn(validate(s, moves));
    }
    assert.equal(s.phase, 'finished', level);
    assert.equal(s.off[s.result.winner], 15);
  }
});

test('CPU rejects unknown levels and positions without current dice', () => {
  assert.throws(() => chooseTurn(createGame(), 'pro'));
  assert.throws(() => chooseTurn(rollOpening(createGame(), [1, 6]), 'impossible'));
});
