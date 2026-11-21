import {createHash,randomUUID} from 'node:crypto';
import sharp from 'sharp';
import type {Pool,PoolClient} from 'pg';
import {CAR_IDS,type CarId} from '../../shared/types.js';
import {VEHICLE_THUMBNAIL_LIMITS as LIMITS,type VehicleThumbnail,type VehicleThumbnailSlot,type VehicleThumbnailAdmin} from '../../shared/vehicle-thumbnails.js';
import {transaction} from '../db/pool.js';
import {requireAdmin} from './admin.js';
import {assert,ServiceError} from './errors.js';
import * as v from './validation.js';

type AssetRow={id:string;mime_type:'image/webp';bytes:number;width:number;height:number;sha256:string;created_at:Date;content?:Buffer};
const columns='id,mime_type,bytes,width,height,sha256,created_at';
function thumbnail(row:AssetRow):VehicleThumbnail {
  return{id:row.id,url:`/api/vehicle-thumbnails/${row.id}`,mimeType:'image/webp',bytes:row.bytes,width:row.width,height:row.height};
}
export function thumbnailCarId(value:unknown):CarId {
  assert(typeof value==='string'&&(CAR_IDS as readonly string[]).includes(value),400,'INVALID_CAR','Kendaraan tidak tersedia.');return value as CarId;
}
function version(value:unknown):number {
  const parsed=typeof value==='string'&&/^[1-9][0-9]{0,9}$/.test(value)?Number(value):value;
  return v.integer(parsed,'Versi foto sebelumnya',1,2_147_483_646);
}

/** All output pixels are decoded; uploads cannot masquerade as a supported format. */
export async function normalizeVehicleThumbnail(input:unknown,contentType:unknown):Promise<{content:Buffer;width:number;height:number}> {
  const mime=typeof contentType==='string'?contentType.split(';',1)[0]!.trim().toLowerCase():'';
  assert(LIMITS.acceptedMimeTypes.includes(mime),415,'THUMBNAIL_TYPE_REQUIRED','Gunakan foto JPEG, PNG, atau WebP.');
  assert(Buffer.isBuffer(input)&&input.length>0,400,'EMPTY_THUMBNAIL','Pilih foto kendaraan yang berisi data.');
  assert(input.length<=LIMITS.inputBytes,413,'THUMBNAIL_TOO_LARGE','Foto kendaraan maksimum 4 MiB.');
  const format=mime==='image/jpeg'?'jpeg':mime==='image/png'?'png':'webp';
  const signature=format==='jpeg'?input.length>=4&&input.readUInt16BE(0)===0xffd8:
    format==='png'?input.length>=8&&input.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):
    input.length>=12&&input.subarray(0,4).toString('ascii')==='RIFF'&&input.subarray(8,12).toString('ascii')==='WEBP';
  assert(signature,400,'INVALID_THUMBNAIL','Isi foto tidak sesuai dengan format JPEG, PNG, atau WebP yang dipilih.');
  try {
    const image=sharp(input,{failOn:'warning',limitInputPixels:LIMITS.inputPixels});
    const metadata=await image.metadata();
    assert(metadata.format===format&&metadata.width&&metadata.height,400,'INVALID_THUMBNAIL','Foto tidak dapat dibaca sebagai gambar yang lengkap.');
    assert((metadata.pages??1)===1,400,'ANIMATED_THUMBNAIL','Gunakan satu foto diam, bukan gambar animasi.');
    assert(metadata.width*metadata.height<=LIMITS.inputPixels,400,'THUMBNAIL_DIMENSIONS','Foto kendaraan maksimum 16 megapiksel.');
    const result=await image.rotate().resize({width:LIMITS.maxWidth,height:LIMITS.maxHeight,fit:'inside',withoutEnlargement:true}).toColourspace('srgb').webp({quality:82,effort:4}).toBuffer({resolveWithObject:true});
    assert(result.data.length<=LIMITS.outputBytes,413,'THUMBNAIL_OUTPUT_TOO_LARGE','Foto yang diproses terlalu besar. Gunakan foto yang lebih sederhana.');
    return{content:result.data,width:result.info.width,height:result.info.height};
  }catch(error){
    if(error instanceof ServiceError)throw error;
    throw new ServiceError(400,'INVALID_THUMBNAIL','Foto rusak, terpotong, atau melebihi batas 16 megapiksel.');
  }
}

