/** React interaction regression with a DOM and a scripted HTTP boundary.
 * No browser, WebGL, layout or genuine backend claim. Backend transactions are
 * independently covered against native PostgreSQL in services/__tests__.
 */
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {parseHTML} from 'linkedom';

const temp=await mkdtemp(join(tmpdir(),'uvelocity-ui-'));
const {window,document}=parseHTML('<html><body><div id="root"></div></body></html>');
const local=new Map(),session=new Map(),storage=m=>({getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)});
let active=document.body;
Object.defineProperty(document,'activeElement',{get:()=>active});
window.HTMLElement.prototype.focus=function(){active=this;};
window.HTMLElement.prototype.blur=function(){active=document.body;};
Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this.querySelector('option[selected]')?.value??this.querySelector('option')?.value??'';},set(value){for(const o of this.querySelectorAll('option'))o.toggleAttribute('selected',o.value===String(value));}});
const location={origin:'http://localhost:3000',protocol:'http:',hostname:'localhost',host:'localhost:3000',href:'http://localhost:3000/',reload(){}};
Object.assign(globalThis,{window,document,HTMLElement:window.HTMLElement,HTMLInputElement:window.HTMLInputElement,location,localStorage:storage(local),sessionStorage:storage(session),IS_REACT_ACT_ENVIRONMENT:true,requestAnimationFrame:()=>1,cancelAnimationFrame(){}});
window.location=location;window.localStorage=globalThis.localStorage;window.sessionStorage=globalThis.sessionStorage;
const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
const user={id:'driver-test',email:'driver@example.test',displayName:'Pembalap',avatarId:'driver-1',role:'admin',createdAt:new Date().toISOString()};
const car=(id,name,color,locked=true)=>({id,itemId:id,name,kind:'car',color,price:'100000',enabled:true,locked,catalogVersion:1,topSpeed:300,zeroTo100:3.6,handling:1});
let catalog={currency:'RP_GAME',currencyLabel:'Kredit game',rulesetVersion:'test',cars:[car('brz','Subaru BRZ','#2866b8'),car('bmw-m4-gt4','BMW M4 GT4','#eeeeee'),car('amg-gt4','Mercedes-AMG GT4','#aaaaaa',false)],wheels:[{id:'stock',itemId:'stock',name:'Roda standar',price:'0',kind:'wheel',enabled:true,catalogVersion:1,color:'#c7cdd4'}],services:[['paint-body','Cat bodi','10000'],['paint-rims','Cat pelek','5000'],['stripe-twin-racing','Twin Racing','15000'],['stripe-remove','Lepas striping','5000']].map(([id,name,price])=>({id,itemId:id,name,price,kind:'service',enabled:true,catalogVersion:1,color:'#ffffff'}))};
const appearance=(id,color,owned=true)=>({carId:id,rimId:'stock',color,finish:'metallic',rimColor:'#c7cdd4',stripeId:'none',stripeColor:'#ffffff',version:'1',owned,canCustomize:owned});
let profile={user,wallet:{balance:'1000000',version:'1',currency:'RP_GAME'},inventory:{cars:['brz','bmw-m4-gt4'],wheels:['stock']},accessibleCars:['brz','bmw-m4-gt4','amg-gt4'],appearances:[appearance('brz','#2866b8'),appearance('bmw-m4-gt4','#eeeeee'),appearance('amg-gt4','#aaaaaa',false)],loadout:appearance('brz','#2866b8'),statistics:{races:0,wins:0,rewards:'0'}};
const calls=[],quotes=new Map(),applied=new Map();let disconnectAfterFirstCommit=true,chargeCount=0;
const copy=x=>structuredClone(x),ok=x=>new Response(JSON.stringify(x),{status:200,headers:{'Content-Type':'application/json'}});
globalThis.fetch=async(url,options={})=>{
 const path=String(url).replace('/api',''),method=options.method??'GET',body=options.body?JSON.parse(options.body):{},key=options.headers?.['Idempotency-Key'];calls.push({path,method,body:copy(body),key});
 if(path==='/auth/me')return ok({user,csrfToken:'ui-test-csrf'});
 if(path==='/catalog')return ok(catalog);
 if(path==='/profile')return ok(profile);
 if(path==='/prayer/status'){
  const time=Date.now(),next={eventId:'ui-asr',prayer:'asr',name:'Asar',startedAt:new Date(time+3600000).toISOString(),resumesAt:new Date(time+4500000).toISOString()};
  return ok({enabled:true,allowed:true,paused:false,serverNow:new Date(time).toISOString(),localDate:new Date(time).toISOString().slice(0,10),pauseEndsAt:null,currentPrayer:null,nextPrayer:next,dailyTimes:[next],location:{mode:'fallback',cityId:'jakarta',label:'Jakarta (lokasi awal)',latitude:-6.2088,longitude:106.8456,timezone:'Asia/Jakarta',fallbackReason:null},calculation:{method:'location-20-18-v1',label:'Perhitungan lokasi 20/18 · ihtiyat 2 menit',fajrAngle:20,ishaAngle:18,adjustmentMinutes:2,rounding:'up',madhab:'Shafi',official:false},message:'Jadwal mengikuti lokasi akun.'});
 }
 if(path==='/prayer/locations')return ok({locations:[{id:'jakarta',name:'Jakarta',province:'DKI Jakarta',latitude:-6.2088,longitude:106.8456,timezone:'Asia/Jakarta'}]});
 if(path.startsWith('/wallet/transactions'))return ok({entries:[]});
 if(path==='/garage/appearance/quote'){
  const current=profile.appearances.find(a=>a.carId===body.carId);assert.ok(current?.owned);const selection={...current,...body};let lines=[];
  if(selection.color!==current.color||selection.finish!==current.finish)lines.push(catalog.services[0]);
  if(selection.stripeId!==current.stripeId||selection.stripeColor!==current.stripeColor)lines.push(catalog.services.find(s=>s.id==='stripe-'+selection.stripeId));
  const quote={quoteId:'quote-'+(quotes.size+1),carId:body.carId,appearanceVersion:current.version,selection,lineItems:lines.map(s=>({itemId:s.id,name:s.name,price:s.price,catalogVersion:s.catalogVersion})),total:lines.reduce((n,s)=>n+BigInt(s.price),0n).toString(),wallet:copy(profile.wallet),affordable:true,noOp:false,expiresAt:new Date(Date.now()+600000).toISOString()};quotes.set(quote.quoteId,quote);return ok(quote);
 }
 if(path==='/garage/appearance/apply'){
  assert.ok(key);if(applied.has(key))return ok(applied.get(key));const quote=quotes.get(body.quoteId);assert.ok(quote);const next={...quote.selection,version:'2',owned:true,canCustomize:true};profile.appearances=profile.appearances.map(a=>a.carId===next.carId?next:a);profile.loadout=next;profile.wallet={...profile.wallet,balance:(BigInt(profile.wallet.balance)-BigInt(quote.total)).toString(),version:String(+profile.wallet.version+1)};chargeCount++;
  const response={applicationId:'apply-'+chargeCount,appearance:next,loadout:next,wallet:copy(profile.wallet),pricePaid:quote.total,lineItems:quote.lineItems,noOp:false};applied.set(key,response);if(disconnectAfterFirstCommit){disconnectAfterFirstCommit=false;throw new Error('Scripted lost response after commit');}return ok(response);
 }
 if(path==='/loadout'){
  assert.deepEqual(Object.keys(body).sort(),['carId','rimId'],'Free equip must not submit unpaid cosmetic fields');const current=profile.appearances.find(a=>a.carId===body.carId);assert.ok(current);profile.loadout={...current,rimId:body.rimId};return ok({loadout:profile.loadout});
 }
 if(path.startsWith('/admin/users'))return ok({users:[]});
 if(path.startsWith('/admin/audit'))return ok({entries:[]});
 if(path==='/admin/tuning')return ok({version:'1',bounds:{topSpeed:{min:100,max:450},zeroTo100:{min:1,max:12},handling:{min:.5,max:1.5}},cars:catalog.cars.map(c=>({carId:c.id,topSpeed:300,zeroTo100:3.6,handling:1})),rewardPolicy:{finish:'10000',perLap:'1000',podium:['15000','8000','4000'],minimumDurationMs:15000,maximum:'50000'},physics:{}});
 throw new Error('Unexpected UI request '+method+' '+path);
};
const bundle=await build({stdin:{contents:'export {default} from "./client/src/App.tsx"; export {RacePanel} from "./client/src/RacePanel.tsx"; export {OnlineRace} from "./client/src/network.ts";',resolveDir:process.cwd(),sourcefile:'workshop-test-entry.tsx',loader:'tsx'},bundle:true,write:false,format:'cjs',platform:'node',jsx:'automatic',loader:{'.css':'empty'},external:['react','react-dom','react-dom/client'],logLevel:'silent'});
// Resolve React from the installed application dependencies, not the temp folder.
const require=createRequire(resolve('package.json'));const Module=require('node:module'),compiled=new Module(join(temp,'App.cjs'));compiled.paths=Module._nodeModulePaths(process.cwd());compiled._compile(bundle.outputFiles[0].text,compiled.filename=join(temp,'App.cjs'));
const App=compiled.exports.default,root=createRoot(document.getElementById('root'));
let controller;compiled.exports.OnlineRace.prototype.restore=async function(){controller=this;return false;};
const settle=async()=>{await act(async()=>{await new Promise(r=>setTimeout(r,5));});};
const button=text=>{const found=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text);assert.ok(found,'Missing button: '+text);return found;};
const click=async(node)=>{assert.ok(!node.disabled,'Disabled button '+node.textContent);await act(async()=>{node.dispatchEvent(new window.Event('click',{bubbles:true}));await new Promise(r=>setTimeout(r,5));});};
const clickText=async text=>click(button(text));
const carButton=id=>{const name=catalog.cars.find(c=>c.id===id).name;const b=[...document.querySelectorAll('.car-choice')].find(x=>x.querySelector('b')?.textContent===name);assert.ok(b);return b;};
try{
 await act(async()=>{root.render(React.createElement(App));});await settle();await clickText('Lewati intro');
 assert.equal(document.querySelectorAll('.car-choice').length,3);
 await click(document.querySelector('[aria-label="Cat #a92d3b"]'));assert.equal(chargeCount,0);assert.equal(calls.filter(c=>c.path.endsWith('/apply')).length,0);
 await clickText('Tinjau biaya & pasang');assert.equal(document.querySelectorAll('.appearance-review').length,1);assert.equal(chargeCount,0);await clickText('Bayar Rp10.000 & pasang');
 assert.equal(chargeCount,1);assert.ok(document.querySelector('.appearance-review [role="alert"]'));await clickText('Coba pemasangan lagi');
 assert.equal(chargeCount,1);const retries=calls.filter(c=>c.path.endsWith('/apply'));assert.equal(retries[0].key,retries[1].key);assert.equal(document.querySelectorAll('.appearance-review').length,0);
 assert.equal(profile.wallet.balance,'990000');assert.equal(profile.loadout.color,'#a92d3b');
 console.log('PASS paid preview, explicit confirmation, lost-response retry with stable key');
 await click(carButton('bmw-m4-gt4'));await clickText('Gunakan konfigurasi tersimpan');await click(carButton('brz'));
 assert.equal(document.querySelector('[aria-label="Cat #a92d3b"]').getAttribute('aria-pressed'),'true');await clickText('Gunakan konfigurasi tersimpan');assert.equal(chargeCount,1);
 console.log('PASS switching owned cars restores their saved paint without another payment');
 await click(carButton('bmw-m4-gt4'));const stripe=[...document.querySelectorAll('.stripe-card')].find(x=>x.querySelector('b')?.textContent==='Twin Racing');await click(stripe);await clickText('Tinjau biaya & pasang');await clickText('Bayar Rp15.000 & pasang');assert.equal(profile.loadout.stripeId,'twin-racing');assert.equal(profile.wallet.balance,'975000');
 console.log('PASS paid striping quote carries selected design and persists applied appearance');
 await click(carButton('amg-gt4'));await click(document.querySelector('[aria-label="Cat #a92d3b"]'));await clickText('Gunakan selama dibuka');assert.equal(profile.loadout.color,'#aaaaaa');assert.equal(chargeCount,2);assert.equal(document.querySelectorAll('.appearance-review').length,0);
 await clickText('Bengkel');assert.equal(document.querySelector('.vehicle-panel select').value,'brz','Workshop must fall back to a permanently owned vehicle');
 console.log('PASS temporary access equips factory appearance and workshop chooses permanent ownership');
 await clickText('Admin');await clickText('Harga & toko');assert.ok(document.querySelector('.vehicle-access-field'));assert.match(document.querySelector('.vehicle-access-field').textContent,/sudah membeli tetap memiliki akses/);assert.ok([...document.querySelectorAll('optgroup')].some(x=>x.getAttribute('label')==='Jasa cat & striping'));
 console.log('PASS admin exposes separate vehicle-access controls and paid cosmetic services');
 const sameFrame=document.querySelector('iframe');assert.ok(sameFrame);assert.ok(controller);
 Object.defineProperty(controller,'sessionId',{get:()=> 'fast'});let resumeRequests=0;controller.resumeReady=()=>{resumeRequests++;};
 const roomTime=Date.now(),pause={pauseToken:'prayer-ui-1',startedAt:roomTime,resumeEligibleAt:roomTime+900000,resumeAt:null,previousPhase:'racing',triggers:[{eventId:'asr:ui',userId:user.id,displayName:'Pembalap',prayer:'asr',name:'Asar',startedAt:roomTime,resumesAt:roomTime+900000}],requiredIds:['fast','slow'],readyIds:[]};
 const pausedRoom={roomId:'room-ui',raceId:'race-ui',phase:'prayer_pause',serverTime:roomTime,inviteCode:'TEST12',config:{circuit:'city',laps:3,bots:1,maxHumans:2},prayerPause:pause,members:[{id:'fast',userId:user.id,name:'Pembalap',host:true,connected:true,ready:true,loadout:profile.loadout},{id:'slow',userId:'friend',name:'Teman',connected:true,ready:true,loadout:profile.loadout}]};
 await act(async()=>{controller.handlers.snapshot(pausedRoom);});await settle();
 assert.strictEqual(document.querySelector('iframe'),sameFrame,'A prayer pause must preserve the active game iframe');
 assert.equal(document.querySelector('main').hasAttribute('inert'),true);assert.equal(document.querySelector('header').hasAttribute('inert'),true);assert.equal(document.querySelector('.page-heading'),null);
 assert.ok([...document.querySelectorAll('[role="dialog"]')].some(x=>/salat/i.test(x.textContent)));
 assert.equal(resumeRequests,0,'Opening a prayer pause must never auto-consent');
 await act(async()=>{controller.handlers.snapshot({...pausedRoom,phase:'resume_countdown',serverTime:roomTime+900000,prayerPause:{...pause,readyIds:['fast','slow'],resumeAt:roomTime+903000}});});
 assert.strictEqual(document.querySelector('iframe'),sameFrame);assert.equal(document.querySelector('main').hasAttribute('inert'),true,'Countdown must keep all game UI frozen');
 await act(async()=>{controller.handlers.snapshot({...pausedRoom,phase:'racing',serverTime:roomTime+903000,prayerPause:null});});
 assert.strictEqual(document.querySelector('iframe'),sameFrame);assert.equal(document.querySelector('main').hasAttribute('inert'),false);
 console.log('PASS room prayer pause preserves the arena iframe, blocks background controls, waits for the authoritative resumed phase');

 await act(async()=>{root.render(React.createElement(compiled.exports.RacePanel,{room:{phase:'loading',inviteCode:'TEST12',config:{circuit:'city',laps:3,bots:0,maxHumans:2},members:[{id:'fast',userId:user.id,name:'Cepat',host:true,ready:true,arenaReady:true,connected:true,loadout:profile.loadout},{id:'slow',userId:'slow-driver',name:'Lambat',host:false,ready:true,arenaReady:false,connected:true,loadout:profile.loadout}]},profile,status:'Tersambung',ping:25,busy:false,modelReady:true,onLeave(){}}));});
 assert.match(document.querySelector('.arena-loading-card').textContent,/1 \/ 2 perangkat siap/);assert.equal(document.querySelector('[role="progressbar"]').getAttribute('aria-valuenow'),'1');assert.match(document.querySelector('.room-members').textContent,/Arena siap/);assert.match(document.querySelector('.room-members').textContent,/Memuat arena/);assert.ok(![...document.querySelectorAll('button')].some(b=>b.textContent==='Mulai balapan'));
 console.log('PASS loading panel distinguishes lobby readiness from arena readiness and withholds start controls');
}finally{await act(async()=>root.unmount());await rm(temp,{recursive:true,force:true});}
