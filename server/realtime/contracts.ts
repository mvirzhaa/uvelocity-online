import type { IncomingHttpHeaders } from 'node:http';
import type {PrayerStatus} from '../../shared/prayer.js';
import type { BeginRaceInput, FrozenLoadout, LoadoutSelection, RaceResult, RaceRuleset, RaceSettlement, SessionUser, VehicleRestriction } from '../../shared/types.js';

/** Only trusted server closures may provide these services. Never merge them
 * into onCreate options, which are controlled by a matchmaking client. */
export interface RealtimeServices {
  consumeRaceTicket(input:{ticket:string;headers:IncomingHttpHeaders}):Promise<SessionUser|null>;
  authenticate(headers:IncomingHttpHeaders):Promise<SessionUser|null>;
  /** Personal prayer data remains private; rooms publish only safe event labels. */
  gameplayAccess(userId:string):Promise<PrayerStatus>;
  resolveLoadout(userId:string,selection:LoadoutSelection,rulesetId?:string):Promise<FrozenLoadout>;
  resolveVehicleRestriction(categoryId:string|null):Promise<VehicleRestriction>;
  getActiveRuleset():Promise<RaceRuleset>;
  beginRace(input:BeginRaceInput):Promise<unknown>;
  finalizeRace(result:RaceResult):Promise<RaceSettlement>;
  abortRace?(raceId:string,reason:string):Promise<unknown>;
  log?:(message:string,error?:unknown)=>void;
}
export interface RealtimeOptions {
  reconnectSeconds?:number;
  countdownMs?:number;
  /** Maximum arena preparation time before returning everyone to the lobby. */
  loadingTimeoutMs?:number;
  snapshotRateMs?:number;
  lobbyIdleMs?:number;
  finishRetentionMs?:number;
  inputTimeoutMs?:number;
  maxRaceDurationMs?:number;
  sessionCheckMs?:number;
  /** Server-controlled clock for deterministic integration tests. */
  now?:()=>number;
}
