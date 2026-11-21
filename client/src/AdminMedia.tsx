import {useCallback,useEffect,useRef,useState} from 'react';
import type {FormEvent} from 'react';
import type {AdminMediaLibrary,MediaAsset,MediaKind,PresentationSettings} from '../../shared/media.js';
import {api,ApiError,uploadMedia,resolveUrl} from './api.js';
import {Icon} from './icons.js';

const message=(error:unknown)=>error instanceof Error?error.message:'Permintaan media belum berhasil.';
const fileSize=(bytes:number)=>bytes>=1024*1024?`${(bytes/1024/1024).toFixed(1)} MB`:`${Math.ceil(bytes/1024)} KB`;
const selection=(settings:PresentationSettings)=>({garageMusicId:settings.garageMusic?.id??'',loadingImageId:settings.loadingImage?.id??'',musicVolume:Math.round(settings.musicVolume*100)});

function UploadCard({kind,limit,busy,upload}:{kind:MediaKind;limit:number;busy:boolean;upload:(kind:MediaKind,file:File)=>Promise<boolean>}){
  const [file,setFile]=useState<File|null>(null),input=useRef<HTMLInputElement>(null),[error,setError]=useState('');
  const music=kind==='garage_music';
  async function submit(event:FormEvent){
    event.preventDefault();setError('');if(!file)return;
    if(!(music?/\.mp3$/i:/\.jpe?g$/i).test(file.name)){setError(music?'Pilih berkas MP3 (.mp3).':'Pilih gambar JPEG (.jpg atau .jpeg).');return;}
    if(file.size===0||file.size>limit){setError(`Ukuran berkas harus lebih dari 0 dan maksimal ${fileSize(limit)}.`);return;}
    if(await upload(kind,file)){setFile(null);if(input.current)input.current.value='';}
  }
  return <form className="media-upload-card" onSubmit={submit}>
    <span className="eyebrow">{music?'SOUNDTRACK GARASI':'LATAR LOADING'}</span>
    <h3>{music?'Tambahkan lagu MP3':'Tambahkan gambar JPEG'}</h3>
    <p>{music?'Lagu diputar sejak splash, login, lalu garasi, bengkel, showroom, dan lobi.':'Latar splash 3 detik dan layar persiapan arena balapan.'}</p>
    <label>{music?'Berkas lagu MP3':'Berkas gambar JPEG'}<input ref={input} type="file" accept={music?'.mp3,audio/mpeg':'.jpg,.jpeg,image/jpeg'} disabled={busy} onChange={event=>{setFile(event.target.files?.[0]??null);setError('');}}/></label>
    <small>Maksimal {fileSize(limit)}{!music?' · Rasio 16:9 disarankan':''}.</small>
    {file&&<span className="media-selected-file">{file.name} · {fileSize(file.size)}</span>}
    {error&&<p className="form-error" role="alert">{error}</p>}
    <button className="secondary" disabled={busy||!file}><Icon name="plus" size={17}/>Unggah {music?'MP3':'JPEG'}</button>
  </form>;
}

