import qrcode from 'qrcode-generator';

export interface LoginPageInput {
  challengeId: string;
  code: string;
  rpName: string;
  acr: string;
  reason: string | null;
  deepLink: string;
  wsUrl: string;
  indexUrl: string;
  exp: number;
  /** True when the challenge was already pushed to a bound device (step-up). */
  pushed: boolean;
  /** Where to send the browser on error (OIDC error redirect), if any. */
  errorRedirect: string | null;
}

/** SVG QR for the deep link. */
export function qrSvg(text: string): string {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const cell = 4;
  const size = n * cell;
  let path = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) path += `M${c * cell} ${r * cell}h${cell}v${cell}h-${cell}z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="QR code to open on your phone" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The hosted `/authorize` page. Shows the site name, the match code, a QR (or "check your phone"
 * for step-up), connects to the ChallengeSession over WebSocket, pairs the browser on first
 * approval (P-256 key in IndexedDB), and uses the pairing on later visits to skip the QR.
 */
export function renderLoginPage(input: LoginPageInput): string {
  const cfg = JSON.stringify({
    challengeId: input.challengeId,
    wsUrl: input.wsUrl,
    indexUrl: input.indexUrl,
    exp: input.exp,
    pushed: input.pushed,
    errorRedirect: input.errorRedirect,
  });
  const isMfa = input.acr === 'idz:mfa';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Sign in to ${esc(input.rpName)} with Identizen</title>
<script>(function(){try{var t=localStorage.getItem('idz:theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();</script>
<style>
:root{--s0:oklch(.995 .002 250);--s1:oklch(.975 .003 250);--fg:oklch(.2 .02 260);--muted:oklch(.48 .02 260);--border:oklch(.89 .006 250);--accent:oklch(.55 .21 262);--danger:oklch(.58 .22 25);color-scheme:light}
:root[data-theme=dark]{--s0:oklch(.17 .012 260);--s1:oklch(.2 .013 260);--fg:oklch(.96 .005 250);--muted:oklch(.72 .015 260);--border:oklch(.28 .014 260);--accent:oklch(.68 .17 262);--danger:oklch(.68 .19 25);color-scheme:dark}
@media(prefers-color-scheme:dark){:root:not([data-theme=light]){--s0:oklch(.17 .012 260);--s1:oklch(.2 .013 260);--fg:oklch(.96 .005 250);--muted:oklch(.72 .015 260);--border:oklch(.28 .014 260);--accent:oklch(.68 .17 262);--danger:oklch(.68 .19 25);color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:var(--s0);color:var(--fg);-webkit-font-smoothing:antialiased;display:grid;place-items:center;min-height:100vh}
main{width:min(92vw,420px);border:1px solid var(--border);border-radius:12px;padding:28px;background:var(--s1)}
h1{font-size:18px;margin:0 0 4px;font-weight:600;letter-spacing:-.01em}p{margin:0;color:var(--muted);font-size:14px;line-height:1.5}
.code{font-family:ui-monospace,Menlo,monospace;font-size:44px;letter-spacing:.12em;font-weight:600;text-align:center;margin:20px 0 4px}
.qr{display:flex;justify-content:center;margin:20px 0}.qr svg{width:200px;height:200px;border-radius:8px;border:8px solid #fff}
.reason{margin:16px 0 0;padding:12px;border:1px solid var(--border);border-radius:8px;background:var(--s0);font-size:14px}
.status{margin-top:16px;font-size:13px;color:var(--muted);min-height:1.2em}.status[data-kind=error]{color:var(--danger)}
.hidden{display:none}a{color:var(--accent)}.foot{margin-top:22px;font-size:12px;color:var(--muted);text-align:center}
@media(prefers-reduced-motion:no-preference){.pulse{animation:p 1.6s ease-in-out infinite}@keyframes p{50%{opacity:.5}}}
</style>
</head>
<body>
<main>
  <h1>${isMfa ? 'Approve on your phone' : 'Sign in with your phone'}</h1>
  <p>${esc(input.rpName)}${isMfa ? ' is asking you to confirm.' : ' uses Identizen. Open the app on your phone and approve.'}</p>
  ${input.reason ? `<div class="reason">${esc(input.reason)}</div>` : ''}
  <div class="code" aria-label="Match code">${esc(input.code)}</div>
  <p style="text-align:center">Make sure your phone shows the same code.</p>
  <div id="qr" class="qr ${input.pushed ? 'hidden' : ''}">${qrSvg(input.deepLink)}</div>
  <p id="hint" style="text-align:center" class="${input.pushed ? '' : 'hidden'}">We sent a notification to your phone.</p>
  <p id="status" class="status pulse" aria-live="polite">Waiting for your phone…</p>
  <p class="foot">On this phone? <a href="${esc(input.deepLink)}">Open in Identizen</a></p>
</main>
<script>
(function(){
  var cfg=${cfg};
  var status=document.getElementById('status');var qr=document.getElementById('qr');var hint=document.getElementById('hint');
  function say(t,kind){status.textContent=t;status.className='status'+(kind?' ':' pulse');if(kind)status.setAttribute('data-kind',kind);}
  function b64(buf){var s='';var b=new Uint8Array(buf);for(var i=0;i<b.length;i++)s+=String.fromCharCode(b[i]);return btoa(s).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');}
  function idb(){return new Promise(function(res,rej){var r=indexedDB.open('identizen',1);r.onupgradeneeded=function(){r.result.createObjectStore('kv');};r.onsuccess=function(){res(r.result);};r.onerror=function(){rej(r.error);};});}
  function kvGet(k){return idb().then(function(db){return new Promise(function(res,rej){var t=db.transaction('kv','readonly').objectStore('kv').get(k);t.onsuccess=function(){res(t.result);};t.onerror=function(){rej(t.error);};});}).catch(function(){return undefined;});}
  function kvSet(k,v){return idb().then(function(db){return new Promise(function(res,rej){var t=db.transaction('kv','readwrite').objectStore('kv').put(v,k);t.onsuccess=function(){res();};t.onerror=function(){rej(t.error);};});}).catch(function(){});}
  var pairingKeyPromise=null;
  function ensureBrowserKey(){if(pairingKeyPromise)return pairingKeyPromise;pairingKeyPromise=kvGet('browserKey').then(function(k){if(k)return k;return crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']).then(function(k){return kvSet('browserKey',k).then(function(){return k;});});});return pairingKeyPromise;}
  function tryPaired(){return kvGet('pairing').then(function(p){if(!p||!p.pairing_id)return false;return ensureBrowserKey().then(function(k){var msg=new TextEncoder().encode('identizen/v1/paired\\n'+cfg.challengeId);return crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},k.privateKey,msg).then(function(sig){return fetch(cfg.indexUrl+'/discover/paired',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({challenge_id:cfg.challengeId,pairing_id:p.pairing_id,sig:b64(sig)})});}).then(function(r){if(r.status===202){qr.classList.add('hidden');hint.classList.remove('hidden');hint.textContent='We sent a notification to your phone.';return true;}if(r.status===401){kvSet('pairing',null);}return false;});});}).catch(function(){return false;});}
  function connect(){document.body.setAttribute('data-ready','1');var ws=new WebSocket(cfg.wsUrl);ws.onmessage=function(ev){var m;try{m=JSON.parse(ev.data);}catch(e){return;}if(m.type==='approved'){if(m.pairing&&m.pairing.payload){kvSet('pairing',m.pairing.payload);}say('Approved. Redirecting…');if(m.redirect){location.replace(m.redirect);}else{poll();}}else if(m.type==='denied'){say('You declined on your phone.','error');fail('access_denied');}else if(m.type==='expired'){say('This request expired. Go back and try again.','error');fail('login_required');}};ws.onclose=function(){setTimeout(poll,800);};ws.onerror=function(){setTimeout(poll,800);};}
  var polling=false;function poll(){if(polling)return;polling=true;fetch(cfg.indexUrl+'/challenge/'+cfg.challengeId+'/state',{cache:'no-store'}).then(function(r){return r.json();}).then(function(s){polling=false;if(s.status==='approved'&&s.redirect){location.replace(s.redirect);}else if(s.status==='pending'){setTimeout(poll,1500);}else if(s.status==='denied'){say('You declined on your phone.','error');fail('access_denied');}else if(s.status==='expired'){say('This request expired. Go back and try again.','error');fail('login_required');}}).catch(function(){polling=false;setTimeout(poll,2500);});}
  function fail(code){if(cfg.errorRedirect){setTimeout(function(){location.replace(cfg.errorRedirect+(cfg.errorRedirect.indexOf('?')>0?'&':'?')+'error='+code);},1800);}}
  if(!cfg.pushed){tryPaired().then(function(paired){if(paired)return;return ensureBrowserKey().then(function(k){return crypto.subtle.exportKey('raw',k.publicKey);}).then(function(raw){return fetch(cfg.indexUrl+'/challenge/'+cfg.challengeId+'/browser-key',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({browser_pubkey:b64(raw)})});}).catch(function(){});}).then(function(){connect();});}else{connect();}
  var left=Math.max(0,cfg.exp*1000-Date.now());setTimeout(function(){},left);
})();
</script>
</body>
</html>`;
}
