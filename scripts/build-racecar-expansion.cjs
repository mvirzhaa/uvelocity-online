'use strict';
/** Four independently authored UVelocity vehicle recreations.
 * Reference-based appearance, not scans, manufacturer CAD, or copied game meshes.
 * Run: node scripts/build-racecar-expansion.cjs [--publish]
 */
const fs=require('node:fs'),path=require('node:path');
const K=require('./modeling-kit.cjs');const {THREE:T,createModel,materials,mat,box,sphere,cylinder,tube,surface,bodyLoft,shape,oval,roundedPanel,cabin,wing,wheelRig,exportGLB,lerp}=K;
const output=path.resolve(__dirname,'../../work/expansion-assets');
const PI=Math.PI;
function trimLoop(root,m,points,r=.010){tube(root,m,points,r,true,Math.max(48,points.length*5));}
function facePatch(root,material,points,x,y,face,offset=0,name='contoured_panel'){const s=new T.Shape();s.moveTo(...points[0]);for(let i=1;i<points.length;i++)s.lineTo(...points[i]);s.closePath();const src=new T.ShapeGeometry(s,24),p=src.attributes.position,idx=src.index,positions=[],normals=[];
 function emit(a,b,c,depth){const edge=(u,v)=>Math.hypot(u[0]-v[0],u[1]-v[1]);if(depth<5&&Math.max(edge(a,b),edge(b,c),edge(c,a))>.065){const ab=[(a[0]+b[0])/2,(a[1]+b[1])/2],bc=[(b[0]+c[0])/2,(b[1]+c[1])/2],ca=[(c[0]+a[0])/2,(c[1]+a[1])/2];emit(a,ab,ca,depth+1);emit(ab,b,bc,depth+1);emit(ca,bc,c,depth+1);emit(ab,bc,ca,depth+1);return;}for(const v of[a,b,c]){const xx=v[0]+x,yy=v[1]+y,eps=.001,n=new T.Vector3(-(face(xx+eps,yy)-face(xx-eps,yy))/(2*eps),-(face(xx,yy+eps)-face(xx,yy-eps))/(2*eps),1).normalize();positions.push(xx,yy,face(xx,yy)+offset);normals.push(n.x,n.y,n.z);}}
 for(let i=0;i<idx.count;i+=3){const ids=[idx.getX(i),idx.getX(i+1),idx.getX(i+2)];emit(...ids.map(k=>[p.getX(k),p.getY(k)]),0);}const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('normal',new T.Float32BufferAttribute(normals,3));return K.mesh(root,g,material,name);}
