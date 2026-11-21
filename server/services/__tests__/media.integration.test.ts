import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { after, before, beforeEach, test } from 'node:test';
import { once } from 'node:events';
import type { Server } from 'node:http';
import express from 'express';
import pg from 'pg';
import sharp from 'sharp';
import { migrate } from '../../db/migrate.js';
import { createApiRouter } from '../../routes/index.js';
import { createServices, MediaService, type BackendServices } from '../index.js';
import { validateMedia } from '../media-validation.js';
import type { AuthResult } from '../accounts.js';
import { MEDIA_LIMITS, type MediaKind, type PresentationSettings } from '../../../shared/media.js';

const connectionString=process.env.TEST_DATABASE_URL;
assert(connectionString&&/test/i.test(new URL(connectionString).pathname),'Use the native PostgreSQL test wrapper.');
const schema=`uv_media_${process.pid}`,control=new pg.Pool({connectionString,max:2});
const origin='http://127.0.0.1:43993',password='Media-Fixture-Only-2026!',clearTime=new Date('2026-11-20T03:00:00.000Z');
let pool:pg.Pool,services:BackendServices,http:Server,base:string,operator:AuthResult,player:AuthResult,now=new Date(clearTime),mp3:Buffer,jpeg:Buffer;
const isCode=(code:string)=>(error:unknown)=>(error as {code?:string})?.code===code;
const update=(current:PresentationSettings,fields:Record<string,unknown>={})=>({expectedVersion:current.version,garageMusicId:current.garageMusic?.id??null,loadingImageId:current.loadingImage?.id??null,musicVolume:current.musicVolume,reason:'Media integration fixture',...fields});

before(async()=>{
  await control.query(`CREATE SCHEMA ${schema}`);
  pool=new pg.Pool({connectionString,options:`-c search_path=${schema}`,max:12});
  assert.equal((await migrate(pool)).length,14);
  services=createServices(pool,{prayerNow:()=>new Date(now)});
  await services.accounts.createAdmin({email:'media-admin@example.test',displayName:'Media Operator',password});
  operator=await services.accounts.login({email:'media-admin@example.test',password});
  player=await services.accounts.register({email:'media-player@example.test',displayName:'Media Racer',password});
  mp3=await readFile('tests/fixtures/media/mpeg1-cbr.mp3');
  jpeg=await sharp({create:{width:48,height:24,channels:3,background:'#123456'}}).withMetadata({orientation:6}).jpeg().toBuffer();
  const app=express();app.use(express.json({limit:'32kb'}));app.use('/api',createApiRouter({services,allowedOrigins:[origin],secureCookies:false}));
  http=app.listen(0,'127.0.0.1');await once(http,'listening');
  const address=http.address();assert(address&&typeof address==='object');base=`http://127.0.0.1:${address.port}/api`;
});
beforeEach(async()=>{
  now=new Date(clearTime);
  await pool.query('UPDATE presentation_settings SET garage_music_id=NULL,loading_image_id=NULL,music_volume=0.35,version=1 WHERE singleton=true');
  await pool.query('DELETE FROM presentation_assets');
  await pool.query('DELETE FROM user_prayer_state');
});
after(async()=>{
  if(http)await new Promise<void>((resolve,reject)=>http.close(error=>error?reject(error):resolve()));
  if(pool)await pool.end();await control.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await control.end();
});

