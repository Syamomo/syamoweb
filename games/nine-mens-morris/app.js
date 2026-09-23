import {POINTS,LABELS,EDGES,MILLS,createGame,count,placing,millAt,applyAction,resign,stateKey} from './engine.js';
import {CpuJob} from './cpu-job.js';

const $ = id => document.getElementById(id);
const colorName = p => p===1?'白':'黒';
const levelNames = ['','はじめて','やさしい','すこし考える','じっくり考える','チャレンジ'];
let state=createGame(), config={mode:'cpu',level:1,human:1}, playing=false, selected=null;
let worker=null, timer=null, watchdog=null, thinking=false, cpuError=false, pendingConfirm=null;
let drag=null, suppressClick=false;
const jobs = new CpuJob();
const svgNS = 'http://www.w3.org/2000/svg';
function line(a,b) {
  const el = document.createElementNS(svgNS,'line');
  for(const [attr,value] of Object.entries({x1:POINTS[a][0],y1:POINTS[a][1],x2:POINTS[b][0],y2:POINTS[b][1]})) el.setAttribute(attr,value);
  return el;
}
for(const [a,b] of EDGES) $('edges').append(line(a,b));
const buttons = POINTS.map(([x,y],i) => {
  const button=document.createElement('button');
  button.className='point'; button.style.left=`${x/7}%`; button.style.top=`${y/7}%`;
  button.dataset.point=i; button.tabIndex=i===0?0:-1;
  button.innerHTML='<span class="piece"></span>';
  button.addEventListener('click',() => { if(suppressClick) return; interact(i); });
  button.addEventListener('focus',() => { buttons.forEach((b,j) => b.tabIndex=j===i?0:-1); });
  button.addEventListener('keydown',event => {
    if(event.key==='Escape') { selected=null; render(); return; }
    const directions={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
    const direction=directions[event.key]; if(!direction) return;
    event.preventDefault();
    const [vx,vy]=direction;
    const candidates=POINTS.map(([px,py],j) => ({j,dx:px-x,dy:py-y}))
      .filter(p => p.dx*vx+p.dy*vy>0).sort((a,b) =>
        (Math.abs(a.dx*vy-a.dy*vx)*4+Math.hypot(a.dx,a.dy))-(Math.abs(b.dx*vy-b.dy*vx)*4+Math.hypot(b.dx,b.dy)));
    if(candidates.length) buttons[candidates[0].j].focus();
  });
  button.addEventListener('pointerdown',event => beginDrag(event,i));
  button.addEventListener('pointermove',moveDrag);
  button.addEventListener('pointerup',endDrag);
  button.addEventListener('pointercancel',cancelDrag);
  $('board').append(button);
  return button;
});

function modalOpen() { return $('rules-dialog').open || $('confirm-dialog').open; }
function cpuTurn() { return playing && !state.result && config.mode==='cpu' && state.turn!==config.human; }
function canInput() { return playing && !state.result && !thinking && !cpuTurn() && !modalOpen(); }
function playerLabel(p) { return config.mode==='local'?`${colorName(p)}のプレイヤー` : p===config.human?`あなた・${colorName(p)}`:`CPU・${colorName(p)}`; }
function stopCpu() {
  jobs.cancel(); worker?.terminate(); worker=null;
  clearTimeout(timer); clearTimeout(watchdog); timer=null; watchdog=null; thinking=false;
}
function notice(text='') { $('notice').textContent=text; }
function render() {
  buttons.forEach((button,i) => {
    const piece=state.board[i];
    button.className=`point ${piece===1?'white':piece===2?'black':''}${selected===i?' selected':''}${state.last?.to===i?' last':''}`;
    button.setAttribute('aria-label',`${LABELS[i]}、${piece?`${colorName(piece)}の駒`:'空き地点'}${selected===i?'、選択中':''}`);
    button.setAttribute('aria-pressed',selected===i?'true':'false');
    button.setAttribute('aria-disabled',canInput()?'false':'true');
  });
  $('mill-lines').replaceChildren();
  for(const m of MILLS) if(millAt(state.board,m[0]) && state.board[m[0]] && m.every(i => state.board[i]===state.board[m[0]])) $('mill-lines').append(line(m[0],m[2]));
  $('setup').hidden=playing; $('match').hidden=!playing;
  $('mobile-status').hidden=!playing;
  $('board-label').textContent=playing?(state.result?'GAME FINISHED':'THE MORRIS BOARD'):'THE MORRIS BOARD';
  $('move-count').textContent=playing?`${state.ply} 手${state.capture?' · 捕獲中':''}`:'24の交点・9つの駒';
  if(!playing) return;
  $('match-kind').textContent=config.mode==='cpu'?`VS COMPUTER / Lv.${config.level} ${levelNames[config.level]}`:'LOCAL / ふたりで対戦';
  const phase=placing(state)?'place':count(state,state.turn)===3?'fly':'move';
  document.querySelectorAll('[data-phase]').forEach(el => el.classList.toggle('active',el.dataset.phase===phase));
  for(const p of [1,2]) {
    $(`player-${p}`).classList.toggle('active',!state.result && state.turn===p);
    $(`name-${p}`).textContent=playerLabel(p);
    $(`turn-${p}`).hidden=!!state.result || state.turn!==p;
    $(`pieces-${p}`).textContent=`盤上 ${count(state,p)} · 未配置 ${state.reserve[p]}`;
    $(`lost-${p}`).textContent=`取られた駒 ${9-count(state,p)-state.reserve[p]}`;
    const tray=$(`reserve-${p}`); tray.replaceChildren();
    for(let i=0;i<9;i++) { const dot=document.createElement('i'); dot.className=`stone ${i<state.reserve[p]?(p===1?'white':'black'):'used'}`; dot.setAttribute('aria-hidden','true'); tray.append(dot); }
    tray.setAttribute('aria-label',`${colorName(p)}の未配置の駒、${state.reserve[p]}個`);
  }
  $('retry').hidden=!cpuError;
  $('finished-actions').hidden=!state.result;
  $('resign').hidden=!!state.result;
  if(state.result) {
    const {winner,reason}=state.result;
    $('status-kicker').textContent=winner?'GAME SET':'DRAW';
    $('status-title').textContent=winner?`${colorName(winner)}の勝利`:'引き分け';
    $('status-detail').textContent={pieces:`${colorName(3-winner)}の残りの駒が2個になりました。`,blocked:`${colorName(3-winner)}が動かせなくなりました。`,resign:`${colorName(3-winner)}が投了しました。`,repetition:'同じ局面が3回現れました。',quiet:'捕獲なしで50手（各25手）が続きました。'}[reason];
  } else if(cpuError) {
    $('status-kicker').textContent='PAUSED'; $('status-title').textContent='計算を再試行できます'; $('status-detail').textContent='対局はそのまま保持しています。';
  } else {
    $('status-kicker').textContent=state.capture?'MILL!':phase==='place'?'PLACE A STONE':phase==='fly'?'FLY TO ANY POINT':'MOVE A STONE';
    $('status-title').textContent=state.capture?`${colorName(state.turn)}のミル！`:thinking?'CPUが考えています':`${colorName(state.turn)}の番です`;
    $('status-detail').textContent=state.capture?(cpuTurn()?'CPUが相手の駒を1個取ります。':'相手の駒を1個選んで、取り除いてください。')
      :thinking?'少しだけ、お待ちください。':phase==='place'?'空いている交点に、駒を1個置いてください。'
      :phase==='fly'?'残り3個。どの空き地点へも移動できます。':'自分の駒と、線でつながる隣の空き地点を選んでください。';
  }
  $('mobile-title').textContent=$('status-title').textContent;
  $('mobile-detail').textContent=$('status-detail').textContent;
}
function commit(action) {
  try { state=applyAction(state,action); selected=null; notice(); render(); requestCpu(); return true; }
  catch(error) { notice(state.capture?'ミルの外にある相手の駒を選んでください。':error.message); return false; }
}
function interact(point) {
  if(!canInput()) return;
  notice();
  if(state.capture) { commit({type:'capture',at:point}); return; }
  if(placing(state)) { commit({type:'place',to:point}); return; }
  if(state.board[point]===state.turn) { selected=selected===point?null:point; render(); return; }
  if(selected===null) { notice('先に、自分の駒を選んでください。'); return; }
  commit({type:'move',from:selected,to:point});
}
function cpuFailed(error) { stopCpu(); cpuError=true; notice(error.message || 'CPUの計算に失敗しました。'); render(); }
function requestCpu() {
  if(!cpuTurn() || modalOpen() || thinking || cpuError) return;
  thinking=true; const job=jobs.begin(state); const started=performance.now(); const seed=crypto.getRandomValues(new Uint32Array(1))[0];
  render();
  try {
    worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});
    worker.onerror=() => { if(jobs.current?.id===job.id) cpuFailed(new Error('CPUを読み込めませんでした。再試行してください。')); };
    watchdog=setTimeout(() => { if(jobs.current?.id===job.id) cpuFailed(new Error('CPUの応答がありません。再試行してください。')); },8000);
    worker.onmessage=({data}) => {
      if(jobs.current?.id!==job.id) return;
      worker?.terminate(); worker=null; clearTimeout(watchdog);
      timer=setTimeout(() => {
        let actions;
        try { actions=jobs.accept(data,state,cpuTurn() && !modalOpen()); }
        catch(error) { cpuFailed(error); return; }
        if(!actions) return;
        const serial=jobs.serial;
        state=applyAction(state,actions[0]); render();
        if(actions.length===2) {
          const key=stateKey(state);
          timer=setTimeout(() => {
            if(jobs.serial!==serial || stateKey(state)!==key || modalOpen() || !cpuTurn()) return;
            state=applyAction(state,actions[1]); thinking=false; render();
          },550);
        } else { thinking=false; render(); }
      },Math.max(0,430-(performance.now()-started)));
    };
    worker.postMessage({...job,state,level:config.level,seed});
  } catch(error) { cpuFailed(error); }
}
function startGame() {
  stopCpu(); cancelDrag(); state=createGame(); playing=true; selected=null; cpuError=false;
  notice(); render(); requestCpu();
  $('board').scrollIntoView({behavior:'instant',block:'nearest'});
}
function toSetup() { stopCpu(); cancelDrag(); playing=false; selected=null; cpuError=false; state=createGame(); notice(); render(); $('setup-form').querySelector('button[type="submit"]').focus(); }
$('setup-form').addEventListener('change',() => {
  const local=new FormData($('setup-form')).get('mode')==='local';
  $('cpu-options').hidden=local; $('local-note').hidden=!local;
});
$('setup-form').addEventListener('submit',event => {
  event.preventDefault(); const data=new FormData(event.currentTarget);
  config={mode:data.get('mode'),human:Number(data.get('color')),level:Number($('level').value)};
  startGame();
});
$('retry').addEventListener('click',() => { cpuError=false; notice(); requestCpu(); });
$('again').addEventListener('click',startGame);
function showConfirmation(type) {
  if(!playing || modalOpen()) return;
  if(state.result) { toSetup(); return; }
  stopCpu(); cancelDrag(); pendingConfirm=type; render();
  $('confirm-title').textContent=type==='resign'?`${colorName(config.mode==='cpu'?config.human:state.turn)}が投了しますか？`:'設定に戻りますか？';
  $('confirm-description').textContent=type==='resign'?'相手の勝ちとして、この対局を終了します。':'現在の対局を終了して、新しい対局の設定に戻ります。';
  $('confirm-ok').textContent=type==='resign'?'投了する':'設定に戻る';
  $('confirm-dialog').showModal(); $('confirm-cancel').focus();
}
$('new-game').addEventListener('click',() => showConfirmation('new'));
$('resign').addEventListener('click',() => showConfirmation('resign'));
$('confirm-cancel').addEventListener('click',() => $('confirm-dialog').close());
$('confirm-ok').addEventListener('click',() => {
  const type=pendingConfirm; pendingConfirm=null;
  if(type==='new') toSetup();
  else { stopCpu(); state=resign(state,config.mode==='cpu'?config.human:state.turn); selected=null; cpuError=false; notice(); render(); }
  $('confirm-dialog').close();
});
$('confirm-dialog').addEventListener('close',() => { pendingConfirm=null; render(); requestCpu(); });
$('rules-open').addEventListener('click',() => { stopCpu(); cancelDrag(); $('rules-dialog').showModal(); render(); });
$('rules-close').addEventListener('click',() => $('rules-dialog').close());
$('rules-dialog').addEventListener('close',() => { render(); requestCpu(); });

