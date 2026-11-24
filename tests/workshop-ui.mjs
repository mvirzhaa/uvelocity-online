/** React interaction regression with a DOM and a scripted HTTP boundary.
 * No browser, WebGL, layout or genuine backend claim. Backend transactions are
 * independently covered against native PostgreSQL in services/__tests__.
 */
import assert from 'node:assert/strict';
import {mkdtemp,rm,readdir,readFile} from 'node:fs/promises';
import postcss from 'postcss';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {parseHTML} from 'linkedom';

const temp=await mkdtemp(join(tmpdir(),'uvelocity-ui-'));
const {window,document}=parseHTML('<html><body><div id="root"></div></body></html>');
document.oninput=null;
const local=new Map(),session=new Map(),storage=m=>({getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)});
let active=document.body;
Object.defineProperty(document,'activeElement',{get:()=>active});
window.HTMLElement.prototype.focus=function(){active=this;};
window.HTMLElement.prototype.blur=function(){active=document.body;};
// LinkeDOM has no audio engine; the separate media suite checks lifecycle calls.
window.HTMLElement.prototype.pause=function(){};
Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this.querySelector('option[selected]')?.value??this.querySelector('option')?.value??'';},set(value){for(const o of this.querySelectorAll('option'))o.toggleAttribute('selected',o.value===String(value));}});
const location={origin:'http://localhost:3000',protocol:'http:',hostname:'localhost',host:'localhost:3000',href:'http://localhost:3000/',reload(){}};
Object.assign(globalThis,{window,document,HTMLElement:window.HTMLElement,HTMLInputElement:window.HTMLInputElement,location,localStorage:storage(local),sessionStorage:storage(session),IS_REACT_ACT_ENVIRONMENT:true,requestAnimationFrame:()=>1,cancelAnimationFrame(){}});
window.location=location;window.localStorage=globalThis.localStorage;window.sessionStorage=globalThis.sessionStorage;
const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
const user={id:'driver-test',email:'driver@example.test',displayName:'Pembalap',avatarId:'driver-1',role:'admin',createdAt:new Date().toISOString()};
const car=(id,name,color,locked=true)=>({id,itemId:id,name,kind:'car',color,price:'100000',enabled:true,locked,catalogVersion:1,topSpeed:300,zeroTo100:3.6,handling:1});
let catalog={currency:'RP_GAME',currencyLabel:'Kredit game',rulesetVersion:'test',cars:[car('brz','Subaru BRZ','#2866b8'),car('bmw-m4-gt4','BMW M4 GT4','#eeeeee'),car('amg-gt4','Mercedes-AMG GT4','#aaaaaa',false),car('jesko-absolut','Koenigsegg Regera','#a9aeb5')],wheels:[{id:'stock',itemId:'stock',name:'Roda standar',price:'0',kind:'wheel',enabled:true,catalogVersion:1,color:'#c7cdd4'},{id:'six-spoke',itemId:'six-spoke',name:'Six Spoke',price:'20000',kind:'wheel',enabled:true,catalogVersion:1,color:'#c7cdd4'}],services:[['paint-body','Cat bodi','10000'],['paint-rims','Cat pelek','5000'],['stripe-paint','Ubah warna striping','5000'],['stripe-offset','Offset Sport','18000'],['stripe-twin-racing','Twin Racing','15000'],['stripe-remove','Lepas striping','5000']].map(([id,name,price])=>({id,itemId:id,name,price,kind:'service',enabled:true,catalogVersion:1,color:'#ffffff'}))};
catalog.cars[0].thumbnail={id:'12345678-1234-4234-8234-123456789abc',url:'/api/vehicle-thumbnails/12345678-1234-4234-8234-123456789abc',mimeType:'image/webp',bytes:12000,width:512,height:288};
const appearance=(id,color,owned=true)=>({carId:id,rimId:'stock',color,finish:'metallic',rimColor:'#c7cdd4',stockRimPainted:false,stripeId:'none',stripeColor:'#ffffff',version:'1',owned,canCustomize:owned});
let profile={user,wallet:{balance:'1000000',version:'1',currency:'RP_GAME'},inventory:{cars:['brz','bmw-m4-gt4'],wheels:['stock','six-spoke']},accessibleCars:['brz','bmw-m4-gt4','amg-gt4'],appearances:[appearance('brz','#2866b8'),appearance('bmw-m4-gt4','#eeeeee'),appearance('amg-gt4','#aaaaaa',false)],loadout:appearance('brz','#2866b8'),statistics:{races:0,wins:0,rewards:'0'}};
const calls=[],quotes=new Map(),applied=new Map();let disconnectAfterFirstCommit=true,chargeCount=0,nextProfileResponse=null,inviteLookup=null;
const copy=x=>structuredClone(x),ok=x=>new Response(JSON.stringify(x),{status:200,headers:{'Content-Type':'application/json'}}),fail=(code,message,status=409)=>new Response(JSON.stringify({error:{code,message}}),{status,headers:{'Content-Type':'application/json'}});
globalThis.fetch=async(url,options={})=>{
 const path=String(url).replace('/api',''),method=options.method??'GET',body=options.body?JSON.parse(options.body):{},key=options.headers?.['Idempotency-Key'];calls.push({path,method,body:copy(body),key});
 if(path==='/auth/me')return ok({user,csrfToken:'ui-test-csrf'});
 if(path==='/catalog')return ok(catalog);
 if(path.startsWith('/rooms/'))return inviteLookup?ok(inviteLookup):fail('ROOM_NOT_FOUND','Ruang tidak ditemukan.',404);
 if(path==='/profile'){if(nextProfileResponse){const pending=nextProfileResponse;nextProfileResponse=null;return pending;}return ok(profile);}
 if(path==='/presentation')return ok({version:1,garageMusic:null,loadingImage:null,musicVolume:.35});
 if(path==='/prayer/status'){
  const time=Date.now(),next={eventId:'ui-asr',prayer:'asr',name:'Asar',startedAt:new Date(time+3600000).toISOString(),resumesAt:new Date(time+4500000).toISOString()};
  return ok({enabled:true,allowed:true,paused:false,serverNow:new Date(time).toISOString(),localDate:new Date(time).toISOString().slice(0,10),pauseEndsAt:null,currentPrayer:null,nextPrayer:next,dailyTimes:[next],location:{mode:'fallback',cityId:'jakarta',label:'Jakarta (lokasi awal)',latitude:-6.2088,longitude:106.8456,timezone:'Asia/Jakarta',fallbackReason:null},calculation:{method:'location-20-18-v1',label:'Perhitungan lokasi 20/18 · ihtiyat 2 menit',fajrAngle:20,ishaAngle:18,adjustmentMinutes:2,rounding:'up',madhab:'Shafi',official:false},message:'Jadwal mengikuti lokasi akun.'});
 }
 if(path==='/prayer/locations')return ok({locations:[{id:'jakarta',name:'Jakarta',province:'DKI Jakarta',latitude:-6.2088,longitude:106.8456,timezone:'Asia/Jakarta'}]});
 if(path.startsWith('/wallet/transactions'))return ok({entries:[]});
 if(path==='/garage/appearance/quote'){
  const current=profile.appearances.find(a=>a.carId===body.carId);assert.ok(current?.owned);const selection={...current,...body};let lines=[];
  if(selection.rimId!=='stock')selection.stockRimPainted=current.stockRimPainted===true;
  else if(!selection.stockRimPainted)selection.rimColor=current.rimColor;
  if(selection.stripeId==='none')selection.stripeColor=current.stripeColor;
  const service=id=>catalog.services.find(item=>item.id===id);
  if(selection.color!==current.color||selection.finish!==current.finish)lines.push(service('paint-body'));
  if((selection.rimId==='stock'&&selection.stockRimPainted!==(current.stockRimPainted===true))||((selection.rimId!=='stock'||selection.stockRimPainted)&&selection.rimColor!==current.rimColor))lines.push(service('paint-rims'));
  if(selection.stripeId!==current.stripeId)lines.push(service(selection.stripeId==='none'?'stripe-remove':'stripe-'+selection.stripeId));
  else if(selection.stripeId!=='none'&&selection.stripeColor!==current.stripeColor)lines.push(service('stripe-paint'));
  if(lines.some(item=>!item?.enabled))return fail('SERVICE_UNAVAILABLE','Layanan warna tidak tersedia.');
  const quote={quoteId:'quote-'+(quotes.size+1),carId:body.carId,appearanceVersion:current.version,selection,lineItems:lines.map(s=>({itemId:s.id,name:s.name,price:s.price,catalogVersion:s.catalogVersion})),total:lines.reduce((n,s)=>n+BigInt(s.price),0n).toString(),wallet:copy(profile.wallet),affordable:true,noOp:false,expiresAt:new Date(Date.now()+600000).toISOString()};quotes.set(quote.quoteId,quote);return ok(quote);
 }
 if(path==='/garage/appearance/apply'){
  assert.ok(key);if(applied.has(key))return ok(applied.get(key));const quote=quotes.get(body.quoteId);assert.ok(quote);if(quote.lineItems.some(line=>catalog.services.find(item=>item.id===line.itemId)?.catalogVersion!==line.catalogVersion))return fail('CATALOG_CHANGED','Tarif layanan sudah berubah. Perbarui rincian biaya.');const current=profile.appearances.find(item=>item.carId===quote.carId),next={...quote.selection,version:String(+current.version+1),owned:true,canCustomize:true};profile.appearances=profile.appearances.map(a=>a.carId===next.carId?next:a);profile.loadout=next;profile.wallet={...profile.wallet,balance:(BigInt(profile.wallet.balance)-BigInt(quote.total)).toString(),version:String(+profile.wallet.version+1)};chargeCount++;
  const response={applicationId:'apply-'+chargeCount,appearance:next,loadout:next,wallet:copy(profile.wallet),pricePaid:quote.total,lineItems:quote.lineItems,noOp:false};applied.set(key,response);if(disconnectAfterFirstCommit){disconnectAfterFirstCommit=false;throw new Error('Scripted lost response after commit');}return ok(response);
 }
 if(path==='/loadout'){
  assert.deepEqual(Object.keys(body).sort(),['carId','rimId'],'Free equip must not submit unpaid cosmetic fields');const current=profile.appearances.find(a=>a.carId===body.carId);assert.ok(current);profile.loadout={...current,rimId:body.rimId};return ok({loadout:profile.loadout});
 }
 if(path==='/shop/purchase'){
  const item=catalog.cars.find(value=>value.id===body.itemId);assert.ok(item);assert.equal(body.catalogVersion,item.catalogVersion);assert.ok(key);assert.ok(!profile.inventory.cars.includes(item.id));
  profile.inventory={...profile.inventory,cars:[...profile.inventory.cars,item.id]};profile.accessibleCars=[...new Set([...profile.accessibleCars,item.id])];profile.appearances=[...profile.appearances.filter(value=>value.carId!==item.id),appearance(item.id,item.color)];profile.wallet={...profile.wallet,balance:(BigInt(profile.wallet.balance)-BigInt(item.price)).toString(),version:String(+profile.wallet.version+1)};
  return ok({purchased:true,wallet:profile.wallet});
 }
 if(path.startsWith('/admin/catalog/')&&method==='PATCH'){
  const id=path.slice('/admin/catalog/'.length),service=catalog.services.find(item=>item.id===id);assert.ok(service);assert.equal(body.expectedVersion,service.catalogVersion);assert.ok(body.reason.length>=4);assert.equal(body.locked,undefined,'Color service edits do not change vehicle access');
  const next={...service,price:body.price,enabled:body.enabled,catalogVersion:service.catalogVersion+1};catalog={...catalog,services:catalog.services.map(item=>item.id===id?next:item)};return ok(next);
 }
 if(path==='/admin/media')return ok({settings:{version:1,garageMusic:null,loadingImage:null,musicVolume:.35},assets:[],limits:{garageMusicBytes:20971520,loadingImageBytes:10485760,maxAssets:40,totalBytes:262144000}});
 if(path.startsWith('/admin/users'))return ok({users:[]});
 if(path.startsWith('/admin/audit'))return ok({entries:[]});
 if(path==='/admin/tuning')return ok({version:'1',bounds:{topSpeed:{min:100,max:450},zeroTo100:{min:1,max:12},handling:{min:.5,max:1.5}},cars:catalog.cars.map(c=>({carId:c.id,topSpeed:300,zeroTo100:3.6,handling:1})),rewardPolicy:{finish:'10000',perLap:'1000',podium:['15000','8000','4000'],minimumDurationMs:15000,maximum:'50000'},physics:{}});
 if(path==='/admin/vehicle-categories')return ok({categories:catalog.categories??[]});
 if(path==='/admin/vehicle-thumbnails')return ok({cars:catalog.cars.map(item=>({carId:item.id,version:1,thumbnail:item.thumbnail??null})),limits:{inputBytes:4194304,inputPixels:16000000,maxWidth:512,maxHeight:288,outputBytes:524288,acceptedMimeTypes:['image/jpeg','image/png','image/webp']}});
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
const change=async(node,value)=>{assert.ok(node);await act(async()=>{let prototype=Object.getPrototypeOf(node),descriptor;while(prototype&&!descriptor){descriptor=Object.getOwnPropertyDescriptor(prototype,'value');prototype=Object.getPrototypeOf(prototype);}if(descriptor?.set)descriptor.set.call(node,value);else node.value=value;node.dispatchEvent(new window.Event('input',{bubbles:true}));node.dispatchEvent(new window.Event('change',{bubbles:true}));});};
const check=async(node,value)=>{assert.ok(node);await act(async()=>{let prototype=Object.getPrototypeOf(node),descriptor;while(prototype&&!descriptor){descriptor=Object.getOwnPropertyDescriptor(prototype,'checked');prototype=Object.getPrototypeOf(prototype);}if(descriptor?.set)descriptor.set.call(node,value);else node.checked=value;node.dispatchEvent(new window.Event('click',{bubbles:true}));});};
const submit=async form=>{assert.ok(form);await act(async()=>{form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await new Promise(resolve=>setTimeout(resolve,5));});};
const rimSwatch=value=>document.querySelector('[aria-label="Cat pelek '+value.toUpperCase()+'"]');
const stripeSwatch=value=>document.querySelector('[aria-label="Cat striping '+value.toUpperCase()+'"]');
const latestQuote=()=>[...quotes.values()].at(-1);
const saved=id=>profile.appearances.find(item=>item.carId===id);
const carButton=id=>{const name=catalog.cars.find(c=>c.id===id).name;const b=[...document.querySelectorAll('.car-choice')].find(x=>x.querySelector('b')?.textContent===name);assert.ok(b);return b;};
const carNames=()=>[...document.querySelectorAll('.car-choice>b')].map(node=>node.textContent);
const mutations=()=>calls.filter(call=>call.method!=='GET');
const previews=[],cameraPresets=[];
const nativeTimeout=globalThis.setTimeout,nativeClearTimeout=globalThis.clearTimeout;
const splashTimers=new Map();let splashId=0;
globalThis.setTimeout=(callback,delay,...args)=>{if(delay!==3000)return nativeTimeout(callback,delay,...args);const id=--splashId;splashTimers.set(id,()=>callback(...args));return id;};
globalThis.clearTimeout=id=>{if(!splashTimers.delete(id))nativeClearTimeout(id);};
const finishSplash=async()=>{await act(async()=>{for(const [id,callback] of [...splashTimers]){splashTimers.delete(id);callback();}});await settle();};

try{
 await act(async()=>{root.render(React.createElement(App));});await settle();await finishSplash();
 assert.equal(document.querySelectorAll('.car-choice').length,2,'Garage shows permanently owned vehicles only');
 const headingActions=document.querySelector('.page-toolbar .garage-actions');assert.ok(headingActions,'Garage actions remain on the compact top toolbar');assert.equal(headingActions.querySelector('.primary').disabled,true,'The active saved car is not re-equipped');assert.equal([...document.querySelectorAll('button')].filter(node=>node.textContent==='Masuk ke ruang balap').length,1,'The room action has no duplicate below the preview');assert.ok(headingActions.contains(button('Masuk ke ruang balap')));
 const renderFrame=document.querySelector('iframe'),fakeGame={ready:Promise.resolve(),on(){return()=>{};},setVisible(){},setMuted(){},configure:async()=>{},preview:async loadout=>{previews.push(copy(loadout));},stopRace:async()=>{},pause:async()=>{},resume:async()=>{},setCamera:async name=>{cameraPresets.push(name);},focus(){}};
 Object.defineProperty(renderFrame,'contentWindow',{value:{NVGame:fakeGame},configurable:true});await act(async()=>renderFrame.dispatchEvent(new window.Event('load')));await settle();
 assert.deepEqual(carNames(),['Subaru BRZ','BMW M4 GT4']);assert.match(document.querySelector('.vehicle-browse-navigation').textContent,/1 \/ 2/);
 assert.ok(document.querySelector('.stage-viewport iframe'));assert.equal(document.querySelector('.stage-viewport .stage-caption'),null,'Vehicle names are outside the 3D viewport for the mobile CSS flow');await click(document.querySelector('[aria-label="Tampilan samping"]'));assert.equal(document.querySelector('[aria-label="Tampilan samping"]').getAttribute('aria-pressed'),'true');assert.equal(cameraPresets.at(-1),'side');await click(document.querySelector('[aria-label="Tampilan depan"]'));
 console.log('PASS vehicle caption is separate from the 3D viewport and active camera presets operate the existing game API');
 assert.equal(document.querySelectorAll('.car-choice [data-car-thumbnail]').length,2);assert.equal(document.querySelector('.car-choice [data-car-thumbnail="brz"] img').getAttribute('src'),catalog.cars[0].thumbnail.url);assert.ok(document.querySelector('.car-choice [data-car-thumbnail="bmw-m4-gt4"] .vehicle-thumbnail-fallback'));
 await clickText('Sebelumnya');assert.equal(previews.at(-1).carId,'bmw-m4-gt4');assert.equal(previews.at(-1).color,'#eeeeee');assert.match(document.querySelector('.vehicle-browse-navigation').textContent,/2 \/ 2/);
 await clickText('Berikutnya');assert.equal(previews.at(-1).carId,'brz');assert.equal(profile.loadout.carId,'brz');assert.equal(mutations().length,0);
 await clickText('Showroom');assert.equal(carNames().length,4);assert.ok(carNames().includes('Mercedes-AMG GT4'));assert.ok(carNames().includes('Koenigsegg Regera'));
 await clickText('Sebelumnya');assert.equal(previews.at(-1).carId,'jesko-absolut');await clickText('Berikutnya');assert.equal(previews.at(-1).carId,'brz');
 await click(carButton('amg-gt4'));await clickText('Garasi');assert.equal(previews.at(-1).carId,'brz');assert.deepEqual(carNames(),['Subaru BRZ','BMW M4 GT4']);assert.equal(mutations().length,0,'Browsing never equips, purchases or debits');assert.strictEqual(document.querySelector('iframe'),renderFrame);
 console.log('PASS owned-only Garage, complete Showroom, previous/next wrap, saved previews and no mutations while browsing');

 assert.equal(document.querySelector('.page-heading'),null);assert.equal(document.querySelector('main>h1').className,'sr-only');
 assert.ok(document.querySelector('.scene-tools-column>.page-tools'));assert.equal(document.querySelector('.scene-toolbar').nextElementSibling.classList.contains('content-grid'),true);
 const compactBaseCatalog=copy(catalog),compactBaseLoadout=copy(profile.loadout),compactBefore=mutations().length;
 const categoryOf=id=>id==='brz'||id==='skyline'?'sport':id==='bmw-m4-gt4'||id==='amg-gt4'?'race':'other';
 catalog={...catalog,categories:[{id:'sport',name:'Sport',sortOrder:10,version:1},{id:'race',name:'Mobil balap',sortOrder:20,version:1},{id:'other',name:'Lainnya',sortOrder:30,version:1},{id:'empty',name:'SUV',sortOrder:40,version:1}],cars:[...catalog.cars,car('skyline','Nissan Skyline','#123456'),car('cinder','Cinder V8','#222222'),car('kaze','Kaze Rally','#eeeeee'),car('panther-grand-touring','Isuzu Panther Grand Touring','#19252e'),car('aventador','Lamborghini Aventador','#123456')].map(item=>({...item,categoryId:categoryOf(item.id)}))};
 await clickText('Showroom');assert.equal(carNames().length,4);assert.match(document.querySelector('.collection-range').textContent,/1–4.*9 kendaraan/);
 assert.equal(document.querySelector('.collection-previous').disabled,true);const previewBeforePaging=previews.length;
 await click(document.querySelector('.collection-next'));assert.equal(carNames().length,4);assert.match(document.querySelector('.collection-range').textContent,/5–8/);assert.equal(previews.length,previewBeforePaging,'Paging cards alone cannot change the 3D selection');
 await click(document.querySelector('.collection-next'));assert.deepEqual(carNames(),['Lamborghini Aventador']);assert.equal(document.querySelector('.collection-next').disabled,true);assert.equal(previews.length,previewBeforePaging);
 await click(carButton('aventador'));assert.equal(previews.at(-1).carId,'aventador');assert.deepEqual(profile.loadout,compactBaseLoadout);await clickText('Sebelumnya');assert.equal(previews.at(-1).carId,'panther-grand-touring');assert.equal(carNames().length,4);assert.ok(carNames().includes('Isuzu Panther Grand Touring'),'Previous model navigation reveals the selected card page');
 console.log('PASS compact toolbar, four-card pages, bounded arrows and selected-card synchronization without automatic equip');
 await change(document.querySelector('#showroom-category'),'race');assert.deepEqual(carNames(),['BMW M4 GT4','Mercedes-AMG GT4']);assert.equal(previews.at(-1).carId,'bmw-m4-gt4');assert.match(document.querySelector('.category-result-count').textContent,/2 kendaraan/);assert.equal(document.querySelector('.collection-next').disabled,true);
 await clickText('Sebelumnya');assert.equal(previews.at(-1).carId,'amg-gt4');await clickText('Berikutnya');assert.equal(previews.at(-1).carId,'bmw-m4-gt4');assert.ok([...document.querySelectorAll('.vehicle-category-label')].every(item=>item.textContent==='Mobil balap'));
 await change(document.querySelector('#showroom-category'),'empty');assert.equal(carNames().length,0);assert.match(document.querySelector('.garage-empty').textContent,/Belum ada kendaraan di kategori ini/);assert.equal(document.querySelector('.stage-panel').classList.contains('stage-hidden'),true);assert.strictEqual(document.querySelector('iframe'),renderFrame);
 await clickText('Lihat semua kendaraan');assert.equal(carNames().length,4);assert.equal(document.querySelector('#showroom-category').value,'all');
 await change(document.querySelector('#showroom-category'),'race');await clickText('Garasi');assert.deepEqual(carNames(),['Subaru BRZ','BMW M4 GT4'],'Showroom category filter cannot hide owned Garage vehicles');await clickText('Showroom');assert.equal(document.querySelector('#showroom-category').value,'race');assert.equal(carNames().length,2);
 catalog={...catalog,categories:catalog.categories.filter(item=>item.id!=='race'),cars:catalog.cars.map(item=>item.categoryId==='race'?{...item,categoryId:null}:item)};await clickText('Showroom');assert.equal(document.querySelector('#showroom-category').value,'all','A category removed by admin safely resets the filter');
 await change(document.querySelector('#showroom-category'),'uncategorized');assert.deepEqual(carNames(),['BMW M4 GT4','Mercedes-AMG GT4']);assert.equal(mutations().length,compactBefore);assert.deepEqual(profile.loadout,compactBaseLoadout);assert.strictEqual(document.querySelector('iframe'),renderFrame);
 catalog=compactBaseCatalog;await clickText('Showroom');await change(document.querySelector('#showroom-category'),'all');await clickText('Garasi');await click(carButton('brz'));
 console.log('PASS category-filtered cards and model navigation, empty/unassigned categories, admin refresh, and ownership invariants');

 const finishCatalog=copy(catalog),finishProfile=copy(profile),finishMutations=mutations().length;
 catalog={...catalog,cars:[
  {...car('batmobile-tumbler','Batmobile Tumbler · The Dark Knight','#202329'),finish:'matte'},
  {...car('knight-rider-kitt','Pontiac Knight Rider 1983 · KITT','#10141a'),finish:'gloss'},
  ...catalog.cars.map(item=>item.id==='bmw-m4-gt4'?{...item,finish:'matte'}:item),
 ]};
 await clickText('Showroom');await click(carButton('batmobile-tumbler'));
 assert.equal(previews.at(-1).carId,'batmobile-tumbler');assert.equal(previews.at(-1).finish,'matte');assert.equal(previews.at(-1).color,'#202329');
 await click(carButton('knight-rider-kitt'));assert.equal(previews.at(-1).finish,'gloss');assert.equal(previews.at(-1).color,'#10141a');
 await click(carButton('bmw-m4-gt4'));assert.equal(previews.at(-1).finish,saved('bmw-m4-gt4').finish,'Saved owner paint takes priority over a different factory finish');
 await click(document.querySelector('.collection-next'));await click(carButton('jesko-absolut'));assert.equal(previews.at(-1).finish,'metallic','Legacy offers without a finish retain the historical default');
 assert.deepEqual(profile,finishProfile);assert.equal(mutations().length,finishMutations,'Showroom factory finishes never buy, equip, or repaint a vehicle');
 catalog=finishCatalog;await clickText('Garasi');await click(carButton('brz'));
 console.log('PASS unowned Tumbler and KITT preview their matte/gloss factory finishes, saved paint has priority, and legacy defaults remain metallic without mutations');

 const beforePhotoRefresh=previews.length,priorOffer={price:catalog.cars[0].price,locked:catalog.cars[0].locked,catalogVersion:catalog.cars[0].catalogVersion},newPhotoId='87654321-4321-4321-8321-123456789abc';
 catalog={...catalog,cars:catalog.cars.map(item=>item.id==='brz'?{...item,thumbnail:{...item.thumbnail,id:newPhotoId,url:'/api/vehicle-thumbnails/'+newPhotoId}}:item)};await clickText('Garasi');
 assert.equal(document.querySelector('[data-car-thumbnail="brz"] img').getAttribute('src'),'/api/vehicle-thumbnails/'+newPhotoId);assert.equal(previews.length,beforePhotoRefresh,'A photo refresh cannot reset the 3D preview');assert.equal(mutations().length,0);assert.equal(profile.loadout.carId,'brz');assert.deepEqual({price:catalog.cars[0].price,locked:catalog.cars[0].locked,catalogVersion:catalog.cars[0].catalogVersion},priorOffer);
 console.log('PASS collection photo refresh updates its immutable image without resetting 3D, prices, access or active loadout');
 await click(document.querySelector('[aria-label="Cat #a92d3b"]'));assert.equal(chargeCount,0);assert.equal(calls.filter(c=>c.path.endsWith('/apply')).length,0);
 await clickText('Tinjau biaya & pasang');assert.equal(document.querySelectorAll('.appearance-review').length,1);assert.equal(chargeCount,0);await clickText('Bayar Rp10.000 & pasang');
 assert.equal(chargeCount,1);assert.ok(document.querySelector('.appearance-review [role="alert"]'));await clickText('Coba pemasangan lagi');
 assert.equal(chargeCount,1);const retries=calls.filter(c=>c.path.endsWith('/apply'));assert.equal(retries[0].key,retries[1].key);assert.equal(document.querySelectorAll('.appearance-review').length,0);
 assert.equal(profile.wallet.balance,'990000');assert.equal(profile.loadout.color,'#a92d3b');
 console.log('PASS paid preview, explicit confirmation, lost-response retry with stable key');
 await click(carButton('bmw-m4-gt4'));assert.equal([...document.querySelectorAll('button')].filter(node=>node.textContent==='Pakai mobil ini').length,1);assert.ok(document.querySelector('.page-toolbar .garage-actions').contains(button('Pakai mobil ini')));await clickText('Pakai mobil ini');assert.equal(profile.loadout.carId,'bmw-m4-gt4','The top toolbar action equips the selected saved car');await click(carButton('brz'));
 assert.equal(document.querySelector('[aria-label="Cat #a92d3b"]').getAttribute('aria-pressed'),'true');await clickText('Pakai mobil ini');assert.equal(chargeCount,1);
 console.log('PASS switching owned cars restores their saved paint without another payment');
 await click(carButton('bmw-m4-gt4'));const stripe=[...document.querySelectorAll('.stripe-card')].find(x=>x.querySelector('b')?.textContent==='Twin Racing');await click(stripe);await clickText('Tinjau biaya & pasang');await clickText('Bayar Rp15.000 & pasang');assert.equal(profile.loadout.stripeId,'twin-racing');assert.equal(profile.wallet.balance,'975000');
 const beforeBrowse=mutations().length;await clickText('Sebelumnya');assert.equal(previews.at(-1).carId,'brz');assert.equal(previews.at(-1).color,'#a92d3b');assert.equal(previews.at(-1).stripeId,'none');await clickText('Berikutnya');assert.equal(previews.at(-1).stripeId,'twin-racing');assert.equal(mutations().length,beforeBrowse,'Carousel restores saved cosmetics without another purchase');
 console.log('PASS paid striping quote carries selected design and persists applied appearance');
 await clickText('Showroom');await click(carButton('amg-gt4'));await click(document.querySelector('[aria-label="Cat #a92d3b"]'));await clickText('Gunakan selama dibuka');assert.equal(profile.loadout.color,'#aaaaaa');assert.equal(chargeCount,2);assert.equal(document.querySelectorAll('.appearance-review').length,0);
 const beforeFallback=mutations().length;await clickText('Garasi');assert.equal(previews.at(-1).carId,'brz');assert.equal(document.querySelector('.mini-garage b').textContent,'Mercedes-AMG GT4');assert.equal(profile.loadout.carId,'amg-gt4');assert.equal(mutations().length,beforeFallback);assert.deepEqual(carNames(),['Subaru BRZ','BMW M4 GT4']);
 await clickText('Bengkel');assert.equal(document.querySelector('.vehicle-panel select').value,'brz','Workshop must fall back to a permanently owned vehicle');
 console.log('PASS temporary access equips factory appearance and workshop chooses permanent ownership');

 await clickText('Showroom');await click(carButton('jesko-absolut'));await clickText('Beli akses permanen');assert.ok(profile.inventory.cars.includes('jesko-absolut'));assert.equal(profile.wallet.balance,'875000');assert.equal(profile.loadout.carId,'amg-gt4');await clickText('Garasi');assert.equal(carNames().length,3);assert.ok(carNames().includes('Koenigsegg Regera'));assert.equal(previews.at(-1).carId,'jesko-absolut');
 const allCars=catalog.cars,ownedAfterBuy=[...profile.inventory.cars],beforeListRefresh=mutations().length;
 catalog={...catalog,cars:allCars.filter(item=>item.id!=='jesko-absolut')};await clickText('Garasi');assert.equal(previews.at(-1).carId,'brz');assert.equal(carNames().length,2,'Catalog refresh cannot leave an unavailable selection');catalog={...catalog,cars:allCars};
 profile={...profile,inventory:{...profile.inventory,cars:['brz']}};await clickText('Garasi');assert.equal(carNames().length,1);assert.equal(button('Sebelumnya').disabled,true);assert.equal(button('Berikutnya').disabled,true);
 profile={...profile,inventory:{...profile.inventory,cars:[]}};await clickText('Garasi');assert.equal(carNames().length,0);assert.match(document.querySelector('.garage-empty').textContent,/Garasi Anda masih kosong/);assert.match(document.querySelector('.vehicle-browse-navigation').textContent,/0 \/ 0/);assert.equal(button('Sebelumnya').disabled,true);assert.equal(document.querySelector('.stage-panel').classList.contains('stage-hidden'),true);assert.strictEqual(document.querySelector('iframe'),renderFrame);
 await clickText('Buka showroom');assert.equal(carNames().length,4);profile={...profile,inventory:{...profile.inventory,cars:ownedAfterBuy}};await clickText('Garasi');assert.equal(carNames().length,3);assert.equal(mutations().length,beforeListRefresh);
 console.log('PASS explicit acquisition refreshes Garage immediately; catalog changes, one-car and empty collections keep safe previews and active loadout');

 await click(carButton('jesko-absolut'));let releaseProfile;nextProfileResponse=new Promise(resolve=>{releaseProfile=resolve;});await clickText('Garasi');const beforeArena=previews.length,arenaTime=Date.now();
 const loadingRoom={protocol:1,roomId:'garage-loading',raceId:'garage-race',phase:'loading',startToken:'garage-attempt',loadingDeadline:arenaTime+45000,serverTime:arenaTime,inviteCode:'GARAGE',config:{circuit:'city',laps:1,bots:0,maxHumans:1},prayerPause:null,members:[{id:'fast',userId:user.id,name:'Pembalap',host:true,connected:true,ready:true,arenaReady:false,loadout:profile.loadout}],racers:[]};
 await act(async()=>controller.handlers.snapshot(loadingRoom));profile={...profile,inventory:{...profile.inventory,cars:['brz']}};await act(async()=>releaseProfile(ok(profile)));await settle();assert.equal(previews.length,beforeArena,'Inventory changes during arena loading cannot trigger a garage preview');assert.strictEqual(document.querySelector('iframe'),renderFrame);assert.equal(document.querySelector('.vehicle-browse-navigation'),null);
 const inventoryPause={pauseToken:'inventory-pause',startedAt:arenaTime,resumeEligibleAt:arenaTime+900000,resumeAt:null,previousPhase:'loading',triggers:[{eventId:'inventory-asr',userId:user.id,displayName:'Pembalap',prayer:'asr',name:'Asar',startedAt:arenaTime,resumesAt:arenaTime+900000}],requiredIds:['fast'],readyIds:[]};
 await act(async()=>controller.handlers.snapshot({...loadingRoom,phase:'prayer_pause',prayerPause:inventoryPause}));assert.equal(previews.length,beforeArena);assert.equal(document.querySelector('main').hasAttribute('inert'),true);
 await act(async()=>controller.handlers.snapshot({...loadingRoom,phase:'racing',prayerPause:null}));assert.equal(previews.length,beforeArena);await act(async()=>controller.handlers.left());await settle();assert.equal(previews.at(-1).carId,'brz');assert.equal(profile.loadout.carId,'amg-gt4');assert.equal(carNames().length,1);
 profile={...profile,inventory:{...profile.inventory,cars:ownedAfterBuy}};await clickText('Garasi');
 console.log('PASS delayed inventory refresh cannot reset loading/racing/prayer arena; local fallback waits until returning to Garage');

 await clickText('Bengkel');assert.equal(document.querySelector('[aria-label="Pilih warna pelek"]').disabled,false,'Stock rims expose the color picker');assert.match(document.querySelector('.rim-color-studio').textContent,/Finishing pabrik/);assert.equal(rimSwatch('#c7cdd4').getAttribute('aria-pressed'),'false','Factory materials do not pretend to be painted silver');
 assert.equal(document.querySelector('[aria-label="Pilih warna striping"]').disabled,true,'A vehicle without stripes cannot change an invisible stripe color');
 const beforeStock=mutations().length,balanceBeforeStock=BigInt(profile.wallet.balance),applicationsBeforeStock=chargeCount;await click(rimSwatch('#c7cdd4'));assert.equal(previews.at(-1).stockRimPainted,true);assert.equal(previews.at(-1).rimColor,'#c7cdd4');assert.equal(mutations().length,beforeStock);assert.equal(chargeCount,applicationsBeforeStock);
 await clickText('Tinjau biaya & pasang');assert.equal(latestQuote().selection.stockRimPainted,true);assert.deepEqual(latestQuote().lineItems.map(item=>item.itemId),['paint-rims']);assert.match(document.querySelector('.appearance-summary').textContent,/Pelek standar dicat/);assert.equal(chargeCount,applicationsBeforeStock);await clickText('Bayar Rp5.000 & pasang');assert.equal(saved('brz').stockRimPainted,true);assert.equal(BigInt(profile.wallet.balance),balanceBeforeStock-5000n);
 const afterStock=mutations().length;await clickText('Gunakan finishing pabrik');assert.equal(previews.at(-1).stockRimPainted,false);await click([...document.querySelectorAll('.wheel-card')].find(item=>item.querySelector('b')?.textContent==='Six Spoke'));assert.equal(previews.at(-1).stockRimPainted,true,'Changing a custom wheel cannot carry an unpaid factory-flag toggle');await click([...document.querySelectorAll('.wheel-card')].find(item=>item.querySelector('b')?.textContent==='Roda standar'));assert.equal(previews.at(-1).stockRimPainted,true);await clickText('Garasi');await clickText('Berikutnya');assert.equal(previews.at(-1).stockRimPainted,false);await clickText('Sebelumnya');assert.equal(previews.at(-1).stockRimPainted,true);assert.equal(mutations().length,afterStock,'Wheel/car browsing preserves saved paint without an implicit payment');
 console.log('PASS stock rims paint explicitly even at the default RGB, review one fee, persist per car and preserve factory state when browsing custom wheels');

 await clickText('Bengkel');await click(rimSwatch('#d3ad56'));await clickText('Tinjau biaya & pasang');await clickText('Bayar Rp5.000 & pasang');assert.equal(saved('brz').rimColor,'#d3ad56');const beforeRestore=chargeCount,restoreBalance=BigInt(profile.wallet.balance);await clickText('Gunakan finishing pabrik');assert.equal(previews.at(-1).stockRimPainted,false);assert.equal(chargeCount,beforeRestore);await clickText('Tinjau biaya & pasang');assert.equal(latestQuote().selection.stockRimPainted,false);assert.equal(latestQuote().selection.rimColor,'#d3ad56','Factory restoration preserves the saved paint RGB');assert.deepEqual(latestQuote().lineItems.map(item=>item.itemId),['paint-rims']);assert.match(document.querySelector('.appearance-summary').textContent,/Pelek standar · finishing pabrik/);await clickText('Bayar Rp5.000 & pasang');assert.equal(saved('brz').stockRimPainted,false);assert.equal(saved('brz').rimColor,'#d3ad56');assert.equal(BigInt(profile.wallet.balance),restoreBalance-5000n);
 const beforeFactoryEquip=chargeCount;await click([...document.querySelectorAll('.wheel-card')].find(item=>item.querySelector('b')?.textContent==='Six Spoke'));assert.equal(previews.at(-1).stockRimPainted,false);await clickText('Pakai mobil ini');assert.equal(profile.loadout.stockRimPainted,false);await click([...document.querySelectorAll('.wheel-card')].find(item=>item.querySelector('b')?.textContent==='Roda standar'));await clickText('Pakai mobil ini');assert.equal(profile.loadout.stockRimPainted,false);assert.equal(chargeCount,beforeFactoryEquip,'Owned wheel swaps never charge again or enable stock paint');
 console.log('PASS stock factory restoration is quoted and paid, retains prior RGB and survives free owned wheel swaps');

 await clickText('Garasi');await click(carButton('bmw-m4-gt4'));assert.equal(document.querySelector('[aria-label="Pilih warna striping"]').disabled,false);assert.match(document.querySelector('.stripe-color-fee').textContent,/Ganti warna.*Rp5.000/);const beforeStripeRecolor=mutations().length;await click(stripeSwatch('#c33b48'));assert.equal(mutations().length,beforeStripeRecolor);await clickText('Tinjau biaya & pasang');assert.deepEqual(latestQuote().lineItems.map(item=>item.itemId),['stripe-paint']);assert.equal(latestQuote().selection.stripeColor,'#c33b48');assert.match(document.querySelector('.appearance-summary').textContent,/Warna striping · #C33B48/);await clickText('Bayar Rp5.000 & pasang');assert.equal(saved('bmw-m4-gt4').stripeColor,'#c33b48');
 await click([...document.querySelectorAll('.stripe-card')].find(item=>item.querySelector('b')?.textContent==='Offset Sport'));await click(stripeSwatch('#d3ad56'));assert.match(document.querySelector('.stripe-color-fee').textContent,/Desain baru.*Rp18.000.*termasuk warna/);await clickText('Tinjau biaya & pasang');assert.deepEqual(latestQuote().lineItems.map(item=>item.itemId),['stripe-offset'],'New design includes the chosen color without a second paint service');await clickText('Bayar Rp18.000 & pasang');assert.equal(saved('bmw-m4-gt4').stripeId,'offset');assert.equal(saved('bmw-m4-gt4').stripeColor,'#d3ad56');await click([...document.querySelectorAll('.stripe-card')].find(item=>item.querySelector('b')?.textContent==='Tanpa striping'));assert.equal(document.querySelector('[aria-label="Pilih warna striping"]').disabled,true);assert.equal(stripeSwatch('#ffffff').disabled,true);await clickText('Kembalikan tampilan tersimpan');
 console.log('PASS same-design recolor uses its separate fee; a new design includes color once and no-pattern color controls are disabled');

 await clickText('Admin');
 // Regression for the shipped hidden-admin-header bug: DOM interactions alone
 // can click an element inside display:none, so inspect hiding selectors from
 // the real stylesheets against the rendered navigation and all its ancestors.
 const adminNav=document.querySelector('nav[aria-label="Bagian administrator"]');assert.ok(adminNav);
 assert.equal(adminNav.querySelectorAll('button').length,8);
 const ancestors=[...adminNav.querySelectorAll('button')];for(let node=adminNav;node;node=node.parentElement)ancestors.push(node);
 for(const node of ancestors){assert.equal(node.hasAttribute('hidden'),false);assert.equal(node.hasAttribute('inert'),false);assert.notEqual(node.style.display,'none');assert.notEqual(node.style.visibility,'hidden');}
 for(const filename of (await readdir('client/src')).filter(name=>name.endsWith('.css'))){
  const css=postcss.parse(await readFile('client/src/'+filename,'utf8'));
  css.walkRules(rule=>{
   if(!rule.nodes?.some(decl=>decl.type==='decl'&&((decl.prop==='display'&&decl.value==='none')||(decl.prop==='visibility'&&decl.value==='hidden'))))return;
   for(const selector of rule.selectors.filter(selector=>!selector.includes('::')))for(const node of ancestors){
    assert.equal(node.matches(selector),false,filename+' hides the admin navigation via '+selector);
   }
  });
 }
 const beforeAdminBrowse=mutations().length;
 for(const [label,selector,text] of [
  ['Performa mobil','.admin-view .panel','Performa mobil'],
  ['Harga & toko','.admin-view .panel','Akses kendaraan & harga toko'],
  ['Hadiah balapan','.admin-view .panel','Hadiah balapan'],
  ['Musik & loading','.admin-media','Musik & halaman loading'],
  ['Foto kendaraan','.vehicle-image-editor','Foto kendaraan'],
  ['Kategori kendaraan','.vehicle-categories-admin','Kategori kendaraan'],
  ['Riwayat admin','.admin-view .panel','Riwayat administrator'],
  ['Pemain & kredit','.admin-view .panel','Pemain']
 ]){
  await clickText(label);assert.ok(document.querySelector(selector),'Admin section unavailable: '+label);
  assert.match(document.querySelector(selector).textContent,new RegExp(text,'i'));
  assert.equal(document.querySelector(selector).querySelector('[role="alert"]'),null,'Admin section loaded without an error: '+label);
  assert.equal(adminNav.querySelectorAll('[aria-pressed="true"]').length,1);
  assert.equal(button(label).getAttribute('aria-pressed'),'true');
 }
 assert.equal(mutations().length,beforeAdminBrowse,'Changing admin sections must not change settings or balances');
 const adminCss=await readFile('client/src/vehicle-categories.css','utf8');
 assert.match(adminCss,/@media\(max-width:600px\)[\s\S]*?\.admin-toolbar \.admin-section-nav\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/,'Narrow-screen navigation retains all sections in two columns');
 console.log('PASS all eight admin sections remain reachable, no stylesheet hides their navigation, and mobile uses a two-column menu without mutations');
 await clickText('Harga & toko');assert.equal(document.querySelectorAll('[data-color-service]').length,3);for(const [id,price] of [['paint-body','10000'],['paint-rims','5000'],['stripe-paint','5000']]){await click(document.querySelector('[data-color-service="'+id+'"]'));assert.equal(document.querySelector('.admin-view form input[type="text"]').value,price);assert.match(document.querySelector('.admin-view form').textContent,/Layanan aktif/);}
 const beforeFeeEdits=chargeCount;await change(document.querySelector('.admin-view form input[type="text"]'),'0');await change(document.querySelector('.admin-view form textarea'),'Warna striping gratis untuk acara kampus');await submit(document.querySelector('.admin-view form'));assert.equal(catalog.services.find(item=>item.id==='stripe-paint').price,'0');assert.match(document.querySelector('[data-color-service="stripe-paint"]').textContent,/Rp0/);const freeEdit=calls.filter(item=>item.path==='/admin/catalog/stripe-paint').at(-1);assert.equal(freeEdit.body.expectedVersion,1);assert.equal(freeEdit.body.enabled,true);
 await click(document.querySelector('[data-color-service="paint-rims"]'));await change(document.querySelector('.admin-view form input[type="text"]'),'7000');await check(document.querySelector('.admin-view form input[type="checkbox"]'),false);await change(document.querySelector('.admin-view form textarea'),'Hentikan sementara layanan cat pelek');await submit(document.querySelector('.admin-view form'));const disabledRims=catalog.services.find(item=>item.id==='paint-rims');assert.equal(disabledRims.price,'7000');assert.equal(disabledRims.enabled,false);assert.match(document.querySelector('[data-color-service="paint-rims"]').textContent,/Rp7.000.*Layanan dinonaktifkan/);assert.equal(chargeCount,beforeFeeEdits);
 console.log('PASS admin exposes all color fees, saves catalog-backed zero prices and disables a service using versioned offers');

 await clickText('Garasi');await click(carButton('brz'));await clickText('Bengkel');assert.match(document.querySelector('.rim-color-studio').textContent,/Layanan dinonaktifkan/);const beforeDisabledCharge=chargeCount,beforeDisabledBalance=profile.wallet.balance;await click(rimSwatch('#ffffff'));await clickText('Tinjau biaya & pasang');assert.equal(document.querySelector('.appearance-review'),null);assert.match(document.body.textContent,/Layanan warna tidak tersedia/);assert.equal(chargeCount,beforeDisabledCharge);assert.equal(profile.wallet.balance,beforeDisabledBalance);await clickText('Kembalikan tampilan tersimpan');
 console.log('PASS a disabled color service rejects the quote without a payment or saved appearance mutation');

 await clickText('Garasi');await click(carButton('bmw-m4-gt4'));assert.match(document.querySelector('.stripe-color-fee').textContent,/Rp0/);await click(stripeSwatch('#8d6ac7'));await clickText('Tinjau biaya & pasang');assert.equal(latestQuote().total,'0');assert.deepEqual(latestQuote().lineItems.map(item=>item.itemId),['stripe-paint']);const freeBalance=profile.wallet.balance;await clickText('Terapkan konfigurasi');assert.equal(profile.wallet.balance,freeBalance);assert.equal(saved('bmw-m4-gt4').stripeColor,'#8d6ac7');
 await click(stripeSwatch('#ffffff'));await clickText('Tinjau biaya & pasang');const staleQuote=latestQuote(),beforeStale=chargeCount;catalog={...catalog,services:catalog.services.map(item=>item.id==='stripe-paint'?{...item,price:'8000',catalogVersion:item.catalogVersion+1}:item)};await clickText('Terapkan konfigurasi');assert.ok(document.querySelector('.appearance-review [role="alert"]'));assert.match(document.querySelector('.appearance-review').textContent,/Tarif layanan sudah berubah/);assert.equal(chargeCount,beforeStale);assert.equal(profile.wallet.balance,freeBalance);await clickText('Perbarui rincian biaya');assert.notEqual(latestQuote().quoteId,staleQuote.quoteId);assert.equal(latestQuote().total,'8000');assert.equal(chargeCount,beforeStale,'Renewing a quote is not approval to pay');await clickText('Bayar Rp8.000 & pasang');assert.equal(BigInt(profile.wallet.balance),BigInt(freeBalance)-8000n);assert.equal(saved('bmw-m4-gt4').stripeColor,'#ffffff');
 console.log('PASS zero-cost color still requires review; stale admin pricing is rejected and renewed before one explicit payment');

 await clickText('Admin');await clickText('Foto kendaraan');assert.ok(document.querySelector('.vehicle-image-editor'));assert.equal(document.querySelector('.vehicle-image-selector select').options.length,catalog.cars.length);await clickText('Harga & toko');assert.ok(document.querySelector('.vehicle-access-field'));assert.match(document.querySelector('.vehicle-access-field').textContent,/sudah membeli tetap memiliki akses/);assert.ok([...document.querySelectorAll('optgroup')].some(x=>x.getAttribute('label')==='Jasa cat & striping'));
 console.log('PASS admin exposes independent photo management, vehicle-access controls and paid cosmetic services');
 const sameFrame=document.querySelector('iframe');assert.ok(sameFrame);assert.ok(controller);
 Object.defineProperty(controller,'sessionId',{get:()=> 'fast'});let resumeRequests=0;controller.resumeReady=()=>{resumeRequests++;};
 const roomTime=Date.now(),pause={pauseToken:'prayer-ui-1',startedAt:roomTime,resumeEligibleAt:roomTime+900000,resumeAt:null,previousPhase:'racing',triggers:[{eventId:'asr:ui',userId:user.id,displayName:'Pembalap',prayer:'asr',name:'Asar',startedAt:roomTime,resumesAt:roomTime+900000}],requiredIds:['fast','slow'],readyIds:[]};
 const pausedRoom={roomId:'room-ui',raceId:'race-ui',phase:'prayer_pause',serverTime:roomTime,inviteCode:'TEST12',config:{circuit:'city',laps:3,bots:1,maxHumans:2},prayerPause:pause,members:[{id:'fast',userId:user.id,name:'Pembalap',host:true,connected:true,ready:true,loadout:profile.loadout},{id:'slow',userId:'friend',name:'Teman',connected:true,ready:true,loadout:profile.loadout}]};
 await act(async()=>{controller.handlers.snapshot(pausedRoom);});await settle();
 assert.strictEqual(document.querySelector('iframe'),sameFrame,'A prayer pause must preserve the active game iframe');
 assert.equal(document.querySelector('main').hasAttribute('inert'),true);assert.equal(document.querySelector('header').hasAttribute('inert'),true);assert.equal(document.querySelector('.page-toolbar'),null);assert.equal(document.querySelector('.scene-toolbar'),null);
 assert.ok([...document.querySelectorAll('[role="dialog"]')].some(x=>/salat/i.test(x.textContent)));
 assert.equal(resumeRequests,0,'Opening a prayer pause must never auto-consent');
 await act(async()=>{controller.handlers.snapshot({...pausedRoom,phase:'resume_countdown',serverTime:roomTime+900000,prayerPause:{...pause,readyIds:['fast','slow'],resumeAt:roomTime+903000}});});
 assert.strictEqual(document.querySelector('iframe'),sameFrame);assert.equal(document.querySelector('main').hasAttribute('inert'),true,'Countdown must keep all game UI frozen');
 await act(async()=>{controller.handlers.snapshot({...pausedRoom,phase:'racing',serverTime:roomTime+903000,prayerPause:null});});
 assert.strictEqual(document.querySelector('iframe'),sameFrame);assert.equal(document.querySelector('main').hasAttribute('inert'),false);
 console.log('PASS room prayer pause preserves the arena iframe, blocks background controls, waits for the authoritative resumed phase');

 // Room choices have their own saved loadout, separate from the permanent garage selection.
 profile={...profile,loadout:copy(saved('brz')),inventory:{...profile.inventory,cars:['brz','bmw-m4-gt4']},accessibleCars:['brz','bmw-m4-gt4','amg-gt4']};
 catalog={...catalog,categories:[{id:'coupe',name:'Coupe',sortOrder:0,version:1},{id:'gt',name:'GT Racing',sortOrder:1,version:1},{id:'hyper',name:'Hypercar',sortOrder:2,version:1}],cars:catalog.cars.map(item=>({...item,locked:item.id!=='amg-gt4',categoryId:item.id==='brz'?'coupe':item.id==='jesko-absolut'?'hyper':'gt'}))};
 await act(async()=>controller.handlers.left());await settle();
 const beforeRaceMutations=mutations().length,permanentRaceLoadout=copy(profile.loadout),raceBalance=profile.wallet.balance;
 let createdRoom=null,createdSelection=null,roomSelections=[];
 Object.defineProperty(controller,'connected',{configurable:true,get:()=>true});
 controller.create=async(config,loadout)=>{createdSelection={config:copy(config),loadout:copy(loadout)};createdRoom={...loadingRoom,roomId:'category-room',phase:'lobby',config:copy(config),vehicleRestriction:{categoryId:config.vehicleCategoryId,categoryName:'GT Racing',allowedCarIds:['bmw-m4-gt4','amg-gt4']},members:[{...loadingRoom.members[0],id:'fast',ready:false,loadout:copy(loadout)}]};controller.handlers.snapshot(createdRoom);};
 controller.setLoadout=loadout=>{roomSelections.push(copy(loadout));};
 await clickText('Balapan');assert.equal(previews.at(-1).carId,'brz');
 await change(document.querySelector('[aria-label="Jumlah lap"]'),'7');
 await click([...document.querySelectorAll('.circuit-option')].find(item=>item.textContent.includes('Drag · 2 km')));
 assert.equal(document.querySelector('[aria-label="Jumlah lap"]'),null);assert.match(document.querySelector('.race-distance').textContent,/Drag · 2 km.*Satu perjalanan/);
 await click([...document.querySelectorAll('.circuit-option')].find(item=>item.textContent.includes('Neon City')));assert.equal(document.querySelector('[aria-label="Jumlah lap"]').value,'7','Circuit laps are preserved when returning from Drag');
 await click([...document.querySelectorAll('.circuit-option')].find(item=>item.textContent.includes('Drag · 2 km')));
 await change(document.querySelector('[aria-label="Slot pemain"]'),'1');await change(document.querySelector('[aria-label="Lawan bot"]'),'14');
 await change(document.querySelector('[aria-label="Kategori kendaraan ruang"]'),'gt');
 const raceSelect=()=>document.querySelector('[aria-label="Kendaraan untuk balapan"]');
 const availableRaceIds=()=>[...raceSelect().querySelectorAll('option')].map(option=>option.value).filter(Boolean);
 assert.deepEqual(availableRaceIds(),['bmw-m4-gt4','amg-gt4']);assert.equal(raceSelect().value,'');assert.equal(button('Buat ruang balapan').disabled,true);assert.equal(previews.at(-1).carId,'brz','Category changes never select another car implicitly');
 await submit(document.querySelector('.room-panel form'));assert.equal(createdSelection,null,'An invalid category/car pair cannot submit');
 await change(raceSelect(),'bmw-m4-gt4');assert.equal(previews.at(-1).carId,'bmw-m4-gt4');assert.equal(mutations().length,beforeRaceMutations);
 await submit(document.querySelector('.room-panel form'));
 assert.equal(createdSelection.config.circuit,'drag-2km');assert.equal(createdSelection.config.laps,1);assert.equal(createdSelection.config.vehicleCategoryId,'gt');assert.equal(createdSelection.config.bots,14);assert.equal(createdSelection.config.maxHumans,1);assert.equal(createdSelection.loadout.carId,'bmw-m4-gt4');assert.equal(createdSelection.loadout.color,saved('bmw-m4-gt4').color);assert.equal(createdSelection.loadout.appearanceVersion,saved('bmw-m4-gt4').version);assert.deepEqual(profile.loadout,permanentRaceLoadout);assert.equal(profile.wallet.balance,raceBalance);assert.equal(mutations().length,beforeRaceMutations);
 assert.match(document.querySelector('.race-room-rules').textContent,/GT Racing.*Drag · 2 km/s);
 console.log('PASS drag forces one 2 km journey, remembers circuit laps, and category creation requires an explicit saved accessible car without purchase or equip');

 // The room keeps its creation-time membership despite later admin changes.
 catalog={...catalog,categories:catalog.categories.map(category=>category.id==='gt'?{...category,name:'Nama baru'}:category),cars:catalog.cars.map(item=>({...item,categoryId:item.id==='brz'?'gt':'coupe',enabled:item.id!=='bmw-m4-gt4'}))};
 await clickText('Showroom');await clickText('Balapan');
 assert.deepEqual(availableRaceIds(),['bmw-m4-gt4','amg-gt4']);assert.match(document.querySelector('.room-category').textContent,/GT Racing/);assert.doesNotMatch(document.querySelector('.room-category').textContent,/Nama baru/);
 await change(raceSelect(),'amg-gt4');assert.equal(roomSelections.at(-1).carId,'amg-gt4');assert.equal(button('Saya siap balapan').disabled,true,'Ready waits for the authoritative selected car');assert.equal(previews.at(-1).carId,'bmw-m4-gt4','Preview remains on the accepted room car until acknowledgment');
 createdRoom={...createdRoom,members:createdRoom.members.map(member=>({...member,loadout:roomSelections.at(-1)}))};await act(async()=>controller.handlers.snapshot(createdRoom));
 assert.equal(button('Saya siap balapan').disabled,false);assert.equal(previews.at(-1).carId,'amg-gt4');assert.deepEqual(profile.loadout,permanentRaceLoadout);assert.equal(profile.wallet.balance,raceBalance);assert.equal(mutations().length,beforeRaceMutations);
 console.log('PASS frozen room IDs and name survive catalog reassignment; owned off-sale cars remain eligible; explicit free-car changes await server acknowledgment');

 await act(async()=>controller.handlers.left());await settle();
 inviteLookup={roomId:'invite-category-room',inviteCode:'GT2026',phase:'lobby',config:{circuit:'drag-2km',laps:1,bots:3,maxHumans:4,difficulty:'hard',collisionMode:'ghost',vehicleCategoryId:'gt'},humans:1,joinable:true,vehicleRestriction:{categoryId:'gt',categoryName:'GT Racing',allowedCarIds:['bmw-m4-gt4','amg-gt4']}};
 let joinedSelection=null;controller.join=async(code,loadout)=>{joinedSelection={code,loadout:copy(loadout)};};
 await clickText('Balapan');await clickText('Gabung teman');await change(document.querySelector('.code-input'),'GT2026');await submit(document.querySelector('.room-panel form'));
 assert.ok(document.querySelector('.invite-preview'));assert.match(document.querySelector('.invite-preview').textContent,/GT Racing.*Drag · 2 km.*3 bot.*4 pemain.*kompetitif.*tanpa kontak/s);assert.deepEqual(availableRaceIds(),['bmw-m4-gt4','amg-gt4']);assert.equal(button('Gabung ruang balapan').disabled,true);assert.equal(joinedSelection,null);
 await change(raceSelect(),'bmw-m4-gt4');await submit(document.querySelector('.room-panel form'));assert.equal(joinedSelection.code,'GT2026');assert.equal(joinedSelection.loadout.carId,'bmw-m4-gt4');assert.equal(joinedSelection.loadout.stripeId,saved('bmw-m4-gt4').stripeId);assert.deepEqual(profile.loadout,permanentRaceLoadout);assert.equal(mutations().length,beforeRaceMutations);
 joinedSelection=null;await clickText('Periksa ulang ruang');await change(raceSelect(),'bmw-m4-gt4');
 inviteLookup={...inviteLookup,roomId:'replacement-room'};await submit(document.querySelector('.room-panel form'));assert.equal(joinedSelection,null,'An invitation replaced between review and join is not silently accepted');assert.match(document.body.textContent,/Aturan ruang telah berubah/);assert.equal(document.querySelector('.invite-preview'),null);
 console.log('PASS invite review shares authoritative drag/category rules and frozen car membership; joining sends saved cosmetics only and rejects changed invitations');

 // No eligible cars: present a useful destination and leave both Ready and Start blocked.
 let showroomVisits=0,readyPresses=0;
 const emptyRoom={...createdRoom,vehicleRestriction:{categoryId:'hyper',categoryName:'Hypercar',allowedCarIds:['jesko-absolut']},members:createdRoom.members.map(member=>({...member,ready:false}))};
 await act(async()=>root.render(React.createElement(compiled.exports.RacePanel,{room:emptyRoom,profile,catalog,status:'Tersambung',ping:15,busy:false,modelReady:true,onRoomCarChange(){},onShowroom(){showroomVisits++;},onReady(){readyPresses++;},onStart(){},onLeave(){},onNotice(){}})));
 assert.deepEqual(availableRaceIds(),[]);assert.equal(button('Saya siap balapan').disabled,true);assert.equal(button('Mulai balapan').disabled,true);assert.match(document.querySelector('.race-car-warning').textContent,/belum memiliki kendaraan yang sesuai/);await clickText('Lihat kendaraan di showroom');assert.equal(showroomVisits,1);assert.equal(readyPresses,0);assert.deepEqual(profile.loadout,permanentRaceLoadout);assert.equal(profile.wallet.balance,raceBalance);
 console.log('PASS no eligible vehicle presents the showroom action without auto-buying, auto-equipping, or allowing invalid readiness');

 await act(async()=>{root.render(React.createElement(compiled.exports.RacePanel,{room:{phase:'loading',inviteCode:'TEST12',config:{circuit:'city',laps:3,bots:0,maxHumans:2},members:[{id:'fast',userId:user.id,name:'Cepat',host:true,ready:true,arenaReady:true,connected:true,loadout:profile.loadout},{id:'slow',userId:'slow-driver',name:'Lambat',host:false,ready:true,arenaReady:false,connected:true,loadout:profile.loadout}]},profile,status:'Tersambung',ping:25,busy:false,modelReady:true,onLeave(){}}));});
 assert.match(document.querySelector('.arena-loading-card').textContent,/1 \/ 2 perangkat siap/);assert.equal(document.querySelector('[role="progressbar"]').getAttribute('aria-valuenow'),'1');assert.match(document.querySelector('.room-members').textContent,/Arena siap/);assert.match(document.querySelector('.room-members').textContent,/Memuat arena/);assert.ok(![...document.querySelectorAll('button')].some(b=>b.textContent==='Mulai balapan'));
 console.log('PASS loading panel distinguishes lobby readiness from arena readiness and withholds start controls');
}finally{await act(async()=>root.unmount());globalThis.setTimeout=nativeTimeout;globalThis.clearTimeout=nativeClearTimeout;await rm(temp,{recursive:true,force:true});}
