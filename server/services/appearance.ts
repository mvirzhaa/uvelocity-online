import {randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {CAR_IDS,STRIPE_IDS,type CarId,type StripeId,type AppearanceSelection,type VehicleAppearance,type SavedLoadout,type AppearanceLineItem,type AppearanceQuote,type AppearanceApplication,type GameWallet} from '../../shared/types.js';
import {transaction} from '../db/pool.js';
import {assert} from './errors.js';
import {idempotent} from './idempotency.js';
import {mutateWallet} from './wallet.js';
import * as v from './validation.js';

type Queryable=Pool|PoolClient;
export const WHEEL_IDS=['stock','six-spoke','multi-spoke','mesh'] as const;
const COSMETICS=['color','finish','rimColor','stockRimPainted','stripeId','stripeColor'] as const;
export function requireCarId(value:unknown):CarId{assert(typeof value==='string'&&(CAR_IDS as readonly string[]).includes(value),400,'INVALID_CAR','Mobil tidak tersedia.');return value as CarId;}
export function requireWheelId(value:unknown):string{assert(typeof value==='string'&&(WHEEL_IDS as readonly string[]).includes(value),400,'INVALID_WHEEL','Pelek tidak tersedia.');return value;}
export function requireStripeId(value:unknown):StripeId{assert(typeof value==='string'&&(STRIPE_IDS as readonly string[]).includes(value),400,'INVALID_STRIPE','Desain striping tidak tersedia.');return value as StripeId;}
export function appearanceSelection(appearance:VehicleAppearance):AppearanceSelection{
 const {carId,rimId,color,finish,rimColor,stripeId,stripeColor}=appearance;return{carId,rimId,color,finish,rimColor,stockRimPainted:appearance.stockRimPainted??false,stripeId,stripeColor};
}
function ownedAppearance(row:Record<string,any>):VehicleAppearance{return{carId:requireCarId(row.car_id),rimId:row.rim_id,color:row.color.toLowerCase(),finish:row.finish,rimColor:row.rim_color.toLowerCase(),stockRimPainted:row.stock_rim_painted===true,stripeId:row.stripe_id,stripeColor:row.stripe_color.toLowerCase(),version:String(row.version),owned:true,canCustomize:true};}
function factoryAppearance(row:Record<string,any>):VehicleAppearance{return{carId:requireCarId(row.id),rimId:'stock',color:v.color(row.metadata?.color??'#2866b8'),finish:'metallic',rimColor:'#c7cdd4',stockRimPainted:false,stripeId:'none',stripeColor:'#ffffff',version:'0',owned:false,canCustomize:false};}
function stockPaint(value:unknown):boolean {assert(typeof value==='boolean',400,'INVALID_STOCK_RIM_PAINT','Status cat pelek standar harus berupa boolean.');return value;}

/** Per-car appearance is the authority. Loadouts are a projection of the selected
 * saved car, never a free write path for body paint, wheel paint or stripes. */
export class AppearanceService {
 constructor(readonly pool:Pool){}
 private async access(db:Queryable,userId:string,id:CarId,lock=false){
  const found=await db.query(`SELECT c.*,EXISTS(SELECT 1 FROM user_items i WHERE i.user_id=$1 AND i.item_id=c.id) AS owned FROM catalog_items c WHERE c.id=$2 AND c.kind='car'${lock?' FOR SHARE OF c':''}`,[userId,id]);
  assert(found.rowCount,404,'CAR_NOT_FOUND','Mobil tidak tersedia.');const row=found.rows[0];
  assert(row.owned||!row.locked,403,'CAR_LOCKED','Mobil dikunci. Beli permanen atau pilih mobil yang dapat diakses.');return row;
 }
 async get(db:Queryable,userId:string,id:CarId,lock=false,requireOwned=false):Promise<VehicleAppearance>{
  const access=await this.access(db,userId,id);
  assert(!requireOwned||access.owned,403,'CAR_NOT_OWNED','Kustomisasi berbayar hanya untuk mobil yang dimiliki permanen.');
  if(!access.owned)return factoryAppearance(access);
  const result=await db.query(`SELECT * FROM car_appearances WHERE user_id=$1 AND car_id=$2${lock?' FOR UPDATE':''}`,[userId,id]);
  assert(result.rowCount,503,'APPEARANCE_NOT_FOUND','Konfigurasi kendaraan belum tersedia.');return ownedAppearance(result.rows[0]);
 }
 async list(userId:string):Promise<VehicleAppearance[]>{
  const result=await this.pool.query(`SELECT c.id,c.metadata,EXISTS(SELECT 1 FROM user_items i WHERE i.user_id=$1 AND i.item_id=c.id) AS owned,a.*
   FROM catalog_items c LEFT JOIN car_appearances a ON a.user_id=$1 AND a.car_id=c.id
   WHERE c.kind='car' AND (NOT c.locked OR EXISTS(SELECT 1 FROM user_items i WHERE i.user_id=$1 AND i.item_id=c.id)) ORDER BY c.id`,[userId]);
  return result.rows.map(row=>row.owned?ownedAppearance(row):factoryAppearance(row));
 }
 async assertWheel(db:Queryable,userId:string,id:string){
  requireWheelId(id);const found=await db.query('SELECT 1 FROM user_items WHERE user_id=$1 AND item_id=$2',[userId,id]);
  assert(found.rowCount,403,'WHEEL_NOT_OWNED','Pelek belum dimiliki.');
 }
 private chosenWheel(body:Record<string,unknown>,current:VehicleAppearance){
  if(body.rimId!==undefined&&body.wheelId!==undefined)assert(body.rimId===body.wheelId,400,'INVALID_WHEEL','Pilihan pelek tidak konsisten.');
  return requireWheelId(body.rimId??body.wheelId??current.rimId);
 }
 private compareSuppliedCosmetics(body:Record<string,unknown>,current:VehicleAppearance){
  for(const field of COSMETICS){
   if(body[field]===undefined)continue;
   const value=field==='finish'?v.finish(body[field]):field==='stripeId'?requireStripeId(body[field]):field==='stockRimPainted'?stockPaint(body[field]):v.color(body[field]);
   assert(value===(field==='stockRimPainted'?(current.stockRimPainted??false):current[field]),403,'PAID_CUSTOMIZATION_REQUIRED','Perubahan cat atau striping harus dikonfirmasi melalui penawaran bengkel.');
  }
  const expected=body.appearanceVersion??body.expectedAppearanceVersion;
  if(expected!==undefined)assert(typeof expected==='string'&&expected===current.version,409,'APPEARANCE_CHANGED','Konfigurasi mobil telah berubah. Muat ulang garasi.');
 }
 async resolve(db:Queryable,userId:string,input?:Record<string,unknown>,lock=false):Promise<AppearanceSelection&{appearanceVersion:string}>{
  let body=input;
  if(!body){const active=await db.query('SELECT car_item_id,wheel_item_id FROM loadouts WHERE user_id=$1',[userId]);assert(active.rowCount,404,'USER_NOT_FOUND','Profil tidak ditemukan.');body={carId:active.rows[0].car_item_id,rimId:active.rows[0].wheel_item_id};}
  const id=requireCarId(body.carId);if(lock)await this.access(db,userId,id,true);
  const current=await this.get(db,userId,id,lock);this.compareSuppliedCosmetics(body,current);
  const rimId=this.chosenWheel(body,current);await this.assertWheel(db,userId,rimId);
  return{...appearanceSelection(current),rimId,appearanceVersion:current.version};
 }
 async lockWallet(client:PoolClient,userId:string):Promise<GameWallet>{
  const result=await client.query('SELECT balance,version FROM wallets WHERE user_id=$1 FOR UPDATE',[userId]);assert(result.rowCount,404,'USER_NOT_FOUND','Profil tidak ditemukan.');return{...result.rows[0],currency:'RP_GAME'};
 }
 private async writeLoadout(client:PoolClient,userId:string,selection:AppearanceSelection,appearanceVersion:string):Promise<SavedLoadout>{
  const values=[userId,selection.carId,selection.rimId,selection.color,selection.finish,selection.rimColor,selection.stripeId,selection.stripeColor,selection.stockRimPainted??false];
  await client.query(`UPDATE loadouts SET car_item_id=$2,wheel_item_id=$3,color=$4,finish=$5,rim_color=$6,stripe_id=$7,stripe_color=$8,stock_rim_painted=$9,version=version+1,updated_at=now()
   WHERE user_id=$1 AND (car_item_id,wheel_item_id,color,finish,rim_color,stripe_id,stripe_color,stock_rim_painted) IS DISTINCT FROM ($2,$3,$4,$5,$6,$7,$8,$9)`,values);
  const result=await client.query('SELECT version FROM loadouts WHERE user_id=$1',[userId]);assert(result.rowCount,404,'USER_NOT_FOUND','Profil tidak ditemukan.');
  return{...selection,wheelId:selection.rimId,version:String(result.rows[0].version),appearanceVersion};
 }
 async saveLoadout(userId:string,input:unknown){
  const body=v.object(input),id=requireCarId(body.carId);
  return transaction(this.pool,async client=>{
   await this.access(client,userId,id,true);await this.lockWallet(client,userId);
   let current=await this.get(client,userId,id,true);this.compareSuppliedCosmetics(body,current);const rimId=this.chosenWheel(body,current);await this.assertWheel(client,userId,rimId);
   if(current.owned&&rimId!==current.rimId){const updated=await client.query('UPDATE car_appearances SET rim_id=$3,version=version+1,updated_at=now() WHERE user_id=$1 AND car_id=$2 RETURNING *',[userId,id,rimId]);current=ownedAppearance(updated.rows[0]);}
   return{loadout:await this.writeLoadout(client,userId,{...appearanceSelection(current),rimId},current.version)};
  });
 }
 /** Repair only the selected projection after temporary free access is revoked.
  * This neither grants/removes inventory nor touches an in-progress race. */
 async activeLoadout(userId:string):Promise<SavedLoadout>{
  return transaction(this.pool,async client=>{
   await this.lockWallet(client,userId);
   const active=await client.query('SELECT * FROM loadouts WHERE user_id=$1 FOR UPDATE',[userId]);assert(active.rowCount,404,'USER_NOT_FOUND','Profil tidak ditemukan.');
   const row=active.rows[0];let current:VehicleAppearance;
   try{current=await this.get(client,userId,requireCarId(row.car_item_id));}
   catch(error){
    if((error as {code?:string}).code!=='CAR_LOCKED')throw error;
    const fallback=await client.query("SELECT c.id FROM user_items i JOIN catalog_items c ON c.id=i.item_id WHERE i.user_id=$1 AND c.kind='car' ORDER BY (c.id='brz') DESC,c.id LIMIT 1",[userId]);
    assert(fallback.rowCount,403,'NO_ACCESSIBLE_CAR','Tidak ada mobil yang dapat digunakan.');current=await this.get(client,userId,requireCarId(fallback.rows[0].id));
   }
   const rimId=current.owned?current.rimId:row.wheel_item_id;await this.assertWheel(client,userId,rimId);
   return this.writeLoadout(client,userId,{...appearanceSelection(current),rimId},current.version);
  });
 }
 private async desired(db:Queryable,userId:string,body:Record<string,unknown>,current:VehicleAppearance):Promise<AppearanceSelection>{
  const rimId=this.chosenWheel(body,current);await this.assertWheel(db,userId,rimId);
  const stripeId=body.stripeId===undefined?current.stripeId:requireStripeId(body.stripeId);
  const priorStockPaint=current.stockRimPainted??false,requestedStockPaint=body.stockRimPainted===undefined?undefined:stockPaint(body.stockRimPainted);
  const selection:AppearanceSelection={carId:current.carId,rimId,color:v.color(body.color??current.color),finish:v.finish(body.finish??current.finish),rimColor:v.color(body.rimColor??current.rimColor),stockRimPainted:priorStockPaint,stripeId,stripeColor:v.color(body.stripeColor??current.stripeColor)};
  if(rimId==='stock'){
   selection.stockRimPainted=requestedStockPaint??(selection.rimColor!==current.rimColor?true:priorStockPaint);
   // Factory restoration retains the remembered paint color; changing a hidden
   // RGB while factory materials are active is neither a charge nor a free edit.
   if(!selection.stockRimPainted)selection.rimColor=current.rimColor;
  }
  // A quote selecting a custom rim cannot silently toggle stock material state.
  // Its existing rim-color path stays independently usable and paid.
  if(stripeId==='none')selection.stripeColor=current.stripeColor;
  return selection;
 }
 private serviceIds(current:VehicleAppearance,desired:AppearanceSelection):string[]{
  const ids:string[]=[];
  if(current.color!==desired.color||current.finish!==desired.finish)ids.push('paint-body');
  if(current.rimColor!==desired.rimColor||(current.stockRimPainted??false)!==(desired.stockRimPainted??false))ids.push('paint-rims');
  if(current.stripeId!==desired.stripeId)ids.push(desired.stripeId==='none'?'stripe-remove':'stripe-'+desired.stripeId);
  else if(desired.stripeId!=='none'&&current.stripeColor!==desired.stripeColor)ids.push('stripe-paint');
  return ids;
 }
 private async lineItems(db:Queryable,ids:string[],stale=false):Promise<AppearanceLineItem[]>{
  if(!ids.length)return[];
  const result=await db.query("SELECT id,name,price,version,active FROM catalog_items WHERE id=ANY($1::text[]) AND kind='service'",[ids]),rows=new Map(result.rows.map(row=>[row.id,row]));
  assert(ids.every(id=>rows.get(id)?.active),409,stale?'CATALOG_CHANGED':'SERVICE_UNAVAILABLE',stale?'Harga atau layanan berubah. Minta penawaran baru.':'Layanan bengkel sedang tidak tersedia.');
  return ids.map(id=>{const row=rows.get(id)!;return{itemId:id,name:row.name,price:String(row.price),catalogVersion:row.version};});
 }
 async quote(userId:string,input:unknown):Promise<AppearanceQuote>{
  const body=v.object(input),id=requireCarId(body.carId);
  return transaction(this.pool,async client=>{
   const current=await this.get(client,userId,id,false,true),selection=await this.desired(client,userId,body,current),lineItems=await this.lineItems(client,this.serviceIds(current,selection));
   const total=lineItems.reduce((sum,line)=>sum+BigInt(line.price),0n).toString(),noOp=v.fingerprint(appearanceSelection(current))===v.fingerprint(selection);
   const walletRow=await client.query('SELECT balance,version FROM wallets WHERE user_id=$1',[userId]);assert(walletRow.rowCount,404,'USER_NOT_FOUND','Profil tidak ditemukan.');const wallet:GameWallet={...walletRow.rows[0],currency:'RP_GAME'};
   const quoteId=randomUUID(),expiresAt=new Date(Date.now()+10*60*1000).toISOString();
   await client.query('INSERT INTO appearance_quotes(id,user_id,car_id,appearance_version,selection,line_items,total,no_op,expires_at) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9)',[quoteId,userId,id,current.version,JSON.stringify(selection),JSON.stringify(lineItems),total,noOp,expiresAt]);
   return{quoteId,carId:id,appearanceVersion:current.version,selection,currentAppearance:current,lineItems,total,wallet,affordable:BigInt(wallet.balance)>=BigInt(total),noOp,expiresAt};
  });
 }
 async apply(userId:string,input:unknown,key:unknown):Promise<AppearanceApplication>{
  const body=v.object(input),quoteId=v.uuid(body.quoteId,'Penawaran');
  return transaction(this.pool,client=>idempotent(client,userId,'appearance.apply',key,{quoteId},async()=>{
   const found=await client.query('SELECT * FROM appearance_quotes WHERE id=$1 AND user_id=$2 FOR UPDATE',[quoteId,userId]);assert(found.rowCount,404,'QUOTE_NOT_FOUND','Penawaran tidak ditemukan.');const quote=found.rows[0];
   if(quote.applied_response)return quote.applied_response as AppearanceApplication;
   assert(new Date(quote.expires_at).getTime()>Date.now(),409,'QUOTE_EXPIRED','Penawaran kedaluwarsa. Minta penawaran baru.');
   const ids=(quote.line_items as AppearanceLineItem[]).map(line=>line.itemId);
   // All catalog locks precede the wallet lock, matching ordinary purchases.
   await client.query('SELECT id FROM catalog_items WHERE id=ANY($1::text[]) ORDER BY id FOR SHARE',[[quote.car_id,...ids]]);
   let wallet=await this.lockWallet(client,userId);const current=await this.get(client,userId,requireCarId(quote.car_id),true,true);
   assert(current.version===String(quote.appearance_version),409,'APPEARANCE_CHANGED','Konfigurasi mobil telah berubah. Minta penawaran baru.');
   const selected=await this.desired(client,userId,v.object(quote.selection),current),lineItems=await this.lineItems(client,this.serviceIds(current,selected),true);
   const total=lineItems.reduce((sum,line)=>sum+BigInt(line.price),0n);
   assert(v.fingerprint(lineItems)===v.fingerprint(quote.line_items)&&total===BigInt(quote.total),409,'CATALOG_CHANGED','Harga berubah. Minta penawaran baru sebelum membayar.');
   const applicationId=randomUUID();let ledgerEntryId:string|null=null;
   if(total>0n){const mutation=await mutateWallet(client,{userId,delta:-total,kind:'customization',eventKey:'appearance:'+applicationId,reason:'Bengkel: '+lineItems.map(line=>line.name).join(', ')});ledgerEntryId=mutation.entryId;wallet={balance:mutation.balance,version:mutation.version,currency:'RP_GAME'};}
   const noOp=v.fingerprint(appearanceSelection(current))===v.fingerprint(selected);let appearance=current;
   if(!noOp){const updated=await client.query(`UPDATE car_appearances SET rim_id=$3,color=$4,finish=$5,rim_color=$6,stripe_id=$7,stripe_color=$8,stock_rim_painted=$9,version=version+1,updated_at=now() WHERE user_id=$1 AND car_id=$2 RETURNING *`,[userId,selected.carId,selected.rimId,selected.color,selected.finish,selected.rimColor,selected.stripeId,selected.stripeColor,selected.stockRimPainted??false]);appearance=ownedAppearance(updated.rows[0]);}
   const loadout=await this.writeLoadout(client,userId,selected,appearance.version),response:AppearanceApplication={applicationId,appearance,loadout,wallet,pricePaid:total.toString(),lineItems,noOp};
   await client.query('INSERT INTO appearance_applications(id,quote_id,user_id,car_id,price_paid,line_items,before_appearance,after_appearance,ledger_entry_id) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9)',[applicationId,quoteId,userId,selected.carId,total.toString(),JSON.stringify(lineItems),JSON.stringify(current),JSON.stringify(appearance),ledgerEntryId]);
   await client.query('UPDATE appearance_quotes SET applied_response=$2::jsonb WHERE id=$1',[quoteId,JSON.stringify(response)]);return response;
  }));
 }
}
