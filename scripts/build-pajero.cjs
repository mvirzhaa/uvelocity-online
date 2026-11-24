'use strict';
/** Mitsubishi Pajero Sport in the supplied off-road configuration.
 * Original UVelocity recreation from the user's three 23-Nov-2026 photos.
 * Units metres, +Y up / +Z front. Only this new model is written.
 * Run: node scripts/build-pajero.cjs --publish
 */
const fs=require('node:fs'),path=require('node:path');
const K=require('./modeling-kit.cjs');
const {THREE:T,createModel,materials,mat,mesh,box,sphere,cylinder,tube,surface,shape,roundedPanel,wheelRig,exportGLB,lerp,interp}=K;
const PI=Math.PI,id='mitsubishi-pajero-sport',clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const provenance='Original UVelocity reference-based recreation of Mitsubishi Pajero Sport with off-road bumpers from three user-supplied photographs, 23 November 2026. Not a manufacturer CAD mesh, scan, or licensed factory model.';
const root=createModel(id,{provenance,revision:'suv-expansion-1.5.0',referenceImages:['image(20261123-064700).png','image(20261123-064709).png','image(20261123-064719).png']});
const m=materials(0x151a1d);
m.paint.metalness=.55;m.paint.roughness=.23;m.aeroPaint.color.copy(m.paint.color);m.rim.color.setHex(0x171b1e);m.rim.roughness=.29;m.rim.metalness=.69;m.red.color.setHex(0x3d4246);m.glass.color.setHex(0x102025);m.glass.roughness=.10;m.rear.emissiveIntensity=.13;m.front.emissiveIntensity=.22;m.amber.emissiveIntensity=.06;
const rubber=mat('pajero_window_rubber',0x080b0d,.02,.91),chrome=mat('pajero_chrome',0xc4ced2,.94,.18),steel=mat('pajero_offroad_steel',0x333a3f,.57,.43),tread=mat('pajero_tread_rubber',0x17191b,.02,.94),lightChrome=mat('pajero_headlamp_reflector',0xc6d7e1,.88,.13),lampDark=mat('pajero_headlamp_dark',0x1b252d,.45,.24),clearLens=mat('pajero_clear_lens',0xe4f4ff,.02,.05),recoveryRed=mat('pajero_recovery_red',0xb51c20,.5,.29),clearRear=mat('pajero_clear_rear_lens',0xb9c8cf,.51,.22),plate=mat('pajero_plate_letter',0xb8c4cb,.15,.35);

