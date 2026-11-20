import {useCallback,useEffect,useId,useRef,useState} from 'react';
import {api,ApiError} from './api.js';
import type {PrayerCity,PrayerLocationInput,PrayerStatus} from '../../shared/prayer.js';
import type {RacePhase,RoomMember,RoomPrayerPause as RoomPrayerState} from '../../shared/types.js';
import './prayer.css';

const mono=()=>typeof performance!=='undefined'?performance.now():Date.now();
const timeValue=(value:string|number|null|undefined)=>typeof value==='number'?value:Date.parse(value??'');
const abortError=()=>Object.assign(new Error('Permintaan dibatalkan.'),{name:'AbortError'});
const message=(error:unknown)=>error instanceof Error?error.message:'Permintaan belum berhasil. Coba lagi sebentar.';
export const prayerCountdown=(endsAt:number,now:number)=>{const seconds=Number.isFinite(endsAt-now)?Math.max(0,Math.ceil((endsAt-now)/1000)):0;return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;};
function localClock(value:string|number|null|undefined,timezone='Asia/Jakarta'){
 const date=new Date(timeValue(value));if(!Number.isFinite(date.getTime()))return '—';
 try{return new Intl.DateTimeFormat('id-ID',{hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:timezone}).format(date);}catch{return new Intl.DateTimeFormat('id-ID',{hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:'Asia/Jakarta'}).format(date);}
}
function zoneLabel(zone:string){return ({'Asia/Jakarta':'WIB','Asia/Pontianak':'WIB','Asia/Makassar':'WITA','Asia/Jayapura':'WIT'} as Record<string,string>)[zone]||zone;}
function useClock(serverTime:number,getServerNow?:()=>number){
 const anchor=useRef({server:serverTime,mono:mono()}),[,tick]=useState(0);
 if(anchor.current.server!==serverTime)anchor.current={server:serverTime,mono:mono()};
 useEffect(()=>{const timer=setInterval(()=>tick(value=>value+1),1000);return()=>clearInterval(timer);},[]);
 return getServerNow?getServerNow():anchor.current.server+Math.max(0,mono()-anchor.current.mono);
}

