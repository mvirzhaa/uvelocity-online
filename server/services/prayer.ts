import type { Pool, PoolClient } from 'pg';
import { CalculationMethod, Coordinates, Madhab, PrayerTimes, Rounding } from 'adhan';
import { find as findTimezones } from 'geo-tz/all';
import {
  DEFAULT_PRAYER_LOCATION, PRAYER_BREAK_MINUTES, PRAYER_CITIES, PRAYER_NAMES,
  type PrayerLocation, type PrayerName, type PrayerStatus, type PrayerWindow,
} from '../../shared/prayer.js';
import { transaction } from '../db/pool.js';
import { assert, ServiceError } from './errors.js';
import { object } from './validation.js';

const PRAYERS = ['fajr','dhuhr','asr','maghrib','isha'] as const;
const BREAK_MS = PRAYER_BREAK_MINUTES * 60_000;
const CALCULATION: PrayerStatus['calculation'] = Object.freeze({
  method:'location-20-18-v1',label:'Perhitungan lokasi 20/18 · ihtiyat 2 menit',
  fajrAngle:20,ishaAngle:18,adjustmentMinutes:2,rounding:'up',madhab:'Shafi',official:false,
});
const scheduleCache = new Map<string, readonly PrayerWindow[]>();
const formatters = new Map<string, Intl.DateTimeFormat>();

interface PrayerRow {
  location_mode: PrayerLocation['mode'];
  city_id: string | null;
  location_label: string;
  latitude: string | number;
  longitude: string | number;
  timezone: string;
  active_event_id: string | null;
  active_prayer: PrayerName | null;
  pause_started_at: Date | null;
  pause_until: Date | null;
}

export interface PrayerServiceOptions { now?: () => Date }

/** The response carries the authoritative personal status without changing the session. */
export class PrayerBreakError extends ServiceError {
  constructor(public prayerStatus: PrayerStatus) {
    super(423,'PRAYER_BREAK',prayerStatus.message);
  }
}

function checkedNow(value: Date): Date {
  assert(value instanceof Date && Number.isFinite(value.getTime()),500,'INVALID_SERVER_CLOCK','Waktu server tidak valid.');
  return new Date(value.getTime());
}

function localDay(date: Date, timezone: string): string {
  let formatter = formatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'});
    formatters.set(timezone,formatter);
  }
  const parts = formatter.formatToParts(date);
  const field = (name:string) => parts.find(part=>part.type===name)!.value;
  return `${field('year')}-${field('month')}-${field('day')}`;
}

