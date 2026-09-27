import { legalMoves, playMove } from './engine.js';

// Own all asynchronous CPU work in one cancelable session. Reset terminates the
// worker; tokens and position identity also reject already queued callbacks.
export function createCpuSession({ getState, getLevel, isPaused, onRoll, onMove, onFinish,
  onStatus, onError, createWorker = () => new Worker(new URL('./cpu-worker.js', import.meta.url), { type: 'module' }),
  setTimer = setTimeout, clearTimer = clearTimeout }) {
  let serial = 0, worker = null, timer = null, busy = false, failed = false;
  function cleanup() {
    if (timer !== null) clearTimer(timer);
    timer = null;
    worker?.terminate(); worker = null;
  }
  function cancel() { serial++; cleanup(); busy = false; failed = false; onStatus(''); }
  function fail(error) { cleanup(); busy = false; failed = true; onStatus(''); onError(error); }
  function schedule(callback, delay, token, expected) {
    timer = setTimer(() => {
      timer = null;
      if (serial !== token || getState() !== expected) return;
      if (isPaused()) { schedule(callback, 120, token, expected); return; }
      try { callback(); } catch (error) { fail(error); }
    }, delay);
  }
  function pump() {
    const state = getState();
    if (busy || failed || isPaused() || state.turn !== 'black' || !['roll', 'moving'].includes(state.phase)) return;
    busy = true;
    const token = ++serial;
    if (state.phase === 'roll') {
      onStatus('サイコロを振ります');
      schedule(() => { busy = false; onRoll(); }, 650, token, state);
      return;
    }
    if (!legalMoves(state).length) {
      onStatus(state.off.black === 15 ? '勝利を確定します' : '手番を終えます');
      schedule(() => { busy = false; onStatus(''); onFinish(); }, 650, token, state);
      return;
    }
    onStatus('考えています…');
    try {
      worker = createWorker();
      worker.onerror = () => { if (token === serial) fail(new Error('CPU worker failed.')); };
      worker.onmessage = ({ data }) => {
        if (token !== serial || data.id !== token || getState() !== state) return;
        if (data.progress) { onStatus(`考えています… ${data.progress.done}/${data.progress.total}`); return; }
        if (data.error) { fail(new Error(data.error)); return; }
        // Validate the ENTIRE response before applying even the first move.
        try {
          if (!Array.isArray(data.moves) || data.moves.length > 4) throw new Error('Invalid CPU response.');
          let checked = state;
          for (const move of data.moves) checked = playMove(checked, move);
          if (legalMoves(checked).length) throw new Error('Incomplete CPU turn.');
        } catch (error) { fail(error); return; }
        worker.terminate(); worker = null;
        const queue = [...data.moves];
        function next() {
          const expected = getState();
          if (!queue.length) {
            onStatus('手番を終えます');
            schedule(() => { busy = false; onStatus(''); onFinish(); }, 650, token, expected);
            return;
          }
          onStatus('駒を動かしています');
          schedule(() => { onMove(queue.shift()); next(); }, 550, token, expected);
        }
        next();
      };
      // History and next real dice are intentionally absent from the request.
      worker.postMessage({ id: token, state: { ...state, history: [] }, level: getLevel() });
    } catch (error) { fail(error); }
  }
  return { pump, cancel, retry() { cancel(); pump(); } };
}
