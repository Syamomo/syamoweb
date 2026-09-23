import {Game,PIECES,pieceById} from './engine.js';
import {BoardScene} from './scene.js';

const game = new Game();
const $ = id => document.getElementById(id);
const name = owner => owner === 'cat' ? 'ねこ' : 'いぬ';
const sizeName = size => ['','小','中','大'][size];
const canvas = $('board');
let scene;
let gesture=null;
let keyboardCell=4;
let nextFirst='dog';
try {
  scene=new BoardScene(canvas,game);
  $('loading').hidden=true;
} catch(error) {
  $('loading').textContent='立体盤面を表示できませんでした。Chromeを更新し、グラフィック アクセラレーションを有効にして、もう一度開いてください。';
  console.error('3D initialization failed',error);
}

function update(message) {
  $('turn-title').textContent=game.winner?`${name(game.winner)}の勝ち！`:`${name(game.turn)}のばん`;
  $('turn-title').style.color=game.winner==='dog'||!game.winner&&game.turn==='dog'?'var(--dog)':'var(--cat)';
  $('turn-caption').textContent=game.winner?'WELL PLAYED':game.held?'KEEP MOVING':'YOUR TURN';
  for(const owner of ['cat','dog'])$(owner+'-tag').classList.toggle('active',(game.winner??game.turn)===owner);
  $('move-count').textContent=`${game.moves+1}手目`;
  $('instruction').textContent=message??(game.winner?'もういちど、勝負しよう！':game.held?'持ち上げた駒を、別のマスへ動かしてね':'手元や盤上の自分の駒を、マスまでドラッグ');
  $('winner-panel').hidden=!game.winner;
  $('undo-button').disabled=!game.canUndo();
  $('undo-button').title=game.held&&!game.winner?'駒を置き終わってから戻せます':game.canUndo()?'1手戻す':'まだ戻せる手がありません';
  if(game.winner){
    $('winner-title').textContent=`${name(game.winner)}の勝ち！`;
    $('winner-description').textContent=game.winReason==='uncover'?'持ち上げた下の駒で、3つ並びました。':'見えている駒が、3つ並びました。';
  }
  scene?.sync();
  updateKeyboard();
}

function updateKeyboard(){
  const controls=$('keyboard-controls');
  const activeId=document.activeElement?.dataset?.piece;
  controls.replaceChildren();
  for(const piece of PIECES.filter(p=>game.canLift(p.id))){
    const button=document.createElement('button');button.type='button';button.dataset.piece=piece.id;
    const location=game.locate(piece.id);
    button.textContent=`${name(piece.owner)} ${sizeName(piece.size)} ${Number(piece.id.at(-1))+1}（${game.held?.piece.id===piece.id?'移動中':location===null?'手元':`${Math.floor(location/3)+1}行${location%3+1}列`}）`;
    button.addEventListener('keydown',event=>{if((event.key==='Enter'||event.key===' ')&&event.repeat)event.preventDefault();});
    button.addEventListener('click',()=>{
      if(gesture||!scene)return;
      if(!game.lift(piece.id).ok)return;
      keyboardCell=4;
      scene.keyboardCell=keyboardCell;
      update();canvas.focus();
    });
    controls.append(button);
    if(piece.id===activeId)button.focus();
  }
}

function endGesture(commit,event){
  if(!gesture)return;
  const current=gesture;gesture=null;canvas.classList.remove('dragging');
  if(canvas.hasPointerCapture(current.pointerId))canvas.releasePointerCapture(current.pointerId);
  if(!current.started)return;
  let message;
  if(!game.winner){
    const cell=commit?scene.target(event.clientX,event.clientY):-1;
    if(commit&&game.drop(cell).ok)message=undefined;
    else if(game.cancelReserve())message='手元に戻したよ。駒を選んでドラッグしよう';
    else message='この駒をつかみ直して、別のマスへ動かしてね';
  }
  scene.finishDrag();update(message);
}

