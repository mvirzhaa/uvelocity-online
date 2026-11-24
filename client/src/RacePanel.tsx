import {useEffect,useRef,useState} from 'react';
import type {Catalog,Profile,RoomInvite} from './api.js';
import {inspectRoomInvite,lapTime,rupiah} from './api.js';
import {Icon} from './icons.js';
import type {CarId,RoomConfig,RoomSnapshot,RaceResult,VehicleRestriction} from '../../shared/types.js';
import {CAR_NAMES} from '../../shared/catalog.js';
import './race-options.css';

export const CIRCUITS=[
 {id:'city',name:'Neon City',detail:'Boulevard, gedung kota, dan tikungan jalanan.',label:'CITY CIRCUIT',color:'#caaa70'},
 {id:'beach',name:'Azure Coast',detail:'Lintasan pesisir dengan laut dan palem.',label:'COASTAL CIRCUIT',color:'#50c9bb'},
 {id:'glacier',name:'Frostpeak Pass',detail:'Pegunungan bersalju dan danau es.',label:'ALPINE CIRCUIT',color:'#9ac6e8'},
 {id:'drag-2km',name:'Drag · 2 km',detail:'Lintasan lurus, satu perjalanan dari start ke finish.',label:'LINTASAN LURUS',color:'#64dce9'}
] as const;

export function raceFormat(config:RoomConfig){return config.circuit==='drag-2km'?'Drag · 2 km':`${config.laps} lap`;}
function restrictionName(restriction?:VehicleRestriction){return restriction?.categoryId?(restriction.categoryName||'Kategori ruang'):'Semua kendaraan';}

function RoomRules({config,restriction}:{config:RoomConfig;restriction?:VehicleRestriction}){
 return <div className="race-room-rules">
  <span className="pill room-category" aria-label="Kategori kendaraan ruang"><Icon name="car" size={13}/>{restrictionName(restriction)}</span>
  <p className="hint">{raceFormat(config)} · {config.bots} bot · maksimum {config.maxHumans} pemain</p>
  <p className="hint">Bot {config.difficulty==='easy'?'santai':config.difficulty==='hard'?'kompetitif':'normal'} · {config.collisionMode==='ghost'?'tanpa kontak':'tabrakan aktif'}</p>
 </div>;
}

type RaceCar={id:string;name:string;owned:boolean};
function eligibleCars(profile:Profile,catalog:Catalog|undefined,restriction?:VehicleRestriction,categoryId?:string|null):RaceCar[]{
 const cars=catalog?.cars??profile.appearances.map(appearance=>({id:appearance.carId,name:CAR_NAMES[appearance.carId],locked:true,categoryId:null}));
 // Existing rooms use their frozen membership, even after an admin changes the
 // live catalog's assignments, category name, or sale visibility.
 return cars.filter(car=>(profile.inventory.cars.includes(car.id)||car.locked===false)
  &&(restriction?restriction.allowedCarIds.includes(car.id as CarId):!categoryId||car.categoryId===categoryId))
  .map(car=>({id:car.id,name:car.name,owned:profile.inventory.cars.includes(car.id)}));
}

function RaceCarChoice({cars,value,disabled,onChange,onShowroom,invalidMessage}:{cars:RaceCar[];value:CarId;disabled:boolean;onChange:(id:CarId)=>void;onShowroom?:()=>void;invalidMessage:string}){
 const valid=cars.some(car=>car.id===value);
 return <div className="race-car-choice">
  <label>Kendaraan untuk balapan<select aria-label="Kendaraan untuk balapan" value={valid?value:''} disabled={disabled||!cars.length} onChange={event=>{if(event.target.value)onChange(event.target.value as CarId);}}>
   {!valid&&<option value="" disabled>{cars.length?'Pilih kendaraan yang sesuai':'Belum ada kendaraan yang dapat dipakai'}</option>}
   {cars.map(car=><option key={car.id} value={car.id}>{car.name}{car.owned?' · Milik Anda':' · Akses gratis'}</option>)}
  </select></label>
  {!valid&&<p className="hint race-car-warning" role="status">{cars.length?invalidMessage:'Anda belum memiliki kendaraan yang sesuai dan belum ada akses gratis untuk kategori ini.'}</p>}
  {!cars.length&&onShowroom&&<button className="secondary full" type="button" onClick={onShowroom}>Lihat kendaraan di showroom</button>}
  {cars.length>0&&<p className="hint">Memakai tampilan tersimpan untuk ruang ini. Mobil aktif di garasi tetap dapat dipilih secara terpisah.</p>}
 </div>;
}

