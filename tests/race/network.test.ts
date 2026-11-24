import {CAR_IDS} from '../../shared/types.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Server, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { Client, type Room as ClientRoom } from '@colyseus/sdk';
import { DEFAULT_VEHICLE_STATS } from '../../shared/catalog.js';
import { DEFAULT_PHYSICS } from '../../shared/config.js';
import type { BeginRaceInput, LoadoutSelection, RaceResult, RaceSettlement, RoomSnapshot } from '../../shared/types.js';
import { registerRaceRooms } from '../../server/realtime/RaceRoom.js';
import type { RealtimeServices } from '../../server/realtime/contracts.js';
import type { RaceRuntime } from '../../server/realtime/RaceRuntime.js';
import {allowedPrayerStatus} from './prayer-fixture.js';

const delay=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
async function waitFor(check:()=>boolean,label:string,timeout=5000){const start=Date.now();while(!check()){if(Date.now()-start>timeout)throw new Error('Timeout: '+label);await delay(10);}}
const selected:LoadoutSelection={carId:'brz',color:'#2866b8',finish:'metallic',rimId:'stock',rimColor:'#887766'};
interface Observer { room:ClientRoom; snapshot:RoomSnapshot|null; errors:Array<{code:string;message:string}>; results:any[] }
function observe(room:ClientRoom):Observer {
  const observer:Observer={room,snapshot:null,errors:[],results:[]};
  const acknowledged=new Set<string>();
  room.onMessage('snapshot',(snapshot:RoomSnapshot)=>{observer.snapshot=snapshot;
    // Headless protocol participant explicitly completes the frozen-scene barrier.
    // Actual renderer/frame ordering is covered by client and renderer tests.
    if(snapshot.phase==='loading'&&snapshot.startToken&&snapshot.racers.length&&!acknowledged.has(snapshot.startToken)){acknowledged.add(snapshot.startToken);room.send('arena_ready',{raceId:snapshot.raceId,startToken:snapshot.startToken});}
  });room.onMessage('room_error',error=>observer.errors.push(error));room.onMessage('result',result=>observer.results.push(result));room.onMessage('pong',()=>{});
  room.onError(()=>{});room.send('sync');return observer;
}

