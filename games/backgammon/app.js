import { createGame, rollOpening, rollDice, legalMoves, playMove, undoMove, finishTurn, randomDie } from './engine.js';

const $ = id => document.getElementById(id);
const name = player => player === 'white' ? '白' : '黒';
let game = createGame();
let selected = null;
let preferredDie = null;
const board = $('board');
const points = new Map();
const rails = {};
const bars = {};
const trays = {};
const resultNames = { single: '通常勝ち', gammon: 'ギャモン', backgammon: 'バックギャモン' };
const pips = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };

function diceHTML(value, used = false, chosen = false, interactive = false, openingPlayer = '') {
  const dots = value ? pips[value].map(n => `<i style="grid-area:${Math.ceil(n / 3)} / ${(n - 1) % 3 + 1}"></i>`).join('') : '<span>·</span>';
  const label = `${openingPlayer ? name(openingPlayer) + 'の' : ''}出目${value || '未定'}${used ? '、使用済み' : chosen ? '、選択中' : ''}`;
  return `<button type="button" class="die ${used ? 'used' : ''} ${chosen ? 'chosen' : ''} ${openingPlayer}" ${interactive ? `data-die="${value}"` : 'disabled'} aria-label="${label}" ${interactive ? `aria-pressed="${chosen}"` : ''}>${dots}</button>`;
}

for (const player of ['black', 'white']) {
  const rail = $(`${player}-rail`);
  rail.innerHTML = `<div class="player-tag"><span class="mini-checker ${player}" aria-hidden="true"></span><div><strong>${name(player)}</strong><span>${player === 'white' ? '手前' : '向かい側'}</span></div></div>
    <div class="turn-copy"><strong class="turn-title" aria-live="polite"></strong><span class="turn-detail"></span></div>
    <div class="dice" aria-label="サイコロ"></div>
    <div class="rail-actions"><button type="button" class="undo-button">1手戻す<span class="button-sub">Undo</span></button><button type="button" class="primary turn-button"></button></div>`;
  rails[player] = {
    root: rail, title: rail.querySelector('.turn-title'), detail: rail.querySelector('.turn-detail'),
    dice: rail.querySelector('.dice'), undo: rail.querySelector('.undo-button'), primary: rail.querySelector('.turn-button'),
  };
  rails[player].primary.addEventListener('click', () => {
    if (game.phase !== 'opening' && game.phase !== 'finished' && game.turn !== player) return;
    if (game.phase === 'finished') {
      restart();
      return;
    }
    if (game.phase === 'opening') game = rollOpening(game, [randomDie(), randomDie()]);
    else if (game.phase === 'roll') game = rollDice(game, [randomDie(), randomDie()]);
    else if (game.phase === 'moving' && legalMoves(game).length === 0) game = finishTurn(game);
    selected = null;
    preferredDie = null;
    render();
  });
  rails[player].undo.addEventListener('click', () => {
    if (game.turn !== player || game.phase !== 'moving' || !game.history.length) return;
    game = undoMove(game);
    selected = null;
    preferredDie = null;
    render();
  });
  rails[player].dice.addEventListener('click', event => {
    const die = event.target.closest('[data-die]');
    if (!die || game.turn !== player) return;
    preferredDie = preferredDie === Number(die.dataset.die) ? null : Number(die.dataset.die);
    render();
  });
}

