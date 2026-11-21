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
function audioState(element){if(!audioStates.has(element))audioStates.set(element,{paused:true,plays:0,pauses:0,loads:0,currentTime:0,sourceAssignments:0});return audioStates.get(element);}
Object.defineProperty(window.HTMLElement.prototype,'paused',{get(){return audioState(this).paused;},configurable:true});
Object.defineProperty(window.HTMLElement.prototype,'currentTime',{get(){return audioState(this).currentTime;},set(value){audioState(this).currentTime=value;},configurable:true});
// A new media source or load() resets playback in a real browser. Model that
// behavior so an auth-transition remount/src reset cannot pass as continuity.
const nativeSetAttribute=window.HTMLElement.prototype.setAttribute,nativeRemoveAttribute=window.HTMLElement.prototype.removeAttribute;
window.HTMLElement.prototype.setAttribute=function(name,value){if(this.localName==='audio'&&name==='src'){const state=audioState(this);state.sourceAssignments++;state.currentTime=0;state.paused=true;}return nativeSetAttribute.call(this,name,value);};
window.HTMLElement.prototype.removeAttribute=function(name){if(this.localName==='audio'&&name==='src'&&this.hasAttribute(name)){const state=audioState(this);state.sourceAssignments++;state.currentTime=0;state.paused=true;}return nativeRemoveAttribute.call(this,name);};
window.HTMLElement.prototype.pause=function(){const state=audioState(this);state.paused=true;state.pauses++;};
window.HTMLElement.prototype.play=function(){assert.equal(this.localName,'audio');audioElements.add(this);const state=audioState(this);state.plays++;const result=playResults.shift();if(result instanceof Error)return Promise.reject(result);state.paused=false;return result??Promise.resolve();};
window.HTMLElement.prototype.load=function(){const state=audioState(this);state.loads++;state.currentTime=0;state.paused=true;};
const local=new Map(),session=new Map(),storage=map=>({getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,String(value)),removeItem:key=>map.delete(key)});
const location={origin:'http://localhost:3000',protocol:'http:',hostname:'localhost',host:'localhost:3000',href:'http://localhost:3000/',reload(){}};
Object.assign(globalThis,{window,document,HTMLElement:window.HTMLElement,HTMLInputElement:window.HTMLInputElement,location,localStorage:storage(local),sessionStorage:storage(session),IS_REACT_ACT_ENVIRONMENT:true,requestAnimationFrame:()=>1,cancelAnimationFrame(){}});
window.location=location;window.localStorage=globalThis.localStorage;window.sessionStorage=globalThis.sessionStorage;
const intervals=new Map();let intervalId=0;
const nativeInterval=globalThis.setInterval,nativeClearInterval=globalThis.clearInterval;
globalThis.setInterval=(callback,delay,...args)=>{const id=++intervalId;intervals.set(id,{callback,delay,args});return id;};
globalThis.clearInterval=id=>{if(!intervals.delete(id))nativeClearInterval(id);};
// Only the three-second intro is clock-controlled. Network deadlines and the
// short React settling timers continue to use native timers.
const nativeTimeout=globalThis.setTimeout,nativeClearTimeout=globalThis.clearTimeout,splashTimers=new Map();let splashClock=0,splashTimerId=0;
globalThis.setTimeout=(callback,delay,...args)=>{
  if(delay!==3000)return nativeTimeout(callback,delay,...args);
  const id=--splashTimerId;splashTimers.set(id,{callback,args,at:splashClock+3000});return id;
};
globalThis.clearTimeout=id=>{if(!splashTimers.delete(id))nativeClearTimeout(id);};

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
const bundle=await build({stdin:{contents:'export {default as App} from "./client/src/App.tsx"; export {Splash} from "./client/src/Auth.tsx"; export {OnlineRace} from "./client/src/network.ts"; export {GarageAudio} from "./client/src/GarageAudio.tsx"; export {AdminMedia} from "./client/src/AdminMedia.tsx"; export {usePresentationMedia} from "./client/src/PresentationMedia.ts"; export {api,uploadMedia} from "./client/src/api.ts";',resolveDir:process.cwd(),sourcefile:'media-test-entry.tsx',loader:'tsx'},bundle:true,write:false,format:'cjs',platform:'node',jsx:'automatic',loader:{'.css':'empty'},external:['react','react-dom','react-dom/client'],logLevel:'silent'});
const require=createRequire(resolve('package.json')),Module=require('node:module'),compiled=new Module(join(temp,'Media.cjs'));
compiled.paths=Module._nodeModulePaths(process.cwd());compiled._compile(bundle.outputFiles[0].text,compiled.filename=join(temp,'Media.cjs'));
const {App,Splash,OnlineRace,GarageAudio,AdminMedia,usePresentationMedia,api,uploadMedia}=compiled.exports;
const root=createRoot(document.getElementById('root'));
const settle=async()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,2));});
const render=async element=>{await act(async()=>root.render(element));await settle();};
const button=text=>{const found=[...document.querySelectorAll('button')].find(node=>node.textContent.trim()===text);assert.ok(found,'Missing button: '+text);return found;};
const click=async node=>{assert.ok(node&&!node.disabled,'Button must be enabled: '+node?.textContent);await act(async()=>{node.dispatchEvent(new window.Event('click',{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,2));});};
const gesture=async(type='pointerup',target=document.body)=>{await act(async()=>{const event=new window.Event(type,{bubbles:true});if(type==='keydown')Object.defineProperty(event,'key',{value:'Enter'});target.dispatchEvent(event);await new Promise(resolve=>setTimeout(resolve,2));});};
const musicButton=()=>{const found=document.querySelector('.garage-music button');assert.ok(found,'Music control must be available');return found;};
const advanceSplash=async(ms=3000)=>{await act(async()=>{splashClock+=ms;for(const [id,timer] of [...splashTimers])if(timer.at<=splashClock){splashTimers.delete(id);timer.callback(...timer.args);}await new Promise(resolve=>nativeTimeout(resolve,2));});};
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
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
let publicResponse=()=>response(settings),authResponse=()=>response({user,csrfToken:'media-ui-csrf'}),profileResponse=()=>response(profile),loginResponse=()=>response({user,csrfToken:'media-ui-csrf'});
globalThis.fetch=async(url,options={})=>{
  const path=String(url).replace('/api',''),method=options.method??'GET',body=options.body?JSON.parse(options.body):undefined;
  requests.push({path,method,body,headers:options.headers,signal:options.signal});
  if(path==='/auth/me')return authResponse();
  if(path==='/auth/login')return loginResponse();
  if(path==='/presentation')return publicResponse();
  if(path==='/admin/media')return response({assets,settings,limits});
  if(path==='/admin/presentation'){
    if(conflict){conflict=false;settings={version:settings.version+1,garageMusic:music,loadingImage:jpeg,musicVolume:.55};return response({error:{code:'PRESENTATION_CHANGED',message:'Pengaturan berubah.'}},409);}
    assert.equal(body.expectedVersion,settings.version);settings={version:settings.version+1,garageMusic:assets.find(item=>item.id===body.garageMusicId)??null,loadingImage:assets.find(item=>item.id===body.loadingImageId)??null,musicVolume:body.musicVolume};return response(settings);
  }
  if(path.startsWith('/admin/media/')&&method==='DELETE'){assets=assets.filter(item=>item.id!==path.split('/').at(-1));return response({deleted:true});}
  if(path==='/profile')return profileResponse();
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
  let firstDone=0,latestDone=0;
  await render(React.createElement(Splash,{done:()=>firstDone++}));
  assert.equal(splashTimers.size,1);const originalSplashTimer=[...splashTimers.keys()][0];
  assert.equal(document.querySelectorAll('.campus-logo').length,2);assert.equal(document.querySelector('.campus-credit').textContent,'create by civitas UIKA');
  assert.equal(document.querySelector('.splash-background'),null,'Missing admin JPEG uses the theme fallback');
  assert.equal(document.querySelector('.splash button'),null,'The first splash lasts its full three seconds');
  await advanceSplash(1000);
  await render(React.createElement(Splash,{done:()=>latestDone++,image:jpeg}));
  assert.equal(document.querySelector('.splash-background').getAttribute('src'),jpeg.url);assert.equal(document.querySelector('.splash-background').getAttribute('alt'),'');
  assert.deepEqual([...splashTimers.keys()],[originalSplashTimer],'A late public JPEG or new callback cannot restart the intro timer');
  await act(async()=>document.querySelector('.splash-background').dispatchEvent(new window.Event('error')));
  assert.equal(document.querySelector('.splash-background'),null,'A broken admin JPEG falls back without blocking the intro');assert.equal(document.querySelectorAll('.campus-logo').length,2);
  await advanceSplash(1999);assert.equal(latestDone,0,'The intro cannot end before three seconds');
  await advanceSplash(1);assert.equal(latestDone,1);assert.equal(firstDone,0,'Completion uses the current callback');
  await advanceSplash(3000);assert.equal(latestDone,1,'Completion runs once');
  await render(React.createElement('div'));assert.equal(splashTimers.size,0);
  console.log('PASS three-second single splash retains campus logos, uses the active admin JPEG, tolerates failure and never restarts on late media');

  const musicProps={asset:music,volume:.35,eligible:true,muted:false};
  await render(React.createElement(GarageAudio,musicProps));const sameAudio=document.querySelector('audio');
  assert.equal(musicButton().textContent,'','Music control is icon-only');assert.equal(musicButton().getAttribute('title'),'Jeda musik garasi');assert.ok(musicButton().querySelector('svg'));
  assert.ok(!document.querySelector('.garage-music').textContent.includes(music.name),'The compact control does not show a song title');
  assert.equal(audioState(sameAudio).plays,1,'Active admin music attempts autoplay as soon as it is eligible');
  assert.equal(audioState(sameAudio).paused,false);assert.equal(sameAudio.volume,.35);sameAudio.currentTime=34.25;
  const sourceAssignments=audioState(sameAudio).sourceAssignments;
  await render(React.createElement(GarageAudio,{...musicProps,asset:{...music},volume:.5}));
  assert.strictEqual(document.querySelector('audio'),sameAudio);assert.equal(audioState(sameAudio).plays,1,'Repeated snapshots must not restart playback');assert.equal(sameAudio.currentTime,34.25);assert.equal(audioState(sameAudio).sourceAssignments,sourceAssignments);assert.equal(sameAudio.volume,.5);
  await render(React.createElement(GarageAudio,{...musicProps,eligible:false}));assert.equal(audioState(sameAudio).paused,true);
  await render(React.createElement(GarageAudio,musicProps));assert.equal(audioState(sameAudio).plays,2);
  await render(React.createElement(GarageAudio,{...musicProps,muted:true}));assert.equal(audioState(sameAudio).paused,true);assert.equal(sameAudio.muted,true);
  await render(React.createElement(GarageAudio,musicProps));assert.equal(audioState(sameAudio).plays,3);
  await act(async()=>{hidden=true;document.dispatchEvent(new window.Event('visibilitychange'));});assert.equal(audioState(sameAudio).paused,true);
  await act(async()=>{hidden=false;document.dispatchEvent(new window.Event('visibilitychange'));});assert.equal(audioState(sameAudio).plays,4);
  await render(React.createElement(GarageAudio,{...musicProps,suspended:true}));assert.equal(audioState(sameAudio).paused,true);
  await render(React.createElement(GarageAudio,{...musicProps,asset:{...music,id:'music-2',url:'/api/media/music-2'}}));assert.strictEqual(document.querySelector('audio'),sameAudio);assert.equal(sameAudio.getAttribute('src'),'/api/media/music-2');
  await render(React.createElement('div'));assert.equal(audioState(sameAudio).paused,true,'Unmount must explicitly stop its media element');
  console.log('PASS default autoplay attempt, stable source/current time, race and prayer suspension, global mute, background visibility, source replacement and cleanup');

  const blocked=new Error('Gesture required');blocked.name='NotAllowedError';playResults.push(blocked);
  await render(React.createElement(GarageAudio,musicProps));const blockedAudio=document.querySelector('audio');
  assert.equal(audioState(blockedAudio).plays,1);assert.equal(audioState(blockedAudio).paused,true);assert.match(musicButton().getAttribute('aria-label'),/^Putar/);assert.match(document.querySelector('.garage-music-error').textContent,/browser|ketuk|putar|interaksi/i);
  await gesture();assert.equal(audioState(blockedAudio).plays,2,'The first pointer gesture retries blocked playback');assert.equal(audioState(blockedAudio).paused,false);
  await click(musicButton());assert.equal(audioState(blockedAudio).paused,true,'Explicit pause remains under player control');
  await gesture();await gesture('keydown');assert.equal(audioState(blockedAudio).plays,2,'Unrelated gestures cannot undo an explicit pause');
  await render(React.createElement(GarageAudio,{...musicProps,eligible:false}));await render(React.createElement(GarageAudio,{...musicProps,asset:{...music,id:'music-after-pause',url:'/api/media/music-after-pause'}}));assert.equal(audioState(blockedAudio).plays,2,'Returning to the garage or a new admin song cannot undo explicit pause');
  await click(musicButton());assert.equal(audioState(blockedAudio).plays,3,'The music control retries once without double toggling');assert.equal(audioState(blockedAudio).paused,false);
  await render(React.createElement('div'));playResults.push(blocked);await render(React.createElement(GarageAudio,musicProps));const keyboardAudio=document.querySelector('audio');await gesture('keydown');assert.equal(audioState(keyboardAudio).plays,2,'Keyboard activation also unlocks blocked playback');assert.equal(audioState(keyboardAudio).paused,false);
  await render(React.createElement('div'));playResults.push(blocked);await render(React.createElement(GarageAudio,musicProps));const fallbackAudio=document.querySelector('audio');await click(musicButton());assert.equal(audioState(fallbackAudio).plays,2,'The visible fallback retries once, not once in each event handler');assert.equal(audioState(fallbackAudio).paused,false);
  console.log('PASS blocked autoplay has a truthful fallback, pointer/keyboard/button retry, and explicit pause survives unrelated gestures and source changes');

  const delayed={};delayed.promise=new Promise(resolve=>delayed.resolve=resolve);
  await render(React.createElement('div'));playResults.push(delayed.promise);await render(React.createElement(GarageAudio,musicProps));const delayedAudio=document.querySelector('audio');
  await render(React.createElement(GarageAudio,{...musicProps,eligible:false}));await act(async()=>{audioState(delayedAudio).paused=false;delayed.resolve();});assert.equal(audioState(delayedAudio).paused,true,'Late play completion must not restart music during a race');
  await render(React.createElement('div'));await render(React.createElement(GarageAudio,{...musicProps,asset:null}));const emptyAudio=document.querySelector('audio');assert.equal(audioState(emptyAudio).plays,0);assert.equal(document.querySelector('.garage-music'),null,'A site without active admin music stays quiet');
  await render(React.createElement(GarageAudio,musicProps));assert.strictEqual(document.querySelector('audio'),emptyAudio);assert.equal(audioState(emptyAudio).plays,1,'An admin activation can start the existing idle player');
  console.log('PASS late autoplay completion cannot override a suspension and empty/activated admin music uses one idle player');

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
  await render(React.createElement(MediaHook,{userId:undefined}));assert.equal(hook.settings.version,7,'Public presentation is fetched before login');
  await render(React.createElement(MediaHook,{userId:'media-user'}));assert.equal(hook.settings.version,7,'Login preserves the active public media configuration');
  const beforePoll=requests.filter(item=>item.path==='/presentation').length;
  await act(async()=>{for(const timer of [...intervals.values()])if(timer.delay===60000)timer.callback(...timer.args);});await settle();assert.equal(requests.filter(item=>item.path==='/presentation').length,beforePoll+1);
  await render(React.createElement(MediaHook,{userId:'media-user',poll:false}));assert.equal([...intervals.values()].filter(timer=>timer.delay===60000).length,0);
  const oldPoll=deferred();publicResponse=()=>oldPoll.promise;
  await render(React.createElement(MediaHook,{userId:'media-user',poll:true}));
  await act(async()=>{for(const timer of [...intervals.values()])if(timer.delay===60000)timer.callback(...timer.args);});
  await act(async()=>hook.apply({...settings,version:9}));
  await act(async()=>oldPoll.resolve(response({...settings,version:8})));await settle();assert.equal(hook.settings.version,9,'An older in-flight poll cannot revert an admin save');
  await render(React.createElement(MediaHook,{userId:undefined,poll:false}));assert.equal(hook.settings.version,9,'Logout preserves public music settings');
  await act(async()=>hook.apply({...settings,version:8}));assert.equal(hook.settings.version,9);
  await render(React.createElement('div'));
  const abandoned=deferred();publicResponse=()=>abandoned.promise;await render(React.createElement(MediaHook,{userId:undefined,poll:false}));const abandonedRequest=requests.at(-1);
  await render(React.createElement('div'));assert.equal(abandonedRequest.signal.aborted,true,'Unmount aborts the bootstrap request');
  publicResponse=()=>response(settings);await render(React.createElement(MediaHook,{userId:'another-user',poll:false}));
  await act(async()=>abandoned.resolve(response({...settings,version:99})));await settle();assert.equal(hook.settings.version,7,'An abandoned mount cannot replace the current public config');
  console.log('PASS anonymous bootstrap, visible polling, no auth-transition reset, stale admin/poll protection and unmount cancellation');

  await render(React.createElement('div'));
  const authBoot=deferred(),accountBoot=deferred();authResponse=()=>authBoot.promise;profileResponse=()=>accountBoot.promise;
  const bootRequests=requests.length;
  await render(React.createElement(App));const introAudio=document.querySelector('[data-garage-audio]');
  assert.ok(document.querySelector('.splash'),'Music starts during the first splash');assert.ok(introAudio);assert.equal(document.querySelectorAll('audio').length,1);
  assert.ok(requests.slice(bootRequests).some(item=>item.path==='/presentation'),'Presentation fetch cannot wait for auth/me');
  assert.equal(audioState(introAudio).plays,1);assert.equal(audioState(introAudio).paused,false);introAudio.currentTime=48.75;
  const introSourceAssignments=audioState(introAudio).sourceAssignments,introPauses=audioState(introAudio).pauses;
  const assertContinuousMusic=label=>{
    assert.strictEqual(document.querySelector('[data-garage-audio]'),introAudio,label+' keeps the same audio element');
    assert.equal(document.querySelectorAll('audio').length,1,label+' cannot duplicate the soundtrack');
    assert.equal(introAudio.getAttribute('src'),music.url);assert.equal(introAudio.currentTime,48.75,label+' cannot rewind the song');
    assert.equal(audioState(introAudio).sourceAssignments,introSourceAssignments,label+' cannot reassign the source');
    assert.equal(audioState(introAudio).plays,1,label+' cannot restart playback');assert.equal(audioState(introAudio).pauses,introPauses,label+' cannot interrupt playback');assert.equal(audioState(introAudio).paused,false);
  };
  assert.equal(document.querySelector('.splash-background').getAttribute('src'),jpeg.url,'The first App splash receives the active admin image');
  await advanceSplash();assert.equal(document.querySelector('.splash'),null);assertContinuousMusic('Closing splash while auth is pending');
  await act(async()=>authBoot.resolve(response({user:null,csrfToken:'anonymous-media-csrf'})));await settle();assert.ok(document.querySelector('.auth-layout'));assertContinuousMusic('Anonymous login screen');
  await change(document.querySelector('.auth-card input[type="email"]'),'driver@example.test');await change(document.querySelector('.auth-card input[type="password"]'),'media-test-password');
  await submit(document.querySelector('.auth-card form'));assert.ok(document.querySelector('.app-loading'),'A successful login can still be waiting for the account');assertContinuousMusic('Account loader');
  await act(async()=>accountBoot.resolve(response(profile)));await settle();assert.match(document.querySelector('.sidebar button.active').textContent,/Garasi/);assertContinuousMusic('Garage after login');
  assert.ok(musicButton().closest('.header-right'),'Compact music control appears by the game credit in the shared header');
  console.log('PASS one continuous soundtrack through pending auth splash, anonymous login, successful login/account loading and garage without rewind or duplicate audio');

  await render(React.createElement('div'));
  const returningAuth=deferred(),returningProfile=deferred();authResponse=()=>returningAuth.promise;profileResponse=()=>returningProfile.promise;
  await render(React.createElement(App));const returningSplash=document.querySelector('.splash'),returningAudio=document.querySelector('[data-garage-audio]'),returningTimer=[...splashTimers.keys()][0];
  returningAudio.currentTime=9.5;
  await advanceSplash(1000);await act(async()=>returningAuth.resolve(response({user,csrfToken:'returning-media-csrf'})));await settle();
  assert.ok(document.querySelector('.app-loading'));assert.strictEqual(document.querySelector('.splash'),returningSplash,'Auth-to-account-loader keeps the mounted splash');assert.deepEqual([...splashTimers.keys()],[returningTimer]);
  await advanceSplash(1000);await act(async()=>returningProfile.resolve(response(profile)));await settle();
  assert.ok(document.querySelector('.app-header'));assert.strictEqual(document.querySelector('.splash'),returningSplash,'Account-loader-to-garage keeps the mounted splash');assert.deepEqual([...splashTimers.keys()],[returningTimer]);
  assert.strictEqual(document.querySelector('[data-garage-audio]'),returningAudio);assert.equal(returningAudio.currentTime,9.5);assert.equal(audioState(returningAudio).plays,1);
  await advanceSplash(999);assert.ok(document.querySelector('.splash'));
  await advanceSplash(1);assert.equal(document.querySelector('.splash'),null);assert.ok(musicButton().closest('.header-right'));
  console.log('PASS returning-session auth and account transitions preserve the original three-second splash deadline and playing audio');

  await render(React.createElement('div'));authResponse=()=>response({user,csrfToken:'media-ui-csrf'});profileResponse=()=>response(profile);
  local.set('uvelocity:preferences',JSON.stringify({muted:true,quality:'medium',timeOfDay:'dusk'}));
  await render(React.createElement(App));const mutedIntroAudio=document.querySelector('[data-garage-audio]');assert.ok(document.querySelector('.splash'));assert.equal(audioState(mutedIntroAudio).plays,0,'Stored mute is applied before any splash autoplay attempt');
  await advanceSplash();assert.equal(audioState(mutedIntroAudio).plays,0);await click(musicButton());assert.equal(audioState(mutedIntroAudio).plays,1);assert.equal(audioState(mutedIntroAudio).paused,false);
  await render(React.createElement('div'));local.delete('uvelocity:preferences');
  console.log('PASS saved mute prevents initial autoplay and explicit unmute starts the existing player');

  playResults.push(blocked,blocked);await render(React.createElement(App));const blockedAppAudio=document.querySelector('[data-garage-audio]');
  await advanceSplash();await gesture();assert.equal(audioState(blockedAppAudio).plays,2);assert.equal(audioState(blockedAppAudio).paused,true);assert.match(musicButton().getAttribute('aria-label'),/^Putar/);
  const beforeMute=audioState(blockedAppAudio).plays;
  await click(document.querySelector('.page-tools [aria-label="Matikan suara"]'));
  assert.equal(audioState(blockedAppAudio).plays,beforeMute,'Muting blocked autoplay must not first trigger the capture-phase gesture retry');assert.equal(blockedAppAudio.muted,true);assert.equal(audioState(blockedAppAudio).paused,true);
  await click(musicButton());assert.equal(blockedAppAudio.muted,false);assert.equal(audioState(blockedAppAudio).plays,beforeMute+1);assert.equal(audioState(blockedAppAudio).paused,false);
  await click(musicButton());assert.equal(audioState(blockedAppAudio).paused,true);const pausedPlays=audioState(blockedAppAudio).plays;
  await click(document.querySelector('.page-tools [aria-label="Matikan suara"]'));await click(musicButton());
  assert.equal(blockedAppAudio.muted,false);assert.equal(audioState(blockedAppAudio).plays,pausedPlays,'Unmuting through the music control cannot override a deliberate pause');assert.equal(audioState(blockedAppAudio).paused,true);
  await click(document.querySelector('.page-tools [aria-label="Matikan suara"]'));await click(document.querySelector('.page-tools [aria-label="Aktifkan suara"]'));
  assert.equal(audioState(blockedAppAudio).plays,pausedPlays,'The main mute control must preserve deliberate music pause too');assert.equal(audioState(blockedAppAudio).paused,true);
  await render(React.createElement('div'));local.delete('uvelocity:preferences');
  console.log('PASS main mute bypasses blocked gesture retry and both unmute controls preserve deliberate music pause');

  await render(React.createElement(App));await advanceSplash();assert.ok(controller);
  const iframe=document.querySelector('iframe'),visibility=[],engineMutes=[];let previews=0,stops=0,starts=0,cancels=0,focusTransfers=0;
  const game={ready:Promise.resolve(),on(){return()=>{};},setVisible:value=>visibility.push(value),setMuted:value=>engineMutes.push(value),configure:async()=>{},preview:async()=>{previews++;},stopRace:async()=>{stops++;},pause:async()=>{},resume:async()=>{},unlockAudio(){},focus(){focusTransfers++;iframe.focus();},setCamera(){}};
  Object.defineProperty(iframe,'contentWindow',{configurable:true,value:{NVGame:game}});await act(async()=>iframe.dispatchEvent(new window.Event('load')));await settle();
  const appAudio=document.querySelector('[data-garage-audio]');assert.equal(audioState(appAudio).paused,false);assert.equal(audioState(appAudio).plays,1);
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
  await click(returnButton);await settle();assert.equal(resultsLeaves,1);assert.equal(document.querySelector('.results-overlay'),null);assert.match(document.querySelector('.sidebar button.active').textContent,/Garasi/);assert.strictEqual(document.querySelector('iframe'),iframe);
  console.log('PASS timeout/disconnect stay behind server authority, cancellation, replacement token, retained iframe, prayer precedence, finish renderer retention and top return action');
}finally{
  await act(async()=>root.unmount());globalThis.setInterval=nativeInterval;globalThis.clearInterval=nativeClearInterval;globalThis.setTimeout=nativeTimeout;globalThis.clearTimeout=nativeClearTimeout;
  await rm(temp,{recursive:true,force:true});
}
