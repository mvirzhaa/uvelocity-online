import type { CarId, VehicleStats } from './types.js';

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
};
export const CAR_NAMES: Record<CarId, string> = {
  brz: 'Subaru BRZ', veyron77: 'Bugatti Veyron Polisi 77', aventador: 'Lamborghini Aventador',
  skyline: 'Nissan Skyline GT-R R34', veloce: 'Veloce R', apex: 'Apex GT', cinder: 'Cinder V8', kaze: 'Kaze Rally',
};
