'use strict';
/** UVelocity Panther Grand Touring, rebuilt from the supplied 21-Nov-2026 photo.
 * Original authored game geometry; no manufacturer CAD or scanned asset.
 * Metres, +Y up, +Z front. node scripts/build-panther.cjs --publish
 */
const fs=require('node:fs'),path=require('node:path');
const K=require('./modeling-kit.cjs');
const {THREE:T,createModel,materials,mat,mesh,box,sphere,cylinder,tube,surface,shape,roundedPanel,wheelRig,exportGLB,lerp,interp}=K;
const PI=Math.PI,id='panther-grand-touring',clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const provenance='Original UVelocity photo-reference recreation of Isuzu Panther Grand Touring, rebuilt from the four supplied 21 November 2026 images; not manufacturer CAD or a scan.';
const root=createModel(id,{provenance,reference:'User photos image(20261121-010144), image(20261121-010911), image(20261121-010924), image(20261121-010941): rounded nose, large swept reflector headlights, diagonal chrome grille, sculpted two-tone bumper, rounded quarter glazing and factory alloy wheels.',revision:'photo-rebuild-1.3.1'});
const m=materials(0x19252e);m.paint.metalness=.48;m.paint.roughness=.23;m.rim.color.setHex(0xc4c9ca);m.rim.metalness=.76;m.rim.roughness=.24;m.red.color.setHex(0x414446);m.glass.color.setHex(0x10171b);m.rear.emissiveIntensity=.06;m.amber.emissiveIntensity=.06;
const rubber=mat('panther_window_rubber',0x090c0e,0,.94),chrome=mat('panther_chrome',0xd1d6d8,.95,.16),cladding=mat('panther_moulded_cladding',0x334047,.12,.42),reflector=mat('panther_headlight_reflector',0xdde6ea,.94,.14),lens=mat('panther_clear_headlamp_lens',0xe8f6ff,.02,.04),plate=mat('panther_plate',0xd9dcda,.10,.45),reflectorShade=mat('panther_reflector_shadow',0xb6c5cf,.87,.19);

