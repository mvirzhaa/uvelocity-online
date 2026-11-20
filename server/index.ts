import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import http from 'node:http';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {Server} from '@colyseus/core';
import {WebSocketTransport} from '@colyseus/ws-transport';
import {createPool} from './db/pool.js';
import {migrate} from './db/migrate.js';
import {createServices} from './services/index.js';
import {createApiRouter} from './routes/index.js';
import {registerRaceRooms} from './realtime/index.js';
import type {RealtimeOptions} from './realtime/index.js';

export interface ApplicationOptions {databaseUrl?:string;allowedOrigins?:string[];secureCookies?:boolean;serveClient?:boolean;development?:boolean;realtime?:RealtimeOptions;abortInterrupted?:boolean}
export async function createApplication(options:ApplicationOptions={}){
 const pool=createPool(options.databaseUrl),services=createServices(pool);
 await migrate(pool);
 if(options.abortInterrupted!==false)await services.economy.abortInterruptedRaces();
 const app=express(),httpServer=http.createServer(app);
 const development=options.development??process.env.NODE_ENV!=='production';
 const origins=options.allowedOrigins??(process.env.ALLOWED_ORIGINS||process.env.APP_ORIGIN||'http://localhost:3000').split(',').map(s=>s.trim()).filter(Boolean);
 const secureCookies=options.secureCookies??(process.env.COOKIE_SECURE!==undefined?process.env.COOKIE_SECURE==='true':process.env.NODE_ENV==='production');
 app.disable('x-powered-by');
 if(process.env.TRUST_PROXY==='1')app.set('trust proxy',1);
 app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'",...(development?["'unsafe-inline'"]:[])],styleSrc:["'self'","'unsafe-inline'"],imgSrc:["'self'",'data:','blob:'],fontSrc:["'self'",'data:'],connectSrc:["'self'",'blob:',...origins.map(o=>o.replace(/^http/,'ws'))],frameSrc:["'self'"],frameAncestors:["'self'"],objectSrc:["'none'"],baseUri:["'self'"],formAction:["'self'"],upgradeInsecureRequests:secureCookies?[]:null}},crossOriginEmbedderPolicy:false,crossOriginResourcePolicy:{policy:'same-origin'},referrerPolicy:{policy:'same-origin'},strictTransportSecurity:secureCookies?undefined:false}));
 app.use(express.json({limit:'32kb'}));
 app.get('/api/health',async(_req,res)=>{try{await pool.query('SELECT 1');res.json({ok:true,application:'UVelocity',database:'postgresql'});}catch{res.status(503).json({ok:false,message:'Database belum siap.'});}});
 const sharedDevelopmentServer=development&&options.serveClient!==false;
 // Vite owns its HMR/ping upgrades. An unfiltered Colyseus transport would
 // complete a second handshake on the same socket and corrupt the WS frames.
 const transport=sharedDevelopmentServer
  ?new WebSocketTransport({noServer:true}).attachToServer(httpServer,{filter:request=>!['vite-hmr','vite-ping'].includes(String(request.headers['sec-websocket-protocol']??''))})
  :new WebSocketTransport({server:httpServer});
 const realtimeServer=new Server({transport,greet:false});
 const rooms=registerRaceRooms(realtimeServer,{
  consumeRaceTicket:input=>services.accounts.consumeRaceTicket(input),
  authenticate:headers=>services.accounts.authenticateSession(headers),
  resolveLoadout:(userId,selection,version)=>services.economy.resolveLoadout(userId,selection,version),
  getActiveRuleset:()=>services.economy.getActiveRuleset(),
  beginRace:input=>services.economy.beginRace(input),
  finalizeRace:result=>services.economy.finalizeRace(result),
  abortRace:(raceId,reason)=>services.economy.abortRace(raceId,reason),
  log:(message,error)=>console.error(message,error instanceof Error?error.message:undefined)
 },options.realtime);
 app.get('/api/rooms/:code',async(req,res,next)=>{try{const user=await services.accounts.authenticateSession(req.headers);if(!user){res.status(401).json({error:{code:'AUTH_REQUIRED',message:'Masuk untuk bergabung ke ruang balapan.'}});return;}await services.accounts.throttle('invite-lookup',user.id,120);const room=rooms.findByCode(String(req.params.code));if(!room){res.status(404).json({error:{code:'ROOM_NOT_FOUND',message:'Kode ruang tidak ditemukan atau ruang sudah ditutup.'}});return;}res.json(room);}catch(e){next(e);}});
 app.use('/api',createApiRouter({services,allowedOrigins:origins,secureCookies}));
 app.use('/api',(_req,res)=>res.status(404).json({error:{code:'NOT_FOUND',message:'Halaman API tidak ditemukan.'}}));
 let vite:{close:()=>Promise<void>}|undefined;
 if(options.serveClient!==false){
  if(development){const {createServer}=await import('vite');const devServer=await createServer({configFile:path.resolve('vite.config.ts'),server:{middlewareMode:true,hmr:{server:httpServer}}});vite=devServer;app.use(devServer.middlewares);}
  else{const publicRoot=path.resolve('dist/client');app.use(express.static(publicRoot,{maxAge:'1h',index:false,setHeaders(res,file){if(file.endsWith('.html'))res.setHeader('Cache-Control','no-cache');}}));app.get('*',(req,res)=>{if(path.extname(req.path)){res.status(404).end();return;}res.sendFile(path.join(publicRoot,'index.html'));});}
 }
 app.use((error:any,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{const badJson=error instanceof SyntaxError&&(error as any).status===400;res.status(badJson?400:500).json({error:{code:badJson?'INVALID_JSON':'INTERNAL_ERROR',message:badJson?'Format JSON tidak valid.':'Permintaan belum berhasil. Coba kembali.'}});if(!badJson)console.error('Application request error',error?.name);});
 let closed=false;
 return {app,httpServer,realtimeServer,pool,services,rooms,async listen(port:number,hostname='0.0.0.0'){await realtimeServer.listen(port,hostname);},async close(){
  if(closed)return;closed=true;await realtimeServer.gracefullyShutdown(false);await vite?.close();
  // attachToServer deliberately leaves an externally owned HTTP server open.
  // This application owns it, so close it after both WS consumers have stopped.
  if(sharedDevelopmentServer&&httpServer.listening)await new Promise<void>((resolve,reject)=>httpServer.close(error=>error?reject(error):resolve()));
  await pool.end();
 }};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const application=await createApplication();const port=Number(process.env.PORT||3000);await application.listen(port);console.log(`UVelocity is ready at ${process.env.APP_ORIGIN||'http://localhost:'+port}`);
 const stop=async()=>{await application.close();process.exitCode=0;};process.once('SIGINT',stop);process.once('SIGTERM',stop);
}
