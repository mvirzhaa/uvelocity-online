'use strict';
/** Original UVelocity 1983 Pontiac Knight Rider KITT reference reconstruction.
 * Four user supplied front/side/rear photographs, 24 November 2026.
 * A dedicated long-low Firebird body, T-top canopy, wraparound glass and
 * individually addressable red scanner cells. No borrowed vehicle geometry.
 * +Y up, +Z forward, metres. node scripts/build-kitt.cjs --publish
 */
const fs=require('node:fs'),path=require('node:path');
const K=require('./modeling-kit.cjs');
const {THREE:T,createModel,materials,mat,mesh,box,sphere,cylinder,tube,surface,shape,roundedPanel,wheelRig,exportGLB,lerp}=K;
const PI=Math.PI,id='knight-rider-kitt',clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const provenance='Original UVelocity photo-reference reconstruction of 1983 Pontiac Knight Rider KITT using four user-supplied images dated 24 November 2026; independently authored surfaces, not a film studio, manufacturer or extracted game asset.';
const root=createModel(id,{provenance,revision:'iconic-collection-1.6.0',referenceImages:['image(20261124-030209).png','image(20261124-030253).png','image(20261124-030301).png','image(20261124-030314).png']});
const m=materials(0x111820);
m.paint.metalness=.64;m.paint.roughness=.17;m.aeroPaint.color.copy(m.paint.color);m.aeroPaint.roughness=.19;
m.rim.color.setHex(0x181c23);m.rim.metalness=.65;m.rim.roughness=.24;m.red.color.setHex(0x34373c);m.glass.color.setHex(0x25313c);m.glass.metalness=.10;m.front.emissiveIntensity=.10;m.rear.color.setHex(0x210609);m.rear.emissiveIntensity=.025;m.amber.emissiveIntensity=.03;
const rubber=mat('kitt_window_rubber',0x070a0e,.02,.78),satin=mat('kitt_satin_trim',0x272c32,.64,.32),chrome=mat('rim_machined_edge',0x9ca8b4,.92,.18),tread=mat('kitt_tread_rubber',0x181b1e,.02,.88),reflector=mat('kitt_lamp_reflector',0x677881,.74,.22),smokedLens=mat('kitt_rear_smoked_lens',0x15181d,.03,.09),clearLens=mat('kitt_foglight_clear_lens',0xa4b1b8,.04,.04),seatTan=mat('kitt_tan_upholstery',0x9a805d,.02,.86),seatShadow=mat('kitt_tan_stitch',0x514433,.02,.90),dashAmber=mat('kitt_cockpit_amber',0xd19b33,.04,.3,{emissive:0xa95414,emissiveIntensity:.4}),dashGreen=mat('kitt_cockpit_green',0x39775d,.02,.3,{emissive:0x29a666,emissiveIntensity:.3}),plateInk=mat('kitt_plate_gold',0xd6aa58,.5,.35);

