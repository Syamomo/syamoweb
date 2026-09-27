// Diagnostic only: paired, reproducible dice streams; not a human skill rating.
import { createGame, rollOpening, rollDice, playMove, finishTurn } from '../engine.js';
import { chooseTurn } from '../cpu.js';
function rng(n) { return () => { n = (Math.imul(n, 1664525) + 1013904223) >>> 0; return n / 2 ** 32; }; }
const samples = Number(process.argv[2] || 20);
for (const [weak, strong] of [['beginner', 'intermediate'], ['intermediate', 'advanced'], ['advanced', 'pro']]) {
  if (process.argv[3] && process.argv[3] !== strong) continue;
  let wins = 0, total = 0, turns = 0, slowestMs = 0;
  const begin = performance.now();
  for (let i = 0; i < samples; i++) for (const strongColor of ['white', 'black']) {
    const strongDice = rng(71001 + i), weakDice = rng(81001 + i), noise = rng(91001 + i);
    const stream = { [strongColor]: strongDice, [strongColor === 'white' ? 'black' : 'white']: weakDice };
    const die = p => 1 + Math.floor(stream[p]() * 6);
    let s = createGame();
    while (s.phase === 'opening') s = rollOpening(s, [die('white'), die('black')]);
    for (let n = 0; n < 800 && s.phase !== 'finished'; n++) {
      if (s.phase === 'roll') s = rollDice(s, [die(s.turn), die(s.turn)]);
      const t = performance.now();
      const moves = chooseTurn(s, s.turn === strongColor ? strong : weak, { random: noise });
      slowestMs = Math.max(slowestMs, performance.now() - t);
      for (const move of moves) s = playMove(s, move);
      s = finishTurn(s); turns++;
    }
    if (s.phase !== 'finished') throw Error('Unfinished game');
    if (s.result.winner === strongColor) wins++;
    total++;
  }
  console.log(JSON.stringify({ weak, strong, strongerWins: wins, total, turns, slowestMs: Math.round(slowestMs), elapsedMs: Math.round(performance.now() - begin) }));
}
