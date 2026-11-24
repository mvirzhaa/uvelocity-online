
    (function () {
      'use strict';
      const onlineRender={enabled:true,active:false,preparing:false,visible:true,paused:false,previewOnly:true,localId:'',raceId:null,startToken:null,generation:0,phase:'waiting',snapshot:null,receivedAt:0,inputElapsed:0,lastInput:'',externalInput:null,resetRequested:false,previewLoadout:null,disposed:false,frameRequest:0,presentationRequest:0,presentedFrame:null};
      const raceFrameWaiters=new Set();
      // Three circuits and an open2000m drag strip. Race distance is captured at the grid.
      const CIRCUITS=[
        {id:'city',name:'Neon City',short:'NEON CITY',subtitle:'KOTA',tag:'Boulevard & arsitektur',description:'Gedung kaca, apartemen, dan boulevard kota dengan tikungan teknis.',feature:'136 bangunan · 10 jenis arsitektur',accent:'#f47c46',points:[[0,0],[0,-140],[35,-245],[145,-270],[245,-205],[265,-90],[195,-10],[235,95],[195,200],[85,225],[-45,195],[-95,115],[-55,45],[-12,18]]},
        {id:'beach',name:'Azure Coast',short:'AZURE COAST',subtitle:'PANTAI',tag:'Garis pantai & kelapa',description:'Lintasan pesisir yang mengalir, pasir terang, ombak laut, dan pohon kelapa.',feature:'Laut berombak · pesisir tropis',accent:'#57d6cb',points:[[-210,130],[-245,-60],[-230,-235],[-120,-305],[70,-295],[205,-220],[250,-70],[170,35],[245,160],[180,285],[25,320],[-120,260]]},
        {id:'glacier',name:'Frostpeak Pass',short:'FROSTPEAK PASS',subtitle:'GUNUNG ES',tag:'Puncak salju & danau es',description:'Rangkaian tikungan di antara pegunungan bersalju, tebing batu, dan danau es.',feature:'Pegunungan salju · lanskap es',accent:'#a3c9ff',points:[[-35,250],[-180,205],[-245,65],[-235,-100],[-120,-190],[20,-165],[145,-250],[280,-210],[300,-70],[200,20],[240,150],[140,250]]},
        {id:'drag-2km',name:'Drag Strip 2 KM',short:'DRAG 2 KM',subtitle:'DRAG',tag:'Lurus · sekali jalan',description:'Adu akselerasi 2.000 meter dari garis START ke FINISH. Semua peserta memulai sejajar, dilanjutkan zona pengereman 700 meter.',feature:'2 km lurus · start sejajar · sekali jalan',accent:'#32d5e4',open:true,roadHalf:22.5,points:[[0,0],[0,-2000]]}
      ];
      const LAP_MIN=1,LAP_MAX=20;
      let circuitRoot=null,activeCircuitId=null,worldElapsed=0;
      function currentCircuit(){return CIRCUITS.find(c=>c.id===settings.circuit)||CIRCUITS[0];}
      function normalizeLaps(value,fallback=3){if(value==null||typeof value==='boolean')return fallback;const n=Number(value);return Number.isFinite(n)&&String(value).trim()!==''?Math.max(LAP_MIN,Math.min(LAP_MAX,Math.round(n))):fallback;}
      function makeCircuitCurve(spec){if(spec.open){const curve=new THREE.LineCurve3(new THREE.Vector3(0,0,0),new THREE.Vector3(0,0,-2000));curve.getPointAt=(t,target=new THREE.Vector3())=>target.set(0,0,-2000*t);curve.getTangentAt=(t,target=new THREE.Vector3())=>target.set(0,0,-1);return curve;}const curve=new THREE.CatmullRomCurve3(spec.points.map(([x,z])=>new THREE.Vector3(x,0,z)),true,'centripetal');curve.arcLengthDivisions=4000;curve.updateArcLengths();return curve;}
      function circuitOutline(spec){
        const curve=makeCircuitCurve(spec),points=curve.getSpacedPoints(100),box=new THREE.Box3().setFromPoints(points),size=box.getSize(new THREE.Vector3());
        const scale=Math.min(100/size.x,64/size.z),cx=(box.min.x+box.max.x)/2,cz=(box.min.z+box.max.z)/2;
        const mapped=points.map(p=>[(60+(p.x-cx)*scale).toFixed(1),(41+(p.z-cz)*scale).toFixed(1)]);
        return {d:mapped.map((p,i)=>(i?'L':'M')+p.join(' ')).join(' ')+(spec.open?'':' Z'),start:mapped[0],length:curve.getLength()};
      }
      function disposeOwnedGraph(root){
        if(!root)return;
        const geometries=new Set(),materials=new Set(),textures=new Set();
        root.traverse(n=>{if(n.geometry)geometries.add(n.geometry);if(n.material)for(const m of Array.isArray(n.material)?n.material:[n.material])materials.add(m);if(n.shadow?.map)n.shadow.map.dispose();});
        for(const m of materials){for(const v of Object.values(m))if(v?.isTexture)textures.add(v);for(const u of Object.values(m.uniforms||{}))if(u?.value?.isTexture)textures.add(u.value);}
        geometries.forEach(g=>g.dispose());textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());if(root.parent)root.parent.remove(root);root.clear();
      }
      function disposeCircuitWorld(){
        if(cityWorld){if(cityWorld.root?.parent)cityWorld.root.parent.remove(cityWorld.root);cityWorld.dispose?.();cityWorld=null;}
        disposeOwnedGraph(circuitRoot);circuitRoot=null;roadSurface=null;
        streetLampRoot=null;streetLampData=[];streetLightPool=null;nearStreetLights=[];streetLightTick=1000;
        if(cityEnvTarget){cityEnvTarget.dispose();cityEnvTarget=null;}
        if(scene)scene.environment=sharedEnv;
        activeCircuitId=null;
      }
      function buildCircuitWorld(){
        disposeCircuitWorld();
        const spec=currentCircuit(),before=new Set(scene.children);
        trackCurve=makeCircuitCurve(spec);trackTotalLength=trackCurve.getLength();
        trackPoints=[];trackTangents=[];trackNormals=[];
        let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
        for(let i=0;i<CURVE_SAMPLES;i++){
          const fraction=i/(spec.open?CURVE_SAMPLES-1:CURVE_SAMPLES),p=trackCurve.getPointAt(fraction),t=trackCurve.getTangentAt(fraction).normalize(),n=new THREE.Vector3(-t.z,0,t.x).normalize();
          trackPoints.push(p);trackTangents.push(t);trackNormals.push(n);
          minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minZ=Math.min(minZ,p.z);maxZ=Math.max(maxZ,p.z);
        }
        minimapBounds={minX:minX-25,maxX:maxX+25,minZ:minZ-25,maxZ:maxZ+25};
        if(spec.open){
          cityWorld=window.NVDragStrip.build({THREE,scene});roadSurface=cityWorld.roadSurface;
        }else{
          if(spec.id==='city')createGroundPlane();
          buildDetailedRoad();
          const kerbTex=makeKerbTexture();kerbTex.repeat.set(1,1);
          buildEdgeStripMesh(ROAD_HALF,ROAD_HALF+1.15,.14,kerbTex,true);buildEdgeStripMesh(-ROAD_HALF-1.15,-ROAD_HALF,.14,kerbTex,true);
          buildDetailedBarrier(ROAD_HALF+1.35);buildDetailedBarrier(-ROAD_HALF-1.35);buildStartFinishGate();buildCityStreetLights();
          const opts={THREE,scene,trackPoints,trackTangents,trackNormals,roadHalf:ROAD_HALF,trackLength:trackTotalLength,samples:CURVE_SAMPLES};
          cityWorld=spec.id==='city'?NVCity.build(opts):NVBiomes.build({...opts,biome:spec.id});
        }
        cityWorld.setQuality?.(settings.quality);
        circuitRoot=new THREE.Group();circuitRoot.name='Circuit World';circuitRoot.userData.circuitId=spec.id;
        for(const child of [...scene.children])if(!before.has(child))circuitRoot.add(child);
        scene.add(circuitRoot);activeCircuitId=spec.id;worldElapsed=0;tourCameraReady=false;
        updateCircuitUI();
      }
      function switchCircuit(id){
        if(GameState.mode!=='MENU'||!gameReady||!CIRCUITS.some(c=>c.id===id))return;
        if(id===activeCircuitId){updateCircuitUI();return;}
        clearInput();settings.circuit=id;if(currentCircuit().open)settings.laps=1;gameReady=false;DOM.btnStart.disabled=true;
        for(const racer of allRacers)disposeVehicle(racer.visual);allRacers=[];aiCars=[];playerCar=null;headLights=[];
        for(const p of particles){scene.remove(p.mesh);p.mesh.material.dispose();}particles.length=0;
        try{
          buildCircuitWorld();applyTimeOfDay(false);updateStreetLights(1000,trackPoints[0]);captureCityReflections();createRacers();
          applyQuality();persistSettings();garageNeedsRender=true;gameReady=true;DOM.btnStart.disabled=false;
        }catch(error){console.error('Sirkuit tidak dapat dimuat:',error);$('error-message').textContent='Sirkuit tidak dapat dimuat. Klik Coba lagi. '+error.message;$('error-screen').classList.remove('hidden');}
      }
      function setRaceLaps(value){
        if(GameState.mode!=='MENU')return;
        settings.laps=currentCircuit().open?1:normalizeLaps(value,settings.laps);updateCircuitUI();persistSettings();
      }
      function updateCircuitUI(){
        const spec=currentCircuit(),length=activeCircuitId===spec.id?trackTotalLength:makeCircuitCurve(spec).getLength();
        for(const b of document.querySelectorAll('[data-circuit]')){const selected=b.dataset.circuit===spec.id;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));}
        if($('lap-count'))$('lap-count').value=settings.laps;
        if($('lap-count'))$('lap-count').disabled=!!spec.open;
        if($('bot-count'))$('bot-count').value=settings.bots;
        if($('bot-decrease'))$('bot-decrease').disabled=settings.bots<=BOT_MIN;
        if($('bot-increase'))$('bot-increase').disabled=settings.bots>=BOT_MAX;
        for(const b of document.querySelectorAll('[data-bots]')){const selected=Number(b.dataset.bots)===settings.bots;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));}
        if($('lap-decrease'))$('lap-decrease').disabled=!!spec.open||settings.laps<=LAP_MIN;
        if($('lap-increase'))$('lap-increase').disabled=!!spec.open||settings.laps>=LAP_MAX;
        for(const b of document.querySelectorAll('[data-laps]')){const selected=Number(b.dataset.laps)===settings.laps;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));b.disabled=!!spec.open;}
        const text=(id,value)=>{if($(id))$(id).textContent=value;};
        text('ticket-track',spec.short);text('ticket-laps',spec.open?'Sekali jalan':settings.laps+' lap');text('race-distance',(length*(spec.open?1:settings.laps)/1000).toFixed(2)+' km total');
        text('ticket-bots',settings.bots?settings.bots+' rival AI':'Latihan solo');text('race-field-summary',settings.bots?settings.bots+1+' peserta termasuk Anda':'Lintasan untuk Anda sendiri');
        if(DOM.btnStart?.querySelector('span'))DOM.btnStart.querySelector('span').textContent=settings.bots?'MULAI BALAPAN':'MULAI LATIHAN';
        text('circuit-description',spec.description);text('hud-track-name',spec.short);text('tour-title',spec.short);text('tour-description',spec.description);
        text('tour-buildings',spec.feature);text('tour-length',(length/1000).toFixed(2)+(spec.open?' km sekali jalan':' km per lap'));text('selected-circuit-name',spec.name);
        const path=circuitOutline(spec);if($('ticket-map-path'))$('ticket-map-path').setAttribute('d',path.d);
        if($('ticket-map-start')){$('ticket-map-start').setAttribute('cx',path.start[0]);$('ticket-map-start').setAttribute('cy',path.start[1]);}
      }
      function bindWorldControls(){
        $('circuit-cards').innerHTML=CIRCUITS.map((c,i)=>{const outline=circuitOutline(c);return `<button class="circuit-card circuit-${c.id}" data-circuit="${c.id}" aria-pressed="false" style="--circuit-accent:${c.accent}"><span class="circuit-index">0${i+1} / ${c.subtitle}</span><svg viewBox="0 0 120 82" fill="none" aria-hidden="true"><path class="course-shadow" d="${outline.d}"/><path class="course-line" d="${outline.d}"/><circle cx="${outline.start[0]}" cy="${outline.start[1]}" r="3"/></svg><span class="circuit-card-bottom"><b>${c.name}</b><small>${(outline.length/1000).toFixed(2)} km ${c.open?'sekali jalan':'/ lap'}</small></span><span class="circuit-check">✓</span></button>`;}).join('');
        document.querySelectorAll('[data-circuit]').forEach(b=>b.addEventListener('click',()=>switchCircuit(b.dataset.circuit)));
        $('lap-count').addEventListener('change',e=>setRaceLaps(e.target.value));
        $('lap-count').addEventListener('keydown',e=>{if(e.key==='Enter'){setRaceLaps(e.target.value);e.target.blur();}});
        $('lap-decrease').addEventListener('click',()=>setRaceLaps(settings.laps-1));$('lap-increase').addEventListener('click',()=>setRaceLaps(settings.laps+1));
        document.querySelectorAll('[data-laps]').forEach(b=>b.addEventListener('click',()=>setRaceLaps(b.dataset.laps)));
        $('bot-count').addEventListener('change',e=>setRaceBots(e.target.value));
        $('bot-count').addEventListener('keydown',e=>{if(e.key==='Enter'){setRaceBots(e.target.value);e.target.blur();}});
        $('bot-decrease').addEventListener('click',()=>setRaceBots(settings.bots-1));$('bot-increase').addEventListener('click',()=>setRaceBots(settings.bots+1));
        document.querySelectorAll('[data-bots]').forEach(b=>b.addEventListener('click',()=>setRaceBots(b.dataset.bots)));
        updateCircuitUI();
      }

      // Configurable race field, physically spaced grids and bounded rival detail.
      const BOT_MIN=0,BOT_MAX=14;
      let rivalDetailTick=1000;
      function normalizeBots(value,fallback=3){if(value==null||typeof value==='boolean'||String(value).trim()==='')return fallback;const n=Number(value);return Number.isFinite(n)?Math.max(BOT_MIN,Math.min(BOT_MAX,Math.round(n))):fallback;}
      function decodeRecordKey(key){
        const parts=key.split('|');let circuit,laps,bots,model,difficulty;
        if(parts.length===5){[circuit,laps,bots,model,difficulty]=parts;}
        else if(parts.length===4){[circuit,laps,model,difficulty]=parts;bots=3;}
        else {const match=CAR_CATALOG.find(c=>['easy','normal','hard'].some(d=>key===c.id+'_'+d));if(!match)return null;circuit='city';laps=3;bots=3;model=match.id;difficulty=key.slice(model.length+1);}
        laps=Number(laps);bots=Number(bots);
        if(!CIRCUITS.some(c=>c.id===circuit)||!CAR_CATALOG.some(c=>c.id===model)||!['easy','normal','hard'].includes(difficulty)||!Number.isInteger(laps)||laps<LAP_MIN||laps>LAP_MAX||!Number.isInteger(bots)||bots<BOT_MIN||bots>BOT_MAX)return null;
        return {circuit,laps,bots,model,difficulty,key:[circuit,laps,bots,model,difficulty].join('|')};
      }
      function setRaceBots(value){if(GameState.mode!=='MENU')return;settings.bots=normalizeBots(value,settings.bots);updateCircuitUI();persistSettings();}
      function computeVehicleRpm(speedKmh){
        const car=playerCar,profile=window.NVEngineAudio?.profiles?.[car?.model.id||settings.model]||{idleRpm:900,redlineRpm:8000,gears:6};
        const idle=profile.idleRpm,redline=profile.redlineRpm;
        if(nvRenderPose(car)?.speed<-.5){const rpm=idle+Math.min(redline-idle,speedKmh*110+900);return{gear:'R',rpm:Math.round(rpm),rpmNorm:(rpm-idle)/(redline-idle)};}
        if(speedKmh<2){if(car)car.transmissionGear=0;const rpm=idle+(Input.up&&!Input.down&&!car?.finished&&!car?.dnf?700:0);return{gear:'N',rpm,rpmNorm:(rpm-idle)/(redline-idle)};}
        const ratios=profile.gearRatios||(profile.gears===7?[.16,.29,.42,.56,.71,.89,1.24]:profile.gears===5?[.23,.43,.64,.86,1.24]:[.19,.35,.51,.68,.86,1.24]);
        const caps=ratios.map(r=>r*(car?.model.topSpeed||currentModel().topSpeed));
        let g=car?.transmissionGear||0;
        while(g<caps.length-1&&speedKmh>caps[g])g++;
        while(g>0&&speedKmh<caps[g-1]*.89)g--;
        if(car)car.transmissionGear=g;
        const norm=THREE.MathUtils.clamp(speedKmh/caps[g],.08,1),rpm=Math.round(idle+norm*(redline-idle));
        return {gear:String(g+1),rpm,rpmNorm:norm};
      }
      function createRaceField(){
        headLights=[];allRacers.forEach(r=>disposeVehicle(r.visual));aiCars=[];allRacers=[];
        const model=currentModel(),visual=createVehicle(model.id,settings.colors[model.id],true);
        scene.add(visual.root);
        playerCar={id:'player',name:'ANDA · '+model.name.toUpperCase(),colorHex:settings.colors[model.id],isPlayer:true,visual,model,pos:new THREE.Vector3(),heading:0,speed:0,steerAngle:0,driftAngle:0,bodyRoll:0,bodyPitch:0,nitro:65,nitroActive:false,trackIdx:0,lastTrackIdx:0,lap:1,progress:0,finished:false,finishTime:0};
        allRacers.push(playerCar);
        const pool=CAR_CATALOG.filter(c=>c.id!==model.id&&(!c.branded||NVImportedCars.isLoaded(c.id)));
        for(let i=pool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
        const palette=['#ae3047','#86a8cf','#ba984d','#4d9b85','#bb704a','#6a71b8','#c8cfd3','#a68ab9','#79a34f','#ddbc65','#4686a0','#a35d73','#d3b89b','#688992'];
        const count=normalizeBots(settings.bots);
        for(let i=0;i<count;i++){
          const model=pool[i%pool.length],color=palette[i],visual=createVehicle(model.id,color);scene.add(visual.root);
          const racer={id:'ai_'+i,name:(model.cardName||model.name).toUpperCase()+' · '+String(i+1).padStart(2,'0'),colorHex:color,isPlayer:false,visual,model,pos:new THREE.Vector3(),heading:0,speed:0,baseSpeed:61+(i*3%7)*.75,t:0,laneOffset:0,targetLane:0,laneTimer:2+(i%5)*.43,trackIdx:0,lap:1,progress:0,finished:false,finishTime:0,collisionAt:-1000,shadowMeshes:[],detailMeshes:[]};
          visual.root.traverse(n=>{
            if(n.isMesh){n.castShadow=false;if(n.material&&!n.material.transparent)racer.shadowMeshes.push(n);const label=n.name+' '+(n.material?.name||'');if(/interior|dashboard|seat|steering|pedal|seatbelt|caliper|brake_disc/i.test(label))racer.detailMeshes.push(n);}
            if(n.isPointLight||n.isSpotLight)n.visible=false;
          });
          aiCars.push(racer);allRacers.push(racer);
        }
        allRacers.forEach(r=>r.visual.root.traverse(n=>{
          if(!n.isMesh)return;
          for(const mat of Array.isArray(n.material)?n.material:[n.material]){
            if(mat.transmission>0){mat.transmission=0;mat.needsUpdate=true;}
            if(/^glass/.test(mat.name||'')){mat.color.setHex(0x25313b);mat.opacity=.82;mat.metalness=.35;mat.roughness=.09;}
            mat.envMapIntensity=Math.min(mat.envMapIntensity||1,.8);
          }
        }));
        for(const side of[-1,1]){const lamp=new THREE.SpotLight(0xe4f1ff,1.8,65,.39,.7,1.2);lamp.position.set(side*.66,.66,1.7);const target=new THREE.Object3D();target.position.set(side*.7,.1,28);visual.root.add(lamp,target);lamp.target=target;headLights.push(lamp);}
        $('hud-car-name').textContent=model.name.toUpperCase();$('hud-pos-total').textContent=allRacers.length;$('hud-position-label').textContent=count?'POSISI':'LATIHAN';
        resetGridPositions();rivalDetailTick=1000;
      }
      function placeRaceField(){
        const order=[...aiCars,playerCar];
        order.forEach((racer,slot)=>{
          const open=!!currentCircuit().open,row=Math.floor(slot/2),lane=open?(slot-(order.length-1)/2)*3:order.length===1?0:slot%2?3.65:-3.65,back=open?8.5:8.5+row*8.4+(slot%2?1.7:0);
          const t=(open?0:1)-back/trackTotalLength,idx=open?0:Math.floor(t*CURVE_SAMPLES)%CURVE_SAMPLES,p=trackCurve.getPointAt(t),tan=trackCurve.getTangentAt(t).normalize(),right=new THREE.Vector3(-tan.z,0,tan.x);
          racer.pos.copy(p).addScaledVector(right,lane);racer.pos.y=0;racer.heading=Math.atan2(tan.x,tan.z);racer.speed=0;racer.trackIdx=idx;racer.lastTrackIdx=idx;
          racer.lap=1;racer.lastTrackT=open?t:racer.isPlayer?idx/CURVE_SAMPLES:t;racer.progress=racer.lastTrackT-(open?0:1);racer.nextGate=0;racer.completedLaps=0;racer.finished=false;racer.finishTime=0;racer.gridSlot=slot;
          if(racer.isPlayer){racer.steerAngle=0;racer.driftAngle=0;racer.bodyRoll=0;racer.bodyPitch=0;racer.nitro=50;racer.nitroActive=false;racer.transmissionGear=0;}
          else{racer.t=t;racer.laneOffset=lane;racer.targetLane=lane;}
          racer.visual.root.position.copy(racer.pos);racer.visual.root.rotation.y=racer.heading;racer.visual.root.visible=true;
          racer.visual.bodyTiltGroup.rotation.set(0,0,0);racer.visual.frontPivots.forEach(p=>p.rotation.y=0);
        });
      }
      function updateRaceFieldAI(dt){
        if(GameState.mode!=='RACING')return;
        const open=!!currentCircuit().open,difficulty=GameState.raceConfig?.difficulty||settings.difficulty,factor={easy:.70,normal:.88,hard:1.04}[difficulty],acceleration={easy:6.2,normal:8.5,hard:10.2}[difficulty];
        for(const ai of aiCars){
          if(ai.finished)continue;
          ai.laneTimer-=dt;
          if(!open&&ai.laneTimer<=0){ai.laneTimer=2.6+Math.random()*3;ai.targetLane=(Math.random()-.5)*12.2;}
          let leader=null,gap=Infinity;
          for(const other of allRacers){if(other===ai||other.finished)continue;const delta=((other.lastTrackT-ai.t+1)%1)*trackTotalLength;if(delta>.02&&delta<26&&Math.abs(other.isPlayer?trackNormals[other.trackIdx].dot(other.pos.clone().sub(trackPoints[other.trackIdx]))-ai.laneOffset:other.laneOffset-ai.laneOffset)<2.65&&delta<gap){leader=other;gap=delta;}}
          if(!open&&leader&&gap<18){
            const desired=ai.laneOffset>=0?-4.2:4.2;let clear=true;
            for(const other of aiCars){if(other===ai||other.finished)continue;const d=Math.abs(((other.t-ai.t+1.5)%1)-.5)*trackTotalLength;if(d<11&&Math.abs(other.laneOffset-desired)<2.6){clear=false;break;}}
            if(clear){ai.targetLane=desired;ai.laneTimer=1.1;}
          }
          ai.laneOffset+=THREE.MathUtils.clamp(ai.targetLane-ai.laneOffset,-2.6*dt,2.6*dt);
          const idx=open?Math.max(0,Math.min(CURVE_SAMPLES-1,Math.floor(ai.t*(CURVE_SAMPLES-1)))):Math.floor(ai.t*CURVE_SAMPLES)%CURVE_SAMPLES,next=open?Math.min(idx+10,CURVE_SAMPLES-1):(idx+10)%CURVE_SAMPLES,corner=Math.max(.68,trackTangents[idx].dot(trackTangents[next]));
          const diff=playerCar.progress-ai.progress,rubber=diff>.08?Math.min(11,diff*24):diff<-.12?Math.max(-8,diff*18):0;
          let target=Math.min(ai.model.topSpeed/3.6*.98,(ai.baseSpeed+rubber)*corner*factor);
          if(leader&&gap<19)target=Math.min(target,Math.max(4,leader.speed+(gap-7.5)*1.45));
          ai.speed+=THREE.MathUtils.clamp(target-ai.speed,-acceleration*3.2*dt,acceleration*dt);
          ai.t=open?ai.t+ai.speed*dt/trackTotalLength:(ai.t+ai.speed*dt/trackTotalLength)%1;
          const p=trackCurve.getPointAt(ai.t),tan=trackCurve.getTangentAt(ai.t).normalize(),right=new THREE.Vector3(-tan.z,0,tan.x);
          ai.pos.copy(p).addScaledVector(right,ai.laneOffset);ai.pos.y=0;ai.heading=Math.atan2(tan.x,tan.z);
          updateLapProgress(ai,open?Math.max(0,Math.min(CURVE_SAMPLES-1,Math.floor(ai.t*(CURVE_SAMPLES-1)))):Math.floor(ai.t*CURVE_SAMPLES)%CURVE_SAMPLES,ai.t);
          ai.visual.root.position.copy(ai.pos);ai.visual.root.rotation.y=ai.heading;
          ai.visual.wheels.forEach(w=>w.rotation.x+=ai.speed*dt/(ai.visual.wheelRadius||.33));
          const nextTan=trackTangents[(ai.trackIdx+4)%CURVE_SAMPLES],turn=THREE.MathUtils.clamp(Math.atan2(tan.z*nextTan.x-tan.x*nextTan.z,tan.dot(nextTan))*2,-.36,.36);
          ai.visual.frontPivots.forEach(p=>p.rotation.y=turn);
        }
        for(const ai of aiCars){
          if(ai.finished)continue;const dx=playerCar.pos.x-ai.pos.x,dz=playerCar.pos.z-ai.pos.z,d2=dx*dx+dz*dz;
          if(d2<3.1*3.1&&d2>.001){const dist=Math.sqrt(d2),push=(3.1-dist)*.55;playerCar.pos.x+=dx/dist*push;playerCar.pos.z+=dz/dist*push;playerCar.speed*=.97;
            if(gameClock-ai.collisionAt>350){ai.collisionAt=gameClock;const p=playerCar.pos.clone().lerp(ai.pos,.5);p.y=.7;spawnParticles(p,0xd5c8a5,4,7,.25);audio.playCollision(.45);}
          }
        }
      }
      function updateRivalDetail(dt=0,force=false){
        if(!playerCar||['MENU','TOUR'].includes(GameState.mode))return;
        rivalDetailTick+=dt;if(!force&&rivalDetailTick<.28)return;rivalDetailTick=0;
        const quality=settings.quality,far=quality==='low'?290:quality==='medium'?410:560,shadowCap=quality==='high'?2:quality==='medium'?1:0;
        const ranked=aiCars.map(r=>({r,d:r.pos.distanceToSquared(playerCar.pos)})).sort((a,b)=>a.d-b.d);
        ranked.forEach(({r,d},i)=>{r.visual.root.visible=d<far*far;const cast=i<shadowCap&&d<42*42;r.shadowMeshes.forEach(m=>m.castShadow=cast);r.detailMeshes.forEach(m=>m.visible=d<(quality==='high'?80:quality==='medium'?42:22)**2);});
      }

      // Garage, settings and persistent personal bests.
      const CAR_CATALOG = [
        {id:'brz',name:'Subaru BRZ',cardName:'Subaru BRZ',title:'<small class="make-label">SUBARU</small>BRZ <b>Sport</b>',type:'BOXER COUPE · REAR-WHEEL DRIVE',short:'SUBARU · BRZ',class:'B · 785',description:'Coupe BRZ yang ringan dan lincah. Pilih warna bodi Anda, lalu jelajahi tikungan pesisir dan pegunungan.',color:'#2866b8',topSpeed:255,zeroTo100:5.6,drive:'RWD',handling:1.18,ratings:[76,77,98],branded:true,newArrival:true},
        {id:'veyron77',name:'Bugatti Veyron Polisi 77',cardName:'Veyron Polisi 77',title:'<small class="make-label">BUGATTI</small>Veyron <b>77</b>',type:'POLICE INTERCEPTOR · UNIT 77',short:'BUGATTI · POLISI 77',class:'S · 980',description:'Veyron dengan livery polisi, nomor unit 77, dan lampu strobo merah-biru. Warna bagian cat tetap dapat diubah.',color:'#eceff2',topSpeed:370,zeroTo100:2.7,drive:'AWD',handling:.94,ratings:[100,99,83],branded:true,newArrival:true},
        {id:'aventador',name:'Lamborghini Aventador',cardName:'Aventador',title:'<small class="make-label">LAMBORGHINI</small>Aventador <b>V12</b>',type:'CARBON AERO PACKAGE',short:'LAMBORGHINI · V12',class:'S · 955',description:'Bodi Aventador dengan aero karbon, spoiler besar, dan detail roda. Bagian cat mengikuti warna pilihan Anda.',color:'#c9d2d9',topSpeed:340,zeroTo100:2.9,drive:'AWD',handling:.98,ratings:[99,96,89],branded:true},
        {id:'skyline',name:'Nissan Skyline GT-R R34',cardName:'Skyline R34',title:'<small class="make-label">NISSAN</small>Skyline <b>R34</b>',type:'GT-R · JAPANESE PERFORMANCE',short:'NISSAN · GT-R R34',class:'A · 885',description:'Coupe GT-R R34 dengan lampu belakang bundar, spoiler khas, dan karakter kemudi yang seimbang.',color:'#326bcc',topSpeed:295,zeroTo100:3.6,drive:'AWD',handling:1.11,ratings:[89,88,94],branded:true},
        {id:'veloce',name:'Veloce R',title:'Veloce <b>R</b>',type:'MID-ENGINE SUPERCAR',short:'SUPERCAR',class:'S · 920',description:'Siluet rendah, detail V12, dan respons tajam untuk menaklukkan lintasan malam.',color:'#ed6b2f',topSpeed:320,zeroTo100:3.0,drive:'RWD',handling:.99,ratings:[94,92,88]},
        {id:'apex',name:'Apex GT',title:'Apex <b>GT</b>',type:'CLASSIC GRAND TOURER',short:'CLASSIC GT',class:'A · 810',description:'Coupe klasik dengan kap panjang, aksen krom, dan karakter mengemudi yang seimbang.',color:'#3f7568',topSpeed:275,zeroTo100:4.3,drive:'RWD',handling:1.06,ratings:[81,78,91]},
        {id:'cinder',name:'Cinder V8',title:'Cinder <b>V8</b>',type:'AMERICAN MUSCLE',short:'MUSCLE CAR',class:'A · 850',description:'Bodi berotot, garis balap ikonik, dan tenaga V8 yang terasa di setiap lintasan lurus.',color:'#ad2940',topSpeed:290,zeroTo100:3.8,drive:'RWD',handling:.9,ratings:[87,85,73]},
        {id:'kaze',name:'Kaze Rally',title:'Kaze <b>Rally</b>',type:'ALL-WHEEL DRIVE RALLY',short:'RALLY HATCH',class:'A · 830',description:'Hatchback rally kompak, lampu tambahan, dan kemudi lincah untuk tikungan rapat.',color:'#d9e1e5',topSpeed:255,zeroTo100:3.6,drive:'AWD',handling:1.16,ratings:[75,87,97]},
        {id:'bmw-hybrid-v8',name:'BMW M Hybrid V8',cardName:'M Hybrid V8',title:'<small class="make-label">BMW</small>M Hybrid <b>V8</b>',type:'PROTOTYPE · REKONSTRUKSI REFERENSI',short:'BMW · PROTOTYPE',class:'S · 975',description:'Rekonstruksi 3D asli UVelocity dari referensi: hidung twin-kidney lebar, kabin rendah, sirip tengah, dan aero balap. Bukan aset resmi pabrikan.',color:'#e9edf0',topSpeed:345,zeroTo100:2.6,drive:'RWD',handling:1.23,ratings:[96,98,100],branded:true,newArrival:true,representation:'reference-recreation'},
        {id:'bmw-m4-gt4',name:'BMW M4 GT4',cardName:'M4 GT4 F82',title:'<small class="make-label">BMW</small>M4 <b>GT4</b>',type:'F82 RACE COUPE · REKONSTRUKSI REFERENSI',short:'BMW · F82 GT4',class:'A · 880',description:'Rekonstruksi F82 M4 GT4 dengan grille kidney kompak, atap coupe, detail saluran udara, dan sayap belakang balap.',color:'#edf0f0',topSpeed:285,zeroTo100:3.7,drive:'RWD',handling:1.20,ratings:[86,86,99],branded:true,newArrival:true,representation:'reference-recreation'},
        {id:'amg-gt4',name:'Mercedes-AMG GT4',cardName:'AMG GT4',title:'<small class="make-label">MERCEDES-AMG</small>GT <b>4</b>',type:'LONG-HOOD RACER · REKONSTRUKSI REFERENSI',short:'MERCEDES-AMG · GT4',class:'A · 895',description:'Rekonstruksi GT4 dengan kap panjang, kokpit fastback, grille vertikal, dan aero sirkuit yang mengikuti karakter referensi.',color:'#a8afb5',topSpeed:295,zeroTo100:3.5,drive:'RWD',handling:1.16,ratings:[89,89,96],branded:true,newArrival:true,representation:'reference-recreation'},
        {id:'sls-amg-gt3',name:'Mercedes-Benz SLS AMG GT3',cardName:'SLS AMG GT3',title:'<small class="make-label">MERCEDES-BENZ</small>SLS <b>GT3</b>',type:'GULLWING RACER · REKONSTRUKSI REFERENSI',short:'MERCEDES-BENZ · SLS GT3',class:'S · 925',description:'Rekonstruksi SLS balap dengan kap panjang, lampu tegak, garis atap gullwing, grille horizontal, dan sayap besar.',color:'#80878b',topSpeed:310,zeroTo100:3.2,drive:'RWD',handling:1.18,ratings:[92,93,97],branded:true,newArrival:true,representation:'reference-recreation'},
        {id:'batmobile-1989',name:'Batmobile 1989',cardName:'Batmobile 1989',title:'<small class="make-label">1989</small>Batmobile <b>89</b>',type:'CINEMA ICON · REKONSTRUKSI REFERENSI',short:'BATMOBILE · 1989',class:'S · 910',description:'Rekonstruksi dari referensi Batmobile era Keaton/Burton: bodi memanjang, intake turbin bundar, kanopi rendah, dan sirip belakang.',color:'#15191d',topSpeed:300,zeroTo100:3.9,drive:'RWD',handling:.90,ratings:[90,84,78],branded:true,newArrival:true,representation:'reference-recreation'},
        {id:'jesko-absolut',name:'Koenigsegg Regera',cardName:'Regera',title:'<small class="make-label">KOENIGSEGG</small>Regera',type:'HYPERCAR · REKONSTRUKSI REFERENSI',short:'KOENIGSEGG · REGERA',class:'X · 998',description:'Rekonstruksi Regera dari referensi terbaru: kanopi melengkung, lampu depan khas, bodi berlekuk, dan intake samping yang menyatu dengan pintu.',color:'#d9dde0',topSpeed:420,zeroTo100:2.3,drive:'RWD',handling:.96,ratings:[100,100,85],branded:true,newArrival:true,representation:'reference-recreation'},
        {id:'venom-f5',name:'Hennessey Venom F5',cardName:'Venom F5',title:'<small class="make-label">HENNESSEY</small>Venom <b>F5</b>',type:'HYPERCAR · REKONSTRUKSI REFERENSI',short:'HENNESSEY · VENOM F5',class:'X · 995',description:'Rekonstruksi F5 mengikuti referensi terbaru dengan kokpit terbuka, fender tinggi, lampu tipis, intake samping besar, dan sayap belakang.',color:'#8b8c87',topSpeed:410,zeroTo100:2.4,drive:'RWD',handling:.95,ratings:[100,99,84],branded:true,newArrival:true,representation:'reference-recreation'},
        {id:'panther-grand-touring',name:'Isuzu Panther Grand Touring',cardName:'Panther Grand Touring',title:'<small class="make-label">ISUZU</small>Panther <b>Grand Touring</b>',type:'DIESEL MPV · REKONSTRUKSI REFERENSI',short:'ISUZU · PANTHER',class:'C · 520',description:'Rekonstruksi Panther Grand Touring dari foto pengguna: bodi MPV tinggi, lampu dan grille lebar, roof rail, serta pijakan samping.',color:'#19252e',topSpeed:170,zeroTo100:10.8,drive:'RWD',handling:.88,ratings:[45,38,73],branded:true,newArrival:true,representation:'reference-recreation'},
        {id:'honda-crv-rs',name:'Honda CR-V RS e:HEV',cardName:'CR-V RS e:HEV',title:'<small class="make-label">HONDA</small>CR-V <b>RS e:HEV</b>',type:'HYBRID SUV · REKONSTRUKSI REFERENSI',short:'HONDA · CR-V',class:'C · 650',description:'SUV dari referensi CR-V biru: grille poligonal, lampu tipis, empat pintu, dan lampu belakang berbentuk L.',color:'#4b637a',topSpeed:210,zeroTo100:8.2,drive:'FWD',handling:1.02,ratings:[59,56,86],branded:true,newArrival:true,representation:'reference-recreation'},
        {id:'mitsubishi-pajero-sport',name:'Mitsubishi Pajero Sport',cardName:'Pajero Sport',title:'<small class="make-label">MITSUBISHI</small>Pajero <b>Sport</b>',type:'OFF-ROAD SUV · REKONSTRUKSI REFERENSI',short:'MITSUBISHI · PAJERO',class:'C · 625',description:'Pajero Sport hitam mengikuti foto pengguna: bumper baja off-road, ban tebal, side step, dan lampu belakang vertikal.',color:'#151a1d',topSpeed:195,zeroTo100:10.5,drive:'AWD',handling:.94,ratings:[54,43,78],branded:true,newArrival:true,representation:'reference-recreation'},
        {id:'toyota-fortuner',name:'Toyota Fortuner GR Sport',cardName:'Fortuner GR Sport',title:'<small class="make-label">TOYOTA</small>Fortuner <b>GR Sport</b>',type:'DIESEL SUV · REKONSTRUKSI REFERENSI',short:'TOYOTA · FORTUNER',class:'C · 640',description:'Fortuner GR Sport dari foto pengguna, dengan bodi SUV tinggi, grille depan khas, pijakan samping, dan lampu belakang memanjang.',color:'#20262b',topSpeed:205,zeroTo100:9.8,drive:'AWD',handling:.96,ratings:[57,48,80],branded:true,newArrival:true,representation:'reference-recreation'},
        {id:'toyota-innova-zenix',name:'Toyota Kijang Innova Zenix Hybrid',cardName:'Innova Zenix Hybrid',title:'<small class="make-label">TOYOTA</small>Innova <b>Zenix Hybrid</b>',type:'HYBRID MPV · REKONSTRUKSI REFERENSI',short:'TOYOTA · INNOVA ZENIX',class:'C · 635',description:'MPV keluarga dari foto pengguna: kabin luas, grille trapesium, empat pintu, dan lampu belakang horizontal.',color:'#d5d9dd',topSpeed:195,zeroTo100:9.5,drive:'FWD',handling:1.01,ratings:[54,49,85],branded:true,newArrival:true,representation:'reference-recreation'}
      ];
      const PALETTE = [
        {name:'Signal Orange',hex:'#ed6b2f'}, {name:'Crimson Red',hex:'#b92842'},
        {name:'Arctic White',hex:'#e7e9e9'}, {name:'Obsidian',hex:'#222930'},
        {name:'Cobalt Blue',hex:'#2678c9'}, {name:'Forest Green',hex:'#3f7568'},
        {name:'Solar Yellow',hex:'#eac348'}
      ];
      const STORAGE_KEY='neon-velocity-garage-v2';
      let storageAvailable=true,gameClock=0,raceGeneration=0,pausedFrom='RACING';
      let countdownElapsed=0,countdownStep=-1,goUntil=0,finishDelay=-1;
      let toastTimer=0, raceKey=null, raceRim=null, headLights=[], gameReady=false;
      let garageNeedsRender=true,lastGarageRender=0,simulationAccumulator=0;
      let enginePreviewToken=0;
      let saved={};
      try{saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')||{};}catch(e){storageAvailable=false;}
      const settings={
        model:CAR_CATALOG.some(m=>m.id===saved.model)?saved.model:'brz',
        colors:{},
        finish:['metallic','gloss','matte'].includes(saved.finish)?saved.finish:'metallic',
        difficulty:['easy','normal','hard'].includes(saved.difficulty)?saved.difficulty:'normal',
        quality:['high','medium','low'].includes(saved.quality)?saved.quality:'medium',
        timeOfDay:['dusk','night'].includes(saved.timeOfDay)?saved.timeOfDay:'dusk',
        circuit:CIRCUITS.some(c=>c.id===saved.circuit)?saved.circuit:'city',
        laps:saved.circuit==='drag-2km'?1:normalizeLaps(saved.laps,3),
        bots:normalizeBots(saved.bots,3),
        muted:!!saved.muted,
        records:{}
      };
      for(const car of CAR_CATALOG) settings.colors[car.id]=/^#[\da-f]{6}$/i.test(saved.colors?.[car.id]||'')?saved.colors[car.id]:car.color;
      for(const [key,record] of Object.entries(saved.records||{})){
        const parsed=decodeRecordKey(key);
        if(parsed&&record&&Number.isFinite(record.total)&&record.total>0&&Number.isFinite(record.lap)&&record.lap>0){const old=settings.records[parsed.key];settings.records[parsed.key]={total:Math.min(old?.total||Infinity,record.total),lap:Math.min(old?.lap||Infinity,record.lap)};}
      }
      const $=id=>document.getElementById(id);
      function currentModel(){return CAR_CATALOG.find(c=>c.id===settings.model);}
      function persistSettings(){
        try{localStorage.setItem(STORAGE_KEY,JSON.stringify(settings));storageAvailable=true;}
        catch(e){storageAvailable=false;}
        if($('selection-saved'))$('selection-saved').innerHTML=storageAvailable?'<span>✓</span> Pilihan tersimpan otomatis di browser ini':'Penyimpanan browser tidak tersedia · pilihan berlaku sesi ini';
      }
      function toast(message){
        $('toast').textContent=message;$('toast').classList.remove('hidden');
        clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),3000);
      }
      function updateGarageSoundUI(){
        const b=$('btn-garage-mute');if(b){b.textContent=settings.muted?'×':'♪';b.setAttribute('aria-label',settings.muted?'Aktifkan suara':'Matikan suara');b.setAttribute('aria-pressed',String(settings.muted));}
      }
      function stopEnginePreview(){
        enginePreviewToken++;audio.stopPreview?.();const b=$('btn-engine-preview');if(b){b.textContent='▶ Dengarkan';b.setAttribute('aria-pressed','false');}
      }
      async function previewSelectedEngine(){
        if(GameState.mode!=='MENU'||document.hidden)return;
        if(audio.isPreviewing){stopEnginePreview();return;}
        if(settings.muted){toast('Suara sedang dimatikan. Klik tombol ♪ di samping Dengarkan untuk mengaktifkannya.');return;}
        const token=++enginePreviewToken,b=$('btn-engine-preview');b.textContent='■ Hentikan';b.setAttribute('aria-pressed','true');
        try{await audio.previewEngine(settings.model,4.5);}catch(error){toast('Suara belum tersedia. Coba aktifkan audio pada browser ini.');}
        finally{if(token===enginePreviewToken){b.textContent='▶ Dengarkan';b.setAttribute('aria-pressed','false');}}
      }
      function createVehicle(id,color,isPlayer=false,appearance=null){
        const loadout=appearance||((isPlayer||GameState.mode==='MENU')&&id===settings.model?onlineRender.previewLoadout:null);
        const opts={finish:loadout?.finish||settings.finish};
        let car=window.NVImportedCars?.create(id,color,opts);
        if(!car&&CAR_CATALOG.find(c=>c.id===id)?.branded)throw new Error('Model '+id+' tidak dapat dimuat. Pilih kendaraan lain.');
        if(!car)car=NVCarFactory.create(id,color,opts);
        car.root.traverse(n=>{if(n.isMesh){n.castShadow=n.castShadow!==false;n.receiveShadow=true;}});
        if(loadout&&window.NVWheels)NVWheels.apply(car,loadout);
        if(loadout&&window.NVStripes)NVStripes.apply(car,loadout);
        return car;
      }
      function disposeVehicle(car){
        if(!car)return;
        restoreCameraVehicle(car);car.cockpit?.dispose();car.cockpit=null;
        if(cameraVehicle===car)cameraVehicle=null;
        window.NVWheels?.dispose(car);
        window.NVStripes?.dispose(car);
        if(car.imported)NVImportedCars.dispose(car);else NVCarFactory.dispose(car);
      }
      function paintVehicle(car,color){
        if(!car)return;
        if(car.imported)NVImportedCars.recolor(car,color,settings.finish);else NVCarFactory.recolor(car,color,settings.finish);
      }
      function selectCar(id,initial=false){
        if(!CAR_CATALOG.some(c=>c.id===id))return;
        if(CAR_CATALOG.find(c=>c.id===id).branded&&!NVImportedCars.isLoaded(id)){toast('Model ini tidak dapat dimuat. Silakan pilih mobil lain.');return;}
        stopEnginePreview();settings.model=id;audio.setVehicle(id);
        if(garageCar)disposeVehicle(garageCar);
        garageCar=createVehicle(id,settings.colors[id]);
        garageScene.add(garageCar.root);
        garageCar.root.position.y=.035;
        garageCar.root.rotation.y=0;
        if(!initial){garageOrbit.yaw=.82;garageOrbit.pitch=.20;garageOrbit.distance=8.05;}
        document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('selected',b.dataset.view==='front'));
        updateGarageUI();garageNeedsRender=true;persistSettings();
      }
      function updateGarageUI(){
        const model=currentModel(),color=settings.colors[model.id];
        $('car-name').innerHTML=model.title;
        $('car-class').textContent=model.class;$('car-subtitle').textContent=model.type;
        $('car-description').textContent=model.description;
        if($('engine-profile'))$('engine-profile').textContent=window.NVEngineAudio?.profiles?.[model.id]?.label||'Karakter mesin khusus';
        updateGarageSoundUI();
        $('stat-speed').textContent=model.topSpeed;$('stat-accel').textContent=model.zeroTo100.toFixed(1);$('stat-drive').textContent=model.drive;
        ['speed','accel','handling'].forEach((key,i)=>{$('bar-'+key).style.width=model.ratings[i]+'%';$('rating-'+key).textContent=model.ratings[i];});
        $('stage-number').textContent=String(CAR_CATALOG.indexOf(model)+1).padStart(2,'0');
        $('footer-car').textContent=model.name.toUpperCase();
        const preset=PALETTE.find(p=>p.hex.toLowerCase()===color.toLowerCase());
        $('paint-name').textContent=preset?.name||'Custom Color';
        $('paint-hex').textContent=color.toUpperCase();$('custom-color').value=color;
        document.querySelectorAll('.car-card').forEach(b=>{const selected=b.dataset.car===model.id;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
        document.querySelectorAll('.swatch').forEach(b=>{const selected=b.dataset.color.toLowerCase()===color.toLowerCase();b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
        document.querySelectorAll('[data-finish]').forEach(b=>{const v=b.dataset.finish===settings.finish;b.classList.toggle('selected',v);b.setAttribute('aria-pressed',String(v));});
        document.querySelectorAll('[data-difficulty]').forEach(b=>{const v=b.dataset.difficulty===settings.difficulty;b.classList.toggle('selected',v);b.setAttribute('aria-pressed',String(v));});
      }
      function setPaint(hex){
        if(!/^#[\da-f]{6}$/i.test(hex))return;
        settings.colors[settings.model]=hex;
        paintVehicle(garageCar,hex);updateGarageUI();persistSettings();garageNeedsRender=true;
        document.querySelector('[data-car="'+settings.model+'"] .card-name i').style.background=hex;
      }
      function createGarageCards(){
        $('collection-count').textContent=String(CAR_CATALOG.length).padStart(2,'0');
        $('car-cards').innerHTML=CAR_CATALOG.map((car,i)=>`<button class="car-card" data-car="${car.id}" aria-pressed="false" aria-label="Pilih ${car.name}" style="--car-color:${car.color}" ${car.branded&&!NVImportedCars.isLoaded(car.id)?'disabled':''}><div class="card-head"><span>${String(i+1).padStart(2,'0')} / ${car.class.split(' ')[0]} ${car.newArrival?' · NEW':''}</span><span class="card-check">✓</span></div><div class="thumb-placeholder" id="thumb-${car.id}"><svg viewBox="0 0 130 45" fill="none" stroke="currentColor" stroke-width="1.2"><path d="m9 29 5-8 23-4 15-9h34l16 11 16 5 4 11h-15a9 9 0 0 0-18 0H43a9 9 0 0 0-18 0H9v-6Z"/><path d="m39 18 15-8h30l13 10-58-2Z"/><circle cx="34" cy="35" r="6"/><circle cx="98" cy="35" r="6"/></svg></div><div class="card-name"><b>${car.cardName||car.name}</b><i></i></div><div class="card-type">${car.short}</div></button>`).join('');
        $('paint-swatches').innerHTML=PALETTE.map(p=>`<button class="swatch" style="--swatch:${p.hex}" data-color="${p.hex}" aria-label="${p.name}" title="${p.name}" aria-pressed="false"></button>`).join('');
        document.querySelectorAll('[data-car]').forEach(b=>b.addEventListener('click',()=>selectCar(b.dataset.car)));
        document.querySelectorAll('[data-color]').forEach(b=>b.addEventListener('click',()=>setPaint(b.dataset.color)));
        $('custom-color').addEventListener('input',e=>setPaint(e.target.value));
        document.querySelectorAll('[data-finish]').forEach(b=>b.addEventListener('click',()=>{settings.finish=b.dataset.finish;paintVehicle(garageCar,settings.colors[settings.model]);updateGarageUI();persistSettings();garageNeedsRender=true;}));
        document.querySelectorAll('[data-difficulty]').forEach(b=>b.addEventListener('click',()=>{settings.difficulty=b.dataset.difficulty;updateGarageUI();persistSettings();}));
      }
      function drawGarageThumbnails(){
        if(!renderer)return;
        const oldCar=garageCar;
        if(oldCar)oldCar.root.visible=false;
        for(const car of CAR_CATALOG){
          if(car.branded&&!NVImportedCars.isLoaded(car.id))continue;
          const visual=createVehicle(car.id,car.color);
          garageScene.add(visual.root);visual.root.position.y=.035;
          try{
            const src=renderGarageThumbnail(visual);
            const holder=$('thumb-'+car.id),image=new Image();image.src=src;image.alt='';image.className='car-thumb';holder.replaceWith(image);
          }catch(error){console.warn('Pratinjau kecil tidak tersedia:',error);}
          disposeVehicle(visual);
        }
        if(oldCar)oldCar.root.visible=true;
        garageNeedsRender=true;
      }
      function applyQuality(){
        if(!renderer)return;
        window.NVStripes?.setQuality(settings.quality);
        const cap=settings.quality==='high'?1.8:settings.quality==='low'?.8:1.15;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,cap));
        renderer.setSize(window.innerWidth,window.innerHeight);
        renderer.shadowMap.enabled=settings.quality!=='low';
        renderer.shadowMap.needsUpdate=true;
        $('quality-select').value=settings.quality;
        applyCityQuality();garageWorkshop?.setQuality(settings.quality);
        garageNeedsRender=true;
      }
      function showRecords(){
        let markup='';
        const entries=Object.entries(settings.records).map(([key,record])=>({parsed:decodeRecordKey(key),record})).filter(e=>e.parsed).sort((a,b)=>a.parsed.circuit.localeCompare(b.parsed.circuit)||a.parsed.laps-b.parsed.laps||a.parsed.bots-b.parsed.bots||a.parsed.model.localeCompare(b.parsed.model));
        for(const {parsed:r,record} of entries){
          const car=CAR_CATALOG.find(c=>c.id===r.model),circuit=CIRCUITS.find(c=>c.id===r.circuit);
          markup+=`<div class="record-row"><div><strong>${car.name}</strong><small>${circuit.name} · ${r.laps} lap · ${r.bots?r.bots+' bot':'Latihan solo'} · ${{easy:'Santai',normal:'Sport',hard:'Pro'}[r.difficulty]}</small><small>Lap terbaik ${formatTime(record.lap)}</small></div><b>${formatTime(record.total)}</b></div>`;
        }
        $('records-list').innerHTML=markup||'<div class="empty-records">Belum ada rekor.<br>Selesaikan balapan pertama Anda untuk mengisi catatan ini.</div>';
      }
      function saveRaceRecord(){
        if(onlineRender.enabled)return;
        const race=GameState.raceConfig||{circuit:settings.circuit,laps:TOTAL_LAPS,bots:settings.bots,model:settings.model,difficulty:settings.difficulty};
        const key=[race.circuit,race.laps,race.bots,race.model,race.difficulty].join('|'),previous=settings.records[key];
        const total=GameState.totalRaceTime,lap=GameState.bestLapTime;
        if(Number.isFinite(total)&&Number.isFinite(lap)&&total>0&&lap>0){
          settings.records[key]={total:Math.min(previous?.total||Infinity,total),lap:Math.min(previous?.lap||Infinity,lap)};
          persistSettings();
        }
      }
      function clearInput(){
        // Drop the held-pointer records before releasing capture: the browser
        // may dispatch lostpointercapture synchronously during a pause/blur.
        const held=[...touchPointers];touchPointers.clear();
        for(const [id,{el}]of held){try{if(el.hasPointerCapture?.(id))el.releasePointerCapture(id);}catch{}}
        Object.keys(Input).forEach(k=>Input[k]=false);
        document.querySelectorAll('.touch-left button,.touch-right button').forEach(b=>{b.classList.remove('active');b.setAttribute('aria-pressed','false');});
        GameState.mouseDrag=false;
      }
      function releaseTouchPointer(id){
        const held=touchPointers.get(id);if(!held)return;
        touchPointers.delete(id);
        if(![...touchPointers.values()].some(pointer=>pointer.key===held.key)){
          Input[held.key]=false;held.el.classList.remove('active');held.el.setAttribute('aria-pressed','false');
        }
        try{if(held.el.hasPointerCapture?.(id))held.el.releasePointerCapture(id);}catch{}
      }
      function pauseRace(){
        if(onlineRender.active){nvPause();return;}
        if(!['COUNTDOWN','RACING'].includes(GameState.mode))return;
        pausedFrom=GameState.mode;GameState.mode='PAUSED';clearInput();
        if(playerCar)playerCar.nitroActive=false;
        DOM.nitroVignette.style.opacity='0';DOM.speedlinesCanvas.style.opacity='0';
        $('pause-overlay').classList.remove('hidden');
        audio.updateEngine(0,0,false,0,false);
        if(audio.ctx)audio.ctx.suspend().catch(()=>{});
        $('btn-resume').focus();
      }
      function resumeRace(){
        if(onlineRender.active){nvResume();return;}
        if(GameState.mode!=='PAUSED')return;
        clearInput();GameState.mode=pausedFrom;lastFrameTime=performance.now();simulationAccumulator=0;
        $('pause-overlay').classList.add('hidden');
        document.activeElement?.blur();if(audio.ctx)audio.ctx.resume().catch(()=>{});
      }
      function goToGarage(){
        if(onlineRender.active){nvPause();NVGame._emit('exit',{raceId:onlineRender.raceId});return;}
        stopEnginePreview();raceGeneration++;finishDelay=-1;goUntil=0;clearInput();
        GameState.mode='MENU';
        $('tour-overlay').classList.add('hidden');
        if(playerCar){playerCar.nitroActive=false;playerCar.speed=0;playerCar.visual.root.visible=true;}
        DOM.hudLayer.classList.add('hidden');DOM.finishOverlay.classList.add('hidden');
        $('pause-overlay').classList.add('hidden');DOM.startOverlay.classList.remove('hidden');
        DOM.countdown.classList.add('hidden');DOM.statusBanner.classList.add('hidden');
        if(bannerTimeout)clearTimeout(bannerTimeout);
        DOM.nitroVignette.style.opacity='0';DOM.speedlinesCanvas.style.opacity='0';
        for(const p of particles){scene.remove(p.mesh);p.mesh.material.dispose();}particles.length=0;
        if(audio.ctx)audio.ctx.suspend().catch(()=>{});
        renderer.toneMappingExposure=.94;
        resetRaceCamera();camera.fov=65;camera.updateProjectionMatrix();garageNeedsRender=true;
        updateCircuitUI();
        document.activeElement?.blur();
      }
      function updateCountdown(dt){
        countdownElapsed+=dt;
        const step=Math.min(3,Math.floor(countdownElapsed));
        if(step!==countdownStep){
          countdownStep=step;DOM.countdown.textContent=['3','2','1','GO!'][step];
          DOM.countdown.classList.remove('hidden','countdown-pop');void DOM.countdown.offsetWidth;DOM.countdown.classList.add('countdown-pop');
          audio.playBeep(step===3?880:440,step===3?.3:.12,.22);
        }
        if(step===3){GameState.mode='RACING';gameClock=0;GameState.raceStartTime=0;GameState.lapStartTime=0;goUntil=850;}
      }
      function renderGarage(dt,now){
        renderer.toneMappingExposure=.94;
        const stage=$('garage-stage'),rect=stage.getBoundingClientRect();
        if(garageCar?.modelId==='veyron77'){NVImportedCars.updateEffects?.(garageCar,now/1000);garageNeedsRender=true;}
        if(garageOrbit.auto&&!document.hidden){garageOrbit.yaw+=dt*.15;garageNeedsRender=true;}
        if(!garageNeedsRender&&now-lastGarageRender<180)return;
        lastGarageRender=now;garageNeedsRender=false;
        renderer.setScissorTest(false);renderer.setViewport(0,0,innerWidth,innerHeight);renderer.setClearColor(0x111418,1);renderer.clear();
        if(rect.bottom<=0||rect.top>=innerHeight||rect.width<1)return;
        updateGarageCamera(rect.width,rect.height);garageWorkshop?.update(garageCamera);
        renderer.setScissorTest(true);
        renderer.setScissor(Math.max(0,rect.left),Math.max(0,innerHeight-rect.bottom),Math.min(rect.width,innerWidth-rect.left),Math.min(rect.bottom,innerHeight)-Math.max(rect.top,0));
        renderer.setViewport(rect.left,innerHeight-rect.bottom,rect.width,rect.height);
        renderer.render(garageScene,garageCamera);renderer.setScissorTest(false);
      }
      function bindGarageControls(){
        createGarageCards();
        $('btn-engine-preview').addEventListener('click',previewSelectedEngine);
        $('btn-garage-mute').addEventListener('click',()=>{toggleMute();updateGarageSoundUI();if(settings.muted)stopEnginePreview();});
        window.addEventListener('blur',stopEnginePreview);document.addEventListener('visibilitychange',()=>{if(document.hidden)stopEnginePreview();});
        const stage=$('garage-stage');let pointer=null,originX=0,originY=0;
        stage.addEventListener('pointerdown',e=>{
          if(e.target.closest('button'))return;
          pointer=e.pointerId;originX=e.clientX;originY=e.clientY;
          stage.setPointerCapture(e.pointerId);garageOrbit.auto=false;$('btn-rotate').classList.remove('selected');
        });
        stage.addEventListener('pointermove',e=>{if(e.pointerId!==pointer)return;garageOrbit.yaw-=(e.clientX-originX)*.008;garageOrbit.pitch=Math.max(.06,Math.min(.65,garageOrbit.pitch+(e.clientY-originY)*.004));originX=e.clientX;originY=e.clientY;garageNeedsRender=true;document.querySelectorAll('[data-view]').forEach(b=>b.classList.remove('selected'));});
        const end=e=>{if(e.pointerId===pointer)pointer=null;};stage.addEventListener('pointerup',end);stage.addEventListener('pointercancel',end);stage.addEventListener('lostpointercapture',end);
        stage.addEventListener('wheel',e=>{if(e.ctrlKey)return;e.preventDefault();garageOrbit.distance=Math.max(5.8,Math.min(11.5,garageOrbit.distance+e.deltaY*.006));garageNeedsRender=true;},{passive:false});
        stage.addEventListener('keydown',e=>{if(e.target!==stage)return;if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();garageOrbit.yaw+=e.key==='ArrowLeft'?.15:-.15;garageNeedsRender=true;}if(e.key==='+'||e.key==='-'){garageOrbit.distance=Math.max(5.8,Math.min(11.5,garageOrbit.distance+(e.key==='+'?-.3:.3)));garageNeedsRender=true;}});
        document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{garageOrbit.auto=false;garageOrbit.yaw={front:.82,side:Math.PI/2,rear:Math.PI+.72}[b.dataset.view];garageOrbit.pitch=.20;$('btn-rotate').classList.remove('selected');document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('selected',x===b));garageNeedsRender=true;}));
        $('btn-rotate').addEventListener('click',()=>{garageOrbit.auto=!garageOrbit.auto;$('btn-rotate').classList.toggle('selected',garageOrbit.auto);garageNeedsRender=true;});
        $('quality-select').addEventListener('change',e=>{settings.quality=e.target.value;applyQuality();persistSettings();});
        $('garage-fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch(e){toast('Gunakan F11 pada browser untuk layar penuh.');}});
        for(const b of document.querySelectorAll('[data-dialog]'))b.addEventListener('click',()=>{if(b.dataset.dialog==='records-dialog')showRecords();$(b.dataset.dialog).showModal();});
        document.querySelectorAll('dialog').forEach(d=>{d.querySelector('.dialog-close').addEventListener('click',()=>d.close());d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}});});
        $('nav-garage').addEventListener('click',()=>{$('start-overlay').scrollTop=0;garageNeedsRender=true;});
        $('brand-home').addEventListener('click',e=>{e.preventDefault();$('start-overlay').scrollTop=0;garageNeedsRender=true;});
        $('start-overlay').addEventListener('scroll',()=>garageNeedsRender=true,{passive:true});
        $('btn-pause').addEventListener('click',pauseRace);$('btn-resume').addEventListener('click',resumeRace);
        $('btn-restart').addEventListener('click',startNewRace);$('btn-exit-garage').addEventListener('click',goToGarage);$('btn-finish-garage').addEventListener('click',goToGarage);
        window.addEventListener('blur',()=>{clearInput();pauseRace();});
        document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInput();pauseRace();}});
      }