function round(points,r=.035,n=5){const out=[];for(let i=0;i<points.length;i++){const p=points[i],a=points[(i+points.length-1)%points.length],b=points[(i+1)%points.length],da=Math.hypot(a[0]-p[0],a[1]-p[1]),db=Math.hypot(b[0]-p[0],b[1]-p[1]),rr=Math.min(r,da*.36,db*.36),s=[p[0]+(a[0]-p[0])*rr/da,p[1]+(a[1]-p[1])*rr/da],e=[p[0]+(b[0]-p[0])*rr/db,p[1]+(b[1]-p[1])*rr/db];for(let j=0;j<=n;j++){const t=j/n;out.push([(1-t)**2*s[0]+2*t*(1-t)*p[0]+t*t*e[0],(1-t)**2*s[1]+2*t*(1-t)*p[1]+t*t*e[1]]);}}return out;}
function circle(x,y,r,n=40){return Array.from({length:n},(_,i)=>[x+r*Math.cos(i*2*PI/n),y+r*Math.sin(i*2*PI/n)]);}
function closed(points){const s=new T.Shape();s.moveTo(...points[0]);for(let i=1;i<points.length;i++)s.lineTo(...points[i]);s.closePath();return s;}
function inside(x,y,points){let yes=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
/** Subdivided curved sheet. Its triangles are oriented toward the outward
 * vector, so mirrored left/right surfaces remain visible to a real renderer. */
function panel(parent,material,boundary,holes,map,name,outward=[0,0,1],detail=.12){const s=closed(boundary);for(const h of holes||[])s.holes.push(closed(h));const sg=new T.ShapeGeometry(s),p=sg.attributes.position,ix=sg.index,verts=[],uv=[],index=[],cache=new Map();function add(a){const key=a.map(x=>x.toFixed(6)).join(',');if(cache.has(key))return cache.get(key);const k=verts.length/3;verts.push(...map(...a));uv.push(...a);cache.set(key,k);return k;}function triangle(a,b,c,depth=0){const edges=[Math.hypot(a[0]-b[0],a[1]-b[1]),Math.hypot(a[0]-c[0],a[1]-c[1]),Math.hypot(b[0]-c[0],b[1]-c[1])],largest=Math.max(...edges);if(largest>detail&&depth<7){const edge=edges.indexOf(largest);if(edge===0){const q=a.map((x,i)=>(x+b[i])/2);triangle(a,q,c,depth+1);triangle(q,b,c,depth+1);}else if(edge===1){const q=a.map((x,i)=>(x+c[i])/2);triangle(a,b,q,depth+1);triangle(q,b,c,depth+1);}else{const q=b.map((x,i)=>(x+c[i])/2);triangle(a,b,q,depth+1);triangle(a,q,c,depth+1);}}else index.push(add(a),add(b),add(c));}for(let i=0;i<ix.count;i+=3)triangle(...[0,1,2].map(j=>[p.getX(ix.getX(i+j)),p.getY(ix.getX(i+j))]));const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(verts,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(index);g.computeVertexNormals();const ns=g.attributes.normal,v=new T.Vector3();for(let i=0;i<ns.count;i++)v.add(new T.Vector3(ns.getX(i),ns.getY(i),ns.getZ(i)));if(v.dot(new T.Vector3(...outward))<0){for(let i=0;i<index.length;i+=3)[index[i+1],index[i+2]]=[index[i+2],index[i+1]];g.setIndex(index);g.computeVertexNormals();}return mesh(parent,g,material,name);}
function line(parent,material,points,r=.004,name='trim',closedPath=false){const curve=new T.CurvePath();for(let i=0;i<points.length-(closedPath?0:1);i++)curve.add(new T.LineCurve3(new T.Vector3(...points[i]),new T.Vector3(...points[(i+1)%points.length])));return mesh(parent,new T.TubeGeometry(curve,Math.max(6,points.length),r,4,closedPath),material,name);}
function spline(parent,material,points,r=.006,name='trim'){return tube(parent,material,points,r,false,Math.max(24,points.length*7),name);}
function extrudedMapped(parent,material,boundary,holes,map,depth,name,outward=[0,0,1]){panel(parent,material,boundary,holes,map,name,outward,.11);for(const loop of[boundary,...holes])for(let i=0;i<loop.length;i++){const j=(i+1)%loop.length;surface(parent,material,1,1,(u,v)=>{const a=loop[i].map((x,k)=>lerp(x,loop[j][k],u)),p=map(...a);return p.map((x,k)=>x-outward[k]*depth*v);},name+'_return');}}

// Correct SUV wheel geometry: chunky 31-inch style tyres, recessed dark alloys,
// separate steer anchors, six lugs, and staggered physical tread blocks.
const rig=wheelRig(root,m,{wheelbase:2.80,track:1.64,radius:.412,width:.285,zOffset:.02,spokes:0,rimRadius:.246});
for(const wheel of Object.values(rig.wheels)){
 const sign=wheel.name.endsWith('L')?1:-1,ax=sign*.132;
 for(const child of [...wheel.children])if(['wheel_hub','wheel_bolt'].includes(child.name)){wheel.remove(child);child.geometry.dispose();}
 for(let i=0;i<12;i++){
  const a=i*PI/6,p=[[.034,.062],[.050,.210],[.031,.238],[.010,.227],[.007,.079]].map(([y,z])=>[y*Math.cos(a)-z*Math.sin(a),y*Math.sin(a)+z*Math.cos(a)]);
  panel(wheel,m.rim,round(p,.006,3),[],(y,z)=>[ax+sign*(.028*(Math.hypot(y,z)/.246)**1.8-.032),y,z],'concave_offroad_alloy_spoke',[sign,0,0],.07);
 }
 cylinder(wheel,m.rim,.079,.035,[ax-sign*.012,0,0],[0,0,PI/2],32,'six_lug_large_hub');
 cylinder(wheel,m.darkMetal,.041,.041,[ax-sign*.003,0,0],[0,0,PI/2],24,'black_centre_cap');
 for(let i=0;i<6;i++){const a=i*PI/3;cylinder(wheel,steel,.010,.047,[ax,.059*Math.cos(a),.059*Math.sin(a)],[0,0,PI/2],6,'six_wheel_lug');}
 for(let row=0;row<3;row++)for(let i=0;i<48;i++){const a=(i+(row%2)*.5)*2*PI/48,x=(row-1)*.081;box(wheel,tread,[.066,.008,.033],[x,.404*Math.cos(a),.404*Math.sin(a)],[a,(row-1)*.10,0],'staggered_all_terrain_tread');}
 // Fine raised shoulder blocks run onto both sidewalls, not floating letters.
 for(const side of[-1,1])for(let i=0;i<36;i++){const a=i*2*PI/36;box(wheel,tread,[.012,.042,.022],[side*.135,.355*Math.cos(a),.355*Math.sin(a)],[a,0,side*.20],'sidewall_shoulder_block');}
}
const frontWheel=rig.centers.FL[2],rearWheel=rig.centers.RL[2],archRadius=.492;
const stations=[
 {z:-2.36,w:.805,c:1.285,s:1.295,b:.438},{z:-2.22,w:.883,c:1.316,s:1.317,b:.414},
 {z:-1.45,w:.940,c:1.322,s:1.317,b:.400},{z:-.65,w:.939,c:1.311,s:1.294,b:.400},
 {z:.30,w:.933,c:1.290,s:1.275,b:.400},{z:1.05,w:.946,c:1.285,s:1.258,b:.422},
 {z:1.46,w:.959,c:1.257,s:1.227,b:.438},{z:1.92,w:.941,c:1.225,s:1.191,b:.458},
 {z:2.36,w:.889,c:1.190,s:1.158,b:.475}
];
const sample=z=>({w:interp(stations,z,'w'),c:interp(stations,z,'c'),s:interp(stations,z,'s'),b:interp(stations,z,'b')});
const noseZ=(x,y)=>2.36-.198*(Math.abs(x)/.94)**3-.018*(1-y/1.25)**2;
const tailZ=(x,y)=>-2.36+.13*(Math.abs(x)/.94)**4+.048*clamp((y-1.22)/.7,0,1);
// Roll the outer55mm of the bonnet/shoulder into the vertical flank. The
// previous power curve met the side at a hard angle and read as a boxy hood.
const topY=(x,z)=>{const a=sample(z),r=.055,edge=a.s-.040,ax=Math.min(Math.abs(x),a.w),inner=a.w-r;if(ax<=inner)return a.c+(edge+r-a.c)*(ax/inner)**2;const t=(ax-inner)/r;return edge+r*Math.sqrt(Math.max(0,1-t*t));};
const sideX=(z,y)=>{const a=sample(clamp(z,-2.36,2.36)),v=clamp((a.s-.04-y)/(a.s-.04-a.b),0,1);return a.w-.052*Math.sin(v*PI/2)+.015*Math.sin(v*PI)-.013*Math.exp(-(((v-.67)/.12)**2));};
// Large smoothly sampled front/side skin; actual cut-out arches below fenders.
surface(root,m.paint,132,42,(u,v)=>{const z=lerp(-2.36,2.36,u),a=sample(z),x=Math.sin((v-.5)*PI)*a.w;let zz=z;if(z>1.90)zz-=((z-1.90)/.46)**2*(2.36-noseZ(x,topY(x,z)));if(z<-2.16)zz+=((-z-2.16)/.20)**2*(tailZ(x,topY(x,z))+2.36);return[x,topY(x,z),zz];},'sculpted_hood_and_shoulders',false,(u,v)=>{const z=lerp(-2.36,2.36,u),x=Math.abs(Math.sin((v-.5)*PI)*sample(z).w);return z<1.02&&z>-2.22&&x<.805;});
for(const side of[-1,1])surface(root,m.paint,140,16,(u,v)=>{const z=lerp(-2.36,2.36,u),a=sample(z);let bottom=a.b;for(const center of[frontWheel,rearWheel]){const dz=z-center;if(Math.abs(dz)<archRadius)bottom=Math.max(bottom,.412+Math.sqrt(archRadius**2-dz**2));}const y=lerp(a.s-.04,bottom,v),x=side*sideX(z,y);let zz=z;if(z>1.9)zz-=((z-1.9)/.46)**2*(2.36-noseZ(x,y));if(z<-2.16)zz+=((-z-2.16)/.20)**2*(tailZ(x,y)+2.36);return[x,y,zz];},'sculpted_pajero_door_fender_skin',side<0);
const grilleHole=round([[-.688,1.176],[.688,1.176],[.502,.915],[-.502,.915]],.018,6);
const headPositive=round([[.474,1.175],[.897,1.217],[.901,1.135],[.829,1.070],[.421,1.017]],.019,7);
const frontOuter=round([[-.882,.477],[.882,.477],[.891,1.151],[.830,1.180],[-.830,1.180],[-.891,1.151]],.025);
const lowerHole=round([[-.47,.635],[.47,.635],[.512,.930],[-.512,.930]],.02);
panel(root,m.paint,frontOuter,[grilleHole,lowerHole,headPositive,headPositive.map(([x,y])=>[-x,y])],(x,y)=>[x,y,noseZ(x,y)],'rounded_nose_skin_with_real_lamp_recesses');
panel(root,rubber,grilleHole,[],(x,y)=>[x,y,noseZ(x,y)-.036],'recessed_upper_radiator');
panel(root,rubber,lowerHole,[],(x,y)=>[x,y,noseZ(x,y)-.035],'recessed_lower_radiator');
// Real honeycomb openings and bright horizontal crossbars in Dynamic Shield.
for(let row=0;row<3;row++)for(let i=-6;i<=6;i++){const x=i*.078+(row%2)*.039,y=1.010+row*.048;if(Math.abs(x)>.55-(1.16-y)*.3)continue;const pts=Array.from({length:6},(_,k)=>[x+.038*Math.cos(k*PI/3),y+.020*Math.sin(k*PI/3),noseZ(x,y)-.026]);line(root,m.darkMetal,pts,.0035,'hexagonal_radiator_cell',true);}
for(const y of[1.093,1.037])panel(root,chrome,round([[-.60,y+.013],[.60,y+.013],[.566,y-.013],[-.566,y-.013]],.004),[],(x,y)=>[x,y,noseZ(x,y)+.008],'double_chrome_grille_bar');
panel(root,chrome,round([[-.871,1.213],[.871,1.213],[.820,1.163],[.549,1.140],[-.549,1.140],[-.820,1.163]],.009),[],(x,y)=>[x,y,noseZ(x,y)+.012],'chrome_bonnet_leading_garnish');
const headlightPositions=[];
for(const side of[-1,1]){
 const lamp=headPositive.map(([x,y])=>[side*x,y]);
 panel(root,lampDark,lamp,[],(x,y)=>[x,y,noseZ(x,y)-.021],'swept_projector_headlamp_housing');
 line(root,chrome,lamp.map(([x,y])=>[x,y,noseZ(x,y)+.008]),.004,'headlamp_perimeter',true);
 for(const [xx,yy,r]of[[.744,1.137,.043],[.628,1.105,.031],[.852,1.159,.027]]){
  const cx=xx*side;
  surface(root,lightChrome,32,8,(u,v)=>{const a=u*2*PI,rr=lerp(.006,r,v),x=cx+Math.cos(a)*rr,y=yy+Math.sin(a)*rr;return[x,y,noseZ(x,y)-.010-.030*(1-v)**2];},'projector_chrome_bowl',true);
  panel(root,m.front,circle(cx,yy,r*.51,28),[],(x,y)=>[x,y,noseZ(x,y)+.002],'projector_light_core');
 }
 spline(root,m.front,[[side*.462,1.051,noseZ(side*.462,1.051)+.011],[side*.684,1.093,noseZ(side*.684,1.093)+.012],[side*.851,1.166,noseZ(side*.851,1.166)+.012]],.006,'swept_white_LED_signature');
 panel(root,clearLens,lamp,[],(x,y)=>[x,y,noseZ(x,y)+.014],'clear_shaped_headlamp_cover');
 const shield=round([[.518,1.012],[.652,1.062],[.619,.958],[.618,.811],[.690,.706],[.847,.676],[.685,.648],[.559,.725],[.519,.879]],.012,6).map(([x,y])=>[side*x,y]);
 panel(root,chrome,shield,[],(x,y)=>[x,y,noseZ(x,y)+.015],'dynamic_shield_chrome_cheek');
 const sideIntake=round([[.690,.744],[.844,.753],[.872,.982],[.676,1.017],[.659,.842]],.018).map(([x,y])=>[side*x,y]);
 panel(root,m.carbon,sideIntake,[],(x,y)=>[x,y,noseZ(x,y)+.009],'outer_black_bumper_inlet');
 headlightPositions.push([side*.744,1.137,noseZ(side*.744,1.137)+.015]);
}
for(let row=0;row<5;row++)for(let i=-5;i<=5;i++){const x=i*.075+(row%2)*.0375,y=.66+row*.051;line(root,m.darkMetal,[[x-.034,y,noseZ(x,y)-.022],[x-.017,y+.021,noseZ(x,y)-.022],[x+.017,y+.021,noseZ(x,y)-.022],[x+.034,y,noseZ(x,y)-.022],[x+.017,y-.021,noseZ(x,y)-.022],[x-.017,y-.021,noseZ(x,y)-.022]],.0035,'large_lower_hexagonal_grille',true);}
// Three-dimensional Mitsubishi three-diamond badge; no user numberplate.
function mitsubishi(x,y,z,size,back=false){const tris=[[[0,0],[-.18,.31],[0,.64],[.18,.31]],[[0,0],[-.36,0],[-.56,-.30],[-.20,-.30]],[[0,0],[.20,-.30],[.56,-.30],[.36,0]]];for(const pts of tris)panel(root,chrome,pts.map(([a,b])=>[x+a*size,y+b*size]),[],(xx,yy)=>[xx,yy,z],back?'rear_three_diamonds':'front_three_diamonds',[0,0,back?-1:1]);}
roundedPanel(root,lampDark,.25,.216,[0,1.103,noseZ(0,1.103)+.018],{radius:.03,depth:.008,name:'front_badge_black_mount'});
mitsubishi(0,1.079,noseZ(0,1.079)+.032,.227);

// Continuous muscular fender bands and genuine wheel wells. Their paint can
// change independently from the tyres and dark liners.
for(const zc of[frontWheel,rearWheel])for(const side of[-1,1]){
 surface(root,m.paint,60,8,(u,v)=>{const a=u*PI,r=archRadius+v*.061,z=zc+r*Math.cos(a),y=.412+r*Math.sin(a);return[side*(sideX(z,y)+.007+.017*Math.sin(v*PI)),y,z];},'rounded_sculpted_flared_arch',side>0);
 surface(root,rubber,60,5,(u,v)=>{const a=u*PI,z=zc+(archRadius-.004)*Math.cos(a),y=.412+(archRadius-.004)*Math.sin(a);return[side*(sideX(z,y)+.006-v*.24),y,z];},'deep_open_wheel_well',side<0);
 for(const end of[-1,1]){
  const z=zc+end*archRadius;
  spline(root,m.paint,[[side*(sideX(z,.415)+.008),.416,z],[side*(sideX(z,.46)+.013),.46,z+end*.003]],.021,'arch_rolled_end');
 }
 roundedPanel(root,rubber,.24,.29,[side*.821,.274,zc-.18],{radius:.02,depth:.018,name:'flexible_mud_flap'});
}
box(root,rubber,[1.58,.065,3.81],[0,.407,-.01],undefined,'raised_dark_undertray');
for(const x of[-.49,.49])box(root,m.darkMetal,[.10,.14,3.76],[x,.34,-.02],undefined,'ladder_frame_rail');
for(const z of[frontWheel,rearWheel]){cylinder(root,m.darkMetal,.054,1.55,[0,.355,z],[0,0,PI/2],24,'solid_axle_tube');sphere(root,m.darkMetal,[.155,.12,.12],[0,.34,z],18,'differential_housing');}

// Cabin shape is a dedicated raked, narrowing Pajero Sport greenhouse. The
// rear side glazing sweeps upward into the small pointed rear-quarter window.
const roofY=(z,x)=>1.936+.010*Math.sin(clamp((z+2.09)/2.43,0,1)*PI)-.035*(Math.abs(x)/.778)**4-.024*Math.exp(-(((z+2.09)/.13)**2));
const roofOutline=round([[-.638,-2.10],[.638,-2.10],[.778,-1.98],[.778,.29],[.690,.43],[-.690,.43],[-.778,.29],[-.778,-1.98]],.075,8);
panel(root,m.paint,roofOutline,[],(x,z)=>[x,roofY(z,x),z],'pajero_closed_sculpted_roof',[0,1,0],.105);
for(let i=0;i<roofOutline.length;i++){const j=(i+1)%roofOutline.length;surface(root,m.paint,1,6,(u,v)=>{const x=lerp(roofOutline[i][0],roofOutline[j][0],u),z=lerp(roofOutline[i][1],roofOutline[j][1],u),angle=v*PI/2;return[x-Math.sign(x)*.014*(1-Math.cos(angle)),roofY(z,x)-.040*Math.sin(angle),z];},'roof_rolled_edge');}
const cabinX=(z,y)=>{const t=clamp((y-1.235)/.66,0,1),back=clamp((-z-1.65)/.72,0,1);return .928-.122*t-.031*t*t-.051*back*back;};
const sideOutline=round([[1.063,1.237],[.423,1.862],[.242,1.899],[-1.921,1.891],[-2.136,1.811],[-2.335,1.312],[-2.282,1.276]],.055,7);
const frontGlass=round([[.923,1.294],[.351,1.827],[.203,1.846],[-.281,1.840],[-.301,1.284]],.030,7);
const rearDoorGlass=round([[-.374,1.285],[-.353,1.841],[-1.309,1.832],[-1.341,1.382],[-1.210,1.285]],.027,7);
const quarterGlass=round([[-1.416,1.825],[-1.920,1.806],[-2.068,1.744],[-2.032,1.603],[-1.672,1.409],[-1.441,1.367]],.044,7);
const glassHoles=[frontGlass,rearDoorGlass,quarterGlass];
for(const side of[-1,1]){
 const map=(z,y,o=0)=>[side*(cabinX(z,y)+o),y,z];
 panel(root,m.paint,sideOutline,glassHoles,(z,y)=>map(z,y),'stamped_pajero_greenhouse',[side,0,0],.105);
 for(const [i,boundary]of glassHoles.entries()){
  panel(root,m.glass,boundary,[],(z,y)=>map(z,y,.002),'tinted_side_window_'+i,[side,0,0],.10);
  line(root,rubber,boundary.map(([z,y])=>map(z,y,.006)),.006,'window_rubber_surround',true);
 }
 // Black pillar garnishes join glass at B/C, distinct from painted A and D.
 panel(root,rubber,round([[-.290,1.281],[-.272,1.843],[-.367,1.844],[-.387,1.286]],.01),[],(z,y)=>map(z,y,.004),'gloss_black_B_pillar',[side,0,0]);
 panel(root,rubber,round([[-1.300,1.343],[-1.292,1.842],[-1.425,1.836],[-1.453,1.367]],.015),[],(z,y)=>map(z,y,.006),'black_C_pillar',[side,0,0]);
 // Belt trim is low in front, rises into the characteristic pinched quarter.
 spline(root,chrome,[[side*(cabinX(.89,1.278)+.009),1.278,.89],[side*(cabinX(-.28,1.273)+.009),1.273,-.28],[side*(cabinX(-1.23,1.276)+.009),1.276,-1.23],[side*(cabinX(-1.67,1.407)+.009),1.407,-1.67],[side*(cabinX(-2.047,1.608)+.009),1.608,-2.047],[side*(cabinX(-2.082,1.756)+.009),1.756,-2.082]],.009,'rising_chrome_window_surround');
 spline(root,chrome,[[side*(cabinX(.36,1.850)+.010),1.850,.36],[side*(cabinX(-1.42,1.852)+.010),1.852,-1.42],[side*(cabinX(-1.93,1.829)+.009),1.829,-1.93],[side*(cabinX(-2.082,1.756)+.009),1.756,-2.082]],.006,'upper_chrome_window_surround');
 for(const [z0,z1]of[[.39,-.31],[-.36,-1.32]])spline(root,rubber,[[side*(cabinX(z0,1.858)+.013),1.858,z0],[side*(cabinX(z0-.12,1.876)+.020),1.876,z0-.12],[side*(cabinX(z1,1.863)+.020),1.863,z1]],.016,'smoked_rain_deflector');
 // Flush panel gaps and a stamped double body crease, not cylindrical strips.
 for(const seam of[[[1.04,1.229],[.995,1.02],[.987,.58],[.809,.443],[-.266,.443],[-.315,1.270]],[[-.315,1.270],[-.266,.443],[-.935,.443],[-1.278,.695],[-1.396,1.145],[-1.420,1.367]]])line(root,rubber,seam.map(([z,y])=>[side*(sideX(z,y)+.0025),y,z]),.0033,'precision_door_shutline');
 for(const z of[-.106,-1.086]){
  panel(root,rubber,round([[z-.091,1.178],[z+.091,1.178],[z+.091,1.227],[z-.091,1.227]],.018),[],(zz,y)=>[side*(sideX(zz,y)+.006),y,zz],'handle_finger_recess',[side,0,0]);
  roundedPanel(root,chrome,.152,.030,[side*(sideX(z,1.210)+.017),1.210,z],{radius:.012,rotation:[0,side*PI/2,0],depth:.014,name:'chrome_door_pull'});
 }
 const lowerPress=round([[.92,.515],[-.94,.515],[-1.04,.608],[-.84,.638],[.77,.626]],.04,6);
 panel(root,m.aeroPaint,lowerPress,[],(z,y)=>[side*(sideX(z,y)+.004+.009*Math.sin(clamp((y-.515)/.125,0,1)*PI)),y,z],'sculpted_lower_door_stamp',[side,0,0],.10);
 // Off-road running board: broad black grip top and brushed silver outer edge.
 const step=round([[side*.822,1.03],[side*1.012,.955],[side*1.012,-1.00],[side*.822,-1.10]],.045,7);
 panel(root,rubber,step,[],(x,z)=>[x,.388,z],'wide_running_board_grip',[0,1,0]);
 spline(root,chrome,[[side*.837,.374,1.038],[side*.998,.374,.941],[side*1.000,.374,-.98],[side*.858,.374,-1.084]],.025,'brushed_aluminium_running_board_edge');
 for(let i=0;i<18;i++)box(root,m.darkMetal,[.134,.006,.015],[side*.923,.395,.86-i*.1],undefined,'step_anti_slip_rib');
 // Large silver mirror with a black base and a thin indicator strip.
 spline(root,rubber,[[side*.901,1.352,.843],[side*1.035,1.415,.827]],.037,'mirror_arm');
 roundedPanel(root,rubber,.249,.167,[side*1.061,1.462,.813],{radius:.050,depth:.111,name:'black_mirror_lower_shell'});
 roundedPanel(root,chrome,.246,.125,[side*1.061,1.490,.831],{radius:.047,depth:.091,name:'silver_mirror_cap'});
 roundedPanel(root,m.glass,.219,.121,[side*1.061,1.467,.808],{radius:.039,rotation:[0,PI,0],depth:.004,name:'mirror_reflective_face'});
 roundedPanel(root,m.front,.204,.013,[side*1.061,1.451,.928],{radius:.005,depth:.003,name:'mirror_turn_indicator_strip'});
 // Roof rails retain the real low, front-to-rear profile of the reference car.
 spline(root,chrome,[[side*.664,1.914,.277],[side*.689,1.975,.140],[side*.689,1.978,-1.81],[side*.651,1.912,-2.01]],.019,'silver_roof_rail');
 for(const z of[.17,-.88,-1.87])roundedPanel(root,rubber,.10,.051,[side*.681,1.924,z],{radius:.016,rotation:[0,side*PI/2,0],depth:.064,name:'roof_rail_black_mount'});
 // Sharply defined hood shut lines and raised power ridges curve with bonnet.
 const hood=[];for(let i=0;i<=40;i++){const z=lerp(1.06,2.323,i/40),x=side*lerp(.733,.651,i/40);hood.push([x,topY(x,z)+.003,z-(z>1.9?((z-1.9)/.46)**2*(2.36-noseZ(x,topY(x,z))):0)]);}line(root,rubber,hood,.0032,'bonnet_perimeter');
 surface(root,m.paint,36,6,(u,v)=>{const z=lerp(1.11,2.26,u),cx=side*lerp(.56,.47,u),x=cx+(v-.5)*.052;return[x,topY(x,z)+.009*Math.sin(v*PI)*Math.sin(u*PI),z];},'subtle_bonnet_power_ridge');
}
// Tapered fuel filler flap on rear left quarter, following the convex skin.
const filler=round([[-1.450,1.198],[-1.450,1.050],[-1.215,1.050],[-1.215,1.198]],.026,7);
line(root,rubber,filler.map(([z,y])=>[sideX(z,y)+.004,y,z]),.0032,'flush_fuel_flap',true);

// Large bowed windshield with a proper black frit, laid-back A pillars,
// cowl vents and two fine windscreen wipers.
const windOutline=round([[-.843,0],[.843,0],[.708,1],[-.708,1]],.043,8);
const windMap=(x,t,o=0)=>{const half=lerp(.843,.708,t),q=x/half;return[x,lerp(1.278,1.855,t)+.017*(1-q*q),lerp(1.066,.394,t)+.031*(1-q*q)+o];};
panel(root,m.glass,windOutline,[],(x,t)=>windMap(x,t),'bowed_tinted_windshield',[0,.6,1],.08);
line(root,rubber,windOutline.map(([x,t])=>windMap(x,t,.003)),.014,'windscreen_bonded_frame',true);
for(const side of[-1,1])surface(root,m.paint,32,10,(u,v)=>{const a=windMap(side*lerp(.843,.708,u),u),z=lerp(1.063,.423,u),y=lerp(1.237,1.862,u),b=[side*cabinX(z,y),y,z];return a.map((n,i)=>lerp(n,b[i],v));},'sculpted_A_pillar',side<0);
surface(root,m.paint,30,8,(u,v)=>{const q=u*2-1,x=q*lerp(.708,.756,v);return[x,lerp(1.855+.017*(1-q*q),roofY(.415,x),v),lerp(.394,.415,v)];},'windshield_header_closed_edge');
panel(root,rubber,round([[-.818,1.263],[.818,1.263],[.795,1.293],[-.795,1.293]],.012),[],(x,y)=>[x,y,1.079],'windscreen_cowl');
for(let i=-13;i<=13;i++)box(root,m.darkMetal,[.030,.004,.035],[i*.053,1.269,1.066],[-.25,0,0],'cowl_vent_slot');
for(const side of[-1,1]){spline(root,rubber,[[side*.125,1.292,1.083],[side*.376,1.310,1.055],[side*.669,1.319,1.020]],.006,'windscreen_wiper_arm');spline(root,rubber,[[side*.318,1.304,1.063],[side*.665,1.320,1.017]],.010,'front_wiper_blade');}

// Rear tailgate, wide flush glass, high roof visor and long vertical tail lamps.
const rearFrame=round([[-.802,1.297],[.802,1.297],[.718,1.819],[.637,1.885],[-.637,1.885],[-.718,1.819]],.055,7);
const rearGlass=round([[-.689,1.353],[.689,1.353],[.639,1.780],[.568,1.814],[-.568,1.814],[-.639,1.780]],.045,7);
const rearMap=(x,y,o=0)=>[x,y,tailZ(x,y)+.16*clamp((y-1.28)/.62,0,1)+o];
panel(root,m.paint,rearFrame,[rearGlass],(x,y)=>rearMap(x,y),'curved_rear_window_frame',[0,0,-1],.09);
panel(root,m.glass,rearGlass,[],(x,y)=>rearMap(x,y,-.004),'rear_tinted_glass',[0,0,-1],.09);
line(root,rubber,rearGlass.map(([x,y])=>rearMap(x,y,-.008)),.012,'rear_window_rubber_seal',true);
for(let i=0;i<7;i++){const y=1.397+i*.052,half=lerp(.672,.612,(y-1.353)/.46);line(root,m.darkMetal,[rearMap(-half,y,-.008),rearMap(half,y,-.008)],.0009,'rear_glass_demister');}
for(const side of[-1,1])surface(root,m.paint,30,14,(u,v)=>{const y=lerp(1.297,1.885,u),a=rearMap(side*lerp(.802,.637,u),y),z=lerp(-2.335,-2.058,u),b=[side*cabinX(z,y),y,z];return a.map((n,i)=>lerp(n,b[i],v));},'rounded_D_pillar_corner',side<0);
const hatchOutline=round([[-.753,.633],[.753,.633],[.784,.861],[.785,1.305],[-.785,1.305],[-.784,.861]],.042,7);
const plateRecess=round([[-.354,.993],[.354,.993],[.378,1.194],[-.378,1.194]],.028,7);
const hatchMap=(x,y,o=0)=>[x,y,-2.367+.055*(Math.abs(x)/.79)**4-.021*Math.exp(-(((y-.70)/.15)**2))+o];
panel(root,m.paint,hatchOutline,[plateRecess],(x,y)=>hatchMap(x,y),'sculpted_tailgate_with_inset_plate',[0,0,-1],.09);
line(root,rubber,hatchOutline.map(([x,y])=>hatchMap(x,y,-.003)),.0035,'tailgate_panel_gap',true);
const recessInset=plateRecess.map(([x,y])=>[x*.91,1.091+(y-1.091)*.82]);
for(let i=0;i<plateRecess.length;i++){const j=(i+1)%plateRecess.length;surface(root,m.paint,1,4,(u,v)=>{const a=plateRecess[i].map((x,k)=>lerp(x,plateRecess[j][k],u)),b=recessInset[i].map((x,k)=>lerp(x,recessInset[j][k],u));return[lerp(a[0],b[0],v),lerp(a[1],b[1],v),lerp(hatchMap(...a)[2],-2.310,v)];},'plate_recess_rounded_sidewall',true);}
panel(root,rubber,recessInset,[],(x,y)=>[x,y,-2.310],'black_rear_plate_recess',[0,0,-1]);
roundedPanel(root,m.darkMetal,.586,.153,[0,1.096,-2.323],{radius:.014,rotation:[0,PI,0],depth:.009,name:'unmarked_rear_plate'});
const rearChrome=round([[-.688,1.259],[.688,1.259],[.643,1.213],[.380,1.201],[-.380,1.201],[-.643,1.213]],.012,6);
panel(root,chrome,rearChrome,[],(x,y)=>hatchMap(x,y,-.006),'wide_rear_chrome_garnish',[0,0,-1]);
mitsubishi(0,1.329,rearMap(0,1.329,-.024)[2],.158,true);
const tailLamp=round([[.765,.715],[.874,.725],[.898,1.407],[.821,1.620],[.731,1.665],[.701,1.521],[.767,1.424]],.018,7);
const rearLampPositions=[];
for(const side of[-1,1]){
 const map=(x,y,o=0)=>[side*x,y,-2.361+.170*clamp((x-.75)/.15,0,1)**1.65+.105*clamp((y-1.28)/.42,0,1)+o];
 panel(root,rubber,tailLamp,[],(x,y)=>map(x,y,.005),'long_vertical_tail_lamp_black_housing',[side*.5,0,-1],.065);
 const redShape=tailLamp.map(([x,y])=>[.802+(x-.802)*.90,1.18+(y-1.18)*.98]);
 panel(root,m.rear,redShape,[],(x,y)=>map(x,y,-.012),'pajero_vertical_red_tail_lamp',[side*.5,0,-1],.06);
 const clearShape=round([[.801,1.173],[.866,1.190],[.865,1.363],[.800,1.398],[.774,1.353]],.011,5);
 panel(root,clearRear,clearShape,[],(x,y)=>map(x,y,-.017),'vertical_clear_indicator_chamber',[side*.5,0,-1],.05);
 for(let i=0;i<9;i++){const y=1.206+i*.017;line(root,chrome,[map(.811,y,-.019),map(.856,y+.008,-.019)],.0017,'rear_clear_lens_prism');}
 spline(root,m.rear,[map(.799,.765,-.019),map(.809,1.115,-.019),map(.795,1.421,-.018),map(.741,1.527,-.018),map(.769,1.604,-.018)],.012,'continuous_vertical_tail_light_guide');
 rearLampPositions.push(map(.804,1.10,-.02));
}
// Integrated roof spoiler with substantial side returns and red stop lamp.
const spoiler=round([[-.757,1.937],[.757,1.937],[.794,1.907],[.776,1.834],[.719,1.835],[.684,1.883],[-.684,1.883],[-.719,1.835],[-.776,1.834],[-.794,1.907]],.016,6);
shape(root,m.aeroPaint,spoiler,{position:[0,0,-2.291],depth:.199,bevel:.009,name:'moulded_roof_spoiler'});
roundedPanel(root,m.rear,.38,.023,[0,1.883,-2.302],{radius:.008,rotation:[0,PI,0],depth:.004,name:'high_mounted_stop_light'});
spline(root,rubber,[rearMap(-.23,1.365,-.023),rearMap(-.16,1.405,-.024),rearMap(.385,1.405,-.025)],.007,'rear_wiper_arm');
spline(root,rubber,[rearMap(-.16,1.407,-.029),rearMap(.385,1.407,-.029)],.011,'rear_wiper_blade');
sphere(root,rubber,[.025,.018,.013],rearMap(-.23,1.365,-.025),16,'rear_wiper_pivot');
// Small sculpted shark-fin antenna, separate from the roof rail.
shape(root,m.paint,round([[-.105,0],[.118,0],[.012,.022],[-.029,.091],[-.053,.094]],.008,4),{position:[-.016,roofY(-1.48,0)-.004,-1.55],depth:.032,rotation:[0,PI/2,0],bevel:.007,name:'roof_shark_fin'});

// Fabricated steel off-road bumpers preserve the photo's pointed outer wings,
// recovery hooks and central winch structure. These are body-scale 3D parts.
const frontBumper=round([[-.981,.516],[-.948,.694],[-.700,.710],[-.425,.615],[.425,.615],[.700,.710],[.948,.694],[.981,.516],[.802,.436],[-.802,.436]],.008,3);
const bumperMap=(x,y)=>[x,y,2.565-.215*(Math.abs(x)/.99)**2];
const slots=[];for(const side of[-1,1])for(const x of[.63,.685])slots.push(round([[side*(x-.012),.525],[side*(x+.012),.525],[side*(x+.012),.576],[side*(x-.012),.576]],.006,3));
const winchSlot=round([[-.245,.504],[.245,.504],[.245,.545],[-.245,.545]],.010,5);slots.push(winchSlot);
for(const side of[-1,1])slots.push(round([[side*.786,.517],[side*.898,.517],[side*.898,.608],[side*.786,.608]],.009,4));
extrudedMapped(root,steel,frontBumper,slots,bumperMap,.165,'fabricated_front_steel_bumper');
// Upper folded edge catches light and establishes real bumper thickness.
for(let i=0;i<frontBumper.length;i++){const j=(i+1)%frontBumper.length;if(frontBumper[i][1]<.60&&frontBumper[j][1]<.60)continue;surface(root,steel,1,3,(u,v)=>{const a=frontBumper[i].map((x,k)=>lerp(x,frontBumper[j][k],u)),p=bumperMap(...a);return[p[0],p[1]+.015*Math.sin(v*PI),p[2]-.19*v];},'front_bumper_folded_top');}
for(const side of[-1,1]){
 panel(root,rubber,round([[side*.786,.517],[side*.898,.517],[side*.898,.608],[side*.786,.608]],.009),[],(x,y)=>{const p=bumperMap(x,y);return[p[0],p[1],p[2]-.035];},'inset_square_bumper_lamp');
 for(let iy=0;iy<3;iy++)for(let ix=0;ix<3;ix++){const x=side*(.810+ix*.027),y=.536+iy*.026;panel(root,m.front,circle(x,y,.008,12),[],(x,y)=>{const p=bumperMap(x,y);return[p[0],p[1],p[2]-.021];},'recovery_bumper_led');}
 const support=round([[side*.235,.615],[side*.375,.615],[side*.313,.937],[side*.258,.953],[side*.203,.902]],.007,3);
 extrudedMapped(root,steel,support,[],(x,y)=>[x,y,lerp(2.548,2.441,clamp((y-.615)/.34,0,1))],.070,'angular_winch_guard_stanchion');
 for(const y of[.716,.814]){const x=side*.28;panel(root,rubber,circle(x,y,.014,12),[],(x,y)=>[x,y,2.548-.107*((y-.615)/.34)+.002],'winch_guard_bolt');}
}
box(root,steel,[.541,.045,.092],[0,.928,2.437],[-.17,0,0],'upper_winch_guard_crosspiece');
box(root,m.darkMetal,[.571,.064,.086],[0,.650,2.487],undefined,'central_winch_fairlead');
for(const side of[-1,1])cylinder(root,chrome,.014,.090,[side*.24,.650,2.535],[PI/2,0,0],12,'fairlead_roller_bolt');
function shackle(x,y,z,front){const direction=front?1:-1;box(root,steel,[.038,.080,.075],[x,y+.035,z-direction*.030],undefined,'welded_recovery_point');cylinder(root,recoveryRed,.017,.102,[x,y+.018,z+direction*.027],[0,0,PI/2],16,'red_recovery_pin');const pts=[];for(let k=0;k<=28;k++){const a=PI*.12+(PI*1.76)*k/28;pts.push([x+.041*Math.cos(a),y-.035+.056*Math.sin(a),z+direction*.050]);}spline(root,m.darkMetal,pts,.012,'steel_D_recovery_shackle');}
for(const x of[-.536,.536])shackle(x,.423,bumperMap(x,.45)[2]+.018,true);
const rearBumper=round([[-.968,.470],[-.954,.635],[-.722,.671],[-.459,.641],[.459,.641],[.722,.671],[.954,.635],[.968,.470],[.791,.433],[-.791,.433]],.008,3);
const rbMap=(x,y)=>[x,y,-2.555+.16*(Math.abs(x)/.99)**2];
const rearSlots=[];for(const side of[-1,1])for(let i=0;i<3;i++){const x=side*(.53+i*.046);rearSlots.push(round([[x-.013,.507],[x+.013,.507],[x+.013,.542],[x-.013,.542]],.003,2));}
rearSlots.push(round([[-.071,.438],[.071,.438],[.071,.534],[-.071,.534]],.008,3));
extrudedMapped(root,steel,rearBumper,rearSlots,rbMap,.161,'fabricated_rear_recovery_bumper',[0,0,-1]);
for(const side of[-1,1]){
 const reflector=round([[side*.738,.576],[side*.898,.568],[side*.894,.598],[side*.750,.606]],.008,5);
 panel(root,m.rear,reflector,[],(x,y)=>{const p=rbMap(x,y);return[p[0],p[1],p[2]-.008];},'rear_steel_bumper_red_reflector',[0,0,-1]);
 shackle(side*.744,.425,rbMap(side*.744,.44)[2]-.012,false);
 roundedPanel(root,clearRear,.070,.055,[side*.352,.523,rbMap(side*.352,.523)[2]-.008],{radius:.008,rotation:[0,PI,0],depth:.005,name:'rear_bumper_work_lamp'});
}
box(root,m.darkMetal,[.124,.120,.155],[0,.395,-2.495],undefined,'square_tow_receiver');
box(root,steel,[.084,.074,.130],[0,.338,-2.520],undefined,'lower_tow_bracket');
box(root,rubber,[.067,.061,.009],[0,.393,-2.577],undefined,'receiver_hitch_dark_opening');
for(const side of[-1,1])spline(root,rubber,[[side*.83,.635,-2.33],[side*.82,.673,-2.05]],.031,'rear_bumper_side_wrap');
// Exhaust is low to one side and finishes ahead of the custom rear bumper.
cylinder(root,chrome,.044,.25,[.61,.335,-2.32],[PI/2,0,0],32,'diesel_exhaust_tip');
cylinder(root,rubber,.036,.010,[.61,.335,-2.450],[PI/2,0,0],24,'exhaust_dark_opening');

// Restrained cabin geometry sits behind glazing. Runtime supplies steering and
// live instruments in cockpit view; this asset carries seats, dash and console.
for(const z of[.01,-.89,-1.65])for(const side of[-1,1]){
 roundedPanel(root,m.seat,.375,.47,[side*.36,1.154,z],{radius:.075,depth:.18,rotation:[.13,0,0],name:'SUV_seat_back'});
 sphere(root,m.seat,[.151,.110,.087],[side*.36,1.503,z+.005],18,'seat_headrest');
 roundedPanel(root,m.seat,.375,.36,[side*.36,.950,z+.17],{radius:.06,depth:.09,rotation:[PI/2,0,0],name:'seat_cushion'});
}
box(root,rubber,[1.47,.155,.36],[0,1.260,.824],undefined,'SUV_dashboard_shell');
box(root,m.darkMetal,[.24,.30,.64],[0,1.004,.28],undefined,'central_tunnel_console');
// Badges use small simple strokes rather than painted photo textures.
const glyphs={A:[[[0,0],[.5,1],[1,0]],[[.2,.4],[.8,.4]]],J:[[[0,1],[1,1],[1,.12],[.85,0],[.15,0],[0,.15]]],E:[[[1,1],[0,1],[0,0],[1,0]],[[0,.5],[.8,.5]]],R:[[[0,0],[0,1],[1,1],[1,.55],[0,.55]],[[.5,.55],[1,0]]],O:[[[.15,0],[0,.15],[0,.85],[.15,1],[.85,1],[1,.85],[1,.15],[.85,0],[.15,0]]],P:[[[0,0],[0,1],[1,1],[1,.55],[0,.55]]],S:[[[1,1],[0,1],[0,.55],[1,.45],[1,0],[0,0]]],T:[[[0,1],[1,1]],[[.5,1],[.5,0]]],D:[[[0,0],[0,1],[.75,1],[1,.75],[1,.25],[.75,0],[0,0]]],K:[[[0,0],[0,1]],[[1,1],[0,.5],[1,0]]],' ' :[]};
function lettering(text,x,y,h,advance,material){for(let i=0;i<text.length;i++)for(const stroke of glyphs[text[i]]||[])line(root,material,stroke.map(([a,b])=>hatchMap(-(x+i*advance+a*advance*.70),y+b*h,-.008)),h*.05,'raised_model_badge');}
lettering('PAJERO SPORT',-.708,.880,.026,.033,chrome);lettering('DAKAR',.454,1.040,.020,.030,chrome);
const metadata={author:'UVelocity original mesh authoring',source:'scripts/build-pajero.cjs',displayName:'Mitsubishi Pajero Sport',referenceBased:true,officialManufacturerAsset:false,representation:'original-reference-recreation',revision:'suv-expansion-1.5.0',wheelRadius:rig.radius,wheelWidth:rig.width,wheelCenters:rig.centers,wheelbase:2.80,track:1.64,headlightPositions,rearLampPositions,exhaustPositions:[[.61,.335,-2.455]],tail:-2.58,exhaustX:.61,exhaustY:.335,up:'+Y',forward:'+Z',units:'metres',paintMaterials:['paint_body','paint_aero'],rimMaterial:'rim_paint',defaultColor:'#151a1d',cockpitEye:[-.38,1.52,.24],features:['sculpted SUV shell','open wheel arches','twelve-spoke dark alloys','all-terrain tread blocks','Dynamic Shield chrome grille','long vertical red rear lamps','running boards','roof rails','steel off-road bumpers','red recovery pins and D shackles','rear tow hitch','original photo-reference recreation']};
const output=path.resolve(__dirname,'../../work/pajero-v150-assets',id+'.glb');
const report=exportGLB(root,output,metadata);
// Clear lamp lenses use physical transmissive optics; only this new asset is
// patched. The shared exporter and every pre-existing vehicle stay unchanged.
{
 const glb=fs.readFileSync(output),n=glb.readUInt32LE(12),doc=JSON.parse(glb.subarray(20,20+n).toString()),bin=glb.subarray(28+n);
 for(const material of doc.materials)if(material.name==='pajero_clear_lens'){material.pbrMetallicRoughness.baseColorFactor=[.94,.98,1,.14];material.pbrMetallicRoughness.metallicFactor=0;material.pbrMetallicRoughness.roughnessFactor=.045;material.alphaMode='BLEND';material.doubleSided=true;material.extensions={KHR_materials_transmission:{transmissionFactor:.93}};doc.extensionsUsed=[...new Set([...(doc.extensionsUsed||[]),'KHR_materials_transmission'])];}
 let json=Buffer.from(JSON.stringify(doc));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);const h=Buffer.alloc(20),b=Buffer.alloc(8);h.write('glTF');h.writeUInt32LE(2,4);h.writeUInt32LE(28+json.length+bin.length,8);h.writeUInt32LE(json.length,12);h.write('JSON',16);b.writeUInt32LE(bin.length);b.writeUInt32LE(0x004e4942,4);const result=Buffer.concat([h,json,b,bin]);fs.writeFileSync(output,result);report.bytes=result.length;
}
if(report.bounds.min[1]<-.002||report.bytes>9*1024*1024||report.triangles>260000)throw new Error('Pajero geometry exceeds ground/budget guard');
const data={...report,length:report.dimensions[2]};fs.writeFileSync(output.replace(/\.glb$/,'.metadata.json'),JSON.stringify(data,null,2)+'\n');
if(process.argv.includes('--publish')){const target=path.resolve(__dirname,'../public/game/assets/cars',id+'.glb');fs.copyFileSync(output,target);fs.writeFileSync(target.replace(/\.glb$/,'.metadata.json'),JSON.stringify({...data,file:'/game/assets/cars/'+id+'.glb'},null,2)+'\n');}
console.log(JSON.stringify({id,file:output,bytes:report.bytes,triangles:report.triangles,meshCount:report.meshCount,dimensions:report.dimensions,published:process.argv.includes('--publish')},null,2));
