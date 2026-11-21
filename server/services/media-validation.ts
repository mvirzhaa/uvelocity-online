import sharp from 'sharp';
import type { MediaKind } from '../../shared/media.js';
import { MEDIA_LIMITS } from '../../shared/media.js';
import { assert, ServiceError } from './errors.js';

export interface ValidatedMedia {
  content:Buffer;
  mimeType:'audio/mpeg'|'image/jpeg';
  durationSeconds:number|null;
  width:number|null;
  height:number|null;
}
export function mediaKind(value:unknown):MediaKind {
  assert(value==='garage_music'||value==='loading_image',400,'INVALID_MEDIA_KIND','Pilih musik garasi atau gambar loading.');
  return value;
}
export function mediaByteLimit(kind:MediaKind):number {
  return kind==='garage_music'?MEDIA_LIMITS.garageMusicBytes:MEDIA_LIMITS.loadingImageBytes;
}
function invalidMp3():never {
  throw new ServiceError(400,'INVALID_MP3','Berkas harus berisi audio MP3 MPEG Layer III yang lengkap (bukan berkas yang hanya diganti ekstensinya).');
}

/** Validate every complete MPEG Layer III frame; remove non-audio tags before storage. */
function mp3(input:Buffer):ValidatedMedia {
  let start=0,end=input.length;
  if(input.subarray(0,3).toString('ascii')==='ID3') {
    if(input.length<10||![2,3,4].includes(input[3]!)||input[4]===255||[6,7,8,9].some(i=>input[i]!>=128))invalidMp3();
    const size=(input[6]!<<21)|(input[7]!<<14)|(input[8]!<<7)|input[9]!;
    start=10+size+(input[3]===4&&(input[5]!&0x10)?10:0);
    if(start>=end)invalidMp3();
  }
  if(end-start>=128&&input.subarray(end-128,end-125).toString('ascii')==='TAG')end-=128;
  // APEv2 footer: tag size includes the footer, but excludes the optional header.
  if(end-start>=32&&input.subarray(end-32,end-24).toString('ascii')==='APETAGEX') {
    const tagSize=input.readUInt32LE(end-20),flags=input.readUInt32LE(end-12);
    const tagStart=end-tagSize-((flags&0x80000000)!==0?32:0);
    if(tagSize<32||tagStart<start)invalidMp3();
    end=tagStart;
  }
  const firstBitrates=[0,32,40,48,56,64,80,96,112,128,160,192,224,256,320];
  const lowBitrates=[0,8,16,24,32,40,48,56,64,80,96,112,128,144,160];
  let offset=start,frames=0,duration=0,sampleRate=0,version=0;
  while(offset<end) {
    // Some encoders append a short zero pad after the last audio frame.
    if(frames>=2&&end-offset<=4096&&input.subarray(offset,end).every(byte=>byte===0)){end=offset;break;}
    if(offset+4>end)invalidMp3();
    const a=input[offset]!,b=input[offset+1]!,c=input[offset+2]!,d=input[offset+3]!;
    const ver=(b>>3)&3,layer=(b>>1)&3,bitrateIndex=c>>4,frequencyIndex=(c>>2)&3;
    if(a!==255||(b&0xe0)!==0xe0||ver===1||layer!==1||bitrateIndex===0||bitrateIndex===15||frequencyIndex===3||(d&3)===2)invalidMp3();
    const rate=[44100,48000,32000][frequencyIndex]!/(ver===3?1:ver===2?2:4);
    const bitrate=(ver===3?firstBitrates:lowBitrates)[bitrateIndex]!;
    const length=Math.floor((ver===3?144000:72000)*bitrate/rate)+((c>>1)&1);
    const sideInfo=ver===3?((d>>6)===3?17:32):((d>>6)===3?9:17);
    if(length<4+sideInfo+((b&1)===0?2:0)||offset+length>end)invalidMp3();
    if(frames&&(sampleRate!==rate||version!==ver))invalidMp3();
    sampleRate=rate;version=ver;frames++;duration+=(ver===3?1152:576)/rate;offset+=length;
    assert(duration<=3600,400,'MP3_TOO_LONG','Durasi musik maksimum 60 menit.');
  }
  if(frames<2||offset!==end)invalidMp3();
  return {content:Buffer.from(input.subarray(start,end)),mimeType:'audio/mpeg',durationSeconds:Math.round(duration*1000)/1000,width:null,height:null};
}

/** Full JPEG decode/re-encode rejects corrupt pixel streams and discards EXIF/GPS metadata. */
async function jpeg(input:Buffer):Promise<ValidatedMedia> {
  assert(input.length>=4&&input.readUInt16BE(0)===0xffd8,400,'INVALID_JPEG','Gambar loading harus berupa berkas JPEG asli.');
  try {
    const source=sharp(input,{failOn:'warning',limitInputPixels:24_000_000});
    const meta=await source.metadata();
    assert(meta.format==='jpeg'&&meta.width&&meta.height,400,'INVALID_JPEG','Gambar loading harus berupa berkas JPEG asli.');
    assert(meta.width<=8192&&meta.height<=8192&&meta.width*meta.height<=24_000_000,400,'IMAGE_DIMENSIONS','Gambar maksimum 8192 piksel per sisi dan 24 megapiksel.');
    const result=await source.rotate().toColourspace('srgb').jpeg({quality:92}).toBuffer({resolveWithObject:true});
    assert(result.data.length<=MEDIA_LIMITS.loadingImageBytes,413,'MEDIA_TOO_LARGE','Gambar JPEG yang diproses melebihi batas 10 MiB.');
    return {content:result.data,mimeType:'image/jpeg',durationSeconds:null,width:result.info.width,height:result.info.height};
  } catch(error) {
    if(error instanceof ServiceError)throw error;
    throw new ServiceError(400,'INVALID_JPEG','JPEG rusak, terpotong, atau dimensinya terlalu besar. Unggah gambar JPEG yang lengkap.');
  }
}

export async function validateMedia(kind:MediaKind,input:unknown,contentType:unknown):Promise<ValidatedMedia> {
  const expected=kind==='garage_music'?'audio/mpeg':'image/jpeg';
  assert(typeof contentType==='string'&&contentType.split(';',1)[0]!.trim().toLowerCase()===expected,415,'MEDIA_TYPE_REQUIRED',`Gunakan Content-Type ${expected}.`);
  assert(Buffer.isBuffer(input)&&input.length>0,400,'EMPTY_MEDIA','Pilih berkas yang berisi data.');
  assert(input.length<=mediaByteLimit(kind),413,'MEDIA_TOO_LARGE',kind==='garage_music'?'MP3 maksimum 20 MiB.':'JPEG maksimum 10 MiB.');
  return kind==='garage_music'?mp3(input):jpeg(input);
}
