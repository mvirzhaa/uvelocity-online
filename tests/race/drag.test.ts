import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_VEHICLE_STATS } from '../../shared/catalog.js';
import { DEFAULT_PHYSICS, MAX_RACERS, freezeLoadout, validateRoomConfig } from '../../shared/config.js';
import { advanceFinishedVehicle, advanceLapProgress, advanceVehicle, botInput, createRacer, placeStartingGrid, resolveCarCollisions } from '../../shared/simulation.js';
import { CAR_HALF_WIDTH, getTrack, nearestTrackIndex, pointAt, projectTrackT } from '../../shared/track.js';
import { RaceRuntime } from '../../server/realtime/RaceRuntime.js';

const track=getTrack('drag-2km'),dt=1/90;
const loadout=()=>freezeLoadout({carId:'brz',color:'#2866b8',finish:'metallic',rimId:'stock',stats:DEFAULT_VEHICLE_STATS.brz,tuningVersion:'drag-test'});
const makeRacer=(id='drag-human')=>createRacer(id,id,loadout(),id);
const input=(seq:number)=>({seq,throttle:1,brake:0,steer:0,nitro:false});

test('drag timing lines are exactly2000m apart and open projection never wraps',()=>{
  assert.equal(track.closed,false);assert.equal(track.length,2000);assert.equal(track.samples.length,480);assert.equal(track.runout,700);
  const first=pointAt(track,0),last=pointAt(track,1);assert.equal(Math.hypot(last.x-first.x,last.z-first.z),2000);
  assert.ok(Math.abs(first.z)<1e-12);assert.equal(last.z,-2000);assert.ok(Math.abs(pointAt(track,-.05).z-100)<1e-9);assert.ok(Math.abs(pointAt(track,1.35).z+2700)<1e-9);
  for(const z of[8.5,0,-500,-1000,-1500,-1999.99,-2000,-2001,-2690]){
    const index=nearestTrackIndex(track,12,z,0),t=projectTrackT(track,12,z,index);
    assert.ok(index>=0&&index<480);assert.ok(Math.abs(t-(-z/2000))<1e-10);
  }
});

test('all15 drag launch positions have equal distance and safe distinct lanes',()=>{
  const racers=Array.from({length:MAX_RACERS},(_,i)=>makeRacer('r'+i));placeStartingGrid(racers,track);
  assert.equal(new Set(racers.map(r=>r.z)).size,1);assert.equal(new Set(racers.map(r=>r.progress)).size,1);
  for(const racer of racers){assert.ok(Math.abs(racer.z-8.5)<1e-10);assert.equal(racer.heading,Math.PI);assert.ok(Math.abs(racer.x)+CAR_HALF_WIDTH<track.roadHalf);assert.equal(racer.nextGate,0);}
  for(let i=1;i<racers.length;i++)assert.equal(racers[i]!.x-racers[i-1]!.x,3);
  assert.deepEqual(resolveCarCollisions(racers,track),[]);
  const solo=[makeRacer()];placeStartingGrid(solo,track);assert.equal(solo[0]!.x,0);assert.ok(Math.abs(solo[0]!.z-8.5)<1e-10);
});

test('server canonicalizes drag to a single journey while retaining circuit lap settings',()=>{
  for(const laps of[1,3,20])assert.equal(validateRoomConfig({circuit:'drag-2km',laps}).laps,1);
  assert.equal(validateRoomConfig({circuit:'city',laps:3}).laps,3);
  for(const laps of[0,21,NaN,1.5])assert.throws(()=>validateRoomConfig({circuit:'drag-2km',laps}));
});

test('actual authoritative physics travels every metre before the single drag finish',()=>{
  const racer=makeRacer(),sim=new RaceRuntime(validateRoomConfig({circuit:'drag-2km',laps:9,bots:0,maxHumans:1}),[racer]);
  let crossedStart=false,lastZ=racer.z,lastElapsed=0;
  for(let tick=1;tick<90*100&&!sim.ended;tick++){
    lastZ=racer.z;lastElapsed=sim.elapsedMs;assert(sim.acceptInput(racer.id,input(tick)));const events=sim.step();
    if(racer.z<=0)crossedStart=true;
    if(racer.z>-2000+1e-7){assert.equal(racer.finished,false);assert.equal(events.some(e=>e.type==='finish'),false);}
  }
  assert(crossedStart);assert(sim.ended&&racer.finished);assert.equal(racer.completedLaps,1);assert.equal(racer.progress,1);assert.equal(racer.nextGate,5);
  assert(lastZ>-2000&&racer.z<=-2000);assert(racer.distanceMeters>=2008.5-1e-7);
  assert(racer.finishTimeMs!>=lastElapsed&&racer.finishTimeMs!<=sim.elapsedMs);assert(racer.bestLapMs!>0);
  assert.equal(sim.config.laps,1);assert(racer.trackT>=1);assert(racer.speed>0);
});

