// Points use White's numbering minus one. White moves 23 -> 0, Black 0 -> 23.
export const WHITE = 'white';
export const BLACK = 'black';
export const other = player => player === WHITE ? BLACK : WHITE;
const sign = player => player === WHITE ? 1 : -1;
const distance = (player, point) => player === WHITE ? point + 1 : 24 - point;
const owns = (board, point, player) => board[point] * sign(player) > 0;

export function createGame() {
  const board = Array(24).fill(0);
  for (const [point, count] of [[23, 2], [12, 5], [7, 3], [5, 5]]) {
    board[point] = count;
    board[23 - point] = -count;
  }
  return {
    board, bar: { white: 0, black: 0 }, off: { white: 0, black: 0 },
    turn: null, phase: 'opening', rolled: [], remaining: [], openingDice: [],
    history: [], lastMove: null, result: null, turnNumber: 0,
  };
}

function validateDice(dice) {
  if (!Array.isArray(dice) || dice.length !== 2 || dice.some(d => !Number.isInteger(d) || d < 1 || d > 6)) {
    throw new Error('Dice must be two integers from 1 to 6.');
  }
}

export function rollOpening(state, dice) {
  if (state.phase !== 'opening') throw new Error('Opening roll is not available.');
  validateDice(dice);
  if (dice[0] === dice[1]) return { ...state, openingDice: [...dice] };
  return {
    ...state, turn: dice[0] > dice[1] ? WHITE : BLACK, phase: 'moving',
    openingDice: [...dice], rolled: [...dice], remaining: [...dice], turnNumber: 1,
  };
}

export function rollDice(state, dice) {
  if (state.phase !== 'roll') throw new Error('Roll only once at the start of a turn.');
  validateDice(dice);
  return {
    ...state, phase: 'moving', rolled: [...dice],
    remaining: dice[0] === dice[1] ? Array(4).fill(dice[0]) : [...dice],
  };
}

export function allHome(state, player) {
  return state.bar[player] === 0 && state.board.every((count, point) =>
    count * sign(player) <= 0 || distance(player, point) <= 6);
}

function movesForDie(state, player, die) {
  if (state.off[player] === 15) return [];
  const sources = state.bar[player] > 0 ? ['bar'] :
    state.board.flatMap((_, point) => owns(state.board, point, player) ? [point] : []);
  const home = allHome(state, player);
  const moves = [];
  for (const from of sources) {
    const to = from === 'bar' ? (player === WHITE ? 24 - die : die - 1) : from - sign(player) * die;
    if (to >= 0 && to < 24) {
      if (state.board[to] * sign(player) > -2) {
        moves.push({ from, to, die, hit: state.board[to] * sign(player) === -1 });
      }
    } else if (from !== 'bar' && home) {
      const exact = distance(player, from) === die;
      const noHigher = state.board.every((_, point) => !owns(state.board, point, player) || distance(player, point) <= distance(player, from));
      if (exact || noHigher) moves.push({ from, to: 'off', die, hit: false });
    }
  }
  return moves;
}

function advance(state, player, move) {
  const next = { board: [...state.board], bar: { ...state.bar }, off: { ...state.off } };
  if (move.from === 'bar') next.bar[player]--;
  else next.board[move.from] -= sign(player);
  if (move.to === 'off') next.off[player]++;
  else {
    if (next.board[move.to] * sign(player) === -1) {
      next.board[move.to] = 0;
      next.bar[other(player)]++;
    }
    next.board[move.to] += sign(player);
  }
  return next;
}

function withoutDie(dice, die) {
  const next = [...dice];
  next.splice(next.indexOf(die), 1);
  return next;
}

// Search the entire remaining turn, so a locally legal step cannot waste a die.
export function legalMoves(state) {
  if (state.phase !== 'moving' || !state.remaining.length || state.off[state.turn] === 15) return [];
  const player = state.turn;
  const memo = new Map();
  function maximum(position, dice) {
    if (!dice.length || position.off[player] === 15) return 0;
    const key = `${position.board.join(',')}|${position.bar.white},${position.bar.black}|${position.off.white},${position.off.black}|${[...dice].sort().join('')}`;
    if (memo.has(key)) return memo.get(key);
    let best = 0;
    for (const die of new Set(dice)) {
      for (const move of movesForDie(position, player, die)) {
        best = Math.max(best, 1 + maximum(advance(position, player, move), withoutDie(dice, die)));
        if (best === dice.length) { memo.set(key, best); return best; }
      }
    }
    memo.set(key, best);
    return best;
  }
  const count = maximum(state, state.remaining);
  let moves = [...new Set(state.remaining)].flatMap(die => movesForDie(state, player, die))
    .filter(move => 1 + maximum(advance(state, player, move), withoutDie(state.remaining, move.die)) === count);
  if (count === 1 && state.remaining.length === 2 && state.remaining[0] !== state.remaining[1] && moves.length) {
    const higher = Math.max(...moves.map(move => move.die));
    moves = moves.filter(move => move.die === higher);
  }
  return moves;
}

export function playMove(state, requested) {
  const move = legalMoves(state).find(m => m.from === requested.from && m.to === requested.to && m.die === requested.die);
  if (!move) throw new Error('Illegal move.');
  const snapshot = {
    board: state.board, bar: state.bar, off: state.off,
    remaining: state.remaining, lastMove: state.lastMove,
  };
  return {
    ...state, ...advance(state, state.turn, move), remaining: withoutDie(state.remaining, move.die),
    lastMove: { ...move, player: state.turn }, history: [...state.history, snapshot],
  };
}

export function undoMove(state) {
  if (state.phase !== 'moving' || !state.history.length) throw new Error('Nothing to undo in this turn.');
  return { ...state, ...state.history.at(-1), history: state.history.slice(0, -1) };
}

export function canFinishTurn(state) {
  return state.phase === 'moving' && legalMoves(state).length === 0;
}

export function classifyWin(state, winner) {
  const loser = other(winner);
  if (state.off[loser] > 0) return { winner, kind: 'single' };
  const inWinnersHome = state.board.some((_, point) => owns(state.board, point, loser) && distance(winner, point) <= 6);
  return { winner, kind: state.bar[loser] > 0 || inWinnersHome ? 'backgammon' : 'gammon' };
}

export function finishTurn(state) {
  if (!canFinishTurn(state)) throw new Error('Play all usable dice before finishing the turn.');
  if (state.off[state.turn] === 15) {
    return { ...state, phase: 'finished', history: [], result: classifyWin(state, state.turn) };
  }
  return {
    ...state, turn: other(state.turn), phase: 'roll', remaining: [], rolled: [],
    history: [], lastMove: null, turnNumber: state.turnNumber + 1,
  };
}

// Rejection sampling avoids modulo bias; no reroll is permitted after a turn starts.
export function randomDie(randomBytes = bytes => globalThis.crypto.getRandomValues(bytes)) {
  const bytes = new Uint8Array(1);
  do { randomBytes(bytes); } while (bytes[0] >= 252);
  return bytes[0] % 6 + 1;
}
