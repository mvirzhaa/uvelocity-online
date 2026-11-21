const assert=require('node:assert/strict');

async function verifyFinishFlow({THREE,api,q,frames,key,$}){
 const originalAudio=q.audio.updateEngine;let audioArgs;
 q.audio.updateEngine=function(...args){audioArgs=args;return originalAudio.apply(this,args);};
 const phases=[],off=api.on('phase',event=>phases.push(event.phase));
 try{
  await api.startRace({raceId:'finish-rollout',config:{circuit:'beach',laps:3},localRacerId:'me',loadouts:[{id:'me',loadout:{carId:'brz'}},{id:'rival',loadout:{carId:'veyron77'}},{id:'bot',isBot:true,loadout:{carId:'brz'}}]});
  await api.setCamera('interior');
  const p=q.track[0],next=q.track[1],heading=Math.atan2(next.x-p.x,next.z-p.z);
  const racer=(id,isBot=false)=>({id,isBot,loadout:{carId:id==='rival'?'veyron77':'brz'},x:p.x,z:p.z,heading,speed:40,steerAngle:.10,driftAngle:0,bodyRoll:0,bodyPitch:0,nitro:40,nitroActive:true,lap:3,completedLaps:2,progress:2.99,trackT:0,trackIdx:0,lapTimeMs:990,bestLapMs:1000,finished:false});
  const snapshot={raceId:'finish-rollout',tick:1,serverTime:3000,elapsedMs:2900,startAt:100,phase:'racing',racers:[racer('me'),racer('rival'),racer('bot',true)]};
  api.applySnapshot(snapshot);key('KeyW');frames(.03);assert.equal(api.getInput().throttle,1);
  const crossed={...snapshot,tick:2,serverTime:3100,elapsedMs:3000,racers:snapshot.racers.map(r=>r.id==='me'?{...r,finished:true,nitroActive:false,lap:3,completedLaps:3,progress:3,finishTimeMs:3000,lapTimeMs:1000}:r)};
  api.applySnapshot(crossed);assert.equal(q.inputs.up,false,'Finish clears held throttle');
  const officialFinishPos=q.player.pos.clone(),wheelBefore=q.player.visual.wheels[0].rotation.x,particles=q.particles.length;
  key('KeyW');key('ShiftLeft');key('KeyR');api.setInput({throttle:1,brake:1,steer:1,nitro:true,reset:true});api.playEvents([{type:'collision',racerId:'me',intensity:1}]);frames(.1);
  assert.equal(api.getInput().throttle,0);assert.equal(api.getInput().nitro,false);assert.equal(api.getInput().brake,0);assert.equal(q.online.resetRequested,false);assert.equal(q.inputs.up,false);assert.equal(q.particles.length,particles,'No post-finish collision sparks');
  assert.ok(q.player.pos.equals(officialFinishPos));assert.equal(q.player.speed,40,'Racing-phase coast remains server-authoritative');assert.equal(q.player.nvVisualPose,null);assert.ok(q.player.visual.wheels[0].rotation.x>wheelBefore);assert.ok(q.player.visual.flames.every(f=>!f.visible));assert.equal(audioArgs[4],true);assert.equal(audioArgs[5].throttle,false);assert.equal(audioArgs[2],false);
  const coast={...crossed,tick:3,serverTime:3300,elapsedMs:3200,racers:crossed.racers.map(r=>r.id==='me'?{...r,x:next.x,z:next.z,speed:36,trackT:1/q.samples,trackIdx:1}:r)};
  api.applySnapshot(coast);frames(.05);assert.equal(q.player.speed,36);assert.ok(q.player.visual.root.position.distanceTo(new THREE.Vector3(next.x,0,next.z))<1e-8);assert.equal(Number($('hud-speed').textContent),130);
  const prayer={...coast,tick:4,phase:'prayer_pause',prayerPause:{pauseToken:'finish-coast-prayer',startedAt:3300,resumeEligibleAt:903300,requiredIds:['me','rival'],readyIds:[]}};
  const pausedWheel=q.player.visual.wheels[0].rotation.x;api.applySnapshot(prayer);frames(.5);assert.equal(q.player.visual.wheels[0].rotation.x,pausedWheel);assert.equal(q.audio.state.active,false);assert.ok(q.player.pos.distanceTo(new THREE.Vector3(next.x,0,next.z))<1e-8);
  api.applySnapshot({...coast,tick:5,serverTime:903300,prayerPause:null});frames(.03);assert.equal(api.getInput().throttle,0);assert.equal(q.audio.state.active,true);
  // Results enter immediately even while an unfinished bot is still on track.
  const ending={...coast,tick:6,serverTime:903600,elapsedMs:3500,phase:'settling',racers:coast.racers.map(r=>r.id==='rival'?{...r,finished:true,nitroActive:false,finishTimeMs:3500,progress:3,completedLaps:3}:r)};
  api.applySnapshot(ending);assert.equal(q.state.mode,'FINISHED');assert.equal(phases.at(-1),'settling');assert.equal(q.racers.find(r=>r.id==='bot').finished,false);
  const authoritative={pos:q.player.pos.clone(),speed:q.player.speed,progress:q.player.progress,finishTime:q.player.finishTime,lap:q.player.lap,clock:q.clock};
  const rollout=q.player.nvRollout,pose=q.player.nvVisualPose,rollWheel=q.player.visual.wheels[0].rotation.x;
  assert.equal(rollout.elapsed,0);assert.equal(pose.speed,36);assert.ok(pose.pos.equals(authoritative.pos));
  frames(.45);assert.ok(pose.speed>0&&pose.speed<36);assert.ok(pose.pos.distanceTo(authoritative.pos)>1);assert.ok(q.player.pos.equals(authoritative.pos));assert.equal(q.player.speed,authoritative.speed);assert.ok(q.player.visual.wheels[0].rotation.x>rollWheel);assert.equal(q.audio.state.active,true);assert.equal(audioArgs[5].throttle,false);assert.ok(Number($('hud-speed').textContent)<130);
  const elapsed=rollout.elapsed,speed=pose.speed;
  const finished={...ending,tick:7,phase:'finished'};api.applySnapshot(finished);assert.strictEqual(q.player.nvRollout,rollout);frames(.2);assert.ok(rollout.elapsed>elapsed);assert.ok(pose.speed<speed,'Result snapshot cannot restart visual rollout');
  // Defensive freeze if a room pause reaches the renderer during an outro.
  api.applySnapshot({...finished,tick:8,phase:'prayer_pause',prayerPause:prayer.prayerPause});const frozen={elapsed:rollout.elapsed,pos:pose.pos.clone(),wheel:q.player.visual.wheels[0].rotation.x};frames(.5);
  assert.equal(rollout.elapsed,frozen.elapsed);assert.ok(pose.pos.equals(frozen.pos));assert.equal(q.player.visual.wheels[0].rotation.x,frozen.wheel);assert.equal(q.audio.state.active,false);
  api.applySnapshot({...finished,tick:9});frames(3.1);assert.equal(pose.speed,0);assert.equal(rollout.elapsed,3);assert.equal(q.audio.state.active,false);assert.equal(Number($('hud-speed').textContent),0);
  const resting=pose.pos.clone(),restWheel=q.player.visual.wheels[0].rotation.x;frames(.25);assert.ok(pose.pos.equals(resting));assert.equal(q.player.visual.wheels[0].rotation.x,restWheel);
  assert.ok(q.player.pos.equals(authoritative.pos));assert.equal(q.player.speed,authoritative.speed);assert.equal(q.player.progress,authoritative.progress);assert.equal(q.player.finishTime,authoritative.finishTime);assert.equal(q.player.lap,authoritative.lap);assert.equal(q.clock,authoritative.clock);
  assert.equal(api.getInput().throttle,0);assert.equal(api.getInput().nitro,false);await api.stopRace();assert.equal(q.racers.length,0);assert.equal(q.camera.near,.07);
  return 'Finished cars: neutral held/external/reset/nitro controls, official racing-phase coasting snapshots, silent prayer freeze, immediate result phase with unfinished bots, separate 3-second monotonic visual/wheel/HUD/audio rollout, repeated result snapshots never restart, official positions/speed/laps/times/results remain unchanged.';
 }finally{q.audio.updateEngine=originalAudio;off();}
}
module.exports={verifyFinishFlow};