function shiftDay(day: string, delta: number): string {
  const date = new Date(`${day}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate()+delta);
  return date.toISOString().slice(0,10);
}

function prayerWindow(prayer: PrayerName, date: Date): PrayerWindow {
  const startedAt = date.toISOString();
  return {eventId:`${prayer}:${startedAt}`,prayer,name:PRAYER_NAMES[prayer],startedAt,resumesAt:new Date(date.getTime()+BREAK_MS).toISOString()};
}

/** Returns UTC instants for the location's local calendar date, independent of server TZ. */
function calculateDay(location: PrayerLocation, day: string): readonly PrayerWindow[] {
  const key = `${location.latitude},${location.longitude},${location.timezone},${day}`;
  const cached = scheduleCache.get(key);
  if (cached) return cached;
  const [year,month,date] = day.split('-').map(Number);
  // Adhan reads the Date's local year/month/day fields; it returns UTC instants.
  // Noon avoids local midnight DST transitions while retaining the intended fields.
  const calendarDate = new Date(year!,month!-1,date!,12,0,0);
  const parameters = CalculationMethod.Other();
  parameters.fajrAngle = 20;
  parameters.ishaAngle = 18;
  parameters.madhab = Madhab.Shafi;
  parameters.rounding = Rounding.Up;
  // Start from Other (all method offsets zero), rather than adding +2 to a preset
  // that already adds an extra Dhuhr minute. Every prayer receives exactly +2.
  for (const prayer of PRAYERS) {
    parameters.methodAdjustments[prayer] = 0;
    parameters.adjustments[prayer] = 2;
  }
  const times = new PrayerTimes(new Coordinates(location.latitude,location.longitude),calendarDate,parameters);
  if (!PRAYERS.every(prayer=>Number.isFinite(times[prayer].getTime()))) throw new Error('UNCOMPUTABLE_PRAYER_TIMES');
  const result = PRAYERS.map(prayer=>Object.freeze(prayerWindow(prayer,times[prayer])));
  // A bounded cache contains no user IDs or location history and expires by local date.
  if (scheduleCache.size >= 2048) scheduleCache.delete(scheduleCache.keys().next().value!);
  scheduleCache.set(key,Object.freeze(result));
  return result;
}

function schedule(location: PrayerLocation, now: Date): {
  location: PrayerLocation; localDate: string; dailyTimes: PrayerWindow[];
  nextPrayer: PrayerWindow; currentPrayer: PrayerWindow | null;
} {
  const build = (effective:PrayerLocation) => {
    const localDate = localDay(now,effective.timezone);
    const dailyTimes = calculateDay(effective,localDate).map(window=>({...window}));
    const all = [
      ...calculateDay(effective,shiftDay(localDate,-1)),...dailyTimes,
      ...calculateDay(effective,shiftDay(localDate,1)),
    ].sort((a,b)=>Date.parse(a.startedAt)-Date.parse(b.startedAt));
    const timestamp = now.getTime();
    const currentPrayer = all.filter(window=>Date.parse(window.startedAt)<=timestamp&&timestamp<Date.parse(window.resumesAt)).at(-1) ?? null;
    const nextPrayer = all.find(window=>Date.parse(window.startedAt)>timestamp);
    if (!nextPrayer) throw new Error('NO_NEXT_PRAYER');
    return {location:effective,localDate,dailyTimes,nextPrayer:{...nextPrayer},currentPrayer:currentPrayer?{...currentPrayer}:null};
  };
  try { return build(location); }
  catch {
    // Valid polar coordinates may have no computable sunrise/sunset. Make the
    // fallback explicit; never produce Invalid Date or silently skip a prayer.
    return build({...DEFAULT_PRAYER_LOCATION,fallbackReason:'Jadwal lokasi ini belum dapat dihitung untuk tanggal ini. Jadwal Jakarta digunakan sementara.'});
  }
}

function toLocation(row: PrayerRow): PrayerLocation {
  return {mode:row.location_mode,cityId:row.city_id,label:row.location_label,
    latitude:Number(row.latitude),longitude:Number(row.longitude),timezone:row.timezone,fallbackReason:null};
}

function existingPause(row: PrayerRow, now: Date): PrayerWindow | null {
  if (!row.active_event_id||!row.active_prayer||!row.pause_started_at||!row.pause_until||new Date(row.pause_until).getTime()<=now.getTime()) return null;
  return {eventId:row.active_event_id,prayer:row.active_prayer,name:PRAYER_NAMES[row.active_prayer],
    startedAt:new Date(row.pause_started_at).toISOString(),resumesAt:new Date(row.pause_until).toISOString()};
}

function longerPause(a: PrayerWindow | null, b: PrayerWindow | null): PrayerWindow | null {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(b.resumesAt)>Date.parse(a.resumesAt)?b:a;
}

function statusFrom(location:PrayerLocation,now:Date,persisted:PrayerWindow|null=null):PrayerStatus {
  const calculated = schedule(location,now);
  const currentPrayer = longerPause(persisted,calculated.currentPrayer);
  return {
    enabled:true,allowed:!currentPrayer,paused:!!currentPrayer,serverNow:now.toISOString(),
    localDate:calculated.localDate,pauseEndsAt:currentPrayer?.resumesAt??null,
    currentPrayer,nextPrayer:calculated.nextPrayer,dailyTimes:calculated.dailyTimes,
    location:calculated.location,calculation:CALCULATION,
    message:currentPrayer?`Waktu ${currentPrayer.name}. Jeda salat berlangsung 15 menit sejak jadwal azan.`:'Jeda salat berikutnya mengikuti lokasi akun Anda.',
  };
}

function coordinate(value:unknown,name:string,min:number,max:number):number {
  assert(typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max,400,'INVALID_LOCATION',`${name} harus berupa angka antara ${min} dan ${max}.`);
  // Retain approximately 1 km precision for GPS and entered coordinates, not a trail.
  return Math.round(value*100)/100;
}

export function validatePrayerLocation(input:unknown):PrayerLocation {
  const body = object(input);
  assert(Object.keys(body).every(key=>['mode','cityId','latitude','longitude'].includes(key)),400,'INVALID_LOCATION','Kirim hanya pilihan lokasi. Zona waktu dan jadwal ditentukan server.');
  assert(['gps','manual','fallback'].includes(String(body.mode)),400,'INVALID_LOCATION','Pilih lokasi GPS, kota manual, atau Jakarta.');
  if (body.mode==='fallback') {
    assert(body.cityId===undefined&&body.latitude===undefined&&body.longitude===undefined,400,'INVALID_LOCATION','Lokasi awal menggunakan Jakarta.');
    return {...DEFAULT_PRAYER_LOCATION};
  }
  let latitude:number,longitude:number,cityId:string|null=null,label:string;
  if (body.mode==='manual'&&body.cityId!==undefined) {
    const city = PRAYER_CITIES.find(entry=>entry.id===body.cityId);
    assert(city&&body.latitude===undefined&&body.longitude===undefined,400,'INVALID_LOCATION','Kota tidak valid atau bercampur dengan koordinat manual.');
    ({latitude,longitude}=city);cityId=city.id;label=`${city.name}, ${city.province}`;
  } else {
    assert(body.cityId===undefined,400,'INVALID_LOCATION','Lokasi GPS menggunakan koordinat, bukan ID kota.');
    latitude=coordinate(body.latitude,'Lintang',-90,90);
    longitude=coordinate(body.longitude,'Bujur',-180,180);
    label=body.mode==='gps'?'Lokasi GPS Anda':'Koordinat manual';
  }
  const timezone = findTimezones(latitude,longitude)[0];
  assert(timezone,400,'INVALID_LOCATION','Zona waktu lokasi tidak ditemukan. Pilih kota atau gunakan Jakarta.');
  // Validate the server-side polygon result against the runtime's IANA database.
  new Intl.DateTimeFormat('en',{timeZone:timezone}).format(new Date(0));
  return {mode:body.mode as 'gps'|'manual',cityId,label,latitude,longitude,timezone,fallbackReason:null};
}

export class PrayerService {
  private readonly now:()=>Date;
  constructor(private readonly pool:Pool,options:PrayerServiceOptions={}) {
    this.now=options.now??(()=>new Date());
  }

  private async lock(client:PoolClient,userId:string):Promise<PrayerRow> {
    await client.query('INSERT INTO user_prayer_state(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING',[userId]);
    const result=await client.query<PrayerRow>('SELECT * FROM user_prayer_state WHERE user_id=$1 FOR UPDATE',[userId]);
    assert(result.rows[0],404,'ACCOUNT_NOT_FOUND','Akun tidak ditemukan.');
    return result.rows[0];
  }

  private async savePause(client:PoolClient,userId:string,row:PrayerRow,window:PrayerWindow|null):Promise<void> {
    if ((row.active_event_id??null)===(window?.eventId??null)) return;
    await client.query('UPDATE user_prayer_state SET active_event_id=$2,active_prayer=$3,pause_started_at=$4,pause_until=$5 WHERE user_id=$1',
      [userId,window?.eventId??null,window?.prayer??null,window?.startedAt??null,window?.resumesAt??null]);
  }

  async status(userId:string|null,at?:Date):Promise<PrayerStatus> {
    const now=checkedNow(at??this.now());
    if (!userId) return statusFrom({...DEFAULT_PRAYER_LOCATION},now);
    return transaction(this.pool,async client=>{
      const row=await this.lock(client,userId);
      const result=statusFrom(toLocation(row),now,existingPause(row,now));
      await this.savePause(client,userId,row,result.currentPrayer);
      return result;
    });
  }

  async setLocation(userId:string,input:unknown):Promise<PrayerStatus> {
    const location=validatePrayerLocation(input),now=checkedNow(this.now());
    return transaction(this.pool,async client=>{
      const row=await this.lock(client,userId);
      // Capture the old location's active window even if this is the first request
      // since adhan. Changing location cannot evade an as-yet-unpolled break.
      const old=statusFrom(toLocation(row),now,existingPause(row,now));
      const result=statusFrom(location,now,old.currentPrayer);
      await client.query('UPDATE user_prayer_state SET location_mode=$2,city_id=$3,location_label=$4,latitude=$5,longitude=$6,timezone=$7,location_updated_at=$8 WHERE user_id=$1',
        [userId,location.mode,location.cityId,location.label,location.latitude,location.longitude,location.timezone,now.toISOString()]);
      await this.savePause(client,userId,row,result.currentPrayer);
      return result;
    });
  }

  /** For new gameplay/commerce requests only; never modifies an active room or session. */
  async assertGameplayAllowed(userId:string):Promise<PrayerStatus> {
    const result=await this.status(userId);
    if (!result.allowed) throw new PrayerBreakError(result);
    return result;
  }
}

export function createPrayerService(pool:Pool,options?:PrayerServiceOptions):PrayerService {return new PrayerService(pool,options);}
