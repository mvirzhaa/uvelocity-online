import {useEffect,useState} from 'react';
import type {CatalogItem} from './api.js';
import {rupiah} from './api.js';
import {Icon} from './icons.js';
import {CarThumbnail} from './VehicleImages.js';

const PAGE_SIZE=4;

/** Only the visible four cards are mounted; paging never equips or buys a car. */
export function VehicleCards({cars,ownedIds,selectedId,disabled,onSelect,categoryNames}:{
  cars:CatalogItem[];
  ownedIds:string[];
  selectedId:string;
  disabled:boolean;
  onSelect:(car:CatalogItem)=>void;
  categoryNames:ReadonlyMap<string,string>;
}){
  const selectionIndex=cars.findIndex(car=>car.id===selectedId);
  const [page,setPage]=useState(()=>Math.max(0,Math.floor(selectionIndex/PAGE_SIZE)));
  const listKey=cars.map(car=>car.id).join('|');
  const totalPages=Math.max(1,Math.ceil(cars.length/PAGE_SIZE));
  const currentPage=Math.min(page,totalPages-1),start=currentPage*PAGE_SIZE;
  useEffect(()=>{
    setPage(Math.max(0,Math.floor(cars.findIndex(car=>car.id===selectedId)/PAGE_SIZE)));
  },[selectedId,listKey]);
  const visible=cars.slice(start,start+PAGE_SIZE);
  return <div className="vehicle-card-carousel" role="region" aria-label="Kartu koleksi kendaraan" aria-roledescription="karusel">
    <div className="collection-paging" role="group" aria-label="Navigasi kartu kendaraan">
      <span className="collection-range" aria-live="polite" aria-atomic="true">{cars.length?start+1:0}–{Math.min(start+PAGE_SIZE,cars.length)} <span>dari {cars.length} kendaraan</span></span>
      <div className="collection-paging-buttons">
        <button type="button" className="icon-button collection-previous" aria-label="Kartu kendaraan sebelumnya" title="Empat kartu sebelumnya" aria-controls="visible-vehicle-cards" disabled={disabled||currentPage===0} onClick={()=>setPage(currentPage-1)}><Icon name="chevron" size={20}/></button>
        <button type="button" className="icon-button collection-next" aria-label="Kartu kendaraan berikutnya" title="Empat kartu berikutnya" aria-controls="visible-vehicle-cards" disabled={disabled||currentPage>=totalPages-1} onClick={()=>setPage(currentPage+1)}><Icon name="chevron" size={20}/></button>
      </div>
    </div>
    <div className="car-strip vehicle-card-page" id="visible-vehicle-cards" key={listKey+':'+currentPage}>
      {visible.map(car=><button type="button" className={'car-choice '+(selectedId===car.id?'selected':'')} aria-pressed={selectedId===car.id} disabled={disabled} key={car.id} onClick={()=>onSelect(car)}>
        <span className="car-swatch" style={{background:car.color}}/>
        <div className="car-choice-top thumbnail-top"><CarThumbnail car={car}/><span className="thumbnail-status">{ownedIds.includes(car.id)?<Icon name="check" size={16}/>:car.locked===false?<span className="free-access-tag">GRATIS</span>:<Icon name="lock" size={16}/>}</span></div>
        <b>{car.name}</b>
        <small className="vehicle-category-label">{car.categoryId?categoryNames.get(car.categoryId)??'Kategori kendaraan':'Belum berkategori'}</small>
        <span>{ownedIds.includes(car.id)?'Milik permanen':car.locked===false?'Akses gratis dari admin':rupiah(car.price)}</span>
      </button>)}
    </div>
  </div>;
}
