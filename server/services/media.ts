import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { AdminMediaLibrary, MediaAsset, PresentationSettings } from '../../shared/media.js';
import { MEDIA_LIMITS } from '../../shared/media.js';
import { transaction } from '../db/pool.js';
import { requireAdmin } from './admin.js';
import { assert } from './errors.js';
import { mediaKind, validateMedia } from './media-validation.js';
import * as v from './validation.js';

const columns='id,kind,name,mime_type,bytes,sha256,duration_seconds,width,height,created_at';
type AssetRow={id:string;kind:MediaAsset['kind'];name:string;mime_type:MediaAsset['mimeType'];bytes:number;sha256:string;duration_seconds:number|null;width:number|null;height:number|null;created_at:Date|string};
function asset(row:AssetRow):MediaAsset {
  return {id:row.id,kind:row.kind,name:row.name,url:`/api/media/${row.id}`,mimeType:row.mime_type,bytes:row.bytes,
    durationSeconds:row.duration_seconds,width:row.width,height:row.height,createdAt:new Date(row.created_at).toISOString()};
}
function jsonColumns(alias:'music'|'image'):string {
  return `CASE WHEN ${alias}.id IS NULL THEN NULL ELSE jsonb_build_object(${columns.split(',').map(column=>`'${column}',${alias}.${column}`).join(',')}) END`;
}
async function settings(db:Pool|PoolClient):Promise<PresentationSettings> {
  const found=await db.query(`SELECT s.version,s.music_volume,${jsonColumns('music')} AS music,${jsonColumns('image')} AS image
    FROM presentation_settings s LEFT JOIN presentation_assets music ON music.id=s.garage_music_id
    LEFT JOIN presentation_assets image ON image.id=s.loading_image_id WHERE s.singleton=true`);
  const row=found.rows[0];
  assert(row,500,'PRESENTATION_UNAVAILABLE','Pengaturan media belum tersedia. Jalankan migrasi database.');
  return {version:row.version,garageMusic:row.music?asset(row.music):null,loadingImage:row.image?asset(row.image):null,musicVolume:row.music_volume};
}
async function audit(db:PoolClient,actor:string,action:string,target:string,reason:string,before:unknown,after:unknown):Promise<void> {
  await db.query('INSERT INTO admin_audit(id,actor_id,action,target_id,reason,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)',
    [randomUUID(),actor,action,target,reason,before===null?null:JSON.stringify(before),JSON.stringify(after)]);
}

export class MediaService {
  constructor(public readonly pool:Pool){}

  getPresentation():Promise<PresentationSettings> {return settings(this.pool);}

  async list(actorId:string):Promise<AdminMediaLibrary> {
    await requireAdmin(this.pool,actorId);
    return transaction(this.pool,async db=>{
      // This row serializes uploads, removals, and activation so the returned list is coherent.
      await db.query('SELECT singleton FROM presentation_settings WHERE singleton=true FOR SHARE');
      const found=await db.query<AssetRow>(`SELECT ${columns} FROM presentation_assets ORDER BY created_at DESC,id`);
      return {assets:found.rows.map(asset),settings:await settings(db),limits:{...MEDIA_LIMITS}};
    });
  }

  async upload(actorId:string,rawKind:unknown,rawName:unknown,content:unknown,contentType:unknown):Promise<{asset:MediaAsset}> {
    await requireAdmin(this.pool,actorId);
    const kind=mediaKind(rawKind),name=v.text(rawName,'Nama berkas',1,120);
    assert(!/[\\/]/u.test(name),400,'INVALID_MEDIA_NAME','Nama berkas tidak boleh berisi jalur folder.');
    const valid=await validateMedia(kind,content,contentType);
    const hash=createHash('sha256').update(valid.content).digest('hex');
    return transaction(this.pool,async db=>{
      await requireAdmin(db,actorId);
      await db.query('SELECT singleton FROM presentation_settings WHERE singleton=true FOR UPDATE');
      // Retrying the same upload never adds another file or consumes extra storage.
      const existing=await db.query<AssetRow>(`SELECT ${columns} FROM presentation_assets WHERE kind=$1 AND sha256=$2`,[kind,hash]);
      if(existing.rowCount)return {asset:asset(existing.rows[0]!)};
      const usage=(await db.query('SELECT count(*)::int AS count,COALESCE(sum(bytes),0)::bigint AS bytes FROM presentation_assets')).rows[0];
      assert(usage.count<MEDIA_LIMITS.maxAssets&&BigInt(usage.bytes)+BigInt(valid.content.length)<=BigInt(MEDIA_LIMITS.totalBytes),409,'MEDIA_LIBRARY_FULL','Koleksi media penuh. Hapus media yang tidak digunakan (maksimum 40 berkas / 250 MiB).');
      const created=await db.query<AssetRow>(`INSERT INTO presentation_assets(id,kind,name,mime_type,bytes,sha256,content,duration_seconds,width,height,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING ${columns}`,
        [randomUUID(),kind,name,valid.mimeType,valid.content.length,hash,valid.content,valid.durationSeconds,valid.width,valid.height,actorId]);
      const result=asset(created.rows[0]!);
      await audit(db,actorId,'media.uploaded',result.id,`Unggah ${kind==='garage_music'?'musik garasi':'gambar loading'}: ${name}`,null,result);
      return {asset:result};
    });
  }

