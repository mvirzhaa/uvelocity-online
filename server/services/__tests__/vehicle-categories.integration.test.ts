import assert from 'node:assert/strict';
import {copyFile,mkdtemp,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {after,before,test} from 'node:test';
import {once} from 'node:events';
import type {Server} from 'node:http';
import express from 'express';
import pg from 'pg';
import {migrate} from '../../db/migrate.js';
import {createApiRouter} from '../../routes/index.js';
import {createServices,type BackendServices} from '../index.js';
import type {AuthResult} from '../accounts.js';
import type {VehicleCategory} from '../../../shared/vehicle-categories.js';

const connectionString=process.env.TEST_DATABASE_URL;
assert(connectionString&&/test/i.test(new URL(connectionString).pathname),'Use the native PostgreSQL test wrapper.');
const schema=`uv_categories_${process.pid}`,control=new pg.Pool({connectionString,max:2}),origin='http://127.0.0.1:43996';
const password='Vehicle-Category-Fixture-2026!',reason='Vehicle category integration fixture',clearTime=new Date('2026-11-20T03:00:00Z');
const preserved=['catalog_items','users','wallets','wallet_entries','user_items','loadouts','car_appearances','purchases','rulesets','ruleset_cars','app_state','admin_audit'];
let pool:pg.Pool,services:BackendServices,http:Server,base:string,operator:AuthResult,player:AuthResult,legacyDirectory:string,legacy:Record<string,unknown[]>,now=new Date(clearTime);
const isCode=(code:string)=>(error:unknown)=>(error as {code?:string})?.code===code;
const rows=async(table:string)=>(await pool.query(`SELECT row_to_json(t) AS value FROM ${table} t ORDER BY row_to_json(t)::text`)).rows.map(row=>row.value);

before(async()=>{
  await control.query(`CREATE SCHEMA ${schema}`);pool=new pg.Pool({connectionString,options:`-c search_path=${schema}`,max:12});
  legacyDirectory=await mkdtemp(path.join(tmpdir(),'uv-categories-legacy-'));
  for(const name of await readdir('database/migrations'))if(/^(00[1-9]|01[0-3])_/.test(name))await copyFile(path.join('database/migrations',name),path.join(legacyDirectory,name));
  assert.equal((await migrate(pool,legacyDirectory)).length,13);services=createServices(pool,{prayerNow:()=>new Date(now)});
  await services.accounts.createAdmin({email:'category-admin@example.test',displayName:'Category Operator',password});operator=await services.accounts.login({email:'category-admin@example.test',password});
  player=await services.accounts.register({email:'category-player@example.test',displayName:'Category Driver',password});
  await services.admin.topup(operator.user.id,{userId:player.user.id,amount:'250000',reference:'categories-upgrade-credit',reason},'categories-upgrade-credit');
  await services.economy.purchase(player.user.id,{itemId:'panther-grand-touring',catalogVersion:1},'categories-existing-panther');
  await services.admin.updateCatalog(operator.user.id,'panther-grand-touring',{expectedVersion:1,price:'165000',locked:false,reason});
  await services.economy.saveLoadout(player.user.id,{carId:'panther-grand-touring',rimId:'stock'});
  legacy={};for(const table of preserved)legacy[table]=await rows(table);
  await copyFile('database/migrations/014_vehicle_categories.sql',path.join(legacyDirectory,'014_vehicle_categories.sql'));
  assert.deepEqual(await migrate(pool,legacyDirectory),['014_vehicle_categories.sql']);
  const app=express();app.use(express.json({limit:'32kb'}));app.use('/api',createApiRouter({services,allowedOrigins:[origin],secureCookies:false}));
  http=app.listen(0,'127.0.0.1');await once(http,'listening');const address=http.address();assert(address&&typeof address==='object');base=`http://127.0.0.1:${address.port}/api`;
});
after(async()=>{
  if(http)await new Promise<void>((resolve,reject)=>http.close(error=>error?reject(error):resolve()));
  if(pool)await pool.end();await control.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await control.end();
  if(legacyDirectory)await rm(legacyDirectory,{recursive:true,force:true});
});
interface Options {method?:string;body?:unknown;user?:AuthResult|null;csrf?:string|null;origin?:string|null;headers?:Record<string,string>}
async function request(uri:string,options:Options={}):Promise<Response>{
  const who=options.user===undefined?operator:options.user,headers:Record<string,string>={'Content-Type':'application/json',...options.headers};
  if(options.origin!==null)headers.Origin=options.origin??origin;
  if(who){headers.Cookie=`uv_session=${who.sessionToken}`;if(options.csrf!==null)headers['X-CSRF-Token']=options.csrf??who.csrfToken;}
  return fetch(base+uri,{method:options.method??'GET',headers,...(options.body===undefined?{}:{body:JSON.stringify(options.body)})});
}
async function failure(status:number,code:string,uri:string,options:Options={}){
  const response=await request(uri,options);assert.equal(response.status,status,`${options.method??'GET'} ${uri}`);assert.equal((await response.json() as any).error.code,code);
}
async function create(name:string,sortOrder=90):Promise<VehicleCategory>{return (await services.admin.createVehicleCategory(operator.user.id,{name,sortOrder,reason})).category;}
async function offer(carId='panther-grand-touring'){return (await pool.query('SELECT * FROM catalog_items WHERE id=$1',[carId])).rows[0];}
async function assign(categoryId:string|null,carId='panther-grand-touring'){
  const previous=await offer(carId);return services.admin.updateCatalog(operator.user.id,carId,{categoryId,expectedVersion:previous.version,reason});
}

test('014 adds categories for sixteen cars without changing existing offers, ownership, balances or rules',async()=>{
  for(const table of preserved)assert.deepEqual(await rows(table),legacy[table],table);
  assert.deepEqual(await migrate(pool),['015_suv_catalog.sql','016_iconic_collectors.sql']);
  assert.deepEqual(await migrate(pool),[]);
  const response=await request('/catalog',{user:null,origin:null});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('set-cookie'),null);
  const catalog=await response.json() as any;
  assert.deepEqual(catalog.categories.map((category:VehicleCategory)=>[category.id,category.name,category.sortOrder,category.version]),[
    ['sport','Sport',10,1],['supercar','Supercar',20,1],['hypercar','Hypercar',30,1],['race','Mobil balap',40,1],['rally','Reli',50,1],['muscle','Muscle',60,1],['mpv','MPV',70,1],['suv','SUV',75,1],['special','Spesial',80,1],['koleksi-ikonik','Koleksi Ikonik',85,1],
  ]);
  assert.equal(catalog.cars.length,22);assert(catalog.cars.every((car:any)=>catalog.categories.some((category:VehicleCategory)=>category.id===car.categoryId)));
  assert.equal(catalog.cars.find((car:any)=>car.id==='panther-grand-touring').categoryId,'mpv');
  assert.equal(catalog.cars.find((car:any)=>car.id==='bmw-hybrid-v8').categoryId,'race');
  assert.equal(catalog.cars.find((car:any)=>car.id==='jesko-absolut').categoryId,'hypercar');
  assert(catalog.wheels.every((item:any)=>!('categoryId' in item)));assert(catalog.services.every((item:any)=>!('categoryId' in item)));
  const profile=await services.economy.getProfile(player.user.id);assert(profile.inventory.cars.includes('panther-grand-touring'));assert.equal(profile.loadout.carId,'panther-grand-touring');
});

