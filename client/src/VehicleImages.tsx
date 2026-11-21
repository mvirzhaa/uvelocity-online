import {useEffect,useRef,useState} from 'react';
import type {FormEvent} from 'react';
import type {VehicleThumbnail,VehicleThumbnailAdmin,VehicleThumbnailSlot} from '../../shared/vehicle-thumbnails.js';
import type {CatalogItem} from './api.js';
import {api,ApiError,uploadFile} from './api.js';
import {Icon} from './icons.js';
import './vehicle-images.css';

type ThumbnailCar=Pick<CatalogItem,'id'|'name'|'thumbnail'>;
const errorMessage=(error:unknown)=>error instanceof Error?error.message:'Foto kendaraan belum berhasil diperbarui.';
const sizeLabel=(bytes:number)=>bytes>=1024*1024?`${(bytes/1024/1024).toFixed(1).replace('.0','')} MB`:`${Math.ceil(bytes/1024)} KB`;
const allowedTypes=new Set(['image/jpeg','image/png','image/webp']);
function fileType(file:File){
  if(file.type)return allowedTypes.has(file.type)?file.type:null;
  const extension=file.name.split('.').pop()?.toLowerCase();
  return extension==='jpg'||extension==='jpeg'||extension==='jfif'?'image/jpeg':extension==='png'?'image/png':extension==='webp'?'image/webp':null;
}
function thumbnailUrl(thumbnail:VehicleThumbnail|null|undefined){
  if(!thumbnail?.url||typeof window==='undefined')return null;
  try{
    const url=new URL(thumbnail.url,window.location.origin);
    const basePath = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
    if(url.origin!==window.location.origin) return null;
    if(/^\/api\/vehicle-thumbnails\/[0-9a-f-]{36}$/i.test(url.pathname)){
      return `${basePath}${url.pathname}`;
    }
    return null;
  }catch{return null;}
}

/** A presentational image only: selecting/loading a photo cannot equip a car. */
export function CarThumbnail({car,className=''}:{car:ThumbnailCar;className?:string}){
  const source=thumbnailUrl(car.thumbnail),[failedSource,setFailedSource]=useState<string|null>(null);
  const available=!!source&&failedSource!==source;
  return <span className={'vehicle-thumbnail'+(className?' '+className:'')} data-car-thumbnail={car.id}>
    {available?<img key={source} src={source!} width={512} height={288} loading="lazy" decoding="async" alt={'Foto '+car.name} onError={()=>setFailedSource(source)}/>:<span className="vehicle-thumbnail-fallback" role="img" aria-label={'Foto '+car.name+' belum tersedia'}><Icon name="car" size={38}/><small>{car.thumbnail?'Foto belum termuat':'Belum ada foto'}</small></span>}
  </span>;
}

