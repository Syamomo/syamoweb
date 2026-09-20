const setupPanel = document.querySelector("#setup-panel");
const setupForm = document.querySelector("#setup-form");
const stoneCountInput = document.querySelector("#stone-count");
const gameScreen = document.querySelector("#game-screen");
const topPockets = document.querySelector("#top-pockets");
const bottomPockets = document.querySelector("#bottom-pockets");
const goalA = document.querySelector("#goal-a");
const goalB = document.querySelector("#goal-b");
const message = document.querySelector("#message");
const subMessage = document.querySelector("#sub-message");
const restartButton = document.querySelector("#restart-button");
const sameSettingsButton = document.querySelector("#same-settings-button");
const turnBadges = document.querySelectorAll("[data-turn-badge]");

const playerNames = ["Aさん", "Bさん"];
const pocketIndexes = [
  [0, 1, 2, 3, 4, 5],
  [7, 8, 9, 10, 11, 12],
];
const goalIndexes = [6, 13];
const sowDelayMs = 185;

let state = createState(4, 0);
let audioContext = null;

function createState(stonesPerPocket, firstPlayer) {
  return {
    board: [
      stonesPerPocket,
      stonesPerPocket,
      stonesPerPocket,
      stonesPerPocket,
      stonesPerPocket,
      stonesPerPocket,
      0,
      stonesPerPocket,
      stonesPerPocket,
      stonesPerPocket,
      stonesPerPocket,
      stonesPerPocket,
      stonesPerPocket,
      0,
    ],
    currentPlayer: firstPlayer,
    stonesPerPocket,
    firstPlayer,
    winner: null,
    lastMove: null,
    animatingHole: null,
    isAnimating: false,
  };
}

function renderPockets() {
  topPockets.innerHTML = pocketIndexes[1]
    .slice()
    .reverse()
    .map((index) => renderPocket(index, 1))
    .join("");

  bottomPockets.innerHTML = pocketIndexes[0]
    .map((index) => renderPocket(index, 0))
    .join("");
}

function renderPocket(index, owner) {
  const stones = state.board[index];
  const canPlay =
    state.winner === null &&
    !state.isAnimating &&
    owner === state.currentPlayer &&
    stones > 0;
  const labelNumber = index + 1;
  const stoneDots = Array.from({ length: Math.min(stones, 18) })
    .map((_, dotIndex) => {
      const x = 8 + (dotIndex % 6) * 16 + (Math.floor(dotIndex / 6) % 2) * 5;
      const y = 6 + Math.floor(dotIndex / 6) * 30 + (dotIndex % 2) * 6;
      return `<span style="--x:${x}%; --y:${y}%"></span>`;
    })
    .join("");

  return `
    <button
      class="pocket ${canPlay ? "is-playable" : ""} ${state.lastMove === index ? "is-last" : ""} ${state.animatingHole === index ? "is-animating" : ""}"
      type="button"
      data-index="${index}"
      ${canPlay ? "" : "disabled"}
      aria-label="${playerNames[owner]} ポケット${labelNumber} 石${stones}個"
    >
      <span class="pocket-number">${labelNumber}</span>
      <span class="stones" aria-hidden="true">${stoneDots}</span>
      <strong>${stones}</strong>
    </button>
  `;
}

function render() {
  renderPockets();
  goalA.textContent = state.board[6];
  goalB.textContent = state.board[13];
  goalA.closest(".goal").classList.toggle("is-animating", state.animatingHole === 6);
  goalB.closest(".goal").classList.toggle("is-animating", state.animatingHole === 13);

  turnBadges.forEach((badge) => {
    const isActive =
      Number(badge.dataset.turnBadge) === state.currentPlayer &&
      state.winner === null &&
      !state.isAnimating;
    badge.classList.toggle("is-active", isActive);
  });

  if (state.winner !== null) {
    message.textContent = `${playerNames[state.winner]}の勝ち`;
    subMessage.textContent = "自分の陣地の石がすべてなくなりました。";
    gameScreen.classList.add("is-finished");
    return;
  }

  gameScreen.classList.remove("is-finished");

  if (state.isAnimating) {
    message.textContent = `${playerNames[state.currentPlayer]}が配っています`;
    subMessage.textContent = "石を反時計回りに1個ずつ置いていきます。";
    return;
  }

  message.textContent = `${playerNames[state.currentPlayer]}の番です`;
  subMessage.textContent =
    state.lastMove === goalIndexes[state.currentPlayer]
      ? "最後の石がゴールに入りました。続けてもう一度できます。"
      : "石が入っている自分のポケットを選んでください。";
}