interface RequestOptions {method?:string;user?:AuthResult|null;body?:unknown;raw?:Buffer;type?:string;origin?:string|null;csrf?:string|null;headers?:Record<string,string>}
async function request(path:string,options:RequestOptions={}):Promise<Response> {
  const who=options.user===undefined?operator:options.user;
  const headers:Record<string,string>={'Content-Type':options.type??'application/json',...options.headers};
  if(options.origin!==null)headers.Origin=options.origin??origin;
  if(who){headers.Cookie=`uv_session=${who.sessionToken}`;if(options.csrf!==null)headers['X-CSRF-Token']=options.csrf??who.csrfToken;}
  return fetch(base+path,{method:options.method??'GET',headers,...(options.raw?{body:new Uint8Array(options.raw)}:options.body!==undefined?{body:JSON.stringify(options.body)}:{})});
}
async function upload(kind:MediaKind='garage_music',data=mp3,name=kind==='garage_music'?'Fixture tone.mp3':'Fixture loading.jpg') {
  return services.media.upload(operator.user.id,kind,name,data,kind==='garage_music'?'audio/mpeg':'image/jpeg');
}
async function expectHttp(code:number,error:string,path:string,options:RequestOptions) {
  const response=await request(path,options);assert.equal(response.status,code);assert.equal((await response.json() as any).error.code,error);
}

test('public defaults contain no media, and GET config remains uncached',async()=>{
  assert.deepEqual(await migrate(pool),[]);
  const response=await request('/presentation',{user:null,origin:null});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  assert.deepEqual(await response.json(),{version:1,garageMusic:null,loadingImage:null,musicVolume:0.35});
  await expectHttp(401,'AUTH_REQUIRED','/admin/media',{user:null});
});

test('MP3 validates complete CBR/VBR MPEG1/2/2.5 frames and strips tags',async()=>{
  for(const name of ['mpeg1-cbr.mp3','mpeg2-vbr.mp3','mpeg25-cbr.mp3']) {
    const data=await readFile(`tests/fixtures/media/${name}`),valid=await validateMedia('garage_music',data,'audio/mpeg');
    assert(valid.durationSeconds!>0.4);assert(valid.durationSeconds!<1);assert.equal(valid.mimeType,'audio/mpeg');assert.equal(valid.width,null);assert.equal(valid.content[0],255);
    if(name!=='mpeg25-cbr.mp3')assert(valid.content.length<data.length);
    await assert.rejects(validateMedia('garage_music',data.subarray(0,data.length-7),'audio/mpeg'),isCode('INVALID_MP3'));
  }
  const stripped=await validateMedia('garage_music',mp3,'audio/mpeg');
  const id3v1=Buffer.alloc(128);id3v1.write('TAG');
  assert.deepEqual((await validateMedia('garage_music',Buffer.concat([stripped.content,id3v1]),'audio/mpeg')).content,stripped.content);
  for(const fake of [Buffer.from('ID3not an audio file'),Buffer.from('RIFF pretend mp3'),Buffer.from('<html>fake.mp3</html>'),Buffer.from([255,251,144,0])])
    await assert.rejects(validateMedia('garage_music',fake,'audio/mpeg'),isCode('INVALID_MP3'));
});

test('JPEG is fully decoded, orientation applied, and private metadata removed',async()=>{
  assert((await sharp(jpeg).metadata()).exif);
  const valid=await validateMedia('loading_image',jpeg,'image/jpeg');
  assert.equal(valid.width,24);assert.equal(valid.height,48);
  const stored=await sharp(valid.content).metadata();assert.equal(stored.format,'jpeg');assert.equal(stored.exif,undefined);assert.equal(stored.icc,undefined);assert.equal(stored.orientation,undefined);
  await assert.rejects(validateMedia('loading_image',jpeg.subarray(0,jpeg.length-25),'image/jpeg'),isCode('INVALID_JPEG'));
  await assert.rejects(validateMedia('loading_image',Buffer.from([255,216,255,217]),'image/jpeg'),isCode('INVALID_JPEG'));
  const png=await sharp({create:{width:5,height:5,channels:3,background:'red'}}).png().toBuffer();
  await assert.rejects(validateMedia('loading_image',png,'image/jpeg'),isCode('INVALID_JPEG'));
  const wide=await sharp({create:{width:8193,height:1,channels:3,background:'red'}}).jpeg().toBuffer();
  await assert.rejects(validateMedia('loading_image',wide,'image/jpeg'),isCode('IMAGE_DIMENSIONS'));
});

