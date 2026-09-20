const TOPICS = [
  { text: "無人島に持っていきたいものは？", low: "なくても平気", high: "絶対に必要" },
  { text: "もらったら嬉しいプレゼントは？", low: "ちょっと困る", high: "最高に嬉しい" },
  { text: "旅行先として行ってみたい場所は？", low: "あまり惹かれない", high: "今すぐ行きたい" },
  { text: "テンションが上がる食べものは？", low: "なくてもいい", high: "毎日でも食べたい" },
  { text: "家にあったら嬉しいものは？", low: "場所を取りそう", high: "生活が変わる" },
  { text: "休日にやりたいことは？", low: "気が進まない", high: "理想の休日" },
  { text: "友達になりたい架空のキャラクターは？", low: "少し不安", high: "親友になりたい" },
  { text: "生まれ変わったらなりたいものは？", low: "できれば避けたい", high: "かなり憧れる" },
  { text: "パーティーにあったら盛り上がるものは？", low: "なくてもよさそう", high: "絶対に盛り上がる" },
  { text: "1日だけ使えるなら欲しい能力は？", low: "使いどころが難しい", high: "絶対に使いたい" }
];

const screen = document.querySelector("#screen");
const dialog = document.querySelector("#rules-dialog");

let state = createInitialState();

function createInitialState() {
  return {
    phase: "home",
    playerCount: 4,
    players: [],
    currentPlayer: 0,
    topic: null
  };
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[char]);
}

function topicMarkup() {
  return `
    <article class="topic-card">
      <small>今回のお題</small>
      <p>${esc(state.topic.text)}</p>
      <div class="scale-labels"><span>1に近い<br>${esc(state.topic.low)}</span><span>100に近い<br>${esc(state.topic.high)}</span></div>
    </article>`;
}

function progressMarkup() {
  return `<div class="progress">${state.players.map((_, index) => `<span class="${index <= state.currentPlayer ? "active" : ""}"></span>`).join("")}</div>`;
}

function render() {
  screen.style.animation = "none";
  void screen.offsetHeight;
  screen.style.animation = "";

  if (state.phase === "home") {
    screen.innerHTML = `
      <p class="eyebrow">PASS & PLAY PARTY GAME</p>
      <h1>数字を見せずに、<br>ぴったり並ぼう。</h1>
      <p class="lead">1〜100の秘密の数字を、お題に沿ったことばで表現。みんなで相談して小さい順に並ぶ協力ゲームです。</p>
      <article class="hero-card">
        <div class="hero-numbers"><span>12</span><span>?</span><span>87</span></div>
        <p>スマホ1台と、3人以上の仲間がいればすぐに遊べます。</p>
      </article>
      <div class="actions"><button class="primary-button full" data-action="setup">ゲームをはじめる</button></div>`;
    return;
  }

  if (state.phase === "setup") {
    screen.innerHTML = `
      <p class="eyebrow">GAME SETUP</p>
      <h2>何人で遊ぶ？</h2>
      <p class="lead">3〜10人で遊べます。全員が画面を見られる場所で始めてください。</p>
      <section class="panel">
        <div class="count-control">
          <button class="count-button" data-action="decrease" aria-label="人数を減らす">−</button>
          <span class="count-value">${state.playerCount}</span>
          <button class="count-button" data-action="increase" aria-label="人数を増やす">＋</button>
        </div>
        <p class="helper">次の画面で全員の名前をまとめて入力します。</p>
      </section>
      <div class="actions">
        <button class="text-button" data-action="home">戻る</button>
        <button class="primary-button" data-action="names">名前を入力する</button>
      </div>`;
    return;
  }

  if (state.phase === "names") {
    screen.innerHTML = `
      <p class="eyebrow">PLAYER NAMES</p>
      <h2>遊ぶ人の名前を入力</h2>
      <p class="lead">数字を確認するときに、誰へスマホを渡すか表示します。</p>
      <section class="panel">
        <div class="name-list">
          ${Array.from({ length: state.playerCount }, (_, index) => `
            <label class="name-field" for="player-name-${index}">
              <span>プレイヤー${index + 1}</span>
              <input class="answer-input" id="player-name-${index}" maxlength="12" placeholder="名前を入力" autocomplete="off">
            </label>`).join("")}
        </div>
      </section>
      <div class="actions">
        <button class="text-button" data-action="setup">戻る</button>
        <button class="primary-button" data-action="start">数字を配る</button>
      </div>`;
    return;
  }

  if (state.phase === "pass") {
    const player = state.players[state.currentPlayer];
    screen.innerHTML = `
      ${progressMarkup()}
      ${topicMarkup()}
      <p class="eyebrow">PLAYER ${state.currentPlayer + 1} / ${state.playerCount}</p>
      <section class="pass-card">
        <div class="pass-icon">${state.currentPlayer + 1}</div>
        <h2>${esc(player.name)}さんの番です</h2>
        <p>ほかの人は画面を見ないでください。<br>準備ができたら数字を確認します。</p>
      </section>
      <div class="actions"><button class="primary-button full" data-action="reveal">自分だけ数字を見る</button></div>`;
    return;
  }

  if (state.phase === "reveal") {
    const player = state.players[state.currentPlayer];
    screen.innerHTML = `
      ${progressMarkup()}
      ${topicMarkup()}
      <p class="eyebrow">YOUR SECRET NUMBER</p>
      <section class="secret-card">
        <p class="helper">あなたの秘密の数字は</p>
        <div class="secret-number">${player.number}</div>
        <div class="secret-scale"><span>小さい</span><span>大きい</span></div>
      </section>
      <p class="lead">数字を覚えたら画面を隠して、次の人へスマホを渡してください。</p>
      <div class="actions"><button class="primary-button full" data-action="remembered">覚えた！画面を隠す</button></div>`;
    return;
  }

  if (state.phase === "discussion") {
    screen.innerHTML = `
      ${topicMarkup()}
      <p class="eyebrow">LET'S TALK</p>
      <h2>相談して並んでみよう</h2>
      <p class="lead">数字は言わず、お題に合うことばで表現してください。みんなで相談しながら、1に近い人から順番に並びましょう。</p>
      <section class="panel">
        <h3>参加メンバー</h3>
        <div class="player-list">
          ${state.players.map((player) => `<div class="player-row"><strong>${esc(player.name)}</strong><span>数字は秘密</span></div>`).join("")}
        </div>
      </section>
      <div class="actions"><button class="primary-button full" data-action="check">並べた！答えを見る</button></div>`;
    return;
  }

  if (state.phase === "result") {
    const sortedPlayers = [...state.players].sort((a, b) => a.number - b.number);
    screen.innerHTML = `
      <p class="eyebrow">ANSWER</p>
      <h2>数字を公開！</h2>
      <p class="lead">小さい数字から順番に表示しています。実際に並んだ順番と見比べてみましょう。</p>
      <section class="result-list">
        ${sortedPlayers.map((player) => resultCardMarkup(player)).join("")}
      </section>
      <div class="actions">
        <button class="secondary-button" data-action="new-topic">もう一問</button>
        <button class="primary-button" data-action="setup">人数を変える</button>
      </div>`;
  }
}

