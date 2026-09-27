// Audio is decorative: playback restrictions must never interrupt a turn.
export function createGameSounds({ dice, move }) {
  for (const player of [dice, move]) player.volume = .8;

  function rewind(player) {
    player.pause();
    if (player.readyState) player.currentTime = 0;
  }

  function play(player) {
    try {
      rewind(player);
      player.play()?.catch(() => {});
    } catch {
      // A missing device or unsupported audio must not affect the board.
    }
  }

  return {
    playDice() { play(dice); },
    playMove() { play(move); },
    stop() {
      for (const player of [dice, move]) {
        try { rewind(player); } catch { /* Continue stopping the other effect. */ }
      }
    },
  };
}
