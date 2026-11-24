'use strict';
/** Original reference-based Toyota Fortuner GR Sport reconstruction.
 * Black front/rear references supplied 23 November 2026 are authoritative;
 * the white reference informs cabin/shoulders only. Approximate game dimensions,
 * not manufacturer CAD. +Y up, +Z forward. Run with --publish to update this asset.
 */
const fs=require('node:fs'),path=require('node:path');
const K=require('./modeling-kit.cjs');
const {THREE:T,createModel,materials,mat,mesh,box,sphere,cylinder,tube,surface,bodyLoft,shape,roundedPanel,wheelRig,exportGLB,lerp}=K;
const PI=Math.PI,id='toyota-fortuner';
const root=createModel(id,{provenance:'Original UVelocity Toyota Fortuner GR Sport recreation from the three user-supplied 23 November 2026 photos; approximate game geometry, not a scan or manufacturer model.'});
const m=materials(0x171c22);
m.paint.roughness=.23;m.rim.color.setHex(0x272d33);m.rim.roughness=.30;m.glass.color.setHex(0x12232c);
const chrome=mat('fortuner_satin_chrome',0x9aa5af,.90,.23),rubber=mat('fortuner_window_rubber',0x080c10,.05,.57),cladding=mat('fortuner_cladding',0x1a2026,.15,.48),grille=mat('fortuner_grille',0x070b0e,.16,.42),reflector=mat('fortuner_reflector',0x8d9aa6,.88,.15),plate=mat('fortuner_plate',0x0b131b,.08,.55),white=mat('fortuner_lettering',0xd3dce1,.22,.38),lens=mat('fortuner_lamp_lens',0x788b9e,.55,.16);
const frontWheel=1.435,rearWheel=-1.315,r=.400;
const rig=wheelRig(root,m,{wheelbase:2.75,track:1.60,radius:r,width:.265,zOffset:.06,spokes:6,rimRadius:.269});

