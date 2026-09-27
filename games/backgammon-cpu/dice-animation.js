// Animation changes only the presentation. The caller supplies the two actual dice.
export const ROLL_TIMING = Object.freeze({ first: 720, second: 1080, complete: 1240, frame: 85 });

export function createDiceAnimator({
  onFrame, onComplete,
  setTimer = (callback, delay) => setTimeout(callback, delay),
  clearTimer = handle => clearTimeout(handle),
  visualDie = () => Math.floor(Math.random() * 6) + 1,
}) {
  let active = false;
  let generation = 0;
  const pending = new Set();

  function cancel() {
    generation++;
    active = false;
    for (const handle of pending) clearTimer(handle);
    pending.clear();
  }

  function start(dice) {
    if (active) return false;
    if (!Array.isArray(dice) || dice.length !== 2 || dice.some(d => !Number.isInteger(d) || d < 1 || d > 6)) {
      throw new Error('Animation needs two valid dice.');
    }
    active = true;
    const ticket = ++generation;
    const final = [...dice];
    const values = [visualDie(), visualDie()];
    const stopped = [false, false];
    const emit = () => onFrame({ values: [...values], stopped: [...stopped] });
    function later(callback, delay) {
      const handle = setTimer(() => {
        pending.delete(handle);
        if (active && ticket === generation) callback();
      }, delay);
      pending.add(handle);
    }
    function tick() {
      for (let i = 0; i < 2; i++) if (!stopped[i]) {
        // Avoid showing the same decorative face twice in succession.
        const next = visualDie();
        values[i] = next === values[i] ? next % 6 + 1 : next;
      }
      emit();
      if (!stopped.every(Boolean)) later(tick, ROLL_TIMING.frame);
    }
    emit();
    later(tick, ROLL_TIMING.frame);
    [ROLL_TIMING.first, ROLL_TIMING.second].forEach((delay, index) => {
      later(() => { stopped[index] = true; values[index] = final[index]; emit(); }, delay);
    });
    later(() => {
      cancel();
      onComplete([...final]);
    }, ROLL_TIMING.complete);
    return true;
  }
  return { start, cancel, get active() { return active; } };
}
