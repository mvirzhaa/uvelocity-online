import type { CarId, Finish, VehicleStats } from '../../shared/types.js';
import type { MediaAsset, MediaKind } from '../../shared/media.js';
import type { VehicleThumbnail } from '../../shared/vehicle-thumbnails.js';
import type { VehicleCategory } from '../../shared/vehicle-categories.js';
export type { VehicleCategory } from '../../shared/vehicle-categories.js';

export interface User {id:string;email:string;displayName:string;avatarId:string;role:'player'|'admin';createdAt:string}
export type StripeId='none'|'twin-racing'|'offset'|'side-sweep'|'circuit'|'heritage';
export interface Loadout {carId:CarId;rimId:string;wheelId?:string;color:string;rimColor?:string;stockRimPainted?:boolean;finish:Finish;stripeId?:StripeId;stripeColor?:string;version?:string;appearanceVersion?:string}
export interface VehicleAppearance extends Loadout {version:string;owned:boolean;canCustomize:boolean}
export interface Wallet {balance:string;version:string;currency:string}
export interface Profile {user:User;wallet:Wallet;inventory:{cars:string[];wheels:string[]};accessibleCars:string[];appearances:VehicleAppearance[];loadout:Loadout;statistics:{races:number;wins:number;rewards:string}}
export interface CatalogItem {id:string;itemId:string;kind:'car'|'wheel'|'service';name:string;price:string;catalogVersion:number;enabled:boolean;locked?:boolean;color:string;stats?:VehicleStats;topSpeed?:number;zeroTo100?:number;handling?:number;drive?:string;tuningVersion?:string;cosmeticOnly?:boolean;modelOrigin?:string;modelNote?:string;thumbnail?:VehicleThumbnail|null;categoryId?:string|null}
export interface Catalog {currency:string;currencyLabel:string;rulesetVersion:string;categories:VehicleCategory[];cars:CatalogItem[];wheels:CatalogItem[];services:CatalogItem[];tuningBounds?:Record<string,unknown>}
export interface AppearanceQuote {quoteId:string;carId:CarId;appearanceVersion:string;selection:Loadout;lineItems:Array<{itemId:string;name:string;price:string;catalogVersion:number}>;total:string;wallet:Wallet;affordable:boolean;noOp:boolean;expiresAt:string}
export interface AppearanceApplication {applicationId:string|null;appearance:VehicleAppearance;loadout:Loadout;wallet:Wallet;pricePaid:string;lineItems:AppearanceQuote['lineItems'];noOp:boolean}
export interface LedgerEntry {id:string;kind:string;delta:string;amount?:string;balanceAfter:string;reason:string;createdAt:string}
let csrfToken:string|null=null;
export class ApiError extends Error {constructor(public status:number,public code:string,message:string){super(message);this.name='ApiError';}}
export function clearAuth(){csrfToken=null;}
export async function api<T>(path:string,method='GET',body?:unknown,idempotencyKey?:string,options:{signal?:AbortSignal}={}):Promise<T>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20_000),cancel=()=>controller.abort(options.signal?.reason);
  if(options.signal?.aborted)cancel();else options.signal?.addEventListener('abort',cancel,{once:true});
  try{
    const headers:Record<string,string>={Accept:'application/json'};
    if(method!=='GET'){headers['Content-Type']='application/json';if(csrfToken)headers['X-CSRF-Token']=csrfToken;}
    if(idempotencyKey)headers['Idempotency-Key']=idempotencyKey;
    const basePath = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
    const response=await fetch(`${basePath}/api${path}`,{method,headers,credentials:'same-origin',body:method==='GET'?undefined:JSON.stringify(body??{}),signal:controller.signal});
    let data:any;try{data=await response.json();}catch{throw new ApiError(response.status,'INVALID_RESPONSE','Server belum dapat dihubungi. Coba lagi sebentar.');}
    if(!response.ok)throw new ApiError(response.status,data.error?.code??'REQUEST_FAILED',data.error?.message??data.message??'Permintaan belum berhasil.');
    if(Object.hasOwn(data,'csrfToken'))csrfToken=data.csrfToken;
    return data as T;
  }catch(error){if(error instanceof ApiError)throw error;throw new ApiError(0,'CONNECTION_ERROR','Koneksi ke server terputus. Periksa koneksi lalu coba kembali.');}
  finally{clearTimeout(timer);options.signal?.removeEventListener('abort',cancel);}
}

