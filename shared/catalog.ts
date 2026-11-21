import type { CarId, VehicleStats } from './types.js';

export const RECONSTRUCTED_CAR_IDS:readonly CarId[]=['bmw-hybrid-v8','bmw-m4-gt4','amg-gt4','sls-amg-gt3','batmobile-1989','jesko-absolut','venom-f5','panther-grand-touring'];

/** Offline defaults only. Online racers always use a server-frozen ruleset. */
export const DEFAULT_VEHICLE_STATS: Record<CarId, VehicleStats> = {
  brz: { topSpeed: 255, zeroTo100: 5.6, handling: 1.18 },
  veyron77: { topSpeed: 370, zeroTo100: 2.7, handling: .94 },
  aventador: { topSpeed: 340, zeroTo100: 2.9, handling: .98 },
  skyline: { topSpeed: 295, zeroTo100: 3.6, handling: 1.11 },
  veloce: { topSpeed: 320, zeroTo100: 3, handling: .99 },
  apex: { topSpeed: 275, zeroTo100: 4.3, handling: 1.06 },
  cinder: { topSpeed: 290, zeroTo100: 3.8, handling: .9 },
  kaze: { topSpeed: 255, zeroTo100: 3.6, handling: 1.16 },
  'bmw-hybrid-v8': {topSpeed:345,zeroTo100:2.6,handling:1.23},
  'bmw-m4-gt4': {topSpeed:285,zeroTo100:3.7,handling:1.20},
  'amg-gt4': {topSpeed:295,zeroTo100:3.5,handling:1.16},
  'sls-amg-gt3': {topSpeed:310,zeroTo100:3.2,handling:1.18},
  'batmobile-1989': {topSpeed:300,zeroTo100:3.9,handling:.90},
  'jesko-absolut': {topSpeed:420,zeroTo100:2.3,handling:.96},
  'venom-f5': {topSpeed:410,zeroTo100:2.4,handling:.95},
  'panther-grand-touring': {topSpeed:170,zeroTo100:10.8,handling:.88},
};
export const CAR_NAMES: Record<CarId, string> = {
  brz: 'Subaru BRZ', veyron77: 'Bugatti Veyron Polisi 77', aventador: 'Lamborghini Aventador',
  skyline: 'Nissan Skyline GT-R R34', veloce: 'Veloce R', apex: 'Apex GT', cinder: 'Cinder V8', kaze: 'Kaze Rally',
  'bmw-hybrid-v8':'BMW M Hybrid V8','bmw-m4-gt4':'BMW M4 GT4','amg-gt4':'Mercedes-AMG GT4',
  // Keep the historical key so existing purchases, paint and race history retain their identity.
  'sls-amg-gt3':'Mercedes-Benz SLS AMG GT3','batmobile-1989':'Batmobile 1989','jesko-absolut':'Koenigsegg Regera','venom-f5':'Hennessey Venom F5',
  'panther-grand-touring':'Isuzu Panther Grand Touring',
};
