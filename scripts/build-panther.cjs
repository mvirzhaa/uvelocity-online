'use strict';
/** Isuzu Panther Grand Touring: original UVelocity reference-based recreation.
 * Source: the user's dark MPV photograph, 20 November 2026. No scanned mesh.
 * +Y up / +Z front / metres. Run: node scripts/build-panther.cjs --publish
 */
const fs=require('node:fs'),path=require('node:path');
const K=require('./modeling-kit.cjs');
const {THREE:T,createModel,materials,mat,mesh,box,sphere,cylinder,tube,surface,bodyLoft,shape,roundedPanel,wheelRig,exportGLB,lerp}=K;
const PI=Math.PI,id='panther-grand-touring';
// Straight glass seals follow stamped frames. A Catmull-Rom loop would bulge
// beyond rectangular panes and look like an ornamental oval from the side.
function edgePath(parent,material,points,radius,closed,segments,name){
 const curve=new T.CurvePath();
 for(let i=0;i<points.length-(closed?0:1);i++)curve.add(new T.LineCurve3(new T.Vector3(...points[i]),new T.Vector3(...points[(i+1)%points.length])));
 return mesh(parent,new T.TubeGeometry(curve,Math.max(48,segments),radius,7,closed),material,name);
}

const provenance='Original UVelocity reference-based recreation from the user-supplied Isuzu Panther Grand Touring photograph; not a manufacturer mesh or scan.';
const root=createModel(id,{provenance,reference:'User image(20261120-153257).png: dark five-door MPV, chrome grille, silver cladding, roof rails and side steps.'});
const m=materials(0x19252e);m.paint.roughness=.22;m.paint.metalness=.58;m.rim.color.setHex(0xbcc2c7);m.rim.roughness=.26;
const trim=mat('panther_satin_cladding',0x525c62,.28,.43),chrome=mat('panther_chrome',0xcbd0d2,.96,.18),lampReflector=mat('lamp_reflector',0xc9d5df,.88,.2),glassLens=mat('glass_lamp_cover',0x9fb3be,.12,.1),black=mat('panther_window_rubber',0x111718,.08,.57),plate=mat('plate_white',0xe0e2df,.1,.42);
const rig=wheelRig(root,m,{wheelbase:2.82,track:1.50,radius:.377,width:.235,zOffset:.075,spokes:0,rimRadius:.242});
// Factory alloy wheels have broad, softly curved spokes instead of race wires.
for(const wheel of Object.values(rig.wheels))for(const ax of[-rig.width*.46,rig.width*.46]){
 for(let i=0;i<8;i++){
  const a=i*PI/4,spoke=new T.Group();spoke.rotation.x=a;wheel.add(spoke);
  shape(spoke,m.rim,[[-.018,.055],[.018,.055],[.025,.165],[.022,.226],[-.022,.226],[-.025,.165]],{position:[ax,0,0],rotation:[0,PI/2,0],depth:.014,bevel:.007,name:'touring_alloy_spoke'});
 }
}
const body=bodyLoft(root,m.paint,[
 {z:-2.32,w:.79,c:1.14,s:1.15,b:.36},{z:-2.16,w:.87,c:1.15,s:1.15,b:.35},
 {z:-1.335,w:.88,c:1.14,s:1.14,b:.34},{z:-.35,w:.855,c:1.13,s:1.13,b:.34},
 {z:.75,w:.86,c:1.10,s:1.12,b:.34},{z:1.485,w:.87,c:1.035,s:1.08,b:.36},
 {z:2.12,w:.81,c:.98,s:1.01,b:.40},{z:2.30,w:.77,c:.94,s:.96,b:.42}
],{wheelArches:[{z:1.485,y:.377,r:.425},{z:-1.335,y:.377,r:.425}],wellMaterial:m.carbon,underMaterial:m.carbon,segments:130,crossSegments:26,sideInset:.025,edgeDrop:.014,smoothSeams:true,nose:{from:2.10,round:.10,bottomInset:.02,topInset:.012}});