/** Send the original file bytes, not a JSON filename or a base64 copy. */
export function uploadFile<T>(path:string,file:File,contentType:string,options:{signal?:AbortSignal;onProgress?:(percentage:number)=>void}={}):Promise<T>{
  return new Promise((resolve,reject)=>{
    const request=new XMLHttpRequest();let settled=false;
    const cancel=()=>request.abort();
    const finish=(error?:ApiError,result?:T)=>{
      if(settled)return;settled=true;options.signal?.removeEventListener('abort',cancel);
      request.onload=request.onerror=request.ontimeout=request.onabort=null;request.upload.onprogress=null;
      if(error)reject(error);else{options.onProgress?.(100);resolve(result!);}
    };
    if(options.signal?.aborted){finish(new ApiError(0,'REQUEST_ABORTED','Unggahan dibatalkan.'));return;}
    const basePath = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
    request.open('POST',`${basePath}/api${path}`);
    request.withCredentials=true;request.timeout=120_000;
    request.setRequestHeader('Accept','application/json');
    request.setRequestHeader('Content-Type',contentType);
    if(csrfToken)request.setRequestHeader('X-CSRF-Token',csrfToken);
    request.upload.onprogress=event=>{if(event.lengthComputable)options.onProgress?.(Math.min(99,Math.round(event.loaded/event.total*100)));};
    request.onload=()=>{
      let data:any;try{data=JSON.parse(request.responseText);}catch{finish(new ApiError(request.status,'INVALID_RESPONSE','Server belum memberikan hasil unggahan. Muat ulang daftar media sebelum mencoba lagi.'));return;}
      if(request.status<200||request.status>=300){finish(new ApiError(request.status,data.error?.code??'UPLOAD_FAILED',data.error?.message??'Media belum berhasil diunggah.'));return;}
      finish(undefined,data);
    };
    request.onerror=()=>finish(new ApiError(0,'CONNECTION_ERROR','Koneksi unggahan terputus. Muat ulang daftar media sebelum mencoba lagi.'));
    request.ontimeout=()=>finish(new ApiError(0,'UPLOAD_TIMEOUT','Unggahan melewati batas dua menit. Muat ulang daftar media sebelum mencoba lagi.'));
    request.onabort=()=>finish(new ApiError(0,'REQUEST_ABORTED','Unggahan dibatalkan.'));
    options.signal?.addEventListener('abort',cancel,{once:true});
    try{request.send(file);}catch{finish(new ApiError(0,'UPLOAD_FAILED','Berkas belum dapat dikirim. Pilih berkas dan coba lagi.'));}
  });
}
export async function uploadMedia(kind:MediaKind,file:File,options:{signal?:AbortSignal;onProgress?:(percentage:number)=>void}={}):Promise<{asset:MediaAsset}>{
  const data=await uploadFile<{asset:MediaAsset}>('/admin/media/'+kind+'?name='+encodeURIComponent(file.name),file,kind==='garage_music'?'audio/mpeg':'image/jpeg',options);
  if(!data.asset)throw new ApiError(200,'INVALID_RESPONSE','Hasil unggahan tidak lengkap. Muat ulang daftar media.');
  return data;
}
export function rupiah(value:string|number|bigint|undefined){try{return 'Rp'+BigInt(value??0).toLocaleString('id-ID');}catch{return 'Rp0';}}
export function dateLabel(value:string){return new Date(value).toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'});}
export function lapTime(value:number|null|undefined){if(value==null||!Number.isFinite(value))return '—';return `${Math.floor(value/60000).toString().padStart(2,'0')}:${((value%60000)/1000).toFixed(2).padStart(5,'0')}`;}

export function requestKey(){return typeof crypto.randomUUID==='function'?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');}

export function resolveUrl(path?: string | null): string {
  if(!path) return '';
  if(/^https?:\/\//i.test(path)) return path;
  const basePath = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  return path.startsWith('/') ? `${basePath}${path}` : `${basePath}/${path}`;
}
