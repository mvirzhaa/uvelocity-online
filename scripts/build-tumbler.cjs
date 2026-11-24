'use strict';
/** Original six-wheel Batmobile Tumbler recreation based on two user-supplied
 * front/rear photographs (24 November 2026). +Y up, +Z front, metres.
 * This is original game geometry, not a film-production CAD model or scan.
 * Run: node scripts/build-tumbler.cjs --publish
 */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const K=require('./modeling-kit.cjs');
const {THREE:T,createModel,materials,mat,mesh,box,sphere,cylinder,tube,surface,shape,roundedPanel,exportGLB,lerp}=K;
const PI=Math.PI,id='batmobile-tumbler';
const provenance='Original UVelocity reference-based reconstruction of the Batmobile Tumbler from two user-supplied photographs. Not a scan, film-production CAD asset, or official studio mesh.';
const root=createModel(id,{provenance,revision:'iconic-collection-1.6.0',referenceImages:['image(20261124-025838).png','image(20261124-025950).png']});
const m=materials(0x30343a);
m.paint.metalness=.38;m.paint.roughness=.61;m.paint.flatShading=true;
m.aeroPaint.color.setHex(0x292e35);m.aeroPaint.metalness=.40;m.aeroPaint.roughness=.55;m.aeroPaint.flatShading=true;
m.rim.color.setHex(0x14191f);m.rim.roughness=.35;m.rim.metalness=.72;
m.rubber.color.setHex(0x171a1c);m.glass.color.setHex(0x313b43);m.glass.metalness=.23;m.glass.roughness=.16;m.front.emissiveIntensity=.18;
m.glass.color.setHex(0x4a5560);
const edge=mat('tumbler_armor_edges',0x1a2026,.48,.50),rubber=mat('tumbler_trim',0x080c10,.03,.84),bronze=mat('tumbler_bronze_mechanisms',0x77644d,.76,.35),steel=mat('tumbler_satin_steel',0x76808a,.86,.32),jet=mat('tumbler_turbine_interior',0x3d4349,.86,.30),lens=mat('tumbler_projector_lens',0xa3b5c2,.12,.09),tailMat=mat('tumbler_rear_markers',0x7f0d11,.28,.25,{emissive:0xb40811,emissiveIntensity:.22});

const V=a=>new T.Vector3(...a);
function polygon(parent,material,points,name='armor',thickness=.025,outward=null){
  // Each plate has its own sharp normals and actual thickness. Convex polygon
  // faces are fan-triangulated without smoothing away the armoured silhouette.
  const normal=V(points[1]).sub(V(points[0])).cross(V(points[2]).sub(V(points[0]))).normalize();
  if(outward&&normal.dot(V(outward))<0){points=[...points].reverse();normal.negate();}
  const positions=[],normals=[],uvs=[];
  const add=(a,b,c,n)=>{positions.push(...a,...b,...c);for(let i=0;i<3;i++){normals.push(n.x,n.y,n.z);uvs.push(0,0);}};
  for(let i=1;i<points.length-1;i++)add(points[0],points[i],points[i+1],normal);
  if(thickness){const back=points.map(p=>V(p).addScaledVector(normal,-thickness).toArray());for(let i=1;i<back.length-1;i++)add(back[0],back[i+1],back[i],normal.clone().negate());for(let i=0;i<points.length;i++){const j=(i+1)%points.length,n=V(points[j]).sub(V(points[i])).cross(V(back[i]).sub(V(points[i]))).normalize();add(points[i],back[i],points[j],n);add(points[j],back[i],back[j],n);}}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('normal',new T.Float32BufferAttribute(normals,3));g.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));g.setIndex(Array.from({length:positions.length/3},(_,i)=>i));return mesh(parent,g,material,name);
}
function mirror(points,side){return points.map(([x,y,z])=>[x*side,y,z]);}
function rod(parent,material,a,b,r=.025,name='structural_link',segments=12){const av=V(a),bv=V(b),delta=bv.clone().sub(av),obj=mesh(parent,new T.CylinderGeometry(r,r,delta.length(),segments,1),material,name);obj.position.copy(av.add(bv).multiplyScalar(.5));obj.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());return obj;}
function line(parent,material,points,r=.005,name='panel_gap',closed=false){const paths=new T.CurvePath();for(let i=0;i<points.length-(closed?0:1);i++)paths.add(new T.LineCurve3(V(points[i]),V(points[(i+1)%points.length])));return mesh(parent,new T.TubeGeometry(paths,Math.max(points.length*2,8),r,5,closed),material,name);}
function ring(parent,material,center,radius,tubeRadius,axis='x',name='ring',segments=64){const g=new T.TorusGeometry(radius,tubeRadius,8,segments);if(axis==='x')g.rotateY(PI/2);if(axis==='y')g.rotateX(PI/2);const obj=mesh(parent,g,material,name);obj.position.set(...center);return obj;}
function axleDisc(parent,material,radius,depth,position,name='disc',segments=48){return cylinder(parent,material,radius,depth,position,[0,0,PI/2],segments,name);}
function spring(a,b,r=.042,turns=9){const av=V(a),bv=V(b),axis=bv.clone().sub(av),q=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),axis.clone().normalize()),pts=[];for(let i=0;i<=turns*14;i++){const t=i/(turns*14),angle=t*PI*2*turns,local=new T.Vector3(r*Math.cos(angle),axis.length()*t,r*Math.sin(angle));pts.push(local.applyQuaternion(q).add(av).toArray());}tube(root,bronze,pts,.010,false,turns*14,'coil_over_suspension_spring');rod(root,steel,a,b,.018,'shock_piston',16);}
function bolt(parent,p,axis=[0,0,1],radius=.009,material=steel){const b=mesh(parent,new T.CylinderGeometry(radius,radius,.009,6),material,'recessed_hex_fastener');b.position.set(...p);b.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),V(axis).normalize());}