// Monotone Hermite station interpolation keeps the long bonnet and hatch
// derivative-continuous. Smoothstep at every station would form visible waves.
function interp(stations,z,key){
 if(z<=stations[0].z)return stations[0][key];if(z>=stations.at(-1).z)return stations.at(-1)[key];
 let i=0;while(stations[i+1].z<z)i++;
 const slope=k=>{if(k===0)return(stations[1][key]-stations[0][key])/(stations[1].z-stations[0].z);if(k===stations.length-1)return(stations[k][key]-stations[k-1][key])/(stations[k].z-stations[k-1].z);const a=stations[k-1],b=stations[k],c=stations[k+1],h0=b.z-a.z,h1=c.z-b.z,d0=(b[key]-a[key])/h0,d1=(c[key]-b[key])/h1;if(d0*d1<=0)return 0;const w0=2*h1+h0,w1=h1+2*h0;return(w0+w1)/(w0/d0+w1/d1);};
 const a=stations[i],b=stations[i+1],h=b.z-a.z,t=(z-a.z)/h;
 return(2*t*t*t-3*t*t+1)*a[key]+(t*t*t-2*t*t+t)*h*slope(i)+(-2*t*t*t+3*t*t)*b[key]+(t*t*t-t*t)*h*slope(i+1);
}

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
 function mappedZ(x,y,z){if(options.tail&&z<options.tail.from){const tail=options.tail,a=sample(z),q=Math.min(1,Math.abs(x)/a.w),v=Math.max(0,Math.min(1,(y-a.b)/(a.c-a.b))),t=Math.max(0,Math.min(1,(tail.from-z)/(tail.from-z0)));return z+t*t*((tail.round||0)*q**3+(tail.bottomInset||0)*(1-v)**2+(tail.topInset||0)*v**4+(tail.profile?tail.profile(v):0));}if(!nose||z<=nose.from)return z;const a=sample(z),q=Math.min(1,Math.abs(x)/a.w),v=Math.max(0,Math.min(1,(y-a.b)/(a.c-a.b))),t=Math.max(0,Math.min(1,(z-nose.from)/(z1-nose.from)));return z-t*t*((nose.round||0)*q**2.4+(nose.bottomInset||0)*(1-v)**2+(nose.topInset||0)*v**4+(nose.profile?nose.profile(v):0));}
 const frontZ=(x,y)=>mappedZ(x,y,z1),rearZ=(x,y)=>mappedZ(x,y,z0);
 function topProfile(a,t){if(!options.roundedShoulders)return a.c+(a.s-a.c)*Math.sin(t*PI/2)**2-edgeDrop*t**8;const q=Math.min(1,t/.72),j=Math.max(0,(t-.72)/.28);return a.c+(a.s-a.c)*q*q*(3-2*q)-edgeDrop*(1-Math.sqrt(Math.max(0,1-j*j)));}
 const top=surface(parent,material,n,m,(u,v)=>{const z=lerp(z0,z1,u),a=sample(z),q=v*2-1,t=Math.abs(q),x=q*a.w,y=topProfile(a,t);return[x,y,mappedZ(x,y,z)];},'body_sculpted_top',false,options.topCutout?(u,v)=>{const z=lerp(z0,z1,u);return options.topCutout((v*2-1)*sample(z).w,z);}:null);
 for(const side of [-1,1]){const fn=(u,v)=>{const z=lerp(z0,z1,u),a=sample(z);let bottom=a.b;for(const w of options.wheelArches||[]){const dz=z-w.z;if(Math.abs(dz)<w.r)bottom=Math.max(bottom,w.y+Math.sqrt(w.r*w.r-dz*dz));}const shoulder=a.s-edgeDrop;bottom=Math.min(bottom,shoulder+.001);const x=side*(a.w-sideInset*Math.sin(v*PI/2)+(options.doorBulge||0)*Math.sin(v*PI)),y=lerp(shoulder,bottom,v);return[x,y,mappedZ(x,y,z)];};const apertures=options.sideOpenings||options.sideCutout;surface(parent,material,n,options.sideCutout?28:apertures?32:14,fn,'body_side_'+side,side<0,apertures?(u,v)=>{const[,y,z]=fn(u,v);return options.sideCutout?options.sideCutout(z,y):(options.sideOpenings||[]).some(h=>Math.abs(z-h.z)<h.rz&&Math.abs(y-h.y)<h.ry);}:null);}
 for(const [z,flip]of [[z0,true],[z1,false]]){
  const a=sample(z),nu=(nose&&z===z1)||(options.rearOpenings&&z===z0)?m*3:m,nv=(nose&&z===z1)||(options.rearOpenings&&z===z0)?40:14,p=[],uv=[],idx=[];
  const point=(u,v)=>{const q=u*2-1,t=Math.abs(q),topY=topProfile(a,t),x=q*(a.w-sideInset*Math.sin((1-v)*PI/2)+(options.doorBulge||0)*Math.sin((1-v)*PI)),y=lerp(a.b,topY,v);return[x,y,mappedZ(x,y,z)];};
  for(let u=0;u<=nu;u++)for(let v=0;v<=nv;v++){p.push(...point(u/nu,v/nv));uv.push(u/nu,v/nv);}
  for(let u=0;u<nu;u++)for(let v=0;v<nv;v++){const [x,y]=point((u+.5)/nu,(v+.5)/nv);const hole=((nose&&z===z1?nose.openings:z===z0?options.rearOpenings:[])||[]).some(h=>h.type==='polygon'?inside(x,y,h.points):h.type==='ellipse'?((x-h.x)/h.rx)**2+((y-h.y)/h.ry)**2<1:Math.abs(x-h.x)<h.rx&&Math.abs(y-h.y)<h.ry);if(hole)continue;const i=u*(nv+1)+v,k=i+nv+1;if(flip)idx.push(i,i+1,k,k,i+1,k+1);else idx.push(i,k,i+1,k,k+1,i+1);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();mesh(parent,g,material,'body_end');
 }
 if(options.underbody!==false)box(parent,options.underMaterial||material,[Math.max(...stations.map(s=>s.w))*1.74,.035,(z1-z0)*.83],[0,Math.min(...stations.map(s=>s.b))+.025,(z0+z1)/2],undefined,'flat_undertray');
 // A narrow rolled lip traces each arch; visible dark wheel-well lining has depth.
 for(const w of options.wheelArches||[])for(const side of [-1,1]){const pts=[];for(let k=0;k<=32;k++){const theta=Math.PI*k/32,z=w.z+w.r*Math.cos(theta),a=sample(Math.min(z1,Math.max(z0,z)));const yy=w.y+w.r*Math.sin(theta),vv=clamp((a.s-edgeDrop-yy)/(a.s-edgeDrop-a.b),0,1);pts.push([side*((w.x||a.w)-sideInset*Math.sin(vv*PI/2)+(options.doorBulge||0)*Math.sin(vv*PI)+.004),yy,z]);}tube(parent,material,pts,.016,false,48,'rolled_wheel_arch');if(options.wellMaterial)surface(parent,options.wellMaterial,40,4,(u,v)=>{const theta=Math.PI*u,z=w.z+w.r*Math.cos(theta),a=sample(Math.min(z1,Math.max(z0,z)));const yy=w.y+(w.r-.018)*Math.sin(theta),vv=clamp((a.s-edgeDrop-yy)/(a.s-edgeDrop-a.b),0,1);return[side*((w.x||a.w)-sideInset*Math.sin(vv*PI/2)+(options.doorBulge||0)*Math.sin(vv*PI)+.004-v*.20),yy,z];},'wheel_well',side>0);}
 // Smooth the genuine shared shell boundaries without rounding aperture edges.
 if(options.smoothSeams){const groups=new Map(),parts=parent.children.slice(before).filter(n=>n.isMesh&&/^body_/.test(n.name));for(const part of parts){const p=part.geometry.attributes.position,n=part.geometry.attributes.normal;for(let i=0;i<p.count;i++){const key=[p.getX(i),p.getY(i),p.getZ(i)].map(x=>Math.round(x*1e5)).join(',');if(!groups.has(key))groups.set(key,[]);groups.get(key).push([n,i]);}}for(const items of groups.values()){if(items.length<2)continue;const norm=new T.Vector3();for(const[a,i]of items)norm.add(new T.Vector3(a.getX(i),a.getY(i),a.getZ(i)));norm.normalize();for(const[a,i]of items)a.setXYZ(i,norm.x,norm.y,norm.z);}}
 return{top,sample,frontZ,rearZ,mappedZ,topY:(x,z)=>topProfile(sample(z),Math.min(1,Math.abs(x)/sample(z).w))};
}

