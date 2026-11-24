import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_VEHICLE_STATS } from '../../shared/catalog.js';
import { DEFAULT_PHYSICS, freezeLoadout, neutralInput, parseInput, validateRoomConfig } from '../../shared/config.js';
import { advanceLapProgress, advanceVehicle, botInput, createRacer, createVehicleState, placeStartingGrid, resolveCarCollisions } from '../../shared/simulation.js';
import { getTrack, pointAt } from '../../shared/track.js';
import { CAR_IDS, CIRCUIT_IDS, type CarId, type FrozenLoadout } from '../../shared/types.js';
import { RaceRuntime } from '../../server/realtime/RaceRuntime.js';

function loadout(carId:CarId='kaze'):FrozenLoadout{return freezeLoadout({carId,color:'#1199bb',finish:'metallic',rimId:'stock',stats:DEFAULT_VEHICLE_STATS[carId],tuningVersion:'test1'});}

test('Original three arc-length courses and physical15-car grids remain distinct and clear',()=>{
  const lengths=[1450.7607591860722,1924.2162173818447,1816.1935724392406];
  for(const [i,id]of (['city','beach','glacier']as const).entries()){
    const track=getTrack(id);assert.equal(track.samples.length,480);assert.ok(Math.abs(track.length-lengths[i]!)<1e-6);
    const racers=Array.from({length:15},(_,i)=>createRacer('r'+i,'R'+i,loadout(CAR_IDS[i%CAR_IDS.length]!),String(i)));
    placeStartingGrid(racers,track);
    for(const racer of racers){assert.ok(racer.progress<0);assert.equal(racer.completedLaps,0);assert.ok(Number.isFinite(racer.x));}
    for(let a=0;a<racers.length;a++)for(let b=a+1;b<racers.length;b++)assert.ok(Math.hypot(racers[a]!.x-racers[b]!.x,racers[a]!.z-racers[b]!.z)>6,'Grid separation');
  }
});

test('Config and input validation reject excess racers, nonfinite controls, forged tuning and stale sequences',()=>{
  assert.throws(()=>validateRoomConfig({maxHumans:15,bots:1}));assert.throws(()=>validateRoomConfig({laps:21}));assert.throws(()=>validateRoomConfig({bots:-1}));
  assert.equal(parseInput({seq:1,throttle:NaN,brake:0,steer:0,nitro:false}),null);
  assert.equal(parseInput({seq:1,throttle:2,brake:0,steer:0,nitro:false}),null);
  const clean=parseInput({seq:1,throttle:1,brake:0,steer:0,nitro:false,x:999999,topSpeed:99999});assert.ok(clean);assert.ok(!('x'in clean)&&!('topSpeed'in clean));
  const runtime=new RaceRuntime(validateRoomConfig({bots:0,maxHumans:1}),[createRacer('a','A',loadout(),'u')]);
  assert.ok(runtime.acceptInput('a',clean));runtime.step();assert.equal(runtime.racers[0]!.lastProcessedSeq,1);assert.equal(runtime.acceptInput('a',clean),false);
});

test('Player prediction uses exactly the same movement rules as server simulation',()=>{
  const racer=createRacer('p','P',loadout(),'u'),runtime=new RaceRuntime(validateRoomConfig({bots:0,maxHumans:1,collisionMode:'ghost'}),[racer]);
  const predicted={...racer};
  for(let tick=1;tick<=240;tick++){
    const input={seq:tick,throttle:1,brake:0,steer:tick>180?.12:0,nitro:tick>150};runtime.acceptInput('p',input);runtime.step();
    advanceVehicle(predicted,input,runtime.track,racer.loadout.stats,1/90,tick*1000/90,DEFAULT_PHYSICS);
    assert.ok(Math.abs(predicted.x-racer.x)<1e-10&&Math.abs(predicted.z-racer.z)<1e-10);assert.equal(predicted.speed,racer.speed);
  }
});

test('Batched controls acknowledge one simulated step at a time; flooding never buys extra physics time',()=>{
  const racer=createRacer('p','P',loadout(),'u'),runtime=new RaceRuntime(validateRoomConfig({bots:0,maxHumans:1,collisionMode:'ghost'}),[racer]);
  for(let batch=0;batch<20;batch++){
    const predicted={...racer},inputs=Array.from({length:4},(_,i)=>({seq:batch*4+i+1,throttle:1,brake:0,steer:batch>10?.08:0,nitro:false}));
    for(const [i,input]of inputs.entries()){assert.ok(runtime.acceptInput('p',input));advanceVehicle(predicted,input,runtime.track,racer.loadout.stats,1/90,runtime.elapsedMs+(i+1)*1000/90,runtime.physics);}
    runtime.step();assert.equal(racer.lastProcessedSeq,batch*4+1);
    const corrected={...racer};for(const [i,input]of inputs.slice(1).entries())advanceVehicle(corrected,input,runtime.track,racer.loadout.stats,1/90,runtime.elapsedMs+(i+1)*1000/90,runtime.physics);
    assert.ok(Math.hypot(corrected.x-predicted.x,corrected.z-predicted.z)<1e-10);
    for(let i=0;i<3;i++)runtime.step();assert.equal(racer.lastProcessedSeq,batch*4+4);
    assert.equal(racer.speed,predicted.speed);
  }
  const before=runtime.elapsedMs;
  for(let seq=81;seq<=180;seq++)runtime.acceptInput('p',{seq,throttle:1,brake:0,steer:0,nitro:true});
  runtime.step();assert.equal(racer.lastProcessedSeq,169);assert.ok(Math.abs(runtime.elapsedMs-before-1000/90)<1e-8);
  runtime.setConnected('p',false);assert.equal(racer.lastProcessedSeq,180);runtime.setConnected('p',true);
  assert.ok(runtime.acceptInput('p',{seq:181,throttle:0,brake:0,steer:0,nitro:false}));
});