// Four suspension anchors, with six independently rolling wheel groups. Each
// aft axle carries separate outer and inner tyre/rim meshes. This gives
// the actual six-wheel silhouette instead of faking paired tyres in a texture.
const axleCenters={FL:[1.20,.50,1.65],FR:[-1.20,.50,1.65],RL:[1.055,.70,-1.53],RR:[-1.055,.70,-1.53]};
const wheelCenters={FL:[1.20,.50,1.65],FR:[-1.20,.50,1.65],RL:[1.35,.70,-1.53],RR:[-1.35,.70,-1.53],RL_inner:[.76,.70,-1.53],RR_inner:[-.76,.70,-1.53]};
const wheelGroups={},rearOffsets=[-.295,.295];
function tyre(wheel,x,r,w,rimRadius,rear,side){
 const edgeR=r-(rear?.025:.007),profile=[[rimRadius*.87,-w*.50],[r*.79,-w*.50],[r*.92,-w*.445],[edgeR,-w*.32],[edgeR,w*.32],[r*.92,w*.445],[r*.79,w*.50],[rimRadius*.87,w*.50],[rimRadius*.87,-w*.50]].map(p=>new T.Vector2(...p));
 const g=new T.LatheGeometry(profile,72);g.rotateZ(PI/2);const tire=mesh(wheel,g,m.rubber,rear?'rear_dual_tire':'front_wide_tire');tire.position.x=x;
 for(const sign of[-1,1]){
  const ax=x+sign*w*.475;
  ring(wheel,m.rim,[ax,0,0],rimRadius,.016,'x','black_bead_rim');
  ring(wheel,m.rubber,[x+sign*w*.505,0,0],r*.78,.008,'x','raised_sidewall_ring');
  ring(wheel,m.rubber,[x+sign*w*.501,0,0],r*.87,.003,'x','sidewall_fine_ring');
  axleDisc(wheel,m.darkMetal,rimRadius*.89,.018,[ax-sign*.064,0,0],'recessed_brake_rotor');
  axleDisc(wheel,m.rim,rimRadius*.30,.071,[ax-sign*.02,0,0],'deep_black_hub');
  for(let i=0;i<10;i++){const a=i*2*PI/10,points=[[ax-sign*.020,.071*Math.cos(a-.12),.071*Math.sin(a-.12)],[ax-sign*.054,(rimRadius-.015)*Math.cos(a-.10),(rimRadius-.015)*Math.sin(a-.10)],[ax-sign*.054,(rimRadius-.015)*Math.cos(a+.10),(rimRadius-.015)*Math.sin(a+.10)],[ax-sign*.020,.071*Math.cos(a+.12),.071*Math.sin(a+.12)]];polygon(wheel,m.rim,points,'deep_dish_web_spoke',.018,[sign,0,0]);}
  for(let i=0;i<8;i++){const a=i*PI/4;axleDisc(wheel,steel,.010,.018,[ax-sign*.002,rimRadius*.21*Math.cos(a),rimRadius*.21*Math.sin(a)],'eight_hub_bolts',6);}
 }
 if(rear){
  // Broad staggered polygon lugs match the coarse all-terrain rear tyres.
  for(let row=0;row<4;row++)for(let k=0;k<36;k++){
   const a=(k+(row%2)*.5)*2*PI/36,cx=x+(row-1.5)*w*.20,rad=r-.043;
   const points=[[-.053,-.039],[.029,-.046],[.055,-.022],[.044,.037],[-.026,.048],[-.057,.019]];
   const lug=shape(wheel,m.rubber,points,{depth:.037,bevel:.004,position:[0,0,0],name:'large_staggered_rear_tread'});
   // shape's local z extrusion becomes radial, local x spans tyre width.
   lug.quaternion.setFromAxisAngle(new T.Vector3(1,0,0),a-PI/2);lug.position.set(cx,rad*Math.cos(a),rad*Math.sin(a));
  }
  for(const sign of[-1,1])for(let k=0;k<36;k++){const a=(k+.25)*2*PI/36;const blk=box(wheel,m.rubber,[.024,.085,.053],[x+sign*w*.48,r*.845*Math.cos(a),r*.845*Math.sin(a)],[a,0,0],'rear_sidewall_shoulders');}
 }else{
  // Small rectangular tread blocks, visibly different from the rear lugs.
  for(let row=0;row<8;row++)for(let k=0;k<66;k++){const a=(k+(row%2)*.25)*2*PI/66,cx=x+(row-3.5)*.049,rad=r-.006;box(wheel,m.rubber,[.042,.007,.038],[cx,rad*Math.cos(a),rad*Math.sin(a)],[a,0,0],'front_road_tread_block');}
 }
}
for(const label of['FL','FR','RL','RR']){
 const front=label[0]==='F',side=label[1]==='L'?1:-1,anchor=new T.Group();anchor.name=(front?'steer_':'axle_')+label;anchor.position.set(...axleCenters[label]);root.add(anchor);
 const wheel=new T.Group();wheel.name='wheel_'+label;anchor.add(wheel);wheelGroups[label]=wheel;
 if(front)tyre(wheel,0,.50,.48,.30,false,side);else{wheel.position.x=side*.295;tyre(wheel,0,.70,.55,.37,true,side);const inner=new T.Group();inner.name='wheel_'+label+'_inner';inner.position.x=-side*.295;anchor.add(inner);tyre(inner,0,.70,.55,.37,true,side);wheelGroups[label+'_inner']=inner;}
 // Suspension/brakes stay with the anchor, never spin with tyre tread.
 if(front){box(anchor,bronze,[.085,.16,.085],[side*.25,-.015,.075],undefined,'exposed_front_brake_caliper');axleDisc(anchor,steel,.052,.18,[0,0,0],'front_steering_bearing',24);}
}
// Low central chassis, tapered at the bow, visible between the free front wheels.
polygon(root,m.carbon,[[-.40,.39,2.38],[.40,.39,2.38],[.77,.37,.60],[.80,.36,-1.80],[-.80,.36,-1.80],[-.77,.37,.60]],'heavy_lower_armored_floor',.055,[0,-1,0]);
for(const side of[-1,1]){
 rod(root,edge,[side*.46,.38,1.88],[side*.67,.43,-1.93],.045,'main_longitudinal_chassis_rail',16);
 rod(root,edge,[side*.20,.52,1.67],[side*.95,.52,1.63],.052,'independent_front_lower_control_arm',16);
 rod(root,bronze,[side*.42,.71,.52],[side*1.19,.55,1.62],.037,'exposed_swept_front_suspension_link',16);
 rod(root,bronze,[side*.64,.92,.61],[side*1.20,.68,1.62],.030,'front_upper_wishbone',14);
 rod(root,edge,[side*.31,.43,1.03],[side*1.19,.48,1.62],.032,'triangulated_lower_wishbone',14);
 spring([side*.82,.70,1.12],[side*.68,1.13,.71],.048,10);
 rod(root,steel,[side*.45,.61,1.05],[side*1.15,.52,1.69],.013,'front_steering_tie_rod',12);
 for(const [x,y,z]of[[1.18,.55,1.62],[.64,.92,.61],[.82,.70,1.12]])sphere(root,bronze,[.052,.052,.052],[side*x,y,z],12,'suspension_joint');
 // Rear swing arms remain visible around the central jet power unit.
 rod(root,edge,[side*.50,.46,-.35],[side*1.05,.62,-1.53],.072,'rear_longitudinal_trailing_arm',16);
 rod(root,steel,[side*.30,.64,-1.53],[side*1.59,.64,-1.53],.048,'rear_dual_wheel_axle',16);
 spring([side*.61,.75,-1.80],[side*.61,1.42,-1.62],.063,11);
}
// The iconic split nose runs forward from the cockpit to a very narrow shovel.
polygon(root,m.paint,[[-.18,1.49,.06],[.18,1.49,.06],[.26,1.01,.93],[.31,.82,1.37],[.26,.60,2.15],[-.26,.60,2.15],[-.31,.82,1.37],[-.26,1.01,.93]],'long_angular_center_nose_spine',.055,[0,1,.5]);
polygon(root,m.aeroPaint,[[-.27,.60,2.15],[.27,.60,2.15],[.40,.40,2.46],[-.40,.40,2.46]],'pointed_front_shovel',.048,[0,1,1]);
polygon(root,edge,[[-.40,.40,2.46],[.40,.40,2.46],[.34,.32,2.43],[-.34,.32,2.43]],'front_shovel_folded_lower_edge',.028,[0,0,1]);
for(const side of[-1,1]){
 polygon(root,m.aeroPaint,mirror([[.18,1.49,.06],[.31,1.47,.06],[.38,1.02,.96],[.30,.82,1.37],[.26,.60,2.15],[.22,.75,1.48]],side),'nose_central_ridge_edge',.020,[side,1,0]);
 // Recessed ventilation slots and chamfered step on the spine.
 polygon(root,rubber,mirror([[.035,.843,1.332],[.23,.843,1.332],[.19,.898,1.205],[.035,.898,1.205]],side),'nose_recessed_louver',.008,[0,1,.5]);
 for(let i=0;i<4;i++)rod(root,edge,[side*.044,.852+i*.010,1.31-i*.023],[side*.198,.852+i*.010,1.31-i*.023],.006,'nose_louver_blade',6);
 polygon(root,m.paint,mirror([[.18,.702,1.83],[.28,.702,1.83],[.28,.666,1.94],[.24,.645,1.98]],side),'nose_small_stepped_overlap',.020,[0,1,1]);
}
// Lower cabin is not a generic cuboid: five sharply intersecting armor planes
// form the deep side cutaway and tapered structural tub seen in the photographs.
for(const side of[-1,1]){
 polygon(root,m.paint,mirror([[.35,.44,.97],[.78,.40,.81],[1.10,.50,.20],[1.11,1.02,-.13],[.89,1.23,.48],[.40,.95,1.07]],side),'sloping_forward_cabin_armour',.048,[side,.2,1]);
 polygon(root,m.paint,mirror([[1.10,.50,.20],[1.12,.40,-.76],[1.03,1.29,-.99],[.89,1.37,-.22],[1.11,1.02,-.13]],side),'large_faceted_cabin_side_plate',.045,[side,0,0]);
 polygon(root,m.aeroPaint,mirror([[.78,.40,.81],[1.10,.50,.20],[1.12,.40,-.76],[.74,.32,-.81],[.58,.32,.60]],side),'tapered_lower_rocker_belly',.035,[side,-1,0]);
 polygon(root,m.paint,mirror([[.89,1.23,.48],[1.11,1.02,-.13],[.89,1.37,-.22],[.76,1.60,-.53],[.69,1.63,-.04]],side),'cockpit_faceted_upper_cheek',.035,[side,.4,.4]);
 // A long lower sliver and an inset folded triangle are separate overlapped parts.
 polygon(root,m.aeroPaint,mirror([[1.107,.53,.14],[1.116,.49,-.63],[.97,.78,-.73],[1.005,.99,-.22]],side),'angular_cabin_lower_overlap',.026,[side,0,0]);
 polygon(root,rubber,mirror([[1.122,.48,-.66],[1.045,.88,-.78],[1.045,1.08,-.71],[1.136,.78,-.43]],side),'deep_side_relief_opening',.012,[side,0,0]);
 // Forward pointed mudguard plates hang back from each front tyre, leaving the
 // tread and suspension open in front, as on the source vehicle.
 polygon(root,m.paint,mirror([[.49,1.12,.88],[.92,1.26,.59],[1.36,1.10,1.35],[1.13,1.075,1.60]],side),'forward_floating_wedge_fender',.029,[0,1,.5]);
 polygon(root,m.aeroPaint,mirror([[.92,1.26,.59],[1.15,1.32,.30],[1.46,1.15,1.12],[1.36,1.10,1.35]],side),'outer_front_fender_upper_facet',.024,[side,1,.2]);
 polygon(root,m.paint,mirror([[1.15,1.32,.30],[1.46,1.15,1.12],[1.42,.90,1.13],[1.21,.73,.63],[1.10,.50,.20]],side),'upper_folded_front_fender_shield',.030,[side,0,.2]);
 polygon(root,m.aeroPaint,mirror([[1.21,.73,.63],[1.42,.90,1.13],[1.29,.45,.94],[1.13,.42,.31],[1.10,.50,.20]],side),'lower_folded_front_fender_shield',.030,[side,-.2,.2]);
 polygon(root,m.aeroPaint,mirror([[1.42,.90,1.13],[1.29,.45,.94],[1.09,.50,.80],[1.20,.96,1.18]],side),'front_fender_cutaway_return',.026,[0,0,1]);
 polygon(root,rubber,mirror([[.55,1.11,.90],[.96,1.22,.63],[1.30,1.08,1.32],[1.09,1.06,1.54]],side),'dark_hollow_under_front_wing',.010,[0,-1,0]);
 rod(root,bronze,[side*.78,.96,.81],[side*1.20,1.02,1.29],.025,'exposed_fender_hinge_link',12);
 rod(root,edge,[side*1.07,.72,.48],[side*1.38,.86,1.05],.032,'front_fender_inner_brace',12);
 for(const p of[[1.15,1.325,.30],[1.40,1.17,1.06],[1.22,.98,1.18]])bolt(root,[side*p[0],p[1],p[2]],[side,.2,.2],.010,edge);
}
// Deep V windshield, center pillar and angular side panes. A black seal backs
// each distinct pane and solid frames close the side/roof joints.
const frontPane=[[.165,1.575,-.003],[.636,1.601,-.072],[.791,1.247,.543],[.321,1.051,.918]];
for(const side of[-1,1]){
 polygon(root,rubber,mirror([[.132,1.625,-.041],[.666,1.649,-.108],[.848,1.229,.599],[.302,1.000,.984]],side),'windscreen_deep_black_surround',.027,[side*.2,.4,1]);
 polygon(root,m.glass,mirror(frontPane,side),'split_angular_windshield',.008,[side*.2,.6,1]);
 polygon(root,m.paint,mirror([[.666,1.649,-.108],[.755,1.673,-.139],[.918,1.236,.592],[.848,1.229,.599]],side),'massive_sloped_A_pillar',.033,[side,0,1]);
 polygon(root,m.paint,mirror([[.132,1.625,-.041],[.182,1.626,-.047],[.347,1.007,.965],[.302,1.000,.984]],side),'center_windscreen_armored_rib',.035,[0,.4,1]);
 polygon(root,m.paint,mirror([[.302,1.000,.984],[.848,1.229,.599],[.899,1.184,.657],[.387,.961,1.064]],side),'angular_windshield_lower_sill',.036,[0,1,1]);
 const sideGlass=[[.777,1.576,-.197],[.829,1.285,.404],[.916,1.354,-.204],[.927,1.501,-.722],[.803,1.592,-.734]];
 polygon(root,rubber,mirror([[.761,1.625,-.145],[.909,1.224,.568],[.975,1.310,-.179],[.977,1.514,-.811],[.799,1.650,-.814]],side),'side_glass_armored_frame',.028,[side,0,0]);
 polygon(root,m.glass,mirror(sideGlass,side),'angular_pentagonal_side_glass',.008,[side,.2,0]);
 polygon(root,m.paint,mirror([[.977,1.514,-.811],[.799,1.650,-.814],[.800,1.650,-1.035],[1.094,1.404,-1.064],[1.045,1.285,-.959],[.975,1.310,-.179]],side),'rear_cockpit_hatch_and_buttress',.035,[side,1,-.2]);
 line(root,edge,mirror([[.779,1.636,-.189],[.922,1.249,.514],[.948,1.321,-.190],[.958,1.507,-.765]],side),.007,'side_window_precision_seal',true);
 // Compact wiper hardware follows each sloping pane.
 rod(root,edge,[side*.332,1.080,.864],[side*.343,1.275,.507],.007,'front_glass_wiper_arm',8);
 rod(root,rubber,[side*.320,1.150,.740],[side*.406,1.465,.171],.012,'front_glass_wiper_blade',8);
 // Visible bronze hinge plate next to side glazing.
 polygon(root,bronze,mirror([[.907,1.290,.471],[.958,1.350,.294],[.994,1.326,.255],[.957,1.252,.414]],side),'side_canopy_bronze_hinge',.016,[side,.2,1]);
 bolt(root,[side*.948,1.297,.409],[side,0,0],.016);bolt(root,[side*.969,1.322,.312],[side,0,0],.016);
}
// Broad shallow faceted roof plates and the unmistakable narrow brow visor.
polygon(root,m.paint,[[-.755,1.673,-.139],[.755,1.673,-.139],[.803,1.679,-.81],[.743,1.625,-1.142],[-.743,1.625,-1.142],[-.803,1.679,-.81]],'flat_armored_cockpit_roof',.040,[0,1,0]);
polygon(root,m.aeroPaint,[[-.755,1.673,-.139],[.755,1.673,-.139],[.787,1.619,-.033],[.649,1.580,.074],[-.649,1.580,.074],[-.787,1.619,-.033]],'wide_windshield_brow_visor',.030,[0,1,1]);
polygon(root,edge,[[-.644,1.578,.077],[.644,1.578,.077],[.602,1.548,.107],[-.602,1.548,.107]],'brow_deep_shadow',.020,[0,0,1]);
for(const side of[-1,1]){
 polygon(root,m.aeroPaint,mirror([[.14,1.685,-.19],[.71,1.681,-.20],[.75,1.684,-.76],[.23,1.69,-.77]],side),'separate_roof_hatch_panel',.012,[0,1,0]);
 for(const z of[-.26,-.69])bolt(root,[side*.667,1.695,z],[0,1,0],.008,edge);
 // Tiny paired circular projectors on the outer windshield corners.
 for(const [x,y,z,r]of[[.728,1.584,.041,.035],[.787,1.538,.099,.027]]){
  const c=cylinder(root,edge,r+.011,.044,[side*x,y,z],[PI/2,0,0],20,'twin_corner_projector_housing');
  cylinder(root,steel,r,.010,[side*x,y,z+.029],[PI/2,0,0],20,'corner_projector_bezel');
  cylinder(root,lens,r*.72,.009,[side*x,y,z+.036],[PI/2,0,0],20,'corner_projector_lens');
  cylinder(root,m.front,r*.33,.010,[side*x,y,z+.042],[PI/2,0,0],16,'small_projector_light');
 }
}
// Highly layered rear quarters. These are thin overlapping armor sheets,
// ventilated below; the four rear tyres stay exposed to a rear three-quarter view.
for(const side of[-1,1]){
 polygon(root,m.paint,mirror([[.80,1.65,-1.00],[1.07,1.51,-.82],[1.36,1.52,-1.12],[1.49,1.57,-1.72],[.73,1.68,-1.63]],side),'angled_rear_shoulder_armor',.035,[0,1,0]);
 polygon(root,m.aeroPaint,mirror([[1.07,1.51,-.82],[1.36,1.52,-1.12],[1.35,1.12,-.92],[1.19,.60,-.59],[1.13,.43,-.74],[1.02,1.26,-.99]],side),'polygon_rear_shoulder_side_shield',.035,[side,0,.2]);
 polygon(root,m.paint,mirror([[1.36,1.52,-1.12],[1.49,1.57,-1.72],[1.59,1.44,-1.72],[1.48,1.37,-1.21]],side),'rear_tire_top_armor_edge',.027,[side,1,0]);
 // Open cooling slots follow the steep slant behind the cabin.
 for(let i=0;i<7;i++){
  const z=-.91-i*.068,x=.92+i*.041,y=1.59-i*.003;
  polygon(root,rubber,mirror([[x,y,z],[x+.17,y-.075,z-.014],[x+.17,y-.075,z-.044],[x,y,z-.030]],side),'rear_quarter_cooling_gill',.007,[side,1,0]);
 }
 polygon(root,m.aeroPaint,mirror([[.84,1.655,-1.07],[.95,1.675,-1.30],[1.47,1.609,-1.42],[1.24,1.568,-1.16]],side),'raised_rear_quarter_overlap',.027,[0,1,0]);
 // Bronze external folding-wing actuation brackets and pivot tubes.
 for(const z of[-1.14,-1.61]){
  rod(root,bronze,[side*1.12,1.55,z],[side*1.03,1.78,z+.10],.019,'exposed_wing_hinge_actuator',12);
  rod(root,edge,[side*.98,1.72,z+.12],[side*1.33,1.72,z-.05],.025,'wing_hinge_pivot_tube',14);
  bolt(root,[side*1.12,1.56,z],[0,1,0],.016);bolt(root,[side*1.033,1.775,z+.09],[side,0,0],.014);
 }
 // Each aft wing is an independent sharply swept panel with a floating look
 // grounded by those mechanical brackets rather than a generic car spoiler.
 polygon(root,m.paint,mirror([[.72,1.78,-1.18],[1.18,1.80,-1.15],[1.52,1.77,-1.48],[.93,1.75,-1.52]],side),'split_high_rear_aero_flap',.024,[0,1,0]);
 polygon(root,m.aeroPaint,mirror([[.77,1.70,-1.70],[1.29,1.75,-1.67],[1.59,1.64,-2.18],[.93,1.59,-2.06]],side),'swept_rear_lower_flap',.026,[0,1,-.2]);
 rod(root,edge,[side*.85,1.78,-1.32],[side*1.50,1.77,-1.52],.023,'rear_aero_external_rail',14);
 rod(root,edge,[side*.84,1.72,-1.83],[side*1.53,1.67,-2.12],.022,'aft_aero_external_rail',14);
 rod(root,bronze,[side*.77,1.47,-1.95],[side*.93,1.61,-2.02],.018,'aft_wing_lower_support',12);
}
// Exposed rear crossmember, engine, pipes and large central turbine outlet.
box(root,edge,[1.31,.15,.16],[0,1.43,-1.85],undefined,'rear_engine_bridge');
box(root,m.carbon,[.90,.22,.67],[0,.65,-1.79],undefined,'jet_powerpack_base');
for(const side of[-1,1]){
 rod(root,edge,[side*.62,.56,-1.91],[side*.53,1.41,-1.85],.037,'rear_turbine_diagonal_support',12);
 rod(root,steel,[side*.40,1.14,-1.73],[side*.54,1.19,-2.02],.025,'jet_fluid_hard_line',12);
 rod(root,bronze,[side*.34,.70,-1.84],[side*.45,.78,-2.15],.028,'jet_external_feed',12);
 cylinder(root,bronze,.035,.048,[side*.59,1.44,-1.949],[PI/2,0,0],16,'rear_bridge_hardware');
 cylinder(root,tailMat,.021,.012,[side*.54,1.40,-1.960],[PI/2,0,0],16,'small_red_rear_marker');
}
// Hollow tube surfaces instead of capped cylinders preserve the deep nozzle.
const jetY=.99;
surface(root,edge,64,14,(u,v)=>{const a=u*2*PI,z=lerp(-1.58,-2.29,v),r=lerp(.36,.30,v)+.026*Math.sin(v*PI);return[r*Math.cos(a),jetY+r*Math.sin(a),z];},'central_turbine_outer_shell',true);
surface(root,bronze,64,8,(u,v)=>{const a=u*2*PI,z=lerp(-2.26,-2.39,v),r=lerp(.302,.257,v);return[r*Math.cos(a),jetY+r*Math.sin(a),z];},'bronze_turbine_outer_lip',true);
surface(root,jet,64,12,(u,v)=>{const a=u*2*PI,z=lerp(-2.39,-2.02,v),r=lerp(.246,.155,v);return[r*Math.cos(a),jetY+r*Math.sin(a),z];},'dark_conical_turbine_nozzle');
ring(root,bronze,[0,jetY,-2.39],.256,.013,'z','bronze_turbine_outlet_rim');
ring(root,steel,[0,jetY,-2.285],.302,.008,'z','turbine_machined_outer_band');
for(let i=0;i<32;i++){
 const a=i*2*PI/32,pts=[[.246*Math.cos(a),jetY+.246*Math.sin(a),-2.384],[.243*Math.cos(a+.025),jetY+.243*Math.sin(a+.025),-2.384],[.161*Math.cos(a+.055),jetY+.161*Math.sin(a+.055),-2.045],[.155*Math.cos(a+.025),jetY+.155*Math.sin(a+.025),-2.045]];
 polygon(root,steel,pts,'individual_turbine_nozzle_rib',.006,[Math.cos(a),Math.sin(a),-1]);
}
cylinder(root,rubber,.158,.018,[0,jetY,-2.028],[PI/2,0,0],48,'turbine_deep_dark_throat');
for(let i=0;i<18;i++){const a=i*2*PI/18,pts=[[.046*Math.cos(a),jetY+.046*Math.sin(a),-2.050],[.143*Math.cos(a+.13),jetY+.143*Math.sin(a+.13),-2.063],[.143*Math.cos(a+.24),jetY+.143*Math.sin(a+.24),-2.036],[.044*Math.cos(a+.21),jetY+.044*Math.sin(a+.21),-2.033]];polygon(root,jet,pts,'deep_turbine_fan_blade',.005,[0,0,-1]);}
cylinder(root,jet,.046,.035,[0,jetY,-2.050],[PI/2,0,0],24,'central_turbine_hub');
for(const x of[-.38,.38]){
 cylinder(root,edge,.067,.18,[x,.60,-2.18],[PI/2,0,0],24,'rear_auxiliary_exhaust');
 ring(root,steel,[x,.60,-2.275],.061,.007,'z','rear_auxiliary_exhaust_lip',32);
 cylinder(root,rubber,.051,.008,[x,.60,-2.28],[PI/2,0,0],24,'rear_auxiliary_exhaust_dark');
}
// The top has a real central intake cavity and crossed rear support rails.
polygon(root,rubber,[[-.49,1.54,-1.16],[.49,1.54,-1.16],[.43,1.46,-1.74],[-.43,1.46,-1.74]],'central_engine_intake_shadow',.016,[0,1,0]);
for(let i=-5;i<=5;i++)rod(root,edge,[i*.072,1.55,-1.18],[i*.064,1.48,-1.70],.014,'engine_intake_grille',10);
rod(root,edge,[-.53,1.76,-1.11],[.53,1.76,-1.11],.032,'aft_upper_cross_rail',16);
rod(root,edge,[-.52,1.75,-1.12],[-.53,1.70,-1.76],.030,'left_rear_top_rail',16);
rod(root,edge,[.52,1.75,-1.12],[.53,1.70,-1.76],.030,'right_rear_top_rail',16);
for(const x of[-.32,.32])rod(root,bronze,[x,1.55,-1.18],[x,1.73,-1.13],.022,'upper_rail_mount',12);
// Sparse genuine interior: two bucket seats, a flat armored dashboard and a
// sculpted control yoke behind the windshield rather than an empty shell.
for(const side of[-1,1]){
 roundedPanel(root,m.seat,.39,.46,[side*.37,1.11,-.55],{radius:.045,depth:.15,rotation:[.12,0,0],name:'armored_bucket_seat'});
 sphere(root,m.seat,[.15,.12,.085],[side*.37,1.39,-.57],16,'bucket_seat_headrest');
 box(root,m.seat,[.38,.10,.43],[side*.37,.85,-.35],[.04,0,0],'bucket_seat_cushion');
 rod(root,bronze,[side*.64,.58,-.77],[side*.63,1.43,-.77],.025,'internal_roll_frame',12);
}
box(root,m.carbon,[1.16,.14,.35],[0,1.02,.51],undefined,'armored_dashboard');
box(root,edge,[.20,.27,.67],[0,.90,-.02],undefined,'center_console');
line(root,m.darkMetal,[[.44,1.15,.22],[.52,1.19,.22],[.55,1.10,.22],[.44,1.06,.22],[.33,1.10,.22],[.36,1.19,.22],[.44,1.15,.22]],.018,'cockpit_control_yoke');