test('upload rejects excess bytes, incorrect MIME, empty content and filesystem-like names',async()=>{
  await assert.rejects(upload('garage_music',Buffer.alloc(MEDIA_LIMITS.garageMusicBytes+1)),isCode('MEDIA_TOO_LARGE'));
  await assert.rejects(upload('loading_image',Buffer.alloc(MEDIA_LIMITS.loadingImageBytes+1)),isCode('MEDIA_TOO_LARGE'));
  await assert.rejects(upload('garage_music',Buffer.alloc(0)),isCode('EMPTY_MEDIA'));
  await assert.rejects(upload('garage_music',mp3,'../../secret.mp3'),isCode('INVALID_MEDIA_NAME'));
  await assert.rejects(services.media.upload(operator.user.id,'garage_music','fake.mp3',mp3,'image/jpeg'),isCode('MEDIA_TYPE_REQUIRED'));
  assert.equal((await services.media.list(operator.user.id)).assets.length,0);
});

test('real binary HTTP upload retains Origin, CSRF, role, type and size protections',async()=>{
  const path='/admin/media/garage_music?name=Garage%20tone.mp3',body={method:'POST',raw:mp3,type:'audio/mpeg'};
  await expectHttp(403,'ORIGIN_REJECTED',path,{...body,origin:null});
  await expectHttp(403,'ORIGIN_REJECTED',path,{...body,origin:'https://attacker.example'});
  await expectHttp(403,'ORIGIN_REJECTED',path,{...body,headers:{'Sec-Fetch-Site':'cross-site'}});
  await expectHttp(401,'AUTH_REQUIRED',path,{...body,user:null});
  await expectHttp(403,'CSRF_REJECTED',path,{...body,csrf:null});
  await expectHttp(403,'CSRF_REJECTED',path,{...body,csrf:'forged'});
  await expectHttp(403,'ADMIN_REQUIRED',path,{...body,user:player});
  await expectHttp(415,'MEDIA_TYPE_REQUIRED',path,{...body,type:'application/octet-stream'});
  await expectHttp(415,'MEDIA_ENCODING_UNSUPPORTED',path,{...body,headers:{'Content-Encoding':'gzip'}});
  await expectHttp(413,'MEDIA_TOO_LARGE','/admin/media/loading_image?name=Large.jpg',{method:'POST',raw:Buffer.alloc(MEDIA_LIMITS.loadingImageBytes+1),type:'image/jpeg'});
  const accepted=await request(path,body);assert.equal(accepted.status,201);const first=(await accepted.json() as any).asset;assert.equal(first.name,'Garage tone.mp3');assert.match(first.url,/^\/api\/media\/[a-f0-9-]+$/);assert.equal(first.kind,'garage_music');
  const image=await request('/admin/media/loading_image?name=Track.jpg',{method:'POST',raw:jpeg,type:'image/jpeg'});assert.equal(image.status,201);assert.equal((await image.json() as any).asset.mimeType,'image/jpeg');
  assert.equal((await services.media.getPresentation()).garageMusic,null);
});

test('uploads deduplicate, are audited once, and survive new database connections',async()=>{
  const [a,b]=await Promise.all([upload(),upload()]);assert.equal(a.asset.id,b.asset.id);
  const stored=(await pool.query('SELECT content,bytes FROM presentation_assets WHERE id=$1',[a.asset.id])).rows[0];
  assert.equal(stored.content.length,a.asset.bytes);assert.equal(stored.bytes,a.asset.bytes);
  assert.equal((await pool.query("SELECT count(*)::int n FROM admin_audit WHERE action='media.uploaded' AND target_id=$1",[a.asset.id])).rows[0].n,1);
  const active=await services.media.updatePresentation(operator.user.id,update(await services.media.getPresentation(),{garageMusicId:a.asset.id}));
  const secondPool=new pg.Pool({connectionString,options:`-c search_path=${schema}`,max:2});
  try {const service=new MediaService(secondPool);assert.deepEqual(await service.getPresentation(),active);assert.deepEqual(await service.read(a.asset.id,0,a.asset.bytes-1),stored.content);}
  finally {await secondPool.end();}
});

