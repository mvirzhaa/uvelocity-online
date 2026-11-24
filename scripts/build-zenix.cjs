'use strict';
/** Original UVelocity Toyota Kijang Innova Zenix Hybrid photo-reference model.
 * Independent taller MPV shell, glazing, grille and horizontal rear lights.
 * Uses the supplied white/silver front/rear photographs, 23 November 2026.
 * +Y up / +Z forward, metres. node scripts/build-zenix.cjs --publish
 */
const fs=require('node:fs'),path=require('node:path');
const K=require('./modeling-kit.cjs');
const {THREE:T,createModel,materials,mat,mesh,box,sphere,cylinder,tube,surface,shape,roundedPanel,wheelRig,exportGLB,lerp,interp}=K;
const PI=Math.PI,id='toyota-innova-zenix',clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const provenance='Original UVelocity reference-based reconstruction from two user-supplied Toyota Kijang Innova Zenix Hybrid photographs dated 23 November 2026; not manufacturer CAD or a scan.';
const root=createModel(id,{provenance,reference:'image(20261123-065021).png front three-quarter; image(20261123-065043).png rear three-quarter; white/silver Zenix Hybrid MPV.',revision:'mpv-expansion-1.5.0'});
const m=materials(0xd5d9dd);m.paint.metalness=.40;m.paint.roughness=.25;m.aeroPaint.color.setHex(0xd5d9dd);m.rim.color.setHex(0xb5bcc2);m.rim.metalness=.80;m.rim.roughness=.24;m.red.color.setHex(0x474b4c);m.glass.color.setHex(0x17242b);m.rear.emissiveIntensity=.10;m.amber.emissiveIntensity=.05;m.front.emissiveIntensity=.24;
const rubber=mat('zenix_window_rubber',0x0a0e12,.03,.90),chrome=mat('zenix_chrome',0xc9d2d8,.95,.17),cladding=mat('zenix_moulded_cladding',0x22282c,.12,.47),satin=mat('zenix_satin_graphite',0x4b5259,.54,.32),lampHousing=mat('zenix_lamp_housing',0x111b23,.38,.23),reflector=mat('zenix_lamp_reflector',0xdce6ec,.95,.15),lens=mat('zenix_clear_lens',0xe6f3f9,.02,.05),badgeBlue=mat('zenix_hybrid_badge_blue',0x2572af,.50,.25),stripe=mat('stripe_accent',0x2c3338,.12,.48);

