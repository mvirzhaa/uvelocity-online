/* Fictional Police Unit 77 accessories. Original artwork and geometry.
   Decals are clipped onto the actual Veyron paint surfaces, including quantized GLTF positions. */
(function(global){'use strict';
  const maps=Object.create(null);
  function mapFor(kind){
    if(maps[kind])return maps[kind];
    const canvas=document.createElement('canvas');canvas.width=kind==='side'?1024:512;canvas.height=kind==='side'?256:kind==='hood'?512:160;
    const c=canvas.getContext('2d'),w=canvas.width,h=canvas.height;c.clearRect(0,0,w,h);
    c.fillStyle='#183b64';c.beginPath();c.moveTo(20,0);c.lineTo(w,0);c.lineTo(w-20,h);c.lineTo(0,h);c.closePath();c.fill();
    c.fillStyle='#dce5eb';c.fillRect(12,8,w-24,5);c.fillRect(12,h-13,w-24,5);
    c.fillStyle='#f5f7f7';c.textBaseline='middle';
    if(kind==='side'){
      c.textAlign='left';c.font='800 116px Arial';c.fillText('POLICE',48,112);c.font='600 28px Arial';c.fillStyle='#bdcfe1';c.fillText('SPECIAL PURSUIT',52,199);
      c.strokeStyle='#7c9ab7';c.lineWidth=2;c.beginPath();c.moveTo(735,42);c.lineTo(735,214);c.stroke();c.fillStyle='#ffffff';c.textAlign='center';c.font='800 135px Arial';c.fillText('77',865,122);c.font='600 22px Arial';c.fillText('UNIT',865,207);
    }else if(kind==='hood'){
      c.textAlign='center';c.font='700 62px Arial';c.fillText('POLICE',w/2,88);c.font='800 245px Arial';c.fillText('77',w/2,290);c.font='600 26px Arial';c.fillStyle='#b7cde0';c.fillText('INTERCEPTOR',w/2,443);
    }else{c.textAlign='center';c.font='700 64px Arial';c.fillText('POLICE 77',w/2,h/2);}
    const map=new THREE.CanvasTexture(canvas);map.encoding=THREE.sRGBEncoding;map.anisotropy=4;maps[kind]=map;return map;
  }
  function decoded(attr,i,k){
    const array=attr.isInterleavedBufferAttribute?attr.data.array:attr.array;
    let x=attr.isInterleavedBufferAttribute?array[i*attr.data.stride+attr.offset+k]:array[i*attr.itemSize+k];
    if(attr.normalized){const scale=array instanceof Int16Array?32767:array instanceof Uint16Array?65535:array instanceof Int8Array?127:array instanceof Uint8Array?255:1;x=Math.max(-1,x/scale);}
    return x;
  }
  function surfaceTriangles(car){
    const tris=[];car.root.updateMatrixWorld(true);const inv=car.bodyTiltGroup.matrixWorld.clone().invert();
    car.bodyTiltGroup.traverse(node=>{
      if(!node.isMesh||!node.geometry?.attributes.position)return;
      const materials=Array.isArray(node.material)?node.material:[node.material];if(!materials.some(m=>/^paint(?:_|$)/.test(m.name||'')))return;
      const matrix=inv.clone().multiply(node.matrixWorld),g=node.geometry,a=g.attributes.position,idx=g.index;
      const vertices=Array.from({length:a.count},(_,i)=>new THREE.Vector3(decoded(a,i,0),decoded(a,i,1),decoded(a,i,2)).applyMatrix4(matrix));
      const count=idx?idx.count:a.count;
      for(let i=0;i<count;i+=3){
        const ids=idx?[idx.getX(i),idx.getX(i+1),idx.getX(i+2)]:[i,i+1,i+2];
        if(ids.some(j=>j>=vertices.length))continue;
        const points=ids.map(j=>vertices[j]);const normal=points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize();
        tris.push({points,normal,doubleSided:materials.some(m=>m.side===THREE.DoubleSide)});
      }
    });return tris;
  }
  function clippedDecal(tris,center,u,v,n,width,height,depth,material,name){
    const positions=[],uv=[],axes=[u,v,n],limits=[width/2,height/2,depth/2];
    const project=p=>{const q=p.clone().sub(center);return new THREE.Vector3(q.dot(u),q.dot(v),q.dot(n));};
    for(const tri of tris){
      const facing=tri.normal.dot(n);if(Math.abs(facing)<.18||(facing<0&&!tri.doubleSided))continue;
      let poly=tri.points.map(project);if(facing<0)poly.reverse();
      if(poly.every(p=>Math.abs(p.z)>depth/2)&&poly.every(p=>Math.sign(p.z)===Math.sign(poly[0].z)))continue;
      for(let axis=0;axis<3&&poly.length;axis++)for(const sign of[-1,1]){
        if(!poly.length)break;const out=[];let prev=poly[poly.length-1],dp=prev.getComponent(axis)*sign-limits[axis];
        for(const curr of poly){const dc=curr.getComponent(axis)*sign-limits[axis];if((dp<=0)!==(dc<=0))out.push(prev.clone().lerp(curr,dp/(dp-dc)));if(dc<=0)out.push(curr);prev=curr;dp=dc;}poly=out;
      }
      for(let j=1;j+1<poly.length;j++)for(const q of[poly[0],poly[j],poly[j+1]]){
        const p=center.clone().addScaledVector(u,q.x).addScaledVector(v,q.y).addScaledVector(n,q.z+.004);
        positions.push(p.x,p.y,p.z);uv.push(q.x/width+.5,q.y/height+.5);
      }
    }
    if(!positions.length)return null;
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();
    const mesh=new THREE.Mesh(g,material);mesh.name=name;mesh.renderOrder=3;mesh.receiveShadow=true;return mesh;
  }
  function decorate(car){
    if(!car||car.modelId!=='veyron77'||car.police)return car;
    const group=new THREE.Group();group.name='Police Unit 77';group.userData.unit=77;
    const mats=car.ownMaterials,geos=car.ownGeometries;
    function material(args){const m=new THREE.MeshStandardMaterial(args);mats.push(m);return m;}
    const steel=material({color:0x1a2530,roughness:.33,metalness:.7}),rubber=material({color:0x12191f,roughness:.8}),white=material({color:0xd5e3ec,roughness:.3,metalness:.5});
    const redMat=material({color:0xa31927,emissive:0xff183d,emissiveIntensity:3.4,roughness:.22,metalness:.1,toneMapped:false});
    const blueMat=material({color:0x1053a8,emissive:0x1481ff,emissiveIntensity:.08,roughness:.22,metalness:.1,toneMapped:false});
    function box(parent,name,mat,x,y,z,w,h,d){const g=new THREE.BoxGeometry(w,h,d);geos.push(g);const mesh=new THREE.Mesh(g,mat);mesh.name=name;mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
    const lightbar=new THREE.Group();lightbar.name='Police Red Blue Lightbar';lightbar.position.set(0,1.31,-.15);group.add(lightbar);
    box(lightbar,'Lightbar Housing',steel,0,0,0,1.2,.055,.27);
    for(const side of[-1,1]){box(lightbar,'Roof Mount',rubber,side*.40,-.066,0,.12,.09,.21);box(lightbar,'Lightbar End Cap',steel,side*.58,.045,0,.04,.12,.27);}
    box(lightbar,'Centre Separator',white,0,.047,0,.08,.08,.25);
    for(let i=0;i<5;i++)for(const side of[-1,1]){const mat=side<0?redMat:blueMat;box(lightbar,'Strobe LED '+(side<0?'Red ':'Blue ')+i,mat,side*(.115+i*.092),.057,0,.076,.105,.245);}
    const redLight=new THREE.PointLight(0xff2346,0,5.5,2),blueLight=new THREE.PointLight(0x207bff,0,5.5,2);redLight.position.set(-.40,1.48,-.15);blueLight.position.set(.40,1.48,-.15);redLight.castShadow=blueLight.castShadow=false;group.add(redLight,blueLight);
    for(const side of[-1,1])box(group,'Front Pursuit Strobe',side<0?redMat:blueMat,side*.62,.36,2.04,.16,.052,.046);
    const tris=surfaceTriangles(car),decals=[];
    const sideMat=material({map:mapFor('side'),transparent:true,alphaTest:.1,roughness:.38,metalness:.08,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-2});
    const hoodMat=material({map:mapFor('hood'),transparent:true,alphaTest:.1,roughness:.38,metalness:.08,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-2});
    const rearMat=material({map:mapFor('rear'),transparent:true,alphaTest:.1,roughness:.45,metalness:.05,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-2});
    for(const side of[-1,1]){
      const decal=clippedDecal(tris,new THREE.Vector3(side*.92,.60,.10),new THREE.Vector3(0,0,-side),new THREE.Vector3(0,1,0),new THREE.Vector3(side,0,0),1.40,.34,.55,sideMat,'Police 77 Door Decal '+side);
      if(decal){group.add(decal);geos.push(decal.geometry);decals.push(decal);}
    }
    const hood=clippedDecal(tris,new THREE.Vector3(0,.87,1.63),new THREE.Vector3(1,0,0),new THREE.Vector3(0,0,-1),new THREE.Vector3(0,1,0),.66,.44,.55,hoodMat,'Police 77 Bonnet Decal');
    if(hood){group.add(hood);geos.push(hood.geometry);decals.push(hood);}
    const rear=clippedDecal(tris,new THREE.Vector3(0,.70,-2.15),new THREE.Vector3(-1,0,0),new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,-1),.65,.20,.35,rearMat,'Police 77 Rear Decal');
    if(rear){rear.geometry.computeBoundingBox();const size=rear.geometry.boundingBox.getSize(new THREE.Vector3());if(size.y>=.08){group.add(rear);geos.push(rear.geometry);decals.push(rear);}else rear.geometry.dispose();}
    car.bodyTiltGroup.add(group);car.police={unit:77,group,lightbar,redMat,blueMat,redLight,blueLight,decals};car.root.userData.policeUnit=77;
    updateEffects(car,0);return car;
  }
  function updateEffects(car,time){
    const p=car?.police;if(!p)return;
    const phase=((Number(time)||0)%1+1)%1,red=phase<.12||(phase>=.22&&phase<.34),blue=(phase>=.50&&phase<.62)||(phase>=.72&&phase<.84);
    p.redMat.emissiveIntensity=red?3.5:.055;p.blueMat.emissiveIntensity=blue?3.5:.055;p.redLight.intensity=red?.65:0;p.blueLight.intensity=blue?.65:0;
  }
  global.NVPolice={decorate,updateEffects};
})(window);