// Rounded 2D stamped outlines, sampled without spline overshoot.
function rounded(points,r=.04,steps=7){const out=[];for(let i=0;i<points.length;i++){const p=points[i],a=points[(i+points.length-1)%points.length],b=points[(i+1)%points.length],da=Math.hypot(a[0]-p[0],a[1]-p[1]),db=Math.hypot(b[0]-p[0],b[1]-p[1]),rr=Math.min(r,da*.38,db*.38),s=[p[0]+(a[0]-p[0])*rr/da,p[1]+(a[1]-p[1])*rr/da],e=[p[0]+(b[0]-p[0])*rr/db,p[1]+(b[1]-p[1])*rr/db];for(let k=0;k<=steps;k++){const q=k/steps;out.push([(1-q)**2*s[0]+2*q*(1-q)*p[0]+q*q*e[0],(1-q)**2*s[1]+2*q*(1-q)*p[1]+q*q*e[1]]);}}return out;}
function circle(cx,cy,rx,ry=rx,n=48){return Array.from({length:n},(_,i)=>{const a=i*PI*2/n;return[cx+Math.cos(a)*rx,cy+Math.sin(a)*ry];});}
function closedPath(points){const s=new T.Shape();s.moveTo(...points[0]);for(let i=1;i<points.length;i++)s.lineTo(...points[i]);s.closePath();return s;}
function inside(x,y,points){let hit=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;}
// Subdivide before mapping so curved lenses, glass and stamped frames carry
// real curvature rather than a few planar triangles over a curved boundary.
function panel(parent,material,outline,holes,map,name,outward=[0,0,1],detail=.11){const s=closedPath(outline);for(const h of holes||[])s.holes.push(closedPath(h));const src=new T.ShapeGeometry(s),ps=src.attributes.position,ix=src.index,verts=[],uv=[],index=[],cache=new Map();function vertex(a){const key=a.map(v=>v.toFixed(6)).join(',');if(cache.has(key))return cache.get(key);const i=verts.length/3;verts.push(...map(a[0],a[1]));uv.push(a[0],a[1]);cache.set(key,i);return i;}function tri(a,b,c,depth=0){const max=Math.max(Math.hypot(a[0]-b[0],a[1]-b[1]),Math.hypot(a[0]-c[0],a[1]-c[1]),Math.hypot(b[0]-c[0],b[1]-c[1]));if(max>detail&&depth<7){const ab=Math.hypot(a[0]-b[0],a[1]-b[1]),ac=Math.hypot(a[0]-c[0],a[1]-c[1]);if(ab>=max-1e-9){const mid=a.map((v,i)=>(v+b[i])/2);tri(a,mid,c,depth+1);tri(mid,b,c,depth+1);}else if(ac>=max-1e-9){const mid=a.map((v,i)=>(v+c[i])/2);tri(a,b,mid,depth+1);tri(mid,b,c,depth+1);}else{const mid=b.map((v,i)=>(v+c[i])/2);tri(a,b,mid,depth+1);tri(a,mid,c,depth+1);}}else index.push(vertex(a),vertex(b),vertex(c));}for(let i=0;i<ix.count;i+=3){const a=[0,1,2].map(j=>{const k=ix.getX(i+j);return[ps.getX(k),ps.getY(k)];});tri(...a);}const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(verts,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(index);g.computeVertexNormals();const n=g.attributes.normal,mean=new T.Vector3();for(let i=0;i<n.count;i++)mean.add(new T.Vector3(n.getX(i),n.getY(i),n.getZ(i)));if(mean.dot(new T.Vector3(...outward))<0){for(let i=0;i<index.length;i+=3)[index[i+1],index[i+2]]=[index[i+2],index[i+1]];g.setIndex(index);g.computeVertexNormals();}return mesh(parent,g,material,name);}
function outline(parent,material,points,r,name,closed=true){const curve=new T.CurvePath();for(let i=0;i<points.length-(closed?0:1);i++)curve.add(new T.LineCurve3(new T.Vector3(...points[i]),new T.Vector3(...points[(i+1)%points.length])));return mesh(parent,new T.TubeGeometry(curve,Math.max(4,points.length*2),r,6,closed),material,name);}
function strip(parent,material,points,r,name){return tube(parent,material,points,r,false,Math.max(24,points.length*8),name);}

// Local shell profile rounds the shoulder into the vertical door and nose.
// It is intentionally isolated from the shared modelling kit and other cars.
function bodyLoft(parent,material,stations,options={}){
 const before=parent.children.length,n=options.segments||112,m=options.crossSegments||30,z0=stations[0].z,z1=stations.at(-1).z,edgeDrop=options.edgeDrop??.028,sideInset=options.sideInset??.035,nose=options.nose;
 const sample=z=>({w:interp(stations,z,'w'),c:interp(stations,z,'c'),s:interp(stations,z,'s'),b:interp(stations,z,'b')});
 function mappedZ(x,y,z){if(options.tail&&z<options.tail.from){const tail=options.tail,a=sample(z),q=Math.min(1,Math.abs(x)/a.w),v=Math.max(0,Math.min(1,(y-a.b)/(a.c-a.b))),t=Math.max(0,Math.min(1,(tail.from-z)/(tail.from-z0)));return z+t*t*((tail.round||0)*q**4+(tail.bottomInset||0)*(1-v)**2+(tail.topInset||0)*v**4);}if(!nose||z<=nose.from)return z;const a=sample(z),q=Math.min(1,Math.abs(x)/a.w),v=Math.max(0,Math.min(1,(y-a.b)/(a.c-a.b))),t=Math.max(0,Math.min(1,(z-nose.from)/(z1-nose.from)));return z-t*t*((nose.round||0)*q**4+(nose.bottomInset||0)*(1-v)**2+(nose.topInset||0)*v**4);}
 const frontZ=(x,y)=>mappedZ(x,y,z1),rearZ=(x,y)=>mappedZ(x,y,z0);
 function topProfile(a,t){if(!options.roundedShoulders)return a.c+(a.s-a.c)*Math.sin(t*PI/2)**2-edgeDrop*t**8;const q=Math.min(1,t/.72),j=Math.max(0,(t-.72)/.28);return a.c+(a.s-a.c)*q*q*(3-2*q)-edgeDrop*(1-Math.sqrt(Math.max(0,1-j*j)));}
 const top=surface(parent,material,n,m,(u,v)=>{const z=lerp(z0,z1,u),a=sample(z),q=v*2-1,t=Math.abs(q),x=q*a.w,y=topProfile(a,t);return[x,y,mappedZ(x,y,z)];},'body_sculpted_top',false,options.topCutout?(u,v)=>{const z=lerp(z0,z1,u);return options.topCutout((v*2-1)*sample(z).w,z);}:null);
 for(const side of [-1,1]){const fn=(u,v)=>{const z=lerp(z0,z1,u),a=sample(z);let bottom=a.b;for(const w of options.wheelArches||[]){const dz=z-w.z;if(Math.abs(dz)<w.r)bottom=Math.max(bottom,w.y+Math.sqrt(w.r*w.r-dz*dz));}const shoulder=a.s-edgeDrop;bottom=Math.min(bottom,shoulder+.001);const x=side*(a.w-sideInset*Math.sin(v*PI/2)+(options.doorBulge||0)*Math.sin(v*PI)),y=lerp(shoulder,bottom,v);return[x,y,mappedZ(x,y,z)];};const apertures=options.sideOpenings||options.sideCutout;surface(parent,material,n,options.sideCutout?28:apertures?32:14,fn,'body_side_'+side,side<0,apertures?(u,v)=>{const[,y,z]=fn(u,v);return options.sideCutout?options.sideCutout(z,y):(options.sideOpenings||[]).some(h=>Math.abs(z-h.z)<h.rz&&Math.abs(y-h.y)<h.ry);}:null);}
 for(const [z,flip]of [[z0,true],[z1,false]]){
  const a=sample(z),nu=(nose&&z===z1)||(options.rearOpenings&&z===z0)?m*3:m,nv=(nose&&z===z1)||(options.rearOpenings&&z===z0)?40:14,p=[],uv=[],idx=[];
  const point=(u,v)=>{const q=u*2-1,t=Math.abs(q),topY=topProfile(a,t),x=q*(a.w-sideInset*Math.sin((1-v)*PI/2)),y=lerp(a.b,topY,v);return[x,y,mappedZ(x,y,z)];};
  for(let u=0;u<=nu;u++)for(let v=0;v<=nv;v++){p.push(...point(u/nu,v/nv));uv.push(u/nu,v/nv);}
  for(let u=0;u<nu;u++)for(let v=0;v<nv;v++){const [x,y]=point((u+.5)/nu,(v+.5)/nv);const hole=((nose&&z===z1?nose.openings:z===z0?options.rearOpenings:[])||[]).some(h=>h.type==='polygon'?inside(x,y,h.points):h.type==='ellipse'?((x-h.x)/h.rx)**2+((y-h.y)/h.ry)**2<1:Math.abs(x-h.x)<h.rx&&Math.abs(y-h.y)<h.ry);if(hole)continue;const i=u*(nv+1)+v,k=i+nv+1;if(flip)idx.push(i,i+1,k,k,i+1,k+1);else idx.push(i,k,i+1,k,k+1,i+1);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();mesh(parent,g,material,'body_end');
 }
 if(options.underbody!==false)box(parent,options.underMaterial||material,[Math.max(...stations.map(s=>s.w))*1.74,.035,(z1-z0)*.83],[0,Math.min(...stations.map(s=>s.b))+.025,(z0+z1)/2],undefined,'flat_undertray');
 // A narrow rolled lip traces each arch; visible dark wheel-well lining has depth.
 for(const w of options.wheelArches||[])for(const side of [-1,1]){const pts=[];for(let k=0;k<=32;k++){const theta=Math.PI*k/32,z=w.z+w.r*Math.cos(theta),a=sample(Math.min(z1,Math.max(z0,z)));pts.push([side*(w.x||a.w),w.y+w.r*Math.sin(theta),z]);}tube(parent,material,pts,.016,false,48,'rolled_wheel_arch');if(options.wellMaterial)surface(parent,options.wellMaterial,40,4,(u,v)=>{const theta=Math.PI*u,z=w.z+w.r*Math.cos(theta),a=sample(Math.min(z1,Math.max(z0,z)));return[side*((w.x||a.w)-v*.20),w.y+(w.r-.018)*Math.sin(theta),z];},'wheel_well',side>0);}
 // Smooth the genuine shared shell boundaries without rounding aperture edges.
 if(options.smoothSeams){const groups=new Map(),parts=parent.children.slice(before).filter(n=>n.isMesh&&/^body_/.test(n.name));for(const part of parts){const p=part.geometry.attributes.position,n=part.geometry.attributes.normal;for(let i=0;i<p.count;i++){const key=[p.getX(i),p.getY(i),p.getZ(i)].map(x=>Math.round(x*1e5)).join(',');if(!groups.has(key))groups.set(key,[]);groups.get(key).push([n,i]);}}for(const items of groups.values()){if(items.length<2)continue;const norm=new T.Vector3();for(const[a,i]of items)norm.add(new T.Vector3(a.getX(i),a.getY(i),a.getZ(i)));norm.normalize();for(const[a,i]of items)a.setXYZ(i,norm.x,norm.y,norm.z);}}
 return{top,sample,frontZ,rearZ,topY:(x,z)=>topProfile(sample(z),Math.min(1,Math.abs(x)/sample(z).w))};
}

// Factory wheel geometry: twelve rounded ventilation openings and a broad hub.
const rig=wheelRig(root,m,{wheelbase:2.76,track:1.51,radius:.377,width:.245,zOffset:.045,spokes:0,rimRadius:.242});
for(const wheel of Object.values(rig.wheels)){
 for(const child of [...wheel.children]){if(child.name==='wheel_bolt'||child.name==='wheel_hub'){wheel.remove(child);child.geometry.dispose();}else if(child.name==='brake_disc')child.position.x*=.58;}
 for(const sign of[wheel.name.endsWith('L')?1:-1]){
  const ax=sign*rig.width*.46,holes=[];
  for(let i=0;i<12;i++){const a=i*PI/6,local=rounded([[-.015,.102],[-.030,.157],[-.025,.219],[0,.231],[.025,.219],[.030,.157],[.015,.102]],.012,5);holes.push(local.map(([x,y])=>[x*Math.cos(a)-y*Math.sin(a),x*Math.sin(a)+y*Math.cos(a)]));}
  panel(wheel,m.rim,circle(0,0,.244,.244,72),holes,(y,z)=>[ax+sign*(.040*(Math.hypot(y,z)/.244)**1.65-.028),y,z],'touring_cast_alloy_face',[sign,0,0],.055);
  for(const hole of holes){const hc=hole.reduce((a,v)=>[a[0]+v[0]/hole.length,a[1]+v[1]/hole.length],[0,0]);for(let i=0;i<hole.length;i++){const j=(i+1)%hole.length;surface(wheel,m.rim,1,4,(u,v)=>{const p=hole[i].map((n,k)=>lerp(n,hole[j][k],u)),q=p.map((n,k)=>lerp(n,hc[k],.10*Math.sin(v*PI/2))),r=Math.hypot(...p),x=ax+sign*(.040*(r/.244)**1.65-.028-.028*v);return[x,q[0],q[1]];},'alloy_opening_rounded_depth',sign<0);}}
  cylinder(wheel,m.rim,.078,.026,[ax+sign*.013,0,0],[0,0,PI/2],48,'factory_large_hub');
  cylinder(wheel,chrome,.041,.030,[ax+sign*.018,0,0],[0,0,PI/2],40,'factory_hub_cap');
  for(let i=0;i<6;i++){const a=i*PI/3;cylinder(wheel,m.darkMetal,.0125,.032,[ax+sign*.02,.061*Math.cos(a),.061*Math.sin(a)],[0,0,PI/2],8,'six_lug_recess');cylinder(wheel,chrome,.008,.036,[ax+sign*.024,.061*Math.cos(a),.061*Math.sin(a)],[0,0,PI/2],6,'six_lug_nut');}
 }
}
const frontWheel=rig.centers.FL[2],rearWheel=rig.centers.RL[2],archR=.438;
const grilleOuter=rounded([[-.485,1.052],[.485,1.052],[.393,.735],[-.393,.735]],.025),grilleHole=rounded([[-.451,1.025],[.451,1.025],[.367,.759],[-.367,.759]],.018);
const lampPositive=rounded([[.514,1.042],[.879,1.008],[.895,.927],[.850,.810],[.405,.775]],.033,9);
const headlightOutlines=[lampPositive,lampPositive.map(([x,y])=>[-x,y])];
// The body carries a soft shoulder and a visibly convex bonnet. The nose wraps
// around both fenders; the lamp recesses are actual openings in this shell.
const body=bodyLoft(root,m.paint,[
 {z:-2.285,w:.786,c:1.166,s:1.175,b:.350},{z:-2.16,w:.863,c:1.175,s:1.179,b:.330},
 {z:-1.335,w:.885,c:1.178,s:1.176,b:.322},{z:-.45,w:.876,c:1.178,s:1.174,b:.320},
 {z:.75,w:.878,c:1.171,s:1.168,b:.320},{z:1.12,w:.887,c:1.155,s:1.153,b:.330},
 {z:1.425,w:.897,c:1.145,s:1.134,b:.350},{z:1.88,w:.887,c:1.095,s:1.085,b:.365},
 {z:2.235,w:.890,c:1.052,s:1.052,b:.388}
],{wheelArches:[{z:frontWheel,y:.377,r:archR},{z:rearWheel,y:.377,r:archR}],wellMaterial:rubber,underMaterial:rubber,segments:172,crossSegments:42,edgeDrop:.055,sideInset:.035,roundedShoulders:true,doorBulge:.013,smoothSeams:true,nose:{from:1.75,round:.235,bottomInset:.04,topInset:.062,openings:[{type:'polygon',points:grilleOuter},...headlightOutlines.map(points=>({type:'polygon',points}))]},tail:{from:-2.04,round:.12,bottomInset:.012,topInset:.008},rearOpenings:[{type:'polygon',points:[[-.765,.525],[.765,.525],[.765,1.195],[-.765,1.195]]}]});
const face=(x,y,offset=0)=>[x,y,body.frontZ(x,y)+offset];
const sideX=(z,y)=>{const a=body.sample(clamp(z,-2.285,2.235)),t=clamp((a.s-.055-y)/(a.s-.055-a.b),0,1);return a.w-.035*Math.sin(t*PI/2)+.013*Math.sin(t*PI);};
// Cowl/windscreen/roof form one lowered, raked cabin volume. A single stamped
// side shell surrounds three genuinely rounded window apertures.
const roofY=(z,x)=>1.811+.010*Math.sin(clamp((z+2.14)/2.55,0,1)*PI)-.038*(Math.abs(x)/.756)**4-.025*Math.exp(-(((z+2.14)/.12)**2));
const roofPerimeter=rounded([[-.630,-2.14],[.630,-2.14],[.756,-2.02],[.756,.41],[-.756,.41],[-.756,-2.02]],.047,10);
panel(root,m.paint,roofPerimeter,[],(x,z)=>[x,roofY(z,x),z],'rounded_closed_roof_upper',[0,1,0],.08);
for(let i=0;i<roofPerimeter.length;i++){const j=(i+1)%roofPerimeter.length;surface(root,m.paint,1,6,(u,v)=>{const x=lerp(roofPerimeter[i][0],roofPerimeter[j][0],u),z=lerp(roofPerimeter[i][1],roofPerimeter[j][1],u);return[x*(1-.008*Math.sin(v*PI/2)),roofY(z,x)-.027*v,z+.004*v];},'moulded_roof_edge_return');}
const cabinX=(z,y)=>{const t=clamp((y-1.125)/.65,0,1),rear=clamp((-z-1.94)/.35,0,1);return .885-.112*t-.022*t*t-.045*rear*rear;};
const sideOuter=rounded([[1.065,1.12],[.494,1.715],[.365,1.773],[-1.94,1.77],[-2.10,1.707],[-2.245,1.18],[-2.22,1.12]],.065,8);
const frontGlass=rounded([[.942,1.164],[.436,1.683],[.295,1.711],[-.142,1.708],[-.178,1.158]],.039,8);
const passengerGlass=rounded([[-.264,1.158],[-.237,1.709],[-1.205,1.702],[-1.283,1.158]],.037,8);
const quarterGlass=rounded([[-1.365,1.681],[-1.902,1.672],[-2.028,1.607],[-2.081,1.253],[-2.035,1.190],[-1.441,1.186]],.060,8);
const sideHoles=[frontGlass,passengerGlass,quarterGlass];
for(const side of[-1,1]){
 const map=(z,y,o=0)=>[side*(cabinX(z,y)+o),y,z];
 panel(root,m.paint,sideOuter,sideHoles,(z,y)=>map(z,y),'stamped_cabin_side',[side,0,0]);
 for(const [i,glass]of sideHoles.entries()){
  panel(root,m.glass,glass,[],(z,y)=>map(z,y,.0015),'rounded_side_glass_'+i,[side,0,0],.085);
  outline(root,rubber,glass.map(([z,y])=>map(z,y,.004)),.0045,'flush_window_seal');
 }
 // Thin rain guards follow each door's rounded upper edge, and stop at C pillar.
 for(const [z0,z1]of[[.51,-.155],[-.25,-1.22]])strip(root,rubber,[[side*.780,1.714,z0],[side*.794,1.734,z0-.13],[side*.794,1.730,z1+.12],[side*.798,1.700,z1]],.008,'smoked_door_rain_visor');
 // Shoulder seams sit on the panels, without external tubular A-pillar hoops.
 strip(root,rubber,[[side*.885,1.12,1.075],[side*.883,1.12,.30],[side*.883,1.12,-1.35],[side*.851,1.12,-2.16]],.0055,'lower_window_belt_seam');
 strip(root,chrome,[[side*.890,1.106,.99],[side*.887,1.106,-1.33]],.0025,'beltline_chrome_edge');
 for(const gap of[[[1.06,1.116],[1.015,.89],[.999,.43],[.84,.360],[-.16,.360],[-.22,.94],[-.205,1.12]],[[-.205,1.12],[-.22,.94],[-.16,.360],[-.96,.360],[-1.26,.54],[-1.34,.84],[-1.33,1.12]]]){
  const pts=gap.map(([z,y])=>[side*(sideX(z,y)+.003),y,z]);strip(root,rubber,pts,.0035,'door_skin_gap');
 }
 for(const z of[.005,-1.135]){
  roundedPanel(root,rubber,.145,.060,[side*(sideX(z,1.035)+.005),1.035,z],{radius:.015,rotation:[0,side*PI/2,0],depth:.004,name:'door_handle_recess'});
  roundedPanel(root,chrome,.116,.036,[side*(sideX(z,1.044)+.014),1.044,z+.006],{radius:.011,rotation:[0,side*PI/2,0],depth:.007,name:'small_chrome_handle'});
 }
 // The Grand Touring flare is a broad convex moulding, not a narrow ring.
 for(const cz of[frontWheel,rearWheel]){
  surface(root,cladding,92,14,(u,v)=>{const a=lerp(-.20,PI+.20,u),r=lerp(archR+.002,archR+.092,v),z=cz+r*Math.cos(a),y=.377+r*Math.sin(a),bulge=.017+.062*Math.sin(v*PI);return[side*(sideX(z,y)+bulge),y,z];},'convex_touring_fender_flare',side<0);
  const inner=Array.from({length:61},(_,i)=>{const a=lerp(-.18,PI+.18,i/60),z=cz+(archR+.001)*Math.cos(a),y=.377+(archR+.001)*Math.sin(a);return[side*(sideX(z,y)+.016),y,z];});outline(root,rubber,inner,.008,'flare_inner_return',false);
 }
 const sideMould=rounded([[.978,.705],[.927,.741],[-.857,.731],[-.962,.684],[-.919,.641],[.928,.649]],.024,6);
 panel(root,cladding,sideMould,[],(z,y)=>[side*(sideX(z,y)+.020+.012*Math.sin((y-.64)/.10*PI)),y,z],'connecting_side_moulding',[side,0,0],.10);
 strip(root,rubber,[[side*.892,.612,.92],[side*.890,.603,-.86]],.011,'body_side_rub_strip');
 // Low rounded rocker and a slim chrome tubular step, just outside the body.
 const rocker=rounded([[.97,.410],[-.91,.410],[-.99,.355],[.94,.355]],.025);
 panel(root,cladding,rocker,[],(z,y)=>[side*(sideX(z,y)+.008),y,z],'moulded_lower_sill',[side,0,0]);
 strip(root,chrome,[[side*.875,.306,1.015],[side*.956,.296,.91],[side*.966,.296,-.87],[side*.899,.321,-1.02]],.026,'touring_tubular_step');
 roundedPanel(root,rubber,1.70,.133,[side*.919,.328,.01],{radius:.035,rotation:[-PI/2,0,PI/2],depth:.010,name:'step_rubber_pad'});
 for(let i=0;i<12;i++)box(root,m.darkMetal,[.126,.004,.018],[side*.921,.344,-.75+i*.136],undefined,'non_slip_step_rib');
 // Rounded rectangular chrome mirror, with a black lower foot.
 strip(root,rubber,[[side*.855,1.183,.885],[side*.969,1.215,.862]],.032,'mirror_support');
 roundedPanel(root,rubber,.244,.145,[side*1.012,1.258,.869],{radius:.048,depth:.080,name:'mirror_lower_shell'});
 roundedPanel(root,chrome,.240,.103,[side*1.012,1.287,.884],{radius:.044,depth:.073,name:'mirror_chrome_upper_cap'});
 roundedPanel(root,m.glass,.208,.104,[side*1.012,1.267,.861],{radius:.036,rotation:[0,PI,0],depth:.005,name:'mirror_face'});
 // Low roof rails and transverse bars conform to the rounded roof.
 strip(root,rubber,[[side*.627,1.793,.325],[side*.640,1.836,.19],[side*.640,1.839,-1.79],[side*.625,1.791,-1.96]],.012,'low_roof_rail');
 for(const z of[.12,-.87,-1.78])roundedPanel(root,rubber,.095,.035,[side*.639,1.804,z],{radius:.013,rotation:[0,side*PI/2,0],depth:.060,name:'low_roof_rail_mount'});
 strip(root,m.darkMetal,[[side*.659,1.834,-.20],[0,1.850,-.20]],.013,'roof_crossbar_front');
 strip(root,m.darkMetal,[[side*.659,1.833,-1.49],[0,1.849,-1.49]],.013,'roof_crossbar_rear');
 // Bonnet seams trace the actual curved top. Tiny badging does not alter paint.
 const hood=[];for(let i=0;i<=40;i++){const z=lerp(1.085,2.208,i/40),a=body.sample(z),x=side*lerp(.639,.615,i/40),q=Math.abs(x)/a.w,y=body.topY(x,z);hood.push([x,y+.002,z]);}outline(root,rubber,hood,.0034,'soft_bonnet_shutline',false);
}

// Bowed windscreen: inclined further rearward at the roof, broad at its base.
const windOutline=rounded([[-.813,0],[.813,0],[.723,1],[-.723,1]],.048,8);
const windMap=(x,v,off=0)=>{const half=lerp(.813,.723,v),q=x/half;return[x,lerp(1.144,1.738,v)+.019*(1-q*q),lerp(1.075,.426,v)+.032*(1-q*q)+off];};
panel(root,m.glass,windOutline,[],(x,v)=>windMap(x,v),'large_bowed_windscreen',[0,.5,1],.075);
outline(root,rubber,windOutline.map(([x,v])=>windMap(x,v,.003)),.012,'windscreen_bonded_seal');
for(const side of[-1,1])surface(root,m.paint,36,9,(u,v)=>{const p=windMap(side*lerp(.813,.723,u),u),q=[side*cabinX(lerp(1.065,.42,u),lerp(1.12,1.773,u)),lerp(1.12,1.773,u),lerp(1.065,.42,u)];return p.map((n,i)=>lerp(n,q[i],v));},'integrated_A_pillar',side<0);
surface(root,m.paint,32,8,(u,v)=>{const q=2*u-1,x=q*lerp(.723,.768,v);return[x,lerp(1.738+.019*(1-q*q),roofY(.42,x),v),.426-v*.006];},'rounded_windscreen_header');
// Cowl dark strip and wipers sit below the screen instead of across the bonnet.
panel(root,rubber,rounded([[-.78,1.132],[.78,1.132],[.74,1.171],[-.74,1.171]],.012),[],(x,y)=>[x,y,1.081],'windscreen_cowl',[0,.5,1]);
for(const side of[-1,1]){strip(root,rubber,[[side*.13,1.165,1.088],[side*.38,1.172,1.066],[side*.62,1.183,1.041]],.007,'front_wiper');strip(root,rubber,[[side*.29,1.163,1.083],[side*.61,1.183,1.042]],.011,'wiper_blade');}

// Large swept lamps and a flush trapezoidal grille are the principal identity.
panel(root,chrome,grilleOuter,[grilleHole],(x,y)=>face(x,y,.006),'flush_chrome_grille_frame');
panel(root,rubber,grilleHole,[],(x,y)=>face(x,y,-.044),'recessed_grille_black');
for(let i=-4;i<=4;i++){
 const x=i*.095,wide=Math.abs(i)===3,half=wide?.036:.009,bottom=x*(wide?.88:.96);
 const upper=rounded([[x-half,1.015],[x+half,1.015],[bottom+half*.87,.918],[bottom-half*.87,.918]],.004,2);
 panel(root,chrome,upper,[],(xx,y)=>face(xx,y,.012),'diagonal_upper_grille_slat');
 const lh=wide?.028:.007;
 const lower=rounded([[x-lh,.843],[x+lh,.843],[x*.89+lh,.766],[x*.89-lh,.766]],.003,2);
 panel(root,chrome,lower,[],(xx,y)=>face(xx,y,.006),'slim_lower_grille_slat');
}
panel(root,chrome,rounded([[-.443,.907],[.443,.907],[.421,.851],[-.421,.851]],.008),[],(x,y)=>face(x,y,.021),'wide_chrome_grille_crossbar');
panel(root,rubber,rounded([[-.151,.899],[.151,.899],[.151,.849],[-.151,.849]],.008),[],(x,y)=>face(x,y,.029),'isuzu_badge_black_ground');
const glyphs={I:[[[0,1],[1,1]],[[.5,1],[.5,0]],[[0,0],[1,0]]],S:[[[1,1],[.1,1],[0,.57],[1,.43],[.9,0],[0,0]]],U:[[[0,1],[0,.14],[.15,0],[.85,0],[1,.14],[1,1]]],Z:[[[0,1],[1,1],[0,0],[1,0]]],V:[[[0,1],[.5,0],[1,1]]],'-':[[[0,.5],[1,.5]]],'1':[[[.15,.8],[.5,1],[.5,0]],[[.15,0],[.85,0]]],'6':[[[1,1],[.15,1],[0,.55],[0,0],[1,0],[1,.5],[0,.5]]]};
function letters(text,material,x,y,h,advance,project){for(let i=0;i<text.length;i++)for(const stroke of glyphs[text[i]]||[])outline(root,material,stroke.map(([a,b])=>project(x+i*advance+a*advance*.72,y+b*h)),h*.048,'badge_letter',false);}
letters('ISUZU',chrome,-.136,.856,.034,.056,(x,y)=>face(x,y,.038));
const headlightPositions=[];
for(const side of[-1,1]){
 const outer=lampPositive.map(([x,y])=>[x*side,y]),cx=side*.678;
 panel(root,rubber,outer,[],(x,y)=>face(x,y,-.065),'swept_lamp_housing');
 const inner=outer.map(([x,y])=>[cx+(x-cx)*.945,.909+(y-.909)*.91]);
 panel(root,reflectorShade,inner,[],(x,y)=>face(x,y,-.055),'lamp_reflector_backing');
 outline(root,chrome,outer.map(([x,y])=>face(x,y,.008)),.007,'headlight_trim_seal');
 // Concave reflector bowls follow the curved nose and remain visible through
 // the separate clear lens. Bright centres are intentionally small.
 for(const [xx,yy,r]of[[.713,.917,.092],[.518,.851,.054],[.850,.930,.030]]){
  surface(root,reflector,48,16,(u,v)=>{const a=u*PI*2,rr=lerp(.008,r,v),x=side*(xx+rr*Math.cos(a)),y=yy+rr*Math.sin(a);return face(x,y,.005-.043*(1-v)**1.6);},'faceted_headlight_reflector',side>0);
  panel(root,m.front,circle(side*xx,yy,r*.23,r*.23,24),[],(x,y)=>face(x,y,.010),'small_headlight_bulb');
  for(let i=0;i<10;i++){const a=i*2*PI/10;const points=[.20,.70,.95].map(t=>face(side*(xx+r*t*Math.cos(a)),yy+r*t*Math.sin(a),.005-.043*(1-t)**1.6));outline(root,reflectorShade,points,.0015,'reflector_radial_facet',false);}
 }
 panel(root,lens,inner,[],(x,y)=>face(x,y,.016),'clear_swept_lamp_lens');
 panel(root,m.amber,circle(side*.858,.918,.017,.030,24),[],(x,y)=>face(x,y,.018),'tiny_amber_indicator_bulb');
 headlightPositions.push(face(side*.713,.917,.018));
}

// Moulded front bumper with a black upper body and diagonally framed fog lamps.
const bumperHoles=[{type:'polygon',points:rounded([[-.32,.40],[.32,.40],[.35,.625],[-.35,.625]],.04)},...[-1,1].map(side=>({type:'ellipse',x:side*.669,y:.535,rx:.091,ry:.091}))];
const bumper=bodyLoft(root,m.paint,[{z:1.897,w:.817,c:.727,s:.706,b:.326},{z:2.168,w:.914,c:.735,s:.722,b:.326},{z:2.325,w:.915,c:.710,s:.686,b:.350}],{segments:34,crossSegments:42,edgeDrop:.042,sideInset:.036,roundedShoulders:true,smoothSeams:true,underbody:false,nose:{from:1.95,round:.225,topInset:.016,bottomInset:.033,openings:bumperHoles}});
const bumperFace=(x,y,o=0)=>[x,y,bumper.frontZ(x,y)+o];
const greyBumperStrip=rounded([[-.875,.397],[-.35,.381],[.35,.381],[.875,.397],[.875,.441],[.35,.426],[-.35,.426],[-.875,.441]],.02);
panel(root,cladding,greyBumperStrip,[],(x,y)=>bumperFace(x,y,.007),'moulded_silver_lower_bumper');
panel(root,rubber,rounded([[-.34,.425],[.34,.425],[.35,.621],[-.35,.621]],.04),[],(x,y)=>bumperFace(x,y,-.035),'recessed_number_plate_air_opening');
for(const side of[-1,1]){
 const frame=rounded([[side*.486,.422],[side*.485,.494],[side*.555,.676],[side*.731,.682],[side*.875,.426]],.035,8),hole=circle(side*.669,.535,.092,.092,56);
 panel(root,cladding,frame,[hole],(x,y)=>bumperFace(x,y,.014),'diagonal_foglight_surround');
 panel(root,rubber,hole,[],(x,y)=>bumperFace(x,y,-.040),'foglamp_recess');
 const ringOuter=circle(side*.669,.535,.076,.076,56),ringInner=circle(side*.669,.535,.064,.064,56);
 panel(root,chrome,ringOuter,[ringInner],(x,y)=>bumperFace(x,y,.005),'foglight_chrome_ring');
 surface(root,reflector,40,14,(u,v)=>{const a=u*PI*2,r=lerp(.006,.062,v),x=side*.669+r*Math.cos(a),y=.535+r*Math.sin(a);return bumperFace(x,y,.002-.026*(1-v)**1.5);},'foglamp_reflector',true);
 panel(root,m.front,circle(side*.669,.535,.024,.024,32),[],(x,y)=>bumperFace(x,y,.007),'foglight_bulb');
 panel(root,lens,ringInner,[],(x,y)=>bumperFace(x,y,.011),'foglamp_clear_lens');
}
const plateOutline=rounded([[-.186,.438],[.186,.438],[.186,.618],[-.186,.618]],.008);
panel(root,rubber,plateOutline,[],(x,y)=>bumperFace(x,y,.022),'front_registration_frame');
panel(root,plate,plateOutline.map(([x,y])=>[x*.94,.528+(y-.528)*.91]),[],(x,y)=>bumperFace(x,y,.027),'front_registration_plate');
letters('UV-16',rubber,-.149,.488,.071,.060,(x,y)=>bumperFace(x,y,.030));
// Four-photo rear rebuild: inset rear glass, a rounded visor, clear-over-red
// wraparound lamps and a genuinely recessed, sculpted registration pocket.
const rearOutline=rounded([[-.788,1.171],[.788,1.171],[.750,1.708],[.659,1.755],[-.659,1.755],[-.750,1.708]],.060),rearHole=rounded([[-.662,1.225],[.662,1.225],[.613,1.665],[-.613,1.665]],.066,10);
const back=(x,y,o=0)=>[x,y,-2.282+.15*((y-1.12)/.65)+.09*(Math.abs(x)/.79)**4+o];
panel(root,m.paint,rearOutline,[rearHole],(x,y)=>back(x,y),'rounded_rear_cabin_frame',[0,0,-1]);
panel(root,m.glass,rearHole,[],(x,y)=>back(x,y,-.003),'tailgate_tinted_glass',[0,0,-1]);
outline(root,rubber,rearHole.map(([x,y])=>back(x,y,-.005)),.014,'rear_glass_bonded_seal');
// A dark ceramic upper border and horizontal demister strips stay on the glass.
panel(root,rubber,rounded([[-.608,1.627],[.608,1.627],[.595,1.663],[-.595,1.663]],.014),[],(x,y)=>back(x,y,-.004),'rear_glass_ceramic_upper_border',[0,0,-1]);
for(let i=0;i<6;i++){const y=1.286+i*.051,half=lerp(.641,.610,(y-1.225)/.440);outline(root,m.darkMetal,[back(-half,y,-.006),back(half,y,-.006)],.0008,'rear_window_demister',false);}
for(const side of[-1,1])surface(root,m.paint,26,14,(u,v)=>{const y=lerp(1.125,1.767,u),a=back(side*lerp(.788,.72,u),y),b=[side*cabinX(lerp(-2.22,-2.03,u),y),y,lerp(-2.22,-2.03,u)];return a.map((n,i)=>lerp(n,b[i],v));},'rounded_rear_pillar_corner',side<0);
// Body-colour visor projects only a little behind the glass. Ends roll down;
// its section is closed and rounded, not a floating racing wing.
const visorPath=rounded([[-.722,1.800],[.722,1.800],[.753,1.774],[.744,1.728],[.711,1.734],[.683,1.766],[-.683,1.766],[-.711,1.734],[-.744,1.728],[-.753,1.774]],.016,7);
shape(root,m.paint,visorPath,{position:[0,0,-2.251],depth:.151,bevel:.010,name:'closed_moulded_rear_visor'});
const tailOuter=rounded([[-.763,1.187],[.763,1.187],[.770,.725],[.734,.586],[.657,.551],[-.657,.551],[-.734,.586],[-.770,.725]],.045,8);
const pocketOuter=rounded([[-.355,.713],[.355,.713],[.355,1.035],[.294,1.074],[-.294,1.074],[-.355,1.035]],.021,6);
const tailBack=(x,y,o=0)=>[x,y,-2.285+.070*(Math.abs(x)/.77)**4-.031*Math.exp(-(((y-.626)/.138)**2))+.012*clamp((y-1.10)/.09,0,1)+o];
panel(root,m.paint,tailOuter,[pocketOuter],(x,y)=>tailBack(x,y),'sculpted_tailgate_skin',[0,0,-1],.075);
outline(root,rubber,tailOuter.map(([x,y])=>tailBack(x,y,-.002)),.0036,'continuous_tailgate_gap');
// Recess has sloping black sides and a set-back black floor. No underlying body
// face remains behind it, so its depth is visible from a rear three-quarter view.
const pocketInner=pocketOuter.map(([x,y])=>[x*.89,.88+(y-.88)*.88]);
for(let i=0;i<pocketOuter.length;i++){const j=(i+1)%pocketOuter.length;surface(root,rubber,1,4,(u,v)=>{const a=pocketOuter[i].map((n,k)=>lerp(n,pocketOuter[j][k],u)),b=pocketInner[i].map((n,k)=>lerp(n,pocketInner[j][k],u)),xy=a.map((n,k)=>lerp(n,b[k],v));return[xy[0],xy[1],lerp(tailBack(a[0],a[1])[2]-.002,-2.224,v)];},'deep_plate_recess_sidewall',true);}
panel(root,rubber,pocketInner,[],(x,y)=>[x,y,-2.224],'deep_black_plate_recess',[0,0,-1],.08);
// Angular wings flank a chrome garnish; the ISUZU plaque is centred above plate.
const garnishWings=rounded([[-.555,1.066],[-.454,1.111],[.454,1.111],[.555,1.066],[.359,1.030],[.294,1.064],[-.294,1.064],[-.359,1.030]],.010,4);
panel(root,rubber,garnishWings,[],(x,y)=>tailBack(x,y,-.008),'tailgate_angular_black_garnish',[0,0,-1],.09);
const chromeGarnish=rounded([[-.348,1.027],[-.294,1.075],[-.112,1.075],[-.101,1.052],[.101,1.052],[.112,1.075],[.294,1.075],[.348,1.027],[.292,1.020],[-.292,1.020]],.007,4);
panel(root,chrome,chromeGarnish,[],(x,y)=>tailBack(x,y,-.018),'tailgate_isuzu_chrome_garnish',[0,0,-1],.07);
panel(root,rubber,rounded([[-.115,1.043],[.115,1.043],[.115,1.081],[-.115,1.081]],.006),[],(x,y)=>tailBack(x,y,-.019),'rear_isuzu_plaque',[0,0,-1]);
letters('ISUZU',chrome,-.104,1.049,.023,.043,(x,y)=>tailBack(-x,y,-.023));
const rearPlate=rounded([[-.274,.782],[.274,.782],[.274,.996],[-.274,.996]],.011,7);
panel(root,m.darkMetal,rearPlate,[],(x,y)=>[x,y,-2.240],'rear_registration_frame',[0,0,-1]);
panel(root,plate,rearPlate.map(([x,y])=>[x*.95,.889+(y-.889)*.89]),[],(x,y)=>[x,y,-2.244],'rear_registration_plate',[0,0,-1]);
letters('UV-16',rubber,-.207,.846,.091,.083,(x,y)=>[-x,y,-2.247]);
for(const x of[-.249,.249])for(const y of[.798,.980])panel(root,chrome,circle(x,y,.006,.006,12),[],(xx,yy)=>[xx,yy,-2.248],'plate_mount_screw',[0,0,-1]);
// Recessed left handle and restrained raised chrome model lettering.
const latchOuter=rounded([[-.675,.887],[-.468,.887],[-.468,.968],[-.675,.968]],.025,8);
panel(root,cladding,latchOuter,[],(x,y)=>tailBack(-x,y,-.008),'rear_latch_moulded_surround',[0,0,-1]);
panel(root,rubber,latchOuter.map(([x,y])=>[-.571+(x+.571)*.85,.927+(y-.927)*.65]),[],(x,y)=>tailBack(-x,y,-.011),'left_recessed_tailgate_latch',[0,0,-1]);
outline(root,chrome,[tailBack(.648,.941,-.016),tailBack(.497,.941,-.016)],.006,'tailgate_latch_pull',false);
Object.assign(glyphs,{P:[[[0,0],[0,1],[1,1],[1,.55],[0,.55]]],A:[[[0,0],[.4,1],[.6,1],[1,0]],[[.19,.44],[.81,.44]]],N:[[[0,0],[0,1],[1,0],[1,1]]],T:[[[0,1],[1,1]],[[.5,1],[.5,0]]],H:[[[0,0],[0,1]],[[1,0],[1,1]],[[0,.5],[1,.5]]],E:[[[1,1],[0,1],[0,0],[1,0]],[[0,.5],[.8,.5]]],R:[[[0,0],[0,1],[1,1],[1,.55],[0,.55]],[[.5,.55],[1,0]]],O:[[[.15,0],[0,.15],[0,.85],[.15,1],[.85,1],[1,.85],[1,.15],[.85,0],[.15,0]]],G:[[[1,.85],[.85,1],[.15,1],[0,.85],[0,.15],[.15,0],[1,0],[1,.5],[.55,.5]]]});
letters('PANTHER',chrome,-.677,1.135,.020,.029,(x,y)=>tailBack(-x,y,-.007));
letters('TOURING',chrome,.472,.654,.023,.031,(x,y)=>tailBack(-x,y,-.007));
const clearRear=mat('panther_clear_tail_reflector',0xcdd7db,.35,.28);
// Wide curved rear lamps wrap from the back onto the outer quarter. The two
// clear upper chambers and red lower chambers follow the supplied rear photo.
for(const side of[-1,1]){
 const lampShape=rounded([[.741,.726],[.852,.741],[.883,.811],[.882,1.154],[.840,1.273],[.770,1.286],[.750,1.248]],.029,9);
 const rearLightMap=(x,y,off=0)=>[side*x,y,-2.285+.033*clamp((y-.74)/.55,0,1)+.155*clamp((x-.743)/.141,0,1)**1.65+off];
 panel(root,rubber,lampShape,[],(x,y)=>rearLightMap(x,y,.050),'rear_wraparound_lamp_housing',[side*.45,0,-1],.055);
 outline(root,rubber,lampShape.map(([x,y])=>rearLightMap(x,y,-.014)),.0035,'rear_lamp_outer_gasket');
 const cells=[{lo:.746,hi:.891,mat:m.rear},{lo:.901,hi:1.047,mat:m.rear},{lo:1.057,hi:1.147,mat:clearRear},{lo:1.157,hi:1.250,mat:clearRear}];
 for(const [idx,c]of cells.entries()){
  const xhi=c.hi>1.16?.848:.866,xlo=c.lo>1.15?.771:.757;
  const aperture=rounded(idx===3?[[.765,c.lo],[.865,c.lo],[.835,c.hi],[.777,c.hi+.010]]:idx===0?[[.767,c.lo],[.847,c.lo+.008],[.867,c.hi],[.757,c.hi]]:[[xlo,c.lo],[xhi,c.lo],[xhi,c.hi],[xlo+.004,c.hi]],.018,7);
  panel(root,c.mat,aperture,[],(x,y)=>rearLightMap(x,y,idx>=2?.024:-.008),'rear_lamp_chamber_'+idx,[side*.5,0,-1],.045);
  for(let j=1;j<5;j++){const y=lerp(c.lo,c.hi,j/5);outline(root,idx<2?m.rear:reflectorShade,[rearLightMap(xlo+.003,y,-.011),rearLightMap(xhi-.003,y,-.011)],.0017,'tail_lens_prism_fluting',false);}
  if(idx>=2){const x=(xlo+xhi)/2,y=(c.lo+c.hi)/2;surface(root,clearRear,36,10,(u,v)=>{const a=2*PI*u,xx=x+Math.cos(a)*.037*v,yy=y+Math.sin(a)*.041*v;return rearLightMap(xx,yy,-.009+.024*(1-v)**1.7);},'rear_clear_reflector_bowl',side<0);panel(root,idx===3?m.amber:reflector,circle(x,y,.009,.013,16),[],(xx,yy)=>rearLightMap(xx,yy,-.013),'rear_clear_chamber_bulb',[side*.4,0,-1]);panel(root,lens,aperture,[],(xx,yy)=>rearLightMap(xx,yy,-.018),'rear_clear_lens_cover',[side*.5,0,-1]);}
 }
}
// Painted shoulder above a black lower bumper, with a broad rear step tread.
const rearBumper=bodyLoft(root,rubber,[{z:-2.367,w:.863,c:.473,s:.465,b:.286},{z:-2.225,w:.924,c:.523,s:.502,b:.303},{z:-1.990,w:.830,c:.536,s:.513,b:.340}],{segments:26,crossSegments:36,edgeDrop:.014,sideInset:.020,smoothSeams:true,underbody:false,tail:{from:-2.01,round:.20,bottomInset:.040,topInset:.024}});
bodyLoft(root,m.paint,[{z:-2.323,w:.861,c:.670,s:.655,b:.496},{z:-2.200,w:.916,c:.715,s:.702,b:.510},{z:-1.940,w:.843,c:.720,s:.702,b:.532}],{segments:30,crossSegments:38,edgeDrop:.035,sideInset:.021,roundedShoulders:true,smoothSeams:true,underbody:false,tail:{from:-1.960,round:.180,bottomInset:.015,topInset:.012},topCutout:(x,z)=>Math.abs(x)<.737&&z<-2.130,rearOpenings:[{type:'polygon',points:[[-.737,.565],[.737,.565],[.737,.760],[-.737,.760]]}]});
for(const side of[-1,1]){
 const r=rounded([[side*.688,.327],[side*.850,.337],[side*.863,.369],[side*.719,.363]],.012,6);
 panel(root,m.rear,r,[],(x,y)=>[x,y,rearBumper.rearZ(x,y)-.008],'red_bumper_corner_reflector',[0,0,-1]);
}
const step=rounded([[-.675,-2.337],[.675,-2.337],[.686,-2.161],[-.686,-2.161]],.030,7);
panel(root,rubber,step,[],(x,z)=>[x,rearBumper.topY(x,z)+.004,z],'wide_rear_bumper_step',[0,1,0],.09);
for(let i=0;i<5;i++){const z=-2.192-i*.027;outline(root,m.darkMetal,[-.633,0,.633].map(x=>[x,rearBumper.topY(x,z)+.008,z]),.0033,'rear_step_tread',false);}
// Pivot is at lower right when viewed from behind; the blade sweeps left.
strip(root,rubber,[back(-.247,1.171,-.020),back(-.205,1.244,-.020),back(-.163,1.273,-.020),back(.390,1.278,-.020)],.008,'rear_wiper_articulated_arm');
strip(root,rubber,[back(-.156,1.274,-.023),back(.153,1.281,-.023),back(.390,1.278,-.023)],.012,'rear_wiper_blade');
sphere(root,rubber,[.015,.021,.010],back(-.247,1.171,-.022),16,'rear_wiper_pivot');
roundedPanel(root,m.rear,.200,.026,[0,1.699,-2.182],{radius:.009,rotation:[0,PI,0],depth:.005,name:'high_brake_light'});
// Conservative passenger cabin and chassis; playable dashboard uses the fitted
// runtime cockpit and does not rely on opaque exterior glass from this asset.
for(const z of[.06,-.81,-1.59])for(const side of[-1,1]){roundedPanel(root,m.seat,.36,.42,[side*.34,1.13,z],{radius:.07,depth:.17,rotation:[.10,0,0],name:'passenger_seat_back'});sphere(root,m.seat,[.151,.106,.084],[side*.34,1.43,z+.02],20,'passenger_headrest');roundedPanel(root,m.seat,.36,.35,[side*.34,.945,z+.16],{radius:.05,depth:.08,rotation:[PI/2,0,0],name:'passenger_cushion'});}
box(root,rubber,[1.43,.135,.28],[0,1.137,.925],undefined,'factory_dashboard_shell');
for(const z of[frontWheel,rearWheel])cylinder(root,m.darkMetal,.042,1.42,[0,.33,z],[0,0,PI/2],24,'axle_crossmember');
cylinder(root,m.darkMetal,.035,.230,[.52,.275,-2.25],[PI/2,0,0],32,'diesel_exhaust');
cylinder(root,rubber,.027,.014,[.52,.275,-2.374],[PI/2,0,0],24,'exhaust_dark_mouth');

const metadata={author:'UVelocity original mesh authoring',source:'scripts/build-panther.cjs',referenceBased:true,officialManufacturerAsset:false,representation:'original-reference-recreation',displayName:'Isuzu Panther Grand Touring',revision:'photo-rebuild-1.3.1',wheelRadius:rig.radius,wheelWidth:rig.width,wheelCenters:rig.centers,headlightPositions,exhaustPositions:[[.52,.275,-2.38]],tail:-2.38,exhaustX:.52,exhaustY:.275,up:'+Y',forward:'+Z',units:'metres',paintMaterials:['paint_body','paint_aero']};
const out=path.resolve(__dirname,'../../work/panther-v131-assets',id+'.glb');
const report=exportGLB(root,out,metadata);
// Explicit lamp lens optics are local to this asset; the shared authoring kit
// and the fifteen other cars are untouched. Cabin glass keeps its own tint.
{
 const glb=fs.readFileSync(out),n=glb.readUInt32LE(12),doc=JSON.parse(glb.subarray(20,20+n).toString()),bin=glb.subarray(20+n+8);
 for(const material of doc.materials)if(material.name==='panther_clear_headlamp_lens'){
  material.pbrMetallicRoughness.baseColorFactor=[.94,.98,1,.14];material.pbrMetallicRoughness.metallicFactor=0;material.pbrMetallicRoughness.roughnessFactor=.045;material.alphaMode='BLEND';material.doubleSided=true;
  material.extensions={KHR_materials_transmission:{transmissionFactor:.93}};doc.extensionsUsed=[...new Set([...(doc.extensionsUsed||[]),'KHR_materials_transmission'])];
 }
 let json=Buffer.from(JSON.stringify(doc));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);const h=Buffer.alloc(20),b=Buffer.alloc(8);h.write('glTF');h.writeUInt32LE(2,4);h.writeUInt32LE(28+json.length+bin.length,8);h.writeUInt32LE(json.length,12);h.write('JSON',16);b.writeUInt32LE(bin.length);b.writeUInt32LE(0x004e4942,4);const result=Buffer.concat([h,json,b,bin]);fs.writeFileSync(out,result);report.bytes=result.length;
}
if(report.bounds.min[1]<-.002||report.bytes>8*1024*1024)throw new Error('Invalid Panther output bounds or size');
fs.writeFileSync(out.replace(/\.glb$/,'.metadata.json'),JSON.stringify({...report,length:report.dimensions[2]},null,2)+'\n');
if(process.argv.includes('--publish')){const target=path.resolve(__dirname,'../public/game/assets/cars',id+'.glb');fs.copyFileSync(out,target);fs.writeFileSync(target.replace(/\.glb$/,'.metadata.json'),JSON.stringify({...report,length:report.dimensions[2],file:'/game/assets/cars/'+id+'.glb'},null,2)+'\n');}
console.log(JSON.stringify({id,bytes:report.bytes,triangles:report.triangles,meshCount:report.meshCount,dimensions:report.dimensions,published:process.argv.includes('--publish'),file:out},null,2));
