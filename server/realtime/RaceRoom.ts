import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import { Room, ServerError, type AuthContext, type Client, type Server } from '@colyseus/core';
import { CAR_NAMES } from '../../shared/catalog.js';
import { DEFAULT_PHYSICS, freezeLoadout, validateRoomConfig } from '../../shared/config.js';
import { createRacer, sortRacers } from '../../shared/simulation.js';
import { TRACK_VERSION } from '../../shared/track.js';
import { CAR_IDS, type BeginRaceInput, type FrozenLoadout, type LoadoutSelection, type RacePhase, type RaceResult, type RaceSettlement, type RoomConfig, type RoomMember, type RoomSnapshot, type SessionUser } from '../../shared/types.js';
import type { RealtimeOptions, RealtimeServices } from './contracts.js';
import { RaceRuntime } from './RaceRuntime.js';

interface AuthenticatedEntry { user:SessionUser; loadout:FrozenLoadout; sessionHeaders:IncomingHttpHeaders }
interface Entry extends RoomMember { selection:LoadoutSelection }
interface InviteLookup { roomId:string;inviteCode:string;phase:RacePhase;config:RoomConfig;humans:number;joinable:boolean }

function headersRecord(headers:Headers):IncomingHttpHeaders {
  return Object.fromEntries(headers.entries());
}
function selection(value:unknown):LoadoutSelection {
  const input=value&&typeof value==='object'?value as Record<string,unknown>:{};
  const carId=input.carId??'brz',color=input.color??'#2866b8',finish=input.finish??'metallic',rimId=input.rimId??'stock';
  if(!CAR_IDS.includes(carId as never)||typeof color!=='string'||!/^#[\da-f]{6}$/i.test(color)||!['metallic','matte','gloss'].includes(String(finish))||typeof rimId!=='string'||rimId.length>80)throw new ServerError(400,'Pilihan kendaraan tidak valid.');
  if(input.rimColor!==undefined&&(typeof input.rimColor!=='string'||!/^#[\da-f]{6}$/i.test(input.rimColor)))throw new ServerError(400,'Warna velg tidak valid.');
  return{carId:carId as LoadoutSelection['carId'],color,finish:finish as LoadoutSelection['finish'],rimId,...(typeof input.rimColor==='string'?{rimColor:input.rimColor}:{})};
}
function configFrom(value:Record<string,unknown>):RoomConfig {
  const config:Partial<RoomConfig>={};
  for(const key of['circuit','laps','bots','maxHumans','difficulty','collisionMode']as const)if(value[key]!==undefined)(config as Record<string,unknown>)[key]=value[key];
  try{return validateRoomConfig(config);}catch(error){throw new ServerError(400,(error as Error).message);}
}
function makeCode():string {
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';return [...randomBytes(6)].map(n=>alphabet[n%alphabet.length]).join('');
}

/** Register one room type. Dependencies stay in this trusted closure.
 *
 * Browser SDK0.18 contract:
 * const client=new Client(location.origin);
 * const {ticket}=await authenticatedCsrfPost('/api/race/ticket');
 * const room=await client.create('race',{ticket,...config,loadout});
 * // Invite lookup HTTP route returns roomId, then fetch a fresh one-use ticket:
 * const peer=await client.joinById(roomId,{ticket,loadout});
 * room.onMessage('snapshot',(snapshot:RoomSnapshot)=>...);
 * room.onMessage('room_error',({code,message})=>...);
 * room.onMessage('result',({result,reward})=>...); // own wallet reward only
 * room.send('ready',{ready:true,assetsLoaded:true});
 * room.send('start'); // host, all members ready; server freezes loadouts
 * room.send('input',{seq,throttle,brake,steer,nitro,reset?,clientTick?});
 * room.send('loadout',{carId,color,finish,rimId}); // lobby only
 * room.send('sync'); // request a current complete snapshot
 * room.send('ping',{sentAt}); // receives 'pong' with serverTime
 * const token=room.reconnectionToken; await client.reconnect(token);
 * No client position, time, finish, balance, tuning or reward messages exist.
 */
export function registerRaceRooms(server:Server,services:RealtimeServices,options:RealtimeOptions={}) {
  const rooms=new Map<string,RaceRoom>();
  const now=options.now??Date.now;
  const reconnectSeconds=options.reconnectSeconds??20,countdownMs=options.countdownMs??3000;
  class RaceRoom extends Room {
    // Up to120 fixed-step inputs plus ping/sync and occasional UI controls.
    maxMessagesPerSecond=180;
    patchRate=null;
    private config!:RoomConfig;
    private phase:RacePhase='lobby';
    private inviteCode='';
    private members=new Map<string,Entry>();
    private hostId:string|null=null;
    private raceId:string|null=null;
    private rulesetVersion:string|null=null;
    private startAt:number|null=null;
    private startedAt:number|null=null;
    private runtime:RaceRuntime|null=null;
    private settlementStarted=false;
    private settlementSaved=false;
    private settlementAttempts=0;
    private settlementError:string|undefined;
    private result:RaceResult|null=null;
    private settlement:RaceSettlement|null=null;
    private disposed=false;
    private pendingLoadouts=new Set<string>();
    private blockedSessions=new Set<string>();
    private checkingSessions=new Map<string,Promise<boolean>>();
    private lastActivity=now();

    static async onAuth(_token:string,raw:Record<string,unknown>,context:AuthContext):Promise<AuthenticatedEntry>{
      if(typeof raw?.ticket!=='string'||raw.ticket.length<16||raw.ticket.length>512)throw new ServerError(401,'Tiket balapan tidak valid. Masuk kembali.');
      const requestHeaders=headersRecord(context.headers),user=await services.consumeRaceTicket({ticket:raw.ticket,headers:requestHeaders});
      if(!user)throw new ServerError(401,'Tiket balapan telah kedaluwarsa atau dipakai.');
      const loadout=freezeLoadout(await services.resolveLoadout(user.id,selection(raw.loadout??raw)));
      // Retained only in Colyseus server-side auth data; never placed in a
      // snapshot or matchmaking response. Reconnect rechecks this same session.
      return{user,loadout,sessionHeaders:{cookie:requestHeaders.cookie}};
    }
    async onCreate(raw:Record<string,unknown>){
      this.config=configFrom(raw);this.maxClients=this.config.maxHumans;
      do{this.inviteCode=makeCode();}while(rooms.has(this.inviteCode));
      rooms.set(this.inviteCode,this);
      await this.setPrivate(true);await this.setMetadata({inviteCode:this.inviteCode,circuit:this.config.circuit});
      this.onMessage('input',(client,value)=>{if(this.phase==='racing'||this.phase==='countdown')this.runtime?.acceptInput(client.sessionId,value);});
      this.onMessage('ready',(client,value)=>{
        if(this.phase!=='lobby'||this.pendingLoadouts.has(client.sessionId))return;
        const member=this.members.get(client.sessionId);if(!member)return;
        member.ready=value?.ready===true;member.assetsLoaded=value?.assetsLoaded===true;this.lastActivity=now();this.publish();
      });
      this.onMessage('loadout',(client,value)=>{void this.changeLoadout(client,value);});
      this.onMessage('start',client=>{void this.start(client);});
      this.onMessage('sync',client=>{client.send('snapshot',this.snapshot());this.sendResult(client);});
      this.onMessage('ping',(client,value)=>client.send('pong',{sentAt:typeof value?.sentAt==='number'?value.sentAt:null,serverTime:now()}));
      this.clock.setInterval(()=>this.publish(),options.snapshotRateMs??50);
      this.clock.setInterval(()=>{if(this.phase==='lobby'&&now()-this.lastActivity>(options.lobbyIdleMs??600000))void this.disconnect(4020);},10000);
      this.clock.setInterval(()=>{for(const client of this.clients)void this.checkSession(client);},options.sessionCheckMs??30000);
      this.setFixedTimestep(()=>this.simulate(),DEFAULT_PHYSICS.tickRate);
      // Colyseus installs a fallback clock interval when patchRate=null before
      // onCreate. Remove it now that the fixed timestep owns clock.tick(); two
      // clock callers would steal each other's elapsed time and slow the race.
      this.patchRate=null;
    }
    onJoin(client:Client,_options:unknown,auth?:AuthenticatedEntry){
      const entry=auth??client.auth as AuthenticatedEntry;
      if(!entry?.user||this.phase!=='lobby')throw new ServerError(403,'Balapan sudah dimulai.');
      if([...this.members.values()].some(member=>member.userId===entry.user.id))throw new ServerError(409,'Akun ini sudah berada di room. Gunakan sambung ulang.');
      if(!this.hostId)this.hostId=client.sessionId;
      this.members.set(client.sessionId,{id:client.sessionId,userId:entry.user.id,name:entry.user.displayName,host:client.sessionId===this.hostId,ready:false,assetsLoaded:false,connected:true,loadout:entry.loadout,selection:selection(entry.loadout)});
      this.lastActivity=now();this.publish();
    }
    onDrop(client:Client){
      const member=this.members.get(client.sessionId);if(member)member.connected=false;
      this.runtime?.setConnected(client.sessionId,false);this.publish();
      if(this.phase==='aborted'||this.blockedSessions.has(client.sessionId))return;
      this.allowReconnection(client,reconnectSeconds);
    }
    async onReconnect(client:Client){
      if(!await this.checkSession(client))return;
      const member=this.members.get(client.sessionId);if(member)member.connected=true;
      this.runtime?.setConnected(client.sessionId,true);this.lastActivity=now();this.publish();this.sendResult(client);
    }
    onLeave(client:Client){
      if(this.phase==='lobby'||this.phase==='loading'){
        this.members.delete(client.sessionId);this.pendingLoadouts.delete(client.sessionId);
        if(this.hostId===client.sessionId){this.hostId=this.members.keys().next().value??null;for(const member of this.members.values())member.host=member.id===this.hostId;}
      }else{
        const member=this.members.get(client.sessionId);if(member)member.connected=false;
        this.runtime?.markDnf(client.sessionId);
      }
      this.publish();
    }
    async onDispose(){
      this.disposed=true;rooms.delete(this.inviteCode);
      if(this.raceId&&!this.settlementSaved&&this.phase!=='settling')await services.abortRace?.(this.raceId,'room_disposed').catch(error=>services.log?.('Abort race failed',error));
    }
    onUncaughtException(error:Error,method:string){
      services.log?.('Realtime exception in '+method,error);void this.abort('Gangguan server. Balapan dibatalkan.');
    }
    lookup():InviteLookup{return{roomId:this.roomId,inviteCode:this.inviteCode,phase:this.phase,config:this.config,humans:this.members.size,joinable:this.phase==='lobby'&&this.members.size<this.maxClients};}
    private snapshot():RoomSnapshot{
      return{protocol:1,roomId:this.roomId,inviteCode:this.inviteCode,raceId:this.raceId,phase:this.phase,tick:this.runtime?.tick??0,serverTime:now(),elapsedMs:this.runtime?.elapsedMs??0,startAt:this.startAt,config:this.config,rulesetVersion:this.rulesetVersion,trackVersion:TRACK_VERSION,physics:this.runtime?.physics??{...DEFAULT_PHYSICS},hostId:this.hostId,
        members:[...this.members.values()].map(({selection:_selection,...member})=>member),racers:this.runtime?.snapshots()??[],...(this.settlementError?{settlementError:this.settlementError}:{})};
    }
    private publish(){if(!this.disposed)this.broadcast('snapshot',this.snapshot());}
    private error(client:Client,code:string,message:string){client.send('room_error',{code,message});}
    private sendResult(client:Client){
      if(!this.result||!this.settlementSaved||!this.settlement)return;
      const member=this.members.get(client.sessionId);if(!member)return;
      client.send('result',{result:this.result,reward:this.settlement.rewards.find(reward=>reward.userId===member.userId)??null});
    }
    private checkSession(client:Client):Promise<boolean>{
      if(this.blockedSessions.has(client.sessionId))return Promise.resolve(false);
      const pending=this.checkingSessions.get(client.sessionId);if(pending)return pending;
      const check=(async()=>{
        const auth=client.auth as AuthenticatedEntry;let user:SessionUser|null=null;
        try{user=await services.authenticate(auth.sessionHeaders);}catch{ /* fail closed */ }
        if(!user||user.id!==auth.user.id){
          this.blockedSessions.add(client.sessionId);this.runtime?.markDnf(client.sessionId);
          const member=this.members.get(client.sessionId);if(member)member.connected=false;
          const current=this.clients.find(c=>c.sessionId===client.sessionId)??client;
          this.error(current,'SESSION_EXPIRED','Sesi sudah berakhir. Silakan masuk kembali.');current.leave(4001,'Session expired');this.publish();return false;
        }
        return true;
      })().finally(()=>this.checkingSessions.delete(client.sessionId));
      this.checkingSessions.set(client.sessionId,check);return check;
    }
    private async changeLoadout(client:Client,value:unknown){
      if(this.phase!=='lobby'||this.pendingLoadouts.has(client.sessionId))return;
      const member=this.members.get(client.sessionId);if(!member)return;
      this.pendingLoadouts.add(client.sessionId);member.ready=false;member.assetsLoaded=false;
      try{const chosen=selection(value),loadout=freezeLoadout(await services.resolveLoadout(member.userId,chosen));if(this.phase==='lobby'&&this.members.has(member.id)){member.selection=chosen;member.loadout=loadout;this.lastActivity=now();}}
      catch{this.error(client,'LOADOUT_REJECTED','Kendaraan atau velg belum dimiliki, atau pilihan tidak valid.');}
      finally{this.pendingLoadouts.delete(client.sessionId);this.publish();}
    }
    private async start(client:Client){
      if(client.sessionId!==this.hostId){this.error(client,'HOST_ONLY','Hanya pembuat room yang dapat memulai.');return;}
      if(this.phase!=='lobby')return;
      const people=[...this.members.values()];
      if(!people.length||this.pendingLoadouts.size||people.some(member=>!member.ready||!member.assetsLoaded||!member.connected)){this.error(client,'NOT_READY','Semua pemain harus siap dan selesai memuat kendaraan.');return;}
      this.phase='loading';this.autoDispose=false;await this.lock();this.publish();
      try{
        const ruleset=await services.getActiveRuleset();this.rulesetVersion=ruleset.version;
        const frozen=await Promise.all(people.map(async member=>({...member,loadout:freezeLoadout(await services.resolveLoadout(member.userId,member.selection,ruleset.version))})));
        if(frozen.some(member=>!this.members.get(member.id)?.connected))throw new Error('Participant left before start');
        this.raceId=randomUUID();
        const racers=frozen.map(member=>{this.members.get(member.id)!.loadout=member.loadout;return createRacer(member.id,member.name,member.loadout,member.userId);});
        const palette=['#ae3047','#86a8cf','#ba984d','#4d9b85','#bb704a','#6a71b8','#c8cfd3','#a68ab9','#79a34f','#ddbc65','#4686a0','#a35d73','#d3b89b','#688992'];
        for(let i=0;i<this.config.bots;i++){
          const carId=CAR_IDS[i%CAR_IDS.length]!,stats=ruleset.cars[carId];
          if(!stats)throw new Error('Ruleset is missing a bot vehicle');
          racers.push(createRacer('bot_'+i,CAR_NAMES[carId]+' · BOT '+String(i+1).padStart(2,'0'),freezeLoadout({carId,color:palette[i]!,finish:'metallic',rimId:'stock',stats,tuningVersion:ruleset.version}),null,true));
        }
        for(let i=racers.length-1;i>0;i--){const j=randomInt(i+1);[racers[i],racers[j]]=[racers[j]!,racers[i]!];}
        this.runtime=new RaceRuntime(this.config,racers,ruleset.physics,options.inputTimeoutMs??400,options.maxRaceDurationMs);
        const input:BeginRaceInput={raceId:this.raceId,roomId:this.roomId,inviteCode:this.inviteCode,config:this.config,rulesetVersion:ruleset.version,createdAt:new Date(now()).toISOString(),participants:racers.map(r=>({id:r.id,userId:r.userId,isBot:r.isBot,name:r.name,carId:r.loadout.carId,loadout:r.loadout}))};
        await services.beginRace(input);
        if(frozen.some(member=>!this.members.get(member.id)?.connected))throw new Error('Participant left while saving the race');
        this.startAt=now()+countdownMs;this.phase='countdown';this.setFixedTimestep(()=>this.simulate(),this.runtime.physics.tickRate);this.publish();
      }catch(error){
        services.log?.('Cannot start race',error);if(this.raceId)await services.abortRace?.(this.raceId,'start_failed').catch(e=>services.log?.('Abort failed',e));
        this.raceId=null;this.runtime=null;this.rulesetVersion=null;this.phase='lobby';this.autoDispose=true;for(const member of this.members.values())member.ready=false;
        await this.unlock();this.error(client,'START_FAILED','Balapan belum dapat dimulai. Periksa pemain dan coba kembali.');this.publish();
      }
    }
    private simulate(){
      if(this.phase==='countdown'&&this.startAt!==null&&now()>=this.startAt){this.startedAt=this.startAt;this.phase='racing';this.publish();}
      if(this.phase!=='racing'||!this.runtime)return;
      this.runtime.step();
      if(this.runtime.ended&&!this.settlementStarted){this.settlementStarted=true;this.phase='settling';this.publish();void this.settle();}
    }
    private buildResult():RaceResult{
      const runtime=this.runtime!;
      return{raceId:this.raceId!,roomId:this.roomId,inviteCode:this.inviteCode,config:this.config,rulesetVersion:this.rulesetVersion!,startedAt:new Date(this.startedAt??now()).toISOString(),endedAt:new Date(now()).toISOString(),durationMs:runtime.elapsedMs,
        participants:sortRacers(runtime.racers).map((r,index)=>({id:r.id,userId:r.userId,isBot:r.isBot,name:r.name,carId:r.loadout.carId,loadout:r.loadout,status:r.finished?'finished':'dnf',position:index+1,completedLaps:r.completedLaps,bestLapMs:r.bestLapMs,totalTimeMs:r.finishTimeMs,progress:r.progress,distanceMeters:r.distanceMeters,connectedAtFinish:r.connected}))};
    }
    private async settle(){
      if(this.disposed||this.settlementSaved)return;
      this.result??=this.buildResult();this.settlementAttempts++;
      try{
        this.settlement=await services.finalizeRace(this.result);this.settlementSaved=true;this.settlementError=undefined;this.phase='finished';this.publish();
        for(const client of this.clients)this.sendResult(client);
        this.clock.setTimeout(()=>{void this.disconnect();},options.finishRetentionMs??60000);
      }catch(error){
        services.log?.('Race settlement will retry',error);this.settlementError='Hasil sedang disimpan. Hadiah tidak akan diberikan dua kali.';this.publish();
        this.clock.setTimeout(()=>{void this.settle();},Math.min(30000,1000*2**Math.min(this.settlementAttempts,5)));
      }
    }
    private async abort(message:string){
      if(this.phase==='finished'||this.phase==='aborted')return;this.phase='aborted';this.settlementError=message;
      if(this.raceId)await services.abortRace?.(this.raceId,'simulation_failure').catch(error=>services.log?.('Abort failed',error));
      this.publish();this.clock.setTimeout(()=>{void this.disconnect(4021);},10000);
    }
  }
  server.define('race',RaceRoom);
  return{
    findByCode(code:string):InviteLookup|null {return typeof code==='string'?rooms.get(code.trim().toUpperCase())?.lookup()??null:null;},
    /** Operational introspection, never exposed as a client mutation API. */
    get count(){return rooms.size;},
  };
}