async function readSlots(db:Pool|PoolClient):Promise<VehicleThumbnailSlot[]> {
  const result=await db.query(`SELECT s.car_id,s.version,a.id,a.mime_type,a.bytes,a.width,a.height
    FROM vehicle_thumbnail_slots s JOIN catalog_items c ON c.id=s.car_id AND c.kind='car'
    LEFT JOIN vehicle_thumbnail_assets a ON a.id=s.thumbnail_id ORDER BY c.name,c.id`);
  return result.rows.map(row=>({carId:row.car_id,version:row.version,thumbnail:row.id?thumbnail(row):null}));
}
export async function catalogThumbnails(db:Pool|PoolClient):Promise<Map<string,VehicleThumbnail|null>> {
  return new Map((await readSlots(db)).map(slot=>[slot.carId,slot.thumbnail]));
}
async function audit(db:PoolClient,actorId:string,action:string,carId:string,reason:string,before:VehicleThumbnailSlot,after:VehicleThumbnailSlot):Promise<void> {
  await db.query('INSERT INTO admin_audit(id,actor_id,action,target_id,reason,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)',
    [randomUUID(),actorId,action,carId,reason,JSON.stringify(before),JSON.stringify(after)]);
}
async function lockSlot(db:PoolClient,carId:CarId,expectedVersion:number):Promise<VehicleThumbnailSlot> {
  const result=await db.query(`SELECT s.car_id,s.version,a.id,a.mime_type,a.bytes,a.width,a.height
    FROM vehicle_thumbnail_slots s JOIN catalog_items c ON c.id=s.car_id AND c.kind='car'
    LEFT JOIN vehicle_thumbnail_assets a ON a.id=s.thumbnail_id WHERE s.car_id=$1 FOR UPDATE OF s`,[carId]);
  assert(result.rowCount,404,'CAR_NOT_FOUND','Kendaraan tidak ditemukan.');
  const row=result.rows[0];assert(row.version===expectedVersion,409,'THUMBNAIL_CHANGED','Foto kendaraan sudah diubah admin lain. Muat ulang lalu periksa foto sebelum menyimpan.');
  return{carId,version:row.version,thumbnail:row.id?thumbnail(row):null};
}

export class VehicleThumbnailService {
  constructor(public readonly pool:Pool){}
  async list(actorId:string):Promise<VehicleThumbnailAdmin> {
    await requireAdmin(this.pool,actorId);return{cars:await readSlots(this.pool),limits:{...LIMITS}};
  }
  async replace(actorId:string,rawCarId:unknown,rawVersion:unknown,rawReason:unknown,input:unknown,contentType:unknown):Promise<VehicleThumbnailSlot> {
    await requireAdmin(this.pool,actorId);
    const carId=thumbnailCarId(rawCarId),expectedVersion=version(rawVersion),reason=v.text(rawReason,'Alasan perubahan foto',4,500),valid=await normalizeVehicleThumbnail(input,contentType);
    return transaction(this.pool,async db=>{
      await requireAdmin(db,actorId);const before=await lockSlot(db,carId,expectedVersion);
      const created=await db.query<AssetRow>(`INSERT INTO vehicle_thumbnail_assets(id,bytes,width,height,sha256,content,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING ${columns}`,
        [randomUUID(),valid.content.length,valid.width,valid.height,createHash('sha256').update(valid.content).digest('hex'),valid.content,actorId]);
      const after:VehicleThumbnailSlot={carId,version:before.version+1,thumbnail:thumbnail(created.rows[0]!)};
      await db.query('UPDATE vehicle_thumbnail_slots SET thumbnail_id=$2,version=version+1,updated_by=$3,updated_at=now() WHERE car_id=$1',[carId,after.thumbnail!.id,actorId]);
      // Each slot retains one photo only, bounding storage and never recycling a public URL.
      if(before.thumbnail)await db.query('DELETE FROM vehicle_thumbnail_assets WHERE id=$1',[before.thumbnail.id]);
      await audit(db,actorId,'vehicle.thumbnail.updated',carId,reason,before,after);return after;
    });
  }
  async remove(actorId:string,rawCarId:unknown,input:unknown):Promise<VehicleThumbnailSlot> {
    const carId=thumbnailCarId(rawCarId),body=v.object(input),expectedVersion=version(body.expectedVersion),reason=v.text(body.reason,'Alasan menghapus foto',4,500);
    return transaction(this.pool,async db=>{
      await requireAdmin(db,actorId);const before=await lockSlot(db,carId,expectedVersion);
      assert(before.thumbnail,409,'THUMBNAIL_EMPTY','Kendaraan ini belum memiliki foto.');
      const after:VehicleThumbnailSlot={carId,version:before.version+1,thumbnail:null};
      await db.query('UPDATE vehicle_thumbnail_slots SET thumbnail_id=NULL,version=version+1,updated_by=$2,updated_at=now() WHERE car_id=$1',[carId,actorId]);
      await db.query('DELETE FROM vehicle_thumbnail_assets WHERE id=$1',[before.thumbnail.id]);
      await audit(db,actorId,'vehicle.thumbnail.deleted',carId,reason,before,after);return after;
    });
  }
  async read(rawId:unknown,includeContent=true):Promise<{thumbnail:VehicleThumbnail;etag:string;createdAt:string;content:Buffer|null}> {
    const id=v.uuid(rawId,'Foto kendaraan');
    const result=await this.pool.query<AssetRow>(`SELECT ${columns}${includeContent?',content':''} FROM vehicle_thumbnail_assets WHERE id=$1`,[id]);
    assert(result.rowCount,404,'THUMBNAIL_NOT_FOUND','Foto kendaraan tidak ditemukan.');const row=result.rows[0]!;
    return{thumbnail:thumbnail(row),etag:`"${row.sha256}"`,createdAt:new Date(row.created_at).toISOString(),content:row.content??null};
  }
}
