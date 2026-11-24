/* NEON VELOCITY: offline car model adapter.
 * Meshes and textures by tevy.dev, CC0 1.0.
 * Mid-Engine Supercar v2, Muscle Car v1, Classic 1970s Coupe v1, Rally Car v1.
 * Lamborghini Aventador by BlackCube and Nissan Skyline R34 GT-R by Lexyc16,
 * both CC-BY-4.0. Attribution and modification details are included in credits.
 * Subaru BRZ 2022 by mixmamo.studio (via the attributed Ridgeline conversion)
 * and Bugatti Veyron Super Sport 2011 by Galaxy Car Showroom, CC-BY-4.0.
 * Expansion GLBs are original reference-based UVelocity recreations.
 * They are not manufacturer meshes, scans or replacements for the eight sources.
 * Assets decoded and texture resolutions optimized for this browser game.
 */
(function () {
  'use strict';
  const templates = Object.create(null);
  const promises = Object.create(null);
  const metadata = {
    veloce: {source: 'supercar', length: 4.6, wheelRadius: .343, tail: -2.22, exhaustX: .37, exhaustY:.35},
    apex: {source: 'classic-coupe', length: 4.65, wheelRadius: .305, tail: -2.34, exhaustX: .48, exhaustY:.25},
    cinder: {source: 'muscle-car', length: 4.9, wheelRadius: .33, tail: -2.42, exhaustX:.55, exhaustY:.25},
    kaze: {source: 'rally-car', length: 4.05, wheelRadius:.315, tail:-2.0, exhaustX:.39, exhaustY:.28},
    aventador: {source:'Lamborghini Aventador — BlackCube',length:4.78,wheelRadius:.325,tail:-2.24,exhaustX:.23,exhaustY:.51},
    skyline: {source:'Nissan Skyline R34 GT-R — Lexyc16',length:4.60,wheelRadius:.324,tail:-2.22,exhaustX:.49,exhaustY:.27},
    brz: {source:'Subaru BRZ 2022 — mixmamo.studio',length:4.27,wheelRadius:.300,tail:-2.10,exhaustX:.63,exhaustY:.27},
    veyron77: {source:'Bugatti Veyron Super Sport 2011 — Galaxy Car Showroom',length:4.50,wheelRadius:.353,tail:-2.20,exhaustX:.20,exhaustY:.32,police:true}
  };
  Object.assign(metadata,window.NV_MODEL_METADATA||{});
  let shadowTexture;

  function bytesFromBase64(base64) {
    const raw=atob(base64), bytes=new Uint8Array(raw.length);
    for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
    return bytes.buffer;
  }

  function load(id) {
    if (templates[id]) return Promise.resolve(templates[id]);
    if (promises[id]) return promises[id];
    const url = (window.NV_MODEL_URLS || {})[id];
    const data = (window.NV_MODELS_B64 || {})[id];
    if (!url && !data) return Promise.reject(new Error('Model data unavailable: '+id));
    promises[id] = new Promise((resolve,reject) => {
      const loader = new THREE.GLTFLoader();
      const complete = gltf => {
        const template = gltf.scene;
        template.updateMatrixWorld(true);
        template.userData.dimensions = new THREE.Box3().setFromObject(template).getSize(new THREE.Vector3()).toArray();
        templates[id] = template;
        resolve(template);
      };
      const failed = error => { delete promises[id]; reject(error); };
      if (url) loader.load(url, complete, undefined, failed);
      else loader.parse(bytesFromBase64(data), '', complete, failed);
    });
    return promises[id];
  }

  function loadAll(onProgress) {
    const ids = Object.keys(metadata);
    let complete = 0;
    return Promise.allSettled(ids.map(id => load(id).then(template => {
      complete++;
      if(onProgress)onProgress(complete,ids.length,id);
      return template;
    })));
  }

  function getShadowTexture() {
    if(shadowTexture)return shadowTexture;
    const canvas=document.createElement('canvas');canvas.width=128;canvas.height=256;
    const context=canvas.getContext('2d');
    const gradient=context.createRadialGradient(64,128,4,64,128,88);
    gradient.addColorStop(0,'rgba(0,0,0,.58)');gradient.addColorStop(.55,'rgba(0,0,0,.4)');gradient.addColorStop(1,'rgba(0,0,0,0)');
    context.save();context.translate(64,128);context.scale(.66,1.28);context.translate(-64,-128);
    context.fillStyle=gradient;context.fillRect(-64,-128,256,512);context.restore();
    shadowTexture=new THREE.CanvasTexture(canvas);
    return shadowTexture;
  }

  function create(id, colorHex, opts) {
    opts=opts||{};
    if(!templates[id])return null;
    const meta=metadata[id];
    const root=new THREE.Group();root.name='nv-'+id;
    const bodyTiltGroup=new THREE.Group();bodyTiltGroup.name='body-tilt';root.add(bodyTiltGroup);
    const model=templates[id].clone(true);bodyTiltGroup.add(model);
    const paintMaterials=[],rimMaterials=[],glassMaterials=[],scannerMaterials=[],ownMaterials=[],ownGeometries=[],ownTextures=[];
    const materialMap=new Map();
    const brakeMat=new THREE.MeshBasicMaterial({color:0xb02330,toneMapped:false});
    ownMaterials.push(brakeMat);
    function instanceMaterial(original) {
      if(materialMap.has(original))return materialMap.get(original);
      const name=original.name||'';
      let material;
      if(/^light_rear/.test(name)||(id==='batmobile-tumbler'&&name==='tumbler_rear_markers')){
        material=brakeMat;
        if(original.map){brakeMat.map=original.map;brakeMat.needsUpdate=true;}
      }
      else {
        material=original.clone();ownMaterials.push(material);
        material.envMapIntensity=/chrome|mirror|rim_machined/i.test(name)?1.25:1.05;
        if(/^paint(?:_|$)/.test(name))paintMaterials.push(material);
        if(/^rim_paint/.test(name))rimMaterials.push(material);
        const scannerCell=/^kitt_scanner_(\d+)$/.exec(name);
        if(scannerCell){scannerMaterials[Number(scannerCell[1])]=material;material.toneMapped=false;}
        if(/^glass(?:_clear)?$/.test(name)) {
          // Keep interior visible while preserving readable reflective windows.
          material.transmission=.38;
          material.opacity=.88;
          material.transparent=true;
          material.depthWrite=false;
          material.roughness=.07;
          glassMaterials.push(material);
        }
        if(/^light_front|^light_drl/.test(name)) {
          material.emissive.setHex(0xd8eeff);
          material.emissiveIntensity=1.45;
          material.toneMapped=false;
        }
        if(material.normalMap)material.normalScale.set(.5,.5);
      }
      materialMap.set(original,material);return material;
    }
    model.traverse(node => {
      if(!node.isMesh)return;
      node.material=Array.isArray(node.material)?node.material.map(instanceMaterial):instanceMaterial(node.material);
      node.castShadow=true;node.receiveShadow=true;
      node.frustumCulled=true;
    });
    root.updateMatrixWorld(true);
    const wheels=[],frontPivots=[];
    for(const side of ['FL','FR']) {
      const pivot=model.getObjectByName('steer_'+side);
      const wheel=model.getObjectByName('wheel_'+side);
      if(pivot){root.attach(pivot);frontPivots.push(pivot);}
      if(wheel){
        if(meta.wheelRadii?.[side])wheel.userData.nvStockRollingRadius=meta.wheelRadii[side];
        wheels.push(wheel);
      }
    }
    // Capture all rear groups before reparenting their axle. A dual rear axle
    // retains two independently fitted, spinning tyres on each side.
    const rearWheels=['RL','RR',...(meta.dualRearWheels?['RL_inner','RR_inner']:[])].map(side=>({side,wheel:model.getObjectByName('wheel_'+side)}));
    for(const {side,wheel} of rearWheels) {
      if(wheel){
        // The authored expansion rigs keep fixed rear calipers on their axle.
        // Preserve that assembly independently from visual body roll.
        if(meta.representation==='reference-recreation'&&/^axle_(?:RL|RR)$/.test(wheel.parent?.name||'')){
          if(wheel.parent.parent!==root)root.attach(wheel.parent);
        }
        else root.attach(wheel);
        if(meta.wheelRadii?.[side])wheel.userData.nvStockRollingRadius=meta.wheelRadii[side];
        wheels.push(wheel);
      }
    }
    const shadowGeo=new THREE.PlaneGeometry(Math.max(2.7,templates[id].userData.dimensions[0]+.25),meta.length+1.0);
    const shadowMat=new THREE.MeshBasicMaterial({map:getShadowTexture(),transparent:true,opacity:.67,depthWrite:false,toneMapped:false});
    const shadow=new THREE.Mesh(shadowGeo,shadowMat);shadow.rotation.x=-Math.PI/2;shadow.position.y=.025;shadow.renderOrder=1;
    root.add(shadow);ownGeometries.push(shadowGeo);ownMaterials.push(shadowMat);
    const flameGeo=new THREE.ConeGeometry(.115,1.2,12);flameGeo.rotateX(-Math.PI/2);
    const flameMat=new THREE.MeshBasicMaterial({color:0x49caff,transparent:true,opacity:.82,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
    ownGeometries.push(flameGeo);ownMaterials.push(flameMat);
    const exhausts=meta.exhaustPositions||[-1,1].map(sign=>[sign*meta.exhaustX,meta.exhaustY,meta.tail]);
    const flames=exhausts.map(position=>{
      const flame=new THREE.Mesh(flameGeo,flameMat);
      flame.position.set(position[0],position[1],position[2]-.48);flame.visible=false;
      bodyTiltGroup.add(flame);return flame;
    });
    const car={root,bodyTiltGroup,wheels,frontPivots,brakeMat,flames,flameMat,paintMaterials,rimMaterials,glassMaterials,scannerMaterials,animatedEffects:scannerMaterials.length>0||id==='veyron77',modelId:id,wheelRadius:meta.wheelRadius,imported:true,ownMaterials,ownGeometries,ownTextures,source:meta.source,representation:meta.representation||'imported-model',headlightPositions:meta.headlightPositions||null,dimensions:templates[id].userData.dimensions.slice()};
    recolor(car,colorHex,opts.finish||meta.defaultFinish||'gloss');
    if(scannerMaterials.length)updateEffects(car,0);
    if(opts.rimColor)rimMaterials.forEach(m=>m.color.set(opts.rimColor).convertSRGBToLinear());
    if(meta.police&&window.NVPolice&&typeof window.NVPolice.decorate==='function')window.NVPolice.decorate(car,opts);
    return car;
  }

  // timeSeconds is elapsed animation time in seconds; safe for every car model.
  function updateEffects(car,timeSeconds) {
    if(car&&car.modelId==='veyron77'&&window.NVPolice&&typeof window.NVPolice.updateEffects==='function')window.NVPolice.updateEffects(car,timeSeconds);
    const cells=car?.scannerMaterials;
    if(cells?.length){
      // Only per-instance emissive values change: no lights, timers, geometry,
      // or material allocation in the animation loop. A triangular sweep also
      // behaves deterministically after pause/resume and on remote vehicles.
      const time=Number.isFinite(timeSeconds)?timeSeconds:0,phase=((time*1.15)%2+2)%2;
      const head=(phase<=1?phase:2-phase)*(cells.length-1);
      cells.forEach((material,index)=>{material.emissiveIntensity=.10+3.2*Math.exp(-((index-head)**2)/.78);});
    }
  }

  function recolor(car,colorHex,finish) {
    if(!car)return;
    finish=finish||'gloss';
    for(const material of car.paintMaterials||[]) {
      material.color.set(colorHex).convertSRGBToLinear();
      material.metalness=finish==='metallic'?.78:finish==='matte'?.15:.38;
      material.roughness=finish==='matte'?.6:finish==='metallic'?.28:.22;
      if('clearcoat' in material){material.clearcoat=finish==='matte'?.05:1;material.clearcoatRoughness=finish==='matte'?.6:.08;}
      material.needsUpdate=true;
    }
  }

  function dispose(car) {
    if(!car)return;
    if(car.root.parent)car.root.parent.remove(car.root);
    for(const material of new Set(car.ownMaterials||[]))material.dispose();
    for(const geometry of new Set(car.ownGeometries||[]))geometry.dispose();
    for(const texture of new Set(car.ownTextures||[]))texture.dispose();
    // Imported geometry/textures are shared across cached templates and instances.
    car.root.clear();
  }

  window.NVImportedCars={load,loadAll,create,recolor,updateEffects,dispose,metadata,isLoaded:id=>!!templates[id],getTemplate:id=>templates[id]||null};
})();
