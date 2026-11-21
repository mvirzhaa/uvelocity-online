import {raw} from 'express';
import type {Request,RequestHandler,Response,Router} from 'express';
import {VEHICLE_THUMBNAIL_LIMITS as LIMITS} from '../../shared/vehicle-thumbnails.js';
import type {BackendServices} from '../services/index.js';
import type {AuthSession} from '../services/accounts.js';
import {thumbnailCarId} from '../services/vehicle-thumbnails.js';
import {assert,ServiceError} from '../services/errors.js';

const actor=(res:Response)=>(res.locals.auth as AuthSession).id;
const route=(handler:(req:Request,res:Response)=>Promise<unknown>):RequestHandler=>(req,res,next)=>{Promise.resolve(handler(req,res)).catch(next);};
export function isVehicleThumbnailUpload(req:Request):boolean {
  return req.method==='POST'&&/^\/admin\/vehicle-thumbnails\/[a-z0-9-]{1,40}\/?$/.test(req.path);
}
export function installVehicleThumbnailRoutes(router:Router,services:BackendServices,middleware:{authenticated:RequestHandler;administrator:RequestHandler;gameplayAllowed:RequestHandler}):void {
  const {vehicleThumbnails,accounts}=services,{authenticated,administrator,gameplayAllowed}=middleware;
  const throttle:RequestHandler=(_req,res,next)=>{accounts.throttle('vehicle-thumbnail-upload',actor(res),40).then(()=>next(),next);};
  const binary:RequestHandler=(req,res,next)=>{
    try{
      thumbnailCarId(req.params.carId);
      assert(LIMITS.acceptedMimeTypes.some(type=>req.is(type)),415,'THUMBNAIL_TYPE_REQUIRED','Gunakan Content-Type image/jpeg, image/png, atau image/webp.');
      assert(!req.get('content-encoding')||req.get('content-encoding')==='identity',415,'THUMBNAIL_ENCODING_UNSUPPORTED','Unggah foto asli tanpa kompresi HTTP.');
      raw({type:()=>true,limit:LIMITS.inputBytes,inflate:false})(req,res,error=>{
        if(error?.type==='entity.too.large')next(new ServiceError(413,'THUMBNAIL_TOO_LARGE','Foto kendaraan maksimum 4 MiB.'));
        else next(error);
      });
    }catch(error){next(error);}
  };
  router.get('/admin/vehicle-thumbnails',authenticated,administrator,route(async(_req,res)=>{res.json(await vehicleThumbnails.list(actor(res)));}));
  router.post('/admin/vehicle-thumbnails/:carId',authenticated,administrator,gameplayAllowed,throttle,binary,route(async(req,res)=>{
    res.status(201).json(await vehicleThumbnails.replace(actor(res),req.params.carId,req.query.expectedVersion,req.query.reason,req.body,req.get('content-type')));
  }));
  router.delete('/admin/vehicle-thumbnails/:carId',authenticated,administrator,gameplayAllowed,route(async(req,res)=>{res.json(await vehicleThumbnails.remove(actor(res),req.params.carId,req.body));}));
  const deliver=route(async(req,res)=>{
    const value=await vehicleThumbnails.read(req.params.id,req.method!=='HEAD'),asset=value.thumbnail;
    res.set({'Content-Type':'image/webp','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin',
      'Cache-Control':'public, max-age=31536000, immutable','ETag':value.etag,'Last-Modified':new Date(value.createdAt).toUTCString(),
      'Content-Disposition':`inline; filename="${asset.id}.webp"`});
    if(req.get('if-none-match')?.split(',').some(item=>item.trim()==='*'||item.trim().replace(/^W\//,'')===value.etag)) {res.status(304).end();return;}
    res.set('Content-Length',String(asset.bytes)).status(200).end(value.content);
  });
  router.head('/vehicle-thumbnails/:id',deliver);router.get('/vehicle-thumbnails/:id',deliver);
}