// Four wheel groups, thin machined lips and the distinctive dark turbocast
// aero covers. Geometry is independent of the unchanged baseline car assets.
const rig=wheelRig(root,m,{wheelbase:2.57,track:1.56,radius:.339,width:.245,zOffset:-.115,spokes:0,rimRadius:.228});
for(const wheel of Object.values(rig.wheels)){
 const sign=wheel.name.endsWith('L')?1:-1,ax=sign*.1225;
 for(const child of [...wheel.children])if(child.name==='wheel_bolt'||child.name==='wheel_hub'){wheel.remove(child);child.geometry.dispose();}
 surface(wheel,m.rim,64,13,(u,v)=>{const a=u*PI*2,r=lerp(.018,.211,v),bulge=.012+.013*Math.sin(v*PI);return[ax+sign*bulge,r*Math.cos(a),r*Math.sin(a)];},'black_turbocast_concave_disc',sign>0);
 cylinder(wheel,m.rim,.050,.028,[ax+sign*.021,0,0],[0,0,PI/2],36,'black_turbocast_center_cap');
 for(let i=0;i<28;i++){
  const a=i*2*PI/28;
  surface(wheel,m.rim,3,5,(u,v)=>{const angle=a+lerp(.012,.14,u),r=lerp(.195,.225,v);return[ax+sign*(.011+.013*v),r*Math.cos(angle),r*Math.sin(angle)];},'turbocast_radial_outer_fin',sign>0);
  const az=a+.018;
  outline(wheel,chrome,[[ax+sign*.023,.215*Math.cos(az),.215*Math.sin(az)],[ax+sign*.025,.224*Math.cos(az),.224*Math.sin(az)]],.0015,'machined_fin_edge',false);
 }
 const rimEdge=new T.TorusGeometry(.229,.006,7,64);rimEdge.rotateY(PI/2);const lip=mesh(wheel,rimEdge,chrome,'fine_silver_rim_lip');lip.position.x=ax+sign*.012;
 for(const radius of[.288,.304]){const bead=new T.TorusGeometry(radius,.0014,4,64);bead.rotateY(PI/2);const ring=mesh(wheel,bead,tread,'tyre_sidewall_ring');ring.position.x=sign*.121;}
 for(let i=0;i<64;i++)for(const side of[-1,1]){
  const a=i*2*PI/64;
  box(wheel,tread,[.065,.0028,.008],[side*.060,.335*Math.cos(a),.335*Math.sin(a)],[a,0,0],'fine_road_tread_block');
 }
}
const frontWheel=rig.centers.FL[2],rearWheel=rig.centers.RL[2],archR=.387;
const scannerOpening=rounded([[-.302,.655],[.302,.655],[.278,.713],[-.278,.713]],.012,6);
const lampOpening=rounded([[-.851,.303],[.851,.303],[.851,.470],[.793,.496],[-.793,.496],[-.851,.470]],.025,7);
const tailOpening=rounded([[-.819,.590],[.819,.590],[.840,.793],[-.840,.793]],.015,6);
const body=bodyLoft(root,m.paint,[
 {z:-2.415,w:.838,c:.804,s:.805,b:.219},{z:-2.230,w:.905,c:.822,s:.836,b:.215},
 {z:-1.820,w:.924,c:.832,s:.850,b:.213},{z:-1.400,w:.922,c:.839,s:.854,b:.212},
 {z:-.740,w:.891,c:.832,s:.830,b:.210},{z:.180,w:.886,c:.835,s:.829,b:.208},
 {z:.750,w:.901,c:.827,s:.822,b:.212},{z:1.170,w:.924,c:.800,s:.817,b:.218},
 {z:1.650,w:.922,c:.766,s:.785,b:.221},{z:2.100,w:.901,c:.721,s:.742,b:.225},
 {z:2.445,w:.866,c:.705,s:.709,b:.237}
].map(s=>({...s,s:s.s+.030})),{segments:160,crossSegments:44,edgeDrop:.075,sideInset:.105,doorBulge:.054,roundedShoulders:true,smoothSeams:true,
 wheelArches:[{z:frontWheel,y:.339,r:archR},{z:rearWheel,y:.339,r:archR}],wellMaterial:rubber,underMaterial:rubber,
 nose:{from:1.88,round:.290,bottomInset:.037,topInset:.003,profile:v=>.070*Math.exp(-(((v-.53)/.21)**2))-.025*Math.exp(-(((v-.15)/.16)**2)),openings:[{type:'polygon',points:scannerOpening},{type:'polygon',points:lampOpening}]},
 tail:{from:-2.075,round:.159,bottomInset:.032,topInset:.006,profile:v=>-.060*Math.exp(-(((v-.40)/.23)**2))+.015*Math.exp(-(((v-.77)/.12)**2))},rearOpenings:[{type:'polygon',points:tailOpening}],
 topCutout:(x,z)=>z<.744&&z>-2.139&&Math.abs(x)<.773});
const face=(x,y,o=0)=>[x,y,body.frontZ(x,y)+o];
const back=(x,y,o=0)=>[x,y,body.rearZ(x,y)+o];
const sideX=(z,y)=>{const a=body.sample(clamp(z,-2.415,2.445)),v=clamp((a.s-.075-y)/(a.s-.075-a.b),0,1);return a.w-.105*Math.sin(v*PI/2)+.054*Math.sin(v*PI);};

