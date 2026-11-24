'use strict';
/** Original UVelocity Honda CR-V RS e:HEV photo-reference recreation.
 * Uses the three supplied blue sixth-generation front/side/rear photographs.
 * Real game geometry, not a manufacturer scan. +Y up / +Z forward, metres.
 * node scripts/build-crv.cjs --publish
 */
const fs=require('node:fs'),path=require('node:path');
const K=require('./modeling-kit.cjs');
const {THREE:T,createModel,materials,mat,mesh,box,sphere,cylinder,tube,surface,shape,roundedPanel,wheelRig,exportGLB,lerp,interp}=K;
const PI=Math.PI,id='honda-crv-rs',clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const provenance='Original UVelocity reference-based recreation using three user-supplied blue Honda CR-V images dated 23 November 2026; not manufacturer CAD or a scan.';
const root=createModel(id,{provenance,reference:'image(20261123-064532).png front; image(20261123-064541).png side; image(20261123-064547).png rear; blue CR-V RS e:HEV visual specification.',revision:'suv-expansion-1.5.0'});
const m=materials(0x4b637a);m.paint.metalness=.55;m.paint.roughness=.26;m.aeroPaint.color.setHex(0x4b637a);m.rim.color.setHex(0x30373e);m.rim.metalness=.79;m.rim.roughness=.22;m.red.color.setHex(0x343b41);m.glass.color.setHex(0x1a252b);m.rear.emissiveIntensity=.12;m.amber.emissiveIntensity=.05;m.front.emissiveIntensity=.27;
const rubber=mat('crv_window_rubber',0x0b0f13,.05,.88),chrome=mat('crv_chrome',0xc8d1d7,.93,.19),cladding=mat('crv_moulded_cladding',0x20272d,.12,.49),satin=mat('crv_satin_graphite',0x46515a,.62,.34),lampHousing=mat('crv_lamp_housing',0x0b151f,.32,.25),reflector=mat('crv_headlamp_reflector',0xd6e2e9,.95,.16),lens=mat('crv_clear_lens',0xdcebf2,.03,.06),badgeBlue=mat('crv_hybrid_badge_blue',0x2b78b0,.64,.23),badgeRed=mat('crv_rs_badge_red',0xa91223,.5,.29),stripe=mat('stripe_accent',0x1e262d,.14,.44);

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

// Correct wheel/steering hierarchy. The RS wheel is a five-paired-spoke design
// with actual holes between spokes, a dark barrel and machined silver facets.
const rig=wheelRig(root,m,{wheelbase:2.70,track:1.61,radius:.365,width:.245,zOffset:.10,spokes:0,rimRadius:.247});
for(const wheel of Object.values(rig.wheels)){
 const sign=wheel.name.endsWith('L')?1:-1,ax=sign*.118;
 for(const child of [...wheel.children])if(child.name==='wheel_bolt'||child.name==='wheel_hub'){wheel.remove(child);child.geometry.dispose();}
 cylinder(wheel,m.rim,.061,.035,[ax,0,0],[0,0,PI/2],40,'rs_wheel_center');
 cylinder(wheel,satin,.033,.037,[ax+sign*.003,0,0],[0,0,PI/2],32,'honda_wheel_center_cap');
 for(let i=0;i<5;i++)for(const fork of[-1,1]){
  const a=i*PI*2/5+fork*.095,poly=rounded([[-.011,.052],[-.015,.100],[-.013,.237],[.010,.243],[.011,.108],[.007,.054]],.004,3);
  const rotate=([u,v])=>[u*Math.cos(a)-v*Math.sin(a),u*Math.sin(a)+v*Math.cos(a)];
  panel(wheel,m.rim,poly.map(rotate),[],(y,z)=>[ax+sign*(.009+.025*(Math.hypot(y,z)/.247)**1.5),y,z],'paired_rs_alloy_spoke',[sign,0,0],.038);
  const edge=poly.slice(0,3).map(rotate).map(([y,z])=>[ax+sign*(.013+.025*(Math.hypot(y,z)/.247)**1.5),y,z]);
  outline(wheel,chrome,edge,.0026,'machined_spoke_facet',false);
 }
 for(let i=0;i<5;i++){const a=i*2*PI/5;cylinder(wheel,chrome,.009,.043,[ax+sign*.005,.041*Math.cos(a),.041*Math.sin(a)],[0,0,PI/2],6,'five_lug_fastener');}
 // Tread channels are shallow, narrow and discontinuous, keeping the wheel
 // performant while avoiding the smooth torus appearance at garage distance.
 for(let k=0;k<52;k++){
  const a=k*PI*2/52;
  for(const side of[-1,1])box(wheel,m.darkMetal,[.047,.003,.008],[side*.063,.358*Math.cos(a),.358*Math.sin(a)],[a,0,side*.15],'road_tyre_tread');
 }
}
const frontWheel=1.45,rearWheel=-1.25,archR=.424;
const grilleOuter=rounded([[-.625,1.052],[.625,1.052],[.668,.954],[.574,.736],[-.574,.736],[-.668,.954]],.034,7);
const grilleHole=grilleOuter.map(([x,y])=>[x*.948,.900+(y-.900)*.874]);
const lampPositive=rounded([[.640,1.070],[.917,1.085],[.911,1.006],[.697,.980],[.625,1.010]],.012,5);
// The main nose must also be open behind the independent bumper intakes.
const frontOpenings=[{type:'polygon',points:[[-1.1,.24],[1.1,.24],[1.1,.792],[-1.1,.792]]},{type:'polygon',points:grilleOuter},...[-1,1].map(s=>({type:'polygon',points:lampPositive.map(([x,y])=>[x*s,y])}))];

