import { chooseTurn } from './cpu.js';
self.onmessage = ({ data: { id, state, level } }) => {
  try {
    const moves = chooseTurn(state, level, { onProgress: progress => self.postMessage({ id, progress }) });
    self.postMessage({ id, moves });
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
};