test('wrong-way travel, sideways motion, staging oscillations and large shortcuts cannot finish drag',()=>{
  const racer=makeRacer();placeStartingGrid([racer],track);
  let elapsed=0;
  // Reversing from the staging grid must go farther from the finish, never
  // reinterpret a negative coordinate as the end of a circular course.
  for(let i=0;i<400;i++){
    elapsed+=1000/90;advanceVehicle(racer,{...input(i+1),throttle:0,brake:1},track,racer.loadout.stats,dt,elapsed);
    advanceLapProgress(racer,racer.trackT,20,elapsed,1000/90,false);
  }
  assert(racer.z>8.5);assert(racer.progress<0);assert.equal(racer.nextGate,0);assert(!racer.finished);
  placeStartingGrid([racer],track);racer.heading=Math.PI/2;
  for(let i=0;i<15;i++){elapsed+=1000/90;advanceVehicle(racer,input(i+1),track,racer.loadout.stats,dt,elapsed);advanceLapProgress(racer,racer.trackT,1,elapsed,1000/90,false);}
  assert(Math.abs(racer.z-8.5)<1e-8);assert.equal(racer.nextGate,0);assert(!racer.finished);
  placeStartingGrid([racer],track);
  for(let i=0;i<100;i++)for(const t of[.0001,-.0001])advanceLapProgress(racer,t,1,++elapsed,1,false);
  assert.equal(racer.nextGate,1);assert(!racer.finished);
  // A forged projection at the finish earns neither skipped quarters nor a lap.
  advanceLapProgress(racer,1.001,1,++elapsed,1,false);assert(!racer.finished);assert.equal(racer.nextGate,1);
  for(let i=0;i<100;i++)advanceLapProgress(racer,1.001+i*.0001,1,++elapsed,1,false);
  assert(!racer.finished);assert.equal(racer.nextGate,1);
});

test('drag reset never grants longitudinal distance and finishing coast stays beyond FINISH',()=>{
  const racer=makeRacer();placeStartingGrid([racer],track);
  racer.trackT=.123456;racer.trackIdx=nearestTrackIndex(track,7,-246.912,0);racer.x=7;racer.z=-246.912;racer.progress=.123456;racer.lastTrackT=.123456;
  advanceVehicle(racer,{...input(1),throttle:0,reset:true},track,racer.loadout.stats,dt,10000);
  assert.ok(Math.abs(racer.z+246.912)<1e-9);assert.equal(racer.x,0);assert.ok(Math.abs(racer.trackT-.123456)<1e-10);
  for(const speed of[70,250]){
    Object.assign(racer,{finished:true,speed,x:12,z:-2000.5,trackT:1.00025,trackIdx:479,progress:1,finishTimeMs:45678,distanceMeters:2008.5,nextGate:5});
    let previousZ=racer.z,previousSpeed=speed;
    for(let i=0;i<90*60&&racer.speed>0;i++){
      advanceFinishedVehicle(racer,track,dt,DEFAULT_PHYSICS);
      assert(racer.z<=previousZ+1e-8);assert(racer.z<-2000);assert(racer.trackT>=1);assert(racer.speed<=previousSpeed);assert.equal(racer.x,12);
      assert.equal(racer.progress,1);assert.equal(racer.finishTimeMs,45678);assert.equal(racer.distanceMeters,2008.5);assert.equal(racer.nextGate,5);
      previousZ=racer.z;previousSpeed=racer.speed;
    }
    assert.equal(racer.speed,0);assert(racer.z>=-2700);assert(racer.z<-2020);
  }
});

test('drag bots hold fair launch lanes and prediction matches server at the endpoint',()=>{
  const racers=Array.from({length:15},(_,i)=>makeRacer('lane-'+i));placeStartingGrid(racers,track);
  const lanes=racers.map(r=>r.x);
  for(let tick=0;tick<600;tick++)for(const racer of racers){const control=botInput(racer,racers,track,dt,'normal');advanceVehicle(racer,control,track,racer.loadout.stats,dt,tick*1000/90);}
  for(const [i,racer]of racers.entries())assert(Math.abs(racer.x-lanes[i]!)<1e-8);
  const racer=makeRacer(),sim=new RaceRuntime(validateRoomConfig({circuit:'drag-2km',bots:0,maxHumans:1}),[racer]),predicted={...racer};
  for(let tick=1;tick<=900;tick++){
    const control=input(tick);sim.acceptInput(racer.id,control);sim.step();advanceVehicle(predicted,control,track,racer.loadout.stats,dt,sim.elapsedMs,DEFAULT_PHYSICS);
    assert(Math.abs(predicted.z-racer.z)<1e-9);assert.equal(predicted.x,racer.x);assert.equal(predicted.speed,racer.speed);
  }
});
