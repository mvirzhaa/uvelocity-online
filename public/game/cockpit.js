/* UVelocity's original, procedural cockpit. These are game-created interiors,
   fitted to each car; they are not manufacturer scans or licensed replicas.
   Uses the existing Three.js r128 scene, lighting, and snapshot steering. */
(function(){
  'use strict';
  const T=window.THREE;
  const clamp=T.MathUtils.clamp;
  const RACE_CARS=new Set(['bmw-hybrid-v8','bmw-m4-gt4','amg-gt4','sls-amg-gt3']);

  // Authored cabin fits for the reference SUVs/MPV. These are procedural game
  // interiors, with right-hand steering and a seat height suited to each mesh.
  const FAMILY_COCKPITS=Object.freeze({
    'honda-crv-rs':{eye:[-.34,1.46,.30],headerLift:.22},
    'mitsubishi-pajero-sport':{eye:[-.38,1.52,.24],headerLift:.28},
    'toyota-fortuner':{eye:[-.36,1.50,.24],headerLift:.28},
    'toyota-innova-zenix':{eye:[-.34,1.51,.36],headerLift:.23}
  });

  function create(car){
    const id=car.modelId||car.model?.id||'brz';
    const dims=car.dimensions||[car.model?.width||1.85,1.36,car.model?.length||4.4];
    const race=RACE_CARS.has(id),prototype=id==='bmw-hybrid-v8',cinema=id==='batmobile-1989',mpv=id==='panther-grand-touring';
    // The MPV's outer bounds include its mirrors. Fit its right-hand driving
    // position to the narrower passenger cabin and the higher seating level.
    const family=FAMILY_COCKPITS[id];
    const width=clamp((Number(dims[0])||1.85)*((mpv||family)?.82:1),1.6,2.4),half=width*.43;
    const eyeY=mpv?clamp((Number(dims[1])||2.05)*.73,1.42,1.52):clamp((Number(dims[1])||1.36)*.76,.88,1.13);
    const eye=family?new T.Vector3(...family.eye):new T.Vector3(mpv?-half*.43:prototype?half*.31:half*.43,eyeY,mpv?.22:cinema?-.64:prototype?-.12:-.30);
    const headerLift=family?.headerLift??(mpv?.31:.53);
    const root=new T.Group();root.name='UVelocity cockpit';root.userData.nvCockpit=true;
    root.userData.origin='UVelocity procedural cockpit; not a manufacturer interior';
    root.userData.vehicleId=id;
    root.visible=false;
    const geometries=new Set(),materials=new Set(),textures=new Set();
    const material=(name,props)=>{const m=new T.MeshStandardMaterial(props);m.name=name;materials.add(m);return m;};
    const soft=material('Cockpit soft-touch graphite',{color:0x192026,roughness:.88,metalness:.08});
    const carbon=material('Cockpit woven dark trim',{color:0x10181b,roughness:.58,metalness:.27});
    const metal=material('Cockpit brushed aluminium',{color:0x6c787f,roughness:.35,metalness:.85});
    const leather=material('Steering textured leather',{color:0x161b1d,roughness:.83,metalness:.04});
    const accent=material('Cockpit accent',{color:cinema?0xbe9151:race?0xde9c44:0x42b9a9,roughness:.46,metalness:.4,emissive:cinema?0x241304:0x05241f,emissiveIntensity:.45});
    const buttonRed=material('Steering red button',{color:0xb1433e,roughness:.5,metalness:.15});
    const black=material('Cockpit vent recess',{color:0x060b0d,roughness:.93,metalness:0});

    // Restrained woven normal detail; no external image dependency or source GLB edits.
    const weave=document.createElement('canvas');weave.width=weave.height=64;
    const weaveContext=weave.getContext('2d');
    weaveContext.fillStyle='#8484ff';weaveContext.fillRect(0,0,64,64);
    for(let y=0;y<64;y+=8)for(let x=0;x<64;x+=8){weaveContext.fillStyle=((x+y)/8)%2?'#8e7dfb':'#7d8efb';weaveContext.fillRect(x,y,7,7);}
    const weaveTexture=new T.CanvasTexture(weave);weaveTexture.wrapS=weaveTexture.wrapT=T.RepeatWrapping;weaveTexture.repeat.set(7,4);textures.add(weaveTexture);
    carbon.normalMap=weaveTexture;carbon.normalScale.set(.12,.12);

    function mesh(parent,name,geometry,mat,x=0,y=0,z=0){
      geometries.add(geometry);
      const part=new T.Mesh(geometry,mat);part.name=name;part.position.set(x,y,z);part.castShadow=false;part.receiveShadow=false;parent.add(part);return part;
    }
    function box(parent,name,mat,w,h,d,x,y,z){return mesh(parent,name,new T.BoxGeometry(w,h,d),mat,x,y,z);}
    function panel(parent,name,mat,w,h,d,x,y,z,r=.025){
      r=Math.min(r,w/2,h/2);const s=new T.Shape(),l=-w/2,b=-h/2;
      s.moveTo(l+r,b);s.lineTo(l+w-r,b);s.quadraticCurveTo(l+w,b,l+w,b+r);s.lineTo(l+w,b+h-r);s.quadraticCurveTo(l+w,b+h,l+w-r,b+h);s.lineTo(l+r,b+h);s.quadraticCurveTo(l,b+h,l,b+h-r);s.lineTo(l,b+r);s.quadraticCurveTo(l,b,l+r,b);
      return mesh(parent,name,new T.ExtrudeGeometry(s,{depth:d,bevelEnabled:true,bevelSize:.006,bevelThickness:.006,bevelSegments:2,curveSegments:5,steps:1}),mat,x,y,z);
    }
    function rod(parent,name,mat,a,b,r=.025){
      const start=new T.Vector3(...a),end=new T.Vector3(...b),direction=end.clone().sub(start);
      const part=mesh(parent,name,new T.CylinderGeometry(r,r,direction.length(),12),mat);
      part.position.copy(start).add(end).multiplyScalar(.5);part.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),direction.normalize());return part;
    }

    const z=eye.z,y=eye.y;
    panel(root,'Dashboard curved fascia',soft,half*2,.25,.34,0,y-.35,z+.73,.065);
    panel(root,'Dashboard upper cowl',carbon,half*1.96,.075,.31,0,y-.205,z+.79,.032);
    box(root,'Dashboard accent seam',accent,half*1.90,.009,.014,0,y-.266,z+.722);
    // A genuine windshield opening: no opaque imported roof/glass over this view.
    for(const side of[-1,1]){
      rod(root,'Windshield pillar '+side,soft,[side*half,y-.20,z+.94],[side*half*.85,y+headerLift,z+.25],race?.040:.032);
      rod(root,'Pillar satin edge '+side,metal,[side*(half-.024),y-.18,z+.94],[side*(half*.85-.022),y+headerLift-.01,z+.26],.006);
      panel(root,'Door upper rail '+side,soft,.095,.20,1.45,side*half,y-.37,z-.56,.025);
      box(root,'Door stitching '+side,accent,.010,.008,1.1,side*(half-.052),y-.275,z+.03);
      if(race)rod(root,'Safety cage '+side,carbon,[side*half*.91,y-.42,z+.39],[side*half*.81,y+.49,z-.02],.025);
    }
    rod(root,'Windshield roof header',soft,[-half*.85,y+headerLift,z+.25],[half*.85,y+headerLift,z+.25],.046);
    const centerX=eye.x*.04;
    panel(root,'Center console',carbon,.28,.44,.22,centerX,y-.69,z+.57,.04);
    panel(root,'Center switch bank',black,.20,.12,.02,centerX,y-.445,z+.705,.014);
    for(let i=0;i<4;i++)box(root,'Console switch '+i,i===0?buttonRed:metal,.023,.032,.014,centerX-.066+i*.044,y-.436,z+.690);
    for(const x of[-half*.67,half*.67]){
      panel(root,'Air vent bezel',metal,.17,.075,.018,x,y-.322,z+.718,.017);
      panel(root,'Air vent aperture',black,.148,.052,.01,x,y-.322,z+.708,.012);
      for(let i=0;i<3;i++)box(root,'Air vent vane',carbon,.137,.005,.014,x,y-.339+i*.017,z+.700);
    }

    const displayCanvas=document.createElement('canvas');displayCanvas.width=512;displayCanvas.height=256;
    const displayTexture=new T.CanvasTexture(displayCanvas);displayTexture.encoding=T.sRGBEncoding;textures.add(displayTexture);
    const displayMaterial=new T.MeshBasicMaterial({map:displayTexture,toneMapped:false});materials.add(displayMaterial);
    panel(root,'Driver instrument surround',carbon,.48,.235,.055,eye.x,y-.227,z+.686,.033);
    const screen=mesh(root,'Live digital instruments',new T.PlaneGeometry(.423,.194),displayMaterial,eye.x,y-.225,z+.679);screen.rotation.y=Math.PI;

    const column=new T.Group();column.name='Steering column';column.position.set(eye.x,y-.255,z+.440);column.rotation.x=-.22;root.add(column);
    const shaft=mesh(column,'Steering shaft',new T.CylinderGeometry(.027,.035,.22,16),carbon,0,0,.115);shaft.rotation.x=Math.PI/2;
    const wheel=new T.Group();wheel.name='Snapshot steering wheel';column.add(wheel);
    mesh(wheel,'Leather steering rim',new T.TorusGeometry(.166,.020,12,64),leather);
    for(const angle of[0,Math.PI*2/3,Math.PI*4/3]){
      const end=[Math.sin(angle)*.144,Math.cos(angle)*.144,0];
      rod(wheel,'Steering aluminium spoke',metal,[0,0,0],end,.012);
    }
    panel(wheel,'Steering central hub',carbon,.136,.089,.046,0,0,-.027,.021);
    const mark=box(wheel,'Steering center mark',accent,.016,.031,.026,0,.165,0);
    mark.userData.nvSteeringMark=true;
    for(const side of[-1,1]){
      const button=mesh(wheel,'Thumb control '+side,new T.CylinderGeometry(.010,.010,.012,16),side<0?buttonRed:accent,side*.073,.008,-.020);button.rotation.x=Math.PI/2;
      box(column,'Fixed shift paddle '+side,metal,.035,.10,.012,side*.115,0,.042);
    }
    const badgeCanvas=document.createElement('canvas');badgeCanvas.width=128;badgeCanvas.height=64;
    const badgeContext=badgeCanvas.getContext('2d');badgeContext.fillStyle='#0e171b';badgeContext.fillRect(0,0,128,64);badgeContext.font='italic bold 43px sans-serif';badgeContext.textAlign='center';badgeContext.fillStyle='#e0c484';badgeContext.fillText('UV',64,48);
    const badgeTexture=new T.CanvasTexture(badgeCanvas);badgeTexture.encoding=T.sRGBEncoding;textures.add(badgeTexture);
    const badgeMaterial=new T.MeshBasicMaterial({map:badgeTexture,toneMapped:false});materials.add(badgeMaterial);
    const badge=mesh(wheel,'UVelocity steering badge',new T.PlaneGeometry(.072,.036),badgeMaterial,0,0,-.035);badge.rotation.y=Math.PI;
    if(prototype){wheel.scale.set(1.08,.83,1);column.position.y+=.018;}
    // Subtle cabin fill keeps physical materials readable at night; no shadow map.
    const cabinLight=new T.PointLight(0xb8ddd5,.28,2.1,2);cabinLight.position.set(eye.x,y+.22,z+.15);root.add(cabinLight);
    car.root.add(root);

    let displayKey='',disposed=false;
    function update(state){
      if(disposed)return;
      const angle=clamp(Number(state.steerAngle)||0,-.62,.62);
      // +steer turns the vehicle to its left (+X); viewed towards +Z, negative
      // local Z rotation moves the yellow rim marker left on the driver's screen.
      wheel.rotation.z=-angle*6.3;
      const speed=Math.round(clamp(Number(state.speedKmh)||0,0,999));
      const gear=String(state.gear??'N').slice(0,2),lap=clamp(Math.round(Number(state.lap)||1),1,99),total=clamp(Math.round(Number(state.totalLaps)||1),1,99);
      const next=[speed,gear,lap,total].join('|');
      if(next===displayKey)return;displayKey=next;
      const c=displayCanvas.getContext('2d');c.fillStyle='#071114';c.fillRect(0,0,512,256);
      c.fillStyle='#77c6b7';c.font='bold 19px sans-serif';c.textAlign='left';c.fillText('UVELOCITY',24,30);
      c.textAlign='right';c.fillStyle='#bdc9ce';c.fillText('LAP '+lap+' / '+total,488,30);
      c.textAlign='left';c.fillStyle='#edf4ef';c.font='bold 112px sans-serif';c.fillText(String(speed),22,155);
      c.font='21px sans-serif';c.fillStyle='#9cadb4';c.fillText('KM/JAM',27,188);
      c.fillStyle='#23333a';c.fillRect(365,57,121,137);c.fillStyle='#e6c47a';c.font='bold 78px sans-serif';c.textAlign='center';c.fillText(gear,426,145);c.font='17px sans-serif';c.fillStyle='#a9b8bd';c.fillText('GEAR',426,180);
      for(let i=0;i<22;i++){c.fillStyle=i<Math.min(22,speed/16)?i>17?'#dd8a54':'#58baa4':'#203535';c.fillRect(24+i*21,219,16,12);}
      displayTexture.needsUpdate=true;
    }
    update({steerAngle:0,speedKmh:0,gear:'N',lap:1,totalLaps:1});
    return {
      root,eye,wheel,mark,profile:{vehicleId:id,width,eyeHeight:eyeY,race,prototype,mpv,drivingSide:mpv?'right':'left',origin:root.userData.origin},
      update,
      dispose(){if(disposed)return;disposed=true;root.removeFromParent?root.removeFromParent():root.parent?.remove(root);geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());root.clear();}
    };
  }
  window.NVCockpit={create};
})();
