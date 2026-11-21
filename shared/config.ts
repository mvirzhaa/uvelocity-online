import { CAR_IDS, CIRCUIT_IDS, STRIPE_IDS, type FrozenLoadout, type PhysicsConfig, type RoomConfig, type VehicleInput, type VehicleStats } from './types.js';

export const MAX_RACERS = 15;
export const DEFAULT_PHYSICS: Readonly<PhysicsConfig> = Object.freeze({
  tickRate:90, nitroMultiplier:1.23, nitroAccelerationMultiplier:2,
  nitroDrain:26, nitroRecharge:3.2, driftRecharge:11, brakeRate:37, coastDrag:5.5,
  reverseSpeed:18, resetCooldownMs:3000,
});
export const DEFAULT_ROOM_CONFIG: Readonly<RoomConfig> = Object.freeze({
  circuit:'city',laps:3,bots:3,maxHumans:4,difficulty:'normal',collisionMode:'solid',
});
export function clamp(value:number,min:number,max:number):number{return Math.max(min,Math.min(max,value));}
function integer(value:unknown,min:number,max:number,name:string):number {
  if(typeof value!=='number'||!Number.isInteger(value)||value<min||value>max)throw new Error(`${name} must be an integer between ${min} and ${max}`);
  return value;
}
export function validateRoomConfig(input:Partial<RoomConfig>={}):RoomConfig {
  const config={...DEFAULT_ROOM_CONFIG,...input};
  if(!CIRCUIT_IDS.includes(config.circuit))throw new Error('Unknown circuit');
  integer(config.laps,1,20,'laps');integer(config.bots,0,14,'bots');integer(config.maxHumans,1,15,'maxHumans');
  if(config.bots+config.maxHumans>MAX_RACERS)throw new Error('Humans and bots together cannot exceed15 racers');
  if(!['easy','normal','hard'].includes(config.difficulty))throw new Error('Unknown difficulty');
  if(!['solid','ghost'].includes(config.collisionMode))throw new Error('Unknown collision mode');
  return Object.freeze(config);
}
export function validateStats(stats:VehicleStats):VehicleStats {
  for(const name of['topSpeed','zeroTo100','handling']as const)if(!Number.isFinite(stats?.[name])||stats[name]<=0)throw new Error('Invalid vehicle statistic: '+name);
  if(stats.topSpeed>1000||stats.zeroTo100<.5||stats.zeroTo100>60||stats.handling>5)throw new Error('Vehicle statistics exceed simulation bounds');
  return Object.freeze({...stats});
}
export function freezeLoadout(loadout:FrozenLoadout):FrozenLoadout {
  if(!CAR_IDS.includes(loadout.carId)||!/^#[\da-f]{6}$/i.test(loadout.color)||!['gloss','metallic','matte'].includes(loadout.finish))throw new Error('Invalid validated loadout');
  const rimColor=loadout.rimColor??'#c7cdd4';if(!/^#[\da-f]{6}$/i.test(rimColor))throw new Error('Invalid rim color');
  if(loadout.stockRimPainted!==undefined&&typeof loadout.stockRimPainted!=='boolean')throw new Error('Invalid stock rim paint state');
  const stockRimPainted=loadout.stockRimPainted??false;
  const stripeId=loadout.stripeId??'none',stripeColor=loadout.stripeColor??'#ffffff';
  if(!STRIPE_IDS.includes(stripeId)||!/^#[\da-f]{6}$/i.test(stripeColor))throw new Error('Invalid stripe appearance');
  if(loadout.appearanceVersion!==undefined&&!/^(0|[1-9][0-9]{0,18})$/.test(loadout.appearanceVersion))throw new Error('Invalid appearance version');
  if(typeof loadout.tuningVersion!=='string'||!loadout.tuningVersion)throw new Error('A ruleset version is required');
  return Object.freeze({...loadout,rimColor,stockRimPainted,stripeId,stripeColor,stats:validateStats(loadout.stats)});
}
export function resolvePhysics(overrides:Partial<PhysicsConfig>={}):PhysicsConfig {
  const value={...DEFAULT_PHYSICS,...overrides};
  const bounds:Record<keyof PhysicsConfig,[number,number]>={tickRate:[30,120],nitroMultiplier:[1,2],nitroAccelerationMultiplier:[1,4],nitroDrain:[1,100],nitroRecharge:[0,30],driftRecharge:[0,40],brakeRate:[5,100],coastDrag:[0,30],reverseSpeed:[0,40],resetCooldownMs:[1000,30000]};
  for(const [key,[min,max]]of Object.entries(bounds)as Array<[keyof PhysicsConfig,[number,number]]>)if(!Number.isFinite(value[key])||value[key]<min||value[key]>max)throw new Error('Invalid physics rule: '+key);
  if(!Number.isInteger(value.tickRate))throw new Error('tickRate must be integer');
  return Object.freeze(value);
}
export function parseInput(value:unknown):VehicleInput|null {
  if(!value||typeof value!=='object')return null;
  const input=value as Record<string,unknown>;
  if(!Number.isSafeInteger(input.seq)||Number(input.seq)<1)return null;
  for(const key of['throttle','brake','steer'])if(typeof input[key]!=='number'||!Number.isFinite(input[key]))return null;
  if(typeof input.nitro!=='boolean'||(input.reset!==undefined&&typeof input.reset!=='boolean'))return null;
  if(Number(input.throttle)<0||Number(input.throttle)>1||Number(input.brake)<0||Number(input.brake)>1||Math.abs(Number(input.steer))>1)return null;
  return {seq:Number(input.seq),throttle:Number(input.throttle),brake:Number(input.brake),steer:Number(input.steer),nitro:input.nitro,reset:input.reset===true,
    ...(typeof input.clientTick==='number'&&Number.isSafeInteger(input.clientTick)&&input.clientTick>=0?{clientTick:input.clientTick}:{})};
}
export function neutralInput(seq=0,brake=0):VehicleInput{return{seq,throttle:0,brake,steer:0,nitro:false};}
