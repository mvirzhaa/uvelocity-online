import {useCallback,useEffect,useRef,useState} from 'react';
import {api} from './api.js';
import type {PresentationSettings} from '../../shared/media.js';

/** Keep one immutable asset URL per selection; background refresh never restarts a song. */
export function usePresentationMedia(userId:string|undefined,pollEnabled:boolean){
  const [settings,setSettings]=useState<PresentationSettings|null>(null);
  const epoch=useRef(0),activeUser=useRef(userId);activeUser.current=userId;
  const apply=useCallback((next:PresentationSettings)=>{
    if(!activeUser.current)return;
    setSettings(previous=>!previous||next.version>=previous.version?next:previous);
  },[]);
  const refresh=useCallback(async(signal?:AbortSignal)=>{
    if(!userId)return;const current=epoch.current;
    const next=await api<PresentationSettings>('/presentation','GET',undefined,undefined,{signal});
    if(current===epoch.current&&activeUser.current===userId&&!signal?.aborted)apply(next);
  },[userId,apply]);
  useEffect(()=>{
    epoch.current++;setSettings(null);if(!userId)return;
    const controller=new AbortController();void refresh(controller.signal).catch(()=>{});
    return()=>{epoch.current++;controller.abort();};
  },[userId,refresh]);
  useEffect(()=>{
    if(!userId||!pollEnabled)return;const controller=new AbortController();
    const reload=()=>{if(!document.hidden)void refresh(controller.signal).catch(()=>{});};
    const interval=setInterval(reload,60_000);
    document.addEventListener('visibilitychange',reload);
    return()=>{clearInterval(interval);controller.abort();document.removeEventListener('visibilitychange',reload);};
  },[userId,pollEnabled,refresh]);
  return {settings,apply,refresh};
}