test('category mutation routes require exact origin, CSRF and an active administrator',async()=>{
  const category=await create('Security fixture');
  const changes=[
    ['/admin/vehicle-categories','POST',{name:'No unauthorized category',sortOrder:100,reason}],
    ['/admin/vehicle-categories/'+category.id,'PATCH',{name:'Unauthorized rename',sortOrder:100,expectedVersion:1,reason}],
    ['/admin/vehicle-categories/'+category.id,'DELETE',{expectedVersion:1,reason}],
    ['/admin/catalog/brz','PATCH',{categoryId:category.id,expectedVersion:1,reason}],
  ] as const;
  for(const [uri,method,body]of changes){
    await failure(401,'AUTH_REQUIRED',uri,{method,body,user:null});await failure(403,'ADMIN_REQUIRED',uri,{method,body,user:player});
    await failure(403,'CSRF_REJECTED',uri,{method,body,csrf:null});await failure(403,'CSRF_REJECTED',uri,{method,body,csrf:'invalid'});
    await failure(403,'ORIGIN_REJECTED',uri,{method,body,origin:null});await failure(403,'ORIGIN_REJECTED',uri,{method,body,origin:'https://attacker.example'});
    await failure(403,'ORIGIN_REJECTED',uri,{method,body,headers:{'Sec-Fetch-Site':'cross-site'}});
  }
  await failure(401,'AUTH_REQUIRED','/admin/vehicle-categories',{user:null});await failure(403,'ADMIN_REQUIRED','/admin/vehicle-categories',{user:player});
  await assert.rejects(services.admin.createVehicleCategory(player.user.id,{name:'Forbidden',reason}),isCode('ADMIN_REQUIRED'));
  await pool.query('UPDATE users SET disabled=true WHERE id=$1',[operator.user.id]);
  try{await failure(401,'AUTH_REQUIRED','/admin/vehicle-categories',{method:'POST',body:{name:'Disabled account',reason}});}finally{await pool.query('UPDATE users SET disabled=false WHERE id=$1',[operator.user.id]);}
  assert.deepEqual((await services.admin.getVehicleCategories(operator.user.id)).categories.find(item=>item.id===category.id),category);
});

