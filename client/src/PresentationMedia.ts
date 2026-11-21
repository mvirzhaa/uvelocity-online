import {useCallback,useEffect,useRef,useState} from 'react';
import {api} from './api.js';
import type {PresentationSettings} from '../../shared/media.js';

/** Presentation media is public. Authentication must not reset a playing song. */
export function usePresentationMedia(_userId:string|undefined,pollEnabled:boolean){
  const [settings,setSettings]=useState<PresentationSettings|null>(null);
  const epoch=useRef(0),mounted=useRef(false);
  const apply=useCallback((next:PresentationSettings)=>{
    if(!mounted.current)return;
    setSettings(previous=>!previous||next.version>=previous.version?next:previous);
  },[]);
  const refresh=useCallback(async(signal?:AbortSignal)=>{
    const current=epoch.current;
    const next=await api<PresentationSettings>('/presentation','GET',undefined,undefined,{signal});
    if(mounted.current&&current===epoch.current&&!signal?.aborted)apply(next);
  },[apply]);
  useEffect(()=>{
    mounted.current=true;epoch.current++;
    const controller=new AbortController();void refresh(controller.signal).catch(()=>{});
    return()=>{mounted.current=false;epoch.current++;controller.abort();};
  },[refresh]);
  useEffect(()=>{
    if(!pollEnabled)return;const controller=new AbortController();
    const reload=()=>{if(!document.hidden)void refresh(controller.signal).catch(()=>{});};
    const interval=setInterval(reload,60_000);
    document.addEventListener('visibilitychange',reload);
    return()=>{clearInterval(interval);controller.abort();document.removeEventListener('visibilitychange',reload);};
  },[pollEnabled,refresh]);
  return {settings,apply,refresh};
}
