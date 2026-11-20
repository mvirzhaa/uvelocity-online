'use strict';
/** Original, reference-based UVelocity recreations. Not scanned or manufacturer CAD.
 * Every surface below is independently authored. +Y up, +Z front, metres.
 * Run: node scripts/build-hypercar-expansion.cjs [--publish] [--id=jesko-absolut]
 */
const fs=require('node:fs'),path=require('node:path');
const K=require('./modeling-kit.cjs');
const {THREE:T,createModel,materials,mat,mesh,box,sphere,cylinder,tube,surface,bodyLoft,shape,oval,roundedPanel,cabin,wing,wheelRig,exportGLB,lerp}=K;
const PI=Math.PI,OUT=path.resolve(__dirname,'../../work/expansion-assets');
const provenance='Original UVelocity reference-based recreation; independently authored geometry, not a manufacturer mesh, scan, or extracted game asset.';
function ring(root,m,r,t,position,rotation=[0,0,0],name='ring'){const g=new T.TorusGeometry(r,t,10,64),o=mesh(root,g,m,name);o.position.set(...position);o.rotation.set(...rotation);return o;}
function grille(root,m,w,h,pos,rotation=[0,0,0],slats=12){const group=new T.Group();group.position.set(...pos);group.rotation.set(...rotation);root.add(group);roundedPanel(group,m.carbon,w,h,[0,0,0],{radius:Math.min(h*.35,.06),depth:.014,name:'intake_recess'});for(let i=0;i<slats;i++)box(group,m.darkMetal,[.008,h*.77,.012],[lerp(-w*.45,w*.45,i/(slats-1)),0,.017],undefined,'radiator_fins');return group;}
function bonnetVent(root,m,pos,w,l){grille(root,m,w,l,pos,[-PI/2,0,0],8);}
function recessedIntake(root,m,body,{x,y,rx,ry}){
 const lip=[],deep=[];for(let i=0;i<72;i++){const a=i*PI*2/72,xx=x+rx*Math.cos(a),yy=y+ry*Math.sin(a),z=body.frontZ(xx,yy);lip.push([xx,yy,z+.002]);deep.push([xx,yy,z-.055]);}
 surface(root,m.carbon,72,9,(u,v)=>{const a=u*2*PI,xx=x+rx*Math.cos(a),yy=y+ry*Math.sin(a);return[xx,yy,body.frontZ(xx,yy)-.068*v];},'intake_inner_wall');
 surface(root,m.carbon,36,18,(u,v)=>{const xx=x+(u*2-1)*rx,yy=y+(v*2-1)*ry;return[xx,yy,body.frontZ(xx,yy)-.067];},'recessed_radiator');
 tube(root,m.darkMetal,lip,.009,true,96,'intake_rolled_edge');
 for(let i=-6;i<=6;i++){const xx=x+i*rx/7,h=ry*Math.sqrt(1-(i/7)**2)*.88;tube(root,m.darkMetal,[[xx,y-h,body.frontZ(xx,y-h)-.049],[xx,y+h,body.frontZ(xx,y+h)-.049]],.004,false,6,'radiator_slat');}
}
function loftTop(body,x,z,nose,offset=.010){const a=body.sample(z),q=Math.min(1,Math.abs(x)/a.w),y=a.c+(a.s-a.c)*Math.sin(q*PI/2)**2-.065*q**8,t=Math.max(0,Math.min(1,(z-nose.from)/(nose.end-nose.from))),v=Math.max(0,Math.min(1,(y-a.b)/(a.c-a.b)));return[x,y+offset,z-t*t*(nose.round*q**4+nose.bottomInset*(1-v)**2+nose.topInset*v**4)];}
function sweptLamp(root,m,body,side,nose,{z=2.20,length=.58,x=.65,dx=.17,width=.12}={}){const at=(u,v,offset)=>loftTop(body,side*(x+dx*u+(v-.5)*width),z-length*u,nose,offset);surface(root,m.carbon,60,9,(u,v)=>at(u,v,.009),'flush_headlamp_housing');for(const v of [.27,.68]){const pts=[];for(let i=0;i<=60;i++)pts.push(at(i/60,v,.018));tube(root,m.front,pts,.0085,false,75,'swept_led');}return at(.5,.5,.018);}
function sideVent(root,m,body,side,{z0=-1.02,z1=-.06,y0=.80,y1=.58,bottom=.30,inset=.08}={}){const at=(u,v,offset=.004)=>{const z=lerp(z0,z1,u),a=body.sample(z),top=lerp(y0,y1,u),low=bottom+.035*Math.sin(u*PI),y=lerp(low,top,v),h=Math.max(.001,a.s-.065-a.b),q=Math.max(0,Math.min(1,(a.s-.065-y)/h));return[side*(a.w-inset*Math.sin(q*PI/2)+offset),y,z];};surface(root,m.carbon,64,24,(u,v)=>at(u,v),'contoured_side_intake',side>0);const lip=[];for(let i=0;i<=40;i++)lip.push(at(i/40,1,.01));for(let i=1;i<=20;i++)lip.push(at(1,1-i/20,.01));for(let i=1;i<=40;i++)lip.push(at(1-i/40,0,.01));tube(root,m.paint,lip,.018,false,110,'side_intake_contour');}
function mirrors(root,m,{x=1,y=.98,z=.2}={}){for(const side of [-1,1]){tube(root,m.carbon,[[side*(x-.25),y-.08,z-.1],[side*(x-.07),y,z-.02]],.014,false,14,'mirror_stalk');sphere(root,m.carbon,[.11,.045,.135],[side*x,y,z],24,'mirror_housing');roundedPanel(root,m.metal,.135,.055,[side*x,y,z-.109],{radius:.016,rotation:[0,PI,0],name:'mirror_face'});}}
function lowerAero(root,m,{front=2.45,rear=-2.5,width=2,length=4.9}={}){surface(root,m.carbon,50,10,(u,v)=>{const x=(u-.5)*width;return[x,.13+.025*v,front-v*.34-.09*(Math.abs(x)/(width/2))**2];},'front_splitter',true);for(const side of [-1,1]){box(root,m.carbon,[.10,.045,length*.64],[side*(width/2-.045),.17,-.14],undefined,'carbon_sill');}box(root,m.carbon,[width*.89,.03,.50],[0,.17,rear+.18],[.11,0,0],'diffuser');for(let i=0;i<9;i++)box(root,m.carbon,[.012,.16,.49],[(i-4)*width*.095,.20,rear+.18],[.11,0,0],'diffuser_vane');}
function pipe(root,m,pos,r=.055,length=.16,rotation=[PI/2,0,0]){cylinder(root,m.metal,r,length,pos,rotation,40,'exhaust_rim');const face=[...pos];face[2]-=.006;cylinder(root,m.carbon,r*.80,length+.018,face,rotation,40,'exhaust_bore');}
function tailBar(root,m,{z,y=.74,width=1.55}){roundedPanel(root,m.carbon,width,.12,[0,y,z],{radius:.04,rotation:[0,PI,0],name:'rear_lamp_panel'});for(const side of [-1,1])tube(root,m.rear,[[side*.12,y+.018,z-.019],[side*width*.36,y+.018,z-.019],[side*width*.47,y+.055,z-.01]],.011,false,40,'rear_light_strip');}
function doorGap(root,m,{x=.91,front=.58,rear=-1.03,y=.80}){for(const s of [-1,1]){tube(root,m.carbon,[[s*x,y,front],[s*(x+.015),.48,front-.17],[s*(x+.005),.26,rear+.16],[s*x,.61,rear],[s*x,y,rear]],.005,false,65,'door_seam');box(root,m.darkMetal,[.015,.02,.11],[s*(x+.01),y-.065,rear+.17],undefined,'flush_handle');}}
function hoodSeam(root,m,points){for(const s of [-1,1])tube(root,m.carbon,points.map(([x,y,z])=>[s*x,y,z]),.0048,false,55,'bonnet_gap');}
function badge(root,m,pos){shape(root,m.metal,[[-.032,.03],[.032,.03],[.025,-.024],[0,-.043],[-.025,-.024]],{position:pos,rotation:[-PI/2,0,0],depth:.004,bevel:.001,name:'nose_badge'});}
function jesko(){
 const id='jesko-absolut',root=createModel(id,{provenance,reference:'User image(7).png: silver Koenigsegg Jesko Absolut, elongated tail with twin vertical fins.'}),m=materials(0xc9d0d6);
 const lime=mat('accent_lime',0xb2d532,.38,.28),rig=wheelRig(root,m,{wheelbase:2.75,track:1.72,radius:.365,width:.32,zOffset:.08,spokes:7});
 const body=bodyLoft(root,m.paint,[{z:-2.62,w:.77,c:.64,s:.72,b:.20},{z:-2.35,w:.94,c:.74,s:.83,b:.18},{z:-1.295,w:1.01,c:.83,s:.90,b:.17},{z:-.61,w:.93,c:.79,s:.82,b:.17},{z:.30,w:.91,c:.77,s:.81,b:.17},{z:1.455,w:1.00,c:.68,s:.85,b:.17},{z:1.97,w:.93,c:.57,s:.73,b:.18},{z:2.35,w:.82,c:.46,s:.60,b:.19},{z:2.46,w:.72,c:.42,s:.51,b:.20}],{wheelArches:[{z:1.455,y:.365,r:.412},{z:-1.295,y:.365,r:.412}],wellMaterial:m.carbon,underMaterial:m.carbon,segments:140,crossSegments:36,edgeDrop:.065,sideInset:.075,smoothSeams:true,nose:{from:1.78,round:.29,bottomInset:.06,topInset:.025,openings:[{x:-.53,y:.30,rx:.21,ry:.092,type:'ellipse'},{x:.53,y:.30,rx:.21,ry:.092,type:'ellipse'},{x:0,y:.275,rx:.17,ry:.063,type:'ellipse'}]}});
 cabin(root,m,{front:.71,rear:-1.34,width:.69,base:.80,roof:1.21,roofFront:.04,roofRear:-.78,windowBottom:.79,pillars:false});
 for(const s of [-1,1]){
  tube(root,m.paint,[[s*.70,.80,.72],[s*.605,1.166,.06],[s*.60,1.168,-.77],[s*.69,.81,-1.35]],.022,false,80,'canopy_edge');
  tube(root,m.carbon,[[s*.734,.79,.66],[s*.73,.79,-1.28]],.011,false,36,'window_belt');
  // Thin LED crescents follow the sloping front clamshell.
  sweptLamp(root,m,body,s,{from:1.78,end:2.46,round:.29,bottomInset:.06,topInset:.025},{z:2.28,length:.67,x:.62,dx:.20,width:.115});
  recessedIntake(root,m,body,{x:s*.53,y:.30,rx:.21,ry:.092});
  sideVent(root,m,body,s,{z0:-1.02,z1:-.10,y0:.79,y1:.56,bottom:.29,inset:.075});
  tube(root,lime,[[s*.95,.217,-1.78],[s*.984,.208,-.56],[s*.935,.211,.85]],.012,false,60,'sill_accent');
  // Absolut's two tail stabilisers deliberately replace the Attack rear wing.
  shape(root,m.aeroPaint,[[1.63,.76],[2.12,1.11],[2.51,1.05],[2.60,.64],[2.08,.72]],{position:[s*.72,0,0],rotation:[0,PI/2,0],depth:.025,bevel:.008,name:'absolut_vertical_tail_fin'});
  bonnetVent(root,m,[s*.79,.871,1.41],.16,.34);
 }
 lowerAero(root,m,{front:2.55,rear:-2.65,width:2.06,length:5.15});
 tube(root,lime,[[-.62,.15,2.48],[-.25,.148,2.52],[0,.155,2.53],[.25,.148,2.52],[.62,.15,2.48]],.012,false,70,'splitter_accent');
 recessedIntake(root,m,body,{x:0,y:.275,rx:.17,ry:.063});tailBar(root,m,{z:-2.64,y:.68,width:1.50});
 grille(root,m,1.33,.20,[0,.46,-2.641],[0,PI,0],25);
 shape(root,m.darkMetal,[[-.14,-.065],[.14,-.065],[.09,.07],[-.09,.07]],{position:[0,.39,-2.68],rotation:[0,PI,0],depth:.09,bevel:.008,name:'centre_exhaust'});
 shape(root,m.carbon,[[-.108,-.043],[.108,-.043],[.068,.048],[-.068,.048]],{position:[0,.39,-2.782],rotation:[0,PI,0],depth:.006,bevel:.002,name:'exhaust_opening'});
 bonnetVent(root,m,[0,.858,-1.62],.57,.44);mirrors(root,m,{x:1.04,y:.96,z:.22});doorGap(root,m,{x:.926,front:.62,rear:-.89,y:.79});
 hoodSeam(root,m,[[.43,.474,2.32],[.55,.67,1.70],[.65,.79,.73]]);badge(root,m,[0,.489,2.18]);
 tube(root,lime,[[-.57,.816,.73],[0,.822,.78],[.57,.816,.73]],.010,false,45,'windscreen_accent');
 return{root,rig,effects:{headlightPositions:[loftTop(body,-.73,1.98,{from:1.78,end:2.46,round:.29,bottomInset:.06,topInset:.025},.025),loftTop(body,.73,1.98,{from:1.78,end:2.46,round:.29,bottomInset:.06,topInset:.025},.025)],exhaustPositions:[[0,.39,-2.78]]}};
}
function venom(){
 const id='venom-f5',root=createModel(id,{provenance,reference:'User image(8).png: silver Hennessey Venom F5 with rear wing.'}),m=materials(0xaeb7c1),rig=wheelRig(root,m,{wheelbase:2.78,track:1.73,radius:.365,width:.325,zOffset:.015,spokes:10});
 const body=bodyLoft(root,m.paint,[{z:-2.41,w:.80,c:.71,s:.76,b:.18},{z:-2.12,w:.97,c:.81,s:.86,b:.17},{z:-1.375,w:1.01,c:.87,s:.92,b:.16},{z:-.68,w:.91,c:.84,s:.85,b:.16},{z:.30,w:.88,c:.79,s:.84,b:.16},{z:1.405,w:.98,c:.69,s:.85,b:.16},{z:1.94,w:.93,c:.55,s:.74,b:.18},{z:2.31,w:.81,c:.43,s:.61,b:.19},{z:2.43,w:.70,c:.38,s:.49,b:.19}],{wheelArches:[{z:1.405,y:.365,r:.410},{z:-1.375,y:.365,r:.412}],wellMaterial:m.carbon,underMaterial:m.carbon,segments:136,crossSegments:36,edgeDrop:.065,sideInset:.08,smoothSeams:true,nose:{from:1.80,round:.28,bottomInset:.055,topInset:.028,openings:[{x:-.45,y:.29,rx:.27,ry:.083,type:'ellipse'},{x:.45,y:.29,rx:.27,ry:.083,type:'ellipse'}]}});
 cabin(root,m,{front:.65,rear:-1.34,width:.64,base:.83,roof:1.22,roofFront:-.06,roofRear:-.71,windowBottom:.83});
 for(const s of [-1,1]){
  sweptLamp(root,m,body,s,{from:1.80,end:2.43,round:.28,bottomInset:.055,topInset:.028},{z:2.20,length:.58,x:.65,dx:.17,width:.12});
  recessedIntake(root,m,body,{x:s*.45,y:.29,rx:.27,ry:.083});
  tube(root,m.darkMetal,[[s*.22,.175,body.frontZ(s*.22,.175)+.008],[s*.25,.38,body.frontZ(s*.25,.38)+.008]],.015,false,18,'front_air_divider');
  // The large side aperture is framed by a distinct C-shaped painted shoulder.
  sideVent(root,m,body,s,{z0:-1.06,z1:-.08,y0:.82,y1:.58,bottom:.29,inset:.08});
  bonnetVent(root,m,[s*.79,.876,1.40],.14,.35);
  tube(root,m.carbon,[[s*.31,.86,-1.25],[s*.34,.90,-1.70],[s*.38,.84,-2.05]],.006,false,35,'rear_deck_gap');
  bonnetVent(root,m,[s*.56,.86,-1.68],.22,.43);
 }
 lowerAero(root,m,{front:2.54,rear:-2.46,width:2.04,length:4.94});
 wing(root,m,{width:1.92,z:-2.17,y:1.23,chord:.26,postHeight:.40,postSpacing:1.25,endplateHeight:.12,paint:true});
 mirrors(root,m,{x:1.04,y:.98,z:.19});doorGap(root,m,{x:.91,front:.57,rear:-.82,y:.81});
 hoodSeam(root,m,[[.39,.456,2.25],[.51,.625,1.75],[.60,.802,.66]]);badge(root,m,[0,.454,2.20]);
 tailBar(root,m,{z:-2.43,y:.748,width:1.54});grille(root,m,1.50,.24,[0,.52,-2.44],[0,PI,0],27);
 for(const x of [-.12,.12])for(const y of [.47,.60])pipe(root,m,[x,y,-2.51],.052,.13);
 // Fine clamshell ribs and carbon centre channel are geometry, not baked decals.
 tube(root,m.darkMetal,[[-.035,.451,2.28],[-.035,.685,1.31],[-.035,.807,.69]],.005,false,45,'hood_centre_left');
 tube(root,m.darkMetal,[[.035,.451,2.28],[.035,.685,1.31],[.035,.807,.69]],.005,false,45,'hood_centre_right');
 return{root,rig,effects:{headlightPositions:[loftTop(body,-.74,1.96,{from:1.80,end:2.43,round:.28,bottomInset:.055,topInset:.028},.025),loftTop(body,.74,1.96,{from:1.80,end:2.43,round:.28,bottomInset:.055,topInset:.028},.025)],exhaustPositions:[[-.12,.53,-2.59],[.12,.53,-2.59]]}};
}
function batmobile(){
 const id='batmobile-1989',root=createModel(id,{provenance,reference:'User image(6).png: 1989 Batman / Burton Batmobile with front turbine and swept rear batfins; not the Tumbler.'}),m=materials(0x151a21);
 m.paint.roughness=.19;m.paint.metalness=.56;m.rim.color.setHex(0x29313a);m.carbon.color.setHex(0x080b10);
 const rig=wheelRig(root,m,{wheelbase:3.55,track:1.81,radius:.39,width:.365,zOffset:-.10,spokes:12});
 bodyLoft(root,m.paint,[{z:-3.02,w:.78,c:.60,s:.61,b:.19},{z:-2.72,w:.99,c:.73,s:.81,b:.17},{z:-1.875,w:1.08,c:.86,s:.97,b:.17},{z:-1.18,w:1.00,c:.86,s:.94,b:.17},{z:-.48,w:.94,c:.83,s:.86,b:.17},{z:.45,w:.98,c:.79,s:.88,b:.17},{z:1.675,w:1.08,c:.73,s:.98,b:.17},{z:2.47,w:1.02,c:.64,s:.87,b:.18},{z:2.91,w:.84,c:.58,s:.70,b:.19},{z:3.11,w:.63,c:.57,s:.62,b:.23}],{wheelArches:[{z:1.675,y:.39,r:.438},{z:-1.875,y:.39,r:.438}],wellMaterial:m.carbon,underMaterial:m.carbon,segments:170,crossSegments:40,edgeDrop:.065,sideInset:.085,smoothSeams:true,nose:{from:2.23,round:.34,bottomInset:.05,topInset:.02}});
 // Long, rounded hood and sweeping fender spines.
 surface(root,m.paint,86,24,(u,v)=>{const z=lerp(-.05,2.85,u),q=2*v-1;return[q*lerp(.48,.39,u),.83-.18*u+.125*(1-q*q)*Math.sin((u*.75+.1)*PI),z];},'central_hood_cowl');
 for(const s of [-1,1]){
  tube(root,m.aeroPaint,[[s*.81,.69,2.93],[s*.91,.90,2.40],[s*.99,.99,1.65],[s*.93,.92,.66],[s*.86,.87,.05]],.027,false,100,'front_fender_spine');
  tube(root,m.carbon,[[s*.56,.75,2.66],[s*.62,.85,1.9],[s*.60,.89,.63],[s*.58,.88,.04]],.007,false,80,'hood_panel_gap');
  // Rear batfins form the iconic silhouette, thick enough for both sides to render.
  const finProfile=[{z:-2.98,t:.60,b:.57},{z:-2.65,t:1.25,b:.67},{z:-2.45,t:1.52,b:.75},{z:-2.18,t:1.60,b:.78},{z:-1.96,t:1.51,b:.81},{z:-1.62,t:1.20,b:.86},{z:-1.15,t:.89,b:.86}];
  const finPoint=(u,v,skin)=>{const z=lerp(-2.98,-1.15,u),bottom=K.interp(finProfile,z,'b'),top=K.interp(finProfile,z,'t');return[s*(.91+.10*Math.sin(u*PI)-.075*v*v)+skin*(.014+.026*(1-v)),lerp(bottom,top,v),z-.09*Math.sin(u*PI)*v*v];};
  for(const skin of [-1,1])surface(root,m.aeroPaint,80,18,(u,v)=>finPoint(u,v,skin),'curved_bat_fin',skin>0);
  surface(root,m.aeroPaint,80,3,(u,v)=>{const a=finPoint(u,1,-1),b=finPoint(u,1,1);return a.map((n,i)=>lerp(n,b[i],v));},'bat_fin_rounded_top');
  // Curved side exhausts and narrow cooling slits behind the front wheel.
  for(let k=0;k<3;k++)tube(root,m.darkMetal,[[s*.96,.31+k*.095,-.88],[s*1.02,.35+k*.095,-.48],[s*1.026,.36+k*.095,.15],[s*.985,.39+k*.095,.52]],.037,false,45,'side_exhaust_tube');
  for(let k=0;k<5;k++)box(root,m.carbon,[.025,.18,.045],[s*.989,.64,.88-k*.115],[.17,0,0],'engine_side_gill');
  oval(root,m.carbon,.35,.11,[s*.80,.60,2.90],.015,'bat_headlamp_housing');
  tube(root,m.front,[[s*.66,.609,2.920],[s*.78,.615,2.927],[s*.91,.599,2.896]],.013,false,32,'concealed_headlamp');
  tube(root,m.rear,[[s*.54,.585,-3.055],[s*.75,.604,-3.01],[s*.87,.631,-2.90]],.018,false,30,'bat_tail_light');
 }
 // Compact teardrop canopy pushed far behind the very long nose.
 const canopyPoint=(u,v)=>{const q=2*v-1,bulge=Math.pow(Math.sin(u*PI),.86),w=.59*(.65+.35*Math.sin(u*PI));return[q*w,.87+.47*bulge*Math.sqrt(Math.max(0,1-.74*q*q)),lerp(-1.74,-.01,u)];};
 surface(root,m.glass,90,40,canopyPoint,'rounded_bat_canopy');
 for(const side of [-1,1]){surface(root,m.glass,90,10,(u,v)=>{const a=canopyPoint(u,side>0?1:0);return[a[0],lerp(a[1],.864,v),a[2]];},'canopy_side_glass',side<0);const pts=[];for(let i=0;i<=60;i++){const a=canopyPoint(i/60,side>0?.975:.025);a[1]+=.008;pts.push(a);}tube(root,m.paint,pts,.020,false,80,'curved_canopy_rail');}
 surface(root,m.paint,32,12,(u,v)=>{const a=canopyPoint(lerp(.34,.57,u),lerp(.35,.65,v));a[1]+=.009;return a;},'canopy_centre_roof');
 const windscreenRib=[];for(let i=0;i<=28;i++){const a=canopyPoint(lerp(.58,.99,i/28),.5);a[1]+=.007;windscreenRib.push(a);}tube(root,m.carbon,windscreenRib,.012,false,40,'windscreen_centre');
 for(const [label,wheel]of Object.entries(rig.wheels)){const side=label[1]==='L'?1:-1,ax=side*.175;cylinder(wheel,m.darkMetal,.253,.017,[ax,0,0],[0,0,PI/2],64,'bat_wheel_cover');ring(wheel,m.rim,.244,.010,[ax+side*.014,0,0],[0,PI/2,0],'bat_wheel_rim');for(let i=0;i<14;i++){const a=i*2*PI/14;tube(wheel,m.rim,[[ax+side*.024,.075*Math.cos(a),.075*Math.sin(a)],[ax+side*.025,.18*Math.cos(a+.16),.18*Math.sin(a+.16)],[ax+side*.022,.235*Math.cos(a+.21),.235*Math.sin(a+.21)]],.006,false,12,'bat_turbine_spoke');}}
 // Circular turbine nose: barrel, lip, intake blades and pointed central spinner.
 cylinder(root,m.darkMetal,.365,.36,[0,.565,3.08],[PI/2,0,0],72,'turbine_barrel');
 cylinder(root,m.carbon,.325,.015,[0,.565,3.272],[PI/2,0,0],72,'turbine_dark_intake');
 ring(root,m.metal,.348,.019,[0,.565,3.275],undefined,'turbine_lip');
 ring(root,m.darkMetal,.275,.012,[0,.565,3.284],undefined,'inner_turbine_ring');
 for(let i=0;i<18;i++){const a=i*2*PI/18,pts=[[.102*Math.cos(a),.102*Math.sin(a)],[.294*Math.cos(a+.12),.294*Math.sin(a+.12)],[.294*Math.cos(a+.20),.294*Math.sin(a+.20)],[.12*Math.cos(a+.24),.12*Math.sin(a+.24)]];shape(root,m.darkMetal,pts,{position:[0,.565,3.284],depth:.018,bevel:.001,name:'turbine_blade'});}
 sphere(root,m.metal,[.095,.095,.145],[0,.565,3.338],32,'turbine_spinner');
 lowerAero(root,m,{front:3.17,rear:-3.08,width:2.14,length:6.25});
 grille(root,m,1.22,.18,[0,.35,-3.034],[0,PI,0],19);
 pipe(root,m,[0,.57,-3.13],.179,.25);ring(root,m.darkMetal,.15,.018,[0,.57,-3.27],undefined,'jet_nozzle');
 for(const s of [-1,1]){grille(root,m,.25,.27,[s*.56,.49,-3.027],[0,PI,0],5);tube(root,m.carbon,[[s*.66,.86,-.13],[s*.82,.85,-.43],[s*.86,.43,-1.17]],.007,false,48,'canopy_door_gap');}
 return{root,rig,effects:{headlightPositions:[[-.79,.61,2.93],[.79,.61,2.93]],exhaustPositions:[[0,.57,-3.28]]}};
}
const builders={'batmobile-1989':batmobile,'jesko-absolut':jesko,'venom-f5':venom},only=process.argv.find(s=>s.startsWith('--id='))?.slice(5),reports=[];
for(const[id,build]of Object.entries(builders)){if(only&&id!==only)continue;const{root,rig,effects}=build();const dest=path.join(OUT,id,id+'.glb');const report=exportGLB(root,dest,{author:'UVelocity original mesh authoring',source:'scripts/build-hypercar-expansion.cjs',referenceBased:true,officialManufacturerAsset:false,wheelRadius:rig.radius,wheelWidth:rig.width,wheelCenters:rig.centers,...effects,up:'+Y',forward:'+Z',units:'metres',paintMaterials:['paint_body','paint_aero']});if(report.bounds.min[1]<-.002)throw new Error(id+': below ground');if(report.bytes>8*1024*1024)throw new Error(id+': model too large');if(process.argv.includes('--publish')){const target=path.join(__dirname,'../public/game/assets/cars',id+'.glb');fs.copyFileSync(dest,target);fs.writeFileSync(target.replace(/\.glb$/,'.metadata.json'),JSON.stringify({...report,file:'/game/assets/cars/'+id+'.glb'},null,2)+'\n');report.publishedFile=target;}reports.push(report);console.log(JSON.stringify({id,triangles:report.triangles,bytes:report.bytes,dimensions:report.dimensions,wheelRadius:rig.radius,...effects,published:!!report.publishedFile}));}
fs.mkdirSync(OUT,{recursive:true});fs.writeFileSync(path.join(OUT,'hypercar-build-manifest.json'),JSON.stringify(reports,null,2)+'\n');
