import assert from 'node:assert/strict';
import {copyFile,mkdtemp,readdir,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {before,after,test} from 'node:test';
import pg from 'pg';
import {migrate} from '../../db/migrate.js';
import {createServices,type BackendServices} from '../index.js';
import type {AuthResult,PublicUser} from '../accounts.js';
import {CAR_NAMES,DEFAULT_VEHICLE_STATS} from '../../../shared/catalog.js';
import {CAR_IDS} from '../../../shared/types.js';
import {validateRoomConfig} from '../../../shared/config.js';

const connectionString=process.env.TEST_DATABASE_URL;
assert(connectionString&&/test/i.test(new URL(connectionString).pathname),'Use the isolated native PostgreSQL wrapper.');
const schema=`uv_vehicle_identity_${process.pid}`,customSchema=`uv_vehicle_identity_custom_${process.pid}`;
const control=new pg.Pool({connectionString,max:2}),password='Vehicle-Identity-Fixture-2026!';
const historicalId='jesko-absolut',pantherId='panther-grand-touring';
let pool:pg.Pool,services:BackendServices,admin:PublicUser,owner:AuthResult,legacyDirectory:string;
let legacy:any,paidQuote:any,paidResponse:any,pendingQuote:any;
const preservedTables=['users','wallets','wallet_entries','user_items','loadouts','car_appearances','purchases','appearance_quotes','appearance_applications','idempotency_requests','admin_audit'] as const;
const rows=(table:string)=>pool.query(`SELECT row_to_json(t) AS value FROM ${table} t ORDER BY row_to_json(t)::text`).then(result=>result.rows.map(row=>row.value));
const isCode=(code:string)=>(error:unknown)=>(error as {code?:string})?.code===code;

before(async()=>{
  await control.query(`CREATE SCHEMA ${schema}`);
  pool=new pg.Pool({connectionString,options:`-c search_path=${schema}`,max:8});
  legacyDirectory=await mkdtemp(path.join(tmpdir(),'uv-vehicle-identity-'));
  for(const name of await readdir('database/migrations'))if(/^(00[1-9]|01[01])_/.test(name))await copyFile(path.join('database/migrations',name),path.join(legacyDirectory,name));
  assert.equal((await migrate(pool,legacyDirectory)).length,11);
  services=createServices(pool,{prayerNow:()=>new Date('2026-11-20T03:00:00Z')});
  admin=await services.accounts.createAdmin({email:'identity-admin@example.test',displayName:'Identity Operator',password});
  owner=await services.accounts.register({email:'identity-owner@example.test',displayName:'Existing Owner',password});
  await services.admin.topup(admin.id,{userId:owner.user.id,amount:'3500000',reference:'identity-owner-credit',reason:'Existing purchase and paint preservation fixture'},'identity-owner-credit');
  await services.economy.purchase(owner.user.id,{itemId:historicalId,catalogVersion:1},'identity-car-purchase');
  await services.economy.purchase(owner.user.id,{itemId:'six-spoke',catalogVersion:1},'identity-wheel-purchase');
  paidQuote=await services.economy.quoteAppearance(owner.user.id,{carId:historicalId,rimId:'six-spoke',color:'#771166',finish:'matte',rimColor:'#bbaa55',stripeId:'twin-racing',stripeColor:'#ccffee'});
  paidResponse=await services.economy.applyAppearance(owner.user.id,{quoteId:paidQuote.quoteId},'identity-paid-appearance');
  await services.admin.updateCatalog(admin.id,historicalId,{expectedVersion:1,price:'2780000',locked:false,reason:'Existing operator price and temporary access'});
  const tuning=await services.admin.getTuning(admin.id);
  await services.admin.publishTuning(admin.id,{expectedVersion:tuning.version,carId:historicalId,topSpeed:377,zeroTo100:2.9,handling:1.03,reason:'Existing custom vehicle power before catalogue expansion'});
  pendingQuote=await services.economy.quoteAppearance(owner.user.id,{carId:historicalId,color:'#abcdef'});
  legacy={profile:await services.economy.getProfile(owner.user.id),catalog:await rows('catalog_items'),rules:await services.admin.getTuning(admin.id),rulesets:await rows('rulesets'),ruleCars:await rows('ruleset_cars'),slots:await rows('vehicle_thumbnail_slots'),tables:{}};
  for(const table of preservedTables)legacy.tables[table]=await rows(table);
});

after(async()=>{
  if(pool)await pool.end();
  await control.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await control.query(`DROP SCHEMA IF EXISTS ${customSchema} CASCADE`);
  await control.end();
  if(legacyDirectory)await rm(legacyDirectory,{recursive:true,force:true});
});

test('012/013 preserve purchased identity, cosmetics, quotes and history while appending Panther',async()=>{
  assert.deepEqual(await migrate(pool),['012_reference_vehicle_name.sql','013_panther_grand_touring.sql']);
  assert.deepEqual(await migrate(pool),[]);
  const count=await pool.query('SELECT count(*)::int n FROM schema_migrations');assert.equal(count.rows[0].n,13);
  for(const table of preservedTables)assert.deepEqual(await rows(table),legacy.tables[table],table+' must retain all existing rows');
  assert.deepEqual(await services.economy.getProfile(owner.user.id),legacy.profile);
  const catalog=await services.economy.getCatalog();assert.equal(catalog.cars.length,16);
  const renamed=catalog.cars.find(car=>car.id===historicalId)!;
  assert.equal(renamed.name,'Koenigsegg Regera');assert.equal(CAR_NAMES[historicalId],renamed.name);
  const current=await rows('catalog_items');
  for(const old of legacy.catalog)assert.deepEqual(current.find((item:any)=>item.id===old.id),{...old,...(old.id===historicalId?{name:'Koenigsegg Regera'}:{})});
  const panther=catalog.cars.find(car=>car.id===pantherId)!;
  assert.equal(panther.name,'Isuzu Panther Grand Touring');assert.equal(panther.price,'150000');assert.equal(panther.catalogVersion,1);assert.equal(panther.enabled,true);assert.equal(panther.locked,true);assert.equal(panther.color,'#19252e');
  assert.deepEqual(panther.stats,DEFAULT_VEHICLE_STATS[pantherId]);
  const slots=await rows('vehicle_thumbnail_slots');
  for(const old of legacy.slots)assert.deepEqual(slots.find((slot:any)=>slot.car_id===old.car_id),old);
  assert.equal(slots.find((slot:any)=>slot.car_id===pantherId)?.version,1);
  assert.equal(slots.find((slot:any)=>slot.car_id===pantherId)?.thumbnail_id,null);
});

test('013 retains published operator tuning and old rulesets; existing saved car remains usable without another purchase',async()=>{
  const allRules=await rows('rulesets'),allCars=await rows('ruleset_cars');
  for(const old of legacy.rulesets)assert.deepEqual(allRules.find((row:any)=>row.id===old.id),old);
  for(const old of legacy.ruleCars)assert.deepEqual(allCars.find((row:any)=>row.ruleset_id===old.ruleset_id&&row.car_id===old.car_id),old);
  const active=await services.admin.getTuning(admin.id);
  assert.equal(Number(active.version),Number(legacy.rules.version)+1);
  assert.deepEqual(active.physics,legacy.rules.physics);assert.deepEqual(active.rewardPolicy,legacy.rules.rewardPolicy);
  for(const old of legacy.rules.cars)assert.deepEqual(active.cars.find((car:any)=>car.carId===old.carId),old);
  assert.equal(active.cars.length,16);
  const saved=await services.economy.resolveLoadout(owner.user.id);
  assert.equal(saved.carId,historicalId);assert.equal(saved.color,'#771166');assert.equal(saved.rimColor,'#bbaa55');assert.equal(saved.stripeId,'twin-racing');assert.equal(saved.stripeColor,'#ccffee');
  assert.equal(saved.stats.topSpeed,377);assert.equal(saved.stats.zeroTo100,2.9);assert.equal(saved.stats.handling,1.03);
  const balance=(await services.economy.getProfile(owner.user.id)).wallet;
  assert.deepEqual(await services.economy.applyAppearance(owner.user.id,{quoteId:paidQuote.quoteId},'identity-paid-appearance'),paidResponse);
  await services.economy.saveLoadout(owner.user.id,{carId:historicalId,rimId:'six-spoke'});
  assert.deepEqual((await services.economy.getProfile(owner.user.id)).wallet,balance);
  const pending=await services.economy.applyAppearance(owner.user.id,{quoteId:pendingQuote.quoteId},'identity-pending-appearance');
  assert.equal(pending.pricePaid,pendingQuote.total);assert.equal(pending.appearance.color,'#abcdef');
});

test('Panther purchase, paid appearance, permanent ownership after admin lock and operator tuning use existing flows',async()=>{
  const visitor=await services.accounts.register({email:'identity-visitor@example.test',displayName:'Visitor',password});
  const factory={carId:pantherId,rimId:'stock',color:'#19252e',finish:'metallic'} as const;
  await assert.rejects(services.economy.resolveLoadout(visitor.user.id,factory),isCode('CAR_LOCKED'));
  await services.admin.updateCatalog(admin.id,pantherId,{expectedVersion:1,locked:false,reason:'Panther temporary access fixture'});
  assert.equal((await services.economy.resolveLoadout(visitor.user.id,factory)).carId,pantherId);
  const before=await services.economy.getProfile(owner.user.id);
  await services.economy.purchase(owner.user.id,{itemId:pantherId,catalogVersion:2},'identity-panther-purchase');
  const after=await services.economy.getProfile(owner.user.id);assert.equal(BigInt(before.wallet.balance)-BigInt(after.wallet.balance),150000n);assert(after.inventory.cars.includes(pantherId));
  await services.admin.updateCatalog(admin.id,pantherId,{expectedVersion:2,locked:true,reason:'Panther permanent ownership fixture'});
  await assert.rejects(services.economy.resolveLoadout(visitor.user.id,factory),isCode('CAR_LOCKED'));
  const offer=await services.economy.quoteAppearance(owner.user.id,{carId:pantherId,rimId:'stock',color:'#225544',rimColor:'#bbaa33',stockRimPainted:true,stripeId:'offset',stripeColor:'#eeeeee'});
  const appearance=await services.economy.applyAppearance(owner.user.id,{quoteId:offer.quoteId},'identity-panther-paint');
  assert.equal(appearance.pricePaid,offer.total);assert(appearance.appearance.owned);assert.equal(appearance.loadout.carId,pantherId);
  const held=(await services.economy.getProfile(owner.user.id)).wallet;
  await services.economy.saveLoadout(owner.user.id,{carId:pantherId,rimId:'stock'});
  assert.deepEqual((await services.economy.getProfile(owner.user.id)).wallet,held);
  const oldTuning=await services.admin.getTuning(admin.id);
  await services.admin.publishTuning(admin.id,{expectedVersion:oldTuning.version,carId:pantherId,topSpeed:180,zeroTo100:10,handling:.94,reason:'Panther independent power profile fixture'});
  const changed=await services.economy.resolveLoadout(owner.user.id);assert.deepEqual(changed.stats,{topSpeed:180,zeroTo100:10,handling:.94});
  const newTuning=await services.admin.getTuning(admin.id);
  assert.deepEqual(newTuning.cars.find((car:any)=>car.carId===historicalId),oldTuning.cars.find((car:any)=>car.carId===historicalId));
  assert(CAR_IDS.includes(pantherId));
  const maximum=validateRoomConfig({circuit:'city',laps:1,maxHumans:1,bots:14,difficulty:'normal',collisionMode:'solid'});
  assert.equal(maximum.bots,14);assert.throws(()=>validateRoomConfig({...maximum,maxHumans:2}));
});

test('012 does not overwrite an operator-customized display name',async()=>{
  await control.query(`CREATE SCHEMA ${customSchema}`);
  const custom=new pg.Pool({connectionString,options:`-c search_path=${customSchema}`,max:2});
  try{
    await migrate(custom,legacyDirectory);
    await custom.query("UPDATE catalog_items SET name='Operator special collection',price=2790000,version=7,locked=false WHERE id=$1",[historicalId]);
    const original=(await custom.query('SELECT * FROM catalog_items WHERE id=$1',[historicalId])).rows[0];
    await migrate(custom);
    assert.deepEqual((await custom.query('SELECT * FROM catalog_items WHERE id=$1',[historicalId])).rows[0],original);
  }finally{await custom.end();}
});