/** Personal status only. Room pause/ready state remains authoritative in snapshots. */
export function usePrayerStatus(userId:string|null|undefined){
 const uid=userId??null,user=useRef(uid);user.current=uid;
 const epoch=useRef(0),statusRef=useRef<PrayerStatus|null>(null),read=useRef<AbortController|null>(null),write=useRef<AbortController|null>(null),readPromise=useRef<Promise<PrayerStatus|null>|null>(null),mutating=useRef(false),unauth=useRef(false);
 const anchor=useRef({server:Date.now(),mono:mono()});
 const [stored,setStored]=useState<{userId:string|null;status:PrayerStatus|null}>({userId:null,status:null}),[loading,setLoading]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(''),[unauthorized,setUnauthorized]=useState(false);
 const getServerNow=useCallback(()=>anchor.current.server+Math.max(0,mono()-anchor.current.mono),[]);
 const accept=useCallback((value:PrayerStatus,owner:string,generation:number,started:number)=>{
  if(user.current!==owner||epoch.current!==generation)return false;
  const server=timeValue(value.serverNow);if(!Number.isFinite(server))throw new Error('Waktu jadwal belum valid. Coba muat ulang jadwal.');
  const received=mono();anchor.current={server:server+Math.min(500,Math.max(0,received-started)/2),mono:received};statusRef.current=value;setStored({userId:owner,status:value});setError('');return true;
 },[]);
 const markUnauthorized=useCallback(()=>{unauth.current=true;read.current?.abort();write.current?.abort();statusRef.current=null;setStored({userId:user.current,status:null});setUnauthorized(true);setError('Sesi akun berakhir. Silakan masuk kembali.');},[]);
 const refresh=useCallback(async():Promise<PrayerStatus|null>=>{
  const owner=uid,generation=epoch.current;if(!owner||user.current!==owner||unauth.current)return null;
  if(mutating.current)return statusRef.current;if(readPromise.current)return readPromise.current;
  const controller=new AbortController();read.current=controller;const started=mono();if(!statusRef.current)setLoading(true);
  const pending=(async()=>{
   try{const value=await api<PrayerStatus>('/prayer/status','GET',undefined,undefined,{signal:controller.signal});if(controller.signal.aborted||!accept(value,owner,generation,started))return null;return value;}
   catch(reason){if(!controller.signal.aborted&&epoch.current===generation&&user.current===owner){if(reason instanceof ApiError&&reason.status===401)markUnauthorized();else setError(message(reason));}return null;}
   finally{if(read.current===controller){read.current=null;readPromise.current=null;}if(epoch.current===generation&&user.current===owner)setLoading(false);}
  })();readPromise.current=pending;return pending;
 },[uid,accept,markUnauthorized]);
 const setLocation=useCallback(async(input:PrayerLocationInput):Promise<PrayerStatus>=>{
  const owner=uid,generation=epoch.current;if(!owner||user.current!==owner||unauth.current)throw new Error('Masuk ke akun untuk menyimpan lokasi.');
  read.current?.abort();read.current=null;readPromise.current=null;write.current?.abort();
  const controller=new AbortController();write.current=controller;mutating.current=true;setSaving(true);setError('');const started=mono();
  const body:PrayerLocationInput=input.mode==='fallback'?{mode:'fallback'}:input.mode==='manual'&&input.cityId?{mode:'manual',cityId:input.cityId}:{mode:input.mode,latitude:Number(Number(input.latitude).toFixed(2)),longitude:Number(Number(input.longitude).toFixed(2))};
  try{const value=await api<PrayerStatus>('/prayer/location','PUT',body,undefined,{signal:controller.signal});if(controller.signal.aborted||!accept(value,owner,generation,started))throw abortError();return value;}
  catch(reason){if(!controller.signal.aborted&&epoch.current===generation&&user.current===owner){if(reason instanceof ApiError&&reason.status===401)markUnauthorized();else setError(message(reason));}throw reason;}
  finally{if(write.current===controller){write.current=null;mutating.current=false;}if(epoch.current===generation&&user.current===owner)setSaving(false);}
 },[uid,accept,markUnauthorized]);
 useEffect(()=>{
  const generation=++epoch.current;read.current?.abort();write.current?.abort();read.current=write.current=null;readPromise.current=null;mutating.current=false;unauth.current=false;statusRef.current=null;
  setStored({userId:uid,status:null});setError('');setUnauthorized(false);setSaving(false);setLoading(!!uid);
  if(!uid)return;
  void refresh();const timer=setInterval(()=>{if(!document.hidden)void refresh();},30000);
  const wake=()=>{if(!document.hidden)void refresh();};document.addEventListener('visibilitychange',wake);window.addEventListener('online',wake);
  return()=>{if(epoch.current===generation)epoch.current++;clearInterval(timer);read.current?.abort();write.current?.abort();document.removeEventListener('visibilitychange',wake);window.removeEventListener('online',wake);};
 },[uid,refresh]);
 const status=stored.userId===uid?stored.status:null;
 useEffect(()=>{
  if(!status||!uid||unauthorized)return;
  const boundary=timeValue(status.paused?status.pauseEndsAt:status.nextPrayer.startedAt);if(!Number.isFinite(boundary))return;
  let timer:ReturnType<typeof setTimeout>,cancelled=false;
  const check=()=>{void refresh().then(value=>{if(!cancelled&&!value)timer=setTimeout(check,5000);});};
  const until=boundary-getServerNow();timer=setTimeout(check,until>0?Math.min(2147483000,Math.max(20,until+80)):1000);
  return()=>{cancelled=true;clearTimeout(timer);};
 },[status,uid,unauthorized,refresh,getServerNow]);
 return {status,loading:!!uid&&loading,saving,error,unauthorized,refresh,setLocation,getServerNow};
}