function contour(parent,material,points,radius=.007,name='contour',closed=false){
 const curve=new T.CurvePath();for(let i=0;i<points.length-(closed?0:1);i++)curve.add(new T.LineCurve3(new T.Vector3(...points[i]),new T.Vector3(...points[(i+1)%points.length])));
 return mesh(parent,new T.TubeGeometry(curve,Math.max(4,points.length*3),radius,6,closed),material,name);
}
function rounded(points,radius=.025,steps=4){const out=[];for(let i=0;i<points.length;i++){const p=points[i],a=points[(i+points.length-1)%points.length],b=points[(i+1)%points.length],da=Math.hypot(a[0]-p[0],a[1]-p[1]),db=Math.hypot(b[0]-p[0],b[1]-p[1]),r=Math.min(radius,da*.32,db*.32),s=[p[0]+(a[0]-p[0])*r/da,p[1]+(a[1]-p[1])*r/da],e=[p[0]+(b[0]-p[0])*r/db,p[1]+(b[1]-p[1])*r/db];for(let k=0;k<=steps;k++){const t=k/steps;out.push([(1-t)**2*s[0]+2*(1-t)*t*p[0]+t*t*e[0],(1-t)**2*s[1]+2*(1-t)*t*p[1]+t*t*e[1]]);}}return out;}
function panel(material,outline,holes,map,name,outward){
 const p=new T.Shape(outline.map(v=>new T.Vector2(...v)));for(const h of holes||[])p.holes.push(new T.Path(h.map(v=>new T.Vector2(...v))));
 const g=new T.ShapeGeometry(p,10),pos=g.attributes.position;for(let i=0;i<pos.count;i++)pos.setXYZ(i,...map(pos.getX(i),pos.getY(i)));g.computeVertexNormals();
 const mean=new T.Vector3(),normal=g.attributes.normal;for(let i=0;i<normal.count;i++)mean.add(new T.Vector3(normal.getX(i),normal.getY(i),normal.getZ(i)));
 if(mean.dot(new T.Vector3(...outward))<0){for(let i=0;i<g.index.count;i+=3){const a=g.index.array[i];g.index.array[i]=g.index.array[i+2];g.index.array[i+2]=a;}g.computeVertexNormals();}
 return mesh(root,g,material,name);
}
const sideX=(z,y,side)=>{
 if(shell&&y<1.22){const a=shell.sample(z),v=Math.max(0,Math.min(1,(a.s-.035-y)/(a.s-.035-a.b)));return side*(a.w-.055*Math.sin(v*PI/2));}
 return side*(.917-.179*Math.max(0,Math.min(1,(y-1.22)/.66))+.010*Math.sin((z+2.4)*PI/4.8));
};
const sidePoint=(side,z,y,push=.004)=>[sideX(z,y,side)+side*push,y,z];
let shell;
// Fascia and lamps follow the shell's real curvature, including its corner roll.
const frontZ=(x,y,depth=0)=>shell.frontZ(x,y)+depth;
const rearZ=(x,y,depth=0)=>shell.rearZ(x,y)-depth;
const grilleTop=[[-.53,1.19],[.53,1.19],[.56,1.03],[.45,.985],[-.45,.985],[-.56,1.03]];
const grilleBottom=[[-.53,.91],[.53,.91],[.69,.61],[.60,.555],[-.60,.555],[-.69,.61]];
const headlights=[[-.87,1.245],[-.54,1.208],[-.49,1.125],[-.74,1.075],[-.90,1.105]].map(([x,y])=>[x,y-.05]);
const frontOpenings=[grilleTop,grilleBottom,headlights,headlights.map(([x,y])=>[-x,y])].map(points=>({type:'polygon',points}));
const stations=[
 {z:-2.40,w:.915,c:1.32,s:1.20,b:.445},{z:-2.20,w:.925,c:1.31,s:1.22,b:.43},
 {z:-1.75,w:.934,c:1.30,s:1.21,b:.43},{z:-1.315,w:.944,c:1.29,s:1.20,b:.43},
 {z:-.65,w:.915,c:1.28,s:1.19,b:.42},{z:.20,w:.915,c:1.30,s:1.21,b:.42},
 {z:.91,w:.931,c:1.31,s:1.235,b:.43},{z:1.435,w:.941,c:1.30,s:1.235,b:.43},
 {z:1.89,w:.924,c:1.28,s:1.235,b:.44},{z:2.23,w:.913,c:1.25,s:1.22,b:.445},
 {z:2.437,w:.917,c:1.265,s:1.24,b:.46}
];
shell=bodyLoft(root,m.paint,stations,{segments:144,crossSegments:44,edgeDrop:.035,sideInset:.055,smoothSeams:true,wellMaterial:rubber,wheelArches:[frontWheel,rearWheel].map(z=>({z,y:r,r:r+.060,x:.942})),nose:{from:1.85,round:.18,bottomInset:.10,openings:frontOpenings},tail:{from:-2.04,round:.12,bottomInset:.07},underMaterial:cladding});
// Fender cladding follows genuine open wheel apertures; sidewalls remain clear.
for(const side of [-1,1])for(const z of [frontWheel,rearWheel]){
 surface(root,cladding,52,5,(u,v)=>{const a=u*PI,rad=r+.052+v*.043;return[side*(.944+.006*Math.sin(a)),r+rad*Math.sin(a),z+rad*Math.cos(a)];},'painted_arch_moulding',side>0);
 for(const sign of [-1,1])box(root,cladding,[.042,.18,.050],[side*.935,.45,z+sign*.452],undefined,'arch_end');
}
// Creased doors and the distinct rising rear shoulder of the Fortuner.
for(const side of [-1,1]){
 const xs=(z,y)=>sidePoint(side,z,y,.010);
 tube(root,m.aeroPaint,[[1.02,.966],[.57,.99],[-.40,.995],[-1.20,1.06],[-1.84,1.21]].map(([z,y])=>sidePoint(side,z,y,.001)),.009,false,60,'shoulder_ridge');
 tube(root,m.aeroPaint,[[.88,.62],[.45,.56],[-.63,.56],[-1.02,.68]].map(([z,y])=>sidePoint(side,z,y,.001)),.009,false,48,'lower_door_sculpt');
 contour(root,rubber,[xs(.77,1.24),xs(.57,.98),xs(.54,.52),xs(-.40,.48)],.0038,'front_door_seam');
 contour(root,rubber,[xs(-.40,1.24),xs(-.40,.93),xs(-.43,.50)],.0038,'b_pillar_door_seam');
 contour(root,rubber,[xs(-1.48,1.25),xs(-1.63,.92),xs(-1.02,.54),xs(-.43,.50)],.0038,'rear_door_seam');
 for(const z of [.15,-1.00]){
  sphere(root,rubber,[.012,.031,.108],[side*.934,1.14,z],16,'handle_recess');
  box(root,m.paint,[.035,.031,.164],[side*.947,1.145,z+.014],[0,0,side*.05],'door_handle');
 }
 box(root,cladding,[.13,.068,2.39],[side*.981,.394,-.01],undefined,'full_length_side_step');
 box(root,chrome,[.017,.012,2.25],[side*1.045,.408,-.01],undefined,'side_step_edge');
 for(let i=0;i<13;i++)box(root,rubber,[.095,.004,.012],[side*.982,.431,-1.10+i*.179],undefined,'step_grip');
 // Sculpted wing mirror with inset reflective face and indicator.
 tube(root,rubber,[[side*.88,1.29,.62],[side*.965,1.30,.57]],.031,false,14,'mirror_arm');
 sphere(root,m.paint,[.102,.069,.145],[side*.995,1.37,.55],24,'mirror_housing');
 roundedPanel(root,reflector,.160,.085,[side*1.009,1.375,.431],{radius:.025,depth:.008,rotation:[0,PI,0],name:'mirror_glass'});
 tube(root,m.front,[[side*.931,1.349,.647],[side*1.031,1.346,.651],[side*1.081,1.347,.593]],.004,false,16,'mirror_indicator');
}
// Upper body frame uses individual true window cutouts rather than opaque boxes.
const cabinOutline=rounded([[1.015,1.245],[.13,1.84],[-1.82,1.84],[-2.245,1.36],[-2.20,1.265]],.045);
const windowA=rounded([[.855,1.29],[.075,1.775],[-.385,1.785],[-.415,1.28]],.035);
const windowB=rounded([[-.465,1.28],[-.435,1.785],[-1.205,1.78],[-1.22,1.30]],.028);
const windowC=rounded([[-1.275,1.32],[-1.265,1.77],[-1.76,1.765],[-2.09,1.43],[-1.80,1.34]],.035);
for(const side of[-1,1]){
 panel(m.paint,cabinOutline,[windowA,windowB,windowC],(z,y)=>sidePoint(side,z,y,0),'sculpted_cabin_side',[side,0,0]);
 for(const [i,points]of [windowA,windowB,windowC].entries()){
  panel(m.glass,points,[],(z,y)=>sidePoint(side,z,y,.002),'side_glass_'+i,[side,0,0]);
  contour(root,rubber,points.map(([z,y])=>sidePoint(side,z,y,.008)),.010,'window_weatherseal',true);
 }
 // Bright upward rear belt-line accent is deliberately separate from the glazing.
 tube(root,chrome,[[...sidePoint(side,.88,1.275,.008)],[...sidePoint(side,-1.22,1.30,.008)],[...sidePoint(side,-1.80,1.34,.008)],[...sidePoint(side,-2.09,1.43,.008)]],.007,false,48,'rising_quarter_window_trim');
 tube(root,rubber,[[...sidePoint(side,.11,1.805,.013)],[...sidePoint(side,-1.78,1.805,.013)]],.015,false,36,'rain_guard');
}
const windshield=(u,v)=>{const q=u*2-1;return[q*lerp(.817,.724,v),lerp(1.273,1.842,v)-.034*q*q,lerp(1.004,.125,v)+.045*Math.sin(v*PI)*(1-q*q)];};
surface(root,m.glass,36,28,windshield,'curved_windshield',true);
contour(root,rubber,[...Array.from({length:25},(_,i)=>windshield(i/24,0)),...Array.from({length:25},(_,i)=>windshield(1,i/24)),...Array.from({length:25},(_,i)=>windshield(1-i/24,1)),...Array.from({length:25},(_,i)=>windshield(0,1-i/24))],.011,'windshield_seal',true);
surface(root,m.paint,38,30,(u,v)=>{const q=v*2-1,z=lerp(-1.86,.14,u);return[q*.748,1.872-.043*q*q-.014*((z+.80)/1.4)**2,z];},'rounded_roof');
const backGlass=(u,v)=>{const q=u*2-1;return[q*lerp(.786,.718,v),lerp(1.325,1.808,v)-.026*q*q,lerp(-2.245,-1.875,v)-.028*Math.sin(v*PI)*(1-q*q)];};
surface(root,m.glass,34,26,backGlass,'rear_glass');
contour(root,rubber,[...Array.from({length:23},(_,i)=>backGlass(i/22,0)),...Array.from({length:23},(_,i)=>backGlass(1,i/22)),...Array.from({length:23},(_,i)=>backGlass(1-i/22,1)),...Array.from({length:23},(_,i)=>backGlass(0,1-i/22))],.010,'rear_glass_seal',true);
for(let i=0;i<8;i++)tube(root,mat('fortuner_demister_'+i,0x554a36,.3,.58),[[-.69,1.38+i*.047,-2.22+i*.036],[0,1.397+i*.047,-2.23+i*.036],[.69,1.38+i*.047,-2.22+i*.036]],.0012,false,18,'rear_demister');
for(const side of[-1,1]){
 tube(root,rubber,[[side*.65,1.908,-1.86],[side*.67,1.931,-1.66],[side*.67,1.932,-.15],[side*.65,1.88,.03]],.020,false,48,'roof_rail');
 for(const z of[-1.62,-.20])box(root,rubber,[.055,.041,.12],[side*.67,1.891,z],undefined,'roof_rail_foot');
 tube(root,rubber,[[side*.13,1.286,.980],[side*.46,1.286,.98],[side*.68,1.31,.947]],.008,false,16,'front_wiper');
}
shape(root,m.paint,[[-.06,0],[.06,0],[.035,.065],[-.025,.08]],{position:[0,1.87,-1.35],rotation:[0,PI/2,0],depth:.045,name:'shark_fin'});
surface(root,m.paint,30,8,(u,v)=>{const q=u*2-1;return[q*.78,1.828+.029*Math.sin(v*PI)-.02*q*q,lerp(-1.85,-2.10,v)];},'roof_spoiler',true);
box(root,cladding,[1.49,.035,.20],[0,1.818,-1.99],[.08,0,0],'spoiler_underside');
tube(root,m.rear,[[-.25,1.822,-2.09],[.25,1.822,-2.09]],.009,false,16,'high_stop_lamp');
tube(root,rubber,[[.28,1.334,-2.259],[.09,1.345,-2.267],[-.50,1.344,-2.263]],.010,false,24,'rear_wiper');

