/* Functional verification only. Runs the shipped game and real geometry in a DOM.
   WebGLRenderer and PMREMGenerator are replaced: no image/render quality claim. */
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const {verifyStripeSurface,verifyMaterialGroups}=require('./stripes.cjs');
const {verifyCockpitGeometry}=require('./cockpit.cjs');
const {verifyFinishFlow}=require('./finish.cjs');
const {verifyStockRimPaint,verifyOnlineStockRimPaint}=require('./stock-rim-paint.cjs');
const {verifyTouchControls}=require('./touch-controls.cjs');
const {verifyVehicleExpansion}=require('./vehicle-expansion.cjs');
const {createCanvas,loadImage}=require('@napi-rs/canvas');
const REPO=path.resolve(__dirname,'../..');
const GAME_DIR=path.join(REPO,'public/game');
const THREE={};
const threeScope={exports:THREE,module:{exports:THREE},console,Math,Date,ArrayBuffer,Uint8Array,Uint16Array,Uint32Array,Int8Array,Int16Array,Int32Array,Float32Array,Float64Array};
vm.runInNewContext(fs.readFileSync(path.join(GAME_DIR,'vendor/three.min.js'),'utf8'),threeScope,{filename:'three.min.js'});
async function main(){
 const {parseHTML}=await import('linkedom');
 const expectedAssets=JSON.parse(fs.readFileSync(path.join(__dirname,'asset-hashes.json'),'utf8'));
 for(const [relative,expected]of Object.entries(expectedAssets.files)){const actual=require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(REPO,relative))).digest('hex');assert.equal(actual,expected,'Preserved asset changed: '+relative);}
 const finishOnly=process.argv.includes('--finish-only');
 const stockPaintOnly=process.argv.includes('--stock-paint-only');
 const html=fs.readFileSync(process.argv.slice(2).find(value=>!value.startsWith('--'))||path.join(GAME_DIR,'game.html'),'utf8');
 const gameDir=GAME_DIR;
 const scripts=[...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m=>m[1].split(/[?#]/)[0]).filter(src=>!src.endsWith('game-api.js')).map(src=>fs.readFileSync(path.join(gameDir,src),'utf8'));
 const {window,document}=parseHTML(html.replace(/<script(?:\s[^>]*)?>[\s\S]*?<\/script>/gi,''));
 const errors=[],warnings=[],results=[];
 const storageMap=new Map();
 const localStorage={getItem:k=>storageMap.get(k)||null,setItem:(k,v)=>storageMap.set(k,String(v)),removeItem:k=>storageMap.delete(k),clear:()=>storageMap.clear()};
 let active=document.body,hidden=false,now=1000,rafId=0,timerId=0;
 const rafs=new Map(),timers=new Map();
 const nativeCanvases=new WeakMap();
 const getCanvas=el=>{let c=nativeCanvases.get(el);if(!c){c=createCanvas(el.width||300,el.height||150);nativeCanvases.set(el,c);}if(c.width!==(el.width||300))c.width=el.width||300;if(c.height!==(el.height||150))c.height=el.height||150;return c;};
 window.HTMLCanvasElement.prototype.getContext=function(type){return getCanvas(this).getContext(type);};
 window.HTMLCanvasElement.prototype.toDataURL=function(type){return getCanvas(this).toDataURL(type);};
 Object.defineProperty(document,'activeElement',{get:()=>active});
 Object.defineProperty(document,'hidden',{get:()=>hidden});
 Object.defineProperty(document,'visibilityState',{get:()=>hidden?'hidden':'visible'});
 window.HTMLElement.prototype.focus=function(){active=this;};
 window.HTMLElement.prototype.blur=function(){if(active===this)active=document.body;};
 window.HTMLElement.prototype.setPointerCapture=function(){};
 window.HTMLElement.prototype.releasePointerCapture=function(){};
 window.HTMLElement.prototype.hasPointerCapture=function(){return true;};
 window.HTMLElement.prototype.getBoundingClientRect=function(){const r=this.id==='garage-stage'?{x:0,y:0,width:836,height:600}:{x:0,y:0,width:836,height:600};return{...r,left:r.x,top:r.y,right:r.x+r.width,bottom:r.y+r.height};};
 // LinkeDOM does not implement the select.value setter or dialog methods.
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{get(){return this.querySelector('option[selected]')?.value||this.querySelector('option')?.value||'';},set(value){for(const option of this.querySelectorAll('option'))option.toggleAttribute('selected',option.value===String(value));},configurable:true});
 for(const d of document.querySelectorAll('dialog')){d.showModal=()=>d.setAttribute('open','');d.close=()=>d.removeAttribute('open');}
 window.innerWidth=836;window.innerHeight=600;window.devicePixelRatio=1;window.localStorage=localStorage;
 window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
 const requestAnimationFrame=fn=>{rafs.set(++rafId,fn);return rafId;};
 const cancelAnimationFrame=id=>rafs.delete(id);
 const setTimeoutVirtual=(fn,ms=0,...args)=>{timers.set(++timerId,{at:now+ms,fn:()=>fn(...args)});return timerId;};
 const clearTimeoutVirtual=id=>timers.delete(id);
 const navigator={userAgent:'Node functional harness',maxTouchPoints:0,hardwareConcurrency:4};
 const bitmap=async blob=>loadImage(Buffer.from(await blob.arrayBuffer()));
 global.createImageBitmap=bitmap;global.self={URL};Object.assign(threeScope,{createImageBitmap:bitmap,fetch,Blob,URL,self:{URL}});
 THREE.FileLoader.prototype.load=function(url,onLoad,onProgress,onError){const filename=path.join(gameDir,String(url).split(/[?#]/)[0]);fs.readFile(filename,(err,data)=>{if(err){onError?.(err);return;}const result=this.responseType==='arraybuffer'?data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength):data.toString();onLoad(result);});return null;};
 // This adapter records scene/camera state but deliberately produces no GPU image.
 class TestRenderer{
  constructor(){this.domElement=document.createElement('canvas');this.shadowMap={};this.xr={enabled:false};this.capabilities={getMaxAnisotropy:()=>8,maxTextures:16};this._color=new THREE.Color();this._alpha=1;this._viewport=new THREE.Vector4(0,0,836,600);this._scissor=this._viewport.clone();this._target=null;this._scissorTest=false;this.autoClear=true;this.renderCount=0;this.info={render:{calls:0,triangles:0},memory:{geometries:0,textures:0}};}
  setPixelRatio(r){this._pixelRatio=r;}getPixelRatio(){return this._pixelRatio||1;}
  setSize(w,h){this.domElement.width=w;this.domElement.height=h;this._size=new THREE.Vector2(w,h);}
  getSize(v){return v.copy(this._size||new THREE.Vector2(836,600));}
  getDrawingBufferSize(v){return this.getSize(v).multiplyScalar(this.getPixelRatio());}
  setClearColor(c,a=1){this._color.set(c);this._alpha=a;}getClearColor(c){return c.copy(this._color);}getClearAlpha(){return this._alpha;}
  setViewport(x,y,w,h){typeof x==='object'?this._viewport.copy(x):this._viewport.set(x,y,w,h);}getViewport(v){return v.copy(this._viewport);}
  setScissor(x,y,w,h){typeof x==='object'?this._scissor.copy(x):this._scissor.set(x,y,w,h);}getScissor(v){return v.copy(this._scissor);}
  setScissorTest(v){this._scissorTest=v;}getScissorTest(){return this._scissorTest;}
  setRenderTarget(t){this._target=t;}getRenderTarget(){return this._target;}
  render(scene,camera){scene.updateMatrixWorld();camera.updateMatrixWorld();this.lastScene=scene;this.lastCamera=camera;this.renderCount++;}
  clear(){}clearDepth(){}readRenderTargetPixels(target,x,y,w,h,pixels){pixels.fill(0);}dispose(){}
 }
 class TestPMREM{compileCubemapShader(){}compileEquirectangularShader(){}fromScene(){return{texture:new THREE.Texture(),dispose(){}};}fromCubemap(){return{texture:new THREE.Texture(),dispose(){}};}dispose(){}}
 THREE.WebGLRenderer=TestRenderer;THREE.PMREMGenerator=TestPMREM;window.THREE=THREE;
 const context={window,document,THREE,console:{log:console.log,warn:(...a)=>warnings.push(a.map(String).join(' ')),error:(...a)=>errors.push(a.map(String).join(' '))},performance:{now:()=>now},requestAnimationFrame,cancelAnimationFrame,setTimeout:setTimeoutVirtual,clearTimeout:clearTimeoutVirtual,localStorage,navigator,innerWidth:836,innerHeight:600,Image:window.Image,Blob,URL,TextDecoder,TextEncoder,fetch,createImageBitmap:bitmap,self:{URL},atob,btoa,Math,Date,ArrayBuffer,Uint8Array,Uint16Array,Uint32Array,Float32Array,Float64Array,Int8Array,Int16Array,Int32Array,CustomEvent:window.CustomEvent};
 for(const name of ['NVCarFactory','NVImportedCars','NVWheels','NVGame','NVBiomes','NVCity','NVPolice','NVStripes'])Object.defineProperty(context,name,{get:()=>window[name]});
 vm.createContext(context);
 // Verify precisely the bundled scripts; Three's UMD factory is imported above to
 // allow the renderer replacement. Everything else runs from the final HTML.
 let sourceGame='';
 for(const script of scripts){
  if(script.includes('function startNewRace()')){sourceGame=script;continue;}
  if(script.includes('Copyright')&&script.includes('REVISION'))continue;
  if(script.includes('!function')&&script.includes('REVISION'))continue;
  if(script.includes('THREE.REVISION')||script.includes('function WebGLRenderer'))continue;
  vm.runInContext(script,context,{timeout:20000});
 }
 assert.ok(sourceGame,'Final HTML must contain its game script');
 const hook=`\nwindow.__qa={get state(){return GameState},get player(){return playerCar},get racers(){return allRacers},get inputs(){return Input},get settings(){return settings},get garage(){return garageCar},get clock(){return gameClock},get worldTime(){return worldElapsed},get particles(){return particles},get ready(){return gameReady},get scene(){return scene},get garageScene(){return garageScene},get garageCamera(){return garageCamera},get workshop(){return garageWorkshop},get online(){return onlineRender},get renderer(){return renderer},get camera(){return camera},get orbit(){return garageOrbit},get imported(){return window.NVImportedCars},get audio(){return audio},lapUpdate:updateLapProgress,resetGrid:resetGridPositions,advanceClock(ms){gameClock+=ms},get samples(){return CURVE_SAMPLES},get track(){return trackPoints}};\n`;
 const end=sourceGame.lastIndexOf('})();');assert.ok(end>=0,'IIFE hook location');
 sourceGame=sourceGame.slice(0,end)+hook+sourceGame.slice(end);
 vm.runInContext(sourceGame,context,{timeout:20000});
 const tick=ms=>{now+=ms;for(const[id,t]of [...timers])if(t.at<=now){timers.delete(id);t.fn();}const queue=[...rafs.values()];rafs.clear();for(const fn of queue)fn(now);};
 const frames=(seconds,step=1/60)=>{for(let i=0;i<Math.ceil(seconds/step);i++)tick(step*1000);};
 const $=id=>document.getElementById(id);
 const emit=(node,type,props={})=>{const event=new window.Event(type,{bubbles:true,cancelable:true});for(const[key,value]of Object.entries(props))Object.defineProperty(event,key,{value,configurable:true});node.dispatchEvent(event);return event;};
 const click=selector=>{const el=selector.startsWith('#')?$(selector.slice(1)):document.querySelector(selector);assert.ok(el,'Missing '+selector);emit(el,'click');};
 const key=(code,type='keydown',target=window)=>emit(target,type,{code,key:{KeyW:'w',KeyS:'s',KeyC:'c',KeyP:'p',Escape:'Escape'}[code]||code,repeat:false});
 const assertColor=(car,hex)=>{const wanted=new THREE.Color(hex).convertSRGBToLinear();for(const m of car.paintMaterials)assert.ok(m.color.toArray().every((v,i)=>Math.abs(v-wanted.toArray()[i])<1e-6),'Recolored paint material mismatch');};
 await window.onload();
 const q=window.__qa;

 assert.equal(errors.length,0,errors.join('\n'));assert.ok(q.ready);await window.NVGame.ready;

 const workshop=q.workshop;assert.ok(workshop);assert.equal(workshop.root.name,'UVelocity Workshop');assert.ok(workshop.stats.features.includes('tool cabinets'));let workshopCalls=0,workshopTriangles=0;
 workshop.root.updateMatrixWorld(true);
 workshop.root.traverse(n=>{if(!n.isMesh)return;workshopCalls++;workshopTriangles+=(n.geometry.index?.count||n.geometry.attributes.position.count)/3;for(const value of n.geometry.attributes.position.array)assert.ok(Number.isFinite(value),'Nonfinite workshop geometry');const bounds=new THREE.Box3().setFromObject(n);if(bounds.max.y>.04&&bounds.min.y<2.4)assert.ok(bounds.max.x<=-3.1||bounds.min.x>=3.1||bounds.max.z<=-4.1||bounds.min.z>=4.1,'Workshop obstruction in central car bay: '+n.name);for(const m of Array.isArray(n.material)?n.material:[n.material]){if('roughness'in m)assert.ok(m.roughness>=0&&m.roughness<=1);if('metalness'in m)assert.ok(m.metalness>=0&&m.metalness<=1);}});
 assert.equal(workshopCalls,workshop.stats.drawCalls);assert.ok(workshopCalls<100);assert.ok(workshopTriangles<70000);
 for(const distance of[5.8,11.5,20])for(let side=0;side<8;side++){const cam=new THREE.PerspectiveCamera(33,1,.05,100);cam.position.set(Math.sin(side*Math.PI/4)*distance,2.5,Math.cos(side*Math.PI/4)*distance);cam.lookAt(0,.55,0);workshop.update(cam);assert.ok(workshop.root.children.some(c=>c.visible));}
 workshop.setQuality('low');workshop.setQuality('medium');results.push('3D workshop: '+workshopCalls+' merged draws / '+workshopTriangles+' triangles, finite PBR geometry, central 6.2 × 8.2 m bay clear, orbit visibility and quality contract.');
 assert.equal(q.racers.length,0,'Preview must not simulate an offline AI field');
 assert.ok(document.body.classList.contains('nv-embedded'));

 await window.NVGame.setCamera('front');assert.ok(Math.abs(q.orbit.yaw-.82)<.01);await window.NVGame.setCamera('side');assert.ok(Math.abs(q.orbit.yaw-Math.PI/2)<.01);await window.NVGame.setCamera('rear');assert.ok(q.orbit.yaw>Math.PI);await window.NVGame.setCamera();assert.ok(Math.abs(q.orbit.yaw-.82)<.01);
 await window.NVGame.configure({quality:'high'});await window.NVGame.configure({previewOnly:true});assert.equal(window.NVGame.getState().quality,'high');await window.NVGame.configure({quality:'medium',timeOfDay:'night'});assert.equal(window.NVGame.getState().timeOfDay,'night');await window.NVGame.configure({timeOfDay:'dusk'});
 await window.NVGame.showCredits();assert.ok($('credits-dialog').hasAttribute('open'));$('credits-dialog').close();await window.NVGame.configure({showCredits:true});assert.ok($('credits-dialog').hasAttribute('open'));$('credits-dialog').close();
 assert.equal((await window.NVGame.ensureModels(['brz','veyron77'])).length,2);await assert.rejects(window.NVGame.ensureModels(['missing-car']));
 results.push('Showroom front/side/rear/cycle, explicit-only quality changes, dusk/night, credits and asset-ready API verified.');
 verifyMaterialGroups(THREE,window.NVStripes);
 const stats=[],stripeStats=[],cockpitStats=[],stockPaintStats=[];
 const carIds=['veloce','apex','cinder','kaze','aventador','skyline','brz','veyron77','bmw-hybrid-v8','bmw-m4-gt4','amg-gt4','sls-amg-gt3','batmobile-1989','jesko-absolut','venom-f5','panther-grand-touring'];
 assert.equal(window.NVGame.getCatalog().cars.length,16);await window.NVGame.ensureModels(carIds);
 const expansion=verifyVehicleExpansion({THREE,Imported:window.NVImportedCars,metadata:window.NV_MODEL_METADATA,Audio:window.NVEngineAudio});
 results.push('Vehicle expansion: closed Regera canopy versus open Venom cockpit, distinct front body surfaces, taller Panther MPV, finite loaded source geometry and matching effect anchors; diesel waveform has a four-cylinder firing harmonic.');
 assert.equal(window.NVGame.getCatalog().stripes.length,6);
 for(const id of finishOnly||stockPaintOnly?[]:carIds){
  await window.NVGame.preview({carId:id,color:'#3366bb',finish:'metallic',rimId:'stock'});
  assert.equal(q.garage.modelId,id);assert.equal(q.garage.wheels.length,4);assert.equal(q.garage.frontPivots.length,2);
  const car=q.garage,stockNodes=[];
  assert.ok(window.NVEngineAudio.profiles[id],'Missing engine synthesis profile: '+id);assert.equal(q.audio.vehicleId,id);
  if(car.representation==='reference-recreation'){
   await window.NVGame.setCamera('side');frames(.05);q.garageCamera.updateMatrixWorld(true);
   const bb=new THREE.Box3().setFromObject(window.NVImportedCars.getTemplate(id));
   for(const x of[bb.min.x,bb.max.x])for(const y of[bb.min.y,bb.max.y])for(const z of[bb.min.z,bb.max.z]){const projected=new THREE.Vector3(x,y+.035,z).project(q.garageCamera);assert.ok(Math.abs(projected.x)<.98&&Math.abs(projected.y)<.98,'New car clipped by showroom side camera: '+id);}
   await window.NVGame.setCamera('front');frames(.05);
  }car.wheels.forEach(w=>w.traverse(n=>{if(n.isMesh)stockNodes.push([n,n.geometry,n.visible]);}));
  for(const rimId of ['six-spoke','multi-spoke','mesh']){
   await window.NVGame.setLoadout({carId:id,color:'#3366bb',finish:'metallic',rimId,rimColor:'#ad8d55'});
   assert.equal(q.garage,car);const info=window.NVWheels.inspect(car);assert.equal(info.rimId,rimId);assert.equal(info.fitments.length,4);
   car.root.updateMatrixWorld(true);
   for(const fit of info.fitments){
    const wheel=car.wheels[fit.index],upgrade=wheel.children.find(c=>c.userData.nvUpgrade);assert.ok(upgrade);assert.equal(upgrade.levels.length,3);
    const bounds=new THREE.Box3().setFromObject(upgrade);assert.ok([bounds.min.x,bounds.min.y,bounds.min.z,bounds.max.x,bounds.max.y,bounds.max.z].every(Number.isFinite));
    // Compare every generated vertex against the original local tyre envelope.
    const inv=wheel.matrixWorld.clone().invert(),p=new THREE.Vector3();let excess=0;
    upgrade.traverse(n=>{if(!n.isMesh)return;const m=inv.clone().multiply(n.matrixWorld),a=n.geometry.attributes.position;for(let i=0;i<a.count;i++){p.fromBufferAttribute(a,i).applyMatrix4(m);for(let k=0;k<3;k++)excess=Math.max(excess,fit.stockBounds.min[k]-p.getComponent(k),p.getComponent(k)-fit.stockBounds.max[k]);}});
    assert.ok(excess<.0015,id+' '+rimId+' wheel '+fit.index+' outside original envelope by '+excess);
   }
   for(const [node,geometry]of stockNodes)assert.equal(node.geometry,geometry,'Source geometry mutated');
  }
  stripeStats.push({id,patterns:verifyStripeSurface(THREE,car,window.NVStripes)});
  stats.push({id,fit:window.NVWheels.inspect(car).fitments.map(f=>({radius:f.radius,width:f.width}))});
  window.NVWheels.apply(car,{rimId:'stock'});for(const [node,geometry,visible]of stockNodes){assert.equal(node.geometry,geometry);assert.equal(node.visible,visible,'Stock visibility failed to restore');}
  assert.equal(car.wheels.flatMap(w=>w.children).filter(n=>n.userData.nvUpgrade).length,0);
  cockpitStats.push(verifyCockpitGeometry(THREE,car,window.NVCockpit));
  stockPaintStats.push(verifyStockRimPaint(THREE,car,window.NVWheels,window.NVImportedCars));
 }
 if(!finishOnly&&!stockPaintOnly){
  results.push('All sixteen cars: dedicated sound profiles, extended-model camera framing, three fitted wheel sets, finite geometry, stock envelope, original geometry and visibility restoration.');
  results.push('Five vinyl patterns on every loaded car: paint-only clipping, every vertex within 1.52 mm of its source triangle, normals, one draw, material-group exclusion and clean removal.');
  results.push('All sixteen fitted procedural cockpits including the higher right-side Panther seat: finite PBR geometry, driver seat and wheel in camera frustum, clear windshield rays at three aspect ratios, correct steering direction/clamp, source nodes untouched and owned geometry released.');
 }
 if(stockPaintOnly)for(const id of carIds){await window.NVGame.preview({carId:id,color:'#3366bb',finish:'metallic',rimId:'stock',stockRimPainted:false});stockPaintStats.push(verifyStockRimPaint(THREE,q.garage,window.NVWheels,window.NVImportedCars));}
 if(stockPaintStats.length)results.push('All sixteen stock rims: legacy factory appearance, explicit same-default RGB paint, exact Veyron triangle material isolation, no tire/brake/body/texture mutations, per-car clone isolation, custom/stock/factory restoration and owned-resource disposal.');
 const api=window.NVGame,inputs=[];api.on('input',value=>inputs.push(value));
 await api.configure({circuit:'beach',quality:'medium',online:true});await api.setLocalPlayer('me');
 await api.startRace({raceId:'test-race',config:{circuit:'beach',laps:3,bots:0},localRacerId:'me',loadouts:[{id:'me',name:'Driver',loadout:{carId:'brz',color:'#2255aa',finish:'metallic',rimId:'mesh',stripeId:'side-sweep',stripeColor:'#f4cb53',stats:{topSpeed:255,zeroTo100:5.6,handling:1.18}}},{id:'rival',name:'Rival',loadout:{carId:'veyron77',color:'#eeeeee',finish:'gloss',rimId:'six-spoke',stripeId:'heritage',stripeColor:'#235eac'}}]});
 const snapshot={raceId:'test-race',tick:1,serverTime:5000,elapsedMs:1000,startAt:4000,phase:'racing',racers:[{id:'me',name:'Driver',loadout:{carId:'brz',color:'#2255aa',finish:'metallic',rimId:'mesh',stripeId:'side-sweep',stripeColor:'#f4cb53'},x:-200,z:130,heading:1,speed:30,steerAngle:.2,driftAngle:.1,bodyRoll:.04,bodyPitch:-.02,nitro:70,nitroActive:true,lap:2,completedLaps:1,progress:1.2,finished:false,lapTimeMs:500,bestLapMs:850,position:2},{id:'rival',name:'Rival',loadout:{carId:'veyron77',color:'#eeeeee',finish:'gloss',rimId:'six-spoke',stripeId:'heritage',stripeColor:'#235eac'},x:-210,z:140,heading:1,speed:32,steerAngle:.1,nitro:30,nitroActive:false,lap:2,progress:1.3,position:1}]};
 assert.equal(api.applySnapshot(snapshot),true);assert.equal(window.NVStripes.inspect(q.player.visual).stripeId,'side-sweep');assert.equal(window.NVStripes.inspect(q.racers.find(r=>r.id==='rival').visual).color,'#235eac');const pos=q.player.pos.clone(),clock=q.clock,progress=q.player.progress;key('KeyW');frames(.1);assert.ok(q.player.pos.equals(pos),'Renderer must not integrate position');assert.equal(q.clock,clock);assert.equal(q.player.progress,progress);assert.ok(inputs.some(v=>v.throttle===1));assert.equal(q.player.visual.frontPivots[0].rotation.y,.2);assert.equal(q.player.visual.bodyTiltGroup.rotation.z,.04);assert.ok(q.player.visual.flames.every(f=>f.visible));
 q.lapUpdate(q.player,0);assert.equal(q.player.progress,progress,'Offline lap update must be gated');
 await api.setCamera('hood');frames(.03);assert.equal(q.player.visual.bodyTiltGroup.visible,false);await api.setCamera('chase');frames(.03);
 const sourceVisibility=[...q.player.visual.root.children,...q.player.visual.wheels].map(node=>[node,node.visible]);
 assert.equal(await api.setCamera('dashboard'),'interior');frames(.03);
 const cockpit=q.player.visual.cockpit;assert.ok(cockpit.root.visible);assert.equal(api.getState().camera,'interior');assert.equal($('cam-label').textContent,'Dashboard');assert.equal(q.camera.near,.025);
 assert.equal(q.player.visual.bodyTiltGroup.visible,false);assert.ok(q.player.visual.wheels.every(w=>!w.visible));assert.equal(q.racers.find(r=>r.id==='rival').visual.bodyTiltGroup.visible,true);
 const eyeInCar=q.camera.position.clone().applyMatrix4(cockpit.root.matrixWorld.clone().invert());assert.ok(eyeInCar.distanceTo(cockpit.eye)<1e-6,'Viewpoint must remain at driver eye');
 assert.ok(Math.abs(cockpit.wheel.rotation.z+1.26)<1e-8);key('KeyA');frames(.03);assert.ok(Math.abs(cockpit.wheel.rotation.z+1.26)<1e-8,'Keypress alone cannot steer the rendered wheel');key('KeyA','keyup');
 api.applySnapshot({...snapshot,racers:snapshot.racers.map(r=>r.id==='me'?{...r,steerAngle:-.3}:r)});frames(.03);assert.ok(Math.abs(cockpit.wheel.rotation.z-1.89)<1e-8,'Wheel follows supplied steering snapshot');api.applySnapshot(snapshot);frames(.03);
 await api.setCamera('chase');frames(.03);assert.equal(q.camera.near,.07);assert.equal(cockpit.root.visible,false);sourceVisibility.forEach(([node,visible])=>assert.equal(node.visible,visible,'Exterior visibility must restore exactly'));
 key('KeyC');assert.equal(api.getState().camera,'hood');key('KeyC');assert.equal(api.getState().camera,'close');key('KeyC');assert.equal(api.getState().camera,'interior');frames(.03);click('#btn-cam');frames(.03);assert.equal(api.getState().camera,'chase');assert.ok(q.camera.position.distanceTo(q.player.pos)>6,'Leaving cockpit snaps to a usable chase view');
 results.push('Dashboard camera: actual driver-eye transform, live snapshot steering rather than keyboard animation, 4-mode keyboard/touch/API cycle, near clip and exterior restoration, no hidden rival cars.');
 key('KeyR');frames(.03);assert.ok(inputs.some(v=>v.reset));assert.ok(q.player.pos.equals(pos),'Reset is only an input request');
 results.push(await verifyTouchControls({api,q,window,document,emit}));
 const renders=q.renderer.renderCount;await api.setVisible(false);frames(.5);assert.equal(q.renderer.renderCount,renders);assert.equal(api.getInput().throttle,0);await api.setVisible(true);frames(.05);assert.ok(q.renderer.renderCount>renders);

 let muteEvent=null;const unmute=api.on('mute',event=>muteEvent=event);key('KeyM');assert.equal(muteEvent.muted,api.getState().muted);key('KeyM');unmute();
 let exitRequested=false;const unexit=api.on('exit',()=>exitRequested=true);click('#btn-exit-garage');assert.ok(exitRequested);assert.equal(api.getState().active,true,'Exit request must wait for parent confirmation');assert.equal(api.getState().paused,true);await api.resume();unexit();
 const oldRival=q.racers.find(r=>r.id==='rival').visual;const changed={...snapshot,tick:2,racers:snapshot.racers.map(r=>r.id==='rival'?{...r,loadout:{...r.loadout,stripeId:'offset',stripeColor:'#f3bb24'}}:r)};assert.equal(api.applySnapshot(changed),true);const newRival=q.racers.find(r=>r.id==='rival').visual;assert.notEqual(newRival,oldRival);assert.equal(window.NVStripes.inspect(newRival).stripeId,'offset');assert.equal(window.NVStripes.inspect(newRival).color,'#f3bb24');
 const stale={...snapshot,tick:0};assert.equal(api.applySnapshot(stale),false);
 api.applySnapshot({...snapshot,tick:3,phase:'finished',elapsedMs:4000,racers:snapshot.racers.map(r=>({...r,finished:true,finishTimeMs:4000}))});frames(.05);assert.equal(q.state.mode,'FINISHED');assert.deepEqual(Object.keys(q.settings.records),[],'Renderer cannot store race rewards/results');
 await api.setCamera('interior');frames(.03);await api.stopRace();assert.equal(q.racers.length,0);assert.equal(api.getState().mode,'preview');assert.equal(cockpit.root.parent,null);assert.equal(q.camera.near,.07);assert.equal(api.getState().camera,'chase');
 results.push('Online renderer: supplied state only, normalized input, no local physics/laps/results, stock cameras/effects, visibility suspension, stale snapshot guard, clean exit.');
 // Arena loading is separate from the server countdown. Acknowledgement requires
 // an applied grid snapshot, actual scene draw, and a presentation opportunity.
 await api.startRace({raceId:'loading-barrier',startToken:'token-42',phase:'loading',config:{circuit:'beach',laps:3},localRacerId:'me',loadouts:snapshot.racers});
 await api.setCamera('interior');
 assert.equal(api.getState().phase,'loading');assert.equal(api.getState().arenaFrameReady,false);
 let frameResolved=false;const frameReady=api.waitForRaceFrame({raceId:'loading-barrier',startToken:'token-42',minimumTick:42,timeoutMs:3000}).then(frame=>{frameResolved=true;return frame;});await Promise.resolve();
 frames(.08);await Promise.resolve();assert.equal(frameResolved,false,'Asset/scene creation without a snapshot cannot acknowledge the grid');
 const loadingSnapshot={...snapshot,raceId:'loading-barrier',startToken:'token-42',tick:42,phase:'loading',startAt:null,elapsedMs:0};
 await api.setVisible(false);api.applySnapshot(loadingSnapshot);const loadingWheel=q.player.visual.wheels[0].rotation.x;frames(.1);await Promise.resolve();assert.equal(frameResolved,false,'Hidden renderer cannot acknowledge an arena frame');
 await api.setVisible(true);frames(.08);const presented=await frameReady;assert.equal(presented.raceId,'loading-barrier');assert.equal(presented.startToken,'token-42');assert.equal(presented.tick,42);assert.equal(api.getState().arenaFrameReady,true);assert.equal($('countdown-display').textContent,'MENUNGGU PEMAIN');assert.equal(q.player.visual.wheels[0].rotation.x,loadingWheel,'Loading must keep wheel motion stopped');assert.ok(q.player.visual.flames.every(f=>!f.visible));assert.equal(api.getInput().throttle,0);
 api.applySnapshot({...loadingSnapshot,tick:43,phase:'countdown',serverTime:5000,startAt:10000});frames(.05);assert.equal($('countdown-display').textContent,'5','Countdown must use the server start time, not an independent timer');
 // A room prayer pause preserves the existing scene while neutralizing every
 // drive source. A reconnected client may acknowledge its rendered paused grid.
 api.applySnapshot({...loadingSnapshot,tick:44,phase:'racing',serverTime:20000,elapsedMs:1000});key('KeyW');frames(.03);assert.equal(api.getInput().throttle,1);
 api.playEvents([{type:'collision',racerId:'me',intensity:.5}]);assert.ok(q.particles.length>0);
 const retainedCars=q.racers.map(r=>r.visual),retainedScene=q.scene,pausedPos=q.player.pos.clone(),pausedWheel=q.player.visual.wheels[0].rotation.x,pausedWorldTime=q.worldTime,pausedParticle=q.particles[0],particlePosition=pausedParticle.mesh.position.clone(),particleLife=pausedParticle.life;
 const prayerPause={pauseToken:'room-prayer-1',startedAt:20000,resumeEligibleAt:920000,resumeAt:null,previousPhase:'racing',triggers:[],requiredIds:['me','rival'],readyIds:[]};
 emit($('t-gas'),'pointerdown',{pointerId:201,pointerType:'touch',button:0});emit($('t-left'),'pointerdown',{pointerId:202,pointerType:'touch',button:0});
 api.applySnapshot({...loadingSnapshot,tick:45,phase:'prayer_pause',serverTime:20000,elapsedMs:1000,prayerPause});
 assert.equal(q.inputs.up,false,'Entering prayer clears held keys');assert.equal(api.getInput().throttle,0);assert.equal(q.audio.state.active,false);
 assert.equal(q.inputs.left,false,'Prayer clears a held steering finger');assert.equal($('t-gas').getAttribute('aria-pressed'),'false');assert.equal($('t-left').classList.contains('active'),false);
 const prayerCockpit=q.player.visual.cockpit,prayerWheelAngle=prayerCockpit.wheel.rotation.z,prayerEye=q.camera.position.clone();
 key('KeyC');click('#btn-cam');assert.equal(await api.setCamera('chase'),'interior','All camera controls stay locked during room prayer');
 key('KeyW');key('KeyR');key('KeyP');api.setInput({throttle:1,nitro:true,reset:true});api.playEvents([{type:'collision',racerId:'me',intensity:1}]);
 emit($('t-gas'),'pointerdown',{pointerId:203,pointerType:'touch',button:0});assert.equal($('t-gas').getAttribute('aria-pressed'),'false','Prayer blocks fresh touch input');
 const pausedFrame=api.waitForRaceFrame({raceId:'loading-barrier',startToken:'token-42',minimumTick:45,timeoutMs:3000});await Promise.resolve();frames(1);const pausedPresented=await pausedFrame;
 assert.equal(pausedPresented.tick,45);assert.equal($('countdown-display').textContent,'JEDA SALAT');assert.equal(q.player.visual.wheels[0].rotation.x,pausedWheel);assert.equal(q.worldTime,pausedWorldTime);assert.equal(pausedParticle.life,particleLife);assert.ok(pausedParticle.mesh.position.equals(particlePosition));assert.equal(q.audio.state.active,false);assert.ok(q.player.visual.flames.every(f=>!f.visible));assert.ok(q.player.pos.equals(pausedPos));assert.equal(q.clock,1000);assert.equal(q.inputs.up,false);assert.equal(q.online.resetRequested,false);assert.equal(q.online.paused,false);assert.equal(q.online.externalInput,null);
 assert.strictEqual(q.scene,retainedScene);q.racers.forEach((r,i)=>assert.strictEqual(r.visual,retainedCars[i],'Prayer cannot rebuild/dispose the car roster'));
 assert.strictEqual(q.player.visual.cockpit,prayerCockpit);assert.equal(prayerCockpit.wheel.rotation.z,prayerWheelAngle);assert.ok(q.camera.position.distanceTo(prayerEye)<1e-9,'Dashboard view remains still during prayer');
 api.applySnapshot({...loadingSnapshot,tick:46,phase:'resume_countdown',serverTime:920000,elapsedMs:1000,prayerPause:{...prayerPause,resumeAt:923000,readyIds:['me','rival']}});
 const resumeFrame=api.waitForRaceFrame({raceId:'loading-barrier',startToken:'token-42',minimumTick:46,timeoutMs:3000});await Promise.resolve();frames(.08);assert.equal((await resumeFrame).tick,46);assert.equal($('countdown-display').textContent,'3');assert.equal(api.getInput().throttle,0);assert.equal(q.player.visual.wheels[0].rotation.x,pausedWheel);
 api.applySnapshot({...loadingSnapshot,tick:47,phase:'racing',serverTime:923000,elapsedMs:1000,prayerPause:null});assert.equal(api.getInput().throttle,0,'Held inputs from prayer cannot reappear on resume');key('KeyW');frames(.03);assert.equal(api.getInput().throttle,1);assert.ok(q.player.visual.wheels[0].rotation.x!==pausedWheel);assert.ok(q.worldTime>pausedWorldTime);assert.equal(q.audio.state.active,true);assert.strictEqual(q.player.visual,retainedCars[0]);key('KeyW','keyup');
 results.push('Room prayer pause: held/external/reset inputs cleared and blocked, wheels/particles/world animation and driving audio frozen, scene/model identity retained, paused and resume-countdown frame barriers valid, server-only resume and fresh-input restart.');
 const cancelledFrame=api.waitForRaceFrame({raceId:'loading-barrier',minimumTick:99,timeoutMs:3000});const cancelledFrameCheck=assert.rejects(cancelledFrame,{name:'AbortError'});await Promise.resolve();await api.stopRace();await cancelledFrameCheck;
 // A cancelled slow GLB await must never reopen the old race after leaving.
 const realLoad=window.NVImportedCars.load;let finishSlowAsset;
 window.NVImportedCars.load=id=>id==='brz'?new Promise(resolve=>{finishSlowAsset=()=>resolve(window.NVImportedCars.getTemplate(id));}):realLoad(id);
 const slowStart=api.startRace({raceId:'cancelled-slow-start',startToken:'old-token',config:{circuit:'beach'},localRacerId:'me',loadouts:[{id:'me',loadout:{carId:'brz'}}]});const slowStartCheck=assert.rejects(slowStart,{name:'AbortError'});await Promise.resolve();assert.equal(typeof finishSlowAsset,'function');assert.equal(api.getState().preparing,true);await api.stopRace();finishSlowAsset();await slowStartCheck;window.NVImportedCars.load=realLoad;assert.equal(api.getState().active,false);assert.equal(q.racers.length,0);
 results.push('Loading barrier: no ack without applied snapshot or visible scene frame, server-only countdown, motion stopped while loading, frame wait aborted on exit, stale slow model completion cannot reopen arena.');
 results.push(await verifyFinishFlow({THREE,api,q,frames,key,$}));
 if(!finishOnly)results.push(await verifyOnlineStockRimPaint({api,q,frames,Wheels:window.NVWheels}));

 await api.configure({circuit:'glacier',previewOnly:true});assert.equal(q.settings.circuit,'glacier');frames(.05);await api.configure({circuit:'city',previewOnly:true});assert.equal(q.settings.circuit,'city');frames(.05);
 results.push('All three existing worlds switch through the public API.');
 assert.equal(errors.length,0,errors.join('\n'));
 results.unshift('SHA-256 integrity of sixteen GLBs: thirteen preserved sources, two reviewed hypercar revisions, one new Panther, and unchanged city/biome/police/fallback modules.');
 console.log(JSON.stringify({verification:'CPU geometry + real Canvas 2D + DOM; no WebGL/GPU rendering',passed:results,expansion,fittedModels:stats.map(item=>item.id),cockpits:cockpitStats,stockRimPaint:stockPaintStats,stripes:stripeStats,warnings:warnings.slice(0,12),errors},null,2));api.dispose();
}
main().catch(error=>{console.error(error);process.exitCode=1;});