function beginDrag(event,point) {
  if(event.button!==0 || !canInput() || placing(state) || state.capture || state.board[point]!==state.turn) return;
  drag={point,x:event.clientX,y:event.clientY,id:event.pointerId,active:false,ghost:null};
  event.currentTarget.setPointerCapture(event.pointerId);
}
function moveDrag(event) {
  if(!drag || event.pointerId!==drag.id) return;
  if(!drag.active && Math.hypot(event.clientX-drag.x,event.clientY-drag.y)>7) {
    drag.active=true; selected=drag.point; render();
    buttons[drag.point].classList.add('dragging');
    const ghost=document.createElement('div'); ghost.className=`drag-ghost ${state.turn===1?'white':'black'}`; ghost.innerHTML='<div class="piece"></div>';
    const size=buttons[drag.point].getBoundingClientRect().width*.79; ghost.style.width=`${size}px`; ghost.style.height=`${size}px`;
    document.body.append(ghost); drag.ghost=ghost;
  }
  if(drag.ghost) { drag.ghost.style.left=`${event.clientX}px`; drag.ghost.style.top=`${event.clientY}px`; }
}
function endDrag(event) {
  if(!drag || event.pointerId!==drag.id) return;
  const from=drag.point, active=drag.active;
  cancelDrag();
  if(!active) return;
  suppressClick=true; setTimeout(() => suppressClick=false,0);
  const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-point]');
  if(target && Number(target.dataset.point)!==from && canInput()) commit({type:'move',from,to:Number(target.dataset.point)});
  else { notice('移動先の交点に駒を置いてください。'); render(); }
}
function cancelDrag() {
  if(drag) { const button=buttons[drag.point]; if(button.hasPointerCapture(drag.id)) button.releasePointerCapture(drag.id); drag.ghost?.remove(); button.classList.remove('dragging'); }
  drag=null;
}
render();