// Five-door SUV lower shell. The six-generation CR-V has a broad upright
// bonnet, a nearly horizontal shoulder, and a sculpted recess above its sill.
const body=bodyLoft(root,m.paint,[
 {z:-2.335,w:.817,c:1.188,s:1.180,b:.336},{z:-2.205,w:.911,c:1.194,s:1.190,b:.327},
 {z:-1.70,w:.926,c:1.192,s:1.180,b:.320},{z:-1.25,w:.936,c:1.186,s:1.172,b:.315},
 {z:-.58,w:.918,c:1.180,s:1.165,b:.315},{z:.35,w:.920,c:1.173,s:1.157,b:.315},
 {z:.92,w:.931,c:1.182,s:1.165,b:.322},{z:1.45,w:.938,c:1.149,s:1.129,b:.325},
 {z:1.98,w:.934,c:1.103,s:1.102,b:.335},{z:2.345,w:.935,c:1.077,s:1.107,b:.355}
],{wheelArches:[{z:frontWheel,y:.365,r:archR},{z:rearWheel,y:.365,r:archR}],wellMaterial:rubber,underMaterial:rubber,segments:112,crossSegments:28,edgeDrop:.018,sideInset:.035,roundedShoulders:true,doorBulge:.013,smoothSeams:true,nose:{from:1.88,round:.154,bottomInset:.017,topInset:.014,openings:frontOpenings},tail:{from:-2.02,round:.130,bottomInset:.014,topInset:.008},topCutout:(x,z)=>z<1.01&&z>-2.23&&Math.abs(x)<.80,rearOpenings:[{type:'polygon',points:[[-.77,.58],[.77,.58],[.77,1.205],[-.77,1.205]]}]});
const face=(x,y,o=0)=>[x,y,body.frontZ(x,y)+o];
const sideX=(z,y)=>{const a=body.sample(clamp(z,-2.335,2.345)),t=clamp((a.s-.018-y)/(a.s-.018-a.b),0,1);return a.w-.035*Math.sin(t*PI/2)+.013*Math.sin(t*PI);};