/* Garage studio. Insert within the main game closure. Uses the existing renderer. */
let garageScene, garageCamera, garageKey, garageCar = null, sharedEnv, garageWorkshop;
const garageOrbit = {yaw: .78, pitch: .21, distance: 8.2, auto: false};
let garageEnvTarget, garageThumbTarget;

function initGarageStudio(renderer) {
  garageScene=new THREE.Scene();garageScene.background=new THREE.Color(0x1b251f);
  garageCamera=new THREE.PerspectiveCamera(33,1.6,.05,100);
  garageWorkshop=window.NVWorkshop.build({THREE,scene:garageScene});
  garageWorkshop.setQuality(settings.quality);garageKey=garageWorkshop.key;
  // Capture the actual workshop before adding a car: the glazing, work lights,
  // concrete and tool storage appear naturally in paint and chrome reflections.
  const generator=new THREE.PMREMGenerator(renderer);generator.compileCubemapShader();
  garageEnvTarget=generator.fromScene(garageScene,.035,.1,100);sharedEnv=garageEnvTarget.texture;
  garageScene.environment=sharedEnv;generator.dispose();updateGarageCamera(700,430);
}

function updateGarageCamera(width,height) {
  if(!garageCamera)return;
  const aspect=Math.max(.35,width/Math.max(1,height));
  garageCamera.aspect=aspect;
  // Preserve breathing room on narrow screens. Embedded framing lifts the car
  // clear of the account app caption; the full legacy garage keeps its heading offset.
  const lengthScale=garageCar?.representation==='reference-recreation'?Math.max(1,(garageCar.dimensions?.[2]||4.6)/5.15):1;
  const d=garageOrbit.distance*Math.max(1,1.23/aspect)*lengthScale;
  const pitch=Math.max(.10,Math.min(.75,garageOrbit.pitch));
  const targetY=.58;
  garageCamera.position.set(Math.sin(garageOrbit.yaw)*d*Math.cos(pitch),targetY+Math.sin(pitch)*d,Math.cos(garageOrbit.yaw)*d*Math.cos(pitch));
  garageCamera.lookAt(0,targetY,0);
  garageCamera.setViewOffset(width,height,0,height*(document.body.classList.contains('nv-embedded')?.04:-.11),width,height);
  garageCamera.updateProjectionMatrix();
}