// The centre scanner is a genuinely inset slot. Unique materials intentionally
// keep all eight cells separate through the static-geometry optimiser.
panel(root,rubber,scannerOpening,[],(x,y)=>face(x,y,-.016),'kitt_scanner_recess');
outline(root,satin,scannerOpening.map(([x,y])=>face(x,y,.003)),.0026,'scanner_slot_thin_edge');
const scannerNames=[],scannerPositions=[];
const scannerGlow=[.035,.065,.16,.56,.95,.35,.09,.04];
for(let i=0;i<8;i++){
 const x=-.2275+i*.065,name='kitt_scanner_'+i;
 const material=mat(name,0xa4050c,.05,.15,{emissive:0xff0013,emissiveIntensity:scannerGlow[i]});
 const poly=rounded([[x-.028,.665],[x+.028,.665],[x+.028,.700],[x-.028,.700]],.004,4);
 panel(root,material,poly,[],(xx,y)=>face(xx,y,-.007),name,[0,0,1],.04);
 scannerNames.push(name);scannerPositions.push(face(x,.6825,-.007));
}

// Low KITT front bumper, six rectangular recessed lamp units and horizontal
// inset bumper louvres. The corners bend into the long front fenders.
panel(root,rubber,lampOpening,[],(x,y)=>face(x,y,-.052),'full_width_recessed_front_bays');
const headlightPositions=[];
for(const side of[-1,1]){
 const bay=rounded([[side*.170,.324],[side*.823,.324],[side*.826,.456],[side*.758,.479],[side*.180,.468]],.014,6);
 outline(root,rubber,bay.map(([x,y])=>face(x,y,.002)),.006,'front_bay_moulded_edge');
 for(let i=0;i<3;i++){
  const x=side*(.300+i*.189),w=i===2?.127:.148;
  const lamp=rounded([[x-w/2,.355],[x+w/2,.355],[x+w/2,.428],[x-w/2,.428]],.008,5);
  panel(root,reflector,lamp,[],(xx,y)=>face(xx,y,-.029),'rectangular_foglight_reflector');
  const inner=lamp.map(([xx,y])=>[x+(xx-x)*.86,.3915+(y-.3915)*.78]);
  panel(root,m.front,inner,[],(xx,y)=>face(xx,y,-.023),'rectangular_foglight_core');
  for(let j=0;j<6;j++){const xx=x-w*.38+j*w*.152;outline(root,satin,[face(xx,.365,-.020),face(xx,.418,-.020)],.0013,'foglight_vertical_prism',false);}
  panel(root,clearLens,lamp,[],(xx,y)=>face(xx,y,-.018),'foglight_clear_cover');
 }
 headlightPositions.push(face(side*.490,.392,-.017));
 const panelPoints=rounded([[side*.145,.304],[side*.833,.304],[side*.840,.321],[side*.147,.321]],.005,4);
 panel(root,satin,panelPoints,[],(x,y)=>face(x,y,.003),'thin_lower_bay_slatted_edge');
}
const bumperCrease=[];for(let i=0;i<=60;i++){const x=lerp(-.84,.84,i/60);bumperCrease.push(face(x,.277,.007));}outline(root,m.paint,bumperCrease,.007,'lower_bumper_moulding',false);
// Rectangular pop-up headlights remain closed in the photo-reference position.
for(const side of[-1,1]){
 const lid=rounded([[side*.500,1.994],[side*.823,1.994],[side*.820,2.316],[side*.493,2.316]],.012,6);
 outline(root,rubber,lid.map(([x,z])=>[x,body.topY(x,z)+.003,body.mappedZ(x,body.topY(x,z),z)]),.0024,'closed_popup_headlamp_lid');
 const seam=[];for(let i=0;i<=48;i++){const q=i/48,z=lerp(.755,2.344,q),x=side*lerp(.698,.454,q);seam.push([x,body.topY(x,z)+.0025,body.mappedZ(x,body.topY(x,z),z)]);}outline(root,rubber,seam,.0024,'long_bonnet_shutline',false);
}
// Offset Trans Am bonnet power bulge; tapered into the actual hood skin.
surface(root,m.paint,48,28,(u,v)=>{const z=lerp(.786,1.872,u),q=v*2-1,x=-.130+q*lerp(.273,.213,u),lift=.044*Math.sin(PI*u)**.75*Math.cos(q*PI/2)**2;return[x,body.topY(x,z)+lift+.001,z];},'trans_am_offset_bonnet_bulge');
// Sculpted greenhouse: low raked windscreen, slim T-top rails, compound
// curvature rear hatch, and a substantial fastback sail panel on each side.
const roofFront=-.105,roofRear=-.991;
const roofY=(z,x)=>1.283-.038*(Math.abs(x)/.682)**2-.018*clamp((z-roofFront+.12)/.12,0,1)**2-.011*clamp((-z-.89)/.16,0,1)**2;
const roofPerimeter=rounded([[-.677,roofFront],[.677,roofFront],[.686,-.270],[.682,-.916],[.650,roofRear],[-.650,roofRear],[-.682,-.916],[-.686,-.270]],.026,6);
const topHoles=[-1,1].map(side=>rounded([[side*.070,-.207],[side*.628,-.207],[side*.638,-.866],[side*.071,-.877]],.018,6));
panel(root,m.paint,roofPerimeter,topHoles,(x,z)=>[x,roofY(z,x),z],'painted_T_top_header_and_T_bar',[0,1,0],.065);
for(const hole of topHoles){panel(root,m.glass,hole,[],(x,z)=>[x,roofY(z,x)-.001,z],'smoked_T_top_glass',[0,1,0],.065);outline(root,rubber,hole.map(([x,z])=>[x,roofY(z,x)+.002,z]),.0036,'T_top_glass_seal');}
for(let i=0;i<roofPerimeter.length;i++){const j=(i+1)%roofPerimeter.length;surface(root,m.paint,1,4,(u,v)=>{const x=lerp(roofPerimeter[i][0],roofPerimeter[j][0],u),z=lerp(roofPerimeter[i][1],roofPerimeter[j][1],u);return[x,roofY(z,x)-v*.019,z];},'T_top_header_edge',true);}
const windOutline=rounded([[-.781,0],[.781,0],[.664,1],[-.664,1]],.030,7);
const windMap=(x,t,o=0)=>{const half=lerp(.781,.664,t),q=x/half;return[x,lerp(.845,1.229,t)+.016*(1-q*q),lerp(.748,-.078,t)+.032*(1-q*q)+o];};
panel(root,m.glass,windOutline,[],(x,t)=>windMap(x,t),'deeply_raked_bowed_windshield',[0,.75,1],.060);
outline(root,rubber,windOutline.map(([x,t])=>windMap(x,t,.002)),.009,'windscreen_bonded_surround');
const cabinX=(z,y)=>{const t=clamp((y-.813)/.420,0,1);return .851-.156*t-.015*t*t-.030*clamp((-z-1.22)/.82,0,1)**2;};
const sideOuter=rounded([[.751,.815],[-.083,1.233],[-.228,1.253],[-.931,1.239],[-1.098,1.190],[-1.911,.828],[-1.929,.818]],.020,6);
const sideWindow=rounded([[.624,.847],[-.137,1.202],[-.268,1.218],[-.918,1.207],[-.948,.841]],.018,6);
for(const side of[-1,1]){
 const map=(z,y,o=0)=>[side*(cabinX(z,y)+o),y,z];
 panel(root,m.paint,sideOuter,[sideWindow],(z,y)=>map(z,y),'single_door_glass_sail_panel',[side,0,0],.070);
 panel(root,m.glass,sideWindow,[],(z,y)=>map(z,y,.001),'large_door_window',[side,0,0],.070);
 outline(root,rubber,sideWindow.map(([z,y])=>map(z,y,.005)),.0047,'slim_door_window_surround');
 // Front pillar connects the front sheet and the side frame without a gap.
 surface(root,m.paint,38,7,(u,v)=>{const a=windMap(side*lerp(.781,.664,u),u),y=lerp(.815,1.233,u),b=map(lerp(.751,-.083,u),y);return a.map((n,i)=>lerp(n,b[i],v));},'closed_swept_A_pillar',side<0);
 surface(root,m.paint,72,5,(u,v)=>{const z=lerp(.744,-1.932,u),a=map(z,.818),w=body.sample(z).w,b=[side*w,body.topY(w,z),z];return a.map((n,i)=>lerp(n,b[i],v));},'continuous_belt_to_body_shoulder',side<0);
 // Narrow rubber B-pillar at the rear edge of the long front door.
 const bPillar=rounded([[-.978,.835],[-.951,1.213],[-.920,1.218],[-.941,.834]],.006,4);
 panel(root,rubber,bPillar,[],(z,y)=>map(z,y,.005),'black_door_rear_window_divider',[side,0,0]);
 const gap=[[.724,.814],[.714,.603],[.700,.329],[.590,.241],[-.737,.241],[-.943,.317],[-.998,.582],[-.996,.812]];
 outline(root,rubber,gap.map(([z,y])=>[side*(sideX(z,y)+.002),y,z]),.0026,'long_coupe_door_shutline',false);
 const handle=rounded([[-.781,.746],[-.648,.746],[-.648,.783],[-.781,.783]],.005,4);
 panel(root,rubber,handle,[],(z,y)=>[side*(sideX(z,y)+.004),y,z],'flush_black_door_handle_recess',[side,0,0]);
 outline(root,satin,[[-.763,.771],[-.663,.771]].map(([z,y])=>[side*(sideX(z,y)+.009),y,z]),.004,'flush_door_handle_top_edge',false);
 // Subtle stock side moulding, body-colour rocker and amber front marker.
 const molding=[];for(let i=0;i<=65;i++){const z=lerp(2.08,-2.155,i/65);let nearWheel=false;for(const wz of[frontWheel,rearWheel])if(Math.abs(z-wz)<.375)nearWheel=true;if(!nearWheel)molding.push([side*(sideX(z,.473)+.003),.473,z]);else if(molding.length){outline(root,rubber,molding,.005,'side_protective_moulding',false);molding.length=0;}}if(molding.length)outline(root,rubber,molding,.005,'side_protective_moulding',false);
 const marker=rounded([[1.863,.526],[2.031,.526],[2.031,.560],[1.863,.560]],.004,4);
 panel(root,m.amber,marker,[],(z,y)=>[side*(sideX(z,y)+.005),y,z],'front_amber_side_marker',[side,0,0]);
 const rearMarker=rounded([[-2.179,.503],[-2.020,.503],[-2.020,.534],[-2.179,.534]],.004,4);
 panel(root,m.rear,rearMarker,[],(z,y)=>[side*(sideX(z,y)+.004),y,z],'small_rear_side_marker',[side,0,0]);
 const sill=rounded([[.653,.225],[-.805,.225],[-.820,.204],[.633,.203]],.008,4);
 panel(root,m.paint,sill,[],(z,y)=>[side*(sideX(z,y)+.013),y,z],'body_colour_low_rocker',[side,0,0]);
 // Slim aerodynamic shell mirrors mounted at the front corner of each door.
 strip(root,rubber,[[side*.838,.878,.565],[side*.912,.895,.522]],.017,'mirror_stalk');
 sphere(root,m.paint,[.082,.044,.100],[side*.922,.921,.526],28,'aero_mirror_shell');
 roundedPanel(root,satin,.139,.060,[side*.924,.920,.443],{radius:.020,rotation:[0,PI,0],depth:.004,name:'mirror_reflective_face'});
}
// Header seals the bowed screen into the roof crown over its full width.
surface(root,m.paint,48,8,(u,v)=>{const q=u*2-1,x=q*lerp(.664,.677,v),a=windMap(q*.664,1),b=[q*.677,roofY(roofFront,q*.677),roofFront];return a.map((n,i)=>lerp(n,b[i],v));},'windshield_to_T_top_closed_header');
for(const side of[-1,1]){
 const arm=[windMap(side*.050,.028,.011),windMap(side*.342,.039,.013),windMap(side*.647,.044,.015)];outline(root,rubber,arm,.0048,'windshield_wiper_arm',false);
 outline(root,rubber,[windMap(side*.286,.037,.016),windMap(side*.657,.046,.016)],.007,'windscreen_wiper_blade',false);
}

