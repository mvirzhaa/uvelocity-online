import type {LoadoutSelection,RoomSnapshot} from '../../shared/types.js';
import type {Loadout} from './api.js';

type RecoveryActions={
 refresh:()=>Promise<Loadout|null|undefined>;
 sessionId:()=>string;
 connected:()=>boolean;
 apply:(loadout:Loadout)=>void;
 error:(error:unknown)=>void;
};

function selectionKey(loadout:LoadoutSelection){
 return JSON.stringify([loadout.carId,loadout.rimId||'stock',loadout.color.toLowerCase(),loadout.finish,
  (loadout.rimColor||'#c7cdd4').toLowerCase(),loadout.stripeId||'none',
  (loadout.stripeColor||'#ffffff').toLowerCase(),loadout.appearanceVersion||'']);
}

/** A rejected lobby selection can be stale after admin access changes or a
 * purchase in another tab. Restore only the server-saved selection. A refresh
 * never overwrites the garage's unsaved preview, and an automatic rejection
 * cannot recursively resend the same selection. */
export class LobbyLoadoutRecovery {
 private snapshot:RoomSnapshot|null=null;
 private pending=false;
 private running=false;
 private disposed=false;
 private generation=0;
 private lastSent:string|null=null;
 private lastSeen:string|null=null;

 constructor(private actions:RecoveryActions){}

 observe(snapshot:RoomSnapshot){
  if(this.disposed)return;
  if(this.snapshot?.roomId!==snapshot.roomId){this.generation++;this.lastSent=null;this.lastSeen=null;}
  this.snapshot=snapshot;
  if(snapshot.phase!=='lobby'&&snapshot.phase!=='loading'){
   this.pending=false;this.generation++;return;
  }
  const mine=snapshot.members.find(member=>member.id===this.actions.sessionId());
  if(mine){
   const key=selectionKey(mine.loadout);
   if(this.lastSeen!==null&&this.lastSeen!==key&&key!==this.lastSent)this.lastSent=null;
   this.lastSeen=key;
  }
  void this.recover();
 }

 request(code?:string){
  if(this.disposed||!['LOADOUT_REJECTED','START_FAILED'].includes(code||''))return;
  if(!this.snapshot||!['lobby','loading'].includes(this.snapshot.phase))return;
  this.pending=true;void this.recover();
 }

 clear(){this.snapshot=null;this.pending=false;this.lastSent=null;this.lastSeen=null;this.generation++;}
 dispose(){this.disposed=true;this.clear();}

 private async recover(){
  if(this.disposed||this.running||!this.pending||this.snapshot?.phase!=='lobby')return;
  this.pending=false;this.running=true;const generation=this.generation;
  try{
   const saved=await this.actions.refresh();
   if(this.disposed||generation!==this.generation||this.snapshot?.phase!=='lobby'||!this.actions.connected()||!saved)return;
   const mine=this.snapshot.members.find(member=>member.id===this.actions.sessionId());
   if(!mine)return;
   const key=selectionKey(saved);
   if(selectionKey(mine.loadout)===key||this.lastSent===key)return;
   this.lastSent=key;this.actions.apply(saved);
  }catch(error){if(!this.disposed&&generation===this.generation)this.actions.error(error);}
  finally{this.running=false;if(this.pending)void this.recover();}
 }
}