canvas.addEventListener('pointerdown',event=>{
  if(!scene||gesture||game.winner||!event.isPrimary||(event.pointerType==='mouse'&&event.button!==0)||document.querySelector('dialog[open]'))return;
  const id=scene.pick(event.clientX,event.clientY);
  if(!id)return;
  if(!game.canLift(id)){
    const message=game.held?'持ち上げた駒を、先に動かしてね':pieceById(id).owner!==game.turn?`今は${name(game.turn)}のばんだよ`:'この駒を置けるマスがないよ';
    $('instruction').textContent=message;return;
  }
  gesture={id,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,started:false,touch:event.pointerType==='touch'};
  canvas.setPointerCapture(event.pointerId);
  event.preventDefault();
});
canvas.addEventListener('pointermove',event=>{
  if(!gesture||event.pointerId!==gesture.pointerId)return;
  event.preventDefault();
  if(!gesture.started){
    if(Math.hypot(event.clientX-gesture.startX,event.clientY-gesture.startY)<8)return;
    if(!game.lift(gesture.id).ok){endGesture(false,event);return;}
    gesture.started=true;canvas.classList.add('dragging');
    update();
    if(game.winner){endGesture(false,event);return;}
  }
  scene.dragTo(gesture.id,event.clientX,event.clientY,gesture.touch);
});
canvas.addEventListener('pointerup',event=>{if(gesture?.pointerId===event.pointerId)endGesture(true,event);});
canvas.addEventListener('pointercancel',event=>{if(gesture?.pointerId===event.pointerId)endGesture(false,event);});
canvas.addEventListener('lostpointercapture',event=>{if(gesture?.pointerId===event.pointerId)endGesture(false,event);});
window.addEventListener('blur',()=>endGesture(false,{}));
document.addEventListener('visibilitychange',()=>{if(document.hidden)endGesture(false,{});else scene?.invalidate();});
canvas.addEventListener('contextmenu',event=>event.preventDefault());
canvas.addEventListener('keydown',event=>{
  if(!scene||game.winner||gesture)return;
  if(event.key==='Enter'&&event.repeat){event.preventDefault();return;}
  if(!game.held&&event.key==='Enter'){
    document.querySelector('.keyboard-help').open=true;
    $('keyboard-controls').querySelector('button')?.focus();event.preventDefault();return;
  }
  if(!game.held)return;
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter','Escape'].includes(event.key))event.preventDefault();
  if(event.key==='ArrowLeft')keyboardCell=Math.max(Math.floor(keyboardCell/3)*3,keyboardCell-1);
  if(event.key==='ArrowRight')keyboardCell=Math.min(Math.floor(keyboardCell/3)*3+2,keyboardCell+1);
  if(event.key==='ArrowUp'&&keyboardCell>=3)keyboardCell-=3;
  if(event.key==='ArrowDown'&&keyboardCell<=5)keyboardCell+=3;
  if(event.key==='Enter'){
    const dropped=game.drop(keyboardCell).ok;
    scene.keyboardCell=dropped?-1:keyboardCell;
    update(dropped?undefined:'ここには置けないよ。別のマスを選んでね');return;
  }
  if(event.key==='Escape'){
    if(game.cancelReserve()){scene.keyboardCell=-1;update();return;}
    update('盤上から持ち上げた駒は、別のマスへ動かしてね');return;
  }
  scene.keyboardCell=keyboardCell;scene.updateTargets();scene.invalidate();
  $('instruction').textContent=`${Math.floor(keyboardCell/3)+1}行${keyboardCell%3+1}列。${game.canDrop(keyboardCell)?'Enterで置く':'ここには置けません'}`;
});

function openDialog(id){endGesture(false,{});$(id).showModal();}
$('help-button').addEventListener('click',()=>openDialog('help-dialog'));
$('undo-button').addEventListener('click',()=>{
  if(!game.canUndo())return;
  endGesture(false,{});
  if(!game.undo().ok)return;
  keyboardCell=4;
  if(scene){scene.draggingId=null;scene.hover=-1;scene.keyboardCell=-1;}
  update(`1手戻したよ。${name(game.turn)}のばんです`);
});
$('reset-button').addEventListener('click',()=>{if(game.moves||game.held)openDialog('reset-dialog');else restart('cat');});
for(const button of document.querySelectorAll('[data-close]'))button.addEventListener('click',()=>button.closest('dialog').close());
for(const dialog of document.querySelectorAll('dialog'))dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}});
function restart(first='cat'){
  endGesture(false,{});game.reset(first);if(scene){scene.draggingId=null;scene.keyboardCell=-1;}
  $('cat-tag').querySelector('.player-role').textContent=first==='cat'?'先手':'後手';
  $('dog-tag').querySelector('.player-role').textContent=first==='dog'?'先手':'後手';
  $('reset-dialog').close();update('手元の駒を、マスまでドラッグしよう');
}
$('confirm-reset').addEventListener('click',()=>restart('cat'));
$('rematch-button').addEventListener('click',()=>{restart(nextFirst);nextFirst=nextFirst==='cat'?'dog':'cat';});

// Expose only visible information: covered pieces must stay a memory challenge.
const context=document.modelContext;
if(context?.registerTool){
  const lifecycle=new AbortController();
  try{Promise.resolve(context.registerTool({name:'read_visible_game',title:'盤面を見る',description:'Read the visible cats-and-dogs board, current turn and held piece. Covered pieces are omitted.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute(input){if(!input||Object.keys(input).length)throw new Error('No input fields accepted');return game.visibleState();}},{signal:lifecycle.signal})).catch(()=>{});}catch{}
  window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
update('手元の駒を、マスまでドラッグしよう');
