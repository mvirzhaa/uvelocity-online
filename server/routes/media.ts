import { raw } from 'express';
import type { Request, RequestHandler, Response, Router } from 'express';
import type { BackendServices } from '../services/index.js';
import type { AuthSession } from '../services/accounts.js';
import { mediaByteLimit, mediaKind } from '../services/media-validation.js';
import { assert, ServiceError } from '../services/errors.js';

const route=(handler:(req:Request,res:Response)=>Promise<unknown>):RequestHandler=>(req,res,next)=>{Promise.resolve(handler(req,res)).catch(next);};
const actor=(res:Response)=>(res.locals.auth as AuthSession).id;
export function isMediaUpload(req:Request):boolean {
  // Explicit presentation-upload exception to JSON bodies; security middleware still runs.
  return req.method==='POST'&&/^\/admin\/media\/(garage_music|loading_image)\/?$/.test(req.path);
}

function range(value:string,size:number):{start:number;end:number}|null {
  const match=/^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if(!match||(!match[1]&&!match[2]))return null;
  if(!match[1]) {
    const suffix=Number(match[2]);
    if(!Number.isSafeInteger(suffix)||suffix<=0)return null;
    return {start:Math.max(0,size-suffix),end:size-1};
  }
  const start=Number(match[1]),end=match[2]?Number(match[2]):size-1;
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start)return null;
  return {start,end:Math.min(size-1,end)};
}

export function installMediaRoutes(router:Router,services:BackendServices,middleware:{authenticated:RequestHandler;administrator:RequestHandler;gameplayAllowed:RequestHandler}):void {
  const {media,accounts}=services,{authenticated,administrator,gameplayAllowed}=middleware;
  router.get('/presentation',route(async(_req,res)=>{res.json(await media.getPresentation());}));
  router.get('/admin/media',authenticated,administrator,route(async(_req,res)=>{res.json(await media.list(actor(res)));}));

  const binary:RequestHandler=(req,res,next)=>{
    try {
      const kind=mediaKind(req.params.kind),type=kind==='garage_music'?'audio/mpeg':'image/jpeg';
      assert(req.is(type),415,'MEDIA_TYPE_REQUIRED',`Gunakan Content-Type ${type}.`);
      assert(!req.get('content-encoding')||req.get('content-encoding')==='identity',415,'MEDIA_ENCODING_UNSUPPORTED','Unggah berkas asli tanpa kompresi HTTP.');
      raw({type:()=>true,limit:mediaByteLimit(kind),inflate:false})(req,res,error=>{
        if(error?.type==='entity.too.large')next(new ServiceError(413,'MEDIA_TOO_LARGE',kind==='garage_music'?'MP3 maksimum 20 MiB.':'JPEG maksimum 10 MiB.'));
        else next(error);
      });
    } catch(error) {next(error);}
  };
  const uploadThrottle:RequestHandler=(_req,res,next)=>{accounts.throttle('media-upload',actor(res),40).then(()=>next(),next);};
  router.post('/admin/media/:kind',authenticated,administrator,gameplayAllowed,uploadThrottle,binary,route(async(req,res)=>{
    res.status(201).json(await media.upload(actor(res),req.params.kind,req.query.name,req.body,req.get('content-type')));
  }));
  router.put('/admin/presentation',authenticated,administrator,gameplayAllowed,route(async(req,res)=>{res.json(await media.updatePresentation(actor(res),req.body));}));
  router.delete('/admin/media/:id',authenticated,administrator,gameplayAllowed,route(async(req,res)=>{res.json(await media.remove(actor(res),req.params.id,req.body));}));

  const deliver=route(async(req,res)=>{
    const {asset,etag}=await media.describe(req.params.id);
    const common=()=>{
      res.set({'Cache-Control':'public, max-age=31536000, immutable','Content-Type':asset.mimeType,'X-Content-Type-Options':'nosniff',
        'Cross-Origin-Resource-Policy':'same-origin','Accept-Ranges':'bytes',ETag:etag,'Last-Modified':new Date(asset.createdAt).toUTCString(),
        'Content-Disposition':`inline; filename="${asset.id}.${asset.kind==='garage_music'?'mp3':'jpg'}"`});
    };
    if(req.get('if-none-match')?.split(',').some(item=>item.trim()==='*'||item.trim().replace(/^W\//,'')===etag)) {
      common();res.status(304).end();return;
    }
    let selected={start:0,end:asset.bytes-1},partial=false;
    const requested=req.get('range'),ifRange=req.get('if-range');
    // A changed validator means the browser must receive the complete current representation.
    if(requested&&(!ifRange||ifRange===etag||(!ifRange.startsWith('"')&&!ifRange.startsWith('W/')&&Date.parse(ifRange)>=Math.floor(Date.parse(asset.createdAt)/1000)*1000))) {
      const parsed=range(requested,asset.bytes);
      if(!parsed){res.set({'Content-Range':`bytes */${asset.bytes}`,'Accept-Ranges':'bytes'}).status(416).end();return;}
      selected=parsed;partial=true;
    }
    const content=req.method==='HEAD'?null:await media.read(asset.id,selected.start,selected.end);
    common();res.set('Content-Length',String(selected.end-selected.start+1));
    if(partial)res.set('Content-Range',`bytes ${selected.start}-${selected.end}/${asset.bytes}`).status(206);
    else res.status(200);
    res.end(content);
  });
  router.head('/media/:id',deliver);
  router.get('/media/:id',deliver);
}
