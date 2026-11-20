/** Prayer UI and hook regression using React, LinkeDOM and a scripted HTTP boundary.
 * These checks do not exercise a browser, GPS hardware, WebGL or live prayer APIs.
 * Backend schedule/room authority is tested separately against PostgreSQL.
 */
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {parseHTML} from 'linkedom';

const temporary=await mkdtemp(join(tmpdir(),'uvelocity-prayer-ui-'));
const {window,document}=parseHTML('<html><body><div id="root"></div></body></html>');
let active=document.body;
Object.defineProperty(document,'activeElement',{get:()=>active});
Object.defineProperty(document,'hidden',{configurable:true,value:false});
window.HTMLElement.prototype.focus=function(){active=this;};
window.HTMLElement.prototype.blur=function(){active=document.body;};
Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this.querySelector('option[selected]')?.value??this.querySelector('option')?.value??'';},set(value){for(const option of this.querySelectorAll('option'))option.toggleAttribute('selected',option.value===String(value));}});
Object.assign(globalThis,{window,document,HTMLElement:window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
const navigatorDescriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');
const navigator={userAgent:'UVelocity CPU UI test',geolocation:{getCurrentPosition(){throw new Error('Unexpected GPS request');}}};
Object.defineProperty(globalThis,'navigator',{configurable:true,value:navigator});

// Run only the component's explicit clock ticks; do not spend 15 real minutes.
// Date remains untouched, while the server-anchored monotonic clock advances.
const nativeInterval=globalThis.setInterval,nativeClearInterval=globalThis.clearInterval;
const nowDescriptor=Object.getOwnPropertyDescriptor(performance,'now'),nativeNow=performance.now.bind(performance);
const intervals=new Map();let intervalId=0,advanceMs=0;
Object.defineProperty(performance,'now',{configurable:true,value:()=>nativeNow()+advanceMs});
globalThis.setInterval=(callback,delay,...args)=>{const id=++intervalId;intervals.set(id,{callback,delay,args});return id;};
globalThis.clearInterval=id=>{if(!intervals.delete(id))nativeClearInterval(id);};

const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
const bundle=await build({stdin:{contents:'export * from "./client/src/Prayer.tsx";',resolveDir:process.cwd(),sourcefile:'prayer-test-entry.tsx',loader:'tsx'},bundle:true,write:false,format:'cjs',platform:'node',jsx:'automatic',loader:{'.css':'empty'},external:['react','react-dom','react-dom/client'],logLevel:'silent'});
const require=createRequire(resolve('package.json')),Module=require('node:module'),compiled=new Module(join(temporary,'Prayer.cjs'));
compiled.paths=Module._nodeModulePaths(process.cwd());compiled._compile(bundle.outputFiles[0].text,compiled.filename=join(temporary,'Prayer.cjs'));
const {PrayerPause,RoomPrayerPause,PrayerLocationSettings,usePrayerStatus,prayerCountdown}=compiled.exports;
const root=createRoot(document.getElementById('root'));
const at=Date.parse('2026-11-20T03:00:00Z'),iso=value=>new Date(value).toISOString();
const names=[['fajr','Subuh'],['dhuhr','Zuhur'],['asr','Asar'],['maghrib','Magrib'],['isha','Isya']];
const dailyTimes=names.map(([prayer,name],index)=>({eventId:prayer+'-test',prayer,name,startedAt:iso(at+(index-1)*3600000),resumesAt:iso(at+(index-1)*3600000+900000)}));
const fixture={enabled:true,allowed:true,paused:false,serverNow:iso(at),localDate:'2026-11-20',pauseEndsAt:null,currentPrayer:null,nextPrayer:dailyTimes[2],dailyTimes,location:{mode:'manual',cityId:'jayapura',label:'Jayapura',latitude:-2.54,longitude:140.72,timezone:'Asia/Jayapura',fallbackReason:null},calculation:{method:'location-20-18-v1',label:'Perhitungan lokasi 20/18 · ihtiyat 2 menit',fajrAngle:20,ishaAngle:18,adjustmentMinutes:2,rounding:'up',madhab:'Shafi',official:false},message:'Jadwal mengikuti lokasi akun.'};
const cities=[{id:'jakarta',name:'Jakarta',province:'DKI Jakarta',latitude:-6.21,longitude:106.85,timezone:'Asia/Jakarta'},{id:'jayapura',name:'Jayapura',province:'Papua',latitude:-2.54,longitude:140.72,timezone:'Asia/Jayapura'}];
const requests=[],response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
let getStatus=()=>response(fixture),failLocation=false;
globalThis.fetch=async(url,options={})=>{
 const path=String(url),body=options.body?JSON.parse(options.body):undefined;
 requests.push({path,method:options.method??'GET',body,signal:options.signal});
 if(path==='/api/prayer/status')return getStatus();
 if(path==='/api/prayer/locations')return response({locations:cities});
 if(path==='/api/prayer/location'){
  if(failLocation)return response({error:{code:'TEST_WRITE_FAILED',message:'Lokasi belum tersimpan di server.'}},503);
  const fallback=body.mode==='fallback',city=cities.find(item=>item.id===body.cityId);
  return response({...fixture,location:{...fixture.location,mode:body.mode,cityId:fallback?'jakarta':city?.id??null,label:fallback?'Jakarta (cadangan)':city?.name??'Lokasi tersimpan',latitude:fallback?-6.21:city?.latitude??body.latitude,longitude:fallback?106.85:city?.longitude??body.longitude,timezone:fallback?'Asia/Jakarta':city?.timezone??fixture.location.timezone,fallbackReason:fallback?'GPS gagal; Jakarta digunakan sementara.':null}});
 }
 throw new Error('Unexpected prayer test request '+path);
};
const settle=async()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,2));});
const render=async element=>{await act(async()=>{root.render(element);});await settle();};
const button=text=>{const found=[...document.querySelectorAll('button')].find(node=>node.textContent.trim()===text);assert.ok(found,'Missing button: '+text);return found;};
const click=async node=>{assert.ok(!node.disabled,'Disabled button: '+node.textContent);await act(async()=>{node.dispatchEvent(new window.Event('click',{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,2));});};
const tick=async milliseconds=>{advanceMs+=milliseconds;await act(async()=>{for(const timer of [...intervals.values()])if(timer.delay===1000)timer.callback(...timer.args);});};
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
let hook;
function HookHost({userId,settings=false}){hook=usePrayerStatus(userId);return settings?React.createElement(PrayerLocationSettings,{status:hook.status,onLocationChange:hook.setLocation,loading:hook.loading||hook.saving,error:hook.error}):React.createElement('div',{'data-hook-status':hook.status?.location.label??''});}
const locationWrites=()=>requests.filter(item=>item.path==='/api/prayer/location');
try{
 assert.equal(prayerCountdown(at+900000,at),'15:00');assert.equal(prayerCountdown(at-1,at),'00:00');assert.equal(prayerCountdown(NaN,at),'00:00');
 await render(React.createElement(HookHost,{userId:'driver-location',settings:true}));
 assert.equal(hook.status.location.timezone,'Asia/Jayapura');assert.match(document.body.textContent,/WIT/);assert.equal(document.querySelectorAll('.prayer-times time').length,5);
 assert.match(document.body.textContent,/Perhitungan lokasi/);assert.match(document.body.textContent,/bukan data resmi Kemenag/);
 assert.equal(locationWrites().length,0,'Opening location settings cannot request or save GPS');
 let gpsCalls=0,gpsOptions;
 navigator.geolocation.getCurrentPosition=(success,_failure,options)=>{gpsCalls++;gpsOptions=options;success({coords:{latitude:-6.123456,longitude:106.987654}});};
 await click(button('Gunakan GPS'));
 assert.equal(gpsCalls,1);assert.equal(gpsOptions.timeout,10000);assert.equal(gpsOptions.enableHighAccuracy,false);
 assert.deepEqual(locationWrites().at(-1).body,{mode:'gps',latitude:-6.12,longitude:106.99});
 assert.equal(hook.status.location.mode,'gps');
 navigator.geolocation.getCurrentPosition=(_success,failure)=>failure({code:1});
 await click(button('Gunakan GPS'));assert.deepEqual(locationWrites().at(-1).body,{mode:'fallback'});
 assert.match(document.body.textContent,/Jakarta disimpan sebagai lokasi sementara/);assert.match(document.body.textContent,/GPS gagal; Jakarta digunakan sementara/);
 failLocation=true;await click(button('Gunakan GPS'));assert.match(document.querySelector('[role="alert"]').textContent,/Lokasi belum tersimpan/);assert.doesNotMatch(document.body.textContent,/Jakarta disimpan sebagai lokasi sementara/);failLocation=false;
 await act(async()=>{const select=document.querySelector('select');select.value='jayapura';select.dispatchEvent(new window.Event('change',{bubbles:true}));});
 await click(button('Simpan kota'));assert.deepEqual(locationWrites().at(-1).body,{mode:'manual',cityId:'jayapura'});
 await act(async()=>{await hook.setLocation({mode:'manual',latitude:-7.123456,longitude:110.987654});});
 assert.deepEqual(locationWrites().at(-1).body,{mode:'manual',latitude:-7.12,longitude:110.99});
 console.log('PASS explicit GPS only, 10-second permission request, rounded private coordinates, persisted Jakarta fallback, write failure, manual city/coordinate contract');

 let lateGps;const beforeLate=locationWrites().length;
 navigator.geolocation.getCurrentPosition=success=>{lateGps=success;};await click(button('Gunakan GPS'));
 await render(React.createElement('div'));await act(async()=>{lateGps({coords:{latitude:-6.2,longitude:106.8}});await Promise.resolve();});
 assert.equal(locationWrites().length,beforeLate,'A GPS result after settings unmount must not mutate the account');
 const first=deferred();getStatus=()=>first.promise;
 await render(React.createElement(HookHost,{userId:'old-user'}));const oldRequest=requests.at(-1);assert.equal(oldRequest.path,'/api/prayer/status');
 getStatus=()=>response({...fixture,location:{...fixture.location,label:'New account location'}});
 await render(React.createElement(HookHost,{userId:'new-user'}));assert.equal(oldRequest.signal.aborted,true);assert.equal(hook.status.location.label,'New account location');
 await act(async()=>{first.resolve(response({...fixture,location:{...fixture.location,label:'Old private location'}}));await Promise.resolve();});await settle();
 assert.equal(hook.status.location.label,'New account location','A stale user response cannot disclose the prior account location');
 await render(React.createElement(HookHost,{userId:null}));assert.equal(hook.status,null);assert.equal(hook.loading,false);
 getStatus=()=>response({error:{code:'UNAUTHENTICATED',message:'Sesi berakhir.'}},401);
 await render(React.createElement(HookHost,{userId:'expired-user'}));assert.equal(hook.unauthorized,true);assert.equal(hook.status,null);
 const beforeRefresh=requests.length;await act(async()=>{await hook.refresh();});assert.equal(requests.length,beforeRefresh,'An expired session cannot keep polling personal data');
 console.log('PASS late GPS cancellation, stale-user fetch abort/identity guard, logout cleanup and 401 polling stop');

 let refreshes=0;
 const personal={...fixture,paused:true,allowed:false,currentPrayer:dailyTimes[1],pauseEndsAt:iso(at),location:{...fixture.location,fallbackReason:'Jadwal lokasi belum dapat dihitung. Jakarta digunakan sementara.'}};
 await render(React.createElement(PrayerPause,{status:personal,getServerNow:()=>at+1000,onRefresh:async()=>{refreshes++;},onLocationChange:async()=>personal}));
 assert.equal(document.querySelector('[role="timer"]').textContent,'00:00');assert.match(document.body.textContent,/diverifikasi oleh server/);assert.equal(refreshes,0);
 assert.ok(document.querySelector('[role="dialog"]'),'The expired client countdown must keep the personal gate mounted');
 assert.match(document.querySelector('.prayer-time-detail').textContent,/12[.:]00/);assert.match(document.body.textContent,/Jadwal lokasi belum dapat dihitung/);
 await click(button('Periksa status'));assert.equal(refreshes,1);assert.ok(document.querySelector('[role="dialog"]'));
 console.log('PASS personal gate uses the supplied time zone, explains fallback, and never unlocks from its client countdown');

 let readiness=0,left=0;
 const room={pauseToken:'pause-1',startedAt:at-899990,resumeEligibleAt:at+10,resumeAt:null,previousPhase:'racing',triggers:[{eventId:'room-asr',userId:'account-friend',displayName:'Teman',prayer:'asr',name:'Asar',startedAt:at-899990,resumesAt:at+10}],requiredIds:['me','friend'],readyIds:[]};
 const baseProps={roomPause:room,ownId:'me',serverTime:at,phase:'prayer_pause',timeZone:'Asia/Jayapura',onReady:async()=>{readiness++;},onLeave:async()=>{left++;},members:[{id:'me',name:'Saya',connected:true},{id:'friend',name:'Teman',connected:true}]};
 await render(React.createElement(RoomPrayerPause,baseProps));assert.equal(button('Siap melanjutkan').disabled,true);assert.equal(readiness,0);
 await tick(1000);assert.equal(document.querySelector('[role="timer"]').textContent,'00:00');assert.equal(button('Siap melanjutkan').disabled,true,'Elapsed local time cannot authorize readiness before serverTime');assert.match(document.body.textContent,/Memastikan waktu pada server/);
 await render(React.createElement(RoomPrayerPause,{...baseProps,serverTime:at+10}));await click(button('Siap melanjutkan'));
 assert.equal(readiness,1);assert.equal(button('Menunggu konfirmasi…').disabled,true);assert.match(document.body.textContent,/0 \/ 2 peserta siap/);
 await settle();assert.equal(readiness,1);assert.doesNotMatch(document.body.textContent,/Konfirmasi Anda diterima/,'Resolved send promise is not a server acknowledgement');
 await render(React.createElement(RoomPrayerPause,{...baseProps,serverTime:at+20,roomPause:{...room,readyIds:['me']}}));
 assert.equal(button('Anda sudah siap').disabled,true);assert.match(document.body.textContent,/Konfirmasi Anda diterima/);
 const extended={...room,pauseToken:'pause-2',resumeEligibleAt:at+900000,readyIds:[]};
 await render(React.createElement(RoomPrayerPause,{...baseProps,serverTime:at+30,roomPause:extended,transportError:'Koneksi sedang dipulihkan.',connectionStatus:'Menyambungkan kembali'}));
 assert.equal(button('Siap melanjutkan').disabled,true);assert.match(document.body.textContent,/0 \/ 2 peserta siap/);assert.match(document.querySelector('[role="alert"]').textContent,/Koneksi sedang dipulihkan/);assert.match(document.body.textContent,/Menyambungkan kembali/);
 const resumed={...extended,readyIds:['me','friend'],resumeAt:at+903000};
 await render(React.createElement(RoomPrayerPause,{...baseProps,serverTime:at+904000,phase:'resume_countdown',roomPause:resumed}));
 assert.equal(document.querySelector('[role="timer"]').textContent,'0');assert.match(document.body.textContent,/Menunggu aba-aba server/);assert.ok(document.querySelector('[role="dialog"]'));assert.equal(readiness,1);assert.equal(left,0);
 await click(button('Keluar room'));assert.equal(left,1);
 console.log('PASS room minimum follows server time, consent is explicit and waits for readyIds, new prayer resets it, transport failures remain visible, resume waits for authoritative phase');
 console.log('Prayer UI regression complete: 4 focused groups passed. No browser, GPS hardware or WebGL execution claimed.');
}finally{
 await act(async()=>{root.unmount();});
 globalThis.setInterval=nativeInterval;globalThis.clearInterval=nativeClearInterval;
 if(nowDescriptor)Object.defineProperty(performance,'now',nowDescriptor);else delete performance.now;
 if(navigatorDescriptor)Object.defineProperty(globalThis,'navigator',navigatorDescriptor);else delete globalThis.navigator;
 await rm(temporary,{recursive:true,force:true});
}
