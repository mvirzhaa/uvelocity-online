import { neutralInput, parseInput, resolvePhysics } from '../../shared/config.js';
import { advanceFinishedVehicle, advanceLapProgress, advanceVehicle, botInput, placeStartingGrid, resolveCarCollisions, sortRacers } from '../../shared/simulation.js';
import { getTrack, type Track } from '../../shared/track.js';
import type { GameplayEvent, PhysicsConfig, RacerSnapshot, RacerState, RoomConfig, VehicleInput } from '../../shared/types.js';

/** One race's state, with no sockets, wall clocks, graphics or database calls. */
export class RaceRuntime {
  readonly track:Track;
  readonly physics:PhysicsConfig;
  readonly racers:RacerState[];
  tick=0;
  elapsedMs=0;
  ended=false;
  private firstHumanFinishMs:number|null=null;
  // The browser predicts one fixed step per command. Keep short network bursts
  // in order, rather than acknowledging two commands after simulating only one.
  // The bounded queue never grants extra simulation time to a fast sender.
  private commands=new Map<string,VehicleInput[]>();
  private applied=new Map<string,VehicleInput>();
  constructor(readonly config:RoomConfig,racers:RacerState[],physics:Partial<PhysicsConfig>={},readonly inputTimeoutMs=400,readonly maximumDurationMs?:number){
    this.track=getTrack(config.circuit);this.physics=resolvePhysics(physics);this.racers=racers;
    placeStartingGrid(racers,this.track);
  }
  acceptInput(id:string,value:unknown):boolean {
    const racer=this.racers.find(r=>r.id===id),input=parseInput(value);
    if(this.ended||!racer||racer.isBot||!racer.connected||racer.dnf||racer.finished||!input||input.seq<=racer.input.seq||input.seq<=racer.lastProcessedSeq)return false;
    racer.input=input;racer.inputReceivedMs=this.elapsedMs;
    const queue=this.commands.get(id)??[];queue.push(input);
    if(queue.length>12)queue.splice(0,queue.length-12);
    this.commands.set(id,queue);return true;
  }
  setConnected(id:string,connected:boolean):void {
    const racer=this.racers.find(r=>r.id===id);if(!racer)return;
    racer.connected=connected;racer.disconnectedAtMs=connected?null:this.elapsedMs;
    racer.ghost=!connected||racer.finished||racer.dnf;
    // Any in-flight commands from the dropped socket are deliberately retired.
    // A refreshed browser can start after this acknowledgement without replaying
    // stale acceleration or waiting to rediscover the previous highest seq.
    racer.lastProcessedSeq=Math.max(racer.input.seq,racer.lastProcessedSeq);
    racer.input=neutralInput(racer.lastProcessedSeq,0);racer.inputReceivedMs=this.elapsedMs;
    this.commands.delete(id);this.applied.delete(id);
  }
  markDnf(id:string):void {
    const racer=this.racers.find(r=>r.id===id);if(!racer||racer.finished)return;
    racer.dnf=true;racer.connected=false;racer.ghost=true;racer.nitroActive=false;racer.speed=0;racer.input=neutralInput(racer.input.seq);
    this.commands.delete(id);this.applied.delete(id);
  }
  /** A room pause retains every position/speed/lap but retires held and queued
   * controls. Resuming requires fresh input; no pre-pause nitro/reset replays. */
  clearControls():void {
    this.commands.clear();this.applied.clear();
    for(const racer of this.racers){
      racer.lastProcessedSeq=Math.max(racer.lastProcessedSeq,racer.input.seq);
      racer.input=neutralInput(racer.lastProcessedSeq,0);racer.inputReceivedMs=-Infinity;racer.nitroActive=false;
    }
  }
  step():GameplayEvent[]{
    if(this.ended)return[];
    const dt=1/this.physics.tickRate;this.tick++;this.elapsedMs=this.tick*1000/this.physics.tickRate;
    const events:GameplayEvent[]=[];
    for(const racer of this.racers){
      if(racer.finished){advanceFinishedVehicle(racer,this.track,dt,this.physics);continue;}
      if(racer.dnf)continue;
      let input:VehicleInput;
      if(racer.isBot)input=botInput(racer,this.racers,this.track,dt,this.config.difficulty);
      else if(!racer.connected||this.elapsedMs-racer.inputReceivedMs>this.inputTimeoutMs){
        // Missing input never leaves throttle latched. Stop, rather than reverse,
        // while the connection is temporarily absent or no longer supplying input.
        input=neutralInput(racer.lastProcessedSeq,racer.speed>1.5?1:0);
        if(Math.abs(racer.speed)<1.5)racer.speed=0;
        this.commands.delete(racer.id);this.applied.delete(racer.id);
        racer.lastProcessedSeq=Math.max(racer.lastProcessedSeq,racer.input.seq);
      }else{
        const command=this.commands.get(racer.id)?.shift();
        if(command)this.applied.set(racer.id,command);
        const held=command??this.applied.get(racer.id)??neutralInput(racer.lastProcessedSeq);
        input={...held,reset:held.reset===true&&held.seq>racer.lastProcessedSeq};
      }
      const effects=advanceVehicle(racer,input,this.track,racer.loadout.stats,dt,this.elapsedMs,this.physics);
      effects.forEach(event=>events.push({...event,racerId:racer.id}));
      racer.lastProcessedSeq=Math.max(racer.lastProcessedSeq,input.seq);
    }
    if(this.config.collisionMode==='solid')events.push(...resolveCarCollisions(this.racers,this.track));
    for(const racer of this.racers){
      if(racer.finished||racer.dnf)continue;
      const progress=advanceLapProgress(racer,racer.trackT,this.config.laps,this.elapsedMs,dt*1000,this.track.closed);
      progress.forEach(event=>events.push({...event,racerId:racer.id}));
      if(racer.finished){
        racer.ghost=true;racer.lastProcessedSeq=Math.max(racer.lastProcessedSeq,racer.input.seq);
        racer.input=neutralInput(racer.lastProcessedSeq);this.commands.delete(racer.id);this.applied.delete(racer.id);
        if(!racer.isBot&&this.firstHumanFinishMs===null)this.firstHumanFinishMs=this.elapsedMs;
      }
    }
    const deadline=this.maximumDurationMs??Math.max(180000,this.config.laps*this.track.length/12*1000+60000);
    const grace=this.firstHumanFinishMs!==null&&this.elapsedMs-this.firstHumanFinishMs>Math.max(60000,this.track.length/15*1000);
    if(this.elapsedMs>=deadline||grace)for(const racer of this.racers)if(!racer.finished)this.markDnf(racer.id);
    const humans=this.racers.filter(r=>!r.isBot);
    // Every still-participating human gets their finish. A dropped connection
    // is still a participant until RaceRoom's existing reconnect grace marks
    // it DNF; unfinished bots never delay the final human's result.
    if(humans.every(r=>r.finished||r.dnf)){
      for(const racer of this.racers)if(!racer.finished)this.markDnf(racer.id);
      this.ended=true;
    }
    return events;
  }
  snapshots():RacerSnapshot[]{
    const rankings=new Map(sortRacers(this.racers).map((r,i)=>[r.id,i+1]));
    return this.racers.map(r=>({id:r.id,userId:r.userId,name:r.name,isBot:r.isBot,loadout:r.loadout,connected:r.connected,ghost:r.ghost,dnf:r.dnf,lastProcessedSeq:r.lastProcessedSeq,position:rankings.get(r.id)!,
      x:r.x,z:r.z,heading:r.heading,speed:r.speed,steerAngle:r.steerAngle,driftAngle:r.driftAngle,bodyRoll:r.bodyRoll,bodyPitch:r.bodyPitch,nitro:r.nitro,nitroActive:r.nitroActive,
      trackIdx:r.trackIdx,trackT:r.trackT,lastTrackT:r.lastTrackT,progress:r.progress,nextGate:r.nextGate,lap:r.lap,completedLaps:r.completedLaps,lapStartedMs:r.lapStartedMs,lastLapMs:r.lastLapMs,bestLapMs:r.bestLapMs,
      finished:r.finished,finishTimeMs:r.finishTimeMs,distanceMeters:r.distanceMeters,lastResetMs:Number.isFinite(r.lastResetMs)?r.lastResetMs:-1000000,
      lapTimeMs:r.finished?(r.lastLapMs??0):r.lapStartedMs===null?0:Math.max(0,this.elapsedMs-r.lapStartedMs)}));
  }
}
