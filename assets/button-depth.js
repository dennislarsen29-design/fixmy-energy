/* Companion to button-depth.css: pressed state while a form submits, and a done flash. */
(function(){
  window.bdBusy=function(btn,promise){if(!btn)return promise;btn.setAttribute('aria-busy','true');
    return Promise.resolve(promise).then(function(r){btn.removeAttribute('aria-busy');btn.classList.add('is-done');setTimeout(function(){btn.classList.remove('is-done')},800);return r},
      function(e){btn.removeAttribute('aria-busy');throw e})};
  document.addEventListener('submit',function(e){var f=e.target;if(!f||!f.querySelector)return;
    var b=f.querySelector('[type=submit],button:not([type])');if(!b||b.disabled)return;
    b.setAttribute('aria-busy','true');setTimeout(function(){b.removeAttribute('aria-busy')},6000)},true);
})();
/* Contrast: white text on the lime brand fill is ~2:1. Switch only that text to the brand's dark ink. */
(function(){
  function fix(){document.querySelectorAll('a,button,input[type=submit]').forEach(function(e){
    var cs=getComputedStyle(e);if(cs.backgroundColor==='rgb(141, 198, 63)'&&cs.color==='rgb(255, 255, 255)')e.setAttribute('data-bd-lime','')})}
  if(document.readyState!=='loading')fix();else document.addEventListener('DOMContentLoaded',fix);
  window.addEventListener('load',fix);
})();
