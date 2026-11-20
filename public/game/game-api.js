/* UVelocity embeds the preserved renderer. Networking and prediction are owned
 * by the parent application; this file deliberately grants no wallet/room API. */
window.addEventListener('message', function(event){
  if(event.origin!==location.origin||event.source!==window.parent)return;
  if(event.data?.type==='uvelocity:focus')window.focus();
});
document.getElementById('retry-renderer')?.addEventListener('click', function(){
  location.reload();
});
