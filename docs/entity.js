/* Entity controller — switches the whole app between Quay 1 and Active.
 *
 * One entity is active at a time, chosen by the header pill toggle and remembered
 * per browser. Switching applies the entity's theme + branding and (to guarantee no
 * cross-entity data bleed, which matters for confidentiality) reloads the page so
 * records, parsed rows and form state all reset to the chosen entity.
 *
 * Exposes window.QUAY_ENTITY for app.js / records.js:
 *   .key            current entity key ('quay1' | 'active')
 *   .cfg            current entity config object (from QUAY_CFG.ENTITIES)
 *   .mail           current entity's { endpoint, token }
 *   .invoice        current entity's invoice/issuer config
 *   .logoPdf()      resolved PDF logo data URI for the current entity
 *   .set(key)       persist + switch (reloads)
 */
(function(){
  "use strict";
  var CFG = window.QUAY_CFG || {};
  var ENTITIES = CFG.ENTITIES || {};
  var LS_KEY = "quay_invoicing_entity";

  function validKey(k){ return k && ENTITIES[k]; }
  function stored(){ try{ return localStorage.getItem(LS_KEY); }catch(e){ return null; } }
  function currentKey(){
    var k = stored();
    if(validKey(k)) return k;
    return validKey(CFG.DEFAULT_ENTITY) ? CFG.DEFAULT_ENTITY : Object.keys(ENTITIES)[0];
  }

  var KEY = currentKey();
  var CE  = ENTITIES[KEY] || {};

  function resolveLogoPdf(){
    var ref = (CE.invoice && CE.invoice.logoPdf) || "";
    if(!ref) return "";
    if(ref.indexOf("data:") === 0) return ref;      // inline data URI
    return window[ref] || "";                        // named global, e.g. QUAY_LOGO_PDF
  }

  function applyTheme(){
    var root = document.documentElement;
    root.setAttribute("data-entity", KEY);
    var t = CE.theme || {};
    Object.keys(t).forEach(function(k){ root.style.setProperty(k, t[k]); });
  }

  function applyBranding(){
    // document title
    try{ document.title = "Broker Invoicing · " + (CE.label || ""); }catch(e){}
    // header + gate wordmark
    var hdr = document.getElementById("hdrFlag");
    if(hdr && CE.logoHeader){ hdr.src = CE.logoHeader; hdr.alt = CE.label || ""; }
    var gate = document.getElementById("gateLogo");
    if(gate && CE.logoHeader){ gate.src = CE.logoHeader; gate.alt = CE.label || ""; }
    // context strip (app.js.setCtx uses this as the idle text)
    var ctx = document.getElementById("ctx");
    if(ctx && CE.ctx) ctx.textContent = CE.ctx;
    // reflect selection on the pill toggle
    document.querySelectorAll(".entity-toggle [data-entity-key]").forEach(function(btn){
      btn.classList.toggle("on", btn.getAttribute("data-entity-key") === KEY);
    });
  }

  function apply(){ applyTheme(); applyBranding(); }

  function set(key){
    if(!validKey(key) || key === KEY) return;
    try{ localStorage.setItem(LS_KEY, key); }catch(e){}
    // full reload: cleanest guarantee that no other-entity data lingers in memory
    location.reload();
  }

  function wireToggle(){
    document.querySelectorAll(".entity-toggle [data-entity-key]").forEach(function(btn){
      btn.addEventListener("click", function(){ set(btn.getAttribute("data-entity-key")); });
    });
  }

  window.QUAY_ENTITY = {
    get key(){ return KEY; },
    get cfg(){ return CE; },
    get mail(){ return CE.mail || { endpoint:"", token:"" }; },
    get invoice(){ return CE.invoice || {}; },
    get label(){ return CE.label || ""; },
    logoPdf: resolveLogoPdf,
    set: set
  };

  // apply as early as possible; branding/toggle need the DOM
  applyTheme();
  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", function(){ apply(); wireToggle(); });
  } else { apply(); wireToggle(); }
})();