interface Props {
 room:RoomSnapshot|null;profile:Profile;catalog?:Catalog;status:string;ping:number;busy:boolean;modelReady:boolean;
 pendingCarId?:CarId|null;
 onCreate:(config:RoomConfig,carId:CarId)=>void|Promise<boolean>;
 onJoin:(code:string,carId:CarId,invite:RoomInvite)=>void|Promise<boolean>;
 onInspectRoom?:(code:string)=>Promise<RoomInvite>;
 onPreviewCar?:(carId:CarId)=>void;
 onRoomCarChange?:(carId:CarId)=>void;
 onShowroom?:()=>void;
 onReady:(ready:boolean)=>void;onStart:()=>void;onLeave:()=>void;onNotice:(message:string,error?:boolean)=>void;
}

export function RacePanel(props:Props){
 const {room,profile,busy,catalog}=props;
 const [mode,setMode]=useState<'create'|'join'>('create'),[code,setCode]=useState('');
 const [config,setConfig]=useState<RoomConfig>({circuit:'city',laps:3,bots:3,maxHumans:4,difficulty:'normal',collisionMode:'solid',vehicleCategoryId:null});
 const [circuitLaps,setCircuitLaps]=useState(3),[choiceId,setChoiceId]=useState<CarId>(profile.loadout.carId);
 const [invite,setInvite]=useState<RoomInvite|null>(null),[checking,setChecking]=useState(false),[inviteError,setInviteError]=useState('');
 const lookupGeneration=useRef(0),preview=useRef(props.onPreviewCar);preview.current=props.onPreviewCar;
 useEffect(()=>()=>{lookupGeneration.current++;},[]);
 useEffect(()=>{if(!room)preview.current?.(choiceId);},[choiceId,room?.roomId]);
 const choose=(id:CarId)=>setChoiceId(id);
 const inspect=async()=>{
  if(code.length<4){setInviteError('Masukkan kode ruang minimal 4 karakter.');return;}
  const request=++lookupGeneration.current;setChecking(true);setInviteError('');setInvite(null);
  try{
   const found=await (props.onInspectRoom??inspectRoomInvite)(code);
   if(request!==lookupGeneration.current)return;
   setInvite(found);
   if(!found.joinable)setInviteError('Ruang ini sedang balapan atau sudah penuh. Minta kode ruang lain atau periksa kembali nanti.');
  }catch(error){if(request===lookupGeneration.current)setInviteError((error as Error).message);}
  finally{if(request===lookupGeneration.current)setChecking(false);}
 };

 if(room){
  const me=room.members.find(member=>member.userId===profile.user.id),circuit=CIRCUITS.find(item=>item.id===room.config.circuit);
  const cars=eligibleCars(profile,catalog,room.vehicleRestriction),current=props.pendingCarId??me?.loadout.carId??profile.loadout.carId;
  const valid=!!me&&cars.some(car=>car.id===me.loadout.carId);
  const allAllowed=!room.vehicleRestriction||room.members.every(member=>room.vehicleRestriction!.allowedCarIds.includes(member.loadout.carId));
  return <section className="panel room-panel">
   <div className="section-heading"><span className="eyebrow">RUANG BALAP</span><span className="connection"><i/>{props.status}{props.ping>0&&` · ${props.ping} ms`}</span></div>
   <h2>{circuit?.name??'Lintasan balapan'}</h2>
   <RoomRules config={room.config} restriction={room.vehicleRestriction}/>
   {room.vehicleRestriction?.categoryId&&<p className="hint">Daftar kendaraan kategori dikunci saat ruang dibuat. Perubahan kategori oleh admin berlaku untuk ruang baru.</p>}
   <div className="invite-code"><div><small>KODE UNDANGAN</small><strong>{room.inviteCode}</strong></div><button className="icon-button" aria-label="Salin kode undangan" onClick={()=>{if(!navigator.clipboard){props.onNotice('Kode ruang: '+room.inviteCode);return;}void navigator.clipboard.writeText(room.inviteCode).then(()=>props.onNotice('Kode ruang disalin.')).catch(()=>props.onNotice('Kode ruang: '+room.inviteCode));}}><Icon name="copy"/></button></div>
   <div className="room-members" role="region" aria-label="Daftar pemain di ruang" tabIndex={0}>{room.members.map(member=><div className="room-member" key={member.id}><span className="avatar small" style={{background:member.loadout.color}}>{member.name.slice(0,1).toUpperCase()}</span><div><b>{member.name}{member.userId===profile.user.id?' · Anda':''}</b><small>{CAR_NAMES[member.loadout.carId]}{member.host?' · Pembuat ruang':''}</small></div><span className={'pill '+((room.phase==='loading'?member.arenaReady:member.ready)?'success':'')}>{!member.connected?'Terputus':room.phase==='loading'?(member.arenaReady?'Arena siap':'Memuat arena'):member.ready?'Siap':'Menunggu'}</span></div>)}</div>
   {room.config.bots>0&&<p className="hint">{room.config.bots} pembalap bot akan masuk saat balapan dimulai.</p>}
   {room.phase==='lobby'&&<>
    <RaceCarChoice cars={cars} value={current} disabled={busy||!!props.pendingCarId||!props.onRoomCarChange} onChange={id=>props.onRoomCarChange?.(id)} onShowroom={props.onShowroom} invalidMessage="Kendaraan saat ini tidak memenuhi aturan ruang. Pilih kendaraan yang diizinkan sebelum menekan Siap."/>
    {props.pendingCarId&&<p className="hint" role="status">Menunggu konfirmasi kendaraan dari server…</p>}
    <button className={me?.ready?'secondary full':'primary full'} disabled={busy||!!props.pendingCarId||(!me?.ready&&(!props.modelReady||!valid))} onClick={()=>props.onReady(!me?.ready)}>{!props.modelReady?'Menyiapkan model 3D…':me?.ready?'Batalkan siap':'Saya siap balapan'}</button>
    {me?.host&&<button className="primary full start-room" disabled={busy||!!props.pendingCarId||!valid||!allAllowed||!room.members.length||room.members.some(member=>!member.ready||!member.connected)} onClick={props.onStart}>Mulai balapan</button>}
    <p className="hint">Semua pemain menekan Siap. Setelah host memulai, hitungan mundur menunggu arena selesai dimuat di seluruh perangkat.</p>
   </>}
   {room.phase==='loading'&&<div className="arena-loading-card" role="status" aria-live="polite"><div className="arena-loading-heading"><span className="spinner"/><div><b>{room.members.every(member=>member.arenaReady)?'Menyinkronkan garis start…':'Menunggu semua pemain masuk arena'}</b><span>{room.members.filter(member=>member.arenaReady).length} / {room.members.length} perangkat siap</span></div></div><div className="arena-ready-meter" role="progressbar" aria-label="Pemain yang selesai memuat arena" aria-valuemin={0} aria-valuemax={room.members.length} aria-valuenow={room.members.filter(member=>member.arenaReady).length}><span style={{width:(room.members.length?100*room.members.filter(member=>member.arenaReady).length/room.members.length:0)+'%'}}/></div><p>Mobil menunggu di grid. Hitungan 3–2–1 dimulai setelah arena dan seluruh kendaraan siap di setiap perangkat.</p><small>Jika pemuatan gagal atau pemain terputus, persiapan dibatalkan kembali ke lobi.</small><button className="secondary full" disabled={busy} onClick={()=>props.onReady(false)}>Batalkan persiapan</button></div>}
   {room.phase!=='lobby'&&room.phase!=='loading'&&<p className="hint">Balapan berjalan di server. Membuka menu tidak menjeda peserta lain.</p>}
   <button className="text-button danger" onClick={props.onLeave}>Keluar dari ruang</button>
  </section>;
 }

 const categories=catalog?.categories??[],categoryExists=!config.vehicleCategoryId||categories.some(category=>category.id===config.vehicleCategoryId);
 const creationCars=eligibleCars(profile,catalog,undefined,config.vehicleCategoryId),creationValid=categoryExists&&creationCars.some(car=>car.id===choiceId);
 const joinCars=invite?eligibleCars(profile,catalog,invite.vehicleRestriction):[],joinValid=!!invite?.joinable&&joinCars.some(car=>car.id===choiceId);
 return <section className="panel room-panel">
  <span className="eyebrow">TEMUKAN GARIS START</span><h2>Balapan bersama.</h2>
  <p className="muted">Kendaraan pilihan: <b>{catalog?.cars.find(car=>car.id===choiceId)?.name??CAR_NAMES[choiceId]}</b></p>
  <div className="segmented"><button className={mode==='create'?'active':''} onClick={()=>setMode('create')}>Buat ruang</button><button className={mode==='join'?'active':''} onClick={()=>setMode('join')}>Gabung teman</button></div>
  {mode==='join'?<form onSubmit={event=>{
   event.preventDefault();
   if(busy||checking)return;
   if(!invite){void inspect();return;}
   if(joinValid&&props.modelReady)void Promise.resolve(props.onJoin(code,choiceId,invite)).then(success=>{if(success===false)setInvite(null);});
  }}>
   <label>Kode ruang<input type="text" value={code} onChange={event=>{setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g,''));lookupGeneration.current++;setInvite(null);setChecking(false);setInviteError('');}} placeholder="KODE TEMAN" maxLength={12} minLength={4} autoComplete="off" required className="code-input" disabled={busy}/></label>
   {!invite&&<p className="hint">Periksa kode teman untuk melihat lintasan, kategori, dan kendaraan yang dapat dipakai sebelum bergabung.</p>}
   {invite&&<div className="invite-preview" aria-label="Aturan ruang undangan"><b>{CIRCUITS.find(circuit=>circuit.id===invite.config.circuit)?.name??'Lintasan balapan'}</b><RoomRules config={invite.config} restriction={invite.vehicleRestriction}/><p className="hint">{invite.humans} / {invite.config.maxHumans} pemain di ruang</p><button type="button" className="text-button" disabled={busy||checking} onClick={()=>void inspect()}>Periksa ulang ruang</button></div>}
   {inviteError&&<p className="form-error" role="alert">{inviteError}</p>}
   {invite?.joinable&&<RaceCarChoice cars={joinCars} value={choiceId} disabled={busy} onChange={choose} onShowroom={props.onShowroom} invalidMessage="Kendaraan pilihan Anda tidak termasuk kategori ruang ini. Pilih kendaraan yang diizinkan untuk bergabung."/>}
   <button className="primary full" disabled={busy||checking||code.length<4||!!invite&&(!joinValid||!props.modelReady)}>{busy?'Menghubungkan…':checking?'Memeriksa ruang…':!invite?'Periksa ruang':!props.modelReady?'Menyiapkan model 3D…':'Gabung ruang balapan'}</button>
  </form>:<form onSubmit={event=>{event.preventDefault();if(!busy&&props.modelReady&&creationValid)void props.onCreate({...config,laps:config.circuit==='drag-2km'?1:config.laps,vehicleCategoryId:config.vehicleCategoryId||null},choiceId);}}>
   <label>Lintasan</label><div className="circuit-list">{CIRCUITS.map(circuit=><button type="button" key={circuit.id} aria-pressed={config.circuit===circuit.id} className={'circuit-option '+(config.circuit===circuit.id?'selected':'')} onClick={()=>setConfig({...config,circuit:circuit.id,laps:circuit.id==='drag-2km'?1:circuitLaps})}><span className={'circuit-art '+circuit.id}><Icon name={circuit.id==='city'?'garage':circuit.id==='beach'?'flag':'bolt'} size={28}/></span><span><b>{circuit.name}</b><small>{circuit.label}</small></span>{config.circuit===circuit.id&&<Icon name="check" size={18}/>}</button>)}</div>
   <div className="field-grid">
    {config.circuit==='drag-2km'?<div className="race-distance" role="status"><small>FORMAT BALAPAN</small><strong>Drag · 2 km</strong><span>Satu perjalanan · start → finish</span></div>:<label>Jumlah lap<input aria-label="Jumlah lap" type="number" min={1} max={20} value={config.laps} onChange={event=>{const laps=Math.max(1,Math.min(20,Number(event.target.value)||1));setCircuitLaps(laps);setConfig({...config,laps});}}/></label>}
    <label>Slot pemain<input aria-label="Slot pemain" type="number" min={1} max={15} value={config.maxHumans} onChange={event=>{const maxHumans=Math.max(1,Math.min(15,Number(event.target.value)||1));setConfig({...config,maxHumans,bots:Math.min(config.bots,15-maxHumans)});}}/></label>
    <label>Lawan bot<input aria-label="Lawan bot" type="number" min={0} max={15-config.maxHumans} value={config.bots} onChange={event=>setConfig({...config,bots:Math.max(0,Math.min(15-config.maxHumans,Number(event.target.value)||0))})}/></label>
    <label>Kesulitan bot<select value={config.difficulty} onChange={event=>setConfig({...config,difficulty:event.target.value as RoomConfig['difficulty']})}><option value="easy">Santai</option><option value="normal">Normal</option><option value="hard">Kompetitif</option></select></label>
   </div>
   <label>Kontak antarmobil<select value={config.collisionMode} onChange={event=>setConfig({...config,collisionMode:event.target.value as RoomConfig['collisionMode']})}><option value="solid">Tabrakan aktif</option><option value="ghost">Tanpa kontak</option></select></label>
   <label>Kategori kendaraan ruang<select aria-label="Kategori kendaraan ruang" value={config.vehicleCategoryId||''} onChange={event=>setConfig({...config,vehicleCategoryId:event.target.value||null})}>
    <option value="">Semua kendaraan</option>{!categoryExists&&<option value={config.vehicleCategoryId!} disabled>Kategori sudah tidak tersedia</option>}{categories.map(category=><option key={category.id} value={category.id}>{category.name}</option>)}
   </select></label>
   {!categoryExists&&<p className="hint race-car-warning" role="status">Kategori ini sudah berubah. Pilih kategori lain sebelum membuat ruang.</p>}
   <RaceCarChoice cars={creationCars} value={choiceId} disabled={busy} onChange={choose} onShowroom={props.onShowroom} invalidMessage="Kendaraan pilihan Anda tidak termasuk kategori ini. Pilih kendaraan yang sesuai sebelum membuat ruang."/>
   <p className="hint">Maksimum 15 peserta total. Untuk 14 bot, atur slot pemain menjadi 1. Aturan kategori berlaku untuk seluruh pemain dan bot.</p>
   <button className="primary full" disabled={busy||!props.modelReady||!creationValid}>{busy?'Membuat ruang…':!props.modelReady?'Menyiapkan model 3D…':'Buat ruang balapan'}</button>
  </form>}
 </section>;
}