function resultCardMarkup(player) {
  return `
    <article class="result-card">
      <span class="actual-number">${player.number}</span>
      <div class="result-text"><strong>${esc(player.name)}</strong><small>秘密の数字</small></div>
    </article>`;
}

function randomNumber(excluded) {
  let number;
  do number = Math.floor(Math.random() * 100) + 1;
  while (excluded.includes(number));
  return number;
}

function startRound(keepPlayers = false) {
  const numbers = [];
  const names = keepPlayers
    ? state.players.map((player) => player.name)
    : Array.from({ length: state.playerCount }, (_, index) => document.querySelector(`#player-name-${index}`).value.trim());
  if (names.some((name) => !name)) {
    alert("全員の名前を入力してください。");
    return;
  }
  state.players = names.map((name) => {
    const number = randomNumber(numbers);
    numbers.push(number);
    return { number, name };
  });
  state.topic = TOPICS[Math.floor(Math.random() * TOPICS.length)];
  state.currentPlayer = 0;
  state.phase = "pass";
  render();
}

function moveToNextPlayer() {
  if (state.currentPlayer < state.playerCount - 1) {
    state.currentPlayer += 1;
    state.phase = "pass";
  } else {
    state.phase = "discussion";
  }
  render();
}

document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;

  if (action === "show-rules") dialog.showModal();
  if (action === "close-rules") dialog.close();
  if (action === "home") { state = createInitialState(); render(); }
  if (action === "setup") { state.phase = "setup"; render(); }
  if (action === "increase" && state.playerCount < 10) { state.playerCount += 1; render(); }
  if (action === "decrease" && state.playerCount > 3) { state.playerCount -= 1; render(); }
  if (action === "names") { state.phase = "names"; render(); }
  if (action === "start") startRound();
  if (action === "reveal") { state.phase = "reveal"; render(); }
  if (action === "remembered") moveToNextPlayer();
  if (action === "check") { state.phase = "result"; render(); }
  if (action === "new-topic") startRound(true);
});

render();
