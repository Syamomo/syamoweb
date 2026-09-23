import test from 'node:test';
import assert from 'node:assert/strict';
import {POINTS,MILLS,EDGES,ADJACENT,createGame,applyAction,legalActions,removable,count,millAt,turns,positionKey,resign} from '../engine.js';

export function fixture(white,black,{turn=1,reserve=[0,0,0],...rest}={}) {
  const s={...createGame(),turn,reserve,...rest};
  white.forEach(i => s.board[i]=1); black.forEach(i => s.board[i]=2);
  s.history={[positionKey(s)]:1}; return s;
}
const place=(s,to)=>applyAction(s,{type:'place',to});
const move=(s,from,to)=>applyAction(s,{type:'move',from,to});
const capture=(s,at)=>applyAction(s,{type:'capture',at});
test('standard topology: 24 unique points, 32 edges and 16 mills, no diagonals',()=>{
  assert.equal(POINTS.length,24); assert.equal(new Set(POINTS.map(p=>p.join())).size,24);
  assert.equal(EDGES.length,32); assert.equal(MILLS.length,16);
  for(const [a,b] of EDGES) { assert.ok(ADJACENT[a].includes(b)); assert.ok(ADJACENT[b].includes(a)); }
  assert.deepEqual(ADJACENT[0],[1,7]); assert.deepEqual(new Set(ADJACENT[9]),new Set([8,10,1,17]));
});
test('opening begins with nine stones each, white to move and 24 placements',()=>{
  const s=createGame(); assert.equal(s.turn,1); assert.deepEqual(s.reserve,[0,9,9]);
  assert.equal(legalActions(s).length,24); assert.ok(legalActions(s).every(a=>a.type==='place'));
});
test('placement alternates and does not mutate original state',()=>{
  const s=createGame(), next=place(s,0); assert.equal(s.board[0],0); assert.equal(s.reserve[1],9);
  assert.equal(next.board[0],1); assert.equal(next.reserve[1],8); assert.equal(next.turn,2);
  assert.equal(next.result,null); assert.equal(next.ply,1);
});
test('invalid coordinates, occupied point and movement in opening are rejected',()=>{
  const s=place(createGame(),0); const before=JSON.stringify(s);
  for(const action of [{type:'place',to:0},{type:'place',to:-1},{type:'place',to:24},{type:'move',from:0,to:1},{type:'capture',at:0}]) assert.throws(()=>applyAction(s,action));
  assert.equal(JSON.stringify(s),before);
});
test('every standard mill triggers exactly one pending capture',()=>{
  for(const mill of MILLS) {
    const foe=[...Array(24).keys()].find(i=>!mill.includes(i));
    const s=fixture(mill.slice(0,2),[foe],{reserve:[0,7,8]});
    const n=place(s,mill[2]); assert.equal(n.capture,true); assert.equal(n.turn,1); assert.equal(n.ply,0);
    assert.deepEqual(legalActions(n),[{type:'capture',at:foe}]);
  }
});
test('diagonal and center-spanning triples are not mills',()=>{
  for(const indices of [[0,8,16],[1,9,21],[7,23,3]]) {
    const s=fixture(indices,[4,12,20]); assert.equal(millAt(s.board,indices[0]),false);
  }
});
test('cannot capture protected mill while any outside stone exists',()=>{
  const s=fixture([8,9,10],[0,1,2,4],{capture:true});
  assert.deepEqual(removable(s),[4]); assert.throws(()=>capture(s,0));
  const n=capture(s,4); assert.equal(n.board[4],0); assert.equal(n.turn,2); assert.equal(n.capture,false);
});
test('when all enemy stones are in mills any of them can be captured',()=>{
  const s=fixture([8,9,10],[0,1,2],{capture:true});
  assert.deepEqual(removable(s),[0,1,2]); assert.equal(capture(s,1).result.winner,1);
});
test('two simultaneous mills still capture only one stone',()=>{
  const s=fixture([0,2,9,17],[4,6,8,10],{reserve:[0,5,5]});
  const n=place(s,1); assert.equal(n.capture,true);
  const done=capture(n,4); assert.equal(done.capture,false); assert.equal(count(done,2),3); assert.equal(done.turn,2);
});
test('capture completion is compulsory before another placement',()=>{
  const n=place(fixture([0,1],[8,10],{reserve:[0,7,7]}),2);
  assert.throws(()=>place(n,3)); assert.throws(()=>capture(n,0)); assert.equal(capture(n,8).ply,1);
});
test('unplaced pieces count toward survival in opening',()=>{
  const s=fixture([0,1,2],[8,10,12],{reserve:[0,6,6],capture:true});
  assert.equal(capture(s,8).result,null);
});
test('neither side can move until both reserves are exhausted',()=>{
  const s=fixture([0,2,4,6],[8,10,12,14],{turn:2,reserve:[0,0,1]});
  assert.ok(legalActions(s).every(a=>a.type==='place'));
  const n=place(s,17); assert.ok(legalActions(n).every(a=>a.type==='move'));
});
test('adjacent movement accepted; skipping, diagonals, occupied targets and enemy moves rejected',()=>{
  const s=fixture([0,2,4,6],[8,10,12,14]);
  assert.equal(move(s,0,1).board[1],1);
  for(const [a,b] of [[0,3],[0,8],[0,2],[8,9]]) assert.throws(()=>move(s,a,b));
});
test('flying is personal and only available at three stones after placement',()=>{
  const s=fixture([0,2,4],[8,10,12,14]);
  const n=move(s,0,23); assert.equal(n.board[23],1); assert.throws(()=>move(n,8,0));
  assert.throws(()=>move(fixture([0,2,4],[8,10,12],{reserve:[0,1,1]}),0,23));
});
test('breaking and rebuilding a mill allows another capture',()=>{
  let s=fixture([0,1,2,12],[8,10,14,20]);
  s=move(s,1,9); s=move(s,14,13); s=move(s,9,1);
  assert.equal(s.capture,true); s=capture(s,8); s=move(s,13,14);
  s=move(s,1,9); s=move(s,14,13); s=move(s,9,1); assert.equal(s.capture,true);
});
test('reducing enemy to two stones wins and freezes all actions',()=>{
  const s=capture(fixture([0,1,2,8],[10,12,14],{capture:true}),14);
  assert.deepEqual(s.result,{winner:1,reason:'pieces'}); assert.deepEqual(legalActions(s),[]);
  assert.throws(()=>move(s,10,11));
});
test('blocking every enemy move wins at the start of their turn',()=>{
  const s=fixture([1,3,5,15],[0,2,4,6]); const n=move(s,15,7);
  assert.deepEqual(n.result,{winner:1,reason:'blocked'});
});
test('threefold repetition includes board, reserves and side to move',()=>{
  let s=fixture([0,2,4,6],[8,10,12,14]);
  for(let loop=0;loop<2;loop++) { s=move(s,0,7); s=move(s,8,15); s=move(s,7,0); s=move(s,15,8); }
  assert.deepEqual(s.result,{winner:0,reason:'repetition'});
  const a=createGame(), b={...a,turn:2}, c={...a,reserve:[0,8,9]};
  assert.notEqual(positionKey(a),positionKey(b)); assert.notEqual(positionKey(a),positionKey(c));
});
test('50 non-capturing half-moves draw; capture resets the clock',()=>{
  const s=fixture([0,2,4,6],[8,10,12,14],{quiet:49});
  assert.deepEqual(move(s,0,7).result,{winner:0,reason:'quiet'});
  const c=fixture([0,1,2,8],[10,12,14,16],{quiet:50,capture:true});
  const n=capture(c,16); assert.equal(n.quiet,0); assert.equal(n.result,null);
});
test('pending mill at quiet limit is resolved before draw; win takes precedence',()=>{
  const s=fixture([0,2,9,8],[10,12,14],{quiet:49});
  const n=move(s,9,1); assert.equal(n.capture,true); assert.equal(n.result,null);
  assert.deepEqual(capture(n,10).result,{winner:1,reason:'pieces'});
});
test('resignation supports human resignation during CPU turn and preserves finished result',()=>{
  const s=resign(createGame(),2); assert.deepEqual(s.result,{winner:1,reason:'resign'});
  assert.equal(resign(s,1),s);
});
test('complete search turns include compulsory capture and leave input unchanged',()=>{
  const s=fixture([0,1],[8,10,12],{reserve:[0,7,6]}); const json=JSON.stringify(s);
  const candidates=turns(s).filter(t=>t.actions[0].to===2);
  assert.equal(candidates.length,3); assert.ok(candidates.every(t=>t.actions.length===2 && !t.state.capture && t.state.turn===2));
  assert.equal(JSON.stringify(s),json);
});
test('seeded legal games conserve stones and complete without illegal transitions',()=>{
  let seed=837; const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
  for(let game=0;game<16;game++) {
    let s=createGame(); let actions=0;
    while(!s.result && actions<700) {
      const moves=legalActions(s); assert.ok(moves.length);
      const action=moves[Math.floor(rand()*moves.length)], before=s;
      s=applyAction(s,action); actions++;
      for(const p of [1,2]) assert.ok(count(s,p)+s.reserve[p]<=9 && s.reserve[p]>=0);
      if(action.type==='capture') assert.equal(s.board.filter(Boolean).length,before.board.filter(Boolean).length-1);
    }
    assert.ok(s.result,'game should finish');
  }
});
