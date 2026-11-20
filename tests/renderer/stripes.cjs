/* Regression checks for generated vinyl, without a GPU or a browser renderer. */
const assert=require('node:assert/strict');
function verifyStripeSurface(THREE,car,NVStripes){
 const snapshots=[];
 car.bodyTiltGroup.traverse(n=>{if(n.isMesh)snapshots.push({node:n,geometry:n.geometry,material:n.material});});
 const summaries=[];
 for(const stripeId of ['twin-racing','offset','side-sweep','circuit','heritage']){
  NVStripes.apply(car,{stripeId,stripeColor:'#f4cb53',finish:'gloss'});
  const info=NVStripes.inspect(car,true);
  assert.equal(info.stripeId,stripeId);assert.equal(info.color,'#f4cb53');assert.ok(info.compatible,car.modelId+' '+stripeId+' has no paint surface');assert.equal(info.drawCalls,1);
  assert.ok(info.paintMaterialNames.length>0);assert.ok(info.paintMaterialNames.every(n=>/^paint(?:_|$)/.test(n)),'Only body-paint materials may receive stripes');
  const g=info.geometry,p=g.attributes.position,n=g.attributes.normal,source=g.userData.nvStripeSourceTriangles,s=info.surface.positions;
  assert.equal(source.length,p.count/3);assert.ok(p.count>0);assert.ok(info.triangles<70000,'Vinyl triangle budget');
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),v=new THREE.Vector3(),closest=new THREE.Vector3(),triangle=new THREE.Triangle();
  // Every generated vertex must be only 1.5 mm off one of the actual source
  // triangles; this catches free-floating decals and incorrect quantized values.
  for(let i=0;i<p.count;i++){
   const index=source[Math.floor(i/3)]*9;assert.ok(index>=0&&index+8<s.length);
   a.fromArray(s,index);b.fromArray(s,index+3);c.fromArray(s,index+6);triangle.set(a,b,c);
   v.fromBufferAttribute(p,i);assert.ok(Number.isFinite(v.x+v.y+v.z));triangle.closestPointToPoint(v,closest);
   assert.ok(v.distanceTo(closest)<=info.surfaceOffset+.00002,car.modelId+' '+stripeId+' floated away from the body');
   const nx=n.getX(i),ny=n.getY(i),nz=n.getZ(i);assert.ok(Math.abs(nx*nx+ny*ny+nz*nz-1)<.0001,'Invalid decal normal');
  }
  const oldGeometry=g;NVStripes.apply(car,{stripeId,stripeColor:'#235eac',finish:'matte'});assert.equal(NVStripes.inspect(car,true).geometry,oldGeometry,'Changing vinyl color must reuse geometry');
  for(const before of snapshots){assert.equal(before.node.geometry,before.geometry);assert.equal(before.node.material,before.material);}
  summaries.push({id:stripeId,triangles:info.triangles});
 }
 NVStripes.apply(car,{stripeId:'none'});assert.equal(NVStripes.inspect(car).triangles,0);assert.equal(car.bodyTiltGroup.children.filter(n=>n.userData.nvStripe).length,0);
 return summaries;
}
function verifyMaterialGroups(THREE,NVStripes){
 const root=new THREE.Group(),body=new THREE.Group();root.add(body);
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,1,-1,-1,1,1,0,1,1,0,1,-1,1,1,-1,1,1,1],3));geometry.setIndex([0,1,2,0,2,3,3,2,5,3,5,4]);geometry.computeVertexNormals();geometry.addGroup(0,6,0);geometry.addGroup(6,6,1);
 const paint=new THREE.MeshStandardMaterial({name:'paint_test'}),glass=new THREE.MeshStandardMaterial({name:'glass'}),mesh=new THREE.Mesh(geometry,[paint,glass]);body.add(mesh);
 const car={root,bodyTiltGroup:body,modelId:'qa-material-groups'};
 NVStripes.apply(car,{stripeId:'heritage',stripeColor:'#ffffff'});const info=NVStripes.inspect(car,true);
 assert.equal(info.paintTriangles,2,'A mixed-material mesh must not include glass triangles');assert.equal(info.paintMaterialNames.length,1);
 for(let i=0;i<info.geometry.attributes.position.count;i++)assert.ok(info.geometry.attributes.position.getX(i)<.00001,'Vinyl reached the glass group');
 NVStripes.dispose(car);geometry.dispose();paint.dispose();glass.dispose();
}
module.exports={verifyStripeSurface,verifyMaterialGroups};
