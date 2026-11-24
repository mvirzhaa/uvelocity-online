import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {copyFile,mkdtemp,readdir,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {before,after,test} from 'node:test';
import pg from 'pg';
import {migrate} from '../../db/migrate.js';
import {transaction} from '../../db/pool.js';
import {createServices,type BackendServices} from '../index.js';
import type {AuthResult,PublicUser} from '../accounts.js';
import {mutateWallet} from '../wallet.js';
import {fingerprint} from '../validation.js';
import {freezeLoadout} from '../../../shared/config.js';
import type {AppearanceApplication,BeginRaceInput} from '../../../shared/types.js';

const connectionString=process.env.TEST_DATABASE_URL;assert(connectionString&&/test/i.test(new URL(connectionString).pathname),'Use the native PostgreSQL wrapper.');
const schema=`uv_cosmetic_paint_${process.pid}`,control=new pg.Pool({connectionString,max:2}),password='Cosmetic-Paint-Fixture-2026!';
let pool:pg.Pool,services:BackendServices,admin:PublicUser,oldStock:AuthResult,oldCustom:AuthResult,legacyDirectory:string,legacy:any;
const isCode=(code:string)=>(error:unknown)=>(error as {code?:string})?.code===code;
const paidQuoteId=randomUUID(),openQuoteId=randomUUID(),expiredQuoteId=randomUUID(),oldApplicationId=randomUUID();
const legacyReply:Record<string,unknown>={};
async function account(label:string,credit=200000):Promise<AuthResult>{
  const result=await services.accounts.register({email:`paint-${randomUUID()}@example.test`,displayName:label,password});
  if(credit)await services.admin.topup(admin.id,{userId:result.user.id,amount:String(credit),reference:randomUUID(),reason:'Synthetic cosmetic test balance'},randomUUID());return result;
}
async function price(id:string,changes:Record<string,unknown>){const row=(await pool.query('SELECT version FROM catalog_items WHERE id=$1',[id])).rows[0];return services.admin.updateCatalog(admin.id,id,{expectedVersion:row.version,reason:'Cosmetic pricing integration fixture',...changes});}
async function quote(who:AuthResult,selection:Record<string,unknown>={}){return services.economy.quoteAppearance(who.user.id,{carId:'brz',...selection});}
async function apply(who:AuthResult,selection:Record<string,unknown>={},key=randomUUID()):Promise<AppearanceApplication>{const offer=await quote(who,selection);return services.economy.applyAppearance(who.user.id,{quoteId:offer.quoteId},key);}

before(async()=>{
  await control.query(`CREATE SCHEMA ${schema}`);pool=new pg.Pool({connectionString,options:`-c search_path=${schema}`,max:12});legacyDirectory=await mkdtemp(path.join(tmpdir(),'uv-paint-legacy-'));
  for(const name of await readdir('database/migrations'))if(/^(00[1-9]|010)_/.test(name))await copyFile(path.join('database/migrations',name),path.join(legacyDirectory,name));
  assert.equal((await migrate(pool,legacyDirectory)).length,10);services=createServices(pool,{prayerNow:()=>new Date('2026-11-20T03:00:00Z')});
  admin=await services.accounts.createAdmin({email:'paint-admin@example.test',displayName:'Paint Operator',password});oldStock=await account('Legacy Stock',0);oldCustom=await account('Legacy Custom',0);
  await services.economy.purchase(oldCustom.user.id,{itemId:'six-spoke',catalogVersion:1},'legacy-custom-rim-purchase');
  await price('paint-body',{price:'13000'});
  await pool.query("UPDATE car_appearances SET rim_color='#bb7788' WHERE user_id=$1",[oldStock.user.id]);await pool.query("UPDATE loadouts SET rim_color='#bb7788' WHERE user_id=$1",[oldStock.user.id]);
  // Persist an authentic old-schema paid customization, including append-only
  // financial/application records and its cached idempotent response.
  const original={carId:'brz',rimId:'six-spoke',color:'#2866b8',finish:'metallic',rimColor:'#c7cdd4',stripeId:'none',stripeColor:'#ffffff',version:'1',owned:true,canCustomize:true};
  const selected={carId:'brz',rimId:'six-spoke',color:'#2866b8',finish:'metallic',rimColor:'#bbaa66',stripeId:'none',stripeColor:'#ffffff'};
  const lines=[{itemId:'paint-rims',name:'Cat pelek kustom',price:'5000',catalogVersion:1}],appearance={...original,rimColor:'#bbaa66',version:'2'};
  await transaction(pool,async db=>{
    const wallet=await mutateWallet(db,{userId:oldCustom.user.id,delta:-5000n,kind:'customization',eventKey:'appearance:'+oldApplicationId,reason:'Legacy paid rim paint fixture'});
    Object.assign(legacyReply,{applicationId:oldApplicationId,appearance,loadout:{...selected,wheelId:'six-spoke',version:'2',appearanceVersion:'2'},wallet:{balance:wallet.balance,version:wallet.version,currency:'RP_GAME'},pricePaid:'5000',lineItems:lines,noOp:false});
    await db.query("UPDATE car_appearances SET rim_id='six-spoke',rim_color='#bbaa66',version=2 WHERE user_id=$1 AND car_id='brz'",[oldCustom.user.id]);
    await db.query("UPDATE loadouts SET wheel_item_id='six-spoke',rim_color='#bbaa66',version=2 WHERE user_id=$1",[oldCustom.user.id]);
    await db.query(`INSERT INTO appearance_quotes(id,user_id,car_id,appearance_version,selection,line_items,total,no_op,expires_at,applied_response)
      VALUES($1,$2,'brz',1,$3::jsonb,$4::jsonb,5000,false,now()+interval '10 minutes',$5::jsonb)`,[paidQuoteId,oldCustom.user.id,JSON.stringify(selected),JSON.stringify(lines),JSON.stringify(legacyReply)]);
    await db.query(`INSERT INTO appearance_applications(id,quote_id,user_id,car_id,price_paid,line_items,before_appearance,after_appearance,ledger_entry_id)
      VALUES($1,$2,$3,'brz',5000,$4::jsonb,$5::jsonb,$6::jsonb,$7)`,[oldApplicationId,paidQuoteId,oldCustom.user.id,JSON.stringify(lines),JSON.stringify(original),JSON.stringify(appearance),wallet.entryId]);
    await db.query('INSERT INTO idempotency_requests(actor_id,operation,key,request_hash,response) VALUES($1,$2,$3,$4,$5::jsonb)',[oldCustom.user.id,'appearance.apply','legacy-painted-retry',fingerprint({quoteId:paidQuoteId}),JSON.stringify(legacyReply)]);
  });
  for(const [id,expires]of [[openQuoteId,'10 minutes'],[expiredQuoteId,'-1 day']])await pool.query(`INSERT INTO appearance_quotes(id,user_id,car_id,appearance_version,selection,line_items,total,no_op,expires_at)
    VALUES($1,$2,'brz',1,$3::jsonb,'[]',0,true,now()+$4::interval)`,[id,oldStock.user.id,JSON.stringify({...original,rimId:'stock',rimColor:'#bb7788'}),expires]);
  legacy={catalog:(await pool.query('SELECT * FROM catalog_items ORDER BY id')).rows,wallets:(await pool.query('SELECT * FROM wallets ORDER BY user_id')).rows,history:(await pool.query('SELECT * FROM wallet_entries ORDER BY id')).rows,
    quotes:(await pool.query('SELECT id,expires_at,applied_response FROM appearance_quotes ORDER BY id')).rows,appearanceHistory:(await pool.query('SELECT * FROM appearance_applications')).rows};
  assert.deepEqual(await migrate(pool),['011_stock_rim_and_stripe_paint.sql','012_reference_vehicle_name.sql','013_panther_grand_touring.sql','014_vehicle_categories.sql','015_suv_catalog.sql','016_iconic_collectors.sql']);
});
after(async()=>{if(pool)await pool.end();await control.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await control.end();if(legacyDirectory)await rm(legacyDirectory,{recursive:true,force:true});});

test('migration preserves legacy materials, financial history and committed retries while invalidating only open quotes',async()=>{
  assert.deepEqual(await migrate(pool),[]);
  for(const old of legacy.catalog){const current=(await pool.query('SELECT * FROM catalog_items WHERE id=$1',[old.id])).rows[0];assert.deepEqual(current,{...old,...(old.id==='paint-rims'&&old.name==='Cat pelek kustom'?{name:'Cat pelek bawaan & kustom'}:{}),...(old.id==='jesko-absolut'&&old.name==='Koenigsegg Jesko Absolut'?{name:'Koenigsegg Regera'}:{})});}
  assert.deepEqual((await pool.query('SELECT * FROM wallets ORDER BY user_id')).rows,legacy.wallets);assert.deepEqual((await pool.query('SELECT * FROM wallet_entries ORDER BY id')).rows,legacy.history);assert.deepEqual((await pool.query('SELECT * FROM appearance_applications')).rows,legacy.appearanceHistory);
  const quotes=(await pool.query('SELECT id,expires_at,applied_response FROM appearance_quotes ORDER BY id')).rows;
  for(const old of legacy.quotes){const current=quotes.find(row=>row.id===old.id)!;if(old.id===openQuoteId)assert(current.expires_at.getTime()<=Date.now());else assert.deepEqual(current,old);}
  await assert.rejects(services.economy.applyAppearance(oldStock.user.id,{quoteId:openQuoteId},'expired-upgrade-quote'),isCode('QUOTE_EXPIRED'));
  assert.deepEqual(await services.economy.applyAppearance(oldCustom.user.id,{quoteId:paidQuoteId},'legacy-painted-retry'),legacyReply);assert.deepEqual(await services.economy.applyAppearance(oldCustom.user.id,{quoteId:paidQuoteId},'legacy-paid-new-key'),legacyReply);
  const stock=await services.economy.getProfile(oldStock.user.id),custom=await services.economy.getProfile(oldCustom.user.id);assert.equal(stock.loadout.stockRimPainted,false);assert.equal(stock.loadout.rimColor,'#bb7788');assert.equal(custom.loadout.stockRimPainted,false);assert.equal(custom.loadout.rimColor,'#bbaa66');assert.equal(custom.wallet.balance,'0');
  assert.equal((await services.economy.getCatalog()).services.find(item=>item.id==='stripe-paint')!.price,'5000');
});

test('first stock silver application is paid even at placeholder RGB; concurrent and later retries debit once',async()=>{
  const racer=await account('Silver Stock'),before=await services.economy.getProfile(racer.user.id),offer=await quote(racer,{rimId:'stock',rimColor:'#c7cdd4',stockRimPainted:true});
  assert.equal(offer.total,'5000');assert.equal(offer.noOp,false);assert.deepEqual(offer.lineItems.map(line=>line.itemId),['paint-rims']);assert.equal((await services.economy.getProfile(racer.user.id)).wallet.balance,before.wallet.balance);
  const results=await Promise.all(Array.from({length:4},()=>services.economy.applyAppearance(racer.user.id,{quoteId:offer.quoteId},'silver-stock-retry')));assert(results.every(result=>result.applicationId===results[0]!.applicationId));
  assert.equal(results[0]!.appearance.stockRimPainted,true);assert.equal(results[0]!.loadout.stockRimPainted,true);assert.equal(BigInt(before.wallet.balance)-BigInt(results[0]!.wallet.balance),5000n);
  assert.equal((await services.economy.applyAppearance(racer.user.id,{quoteId:offer.quoteId},'silver-stock-new-key')).applicationId,results[0]!.applicationId);
  const noop=await quote(racer,{rimId:'stock',rimColor:'#c7cdd4',stockRimPainted:true});assert.equal(noop.total,'0');assert(noop.noOp);
  const session=await services.accounts.login({email:racer.user.email,password}),frozen=freezeLoadout(await services.economy.resolveLoadout(session.user.id));assert.equal(frozen.stockRimPainted,true);assert.equal(frozen.rimColor,'#c7cdd4');
  assert.equal((await pool.query("SELECT count(*)::int n FROM wallet_entries WHERE user_id=$1 AND kind='customization'",[racer.user.id])).rows[0].n,1);
});

test('custom-rim selection preserves stock state and restoring factory material is a paid explicit operation',async()=>{
  const racer=await account('Factory Restore');await services.economy.purchase(racer.user.id,{itemId:'six-spoke',catalogVersion:1},'stock-restore-owned-rim');await apply(racer,{rimColor:'#eebb22',stockRimPainted:true});
  const before=(await services.economy.getProfile(racer.user.id)).wallet.balance;
  await services.economy.saveLoadout(racer.user.id,{carId:'brz',rimId:'six-spoke'});const hiddenToggle=await quote(racer,{rimId:'six-spoke',stockRimPainted:false});assert.equal(hiddenToggle.selection.stockRimPainted,true);assert.equal(hiddenToggle.total,'0');assert(hiddenToggle.noOp);
  await services.economy.saveLoadout(racer.user.id,{carId:'brz',rimId:'stock'});assert.equal((await services.economy.getProfile(racer.user.id)).wallet.balance,before);
  const restore=await apply(racer,{rimId:'stock',stockRimPainted:false,rimColor:'#ffffff'});assert.equal(restore.pricePaid,'5000');assert.equal(restore.appearance.stockRimPainted,false);assert.equal(restore.appearance.rimColor,'#eebb22');
  const hidden=await quote(racer,{rimId:'stock',stockRimPainted:false,rimColor:'#000000'});assert.equal(hidden.total,'0');assert(hidden.noOp);assert.equal(hidden.selection.rimColor,'#eebb22');
  const customColor=await apply(racer,{rimId:'six-spoke',stockRimPainted:true,rimColor:'#112233'});assert.equal(customColor.pricePaid,'5000');assert.equal(customColor.appearance.stockRimPainted,false);assert.equal(customColor.appearance.rimColor,'#112233');
});

test('stock paint cannot bypass quote via loadout, frozen selection, race begin or a forged boolean',async()=>{
  const racer=await account('Paint Gates'),saved=(await services.economy.getProfile(racer.user.id)).loadout;
  for(const change of [{stockRimPainted:true},{rimColor:'#221144'}]){
    await assert.rejects(services.economy.saveLoadout(racer.user.id,{...saved,...change}),isCode('PAID_CUSTOMIZATION_REQUIRED'));
    await assert.rejects(services.economy.resolveLoadout(racer.user.id,{...saved,...change}),isCode('PAID_CUSTOMIZATION_REQUIRED'));
  }
  await assert.rejects(quote(racer,{stockRimPainted:'true'}),isCode('INVALID_STOCK_RIM_PAINT'));
  const inferred=await quote(racer,{rimId:'stock',rimColor:'#445566'});assert.equal(inferred.selection.stockRimPainted,true);assert.equal(inferred.total,'5000');
  const frozen=await services.economy.resolveLoadout(racer.user.id),race:BeginRaceInput={raceId:randomUUID(),roomId:'stock-forgery',inviteCode:'STOCK',config:{circuit:'city',laps:1,bots:0,maxHumans:1,difficulty:'normal',collisionMode:'ghost'},rulesetVersion:frozen.tuningVersion,createdAt:new Date().toISOString(),participants:[{id:'driver',userId:racer.user.id,isBot:false,name:'Driver',carId:'brz',loadout:{...frozen,stockRimPainted:true}}]};
  await assert.rejects(services.economy.beginRace(race),isCode('PAID_CUSTOMIZATION_REQUIRED'));assert.equal((await pool.query('SELECT 1 FROM races WHERE id=$1',[race.raceId])).rowCount,0);
  const {stockRimPainted:_,...oldWire}=frozen;assert.equal(freezeLoadout(oldWire).stockRimPainted,false);assert.throws(()=>freezeLoadout({...frozen,stockRimPainted:'true'} as any),/stock rim/);
});

test('stripe installation/replacement includes selected color once and same-design recolor has a separate fee',async()=>{
  const racer=await account('Stripe Fees');const installed=await apply(racer,{stripeId:'twin-racing',stripeColor:'#ff2200'});assert.equal(installed.pricePaid,'15000');assert.deepEqual(installed.lineItems.map(line=>line.itemId),['stripe-twin-racing']);
  const recolored=await apply(racer,{stripeId:'twin-racing',stripeColor:'#00ccff'});assert.equal(recolored.pricePaid,'5000');assert.deepEqual(recolored.lineItems.map(line=>line.itemId),['stripe-paint']);assert.equal(recolored.appearance.stripeColor,'#00ccff');
  const noop=await quote(racer,{stripeId:'twin-racing',stripeColor:'#00ccff'});assert(noop.noOp);assert.equal(noop.total,'0');
  const replacement=await apply(racer,{stripeId:'side-sweep',stripeColor:'#112233'});assert.equal(replacement.pricePaid,'12000');assert.deepEqual(replacement.lineItems.map(line=>line.itemId),['stripe-side-sweep']);
  assert.equal((await apply(racer,{stripeId:'none'})).pricePaid,'5000');const absent=await quote(racer,{stripeId:'none',stripeColor:'#ffffff'});assert(absent.noOp);assert.equal(absent.total,'0');
});

test('administrators control every color fee and enablement; changed prices invalidate outstanding quotes',async()=>{
  const racer=await account('Admin Color Fees');await apply(racer,{stripeId:'twin-racing',stripeColor:'#010203'});
  const matrix=[['paint-body',{color:'#345678',finish:'gloss'}],['paint-rims',{rimColor:'#654321',stockRimPainted:true}],['stripe-paint',{stripeColor:'#abcdef'}],['stripe-offset',{stripeId:'offset',stripeColor:'#ccaa11'}]] as const;
  for(const [index,[itemId,selection]]of matrix.entries()){
    const oldOffer=await quote(racer,selection),before=await services.economy.getProfile(racer.user.id),newPrice=String(6100+index*100);
    await price(itemId,{price:newPrice});await assert.rejects(services.economy.applyAppearance(racer.user.id,{quoteId:oldOffer.quoteId},randomUUID()),isCode('CATALOG_CHANGED'));assert.equal((await services.economy.getProfile(racer.user.id)).wallet.balance,before.wallet.balance);
    await price(itemId,{enabled:false});await assert.rejects(quote(racer,selection),isCode('SERVICE_UNAVAILABLE'));await price(itemId,{enabled:true});
    const paid=await apply(racer,selection);assert.equal(paid.pricePaid,newPrice);assert.deepEqual(paid.lineItems.map(line=>line.itemId),[itemId]);assert.equal(BigInt(before.wallet.balance)-BigInt(paid.wallet.balance),BigInt(newPrice));
  }
  await price('paint-body',{price:'13000'});await price('paint-rims',{price:'5000'});await price('stripe-paint',{price:'5000'});await price('stripe-offset',{price:'18000'});
});

test('an administrator-set zero price still requires a quote and records an actual stock paint application',async()=>{
  const racer=await account('Admin Free Paint');await price('paint-rims',{price:'0'});
  try{
    await assert.rejects(services.economy.saveLoadout(racer.user.id,{carId:'brz',stockRimPainted:true}),isCode('PAID_CUSTOMIZATION_REQUIRED'));
    const before=await services.economy.getProfile(racer.user.id),offer=await quote(racer,{stockRimPainted:true});assert.equal(offer.total,'0');assert.equal(offer.noOp,false);assert.equal(offer.lineItems[0]!.price,'0');
    const result=await services.economy.applyAppearance(racer.user.id,{quoteId:offer.quoteId},'admin-zero-stock-paint');assert.equal(result.appearance.stockRimPainted,true);assert.equal(result.wallet.balance,before.wallet.balance);assert.equal(result.noOp,false);
    assert.equal((await pool.query('SELECT count(*)::int n FROM appearance_applications WHERE user_id=$1',[racer.user.id])).rows[0].n,1);
  }finally{await price('paint-rims',{price:'5000'});}
});

test('competing stock paint quotes cannot double debit, and late failure rolls back flag/color/wallet atomically',async()=>{
  const racer=await account('Stock Atomicity'),before=await services.economy.getProfile(racer.user.id),a=await quote(racer,{stockRimPainted:true,rimColor:'#bb4411'}),b=await quote(racer,{stockRimPainted:true,rimColor:'#11bb44'});
  const attempts=await Promise.allSettled([a,b].map(offer=>services.economy.applyAppearance(racer.user.id,{quoteId:offer.quoteId},randomUUID())));assert.equal(attempts.filter(value=>value.status==='fulfilled').length,1);assert.equal((attempts.find(value=>value.status==='rejected') as PromiseRejectedResult).reason.code,'APPEARANCE_CHANGED');assert.equal(BigInt(before.wallet.balance)-BigInt((await services.economy.getProfile(racer.user.id)).wallet.balance),5000n);
  const original=await services.economy.getProfile(racer.user.id),restore=await quote(racer,{stockRimPainted:false});
  await pool.query("CREATE FUNCTION reject_paint_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'paint fixture rollback' USING ERRCODE='P0001'; END; $$");await pool.query('CREATE TRIGGER paint_fixture_failure BEFORE INSERT ON appearance_applications FOR EACH ROW EXECUTE FUNCTION reject_paint_fixture()');
  try{await assert.rejects(services.economy.applyAppearance(racer.user.id,{quoteId:restore.quoteId},'stock-paint-rollback'),isCode('P0001'));}finally{await pool.query('DROP TRIGGER paint_fixture_failure ON appearance_applications');await pool.query('DROP FUNCTION reject_paint_fixture()');}
  const after=await services.economy.getProfile(racer.user.id);assert.deepEqual(after.wallet,original.wallet);assert.deepEqual(after.loadout,original.loadout);assert.deepEqual(after.appearances,original.appearances);assert.equal((await pool.query("SELECT 1 FROM idempotency_requests WHERE key='stock-paint-rollback'")).rowCount,0);
  const retry=await services.economy.applyAppearance(racer.user.id,{quoteId:restore.quoteId},'stock-paint-rollback');assert.equal(retry.pricePaid,'5000');assert.equal(retry.appearance.stockRimPainted,false);
});

test('insufficient balances and temporary vehicle access never grant an unpaid stock paint state',async()=>{
  const racer=await account('Limited Paint',0);await services.economy.purchase(racer.user.id,{itemId:'six-spoke',catalogVersion:1},'limited-paint-wheel');await apply(racer,{stockRimPainted:true});
  const before=await services.economy.getProfile(racer.user.id);assert.equal(before.wallet.balance,'0');const offer=await quote(racer,{rimColor:'#aabbcc',stockRimPainted:true});assert.equal(offer.affordable,false);await assert.rejects(services.economy.applyAppearance(racer.user.id,{quoteId:offer.quoteId},'limited-paint-denied'),isCode('INSUFFICIENT_BALANCE'));assert.deepEqual((await services.economy.getProfile(racer.user.id)).loadout,before.loadout);
  await price('aventador',{locked:false});try{await assert.rejects(services.economy.quoteAppearance(racer.user.id,{carId:'aventador',rimId:'stock',rimColor:'#aabbcc',stockRimPainted:true}),isCode('CAR_NOT_OWNED'));const temporary=(await services.economy.getProfile(racer.user.id)).appearances.find(item=>item.carId==='aventador')!;assert.equal(temporary.stockRimPainted,false);assert.equal(temporary.canCustomize,false);}finally{await price('aventador',{locked:true});}
});