// Both sets of controls keep their physical side; the shared board never rotates.
for (let index = 0; index < 24; index++) {
  const top = index >= 12;
  const column = top ? index - 12 : 11 - index;
  const point = document.createElement('button');
  point.type = 'button';
  point.dataset.point = index;
  point.className = `point ${top ? 'top' : 'bottom'} ${index % 2 ? 'sand' : 'clay'}`;
  point.style.gridColumn = String(column + 1 + (column >= 6 ? 1 : 0));
  point.style.gridRow = top ? '1' : '3';
  point.innerHTML = `<span class="point-number">${top ? 24 - index : index + 1}</span><span class="stack"></span><span class="landing" aria-hidden="true"></span>`;
  point.addEventListener('click', () => choosePoint(index));
  points.set(index, point);
  board.append(point);
}
for (const player of ['black', 'white']) {
  const bar = document.createElement('button');
  bar.type = 'button';
  bar.className = `bar-space ${player}`;
  bar.style.gridRow = player === 'black' ? '1' : '3';
  bar.dataset.bar = player;
  bar.addEventListener('click', () => { if (game.turn === player) choosePoint('bar'); });
  bars[player] = bar;
  board.append(bar);
  const tray = document.createElement('button');
  tray.type = 'button';
  tray.className = `off-tray ${player}`;
  tray.style.gridRow = player === 'black' ? '1' : '3';
  tray.dataset.off = player;
  tray.addEventListener('click', () => { if (game.turn === player) choosePoint('off'); });
  trays[player] = tray;
  board.append(tray);
}
const center = document.createElement('div');
center.className = 'board-center';
center.innerHTML = '<span class="home-label black">黒のホーム</span><span class="board-signature">BACKGAMMON</span><span class="home-label white">白のホーム</span>';
board.append(center);

function choosePoint(target) {
  if (game.phase !== 'moving') return;
  const moves = legalMoves(game);
  if (selected !== null) {
    const candidates = moves.filter(move => move.from === selected && move.to === target);
    if (candidates.length) {
      // With multiple bear-off dice, a selected die wins; otherwise prefer the exact/smaller die.
      const move = candidates.find(m => m.die === preferredDie) || candidates.sort((a, b) => a.die - b.die)[0];
      game = playMove(game, move);
      selected = null;
      preferredDie = null;
      render();
      return;
    }
  }
  if (target === selected) selected = null;
  else if (moves.some(move => move.from === target)) selected = target;
  render();
}

function currentMessage(moves) {
  if (game.phase === 'opening') return {
    title: game.openingDice.length ? '同じ目。もう一度！' : 'さあ、先攻を決めよう',
    detail: '白・黒1個ずつ。大きい目の人から。',
  };
  if (game.phase === 'finished') return {
    title: `${name(game.result.winner)}の勝ち！`, detail: `${resultNames[game.result.kind]} · 15枚すべて上がりました`,
  };
  if (game.off[game.turn] === 15) return { title: `${name(game.turn)}が15枚上がりました`, detail: '確定すると勝利です。まだ戻せます。' };
  if (game.phase === 'roll') return { title: `${name(game.turn)}の番です`, detail: 'サイコロを振って始めましょう。' };
  if (!moves.length) return {
    title: game.remaining.length ? '動かせる駒がありません' : '出目を使い終わりました',
    detail: game.remaining.length ? '残りの出目は使えません。確定で交代。' : '手番を確定すると、相手の番です。',
  };
  if (selected !== null) return { title: '移動先をタップ', detail: preferredDie ? `出目${preferredDie}を優先 · 同じ駒で選択解除` : '明るい印の場所へ移動できます。' };
  return {
    title: `${name(game.turn)}の番です`,
    detail: game.bar[game.turn] ? '中央のバーの駒を選んで戻します。' : '動かす駒をタップしてください。',
  };
}

