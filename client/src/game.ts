import type { FrozenLoadout, RoomSnapshot } from '../../shared/types.js';
import type { Loadout } from './api.js';
export type Controls={throttle:number;brake:number;steer:number;nitro:boolean;reset?:boolean};
export interface GameAPI {
 ready:Promise<unknown>;
 configure(options:Record<string,unknown>):Promise<unknown>;
 preview(loadout:Loadout|FrozenLoadout):Promise<unknown>;
 setLoadout(loadout:Loadout|FrozenLoadout):Promise<unknown>;
 setLocalPlayer(id:string):Promise<unknown>|void;
 startRace(options:Record<string,unknown>):Promise<unknown>;
 waitForRaceFrame?(options:{raceId:string;startToken?:string;minimumTick?:number;timeoutMs?:number}):Promise<unknown>;
 applySnapshot(snapshot:RoomSnapshot):void;
 stopRace():Promise<unknown>|void;
 setVisible(visible:boolean):void;
 setMuted(muted:boolean):void;
 setCamera(mode?:string):void;
 previewEngine():Promise<unknown>;
 pause?():Promise<unknown>|void;
 resume?():Promise<unknown>|void;
 focus():void;
 unlockAudio():void;
 getCatalog():{cars:Array<{id:string;loaded:boolean;branded?:boolean}>;[key:string]:unknown};
 ensureModels?(ids:string[]):Promise<unknown>;
 showCredits?():Promise<unknown>|void;
 showCircuit?(options?:unknown):Promise<unknown>;
 on(event:string,callback:(payload:any)=>void):()=>void;
}
declare global{interface Window{NVGame?:GameAPI}}
