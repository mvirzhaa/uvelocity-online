const assert=require('node:assert/strict');
const crypto=require('node:crypto');

// Independently inspected source UV-island triangle ranges, not calculated by
// the runtime mask function. Every other Veyron triangle must retain its exact
// original material/texture, including the tire, brake disc, logo and bolts.
const VEYRON_PAINT_TRIANGLES=[
 [[2,21],[91,2366],[2405,4249],[4938,5057],[5060,5134]],
 [[79,106],[825,1019],[2801,6986]],
 [[82,109],[832,5546]],
 [[84,111],[866,5642]],
];
const hashBuffer=array=>crypto.createHash('sha256').update(Buffer.from(array.buffer,array.byteOffset,array.byteLength)).digest('hex');
function capture(car){
 const nodes=[],materials=new Map(),geometries=new Map(),textures=new Map();
 car.root.traverse(node=>{
  if(!node.isMesh)return;nodes.push({node,material:node.material,geometry:node.geometry,visible:node.visible});
  if(!geometries.has(node.geometry))geometries.set(node.geometry,{index:node.geometry.index?hashBuffer(node.geometry.index.array):null,groups:JSON.stringify(node.geometry.groups),attributes:Object.entries(node.geometry.attributes).map(([key,a])=>[key,hashBuffer(a.isInterleavedBufferAttribute?a.data.array:a.array)])});
  for(const material of Array.isArray(node.material)?node.material:[node.material]){
   if(!materials.has(material))materials.set(material,{color:material.color?.toArray(),roughness:material.roughness,metalness:material.metalness,map:material.map,normalMap:material.normalMap});
   for(const value of Object.values(material))if(value?.isTexture&&!textures.has(value))textures.set(value,{image:value.image,version:value.version,encoding:value.encoding,offset:value.offset.toArray(),repeat:value.repeat.toArray()});
  }
 });
 return {nodes,materials,geometries,textures};
}
function assertSourceUnchanged(before){
 for(const [material,original]of before.materials){assert.deepEqual(material.color?.toArray(),original.color);assert.equal(material.roughness,original.roughness);assert.equal(material.metalness,original.metalness);assert.strictEqual(material.map,original.map);assert.strictEqual(material.normalMap,original.normalMap);}
 for(const [geometry,original]of before.geometries){assert.equal(geometry.index?hashBuffer(geometry.index.array):null,original.index);assert.equal(JSON.stringify(geometry.groups),original.groups);for(const[key,hash]of original.attributes){const a=geometry.attributes[key];assert.equal(hashBuffer(a.isInterleavedBufferAttribute?a.data.array:a.array),hash,'Factory vertex data changed');}}
 for(const [texture,original]of before.textures){assert.strictEqual(texture.image,original.image);assert.equal(texture.version,original.version);assert.equal(texture.encoding,original.encoding);assert.deepEqual(texture.offset.toArray(),original.offset);assert.deepEqual(texture.repeat.toArray(),original.repeat);}
}
function paintedMaterials(car){const result=new Set();car.wheels.forEach(w=>w.traverse(node=>{for(const m of node.material?(Array.isArray(node.material)?node.material:[node.material]):[])if(m.userData.nvStockRimPaint)result.add(m);}));return [...result];}
function assertColor(THREE,materials,hex){const target=new THREE.Color(hex).convertSRGBToLinear().toArray();assert.ok(materials.length>0);for(const m of materials)assert.ok(m.color.toArray().every((value,i)=>Math.abs(value-target[i])<1e-8),'Explicit RGB must be converted once to renderer linear space');}
function verifyVeyronSplit(car,before){
 const results=[];
 car.wheels.forEach((wheel,wheelIndex)=>{
  const node=wheel.children.find(child=>child.isMesh),original=before.nodes.find(entry=>entry.node===node),split=node.geometry;
  assert.notStrictEqual(split,original.geometry);assert.equal(node.material.length,2);assert.strictEqual(node.material[0],original.material);assert.notStrictEqual(node.material[1],original.material);assert.equal(node.material[1].map,null);assert.strictEqual(node.material[1].normalMap,original.material.normalMap);
  assert.equal(split.groups.length,2);assert.equal(split.groups[0].materialIndex,0);assert.equal(split.groups[1].materialIndex,1);
  const source=original.geometry.index,paint=[],retained=[];
  for(let triangle=0;triangle<source.count/3;triangle++){
   const expected=VEYRON_PAINT_TRIANGLES[wheelIndex].some(([first,last])=>triangle>=first&&triangle<=last);
   for(let vertex=0;vertex<3;vertex++)(expected?paint:retained).push(source.getX(triangle*3+vertex));
  }
  const unpaintedGroup=split.groups[0],paintGroup=split.groups[1];assert.equal(unpaintedGroup.start,0);assert.equal(unpaintedGroup.count,retained.length);assert.equal(paintGroup.start,retained.length);assert.equal(paintGroup.count,paint.length);
  assert.deepEqual(Array.from(split.index.array),[...retained,...paint],'Composite paint must match exactly the inspected rim-face source triangles');
  for(const[key,a]of Object.entries(original.geometry.attributes)){const b=split.attributes[key];assert.equal(b.normalized,a.normalized);assert.equal(hashBuffer(b.isInterleavedBufferAttribute?b.data.array:b.array),hashBuffer(a.isInterleavedBufferAttribute?a.data.array:a.array));}
  results.push({wheel:wheelIndex,painted:paint.length/3,retained:retained.length/3});
 });
 return results;
}
function verifyStockRimPaint(THREE,car,Wheels,Imported){
 const before=capture(car),other=Imported.create(car.modelId,'#bf3344',{}),otherBefore=capture(other),ownedMaterials=new Set(),ownedGeometry=new Set();
 const assertFactory=()=>{for(const entry of before.nodes){assert.strictEqual(entry.node.material,entry.material);assert.strictEqual(entry.node.geometry,entry.geometry);assert.equal(entry.node.visible,entry.visible);}assertSourceUnchanged(before);};
 try{
  // Legacy/default rimColor is deliberately not a stock-paint instruction.
  Wheels.apply(car,{rimId:'stock',rimColor:'#ff0000'});assertFactory();assert.equal(Wheels.inspect(car).stockPaintActive,false);
  Wheels.apply(car,{rimId:'stock',rimColor:'#c7cdd4',stockRimPainted:true});assert.equal(Wheels.inspect(car).stockRimPainted,true);assert.equal(Wheels.inspect(car).stockPaintActive,true);assertColor(THREE,paintedMaterials(car),'#c7cdd4');
  let changed=0;const wheelNodes=new Set();car.wheels.forEach(w=>w.traverse(n=>wheelNodes.add(n)));
  for(const entry of before.nodes){
   if(entry.node.material===entry.material){assert.strictEqual(entry.node.geometry,entry.geometry);continue;}
   changed++;assert.ok(wheelNodes.has(entry.node),'Paint cannot touch body or fixed brake nodes');
   if(car.modelId!=='veyron77'){
    const original=Array.isArray(entry.material)?entry.material:[entry.material],now=Array.isArray(entry.node.material)?entry.node.material:[entry.node.material];
    original.forEach((m,i)=>{if(/^rim_paint(?:_|$)/.test(m.name||'')){assert.notStrictEqual(now[i],m);assert.strictEqual(now[i].map,m.map);assert.strictEqual(now[i].normalMap,m.normalMap);}else assert.strictEqual(now[i],m,'Tires, brakes, bolts and machined edges retain their exact material');});
    assert.strictEqual(entry.node.geometry,entry.geometry,'Separated rim slots never need source geometry replacement');
   }else ownedGeometry.add(entry.node.geometry);
  }
  car.wheels.forEach(w=>{let count=0;w.traverse(n=>{if(n.material&&(Array.isArray(n.material)?n.material:[n.material]).some(m=>m.userData.nvStockRimPaint))count++;});assert.ok(count>0,'Every stock wheel supports paint');});
  const composite=car.modelId==='veyron77'?verifyVeyronSplit(car,before):[];
  assertSourceUnchanged(before);assertSourceUnchanged(otherBefore);otherBefore.nodes.forEach(entry=>{assert.strictEqual(entry.node.material,entry.material);assert.strictEqual(entry.node.geometry,entry.geometry);});
  const sameMaterials=paintedMaterials(car);sameMaterials.forEach(m=>ownedMaterials.add(m));Wheels.apply(car,{rimId:'stock',rimColor:'#1234ef',stockRimPainted:true});assertColor(THREE,paintedMaterials(car),'#1234ef');assert.deepEqual(paintedMaterials(car),sameMaterials,'Changing RGB reuses only this car’s clones');
  Wheels.apply(other,{rimId:'stock',rimColor:'#ed2255',stockRimPainted:true});assertColor(THREE,paintedMaterials(other),'#ed2255');assertColor(THREE,paintedMaterials(car),'#1234ef');for(const m of paintedMaterials(other))assert.ok(!ownedMaterials.has(m),'Different cars cannot share painted material instances');assertSourceUnchanged(before);assertSourceUnchanged(otherBefore);
  // Custom rims restore the hidden source materials and keep their own paint.
  Wheels.apply(car,{rimId:'six-spoke',rimColor:'#45ab68',stockRimPainted:true});assert.equal(Wheels.inspect(car).stockPaintActive,false);
  for(const entry of before.nodes){assert.strictEqual(entry.node.material,entry.material);assert.strictEqual(entry.node.geometry,entry.geometry);}
  let upgradePaint;car.root.traverse(n=>{if(n.material?.name==='nv_upgrade_rim')upgradePaint=n.material;});assertColor(THREE,[upgradePaint],'#45ab68');
  Wheels.apply(car,{rimId:'stock',rimColor:'#45ab68',stockRimPainted:true});assertColor(THREE,paintedMaterials(car),'#45ab68');if(car.modelId==='veyron77')verifyVeyronSplit(car,before);
  Wheels.apply(car,{rimId:'stock',rimColor:'#45ab68',stockRimPainted:false});assertFactory();assert.equal(paintedMaterials(car).length,0);
  Wheels.apply(car,{rimId:'stock',rimColor:'#000000',stockRimPainted:true});assertColor(THREE,paintedMaterials(car),'#000000');
  const disposedMaterials=new Set(),disposedGeometry=new Set(),disposedSource=new Set();ownedMaterials.forEach(m=>m.addEventListener('dispose',()=>disposedMaterials.add(m)));ownedGeometry.forEach(g=>g.addEventListener('dispose',()=>disposedGeometry.add(g)));before.materials.forEach((_,m)=>m.addEventListener('dispose',()=>disposedSource.add(m)));
  Wheels.dispose(car);assertFactory();assert.equal(disposedMaterials.size,ownedMaterials.size);assert.equal(disposedGeometry.size,ownedGeometry.size);assert.equal(disposedSource.size,0,'Wheel paint disposal cannot release car/source materials');assertColor(THREE,paintedMaterials(other),'#ed2255');
  return {id:car.modelId,paintedNodes:changed,paintMaterials:ownedMaterials.size,composite};
 }finally{Wheels.dispose(other);Imported.dispose(other);Wheels.dispose(car);}
}
async function verifyOnlineStockRimPaint({api,q,frames,Wheels}){
 const racers=[{id:'me',loadout:{carId:'brz',rimId:'stock',rimColor:'#c7cdd4'}},{id:'rival',loadout:{carId:'veyron77',rimId:'stock',rimColor:'#c7cdd4'}}].map((r,i)=>({...r,x:i*4,z:0,heading:0,speed:0,steerAngle:0,driftAngle:0,bodyRoll:0,bodyPitch:0,nitro:0,nitroActive:false,lap:1,progress:0,finished:false}));
 await api.startRace({raceId:'stock-rim-wire',config:{circuit:'beach',laps:3},localRacerId:'me',loadouts:racers});
 const snapshot={raceId:'stock-rim-wire',tick:1,phase:'racing',serverTime:2000,elapsedMs:1000,startAt:1000,racers};api.applySnapshot(snapshot);await api.setCamera('interior');frames(.03);
 const factoryRival=q.racers.find(r=>r.id==='rival').visual,local=q.player.visual;assert.equal(Wheels.inspect(factoryRival).stockPaintActive,false);assert.equal(Wheels.inspect(local).stockPaintActive,false);
 const painted={...snapshot,tick:2,racers:racers.map(r=>r.id==='rival'?{...r,loadout:{...r.loadout,stockRimPainted:true}}:r)};api.applySnapshot(painted);frames(.03);
 const paintedRival=q.racers.find(r=>r.id==='rival').visual;assert.notStrictEqual(paintedRival,factoryRival,'Flag-only stock paint must invalidate remote appearance');assert.equal(Wheels.inspect(paintedRival).stockPaintActive,true);assert.equal(Wheels.inspect(paintedRival).stockCompositePartitions.length,4);assert.strictEqual(q.player.visual,local,'Remote rim paint must not reconstruct the local car');
 api.applySnapshot({...painted,tick:3});frames(.03);assert.strictEqual(q.racers.find(r=>r.id==='rival').visual,paintedRival,'Identical appearance must retain runtime materials');
 api.applySnapshot({...snapshot,tick:4,racers:racers.map(r=>r.id==='me'?{...r,loadout:{...r.loadout,stockRimPainted:true}}:r)});frames(.03);assert.equal(Wheels.inspect(q.racers.find(r=>r.id==='rival').visual).stockPaintActive,false);assert.equal(Wheels.inspect(q.player.visual).stockPaintActive,true);assert.equal(api.getState().camera,'interior');assert.ok(q.player.visual.cockpit.root.visible,'Local paint rebuild restores the active cockpit camera');
 await api.stopRace();
 return 'Frozen loadout/online appearance: missing stock flag preserves factory, same-RGB flag-only changes repaint local/remote stock rims, repeated snapshots reuse materials, default restoration and interior camera survive model reconstruction.';
}
module.exports={verifyStockRimPaint,verifyOnlineStockRimPaint};