test('Actual Colyseus clients: auth,2/4/8/15humans, readiness, inputs, latency, reconnect and private settlement',{timeout:45000},async t=>{
  const tickets=new Map<string,string>(),begun=new Map<string,BeginRaceInput>(),results=new Map<string,RaceResult>(),settlements=new Map<string,RaceSettlement>(),logs:unknown[]=[],revoked=new Set<string>();let simulationRate=90;
  const issue=(userId:string)=>{const ticket=randomUUID();tickets.set(ticket,userId);return ticket;};
  const services:RealtimeServices={
    async consumeRaceTicket({ticket,headers}){const userId=tickets.get(ticket);if(!userId||headers.cookie!=='sid='+userId)return null;tickets.delete(ticket);return{id:userId,displayName:'Driver '+userId};},
    async authenticate(headers){const userId=headers.cookie?.replace('sid=','');return userId&&!revoked.has(userId)?{id:userId,displayName:'Driver '+userId}:null;},
    async gameplayAccess(){return allowedPrayerStatus();},
    async resolveLoadout(_userId,selection,rulesetId='v1'){if(selection.rimId==='unowned')throw new Error('Not owned');return{...selection,rimId:selection.rimId??'stock',stats:DEFAULT_VEHICLE_STATS[selection.carId],tuningVersion:rulesetId};},
    async resolveVehicleRestriction(categoryId){if(categoryId)throw new Error('Fixture category unavailable');return{categoryId:null,categoryName:null,allowedCarIds:[...CAR_IDS]};},
    async getActiveRuleset(){return{version:'v1',cars:DEFAULT_VEHICLE_STATS,physics:{...DEFAULT_PHYSICS,tickRate:simulationRate}};},
    async beginRace(input){begun.set(input.raceId,input);},
    async finalizeRace(result){assert.ok(begun.has(result.raceId));results.set(result.raceId,result);let settlement=settlements.get(result.raceId);if(!settlement){settlement={raceId:result.raceId,rewards:result.participants.filter(p=>p.userId).map(p=>({userId:p.userId!,amount:p.status==='finished'?'100':'0',balance:p.status==='finished'?'1100':'1000'}))};settlements.set(result.raceId,settlement);}return settlement;},
    async abortRace(){},log(_message,error){logs.push(error);},
  };
  const http=createServer(),server=new Server({transport:new WebSocketTransport({server:http,pingInterval:1000}),greet:false,gracefullyShutdown:false});
  const registry=registerRaceRooms(server,services,{countdownMs:80,reconnectSeconds:.4,snapshotRateMs:25,finishRetentionMs:2000,inputTimeoutMs:250,sessionCheckMs:100});
  await server.listen(0,'127.0.0.1');const address=http.address();assert.ok(address&&typeof address==='object');const endpoint='http://127.0.0.1:'+address.port;
  const sdk=(userId:string)=>new Client(endpoint,{headers:{cookie:'sid='+userId}});
  const clients:ClientRoom[]=[];
  try{
    await t.test('One-use session-bound ticket is required; unowned loadouts are rejected',async()=>{
      await assert.rejects(sdk('bad').create('race',{ticket:'invalidticketinvalid',maxHumans:1,bots:0,loadout:selected}));
      const ticket=issue('owner');await assert.rejects(sdk('thief').create('race',{ticket,maxHumans:1,bots:0,loadout:selected}));
      const room=await sdk('owner').create('race',{ticket,maxHumans:1,bots:0,loadout:selected});clients.push(room);const o=observe(room);await waitFor(()=>!!o.snapshot,'auth snapshot');
      assert.equal(registry.findByCode(o.snapshot!.inviteCode)?.roomId,room.roomId);
      await assert.rejects(sdk('owner').create('race',{ticket,maxHumans:1,bots:0,loadout:selected}));
      room.send('loadout',{...selected,rimId:'unowned'});await waitFor(()=>o.errors.some(e=>e.code==='LOADOUT_REJECTED'),'ownership validation');
      await room.leave();
    });
    for(const count of[2,4,8,15])await t.test(count+' authenticated humans get exact fields, synchronized countdown and authoritative motion',async()=>{
      const prefix='n'+count+'-',first=sdk(prefix+'0'),host=await first.create('race',{ticket:issue(prefix+'0'),maxHumans:count,bots:0,laps:1,circuit:'city',loadout:selected});clients.push(host);const observers=[observe(host)];
      for(let i=1;i<count;i++){const room=await sdk(prefix+i).joinById(host.roomId,{ticket:issue(prefix+i),loadout:selected});clients.push(room);observers.push(observe(room));}
      await waitFor(()=>observers.every(o=>o.snapshot?.members.length===count),'all lobby members');
      observers[1]!.room.send('start');await waitFor(()=>observers[1]!.errors.some(e=>e.code==='HOST_ONLY'),'host authority');
      host.send('start');await waitFor(()=>observers[0]!.errors.some(e=>e.code==='NOT_READY'),'asset ready barrier');
      for(const observer of observers)observer.room.send('ready',{ready:true,assetsLoaded:true});await waitFor(()=>observers[0]!.snapshot?.members.every(m=>m.ready&&m.assetsLoaded)===true,'ready state');
      host.send('start');await waitFor(()=>observers.every(o=>o.snapshot?.phase==='racing'),'scheduled start');
      const started=observers[0]!.snapshot!;assert.equal(started.racers.length,count);assert.equal(new Set(observers.map(o=>o.snapshot!.startAt)).size,1);assert.equal(started.rulesetVersion,'v1');assert.ok(started.racers.every(r=>r.loadout.rimColor==='#887766'));assert.ok(!JSON.stringify(started).includes('sid='),'Session cookies stay server-side');
      const own=started.racers.find(r=>r.id===host.sessionId)!;host.send('input',{seq:1,throttle:1,brake:0,steer:0,nitro:false,x:999999,stats:{topSpeed:99999}});
      await waitFor(()=>observers[0]!.snapshot?.racers.find(r=>r.id===host.sessionId)?.lastProcessedSeq===1,'acknowledged sequenced input');await delay(90);
      const moved=observers[0]!.snapshot!.racers.find(r=>r.id===host.sessionId)!;assert.ok(moved.speed>0);assert.ok(Math.hypot(moved.x-own.x,moved.z-own.z)<10);assert.equal(moved.loadout.stats.topSpeed,255);
      host.send('input',{seq:1,throttle:1,brake:0,steer:0,nitro:true});host.send('input',{seq:2,throttle:Infinity,brake:0,steer:0,nitro:false});await delay(50);assert.equal(observers[0]!.snapshot!.racers.find(r=>r.id===host.sessionId)!.lastProcessedSeq,1);
      const id=started.raceId!;for(const observer of observers)await observer.room.leave();await waitFor(()=>results.has(id),'one final result after departures');assert.equal(results.get(id)!.participants.length,count);assert.ok(results.get(id)!.participants.every(p=>p.status==='dnf'));
    });
    await t.test('Room simulation clock tracks wall time at both30Hz and90Hz',async()=>{
      for(const rate of[30,90]){
        simulationRate=rate;const user='clock-'+rate,room=await sdk(user).create('race',{ticket:issue(user),maxHumans:1,bots:0,laps:1,loadout:selected});clients.push(room);const o=observe(room);
        room.send('ready',{ready:true,assetsLoaded:true});await waitFor(()=>o.snapshot?.members.every(m=>m.ready)===true,'clock readiness');room.send('start');await waitFor(()=>o.snapshot?.phase==='racing','clock racing');
        const wall=Date.now(),elapsed=o.snapshot!.elapsedMs;await delay(700);const wallDelta=Date.now()-wall,simDelta=o.snapshot!.elapsedMs-elapsed;
        assert.equal(o.snapshot!.physics.tickRate,rate);assert.ok(simDelta>wallDelta*.7&&simDelta<wallDelta*1.3+50,`${rate}Hz elapsed ${simDelta}ms versus wall ${wallDelta}ms`);
        await room.leave();
      }
      simulationRate=90;
    });
    await t.test('Latency does not grant movement, temporary drops keep race clock running, reconnect restores identity',async()=>{
      server.simulateLatency(120);
      const a=sdk('lat-a'),b=sdk('lat-b'),host=await a.create('race',{ticket:issue('lat-a'),maxHumans:2,bots:0,laps:1,loadout:selected}),peer=await b.joinById(host.roomId,{ticket:issue('lat-b'),loadout:selected});clients.push(host,peer);
      const ho=observe(host),po=observe(peer);host.send('ready',{ready:true,assetsLoaded:true});peer.send('ready',{ready:true,assetsLoaded:true});await waitFor(()=>ho.snapshot?.members.every(m=>m.ready)===true,'latency readiness');host.send('start');await waitFor(()=>ho.snapshot?.phase==='racing'&&po.snapshot?.phase==='racing','latency racing');
      peer.send('input',{seq:1,throttle:1,brake:0,steer:0,nitro:false});await waitFor(()=>ho.snapshot?.racers.find(r=>r.id===peer.sessionId)?.lastProcessedSeq===1,'latency input');
      const token=peer.reconnectionToken,sessionId=peer.sessionId,oldTick=ho.snapshot!.tick;peer.reconnection.enabled=false;peer.connection.close(1000);
      await waitFor(()=>ho.snapshot?.racers.find(r=>r.id===sessionId)?.connected===false,'drop snapshot');assert.ok(ho.snapshot!.tick>oldTick);assert.equal(ho.snapshot!.racers.find(r=>r.id===sessionId)!.ghost,true);
      const rejoined=await b.reconnect(token);clients.push(rejoined);const ro=observe(rejoined);await waitFor(()=>ro.snapshot?.racers.find(r=>r.id===sessionId)?.connected===true,'reconnect snapshot');assert.equal(rejoined.sessionId,sessionId);assert.equal(ro.snapshot!.raceId,ho.snapshot!.raceId);assert.equal(ro.snapshot!.racers.length,2);
      rejoined.reconnection.enabled=false;rejoined.connection.close(1000);await waitFor(()=>ho.snapshot?.racers.find(r=>r.id===sessionId)?.dnf===true,'reconnect grace expires');
      const local=matchMaker.getLocalRoomById(host.roomId) as unknown as {runtime:RaceRuntime;simulate():void};
      const winner=local.runtime.racers.find(r=>r.id===host.sessionId)!;
      // Trusted server fixture to reach settlement without a minute-long driving
      // playthrough. Real motion and gates are covered by simulation.test.ts.
      winner.finished=true;winner.completedLaps=1;winner.progress=1;winner.bestLapMs=local.runtime.elapsedMs;winner.finishTimeMs=local.runtime.elapsedMs;local.simulate();
      await waitFor(()=>ho.results.length===1,'private settled result');const message=ho.results[0];assert.equal(message.reward.userId,'lat-a');assert.equal(message.reward.amount,'100');assert.ok(!('rewards'in message));
      const raceId=message.result.raceId;await services.finalizeRace(message.result);assert.equal(settlements.get(raceId)!.rewards.find(r=>r.userId==='lat-a')!.balance,'1100');
      await delay(100);assert.equal(ho.results.length,1);server.simulateLatency(0);
      const finishedToken=host.reconnectionToken;host.reconnection.enabled=false;host.connection.close(1000);await delay(30);
      const restored=await a.reconnect(finishedToken);clients.push(restored);const completed=observe(restored);
      await waitFor(()=>completed.results.length>0,'finished reconnect recovers private result');assert.equal(completed.results[0].result.raceId,raceId);assert.equal(completed.results[0].reward.userId,'lat-a');assert.equal(completed.results[0].reward.balance,'1100');
      assert.equal(settlements.size,[...results.values()].length,'Reconnection does not settle again');await restored.leave();
    });
    await t.test('Revoking the originating login ends an active socket and cannot be bypassed with its reconnect token',async()=>{
      const c=sdk('revoke'),room=await c.create('race',{ticket:issue('revoke'),maxHumans:1,bots:0,laps:1,loadout:selected});clients.push(room);room.reconnection.enabled=false;const o=observe(room);
      room.send('ready',{ready:true,assetsLoaded:true});await waitFor(()=>o.snapshot?.members.every(m=>m.ready)===true,'revocation ready');room.send('start');await waitFor(()=>o.snapshot?.phase==='racing','revocation racing');const raceId=o.snapshot!.raceId!,token=room.reconnectionToken;
      revoked.add('revoke');await waitFor(()=>o.errors.some(e=>e.code==='SESSION_EXPIRED'),'revoked socket rejection');await waitFor(()=>results.has(raceId),'revocation DNF settlement');assert.equal(results.get(raceId)!.participants[0]!.status,'dnf');await assert.rejects(c.reconnect(token));
    });
    assert.equal(logs.length,0,'No unexpected room errors');
  }finally{
    for(const client of clients){client.reconnection.enabled=false;if(client.connection.isOpen)await client.leave().catch(()=>{});}
    await server.gracefullyShutdown(false);
  }
});
