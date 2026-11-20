import { Router } from 'express';
import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';
import type { BackendServices } from '../services/index.js';
import { SESSION_COOKIE, verifyCsrf } from '../services/accounts.js';
import type { AuthResult, AuthSession } from '../services/accounts.js';
import { assert, ServiceError } from '../services/errors.js';
import { PrayerBreakError } from '../services/prayer.js';
import { PRAYER_CITIES } from '../../shared/prayer.js';

export interface ApiRouterOptions { services:BackendServices; allowedOrigins:readonly string[]; secureCookies?:boolean }
type AsyncHandler=(req:Request,res:Response)=>Promise<unknown>;
function route(handler:AsyncHandler):RequestHandler {
  return (req,res,next)=>{Promise.resolve(handler(req,res)).catch(next);};
}
function auth(res:Response):AuthSession { return res.locals.auth as AuthSession; }

export function createApiRouter({services,allowedOrigins,secureCookies=process.env.NODE_ENV==='production'}:ApiRouterOptions):Router {
  assert(allowedOrigins.length>0,500,'CONFIGURATION_ERROR','At least one allowed browser origin is required.');
  const origins=new Set(allowedOrigins.map(origin=>{
    const parsed=new URL(origin);
    if (!['http:','https:'].includes(parsed.protocol)||parsed.origin!==origin) throw new Error('Allowed origins must be exact HTTP(S) origins without a path.');
    return origin;
  }));
  const router=Router(),{accounts,economy,admin,prayer}=services;
  const cookieOptions={httpOnly:true,secure:secureCookies,sameSite:'lax' as const,path:'/'};
  function setSession(res:Response,result:AuthResult):void {
    res.cookie(SESSION_COOKIE,result.sessionToken,{...cookieOptions,expires:new Date(result.expiresAt)});
  }
  router.use((req,res,next)=>{
    res.setHeader('Cache-Control','no-store');
    if (!['GET','HEAD','OPTIONS'].includes(req.method)) {
      const origin=req.get('origin');
      if (!origin||!origins.has(origin)) return next(new ServiceError(403,'ORIGIN_REJECTED','Origin permintaan tidak diizinkan.'));
      if (!req.is('application/json')) return next(new ServiceError(415,'JSON_REQUIRED','Kirim permintaan sebagai application/json.'));
      if (req.get('sec-fetch-site')==='cross-site') return next(new ServiceError(403,'ORIGIN_REJECTED','Permintaan lintas situs tidak diizinkan.'));
    }
    next();
  });
  // A middleware wrapper must explicitly continue after its async authentication work.
  const authenticated:RequestHandler=(req,res,next)=>{
    Promise.resolve((async()=>{
      const session=await accounts.authenticateSession(req.headers);
      assert(session,401,'AUTH_REQUIRED','Masuk ke akun untuk melanjutkan.');
      if (!['GET','HEAD','OPTIONS'].includes(req.method)) assert(verifyCsrf(session,req.get('x-csrf-token')),403,'CSRF_REJECTED','Token keamanan tidak valid. Muat ulang halaman.');
      res.locals.auth=session;
    })()).then(()=>next(),next);
  };
  const administrator:RequestHandler=(_req,res,next)=>{try{assert(auth(res).role==='admin',403,'ADMIN_REQUIRED','Akses administrator diperlukan.');next();}catch(error){next(error);}};
  const gameplayAllowed:RequestHandler=(_req,res,next)=>{
    prayer.assertGameplayAllowed(auth(res).id).then(()=>next(),next);
  };

  router.get('/auth/me',route(async(req,res)=>{
    const session=await accounts.authenticateSession(req.headers);
    if (!session) {res.json({user:null,csrfToken:null});return;}
    const {csrfToken,sessionHash:_,expiresAt:__,...user}=session;
    res.json({user,csrfToken});
  }));
  router.post('/auth/register',route(async(req,res)=>{
    await accounts.throttle('register-ip',req.ip??req.socket.remoteAddress??'unknown',10);
    const result=await accounts.register(req.body);
    await accounts.logout(req.headers);
    setSession(res,result);res.status(201).json({user:result.user,csrfToken:result.csrfToken});
  }));
  router.post('/auth/login',route(async(req,res)=>{
    await accounts.throttle('login-ip',req.ip??req.socket.remoteAddress??'unknown',40);
    const result=await accounts.login(req.body);
    await accounts.logout(req.headers);
    setSession(res,result);res.json({user:result.user,csrfToken:result.csrfToken});
  }));
  router.post('/auth/logout',authenticated,route(async(req,res)=>{
    await accounts.logout(req.headers);res.clearCookie(SESSION_COOKIE,cookieOptions);res.json({ok:true});
  }));
  router.get('/prayer/status',route(async(req,res)=>{
    const session=await accounts.authenticateSession(req.headers);
    res.json(await prayer.status(session?.id??null));
  }));
  router.get('/prayer/locations',route(async(_req,res)=>{res.json({locations:PRAYER_CITIES});}));
  router.put('/prayer/location',authenticated,route(async(req,res)=>{res.json(await prayer.setLocation(auth(res).id,req.body));}));
  router.get('/catalog',route(async(_req,res)=>{res.json(await economy.getCatalog());}));
  router.get('/profile',authenticated,route(async(_req,res)=>{res.json(await economy.getProfile(auth(res).id));}));
  router.patch('/profile',authenticated,route(async(req,res)=>{res.json(await accounts.updateProfile(auth(res).id,req.body));}));
  router.get('/wallet/transactions',authenticated,route(async(req,res)=>{res.json(await economy.getLedger(auth(res).id,req.query.limit??30));}));
  router.post('/shop/purchase',authenticated,gameplayAllowed,route(async(req,res)=>{res.json(await economy.purchase(auth(res).id,req.body,req.get('idempotency-key')));}));
  router.put('/loadout',authenticated,gameplayAllowed,route(async(req,res)=>{res.json(await economy.saveLoadout(auth(res).id,req.body));}));
  router.post('/garage/appearance/quote',authenticated,gameplayAllowed,route(async(req,res)=>{await accounts.throttle('appearance-quote',auth(res).id,300);res.json(await economy.quoteAppearance(auth(res).id,req.body));}));
  router.post('/garage/appearance/apply',authenticated,gameplayAllowed,route(async(req,res)=>{res.json(await economy.applyAppearance(auth(res).id,req.body,req.get('idempotency-key')));}));
  router.post('/race/ticket',authenticated,gameplayAllowed,route(async(_req,res)=>{res.json(await accounts.issueRaceTicket(auth(res)));}));
  router.get('/admin/users',authenticated,administrator,route(async(req,res)=>{res.json(await admin.listUsers(auth(res).id,req.query.q??'',req.query.limit??30));}));
  router.get('/admin/audit',authenticated,administrator,route(async(req,res)=>{res.json(await admin.getAudit(auth(res).id,req.query.limit??50));}));
  router.get('/admin/tuning',authenticated,administrator,route(async(_req,res)=>{res.json(await admin.getTuning(auth(res).id));}));
  router.post('/admin/topups',authenticated,administrator,gameplayAllowed,route(async(req,res)=>{res.json(await admin.topup(auth(res).id,req.body,req.get('idempotency-key')));}));
  router.patch('/admin/catalog/:itemId',authenticated,administrator,gameplayAllowed,route(async(req,res)=>{res.json(await admin.updateCatalog(auth(res).id,String(req.params.itemId),req.body));}));
  router.post('/admin/tuning/publish',authenticated,administrator,gameplayAllowed,route(async(req,res)=>{res.json(await admin.publishTuning(auth(res).id,req.body));}));
  router.post('/admin/rewards/publish',authenticated,administrator,gameplayAllowed,route(async(req,res)=>{res.json(await admin.publishTuning(auth(res).id,req.body));}));

  const handleError:ErrorRequestHandler=(error:unknown,_req:Request,res:Response,_next:NextFunction)=>{
    if (error instanceof PrayerBreakError) {res.status(error.status).json({error:{code:error.code,message:error.message,status:error.prayerStatus}});return;}
    if (error instanceof ServiceError) {res.status(error.status).json({error:{code:error.code,message:error.message}});return;}
    const code=(error as {code?:string})?.code;
    if (code==='23505') {res.status(409).json({error:{code:'CONFLICT',message:'Operasi bertentangan dengan data yang sudah ada.'}});return;}
    console.error('UVelocity API request failed', {name:(error as Error)?.name,code});
    res.status(500).json({error:{code:'INTERNAL_ERROR',message:'Operasi belum berhasil. Coba lagi dengan kunci permintaan yang sama.'}});
  };
  router.use(handleError);
  return router;
}