function recess(root,m,points,x,y,face,depth=.065,rimMaterial=m.darkMetal){facePatch(root,m.carbon,points.map(([a,b])=>[a*.94,b*.94]),x,y,face,-depth,'recess_back');for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];surface(root,m.darkMetal,3,3,(u,v)=>{const xx=x+lerp(a[0],b[0],u)*(1-v*.06),yy=y+lerp(a[1],b[1],u)*(1-v*.06);return[xx,yy,face(xx,yy)-v*depth];},'recess_wall');}trimLoop(root,rimMaterial,points.map(([a,b])=>[x+a,y+b,face(x+a,y+b)+.003]),.008);}
function sideRecess(root,m,side,{x=.90,y=.50,z=.5,w=.50,h=.25,depth=.13}){const pts=[[-w*.5,-h*.42],[w*.5,-h*.40],[w*.39,h*.40],[-w*.43,h*.47]],ss=new T.Shape();ss.moveTo(...pts[0]);for(let i=1;i<pts.length;i++)ss.lineTo(...pts[i]);ss.closePath();const g=new T.ShapeGeometry(ss),p=g.attributes.position;for(let i=0;i<p.count;i++){const zz=p.getX(i)+z,yy=p.getY(i)+y;p.setXYZ(i,side*(x-depth),yy,zz);}if(side>0){const idx=g.index;for(let i=0;i<idx.count;i+=3){const a=idx.getX(i+1);idx.setX(i+1,idx.getX(i+2));idx.setX(i+2,a);}}g.computeVertexNormals();K.mesh(root,g,m.carbon,'intake_deep_back');for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length];surface(root,m.carbon,8,5,(u,v)=>[side*(x-v*depth),y+lerp(a[1],b[1],u)*(1-v*.1),z+lerp(a[0],b[0],u)*(1-v*.1)],'intake_tunnel',side>0);}trimLoop(root,m.paint,pts.map(([zz,yy])=>[side*(x+.003),y+yy,z+zz]),.019);for(let i=0;i<4;i++)box(root,m.darkMetal,[.018,.008,w*.75],[side*(x-depth*.75),y+lerp(-h*.25,h*.25,i/3),z],undefined,'deep_intake_louvre');}
function badge(root,m,x,y,z,r=.035){cylinder(root,m.metal,r,.008,[x,y,z],[PI/2,0,0],32);cylinder(root,m.carbon,r*.81,.010,[x,y,z+.004],[PI/2,0,0],32);}
function star(root,m,x,y,z,r=.13){const pts=[];for(let i=0;i<64;i++){const a=i*PI*2/64;pts.push([x+Math.cos(a)*r,y+Math.sin(a)*r,z]);}trimLoop(root,m.metal,pts,.011);for(let i=0;i<3;i++){const a=PI/2+i*PI*2/3,b=a+PI*.10;shape(root,m.metal,[[0,0],[Math.cos(a)*r*.90,Math.sin(a)*r*.90],[Math.cos(b)*r*.26,Math.sin(b)*r*.26]],{position:[x,y,z+.003],depth:.008,bevel:.002});}}
function kidney(root,m,{x,y,z,w,h,prototype=false,face}){
 const base=prototype?[[-.50,.40],[-.28,.50],[.47,.43],[.50,.23],[.39,-.42],[-.33,-.50],[-.50,-.22]]:[[-.46,.29],[-.27,.49],[.38,.47],[.50,.21],[.41,-.40],[-.32,-.48],[-.49,-.23]];
 const pts=base.map(([a,b])=>[a*w,b*h]);const f=face||(()=>z);recess(root,m,pts,x,y,f,prototype?.10:.07,prototype?m.front:m.darkMetal);
 const count=prototype?7:8;for(let i=0;i<count;i++){const xx=x+lerp(-w*.35,w*.35,i/(count-1));tube(root,m.darkMetal,[[xx,y-h*.34,f(xx,y-h*.34)-.024],[xx,y+h*.35,f(xx,y+h*.35)-.024]],prototype?.009:.008,false,8,'kidney_slat');}
}
function frontSlats(root,m,{z,y,w,h,count=14,ovalShape=true}){
 if(ovalShape)oval(root,m.carbon,w,h,[0,y,z],.018,'grille_cavity');else roundedPanel(root,m.carbon,w,h,[0,y,z],{depth:.02,radius:.12});
 const points=[];for(let i=0;i<80;i++){const a=i*2*PI/80;points.push([Math.cos(a)*w*.5,y+Math.sin(a)*h*.5,z+.024]);}trimLoop(root,m.darkMetal,points,.015);
 for(let i=0;i<count;i++){const x=lerp(-w*.43,w*.43,i/(count-1)),height=h*.44*Math.sqrt(Math.max(.05,1-(x/(w*.51))**2));tube(root,m.metal,[[x,y-height,z+.027],[x,y+height,z+.027]],.008,false,8,'grille_vertical_bar');}
}
function lamp(root,m,{side,x,y,z,w=.32,h=.16,slant=.0,vertical=false,face}){
 const pts=vertical?[[-w*.45,-h*.49],[w*.45,-h*.48],[w*.43,h*.20],[w*.19,h*.48],[-w*.39,h*.40]]:[[-w*.50,-h*.35],[w*.44,-h*.50],[w*.50,h*.40],[-w*.35,h*.50]];
 if(face){facePatch(root,m.glass,pts,side*x,y,face,.004,'flush_headlight_glass');trimLoop(root,m.darkMetal,pts.map(([a,b])=>[side*x+a,y+b,face(side*x+a,y+b)+.006]),.006);
  if(vertical){for(const yy of [-.10,-.015,.075]){const r=w*.20,py=y+yy;const circle=[];for(let i=0;i<24;i++){const a=i*PI*2/24;circle.push([r*Math.cos(a),r*Math.sin(a)]);}facePatch(root,m.front,circle,side*x,py,face,.009,'stacked_led_module');}}
  else{for(const dx of [-w*.23,w*.20]){const cx=side*x+dx,r=h*.26,points=[];for(let i=0;i<16;i++){const a=PI*.10+i*PI*1.78/15;points.push([cx+r*Math.cos(a),y+r*Math.sin(a),face(cx+r*Math.cos(a),y+r*Math.sin(a))+.009]);}tube(root,m.front,points,.007,false,28,'projector_drl_ring');}}
  return;
 }
 shape(root,m.carbon,pts,{position:[side*x,y,z],rotation:[0,side*slant,0],depth:.015,bevel:.008,name:'headlight_housing'});
 if(vertical){for(const yy of [-.03,.07])oval(root,m.front,w*.49,h*.25,[side*x,y+yy,z+.026],.01,'projector');tube(root,m.front,[[side*(x-w*.35),y-h*.35,z+.027],[side*(x+w*.35),y-h*.35,z+.027]],.008,false,12,'drl');}
 else{for(const offset of [-.22,.19])oval(root,m.front,w*.24,h*.58,[side*x+w*offset,y-.008,z+.028],.008,'projector');tube(root,m.front,[[side*x-w*.37,y+h*.24,z+.03],[side*x+w*.34,y+h*.23,z+.03]],.009,false,16,'drl');}
}
function hoodVent(root,m,x,y,z,w,h,slats=6){roundedPanel(root,m.carbon,w,h,[x,y,z],{rotation:[-PI/2,0,0],depth:.009,radius:.025,name:'bonnet_vent'});for(let i=0;i<slats;i++)box(root,m.darkMetal,[w*.88,.012,.015],[x,y+.015,z+lerp(-h*.36,h*.36,i/(slats-1))],[.10,0,0],'vent_louvre');}
function diffuser(root,m,{rear=-2.3,w=1.7,y=.19,depth=.38}){box(root,m.carbon,[w,.035,depth],[0,y,rear+.10],[.10,0,0],'rear_diffuser');for(let i=0;i<7;i++)box(root,m.carbon,[.012,.13,depth],[lerp(-w*.46,w*.46,i/6),y-.015,rear+.08],[.11,0,0],'diffuser_fin');}
function exhaust(root,m,x,y,z){cylinder(root,m.darkMetal,.048,.13,[x,y,z],[PI/2,0,0],32,'exhaust_outer');cylinder(root,m.carbon,.037,.135,[x,y,z-.003],[PI/2,0,0],24,'exhaust_bore');}
function mirrors(root,m,{x=.96,y=1.02,z=.12}){for(const side of [-1,1]){tube(root,m.carbon,[[side*(x-.18),y-.06,z-.04],[side*(x-.02),y,z]],.016,false,12,'mirror_stalk');sphere(root,m.paint,[.115,.051,.14],[side*x,y+.015,z],24,'mirror_housing');roundedPanel(root,m.metal,.16,.065,[side*x,y+.01,z-.112],{rotation:[0,PI,0],radius:.015,name:'mirror_glass'});}}
function doorSeams(root,m,{x=.91,front=.60,rear=-1.05,top=.80,bottom=.26,roof=1.3,base=.85}){for(const side of [-1,1]){
 const xx=side*x;tube(root,m.carbon,[[xx,top,front],[xx+.005*side,.51,front-.025],[xx,bottom,front-.15],[xx,bottom,rear+.14],[xx,.56,rear],[xx,top,rear]],.006,false,70,'door_panel_gap');box(root,m.darkMetal,[.012,.018,.12],[side*(x+.012),top-.08,rear+.17],undefined,'door_handle');
 tube(root,m.carbon,[[side*(x-.01),.23,rear-.15],[side*(x+.017),.22,front+.30]],.024,false,40,'side_skirt_edge');
 }}
