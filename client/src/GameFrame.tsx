import { useEffect,useRef,useState } from 'react';
import type { GameAPI } from './game.js';
export function GameFrame({visible,onReady,onError}:{visible:boolean;onReady:(game:GameAPI)=>void;onError:(message:string)=>void}){
 const frame=useRef<HTMLIFrameElement>(null),callbacks=useRef({onReady,onError}),generation=useRef(0),mounted=useRef(true),unsubscribe=useRef<(()=>void)|null>(null),[loaded,setLoaded]=useState(false);
 callbacks.current={onReady,onError};
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;generation.current++;unsubscribe.current?.();};},[]);
 useEffect(()=>{frame.current?.contentWindow?.NVGame?.setVisible?.(visible);},[visible,loaded]);
 async function handleLoad(){const current=++generation.current;unsubscribe.current?.();setLoaded(false);try{const game=frame.current?.contentWindow?.NVGame;if(!game)throw new Error('Mesin grafis belum tersedia. Muat ulang halaman.');await game.ready;if(!mounted.current||generation.current!==current)return;setLoaded(true);game.setVisible?.(visible);callbacks.current.onReady(game);unsubscribe.current=game.on('error',(e)=>{if(mounted.current&&generation.current===current)callbacks.current.onError(typeof e==='string'?e:e.message??'Grafis gagal dimuat.');});}catch(error){if(mounted.current&&generation.current===current)callbacks.current.onError((error as Error).message);}}
 const gameSrc = `${import.meta.env.BASE_URL || '/'}game/game.html?embedded=1`.replace(/\/{2,}/g, '/');
 return <div className={'game-frame '+(loaded?'loaded':'')}><iframe ref={frame} src={gameSrc} title="Garasi dan lintasan 3D UVelocity" onLoad={handleLoad} allow="autoplay; fullscreen" allowFullScreen/>{!loaded&&<div className="model-loading"><span className="spinner"/><b>Menyiapkan garasi 3D</b><p>Memuat model mobil dan lingkungan.</p></div>}</div>;
}
