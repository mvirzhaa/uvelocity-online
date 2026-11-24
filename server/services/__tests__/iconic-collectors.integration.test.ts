import assert from 'node:assert/strict';
import {copyFile,mkdtemp,readdir,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {after,before,test} from 'node:test';
import pg from 'pg';
import {migrate} from '../../db/migrate.js';
import {createServices,type BackendServices} from '../index.js';
import type {AuthResult,PublicUser} from '../accounts.js';
import {CAR_NAMES,DEFAULT_VEHICLE_STATS} from '../../../shared/catalog.js';
import type {CarId,FrozenLoadout} from '../../../shared/types.js';

const connectionString=process.env.TEST_DATABASE_URL;
assert(connectionString&&/test/i.test(new URL(connectionString).pathname),'Use the isolated PostgreSQL test wrapper.');
const schema=`uv_iconic_${process.pid}`,collisionSchema=`uv_iconic_collision_${process.pid}`;
const control=new pg.Pool({connectionString,max:2}),password='Iconic-Collectors-Fixture-2026!';
const ids=['batmobile-tumbler','knight-rider-kitt'] as const;
const prices=['1500000','850000'],finishes=['matte','gloss'];
const reason='Iconic collector upgrade preservation fixture';
const preserved=['users','wallets','wallet_entries','user_items','loadouts','car_appearances','purchases','appearance_quotes','appearance_applications','idempotency_requests','admin_audit'] as const;
let pool:pg.Pool,services:BackendServices,admin:PublicUser,owner:AuthResult,visitor:AuthResult,legacyDirectory:string;
let legacy:any,categoryId:string;
const rows=async(table:string)=>(await pool.query(`SELECT row_to_json(t) AS value FROM ${table} t ORDER BY row_to_json(t)::text`)).rows.map(row=>row.value);
const isCode=(code:string)=>(error:unknown)=>(error as {code?:string})?.code===code;

before(async()=>{
  await control.query(`CREATE SCHEMA ${schema}`);pool=new pg.Pool({connectionString,options:`-c search_path=${schema}`,max:8});
  legacyDirectory=await mkdtemp(path.join(tmpdir(),'uv-iconic-legacy-'));
  for(const name of await readdir('database/migrations'))if(/^(00[1-9]|01[0-5])_/.test(name))await copyFile(path.join('database/migrations',name),path.join(legacyDirectory,name));
  assert.equal((await migrate(pool,legacyDirectory)).length,15);
  services=createServices(pool,{prayerNow:()=>new Date('2026-11-20T03:00:00Z')});
  admin=await services.accounts.createAdmin({email:'iconic-admin@example.test',displayName:'Iconic Operator',password});
  owner=await services.accounts.register({email:'iconic-owner@example.test',displayName:'Existing Collector',password});
  visitor=await services.accounts.register({email:'iconic-visitor@example.test',displayName:'New Collector',password});
  await services.admin.topup(admin.id,{userId:owner.user.id,amount:'1800000',reference:'iconic-existing-credit',reason},'iconic-existing-credit');
  await services.economy.purchase(owner.user.id,{itemId:'batmobile-1989',catalogVersion:1},'iconic-existing-batmobile');
  const quote=await services.economy.quoteAppearance(owner.user.id,{carId:'batmobile-1989',color:'#223344',finish:'matte',rimColor:'#998855',stockRimPainted:true,stripeId:'offset',stripeColor:'#ddbbaa'});
  await services.economy.applyAppearance(owner.user.id,{quoteId:quote.quoteId},'iconic-existing-appearance');
  await services.admin.updateCatalog(admin.id,'batmobile-1989',{expectedVersion:1,price:'1425000',reason});
  const tuning=await services.admin.getTuning(admin.id);
  await services.admin.publishTuning(admin.id,{expectedVersion:tuning.version,carId:'batmobile-1989',topSpeed:304,zeroTo100:4.1,handling:.93,reason});
  const category=await services.admin.createVehicleCategory(admin.id,{name:'Koleksi Ikonik',sortOrder:12,reason});categoryId=category.category.id;
  await services.admin.updateVehicleCategory(admin.id,categoryId,{name:'Koleksi Ikonik',sortOrder:11,expectedVersion:1,reason});
  legacy={profile:await services.economy.getProfile(owner.user.id),catalog:await rows('catalog_items'),slots:await rows('vehicle_thumbnail_slots'),categories:await rows('vehicle_categories'),assignments:await rows('vehicle_category_assignments'),rules:await services.admin.getTuning(admin.id),rulesets:await rows('rulesets'),ruleCars:await rows('ruleset_cars'),tables:{}};
  for(const table of preserved)legacy.tables[table]=await rows(table);
});
after(async()=>{
  if(pool)await pool.end();await control.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await control.query(`DROP SCHEMA IF EXISTS ${collisionSchema} CASCADE`);await control.end();
  if(legacyDirectory)await rm(legacyDirectory,{recursive:true,force:true});
});

test('016 adds only two collectible offers and reuses the operator category while preserving existing ownership, paint, price and grouping',async()=>{
  assert.deepEqual(await migrate(pool),['016_iconic_collectors.sql']);assert.deepEqual(await migrate(pool),[]);
  for(const table of preserved)assert.deepEqual(await rows(table),legacy.tables[table],table);
  assert.deepEqual(await services.economy.getProfile(owner.user.id),legacy.profile);
  for(const [table,key,previous]of [
    ['catalog_items','id',legacy.catalog],['vehicle_thumbnail_slots','car_id',legacy.slots],['vehicle_categories','id',legacy.categories],['vehicle_category_assignments','car_id',legacy.assignments],
  ] as const){const current=await rows(table);for(const row of previous)assert.deepEqual(current.find(item=>item[key]===row[key]),row,`${table} ${row[key]}`);}
  const catalog=await services.economy.getCatalog();assert.equal(catalog.cars.length,22);
  for(const [index,id]of ids.entries()){
    const car=catalog.cars.find(item=>item.id===id)!;assert.equal(car.name,CAR_NAMES[id]);assert.equal(car.price,prices[index]);
    assert(car.enabled&&car.locked&&car.arcadeTuning);assert.equal(car.categoryId,categoryId);assert.equal(car.modelOrigin,'reference-reconstruction');
    assert.equal(car.finish,finishes[index]);assert.equal(car.catalogVersion,1);assert.equal(car.thumbnail,null);assert.deepEqual(car.stats,DEFAULT_VEHICLE_STATS[id]);
  }
  assert.deepEqual(catalog.categories.filter(category=>category.name.toLowerCase()==='koleksi ikonik'),[{id:categoryId,name:'Koleksi Ikonik',sortOrder:11,version:2}]);
  assert.deepEqual((await services.economy.resolveVehicleRestriction(categoryId)).allowedCarIds,ids);
  assert.equal(catalog.cars.find(car=>car.id==='batmobile-1989')!.categoryId,'special');
  assert.deepEqual((await services.economy.getProfile(visitor.user.id)).inventory.cars,['brz']);
});

test('016 publishes an additive immutable ruleset and retains old twenty-car tuning, physics and rewards',async()=>{
  for(const [table,previous]of [['rulesets',legacy.rulesets],['ruleset_cars',legacy.ruleCars]] as const){
    const current=await rows(table);for(const row of previous)assert.deepEqual(current.find(item=>table==='rulesets'?item.id===row.id:item.ruleset_id===row.ruleset_id&&item.car_id===row.car_id),row);
  }
  const active=await services.admin.getTuning(admin.id);assert.equal(Number(active.version),Number(legacy.rules.version)+1);assert.equal(active.cars.length,22);
  assert.deepEqual(active.physics,legacy.rules.physics);assert.deepEqual(active.rewardPolicy,legacy.rules.rewardPolicy);
  for(const car of legacy.rules.cars)assert.deepEqual(active.cars.find(item=>item.carId===car.carId),car);
  const old=await services.economy.resolveLoadout(owner.user.id,undefined,legacy.rules.version);assert.equal(old.carId,'batmobile-1989');assert.equal(old.stats.topSpeed,304);
});

test('both collectibles require ownership; insufficient balance is atomic and concurrent purchase retries debit once',async()=>{
  const before=await services.economy.getProfile(visitor.user.id);
  for(const [index,id]of ids.entries()){
    const factory={carId:id,color:index===0?'#202329':'#10141a',finish:finishes[index] as 'matte'|'gloss',rimId:'stock'};
    await assert.rejects(services.economy.resolveLoadout(visitor.user.id,factory),isCode('CAR_LOCKED'));
    await assert.rejects(services.economy.purchase(visitor.user.id,{itemId:id,catalogVersion:1},'iconic-insufficient-'+id),isCode('INSUFFICIENT_BALANCE'));
  }
  assert.deepEqual(await services.economy.getProfile(visitor.user.id),before);
  await services.admin.topup(admin.id,{userId:owner.user.id,amount:'3000000',reference:'iconic-new-credit',reason},'iconic-new-credit');
  for(const [index,id]of ids.entries()){
    const balance=(await services.economy.getProfile(owner.user.id)).wallet.balance;
    const bought=await Promise.all([0,1,2].map(()=>services.economy.purchase(owner.user.id,{itemId:id,catalogVersion:1},'iconic-buy-'+id)));
    assert(bought.every(result=>result.purchaseId===bought[0]!.purchaseId));
    const profile=await services.economy.getProfile(owner.user.id);assert.equal(BigInt(balance)-BigInt(profile.wallet.balance),BigInt(prices[index]!));assert(profile.inventory.cars.includes(id));
    assert.equal((await pool.query('SELECT count(*)::int n FROM purchases WHERE user_id=$1 AND item_id=$2',[owner.user.id,id])).rows[0].n,1);
    await assert.rejects(services.economy.purchase(owner.user.id,{itemId:id,catalogVersion:1},'iconic-buy-again-'+id),isCode('ALREADY_OWNED'));
    await services.economy.saveLoadout(owner.user.id,{carId:id});const loadout=await services.economy.resolveLoadout(owner.user.id);
    assert.equal(loadout.finish,finishes[index]);assert.equal(loadout.stockRimPainted,false);assert.equal(loadout.stripeId,'none');assert.deepEqual(loadout.stats,DEFAULT_VEHICLE_STATS[id]);
    await assert.rejects(services.economy.resolveLoadout(owner.user.id,loadout,legacy.rules.version),isCode('CAR_NOT_IN_RULESET'));
  }
});

test('collector cosmetics require the paid workshop and persist independently after login and re-equipping',async()=>{
  const saved=new Map<CarId,FrozenLoadout>();
  for(const [index,id]of ids.entries()){
    const initial=await services.economy.resolveLoadout(owner.user.id,{carId:id} as any);
    await assert.rejects(services.economy.saveLoadout(owner.user.id,{...initial,color:'#abcdef'}),isCode('PAID_CUSTOMIZATION_REQUIRED'));
    const quote=await services.economy.quoteAppearance(owner.user.id,{carId:id,color:index===0?'#41474d':'#161d24',finish:index===0?'matte':'gloss',rimId:'stock',rimColor:'#a18a62',stockRimPainted:true,stripeId:'side-sweep',stripeColor:'#c0b090'});
    assert(BigInt(quote.total)>0n);const prior=(await services.economy.getProfile(owner.user.id)).wallet.balance;
    const painted=await services.economy.applyAppearance(owner.user.id,{quoteId:quote.quoteId},'iconic-paint-'+id);
    assert.equal(BigInt(prior)-BigInt(painted.wallet.balance),BigInt(quote.total));assert.deepEqual(await services.economy.applyAppearance(owner.user.id,{quoteId:quote.quoteId},'iconic-paint-'+id),painted);
    saved.set(id,await services.economy.resolveLoadout(owner.user.id));
  }
  const logged=await services.accounts.login({email:owner.user.email,password});assert.equal(logged.user.id,owner.user.id);
  const restarted=createServices(pool);
  for(const id of ids){await restarted.economy.saveLoadout(owner.user.id,{carId:id});assert.deepEqual(await restarted.economy.resolveLoadout(owner.user.id),saved.get(id));}
});

test('temporary free access uses authored finishes without granting ownership or overriding previously saved paint',async()=>{
  for(const [index,id]of ids.entries()){
    const saved=await services.economy.resolveLoadout(owner.user.id,{carId:id} as any);
    await services.admin.updateCatalog(admin.id,id,{expectedVersion:1,locked:false,reason});
    const factory=await services.economy.resolveLoadout(visitor.user.id,{carId:id} as any);assert.equal(factory.finish,finishes[index]);assert.equal(factory.stockRimPainted,false);
    assert.deepEqual(await services.economy.resolveLoadout(owner.user.id,{carId:id} as any),saved);
    assert(!(await services.economy.getProfile(visitor.user.id)).inventory.cars.includes(id));
    await services.admin.updateCatalog(admin.id,id,{expectedVersion:2,locked:true,reason});
    await assert.rejects(services.economy.resolveLoadout(visitor.user.id,{carId:id} as any),isCode('CAR_LOCKED'));
    assert.deepEqual(await services.economy.resolveLoadout(owner.user.id,{carId:id} as any),saved);
  }
  assert.equal((await services.economy.resolveLoadout(visitor.user.id,{carId:'brz'} as any)).finish,'metallic');
});

test('collector category slug collisions preserve the unrelated group and both new car assignments',async()=>{
  await control.query(`CREATE SCHEMA ${collisionSchema}`);const alternate=new pg.Pool({connectionString,options:`-c search_path=${collisionSchema}`,max:2});
  try{
    await migrate(alternate,legacyDirectory);await alternate.query("INSERT INTO vehicle_categories(id,name,sort_order,version) VALUES('koleksi-ikonik','Operator private group',3,7)");
    await migrate(alternate);assert.deepEqual((await alternate.query("SELECT * FROM vehicle_categories WHERE id='koleksi-ikonik'")).rows[0],{id:'koleksi-ikonik',name:'Operator private group',sort_order:3,version:7});
    assert.equal((await alternate.query("SELECT id FROM vehicle_categories WHERE name='Koleksi Ikonik'")).rows[0].id,'koleksi-ikonik-1');
    assert.deepEqual((await alternate.query("SELECT car_id FROM vehicle_category_assignments WHERE category_id='koleksi-ikonik-1' ORDER BY car_id")).rows.map(row=>row.car_id),ids);
  }finally{await alternate.end();}
});