test('create, rename and reorder are durable, validated, case-insensitive unique and version-checked',async()=>{
  const response=await request('/admin/vehicle-categories',{method:'POST',body:{name:'  Mobil   klasik  ',sortOrder:5,reason}});assert.equal(response.status,201);
  const first=(await response.json() as {category:VehicleCategory}).category;assert.equal(first.name,'Mobil klasik');assert.equal(first.version,1);assert.equal(first.sortOrder,5);
  await failure(409,'CATEGORY_NAME_TAKEN','/admin/vehicle-categories',{method:'POST',body:{name:'mobil klasik',reason}});
  for(const invalid of [{name:'X'},{name:'e\u0301'},{name:'a'.repeat(41)},{name:'Invalid\nName'},{name:'Valid name',sortOrder:null},{name:'Valid name',sortOrder:-1},{name:'Valid name',sortOrder:1.5},{name:'Valid name',sortOrder:10000}]){
    const result=await request('/admin/vehicle-categories',{method:'POST',body:{reason,...invalid}});assert.equal(result.status,400);
  }
  const endpoint='/admin/vehicle-categories/'+first.id;
  await failure(409,'CATEGORY_NAME_TAKEN',endpoint,{method:'PATCH',body:{name:'SPORT',sortOrder:0,expectedVersion:1,reason}});
  const attempts=await Promise.all([
    request(endpoint,{method:'PATCH',body:{name:'Klasik koleksi A',sortOrder:3,expectedVersion:1,reason}}),
    request(endpoint,{method:'PATCH',body:{name:'Klasik koleksi B',sortOrder:4,expectedVersion:1,reason}}),
  ]);
  assert.deepEqual(attempts.map(item=>item.status).sort(),[200,409]);
  const latest=(await services.admin.getVehicleCategories(operator.user.id)).categories.find(category=>category.id===first.id)!;assert.equal(latest.version,2);
  await failure(409,'CATEGORY_CHANGED',endpoint,{method:'DELETE',body:{expectedVersion:1,reason}});
  const secondPool=new pg.Pool({connectionString,options:`-c search_path=${schema}`,max:2});
  try{const restarted=createServices(secondPool);const catalog=await restarted.economy.getCatalog();assert.equal(catalog.categories[0]!.id,first.id);assert.deepEqual(catalog.categories.find(category=>category.id===first.id),latest);}finally{await secondPool.end();}
});