test('Controls timeout and disconnect brake to a stop, never latch throttle or reverse',()=>{
  const racer=createRacer('p','P',loadout(),'u'),runtime=new RaceRuntime(validateRoomConfig({bots:0,maxHumans:1}),[racer]);
  for(let i=1;i<=180;i++){runtime.acceptInput('p',{seq:i,throttle:1,brake:0,steer:0,nitro:false});runtime.step();}
  assert.ok(racer.speed>10);runtime.setConnected('p',false);assert.equal(racer.ghost,true);
  for(let i=0;i<270;i++)runtime.step();assert.equal(racer.speed,0);assert.equal(racer.finished,false);
  runtime.setConnected('p',true);assert.equal(racer.ghost,false);assert.equal(runtime.acceptInput('p',{seq:2,throttle:1,brake:0,steer:0,nitro:false}),false);
  assert.ok(runtime.acceptInput('p',{seq:181,throttle:1,brake:0,steer:0,nitro:false}));runtime.step();assert.ok(racer.speed>0);
});

test('Ordered gates count selected laps exactly and do not farm first crossing or reverse motion',()=>{
  for(const laps of[1,3,20]){
    const car=createVehicleState();car.progress=-.02;car.lastTrackT=.98;let ms=0;
    advanceLapProgress(car,.99,laps,ms+=10);advanceLapProgress(car,0,laps,ms+=10);assert.equal(car.completedLaps,0);
    for(let i=0;i<20;i++){advanceLapProgress(car,.995,laps,ms+=10);advanceLapProgress(car,.005,laps,ms+=10);}assert.equal(car.completedLaps,0);
    // Continue along the complete course in chronological order.
    for(let lap=1;lap<=laps;lap++){
      for(let i=1;i<400;i++)advanceLapProgress(car,i/400,laps,ms+=10);
      assert.equal(car.finished,false);advanceLapProgress(car,0,laps,ms+=10);assert.equal(car.completedLaps,lap);
    }
    assert.equal(car.finished,true);assert.ok(car.bestLapMs!>0);assert.ok(car.finishTimeMs!>0);
  }
});

test('Solid contacts move both participants; ghosted cars do not block others',()=>{
  const a=createRacer('a','A',loadout(),'1'),b=createRacer('b','B',loadout(),'2'),track=getTrack('city');
  a.z=0;b.z=4;a.speed=20;b.speed=10;
  const events=resolveCarCollisions([a,b],track);assert.equal(events.length,1);assert.ok(a.z<0&&b.z>4);assert.ok(a.speed<20&&b.speed>10);
  a.z=0;b.z=1;b.ghost=true;assert.equal(resolveCarCollisions([a,b],track).length,0);assert.equal(a.z,0);
});

test('All15 racers run each course under shared physics and every human finishes before results', {timeout:120000},()=>{
  for(const circuit of CIRCUIT_IDS){
    const racers=Array.from({length:15},(_,i)=>createRacer('r'+i,'R'+i,loadout(CAR_IDS[i%CAR_IDS.length]!),i<4?'u'+i:null,i>=4));
    const runtime=new RaceRuntime(validateRoomConfig({circuit,laps:1,maxHumans:4,bots:11,difficulty:'normal',collisionMode:'solid'}),racers);
    let ticks=0;
    while(!runtime.ended&&ticks++<90*300){
      for(const racer of racers.filter(r=>!r.isBot&&!r.finished&&!r.dnf))runtime.acceptInput(racer.id,botInput(racer,racers,runtime.track,1/90,'normal'));
      runtime.step();
    }
    assert.ok(runtime.ended,'Race completes: '+circuit);
    assert.ok(racers.filter(r=>!r.isBot).every(r=>r.finished),'Every human controller finishes: '+circuit);
    assert.ok(racers.filter(r=>r.isBot).every(r=>r.finished||r.dnf),'Bots finish or are classified DNF when all humans finish: '+circuit);
    assert.ok(racers.filter(r=>r.isBot).every(r=>r.distanceMeters>0),'Every bot participates before the final human: '+circuit);
    assert.ok(racers.every(r=>Number.isFinite(r.x)&&Number.isFinite(r.speed)));
  }
});