function face(material,points,name,front=true,offset=.008){return panel(material,rounded(points,.012),[],(x,y)=>[x,y,front?frontZ(x,y,offset):rearZ(x,y,offset)],name,[0,0,front?1:-1]);}
// Upper grille and deep lower grille are distinct cutouts of the painted nose.
face(grille,grilleTop,'upper_hexagonal_grille');face(grille,grilleBottom,'lower_large_grille');
contour(root,cladding,rounded(grilleTop,.014).map(([x,y])=>[x,y,frontZ(x,y,.018)]),.015,'grille_surround',true);
for(const [y,w]of[[1.03,.44],[1.09,.50],[1.15,.50],[.59,.56],[.65,.58],[.71,.58],[.77,.55],[.83,.52]]){
 const row=[];for(let i=0;i<=18;i++){const x=-w+i*w/9;row.push([x,y+(i%2?.009:-.009),frontZ(x,y,.024)]);}contour(root,cladding,row,.008,'wave_grille_slats');
}
for(const side of[-1,1]){
 const head=headlights.map(([x,y])=>[Math.abs(x)*side,y]);face(lens,head,'swept_headlamp');
 contour(root,rubber,rounded(head,.009).map(([x,y])=>[x,y,frontZ(x,y,.025)]),.007,'headlamp_surround',true);
 const led=[[side*.49,1.093],[side*.61,1.115],[side*.86,1.161]];tube(root,m.front,led.map(([x,y])=>[x,y,frontZ(x,y,.039)]),.009,false,24,'swept_led_signature');
 for(let i=0;i<3;i++){const x=side*(.59+i*.086),y=1.068+i*.022;sphere(root,reflector,[.035,.025,.018],[x,y,frontZ(x,y,.041)],16,'projector_reflector');sphere(root,m.front,[.020,.015,.018],[x,y,frontZ(x,y,.052)],16,'projector');}
 const intake=[[side*.76,.96],[side*.90,1.01],[side*.90,.65],[side*.80,.60],[side*.745,.72]];face(grille,intake,'vertical_fog_intake',true,.018);
 contour(root,cladding,rounded(intake,.022).map(([x,y])=>[x,y,frontZ(x,y,.034)]),.018,'fog_bezel',true);
 const blade=[[side*.55,.905],[side*.65,.90],[side*.80,.62],[side*.71,.62]];face(chrome,blade,'gr_sport_satin_bumper_blade',true,.031);
 sphere(root,reflector,[.032,.035,.016],[side*.82,.787,frontZ(side*.82,.787,.047)],18,'fog_reflector');sphere(root,m.front,[.019,.023,.013],[side*.82,.787,frontZ(side*.82,.787,.062)],16,'fog_light');
 tube(root,m.front,[[side*.62,.566,frontZ(side*.62,.566,.024)],[side*.84,.566,frontZ(side*.84,.566,.026)]],.007,false,12,'lower_daylight_strip');
}
face(cladding,[[-.91,.53],[-.63,.50],[.63,.50],[.91,.53],[.89,.445],[.67,.422],[-.67,.422],[-.89,.445]],'front_sport_splitter',true,.034);
face(chrome,[[-.58,.475],[.58,.475],[.52,.413],[-.52,.413]],'front_silver_skid_edge',true,.050);
// Pressed hood creases are attached to the same curved top skin, not floating
// strokes at a nominal height. A small roll follows the nose's mapped Z.
for(const side of[-1,1]){
 const points=[[.43,2.20],[.47,1.77],[.55,1.12]].map(([x,z])=>{
  const a=shell.sample(z),q=x/a.w,y=a.c+(a.s-a.c)*Math.sin(q*PI/2)**2-.035*q**8;
  const noseT=Math.max(0,(z-1.85)/(2.437-1.85)),v=(y-a.b)/(a.c-a.b);
  return[side*x,y+.003,z-noseT*noseT*(.18*q**4+.10*(1-v)**2)];
 });
 tube(root,m.paint,points,.004,false,28,'bonnet_power_line');
}