test('simultaneous settings writes use CAS and validate slot types and asset existence',async()=>{
  const music=await upload(),image=await upload('loading_image',jpeg),initial=await services.media.getPresentation();
  const attempts=await Promise.allSettled([0.2,0.6].map(volume=>services.media.updatePresentation(operator.user.id,update(initial,{garageMusicId:music.asset.id,loadingImageId:image.asset.id,musicVolume:volume}))));
  assert.equal(attempts.filter(value=>value.status==='fulfilled').length,1);
  const rejected=attempts.find(value=>value.status==='rejected') as PromiseRejectedResult;assert.equal(rejected.reason.code,'PRESENTATION_CHANGED');
  const active=await services.media.getPresentation();assert.equal(active.version,2);assert.equal(active.garageMusic?.id,music.asset.id);assert.equal(active.loadingImage?.id,image.asset.id);
  await assert.rejects(services.media.updatePresentation(operator.user.id,update(active,{garageMusicId:image.asset.id})),isCode('MEDIA_KIND_MISMATCH'));
  await assert.rejects(services.media.updatePresentation(operator.user.id,update(active,{loadingImageId:randomUUID()})),isCode('MEDIA_NOT_FOUND'));
  await assert.rejects(services.media.updatePresentation(operator.user.id,update(active,{musicVolume:Infinity})),isCode('INVALID_VOLUME'));
  assert.deepEqual(await services.media.getPresentation(),active);
});

test('settings and removal HTTP endpoints enforce the same security boundaries',async()=>{
  const {asset}=await upload(),current=await services.media.getPresentation(),body=update(current,{garageMusicId:asset.id});
  await expectHttp(403,'ADMIN_REQUIRED','/admin/presentation',{method:'PUT',body,user:player});
  await expectHttp(403,'CSRF_REJECTED','/admin/presentation',{method:'PUT',body,csrf:'wrong'});
  await expectHttp(403,'ORIGIN_REJECTED','/admin/presentation',{method:'PUT',body,origin:null});
  const accepted=await request('/admin/presentation',{method:'PUT',body});assert.equal(accepted.status,200);assert.equal((await accepted.json() as any).garageMusic.id,asset.id);
  await expectHttp(409,'PRESENTATION_CHANGED','/admin/presentation',{method:'PUT',body});
  await expectHttp(403,'ADMIN_REQUIRED',`/admin/media/${asset.id}`,{method:'DELETE',body:{reason:'Test deletion'},user:player});
  await expectHttp(403,'CSRF_REJECTED',`/admin/media/${asset.id}`,{method:'DELETE',body:{reason:'Test deletion'},csrf:null});
  await assert.rejects(services.media.upload(player.user.id,'garage_music','tone.mp3',mp3,'audio/mpeg'),isCode('ADMIN_REQUIRED'));
});

test('active media cannot be deleted; deselection and deletion are auditable',async()=>{
  const {asset}=await upload();
  let current=await services.media.updatePresentation(operator.user.id,update(await services.media.getPresentation(),{garageMusicId:asset.id}));
  await expectHttp(409,'MEDIA_IN_USE',`/admin/media/${asset.id}`,{method:'DELETE',body:{reason:'Cannot delete active music'}});
  current=await services.media.updatePresentation(operator.user.id,update(current,{garageMusicId:null}));
  const removed=await request(`/admin/media/${asset.id}`,{method:'DELETE',body:{reason:'Remove inactive test music'}});assert.equal(removed.status,200);assert.deepEqual(await removed.json(),{deleted:true});
  await expectHttp(404,'MEDIA_NOT_FOUND',`/media/${asset.id}`,{user:null});
  const audit=(await pool.query("SELECT before_data,after_data FROM admin_audit WHERE action='media.deleted' AND target_id=$1",[asset.id])).rows[0];
  assert.equal(audit.before_data.id,asset.id);assert.deepEqual(audit.after_data,{deleted:true});assert.deepEqual(await services.media.getPresentation(),current);
});

