/* NEON VELOCITY — deterministic, instanced architectural city. Three.js r128. */
(function(global){
'use strict';
function build(options){
 const T=options.THREE||global.THREE, scene=options.scene, points=options.trackPoints;
 const n=points.length, half=options.roadHalf||11, normals=options.trackNormals;
 const root=new T.Group();root.name='NVArchitecturalCity';
 const baseRoot=new T.Group(),detailRoot=new T.Group(),fineRoot=new T.Group();
 baseRoot.name='CityMasses';detailRoot.name='CityStreetDetail';fineRoot.name='CityFineDetail';root.add(baseRoot,detailRoot,fineRoot);scene.add(root);
 let seed=20261120;function random(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}const range=(a,b)=>a+(b-a)*random();
 const textures=[],materials=[],geometries=[],emissiveMaterials=[],buckets=new Map(),footprints=[];
 const stats={buildings:0,nearBuildings:0,skylineBuildings:0,typologies:[],trees:0,storefronts:0,balconies:0,instances:0,drawCalls:0,triangles:0,seed:20261120};
 const box=new T.BoxGeometry(1,1,1),plane=new T.PlaneGeometry(1,1),cylinder=new T.CylinderGeometry(1,1,1,10),leaf=new T.IcosahedronGeometry(1,1),sphere=new T.SphereGeometry(1,10,6);
 geometries.push(box,plane,cylinder,leaf,sphere);
 function material(color,rough,metal){const m=new T.MeshStandardMaterial({color,roughness:rough===undefined?.82:rough,metalness:metal||0});materials.push(m);return m;}
 const concrete=material(0x686d72,.87),lightConcrete=material(0x99958b,.9),darkConcrete=material(0x343b42,.87),roofMat=material(0x30353a,.94),frame=material(0x313b43,.36,.65),blackMetal=material(0x252d32,.48,.66),chrome=material(0x879397,.34,.72),brick=material(0x725747,.92),cream=material(0xa39a89,.9),charcoal=material(0x43474a,.88),wood=material(0x736047,.85),soil=material(0x292a25,1),bark=material(0x504a3f,1),foliage=material(0x3b5141,.95),foliageLight=material(0x536449,.96),awningGreen=material(0x34534d,.91),awningRed=material(0x794e45,.93),awningCream=material(0xaaa08a,.92),marking=material(0xc4b496,.92),paver=material(0x777a78,.96);
 const glass=material(0x293d48,.19,.62),glassRail=material(0x344b53,.25,.52);
 const warmLight=new T.MeshStandardMaterial({color:0xffecc4,emissive:0xffdca8,emissiveIntensity:.7,roughness:.4});materials.push(warmLight);emissiveMaterials.push({material:warmLight,dusk:.25,night:1.0});
 function makeCanvas(width,height,paint){const c=document.createElement('canvas');c.width=width;c.height=height;paint(c.getContext('2d'),width,height);const t=new T.CanvasTexture(c);t.encoding=T.sRGBEncoding;t.anisotropy=4;textures.push(t);return t;}
 // Diffuse and emissive channels are distinct: only occupied windows emit light.
 function facade(kind,variant){
  let lightCanvas=document.createElement('canvas');lightCanvas.width=512;lightCanvas.height=1024;const light=lightCanvas.getContext('2d');light.fillStyle='#000';light.fillRect(0,0,512,1024);
  const map=makeCanvas(512,1024,(ctx,w,h)=>{
   const isGlass=kind==='glass',isBrick=kind==='brick',isRetail=kind==='retail';
   const colors=isGlass?['#273944','#35434b','#293c41']:isBrick?['#705549','#68574d']:['#999386','#8b918f','#777f80'];
   ctx.fillStyle=colors[variant%colors.length];ctx.fillRect(0,0,w,h);
   if(isBrick){for(let y=0;y<h;y+=13){ctx.fillStyle='rgba(30,27,24,.35)';ctx.fillRect(0,y,w,2);for(let x=(y%26?0:-19);x<w;x+=38){ctx.fillRect(x,y,2,13);if(random()<.15){ctx.fillStyle='rgba(135,98,69,.2)';ctx.fillRect(x+2,y+2,34,9);ctx.fillStyle='rgba(30,27,24,.35)';}}}}
   const cols=isGlass?8:isRetail?4:4,rows=isGlass?(variant===2?18:24):isBrick?5:isRetail?2:9;
   const cellW=w/cols,cellH=h/rows;
   for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
    const px=c*cellW,py=r*cellH,padX=isGlass?3:isRetail?5:cellW*.21,padY=isGlass?4:isRetail?8:cellH*.19;
    const x=px+padX,y=py+padY,ww=cellW-padX*2,hh=cellH-padY*2;
    if(!isGlass){ctx.fillStyle='#3d4242';ctx.fillRect(x-3,y-3,ww+6,hh+8);ctx.fillStyle='#b6b4a7';ctx.fillRect(x-1,y-1,ww+2,hh+2);}
    const occupied=random()<(isRetail?.85:isGlass?.25:.39);const shade=random();
    if(occupied){ctx.fillStyle=shade>.55?'#b5a07c':shade>.22?'#8a8d85':'#c3b194';ctx.fillRect(x,y,ww,hh);light.fillStyle=shade>.55?'#d2b58a':shade>.22?'#a4b1bc':'#e5cea8';light.fillRect(x,y,ww,hh);}
    else{const gradient=ctx.createLinearGradient(x,y,x+ww,y+hh);gradient.addColorStop(0,shade>.6?'#4a606d':'#344c59');gradient.addColorStop(.48,'#263b46');gradient.addColorStop(1,'#1b2d36');ctx.fillStyle=gradient;ctx.fillRect(x,y,ww,hh);}
    // Ceiling strip, blinds, interior partitions and individual offices.
    ctx.fillStyle=occupied?'rgba(48,44,38,.42)':'rgba(130,159,178,.15)';ctx.fillRect(x,y+hh*.15,ww,2);
    if(occupied&&random()>.45){for(let b=0;b<5;b++){ctx.fillStyle='rgba(47,45,43,.22)';ctx.fillRect(x,y+b*hh*.17,ww,2);light.fillStyle='rgba(0,0,0,.2)';light.fillRect(x,y+b*hh*.17,ww,2);}}
    ctx.fillStyle='rgba(12,21,24,.65)';ctx.fillRect(x,y+hh*.82,ww,hh*.18);light.fillStyle='rgba(0,0,0,.62)';light.fillRect(x,y+hh*.82,ww,hh*.18);
    if(occupied&&random()>.55){const furniture=x+ww*.18;ctx.fillRect(furniture,y+hh*.62,ww*.23,hh*.22);light.fillRect(furniture,y+hh*.62,ww*.23,hh*.22);}
    ctx.fillStyle=isGlass?'#1e2e37':'#767d7a';ctx.fillRect(x+ww*.49,y,2,hh);light.fillStyle='#000';light.fillRect(x+ww*.49,y,2,hh);
    if(isGlass){ctx.fillStyle='rgba(130,154,164,.2)';ctx.fillRect(px,py,2,cellH);ctx.fillStyle='#1d2931';ctx.fillRect(px,py+cellH-3,cellW,3);}
    else{ctx.fillStyle='#b3afa2';ctx.fillRect(x-4,y+hh+2,ww+8,3);}
   }
  });
  const emission=new T.CanvasTexture(lightCanvas);emission.encoding=T.sRGBEncoding;emission.anisotropy=4;textures.push(emission);
  map.wrapS=map.wrapT=emission.wrapS=emission.wrapT=T.RepeatWrapping;
  const m=new T.MeshStandardMaterial({map,emissiveMap:emission,emissive:0xffffff,emissiveIntensity:.33,roughness:kind==='glass'?.3:.8,metalness:kind==='glass'?.55:.04,envMapIntensity:.6,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  m.userData.facadeTile=kind==='glass'?{w:19.2,h:(variant===2?18:24)*3.2}:kind==='brick'?{w:14.4,h:21}:kind==='retail'?{w:8,h:6.4}:{w:15.2,h:30.6};
  m.onBeforeCompile=shader=>{shader.vertexShader='attribute vec2 nvUvScale;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\n#ifdef USE_UV\nvUv *= nvUvScale;\n#endif');};
  m.customProgramCacheKey=()=> 'NVFacadeWorldScale';
  materials.push(m);emissiveMaterials.push({material:m,dusk:.28,night:1.25});return m;
 }
 const glassFacades=[facade('glass',0),facade('glass',1),facade('glass',2)],apartFacades=[facade('apartment',0),facade('apartment',1),facade('apartment',2)],brickFacade=facade('brick',0),retailFacade=facade('retail',0);
 const pavingTex=makeCanvas(256,256,(ctx,w,h)=>{ctx.fillStyle='#8e9291';ctx.fillRect(0,0,w,h);for(let i=0;i<5500;i++){const a=random()*.13;ctx.fillStyle='rgba(20,25,28,'+a+')';ctx.fillRect(random()*w,random()*h,1,1);}ctx.strokeStyle='#707775';ctx.lineWidth=2;for(let i=0;i<=4;i++){ctx.beginPath();ctx.moveTo(i*64,0);ctx.lineTo(i*64,h);ctx.stroke();ctx.beginPath();ctx.moveTo(0,i*64);ctx.lineTo(w,i*64);ctx.stroke();}});pavingTex.wrapS=pavingTex.wrapT=T.RepeatWrapping;
 const pavement=new T.MeshStandardMaterial({map:pavingTex,color:0x929591,roughness:.97});materials.push(pavement);
 const signLabels=['KOPI SENJA','TOKO BUKU','NUSA MARKET','APOTEK','STUDIO 24','URBAN SPORTS','HOTEL ARUNA','PARKIR','BISTRO','ATELIER','BANK KOTA','PASAR LOKAL'];
 const signs=signLabels.map((label,i)=>{const map=makeCanvas(512,96,(ctx,w,h)=>{ctx.fillStyle=['#173c39','#383e42','#565146','#693e39'][i%4];ctx.fillRect(0,0,w,h);ctx.fillStyle='#e9e5d7';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='600 '+(label.length>11?30:36)+'px Arial';ctx.fillText(label,w/2,h/2+1);ctx.fillStyle='#c8c2ae';ctx.fillRect(20,20,2,56);ctx.fillRect(w-22,20,2,56);});const m=new T.MeshStandardMaterial({map,emissiveMap:map,emissive:0xffffff,emissiveIntensity:.15,roughness:.65});materials.push(m);emissiveMaterials.push({material:m,dusk:.09,night:.4});return m;});
 const names=['Curtain-wall tower','Stepped office tower','Terraced apartments','Brick loft','Boulevard hotel','Parking structure','Retail arcade','Residential tower','Civic pavilion','Office slab'];
 const tempMatrix=new T.Matrix4(),tempPos=new T.Vector3(),tempScale=new T.Vector3(),tempQuat=new T.Quaternion();
 function instance(geometry,mat,x,y,z,sx,sy,sz,yaw,lod,rx,rz){
  lod=lod||0;const key=geometry.id+'/'+mat.id+'/'+lod;let bucket=buckets.get(key);if(!bucket){bucket={geometry,material:mat,lod,matrices:[]};buckets.set(key,bucket);}
  tempPos.set(x,y,z);tempScale.set(sx,sy,sz);tempQuat.setFromEuler(new T.Euler(rx||0,yaw||0,rz||0,'YXZ'));tempMatrix.compose(tempPos,tempQuat,tempScale);bucket.matrices.push(tempMatrix.clone());
 }
 function builder(x,z,yaw){const co=Math.cos(yaw),si=Math.sin(yaw);
  function add(g,m,lx,ly,lz,sx,sy,sz,rot,lod,rx,rz){instance(g,m,x+co*lx+si*lz,ly,z-si*lx+co*lz,sx,sy,sz,yaw+(rot||0),lod,rx,rz);}
  return {
   box:(m,lx,ly,lz,w,h,d,lod,rot,rx,rz)=>add(box,m,lx,ly,lz,w,h,d,rot,lod,rx,rz),
   plane:(m,lx,ly,lz,w,h,rot,lod,rx)=>add(plane,m,lx,ly,lz,w,h,1,rot,lod,rx),
   cyl:(m,lx,ly,lz,r,h,lod,rot)=>add(cylinder,m,lx,ly,lz,r,h,r,rot,lod),
   sphere:(m,lx,ly,lz,sx,sy,sz,lod)=>add(sphere,m,lx,ly,lz,sx,sy,sz,0,lod),
   leaf:(m,lx,ly,lz,sx,sy,sz,lod)=>add(leaf,m,lx,ly,lz,sx,sy,sz,range(0,3),lod)
  };
 }
 function nearestTrack(x,z){let best=Infinity;for(let i=0;i<n;i++){const a=points[i],b=points[(i+1)%n],dx=b.x-a.x,dz=b.z-a.z;const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1)));const xx=x-(a.x+dx*t),zz=z-(a.z+dz*t);best=Math.min(best,xx*xx+zz*zz);}return Math.sqrt(best);}
 function safe(x,z,r){if(nearestTrack(x,z)<half+5.8+r)return false;for(const f of footprints)if(Math.hypot(x-f.x,z-f.z)<r+f.radius+2)return false;return true;}
 function facades(b,mat,cx,base,cz,w,h,d){
  b.plane(mat,cx,base+h/2,cz+d/2+.017,w,h,0);
  b.plane(mat,cx,base+h/2,cz-d/2-.017,w,h,Math.PI);
  b.plane(mat,cx+w/2+.017,base+h/2,cz,d,h,Math.PI/2);
  b.plane(mat,cx-w/2-.017,base+h/2,cz,d,h,-Math.PI/2);
 }
 function volume(b,m,f,cx,base,cz,w,h,d){b.box(m,cx,base+h/2,cz,w,h,d);if(f)facades(b,f,cx,base,cz,w,h,d);b.box(roofMat,cx,base+h+.07,cz,w+.05,.14,d+.05);}
 function roof(b,cx,y,cz,w,d,near){
  const para=near?.36:.5;b.box(concrete,cx,y+.30,cz+d/2,w+.2,.6,para);b.box(concrete,cx,y+.30,cz-d/2,w+.2,.6,para);b.box(concrete,cx-w/2,y+.30,cz,para,.6,d);b.box(concrete,cx+w/2,y+.30,cz,para,.6,d);
  b.box(darkConcrete,cx+w*.12,y+.8,cz-d*.1,Math.max(2,w*.25),1.6,Math.max(2,d*.22));
  if(near){for(let i=0;i<2;i++){const xx=cx-w*.23+i*w*.35;b.box(chrome,xx,y+.55,cz+d*.15,2.1,.9,1.8,1);b.cyl(blackMetal,xx,y+1.02,cz+d*.15,.54,.04,1);b.box(frame,xx,y+1.05,cz+d*.15,1.1,.04,.04,2);b.box(frame,xx,y+1.05,cz+d*.15,.04,.04,1.1,2);}}
 }
 function horizontalFloors(b,m,cx,base,cz,w,h,d,spacing,lod){for(let y=base+spacing;y<base+h-.5;y+=spacing)b.box(m,cx,y,cz,w+.14,.17,d+.14,lod||0);}
 function shopfront(b,w,d,variant,near){
  const count=Math.max(2,Math.round(w/6));const bay=w/count;
  b.box(darkConcrete,0,2.2,d/2+.11,w,4.2,.24);
  for(let i=0;i<count;i++){
   const x=-w/2+bay*(i+.5);b.plane(retailFacade,x,1.8,d/2+.26,bay-.32,2.9,0);
   b.box(frame,x-bay/2+.1,1.8,d/2+.32,.14,3.4,.24,1);
   b.box(frame,x+bay/2-.1,1.8,d/2+.32,.14,3.4,.24,1);
   b.box(frame,x,1.8,d/2+.34,.07,3.1,.12,1);
   b.plane(signs[(variant+i)%signs.length],x,3.73,d/2+.38,bay-.24,.70,0);
   if(near){b.box([awningGreen,awningRed,awningCream][(variant+i)%3],x,3.21,d/2+1.03,bay-.14,.15,1.75,1,0,-.08);b.box([awningGreen,awningRed,awningCream][(variant+i)%3],x,3.08,d/2+1.87,bay-.14,.32,.08,1);b.box(warmLight,x,3.12,d/2+.45,bay*.65,.035,.05,2);}
   stats.storefronts++;
  }
  b.box(lightConcrete,0,.11,d/2+1.0,w+.35,.22,2.2,1);
 }
 function balcony(b,x,y,z,width,near){
  b.box(lightConcrete,x,y,z+.53,width,.20,1.45);b.box(glassRail,x,y+.66,z+1.18,width-.12,1.0,.075,1);
  b.box(chrome,x,y+1.2,z+1.2,width,.045,.045,1);b.box(chrome,x-width/2+.07,y+.69,z+1.2,.05,1.04,.05,1);b.box(chrome,x+width/2-.07,y+.69,z+1.2,.05,1.04,.05,1);
  b.box(glassRail,x-width/2+.05,y+.66,z+.54,.06,1,1.2,1);b.box(glassRail,x+width/2-.05,y+.66,z+.54,.06,1,1.2,1);stats.balconies++;
 }
 function construct(f){
  const {x,z,yaw,width:w,depth:d,height:h,type,near}=f,b=builder(x,z,yaw),variant=(type+Math.floor(random()*3))%3;
  // A set-back ground plane gives every building a visible, deliberate frontage.
  b.box(paver,0,.055,0,w+3.5,.11,d+5.5);
  if(type===0){
   volume(b,darkConcrete,retailFacade,0,0,0,w,5.0,d);shopfront(b,w,d,0,near);
   const tw=w*.81,td=d*.80;volume(b,frame,glassFacades[0],0,5,-.5,tw,h-5,td);
   horizontalFloors(b,frame,0,5,-.5,tw,h-5,td,3.2,near?1:0);
   for(let i=-2;i<=2;i++)b.box(chrome,i*tw/5,5+(h-5)/2,td/2-.46,.12,h-5,.18,near?1:2);
   roof(b,0,h,-.5,tw,td,near);b.box(lightConcrete,0,h+1.8,-.5,tw*.4,2.8,td*.35);
  }else if(type===1){
   volume(b,concrete,retailFacade,0,0,0,w,5,d);shopfront(b,w,d,2,near);
   const hs=[h*.37,h*.29,h*.27],ws=[w*.94,w*.76,w*.55],ds=[d*.88,d*.73,d*.6];let base=5;
   for(let q=0;q<3;q++){const cx=(q-1)*.6,cz=-q*.5;volume(b,frame,glassFacades[1],cx,base,cz,ws[q],hs[q],ds[q]);horizontalFloors(b,charcoal,cx,base,cz,ws[q],hs[q],ds[q],3.2,near?1:2);roof(b,cx,base+hs[q],cz,ws[q],ds[q],near&&q===2);base+=hs[q];}
  }else if(type===2){
   volume(b,cream,apartFacades[0],0,0,0,w,h,d);shopfront(b,w,d,4,near);
   for(let y=5.1;y<h-2;y+=3.4)for(let j=0;j<3;j++){const xx=(j-1)*w*.29;balcony(b,xx,y,d/2,w*.245,near);}
   for(let j=-1;j<=1;j++)b.box(cream,j*w*.33,h/2,0,.38,h,d+.1);
   roof(b,0,h,0,w,d,near);
  }else if(type===3){
   volume(b,brick,brickFacade,0,0,0,w,h,d);shopfront(b,w,d,8,near);
   for(let j=-2;j<=2;j++)b.box(brick,j*w/4,h/2,d/2+.12,.39,h,.27,1);
   horizontalFloors(b,cream,0,0,0,w,h,d,4.2,0);b.box(cream,0,h-.3,0,w+.75,.55,d+.75);
   roof(b,0,h,0,w,d,near);
   if(near){for(let y=5;y<h-1;y+=4){b.box(blackMetal,w*.34,y,d/2+.65,2,.14,1.25,1);for(let k=0;k<4;k++)b.box(blackMetal,w*.34-1+k*.66,y+.54,d/2+1.25,.045,.95,.045,2);b.box(blackMetal,w*.34,y+1,d/2+1.25,2.1,.05,.05,1);b.box(blackMetal,w*.34,y+2,d/2+.98,.10,4.1,.13,1,0,.22);}}
   if(random()>.4){b.cyl(wood,-w*.25,h+2.2,-d*.15,1.25,2.2,1);b.cyl(blackMetal,-w*.25,h+3.35,-d*.15,1.3,.12,1);for(let j=0;j<3;j++){const a=j/3*Math.PI*2;b.box(blackMetal,-w*.25+Math.sin(a),h+.75,-d*.15+Math.cos(a),.16,1.5,.16,1);}}
  }else if(type===4){
   volume(b,lightConcrete,apartFacades[2],0,0,0,w,h,d);
   b.box(cream,-w/2+.45,h/2,d/2+.08,.9,h,.25);b.box(cream,w/2-.45,h/2,d/2+.08,.9,h,.25);b.box(darkConcrete,0,h/2,d/2+.10,1.0,h,.24);
   shopfront(b,w,d,6,near);b.box(frame,0,4.4,d/2+1.3,w*.58,.28,2.8);b.box(warmLight,0,4.21,d/2+1.35,w*.5,.04,2.5,1);
   b.plane(signs[6],0,h-1.3,d/2+.28,w*.82,1.2,0);
   roof(b,0,h,0,w,d,near);
  }else if(type===5){
   b.box(darkConcrete,0,h/2,0,w-.8,h,d-.8);
   for(let y=0;y<=h;y+=3.2){b.box(lightConcrete,0,y+.15,0,w+.4,.3,d+.4);if(y<h){b.box(concrete,0,y+1.1,d/2,w,.7,.25);b.box(concrete,0,y+1.1,-d/2,w,.7,.25);for(let k=-2;k<=2;k++)b.box(concrete,k*w/4,y+1.75,d/2,.43,3.1,.45);}}
   b.box(charcoal,0,h/2,0,3,h,d+.2);b.plane(signs[7],w*.29,2.4,d/2+.32,w*.31,1.2,0);
   if(near)b.box(concrete,-w*.25,3.8,d*.1,3,.22,d*.75,1,0,-.28);
  }else if(type===6){
   volume(b,cream,apartFacades[0],0,0,0,w,h,d);shopfront(b,w,d,Math.floor(random()*12),true);
   b.box(brick,0,4.5,d/2+.12,w,.5,.3);b.box(cream,0,h-.2,0,w+.6,.4,d+.6);
   for(let j=-1;j<=1;j++)b.box(brick,j*w*.33,h/2,d/2+.18,.28,h,.42);
   roof(b,0,h,0,w,d,near);
  }else if(type===7){
   volume(b,charcoal,apartFacades[1],0,0,0,w,h,d);shopfront(b,w,d,1,near);
   b.box(lightConcrete,0,h/2,d/2+.1,w*.16,h,.55);
   const top=near?Math.min(h-2,31):h-2;for(let y=5.1;y<top;y+=4){balcony(b,-w*.33,y,d/2,w*.25,near);balcony(b,w*.33,y,d/2,w*.25,near);}
   roof(b,0,h,0,w,d,near);b.box(charcoal,0,h+2,0,w*.3,3.7,d*.3);
  }else if(type===8){
   volume(b,lightConcrete,glassFacades[2],0,0,-1,w*.83,h-3,d*.85);
   b.box(cream,0,h-1.4,0,w+2.0,2.0,d+1.1);b.box(darkConcrete,0,h-.35,-.4,w*.45,.25,d*.7);
   for(let j=-3;j<=3;j++)b.cyl(lightConcrete,j*w*.13,(h-2)/2,d/2+.15,.34,h-2);
   b.box(cream,0,.16,d/2+1,w+1,.32,2.7);b.box(cream,0,.36,d/2+.6,w+.6,.24,2.0);
   b.plane(signs[9],0,h-1.35,d/2+.62,w*.52,.74,0);
  }else{
   volume(b,frame,glassFacades[2],0,0,0,w,h,d);shopfront(b,w,d,10,near);
   b.box(lightConcrete,-w/2+.45,h/2,d/2+.1,.9,h,.6);b.box(lightConcrete,w/2-.45,h/2,d/2+.1,.9,h,.6);
   for(let y=7;y<h;y+=7.2)b.box(lightConcrete,0,y,d/2+.1,w,.5,.5);
   for(let j=-1;j<=1;j++)b.box(lightConcrete,j*w*.25,h/2,d/2+.1,.28,h,.4);
   roof(b,0,h,0,w,d,near);
  }
  if(near){
   // Entrance planters, low hedges and bollards stay inside the reserved lot.
   for(const side of[-1,1]){b.box(concrete,side*(w/2-.8),.42,d/2+2.3,1.3,.8,1.0,1);b.box(soil,side*(w/2-.8),.83,d/2+2.3,1.12,.05,.82,1);b.leaf(foliage,side*(w/2-.8),1.19,d/2+2.3,.72,.55,.55,1);}
  }
 }
 const dimensions=[ [18,16,68],[23,19,76],[22,15,28],[18,14,21],[17,17,49],[26,20,16],[25,13,11],[24,18,57],[27,20,15],[28,16,60] ];
 function place(type,near,x,z,yaw){
  const dims=dimensions[type],scale=near?range(.88,1.12):range(.8,1.5),w=dims[0]*scale,d=dims[1]*scale,h=dims[2]*(near?range(.87,1.14):range(.8,1.7));
  const radius=Math.hypot(w+4,d+6)/2;
  if(typeof x==='function'){const p=x(radius);x=p.x;z=p.z;}
  if(!safe(x,z,radius))return false;
  const f={x,z,yaw,width:w,depth:d,height:h,type,typology:names[type],near,radius,reservedWidth:w+4,reservedDepth:d+6};footprints.push(f);construct(f);stats.buildings++;stats[near?'nearBuildings':'skylineBuildings']++;if(!stats.typologies.includes(names[type]))stats.typologies.push(names[type]);return true;
 }
 // Each frontage faces the circuit, instead of scattering unoriented boxes.
 let serial=0;
 for(let i=8;i<n;i+=13){for(const side of[-1,1]){const p=points[i],normal=normals[i],yaw=Math.atan2(-normal.x*side,-normal.z*side);const type=serial++%10;
  place(type,true,r=>({x:p.x+normal.x*side*(half+7.2+r),z:p.z+normal.z*side*(half+7.2+r)}),0,yaw);
 }}
 // Layered background blocks remain coherent with the main street grid.
 let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;points.forEach(p=>{minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minZ=Math.min(minZ,p.z);maxZ=Math.max(maxZ,p.z);});
 for(let attempts=0;attempts<1600&&stats.skylineBuildings<80;attempts++){
  const x=range(minX-210,maxX+210),z=range(minZ-210,maxZ+210);if(nearestTrack(x,z)<60)continue;
  const type=[0,1,4,7,9,3,6][Math.floor(random()*7)],yaw=Math.round(random()*4)*Math.PI/2;place(type,false,x,z,yaw);
 }
 // Sidewalks follow the true track curve, with separate vertical kerb faces.
 function ribbon(inner,outer,y,mat){const ps=[],uv=[],indices=[];let distance=0;
  for(let i=0;i<=n;i++){const k=i%n,p=points[k],normal=normals[k];if(i>0)distance+=p.distanceTo(points[(i-1)%n]);for(const off of[inner,outer]){ps.push(p.x+normal.x*off,y,p.z+normal.z*off);uv.push((off-inner)/1.6,distance/1.6);}if(i<n){const a=i*2;if(outer>inner)indices.push(a,a+1,a+2,a+1,a+3,a+2);else indices.push(a,a+2,a+1,a+1,a+2,a+3);}}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(ps,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();geometries.push(g);const mesh=new T.Mesh(g,mat);mesh.receiveShadow=true;baseRoot.add(mesh);return mesh;
 }
 for(const side of[-1,1]){
  ribbon(side*(half+1.12),side*(half+5.6),.16,pavement);
  ribbon(side*(half+1.12),side*(half+1.32),.175,lightConcrete);
  for(let i=0;i<n;i+=2){const p=points[i],q=points[(i+2)%n],normal=normals[i],normal2=normals[(i+2)%n];const offset=side*(half+5.65);const ax=p.x+normal.x*offset,az=p.z+normal.z*offset,bx=q.x+normal2.x*offset,bz=q.z+normal2.z*offset;instance(box,concrete,(ax+bx)/2,.11,(az+bz)/2,.20,.22,Math.hypot(bx-ax,bz-az)+.02,Math.atan2(bx-ax,bz-az),0);}
 }
 // Human-scale streetscape: trunks, branches, benches, bollards, and shelters.
 for(let i=5;i<n;i+=11){
  const p=points[i],normal=normals[i],side=((i/11|0)%2)?1:-1,offset=side*(half+3.65);const x=p.x+normal.x*offset,z=p.z+normal.z*offset;
  if(nearestTrack(x,z)<half+2.5)continue;
  const b=builder(x,z,Math.atan2(normal.x,normal.z));
  b.box(concrete,0,.36,0,1.4,.72,1.4,1);b.box(soil,0,.73,0,1.23,.04,1.23,1);b.cyl(bark,0,2.7,0,.14,4.1);
  b.leaf(foliage,0,5.6,0,1.58,1.9,1.5);b.leaf(foliageLight,.65,5.1,.18,1.15,1.33,1.15,1);b.leaf(foliage,-.7,4.85,-.15,1.1,1.3,1.0,1);
  if(stats.trees%3===0){for(let j=0;j<4;j++)b.box(wood,2.5,.68,-.22+j*.15,1.8,.11,.12,1);b.box(wood,2.5,1.02,.37,1.8,.50,.09,1);b.box(blackMetal,1.84,.34,.05,.08,.62,.52,1);b.box(blackMetal,3.16,.34,.05,.08,.62,.52,1);}
  stats.trees++;
 }
 for(let i=0;i<n;i+=8)for(const side of[-1,1]){const p=points[i],r=normals[i],o=side*(half+1.8),x=p.x+r.x*o,z=p.z+r.z*o;if(nearestTrack(x,z)<half+1.4)continue;instance(cylinder,blackMetal,x,.62,z,.095,.9,.095,0,1);instance(cylinder,marking,x,.92,z,.10,.055,.10,0,1);}
 for(const index of[44,173,301,411]){
  const i=index%n,p=points[i],r=normals[i],side=index%2?1:-1,x=p.x+r.x*side*(half+3.8),z=p.z+r.z*side*(half+3.8);if(nearestTrack(x,z)<half+2.8)continue;
  const b=builder(x,z,Math.atan2(-r.x*side,-r.z*side));
  for(const xx of[-2.5,2.5]){b.box(frame,xx,1.7,-.7,.08,3.1,.08,1);b.box(frame,xx,1.7,.7,.08,3.1,.08,1);}
  b.box(frame,0,3.28,0,5.7,.18,2.1,1);b.box(glassRail,0,1.75,-.74,5.1,2.7,.06,1);b.box(glassRail,-2.5,1.75,0,.06,2.7,1.5,1);b.box(wood,0,.75,-.15,3.5,.12,.55,1);b.box(blackMetal,-1.2,.43,-.15,.08,.58,.5,1);b.box(blackMetal,1.2,.43,-.15,.08,.58,.5,1);b.plane(signs[10],0,2.94,.83,2.7,.38,0,1);
 }
 // One draw call per shared geometry/material/detail group, regardless of count.
 buckets.forEach(bucket=>{
  let geometry=bucket.geometry;
  if(bucket.material.userData.facadeTile){geometry=bucket.geometry.clone();geometries.push(geometry);const tile=bucket.material.userData.facadeTile,repeats=new Float32Array(bucket.matrices.length*2);bucket.matrices.forEach((matrix,i)=>{const e=matrix.elements;repeats[i*2]=Math.hypot(e[0],e[1],e[2])/tile.w;repeats[i*2+1]=Math.hypot(e[4],e[5],e[6])/tile.h;});geometry.setAttribute('nvUvScale',new T.InstancedBufferAttribute(repeats,2));}
  const mesh=new T.InstancedMesh(geometry,bucket.material,bucket.matrices.length);
  bucket.matrices.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));mesh.instanceMatrix.needsUpdate=true;mesh.frustumCulled=false;
  mesh.castShadow=bucket.geometry!==plane&&bucket.lod===0;mesh.receiveShadow=true;mesh.userData.detail=bucket.lod;
  [baseRoot,detailRoot,fineRoot][bucket.lod].add(mesh);
  stats.instances+=bucket.matrices.length;stats.drawCalls++;stats.triangles+=((bucket.geometry.index?bucket.geometry.index.count:bucket.geometry.attributes.position.count)/3)*bucket.matrices.length;
 });
 stats.drawCalls+=4;stats.triangles+=n*8;stats.typologyCount=stats.typologies.length;
 root.userData.summary=stats;root.userData.footprints=footprints;root.userData.buildings=footprints;
 function setQuality(q){detailRoot.visible=q!=='low';fineRoot.visible=q==='high';root.userData.quality=q;}
 function setTimeOfDay(mode){const night=mode==='night';emissiveMaterials.forEach(item=>item.material.emissiveIntensity=night?item.night:item.dusk);root.userData.timeOfDay=night?'night':'dusk';}
 function dispose(){root.parent&&root.parent.remove(root);new Set(geometries).forEach(g=>g.dispose());new Set(materials).forEach(m=>m.dispose());new Set(textures).forEach(t=>t.dispose());}
 setQuality('medium');setTimeOfDay('dusk');
 return {root,baseRoot,detailRoot,fineRoot,stats,footprints,buildings:footprints,setQuality,setTimeOfDay,dispose};
}
global.NVCity={build};
})(window);
