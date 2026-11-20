import { clamp, DEFAULT_PHYSICS, neutralInput } from './config.js';
import { CAR_HALF_WIDTH, ROAD_HALF, nearestTrackIndex, pointAt, projectTrackT, signedTrackOffset, wrap, type Track } from './track.js';
import type { FrozenLoadout, GameplayEvent, PhysicsConfig, RacerState, VehicleInput, VehicleState, VehicleStats } from './types.js';

export function createVehicleState():VehicleState {
  return {x:0,z:0,heading:0,speed:0,steerAngle:0,driftAngle:0,bodyRoll:0,bodyPitch:0,nitro:50,nitroActive:false,
    trackIdx:0,trackT:0,lastTrackT:0,progress:0,nextGate:0,lap:1,completedLaps:0,lapStartedMs:null,lastLapMs:null,bestLapMs:null,
    finished:false,finishTimeMs:null,distanceMeters:0,lastResetMs:-Infinity};
}
export function createRacer(id:string,name:string,loadout:FrozenLoadout,userId:string|null=null,isBot=false):RacerState {
  return {...createVehicleState(),id,userId,name,isBot,loadout,connected:true,ghost:false,dnf:false,lastProcessedSeq:0,
    input:neutralInput(),inputReceivedMs:0,disconnectedAtMs:null,botLane:0,botTargetLane:0,botLaneTimer:2,botSeed:hashSeed(id)};
}
export function placeStartingGrid(racers:RacerState[],track:Track):void {
  racers.forEach((racer,slot)=>{
    const row=Math.floor(slot/2),lane=racers.length===1?0:slot%2?3.65:-3.65,back=8.5+row*8.4+(slot%2?1.7:0);
    const t=wrap(1-back/track.length),point=pointAt(track,t);
    Object.assign(racer,createVehicleState(),{x:point.x+point.nx*lane,z:point.z+point.nz*lane,heading:Math.atan2(point.tx,point.tz),trackIdx:Math.floor(t*track.samples.length),trackT:t,lastTrackT:t,progress:t-1,
      input:neutralInput(),inputReceivedMs:0,lastProcessedSeq:0,ghost:false,dnf:false,botLane:lane,botTargetLane:lane,botLaneTimer:2+(slot%5)*.43});
  });
}
export function shortestAngle(value:number):number {
  while(value>Math.PI)value-=Math.PI*2;while(value<-Math.PI)value+=Math.PI*2;return value;
}

/** Pure arcade rules shared by the authoritative server and local prediction.
 * Mutates only state. Rendering, sound, timing and network policy are separate. */
export function advanceVehicle(state:VehicleState,input:VehicleInput,track:Track,stats:VehicleStats,dt:number,elapsedMs=0,physics:PhysicsConfig=DEFAULT_PHYSICS):GameplayEvent[] {
  if(!(dt>0&&dt<=.1)||state.finished)return[];
  const events:GameplayEvent[]=[];
  if(input.reset&&elapsedMs-state.lastResetMs>=physics.resetCooldownMs){
    const point=track.samples[state.trackIdx]!;
    state.x=point.x;state.z=point.z;state.heading=Math.atan2(point.tx,point.tz);state.speed=clamp(state.speed,0,15);
    state.steerAngle=state.driftAngle=state.bodyRoll=state.bodyPitch=0;state.lastResetMs=elapsedMs;
    // A reset reanchors projection without granting route distance or a gate.
    state.trackT=state.lastTrackT=projectTrackT(track,state.x,state.z,state.trackIdx);events.push({type:'reset'});
  }
  const maxNormal=stats.topSpeed/3.6,maxNitro=maxNormal*physics.nitroMultiplier;
  const throttle=clamp(input.throttle,0,1),brake=clamp(input.brake,0,1),steer=clamp(input.steer,-1,1);
  state.nitroActive=input.nitro&&state.nitro>1&&state.speed>5&&brake<.01;
  if(state.nitroActive)state.nitro=Math.max(0,state.nitro-physics.nitroDrain*dt);
  else if(state.speed>20)state.nitro=Math.min(100,state.nitro+physics.nitroRecharge*dt);
  const baseAccel=27.78/stats.zeroTo100,accel=state.nitroActive?baseAccel*physics.nitroAccelerationMultiplier:baseAccel*(1-.46*Math.max(0,state.speed-28)/maxNormal);
  const targetMax=state.nitroActive?maxNitro:maxNormal;let isBraking=false;
  if((throttle>0||state.nitroActive)&&brake<.01){
    if(state.speed<targetMax)state.speed=Math.min(targetMax,state.speed+accel*dt*(state.nitroActive?1:throttle));
    else state.speed=Math.max(targetMax,state.speed-18*dt);
  }else if(brake>0){
    if(state.speed>1){state.speed-=physics.brakeRate*brake*dt;isBraking=true;}
    else state.speed=Math.max(-physics.reverseSpeed,state.speed-20*brake*dt);
  }else if(state.speed>0)state.speed=Math.max(0,state.speed-physics.coastDrag*dt);
  else if(state.speed<0)state.speed=Math.min(0,state.speed+physics.coastDrag*dt);
  const speedFactor=Math.min(1,Math.abs(state.speed)/14),damp=1-Math.min(.42,Math.abs(state.speed)/maxNitro*.42);
  const turnRate=1.95*stats.handling*speedFactor*damp*(state.speed>=0?1:-1);
  state.steerAngle+=(steer*.45-state.steerAngle)*Math.min(1,dt*12);state.heading=shortestAngle(state.heading+steer*turnRate*dt);
  const drifting=Math.abs(steer)>.5&&state.speed>36,targetDrift=drifting?steer*.24:0;
  state.driftAngle+=(targetDrift-state.driftAngle)*Math.min(1,dt*7);
  if(drifting)state.nitro=Math.min(100,state.nitro+physics.driftRecharge*Math.min(1,(state.speed-34)/40)*dt);
  const beforeX=state.x,beforeZ=state.z,angle=state.heading-state.driftAngle*.45;
  state.x+=Math.sin(angle)*state.speed*dt;state.z+=Math.cos(angle)*state.speed*dt;
  state.trackIdx=nearestTrackIndex(track,state.x,state.z,state.trackIdx);
  const offset=signedTrackOffset(track,state.x,state.z,state.trackIdx),maximum=ROAD_HALF-CAR_HALF_WIDTH;
  if(Math.abs(offset)>maximum){
    const sign=Math.sign(offset),excess=Math.abs(offset)-maximum,point=track.samples[state.trackIdx]!;
    state.x-=point.nx*sign*(excess+.18);state.z-=point.nz*sign*(excess+.18);
    state.heading=shortestAngle(state.heading+shortestAngle(Math.atan2(point.tx,point.tz)-state.heading)*.22);
    if(Math.abs(state.speed)>12){events.push({type:'rail',intensity:Math.min(1,Math.abs(state.speed)/70)});state.speed*=.84;}
  }
  state.trackT=projectTrackT(track,state.x,state.z,state.trackIdx);
  // Exclude resets/large projection corrections from physically travelled distance.
  state.distanceMeters+=Math.min(Math.hypot(state.x-beforeX,state.z-beforeZ),Math.abs(state.speed)*dt+1);
  const roll=-steer*Math.min(.14,state.speed/65*.14),pitch=isBraking?.05:state.nitroActive?-.055:throttle>0?-.025:0;
  state.bodyRoll+=(roll-state.bodyRoll)*Math.min(1,dt*10);state.bodyPitch+=(pitch-state.bodyPitch)*Math.min(1,dt*8);
  return events;
}

