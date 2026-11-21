/** Shared API contract for administrator-managed, same-origin presentation assets. */
export type MediaKind = 'garage_music' | 'loading_image';
export interface MediaAsset {
  id:string;
  kind:MediaKind;
  name:string;
  url:string;
  mimeType:'audio/mpeg'|'image/jpeg';
  bytes:number;
  durationSeconds:number|null;
  width:number|null;
  height:number|null;
  createdAt:string;
}
export interface PresentationSettings {
  version:number;
  garageMusic:MediaAsset|null;
  loadingImage:MediaAsset|null;
  musicVolume:number;
}
export interface PresentationUpdate {
  expectedVersion:number;
  garageMusicId:string|null;
  loadingImageId:string|null;
  musicVolume:number;
  reason:string;
}
export interface MediaLimits {
  garageMusicBytes:number;
  loadingImageBytes:number;
  maxAssets:number;
  totalBytes:number;
}
export interface AdminMediaLibrary {
  assets:MediaAsset[];
  settings:PresentationSettings;
  limits:MediaLimits;
}
export const MEDIA_LIMITS:Readonly<MediaLimits> = Object.freeze({
  garageMusicBytes:20*1024*1024,
  loadingImageBytes:10*1024*1024,
  maxAssets:40,
  totalBytes:250*1024*1024,
});
