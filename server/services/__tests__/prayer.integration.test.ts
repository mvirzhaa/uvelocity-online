import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { once } from 'node:events';
import type { Server } from 'node:http';
import pg from 'pg';
import express from 'express';
import { CalculationMethod, Coordinates, PrayerTimes, Rounding } from 'adhan';
import { migrate } from '../../db/migrate.js';
import { createServices, type BackendServices } from '../index.js';
import { PrayerService, validatePrayerLocation } from '../prayer.js';
import { createApiRouter } from '../../routes/index.js';
import { PRAYER_CITIES, type PrayerName, type PrayerStatus } from '../../../shared/prayer.js';
import type { AuthResult } from '../accounts.js';

const connectionString=process.env.TEST_DATABASE_URL;
assert(connectionString&&/test/i.test(new URL(connectionString).pathname),'Use the native PostgreSQL test wrapper.');
const schema=`uv_prayer_${process.pid}`,control=new pg.Pool({connectionString,max:2});
let pool:pg.Pool,services:BackendServices,http:Server,base:string;
const clearTime=new Date('2026-11-20T03:00:00.000Z');
let now=new Date(clearTime);
const origin='http://127.0.0.1:43991',password='Prayer-Fixture-Only-2026!';
const isCode=(code:string)=>(error:unknown)=>(error as {code?:string})?.code===code;

before(async()=>{
  await control.query(`CREATE SCHEMA ${schema}`);
  pool=new pg.Pool({connectionString,options:`-c search_path=${schema}`,max:12});
  assert.equal((await migrate(pool)).length,14);
  services=createServices(pool,{prayerNow:()=>new Date(now)});
  const app=express();app.use(express.json({limit:'32kb'}));app.use('/api',createApiRouter({services,allowedOrigins:[origin],secureCookies:false}));
  http=app.listen(0,'127.0.0.1');await once(http,'listening');
  const address=http.address();assert(address&&typeof address==='object');base=`http://127.0.0.1:${address.port}/api`;
});
after(async()=>{
  if(http)await new Promise<void>((resolve,reject)=>http.close(error=>error?reject(error):resolve()));
  if(pool)await pool.end();await control.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await control.end();
});
async function user(label:string):Promise<AuthResult> {
  return services.accounts.register({email:`${label.toLowerCase().replace(/[^a-z0-9]/g,'-')}-${randomUUID()}@example.test`,displayName:label,password});
}
async function request(path:string,options:{method?:string;body?:unknown;user?:AuthResult;csrf?:string;key?:string}={}) {
  const headers:Record<string,string>={Origin:origin,'Content-Type':'application/json'};
  if(options.user){headers.Cookie=`uv_session=${options.user.sessionToken}`;headers['X-CSRF-Token']=options.csrf??options.user.csrfToken;}
  if(options.key)headers['Idempotency-Key']=options.key;
  const response=await fetch(base+path,{method:options.method??'GET',headers,...(options.body!==undefined?{body:JSON.stringify(options.body)}:{})});
  return{response,body:await response.json() as any};
}
function prayer(status:PrayerStatus,name:PrayerName){const value=status.dailyTimes.find(window=>window.prayer===name);assert(value);return value;}

test('all five calculated prayer windows begin exactly at adhan and end exactly 15 minutes later',async()=>{
  const day=await services.prayer.status(null,clearTime);
  assert.equal(day.location.cityId,'jakarta');assert.equal(day.dailyTimes.length,5);assert(day.allowed);
  assert.deepEqual(day.dailyTimes.map(window=>window.prayer),['fajr','dhuhr','asr','maghrib','isha']);
  for(const window of day.dailyTimes){
    const start=Date.parse(window.startedAt),end=Date.parse(window.resumesAt);assert.equal(end-start,900_000);
    assert.equal((await services.prayer.status(null,new Date(start-1))).allowed,true);
    const active=await services.prayer.status(null,new Date(start));assert.equal(active.currentPrayer?.eventId,window.eventId);assert.equal(active.paused,true);
    assert.equal((await services.prayer.status(null,new Date(end-1))).paused,true);
    assert.equal((await services.prayer.status(null,new Date(end))).allowed,true);
  }
  // Catch a preset's built-in Dhuhr offset being accidentally added twice.
  const params=CalculationMethod.Other();params.fajrAngle=20;params.ishaAngle=18;params.rounding=Rounding.Up;
  const raw=new PrayerTimes(new Coordinates(-6.2088,106.8456),new Date(2026,10,20,12),params);
  for(const window of day.dailyTimes)assert.equal(Date.parse(window.startedAt)-raw[window.prayer].getTime(),120_000);
  assert.equal(day.calculation.official,false);
});