function toyotaLogo(y,z,flip=false){const loop=(rx,ry)=>Array.from({length:49},(_,i)=>{const a=i*PI*2/48;return[Math.cos(a)*rx,y+Math.sin(a)*ry,z+(flip?-.004:.004)*Math.cos(a)];});contour(root,chrome,loop(.098,.068),.008,'toyota_outer_ellipse',true);contour(root,chrome,loop(.032,.061),.006,'toyota_inner_vertical',true);contour(root,chrome,Array.from({length:33},(_,i)=>{const a=i*PI/16;return[Math.cos(a)*.080,y+.021+Math.sin(a)*.025,z+(flip?-.008:.008)];}),.006,'toyota_inner_horizontal',true);}
toyotaLogo(1.084,frontZ(0,1.084,.024));toyotaLogo(1.279,rearZ(0,1.279,.022),true);

// Long horizontal two-piece rear combination lights; separate from Pajero/CR-V.
for(const side of[-1,1]){
 const tail=[[side*.30,1.237],[side*.83,1.268],[side*.925,1.218],[side*.86,1.136],[side*.45,1.158]];
 face(rubber,tail,'rear_light_gasket',false,.014);face(m.rear,tail.map(([x,y])=>[x,y+.008]),'horizontal_rear_lamp',false,.027);
 tube(root,m.rear,[[side*.34,1.224,rearZ(side*.34,1.224,.045)],[side*.81,1.244,rearZ(side*.81,1.244,.045)],[side*.90,1.211,rearZ(side*.90,1.211,.045)]],.013,false,28,'rear_led_blade');
 tube(root,reflector,[[side*.40,1.202,rearZ(side*.40,1.202,.050)],[side*.85,1.209,rearZ(side*.85,1.209,.051)]],.009,false,24,'rear_white_light_band');
 // Wrap the outer lamp smoothly around the rear quarter.
 tube(root,m.rear,[[side*.89,1.219,-2.32],[side*.94,1.212,-2.22],[side*.934,1.188,-2.08]],.026,false,24,'rear_light_wrap');
 face(m.rear,[[side*.62,.566],[side*.86,.57],[side*.86,.525],[side*.65,.525]],'bumper_red_reflector',false,.030);
}
face(cladding,[[-.39,1.165],[.39,1.165],[.33,.91],[-.33,.91]],'rear_plate_recess',false,.023);
face(plate,[[-.275,1.10],[.275,1.10],[.275,.963],[-.275,.963]],'rear_plate',false,.032);
face(plate,[[-.255,.91],[.255,.91],[.255,.78],[-.255,.78]],'front_plate',true,.032);
contour(root,rubber,[[-.78,1.30],[-.78,.87],[-.68,.65],[.68,.65],[.78,.87],[.78,1.30]].map(([x,y])=>[x,y,rearZ(x,y,.005)]),.004,'tailgate_seam');
face(cladding,[[-.92,.59],[-.61,.56],[.61,.56],[.92,.59],[.92,.43],[.68,.385],[-.68,.385],[-.92,.43]],'rear_sport_bumper',false,.028);
face(chrome,[[-.67,.445],[-.52,.545],[.52,.545],[.67,.445],[.55,.412],[-.55,.412]],'rear_skid_surround',false,.047);
face(grille,[[-.52,.462],[-.44,.512],[.44,.512],[.52,.462]],'rear_diffuser_inset',false,.055);
for(const x of[-.33,-.11,.11,.33])box(root,cladding,[.025,.083,.075],[x,.457,rearZ(x,.457,.015)],undefined,'diffuser_vane');