// A tall, squared passenger cabin with three distinct side windows on each side.
// The roof and window belt are deliberately unlike the low two-seat race cars.
surface(root,m.paint,55,25,(u,v)=>{const z=lerp(-2.14,.54,u),q=2*v-1;return[q*(.765+.01*Math.sin(u*PI)),1.86+.035*Math.sin(u*PI)-.052*q*q,z];},'long_mpv_roof');
surface(root,m.glass,30,22,(u,v)=>{const q=2*v-1;return[q*lerp(.805,.748,u),lerp(1.117,1.803,u)+.015*(1-q*q),lerp(1.13,.54,u)-.022*(1-q*q)];},'large_sloped_windscreen',true);
surface(root,m.glass,25,20,(u,v)=>{const q=2*v-1;return[q*lerp(.80,.742,u),lerp(1.19,1.76,u),lerp(-2.26,-2.13,u)-.015*(1-q*q)];},'upright_tailgate_glass');
for(const side of[-1,1]){
 const xAt=y=>side*lerp(.864,.756,(y-1.13)/.70);
 const sideWindow=(name,zFront,zRear,topFront=1.81,topRear=1.81)=>{
  surface(root,m.glass,20,14,(u,v)=>{const z=lerp(zRear,zFront,u),top=lerp(topRear,topFront,u),y=lerp(1.152,top,v);return[xAt(y),y,z];},name,side>0);
  const points=[[xAt(1.15),1.15,zFront],[xAt(topFront),topFront,zFront],[xAt(topRear),topRear,zRear],[xAt(1.15),1.15,zRear]];
  edgePath(root,black,points,.011,true,44,'window_rubber_seal');
 };
 // Front door glass has its own diagonal A pillar, not a rectangular sticker.
 surface(root,m.glass,22,14,(u,v)=>{const top=1.813,zFront=lerp(1.10,.51,v),z=lerp(-.30,zFront,u),y=lerp(1.152,top,v);return[xAt(y),y,z];},'front_door_window',side>0);
 // Flat, shaped pillars close the cabin around the actual glass apertures.
 surface(root,m.paint,26,6,(u,v)=>{const y=lerp(1.117,1.811,u),x=lerp(.805,.748,u)+v*.055;return[side*x,y,lerp(1.13,.54,u)-v*.025];},'wide_A_pillar',side>0);
 surface(root,m.paint,40,6,(u,v)=>{const z=lerp(-2.145,.54,u);return[side*lerp(.710,.775,v),1.86-.052*v,z];},'painted_roof_edge',side<0);
 surface(root,m.paint,20,8,(u,v)=>{const y=lerp(1.145,1.805,u),rear=lerp(-2.29,-2.145,u),front=lerp(-2.115,-2.08,u);return[xAt(y),y,lerp(front,rear,v)];},'wide_D_pillar',side>0);
 edgePath(root,black,[[side*.862,1.153,1.08],[side*.755,1.802,.50],[side*.758,1.802,-.29],[side*.862,1.153,-.29]],.014,true,45,'front_window_seal');
 sideWindow('rear_passenger_window',-.39,-1.30);
 sideWindow('rear_quarter_window',-1.41,-2.12,1.80,1.77);
 // Broad painted pillars, rain visors, and a chrome beltline.
 for(const z of[-.345,-1.355])surface(root,m.paint,16,6,(u,v)=>{const y=lerp(1.13,1.825,u);return[xAt(y),y,z+lerp(-.046,.046,v)];},'flat_door_pillar',side<0);
 edgePath(root,black,[[side*.780,1.817,.48],[side*.780,1.835,.35],[side*.780,1.835,-1.98],[side*.780,1.815,-2.08]],.014,false,50,'rain_visor');
 tube(root,chrome,[[side*.869,1.125,1.12],[side*.879,1.125,-2.16]],.010,false,40,'window_belt_chrome');
 for(const z of[1.06,-.34,-1.37])tube(root,black,[[side*.87,1.12,z],[side*.875,.82,z-.015],[side*.852,.43,z-.02]],.0047,false,24,'door_panel_seam');
 for(const z of[-.17,-1.18]){
  roundedPanel(root,black,.16,.058,[side*.876,1.01,z],{radius:.016,rotation:[0,side*PI/2,0],name:'handle_recess'});
  roundedPanel(root,chrome,.13,.038,[side*.891,1.015,z],{radius:.010,rotation:[0,side*PI/2,0],name:'chrome_door_handle'});
 }
 // Silver flared arches surround genuine openings in the body shell.
 for(const cz of[1.485,-1.335]){
  surface(root,trim,64,6,(u,v)=>{const a=u*PI,r=lerp(.424,.485,v);return[side*(.877+.046*Math.sin(v*PI)),.377+r*Math.sin(a),cz+r*Math.cos(a)];},'touring_flared_arch',side<0);
  tube(root,black,Array.from({length:41},(_,i)=>{const a=i*PI/40;return[side*.881,.377+.422*Math.sin(a),cz+.422*Math.cos(a)];}),.008,false,48,'arch_inner_seal');
  for(const direction of[-1,1])box(root,trim,[.075,.10,.08],[side*.882,.36,cz+direction*.455],undefined,'arch_sill_end');
 }
 box(root,trim,[.055,.135,1.83],[side*.86,.47,.07],undefined,'lower_door_cladding');
 box(root,black,[.049,.06,1.91],[side*.89,.64,.08],undefined,'door_protection_strip');
 tube(root,trim,[[side*.88,.665,-.92],[side*.89,.665,.97]],.014,false,24,'moulding_highlight');
 // Separate tubular running boards and non-slip pads, as in the reference.
 tube(root,chrome,[[side*.88,.315,-1.0],[side*.965,.315,-.87],[side*.965,.315,.88],[side*.88,.315,1.03]],.032,false,36,'side_step_tube');
 box(root,black,[.15,.028,1.72],[side*.91,.344,.02],undefined,'step_tread');
 for(let k=0;k<14;k++)box(root,m.darkMetal,[.14,.005,.025],[side*.915,.362,-.77+k*.12],undefined,'step_grip');
 // Raised side mirror with separate chrome cap and glass face.
 tube(root,black,[[side*.83,1.18,.90],[side*.97,1.22,.88]],.032,false,12,'mirror_mount');
 sphere(root,chrome,[.135,.09,.085],[side*1.00,1.25,.90],24,'touring_mirror_cap');
 roundedPanel(root,m.glass,.19,.115,[side*1.00,1.25,.826],{radius:.025,rotation:[0,PI,0],name:'mirror_glass'});
 // Roof rails with four pedestal mounts and two transverse bars.
 tube(root,black,[[side*.665,1.88,.46],[side*.67,1.935,.36],[side*.67,1.95,.15],[side*.67,1.95,-1.68],[side*.67,1.935,-1.89],[side*.66,1.87,-2.02]],.022,false,60,'long_roof_rail');
 for(const z of[.18,-.88,-1.82])box(root,black,[.085,.072,.13],[side*.67,1.893,z],undefined,'rail_mount');
 tube(root,m.darkMetal,[[side*.70,1.95,-.16],[0,1.977,-.16]],.018,false,20,'roof_crossbar_front');
 tube(root,m.darkMetal,[[side*.70,1.95,-1.50],[0,1.977,-1.50]],.018,false,20,'roof_crossbar_rear');
 // Side marker, front bonnet crease, and window wipers.
 roundedPanel(root,m.amber,.075,.025,[side*.873,1.01,1.17],{radius:.008,rotation:[0,side*PI/2,0],name:'side_turn_signal'});
 tube(root,black,[[side*.59,.974,2.15],[side*.62,1.03,1.52],[side*.66,1.104,1.15]],.0045,false,35,'bonnet_panel_gap');
 tube(root,black,[[side*.13,1.16,1.08],[side*.59,1.205,.99]],.009,false,12,'front_wiper');
}

