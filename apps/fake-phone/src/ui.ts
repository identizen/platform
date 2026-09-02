/** Browser UI for the fake phone: shows pending challenges with approve / deny buttons. */
export function renderUi(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Identizen fake phone</title>
<script>(function(){try{var t=localStorage.getItem('idz:theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();</script>
<style>
:root{--s0:oklch(.995 .002 250);--s1:oklch(.975 .003 250);--fg:oklch(.2 .02 260);--muted:oklch(.48 .02 260);--border:oklch(.89 .006 250);--accent:oklch(.55 .21 262);--danger:oklch(.58 .22 25);--ok:oklch(.6 .16 155);color-scheme:light}
:root[data-theme=dark]{--s0:oklch(.17 .012 260);--s1:oklch(.2 .013 260);--fg:oklch(.96 .005 250);--muted:oklch(.72 .015 260);--border:oklch(.28 .014 260);--accent:oklch(.68 .17 262);--danger:oklch(.68 .19 25);--ok:oklch(.7 .15 155);color-scheme:dark}
@media(prefers-color-scheme:dark){:root:not([data-theme=light]){--s0:oklch(.17 .012 260);--s1:oklch(.2 .013 260);--fg:oklch(.96 .005 250);--muted:oklch(.72 .015 260);--border:oklch(.28 .014 260);--accent:oklch(.68 .17 262);--danger:oklch(.68 .19 25);--ok:oklch(.7 .15 155);color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:var(--s0);color:var(--fg);display:grid;place-items:center;min-height:100vh}
.phone{width:min(92vw,360px);border:1px solid var(--border);border-radius:28px;padding:24px;background:var(--s1);min-height:560px;display:flex;flex-direction:column;gap:16px}
h1{font-size:15px;margin:0;font-weight:600}p{margin:0;color:var(--muted);font-size:13px;line-height:1.5}
.card{border:1px solid var(--border);border-radius:14px;padding:16px;background:var(--s0);display:flex;flex-direction:column;gap:10px}
.rp{font-weight:600;font-size:16px}.code{font-family:ui-monospace,Menlo,monospace;font-size:36px;letter-spacing:.12em;text-align:center;font-weight:600}
.reason{font-size:14px;padding:10px;border-radius:8px;background:var(--s1);border:1px solid var(--border)}
.row{display:flex;gap:8px}button{flex:1;border:0;border-radius:10px;padding:12px;font:inherit;font-weight:600;cursor:pointer}
.ok{background:var(--accent);color:#fff}.no{background:transparent;border:1px solid var(--border);color:var(--fg)}
.meta{font-family:ui-monospace,Menlo,monospace;font-size:11px;color:var(--muted);word-break:break-all}
.empty{text-align:center;color:var(--muted);font-size:13px;margin-top:auto;margin-bottom:auto}
select{font:inherit;border:1px solid var(--border);border-radius:8px;padding:6px 8px;background:var(--s0);color:var(--fg)}
.top{display:flex;justify-content:space-between;align-items:center;gap:8px}
.badge{font-size:11px;padding:2px 8px;border-radius:999px;background:var(--s0);border:1px solid var(--border);color:var(--muted)}
</style>
</head>
<body>
<div class="phone">
  <div class="top"><h1>Identizen</h1><span class="badge" id="who">not registered</span></div>
  <div class="top"><p>Policy</p><select id="policy"><option value="approve">auto-approve</option><option value="deny">auto-deny</option><option value="manual">ask me</option><option value="ignore">ignore</option></select></div>
  <div id="list"></div>
  <p class="empty" id="empty">Waiting for a sign-in request…</p>
  <p class="meta" id="meta"></p>
</div>
<script>
(function(){
  var list=document.getElementById('list'),empty=document.getElementById('empty'),who=document.getElementById('who'),meta=document.getElementById('meta'),policy=document.getElementById('policy');
  function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  function act(kind,id){fetch('/'+kind+'/'+id,{method:'POST'}).then(refresh);}
  window.act=act;
  policy.addEventListener('change',function(){fetch('/policy',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({policy:policy.value})});});
  function refresh(){fetch('/state').then(function(r){return r.json();}).then(function(s){
    who.textContent=s.registered?('device '+s.device_id.slice(0,12)+'…'):'not registered';
    meta.textContent=s.registered?('idz '+s.idz+(s.handle?' · @'+s.handle:'')):'';
    if(policy.value!==s.policy)policy.value=s.policy;
    list.innerHTML='';empty.style.display=s.pending.length?'none':'block';
    s.pending.forEach(function(p){
      var d=document.createElement('div');d.className='card';
      d.innerHTML='<div class="rp">'+esc(p.rp_name)+'</div><p>'+(p.acr==='idz:mfa'?'wants you to confirm':'wants to sign you in')+'</p>'+(p.reason?'<div class="reason">'+esc(p.reason)+'</div>':'')+'<div class="code">'+esc(p.code)+'</div><div class="row"><button class="no" onclick="act(\\'deny\\',\\''+p.challenge_id+'\\')">Deny</button><button class="ok" onclick="act(\\'approve\\',\\''+p.challenge_id+'\\')">Approve · Face ID</button></div>';
      list.appendChild(d);
    });
  }).catch(function(){});}
  refresh();setInterval(refresh,1000);
})();
</script>
</body>
</html>`;
}
