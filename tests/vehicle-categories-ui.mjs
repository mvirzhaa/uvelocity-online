/** Real React forms with scripted HTTP responses. Database validation/auth are
 * covered separately by the category backend integration suite. */
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {parseHTML} from 'linkedom';

const temp=await mkdtemp(join(tmpdir(),'uvelocity-category-ui-'));
const {window,document}=parseHTML('<html><body><div id="root"></div></body></html>');document.oninput=null;
let active=document.body;Object.defineProperty(document,'activeElement',{get:()=>active});window.HTMLElement.prototype.focus=function(){active=this;};
Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this.querySelector('option[selected]')?.value??this.querySelector('option')?.value??'';},set(value){for(const option of this.querySelectorAll('option'))option.toggleAttribute('selected',option.value===String(value));}});
Object.assign(globalThis,{window,document,HTMLElement:window.HTMLElement,HTMLInputElement:window.HTMLInputElement,IS_REACT_ACT_ENVIRONMENT:true});
const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
const bundle=await build({stdin:{contents:'export {AdminVehicleCategories} from "./client/src/AdminVehicleCategories.tsx";export {api} from "./client/src/api.ts";',resolveDir:process.cwd(),sourcefile:'category-entry.tsx',loader:'tsx'},bundle:true,write:false,format:'cjs',platform:'node',jsx:'automatic',loader:{'.css':'empty'},external:['react','react-dom','react-dom/client'],logLevel:'silent'});
const require=createRequire(resolve('package.json')),Module=require('node:module'),compiled=new Module(join(temp,'Categories.cjs'));compiled.paths=Module._nodeModulePaths(process.cwd());compiled._compile(bundle.outputFiles[0].text,compiled.filename=join(temp,'Categories.cjs'));
const {AdminVehicleCategories,api}=compiled.exports,root=createRoot(document.getElementById('root'));
const settle=async()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,2));});
const render=async node=>{await act(async()=>root.render(node));await settle();};
const click=async node=>{assert.ok(node&&!node.disabled,'Enabled control required: '+node?.textContent);await act(async()=>{node.dispatchEvent(new window.Event('click',{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,2));});};
const button=text=>{const node=[...document.querySelectorAll('button')].find(item=>item.textContent.trim()===text);assert.ok(node,'Missing button '+text);return node;};
const change=async(node,value)=>{assert.ok(node);await act(async()=>{let prototype=Object.getPrototypeOf(node),descriptor;while(prototype&&!descriptor){descriptor=Object.getOwnPropertyDescriptor(prototype,'value');prototype=Object.getPrototypeOf(prototype);}if(descriptor?.set)descriptor.set.call(node,value);else node.value=value;node.dispatchEvent(new window.Event('input',{bubbles:true}));node.dispatchEvent(new window.Event('change',{bubbles:true}));});};
const submit=async form=>act(async()=>{form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await new Promise(resolve=>setTimeout(resolve,2));});
const categoryForm=()=>document.querySelector('.vehicle-category-form'),assignmentForm=()=>document.querySelector('.vehicle-category-assignment');
const input=(form,text)=>[...form.querySelectorAll('label')].find(label=>label.firstChild.textContent===text)?.querySelector('input,select,textarea');
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const requests=[],notices=[];let saved=0,pendingCreate=null,holdCreate=false,nextFailure=null,pendingRead=null;
let categories=[{id:'sport',name:'Sport',sortOrder:10,version:1},{id:'mpv',name:'MPV',sortOrder:20,version:1}];
let cars=[{id:'brz',name:'Subaru BRZ',kind:'car',itemId:'brz',price:'0',locked:false,enabled:true,color:'#2866b8',catalogVersion:1,categoryId:'sport'},{id:'panther-grand-touring',name:'Isuzu Panther Grand Touring',kind:'car',itemId:'panther-grand-touring',price:'150000',locked:true,enabled:true,color:'#19252e',catalogVersion:1,categoryId:'mpv'}];
const currentCatalog=()=>({cars:structuredClone(cars),categories:structuredClone(categories),wheels:[],services:[],currency:'RP_GAME',currencyLabel:'Rp',rulesetVersion:'1'});
const node=()=>React.createElement(AdminVehicleCategories,{catalog:currentCatalog(),onSaved:async()=>{saved++;root.render(node());},onNotice:(text,error)=>notices.push({text,error})});
globalThis.fetch=async(url,options={})=>{
 const path=String(url).replace(/^\/api/,''),method=options.method??'GET',body=options.body?JSON.parse(options.body):undefined;requests.push({path,method,body,headers:options.headers,signal:options.signal});
 if(path==='/auth/me')return response({csrfToken:'category-csrf'});
 if(path==='/admin/vehicle-categories'&&method==='GET'){if(pendingRead){const pending=pendingRead;pendingRead=null;return pending;}return response({categories:structuredClone(categories)});}
 if(nextFailure){const failure=nextFailure;nextFailure=null;failure.mutate?.();if(failure.network)throw new TypeError('network');return response({error:{code:failure.code,message:failure.message}},failure.status??409);}
 if(path==='/admin/vehicle-categories'&&method==='POST'){
  const create=()=>{const category={id:'custom-suv',name:body.name,sortOrder:body.sortOrder,version:1};categories.push(category);return response({category:structuredClone(category)},201);};
  if(holdCreate){holdCreate=false;return new Promise(resolve=>{pendingCreate=()=>resolve(create());});}return create();
 }
 if(path.startsWith('/admin/vehicle-categories/')&&method==='PATCH'){const category=categories.find(item=>item.id===path.split('/').at(-1));assert.equal(body.expectedVersion,category.version);Object.assign(category,{name:body.name,sortOrder:body.sortOrder,version:category.version+1});return response({category:structuredClone(category)});}
 if(path.startsWith('/admin/vehicle-categories/')&&method==='DELETE'){const id=path.split('/').at(-1),category=categories.find(item=>item.id===id);assert.equal(body.expectedVersion,category.version);assert.ok(!cars.some(item=>item.categoryId===id));categories=categories.filter(item=>item.id!==id);return response({deleted:true,id});}
 if(path.startsWith('/admin/catalog/')&&method==='PATCH'){const car=cars.find(item=>item.id===path.split('/').at(-1));assert.equal(body.expectedVersion,car.catalogVersion);Object.assign(car,{categoryId:body.categoryId,catalogVersion:car.catalogVersion+1});return response({item:structuredClone(car)});}
 throw new Error('Unexpected category request: '+method+' '+path);
};
const mutations=()=>requests.filter(item=>item.method!=='GET');
try{
 await api('/auth/me');await render(node());
 assert.equal(input(categoryForm(),'Kategori tersedia').value,'sport');assert.equal(input(assignmentForm(),'Kategori kendaraan').value,'sport');assert.equal(button('Hapus kategori').disabled,true);
 await click(button('Kategori baru'));await submit(categoryForm());assert.equal(mutations().length,0);assert.match(document.querySelector('[role=alert]').textContent,/2–40/);
 await change(input(categoryForm(),'Nama kategori'),'  SUV   Premium  ');await change(input(categoryForm(),'Urutan tampilan'),'10000');await submit(categoryForm());assert.equal(mutations().length,0);assert.match(document.querySelector('[role=alert]').textContent,/0 dan 9999/);
 await change(input(categoryForm(),'Urutan tampilan'),'25');await submit(categoryForm());assert.equal(mutations().length,0);assert.match(document.querySelector('[role=alert]').textContent,/4–500/);
 await change(input(categoryForm(),'Alasan perubahan kategori'),'Kategori untuk rencana kendaraan baru');holdCreate=true;await submit(categoryForm());await submit(categoryForm());assert.equal(mutations().length,1,'Repeated submit cannot duplicate creation');assert.equal(input(categoryForm(),'Nama kategori').disabled,true);
 await act(async()=>pendingCreate());await settle();assert.equal(saved,1);assert.equal(input(categoryForm(),'Nama kategori').value,'SUV Premium');assert.equal(input(categoryForm(),'Kategori tersedia').value,'custom-suv');assert.ok([...input(assignmentForm(),'Kategori kendaraan').options].some(option=>option.textContent==='SUV Premium'));
 assert.deepEqual(mutations()[0].body,{name:'SUV Premium',sortOrder:25,reason:'Kategori untuk rencana kendaraan baru'});assert.equal(mutations()[0].headers['X-CSRF-Token'],'category-csrf');
 console.log('PASS loaded categories, validation before writes, normalized names, creation with CSRF, duplicate-submit guard and immediate selector refresh');

 await change(input(categoryForm(),'Nama kategori'),'SUV & Crossover');await change(input(categoryForm(),'Urutan tampilan'),'40');await change(input(categoryForm(),'Alasan perubahan kategori'),'Perjelas nama dan urutan kategori');await submit(categoryForm());assert.equal(categories.at(-1).version,2);assert.equal(mutations().at(-1).body.expectedVersion,1);
 await change(input(assignmentForm(),'Kendaraan'),'panther-grand-touring');await change(input(assignmentForm(),'Kategori kendaraan'),'custom-suv');await change(input(assignmentForm(),'Alasan pengelompokan'),'Kelompokkan kendaraan keluarga');await submit(assignmentForm());
 assert.deepEqual(Object.keys(mutations().at(-1).body).sort(),['categoryId','expectedVersion','reason']);assert.equal(cars[1].categoryId,'custom-suv');assert.equal(cars[1].price,'150000');assert.equal(cars[1].locked,true);assert.equal(cars[1].enabled,true);assert.equal(button('Hapus kategori').disabled,true,'Assigned category cannot be removed');
 console.log('PASS rename/order with expectedVersion, car-specific assignment only, counts update, and price/lock/availability preservation');

 await change(input(categoryForm(),'Nama kategori'),'Sport');await change(input(categoryForm(),'Alasan perubahan kategori'),'Nama yang sudah digunakan kategori lain');const beforeDuplicate=mutations().length;nextFailure={code:'CATEGORY_NAME_TAKEN',message:'Nama kategori sudah digunakan.'};await submit(categoryForm());assert.equal(mutations().length,beforeDuplicate+1);assert.match(categoryForm().querySelector('[role=alert]').textContent,/sudah digunakan/);assert.equal(input(categoryForm(),'Nama kategori').value,'Sport','Rejected draft remains available for correction');
 nextFailure={code:'CATEGORY_CHANGED',message:'Kategori telah diubah admin lain. Muat ulang sebelum menyimpan.',mutate:()=>{const item=categories.find(item=>item.id==='custom-suv');item.name='SUV terbaru';item.version++;}};const beforeConflict=mutations().length;await submit(categoryForm());await settle();assert.equal(mutations().length,beforeConflict+1,'Conflict is never retried automatically');assert.equal(input(categoryForm(),'Nama kategori').value,'SUV terbaru');assert.equal(input(categoryForm(),'Alasan perubahan kategori').value,'');assert.match(categoryForm().querySelector('[role=alert]').textContent,/admin lain/);
 await change(input(assignmentForm(),'Kategori kendaraan'),'sport');await change(input(assignmentForm(),'Alasan pengelompokan'),'Ubah kategori kendaraan yang dipilih');nextFailure={code:'CATALOG_CHANGED',message:'Item telah diubah admin lain. Muat ulang sebelum menyimpan.',mutate:()=>{cars[1].catalogVersion++;cars[1].categoryId='mpv';}};const beforeAssignConflict=mutations().length;await submit(assignmentForm());await settle();assert.equal(mutations().length,beforeAssignConflict+1);assert.equal(input(assignmentForm(),'Kategori kendaraan').value,'mpv');assert.equal(input(assignmentForm(),'Alasan pengelompokan').value,'');assert.match(assignmentForm().querySelector('[role=alert]').textContent,/admin lain/);
 await change(input(assignmentForm(),'Kategori kendaraan'),'custom-suv');await change(input(assignmentForm(),'Alasan pengelompokan'),'Gunakan kategori terbaru setelah pemeriksaan');await submit(assignmentForm());assert.equal(mutations().at(-1).body.expectedVersion,3);assert.equal(cars[1].categoryId,'custom-suv');
 console.log('PASS duplicate-name recovery, category/car CAS conflicts reload authoritative data without overwrite, and deliberate retry uses the new version');

 await change(input(categoryForm(),'Kategori tersedia'),'mpv');assert.equal(button('Hapus kategori').disabled,false);const beforeDelete=mutations().length;await click(button('Hapus kategori'));await click(button('Batalkan penghapusan'));assert.equal(mutations().length,beforeDelete);await click(button('Hapus kategori'));await click(button('Ya, hapus kategori'));assert.equal(mutations().length,beforeDelete,'Deletion requires a reason');await change(input(categoryForm(),'Alasan perubahan kategori'),'Kategori kosong tidak digunakan lagi');await click(button('Ya, hapus kategori'));assert.equal(mutations().length,beforeDelete+1);assert.deepEqual(mutations().at(-1).body,{expectedVersion:1,reason:'Kategori kosong tidak digunakan lagi'});assert.ok(!categories.some(item=>item.id==='mpv'));assert.ok(![...input(assignmentForm(),'Kategori kendaraan').options].some(option=>option.value==='mpv'));
 const beforeNetwork=mutations().length,beforeSaved=saved;await change(input(categoryForm(),'Nama kategori'),'Sport modern');await change(input(categoryForm(),'Alasan perubahan kategori'),'Uji kegagalan koneksi saat perubahan');nextFailure={network:true};await submit(categoryForm());assert.equal(mutations().length,beforeNetwork+1);assert.equal(saved,beforeSaved);assert.match(categoryForm().querySelector('[role=alert]').textContent,/Koneksi/);assert.equal(input(categoryForm(),'Nama kategori').value,'Sport modern');
 console.log('PASS empty-only delete, cancellation/reason/confirmation, removed options, and honest network failure with preserved draft');

 await change(input(assignmentForm(),'Kendaraan'),'panther-grand-touring');await change(input(assignmentForm(),'Alasan pengelompokan'),'Draf hanya untuk kendaraan Panther');const beforeRemoval=mutations().length;cars=cars.filter(item=>item.id==='brz');await render(node());assert.equal(input(assignmentForm(),'Kendaraan').value,'brz');assert.equal(input(assignmentForm(),'Alasan pengelompokan').value,'');assert.equal(mutations().length,beforeRemoval);
 await render(React.createElement('div'));let resolveOld;pendingRead=new Promise(resolve=>resolveOld=resolve);await render(node());const oldRead=requests.at(-1);await render(React.createElement('div'));assert.equal(oldRead.signal.aborted,true);await render(node());await act(async()=>resolveOld(response({categories:[{id:'stale',name:'Stale category',sortOrder:0,version:99}]})));await settle();assert.ok(!document.body.textContent.includes('Stale category'));
 assert.ok(mutations().every(item=>item.path.startsWith('/admin/vehicle-categories')||item.path.startsWith('/admin/catalog/')));
 console.log('PASS removed-car drafts cannot retarget another vehicle, unmount aborts reads, and late responses cannot replace the current editor');
}finally{await act(async()=>root.unmount());await rm(temp,{recursive:true,force:true});}
