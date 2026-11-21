import {useEffect,useRef,useState} from 'react';
import type {MediaAsset} from '../../shared/media.js';
import type {RoomSnapshot} from '../../shared/types.js';
import {resolveUrl} from './api.js';

const BASE_URL = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');

/** Presentation only: the server's arena barrier decides when this screen ends. */
export function RaceLoading({room,image,pending,busy,connectionStatus,error,onCancel,onLeave}:{room:RoomSnapshot;image:MediaAsset|null;pending:boolean;busy:boolean;connectionStatus:string;error?:string;onCancel:()=>void;onLeave:()=>void}){
  const title=useRef<HTMLHeadingElement>(null),dialog=useRef<HTMLElement>(null);
  const [imageFailed,setImageFailed]=useState(false),[,tick]=useState(0);
  const serverClock=useRef({time:room.serverTime,received:Date.now()});
  if(serverClock.current.time!==room.serverTime)serverClock.current={time:room.serverTime,received:Date.now()};
  useEffect(()=>{setImageFailed(false);},[image?.id]);
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;title.current?.focus();
    const timer=setInterval(()=>tick(value=>value+1),1000);
    const trap=(event:KeyboardEvent)=>{
      if(event.key!=='Tab')return;
      const nodes=Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])')??[]);
      const first=nodes[0],last=nodes[nodes.length-1];
      if(!first){event.preventDefault();title.current?.focus();return;}
      const current=document.activeElement;
      if(event.shiftKey&&(current===first||current===title.current)){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&(current===last||current===title.current||!dialog.current?.contains(current))){event.preventDefault();first.focus();}
    };
    document.addEventListener('keydown',trap,true);
    return()=>{clearInterval(timer);document.removeEventListener('keydown',trap,true);if(previous?.isConnected&&!previous.closest('[inert]'))previous.focus();};
  },[]);
  const ready=pending?0:room.members.filter(member=>member.arenaReady&&member.connected).length;
  const total=room.members.length;
  const remaining=room.loadingDeadline==null||pending?null:Math.max(0,Math.ceil((room.loadingDeadline-(serverClock.current.time+Date.now()-serverClock.current.received))/1000));
  const reconnecting=/kembali|terputus/i.test(connectionStatus)&&!/tersambung kembali/i.test(connectionStatus);
  return <section ref={dialog} className="race-loading-screen" role="dialog" aria-modal="true" aria-labelledby="race-loading-title" aria-describedby="race-loading-description" data-start-token={room.startToken??'pending'}>
    {image&&!imageFailed&&<img className="race-loading-art" src={resolveUrl(image.url)} alt="" onError={()=>setImageFailed(true)}/>}
    <div className="race-loading-shade"/>
    <header className="race-loading-brand"><img src={`${BASE_URL}/branding/uvelocity-logo.png`} alt="UVelocity"/><span>RUANG {room.inviteCode}</span></header>
    <div className="race-loading-content">
      <span className="eyebrow">SEMUA PEMBALAP. SATU GARIS START.</span>
      <h1 id="race-loading-title" ref={title} tabIndex={-1}>{reconnecting?'Memulihkan sambungan.':pending?'Menyiapkan garis start.':ready===total?'Menyinkronkan pembalap.':'Masuk arena bersama.'}</h1>
      <p id="race-loading-description">{pending?'Mengirim permintaan mulai ke ruang balapan.':'Hitungan 3–2–1 dimulai setelah arena dan seluruh kendaraan selesai dimuat di setiap perangkat.'}</p>
      <div className="race-loading-progress-label" role="status"><span><i className="spinner"/>{pending?'Menunggu konfirmasi server':`${ready} / ${total} perangkat siap`}</span><small>{remaining===null?connectionStatus:remaining>0?`Batas persiapan ${remaining} dtk`:'Menunggu pembatalan dari server…'}</small></div>
      <div className="race-loading-progress" role="progressbar" aria-label="Perangkat yang selesai memuat arena" aria-valuemin={0} aria-valuemax={total||1} aria-valuenow={ready}><span style={{width:(total?ready/total*100:0)+'%'}}/></div>
      <ul className="race-loading-members" aria-label="Kesiapan arena pemain">{room.members.map(member=><li key={member.id} className={member.arenaReady&&member.connected&&!pending?'is-ready':''}><span>{member.name}</span><small>{!member.connected?'Terputus':member.arenaReady&&!pending?'Arena siap':'Memuat arena'}</small></li>)}</ul>
      {error&&<p className="race-loading-error" role="alert">{error}</p>}
      {imageFailed&&<p className="race-loading-note">Latar belum dapat dimuat. Persiapan arena tetap berjalan.</p>}
      <div className="race-loading-actions"><button className="secondary" disabled={busy} onClick={onCancel}>{busy?'Memproses…':'Batalkan persiapan'}</button><button className="text-button" disabled={busy} onClick={onLeave}>Keluar ruang</button></div>
      <p className="race-loading-note">Tetap buka halaman ini selama pemuatan. Jika arena gagal dimuat, persiapan dibatalkan ke lobi. Jeda salat berlaku untuk seluruh ruang.</p>
    </div>
  </section>;
}