surface(root,m.paint,24,5,(u,v)=>{const q=2*u-1;return[q*lerp(.748,.765,v),lerp(1.803+.015*(1-q*q),1.86-.052*q*q,v),.54-v*.012];},'windscreen_roof_header');
surface(root,m.paint,24,6,(u,v)=>{const q=2*u-1;return[q*lerp(.742,.765,v),lerp(1.76,1.86-.052*q*q,v),lerp(-2.13,-2.14,v)];},'tailgate_roof_header',true);

// Upright chrome grille and separated reflector headlamps give the front its
// Panther identity. All decorative markings are geometry, not external images.
shape(root,chrome,[[-.49,.175],[.49,.175],[.43,-.17],[-.43,-.17]],{position:[0,.833,2.315],depth:.018,bevel:.012,name:'chrome_grille_frame'});
shape(root,black,[[-.457,.145],[.457,.145],[.405,-.146],[-.405,-.146]],{position:[0,.833,2.35],depth:.008,bevel:.006,name:'panther_grille_recess'});
for(let i=-4;i<=4;i++)box(root,chrome,[.026,.286,.028],[i*.095,.835,2.371],[0,0,-.10*i/4],'grille_vertical_bar');
box(root,chrome,[.895,.039,.036],[0,.84,2.391],undefined,'grille_crossbar');
roundedPanel(root,black,.32,.085,[0,.852,2.415],{radius:.008,name:'brand_plaque'});
const glyphs={I:[[[0,1],[1,1]],[[.5,1],[.5,0]],[[0,0],[1,0]]],S:[[[1,1],[0,1],[0,.53],[1,.47],[1,0],[0,0]]],U:[[[0,1],[0,.12],[.15,0],[.85,0],[1,.12],[1,1]]],Z:[[[0,1],[1,1],[0,0],[1,0]]],V:[[[0,1],[.5,0],[1,1]]],'-':[[[0,.5],[1,.5]]],'1':[[[.15,.8],[.5,1],[.5,0]],[[.15,0],[.85,0]]],'6':[[[1,1],[.15,1],[0,.55],[0,0],[1,0],[1,.5],[0,.5]]]};
function lettering(text,material,x,y,z,h,advance){for(let i=0;i<text.length;i++)for(const stroke of glyphs[text[i]]||[])tube(root,material,stroke.map(([a,b])=>[x+i*advance+a*advance*.70,y+b*h,z]),h*.053,false,Math.max(8,stroke.length*3),'letter_'+text[i]);}
lettering('ISUZU',chrome,-.135,.829,2.433,.047,.057);
for(const side of[-1,1]){
 const cx=side*.64;
 const outline=[[-.20,.11],[.21,.11],[.18,-.10],[-.19,-.12]].map(([x,y])=>[cx+side*x,.903+y,2.27-.12*Math.abs(x+.10)]);
 edgePath(root,chrome,outline,.013,true,42,'headlamp_chrome_outline');
 shape(root,lampReflector,[[-.20,.105],[.205,.105],[.175,-.105],[-.19,-.115]],{position:[cx,.903,2.255],depth:.020,bevel:.018,name:'headlamp_reflector_housing'});
 for(const [dx,r]of[[-.075,.075],[.088,.052]]){
  cylinder(root,m.metal,r+.012,.017,[cx+side*dx,.907,2.291],[PI/2,0,0],36,'round_headlamp_reflector');
  cylinder(root,m.front,r*.73,.020,[cx+side*dx,.907,2.306],[PI/2,0,0],32,'headlamp_projector');
 }
 // Polished reflectors remain visible; no opaque tinted slab over the lamps.
 for(let k=0;k<8;k++)tube(root,lampReflector,[[cx-.165+k*.043,.816,2.316],[cx-.165+k*.043,.990,2.316]],.0015,false,8,'headlamp_lens_rib');
 roundedPanel(root,m.amber,.048,.13,[cx+side*.15,.91,2.321],{radius:.008,depth:.005,name:'headlamp_indicator'});
}