// Continuous stamped roof and pillars surround three side-glass apertures.
// Unlike a cuboid cabin, the roof narrows, the rear pillar slopes forward and
// both windscreen and rear glass have continuous compound curvature.
const roofY=(z,x)=>{const entry=clamp((z-.02)/.40,0,1)**2;return 1.738+.010*Math.sin(clamp((z+1.88)/2.25,0,1)*PI)-.064*(1-.70*entry)*(Math.abs(x)/.755)**2-.030*clamp((-z-1.47)/.52,0,1)**2-.073*entry;};
const roofPerimeter=rounded([[-.699,-1.970],[.699,-1.970],[.756,-1.75],[.755,.310],[.686,.414],[-.686,.414],[-.755,.310],[-.756,-1.75]],.045,7);
panel(root,m.paint,roofPerimeter,[],(x,z)=>[x,roofY(z,x),z],'crv_closed_sculpted_roof',[0,1,0],.075);
for(let i=0;i<roofPerimeter.length;i++){const j=(i+1)%roofPerimeter.length;surface(root,m.paint,1,4,(u,v)=>{const x=lerp(roofPerimeter[i][0],roofPerimeter[j][0],u),z=lerp(roofPerimeter[i][1],roofPerimeter[j][1],u);return[x,roofY(z,x)-.025*v,z];},'crv_rolled_roof_edge');}
const cabinX=(z,y)=>{const t=clamp((y-1.145)/.55,0,1),rear=clamp((-z-1.80)/.52,0,1);return .908-.124*t-.022*t*t-.066*rear*rear;};
const cabinOuter=rounded([[1.005,1.145],[.432,1.628],[.283,1.682],[-1.680,1.677],[-1.976,1.569],[-2.270,1.228],[-2.216,1.147]],.043,7);
const frontGlass=rounded([[.875,1.186],[.363,1.608],[.242,1.626],[-.214,1.626],[-.224,1.181]],.025,6);
const rearGlass=rounded([[-.302,1.182],[-.293,1.626],[-1.227,1.615],[-1.297,1.185]],.025,6);
const quarterGlass=rounded([[-1.386,1.191],[-1.319,1.608],[-1.641,1.594],[-1.862,1.504],[-2.076,1.264],[-1.993,1.210]],.037,6);
const sideHoles=[frontGlass,rearGlass,quarterGlass];
for(const side of[-1,1]){
 const map=(z,y,o=0)=>[side*(cabinX(z,y)+o),y,z];
 // The actual shoulder joins the door shell to the glazing, without an air gap.
 surface(root,m.paint,80,4,(u,v)=>{const z=lerp(-2.215,1.004,u),belt=1.145+.005*clamp((-z-1.70)/.52,0,1),w=body.sample(z).w,p=map(z,belt),q=[side*w,body.topY(w,z),body.mappedZ(w,body.topY(w,z),z)];return p.map((n,i)=>lerp(n,q[i],v)+(i===1?.003*Math.sin(v*PI):0));},'crv_rolled_window_belt_shoulder',side<0);
 panel(root,m.paint,cabinOuter,sideHoles,(z,y)=>map(z,y),'crv_stamp_with_window_apertures',[side,0,0],.085);
 for(const [i,glass]of sideHoles.entries()){
  panel(root,m.glass,glass,[],(z,y)=>map(z,y,.0015),'crv_side_glass_'+i,[side,0,0],.075);
  outline(root,rubber,glass.map(([z,y])=>map(z,y,.0045)),.006,'side_glass_bonded_border');
 }
 // Black B/C pillars and one thin bright surround frame the complete glazing.
 for(const poly of[[[-.296,1.174],[-.292,1.641],[-.209,1.641],[-.213,1.174]],[[-1.390,1.181],[-1.317,1.628],[-1.225,1.628],[-1.298,1.178]]])panel(root,rubber,poly,[],(z,y)=>map(z,y,.005),'crv_gloss_black_pillar',[side,0,0],.065);
 const surround=rounded([[.929,1.166],[.397,1.630],[.262,1.649],[-1.663,1.638],[-1.906,1.531],[-2.134,1.271],[-2.031,1.178]],.037,7);
 outline(root,chrome,surround.map(([z,y])=>map(z,y,.010)),.0060,'crv_chrome_window_perimeter');
 strip(root,rubber,[[side*.914,1.149,1.005],[side*.916,1.149,.10],[side*.909,1.151,-1.64],[side*.867,1.174,-2.19]],.005,'crv_window_belt_seal');
 // Fine door shutlines follow the sculpted shoulder and real arch geometry.
 const gaps=[[[.994,1.145],[1.005,.985],[.984,.605],[.842,.374],[-.215,.368],[-.258,.904],[-.255,1.146]],[[-.255,1.146],[-.258,.904],[-.215,.368],[-.856,.368],[-.916,.670],[-1.317,.930],[-1.329,1.151]]];
 for(const gap of gaps)outline(root,rubber,gap.map(([z,y])=>[side*(sideX(z,y)+.003),y,z]),.0029,'crv_door_shutline',false);
 // A broad pressed concavity is visible over each rocker rather than a box.
 const crease=rounded([[.975,.560],[.809,.450],[-.866,.450],[-.966,.507],[-.929,.566],[.826,.546]],.043,7);
 panel(root,m.paint,crease,[],(z,y)=>{const t=clamp((y-.45)/.12,0,1);return[side*(sideX(z,y)-.009+.014*Math.sin(t*PI)),y,z];},'crv_pressed_door_lower_sculpt',[side,0,0],.065);
 const shoulder=[];for(let i=0;i<=48;i++){const z=lerp(1.94,-2.12,i/48);shoulder.push([side*(sideX(z,1.087)+.002),1.087+.020*clamp((-z-1.1)/1.05,0,1),z]);}outline(root,m.paint,shoulder,.0044,'crv_soft_shoulder_crease',false);
 for(const z of[-.015,-1.095]){
  roundedPanel(root,rubber,.153,.045,[side*(sideX(z,1.091)+.004),1.091,z],{radius:.015,rotation:[0,side*PI/2,0],depth:.005,name:'crv_handle_recess'});
  roundedPanel(root,m.paint,.122,.034,[side*(sideX(z,1.094)+.013),1.094,z+.003],{radius:.014,rotation:[0,side*PI/2,0],depth:.014,name:'crv_body_colour_handle'});
 }
 // Thin CR-V arch cladding, considerably narrower than the Panther flares.
 for(const cz of[frontWheel,rearWheel]){
  surface(root,cladding,72,9,(u,v)=>{const a=lerp(-.20,PI+.20,u),r=lerp(archR+.001,archR+.047,v),z=cz+r*Math.cos(a),y=.365+r*Math.sin(a);return[side*(sideX(z,y)+.012+.014*Math.sin(v*PI)),y,z];},'crv_slim_suv_arch_cladding',side<0);
  const inner=Array.from({length:44},(_,i)=>{const a=lerp(-.2,PI+.2,i/43),z=cz+archR*Math.cos(a),y=.365+archR*Math.sin(a);return[side*(sideX(z,y)+.012),y,z];});outline(root,rubber,inner,.005,'crv_arch_inner_return',false);
 }
 const sill=rounded([[.970,.395],[-.778,.395],[-.857,.351],[-.848,.298],[.950,.303]],.019,5);
 panel(root,cladding,sill,[],(z,y)=>[side*(sideX(z,y)+.015),y,z],'crv_dark_sill',[side,0,0]);
 strip(root,stripe,[[side*.911,.402,.933],[side*.915,.401,-.802]],.007,'crv_sill_colour_accent');
 strip(root,satin,[[side*.926,.327,.910],[side*.926,.327,-.816]],.006,'crv_satin_rocker_edge');
 // Aerodynamic body-colour mirrors on dark stalks with a separate rear lens.
 strip(root,rubber,[[side*.899,1.232,.842],[side*.975,1.257,.787]],.027,'crv_mirror_stalk');
 sphere(root,rubber,[.111,.068,.097],[side*.985,1.291,.788],28,'crv_mirror_lower_shell');
 sphere(root,m.paint,[.113,.055,.100],[side*.985,1.321,.794],28,'crv_mirror_painted_cap');
 roundedPanel(root,m.glass,.191,.086,[side*.985,1.302,.712],{radius:.029,rotation:[0,PI,0],depth:.004,name:'crv_mirror_glass'});
 strip(root,m.front,[[side*.906,1.299,.853],[side*.991,1.296,.877],[side*1.077,1.292,.831]],.0025,'crv_mirror_indicator');
 // Factory flush rails, no off-road roof basket.
 strip(root,satin,[[side*.649,roofY(.242,.649)+.020,.242],[side*.666,roofY(.100,.666)+.028,.100],[side*.669,roofY(-1.540,.669)+.028,-1.540],[side*.636,roofY(-1.786,.636)+.020,-1.786]],.011,'crv_low_roof_rail');
 for(const z of[.10,-.68,-1.54])roundedPanel(root,rubber,.082,.031,[side*.665,roofY(z,.665)+.010,z],{radius:.013,rotation:[0,side*PI/2,0],depth:.041,name:'crv_rail_foot'});
 // Long pressed bonnet seams terminate above the skinny headlamp corners.
 const hood=[];for(let i=0;i<=45;i++){const z=lerp(1.02,2.325,i/45),x=side*lerp(.666,.655,i/45);const y=body.topY(x,z)+.002;hood.push([x,y,body.mappedZ(x,y,z)]);}outline(root,rubber,hood,.0028,'crv_bonnet_shutline',false);
 const hoodFold=[];for(let i=0;i<=36;i++){const z=lerp(1.06,2.23,i/36),x=side*lerp(.574,.537,i/36);const y=body.topY(x,z)+.003;hoodFold.push([x,y,body.mappedZ(x,y,z)]);}outline(root,m.paint,hoodFold,.004,'crv_bonnet_pressed_ridge',false);
}
// Square fuel flap above the rear wheel, on the left rear quarter.
const fuel=rounded([[-1.688,1.071],[-1.413,1.071],[-1.413,.885],[-1.688,.885]],.025,7);
outline(root,rubber,fuel.map(([z,y])=>[sideX(z,y)+.003,y,z]),.0022,'crv_fuel_flap');