// Small molded badge/plate strokes avoid a raster dependency in the model.
const glyph={F:[[0,0,0,1],[0,1,.65,1],[0,.52,.5,.52]],O:[[0,0,0,1],[0,1,.65,1],[.65,1,.65,0],[.65,0,0,0]],R:[[0,0,0,1],[0,1,.6,1],[.6,1,.6,.55],[.6,.55,0,.55],[.3,.55,.65,0]],T:[[0,1,.7,1],[.35,1,.35,0]],U:[[0,1,0,0],[0,0,.65,0],[.65,0,.65,1]],N:[[0,0,0,1],[0,1,.65,0],[.65,0,.65,1]],E:[[0,0,0,1],[0,1,.65,1],[0,.5,.5,.5],[0,0,.65,0]],G:[[.65,.8,.65,1],[.65,1,0,1],[0,1,0,0],[0,0,.65,0],[.65,0,.65,.5],[.65,.5,.3,.5]],S:[[.65,1,0,1],[0,1,0,.5],[0,.5,.65,.5],[.65,.5,.65,0],[.65,0,0,0]],P:[[0,0,0,1],[0,1,.65,1],[.65,1,.65,.5],[.65,.5,0,.5]],' ':[]};
function letters(text,y,z,h,step,material=white,rear=false){const width=text.length*step;for(let i=0;i<text.length;i++)for(const [a,b,c,d] of glyph[text[i]]||[]){const x=-width/2+i*step,x1=rear?-(x+a*step):x+a*step,x2=rear?-(x+c*step):x+c*step;contour(root,material,[[x1,y+b*h,rear?rearZ(x1,y+b*h,.040):frontZ(x1,y+b*h,.040)],[x2,y+d*h,rear?rearZ(x2,y+d*h,.040):frontZ(x2,y+d*h,.040)]],h*.055,'model_lettering');}}
letters('FORTUNER',.824,2.513,.032,.050);letters('FORTUNER',1.004,-2.463,.031,.049,white,true);letters('FORTUNER',1.172,-2.452,.024,.071,chrome,true);