function tail(root,m,{x=.62,y=.73,z=-2.31,w=.38,h=.09}){for(const side of [-1,1]){roundedPanel(root,m.carbon,w+.04,h+.04,[side*x,y,z],{rotation:[0,PI,0],radius:.025,name:'rear_lamp_housing'});roundedPanel(root,m.rear,w,h,[side*x,y,z-.016],{rotation:[0,PI,0],radius:.023,name:'rear_lamp'});}}
function lowAero(root,m,{length=4.65,width=1.89,front=2.38,rear=-2.3}){box(root,m.carbon,[width,.025,.27],[0,.13,front-.055],undefined,'front_splitter');for(const side of [-1,1]){box(root,m.carbon,[.08,.045,length*.62],[side*width*.48,.17,(front+rear)/2],undefined,'side_sill');}diffuser(root,m,{rear,w:width*.87,y:.19});}
function frontLowerIntakes(root,m,{z=2.39,width=1.72,y=.30,face}){if(face){recess(root,m,K.roundedRectPoints(width*.50,.19,.035),0,y,face,.065,m.paint);for(const side of [-1,1])recess(root,m,[[-.14,-.10],[.14,-.10],[.155,.11],[-.09,.08]],side*width*.335,y+.015,face,.09,m.paint);for(let i=-5;i<=5;i++){const x=i*width*.044;box(root,m.darkMetal,[.008,.14,.014],[x,y,face(x,y)-.03],undefined,'recessed_grille_mesh');}return;}roundedPanel(root,m.carbon,width*.53,.19,[0,y,z],{radius:.03,depth:.014,name:'lower_radiator'});for(const side of [-1,1])shape(root,m.carbon,[[-.19,-.11],[.18,-.11],[.20,.12],[-.12,.09]],{position:[side*width*.39,y+.015,z],depth:.017,bevel:.012,name:'brake_cooling_intake'});for(let i=-5;i<=5;i++)box(root,m.darkMetal,[.008,.14,.014],[i*width*.044,y,z+.026],undefined,'lower_grille_mesh');}
function addRaceDetails(root,m,{front=2.35,rear=-2.3,roof=1.3,hoodY=.8}){tube(root,m.carbon,[[0,hoodY+.045,.48],[.08,hoodY+.055,.76],[.18,hoodY+.057,1.04]],.009,false,16,'windscreen_wiper');cylinder(root,m.darkMetal,.008,.19,[0,roof+.08,-.75],[0,0,0],10,'antenna');for(const side of [-1,1]){cylinder(root,m.metal,.019,.009,[side*.45,hoodY+.01,1.67],[0,0,0],16,'bonnet_pin');}tube(root,m.red,[[.35,.29,front+.025],[.35,.23,front+.09],[.43,.23,front+.09],[.43,.30,front+.025]],.009,false,24,'front_tow_loop');}
const provenance='Original UVelocity reference-based recreation; independently generated sculpted surfaces and details; not a manufacturer mesh, scan, or copied game asset.';
function m4(){
 const id='bmw-m4-gt4',root=createModel(id,{provenance,reference:'User image(3).png: first-generation F82 BMW M4 GT4'}),m=materials(0xd9dfe5),rig=wheelRig(root,m,{wheelbase:2.81,track:1.66,radius:.347,width:.295,spokes:12});
 const shell=bodyLoft(root,m.paint,[{z:-2.34,w:.80,c:.69,s:.74,b:.19},{z:-2.15,w:.90,c:.78,s:.84,b:.18},{z:-1.40,w:.95,c:.83,s:.90,b:.18},{z:-.80,w:.90,c:.82,s:.86,b:.18},{z:.30,w:.89,c:.82,s:.86,b:.18},{z:1.405,w:.94,c:.79,s:.89,b:.18},{z:1.90,w:.89,c:.76,s:.82,b:.18},{z:2.28,w:.84,c:.71,s:.76,b:.20},{z:2.38,w:.81,c:.69,s:.73,b:.20}],{wheelArches:[{z:1.405,y:.347,r:.391},{z:-1.405,y:.347,r:.391}],wellMaterial:m.carbon,underMaterial:m.carbon,edgeDrop:.060,sideInset:.075,smoothSeams:true,nose:{from:1.65,round:.34,bottomInset:.065,topInset:.012,openings:[{x:-.205,y:.59,rx:.18,ry:.105},{x:.205,y:.59,rx:.18,ry:.105},{x:0,y:.30,rx:.41,ry:.083},{x:-.58,y:.315,rx:.13,ry:.085},{x:.58,y:.315,rx:.13,ry:.085}]}});
 cabin(root,m,{front:.59,rear:-1.56,width:.70,base:.84,roof:1.35,roofFront:-.08,roofRear:-.91,windowBottom:.86});mirrors(root,m,{x:1.02,y:1.02,z:.43});doorSeams(root,m,{x:.91,front:.67,rear:-.94,top:.83});
 kidney(root,m,{x:-.205,y:.59,z:2.394,w:.39,h:.25,face:shell.frontZ});kidney(root,m,{x:.205,y:.59,z:2.394,w:.39,h:.25,face:shell.frontZ});
 for(const side of [-1,1]){lamp(root,m,{side,x:.63,y:.687,z:2.365,w:.40,h:.16,slant:.04,face:shell.frontZ});hoodVent(root,m,side*.43,.836,1.20,.18,.40,5);tube(root,m.carbon,[[side*.43,.728,2.15],[side*.48,.82,1.55],[side*.63,.855,.60]],.005,false,40,'bonnet_seam');
  shape(root,m.carbon,[[-.12,-.12],[.11,-.08],[.08,.13],[-.13,.16]],{position:[side*.935,.64,.83],rotation:[0,side*PI/2,0],depth:.012,bevel:.009,name:'front_fender_exit'});
 }
 frontLowerIntakes(root,m,{z:2.40,width:1.74,y:.30,face:shell.frontZ});lowAero(root,m,{front:2.46,rear:-2.34,width:1.90});tail(root,m,{x:.61,y:.72,z:-2.36,w:.42,h:.095});wing(root,m,{width:1.81,z:-2.02,y:1.22,chord:.31,postHeight:.43,endplateHeight:.24});exhaust(root,m,-.63,.28,-2.37);exhaust(root,m,.63,.28,-2.37);badge(root,m,0,.748,2.37);addRaceDetails(root,m,{front:2.42,rear:-2.34,roof:1.35,hoodY:.82});return{root,rig};
}
function amg(){
 const id='amg-gt4',root=createModel(id,{provenance,reference:'User image(4).png: early Mercedes-AMG GT4'}),m=materials(0xaab2bc),rig=wheelRig(root,m,{wheelbase:2.63,track:1.70,radius:.350,width:.31,zOffset:.045,spokes:10});
 const shell=bodyLoft(root,m.paint,[{z:-2.32,w:.78,c:.66,s:.73,b:.18},{z:-2.10,w:.92,c:.76,s:.84,b:.18},{z:-1.27,w:.99,c:.82,s:.91,b:.18},{z:-.65,w:.91,c:.83,s:.87,b:.18},{z:.23,w:.90,c:.82,s:.85,b:.17},{z:1.36,w:.98,c:.78,s:.88,b:.17},{z:1.90,w:.92,c:.72,s:.80,b:.18},{z:2.25,w:.85,c:.67,s:.73,b:.18},{z:2.35,w:.80,c:.63,s:.69,b:.19}],{wheelArches:[{z:1.36,y:.35,r:.396},{z:-1.27,y:.35,r:.396}],wellMaterial:m.carbon,underMaterial:m.carbon,edgeDrop:.067,sideInset:.085,smoothSeams:true,sideOpenings:[{z:.62,y:.65,rz:.22,ry:.09}],nose:{from:1.62,round:.39,bottomInset:.065,topInset:.020,openings:[{x:0,y:.49,rx:.60,ry:.19,type:'ellipse'},{x:0,y:.27,rx:.42,ry:.08},{x:-.59,y:.285,rx:.13,ry:.08},{x:.59,y:.285,rx:.13,ry:.08}]}});
 cabin(root,m,{front:.25,rear:-1.98,width:.635,base:.835,roof:1.205,roofFront:-.43,roofRear:-.97,windowBottom:.84});mirrors(root,m,{x:1.02,y:.99,z:.15});doorSeams(root,m,{x:.915,front:.49,rear:-1.02,top:.82});
 const grille=Array.from({length:56},(_,i)=>[Math.cos(i*PI*2/56)*.64,Math.sin(i*PI*2/56)*.225]);recess(root,m,grille,0,.49,shell.frontZ,.10);for(let i=0;i<15;i++){const x=lerp(-.56,.56,i/14),h=.19*Math.sqrt(1-(x/.65)**2);tube(root,m.metal,[[x,.49-h,shell.frontZ(x,.49-h)-.025],[x,.49+h,shell.frontZ(x,.49+h)-.025]],.007,false,12,'amg_grille_slats');}star(root,m,0,.49,shell.frontZ(0,.49)+.015,.132);
 for(const side of [-1,1]){lamp(root,m,{side,x:.70,y:.716,z:2.315,w:.36,h:.18,slant:.08,face:shell.frontZ});hoodVent(root,m,side*.43,.819,1.17,.22,.44,7);tube(root,m.carbon,[[side*.46,.70,2.21],[side*.54,.81,1.67],[side*.65,.85,.39]],.005,false,42,'bonnet_seam');
  sideRecess(root,m,side,{x:.912,y:.65,z:.62,w:.53,h:.25,depth:.13});
 }
 frontLowerIntakes(root,m,{z:2.38,width:1.76,y:.27,face:shell.frontZ});lowAero(root,m,{front:2.45,rear:-2.34,width:1.96});tail(root,m,{x:.61,y:.73,z:-2.345,w:.44,h:.07});wing(root,m,{width:1.81,z:-2.06,y:1.16,chord:.28,postHeight:.40,endplateHeight:.20});exhaust(root,m,-.65,.27,-2.36);exhaust(root,m,.65,.27,-2.36);badge(root,m,0,.696,2.30,.03);addRaceDetails(root,m,{front:2.40,roof:1.205,hoodY:.82});return{root,rig};
}
function sls(){
 const id='sls-amg-gt3',root=createModel(id,{provenance,reference:'User image(5).png: C197 Mercedes-Benz SLS AMG GT3'}),m=materials(0x717d8b),rig=wheelRig(root,m,{wheelbase:2.68,track:1.73,radius:.352,width:.315,zOffset:.015,spokes:12});
 const shell=bodyLoft(root,m.paint,[{z:-2.34,w:.80,c:.69,s:.75,b:.18},{z:-2.07,w:.94,c:.77,s:.85,b:.18},{z:-1.325,w:.99,c:.83,s:.92,b:.18},{z:-.65,w:.92,c:.83,s:.88,b:.18},{z:.25,w:.90,c:.85,s:.87,b:.18},{z:1.355,w:.99,c:.82,s:.92,b:.18},{z:1.91,w:.94,c:.78,s:.87,b:.18},{z:2.27,w:.87,c:.72,s:.81,b:.19},{z:2.43,w:.81,c:.68,s:.74,b:.19}],{wheelArches:[{z:1.355,y:.352,r:.397},{z:-1.325,y:.352,r:.397}],wellMaterial:m.carbon,underMaterial:m.carbon,edgeDrop:.060,sideInset:.080,smoothSeams:true,sideOpenings:[{z:.61,y:.64,rz:.23,ry:.10}],nose:{from:1.65,round:.34,bottomInset:.065,topInset:.015,openings:[{x:0,y:.52,rx:.60,ry:.15},{x:0,y:.26,rx:.42,ry:.08},{x:-.59,y:.275,rx:.13,ry:.08},{x:.59,y:.275,rx:.13,ry:.08}]}});
 cabin(root,m,{front:-.04,rear:-1.82,width:.66,base:.85,roof:1.275,roofFront:-.57,roofRear:-1.18,windowBottom:.85});mirrors(root,m,{x:1.025,y:1.01,z:.06});doorSeams(root,m,{x:.927,front:.34,rear:-1.02,top:.84});
 for(const side of [-1,1]){tube(root,m.carbon,[[side*.19,1.306,-.42],[side*.19,1.306,-1.05],[side*.60,1.27,-1.13]],.005,false,30,'gullwing_roof_seam');lamp(root,m,{side,x:.76,y:.68,z:2.370,w:.27,h:.31,slant:.035,vertical:true,face:shell.frontZ});
  hoodVent(root,m,side*.38,.862,.84,.27,.54,7);tube(root,m.carbon,[[side*.47,.75,2.16],[side*.55,.849,1.49],[side*.64,.885,.19]],.006,false,45,'hood_panel_gap');
  sideRecess(root,m,side,{x:.925,y:.64,z:.61,w:.57,h:.28,depth:.13});
 }
 const grilleShape=K.roundedRectPoints(1.32,.37,.115);recess(root,m,grilleShape,0,.52,shell.frontZ,.095);tube(root,m.metal,Array.from({length:24},(_,i)=>{const x=lerp(-.61,.61,i/23);return[x,.52,shell.frontZ(x,.52)+.008];}),.012,false,40,'sls_grille_crossbar');star(root,m,0,.52,shell.frontZ(0,.52)+.024,.129);
 for(let i=-8;i<=8;i++)box(root,m.darkMetal,[.010,.27,.012],[i*.067,.52,shell.frontZ(i*.067,.52)-.035],undefined,'grille_mesh');frontLowerIntakes(root,m,{z:2.46,width:1.76,y:.26,face:shell.frontZ});lowAero(root,m,{front:2.54,rear:-2.35,width:1.99});tail(root,m,{x:.62,y:.745,z:-2.37,w:.42,h:.085});wing(root,m,{width:1.94,z:-2.04,y:1.27,chord:.33,postHeight:.48,endplateHeight:.23});exhaust(root,m,-.65,.27,-2.37);exhaust(root,m,.65,.27,-2.37);badge(root,m,0,.76,2.29,.028);addRaceDetails(root,m,{front:2.49,roof:1.275,hoodY:.85});return{root,rig};
}
function hybrid(){
 const id='bmw-hybrid-v8',root=createModel(id,{provenance,reference:'User image(2).png: 2023 BMW M Hybrid V8 prototype'}),m=materials(0xe2e6eb),rig=wheelRig(root,m,{wheelbase:3.15,track:1.75,radius:.355,width:.335,spokes:12});
 const shell=bodyLoft(root,m.paint,[{z:-2.53,w:.91,c:.48,s:.68,b:.12},{z:-2.18,w:.99,c:.60,s:.79,b:.12},{z:-1.575,w:1.00,c:.69,s:.83,b:.12},{z:-.92,w:.91,c:.69,s:.67,b:.12},{z:0,w:.89,c:.63,s:.55,b:.12},{z:.86,w:.93,c:.54,s:.62,b:.12},{z:1.575,w:1.00,c:.53,s:.83,b:.12},{z:2.08,w:.97,c:.57,s:.77,b:.12},{z:2.48,w:.89,c:.58,s:.83,b:.14},{z:2.55,w:.83,c:.56,s:.79,b:.15}],{wheelArches:[{z:1.575,y:.355,r:.404},{z:-1.575,y:.355,r:.404}],wellMaterial:m.carbon,underMaterial:m.carbon,segments:136,crossSegments:36,edgeDrop:.055,sideInset:.070,smoothSeams:true,sideOpenings:[{z:-.24,y:.39,rz:.48,ry:.115},{z:-1.01,y:.55,rz:.17,ry:.08}],nose:{from:1.88,round:.32,bottomInset:.08,topInset:.015,openings:[{x:-.334,y:.384,rx:.255,ry:.16},{x:.334,y:.384,rx:.255,ry:.16}]}});
 cabin(root,m,{front:.38,rear:-1.26,width:.355,base:.65,roof:1.015,roofFront:-.19,roofRear:-.76,windowBottom:.65,pillars:false,seatCount:1});
 for(const side of [-1,1])tube(root,m.paint,[[side*.37,.665,.38],[side*.315,.985,-.19],[side*.315,.985,-.76],[side*.37,.665,-1.26]],.018,false,64,'prototype_canopy_rail');
 // Raised fender ridges and broad black side channels distinguish the prototype.
 for(const side of [-1,1]){
  sideRecess(root,m,side,{x:.893,y:.39,z:-.24,w:1.12,h:.34,depth:.18});
  sideRecess(root,m,side,{x:.934,y:.55,z:-1.01,w:.45,h:.24,depth:.16});
  hoodVent(root,m,side*.80,.846,1.55,.19,.42,7);hoodVent(root,m,side*.80,.844,-1.55,.19,.38,6);
  tube(root,m.carbon,[[side*.62,.65,2.33],[side*.62,.73,1.92],[side*.65,.78,1.47],[side*.59,.64,.96]],.009,false,45,'fender_channel_edge');
  lamp(root,m,{side,x:.76,y:.55,z:2.492,w:.21,h:.32,slant:.03,vertical:true,face:shell.frontZ});
  tube(root,m.carbon,[[side*.43,.90,-.05],[side*.76,.91,.02],[side*.83,.88,.05]],.017,false,24,'prototype_mirror_arm');sphere(root,m.paint,[.09,.04,.13],[side*.85,.88,.06],24,'prototype_mirror');
 }
 kidney(root,m,{x:-.334,y:.384,z:2.567,w:.61,h:.40,prototype:true,face:shell.frontZ});kidney(root,m,{x:.334,y:.384,z:2.567,w:.61,h:.40,prototype:true,face:shell.frontZ});
 shape(root,m.paint,[[-2.27,.66],[-2.25,.96],[-.78,1.105],[-.56,.78]],{position:[.009,0,0],rotation:[0,-PI/2,0],depth:.018,bevel:.002,name:'prototype_shark_fin'});
 // Roof scoop has an open dark mouth and a smooth rear fairing.
 sphere(root,m.carbon,[.135,.07,.22],[0,1.042,-.47],28,'roof_intake_fairing');roundedPanel(root,m.carbon,.25,.115,[0,1.07,-.255],{radius:.035,depth:.016,name:'roof_intake_mouth'});
 wing(root,m,{width:2.00,z:-2.26,y:1.07,chord:.37,postHeight:.45,postSpacing:1.25,endplateHeight:.28,paint:true});
 lowAero(root,m,{length:5.1,front:2.61,rear:-2.55,width:2.04});diffuser(root,m,{rear:-2.56,w:1.85,y:.19,depth:.54});tail(root,m,{x:.65,y:.65,z:-2.555,w:.40,h:.055});exhaust(root,m,-.30,.42,-2.56);exhaust(root,m,.30,.42,-2.56);
 for(const side of [-1,1]){shape(root,m.carbon,[[-.12,-.025],[.12,-.025],[.08,.025],[-.10,.09]],{position:[side*.94,.38,2.21],rotation:[0,side*PI/2,0],depth:.014,bevel:.002,name:'front_dive_plane'});}
 badge(root,m,0,.635,2.45,.030);return{root,rig};
}
const builders={'bmw-hybrid-v8':hybrid,'bmw-m4-gt4':m4,'amg-gt4':amg,'sls-amg-gt3':sls};
const effects={
 'bmw-hybrid-v8':{tail:-2.625,exhaustX:.30,exhaustY:.42,headlightPositions:[[-.76,.55,2.54],[.76,.55,2.54]]},
 'bmw-m4-gt4':{tail:-2.435,exhaustX:.63,exhaustY:.28,headlightPositions:[[-.63,.687,2.40],[.63,.687,2.40]]},
 'amg-gt4':{tail:-2.425,exhaustX:.65,exhaustY:.27,headlightPositions:[[-.70,.716,2.35],[.70,.716,2.35]]},
 'sls-amg-gt3':{tail:-2.435,exhaustX:.65,exhaustY:.27,headlightPositions:[[-.76,.68,2.40],[.76,.68,2.40]]}
};
const only=process.argv.find(s=>s.startsWith('--id='))?.slice(5);const reports=[];
for(const[id,build]of Object.entries(builders)){if(only&&id!==only)continue;const{root,rig}=build();const dest=path.join(output,id,id+'.glb');const report=exportGLB(root,dest,{author:'UVelocity original mesh authoring',source:'scripts/build-racecar-expansion.cjs',referenceBased:true,officialManufacturerAsset:false,representation:'original-reference-recreation',wheelRadius:rig.radius,wheelWidth:rig.width,wheelCenters:rig.centers,up:'+Y',forward:'+Z',units:'metres',paintMaterials:['paint_body','paint_aero'],...effects[id]});
 report.length=report.dimensions[2];report.exhaustPositions=[[-effects[id].exhaustX,effects[id].exhaustY,effects[id].tail],[effects[id].exhaustX,effects[id].exhaustY,effects[id].tail]];fs.writeFileSync(dest.replace(/\.glb$/,'.metadata.json'),JSON.stringify(report,null,2)+'\n');
 if(report.bounds.min[1]<-.002)throw new Error(id+': below ground '+report.bounds.min[1]);if(report.bytes>7*1024*1024)throw new Error(id+': oversized');
 if(process.argv.includes('--publish')){const target=path.join(__dirname,'../public/game/assets/cars',id+'.glb');fs.copyFileSync(dest,target);const publicMetadata={...report,file:'/game/assets/cars/'+id+'.glb'};fs.writeFileSync(target.replace(/\.glb$/,'.metadata.json'),JSON.stringify(publicMetadata,null,2)+'\n');report.publishedFile=target;}
 reports.push(report);console.log(JSON.stringify({id,triangles:report.triangles,bytes:report.bytes,meshes:report.meshCount,dimensions:report.dimensions,published:!!report.publishedFile}));
}
fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'racecar-build-manifest.json'),JSON.stringify(reports,null,2)+'\n');