test('public selected music config and audio GET/HEAD work before login with complete and byte-range payloads',async()=>{
  const {asset}=await upload(),bytes=await services.media.read(asset.id,0,asset.bytes-1);
  const selected=await services.media.updatePresentation(operator.user.id,update(await services.media.getPresentation(),{garageMusicId:asset.id,musicVolume:0.42}));
  const config=await request('/presentation',{user:null,origin:null});assert.equal(config.status,200);assert.equal(config.headers.get('cache-control'),'no-store');assert.equal(config.headers.get('set-cookie'),null);
  const publicSettings=await config.json() as PresentationSettings;assert.deepEqual(publicSettings,selected);assert(publicSettings.garageMusic);
  const path=publicSettings.garageMusic.url.replace(/^\/api/,'');assert.equal(path,`/media/${asset.id}`);
  const full=await request(path,{user:null,origin:null});assert.equal(full.status,200);assert.equal(full.headers.get('content-type'),'audio/mpeg');assert.equal(full.headers.get('content-length'),String(bytes.length));assert.equal(full.headers.get('accept-ranges'),'bytes');assert.equal(full.headers.get('x-content-type-options'),'nosniff');assert.match(full.headers.get('cache-control')!,/immutable/);assert.deepEqual(Buffer.from(await full.arrayBuffer()),bytes);
  const etag=full.headers.get('etag')!;
  const head=await request(path,{method:'HEAD',user:null});assert.equal(head.status,200);assert.equal(head.headers.get('content-length'),String(bytes.length));assert.equal((await head.arrayBuffer()).byteLength,0);
  for(const [header,start,end] of [['bytes=5-14',5,14],['bytes=8-',8,bytes.length-1],['bytes=-9',bytes.length-9,bytes.length-1],['bytes=0-999999',0,bytes.length-1]] as const) {
    const partial=await request(path,{user:null,headers:{Range:header}});assert.equal(partial.status,206);assert.equal(partial.headers.get('content-range'),`bytes ${start}-${end}/${bytes.length}`);assert.deepEqual(Buffer.from(await partial.arrayBuffer()),bytes.subarray(start,end+1));
  }
  const partialHead=await request(path,{method:'HEAD',user:null,headers:{Range:'bytes=1-2'}});assert.equal(partialHead.status,206);assert.equal(partialHead.headers.get('content-length'),'2');assert.equal((await partialHead.arrayBuffer()).byteLength,0);
  const cached=await request(path,{user:null,headers:{'If-None-Match':etag}});assert.equal(cached.status,304);assert.equal((await cached.arrayBuffer()).byteLength,0);
  const changed=await request(path,{user:null,headers:{Range:'bytes=0-4','If-Range':'"older-version"'}});assert.equal(changed.status,200);assert.deepEqual(Buffer.from(await changed.arrayBuffer()),bytes);
  const retained=await request(path,{user:null,headers:{Range:'bytes=0-4','If-Range':etag}});assert.equal(retained.status,206);assert.equal((await retained.arrayBuffer()).byteLength,5);
});

test('invalid or multiple byte ranges are rejected and public JPEG is sanitized',async()=>{
  const {asset}=await upload();
  for(const Range of [`bytes=${asset.bytes}-`, 'bytes=5-1','bytes=-0','bytes=0-1,4-5','bytes=-','bytes=9007199254740993-']) {
    const response=await request(`/media/${asset.id}`,{user:null,headers:{Range}});assert.equal(response.status,416);assert.equal(response.headers.get('content-range'),`bytes */${asset.bytes}`);
  }
  const image=await upload('loading_image',jpeg),response=await request(`/media/${image.asset.id}`,{user:null});assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/jpeg');
  const metadata=await sharp(Buffer.from(await response.arrayBuffer())).metadata();assert.equal(metadata.exif,undefined);assert.equal(metadata.width,24);
  assert(!JSON.stringify(await services.media.getPresentation()).includes('created_by'));
});

