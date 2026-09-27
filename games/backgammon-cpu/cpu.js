import { legalTurns, other, classifyWin } from './engine.js';

export const LEVELS = Object.freeze({
  beginner: { label: '初級', description: 'まずは駒を進める、やさしい相手。' },
  intermediate: { label: '中級', description: 'ヒットや守りも考える相手。' },
  advanced: { label: '上級', description: '安全な形と封鎖を組み立てる相手。' },
  pro: { label: 'プロ級', description: '相手の次の出目と応手まで読む最強設定。' },
});

// These are hypothetical rolls for analysis, never the next real dice.
export const ROLLS = Object.freeze(Array.from({ length: 6 }, (_, a) =>
  Array.from({ length: 6 - a }, (_, b) => Object.freeze({ dice: [a + 1, a + b + 1], weight: b === 0 ? 1 : 2 }))).flat());

function counts(state, player) {
  const own = Array(25).fill(0), enemy = Array(25).fill(0);
  for (let i = 0; i < 24; i++) {
    const distance = player === 'white' ? i + 1 : 24 - i;
    const value = state.board[i] * (player === 'white' ? 1 : -1);
    own[distance] = Math.max(0, value);
    enemy[distance] = Math.max(0, -value);
  }
  return { own, enemy };
}

export function pipCount(state, player) {
  const { own } = counts(state, player);
  return own.reduce((sum, n, distance) => sum + n * distance, state.bar[player] * 25);
}

function features(state, player, detailed) {
  const opponent = other(player), { own, enemy } = counts(state, player);
  const farthest = own.findLastIndex(n => n > 0);
  const contact = state.bar[player] > 0 || state.bar[opponent] > 0 || enemy.some((n, d) => n && d < farthest);
  let score = -pipCount(state, player) + state.off[player] * 6;
  if (!contact) {
    // Avoid wasting future rolls on tall stacks and gaps in a pure race.
    for (let d = 1; d <= 6; d++) {
      score -= Math.max(0, own[d] - 2) * (7 - d) * .42;
      if (!own[d] && farthest > d) score -= .55;
    }
    return score;
  }
  let home = 0, run = 0, longest = 0, prime = 0;
  for (let d = 1; d <= 24; d++) {
    if (own[d] >= 2) {
      if (d <= 6) { home++; score += d >= 4 ? 8 : 5; }
      else if (d <= 12) score += 4;
      // Anchors in the opponent's home survive hits and keep a way back in.
      else if (d >= 19) score += d <= 21 ? 9 : 4;
      run++;
      if (d <= 12 && enemy.some((n, e) => n && e < d)) {
        prime = Math.max(prime, Math.min(run, 6));
      }
      longest = Math.max(longest, run);
    } else run = 0;
    score -= Math.max(0, own[d] - 3) * (d > 6 ? 1.3 : .4);
    if (own[d] === 1) {
      let threats = 0;
      // Distinct direct hitting dice; bar entry is mandatory for the opponent.
      for (let die = 1; die <= 6; die++) {
        const from = d - die;
        if (state.bar[opponent] ? from === 0 : from >= 1 && enemy[from]) threats++;
      }
      score -= 1.4 + threats * (d <= 6 ? 3.2 : 2.4);
      if (detailed) {
        // Indirect shots count only if at least one intermediate point is open.
        let indirect = 0;
        for (let a = 1; a <= 6; a++) for (let b = a; b <= 6; b++) {
          const from = d - a - b;
          if (from < 0 || (state.bar[opponent] ? from !== 0 : from === 0 || !enemy[from])) continue;
          if (own[d - a] < 2 || own[d - b] < 2) indirect += a === b ? 1 : 2;
        }
        score -= indirect * .27;
      }
    }
  }
  score += detailed ? prime * prime * 2.3 + longest * .8 : prime * 2;
  score += state.bar[opponent] * (4 + home * 3.5);
  score -= state.bar[player] * 8;
  return score;
}

export function evaluate(state, player, detailed = true) {
  for (const winner of [player, other(player)]) {
    if (state.off[winner] === 15) {
      const kind = classifyWin(state, winner).kind;
      // Single-game victory is primary; retain the existing win-kind preference.
      return (winner === player ? 1 : -1) * (10000 + (kind === 'backgammon' ? 200 : kind === 'gammon' ? 100 : 0));
    }
  }
  return features(state, player, detailed) - features(state, other(player), detailed);
}

export function chooseTurn(state, level = 'beginner', { random = Math.random, onProgress = () => {} } = {}) {
  if (!Object.hasOwn(LEVELS, level)) throw new Error('Unknown CPU level.');
  if (state.phase !== 'moving' || !state.turn) throw new Error('CPU needs already-rolled dice.');
  const player = state.turn;
  const turns = legalTurns(state);
  const wins = turns.filter(t => t.state.off[player] === 15);
  if (wins.length) return wins.sort((a, b) => evaluate(b.state, player) - evaluate(a.state, player))[0].moves;
  if (turns.length <= 1) return turns[0]?.moves || [];
  const ranked = turns.map(turn => {
    let score;
    if (level === 'beginner') {
      // Weakness is confined to checker decisions, never to real dice.
      score = -pipCount(turn.state, player) + turn.state.off[player] * 3 + random() * 48;
    } else {
      score = evaluate(turn.state, player, level !== 'intermediate');
      if (level === 'intermediate') score += (random() - .5) * 28;
    }
    return { ...turn, score };
  }).sort((a, b) => b.score - a.score);
  if (level !== 'pro') return ranked[0].moves;

  // Candidate filtering bounds work on mobile. Every retained candidate gets
  // all 21 opponent dice combinations, each weighted by its exact probability.
  // There is no noise or time-based early cutoff in this level.
  const candidates = ranked.slice(0, 12);
  let best = candidates[0], bestScore = -Infinity;
  const cache = new Map();
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    let expectation = 0;
    for (const { dice, weight } of ROLLS) {
      const response = { ...candidate.state, turn: other(player), phase: 'moving',
        rolled: dice, remaining: dice[0] === dice[1] ? Array(4).fill(dice[0]) : dice, history: [] };
      let worst = Infinity;
      for (const reply of legalTurns(response)) {
        const key = `${reply.state.board}|${reply.state.bar.white},${reply.state.bar.black}|${reply.state.off.white},${reply.state.off.black}`;
        let value = cache.get(key);
        if (value === undefined) { value = evaluate(reply.state, player); cache.set(key, value); }
        worst = Math.min(worst, value);
      }
      expectation += worst * weight / 36;
    }
    if (expectation > bestScore) { best = candidate; bestScore = expectation; }
    onProgress({ done: i + 1, total: candidates.length });
  }
  return best.moves;
}