test('assign and clear categories update only the offer version and grouping, with stale and invalid changes rejected',async()=>{
  const category=await create('Touring family'),before=await offer(),profile=await services.economy.getProfile(player.user.id),rules=await services.economy.getActiveRuleset();
  const response=await request('/admin/catalog/panther-grand-touring',{method:'PATCH',body:{categoryId:category.id,expectedVersion:before.version,reason}});assert.equal(response.status,200);
  const updated=(await response.json() as any).item;assert.equal(updated.categoryId,category.id);assert.equal(updated.catalogVersion,before.version+1);
  assert.deepEqual(await offer(),{...before,version:before.version+1});
  assert.deepEqual(await services.economy.getProfile(player.user.id),profile);assert.deepEqual(await services.economy.getActiveRuleset(),rules);
  assert.equal((await services.economy.getCatalog()).cars.find(car=>car.id===before.id)!.categoryId,category.id);
  await failure(409,'CATALOG_CHANGED','/admin/catalog/'+before.id,{method:'PATCH',body:{categoryId:'mpv',expectedVersion:before.version,reason}});
  await failure(404,'CATEGORY_NOT_FOUND','/admin/catalog/'+before.id,{method:'PATCH',body:{categoryId:'missing-category',expectedVersion:before.version+1,reason}});
  await failure(400,'INVALID_CATEGORY','/admin/catalog/'+before.id,{method:'PATCH',body:{categoryId:'not valid/id',expectedVersion:before.version+1,reason}});
  await failure(400,'INVALID_CATEGORY','/admin/catalog/six-spoke',{method:'PATCH',body:{categoryId:category.id,expectedVersion:1,reason}});
  const held=await offer();assert.deepEqual(held,{...before,version:before.version+1});
  const entry=(await pool.query("SELECT before_data,after_data FROM admin_audit WHERE action='catalog.updated' AND target_id=$1 AND after_data->>'categoryId'=$2",[before.id,category.id])).rows[0];
  assert.equal(entry.before_data.categoryId,'mpv');assert.equal(entry.after_data.categoryId,category.id);
  await assign(null);assert.equal((await services.economy.getCatalog()).cars.find(car=>car.id===before.id)!.categoryId,null);
  assert.equal((await services.economy.resolveLoadout(player.user.id)).carId,before.id);
  await assign('mpv');
});

test('delete rejects nonempty or stale categories; empty deletion is audited and cannot delete cars',async()=>{
  const beforeCars=await rows('catalog_items'),profile=await services.economy.getProfile(player.user.id);
  await failure(409,'CATEGORY_IN_USE','/admin/vehicle-categories/mpv',{method:'DELETE',body:{expectedVersion:1,reason}});
  const category=await create('Disposable category');const endpoint='/admin/vehicle-categories/'+category.id;
  const removed=await request(endpoint,{method:'DELETE',body:{expectedVersion:1,reason}});assert.equal(removed.status,200);assert.deepEqual(await removed.json(),{deleted:true,id:category.id});
  await failure(404,'CATEGORY_NOT_FOUND',endpoint,{method:'DELETE',body:{expectedVersion:1,reason}});
  assert(!(await services.economy.getCatalog()).categories.some(item=>item.id===category.id));
  assert.deepEqual(await rows('catalog_items'),beforeCars);assert.deepEqual(await services.economy.getProfile(player.user.id),profile);
  const audit=(await pool.query('SELECT action,before_data,after_data FROM admin_audit WHERE target_id=$1 ORDER BY created_at,id',[category.id])).rows;
  assert.equal(audit.length,2);assert.equal(audit[0].action,'vehicle.category.created');assert.equal(audit[1].action,'vehicle.category.deleted');assert.deepEqual(audit[1].before_data,category);
});

