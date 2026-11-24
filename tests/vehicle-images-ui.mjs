/** Portable React DOM + real upload transport tests. HTTP/XHR/image load events
 * are scripted; byte validation/normalization/persistence are backend tests. */
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {parseHTML} from 'linkedom';

const temp=await mkdtemp(join(tmpdir(),'uvelocity-vehicle-images-'));
const {window,document}=parseHTML('<html><body><div id="root"></div></body></html>');
document.oninput=null;
let active=document.body;
Object.defineProperty(document,'activeElement',{get:()=>active});
window.HTMLElement.prototype.focus=function(){active=this;};window.HTMLElement.prototype.blur=function(){active=document.body;};
Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this.querySelector('option[selected]')?.value??this.querySelector('option')?.value??'';},set(value){for(const option of this.querySelectorAll('option'))option.toggleAttribute('selected',option.value===String(value));}});
const location={origin:'http://localhost:3000',href:'http://localhost:3000/'};window.location=location;
Object.assign(globalThis,{window,document,location,HTMLElement:window.HTMLElement,HTMLInputElement:window.HTMLInputElement,IS_REACT_ACT_ENVIRONMENT:true});
const nativeCreate=URL.createObjectURL,nativeRevoke=URL.revokeObjectURL,created=new Map(),revoked=new Set();
let blobId=0;URL.createObjectURL=file=>{const url='blob:http://localhost:3000/photo-'+(++blobId);created.set(url,file);return url;};URL.revokeObjectURL=url=>revoked.add(url);
const uploads=[];
class FakeXHR{
  upload={};headers={};status=0;responseText='';
  open(method,url){this.method=method;this.url=url;}
  setRequestHeader(name,value){this.headers[name]=value;}
  send(body){this.body=body;uploads.push(this);}
  abort(){this.aborted=true;this.onabort?.();}
  progress(loaded,total){this.upload.onprogress?.({lengthComputable:true,loaded,total});}
  reply(body,status=201){this.status=status;this.responseText=JSON.stringify(body);this.onload?.();}
}
globalThis.XMLHttpRequest=FakeXHR;
const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
const bundle=await build({stdin:{contents:'export {CarThumbnail,VehicleImageEditor} from "./client/src/VehicleImages.tsx"; export {api} from "./client/src/api.ts";',resolveDir:process.cwd(),sourcefile:'vehicle-images-entry.tsx',loader:'tsx'},bundle:true,write:false,format:'cjs',platform:'node',jsx:'automatic',loader:{'.css':'empty'},external:['react','react-dom','react-dom/client'],logLevel:'silent'});
const require=createRequire(resolve('package.json')),Module=require('node:module'),compiled=new Module(join(temp,'VehicleImages.cjs'));
compiled.paths=Module._nodeModulePaths(process.cwd());compiled._compile(bundle.outputFiles[0].text,compiled.filename=join(temp,'VehicleImages.cjs'));
const {CarThumbnail,VehicleImageEditor,api}=compiled.exports,root=createRoot(document.getElementById('root'));
const settle=async()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,2));});
const render=async node=>{await act(async()=>root.render(node));await settle();};
const click=async node=>{assert.ok(node&&!node.disabled,'Enabled button required: '+node?.textContent);await act(async()=>{node.dispatchEvent(new window.Event('click',{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,2));});};
const button=text=>{const node=[...document.querySelectorAll('button')].find(item=>item.textContent.trim()===text);assert.ok(node,'Missing button '+text);return node;};
const change=async(node,value)=>{await act(async()=>{let prototype=Object.getPrototypeOf(node),descriptor;while(prototype&&!descriptor){descriptor=Object.getOwnPropertyDescriptor(prototype,'value');prototype=Object.getPrototypeOf(prototype);}if(descriptor?.set)descriptor.set.call(node,value);else node.value=value;node.dispatchEvent(new window.Event('input',{bubbles:true}));node.dispatchEvent(new window.Event('change',{bubbles:true}));});};
const choose=async file=>{const input=document.querySelector('input[type=file]');Object.defineProperty(input,'files',{configurable:true,value:file?[file]:[]});await act(async()=>input.dispatchEvent(new window.Event('change',{bubbles:true})));};
const submit=async form=>{await act(async()=>{form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await new Promise(resolve=>setTimeout(resolve,2));});};
const uploadForm=()=>document.querySelector('.vehicle-image-upload'),reason=()=>uploadForm().querySelector('textarea');
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const thumb=index=>({id:`00000000-0000-4000-8000-${String(index).padStart(12,'0')}`,url:`/api/vehicle-thumbnails/00000000-0000-4000-8000-${String(index).padStart(12,'0')}`,mimeType:'image/webp',bytes:14500,width:512,height:288});
const limits={inputBytes:4*1024*1024,inputPixels:16000000,maxWidth:512,maxHeight:288,outputBytes:524288,acceptedMimeTypes:['image/jpeg','image/png','image/webp']};
const cars=[{id:'brz',name:'Subaru BRZ',kind:'car',price:'0',enabled:true,locked:false,catalogVersion:1,itemId:'brz',color:'#2969b5',thumbnail:thumb(1)},{id:'venom-f5',name:'Hennessey Venom F5',kind:'car',price:'9999999',enabled:true,locked:true,catalogVersion:1,itemId:'venom-f5',color:'#aaaaaa',thumbnail:null}];
let slots=[{carId:'brz',version:1,thumbnail:thumb(1)},{carId:'venom-f5',version:1,thumbnail:null}],nextRead=null,deleteConflict=false;
const requests=[];
globalThis.fetch=async(url,options={})=>{
  const path=String(url).replace(/^\/api/,''),method=options.method??'GET',body=options.body?JSON.parse(options.body):undefined;
  requests.push({path,method,body,headers:options.headers,signal:options.signal});
  if(path==='/auth/me')return response({csrfToken:'vehicle-photo-csrf'});
  if(path==='/admin/vehicle-thumbnails'&&method==='GET'){if(nextRead){const pending=nextRead;nextRead=null;return pending;}return response({cars:structuredClone(slots),limits});}
  if(path.startsWith('/admin/vehicle-thumbnails/')&&method==='DELETE'){
    const id=path.split('/').at(-1),current=slots.find(slot=>slot.carId===id);
    if(deleteConflict){deleteConflict=false;current.version++;current.thumbnail=thumb(current.version+20);return response({error:{code:'THUMBNAIL_CHANGED',message:'Foto berubah.'}},409);}
    assert.equal(body.expectedVersion,current.version);current.version++;current.thumbnail=null;return response(structuredClone(current));
  }
  throw new Error('Unexpected photo request '+method+' '+path);
};
const saved=[],notices=[];
const props={cars,onSaved:async()=>{saved.push(structuredClone(slots));},onNotice:text=>notices.push(text)};
const uploadedSlot=(carId,version,index)=>({carId,version,thumbnail:thumb(index)});
try{
  await api('/auth/me');
  await render(React.createElement(CarThumbnail,{car:cars[0]}));let image=document.querySelector('img');
  assert.equal(image.getAttribute('src'),thumb(1).url);assert.equal(image.getAttribute('loading'),'lazy');assert.equal(image.getAttribute('alt'),'Foto Subaru BRZ');assert.equal(image.getAttribute('width'),'512');assert.equal(image.getAttribute('height'),'288');
  await act(async()=>image.dispatchEvent(new window.Event('error',{bubbles:true})));assert.equal(document.querySelector('img'),null);assert.match(document.querySelector('[role=img]').getAttribute('aria-label'),/Subaru BRZ/);
  await render(React.createElement(CarThumbnail,{car:{...cars[0],thumbnail:thumb(2)}}));assert.equal(document.querySelector('img').getAttribute('src'),thumb(2).url);
  await render(React.createElement(CarThumbnail,{car:{...cars[0],thumbnail:{...thumb(2),url:'https://external.example/photo.webp'}}}));assert.equal(document.querySelector('img'),null,'No external thumbnail requests');
  await render(React.createElement(CarThumbnail,{car:cars[1]}));assert.match(document.querySelector('.vehicle-thumbnail-fallback').textContent,/Belum ada foto/);
  const css=await readFile('client/src/vehicle-images.css','utf8');assert.match(css,/aspect-ratio:16\/9/);assert.match(css,/object-fit:contain/);
  console.log('PASS small lazy model-labelled thumbnail, fixed contain frame, failed/new-source fallback and same-origin URL restriction');

  const addedCars=[['honda-crv-rs','Honda CR-V RS'],['mitsubishi-pajero-sport','Mitsubishi Pajero Sport'],['toyota-fortuner','Toyota Fortuner'],['toyota-innova-zenix','Toyota Kijang Innova Zenix Hybrid'],['batmobile-tumbler','Batmobile Tumbler'],['knight-rider-kitt','Pontiac Knight Rider 1983 · KITT']];
  for(const [id,name] of addedCars){
    const car={id,name,thumbnail:null},photo=`./vehicle-photos/${id}.png`;
    const bytes=await readFile(`public/vehicle-photos/${id}.png`);
    assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a','Bundled reference is a real PNG');
    await render(React.createElement(CarThumbnail,{car}));
    assert.equal(document.querySelector('img').getAttribute('src'),photo);
    assert.equal(document.querySelector('img').getAttribute('alt'),'Foto '+name);
    await render(React.createElement(CarThumbnail,{car:{...car,thumbnail:thumb(60)}}));
    assert.equal(document.querySelector('img').getAttribute('src'),thumb(60).url,'Admin photo takes priority');
    await render(React.createElement(CarThumbnail,{car}));
    assert.equal(document.querySelector('img').getAttribute('src'),photo,'Removing the admin photo restores the reference');
    await render(React.createElement(CarThumbnail,{car:{...car,thumbnail:{...thumb(60),url:'https://external.example/vehicle.png'}}}));
    assert.equal(document.querySelector('img'),null,'Bundled defaults never bypass admin URL validation');
    await render(React.createElement(CarThumbnail,{car}));
    await act(async()=>document.querySelector('img').dispatchEvent(new window.Event('error',{bubbles:true})));
    assert.equal(document.querySelector('img'),null,'Broken bundled photos have an accessible fallback');
  }
  console.log('PASS all six bundled reference photos, admin override/removal, URL validation and image failure fallback');

  await render(React.createElement(VehicleImageEditor,props));assert.equal(document.querySelector('.vehicle-image-current img').getAttribute('src'),thumb(1).url);
  await choose(new File(['<svg/>'],'bad.svg',{type:'image/svg+xml'}));assert.match(document.querySelector('[role=alert]').textContent,/JPEG, PNG, atau WebP/);assert.equal(uploads.length,0);assert.equal(created.size,0,'Rejected file never gets a preview URL');
  await choose(new File([new Uint8Array(limits.inputBytes+1)],'huge.jpg',{type:'image/jpeg'}));assert.match(document.querySelector('[role=alert]').textContent,/4 MB/);assert.equal(uploads.length,0);
  const photo=new File([new Uint8Array([255,216,255,217])],'BRZ foto nyata.jpeg',{type:'image/jpeg'});
  await choose(photo);const firstBlob=document.querySelector('.vehicle-image-candidate img').getAttribute('src');assert.strictEqual(created.get(firstBlob),photo);assert.equal(uploads.length,0,'Selecting a photo does not save anything');
  await submit(uploadForm());assert.equal(uploads.length,0,'Reason is required before upload');
  await change(reason(),'Foto baru untuk Subaru BRZ');await submit(uploadForm());await submit(uploadForm());assert.equal(uploads.length,1,'Duplicate submit cannot create parallel uploads');
  let upload=uploads.at(-1),url=new URL(upload.url,location.origin);
  assert.equal(url.pathname,'/api/admin/vehicle-thumbnails/brz');assert.equal(url.searchParams.get('expectedVersion'),'1');assert.equal(url.searchParams.get('reason'),'Foto baru untuk Subaru BRZ');assert.equal(url.searchParams.has('name'),false);
  assert.strictEqual(upload.body,photo);assert.equal(upload.headers['Content-Type'],'image/jpeg');assert.equal(upload.headers['X-CSRF-Token'],'vehicle-photo-csrf');assert.equal(upload.withCredentials,true);assert.equal(document.querySelector('select').disabled,true);
  await act(async()=>upload.progress(4,4));assert.equal(document.querySelector('progress').getAttribute('value'),'99');assert.match(document.querySelector('.vehicle-image-progress').textContent,/Menunggu hasil server/);
  slots[0]=uploadedSlot('brz',2,2);await act(async()=>upload.reply(slots[0]));await settle();assert.equal(saved.length,1);assert.equal(document.querySelector('.vehicle-image-current img').getAttribute('src'),thumb(2).url);assert.equal(document.querySelector('.vehicle-image-candidate'),null);assert.ok(revoked.has(firstBlob));
  console.log('PASS format/size/reason validation, original bytes with CSRF/progress/CAS, duplicate-submit guard, saved photo refresh and BlobURL cleanup');

  const png=new File(['png'],'Hennessey.png',{type:'image/png'});await change(document.querySelector('select'),'venom-f5');assert.match(document.querySelector('.vehicle-image-current').textContent,/Unggah foto pertama/);assert.equal(button('Hapus foto').disabled,true);
  await choose(png);const cancelBlob=document.querySelector('.vehicle-image-candidate img').getAttribute('src');await change(reason(),'Foto samping Hennessey');await submit(uploadForm());upload=uploads.at(-1);assert.equal(upload.headers['Content-Type'],'image/png');assert.match(upload.url,/vehicle-thumbnails\/venom-f5/);
  // A request can be committed by the server just before its browser abort.
  slots[1]=uploadedSlot('venom-f5',2,12);await click(button('Batalkan unggahan'));await settle();assert.equal(upload.aborted,true);assert.equal(document.querySelector('.vehicle-image-progress'),null);assert.match(document.querySelector('[role=status]').textContent,/terbaru telah diperiksa/);assert.equal(saved.length,2);assert.equal(saved.at(-1).find(slot=>slot.carId==='venom-f5').thumbnail.url,thumb(12).url);assert.equal(document.querySelector('.vehicle-image-current img').getAttribute('src'),thumb(12).url);
  await submit(uploadForm());upload=uploads.at(-1);nextRead=Promise.resolve(response({error:{code:'PHOTO_READ_FAILED',message:'Foto belum dapat dimuat.'}},503));await click(button('Batalkan unggahan'));await settle();assert.equal(upload.aborted,true);assert.match(document.querySelector('[role=status]').textContent,/belum dapat dipastikan/);assert.match(document.querySelector('[role=alert]').textContent,/Foto belum dapat dimuat/);assert.equal(saved.length,2,'Failed reconciliation cannot claim or refresh authoritative parent state');
  await change(document.querySelector('select'),'brz');assert.ok(revoked.has(cancelBlob));assert.equal(document.querySelector('.vehicle-image-candidate'),null);assert.equal(reason().value,'');
  console.log('PASS selected-car routing, empty-slot fallback, cancel/committed-upload reconciliation, honest reload failure and per-car draft isolation');

  await choose(photo);await change(reason(),'Mengganti foto dengan foto balap');await submit(uploadForm());const oldCount=uploads.length;upload=uploads.at(-1);
  slots[0]=uploadedSlot('brz',3,3);await act(async()=>upload.reply({error:{code:'THUMBNAIL_CHANGED',message:'Foto telah diubah.'}},409));await settle();assert.equal(uploads.length,oldCount,'Conflict never retries overwrite');assert.match(document.querySelector('[role=alert]').textContent,/admin lain/);assert.equal(document.querySelector('.vehicle-image-current img').getAttribute('src'),thumb(3).url);assert.match(document.querySelector('.vehicle-image-details .pill').textContent,/3/);assert.ok(document.querySelector('.vehicle-image-candidate'));assert.equal(saved.length,3,'Successful conflict reconciliation refreshes parent catalog');assert.equal(saved.at(-1)[0].thumbnail.url,thumb(3).url);
  await submit(uploadForm());upload=uploads.at(-1);assert.equal(new URL(upload.url,location.origin).searchParams.get('expectedVersion'),'3');slots[0]=uploadedSlot('brz',4,4);await act(async()=>upload.reply(slots[0]));await settle();assert.equal(saved.length,4);
  const deletes=()=>requests.filter(item=>item.method==='DELETE');await click(button('Hapus foto'));assert.equal(deletes().length,0,'Delete needs its explicit confirmation');await click(button('Pertahankan foto'));assert.equal(deletes().length,0);await click(button('Hapus foto'));await submit(document.querySelector('.vehicle-image-removal'));assert.equal(deletes().length,0,'Delete needs reason');await change(document.querySelector('.vehicle-image-removal input'),'Gambar tidak lagi digunakan');deleteConflict=true;await submit(document.querySelector('.vehicle-image-removal'));assert.equal(deletes().length,1);assert.match(document.querySelector('[role=alert]').textContent,/admin lain/);assert.equal(document.querySelector('.vehicle-image-removal'),null);assert.ok(document.querySelector('.vehicle-image-current img'));
  await click(button('Hapus foto'));await change(document.querySelector('.vehicle-image-removal input'),'Menghapus foto lama yang salah');await submit(document.querySelector('.vehicle-image-removal'));assert.equal(deletes().length,2);assert.deepEqual(deletes().at(-1).body,{expectedVersion:5,reason:'Menghapus foto lama yang salah'});assert.equal(document.querySelector('.vehicle-image-current img'),null);assert.equal(saved.length,6);
  console.log('PASS upload/delete CAS conflicts reload without overwrite, explicit remove confirmation+reason, correct version and restored fallback');

  await choose(new File(['webp'],'foto.webp',{type:'image/webp'}));await change(reason(),'Foto WebP untuk pengujian koneksi');await submit(uploadForm());upload=uploads.at(-1);await act(async()=>upload.onerror());await settle();assert.match(document.querySelector('[role=alert]').textContent,/Koneksi/);assert.equal(document.querySelector('.vehicle-image-progress'),null);assert.equal(saved.length,6);assert.ok(document.querySelector('.vehicle-image-candidate'));
  await submit(uploadForm());upload=uploads.at(-1);const activeBlob=document.querySelector('.vehicle-image-candidate img').getAttribute('src');await render(React.createElement('div'));assert.equal(upload.aborted,true);assert.ok(revoked.has(activeBlob));assert.equal(saved.length,6);
  let resolveOld;nextRead=new Promise(resolve=>resolveOld=resolve);await render(React.createElement(VehicleImageEditor,{...props,key:'old'}));const oldRead=requests.at(-1);await render(React.createElement('div'));assert.equal(oldRead.signal.aborted,true);
  slots[0]=uploadedSlot('brz',7,7);await render(React.createElement(VehicleImageEditor,{...props,key:'new'}));await act(async()=>resolveOld(response({cars:[uploadedSlot('brz',99,99),slots[1]],limits})));await settle();assert.equal(document.querySelector('.vehicle-image-current img').getAttribute('src'),thumb(7).url,'Stale unmounted read cannot replace current photo');
  await choose(photo);await change(reason(),'Foto khusus BRZ, jangan pindahkan');const removedDraftBlob=document.querySelector('.vehicle-image-candidate img').getAttribute('src'),beforeInvalidationUploads=uploads.length;
  await render(React.createElement(VehicleImageEditor,{...props,cars:[cars[1]],key:'new'}));assert.equal(document.querySelector('select').value,'venom-f5');assert.equal(document.querySelector('.vehicle-image-candidate'),null);assert.equal(reason().value,'');assert.ok(revoked.has(removedDraftBlob));await submit(uploadForm());assert.equal(uploads.length,beforeInvalidationUploads,'An externally removed car cannot retarget its draft photo to the fallback');
  await render(React.createElement(VehicleImageEditor,{...props,key:'new'}));await change(document.querySelector('select'),'brz');await click(button('Hapus foto'));await change(document.querySelector('.vehicle-image-removal input'),'Alasan menghapus foto BRZ saja');const beforeInvalidationDeletes=deletes().length;
  await render(React.createElement(VehicleImageEditor,{...props,cars:[cars[1]],key:'new'}));assert.equal(document.querySelector('.vehicle-image-removal'),null);assert.equal(document.querySelector('select').value,'venom-f5');assert.equal(deletes().length,beforeInvalidationDeletes,'An externally removed car cannot retarget its delete confirmation');
  assert.equal([...created.keys()].filter(url=>!revoked.has(url)).length,0,'No preview URL leaks');
  assert.ok(requests.every(item=>item.method==='GET'||item.path.startsWith('/admin/vehicle-thumbnails/')),'Photo editor cannot mutate economy, tuning, ownership or equip');
  assert.ok(uploads.every(item=>new URL(item.url,location.origin).pathname.startsWith('/api/admin/vehicle-thumbnails/')));
  assert.equal(cars[0].price,'0');assert.equal(cars[1].locked,true);assert.equal(cars[1].price,'9999999');
  console.log('PASS upload network errors, unmount abort, stale reads, external car removal clears drafts/reviews, preview cleanup and isolated photo-only writes');

  const crv={...cars[1],id:'honda-crv-rs',name:'Honda CR-V RS',thumbnail:thumb(70)};
  slots.push({carId:crv.id,version:1,thumbnail:thumb(70)});
  await render(React.createElement(VehicleImageEditor,{...props,cars:[crv],key:'reference-removal'}));
  assert.equal(document.querySelector('.vehicle-image-current img').getAttribute('src'),thumb(70).url);
  await click(button('Hapus foto'));await change(document.querySelector('.vehicle-image-removal input'),'Gunakan kembali foto referensi CR-V');
  await submit(document.querySelector('.vehicle-image-removal'));
  assert.equal(document.querySelector('.vehicle-image-current img').getAttribute('src'),'./vehicle-photos/honda-crv-rs.png');
  assert.match(document.querySelector('[role=status]').textContent,/referensi/i);
  assert.equal(button('Hapus foto').disabled,true,'Bundled references are not deletable admin uploads');
  assert.equal(saved.at(-1).find(slot=>slot.carId===crv.id).thumbnail,null);
  console.log('PASS real editor deletion restores the bundled reference and reports its unchanged provenance');
}finally{
  await act(async()=>root.unmount());URL.createObjectURL=nativeCreate;URL.revokeObjectURL=nativeRevoke;await rm(temp,{recursive:true,force:true});
}
