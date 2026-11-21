import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {copyFile,mkdtemp,readdir,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {after,before,beforeEach,test} from 'node:test';
import {once} from 'node:events';
import type {Server} from 'node:http';
import express from 'express';
import pg from 'pg';
import sharp from 'sharp';
import {migrate} from '../../db/migrate.js';
import {createApiRouter} from '../../routes/index.js';
import {createServices,VehicleThumbnailService,type BackendServices} from '../index.js';
import {normalizeVehicleThumbnail} from '../vehicle-thumbnails.js';
import type {AuthResult} from '../accounts.js';
import {VEHICLE_THUMBNAIL_LIMITS as LIMITS,type VehicleThumbnailSlot} from '../../../shared/vehicle-thumbnails.js';

const connectionString=process.env.TEST_DATABASE_URL;
assert(connectionString&&/test/i.test(new URL(connectionString).pathname),'Use the native PostgreSQL test wrapper.');
const schema=`uv_thumbnails_${process.pid}`,control=new pg.Pool({connectionString,max:2}),origin='http://127.0.0.1:43995',password='Thumbnail-Fixture-Only-2026!';
const clearTime=new Date('2026-11-20T03:00:00.000Z'),reason='Update vehicle photo fixture';
let pool:pg.Pool,services:BackendServices,http:Server,base:string,operator:AuthResult,player:AuthResult,legacyDirectory:string,legacy:any,now=new Date(clearTime),jpeg:Buffer,png:Buffer,webp:Buffer;
const isCode=(code:string)=>(error:unknown)=>(error as {code?:string})?.code===code;
const apiPath=(car='brz',version=1)=>`/admin/vehicle-thumbnails/${car}?expectedVersion=${version}&reason=${encodeURIComponent(reason)}`;
async function publishedRuleRows(){
  return (await pool.query(`SELECT r.*,
    (SELECT jsonb_agg(c ORDER BY c.car_id) FROM ruleset_cars c WHERE c.ruleset_id=r.id) AS cars
    FROM rulesets r JOIN app_state a ON a.active_ruleset_id=r.id WHERE a.singleton=true`)).rows[0];
}

before(async()=>{
  await control.query(`CREATE SCHEMA ${schema}`);pool=new pg.Pool({connectionString,options:`-c search_path=${schema}`,max:12});
  legacyDirectory=await mkdtemp(path.join(tmpdir(),'uv-thumbnail-legacy-'));
  for(const name of await readdir('database/migrations'))if(/^00[1-9]_/.test(name))await copyFile(path.join('database/migrations',name),path.join(legacyDirectory,name));
  assert.equal((await migrate(pool,legacyDirectory)).length,9);services=createServices(pool,{prayerNow:()=>new Date(now)});
  await services.accounts.createAdmin({email:'photo-admin@example.test',displayName:'Photo Operator',password});operator=await services.accounts.login({email:'photo-admin@example.test',password});
  player=await services.accounts.register({email:'photo-player@example.test',displayName:'Photo Racer',password});
  await services.economy.purchase(player.user.id,{itemId:'six-spoke',catalogVersion:1},'thumbnail-fixture-wheel');
  await services.admin.updateCatalog(operator.user.id,'brz',{expectedVersion:1,price:'12345',locked:true,reason:'Existing administrator catalog state'});
  jpeg=await sharp({create:{width:1200,height:300,channels:3,background:'#245580'}}).jpeg().toBuffer();
  png=await sharp({create:{width:80,height:40,channels:4,background:{r:20,g:40,b:90,alpha:0}}}).png().toBuffer();
  webp=await sharp({create:{width:400,height:800,channels:3,background:'#d68910'}}).webp().toBuffer();
  const legacyImage=await services.media.upload(operator.user.id,'loading_image','Old loading.jpg',jpeg,'image/jpeg');
  await services.media.updatePresentation(operator.user.id,{expectedVersion:1,garageMusicId:null,loadingImageId:legacyImage.asset.id,musicVolume:.25,reason:'Existing loading image before thumbnails'});
  legacy={catalog:(await pool.query('SELECT * FROM catalog_items ORDER BY id')).rows,rules:await publishedRuleRows(),presentation:await services.media.getPresentation()};
  const beforeAccounts=(await pool.query('SELECT row_to_json(l) AS loadout,row_to_json(w) AS wallet FROM loadouts l JOIN wallets w ON w.user_id=l.user_id ORDER BY l.user_id')).rows;
  await copyFile('database/migrations/010_vehicle_thumbnails.sql',path.join(legacyDirectory,'010_vehicle_thumbnails.sql'));
  assert.deepEqual(await migrate(pool,legacyDirectory),['010_vehicle_thumbnails.sql']);
  assert.deepEqual((await pool.query('SELECT * FROM catalog_items ORDER BY id')).rows,legacy.catalog);
  assert.deepEqual(await publishedRuleRows(),legacy.rules);
  assert.deepEqual((await pool.query('SELECT row_to_json(l) AS loadout,row_to_json(w) AS wallet FROM loadouts l JOIN wallets w ON w.user_id=l.user_id ORDER BY l.user_id')).rows,beforeAccounts);
  // Upgrade the independent cosmetics schema before exercising current services.
  assert.deepEqual(await migrate(pool),['011_stock_rim_and_stripe_paint.sql','012_reference_vehicle_name.sql','013_panther_grand_touring.sql']);
  legacy.catalog=(await pool.query('SELECT * FROM catalog_items ORDER BY id')).rows;legacy.profile=await services.economy.getProfile(player.user.id);legacy.rules=await services.economy.getActiveRuleset();
  const app=express();app.use(express.json({limit:'32kb'}));app.use('/api',createApiRouter({services,allowedOrigins:[origin],secureCookies:false}));
  http=app.listen(0,'127.0.0.1');await once(http,'listening');const address=http.address();assert(address&&typeof address==='object');base=`http://127.0.0.1:${address.port}/api`;
});
beforeEach(async()=>{
  now=new Date(clearTime);await pool.query('UPDATE vehicle_thumbnail_slots SET thumbnail_id=NULL,version=1');await pool.query('DELETE FROM vehicle_thumbnail_assets');await pool.query('DELETE FROM user_prayer_state');
});
after(async()=>{
  if(http)await new Promise<void>((resolve,reject)=>http.close(error=>error?reject(error):resolve()));if(pool)await pool.end();await control.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await control.end();if(legacyDirectory)await rm(legacyDirectory,{recursive:true,force:true});
});
interface Options {method?:string;body?:unknown;raw?:Buffer;type?:string;user?:AuthResult|null;csrf?:string|null;origin?:string|null;headers?:Record<string,string>}
async function request(uri:string,options:Options={}):Promise<Response> {
  const who=options.user===undefined?operator:options.user,headers:Record<string,string>={'Content-Type':options.type??'application/json',...options.headers};
  if(options.origin!==null)headers.Origin=options.origin??origin;if(who){headers.Cookie=`uv_session=${who.sessionToken}`;if(options.csrf!==null)headers['X-CSRF-Token']=options.csrf??who.csrfToken;}
  return fetch(base+uri,{method:options.method??'GET',headers,...(options.raw?{body:new Uint8Array(options.raw)}:options.body!==undefined?{body:JSON.stringify(options.body)}:{})});
}
async function failure(status:number,code:string,uri:string,options:Options={}) {const response=await request(uri,options);assert.equal(response.status,status);assert.equal((await response.json() as any).error.code,code);}
async function replace(car='brz',version=1,data=jpeg,type='image/jpeg'):Promise<VehicleThumbnailSlot> {return services.vehicleThumbnails.replace(operator.user.id,car,version,reason,data,type);}

test('additive migration10 preserves purchase catalog, ownership, wallet, tuning and presentation media',async()=>{
  assert.deepEqual(await migrate(pool),[]);
  assert.deepEqual((await pool.query('SELECT * FROM catalog_items ORDER BY id')).rows,legacy.catalog);
  assert.deepEqual(await services.economy.getProfile(player.user.id),legacy.profile);assert.deepEqual(await services.economy.getActiveRuleset(),legacy.rules);assert.deepEqual(await services.media.getPresentation(),legacy.presentation);
  const list=await services.vehicleThumbnails.list(operator.user.id);assert.equal(list.cars.length,16);assert(list.cars.every(slot=>slot.version===1&&slot.thumbnail===null));assert.deepEqual(list.limits,LIMITS);
  const catalog=await services.economy.getCatalog();assert(catalog.cars.every(car=>car.thumbnail===null));assert(catalog.wheels.every(wheel=>!('thumbnail' in wheel)));
});

test('JPEG/PNG/WebP become small WebP photos preserving aspect, full frame and alpha without enlarging',async()=>{
  for(const [data,mime,width,height]of [[jpeg,'image/jpeg',512,128],[png,'image/png',80,40],[webp,'image/webp',144,288]] as const){
    const output=await normalizeVehicleThumbnail(data,mime);assert.equal(output.width,width);assert.equal(output.height,height);assert(output.content.length<=LIMITS.outputBytes);const metadata=await sharp(output.content).metadata();assert.equal(metadata.format,'webp');assert.equal(metadata.width,width);assert.equal(metadata.height,height);
  }
  const transparent=await normalizeVehicleThumbnail(png,'image/png');assert.equal((await sharp(transparent.content).metadata()).hasAlpha,true);
  const raw=await sharp(transparent.content).raw().toBuffer({resolveWithObject:true});assert.equal(raw.info.channels,4);assert.equal(raw.data[3],0);
  // Distinct colored edges remain present: fit-inside never center-crops the vehicle.
  const edges=await sharp({create:{width:800,height:200,channels:3,background:'white'}}).composite([
    {input:await sharp({create:{width:100,height:200,channels:3,background:'red'}}).png().toBuffer(),left:0,top:0},
    {input:await sharp({create:{width:100,height:200,channels:3,background:'blue'}}).png().toBuffer(),left:700,top:0},
  ]).png().toBuffer();
  const full=await normalizeVehicleThumbnail(edges,'image/png'),pixels=await sharp(full.content).raw().toBuffer({resolveWithObject:true});
  const left=(20*full.width+10)*pixels.info.channels,right=(20*full.width+full.width-11)*pixels.info.channels;
  assert(pixels.data[left]!>200&&pixels.data[left+2]!<50);assert(pixels.data[right+2]!>200&&pixels.data[right]!<50);
});

test('orientation is applied before sizing and EXIF/ICC metadata is stripped',async()=>{
  const input=await sharp({create:{width:400,height:200,channels:3,background:'#133755'}}).withMetadata({orientation:6}).jpeg().toBuffer();assert((await sharp(input).metadata()).exif);
  const output=await normalizeVehicleThumbnail(input,'image/jpeg'),meta=await sharp(output.content).metadata();assert.equal(meta.width,144);assert.equal(meta.height,288);assert.equal(meta.exif,undefined);assert.equal(meta.icc,undefined);assert.equal(meta.orientation,undefined);
});

test('fake, truncated, mismatched, empty and oversized image payloads are rejected',async()=>{
  for(const [data,mime]of [[jpeg,'image/jpeg'],[png,'image/png'],[webp,'image/webp']] as const)await assert.rejects(normalizeVehicleThumbnail(data.subarray(0,Math.floor(data.length/2)),mime),isCode('INVALID_THUMBNAIL'));
  for(const [data,mime]of [[Buffer.from('<svg/>'),'image/png'],[Buffer.from([255,216,255,217]),'image/jpeg'],[Buffer.from('RIFFxxxxWEBPfake'),'image/webp'],[png,'image/jpeg'],[jpeg,'image/webp']] as const)await assert.rejects(normalizeVehicleThumbnail(data,mime),isCode('INVALID_THUMBNAIL'));
  await assert.rejects(normalizeVehicleThumbnail(Buffer.alloc(0),'image/png'),isCode('EMPTY_THUMBNAIL'));
  await assert.rejects(normalizeVehicleThumbnail(Buffer.alloc(LIMITS.inputBytes+1),'image/jpeg'),isCode('THUMBNAIL_TOO_LARGE'));
  await assert.rejects(normalizeVehicleThumbnail(png,'image/svg+xml'),isCode('THUMBNAIL_TYPE_REQUIRED'));
  const large=await sharp({create:{width:4001,height:4000,channels:3,background:'white'}}).jpeg().toBuffer();assert(large.length<LIMITS.inputBytes);await assert.rejects(normalizeVehicleThumbnail(large,'image/jpeg'),isCode('INVALID_THUMBNAIL'));
  assert.equal((await pool.query('SELECT count(*)::int n FROM vehicle_thumbnail_assets')).rows[0].n,0);
});

test('raw upload enforces exact Origin, CSRF, active admin, MIME, size and route validation',async()=>{
  const body={method:'POST',raw:jpeg,type:'image/jpeg'};
  await failure(403,'ORIGIN_REJECTED',apiPath(),{...body,origin:null});await failure(403,'ORIGIN_REJECTED',apiPath(),{...body,origin:'https://attacker.example'});await failure(403,'ORIGIN_REJECTED',apiPath(),{...body,headers:{'Sec-Fetch-Site':'cross-site'}});
  await failure(401,'AUTH_REQUIRED',apiPath(),{...body,user:null});await failure(403,'ADMIN_REQUIRED',apiPath(),{...body,user:player});await failure(403,'CSRF_REJECTED',apiPath(),{...body,csrf:null});await failure(403,'CSRF_REJECTED',apiPath(),{...body,csrf:'wrong'});
  await failure(415,'THUMBNAIL_TYPE_REQUIRED',apiPath(),{...body,type:'application/octet-stream'});await failure(415,'THUMBNAIL_ENCODING_UNSUPPORTED',apiPath(),{...body,headers:{'Content-Encoding':'gzip'}});
  await failure(413,'THUMBNAIL_TOO_LARGE',apiPath(),{...body,raw:Buffer.alloc(LIMITS.inputBytes+1)});await failure(400,'INVALID_CAR',apiPath('unknown-car'),body);
  await failure(400,'INVALID_NUMBER','/admin/vehicle-thumbnails/brz?reason=Reason',{...body});
  await pool.query('UPDATE users SET disabled=true WHERE id=$1',[operator.user.id]);
  try{await failure(401,'AUTH_REQUIRED',apiPath(),body);await assert.rejects(replace(),isCode('ADMIN_REQUIRED'));}finally{await pool.query('UPDATE users SET disabled=false WHERE id=$1',[operator.user.id]);}
  await assert.rejects(services.vehicleThumbnails.replace(player.user.id,'brz',1,reason,jpeg,'image/jpeg'),isCode('ADMIN_REQUIRED'));
  assert.equal((await pool.query('SELECT count(*)::int n FROM vehicle_thumbnail_assets')).rows[0].n,0);
});

test('all accepted formats upload through HTTP and appear in public catalog without changing purchase/access versions',async()=>{
  for(const [car,data,type]of [['brz',jpeg,'image/jpeg'],['aventador',png,'image/png'],['skyline',webp,'image/webp']] as const){
    const response=await request(apiPath(car),{method:'POST',raw:data,type});assert.equal(response.status,201);const slot=await response.json() as VehicleThumbnailSlot;assert.equal(slot.carId,car);assert.equal(slot.version,2);assert.equal(slot.thumbnail?.mimeType,'image/webp');assert.match(slot.thumbnail!.url,/^\/api\/vehicle-thumbnails\/[a-f0-9-]+$/);
    const catalog=await request('/catalog',{user:null,origin:null}),payload=await catalog.json() as any;assert.deepEqual(payload.cars.find((item:any)=>item.id===car).thumbnail,slot.thumbnail);assert(!JSON.stringify(slot.thumbnail).includes(operator.user.id));
  }
  assert.deepEqual((await pool.query('SELECT * FROM catalog_items ORDER BY id')).rows,legacy.catalog);assert.deepEqual(await services.economy.getProfile(player.user.id),legacy.profile);assert.deepEqual(await services.economy.getActiveRuleset(),legacy.rules);assert.deepEqual(await services.media.getPresentation(),legacy.presentation);
});

test('concurrent per-car CAS replacement yields one winner, no orphan assets and independent versions',async()=>{
  const attempts=await Promise.allSettled([replace('brz',1,jpeg,'image/jpeg'),replace('brz',1,png,'image/png')]);assert.equal(attempts.filter(value=>value.status==='fulfilled').length,1);assert.equal((attempts.find(value=>value.status==='rejected') as PromiseRejectedResult).reason.code,'THUMBNAIL_CHANGED');
  const first=(attempts.find(value=>value.status==='fulfilled') as PromiseFulfilledResult<VehicleThumbnailSlot>).value;assert.equal(first.version,2);
  assert.equal((await pool.query('SELECT count(*)::int n FROM vehicle_thumbnail_assets')).rows[0].n,1);assert.equal((await services.vehicleThumbnails.list(operator.user.id)).cars.find(slot=>slot.carId==='skyline')!.version,1);
  const next=await replace('brz',first.version,webp,'image/webp');assert.equal(next.version,3);assert.notEqual(next.thumbnail!.id,first.thumbnail!.id);assert.equal((await pool.query('SELECT count(*)::int n FROM vehicle_thumbnail_assets')).rows[0].n,1);await assert.rejects(services.vehicleThumbnails.read(first.thumbnail!.id),isCode('THUMBNAIL_NOT_FOUND'));
});

test('CAS removal restores fallback, rejects stale requests and records audit without leaving bytes',async()=>{
  const slot=await replace();const endpoint='/admin/vehicle-thumbnails/brz';
  await failure(403,'ADMIN_REQUIRED',endpoint,{method:'DELETE',body:{expectedVersion:slot.version,reason},user:player});await failure(403,'CSRF_REJECTED',endpoint,{method:'DELETE',body:{expectedVersion:slot.version,reason},csrf:null});await failure(403,'ORIGIN_REJECTED',endpoint,{method:'DELETE',body:{expectedVersion:slot.version,reason},origin:null});
  await failure(409,'THUMBNAIL_CHANGED',endpoint,{method:'DELETE',body:{expectedVersion:1,reason}});assert((await services.vehicleThumbnails.read(slot.thumbnail!.id)).content);
  const response=await request(endpoint,{method:'DELETE',body:{expectedVersion:slot.version,reason}});assert.equal(response.status,200);assert.deepEqual(await response.json(),{carId:'brz',version:3,thumbnail:null});assert.equal((await services.economy.getCatalog()).cars.find(car=>car.id==='brz')!.thumbnail,null);
  await failure(409,'THUMBNAIL_CHANGED',apiPath('brz',2),{method:'POST',raw:jpeg,type:'image/jpeg'});await failure(409,'THUMBNAIL_EMPTY',endpoint,{method:'DELETE',body:{expectedVersion:3,reason}});
  assert.equal((await pool.query('SELECT count(*)::int n FROM vehicle_thumbnail_assets')).rows[0].n,0);const audit=(await pool.query("SELECT before_data,after_data FROM admin_audit WHERE action='vehicle.thumbnail.deleted' AND before_data->'thumbnail'->>'id'=$1",[slot.thumbnail!.id])).rows[0];assert.equal(audit.before_data.version,2);assert.equal(audit.after_data.version,3);assert.equal(audit.after_data.thumbnail,null);
});

test('normalized bytes persist in PostgreSQL and immutable GET/HEAD/ETag delivery exposes no uploader metadata',async()=>{
  const slot=await replace(),asset=slot.thumbnail!,url=asset.url.replace(/^\/api/,'');
  const secondPool=new pg.Pool({connectionString,options:`-c search_path=${schema}`,max:2});
  try{const restarted=new VehicleThumbnailService(secondPool),stored=await restarted.read(asset.id);assert.deepEqual(stored.thumbnail,asset);assert.equal(stored.content!.length,asset.bytes);assert.deepEqual((await restarted.list(operator.user.id)).cars.find(value=>value.carId==='brz'),slot);}finally{await secondPool.end();}
  const response=await request(url,{user:null,origin:null});assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/webp');assert.match(response.headers.get('cache-control')!,/immutable/);assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.equal(response.headers.get('content-length'),String(asset.bytes));
  const decoded=await sharp(Buffer.from(await response.arrayBuffer())).metadata();assert.equal(decoded.format,'webp');assert.equal(decoded.exif,undefined);assert.equal(decoded.icc,undefined);
  const head=await request(url,{method:'HEAD',user:null});assert.equal(head.status,200);assert.equal(head.headers.get('content-length'),String(asset.bytes));assert.equal((await head.arrayBuffer()).byteLength,0);
  const cached=await request(url,{user:null,headers:{'If-None-Match':response.headers.get('etag')!}});assert.equal(cached.status,304);assert.equal((await cached.arrayBuffer()).byteLength,0);
  await assert.rejects(pool.query('UPDATE vehicle_thumbnail_assets SET bytes=bytes WHERE id=$1',[asset.id]),isCode('55000'));
});

test('admin listing is private and prayer blocks replace/remove while catalog and image reads remain available',async()=>{
  await failure(401,'AUTH_REQUIRED','/admin/vehicle-thumbnails',{user:null});await failure(403,'ADMIN_REQUIRED','/admin/vehicle-thumbnails',{user:player});
  const slot=await replace(),day=await services.prayer.status(operator.user.id),window=day.dailyTimes.find(item=>item.prayer==='dhuhr');assert(window);now=new Date(window.startedAt);
  await failure(423,'PRAYER_BREAK',apiPath('brz',slot.version),{method:'POST',raw:png,type:'image/png'});await failure(423,'PRAYER_BREAK','/admin/vehicle-thumbnails/brz',{method:'DELETE',body:{expectedVersion:slot.version,reason}});
  assert.equal((await request('/catalog',{user:null})).status,200);assert.equal((await request(slot.thumbnail!.url.replace(/^\/api/,''),{user:null,method:'HEAD'})).status,200);assert.equal((await request('/admin/vehicle-thumbnails')).status,200);assert.deepEqual((await services.vehicleThumbnails.list(operator.user.id)).cars.find(value=>value.carId==='brz'),slot);
});

test('late audit failure rolls back a replacement, including previous bytes and slot version',async()=>{
  const previous=await replace(),before=await services.vehicleThumbnails.read(previous.thumbnail!.id);
  await pool.query(`CREATE FUNCTION fail_thumbnail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='vehicle.thumbnail.updated' THEN RAISE EXCEPTION 'thumbnail audit failure' USING ERRCODE='P0001'; END IF; RETURN NEW; END; $$`);
  await pool.query('CREATE TRIGGER thumbnail_test_audit BEFORE INSERT ON admin_audit FOR EACH ROW EXECUTE FUNCTION fail_thumbnail_audit()');
  try{await assert.rejects(replace('brz',previous.version,png,'image/png'),isCode('P0001'));}finally{await pool.query('DROP TRIGGER thumbnail_test_audit ON admin_audit');await pool.query('DROP FUNCTION fail_thumbnail_audit()');}
  assert.deepEqual((await services.vehicleThumbnails.list(operator.user.id)).cars.find(value=>value.carId==='brz'),previous);assert.deepEqual((await services.vehicleThumbnails.read(previous.thumbnail!.id)).content,before.content);assert.equal((await pool.query('SELECT count(*)::int n FROM vehicle_thumbnail_assets')).rows[0].n,1);
});