export function AdminMedia({onChange,onNotice,muted=false,suspended=false}:{onChange:(settings:PresentationSettings)=>void;onNotice:(text:string,error?:boolean)=>void;muted?:boolean;suspended?:boolean}){
  const [library,setLibrary]=useState<AdminMediaLibrary|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [draft,setDraft]=useState({garageMusicId:'',loadingImageId:'',musicVolume:35}),[reason,setReason]=useState('');
  const [operation,setOperation]=useState<'save'|'delete'|'upload'|null>(null),[progress,setProgress]=useState(0),[uploadName,setUploadName]=useState('');
  const [previewId,setPreviewId]=useState<string|null>(null),[previewError,setPreviewError]=useState(''),[removal,setRemoval]=useState<MediaAsset|null>(null),[removeReason,setRemoveReason]=useState('');
  const mounted=useRef(true),loadSequence=useRef(0),request=useRef<AbortController|null>(null),uploader=useRef<AbortController|null>(null),audio=useRef<HTMLAudioElement|null>(null),callbacks=useRef({onChange,onNotice});callbacks.current={onChange,onNotice};
  const assignAudio=useCallback((element:HTMLAudioElement|null)=>{if(audio.current&&audio.current!==element)audio.current.pause();audio.current=element;},[]);
  const busy=loading||!!operation,preview=library?.assets.find(asset=>asset.id===previewId)??null;
  async function load(){
    const sequence=++loadSequence.current;request.current?.abort();const controller=new AbortController();request.current=controller;setLoading(true);setError('');
    try{
      const data=await api<AdminMediaLibrary>('/admin/media','GET',undefined,undefined,{signal:controller.signal});
      if(!mounted.current||sequence!==loadSequence.current)return false;
      setLibrary(data);setDraft(selection(data.settings));setReason('');callbacks.current.onChange(data.settings);return true;
    }catch(cause){if(mounted.current&&sequence===loadSequence.current)setError(message(cause));return false;}
    finally{if(mounted.current&&sequence===loadSequence.current)setLoading(false);}
  }
  useEffect(()=>{mounted.current=true;void load();return()=>{mounted.current=false;loadSequence.current++;request.current?.abort();uploader.current?.abort();audio.current?.pause();};},[]);
  useEffect(()=>{if(muted||suspended)audio.current?.pause();},[muted,suspended]);
  function previewAsset(id:string|null){audio.current?.pause();setPreviewId(previous=>previous===id?null:id);setPreviewError('');}
  async function upload(kind:MediaKind,file:File){
    if(busy||!library)return false;setOperation('upload');setError('');setProgress(0);setUploadName(file.name);
    const controller=new AbortController();uploader.current=controller;
    try{
      const {asset}=await uploadMedia(kind,file,{signal:controller.signal,onProgress:value=>{if(mounted.current)setProgress(value);}});
      if(!mounted.current)return false;
      setLibrary(previous=>previous?{...previous,assets:[asset,...previous.assets.filter(item=>item.id!==asset.id)]}:previous);
      previewAsset(asset.id);callbacks.current.onNotice('Unggahan selesai. Pilih media lalu simpan pengaturan untuk mengaktifkannya.');return true;
    }catch(cause){if(mounted.current)setError(message(cause));return false;}
    finally{if(mounted.current){setOperation(null);setUploadName('');}if(uploader.current===controller)uploader.current=null;}
  }
  async function save(event:FormEvent){
    event.preventDefault();if(!library||busy)return;setError('');
    if(reason.trim().length<4||reason.trim().length>500){setError('Tulis alasan perubahan media, 4–500 karakter.');return;}
    setOperation('save');
    try{
      const settings=await api<PresentationSettings>('/admin/presentation','PUT',{expectedVersion:library.settings.version,garageMusicId:draft.garageMusicId||null,loadingImageId:draft.loadingImageId||null,musicVolume:draft.musicVolume/100,reason:reason.trim()});
      if(!mounted.current)return;setLibrary(previous=>previous?{...previous,settings}:previous);setDraft(selection(settings));setReason('');callbacks.current.onChange(settings);callbacks.current.onNotice('Musik garasi dan halaman loading diperbarui.');
    }catch(cause){
      if(!mounted.current)return;
      if(cause instanceof ApiError&&cause.code==='PRESENTATION_CHANGED'){
        const refreshed=await load();if(mounted.current)setError(refreshed?'Pengaturan sudah diubah admin lain. Pilihan terbaru telah dimuat; periksa kembali lalu buat perubahan Anda.':'Pengaturan sudah diubah admin lain. Muat ulang media sebelum menyimpan kembali.');
      }else setError(message(cause));
    }finally{if(mounted.current)setOperation(null);}
  }
  async function remove(event:FormEvent){
    event.preventDefault();if(!removal||busy)return;setError('');
    if(removeReason.trim().length<4||removeReason.trim().length>500){setError('Tulis alasan penghapusan media, 4–500 karakter.');return;}
    setOperation('delete');if(previewId===removal.id)previewAsset(null);
    try{
      await api('/admin/media/'+encodeURIComponent(removal.id),'DELETE',{reason:removeReason.trim()});
      if(!mounted.current)return;
      setLibrary(previous=>previous?{...previous,assets:previous.assets.filter(asset=>asset.id!==removal.id)}:previous);
      setDraft(previous=>({...previous,garageMusicId:previous.garageMusicId===removal.id?'':previous.garageMusicId,loadingImageId:previous.loadingImageId===removal.id?'':previous.loadingImageId}));
      setRemoval(null);setRemoveReason('');callbacks.current.onNotice('Media yang tidak digunakan telah dihapus.');
    }catch(cause){if(mounted.current)setError(message(cause));}
    finally{if(mounted.current)setOperation(null);}
  }
  const activeIds=new Set([library?.settings.garageMusic?.id,library?.settings.loadingImage?.id]);
  const dirty=!!library&&(draft.garageMusicId!==(library.settings.garageMusic?.id??'')||draft.loadingImageId!==(library.settings.loadingImage?.id??'')||draft.musicVolume!==Math.round(library.settings.musicVolume*100));
  return <section className="panel admin-media" aria-label="Pengaturan musik dan loading">
    <div className="section-heading"><div><h2>Musik & halaman loading</h2><p>Unggah media, pratinjau, lalu pilih yang digunakan oleh para pembalap.</p></div><button className="text-button" disabled={busy} onClick={()=>void load()}><Icon name="refresh" size={17}/>Muat ulang media</button></div>
    {error&&<p className="form-error" role="alert">{error}</p>}
    {loading&&<p role="status">Memuat media dari server…</p>}
    {!library&&!loading&&<button className="secondary" onClick={()=>void load()}>Coba muat media lagi</button>}
    {library&&<>
      <div className="media-upload-grid"><UploadCard kind="garage_music" limit={library.limits.garageMusicBytes} busy={busy||library.assets.length>=library.limits.maxAssets} upload={upload}/><UploadCard kind="loading_image" limit={library.limits.loadingImageBytes} busy={busy||library.assets.length>=library.limits.maxAssets} upload={upload}/></div>
      {operation==='upload'&&<div className="media-upload-progress" role="status"><b>{progress<99?'Mengunggah':'Memeriksa berkas'}: {uploadName}</b><progress max="100" value={progress} aria-label="Kemajuan unggahan media"/><span>{progress}%{progress>=99?' · Menunggu hasil server':''}</span><button className="text-button" onClick={()=>uploader.current?.abort()}>Batalkan unggahan</button></div>}
      <form className="media-settings-form" onSubmit={save}>
        <div className="section-heading"><h3>Media yang digunakan</h3><span className="pill">VERSI {library.settings.version}</span></div>
        <div className="field-grid"><label>Lagu garasi<select value={draft.garageMusicId} disabled={busy} onChange={event=>setDraft({...draft,garageMusicId:event.target.value})}><option value="">Tanpa musik garasi</option>{library.assets.filter(asset=>asset.kind==='garage_music').map(asset=><option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label><label>Gambar splash & loading<select value={draft.loadingImageId} disabled={busy} onChange={event=>setDraft({...draft,loadingImageId:event.target.value})}><option value="">Latar bawaan UVelocity</option>{library.assets.filter(asset=>asset.kind==='loading_image').map(asset=><option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label></div>
        <label className="media-volume">Volume awal musik garasi · {draft.musicVolume}%<input type="range" min="0" max="100" step="1" value={draft.musicVolume} disabled={busy} onChange={event=>setDraft({...draft,musicVolume:Number(event.target.value)})}/></label>
        <label>Alasan perubahan media<textarea rows={2} value={reason} disabled={busy} onChange={event=>setReason(event.target.value)} minLength={4} maxLength={500} required placeholder="Contoh: mengganti soundtrack dan latar balapan"/></label>
        <div className="media-settings-actions"><button className="primary" disabled={busy||!dirty}><Icon name="check" size={17}/>{operation==='save'?'Menyimpan…':'Simpan pengaturan media'}</button><span>{dirty?'Pilihan belum disimpan':'Pilihan sesuai pengaturan server'}</span></div>
        <p className="hint">Lagu aktif mulai diputar saat splash dan berlanjut ke login serta garasi. Ikon musik di dekat kredit mengatur putar atau jeda; jika browser menahan autoplay, sentuh layar atau ikon musik. Gambar yang dipilih menjadi latar splash selama 3 detik, dengan logo UIKA dan Teknik Informatika tetap terlihat. Gambar yang sama digunakan saat persiapan sampai semua arena siap. Musik dijeda selama persiapan, balapan, dan jeda salat.</p>
      </form>
      <div className="section-heading"><div><h3>Koleksi media</h3><p>{library.assets.length} / {library.limits.maxAssets} berkas · {fileSize(library.assets.reduce((sum,asset)=>sum+asset.bytes,0))} / {fileSize(library.limits.totalBytes)}</p></div></div>
      {library.assets.length===0&&<div className="media-empty"><Icon name="sound" size={28}/><b>Belum ada media.</b><p>Unggah MP3 dan JPEG pertama Anda melalui form di atas.</p></div>}
      <ul className="media-library">{library.assets.map(asset=><li key={asset.id}>
        <div className="media-library-kind">{asset.kind==='garage_music'?'MP3':'JPEG'}</div><div className="media-library-meta"><b>{asset.name}</b><span>{fileSize(asset.bytes)}{asset.durationSeconds!==null?` · ${Math.floor(asset.durationSeconds/60)}:${Math.floor(asset.durationSeconds%60).toString().padStart(2,'0')}`:''}{asset.width!==null?` · ${asset.width} × ${asset.height}`:''}</span>{activeIds.has(asset.id)&&<small>Sedang digunakan</small>}</div>
        <div className="media-library-actions"><button className="secondary" aria-pressed={previewId===asset.id} onClick={()=>previewAsset(asset.id)}>{previewId===asset.id?'Tutup pratinjau':'Pratinjau'}</button><button className="text-button danger" disabled={busy||activeIds.has(asset.id)} title={activeIds.has(asset.id)?'Lepaskan pilihan aktif lalu simpan sebelum menghapus.':undefined} onClick={()=>{setRemoval(asset);setRemoveReason('');}}>Hapus</button></div>
      </li>)}</ul>
      {preview&&<section className="media-preview" aria-label={'Pratinjau '+preview.name}><div className="section-heading"><h3>{preview.name}</h3><button className="text-button" onClick={()=>previewAsset(null)}>Tutup pratinjau</button></div>{preview.kind==='garage_music'?<audio key={preview.id} ref={assignAudio} src={resolveUrl(preview.url)} controls preload="metadata" muted={muted} onPlay={event=>{if(muted||suspended)event.currentTarget.pause();}} onError={()=>setPreviewError('Pratinjau lagu belum dapat dimuat. Periksa koneksi atau unggah MP3 yang valid.')}/>:<img key={preview.id} src={resolveUrl(preview.url)} alt={'Pratinjau halaman loading '+preview.name} onError={()=>setPreviewError('Pratinjau gambar belum dapat dimuat. Periksa koneksi lalu coba lagi.')}/>} {(muted||suspended)&&preview.kind==='garage_music'&&<p>Pratinjau suara dijeda mengikuti pengaturan suara dan jeda permainan.</p>}{previewError&&<p className="form-error" role="alert">{previewError}</p>}</section>}
      {removal&&<form className="media-removal" onSubmit={remove}><h3>Hapus {removal.name}?</h3><p>Berkas akan dihapus dari koleksi media. Media yang sedang digunakan harus dilepas dari pengaturan terlebih dahulu.</p><label>Alasan menghapus media<input type="text" value={removeReason} onChange={event=>setRemoveReason(event.target.value)} disabled={busy} minLength={4} maxLength={500} required/></label><div className="button-row"><button type="button" className="secondary" disabled={busy} onClick={()=>setRemoval(null)}>Simpan berkas</button><button className="primary" disabled={busy}>{operation==='delete'?'Menghapus…':'Hapus media ini'}</button></div></form>}
    </>}
  </section>;
}
