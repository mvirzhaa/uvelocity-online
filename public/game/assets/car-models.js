/* NEON VELOCITY — original parametric vehicles. No third-party vehicle assets. */
(function (global) {
  'use strict';
  const T = global.THREE;
  const MODELS = [
    {id:'veloce',name:'Veloce R',category:'MID-ENGINE HYPERCAR',tag:'01 / HYPERCAR',description:'Siluet rendah, aerodinamika tajam, dan dorongan eksplosif.',power:720,weight:1380,maxSpeed:305,nitroSpeed:365,acceleration:33,handling:0.96,grip:83,accel:97,control:82,color:'#f0d06a',length:4.58,width:2.06,front:1.40,rear:-1.40,cabBack:-1.08,cabFront:1.03,roofBack:-.54,roofFront:.20,roofHeight:1.24,wing:'carbon',spokes:5,shape:'wedge'},
    {id:'apex',name:'Apex GT',category:'REAR-ENGINE GRAND TOURER',tag:'02 / GRAND TOURER',description:'Kurva klasik dengan keseimbangan kemudi yang presisi.',power:510,weight:1445,maxSpeed:280,nitroSpeed:342,acceleration:29,handling:1.14,grip:96,accel:86,control:96,color:'#b6cbd5',length:4.45,width:2.00,front:1.35,rear:-1.34,cabBack:-1.40,cabFront:1.02,roofBack:-.50,roofFront:.18,roofHeight:1.38,wing:'ducktail',spokes:10,shape:'round'},
    {id:'cinder',name:'Cinder V8',category:'FRONT-ENGINE MUSCLE',tag:'03 / MUSCLE',description:'Kap panjang, tenaga V8, dan karakter rear-wheel drive.',power:640,weight:1690,maxSpeed:290,nitroSpeed:354,acceleration:31,handling:.91,grip:78,accel:91,control:77,color:'#ef633c',length:4.86,width:2.10,front:1.53,rear:-1.39,cabBack:-1.50,cabFront:.80,roofBack:-.72,roofFront:-.10,roofHeight:1.36,wing:'lip',spokes:5,shape:'muscle'},
    {id:'kaze',name:'Kaze RS',category:'AWD STREET COUPE',tag:'04 / STREET',description:'Coupe jalanan dengan grip tinggi dan respons yang lincah.',power:570,weight:1530,maxSpeed:282,nitroSpeed:346,acceleration:30,handling:1.08,grip:92,accel:89,control:93,color:'#7c96d7',length:4.61,width:2.01,front:1.43,rear:-1.39,cabBack:-1.26,cabFront:1.04,roofBack:-.60,roofFront:.26,roofHeight:1.43,wing:'touring',spokes:6,shape:'coupe'}
  ];
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const smooth=x=>{x=clamp(x,0,1);return x*x*(3-2*x);};
  function mat(hex,metal,rough){return new T.MeshStandardMaterial({color:hex,metalness:metal,roughness:rough});}
  function merge(geometries){
    let count=0; const gs=[];
    geometries.forEach(g=>{const n=g.index?g.toNonIndexed():g; if(!n.attributes.normal)n.computeVertexNormals();gs.push(n);count+=n.attributes.position.count;});
    const pos=new Float32Array(count*3),norm=new Float32Array(count*3);let p=0;
    gs.forEach(g=>{pos.set(g.attributes.position.array,p);norm.set(g.attributes.normal.array,p);p+=g.attributes.position.array.length;});
    const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(pos,3));g.setAttribute('normal',new T.BufferAttribute(norm,3));
    gs.forEach(g=>g.dispose()); geometries.forEach(g=>g.dispose());return g;
  }
  class Batch {
    constructor(parent){this.parent=parent;this.groups=new Map();}
    add(geo,material,pos,rot,scale){
      const m=new T.Matrix4();m.compose(new T.Vector3(...(pos||[0,0,0])),new T.Quaternion().setFromEuler(new T.Euler(...(rot||[0,0,0]))),new T.Vector3(...(scale||[1,1,1])));geo.applyMatrix4(m);
      if(!this.groups.has(material))this.groups.set(material,[]);this.groups.get(material).push(geo);
    }
    box(x,y,z,material,pos,rot){this.add(new T.BoxGeometry(x,y,z),material,pos,rot);}
    flush(){this.groups.forEach((gs,m)=>{const mesh=new T.Mesh(merge(gs),m);mesh.castShadow=true;mesh.receiveShadow=true;this.parent.add(mesh);});this.groups.clear();}
  }
  function surface(rows,columns,point){
    const ps=[],uv=[],ind=[];
    for(let i=0;i<=rows;i++)for(let j=0;j<=columns;j++){ps.push(...point(i/rows,j/columns));uv.push(j/columns,i/rows);}
    for(let i=0;i<rows;i++)for(let j=0;j<columns;j++){const a=i*(columns+1)+j,b=a+1,c=a+columns+1,d=c+1;ind.push(a,c,b,b,c,d);}
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(ps,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(ind);g.computeVertexNormals();return g;
  }
  function poly(points){
    const p=[];for(let i=1;i<points.length-1;i++)p.push(...points[0],...points[i],...points[i+1]);
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.computeVertexNormals();return g;
  }
  function tube(batch,points,r,material,segments){
    const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)));batch.add(new T.TubeGeometry(curve,segments||Math.max(12,points.length*8),r,6,false),material);
  }
  function textureCanvas(w,h,draw){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new T.CanvasTexture(c);t.encoding=T.sRGBEncoding;return t;}
  function makePaint(color,finish){const m=new T.MeshPhysicalMaterial({color:color,metalness:.72,roughness:.25,clearcoat:1,clearcoatRoughness:.07,envMapIntensity:1.25,side:T.DoubleSide});setFinish(m,finish);return m;}
  function setFinish(m,finish){
    if(finish==='matte'){m.metalness=.3;m.roughness=.70;m.clearcoat=.08;m.clearcoatRoughness=.4;}
    else if(finish==='gloss'){m.metalness=.32;m.roughness=.2;m.clearcoat=1;m.clearcoatRoughness=.045;}
    else{m.metalness=.78;m.roughness=.27;m.clearcoat=1;m.clearcoatRoughness=.06;}
    m.needsUpdate=true;
  }
  function create(modelId,colorHex,opts){
    opts=opts||{}; const cfg=MODELS.find(m=>m.id===modelId)||MODELS[0];
    const root=new T.Group();root.name='NV_'+cfg.id;const bodyTiltGroup=new T.Group();root.add(bodyTiltGroup);
    const paint=makePaint(colorHex||cfg.color,opts.finish||'metallic');
    const carbon=mat(0x111519,.32,.36), rubber=mat(0x101114,.03,.91),dark=mat(0x070b0d,.35,.28),seam=mat(0x192125,.25,.54),chrome=mat(0xbac4cc,.94,.2),wheelMat=mat(opts.wheelColor||0xa7aeb6,.87,.25), rotorMat=mat(0x6f7880,.82,.34),caliperMat=mat(0xd9372e,.45,.26), grill=mat(0x30353b,.65,.39);
    dark.side=T.DoubleSide; wheelMat.side=T.DoubleSide; carbon.side=T.DoubleSide;
    const glass=new T.MeshPhysicalMaterial({color:0x17242a,metalness:.45,roughness:.07,clearcoat:1,clearcoatRoughness:.015,envMapIntensity:1.6,side:T.DoubleSide});
    const headMat=new T.MeshBasicMaterial({color:0xebf6ff,toneMapped:false});
    const brakeMat=new T.MeshBasicMaterial({color:0xa60e22,toneMapped:false,side:T.DoubleSide});
    const amber=new T.MeshBasicMaterial({color:0xe89b35,toneMapped:false});
    const b=new Batch(bodyTiltGroup);const L=cfg.length/2,W=cfg.width/2;
    // Continuous body surfaces, with separate open wheel wells and shoulder bulges.
    function width(z){const t=Math.abs(z/L);const taper=cfg.shape==='round'?.22:cfg.shape==='muscle'?.10:.15;return W*(1-taper*Math.pow(t,5))*(1-.028*Math.exp(-Math.pow(z/.70,2)));}
    function centerY(z){
      const front=smooth((z-.75)/(L-.75)),rear=smooth((-z-1.15)/(L-1.15));
      let y=.82-front*(cfg.shape==='wedge'?.24:cfg.shape==='round'?.18:.12)-rear*.025;
      if(cfg.shape==='muscle')y+=.055*Math.exp(-Math.pow((z-.85)/.9,2));
      return y;
    }
    function fender(z){return Math.max(Math.exp(-Math.pow((z-cfg.front)/.56,2)),Math.exp(-Math.pow((z-cfg.rear)/.59,2)));}
    function shoulder(z){return centerY(z)+.18*fender(z)+.016;}
    function topPoint(z,u){const a=Math.abs(u),w=width(z);return [u*w,centerY(z)+(shoulder(z)-centerY(z))*Math.pow(Math.sin(a*Math.PI*.5),2)-.035*Math.pow(a,14),z];}
    function lower(z){let y=.25;for(const wz of[cfg.front,cfg.rear]){const d=Math.abs(z-wz),r=.505;if(d<r){const arch=.43+Math.sqrt(Math.max(0,r*r-d*d));const v=smooth((r-d)/.025);y=Math.max(y,.25+(arch-.25)*v);}}return y;}
    b.add(surface(160,32,(v,u)=>topPoint(-L+v*L*2,u*2-1)),paint);
    [-1,1].forEach(s=>{
      b.add(surface(160,7,(v,t)=>{const z=-L+v*L*2,yt=topPoint(z,s)[1],yb=Math.min(yt-.018,lower(z));return[s*(width(z)-.035*Math.sin(t*Math.PI*.7)),yt*(1-t)+yb*t,z];}),paint);
      // A dark inside wall behind each wheel prevents a hollow toy-like appearance.
      [cfg.front,cfg.rear].forEach(wz=>{
        b.add(surface(48,5,(v,t)=>{const a=v*Math.PI;return[s*(W-.12-.16*t),.43+Math.sin(a)*.495,wz+Math.cos(a)*.495];}),rubber);
        const archPts=[];for(let k=0;k<=32;k++){const a=k*Math.PI/32;const z=wz+Math.cos(a)*.512;archPts.push([s*(width(z)+.004),.43+Math.sin(a)*.511,z]);}
        tube(b,archPts,.011,paint,56);
      });
      // Sculpted rocker panels and carbon skirts.
      tube(b,[[s*(W-.03),.265,-1.05],[s*(W+.012),.235,0],[s*(W-.02),.265,1.06]],.045,carbon,30);
      // Door shut lines and flush handles.
      const doorZ0=cfg.shape==='muscle'?-.92:-.86,doorZ1=.75;
      const seamPts=[[s*(width(doorZ1)+.007),.855,doorZ1],[s*(width(.65)+.004),.64,.65],[s*(width(.58)+.003),.34,.58],[s*(width(-.5)+.002),.34,-.5],[s*(width(doorZ0)+.006),.58,doorZ0],[s*(width(doorZ0)+.006),.85,doorZ0]];
      tube(b,seamPts,.0045,seam,32);b.box(.018,.026,.17,chrome,[s*(width(-.48)+.008),.79,-.48]);
      // Mirror stalk, painted housing, and reflective insert.
      tube(b,[[s*.78,1.01,.54],[s*1.03,1.025,.51]],.026,carbon,10);
      b.add(new T.SphereGeometry(1,20,12),paint,[s*1.075,1.048,.50],[0,s*.14,0],[.16,.072,.12]);
      b.add(new T.SphereGeometry(1,16,8),chrome,[s*1.083,1.047,.405],[0,0,0],[.118,.046,.015]);
    });
    // Front and rear skins close the loft, while leaving room for real inset trim.
    [1,-1].forEach(s=>{const z=s*L;const points=[[-width(z),.25,z],[width(z),.25,z]];for(let j=24;j>=0;j--)points.push(topPoint(z,j/12-1));b.add(poly(points),paint);});
    // Cabin uses a compound curved glass shell; the roof is a separate painted patch.
    const cabBase=.835;
    function cabinHeight(z){if(z<cfg.roofBack)return(cfg.roofHeight-cabBase)*smooth((z-cfg.cabBack)/(cfg.roofBack-cfg.cabBack));if(z>cfg.roofFront)return(cfg.roofHeight-cabBase)*(1-smooth((z-cfg.roofFront)/(cfg.cabFront-cfg.roofFront)));return cfg.roofHeight-cabBase+.016*Math.sin((z-cfg.roofBack)/(cfg.roofFront-cfg.roofBack)*Math.PI);}
    function cabinPoint(z,u,extra){const cw=width(z)*.835,theta=u*Math.PI/2;return[cw*Math.sin(theta),cabBase+cabinHeight(z)*Math.pow(Math.max(0,Math.cos(theta)),.54)+(extra||0),z];}
    b.add(surface(72,40,(v,u)=>cabinPoint(cfg.cabBack+v*(cfg.cabFront-cfg.cabBack),u*2-1)),glass);
    b.add(surface(24,24,(v,u)=>cabinPoint(cfg.roofBack+.03+v*(cfg.roofFront-cfg.roofBack-.06),(u*2-1)*.59,.008)),paint);
    [-1,1].forEach(s=>{
      // A and C pillars trace actual cabin curvature; top rails follow the roof.
      for(const which of['front','back']){
        const za=which==='front'?cfg.roofFront:cfg.roofBack,zb=which==='front'?cfg.cabFront:cfg.cabBack;
        const pts=[];for(let i=0;i<=12;i++){const t=i/12;pts.push(cabinPoint(za+(zb-za)*t,s*(.59+.38*t),.009));}tube(b,pts,.022,paint,30);
      }
      const rail=[];for(let i=0;i<=16;i++)rail.push(cabinPoint(cfg.roofBack+(cfg.roofFront-cfg.roofBack)*i/16,s*.60,.014));tube(b,rail,.025,paint,32);
      const lowerRail=[];for(let i=0;i<=24;i++)lowerRail.push(cabinPoint(cfg.cabBack+(cfg.cabFront-cfg.cabBack)*i/24,s*.98,.008));tube(b,lowerRail,.014,chrome,48);
      if(cfg.shape!=='wedge'){
        const zB=cfg.roofBack*.8;const pillar=[];for(let i=0;i<=12;i++)pillar.push(cabinPoint(zB,s*(.59+.4*i/12),.012));tube(b,pillar,.025,dark,24);
      }
    });
    // Fine hood shut lines sit directly on the painted surface.
    const hoodBack=cfg.cabFront+.08;
    [-1,1].forEach(s=>{const pts=[];for(let i=0;i<=22;i++){const z=hoodBack+(L-.17-hoodBack)*i/22;const p=topPoint(z,s*.59);p[1]+=.004;pts.push(p);}tube(b,pts,.0037,seam,32);});
    if(cfg.shape==='muscle'){
      const hoodPts=[];for(let i=0;i<=18;i++){const z=.92+(L-.48-.92)*i/18;const p=topPoint(z,0);p[1]+=.07*Math.sin(i/18*Math.PI);hoodPts.push(p);}tube(b,hoodPts,.13,paint,36);
      b.box(.40,.022,.34,carbon,[0,.906,.95]);for(let i=0;i<5;i++)b.box(.33,.014,.018,grill,[0,.921,.81+i*.055]);
    }
    // Functional-looking front intakes, slatted mesh and a low splitter.
    const faceY=centerY(L),noseZ=L+.009;
    b.add(poly([[-.59,.285,noseZ],[.59,.285,noseZ],[.50,faceY-.11,noseZ],[.15,faceY-.08,noseZ],[-.15,faceY-.08,noseZ],[-.50,faceY-.11,noseZ]]),dark);
    for(let i=-8;i<=8;i++)b.box(.009,.15,.013,grill,[i*.056,.386,noseZ+.004],[0,0,i*.01]);
    for(let i=0;i<3;i++)b.box(.92,.009,.012,grill,[0,.33+i*.047,noseZ+.006]);
    const splitter=[];for(let i=0;i<=14;i++){const x=-.95+1.9*i/14;splitter.push([x,.24,L+.04-.09*Math.pow(Math.abs(x)/.95,2)]);}tube(b,splitter,.035,carbon,32);
    [-1,1].forEach(s=>{
      b.add(poly([[s*.64,.30,noseZ-.018],[s*.88,.32,noseZ-.045],[s*.83,faceY-.12,noseZ-.045],[s*.63,faceY-.10,noseZ-.018]]),dark);
      for(let i=0;i<3;i++)b.box(.17,.014,.025,grill,[s*.75,.355+i*.053,noseZ-.015]);
    });
    // Different lamp signatures make each silhouette recognizable.
    if(cfg.shape==='round'){
      [-1,1].forEach(s=>{
        b.add(new T.SphereGeometry(1,24,16),dark,[s*.69,.77,L-.31],[.53,0,0],[.205,.064,.27]);
        const pts=[];for(let i=0;i<=32;i++){const a=i/32*Math.PI*2;pts.push([s*.69+Math.cos(a)*.15,.79+Math.sin(a)*.09,L-.28+Math.sin(a)*.17]);}tube(b,pts,.014,headMat,48);
        b.add(new T.SphereGeometry(.065,12,8),headMat,[s*.69,.79,L-.23]);
      });
    }else{
      [-1,1].forEach(s=>{
        const z=L-.09,y=faceY+.026;
        b.add(poly([[s*.40,y-.045,z+.075],[s*.86,y-.025,z+.035],[s*.91,y+.095,z-.23],[s*.59,y+.08,z-.18]]),dark);
        tube(b,[[s*.43,y-.012,z+.085],[s*.81,y+.005,z+.045],[s*.865,y+.082,z-.19]],.014,headMat,22);
        if(cfg.shape==='coupe')tube(b,[[s*.50,y+.024,z+.02],[s*.78,y+.031,z-.03]],.012,headMat,12);
        if(cfg.shape==='muscle')b.box(.06,.035,.016,amber,[s*.87,y-.012,z+.04]);
      });
    }
    // Rear valance, diffuser vanes, and polished exhaust tips.
    const tailZ=-L-.012,tailY=centerY(-L);
    b.add(poly([[-.87,.32,tailZ],[.87,.32,tailZ],[.85,.62,tailZ],[-.85,.62,tailZ]]),dark);
    for(let i=-4;i<=4;i++)b.box(.018,.17,.40,carbon,[i*.17,.28,-L+.07],[.16,0,0]);
    for(let i=-8;i<=8;i++)b.box(.012,.13,.01,grill,[i*.088,.52,tailZ-.006]);
    if(cfg.shape==='round')tube(b,[[-.87,tailY-.04,tailZ],[-.48,tailY-.018,tailZ-.012],[0,tailY-.012,tailZ-.015],[.48,tailY-.018,tailZ-.012],[.87,tailY-.04,tailZ]],.026,brakeMat,42);
    else if(cfg.shape==='muscle'){
      [-1,1].forEach(s=>{b.box(.57,.20,.035,dark,[s*.58,tailY-.085,tailZ]);for(let i=0;i<3;i++)b.box(.065,.145,.046,brakeMat,[s*(.39+i*.15),tailY-.07,tailZ-.015],[0,0,s*.1]);});
    }else if(cfg.shape==='coupe'){
      [-1,1].forEach(s=>{for(let i=0;i<2;i++){const radius=i? .075:.101;const geo=new T.TorusGeometry(radius,.022,8,24);b.add(geo,brakeMat,[s*(.48+i*.28),tailY-.075,tailZ-.014]);}});
    }else{
      [-1,1].forEach(s=>{tube(b,[[s*.35,tailY-.03,tailZ],[s*.85,tailY-.03,tailZ+.015]],.023,brakeMat,18);tube(b,[[s*.44,tailY-.095,tailZ],[s*.85,tailY-.095,tailZ+.015]],.015,brakeMat,18);});
    }
    const exXs=cfg.shape==='muscle'?[-.77,-.58,.58,.77]:[-.54,.54];
    exXs.forEach(x=>{
      const g=new T.CylinderGeometry(.085,.08,.22,20,1,true);g.rotateX(Math.PI/2);b.add(g,chrome,[x,.37,-L+.015]);
      const hole=new T.CircleGeometry(.069,20);hole.rotateY(Math.PI);b.add(hole,dark,[x,.37,-L-.098]);
      b.add(new T.TorusGeometry(.079,.012,8,20),chrome,[x,.37,-L-.10]);
    });
    // Model-specific scoops, vents and spoiler geometry.
    if(cfg.shape==='wedge'){
      [-1,1].forEach(s=>{
        b.add(poly([[s*(W+.005),.39,-.72],[s*(W+.016),.78,-1.04],[s*(W+.012),.83,-.74],[s*(W+.005),.59,-.43]]),dark);
        tube(b,[[s*W,.37,-.73],[s*(W+.02),.58,-.43],[s*(W+.02),.75,-.47]],.025,paint,20);
      });
      for(let i=0;i<7;i++)b.box(1.04,.018,.033,carbon,[0,centerY(-1.25-i*.075)+.018,-1.25-i*.075]);
    }
    if(cfg.shape==='round')for(let i=0;i<10;i++)b.box(.022,.021,.30,carbon,[(i-4.5)*.09,.865,-1.65]);
    if(cfg.shape==='coupe')[-1,1].forEach(s=>{for(let i=0;i<3;i++)b.box(.014,.065,.09,carbon,[s*(W+.004),.77,.92-i*.13],[0,0,.15]);});
    if(cfg.wing==='carbon'||cfg.wing==='touring'){
      const wy=cfg.wing==='touring'?1.28:1.06,wz=-L+.28;
      [-1,1].forEach(s=>b.box(.055,wy-.78,.12,carbon,[s*.65,(wy+.78)/2,wz],[.13,0,0]));
      b.add(surface(6,32,(v,u)=>{const x=(u*2-1)*1.02;return[x,wy+.028*Math.cos(u*Math.PI*2)+.032*Math.sin(v*Math.PI),wz+(v-.5)*.28+.04*Math.pow(x,2)];}),carbon);
      [-1,1].forEach(s=>b.add(poly([[s*1.025,wy-.09,wz-.14],[s*1.025,wy+.10,wz-.14],[s*1.025,wy+.10,wz+.12],[s*1.025,wy-.09,wz+.17]]),carbon));
    }else{
      const points=[];for(let i=0;i<=20;i++){const x=(i/10-1)*.88;points.push([x,tailY+.045+.03*(1-Math.abs(x)),-L+.06]);}tube(b,points,cfg.wing==='ducktail'?.052:.033,paint,40);
    }
    // Subtle bonnet emblem (original V symbol, no manufacturer branding).
    const badgeZ=L-.37,badgeY=topPoint(badgeZ,0)[1]+.013;
    tube(b,[[-.045,badgeY,badgeZ+.025],[0,badgeY,badgeZ-.036],[.045,badgeY,badgeZ+.025]],.009,chrome,12);
    b.flush();
    // Licence plate is the sole per-car painted texture.
    const plateTex=textureCanvas(256,64,(ctx,w,h)=>{ctx.fillStyle='#141b21';ctx.fillRect(0,0,w,h);ctx.strokeStyle='#63717c';ctx.lineWidth=3;ctx.strokeRect(3,3,w-6,h-6);ctx.fillStyle='#e4ecee';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='600 28px Arial';ctx.fillText(cfg.name.toUpperCase(),w/2,h/2);});
    const plate=new T.Mesh(new T.PlaneGeometry(.53,.132),new T.MeshStandardMaterial({map:plateTex,roughness:.45,metalness:.1}));plate.rotation.y=Math.PI;plate.position.set(0,.65,-L-.027);bodyTiltGroup.add(plate);
    // Detailed wheel assemblies: rounded sidewalls, five-piece rim, drilled disc and fixed caliper.
    const wheels=[],frontPivots=[];
    [-1,1].forEach(s=>[cfg.front,cfg.rear].forEach((wz,idx)=>{
      const pivot=new T.Group();pivot.position.set(s*(W-.035),.43,wz);root.add(pivot);
      const wheel=new T.Group();pivot.add(wheel);wheels.push(wheel);if(idx===0)frontPivots.push(pivot);
      const wb=new Batch(wheel);
      const profile=[[.29,-.165],[.355,-.165],[.398,-.147],[.423,-.104],[.432,-.04],[.432,.04],[.423,.104],[.398,.147],[.355,.165],[.29,.165]].map(p=>new T.Vector2(p[0],p[1]));
      const tireGeo=new T.LatheGeometry(profile,64);tireGeo.rotateZ(Math.PI/2);wb.add(tireGeo,rubber);
      // Concentric tread grooves and shoulder sipes are merged into one draw call.
      for(const off of[-.08,0,.08]){const g=new T.TorusGeometry(.432,.004,5,64);g.rotateY(Math.PI/2);wb.add(g,dark,[off,0,0]);}
      for(let k=0;k<40;k++){const a=k/40*Math.PI*2;wb.box(.23,.006,.009,dark,[0,Math.cos(a)*.432,Math.sin(a)*.432],[a,0,.17]);}
      for(const side of[-1,1]){
        const x=side*.163;
        const barrel=new T.CylinderGeometry(.307,.307,.035,48,1,true);barrel.rotateZ(Math.PI/2);wb.add(barrel,wheelMat,[x,0,0]);
        for(const rad of[.303,.317]){const lip=new T.TorusGeometry(rad,.011,8,48);lip.rotateY(Math.PI/2);wb.add(lip,chrome,[x+side*.006,0,0]);}
        const cap=new T.CylinderGeometry(.077,.077,.028,24);cap.rotateZ(Math.PI/2);wb.add(cap,wheelMat,[x,0,0]);
        const detail=new T.CylinderGeometry(.034,.034,.033,20);detail.rotateZ(Math.PI/2);wb.add(detail,dark,[x+side*.005,0,0]);
        for(let k=0;k<cfg.spokes;k++){
          const a=k/cfg.spokes*Math.PI*2;
          const spokePoints=[];
          // Tapered forged spokes, with a subtly swept outer end.
          for(const q of[[.070,-.031],[.280,-.023],[.303,.014],[.102,.041]]){const r=q[0],t=q[1];spokePoints.push([x+side*.012,r*Math.cos(a)-t*Math.sin(a),r*Math.sin(a)+t*Math.cos(a)]);}wb.add(poly(spokePoints),wheelMat);
          if(cfg.spokes<=6){const ap=a+.10;wb.box(.032,.17,.014,wheelMat,[x,.205*Math.cos(ap),.205*Math.sin(ap)],[ap,0,0]);}
        }
        for(let k=0;k<5;k++){const a=k/5*Math.PI*2;const g=new T.CylinderGeometry(.011,.011,.034,6);g.rotateZ(Math.PI/2);wb.add(g,chrome,[x+side*.008,.054*Math.cos(a),.054*Math.sin(a)]);}
        const disc=new T.CylinderGeometry(.271,.271,.018,48);disc.rotateZ(Math.PI/2);wb.add(disc,rotorMat,[side*.107,0,0]);
        for(let ring=0;ring<2;ring++)for(let k=0;k<18;k++){const a=(k+ring*.35)/18*Math.PI*2,r=.214+ring*.032;const hole=new T.CircleGeometry(.007,6);hole.rotateY(Math.PI/2*side);wb.add(hole,dark,[side*.119,r*Math.cos(a),r*Math.sin(a)]);}
      }
      wb.flush();
      const cb=new Batch(pivot);cb.box(.075,.195,.106,caliperMat,[s*.121,.12,-.195],[.33,0,0]);cb.flush();
    }));
    // Nitro geometry remains hidden until activated by the original physics loop.
    const flameMat=new T.MeshBasicMaterial({color:0x38bdf8,transparent:true,opacity:.88,depthWrite:false,toneMapped:false});const flames=[];
    [-.54,.54].forEach(x=>{const g=new T.ConeGeometry(.11,.85,12);g.rotateX(-Math.PI/2);const f=new T.Mesh(g,flameMat);f.position.set(x,.37,-L-.52);f.visible=false;bodyTiltGroup.add(f);flames.push(f);});
    // Contact shadow improves grounding on non-shadowed low graphics settings.
    const shadowTex=textureCanvas(128,256,(ctx,w,h)=>{const g=ctx.createRadialGradient(w/2,h/2,10,w/2,h/2,h*.50);g.addColorStop(0,'rgba(0,0,0,.68)');g.addColorStop(.5,'rgba(0,0,0,.42)');g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);});
    const shadow=new T.Mesh(new T.PlaneGeometry(cfg.width*1.27,cfg.length*1.17),new T.MeshBasicMaterial({map:shadowTex,transparent:true,opacity:.60,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=.015;root.add(shadow);
    root.userData.modelId=cfg.id;root.userData.description='Original procedural vehicle model';
    return {root,bodyTiltGroup,wheels,frontPivots,brakeMat,flames,flameMat,paintMaterial:paint,paintMaterials:[paint],wheelMaterial:wheelMat,model:cfg,shadow,headMat};
  }
  function recolor(car,color,finish){if(!car)return;(car.paintMaterials||[car.paintMaterial]).forEach(m=>{if(!m)return;m.color.set(color);if(finish)setFinish(m,finish);});}
  function dispose(car){if(!car||!car.root)return;const geos=new Set(),mats=new Set(),textures=new Set();car.root.traverse(o=>{if(o.geometry)geos.add(o.geometry);if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>mats.add(m));});mats.forEach(m=>{for(const key of['map','normalMap','roughnessMap','metalnessMap','alphaMap'])if(m[key])textures.add(m[key]);});geos.forEach(g=>g.dispose());textures.forEach(t=>t.dispose());mats.forEach(m=>m.dispose());if(car.root.parent)car.root.parent.remove(car.root);}
  global.NVCarFactory={models:MODELS,create,recolor,dispose};
})(window);