/** Ordered progress gates work identically for every human and bot. */
export function advanceLapProgress(state:VehicleState,t:number,laps:number,elapsedMs:number,dtMs=0):GameplayEvent[] {
  if(state.finished)return[];
  let delta=t-state.lastTrackT;if(delta>.5)delta--;if(delta<-.5)delta++;
  state.lastTrackT=t;state.trackT=t;
  if(!Number.isFinite(delta)||Math.abs(delta)>.12)return[];
  const before=state.progress;state.progress+=delta;if(delta<=0)return[];
  const events:GameplayEvent[]=[];
  while(state.nextGate<=laps*4&&before<state.nextGate/4+1e-7&&state.progress+1e-7>=state.nextGate/4){
    const gate=state.nextGate++,fraction=clamp((gate/4-before)/delta,0,1),when=Math.max(0,elapsedMs-dtMs*(1-fraction));
    if(gate===0){state.lapStartedMs=when;continue;}
    if(gate%4!==0)continue;
    state.completedLaps=gate/4;state.lap=Math.min(laps,state.completedLaps+1);
    const duration=when-(state.lapStartedMs??0);state.lastLapMs=duration;state.bestLapMs=state.bestLapMs===null?duration:Math.min(state.bestLapMs,duration);state.lapStartedMs=when;
    events.push({type:'lap',lap:state.completedLaps});
    if(state.completedLaps>=laps){state.progress=laps;state.finished=true;state.nitroActive=false;state.finishTimeMs=when;events.push({type:'finish'});break;}
  }
  return events;
}

