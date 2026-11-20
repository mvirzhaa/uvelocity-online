/** Personal prayer settings are private account data, never public room state. */
export type PrayerName = 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';
export type PrayerLocationMode = 'gps' | 'manual' | 'fallback';

export interface PrayerWindow {
  /** Stable across retries/restarts for the same calculated prayer instant. */
  eventId: string;
  prayer: PrayerName;
  name: string;
  startedAt: string;
  resumesAt: string;
}

export interface PrayerLocation {
  mode: PrayerLocationMode;
  cityId: string | null;
  label: string;
  latitude: number;
  longitude: number;
  /** Derived on the server from coordinates, not accepted from the browser. */
  timezone: string;
  fallbackReason: string | null;
}

export interface PrayerCity {
  id: string;
  name: string;
  province: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

export interface PrayerLocationInput {
  mode: PrayerLocationMode;
  cityId?: string;
  latitude?: number;
  longitude?: number;
}

export interface PrayerStatus {
  enabled: true;
  allowed: boolean;
  paused: boolean;
  serverNow: string;
  localDate: string;
  pauseEndsAt: string | null;
  /** Only the active 15-minute window, not the whole period until the next prayer. */
  currentPrayer: PrayerWindow | null;
  nextPrayer: PrayerWindow;
  dailyTimes: PrayerWindow[];
  location: PrayerLocation;
  calculation: {
    method: 'location-20-18-v1';
    label: string;
    fajrAngle: 20;
    ishaAngle: 18;
    adjustmentMinutes: 2;
    rounding: 'up';
    madhab: 'Shafi';
    official: false;
  };
  message: string;
}

export const PRAYER_BREAK_MINUTES = 15;
export const PRAYER_NAMES: Readonly<Record<PrayerName, string>> = Object.freeze({
  fajr: 'Subuh', dhuhr: 'Zuhur', asr: 'Asar', maghrib: 'Magrib', isha: 'Isya',
});

/** City centres for manual selection; timezone is re-derived when a choice is saved. */
export const PRAYER_CITIES: readonly PrayerCity[] = Object.freeze([
  {id:'jakarta',name:'Jakarta',province:'DKI Jakarta',latitude:-6.2088,longitude:106.8456,timezone:'Asia/Jakarta'},
  {id:'bogor',name:'Bogor',province:'Jawa Barat',latitude:-6.60,longitude:106.80,timezone:'Asia/Jakarta'},
  {id:'bandung',name:'Bandung',province:'Jawa Barat',latitude:-6.92,longitude:107.62,timezone:'Asia/Jakarta'},
  {id:'bekasi',name:'Bekasi',province:'Jawa Barat',latitude:-6.24,longitude:106.99,timezone:'Asia/Jakarta'},
  {id:'tangerang',name:'Tangerang',province:'Banten',latitude:-6.18,longitude:106.63,timezone:'Asia/Jakarta'},
  {id:'serang',name:'Serang',province:'Banten',latitude:-6.12,longitude:106.15,timezone:'Asia/Jakarta'},
  {id:'semarang',name:'Semarang',province:'Jawa Tengah',latitude:-6.97,longitude:110.42,timezone:'Asia/Jakarta'},
  {id:'surakarta',name:'Surakarta',province:'Jawa Tengah',latitude:-7.57,longitude:110.82,timezone:'Asia/Jakarta'},
  {id:'yogyakarta',name:'Yogyakarta',province:'DI Yogyakarta',latitude:-7.80,longitude:110.37,timezone:'Asia/Jakarta'},
  {id:'surabaya',name:'Surabaya',province:'Jawa Timur',latitude:-7.26,longitude:112.75,timezone:'Asia/Jakarta'},
  {id:'malang',name:'Malang',province:'Jawa Timur',latitude:-7.98,longitude:112.63,timezone:'Asia/Jakarta'},
  {id:'banda-aceh',name:'Banda Aceh',province:'Aceh',latitude:5.55,longitude:95.32,timezone:'Asia/Jakarta'},
  {id:'medan',name:'Medan',province:'Sumatera Utara',latitude:3.59,longitude:98.67,timezone:'Asia/Jakarta'},
  {id:'padang',name:'Padang',province:'Sumatera Barat',latitude:-0.95,longitude:100.35,timezone:'Asia/Jakarta'},
  {id:'pekanbaru',name:'Pekanbaru',province:'Riau',latitude:0.51,longitude:101.45,timezone:'Asia/Jakarta'},
  {id:'batam',name:'Batam',province:'Kepulauan Riau',latitude:1.05,longitude:104.03,timezone:'Asia/Jakarta'},
  {id:'jambi',name:'Jambi',province:'Jambi',latitude:-1.61,longitude:103.61,timezone:'Asia/Jakarta'},
  {id:'palembang',name:'Palembang',province:'Sumatera Selatan',latitude:-2.99,longitude:104.76,timezone:'Asia/Jakarta'},
  {id:'bengkulu',name:'Bengkulu',province:'Bengkulu',latitude:-3.80,longitude:102.27,timezone:'Asia/Jakarta'},
  {id:'bandar-lampung',name:'Bandar Lampung',province:'Lampung',latitude:-5.43,longitude:105.26,timezone:'Asia/Jakarta'},
  {id:'pangkal-pinang',name:'Pangkal Pinang',province:'Bangka Belitung',latitude:-2.13,longitude:106.11,timezone:'Asia/Jakarta'},
  {id:'pontianak',name:'Pontianak',province:'Kalimantan Barat',latitude:-0.03,longitude:109.34,timezone:'Asia/Pontianak'},
  {id:'palangka-raya',name:'Palangka Raya',province:'Kalimantan Tengah',latitude:-2.21,longitude:113.92,timezone:'Asia/Pontianak'},
  {id:'banjarmasin',name:'Banjarmasin',province:'Kalimantan Selatan',latitude:-3.32,longitude:114.59,timezone:'Asia/Makassar'},
  {id:'balikpapan',name:'Balikpapan',province:'Kalimantan Timur',latitude:-1.24,longitude:116.85,timezone:'Asia/Makassar'},
  {id:'samarinda',name:'Samarinda',province:'Kalimantan Timur',latitude:-0.50,longitude:117.15,timezone:'Asia/Makassar'},
  {id:'tanjung-selor',name:'Tanjung Selor',province:'Kalimantan Utara',latitude:2.84,longitude:117.37,timezone:'Asia/Makassar'},
  {id:'denpasar',name:'Denpasar',province:'Bali',latitude:-8.65,longitude:115.22,timezone:'Asia/Makassar'},
  {id:'mataram',name:'Mataram',province:'Nusa Tenggara Barat',latitude:-8.58,longitude:116.12,timezone:'Asia/Makassar'},
  {id:'kupang',name:'Kupang',province:'Nusa Tenggara Timur',latitude:-10.17,longitude:123.61,timezone:'Asia/Makassar'},
  {id:'makassar',name:'Makassar',province:'Sulawesi Selatan',latitude:-5.15,longitude:119.43,timezone:'Asia/Makassar'},
  {id:'mamuju',name:'Mamuju',province:'Sulawesi Barat',latitude:-2.68,longitude:118.89,timezone:'Asia/Makassar'},
  {id:'palu',name:'Palu',province:'Sulawesi Tengah',latitude:-0.90,longitude:119.87,timezone:'Asia/Makassar'},
  {id:'kendari',name:'Kendari',province:'Sulawesi Tenggara',latitude:-3.99,longitude:122.52,timezone:'Asia/Makassar'},
  {id:'gorontalo',name:'Gorontalo',province:'Gorontalo',latitude:0.54,longitude:123.06,timezone:'Asia/Makassar'},
  {id:'manado',name:'Manado',province:'Sulawesi Utara',latitude:1.47,longitude:124.84,timezone:'Asia/Makassar'},
  {id:'ambon',name:'Ambon',province:'Maluku',latitude:-3.70,longitude:128.18,timezone:'Asia/Jayapura'},
  {id:'ternate',name:'Ternate',province:'Maluku Utara',latitude:0.79,longitude:127.38,timezone:'Asia/Jayapura'},
  {id:'jayapura',name:'Jayapura',province:'Papua',latitude:-2.54,longitude:140.72,timezone:'Asia/Jayapura'},
  {id:'manokwari',name:'Manokwari',province:'Papua Barat',latitude:-0.86,longitude:134.06,timezone:'Asia/Jayapura'},
  {id:'sorong',name:'Sorong',province:'Papua Barat Daya',latitude:-0.88,longitude:131.25,timezone:'Asia/Jayapura'},
  {id:'merauke',name:'Merauke',province:'Papua Selatan',latitude:-8.49,longitude:140.40,timezone:'Asia/Jayapura'},
  {id:'nabire',name:'Nabire',province:'Papua Tengah',latitude:-3.37,longitude:135.50,timezone:'Asia/Jayapura'},
  {id:'wamena',name:'Wamena',province:'Papua Pegunungan',latitude:-4.10,longitude:138.94,timezone:'Asia/Jayapura'},
]);

export const DEFAULT_PRAYER_LOCATION: Readonly<PrayerLocation> = Object.freeze({
  mode:'fallback',cityId:'jakarta',label:'Jakarta (lokasi awal)',latitude:-6.2088,longitude:106.8456,
  timezone:'Asia/Jakarta',fallbackReason:null,
});