function render() {
  const moves = legalMoves(game);
  const message = currentMessage(moves);
  if (preferredDie !== null && !game.remaining.includes(preferredDie)) preferredDie = null;
  board.dataset.phase = game.phase;
  board.dataset.turn = game.turn || '';
  for (const player of ['white', 'black']) {
    const ui = rails[player];
    const active = game.phase === 'opening' || game.phase === 'finished' || game.turn === player;
    ui.root.classList.toggle('active', active);
    ui.root.classList.toggle('winner', game.result?.winner === player);
    ui.title.textContent = message.title;
    ui.detail.textContent = message.detail;
    ui.undo.disabled = game.turn !== player || game.phase !== 'moving' || !game.history.length;
    ui.primary.disabled = !active || (game.phase === 'moving' && moves.length > 0);
    ui.primary.textContent = game.phase === 'opening' ? (game.openingDice.length ? 'もう一度振る' : '先攻を決める') :
      game.phase === 'roll' ? 'サイコロを振る' : game.phase === 'finished' ? 'もう一局' :
        game.off[game.turn] === 15 ? '勝利を確定' : '手番を確定';
    if (game.phase === 'opening' || game.turnNumber === 1 && !game.history.length) {
      const dice = game.openingDice.length ? game.openingDice : [0, 0];
      ui.dice.innerHTML = dice.map((d, i) => diceHTML(d, false, false, false, i ? 'black' : 'white')).join('');
    } else if (game.phase === 'roll') {
      ui.dice.innerHTML = diceHTML(0) + diceHTML(0);
    } else {
      const all = game.rolled[0] === game.rolled[1] ? Array(4).fill(game.rolled[0]) : game.rolled;
      const remaining = [...game.remaining];
      ui.dice.innerHTML = all.map(d => {
        const i = remaining.indexOf(d);
        if (i >= 0) remaining.splice(i, 1);
        const interactive = active && game.phase === 'moving' && i >= 0;
        return diceHTML(d, i < 0, d === preferredDie, interactive);
      }).join('');
    }
  }
  for (const [index, point] of points) {
    const value = game.board[index];
    const count = Math.abs(value);
    const player = value > 0 ? 'white' : 'black';
    const source = moves.some(m => m.from === index);
    const destination = selected !== null && moves.some(m => m.from === selected && m.to === index);
    point.disabled = !(source || destination);
    point.classList.toggle('selected', selected === index);
    point.classList.toggle('destination', destination);
    point.classList.toggle('movable', source);
    point.setAttribute('aria-label', `白の${index + 1}・黒の${24 - index}ポイント、${count ? `${name(player)}${count}枚` : '駒なし'}${destination ? '、移動先' : ''}`);
    point.setAttribute('aria-pressed', String(selected === index));
    point.querySelector('.stack').innerHTML = Array.from({ length: Math.min(count, 5) }, (_, i) =>
      `<span class="checker ${player}" style="--i:${i}">${i === 4 && count > 5 ? `<span class="stack-count">${count}</span>` : ''}</span>`).join('');
  }
  for (const player of ['white', 'black']) {
    const bar = bars[player];
    bar.disabled = !(game.turn === player && moves.some(m => m.from === 'bar'));
    bar.classList.toggle('selected', game.turn === player && selected === 'bar');
    bar.setAttribute('aria-label', `${name(player)}のバー、${game.bar[player]}枚`);
    bar.setAttribute('aria-pressed', String(game.turn === player && selected === 'bar'));
    bar.innerHTML = `<span class="bar-label">バー</span>${game.bar[player] ? `<span class="checker ${player}"><span class="stack-count">${game.bar[player]}</span></span>` : '<span class="empty-bar">—</span>'}`;
    const tray = trays[player];
    const destination = game.turn === player && selected !== null && moves.some(m => m.from === selected && m.to === 'off');
    tray.disabled = !destination;
    tray.classList.toggle('destination', destination);
    tray.setAttribute('aria-label', `${name(player)}の上がり、${game.off[player]}枚${destination ? '、ここへ上げる' : ''}`);
    tray.innerHTML = `<span class="tray-label">上がり</span><strong>${game.off[player]}<small>/15</small></strong><span class="borne-checkers">${'<i></i>'.repeat(game.off[player])}</span>`;
  }
}

function restart() {
  game = createGame();
  selected = null;
  preferredDie = null;
  render();
}

function openDialog(id, trigger) {
  const dialog = $(id);
  dialog.classList.toggle('facing-black', trigger?.closest('.black-rail') !== null && trigger?.closest('.black-rail') !== undefined);
  dialog.showModal();
}
$('rules-button').addEventListener('click', event => openDialog('rules-dialog', event.target));
$('reset-button').addEventListener('click', event => openDialog('reset-dialog', event.target));
$('confirm-reset').addEventListener('click', () => { $('reset-dialog').close(); restart(); });
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $(button.dataset.close).close()));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !document.querySelector('dialog[open]')) { selected = null; preferredDie = null; render(); }
});
render();