export function RaceResults({payload,onLeave,ownId}:{payload:{result:RaceResult;reward:any};onLeave:()=>void;ownId:string}){
 const own=payload.result.participants.find(participant=>participant.userId===ownId),drag=payload.result.config.circuit==='drag-2km';
 return <div className="modal-backdrop results-overlay"><section className="modal-card results-card"><div className="results-heading"><div><span className="eyebrow">HASIL RESMI UVELOCITY</span><h2>{own?.status==='finished'?(own.position===1?'Garis finish milik Anda.':`Finish di posisi ${own.position}.`):'Balapan selesai.'}</h2><p>{CIRCUITS.find(circuit=>circuit.id===payload.result.config.circuit)?.name}{!drag&&` · ${raceFormat(payload.result.config)}`}</p></div><button type="button" className="primary results-return" onClick={onLeave}>Kembali ke garasi</button></div><div className="result-metrics"><div><small>WAKTU BALAP</small><b>{lapTime(own?.totalTimeMs)}</b></div><div><small>{drag?'WAKTU FINISH':'LAP TERBAIK'}</small><b>{lapTime(drag?own?.totalTimeMs:own?.bestLapMs)}</b></div><div><small>HADIAH</small><b className="gold">{rupiah(payload.reward?.amount??0)}</b></div></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Pos.</th><th>Pembalap</th><th>Mobil</th><th>Waktu</th></tr></thead><tbody>{payload.result.participants.map(participant=><tr key={participant.id} className={participant.userId===ownId?'highlight-row':''}><td>{participant.status==='finished'?participant.position:'—'}</td><td>{participant.name}{participant.isBot&&<span className="subtle"> · BOT</span>}</td><td>{CAR_NAMES[participant.carId]}</td><td>{participant.status==='finished'?lapTime(participant.totalTimeMs):'DNF'}</td></tr>)}</tbody></table></div><p className="hint">Hadiah kredit game dicatat satu kali pada akun Anda.</p></section></div>;
}
