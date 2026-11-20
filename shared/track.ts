import { TRACK_DATA } from './track-data.js';
import type { CircuitId } from './types.js';

export const TRACK_VERSION = 'nv-courses-1';
export const ROAD_HALF = 11;
export const CAR_HALF_WIDTH = 1.25;
export interface TrackSample { x: number; z: number; tx: number; tz: number; nx: number; nz: number }
export interface Track {
  id: CircuitId;
  name: string;
  length: number;
  samples: readonly TrackSample[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}
const cache = new Map<CircuitId, Track>();
export function getTrack(id: CircuitId): Track {
  let result = cache.get(id);
  if (result) return result;
  const data = TRACK_DATA[id];
  if (!data) throw new Error('Unknown circuit');
  const samples = data.samples.map(([x,z,tx,tz]) => Object.freeze({ x,z,tx,tz,nx:-tz,nz:tx }));
  result = Object.freeze({ id, name:data.name, length:data.length, samples:Object.freeze(samples), bounds:Object.freeze({
    minX:Math.min(...samples.map(p=>p.x))-25, maxX:Math.max(...samples.map(p=>p.x))+25,
    minZ:Math.min(...samples.map(p=>p.z))-25, maxZ:Math.max(...samples.map(p=>p.z))+25,
  }) });
  cache.set(id,result);
  return result;
}
export function wrap(value:number):number { return ((value%1)+1)%1; }
export function pointAt(track:Track,t:number):TrackSample {
  const value=wrap(t)*track.samples.length,index=Math.floor(value),alpha=value-index;
  const a=track.samples[index]!,b=track.samples[(index+1)%track.samples.length]!;
  const tx=a.tx+(b.tx-a.tx)*alpha,tz=a.tz+(b.tz-a.tz)*alpha,length=Math.hypot(tx,tz)||1;
  return {x:a.x+(b.x-a.x)*alpha,z:a.z+(b.z-a.z)*alpha,tx:tx/length,tz:tz/length,nx:-tz/length,nz:tx/length};
}
export function nearestTrackIndex(track:Track,x:number,z:number,hint:number):number {
  const count=track.samples.length,start=((hint%count)+count)%count;
  let best=start,distance=Infinity;
  const check=(index:number)=>{const p=track.samples[index]!,d=(x-p.x)**2+(z-p.z)**2;if(d<distance){distance=d;best=index;}};
  for(let offset=-36;offset<=36;offset++)check((start+offset+count)%count);
  if(distance>900)for(let i=0;i<count;i++)check(i);
  return best;
}
/** Smooth projection on a segment around the selected point; used for progress. */
export function projectTrackT(track:Track,x:number,z:number,index:number):number {
  const count=track.samples.length;let bestDistance=Infinity,bestT=index/count;
  for(const offset of[-1,0]){
    const i=(index+offset+count)%count,a=track.samples[i]!,b=track.samples[(i+1)%count]!;
    const dx=b.x-a.x,dz=b.z-a.z,len=dx*dx+dz*dz;
    const f=Math.max(0,Math.min(1,len?((x-a.x)*dx+(z-a.z)*dz)/len:0));
    const d=(x-a.x-f*dx)**2+(z-a.z-f*dz)**2;
    if(d<bestDistance){bestDistance=d;bestT=(i+f)/count;}
  }
  return wrap(bestT);
}
export function signedTrackOffset(track:Track,x:number,z:number,index:number):number {
  const p=track.samples[index]!;return(x-p.x)*p.nx+(z-p.z)*p.nz;
}
