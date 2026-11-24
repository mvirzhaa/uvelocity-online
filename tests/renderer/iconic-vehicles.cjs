const assert=require('node:assert/strict');

function verifyIconicVehicles({THREE,Imported,metadata,Audio}){
 const ids=['batmobile-tumbler','knight-rider-kitt'],report={};
 for(const id of ids){
  const model=Imported.getTemplate(id);assert.ok(model,'Dedicated collectible GLB must load: '+id);
  model.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());
  assert.ok(bounds.min.y>-.012&&bounds.min.y<.012,'Tyres rest at ground level: '+id);
  assert.ok(size.z>4.3&&size.z<5.2,'Collectible retains a full-length body: '+id);
  assert.ok(size.x<3,'Collectible must fit inside an existing 3m drag launch lane: '+id);
  assert.ok(Math.abs(size.z-metadata[id].length)<.002,'Effect metadata matches final geometry: '+id);
  let meshes=0,triangles=0;
  model.traverse(node=>{
   if(!node.isMesh)return;meshes++;const geometry=node.geometry,p=geometry.attributes.position;
   triangles+=(geometry.index?.count||p.count)/3;
   for(const value of p.array)assert.ok(Number.isFinite(value),'Finite vehicle geometry: '+id);
   for(const value of geometry.attributes.normal?.array||[])assert.ok(Number.isFinite(value),'Finite vehicle normal: '+id);
   for(const index of geometry.index?.array||[])assert.ok(index>=0&&index<p.count,'Valid GLB index: '+id);
  });
  assert.ok(meshes<70&&triangles<180000,'Collectible geometry stays within its review budget: '+id);
  const audio=new Audio.ProceduralAudio({context:{createPeriodicWave:(real,imag)=>({real,imag})}});
  assert.equal(audio.setVehicle(id),true);assert.equal(audio.profile.cylinders,8);
  const waveform=audio._wave(audio.profile,false);
  assert.ok(Array.from(waveform.real).every(Number.isFinite));
  assert.ok(Array.from(waveform.imag).some(value=>Math.abs(value)>0));
  report[id]={dimensions:size.toArray(),meshes,triangles,syntheticAudio:true};
 }
 const tumbler=Imported.create(ids[0],'#202329',{});
 try{
  assert.equal(tumbler.wheels.length,6,'Tumbler has six separately fitted rotating wheel groups');
  assert.equal(tumbler.frontPivots.length,2,'Only two front wheels steer');
  let rearMarkers=0;tumbler.root.traverse(node=>{if(node.isMesh&&(Array.isArray(node.material)?node.material:[node.material]).includes(tumbler.brakeMat))rearMarkers++;});
  assert.ok(rearMarkers>0,'Tumbler rear markers must be wired to the shared brake-light material');
  tumbler.root.updateMatrixWorld(true);
  const centers=tumbler.wheels.map(wheel=>wheel.getWorldPosition(new THREE.Vector3()));
  assert.equal(centers.filter(p=>p.z>1).length,2);
  const rear=centers.filter(p=>p.z< -1);assert.equal(rear.length,4);
  assert.equal(new Set(rear.map(p=>p.x.toFixed(3))).size,4,'Rear tyres keep four distinct lateral centers');
  assert.ok(Math.max(...rear.map(p=>p.z))-Math.min(...rear.map(p=>p.z))<.001,'Dual rear tyres share an axle line');
  for(const wheel of tumbler.wheels){
   const radius=wheel.userData.nvStockRollingRadius;
   assert.ok(Number.isFinite(radius)&&radius>0);
   assert.ok(wheel.scale.distanceTo(new THREE.Vector3(1,1,1))<1e-5,'Wheel fit must be baked, not distorted by nonuniform scaling');
  }
  assert.ok(tumbler.wheels[2].userData.nvStockRollingRadius>tumbler.wheels[0].userData.nvStockRollingRadius*1.3,'Rear wheels rotate more slowly for their larger radius');
  assert.ok(tumbler.paintMaterials.every(material=>material.roughness===.6),'Tumbler starts with matte armor');
  report[ids[0]].wheelCenters=centers.map(p=>p.toArray());
 }finally{Imported.dispose(tumbler);}
 const first=Imported.create(ids[1],'#10141a',{}),second=Imported.create(ids[1],'#10141a',{});
 try{
  assert.equal(first.wheels.length,4);assert.equal(first.scannerMaterials.length,8);
  assert.equal(first.animatedEffects,true);assert.ok(first.paintMaterials.every(material=>material.roughness===.22));
  const original=first.scannerMaterials.map(material=>material.emissiveIntensity);
  first.scannerMaterials.forEach((material,index)=>{
   assert.notStrictEqual(material,second.scannerMaterials[index],'Scanner materials belong to one car instance');
   assert.equal(material.toneMapped,false);assert.ok(material.emissive.r>material.emissive.g*3);
  });
  const materials=first.ownMaterials.slice(),geometry=first.ownGeometries.slice();
  const peak=()=>first.scannerMaterials.map(m=>m.emissiveIntensity).indexOf(Math.max(...first.scannerMaterials.map(m=>m.emissiveIntensity)));
  Imported.updateEffects(first,0);assert.equal(peak(),0);
  Imported.updateEffects(first,1/1.15);assert.equal(peak(),7,'Scanner reaches the opposite end');
  Imported.updateEffects(first,2/1.15);assert.equal(peak(),0,'Scanner reverses back to its starting end');
  Imported.updateEffects(first,.36);assert.ok(peak()>0&&peak()<7);
  assert.deepEqual(second.scannerMaterials.map(m=>m.emissiveIntensity),original,'Updating one car cannot animate another instance');
  for(let i=0;i<120;i++)Imported.updateEffects(first,i/30);
  assert.deepEqual(first.ownMaterials,materials);assert.deepEqual(first.ownGeometries,geometry);
  Imported.updateEffects(first,NaN);assert.ok(first.scannerMaterials.every(m=>Number.isFinite(m.emissiveIntensity)));
  report[ids[1]].scanner={cells:8,bidirectional:true,instanceIsolated:true,noFrameAllocations:true};
 }finally{Imported.dispose(first);Imported.dispose(second);}
 return report;
}
async function verifyIconicOnline({api,q,frames}){
 const racers=[
  {id:'me',loadout:{carId:'batmobile-tumbler',color:'#202329',finish:'matte',rimId:'stock'}},
  {id:'rival',loadout:{carId:'knight-rider-kitt',color:'#10141a',finish:'gloss',rimId:'stock'}}
 ].map((r,i)=>({...r,x:i*3,z:-10,heading:Math.PI,speed:12,steerAngle:.12,driftAngle:0,bodyRoll:0,bodyPitch:0,nitro:40,nitroActive:false,lap:1,progress:10,finished:false}));
 await api.startRace({raceId:'iconic-rigs',config:{circuit:'drag-2km',laps:1},localRacerId:'me',loadouts:racers});
 const snapshot={raceId:'iconic-rigs',tick:1,phase:'racing',serverTime:2000,elapsedMs:1000,startAt:1000,racers};
 api.applySnapshot(snapshot);
 const tumbler=q.player.visual,kitt=q.racers.find(r=>r.id==='rival').visual;
 assert.equal(tumbler.wheels.length,6);
 const before=tumbler.wheels.map(w=>w.rotation.x);frames(.2);
 const distance=tumbler.wheels.map((w,i)=>(w.rotation.x-before[i])*w.userData.nvStockRollingRadius);
 assert.ok(distance[0]>.1);assert.ok(distance.every(value=>Math.abs(value-distance[0])<1e-7),'All six stock tyres roll the same road distance despite unequal radii');
 assert.ok(tumbler.frontPivots.every(p=>Math.abs(p.rotation.y-.12)<1e-8));
 const scanner=()=>kitt.scannerMaterials.map(m=>m.emissiveIntensity),first=scanner();frames(.23);
 assert.ok(scanner().some((v,i)=>Math.abs(v-first[i])>.01),'Remote KITT scanner advances in the race world');
 await api.setCamera('dashboard');frames(.03);assert.ok(tumbler.wheels.every(w=>!w.visible),'Dashboard hides all six exterior wheels');
 await api.setCamera('chase');frames(.03);assert.ok(tumbler.wheels.every(w=>w.visible),'Leaving dashboard restores all six wheels');
 api.applySnapshot({...snapshot,tick:2,phase:'prayer_pause'});
 const heldWheels=tumbler.wheels.map(w=>w.rotation.x),heldScanner=scanner();frames(1);
 assert.deepEqual(tumbler.wheels.map(w=>w.rotation.x),heldWheels);assert.deepEqual(scanner(),heldScanner,'KITT scanner respects the shared prayer pause');
 api.applySnapshot({...snapshot,tick:3});frames(.24);assert.ok(scanner().some((v,i)=>Math.abs(v-heldScanner[i])>.01));
 await api.stopRace();
 return 'Iconic cars in an online drag snapshot: all six Tumbler tyres roll equal road distance, only front pivots steer, dashboard restores every wheel, remote KITT scanner animates and freezes with the shared prayer pause.';
}
module.exports={verifyIconicVehicles,verifyIconicOnline};
