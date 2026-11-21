import type {CarId} from './types.js';

/** Small normalized photos used only in the vehicle collection/admin cards. */
export interface VehicleThumbnail {
  id:string;
  url:string;
  mimeType:'image/webp';
  bytes:number;
  width:number;
  height:number;
}
export interface VehicleThumbnailSlot {
  carId:CarId;
  /** Separate from catalogVersion: changing a photo never changes a purchase quote. */
  version:number;
  thumbnail:VehicleThumbnail|null;
}
export interface VehicleThumbnailLimits {
  inputBytes:number;
  inputPixels:number;
  maxWidth:number;
  maxHeight:number;
  outputBytes:number;
  acceptedMimeTypes:readonly string[];
}
export interface VehicleThumbnailAdmin {
  cars:VehicleThumbnailSlot[];
  limits:VehicleThumbnailLimits;
}
export const VEHICLE_THUMBNAIL_LIMITS:Readonly<VehicleThumbnailLimits>=Object.freeze({
  inputBytes:4*1024*1024,inputPixels:16_000_000,maxWidth:512,maxHeight:288,outputBytes:512*1024,
  acceptedMimeTypes:Object.freeze(['image/jpeg','image/png','image/webp']),
});