function MoonMark({small=false}:{small?:boolean}){return <svg className={small?'prayer-symbol small':'prayer-symbol'} viewBox="0 0 132 132" aria-hidden="true"><circle cx="66" cy="66" r="60" fill="none" stroke="currentColor" strokeOpacity=".22"/><circle cx="66" cy="66" r="48" fill="none" stroke="currentColor" strokeOpacity=".14" strokeDasharray="2 8"/><path d="M81 29a38 38 0 1 0 22 52A33 33 0 0 1 81 29Z" fill="currentColor"/><path d="m93 25 2 7 7 2-7 2-2 7-2-7-7-2 7-2Z" fill="currentColor"/><path d="m108 48 1.4 4.4L114 54l-4.6 1.5L108 60l-1.4-4.5L102 54l4.6-1.6Z" fill="currentColor"/></svg>;}
function ClockMark(){return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2" strokeLinecap="round"/></svg>;}
function LocationMark(){return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>;}
function usePauseFocus(){
 const panel=useRef<HTMLElement>(null),heading=useRef<HTMLHeadingElement>(null);
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;heading.current?.focus({preventScroll:true});const trap=(event:KeyboardEvent)=>{if(event.key!=='Tab'||!panel.current)return;const items=Array.from(panel.current.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],select:not([disabled]),input:not([disabled]),[tabindex="0"]')).filter(node=>!node.closest('[hidden]'));if(!items.length){event.preventDefault();heading.current?.focus();return;}const first=items[0],last=items[items.length-1];if(event.shiftKey&&(document.activeElement===first||document.activeElement===heading.current)){event.preventDefault();last.focus();}else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===heading.current)){event.preventDefault();first.focus();}};document.addEventListener('keydown',trap);return()=>{document.removeEventListener('keydown',trap);if(previous?.isConnected&&!previous.closest('[inert]'))previous.focus();};},[]);
 return {panel,heading};
}
function DailyTimes({status}:{status:PrayerStatus}){return <div className="prayer-times" aria-label="Lima waktu salat hari ini">{status.dailyTimes.map(item=><div key={item.eventId} className={status.currentPrayer?.eventId===item.eventId?'current':''}><span>{item.name}</span><time dateTime={item.startedAt}>{localClock(item.startedAt,status.location.timezone)}</time>{status.currentPrayer?.eventId===item.eventId&&<small>Sedang berjeda</small>}</div>)}</div>;}
let cityCache:PrayerCity[]|null=null;
export interface PrayerLocationSettingsProps {status:PrayerStatus|null;onLocationChange:(input:PrayerLocationInput)=>Promise<PrayerStatus>;loading?:boolean;error?:string;compact?:boolean;}
export function PrayerLocationSettings({status,onLocationChange,loading=false,error='',compact=false}:PrayerLocationSettingsProps){
 const [cities,setCities]=useState<PrayerCity[]>(cityCache??[]),[city,setCity]=useState(status?.location.cityId??'jakarta'),[busy,setBusy]=useState(false),[localError,setLocalError]=useState(''),[notice,setNotice]=useState('');
 const mounted=useRef(true),action=useRef(0),id=useId();
 useEffect(()=>{mounted.current=true;const controller=new AbortController();if(!cityCache)void api<{locations:PrayerCity[]}>('/prayer/locations','GET',undefined,undefined,{signal:controller.signal}).then(data=>{if(!controller.signal.aborted&&mounted.current){cityCache=data.locations;setCities(data.locations);}}).catch(reason=>{if(!controller.signal.aborted&&mounted.current)setLocalError(message(reason));});return()=>{mounted.current=false;action.current++;controller.abort();};},[]);
 useEffect(()=>{if(status?.location.cityId)setCity(status.location.cityId);},[status?.location.cityId]);
 async function save(input:PrayerLocationInput,success:string,token:number){const updated=await onLocationChange(input);if(mounted.current&&action.current===token){setNotice(success);setLocalError('');}return updated;}
 async function manual(){const token=++action.current;setBusy(true);setNotice('');setLocalError('');try{await save({mode:'manual',cityId:city},'Lokasi dan jadwal berhasil diperbarui.',token);}catch(reason){if(mounted.current&&action.current===token)setLocalError(message(reason));}finally{if(mounted.current&&action.current===token)setBusy(false);}}
 async function gps(){
  const token=++action.current;setBusy(true);setNotice('');setLocalError('');
  let coordinates:GeolocationCoordinates;
  try{if(!navigator.geolocation)throw new Error('GPS tidak tersedia');coordinates=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(position=>resolve(position.coords),reject,{enableHighAccuracy:false,maximumAge:300000,timeout:10000}));if(!Number.isFinite(coordinates.latitude)||!Number.isFinite(coordinates.longitude))throw new Error('Koordinat GPS belum valid');}
  catch{if(!mounted.current||action.current!==token)return;try{await save({mode:'fallback'},'GPS tidak tersedia atau izinnya ditolak. Jakarta disimpan sebagai lokasi sementara; Anda dapat memilih kota di bawah.',token);}catch(reason){if(mounted.current&&action.current===token)setLocalError(message(reason));}finally{if(mounted.current&&action.current===token)setBusy(false);}return;}
  if(!mounted.current||action.current!==token)return;
  try{await save({mode:'gps',latitude:Number(coordinates.latitude.toFixed(2)),longitude:Number(coordinates.longitude.toFixed(2))},'Lokasi GPS tersimpan. Zona waktu ditentukan oleh server.',token);}catch(reason){if(mounted.current&&action.current===token)setLocalError(message(reason));}finally{if(mounted.current&&action.current===token)setBusy(false);}
 }
 const source=status?.location.mode==='gps'?'GPS':status?.location.mode==='manual'?'Kota manual':'Jakarta · lokasi cadangan';
 return <section className={'prayer-location-settings '+(compact?'compact':'')} aria-labelledby={'prayer-location-'+id}>
  <div className="prayer-location-heading"><div className="prayer-location-icon"><LocationMark/></div><div><span className="eyebrow">JADWAL PRIBADI</span><h3 id={'prayer-location-'+id}>Lokasi waktu salat</h3></div></div>
  <div className="prayer-location-current"><b>{status?.location.label??'Menyiapkan lokasi…'}</b><span>{status?source+' · '+zoneLabel(status.location.timezone):'Jadwal dimuat dari akun Anda'}</span>{status&&<small>{status.location.timezone}</small>}</div>
  {status?.location.fallbackReason&&<p className="prayer-location-notice" role="status">{status.location.fallbackReason}</p>}
  <p>Gunakan lokasi Anda sekali, atau pilih kota. Izin GPS hanya diminta saat tombol ditekan. Koordinat dibulatkan dua desimal dan disimpan untuk akun Anda; tidak dibagikan ke pemain lain.</p>
  <button className="secondary prayer-gps" type="button" disabled={busy||loading} onClick={()=>void gps()}><LocationMark/>{busy?'Menyimpan lokasi…':'Gunakan GPS'}</button>
  <div className="prayer-city-form"><label htmlFor={'prayer-city-'+id}>Pilih kota secara manual</label><div><select id={'prayer-city-'+id} value={city} disabled={busy||!cities.length} onChange={event=>setCity(event.target.value)}>{!cities.length&&<option value="jakarta">Memuat daftar kota…</option>}{cities.map(item=><option key={item.id} value={item.id}>{item.name} · {item.province} ({zoneLabel(item.timezone)})</option>)}</select><button className="primary" type="button" disabled={busy||loading||!cities.length} onClick={()=>void manual()}>Simpan kota</button></div></div>
  {(localError||error)&&<p className="form-error" role="alert">{localError||error}</p>}{notice&&<p className="prayer-location-notice" role="status">{notice}</p>}
  {status&&<><DailyTimes status={status}/><div className="prayer-source"><ClockMark/><span><b>Perhitungan lokasi</b><small>{status.calculation.label}. Jadwal ini bukan data resmi Kemenag.</small></span></div></>}
  <p className="hint">Jika GPS gagal, Jakarta menjadi lokasi cadangan. Mengubah lokasi tidak mempersingkat jeda yang sedang berlangsung.</p>
 </section>;
}

export interface PrayerPauseProps {status:PrayerStatus;getServerNow?:()=>number;onRefresh:()=>unknown|Promise<unknown>;onLocationChange:(input:PrayerLocationInput)=>Promise<PrayerStatus>;error?:string;}
export function PrayerPause({status,getServerNow,onRefresh,onLocationChange,error=''}:PrayerPauseProps){
 const now=useClock(timeValue(status.serverNow),getServerNow),end=timeValue(status.pauseEndsAt??status.currentPrayer?.resumesAt),remaining=Math.max(0,end-now),[editing,setEditing]=useState(false),[checking,setChecking]=useState(false),{panel,heading}=usePauseFocus();
 const titleId=useId();async function check(){setChecking(true);try{await onRefresh();}finally{setChecking(false);}}
 return <section className="prayer-pause-layer" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={panel}>
  <header className="prayer-pause-brand"><span>U<span>Velocity</span></span><span>WAKTU JEDA</span></header>
  <div className="prayer-pause-card"><MoonMark/><span className="eyebrow">SEJENAK UNTUK YANG UTAMA</span><h1 id={titleId} tabIndex={-1} ref={heading}>Waktunya salat{status.currentPrayer?' '+status.currentPrayer.name:''}.</h1><p className="prayer-intro">Permainan dijeda selama 15 menit sesuai perhitungan lokasi akun Anda. Akses kembali menunggu konfirmasi server.</p>
   <div className="prayer-place"><LocationMark/><span>{status.location.label}<small>{zoneLabel(status.location.timezone)} · {status.location.timezone}</small></span></div>
   {status.location.fallbackReason&&<p className="prayer-location-notice" role="status">{status.location.fallbackReason}</p>}
   <div className="prayer-timer" role="timer" aria-live="off" aria-label={'Sisa jeda '+prayerCountdown(end,now)}>{prayerCountdown(end,now)}</div><p className="prayer-timer-label" role="status">{remaining>0?'Waktu tersisa untuk jeda':'Jeda sedang diverifikasi oleh server…'}</p>
   <div className="prayer-time-detail"><div><span>Mulai jeda</span><b>{localClock(status.currentPrayer?.startedAt,status.location.timezone)} <small>{zoneLabel(status.location.timezone)}</small></b></div><div><span>Pemeriksaan akses kembali</span><b>{localClock(status.pauseEndsAt,status.location.timezone)} <small>{zoneLabel(status.location.timezone)}</small></b></div></div>
   <DailyTimes status={status}/><p className="prayer-calculation">Perhitungan lokasi · {status.calculation.label}<br/>Bukan data resmi Kemenag.</p>
   {error&&<p className="form-error" role="alert">{error}</p>}
   <div className="prayer-footer-actions"><button className="text-button" onClick={()=>setEditing(value=>!value)} aria-expanded={editing} type="button">{editing?'Tutup pengaturan lokasi':'Periksa lokasi saya'}</button><button className="secondary" disabled={checking} onClick={()=>void check()} type="button">{checking?'Memeriksa…':'Periksa status'}</button></div>
   {editing&&<PrayerLocationSettings status={status} onLocationChange={onLocationChange} compact/>}
  </div><footer className="prayer-pause-footer">Jadwal pribadi. Lokasi Anda tidak ditampilkan kepada pemain lain.</footer>
 </section>;
}

export interface RoomPrayerPauseProps {roomPause:RoomPrayerState;ownId:string;onReady:()=>unknown|Promise<unknown>;onLeave:()=>unknown|Promise<unknown>;serverTime:number;phase:RacePhase;members?:Pick<RoomMember,'id'|'name'|'connected'>[];timeZone?:string;transportError?:string;connectionStatus?:string;}
export function RoomPrayerPause({roomPause,ownId,onReady,onLeave,serverTime,phase,members=[],timeZone='Asia/Jakarta',transportError='',connectionStatus=''}:RoomPrayerPauseProps){
 const now=useClock(serverTime),{panel,heading}=usePauseFocus(),titleId=useId(),[pending,setPending]=useState(false),[error,setError]=useState('');
 const token=useRef(roomPause.pauseToken),alive=useRef(true),ackTimer=useRef<ReturnType<typeof setTimeout>|null>(null);token.current=roomPause.pauseToken;
 const ownReady=roomPause.readyIds.includes(ownId),required=roomPause.requiredIds.includes(ownId),eligible=serverTime>=roomPause.resumeEligibleAt,resuming=phase==='resume_countdown',end=resuming?(roomPause.resumeAt??roomPause.resumeEligibleAt):roomPause.resumeEligibleAt;
 const acknowledged=useRef(ownReady);acknowledged.current=ownReady;
 const readyCount=roomPause.requiredIds.filter(id=>roomPause.readyIds.includes(id)).length;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;if(ackTimer.current)clearTimeout(ackTimer.current);};},[]);
 useEffect(()=>{setPending(false);setError('');if(ackTimer.current)clearTimeout(ackTimer.current);},[roomPause.pauseToken,ownId]);
 useEffect(()=>{if(ownReady){setPending(false);setError('');if(ackTimer.current)clearTimeout(ackTimer.current);}},[ownReady]);
 async function confirmReady(){
  if(!eligible||ownReady||pending||resuming||!required)return;
  const current=roomPause.pauseToken;setPending(true);setError('');
  try{await onReady();if(!alive.current||token.current!==current||acknowledged.current)return;ackTimer.current=setTimeout(()=>{if(alive.current&&token.current===current&&!acknowledged.current){setPending(false);setError('Konfirmasi belum diterima. Periksa koneksi, lalu coba lagi.');}},8000);}
  catch(reason){if(alive.current&&token.current===current){setPending(false);setError(message(reason));}}
 }
 async function leave(){try{await onLeave();}catch(reason){if(alive.current)setError(message(reason));}}
 const previousRace=['racing','countdown'].includes(roomPause.previousPhase),prayers=[...new Set(roomPause.triggers.map(item=>item.name))];
 return <section className="prayer-pause-layer room-prayer-layer" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={panel}>
  <header className="prayer-pause-brand"><span>U<span>Velocity</span></span><span>JEDA BERSAMA</span></header>
  <div className="prayer-pause-card room-prayer-card"><MoonMark small/><span className="eyebrow">SELURUH ROOM BERHENTI BERSAMA</span><h1 id={titleId} tabIndex={-1} ref={heading}>{resuming?'Kembali ke lintasan.':'Jeda salat bersama.'}</h1>
   <p className="prayer-intro">{resuming?'Semua peserta sudah mengonfirmasi. Balapan dilanjutkan bersama setelah hitung mundur server.':`${prayers.length?prayers.join(' / '):'Waktu salat'} telah tiba untuk peserta room ini. Pemain dan AI dijeda selama minimal 15 menit.`}</p>
   {!resuming&&<div className="prayer-trigger-list" aria-label="Peserta yang memasuki waktu salat">{roomPause.triggers.map(item=><span key={item.eventId+'|'+item.userId}><b>{item.displayName}</b><i>·</i>{item.name}</span>)}</div>}
   <div className={'prayer-timer '+(resuming?'resume':'')} role="timer" aria-live="off" aria-label={resuming?'Hitung mundur melanjutkan':'Sisa jeda bersama'}>{resuming?Math.max(0,Math.ceil((end-now)/1000)):prayerCountdown(end,now)}</div>
   <p className="prayer-timer-label" role="status">{resuming?(now>=end?'Menunggu aba-aba server…':'Mulai bersama'):!eligible?(now>=end?'Memastikan waktu pada server…':'Sisa jeda minimum'):'Jeda minimum selesai. Setiap peserta perlu memilih siap.'}</p>
   <div className="prayer-time-detail"><div><span>Mulai jeda</span><b>{localClock(roomPause.startedAt,timeZone)} <small>{zoneLabel(timeZone)}</small></b></div><div><span>Siap melanjutkan setelah</span><b>{localClock(roomPause.resumeEligibleAt,timeZone)} <small>{zoneLabel(timeZone)}</small></b></div></div>
   <div className="prayer-readiness"><div><b>{readyCount} / {roomPause.requiredIds.length} peserta siap</b><span>{ownReady?'Konfirmasi Anda diterima':pending?'Mengirim konfirmasi Anda…':'Menunggu konfirmasi peserta'}</span></div><div className="prayer-ready-track" role="progressbar" aria-label="Peserta siap melanjutkan" aria-valuemin={0} aria-valuemax={roomPause.requiredIds.length} aria-valuenow={readyCount}><span style={{width:(roomPause.requiredIds.length?readyCount/roomPause.requiredIds.length*100:0)+'%'}}/></div>
    <ul className="prayer-participant-list">{roomPause.requiredIds.map(id=>{const member=members.find(person=>person.id===id),ready=roomPause.readyIds.includes(id);return <li key={id} className={ready?'ready':''}><span className="prayer-ready-dot">{ready?'✓':'•'}</span><b>{id===ownId?'Anda':member?.name??'Peserta'}</b><span>{ready?'Siap':member?.connected===false?'Koneksi terputus':eligible?'Belum konfirmasi':'Berjeda'}</span></li>;})}</ul>
   </div>
   <p className="prayer-retained">{previousRace?'Posisi, lap, dan waktu balapan tetap tersimpan. Pemain dan AI melanjutkan dari keadaan yang sama.':'Room tetap tersedia. Persiapan lintasan dilakukan setelah semua peserta siap.'}</p>
   {(error||transportError)&&<p className="form-error" role="alert">{error||transportError}</p>}
   {connectionStatus&&<p className="prayer-connection-status" role="status">Koneksi room: {connectionStatus}</p>}
   <div className="prayer-room-actions"><button type="button" className="primary" onClick={()=>void confirmReady()} disabled={!eligible||ownReady||pending||resuming||!required} aria-busy={pending}>{resuming?'Mulai bersama…':ownReady?'Anda sudah siap':pending?'Menunggu konfirmasi…':!required?'Menunggu peserta room':'Siap melanjutkan'}</button><button type="button" className="text-button" onClick={()=>void leave()}>Keluar room</button></div>
   <p className="hint">Hitung mundur dimulai setelah semua peserta yang masih diperlukan mengonfirmasi. Waktu salat baru dapat memperpanjang jeda; konfirmasi sebelumnya akan direset.</p>
  </div><footer className="prayer-pause-footer">Perhitungan lokasi pribadi. Koordinat dan lokasi peserta tidak dibagikan ke room.</footer>
 </section>;
}