// Keep the central shovel behind the tyres' leading face. The reference has
// a compact prow, not a long racing-car nose. Only nose mesh positions change.
root.traverse(n=>{if(n.isMesh&&/^(long_angular_center_nose_spine|pointed_front_shovel|front_shovel_folded_lower_edge|heavy_lower_armored_floor|nose_)/.test(n.name)){const p=n.geometry.attributes.position;for(let i=0;i<p.count;i++){const z=p.getZ(i);if(z>1.15)p.setZ(i,1.15+(z-1.15)*.72);}p.needsUpdate=true;n.geometry.computeVertexNormals();}});

// Fit the authored mesh to the existing 3m drag lanes. Bake width into
// geometry and pivot translations, keeping every animated pivot unit-scaled:
// steering then rotates circular tyres without nonuniform-parent distortion.
const widthFit=.88,fitMatrix=new T.Matrix4().makeScale(widthFit,1,1),fitJobs=[];
root.updateMatrixWorld(true);
root.traverse(n=>{if(!n.isMesh)return;let frame=n.parent;while(frame!==root&&!/^(wheel_|steer_|axle_)/.test(frame.name))frame=frame.parent;const p=frame.getWorldPosition(new T.Vector3());const transform=new T.Matrix4().makeTranslation(-p.x*widthFit,-p.y,-p.z).multiply(fitMatrix).multiply(n.matrixWorld);fitJobs.push({n,frame,transform});});
for(const {n,frame,transform}of fitJobs){n.geometry.applyMatrix4(transform);n.position.set(0,0,0);n.quaternion.set(0,0,0,1);n.scale.set(1,1,1);frame.add(n);}
root.traverse(n=>{if(n.isGroup&&/^(wheel_|steer_|axle_)/.test(n.name))n.position.x*=widthFit;});
for(const p of Object.values(wheelCenters))p[0]*=widthFit;
for(const p of Object.values(axleCenters))p[0]*=widthFit;