// Windshield is a slightly bowed trapezoid, framed by body-colour A pillars.
const windOutline=rounded([[-.850,0],[.850,0],[.723,1],[-.723,1]],.027,6);
const windMap=(x,v,o=0)=>{const half=lerp(.850,.723,v),q=x/half;return[x,lerp(1.170,1.648,v)+.019*(1-q*q),lerp(1.022,.388,v)+.038*(1-q*q)+o];};
panel(root,m.glass,windOutline,[],(x,v)=>windMap(x,v),'crv_bowed_front_windscreen',[0,.7,1],.067);
outline(root,rubber,windOutline.map(([x,v])=>windMap(x,v,.004)),.010,'crv_windscreen_seal');
for(const side of[-1,1])surface(root,m.paint,32,7,(u,v)=>{const p=windMap(side*lerp(.850,.723,u),u),y=lerp(1.145,1.677,u),z=lerp(1.005,.302,u),q=[side*cabinX(z,y),y,z];const bow=.013*Math.sin(v*PI)*Math.sin(u*PI);return p.map((n,i)=>lerp(n,q[i],v)+(i===0?side*bow:i===2?bow*.85:bow*.20));},'crv_sculpted_A_pillar',side<0);
surface(root,m.paint,30,6,(u,v)=>{const t=u*2-1,p=windMap(t*.723,1),x=t*.746,q=[x,roofY(.307,x),.307];return p.map((n,i)=>lerp(n,q[i],v));},'crv_windscreen_roof_header');
panel(root,rubber,rounded([[-.808,1.144],[.808,1.144],[.795,1.176],[-.795,1.176]],.010),[],(x,y)=>[x,y,1.031],'crv_dark_windscreen_cowl',[0,.6,1]);
for(const side of[-1,1]){
 strip(root,rubber,[[side*.12,1.181,1.032],[side*.34,1.190,1.005],[side*.637,1.195,.991]],.0045,'crv_front_wiper_arm');
 strip(root,rubber,[[side*.254,1.188,1.010],[side*.630,1.197,.987]],.008,'crv_front_wiper_blade');
}

