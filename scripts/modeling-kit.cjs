'use strict';
/** Original UVelocity mesh-authoring helpers. No third-party vehicle geometry.
 * +Y up, +Z forward, X wheel-spin axis; dimensions in metres.
 * Uses the application's bundled MIT-licensed Three.js r128 for geometry only.
 */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const sandbox={console};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/game/vendor/three.min.js'),'utf8'),sandbox);
const THREE=sandbox.THREE,T=THREE,PI=Math.PI;
function createModel(id,metadata={}){const root=new T.Group();root.name=id;root.userData={id,provenance:'Original UVelocity reference-based recreation; not a manufacturer mesh or scan.',...metadata};return root;}
function mat(name,color,metalness=0,roughness=.4,extras={}){const m=new T.MeshStandardMaterial({color,metalness,roughness,...extras});m.name=name;return m;}
function materials(color=0xd5d9df){return{
 paint:mat('paint_body',color,.62,.24),aeroPaint:mat('paint_aero',color,.58,.28),carbon:mat('carbon',0x11151b,.22,.46),rubber:mat('tire_rubber',0x101113,.02,.91),
 glass:mat('glass',0x112633,.48,.13),rim:mat('rim_paint',0x373d45,.85,.25),metal:mat('metal',0x87909b,.88,.27),darkMetal:mat('dark_metal',0x242b32,.72,.34),
 front:mat('light_front',0xecf7ff,.12,.16,{emissive:0xe3f5ff,emissiveIntensity:.52}),rear:mat('light_rear',0x7e0610,.15,.18,{emissive:0xe0051d,emissiveIntensity:.4}),
 amber:mat('light_amber',0xff9e14,.1,.2,{emissive:0xf7780e,emissiveIntensity:.3}),red:mat('brake_caliper',0x9b151c,.4,.38),seat:mat('interior_seat',0x15191e,.05,.85)
};}
function mesh(parent,geometry,material,name){const m=new T.Mesh(geometry,material);m.name=name||material.name;m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function box(parent,material,size,position=[0,0,0],rotation=[0,0,0],name){const m=mesh(parent,new T.BoxGeometry(...size),material,name);m.position.set(...position);m.rotation.set(...rotation);return m;}
function sphere(parent,material,size,position=[0,0,0],segments=32,name){const m=mesh(parent,new T.SphereGeometry(1,segments,Math.max(12,segments/2)),material,name);m.scale.set(...size);m.position.set(...position);return m;}
function cylinder(parent,material,radius,height,position=[0,0,0],rotation=[0,0,0],segments=40,name){const m=mesh(parent,new T.CylinderGeometry(radius,radius,height,segments,1),material,name);m.position.set(...position);m.rotation.set(...rotation);return m;}
function tube(parent,material,points,radius=.008,closed=false,segments=64,name){const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)),closed,'centripetal');return mesh(parent,new T.TubeGeometry(curve,segments,radius,7,closed),material,name);}
function surface(parent,material,nu,nv,fn,name,flip=false,clip=null){const p=[],uv=[],index=[];for(let u=0;u<=nu;u++)for(let v=0;v<=nv;v++){p.push(...fn(u/nu,v/nv));uv.push(u/nu,v/nv);}for(let u=0;u<nu;u++)for(let v=0;v<nv;v++){if(clip&&clip((u+.5)/nu,(v+.5)/nv))continue;const a=u*(nv+1)+v,b=a+nv+1;if(flip)index.push(a,a+1,b,b,a+1,b+1);else index.push(a,b,a+1,b,b+1,a+1);}const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(index);g.computeVertexNormals();return mesh(parent,g,material,name);}
function lerp(a,b,t){return a+(b-a)*t;}
function interp(stations,z,key){if(z<=stations[0].z)return stations[0][key];if(z>=stations.at(-1).z)return stations.at(-1)[key];let i=0;while(stations[i+1].z<z)i++;const a=stations[i],b=stations[i+1],q=(z-a.z)/(b.z-a.z),t=q*q*(3-2*q);return lerp(a[key],b[key],t);}
/** stations ascending z: {z,w,c,s,b}; width w=halfwidth, c=center top,
 * s=shoulder top, b=sill floor. wheelArches [{z,y,r,x}] remove side panels.
 * This is an actual open wheel well, not a tyre over an uncut box.
 */