const headlightPositions=[[-.728,1.584,.083],[.728,1.584,.083]],exhaustPositions=[[0,jetY,-2.405]],rearLampPositions=[[-.54,1.40,-1.97],[.54,1.40,-1.97]];
for(const p of [...headlightPositions,...rearLampPositions])p[0]*=widthFit;
const metadata={author:'UVelocity original mesh authoring',source:'scripts/build-tumbler.cjs',displayName:'Batmobile Tumbler — The Dark Knight',referenceBased:true,officialManufacturerAsset:false,representation:'original-reference-recreation',revision:'iconic-collection-1.6.0',wheelRadius:.50,rearWheelRadius:.70,wheelWidth:.48*widthFit,rearWheelWidth:.55*widthFit,wheelCenters,axleCenters,wheelRadii:{FL:.50,FR:.50,RL:.70,RR:.70,RL_inner:.70,RR_inner:.70},wheelRimRadii:{FL:.30,FR:.30,RL:.37,RR:.37,RL_inner:.37,RR_inner:.37},wheelGroups:Object.entries(wheelCenters).map(([name,center])=>({name:'wheel_'+name,center,radius:name.startsWith('F')?.50:.70,width:(name.startsWith('F')?.48:.55)*widthFit})),dualRearWheels:true,wheelCount:6,frontWheelCount:2,rearWheelCount:4,wheelbase:3.18,frontTrack:2.40*widthFit,rearTrack:2.11*widthFit,lateralTrackFit:widthFit,headlightPositions,rearLampPositions,exhaustPositions,tail:-2.405,exhaustX:0,exhaustY:jetY,up:'+Y',forward:'+Z',units:'metres',paintMaterials:['paint_body','paint_aero'],rimMaterial:'rim_paint',defaultColor:'#30343a',defaultFinish:'matte',cockpitEye:[.36*widthFit,1.39,-.13],features:['six actual tires: two steerable front and four paired rear','unequal front and rear rolling radii','angular layered armored body','split V windshield','open front wishbone suspension','bronze mechanical linkages','large deep central turbine with physical nozzle ribs and fan','separate swept rear armor wings','paired corner projector lamps','original reference-based game reconstruction']};
const output=path.resolve(__dirname,'../../work/tumbler-v160-assets',id+'.glb');
const report=exportGLB(root,output,metadata);
// Give only this new vehicle a restrained satin clearcoat; the shared exporter
// and all previous vehicles keep their established appearance unchanged.
{
 const glb=fs.readFileSync(output),n=glb.readUInt32LE(12),doc=JSON.parse(glb.subarray(20,20+n).toString()),bin=glb.subarray(28+n);
 for(const material of doc.materials)if(/^paint/.test(material.name)){material.extensions.KHR_materials_clearcoat={clearcoatFactor:.08,clearcoatRoughnessFactor:.58};}
 let json=Buffer.from(JSON.stringify(doc));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);const h=Buffer.alloc(20),b=Buffer.alloc(8);h.write('glTF');h.writeUInt32LE(2,4);h.writeUInt32LE(28+json.length+bin.length,8);h.writeUInt32LE(json.length,12);h.write('JSON',16);b.writeUInt32LE(bin.length);b.writeUInt32LE(0x004e4942,4);const result=Buffer.concat([h,json,b,bin]);fs.writeFileSync(output,result);report.bytes=result.length;
}
if(report.bounds.min[1]<-.002||report.bytes>9*1024*1024||report.triangles>190000||report.meshCount>70)throw new Error('Tumbler geometry exceeds budget or ground guard: '+JSON.stringify(report));
const data={...report,length:report.dimensions[2],sha256:crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex')};
fs.writeFileSync(output.replace(/\.glb$/,'.metadata.json'),JSON.stringify(data,null,2)+'\n');
if(process.argv.includes('--publish')){const target=path.resolve(__dirname,'../public/game/assets/cars',id+'.glb');fs.copyFileSync(output,target);fs.writeFileSync(target.replace(/\.glb$/,'.metadata.json'),JSON.stringify({...data,file:'/game/assets/cars/'+id+'.glb'},null,2)+'\n');}
console.log(JSON.stringify({id,file:output,bytes:data.bytes,triangles:data.triangles,meshCount:data.meshCount,dimensions:data.dimensions,bounds:data.bounds,sha256:data.sha256,published:process.argv.includes('--publish')},null,2));