// Individual tread blocks and sculpted six-spoke factory wheels.
for(const [label,wheel]of Object.entries(rig.wheels)){
 const sign=label[1]==='L'?1:-1;
 for(let ring=0;ring<3;ring++)for(let i=0;i<46;i++){const a=(i+(ring%2)*.5)*PI*2/46;box(wheel,m.rubber,[.055,.006,.022],[(ring-1)*.065,(r-.004)*Math.cos(a),(r-.004)*Math.sin(a)],[a,0,0],'tyre_tread');}
 for(let i=0;i<6;i++){
  const a=i*PI/3;
  for(const offset of[-.035,.035]){
   const radial=.159,ax=sign*.129;
   const spoke=box(wheel,m.rim,[.030,.195,.034],[ax,radial*Math.cos(a)+offset*Math.sin(a),radial*Math.sin(a)-offset*Math.cos(a)],[a,0,0],'broad_split_factory_spoke');
  }
 }
}
// Interior geometry remains available behind glazing; racing dashboard is separate.
for(const z of[.12,-.74,-1.48])for(const side of[-1,1]){
 roundedPanel(root,m.seat,.38,.45,[side*.35,1.16,z],{radius:.07,depth:.15,rotation:[.12,0,0],name:'passenger_seat'});
 sphere(root,m.seat,[.14,.11,.085],[side*.35,1.51,z-.02],18,'head_rest');
 box(root,m.seat,[.38,.10,.39],[side*.35,.94,z+.12],undefined,'seat_cushion');
}
box(root,cladding,[1.46,.12,.29],[0,1.25,.76],undefined,'dashboard');
for(const z of[frontWheel,rearWheel])cylinder(root,m.darkMetal,.040,1.48,[0,.32,z],[0,0,PI/2],20,'suspension_crossmember');
cylinder(root,m.darkMetal,.038,.24,[.62,.31,-2.29],[PI/2,0,0],24,'diesel_tailpipe');
cylinder(root,rubber,.029,.014,[.62,.31,-2.417],[PI/2,0,0],20,'exhaust_mouth');
const metadata={author:'UVelocity original mesh authoring',source:'scripts/build-fortuner.cjs',referenceBased:true,officialManufacturerAsset:false,representation:'original-reference-recreation',displayName:'Toyota Fortuner GR Sport',revision:'photo-rebuild-1.5.0',wheelRadius:rig.radius,wheelWidth:rig.width,wheelCenters:rig.centers,headlightPositions:[[-.72,1.17,2.43],[.72,1.17,2.43]],exhaustPositions:[[.62,.31,-2.425]],tail:-2.425,exhaustX:.62,exhaustY:.31,up:'+Y',forward:'+Z',units:'metres',paintMaterials:['paint_body','paint_aero'],referenceFeatures:['GR Sport two-tier grille','swept horizontal LED headlamps','satin diagonal front bumper blades','raised rear quarter window line','long horizontal two-piece rear lights','sculpted long SUV cabin','six-spoke dark wheels','roof rails and side steps']};
const out=path.resolve(__dirname,'../../work/fortuner-v150-assets',id+'.glb');
const report=exportGLB(root,out,metadata);
if(report.bounds.min[1]<-.002||report.bytes>8*1024*1024)throw new Error('Invalid Fortuner output bounds or file size');
fs.writeFileSync(out.replace(/\.glb$/,'.metadata.json'),JSON.stringify({...report,length:report.dimensions[2]},null,2)+'\n');
if(process.argv.includes('--publish')){const target=path.resolve(__dirname,'../public/game/assets/cars',id+'.glb');fs.copyFileSync(out,target);fs.writeFileSync(target.replace(/\.glb$/,'.metadata.json'),JSON.stringify({...report,length:report.dimensions[2],file:'/game/assets/cars/'+id+'.glb'},null,2)+'\n');}
console.log(JSON.stringify({id,bytes:report.bytes,triangles:report.triangles,meshCount:report.meshCount,dimensions:report.dimensions,published:process.argv.includes('--publish'),file:out},null,2));
