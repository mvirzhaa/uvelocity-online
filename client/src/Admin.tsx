import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { api, rupiah, dateLabel } from './api.js';
import type { Catalog } from './api.js';
import { Icon } from './icons.js';

type AdminUser={id:string;userId:string;email:string;displayName:string;avatarId:string;role:string;status:string;balance:string;walletVersion:string;createdAt:string};
type AuditEntry={id:string;actorId:string|null;actorName:string|null;action:string;targetId:string;reason:string;before:unknown;after:unknown;createdAt:string};
type RewardPolicy={version?:number;finish:string;perLap:string;podium:string[];minimumDurationMs:number;maximum:string};
type Tuning={version:string;bounds:Record<'topSpeed'|'zeroTo100'|'handling',{min:number;max:number}>;cars:Array<{carId:string;topSpeed:number;zeroTo100:number;handling:number}>;rewardPolicy:RewardPolicy;physics:unknown};
type GrantReview={user:AdminUser;amount:string;reference:string;reason:string;key:string};
type Tab='accounts'|'tuning'|'offers'|'rewards'|'audit';
const control:CSSProperties={fontSize:14};
const actions:CSSProperties={display:'flex',flexWrap:'wrap',alignItems:'center',gap:10};
const sections:CSSProperties={display:'grid',gap:20};
const actionNames:Record<string,string>={'admin.created':'Admin dibuat','wallet.topup':'Kredit ditambahkan','catalog.updated':'Penawaran diubah','ruleset.published':'Aturan diterbitkan'};
const tabs:Array<{id:Tab;label:string;icon:string}>=[{id:'accounts',label:'Pemain & kredit',icon:'user'},{id:'tuning',label:'Performa mobil',icon:'settings'},{id:'offers',label:'Harga & toko',icon:'wallet'},{id:'rewards',label:'Hadiah balapan',icon:'trophy'},{id:'audit',label:'Riwayat admin',icon:'shield'}];
function message(error:unknown):string{return error instanceof Error?error.message:'Permintaan belum berhasil. Coba lagi.';}
function nonce(prefix:string):string {
  const random=typeof crypto.randomUUID==='function'?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
  return prefix+'-'+random;
}
function validMoney(value:string,max:bigint,allowZero=true):boolean{return /^(0|[1-9][0-9]{0,15})$/.test(value)&&BigInt(value)<=max&&(allowZero||BigInt(value)>0n);}

