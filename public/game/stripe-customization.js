/* UVelocity paint-surface vinyl. Original patterns; no manufacturer artwork.
 * Stripes clip the real body triangles and retain their interpolated normals.
 * Source geometry/materials, windows, lamps, tyres and carbon remain untouched.
 * Cosmetic installation/ownership is authorized by the server, never this module.
 */
(function (global) {
  'use strict';
  const THREE=global.THREE;
  const catalog=Object.freeze([
    {id:'none',name:'Tanpa striping',description:'Pertahankan cat dan livery bawaan'},
    {id:'twin-racing',name:'Twin Racing',description:'Dua garis sejajar di kap, atap, dan belakang'},
    {id:'offset',name:'Offset',description:'Garis asimetris dengan aksen tipis'},
    {id:'side-sweep',name:'Side Sweep',description:'Sapuan miring mengikuti kedua panel samping'},
    {id:'circuit',name:'Circuit',description:'Garis diagonal dan aksen kuarter bergaya sirkuit'},
    {id:'heritage',name:'Heritage',description:'Pita tengah, pinstripe, dan dua garis rocker'}
  ]);
  const instances=new WeakMap(),live=new Set(),surfaces=new Map(),geometryCache=new Map();
  const validId=id=>catalog.some(item=>item.id===id)?id:'none';
  const validColor=color=>/^#[0-9a-f]{6}$/i.test(color||'')?color.toLowerCase():'#ffffff';
  const OFFSET=.0015;
  let quality='medium';
  const cutoff=()=>quality==='low'?58:quality==='high'?160:110;
  function decoded(a,i,k) {
    const array=a.isInterleavedBufferAttribute?a.data.array:a.array;
    let value=a.isInterleavedBufferAttribute?array[i*a.data.stride+a.offset+k]:array[i*a.itemSize+k];
    if(a.normalized){const t=array.constructor.name,scale=t==='Int16Array'?32767:t==='Uint16Array'?65535:t==='Int8Array'?127:t==='Uint8Array'?255:1;value=Math.max(-1,value/scale);}
    return value;
  }
  function isPaint(material) {return !!material&&/^paint(?:_|$)/i.test(material.name||'');}
  function collect(car) {
    car.root.updateMatrixWorld(true);
    const nodes=[];
    car.bodyTiltGroup.traverse(node=>{
      if(!node.isMesh||!node.geometry?.attributes.position||node.userData.nvStripe)return;
      const mats=Array.isArray(node.material)?node.material:[node.material];
      if(mats.some(isPaint))nodes.push(node);
    });
    const key=car.modelId+'|'+nodes.map(n=>n.geometry.uuid).join(',');
    if(surfaces.has(key))return surfaces.get(key);
    const inv=car.bodyTiltGroup.matrixWorld.clone().invert(),positions=[],normals=[],doubleSided=[],meshNames=[],paintNames=new Set(),box=new THREE.Box3();
    const p=[new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3()],ns=[new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3()],face=new THREE.Vector3(),edge=new THREE.Vector3();
    for(const node of nodes) {
      const g=node.geometry,a=g.attributes.position,na=g.attributes.normal,index=g.index,mats=Array.isArray(node.material)?node.material:[node.material];
      const matrix=inv.clone().multiply(node.matrixWorld),normalMatrix=new THREE.Matrix3().getNormalMatrix(matrix);
      const groups=g.groups.length?g.groups:[{start:0,count:index?index.count:a.count,materialIndex:0}];
      const start=Math.max(0,g.drawRange.start||0),end=Math.min(index?index.count:a.count,start+g.drawRange.count);
      let used=false;
      for(const group of groups) {
        const material=mats[group.materialIndex||0];if(!isPaint(material))continue;
        paintNames.add(material.name);const last=Math.min(end,group.start+group.count);
        for(let j=Math.max(start,group.start);j+2<last;j+=3) {
          for(let k=0;k<3;k++) {
            const v=index?index.getX(j+k):j+k;
            p[k].set(decoded(a,v,0),decoded(a,v,1),decoded(a,v,2)).applyMatrix4(matrix);
            if(na)ns[k].set(decoded(na,v,0),decoded(na,v,1),decoded(na,v,2)).applyMatrix3(normalMatrix).normalize();
          }
          face.copy(p[1]).sub(p[0]).cross(edge.copy(p[2]).sub(p[0]));
          if(face.lengthSq()<1e-15||p.some(v=>!Number.isFinite(v.x+v.y+v.z)))continue;
          face.normalize();
          for(let k=0;k<3;k++) {
            if(!na||ns[k].lengthSq()<.1)ns[k].copy(face);
            positions.push(p[k].x,p[k].y,p[k].z);normals.push(ns[k].x,ns[k].y,ns[k].z);box.expandByPoint(p[k]);
          }
          doubleSided.push(material.side===THREE.DoubleSide?1:0);used=true;
        }
      }
      if(used)meshNames.push(node.name||node.geometry.name||'body paint');
    }
    const surface={key,positions:new Float32Array(positions),normals:new Float32Array(normals),doubleSided:new Uint8Array(doubleSided),box,meshNames,paintNames:[...paintNames],triangles:positions.length/9};
    surfaces.set(key,surface);return surface;
  }
  function plans(surface,id) {
    const b=surface.box,size=b.getSize(new THREE.Vector3()),cx=(b.min.x+b.max.x)/2,cz=(b.min.z+b.max.z)/2;
    const w=size.x,L=size.z,H=size.y,ground=Math.max(.22,b.min.y+H*.11),bodyHeight=Math.min(1.12,b.min.y+H*.67),items=[];
    // Coordinates are normalized to the actual paint shell, not a generic car box.
    const topPoly=poly=>items.push({kind:'top',poly:poly.map(([x,z])=>[cx+x*w,cz+z*L]),min:ground,max:b.max.y+.02});
    const topBand=(x,width)=>topPoly([[x-width/2,-.51],[x+width/2,-.51],[x+width/2,.51],[x-width/2,.51]]);
    const ends=(x,width)=>{for(const sign of[-1,1])items.push({kind:'end',sign,poly:[[cx+(x-width/2)*w,ground],[cx+(x+width/2)*w,ground],[cx+(x+width/2)*w,Math.max(bodyHeight,b.min.y+H*.62)],[cx+(x-width/2)*w,Math.max(bodyHeight,b.min.y+H*.62)]],min:sign<0?b.min.z-.01:cz+L*.30,max:sign<0?cz-L*.30:b.max.z+.01});};
    const sidePoly=poly=>{for(const sign of[-1,1])items.push({kind:'side',sign,poly:poly.map(([z,y])=>[cz+z*L,ground+y*(bodyHeight-ground)]),min:cx+sign*w*.12,max:cx+sign*w*.55});};
    if(id==='twin-racing'){for(const x of[-.115,.115]){topBand(x,.145);ends(x,.145);}}
    if(id==='offset'){topBand(-.225,.185);topBand(-.091,.026);ends(-.225,.185);ends(-.091,.026);}
    if(id==='side-sweep'){
      sidePoly([[-.42,.63],[.40,.10],[.37,.37],[-.42,.91]]);
      sidePoly([[-.42,.50],[.37,-.015],[.365,.035],[-.42,.55]]);
    }
    if(id==='circuit'){
      topPoly([[-.34,-.50],[-.20,-.50],[.28,.51],[.14,.51]]);
      topPoly([[-.39,-.50],[-.365,-.50],[.115,.51],[.09,.51]]);
      sidePoly([[-.41,.04],[.41,.04],[.41,.14],[-.41,.14]]);
      for(let i=0;i<3;i++){const z=-.31+i*.085;sidePoly([[z,.28],[z+.043,.28],[z+.096,.83],[z+.053,.83]]);}
    }
    if(id==='heritage'){
      topBand(0,.285);topBand(-.178,.021);topBand(.178,.021);ends(0,.285);
      sidePoly([[-.43,.06],[.43,.06],[.43,.18],[-.43,.18]]);
      sidePoly([[-.43,.24],[.43,.24],[.43,.29],[-.43,.29]]);
    }
    // Clip polygons consistently counter-clockwise in each projection plane.
    for(const item of items){let area=0;for(let i=0;i<item.poly.length;i++){const p=item.poly[i],q=item.poly[(i+1)%item.poly.length];area+=p[0]*q[1]-q[0]*p[1];}if(area<0)item.poly.reverse();}
    return items;
  }
  function interpolate(a,b,t) {return {p:a.p.clone().lerp(b.p,t),n:a.n.clone().lerp(b.n,t),u:a.u+(b.u-a.u)*t,v:a.v+(b.v-a.v)*t,depth:a.depth+(b.depth-a.depth)*t};}
  function clip(poly,distance) {
    if(!poly.length)return poly;
    const output=[];let previous=poly[poly.length-1],dp=distance(previous);
    for(const current of poly){const dc=distance(current);if((dc>=0)!==(dp>=0))output.push(interpolate(previous,current,dp/(dp-dc)));if(dc>=0)output.push(current);previous=current;dp=dc;}
    return output;
  }
  function buildGeometry(surface,id) {
    const key=surface.key+'|'+id;
    let entry=geometryCache.get(key);if(entry){entry.refs++;return entry;}
    const positions=[],normals=[],sourceIndices=[],polygons=plans(surface,id),p=surface.positions,n=surface.normals;
    const face=new THREE.Vector3(),edge=new THREE.Vector3();
    for(let ti=0;ti<surface.triangles;ti++) {
      const base=ti*9,points=[0,1,2].map(k=>new THREE.Vector3(p[base+k*3],p[base+k*3+1],p[base+k*3+2]));
      face.copy(points[1]).sub(points[0]).cross(edge.copy(points[2]).sub(points[0])).normalize();
      const avg=new THREE.Vector3(n[base]+n[base+3]+n[base+6],n[base+1]+n[base+4]+n[base+7],n[base+2]+n[base+5]+n[base+8]).normalize();
      if(face.dot(avg)<0)face.negate();
      for(const plan of polygons) {
        const direction=plan.kind==='top'?face.y:plan.kind==='side'?face.x*plan.sign:face.z*plan.sign;
        const facing=surface.doubleSided[ti]?Math.abs(direction):direction;
        if(facing<(plan.kind==='top'?.42:.48))continue;
        if(plan.kind==='end'&&Math.abs(face.y)>=.42)continue;
        if(plan.kind==='side'&&Math.abs(face.y)>.72)continue;
        const flip=direction<0?-1:1;
        const uv=point=>plan.kind==='top'?[point.x,point.z,point.y]:plan.kind==='side'?[point.z,point.y,point.x]:[point.x,point.y,point.z];
        let poly=points.map((point,k)=>{const [u,v,depth]=uv(point);return {p:point,n:new THREE.Vector3(n[base+k*3],n[base+k*3+1],n[base+k*3+2]).multiplyScalar(flip),u,v,depth};});
        const lo=Math.min(plan.min,plan.max),hi=Math.max(plan.min,plan.max);
        if(poly.every(v=>v.depth<lo)||poly.every(v=>v.depth>hi))continue;
        poly=clip(poly,v=>v.depth-lo);poly=clip(poly,v=>hi-v.depth);
        for(let i=0;i<plan.poly.length&&poly.length;i++){
          const a=plan.poly[i],b=plan.poly[(i+1)%plan.poly.length],du=b[0]-a[0],dv=b[1]-a[1];
          poly=clip(poly,v=>du*(v.v-a[1])-dv*(v.u-a[0]));
        }
        if(poly.length<3)continue;
        // Keep winding consistent with the normals on mirrored/double-sided sources.
        const cross=poly[1].p.clone().sub(poly[0].p).cross(poly[2].p.clone().sub(poly[0].p));
        if(cross.dot(poly[0].n)<0)poly.reverse();
        for(let j=1;j+1<poly.length;j++){
          const triangle=[poly[0],poly[j],poly[j+1]];
          if(triangle[1].p.clone().sub(triangle[0].p).cross(triangle[2].p.clone().sub(triangle[0].p)).lengthSq()<1e-16)continue;
          for(const v of triangle){v.n.normalize();const point=v.p.clone().addScaledVector(v.n,OFFSET);positions.push(point.x,point.y,point.z);normals.push(v.n.x,v.n.y,v.n.z);}
          sourceIndices.push(ti);
        }
      }
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.computeBoundingBox();geometry.computeBoundingSphere();
    geometry.userData.nvStripeSourceTriangles=new Uint32Array(sourceIndices);
    entry={key,geometry,refs:1,surface,patches:polygons.length,triangles:positions.length/9};geometryCache.set(key,entry);return entry;
  }
  function remove(car) {
    const state=instances.get(car);if(!state)return;
    if(state.lod.parent)state.lod.parent.remove(state.lod);
    state.material.dispose();if(--state.entry.refs===0){state.entry.geometry.dispose();geometryCache.delete(state.entry.key);}
    live.delete(state);instances.delete(car);delete car.root.userData.striping;
  }
  function appearance(material,color,finish) {
    material.color.set(color).convertSRGBToLinear();material.roughness=finish==='matte'?.48:.25;material.metalness=.06;material.clearcoat=finish==='matte'?.12:.85;material.clearcoatRoughness=finish==='matte'?.42:.12;
  }
  function apply(car,options={}) {
    if(!car?.bodyTiltGroup)return {stripeId:'none',compatible:false};
    const id=validId(options.stripeId),color=validColor(options.stripeColor);let state=instances.get(car);
    if(state?.id===id){state.color=color;appearance(state.material,color,options.finish);car.root.userData.striping={id,color};return inspect(car);}
    remove(car);if(id==='none')return {stripeId:'none',color,compatible:true,triangles:0,drawCalls:0};
    const surface=collect(car);if(!surface.triangles)return {stripeId:id,color,compatible:false,reason:'Tidak ditemukan permukaan cat bodi'};
    const entry=buildGeometry(surface,id);
    const material=new THREE.MeshPhysicalMaterial({name:'UVelocity vinyl',roughness:.25,metalness:.06,clearcoat:.85,clearcoatRoughness:.12,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,depthWrite:false,side:THREE.FrontSide});appearance(material,color,options.finish);
    const mesh=new THREE.Mesh(entry.geometry,material);mesh.name='UVelocity '+id+' paint vinyl';mesh.userData.nvStripe=true;mesh.receiveShadow=true;mesh.castShadow=false;mesh.renderOrder=2;
    const lod=new THREE.LOD();lod.name='Body-conforming striping';lod.userData.nvStripe=true;lod.addLevel(mesh,0);lod.addLevel(new THREE.Object3D(),cutoff());car.bodyTiltGroup.add(lod);
    state={id,color,entry,material,mesh,lod};instances.set(car,state);live.add(state);car.root.userData.striping={id,color};return inspect(car);
  }
  function inspect(car,geometry=false) {
    const state=instances.get(car);if(!state)return {stripeId:'none',color:'#ffffff',compatible:true,triangles:0,drawCalls:0};
    const {entry}=state;
    return {stripeId:state.id,color:state.color,compatible:entry.triangles>0,triangles:entry.triangles,drawCalls:entry.triangles?1:0,paintTriangles:entry.surface.triangles,paintMeshes:entry.surface.meshNames.length,paintMaterialNames:entry.surface.paintNames.slice(),patches:entry.patches,surfaceOffset:OFFSET,...(geometry?{surface:entry.surface,geometry:entry.geometry}:{} )};
  }
  function setQuality(value) {if(!['low','medium','high'].includes(value))return;quality=value;for(const state of live)state.lod.levels[1].distance=cutoff();}
  global.NVStripes=Object.freeze({catalog,validId,apply,dispose:remove,inspect,setQuality});
})(window);
