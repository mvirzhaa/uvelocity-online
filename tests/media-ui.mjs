/** Actual React DOM interactions with scripted HTTP/XHR and media elements.
 * This portable suite does not claim browser autoplay, audio decoding or WebGL.
 * Real file validation, persistence, CSRF and range streaming have backend tests.
 */
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {parseHTML} from 'linkedom';

const temp=await mkdtemp(join(tmpdir(),'uvelocity-media-ui-'));
const {window,document}=parseHTML('<html><body><div id="root"></div></body></html>');
// Advertise the standard input event so React does not select its old-IE fallback.
document.oninput=null;
let active=document.body,hidden=false;
Object.defineProperty(document,'activeElement',{get:()=>active});
Object.defineProperty(document,'hidden',{get:()=>hidden,configurable:true});
window.HTMLElement.prototype.focus=function(){active=this;};
window.HTMLElement.prototype.blur=function(){active=document.body;};
window.HTMLElement.prototype.scrollIntoView=function(){this.dataset.scrolled='true';};
Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this.querySelector('option[selected]')?.value??this.querySelector('option')?.value??'';},set(value){for(const option of this.querySelectorAll('option'))option.toggleAttribute('selected',option.value===String(value));}});
const audioStates=new WeakMap(),audioElements=new Set(),playResults=[];
function audioState(element){if(!audioStates.has(element))audioStates.set(element,{paused:true,plays:0,pauses:0,loads:0});return audioStates.get(element);}
Object.defineProperty(window.HTMLElement.prototype,'paused',{get(){return audioState(this).paused;},configurable:true});
window.HTMLElement.prototype.pause=function(){const state=audioState(this);state.paused=true;state.pauses++;};
window.HTMLElement.prototype.play=function(){assert.equal(this.localName,'audio');audioElements.add(this);const state=audioState(this);state.plays++;const result=playResults.shift();if(result instanceof Error)return Promise.reject(result);state.paused=false;return result??Promise.resolve();};
window.HTMLElement.prototype.load=function(){const state=audioState(this);state.loads++;state.paused=true;};
const local=new Map(),session=new Map(),storage=map=>({getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,String(value)),removeItem:key=>map.delete(key)});
const location={origin:'http://localhost:3000',protocol:'http:',hostname:'localhost',host:'localhost:3000',href:'http://localhost:3000/',reload(){}};
Object.assign(globalThis,{window,document,HTMLElement:window.HTMLElement,HTMLInputElement:window.HTMLInputElement,location,localStorage:storage(local),sessionStorage:storage(session),IS_REACT_ACT_ENVIRONMENT:true,requestAnimationFrame:()=>1,cancelAnimationFrame(){}});
window.location=location;window.localStorage=globalThis.localStorage;window.sessionStorage=globalThis.sessionStorage;
const intervals=new Map();let intervalId=0;
const nativeInterval=globalThis.setInterval,nativeClearInterval=globalThis.clearInterval;
globalThis.setInterval=(callback,delay,...args)=>{const id=++intervalId;intervals.set(id,{callback,delay,args});return id;};
globalThis.clearInterval=id=>{if(!intervals.delete(id))nativeClearInterval(id);};