// Signature deep hexagonal grille with actual inset lattice geometry.
panel(root,satin,grilleOuter,[grilleHole],(x,y)=>face(x,y,.008),'crv_hexagonal_grille_surround',[0,0,1],.065);
panel(root,rubber,grilleHole,[],(x,y)=>face(x,y,-.053),'crv_grille_recess',[0,0,1],.070);
function grilleDiamond(x,y,sx=.102,sy=.052){const poly=[[x-sx/2,y],[x,y+sy/2],[x+sx/2,y],[x,y-sy/2]];if(poly.every(([xx,yy])=>inside(xx,yy,grilleHole)))outline(root,satin,poly.map(([xx,yy])=>face(xx,yy,-.020)),.0068,'crv_diamond_grille_cell');}
for(let row=0;row<5;row++)for(let col=-6;col<=6;col++)grilleDiamond(col*.103+(row%2)*.052,.775+row*.051);
// Upper gloss black bridge connects the two headlamps and meets the bonnet.
panel(root,rubber,rounded([[-.637,1.056],[.637,1.056],[.640,1.074],[-.640,1.074]],.006),[],(x,y)=>face(x,y,.013),'crv_grille_bonnet_bridge');
function hondaBadge(cx,cy,w,h,project,out=[0,0,1]){
 const outer=rounded([[-w/2,-h/2],[w/2,-h/2],[w*.54,h*.39],[w*.40,h/2],[-w*.40,h/2],[-w*.54,h*.39]],w*.12,6).map(([x,y])=>[x+cx,y+cy]);
 const inner=outer.map(([x,y])=>[cx+(x-cx)*.84,cy+(y-cy)*.84]);
 panel(root,badgeBlue,outer,[],project,'crv_hybrid_emblem_inset',out,.025);
 panel(root,chrome,outer,[inner],project,'crv_honda_emblem_frame',out,.025);
 const letters=[[[cx-w*.28,cy+h*.31],[cx-w*.19,cy-h*.31]],[[cx+w*.28,cy+h*.31],[cx+w*.19,cy-h*.31]],[[cx-w*.23,cy],[cx+w*.23,cy]]];
 for(const p of letters)outline(root,chrome,p.map(([x,y])=>project(x,y)),w*.060,'crv_honda_H',false);
}
hondaBadge(0,.907,.170,.183,(x,y)=>face(x,y,.025));
const glyphs={C:[[[1,1],[.15,1],[0,.85],[0,.15],[.15,0],[1,0]]],R:[[[0,0],[0,1],[.85,1],[1,.85],[1,.60],[.85,.52],[0,.52]],[[.42,.52],[1,0]]],V:[[[0,1],[.5,0],[1,1]]],E:[[[1,1],[0,1],[0,0],[1,0]],[[0,.52],[.77,.52]]],H:[[[0,0],[0,1]],[[1,0],[1,1]],[[0,.52],[1,.52]]],S:[[[1,1],[.12,1],[0,.85],[0,.60],[1,.40],[1,.12],[.87,0],[0,0]]],'-':[[[0,.5],[1,.5]]],':':[[[.5,.72],[.5,.73]],[[.5,.27],[.5,.28]]]};
function textBadge(text,material,x,y,h,advance,project){for(let i=0;i<text.length;i++)for(const stroke of glyphs[text[i]]||[])outline(root,material,stroke.map(([a,b])=>project(x+i*advance+a*advance*.70,y+b*h)),h*.044,'crv_badge_letter',false);}
textBadge('RS',badgeRed,.419,.804,.032,.035,(x,y)=>face(x,y,.012));
const headlightPositions=[];
for(const side of[-1,1]){
 const outer=lampPositive.map(([x,y])=>[side*x,y]);
 panel(root,lampHousing,outer,[],(x,y)=>face(x,y,-.007),'crv_slim_headlight_housing',[0,0,1],.030);
 outline(root,satin,outer.map(([x,y])=>face(x,y,.004)),.003,'crv_headlight_edge');
 for(let i=0;i<6;i++){
  const x=side*(.681+i*.038),y=1.022+i*.0026;
  roundedPanel(root,reflector,.028,.023,face(x,y,.005),{radius:.005,depth:.005,name:'crv_six_led_projector'});
  roundedPanel(root,m.front,.017,.013,face(x,y,.012),{radius:.004,depth:.003,name:'crv_white_projector_core'});
 }
 outline(root,m.front,[[side*.645,1.057],[side*.901,1.071]].map(([x,y])=>face(x,y,.011)),.0045,'crv_slim_daytime_LED',false);
 panel(root,lens,outer.map(([x,y])=>[side*.772+(x-side*.772)*.96,1.033+(y-1.033)*.88]),[],(x,y)=>face(x,y,.014),'crv_clear_front_lens',[0,0,1],.032);
 headlightPositions.push(face(side*.800,1.036,.018));
}

// Painted bumper sweeps down toward the large lower mesh opening. Its corner
// intakes are separate moulded recesses, not solid blocks on the car nose.
const lowerHole=rounded([[-.642,.607],[.642,.607],[.705,.414],[-.705,.414]],.024,6);
const cornerHole=rounded([[.703,.748],[.845,.768],[.873,.675],[.868,.420],[.745,.455]],.029,7);
const bumper=bodyLoft(root,m.paint,[{z:1.955,w:.862,c:.798,s:.785,b:.315},{z:2.219,w:.925,c:.795,s:.774,b:.311},{z:2.367,w:.910,c:.781,s:.761,b:.327}],{segments:28,crossSegments:30,edgeDrop:.032,sideInset:.026,roundedShoulders:true,smoothSeams:true,underbody:false,nose:{from:1.99,round:.157,bottomInset:.037,topInset:.010,openings:[{type:'polygon',points:lowerHole},...[-1,1].map(s=>({type:'polygon',points:cornerHole.map(([x,y])=>[x*s,y])}))]}});
const bumperFace=(x,y,o=0)=>[x,y,bumper.frontZ(x,y)+o];
panel(root,rubber,lowerHole,[],(x,y)=>bumperFace(x,y,-.042),'crv_lower_intake_dark_recess');
for(let i=-6;i<=6;i++)for(const direction of[-1,1]){
 const p=[[i*.118-.070,.424],[i*.118+.070,.594]].map(([x,y])=>[x*direction,y]);
 if(p.every(([x,y])=>inside(x,y,lowerHole)))outline(root,satin,p.map(([x,y])=>bumperFace(x,y,-.017)),.0041,'crv_lower_intake_diamond',false);
}
outline(root,satin,lowerHole.map(([x,y])=>bumperFace(x,y,.004)),.008,'crv_lower_intake_surround');
for(const side of[-1,1]){
 const hole=cornerHole.map(([x,y])=>[x*side,y]);
 panel(root,cladding,hole,[],(x,y)=>bumperFace(x,y,-.021),'crv_deep_corner_intake');
 outline(root,rubber,hole.map(([x,y])=>bumperFace(x,y,.001)),.006,'crv_corner_intake_moulded_lip');
 const slash=[[side*.840,.717],[side*.842,.500],[side*.792,.484]];
 outline(root,satin,slash.map(([x,y])=>bumperFace(x,y,.010)),.007,'crv_corner_intake_satin_L',false);
 for(let i=0;i<4;i++)outline(root,rubber,[[side*.762,.524+i*.038],[side*.841,.537+i*.038]].map(([x,y])=>bumperFace(x,y,-.014)),.004,'crv_corner_intake_vane',false);
}
const lowerLip=rounded([[-.876,.396],[-.710,.360],[.710,.360],[.876,.396],[.865,.328],[-.865,.328]],.023,6);
panel(root,cladding,lowerLip,[],(x,y)=>bumperFace(x,y,.009),'crv_lower_bumper_dark_lip');
outline(root,satin,[[-.833,.369],[0,.350],[.833,.369]].map(([x,y])=>bumperFace(x,y,.014)),.007,'crv_lower_satin_edge',false);
const plateOutline=rounded([[-.212,.599],[.212,.599],[.212,.728],[-.212,.728]],.007,4);
panel(root,rubber,plateOutline,[],(x,y)=>bumperFace(x,y,.022),'crv_front_plate');
outline(root,satin,plateOutline.map(([x,y])=>bumperFace(x,y,.025)),.003,'crv_front_plate_trim');
textBadge('CR-V',chrome,-.144,.658,.049,.070,(x,y)=>bumperFace(x,y,.027));
textBadge('E:HEV',badgeBlue,-.079,.619,.022,.032,(x,y)=>bumperFace(x,y,.028));