// The wraparound rear glass is a broad smooth hatch, not a flat vertical pane.
const rearGlazingStations=[{z:-2.140,w:.780,y:.848},{z:-1.920,w:.777,y:.908},{z:-1.500,w:.744,y:1.076},{z:-1.100,w:.679,y:1.238},{z:-.991,w:.652,y:1.249}];
const hatchTop=(z,x)=>interp(rearGlazingStations,z,'y')-.026*(x/interp(rearGlazingStations,z,'w'))**2;
surface(root,m.paint,44,6,(u,v)=>{const x=lerp(-.652,.652,u),z=lerp(-.991,-1.018,v);return[x,lerp(roofY(-.991,x),hatchTop(z,x),v),z];},'closed_rear_T_top_header');
surface(root,m.glass,74,32,(u,v)=>{const z=lerp(-2.140,-.991,u),w=interp(rearGlazingStations,z,'w'),q=v*2-1;return[q*w,hatchTop(z,q*w),z];},'curved_fastback_hatch_glass');
for(const side of[-1,1]){
 const hatchSide=(z,v)=>{const w=interp(rearGlazingStations,z,'w'),top=hatchTop(z,w),drop=Math.min(.052,Math.max(0,(top-.824)*.50)),yy=top-drop*v;return[side*lerp(w,cabinX(z,top-drop)-.014,Math.sin(v*PI/2)),yy,z];};
 surface(root,m.glass,74,12,(u,v)=>hatchSide(lerp(-2.140,-.991,u),v),'curved_rear_hatch_glass_corner',side<0);
 surface(root,m.paint,74,12,(u,v)=>{const z=lerp(-2.140,-.991,u),a=hatchSide(z,1),yy=lerp(a[1],.818,v),b=[side*cabinX(z,.818),.818,z];return[lerp(a[0],b[0],v)+side*.012*Math.sin(v*PI),yy,z];},'sculpted_painted_fastback_sail_shoulder',side<0);
 const edge=[];for(let i=0;i<=72;i++){const z=lerp(-2.14,-.991,i/72),w=interp(rearGlazingStations,z,'w');edge.push([side*w,hatchTop(z,w)+.003,z]);}outline(root,rubber,edge,.004,'hatch_glass_longitudinal_bond',false);
 const base=[];for(let i=0;i<=70;i++){const z=lerp(-2.14,-.991,i/70),p=hatchSide(z,1);base.push([p[0]+side*.002,p[1]+.002,z]);}outline(root,rubber,base,.005,'wraparound_hatch_lower_seal',false);
}
for(const z of[-2.14,-.991]){const pts=[];for(let i=0;i<=48;i++){const x=lerp(-interp(rearGlazingStations,z,'w'),interp(rearGlazingStations,z,'w'),i/48);pts.push([x,hatchTop(z,x)+.004,z]);}outline(root,rubber,pts,.007,'rear_hatch_horizontal_seal',false);}
for(let i=0;i<9;i++){const z=-1.18-i*.095,w=interp(rearGlazingStations,z,'w')*.93,pts=[];for(let j=0;j<=32;j++){const x=lerp(-w,w,j/32);pts.push([x,hatchTop(z,x)+.0017,z]);}outline(root,satin,pts,.00065,'fine_hatch_demister',false);}
// Connect hatch base to the actual rear deck and close the screen end seam.
surface(root,m.paint,42,8,(u,v)=>{const x=lerp(-.782,.782,u),z=lerp(-2.140,-2.235,v);return[x,lerp(hatchTop(-2.140,x),body.topY(x,z),v),z];},'rear_deck_hatch_join');

