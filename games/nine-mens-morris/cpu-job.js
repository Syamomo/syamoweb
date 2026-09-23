import {stateKey,applyAction} from './engine.js';
// A response is usable only once, for the exact still-current game position.
export class CpuJob {
  serial=0;
  current=null;
  cancel() { this.serial++; this.current=null; }
  begin(state) { this.cancel(); return this.current={id:this.serial,key:stateKey(state)}; }
  accept(response,state,cpuTurn) {
    const job=this.current;
    if(!job || !cpuTurn || state.result || response.id!==job.id || response.key!==job.key || stateKey(state)!==job.key) return null;
    this.current=null;
    if(response.error) throw new Error(response.error);
    if(!Array.isArray(response.actions) || response.actions.length<1 || response.actions.length>2) throw new Error('CPUの応答が不正です。');
    let next=state;
    for(const action of response.actions) {
      if(next.turn!==state.turn || next.result) throw new Error('CPUの手数が不正です。');
      next=applyAction(next,action);
    }
    if(next.capture || (!next.result && next.turn===state.turn)) throw new Error('CPUの手が完了していません。');
    return response.actions;
  }
}