/** Symmetric oriented-body contact, independent of which human is local. */
export function resolveCarCollisions(racers:RacerState[],track:Track):GameplayEvent[] {
  const events:GameplayEvent[]=[];
  for(let i=0;i<racers.length;i++)for(let j=i+1;j<racers.length;j++){
    const a=racers[i]!,b=racers[j]!;if(a.ghost||b.ghost||a.dnf||b.dnf||a.finished||b.finished)continue;
    const dx=b.x-a.x,dz=b.z-a.z;if(dx*dx+dz*dz>36)continue;
    const axes=[{x:Math.sin(a.heading),z:Math.cos(a.heading)},{x:Math.cos(a.heading),z:-Math.sin(a.heading)},
      {x:Math.sin(b.heading),z:Math.cos(b.heading)},{x:Math.cos(b.heading),z:-Math.sin(b.heading)}];
    let overlap=Infinity,nx=0,nz=0,separated=false;
    const extent=(r:RacerState,axis:{x:number;z:number})=>Math.abs(axis.x*Math.sin(r.heading)+axis.z*Math.cos(r.heading))*2.3+Math.abs(axis.x*Math.cos(r.heading)-axis.z*Math.sin(r.heading))*1.05;
    for(const axis of axes){const along=dx*axis.x+dz*axis.z,penetration=extent(a,axis)+extent(b,axis)-Math.abs(along);
      if(penetration<=0){separated=true;break;}if(penetration<overlap){overlap=penetration;const sign=along<0?-1:1;nx=axis.x*sign;nz=axis.z*sign;}}
    if(separated)continue;
    const push=(overlap+.015)/2;a.x-=nx*push;a.z-=nz*push;b.x+=nx*push;b.z+=nz*push;
    const closing=(a.speed*Math.sin(a.heading)-b.speed*Math.sin(b.heading))*nx+(a.speed*Math.cos(a.heading)-b.speed*Math.cos(b.heading))*nz;
    if(closing>0){const impulse=closing*.55;a.speed-=impulse*(Math.sin(a.heading)*nx+Math.cos(a.heading)*nz);b.speed+=impulse*(Math.sin(b.heading)*nx+Math.cos(b.heading)*nz);}
    for(const racer of[a,b]){racer.speed*=.985;racer.trackIdx=nearestTrackIndex(track,racer.x,racer.z,racer.trackIdx);racer.trackT=projectTrackT(track,racer.x,racer.z,racer.trackIdx);}
    events.push({type:'collision',racerId:a.id,otherId:b.id,intensity:clamp(Math.abs(closing)/35,.05,1)});
  }
  return events;
}

function hashSeed(text:string):number {let result=2166136261;for(const c of text){result^=c.charCodeAt(0);result=Math.imul(result,16777619);}return result>>>0||1;}
function random(racer:RacerState):number {let s=racer.botSeed;s^=s<<13;s^=s>>>17;s^=s<<5;racer.botSeed=s>>>0;return racer.botSeed/4294967296;}
/** AI supplies controls to exactly the same physical rules as every human. */
export function botInput(racer:RacerState,racers:RacerState[],track:Track,dt:number,difficulty:'easy'|'normal'|'hard'):VehicleInput {
  racer.botLaneTimer-=dt;if(racer.botLaneTimer<=0){racer.botLaneTimer=3+random(racer)*3;racer.botTargetLane=(random(racer)-.5)*10;}
  let leader:RacerState|undefined,gap=Infinity;
  const lane=signedTrackOffset(track,racer.x,racer.z,racer.trackIdx);
  for(const other of racers){if(other===racer||other.dnf||other.finished)continue;const distance=wrap(other.trackT-racer.trackT)*track.length,otherLane=signedTrackOffset(track,other.x,other.z,other.trackIdx);
    if(distance>.02&&distance<24&&Math.abs(otherLane-lane)<2.7&&distance<gap){leader=other;gap=distance;}}
  if(leader&&gap<18){const desired=lane>=0?-4.2:4.2;const blocked=racers.some(other=>other!==racer&&!other.finished&&!other.dnf&&Math.abs(shortestTrackDistance(other.trackT-racer.trackT)*track.length)<11&&Math.abs(signedTrackOffset(track,other.x,other.z,other.trackIdx)-desired)<2.7);if(!blocked)racer.botTargetLane=desired;}
  racer.botLane+=clamp(racer.botTargetLane-racer.botLane,-2.6*dt,2.6*dt);
  const lookAhead=10+Math.max(0,racer.speed)*.36,target=pointAt(track,racer.trackT+lookAhead/track.length);
  const targetHeading=Math.atan2(target.x+target.nx*racer.botLane-racer.x,target.z+target.nz*racer.botLane-racer.z);
  const steer=clamp(shortestAngle(targetHeading-racer.heading)*2.5,-1,1);
  const ahead=pointAt(track,racer.trackT+24/track.length),current=pointAt(track,racer.trackT),corner=Math.max(.35,current.tx*ahead.tx+current.tz*ahead.tz);
  const factor={easy:.66,normal:.82,hard:.95}[difficulty];
  let targetSpeed=Math.min(racer.loadout.stats.topSpeed/3.6*.96,(58+(racer.botSeed%7))*factor)*corner;
  if(leader&&gap<19)targetSpeed=Math.min(targetSpeed,Math.max(2,leader.speed+(gap-7.5)*1.2));
  return {seq:racer.lastProcessedSeq+1,throttle:racer.speed<targetSpeed?1:0,brake:racer.speed>targetSpeed+3?clamp((racer.speed-targetSpeed)/12,0,1):0,steer,nitro:false};
}
function shortestTrackDistance(value:number):number {if(value>.5)return value-1;if(value<-.5)return value+1;return value;}
export function sortRacers(racers:readonly RacerState[]):RacerState[]{return[...racers].sort((a,b)=>{
  if(a.finished&&b.finished)return(a.finishTimeMs??Infinity)-(b.finishTimeMs??Infinity)||a.id.localeCompare(b.id);
  if(a.finished!==b.finished)return a.finished?-1:1;if(a.dnf!==b.dnf)return a.dnf?1:-1;
  return b.progress-a.progress||a.id.localeCompare(b.id);
});}
