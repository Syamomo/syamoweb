import {MILLS,ADJACENT,count,other,turns} from './engine.js';

// Same gentle five-level approach as Simple Chess; scores are Morris-specific.
export const PROFILES = {
  1:{depth:2,nodes:8000,weights:[10,45,45]},
  2:{depth:2,nodes:8000,weights:[25,40,35]},
  3:{depth:2,nodes:8000,weights:[45,40,15]},
  4:{depth:2,nodes:8000,weights:[65,28,7]},
  5:{depth:3,nodes:25000,weights:[80,18,2]},
};
export function seededRandom(seed) {
  return () => { seed |= 0; seed = seed+0x6D2B79F5|0; let t = Math.imul(seed^seed>>>15,1|seed);
    t = t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; };
}
export function evaluate(state, player) {
  if (state.result) return state.result.winner===0 ? 0 : state.result.winner===player ? 100000 : -100000;
  const value = side => {
    let score = (count(state,side)+state.reserve[side])*100;
    for (const mill of MILLS) {
      const own = mill.filter(i => state.board[i]===side).length;
      const empty = mill.filter(i => !state.board[i]).length;
      if (own===3) score+=18;
      if (own===2 && empty===1) score+=28;
    }
    state.board.forEach((p,i) => { if(p===side) score+=ADJACENT[i].filter(j => !state.board[j]).length*3; });
    return score;
  };
  return value(player)-value(other(player));
}
class BudgetEnd extends Error {}
export function chooseTurn(state, level=1, options={}) {
  if (state.result) throw new Error('対局は終了しています。');
  const profile = PROFILES[level];
  if (!profile) throw new Error('難易度が不正です。');
  const random = seededRandom(options.seed ?? Date.now());
  const now = options.now ?? (() => performance.now());
  const start = now(), maxTime = options.maxTimeMs ?? 500, maxNodes = options.maxNodes ?? profile.nodes;
  let nodes=0, completed=null, depth=0;
  const roots = turns(state), player = state.turn;
  if (!roots.length) throw new Error('合法手がありません。');
  const visit = () => { if (++nodes>maxNodes || now()-start>maxTime) throw new BudgetEnd(); };
  function search(s, remaining, alpha, beta) {
    visit();
    if (!remaining || s.result) return evaluate(s,player);
    const maximize = s.turn===player;
    let best = maximize?-Infinity:Infinity;
    const children = turns(s);
    children.sort((a,b) => maximize ? evaluate(b.state,player)-evaluate(a.state,player) : evaluate(a.state,player)-evaluate(b.state,player));
    for (const child of children) {
      const score = search(child.state,remaining-1,alpha,beta);
      best = maximize?Math.max(best,score):Math.min(best,score);
      if(maximize) alpha=Math.max(alpha,best); else beta=Math.min(beta,best);
      if(beta<=alpha) break;
    }
    return Number.isFinite(best)?best:evaluate(s,player);
  }
  for(let d=1;d<=profile.depth;d++) {
    try {
      // Each root receives an exact full-window score; interrupted iterations
      // never bias selection toward candidates searched first.
      const scores = roots.map(root => ({...root,score:search(root.state,d-1,-Infinity,Infinity)}));
      completed=scores; depth=d;
    } catch(error) { if(error instanceof BudgetEnd) break; throw error; }
  }
  if(!completed) throw new Error('計算を完了できませんでした。もう一度お試しください。');
  const best = Math.max(...completed.map(c => c.score));
  const groups = [[],[],[]];
  for(const candidate of completed) {
    const loss = best-candidate.score;
    groups[loss<=15?0:loss<=85?1:2].push(candidate);
  }
  let ticket = random()*profile.weights.reduce((sum,w,i) => sum+(groups[i].length?w:0),0);
  let bucket = groups.find(g => g.length);
  for(let i=0;i<3;i++) if(groups[i].length) {
    ticket-=profile.weights[i]; if(ticket<0) { bucket=groups[i]; break; }
  }
  const selected = bucket[Math.floor(random()*bucket.length)];
  return {actions:selected.actions,diagnostics:{depth,nodes,loss:best-selected.score,elapsedMs:now()-start}};
}