function renderGarageThumbnail(visual) {
  if(!visual||!visual.root||!garageScene)return '';
  const w=320,h=160;
  if(!garageThumbTarget){
    garageThumbTarget=new THREE.WebGLRenderTarget(w,h,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,format:THREE.RGBAFormat,depthBuffer:true,stencilBuffer:false});
    garageThumbTarget.texture.encoding=THREE.sRGBEncoding;
  }
  const savedTarget=renderer.getRenderTarget();
  const savedViewport=renderer.getViewport(new THREE.Vector4());
  const savedScissor=renderer.getScissor(new THREE.Vector4());
  const savedScissorTest=renderer.getScissorTest();
  const savedClear=renderer.getClearColor(new THREE.Color()).clone();
  const savedAlpha=renderer.getClearAlpha();
  const savedAutoClear=renderer.autoClear;
  const savedBackground=garageScene.background;
  const savedParent=visual.root.parent;
  const savedPosition=visual.root.position.clone();
  const savedRotation=visual.root.quaternion.clone();
  const savedScale=visual.root.scale.clone();
  const savedVisible=visual.root.visible;
  const oldCarVisible=garageCar&&garageCar!==visual?garageCar.root.visible:null;
  let url='';
  try {
    if(garageCar&&garageCar!==visual)garageCar.root.visible=false;
    visual.root.position.set(0,0,0);visual.root.quaternion.identity();visual.root.scale.set(1,1,1);visual.root.visible=true;
    garageScene.add(visual.root);
    const camera=new THREE.PerspectiveCamera(31,w/h,.05,80);
    const lengthScale=visual.representation==='reference-recreation'?Math.max(1,(visual.dimensions?.[2]||4.6)/5.15):1;
    camera.position.set(5.4*lengthScale,2.35*lengthScale,6.6*lengthScale);camera.lookAt(0,.56,0);camera.updateProjectionMatrix();
    garageScene.background=new THREE.Color(0x1a1f25);
    renderer.setRenderTarget(garageThumbTarget);
    // setRenderTarget uses physical pixel dimensions; setViewport would apply
    // the screen pixel ratio again in Three r128 and crop these thumbnails.
    renderer.setScissorTest(false);
    renderer.autoClear=true;renderer.clear(true,true,true);garageWorkshop?.update(camera);renderer.render(garageScene,camera);
    const pixels=new Uint8Array(w*h*4);renderer.readRenderTargetPixels(garageThumbTarget,0,0,w,h,pixels);
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');const img=ctx.createImageData(w,h);
    for(let y=0;y<h;y++)img.data.set(pixels.subarray((h-y-1)*w*4,(h-y)*w*4),y*w*4);
    ctx.putImageData(img,0,0);url=canvas.toDataURL('image/png');
  } finally {
    visual.root.position.copy(savedPosition);visual.root.quaternion.copy(savedRotation);visual.root.scale.copy(savedScale);visual.root.visible=savedVisible;
    if(savedParent)savedParent.add(visual.root);else garageScene.remove(visual.root);
    if(garageCar&&garageCar!==visual)garageCar.root.visible=oldCarVisible;
    garageScene.background=savedBackground;garageWorkshop?.update(garageCamera);
    renderer.setRenderTarget(savedTarget);renderer.setViewport(savedViewport);renderer.setScissor(savedScissor);renderer.setScissorTest(savedScissorTest);renderer.setClearColor(savedClear,savedAlpha);renderer.autoClear=savedAutoClear;
  }
  return url;
}

      // City Edition: physically lit street materials, atmosphere and circuit tour.
      let cityWorld=null,skyDome=null,raceHemi=null,roadSurface=null;
      let streetLampRoot=null,streetLampData=[],streetLightPool=null,nearStreetLights=[];
      let cityEnvTarget=null,cityCubeTarget=null,cityCubeCamera=null;
      let streetLightTick=0,tourT=.13,tourCameraReady=false;
      const ENVIRONMENTS={
        dusk:{top:0x384c68,middle:0x81818a,horizon:0xcba17a,fog:0x85818a,density:.00165,sun:0xffd4a1,key:2.05,hemi:1.02,rim:.45,emission:.43,exposure:.94},
        night:{top:0x090e1b,middle:0x1d2a40,horizon:0x4e5362,fog:0x263449,density:.00195,sun:0xb8cffa,key:1.1,hemi:.75,rim:.36,emission:1,exposure:1.04}
      };
      const WORLD_ENVIRONMENTS={
        beach:{dusk:{top:0x426c88,middle:0xa8b4b1,horizon:0xe8b58b,fog:0x9cacb7,density:.00095,sun:0xffdfa8,key:2.25,hemi:1.14,rim:.55,exposure:.96},night:{top:0x070f22,middle:0x233d59,horizon:0x476979,fog:0x2b465d,density:.00105,sun:0xbedaff,key:1.26,hemi:.88,rim:.43,exposure:1.06}},
        glacier:{dusk:{top:0x426c94,middle:0xa4b8c6,horizon:0xd4dce0,fog:0xb9cad8,density:.00115,sun:0xe4edff,key:1.9,hemi:1.10,rim:.4,exposure:.92},night:{top:0x080f24,middle:0x203650,horizon:0x516782,fog:0x3f526c,density:.0014,sun:0xbed8ff,key:1.15,hemi:.94,rim:.48,exposure:1.05}}
      };
      function getEnvironmentPreset(){return {...ENVIRONMENTS[settings.timeOfDay],...(WORLD_ENVIRONMENTS[settings.circuit]?.[settings.timeOfDay]||{})};}
      function seededRandom(seed){let n=seed>>>0;return()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}
      function canvasTexture(canvas,isColor=true,repeatX=1,repeatY=1){
        const texture=new THREE.CanvasTexture(canvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
        texture.repeat.set(repeatX,repeatY);texture.anisotropy=4;if(isColor)texture.encoding=THREE.sRGBEncoding;return texture;
      }
      function makeConcreteTexture(){
        const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;
        const ctx=canvas.getContext('2d'),data=ctx.createImageData(512,256),random=seededRandom(4344);
        for(let i=0;i<data.data.length;i+=4){const a=121+random()*25;data.data[i]=a;data.data[i+1]=a+2;data.data[i+2]=a+2;data.data[i+3]=255;}
        ctx.putImageData(data,0,0);
        for(let i=0;i<110;i++){const x=random()*512,y=random()*256;ctx.fillStyle='rgba(22,31,37,.12)';ctx.fillRect(x,y,1+random()*4,1+random()*11);}
        ctx.fillStyle='rgba(18,28,35,.3)';ctx.fillRect(0,0,3,256);ctx.fillRect(509,0,3,256);
        return canvasTexture(canvas);
      }
      function makeAsphaltMaterial(){
        const w=1024,h=1024,random=seededRandom(61018);
        const albedo=document.createElement('canvas');albedo.width=w;albedo.height=h;
        const normal=document.createElement('canvas');normal.width=w;normal.height=h;
        const rough=document.createElement('canvas');rough.width=w;rough.height=h;
        const a=albedo.getContext('2d'),n=normal.getContext('2d'),r=rough.getContext('2d');
        const ai=a.createImageData(w,h),ni=n.createImageData(w,h),ri=r.createImageData(w,h);
        for(let y=0;y<h;y++)for(let x=0;x<w;x++){
          const j=(y*w+x)*4,grain=random(),patch=Math.sin(x*.012+Math.sin(y*.008)*2)*Math.sin(y*.013)*3;
          const shade=51+grain*20+patch;
          ai.data[j]=shade;ai.data[j+1]=shade+1;ai.data[j+2]=shade+3;ai.data[j+3]=255;
          ni.data[j]=122+random()*12;ni.data[j+1]=122+random()*12;ni.data[j+2]=253;ni.data[j+3]=255;
          const rv=199+random()*32+patch*3;ri.data[j]=ri.data[j+1]=ri.data[j+2]=rv;ri.data[j+3]=255;
        }
        a.putImageData(ai,0,0);n.putImageData(ni,0,0);r.putImageData(ri,0,0);
        // Fine repaired cracks and restrained tire wear are authored in meters.
        a.lineWidth=1.1;a.strokeStyle='rgba(19,23,29,.38)';
        for(let i=0;i<12;i++){let x=random()*w,y=random()*h;a.beginPath();a.moveTo(x,y);for(let k=0;k<6;k++){x+=(random()-.5)*50;y+=18+random()*25;a.lineTo(x,y);}a.stroke();}
        for(const x of [.20,.31,.45,.55,.69,.80]){
          const grad=a.createLinearGradient(w*x-20,0,w*x+20,0);grad.addColorStop(0,'rgba(12,17,22,0)');grad.addColorStop(.5,'rgba(12,17,22,.10)');grad.addColorStop(1,'rgba(12,17,22,0)');a.fillStyle=grad;a.fillRect(w*x-20,0,40,h);
        }
        // Edge stripes and interrupted lane markings, with a little paint wear.
        a.fillStyle='#bfc2be';a.fillRect(18,0,6,h);a.fillRect(w-24,0,6,h);
        for(const x of [.25,.5,.75])for(let y=26;y<h;y+=256)a.fillRect(w*x-3,y,6,94);
        for(let i=0;i<4500;i++){a.fillStyle='rgba(38,43,49,.18)';a.fillRect(random()*w,random()*h,1,random()*3);}
        const mat=new THREE.MeshStandardMaterial({map:canvasTexture(albedo),normalMap:canvasTexture(normal,false),normalScale:new THREE.Vector2(.33,.33),roughnessMap:canvasTexture(rough,false),roughness:.89,metalness:.05,envMapIntensity:.32});
        mat.name='Layered Asphalt';return mat;
      }
      function buildDetailedRoad(){
        const positions=[],uvs=[],indices=[];
        for(let i=0;i<=CURVE_SAMPLES;i++){
          const j=i%CURVE_SAMPLES,p=trackPoints[j],n=trackNormals[j];
          positions.push(p.x-n.x*ROAD_HALF,.025,p.z-n.z*ROAD_HALF,p.x+n.x*ROAD_HALF,.025,p.z+n.z*ROAD_HALF);
          uvs.push(0,i/CURVE_SAMPLES*trackTotalLength/32,1,i/CURVE_SAMPLES*trackTotalLength/32);
          if(i<CURVE_SAMPLES){const j=i*2;indices.push(j,j+1,j+2,j+1,j+3,j+2);}
        }
        const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();
        roadSurface=new THREE.Mesh(geometry,makeAsphaltMaterial());roadSurface.name='Asphalt Boulevard';roadSurface.receiveShadow=true;scene.add(roadSurface);
      }
      function makeKerbTexture(){
        const c=document.createElement('canvas');c.width=128;c.height=512;const ctx=c.getContext('2d');
        ctx.fillStyle=settings.circuit==='city'?'#c4c4bc':'#e6e6df';ctx.fillRect(0,0,128,256);ctx.fillStyle=settings.circuit==='beach'?'#276f77':settings.circuit==='glacier'?'#3d6086':'#434951';ctx.fillRect(0,256,128,256);
        ctx.fillStyle='#242c32';ctx.fillRect(0,0,128,4);ctx.fillRect(0,255,128,4);
        const random=seededRandom(671);for(let i=0;i<1600;i++){ctx.fillStyle='rgba(12,18,24,.15)';ctx.fillRect(random()*128,random()*512,1+random()*3,1+random()*5);}
        return canvasTexture(c);
      }
      function buildDetailedBarrier(offset){
        const sign=Math.sign(offset),profile=[[0,0],[0,.12],[.22,.4],[.29,.96],[.53,.96],[.62,.4],[.88,.12],[.88,0]];
        const positions=[],uvs=[],indices=[];
        for(let i=0;i<=CURVE_SAMPLES;i++){
          const idx=i%CURVE_SAMPLES,p=trackPoints[idx],n=trackNormals[idx];
          for(let j=0;j<profile.length;j++){const v=profile[j],o=offset+sign*v[0];positions.push(p.x+n.x*o,v[1],p.z+n.z*o);uvs.push(i/CURVE_SAMPLES*trackTotalLength/4.0,j/(profile.length-1));}
          if(i<CURVE_SAMPLES)for(let j=0;j<profile.length-1;j++){const a=i*profile.length+j,b=a+profile.length;indices.push(a,b,a+1,a+1,b,b+1);}
        }
        const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();
        const mat=new THREE.MeshStandardMaterial({map:makeConcreteTexture(),roughness:.96,metalness:0,side:THREE.DoubleSide,envMapIntensity:.08});
        const mesh=new THREE.Mesh(geometry,mat);mesh.name='Concrete Circuit Barrier';mesh.receiveShadow=true;mesh.castShadow=true;scene.add(mesh);
        const count=Math.ceil(CURVE_SAMPLES/12),reflectors=new THREE.InstancedMesh(new THREE.BoxGeometry(.1,.12,.55),new THREE.MeshStandardMaterial({color:0xe6b66b,emissive:0xd39e4e,emissiveIntensity:.35,roughness:.33,metalness:.4}),count);
        const transform=new THREE.Object3D();let c=0;
        for(let i=0;i<CURVE_SAMPLES;i+=12){const p=trackPoints[i],n=trackNormals[i],t=trackTangents[i];transform.position.set(p.x+n.x*(offset+.28*sign),.78,p.z+n.z*(offset+.28*sign));transform.rotation.y=Math.atan2(t.x,t.z);transform.updateMatrix();reflectors.setMatrixAt(c++,transform.matrix);}
        reflectors.count=c;reflectors.name='Barrier Reflectors';scene.add(reflectors);
      }
      function initCityAtmosphere(){
        const uniforms={topColor:{value:new THREE.Color()},midColor:{value:new THREE.Color()},horizonColor:{value:new THREE.Color()},sunColor:{value:new THREE.Color()},night:{value:0},sunDirection:{value:new THREE.Vector3(-.62,.16,.76).normalize()}};
        const material=new THREE.ShaderMaterial({uniforms,side:THREE.BackSide,depthWrite:false,fog:false,
          vertexShader:'varying vec3 vDirection; void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
          fragmentShader:`varying vec3 vDirection;uniform vec3 topColor,midColor,horizonColor,sunColor,sunDirection;uniform float night;
            float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
            float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
            void main(){vec3 d=normalize(vDirection);float y=max(0.0,d.y);vec3 col=mix(horizonColor,midColor,smoothstep(0.0,.26,y));col=mix(col,topColor,smoothstep(.15,.85,y));
              vec2 p=d.xz/(max(.12,d.y+.12))*2.8;float clouds=.6*noise(p)+.27*noise(p*2.1)+.13*noise(p*4.2);
              float c=smoothstep(.54,.72,clouds)*smoothstep(0.02,.25,y)*(1.0-smoothstep(.6,.95,y));col=mix(col,col*.67+vec3(.03),c*(1.0-night*.5));
              float mu=max(0.0,dot(d,sunDirection));col+=sunColor*(pow(mu,250.0)*.16+pow(mu,12000.0)*1.7)*(1.0-night);
              gl_FragColor=vec4(col,1.0);
              #include <tonemapping_fragment>
              #include <encodings_fragment>
            }`});
        skyDome=new THREE.Mesh(new THREE.SphereGeometry(900,32,18),material);skyDome.name='Atmospheric City Sky';skyDome.renderOrder=-100;skyDome.frustumCulled=false;scene.add(skyDome);
      }
      function applyTimeOfDay(refreshReflection=true){
        const preset=getEnvironmentPreset();
        if(skyDome){const u=skyDome.material.uniforms;u.topColor.value.setHex(preset.top).convertSRGBToLinear();u.midColor.value.setHex(preset.middle).convertSRGBToLinear();u.horizonColor.value.setHex(preset.horizon).convertSRGBToLinear();u.sunColor.value.setHex(preset.sun).convertSRGBToLinear();u.night.value=settings.timeOfDay==='night'?1:0;scene.background=null;}
        if(scene.fog){scene.fog.color.setHex(preset.fog).convertSRGBToLinear();scene.fog.density=preset.density;}
        if(raceKey){raceKey.color.setHex(preset.sun);raceKey.intensity=preset.key;}
        if(raceHemi){raceHemi.color.setHex(settings.timeOfDay==='night'?0x94b3e0:0xc1cee0);raceHemi.intensity=preset.hemi;}
        if(raceRim)raceRim.intensity=preset.rim;
        cityWorld?.setTimeOfDay?.(settings.timeOfDay);
        if(streetLightPool)streetLightPool.material.opacity=settings.timeOfDay==='night'?.20:.075;
        const stars=scene.getObjectByName('city-stars');if(stars)stars.visible=settings.timeOfDay==='night';
        $('time-select').value=settings.timeOfDay;
        $('ticket-time').textContent=settings.timeOfDay==='night'?'Malam':'Senja';
        $('tour-time').textContent=settings.timeOfDay==='night'?'MALAM':'SENJA';
        if(refreshReflection&&trackPoints.length)captureCityReflections();
      }
      function buildCityStreetLights(){
        streetLampRoot=new THREE.Group();streetLampRoot.name='Architectural Street Lighting';scene.add(streetLampRoot);
        const placements=[];
        const interval=settings.circuit==='city'?13:settings.circuit==='beach'?22:20;
        for(let i=2;i<CURVE_SAMPLES;i+=interval)for(const side of [-1,1]){
          const p=trackPoints[i],n=trackNormals[i],t=trackTangents[i],angle=Math.atan2(t.x,t.z);
          placements.push({x:p.x+n.x*(ROAD_HALF+3.5)*side,z:p.z+n.z*(ROAD_HALF+3.5)*side,angle,side,n,headX:p.x+n.x*(ROAD_HALF+1.2)*side,headZ:p.z+n.z*(ROAD_HALF+1.2)*side});
        }
        const steel=new THREE.MeshStandardMaterial({color:0x343a40,roughness:.49,metalness:.64});
        const base=new THREE.MeshStandardMaterial({color:0x5b6060,roughness:.92});
        const led=new THREE.MeshStandardMaterial({color:0xffedd5,emissive:0xffd0a0,emissiveIntensity:2.3,roughness:.35,toneMapped:false});
        const transform=new THREE.Object3D();
        function instances(geometry,material,name,place){
          const mesh=new THREE.InstancedMesh(geometry,material,placements.length);mesh.name=name;
          placements.forEach((p,i)=>{transform.position.set(0,0,0);transform.rotation.set(0,0,0);transform.scale.set(1,1,1);place(p,transform);transform.updateMatrix();mesh.setMatrixAt(i,transform.matrix);});
          mesh.receiveShadow=true;mesh.castShadow=true;streetLampRoot.add(mesh);return mesh;
        }
        instances(new THREE.CylinderGeometry(.10,.15,8.5,8),steel,'Streetlight Poles',(p,o)=>{o.position.set(p.x,4.45,p.z);});
        instances(new THREE.CylinderGeometry(.28,.34,.45,8),base,'Lamp Foundations',(p,o)=>{o.position.set(p.x,.22,p.z);});
        instances(new THREE.BoxGeometry(2.4,.12,.16),steel,'Cantilever Arms',(p,o)=>{o.position.set((p.x+p.headX)/2,8.55,(p.z+p.headZ)/2);o.rotation.y=p.angle;});
        instances(new THREE.BoxGeometry(1.05,.19,.48),steel,'Lamp Housing',(p,o)=>{o.position.set(p.headX,8.52,p.headZ);o.rotation.y=p.angle;});
        instances(new THREE.BoxGeometry(.86,.035,.36),led,'Warm LED Panels',(p,o)=>{o.position.set(p.headX,8.412,p.headZ);o.rotation.y=p.angle;});
        const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;const ctx=canvas.getContext('2d');
        const gradient=ctx.createRadialGradient(128,128,5,128,128,125);gradient.addColorStop(0,'rgba(255,214,157,.58)');gradient.addColorStop(.32,'rgba(255,216,163,.27)');gradient.addColorStop(1,'rgba(255,216,163,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,256,256);
        const poolMaterial=new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(canvas),transparent:true,opacity:.08,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
        streetLightPool=instances(new THREE.PlaneGeometry(13,25),poolMaterial,'Streetlight Pools',(p,o)=>{o.position.set(p.headX-p.n.x*p.side*3,.034,p.headZ-p.n.z*p.side*3);o.rotation.set(-Math.PI/2,0,-p.angle);});
        streetLightPool.castShadow=false;streetLightPool.receiveShadow=false;streetLightPool.renderOrder=2;
        streetLampData=placements;
        for(let i=0;i<4;i++){
          const light=new THREE.SpotLight(0xffd1a0,1.4,34,.76,.76,1.0);light.castShadow=false;light.visible=i<2;
          light.target=new THREE.Object3D();scene.add(light,light.target);nearStreetLights.push(light);
        }
      }
      function updateStreetLights(dt,position){
        streetLightTick+=dt;if(streetLightTick<.45&&nearStreetLights[0]?.userData.placed)return;streetLightTick=0;
        const enabled=settings.quality==='high'?4:settings.quality==='low'?0:2;
        const nearest=streetLampData.map((p,i)=>({i,d:(p.headX-position.x)**2+(p.headZ-position.z)**2})).sort((a,b)=>a.d-b.d).slice(0,enabled);
        nearStreetLights.forEach((light,i)=>{
          light.visible=i<nearest.length;
          if(!light.visible)return;
          const p=streetLampData[nearest[i].i];light.position.set(p.headX,8.3,p.headZ);light.target.position.set(p.headX-p.n.x*p.side*3,0,p.headZ-p.n.z*p.side*3);light.target.updateMatrixWorld();
          light.intensity=settings.timeOfDay==='night'?2.4:.8;light.userData.placed=true;
        });
      }
      function captureCityReflections(){
        if(!renderer||!trackPoints.length||!skyDome)return;
        const prevEnv=scene.environment,previousShadow=renderer.shadowMap.enabled,oldTarget=renderer.getRenderTarget();
        const hidden=allRacers.map(r=>({root:r.visual.root,visible:r.visual.root.visible}));
        try{
          if(!cityCubeTarget){cityCubeTarget=new THREE.WebGLCubeRenderTarget(128,{generateMipmaps:true,minFilter:THREE.LinearMipmapLinearFilter,encoding:THREE.sRGBEncoding});cityCubeCamera=new THREE.CubeCamera(.1,1600,cityCubeTarget);}
          scene.environment=null;renderer.shadowMap.enabled=false;hidden.forEach(x=>x.root.visible=false);
          cityCubeCamera.position.copy(trackPoints[0]);cityCubeCamera.position.y=2.2;skyDome.position.copy(cityCubeCamera.position);
          cityCubeCamera.update(renderer,scene);
          const pmrem=new THREE.PMREMGenerator(renderer),target=pmrem.fromCubemap(cityCubeTarget.texture);pmrem.dispose();
          if(cityEnvTarget)cityEnvTarget.dispose();cityEnvTarget=target;scene.environment=target.texture;
        }catch(error){scene.environment=prevEnv;console.warn('Refleksi kota memakai lingkungan studio:',error.message);}
        finally{hidden.forEach(x=>x.root.visible=x.visible);renderer.shadowMap.enabled=previousShadow;renderer.setRenderTarget(oldTarget);renderer.shadowMap.needsUpdate=true;garageNeedsRender=true;}
      }
      function applyCityQuality(){
        cityWorld?.setQuality?.(settings.quality);
        if(raceKey){const size=settings.quality==='high'?2048:1024;if(raceKey.shadow.mapSize.x!==size){raceKey.shadow.mapSize.set(size,size);if(raceKey.shadow.map){raceKey.shadow.map.dispose();raceKey.shadow.map=null;}}}
        if(garageKey){const size=settings.quality==='high'?2048:1024;if(garageKey.shadow.mapSize.x!==size){garageKey.shadow.mapSize.set(size,size);if(garageKey.shadow.map){garageKey.shadow.map.dispose();garageKey.shadow.map=null;}}}
        streetLightTick=1000;updateRivalDetail(0,true);
      }
      function updateCityWorld(dt,position){
        worldElapsed+=dt;cityWorld?.update?.(dt,worldElapsed);updateRivalDetail(dt);
        allRacers.forEach(r=>NVImportedCars.updateEffects?.(r.visual,worldElapsed));
        if(skyDome)skyDome.position.copy(camera.position);
        updateStreetLights(dt,position||camera.position);
        if(raceKey){const p=position||camera.position;raceKey.position.set(p.x+38,64,p.z-46);raceKey.target.position.set(p.x,0,p.z);}
      }
      function enterCityTour(){
        if(!gameReady)return;stopEnginePreview();clearInput();GameState.mode='TOUR';tourT=.11;tourCameraReady=false;
        DOM.startOverlay.classList.add('hidden');DOM.hudLayer.classList.add('hidden');DOM.finishOverlay.classList.add('hidden');$('pause-overlay').classList.add('hidden');
        $('tour-overlay').classList.remove('hidden');allRacers.forEach(r=>r.visual.root.visible=false);
        DOM.nitroVignette.style.opacity='0';DOM.speedlinesCanvas.style.opacity='0';
        renderer.toneMappingExposure=getEnvironmentPreset().exposure;
        if(audio.ctx)audio.ctx.suspend().catch(()=>{});document.activeElement?.blur();
      }
      function updateCityTour(dt){
        tourT=currentCircuit().open?Math.min(1,tourT+dt*16/trackTotalLength):(tourT+dt*16/trackTotalLength)%1;
        const p=trackCurve.getPointAt(tourT),t=trackCurve.getTangentAt(tourT),n=new THREE.Vector3(-t.z,0,t.x);
        const desired=p.clone().addScaledVector(n,-3.2);desired.y=5.1;
        if(!tourCameraReady){camera.position.copy(desired);tourCameraReady=true;}else camera.position.lerp(desired,Math.min(1,dt*4));
        const ahead=trackCurve.getPointAt(currentCircuit().open?tourT+.035:(tourT+.035)%1);ahead.y=9;
        camera.fov=59;camera.updateProjectionMatrix();camera.lookAt(ahead);
        updateCityWorld(dt,camera.position);
        renderer.setScissorTest(false);renderer.setViewport(0,0,innerWidth,innerHeight);renderer.render(scene,camera);
      }
      function bindCityControls(){
        $('time-select').addEventListener('change',e=>{settings.timeOfDay=e.target.value;applyTimeOfDay();persistSettings();});
        $('btn-city-tour').addEventListener('click',enterCityTour);
        $('btn-tour-garage').addEventListener('click',goToGarage);
        $('collection-prev').addEventListener('click',()=>scrollCars(-1));$('collection-next').addEventListener('click',()=>scrollCars(1));
        function scrollCars(direction){const el=$('car-cards'),distance=Math.max(180,el.clientWidth*.65);if(el.scrollBy)el.scrollBy({left:direction*distance,behavior:'smooth'});else el.scrollLeft+=direction*distance;}
      }


      // =========================================================================
      // 1. KONSTANTA & KONFIGURASI GAME
      // =========================================================================
      let TOTAL_LAPS = settings.laps;
      const ROAD_WIDTH = 22;           // Lebar total jalan (meter)
      const ROAD_HALF = ROAD_WIDTH / 2;
      const CURVE_SAMPLES = 480;       // Resolusi titik sampel kurva sirkuit
      const CAR_HALF_WIDTH = 1.25;
      const CAR_LENGTH = 4.4;

      // Status permainan global
      const GameState = {
        mode: 'MENU', // 'MENU' | 'COUNTDOWN' | 'RACING' | 'FINISHED'
        cameraMode: 0, // 0 Chase, 1 Hood, 2 Close, 3 Interior / dashboard
        muted: false,
        raceStartTime: 0,
        lapStartTime: 0,
        currentLap: 1,
        bestLapTime: Infinity,
        totalRaceTime: 0,
        countdownVal: 3,
        countdownTimer: 0,
        // Kontrol kamera mouse (free-look sementara)
        mouseDrag: false,
        lastMouseX: 0,
        lastMouseY: 0,
        camYawOffset: 0,
        camPitchOffset: 0
      };

      // Status input keyboard & sentuh
      const Input = {
        up: false,
        down: false,
        left: false,
        right: false,
        nitro: false
      };
      const touchPointers = new Map();

      // Referensi DOM
      const DOM = {
        container: document.getElementById('game-container'),
        hudLayer: document.getElementById('hud-layer'),
        startOverlay: document.getElementById('start-overlay'),
        finishOverlay: document.getElementById('finish-overlay'),
        btnStart: document.getElementById('btn-start-race'),
        btnPlayAgain: document.getElementById('btn-play-again'),
        btnCam: document.getElementById('btn-cam'),
        camLabel: document.getElementById('cam-label'),
        btnReset: document.getElementById('btn-reset'),
        btnMute: document.getElementById('btn-mute'),
        muteIcon: document.getElementById('mute-icon'),
        muteLabel: document.getElementById('mute-label'),
        hudPos: document.getElementById('hud-pos'),
        hudLap: document.getElementById('hud-lap'),
        hudLapTime: document.getElementById('hud-lap-time'),
        hudBestLap: document.getElementById('hud-best-lap'),
        hudSpeed: document.getElementById('hud-speed'),
        hudGear: document.getElementById('hud-gear'),
        hudRpmVal: document.getElementById('hud-rpm-val'),
        hudRpmBar: document.getElementById('hud-rpm-bar'),
        hudNitroPct: document.getElementById('hud-nitro-pct'),
        hudNitroBar: document.getElementById('hud-nitro-bar'),
        countdown: document.getElementById('countdown-display'),
        statusBanner: document.getElementById('status-banner'),
        minimapCanvas: document.getElementById('minimap-canvas'),
        speedlinesCanvas: document.getElementById('speedlines-canvas'),
        nitroVignette: document.getElementById('nitro-vignette'),
        finishTitle: document.getElementById('finish-title'),
        finishBadge: document.getElementById('finish-badge'),
        finishTotalTime: document.getElementById('finish-total-time'),
        finishBestLap: document.getElementById('finish-best-lap'),
        finishStandings: document.getElementById('finish-standings'),
        touchLeft: document.getElementById('touch-left-controls'),
        touchRight: document.getElementById('touch-right-controls')
      };

      // =========================================================================
      // 2. AUDIO PROSEDURAL (WEB AUDIO API)
      // =========================================================================
/* UVelocity — architecture-based procedural engine audio.
 * Original synthesis; no manufacturer recordings or measured exhaust signatures.
 * Engine layouts/induction are sourced in audio-references/engine-configurations.json.
 * RPM ranges, gearing, harmonic weights, exhaust resonances and shifts are game tuning.
 * This file replaces the original ProceduralAudio class inside the game's IIFE.
 */
const NV_AUDIO_PROFILES = Object.freeze({
  veloce:Object.freeze({id:'veloce',label:'V12 · aspirasi alami',character:'Putaran tinggi, halus, dan terang',cylinders:12,layout:'V12',turbochargers:0,idleRpm:950,redlineRpm:9000,gears:7,group:[0,1/6,2/6,3/6,4/6,5/6],fireMix:.57,bankMix:.43,crankMix:.055,edge:1.25,pulseVariation:.018,bodyHz:285,bodyGain:2.8,intakeHz:1650,intakeGain:2.5,maxCutoff:4350,drive:1.32,level:.94,roughness:1.8,shiftTime:.12,turboBase:0,turboRange:0,spoolTime:.4,releaseLevel:0,overrun:.12}),
  apex:Object.freeze({id:'apex',label:'Inline-6 · aspirasi alami',character:'Enam silinder klasik dengan nada sedang',cylinders:6,layout:'inline-6',turbochargers:0,idleRpm:850,redlineRpm:7800,gears:5,group:[0,1/3,2/3],fireMix:.56,bankMix:.50,crankMix:.065,edge:1.45,pulseVariation:.035,bodyHz:235,bodyGain:4.5,intakeHz:1220,intakeGain:2.1,maxCutoff:3500,drive:1.48,level:1.00,roughness:3.3,shiftTime:.21,turboBase:0,turboRange:0,spoolTime:.4,releaseLevel:0,overrun:.10}),
  cinder:Object.freeze({id:'cinder',label:'V8 · cross-plane',character:'Bass tebal dengan denyut knalpot tidak rata',cylinders:8,layout:'V8',turbochargers:0,idleRpm:750,redlineRpm:6800,gears:6,group:[0,.125,.375,.750],fireMix:.34,bankMix:.68,crankMix:.095,edge:1.12,pulseVariation:.060,bodyHz:105,bodyGain:5.8,intakeHz:630,intakeGain:2.2,maxCutoff:2550,drive:1.70,level:.90,roughness:5.8,shiftTime:.20,turboBase:0,turboRange:0,spoolTime:.4,releaseLevel:0,overrun:.24}),
  kaze:Object.freeze({id:'kaze',label:'Boxer-4 · turbo',character:'Denyut rally, desis turbo, dan pelepasan tekanan',cylinders:4,layout:'boxer-4',turbochargers:1,idleRpm:950,redlineRpm:7800,gears:6,group:[0,.12,.50,.62],fireMix:.43,bankMix:.61,crankMix:.070,edge:1.08,pulseVariation:.045,bodyHz:155,bodyGain:4.8,intakeHz:1030,intakeGain:2.3,maxCutoff:3250,drive:1.62,level:.95,roughness:4.6,shiftTime:.16,turboBase:1180,turboRange:1900,spoolTime:.43,releaseLevel:.92,overrun:.12}),
  brz:Object.freeze({id:'brz',label:'Boxer-4 · aspirasi alami',character:'Nada empat silinder yang ringan dan responsif',cylinders:4,layout:'boxer-4',turbochargers:0,idleRpm:850,redlineRpm:7400,gears:6,group:[0,.50],fireMix:.67,bankMix:.35,crankMix:.065,edge:1.12,pulseVariation:.020,bodyHz:185,bodyGain:3.7,intakeHz:880,intakeGain:2.8,maxCutoff:3300,drive:1.38,level:1.02,roughness:2.7,shiftTime:.20,turboBase:0,turboRange:0,spoolTime:.4,releaseLevel:0,overrun:.04}),
  skyline:Object.freeze({id:'skyline',label:'Inline-6 · twin-turbo',character:'Putaran halus, spool bertahap, dan desis saat gas dilepas',cylinders:6,layout:'inline-6',turbochargers:2,idleRpm:950,redlineRpm:8000,gears:6,group:[0,1/3,2/3],fireMix:.63,bankMix:.42,crankMix:.052,edge:1.52,pulseVariation:.016,bodyHz:250,bodyGain:4.2,intakeHz:1560,intakeGain:2.7,maxCutoff:3950,drive:1.42,level:.99,roughness:2.5,shiftTime:.19,turboBase:970,turboRange:1880,spoolTime:.53,releaseLevel:1.0,overrun:.07}),
  aventador:Object.freeze({id:'aventador',label:'V12 · aspirasi alami',character:'Denyut rapat dan raungan tajam pada putaran tinggi',cylinders:12,layout:'V12',turbochargers:0,idleRpm:900,redlineRpm:8500,gears:7,group:[0,1/6,2/6,3/6,4/6,5/6],fireMix:.72,bankMix:.31,crankMix:.035,edge:.96,pulseVariation:.010,bodyHz:390,bodyGain:3.0,intakeHz:2540,intakeGain:3.8,maxCutoff:5550,drive:1.50,level:.96,roughness:1.6,shiftTime:.13,turboBase:0,turboRange:0,spoolTime:.4,releaseLevel:0,overrun:.20}),
  veyron77:Object.freeze({id:'veyron77',label:'W16 · quad-turbo',character:'Raungan padat dengan bass dalam dan turbo lembut',cylinders:16,layout:'W16',turbochargers:4,idleRpm:900,redlineRpm:6500,gears:7,group:[0,.25,.50,.75],fireMix:.34,bankMix:.65,crankMix:.105,edge:1.65,pulseVariation:.012,bodyHz:118,bodyGain:5.2,intakeHz:780,intakeGain:2.9,maxCutoff:2900,drive:1.33,level:1.03,roughness:1.5,shiftTime:.11,turboBase:760,turboRange:1680,spoolTime:.36,releaseLevel:.40,overrun:.025}),
  'bmw-hybrid-v8':Object.freeze({id:'bmw-hybrid-v8',label:'V8 hybrid · sintesis',character:'Denyut prototype dan desis induksi; karakter audio game',cylinders:8,layout:'V8',turbochargers:2,idleRpm:1100,redlineRpm:8200,gears:7,group:[0,.125,.375,.750],fireMix:.61,bankMix:.44,crankMix:.052,edge:1.18,pulseVariation:.015,bodyHz:270,bodyGain:4.0,intakeHz:1850,intakeGain:3.1,maxCutoff:4450,drive:1.43,level:.96,roughness:2.1,shiftTime:.09,turboBase:1320,turboRange:2300,spoolTime:.29,releaseLevel:.45,overrun:.09}),
  'bmw-m4-gt4':Object.freeze({id:'bmw-m4-gt4',label:'Inline-6 turbo · sintesis',character:'Nada enam silinder balap dengan pelepasan tekanan',cylinders:6,layout:'inline-6',turbochargers:2,idleRpm:1050,redlineRpm:7600,gears:7,group:[0,1/3,2/3],fireMix:.65,bankMix:.39,crankMix:.061,edge:1.36,pulseVariation:.022,bodyHz:220,bodyGain:4.3,intakeHz:1370,intakeGain:2.7,maxCutoff:3750,drive:1.52,level:.97,roughness:2.8,shiftTime:.13,turboBase:1100,turboRange:2020,spoolTime:.39,releaseLevel:.84,overrun:.13}),
  'amg-gt4':Object.freeze({id:'amg-gt4',label:'V8 twin-turbo · sintesis',character:'Bass V8 rapat dengan induksi turbo',cylinders:8,layout:'V8',turbochargers:2,idleRpm:980,redlineRpm:7100,gears:6,group:[0,.125,.375,.750],fireMix:.42,bankMix:.63,crankMix:.088,edge:1.15,pulseVariation:.042,bodyHz:145,bodyGain:5.2,intakeHz:1020,intakeGain:2.6,maxCutoff:3350,drive:1.64,level:.94,roughness:4.6,shiftTime:.12,turboBase:1040,turboRange:1770,spoolTime:.34,releaseLevel:.65,overrun:.17}),
  'sls-amg-gt3':Object.freeze({id:'sls-amg-gt3',label:'V8 aspirasi alami · sintesis',character:'Raungan bass V8 dan resonansi intake balap',cylinders:8,layout:'V8',turbochargers:0,idleRpm:1050,redlineRpm:7800,gears:6,group:[0,.125,.375,.750],fireMix:.49,bankMix:.60,crankMix:.079,edge:1.03,pulseVariation:.038,bodyHz:172,bodyGain:5.0,intakeHz:1280,intakeGain:3.4,maxCutoff:4050,drive:1.66,level:.92,roughness:4.0,shiftTime:.11,turboBase:0,turboRange:0,spoolTime:.4,releaseLevel:0,overrun:.22}),
  'batmobile-1989':Object.freeze({id:'batmobile-1989',label:'Turbin fiksi · sintesis',character:'Desis turbin sinematik; bukan rekaman kendaraan',cylinders:2,layout:'fictional-turbine',turbochargers:1,idleRpm:18000,redlineRpm:48000,gears:1,group:[0,.5],fireMix:.24,bankMix:.38,crankMix:.018,edge:2.35,pulseVariation:0,bodyHz:200,bodyGain:2.0,intakeHz:2100,intakeGain:3.8,maxCutoff:5200,drive:1.12,level:.80,roughness:.6,shiftTime:.32,turboBase:1450,turboRange:3100,spoolTime:.95,releaseLevel:.16,overrun:0}),
  'jesko-absolut':Object.freeze({id:'jesko-absolut',label:'V8 twin-turbo · sintesis',character:'Putaran tinggi dan nada turbo yang terang',cylinders:8,layout:'V8',turbochargers:2,idleRpm:1050,redlineRpm:8600,gears:9,group:[0,.25,.50,.75],fireMix:.72,bankMix:.32,crankMix:.041,edge:1.05,pulseVariation:.010,bodyHz:335,bodyGain:3.5,intakeHz:2150,intakeGain:3.3,maxCutoff:4850,drive:1.45,level:.94,roughness:1.6,shiftTime:.085,turboBase:1150,turboRange:2200,spoolTime:.36,releaseLevel:.62,overrun:.11}),
  'venom-f5':Object.freeze({id:'venom-f5',label:'V8 twin-turbo · sintesis',character:'Bass besar dan pelepasan turbo pendek',cylinders:8,layout:'V8',turbochargers:2,idleRpm:980,redlineRpm:8400,gears:7,group:[0,.125,.375,.750],fireMix:.46,bankMix:.64,crankMix:.082,edge:1.06,pulseVariation:.029,bodyHz:138,bodyGain:5.2,intakeHz:1250,intakeGain:3.0,maxCutoff:3900,drive:1.66,level:.94,roughness:3.9,shiftTime:.12,turboBase:920,turboRange:2300,spoolTime:.41,releaseLevel:.75,overrun:.16}),
  'panther-grand-touring':Object.freeze({id:'panther-grand-touring',label:'Diesel inline-4 · sintesis',character:'Denyut diesel rendah, ketukan mekanis, dan turbo lembut',cylinders:4,layout:'inline-4',fuel:'diesel',turbochargers:1,idleRpm:780,redlineRpm:4600,gears:5,group:[0,.50],fireMix:.74,bankMix:.44,crankMix:.13,edge:1.04,pulseVariation:.075,bodyHz:125,bodyGain:5.0,intakeHz:680,intakeGain:1.7,maxCutoff:2350,drive:1.57,level:.94,roughness:7.4,shiftTime:.30,turboBase:650,turboRange:1050,spoolTime:.85,releaseLevel:.08,overrun:0}),
  'honda-crv-rs':Object.freeze({id:'honda-crv-rs',gearRatios:Object.freeze([1.24]),label:'Hybrid inline-4 · sintesis',character:'Empat silinder SUV yang halus; suara sintetis untuk permainan',cylinders:4,layout:'inline-4',fuel:'hybrid',turbochargers:0,idleRpm:850,redlineRpm:6200,gears:1,group:[0,.50],fireMix:.65,bankMix:.35,crankMix:.05,edge:1.18,pulseVariation:.015,bodyHz:165,bodyGain:3.4,intakeHz:900,intakeGain:1.8,maxCutoff:3000,drive:1.25,level:.83,roughness:2.2,shiftTime:.26,turboBase:0,turboRange:0,spoolTime:.5,releaseLevel:0,overrun:0}),
  'mitsubishi-pajero-sport':Object.freeze({id:'mitsubishi-pajero-sport',gearRatios:Object.freeze([.14,.23,.34,.46,.59,.74,.93,1.24]),label:'Turbodiesel inline-4 · sintesis',character:'Bass diesel dan desis turbo untuk SUV off-road',cylinders:4,layout:'inline-4',fuel:'diesel',turbochargers:1,idleRpm:750,redlineRpm:4500,gears:8,group:[0,.50],fireMix:.76,bankMix:.41,crankMix:.12,edge:1.07,pulseVariation:.065,bodyHz:118,bodyGain:5.2,intakeHz:710,intakeGain:1.9,maxCutoff:2450,drive:1.55,level:.93,roughness:6.6,shiftTime:.24,turboBase:680,turboRange:1280,spoolTime:.74,releaseLevel:.10,overrun:0}),
  'toyota-fortuner':Object.freeze({id:'toyota-fortuner',label:'Turbodiesel inline-4 · sintesis',character:'Denyut diesel dalam dengan induksi turbo bertahap',cylinders:4,layout:'inline-4',fuel:'diesel',turbochargers:1,idleRpm:770,redlineRpm:4600,gears:6,group:[0,.50],fireMix:.72,bankMix:.45,crankMix:.11,edge:1.10,pulseVariation:.060,bodyHz:130,bodyGain:4.9,intakeHz:760,intakeGain:2.0,maxCutoff:2550,drive:1.50,level:.92,roughness:6.0,shiftTime:.26,turboBase:720,turboRange:1240,spoolTime:.78,releaseLevel:.09,overrun:0}),
  'toyota-innova-zenix':Object.freeze({id:'toyota-innova-zenix',gearRatios:Object.freeze([1.24]),label:'Hybrid inline-4 · sintesis',character:'Nada MPV empat silinder yang lembut; suara sintetis permainan',cylinders:4,layout:'inline-4',fuel:'hybrid',turbochargers:0,idleRpm:820,redlineRpm:6000,gears:1,group:[0,.50],fireMix:.63,bankMix:.36,crankMix:.06,edge:1.14,pulseVariation:.018,bodyHz:155,bodyGain:3.6,intakeHz:860,intakeGain:1.7,maxCutoff:2850,drive:1.28,level:.84,roughness:2.4,shiftTime:.28,turboBase:0,turboRange:0,spoolTime:.5,releaseLevel:0,overrun:0})
});

class ProceduralAudio {
  constructor(options={}) {
    this.ctx=options.context||null;this.initialized=false;this.muted=false;this.volume=.54;
    this.vehicleId='veloce';this.profile=NV_AUDIO_PROFILES.veloce;this.isPreviewing=false;
    this.state={vehicleId:this.vehicleId,rpm:this.profile.idleRpm,rpmNorm:0,load:0,boost:0,gear:'N',active:false,shifting:false,preview:false,firingHz:0,cycleHz:0,cutoffHz:0};
    this.masterGain=null;this.engineGain=null;this.nitroGain=null;this.driftGain=null;
    this.engineOsc1=null;this.engineOsc2=null;this.engineFilter=null;
    this.voices=[];this._voiceIndex=0;this._nodes=[];this._sources=[];this._paramTargets=new Map();this._waveCache=new Map();
    this._seed=(options.seed===undefined?0x5a17c9e3:options.seed)>>>0;this._lastTime=null;this._lastSpeed=0;this._lastGear='N';this._lastLoad=0;this._lastShift=-Infinity;this._lastRelease=-Infinity;this._lastImpact=-Infinity;this._shiftUntil=0;this._fxCursor=0;this._previewToken=0;this._previewTimer=null;this._previewEndTimer=null;this._previewResolve=null;this._raceActive=false;
  }
  _clamp(value,min=0,max=1){return Math.max(min,Math.min(max,Number(value)||0));}
  _now(){return this.ctx?this.ctx.currentTime:0;}
  _node(node){this._nodes.push(node);return node;}
  _gain(value=1){const n=this._node(this.ctx.createGain());n.gain.value=value;return n;}
  _filter(type,frequency,q=.707,gain=0){const n=this._node(this.ctx.createBiquadFilter());n.type=type;n.frequency.value=frequency;n.Q.value=q;n.gain.value=gain;return n;}
  _osc(type='sine',frequency=100){const n=this._node(this.ctx.createOscillator());n.type=type;n.frequency.value=frequency;this._sources.push(n);return n;}
  _target(param,value,tau=.05,when=this._now()){
    if(!param||!Number.isFinite(value))return;
    const previous=this._paramTargets.get(param);if(previous!==undefined&&Math.abs(previous-value)<Math.max(.00001,Math.abs(value)*.00006))return;
    this._paramTargets.set(param,value);param.cancelScheduledValues(when);param.setTargetAtTime(value,when,Math.max(.003,tau));
  }
  _curve(drive=1.3,cap=1){const values=new Float32Array(2049),normalizer=Math.tanh(drive);for(let i=0;i<values.length;i++)values[i]=cap*Math.tanh((2*i/(values.length-1)-1)*drive)/normalizer;return values;}
  _makeNoise(){
    const buffer=this.ctx.createBuffer(1,Math.ceil(this.ctx.sampleRate*4),this.ctx.sampleRate),data=buffer.getChannelData(0);let seed=this._seed||1;
    for(let i=0;i<data.length;i++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;data[i]=((seed>>>0)/4294967296)*2-1;}return buffer;
  }
  _wave(profile,bank){
    const key=profile.id+(bank?':exhaust':':combustion');if(this._waveCache.has(key))return this._waveCache.get(key);
    const phases=bank?profile.group:Array.from({length:profile.cylinders},(_,i)=>i/profile.cylinders),count=phases.length;
    const real=new Float32Array(129),imag=new Float32Array(129);
    for(let h=1;h<real.length;h++){
      const envelope=Math.exp(-h/(count*6.5))/Math.pow(1+h/count,profile.edge);
      let a=0,b=0;for(let k=0;k<count;k++){const strength=1+profile.pulseVariation*Math.cos(k*2.39996323+bank*.65),phase=2*Math.PI*h*phases[k];a+=strength*Math.cos(phase);b-=strength*Math.sin(phase);}
      // A finite-bandwidth combustion pulse, with no DC component or raw sawtooth.
      real[h]=a/count*envelope;imag[h]=b/count*envelope;
    }
    const wave=this.ctx.createPeriodicWave(real,imag,{disableNormalization:false});this._waveCache.set(key,wave);return wave;
  }
  _voice(index){
    const v={index,profile:null};v.fireOsc=this._osc();v.exhaustOsc=this._osc();v.crankOsc=this._osc('sine');v.fireGain=this._gain();v.exhaustGain=this._gain();v.crankGain=this._gain();v.mix=this._gain();
    v.fireOsc.connect(v.fireGain);v.exhaustOsc.connect(v.exhaustGain);v.crankOsc.connect(v.crankGain);v.fireGain.connect(v.mix);v.exhaustGain.connect(v.mix);v.crankGain.connect(v.mix);
    v.saturation=this._node(this.ctx.createWaveShaper());v.saturation.curve=this._curve();v.saturation.oversample='2x';
    v.lowpass=this._filter('lowpass',800,.65);v.body=this._filter('peaking',180,.8,3);v.intakeEQ=this._filter('peaking',1200,.72,2);v.highpass=this._filter('highpass',28,.6);
    v.level=this._gain(0);v.select=this._gain(index===0?1:0);v.mix.connect(v.saturation);v.saturation.connect(v.lowpass);v.lowpass.connect(v.body);v.body.connect(v.intakeEQ);v.intakeEQ.connect(v.highpass);v.highpass.connect(v.level);v.level.connect(v.select);v.select.connect(this.engineDuck);
    v.intakeFilter=this._filter('bandpass',1050,.75);v.intakeGain=this._gain(0);this.noiseSource.connect(v.intakeFilter);v.intakeFilter.connect(v.intakeGain);v.intakeGain.connect(v.level);
    v.roughGain=this._gain(0);this.roughFilter.connect(v.roughGain);v.roughGain.connect(v.fireOsc.detune);v.roughGain.connect(v.exhaustOsc.detune);
    return v;
  }
  _configureVoice(v,profile){
    v.profile=profile;v.fireOsc.setPeriodicWave(this._wave(profile,false));v.exhaustOsc.setPeriodicWave(this._wave(profile,true));v.saturation.curve=this._curve(profile.drive);
    v.body.frequency.value=profile.bodyHz;v.body.gain.value=profile.bodyGain;v.intakeEQ.frequency.value=profile.intakeHz;v.intakeEQ.gain.value=profile.intakeGain;v.roughGain.gain.value=profile.roughness;
    const hz=profile.idleRpm/120;v.fireOsc.frequency.value=hz;v.exhaustOsc.frequency.value=hz;v.crankOsc.frequency.value=hz*2;
    v.fireGain.gain.value=profile.fireMix;v.exhaustGain.gain.value=profile.bankMix;v.crankGain.gain.value=profile.crankMix;
    for(const p of [v.fireOsc.frequency,v.exhaustOsc.frequency,v.crankOsc.frequency,v.fireGain.gain,v.exhaustGain.gain,v.crankGain.gain,v.lowpass.frequency,v.level.gain,v.intakeGain.gain])this._paramTargets.delete(p);
  }
  _aliases(){const v=this.voices[this._voiceIndex];if(v){this.engineOsc1=v.fireOsc;this.engineOsc2=v.exhaustOsc;this.engineFilter=v.lowpass;this.engineGain=v.level;}}
  init(){
    if(this.initialized){if(this.ctx?.state==='suspended'&&!this.muted)this.ctx.resume().catch(()=>{});return true;}
    try{
      if(!this.ctx){const AudioCtx=window.AudioContext||window.webkitAudioContext;if(!AudioCtx)return false;this.ctx=new AudioCtx({latencyHint:'interactive'});}
      const c=this.ctx;
      this.masterInput=this._gain(.85);this.dcFilter=this._filter('highpass',24,.6);this.compressor=this._node(c.createDynamicsCompressor());
      this.compressor.threshold.value=-16;this.compressor.knee.value=10;this.compressor.ratio.value=4;this.compressor.attack.value=.008;this.compressor.release.value=.17;
      this.limiter=this._node(c.createWaveShaper());this.limiter.curve=this._curve(1.18,.88);this.limiter.oversample='2x';this.masterGain=this._gain(this.muted?0:this.volume);
      this.masterInput.connect(this.dcFilter);this.dcFilter.connect(this.compressor);this.compressor.connect(this.limiter);this.limiter.connect(this.masterGain);this.masterGain.connect(c.destination);
      this.engineDuck=this._gain(1);this.engineDuck.connect(this.masterInput);
      this.noiseSource=this._node(c.createBufferSource());this.noiseSource.buffer=this._makeNoise();this.noiseSource.loop=true;this._sources.push(this.noiseSource);
      this.roughFilter=this._filter('lowpass',18,.5);this.noiseSource.connect(this.roughFilter);
      this.voices=[this._voice(0),this._voice(1)];this._configureVoice(this.voices[0],this.profile);this._configureVoice(this.voices[1],this.profile);this._aliases();
      this.turboFilter=this._filter('bandpass',1800,.8);this.turboGain=this._gain(0);this.noiseSource.connect(this.turboFilter);this.turboFilter.connect(this.turboGain);this.turboGain.connect(this.masterInput);
      this.turboOsc1=this._osc('sine',900);this.turboOsc2=this._osc('sine',1250);this.turboToneGain=this._gain(0);this.turboTone2Gain=this._gain(0);this.turboOsc1.connect(this.turboToneGain);this.turboOsc2.connect(this.turboTone2Gain);this.turboToneGain.connect(this.masterInput);this.turboTone2Gain.connect(this.masterInput);
      this.releaseFilter=this._filter('bandpass',1550,.75);this.releaseGain=this._gain(0);this.noiseSource.connect(this.releaseFilter);this.releaseFilter.connect(this.releaseGain);this.releaseGain.connect(this.masterInput);
      this.nitroFilter=this._filter('bandpass',750,.72);this.nitroGain=this._gain(0);this.noiseSource.connect(this.nitroFilter);this.nitroFilter.connect(this.nitroGain);this.nitroGain.connect(this.masterInput);
      this.driftFilter=this._filter('bandpass',1350,1.35);this.driftGain=this._gain(0);this.noiseSource.connect(this.driftFilter);this.driftFilter.connect(this.driftGain);this.driftGain.connect(this.masterInput);
      this.driftOsc=this._osc('sine',970);this.driftToneGain=this._gain(0);this.driftOsc.connect(this.driftToneGain);this.driftToneGain.connect(this.masterInput);
      this.roadFilter=this._filter('lowpass',520,.6);this.roadGain=this._gain(0);this.noiseSource.connect(this.roadFilter);this.roadFilter.connect(this.roadGain);this.roadGain.connect(this.masterInput);
      this.impactFilter=this._filter('lowpass',620,.65);this.impactGain=this._gain(0);this.noiseSource.connect(this.impactFilter);this.impactFilter.connect(this.impactGain);this.impactGain.connect(this.masterInput);
      this.thumpOsc=this._osc('sine',80);this.thumpGain=this._gain(0);this.thumpOsc.connect(this.thumpGain);this.thumpGain.connect(this.masterInput);
      this.shiftFilter=this._filter('bandpass',480,.7);this.shiftGain=this._gain(0);this.noiseSource.connect(this.shiftFilter);this.shiftFilter.connect(this.shiftGain);this.shiftGain.connect(this.masterInput);
      this.beepVoices=Array.from({length:4},()=>{const osc=this._osc('sine',520),gain=this._gain(0);osc.connect(gain);gain.connect(this.masterInput);return{osc,gain};});
      const now=this._now();for(const source of this._sources)source.start(now);this.initialized=true;
      if(c.state==='suspended'&&!this.muted&&typeof c.resume==='function')c.resume().catch(()=>{});
      return true;
    }catch(error){this._error=String(error);this.dispose();return false;}
  }
  setVehicle(id){
    if(!NV_AUDIO_PROFILES[id])return false;
    const same=this.vehicleId===id;this.vehicleId=id;this.profile=NV_AUDIO_PROFILES[id];this.state.vehicleId=id;
    if(same)return true;
    this._lastGear='N';this._lastLoad=0;this._lastSpeed=0;this._lastTime=null;this._shiftUntil=0;this.state.rpm=this.profile.idleRpm;this.state.rpmNorm=0;this.state.boost=0;this.state.gear='N';
    if(this.initialized){const now=this._now(),old=this.voices[this._voiceIndex],next=this.voices[1-this._voiceIndex];next.select.gain.cancelScheduledValues(now);next.select.gain.setValueAtTime(0,now);this._configureVoice(next,this.profile);next.select.gain.linearRampToValueAtTime(1,now+.09);old.select.gain.cancelScheduledValues(now);old.select.gain.setTargetAtTime(0,now,.028);this._voiceIndex=1-this._voiceIndex;this._aliases();this._target(this.turboGain.gain,0,.025,now);this._target(this.turboToneGain.gain,0,.025,now);this._target(this.turboTone2Gain.gain,0,.025,now);}
    return true;
  }
  setMuted(mute){this.muted=!!mute;if(this.masterGain)this._target(this.masterGain.gain,this.muted?0:this.volume,.022);if(this.muted&&this.isPreviewing)this.stopPreview();}
  setVolume(value){this.volume=this._clamp(value,0,.7);if(this.masterGain)this._target(this.masterGain.gain,this.muted?0:this.volume,.03);}
  getState(){return{...this.state,vehicleId:this.vehicleId,muted:this.muted,isPreviewing:this.isPreviewing,initialized:this.initialized,contextState:this.ctx?.state||'uninitialized',nodeCount:this._nodes.length};}
  _quiet(now=this._now()){
    if(!this.initialized)return;
    for(const v of this.voices)this._target(v.level.gain,0,.035,now);
    for(const n of [this.nitroGain,this.driftGain,this.driftToneGain,this.roadGain,this.turboGain,this.turboToneGain,this.turboTone2Gain,this.releaseGain])this._target(n.gain,0,.035,now);
  }
  updateEngine(rpmNorm,speedNorm,isNitro,driftIntensity,isActive,telemetry={}){
    if(this.isPreviewing&&!telemetry.preview){if(!isActive)return;this.stopPreview();}
    if(!telemetry.preview)this._raceActive=!!isActive;
    this.state.active=!!isActive;this.state.preview=!!telemetry.preview;
    if(!this.initialized||!this.ctx||this.ctx.state==='closed')return;
    const now=this._now(),dt=this._clamp(telemetry.dt===undefined?(this._lastTime===null?1/60:now-this._lastTime):telemetry.dt,1/240,.12),p=this.profile;this._lastTime=now;
    if(!isActive){this.state.load=0;this.state.boost=0;this.state.shifting=false;this._lastLoad=0;this._quiet(now);return;}
    const speed=this._clamp(speedNorm),suppliedRpm=Number(telemetry.rpm),inputNorm=this._clamp(rpmNorm);
    const targetRpm=Number.isFinite(suppliedRpm)&&suppliedRpm>0?this._clamp(suppliedRpm,p.idleRpm*.85,p.redlineRpm*1.015):p.idleRpm+inputNorm*(p.redlineRpm-p.idleRpm);
    const throttle=telemetry.throttle===undefined?(speed>this._lastSpeed+.001?.88:speed<this._lastSpeed-.001?.08:isNitro?1:.58):this._clamp(telemetry.throttle),brake=this._clamp(telemetry.brake);
    const loadTarget=brake>.15?Math.min(throttle,.15):throttle;
    this.state.load+=(loadTarget-this.state.load)*(1-Math.exp(-dt/(loadTarget>this.state.load?.065:.045)));
    this.state.rpm+=(targetRpm-this.state.rpm)*(1-Math.exp(-dt/(targetRpm>this.state.rpm?.065:.095)));
    const n=this._clamp((this.state.rpm-p.idleRpm)/(p.redlineRpm-p.idleRpm)),load=this.state.load,cycle=this.state.rpm/120,gear=telemetry.gear===undefined?this._lastGear:String(telemetry.gear);
    const numericGear=Number(gear),previousGear=Number(this._lastGear);
    if(numericGear>0&&previousGear>0&&numericGear!==previousGear)this.playShiftSound(numericGear>previousGear,.65+.25*load);
    else if(telemetry.gear===undefined&&this.state.rpmNorm-n>.20&&speed>.1)this.playShiftSound(true,.6);
    const previousBoost=this.state.boost,boostTarget=p.turbochargers?load*this._clamp((n-.16)/.64)*(isNitro?1.08:1):0;
    this.state.boost+=(boostTarget-this.state.boost)*(1-Math.exp(-dt/(boostTarget>this.state.boost?p.spoolTime:.14)));
    if(this._lastLoad>.50&&loadTarget<.15&&now-this._lastRelease>.23){
      if(p.turbochargers&&previousBoost>.15)this._airRelease(previousBoost,now);
      else if(p.overrun>.07&&n>.42)this._pulse(this.shiftGain.gain,.018*p.overrun*n,now,.003,.09);
    }
    const v=this.voices[this._voiceIndex],limiter=n>.985&&throttle>.75?.83+.17*Math.sin(now*2*Math.PI*14):1,level=(.13+.13*load+.025*n)*p.level*limiter;
    const cutoff=260+p.maxCutoff*(.14+.86*Math.pow(n,.78))*(.53+.47*load);
    this._target(v.fireOsc.frequency,cycle,.035,now);this._target(v.exhaustOsc.frequency,cycle,.035,now);this._target(v.crankOsc.frequency,cycle*2,.045,now);
    this._target(v.fireGain.gain,p.fireMix*(.52+.48*load),.04,now);this._target(v.exhaustGain.gain,p.bankMix*(.68+.32*load),.045,now);this._target(v.crankGain.gain,p.crankMix*(.65+.35*load),.05,now);
    this._target(v.lowpass.frequency,cutoff,.055,now);this._target(v.body.gain,p.bodyGain+load*1.5,.07,now);this._target(v.intakeEQ.gain,p.intakeGain*(.3+.7*load),.07,now);this._target(v.level.gain,level,.04,now);
    this._target(v.intakeFilter.frequency,Math.min(4600,p.intakeHz*.55+n*1950),.08,now);this._target(v.intakeGain.gain,(.006+.045*load)*(.25+.75*n),.055,now);
    const boost=this.state.boost;this._target(this.turboGain.gain,p.turbochargers?.023*boost*(.30+.70*load):0,.07,now);this._target(this.turboFilter.frequency,1000+boost*2200,.11,now);
    this._target(this.turboOsc1.frequency,p.turboBase+boost*p.turboRange+n*160,.12,now);this._target(this.turboOsc2.frequency,(p.turboBase+boost*p.turboRange)*1.197+n*100,.14,now);
    this._target(this.turboToneGain.gain,p.turbochargers?.0065*boost:0,.09,now);this._target(this.turboTone2Gain.gain,p.turbochargers>1?.0027*boost:0,.10,now);
    this._target(this.nitroGain.gain,isNitro?.036:0,.07,now);this._target(this.nitroFilter.frequency,650+speed*600,.09,now);
    const drift=this._clamp(driftIntensity),tire=drift*(.2+.8*speed);this._target(this.driftGain.gain,tire*.052,.065,now);this._target(this.driftToneGain.gain,tire*.011,.065,now);this._target(this.driftOsc.frequency,930+speed*530+drift*150,.09,now);this._target(this.driftFilter.frequency,1120+speed*500,.08,now);this._target(this.roadGain.gain,.020*Math.pow(speed,1.4),.15,now);
    Object.assign(this.state,{rpmNorm:n,gear,load,boost,firingHz:cycle*p.cylinders,cycleHz:cycle,cutoffHz:cutoff,shifting:now<this._shiftUntil});this._lastGear=gear;this._lastLoad=loadTarget;this._lastSpeed=speed;
  }
  _canPlay(){return this.initialized&&this.ctx&&this.ctx.state!=='closed'&&this.ctx.state!=='suspended'&&!this.muted;}
  _pulse(param,peak,when,attack=.006,duration=.12){param.cancelScheduledValues(when);param.setValueAtTime(0,when);param.linearRampToValueAtTime(Math.max(0,peak),when+attack);param.exponentialRampToValueAtTime(.00001,when+Math.max(attack+.005,duration));param.setValueAtTime(0,when+duration+.012);this._paramTargets.delete(param);}
  _airRelease(boost,when){if(!this._canPlay())return;this._lastRelease=when;const level=this.profile.releaseLevel;this.releaseFilter.frequency.setTargetAtTime(this.profile.turbochargers>2?1080:1720,when,.02);this._pulse(this.releaseGain.gain,.065*this._clamp(boost)*level,when,.009,.19+.12*boost);}
  playShiftSound(up=true,intensity=.7){
    if(!this._canPlay())return false;const now=this._now();if(now-this._lastShift<.10)return false;this._lastShift=now;const duration=this.profile.shiftTime;this._shiftUntil=now+duration;
    const g=this.engineDuck.gain;g.cancelScheduledValues(now);g.setValueAtTime(1,now);g.linearRampToValueAtTime(up?.22:.44,now+.012);g.setValueAtTime(up?.22:.44,now+duration*.46);g.linearRampToValueAtTime(1,now+duration);this._pulse(this.shiftGain.gain,.024*this._clamp(intensity),now,.004,duration*.7);
    this.thumpOsc.frequency.setValueAtTime(up?92:105,now);this.thumpOsc.frequency.exponentialRampToValueAtTime(58,now+.09);this._pulse(this.thumpGain.gain,.032*this._clamp(intensity),now,.005,.11);if(this.state.boost>.30)this._airRelease(this.state.boost*.65,now+.018);return true;
  }
  _beepAt(freq,duration,volume,when){const v=this.beepVoices[this._fxCursor++%this.beepVoices.length];v.osc.frequency.cancelScheduledValues(when);v.osc.frequency.setValueAtTime(this._clamp(freq,70,2400),when);this._pulse(v.gain.gain,this._clamp(volume,0,.3),when,.008,this._clamp(duration,.035,.9));}
  playBeep(freq=520,duration=.14,volume=.28){if(!this._canPlay())return;this._beepAt(freq,duration,volume,this._now());}
  playCollision(intensity=.5){
    if(!this._canPlay())return;const now=this._now();if(now-this._lastImpact<.085)return;this._lastImpact=now;const impact=this._clamp(intensity);
    this.impactFilter.frequency.setTargetAtTime(380+impact*1000,now,.015);this._pulse(this.impactGain.gain,.08+.17*impact,now,.003,.13+.09*impact);this.thumpOsc.frequency.setValueAtTime(100+impact*35,now);this.thumpOsc.frequency.exponentialRampToValueAtTime(42,now+.16);this._pulse(this.thumpGain.gain,.06+.08*impact,now,.004,.20);
  }
  playFinishFanfare(){if(!this._canPlay())return;const now=this._now();[523.25,659.25,783.99,1046.5].forEach((f,i)=>this._beepAt(f,.25,.16,now+i*.13));}
  stopPreview(){
    this._previewToken++;if(this._previewTimer!==null)clearInterval(this._previewTimer);if(this._previewEndTimer!==null)clearTimeout(this._previewEndTimer);this._previewTimer=this._previewEndTimer=null;
    const wasPreviewing=this.isPreviewing;this.isPreviewing=false;this.state.preview=false;
    if(wasPreviewing){this.state.active=false;this.state.load=0;this.state.boost=0;this._quiet();}
    if(this._previewResolve){const resolve=this._previewResolve;this._previewResolve=null;resolve(false);}return Promise.resolve(wasPreviewing);
  }
  previewEngine(id=this.vehicleId,duration=4){
    this.stopPreview();if(!this.setVehicle(id)||this.muted||!this.init())return Promise.resolve(false);
    this._raceActive=false;const token=++this._previewToken,seconds=this._clamp(duration,1.8,8);
    return new Promise(resolve=>{
      this._previewResolve=resolve;
      const start=()=>{
        if(token!==this._previewToken)return;
        this.isPreviewing=true;this.state.preview=true;const began=this._now();
        const tick=()=>{
          if(token!==this._previewToken)return;
          if(this.muted||this.ctx.state==='suspended'||this.ctx.state==='closed'){this.stopPreview();return;}
          const progress=(this._now()-began)/seconds;
          if(progress>=1){clearInterval(this._previewTimer);this._previewTimer=null;this.isPreviewing=false;this.state.preview=false;this.state.active=false;this.state.boost=0;this._quiet();this._previewResolve=null;resolve(true);this._previewEndTimer=setTimeout(()=>{this._previewEndTimer=null;if(token===this._previewToken&&!this._raceActive&&this.ctx.state==='running')this.ctx.suspend().catch(()=>{});},150);return;}
          let n,throttle,gear=1;
          if(progress<.14){n=.035+progress/.14*.10;throttle=.25;}
          else if(progress<.49){const t=(progress-.14)/.35;n=.135+.72*t;throttle=.91;}
          else if(progress<.62){const t=(progress-.49)/.13;n=.855-.44*t;throttle=0;gear=2;}
          else if(progress<.84){const t=(progress-.62)/.22;n=.415+.50*t;throttle=.94;gear=2;}
          else{const t=(progress-.84)/.16;n=.915*(1-t);throttle=0;gear=2;}
          this.updateEngine(n,.12+n*.40,false,0,true,{throttle,gear,rpm:this.profile.idleRpm+n*(this.profile.redlineRpm-this.profile.idleRpm),dt:.025,preview:true});
        };
        tick();this._previewTimer=setInterval(tick,25);
      };
      if(this.ctx.state==='suspended')this.ctx.resume().then(start).catch(()=>{if(this._previewResolve===resolve)this._previewResolve=null;resolve(false);});else start();
    });
  }
  suspend(){this.stopPreview();this._raceActive=false;this.state.active=false;this._quiet();if(this.ctx?.state==='running')return this.ctx.suspend().catch(()=>{});return Promise.resolve();}
  resume(){if(this.ctx?.state==='suspended'&&!this.muted)return this.ctx.resume().catch(()=>{});return Promise.resolve();}
  dispose(){
    this.stopPreview();for(const source of this._sources){try{source.stop();}catch(_){}}for(const node of this._nodes){try{node.disconnect();}catch(_){}}this._sources=[];this._nodes=[];this.voices=[];this._waveCache.clear();this._paramTargets.clear();this.initialized=false;
  }
}

window.NVEngineAudio=Object.freeze({version:'2.0.0',profiles:NV_AUDIO_PROFILES,ProceduralAudio,synthesis:true,recordedSamples:false,description:'Sintesis mesin berdasarkan konfigurasi silinder dan induksi. Bukan rekaman asli kendaraan.'});


      const audio = new ProceduralAudio();

      // =========================================================================
      // 3. GENERATOR TEKSTUR PROSEDURAL (TANPA FILE GAMBAR EKSTERNAL)
      // =========================================================================
      function createRoadTexture() {
        const c = document.createElement('canvas');
        c.width = 512;
        c.height = 512;
        const ctx = c.getContext('2d');

        // Aspal gelap malam
        ctx.fillStyle = '#141724';
        ctx.fillRect(0, 0, 512, 512);

        // Bintik tekstur aspal
        for (let i = 0; i < 4500; i++) {
          const x = Math.random() * 512;
          const y = Math.random() * 512;
          const v = 16 + Math.floor(Math.random() * 24);
          ctx.fillStyle = `rgb(${v}, ${v + 2}, ${v + 8})`;
          ctx.fillRect(x, y, 2, 2);
        }

        // Garis tepi solid bercahaya cyan tipis
        ctx.fillStyle = '#d5dbe1';
        ctx.fillRect(14, 0, 8, 512);
        ctx.fillRect(490, 0, 8, 512);

        // Garis tengah putus-putus
        ctx.fillStyle = '#e2e8f0';
        for (let y = 20; y < 512; y += 128) {
          ctx.fillRect(250, y, 12, 68);
        }

        // Garis lajur samping tipis
        ctx.fillStyle = 'rgba(148, 163, 184, 0.22)';
        for (let y = 0; y < 512; y += 64) {
          ctx.fillRect(132, y, 4, 30);
          ctx.fillRect(376, y, 4, 30);
        }

        const tex = new THREE.CanvasTexture(c);
        tex.encoding=THREE.sRGBEncoding;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.anisotropy = 8;
        return tex;
      }

      function createKerbTexture() {
        const c = document.createElement('canvas');
        c.width = 64;
        c.height = 256;
        const ctx = c.getContext('2d');
        // Pola strip neon magenta & cyan
        ctx.fillStyle = '#8892a1';
        ctx.fillRect(0, 0, 64, 128);
        ctx.fillStyle = '#202938';
        ctx.fillRect(0, 128, 64, 128);
        const tex = new THREE.CanvasTexture(c);
        tex.encoding=THREE.sRGBEncoding;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        return tex;
      }

      function createCheckeredTexture() {
        const c = document.createElement('canvas');
        c.width = 512;
        c.height = 128;
        const ctx = c.getContext('2d');
        const size = 32;
        for (let y = 0; y < 128; y += size) {
          for (let x = 0; x < 512; x += size) {
            const isWhite = ((x / size) + (y / size)) % 2 === 0;
            ctx.fillStyle = isWhite ? '#ffffff' : '#090d1a';
            ctx.fillRect(x, y, size, size);
          }
        }
        // Teks START / FINISH di tengah banner
        ctx.fillStyle = 'rgba(6, 182, 212, 0.9)';
        ctx.fillRect(136, 36, 240, 56);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 34px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(currentCircuit().short, 256, 65);

        const tex = new THREE.CanvasTexture(c);
        tex.encoding=THREE.sRGBEncoding;
        return tex;
      }

      function createBuildingTexture(neonColor) {
        const c = document.createElement('canvas');
        c.width = 128;
        c.height = 256;
        const ctx = c.getContext('2d');

        // Dinding gelap
        ctx.fillStyle = '#090c1a';
        ctx.fillRect(0, 0, 128, 256);

        // Jendela menyala acak
        const cols = 6;
        const rows = 14;
        const padX = 6;
        const padY = 6;
        const w = (128 - padX * (cols + 1)) / cols;
        const h = (256 - padY * (rows + 1)) / rows;

        for (let r = 0; r < rows; r++) {
          for (let col = 0; col < cols; col++) {
            const rnd = Math.random();
            if (rnd > 0.42) {
              if (rnd > 0.88) {
                ctx.fillStyle = neonColor;
              } else if (rnd > 0.65) {
                ctx.fillStyle = '#38bdf8';
              } else {
                ctx.fillStyle = '#fef08a';
              }
            } else {
              ctx.fillStyle = '#111827';
            }
            ctx.fillRect(padX + col * (w + padX), padY + r * (h + padY), w, h);
          }
        }

        const tex = new THREE.CanvasTexture(c);
        tex.encoding=THREE.sRGBEncoding;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        return tex;
      }

      // =========================================================================
      // 4. INISIALISASI SCENE THREE.JS, KAMERA & PENCAHAYAAN
      // =========================================================================
      let scene, camera, renderer;
      let trackCurve, trackPoints = [], trackTangents = [], trackNormals = [];
      let trackTotalLength = 1;
      let minimapBounds = { minX: 0, maxX: 1, minZ: 0, maxZ: 1 };

      // Entitas balapan
      let playerCar = null;
      let aiCars = [];
      let allRacers = [];

      // Sistem Partikel (Percikan guardrail & asap drift)
      const particles = [];
      const particleGeo = new THREE.BoxGeometry(0.24, 0.24, 0.24);

      // Speedlines 2D
      const speedLines = [];
      let speedCtx = null;


      function initThree() {
        scene=new THREE.Scene();scene.background=new THREE.Color(0x0d1420);scene.fog=new THREE.FogExp2(0x0e1725,.00165);
        camera=new THREE.PerspectiveCamera(65,window.innerWidth/window.innerHeight,.07,1700);
        renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
        renderer.outputEncoding=THREE.sRGBEncoding;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.94;
        renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.enabled=true;
        DOM.container.appendChild(renderer.domElement);applyQuality();
        renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();pauseRace();$('error-message').textContent='Konteks grafis terhenti. Tutup aplikasi berat, lalu klik Coba lagi. Pilih grafis Ringan bila perlu.';$('error-screen').classList.remove('hidden');});
        initGarageStudio(renderer);scene.environment=sharedEnv;
        raceHemi=new THREE.HemisphereLight(0xb0c8ef,0x343b43,.86);scene.add(raceHemi);
        raceKey=new THREE.DirectionalLight(0xc6ddf8,1.45);raceKey.position.set(80,120,-60);raceKey.castShadow=true;
        raceKey.shadow.mapSize.set(1024,1024);Object.assign(raceKey.shadow.camera,{left:-38,right:38,top:38,bottom:-38,near:.2,far:160});
        raceKey.shadow.bias=-.0005;raceKey.shadow.normalBias=.025;scene.add(raceKey,raceKey.target);
        raceRim=new THREE.DirectionalLight(0xf3af87,.5);raceRim.position.set(-100,60,80);scene.add(raceRim);
        createStarfield();initCityAtmosphere();
      }


      function createStarfield() {
        const starGeo = new THREE.BufferGeometry();
        const starCount = 900;
        const positions = new Float32Array(starCount * 3);
        for (let i = 0; i < starCount; i++) {
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.random() * Math.PI * 0.45;
          const r = 480 + Math.random() * 140;
          positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
          positions[i * 3 + 1] = 35 + r * Math.cos(phi);
          positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
        }
        starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const starMat = new THREE.PointsMaterial({ color: 0xe0f2fe, size: 1.6, transparent: true, opacity: 0.8 });
        const stars=new THREE.Points(starGeo,starMat);stars.name='city-stars';scene.add(stars);
      }


      function createGroundPlane(){
        const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;
        const context=canvas.getContext('2d'),random=seededRandom(54832);context.fillStyle='#535959';context.fillRect(0,0,256,256);
        for(let i=0;i<16000;i++){context.fillStyle=random()>.5?'rgba(12,19,25,.16)':'rgba(170,177,177,.12)';context.fillRect(random()*256,random()*256,1+random()*2,1+random()*2);}
        const texture=canvasTexture(canvas,true,160,160);
        const mat=new THREE.MeshStandardMaterial({map:texture,color:0x757f7b,roughness:1,metalness:0,envMapIntensity:.04});
        const ground=new THREE.Mesh(new THREE.PlaneGeometry(2400,2400),mat);ground.rotation.x=-Math.PI/2;ground.position.y=-.075;ground.receiveShadow=true;ground.name='Urban Ground';scene.add(ground);
      }



      function buildTrackAndCity(){buildCircuitWorld();}


      function buildRoadStripMesh(halfWidth, yPos, texture, uvRepeatY) {
        const positions = [];
        const uvs = [];
        const indices = [];

        for (let i = 0; i <= CURVE_SAMPLES; i++) {
          const idx = i % CURVE_SAMPLES;
          const pt = trackPoints[idx];
          const right = trackNormals[idx];

          const leftPt = pt.clone().addScaledVector(right, -halfWidth);
          const rightPt = pt.clone().addScaledVector(right, halfWidth);

          positions.push(leftPt.x, yPos, leftPt.z);
          positions.push(rightPt.x, yPos, rightPt.z);

          const v = (i / CURVE_SAMPLES) * uvRepeatY;
          uvs.push(0, v);
          uvs.push(1, v);

          if (i < CURVE_SAMPLES) {
            const base = i * 2;
            indices.push(base, base + 1, base + 2);
            indices.push(base + 1, base + 3, base + 2);
          }
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geo.setIndex(indices);
        geo.computeVertexNormals();

        const mat = new THREE.MeshStandardMaterial({
          map: texture,
          roughness: 0.72,
          metalness: 0.18
        });

        const mesh = new THREE.Mesh(geo, mat);
        mesh.receiveShadow=true;
        scene.add(mesh);
      }

      function buildEdgeStripMesh(innerOffset, outerOffset, yPos, texture, emissiveMode) {
        const positions = [];
        const uvs = [];
        const indices = [];
        const repeatY = trackTotalLength / 10;

        for (let i = 0; i <= CURVE_SAMPLES; i++) {
          const idx = i % CURVE_SAMPLES;
          const pt = trackPoints[idx];
          const right = trackNormals[idx];

          const p1 = pt.clone().addScaledVector(right, innerOffset);
          const p2 = pt.clone().addScaledVector(right, outerOffset);

          positions.push(p1.x, yPos, p1.z);
          positions.push(p2.x, yPos, p2.z);

          const v = (i / CURVE_SAMPLES) * repeatY;
          uvs.push(0, v);
          uvs.push(1, v);

          if (i < CURVE_SAMPLES) {
            const base = i * 2;
            indices.push(base, base + 1, base + 2);
            indices.push(base + 1, base + 3, base + 2);
          }
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geo.setIndex(indices);
        geo.computeVertexNormals();

        const mat = new THREE.MeshBasicMaterial({
          map: texture,
          side: THREE.DoubleSide
        });

        scene.add(new THREE.Mesh(geo, mat));
      }

      function buildGuardrail(offset, neonHex) {
        // Rel horizontal (dinding pagar rendah)
        const positions = [];
        const indices = [];
        const hLow = 0.25;
        const hHigh = 1.05;

        for (let i = 0; i <= CURVE_SAMPLES; i++) {
          const idx = i % CURVE_SAMPLES;
          const pt = trackPoints[idx];
          const right = trackNormals[idx];
          const p = pt.clone().addScaledVector(right, offset);

          positions.push(p.x, hLow, p.z);
          positions.push(p.x, hHigh, p.z);

          if (i < CURVE_SAMPLES) {
            const base = i * 2;
            indices.push(base, base + 2, base + 1);
            indices.push(base + 1, base + 2, base + 3);
          }
        }

        const wallGeo = new THREE.BufferGeometry();
        wallGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        wallGeo.setIndex(indices);
        wallGeo.computeVertexNormals();

        const wallMat = new THREE.MeshStandardMaterial({
          color: 0x1e293b,
          metalness: 0.7,
          roughness: 0.35,
          side: THREE.DoubleSide
        });
        scene.add(new THREE.Mesh(wallGeo, wallMat));

        // Strip neon bercahaya di atas guardrail
        const neonPts = [];
        for (let i = 0; i <= CURVE_SAMPLES; i++) {
          const idx = i % CURVE_SAMPLES;
          const p = trackPoints[idx].clone().addScaledVector(trackNormals[idx], offset);
          p.y = hHigh + 0.08;
          neonPts.push(p);
        }
        const neonCurve = new THREE.CatmullRomCurve3(neonPts, true);
        const tubeGeo = new THREE.TubeGeometry(neonCurve, 320, 0.1, 5, true);
        const tubeMat = new THREE.MeshBasicMaterial({ color: neonHex });
        scene.add(new THREE.Mesh(tubeGeo, tubeMat));
      }

      function buildStartFinishGate() {
        const pt = trackPoints[0];
        const tan = trackTangents[0];
        const right = trackNormals[0];
        const angle = Math.atan2(tan.x, tan.z);

        const gateGroup = new THREE.Group();
        gateGroup.position.copy(pt);
        gateGroup.rotation.y = angle;

        // Dua pilar tinggi di tepi lintasan
        const pillarGeo = new THREE.BoxGeometry(1.4, 11.5, 1.4);
        const pillarMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.6, roughness: 0.3 });

        const leftPillar = new THREE.Mesh(pillarGeo, pillarMat);
        leftPillar.position.set(-ROAD_HALF - 1.5, 5.75, 0);
        gateGroup.add(leftPillar);

        const rightPillar = new THREE.Mesh(pillarGeo, pillarMat);
        rightPillar.position.set(ROAD_HALF + 1.5, 5.75, 0);
        gateGroup.add(rightPillar);

        // Strip neon vertikal di pilar
        const stripGeo = new THREE.BoxGeometry(0.25, 11, 1.5);
        const stripMat = new THREE.MeshBasicMaterial({ color: 0xe3b17b });
        const ls = new THREE.Mesh(stripGeo, stripMat);
        ls.position.set(-ROAD_HALF - 0.8, 5.5, 0);
        gateGroup.add(ls);

        const rs = new THREE.Mesh(stripGeo, stripMat);
        rs.position.set(ROAD_HALF + 0.8, 5.5, 0);
        gateGroup.add(rs);

        // Banner kotak-kotak di atas jalan
        const bannerGeo = new THREE.BoxGeometry(ROAD_WIDTH + 3.2, 2.8, 0.8);
        const bannerMat = new THREE.MeshBasicMaterial({ map: createCheckeredTexture() });
        const banner = new THREE.Mesh(bannerGeo, bannerMat);
        banner.position.set(0, 10.2, 0);
        gateGroup.add(banner);

        // Garis putih-hitam di aspal Start/Finish
        const lineGeo = new THREE.PlaneGeometry(ROAD_WIDTH, 3.2);
        const lineMat = new THREE.MeshBasicMaterial({ map: createCheckeredTexture() });
        const lineMesh = new THREE.Mesh(lineGeo, lineMat);
        lineMesh.rotation.x = -Math.PI / 2;
        lineMesh.position.y = 0.06;
        gateGroup.add(lineMesh);

        scene.add(gateGroup);
      }

      function buildStreetLights() {
        const poleGeo = new THREE.CylinderGeometry(0.16, 0.22, 9.5, 6);
        const poleMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.3 });
        const armGeo = new THREE.BoxGeometry(3.2, 0.18, 0.18);
        const bulbGeo = new THREE.BoxGeometry(1.4, 0.22, 0.45);
        const cyanBulbMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
        const pinkBulbMat = new THREE.MeshBasicMaterial({ color: 0xf472b6 });

        const step = 16; // Jarak antar lampu
        for (let i = 8; i < CURVE_SAMPLES; i += step) {
          const pt = trackPoints[i];
          const tan = trackTangents[i];
          const right = trackNormals[i];
          const side = (Math.floor(i / step) % 2 === 0) ? 1 : -1;

          const lampGroup = new THREE.Group();
          const pos = pt.clone().addScaledVector(right, side * (ROAD_HALF + 2.4));
          lampGroup.position.set(pos.x, 0, pos.z);
          lampGroup.rotation.y = Math.atan2(tan.x, tan.z);

          const pole = new THREE.Mesh(poleGeo, poleMat);
          pole.position.y = 4.75;
          lampGroup.add(pole);

          const arm = new THREE.Mesh(armGeo, poleMat);
          arm.position.set(-side * 1.4, 9.4, 0);
          lampGroup.add(arm);

          const bulb = new THREE.Mesh(bulbGeo, side > 0 ? cyanBulbMat : pinkBulbMat);
          bulb.position.set(-side * 2.5, 9.25, 0);
          lampGroup.add(bulb);

          scene.add(lampGroup);
        }
      }

      function buildCitySkyline() {
        const neonPalette = ['#06b6d4', '#ec4899', '#a855f7', '#3b82f6', '#10b981'];
        const buildingTextures = neonPalette.map(c => createBuildingTexture(c));
        const buildingCount = 90;

        // Fungsi cek jarak aman dari lintasan agar tidak ada gedung menembus jalan
        const isSafeFromTrack = (x, z, minDist) => {
          const minDistSq = minDist * minDist;
          for (let i = 0; i < CURVE_SAMPLES; i += 4) {
            const dx = x - trackPoints[i].x;
            const dz = z - trackPoints[i].z;
            if (dx * dx + dz * dz < minDistSq) return false;
          }
          return true;
        };

        let placed = 0;
        let attempts = 0;
        while (placed < buildingCount && attempts < 1400) {
          attempts++;
          const x = (Math.random() - 0.35) * 760;
          const z = (Math.random() - 0.5) * 720;
          const w = 14 + Math.random() * 24;
          const d = 14 + Math.random() * 24;
          const h = 28 + Math.random() * 95;

          const safeMargin = ROAD_HALF + Math.max(w, d) * 0.7 + 12;
          if (!isSafeFromTrack(x, z, safeMargin)) continue;

          const texIdx = Math.floor(Math.random() * buildingTextures.length);
          const matSide = new THREE.MeshStandardMaterial({
            map: buildingTextures[texIdx],
            emissiveMap: buildingTextures[texIdx], emissive: 0xffffff, emissiveIntensity:.25,
            roughness: 0.7,
            metalness: 0.3
          });
          const matTop = new THREE.MeshBasicMaterial({ color: 0x0b1120 });

          const geo = new THREE.BoxGeometry(w, h, d);
          const mesh = new THREE.Mesh(geo, matSide);
          mesh.position.set(x, h / 2 - 0.2, z);
          scene.add(mesh);

          // Garis atap neon pada sebagian gedung tinggi
          if (h > 55) {
            const rimGeo = new THREE.BoxGeometry(w + 0.4, 0.6, d + 0.4);
            const rimMat = new THREE.MeshBasicMaterial({ color: neonPalette[texIdx] });
            const rim = new THREE.Mesh(rimGeo, rimMat);
            rim.position.set(x, h - 0.3, z);
            scene.add(rim);
          }

          placed++;
        }
      }

      // =========================================================================
      // 6. PEMBUATAN MODEL MOBIL SPORT 3D PROSEDURAL
      // =========================================================================

      // Compatibility wrapper; all actual vehicles now come from the shared garage factory.
      function createSportCarMesh(bodyColorHex, neonColorHex, isPlayer) {
        return createVehicle(isPlayer?settings.model:'apex',bodyColorHex,isPlayer);
      }


      function findClosestTrackIndex(x, z, hintIndex) {
        if(currentCircuit().open)return Math.max(0,Math.min(CURVE_SAMPLES-1,Math.round(-z/trackTotalLength*(CURVE_SAMPLES-1))));
        let bestIdx = hintIndex;
        let bestDistSq = Infinity;

        // Cari di sekitar hintIndex dulu agar sangat cepat O(1)
        const windowSize = 36;
        for (let offset = -windowSize; offset <= windowSize; offset++) {
          const idx = (hintIndex + offset + CURVE_SAMPLES) % CURVE_SAMPLES;
          const pt = trackPoints[idx];
          const dx = x - pt.x;
          const dz = z - pt.z;
          const dSq = dx * dx + dz * dz;
          if (dSq < bestDistSq) {
            bestDistSq = dSq;
            bestIdx = idx;
          }
        }

        // Jika terlalu jauh (mis. teleport/terpental jauh), scan seluruh lintasan
        if (bestDistSq > 900) {
          for (let i = 0; i < CURVE_SAMPLES; i++) {
            const pt = trackPoints[i];
            const dx = x - pt.x;
            const dz = z - pt.z;
            const dSq = dx * dx + dz * dz;
            if (dSq < bestDistSq) {
              bestDistSq = dSq;
              bestIdx = i;
            }
          }
        }
        return bestIdx;
      }

      function getSignedTrackOffset(x, z, trackIdx) {
        const pt = trackPoints[trackIdx];
        const right = trackNormals[trackIdx];
        return (x - pt.x) * right.x + (z - pt.z) * right.z;
      }

      // =========================================================================
      // 8. PARTIKEL PERCIKAN & ASAP DRIFT
      // =========================================================================
      function spawnParticles(pos, colorHex, count, speedScale, lifeBase) {
        for (let i = 0; i < count; i++) {
          if (particles.length > 140) break;
          const mat = new THREE.MeshBasicMaterial({
            color: colorHex,
            transparent: true,
            opacity: 0.9
          });
          const mesh = new THREE.Mesh(particleGeo, mat);
          mesh.position.copy(pos);
          scene.add(mesh);

          particles.push({
            mesh,
            vel: new THREE.Vector3(
              (Math.random() - 0.5) * speedScale,
              1.5 + Math.random() * speedScale * 0.65,
              (Math.random() - 0.5) * speedScale
            ),
            life: lifeBase + Math.random() * 0.25,
            maxLife: lifeBase + 0.25
          });
        }
      }

      function updateParticles(dt) {
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          p.life -= dt;
          if (p.life <= 0) {
            scene.remove(p.mesh);
            p.mesh.material.dispose();
            particles.splice(i, 1);
            continue;
          }
          p.vel.y -= 9.8 * dt;
          p.mesh.position.addScaledVector(p.vel, dt);
          const ratio = p.life / p.maxLife;
          p.mesh.material.opacity = ratio;
          p.mesh.scale.setScalar(0.5 + (1 - ratio) * 0.9);
        }
      }

      // =========================================================================
      // 9. INISIALISASI PEMAIN & LAWAN AI
      // =========================================================================

      function createRacers(){createRaceField();}



      function resetGridPositions(){placeRaceField();}


      function resetPlayerToTrack() {
        if(onlineRender.active){if(onlineRender.phase==='racing'&&!playerCar?.finished&&!playerCar?.dnf)onlineRender.resetRequested=true;return;}
        if (!playerCar || GameState.mode !== 'RACING') return;
        const idx = playerCar.trackIdx;
        const pt = trackPoints[idx];
        const tan = trackTangents[idx];
        playerCar.pos.set(pt.x, 0, pt.z);
        playerCar.heading = Math.atan2(tan.x, tan.z);
        playerCar.speed = Math.max(0, Math.min(playerCar.speed, 15));
        playerCar.steerAngle = 0;
        playerCar.bodyRoll = 0;
        playerCar.bodyPitch = 0;
        playerCar.visual.root.position.copy(playerCar.pos);
        playerCar.visual.root.rotation.y = playerCar.heading;
        playerCar.driftAngle = 0;
        showStatusBanner('MOBIL DI-RESET KE LINTASAN', 1200);
      }

      // =========================================================================
      // 10. FISIKA MOBIL PEMAIN, NITRO, DRIFT & TABRAKAN
      // =========================================================================
      let bannerTimeout = null;
      function showStatusBanner(text, duration = 1100) {
        DOM.statusBanner.textContent = text;
        DOM.statusBanner.classList.remove('hidden');
        if (bannerTimeout) clearTimeout(bannerTimeout);
        bannerTimeout = setTimeout(() => {
          DOM.statusBanner.classList.add('hidden');
        }, duration);
      }

      function updatePlayerPhysics(dt) {
        const car = playerCar;
        const canDrive = GameState.mode === 'RACING';

        const maxNormalSpeed = car.model.topSpeed / 3.6;
        const maxNitroSpeed = maxNormalSpeed * 1.23;
        const maxReverse = -18;

        // Aktivasi Nitro
        const wantsNitro = canDrive && Input.nitro && car.nitro > 1 && car.speed > 5 && !Input.down;
        car.nitroActive = wantsNitro;

        if (car.nitroActive) {
          car.nitro = Math.max(0, car.nitro - 26 * dt);
        } else if (canDrive && car.speed > 20) {
          // Isi Nitro perlahan saat melaju kencang
          car.nitro = Math.min(100, car.nitro + 3.2 * dt);
        }

        // Akselerasi & Pengereman
        const baseAccel = 27.78 / car.model.zeroTo100;
        const accelRate = car.nitroActive ? baseAccel * 2.0 : baseAccel * (1 - .46 * Math.max(0, car.speed - 28) / maxNormalSpeed);
        const brakeRate = 37;
        const coastDrag = 5.5;
        const targetMax = car.nitroActive ? maxNitroSpeed : maxNormalSpeed;

        let isBraking = false;
        if (canDrive) {
          if ((Input.up || car.nitroActive) && !Input.down) {
            if (car.speed < targetMax) {
              car.speed += accelRate * dt;
            } else {
              // Turun mulus kembali ke top speed normal setelah nitro habis
              car.speed -= 18 * dt;
            }
          } else if (Input.down) {
            if (car.speed > 1) {
              car.speed -= brakeRate * dt;
              isBraking = true;
            } else {
              car.speed = Math.max(maxReverse, car.speed - 20 * dt);
            }
          } else {
            // Hambatan udara & gesekan ban
            if (car.speed > 0) car.speed = Math.max(0, car.speed - coastDrag * dt);
            else if (car.speed < 0) car.speed = Math.min(0, car.speed + coastDrag * dt);
          }
        } else {
          // Saat selesai/hitung mundur, perlambat lembut
          car.speed *= Math.pow(0.25, dt);
        }

        // Kemudi responsif (sensitivitas menyesuaikan kecepatan)
        const steerInput = canDrive ? ((Input.left ? 1 : 0) - (Input.right ? 1 : 0)) : 0;
        const speedFactor = Math.min(1, Math.abs(car.speed) / 14);
        const highSpeedDamp = 1 - Math.min(0.42, (Math.abs(car.speed) / maxNitroSpeed) * 0.42);
        const turnRate = 1.95 * car.model.handling * speedFactor * highSpeedDamp * (car.speed >= 0 ? 1 : -1);

        car.steerAngle += (steerInput * 0.45 - car.steerAngle) * Math.min(1, dt * 12);
        car.heading += steerInput * turnRate * dt;

        // Efek Drift saat menikung tajam di kecepatan tinggi
        const isDrifting = canDrive && Math.abs(steerInput) > 0.5 && car.speed > 36;
        const targetDrift = isDrifting ? steerInput * 0.24 : 0;
        car.driftAngle += (targetDrift - car.driftAngle) * Math.min(1, dt * 7);

        let driftIntensity = 0;
        if (isDrifting) {
          driftIntensity = Math.min(1, (car.speed - 34) / 40);
          // Bonus pengisian Nitro saat drift!
          car.nitro = Math.min(100, car.nitro + 11 * driftIntensity * dt);

          // Partikel asap / percikan ban belakang
          if (Math.random() < 0.55) {
            const backPos = car.pos.clone();
            backPos.x -= Math.sin(car.heading) * 1.8;
            backPos.z -= Math.cos(car.heading) * 1.8;
            backPos.y = 0.2;
            spawnParticles(backPos, 0x38bdf8, 1, 3.5, 0.28);
          }
        }

        // Perpindahan posisi
        const moveAngle = car.heading - car.driftAngle * 0.45;
        car.pos.x += Math.sin(moveAngle) * car.speed * dt;
        car.pos.z += Math.cos(moveAngle) * car.speed * dt;

        // Deteksi posisi pada lintasan & Tabrakan Guardrail
        const newIdx = findClosestTrackIndex(car.pos.x, car.pos.z, car.trackIdx);
        updateLapProgress(car, newIdx);

        const offset = getSignedTrackOffset(car.pos.x, car.pos.z, car.trackIdx);
        const maxOffset = (currentCircuit().roadHalf||ROAD_HALF) - CAR_HALF_WIDTH;

        if (Math.abs(offset) > maxOffset) {
          const sign = Math.sign(offset);
          const excess = Math.abs(offset) - maxOffset;
          const right = trackNormals[car.trackIdx];

          // Pantulkan mobil dengan lembut kembali ke dalam lintasan
          car.pos.addScaledVector(right, -sign * (excess + 0.18));

          // Arahkan sedikit sejajar tangen lintasan agar tidak nyangkut
          const tan = trackTangents[car.trackIdx];
          const trackAngle = Math.atan2(tan.x, tan.z);
          let diff = trackAngle - car.heading;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          car.heading += diff * 0.22;

          // Kurangi kecepatan & munculkan percikan api
          if (Math.abs(car.speed) > 12) {
            const impact = Math.min(1, Math.abs(car.speed) / 70);
            car.speed *= 0.84;
            const sparkPos = car.pos.clone().addScaledVector(right, sign * 1.1);
            sparkPos.y = 0.65;
            spawnParticles(sparkPos, 0xfb923c, 6, 9, 0.32);
            audio.playCollision(impact);
          }
        }

        // Efek Visual Body Roll, Pitch, Roda, Lampu Rem & Api Nitro
        const targetRoll = -steerInput * Math.min(0.14, (car.speed / 65) * 0.14);
        const targetPitch = isBraking ? 0.05 : (car.nitroActive ? -0.055 : (Input.up && canDrive ? -0.025 : 0));
        car.bodyRoll += (targetRoll - car.bodyRoll) * Math.min(1, dt * 10);
        car.bodyPitch += (targetPitch - car.bodyPitch) * Math.min(1, dt * 8);

        car.visual.root.position.copy(car.pos);
        car.visual.root.rotation.y = car.heading + car.driftAngle * 0.55;
        car.visual.bodyTiltGroup.rotation.z = car.bodyRoll;
        car.visual.bodyTiltGroup.rotation.x = car.bodyPitch;

        // Putar & belokkan roda
        const wheelSpin = (car.speed * dt) / (car.visual.wheelRadius || 0.4);
        car.visual.wheels.forEach(w => { w.rotation.x += wheelSpin; });
        car.visual.frontPivots.forEach(p => { p.rotation.y = car.steerAngle; });

        // Lampu rem menyala terang saat mengerem
        car.visual.brakeMat.color.setHex(isBraking ? 0xff3b48 : 0xa51d2e);

        // Api knalpot Nitro
        car.visual.flames.forEach(f => {
          f.visible = car.nitroActive;
          if (car.nitroActive) {
            const flicker = 0.85 + Math.random() * 0.65;
            f.scale.set(1, 1, flicker);
            car.visual.flameMat.color.setHex(Math.random() > 0.35 ? 0x38bdf8 : 0xf97316);
          }
        });

        // Update Audio Mesin
        const speedKmh = Math.abs(car.speed) * 3.6;
        const { rpmNorm,rpm,gear } = computeGearAndRpm(speedKmh);
        audio.updateEngine(rpmNorm, Math.min(1, speedKmh / 300), car.nitroActive, driftIntensity, canDrive,{throttle:Input.up&&!Input.down,brake:Input.down,gear,rpm,speedMps:car.speed,dt});
      }

      // =========================================================================
      // 11. LOGIKA LAWAN AI & TABRAKAN ANTAR MOBIL
      // =========================================================================

      function updateAICars(dt){updateRaceFieldAI(dt);}


      // =========================================================================
      // 12. PELACAKAN LAP, POSISI & PENYELESAIAN BALAPAN
      // =========================================================================
      // Signed, unwrapped progress plus ordered quarter-lap gates. The first
      // grid-to-start crossing is gate 0, not a completed lap. Backwards motion
      // subtracts distance, so rocking across the finish line cannot earn laps.
      function updateLapProgress(car, newIdx, preciseT) {
        if(onlineRender.enabled)return;
        const open=!!currentCircuit().open,t = preciseT === undefined ? (open?-car.pos.z/trackTotalLength:newIdx / CURVE_SAMPLES) : preciseT;
        const oldT = car.lastTrackT === undefined ? car.lastTrackIdx / CURVE_SAMPLES : car.lastTrackT;
        let delta = t - oldT;
        if (!open&&delta > 0.5) delta -= 1;
        if (!open&&delta < -0.5) delta += 1;
        car.trackIdx = newIdx;
        car.lastTrackIdx = newIdx;
        car.lastTrackT = t;
        if (GameState.mode !== 'RACING' || car.finished) return;
        // A real frame cannot cover 12% of this circuit. Ignore discontinuities
        // rather than crediting distance after an unexpected projection/teleport.
        if (Math.abs(delta) > 0.12) return;
        const before = car.progress;
        car.progress += delta;
        if (delta <= 0) return;
        const epsilon = 1e-7;
        while (car.nextGate <= TOTAL_LAPS * 4 &&
               before < car.nextGate / 4 + epsilon &&
               car.progress + epsilon >= car.nextGate / 4) {
          const gate = car.nextGate++;
          if (gate === 0) {
            if (car.isPlayer) GameState.lapStartTime = gameClock;
            continue;
          }
          if (gate % 4 !== 0) continue;
          car.completedLaps = gate / 4;
          car.lap = car.completedLaps + 1;
          if (car.isPlayer) {
            const lapDuration = gameClock - GameState.lapStartTime;
            GameState.lastLapTime=lapDuration;
            if (lapDuration > 0 && lapDuration < GameState.bestLapTime) {
              GameState.bestLapTime = lapDuration;
              DOM.hudBestLap.textContent = formatTime(lapDuration);
            }
            GameState.currentLap = Math.min(TOTAL_LAPS, car.lap);
            GameState.lapStartTime = gameClock;
            if (car.completedLaps >= TOTAL_LAPS) {
              car.progress = TOTAL_LAPS;
              finishRace();
              return;
            }
            if (car.lap === TOTAL_LAPS) {
              showStatusBanner('LAP TERAKHIR!', 1800);
              audio.playBeep(880, 0.2, 0.25);
            } else {
              showStatusBanner(`LAP ${car.lap} / ${TOTAL_LAPS}`, 1500);
              audio.playBeep(660, 0.15, 0.22);
            }
          } else if (car.completedLaps >= TOTAL_LAPS) {
            car.finished = true;
            car.finishTime = gameClock - GameState.raceStartTime;
            car.progress = TOTAL_LAPS;
            return;
          }
        }
      }

      function getSortedStandings() {
        if(onlineRender.active)return [...allRacers].sort((a,b)=>(a.serverPosition||999)-(b.serverPosition||999)||b.progress-a.progress);
        return [...allRacers].sort((a, b) => {
          if (a.finished && b.finished) return a.finishTime - b.finishTime;
          if (a.finished) return -1;
          if (b.finished) return 1;
          return b.progress - a.progress;
        });
      }


      function finishRace() {
        if(onlineRender.enabled)return;
        if(GameState.mode==='FINISHED')return;
        GameState.mode='FINISHED';playerCar.finished=true;playerCar.nitroActive=false;clearInput();
        GameState.totalRaceTime=gameClock-GameState.raceStartTime;playerCar.finishTime=GameState.totalRaceTime;
        DOM.hudLapTime.textContent=formatTime(GameState.lastLapTime||GameState.bestLapTime);
        audio.playFinishFanfare();saveRaceRecord();
        const standings=getSortedStandings(),rank=standings.findIndex(r=>r.isPlayer)+1;
        DOM.finishTitle.textContent=GameState.raceConfig.bots===0?'SELESAI!':rank===1?'JUARA 1!':'POSISI #'+rank;
        DOM.finishBadge.textContent=GameState.raceConfig.bots===0?'LATIHAN SELESAI':rank===1?'THE CIRCUIT IS YOURS':'BALAPAN SELESAI';
        const race=GameState.raceConfig,circuit=CIRCUITS.find(c=>c.id===race.circuit);
        $('finish-course').textContent=circuit.name+' · '+race.laps+' lap · '+race.bots+' bot · '+({easy:'Santai',normal:'Sport',hard:'Pro'}[race.difficulty]);
        DOM.finishTotalTime.textContent=formatTime(GameState.totalRaceTime);
        DOM.finishBestLap.textContent=Number.isFinite(GameState.bestLapTime)?formatTime(GameState.bestLapTime):'--:--.--';
        DOM.finishStandings.innerHTML=standings.map((r,i)=>`<div class="standing-row ${r.isPlayer?'me':''}"><strong>${i+1}</strong><i style="background:${r.colorHex}"></i><span>${r.name}</span><small>${r.finished?formatTime(r.finishTime):'Lap '+Math.min(TOTAL_LAPS,r.lap)+' / '+TOTAL_LAPS}</small></div>`).join('');
        finishDelay=.65;
      }


      // =========================================================================
      // 13. KAMERA DINAMIS & KOKPIT DENGAN KEMUDI DARI SNAPSHOT KENDARAAN
      // =========================================================================
      const smoothCamPos = new THREE.Vector3();
      const smoothLookAt = new THREE.Vector3();
      const RACE_CAMERAS=['chase','hood','close','interior'];
      const RACE_CAMERA_LABELS=['Chase','Hood','Close','Dashboard'];
      let cameraVehicle=null,lastCameraMode=-1;

      function restoreCameraVehicle(car){
        if(!car)return;
        if(car.nvCameraVisibility){for(const [node,visible] of car.nvCameraVisibility)node.visible=visible;car.nvCameraVisibility=null;}
        if(car.cockpit)car.cockpit.root.visible=false;
      }
      function applyCameraVehicle(car,hidden){
        if(!car)return;
        if(!hidden){restoreCameraVehicle(car);return;}
        if(!car.nvCameraVisibility)car.nvCameraVisibility=new Map();
        // Keep headlamps and their targets active. Hide entire source assemblies
        // including roof/glass, axles and wheel upgrades, without editing a mesh.
        const nodes=new Set([car.bodyTiltGroup,...car.wheels,...car.root.children.filter(n=>!n.isLight&&!n.userData.nvCockpit)]);
        for(const node of nodes){if(!car.nvCameraVisibility.has(node))car.nvCameraVisibility.set(node,node.visible);node.visible=false;}
      }
      function resetRaceCamera(){
        restoreCameraVehicle(cameraVehicle);cameraVehicle=null;lastCameraMode=-1;
        GameState.cameraMode=0;GameState.camYawOffset=0;GameState.camPitchOffset=0;GameState.mouseDrag=false;
        if(camera){camera.near=.07;camera.updateProjectionMatrix();}
        if(DOM.camLabel)DOM.camLabel.textContent=RACE_CAMERA_LABELS[0];
      }
      function selectRaceCamera(index){
        GameState.cameraMode=index;GameState.camYawOffset=0;GameState.camPitchOffset=0;GameState.mouseDrag=false;
        DOM.camLabel.textContent=RACE_CAMERA_LABELS[index];
        if(camera){camera.near=index===3?.025:.07;camera.updateProjectionMatrix();}
        return RACE_CAMERAS[index];
      }

      function updateCamera(dt) {
        if (!playerCar) return;
        const car=playerCar.visual,view=nvRenderPose(playerCar),nitro=nvDrivingNitro(playerCar);
        const changed=cameraVehicle!==car||lastCameraMode!==GameState.cameraMode;
        if(cameraVehicle!==car){restoreCameraVehicle(cameraVehicle);cameraVehicle=car;}
        lastCameraMode=GameState.cameraMode;
        const interior=GameState.cameraMode===3,firstPerson=interior||GameState.cameraMode===1;
        car.root.visible=true;applyCameraVehicle(car,firstPerson);
        if(interior&&!car.cockpit)car.cockpit=window.NVCockpit.create(car);
        if(car.cockpit)car.cockpit.root.visible=interior;
        camera.near=interior?.025:.07;
        const frozen=onlineRender.active&&(nvPrayerPhase()||onlineRender.paused);
        if(frozen)dt=0;

        // Di layar menu, putar kamera sinematik mengelilingi mobil pemain
        if (GameState.mode === 'MENU') {
          const t = performance.now() * 0.00035;
          const radius = 10.5;
          camera.position.set(
            view.pos.x + Math.sin(t) * radius,
            view.pos.y + 3.6,
            view.pos.z + Math.cos(t) * radius
          );
          camera.lookAt(view.pos.x, view.pos.y + 1.1, view.pos.z);
          return;
        }

        // Kembalikan sudut mouse perlahan jika tidak sedang diseret
        if (!GameState.mouseDrag) {
          GameState.camYawOffset *= Math.pow(0.05, dt);
          GameState.camPitchOffset *= Math.pow(0.05, dt);
        }

        const heading = view.heading + GameState.camYawOffset;
        const forward = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));

        // FOV melebar dinamis saat kecepatan tinggi & Nitro
        const speedNorm = Math.min(1, Math.abs(view.speed) / 85);
        const targetFov = interior?74+speedNorm*4+(nitro&&!frozen?3:0):(GameState.cameraMode === 0 ? 64 : 72) + speedNorm * 10 + (nitro&&!frozen ? 14 : 0);
        camera.fov = changed?targetFov:camera.fov+(targetFov-camera.fov)*Math.min(1,dt*6);
        camera.updateProjectionMatrix();

        // Getaran halus saat Nitro aktif
        const shake = nitro&&!frozen ? 0.14 : 0;
        const sx = (Math.random() - 0.5) * shake;
        const sy = (Math.random() - 0.5) * shake;

        if(interior){
          const cockpit=car.cockpit,speedKmh=Math.abs(view.speed)*3.6;
          const {gear}=computeGearAndRpm(speedKmh);
          cockpit.update({steerAngle:view.steerAngle,speedKmh,gear,lap:playerCar.lap,totalLaps:TOTAL_LAPS});
          cockpit.root.rotation.set(view.bodyPitch*.25,0,view.bodyRoll*.25);
          car.root.updateMatrixWorld(true);
          // The viewpoint is fixed at the driver's eye, inside the same 3D
          // cockpit as the wheel. Mouse look rotates the head, not the seat.
          camera.position.copy(cockpit.eye).applyMatrix4(cockpit.root.matrixWorld);
          const yaw=THREE.MathUtils.clamp(GameState.camYawOffset,-.85,.85),pitch=THREE.MathUtils.clamp(GameState.camPitchOffset,-.36,.36);
          const target=cockpit.eye.clone().add(new THREE.Vector3(Math.sin(yaw)*12,-pitch*6,Math.cos(yaw)*12));
          camera.lookAt(target.applyMatrix4(cockpit.root.matrixWorld));
          smoothCamPos.copy(camera.position);smoothLookAt.copy(target);
        }else if (GameState.cameraMode !== 1) {
          // CHASE CAM
          const distBack = (GameState.cameraMode===2?6.2:8.5) + (nitro ? 1.2 : 0);
          const height = (GameState.cameraMode===2?2.1:3.2) + GameState.camPitchOffset * 2.5;
          const desiredPos = view.pos.clone()
            .addScaledVector(forward, -distBack)
            .add(new THREE.Vector3(0, Math.max(1.8, height), 0));

          if(changed)smoothCamPos.copy(desiredPos);else smoothCamPos.lerp(desiredPos, Math.min(1, dt * 9));
          camera.position.copy(smoothCamPos);
          camera.position.x += sx;
          camera.position.y += sy;

          const desiredLook = view.pos.clone()
            .addScaledVector(forward, 10)
            .add(new THREE.Vector3(0, 1.35, 0));
          if(changed)smoothLookAt.copy(desiredLook);else smoothLookAt.lerp(desiredLook, Math.min(1, dt * 12));
          camera.lookAt(smoothLookAt);
        } else {
          // HOOD CAM (Kamera Kap Mesin)
          const carForward = new THREE.Vector3(Math.sin(view.heading), 0, Math.cos(view.heading));
          const hoodPos = view.pos.clone()
            .addScaledVector(carForward, 1.35)
            .add(new THREE.Vector3(0, playerCar.model.id==='kaze'?1.32:1.12, 0));

          camera.position.copy(hoodPos);
          camera.position.x += sx * 0.5;
          camera.position.y += sy * 0.5;

          const lookTarget = view.pos.clone()
            .addScaledVector(carForward, 22)
            .add(new THREE.Vector3(0, 1.2, 0));
          camera.lookAt(lookTarget);
        }
      }

      // =========================================================================
      // 14. HUD, SPEEDOMETER, MINIMAP 2D & EFEK SPEED LINES
      // =========================================================================

      function computeGearAndRpm(speedKmh){return computeVehicleRpm(speedKmh);}


      function formatTime(ms) {
        const totalSec = Math.max(0, ms / 1000);
        const mins = Math.floor(totalSec / 60);
        const secs = Math.floor(totalSec % 60);
        const hundredths = Math.floor((ms % 1000) / 10);
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
      }

      function updateHUD() {
        if (GameState.mode === 'MENU') return;

        const speedKmh = Math.round(Math.abs(nvRenderPose(playerCar).speed) * 3.6);
        const { gear, rpm, rpmNorm } = computeGearAndRpm(speedKmh);

        DOM.hudSpeed.textContent = speedKmh;
        DOM.hudGear.textContent = gear;
        DOM.hudRpmVal.textContent = rpm;
        DOM.hudRpmBar.style.width = `${Math.round(rpmNorm * 100)}%`;

        const nitroPct = Math.round(playerCar.nitro);
        DOM.hudNitroPct.textContent = `${nitroPct}%`;
        DOM.hudNitroBar.style.width = `${nitroPct}%`;

        // Posisi balap real-time
        const standings = getSortedStandings();
        const myPos = standings.findIndex(r => r.isPlayer) + 1;
        DOM.hudPos.textContent = myPos;
        DOM.hudLap.textContent = Math.min(TOTAL_LAPS, playerCar.lap);

        if (GameState.mode === 'RACING') {
          DOM.hudLapTime.textContent = formatTime(gameClock - GameState.lapStartTime);
        }

        // Efek visual Nitro overlay
        DOM.nitroVignette.style.opacity = nvDrivingNitro(playerCar) ? '1' : '0';
        DOM.speedlinesCanvas.style.opacity = nvDrivingNitro(playerCar) ? '0.85' : '0';

        drawMinimap();
      }

      function drawMinimap() {
        const canvas = DOM.minimapCanvas;
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        // Latar minimap
        ctx.fillStyle = 'rgba(17, 22, 27, 0)';
        ctx.fillRect(0, 0, w, h);

        const pad = 14;
        const spanX = minimapBounds.maxX - minimapBounds.minX;
        const spanZ = minimapBounds.maxZ - minimapBounds.minZ;
        const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanZ);
        const offsetX = (w - spanX * scale) / 2;
        const offsetY = (h - spanZ * scale) / 2;

        const toMapX = x => offsetX + (x - minimapBounds.minX) * scale;
        const toMapY = z => offsetY + (z - minimapBounds.minZ) * scale;

        // Gambar siluet sirkuit
        ctx.beginPath();
        for (let i = 0; i < CURVE_SAMPLES; i += 4) {
          const mx = toMapX(trackPoints[i].x);
          const my = toMapY(trackPoints[i].z);
          if (i === 0) ctx.moveTo(mx, my);
          else ctx.lineTo(mx, my);
        }
        if(currentCircuit().open){const last=trackPoints[CURVE_SAMPLES-1];ctx.lineTo(toMapX(last.x),toMapY(last.z));}else ctx.closePath();
        ctx.strokeStyle = 'rgba(146, 161, 177, 0.28)';
        ctx.lineWidth = 6;
        ctx.stroke();

        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1.6;
        ctx.stroke();

        // Titik Start/Finish
        const sx = toMapX(trackPoints[0].x);
        const sy = toMapY(trackPoints[0].z);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(sx - 4, sy - 2, 8, 4);
        if(currentCircuit().open){const last=trackPoints[CURVE_SAMPLES-1];ctx.fillStyle='#f0bf70';ctx.fillRect(toMapX(last.x)-6,toMapY(last.z)-2,12,4);}

        // Titik mobil lawan AI
        aiCars.forEach(ai => {
          ctx.beginPath();
          ctx.arc(toMapX(ai.pos.x), toMapY(ai.pos.z), 3.6, 0, Math.PI * 2);
          ctx.fillStyle = ai.colorHex;
          ctx.fill();
        });

        // Titik mobil pemain (bercahaya)
        const px = toMapX(playerCar.pos.x);
        const py = toMapY(playerCar.pos.z);
        ctx.beginPath();
        ctx.arc(px, py, 5.2, 0, Math.PI * 2);
        ctx.fillStyle = '#f47c46';
        ctx.shadowColor = '#f47c46';
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Inisialisasi & Animasi Speed Lines saat Nitro
      function initSpeedLines() {
        speedCtx = DOM.speedlinesCanvas.getContext('2d');
        resizeSpeedLines();
        for (let i = 0; i < 42; i++) {
          speedLines.push({
            angle: Math.random() * Math.PI * 2,
            dist: 0.25 + Math.random() * 0.65,
            speed: 1.4 + Math.random() * 1.8,
            length: 0.12 + Math.random() * 0.22,
            color: Math.random() > 0.35 ? 'rgba(56, 189, 248, 0.65)' : 'rgba(244, 114, 182, 0.55)'
          });
        }
      }

      function resizeSpeedLines() {
        DOM.speedlinesCanvas.width = window.innerWidth;
        DOM.speedlinesCanvas.height = window.innerHeight;
      }

      function updateSpeedLines(dt) {
        if (!playerCar || !playerCar.nitroActive || !speedCtx) return;
        const w = DOM.speedlinesCanvas.width;
        const h = DOM.speedlinesCanvas.height;
        const cx = w / 2;
        const cy = h / 2;
        const maxR = Math.hypot(cx, cy);

        speedCtx.clearRect(0, 0, w, h);
        speedLines.forEach(line => {
          line.dist += line.speed * dt;
          if (line.dist > 1.15) {
            line.dist = 0.2 + Math.random() * 0.25;
            line.angle = Math.random() * Math.PI * 2;
          }
          const r1 = line.dist * maxR;
          const r2 = (line.dist + line.length) * maxR;
          speedCtx.beginPath();
          speedCtx.moveTo(cx + Math.cos(line.angle) * r1, cy + Math.sin(line.angle) * r1);
          speedCtx.lineTo(cx + Math.cos(line.angle) * r2, cy + Math.sin(line.angle) * r2);
          speedCtx.strokeStyle = line.color;
          speedCtx.lineWidth = 2;
          speedCtx.stroke();
        });
      }

      // =========================================================================
      // 15. ALUR BALAPAN & HITUNG MUNDUR (3, 2, 1, GO!)
      // =========================================================================

      function startNewRace() {
        if(onlineRender.enabled){NVGame._emit('start-request',{circuit:settings.circuit});return;}
        if(!gameReady)return;
        raceGeneration++;finishDelay=-1;goUntil=0;clearInput();document.activeElement?.blur();
        settings.laps=currentCircuit().open?1:normalizeLaps(settings.laps,3);TOTAL_LAPS=settings.laps;
        settings.bots=normalizeBots(settings.bots);
        GameState.raceConfig=Object.freeze({circuit:settings.circuit,laps:TOTAL_LAPS,bots:settings.bots,model:settings.model,difficulty:settings.difficulty});
        GameState.lastLapTime=0;$('hud-lap-total').textContent=TOTAL_LAPS;$('hud-track-name').textContent=currentCircuit().short;
        stopEnginePreview();audio.setVehicle(settings.model);audio.init();audio.setMuted(settings.muted);GameState.muted=settings.muted;
        createRacers();
        DOM.startOverlay.classList.add('hidden');DOM.finishOverlay.classList.add('hidden');$('pause-overlay').classList.add('hidden');$('tour-overlay').classList.add('hidden');
        renderer.toneMappingExposure=getEnvironmentPreset().exposure;
        DOM.hudLayer.classList.remove('hidden');DOM.hudLayer.classList.add('flex');
        GameState.mode='COUNTDOWN';GameState.currentLap=1;GameState.bestLapTime=Infinity;GameState.totalRaceTime=0;
        resetRaceCamera();
        DOM.hudBestLap.textContent='--:--.--';DOM.hudLapTime.textContent='00:00.00';
        DOM.statusBanner.classList.add('hidden');if(bannerTimeout)clearTimeout(bannerTimeout);
        for(const p of particles){scene.remove(p.mesh);p.mesh.material.dispose();}particles.length=0;
        gameClock=0;simulationAccumulator=0;lastFrameTime=performance.now();
        const fwd=new THREE.Vector3(Math.sin(playerCar.heading),0,Math.cos(playerCar.heading));
        smoothCamPos.copy(playerCar.pos).addScaledVector(fwd,-8).add(new THREE.Vector3(0,2.8,0));
        smoothLookAt.copy(playerCar.pos).addScaledVector(fwd,8);smoothLookAt.y=1;
        countdownElapsed=0;countdownStep=-1;updateCountdown(0);
      }


      // =========================================================================
      // 16. EVENT LISTENERS (KEYBOARD, MOUSE CAMERA, TOUCH & TOMBOL UI)
      // =========================================================================

      function setupControls() {
        const keyMap={KeyW:'up',ArrowUp:'up',KeyS:'down',ArrowDown:'down',KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right',ShiftLeft:'nitro',ShiftRight:'nitro',Space:'nitro'};
        window.addEventListener('keydown',e=>{
          if(e.target.closest?.('input,select,textarea,[contenteditable="true"]')||document.querySelector('dialog[open]'))return;
          if(GameState.mode==='TOUR'&&e.code==='Escape'){e.preventDefault();goToGarage();return;}
          if(onlineRender.active&&nvPrayerPhase()&&(keyMap[e.code]||['Escape','KeyP','KeyR','KeyC'].includes(e.code))){e.preventDefault();return;}
          if(onlineRender.active&&(playerCar?.finished||playerCar?.dnf)&&(keyMap[e.code]||e.code==='KeyR')){e.preventDefault();return;}
          if(['Escape','KeyP'].includes(e.code)&&!e.repeat){
            if(onlineRender.active){e.preventDefault();onlineRender.paused?nvResume():nvPause();return;}
            if(GameState.mode==='PAUSED'){e.preventDefault();resumeRace();}else if(['RACING','COUNTDOWN'].includes(GameState.mode)){e.preventDefault();pauseRace();}return;
          }
          if(!['RACING','COUNTDOWN'].includes(GameState.mode))return;
          if(keyMap[e.code]){e.preventDefault();Input[keyMap[e.code]]=true;if(onlineRender.active)nvUnlockAudio();}
          if(!e.repeat){if(e.code==='KeyC')toggleCamera();if(e.code==='KeyR')resetPlayerToTrack();if(e.code==='KeyM')toggleMute();}
        });
        window.addEventListener('keyup',e=>{if(keyMap[e.code])Input[keyMap[e.code]]=false;});
        DOM.container.addEventListener('pointerdown',e=>{if(GameState.mode==='MENU'||(onlineRender.active&&nvPrayerPhase()))return;nvUnlockAudio();GameState.mouseDrag=true;GameState.lastMouseX=e.clientX;GameState.lastMouseY=e.clientY;});
        // A cancelled steering finger must not release a different gas finger.
        // Window listeners also cover releases outside a button if capture fails.
        window.addEventListener('pointerup',e=>{GameState.mouseDrag=false;releaseTouchPointer(e.pointerId);});
        window.addEventListener('pointercancel',e=>{GameState.mouseDrag=false;releaseTouchPointer(e.pointerId);});
        window.addEventListener('pointermove',e=>{
          if(!GameState.mouseDrag||GameState.mode!=='RACING')return;
          const dx=e.clientX-GameState.lastMouseX,dy=e.clientY-GameState.lastMouseY;
          GameState.lastMouseX=e.clientX;GameState.lastMouseY=e.clientY;
          GameState.camYawOffset=Math.max(-1.4,Math.min(1.4,GameState.camYawOffset-dx*.006));
          GameState.camPitchOffset=Math.max(-.6,Math.min(1,GameState.camPitchOffset+dy*.005));
        });
        DOM.btnStart.addEventListener('click',startNewRace);DOM.btnPlayAgain.addEventListener('click',startNewRace);
        DOM.btnCam.addEventListener('click',()=>{toggleCamera();DOM.btnCam.blur();});
        DOM.btnReset.addEventListener('click',()=>{resetPlayerToTrack();DOM.btnReset.blur();});
        DOM.btnMute.addEventListener('click',()=>{toggleMute();DOM.btnMute.blur();});
        const showTouch=()=>{
          const enabled=window.matchMedia('(pointer:coarse)').matches||navigator.maxTouchPoints>0||innerWidth<768;
          DOM.touchLeft.classList.toggle('hidden',!enabled);DOM.touchRight.classList.toggle('hidden',!enabled);
          $('hud-layer').classList.toggle('has-touch',enabled);
        };showTouch();
        function bindTouch(id,key){
          const el=$(id);
          el.addEventListener('pointerdown',e=>{
            e.preventDefault();
            if((e.button!==undefined&&e.button!==0)||!['RACING','COUNTDOWN'].includes(GameState.mode))return;
            if(onlineRender.active&&(onlineRender.paused||!onlineRender.visible||nvPrayerPhase()||playerCar?.finished||playerCar?.dnf))return;
            if(touchPointers.has(e.pointerId))return;
            touchPointers.set(e.pointerId,{el,key});
            try{el.setPointerCapture?.(e.pointerId);}catch{}
            nvUnlockAudio();Input[key]=true;el.classList.add('active');el.setAttribute('aria-pressed','true');
          });
          const release=e=>releaseTouchPointer(e.pointerId);
          el.addEventListener('pointerup',release);el.addEventListener('pointercancel',release);el.addEventListener('lostpointercapture',release);
          el.addEventListener('contextmenu',e=>e.preventDefault());
        }
        bindTouch('t-left','left');bindTouch('t-right','right');bindTouch('t-gas','up');bindTouch('t-brake','down');bindTouch('t-nitro','nitro');
        window.addEventListener('resize',()=>{if(!camera||!renderer)return;camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();applyQuality();resizeSpeedLines();showTouch();});
        bindGarageControls();bindCityControls();bindWorldControls();
      }



      function toggleCamera() {
        if(!['RACING','COUNTDOWN','PAUSED','FINISHED'].includes(GameState.mode))return;
        if(onlineRender.active&&nvPrayerPhase())return;
        selectRaceCamera((GameState.cameraMode+1)%RACE_CAMERAS.length);
      }
      function toggleMute() {
        GameState.muted=!GameState.muted;settings.muted=GameState.muted;audio.setMuted(GameState.muted);
        DOM.muteIcon.textContent=GameState.muted?'×':'♪';DOM.muteLabel.textContent=GameState.muted?'Senyap':'Audio';persistSettings();
        window.NVGame?._emit('mute',{muted:GameState.muted});
      }


      // =========================================================================
      // 17. ANIMATION LOOP UTAMA
      // =========================================================================
      let lastFrameTime = 0;


      function animate(now) {
        if(onlineRender.disposed)return;
        onlineRender.frameRequest=requestAnimationFrame(animate);
        const dt=Math.min(.1,Math.max(0,(now-lastFrameTime)/1000||.016));lastFrameTime=now;
        if(document.hidden||!onlineRender.visible)return;
        if(onlineRender.active){nvRenderOnline(dt,now);return;}
        if(GameState.mode==='MENU'){renderGarage(dt,now);return;}
        if(GameState.mode==='TOUR'){updateCityTour(dt);return;}
        if(GameState.mode==='PAUSED')return;
        if(GameState.mode==='COUNTDOWN')updateCountdown(dt);
        if(GameState.mode==='RACING'){
          simulationAccumulator+=dt;
          const step=1/90;
          while(simulationAccumulator>=step&&GameState.mode==='RACING'){
            gameClock+=step*1000;updateAICars(step);updatePlayerPhysics(step);updateParticles(step);simulationAccumulator-=step;
          }
          if(goUntil&&gameClock>=goUntil){DOM.countdown.classList.add('hidden');goUntil=0;}
        }else if(GameState.mode==='FINISHED'){
          updateParticles(dt);audio.updateEngine(0,0,false,0,false);
          if(finishDelay>=0){finishDelay-=dt;if(finishDelay<0){DOM.finishOverlay.classList.remove('hidden');$('btn-play-again').focus();}}
        }
        updateCamera(dt);updateHUD();updateSpeedLines(dt);
        updateCityWorld(dt,playerCar.pos);
        renderer.setScissorTest(false);renderer.setViewport(0,0,innerWidth,innerHeight);renderer.render(scene,camera);
      }

      // Rendering-only online adapter. No simulation, laps, persistence or rewards
      // are computed here. The shell supplies predicted/authoritative snapshots.
      function nvNumber(value,fallback=0,min=-Infinity,max=Infinity){const n=Number(value);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;}
      function nvPrayerPhase(phase=onlineRender.phase){return phase==='prayer_pause'||phase==='resume_countdown';}
      function nvResultPhase(phase=onlineRender.phase){return phase==='settling'||phase==='finished';}
      function nvRenderPose(racer){return racer?.nvVisualPose||racer;}
      function nvDrivingNitro(racer){return !!racer?.nitroActive&&!racer.finished&&!racer.dnf&&(!onlineRender.active||onlineRender.phase==='racing');}
      function nvSyncResultRollout(racer){
        if(!nvResultPhase()){
          if(!nvPrayerPhase()){racer.nvRollout=null;racer.nvVisualPose=null;}
          return;
        }
        if(racer.nvRollout)return; // settling -> finished must not restart rollout
        const t=Number.isFinite(racer.trackT)?racer.trackT:currentCircuit().open?-racer.pos.z/trackTotalLength:findClosestTrackIndex(racer.pos.x,racer.pos.z,racer.trackIdx)/CURVE_SAMPLES;
        const center=trackCurve.getPointAt(t),tangent=trackCurve.getTangentAt(t),heading=Math.atan2(tangent.x,tangent.z);
        const duration=currentCircuit().open?Math.max(.001,Math.min(3,(1.35-t)*trackTotalLength*3/Math.max(1,Math.abs(racer.speed)))):3;
        racer.nvRollout={elapsed:0,duration,startT:t,speed:Math.abs(racer.speed),direction:racer.speed<0?-1:1,offset:racer.pos.clone().sub(center),pathHeading:heading,headingError:Math.atan2(Math.sin(racer.heading-heading),Math.cos(racer.heading-heading)),drift:racer.driftAngle,steer:racer.steerAngle,roll:racer.bodyRoll,pitch:racer.bodyPitch};
        racer.nvVisualPose={pos:racer.pos.clone(),heading:racer.heading,speed:racer.speed,steerAngle:racer.steerAngle,driftAngle:racer.driftAngle,bodyRoll:racer.bodyRoll,bodyPitch:racer.bodyPitch,nitroActive:false};
      }
      function nvUpdateResultRollout(racer,dt){
        const rollout=racer.nvRollout,pose=racer.nvVisualPose;
        if(!rollout||!pose)return racer;
        if(!nvResultPhase()||onlineRender.paused||nvPrayerPhase())return pose;
        rollout.elapsed=Math.min(rollout.duration,rollout.elapsed+dt);
        const u=rollout.elapsed/rollout.duration,remaining=1-u;
        // Analytic, monotonic visual easing. Official x/z, speed, laps, time and
        // rankings stay on the received snapshot; this has no collision body.
        const distance=rollout.direction*rollout.speed*rollout.duration*(u-u*u+u*u*u/3);
        const rawT=rollout.startT+distance/trackTotalLength,t=currentCircuit().open?rawT:((rawT%1)+1)%1;
        const center=trackCurve.getPointAt(t),tangent=trackCurve.getTangentAt(t),heading=Math.atan2(tangent.x,tangent.z);
        const turn=Math.atan2(Math.sin(heading-rollout.pathHeading),Math.cos(heading-rollout.pathHeading));
        pose.pos.copy(rollout.offset).applyAxisAngle(new THREE.Vector3(0,1,0),turn).add(center);
        pose.heading=heading+rollout.headingError*Math.exp(-rollout.elapsed*4);
        pose.speed=rollout.direction*rollout.speed*remaining*remaining;pose.steerAngle=rollout.steer*remaining;
        pose.driftAngle=rollout.drift*remaining;pose.bodyRoll=rollout.roll*remaining;pose.bodyPitch=rollout.pitch*remaining;
        return pose;
      }
      function nvAbortError(message){const error=new Error(message);error.name='AbortError';return error;}
      function nvCancelFrameWaiters(message){
        if(onlineRender.presentationRequest)cancelAnimationFrame(onlineRender.presentationRequest);
        onlineRender.presentationRequest=0;onlineRender.presentedFrame=null;
        for(const waiter of raceFrameWaiters){clearTimeout(waiter.timer);waiter.reject(nvAbortError(message));}
        raceFrameWaiters.clear();
      }
      async function nvEnsureModels(ids){
        const requested=[...new Set(Array.isArray(ids)?ids:[ids])];
        if(requested.some(id=>!CAR_CATALOG.some(c=>c.id===id)))throw new Error('Unknown vehicle in room roster');
        await Promise.all(requested.map(id=>NVImportedCars.load(id)));
        return requested.map(id=>({id,loaded:NVImportedCars.isLoaded(id)}));
      }
      function nvFrameMatches(frame,waiter){
        return !!frame&&onlineRender.active&&!document.hidden&&onlineRender.visible&&frame.generation===waiter.generation&&frame.raceId===waiter.raceId&&(!waiter.startToken||frame.startToken===waiter.startToken)&&frame.tick>=waiter.minimumTick;
      }
      function nvWaitForRaceFrame(options={}){
        const raceId=options.raceId||onlineRender.raceId,startToken=options.startToken||onlineRender.startToken,generation=onlineRender.generation,minimumTick=nvNumber(options.minimumTick,0,0);
        if(!onlineRender.active||raceId!==onlineRender.raceId||(startToken&&startToken!==onlineRender.startToken))return Promise.reject(nvAbortError('Arena yang diminta sudah tidak aktif.'));
        const wanted={raceId,startToken,generation,minimumTick};
        if(nvFrameMatches(onlineRender.presentedFrame,wanted))return Promise.resolve({...onlineRender.presentedFrame});
        return new Promise((resolve,reject)=>{
          const waiter={...wanted,resolve,reject,timer:0};
          waiter.timer=setTimeout(()=>{raceFrameWaiters.delete(waiter);const error=new Error('Arena belum selesai ditampilkan sebelum batas pemuatan.');error.name='RendererFrameTimeoutError';reject(error);},nvNumber(options.timeoutMs,15000,1,120000));
          raceFrameWaiters.add(waiter);
        });
      }
      function nvRecordRaceFrame(now){
        if(!onlineRender.snapshot||onlineRender.presentationRequest||(!raceFrameWaiters.size&&onlineRender.presentedFrame))return;
        const frame={raceId:onlineRender.raceId,startToken:onlineRender.startToken,generation:onlineRender.generation,tick:nvNumber(onlineRender.snapshot.tick,-1),renderedAt:now};
        // A completed main-scene draw plus the following animation-frame
        // opportunity prevents acknowledging only asset decoding or a garage draw.
        onlineRender.presentationRequest=requestAnimationFrame(()=>{
          onlineRender.presentationRequest=0;
          if(!onlineRender.active||onlineRender.generation!==frame.generation||document.hidden||!onlineRender.visible)return;
          const first=!onlineRender.presentedFrame;onlineRender.presentedFrame=frame;
          for(const waiter of [...raceFrameWaiters])if(nvFrameMatches(frame,waiter)){clearTimeout(waiter.timer);raceFrameWaiters.delete(waiter);waiter.resolve({...frame});}
          if(first)NVGame._emit('arena-frame',{...frame});
        });
      }
      function nvLoadout(value){
        const input=value||{},id=CAR_CATALOG.some(c=>c.id===input.carId)?input.carId:settings.model;
        return {carId:id,color:/^#[\da-f]{6}$/i.test(input.color||'')?input.color:(settings.colors[id]||CAR_CATALOG.find(c=>c.id===id).color),finish:['metallic','gloss','matte'].includes(input.finish)?input.finish:settings.finish,rimId:NVWheels.validId(input.rimId||'stock'),rimColor:/^#[\da-f]{6}$/i.test(input.rimColor||'')?input.rimColor:'#c7cdd4',stockRimPainted:input.stockRimPainted===true,stripeId:window.NVStripes?.validId(input.stripeId)||'none',stripeColor:/^#[\da-f]{6}$/i.test(input.stripeColor||'')?input.stripeColor:'#ffffff',stats:input.stats||null,tuningVersion:input.tuningVersion||null,appearanceVersion:input.appearanceVersion||null};
      }
      function nvAppearanceKey(loadout){return [loadout.carId,loadout.color,loadout.finish,loadout.rimId,loadout.rimColor,loadout.stockRimPainted?1:0,loadout.stripeId,loadout.stripeColor].join('|');}
      function nvSetLoadout(value){
        const loadout=nvLoadout(value);
        if(!NVImportedCars.isLoaded(loadout.carId)&&CAR_CATALOG.find(c=>c.id===loadout.carId).branded)throw new Error('Model '+loadout.carId+' belum tersedia');
        const previous=onlineRender.previewLoadout;onlineRender.previewLoadout=loadout;
        settings.model=loadout.carId;settings.colors[loadout.carId]=loadout.color;settings.finish=loadout.finish;
        if(!garageCar||garageCar.modelId!==loadout.carId)selectCar(loadout.carId,true);
        else{paintVehicle(garageCar,loadout.color);NVWheels.apply(garageCar,loadout);window.NVStripes?.apply(garageCar,loadout);updateGarageUI();garageNeedsRender=true;}
        if(previous?.carId!==loadout.carId)audio.setVehicle(loadout.carId);
        return {...loadout};
      }
      function nvConfigure(options={}){
        if(typeof options.online==='boolean')onlineRender.enabled=options.online;
        document.body.classList.toggle('nv-embedded',options.embedded!==false);
        if(options.previewOnly===true&&(onlineRender.active||onlineRender.preparing))nvStopRace();
        if(options.previewOnly!==undefined)onlineRender.previewOnly=!!options.previewOnly;
        if(CIRCUITS.some(c=>c.id===options.circuit)&&options.circuit!==activeCircuitId){
          if(onlineRender.active)nvStopRace();
          settings.circuit=options.circuit;buildCircuitWorld();applyTimeOfDay(false);updateStreetLights(1000,trackPoints[0]);captureCityReflections();
        }
        if(options.laps!==undefined||currentCircuit().open){settings.laps=currentCircuit().open?1:normalizeLaps(options.laps);TOTAL_LAPS=settings.laps;}
        if(['high','medium','low'].includes(options.quality)){settings.quality=options.quality;applyQuality();}
        if(['dusk','night'].includes(options.timeOfDay)){settings.timeOfDay=options.timeOfDay;applyTimeOfDay(false);}
        if(typeof options.muted==='boolean'){settings.muted=options.muted;GameState.muted=options.muted;audio.setMuted(options.muted);DOM.muteIcon.textContent=options.muted?'×':'♪';DOM.muteLabel.textContent=options.muted?'Senyap':'Audio';updateGarageSoundUI();}
        const supplied=options.loadout||(options.carId?options:null);if(supplied)nvSetLoadout(supplied);
        if(options.previewOnly===true){
          if(GameState.mode!=='MENU')goToGarage();
          onlineRender.previewOnly=true;document.body.classList.add('nv-preview');DOM.startOverlay.classList.remove('hidden');garageNeedsRender=true;
        }
        if(options.showCredits===true)nvShowCredits();
        updateCircuitUI();return nvGetState();
      }
      function nvGetInput(){
        if(!onlineRender.active||onlineRender.paused||!onlineRender.visible||document.hidden||onlineRender.phase!=='racing'||playerCar?.finished||playerCar?.dnf)return {throttle:0,brake:0,steer:0,nitro:false};
        const external=onlineRender.externalInput;
        const value=external?{throttle:nvNumber(external.throttle,0,0,1),brake:nvNumber(external.brake,0,0,1),steer:nvNumber(external.steer,0,-1,1),nitro:!!external.nitro}:{throttle:Input.up?1:0,brake:Input.down?1:0,steer:(Input.left?1:0)-(Input.right?1:0),nitro:!!Input.nitro};
        if(onlineRender.resetRequested)value.reset=true;return value;
      }
      function nvEmitInput(dt,force=false){
        onlineRender.inputElapsed+=dt;const input=nvGetInput(),key=JSON.stringify(input);
        if(force||key!==onlineRender.lastInput||onlineRender.inputElapsed>=1/30){onlineRender.inputElapsed=0;onlineRender.lastInput=key;NVGame._emit('input',input);onlineRender.resetRequested=false;}
      }
      function nvPause(){
        if(!onlineRender.active)return;onlineRender.paused=true;clearInput();onlineRender.externalInput=null;nvEmitInput(0,true);$('pause-overlay').classList.remove('hidden');
        audio.updateEngine(0,0,false,0,false);if(audio.ctx)audio.ctx.suspend().catch(()=>{});NVGame._emit('pause',{raceId:onlineRender.raceId});
      }
      function nvResume(){
        onlineRender.paused=false;clearInput();$('pause-overlay').classList.add('hidden');if(audio.ctx&&!settings.muted)audio.ctx.resume().catch(()=>{});NVGame._emit('resume',{raceId:onlineRender.raceId});
      }
      function nvUnlockAudio(){audio.init();if(audio.ctx&&!settings.muted&&onlineRender.visible)audio.ctx.resume().catch(()=>{});return !!audio.ctx;}
      function nvHeadlights(){
        for(const lamp of headLights){if(lamp.parent)lamp.parent.remove(lamp);if(lamp.target?.parent)lamp.target.parent.remove(lamp.target);}headLights=[];
        if(!playerCar)return;
        const locations=playerCar.visual.headlightPositions||[[-.66,.66,1.7],[.66,.66,1.7]];
        for(const position of locations){const lamp=new THREE.SpotLight(0xe4f1ff,1.8,65,.39,.7,1.2),target=new THREE.Object3D();lamp.position.fromArray(position);target.position.set(position[0],.1,28);playerCar.visual.root.add(lamp,target);lamp.target=target;headLights.push(lamp);}
      }
      function nvEnsureRacer(raw){
        const id=String(raw.id||raw.userId||'');if(!id)return null;
        const loadout=nvLoadout(raw.loadout||raw),appearance=nvAppearanceKey(loadout);
        let racer=allRacers.find(r=>r.id===id);const isPlayer=id===onlineRender.localId;
        if(racer&&racer.appearanceKey!==appearance){disposeVehicle(racer.visual);racer.visual=null;}
        if(!racer){racer={id,name:String(raw.name||'Racer').slice(0,64),isPlayer,isBot:!!raw.isBot,pos:new THREE.Vector3(),heading:0,speed:0,steerAngle:0,driftAngle:0,bodyRoll:0,bodyPitch:0,nitro:50,nitroActive:false,trackIdx:0,lap:1,progress:0,finished:false,finishTime:0,transmissionGear:0};allRacers.push(racer);}
        const created=!racer.visual;
        if(created){
          racer.visual=createVehicle(loadout.carId,loadout.color,isPlayer,loadout);scene.add(racer.visual.root);racer.appearanceKey=appearance;racer.shadowMeshes=[];racer.detailMeshes=[];
          racer.visual.root.traverse(node=>{
            if(node.isMesh){if(!isPlayer){node.castShadow=false;const mat=node.material;if(mat&&!mat.transparent)racer.shadowMeshes.push(node);if(/interior|dashboard|seat|steering|pedal|seatbelt|caliper|brake_disc/i.test(node.name+' '+(mat?.name||'')))racer.detailMeshes.push(node);}
              for(const mat of Array.isArray(node.material)?node.material:[node.material]){if(mat.transmission>0){mat.transmission=0;mat.needsUpdate=true;}if(/^glass/.test(mat.name||'')){mat.color.setHex(0x25313b);mat.opacity=.82;mat.metalness=.35;mat.roughness=.09;}mat.envMapIntensity=Math.min(mat.envMapIntensity||1,.8);}
            }
            if(!isPlayer&&(node.isPointLight||node.isSpotLight))node.visible=false;
          });
        }
        racer.model={...CAR_CATALOG.find(c=>c.id===loadout.carId),...(loadout.stats||{})};racer.loadout=loadout;racer.colorHex=loadout.color;racer.isPlayer=isPlayer;racer.name=String(raw.name||racer.name).slice(0,64);
        if(isPlayer&&(playerCar!==racer||created)){playerCar=racer;audio.setVehicle(loadout.carId);nvHeadlights();}
        return racer;
      }
      function nvSetLocalPlayer(id){
        onlineRender.localId=String(id||'');allRacers.forEach(r=>r.isPlayer=r.id===onlineRender.localId);playerCar=allRacers.find(r=>r.isPlayer)||null;
        if(playerCar){audio.setVehicle(playerCar.model.id);nvHeadlights();}return onlineRender.localId;
      }
      async function nvStartRace(options={}){
        if(onlineRender.active)nvStopRace();
        const generation=++onlineRender.generation;nvCancelFrameWaiters('Arena diganti oleh persiapan baru.');onlineRender.preparing=true;
        const supplied=options.loadouts||options.racers||options.participants||[];
        const entries=Array.isArray(supplied)?supplied:Object.entries(supplied).map(([id,loadout])=>({id,loadout}));
        const required=entries.map(entry=>entry.loadout?.carId||entry.carId).filter(Boolean);
        if(!required.length)required.push(onlineRender.previewLoadout?.carId||settings.model);
        try{await nvEnsureModels(required);}catch(error){if(generation===onlineRender.generation)onlineRender.preparing=false;throw error;}
        if(onlineRender.disposed||generation!==onlineRender.generation)throw nvAbortError('Persiapan arena telah dibatalkan.');
        onlineRender.preparing=false;
        nvConfigure({...options.config,circuit:options.circuit||options.config?.circuit,online:true,previewOnly:false});
        allRacers.forEach(r=>disposeVehicle(r.visual));allRacers=[];aiCars=[];playerCar=null;headLights=[];
        onlineRender.active=true;onlineRender.previewOnly=false;onlineRender.paused=false;onlineRender.raceId=options.raceId||null;onlineRender.startToken=options.startToken||null;onlineRender.phase='loading';onlineRender.snapshot=null;onlineRender.receivedAt=performance.now();onlineRender.lastInput='';onlineRender.externalInput=null;onlineRender.resetRequested=false;
        onlineRender.localId=String(options.localRacerId||options.localPlayerId||onlineRender.localId||'local');
        for(const entry of entries)nvEnsureRacer(entry);
        if(!playerCar)nvEnsureRacer({id:onlineRender.localId,name:'ANDA',loadout:onlineRender.previewLoadout||{carId:settings.model}});
        aiCars=allRacers.filter(r=>!r.isPlayer);
        GameState.raceConfig=Object.freeze({circuit:settings.circuit,laps:TOTAL_LAPS,bots:0,model:playerCar.model.id,difficulty:'normal',...options.config});
        GameState.mode='COUNTDOWN';GameState.currentLap=1;GameState.bestLapTime=Infinity;GameState.totalRaceTime=0;GameState.raceStartTime=0;GameState.lapStartTime=0;resetRaceCamera();
        gameClock=0;simulationAccumulator=0;clearInput();stopEnginePreview();audio.setVehicle(playerCar.model.id);audio.init();audio.setMuted(settings.muted);GameState.muted=settings.muted;
        document.body.classList.remove('nv-preview');DOM.startOverlay.classList.add('hidden');DOM.finishOverlay.classList.add('hidden');$('pause-overlay').classList.add('hidden');$('tour-overlay').classList.add('hidden');DOM.hudLayer.classList.remove('hidden');DOM.hudLayer.classList.add('flex');
        $('hud-lap-total').textContent=TOTAL_LAPS;$('hud-pos-total').textContent=allRacers.length;$('hud-track-name').textContent=currentCircuit().short;$('hud-car-name').textContent=playerCar.model.name;DOM.camLabel.textContent='Chase';DOM.hudBestLap.textContent='--:--.--';DOM.hudLapTime.textContent='00:00.00';DOM.countdown.textContent='MENYIAPKAN GRID';DOM.countdown.classList.remove('hidden');DOM.statusBanner.classList.add('hidden');
        renderer.toneMappingExposure=getEnvironmentPreset().exposure;nvHeadlights();rivalDetailTick=1000;
        const p=trackPoints[0],t=trackTangents[0];playerCar.pos.copy(p);playerCar.heading=Math.atan2(t.x,t.z);
        smoothCamPos.copy(p).addScaledVector(t,-8).add(new THREE.Vector3(0,2.8,0));smoothLookAt.copy(p).addScaledVector(t,8);smoothLookAt.y=1;
        lastFrameTime=performance.now();NVGame._emit('race-started',{raceId:onlineRender.raceId,localRacerId:onlineRender.localId});return nvGetState();
      }
      function nvApplySnapshot(snapshot){
        if(!onlineRender.active||!snapshot||!Array.isArray(snapshot.racers))return false;
        if(snapshot.raceId&&onlineRender.raceId&&snapshot.raceId!==onlineRender.raceId)return false;
        if(Number.isFinite(snapshot.tick)&&Number.isFinite(onlineRender.snapshot?.tick)&&snapshot.tick<onlineRender.snapshot.tick)return false;
        const ids=new Set(),wasPlayerFinished=!!(playerCar?.finished||playerCar?.dnf);
        for(const raw of snapshot.racers){
          if(!raw||!Number.isFinite(Number(raw.x))||!Number.isFinite(Number(raw.z)))continue;
          const racer=nvEnsureRacer(raw);if(!racer)continue;ids.add(racer.id);
          racer.previousSpeed=racer.speed;racer.pos.set(nvNumber(raw.x,0,-100000,100000),nvNumber(raw.y,0,-20,1000),nvNumber(raw.z,0,-100000,100000));
          racer.heading=nvNumber(raw.heading);racer.speed=nvNumber(raw.speed,0,-250,250);racer.steerAngle=nvNumber(raw.steerAngle,0,-1,1);racer.driftAngle=nvNumber(raw.driftAngle,0,-2,2);racer.bodyRoll=nvNumber(raw.bodyRoll,0,-.5,.5);racer.bodyPitch=nvNumber(raw.bodyPitch,0,-.5,.5);racer.nitro=nvNumber(raw.nitro,0,0,100);racer.nitroActive=!!raw.nitroActive;
          racer.lap=nvNumber(raw.lap,1,1,21);racer.completedLaps=nvNumber(raw.completedLaps);racer.progress=nvNumber(raw.progress);racer.finished=!!raw.finished;racer.dnf=!!raw.dnf;racer.finishTime=nvNumber(raw.finishTimeMs);racer.serverPosition=nvNumber(raw.position,0,0,64);racer.connected=raw.connected!==false;racer.ghost=!!raw.ghost;racer.trackIdx=Math.round(nvNumber(raw.trackIdx,0,0,CURVE_SAMPLES-1));racer.trackT=typeof raw.trackT==='number'&&Number.isFinite(raw.trackT)?(currentCircuit().open?raw.trackT:((raw.trackT%1)+1)%1):null;racer.lapTimeMs=nvNumber(raw.lapTimeMs,Math.max(0,nvNumber(snapshot.elapsedMs)-nvNumber(raw.lapStartedMs)));racer.bestLapMs=raw.bestLapMs==null?null:nvNumber(raw.bestLapMs);racer.lastLapMs=raw.lastLapMs==null?null:nvNumber(raw.lastLapMs);racer.lastProcessedSeq=nvNumber(raw.lastProcessedSeq);
          racer.visual.root.userData.ghost=racer.ghost;racer.visual.root.position.copy(racer.pos);racer.visual.root.rotation.y=racer.heading+racer.driftAngle*.55;
        }
        if(ids.size){for(const racer of allRacers)if(!ids.has(racer.id))disposeVehicle(racer.visual);allRacers=allRacers.filter(r=>ids.has(r.id));}
        playerCar=allRacers.find(r=>r.id===onlineRender.localId)||allRacers[0]||null;aiCars=allRacers.filter(r=>r!==playerCar);
        if(!playerCar)return false;
        const previousPhase=onlineRender.phase;onlineRender.phase=String(snapshot.phase||onlineRender.phase).toLowerCase();onlineRender.snapshot=snapshot;onlineRender.receivedAt=performance.now();
        allRacers.forEach(nvSyncResultRollout);
        if((previousPhase!==onlineRender.phase&&(nvPrayerPhase()||nvResultPhase()))||(!wasPlayerFinished&&(playerCar.finished||playerCar.dnf))){
          clearInput();onlineRender.externalInput=null;onlineRender.resetRequested=false;nvEmitInput(0,true);if(nvPrayerPhase())audio.updateEngine(0,0,false,0,false);
        }
        gameClock=nvNumber(snapshot.elapsedMs);GameState.totalRaceTime=gameClock;GameState.lapStartTime=gameClock-playerCar.lapTimeMs;GameState.bestLapTime=playerCar.bestLapMs==null?Infinity:playerCar.bestLapMs;GameState.currentLap=playerCar.lap;
        GameState.mode=onlineRender.phase==='racing'?'RACING':['settling','finished','aborted'].includes(onlineRender.phase)?'FINISHED':'COUNTDOWN';
        $('hud-pos-total').textContent=allRacers.length;DOM.hudBestLap.textContent=playerCar.bestLapMs==null?'--:--.--':formatTime(playerCar.bestLapMs);DOM.hudLapTime.textContent=formatTime(playerCar.lapTimeMs);
        if(previousPhase!==onlineRender.phase){NVGame._emit('phase',{phase:onlineRender.phase,raceId:onlineRender.raceId});if(onlineRender.phase==='finished')audio.playFinishFanfare();}
        return true;
      }
      function nvRenderOnline(dt,now){
        if(!playerCar)return;
        nvEmitInput(dt);const input=nvGetInput(),canDrive=onlineRender.phase==='racing'&&!onlineRender.paused&&!playerCar.finished&&!playerCar.dnf;
        for(const racer of allRacers){
          const car=racer.visual,pose=nvUpdateResultRollout(racer,dt);car.root.position.copy(pose.pos);car.root.rotation.y=pose.heading+pose.driftAngle*.55;car.bodyTiltGroup.rotation.z=pose.bodyRoll;car.bodyTiltGroup.rotation.x=pose.bodyPitch;
          const moving=!nvPrayerPhase()&&!onlineRender.paused&&(onlineRender.phase==='racing'||nvResultPhase());
          car.wheels.forEach(w=>w.rotation.x+=(moving?pose.speed:0)*dt/(w.userData.nvRollingRadius||car.wheelRadius||.33));car.frontPivots.forEach(p=>p.rotation.y=pose.steerAngle);
          car.brakeMat.color.setHex((racer===playerCar?input.brake>.1:racer.previousSpeed-racer.speed>.35)?0xff3b48:0xa51d2e);
          for(const flame of car.flames){flame.visible=nvDrivingNitro(racer);if(flame.visible)flame.scale.set(1,1,.85+Math.random()*.65);}
        }
        const playerPose=nvRenderPose(playerCar),speedKmh=Math.abs(playerPose.speed)*3.6,{rpmNorm,rpm,gear}=computeGearAndRpm(speedKmh);
        const coasting=(playerCar.finished||playerCar.dnf||nvResultPhase())&&Math.abs(playerPose.speed)>.2;
        const soundActive=!nvPrayerPhase()&&!onlineRender.paused&&(canDrive||coasting);
        audio.updateEngine(rpmNorm,Math.min(1,speedKmh/300),nvDrivingNitro(playerCar),canDrive?Math.min(1,Math.abs(playerPose.driftAngle)*3):0,soundActive,{throttle:canDrive&&input.throttle>.1,brake:canDrive&&input.brake>.1,gear,rpm,speedMps:playerPose.speed,dt});
        if(GameState.mode==='COUNTDOWN'){
          const snapshot=onlineRender.snapshot,start=Number(onlineRender.phase==='resume_countdown'?snapshot?.prayerPause?.resumeAt:snapshot?.startAt),remaining=Number.isFinite(start)&&start>0?Math.ceil((start-nvNumber(snapshot.serverTime)-(now-onlineRender.receivedAt))/1000):null;
          const numeric=['countdown','resume_countdown'].includes(onlineRender.phase)&&remaining!=null;
          DOM.countdown.textContent=numeric?String(Math.max(1,remaining)):onlineRender.phase==='prayer_pause'?'JEDA SALAT':'MENUNGGU PEMAIN';DOM.countdown.classList.remove('hidden');
        }else DOM.countdown.classList.add('hidden');
        const worldDt=nvPrayerPhase()?0:dt;
        updateParticles(worldDt);updateCamera(dt);updateHUD();
        if(nvPrayerPhase())speedCtx?.clearRect(0,0,DOM.speedlinesCanvas.width,DOM.speedlinesCanvas.height);else updateSpeedLines(dt);
        updateCityWorld(worldDt,playerPose.pos);
        // HUD timing and rank always use the supplied simulation snapshot.
        DOM.hudLapTime.textContent=formatTime(playerCar.lapTimeMs||0);if(playerCar.serverPosition)DOM.hudPos.textContent=playerCar.serverPosition;
        renderer.setScissorTest(false);renderer.setViewport(0,0,innerWidth,innerHeight);renderer.render(scene,camera);nvRecordRaceFrame(now);
      }
      function nvStopRace(){
        onlineRender.generation++;onlineRender.preparing=false;nvCancelFrameWaiters('Arena dihentikan sebelum frame siap.');
        onlineRender.active=false;onlineRender.paused=false;onlineRender.snapshot=null;onlineRender.startToken=null;onlineRender.externalInput=null;onlineRender.previewOnly=true;onlineRender.phase='waiting';clearInput();
        NVGame._emit('input',{throttle:0,brake:0,steer:0,nitro:false});allRacers.forEach(r=>disposeVehicle(r.visual));allRacers=[];aiCars=[];playerCar=null;headLights=[];
        goToGarage();document.body.classList.add('nv-preview');if(garageCar){garageCar.root.visible=true;garageNeedsRender=true;}return nvGetState();
      }
      function nvSetVisible(value){
        onlineRender.visible=!!value;
        if(!value){clearInput();onlineRender.externalInput=null;nvEmitInput(0,true);audio.updateEngine(0,0,false,0,false);stopEnginePreview();if(audio.ctx)audio.ctx.suspend().catch(()=>{});}
        else{lastFrameTime=performance.now();garageNeedsRender=true;if(onlineRender.active&&!onlineRender.paused&&!settings.muted&&audio.ctx)audio.ctx.resume().catch(()=>{});}
        return onlineRender.visible;
      }
      function nvSetCamera(value){
        if(typeof value==='string')value=value.toLowerCase();
        if(!onlineRender.active&&(value==null||['front','side','rear','auto','cycle'].includes(value))){const views=['front','side','rear'],view=value&&value!=='cycle'?value:views[(views.indexOf(onlineRender.previewView||'front')+1)%3];return nvSetView(view);}
        if(onlineRender.active&&nvPrayerPhase())return RACE_CAMERAS[GameState.cameraMode];
        if(value==='dashboard')value='interior';
        return selectRaceCamera(value==='cycle'||value==null?(GameState.cameraMode+1)%RACE_CAMERAS.length:typeof value==='string'?Math.max(0,RACE_CAMERAS.indexOf(value.toLowerCase())):Math.round(nvNumber(value,0,0,RACE_CAMERAS.length-1)));
      }
      function nvSetView(value){
        if(value!=='auto')onlineRender.previewView=value;
        if(value==='auto'){garageOrbit.auto=!garageOrbit.auto;}else{garageOrbit.auto=false;garageOrbit.yaw=value==='rear'?Math.PI+.8:value==='side'?Math.PI/2:.82;garageOrbit.pitch=.20;}
        garageNeedsRender=true;return value;
      }
      function nvShowCredits(){const dialog=$('credits-dialog');if(dialog&&!dialog.open)dialog.showModal();return true;}
      function nvGetState(){return {ready:gameReady,mode:onlineRender.active?'race':GameState.mode==='TOUR'?'tour':'preview',online:onlineRender.enabled,active:onlineRender.active,preparing:onlineRender.preparing,visible:onlineRender.visible,paused:onlineRender.paused,raceId:onlineRender.raceId,startToken:onlineRender.startToken,arenaFrameReady:!!onlineRender.presentedFrame,localRacerId:onlineRender.localId,phase:onlineRender.phase,camera:RACE_CAMERAS[GameState.cameraMode],circuit:settings.circuit,loadout:onlineRender.previewLoadout||nvLoadout({carId:settings.model}),quality:settings.quality,timeOfDay:settings.timeOfDay,muted:settings.muted};}
      NVGame._registerRuntime({
        configure:nvConfigure,setLoadout:nvSetLoadout,setLocalPlayer:nvSetLocalPlayer,startRace:nvStartRace,waitForRaceFrame:nvWaitForRaceFrame,stopRace:nvStopRace,applySnapshot:nvApplySnapshot,getInput:nvGetInput,getState:nvGetState,
        setInput:input=>{if(onlineRender.active&&(onlineRender.phase!=='racing'||playerCar?.finished||playerCar?.dnf))return;onlineRender.externalInput=input;if(input.reset)onlineRender.resetRequested=true;},setVisible:nvSetVisible,setCamera:nvSetCamera,setView:nvSetView,showCredits:nvShowCredits,pause:nvPause,resume:nvResume,
        previewEngine:previewSelectedEngine,stopEnginePreview,
        unlockAudio:nvUnlockAudio,
        playEvents:events=>{for(const event of events){if(!event||!onlineRender.active||onlineRender.phase!=='racing')continue;if(event.type==='collision'||event.type==='rail'){const car=allRacers.find(r=>r.id===event.racerId);if(car===playerCar&&!car.finished&&!car.dnf){audio.playCollision(nvNumber(event.intensity,.35,0,1));const p=car.pos.clone();p.y=.5;spawnParticles(p,0xd5c8a5,5,7,.25);}}}},
        showCircuit:id=>{nvConfigure({circuit:id,previewOnly:true});enterCityTour();return nvGetState();},
        getCatalog:()=>({cars:CAR_CATALOG.map(c=>({id:c.id,name:c.name,color:c.color,topSpeed:c.topSpeed,zeroTo100:c.zeroTo100,handling:c.handling,loaded:NVImportedCars.isLoaded(c.id),representation:c.representation||'imported-model'})),circuits:CIRCUITS.map(c=>({id:c.id,name:c.name,description:c.description})),wheels:NVWheels.catalog,stripes:window.NVStripes?.catalog||[]}),
        ensureModels:nvEnsureModels,
        dispose:()=>{onlineRender.disposed=true;onlineRender.generation++;onlineRender.preparing=false;nvCancelFrameWaiters('Renderer telah dilepas.');cancelAnimationFrame(onlineRender.frameRequest);clearInput();allRacers.forEach(r=>disposeVehicle(r.visual));allRacers=[];if(garageCar)disposeVehicle(garageCar);garageCar=null;disposeCircuitWorld();garageWorkshop?.dispose();garageWorkshop=null;if(garageScene)disposeOwnedGraph(garageScene);garageEnvTarget?.dispose();garageThumbTarget?.dispose();audio.ctx?.close().catch(()=>{});renderer?.dispose();}
      });
      document.body.classList.add('nv-embedded','nv-preview');

      window.onload=async function(){
        try{
          initThree();
          $('loading-label').textContent='Memuat koleksi kendaraan…';
          try{const loaded=await NVImportedCars.loadAll((done,total)=>{$('loading-label').textContent='Memuat kendaraan '+done+' / '+total;});if(loaded.some(item=>item.status==='rejected'))toast('Sebagian model tidak dapat dimuat. Kendaraan yang tersedia tetap bisa dipakai.');}
          catch(error){console.warn('Menggunakan model cadangan:',error);toast('Sebagian model memakai versi cadangan. Permainan tetap bisa dijalankan.');}
          if(currentModel().branded&&!NVImportedCars.isLoaded(settings.model))settings.model='veloce';
          $('loading-label').textContent='Menyiapkan '+currentCircuit().name+'…';
          buildTrackAndCity();setupControls();applyTimeOfDay(false);updateStreetLights(1000,trackPoints[0]);captureCityReflections();selectCar(settings.model,true);if(!onlineRender.enabled)createRacers();initSpeedLines();
          updateCircuitUI();
          GameState.muted=settings.muted;audio.setMuted(settings.muted);
          DOM.muteIcon.textContent=settings.muted?'×':'♪';DOM.muteLabel.textContent=settings.muted?'Senyap':'Audio';
          if(!document.body.classList.contains('nv-embedded'))drawGarageThumbnails();applyQuality();
          gameReady=true;DOM.btnStart.disabled=false;$('loading-screen').classList.add('hidden');
          persistSettings();lastFrameTime=performance.now();onlineRender.frameRequest=requestAnimationFrame(animate);NVGame._ready();
        }catch(error){
          console.error('Gagal memuat game 3D:',error);$('loading-screen').classList.add('hidden');
          $('error-message').textContent='Grafis 3D tidak dapat dimulai. Aktifkan akselerasi grafis pada browser, lalu coba lagi. Detail: '+error.message;
          $('error-screen').classList.remove('hidden');
          NVGame._fail(error);
        }
      };


    })();
  