// Genuine short rear spoiler, no tall GT wing. Two moulded end feet and
// central support join the deck and retain the low transverse silhouette.
surface(root,m.paint,56,14,(u,v)=>{const x=lerp(-.826,.826,u),q=v*2-1,z=-2.244+q*.119+.029*(Math.abs(x)/.826)**3;return[x,.893+.012*Math.sin(v*PI)-.009*(Math.abs(x)/.826)**2,z];},'low_factory_rear_spoiler_top',true);
surface(root,m.paint,56,14,(u,v)=>{const x=lerp(-.826,.826,u),q=v*2-1,z=-2.244+q*.119+.029*(Math.abs(x)/.826)**3;return[x,.872+.005*Math.sin(v*PI)-.009*(Math.abs(x)/.826)**2,z];},'low_factory_rear_spoiler_underside');
for(const edge of[-1,1])surface(root,m.paint,56,4,(u,v)=>{const x=lerp(-.826,.826,u),z=-2.244+edge*.119+.029*(Math.abs(x)/.826)**3;return[x,lerp(.872,.893,v)-.009*(Math.abs(x)/.826)**2,z];},'spoiler_closed_leading_trailing_edge',edge<0);
for(const side of[-1,1]){
 const foot=rounded([[-2.368,.828],[-2.157,.835],[-2.126,.872],[-2.353,.884]],.012,5);
 panel(root,m.paint,foot,[],(z,y)=>[side*.811,y,z],'spoiler_moulded_end_support',[side,0,0]);
 surface(root,m.paint,16,5,(u,v)=>{const z=lerp(-2.353,-2.126,u);return[side*lerp(.794,.826,v),lerp(body.topY(side*.794,z),.875,v),z];},'spoiler_end_closed_return',side>0);
}
box(root,m.paint,[.052,.042,.100],[0,.851,-2.231],undefined,'spoiler_centre_support');