test('assignment racing deletion leaves either an assigned surviving category or a rejected assignment, never an orphan',async()=>{
  const category=await create('Concurrent category'),before=await offer('skyline');
  const operations=await Promise.allSettled([
    services.admin.updateCatalog(operator.user.id,'skyline',{categoryId:category.id,expectedVersion:before.version,reason}),
    services.admin.deleteVehicleCategory(operator.user.id,category.id,{expectedVersion:1,reason}),
  ]);
  assert.equal(operations.filter(item=>item.status==='fulfilled').length,1);
  const rejected=operations.find(item=>item.status==='rejected') as PromiseRejectedResult;assert(['CATEGORY_NOT_FOUND','CATEGORY_IN_USE'].includes(rejected.reason.code));
  const catalog=await services.economy.getCatalog(),car=catalog.cars.find(item=>item.id==='skyline')!;
  assert(car.categoryId===null||catalog.categories.some(item=>item.id===car.categoryId));
  if(car.categoryId===category.id){await assign('sport','skyline');await services.admin.deleteVehicleCategory(operator.user.id,category.id,{expectedVersion:1,reason});}
});

test('late audit failure rolls back category creation, editing, deletion and vehicle assignment atomically',async()=>{
  const category=await create('Rollback category'),beforeCategories=await rows('vehicle_categories'),beforeAssignments=await rows('vehicle_category_assignments'),beforeCatalog=await rows('catalog_items');
  await pool.query(`CREATE FUNCTION fail_category_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action LIKE 'vehicle.category.%' OR NEW.action='catalog.updated' THEN RAISE EXCEPTION 'category audit failure' USING ERRCODE='P0001'; END IF; RETURN NEW; END; $$`);
  await pool.query('CREATE TRIGGER category_test_audit BEFORE INSERT ON admin_audit FOR EACH ROW EXECUTE FUNCTION fail_category_audit()');
  try{
    await assert.rejects(create('Failed creation'),isCode('P0001'));
    await assert.rejects(services.admin.updateVehicleCategory(operator.user.id,category.id,{name:'Failed rename',sortOrder:1,expectedVersion:1,reason}),isCode('P0001'));
    await assert.rejects(services.admin.deleteVehicleCategory(operator.user.id,category.id,{expectedVersion:1,reason}),isCode('P0001'));
    await assert.rejects(assign(category.id),isCode('P0001'));
  }finally{await pool.query('DROP TRIGGER category_test_audit ON admin_audit');await pool.query('DROP FUNCTION fail_category_audit()');}
  assert.deepEqual(await rows('vehicle_categories'),beforeCategories);assert.deepEqual(await rows('vehicle_category_assignments'),beforeAssignments);assert.deepEqual(await rows('catalog_items'),beforeCatalog);
});

test('prayer pause blocks category writes while public catalog and administrator reads remain available',async()=>{
  const category=await create('Prayer category'),day=await services.prayer.status(operator.user.id),window=day.dailyTimes.find(item=>item.prayer==='dhuhr');assert(window);now=new Date(window.startedAt);
  try{
    await failure(423,'PRAYER_BREAK','/admin/vehicle-categories',{method:'POST',body:{name:'During prayer',reason}});
    await failure(423,'PRAYER_BREAK','/admin/vehicle-categories/'+category.id,{method:'PATCH',body:{name:'During prayer',sortOrder:1,expectedVersion:1,reason}});
    await failure(423,'PRAYER_BREAK','/admin/vehicle-categories/'+category.id,{method:'DELETE',body:{expectedVersion:1,reason}});
    await failure(423,'PRAYER_BREAK','/admin/catalog/brz',{method:'PATCH',body:{categoryId:category.id,expectedVersion:1,reason}});
    assert.equal((await request('/catalog',{user:null,origin:null})).status,200);assert.equal((await request('/admin/vehicle-categories')).status,200);
  }finally{now=new Date(clearTime);await pool.query('DELETE FROM user_prayer_state');}
});
