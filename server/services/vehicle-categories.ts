import type {Pool,PoolClient} from 'pg';
import type {VehicleCategory} from '../../shared/vehicle-categories.js';
import {assert} from './errors.js';
import * as v from './validation.js';

export function categoryId(value:unknown):string {
  assert(typeof value==='string'&&/^[a-z0-9][a-z0-9-]{0,63}$/.test(value),400,'INVALID_CATEGORY','Kategori kendaraan tidak valid.');
  return value;
}
export function categoryName(value:unknown):string {
  assert(typeof value==='string',400,'INVALID_FIELD','Nama kategori harus berupa teks.');
  // Normalize before checking length; keep control characters for text() to reject.
  return v.text(value.normalize('NFC').replace(/ {2,}/gu,' '),'Nama kategori',2,40);
}
export function categoryOrder(value:unknown):number {return v.integer(value,'Urutan kategori',0,9999);}
export async function listVehicleCategories(db:Pool|PoolClient):Promise<VehicleCategory[]> {
  const result=await db.query<VehicleCategory>('SELECT id,name,sort_order AS "sortOrder",version FROM vehicle_categories ORDER BY sort_order,lower(name),id');
  return result.rows;
}

/** Lock the destination against removal until the matching catalog update commits. */
export async function lockVehicleCategory(db:PoolClient,id:string):Promise<void> {
  const result=await db.query('SELECT id FROM vehicle_categories WHERE id=$1 FOR KEY SHARE',[id]);
  assert(result.rowCount,404,'CATEGORY_NOT_FOUND','Kategori tidak ditemukan. Muat ulang daftar kategori.');
}