// Two-tone bumpers, fog lights, and a generic game registration plate.
bodyLoft(root,trim,[{z:2.025,w:.87,c:.655,s:.64,b:.39},{z:2.255,w:.895,c:.66,s:.65,b:.39},{z:2.41,w:.86,c:.64,s:.62,b:.41}],{segments:32,crossSegments:28,edgeDrop:.016,sideInset:.012,smoothSeams:true,underbody:false,nose:{from:2.20,round:.14,topInset:.005,bottomInset:.015}});
roundedPanel(root,black,.74,.14,[0,.465,2.412],{radius:.035,depth:.006,name:'lower_bumper_air_slot'});
for(const side of[-1,1]){
 roundedPanel(root,black,.25,.21,[side*.67,.53,2.407],{radius:.072,depth:.006,name:'fog_light_bezel'});
 cylinder(root,chrome,.075,.018,[side*.67,.53,2.423],[PI/2,0,0],40,'fog_light_chrome');
 cylinder(root,m.front,.055,.020,[side*.67,.53,2.435],[PI/2,0,0],36,'fog_light');

}
roundedPanel(root,black,.36,.18,[0,.58,2.427],{radius:.009,depth:.007,name:'plate_frame_front'});
roundedPanel(root,plate,.325,.147,[0,.58,2.44],{radius:.006,depth:.004,name:'game_plate_front'});
lettering('UV-16',black,-.137,.542,2.447,.071,.056);
bodyLoft(root,trim,[{z:-2.40,w:.855,c:.585,s:.57,b:.37},{z:-2.29,w:.90,c:.605,s:.59,b:.35},{z:-2.11,w:.87,c:.605,s:.59,b:.35}],{segments:28,crossSegments:26,edgeDrop:.015,sideInset:.012,smoothSeams:true,underbody:false});
for(const side of[-1,1]){
 roundedPanel(root,black,.15,.60,[side*.789,1.03,-2.321],{radius:.03,rotation:[0,PI,0],name:'vertical_tail_lamp_bezel'});
 roundedPanel(root,m.rear,.115,.34,[side*.789,1.10,-2.339],{radius:.025,rotation:[0,PI,0],name:'vertical_tail_lamp'});
 roundedPanel(root,m.amber,.114,.09,[side*.789,.875,-2.344],{radius:.01,rotation:[0,PI,0],name:'rear_indicator'});
 roundedPanel(root,glassLens,.114,.073,[side*.789,.786,-2.345],{radius:.009,rotation:[0,PI,0],name:'reverse_lamp'});
}
edgePath(root,black,[[-.72,1.17,-2.294],[-.72,.65,-2.333],[.72,.65,-2.333],[.72,1.17,-2.294]],.005,false,44,'tailgate_seam');
roundedPanel(root,chrome,.20,.046,[0,1.08,-2.336],{radius:.012,rotation:[0,PI,0],name:'tailgate_handle'});
roundedPanel(root,plate,.34,.16,[0,.85,-2.339],{radius:.008,rotation:[0,PI,0],name:'game_plate_rear'});
tube(root,black,[[.27,1.23,-2.272],[.0,1.39,-2.25],[-.33,1.40,-2.25]],.008,false,18,'rear_wiper');
roundedPanel(root,m.rear,.22,.042,[0,1.77,-2.166],{radius:.01,rotation:[0,PI,0],name:'high_brake_light'});

