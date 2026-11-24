/* UVelocity2km drag strip. Metres, +Y up, travel toward -Z. The two timing
   lines are independent objects; staging/runout do not change race length. */
(function(){
  'use strict';
  const LENGTH=2000,RUNOUT=700,STAGING=100,HALF_WIDTH=22.5;
  function build({THREE,scene}){
    const root=new THREE.Group();root.name='Drag Strip 2 KM';root.userData={circuitId:'drag-2km',closed:false,raceLength:LENGTH,runout:RUNOUT,roadHalf:HALF_WIDTH,start:[0,0,0],finish:[0,0,-LENGTH]};scene.add(root);
    const mats={},textures=new Set(),geometries=new Set(),detail=new THREE.Group(),nightLights=[];
    detail.name='Drag paddock detail';root.add(detail);
    const material=(name,color,roughness=.75,metalness=0)=>mats[name]||(mats[name]=new THREE.MeshStandardMaterial({name:'Drag '+name,color,roughness,metalness}));
    const asphalt=material('asphalt',0x30363b,.96,.03),concrete=material('barriers',0x9ba5aa,.86),steel=material('gunmetal steel',0x26343d,.44,.7),white=material('road paint',0xe0e5df,.86),dark=material('checker dark',0x11171c,.95),gold=material('gold accent',0xeab45c,.5,.28),cyan=material('cyan accent',0x28d7e6,.37,.3),grass=material('verge',0x657760,.96),shoulder=material('shoulder',0x6a7372,.96),glass=material('control tower glass',0x27637b,.2,.58);
    cyan.emissive=new THREE.Color(0x14b3d3);cyan.emissiveIntensity=.8;gold.emissive=new THREE.Color(0x754a16);gold.emissiveIntensity=.4;
    function mesh(geometry,mat,name,parent=root){geometries.add(geometry);const obj=new THREE.Mesh(geometry,mat);obj.name=name;obj.receiveShadow=true;parent.add(obj);return obj;}
    const unitBox=new THREE.BoxGeometry(1,1,1);geometries.add(unitBox);
    function box(mat,size,position,name,parent=root){const obj=mesh(unitBox,mat,name,parent);obj.scale.set(...size);obj.position.set(...position);obj.castShadow=true;return obj;}
    function instances(name,mat,size,locations,parent=root){const obj=new THREE.InstancedMesh(unitBox,mat,locations.length),matrix=new THREE.Matrix4(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3(...size);obj.name=name;locations.forEach((p,i)=>obj.setMatrixAt(i,matrix.compose(new THREE.Vector3(...p),rotation,scale)));obj.instanceMatrix.needsUpdate=true;obj.receiveShadow=true;obj.castShadow=false;parent.add(obj);return obj;}
    function surface(name,width,length,z,y,mat){const obj=mesh(new THREE.PlaneGeometry(width,length),mat,name);obj.rotation.x=-Math.PI/2;obj.position.set(0,y,z);return obj;}
    function label(text,width,height,color='#edf5f2',background='#10212c'){
      if(mats['sign '+text])return mesh(new THREE.PlaneGeometry(width,height),mats['sign '+text],text);
      const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;const ctx=canvas.getContext('2d');ctx.fillStyle=background;ctx.fillRect(0,0,1024,256);ctx.strokeStyle='#33cbd6';ctx.lineWidth=9;ctx.strokeRect(8,8,1008,240);ctx.fillStyle=color;ctx.font='bold 94px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,512,132,960);
      const texture=new THREE.CanvasTexture(canvas);texture.encoding=THREE.sRGBEncoding;textures.add(texture);const mat=new THREE.MeshStandardMaterial({name:'Drag sign '+text,map:texture,roughness:.6,emissive:0x758d96,emissiveMap:texture,emissiveIntensity:.24,side:THREE.DoubleSide});mats['sign '+text]=mat;
      return mesh(new THREE.PlaneGeometry(width,height),mat,text);
    }
    // Fine asphalt aggregate repeats by physical metres, independent of lanes.
    const noise=document.createElement('canvas');noise.width=noise.height=256;const ctx=noise.getContext('2d'),pixels=ctx.createImageData(256,256);let seed=1977;
    for(let i=0;i<pixels.data.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const shade=103+(seed>>>26);pixels.data[i]=shade;pixels.data[i+1]=shade+3;pixels.data[i+2]=shade+5;pixels.data[i+3]=255;}ctx.putImageData(pixels,0,0);
    const grain=new THREE.CanvasTexture(noise);grain.wrapS=grain.wrapT=THREE.RepeatWrapping;grain.repeat.set(HALF_WIDTH*2/8,(LENGTH+RUNOUT+STAGING)/8);grain.encoding=THREE.sRGBEncoding;grain.anisotropy=4;textures.add(grain);asphalt.map=grain;
    const roadLength=LENGTH+RUNOUT+STAGING,roadCenter=(STAGING-LENGTH-RUNOUT)/2;
    surface('Drag landscape',850,3600,-1300,-.025,grass);
    surface('Drag shoulders',HALF_WIDTH*2+9,roadLength,roadCenter,.002,shoulder);
    const roadSurface=surface('Drag asphalt staging to braking runout',HALF_WIDTH*2,roadLength,roadCenter,.026,asphalt);roadSurface.userData={startZ:STAGING,endZ:-LENGTH-RUNOUT,raceLength:LENGTH};
    const painted=[];
    for(let lane=1;lane<15;lane++)for(let z=94;z>-LENGTH-RUNOUT;z-=13)painted.push([-HALF_WIDTH+lane*3,.033,z]);
    instances('Fifteen equal drag lane markings',white,[.075,.009,5.2],painted);
    for(const side of[-1,1]){
      box(white,[.15,.01,roadLength],[side*(HALF_WIDTH-.24),.035,roadCenter],'Continuous edge line');
      box(concrete,[.65,.70,roadLength],[side*(HALF_WIDTH+1.25),.35,roadCenter],'Continuous safety barrier');
      box(cyan,[.08,.065,roadLength],[side*(HALF_WIDTH+.90),.73,roadCenter],'Cyan barrier guide');
    }
    const posts=[],reflectors=[];
    for(let z=90;z>-LENGTH-RUNOUT;z-=16)for(const side of[-1,1]){posts.push([side*(HALF_WIDTH+1.25),.75,z]);reflectors.push([side*(HALF_WIDTH+.89),.81,z]);}
    instances('Barrier upright posts',steel,[.16,1.1,.18],posts);instances('Gold barrier reflectors',gold,[.09,.12,.24],reflectors);
    function timingGate(name,z,title,accent){
      const group=new THREE.Group();group.name=name;group.position.z=z;group.userData={timingLine:true,distanceFromStart:-z};root.add(group);
      for(const side of[-1,1]){box(steel,[.9,9,.9],[side*25,4.5,0],'Timing gantry support',group);box(accent,[.14,8.7,.13],[side*24.52,4.8,.52],'Gantry light',group);}
      box(steel,[51,2.1,1.0],[0,9.2,0],'Timing gantry crossbeam',group);box(accent,[50,.13,.08],[0,10.26,.54],'Timing gantry top accent',group);
      const sign=label(title,29,1.7);group.add(sign);sign.position.set(0,9.2,.53);
      const light=[],black=[];for(let x=0;x<30;x++)for(let row=0;row<2;row++)((x+row)%2?black:light).push([-HALF_WIDTH+.75+x*1.5,.041,(row-.5)*1.2]);
      instances(name+' white checker cells',white,[1.5,.012,1.2],light,group);instances(name+' dark checker cells',dark,[1.5,.012,1.2],black,group);
      return group;
    }
    const start=timingGate('Drag START timing line',0,'UVELOCITY  |  START',cyan),finish=timingGate('Drag FINISH timing line',-LENGTH,'FINISH  |  2.000 M',gold);
    const numbers=[];
    for(let i=0;i<15;i++){const number=label(String(i+1).padStart(2,'0'),1.5,.65,'#e9bc71','#273239');number.rotation.x=-Math.PI/2;number.position.set((i-7)*3,.055,1.8);numbers.push(number);box(white,[2.3,.009,.14],[(i-7)*3,.04,6.05],'Equal-distance grid stop line');}
    // A proper starting tree sits outside the racing lane; no obstruction is
    // placed on the2000m centerline or in the post-finish braking corridor.
    for(const side of[-1,1]){
      box(steel,[.3,5.8,.3],[side*26.5,2.9,-4],'Drag starting tree');
      for(let i=0;i<5;i++){const lit=material('tree '+i,i<2?0xf5c56a:i<4?0xf5a833:0x33df99,.3,.15);lit.emissive=lit.color.clone();lit.emissiveIntensity=.6;const lens=mesh(new THREE.SphereGeometry(.21,12,8),lit,'Starting tree lamp');lens.position.set(side*26.5,5.45-i*.6,-3.8);nightLights.push(lit);}
    }
    for(const distance of[250,500,750,1000,1250,1500,1750,2000])for(const side of[-1,1]){
      const text=label(distance===2000?'2 KM':distance+' M',7,1.75,distance===2000?'#f0bf70':'#edf5f2');text.position.set(side*30.5,3,-distance);box(steel,[.18,3,.18],[side*30.5,1.5,-distance],'Distance marker post');
    }
    for(const z of[-2180,-2450]){const sign=label('ZONA PENGEREMAN',16,2.6,'#ffc476');sign.position.set(36,4,z);box(steel,[.25,4,.25],[36,2,z],'Braking zone sign post');}
    const warning=[];for(let z=-2060;z>-2690;z-=35)for(const side of[-1,1])warning.push([side*(HALF_WIDTH-1),.04,z]);instances('Braking zone warning dashes',gold,[.3,.018,12],warning);
    // Paddock and viewing structures concentrate near the start, leaving the
    // long straight cheap to draw on mobile. They never close the two ends.
    const pitRoad=surface('Paddock service lane',11,650,-230,.012,asphalt);pitRoad.position.x=-42;
    for(let i=0;i<4;i++){
      const z=35-i*55;box(steel,[16,5,22],[-62,2.5,z],'Pit garage',detail);box(concrete,[17,.35,24],[-62,5.2,z],'Pit garage roof',detail);box(glass,[.08,2.5,14],[-53.95,2.2,z],'Pit glazed frontage',detail);box(cyan,[.12,.12,20],[-53.85,4.6,z],'Pit cyan sign rail',detail);
    }
    box(concrete,[11,12,15],[47,6,-23],'Timing control tower',detail);box(glass,[12,3.3,16],[47,11,-23],'Panoramic race control',detail);box(steel,[13,.5,17],[47,13,-23],'Race control roof',detail);
    for(let step=0;step<6;step++){box(concrete,[3,1+step*.55,90],[40+step*2.5,(1+step*.55)/2,-125],'Grandstand tier',detail);box(cyan,[1.7,.16,88],[40+step*2.5,1.1+step*.55,-125],'Grandstand seating',detail);}
    const grandstandRoof=box(steel,[19,.35,95],[46,7.5,-125],'Grandstand canopy',detail);grandstandRoof.rotation.z=-.06;
    for(const z of[-170,-80])for(const x of[36,55])box(steel,[.3,7.3,.3],[x,3.65,z],'Grandstand roof post',detail);
    const lamps=[];for(let z=70;z>-LENGTH-RUNOUT;z-=80)for(const side of[-1,1])lamps.push([side*29,6,z]);instances('Drag floodlight posts',steel,[.18,12,.18],lamps);
    const heads=lamps.map(([x,,z])=>[x,12,z]);const lampMat=material('floodlight lenses',0xd5efff,.3,.1);lampMat.emissive=new THREE.Color(0x9bd7ff);lampMat.emissiveIntensity=.6;nightLights.push(lampMat);instances('Drag floodlight heads',lampMat,[1.8,.35,.7],heads);
    root.updateMatrixWorld(true);
    let disposed=false;
    return {root,roadSurface,start,finish,metadata:root.userData,
      setQuality(value){detail.visible=value!=='low';grain.anisotropy=value==='high'?8:2;},
      setTimeOfDay(value){const night=value==='night';nightLights.forEach(mat=>mat.emissiveIntensity=night?1.35:.35);},
      update(){},
      dispose(){if(disposed)return;disposed=true;if(root.parent)root.parent.remove(root);geometries.forEach(g=>g.dispose());textures.forEach(t=>t.dispose());Object.values(mats).forEach(m=>m.dispose());root.clear();}
    };
  }
  window.NVDragStrip={build,length:LENGTH,runout:RUNOUT,roadHalf:HALF_WIDTH};
})();