// Smoked full-width rear light fascia and recessed KNIGHT plate.
panel(root,rubber,tailOpening,[],(x,y)=>back(x,y,.016),'rear_full_width_black_light_cavity',[0,0,-1]);
for(const side of[-1,1])for(let i=0;i<4;i++){
 const x=side*(.226+i*.149),p=rounded([[x-.064,.630],[x+.064,.630],[x+.064,.751],[x-.064,.751]],.004,4);
 panel(root,m.rear,p,[],(xx,y)=>back(xx,y,.008),'recessed_rear_tail_light_section',[0,0,-1]);
}
panel(root,smokedLens,tailOpening,[],(x,y)=>back(x,y,-.002),'smoked_black_full_width_tail_lens',[0,0,-1],.045);
outline(root,satin,tailOpening.map(([x,y])=>back(x,y,-.004)),.003,'rear_fascia_perimeter');
const rearBand=[];for(let i=0;i<=64;i++){const x=lerp(-.814,.814,i/64);rearBand.push(back(x,.560,-.006));}outline(root,rubber,rearBand,.009,'rear_bumper_upper_black_moulding',false);
const plate=rounded([[-.235,.292],[.235,.292],[.235,.443],[-.235,.443]],.010,6);
panel(root,rubber,plate,[],(x,y)=>back(x,y,-.011),'rear_registration_plate_mount',[0,0,-1]);
outline(root,satin,plate.map(([x,y])=>back(x,y,-.015)),.004,'rear_plate_satin_edge');
const glyphs={K:['101','110','100','110','101'],N:['101','111','111','111','101'],I:['111','010','010','010','111'],G:['111','100','101','101','111'],H:['101','101','111','101','101'],T:['111','010','010','010','010']};
for(const [letterIndex,ch]of [...'KNIGHT'].entries())for(let row=0;row<5;row++)for(let col=0;col<3;col++)if(glyphs[ch][row][col]==='1'){
 const x=-.139+letterIndex*.049+col*.0108,y=.389-row*.0112;
 const p=[[x-.0044,y-.0044],[x+.0044,y-.0044],[x+.0044,y+.0044],[x-.0044,y+.0044]];
 panel(root,plateInk,p,[],(xx,yy)=>back(-xx,yy,-.017),'KNIGHT_numberplate_letter',[0,0,-1]);
}
// Classic restrained underbody and twin left-side outlets, not modern diffuser.
box(root,rubber,[1.48,.045,3.64],[0,.212,-.045],undefined,'black_flat_underfloor');
for(const x of[-.629,-.508]){
 cylinder(root,satin,.034,.135,[x,.214,-2.303],[PI/2,0,0],28,'twin_exhaust_tip');
 cylinder(root,rubber,.026,.139,[x,.214,-2.308],[PI/2,0,0],24,'twin_exhaust_dark_bore');
}
const fuel=circle(-1.869,.754,.061,.061,48);outline(root,rubber,fuel.map(([z,y])=>[sideX(z,y)+.002,y,z]),.0027,'round_rear_quarter_fuel_flap');

// Tan cloth upholstery and a small red/amber/green KITT-inspired dashboard are
// visible through the glazing; the game cockpit uses its own matching rig.
box(root,rubber,[1.47,.041,2.44],[0,.256,-.540],undefined,'passenger_cabin_floor');
for(const side of[-1,1]){
 const sx=side*.349;
 roundedPanel(root,seatTan,.356,.448,[sx,.659,-.558],{radius:.061,depth:.123,rotation:[.13,0,0],name:'tan_contoured_seat_back'});
 roundedPanel(root,seatTan,.354,.367,[sx,.451,-.366],{radius:.045,depth:.090,rotation:[PI/2,0,0],name:'tan_seat_cushion'});
 roundedPanel(root,seatTan,.257,.184,[sx,.961,-.579],{radius:.052,depth:.106,name:'tan_rounded_head_rest'});
 for(const dx of[-.137,.137])strip(root,seatShadow,[[sx+dx,.489,-.417],[sx+dx,.636,-.426],[sx+dx,.836,-.455]],.0025,'tan_seat_sewn_bolster');
 for(let i=0;i<5;i++)outline(root,seatShadow,[[sx-.106,.535+i*.051,-.420-i*.007],[sx+.106,.535+i*.051,-.420-i*.007]],.0015,'tan_vertical_seat_padding',false);
 roundedPanel(root,seatTan,.317,.240,[side*.357,.612,-1.307],{radius:.045,depth:.112,rotation:[.19,0,0],name:'small_rear_tan_seat_back'});
}
box(root,seatTan,[1.42,.140,.273],[0,.710,.545],undefined,'tan_dashboard_base');
box(root,rubber,[1.39,.078,.292],[0,.812,.524],undefined,'dark_dashboard_top');
roundedPanel(root,rubber,.681,.202,[.317,.852,.367],{radius:.019,depth:.039,rotation:[0,PI,0],name:'KITT_driver_instrument_panel'});
for(const side of[-1,1]){
 roundedPanel(root,dashGreen,.126,.076,[.317+side*.192,.882,.320],{radius:.005,depth:.003,rotation:[0,PI,0],name:'green_dashboard_monitor'});
 for(let j=0;j<4;j++)roundedPanel(root,dashAmber,.030,.013,[.317+side*.194,.810+j*.012,.319],{radius:.002,depth:.003,rotation:[0,PI,0],name:'amber_dashboard_led'});
}
for(let j=0;j<7;j++)roundedPanel(root,dashAmber,.026,.012,[.228+j*.029,.942,.320],{radius:.002,depth:.003,rotation:[0,PI,0],name:'top_instrument_segment'});
// Left-hand steering yoke is +X in the authored model convention.
strip(root,rubber,[[.205,.728,.219],[.196,.838,.207],[.235,.881,.207],[.434,.881,.207],[.474,.837,.207],[.467,.728,.219]],.015,'left_hand_KITT_steering_yoke');
roundedPanel(root,rubber,.173,.056,[.335,.784,.214],{radius:.011,depth:.028,rotation:[0,PI,0],name:'steering_yoke_centre'});
box(root,rubber,[.132,.157,.499],[0,.492,-.045],undefined,'centre_console');
for(let j=0;j<8;j++)box(root,dashAmber,[.024,.005,.015],[(j%2-.5)*.046,.573,-.205+Math.floor(j/2)*.040],undefined,'centre_console_led');

