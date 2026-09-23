import {chooseTurn} from './ai.js';
self.onmessage = ({data}) => {
  const {id,key,state,level,seed} = data;
  try { self.postMessage({id,key,...chooseTurn(state,level,{seed})}); }
  catch(error) { self.postMessage({id,key,error:error.message}); }
};
