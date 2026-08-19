/* Records & history — browse saved invoices by broker or month, re-download. */
(function(){
  "use strict";
  const $ = s => document.querySelector(s);
  let CACHE = null;       // all rows, or null if not loaded
  let loading = false;
  const money = n => window.Invoicing ? window.Invoicing.money(+n||0) : ("R"+(+n||0).toFixed(2));
  const esc = s => String(s==null?"":s).replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
  const monthKey = d => (d||"").slice(0,7);
  const monthName = k => { if(!k) return "Undated"; const [y,m]=k.split("-"); return new Date(y,+m-1,1).toLocaleDateString("en-ZA",{month:"long",year:"numeric"}); };

  async function fetchAll(){
    if(!window.sb) return [];
    const { data, error } = await window.sb.from("broker_invoices")
      .select("doc_no,broker_name,inv_date,division,excl,vat,total,outstanding,source_filename,created_at")
      .order("inv_date",{ascending:false}).limit(20000);
    if(error){ throw error; }
    return data||[];
  }

  async function load(){
    if(loading) return; loading = true;
    const body = $("#recBody");
    if(!CACHE) body.innerHTML = '<p class="muted">Loading records…</p>';
    try{
      if(!CACHE) CACHE = await fetchAll();
      buildFilters(); render();
    }catch(e){
      body.innerHTML = `<div class="banner warn">Couldn't load records: ${esc(e.message||String(e))}</div>`;
    }finally{ loading=false; }
  }
  function invalidate(){ CACHE=null; }

  function buildFilters(){
    const brokers=[...new Set(CACHE.map(r=>r.broker_name).filter(Boolean))].sort();
    $("#brokerList").innerHTML = brokers.map(b=>`<option value="${esc(b)}">`).join("");
    const years=[...new Set(CACHE.map(r=>monthKey(r.inv_date).slice(0,4)).filter(Boolean))].sort().reverse();
    const cur=$("#recYear").value;
    $("#recYear").innerHTML = '<option value="">all</option>'+years.map(y=>`<option value="${y}">${y}</option>`).join("");
    if(cur) $("#recYear").value=cur;
  }

  function filtered(){
    const bk=($("#recBroker").value||"").trim().toLowerCase();
    const yr=$("#recYear").value;
    return CACHE.filter(r=>{
      if(bk && !(r.broker_name||"").toLowerCase().includes(bk)) return false;
      if(yr && monthKey(r.inv_date).slice(0,4)!==yr) return false;
      return true;
    });
  }

  function render(){
    const body=$("#recBody"); const rows=filtered();
    if(!CACHE.length){ body.innerHTML='<div class="banner info">No records yet. Generate and <b>Save to records</b> on the New invoices tab.</div>'; return; }
    if(!rows.length){ body.innerHTML='<div class="banner info">No invoices match this filter.</div>'; return; }
    const mode=$("#recMode").value;
    body.innerHTML = mode==="broker" ? renderBroker(rows) : renderMonth(rows);
    wire(body);
  }

  function totals(rows){ return rows.reduce((s,r)=>s+(+r.total||0),0); }

  function renderBroker(rows){
    const groups={};
    rows.forEach(r=>{ (groups[r.broker_name]=groups[r.broker_name]||[]).push(r); });
    const names=Object.keys(groups).sort((a,b)=>totals(groups[b])-totals(groups[a]));
    // summary strip
    const grand=totals(rows);
    let html=`<div class="banner info" style="margin-bottom:10px">${rows.length} invoice(s) across ${names.length} broker(s) &middot; total <b>${money(grand)}</b></div>`;
    // if a single broker is filtered, drill straight into their months
    if(names.length===1){ return html+renderBrokerDetail(names[0], groups[names[0]]); }
    html+='<div class="bkgrid">'+names.map(n=>{
      const g=groups[n]; const latest=g.map(r=>r.inv_date).filter(Boolean).sort().pop()||"";
      return `<div class="bkcard" data-broker="${esc(n)}"><div class="n">${esc(n)}</div>`+
        `<div class="m">${g.length} invoice(s) &middot; latest ${latest||"—"}</div>`+
        `<div class="t">${money(totals(g))}</div></div>`;
    }).join("")+'</div>';
    return html;
  }

  function renderBrokerDetail(name, rows){
    const byM={}; rows.forEach(r=>{ const k=monthKey(r.inv_date); (byM[k]=byM[k]||[]).push(r); });
    const keys=Object.keys(byM).sort().reverse();
    let html=`<div class="monthhdr"><span>${esc(name)}</span><span class="pill">${rows.length} invoice(s)</span><span>${money(totals(rows))}</span>`+
      `<span class="flexspace"></span><button class="btn sm zipBtn" data-broker="${esc(name)}">Download all as ZIP</button></div>`;
    keys.forEach(k=>{ html+=monthBlock(monthName(k)+" · "+esc(name), byM[k]); });
    return html;
  }

  function renderMonth(rows){
    const byM={}; rows.forEach(r=>{ const k=monthKey(r.inv_date); (byM[k]=byM[k]||[]).push(r); });
    const keys=Object.keys(byM).sort().reverse();
    const grand=totals(rows);
    let html=`<div class="banner info" style="margin-bottom:10px">${rows.length} invoice(s) across ${keys.length} month(s) &middot; total <b>${money(grand)}</b></div>`;
    keys.forEach(k=>{ html+=monthBlock(monthName(k), byM[k]); });
    return html;
  }

  function monthBlock(title, rows){
    const id="zip_"+Math.abs(hash(title));
    const body=rows.map(r=>`<tr>`+
      `<td>${esc(r.doc_no)}</td><td>${esc(r.inv_date||"")}</td><td>${esc(r.broker_name)}</td>`+
      `<td>${esc(r.division||"")}</td><td class="num">${money(r.total)}</td></tr>`).join("");
    return `<div class="monthhdr"><span>${esc(title)}</span><span class="pill">${rows.length}</span><span>${money(totals(rows))}</span>`+
      `<span class="flexspace"></span><button class="btn sm zipBtnRows" data-id="${id}">Download ZIP</button></div>`+
      `<div class="tablewrap"><table><thead><tr><th>Invoice #</th><th>Date</th><th>Broker</th><th>Division</th><th class="num">Total</th></tr></thead>`+
      `<tbody data-zip="${id}">${body}</tbody></table></div>`;
  }
  function hash(s){ let h=0; for(let i=0;i<s.length;i++){ h=(h<<5)-h+s.charCodeAt(i)|0; } return h; }

  function rowsToInvoices(rows){
    return rows.map(r=>({ doc:r.doc_no, date:r.inv_date||"", division:r.division||"", supplier:r.broker_name||"",
      excl:+r.excl||0, vat:+r.vat||0, total:+r.total||0, out:+r.outstanding||0 }));
  }

  async function zipRows(rows, filename){
    if(!window.Invoicing || !window.JSZip){ alert("PDF engine not ready."); return; }
    const zip=new JSZip();
    const invs=rowsToInvoices(rows);
    for(let i=0;i<invs.length;i++){
      const C=window.Invoicing.brokerCfg(invs[i].supplier);
      const doc=window.Invoicing.makeDoc(invs[i], C);
      zip.file(`${invs[i].doc}.pdf`, doc.output("blob"));
      if(i%15===0) await new Promise(r=>setTimeout(r,0));
    }
    const blob=await zip.generateAsync({type:"blob"});
    window.Invoicing.downloadBlob(blob, filename);
  }

  function wire(body){
    body.querySelectorAll(".bkcard").forEach(c=>c.addEventListener("click",()=>{ $("#recBroker").value=c.dataset.broker; render(); }));
    body.querySelectorAll(".zipBtn").forEach(b=>b.addEventListener("click",async()=>{
      const name=b.dataset.broker; const rows=filtered().filter(r=>r.broker_name===name);
      b.disabled=true; b.textContent="Zipping…"; await zipRows(rows,`Invoices_${name.replace(/[^\w]+/g,"_")}.zip`); b.disabled=false; b.textContent="Download all as ZIP";
    }));
    body.querySelectorAll(".zipBtnRows").forEach(b=>b.addEventListener("click",async()=>{
      const tb=body.querySelector(`tbody[data-zip="${b.dataset.id}"]`);
      const docs=[...tb.querySelectorAll("tr td:first-child")].map(td=>td.textContent);
      const rows=filtered().filter(r=>docs.includes(r.doc_no));
      b.disabled=true; b.textContent="Zipping…"; await zipRows(rows,`Invoices_${b.dataset.id}.zip`); b.disabled=false; b.textContent="Download ZIP";
    }));
  }

  ["recMode","recBroker","recYear"].forEach(id=>{ const el=$("#"+id); el.addEventListener("input",render); el.addEventListener("change",render); });
  $("#recReload").addEventListener("click",()=>{ invalidate(); load(); });

  // test/preview injector: seed records without a DB round-trip
  function _inject(rows){ CACHE = rows||[]; buildFilters(); render(); }

  window.Records = { load, invalidate, _inject };
})();
