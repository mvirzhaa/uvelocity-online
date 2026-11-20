/* NEON VELOCITY — Coast & Glacier worlds. Procedural, offline, Three.js r128. */
(function(global){'use strict';
function build(options){
 const T=options.THREE||global.THREE,scene=options.scene,track=options.trackPoints,n=track.length,normals=options.trackNormals;
 const half=options.roadHalf||11,biome=options.biome==='glacier'?'glacier':'beach',beach=biome==='beach';
 const root=new T.Group();root.name='NVBiome_'+biome;root.userData.biome=biome;root.userData.environment=biome;scene.add(root);
 const levels=[new T.Group(),new T.Group(),new T.Group()];levels.forEach((g,i)=>{g.name='BiomeDetail'+i;root.add(g);});
 const geos=new Set(),mats=new Set(),textures=new Set(),batches=new Map(),obstacles=[],animated=[];
 const stats={biome,description:beach?'Pesisir berpasir, laut berombak, deretan palem dan resor.':'Pegunungan batu bersalju, danau es, hutan cemara dan chalet.',mainFeature:beach?'Samudra & pantai tropis':'Puncak salju & danau es',palms:0,evergreens:0,rocks:0,buildings:0,mountains:0,beachUmbrellas:0,instances:0,drawCalls:0,triangles:0,particles:0};
 let seed=beach?871631:193541,disposed=false,timeOfDay='dusk';function rng(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}const rand=(a,b)=>a+(b-a)*rng(),clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),smooth=x=>{x=clamp(x,0,1);return x*x*(3-2*x);};
 const bounds={minX:Infinity,maxX:-Infinity,minZ:Infinity,maxZ:-Infinity};track.forEach(p=>{bounds.minX=Math.min(bounds.minX,p.x);bounds.maxX=Math.max(bounds.maxX,p.x);bounds.minZ=Math.min(bounds.minZ,p.z);bounds.maxZ=Math.max(bounds.maxZ,p.z);});const cx=(bounds.minX+bounds.maxX)/2,cz=(bounds.minZ+bounds.maxZ)/2;
 function geo(g){geos.add(g);return g;}function mat(color,rough=.82,metal=0,extra){const m=new T.MeshStandardMaterial(Object.assign({color,roughness:rough,metalness:metal},extra||{}));mats.add(m);return m;}
 const sand=mat(0xbfb092,.94),stone=mat(beach?0x7b7971:0x7e8b91,.91),darkStone=mat(0x525d62,.94),snow=mat(0xe4edf0,.86),iceRim=mat(0xb7d4dd,.4,.08),wood=mat(beach?0x8b7458:0x746454,.87),darkWood=mat(0x4d504d,.91),bark=mat(beach?0x8f8876:0x615e52,.96),cream=mat(0xc8c4ae,.9),white=mat(0xe8e7db,.84),metal=mat(0x6e797e,.4,.6),black=mat(0x38444b,.64,.35),grass=mat(0x657258,.96),palmLeaf=mat(0x597449,.86,0,{side:T.DoubleSide}),palmLight=mat(0x6e8252,.87,0,{side:T.DoubleSide}),needle=mat(0x354f46,.95),needleLight=mat(0x4c6557,.94),fabric=mat(0xa9b7ae,.94,0,{side:T.DoubleSide}),orange=mat(0xb77858,.92,0,{side:T.DoubleSide}),windowGlass=mat(0x4c6b75,.21,.52);
 const lamp=mat(0xffe4ab,.45,0,{emissive:0xffc985,emissiveIntensity:.35});const emissives=[lamp];
 const box=geo(new T.BoxGeometry(1,1,1)),plane=geo(new T.PlaneGeometry(1,1)),cylinder=geo(new T.CylinderGeometry(1,1,1,10)),sphere=geo(new T.SphereGeometry(1,12,8)),cone=geo(new T.ConeGeometry(1,1,16,1));
 function canvasTexture(w,h,draw,color=true){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const tex=new T.CanvasTexture(c);if(color)tex.encoding=T.sRGBEncoding;tex.anisotropy=4;textures.add(tex);return tex;}
 function noise(x,z){return Math.sin(x*.017+Math.sin(z*.009)*1.8)*.45+Math.sin(z*.027+x*.009)*.24+Math.sin(x*.063-z*.044)*.13+Math.sin(z*.117+x*.081)*.06;}
 function trackDistance(x,z){let best=Infinity;for(let i=0;i<n;i++){const a=track[i],b=track[(i+1)%n],dx=b.x-a.x,dz=b.z-a.z,t=clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1),0,1);best=Math.min(best,(x-a.x-dx*t)**2+(z-a.z-dz*t)**2);}return Math.sqrt(best);}
 function inside(x,z){let c=false;for(let i=0,j=n-1;i<n;j=i++){const a=track[i],b=track[j];if(((a.z>z)!==(b.z>z))&&(x<(b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x))c=!c;}return c;}
 function safe(x,z,r,margin=4,overlap=true){if(trackDistance(x,z)<half+r+margin)return false;if(overlap)for(const o of obstacles)if(o.solid!==false&&Math.hypot(x-o.x,z-o.z)<r+o.radius+1)return false;return true;}
 function reserve(x,z,r,type,extra){const o=Object.assign({x,z,radius:r,type,solid:true},extra||{});obstacles.push(o);return o;}
 const transform=new T.Object3D();function inst(g,m,x,y,z,sx,sy,sz,yaw=0,lod=0,rx=0,rz=0){const spatial=beach&&g.userData.nvSpatial&&lod>0;const k=g.id+'/'+m.id+'/'+lod+(spatial?'/'+Math.floor(x/120)+'/'+Math.floor(z/120):'');let b=batches.get(k);if(!b){b={g,m,lod,matrices:[],spatial};batches.set(k,b);}transform.position.set(x,y,z);transform.rotation.set(rx,yaw,rz,'YXZ');transform.scale.set(sx,sy,sz);transform.updateMatrix();b.matrices.push(transform.matrix.clone());}
 function local(x,z,yaw=0){const co=Math.cos(yaw),si=Math.sin(yaw);function add(g,m,lx,y,lz,sx,sy,sz,lod,rot=0,rx=0,rz=0){inst(g,m,x+co*lx+si*lz,y,z-si*lx+co*lz,sx,sy,sz,yaw+rot,lod||0,rx,rz);}return{box:(m,x,y,z,w,h,d,lod,rot,rx,rz)=>add(box,m,x,y,z,w,h,d,lod,rot,rx,rz),plane:(m,x,y,z,w,h,rot,lod,rx)=>add(plane,m,x,y,z,w,h,1,lod,rot,rx),cyl:(m,x,y,z,r,h,lod)=>add(cylinder,m,x,y,z,r,h,r,lod),sphere:(m,x,y,z,sx,sy,sz,lod)=>add(sphere,m,x,y,z,sx,sy,sz,lod),add};}
 function mesh(g,m,name,lod=0){const obj=new T.Mesh(g,m);obj.name=name;obj.receiveShadow=true;levels[lod].add(obj);return obj;}
 function simpleGeo(vertices,indices){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));if(indices)g.setIndex(indices);g.computeVertexNormals();return geo(g);}
 function sign(text,bg){const map=canvasTexture(512,96,(ctx,w,h)=>{ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);ctx.fillStyle='#f1ebdc';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='600 34px Arial';ctx.fillText(text,w/2,h/2);});const m=mat(0xffffff,.65,0,{map,emissiveMap:map,emissive:0xffffff,emissiveIntensity:.12});emissives.push(m);return m;}
 const signMain=sign(beach?'PANTAI SENJA':'ALPINE LODGE',beach?'#3b6766':'#445d67'),signCafe=sign(beach?'COAST CAFE':'BASECAMP 08',beach?'#655a48':'#6a5b4b');
 // The coast follows the western road envelope. It is irregular at three scales,
 // yet every sampled shoreline stays well outside the paved circuit.
 const coastZ0=bounds.minZ-650,coastZ1=bounds.maxZ+650,coastCount=384,coastXs=[];
 if(beach){
  const target=[];
  for(let i=0;i<coastCount;i++){const z=coastZ0+(coastZ1-coastZ0)*i/(coastCount-1);let edge=Infinity;
   for(let k=0;k<n;k++){const a=track[k],b=track[(k+1)%n];if((a.z<=z&&b.z>=z)||(a.z>=z&&b.z<=z)){const t=(z-a.z)/(b.z-a.z||1);if(t>=0&&t<=1)edge=Math.min(edge,a.x+(b.x-a.x)*t);}}
   if(!Number.isFinite(edge))edge=bounds.minX-32;
   target.push(edge-half-31+6*Math.sin(z*.019)+2.8*Math.sin(z*.057));
  }
  for(let i=0;i<coastCount;i++){let sum=0,weight=0;for(let k=-5;k<=5;k++){const w=6-Math.abs(k);sum+=target[clamp(i+k,0,coastCount-1)]*w;weight+=w;}let x=sum/weight;const z=coastZ0+(coastZ1-coastZ0)*i/(coastCount-1);for(let k=0;k<70&&trackDistance(x,z)<half+24;k++)x-=2.5;coastXs.push(x);}
 }
 const shore=z=>{if(!beach)return bounds.minX-38+14*Math.sin(z*.008)+5*Math.sin(z*.022);const t=clamp((z-coastZ0)/(coastZ1-coastZ0),0,1)*(coastCount-1),i=Math.min(coastCount-2,Math.floor(t));return coastXs[i]+(coastXs[i+1]-coastXs[i])*(t-i);};
 let coastUniforms=null,beachSurfaceAssets=null;
 function periodicSurface(kind){
  const size=512,heights=new Float32Array(size*size),albedo=document.createElement('canvas'),normal=document.createElement('canvas'),rough=document.createElement('canvas');for(const c of[albedo,normal,rough]){c.width=size;c.height=size;}
  const ac=albedo.getContext('2d'),nc=normal.getContext('2d'),rc=rough.getContext('2d'),a=ac.createImageData(size,size),no=nc.createImageData(size,size),r=rc.createImageData(size,size);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){const u=x/size*Math.PI*2,v=y/size*Math.PI*2,grain=rng();let h;
   if(kind==='sand')h=.34*Math.sin(v*18+Math.sin(u*3)*.55)+.11*Math.sin(v*36+u*4)+.05*Math.sin(u*53+v*41)+grain*.10;
   else h=.25*Math.sin(v*8+Math.sin(u*3)*2)+.22*Math.sin(u*11+v*5)+.13*Math.sin(u*31-v*19)+grain*.18;
   heights[y*size+x]=h;const i=(y*size+x)*4;
   if(kind==='sand'){const val=205+grain*15+h*7;a.data[i]=val+13;a.data[i+1]=val+6;a.data[i+2]=val-12;}
   else{const val=133+h*34+grain*11;a.data[i]=val+7;a.data[i+1]=val+5;a.data[i+2]=val;}
   a.data[i+3]=255;const rv=kind==='sand'?220+grain*28:185+grain*43;r.data[i]=r.data[i+1]=r.data[i+2]=rv;r.data[i+3]=255;
  }
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){const dx=heights[y*size+(x+1)%size]-heights[y*size+(x+size-1)%size],dy=heights[((y+1)%size)*size+x]-heights[((y+size-1)%size)*size+x],scale=kind==='sand'?1.8:2.7,l=Math.hypot(dx*scale,dy*scale,1),i=(y*size+x)*4;no.data[i]=127.5-dx*scale/l*127.5;no.data[i+1]=127.5-dy*scale/l*127.5;no.data[i+2]=127.5+127.5/l;no.data[i+3]=255;}
  ac.putImageData(a,0,0);nc.putImageData(no,0,0);rc.putImageData(r,0,0);
  function tex(c,color){const t=new T.CanvasTexture(c);if(color)t.encoding=T.sRGBEncoding;t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=8;textures.add(t);return t;}
  return{map:tex(albedo,true),normalMap:tex(normal,false),roughnessMap:tex(rough,false)};
 }
 const coastShaderPars=`uniform float nvTime,nvNight,nvCoastMin,nvCoastRange,nvZMin,nvZRange;uniform sampler2D nvCoastProfile;varying vec3 vNvWorld;
 float nvCoast(float z){vec2 rg=texture2D(nvCoastProfile,vec2(clamp((z-nvZMin)/nvZRange,0.0,1.0),.5)).rg;return nvCoastMin+nvCoastRange*(rg.r*256.0+rg.g)/257.0;}
 float nvHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
 float nvNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(nvHash(i),nvHash(i+vec2(1,0)),f.x),mix(nvHash(i+vec2(0,1)),nvHash(i+vec2(1,1)),f.x),f.y);}`;

 // A lake is fitted to the genuinely empty interior, never beneath the circuit.
 let lake=null;
 if(!beach){let best={distance:0,x:cx,z:cz};for(let z=bounds.minZ+40;z<bounds.maxZ-40;z+=24)for(let x=bounds.minX+40;x<bounds.maxX-40;x+=24){if(!inside(x,z))continue;const d=trackDistance(x,z);if(d>best.distance)best={distance:d,x,z};}const r=Math.min(105,Math.max(22,best.distance-half-26));lake={x:best.x,z:best.z,radius:r,rx:r,rz:r*.73};reserve(lake.x,lake.z,r*1.06,'frozen-lake',{solid:false});}
 function groundHeight(x,z){
  const d=trackDistance(x,z),clear=smooth((d-half-20)/26);
  if(beach){const s=x-shore(z);if(s<0)return-.58-Math.min(8,-s*.042);const edge=-.58+.47*smooth(s/18);const ridge=Math.pow(Math.max(0,noise(x*.72,z*.72)+.19),1.6)*4.8;const dune=1.8*Math.pow(.5+.5*Math.sin(x*.024+z*.013+Math.sin(z*.018)),3);return edge+clear*(ridge+dune)*smooth((s-15)/48);}
  const h=-.13+clear*(Math.max(0,noise(x,z)+.18)*7.5);if(lake){const r=Math.hypot((x-lake.x)/lake.rx,(z-lake.z)/lake.rz);return-.17+(h+.17)*smooth((r-1.05)/.52);}return h;
 }
 // Lightly undulating sand / snow, explicitly flattened below road level near it.
 const terrainTex=canvasTexture(512,512,(ctx,w,h)=>{const image=ctx.createImageData(w,h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,a=(beach?192:226)+rng()*(beach?26:19),ripple=beach?Math.sin(y*.12+Math.sin(x*.017)*2)*2.5:0;image.data[i]=a+ripple;image.data[i+1]=a+(beach?-4:4)+ripple;image.data[i+2]=a+(beach?-15:8)+ripple;image.data[i+3]=255;}ctx.putImageData(image,0,0);});terrainTex.wrapS=terrainTex.wrapT=T.RepeatWrapping;
 let terrainMat;
 if(beach){
  beachSurfaceAssets={sand:periodicSurface('sand'),rock:periodicSurface('rock')};
  const min=bounds.minX-400,max=bounds.maxX+200,profile=canvasTexture(coastCount,1,(ctx,w,h)=>{const im=ctx.createImageData(w,h);for(let i=0;i<w;i++){const value=Math.round(clamp((coastXs[i]-min)/(max-min),0,1)*65535);im.data[i*4]=value>>8;im.data[i*4+1]=value&255;im.data[i*4+2]=0;im.data[i*4+3]=255;}ctx.putImageData(im,0,0);},false);profile.generateMipmaps=false;profile.minFilter=profile.magFilter=T.LinearFilter;
  coastUniforms={nvTime:{value:0},nvNight:{value:0},nvCoastMin:{value:min},nvCoastRange:{value:max-min},nvZMin:{value:coastZ0},nvZRange:{value:coastZ1-coastZ0},nvCoastProfile:{value:profile}};
  terrainMat=mat(0xffffff,.96,0,{...beachSurfaceAssets.sand,normalScale:new T.Vector2(.55,.55),vertexColors:true,envMapIntensity:.7});terrainMat.name='Dry Sand / Wet Sand PBR';
  terrainMat.onBeforeCompile=shader=>{Object.assign(shader.uniforms,coastUniforms);shader.vertexShader='varying vec3 vNvWorld;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvNvWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');shader.fragmentShader=coastShaderPars+'\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
    float nvLand=vNvWorld.x-nvCoast(vNvWorld.z);float nvWet=1.0-smoothstep(5.0+1.5*sin(nvTime*.36+vNvWorld.z*.015),22.0,nvLand);
    float nvPatch=nvNoise(vNvWorld.xz*.045)*.55+nvNoise(vNvWorld.xz*.13)*.25+nvNoise(vNvWorld.xz*.44)*.2;
    diffuseColor.rgb*=mix(vec3(.52,.55,.52),vec3(1.02,1.0,.95),1.0-nvWet*.85);diffuseColor.rgb*=.91+.14*nvPatch;
    float nvInland=smoothstep(55.0,145.0,nvLand)*smoothstep(.53,.78,nvPatch);diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.73,.83,.61),nvInland*.45);`);
   shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(.24,roughnessFactor,1.0-nvWet);');};
  terrainMat.customProgramCacheKey=()=> 'NVDetailedCoastalSandV2';
  Object.assign(stone,beachSurfaceAssets.rock);stone.normalScale=new T.Vector2(.5,.5);stone.roughness=.88;stone.color.setHex(0xa39f91);stone.needsUpdate=true;
  animated.push(t=>coastUniforms.nvTime.value=t);stats.sandNormalMap=true;stats.wetSand=true;stats.organicShoreline=true;
 }else terrainMat=mat(0xffffff,.89,0,{map:terrainTex,vertexColors:true});
 const tx0=bounds.minX-(beach?190:600),tx1=bounds.maxX+600,tz0=bounds.minZ-650,tz1=bounds.maxZ+650,segments=128,ps=[],colors=[],uv=[],ids=[];
 for(let j=0;j<=segments;j++)for(let i=0;i<=segments;i++){const x=tx0+(tx1-tx0)*i/segments,z=tz0+(tz1-tz0)*j/segments,y=groundHeight(x,z);ps.push(x,y,z);uv.push(x/(beach?7.5:34),z/(beach?7.5:34));const shade=.91+noise(x*.8,z*.8)*.07;const tint=beach?new T.Color(.97*shade,.94*shade,.84*shade):new T.Color(.85*shade,.93*shade,.99*shade);colors.push(tint.r,tint.g,tint.b);if(i<segments&&j<segments){const a=j*(segments+1)+i;ids.push(a,a+segments+1,a+1,a+1,a+segments+1,a+segments+2);}}
 const terrainGeo=simpleGeo(ps,ids);terrainGeo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));terrainGeo.setAttribute('color',new T.Float32BufferAttribute(colors,3));const groundMesh=mesh(terrainGeo,terrainMat,beach?'Pale Sand Coastline':'Rolling Snow Terrain');groundMesh.userData.isTerrain=true;
 // Irregular terrain peaks are modelled surfaces, with slope-dependent rock/snow.
 function mountain(x,z,r,h,angle,index,lod){
  if(!safe(x,z,r*1.43,18,false))return false;
  const s=38,vertices=[],indices=[],c=[],co=Math.cos(angle),si=Math.sin(angle);
  for(let j=0;j<=s;j++)for(let i=0;i<=s;i++){const nx=i/s*2-1,nz=j/s*2-1,edge=Math.max(Math.abs(nx),Math.abs(nz));const ridge=Math.exp(-2.7*(nx*nx*1.3+nz*nz*.78));const shoulder=.32*Math.exp(-8*((nx+.34)**2+(nz-.18)**2));const detail=.83+.13*Math.sin(nx*8+nz*6)+.08*Math.sin(nz*14-nx*12)+.04*Math.sin(nx*29+nz*19);const y=-1+(h*(ridge+shoulder)*detail)*Math.pow(1-smooth((edge-.55)/.45),.7);const xx=nx*r,zz=nz*r;vertices.push(x+co*xx+si*zz,y,z-si*xx+co*zz);if(i<s&&j<s){const a=j*(s+1)+i;indices.push(a,a+s+1,a+1,a+1,a+s+1,a+s+2);}}
  const g=simpleGeo(vertices,indices),normal=g.attributes.normal.array;
  for(let i=0;i<vertices.length;i+=3){const yy=vertices[i+1],slope=normal[i+1],t=beach?0:smooth((yy/h-.13)*2.4+slope*.65-.35);const rock=new T.Color(beach?0x77766d:0x687985),snowColor=new T.Color(0xe4eef2);rock.lerp(snowColor,t);const grain=.90+.09*Math.sin(vertices[i]*.17+vertices[i+2]*.11);rock.multiplyScalar(grain);c.push(rock.r,rock.g,rock.b);}
  g.setAttribute('color',new T.Float32BufferAttribute(c,3));const m=mat(0xffffff,.93,0,{vertexColors:true});if(beach){const uv=[];for(let i=0;i<vertices.length;i+=3)uv.push(vertices[i]/15,(vertices[i+2]+vertices[i+1]*.5)/15);g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));Object.assign(m,beachSurfaceAssets.rock);m.normalScale=new T.Vector2(.55,.55);}const obj=mesh(g,m,(beach?'Coastal Headland ':'Snow-Capped Mountain ')+index,lod);obj.castShadow=false;reserve(x,z,r*1.43,'mountain',{height:h,solid:false,mesh:obj.name});stats.mountains++;return true;
 }
 if(beach){
  mountain(bounds.maxX+220,cz-150,132,108,.4,0,0);mountain(bounds.maxX+250,bounds.maxZ+80,140,139,-.7,1,0);
  mountain(bounds.minX-250,bounds.minZ-170,110,68,.5,2,0);mountain(bounds.minX-310,bounds.maxZ+200,130,93,-.3,3,1);
 }else{
  const radius=Math.hypot((bounds.maxX-bounds.minX)/2,(bounds.maxZ-bounds.minZ)/2)+210;
  for(let i=0;i<11;i++){const a=i/11*Math.PI*2+.17,r=rand(118,175);mountain(cx+Math.sin(a)*radius,cz+Math.cos(a)*radius,r,rand(165,280),a+.4,i,i%4===0?1:0);}
  mountain(cx-65,bounds.minZ-420,190,340,.35,12,1);mountain(bounds.maxX+385,cz+170,175,310,-.2,13,1);
 }
 // Shared displaced rock geometry, rather than identical smooth boulders.
 const rockGeo=geo(new T.IcosahedronGeometry(1,2));{const a=rockGeo.attributes.position;for(let i=0;i<a.count;i++){const x=a.getX(i),y=a.getY(i),z=a.getZ(i),f=.9+.09*Math.sin(x*11+z*7)+.06*Math.sin(y*16-z*8);a.setXYZ(i,x*f,y*(.76+.07*Math.sin(x*9))*f,z*f);}a.needsUpdate=true;rockGeo.computeVertexNormals();}
 function rock(x,z,r,lod=0){if(!safe(x,z,r*1.4,3,true))return false;const y=groundHeight(x,z);inst(rockGeo,stone,x,y+r*.42,z,r,r*.95,r*1.1,rand(0,6.28),lod);if(!beach)inst(rockGeo,snow,x,y+r*.78,z,r*.88,r*.26,r*.95,0,lod);reserve(x,z,r*1.4,'rock');stats.rocks++;return true;}
 // Both worlds keep all decorative rocks outside the asphalt buffer.
 for(let i=0;i<n;i+=8){const p=track[i],q=normals[i],side=rng()>.5?1:-1,r=rand(.8,3.4),offset=half+rand(10,29)+r*2;rock(p.x+q.x*side*offset,p.z+q.z*side*offset,r,i%3===0?1:0);}
 let ocean=null,snowfall=null;
 if(beach){
  // Real PBR ocean: the same scene lights, shadow/fog handling and environment
  // reflections used by the vehicles also illuminate water, swells and surf.
  const u=coastUniforms;u.time=u.nvTime;u.night=u.nvNight;
  const oceanMaterial=new T.MeshPhysicalMaterial({color:0x286e78,roughness:.17,metalness:.08,reflectivity:.72,clearcoat:.72,clearcoatRoughness:.13,envMapIntensity:1.20,transparent:true,opacity:.96,depthWrite:false,side:T.FrontSide});
  mats.add(oceanMaterial);oceanMaterial.name='Physical Ocean / Shallow Shoals';oceanMaterial.uniforms=u;
  oceanMaterial.onBeforeCompile=shader=>{Object.assign(shader.uniforms,u);
   shader.vertexShader='uniform float nvTime; varying vec3 vNvWorld;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
    float nvA=position.x*.048+position.z*.011+nvTime*.92;float nvB=position.x*.087-position.z*.025+nvTime*1.23;
    transformed.y+=sin(nvA)*.16+sin(nvB)*.075+sin(position.x*.17+position.z*.093+nvTime*1.7)*.022;
    vNvWorld=(modelMatrix*vec4(transformed,1.0)).xyz;`);
   shader.fragmentShader=coastShaderPars+'\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
    float nvDepth=max(0.0,nvCoast(vNvWorld.z)-vNvWorld.x);float nvShoal=1.0-smoothstep(5.0,115.0,nvDepth);
    float nvCurrent=nvNoise(vNvWorld.xz*.026+vec2(nvTime*.012,0.0));float nvFine=nvNoise(vNvWorld.xz*.52+vec2(nvTime*.17,-nvTime*.11));
    vec3 nvDeep=vec3(.025,.112,.155);vec3 nvShallow=vec3(.13,.34,.32);vec3 nvSand=vec3(.31,.39,.30);
    diffuseColor.rgb=mix(nvDeep,nvShallow,nvShoal*.85);diffuseColor.rgb=mix(diffuseColor.rgb,nvSand,(1.0-smoothstep(0.0,7.0,nvDepth))*.45);
    diffuseColor.rgb*=.87+.16*nvCurrent;
    float nvPhase=nvDepth*.29+nvTime*1.35+sin(vNvWorld.z*.037)*.7+nvNoise(vNvWorld.xz*.07)*.65;
    float nvWhitecap=pow(max(0.0,sin(nvPhase)),18.0)*smoothstep(2.0,11.0,nvDepth)*(1.0-smoothstep(30.0,90.0,nvDepth));
    nvWhitecap*=smoothstep(.25,.68,nvFine);diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.72,.80,.75),nvWhitecap*.55);
    diffuseColor.a=mix(.68,.985,smoothstep(1.0,23.0,nvDepth));`);
   shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_begin>',`#include <normal_fragment_begin>
    float nvWA=vNvWorld.x*.048+vNvWorld.z*.011+nvTime*.92;float nvWB=vNvWorld.x*.087-vNvWorld.z*.025+nvTime*1.23;
    float nvRippleX=sin(vNvWorld.x*1.13+vNvWorld.z*.79+nvTime*.8)*.028+sin(vNvWorld.x*3.4-vNvWorld.z*1.7+nvTime*1.8)*.012;
    float nvRippleZ=sin(vNvWorld.z*1.09-vNvWorld.x*.61-nvTime*.7)*.028+sin(vNvWorld.z*2.6+vNvWorld.x*2.1-nvTime*1.6)*.011;
    vec3 nvNormal=normalize(vec3(-cos(nvWA)*.048*.16-cos(nvWB)*.087*.075+nvRippleX,1.0,-cos(nvWA)*.011*.16+cos(nvWB)*.025*.075+nvRippleZ));
    normal=normalize(mat3(viewMatrix)*nvNormal);geometryNormal=normal;`);
   shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(.13,.31,nvWhitecap);');
  };
  oceanMaterial.customProgramCacheKey=()=> 'NVPBROceanV2';
  // Resolution is concentrated along shore. The open ocean needs far fewer verts.
  const vp=[],ix=[],rows=176,cols=92,z0=coastZ0,z1=coastZ1,x0=bounds.minX-1550;
  for(let j=0;j<=rows;j++){const z=z0+(z1-z0)*j/rows;let end=shore(z)+5.5;for(let k=0;k<12&&trackDistance(end,z)<half+16;k++)end-=1.5;
   for(let i=0;i<=cols;i++){const f=i/cols,x=end-(end-x0)*Math.pow(1-f,2.8);vp.push(x,-.405,z);if(i<cols&&j<rows){const a=j*(cols+1)+i;ix.push(a,a+cols+1,a+1,a+1,a+cols+1,a+cols+2);}}}
  ocean=mesh(simpleGeo(vp,ix),oceanMaterial,'Animated Coastal Ocean');ocean.receiveShadow=false;stats.ocean=true;stats.shoreline=true;stats.physicalWater=true;stats.surfBreakers=4;
  // Distinct bands of broken whitewater sit on the wave surface. Their holes,
  // variable widths and phase offsets avoid a painted white line at the coast.
  const surfMaterials=[];
  for(let band=0;band<4;band++){
   const center=[2.0,13,31,54][band],width=[8.5,5.4,4.0,3.2][band],vertices=[],indices=[],uvs=[],along=180,across=4;
   for(let j=0;j<=along;j++){const z=bounds.minZ-110+(bounds.maxZ-bounds.minZ+220)*j/along;
    for(let i=0;i<=across;i++){const f=i/across,x=shore(z)-center+(f-.5)*width;vertices.push(x,-.19-band*.015,z);uvs.push(f,z*.08);if(i<across&&j<along){const a=j*(across+1)+i;indices.push(a,a+across+1,a+1,a+1,a+across+1,a+across+2);}}}
   const g=simpleGeo(vertices,indices);g.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));
   const m=new T.MeshBasicMaterial({color:0xe1e8d9,transparent:true,opacity:band? .48:.40,depthWrite:false,side:T.FrontSide});mats.add(m);m.name='Broken Surf Band '+band;m.userData.nvSurf=true;
   m.onBeforeCompile=shader=>{Object.assign(shader.uniforms,u);shader.uniforms.nvBand={value:band};shader.vertexShader='uniform float nvTime,nvBand;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
    transformed.x+=sin(nvTime*.47+nvBand*1.9+position.z*.009)*1.5;transformed.y+=sin(position.z*.045+nvTime*.82+nvBand)*.035;`);
    shader.fragmentShader='uniform float nvTime,nvNight,nvBand;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float nvEdge=sin(clamp(vUv.x,0.0,1.0)*3.14159265);float nvStreak=sin(vUv.y*3.1+nvTime*.42+sin(vUv.y*.73+nvBand)*2.8);
      float nvCells=sin(vUv.y*21.7+vUv.x*31.0+nvTime*.65)*sin(vUv.y*13.3-vUv.x*24.0-nvTime*.4);
      float nvSurge=.55+.45*sin(nvTime*.53+nvBand*1.7+vUv.y*.13);
      diffuseColor.a*=pow(max(0.0,nvEdge),1.4)*smoothstep(-.7,.4,nvStreak+nvCells*.47)*(.35+.65*nvSurge);
      diffuseColor.rgb*=mix(1.0,.28,nvNight);`);
   };m.defines={USE_UV:''};m.customProgramCacheKey=()=> 'NVSurfBandV2';
   const obj=mesh(g,m,'Layered Surf Breaker '+band,band>1?1:0);obj.receiveShadow=false;surfMaterials.push(m);
  }
  stats.coastlineBounds={minX:Math.min(...coastXs),maxX:Math.max(...coastXs),minZ:coastZ0,maxZ:coastZ1};
  // Natural palms: curved tapering trunks, overlapping folded pinnae, uneven
  // crown heights and wind movement. No cone or billboard foliage is used.
  const barkTex=canvasTexture(128,512,(ctx,w,h)=>{ctx.fillStyle='#8a8170';ctx.fillRect(0,0,w,h);for(let y=0;y<h;y++){const stripe=(y%31)<3;ctx.fillStyle=stripe?'rgba(51,54,44,.47)':'rgba(225,208,169,.035)';ctx.fillRect(0,y,w,stripe?2:1);}for(let i=0;i<1400;i++){ctx.fillStyle=rng()>.5?'rgba(46,48,35,.17)':'rgba(224,211,177,.14)';ctx.fillRect(rng()*w,rng()*h,.5+rng()*1.2,3+rng()*19);}});barkTex.wrapS=barkTex.wrapT=T.RepeatWrapping;bark.map=barkTex;bark.bumpMap=barkTex;bark.bumpScale=.025;bark.needsUpdate=true;
  const leafTex=canvasTexture(128,256,(ctx,w,h)=>{const image=ctx.createImageData(w,h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,rib=Math.pow(Math.max(0,Math.cos(x/w*Math.PI*12+y*.018)),5),fade=1-y/h*.24,v=fade*(.87+rib*.10+rng()*.10);image.data[i]=156*v;image.data[i+1]=181*v;image.data[i+2]=121*v;image.data[i+3]=255;}ctx.putImageData(image,0,0);});
  for(const m of[palmLeaf,palmLight]){m.map=leafTex;m.roughness=.82;m.emissive=new T.Color(0x142412);m.emissiveIntensity=.09;m.needsUpdate=true;
   m.onBeforeCompile=shader=>{Object.assign(shader.uniforms,u);shader.vertexShader='uniform float nvTime;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
    float nvPalmPhase=0.0;
    #ifdef USE_INSTANCING
      nvPalmPhase=instanceMatrix[3].x*.08+instanceMatrix[3].z*.035;
    #endif
    float nvLeafBend=pow(clamp(position.z/4.7,0.0,1.0),1.8);transformed.x+=sin(nvTime*.72+nvPalmPhase+position.z*.6)*nvLeafBend*.095;transformed.y+=sin(nvTime*.93+nvPalmPhase*.7+position.z)*nvLeafBend*.055;`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb*=gl_FrontFacing?1.0:.78;');};m.customProgramCacheKey=()=> 'NVWindPalmV2';}
  const trunkP=[],trunkI=[],trunkUV=[],rings=18,sides=9;
  for(let i=0;i<=rings;i++){const t=i/rings,y=t*8,r=.235*(1-.58*t)*(1+.055*Math.sin(i*2.4)),bend=1.0*t*t;
   for(let j=0;j<=sides;j++){const a=j/sides*Math.PI*2;trunkP.push(bend+Math.cos(a)*r,y,.2*t*t+Math.sin(a)*r);trunkUV.push(j/sides,t*2.7);if(i<rings&&j<sides){const k=i*(sides+1)+j;trunkI.push(k,k+sides+1,k+1,k+1,k+sides+1,k+sides+2);}}}
  const trunkGeo=simpleGeo(trunkP,trunkI);trunkGeo.setAttribute('uv',new T.Float32BufferAttribute(trunkUV,2));const nutGeo=geo(new T.SphereGeometry(1,8,5));
  const leafP=[],leafI=[],leafUV=[];let vi=0;
  const frondY=t=>Math.sin(t*Math.PI*.91)*1.0-2.15*t*t;
  for(let i=1;i<=13;i++){const t=i/15.6,width=.92*Math.pow(Math.sin(t*Math.PI),.62);for(const side of[-1,1]){
   for(let k=0;k<3;k++){const f=k/2,xx=side*width*f,yy=frondY(t)-.30*f*f+.065*Math.sin(f*Math.PI),zz=4.7*t+.33*f,pinnaWidth=k===2?.006:k===1?.05:.042;
    leafP.push(xx,yy+.026,zz-pinnaWidth,xx,yy-.018,zz+pinnaWidth);leafUV.push(f,0,f,1);
    if(k<2){const a=vi+k*2;leafI.push(a,a+2,a+1,a+1,a+2,a+3);}
   }vi+=6;
  }}
  const frondGeo=simpleGeo(leafP,leafI);frondGeo.setAttribute('uv',new T.Float32BufferAttribute(leafUV,2));
  const stemGeo=geo(new T.TubeGeometry(new T.CatmullRomCurve3([new T.Vector3(0,0,0),new T.Vector3(0,.46,1.55),new T.Vector3(0,-.13,3.25),new T.Vector3(0,-1.86,4.7)]),7,.025,3,false));
  function palm(x,z,size,yaw){const r=6.2*size;if(!safe(x,z,r,4,true))return false;if(x<shore(z)+15)return false;const y=groundHeight(x,z);inst(trunkGeo,bark,x,y,z,size,size,size,yaw);
   const topX=x+(Math.cos(yaw)+Math.sin(yaw)*.2)*size,topZ=z+(-Math.sin(yaw)+Math.cos(yaw)*.2)*size;
   for(let j=0;j<11;j++){const angle=yaw+j/11*Math.PI*2+rand(-.13,.13),tilt=rand(-.13,.20)+(j%4===0?.13:0),stretch=rand(.87,1.08),lod=j>8?2:j>5?1:0;inst(frondGeo,j%3?palmLeaf:palmLight,topX,y+8*size+rand(-.08,.08),topZ,size*stretch,size,size*stretch,angle,lod,tilt);inst(stemGeo,palmLeaf,topX,y+8*size,topZ,size*stretch,size,size*stretch,angle,lod,tilt);}
   for(let j=0;j<3;j++)inst(nutGeo,wood,topX+Math.sin(j*2)*.25*size,y+7.75*size,topZ+Math.cos(j*2)*.25*size,.17*size,.23*size,.17*size,0,2);
   reserve(x,z,r,'palm',{height:12*size});stats.palms++;return true;
  }
  // Small coastal resorts: balconies, colonnades, rooftop shade and warm glazing.
  function resort(x,z,yaw,index){const w=rand(18,25),d=rand(10,14),r=Math.hypot(w+3,d+5)/2;if(!safe(x,z,r,7,true)||x<shore(z)+30)return false;const y=groundHeight(x,z),b=local(x,z,yaw),h=9.8;
   b.box(cream,0,y+h/2,0,w,h,d);b.box(white,0,y+.16,0,w+2,.32,d+4);
   for(let floor=0;floor<3;floor++){
    const fy=y+floor*3.2;for(let j=0;j<5;j++){const xx=(j-2)*w*.18;b.box(windowGlass,xx,fy+1.65,d/2+.035,w*.145,2.32,.06);b.box(white,xx-w*.078,fy+1.65,d/2+.14,.14,2.5,.2,1);b.box(white,xx+w*.078,fy+1.65,d/2+.14,.14,2.5,.2,1);if(floor>0){b.box(white,xx,fy+.06,d/2+.64,w*.18,.16,1.4);b.box(windowGlass,xx,fy+.71,d/2+1.27,w*.17,.98,.06,1);b.box(metal,xx,fy+1.25,d/2+1.27,w*.18,.045,.045,1);}}
    b.box(white,0,fy+3.13,0,w+.4,.16,d+.4);
   }
   b.box(white,0,y+h+.25,0,w+.6,.5,d+.4);for(let j=-2;j<=2;j++){b.box(wood,j*w*.18,y+h+1.7,0,.15,2.6,d*.7,1);b.box(wood,j*w*.18,y+h+3,0,w*.15,.12,d*.8,1);}
   b.box(white,0,y+3.2,d/2+1.8,w*.7,.20,2.2);for(const s of[-1,1])b.box(white,s*w*.3,y+1.6,d/2+2.4,.28,3.2,.28);b.plane(index%2?signCafe:signMain,0,y+3.78,d/2+.12,w*.5,.82,0);
   reserve(x,z,r,'coastal-resort',{width:w,depth:d,height:h,yaw});stats.buildings++;return true;
  }
  for(let i=22;i<n;i+=59){const p=track[i],q=normals[i],side=(i%3?1:-1),x=p.x+q.x*side*51,z=p.z+q.z*side*51;resort(x,z,Math.atan2(-q.x*side,-q.z*side),i);}
  for(let cluster=0;cluster<15;cluster++){const i=(14+cluster*31)%n,p=track[i],q=normals[i],side=cluster%3?1:-1,dist=half+rand(16,32),centerX=p.x+q.x*side*dist,centerZ=p.z+q.z*side*dist;
   for(let j=0;j<4;j++){const a=j*2.4+cluster*.7,r=j?rand(8,19):0;palm(centerX+Math.sin(a)*r,centerZ+Math.cos(a)*r,rand(.75,1.22),rand(0,6.28));}
  }
  for(let j=0;j<14;j++){const z=bounds.minZ+35+(bounds.maxZ-bounds.minZ-70)*j/13;palm(shore(z)+rand(24,43),z+rand(-9,9),rand(.82,1.18),rand(0,6.28));}
  // Dune grasses and coastal scrub grow in loose patches, leaving long sea views.
  // Fine foliage is spatially batched so camera frustum culling remains useful.
  const grassP=[],grassI=[],grassC=[];let gv=0;
  for(let blade=0;blade<12;blade++){const a=blade*2.39996,r=Math.sqrt((blade+.5)/12)*.6,bx=Math.cos(a)*r,bz=Math.sin(a)*r,h=.28+(blade%5)*.095,lean=.15+.1*Math.sin(blade*3.1),sideX=Math.cos(a+.7),sideZ=Math.sin(a+.7);
   for(let row=0;row<3;row++){const f=row/2,centerX=bx+Math.cos(a)*lean*f*f,centerZ=bz+Math.sin(a)*lean*f*f,width=(1-f)*.022+.001;
    grassP.push(centerX-sideX*width,h*f,centerZ-sideZ*width,centerX+sideX*width,h*f,centerZ+sideZ*width);for(let j=0;j<2;j++)grassC.push(.30+f*.21,.38+f*.21,.20+f*.15);
    if(row<2){const k=gv+row*2;grassI.push(k,k+1,k+2,k+1,k+3,k+2);}
   }gv+=6;
  }
  const duneGrassGeo=simpleGeo(grassP,grassI);duneGrassGeo.setAttribute('color',new T.Float32BufferAttribute(grassC,3));duneGrassGeo.userData.nvSpatial=true;
  const duneGrass=mat(0xffffff,.92,0,{vertexColors:true,side:T.DoubleSide});duneGrass.name='Coastal Dune Grass';
  duneGrass.onBeforeCompile=shader=>{Object.assign(shader.uniforms,u);shader.vertexShader='uniform float nvTime;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
    float nvGrassPhase=0.0;
    #ifdef USE_INSTANCING
      nvGrassPhase=instanceMatrix[3].x*.15+instanceMatrix[3].z*.07;
    #endif
    transformed.x+=sin(nvTime*1.15+nvGrassPhase+position.z)*position.y*.13;transformed.z+=sin(nvTime*.8+nvGrassPhase*.8)*position.y*.07;`);};duneGrass.customProgramCacheKey=()=> 'NVDuneGrassWindV2';
  const shrubGeo=geo(new T.IcosahedronGeometry(1,1));shrubGeo.userData.nvSpatial=true;const shrubMat=mat(0x5a6b43,.93);shrubMat.name='Salt-tolerant Coastal Scrub';
  let grassCount=0,shrubCount=0;
  function vegetationSpot(x,z,r){if(x<shore(z)+23||!safe(x,z,r,3,false))return false;for(const o of obstacles)if(/resort|tower/.test(o.type)&&Math.hypot(x-o.x,z-o.z)<o.radius+r)return false;return true;}
  for(let cluster=0;cluster<66;cluster++){
   const i=(cluster*17+9)%n,p=track[i],q=normals[i],side=cluster%2?1:-1,dist=half+rand(5,37),x=p.x+q.x*side*dist,z=p.z+q.z*side*dist;
   for(let j=0;j<7;j++){const xx=x+rand(-5.5,5.5),zz=z+rand(-5.5,5.5),size=rand(.65,1.55);if(!vegetationSpot(xx,zz,size*.85))continue;
    const lod=j>4?2:1;inst(duneGrassGeo,duneGrass,xx,groundHeight(xx,zz)+.015,zz,size,size,size,rand(0,6.28),lod);grassCount++;
   }
   if(cluster%3===0&&vegetationSpot(x,z,2.1)){const yy=groundHeight(x,z);for(let j=0;j<4;j++){const a=j*2.3;inst(shrubGeo,shrubMat,x+Math.sin(a)*.65,yy+.32+(j%2)*.15,z+Math.cos(a)*.6,.85,.46,.75,rand(0,6.28),1);}shrubCount++;}
  }
  // Tidally exposed boulders lead the eye along the irregular beach edge.
  for(let c=0;c<6;c++){const z=bounds.minZ+55+c*(bounds.maxZ-bounds.minZ-110)/5;for(let j=0;j<3;j++){const zz=z+rand(-14,14),x=shore(zz)-rand(1,10);rock(x,zz,rand(2.4,5.8),j===2?1:0);}}
  stats.duneGrassClumps=grassCount;stats.coastalShrubPatches=shrubCount;stats.windAnimatedPalms=true;
  // Umbrellas and timber loungers occupy the safe sand strip beside the sea.
  for(let i=0;i<42;i++){const z=rand(bounds.minZ-25,bounds.maxZ+25),x=shore(z)+rand(13,30),r=3.1;if(!safe(x,z,r,4,true))continue;const y=groundHeight(x,z),b=local(x,z,rand(0,6.28));b.cyl(wood,0,y+1.55,0,.045,3.1);b.add(cone,i%3?fabric:orange,0,y+3.0,0,2.3,.95,2.3,0);b.cyl(white,0,y+3.52,0,.065,.12,1);for(const side of[-1,1]){b.box(wood,side*1.17,y+.37,.3,.65,.08,1.65,1);b.box(fabric,side*1.17,y+.45,.3,.62,.08,1.58,1);b.box(fabric,side*1.17,y+.70,-.66,.63,.08,.78,1,0,-.53);b.box(wood,side*1.17,y+.19,.75,.54,.32,.08,1);b.box(wood,side*1.17,y+.19,-.42,.54,.32,.08,1);}reserve(x,z,r,'beach-umbrella');stats.beachUmbrellas++;}
  // Modest timber observation towers, avoiding a cluttered arcade-like horizon.
  for(const f of[.15,.57]){const z=bounds.minZ+(bounds.maxZ-bounds.minZ)*f,x=shore(z)+22,r=4.8;if(!safe(x,z,r,5,true))continue;const y=groundHeight(x,z),b=local(x,z,Math.PI/2);for(const a of[-1,1])for(const c of[-1,1])b.box(wood,a*1.2,y+1.6,c*1.2,.16,3.2,.16);b.box(white,0,y+3.12,0,3.3,.17,3.3);b.box(cream,0,y+3.9,-1.4,3.0,1.5,.1);b.box(white,0,y+5.0,0,3.8,.18,3.7);for(const a of[-1,1])b.box(wood,a*1.5,y+4.1,1.4,.1,2.0,.1);b.plane(signMain,0,y+4.24,1.52,2.4,.45,0);reserve(x,z,r,'lifeguard-tower');stats.buildings++;}
 }else{
  // Frozen lake with layered blue depth, branching fissures and cloudy inclusions.
  const lakeMap=canvasTexture(1024,1024,(ctx,w,h)=>{const grad=ctx.createRadialGradient(w*.42,h*.43,20,w/2,h/2,w*.65);grad.addColorStop(0,'#436b81');grad.addColorStop(.65,'#739fac');grad.addColorStop(1,'#bfd6d9');ctx.fillStyle=grad;ctx.fillRect(0,0,w,h);for(let i=0;i<110;i++){const x=rng()*w,y=rng()*h,r=rand(5,65),g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'rgba(217,236,237,.11)');g.addColorStop(1,'rgba(217,236,237,0)');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);}for(let i=0;i<24;i++){let x=rng()*w,y=rng()*h;ctx.beginPath();ctx.moveTo(x,y);for(let j=0;j<9;j++){x+=rand(-62,62);y+=rand(22,65);ctx.lineTo(x,y);}ctx.lineWidth=rand(1,3);ctx.strokeStyle='rgba(224,247,252,.66)';ctx.stroke();ctx.lineWidth=.5;ctx.strokeStyle='rgba(16,63,89,.8)';ctx.stroke();}});
  const g=new T.CircleGeometry(1,128);g.rotateX(-Math.PI/2);const pos=g.attributes.position;for(let i=1;i<pos.count;i++){const a=Math.atan2(pos.getZ(i),pos.getX(i)),jag=1+.025*Math.sin(a*7)+.018*Math.sin(a*13);pos.setXYZ(i,pos.getX(i)*lake.rx*jag,0,pos.getZ(i)*lake.rz*jag);}g.computeVertexNormals();geo(g);
  const lakeMat=new T.MeshPhysicalMaterial({map:lakeMap,color:0xd7edf4,roughness:.19,metalness:.12,clearcoat:1,clearcoatRoughness:.13,envMapIntensity:.78});mats.add(lakeMat);const iceLake=mesh(g,lakeMat,'Fractured Blue Ice Lake');iceLake.position.set(lake.x,-.043,lake.z);stats.frozenLake=true;
  // Extruded fissures provide actual depth at the shoreline as well as painted cracks.
  for(let i=0;i<7;i++){const a=i/7*Math.PI*2,x=lake.x+Math.cos(a)*lake.rx*.7,z=lake.z+Math.sin(a)*lake.rz*.7,len=rand(8,18),wid=rand(.25,.60);const b=local(x,z,a+.4);b.box(darkStone,0,-.026,0,wid,.025,len);b.box(iceRim,-wid*.7,-.005,0,.12,.05,len,1);b.box(iceRim,wid*.7,-.005,0,.12,.05,len,1);}
  stats.iceCrevices=7;
  // Shared irregular branch tiers give evergreen silhouettes a natural edge.
  const treeP=[],treeI=[],capP=[],capI=[],sides=16;let offset=0,capOffset=0;
  for(let level=0;level<6;level++){
   const base=.8+level*.85,r=1.8*(1-level*.135),top=base+2.0;
   for(let k=0;k<2;k++)for(let j=0;j<=sides;j++){const a=j/sides*Math.PI*2,wobble=1+.10*Math.sin(j*2.3+level);const rr=(k===0?r:.03)*wobble;treeP.push(Math.cos(a)*rr,base+(k?top-base:Math.sin(j*2.7)*.1),Math.sin(a)*rr);if(k===0&&j<sides){const q=offset+j;treeI.push(q,q+sides+1,q+1,q+1,q+sides+1,q+sides+2);}}
   offset+=(sides+1)*2;
   // Powder collects only on the upper half of each branch tier.
   for(let k=0;k<2;k++)for(let j=0;j<=sides;j++){const a=j/sides*Math.PI*2,rr=(k===0?r*.72:.02)*(1+.08*Math.sin(j*2.3+level));capP.push(Math.cos(a)*rr,base+.62+(k?1.4:Math.sin(j*2.7)*.08),Math.sin(a)*rr);if(k===0&&j<sides){const q=capOffset+j;capI.push(q,q+sides+1,q+1,q+1,q+sides+1,q+sides+2);}}
   capOffset+=(sides+1)*2;
  }
  const treeGeo=simpleGeo(treeP,treeI),snowCapGeo=simpleGeo(capP,capI);
  function fir(x,z,size,yaw,lod){const r=2.2*size;if(!safe(x,z,r,4,true))return false;if(lake&&Math.hypot((x-lake.x)/lake.rx,(z-lake.z)/lake.rz)<1.13)return false;const y=groundHeight(x,z);inst(cylinder,bark,x,y+2.9*size,z,.10*size,5.8*size,.10*size,0,lod);inst(treeGeo,stats.evergreens%3?needle:needleLight,x,y,z,size,size,size,yaw,lod);inst(snowCapGeo,snow,x,y+.03,z,size,size,size,yaw,lod);reserve(x,z,r,'evergreen',{height:8*size});stats.evergreens++;return true;}
  const roofGeo=simpleGeo([-.5,0,-.5,.5,0,-.5,0,.5,-.5,-.5,0,.5,.5,0,.5,0,.5,.5],[0,2,1,3,4,5,0,3,5,0,5,2,2,5,4,2,4,1,0,1,4,0,4,3]);
  for(let i=18;i<n;i+=57){const p=track[i],q=normals[i],side=i%2?1:-1;chalet(p.x+q.x*side*42,p.z+q.z*side*42,Math.atan2(-q.x*side,-q.z*side),i);}
  for(let i=0;i<n;i+=3){const p=track[i],q=normals[i],side=rng()>.5?1:-1,size=rand(.80,1.65),dist=half+rand(9,39);fir(p.x+q.x*side*dist,p.z+q.z*side*dist,size,rand(0,6.28),i%4===0?1:0);}
  // A second, more distant tree belt layers the forest behind close roadside trees.
  for(let i=0;i<70;i++){const x=rand(bounds.minX-110,bounds.maxX+110),z=rand(bounds.minZ-110,bounds.maxZ+110);if(trackDistance(x,z)>55)fir(x,z,rand(1,2.0),rand(0,6.28),1);}
  function chalet(x,z,yaw,index){const w=rand(9,14),d=rand(8,11),r=Math.hypot(w+3,d+5)/2;if(!safe(x,z,r,5,true))return false;if(lake&&Math.hypot((x-lake.x)/lake.rx,(z-lake.z)/lake.rz)<1.28)return false;const y=groundHeight(x,z),b=local(x,z,yaw),h=4.4;
   b.box(wood,0,y+h/2,0,w,h,d);b.box(stone,0,y+.3,0,w+.4,.6,d+.4);b.add(roofGeo,snow,0,y+h,0,w+2.2,6.2,d+2.1,0);b.box(darkWood,-w/2-.5,y+h-.12,0,.18,.25,d+2.1);b.box(darkWood,w/2+.5,y+h-.12,0,.18,.25,d+2.1);
   for(let row=0;row<8;row++)b.box(darkWood,0,y+.6+row*.46,d/2+.06,w,.08,.08,1);
   for(const side of[-1,1]){b.box(lamp,side*w*.28,y+2.15,d/2+.06,1.65,1.55,.08);b.box(white,side*w*.28,y+2.15,d/2+.13,.07,1.7,.08,1);b.box(white,side*w*.28,y+2.15,d/2+.13,1.8,.07,.08,1);b.box(darkWood,side*w*.28,y+1.28,d/2+.13,1.9,.15,.25,1);}
   b.box(darkWood,0,y+1.35,d/2+.1,1.28,2.6,.18);b.box(snow,0,y+.12,d/2+1.6,w*.6,.24,3);b.plane(index%2?signCafe:signMain,0,y+3.8,d/2+.13,w*.59,.65,0);b.box(stone,-w*.28,y+h+1.75,-d*.18,.9,3.5,1.1);b.box(snow,-w*.28,y+h+3.57,-d*.18,1.12,.16,1.32);reserve(x,z,r,'alpine-chalet',{width:w,depth:d,height:7.5,yaw});stats.buildings++;return true;
  }
  // Alpine marker poles stay beyond barriers and remain legible against the snow.
  for(let i=3;i<n;i+=13)for(const side of[-1,1]){const p=track[i],q=normals[i],x=p.x+q.x*side*(half+3.4),z=p.z+q.z*side*(half+3.4);if(trackDistance(x,z)<half+2.3)continue;const y=groundHeight(x,z);inst(cylinder,orange,x,y+1.45,z,.045,2.9,.045,0);inst(cylinder,white,x,y+2.68,z,.046,.25,.046,0);inst(box,white,x,y+1.0,z,.20,.16,.09,0,1);reserve(x,z,.15,'snow-marker');}
  const count=700,verts=new Float32Array(count*3);for(let i=0;i<count;i++){verts[i*3]=rand(bounds.minX-30,bounds.maxX+30);verts[i*3+1]=rand(2,55);verts[i*3+2]=rand(bounds.minZ-30,bounds.maxZ+30);}const snowGeo=geo(new T.BufferGeometry());snowGeo.setAttribute('position',new T.BufferAttribute(verts,3));const m=new T.PointsMaterial({color:0xdfeef4,size:.19,transparent:true,opacity:.47,depthWrite:false,sizeAttenuation:true});mats.add(m);snowfall=new T.Points(snowGeo,m);snowfall.name='Light Alpine Snowfall';snowfall.frustumCulled=false;levels[1].add(snowfall);stats.particles=count;
  animated.push((t,dt)=>{const a=snowGeo.attributes.position.array;for(let i=0;i<count;i++){a[i*3+1]-=dt*(1.05+(i%7)*.08);a[i*3]+=Math.sin(t*.35+i)*dt*.12;if(a[i*3+1]<.5)a[i*3+1]=55;}snowGeo.attributes.position.needsUpdate=true;});
 }
 // Shared geometry/material batches retain visual richness at few draw calls.
 batches.forEach(b=>{let geometry=b.g;if(b.spatial){geometry=geo(b.g.clone());const box=new T.Box3(),p=new T.Vector3();b.matrices.forEach(m=>box.expandByPoint(p.setFromMatrixPosition(m)));const center=box.getCenter(new T.Vector3());geometry.boundingSphere=new T.Sphere(center,box.getSize(new T.Vector3()).length()/2+3);geometry.boundingBox=box.clone().expandByScalar(3);}const obj=new T.InstancedMesh(geometry,b.m,b.matrices.length);b.matrices.forEach((matrix,i)=>obj.setMatrixAt(i,matrix));obj.instanceMatrix.needsUpdate=true;obj.frustumCulled=!!b.spatial;obj.castShadow=b.lod===0&&b.g!==plane;obj.receiveShadow=true;obj.name='Biome '+(b.m.name||'Instances');levels[b.lod].add(obj);stats.instances+=b.matrices.length;});
 function collectStats(){let calls=0,tri=0;root.traverseVisible(o=>{if(o.isMesh){calls++;tri+=(o.geometry.index?o.geometry.index.count:o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);}else if(o.isPoints)calls++;});return{calls,triangles:tri};}
 function setQuality(q){levels[1].visible=q!=='low';levels[2].visible=q==='high';root.userData.quality=q;if(snowfall)snowfall.geometry.setDrawRange(0,q==='high'?700:350);const s=collectStats();stats.visibleDrawCalls=s.calls;stats.visibleTriangles=s.triangles;}
 function setTimeOfDay(t){timeOfDay=t==='night'?'night':'dusk';root.userData.timeOfDay=timeOfDay;emissives.forEach((m,i)=>m.emissiveIntensity=timeOfDay==='night'?(i===0?1.1:.37):(i===0?.3:.10));if(ocean)ocean.material.uniforms.night.value=timeOfDay==='night'?1:0;if(coastUniforms)coastUniforms.nvNight.value=timeOfDay==='night'?1:0;if(snowfall)snowfall.material.opacity=timeOfDay==='night'?.32:.47;}
 function update(dt,time){if(disposed)return;const delta=Math.max(0,Math.min(.1,Number(dt)||0)),t=Number.isFinite(time)?time:0;animated.forEach(fn=>fn(t,delta));}
 function dispose(){if(disposed)return;disposed=true;if(root.parent)root.parent.remove(root);geos.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());root.clear();}
 levels.forEach(g=>g.visible=true);const total=collectStats();stats.drawCalls=total.calls;stats.triangles=total.triangles;stats.obstacles=obstacles.length;stats.qualityLevels=['low','medium','high'];
 root.userData.summary=stats;root.userData.obstacles=obstacles;root.userData.footprints=obstacles;root.userData.bounds=bounds;
 setQuality('medium');setTimeOfDay('dusk');
 const recommendedEnvironment=beach?{dusk:{fog:0xb6bbc0,density:.00115,key:2.15,hemi:1.05},night:{fog:0x24384b,density:.0015}}:{dusk:{fog:0xb3c7d7,density:.00105,key:1.8,hemi:1.25},night:{fog:0x253e57,density:.00145}};
 return{root,stats,obstacles,footprints:obstacles,groundMesh,ocean,lake,bounds,setQuality,setTimeOfDay,update,dispose,recommendedEnvironment};
}
global.NVBiomes={build};
})(window);