  async updatePresentation(actorId:string,input:unknown):Promise<PresentationSettings> {
    const body=v.object(input),version=v.integer(body.expectedVersion,'Versi sebelumnya',1,2_147_483_646),reason=v.text(body.reason,'Alasan',4,500);
    const musicId=body.garageMusicId===null?null:v.uuid(body.garageMusicId,'Musik garasi');
    const imageId=body.loadingImageId===null?null:v.uuid(body.loadingImageId,'Gambar loading');
    assert(typeof body.musicVolume==='number'&&Number.isFinite(body.musicVolume)&&body.musicVolume>=0&&body.musicVolume<=1,400,'INVALID_VOLUME','Volume harus antara 0 dan 1.');
    const volume=Math.round(body.musicVolume*1000)/1000;
    return transaction(this.pool,async db=>{
      await requireAdmin(db,actorId);
      const locked=await db.query('SELECT version FROM presentation_settings WHERE singleton=true FOR UPDATE');
      assert(locked.rows[0]?.version===version,409,'PRESENTATION_CHANGED','Media aktif sudah diubah admin lain. Muat ulang lalu periksa pilihan sebelum menyimpan.');
      const before=await settings(db);
      for(const [id,kind] of [[musicId,'garage_music'],[imageId,'loading_image']] as const) {
        if(!id)continue;
        const found=await db.query('SELECT kind FROM presentation_assets WHERE id=$1',[id]);
        assert(found.rowCount,404,'MEDIA_NOT_FOUND','Media tidak ditemukan. Muat ulang koleksi.');
        assert(found.rows[0].kind===kind,400,'MEDIA_KIND_MISMATCH','Jenis media tidak sesuai dengan tujuan pemakaiannya.');
      }
      await db.query('UPDATE presentation_settings SET version=version+1,garage_music_id=$1,loading_image_id=$2,music_volume=$3,updated_by=$4,updated_at=now() WHERE singleton=true',[musicId,imageId,volume,actorId]);
      const after=await settings(db);
      await audit(db,actorId,'presentation.updated','presentation',reason,before,after);
      return after;
    });
  }

  async remove(actorId:string,rawId:unknown,input:unknown):Promise<{deleted:true}> {
    const id=v.uuid(rawId,'Media'),reason=v.text(v.object(input).reason,'Alasan',4,500);
    return transaction(this.pool,async db=>{
      await requireAdmin(db,actorId);
      const locked=(await db.query('SELECT garage_music_id,loading_image_id FROM presentation_settings WHERE singleton=true FOR UPDATE')).rows[0];
      assert(locked.garage_music_id!==id&&locked.loading_image_id!==id,409,'MEDIA_IN_USE','Media masih aktif. Lepas pilihan dan simpan pengaturan sebelum menghapusnya.');
      const found=await db.query<AssetRow>(`DELETE FROM presentation_assets WHERE id=$1 RETURNING ${columns}`,[id]);
      assert(found.rowCount,404,'MEDIA_NOT_FOUND','Media tidak ditemukan.');
      await audit(db,actorId,'media.deleted',id,reason,asset(found.rows[0]!),{deleted:true});
      return {deleted:true};
    });
  }

  /** Public delivery contains only metadata and bytes; no uploader/account information. */
  async describe(rawId:unknown):Promise<{asset:MediaAsset;etag:string}> {
    const id=v.uuid(rawId,'Media');
    const found=await this.pool.query<AssetRow>(`SELECT ${columns} FROM presentation_assets WHERE id=$1`,[id]);
    assert(found.rowCount,404,'MEDIA_NOT_FOUND','Media tidak ditemukan.');
    const row=found.rows[0]!;
    return {asset:asset(row),etag:`"${row.sha256}"`};
  }

  async read(rawId:string,start:number,end:number):Promise<Buffer> {
    const id=v.uuid(rawId,'Media');
    v.integer(start,'Awal byte',0,MEDIA_LIMITS.garageMusicBytes-1);
    v.integer(end,'Akhir byte',start,MEDIA_LIMITS.garageMusicBytes-1);
    const found=await this.pool.query('SELECT substring(content FROM $2::integer FOR $3::integer) AS content FROM presentation_assets WHERE id=$1',[id,start+1,end-start+1]);
    assert(found.rowCount,404,'MEDIA_NOT_FOUND','Media tidak ditemukan.');
    return found.rows[0].content;
  }
}
