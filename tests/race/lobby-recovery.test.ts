import test from 'node:test';
import assert from 'node:assert/strict';
import {LobbyLoadoutRecovery} from '../../client/src/lobby-recovery.js';
import type {Loadout} from '../../client/src/api.js';
import {DEFAULT_VEHICLE_STATS} from '../../shared/catalog.js';
import {DEFAULT_PHYSICS,freezeLoadout,validateRoomConfig} from '../../shared/config.js';
import type {RoomSnapshot} from '../../shared/types.js';

const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));
const safe:Loadout={carId:'brz',rimId:'stock',color:'#2866b8',finish:'metallic',rimColor:'#c7cdd4',stripeId:'none',stripeColor:'#ffffff',appearanceVersion:'1'};
const temporary:Loadout={...safe,carId:'kaze',color:'#d9e1e5',appearanceVersion:'0'};
function snapshot(loadout=temporary,phase:RoomSnapshot['phase']='lobby',roomId='room-one'):RoomSnapshot{
 return{protocol:1,roomId,inviteCode:'ABC123',raceId:null,phase,tick:0,serverTime:Date.now(),elapsedMs:0,startAt:null,startToken:null,loadingDeadline:null,prayerPause:null,config:validateRoomConfig({maxHumans:2,bots:0}),rulesetVersion:null,trackVersion:'nv-courses-1',physics:{...DEFAULT_PHYSICS},hostId:'host',racers:[],members:[{id:'peer',userId:'user',name:'Peer',host:false,ready:false,assetsLoaded:false,arenaReady:false,connected:true,loadout:freezeLoadout({...loadout,stats:DEFAULT_VEHICLE_STATS[loadout.carId],tuningVersion:'2'})}]};
}
function setup(){
 let refreshes=0,connected=true;const applied:Loadout[]=[],errors:unknown[]=[];
 const actions={sessionId:()=> 'peer',connected:()=>connected,refresh:async()=>{refreshes++;return safe;},apply:(loadout:Loadout)=>{applied.push(loadout);},error:(error:unknown)=>{errors.push(error);}};
 const recovery=new LobbyLoadoutRecovery(actions);return{recovery,actions,applied,errors,get refreshes(){return refreshes;},disconnect(){connected=false;}};
}

test('Lobby recovery waits for loading to return to lobby, then equips only the refreshed safe selection',async()=>{
 const h=setup();try{
  h.recovery.observe(snapshot(temporary,'loading'));h.recovery.request('START_FAILED');h.recovery.request('START_FAILED');await flush();assert.equal(h.refreshes,0);
  h.recovery.observe(snapshot());await flush();assert.equal(h.refreshes,1);assert.deepEqual(h.applied,[safe]);
  h.recovery.observe(snapshot(safe));h.recovery.request('START_FAILED');await flush();assert.equal(h.applied.length,1,'An unrelated host start failure must not reset a valid local selection');
  h.recovery.request('NOT_READY');h.recovery.request('HOST_ONLY');h.recovery.request();await flush();assert.equal(h.refreshes,2,'Unrelated errors cannot change saved loadouts');assert.deepEqual(h.errors,[]);
 }finally{h.recovery.dispose();}
});

test('Automatic loadout rejection cannot create a refresh/send loop; a later real selection can recover again',async()=>{
 const h=setup();h.actions.apply=loadout=>{h.applied.push(loadout);h.recovery.request('LOADOUT_REJECTED');};
 try{
  h.recovery.observe(snapshot());h.recovery.request('LOADOUT_REJECTED');await flush();assert.equal(h.applied.length,1);assert.equal(h.refreshes,2);
  h.recovery.observe(snapshot(safe));h.recovery.observe(snapshot({...temporary,carId:'apex'}));h.recovery.request('START_FAILED');await flush();assert.equal(h.applied.length,2,'A new manual selection is independent of the previous recovery');assert.equal(h.refreshes,4);
 }finally{h.recovery.dispose();}
});

test('A delayed profile response cannot equip during a race, after leave, after disconnect, or in another room',async()=>{
 for(const transition of ['race','leave','disconnect','new-room','dispose'] as const){
  const h=setup();let resolve!:(loadout:Loadout)=>void;h.actions.refresh=()=>new Promise<Loadout>(r=>resolve=r);
  try{
   h.recovery.observe(snapshot());h.recovery.request('LOADOUT_REJECTED');
   if(transition==='race')h.recovery.observe(snapshot(temporary,'countdown'));
   if(transition==='leave')h.recovery.clear();
   if(transition==='disconnect')h.disconnect();
   if(transition==='new-room')h.recovery.observe(snapshot(temporary,'lobby','room-two'));
   if(transition==='dispose')h.recovery.dispose();
   resolve(safe);await flush();assert.equal(h.applied.length,0,transition);
   if(transition==='race'){h.recovery.request('START_FAILED');await flush();assert.equal(h.applied.length,0);}
  }finally{h.recovery.dispose();}
 }
});

test('Saved appearance version changes recover once, while failed refreshes stop without automatic retries',async()=>{
 const h=setup();try{
  h.recovery.observe(snapshot({...safe,appearanceVersion:'0'}));h.recovery.request('LOADOUT_REJECTED');await flush();assert.equal(h.applied.length,1);
  h.recovery.observe(snapshot(safe));h.actions.refresh=async()=>{throw new Error('Session expired');};h.recovery.request('START_FAILED');await flush();assert.equal(h.errors.length,1);
  h.recovery.observe(snapshot(safe));await flush();assert.equal(h.errors.length,1,'A normal snapshot is not an error retry');assert.equal(h.applied.length,1);
 }finally{h.recovery.dispose();}
});

test('Factory and painted stock rims are distinct saved selections even with identical RGB and versions',async()=>{
 const h=setup(),painted={...safe,stockRimPainted:true};h.actions.refresh=async()=>painted;
 try{
  h.recovery.observe(snapshot({...safe,stockRimPainted:false}));h.recovery.request('LOADOUT_REJECTED');await flush();
  assert.deepEqual(h.applied,[painted],'A paid first repaint must not be mistaken for unchanged factory silver');
  h.recovery.observe(snapshot(painted));h.recovery.request('START_FAILED');await flush();assert.equal(h.applied.length,1,'An accepted painted selection does not resend');
  h.actions.refresh=async()=>({...safe,stockRimPainted:false});h.recovery.request('LOADOUT_REJECTED');await flush();assert.equal(h.applied.length,2);assert.equal(h.applied[1]?.stockRimPainted,false,'A saved factory restoration must also recover');
 }finally{h.recovery.dispose();}
});
