/* UVelocity service workshop. All geometry and material textures are authored
 * procedurally here; this is a real 3D room, not a background image. */
(function (global) {
  'use strict';
  function build({THREE,scene}) {
    const root=new THREE.Group();root.name='UVelocity Workshop';scene.add(root);
    const previousBackground=scene.background,workshopBackground=new THREE.Color(0x101b29);scene.background=workshopBackground;
    const textures=[],geometries=new Set(),materials=new Set(),occluders=[],qualityDetails=[];
    const stats={name:'UVelocity Performance Workshop',drawCalls:0,triangles:0,clearBay:{width:6.2,length:8.2},features:['textured concrete','industrial envelope','service door','tool cabinets','tyre rack','vehicle lift','floor jack','work lights','daylight windows','blue gray workshop','cyan light strips','concentric display rings','articulated service arms']};
    let seed=74031,disposed=false;
    const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    const makeMat=(name,parameters)=>{const m=new THREE.MeshStandardMaterial(parameters);m.name=name;materials.add(m);return m;};
    function canvasTex(width,height,draw,color=true){
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;draw(canvas.getContext('2d'),width,height);
      const t=new THREE.CanvasTexture(canvas);if(color)t.encoding=THREE.sRGBEncoding;t.anisotropy=8;textures.push(t);return t;
    }
    function concreteMaps(){
      const n=512,h=new Float32Array(n*n),stains=Array.from({length:27},()=>({x:rand()*n,y:rand()*n,r:22+rand()*98,a:(rand()-.5)*19}));
      for(let y=0;y<n;y++)for(let x=0;x<n;x++){
        let v=108+(rand()-.5)*15+Math.sin(x*.047)*2.4+Math.sin(y*.031+x*.013)*2.8;
        for(const s of stains){const dx=Math.min(Math.abs(x-s.x),n-Math.abs(x-s.x)),dy=Math.min(Math.abs(y-s.y),n-Math.abs(y-s.y));v+=s.a*Math.exp(-(dx*dx+dy*dy)/(s.r*s.r));}
        h[y*n+x]=v;
      }
      const map=canvasTex(n,n,(ctx)=>{
        const data=ctx.createImageData(n,n);for(let i=0;i<h.length;i++){const v=h[i];data.data[i*4]=v*.97;data.data[i*4+1]=v;data.data[i*4+2]=v*.96;data.data[i*4+3]=255;}ctx.putImageData(data,0,0);
        ctx.strokeStyle='rgba(38,43,40,.28)';ctx.lineWidth=.6;
        for(let k=0;k<8;k++){let x=rand()*n,y=rand()*n;ctx.beginPath();ctx.moveTo(x,y);for(let j=0;j<7;j++){x+=rand()*14-4;y+=rand()*12-4;ctx.lineTo(x,y);}ctx.stroke();}
      });
      const rough=canvasTex(n,n,ctx=>{const d=ctx.createImageData(n,n);for(let i=0;i<h.length;i++){const v=205+(h[i]-108)*.8;d.data[i*4]=d.data[i*4+1]=d.data[i*4+2]=v;d.data[i*4+3]=255;}ctx.putImageData(d,0,0);},false);
      const normal=canvasTex(n,n,ctx=>{const d=ctx.createImageData(n,n);for(let y=0;y<n;y++)for(let x=0;x<n;x++){const i=y*n+x,dx=h[y*n+(x+1)%n]-h[y*n+(x+n-1)%n],dy=h[((y+1)%n)*n+x]-h[((y+n-1)%n)*n+x];d.data[i*4]=128-dx*.8;d.data[i*4+1]=128-dy*.8;d.data[i*4+2]=254;d.data[i*4+3]=255;}ctx.putImageData(d,0,0);},false);
      for(const t of[map,rough,normal]){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(12,12);}return {map,rough,normal};
    }
    const maps=concreteMaps();
    const concrete=makeMat('Workshop concrete',{color:0x7893aa,map:maps.map,roughnessMap:maps.rough,normalMap:maps.normal,normalScale:new THREE.Vector2(.18,.18),roughness:.82,metalness:.06,envMapIntensity:.25});
    const wallTexture=canvasTex(256,256,(c,n)=>{c.fillStyle='#647d90';c.fillRect(0,0,n,n);for(let i=0;i<9000;i++){c.fillStyle=rand()>.5?'rgba(224,244,255,.045)':'rgba(10,18,29,.045)';c.fillRect(rand()*n,rand()*n,1+rand()*2,1+rand()*3);}});wallTexture.wrapS=wallTexture.wrapT=THREE.RepeatWrapping;wallTexture.repeat.set(4,2);
    const wall=makeMat('Painted masonry',{color:0x7b91a4,map:wallTexture,roughness:.85,metalness:.06,envMapIntensity:.18});
    const dark=makeMat('Charcoal powder coated steel',{color:0x172330,roughness:.54,metalness:.55});
    const green=makeMat('Workshop blue gray enamel',{color:0x2a526a,roughness:.4,metalness:.52});
    const greenDark=makeMat('Workshop deep blue panels',{color:0x1b3447,roughness:.64,metalness:.3});
    const gold=makeMat('Brushed warm brass',{color:0xb39453,roughness:.42,metalness:.72});
    const steel=makeMat('Brushed steel',{color:0x92a8b8,roughness:.39,metalness:.85});
    const rubber=makeMat('Workshop rubber',{color:0x141b22,roughness:.94,metalness:0,envMapIntensity:.14});
    const pale=makeMat('Cool painted metal',{color:0x9bacba,roughness:.48,metalness:.45});
    const red=makeMat('Safety equipment enamel',{color:0x8b332b,roughness:.48,metalness:.45});
    const wood=makeMat('Oiled workbench top',{color:0x8c7553,roughness:.78,metalness:0});
    const glass=makeMat('Frosted daylight glazing',{color:0xb8d9ee,roughness:.26,metalness:.12,emissive:0x6188a1,emissiveIntensity:.31,envMapIntensity:.6});
    const light=new THREE.MeshBasicMaterial({name:'Cool practical diffuser',color:new THREE.Color(0xe2f5ff).multiplyScalar(2.1),toneMapped:false});light.userData.workshopGlow=true;materials.add(light);
    const cyan=new THREE.MeshBasicMaterial({name:'Cyan workshop light core',color:new THREE.Color(0x43dfff).multiplyScalar(1.7),toneMapped:false});cyan.userData.workshopGlow=true;materials.add(cyan);
    const cyanHalo=new THREE.MeshBasicMaterial({name:'Cyan floor light spill',color:0x39cdea,transparent:true,opacity:.16,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,side:THREE.DoubleSide});cyanHalo.userData.workshopGlow=true;materials.add(cyanHalo);
    const whiteLine=makeMat('Floor bay marking',{color:0xa8bac6,roughness:.92,metalness:0,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});

    // Static equipment is merged by material inside each movable visibility group.
    class Batch {
      constructor(parent,name){this.group=new THREE.Group();this.group.name=name;parent.add(this.group);this.parts=new Map();}
      add(g,m,x=0,y=0,z=0,rx=0,ry=0,rz=0){const matrix=new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromEuler(new THREE.Euler(rx,ry,rz)),new THREE.Vector3(1,1,1));g.applyMatrix4(matrix);if(!this.parts.has(m))this.parts.set(m,[]);this.parts.get(m).push(g);}
      box(m,x,y,z,w,h,d,ry=0){this.add(new THREE.BoxGeometry(w,h,d),m,x,y,z,0,ry,0);}
      cylinder(m,x,y,z,r,length,rx=0,rz=0,segments=16){this.add(new THREE.CylinderGeometry(r,r,length,segments),m,x,y,z,rx,0,rz);}
      torus(m,x,y,z,r,tube,rx=0,ry=0,segments=24){this.add(new THREE.TorusGeometry(r,tube,6,segments),m,x,y,z,rx,ry,0);}
      bar(m,a,b,width,depth=width){const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),g=new THREE.BoxGeometry(width,av.distanceTo(bv),depth),q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),bv.clone().sub(av).normalize());g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q));g.translate(...av.add(bv).multiplyScalar(.5).toArray());this.add(g,m);}
      finish(){
        for(const [mat,parts]of this.parts){const p=[],n=[],uv=[];
          for(const source of parts){const g=source.index?source.toNonIndexed():source,a=g.attributes.position,b=g.attributes.normal,t=g.attributes.uv;for(let i=0;i<a.count;i++){p.push(a.getX(i),a.getY(i),a.getZ(i));n.push(b?b.getX(i):0,b?b.getY(i):1,b?b.getZ(i):0);uv.push(t?t.getX(i):0,t?t.getY(i):0);}if(g!==source)g.dispose();source.dispose();}
          const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(n,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeBoundingSphere();geometries.add(g);
          const mesh=new THREE.Mesh(g,mat);mesh.name=this.group.name+' / '+mat.name;mesh.castShadow=!mat.userData.workshopGlow;mesh.receiveShadow=!mat.userData.workshopGlow;this.group.add(mesh);stats.drawCalls++;stats.triangles+=p.length/9;
        }this.parts.clear();return this.group;
      }
    }
    function plane(parent,name,w,h,mat,x,y,z,rx=0,ry=0){const g=new THREE.PlaneGeometry(w,h),mesh=new THREE.Mesh(g,mat);mesh.name=name;mesh.position.set(x,y,z);mesh.rotation.set(rx,ry,0);mesh.receiveShadow=true;parent.add(mesh);geometries.add(g);stats.drawCalls++;stats.triangles+=2;return mesh;}
    function label(parent,text,sub,x,y,z,width,height,ry=0){
      const tex=canvasTex(1024,256,(c,w,h)=>{c.fillStyle='#132c3e';c.fillRect(0,0,w,h);c.fillStyle='#49daef';c.fillRect(0,h-7,w,7);c.fillStyle='#e7f8ff';c.font='700 108px Arial, sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(text,w/2,h*.40);c.fillStyle='#9fc5d6';c.font='400 28px Arial, sans-serif';c.fillText(sub,w/2,h*.79);});
      const m=makeMat(text+' sign',{map:tex,roughness:.54,metalness:.2,emissive:0x23506a,emissiveMap:tex,emissiveIntensity:.28});return plane(parent,text+' sign',width,height,m,x,y,z,0,ry);
    }
    function equipment(name,x,z,radius,buildFn){const batch=new Batch(root,name);buildFn(batch);const group=batch.finish();group.position.set(x,0,z);occluders.push({group,x,z,radius});return group;}

    plane(root,'Concrete workshop floor',64,64,concrete,0,-.02,0,-Math.PI/2);
    const floor=new Batch(root,'Concrete joints and service bay');
    for(let x=-16;x<=16;x+=4)floor.box(dark,x,-.016,0,.009,.002,28);
    for(let z=-12;z<=12;z+=4)floor.box(dark,0,-.016,z,32,.002,.009);
    for(const side of[-1,1]){
      floor.box(whiteLine,side*2.24,-.012,0,.075,.004,6.8);floor.box(whiteLine,side*1.75,-.012,-3.4,1,.004,.075);floor.box(whiteLine,side*1.75,-.012,3.4,1,.004,.075);
      floor.box(greenDark,side*2.58,-.011,-2.6,.35,.005,1.2);
    }
    floor.box(dark,-3.35,-.01,.6,.28,.008,4.8);for(let z=-1.75;z<3;z+=.085)floor.box(steel,-3.35,-.002,z,.26,.01,.018);
    floor.finish();

    // Floor-mounted light guides: actual geometry below the tyres, with no
    // floating overlay or obstruction inside the 6.2 × 8.2 metre working bay.
    const display=new Batch(root,'Cyan concentric vehicle display rings');
    for(const [radius,width,start,arc]of[[2.42,.035,0,Math.PI*2],[2.62,.022,.12,Math.PI*1.68],[2.83,.018,Math.PI*.42,Math.PI*1.58]]){
      const ring=new THREE.RingGeometry(radius-width,radius,128,1,start,arc);ring.scale(1,1.35,1);display.add(ring,cyan,0,.006,0,-Math.PI/2);
      const spill=new THREE.RingGeometry(radius-.09,radius+.07,128,1,start,arc);spill.scale(1,1.35,1);display.add(spill,cyanHalo,0,.004,0,-Math.PI/2);
    }
    for(const side of[-1,1]){
      display.box(cyan,side*2.99,.003,0,.018,.006,8.0);
      display.box(cyan,side*6.4,.003,1.7,.025,.006,17.0);
      display.box(cyan,side*5.8,.003,-4.85,5.5,.006,.025);
      display.box(cyanHalo,side*2.99,.002,0,.10,.003,8.0);
      for(let index=0;index<7;index++)display.box(cyan,side*2.69,.006,-3.3+index*.11,.28,.006,.027);
    }
    const displayGroup=display.finish();displayGroup.userData.displayRings=3;displayGroup.userData.floorMounted=true;

    const walls={};
    for(const side of['back','front','left','right']){
      const batch=new Batch(root,'Workshop '+side+' wall'),back=side==='back',front=side==='front',left=side==='left';
      const w=back||front?26:24,px=left?-13:side==='right'?13:0,pz=back?-10:front?14:2,ry=back?0:front?Math.PI:left?Math.PI/2:-Math.PI/2;
      // Walls are single sided towards the room. Cameras outside the open volume
      // cannot be blocked by the outside face while orbiting a narrow viewport.
      plane(batch.group,'Workshop interior masonry',w,6.7,wall,px,3.32,pz,0,ry);
      plane(batch.group,'Workshop lower wall protection',w,1.1,greenDark,px+(left?.018:side==='right'?-.018:0),.54,pz+(back?.018:front?-.018:0),0,ry);
      if(back||front){for(let x=-12;x<=12;x+=4){batch.box(dark,x,3.3,pz+(back?.09:-.09),.16,6.6,.18);batch.box(steel,x,.05,pz+(back?.11:-.11),.33,.09,.32);}batch.box(gold,0,1.12,pz+(back?.035:-.035),26,.035,.025);}
      else{for(let z=-10;z<=14;z+=4){batch.box(dark,px+(left?.09:-.09),3.3,z,.18,6.6,.16);batch.box(steel,px+(left?.11:-.11),.05,z,.32,.09,.33);}batch.box(gold,px+(left?.035:-.035),1.12,2,.025,.035,24);}
      if(back||front){
        const face=pz+(back?.22:-.22);
        for(const edge of[-1,1]){batch.box(cyan,edge*8.15,1.58,face,8.7,.028,.018);batch.bar(cyan,[edge*11.5,1.6,face],[edge*8.8,4.8,face],.024,.018);batch.bar(cyan,[edge*8.8,1.6,face],[edge*11.5,4.8,face],.024,.018);}
      }else{
        const face=px+(left?.22:-.22);batch.box(cyan,face,1.58,2,.018,.028,24);
        for(const z of[-7,1,9])batch.bar(cyan,[face,1.62,z-1.35],[face,4.7,z+1.35],.024,.018);
      }
      walls[side]=batch.finish();
    }
    const rear=new Batch(walls.back,'Roller service door');
    rear.box(dark,0,2.2,-9.81,6.7,4.4,.14);
    for(let y=.13;y<4.35;y+=.18){rear.box(pale,0,y,-9.70,6.3,.145,.07);rear.box(steel,0,y+.065,-9.65,6.3,.015,.025);}
    for(const x of[-3.3,3.3])rear.box(steel,x,2.25,-9.60,.12,4.5,.2);
    rear.cylinder(steel,0,4.53,-9.6,.17,6.65,0,Math.PI/2);rear.box(dark,3.62,1.25,-9.66,.2,.45,.16);rear.box(green,3.62,1.32,-9.56,.08,.08,.025);rear.box(red,3.62,1.16,-9.56,.08,.08,.025);rear.finish();
    label(walls.back,'UVelocity','PERFORMANCE WORKSHOP',-6.7,2.65,-8.65,3.4,.85);
    label(walls.right,'SERVICE BAY 01','PRECISION • CARE • PERFORMANCE',12.78,3.2,1.4,4.1,1.02,-Math.PI/2);

    const windows=new Batch(walls.left,'Steel framed daylight windows');
    for(const zc of[-4.3,4.5]){
      windows.box(dark,-12.84,4.12,zc,.15,2.55,5.45);
      for(let col=0;col<4;col++)for(let row=0;row<2;row++)windows.box(glass,-12.73,3.52+row*1.18,zc-1.98+col*1.32,.025,1.08,1.2);
      for(let i=0;i<5;i++)windows.box(steel,-12.67,4.12,zc-2.65+i*1.325,.08,2.6,.055);
      windows.box(steel,-12.67,4.12,zc,.08,.06,5.4);
      windows.box(pale,-12.56,2.79,zc,.35,.12,5.6);
    }windows.finish();

    const roof=new Batch(root,'Steel roof trusses and practical lighting');
    for(const z of[-7,-1,5,11]){
      roof.box(dark,0,6.35,z,26,.19,.14);roof.box(dark,0,5.95,z,26,.10,.10);
      for(let x=-12;x<12;x+=2)roof.bar(steel,[x,5.97,z],[x+1,6.34,z],.045);
    }
    for(const x of[-10,-5,0,5,10])roof.box(dark,x,6.5,2,.09,.12,24);
    for(const x of[-3.3,3.3])for(const z of[-2.4,2.4]){
      roof.box(dark,x,5.5,z,2.65,.12,.46);roof.box(light,x,5.427,z,2.5,.016,.34);
      for(const dx of[-1,1])roof.bar(steel,[x+dx,5.57,z],[x+dx,6.34,z],.018);
    }
    const roofGroup=roof.finish();plane(roofGroup,'Workshop acoustic ceiling',26,24,makeMat('Ceiling panels',{color:0x293a4b,roughness:1}),0,6.65,2,Math.PI/2);

    equipment('Fitted workbench and tool cabinet',-6.7,-8.8,2.8,b=>{
      b.box(green,0,.46,0,4.6,.88,.82);b.box(dark,0,.06,.01,4.7,.10,.86);b.box(wood,0,.95,.02,4.85,.09,.96);
      for(let col=0;col<5;col++)for(let row=0;row<4;row++){const x=-1.84+col*.92,y=.18+row*.18;b.box(greenDark,x,y,.425,.86,.151,.045);b.box(steel,x,y+.045,.459,.64,.018,.025);}
      const peg=canvasTex(256,256,(c,n)=>{c.fillStyle='#344b5c';c.fillRect(0,0,n,n);c.fillStyle='#0d1722';for(let y=8;y<n;y+=16)for(let x=8;x<n;x+=16){c.beginPath();c.arc(x,y,1.5,0,Math.PI*2);c.fill();}});
      const pegmat=makeMat('Perforated tool board',{map:peg,color:0xa2b7c6,roughness:.7,metalness:.45});b.box(pegmat,0,2.0,-.16,4.6,1.5,.07);
      b.box(greenDark,0,2.65,.12,3.46,.91,.04);
      b.box(cyan,0,3.115,.16,3.5,.022,.016);b.box(cyan,0,2.185,.16,3.5,.022,.016);
      for(const x of[-1.75,1.75])b.box(cyan,x,2.65,.16,.022,.95,.016);
      for(let i=0;i<12;i++){
        const x=-2.05+i*.37,y=1.6+(i%3)*.14;b.box(steel,x,y,-.09,.025,.39,.025);b.torus(steel,x,y+.22,-.07,.047,.012,0,0,12);b.box(i%3?rubber:gold,x,y-.24,-.07,.055,.15,.035);
      }
      b.box(steel,1.65,1.16,.03,.48,.31,.32);b.box(dark,1.65,1.34,.03,.68,.08,.33);b.bar(steel,[1.7,1.2,.3],[2.15,1.2,.3],.035);
      for(let i=0;i<5;i++){b.cylinder(i%2?green:pale,-1.6+i*.21,1.12,.05,.063,.25,0,0,12);b.cylinder(dark,-1.6+i*.21,1.27,.05,.038,.06,0,0,10);}
    });
    equipment('Tyre storage rack',7.7,-8.75,2.15,b=>{
      for(const x of[-1.7,1.7])for(const z of[-.37,.37])b.box(dark,x,1.67,z,.08,3.34,.08);
      for(const y of[.48,1.65,2.83]){b.box(steel,0,y,.37,3.5,.09,.08);b.box(steel,0,y,-.37,3.5,.09,.08);}
      for(let row=0;row<2;row++)for(let i=0;i<4;i++){
        const x=-1.26+i*.84,y=.92+row*1.18;b.torus(rubber,x,y,0,.30,.105,0,0,32);
        b.torus(dark,x,y,.10,.265,.018,0,0,32);b.torus(dark,x,y,-.10,.265,.018,0,0,32);
        for(let k=0;k<20;k++){const a=k*Math.PI/10;b.box(dark,x+Math.cos(a)*.396,y+Math.sin(a)*.396,0,.035,.018,.16,-a);}
      }
    });
    equipment('Mobile tool chest',4.6,-3.9,1.1,b=>{
      b.box(green,0,.55,0,1.3,.78,.66);b.box(dark,0,.98,0,1.38,.08,.74);
      for(let i=0;i<5;i++){b.box(greenDark,0,.25+i*.14,.345,1.19,.117,.025);b.box(steel,0,.27+i*.14,.37,.92,.016,.025);}
      for(const x of[-.49,.49])for(const z of[-.23,.23]){b.cylinder(rubber,x,.105,z,.09,.065,0,Math.PI/2,16);b.box(steel,x,.19,z,.08,.16,.08);}
      b.bar(steel,[.75,.82,-.24],[.75,.82,.24],.03);b.bar(steel,[.66,.82,-.24],[.75,.82,-.24],.03);b.bar(steel,[.66,.82,.24],[.75,.82,.24],.03);
    });
    equipment('Two post service lift',-8.6,.4,2.5,b=>{
      for(const z of[-2.0,2.0]){
        b.box(dark,0,.05,z,1.0,.10,.72);b.box(green,0,1.72,z,.38,3.35,.43);b.box(steel,.22,1.6,z,.06,2.9,.22);b.box(gold,.25,.9,z,.05,.35,.34);
        b.bar(dark,[.2,.15,z],[1.2,.15,z+(z<0?.7:-.7)],.15,.12);b.bar(dark,[1.2,.15,z+(z<0?.7:-.7)],[1.85,.15,z+(z<0?1.1:-1.1)],.11,.1);b.cylinder(rubber,1.85,.23,z+(z<0?1.1:-1.1),.11,.055);
      }
      b.box(dark,0,3.48,0,.42,.17,4.45);b.box(green,-.30,1.2,2,.25,.55,.27);
    });
    equipment('Hydraulic floor jack',-4.1,3.3,.85,b=>{
      b.box(gold,0,.15,0,.43,.20,1.1);b.box(dark,0,.26,-.14,.27,.08,.60);b.cylinder(rubber,0,.34,-.38,.13,.07);
      for(const x of[-.26,.26])for(const z of[-.36,.38])b.cylinder(dark,x,.09,z,.08,.055,0,Math.PI/2,14);
      b.bar(steel,[0,.25,.43],[0,1.18,1.02],.035);b.bar(rubber,[0,1.0,.91],[0,1.29,1.08],.052);
    });
    equipment('Workshop air compressor',9.0,6.0,1.3,b=>{
      b.cylinder(green,0,.49,0,.33,1.24,0,Math.PI/2,24);
      for(const x of[-.63,.63]){const cap=new THREE.SphereGeometry(.33,16,10);cap.scale(.3,1,1);b.add(cap,green,x,.49,0);}
      b.box(dark,-.22,.94,0,.55,.34,.37);b.box(steel,.3,.98,0,.24,.4,.32);for(let i=0;i<5;i++)b.box(dark,.3,.83+i*.065,0,.29,.02,.35);
      for(const x of[-.47,.47])for(const z of[-.26,.26])b.cylinder(rubber,x,.13,z,.115,.07,0,Math.PI/2,16);
      b.torus(rubber,.15,.5,.37,.28,.023,0,0,32);b.torus(rubber,.12,.5,.40,.25,.022,0,0,32);
      b.cylinder(steel,.5,1.15,.20,.08,.04,Math.PI/2,0,16);b.box(pale,.5,1.15,.225,.12,.12,.008);b.box(dark,.5,1.17,.233,.008,.045,.005);
    });
    equipment('Safety locker and consumables',-10.5,7.4,1.45,b=>{
      for(let col=0;col<3;col++){
        const x=-.7+col*.7;b.box(greenDark,x,1.12,0,.66,2.15,.58);b.box(green,x,1.13,.305,.61,2.06,.025);b.box(steel,x+.21,1.12,.337,.035,.22,.025);
        for(let i=0;i<4;i++)b.box(dark,x,1.85+i*.045,.324,.37,.014,.006);
      }
      b.cylinder(red,1.4,.58,0,.13,.78,0,0,20);b.cylinder(dark,1.4,1.02,0,.045,.12);b.box(steel,1.4,1.08,.02,.17,.025,.06);
    });
    const detail=equipment('Workshop service clutter',6.7,7.4,1.6,b=>{
      for(let i=0;i<3;i++){b.box(wood,-.6+i*.65,.27,0,.53,.52,.5);b.box(dark,-.6+i*.65,.275,.258,.32,.02,.006);}
      b.box(dark,.3,.58,-.6,1.8,.1,.75);for(const x of[-.4,1])for(const z of[-.85,-.35])b.box(steel,x,.3,z,.055,.6,.055);
      for(let i=0;i<6;i++){b.cylinder(i%2?red:pale,-.4+i*.24,.8,-.6,.075,.32,0,0,12);b.cylinder(dark,-.4+i*.24,.98,-.6,.041,.055,0,0,10);}
    });qualityDetails.push(detail);

    // Two parked articulated service arms flank the display. All links, joints
    // and gripper tips remain outside x ±3.1 m so every existing vehicle fits.
    for(const side of[-1,1]){
      const arm=equipment(side<0?'Left articulated service arm':'Right articulated service arm',side*4.1,-1.65,1.05,b=>{
        b.box(dark,0,.07,0,.96,.14,.86);b.cylinder(pale,0,.30,0,.34,.42,0,0,24);
        b.cylinder(dark,0,.55,0,.30,.09,0,0,24);b.cylinder(steel,0,.63,0,.245,.08,0,0,24);
        for(const x of[-.37,.37])for(const z of[-.31,.31]){b.cylinder(steel,x,.16,z,.055,.06,0,0,10);b.cylinder(gold,x,.195,z,.026,.018,0,0,8);}
        const shoulder=[0,.86,0],elbow=[side*.38,1.88,-.13],wrist=[-side*.50,1.62,.18],tool=[-side*.72,1.28,.44];
        b.bar(pale,shoulder,elbow,.27,.31);b.bar(pale,elbow,wrist,.22,.26);b.bar(steel,wrist,tool,.14,.18);
        b.bar(dark,[side*.18,.91,.18],[side*.47,1.73,.08],.075);b.bar(steel,[side*.47,1.73,.08],[-side*.36,1.56,.32],.052);
        b.bar(cyan,[side*.07,1.02,.165],[side*.30,1.73,.035],.019,.014);
        b.bar(cyan,[side*.24,1.87,.035],[-side*.40,1.67,.345],.018,.014);
        for(const [point,radius]of[[shoulder,.235],[elbow,.22],[wrist,.155]]){
          const [x,y,z]=point;b.cylinder(dark,x,y,z,radius,.38,Math.PI/2,0,24);
          b.cylinder(steel,x,y,z+.205,radius*.70,.045,Math.PI/2,0,20);
          b.cylinder(gold,x,y,z+.235,radius*.28,.022,Math.PI/2,0,16);
          b.torus(cyan,x,y,z+.247,radius*.79,.012,0,0,24);
        }
        b.box(dark,tool[0],tool[1]-.04,tool[2],.22,.20,.25);
        for(const z of[tool[2]-.13,tool[2]+.13]){
          b.bar(steel,[tool[0],tool[1]-.06,z],[-side*.82,tool[1]-.30,z],.044,.052);
          b.box(dark,-side*.82,tool[1]-.30,z,.09,.045,.10);
        }
        b.box(cyan,0,.32,.345,.18,.032,.016);
      });arm.userData.serviceRobot=true;arm.userData.articulatedJoints=3;
    }

    const hemi=new THREE.HemisphereLight(0xc3e2f3,0x1c2c3d,.68);hemi.name='Workshop ambient daylight';root.add(hemi);
    const key=new THREE.DirectionalLight(0xe6f4ff,2.05);key.name='Workshop bay key light';key.position.set(3.8,7.5,4.8);key.castShadow=true;key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-6.5,right:6.5,top:6.5,bottom:-6.5,near:.1,far:25});key.shadow.bias=-.00035;key.shadow.normalBias=.021;key.shadow.radius=3;key.target.position.set(0,.4,0);root.add(key,key.target);
    const daylight=new THREE.DirectionalLight(0xadddf5,1.12);daylight.name='Window soft daylight';daylight.position.set(-9,5,4);root.add(daylight);
    const rim=new THREE.DirectionalLight(0x59d2f3,.75);rim.position.set(1,4,-8);rim.name='Workshop cyan rear bounce';root.add(rim);
    for(const x of[-3.3,3.3]){const lamp=new THREE.SpotLight(0xe1f5ff,.65,18,.85,1,1.6);lamp.name='Practical overhead work light';lamp.position.set(x,5.3,0);lamp.target.position.set(x*.2,0,0);root.add(lamp,lamp.target);}
    root.userData.summary=stats;root.userData.workshop=true;root.userData.clearBay=stats.clearBay;
    function update(camera){
      const c=camera.position,target=new THREE.Vector3(0,.55,0),line=target.clone().sub(c),lengthSq=line.lengthSq();
      walls.left.visible=c.x>-13.05;walls.right.visible=c.x<13.05;walls.back.visible=c.z>-10.05;walls.front.visible=c.z<14.05;roofGroup.visible=c.y<5.35;
      for(const item of occluders){
        const p=new THREE.Vector3(item.x,1.05,item.z),t=Math.max(0,Math.min(1,p.clone().sub(c).dot(line)/Math.max(.001,lengthSq))),closest=c.clone().addScaledVector(line,t);
        const blocks=t>.015&&t<.95&&p.distanceTo(closest)<item.radius;
        item.group.visible=!blocks&&(!qualityDetails.includes(item.group)||currentQuality!=='low');
      }
    }
    let currentQuality='medium';
    function setQuality(value){currentQuality=['low','medium','high'].includes(value)?value:'medium';for(const group of qualityDetails)group.visible=currentQuality!=='low';}
    function dispose(){if(disposed)return;disposed=true;geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());key.shadow.map?.dispose();if(scene.background===workshopBackground)scene.background=previousBackground;if(root.parent)root.parent.remove(root);root.clear();}
    return {root,key,stats,update,setQuality,dispose};
  }
  global.NVWorkshop={build};
})(window);
