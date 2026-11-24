import {useEffect,useRef,useState,type FormEvent} from 'react';
import {api,type User,resolveUrl} from './api.js';
import type {MediaAsset} from '../../shared/media.js';
import {CAR_IDS,CIRCUIT_IDS} from '../../shared/types.js';
import {Icon} from './icons.js';
import './branding.css';

const BASE_URL = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');

export function Splash({done,image=null}:{done:()=>void;image?:MediaAsset|null}){
 const finish=useRef(done),[failedImage,setFailedImage]=useState<string|null>(null);finish.current=done;
 // Public media can arrive after mount. It must not extend the first intro or
 // postpone entry while a large/broken JPEG is loading.
 useEffect(()=>{const timer=setTimeout(()=>finish.current(),3000);return()=>clearTimeout(timer);},[]);
 const background=image?.url&&failedImage!==image.url?resolveUrl(image.url):null;
 return <div className={'splash campus-splash'+(background?' splash-has-image':'')} role="status" aria-label="Pembuka UVelocity">
  {background&&<img key={background} className="splash-background" src={background} alt="" aria-hidden="true" fetchPriority="high" onError={()=>setFailedImage(background)}/>}
  <div className="university-intro campus-intro">
   <div className="campus-logos">
    <figure className="campus-identity"><img className="campus-logo campus-logo-uika" src={`${BASE_URL}/branding/uika-logo-transparent.png`} alt="Logo Universitas Ibn Khaldun Bogor" width="190" height="193" fetchPriority="high"/><figcaption>UNIVERSITAS IBN KHALDUN<span>BOGOR</span></figcaption></figure>
    <div className="campus-divider" aria-hidden="true"/>
    <figure className="campus-identity"><img className="campus-logo campus-logo-ti" src={`${BASE_URL}/branding/informatika-uika-logo.png`} alt="Logo Teknik Informatika UIKA" width="168" height="168" fetchPriority="high"/><figcaption>TEKNIK INFORMATIKA<span>UIKA BOGOR</span></figcaption></figure>
   </div>
   <p className="campus-credit">create by civitas UIKA</p>
   <span className="campus-discipline">DARI KAMPUS, MENUJU LINTASAN.</span>
   <div className="campus-intro-progress" aria-hidden="true"/>
  </div>
 </div>;
}

export function Auth({onLogin,serverError,retry,initializing=false}:{initializing?:boolean;onLogin:(user:User)=>void;serverError:string;retry:()=>void}){
 const [register,setRegister]=useState(false),[email,setEmail]=useState(''),[name,setName]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(e:FormEvent){e.preventDefault();if(initializing||busy)return;setBusy(true);setError('');try{const r=await api<{user:User}>('/auth/'+(register?'register':'login'),'POST',{email,password,...(register?{displayName:name}:{})});setPassword('');onLogin(r.user);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <main className="auth-layout"><section className="auth-story"><div className="wordmark auth-wordmark"><img src={`${BASE_URL}/branding/uvelocity-logo.png`} alt="UVelocity"/></div><div className="auth-copy"><span className="eyebrow">UVELOCITY / ONLINE RACING</span><h1>Mulai dari garasi.<br/><em>Menang di lintasan.</em></h1><p>Satu dunia balap, garasi milik Anda. Pilih mobil, rakit gaya, dan ajak teman ke garis start.</p><div className="auth-tracks"><span>NEON CITY</span><span>AZURE COAST</span><span>FROSTPEAK PASS</span><span>DRAG STRIP 2 KM</span></div></div><div className="auth-road"><div/><i/><b>UV</b></div><footer><span>create by civitas UIKA</span><span>{CAR_IDS.length} kendaraan · {CIRCUIT_IDS.length} lintasan</span></footer></section>
 <section className="auth-form-side"><div className="auth-card"><div className="auth-tag"><Icon name="flag"/> AKSES PEMBALAP</div><h2>{register?'Garasi baru menanti.':'Selamat datang kembali.'}</h2><p>{register?'Buat akun dan mulai dengan Subaru BRZ serta Rp25.000 kredit game.':'Masuk untuk melanjutkan koleksi dan balapan Anda.'}</p><form onSubmit={submit}>
 {register&&<label>Nama pembalap<input value={name} onChange={e=>setName(e.target.value)} minLength={2} maxLength={32} required autoComplete="nickname" placeholder="Nama di lintasan"/></label>}
 <label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email" maxLength={254} placeholder="nama@email.com"/></label>
 <label>Kata sandi<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required minLength={register?12:1} maxLength={128} autoComplete={register?'new-password':'current-password'} placeholder={register?'Minimal 12 karakter':'Masukkan kata sandi'}/></label>
 {(error||serverError)&&<div className="form-error" role="alert">{error||serverError}{serverError&&<button type="button" onClick={retry}>Coba hubungkan lagi</button>}</div>}
 <button className="primary" disabled={busy||initializing}>{busy||initializing?'Menghubungkan…':register?'Buat akun pembalap':'Masuk ke garasi'}</button>
 </form><p className="auth-switch">{register?'Sudah punya akun?':'Belum punya akun?'} <button onClick={()=>{setRegister(!register);setError('');}}>{register?'Masuk':'Daftar sekarang'}</button></p><div className="auth-note"><Icon name="shield" size={18}/><span>Saldo rupiah adalah kredit virtual untuk kendaraan dan part di dalam game.</span></div></div><div className="university-signature">UNIVERSITAS IBN KHALDUN BOGOR<span>UVelocity · civitas UIKA</span></div></section></main>;
}
