import { TRACK_DATA } from './track-data.js';
import type { CircuitId } from './types.js';

export const TRACK_VERSION = 'nv-courses-2';
export const ROAD_HALF = 11;
export const CAR_HALF_WIDTH = 1.25;
export interface TrackSample { x: number; z: number; tx: number; tz: number; nx: number; nz: number }
export interface Track {
  id: CircuitId;
  name: string;
  length: number;
  /** Circuits wrap; an open sprint has distinct start and finish endpoints. */
  closed: boolean;
  roadHalf: number;
  runout: number;
  samples: readonly TrackSample[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}
const cache = new Map<CircuitId, Track>();
export function getTrack(id: CircuitId): Track {
  let result = cache.get(id);
  if (result) return result;
  if(id==='drag-2km'){
    // Include both surveyed timing lines. Staging and braking pavement are
    // outside this2000-metre scored centerline, never an extra lap.
    const samples=Object.freeze(Array.from({length:480},(_,i)=>Object.freeze({x:0,z:-2000*i/479,tx:0,tz:-1,nx:1,nz:0})));
    result=Object.freeze({id,name:'Drag Strip 2 KM',length:2000,closed:false,roadHalf:22.5,runout:700,samples,bounds:Object.freeze({minX:-47.5,maxX:47.5,minZ:-2025,maxZ:25})});
    cache.set(id,result);return result;
  }
  const data = TRACK_DATA[id];
  if (!data) throw new Error('Unknown circuit');
  const samples = data.samples.map(([x,z,tx,tz]) => Object.freeze({ x,z,tx,tz,nx:-tz,nz:tx }));
  result = Object.freeze({ id, name:data.name, length:data.length, closed:true, roadHalf:ROAD_HALF, runout:0, samples:Object.freeze(samples), bounds:Object.freeze({
    minX:Math.min(...samples.map(p=>p.x))-25, maxX:Math.max(...samples.map(p=>p.x))+25,
    minZ:Math.min(...samples.map(p=>p.z))-25, maxZ:Math.max(...samples.map(p=>p.z))+25,
  }) });
  cache.set(id,result);
  return result;
}
export function wrap(value:number):number { return ((value%1)+1)%1; }
export function pointAt(track:Track,t:number):TrackSample {
  const count=track.samples.length,value=(track.closed?wrap(t):t)*(track.closed?count:count-1);
  const index=track.closed?Math.floor(value):Math.max(0,Math.min(count-2,Math.floor(value))),alpha=value-index;
  const a=track.samples[index]!,b=track.samples[(index+1)%count]!;
  const tx=a.tx+(b.tx-a.tx)*alpha,tz=a.tz+(b.tz-a.tz)*alpha,length=Math.hypot(tx,tz)||1;
  return {x:a.x+(b.x-a.x)*alpha,z:a.z+(b.z-a.z)*alpha,tx:tx/length,tz:tz/length,nx:-tz/length,nz:tx/length};
}
export function nearestTrackIndex(track:Track,x:number,z:number,hint:number):number {
  const count=track.samples.length,start=track.closed?((hint%count)+count)%count:Math.max(0,Math.min(count-1,hint));
  let best=start,distance=Infinity;
  const check=(index:number)=>{const p=track.samples[index]!,d=(x-p.x)**2+(z-p.z)**2;if(d<distance){distance=d;best=index;}};
  for(let offset=-36;offset<=36;offset++){const index=start+offset;if(track.closed)check((index+count)%count);else if(index>=0&&index<count)check(index);}
  if(distance>900)for(let i=0;i<count;i++)check(i);
  return best;
}
/** Smooth projection on a segment around the selected point; used for progress. */
export function projectTrackT(track:Track,x:number,z:number,index:number):number {
  const count=track.samples.length,segments=track.closed?count:count-1;let bestDistance=Infinity,bestT=index/segments;
  for(const offset of[-1,0]){
    const candidate=index+offset;if(!track.closed&&(candidate<0||candidate>=segments))continue;
    const i=(candidate+count)%count,a=track.samples[i]!,b=track.samples[(i+1)%count]!;
    const dx=b.x-a.x,dz=b.z-a.z,len=dx*dx+dz*dz;
    // Open end segments extrapolate into staging/runout instead of projecting
    // onto an imaginary closing segment from FINISH back to START.
    const raw=len?((x-a.x)*dx+(z-a.z)*dz)/len:0;
    const f=Math.max(!track.closed&&i===0?-Infinity:0,Math.min(!track.closed&&i===segments-1?Infinity:1,raw));
    const d=(x-a.x-f*dx)**2+(z-a.z-f*dz)**2;
    if(d<bestDistance){bestDistance=d;bestT=(i+f)/segments;}
  }
  return track.closed?wrap(bestT):bestT;
}
export function signedTrackOffset(track:Track,x:number,z:number,index:number):number {
  const p=track.samples[index]!;return(x-p.x)*p.nx+(z-p.z)*p.nz;
}