// Rear screen and hatch: steep, angular and much more compact than the older
// white-generation reference. The vertical corner light climbs beside glass.
const rearOuter=rounded([[-.829,1.164],[.829,1.164],[.715,1.627],[.635,1.671],[-.635,1.671],[-.715,1.627]],.038,7);
const rearWindow=rounded([[-.696,1.220],[.696,1.220],[.626,1.600],[.564,1.629],[-.564,1.629],[-.626,1.600]],.037,7);
const back=(x,y,o=0)=>[x,y,-2.333+.444*clamp((y-1.165)/.526,0,1)+.111*(Math.abs(x)/.83)**4+o];
panel(root,m.paint,rearOuter,[rearWindow],(x,y)=>back(x,y),'crv_rear_cabin_frame',[0,0,-1],.065);
panel(root,m.glass,rearWindow,[],(x,y)=>back(x,y,-.004),'crv_rear_window',[0,0,-1],.062);
outline(root,rubber,rearWindow.map(([x,y])=>back(x,y,-.008)),.009,'crv_rear_window_seal');
for(let i=0;i<6;i++){const y=1.270+i*.047,h=lerp(.677,.629,(y-1.22)/.38);outline(root,satin,[back(-h,y,-.010),back(h,y,-.010)],.00075,'crv_rear_demister',false);}
for(const side of[-1,1])surface(root,m.paint,30,10,(u,v)=>{const y=lerp(1.150,1.665,u),x=lerp(.829,.643,u),p=back(side*x,y),q=[side*cabinX(lerp(-2.221,-1.749,u),y),y,lerp(-2.221,-1.749,u)];return p.map((n,i)=>lerp(n,q[i],v));},'crv_rear_corner_pillar',side<0);
// Enclosed aerodynamic visor, not a racing wing.
const visor=rounded([[-.718,1.696],[.718,1.696],[.761,1.651],[.719,1.611],[.673,1.648],[-.673,1.648],[-.719,1.611],[-.761,1.651]],.013,5);
shape(root,m.paint,visor,{position:[0,0,-2.023],depth:.186,bevel:.010,name:'crv_roof_spoiler'});
roundedPanel(root,m.rear,.240,.021,[0,1.672,-2.035],{radius:.007,rotation:[0,PI,0],depth:.004,name:'crv_high_stop_lamp'});
shape(root,m.paint,[[-.040,0],[.047,0],[.016,.090],[-.010,.102]],{position:[0,roofY(-1.620,0)-.005,-1.620],rotation:[0,PI/2,0],depth:.073,bevel:.009,name:'crv_sharkfin_antenna'});
const tailSkin=rounded([[-.762,1.178],[.762,1.178],[.766,.713],[.714,.606],[-.714,.606],[-.766,.713]],.029,6);
const platePocket=rounded([[-.334,.929],[.334,.929],[.363,1.139],[-.363,1.139]],.016,6);
const tailFace=(x,y,o=0)=>[x,y,body.rearZ(x,y)-.004-.009*Math.sin((y-.60)/.58*PI)+o];
panel(root,m.paint,tailSkin,[platePocket],(x,y)=>tailFace(x,y),'crv_sculpted_tailgate',[0,0,-1],.065);
outline(root,rubber,tailSkin.map(([x,y])=>tailFace(x,y,-.003)),.0029,'crv_tailgate_shutline');
const pocketInner=platePocket.map(([x,y])=>[x*.90,1.032+(y-1.032)*.86]);
for(let i=0;i<platePocket.length;i++){const j=(i+1)%platePocket.length;surface(root,m.paint,1,3,(u,v)=>{const a=platePocket[i].map((n,k)=>lerp(n,platePocket[j][k],u)),b=pocketInner[i].map((n,k)=>lerp(n,pocketInner[j][k],u)),xy=a.map((n,k)=>lerp(n,b[k],v));return[xy[0],xy[1],lerp(tailFace(a[0],a[1])[2]-.002,-2.285,v)];},'crv_pressed_plate_pocket_depth',true);}
panel(root,rubber,pocketInner,[],(x,y)=>[x,y,-2.286],'crv_plate_pocket_dark',[0,0,-1]);
const rearPlate=rounded([[-.228,.958],[.228,.958],[.228,1.102],[-.228,1.102]],.006,5);
panel(root,rubber,rearPlate,[],(x,y)=>[x,y,-2.297],'crv_rear_plate',[0,0,-1]);
outline(root,satin,rearPlate.map(([x,y])=>[x,y,-2.300]),.003,'crv_rear_plate_trim');
textBadge('CR-V',chrome,-.148,1.027,.050,.072,(x,y)=>[-x,y,-2.304]);
textBadge('E:HEV',badgeBlue,-.080,.985,.022,.033,(x,y)=>[-x,y,-2.305]);
// Dark garnish below the screen joins the red horizontal lamp segments.
panel(root,rubber,rounded([[-.737,1.180],[.737,1.180],[.704,1.131],[-.704,1.131]],.010),[],(x,y)=>tailFace(x,y,-.010),'crv_tailgate_gloss_garnish',[0,0,-1]);
hondaBadge(0,1.234,.104,.104,(x,y)=>back(-x,y,-.019),[0,0,-1]);
textBadge('CR-V',chrome,-.682,.841,.026,.041,(x,y)=>tailFace(-x,y,-.009));
textBadge('RS',badgeRed,.546,.839,.025,.035,(x,y)=>tailFace(-x,y,-.009));
textBadge('E:HEV',chrome,.513,.807,.017,.024,(x,y)=>tailFace(-x,y,-.009));

