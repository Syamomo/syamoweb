import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseTurn,evaluate} from '../ai.js';
import {CpuJob} from '../cpu-job.js';
import {createGame,applyAction,positionKey} from '../engine.js';
const fixture=(white,black,extra={})=>{const s={...createGame(),reserve:[0,0,0],...extra}; white.forEach(i=>s.board[i]=1);black.forEach(i=>s.board[i]=2);s.history={[positionKey(s)]:1};return s;};
test('all five levels return legal complete turns in placement, movement, flying and capture',()=>{
  const states=[createGame(),fixture([0,2,4,6],[8,10,12,14]),fixture([0,2,4],[8,10,12,14]),fixture([0,1,2,8],[10,12,14,16],{capture:true})];
  for(const s of states) for(let level=1;level<=5;level++) {
    const before=JSON.stringify(s), answer=chooseTurn(s,level,{seed:43,maxTimeMs:5000,maxNodes:4000});
    let next=s; for(const a of answer.actions) next=applyAction(next,a);
    assert.ok(next.result || next.turn!==s.turn); assert.equal(next.capture,false);
    assert.equal(JSON.stringify(s),before); assert.ok(answer.diagnostics.depth>=1);
  }
});
test('fixed seed and completed depth reproduce selection',()=>{
  const s=createGame(); const opt={seed:74,now:()=>0,maxNodes:5000};
  assert.deepEqual(chooseTurn(s,3,opt),chooseTurn(s,3,opt));
});
test('unfinished deeper iteration keeps scores from last completed depth',()=>{
  const answer=chooseTurn(createGame(),5,{seed:4,maxNodes:25,now:()=>0});
  assert.equal(answer.diagnostics.depth,1); assert.equal(answer.actions.length,1);
});
test('no completed root evaluation reports error instead of unexamined random move',()=>{
  assert.throws(()=>chooseTurn(createGame(),5,{maxNodes:1,now:()=>0}),/計算を完了/);
});
test('terminal scores dominate material; draws score zero',()=>{
  assert.equal(evaluate({...createGame(),result:{winner:1}},1),100000);
  assert.equal(evaluate({...createGame(),result:{winner:2}},1),-100000);
  assert.equal(evaluate({...createGame(),result:{winner:0}},1),0);
});
test('gentle levels overlook tactics more often than challenge across seeded choices',()=>{
  const s=fixture([0,1,9,12],[8,10,14,20],{reserve:[0,5,5]});
  const losses=[];
  for(const level of [1,5]) {
    let total=0; for(let seed=1;seed<=80;seed++) total+=chooseTurn(s,level,{seed,maxNodes:100,now:()=>0}).diagnostics.loss;
    losses.push(total/80);
  }
  assert.ok(losses[0]>losses[1]+10,`${losses}`);
  console.log(`Same-position mean evaluation loss, Lv1 / Lv5: ${losses.map(v=>v.toFixed(1)).join(' / ')}`);
});
test('CPU response accepted once and only for original active position',()=>{
  const jobs=new CpuJob(), s=createGame(), job=jobs.begin(s), response={...job,actions:[{type:'place',to:0}]};
  assert.deepEqual(jobs.accept(response,s,true),response.actions); assert.equal(jobs.accept(response,s,true),null);
  const old=jobs.begin(s); jobs.cancel(); assert.equal(jobs.accept({...old,actions:response.actions},s,true),null);
  const current=jobs.begin(s); assert.equal(jobs.accept({...current,actions:response.actions},applyAction(s,{type:'place',to:1}),true),null);
  assert.equal(jobs.accept({...current,actions:response.actions},s,false),null);
});
test('restarting at identical position invalidates old response; malformed or incomplete moves rejected',()=>{
  const jobs=new CpuJob(), s=createGame(), old=jobs.begin(s); jobs.begin(s);
  assert.equal(jobs.accept({...old,actions:[{type:'place',to:0}]},s,true),null);
  const bad=jobs.begin(s); assert.throws(()=>jobs.accept({...bad,actions:[{type:'place',to:30}]},s,true));
  const mill=fixture([0,1],[8,10],{reserve:[0,7,7]}); const incomplete=jobs.begin(mill);
  assert.throws(()=>jobs.accept({...incomplete,actions:[{type:'place',to:2}]},mill,true),/完了/);
  const excess=jobs.begin(s); assert.throws(()=>jobs.accept({...excess,actions:[{type:'place',to:0},{type:'place',to:1}]},s,true),/手数/);
});