async function playPocket(index) {
  if (state.winner !== null || state.isAnimating) return;

  const owner = index < 6 ? 0 : index > 6 && index < 13 ? 1 : null;
  if (owner !== state.currentPlayer || state.board[index] === 0) return;

  await unlockAudio();
  let stones = state.board[index];
  let cursor = index;

  state.board[index] = 0;
  state.lastMove = null;
  state.animatingHole = index;
  state.isAnimating = true;
  render();
  playPickSound();
  await wait(sowDelayMs);

  while (stones > 0) {
    cursor = (cursor + 1) % state.board.length;
    state.board[cursor] += 1;
    stones -= 1;
    state.lastMove = cursor;
    state.animatingHole = cursor;
    render();
    playDropSound(cursor === 6 || cursor === 13);
    await wait(sowDelayMs);
  }

  state.animatingHole = null;
  state.isAnimating = false;
  updateWinner();

  if (state.winner !== null) {
    playWinSound();
  } else if (cursor !== 6 && cursor !== 13) {
    state.currentPlayer = 1 - state.currentPlayer;
  } else {
    playGoalTurnSound();
  }

  render();
}

function updateWinner() {
  const aEmpty = pocketIndexes[0].every((index) => state.board[index] === 0);
  const bEmpty = pocketIndexes[1].every((index) => state.board[index] === 0);

  if (aEmpty) state.winner = 0;
  if (bEmpty) state.winner = 1;
}

function startGame(stonesPerPocket, firstPlayer) {
  state = createState(stonesPerPocket, firstPlayer);
  setupPanel.classList.add("is-hidden");
  gameScreen.classList.remove("is-hidden");
  render();
}

function backToSetup() {
  gameScreen.classList.add("is-hidden");
  setupPanel.classList.remove("is-hidden");
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function unlockAudio() {
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    audioContext = new AudioContextClass();
  }

  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }
}

function playTone({ frequency, duration, type = "sine", volume = 0.12, slideTo = null }) {
  if (!audioContext) return;

  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);
  if (slideTo !== null) {
    oscillator.frequency.exponentialRampToValueAtTime(slideTo, now + duration);
  }

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.02);
}

function playPickSound() {
  playTone({ frequency: 180, duration: 0.08, type: "triangle", volume: 0.09, slideTo: 130 });
}

function playDropSound(isGoal) {
  if (isGoal) {
    playTone({ frequency: 620, duration: 0.11, type: "sine", volume: 0.13, slideTo: 780 });
    return;
  }

  playTone({ frequency: 330, duration: 0.055, type: "square", volume: 0.055, slideTo: 280 });
}

function playGoalTurnSound() {
  playTone({ frequency: 520, duration: 0.1, type: "sine", volume: 0.1, slideTo: 700 });
  setTimeout(() => {
    playTone({ frequency: 760, duration: 0.12, type: "sine", volume: 0.1, slideTo: 920 });
  }, 90);
}

function playWinSound() {
  [420, 560, 760].forEach((frequency, index) => {
    setTimeout(() => {
      playTone({ frequency, duration: 0.16, type: "triangle", volume: 0.12, slideTo: frequency * 1.18 });
    }, index * 110);
  });
}

setupForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(setupForm);
  const stonesPerPocket = Math.max(1, Math.min(12, Number(stoneCountInput.value) || 4));
  const firstPlayer = Number(data.get("first-player")) || 0;
  stoneCountInput.value = String(stonesPerPocket);
  startGame(stonesPerPocket, firstPlayer);
});

gameScreen.addEventListener("click", (event) => {
  const pocket = event.target.closest("[data-index]");
  if (!pocket) return;
  playPocket(Number(pocket.dataset.index));
});

restartButton.addEventListener("click", backToSetup);

sameSettingsButton.addEventListener("click", () => {
  startGame(state.stonesPerPocket, state.firstPlayer);
});
