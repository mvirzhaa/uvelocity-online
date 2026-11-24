const assert=require('node:assert/strict');

// Check the geometry that the GLTF loader actually gives the game. Material
// selection lets a missing roof stay open even when seats are visible below it.
function verifyVehicleExpansion({THREE,Imported,metadata,Audio}){
 const familyIds=['honda-crv-rs','mitsubishi-pajero-sport','toyota-fortuner','toyota-innova-zenix'];
 const ids=['jesko-absolut','venom-f5','panther-grand-touring',...familyIds];
 const templates=Object.fromEntries(ids.map(id=>[id,Imported.getTemplate(id)]));
 const dimensions={};
 for(const id of ids){
  const model=templates[id];assert.ok(model,id+' must load its own model');model.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());
  dimensions[id]=size.toArray();
  assert.ok(size.x>1.5&&size.y>.9&&size.z>3.8,'Usable vehicle dimensions: '+id);
  model.traverse(node=>{
   if(!node.isMesh)return;
   const position=node.geometry.attributes.position,normal=node.geometry.attributes.normal;
   assert.ok(position&&position.count>0,'Renderable mesh: '+id);
   for(const value of position.array)assert.ok(Number.isFinite(value),'Finite source geometry: '+id);
   if(normal)for(const value of normal.array)assert.ok(Number.isFinite(value),'Finite source normals: '+id);
   if(node.geometry.index)for(const index of node.geometry.index.array)assert.ok(index>=0&&index<position.count,'Valid source index: '+id);
  });
  const meta=metadata[id];assert.ok(meta,'Effect metadata is required: '+id);
  assert.ok(Math.abs(meta.length-size.z)<.002,'Manifest length must fit the loaded geometry: '+id);
  for(const anchor of[...meta.headlightPositions,...meta.exhaustPositions]){
   assert.equal(anchor.length,3);assert.ok(anchor.every(Number.isFinite),'Finite effect anchor: '+id);
   assert.ok(anchor[0]>=bounds.min.x-.1&&anchor[0]<=bounds.max.x+.1&&anchor[1]>=bounds.min.y-.1&&anchor[1]<=bounds.max.y+.1&&anchor[2]>=bounds.min.z-.15&&anchor[2]<=bounds.max.z+.15,'Effects must stay at the loaded body: '+id);
  }
 }
 assert.notEqual(templates['jesko-absolut'],templates['venom-f5'],'Hypercars must not share a loaded template');

 function upperSurface(id,points,withGlass){
  const meshes=[];
  templates[id].traverse(node=>{
   if(!node.isMesh)return;
   const materials=Array.isArray(node.material)?node.material:[node.material];
   if(materials.some(material=>/^paint(?:_|$)/.test(material.name)||(withGlass&&/^glass(?:_clear)?$/.test(material.name))))meshes.push(node);
  });
  return points.map(([x,z])=>{
   const ray=new THREE.Raycaster(new THREE.Vector3(x,3,z),new THREE.Vector3(0,-1,0),0,4);
   return ray.intersectObjects(meshes,false)[0]?.point.y??0;
  });
 }
 const cabinPoints=[-.20,0,.20].flatMap(x=>[-.55,-.30,0].map(z=>[x,z]));
 const regeraRoof=upperSurface('jesko-absolut',cabinPoints,true),venomRoof=upperSurface('venom-f5',cabinPoints,true);
 const closedCount=heights=>heights.filter(y=>y>1.05).length;
 assert.ok(closedCount(regeraRoof)>=7,'Reference Regera must retain a closed canopy over the driver area');
 assert.ok(closedCount(venomRoof)<=2,'Reference Venom roadster must have a real roof opening, not transparent paint');
 const roofGap=regeraRoof.reduce((sum,height,i)=>sum+height-venomRoof[i],0)/cabinPoints.length;
 assert.ok(roofGap>.15,'The two cockpit silhouettes must be physically distinct');
 const bonnetPoints=[-.7,-.35,0,.35,.7].flatMap(x=>[1.25,1.6,1.95,2.2].map(z=>[x,z]));
 const regeraBonnet=upperSurface('jesko-absolut',bonnetPoints,false),venomBonnet=upperSurface('venom-f5',bonnetPoints,false);
 const paired=surfacePairs(regeraBonnet,venomBonnet);
 assert.ok(paired.length>=12,'Both front clamshells must cover the bonnet sample area');
 const bonnetDifference=paired.reduce((sum,[a,b])=>sum+Math.abs(a-b),0)/paired.length;
 assert.ok(bonnetDifference>.02,'Hypercars must not reuse the same front body surface');

 const pantherHeight=dimensions['panther-grand-touring'][1];
 assert.ok(pantherHeight>1.75&&pantherHeight>Math.max(dimensions['jesko-absolut'][1],dimensions['venom-f5'][1])*1.3,'Panther must retain a tall MPV silhouette');
 const engine=new Audio.ProceduralAudio({context:{createPeriodicWave:(real,imag)=>({real,imag})}});
 assert.equal(engine.setVehicle('panther-grand-touring'),true);
 assert.equal(engine.profile.fuel,'diesel');assert.equal(engine.profile.cylinders,4);
 assert.ok(engine.profile.idleRpm<1000&&engine.profile.redlineRpm<6000&&engine.profile.redlineRpm>engine.profile.idleRpm,'Diesel synthesis should use its lower game RPM range');
 const wave=engine._wave(engine.profile,false),power=Array.from(wave.real,(value,i)=>value**2+wave.imag[i]**2);
 assert.ok(power.every(Number.isFinite));assert.equal(power[0],0);
 assert.equal(power.indexOf(Math.max(...power)),4,'Diesel combustion pulse train must retain its four-cylinder firing harmonic');
 const familyEngines={};
 for(const id of familyIds){
  assert.ok(dimensions[id][1]>1.7&&dimensions[id][1]<2.2,'Family vehicle keeps its tall cabin: '+id);
  assert.ok(dimensions[id][2]>4.5&&dimensions[id][2]<5.4,'Family model has a full-size passenger body: '+id);
  assert.ok(familyIds.filter(other=>other!==id).every(other=>templates[other]!==templates[id]),'Every family vehicle owns distinct geometry: '+id);
  assert.equal(engine.setVehicle(id),true);assert.equal(engine.profile.cylinders,4);
  assert.equal(engine.profile.fuel,['mitsubishi-pajero-sport','toyota-fortuner'].includes(id)?'diesel':'hybrid');
  const waveform=engine._wave(engine.profile,false),energy=Array.from(waveform.real,(value,i)=>value**2+waveform.imag[i]**2);
  assert.ok(energy.every(Number.isFinite)&&energy.some(value=>value>0),'Playable family-engine synthesis: '+id);
  assert.equal(energy.indexOf(Math.max(...energy)),4,'Four-cylinder firing cycle: '+id);
  familyEngines[id]={fuel:engine.profile.fuel,idleRpm:engine.profile.idleRpm,redlineRpm:engine.profile.redlineRpm,dominantCycleHarmonic:4};
 }
 assert.equal(Audio.recordedSamples,false);
 const diesel=Audio.profiles['panther-grand-touring'];
 return {dimensions,closedCanopyRays:{regera:closedCount(regeraRoof),venom:closedCount(venomRoof),total:cabinPoints.length},averageRoofHeightGap:roofGap,averageBonnetHeightDifference:bonnetDifference,diesel:{idleRpm:diesel.idleRpm,redlineRpm:diesel.redlineRpm,dominantCycleHarmonic:4,synthesis:true},familyEngines};
}
function surfacePairs(first,second){return first.flatMap((height,i)=>height>.1&&second[i]>.1?[[height,second[i]]]:[]);}
module.exports={verifyVehicleExpansion};
