/* UVelocity rendering API. Networking, authentication and rewards live outside
 * this module. Incoming race snapshots are the sole online race authority. */
(function (global) {
  'use strict';
  const listeners=new Map();let runtime=null,isReady=false,isDisposed=false;
  let resolveReady,rejectReady,lastSnapshot=null;
  const ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
  // The shell may attach later; an early WebGL error must not become unhandled.
  ready.catch(()=>{});
  function emit(type,detail) {
    const handlers=listeners.get(type);
    if(handlers)for(const fn of [...handlers]){try{fn(detail);}catch(error){console.error('UVelocity event listener:',error);}}
    global.dispatchEvent(new CustomEvent('nvgame:'+type,{detail}));
  }
  function call(name,...args) {
    return ready.then(()=>{
      if(isDisposed)throw new Error('UVelocity renderer has been disposed');
      if(typeof runtime[name]!=='function')throw new Error('Unsupported renderer command: '+name);
      return runtime[name](...args);
    });
  }
  const api={
    ready,
    on(type,fn){
      if(typeof fn!=='function')throw new TypeError('Event listener must be a function');
      if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);
      if(type==='ready'&&isReady)Promise.resolve().then(()=>fn(api.getState()));
      return()=>listeners.get(type)?.delete(fn);
    },
    off(type,fn){listeners.get(type)?.delete(fn);},
    configure(options){return call('configure',options||{});},
    preview(loadout,options){return call('configure',{...(options||{}),loadout:loadout||{},previewOnly:true});},
    setLoadout(loadout){return call('setLoadout',loadout||{});},
    setLocalPlayer(id){return call('setLocalPlayer',String(id||''));},
    startRace(options){return call('startRace',options||{});},
    stopRace(){return call('stopRace');},
    applySnapshot(snapshot){
      if(!snapshot||isDisposed)return false;
      if(!isReady){lastSnapshot=snapshot;return false;}
      return runtime.applySnapshot(snapshot);
    },
    setInput(input){if(isReady)runtime.setInput?.(input||{});},
    getInput(){return isReady?runtime.getInput():{throttle:0,brake:0,steer:0,nitro:false};},
    getState(){return isReady?runtime.getState():{ready:false,mode:'loading'};},
    getCatalog(){return isReady?runtime.getCatalog():{cars:[],circuits:[],wheels:global.NVWheels?.catalog||[]};},
    ensureModels(ids){return call('ensureModels',ids);},
    setQuality(quality){return call('configure',{quality});},
    setMuted(muted){return call('configure',{muted:!!muted});},
    setVisible(visible){return call('setVisible',!!visible);},
    setCamera(mode){return call('setCamera',mode);},
    previewEngine(){return call('previewEngine');},
    unlockAudio(){return isReady?runtime.unlockAudio():call('unlockAudio');},
    playEvents(events){if(isReady)runtime.playEvents?.(Array.isArray(events)?events:[events]);},
    stopEnginePreview(){return call('stopEnginePreview');},
    showCircuit(circuit){return call('showCircuit',circuit);},
    showCredits(){return call('showCredits');},
    setView(view){return call('setView',view);},
    pause(){return call('pause');},
    resume(){return call('resume');},
    focus(){global.focus();document.getElementById('game-container')?.focus();},
    dispose(){if(isDisposed)return;isDisposed=true;lastSnapshot=null;runtime?.dispose?.();listeners.clear();}
  };
  Object.defineProperties(api,{
    _registerRuntime:{value:adapter=>{runtime=adapter;}},
    _ready:{value:()=>{
      if(isReady||isDisposed)return;isReady=true;resolveReady(api);emit('ready',api.getState());
      if(lastSnapshot){const snapshot=lastSnapshot;lastSnapshot=null;runtime.applySnapshot(snapshot);}
    }},
    _fail:{value:error=>{rejectReady(error);emit('error',{message:error?.message||String(error)});}},
    _emit:{value:emit}
  });
  global.NVGame=api;
})(window);
