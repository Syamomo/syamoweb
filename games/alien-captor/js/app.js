/* Alien Captor — local, pass-and-play presentation. Secret state stays in this closure. */
(function () {
  'use strict';
  const G = window.AlienGame;
  const app = document.getElementById('app');
  if (!G) { app.innerHTML = '<p class="load-error">ゲームを読み込めませんでした。フォルダを展開し、index.html を開き直してください。</p>'; return; }
  let state = null;
  let locked = false;
  let selectedUnit = 0;
  let mode = 'search';
  let target = null;
  let notice = '';
  let error = '';
  const unitNames = ['01', '02', '03'];
  const unitColors = ['#318d89', '#c37a39', '#8972bc'];
  const traceNames = { yellow: '最初の潜伏 / R1', red: '中間地点 / R6', blue: '通過した痕跡' };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const alienIcon = (cls = '') => `<svg class="alien-icon ${cls}" viewBox="0 0 80 90" aria-hidden="true"><path d="M40 5C15 5 2 22 7 45c4 19 24 40 33 40s29-21 33-40C78 22 65 5 40 5Z" fill="currentColor"/><path d="M17 31c17 0 23 11 21 25-14-2-21-13-21-25Zm46 0c-17 0-23 11-21 25 14-2 21-13 21-25Z" fill="var(--ink)"/><path d="m37 67 3-2 3 2" fill="none" stroke="var(--ink)" stroke-width="2"/></svg>`;
  const heliIcon = () => '<svg class="heli-icon" viewBox="0 0 44 44" aria-hidden="true"><path d="M22 6v8M10 9h24M18 17l-3 7v8l7 4 7-4v-8l-3-7Z" fill="currentColor"/><path d="M8 22h28M12 32v6m20-6v6M9 38h26" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><path d="M19 23h6v5h-6Z" fill="var(--ink)"/></svg>';
  const shieldIcon = () => '<svg class="shield-icon" viewBox="0 0 80 90" aria-hidden="true"><path d="m40 6 29 11v27c0 18-16 30-29 38C27 74 11 62 11 44V17Z" fill="none" stroke="currentColor" stroke-width="3"/><path d="m40 23 5 13 14 1-11 9 4 14-12-8-12 8 4-14-11-9 14-1Z" fill="currentColor"/></svg>';
  const findBuilding = (id) => G.BUILDINGS.find((b) => b.id === id);
  const coord = (r, c) => ({ x: 12 + c * 19, y: 12 + r * 19 });
  const clearSelection = () => { target = null; error = ''; };
  function focusControl(action, id) {
    const control = Array.from(app.querySelectorAll('[data-action]')).find((el) => el.dataset.action === action && (id === undefined || el.dataset.id === String(id)) && !el.disabled);
    if (control) control.focus({ preventScroll: true });
  }

  function buildingArt(index) {
    const variant = (index * 3 + Math.floor(index / 5)) % 5;
    const windows = Array.from({ length: 3 }, (_, i) => `<path d="M${22 + i * 13} 36v12"/>`).join('');
    if (variant === 1) return '<svg class="building-art" viewBox="0 0 80 76" aria-hidden="true"><path class="building-shadow" d="m21 29 38-10 13 42-39 9Z"/><path class="building-side" d="m16 23 40-4 6 8v34l-40 4-6-8Z"/><path class="building-roof" d="m16 23 40-4 6 8-40 4Z"/><path class="building-detail" d="M24 37h30m-30 8h30m-30 8h30"/><path class="building-roof" d="M30 13h14v12H30Z"/></svg>';
    if (variant === 3) return '<svg class="building-art" viewBox="0 0 80 76" aria-hidden="true"><path class="building-shadow" d="M25 22h44v47H25Z"/><path class="building-side" d="M15 19h24v40H15Zm25 15h23v28H40Z"/><path class="building-roof" d="m15 19 7-6h24l-7 6Zm25 15 7-6h23l-7 6Z"/><path class="building-detail" d="M22 28v24m10-24v24m15-12v15m10-15v15"/></svg>';
    return `<svg class="building-art" viewBox="0 0 80 76" aria-hidden="true"><path class="building-shadow" d="m24 25 37-8 10 40-38 11Z"/><path class="building-side" d="M15 23h43v36H15Z"/><path class="building-roof" d="m15 23 8-9h43l-8 9Z"/><path class="building-edge" d="m58 23 8-9v36l-8 9Z"/><g class="building-detail">${windows}<path d="M23 54h27"/></g>${variant === 2 ? '<rect class="building-roof" x="30" y="9" width="16" height="10"/>' : ''}</svg>`;
  }

  function boardHtml(view, options = {}) {
    const secret = options.secret || false;
    const preview = options.preview || false;
    const finished = view.phase === 'finished';
    let legalBuildings = [], legalJunctions = [];
    if (!preview && state && !locked) {
      if (state.phase === 'setup' && state.helicopters.includes(null)) legalJunctions = G.INTERSECTIONS.filter((j) => !view.helicopters.includes(j.id)).map((j) => j.id);
      if (state.phase === 'alien') legalBuildings = G.legalAlienMoves(state);
      if (state.phase === 'defense' && !state.acted[selectedUnit]) {
        if (mode === 'search') legalBuildings = G.searchableBuildings(state, selectedUnit);
        else legalJunctions = G.legalHelicopterMoves(state, selectedUnit);
      }
    }
    const path = (secret || finished) && view.trail.length > 1 ? `<svg class="route-layer" viewBox="0 0 100 100" aria-hidden="true"><polyline points="${view.trail.map((t) => { const b = findBuilding(t.building); const p = coord(b.row, b.col); return `${p.x},${p.y}`; }).join(' ')}"/></svg>` : '';
    const buildingButtons = G.BUILDINGS.map((b, i) => {
      const p = coord(b.row, b.col);
      const trace = view.trail.find((t) => t.building === b.id);
      const current = (secret || finished) && view.alien === b.id;
      const enabled = legalBuildings.includes(b.id);
      const chosen = target === b.id;
      const label = `ビル ${b.id}${current ? ' エイリアンの現在地' : ''}${trace ? ` ${traceNames[trace.color]}${secret || finished ? ` 第${trace.round}ラウンド` : ''}` : ''}${enabled ? ' 選択可能' : ''}`;
      return `<button class="building building-${i % 5}${enabled ? ' available' : ''}${chosen ? ' selected' : ''}${trace ? ' traced' : ''}${current ? ' alien-here' : ''}" style="left:${p.x}%;top:${p.y}%" data-action="building" data-id="${b.id}" aria-label="${label}" aria-pressed="${chosen}" ${enabled ? '' : 'disabled'}><span class="building-id">${b.id}</span>${buildingArt(i)}${trace ? `<span class="trace-token ${trace.color}${secret && !trace.discovered ? ' secret-trace' : ''}" aria-hidden="true">${secret || finished ? trace.round : trace.color === 'yellow' ? '1' : trace.color === 'red' ? '6' : '•'}</span>` : ''}${current ? `<span class="alien-piece">${alienIcon()}</span>` : ''}${chosen ? '<span class="target-corners" aria-hidden="true"></span>' : ''}</button>`;
    }).join('');
    const junctionButtons = G.INTERSECTIONS.map((j) => {
      const unit = view.helicopters.indexOf(j.id);
      const enabled = legalJunctions.includes(j.id);
      const selectUnit = !preview && !locked && state?.phase === 'defense' && unit >= 0 && !state.acted[unit];
      const chosen = target === j.id;
      const active = !preview && state?.phase === 'defense' && unit === selectedUnit;
      return `<button class="junction${unit >= 0 ? ' occupied' : ''}${enabled ? ' available' : ''}${chosen ? ' selected' : ''}${active ? ' active-unit' : ''}${unit >= 0 && view.acted?.[unit] ? ' spent' : ''}" style="left:${21.5 + j.col * 19}%;top:${21.5 + j.row * 19}%;${unit >= 0 ? `--unit:${unitColors[unit]}` : ''}" data-action="${selectUnit ? 'unit' : 'junction'}" data-id="${selectUnit ? unit : j.id}" aria-label="${unit >= 0 ? `地球防衛軍 ${unitNames[unit]}号機${view.acted?.[unit] ? ' 行動済み' : ''} ` : ''}交差点 ${j.id}" ${enabled || selectUnit ? '' : 'disabled'}>${unit >= 0 ? `${heliIcon()}<span class="unit-number">${unitNames[unit]}</span>${view.acted?.[unit] ? '<span class="unit-check">✓</span>' : ''}` : '<span class="junction-dot"></span>'}</button>`;
    }).join('');
    const roads = Array.from({ length: 4 }, (_, i) => `<i class="road horizontal" style="top:${21.5 + i * 19}%"></i><i class="road vertical" style="left:${21.5 + i * 19}%"></i>`).join('');
    return `<div class="board-frame${preview ? ' preview-board' : ''}${secret ? ' secret-board' : ''}"><div class="column-labels">${['A', 'B', 'C', 'D', 'E'].map((c) => `<span>${c}</span>`).join('')}</div><div class="row-labels">${[1, 2, 3, 4, 5].map((n) => `<span>${n}</span>`).join('')}</div><div class="city-board" role="group" aria-label="都市マップ、ビル25棟と交差点16か所">${roads}${path}${buildingButtons}${junctionButtons}</div><span class="board-coordinate">35°41′ N &nbsp; 139°41′ E / SECTOR 07</span><span class="north-arrow" aria-hidden="true">N ↑</span></div>`;
  }

  function renderLobby() {
    const preview = { phase: 'preview', helicopters: ['J2', 'J12', 'J14'], trail: [], acted: [false, false, false], alien: null };
    app.innerHTML = `<section class="lobby"><div class="lobby-copy"><p class="eyebrow"><span class="live-dot"></span> UNIDENTIFIED LIFEFORM DETECTED</p><h1>潜伏せよ。<br><span>痕跡を追え。</span></h1><p class="lobby-description">この街のどこかに、エイリアンがいる。<br>残された痕跡を頼りに、地球防衛軍が迫る。<br>11ラウンドの、静かな頭脳戦。</p><div class="lobby-meta"><span><b>2–4</b> 人</span><span><b>約20</b> 分</span><span><b>1</b> 台の端末</span></div><button class="primary-button start-button" data-action="start">作戦を開始する <span>↗</span></button><p class="start-note">エイリアン1人 / 地球防衛軍1〜3人</p></div><div class="lobby-visual"><div class="visual-label"><span>LIVE SECTOR SCAN</span><span class="scan-status">SIGNAL UNKNOWN</span></div>${boardHtml(preview, { preview: true })}<div class="alien-stamp">${alienIcon()}<span>UNKNOWN<br>ENTITY_01</span></div><div class="visual-caption"><span>25 BUILDINGS</span><span>01 TARGET</span><span>03 UNITS</span></div></div></section><section class="role-briefs" aria-label="役割と目的"><article><span class="role-number">01 / ESCAPE</span><div class="brief-icon alien">${alienIcon()}</div><div><h2>エイリアン</h2><p>ビルからビルへ、姿を隠して移動する。<br>11ラウンドを逃げ切れ。</p></div><span class="role-arrow">↗</span></article><article><span class="role-number">02 / CAPTURE</span><div class="brief-icon defense">${shieldIcon()}</div><div><h2>地球防衛軍</h2><p>3機で連携し、ビルを捜索する。<br>痕跡をつなぎ、潜伏先を突き止めろ。</p></div><span class="role-arrow">⌖</span></article></section>`;
  }

  function timeline() {
    return `<section class="timeline" aria-label="現在のラウンド"><div class="timeline-label">OPERATION<br><strong>11 ROUNDS</strong></div><div class="round-track">${Array.from({ length: 11 }, (_, i) => `<div class="round-step ${i + 1 === state.round ? 'current' : ''} ${i + 1 < state.round ? 'past' : ''}"><span class="round-dot ${G.traceColor(i + 1)}">${i + 1 < state.round ? '✓' : String(i + 1).padStart(2, '0')}</span><span class="round-caption">${i === 0 ? 'START' : i === 5 ? 'MID' : i === 10 ? 'ESCAPE' : ''}</span></div>`).join('')}</div></section>`;
  }

  function unitCards(view, setup = false) {
    return `<div class="unit-list">${view.helicopters.map((position, i) => `<button class="unit-card${i === selectedUnit ? ' chosen' : ''}${view.acted[i] ? ' done' : ''}" style="--unit:${unitColors[i]}" data-action="unit" data-id="${i}" ${setup || view.acted[i] ? 'disabled' : ''} aria-pressed="${i === selectedUnit}"><span class="unit-symbol">${heliIcon()}</span><span class="unit-info"><strong>${unitNames[i]}<span>号機</span></strong><small>${position ? `交差点 ${position}` : '配備待ち'}</small></span><span class="unit-state">${setup ? position ? '配備済み' : i === selectedUnit ? '配備中' : '待機' : view.acted[i] ? '✓ 完了' : '行動可能'}</span></button>`).join('')}</div>`;
  }

  function sidebarHtml(view, secret) {
    if (state.phase === 'setup') {
      const count = view.helicopters.filter(Boolean).length;
      return `<p class="eyebrow">DEPLOYMENT / ${count} OF 3</p><h2>${count < 3 ? `${unitNames[count]}号機を配備` : '配備完了'}</h2><p class="panel-instruction">${count < 3 ? '地球防衛軍が、機体の開始位置を決めます。マップの交差点を選んでください。' : 'エイリアン役を1人決めてください。次はその人だけが画面を見て、最初の潜伏先を選びます。'}</p>${unitCards(view, true)}<div class="target-summary"><span>${count < 3 ? '配備する交差点' : '全部隊スタンバイ'}</span><strong>${count < 3 ? target || '—' : '3 / 3'}</strong></div><button class="primary-button full" data-action="commit" ${count < 3 && !target ? 'disabled' : ''}>${count < 3 ? `${unitNames[count]}号機を配備する` : 'エイリアンへ交代'} <span>→</span></button>${count > 0 ? '<button class="subtle-button full" data-action="reset-setup">配置をやり直す</button>' : ''}<p class="context-note">機体は交差点に、エイリアンはビルに。<br>それぞれ異なる場所を移動します。</p>`;
    }
    if (secret) {
      return `<p class="eyebrow alien-text">ALIEN / PRIVATE VIEW</p><div class="side-role-icon alien">${alienIcon()}</div><h2>${state.round === 1 ? '最初の潜伏先を選ぶ' : '次のビルへ潜伏する'}</h2><p class="panel-instruction">${state.round === 1 ? 'どのビルからでも始められます。防衛軍の配置を見て、逃走の起点を決めましょう。' : '光っているビルへ移動できます。過去に訪れたビルには戻れません。'}</p><div class="alien-status"><div><span>現在地</span><strong>${view.alien || '未配置'}</strong></div><div><span>移動候補</span><strong>${G.legalAlienMoves(state).length}<small> 棟</small></strong></div></div><div class="target-summary"><span>次の潜伏先</span><strong>${target || '—'}</strong></div><button class="primary-button full" data-action="commit" ${target ? '' : 'disabled'}>ここに潜伏して交代 <span>→</span></button><p class="context-note">この画面はエイリアン専用です。<br>潜伏を確定すると、自動で画面を隠します。</p><div class="private-legend"><span class="legend-route"></span><span>線と番号は、あなただけの移動履歴</span></div>`;
    }
    const remaining = view.acted.filter((x) => !x).length;
    return `<p class="eyebrow">EARTH DEFENSE FORCE</p><h2>潜伏先を突き止めろ。</h2><p class="panel-instruction">行動する機体を選び、移動か捜索を指示してください。行動順は自由です。</p><div class="unit-list-label"><span>出動部隊</span><span>残り ${remaining} アクション</span></div>${unitCards(view)}<div class="action-toggle" role="group" aria-label="行動の種類"><button class="${mode === 'move' ? 'active' : ''}" data-action="mode" data-id="move" aria-pressed="${mode === 'move'}"><span>↗</span> 移動する</button><button class="${mode === 'search' ? 'active' : ''}" data-action="mode" data-id="search" aria-pressed="${mode === 'search'}"><span>⌖</span> 捜索する</button></div><p class="action-help">${mode === 'search' ? '機体の周囲4棟から、ビルを1棟選択。' : '上下左右に隣り合う、空いた交差点を選択。'}</p><div class="target-summary"><span>${mode === 'search' ? '捜索するビル' : '移動する交差点'}</span><strong>${target || '—'}</strong></div><button class="primary-button full" data-action="commit" ${target ? '' : 'disabled'}>${unitNames[selectedUnit]}号機で${mode === 'search' ? '捜索' : '移動'}する <span>→</span></button>`;
  }

  function intelligenceHtml(view) {
    const traces = view.trail.filter((t) => t.discovered !== false);
    return `<section class="intel-section"><div class="section-heading"><h3>公開された痕跡</h3><span>${traces.length} FOUND</span></div><div class="trace-inventory">${traces.length ? traces.map((t) => `<span class="intel-trace" title="${traceNames[t.color]}"><i class="trace-dot ${t.color}"></i><b>${t.building}</b><small>${t.color === 'yellow' ? 'R1' : t.color === 'red' ? 'R6' : '—'}</small></span>`).join('') : '<p class="empty-intel">痕跡はまだ見つかっていません。</p>'}</div></section><section class="log-section"><div class="section-heading"><h3>作戦ログ</h3><span>LIVE FEED</span></div><ol class="operation-log">${view.logs.slice().reverse().map((l) => `<li><span class="log-round">R${String(l.round).padStart(2, '0')}</span><span>${esc(l.text)}</span></li>`).join('') || '<li class="empty-intel">3機を配備して作戦を開始します。</li>'}</ol></section>`;
  }

  function renderGame() {
    const secret = state.phase === 'alien' && !locked;
    const view = secret ? G.alienView(state) : G.publicView(state);
    const phaseLabel = state.phase === 'setup' ? '部隊配備' : secret ? 'エイリアンの潜伏' : '地球防衛軍の追跡';
    const guidance = state.phase === 'setup' ? state.helicopters.includes(null) ? '＋ の交差点を選んで、3機を配備してください。' : '配備完了。「エイリアンへ交代」で作戦を始めましょう。' : secret ? '枠が光っているビルから潜伏先を選んでください。' : mode === 'search' ? '捜索できるビルが光っています。1棟を選択してください。' : '移動できる交差点が光っています。1か所を選択してください。';
    app.innerHTML = `<section class="operation"><div class="operation-heading"><div><p class="eyebrow">OPERATION / SECTOR 07</p><h1>都市封鎖作戦<span class="phase-badge ${secret ? 'private' : ''}">${secret ? '● 非公開' : state.phase === 'setup' ? '準備中' : '● 共有画面'}</span></h1></div><div class="operation-status"><span>${phaseLabel}</span><strong>${String(state.round).padStart(2, '0')}<small> / 11</small></strong></div></div><div class="game-layout"><div class="map-column"><section class="map-panel"><div class="map-heading"><span><i class="live-dot"></i> TACTICAL CITY MAP</span><span>25 BLOCKS / 16 JUNCTIONS</span></div>${boardHtml(view, { secret })}<div class="map-guidance"><span aria-hidden="true">⌖</span>${guidance}</div></section>${timeline()}<div class="map-legend"><span><i class="trace-dot yellow"></i> 第1ラウンド</span><span><i class="trace-dot red"></i> 第6ラウンド</span><span><i class="trace-dot blue"></i> その他の痕跡</span></div></div><aside class="command-column"><section class="command-panel">${sidebarHtml(view, secret)}${error ? `<p class="error-message" role="alert">${esc(error)}</p>` : ''}</section>${notice ? `<div class="notice" role="status"><span>⌖</span><p>${esc(notice)}</p></div>` : ''}${intelligenceHtml(G.publicView(state))}</aside></div></section>`;
  }

  function renderHandoff() {
    const alien = state.phase === 'alien';
    app.innerHTML = `<section class="handoff" aria-labelledby="handoff-title"><div class="handoff-topline"><span>SECURE HANDOFF</span><span>ROUND ${String(state.round).padStart(2, '0')} / 11</span></div><div class="handoff-center"><div class="handoff-emblem ${alien ? 'alien' : 'defense'}">${alien ? alienIcon() : shieldIcon()}<span class="orbit orbit-one"></span><span class="orbit orbit-two"></span></div><p class="eyebrow">${alien ? 'ALIEN ACCESS ONLY' : 'EARTH DEFENSE FORCE'}</p><h1 id="handoff-title">${alien ? 'エイリアンへ交代。' : '地球防衛軍へ交代。'}</h1><p class="handoff-description">${alien ? 'エイリアン役に端末を渡してください。<br>防衛軍の人は、画面を見ないでください。' : 'エイリアンの情報を隠しました。<br>地球防衛軍のみなさんで、次の行動を相談しましょう。'}</p>${notice ? `<div class="handoff-receipt"><span>直前の報告</span><p>${esc(notice)}</p></div>` : ''}<button class="primary-button handoff-button" data-action="unlock">${alien ? 'エイリアンだけで画面を見る' : '防衛軍の画面を開く'} <span>→</span></button><p class="handoff-footnote">${alien ? '画面を隠す：右上のボタン / Esc キー' : 'エイリアン役も、防衛軍の行動を見て構いません。'}</p></div><div class="handoff-bottomline"><span>◈ IDENTITY PROTECTED</span><span>NO SIGNAL TRANSMITTED</span></div></section>`;
  }

  function renderResult() {
    const view = G.publicView(state);
    const escaped = state.winner === 'alien';
    const details = state.reason === 'captured' ? `ビル ${view.alien} でエイリアンを発見しました。` : state.reason === 'trapped' ? 'エイリアンが移動できるビルがなくなりました。' : '11ラウンドの追跡を振り切り、都市からの離脱に成功しました。';
    app.innerHTML = `<section class="result-screen"><div class="result-copy"><p class="eyebrow">OPERATION COMPLETE / ${state.reason === 'escaped' ? 'TARGET LOST' : 'SECTOR SECURED'}</p><div class="result-emblem ${escaped ? 'alien' : 'defense'}">${escaped ? alienIcon() : shieldIcon()}</div><h1>${escaped ? 'エイリアン、逃走成功。' : '地球防衛軍の勝利。'}</h1><p class="result-description">${details}</p><div class="result-stats"><div><span>最終ラウンド</span><strong>${String(state.round).padStart(2, '0')}<small> / 11</small></strong></div><div><span>訪れたビル</span><strong>${view.trail.length}<small> / 25</small></strong></div></div><button class="primary-button full" data-action="play-again">もう一度、作戦を開始 <span>↗</span></button><button class="subtle-button full" data-action="confirm-restart">タイトルへ戻る</button></div><div class="result-map"><div class="section-heading"><h2>エイリアンの逃走経路</h2><span>DECLASSIFIED</span></div>${boardHtml(view, { secret: true })}<p class="route-summary">${view.trail.map((t) => `<span><small>${t.round}</small>${t.building}</span>`).join('<i>→</i>')}</p><p class="context-note">作戦終了により、すべての痕跡と移動経路を公開しました。</p></div></section>`;
  }

  function render() {
    const previousAction = document.activeElement?.dataset.action;
    const previousId = document.activeElement?.dataset.id;
    const inGame = state && state.phase !== 'finished';
    document.getElementById('privacy-button').hidden = !inGame || locked || state.phase === 'setup';
    document.getElementById('restart-button').hidden = !state;
    document.body.dataset.screen = !state ? 'lobby' : state.phase === 'finished' ? 'result' : locked ? 'handoff' : state.phase;
    if (!state) renderLobby();
    else if (state.phase === 'finished') renderResult();
    else if (locked) renderHandoff();
    else renderGame();
    if (previousAction) focusControl(previousAction, previousId);
  }

  function start() {
    state = G.createGame(); locked = false; selectedUnit = 0; mode = 'search'; notice = ''; clearSelection(); render();
    focusControl('junction');
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function commit() {
    const phase = state.phase;
    try {
      if (phase === 'setup') {
        const count = state.helicopters.filter(Boolean).length;
        if (count === 3) { G.startGame(state); locked = true; }
        else { G.placeHelicopter(state, count, target); selectedUnit = Math.min(count + 1, 2); }
      } else if (phase === 'alien') {
        G.moveAlien(state, target); locked = state.phase !== 'finished'; selectedUnit = 0; mode = 'search'; notice = '';
      } else if (phase === 'defense') {
        const logStart = state.logs.length;
        G.actHelicopter(state, selectedUnit, mode, target);
        notice = state.logs.slice(logStart).find((entry) => ['move', 'trace', 'empty', 'capture'].includes(entry.type))?.text || '';
        if (state.phase === 'alien') { locked = true; }
        else if (state.phase === 'defense') selectedUnit = state.acted.findIndex((x) => !x);
      }
      clearSelection(); render();
      if (state.phase === 'finished') focusControl('play-again');
      else if (locked) focusControl('unlock');
      else if (state.phase === 'setup') focusControl(state.helicopters.includes(null) ? 'junction' : 'commit');
      else focusControl('unit', selectedUnit);
      if (locked || state.phase === 'finished') window.scrollTo({ top: 0, behavior: 'instant' });
    } catch (e) { error = e.message; render(); }
  }

  function conceal() {
    if (state && !locked && ['alien', 'defense'].includes(state.phase)) {
      locked = true; clearSelection(); document.getElementById('rules-dialog').close(); document.getElementById('restart-dialog').close(); render(); focusControl('unlock');
    }
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button || button.disabled) return;
    const action = button.dataset.action;
    if (action === 'home') event.preventDefault();
    if (action === 'rules') { document.getElementById('rules-dialog').showModal(); return; }
    if (action === 'close-rules') { document.getElementById('rules-dialog').close(); return; }
    if (action === 'cancel-restart') { document.getElementById('restart-dialog').close(); return; }
    if (action === 'restart' || action === 'home') { if (state) document.getElementById('restart-dialog').showModal(); return; }
    if (action === 'confirm-restart') { document.getElementById('restart-dialog').close(); state = null; locked = false; clearSelection(); notice = ''; render(); return; }
    if (action === 'start' || action === 'play-again' || action === 'reset-setup') { start(); return; }
    if (action === 'hide') { conceal(); return; }
    if (action === 'unlock') { locked = false; clearSelection(); render(); focusControl(state.phase === 'alien' ? 'building' : 'unit'); return; }
    if (!state || locked || state.phase === 'finished') return;
    if (action === 'unit' && state.phase === 'defense') { selectedUnit = Number(button.dataset.id); clearSelection(); render(); }
    if (action === 'mode' && state.phase === 'defense') { mode = button.dataset.id; clearSelection(); render(); }
    if (action === 'building' || action === 'junction') { target = button.dataset.id; error = ''; render(); focusControl('commit'); }
    if (action === 'commit') commit();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !document.querySelector('dialog[open]')) conceal();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && state?.phase === 'alien') conceal(); });
  window.addEventListener('blur', () => { if (state?.phase === 'alien') conceal(); });
  render();
})();
