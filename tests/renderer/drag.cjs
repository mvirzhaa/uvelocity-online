const assert=require('node:assert/strict');

/** Exercises the shipped open world and snapshot renderer with real geometry.
 * This CPU harness deliberately makes no claim about rendered image quality. */
async function verifyDragStrip({THREE,api,q,frames,$}){
  await api.stopRace();await api.configure({circuit:'drag-2km',laps:12,previewOnly:true,quality:'high'});
  assert.equal(q.settings.circuit,'drag-2km');assert.equal(q.settings.laps,1);assert.equal($('lap-count').disabled,true);assert.equal($('lap-increase').disabled,true);
  assert.equal($('ticket-laps').textContent,'Sekali jalan');assert.equal($('race-distance').textContent,'2.00 km total');
  assert(!$('ticket-map-path').getAttribute('d').endsWith(' Z'),'Open course map must not close back to START');
  assert.equal(q.track.length,480);assert.ok(Math.abs(q.track[0].z)<1e-12);assert.equal(q.track[479].z,-2000);
  const world=q.scene.getObjectByName('Drag Strip 2 KM');assert(world);world.updateMatrixWorld(true);
  const start=world.getObjectByName('Drag START timing line'),finish=world.getObjectByName('Drag FINISH timing line');assert(start&&finish);
  assert.equal(start.getWorldPosition(new THREE.Vector3()).distanceTo(finish.getWorldPosition(new THREE.Vector3())),2000);
  const road=world.getObjectByName('Drag asphalt staging to braking runout'),bounds=new THREE.Box3().setFromObject(road);
  assert(Math.abs(bounds.min.z+2700)<1e-8&&Math.abs(bounds.max.z-100)<1e-8);assert.equal(bounds.max.x-bounds.min.x,45);assert.equal(world.userData.raceLength,2000);assert.equal(world.userData.runout,700);
  const resources=new Set(),disposals=new Map();let calls=0,triangles=0;
  world.traverse(node=>{
    if(!node.isMesh)return;calls++;triangles+=(node.geometry.index?.count||node.geometry.attributes.position.count)/3*(node.isInstancedMesh?node.count:1);
    for(const number of node.geometry.attributes.position.array)assert(Number.isFinite(number),'Finite drag geometry');
    if(node.isInstancedMesh)for(const number of node.instanceMatrix.array)assert(Number.isFinite(number),'Finite lane/barrier instances');
    if(!node.isInstancedMesh){const b=new THREE.Box3().setFromObject(node);if(b.max.y>.1&&b.min.y<3)assert(b.max.x<=-22.5||b.min.x>=22.5,'Driving corridor obstruction: '+node.name);}
    resources.add(node.geometry);for(const material of Array.isArray(node.material)?node.material:[node.material]){resources.add(material);for(const value of Object.values(material))if(value?.isTexture)resources.add(value);}
  });
  assert(calls<250);assert(triangles<80000);
  for(const resource of resources)resource.addEventListener('dispose',()=>disposals.set(resource,(disposals.get(resource)||0)+1));
  await api.configure({quality:'low',timeOfDay:'night'});assert.equal(world.getObjectByName('Drag paddock detail').visible,false);await api.configure({quality:'medium',timeOfDay:'dusk'});
  await api.startRace({raceId:'drag-render-qa',config:{circuit:'drag-2km',laps:1},localRacerId:'me',loadouts:[{id:'me',loadout:{carId:'brz'}}]});
  const snapshot={raceId:'drag-render-qa',tick:1,serverTime:40000,elapsedMs:40000,phase:'racing',racers:[{id:'me',loadout:{carId:'brz'},x:12,z:-2000.4,heading:Math.PI,speed:70,trackT:1.0002,trackIdx:479,progress:1,lap:1,completedLaps:1,nextGate:5,nitro:45,nitroActive:false,finished:true,finishTimeMs:39995,lapTimeMs:38000,bestLapMs:38000,position:1}]};
  assert(api.applySnapshot(snapshot));assert.equal(q.player.trackT,1.0002);frames(.1);assert.equal(q.player.visual.root.position.z,-2000.4);
  assert(api.applySnapshot({...snapshot,tick:2,phase:'settling'}));const official=q.player.pos.clone(),pose=q.player.nvVisualPose;
  frames(.5);assert(pose.pos.z<official.z);assert(pose.pos.z<-2000);assert.equal(pose.pos.x,12);assert(pose.speed>0&&pose.speed<70);
  assert(q.player.pos.equals(official));assert.equal(q.player.progress,1);assert.equal(q.player.finishTime,39995);
  frames(3.1);assert.equal(pose.speed,0);assert(pose.pos.z>=-2700&&pose.pos.z<-2000);assert(q.player.pos.equals(official));
  await api.stopRace();await api.configure({circuit:'city',laps:3,previewOnly:true});
  assert.equal(q.settings.laps,3);assert.equal($('lap-count').disabled,false);assert.equal(world.parent,null);assert.equal(world.children.length,0);
  for(const resource of resources)assert.equal(disposals.get(resource),1,'Drag owned resource disposes once');
  return `2km drag world: independent timing gantries exactly2000m apart,45m/15-lane fair strip,700m braking pavement,${calls} mesh draws/${triangles} instance triangles, clear driving corridor, open map, forced one journey, quality/day settings, nonwrapping authoritative and visual finish rollout, circuit restoration and owned-resource disposal.`;
}
module.exports={verifyDragStrip};