const metadata={author:'UVelocity original mesh authoring',source:'scripts/build-kitt.cjs',referenceBased:true,officialManufacturerAsset:false,representation:'original-reference-recreation',displayName:'Knight Rider Pontiac 1983 (KITT)',revision:'iconic-collection-1.6.0',wheelRadius:rig.radius,wheelWidth:rig.width,wheelCenters:rig.centers,headlightPositions,exhaustPositions:[[-.629,.214,-2.378],[-.508,.214,-2.378]],tail:-2.378,exhaustX:.629,exhaustY:.214,up:'+Y',forward:'+Z',units:'metres',paintMaterials:['paint_body','paint_aero'],scannerMaterials:scannerNames,scannerNodes:scannerNames,scannerPositions,cockpitEye:[.34,1.055,-.10],features:['dedicated long low 1983 Pontiac silhouette','sculpted round fenders and true open wheel arches','eight individual red scanner cells in recessed slot','closed pop-up headlamp lids','six recessed rectangular fog lamp units','offset Trans Am bonnet bulge','black turbocast aero disc wheels with fine machined lips','glazed T-top and centre roof bar','compound curved wraparound fastback rear glass','low factory style rear spoiler','smoked full width rear lamp fascia','tan contoured seats and left-hand steering yoke']};
const out=path.resolve(__dirname,'../../work/iconic-v160-assets',id+'.glb');
const report=exportGLB(root,out,metadata);
// Keep independent scanner primitives and translucent optical lens skins.
// This local postprocess does not change the shared exporter or other cars.
{
 const input=fs.readFileSync(out),n=input.readUInt32LE(12),doc=JSON.parse(input.subarray(20,20+n).toString()),bin=input.subarray(20+n+8);
 for(const material of doc.materials){
  if(material.name==='kitt_foglight_clear_lens'){
   material.pbrMetallicRoughness.baseColorFactor=[.82,.88,.93,.11];material.pbrMetallicRoughness.metallicFactor=0;material.pbrMetallicRoughness.roughnessFactor=.05;material.alphaMode='BLEND';material.doubleSided=true;
  }
  if(material.name==='kitt_rear_smoked_lens'){
   material.pbrMetallicRoughness.baseColorFactor=[.010,.014,.019,.74];material.pbrMetallicRoughness.metallicFactor=.14;material.alphaMode='BLEND';material.doubleSided=true;
  }
 }
 let json=Buffer.from(JSON.stringify(doc));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);const h=Buffer.alloc(20),b=Buffer.alloc(8);h.write('glTF');h.writeUInt32LE(2,4);h.writeUInt32LE(28+json.length+bin.length,8);h.writeUInt32LE(json.length,12);h.write('JSON',16);b.writeUInt32LE(bin.length);b.writeUInt32LE(0x004e4942,4);const result=Buffer.concat([h,json,b,bin]);fs.writeFileSync(out,result);report.bytes=result.length;
 if(doc.nodes.filter(node=>/^kitt_scanner_\d$/.test(node.name)).length!==8)throw new Error('Eight scanner nodes are required');
}
if(report.bounds.min[1]<-.002||report.bytes>8*1024*1024||report.triangles>160000)throw new Error('Invalid KITT geometry bounds, size or triangle count');
fs.writeFileSync(out.replace(/\.glb$/,'.metadata.json'),JSON.stringify({...report,length:report.dimensions[2]},null,2)+'\n');
if(process.argv.includes('--publish')){
 const target=path.resolve(__dirname,'../public/game/assets/cars',id+'.glb');fs.copyFileSync(out,target);
 fs.writeFileSync(target.replace(/\.glb$/,'.metadata.json'),JSON.stringify({...report,length:report.dimensions[2],file:'/game/assets/cars/'+id+'.glb'},null,2)+'\n');
}
console.log(JSON.stringify({id,bytes:report.bytes,triangles:report.triangles,meshCount:report.meshCount,dimensions:report.dimensions,wheelCenters:rig.centers,published:process.argv.includes('--publish'),file:out},null,2));

