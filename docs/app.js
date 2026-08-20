/* SA Broker Invoicing — client-side SAGE CSV -> Quay 1 tax invoices */
(function(){
  "use strict";
  const $ = s => document.querySelector(s);
  const LOGO = window.QUAY_LOGO || "";               // header/gate mark (flags SVG)
  const LOGO_PDF = window.QUAY_LOGO_PDF || "";        // raster logo for the PDF (jsPDF can't take SVG)
  const LS_KEY = "quay_broker_dir_v1";
  const LS_LAST = "quay_brokerinv_last";
  document.getElementById("hdrFlag").src = "assets/quay1-logo-white.png";  // unified Quay 1 wordmark (LOGO flags kept for the login gate/PDF)

  let ROWS = [];        // parsed invoice line objects (kept lines only)
  let META = {siv:0, paye:0, kept:0};
  let SRC_FILE = "";    // filename of the current upload

  /* ---------- CSV parsing (handles quotes, sep= line) ---------- */
  function parseCSV(text){
    text = text.replace(/^﻿/, "");
    const lines = text.split(/\r\n|\n|\r/);
    let start = 0;
    if (lines[0] && /^sep=/i.test(lines[0].trim())) start = 1;
    // find header
    const rows = [];
    let field = "", row = [], inQ = false;
    // rejoin from start, parse char by char across the whole remainder
    const body = lines.slice(start).join("\n");
    for (let i=0;i<body.length;i++){
      const c = body[i];
      if (inQ){
        if (c === '"'){
          if (body[i+1] === '"'){ field+='"'; i++; }
          else inQ = false;
        } else field += c;
      } else {
        if (c === '"') inQ = true;
        else if (c === ','){ row.push(field); field=""; }
        else if (c === '\n'){ row.push(field); rows.push(row); row=[]; field=""; }
        else field += c;
      }
    }
    if (field.length || row.length){ row.push(field); rows.push(row); }
    return rows.filter(r => r.length && r.some(v => v.trim() !== ""));
  }

  function colIndex(header){
    const idx = {};
    header.forEach((h,i)=>{ idx[h.trim().toLowerCase().replace(/\.$/,"")]=i; });
    const pick = (...names)=>{ for(const n of names){ const k=n.toLowerCase(); if(k in idx) return idx[k]; } return -1; };
    return {
      date: pick("date"),
      doc: pick("document no","document number","document no."),
      desc: pick("supplier inv no","supplier invoice no","supplier inv. no","supplier inv. no."),
      supplier: pick("supplier"),
      excl: pick("exclusive"),
      vat: pick("vat"),
      total: pick("total purchases"),
      out: pick("total outstanding")
    };
  }

  const num = v => { const n = parseFloat(String(v).replace(/[^0-9.\-]/g,"")); return isNaN(n)?0:Math.abs(n); };
  const fmtDate = v => { const m = String(v).match(/(\d{4})\D(\d{1,2})\D(\d{1,2})/); return m ? `${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}` : String(v||""); };
  const money = n => "R" + n.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
  // On-screen figures: manual grouping — space thousands, dot decimals (R 15 502.00) per worksheet spec.
  const moneyUI = n => {
    const neg = n < 0; const [whole, dec] = Math.abs(n).toFixed(2).split(".");
    const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    return (neg ? "-R " : "R ") + grouped + "." + dec;
  };

  function ingest(text){
    const rows = parseCSV(text);
    if (rows.length < 2) return {error:"Couldn't read any rows from that file."};
    const header = rows[0];
    const c = colIndex(header);
    if (c.doc < 0 || c.desc < 0){ return {error:"This doesn't look like a SAGE Supplier Invoices export (missing Document No. / Supplier Inv. No. columns)."}; }
    const out = []; let siv=0, paye=0;
    for (let r=1; r<rows.length; r++){
      const row = rows[r];
      const doc = (row[c.doc]||"").trim();
      const desc = (row[c.desc]||"").trim();
      if (!doc) continue;
      if (/^SIV/i.test(doc)){ siv++; continue; }               // drop SIV
      if (!/^INV/i.test(doc)) continue;                         // only INV docs
      if (/^paye$/i.test(desc) || /interest/i.test(desc)){ paye++; continue; } // drop PAYE & Interest
      out.push({
        on:true,
        doc, date: fmtDate(row[c.date]),
        division: desc,
        supplier: (row[c.supplier]||"").trim(),
        excl: c.excl>=0? num(row[c.excl]) : 0,
        vat:  c.vat>=0?  num(row[c.vat])  : 0,
        total:c.total>=0?num(row[c.total]): (c.excl>=0?num(row[c.excl]):0),
        out:  c.out>=0?  num(row[c.out])  : 0
      });
    }
    return {rows:out, siv, paye, supplier: out.length?out[0].supplier:""};
  }

  /* ---------- broker directory (localStorage) ---------- */
  const seed = {
    "justin matthew nortier":{vat:"",postal:"",delivery:"606 Graceville, 102 Rosmead Avenue\nKenilworth, 7708"},
    "nicholas strydom":{vat:"",postal:"3 Riesling Street\nOude Westhof\nCape Town\n7530",delivery:"3 Riesling Street\nOude Westhof\nCape Town\n7530"}
  };
  function dir(){ try{ return Object.assign({}, seed, JSON.parse(localStorage.getItem(LS_KEY)||"{}")); }catch(e){ return Object.assign({},seed); } }
  function saveDir(name,rec){ const d=JSON.parse(localStorage.getItem(LS_KEY)||"{}"); d[name.trim().toLowerCase()]=rec; localStorage.setItem(LS_KEY,JSON.stringify(d)); }
  function loadBroker(name){
    const rec = dir()[(name||"").trim().toLowerCase()];
    if(rec){ $("#bkVat").value=rec.vat||""; $("#bkPostal").value=rec.postal||""; $("#bkDelivery").value=rec.delivery||""; if($("#bkEmail")) $("#bkEmail").value=rec.email||""; }
  }

  /* ---------- paged wizard navigation ---------- */
  let PAGE = 1, PARSED = false, SAVED = false;

  function setCtx(){
    const el = $("#ctx"); if(!el) return;
    if(!PARSED){ el.textContent = "SAGE → Quay 1 tax invoices"; return; }
    const broker = ($("#bkName") && $("#bkName").value.trim()) || "";
    const parts = [];
    if(SRC_FILE) parts.push(SRC_FILE);
    if(PAGE>=2 && broker) parts.push(broker + " · " + activeRows().length + " lines");
    el.textContent = parts.join("   —   ") || "SAGE → Quay 1 tax invoices";
  }

  function renderRail(){
    for(let i=1;i<=4;i++){
      const el = $("#r"+i); if(!el) continue;
      el.classList.remove("current","done","todo");
      if(i===PAGE) el.classList.add("current");
      else if(i<PAGE) el.classList.add("done");
      else el.classList.add("todo");
    }
    $("#railBatch").classList.toggle("hidden", !PARSED);
  }

  function renderFooter(){
    const back = $("#wizBack"), next = $("#wizNext"), st = $("#wizStatus");
    back.classList.toggle("hidden", PAGE===1);
    const a = activeRows();
    st.classList.remove("saved");
    if(PAGE===1){
      next.textContent = "Continue →"; next.disabled = !PARSED;
      st.textContent = PARSED ? `${ROWS.length} line(s) ready` : "Waiting for a file";
    } else if(PAGE===2){
      next.textContent = "Continue →"; next.disabled = false;
      st.textContent = ($("#bkName").value.trim() || "Broker") + " details";
    } else if(PAGE===3){
      next.textContent = "Continue →"; next.disabled = a.length===0;
      st.textContent = `${a.length} invoice(s) · ${moneyUI(a.reduce((s,r)=>s+r.total,0))}`;
    } else {
      next.textContent = "Finish batch"; next.disabled = a.length===0;
      if(SAVED){ st.textContent = "Saved to records"; st.classList.add("saved"); }
      else st.textContent = "Not yet saved";
    }
  }

  function gotoPage(n){
    if(n>1 && !PARSED) return;
    n = Math.max(1, Math.min(4, n));
    PAGE = n;
    for(let i=1;i<=4;i++) $("#page"+i).classList.toggle("on", i===n);
    if(n===3) renderTable();
    if(n===4) updateGen();
    renderRail(); renderFooter(); setCtx();
    const sc = document.querySelector(".sheet"); if(sc) sc.scrollTop = 0;
  }

  function onParsed(res, filename){
    const pm = $("#parseMsg");
    if(res.error){ pm.innerHTML = `<div class="banner warn">${res.error}</div>`; return; }
    ROWS = res.rows; META = {siv:res.siv, paye:res.paye, kept:res.rows.length}; SRC_FILE = filename||""; PARSED = true; SAVED = false;
    pm.innerHTML = `<div class="fchip">✓ <b>${escapeHtml(filename)}</b> &middot; ${res.rows.length} line(s) after filtering</div>`;
    $("#bkName").value = res.supplier || "";
    loadBroker(res.supplier);
    // review intro reflects what was filtered out
    $("#reviewIntro").textContent = `Untick anything that shouldn't be invoiced, or edit a division inline. ${META.siv+META.paye} row(s) were removed by the filters.`;
    renderTable();
    renderRail(); renderFooter(); setCtx();
    // record "last upload" for next visit
    try{
      const d = (res.rows[0] && res.rows[0].date) || "";
      const label = d ? monthLabel(d) : "";
      localStorage.setItem(LS_LAST, JSON.stringify({label, count:res.rows.length}));
    }catch(e){}
  }

  function monthLabel(iso){
    const m = String(iso).match(/(\d{4})-(\d{2})/); if(!m) return "";
    const names=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${names[(+m[2])-1]||""} ${m[1]}`;
  }
  function showLastUpload(){
    try{
      const l = JSON.parse(localStorage.getItem(LS_LAST)||"null");
      if(l && l.count) $("#lastUpload").textContent = `${l.label||"Previous"} · ${l.count} invoices`;
    }catch(e){}
  }

  function renderTable(){
    const tb = $("#tbody"); tb.innerHTML="";
    ROWS.forEach((r,i)=>{
      const tr = document.createElement("tr");
      tr.className = r.on?"":"off";
      tr.innerHTML =
        `<td><input type="checkbox" data-i="${i}" class="chkRow" ${r.on?"checked":""}></td>`+
        `<td class="num">${r.doc}</td><td class="num">${r.date}</td>`+
        `<td><span class="divedit" contenteditable="true" data-i="${i}">${escapeHtml(r.division)}</span></td>`+
        `<td class="num">${moneyUI(r.excl)}</td>`+
        `<td class="num">${moneyUI(r.vat)}</td>`+
        `<td class="num"><input class="amt" data-i="${i}" value="${r.total.toFixed(2)}"></td>`;
      tb.appendChild(tr);
    });
    tb.querySelectorAll(".chkRow").forEach(cb=>cb.addEventListener("change",e=>{ ROWS[+e.target.dataset.i].on=e.target.checked; e.target.closest("tr").classList.toggle("off",!e.target.checked); updateStats(); }));
    tb.querySelectorAll(".divedit").forEach(el=>el.addEventListener("input",e=>{ ROWS[+e.target.dataset.i].division=e.target.textContent; }));
    tb.querySelectorAll(".amt").forEach(el=>el.addEventListener("input",e=>{ ROWS[+e.target.dataset.i].total=num(e.target.value); updateStats(); }));
    updateStats();
  }
  function escapeHtml(s){ return String(s).replace(/[&<>]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[m])); }

  function activeRows(){ return ROWS.filter(r=>r.on); }
  function updateStats(){
    const a = activeRows();
    const tot = a.reduce((s,r)=>s+r.total,0);
    $("#stKeep").textContent = a.length;
    $("#stTotal").textContent = moneyUI(tot);
    $("#stSiv").textContent = META.siv;
    $("#stPaye").textContent = META.paye;
    $("#railInv").textContent = a.length;
    $("#railTot").textContent = moneyUI(tot);
    updateGen();
    renderFooter();
  }
  function updateGen(){
    const a = activeRows();
    const tot = a.reduce((s,r)=>s+r.total,0);
    $("#genInv").textContent = a.length;
    $("#genTot").textContent = moneyUI(tot);
    const gc = $("#genCount"); gc.textContent = a.length ? `${a.length} ready` : "no lines"; gc.classList.toggle("hidden", !PARSED);
    $("#btnZip").disabled = a.length===0;
    $("#btnPreview").disabled = a.length===0;
    $("#btnSave").disabled = a.length===0;
  }

  /* ---------- invoice config from form ---------- */
  function cfg(){
    return {
      brokerName: $("#bkName").value.trim(),
      brokerVat: $("#bkVat").value.trim(),
      brokerPostal: $("#bkPostal").value.trim(),
      brokerDelivery: $("#bkDelivery").value.trim(),
      chargeDesc: $("#chargeDesc").value.split(/\n/).map(s=>s.trim()).filter(Boolean),
      sellerVat: $("#sellerVat").value.trim(),
      sellerAddr: $("#sellerAddr").value.split(/\n/).map(s=>s.trim()).filter(Boolean)
    };
  }

  /* ---------- PDF (matches INV0008156 template) ---------- */
  function drawInvoice(doc, inv, C){
    const { jsPDF } = window.jspdf;
    const L=14, R=196, grey=[120,127,140], ink=[28,35,51];
    const label=(t,x,y)=>{ doc.setFont("helvetica","bold").setFontSize(7.5).setTextColor(...grey); doc.text(t,x,y); };
    const val=(t,x,y,sz,bold)=>{ doc.setFont("helvetica",bold?"bold":"normal").setFontSize(sz||9).setTextColor(...ink); doc.text(String(t),x,y); };

    // Title + logo
    doc.setFont("helvetica","bold").setFontSize(22).setTextColor(...ink); doc.text("INVOICE", L, 22);
    if(LOGO_PDF){ try{ doc.addImage(LOGO_PDF,"JPEG",132,10,64,64*184/300); }catch(e){} }

    label("NUMBER:", L, 33); val(inv.doc, 44, 33, 9, true);
    label("DATE:",   L, 39); val(inv.date, 44, 39, 9, true);

    // FROM / TO
    label("FROM", L, 60); label("TO", 110, 60);
    val("IGCISA INVESTMENT HOLDINGS", L, 67, 11, true);
    val("t/a Quay 1 International Realty", L, 72.5, 11, true);
    val(C.brokerName || inv.supplier || "", 110, 67, 12, true);

    label("VAT NO:", L, 84); val(C.sellerVat, 30, 84, 8.5);
    label("CUSTOMER VAT NO:", 110, 84); val(C.brokerVat, 146, 84, 8.5);

    // address columns
    label("POSTAL ADDRESS:", L, 94); label("DELIVERY ADDRESS:", 50, 94);
    label("POSTAL ADDRESS:", 110, 94); label("DELIVERY ADDRESS:", 150, 94);
    const block=(lines,x,y)=>{ doc.setFont("helvetica","normal").setFontSize(8.5).setTextColor(...ink); (lines||[]).forEach((ln,i)=>doc.text(ln,x,y+i*4.4)); };
    block(C.sellerAddr, L, 100); block(C.sellerAddr, 50, 100);
    block(C.brokerPostal?C.brokerPostal.split(/\n/):[], 110, 100);
    block(C.brokerDelivery?C.brokerDelivery.split(/\n/):[], 150, 100);

    // table
    let ty=128;
    doc.setDrawColor(200,206,218).setLineWidth(0.3); doc.line(L,ty,R,ty);
    doc.setFont("helvetica","italic").setFontSize(8.5).setTextColor(...grey);
    doc.text("Description", L, ty+5); doc.text("Division", 86, ty+5);
    doc.text("Unit Price", 168, ty+5, {align:"right"}); doc.text("Incl. Total", R, ty+5, {align:"right"});
    doc.line(L,ty+8,R,ty+8);

    let ry=ty+16;
    doc.setFont("helvetica","normal").setFontSize(9).setTextColor(...ink);
    doc.text(C.chargeDesc[0]||"Monthly broker charges for:", L, ry);
    (C.chargeDesc.slice(1)).forEach((ln,i)=>doc.text(ln, L+8, ry+6+i*5));
    const divLines = doc.splitTextToSize(inv.division||"", 74);
    doc.text(divLines, 86, ry);
    doc.text(money(inv.total), 168, ry, {align:"right"});
    doc.text(money(inv.total), R, ry, {align:"right"});
    doc.line(L, 205, R, 205);

    // totals block
    const ly=214, vx=R, lx=150;
    doc.setFont("helvetica","normal").setFontSize(9).setTextColor(...grey);
    doc.text("Sub Total:", lx, ly); doc.text("Total VAT:", lx, ly+6);
    doc.setFont("helvetica","bold").setTextColor(...ink);
    doc.text(money(inv.total), vx, ly, {align:"right"});
    doc.text(money(inv.vat), vx, ly+6, {align:"right"});
    doc.setFont("helvetica","normal").setTextColor(...grey); doc.text("Grand Total:", lx, ly+16);
    doc.setFont("helvetica","bold").setTextColor(...ink).setFontSize(10);
    doc.text(money(inv.total), vx, ly+16, {align:"right"});
    doc.setFont("helvetica","bold").setFontSize(9).setTextColor(...grey); doc.text("BALANCE DUE", vx, ly+24, {align:"right"});
    doc.setFontSize(12).setTextColor(...ink); doc.text(money(inv.out), vx, ly+31, {align:"right"});
  }

  function makeDoc(inv, C){
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({unit:"mm", format:"a4"});
    drawInvoice(doc, inv, C);
    return doc;
  }

  /* ---------- actions ---------- */
  // Preview: one invoice = single pane; many = a side-by-side carousel you can step through.
  let PV_IO = null;
  function renderSlide(slide, row, C){
    if(slide.dataset.rendered) return;
    slide.dataset.rendered = "1";
    try{
      const url = makeDoc(row, C).output("datauristring");
      slide.innerHTML = `<iframe src="${url}" title="${row.doc}"></iframe>`;
    }catch(e){ slide.dataset.rendered = ""; slide.innerHTML = `<span class="ph">Couldn't render ${row.doc}</span>`; }
  }
  function showPreview(){
    const a = activeRows(); if(!a.length) return;
    const C = cfg(), cv = $("#preview"), nav = $("#pvNav"), lbl = $("#previewLabel");
    if(PV_IO){ PV_IO.disconnect(); PV_IO = null; }

    if(a.length === 1){
      nav.classList.add("hidden");
      lbl.textContent = `Preview · ${a[0].doc}.pdf`;
      cv.innerHTML = `<iframe src="${makeDoc(a[0], C).output("datauristring")}" title="invoice preview"></iframe>`;
      return;
    }

    nav.classList.remove("hidden");
    cv.innerHTML = `<div class="pvtrack" id="pvTrack">${
      a.map((r,i)=>`<div class="pvslide" data-i="${i}"><span class="ph">${r.doc}&hellip;</span></div>`).join("")
    }</div>`;
    const track = $("#pvTrack"), slides = Array.from(track.children);
    // lazy-render slides only as they come into view (fast for hundreds of invoices)
    PV_IO = new IntersectionObserver(ents=>ents.forEach(en=>{
      if(en.isIntersecting) renderSlide(en.target, a[+en.target.dataset.i], C);
    }), { root: track, rootMargin: "0px 300px", threshold: 0.05 });
    slides.forEach(s=>PV_IO.observe(s));

    const curIdx = ()=>{ const w = track.clientWidth||1; return Math.min(a.length-1, Math.max(0, Math.round(track.scrollLeft/w))); };
    const sync = ()=>{
      const i = curIdx();
      $("#pvCount").textContent = `${i+1} / ${a.length}`;
      lbl.textContent = `Preview · ${a[i].doc}.pdf`;
      $("#pvPrev").disabled = i===0;
      $("#pvNext").disabled = i===a.length-1;
    };
    const jump = d=>{ const w=track.clientWidth; track.scrollTo({left:(curIdx()+d)*w, behavior:"smooth"}); };
    track.addEventListener("scroll", sync);
    $("#pvPrev").onclick = ()=>jump(-1);
    $("#pvNext").onclick = ()=>jump(1);
    renderSlide(slides[0], a[0], C);
    sync();
  }
  $("#btnPreview").addEventListener("click", showPreview);
  // arrow keys step the carousel while page 4 is showing it
  document.addEventListener("keydown", e=>{
    if(PAGE!==4 || $("#pvNav").classList.contains("hidden")) return;
    const t = e.target; if(t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    if(e.key==="ArrowLeft"){ e.preventDefault(); $("#pvPrev").click(); }
    else if(e.key==="ArrowRight"){ e.preventDefault(); $("#pvNext").click(); }
  });

  $("#btnZip").addEventListener("click", async ()=>{
    const a = activeRows(); if(!a.length) return;
    const C = cfg();
    const zip = new JSZip();
    const pw = $("#progWrap"), pb = $("#progBar"), pc = $("#progCap");
    pw.classList.remove("hidden"); pc.classList.remove("hidden");
    for(let i=0;i<a.length;i++){
      const doc = makeDoc(a[i], C);
      zip.file(`${a[i].doc}.pdf`, doc.output("blob"));
      pb.style.width = Math.round((i+1)/a.length*100)+"%";
      pc.textContent = `${i+1} of ${a.length} PDFs rendered`;
      if(i%15===0) await new Promise(r=>setTimeout(r,0));
    }
    const blob = await zip.generateAsync({type:"blob"});
    const safe = (C.brokerName||"broker").replace(/[^\w]+/g,"_");
    downloadBlob(blob, `Invoices_${safe}.zip`);
    setTimeout(()=>{ pw.classList.add("hidden"); pc.classList.add("hidden"); },1200);
  });

  function downloadBlob(blob,name){ const u=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=u; a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(u),1500); }

  /* ---------- broker save ---------- */
  $("#saveBroker").addEventListener("click", ()=>{
    const name=$("#bkName").value.trim(); if(!name) return;
    saveDir(name,{vat:$("#bkVat").value.trim(),postal:$("#bkPostal").value.trim(),delivery:$("#bkDelivery").value.trim(),email:($("#bkEmail")?$("#bkEmail").value.trim():"")});
    const m=$("#savedMsg"); m.classList.remove("hidden"); setTimeout(()=>m.classList.add("hidden"),1600);
  });
  $("#bkName").addEventListener("change", e=>{ loadBroker(e.target.value); setCtx(); });

  $("#chkAll").addEventListener("change", e=>{ ROWS.forEach(r=>r.on=e.target.checked); renderTable(); });

  /* ---------- file input / drop ---------- */
  const drop=$("#drop"), file=$("#file");
  drop.addEventListener("click", ()=>file.click());
  file.addEventListener("change", e=>{ const f=e.target.files[0]; if(f) readFile(f); });
  ["dragover","dragenter"].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add("hover");}));
  ["dragleave","drop"].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove("hover");}));
  drop.addEventListener("drop", e=>{ const f=e.dataTransfer.files[0]; if(f) readFile(f); });
  function readFile(f){ const rd=new FileReader(); rd.onload=()=>{ onParsed(ingest(rd.result), f.name); }; rd.readAsText(f); }

  /* ---------- wizard controls ---------- */
  $("#wizBack").addEventListener("click", ()=>gotoPage(PAGE-1));
  $("#wizNext").addEventListener("click", ()=>{ if(PAGE<4) gotoPage(PAGE+1); else finishBatch(); });
  document.querySelectorAll(".step").forEach(s=>s.addEventListener("click", ()=>{
    const step = +s.dataset.step;
    if(step < PAGE && PARSED) gotoPage(step);   // only completed steps are clickable
  }));

  async function finishBatch(){
    const ok = await saveBatch();
    if(ok){ const rt = document.querySelector('.tab[data-view="records"]'); if(rt) rt.click(); }
  }

  /* ---------- save to records (Supabase) ---------- */
  // Build a full invoice cfg for a broker from the saved directory + page defaults.
  function brokerCfg(name){
    const rec = dir()[(name||"").trim().toLowerCase()] || {};
    return {
      brokerName: name||"", brokerVat: rec.vat||"", brokerPostal: rec.postal||"", brokerDelivery: rec.delivery||"", brokerEmail: rec.email||"",
      chargeDesc: ($("#chargeDesc").value||"").split(/\n/).map(s=>s.trim()).filter(Boolean),
      sellerVat: $("#sellerVat").value.trim(),
      sellerAddr: ($("#sellerAddr").value||"").split(/\n/).map(s=>s.trim()).filter(Boolean)
    };
  }

  async function saveBatch(){
    const a = activeRows(); if(!a.length) return false;
    const msg = $("#saveMsg"); const btn = $("#btnSave");
    if(!window.sb){ msg.innerHTML='<div class="banner warn">Not signed in.</div>'; return false; }
    btn.disabled=true; btn.textContent="Saving…";
    try{
      let uid=null; try{ const u=await window.sb.auth.getUser(); uid=u&&u.data&&u.data.user?u.data.user.id:null; }catch(e){}
      const broker = $("#bkName").value.trim();
      const S = window.SESSION||{};
      const payload = a.map(r=>({
        doc_no:r.doc, broker_name: broker || r.supplier || "",
        inv_date: r.date || null, division:r.division,
        excl:+r.excl.toFixed(2), vat:+r.vat.toFixed(2), total:+r.total.toFixed(2), outstanding:+r.out.toFixed(2),
        source_filename: SRC_FILE, created_by: uid, created_by_name: S.name||null
      }));
      const { error } = await window.sb.from("broker_invoices").upsert(payload, { onConflict:"doc_no" });
      if(error) throw error;
      msg.innerHTML = `<div class="banner ok">Saved ${payload.length} invoice(s) for <b>${escapeHtml(broker)}</b>. See <b>Records</b>.</div>`;
      if(window.Records) window.Records.invalidate();
      SAVED = true; renderFooter();
      return true;
    }catch(e){
      msg.innerHTML = `<div class="banner warn">Couldn't save: ${escapeHtml(e.message||String(e))}</div>`;
      return false;
    }finally{ btn.disabled=false; btn.textContent="Save to records"; }
  }
  $("#btnSave").addEventListener("click", saveBatch);

  /* ---------- init ---------- */
  showLastUpload();
  renderRail(); renderFooter();

  // shared API for records.js (regenerating stored invoices) + tests
  window.Invoicing = { makeDoc, money, brokerCfg, downloadBlob, ingest, activeRows, get ROWS(){return ROWS;} };
})();
