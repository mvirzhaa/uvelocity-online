import assert from 'node:assert/strict';
import {copyFile,mkdtemp,readdir,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {after,before,test} from 'node:test';
import pg from 'pg';
import sharp from 'sharp';
import {migrate} from '../../db/migrate.js';
import {createServices,type BackendServices} from '../index.js';
import type {AuthResult,PublicUser} from '../accounts.js';
import {CAR_NAMES,DEFAULT_VEHICLE_STATS} from '../../../shared/catalog.js';
import type {CarId,FrozenLoadout} from '../../../shared/types.js';

const connectionString=process.env.TEST_DATABASE_URL;
assert(connectionString&&/test/i.test(new URL(connectionString).pathname),'Use the isolated native PostgreSQL wrapper.');
const schema=`uv_family_vehicles_${process.pid}`,collisionSchema=`uv_family_category_${process.pid}`;
const control=new pg.Pool({connectionString,max:2}),password='Family-Vehicles-Fixture-2026!';
const ids=['honda-crv-rs','mitsubishi-pajero-sport','toyota-fortuner','toyota-innova-zenix'] as const;
const prices=['280000','320000','340000','345000'];
const reason='Photo-reference family vehicle upgrade fixture';
const preserved=['users','wallets','wallet_entries','user_items','loadouts','car_appearances','purchases','appearance_quotes','appearance_applications','idempotency_requests','admin_audit'] as const;
let pool:pg.Pool,services:BackendServices,admin:PublicUser,owner:AuthResult,visitor:AuthResult,legacyDirectory:string;
let legacy:any,suvId:string;
const rows=async(table:string)=>(await pool.query(`SELECT row_to_json(t) AS value FROM ${table} t ORDER BY row_to_json(t)::text`)).rows.map(row=>row.value);
const isCode=(code:string)=>(error:unknown)=>(error as {code?:string})?.code===code;

before(async()=>{
  await control.query(`CREATE SCHEMA ${schema}`);pool=new pg.Pool({connectionString,options:`-c search_path=${schema}`,max:10});
  legacyDirectory=await mkdtemp(path.join(tmpdir(),'uv-family-legacy-'));
  for(const name of await readdir('database/migrations'))if(/^(00[1-9]|01[0-4])_/.test(name))await copyFile(path.join('database/migrations',name),path.join(legacyDirectory,name));
  assert.equal((await migrate(pool,legacyDirectory)).length,14);
  services=createServices(pool,{prayerNow:()=>new Date('2026-11-20T03:00:00Z')});
  admin=await services.accounts.createAdmin({email:'family-admin@example.test',displayName:'Family Operator',password});
  owner=await services.accounts.register({email:'family-owner@example.test',displayName:'Existing Driver',password});
  visitor=await services.accounts.register({email:'family-visitor@example.test',displayName:'New Driver',password});
  await services.admin.topup(admin.id,{userId:owner.user.id,amount:'500000',reference:'family-existing-credit',reason},'family-existing-credit');
  await services.economy.purchase(owner.user.id,{itemId:'panther-grand-touring',catalogVersion:1},'family-existing-panther');
  const quote=await services.economy.quoteAppearance(owner.user.id,{carId:'panther-grand-touring',color:'#335544',rimColor:'#aabbaa',stockRimPainted:true,stripeId:'offset',stripeColor:'#cceeff'});
  await services.economy.applyAppearance(owner.user.id,{quoteId:quote.quoteId},'family-existing-paint');
  await services.admin.updateCatalog(admin.id,'panther-grand-touring',{expectedVersion:1,price:'162000',reason});
  const current=await services.admin.getTuning(admin.id);
  await services.admin.publishTuning(admin.id,{expectedVersion:current.version,carId:'panther-grand-touring',topSpeed:182,zeroTo100:10.1,handling:.92,reason});
  const category=await services.admin.createVehicleCategory(admin.id,{name:'SUV',sortOrder:6,reason});suvId=category.category.id;
  await services.admin.updateVehicleCategory(admin.id,suvId,{name:'SUV',sortOrder:4,expectedVersion:1,reason});
  legacy={profile:await services.economy.getProfile(owner.user.id),catalog:await rows('catalog_items'),slots:await rows('vehicle_thumbnail_slots'),categories:await rows('vehicle_categories'),assignments:await rows('vehicle_category_assignments'),rules:await services.admin.getTuning(admin.id),rulesets:await rows('rulesets'),ruleCars:await rows('ruleset_cars'),tables:{}};
  for(const table of preserved)legacy.tables[table]=await rows(table);
});
after(async()=>{
  if(pool)await pool.end();await control.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await control.query(`DROP SCHEMA IF EXISTS ${collisionSchema} CASCADE`);await control.end();
  if(legacyDirectory)await rm(legacyDirectory,{recursive:true,force:true});
});

test('015 appends four offers and reuses the operator SUV group without changing existing accounts, purchases, paint or categories',async()=>{
  assert.deepEqual(await migrate(pool),['015_suv_catalog.sql','016_iconic_collectors.sql']);assert.deepEqual(await migrate(pool),[]);
  for(const table of preserved)assert.deepEqual(await rows(table),legacy.tables[table],table);
  assert.deepEqual(await services.economy.getProfile(owner.user.id),legacy.profile);
  for(const table of ['catalog_items','vehicle_thumbnail_slots','vehicle_categories','vehicle_category_assignments'] as const){
    const key=table==='vehicle_thumbnail_slots'||table==='vehicle_category_assignments'?'car_id':'id';
    const previous=table==='catalog_items'?legacy.catalog:table==='vehicle_thumbnail_slots'?legacy.slots:table==='vehicle_categories'?legacy.categories:legacy.assignments;
    const current=await rows(table);for(const row of previous)assert.deepEqual(current.find(item=>item[key]===row[key]),row,`${table} ${row[key]}`);
  }
  const catalog=await services.economy.getCatalog();assert.equal(catalog.cars.length,22);
  const start=catalog.cars.findIndex(car=>car.id===ids[0]);assert.deepEqual(catalog.cars.slice(start,start+4).map(car=>car.id),ids);
  for(const [index,id]of ids.entries()){
    const car=catalog.cars.find(item=>item.id===id)!;
    assert.equal(car.name,CAR_NAMES[id]);assert.equal(car.price,prices[index]);assert(car.enabled&&car.locked);assert.equal(car.catalogVersion,1);
    assert.equal(car.categoryId,index<3?suvId:'mpv');assert.equal(car.modelOrigin,'reference-reconstruction');assert.deepEqual(car.stats,DEFAULT_VEHICLE_STATS[id]);
    assert.equal(car.thumbnail,null);assert.equal(car.tuningVersion,catalog.rulesetVersion);
  }
  assert.equal(catalog.categories.filter(category=>category.name.toLowerCase()==='suv').length,1);
  assert.deepEqual(catalog.categories.find(category=>category.id===suvId),{id:suvId,name:'SUV',sortOrder:4,version:2});
  assert.deepEqual((await services.economy.getProfile(visitor.user.id)).inventory.cars,['brz']);
});

test('015 copies operator tuning into a new immutable ruleset and preserves every old ruleset row',async()=>{
  for(const [table,previous]of [['rulesets',legacy.rulesets],['ruleset_cars',legacy.ruleCars]] as const){
    const current=await rows(table);
    for(const row of previous)assert.deepEqual(current.find(item=>table==='rulesets'?item.id===row.id:item.ruleset_id===row.ruleset_id&&item.car_id===row.car_id),row);
  }
  const active=await services.admin.getTuning(admin.id);assert.equal(Number(active.version),Number(legacy.rules.version)+2);
  assert.deepEqual(active.physics,legacy.rules.physics);assert.deepEqual(active.rewardPolicy,legacy.rules.rewardPolicy);
  for(const row of legacy.rules.cars)assert.deepEqual(active.cars.find(car=>car.carId===row.carId),row);
  assert.equal(active.cars.length,22);
  const old=await services.economy.resolveLoadout(owner.user.id,undefined,legacy.rules.version);assert.equal(old.carId,'panther-grand-touring');assert.equal(old.stats.topSpeed,182);
});

test('each new model requires a purchase, insufficient balance is atomic, and concurrent retries debit exactly once',async()=>{
  const before=await services.economy.getProfile(visitor.user.id);
  for(const id of ids){
    await assert.rejects(services.economy.resolveLoadout(visitor.user.id,{carId:id,color:'#112233',finish:'metallic',rimId:'stock'}),isCode('CAR_LOCKED'));
    await assert.rejects(services.economy.purchase(visitor.user.id,{itemId:id,catalogVersion:1},'family-insufficient-'+id),isCode('INSUFFICIENT_BALANCE'));
  }
  assert.deepEqual(await services.economy.getProfile(visitor.user.id),before);
  await services.admin.topup(admin.id,{userId:owner.user.id,amount:'2000000',reference:'family-new-cars-credit',reason},'family-new-cars-credit');
  for(const [index,id]of ids.entries()){
    const balance=(await services.economy.getProfile(owner.user.id)).wallet.balance;
    const purchased=await Promise.all([0,1,2].map(()=>services.economy.purchase(owner.user.id,{itemId:id,catalogVersion:1},'family-purchase-'+id)));
    assert(purchased.every(result=>result.purchaseId===purchased[0]!.purchaseId));
    const profile=await services.economy.getProfile(owner.user.id);assert(profile.inventory.cars.includes(id));assert.equal(BigInt(balance)-BigInt(profile.wallet.balance),BigInt(prices[index]!));
    await assert.rejects(services.economy.purchase(owner.user.id,{itemId:id,catalogVersion:1},'family-purchase-again-'+id),isCode('ALREADY_OWNED'));
    assert.equal((await pool.query('SELECT count(*)::int n FROM purchases WHERE user_id=$1 AND item_id=$2',[owner.user.id,id])).rows[0].n,1);
    await services.economy.saveLoadout(owner.user.id,{carId:id,rimId:'stock'});
    const selected=await services.economy.resolveLoadout(owner.user.id);assert.equal(selected.carId,id);assert.deepEqual(selected.stats,DEFAULT_VEHICLE_STATS[id]);
    await assert.rejects(services.economy.resolveLoadout(owner.user.id,selected,legacy.rules.version),isCode('CAR_NOT_IN_RULESET'));
  }
});

test('paid body, wheel and stripe colors persist independently on all four vehicles and survive re-equipping',async()=>{
  const saved=new Map<CarId,FrozenLoadout>();
  for(const [index,id]of ids.entries()){
    const before=(await services.economy.getProfile(owner.user.id)).wallet.balance;
    const quote=await services.economy.quoteAppearance(owner.user.id,{carId:id,color:['#224455','#557733','#882244','#446688'][index],rimId:'stock',rimColor:'#caa650',stockRimPainted:true,stripeId:'twin-racing',stripeColor:'#eaeaea'});
    assert(BigInt(quote.total)>0n);assert(quote.lineItems.some(item=>item.itemId==='paint-rims'));assert(quote.lineItems.some(item=>item.itemId==='stripe-twin-racing'));
    const applied=await services.economy.applyAppearance(owner.user.id,{quoteId:quote.quoteId},'family-paint-'+id);
    assert.equal(BigInt(before)-BigInt(applied.wallet.balance),BigInt(quote.total));assert.equal(applied.pricePaid,quote.total);assert(applied.appearance.owned);
    assert.deepEqual(await services.economy.applyAppearance(owner.user.id,{quoteId:quote.quoteId},'family-paint-'+id),applied);
    const repaint=await services.economy.quoteAppearance(owner.user.id,{carId:id,stripeColor:'#ccbbee'});
    assert.deepEqual(repaint.lineItems.map(item=>item.itemId),['stripe-paint']);
    const painted=await services.economy.applyAppearance(owner.user.id,{quoteId:repaint.quoteId},'family-stripe-repaint-'+id);
    assert.equal(BigInt(applied.wallet.balance)-BigInt(painted.wallet.balance),BigInt(repaint.total));
    saved.set(id,await services.economy.resolveLoadout(owner.user.id));
  }
  for(const id of ids){await services.economy.saveLoadout(owner.user.id,{carId:id,rimId:'stock'});const current=await services.economy.resolveLoadout(owner.user.id);assert.deepEqual(current,saved.get(id));}
});

test('admin can price, lock and upload new-vehicle thumbnails while published tuning changes only the selected model',async()=>{
  const png=await sharp({create:{width:32,height:18,channels:3,background:'#526475'}}).png().toBuffer();
  for(const id of ids){
    const previous=(await services.economy.getCatalog()).cars.find(car=>car.id===id)!;
    await services.admin.updateCatalog(admin.id,id,{expectedVersion:previous.catalogVersion,price:'355000',locked:true,reason});
    await assert.rejects(services.economy.purchase(visitor.user.id,{itemId:id,catalogVersion:previous.catalogVersion},'family-stale-price-'+id),isCode('CATALOG_CHANGED'));
    await services.economy.saveLoadout(owner.user.id,{carId:id,rimId:'stock'});assert.equal((await services.economy.resolveLoadout(owner.user.id)).carId,id);
    const slot=await services.vehicleThumbnails.replace(admin.id,id,1,reason,png,'image/png');assert.equal(slot.carId,id);assert.equal(slot.version,2);assert(slot.thumbnail);
    assert.equal((await services.economy.getCatalog()).cars.find(car=>car.id===id)!.thumbnail?.id,slot.thumbnail.id);
  }
  const tuning=await services.admin.getTuning(admin.id);
  await services.admin.publishTuning(admin.id,{expectedVersion:tuning.version,carId:ids[0],topSpeed:220,zeroTo100:7.9,handling:1.05,reason});
  const after=await services.admin.getTuning(admin.id);
  assert.equal(after.cars.find(car=>car.carId===ids[0])?.topSpeed,220);
  for(const id of ids.slice(1))assert.deepEqual(after.cars.find(car=>car.carId===id),tuning.cars.find(car=>car.carId===id));
});

test('SUV slug collisions do not overwrite a differently named operator group',async()=>{
  await control.query(`CREATE SCHEMA ${collisionSchema}`);const alternate=new pg.Pool({connectionString,options:`-c search_path=${collisionSchema}`,max:2});
  try{
    await migrate(alternate,legacyDirectory);await alternate.query("INSERT INTO vehicle_categories(id,name,sort_order,version) VALUES('suv','Operator collection',3,7)");
    await migrate(alternate);const existing=(await alternate.query("SELECT * FROM vehicle_categories WHERE id='suv'")).rows[0];
    assert.deepEqual(existing,{id:'suv',name:'Operator collection',sort_order:3,version:7});
    const actual=(await alternate.query("SELECT id FROM vehicle_categories WHERE name='SUV'")).rows[0];assert.equal(actual.id,'suv-1');
    assert.equal((await alternate.query("SELECT count(*)::int n FROM vehicle_category_assignments WHERE category_id='suv-1'")).rows[0].n,3);
  }finally{await alternate.end();}
});