const pendingUploads=[];
class FakeXHR{
  upload={};headers={};status=0;responseText='';
  open(method,url){this.method=method;this.url=url;}
  setRequestHeader(name,value){this.headers[name]=value;}
  send(body){this.body=body;pendingUploads.push(this);}
  abort(){this.aborted=true;this.onabort?.();}
  progress(loaded,total){this.upload.onprogress?.({lengthComputable:true,loaded,total});}
  reply(value,status=201){this.status=status;this.responseText=JSON.stringify(value);this.onload?.();}
}
globalThis.XMLHttpRequest=FakeXHR;
const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
const bundle=await build({stdin:{contents:'export {default as App} from "./client/src/App.tsx"; export {OnlineRace} from "./client/src/network.ts"; export {GarageAudio} from "./client/src/GarageAudio.tsx"; export {AdminMedia} from "./client/src/AdminMedia.tsx"; export {usePresentationMedia} from "./client/src/PresentationMedia.ts"; export {api,uploadMedia} from "./client/src/api.ts";',resolveDir:process.cwd(),sourcefile:'media-test-entry.tsx',loader:'tsx'},bundle:true,write:false,format:'cjs',platform:'node',jsx:'automatic',loader:{'.css':'empty'},external:['react','react-dom','react-dom/client'],logLevel:'silent'});
const require=createRequire(resolve('package.json')),Module=require('node:module'),compiled=new Module(join(temp,'Media.cjs'));
compiled.paths=Module._nodeModulePaths(process.cwd());compiled._compile(bundle.outputFiles[0].text,compiled.filename=join(temp,'Media.cjs'));
const {App,OnlineRace,GarageAudio,AdminMedia,usePresentationMedia,api,uploadMedia}=compiled.exports;
const root=createRoot(document.getElementById('root'));
const settle=async()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,2));});
const render=async element=>{await act(async()=>root.render(element));await settle();};
const button=text=>{const found=[...document.querySelectorAll('button')].find(node=>node.textContent.trim()===text);assert.ok(found,'Missing button: '+text);return found;};
const click=async node=>{assert.ok(node&&!node.disabled,'Button must be enabled: '+node?.textContent);await act(async()=>{node.dispatchEvent(new window.Event('click',{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,2));});};
const change=async(node,value)=>{await act(async()=>{let prototype=Object.getPrototypeOf(node),descriptor;while(prototype&&!descriptor){descriptor=Object.getOwnPropertyDescriptor(prototype,'value');prototype=Object.getPrototypeOf(prototype);}if(descriptor?.set)descriptor.set.call(node,value);else node.value=value;node.dispatchEvent(new window.Event('input',{bubbles:true}));node.dispatchEvent(new window.Event('change',{bubbles:true}));});};
const submit=async form=>{await act(async()=>{form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await new Promise(resolve=>setTimeout(resolve,2));});};
const chooseFile=async(node,file)=>{Object.defineProperty(node,'files',{configurable:true,value:[file]});await act(async()=>node.dispatchEvent(new window.Event('change',{bubbles:true})));};
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const copy=value=>structuredClone(value);
const music={id:'music-1',kind:'garage_music',name:'Samudra sore.mp3',url:'/api/media/music-1',mimeType:'audio/mpeg',bytes:830000,durationSeconds:183,width:null,height:null,createdAt:new Date().toISOString()};
const jpeg={id:'image-1',kind:'loading_image',name:'Pantai senja.jpeg',url:'/api/media/image-1',mimeType:'image/jpeg',bytes:240000,durationSeconds:null,width:1920,height:1080,createdAt:new Date().toISOString()};
const limits={garageMusicBytes:20*1024*1024,loadingImageBytes:10*1024*1024,maxAssets:40,totalBytes:250*1024*1024};
let settings={version:1,garageMusic:null,loadingImage:null,musicVolume:.35},assets=[music,jpeg],conflict=false;
const requests=[];
const user={id:'driver-test',email:'driver@example.test',displayName:'Pembalap',avatarId:'driver-1',role:'admin',createdAt:new Date().toISOString()};
const appearance=(carId,color)=>({carId,rimId:'stock',color,finish:'metallic',rimColor:'#c7cdd4',stripeId:'none',stripeColor:'#ffffff',version:'1',owned:true,canCustomize:true});
const profile={user,wallet:{balance:'1000000',version:'1',currency:'RP_GAME'},inventory:{cars:['brz','bmw-m4-gt4'],wheels:['stock']},accessibleCars:['brz','bmw-m4-gt4'],appearances:[appearance('brz','#2866b8'),appearance('bmw-m4-gt4','#eeeeee')],loadout:appearance('brz','#2866b8'),statistics:{races:0,wins:0,rewards:'0'}};
const catalog={currency:'RP_GAME',currencyLabel:'Kredit game',rulesetVersion:'test',cars:[['brz','Subaru BRZ','#2866b8'],['bmw-m4-gt4','BMW M4 GT4','#eeeeee']].map(([id,name,color])=>({id,itemId:id,name,kind:'car',color,price:'100000',enabled:true,locked:true,catalogVersion:1,topSpeed:300,zeroTo100:3.6,handling:1})),wheels:[{id:'stock',itemId:'stock',name:'Roda standar',price:'0',kind:'wheel',enabled:true,catalogVersion:1,color:'#c7cdd4'}],services:[]};
let publicResponse=()=>response(settings);
globalThis.fetch=async(url,options={})=>{
  const path=String(url).replace('/api',''),method=options.method??'GET',body=options.body?JSON.parse(options.body):undefined;
  requests.push({path,method,body,headers:options.headers,signal:options.signal});
  if(path==='/auth/me')return response({user,csrfToken:'media-ui-csrf'});
  if(path==='/presentation')return publicResponse();
  if(path==='/admin/media')return response({assets,settings,limits});
  if(path==='/admin/presentation'){
    if(conflict){conflict=false;settings={version:settings.version+1,garageMusic:music,loadingImage:jpeg,musicVolume:.55};return response({error:{code:'PRESENTATION_CHANGED',message:'Pengaturan berubah.'}},409);}
    assert.equal(body.expectedVersion,settings.version);settings={version:settings.version+1,garageMusic:assets.find(item=>item.id===body.garageMusicId)??null,loadingImage:assets.find(item=>item.id===body.loadingImageId)??null,musicVolume:body.musicVolume};return response(settings);
  }
  if(path.startsWith('/admin/media/')&&method==='DELETE'){assets=assets.filter(item=>item.id!==path.split('/').at(-1));return response({deleted:true});}
  if(path==='/profile')return response(profile);
  if(path==='/catalog')return response(catalog);
  if(path==='/prayer/status'){
    const now=Date.now(),next={eventId:'future-asr',prayer:'asr',name:'Asar',startedAt:new Date(now+3600000).toISOString(),resumesAt:new Date(now+4500000).toISOString()};
    return response({enabled:true,allowed:true,paused:false,serverNow:new Date(now).toISOString(),localDate:new Date(now).toISOString().slice(0,10),pauseEndsAt:null,currentPrayer:null,nextPrayer:next,dailyTimes:[next],location:{mode:'fallback',cityId:'jakarta',label:'Jakarta',latitude:-6.2088,longitude:106.8456,timezone:'Asia/Jakarta',fallbackReason:null},calculation:{method:'location-20-18-v1',label:'Jadwal lokasi',fajrAngle:20,ishaAngle:18,adjustmentMinutes:2,rounding:'up',madhab:'Shafi',official:false},message:'Jadwal lokasi.'});
  }
  if(path==='/prayer/locations')return response({locations:[]});
  if(path.startsWith('/wallet/transactions'))return response({entries:[]});
  if(path.startsWith('/admin/users'))return response({users:[]});
  if(path.startsWith('/admin/audit'))return response({entries:[]});
  if(path==='/admin/tuning')return response({version:'1',bounds:{topSpeed:{min:100,max:450},zeroTo100:{min:1,max:12},handling:{min:.5,max:1.5}},cars:[],rewardPolicy:{finish:'10000',perLap:'1000',podium:['15000','8000','4000'],minimumDurationMs:15000,maximum:'50000'},physics:{}});
  throw new Error('Unexpected media UI request '+method+' '+path);
};
let controller;OnlineRace.prototype.restore=async function(){controller=this;return false;};
const writes=()=>requests.filter(item=>item.path==='/admin/presentation');
try{
  const musicProps={asset:music,volume:.35,eligible:true,muted:false};
  await render(React.createElement(GarageAudio,musicProps));const sameAudio=document.querySelector('audio');
  assert.equal(audioState(sameAudio).plays,0,'Audio needs an explicit user gesture');
  await click(button('Putar musik garasi'));assert.equal(audioState(sameAudio).plays,1);assert.equal(audioState(sameAudio).paused,false);assert.equal(sameAudio.volume,.35);
  await render(React.createElement(GarageAudio,{...musicProps,asset:{...music}}));
  assert.strictEqual(document.querySelector('audio'),sameAudio);assert.equal(audioState(sameAudio).plays,1,'Repeated snapshots must not restart playback');
  await render(React.createElement(GarageAudio,{...musicProps,eligible:false}));assert.equal(audioState(sameAudio).paused,true);
  await render(React.createElement(GarageAudio,musicProps));assert.equal(audioState(sameAudio).plays,2);
  await render(React.createElement(GarageAudio,{...musicProps,muted:true}));assert.equal(audioState(sameAudio).paused,true);assert.equal(sameAudio.muted,true);
  await render(React.createElement(GarageAudio,musicProps));assert.equal(audioState(sameAudio).plays,3);
  await act(async()=>{hidden=true;document.dispatchEvent(new window.Event('visibilitychange'));});assert.equal(audioState(sameAudio).paused,true);
  await act(async()=>{hidden=false;document.dispatchEvent(new window.Event('visibilitychange'));});assert.equal(audioState(sameAudio).plays,4);
  await render(React.createElement(GarageAudio,{...musicProps,suspended:true}));assert.equal(audioState(sameAudio).paused,true);
  await render(React.createElement(GarageAudio,{...musicProps,asset:{...music,id:'music-2',url:'/api/media/music-2'}}));assert.strictEqual(document.querySelector('audio'),sameAudio);assert.equal(sameAudio.getAttribute('src'),'/api/media/music-2');
  await render(React.createElement('div'));assert.equal(audioState(sameAudio).paused,true,'Unmount must explicitly stop its media element');
  console.log('PASS gesture playback, stable source/element, race and prayer suspension, global mute, background visibility, source replacement and cleanup');

  const blocked=new Error('Gesture required');blocked.name='NotAllowedError';playResults.push(blocked);
  await render(React.createElement(GarageAudio,musicProps));await click(button('Putar musik garasi'));
  assert.match(document.querySelector('.garage-music-error').textContent,/Browser meminta izin/);await click(button('Putar musik garasi'));assert.equal(audioState(document.querySelector('audio')).paused,false);
  const delayed={};delayed.promise=new Promise(resolve=>delayed.resolve=resolve);
  await render(React.createElement('div'));playResults.push(delayed.promise);await render(React.createElement(GarageAudio,musicProps));await click(button('Putar musik garasi'));const delayedAudio=document.querySelector('audio');
  await render(React.createElement(GarageAudio,{...musicProps,eligible:false}));await act(async()=>delayed.resolve());assert.equal(audioState(delayedAudio).paused,true,'Late play promise must not restart music during a race');
  console.log('PASS autoplay rejection stays recoverable and late play completion cannot override a stop');

  await render(React.createElement('div'));await api('/auth/me');
  const file=new File([new Uint8Array([73,68,51,0,1,2,3,4])],'lagu & senja.mp3',{type:'audio/mpeg'}),progress=[];
  const promise=uploadMedia('garage_music',file,{onProgress:value=>progress.push(value)}),upload=pendingUploads.at(-1);
  assert.strictEqual(upload.body,file,'Original File object must be the request body');assert.equal(upload.method,'POST');assert.equal(upload.url,'/api/admin/media/garage_music?name=lagu%20%26%20senja.mp3');assert.equal(upload.headers['Content-Type'],'audio/mpeg');assert.equal(upload.headers['X-CSRF-Token'],'media-ui-csrf');assert.equal(upload.withCredentials,true);
  upload.progress(4,8);upload.progress(8,8);assert.deepEqual(progress,[50,99]);upload.reply({asset:music});assert.deepEqual(await promise,{asset:music});assert.equal(progress.at(-1),100);
  const aborter=new AbortController(),cancelled=uploadMedia('loading_image',new File(['jpeg'],'image.jpeg'),{signal:aborter.signal}),cancelledCheck=assert.rejects(cancelled,error=>error.code==='REQUEST_ABORTED');aborter.abort();await cancelledCheck;assert.equal(pendingUploads.at(-1).aborted,true);
  console.log('PASS raw file upload body, encoded filename, CSRF/credentials, actual progress and abort');

  const changes=[],notices=[];
  await render(React.createElement(AdminMedia,{onChange:value=>changes.push(value),onNotice:value=>notices.push(value)}));
  const forms=document.querySelectorAll('.media-upload-card'),jpegFile=new File([new Uint8Array([255,216,255,217])],'arena loading.jpeg',{type:'image/jpeg'});
  await chooseFile(forms[1].querySelector('input'),jpegFile);await submit(forms[1]);const jpegUpload=pendingUploads.at(-1);
  assert.strictEqual(jpegUpload.body,jpegFile);assert.equal(jpegUpload.headers['Content-Type'],'image/jpeg');assert.match(document.querySelector('.media-upload-progress').textContent,/arena loading.jpeg/);
  const uploaded={...jpeg,id:'image-upload',name:jpegFile.name,url:'/api/media/image-upload'};assets=[uploaded,...assets];
  await act(async()=>{jpegUpload.progress(4,4);});assert.match(document.querySelector('.media-upload-progress').textContent,/Memeriksa berkas/);
  await act(async()=>{jpegUpload.reply({asset:uploaded});});await settle();assert.ok(document.querySelector('.media-preview img'));assert.equal(writes().length,0,'Upload never silently activates a selection');
  const selectors=document.querySelectorAll('.media-settings-form select');await change(selectors[0],music.id);await change(selectors[1],uploaded.id);
  await change(document.querySelector('.media-settings-form textarea'),'Soundtrack dan latar baru');await submit(document.querySelector('.media-settings-form'));
  assert.equal(writes().length,1);assert.deepEqual(writes()[0].body,{expectedVersion:1,garageMusicId:music.id,loadingImageId:uploaded.id,musicVolume:.35,reason:'Soundtrack dan latar baru'});assert.equal(settings.version,2);
  assert.equal(document.querySelector('.media-library>li').querySelector('button.danger').disabled,true,'Active media cannot be deleted');
  console.log('PASS admin file selection sends bytes, previews upload, preserves explicit activation and active-asset deletion guard');

  await change(document.querySelectorAll('.media-settings-form select')[0],'');await change(document.querySelector('.media-settings-form textarea'),'Ganti pilihan bersamaan');conflict=true;await submit(document.querySelector('.media-settings-form'));
  assert.equal(writes().length,2,'Version conflict must not retry an overwrite');assert.match(document.querySelector('[role="alert"]').textContent,/admin lain/);assert.equal(document.querySelectorAll('.media-settings-form select')[0].value,music.id);assert.match(document.querySelector('.media-settings-form .pill').textContent,/3/);
  await change(document.querySelectorAll('.media-settings-form select')[0],'');await change(document.querySelectorAll('.media-settings-form select')[1],'');await change(document.querySelector('.media-settings-form textarea'),'Nonaktifkan media lama');await submit(document.querySelector('.media-settings-form'));
  assert.equal(writes().at(-1).body.expectedVersion,3);assert.equal(writes().at(-1).body.garageMusicId,null);assert.equal(writes().at(-1).body.loadingImageId,null);assert.equal(settings.garageMusic,null);
  await click(document.querySelector('.media-library>li button.danger'));await change(document.querySelector('.media-removal input'),'Berkas tidak digunakan');await submit(document.querySelector('.media-removal'));
  assert.equal(requests.filter(item=>item.method==='DELETE').at(-1).path,'/admin/media/image-upload');assert.equal(document.querySelector('.media-removal'),null);
  console.log('PASS CAS conflict reloads authoritative choices without overwrite; explicit clear, versioned save and reasoned deletion');

  settings={version:7,garageMusic:music,loadingImage:jpeg,musicVolume:.35};assets=[music,jpeg];
  let hook;function MediaHook({userId,poll=true}){hook=usePresentationMedia(userId,poll);return React.createElement('div');}
  await render(React.createElement(MediaHook,{userId:'media-user'}));assert.equal(hook.settings.version,7);
  const beforePoll=requests.filter(item=>item.path==='/presentation').length;
  await act(async()=>{for(const timer of [...intervals.values()])if(timer.delay===60000)timer.callback(...timer.args);});await settle();assert.equal(requests.filter(item=>item.path==='/presentation').length,beforePoll+1);
  await render(React.createElement(MediaHook,{userId:'media-user',poll:false}));assert.equal([...intervals.values()].filter(timer=>timer.delay===60000).length,0);
  let resolveOld;publicResponse=()=>new Promise(resolve=>resolveOld=resolve);
  await render(React.createElement(MediaHook,{userId:'old-user',poll:false}));const oldRequest=requests.at(-1);
  publicResponse=()=>response(settings);await render(React.createElement(MediaHook,{userId:'new-user',poll:false}));assert.equal(oldRequest.signal.aborted,true);
  await act(async()=>resolveOld(response({...settings,version:99})));await settle();assert.equal(hook.settings.version,7,'Late old-user response must not replace current settings');
  await act(async()=>hook.apply({...settings,version:9}));await act(async()=>hook.apply({...settings,version:8}));assert.equal(hook.settings.version,9,'An older in-flight poll cannot revert a saved config');
  await render(React.createElement(MediaHook,{userId:undefined}));assert.equal(hook.settings,null);
  console.log('PASS modest visible polling, stop during race, logout/stale account guards and monotonic presentation versions');

  await render(React.createElement(App));await click(button('Lewati intro'));assert.ok(controller);
  const iframe=document.querySelector('iframe'),visibility=[],engineMutes=[];let previews=0,stops=0,starts=0,cancels=0,focusTransfers=0;
  const game={ready:Promise.resolve(),on(){return()=>{};},setVisible:value=>visibility.push(value),setMuted:value=>engineMutes.push(value),configure:async()=>{},preview:async()=>{previews++;},stopRace:async()=>{stops++;},pause:async()=>{},resume:async()=>{},unlockAudio(){},focus(){focusTransfers++;iframe.focus();},setCamera(){}};
  Object.defineProperty(iframe,'contentWindow',{configurable:true,value:{NVGame:game}});await act(async()=>iframe.dispatchEvent(new window.Event('load')));await settle();
  await click(button('Putar musik garasi'));const appAudio=document.querySelector('[data-garage-audio]');assert.equal(audioState(appAudio).paused,false);
  await click(document.querySelector('[aria-label="Matikan suara"]'));assert.equal(audioState(appAudio).paused,true);assert.equal(engineMutes.at(-1),true);
  await click(document.querySelector('[aria-label="Aktifkan suara"]'));assert.equal(engineMutes.at(-1),false);
  await click(button('Profil'));await click(button('Ganti mobil'));assert.equal(document.activeElement.id,'vehicle-collection');assert.equal(document.activeElement.dataset.scrolled,'true');assert.equal(document.querySelector('.mini-garage b').textContent,'Subaru BRZ');assert.equal(requests.filter(item=>item.path==='/loadout').length,0,'Shortcut cannot equip or charge a vehicle');
  Object.defineProperty(controller,'connected',{get:()=>true,configurable:true});Object.defineProperty(controller,'sessionId',{get:()=> 'fast',configurable:true});controller.start=()=>{starts++;};controller.ready=async value=>{assert.equal(value,false);cancels++;};
  const now=Date.now(),members=[{id:'fast',userId:user.id,name:'Pembalap',host:true,connected:true,ready:true,arenaReady:false,loadout:profile.loadout},{id:'slow',userId:'friend',name:'Teman',host:false,connected:true,ready:true,arenaReady:false,loadout:profile.loadout}];
  const lobby={protocol:1,roomId:'media-room',inviteCode:'MEDIA1',raceId:null,phase:'lobby',tick:0,serverTime:now,elapsedMs:0,startAt:null,startToken:null,loadingDeadline:null,prayerPause:null,config:{circuit:'city',laps:3,bots:1,maxHumans:2},hostId:'fast',members,racers:[]};
  await act(async()=>controller.handlers.snapshot(lobby));await click(button('Balapan'));await click(button('Mulai balapan'));
  assert.equal(starts,1);assert.ok(document.querySelector('.race-loading-screen'),'Host receives immediate loading feedback before server snapshot');assert.equal(audioState(appAudio).paused,true);assert.strictEqual(document.querySelector('iframe'),iframe);assert.equal(document.querySelector('main').hasAttribute('inert'),true);assert.equal(focusTransfers,0);assert.equal(document.activeElement.id,'race-loading-title');
  const loading={...lobby,phase:'loading',raceId:'race-media',startToken:'attempt-1',loadingDeadline:now+45000,members:members.map((member,index)=>({...member,arenaReady:index===0}))};
  await act(async()=>controller.handlers.snapshot(loading));assert.match(document.querySelector('.race-loading-screen').textContent,/1 \/ 2 perangkat siap/);assert.equal(document.querySelector('.race-loading-art').getAttribute('src'),jpeg.url);assert.equal(document.querySelector('.stage-panel').classList.contains('stage-hidden'),false);assert.equal(visibility.at(-1),true);
  await act(async()=>controller.handlers.snapshot({...loading,members:members.map(member=>({...member,arenaReady:true}))}));assert.ok(document.querySelector('.race-loading-screen'),'2/2 still waits for the shared server countdown');
  await act(async()=>controller.handlers.snapshot({...loading,phase:'countdown',startAt:now+3000,loadingDeadline:null}));assert.equal(document.querySelector('.race-loading-screen'),null);assert.equal(document.querySelector('main').hasAttribute('inert'),false);assert.strictEqual(document.querySelector('iframe'),iframe);assert.equal(focusTransfers,1);assert.strictEqual(document.activeElement,iframe,'Keyboard must move into the game after the loading dialog closes');
  await act(async()=>controller.handlers.snapshot({...loading,phase:'countdown',tick:2,startAt:now+3000,loadingDeadline:null}));assert.equal(focusTransfers,1,'Repeated countdown snapshots cannot steal focus repeatedly');
  console.log('PASS global engine/music mute, active-car shortcut without purchase/equip, immediate host overlay, real arena progress and shared-countdown handoff');

  await act(async()=>controller.handlers.snapshot({...loading,startToken:'attempt-2',loadingDeadline:now-1}));assert.match(document.querySelector('.race-loading-screen').textContent,/Menunggu pembatalan dari server/);assert.equal(document.querySelector('.race-loading-screen').getAttribute('data-start-token'),'attempt-2');
  await act(async()=>controller.handlers.status('Menyambungkan kembali…'));assert.match(document.querySelector('.race-loading-screen h1').textContent,/Memulihkan/);assert.ok(document.querySelector('.race-loading-screen'),'Disconnect must never imply readiness');
  await click([...document.querySelectorAll('.race-loading-screen button')].find(node=>node.textContent==='Batalkan persiapan'));assert.equal(cancels,1);assert.ok(document.querySelector('.race-loading-screen'),'Cancel waits for authoritative phase');
  await act(async()=>controller.handlers.snapshot({...lobby,members:members.map(member=>({...member,ready:false}))}));assert.equal(document.querySelector('.race-loading-screen'),null);
  await click(button('Profil'));const beforePrepare=previews;await act(async()=>controller.handlers.snapshot({...loading,startToken:'attempt-3'}));assert.strictEqual(document.querySelector('iframe'),iframe);assert.equal(previews,beforePrepare,'Profile-to-loading must not reset the arena to garage preview');assert.equal(visibility.at(-1),true);
  const pause={pauseToken:'pause-media',startedAt:now,resumeEligibleAt:now+900000,resumeAt:null,previousPhase:'loading',triggers:[{eventId:'asr-media',userId:user.id,displayName:user.displayName,prayer:'asr',name:'Asar',startedAt:now,resumesAt:now+900000}],requiredIds:['fast','slow'],readyIds:[]};
  await act(async()=>controller.handlers.snapshot({...loading,phase:'prayer_pause',prayerPause:pause}));assert.equal(document.querySelector('.race-loading-screen'),null);assert.ok([...document.querySelectorAll('[role="dialog"]')].some(node=>/salat/.test(node.textContent)));assert.strictEqual(document.querySelector('iframe'),iframe);assert.equal(audioState(appAudio).paused,true);
  await act(async()=>controller.handlers.snapshot({...loading,phase:'racing',prayerPause:null}));const stopsBeforeResult=stops;
  await act(async()=>controller.handlers.snapshot({...loading,phase:'finished',prayerPause:null}));
  await act(async()=>controller.handlers.result({result:{raceId:'race-media',roomId:'media-room',inviteCode:'MEDIA1',config:lobby.config,rulesetVersion:'1',startedAt:new Date(now-90000).toISOString(),endedAt:new Date(now).toISOString(),durationMs:90000,participants:[{id:'fast',userId:user.id,isBot:false,name:user.displayName,carId:'brz',status:'finished',position:1,totalTimeMs:90000,bestLapMs:30000}]},reward:{amount:'10000'}}));await settle();
  assert.ok(document.querySelector('.results-overlay'),'Official results display immediately');assert.strictEqual(document.querySelector('iframe'),iframe);assert.equal(visibility.at(-1),true);assert.equal(stops,stopsBeforeResult,'Finished phase preserves renderer for visual coast past the finish');assert.equal(audioState(appAudio).paused,true);
  const resultsCard=document.querySelector('.results-card'),returnButton=button('Kembali ke garasi');
  assert.strictEqual(returnButton.closest('.results-heading'),resultsCard.firstElementChild,'Return action must be in the first results header, before metrics and the ranking table');
  assert.equal([...resultsCard.querySelectorAll('button')].filter(node=>node.textContent==='Kembali ke garasi').length,1,'Results expose one return action');
  let resultsLeaves=0;controller.leave=async()=>{resultsLeaves++;controller.handlers.left();};
  await click(returnButton);await settle();assert.equal(resultsLeaves,1);assert.equal(document.querySelector('.results-overlay'),null);assert.match(document.querySelector('.page-heading h1').textContent,/Garasi Anda/);assert.strictEqual(document.querySelector('iframe'),iframe);
  console.log('PASS timeout/disconnect stay behind server authority, cancellation, replacement token, retained iframe, prayer precedence, finish renderer retention and top return action');
}finally{
  await act(async()=>root.unmount());globalThis.setInterval=nativeInterval;globalThis.clearInterval=nativeClearInterval;
  await rm(temp,{recursive:true,force:true});
}