for(const side of[-1,1]){
 // Actual boomerang light volume connects roof-height outer vertical to
 // tailgate horizontal arm; wraparound quarter portion remains visible side-on.
 const lampPoly=rounded([[.662,1.616],[.736,1.593],[.832,1.396],[.899,1.296],[.901,1.223],[.813,1.175],[.428,1.175],[.375,1.207],[.780,1.224],[.823,1.277],[.761,1.352],[.682,1.553]],.011,5);
 const lightMap=(x,y,o=0)=>[side*x,y,back(x,y)[2]-.017+o];
 panel(root,lampHousing,lampPoly,[],(x,y)=>lightMap(x,y,.015),'crv_rear_L_lamp_housing',[side*.2,0,-1],.040);
 const lampCenter=[.760,1.340],redPoly=lampPoly.map(([x,y])=>[lampCenter[0]+(x-lampCenter[0])*.94,lampCenter[1]+(y-lampCenter[1])*.97]);
 panel(root,m.rear,redPoly,[],(x,y)=>lightMap(x,y,-.006),'crv_red_L_tail_lamp',[side*.25,0,-1],.035);
 const redRibbon=[[.692,1.579],[.773,1.394],[.860,1.277],[.812,1.201],[.438,1.201]];
 outline(root,m.rear,redRibbon.map(([x,y])=>lightMap(x,y,-.010)),.007,'crv_rear_light_signature',false);
 const sideLamp=rounded([[-1.935,1.591],[-2.186,1.341],[-2.263,1.300],[-2.184,1.206],[-1.974,1.206],[-2.105,1.275],[-2.088,1.328],[-1.907,1.569]],.011,5);
 panel(root,m.rear,sideLamp,[],(z,y)=>[side*(cabinX(z,y)+.010),y,z],'crv_tail_lamp_side_wrap',[side,0,0],.035);
 outline(root,lampHousing,sideLamp.map(([z,y])=>[side*(cabinX(z,y)+.014),y,z]),.004,'crv_side_tail_lamp_border');
 const white=rounded([[.471,1.189],[.658,1.189],[.663,1.207],[.477,1.207]],.005,4);
 panel(root,reflector,white,[],(x,y)=>lightMap(x,y,-.012),'crv_tail_reverse_strip',[0,0,-1],.040);
}
strip(root,rubber,[back(-.023,1.243,-.018),back(-.182,1.274,-.019),back(.305,1.280,-.019)],.0055,'crv_rear_wiper');
strip(root,rubber,[back(-.161,1.277,-.022),back(.326,1.284,-.022)],.009,'crv_rear_wiper_blade');

// Deep dark diffuser, twin trapezoid exhaust finishers and slim reflectors.
const rearBumper=bodyLoft(root,cladding,[{z:-2.372,w:.851,c:.557,s:.548,b:.281},{z:-2.210,w:.937,c:.600,s:.582,b:.298},{z:-1.986,w:.871,c:.603,s:.576,b:.326}],{segments:28,crossSegments:34,edgeDrop:.025,sideInset:.021,roundedShoulders:true,smoothSeams:true,underbody:false,tail:{from:-2.002,round:.157,bottomInset:.034,topInset:.023}});
const rearBumperFace=(x,y,o=0)=>[x,y,rearBumper.rearZ(x,y)+o];
bodyLoft(root,m.paint,[{z:-2.348,w:.836,c:.683,s:.670,b:.515},{z:-2.197,w:.932,c:.708,s:.684,b:.557},{z:-1.983,w:.884,c:.725,s:.692,b:.565}],{segments:24,crossSegments:30,edgeDrop:.020,sideInset:.022,roundedShoulders:true,smoothSeams:true,underbody:false,tail:{from:-1.99,round:.145,bottomInset:.012,topInset:.010}});
for(const side of[-1,1]){
 const ref=rounded([[side*.598,.548],[side*.809,.550],[side*.836,.574],[side*.602,.573]],.007,5);
 panel(root,m.rear,ref,[],(x,y)=>rearBumperFace(x,y,-.016),'crv_rear_bumper_reflector',[0,0,-1]);
 const finisher=rounded([[side*.531,.306],[side*.788,.319],[side*.806,.382],[side*.565,.379]],.012,6);
 const insideFinisher=finisher.map(([x,y])=>[side*.668+(x-side*.668)*.82,.344+(y-.344)*.69]);
 panel(root,chrome,finisher,[insideFinisher],(x,y)=>rearBumperFace(x,y,-.020),'crv_trapezoid_exhaust_finisher',[0,0,-1]);
 panel(root,rubber,insideFinisher,[],(x,y)=>rearBumperFace(x,y,-.014),'crv_exhaust_dark_opening',[0,0,-1]);
}
outline(root,satin,[[-.807,.424],[-.61,.440],[0,.431],[.61,.440],[.807,.424]].map(([x,y])=>rearBumperFace(x,y,-.014)),.010,'crv_rear_satin_bumper_band',false);
for(const x of[-.30,-.15,0,.15,.30])box(root,rubber,[.018,.055,.156],[x,.311,-2.24],[.10,0,0],'crv_diffuser_rib');

