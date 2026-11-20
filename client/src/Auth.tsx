import {useEffect,useState,type FormEvent} from 'react';
import {api,type User} from './api.js';
import {Icon} from './icons.js';

export function Splash({done}:{done:()=>void}){
 const [phase,setPhase]=useState(0);
 useEffect(()=>{const a=setTimeout(()=>setPhase(1),2100),b=setTimeout(done,3900);return()=>{clearTimeout(a);clearTimeout(b);};},[done]);
 return <div className={'splash phase-'+phase} role="status" aria-label="Pembuka UVelocity">
  {phase===0?<div className="university-intro"><div className="uika-badge"><img src={`${import.meta.env.BASE_URL || '/'}branding/uika-logo-original.jpg`} alt="Logo Universitas Ibn Khaldun Bogor"/></div><p>create by civitas UIKA</p><span>UNIVERSITAS IBN KHALDUN BOGOR</span></div>:<div className="velocity-intro"><img src={`${import.meta.env.BASE_URL || '/'}branding/uvelocity-logo.png`} alt="UVelocity"/><p>YOUR GARAGE. YOUR GRID.</p><div className="intro-track"/></div>}
  <button className="splash-skip" onClick={done}>Lewati intro</button>
 </div>;
}

export function Auth({onLogin,serverError,retry,initializing=false}:{initializing?:boolean;onLogin:(user:User)=>void;serverError:string;retry:()=>void}){
 const [register,setRegister]=useState(false),[email,setEmail]=useState(''),[name,setName]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(e:FormEvent){e.preventDefault();if(initializing||busy)return;setBusy(true);setError('');try{const r=await api<{user:User}>('/auth/'+(register?'register':'login'),'POST',{email,password,...(register?{displayName:name}:{})});setPassword('');onLogin(r.user);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <main className="auth-layout"><section className="auth-story"><div className="wordmark auth-wordmark"><img src={`${import.meta.env.BASE_URL || '/'}branding/uvelocity-logo.png`} alt="UVelocity"/></div><div className="auth-copy"><span className="eyebrow">UVELOCITY / ONLINE RACING</span><h1>Mulai dari garasi.<br/><em>Menang di lintasan.</em></h1><p>Satu dunia balap, garasi milik Anda. Pilih mobil, rakit gaya, dan ajak teman ke garis start.</p><div className="auth-tracks"><span>NEON CITY</span><span>AZURE COAST</span><span>FROSTPEAK PASS</span></div></div><div className="auth-road"><div/><i/><b>UV</b></div><footer><span>create by civitas UIKA</span><span>8 kendaraan · 3 sirkuit</span></footer></section>
 <section className="auth-form-side"><div className="auth-card"><div className="auth-tag"><Icon name="flag"/> AKSES PEMBALAP</div><h2>{register?'Garasi baru menanti.':'Selamat datang kembali.'}</h2><p>{register?'Buat akun dan mulai dengan Subaru BRZ serta Rp25.000 kredit game.':'Masuk untuk melanjutkan koleksi dan balapan Anda.'}</p><form onSubmit={submit}>
 {register&&<label>Nama pembalap<input value={name} onChange={e=>setName(e.target.value)} minLength={2} maxLength={32} required autoComplete="nickname" placeholder="Nama di lintasan"/></label>}
 <label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email" maxLength={254} placeholder="nama@email.com"/></label>
 <label>Kata sandi<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required minLength={register?12:1} maxLength={128} autoComplete={register?'new-password':'current-password'} placeholder={register?'Minimal 12 karakter':'Masukkan kata sandi'}/></label>
 {(error||serverError)&&<div className="form-error" role="alert">{error||serverError}{serverError&&<button type="button" onClick={retry}>Coba hubungkan lagi</button>}</div>}
 <button className="primary" disabled={busy||initializing}>{busy||initializing?'Menghubungkan…':register?'Buat akun pembalap':'Masuk ke garasi'}</button>
 </form><p className="auth-switch">{register?'Sudah punya akun?':'Belum punya akun?'} <button onClick={()=>{setRegister(!register);setError('');}}>{register?'Masuk':'Daftar sekarang'}</button></p><div className="auth-note"><Icon name="shield" size={18}/><span>Saldo rupiah adalah kredit virtual untuk kendaraan dan part di dalam game.</span></div></div><div className="university-signature">UNIVERSITAS IBN KHALDUN BOGOR<span>UVelocity · civitas UIKA</span></div></section></main>;
}