export function Admin({catalog,onChange,onNotice}:{catalog:Catalog;onChange:()=>Promise<void>;onNotice:(message:string,error?:boolean)=>void}) {
  const callbacks=useRef({onChange,onNotice});callbacks.current={onChange,onNotice};
  const mounted=useRef(true),userRequest=useRef(0),auditRequest=useRef(0),tuningRequest=useRef(0);
  const [tab,setTab]=useState<Tab>('accounts');
  const [users,setUsers]=useState<AdminUser[]>([]),[usersLoading,setUsersLoading]=useState(true),[usersError,setUsersError]=useState('');
  const [query,setQuery]=useState(''),[selectedUser,setSelectedUser]=useState<AdminUser|null>(null);
  const [audit,setAudit]=useState<AuditEntry[]>([]),[auditLoading,setAuditLoading]=useState(true),[auditError,setAuditError]=useState('');
  const [tuning,setTuning]=useState<Tuning|null>(null),[tuningLoading,setTuningLoading]=useState(true),[tuningError,setTuningError]=useState('');
  const [saving,setSaving]=useState<'tuning'|'offers'|'rewards'|null>(null),[formError,setFormError]=useState('');
  const [amount,setAmount]=useState(''),[reference,setReference]=useState(()=>nonce('grant')),[grantReason,setGrantReason]=useState('');
  const [review,setReview]=useState<GrantReview|null>(null),[grantBusy,setGrantBusy]=useState(false),[grantError,setGrantError]=useState('');
  const pendingGrant=useRef<{payload:string;key:string}|null>(null),busyRef=useRef(false);busyRef.current=grantBusy;
  const modalRef=useRef<HTMLDivElement>(null),modalTitle=useRef<HTMLHeadingElement>(null);
  const [carId,setCarId]=useState(catalog.cars[0]?.id??'brz'),[carDraft,setCarDraft]=useState({topSpeed:'',zeroTo100:'',handling:'',reason:''});
  const offers=useMemo(()=>[...catalog.cars,...catalog.wheels],[catalog]);
  const [offerId,setOfferId]=useState(catalog.cars[0]?.id??'brz'),[offerDraft,setOfferDraft]=useState({price:'',enabled:true,reason:''});
  const offer=offers.find(item=>item.id===offerId);
  const [rewardDraft,setRewardDraft]=useState({finish:'',perLap:'',first:'',second:'',third:'',minimumSeconds:'',maximum:'',reason:''});

  async function loadUsers(search=query) {
    const sequence=++userRequest.current;setUsersLoading(true);setUsersError('');
    try{const data=await api<{users:AdminUser[]}>('/admin/users?q='+encodeURIComponent(search)+'&limit=50');if(!mounted.current||sequence!==userRequest.current)return;
      setUsers(data.users);setSelectedUser(previous=>previous?(data.users.find(user=>user.id===previous.id)??previous):null);
    }catch(error){if(mounted.current&&sequence===userRequest.current)setUsersError(message(error));}
    finally{if(mounted.current&&sequence===userRequest.current)setUsersLoading(false);}
  }
  async function loadAudit() {
    const sequence=++auditRequest.current;setAuditLoading(true);setAuditError('');
    try{const data=await api<{entries:AuditEntry[]}>('/admin/audit?limit=50');if(mounted.current&&sequence===auditRequest.current)setAudit(data.entries);}
    catch(error){if(mounted.current&&sequence===auditRequest.current)setAuditError(message(error));}
    finally{if(mounted.current&&sequence===auditRequest.current)setAuditLoading(false);}
  }
  async function loadTuning() {
    const sequence=++tuningRequest.current;setTuningLoading(true);setTuningError('');
    try{const data=await api<Tuning>('/admin/tuning');if(mounted.current&&sequence===tuningRequest.current)setTuning(data);}
    catch(error){if(mounted.current&&sequence===tuningRequest.current)setTuningError(message(error));}
    finally{if(mounted.current&&sequence===tuningRequest.current)setTuningLoading(false);}
  }
  useEffect(()=>{mounted.current=true;void Promise.all([loadUsers(''),loadAudit(),loadTuning()]);return()=>{mounted.current=false;};},[]);
  useEffect(()=>{const car=tuning?.cars.find(item=>item.carId===carId);if(car)setCarDraft({topSpeed:String(car.topSpeed),zeroTo100:String(car.zeroTo100),handling:String(car.handling),reason:''});},[carId,tuning?.version]);
  useEffect(()=>{if(offer)setOfferDraft({price:offer.price,enabled:offer.enabled,reason:''});},[offer?.id,offer?.catalogVersion]);
  useEffect(()=>{const policy=tuning?.rewardPolicy;if(policy)setRewardDraft({finish:policy.finish,perLap:policy.perLap,first:policy.podium[0]??'0',second:policy.podium[1]??'0',third:policy.podium[2]??'0',minimumSeconds:String(policy.minimumDurationMs/1000),maximum:policy.maximum,reason:''});},[tuning?.version]);
  useEffect(()=>{setFormError('');},[tab]);
  useEffect(()=>{
    if(!review)return;
    const previous=document.activeElement as HTMLElement|null;modalTitle.current?.focus();
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape'&&!busyRef.current){event.preventDefault();setReview(null);}
      if(event.key==='Tab'&&modalRef.current){
        const focusable=Array.from(modalRef.current.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]'));
        if(!focusable.length){event.preventDefault();return;}
        const first=focusable[0]!,last=focusable[focusable.length-1]!;
        if(event.shiftKey&&(document.activeElement===first||document.activeElement===modalTitle.current)){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===modalTitle.current)){event.preventDefault();first.focus();}
      }
    };
    document.addEventListener('keydown',onKey);
    return()=>{document.removeEventListener('keydown',onKey);if(previous?.isConnected)previous.focus();};
  },[review]);

  async function refreshAfterMutation() {
    await Promise.all([loadAudit(),callbacks.current.onChange().catch(()=>callbacks.current.onNotice('Perubahan tersimpan. Muat ulang data untuk melihat hasil terbaru.',true))]);
  }
  function reviewGrant(event:FormEvent) {
    event.preventDefault();setFormError('');setGrantError('');
    if(!selectedUser){setFormError('Pilih pemain penerima terlebih dahulu.');return;}
    if(!validMoney(amount,1_000_000_000_000n,false)){setFormError('Masukkan jumlah kredit positif, tanpa titik, maksimal Rp1.000.000.000.000.');return;}
    if(reference.trim().length<8||reference.trim().length>100){setFormError('Referensi harus berisi 8–100 karakter.');return;}
    if(grantReason.trim().length<4||grantReason.trim().length>500){setFormError('Tulis alasan pemberian kredit, 4–500 karakter.');return;}
    const payload=JSON.stringify({userId:selectedUser.id,amount,reference:reference.trim(),reason:grantReason.trim()});
    if(pendingGrant.current?.payload!==payload)pendingGrant.current={payload,key:nonce('topup')};
    setReview({user:selectedUser,amount,reference:reference.trim(),reason:grantReason.trim(),key:pendingGrant.current.key});
  }
  async function commitGrant() {
    if(!review||grantBusy)return;setGrantBusy(true);setGrantError('');
    try{
      const result=await api<{alreadyApplied:boolean;wallet:{balance:string;version:string}}>('/admin/topups','POST',{userId:review.user.id,amount:review.amount,reference:review.reference,reason:review.reason},review.key);
      if(!mounted.current)return;
      setSelectedUser(previous=>previous?.id===review.user.id?{...previous,balance:result.wallet.balance,walletVersion:result.wallet.version}:previous);
      callbacks.current.onNotice(result.alreadyApplied?'Kredit dari referensi ini sudah tercatat; saldo tidak ditambah lagi.':`${rupiah(review.amount)} kredit ditambahkan ke ${review.user.displayName}.`);
      setReview(null);setAmount('');setGrantReason('');setReference(nonce('grant'));pendingGrant.current=null;
      await Promise.all([loadUsers(query),refreshAfterMutation()]);
    }catch(error){if(mounted.current)setGrantError(message(error));}
    finally{if(mounted.current)setGrantBusy(false);}
  }
  async function publishCar(event:FormEvent) {
    event.preventDefault();if(!tuning||saving)return;setFormError('');
    const values={topSpeed:Number(carDraft.topSpeed),zeroTo100:Number(carDraft.zeroTo100),handling:Number(carDraft.handling)};
    for(const field of ['topSpeed','zeroTo100','handling'] as const){const bound=tuning.bounds[field];if(!Number.isFinite(values[field])||values[field]<bound.min||values[field]>bound.max){setFormError(`${field} harus berada dalam rentang ${bound.min}–${bound.max}.`);return;}}
    if(carDraft.reason.trim().length<4){setFormError('Tulis alasan perubahan performa, minimal empat karakter.');return;}
    setSaving('tuning');
    try{const result=await api<{version:string}>('/admin/tuning/publish','POST',{expectedVersion:tuning.version,carId,...values,reason:carDraft.reason.trim()});callbacks.current.onNotice(`Performa versi ${result.version} diterbitkan untuk balapan baru.`);await Promise.all([loadTuning(),refreshAfterMutation()]);}
    catch(error){if(mounted.current)setFormError(message(error));}
    finally{if(mounted.current)setSaving(null);}
  }
  async function saveOffer(event:FormEvent) {
    event.preventDefault();if(!offer||saving)return;setFormError('');
    if(!validMoney(offerDraft.price,1_000_000_000_000n)){setFormError('Harga harus berupa angka bulat tanpa titik, maksimal Rp1.000.000.000.000.');return;}
    if(offerDraft.reason.trim().length<4){setFormError('Tulis alasan perubahan harga atau ketersediaan.');return;}
    setSaving('offers');
    try{await api('/admin/catalog/'+encodeURIComponent(offer.id),'PATCH',{price:offerDraft.price,enabled:offerDraft.enabled,expectedVersion:offer.catalogVersion,reason:offerDraft.reason.trim()});callbacks.current.onNotice(`Penawaran ${offer.name} diperbarui.`);await refreshAfterMutation();}
    catch(error){if(mounted.current)setFormError(message(error));}
    finally{if(mounted.current)setSaving(null);}
  }
  async function publishRewards(event:FormEvent) {
    event.preventDefault();if(!tuning||saving)return;setFormError('');
    for(const [field,max] of [['finish',100_000n],['perLap',10_000n],['first',100_000n],['second',100_000n],['third',100_000n],['maximum',500_000n]] as const){if(!validMoney(rewardDraft[field],max)){setFormError('Jumlah hadiah harus berupa angka bulat dalam batas yang ditampilkan.');return;}}
    const seconds=Number(rewardDraft.minimumSeconds);
    if(!Number.isInteger(seconds)||seconds<15||seconds>300){setFormError('Durasi minimum harus 15–300 detik.');return;}
    if(rewardDraft.reason.trim().length<4){setFormError('Tulis alasan perubahan hadiah.');return;}
    setSaving('rewards');
    try{const result=await api<{version:string}>('/admin/rewards/publish','POST',{expectedVersion:tuning.version,reason:rewardDraft.reason.trim(),rewardPolicy:{finish:rewardDraft.finish,perLap:rewardDraft.perLap,podium:[rewardDraft.first,rewardDraft.second,rewardDraft.third],minimumDurationMs:seconds*1000,maximum:rewardDraft.maximum}});callbacks.current.onNotice(`Hadiah versi ${result.version} diterbitkan untuk balapan baru.`);await Promise.all([loadTuning(),refreshAfterMutation()]);}
    catch(error){if(mounted.current)setFormError(message(error));}
    finally{if(mounted.current)setSaving(null);}
  }

  return <section className="admin-view" style={{...sections,fontSize:14}} aria-label="Panel administrator">
    <header className="section-heading"><div><span className="pill"><Icon name="shield" size={16}/> ADMIN</span><h1>Ruang kendali</h1><p>Kelola kredit virtual, isi garasi, dan aturan balapan UVelocity.</p></div></header>
    <nav aria-label="Bagian administrator" style={actions}>
      {tabs.map(item=><button key={item.id} type="button" style={control} className={tab===item.id?'primary':'secondary'} aria-pressed={tab===item.id} onClick={()=>setTab(item.id)}><Icon name={item.icon} size={18}/>{item.label}</button>)}
    </nav>

    {tab==='accounts'&&<div style={sections}>
      <section className="panel">
        <div className="section-heading"><div><h2>Pemain</h2><p>Cari akun sebelum menambahkan kredit.</p></div><button type="button" className="text-button" style={control} disabled={usersLoading} onClick={()=>void loadUsers(query)}><Icon name="refresh" size={18}/> Muat ulang</button></div>
        <form onSubmit={event=>{event.preventDefault();void loadUsers(query);}} style={{...actions,marginBottom:16}}>
          <label style={{flex:'1 1 260px'}}>Nama, email, atau ID pemain<input style={control} value={query} maxLength={254} onChange={event=>setQuery(event.target.value)} placeholder="Cari pemain…" autoComplete="off"/></label>
          <button className="secondary" style={control} disabled={usersLoading}>Cari</button>
          {query&&<button type="button" className="text-button" style={control} onClick={()=>{setQuery('');void loadUsers('');}}>Tampilkan semua</button>}
        </form>
        {usersError&&<p className="form-error" role="alert">{usersError}</p>}
        {usersLoading&&<p role="status">Memuat akun dari server…</p>}
        {!usersLoading&&!usersError&&users.length===0&&<p>Tidak ada pemain yang cocok dengan pencarian ini.</p>}
        {users.length>0&&<div style={{overflowX:'auto'}}><table className="data-table" style={{fontSize:14,width:'100%'}}><thead><tr><th>Pemain</th><th>Kredit game</th><th>Status</th><th><span>Pilih akun</span></th></tr></thead><tbody>
          {users.map(user=><tr key={user.id} style={selectedUser?.id===user.id?{background:'rgba(99,185,255,.08)'}:undefined}><td><strong>{user.displayName}</strong><br/><span>{user.email}</span></td><td>{rupiah(user.balance)}</td><td><span className="pill">{user.role==='admin'?'ADMIN':user.status==='active'?'Aktif':'Nonaktif'}</span></td><td><button type="button" className="secondary" style={control} aria-pressed={selectedUser?.id===user.id} onClick={()=>{setSelectedUser(user);setFormError('');}}>{selectedUser?.id===user.id?'Terpilih':'Pilih'}</button></td></tr>)}
        </tbody></table></div>}
      </section>
      <section className="panel">
        <div className="section-heading"><div><h2>Tambahkan kredit virtual</h2><p>Pemberian kredit manual dicatat bersama alasan dan referensinya.</p></div><Icon name="wallet" size={28}/></div>
        {!selectedUser?<p>Pilih akun pada daftar pemain untuk melanjutkan.</p>:<form onSubmit={reviewGrant} style={sections}>
          <div><strong>{selectedUser.displayName}</strong> · {selectedUser.email}<p>Saldo saat ini: <strong>{rupiah(selectedUser.balance)}</strong></p><p style={{wordBreak:'break-all'}}>ID: <code>{selectedUser.id}</code></p></div>
          <div className="field-grid"><label>Jumlah kredit<input style={control} inputMode="numeric" value={amount} onChange={event=>setAmount(event.target.value)} maxLength={16} placeholder="50000" required/><span>Angka bulat tanpa titik. {amount&&validMoney(amount,1_000_000_000_000n,false)?rupiah(amount):''}</span></label>
          <label>Referensi pemberian<input style={control} value={reference} onChange={event=>setReference(event.target.value)} minLength={8} maxLength={100} required/></label></div>
          <label>Alasan<textarea style={control} rows={3} value={grantReason} onChange={event=>setGrantReason(event.target.value)} minLength={4} maxLength={500} placeholder="Jelaskan alasan kredit diberikan…" required/></label>
          {formError&&<p className="form-error" role="alert">{formError}</p>}
          <div style={actions}><button className="primary" style={control} disabled={grantBusy}><Icon name="plus" size={18}/> Tinjau pemberian kredit</button><span>Rp adalah kredit permainan.</span></div>
        </form>}
      </section>
    </div>}

    {tab==='tuning'&&<section className="panel">
      <div className="section-heading"><div><h2>Performa mobil</h2><p>Balapan berjalan mempertahankan aturannya. Perubahan diterapkan saat balapan baru dimulai.</p></div><button type="button" className="text-button" style={control} disabled={tuningLoading||!!saving} onClick={()=>void loadTuning()}><Icon name="refresh" size={18}/> Muat aturan</button></div>
      {tuningError&&<p className="form-error" role="alert">{tuningError}</p>}{tuningLoading&&<p role="status">Memuat aturan…</p>}
      {tuning&&<form onSubmit={publishCar} style={sections}>
        <div style={actions}><span className="pill">VERSI {tuning.version}</span><span>Parameter simulasi arcade</span></div>
        <label>Mobil<select style={control} value={carId} onChange={event=>setCarId(event.target.value)} disabled={!!saving}>{catalog.cars.map(car=><option key={car.id} value={car.id}>{car.name}</option>)}</select></label>
        <div className="field-grid">
          <label>Kecepatan maksimum · km/jam<input style={control} type="number" min={tuning.bounds.topSpeed.min} max={tuning.bounds.topSpeed.max} step="0.01" value={carDraft.topSpeed} onChange={event=>setCarDraft({...carDraft,topSpeed:event.target.value})} required/></label>
          <label>0–100 km/jam · detik<input style={control} type="number" min={tuning.bounds.zeroTo100.min} max={tuning.bounds.zeroTo100.max} step="0.01" value={carDraft.zeroTo100} onChange={event=>setCarDraft({...carDraft,zeroTo100:event.target.value})} required/></label>
          <label>Pengali handling<input style={control} type="number" min={tuning.bounds.handling.min} max={tuning.bounds.handling.max} step="0.001" value={carDraft.handling} onChange={event=>setCarDraft({...carDraft,handling:event.target.value})} required/></label>
        </div>
        <label>Alasan perubahan<textarea style={control} rows={3} value={carDraft.reason} onChange={event=>setCarDraft({...carDraft,reason:event.target.value})} minLength={4} maxLength={500} required/></label>
        {formError&&<p className="form-error" role="alert">{formError}</p>}
        <div style={actions}><button className="primary" style={control} disabled={!!saving||tuningLoading}><Icon name="check" size={18}/>{saving==='tuning'?'Menerbitkan…':'Terbitkan performa'}</button></div>
      </form>}
    </section>}

    {tab==='offers'&&<section className="panel">
      <div className="section-heading"><div><h2>Harga & ketersediaan toko</h2><p>Pemain yang sudah memiliki item tetap dapat menggunakannya ketika penawaran dinonaktifkan.</p></div><button type="button" className="text-button" style={control} disabled={!!saving} onClick={()=>void callbacks.current.onChange().catch(error=>setFormError(message(error)))}><Icon name="refresh" size={18}/> Muat katalog</button></div>
      {offer&&<form onSubmit={saveOffer} style={sections}>
        <label>Item<select style={control} value={offerId} onChange={event=>setOfferId(event.target.value)} disabled={!!saving}><optgroup label="Mobil">{catalog.cars.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</optgroup><optgroup label="Velg">{catalog.wheels.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</optgroup></select></label>
        <div className="field-grid"><label>Harga dalam kredit game<input style={control} value={offerDraft.price} onChange={event=>setOfferDraft({...offerDraft,price:event.target.value})} inputMode="numeric" maxLength={16} required/><span>{validMoney(offerDraft.price,1_000_000_000_000n)?rupiah(offerDraft.price):'Gunakan angka bulat tanpa titik.'}</span></label><div><span className="pill">PENAWARAN V{offer.catalogVersion}</span><label style={{display:'flex',alignItems:'center',gap:10,marginTop:18}}><input style={{...control,width:'auto'}} type="checkbox" checked={offerDraft.enabled} onChange={event=>setOfferDraft({...offerDraft,enabled:event.target.checked})}/>Tersedia di toko</label></div></div>
        <label>Alasan perubahan<textarea style={control} rows={3} value={offerDraft.reason} onChange={event=>setOfferDraft({...offerDraft,reason:event.target.value})} minLength={4} maxLength={500} required/></label>
        {formError&&<p className="form-error" role="alert">{formError}</p>}
        <div style={actions}><button className="primary" style={control} disabled={!!saving}>{saving==='offers'?'Menyimpan…':'Simpan penawaran'}</button></div>
      </form>}
    </section>}

    {tab==='rewards'&&<section className="panel">
      <div className="section-heading"><div><h2>Hadiah balapan</h2><p>Aturan baru berlaku untuk balapan berikutnya. DNF tidak mendapat hadiah.</p></div><button type="button" className="text-button" style={control} disabled={tuningLoading||!!saving} onClick={()=>void loadTuning()}><Icon name="refresh" size={18}/> Muat aturan</button></div>
      {tuningError&&<p className="form-error" role="alert">{tuningError}</p>}{tuningLoading&&<p role="status">Memuat hadiah…</p>}
      {tuning&&<form onSubmit={publishRewards} style={sections}>
        <span className="pill" style={{justifySelf:'start'}}>VERSI {tuning.version}</span>
        <div className="field-grid">{([
          ['finish','Hadiah finish','100000'],['perLap','Tambahan per lap','10000'],['first','Bonus posisi 1','100000'],['second','Bonus posisi 2','100000'],['third','Bonus posisi 3','100000'],['maximum','Batas hadiah per balapan','500000']
        ] as const).map(([key,label,max])=><label key={key}>{label}<input style={control} inputMode="numeric" value={rewardDraft[key]} onChange={event=>setRewardDraft({...rewardDraft,[key]:event.target.value})} maxLength={6} required/><span>Maksimal {rupiah(max)}</span></label>)}</div>
        <label>Durasi finish minimum · detik<input style={control} type="number" min="15" max="300" step="1" value={rewardDraft.minimumSeconds} onChange={event=>setRewardDraft({...rewardDraft,minimumSeconds:event.target.value})} required/></label>
        <label>Alasan perubahan<textarea style={control} rows={3} value={rewardDraft.reason} onChange={event=>setRewardDraft({...rewardDraft,reason:event.target.value})} minLength={4} maxLength={500} required/></label>
        {formError&&<p className="form-error" role="alert">{formError}</p>}
        <div style={actions}><button className="primary" style={control} disabled={!!saving||tuningLoading}>{saving==='rewards'?'Menerbitkan…':'Terbitkan hadiah'}</button></div>
      </form>}
    </section>}

    {tab==='audit'&&<section className="panel">
      <div className="section-heading"><div><h2>Riwayat administrator</h2><p>50 tindakan terbaru, termasuk kredit, katalog, dan aturan balapan.</p></div><button type="button" className="text-button" style={control} disabled={auditLoading} onClick={()=>void loadAudit()}><Icon name="refresh" size={18}/> Muat ulang</button></div>
      {auditError&&<p className="form-error" role="alert">{auditError}</p>}{auditLoading&&<p role="status">Memuat riwayat…</p>}
      {!auditLoading&&!auditError&&audit.length===0&&<p>Belum ada tindakan administrator.</p>}
      {audit.length>0&&<div style={{overflowX:'auto'}}><table className="data-table" style={{fontSize:14,width:'100%'}}><thead><tr><th>Waktu & operator</th><th>Tindakan</th><th>Alasan & perubahan</th></tr></thead><tbody>{audit.map(entry=><tr key={entry.id}>
        <td>{dateLabel(entry.createdAt)}<br/><strong>{entry.actorName??'Operator sistem'}</strong></td>
        <td>{actionNames[entry.action]??entry.action}<br/><span>{offers.find(item=>item.id===entry.targetId)?.name??entry.targetId}</span></td>
        <td><p>{entry.reason}</p><details><summary style={{fontSize:14,cursor:'pointer'}}>Lihat perubahan</summary><pre style={{fontSize:14,whiteSpace:'pre-wrap',overflowWrap:'anywhere',maxWidth:520}}>{JSON.stringify({sebelum:entry.before,sesudah:entry.after},null,2)}</pre></details></td>
      </tr>)}</tbody></table></div>}
    </section>}

    {review&&<div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget&&!grantBusy)setReview(null);}}>
      <div ref={modalRef} className="modal-card" role="dialog" aria-modal="true" aria-labelledby="admin-grant-title" aria-describedby="admin-grant-description" style={{fontSize:14}}>
        <h2 id="admin-grant-title" ref={modalTitle} tabIndex={-1}>Tinjau pemberian kredit</h2>
        <p id="admin-grant-description">Pastikan penerima dan jumlahnya sesuai sebelum kredit ditambahkan.</p>
        <dl style={{display:'grid',gridTemplateColumns:'auto 1fr',gap:'12px 20px',overflowWrap:'anywhere'}}>
          <dt>Penerima</dt><dd style={{margin:0}}><strong>{review.user.displayName}</strong><br/>{review.user.email}</dd>
          <dt>Jumlah kredit</dt><dd style={{margin:0,fontSize:24,fontWeight:700}}>{rupiah(review.amount)}</dd>
          <dt>Saldo saat ditinjau</dt><dd style={{margin:0}}>{rupiah(review.user.balance)}</dd>
          <dt>Referensi</dt><dd style={{margin:0}}>{review.reference}</dd>
          <dt>Alasan</dt><dd style={{margin:0}}>{review.reason}</dd>
        </dl>
        <p>Kredit virtual untuk permainan UVelocity. Saldo akhir mengikuti transaksi terbaru di server.</p>
        {grantError&&<p className="form-error" role="alert">{grantError} Anda dapat mencoba lagi; permintaan ini memakai referensi yang sama.</p>}
        <div style={actions}><button type="button" className="secondary" style={control} disabled={grantBusy} onClick={()=>setReview(null)}>Kembali</button><button type="button" className="primary" style={control} disabled={grantBusy} onClick={()=>void commitGrant()}><Icon name="check" size={18}/>{grantBusy?'Menambahkan kredit…':grantError?'Coba lagi':'Tambahkan kredit'}</button></div>
      </div>
    </div>}
  </section>;
}
