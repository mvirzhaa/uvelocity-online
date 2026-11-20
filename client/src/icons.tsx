import type { CSSProperties } from 'react';
const paths:Record<string,string>={
 garage:'M3 21V9l9-6 9 6v12M7 21V11h10v10M7 15h10M7 18h10',
 flag:'M4 22V3m0 1c4-4 8 4 12 0v11c-4 4-8-4-12 0',
 car:'M5 17H3v-6l2-5h14l2 5v6h-2M5 17h14M5 17v3H3v-3m16 0v3h2v-3M3 11h18M6 14h2m8 0h2',
 wheel:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 6a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm0-6v6m0 6v6M3 12h6m6 0h6M5.6 5.6l4.2 4.2m4.4 4.4 4.2 4.2M18.4 5.6l-4.2 4.2m-4.4 4.4-4.2 4.2',
 user:'M20 21v-3a5 5 0 0 0-5-5H9a5 5 0 0 0-5 5v3M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
 shield:'M12 3 3 7v6c0 5 9 9 9 9s9-4 9-9V7l-9-4Zm-4 9 3 3 5-6',
 wallet:'M3 6h16v15H3V6Zm0 0 13-3v3m5 5h-6v5h6M16 13.5h1',
 logout:'M10 3H4v18h6m4-15 6 6-6 6m6-6H9',
 check:'m5 12 4 4L19 6',plus:'M12 5v14M5 12h14',close:'m6 6 12 12M6 18 18 6',
 lock:'M6 10h12v11H6V10Zm3 0V6a3 3 0 0 1 6 0v4',
 sound:'M3 9h4l5-5v16l-5-5H3V9Zm13-2a7 7 0 0 1 0 10m3-13a11 11 0 0 1 0 16',
 settings:'M4 7h16M4 17h16M8 4v6m8 4v6',
 copy:'M8 8h12v13H8V8ZM4 16H2V2h12v2',
 trophy:'M8 3h8v9a4 4 0 0 1-8 0V3Zm0 2H3v3a4 4 0 0 0 5 4m8-7h5v3a4 4 0 0 1-5 4m-4 4v5m-4 0h8',
 bolt:'m13 2-9 12h7l-1 8 10-12h-7l1-8',
 chevron:'m9 5 7 7-7 7',refresh:'M20 7V2m0 5h-5M4 17v5m0-5h5M5 7a8 8 0 0 1 13-3l2 3M4 17l2 3a8 8 0 0 0 13-3',
 camera:'M3 7h5l2-3h4l2 3h5v14H3V7Zm9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
 link:'m10 14 4-4m-6 8-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m2-3 2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0'
};
export function Icon({name,size=21,style}:{name:string;size?:number;style?:CSSProperties}){return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={style}><path d={paths[name]||paths.car}/></svg>;}
