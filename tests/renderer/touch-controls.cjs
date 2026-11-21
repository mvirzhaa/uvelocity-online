const assert=require('node:assert/strict');

// Exercise the shipped pointer handlers in the renderer DOM. This verifies
// control state/lifecycle, not touch hardware, CSS layout, or GPU rendering.
async function verifyTouchControls({api,q,window,document,emit}){
 const $=id=>document.getElementById(id);
 const pointer=(id,type,pointerId,extra={})=>emit(typeof id==='string'?$(id):id,type,{pointerId,pointerType:'touch',button:0,...extra});
 const neutral=()=>{
  for(const [key,value]of Object.entries(q.inputs))assert.equal(value,false,'Input still held: '+key);
  for(const el of document.querySelectorAll('.touch-left button,.touch-right button')){
   assert.equal(el.classList.contains('active'),false,el.id+' still looks held');
   assert.equal(el.getAttribute('aria-pressed'),'false',el.id+' pressed state');
  }
 };
 await api.pause();await api.resume();neutral();

 pointer('t-gas','pointerdown',101);pointer('t-left','pointerdown',102);pointer('t-nitro','pointerdown',103);
 assert.equal(api.getInput().throttle,1);assert.equal(api.getInput().steer,1);assert.equal(api.getInput().nitro,true);
 assert.equal($('t-gas').getAttribute('aria-pressed'),'true');
 pointer('t-left','pointercancel',102);
 assert.equal(api.getInput().steer,0,'Cancel releases its steering finger');
 assert.equal(api.getInput().throttle,1,'Cancelling steering must keep gas held');
 assert.equal(api.getInput().nitro,true,'Cancelling steering must keep nitro held');
 pointer('t-nitro','lostpointercapture',103);assert.equal(api.getInput().nitro,false);assert.equal(api.getInput().throttle,1);
 pointer(window,'pointerup',101);neutral();

 pointer('t-gas','pointerdown',104);pointer('t-gas','pointerdown',105);
 pointer('t-gas','pointerup',104);assert.equal(api.getInput().throttle,1,'Second gas finger remains held');
 pointer('t-gas','pointerup',104);assert.equal(api.getInput().throttle,1,'Duplicate release cannot cancel another finger');
 pointer('t-gas','pointerup',105);neutral();

 const realCapture=$('t-right').setPointerCapture;
 $('t-right').setPointerCapture=()=>{throw new Error('Pointer capture unavailable');};
 pointer('t-gas','pointerdown',106);pointer('t-right','pointerdown',107);
 assert.equal(api.getInput().steer,-1);
 pointer(window,'pointercancel',107);assert.equal(api.getInput().steer,0);assert.equal(api.getInput().throttle,1);
 pointer(window,'pointerup',106);$('t-right').setPointerCapture=realCapture;neutral();

 pointer('t-gas','pointerdown',108);pointer('t-left','pointerdown',109);await api.pause();neutral();
 pointer('t-gas','pointerdown',110);neutral();
 await api.resume();neutral();
 pointer('t-gas','pointerdown',111);
 pointer('t-gas','pointerup',108);pointer('t-gas','pointerup',110);
 assert.equal(api.getInput().throttle,1,'Old or paused finger releases cannot clear a new press');
 pointer('t-gas','pointerup',111);neutral();

 pointer('t-gas','pointerdown',112);pointer('t-right','pointerdown',113);await api.setVisible(false);neutral();
 pointer('t-nitro','pointerdown',114);neutral();
 await api.setVisible(true);neutral();
 pointer('t-gas','pointerdown',115);emit(window,'blur');neutral();
 assert.equal(api.getState().paused,true);await api.resume();neutral();

 pointer('t-brake','pointerdown',116);assert.equal(api.getInput().brake,1);
 pointer('t-brake','pointerup',116);neutral();
 pointer('t-gas','pointerdown',117,{pointerType:'mouse',button:2});neutral();
 assert.equal(emit($('t-gas'),'contextmenu').defaultPrevented,true,'Long press must not open a control context menu');
 return 'Touch controls: independent gas/steer/nitro, two fingers per pedal, pointerup/cancel/lost capture, capture-failure fallback, complete pause/hide/blur reset, blocked paused/hidden presses, stale release isolation, brake and pressed accessibility state.';
}
module.exports={verifyTouchControls};