test('city timezone lookup preserves WIB/WITA/WIT names and schedules use the player local calendar date',async()=>{
  for(const city of PRAYER_CITIES)assert.equal(validatePrayerLocation({mode:'manual',cityId:city.id}).timezone,city.timezone,city.name);
  now=new Date(clearTime);const jakarta=await user('Jakarta'),jayapura=await user('Jayapura');
  await services.prayer.setLocation(jayapura.user.id,{mode:'manual',cityId:'jayapura'});
  const boundary=new Date('2026-11-20T16:30:00.000Z');
  const west=await services.prayer.status(jakarta.user.id,boundary),east=await services.prayer.status(jayapura.user.id,boundary);
  assert.equal(west.localDate,'2026-11-20');assert.equal(east.localDate,'2026-11-21');
  assert.equal(west.location.timezone,'Asia/Jakarta');assert.equal(east.location.timezone,'Asia/Jayapura');
  assert(Date.parse(west.nextPrayer.startedAt)>boundary.getTime());assert(Date.parse(east.nextPrayer.startedAt)>boundary.getTime());
  assert.equal(validatePrayerLocation({mode:'manual',latitude:40.71,longitude:-74.01}).timezone,'America/New_York');
});

test('two players in different cities receive independent windows rather than a global city union',async()=>{
  now=new Date(clearTime);const west=await user('West'),east=await user('East');
  await services.prayer.setLocation(east.user.id,{mode:'manual',cityId:'jayapura'});
  const start=prayer(await services.prayer.status(west.user.id),'dhuhr');now=new Date(start.startedAt);
  const [a,b]=await Promise.all([services.prayer.status(west.user.id),services.prayer.status(east.user.id)]);
  assert.equal(a.paused,true);assert.equal(b.allowed,true);assert.notEqual(a.nextPrayer.startedAt,b.nextPrayer.startedAt);
});

test('location inputs reject forged timezone/end times and retain only rounded latest coordinates',async()=>{
  now=new Date(clearTime);const account=await user('Coordinates');
  for(const input of [
    {mode:'gps',latitude:91,longitude:106},{mode:'gps',latitude:-6,longitude:181},
    {mode:'gps',latitude:'-6',longitude:106},{mode:'gps',latitude:NaN,longitude:106},
    {mode:'manual',cityId:'not-a-city'},{mode:'fallback',timezone:'UTC'},
    {mode:'gps',latitude:-6,longitude:106,resumesAt:'2000-01-01'},
    {mode:'manual',cityId:'bogor',latitude:-6,longitude:106},{mode:'off'},
  ])await assert.rejects(services.prayer.setLocation(account.user.id,input),isCode('INVALID_LOCATION'));
  const first=await services.prayer.setLocation(account.user.id,{mode:'gps',latitude:-6.208765,longitude:106.845678});
  assert.equal(first.location.latitude,-6.21);assert.equal(first.location.longitude,106.85);
  await services.prayer.setLocation(account.user.id,{mode:'gps',latitude:-8.65345,longitude:115.21876});
  const row=await pool.query('SELECT latitude::float8,longitude::float8,timezone FROM user_prayer_state WHERE user_id=$1',[account.user.id]);
  assert.equal(row.rowCount,1);assert.deepEqual(row.rows[0],{latitude:-8.65,longitude:115.22,timezone:'Asia/Makassar'});
});

test('changing location before the first poll latches the old prayer and restart/relogin cannot shorten it',async()=>{
  now=new Date(clearTime);const account=await user('Persistent');
  const day=await services.prayer.status(null),scheduled=prayer(day,'dhuhr');
  now=new Date(Date.parse(scheduled.startedAt)+60_000);
  // No personal status request was made at adhan; the location mutation itself must latch it.
  const moved=await services.prayer.setLocation(account.user.id,{mode:'manual',cityId:'jayapura'});
  assert.equal(moved.location.cityId,'jayapura');assert.equal(moved.currentPrayer?.eventId,scheduled.eventId);assert.equal(moved.pauseEndsAt,scheduled.resumesAt);
  const restarted=new PrayerService(pool,{now:()=>new Date(now)});
  assert.equal((await restarted.status(account.user.id)).pauseEndsAt,scheduled.resumesAt);
  const logged=await services.accounts.login({email:account.user.email,password});
  assert.equal((await request('/prayer/status',{user:logged})).body.pauseEndsAt,scheduled.resumesAt);
  now=new Date(Date.parse(scheduled.resumesAt)-1);assert.equal((await restarted.status(account.user.id)).paused,true);
  now=new Date(scheduled.resumesAt);assert.equal((await restarted.status(account.user.id)).allowed,true);
  assert.equal((await pool.query('SELECT active_event_id,pause_until FROM user_prayer_state WHERE user_id=$1',[account.user.id])).rows[0].pause_until,null);
});