// Rounded 2D stamped outlines, sampled without spline overshoot.
function rounded(points,r=.04,steps=7){const out=[];for(let i=0;i<points.length;i++){const p=points[i],a=points[(i+points.length-1)%points.length],b=points[(i+1)%points.length],da=Math.hypot(a[0]-p[0],a[1]-p[1]),db=Math.hypot(b[0]-p[0],b[1]-p[1]),rr=Math.min(r,da*.38,db*.38),s=[p[0]+(a[0]-p[0])*rr/da,p[1]+(a[1]-p[1])*rr/da],e=[p[0]+(b[0]-p[0])*rr/db,p[1]+(b[1]-p[1])*rr/db];for(let k=0;k<=steps;k++){const q=k/steps;out.push([(1-q)**2*s[0]+2*q*(1-q)*p[0]+q*q*e[0],(1-q)**2*s[1]+2*q*(1-q)*p[1]+q*q*e[1]]);}}return out;}
function circle(cx,cy,rx,ry=rx,n=48){return Array.from({length:n},(_,i)=>{const a=i*PI*2/n;return[cx+Math.cos(a)*rx,cy+Math.sin(a)*ry];});}
function closedPath(points){const s=new T.Shape();s.moveTo(...points[0]);for(let i=1;i<points.length;i++)s.lineTo(...points[i]);s.closePath();return s;}
function inside(x,y,points){let hit=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;}
// Subdivide before mapping so curved lenses, glass and stamped frames carry
// real curvature rather than a few planar triangles over a curved boundary.
function panel(parent,material,outline,holes,map,name,outward=[0,0,1],detail=.11){const s=closedPath(outline);for(const h of holes||[])s.holes.push(closedPath(h));const src=new T.ShapeGeometry(s),ps=src.attributes.position,ix=src.index,verts=[],uv=[],index=[],cache=new Map();function vertex(a){const key=a.map(v=>v.toFixed(6)).join(',');if(cache.has(key))return cache.get(key);const i=verts.length/3;verts.push(...map(a[0],a[1]));uv.push(a[0],a[1]);cache.set(key,i);return i;}function tri(a,b,c,depth=0){const max=Math.max(Math.hypot(a[0]-b[0],a[1]-b[1]),Math.hypot(a[0]-c[0],a[1]-c[1]),Math.hypot(b[0]-c[0],b[1]-c[1]));if(max>detail*1.22&&depth<6){const ab=Math.hypot(a[0]-b[0],a[1]-b[1]),ac=Math.hypot(a[0]-c[0],a[1]-c[1]);if(ab>=max-1e-9){const mid=a.map((v,i)=>(v+b[i])/2);tri(a,mid,c,depth+1);tri(mid,b,c,depth+1);}else if(ac>=max-1e-9){const mid=a.map((v,i)=>(v+c[i])/2);tri(a,b,mid,depth+1);tri(mid,b,c,depth+1);}else{const mid=b.map((v,i)=>(v+c[i])/2);tri(a,b,mid,depth+1);tri(a,mid,c,depth+1);}}else index.push(vertex(a),vertex(b),vertex(c));}for(let i=0;i<ix.count;i+=3){const a=[0,1,2].map(j=>{const k=ix.getX(i+j);return[ps.getX(k),ps.getY(k)];});tri(...a);}const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(verts,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(index);g.computeVertexNormals();const n=g.attributes.normal,mean=new T.Vector3();for(let i=0;i<n.count;i++)mean.add(new T.Vector3(n.getX(i),n.getY(i),n.getZ(i)));if(mean.dot(new T.Vector3(...outward))<0){for(let i=0;i<index.length;i+=3)[index[i+1],index[i+2]]=[index[i+2],index[i+1]];g.setIndex(index);g.computeVertexNormals();}return mesh(parent,g,material,name);}
function outline(parent,material,points,r,name,closed=true){const curve=new T.CurvePath();for(let i=0;i<points.length-(closed?0:1);i++)curve.add(new T.LineCurve3(new T.Vector3(...points[i]),new T.Vector3(...points[(i+1)%points.length])));return mesh(parent,new T.TubeGeometry(curve,Math.max(4,Math.ceil(points.length*.80)),r,5,closed),material,name);}
function strip(parent,material,points,r,name){return tube(parent,material,points,r,false,Math.max(24,points.length*8),name);}

// Local shell profile rounds the shoulder into the vertical door and nose.
// It is intentionally isolated from the shared modelling kit and other cars.
function bodyLoft(parent,material,stations,options={}){
 const before=parent.children.length,n=options.segments||112,m=options.crossSegments||30,z0=stations[0].z,z1=stations.at(-1).z,edgeDrop=options.edgeDrop??.028,sideInset=options.sideInset??.035,nose=options.nose;
 const sample=z=>({w:interp(stations,z,'w'),c:interp(stations,z,'c'),s:interp(stations,z,'s'),b:interp(stations,z,'b')});
 function mappedZ(x,y,z){if(options.tail&&z<options.tail.from){const tail=options.tail,a=sample(z),q=Math.min(1,Math.abs(x)/a.w),v=Math.max(0,Math.min(1,(y-a.b)/(a.c-a.b))),t=Math.max(0,Math.min(1,(tail.from-z)/(tail.from-z0)));return z+t*t*((tail.round||0)*q**3+(tail.bottomInset||0)*(1-v)**2+(tail.topInset||0)*v**4);}if(!nose||z<=nose.from)return z;const a=sample(z),q=Math.min(1,Math.abs(x)/a.w),v=Math.max(0,Math.min(1,(y-a.b)/(a.c-a.b))),t=Math.max(0,Math.min(1,(z-nose.from)/(z1-nose.from)));return z-t*t*((nose.round||0)*q**3+(nose.bottomInset||0)*(1-v)**2+(nose.topInset||0)*v**4);}
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
 return{top,sample,frontZ,rearZ,mappedZ,topY:(x,z)=>topProfile(sample(z),Math.min(1,Math.abs(x)/sample(z).w))};
}

const rig=wheelRig(root,m,{wheelbase:2.85,track:1.60,radius:.365,width:.245,zOffset:.08,spokes:0,rimRadius:.248});
for(const wheel of Object.values(rig.wheels)){
 const sign=wheel.name.endsWith('L')?1:-1,ax=sign*.119;
 for(const child of [...wheel.children])if(child.name==='wheel_bolt'||child.name==='wheel_hub'){wheel.remove(child);child.geometry.dispose();}
 cylinder(wheel,m.rim,.062,.031,[ax,0,0],[0,0,PI/2],32,'zenix_alloy_hub');
 cylinder(wheel,chrome,.033,.037,[ax+sign*.004,0,0],[0,0,PI/2],28,'zenix_silver_hub_cap');
 for(let i=0;i<5;i++)for(const fork of[-1,1]){
  const a=i*PI*2/5+fork*.115,poly=rounded([[-.014,.051],[-.018,.108],[-.012,.236],[.012,.244],[.012,.111],[.006,.051]],.004,3),rotate=([u,v])=>[u*Math.cos(a)-v*Math.sin(a),u*Math.sin(a)+v*Math.cos(a)];
  panel(wheel,m.rim,poly.map(rotate),[],(y,z)=>[ax+sign*(.010+.022*(Math.hypot(y,z)/.248)**1.5),y,z],'zenix_split_spoke_alloy',[sign,0,0],.040);
  outline(wheel,satin,poly.slice(0,3).map(rotate).map(([y,z])=>[ax+sign*(.012+.022*(Math.hypot(y,z)/.248)**1.5),y,z]),.0029,'zenix_spoke_dark_inset',false);
 }
 for(let i=0;i<5;i++){const a=i*2*PI/5;cylinder(wheel,chrome,.009,.040,[ax+sign*.006,.043*Math.cos(a),.043*Math.sin(a)],[0,0,PI/2],6,'zenix_five_lug_nut');}
 for(let i=0;i<48;i++){const a=i*2*PI/48;for(const side of[-1,1])box(wheel,m.darkMetal,[.045,.003,.008],[side*.061,.358*Math.cos(a),.358*Math.sin(a)],[a,0,side*.18],'zenix_road_tyre_channel');}
}
const frontWheel=1.505,rearWheel=-1.345,archR=.424;
const grilleOuter=rounded([[-.602,1.151],[.602,1.151],[.713,.891],[.629,.819],[.460,.790],[-.460,.790],[-.629,.819],[-.713,.891]],.031,7);
const grilleHole=grilleOuter.map(([x,y])=>[x*.938,.972+(y-.972)*.886]);
const lampPositive=rounded([[.603,1.152],[.928,1.166],[.899,1.064],[.821,1.012],[.674,1.024]],.013,6);
const body=bodyLoft(root,m.paint,[
 {z:-2.383,w:.821,c:1.258,s:1.253,b:.360},{z:-2.218,w:.914,c:1.268,s:1.256,b:.337},
 {z:-1.735,w:.936,c:1.275,s:1.264,b:.324},{z:-1.345,w:.941,c:1.273,s:1.260,b:.319},
 {z:-.620,w:.917,c:1.262,s:1.244,b:.318},{z:.35,w:.921,c:1.258,s:1.238,b:.318},
 {z:1.02,w:.934,c:1.248,s:1.220,b:.328},{z:1.505,w:.944,c:1.228,s:1.192,b:.339},
 {z:1.960,w:.938,c:1.197,s:1.185,b:.348},{z:2.393,w:.944,c:1.179,s:1.184,b:.369}
],{wheelArches:[{z:frontWheel,y:.365,r:archR},{z:rearWheel,y:.365,r:archR}],wellMaterial:rubber,underMaterial:rubber,segments:112,crossSegments:28,edgeDrop:.018,sideInset:.037,roundedShoulders:true,doorBulge:.019,smoothSeams:true,nose:{from:1.84,round:.181,bottomInset:.027,topInset:.017,openings:[{type:'polygon',points:[[-1.1,.24],[1.1,.24],[1.1,.891],[-1.1,.891]]},{type:'polygon',points:grilleOuter},...[-1,1].map(s=>({type:'polygon',points:lampPositive.map(([x,y])=>[s*x,y])}))]},tail:{from:-2.10,round:.142,bottomInset:.016,topInset:.014},topCutout:(x,z)=>z<1.09&&z>-2.29&&Math.abs(x)<.80,rearOpenings:[{type:'polygon',points:[[-.77,.58],[.77,.58],[.77,1.283],[-.77,1.283]]}]});
const face=(x,y,o=0)=>[x,y,body.frontZ(x,y)+o];
const sideX=(z,y)=>{const a=body.sample(clamp(z,-2.383,2.393)),t=clamp((a.s-.018-y)/(a.s-.018-a.b),0,1);return a.w-.037*Math.sin(t*PI/2)+.019*Math.sin(t*PI);};

// Taller long-roof MPV silhouette. The continuous glasshouse and thick rear
// pillar are independent Zenix geometry, not a resized CR-V cabin.
const roofY=(z,x)=>{const entry=clamp((z-.06)/.42,0,1)**2;return 1.832+.012*Math.sin(clamp((z+2.08)/2.50,0,1)*PI)-.062*(1-.70*entry)*(Math.abs(x)/.754)**2-.026*clamp((-z-1.74)/.38,0,1)**2-.080*entry;};
const roofOutline=rounded([[-.687,-2.103],[.687,-2.103],[.754,-1.953],[.754,.389],[.699,.473],[-.699,.473],[-.754,.389],[-.754,-1.953]],.047,7);
panel(root,m.paint,roofOutline,[],(x,z)=>[x,roofY(z,x),z],'zenix_long_mpv_roof',[0,1,0],.080);
for(let i=0;i<roofOutline.length;i++){const j=(i+1)%roofOutline.length;surface(root,m.paint,1,4,(u,v)=>{const x=lerp(roofOutline[i][0],roofOutline[j][0],u),z=lerp(roofOutline[i][1],roofOutline[j][1],u);return[x,roofY(z,x)-.027*v,z];},'zenix_rounded_roof_return');}
const cabinX=(z,y)=>{const t=clamp((y-1.220)/.565,0,1),rear=clamp((-z-1.93)/.45,0,1);return .910-.133*t-.023*t*t-.039*rear*rear;};
const sideOuter=rounded([[1.100,1.219],[.483,1.722],[.340,1.776],[-1.900,1.774],[-2.108,1.688],[-2.306,1.313],[-2.292,1.231]],.048,7);
const frontGlass=rounded([[.967,1.263],[.406,1.691],[.276,1.718],[-.230,1.717],[-.243,1.259]],.029,6);
const rearDoorGlass=rounded([[-.320,1.258],[-.315,1.714],[-1.311,1.699],[-1.376,1.260]],.030,6);
const quarterGlass=rounded([[-1.464,1.269],[-1.402,1.695],[-1.854,1.678],[-2.015,1.613],[-2.144,1.367],[-2.061,1.286]],.036,7);
const sideHoles=[frontGlass,rearDoorGlass,quarterGlass];
for(const side of[-1,1]){
 const map=(z,y,o=0)=>[side*(cabinX(z,y)+o),y,z];
 surface(root,m.paint,80,4,(u,v)=>{const z=lerp(-2.290,1.099,u),belt=1.220+.012*clamp((-z-1.70)/.59,0,1),w=body.sample(z).w,p=map(z,belt),q=[side*w,body.topY(w,z),body.mappedZ(w,body.topY(w,z),z)];return p.map((n,i)=>lerp(n,q[i],v)+(i===1?.003*Math.sin(v*PI):0));},'zenix_rolled_window_belt_shoulder',side<0);
 panel(root,m.paint,sideOuter,sideHoles,(z,y)=>map(z,y),'zenix_stamped_glasshouse',[side,0,0],.085);
 for(const [i,g]of sideHoles.entries()){
  panel(root,m.glass,g,[],(z,y)=>map(z,y,.002),'zenix_side_window_'+i,[side,0,0],.078);
  outline(root,rubber,g.map(([z,y])=>map(z,y,.006)),.008,'zenix_black_glazing_seal');
 }
 for(const pillar of[[[-.315,1.250],[-.313,1.730],[-.226,1.730],[-.237,1.250]],[[-1.466,1.257],[-1.399,1.711],[-1.308,1.712],[-1.376,1.254]]])panel(root,rubber,pillar,[],(z,y)=>map(z,y,.006),'zenix_black_B_C_pillar',[side,0,0]);
 // Slender smoked visors over the front and rear doors, as in the reference.
 for(const p of[[[.434,1.714],[.279,1.740],[-.242,1.739]],[[-.314,1.735],[-.900,1.733],[-1.328,1.714]]])outline(root,rubber,p.map(([z,y])=>map(z,y,.012)),.010,'zenix_window_rain_visor',false);
 outline(root,rubber,[[1.09,1.222],[-.42,1.223],[-1.72,1.241],[-2.21,1.260]].map(([z,y])=>map(z,y,.008)),.006,'zenix_window_belt',false);
 // The prominent diagonal rear shoulder and recessed door surfacing are
 // modelled with smooth facets instead of dark painted stripes.
 const doorSculpt=rounded([[1.012,.977],[.714,.827],[-.673,.823],[-.921,.631],[-.890,.530],[.855,.539],[.987,.666]],.055,7);
 panel(root,m.paint,doorSculpt,[],(z,y)=>{const t=clamp((y-.53)/.45,0,1);return[side*(sideX(z,y)+.004+.014*Math.sin(t*PI)),y,z];},'zenix_door_sculpted_recess',[side,0,0],.080);
 const rearFold=[];for(let i=0;i<=27;i++){const z=lerp(-.95,-2.27,i/27),y=lerp(.965,1.219,i/27);rearFold.push([side*(sideX(z,y)+.005),y,z]);}outline(root,m.paint,rearFold,.0056,'zenix_raised_rear_quarter_crease',false);
 const gaps=[[[1.091,1.221],[1.074,1.020],[1.048,.702],[.943,.375],[-.250,.369],[-.279,.930],[-.276,1.224]],[[-.276,1.224],[-.279,.930],[-.250,.369],[-.924,.370],[-.984,.699],[-1.435,.968],[-1.421,1.238]]];
 for(const gap of gaps)outline(root,rubber,gap.map(([z,y])=>[side*(sideX(z,y)+.004),y,z]),.0028,'zenix_four_door_gap',false);
 for(const z of[-.020,-1.150]){
  roundedPanel(root,rubber,.146,.047,[side*(sideX(z,1.174)+.005),1.174,z],{radius:.014,rotation:[0,side*PI/2,0],depth:.004,name:'zenix_handle_recess'});
  roundedPanel(root,chrome,.118,.032,[side*(sideX(z,1.178)+.014),1.178,z+.004],{radius:.012,rotation:[0,side*PI/2,0],depth:.012,name:'zenix_chrome_door_handle'});
 }
 for(const cz of[frontWheel,rearWheel])surface(root,cladding,64,8,(u,v)=>{const a=lerp(-.20,PI+.20,u),r=lerp(archR+.001,archR+.052,v),z=cz+r*Math.cos(a),y=.365+r*Math.sin(a);return[side*(sideX(z,y)+.012+.014*Math.sin(v*PI)),y,z];},'zenix_black_arch_cladding',side<0);
 const sill=rounded([[1.005,.411],[-.857,.412],[-.929,.354],[-.925,.306],[.981,.310]],.023,5);
 panel(root,cladding,sill,[],(z,y)=>[side*(sideX(z,y)+.012),y,z],'zenix_black_lower_sill',[side,0,0]);
 outline(root,stripe,[[side*.924,.409,.955],[side*.924,.409,-.853]],.007,'zenix_sill_custom_accent',false);
 // Broad white mirrors with a black foot and integrated clear indicator.
 strip(root,rubber,[[side*.898,1.301,.904],[side*.974,1.328,.848]],.028,'zenix_mirror_stalk');
 sphere(root,rubber,[.112,.070,.101],[side*.982,1.355,.833],26,'zenix_mirror_lower_shell');
 sphere(root,m.paint,[.114,.056,.102],[side*.982,1.383,.837],26,'zenix_mirror_white_cap');
 roundedPanel(root,m.glass,.191,.088,[side*.982,1.362,.747],{radius:.029,rotation:[0,PI,0],depth:.004,name:'zenix_mirror_glass'});
 outline(root,m.front,[[side*.890,1.360,.900],[side*.986,1.359,.924],[side*1.075,1.354,.883]],.0030,'zenix_mirror_indicator',false);
 // Small hybrid badge aft of the front arch; authored lettering is kept tiny.
 roundedPanel(root,chrome,.073,.019,[side*(sideX(.943,1.143)+.007),1.143,.943],{radius:.004,rotation:[0,side*PI/2,0],depth:.002,name:'zenix_hybrid_fender_badge'});
 for(const line of[.643,.520]){
  const pts=[];for(let i=0;i<=36;i++){const z=lerp(1.105,2.365,i/36),x=side*lerp(line,line-.030,i/36);const y=body.topY(x,z)+.002;pts.push([x,y,body.mappedZ(x,y,z)]);}outline(root,line===.643?rubber:m.paint,pts,line===.643?.0028:.0042,'zenix_bonnet_fold',false);
 }
}
const fuel=rounded([[-1.774,1.145],[-1.510,1.145],[-1.510,.965],[-1.774,.965]],.022,6);
outline(root,rubber,fuel.map(([z,y])=>[sideX(z,y)+.004,y,z]),.0022,'zenix_fuel_flap');
// Broad inclined MPV windscreen and continuous thick A pillars.
const windOutline=rounded([[-.848,0],[.848,0],[.722,1],[-.722,1]],.030,6);
const windMap=(x,v,o=0)=>{const half=lerp(.848,.722,v),q=x/half;return[x,lerp(1.250,1.741,v)+.014*(1-q*q),lerp(1.113,.446,v)+.027*(1-q*q)+o];};
panel(root,m.glass,windOutline,[],(x,v)=>windMap(x,v),'zenix_bowed_mpV_windscreen',[0,.7,1],.075);
outline(root,rubber,windOutline.map(([x,v])=>windMap(x,v,.003)),.010,'zenix_windscreen_seal');
for(const side of[-1,1])surface(root,m.paint,30,7,(u,v)=>{const p=windMap(side*lerp(.848,.722,u),u),y=lerp(1.219,1.770,u),z=lerp(1.10,.340,u),q=[side*cabinX(z,y),y,z];const bow=.014*Math.sin(v*PI)*Math.sin(u*PI);return p.map((n,i)=>lerp(n,q[i],v)+(i===0?side*bow:i===2?bow*.85:bow*.20));},'zenix_sculpted_A_pillar',side<0);
surface(root,m.paint,28,6,(u,v)=>{const t=u*2-1,p=windMap(t*.722,1),x=t*.742,q=[x,roofY(.388,x),.388];return p.map((n,i)=>lerp(n,q[i],v));},'zenix_rounded_windscreen_header');
panel(root,rubber,rounded([[-.808,1.222],[.808,1.222],[.796,1.251],[-.796,1.251]],.011),[],(x,y)=>[x,y,1.123],'zenix_windscreen_cowl',[0,.6,1]);
for(const side of[-1,1]){outline(root,rubber,[[side*.135,1.258,1.124],[side*.349,1.269,1.091],[side*.643,1.274,1.076]],.0047,'zenix_front_wiper_arm',false);outline(root,rubber,[[side*.272,1.269,1.092],[side*.641,1.277,1.073]],.008,'zenix_front_wiper_blade',false);}

// Zenix hexagonal grille: broad, rounded low corners, horizontal small cells.
panel(root,satin,grilleOuter,[grilleHole],(x,y)=>face(x,y,.008),'zenix_large_grille_satin_frame',[0,0,1],.060);
outline(root,chrome,grilleOuter.map(([x,y])=>face(x,y,.012)),.0043,'zenix_grille_bright_edge');
panel(root,rubber,grilleHole,[],(x,y)=>face(x,y,-.046),'zenix_deep_black_grille');
for(let row=0;row<7;row++)for(let col=-6;col<=6;col++){
 const x=col*.102+(row%2)*.051,y=.835+row*.042,poly=[[x-.047,y],[x-.030,y+.019],[x+.030,y+.019],[x+.047,y],[x+.030,y-.019],[x-.030,y-.019]];
 if(poly.every(([xx,yy])=>inside(xx,yy,grilleHole)))outline(root,satin,poly.map(([xx,yy])=>face(xx,yy,-.016)),.0042,'zenix_horizontal_hex_grille_cell');
}
function toyotaBadge(cx,cy,w,h,project,out=[0,0,1]){
 const outer=circle(cx,cy,w/2,h/2,40),inner=circle(cx,cy,w*.43,h*.40,40);
 panel(root,rubber,outer,[],project,'zenix_toyota_emblem_dark',out,.028);
 panel(root,chrome,outer,[inner],project,'zenix_toyota_outer_ellipse',out,.026);
 outline(root,chrome,circle(cx,cy,w*.125,h*.43,32).map(([x,y])=>project(x,y)),w*.028,'zenix_toyota_upright_ellipse');
 const upper=Array.from({length:31},(_,i)=>{const a=lerp(0,PI,i/30);return project(cx+w*.37*Math.cos(a),cy+h*.13-h*.17*Math.sin(a));});
 outline(root,chrome,upper,w*.027,'zenix_toyota_cross_ellipse',false);
}
toyotaBadge(0,1.019,.213,.163,(x,y)=>face(x,y,.025));
const headlightPositions=[];
for(const side of[-1,1]){
 const outer=lampPositive.map(([x,y])=>[side*x,y]);
 panel(root,lampHousing,outer,[],(x,y)=>face(x,y,-.020),'zenix_broad_headlight_housing',[0,0,1],.035);
 outline(root,chrome,outer.map(([x,y])=>face(x,y,.006)),.0037,'zenix_headlamp_bright_edge');
 for(const [xx,yy,w,h]of[[.696,1.081,.037,.055],[.755,1.085,.046,.061],[.818,1.092,.049,.064],[.874,1.108,.027,.045]]){
  const reflectorPoly=rounded([[side*(xx-w/2),yy-h/2],[side*(xx+w/2),yy-h/2],[side*(xx+w/2),yy+h/2],[side*(xx-w/2),yy+h/2]],.008,5);
  panel(root,reflector,reflectorPoly,[],(x,y)=>face(x,y,-.003),'zenix_faceted_LED_reflector',[0,0,1],.025);
  panel(root,m.front,circle(side*xx,yy,.009,.017,18),[],(x,y)=>face(x,y,.007),'zenix_projector_white_core',[0,0,1],.025);
 }
 const led=[[side*.645,1.099],[side*.681,1.045],[side*.819,1.030],[side*.894,1.075]];
 outline(root,m.front,led.map(([x,y])=>face(x,y,.012)),.0047,'zenix_lower_swept_daytime_LED',false);
 panel(root,lens,outer.map(([x,y])=>[side*.777+(x-side*.777)*.97,1.09+(y-1.09)*.93]),[],(x,y)=>face(x,y,.018),'zenix_clear_headlamp_lens',[0,0,1],.032);
 headlightPositions.push(face(side*.803,1.093,.021));
}
// Lower bumper has the wide painted bridge, mesh corner pockets, horizontal
// running-light strips and two small low fog lamps visible in the reference.
const lowerHole=rounded([[-.688,.509],[.688,.509],[.716,.345],[-.716,.345]],.023,6);
const cornerHole=rounded([[.666,.770],[.867,.883],[.896,.761],[.877,.504],[.790,.492],[.715,.575]],.018,6);
const upperSlot=rounded([[-.650,.698],[.650,.698],[.637,.750],[-.637,.750]],.006,4);
const bumper=bodyLoft(root,m.paint,[{z:1.966,w:.860,c:.875,s:.845,b:.297},{z:2.225,w:.938,c:.875,s:.852,b:.293},{z:2.425,w:.917,c:.862,s:.840,b:.315}],{segments:28,crossSegments:30,edgeDrop:.033,sideInset:.027,roundedShoulders:true,smoothSeams:true,underbody:false,nose:{from:1.99,round:.180,bottomInset:.036,topInset:.011,openings:[{type:'polygon',points:lowerHole},{type:'polygon',points:upperSlot},...[-1,1].map(s=>({type:'polygon',points:cornerHole.map(([x,y])=>[x*s,y])}))]}});
const bumperFace=(x,y,o=0)=>[x,y,bumper.frontZ(x,y)+o];
for(const [name,p]of[['lower',lowerHole],['upper',upperSlot]]){
 panel(root,rubber,p,[],(x,y)=>bumperFace(x,y,-.036),'zenix_'+name+'_bumper_intake');
 for(let i=-5;i<=5;i++){const x=i*.115,lo=name==='lower'?.357:.705,hi=name==='lower'?.496:.743;outline(root,satin,[[x,lo],[x,hi]].map(([xx,y])=>bumperFace(xx,y,-.017)),.004,'zenix_bumper_vertical_vane',false);}
}
for(const side of[-1,1]){
 const p=cornerHole.map(([x,y])=>[x*side,y]);panel(root,rubber,p,[],(x,y)=>bumperFace(x,y,-.027),'zenix_corner_vent_recess');
 outline(root,satin,p.map(([x,y])=>bumperFace(x,y,.006)),.006,'zenix_corner_vent_edge');
 for(let row=0;row<7;row++){const y=.535+row*.043,half=.038+.006*row,x=side*(.813-.004*row),pts=[[x-side*half,y],[x+side*half,y+.007]].filter(([xx,yy])=>inside(xx,yy,p));if(pts.length===2)outline(root,satin,pts.map(([xx,yy])=>bumperFace(xx,yy,-.011)),.004,'zenix_corner_vent_slats',false);}
 const stripPoly=rounded([[side*.668,.674],[side*.867,.674],[side*.867,.698],[side*.676,.697]],.004,3);
 panel(root,m.front,stripPoly,[],(x,y)=>bumperFace(x,y,.013),'zenix_horizontal_bumper_running_light');
 const fog=circle(side*.637,.415,.024,.026,28);panel(root,reflector,fog,[],(x,y)=>bumperFace(x,y,.005),'zenix_low_foglamp_ring');panel(root,m.front,circle(side*.637,.415,.015,.017,20),[],(x,y)=>bumperFace(x,y,.010),'zenix_low_foglamp_core');
}
const lip=rounded([[-.871,.357],[-.708,.298],[.708,.298],[.871,.357],[.864,.285],[-.864,.285]],.025,6);
panel(root,cladding,lip,[],(x,y)=>bumperFace(x,y,.010),'zenix_dark_lower_bumper_lip');
const glyphs={A:[[[0,0],[.43,1],[.58,1],[1,0]],[[.19,.42],[.81,.42]]],B:[[[0,0],[0,1],[.85,1],[1,.84],[1,.64],[.83,.52],[0,.52]],[[.8,.52],[1,.38],[1,.15],[.85,0],[0,0]]],D:[[[0,0],[0,1],[.66,1],[1,.72],[1,.28],[.66,0],[0,0]]],E:[[[1,1],[0,1],[0,0],[1,0]],[[0,.52],[.78,.52]]],H:[[[0,0],[0,1]],[[1,0],[1,1]],[[0,.52],[1,.52]]],I:[[[0,1],[1,1]],[[.5,1],[.5,0]],[[0,0],[1,0]]],K:[[[0,0],[0,1]],[[1,1],[0,.48],[1,0]]],N:[[[0,0],[0,1],[1,0],[1,1]]],O:[[[.15,0],[0,.15],[0,.85],[.15,1],[.85,1],[1,.85],[1,.15],[.85,0],[.15,0]]],R:[[[0,0],[0,1],[.85,1],[1,.85],[1,.60],[.85,.52],[0,.52]],[[.42,.52],[1,0]]],T:[[[0,1],[1,1]],[[.5,1],[.5,0]]],V:[[[0,1],[.5,0],[1,1]]],X:[[[0,1],[1,0]],[[1,1],[0,0]]],Y:[[[0,1],[.5,.50],[1,1]],[[.5,.50],[.5,0]]],Z:[[[0,1],[1,1],[0,0],[1,0]]],'-':[[[0,.5],[1,.5]]]};
function textBadge(text,material,x,y,h,advance,project){for(let i=0;i<text.length;i++)for(const stroke of glyphs[text[i]]||[])outline(root,material,stroke.map(([a,b])=>project(x+i*advance+a*advance*.72,y+b*h)),h*.043,'zenix_badge_letter',false);}
const frontPlate=rounded([[-.233,.524],[.233,.524],[.233,.687],[-.233,.687]],.007,5);
panel(root,rubber,frontPlate,[],(x,y)=>bumperFace(x,y,.026),'zenix_front_plate');
textBadge('INNOVA',chrome,-.193,.602,.044,.066,(x,y)=>bumperFace(x,y,.030));
textBadge('ZENIX',chrome,-.115,.558,.030,.047,(x,y)=>bumperFace(x,y,.030));
textBadge('HYBRID',badgeBlue,-.088,.535,.016,.031,(x,y)=>bumperFace(x,y,.030));

// Tall rounded rear window under a short factory visor. The Zenix lighting is
// two horizontally divided arrows; there are no CR-V-style vertical L lamps.
const rearOuter=rounded([[-.829,1.254],[.829,1.254],[.754,1.728],[.651,1.781],[-.651,1.781],[-.754,1.728]],.039,7);
const rearGlass=rounded([[-.714,1.329],[.714,1.329],[.653,1.690],[.582,1.732],[-.582,1.732],[-.653,1.690]],.039,7);
const back=(x,y,o=0)=>[x,y,-2.378+.254*clamp((y-1.254)/.527,0,1)+.093*(Math.abs(x)/.83)**4+o];
panel(root,m.paint,rearOuter,[rearGlass],(x,y)=>back(x,y),'zenix_tall_rear_window_frame',[0,0,-1],.075);
panel(root,m.glass,rearGlass,[],(x,y)=>back(x,y,-.003),'zenix_rear_screen',[0,0,-1],.075);
outline(root,rubber,rearGlass.map(([x,y])=>back(x,y,-.007)),.009,'zenix_rear_glass_seal');
for(let i=0;i<6;i++){const y=1.365+i*.050,h=lerp(.690,.644,(y-1.329)/.40);outline(root,satin,[back(-h,y,-.009),back(h,y,-.009)],.0008,'zenix_rear_demister',false);}
for(const side of[-1,1])surface(root,m.paint,28,8,(u,v)=>{const y=lerp(1.235,1.770,u),p=back(side*lerp(.829,.660,u),y),q=[side*cabinX(lerp(-2.292,-1.945,u),y),y,lerp(-2.292,-1.945,u)];const bow=.016*Math.sin(v*PI)*Math.sin(u*PI);return p.map((n,i)=>lerp(n,q[i],v)+(i===0?side*bow:i===2?-bow:0));},'zenix_wide_rear_pillar',side<0);
const spoiler=rounded([[-.721,1.799],[.721,1.799],[.761,1.755],[.730,1.718],[.676,1.755],[-.676,1.755],[-.730,1.718],[-.761,1.755]],.013,5);
shape(root,m.paint,spoiler,{position:[0,0,-2.225],depth:.167,bevel:.009,name:'zenix_factory_roof_spoiler'});
roundedPanel(root,m.rear,.241,.023,[0,1.775,-2.237],{radius:.006,rotation:[0,PI,0],depth:.004,name:'zenix_high_brake_light'});
shape(root,m.paint,[[-.038,0],[.049,0],[.018,.084],[-.008,.101]],{position:[0,roofY(-1.676,0)-.005,-1.676],rotation:[0,PI/2,0],depth:.067,bevel:.008,name:'zenix_sharkfin_antenna'});
const tail=rounded([[-.763,1.273],[.763,1.273],[.768,.759],[.723,.609],[-.723,.609],[-.768,.759]],.030,6);
const platePocket=rounded([[-.389,1.199],[.389,1.199],[.474,.974],[.336,.923],[-.336,.923],[-.474,.974]],.018,7);
const tailFace=(x,y,o=0)=>[x,y,body.rearZ(x,y)-.004-.008*Math.sin((y-.61)/.66*PI)+o];
panel(root,m.paint,tail,[platePocket],(x,y)=>tailFace(x,y),'zenix_sculpted_hybrid_tailgate',[0,0,-1],.075);
outline(root,rubber,tail.map(([x,y])=>tailFace(x,y,-.003)),.003,'zenix_rear_hatch_shutline');
const pocketInner=platePocket.map(([x,y])=>[x*.84,1.057+(y-1.057)*.81]);
for(let i=0;i<platePocket.length;i++){const j=(i+1)%platePocket.length;surface(root,m.paint,1,4,(u,v)=>{const a=platePocket[i].map((n,k)=>lerp(n,platePocket[j][k],u)),b=pocketInner[i].map((n,k)=>lerp(n,pocketInner[j][k],u)),xy=a.map((n,k)=>lerp(n,b[k],v));return[xy[0],xy[1],lerp(tailFace(a[0],a[1])[2]-.002,-2.323,v)];},'zenix_tailgate_pressing_recess',true);}
panel(root,m.paint,pocketInner,[],(x,y)=>[x,y,-2.323],'zenix_plate_pocket_floor',[0,0,-1]);
const rearPlate=rounded([[-.238,.963],[.238,.963],[.238,1.146],[-.238,1.146]],.007,5);
panel(root,rubber,rearPlate,[],(x,y)=>[x,y,-2.338],'zenix_rear_black_plate',[0,0,-1]);
textBadge('INNOVA',chrome,-.198,1.071,.044,.068,(x,y)=>[-x,y,-2.344]);
textBadge('ZENIX',chrome,-.121,1.026,.031,.049,(x,y)=>[-x,y,-2.344]);
textBadge('HYBRID',badgeBlue,-.092,.987,.021,.032,(x,y)=>[-x,y,-2.345]);
toyotaBadge(0,1.278,.141,.104,(x,y)=>back(-x,y,-.015),[0,0,-1]);
textBadge('INNOVA',chrome,-.680,.922,.023,.033,(x,y)=>tailFace(-x,y,-.010));
textBadge('ZENIX',chrome,-.678,.893,.019,.030,(x,y)=>tailFace(-x,y,-.010));
textBadge('HYBRID',chrome,.501,.886,.022,.029,(x,y)=>tailFace(-x,y,-.010));
// Black latch strip at the upper edge of the license pressing.
outline(root,rubber,[tailFace(-.355,1.197,-.008),tailFace(.355,1.197,-.008)],.006,'zenix_hidden_tailgate_latch',false);
for(const side of[-1,1]){
 const outer=rounded([[.367,1.317],[.662,1.320],[.834,1.270],[.890,1.208],[.805,1.165],[.576,1.168],[.480,1.233]],.012,6);
 // The hatch and lower rear-window frame overlap vertically here. Follow
 // the outer envelope once; a second corner warp would bury the red arrows.
 const lightMap=(x,y,o=0)=>[side*x,y,Math.min(tailFace(x,y)[2],back(x,y)[2])+o];
 panel(root,lampHousing,outer,[],(x,y)=>lightMap(x,y,-.006),'zenix_horizontal_rear_lamp_housing',[side*.3,0,-1],.035);
 // A short black housing return joins any shallow lamp stand-off to the
 // actual shell so the lenses remain a mounted volume, not floating plates.
 for(let i=0;i<outer.length;i++){const a=outer[i],b=outer[(i+1)%outer.length];surface(root,lampHousing,1,2,(u,v)=>{const x=lerp(a[0],b[0],u),y=lerp(a[1],b[1],u),p=lightMap(x,y,-.006),shell=inside(x,y,rearOuter)?Math.min(tailFace(x,y)[2],back(x,y)[2]):tailFace(x,y)[2];return [p[0],y,lerp(p[2],shell+.002,v)];},'zenix_rear_lamp_housing_return',side<0);} 
 const red=rounded([[.394,1.307],[.660,1.308],[.822,1.260],[.863,1.218],[.788,1.208],[.510,1.252]],.010,5);
 panel(root,m.rear,red,[],(x,y)=>lightMap(x,y,-.014),'zenix_tail_lamp_red_arrow',[side*.3,0,-1],.032);
 const white=rounded([[.516,1.235],[.789,1.194],[.822,1.197],[.798,1.178],[.577,1.180]],.006,5);
 panel(root,reflector,white,[],(x,y)=>lightMap(x,y,-.016),'zenix_clear_reverse_band',[side*.25,0,-1],.030);
 const sideLight=rounded([[-2.284,1.305],[-1.995,1.291],[-1.895,1.244],[-1.978,1.188],[-2.243,1.183],[-2.345,1.225]],.014,5);
 panel(root,lampHousing,sideLight,[],(z,y)=>[side*(sideX(z,y)+.006),y,body.mappedZ(sideX(z,y),y,z)],'zenix_rear_lamp_side_housing',[side,0,0],.045);
 const sideRed=sideLight.map(([z,y])=>[-2.12+(z+2.12)*.95,1.244+(y-1.244)*.80]);
 panel(root,m.rear,sideRed,[],(z,y)=>[side*(sideX(z,y)+.011),y,body.mappedZ(sideX(z,y),y,z)],'zenix_arrow_tail_side_wrap',[side,0,0],.040);
 const gap=[[side*.650,1.307],[side*.645,1.205]];outline(root,rubber,gap.map(([x,y])=>lightMap(Math.abs(x),y,-.021)),.0033,'zenix_two_piece_tail_lamp_divider',false);
}
outline(root,rubber,[back(-.022,1.348,-.016),back(-.192,1.373,-.018),back(.351,1.379,-.018)],.0057,'zenix_rear_wiper_arm',false);
outline(root,rubber,[back(-.171,1.375,-.021),back(.363,1.384,-.021)],.009,'zenix_rear_wiper_blade',false);

// Substantial black lower bumper with mesh corners and a raised satin centre.
const rearBumper=bodyLoft(root,cladding,[{z:-2.413,w:.855,c:.600,s:.588,b:.305},{z:-2.232,w:.941,c:.650,s:.626,b:.315},{z:-1.982,w:.886,c:.659,s:.632,b:.345}],{segments:24,crossSegments:28,edgeDrop:.023,sideInset:.022,roundedShoulders:true,smoothSeams:true,underbody:false,tail:{from:-2.00,round:.167,bottomInset:.038,topInset:.021}});
const rearBumperFace=(x,y,o=0)=>[x,y,rearBumper.rearZ(x,y)+o];
bodyLoft(root,m.paint,[{z:-2.390,w:.838,c:.763,s:.747,b:.603},{z:-2.214,w:.931,c:.789,s:.766,b:.633},{z:-1.986,w:.881,c:.803,s:.772,b:.643}],{segments:23,crossSegments:27,edgeDrop:.023,sideInset:.025,roundedShoulders:true,smoothSeams:true,underbody:false,tail:{from:-2.002,round:.158,bottomInset:.016,topInset:.012}});
const skid=rounded([[-.595,.378],[.595,.378],[.524,.526],[-.524,.526]],.024,6);
panel(root,cladding,skid,[],(x,y)=>rearBumperFace(x,y,-.016),'zenix_dark_centre_rear_skid',[0,0,-1]);
outline(root,satin,skid.map(([x,y])=>rearBumperFace(x,y,-.022)),.006,'zenix_rear_skid_satin_outline');
for(const side of[-1,1]){
 const p=rounded([[side*.587,.569],[side*.836,.574],[side*.869,.457],[side*.687,.438]],.017,5);
 panel(root,rubber,p,[],(x,y)=>rearBumperFace(x,y,-.014),'zenix_rear_corner_mesh_recess',[0,0,-1]);
 const red=rounded([[side*.602,.583],[side*.835,.583],[side*.822,.607],[side*.604,.607]],.006,4);
 panel(root,m.rear,red,[],(x,y)=>rearBumperFace(x,y,-.019),'zenix_bumper_reflector',[0,0,-1]);
 for(let i=0;i<4;i++){const y=.468+i*.025;outline(root,satin,[[side*.690,y],[side*.826,y+.011]].map(([x,yy])=>rearBumperFace(x,yy,-.020)),.0035,'zenix_rear_corner_mesh_slats',false);}
}
for(const x of[-.62,-.24,.24,.62])panel(root,rubber,circle(x,.626,.008,.008,16),[],(xx,y)=>rearBumperFace(xx,y,-.010),'zenix_parking_sensor',[0,0,-1]);
// Seven-seat passenger cabin, with genuine cushions visible through the tint.
box(root,rubber,[1.53,.051,2.96],[0,.618,-.621],undefined,'zenix_long_passenger_floor');
for(const z of[-.10,-1.03,-1.79])for(const side of[-1,1]){
 roundedPanel(root,m.seat,.348,.431,[side*.345,1.184,z],{radius:.070,depth:.15,rotation:[.10,0,0],name:'zenix_seat_back'});
 sphere(root,m.seat,[.143,.094,.074],[side*.345,1.471,z-.013],18,'zenix_passenger_headrest');
 roundedPanel(root,m.seat,.347,.354,[side*.345,.985,z+.148],{radius:.044,depth:.08,rotation:[PI/2,0,0],name:'zenix_seat_cushion'});
}
box(root,rubber,[1.50,.142,.293],[0,1.223,.955],undefined,'zenix_dashboard_shell');
roundedPanel(root,rubber,.264,.156,[0,1.363,.891],{radius:.008,depth:.019,name:'zenix_center_screen'});
roundedPanel(root,m.glass,.243,.137,[0,1.366,.878],{radius:.005,rotation:[0,PI,0],depth:.005,name:'zenix_screen_glass'});
for(const z of[frontWheel,rearWheel])cylinder(root,m.darkMetal,.034,1.47,[0,.315,z],[0,0,PI/2],20,'zenix_suspension_axle');
box(root,rubber,[1.34,.052,2.71],[0,.260,-.162],undefined,'zenix_underfloor');
cylinder(root,m.darkMetal,.032,.182,[.569,.268,-2.282],[PI/2,0,0],24,'zenix_single_exhaust');
cylinder(root,rubber,.024,.014,[.569,.268,-2.382],[PI/2,0,0],20,'zenix_dark_exhaust_mouth');

const metadata={author:'UVelocity original mesh authoring',source:'scripts/build-zenix.cjs',referenceBased:true,officialManufacturerAsset:false,representation:'original-reference-recreation',displayName:'Toyota Kijang Innova Zenix Hybrid',revision:'mpv-expansion-1.5.0',wheelRadius:rig.radius,wheelWidth:rig.width,wheelCenters:rig.centers,headlightPositions,exhaustPositions:[[.569,.268,-2.395]],tail:-2.43,exhaustX:.569,exhaustY:.268,up:'+Y',forward:'+Z',units:'metres',paintMaterials:['paint_body','paint_aero'],features:['continuous curved roof crown and rolled pillars','open primary nose behind dark bumper intakes','dedicated taller long-roof MPV shell','open wheel arches','silver split-spoke alloys','large horizontal-cell hexagonal grille','Toyota ellipse emblem','broad multi-projector headlamps','triangular corner intakes with running-light strips','three side-window apertures','sculpted door and quarter panels','roof spoiler and sharkfin','horizontal two-piece arrow rear lamps','recessed tailgate registration pressing','seven-seat cabin'],cockpitEye:[-.34,1.51,.36]};
const out=path.resolve(__dirname,'../../work/suv-v150-assets',id+'.glb');
const report=exportGLB(root,out,metadata);
{
 const glb=fs.readFileSync(out),n=glb.readUInt32LE(12),doc=JSON.parse(glb.subarray(20,20+n).toString()),bin=glb.subarray(20+n+8);
 for(const material of doc.materials)if(material.name==='zenix_clear_lens'){
  material.pbrMetallicRoughness.baseColorFactor=[.94,.98,1,.11];material.pbrMetallicRoughness.metallicFactor=0;material.pbrMetallicRoughness.roughnessFactor=.045;material.alphaMode='BLEND';material.doubleSided=true;material.extensions={KHR_materials_transmission:{transmissionFactor:.93}};doc.extensionsUsed=[...new Set([...(doc.extensionsUsed||[]),'KHR_materials_transmission'])];
 }
 let json=Buffer.from(JSON.stringify(doc));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);const h=Buffer.alloc(20),b=Buffer.alloc(8);h.write('glTF');h.writeUInt32LE(2,4);h.writeUInt32LE(28+json.length+bin.length,8);h.writeUInt32LE(json.length,12);h.write('JSON',16);b.writeUInt32LE(bin.length);b.writeUInt32LE(0x004e4942,4);const result=Buffer.concat([h,json,b,bin]);fs.writeFileSync(out,result);report.bytes=result.length;
}
if(report.bounds.min[1]<-.002||report.bytes>8*1024*1024||report.triangles>160000)throw new Error('Invalid Zenix geometry bounds, size or triangle count');
fs.writeFileSync(out.replace(/\.glb$/,'.metadata.json'),JSON.stringify({...report,length:report.dimensions[2]},null,2)+'\n');
if(process.argv.includes('--publish')){const target=path.resolve(__dirname,'../public/game/assets/cars',id+'.glb');fs.copyFileSync(out,target);fs.writeFileSync(target.replace(/\.glb$/,'.metadata.json'),JSON.stringify({...report,length:report.dimensions[2],file:'/game/assets/cars/'+id+'.glb'},null,2)+'\n');}
console.log(JSON.stringify({id,bytes:report.bytes,triangles:report.triangles,meshCount:report.meshCount,dimensions:report.dimensions,wheelCenters:rig.centers,published:process.argv.includes('--publish'),file:out},null,2));

