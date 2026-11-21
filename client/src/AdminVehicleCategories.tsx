import {useEffect,useRef,useState,type FormEvent} from 'react';
import {api,ApiError,type Catalog} from './api.js';
import type {VehicleCategory} from '../../shared/vehicle-categories.js';
import {Icon} from './icons.js';
import './vehicle-categories.css';

type CategoryDraft={id:string|null;name:string;sortOrder:string;expectedVersion:number;reason:string};
type AssignmentDraft={carId:string;categoryId:string;expectedVersion:number;reason:string};
const categoryDraft=(item:VehicleCategory):CategoryDraft=>({id:item.id,name:item.name,sortOrder:String(item.sortOrder),expectedVersion:item.version,reason:''});
const newCategory=():CategoryDraft=>({id:null,name:'',sortOrder:'0',expectedVersion:1,reason:''});
const sorted=(items:VehicleCategory[])=>[...items].sort((a,b)=>a.sortOrder-b.sortOrder||a.name.localeCompare(b.name,'id'));
const errorMessage=(error:unknown)=>error instanceof Error?error.message:'Permintaan belum berhasil. Coba kembali.';
const validReason=(reason:string)=>reason.trim().length>=4&&reason.trim().length<=500;

export function AdminVehicleCategories({catalog,onSaved,onNotice}:{catalog:Catalog;onSaved:()=>Promise<void>;onNotice:(message:string,error?:boolean)=>void}){
 const [categories,setCategories]=useState<VehicleCategory[]>(()=>sorted(catalog.categories??[]));
 const [draft,setDraft]=useState<CategoryDraft>(()=>catalog.categories?.[0]?categoryDraft(catalog.categories[0]):newCategory());
 const [assignment,setAssignment]=useState<AssignmentDraft>(()=>({carId:catalog.cars[0]?.id??'',categoryId:catalog.cars[0]?.categoryId??'',expectedVersion:catalog.cars[0]?.catalogVersion??1,reason:''}));
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState<'category'|'assignment'|'delete'|null>(null),[readError,setReadError]=useState(''),[categoryError,setCategoryError]=useState(''),[assignmentError,setAssignmentError]=useState(''),[removing,setRemoving]=useState(false);
 const mounted=useRef(false),busyRef=useRef(false),readSequence=useRef(0),readController=useRef<AbortController|null>(null),nameInput=useRef<HTMLInputElement>(null),assignmentRefresh=useRef(false);
 const callbacks=useRef({onSaved,onNotice});callbacks.current={onSaved,onNotice};
 const disabled=loading||!!busy;
 const selectedCategory=categories.find(item=>item.id===draft.id),categoryCount=catalog.cars.filter(item=>item.categoryId===draft.id).length;
 const selectedCar=catalog.cars.find(item=>item.id===assignment.carId);

 async function load(reset=true){
  readController.current?.abort();const controller=new AbortController();readController.current=controller;
  const sequence=++readSequence.current;setLoading(true);setReadError('');
  try{
   const result=await api<{categories:VehicleCategory[]}>('/admin/vehicle-categories','GET',undefined,undefined,{signal:controller.signal});
   if(!mounted.current||controller.signal.aborted||sequence!==readSequence.current)return;
   const next=sorted(result.categories);setCategories(next);
   if(reset){setRemoving(false);setDraft(previous=>{const item=next.find(item=>item.id===previous.id)??next[0];return item?categoryDraft(item):newCategory();});}
  }catch(error){if(mounted.current&&!controller.signal.aborted&&sequence===readSequence.current)setReadError(errorMessage(error));}
  finally{if(mounted.current&&sequence===readSequence.current)setLoading(false);}
 }
 useEffect(()=>{mounted.current=true;void load();return()=>{mounted.current=false;readSequence.current++;readController.current?.abort();};},[]);
 // A removed vehicle must never retarget an in-progress assignment to another car.
 useEffect(()=>{
  const current=catalog.cars.find(item=>item.id===assignment.carId);
  if(current&&!assignmentRefresh.current)return;
  assignmentRefresh.current=false;
  const car=current??catalog.cars[0];setAssignment({carId:car?.id??'',categoryId:car?.categoryId??'',expectedVersion:car?.catalogVersion??1,reason:''});if(!current)setAssignmentError('');
 },[catalog.cars,assignment.carId]);

 function selectCategory(id:string){const item=categories.find(item=>item.id===id);if(item)setDraft(categoryDraft(item));setCategoryError('');setRemoving(false);}
 function selectCar(id:string){const car=catalog.cars.find(item=>item.id===id);if(car)setAssignment({carId:car.id,categoryId:car.categoryId??'',expectedVersion:car.catalogVersion,reason:''});setAssignmentError('');}
 async function refreshParent(){try{await callbacks.current.onSaved();}catch{callbacks.current.onNotice('Perubahan tersimpan. Muat ulang katalog untuk melihat data terbaru.',true);}}
 async function reconcile(error:unknown,part:'category'|'assignment'){
  if(error instanceof ApiError&&['CATEGORY_CHANGED','CATEGORY_NOT_FOUND','CATALOG_CHANGED','ITEM_NOT_FOUND','CATEGORY_IN_USE'].includes(error.code)){
   if(part==='assignment')assignmentRefresh.current=true;
   await load();await refreshParent();
  }
 }
 async function reload(){if(busyRef.current)return;await load();assignmentRefresh.current=true;await refreshParent();if(mounted.current){setCategoryError('');setAssignmentError('');}}
 async function saveCategory(event:FormEvent){
  event.preventDefault();if(disabled||busyRef.current)return;setCategoryError('');
  const name=draft.name.trim().replace(/\s+/g,' '),sortOrder=Number(draft.sortOrder),reason=draft.reason.trim();
  if(name.length<2||name.length>40){setCategoryError('Nama kategori harus berisi 2–40 karakter.');return;}
  if(!/^\d{1,4}$/.test(draft.sortOrder)||!Number.isInteger(sortOrder)||sortOrder>9999){setCategoryError('Urutan harus berupa angka bulat antara 0 dan 9999.');return;}
  if(!validReason(reason)){setCategoryError('Tulis alasan perubahan, 4–500 karakter.');return;}
  busyRef.current=true;setBusy('category');
  try{
   const result=await api<{category:VehicleCategory}>('/admin/vehicle-categories'+(draft.id?'/'+encodeURIComponent(draft.id):''),draft.id?'PATCH':'POST',{name,sortOrder,reason,...(draft.id?{expectedVersion:draft.expectedVersion}:{})});
   if(mounted.current){setCategories(previous=>sorted([...previous.filter(item=>item.id!==result.category.id),result.category]));setDraft(categoryDraft(result.category));setRemoving(false);}
   callbacks.current.onNotice(draft.id?'Kategori kendaraan diperbarui.':'Kategori kendaraan ditambahkan.');await refreshParent();
  }catch(error){await reconcile(error,'category');if(mounted.current)setCategoryError(errorMessage(error));}
  finally{busyRef.current=false;if(mounted.current)setBusy(null);}
 }
 async function removeCategory(){
  if(disabled||busyRef.current||!selectedCategory||!removing||categoryCount>0)return;
  if(!validReason(draft.reason)){setCategoryError('Tulis alasan penghapusan, 4–500 karakter.');return;}
  busyRef.current=true;setBusy('delete');setCategoryError('');
  try{
   await api('/admin/vehicle-categories/'+encodeURIComponent(selectedCategory.id),'DELETE',{expectedVersion:draft.expectedVersion,reason:draft.reason.trim()});
   if(mounted.current){const next=categories.filter(item=>item.id!==selectedCategory.id);setCategories(next);setDraft(next[0]?categoryDraft(next[0]):newCategory());setRemoving(false);setAssignment(previous=>previous.categoryId===selectedCategory.id?{...previous,categoryId:'',reason:''}:previous);}
   callbacks.current.onNotice('Kategori kosong dihapus.');await refreshParent();
  }catch(error){await reconcile(error,'category');if(mounted.current)setCategoryError(errorMessage(error));}
  finally{busyRef.current=false;if(mounted.current)setBusy(null);}
 }
 async function saveAssignment(event:FormEvent){
  event.preventDefault();if(disabled||busyRef.current||!selectedCar)return;setAssignmentError('');
  if(assignment.categoryId&&!categories.some(item=>item.id===assignment.categoryId)){setAssignmentError('Pilih kategori yang masih tersedia.');return;}
  if(!validReason(assignment.reason)){setAssignmentError('Tulis alasan pengelompokan, 4–500 karakter.');return;}
  busyRef.current=true;setBusy('assignment');
  try{
   const result=await api<{item:{catalogVersion:number;categoryId:string|null}}>('/admin/catalog/'+encodeURIComponent(selectedCar.id),'PATCH',{categoryId:assignment.categoryId||null,expectedVersion:assignment.expectedVersion,reason:assignment.reason.trim()});
   if(mounted.current)setAssignment(previous=>({...previous,expectedVersion:result.item.catalogVersion,categoryId:result.item.categoryId??'',reason:''}));
   callbacks.current.onNotice('Kategori '+selectedCar.name+' diperbarui.');await refreshParent();
  }catch(error){await reconcile(error,'assignment');if(mounted.current)setAssignmentError(errorMessage(error));}
  finally{busyRef.current=false;if(mounted.current)setBusy(null);}
 }

 return <section className="vehicle-categories-admin" aria-label="Kelola kategori kendaraan" aria-busy={disabled}>
  <header className="section-heading"><div><h2>Kategori kendaraan</h2><p>Kelompokkan koleksi agar mudah ditemukan di showroom.</p></div><button type="button" className="text-button" disabled={disabled} onClick={()=>void reload()}><Icon name="refresh" size={18}/>Muat kategori</button></header>
  {loading&&<p role="status">Memuat kategori…</p>}{readError&&<p className="form-error" role="alert">{readError}</p>}
  <div className="vehicle-category-columns">
   <form className="panel vehicle-category-form" aria-label={draft.id?'Ubah kategori kendaraan':'Buat kategori kendaraan'} onSubmit={saveCategory}>
    <div className="vehicle-category-heading"><h3>{draft.id?'Ubah kategori':'Kategori baru'}</h3><button type="button" className="text-button" disabled={disabled} onClick={()=>{setDraft(newCategory());setCategoryError('');setRemoving(false);nameInput.current?.focus();}}><Icon name="plus" size={18}/>Kategori baru</button></div>
    {categories.length>0&&<label>Kategori tersedia<select disabled={disabled} value={draft.id??''} onChange={event=>selectCategory(event.target.value)}><option value="" disabled>Pilih kategori untuk diubah</option>{categories.map(item=><option key={item.id} value={item.id}>{item.name} · {catalog.cars.filter(car=>car.categoryId===item.id).length} kendaraan</option>)}</select></label>}
    <div className="vehicle-category-fields"><label>Nama kategori<input ref={nameInput} type="text" disabled={disabled} value={draft.name} onChange={event=>{setDraft({...draft,name:event.target.value});setRemoving(false);}} minLength={2} maxLength={40} placeholder="Contoh: SUV" required/></label><label>Urutan tampilan<input disabled={disabled} type="number" value={draft.sortOrder} onChange={event=>{setDraft({...draft,sortOrder:event.target.value});setRemoving(false);}} min={0} max={9999} step={1} required/></label></div>
    <label>Alasan perubahan kategori<textarea disabled={disabled} rows={2} value={draft.reason} onChange={event=>setDraft({...draft,reason:event.target.value})} minLength={4} maxLength={500} placeholder="Alasan penambahan, perubahan, atau penghapusan" required/></label>
    {categoryError&&<p className="form-error" role="alert">{categoryError}</p>}
    <div className="vehicle-category-actions"><button className="primary" disabled={disabled||removing}>{busy==='category'?'Menyimpan…':draft.id?'Simpan kategori':'Tambahkan kategori'}</button>{selectedCategory&&<button type="button" className="text-button danger" disabled={disabled||categoryCount>0} onClick={()=>{setRemoving(!removing);setCategoryError('');}}>{removing?'Batalkan penghapusan':'Hapus kategori'}</button>}</div>
    {removing&&<div className="vehicle-category-removal" role="group" aria-label="Konfirmasi hapus kategori"><p>Hapus kategori kosong <strong>{selectedCategory?.name}</strong>? Isi alasan di atas untuk melanjutkan.</p><button type="button" className="secondary danger" disabled={disabled} onClick={()=>void removeCategory()}>{busy==='delete'?'Menghapus…':'Ya, hapus kategori'}</button></div>}
    <p className="hint">Urutan lebih kecil muncul lebih awal. {selectedCategory&&categoryCount>0?`Pindahkan ${categoryCount} kendaraan ke kategori lain sebelum menghapus kategori ini.`:'Kategori kosong dapat dihapus.'}</p>
   </form>
   <form className="panel vehicle-category-assignment" aria-label="Kelompokkan kendaraan" onSubmit={saveAssignment}>
    <h3>Kelompokkan kendaraan</h3>
    <label>Kendaraan<select disabled={disabled||!catalog.cars.length} value={assignment.carId} onChange={event=>selectCar(event.target.value)}>{catalog.cars.map(car=><option key={car.id} value={car.id}>{car.name}</option>)}</select></label>
    <label>Kategori kendaraan<select disabled={disabled||!selectedCar} value={assignment.categoryId} onChange={event=>setAssignment({...assignment,categoryId:event.target.value})}><option value="">Tanpa kategori</option>{categories.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label>Alasan pengelompokan<textarea disabled={disabled||!selectedCar} rows={2} value={assignment.reason} onChange={event=>setAssignment({...assignment,reason:event.target.value})} minLength={4} maxLength={500} placeholder="Contoh: kelompokkan kendaraan keluarga ke MPV" required/></label>
    {assignmentError&&<p className="form-error" role="alert">{assignmentError}</p>}
    <div className="vehicle-category-actions"><button className="primary" disabled={disabled||!selectedCar}>{busy==='assignment'?'Menyimpan…':'Simpan kategori kendaraan'}</button></div>
    <p className="hint">Kategori digunakan sebagai filter showroom. Harga, akses kendaraan, dan koleksi pemain tetap dikelola melalui pengaturannya masing-masing.</p>
   </form>
  </div>
 </section>;
}
