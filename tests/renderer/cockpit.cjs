const assert=require('node:assert/strict');

// Actual Three.js geometry, projection and ray casting. This deliberately makes
// no assertion about GPU shading or pixel quality in the portable DOM harness.
function verifyCockpitGeometry(THREE,car,Cockpit){
 const before=[...car.root.children],rig=Cockpit.create(car),owned=[];
 assert.equal(rig.root.visible,false,'Cockpit is lazy and initially hidden');
 assert.match(rig.profile.origin,/procedural/);assert.equal(rig.profile.vehicleId,car.modelId);
 assert.ok(rig.eye.y>.7&&rig.eye.y<Math.max(1.3,(car.dimensions?.[1]||1.36)*.88),'Driver eye should sit inside the cabin');
 assert.ok(Math.abs(rig.eye.x)<rig.profile.width*.40);
 if(car.modelId==='panther-grand-touring'){
  assert.ok(rig.eye.y>1.35&&rig.eye.y<1.65,'MPV viewpoint should follow the higher driver seat');
  assert.ok(rig.eye.x<0,'Panther cockpit should put the driver on the right');
  const header=rig.root.getObjectByName('Windshield roof header');
  assert.ok(header.position.y>rig.eye.y&&header.position.y<1.9,'MPV header must fit below the exterior roof rails');
 }
 let draws=0,triangles=0;
 rig.root.traverse(node=>{
  if(!node.isMesh)return;draws++;triangles+=(node.geometry.index?.count||node.geometry.attributes.position.count)/3;
  for(const value of node.geometry.attributes.position.array)assert.ok(Number.isFinite(value),'Nonfinite cockpit geometry');
  for(const mat of Array.isArray(node.material)?node.material:[node.material]){if('roughness'in mat)assert.ok(mat.roughness>=0&&mat.roughness<=1);if('metalness'in mat)assert.ok(mat.metalness>=0&&mat.metalness<=1);}
  owned.push(node);
 });
 assert.ok(draws<70,'Cockpit draw budget');assert.ok(triangles<18000,'Cockpit geometry budget');
 rig.root.visible=true;car.root.updateMatrixWorld(true);
 const camera=new THREE.PerspectiveCamera(74,16/9,.025,1700);
 camera.position.copy(rig.eye).applyMatrix4(rig.root.matrixWorld);
 camera.lookAt(rig.eye.clone().add(new THREE.Vector3(0,0,15)).applyMatrix4(rig.root.matrixWorld));camera.updateMatrixWorld(true);
 const marker=()=>rig.mark.getWorldPosition(new THREE.Vector3()).project(camera);
 const hub=rig.wheel.getWorldPosition(new THREE.Vector3()).project(camera);
 assert.ok(Math.abs(hub.x)<.10&&hub.y>-.98&&hub.y<-.20,'Steering hub must be in the lower viewport');
 const neutral=marker();assert.ok(Math.abs(neutral.x)<.05&&neutral.y>-.8&&neutral.y<0,'Wheel center stripe must be visible below road');
 // The central windshield/road corridor stays clear, also at portrait aspects.
 for(const aspect of[16/9,4/3,9/16]){
  camera.aspect=aspect;camera.updateProjectionMatrix();
  for(const x of[-.18,0,.18])for(const y of[-.05,0,.15]){
   const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(x,y),camera);
   assert.equal(ray.intersectObjects(rig.root.children,true).filter(hit=>hit.distance<3).length,0,car.modelId+' windshield corridor obstructed');
  }
 }
 camera.aspect=16/9;camera.updateProjectionMatrix();
 rig.update({steerAngle:.2,speedKmh:117,gear:3,lap:2,totalLaps:5});car.root.updateMatrixWorld(true);
 assert.ok(Math.abs(rig.wheel.rotation.z+1.26)<1e-8);assert.ok(marker().x<neutral.x,'Left steering must turn marker towards driver left');
 rig.update({steerAngle:-.2,speedKmh:117,gear:3,lap:2,totalLaps:5});car.root.updateMatrixWorld(true);
 assert.ok(marker().x>neutral.x,'Right steering must turn marker towards driver right');
 rig.update({steerAngle:99,speedKmh:99999,gear:'R'});assert.ok(Math.abs(rig.wheel.rotation.z)<=.62*6.3+1e-9,'Wheel angle clamps extreme input');
 rig.update({steerAngle:NaN,speedKmh:NaN});assert.equal(Math.abs(rig.wheel.rotation.z),0);
 const geometries=new Set(owned.map(n=>n.geometry)),disposed=new Set();geometries.forEach(g=>g.addEventListener('dispose',()=>disposed.add(g)));
 rig.dispose();rig.dispose();assert.equal(rig.root.parent,null);assert.equal(disposed.size,geometries.size,'All owned geometry released');
 assert.equal(car.root.children.length,before.length);before.forEach((node,i)=>assert.equal(car.root.children[i],node,'Source car nodes retained'));
 return {id:car.modelId,draws,triangles};
}
module.exports={verifyCockpitGeometry};
