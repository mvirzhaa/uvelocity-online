/* UVelocity fitted wheel packages. Original, code-authored geometry.
 * Stock meshes, pivots, brake discs and fixed calipers remain restorable.
 * Shared geometry is reference counted; the car adapter owns its original assets.
 */
(function (global) {
  'use strict';
  const THREE = global.THREE;
  const catalog = Object.freeze([
    {id:'stock',name:'Original',description:'Roda asli kendaraan'},
    {id:'six-spoke',name:'Forge Six',description:'Enam palang berprofil cekung'},
    {id:'multi-spoke',name:'Touring Twelve',description:'Dua belas palang tipis'},
    {id:'mesh',name:'Cross Mesh',description:'Palang silang dan bibir poles'}
  ]);
  const geometryCache = new Map();
  const instances = new WeakMap();
  let treadTexture, sideTexture, rotorTexture;
  const colorPattern = /^#[0-9a-f]{6}$/i;
  const validId = id => catalog.some(item => item.id === id) ? id : 'stock';

  function canvasTexture(size, draw) {
    const c=document.createElement('canvas');c.width=c.height=size;
    draw(c.getContext('2d'),size);
    const t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;t.anisotropy=4;
    return t;
  }
  function textures() {
    if(treadTexture)return;
    treadTexture=canvasTexture(512,(c,n)=>{
      c.fillStyle='#272a2c';c.fillRect(0,0,n,n);
      // Fine rubber grain, continuous circumferential channels and angled sipes.
      let seed=137;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
      for(let i=0;i<22000;i++){const v=28+Math.floor(rand()*38);c.fillStyle='rgb('+v+','+(v+1)+','+(v+2)+')';c.fillRect(rand()*n,rand()*n,1,1);}
      c.strokeStyle='#101315';c.lineWidth=5;
      for(const x of[112,194,318,400]){c.beginPath();c.moveTo(x,0);c.lineTo(x,n);c.stroke();}
      c.lineWidth=2;
      for(let y=-32;y<n+32;y+=24){for(const side of[-1,1]){c.beginPath();c.moveTo(256+side*58,y);c.lineTo(256+side*235,y+28);c.stroke();}}
    });
    treadTexture.wrapS=treadTexture.wrapT=THREE.RepeatWrapping;treadTexture.repeat.set(1,4);
    sideTexture=canvasTexture(512,(c,n)=>{
      c.fillStyle='#d8dcdf';c.fillRect(0,0,n,n);
      c.strokeStyle='#aab0b4';c.lineWidth=1;
      for(let r=82;r<248;r+=12){c.beginPath();c.arc(256,256,r,0,Math.PI*2);c.stroke();}
      c.fillStyle='#8c949a';c.font='600 18px sans-serif';c.textAlign='center';
      c.save();c.translate(256,256);
      for(let i=0;i<24;i++){c.rotate(Math.PI/12);c.fillRect(-1,-220,2,8);}
      c.restore();
    });
    rotorTexture=canvasTexture(256,(c,n)=>{
      c.fillStyle='#aeb5ba';c.fillRect(0,0,n,n);
      c.strokeStyle='rgba(59,66,73,.18)';c.lineWidth=1;
      for(let r=14;r<124;r+=2){c.beginPath();c.arc(128,128,r,0,Math.PI*2);c.stroke();}
      c.fillStyle='#343c43';
      for(let ring=0;ring<3;ring++)for(let i=0;i<24;i++){
        const a=i*Math.PI/12+ring*.12,r=72+ring*17;c.beginPath();c.arc(128+Math.cos(a)*r,128+Math.sin(a)*r,2,0,Math.PI*2);c.fill();
      }
    });
  }

  function merged(parts) {
    const position=[],normal=[],uv=[];
    for(const source of parts){
      const g=source.index?source.toNonIndexed():source,p=g.attributes.position,n=g.attributes.normal,t=g.attributes.uv;
      for(let i=0;i<p.count;i++){
        position.push(p.getX(i),p.getY(i),p.getZ(i));
        normal.push(n?n.getX(i):1,n?n.getY(i):0,n?n.getZ(i):0);
        uv.push(t?t.getX(i):0,t?t.getY(i):0);
      }
      if(g!==source)g.dispose();source.dispose();
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(position,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normal,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeBoundingSphere();return g;
  }
  function torus(radius,tube,x,segments,minor=8) {
    const g=new THREE.TorusGeometry(radius,tube,minor,segments);g.rotateY(Math.PI/2);g.translate(x,0,0);return g;
  }
  function cylinder(radius,depth,x,segments,open=false) {
    const g=new THREE.CylinderGeometry(radius,radius,depth,segments,1,open);g.rotateZ(Math.PI/2);g.translate(x,0,0);return g;
  }
  function lathe(profile,segments) {
    const g=new THREE.LatheGeometry(profile.map(p=>new THREE.Vector2(p[0],p[1])),segments);g.rotateZ(Math.PI/2);return g;
  }
  function spoke(r,width,face,outward,angle,style,splitSign) {
    // A bevelled, tapered spoke. Its concave hub sits behind the outer face.
    const hub=.16*r,tip=.65*r,wa=width*.64,wb=width;
    const start=angle+(splitSign||0)*.055,end=angle+(splitSign||0)*.19;
    const points=[
      [face-outward*.105*r,Math.cos(start)*hub-Math.sin(start)*wa,Math.sin(start)*hub+Math.cos(start)*wa],
      [face-outward*.105*r,Math.cos(start)*hub+Math.sin(start)*wa,Math.sin(start)*hub-Math.cos(start)*wa],
      [face,Math.cos(end)*tip+Math.sin(end)*wb,Math.sin(end)*tip-Math.cos(end)*wb],
      [face,Math.cos(end)*tip-Math.sin(end)*wb,Math.sin(end)*tip+Math.cos(end)*wb]
    ];
    const p=[];for(const v of points)p.push(...v);for(const v of points)p.push(v[0]-outward*.045*r,v[1],v[2]);
    const idx=[0,1,2,0,2,3,4,6,5,4,7,6,0,4,5,0,5,1,1,5,6,1,6,2,2,6,7,2,7,3,3,7,4,3,4,0];
    if(outward<0)for(let i=0;i<idx.length;i+=3){const v=idx[i+1];idx[i+1]=idx[i+2];idx[i+2]=v;}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(idx);g.computeVertexNormals();return g;
  }
  function geometryPackage(id,r,w,outward,detail,withRotor) {
    const key=[id,r.toFixed(5),w.toFixed(5),outward,detail,withRotor].join('|');
    let entry=geometryCache.get(key);if(entry){entry.refs++;return entry;}
    const segments=detail===0?64:detail===1?40:24;
    const tireProfile=[[r*.62,-w*.43],[r*.67,-w*.49],[r*.82,-w*.5],[r*.94,-w*.44],[r*.988,-w*.30],[r,-w*.16],[r,w*.16],[r*.988,w*.30],[r*.94,w*.44],[r*.82,w*.5],[r*.67,w*.49],[r*.62,w*.43],[r*.62,-w*.43]];
    const geometries={tire:lathe(tireProfile,segments)};
    const face=outward*w*.435;
    const barrel=[lathe([[r*.62,-w*.42],[r*.645,-w*.38],[r*.645,w*.38],[r*.62,w*.42]],segments)];
    const machined=[torus(r*.65,r*.022,face,segments),torus(r*.62,r*.012,-outward*w*.39,segments)];
    const painted=[];
    if(id==='six-spoke')for(let i=0;i<6;i++)painted.push(spoke(r,r*.052,face,outward,i*Math.PI/3,id));
    if(id==='multi-spoke')for(let i=0;i<12;i++)painted.push(spoke(r,r*.026,face,outward,i*Math.PI/6,id));
    if(id==='mesh')for(let i=0;i<10;i++)for(const side of[-1,1])painted.push(spoke(r,r*.019,face,outward,i*Math.PI/5,id,side));
    painted.push(cylinder(r*.16,r*.055,face-outward*r*.075,segments));
    machined.push(torus(r*.15,r*.012,face-outward*r*.045,segments));
    if(detail<2){
      for(let i=0;i<5;i++){
        const a=i*Math.PI*2/5,g=cylinder(r*.023,r*.022,face-outward*r*.035,6);
        g.translate(0,Math.cos(a)*r*.11,Math.sin(a)*r*.11);machined.push(g);
      }
      // An actual tyre valve, visible in garage close views.
      const valve=cylinder(r*.012,r*.06,face+outward*r*.015,6);valve.translate(0,r*.58,0);barrel.push(valve);
      if(id==='mesh')for(let i=0;i<20;i++){
        const a=i*Math.PI/10,g=cylinder(r*.009,r*.008,face+outward*r*.012,5);g.translate(0,Math.cos(a)*r*.607,Math.sin(a)*r*.607);machined.push(g);
      }
    }
    geometries.barrel=merged(barrel);geometries.paint=merged(painted);geometries.machined=merged(machined);
    if(withRotor){
      const rotor=new THREE.RingGeometry(r*.16,r*.515,segments);rotor.rotateY(Math.PI/2);rotor.translate(face-outward*w*.43,0,0);geometries.rotor=rotor;
    }
    entry={key,geometries,refs:1};geometryCache.set(key,entry);return entry;
  }
  function release(entry){if(--entry.refs>0)return;Object.values(entry.geometries).forEach(g=>g.dispose());geometryCache.delete(entry.key);}

  function componentValue(attribute,index,axis) {
    let value=axis===0?attribute.getX(index):axis===1?attribute.getY(index):attribute.getZ(index);
    if(!attribute.normalized)return value;
    const a=attribute.isInterleavedBufferAttribute?attribute.data.array:attribute.array;
    if(a instanceof Int16Array)return Math.max(-1,value/32767);
    if(a instanceof Uint16Array)return value/65535;
    if(a instanceof Int8Array)return Math.max(-1,value/127);
    if(a instanceof Uint8Array)return value/255;
    return value;
  }
  function wheelFit(car,wheel,index) {
    car.root.updateMatrixWorld(true);
    const inverse=new THREE.Matrix4().copy(wheel.matrixWorld).invert(),bounds=new THREE.Box3(),tireBounds=new THREE.Box3(),p=new THREE.Vector3();
    const nodes=[];let hasRotor=false;
    wheel.traverse(node=>{
      if(!node.isMesh||!node.geometry?.attributes.position||node.userData.nvUpgrade)return;
      const materials=Array.isArray(node.material)?node.material:[node.material];
      const label=node.name+' '+materials.map(m=>m?.name||'').join(' ');
      const brake=/caliper|brake[ _.-]?(?:disc|disk|rotor)|castiro|disc_edge/i.test(label);
      const tire=materials.some(m=>/^(?:tire|tyre)(?:s|_|$)|pirelli|advan neova|rubber_extr/i.test(m?.name||'')||(car.modelId==='skyline'&&m?.name==='Material.010'));
      const rotor=brake&&!/caliper/i.test(label);hasRotor=hasRotor||rotor;
      nodes.push({node,visible:node.visible,brake});
      if(brake)return;
      const matrix=new THREE.Matrix4().multiplyMatrices(inverse,node.matrixWorld),position=node.geometry.attributes.position;
      const indices=node.geometry.index;
      // Read referenced vertices only; split imported meshes can retain unused accessors.
      for(let i=0;i<(indices?indices.count:position.count);i++){
        const j=indices?indices.getX(i):i;
        p.set(componentValue(position,j,0),componentValue(position,j,1),componentValue(position,j,2)).applyMatrix4(matrix);bounds.expandByPoint(p);if(tire)tireBounds.expandByPoint(p);
      }
    });
    if(bounds.isEmpty())throw new Error('Wheel geometry missing for '+car.modelId+' / '+index);
    if(!tireBounds.isEmpty())bounds.copy(tireBounds);
    const size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
    const worldCenter=car.root.worldToLocal(wheel.getWorldPosition(new THREE.Vector3()));
    const rootInverse=new THREE.Matrix4().copy(car.root.matrixWorld).invert();
    const inCar=new THREE.Matrix4().multiplyMatrices(rootInverse,wheel.matrixWorld);
    const axle=new THREE.Vector3(1,0,0).transformDirection(inCar);
    const outward=(worldCenter.x>=0?1:-1)*(axle.x>=0?1:-1);
    // Shrink by 0.4% relative to the original envelope: no new arch intersection.
    const radius=Math.min(size.y,size.z)*.498,width=Math.max(.06,Math.min(size.x*.992,radius*1.65));
    if(![radius,width,...center.toArray()].every(Number.isFinite)||radius<.07||radius>2)throw new Error('Invalid wheel fit for '+car.modelId);
    const worldScale=new THREE.Vector3().setFromMatrixScale(inCar);
    const rollingRadius=radius*Math.min(Math.abs(worldScale.y),Math.abs(worldScale.z));
    return {wheel,index,nodes,hasRotor,radius,width,center,outward,stockBounds:bounds,worldCenter,rollingRadius};
  }
  function prepare(car) {
    let state=instances.get(car);if(state)return state;
    textures();
    const fits=(car.wheels||[]).map((wheel,index)=>wheelFit(car,wheel,index));
    const materials={
      tire:new THREE.MeshStandardMaterial({name:'nv_upgrade_rubber',color:0x53585d,map:treadTexture,roughness:.92,metalness:0,bumpMap:treadTexture,bumpScale:.0018,envMapIntensity:.15}),
      paint:new THREE.MeshPhysicalMaterial({name:'nv_upgrade_rim',color:0xc7cdd4,metalness:.87,roughness:.24,clearcoat:.8,clearcoatRoughness:.12,envMapIntensity:1.12}),
      barrel:new THREE.MeshStandardMaterial({name:'nv_upgrade_barrel',color:0x323b43,metalness:.82,roughness:.33,envMapIntensity:.8,side:THREE.DoubleSide}),
      machined:new THREE.MeshStandardMaterial({name:'nv_upgrade_machined',color:0xc7d0d8,metalness:1,roughness:.18,envMapIntensity:1.2}),
      rotor:new THREE.MeshStandardMaterial({name:'nv_upgrade_brake_disc',color:0xb1b7bd,map:rotorTexture,metalness:.86,roughness:.48,side:THREE.DoubleSide})
    };
    state={car,fits,materials,packages:[],groups:[],id:'stock',color:'#c7cdd4',stockPaintReady:false,stockPaintActive:false,stockParts:[],stockMaterials:new Map(),stockGeometries:new Set()};instances.set(car,state);return state;
  }
  function stockPaintMaterial(state,original,composite=false){
    let material=state.stockMaterials.get(original);if(material)return material;
    material=original.clone();material.name='nv_stock_rim_'+original.name;
    material.userData={...material.userData,nvStockRimPaint:true};
    if(composite){
      // The Veyron paint island contains a baked orange finish. Replace that
      // albedo only on its isolated metal faces; retain its original normal map.
      material.map=null;material.metalness=.87;material.roughness=.24;
    }
    state.stockMaterials.set(original,material);return material;
  }
  function compositeVeyronRim(geometry){
    const uv=geometry.attributes.uv,index=geometry.index,position=geometry.attributes.position;
    if(!uv||!position)return null;
    const retained=[],painted=[],count=index?index.count:position.count;
    // Inspected source atlas: this isolated UV island is the rim's baked paint.
    // Sidewall/tread/disc/logo/bolt UVs are outside it. Test fixtures pin the
    // exact original triangle ranges on all four wheels, including Int16/Uint16
    // normalized attributes. A mixed-boundary triangle is conservatively kept.
    for(let i=0;i<count;i+=3){
      const triangle=[0,1,2].map(offset=>index?index.getX(i+offset):i+offset);
      const eligible=triangle.every(vertex=>{const u=componentValue(uv,vertex,0),v=componentValue(uv,vertex,1);return u>=.855&&u<=1&&v>=.212&&v<=.282;});
      (eligible?painted:retained).push(...triangle);
    }
    if(!painted.length||!retained.length)return null;
    const split=geometry.clone();split.setIndex([...retained,...painted]);split.clearGroups();
    split.addGroup(0,retained.length,0);split.addGroup(retained.length,painted.length,1);
    split.userData={...split.userData,nvStockRimPartition:{paintedTriangles:painted.length/3,retainedTriangles:retained.length/3}};
    return split;
  }
  function prepareStockPaint(state){
    if(state.stockPaintReady)return;state.stockPaintReady=true;
    const seen=new Set();
    for(const fit of state.fits)for(const item of fit.nodes){
      const node=item.node;if(seen.has(node)||item.brake)continue;seen.add(node);
      const original=node.material,materials=Array.isArray(original)?original:[original];
      if(state.car.modelId==='veyron77'&&materials.length===1&&/Wheel1A_3D_3DWheel1C_Material$/.test(materials[0]?.name||'')){
        const geometry=compositeVeyronRim(node.geometry);if(!geometry)continue;
        state.stockGeometries.add(geometry);
        state.stockParts.push({node,originalMaterial:original,originalGeometry:node.geometry,paintedGeometry:geometry,paintedMaterial:[materials[0],stockPaintMaterial(state,materials[0],true)]});
        continue;
      }
      let changed=false;
      const painted=materials.map(material=>{
        // Explicit authored rim slots (or the procedural fallback's dedicated
        // rim material); never infer paint from darkness or generic metal names.
        if(!material||(!/^rim_paint(?:_|$)/.test(material.name||'')&&material!==state.car.wheelMaterial))return material;
        changed=true;return stockPaintMaterial(state,material);
      });
      if(changed)state.stockParts.push({node,originalMaterial:original,originalGeometry:node.geometry,paintedGeometry:node.geometry,paintedMaterial:Array.isArray(original)?painted:painted[0]});
    }
  }
  function stockPaint(state,enabled,color){
    if(enabled)prepareStockPaint(state);
    for(const material of state.stockMaterials.values())material.color.set(color).convertSRGBToLinear();
    for(const part of state.stockParts){part.node.material=enabled?part.paintedMaterial:part.originalMaterial;part.node.geometry=enabled?part.paintedGeometry:part.originalGeometry;}
    state.stockPaintActive=enabled&&state.stockParts.length>0;
  }
  function clearUpgrade(state) {
    for(const group of state.groups)if(group.parent)group.parent.remove(group);
    state.groups.length=0;state.packages.forEach(release);state.packages.length=0;
    for(const fit of state.fits){delete fit.wheel.userData.nvRollingRadius;for(const item of fit.nodes)item.node.visible=item.visible;}
  }
  function apply(car,options) {
    if(!car?.root||!car.wheels?.length)return {id:'stock',compatible:false};
    options=typeof options==='string'?{rimId:options}:options||{};
    const id=validId(options.rimId||options.wheelSet||'stock');
    const existing=instances.get(car);
    const stockRimPainted=options.stockRimPainted===true;
    if(id==='stock'&&!existing&&!stockRimPainted){car.wheelCustomization={rimId:'stock',rimColor:options.rimColor||'#c7cdd4',stockRimPainted:false};return {id,compatible:true};}
    const state=existing||prepare(car),color=colorPattern.test(options.rimColor||options.wheelColor||'')?(options.rimColor||options.wheelColor):state.color;
    state.materials.paint.color.set(color).convertSRGBToLinear();state.color=color;
    stockPaint(state,id==='stock'&&stockRimPainted,color);
    if(id===state.id&&state.groups.length){car.wheelCustomization={rimId:id,rimColor:color,stockRimPainted};return {id,compatible:true};}
    clearUpgrade(state);state.id=id;
    if(id!=='stock')for(const fit of state.fits){
      for(const item of fit.nodes)if(!item.brake)item.node.visible=false;
      const group=new THREE.LOD();group.name='UVelocity '+id+' wheel '+fit.index;group.userData.nvUpgrade=true;group.position.copy(fit.center);
      for(let level=0;level<3;level++){
        const entry=geometryPackage(id,fit.radius,fit.width,fit.outward,level,!fit.hasRotor),meshGroup=new THREE.Group();state.packages.push(entry);
        for(const [role,geometry]of Object.entries(entry.geometries)){
          const mesh=new THREE.Mesh(geometry,state.materials[role]);mesh.name='Upgrade '+role;mesh.userData.nvUpgrade=true;mesh.castShadow=true;mesh.receiveShadow=true;meshGroup.add(mesh);
        }
        group.addLevel(meshGroup,[0,32,86][level]);
      }
      fit.wheel.add(group);state.groups.push(group);
      fit.wheel.userData.nvRollingRadius=fit.rollingRadius;
    }
    car.wheelCustomization={rimId:id,rimColor:color,stockRimPainted};
    return {id,compatible:true,fitments:state.fits.map(f=>({radius:f.radius,width:f.width,center:f.center.toArray(),stockPreserved:true}))};
  }
  function dispose(car) {
    const state=instances.get(car);if(!state)return;
    stockPaint(state,false,state.color);clearUpgrade(state);Object.values(state.materials).forEach(m=>m.dispose());
    state.stockMaterials.forEach(m=>m.dispose());state.stockGeometries.forEach(g=>g.dispose());instances.delete(car);
  }
  function inspect(car) {
    const state=instances.get(car);if(!state)return {rimId:'stock',stockPreserved:true,stockRimPainted:false,stockPaintActive:false};
    return {rimId:state.id,rimColor:state.color,stockPreserved:true,stockRimPainted:car.wheelCustomization?.stockRimPainted===true,stockPaintActive:state.stockPaintActive,stockPaintParts:state.stockParts.length,stockPaintMaterials:state.stockMaterials.size,stockCompositePartitions:[...state.stockGeometries].map(g=>({...g.userData.nvStockRimPartition})),fitments:state.fits.map(f=>({index:f.index,radius:f.radius,width:f.width,center:f.center.toArray(),retainedBrake:f.hasRotor,stockBounds:{min:f.stockBounds.min.toArray(),max:f.stockBounds.max.toArray()}})),geometryCacheEntries:geometryCache.size};
  }
  global.NVWheels={catalog,apply,dispose,inspect,validId};
})(window);