function bodyLoft(parent,material,stations,options={}){
 const before=parent.children.length,n=options.segments||112,m=options.crossSegments||30,z0=stations[0].z,z1=stations.at(-1).z,edgeDrop=options.edgeDrop??.028,sideInset=options.sideInset??.035,nose=options.nose;
 const sample=z=>({w:interp(stations,z,'w'),c:interp(stations,z,'c'),s:interp(stations,z,'s'),b:interp(stations,z,'b')});
 function mappedZ(x,y,z){if(!nose||z<=nose.from)return z;const a=sample(z),q=Math.min(1,Math.abs(x)/a.w),v=Math.max(0,Math.min(1,(y-a.b)/(a.c-a.b))),t=Math.max(0,Math.min(1,(z-nose.from)/(z1-nose.from)));return z-t*t*((nose.round||0)*q**4+(nose.bottomInset||0)*(1-v)**2+(nose.topInset||0)*v**4);}
 const frontZ=(x,y)=>mappedZ(x,y,z1);
 const top=surface(parent,material,n,m,(u,v)=>{const z=lerp(z0,z1,u),a=sample(z),q=v*2-1,t=Math.abs(q),x=q*a.w,y=a.c+(a.s-a.c)*Math.pow(Math.sin(t*PI/2),2)-edgeDrop*Math.pow(t,8);return[x,y,mappedZ(x,y,z)];},'body_sculpted_top');
 for(const side of [-1,1]){const fn=(u,v)=>{const z=lerp(z0,z1,u),a=sample(z);let bottom=a.b;for(const w of options.wheelArches||[]){const dz=z-w.z;if(Math.abs(dz)<w.r)bottom=Math.max(bottom,w.y+Math.sqrt(w.r*w.r-dz*dz));}const shoulder=a.s-edgeDrop;bottom=Math.min(bottom,shoulder+.001);const x=side*(a.w-sideInset*Math.sin(v*PI/2)),y=lerp(shoulder,bottom,v);return[x,y,mappedZ(x,y,z)];};surface(parent,material,n,options.sideOpenings?32:14,fn,'body_side_'+side,side<0,options.sideOpenings?(u,v)=>{const[,y,z]=fn(u,v);return options.sideOpenings.some(h=>Math.abs(z-h.z)<h.rz&&Math.abs(y-h.y)<h.ry);}:null);}
 for(const [z,flip]of [[z0,true],[z1,false]]){
  const a=sample(z),nu=nose&&z===z1?m*3:m,nv=nose&&z===z1?40:14,p=[],uv=[],idx=[];
  const point=(u,v)=>{const q=u*2-1,t=Math.abs(q),topY=a.c+(a.s-a.c)*Math.sin(t*PI/2)**2-edgeDrop*t**8,x=q*(a.w-sideInset*Math.sin((1-v)*PI/2)),y=lerp(a.b,topY,v);return[x,y,mappedZ(x,y,z)];};
  for(let u=0;u<=nu;u++)for(let v=0;v<=nv;v++){p.push(...point(u/nu,v/nv));uv.push(u/nu,v/nv);}
  for(let u=0;u<nu;u++)for(let v=0;v<nv;v++){const [x,y]=point((u+.5)/nu,(v+.5)/nv);const hole=nose&&z===z1&&(nose.openings||[]).some(h=>h.type==='ellipse'?((x-h.x)/h.rx)**2+((y-h.y)/h.ry)**2<1:Math.abs(x-h.x)<h.rx&&Math.abs(y-h.y)<h.ry);if(hole)continue;const i=u*(nv+1)+v,k=i+nv+1;if(flip)idx.push(i,i+1,k,k,i+1,k+1);else idx.push(i,k,i+1,k,k+1,i+1);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();mesh(parent,g,material,'body_end');
 }
 if(options.underbody!==false)box(parent,options.underMaterial||material,[Math.max(...stations.map(s=>s.w))*1.74,.035,(z1-z0)*.83],[0,Math.min(...stations.map(s=>s.b))+.025,(z0+z1)/2],undefined,'flat_undertray');
 // A narrow rolled lip traces each arch; visible dark wheel-well lining has depth.
 for(const w of options.wheelArches||[])for(const side of [-1,1]){const pts=[];for(let k=0;k<=32;k++){const theta=Math.PI*k/32,z=w.z+w.r*Math.cos(theta),a=sample(Math.min(z1,Math.max(z0,z)));pts.push([side*(w.x||a.w),w.y+w.r*Math.sin(theta),z]);}tube(parent,material,pts,.016,false,48,'rolled_wheel_arch');if(options.wellMaterial)surface(parent,options.wellMaterial,40,4,(u,v)=>{const theta=Math.PI*u,z=w.z+w.r*Math.cos(theta),a=sample(Math.min(z1,Math.max(z0,z)));return[side*((w.x||a.w)-v*.20),w.y+(w.r-.018)*Math.sin(theta),z];},'wheel_well',side>0);}
 // Smooth the genuine shared shell boundaries without rounding aperture edges.
 if(options.smoothSeams){const groups=new Map(),parts=parent.children.slice(before).filter(n=>n.isMesh&&/^body_/.test(n.name));for(const part of parts){const p=part.geometry.attributes.position,n=part.geometry.attributes.normal;for(let i=0;i<p.count;i++){const key=[p.getX(i),p.getY(i),p.getZ(i)].map(x=>Math.round(x*1e5)).join(',');if(!groups.has(key))groups.set(key,[]);groups.get(key).push([n,i]);}}for(const items of groups.values()){if(items.length<2)continue;const norm=new T.Vector3();for(const[a,i]of items)norm.add(new T.Vector3(a.getX(i),a.getY(i),a.getZ(i)));norm.normalize();for(const[a,i]of items)a.setXYZ(i,norm.x,norm.y,norm.z);}}
 return{top,sample,frontZ};
}
/** Rounded trapezoid/polygon extruded along +Z, local x/y points. */
function shape(parent,material,points,{depth=.015,position=[0,0,0],rotation=[0,0,0],bevel=.004,name='panel'}={}){const s=new T.Shape();s.moveTo(...points[0]);for(let i=1;i<points.length;i++)s.lineTo(...points[i]);s.closePath();const g=new T.ExtrudeGeometry(s,{depth,steps:1,bevelEnabled:bevel>0,bevelSize:bevel,bevelThickness:bevel,bevelSegments:2,curveSegments:16});const m=mesh(parent,g,material,name);m.position.set(...position);m.rotation.set(...rotation);return m;}
function oval(parent,material,width,height,position,depth=.012,name='oval'){const pts=[];for(let i=0;i<48;i++){const a=i*Math.PI*2/48;pts.push([width*.5*Math.cos(a),height*.5*Math.sin(a)]);}return shape(parent,material,pts,{position,depth,bevel:.002,name});}
function roundedRectPoints(w,h,r=.04){const pts=[];for(const [cx,cy,a0]of [[w/2-r,h/2-r,0],[-w/2+r,h/2-r,Math.PI/2],[-w/2+r,-h/2+r,Math.PI],[w/2-r,-h/2+r,Math.PI*1.5]])for(let i=0;i<=8;i++){const a=a0+i*Math.PI/16;pts.push([cx+r*Math.cos(a),cy+r*Math.sin(a)]);}return pts;}
function roundedPanel(parent,material,w,h,position,options={}){return shape(parent,material,roundedRectPoints(w,h,options.radius||Math.min(w,h)*.16),{position,...options});}
function cabin(parent,mats,{front=.65,rear=-1.5,width=.68,base=.88,roof=1.3,roofFront=-.03,roofRear=-.85,windowBottom=.91,pillars=true,seatCount=2}){
 const stations=[{z:rear,w:width*1.02,y:base+.01},{z:roofRear,w:width*.87,y:roof},{z:roofFront,w:width*.87,y:roof},{z:front,w:width*.99,y:base+.01}];
 surface(parent,mats.glass,64,24,(u,v)=>{const z=lerp(rear,front,u),w=interp(stations,z,'w'),y=interp(stations,z,'y'),q=v*2-1;return[q*w,y-.045*Math.pow(Math.abs(q),2),z];},'panoramic_cabin_glass');
 for(const side of [-1,1])surface(parent,mats.glass,64,10,(u,v)=>{const z=lerp(rear,front,u),w=interp(stations,z,'w'),y=interp(stations,z,'y');return[side*lerp(w,width*1.065,v),lerp(y-.045,windowBottom,v),z];},'side_window_'+side,side<0);
 // Body-colored roof panel leaves front and rear glass visible.
 surface(parent,mats.paint,28,24,(u,v)=>{const z=lerp(roofRear,roofFront,u),q=v*2-1;return[q*width*.882,roof+.008-.047*q*q,z];},'paint_roof');
 if(pillars){for(const side of [-1,1]){
  tube(parent,mats.paint,[[side*width*1.065,base,front],[side*width*.91,roof-.055,roofFront+.035],[side*width*.875,roof-.04,roofRear],[side*width*1.065,base,rear]],.024,false,90,'roof_rail');
  tube(parent,mats.paint,[[side*width*.89,roof-.04,roofRear+.07],[side*width*1.065,windowBottom,roofRear-.07]],.032,false,16,'rear_pillar');
  tube(parent,mats.carbon,[[side*width*.88,roof-.04,(roofFront+roofRear)*.5],[side*width*1.065,windowBottom,(roofFront+roofRear)*.5]],.014,false,12,'window_divider');
  tube(parent,mats.carbon,[[side*width*1.065,windowBottom,rear],[side*width*1.065,windowBottom,front]],.011,false,48,'window_belt');
 }}
 // Seat and roll cage are intentionally real geometry behind the dark glass.
 for(const side of seatCount===1?[0]:[-1,1]){const s=box(parent,mats.seat,[.33,.46,.27],[side*.30,base+.03,(roofFront+roofRear)/2-.08],[.14,0,0],'bucket_seat');sphere(parent,mats.seat,[.17,.14,.10],[side*.30,Math.min(base+.28,roof-.19),(roofFront+roofRear)/2-.16],16,'head_rest');}
 tube(parent,mats.metal,[[-width*.85,base,rear+.35],[-width*.75,roof-.10,roofRear+.10],[width*.75,roof-.10,roofRear+.10],[width*.85,base,rear+.35]],.017,false,40,'roll_cage');
 box(parent,mats.carbon,[width*1.7,.05,.28],[0,base-.060,front-.20],undefined,'dashboard');
 return{front,rear,roof,base,width};
}
function wing(parent,mats,{width=1.8,z=-2.0,y=1.2,chord=.30,postHeight=.4,postSpacing=.95,paint=false,endplateHeight=.20}){
 const m=paint?mats.aeroPaint:mats.carbon;
 surface(parent,m,36,14,(u,v)=>{const x=lerp(-width/2,width/2,u),zz=z+lerp(-chord/2,chord/2,v);return[x,y+.035*Math.sin(v*Math.PI)-.04*(v-.5),zz];},'wing_airfoil',true);
 surface(parent,m,36,14,(u,v)=>[lerp(-width/2,width/2,u),y-.025+.018*Math.sin(v*Math.PI),z+lerp(-chord/2,chord/2,v)],'wing_underside');
 for(const side of [-1,1]){box(parent,m,[.025,endplateHeight,chord+.06],[side*width/2,y+.02,z],undefined,'wing_endplate');box(parent,mats.darkMetal,[.035,postHeight,.08],[side*postSpacing/2,y-postHeight/2,z+.01],[.08,0,0],'wing_pylon');}
}
function wheelRig(parent,mats,{wheelbase=2.7,track=1.65,radius=.34,width=.28,zOffset=0,spokes=10,rimRadius=radius*.70}={}){
 const wheels={},centers={};
 for(const label of ['FL','FR','RL','RR']){const side=label[1]==='L'?1:-1,z=zOffset+(label[0]==='F'?wheelbase/2:-wheelbase/2),x=side*track/2;
  const anchor=new T.Group();anchor.name=label[0]==='F'?'steer_'+label:'axle_'+label;anchor.position.set(x,radius,z);parent.add(anchor);
  const wheel=new T.Group();wheel.name='wheel_'+label;anchor.add(wheel);wheels[label]=wheel;centers[label]=[x,radius,z];
  const profile=[[rimRadius*.88,-width/2],[radius*.82,-width/2],[radius*.96,-width*.43],[radius,-width*.24],[radius,width*.24],[radius*.96,width*.43],[radius*.82,width/2],[rimRadius*.88,width/2],[rimRadius*.88,-width/2]].map(p=>new T.Vector2(...p));
  const tire=new T.LatheGeometry(profile,64);tire.rotateZ(Math.PI/2);mesh(wheel,tire,mats.rubber,'tire');
  for(const ax of [-width*.46,width*.46]){const tor=new T.TorusGeometry(rimRadius,.014,8,64);tor.rotateY(Math.PI/2);const edge=mesh(wheel,tor,mats.rim,'rim_lip');edge.position.x=ax;
   cylinder(wheel,mats.darkMetal,rimRadius*.87,.017,[ax*.78,0,0],[0,0,Math.PI/2],48,'brake_disc');
   cylinder(wheel,mats.rim,rimRadius*.22,.034,[ax,0,0],[0,0,Math.PI/2],20,'wheel_hub');
   for(let i=0;i<spokes;i++){const a=i*Math.PI*2/spokes;const spoke=box(wheel,mats.rim,[.029,rimRadius*.76,.028],[ax,rimRadius*.50*Math.cos(a),rimRadius*.50*Math.sin(a)],[a,0,0],'rim_spoke');}
   for(let i=0;i<5;i++){const a=i*Math.PI*2/5;cylinder(wheel,mats.metal,.011,.041,[ax*1.04,rimRadius*.12*Math.cos(a),rimRadius*.12*Math.sin(a)],[0,0,Math.PI/2],8,'wheel_bolt');}
  }
  box(anchor,mats.red,[width*.36,.13,.07],[side*width*.18,rimRadius*.35,rimRadius*.75],undefined,'brake_caliper');
 }
 return{wheels,centers,radius,width,archRadius:radius+.045};
}
function mergeGeometry(geometries){const positions=[],normals=[],uvs=[],indices=[];let base=0;for(const g of geometries){const p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv;for(let i=0;i<p.count;i++){positions.push(p.getX(i),p.getY(i),p.getZ(i));normals.push(n?n.getX(i):0,n?n.getY(i):1,n?n.getZ(i):0);uvs.push(uv?uv.getX(i):0,uv?uv.getY(i):0);}if(g.index)for(let i=0;i<g.index.count;i++)indices.push(base+g.index.getX(i));else for(let i=0;i<p.count;i++)indices.push(base+i);base+=p.count;}const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('normal',new T.Float32BufferAttribute(normals,3));g.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));g.setIndex(indices);return g;}
/** Merge static geometry by material, keeping only the meaningful wheel/steer hierarchy. */
function optimize(root){root.updateMatrixWorld(true);const out=createModel(root.name,root.userData),frames=new Map([[root,{out,matrix:root.matrixWorld}]]),buckets=new Map();
 root.traverse(n=>{if(n!==root&&n.isGroup&&/^(wheel_|steer_|axle_)/.test(n.name)){let a=n.parent;while(a!==root&&!frames.has(a))a=a.parent;const dst=new T.Group();dst.name=n.name;const rel=frames.get(a).matrix.clone().invert().multiply(n.matrixWorld);rel.decompose(dst.position,dst.quaternion,dst.scale);frames.get(a).out.add(dst);frames.set(n,{out:dst,matrix:n.matrixWorld.clone()});}});
 root.traverse(n=>{if(!n.isMesh)return;let a=n.parent;while(a!==root&&!frames.has(a))a=a.parent;const f=frames.get(a),g=n.geometry.clone();g.applyMatrix4(f.matrix.clone().invert().multiply(n.matrixWorld));const key=a.uuid+'/'+n.material.uuid;if(!buckets.has(key))buckets.set(key,{parent:f.out,material:n.material,geos:[]});buckets.get(key).geos.push(g);});
 for(const b of buckets.values())mesh(b.parent,mergeGeometry(b.geos),b.material,b.material.name);return out;
}
function exportGLB(root,file,metadata={}){
 const optimized=optimize(root),j={asset:{version:'2.0',generator:'UVelocity original reference-based mesh authoring kit',extras:{...root.userData,...metadata}},scene:0,scenes:[{name:root.name,nodes:[0]}],nodes:[],meshes:[],materials:[],bufferViews:[],accessors:[],buffers:[]},bytes=[],matMap=new Map();
 function view(data,target){const i=j.bufferViews.length;const b=Buffer.from(data.buffer,data.byteOffset,data.byteLength);j.bufferViews.push({buffer:0,byteLength:b.length,...(target?{target}:{})});bytes.push(b);return i;}
 function accessor(data,type,componentType,target,bounds){const a={bufferView:view(data,target),componentType,count:data.length/({SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[type]),type};if(bounds){a.min=bounds.min;a.max=bounds.max;}j.accessors.push(a);return j.accessors.length-1;}
 function material(m){if(matMap.has(m.uuid))return matMap.get(m.uuid);const i=j.materials.length;const col=m.color.clone().convertSRGBToLinear().toArray(),em=m.emissive?m.emissive.clone().convertSRGBToLinear().toArray().map(v=>v*(m.emissiveIntensity||0)):null;const value={name:m.name,pbrMetallicRoughness:{baseColorFactor:[...col,1],metallicFactor:m.metalness||0,roughnessFactor:m.roughness??.4},doubleSided:m.side===T.DoubleSide};if(em&&em.some(v=>v>0))value.emissiveFactor=em;if(/^paint/.test(m.name)){value.extensions={KHR_materials_clearcoat:{clearcoatFactor:.8,clearcoatRoughnessFactor:.16}};j.extensionsUsed=Array.from(new Set([...(j.extensionsUsed||[]),'KHR_materials_clearcoat']));}if(/^glass/.test(m.name)){value.pbrMetallicRoughness.metallicFactor=.12;value.pbrMetallicRoughness.roughnessFactor=.10;value.extensions={...(value.extensions||{}),KHR_materials_transmission:{transmissionFactor:.35}};j.extensionsUsed=Array.from(new Set([...(j.extensionsUsed||[]),'KHR_materials_transmission']));}j.materials.push(value);matMap.set(m.uuid,i);return i;}
 function visit(n){const i=j.nodes.length,o={name:n.name};j.nodes.push(o);if(n.position.lengthSq()>1e-14)o.translation=n.position.toArray();if(n.quaternion.x||n.quaternion.y||n.quaternion.z||n.quaternion.w!==1)o.rotation=n.quaternion.toArray();if(n.scale.x!==1||n.scale.y!==1||n.scale.z!==1)o.scale=n.scale.toArray();
  if(n.isMesh){const g=n.geometry,p=g.attributes.position;g.computeBoundingBox();const attrs={POSITION:accessor(p.array,'VEC3',5126,34962,{min:g.boundingBox.min.toArray(),max:g.boundingBox.max.toArray()})};for(const [k,s]of [['normal','NORMAL'],['uv','TEXCOORD_0']])if(g.attributes[k])attrs[s]=accessor(g.attributes[k].array,k==='uv'?'VEC2':'VEC3',5126,34962);const idx=g.index.array;const prim={attributes:attrs,indices:accessor(idx,'SCALAR',idx.BYTES_PER_ELEMENT===4?5125:5123,34963),material:material(n.material)};o.mesh=j.meshes.length;j.meshes.push({name:n.name,primitives:[prim]});}
  if(n.children.length)o.children=n.children.map(visit);return i;
 }visit(optimized);
 let offset=0,chunks=[];bytes.forEach((b,i)=>{j.bufferViews[i].byteOffset=offset;chunks.push(b);offset+=b.length;const pad=(4-offset%4)%4;if(pad){chunks.push(Buffer.alloc(pad));offset+=pad;}});j.buffers=[{byteLength:offset}];let json=Buffer.from(JSON.stringify(j));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);const bin=Buffer.concat(chunks),header=Buffer.alloc(20),bh=Buffer.alloc(8);header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+bin.length,8);header.writeUInt32LE(json.length,12);header.write('JSON',16);bh.writeUInt32LE(bin.length);bh.writeUInt32LE(0x004e4942,4);const glb=Buffer.concat([header,json,bh,bin]);
 const bounds=new T.Box3().setFromObject(optimized),size=bounds.getSize(new T.Vector3());const names=j.nodes.map(n=>n.name);for(const label of ['FL','FR','RL','RR'])if(!names.includes('wheel_'+label))throw new Error('Missing wheel_'+label);if(!names.includes('steer_FL')||!names.includes('steer_FR'))throw new Error('Missing steering groups');let triangles=0;for(const m of j.meshes)for(const p of m.primitives){const pos=j.accessors[p.attributes.POSITION],idx=j.accessors[p.indices];if(!pos.min.every(Number.isFinite)||!pos.max.every(Number.isFinite))throw new Error('Nonfinite position');triangles+=idx.count/3;}if(!j.materials.some(m=>/^paint/.test(m.name)))throw new Error('Missing body paint');
 fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,glb);const report={id:root.name,file,bytes:glb.length,triangles,meshCount:j.meshes.length,nodeCount:j.nodes.length,materials:j.materials.map(m=>m.name),bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},dimensions:size.toArray(),provenance:j.asset.extras.provenance,...metadata};fs.writeFileSync(file.replace(/\.glb$/,'.metadata.json'),JSON.stringify(report,null,2)+'\n');return report;
}
module.exports={THREE,createModel,materials,mat,mesh,box,sphere,cylinder,tube,surface,bodyLoft,shape,oval,roundedPanel,roundedRectPoints,cabin,wing,wheelRig,optimize,exportGLB,lerp,interp};