// Passenger seating stays behind the original glass; the playable interior is
// fitted separately by the existing cockpit renderer.
for(const z of[.04,-.90,-1.67])for(const side of[-1,1]){
 box(root,m.seat,[.38,.48,.25],[side*.34,1.15,z],[.10,0,0],'mpv_seat_back');
 sphere(root,m.seat,[.16,.12,.10],[side*.34,1.49,z-.05],18,'mpv_headrest');
 box(root,m.seat,[.39,.095,.38],[side*.34,.92,z+.10],undefined,'mpv_seat_cushion');
}
box(root,m.carbon,[1.41,.14,.31],[0,1.13,.93],undefined,'mpv_dashboard');
cylinder(root,m.darkMetal,.037,.23,[-.66,.30,-2.24],[PI/2,0,0],32,'diesel_exhaust_pipe');
cylinder(root,m.carbon,.029,.012,[-.66,.30,-2.365],[PI/2,0,0],24,'diesel_exhaust_outlet');

const metadata={author:'UVelocity original mesh authoring',source:'scripts/build-panther.cjs',referenceBased:true,officialManufacturerAsset:false,representation:'original-reference-recreation',displayName:'Isuzu Panther Grand Touring',wheelRadius:rig.radius,wheelWidth:rig.width,wheelCenters:rig.centers,headlightPositions:[[-.64,.907,2.32],[.64,.907,2.32]],exhaustPositions:[[-.66,.30,-2.37]],tail:-2.37,exhaustX:.66,exhaustY:.30,up:'+Y',forward:'+Z',units:'metres',paintMaterials:['paint_body','paint_aero']};
const out=path.resolve(__dirname,'../../work/panther-assets',id+'.glb');
const report=exportGLB(root,out,metadata);
if(report.bounds.min[1]<-.002||report.bytes>8*1024*1024)throw new Error('Invalid Panther output bounds or size');
if(process.argv.includes('--publish')){
 const target=path.resolve(__dirname,'../public/game/assets/cars',id+'.glb');fs.copyFileSync(out,target);
 fs.writeFileSync(target.replace(/\.glb$/,'.metadata.json'),JSON.stringify({...report,length:report.dimensions[2],file:'/game/assets/cars/'+id+'.glb'},null,2)+'\n');
}
console.log(JSON.stringify({id,bytes:report.bytes,triangles:report.triangles,meshCount:report.meshCount,dimensions:report.dimensions,published:process.argv.includes('--publish'),file:out},null,2));