export function VehicleImageEditor({cars,onSaved,onNotice}:{cars:CatalogItem[];onSaved:()=>Promise<void>;onNotice?:(text:string,error?:boolean)=>void}){
  const [selectedId,setSelectedId]=useState(cars[0]?.id??''),[library,setLibrary]=useState<VehicleThumbnailAdmin|null>(null),[loading,setLoading]=useState(true);
  const [file,setFile]=useState<File|null>(null),[preview,setPreview]=useState(''),[previewFailed,setPreviewFailed]=useState(false),[reason,setReason]=useState('');
  const [error,setError]=useState(''),[status,setStatus]=useState(''),[operation,setOperation]=useState<'upload'|'delete'|null>(null),[progress,setProgress]=useState(0);
  const [removal,setRemoval]=useState<{carId:string;name:string;version:number}|null>(null),[removeReason,setRemoveReason]=useState('');
  const mounted=useRef(true),loadSequence=useRef(0),request=useRef<AbortController|null>(null),mutation=useRef<AbortController|null>(null),operationRef=useRef<'upload'|'delete'|null>(null),fileInput=useRef<HTMLInputElement|null>(null),removeInput=useRef<HTMLInputElement|null>(null),callbacks=useRef({onSaved,onNotice});
  callbacks.current={onSaved,onNotice};
  const car=cars.find(item=>item.id===selectedId),slot=library?.cars.find(item=>item.carId===car?.id),busy=loading||!!operation;
  const inputLimit=library?.limits.inputBytes??4*1024*1024;
  const currentCar=car?{...car,thumbnail:slot?slot.thumbnail:car.thumbnail}:null;

  async function load(){
    const sequence=++loadSequence.current;request.current?.abort();const controller=new AbortController();request.current=controller;
    setLoading(true);setError('');setRemoval(null);
    try{
      const data=await api<VehicleThumbnailAdmin>('/admin/vehicle-thumbnails','GET',undefined,undefined,{signal:controller.signal});
      if(!mounted.current||sequence!==loadSequence.current)return false;
      setLibrary(data);return true;
    }catch(cause){if(mounted.current&&sequence===loadSequence.current)setError(errorMessage(cause));return false;}
    finally{if(mounted.current&&sequence===loadSequence.current)setLoading(false);}
  }
  useEffect(()=>{mounted.current=true;void load();return()=>{mounted.current=false;loadSequence.current++;request.current?.abort();mutation.current?.abort();};},[]);
  useEffect(()=>{
    setPreviewFailed(false);
    if(!file){setPreview('');return;}
    let source='';try{source=URL.createObjectURL(file);setPreview(source);}catch{setPreview('');}
    return()=>{if(source)URL.revokeObjectURL(source);};
  },[file]);
  useEffect(()=>{
    if(cars.some(item=>item.id===selectedId))return;
    // A parent catalog change must never retarget a draft or deletion review.
    mutation.current?.abort();clearFile();setReason('');setRemoval(null);setRemoveReason('');setError('');setStatus('');
    setSelectedId(cars[0]?.id??'');
  },[cars,selectedId]);
  useEffect(()=>{if(removal)removeInput.current?.focus();},[removal]);

  function clearFile(){setFile(null);setPreviewFailed(false);if(fileInput.current)fileInput.current.value='';}
  function selectCar(id:string){
    if(operationRef.current)return;
    setSelectedId(id);clearFile();setReason('');setRemoval(null);setRemoveReason('');setError('');setStatus('');
  }
  function chooseFile(candidate:File|null){
    if(operationRef.current)return;
    setFile(null);setPreviewFailed(false);setError('');setStatus('');setRemoval(null);
    if(!candidate)return;
    if(!fileType(candidate)){clearFile();setError('Pilih foto JPEG, PNG, atau WebP.');return;}
    if(candidate.size<1||candidate.size>inputLimit){clearFile();setError(`Ukuran foto harus lebih dari 0 dan maksimal ${sizeLabel(inputLimit)}.`);return;}
    setFile(candidate);
  }
  function applySlot(updated:VehicleThumbnailSlot){
    setLibrary(previous=>previous?{...previous,cars:previous.cars.map(item=>item.carId===updated.carId?updated:item)}:previous);
  }
  async function refreshCatalog(failureMessage='Foto tersimpan, tetapi koleksi belum berhasil dimuat ulang. Muat ulang halaman untuk melihat foto terbaru.'){
    try{await callbacks.current.onSaved();}
    catch{if(mounted.current)setError(failureMessage);}
  }
  async function handleMutationError(cause:unknown){
    if(!mounted.current)return;
    if(cause instanceof ApiError&&cause.code==='THUMBNAIL_CHANGED'){
      const refreshed=await load();
      if(mounted.current)setError(refreshed?'Foto telah diubah admin lain. Periksa foto terbaru, lalu kirim perubahan Anda kembali jika sesuai.':'Foto telah diubah admin lain. Muat ulang foto sebelum mengubahnya kembali.');
      if(refreshed&&mounted.current)await refreshCatalog('Foto telah diubah admin lain. Foto terbaru dimuat di sini, tetapi koleksi belum dapat disegarkan. Muat ulang halaman dan periksa kembali sebelum mengirim perubahan.');
    }else if(cause instanceof ApiError&&cause.code==='REQUEST_ABORTED'){
      const refreshed=await load();if(!mounted.current)return;
      setStatus(refreshed?'Permintaan unggah dihentikan. Foto terbaru telah diperiksa.':'Permintaan unggah dihentikan. Status foto terbaru belum dapat dipastikan; coba muat ulang foto.');
      if(refreshed)await refreshCatalog('Foto terbaru sudah diperiksa, tetapi koleksi belum dapat disegarkan. Muat ulang halaman untuk melihat keadaan terbaru.');
    }else setError(errorMessage(cause));
  }
  async function upload(event:FormEvent){
    event.preventDefault();if(operationRef.current||loading||!car||!slot||!file)return;
    setError('');setStatus('');
    const type=fileType(file),note=reason.trim();
    if(!type||file.size<1||file.size>inputLimit){setError(`Pilih JPEG, PNG, atau WebP berukuran maksimal ${sizeLabel(inputLimit)}.`);return;}
    if(note.length<4||note.length>500){setError('Tulis alasan perubahan foto, 4–500 karakter.');return;}
    operationRef.current='upload';setOperation('upload');setProgress(0);
    const controller=new AbortController();mutation.current=controller;
    const query=new URLSearchParams({expectedVersion:String(slot.version),reason:note});
    try{
      const updated=await uploadFile<VehicleThumbnailSlot>('/admin/vehicle-thumbnails/'+encodeURIComponent(car.id)+'?'+query.toString(),file,type,{signal:controller.signal,onProgress:value=>{if(mounted.current)setProgress(value);}});
      if(!mounted.current)return;
      if(!updated||updated.carId!==car.id||!Number.isInteger(updated.version)||updated.version<=slot.version||!updated.thumbnail||!thumbnailUrl(updated.thumbnail))throw new ApiError(200,'INVALID_RESPONSE','Hasil unggahan belum lengkap. Muat ulang foto sebelum mencoba lagi.');
      applySlot(updated);clearFile();setReason('');const text='Foto '+car.name+' diperbarui.';setStatus(text);callbacks.current.onNotice?.(text);await refreshCatalog();
    }catch(cause){await handleMutationError(cause);}
    finally{if(mutation.current===controller)mutation.current=null;operationRef.current=null;if(mounted.current)setOperation(null);}
  }
  async function remove(event:FormEvent){
    event.preventDefault();if(operationRef.current||loading||!removal)return;
    const note=removeReason.trim();setError('');setStatus('');
    if(note.length<4||note.length>500){setError('Tulis alasan menghapus foto, 4–500 karakter.');return;}
    operationRef.current='delete';setOperation('delete');const controller=new AbortController();mutation.current=controller;
    try{
      const updated=await api<VehicleThumbnailSlot>('/admin/vehicle-thumbnails/'+encodeURIComponent(removal.carId),'DELETE',{expectedVersion:removal.version,reason:note},undefined,{signal:controller.signal});
      if(!mounted.current)return;
      if(!updated||updated.carId!==removal.carId||!Number.isInteger(updated.version)||updated.version<=removal.version||updated.thumbnail!==null)throw new ApiError(200,'INVALID_RESPONSE','Hasil penghapusan belum lengkap. Muat ulang foto sebelum mencoba lagi.');
      applySlot(updated);setRemoval(null);setRemoveReason('');const text='Foto '+removal.name+' dihapus. Ikon kendaraan ditampilkan kembali.';setStatus(text);callbacks.current.onNotice?.(text);await refreshCatalog();
    }catch(cause){await handleMutationError(cause);}
    finally{if(mutation.current===controller)mutation.current=null;operationRef.current=null;if(mounted.current)setOperation(null);}
  }

  return <section className="panel vehicle-image-editor" aria-label="Foto koleksi kendaraan">
    <div className="section-heading"><div><span className="eyebrow">FOTO KENDARAAN</span><h2>Kenali mobil dari fotonya.</h2><p>Tambahkan foto mobil untuk kartu koleksi yang dilihat para pembalap.</p></div><button className="text-button" disabled={busy} onClick={()=>void load()}><Icon name="refresh" size={17}/>Muat ulang foto</button></div>
    {error&&<p className="form-error" role="alert">{error}</p>}
    {status&&<p className="vehicle-image-status" role="status"><Icon name="check" size={17}/>{status}</p>}
    {loading&&<p role="status">Memuat foto kendaraan…</p>}
    {!library&&!loading&&<button className="secondary" onClick={()=>void load()}>Coba muat foto lagi</button>}
    {car&&<label className="vehicle-image-selector">Pilih kendaraan<select value={car.id} disabled={busy} onChange={event=>selectCar(event.target.value)}>{cars.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
    {!car&&<p className="empty-state">Belum ada kendaraan dalam katalog.</p>}
    {car&&currentCar&&library&&<div className="vehicle-image-workspace">
      <div className="vehicle-image-current"><div className="vehicle-image-caption"><h3>{car.name}</h3><span>Foto saat ini</span></div><CarThumbnail car={currentCar}/><div className="vehicle-image-details"><span>{slot?.thumbnail?`${slot.thumbnail.width} × ${slot.thumbnail.height} · ${sizeLabel(slot.thumbnail.bytes)}`:'Unggah foto pertama untuk kendaraan ini.'}</span>{slot&&<span className="pill">FOTO V{slot.version}</span>}</div><button type="button" className="text-button danger" disabled={busy||!slot?.thumbnail} onClick={()=>{if(!slot)return;clearFile();setError('');setStatus('');setRemoval({carId:car.id,name:car.name,version:slot.version});setRemoveReason('');}}>Hapus foto</button></div>
      <form className="vehicle-image-upload" onSubmit={upload}>
        <h3>{slot?.thumbnail?'Ganti foto kendaraan':'Unggah foto kendaraan'}</h3>
        <label>Foto JPEG, PNG, atau WebP<input ref={fileInput} type="file" accept=".jpg,.jpeg,.jfif,.png,.webp,image/jpeg,image/png,image/webp" disabled={busy||!!removal} onChange={event=>chooseFile(event.target.files?.[0]??null)}/></label>
        <p className="hint">Maksimal {sizeLabel(inputLimit)}. Foto ditampilkan utuh dalam bingkai 16:9. Pilih foto yang memperlihatkan mobil dengan jelas.</p>
        {file&&<div className="vehicle-image-candidate"><div className="vehicle-image-caption"><b>Pratinjau pilihan baru</b><button type="button" className="text-button" disabled={busy} onClick={clearFile}>Batal memilih</button></div>{preview&&!previewFailed?<img src={preview} alt={'Pratinjau foto baru '+car.name} width={512} height={288} onError={()=>setPreviewFailed(true)}/>:<span className="vehicle-image-preview-fallback"><Icon name="camera" size={27}/>{previewFailed?'Pratinjau foto belum dapat dibuka.':'Pratinjau foto tidak tersedia.'}</span>}<span className="vehicle-image-filename">{file.name} · {sizeLabel(file.size)}</span></div>}
        <label>Alasan perubahan foto<textarea value={reason} onChange={event=>setReason(event.target.value)} disabled={busy||!!removal} minLength={4} maxLength={500} rows={2} required placeholder="Contoh: memperbarui foto Subaru BRZ"/></label>
        <button className="primary" disabled={busy||!slot||!file||!!removal}><Icon name="camera" size={17}/>{operation==='upload'?'Mengunggah foto…':slot?.thumbnail?'Simpan foto pengganti':'Simpan foto kendaraan'}</button>
      </form>
    </div>}
    {operation==='upload'&&<div className="vehicle-image-progress" role="status"><b>{progress<99?'Mengunggah foto':'Menyiapkan foto'} · {file?.name}</b><progress value={progress} max={100} aria-label="Kemajuan unggahan foto kendaraan"/><span>{progress}%{progress>=99?' · Menunggu hasil server':''}</span><button type="button" className="text-button" onClick={()=>mutation.current?.abort()}>Batalkan unggahan</button></div>}
    {removal&&<form className="vehicle-image-removal" onSubmit={remove}><h3>Hapus foto {removal.name}?</h3><p>Kartu kendaraan akan menampilkan ikon mobil sampai foto baru diunggah.</p><label>Alasan menghapus foto<input ref={removeInput} type="text" value={removeReason} onChange={event=>setRemoveReason(event.target.value)} disabled={busy} minLength={4} maxLength={500} required/></label><div className="button-row"><button type="button" className="secondary" disabled={busy} onClick={()=>setRemoval(null)}>Pertahankan foto</button><button className="primary" disabled={busy}>{operation==='delete'?'Menghapus foto…':'Ya, hapus foto'}</button></div></form>}
  </section>;
}
