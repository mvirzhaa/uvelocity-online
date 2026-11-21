import {useEffect,useRef,useState} from 'react';
import type {MediaAsset} from '../../shared/media.js';
import {resolveUrl} from './api.js';
import {Icon} from './icons.js';

export function GarageAudio({asset,volume,eligible,muted,suspended=false}:{asset:MediaAsset|null;volume:number;eligible:boolean;muted:boolean;suspended?:boolean}){
  const audio=useRef<HTMLAudioElement>(null),sequence=useRef(0),pending=useRef(false),wanted=useRef(false);
  const [requested,setRequested]=useState(false),[playing,setPlaying]=useState(false),[error,setError]=useState(''),[hidden,setHidden]=useState(()=>document.hidden);
  const allowed=!!asset&&eligible&&!muted&&!suspended&&!hidden,allowedRef=useRef(allowed);allowedRef.current=allowed;
  function stop(){sequence.current++;pending.current=false;audio.current?.pause();setPlaying(false);}
  function fail(message:string){wanted.current=false;setRequested(false);setPlaying(false);setError(message);}
  function play(){
    const element=audio.current;if(!element||!allowedRef.current||!wanted.current||pending.current)return;
    if(!element.paused){setPlaying(true);return;}
    const token=++sequence.current;pending.current=true;setError('');
    try{
      Promise.resolve(element.play()).then(()=>{
        if(token!==sequence.current){if(!allowedRef.current||!wanted.current)element.pause();return;}
        pending.current=false;
        if(allowedRef.current&&wanted.current)setPlaying(true);else{element.pause();setPlaying(false);}
      }).catch((reason:unknown)=>{
        if(token!==sequence.current)return;pending.current=false;
        if((reason as {name?:string})?.name==='AbortError')return;
        fail((reason as {name?:string})?.name==='NotAllowedError'?'Browser meminta izin pemutaran. Tekan Putar musik garasi.':'Lagu belum dapat diputar. Periksa koneksi lalu coba kembali.');
      });
    }catch{pending.current=false;fail('Lagu belum dapat diputar. Tekan Putar musik garasi untuk mencoba kembali.');}
  }
  useEffect(()=>{const update=()=>setHidden(document.hidden);document.addEventListener('visibilitychange',update);return()=>document.removeEventListener('visibilitychange',update);},[]);
  useEffect(()=>{if(audio.current)audio.current.volume=Math.max(0,Math.min(1,volume));},[volume]);
  useEffect(()=>{setError('');return()=>{sequence.current++;pending.current=false;audio.current?.pause();};},[asset?.id,asset?.url]);
  useEffect(()=>{if(allowed&&requested)play();else stop();},[allowed,requested,asset?.id,asset?.url]);
  useEffect(()=>{const element=audio.current;return()=>{wanted.current=false;sequence.current++;element?.pause();};},[]);
  function toggle(){
    if(requested){wanted.current=false;setRequested(false);stop();return;}
    if(!allowed)return;
    if(error)audio.current?.load();
    wanted.current=true;setRequested(true);play();
  }
  return <>
    <audio ref={audio} className="garage-audio-element" data-garage-audio="true" src={resolveUrl(asset?.url)} preload="none" loop muted={muted} onError={()=>{if(asset)fail('Lagu belum dapat dimuat. Periksa koneksi lalu coba kembali.');}}/>
    {asset&&eligible&&<div className="garage-music" aria-label="Musik garasi">
      <Icon name="sound" size={17}/><div className="garage-music-title"><small>MUSIK GARASI</small><span title={asset.name}>{asset.name}</span></div>
      <button type="button" className="text-button" disabled={muted||suspended} aria-label={requested?'Jeda musik garasi':'Putar musik garasi'} aria-pressed={requested} onClick={toggle}>{muted?'Suara dimatikan':requested?(playing?'Jeda':'Dijeda sementara'):'Putar musik garasi'}</button>
      {error&&<p className="garage-music-error" role="status">{error}</p>}
    </div>}
  </>;
}
