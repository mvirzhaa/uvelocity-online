import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type {MediaAsset} from '../../shared/media.js';
import {resolveUrl} from './api.js';

type AudioPlacement='garage'|'splash'|'auth';
export function GarageAudio({asset,volume,eligible,muted,suspended=false,placement='garage',controlsHost,onUnmute}:{asset:MediaAsset|null;volume:number;eligible:boolean;muted:boolean;suspended?:boolean;placement?:AudioPlacement;controlsHost?:HTMLElement|null;onUnmute?:()=>void}){
  const audio=useRef<HTMLAudioElement>(null),sequence=useRef(0),pending=useRef(false),wanted=useRef(true),blockedRef=useRef(false),reloadNeeded=useRef(false);
  const [requested,setRequested]=useState(true),[playing,setPlaying]=useState(false),[blocked,setBlocked]=useState(false),[error,setError]=useState(''),[hidden,setHidden]=useState(()=>document.hidden);
  const allowed=!!asset&&eligible&&!muted&&!suspended&&!hidden,allowedRef=useRef(allowed);allowedRef.current=allowed;
  function stop(){sequence.current++;pending.current=false;audio.current?.pause();setPlaying(false);}
  function fail(message:string){wanted.current=false;blockedRef.current=false;reloadNeeded.current=true;setBlocked(false);setRequested(false);setPlaying(false);setError(message);}
  function needsGesture(){blockedRef.current=true;setBlocked(true);setPlaying(false);setError('Browser meminta izin pemutaran. Sentuh layar atau tekan Putar musik garasi.');}
  function play(){
    const element=audio.current;if(!element||!allowedRef.current||!wanted.current||pending.current)return;
    if(!element.paused){blockedRef.current=false;setBlocked(false);setPlaying(true);setError('');return;}
    const token=++sequence.current;pending.current=true;blockedRef.current=false;setBlocked(false);setError('');
    try{
      Promise.resolve(element.play()).then(()=>{
        if(token!==sequence.current){if(!allowedRef.current||!wanted.current)element.pause();return;}
        pending.current=false;
        if(allowedRef.current&&wanted.current)setPlaying(true);else{element.pause();setPlaying(false);}
      }).catch((reason:unknown)=>{
        if(token!==sequence.current)return;pending.current=false;
        const name=(reason as {name?:string})?.name;
        if(name==='NotAllowedError'||name==='AbortError'){needsGesture();return;}
        fail('Lagu belum dapat diputar. Periksa koneksi lalu coba kembali.');
      });
    }catch(reason){
      pending.current=false;
      if((reason as {name?:string})?.name==='NotAllowedError'){needsGesture();return;}
      fail('Lagu belum dapat diputar. Tekan Putar musik garasi untuk mencoba kembali.');
    }
  }
  // Gestures use current eligibility without replacing listeners across login.
  const retry=useRef(play);retry.current=play;
  useEffect(()=>{
    const gesture=(event:Event)=>{
      if((event.target as Element|null)?.closest?.('[data-music-toggle]'))return;
      if(blockedRef.current&&wanted.current&&allowedRef.current)retry.current();
    };
    const events=['pointerup','touchend','click','keydown'] as const;
    for(const event of events)document.addEventListener(event,gesture,true);
    return()=>{for(const event of events)document.removeEventListener(event,gesture,true);};
  },[]);
  useEffect(()=>{const update=()=>setHidden(document.hidden);document.addEventListener('visibilitychange',update);return()=>document.removeEventListener('visibilitychange',update);},[]);
  useEffect(()=>{if(audio.current)audio.current.volume=Math.max(0,Math.min(1,volume));},[volume]);
  useEffect(()=>{
    setError('');blockedRef.current=false;setBlocked(false);reloadNeeded.current=false;
    return()=>{sequence.current++;pending.current=false;audio.current?.pause();};
  },[asset?.id,asset?.url]);
  useEffect(()=>{if(allowed&&requested)play();else stop();},[allowed,requested,asset?.id,asset?.url]);
  useEffect(()=>{const element=audio.current;return()=>{wanted.current=false;sequence.current++;element?.pause();};},[]);
  function toggle(){
    if(muted){
      if(!onUnmute)return;
      onUnmute();
      // This button is an explicit unmute gesture. Play in the same call stack
      // for browsers which do not retain activation until React effects run.
      if(asset&&eligible&&!suspended&&!hidden){
        if(audio.current)audio.current.muted=false;
        if(wanted.current){allowedRef.current=true;play();}
      }
      return;
    }
    if(requested&&!blocked&&!error){wanted.current=false;setRequested(false);stop();return;}
    if(!allowed)return;
    if(reloadNeeded.current){audio.current?.load();reloadNeeded.current=false;}
    wanted.current=true;setRequested(true);play();
  }
  const activeIntent=requested&&!blocked&&!error;
  const label=muted?(onUnmute?'Aktifkan suara':'Suara dimatikan'):activeIntent?'Jeda musik garasi':'Putar musik garasi';
  const controlState=muted?'muted':error?'blocked':playing?'playing':activeIntent?'waiting':'paused';
  const controls=asset&&eligible?<div className={'garage-music garage-music--'+placement} aria-label="Musik garasi">
    <button type="button" className="music-icon-button" data-music-toggle="true" data-music-state={controlState} disabled={suspended||(muted&&!onUnmute)} aria-label={label} title={error?label+'. '+error:label} aria-pressed={activeIntent&&!muted} onClick={toggle}>
      <svg aria-hidden="true" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 17V5l11-2v12M9 8l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2.5"/><ellipse cx="17" cy="16" rx="3" ry="2.5"/>{muted&&<path d="m3 3 18 18"/>}</svg>
      {!muted&&<span className="music-state-mark" aria-hidden="true">{playing?<svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><path d="M1 1h2v6H1zm4 0h2v6H5z"/></svg>:<svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><path d="m2 1 5 3-5 3z"/></svg>}</span>}
    </button>
    {error&&<span className="garage-music-error music-control-status" role="status">{error}</span>}
  </div>:null;
  return <>
    <audio ref={audio} className="garage-audio-element" data-garage-audio="true" src={resolveUrl(asset?.url)} preload="auto" loop muted={muted} onError={()=>{if(asset)fail('Lagu belum dapat dimuat. Periksa koneksi lalu coba kembali.');}}/>
    {placement==='garage'&&controlsHost!==undefined?(controlsHost?createPortal(controls,controlsHost):null):controls}
  </>;
}
