function money(n){ return (Number(n)||0).toFixed(2).replace('.', ',') + ' €'; }
function fmtDate(iso){
  if(!iso) return '—';
  const [y,m,d] = iso.slice(0,10).split('-');
  return d+'/'+m+'/'+y;
}
function escapeHtml(s){
  return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const params = new URLSearchParams(window.location.search);
const token = params.get('token');
const content = document.getElementById('content');

(async function init(){
  if(!token){
    content.innerHTML = '<div class="error-msg">Lien invalide : aucun jeton de devis fourni.</div>';
    return;
  }
  try{
    const res = await fetch('/api/devis-public?token='+encodeURIComponent(token));
    const data = await res.json();
    if(!res.ok){
      content.innerHTML = '<div class="error-msg">'+escapeHtml(data.error || 'Devis introuvable.')+'</div>';
      return;
    }
    render(data.devis);
  }catch(e){
    content.innerHTML = '<div class="error-msg">Impossible de charger le devis. Vérifiez votre connexion et réessayez.</div>';
  }
})();

function render(devis){
  if(devis.status === 'Accepté'){
    content.innerHTML = `
      <div class="status-banner status-ok">✅ Devis accepté le ${fmtDate(devis.signedAt)}</div>
      <div class="card"><h3>Récapitulatif</h3>${itemsTableHtml(devis)}${totalsHtml(devis)}</div>
    `;
    return;
  }
  if(devis.status === 'Refusé'){
    content.innerHTML = `<div class="status-banner status-danger">❌ Ce devis a été refusé le ${fmtDate(devis.refusedAt)}</div>`;
    return;
  }
  if(devis.expiryDate && devis.expiryDate < new Date().toISOString().slice(0,10)){
    content.innerHTML = `<div class="status-banner status-danger">⏱️ Ce devis a expiré le ${fmtDate(devis.expiryDate)}. Contactez-nous pour un nouveau devis.</div>`;
    return;
  }

  content.innerHTML = `
    <div class="card">
      <div class="row"><span class="lbl">Numéro de devis</span><strong>${escapeHtml(devis.devisNumber||'')}</strong></div>
      <div class="row"><span class="lbl">Date d'émission</span><span>${fmtDate(devis.issueDate)}</span></div>
      <div class="row"><span class="lbl">Date d'expiration</span><span>${fmtDate(devis.expiryDate)}</span></div>
      <div class="row"><span class="lbl">Client</span><span>${escapeHtml(devis.clientName||'')}</span></div>
      <div class="row"><span class="lbl">Adresse</span><span>${escapeHtml([devis.address, [devis.postalCode,devis.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')||'—')}</span></div>
    </div>
    <div class="card">
      <h3>Détail du devis</h3>
      ${itemsTableHtml(devis)}
      ${totalsHtml(devis)}
      ${devis.vatNote ? `<p style="font-size:.78rem;color:var(--text-light);margin-top:.8rem;">${escapeHtml(devis.vatNote)}</p>` : ''}
    </div>
    <div class="card">
      <h3>Votre signature</h3>
      <canvas id="sigCanvas"></canvas>
      <button type="button" class="btn btn-ghost" id="sigClear" style="margin-top:.6rem;">Effacer</button>
      <label class="check-row">
        <input type="checkbox" id="acceptTerms">
        <span>Je certifie avoir pris connaissance de ce devis et l'accepter dans son intégralité.</span>
      </label>
      <button type="button" class="btn btn-primary" id="signBtn">✅ Accepter et signer le devis</button>
      <button type="button" class="btn btn-danger" id="refuseBtn">❌ Refuser ce devis</button>
      <div id="formMsg" style="text-align:center;font-size:.85rem;color:var(--text-light);margin-top:.6rem;"></div>
    </div>
  `;
  initSignaturePad();
  document.getElementById('signBtn').onclick = onSign;
  document.getElementById('refuseBtn').onclick = onRefuse;
}

function itemsTableHtml(devis){
  const items = devis.items || [];
  return `
    <table>
      <thead><tr><th>Description</th><th>Qté</th><th>Prix U.</th><th>Total HT</th></tr></thead>
      <tbody>
        ${items.map(it=>`
          <tr>
            <td>${escapeHtml(it.description||'')}${it.detail?`<br><span style="color:var(--text-light);font-size:.78rem;">${escapeHtml(it.detail)}</span>`:''}</td>
            <td>${it.qty||1}</td>
            <td>${money(it.unitPrice)}</td>
            <td>${money(it.totalHT)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function totalsHtml(devis){
  return `
    <div class="totals">
      <div class="row"><span class="lbl">Total HT</span><span>${money(devis.totalHT)}</span></div>
      ${devis.discount ? `<div class="row"><span class="lbl">Remise</span><span>- ${money(devis.discount)}</span></div>` : ''}
      <div class="row"><span class="lbl">TVA</span><span>${money(devis.totalTVA)}</span></div>
      <div class="row final"><span>Total TTC</span><span>${money(devis.totalTTC)}</span></div>
    </div>
  `;
}

let hasSignature = false;
let canvas, ctx;

function initSignaturePad(){
  canvas = document.getElementById('sigCanvas');
  ctx = canvas.getContext('2d');
  function fit(){
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#011331';
  }
  fit();
  let drawing = false, lastPoint = null;
  function getPos(evt){
    const r = canvas.getBoundingClientRect();
    const p = evt.touches ? evt.touches[0] : evt;
    return { x: p.clientX - r.left, y: p.clientY - r.top };
  }
  function start(e){ e.preventDefault(); drawing = true; hasSignature = true; const p = getPos(e); lastPoint = p; ctx.beginPath(); ctx.moveTo(p.x,p.y); }
  function move(e){
    if(!drawing) return; e.preventDefault();
    const p = getPos(e);
    const mid = { x:(lastPoint.x+p.x)/2, y:(lastPoint.y+p.y)/2 };
    ctx.quadraticCurveTo(lastPoint.x, lastPoint.y, mid.x, mid.y);
    ctx.stroke();
    lastPoint = p;
  }
  function end(){ drawing = false; }
  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);
  canvas.addEventListener('touchstart', start, {passive:false});
  canvas.addEventListener('touchmove', move, {passive:false});
  canvas.addEventListener('touchend', end);
  document.getElementById('sigClear').onclick = ()=>{
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0,0,rect.width,rect.height);
    hasSignature = false;
  };
}

async function onSign(){
  const msg = document.getElementById('formMsg');
  if(!hasSignature){ msg.textContent = 'Merci de signer avant de valider.'; return; }
  if(!document.getElementById('acceptTerms').checked){ msg.textContent = 'Merci de cocher la case de confirmation.'; return; }
  msg.textContent = 'Enregistrement en cours…';
  const signature = canvas.toDataURL('image/png');
  try{
    const res = await fetch('/api/devis-public?token='+encodeURIComponent(token), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'sign', signature, acceptTerms: true })
    });
    const data = await res.json();
    if(!res.ok || !data.ok){ msg.textContent = data.error || "Échec de l'enregistrement."; return; }
    content.innerHTML = '<div class="status-banner status-ok">✅ Merci ! Votre devis a bien été accepté et signé.</div>';
  }catch(e){
    msg.textContent = 'Erreur de connexion, réessayez.';
  }
}

async function onRefuse(){
  if(!confirm('Confirmer le refus de ce devis ?')) return;
  const msg = document.getElementById('formMsg');
  msg.textContent = 'Enregistrement en cours…';
  try{
    const res = await fetch('/api/devis-public?token='+encodeURIComponent(token), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'refuse' })
    });
    const data = await res.json();
    if(!res.ok || !data.ok){ msg.textContent = data.error || "Échec de l'enregistrement."; return; }
    content.innerHTML = '<div class="status-banner status-danger">Devis refusé. Merci de nous avoir tenu informés.</div>';
  }catch(e){
    msg.textContent = 'Erreur de connexion, réessayez.';
  }
}