test('prayer pause blocks all media mutations while public reads stay available',async()=>{
  const {asset}=await upload(),current=await services.media.getPresentation();
  const day=await services.prayer.status(operator.user.id),window=day.dailyTimes.find(item=>item.prayer==='dhuhr');assert(window);now=new Date(window.startedAt);
  await expectHttp(423,'PRAYER_BREAK','/admin/media/garage_music?name=Pause.mp3',{method:'POST',raw:mp3,type:'audio/mpeg'});
  await expectHttp(423,'PRAYER_BREAK','/admin/presentation',{method:'PUT',body:update(current,{garageMusicId:asset.id})});
  await expectHttp(423,'PRAYER_BREAK',`/admin/media/${asset.id}`,{method:'DELETE',body:{reason:'Paused fixture removal'}});
  assert.equal((await request('/presentation',{user:null})).status,200);assert.equal((await request(`/media/${asset.id}`,{user:null,method:'HEAD'})).status,200);
  assert.deepEqual(await services.media.getPresentation(),current);assert.equal((await services.media.list(operator.user.id)).assets.length,1);
});

test('PostgreSQL prevents byte mutation and rejects incomplete media metadata',async()=>{
  const {asset}=await upload();
  await assert.rejects(pool.query('UPDATE presentation_assets SET name=$2 WHERE id=$1',[asset.id,'Mutated.mp3']),isCode('55000'));
  await assert.rejects(pool.query(`INSERT INTO presentation_assets(id,kind,name,mime_type,bytes,sha256,content)
    VALUES($1,'garage_music','missing duration','audio/mpeg',4,$2,$3)`,[randomUUID(),'a'.repeat(64),Buffer.from([255,251,0,0])]),isCode('23514'));
  await assert.rejects(pool.query(`INSERT INTO presentation_assets(id,kind,name,mime_type,bytes,sha256,content)
    VALUES($1,'loading_image','missing dimensions','image/jpeg',4,$2,$3)`,[randomUUID(),'b'.repeat(64),Buffer.from([255,216,255,217])]),isCode('23514'));
});

test('concurrent uploads cannot overrun the asset-count quota',async()=>{
  const normalized=(await validateMedia('garage_music',mp3,'audio/mpeg')).content;
  function variant(number:number):Buffer {
    // Frame private bits are valid independent metadata, changing no audio samples.
    const result=Buffer.from(normalized);let offset=0;
    for(let bit=0;bit<6;bit++) {
      const c=result[offset+2]!,bitrate=[0,32,40,48,56,64,80,96,112,128,160,192,224,256,320][c>>4]!;
      if(number&(1<<bit))result[offset+2]=c^1;
      offset+=Math.floor(144000*bitrate/44100)+((c>>1)&1);
    }
    return result;
  }
  for(let i=0;i<MEDIA_LIMITS.maxAssets-1;i++)await upload('garage_music',variant(i),`Quota ${i}.mp3`);
  const attempts=await Promise.allSettled([39,40].map(i=>upload('garage_music',variant(i),`Quota ${i}.mp3`)));
  assert.equal(attempts.filter(value=>value.status==='fulfilled').length,1);assert.equal((attempts.find(value=>value.status==='rejected') as PromiseRejectedResult).reason.code,'MEDIA_LIBRARY_FULL');
  assert.equal((await services.media.list(operator.user.id)).assets.length,MEDIA_LIMITS.maxAssets);
  assert.equal((await upload('garage_music',variant(0),'Retry at capacity.mp3')).asset.kind,'garage_music');
});
