/* Auth gate — supers + payroll only. Reuses the Quay staff/auth model. */
(function(){
  "use strict";
  const $ = s => document.querySelector(s);
  const cfg = window.QUAY_CFG || {};
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth:{ persistSession:true, autoRefreshToken:true, storageKey:'quay-brokerinv-auth' }
  });
  window.sb = sb;
  window.SESSION = null;
  const authed = new Set();          // callbacks to run once authed
  window.onQuayAuth = cb => { if(window.SESSION) cb(window.SESSION); else authed.add(cb); };

  if (window.QUAY_LOGO) $("#gateLogo").src = window.QUAY_LOGO;

  const isPayroll = s => !!s && (s.designation === 'payroll' || !!s.is_payroll);

  function grant(staff){
    window.SESSION = {
      id: staff.id, name: staff.name || staff.email || 'User', email: staff.email || '',
      super: !!staff.is_super, payroll: isPayroll(staff),
      allowed_sites: Array.isArray(staff.allowed_sites) ? staff.allowed_sites : []
    };
    $("#gate").style.display = 'none';
    $("#app").classList.add('ready');
    $("#who").innerHTML = `<b>${esc(window.SESSION.name)}</b><br>${window.SESSION.super?'Superuser':'Payroll'}`;
    // app switcher on the flag
    try{
      if(window.QuayNav) window.QuayNav.mount({ isSuper:window.SESSION.super, allowedSites:window.SESSION.allowed_sites, current:'invoicing', anchor:'#hdrFlag' });
    }catch(e){}
    authed.forEach(cb=>{ try{cb(window.SESSION);}catch(e){console.error(e);} }); authed.clear();
  }

  async function checkStaff(user){
    const { data:staff, error } = await sb.from('staff').select('*').eq('auth_user_id', user.id).maybeSingle();
    if (error || !staff || staff.active === false) return null;
    if (!(staff.is_super || isPayroll(staff))) return null;   // supers + payroll only
    return staff;
  }

  async function login(){
    const email = $("#gEmail").value.trim(), pin = $("#gPin").value;
    const err = $("#gErr"); err.textContent = '';
    if(!email || !pin){ err.textContent = 'Enter email and PIN.'; return; }
    $("#gBtn").disabled = true; $("#gBtn").textContent = 'Signing in…';
    try{
      const { data, error } = await sb.auth.signInWithPassword({ email, password: pin });
      if (error || !data.user) throw new Error('Email or PIN not recognised');
      const staff = await checkStaff(data.user);
      if (!staff){ await sb.auth.signOut(); throw new Error('This tool is for superusers and payroll only.'); }
      grant(staff);
    }catch(e){ err.textContent = e.message || 'Sign-in failed.'; }
    finally{ $("#gBtn").disabled = false; $("#gBtn").textContent = 'Sign in'; }
  }

  $("#gBtn").addEventListener('click', login);
  $("#gPin").addEventListener('keydown', e=>{ if(e.key==='Enter') login(); });
  $("#gEmail").addEventListener('keydown', e=>{ if(e.key==='Enter') $("#gPin").focus(); });
  $("#logout").addEventListener('click', async ()=>{ await sb.auth.signOut(); location.reload(); });

  // resume an existing session silently
  (async ()=>{
    try{
      const { data } = await sb.auth.getSession();
      if (data && data.session && data.session.user){
        const staff = await checkStaff(data.session.user);
        if (staff){ grant(staff); return; }
        await sb.auth.signOut();
      }
    }catch(e){}
    $("#gEmail").focus();
  })();

  // view tabs
  document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>{
    document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('on', x===t));
    const v = t.dataset.view;
    $("#viewNew").classList.toggle('hidden', v!=='new');
    $("#viewRecords").classList.toggle('hidden', v!=='records');
    if (v==='records' && window.Records) window.Records.load();
  }));

  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }
})();
