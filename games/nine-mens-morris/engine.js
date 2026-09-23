// Ring order: top-left, top, top-right, right, bottom-right, bottom,
// bottom-left, left. Coordinates and topology share this single definition.
export const POINTS = [0, 1, 2].flatMap(r => {
  const a = 50 + r * 100, b = 650 - r * 100;
  return [[a,a],[350,a],[b,a],[b,350],[b,b],[350,b],[a,b],[a,350]];
});
export const LABELS = ['a7','d7','g7','g4','g1','d1','a1','a4',
  'b6','d6','f6','f4','f2','d2','b2','b4','c5','d5','e5','e4','e3','d3','c3','c4'];
export const MILLS = [0,8,16].flatMap(r => [[0,1,2],[2,3,4],[4,5,6],[6,7,0]].map(m => m.map(p => p+r)))
  .concat([1,3,5,7].map(p => [p,p+8,p+16]));
export const EDGES = [0,8,16].flatMap(r => Array.from({length:8}, (_,i) => [r+i,r+(i+1)%8]))
  .concat([1,3,5,7].flatMap(p => [[p,p+8],[p+8,p+16]]));
export const ADJACENT = POINTS.map((_,i) => EDGES.flatMap(([a,b]) => a===i?[b]:b===i?[a]:[]));
export const other = player => 3-player;
export const count = (state, player) => state.board.filter(p => p===player).length;
export const placing = state => state.reserve[1]+state.reserve[2]>0;
export const positionKey = state => `${state.board.join('')}:${state.turn}:${state.reserve[1]},${state.reserve[2]}`;
export const stateKey = state => `${positionKey(state)}:${state.capture}:${state.ply}:${state.quiet}:${JSON.stringify(state.result)}`;
export function createGame() {
  const state = {board:Array(24).fill(0), reserve:[0,9,9], turn:1, capture:false,
    quiet:0, ply:0, result:null, history:{}, last:null};
  state.history[positionKey(state)] = 1;
  return state;
}
export function millAt(board, point) {
  return board[point] !== 0 && MILLS.some(m => m.includes(point) && m.every(p => board[p]===board[point]));
}
export function removable(state) {
  const enemy = other(state.turn);
  const pieces = state.board.flatMap((p,i) => p===enemy?[i]:[]);
  const outside = pieces.filter(p => !millAt(state.board,p));
  return outside.length ? outside : pieces;
}
export function legalActions(state) {
  if (state.result) return [];
  if (state.capture) return removable(state).map(at => ({type:'capture',at}));
  const empty = state.board.flatMap((p,i) => p===0?[i]:[]);
  if (placing(state)) return state.reserve[state.turn]>0 ? empty.map(to => ({type:'place',to})) : [];
  const flying = count(state,state.turn)===3;
  return state.board.flatMap((p,from) => p===state.turn
    ? (flying?empty:ADJACENT[from].filter(to => state.board[to]===0)).map(to => ({type:'move',from,to})) : []);
}
export function sameAction(a,b) {
  return !!a && !!b && a.type===b.type && a.to===b.to && a.from===b.from && a.at===b.at;
}
function finishTurn(state) {
  state.capture = false;
  state.turn = other(state.turn);
  state.ply++;
  // Unplaced pieces still belong to their player. Two stones on the board
  // during the opening is not a loss.
  if (count(state,state.turn)+state.reserve[state.turn]<3) {
    state.result = {winner:other(state.turn),reason:'pieces'};
  } else if (!placing(state) && legalActions(state).length===0) {
    state.result = {winner:other(state.turn),reason:'blocked'};
  }
  const key = positionKey(state);
  state.history[key] = (state.history[key]||0)+1;
  if (!state.result && state.history[key]>=3) state.result = {winner:0,reason:'repetition'};
  if (!state.result && state.quiet>=50) state.result = {winner:0,reason:'quiet'};
  return state;
}
export function applyAction(state, action) {
  if (!legalActions(state).some(a => sameAction(a,action))) throw new Error('その手は指せません。');
  const next = {...state, board:[...state.board], reserve:[...state.reserve], history:{...state.history}};
  if (action.type==='capture') {
    next.board[action.at] = 0;
    next.quiet = 0;
    next.last = {...next.last, captured:action.at};
    return finishTurn(next);
  }
  if (action.type==='place') { next.reserve[next.turn]--; next.quiet = 0; }
  else { next.board[action.from] = 0; next.quiet++; }
  next.board[action.to] = next.turn;
  next.last = {...action,player:next.turn};
  if (millAt(next.board,action.to) && removable(next).length) {
    next.capture = true;
    return next;
  }
  return finishTurn(next);
}
// Search depth counts complete turns, including the compulsory capture.
export function turns(state) {
  return legalActions(state).flatMap(action => {
    const next = applyAction(state,action);
    if (!next.capture) return [{actions:[action],state:next}];
    return legalActions(next).map(capture => ({actions:[action,capture],state:applyAction(next,capture)}));
  });
}
export function resign(state, player=state.turn) {
  if (state.result) return state;
  return {...state, result:{winner:other(player),reason:'resign'}};
}