test('concurrent location edits and status polls cannot reduce an active persisted window',async()=>{
  now=new Date(clearTime);const account=await user('Concurrent');
  const day=await services.prayer.status(account.user.id),scheduled=prayer(day,'maghrib');now=new Date(Date.parse(scheduled.startedAt)+30_000);
  const attempts=await Promise.all(Array.from({length:12},(_,index)=>index%2
    ?services.prayer.status(account.user.id)
    :services.prayer.setLocation(account.user.id,{mode:'manual',cityId:index%4?'jayapura':'bogor'})));
  for(const status of attempts)assert(Date.parse(status.pauseEndsAt!)>=Date.parse(scheduled.resumesAt));
  const persisted=(await pool.query('SELECT pause_until FROM user_prayer_state WHERE user_id=$1',[account.user.id])).rows[0].pause_until as Date;
  assert(persisted.getTime()>=Date.parse(scheduled.resumesAt));
});

test('uncomputable polar dates explicitly use Jakarta and keep the selected location private',async()=>{
  now=new Date('2026-06-21T03:00:00.000Z');const account=await user('Polar');
  const status=await services.prayer.setLocation(account.user.id,{mode:'manual',latitude:89,longitude:15});
  assert.equal(status.location.cityId,'jakarta');assert.equal(status.location.mode,'fallback');assert(status.location.fallbackReason);
  assert.equal(status.dailyTimes.length,5);assert(status.dailyTimes.every(window=>Number.isFinite(Date.parse(window.startedAt))));
  const selected=(await pool.query('SELECT latitude::float8,longitude::float8 FROM user_prayer_state WHERE user_id=$1',[account.user.id])).rows[0];
  assert.deepEqual(selected,{latitude:89,longitude:15});
  const profile=await services.economy.getProfile(account.user.id);assert(!('latitude' in profile));assert(!('prayer' in profile));
});

test('HTTP pause gates gameplay writes while auth/profile/location work and wallet/inventory remain unchanged',async()=>{
  now=new Date(clearTime);const account=await user('HTTP Prayer');
  const before=await services.economy.getProfile(account.user.id);
  const schedule=await services.prayer.status(account.user.id);now=new Date(prayer(schedule,'dhuhr').startedAt);
  const status=await request('/prayer/status',{user:account});assert.equal(status.response.status,200);assert(status.body.paused);
  const anonymous=await request('/prayer/status');assert.equal(anonymous.response.status,200);assert.equal(anonymous.body.location.cityId,'jakarta');
  const cities=await request('/prayer/locations');assert.equal(cities.response.status,200);assert(cities.body.locations.some((city:any)=>city.id==='bogor'));
  for(const [path,method,body] of [
    ['/race/ticket','POST',{}],['/shop/purchase','POST',{itemId:'six-spoke',catalogVersion:1}],
    ['/loadout','PUT',{carId:'brz'}],['/garage/appearance/quote','POST',{carId:'brz'}],
    ['/garage/appearance/apply','POST',{quoteId:randomUUID()}],
  ] as const){
    const blocked=await request(path,{method,body,user:account,key:randomUUID()});
    assert.equal(blocked.response.status,423,path);assert.equal(blocked.body.error.code,'PRAYER_BREAK');assert.equal(blocked.body.error.status.pauseEndsAt,status.body.pauseEndsAt);
  }
  assert.equal((await request('/profile',{user:account})).response.status,200);
  assert.equal((await request('/auth/me',{user:account})).body.user.id,account.user.id);
  assert.equal((await request('/prayer/location',{method:'PUT',body:{mode:'manual',cityId:'jayapura'},user:account,csrf:'wrong'})).response.status,403);
  const moved=await request('/prayer/location',{method:'PUT',body:{mode:'manual',cityId:'jayapura'},user:account});assert.equal(moved.response.status,200);assert(moved.body.paused);
  const login=await request('/auth/login',{method:'POST',body:{email:account.user.email,password}});assert.equal(login.response.status,200);assert.equal(login.body.user.id,account.user.id);
  const after=await services.economy.getProfile(account.user.id);assert.deepEqual(after.wallet,before.wallet);assert.deepEqual(after.inventory,before.inventory);assert.deepEqual(after.loadout,before.loadout);
  now=new Date(status.body.pauseEndsAt);assert.equal((await request('/race/ticket',{method:'POST',body:{},user:account})).response.status,200);
});

test('administrator writes also pause without blocking audit/profile reads or authenticating away the account',async()=>{
  now=new Date(clearTime);const email=`prayer-admin-${randomUUID()}@example.test`;
  const operator=await services.accounts.createAdmin({email,displayName:'Prayer Operator',password});
  const account=await services.accounts.login({email,password}),scheduled=prayer(await services.prayer.status(operator.id),'dhuhr');now=new Date(scheduled.startedAt);
  for(const [path,method] of [['/admin/topups','POST'],['/admin/catalog/brz','PATCH'],['/admin/tuning/publish','POST'],['/admin/rewards/publish','POST']] as const){
    const result=await request(path,{method,body:{},user:account,key:randomUUID()});assert.equal(result.response.status,423);assert.equal(result.body.error.code,'PRAYER_BREAK');
  }
  assert.equal((await request('/admin/audit',{user:account})).response.status,200);
  assert.equal((await request('/auth/me',{user:account})).body.user.id,operator.id);
});
