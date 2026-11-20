/** Shared development listener regression: actual Vite HMR and Colyseus sockets.
 * Run: node tests/with-postgres.mjs tests/dev-runtime.ts
 * No browser or production configuration is required. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Client,type Room} from '@colyseus/sdk';
import WebSocket from 'ws';
import {createApplication} from '../server/index.js';
import type {RoomSnapshot} from '../shared/types.js';

const databaseUrl=process.env.TEST_DATABASE_URL;
assert(databaseUrl&&/test/i.test(new URL(databaseUrl).pathname),'Use the isolated PostgreSQL test wrapper.');
const delay=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
async function waitFor(check:()=>boolean,label:string){const deadline=Date.now()+6000;while(!check()){if(Date.now()>deadline)throw new Error('Timeout: '+label);await delay(15);}}
const application=await createApplication({databaseUrl,development:true,serveClient:true,secureCookies:false,prayerNow:()=>new Date('2026-11-20T03:00:00.000Z')});
const rooms:Room[]=[];let hmr:WebSocket|undefined,ping:WebSocket|undefined;let closed=false;
try{
 await application.listen(0,'127.0.0.1');const address=application.httpServer.address();assert(address&&typeof address==='object');const origin='http://127.0.0.1:'+address.port;
 const shell=await fetch(origin+'/');assert.equal(shell.status,200);assert.match(await shell.text(),/\/@vite\/client/);
 const source=await (await fetch(origin+'/@vite/client')).text(),token=source.match(/const wsToken = ("[^"\r\n]+");/);
 assert(token,'Vite injects its HMR authentication token');
 const url=origin.replace('http:','ws:')+'/?token='+encodeURIComponent(JSON.parse(token[1]!));
 const received:unknown[]=[];let hmrError:Error|undefined;
 hmr=new WebSocket(url,'vite-hmr',{headers:{Origin:origin}});
 hmr.on('error',error=>{hmrError=error;});hmr.on('message',raw=>{try{received.push(JSON.parse(raw.toString()));}catch{received.push(raw.toString());}});
 await waitFor(()=>received.some(value=>(value as any)?.type==='connected')||!!hmrError,'HMR connected payload');assert.ifError(hmrError);
 assert(received.some(value=>(value as any)?.type==='connected'),'Vite owns the vite-hmr upgrade');

 async function entrant(index:number){
  const auth=await application.services.accounts.register({email:`hmr-${index}-${randomUUID()}@example.test`,displayName:'HMR Driver '+index,password:'Fixture-'+randomUUID()+'!'});
  const cookie='uv_session='+auth.sessionToken,session=await application.services.accounts.authenticateSession({cookie});assert(session);
  const ticket=await application.services.accounts.issueRaceTicket(session);return{client:new Client(origin,{headers:{cookie,origin}}),ticket:ticket.ticket};
 }
 const host=await entrant(1),peer=await entrant(2);
 const room=await host.client.create('race',{ticket:host.ticket,maxHumans:2,bots:0,laps:1,loadout:{carId:'brz',color:'#2866b8',finish:'metallic',rimId:'stock'}});rooms.push(room);
 let latest:RoomSnapshot|undefined;room.onMessage('snapshot',(snapshot:RoomSnapshot)=>{latest=snapshot;});room.onMessage('room_error',()=>{});room.onMessage('result',()=>{});room.onMessage('pong',()=>{});room.send('sync');
 const other=await peer.client.joinById(room.roomId,{ticket:peer.ticket,loadout:{carId:'brz',color:'#2866b8',finish:'metallic',rimId:'stock'}});rooms.push(other);
 other.onMessage('snapshot',()=>{});other.onMessage('room_error',()=>{});other.onMessage('result',()=>{});other.onMessage('pong',()=>{});other.send('sync');
 await waitFor(()=>latest?.members.length===2,'two real Colyseus clients');
 await delay(1200);assert.equal(hmr.readyState,WebSocket.OPEN,'HMR is not routed into Colyseus ping utility');assert.equal(rooms.every(room=>room.connection.isOpen),true);
 const health=await fetch(origin+'/api/health');assert.equal(health.status,200);assert.equal((await health.json()).ok,true);
 ping=new WebSocket(origin.replace('http:','ws:')+'/','vite-ping',{headers:{Origin:origin}});let pingClosed=false,pingError:Error|undefined;
 ping.on('error',error=>{pingError=error;});ping.on('close',()=>{pingClosed=true;});await waitFor(()=>pingClosed||!!pingError,'Vite ping handshake');assert.ifError(pingError);
 console.info('PASS development HTTP, authenticated Vite HMR, vite-ping and two Colyseus clients share one port');

 const hmrClosed=new Promise<void>(resolve=>hmr!.once('close',()=>resolve()));
 for(const room of rooms){room.reconnection.enabled=false;await room.leave();}
 const shutdown=application.close();await Promise.race([shutdown,new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('Shared listener shutdown timed out')),5000).unref())]);closed=true;
 await hmrClosed;assert.equal(application.httpServer.listening,false,'Shared HTTP listener is explicitly closed');
 await assert.rejects(fetch(origin+'/api/health',{signal:AbortSignal.timeout(1000)}));
 console.info('PASS shutdown closes HMR sockets and the shared HTTP listener');
}catch(error){process.exitCode=1;console.error(error instanceof Error?error.stack:error);}
finally{
 for(const room of rooms){room.reconnection.enabled=false;if(room.connection.isOpen)await room.leave().catch(()=>{});}
 hmr?.terminate();ping?.terminate();if(!closed)await application.close();
}