// Full passenger cabin and underbody. Runtime dashboard places the driver at
// the corresponding raised seat height, while this mesh stays useful outside.
box(root,rubber,[1.52,.055,2.67],[0,.598,-.570],undefined,'crv_cabin_floor');
for(const z of[-.13,-1.02])for(const side of[-1,1]){
 roundedPanel(root,m.seat,.354,.413,[side*.345,1.107,z],{radius:.073,depth:.15,rotation:[.10,0,0],name:'crv_seat_back'});
 sphere(root,m.seat,[.144,.093,.073],[side*.345,1.382,z-.008],20,'crv_headrest');
 roundedPanel(root,m.seat,.353,.353,[side*.345,.914,z+.145],{radius:.045,depth:.080,rotation:[PI/2,0,0],name:'crv_seat_cushion'});
}
box(root,rubber,[1.50,.139,.282],[0,1.141,.861],undefined,'crv_dashboard_shell');
roundedPanel(root,rubber,.236,.138,[0,1.283,.807],{radius:.009,depth:.018,name:'crv_center_display_shell'});
roundedPanel(root,m.glass,.217,.120,[0,1.286,.797],{radius:.006,depth:.005,rotation:[0,PI,0],name:'crv_center_display_glass'});
for(const z of[frontWheel,rearWheel])cylinder(root,m.darkMetal,.033,1.47,[0,.315,z],[0,0,PI/2],20,'crv_suspension_crossmember');
box(root,rubber,[1.34,.052,2.49],[0,.255,-.170],undefined,'crv_underfloor');

const metadata={author:'UVelocity original mesh authoring',source:'scripts/build-crv.cjs',referenceBased:true,officialManufacturerAsset:false,representation:'original-reference-recreation',displayName:'Honda CR-V RS e:HEV',revision:'suv-expansion-1.5.0',wheelRadius:rig.radius,wheelWidth:rig.width,wheelCenters:rig.centers,headlightPositions,exhaustPositions:[[-.668,.344,-2.38],[.668,.344,-2.38]],tail:-2.38,exhaustX:.668,exhaustY:.344,up:'+Y',forward:'+Z',units:'metres',paintMaterials:['paint_body','paint_aero'],features:['continuous curved roof crown and rolled pillars','open primary nose behind dark bumper intakes','sixth-generation blue reference silhouette','open wheel arches','paired-spoke RS alloys','hexagonal diamond grille','Honda hybrid H emblem','slim LED headlights','three side-glass apertures','thin chrome window surround','low roof rails','roof spoiler and sharkfin','L-shaped wraparound rear lamps','recessed tailgate registration pocket','twin trapezoid exhaust finishers'],cockpitEye:[-.34,1.46,.30]};
const out=path.resolve(__dirname,'../../work/suv-v150-assets',id+'.glb');
const report=exportGLB(root,out,metadata);
// Clear headlamp covers remain transparent while exterior cabin glazing keeps
// the deep tint in the source reference. Does not modify the shared exporter.
{
 const glb=fs.readFileSync(out),n=glb.readUInt32LE(12),doc=JSON.parse(glb.subarray(20,20+n).toString()),bin=glb.subarray(20+n+8);
 for(const material of doc.materials)if(material.name==='crv_clear_lens'){
  material.pbrMetallicRoughness.baseColorFactor=[.91,.96,1,.11];material.pbrMetallicRoughness.metallicFactor=0;material.pbrMetallicRoughness.roughnessFactor=.045;material.alphaMode='BLEND';material.doubleSided=true;
  material.extensions={KHR_materials_transmission:{transmissionFactor:.93}};doc.extensionsUsed=[...new Set([...(doc.extensionsUsed||[]),'KHR_materials_transmission'])];
 }
 let json=Buffer.from(JSON.stringify(doc));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);const h=Buffer.alloc(20),b=Buffer.alloc(8);h.write('glTF');h.writeUInt32LE(2,4);h.writeUInt32LE(28+json.length+bin.length,8);h.writeUInt32LE(json.length,12);h.write('JSON',16);b.writeUInt32LE(bin.length);b.writeUInt32LE(0x004e4942,4);const result=Buffer.concat([h,json,b,bin]);fs.writeFileSync(out,result);report.bytes=result.length;
}
if(report.bounds.min[1]<-.002||report.bytes>8*1024*1024||report.triangles>160000)throw new Error('Invalid CR-V geometry bounds, size or triangle count');
fs.writeFileSync(out.replace(/\.glb$/,'.metadata.json'),JSON.stringify({...report,length:report.dimensions[2]},null,2)+'\n');
if(process.argv.includes('--publish')){
 const target=path.resolve(__dirname,'../public/game/assets/cars',id+'.glb');fs.copyFileSync(out,target);
 fs.writeFileSync(target.replace(/\.glb$/,'.metadata.json'),JSON.stringify({...report,length:report.dimensions[2],file:'/game/assets/cars/'+id+'.glb'},null,2)+'\n');
}
console.log(JSON.stringify({id,bytes:report.bytes,triangles:report.triangles,meshCount:report.meshCount,dimensions:report.dimensions,wheelCenters:rig.centers,published:process.argv.includes('--publish'),file:out},null,2));

