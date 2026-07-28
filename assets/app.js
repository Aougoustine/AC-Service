/* ═══════════════════════════════════════════════════════════
   AC SERVICE — Gestion — fichier partagé par toutes les pages
   Stockage : backend centralisé (Supabase via /api/data et /api/auth)
   ═══════════════════════════════════════════════════════════ */

// Permet de faire défiler n'importe quelle bande de calendrier (.cal-strip-wrapper)
// horizontalement avec la molette de la souris, sans avoir à utiliser la barre de
// défilement tactile. Un seul écouteur global suffit pour toutes les pages/bandes.
document.addEventListener('wheel', function(e){
  const wrapper = e.target.closest && e.target.closest('.cal-strip-wrapper');
  if(!wrapper) return;
  if(Math.abs(e.deltaY) > Math.abs(e.deltaX)){
    wrapper.scrollLeft += e.deltaY;
    e.preventDefault();
  }
}, { passive:false });

// ⚠️ Doit rester identique à ALLOWED_EMAIL dans api/auth.js (côté serveur, la
// vraie vérification). Cette copie ne sert qu'à l'affichage côté client.
const ALLOWED_EMAIL = "ac.service59.pro@gmail.com";
const RDV_STATUSES = ["Nouveau","Confirmé","En cours","Terminé","Annulé"];
const INTERV_STATUSES = ["Brouillon","En cours","Diagnostiqué","En attente de paiement","Terminé"];
const LEGACY_INTERV_STATUS_MAP = { "Devis envoyé":"En cours", "Pièce commandée":"En cours", "Facturé":"Terminé", "Annulé":"Terminé" };

// Ramène un rapport créé avant la simplification des statuts vers la nouvelle liste,
// sans rien perdre : "Facturé" devient "Terminé" + case "Paiement effectué" cochée.
function migrateInterventionStatus(i){
  if(INTERV_STATUSES.includes(i.status)) return i;
  if(i.status === 'Facturé' && i.paymentReceived === undefined) i.paymentReceived = true;
  i.status = LEGACY_INTERV_STATUS_MAP[i.status] || 'En cours';
  return i;
}
const PASSAGE_TYPES = ["Réparé au 1er passage","Pièce à commander (2nd passage)","Irréparable"];
// Les forfaits ne sont plus figés ici : voir state.settings.forfaits (Paramètres > Tarifs).

/* ── session ── */
function getToken(){ return sessionStorage.getItem('ac_token'); }
function setToken(t){ sessionStorage.setItem('ac_token', t); }
function clearToken(){ sessionStorage.removeItem('ac_token'); }

/* ── chargement / enregistrement des données via l'API ── */
async function requireAuth(){
  const token = getToken();
  if(!token){
    window.location.href = 'index.html';
    return null;
  }
  try{
    const res = await fetch('/api/data', { headers: { 'x-session-token': token } });
    if(res.status === 401){
      clearToken();
      window.location.href = 'index.html';
      return null;
    }
    if(!res.ok){
      showToast("Erreur de chargement des données ("+res.status+").");
      return null;
    }
    const data = await res.json();
    return data.state;
  }catch(e){
    showToast("Connexion au serveur impossible : "+e.message);
    return null;
  }
}

// Vérifie périodiquement s'il y a du nouveau côté serveur (nouveau RDV reçu du site,
// devis accepté/refusé par un client...) sans jamais recharger la page. Se met en
// pause tant qu'une fenêtre modale est ouverte, pour ne jamais écraser une saisie en
// cours. Le callback reçoit le nouvel état complet ; à lui de décider quoi en faire
// (détecter les changements pertinents, ré-afficher, notifier).
function startAutoRefresh(onUpdate, intervalMs){
  intervalMs = intervalMs || 30000;
  setInterval(async ()=>{
    const modalRoot = document.getElementById('modalRoot');
    if(modalRoot && modalRoot.innerHTML.trim()) return;
    const token = getToken();
    if(!token) return;
    try{
      const res = await fetch('/api/data', { headers: { 'x-session-token': token } });
      if(!res.ok) return;
      const data = await res.json();
      if(data && data.state) onUpdate(data.state);
    }catch(e){ /* silencieux — on retente au prochain cycle */ }
  }, intervalMs);
}

function normalizeClientKey(name){
  return (name||'')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'') // enlève les accents (é→e, à→a...)
    .trim().toLowerCase().replace(/\s+/g,' ');
}

// Ne garde que les chiffres (ignore espaces, points, tirets...), pour comparer deux
// numéros de téléphone écrits différemment mais identiques au fond.
function normalizePhone(phone){
  return (phone||'').replace(/\D/g,'');
}

// Construit la liste unifiée des clients : tout RDV et tout rapport (quel que soit
// leur statut) fait apparaître un client, avec l'historique de ses numéros de
// dossier. Les fiches manuelles (state.clients) se rattachent au même client si le
// nom correspond (et permettent d'ajouter un commentaire ou de créer un prospect
// qui n'a encore jamais eu de dossier). Partagé entre la page Clients et le
// sélecteur de client dans le formulaire de RDV de Planning.
function buildClientDirectory(){
  const byKey = {};
  function ensure(key){
    if(!byKey[key]) byKey[key] = { key, firstName:'', lastName:'', clientName:'', phone:'', email:'', address:'', postalCode:'', city:'', dossierNumbers:new Set(), lastVisit:'', manualId:null, comment:'', hasCompletedDossier:false };
    return byKey[key];
  }

  state.appointments.forEach(a=>{
    const key = normalizeClientKey(a.clientName);
    if(!key) return;
    const c = ensure(key);
    if(a.dossierNumber) c.dossierNumbers.add(a.dossierNumber);
    if((a.date||'') >= c.lastVisit){
      c.lastVisit = a.date||c.lastVisit;
      c.firstName=a.firstName||c.firstName; c.lastName=a.lastName||c.lastName; c.clientName=a.clientName||c.clientName;
      c.phone=a.phone||c.phone; c.email=a.email||c.email; c.address=a.address||c.address; c.postalCode=a.postalCode||c.postalCode; c.city=a.city||c.city;
    }
  });

  state.interventions.forEach(iv=>{
    const key = normalizeClientKey(iv.clientName);
    if(!key) return;
    const c = ensure(key);
    if(iv.dossierNumber) c.dossierNumbers.add(iv.dossierNumber);
    if((iv.status||'').trim() === 'Terminé') c.hasCompletedDossier = true;
    if((iv.date||'') >= c.lastVisit){
      c.lastVisit = iv.date||c.lastVisit;
      c.firstName=iv.firstName||c.firstName; c.lastName=iv.lastName||c.lastName; c.clientName=iv.clientName||c.clientName;
      c.phone=iv.phone||c.phone; c.email=iv.email||c.email; c.address=iv.address||c.address; c.postalCode=iv.postalCode||c.postalCode; c.city=iv.city||c.city;
    }
  });

  (state.deposits||[]).forEach(dep=>{
    const key = normalizeClientKey(dep.clientName);
    if(!key) return;
    const c = ensure(key);
    if(dep.dossierNumber) c.dossierNumbers.add(dep.dossierNumber);
    if((dep.depositDate||'') >= c.lastVisit){
      c.lastVisit = dep.depositDate||c.lastVisit;
      c.firstName=dep.firstName||c.firstName; c.lastName=dep.lastName||c.lastName; c.clientName=dep.clientName||c.clientName;
      c.phone=dep.phone||c.phone; c.email=dep.email||c.email; c.address=dep.address||c.address; c.postalCode=dep.postalCode||c.postalCode; c.city=dep.city||c.city;
    }
  });

  (state.clients||[]).forEach(mc=>{
    const fullName = (mc.firstName+' '+mc.lastName).trim();
    const key = normalizeClientKey(fullName);
    if(!key) return;
    const c = ensure(key);
    c.manualId = mc.id;
    c.comment = mc.comment || '';
    c.firstName = mc.firstName || c.firstName;
    c.lastName = mc.lastName || c.lastName;
    c.clientName = fullName || c.clientName;
    if(mc.phone) c.phone = mc.phone;
    if(mc.email) c.email = mc.email;
    if(mc.address) c.address = mc.address;
    if(mc.postalCode) c.postalCode = mc.postalCode;
    if(mc.city) c.city = mc.city;
  });

  // Filet de sécurité : deux fiches avec des noms différents (typo, ordre inversé,
  // orthographe...) mais un même numéro de téléphone sont presque toujours la même
  // personne. On les fusionne ici, sans changer la clé de recherche par nom.
  const byPhone = {};
  const mergedAway = new Set();
  Object.values(byKey).forEach(c=>{
    const phoneKey = normalizePhone(c.phone);
    if(!phoneKey) return;
    if(!byPhone[phoneKey]){
      byPhone[phoneKey] = c;
      return;
    }
    const primary = byPhone[phoneKey];
    c.dossierNumbers.forEach(d=>primary.dossierNumbers.add(d));
    if(c.hasCompletedDossier) primary.hasCompletedDossier = true;
    if(c.manualId && !primary.manualId){ primary.manualId = c.manualId; primary.comment = c.comment; }
    if((c.lastVisit||'') > (primary.lastVisit||'')){
      primary.lastVisit = c.lastVisit;
      primary.firstName = c.firstName || primary.firstName;
      primary.lastName = c.lastName || primary.lastName;
      primary.clientName = c.clientName || primary.clientName;
      primary.email = c.email || primary.email;
      primary.address = c.address || primary.address;
      primary.postalCode = c.postalCode || primary.postalCode;
      primary.city = c.city || primary.city;
    }
    mergedAway.add(c.key);
  });

  return Object.values(byKey)
    .filter(c=>!mergedAway.has(c.key))
    .map(c=>Object.assign({}, c, { dossierNumbers: Array.from(c.dossierNumbers).sort() }));
}

// Crée ou met à jour automatiquement une fiche client persistante (state.clients)
// à partir des coordonnées d'un RDV — que ce RDV soit créé manuellement ou reçu du
// site. Ainsi, même si le RDV est supprimé plus tard, la fiche client (coordonnées,
// commentaire éventuel) reste intacte ; seul le numéro de dossier disparaît, puisqu'il
// n'est plus rattaché qu'aux RDV/rapports encore existants.
// Recherche/sélection d'un client existant, partagée par les formulaires de RDV et
// de dépôt. Dès le clic dans le champ (focus), la liste complète s'ouvre triée du
// plus récent passage au plus ancien — défilable à la molette (comportement natif
// du navigateur sur une zone overflow-y:auto, rien à coder en plus). Taper filtre
// ensuite la liste par nom. onPick(client) reçoit la fiche choisie au clic.
function wireClientSearchInput(inputId, resultsBoxId, onPick){
  const input = document.getElementById(inputId);
  const resultsBox = document.getElementById(resultsBoxId);
  if(!input || !resultsBox) return;

  function renderList(query){
    const q = (query||'').trim().toLowerCase();
    let matches = buildClientDirectory().sort((x,y)=>(y.lastVisit||'').localeCompare(x.lastVisit||''));
    if(q) matches = matches.filter(c=>(c.clientName||'').toLowerCase().includes(q));
    if(!matches.length){
      resultsBox.innerHTML = `<div style="padding:.7rem .9rem;color:var(--text-light);font-size:.85rem;">Aucun client trouvé.</div>`;
      resultsBox.style.display = 'block';
      return;
    }
    resultsBox.innerHTML = matches.map(c=>`
      <div class="clientPickRow" data-key="${escapeHtml(c.key)}" style="padding:.6rem .9rem;cursor:pointer;border-bottom:1px solid var(--border);">
        <div style="font-weight:600;">${escapeHtml(c.clientName||'—')}</div>
        <div style="font-size:.78rem;color:var(--text-light);">${escapeHtml(c.phone||'—')}${c.city?(' · '+escapeHtml(c.city)):''}${c.dossierNumbers.length?(' · '+c.dossierNumbers.length+' dossier(s)'):''}${c.lastVisit?(' · dernier passage le '+fmtDate(c.lastVisit)):''}</div>
      </div>
    `).join('');
    resultsBox.style.display = 'block';
    resultsBox.querySelectorAll('.clientPickRow').forEach(row=>{
      row.onmousedown = (e)=>{
        e.preventDefault();
        const picked = buildClientDirectory().find(c=>c.key===row.dataset.key);
        if(!picked) return;
        input.value = picked.clientName||'';
        resultsBox.style.display = 'none';
        onPick(picked);
        showToast("Coordonnées reprises depuis la fiche client.");
      };
    });
  }

  input.addEventListener('focus', ()=>renderList(input.value));
  input.addEventListener('input', ()=>renderList(input.value));
  input.addEventListener('blur', ()=>{ setTimeout(()=>{ resultsBox.style.display='none'; }, 150); });
}

function upsertClientFromContact(state, contact){
  const firstName = (contact.firstName||'').trim();
  const lastName = (contact.lastName||'').trim();
  const key = normalizeClientKey((firstName+' '+lastName).trim());
  if(!key) return;
  if(!state.clients) state.clients = [];
  let mc = state.clients.find(c=>normalizeClientKey(((c.firstName||'')+' '+(c.lastName||'')).trim())===key);
  if(!mc){
    mc = { id: uid(), createdAt: todayISO(), comment: '' };
    state.clients.push(mc);
  }
  mc.firstName = firstName || mc.firstName || '';
  mc.lastName = lastName || mc.lastName || '';
  if(contact.phone) mc.phone = contact.phone;
  if(contact.email) mc.email = contact.email;
  if(contact.address) mc.address = contact.address;
  if(contact.postalCode) mc.postalCode = contact.postalCode;
  if(contact.city) mc.city = contact.city;
}

// ── Corbeille commune ──
// Toute suppression dans l'appli passe par ici plutôt que d'être immédiate. Les
// effets de bord (recréditer le stock, supprimer les photos...) ne s'appliquent
// qu'à la suppression DÉFINITIVE depuis la corbeille (voir purgeTrashItem dans
// page-corbeille.js) — jamais à la mise à la corbeille, pour que "Restaurer"
// soit toujours possible sans risque de double-effet.
function moveToTrash(state, type, label, data){
  if(!state.trash) state.trash = [];
  state.trash.push({ id: uid(), type, label, data, deletedAt: new Date().toISOString() });
}

const TRASH_TYPE_LABELS = {
  rapport: '🧾 Rapport', devis: '📄 Devis', depot: '📥 Dépôt',
  client: '👤 Client', rdv: '📅 RDV', stock: '📦 Pièce de stock'
};

async function saveState(state){
  const token = getToken();
  try{
    const res = await fetch('/api/data', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-session-token': token },
      body: JSON.stringify({ state })
    });
    if(res.status === 401){
      clearToken();
      window.location.href = 'index.html';
      return false;
    }
    if(!res.ok){
      showToast("⚠️ Échec de l'enregistrement, réessaie.");
      return false;
    }
    return true;
  }catch(e){
    showToast("⚠️ Erreur d'enregistrement : "+e.message);
    return false;
  }
}

function logout(){
  const token = getToken();
  clearToken();
  fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-session-token': token || '' },
    body: JSON.stringify({ action: 'logout' })
  }).catch(()=>{});
  window.location.href = 'index.html';
}

/* ── helpers ── */
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,8); }

function escapeHtml(str){
  if(str===undefined || str===null) return "";
  return String(str).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function fmtDate(d){
  if(!d) return "—";
  const dt = new Date(d+"T00:00:00");
  if(isNaN(dt)) return d;
  return dt.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric'});
}
function fmtDateTime(iso){
  if(!iso) return "—";
  const dt = new Date(iso);
  if(isNaN(dt)) return iso;
  return dt.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric'})+' à '+dt.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
}
function todayISO(){ return new Date().toISOString().slice(0,10); }
function money(n){ return (Number(n)||0).toFixed(2).replace('.',',')+" €"; }

function statusBadgeClass(s){
  return {
    "Nouveau":"badge-nouveau","Confirmé":"badge-confirme","En cours":"badge-encours",
    "Terminé":"badge-termine","Annulé":"badge-annule","Brouillon":"badge-nouveau",
    "Diagnostiqué":"badge-nouveau","Devis envoyé":"badge-encours","Pièce commandée":"badge-encours",
    "En attente de paiement":"badge-encours","Facturé":"badge-confirme",
    "Envoyé":"badge-encours","Accepté":"badge-confirme","Refusé":"badge-annule"
  }[s] || "badge-nouveau";
}

function showToast(msg){
  const t = document.getElementById('toast');
  if(!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(()=>t.classList.remove('show'), 2400);
}

function closeModal(){
  const m = document.getElementById('modalRoot');
  if(m) m.innerHTML = "";
}

/* ── barre de navigation commune ── */
function renderNavbar(active, state){
  const nav = document.getElementById('navbar');
  if(!nav) return;
  const rdvPending = state.appointments.filter(a=>!['Confirmé','Terminé','Annulé'].includes(a.status) && a.requestType!=='depot').length;
  const lowStock = state.stock.filter(s=>Number(s.qty)<=Number(s.threshold)).length;
  const trashCount = (state.trash||[]).length;
  const today = todayISO();
  const horizonEnd = addDaysISO(today, 13);
  const planningConfirmed = state.appointments.filter(a=>a.status==='Confirmé' && a.date>=today && a.date<=horizonEnd && a.requestType!=='depot').length;
  const planningBadge = rdvPending + planningConfirmed;
  const depositRequestsPending = state.appointments.filter(a=>a.requestType==='depot' && !['Terminé','Annulé'].includes(a.status)).length;
  const tabs = [
    {id:'dashboard', href:'dashboard.html', icon:'📊', text:'Tableau de bord'},
    {id:'comptabilite', href:'comptabilite.html', icon:'🧮', text:'Comptabilité'},
    {id:'clients', href:'clients.html', icon:'👤', text:'Clients'},
    {id:'dossiers', href:'dossiers.html', icon:'🗂️', text:'Dossiers'},
    {id:'planning', href:'planning.html', icon:'📅', text:'Planning', badge:planningBadge},
    {id:'depots', href:'depots.html', icon:'📥', text:'Dépôts', badge:depositRequestsPending},
    {id:'stock', href:'stock.html', icon:'📦', text:'Stock', badge:lowStock},
    {id:'corbeille', href:'corbeille.html', icon:'🗑️', text:'Corbeille', badge:trashCount},
    {id:'parametres', href:'parametres.html', icon:'⚙️', text:'Paramètres'},
  ];
  nav.innerHTML = `
    <div class="topbar-brand">
      <img src="favicon.png" alt="AC SERVICE" class="topbar-logo">
      <div class="topbar-brand-text">
        <span class="topbar-brand-title">AC SERVICE</span>
        <span class="topbar-brand-subtitle">Satisfait &amp; réparé</span>
      </div>
    </div>
    <div class="topbar-divider"></div>
    <button class="nav-burger" id="navBurgerBtn" aria-label="Ouvrir le menu">☰</button>
    <div class="tabs" id="navTabs">${tabs.map(t=>`<a class="tab-btn ${t.id===active?'active':''}" href="${t.href}"><span class="tab-icon">${t.icon}</span><span class="tab-text">${t.text}</span>${t.badge?`<span class="tab-badge">${t.badge}</span>`:''}</a>`).join('')}
      <button class="btn btn-ghost btn-small nav-logout-mobile" onclick="logout()">🚪 Déconnexion</button>
    </div>
    <button class="nav-logout-desktop" onclick="logout()"><span>👤</span> Déconnexion</button>
  `;
  const burgerBtn = document.getElementById('navBurgerBtn');
  const navTabs = document.getElementById('navTabs');
  if(burgerBtn && navTabs){
    burgerBtn.onclick = ()=>{
      navTabs.classList.toggle('nav-open');
      burgerBtn.textContent = navTabs.classList.contains('nav-open') ? '✕' : '☰';
    };
  }
}

function addDaysISO(iso, days){
  const d = new Date(iso+'T00:00:00');
  d.setDate(d.getDate()+days);
  return d.toISOString().slice(0,10);
}

/* ── calcul automatique du prix de vente à partir du prix d'achat ──
   Paliers configurables dans Paramètres (state.settings.marginTiers). */
function computeSellPrice(buyPrice, tiers){
  const price = Number(buyPrice);
  if(!price || price <= 0) return '';
  const list = (tiers && tiers.length) ? tiers : [{max:null, mult:1}];
  const sorted = [...list].sort((a,b)=>{
    const am = (a.max===null || a.max===undefined) ? Infinity : Number(a.max);
    const bm = (b.max===null || b.max===undefined) ? Infinity : Number(b.max);
    return am - bm;
  });
  for(const t of sorted){
    const max = (t.max===null || t.max===undefined) ? Infinity : Number(t.max);
    if(price <= max){
      return Math.round(price * Number(t.mult) * 100) / 100;
    }
  }
  return price;
}

/* ── photos d'intervention : stockées à part (voir api/photos.js), jamais dans
   le bloc de données principal, pour ne pas alourdir chaque enregistrement. ── */
function compressImageFile(file, maxDim, quality){
  maxDim = maxDim || 1600;
  quality = quality || 0.72;
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Lecture du fichier impossible"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Fichier image invalide"));
      img.onload = () => {
        let width = img.width, height = img.height;
        if(width > maxDim || height > maxDim){
          if(width >= height){ height = Math.round(height * maxDim / width); width = maxDim; }
          else { width = Math.round(width * maxDim / height); height = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function uploadPhoto(dataUrl){
  const res = await fetch('/api/photos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-session-token': getToken() },
    body: JSON.stringify({ dataUrl })
  });
  if(!res.ok){
    let msg = 'Échec de l\'envoi de la photo ('+res.status+')';
    try{ const d = await res.json(); if(d.error) msg = d.error; }catch(e){}
    throw new Error(msg);
  }
  const data = await res.json();
  return data.id;
}

async function fetchPhotoDataUrl(id){
  const res = await fetch('/api/photos?id='+encodeURIComponent(id), {
    headers: { 'x-session-token': getToken() }
  });
  if(!res.ok) throw new Error("Photo introuvable");
  const data = await res.json();
  return data.dataUrl;
}

// Télécharge une image quelle que soit son origine (les URLs signées Supabase sont
// externes : l'attribut HTML "download" seul ne force pas toujours le téléchargement
// pour une ressource cross-origin). On récupère le fichier en mémoire puis on
// déclenche le téléchargement depuis une URL locale au navigateur.
async function downloadPhotoFromUrl(url, filename){
  try{
    const res = await fetch(url);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename || 'photo.jpg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(objectUrl), 4000);
  }catch(e){
    // Repli : ouvre au moins la photo dans un nouvel onglet si le téléchargement échoue.
    window.open(url, '_blank');
  }
}

// Visionneuse plein écran pour n'importe quelle photo de l'appli (RDV, rapports,
// dépôts...). Un seul endroit à maintenir, réutilisé partout où une galerie existe.
function openPhotoLightbox(url, filename){
  const el = document.createElement('div');
  el.id = 'photoLightbox';
  el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:5000;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:2rem;cursor:zoom-out;';
  el.innerHTML = `
    <div style="position:absolute;top:1rem;right:1rem;display:flex;gap:.6rem;z-index:1;">
      <button class="btn btn-ghost btn-small" id="lightboxDownloadBtn">⬇️ Télécharger</button>
      <button class="btn btn-ghost btn-small" id="lightboxCloseBtn">✕ Fermer</button>
    </div>
    <img src="${url}" style="max-width:100%;max-height:85vh;border-radius:10px;box-shadow:0 20px 60px rgba(0,0,0,.6);cursor:default;">
  `;
  document.body.appendChild(el);
  el.addEventListener('click', (e)=>{ if(e.target===el) document.body.removeChild(el); });
  document.getElementById('lightboxCloseBtn').onclick = (e)=>{ e.stopPropagation(); document.body.removeChild(el); };
  document.getElementById('lightboxDownloadBtn').onclick = (e)=>{ e.stopPropagation(); downloadPhotoFromUrl(url, filename); };
}

function deletePhotoById(id){
  fetch('/api/photos?id='+encodeURIComponent(id), {
    method: 'DELETE',
    headers: { 'x-session-token': getToken() }
  }).catch(()=>{ /* échec silencieux, non bloquant */ });
}

// Libère un créneau réservé via le site (annulation, replanification ou suppression
// d'un RDV) pour que la place redevienne immédiatement disponible côté public.
// N'a d'effet que si le RDV provient bien du site (bookingId renseigné) ; sans danger
// sinon (aucun appel n'est fait).
function releaseBookingSlot(bookingId){
  if(!bookingId) return;
  fetch('/api/booking?id='+encodeURIComponent(bookingId), {
    method: 'DELETE',
    headers: { 'x-session-token': getToken() }
  }).catch(()=>{ /* échec silencieux, non bloquant */ });
}

/* ── génération du PDF de rapport d'intervention (jsPDF, chargé dans planning.html) ──
   Chaque photo jointe est récupérée puis ajoutée sur sa propre page à la fin du PDF. */
function loadImageDims(dataUrl){
  return new Promise((resolve)=>{
    const img = new Image();
    img.onload = ()=>resolve({ width: img.naturalWidth || 1, height: img.naturalHeight || 1 });
    img.onerror = ()=>resolve({ width: 1, height: 1 });
    img.src = dataUrl;
  });
}

async function buildReportPdf(i, company){
  company = company || {};
  const { jsPDF } = window.jspdf || {};
  if(!jsPDF) return null;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const marginX = 18;
  const PAGE_BOTTOM = 280;
  let y = 20;

  // Logo en en-tête de la page 1 — échec silencieux si le fichier est introuvable
  // (le reste du PDF continue de se générer normalement, juste sans logo).
  const logoDataUrl = await loadLogoDataUrlForPdf();

  function addFooter(){
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text((company.name||'AC SERVICE')+' — SIRET '+(company.siret||'—')+' — '+(company.phone||'—')+' — '+(company.email||'—'), marginX, 290);
  }

  function newPage(){
    addFooter();
    doc.addPage();
    y = 20;
  }

  function ensureSpace(needed){
    if(y + needed > PAGE_BOTTOM) newPage();
  }

  function field(label, value){
    if(!value) return;
    const lines = doc.splitTextToSize(String(value), 210 - marginX*2);
    ensureSpace(9 + lines.length * 5.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text(label.toUpperCase(), marginX, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(20, 20, 20);
    doc.text(lines, marginX, y);
    y += lines.length * 5.5 + 4;
  }

  // Encadré façon "carte" de l'appli (fond clair, liseré cyan à gauche, coins
  // arrondis) — regroupe plusieurs champs sous un même titre. La hauteur est
  // calculée à l'avance à partir du texte réellement présent, pour que l'encadré
  // s'ajuste toujours pile à son contenu, quelle que soit sa longueur.
  // opts.rightReserve : espace (mm) laissé libre à droite pour une photo (ex :
  // plaque signalétique) ; opts.minHeight : hauteur minimale si une photo est plus
  // haute que le texte.
  function drawFramedSection(title, fields, opts){
    opts = opts || {};
    const pad = 4;
    const innerX = marginX + pad + 2;
    const availWidth = 210 - marginX*2 - pad*2 - 2 - (opts.rightReserve||0);

    const items = (fields||[]).filter(f=>f.value).map(f=>({
      label: f.label,
      lines: doc.splitTextToSize(String(f.value), availWidth)
    }));
    if(!items.length && !opts.minHeight) return null;

    let contentHeight = 7;
    items.forEach(it=>{ contentHeight += 4.2 + it.lines.length*5 + 3; });
    const boxHeight = Math.max(contentHeight + pad*2, opts.minHeight||0);

    ensureSpace(boxHeight + 6);
    const boxTop = y;

    doc.setFillColor(250, 250, 252);
    doc.setDrawColor(224, 228, 233);
    doc.roundedRect(marginX, boxTop, 210 - marginX*2, boxHeight, 2, 2, 'FD');
    doc.setFillColor(0, 180, 216);
    doc.rect(marginX, boxTop, 1.3, boxHeight, 'F');

    let ty = boxTop + pad + 3.5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(1, 19, 49);
    doc.text(title, innerX, ty);
    ty += 6;

    items.forEach(it=>{
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.8);
      doc.setTextColor(130, 130, 130);
      doc.text(it.label.toUpperCase(), innerX, ty);
      ty += 4.2;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.8);
      doc.setTextColor(25, 25, 25);
      doc.text(it.lines, innerX, ty);
      ty += it.lines.length*5 + 3;
    });

    y = boxTop + boxHeight + 5;
    return { boxTop, boxHeight, innerX };
  }

  /* ══════════ En-tête compact (technicien | client), même principe que le devis ══════════ */
  if(logoDataUrl){
    try{
      doc.addImage(logoDataUrl, 'PNG', 210 - marginX - 18, y - 6, 18, 18);
    }catch(e){ /* format d'image non pris en charge, on continue sans */ }
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(1, 19, 49);
  doc.text(company.name || 'AC SERVICE', marginX, y);
  doc.setFontSize(11);
  doc.setTextColor(0, 180, 216);
  doc.text('Rapport d\'intervention', marginX, y + 7);
  doc.setTextColor(90, 90, 90);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(i.dossierNumber || ('Dossier '+i.id), 210 - marginX - 22, y, { align: 'right' });
  doc.text(fmtDate(i.date), 210 - marginX - 22, y + 6, { align: 'right' });
  y += 16;
  doc.setDrawColor(0, 180, 216);
  doc.line(marginX, y, 210 - marginX, y);
  y += 8;

  const companyLines = [company.siret?('SIRET '+company.siret):'', company.phone, company.email].filter(Boolean);
  const clientLines = [i.phone, i.email, fullAddress(i)].filter(Boolean);
  const maxLines = Math.max(companyLines.length, clientLines.length);
  const headerPad = 4;
  const headerBoxHeight = headerPad*2 + 6 + maxLines*4.6 + 2;

  ensureSpace(headerBoxHeight + 6);
  const headerBoxTop = y;
  doc.setFillColor(250, 250, 252);
  doc.setDrawColor(224, 228, 233);
  doc.roundedRect(marginX, headerBoxTop, 210 - marginX*2, headerBoxHeight, 2, 2, 'FD');
  doc.setFillColor(0, 180, 216);
  doc.rect(marginX, headerBoxTop, 1.3, headerBoxHeight, 'F');

  const colWidth = (210-marginX*2)/2 - 5;
  const col2 = marginX+headerPad+2+colWidth+10;
  let hy = headerBoxTop + headerPad + 3.5;
  doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(20,20,20);
  doc.text(((company.technicianName?company.technicianName+' / ':'')+(company.name||'')), marginX+headerPad+2, hy);
  doc.text(i.clientName||'', col2, hy);
  hy += 5.5;
  doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(70,70,70);
  for(let idx=0; idx<maxLines; idx++){
    if(companyLines[idx]) doc.text(String(companyLines[idx]), marginX+headerPad+2, hy);
    if(clientLines[idx]) doc.text(String(clientLines[idx]), col2, hy);
    hy += 4.6;
  }
  y = headerBoxTop + headerBoxHeight + 8;

  /* ══════════ Un bloc par appareil, suivi immédiatement de ses photos — le premier
     appareil continue directement à la suite de l'en-tête, sur la page 1. ══════════ */
  const devices = (i.devices && i.devices.length) ? i.devices : [i]; // repli pour d'anciens rapports non migrés
  let totalAmount = 0;

  async function printDevicePhotos(d, idx){
    if(!d.photos || !d.photos.length) return;
    newPage();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(1, 19, 49);
    doc.text('Photos — Appareil '+(idx+1)+' ('+d.photos.length+')', marginX, y);
    y += 10;

    const thumbW = 80, thumbH = 60, gap = 6;
    let x = marginX;
    for(const p of d.photos){
      let dataUrl;
      try{
        dataUrl = p.dataUrl || await fetchPhotoDataUrl(p.id);
      }catch(e){
        continue; // photo introuvable, on l'ignore silencieusement pour ne pas bloquer tout le PDF
      }
      if(x + thumbW > 210 - marginX){ x = marginX; y += thumbH + gap; }
      if(y + thumbH + gap > PAGE_BOTTOM){ newPage(); x = marginX; }
      try{
        doc.addImage(dataUrl, 'JPEG', x, y, thumbW, thumbH);
      }catch(e){ /* format non pris en charge, on ignore cette photo */ }
      x += thumbW + gap;
    }
  }

  for(let idx=0; idx<devices.length; idx++){
    const d = devices[idx];
    if(idx > 0) newPage(); // chaque appareil (à partir du 2e) démarre sur une page fraîche
    ensureSpace(14);
    doc.setDrawColor(0, 180, 216);
    doc.line(marginX, y, 210 - marginX, y);
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(0, 180, 216);
    doc.text('APPAREIL '+(idx+1), marginX, y);
    y += 6;

    // ── Encadré 1 : Appareil (+ photo de plaque signalétique, si disponible) ──
    let plateUrl = null;
    if(d.plateePhoto){
      try{ plateUrl = d.plateePhoto.dataUrl || await fetchPhotoDataUrl(d.plateePhoto.id); }
      catch(e){ /* photo indisponible, l'encadré s'affiche simplement sans */ }
    }
    const applianceBox = drawFramedSection('Appareil', [
      { label: 'Type / Marque / Modèle', value: [d.applianceType, d.brand, d.model].filter(Boolean).join(' — ') },
      { label: 'Numéro de série', value: d.serialNumber || '' },
    ], { rightReserve: plateUrl ? 44 : 0, minHeight: plateUrl ? 46 : 0 });
    if(plateUrl && applianceBox){
      try{
        const imgW = 38, imgH = 38;
        const imgX = 210 - marginX - imgW - 4;
        const imgY = applianceBox.boxTop + 4;
        doc.addImage(plateUrl, 'JPEG', imgX, imgY, imgW, imgH);
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(6.5);
        doc.setTextColor(140, 140, 140);
        doc.text('Plaque signalétique', imgX, imgY + imgH + 3.5, { maxWidth: imgW });
      }catch(e){ /* photo indisponible, on continue sans */ }
    }

    // ── Encadré 2 : Diagnostic ──
    drawFramedSection('Diagnostic', [
      { label: 'Symptôme client', value: d.clientSymptom },
      { label: 'Diagnostic technicien', value: d.diagnosis },
    ]);

    // ── Encadré 3 : Réparation ──
    const reparationFields = [
      { label: 'Réparation effectuée', value: d.workDone },
    ];
    if(d.partsUsed && d.partsUsed.length){
      reparationFields.push({ label: 'Pièces utilisées', value: d.partsUsed.map(p=>p.name+' × '+p.qty).join(', ') });
    }
    if(d.partsNeeded){
      reparationFields.push({ label: 'Pièces à commander', value: d.partsNeeded });
    }
    reparationFields.push({ label: 'Résultat de l\'intervention', value: d.result || d.passageType || '' });
    if((d.result === 'Irréparable' || d.passageType === 'Irréparable') && d.insuranceComment){
      reparationFields.push({ label: 'Commentaire pour l\'assurance', value: d.insuranceComment });
    }
    drawFramedSection('Réparation', reparationFields);

    // ── Encadré 4 : Facturation ──
    drawFramedSection('Facturation', [
      { label: 'Forfait / Prestation', value: d.forfait || '' },
      { label: 'Montant', value: d.amount ? money(d.amount) : '' },
    ]);
    totalAmount += Number(d.amount) || 0;

    // Les photos de CET appareil arrivent juste après lui, sur leur propre page —
    // pas regroupées avec celles des autres appareils à la fin du document.
    await printDevicePhotos(d, idx);
  }

  /* ══════════ Page finale : totaux, statut, observations, signature ══════════ */
  newPage();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(1, 19, 49);
  doc.text('Récapitulatif & validation', marginX, y);
  y += 10;

  if(i.discount && Number(i.discount) > 0){
    field('Sous-total', money(totalAmount));
    field('Remise', '- ' + money(i.discount));
  }
  ensureSpace(14);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(1, 19, 49);
  doc.text('TOTAL FACTURÉ : '+money(i.amount || totalAmount), marginX, y);
  y += 8;
  field('Statut', i.status);
  field('Paiement', i.paymentReceived ? 'Effectué' : 'Non réglé');
  y += 2;
  field('Observations supplémentaires', i.observations || 'Aucune observation supplémentaire.');

  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text('SIGNATURE DU CLIENT', marginX, y);
  y += 4;
  if(i.signature){
    try{
      doc.addImage(i.signature, 'PNG', marginX, y, 70, 24);
      y += 28;
    }catch(e){ /* signature illisible, on l'ignore silencieusement dans le PDF */ }
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(150, 150, 150);
    doc.text('Non signé.', marginX, y);
    y += 10;
  }
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text('Rapport généré le ' + fmtDate(todayISO()) + ' à ' + new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}), marginX, y);

  addFooter();
  return doc;
}

function reportPdfFilename(i){
  const safeName = (i.clientName||'client').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'-');
  return 'Rapport-'+(i.dossierNumber || i.id)+'-'+safeName+'.pdf';
}

async function downloadReportPdf(i, company){
  showToast("Génération du PDF…");
  const doc = await buildReportPdf(i, company);
  if(!doc){ showToast("Le générateur PDF n'a pas pu se charger, réessayez."); return; }
  doc.save(reportPdfFilename(i));
}

/* ══════════ Devis ══════════ */

function nextDevisNumber(state){
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth()+1).padStart(2,'0');
  const prefix = `D-${year}-${month}-`;
  let maxSeq = 0;
  (state.devis||[]).forEach(d=>{
    if(d.devisNumber && d.devisNumber.indexOf(prefix)===0){
      const seq = parseInt(d.devisNumber.slice(prefix.length), 10);
      if(!isNaN(seq) && seq > maxSeq) maxSeq = seq;
    }
  });
  return prefix + String(maxSeq+1).padStart(3,'0');
}

// Partagée par buildReportPdf() et buildDevisPdf() — un seul endroit à corriger
// si jamais le nom du fichier logo change.
async function loadLogoDataUrlForPdf(){
  try{
    const res = await fetch('favicon.png');
    if(!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve)=>{
      const reader = new FileReader();
      reader.onload = ()=>resolve(reader.result);
      reader.onerror = ()=>resolve(null);
      reader.readAsDataURL(blob);
    });
  }catch(e){ return null; }
}

// Charge la carte de visite (carte-visite.png, à la racine du dépôt) en base64 pour
// la joindre à tous les emails envoyés aux clients (rapport, devis, dépôt). Échec
// silencieux si le fichier est introuvable — l'email part quand même, juste sans.
// Envoie un PDF directement à Supabase Storage (jamais via une fonction Vercel,
// pour ne plus jamais être limité par les 4,5 Mo de requête max) puis retourne un
// lien de lecture temporaire, à donner à Resend pour joindre le fichier à l'email.
// pdfBase64 : le contenu du PDF déjà encodé en base64 (sans le préfixe data:...).
async function uploadPdfToStorage(pdfBase64, filename){
  // 1. Demander une autorisation d'upload (requête minuscule, aucun fichier dedans).
  // Regroupé dans /api/photos (action createUploadUrl) plutôt qu'un fichier séparé :
  // le plan Vercel gratuit limite le nombre de fonctions serverless.
  const authRes = await fetch('/api/photos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-session-token': getToken() },
    body: JSON.stringify({ action: 'createUploadUrl', ext: 'pdf' })
  });
  if(!authRes.ok){
    const errData = await authRes.json().catch(()=>({}));
    throw new Error(errData.error || "Impossible de préparer l'envoi du PDF.");
  }
  const { path, signedUrl } = await authRes.json();

  // 2. Convertir le PDF (base64) en fichier binaire.
  const byteChars = atob(pdfBase64);
  const byteNumbers = new Array(byteChars.length);
  for(let idx=0; idx<byteChars.length; idx++) byteNumbers[idx] = byteChars.charCodeAt(idx);
  const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'application/pdf' });

  // 3. Envoyer le PDF DIRECTEMENT à Supabase — ce trajet ne passe jamais par Vercel.
  const uploadRes = await fetch(signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/pdf' },
    body: blob
  });
  if(!uploadRes.ok) throw new Error("Échec de l'envoi du PDF vers le stockage.");

  // 4. Récupérer un lien de lecture temporaire pour ce fichier précis.
  const linkRes = await fetch('/api/photos?id='+encodeURIComponent(path), {
    headers: { 'x-session-token': getToken() }
  });
  if(!linkRes.ok) throw new Error("Impossible de générer le lien de téléchargement du PDF.");
  const linkData = await linkRes.json();
  return linkData.dataUrl; // ici, une vraie URL signée (pas une data URI base64)
}

// Détermine les mentions à afficher sur un devis : toute mention associée à au
// moins un des forfaits utilisés dans ses lignes (association many-to-many gérée
// dans Paramètres → Mentions). Dédoublonne si plusieurs lignes déclenchent la même
// mention.
function getApplicableMentions(devisItems){
  const forfaitLabels = new Set((devisItems||[]).map(it=>it.description).filter(Boolean));
  return (state.settings.mentions || []).filter(m=>(m.forfaits||[]).some(f=>forfaitLabels.has(f)));
}

async function buildDevisPdf(devis, company){
  company = company || {};
  const { jsPDF } = window.jspdf || {};
  if(!jsPDF) return null;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const marginX = 18;
  let y = 22;

  const logoDataUrl = await loadLogoDataUrlForPdf();

  doc.setFont('helvetica','bold');
  doc.setFontSize(26);
  doc.setTextColor(20,20,20);
  doc.text('Devis', marginX, y);

  if(logoDataUrl){
    try{ doc.addImage(logoDataUrl, 'PNG', 210-marginX-28, y-18, 28, 28); }catch(e){}
  }

  y += 14;
  doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(20,20,20);
  doc.text('Numéro de devis', marginX, y);
  doc.text('Date d\'émission', marginX, y+5.5);
  doc.text('Date d\'expiration', marginX, y+11);
  doc.setFont('helvetica','normal');
  doc.text(devis.devisNumber||'', marginX+48, y);
  doc.text(fmtDate(devis.issueDate), marginX+48, y+5.5);
  doc.text(fmtDate(devis.expiryDate), marginX+48, y+11);
  y += 22;

  const colWidth = (210-marginX*2)/2 - 5;
  const col2 = marginX+colWidth+10;
  doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(20,20,20);
  doc.text(((company.technicianName?company.technicianName+' / ':'')+(company.name||'')), marginX, y);
  doc.text(devis.clientName||'', col2, y);
  y += 5.5;
  doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(70,70,70);
  const companyLines = [company.address, [company.postalCode,company.city].filter(Boolean).join(' '), company.email, company.siret].filter(Boolean);
  const clientLines = [devis.address, [devis.postalCode,devis.city].filter(Boolean).join(' '), devis.email].filter(Boolean);
  const maxLines = Math.max(companyLines.length, clientLines.length);
  for(let idx=0; idx<maxLines; idx++){
    if(companyLines[idx]) doc.text(String(companyLines[idx]), marginX, y);
    if(clientLines[idx]) doc.text(String(clientLines[idx]), col2, y);
    y += 4.6;
  }
  y += 8;

  doc.setFillColor(1,19,49);
  doc.rect(marginX, y, 210-marginX*2, 8, 'F');
  doc.setTextColor(255,255,255);
  doc.setFont('helvetica','bold'); doc.setFontSize(8);
  doc.text('DESCRIPTION', marginX+2, y+5.3);
  doc.text('QTÉ', marginX+84, y+5.3);
  doc.text('PRIX U.', marginX+102, y+5.3);
  doc.text('TVA (%)', marginX+132, y+5.3);
  doc.text('TOTAL HT', 210-marginX-2, y+5.3, {align:'right'});
  y += 12;

  doc.setTextColor(20,20,20);
  (devis.items||[]).forEach(it=>{
    doc.setFont('helvetica','bold'); doc.setFontSize(9.5);
    const descLines = doc.splitTextToSize(it.description||'', 76);
    doc.text(descLines, marginX+2, y);
    let usedH = descLines.length * 4.6;
    if(it.detail){
      doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(130,130,130);
      const detailLines = doc.splitTextToSize(String(it.detail), 76);
      doc.text(detailLines, marginX+2, y+usedH);
      usedH += detailLines.length * 4.4;
      doc.setTextColor(20,20,20);
    }
    doc.setFont('helvetica','normal'); doc.setFontSize(9);
    doc.text(String(it.qty||1), marginX+84, y);
    doc.text(money(it.unitPrice), marginX+102, y);
    doc.text(String(it.tvaRate||0)+' %', marginX+132, y);
    doc.text(money(it.totalHT), 210-marginX-2, y, {align:'right'});
    y += Math.max(usedH, 6) + 6;
    doc.setDrawColor(225,225,225);
    doc.line(marginX, y-4, 210-marginX, y-4);
  });

  y += 4;
  function totalLine(label, value, bold){
    doc.setFont('helvetica', bold?'bold':'normal');
    doc.setFontSize(bold?11:9);
    doc.setTextColor(bold?1:90, bold?19:90, bold?49:90);
    doc.text(label, 138, y);
    doc.text(value, 210-marginX-2, y, {align:'right'});
    y += bold?8:6;
  }
  totalLine('Total HT', money(devis.totalHT));
  if(devis.discount) totalLine('Remise', '-'+money(devis.discount));
  totalLine('Montant total de la TVA', money(devis.totalTVA));
  doc.setFillColor(240,240,240);
  doc.rect(136, y-5.5, 210-marginX-136, 9, 'F');
  totalLine('Total TTC', money(devis.totalTTC), true);

  y += 8;
  const applicableMentions = getApplicableMentions(devis.items);
  if(applicableMentions.length){
    applicableMentions.forEach(m=>{
      if(!m.text) return;
      doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(90,90,90);
      doc.text(m.label||'', marginX, y);
      y += 4;
      doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(110,110,110);
      const lines = doc.splitTextToSize(m.text, 210 - marginX*2);
      doc.text(lines, marginX, y);
      y += lines.length * 4 + 3;
    });
  }
  if(devis.comment){
    doc.setFont('helvetica','italic'); doc.setFontSize(8.5); doc.setTextColor(0,140,170);
    const commentLines = doc.splitTextToSize('Note : '+devis.comment, 210 - marginX*2);
    doc.text(commentLines, marginX, y);
    y += commentLines.length * 4.6 + 4;
    doc.setTextColor(20,20,20);
  }
  if(devis.vatNote){
    doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(110,110,110);
    doc.text(devis.vatNote, marginX, y);
    y += 5;
  }

  if(devis.status === 'Accepté' && devis.signature){
    y += 8;
    if(y > 250){ doc.addPage(); y = 20; }
    const boxH = 34;
    doc.setDrawColor(46,204,143);
    doc.setFillColor(240,255,248);
    doc.rect(marginX, y, 210-marginX*2, boxH, 'FD');
    doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(20,140,90);
    doc.text('DEVIS ACCEPTÉ ÉLECTRONIQUEMENT', marginX+4, y+7);
    doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(70,70,70);
    doc.text('Signé le '+fmtDateTime(devis.signedAt), marginX+4, y+13);
    doc.text('Par : '+(devis.signedByEmail||'—'), marginX+4, y+18);
    doc.text('Adresse IP : '+(devis.signedIp||'—'), marginX+4, y+23);
    try{ doc.addImage(devis.signature, 'PNG', 210-marginX-48, y+5, 44, 20); }catch(e){}
    doc.setFont('helvetica','italic'); doc.setFontSize(6.5); doc.setTextColor(120,120,120);
    const legalLines = doc.splitTextToSize('Signature électronique horodatée avec adresse IP, valant preuve d\'acceptation du client (valeur de preuve simple).', 210-marginX*2-6);
    doc.text(legalLines, marginX+4, y+boxH-4);
    y += boxH + 6;
  } else if(devis.status === 'Refusé'){
    y += 8;
    if(y > 260){ doc.addPage(); y = 20; }
    const boxH = 14;
    doc.setDrawColor(255,92,92);
    doc.setFillColor(255,244,244);
    doc.rect(marginX, y, 210-marginX*2, boxH, 'FD');
    doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(200,60,60);
    doc.text('DEVIS REFUSÉ PAR LE CLIENT LE '+fmtDateTime(devis.refusedAt).toUpperCase(), marginX+4, y+9);
    y += boxH + 6;
  }

  doc.setFontSize(7.5); doc.setTextColor(150,150,150);
  doc.text((company.name||'')+(company.legalStatus?', '+company.legalStatus:''), marginX, 287);
  doc.text((devis.devisNumber||'')+' · 1/1', 210-marginX, 287, {align:'right'});

  return doc;
}

/* ══════════ Bon de dépôt ══════════ */

function nextDepositNumber(state){
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth()+1).padStart(2,'0');
  const prefix = `DEP-${year}-${month}-`;
  let maxSeq = 0;
  (state.deposits||[]).forEach(d=>{
    if(d.depositNumber && d.depositNumber.indexOf(prefix)===0){
      const seq = parseInt(d.depositNumber.slice(prefix.length), 10);
      if(!isNaN(seq) && seq > maxSeq) maxSeq = seq;
    }
  });
  return prefix + String(maxSeq+1).padStart(3,'0');
}

async function buildDepositPdf(dep, company){
  company = company || {};
  const { jsPDF } = window.jspdf || {};
  if(!jsPDF) return null;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const marginX = 18;
  const PAGE_BOTTOM = 280;
  let y = 20;

  const logoDataUrl = await loadLogoDataUrlForPdf();

  function addFooter(){
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(150,150,150);
    doc.text((company.name||'AC SERVICE')+' — SIRET '+(company.siret||'—')+' — '+(company.phone||'—'), marginX, 290);
  }
  function newPage(){ addFooter(); doc.addPage(); y = 20; }
  function ensureSpace(needed){ if(y + needed > PAGE_BOTTOM) newPage(); }
  function field(label, value){
    if(!value) return;
    const lines = doc.splitTextToSize(String(value), 210 - marginX*2);
    ensureSpace(9 + lines.length * 5.5);
    doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(120,120,120);
    doc.text(label.toUpperCase(), marginX, y); y += 5;
    doc.setFont('helvetica','normal'); doc.setFontSize(11); doc.setTextColor(20,20,20);
    doc.text(lines, marginX, y); y += lines.length*5.5 + 4;
  }

  // Encadré façon "carte" de l'appli (fond clair, liseré cyan à gauche, coins
  // arrondis), même principe que le PDF de rapport — la hauteur s'ajuste toujours
  // pile au contenu réel.
  function drawFramedSection(title, fields){
    const pad = 4;
    const innerX = marginX + pad + 2;
    const availWidth = 210 - marginX*2 - pad*2 - 2;
    const items = (fields||[]).filter(f=>f.value).map(f=>({
      label: f.label,
      lines: doc.splitTextToSize(String(f.value), availWidth)
    }));
    if(!items.length) return;

    let contentHeight = 7;
    items.forEach(it=>{ contentHeight += 4.2 + it.lines.length*5 + 3; });
    const boxHeight = contentHeight + pad*2;

    ensureSpace(boxHeight + 6);
    const boxTop = y;
    doc.setFillColor(250,250,252); doc.setDrawColor(224,228,233);
    doc.roundedRect(marginX, boxTop, 210 - marginX*2, boxHeight, 2, 2, 'FD');
    doc.setFillColor(0,180,216);
    doc.rect(marginX, boxTop, 1.3, boxHeight, 'F');

    let ty = boxTop + pad + 3.5;
    doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(1,19,49);
    doc.text(title, innerX, ty);
    ty += 6;
    items.forEach(it=>{
      doc.setFont('helvetica','bold'); doc.setFontSize(7.8); doc.setTextColor(130,130,130);
      doc.text(it.label.toUpperCase(), innerX, ty);
      ty += 4.2;
      doc.setFont('helvetica','normal'); doc.setFontSize(9.8); doc.setTextColor(25,25,25);
      doc.text(it.lines, innerX, ty);
      ty += it.lines.length*5 + 3;
    });
    y = boxTop + boxHeight + 5;
  }

  if(logoDataUrl){
    try{ doc.addImage(logoDataUrl, 'PNG', 210 - marginX - 18, y - 6, 18, 18); }catch(e){}
  }
  doc.setFont('helvetica','bold'); doc.setFontSize(16); doc.setTextColor(1,19,49);
  doc.text(company.name || 'AC SERVICE', marginX, y);
  doc.setFontSize(11); doc.setTextColor(0,180,216);
  doc.text('Bon de dépôt', marginX, y+7);
  doc.setTextColor(90,90,90); doc.setFont('helvetica','normal'); doc.setFontSize(10);
  doc.text(dep.depositNumber||'', 210-marginX-22, y, {align:'right'});
  doc.text(fmtDate(dep.depositDate), 210-marginX-22, y+6, {align:'right'});
  y += 16;
  doc.setDrawColor(0,180,216); doc.line(marginX, y, 210-marginX, y); y += 8;

  const depCompanyLines = [company.siret?('SIRET '+company.siret):'', company.phone, company.email].filter(Boolean);
  const depClientLines = [dep.phone, dep.email, fullAddress(dep)].filter(Boolean);
  const depMaxLines = Math.max(depCompanyLines.length, depClientLines.length);
  const depHeaderPad = 4;
  const depHeaderBoxHeight = depHeaderPad*2 + 6 + depMaxLines*4.6 + 2;

  ensureSpace(depHeaderBoxHeight + 6);
  const depHeaderBoxTop = y;
  doc.setFillColor(250, 250, 252); doc.setDrawColor(224, 228, 233);
  doc.roundedRect(marginX, depHeaderBoxTop, 210 - marginX*2, depHeaderBoxHeight, 2, 2, 'FD');
  doc.setFillColor(0, 180, 216);
  doc.rect(marginX, depHeaderBoxTop, 1.3, depHeaderBoxHeight, 'F');

  const depColWidth = (210-marginX*2)/2 - 5;
  const depCol2 = marginX+depHeaderPad+2+depColWidth+10;
  let dhy = depHeaderBoxTop + depHeaderPad + 3.5;
  doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(20,20,20);
  doc.text(((company.technicianName?company.technicianName+' / ':'')+(company.name||'')), marginX+depHeaderPad+2, dhy);
  doc.text(dep.clientName||'', depCol2, dhy);
  dhy += 5.5;
  doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(70,70,70);
  for(let idx=0; idx<depMaxLines; idx++){
    if(depCompanyLines[idx]) doc.text(String(depCompanyLines[idx]), marginX+depHeaderPad+2, dhy);
    if(depClientLines[idx]) doc.text(String(depClientLines[idx]), depCol2, dhy);
    dhy += 4.6;
  }
  y = depHeaderBoxTop + depHeaderBoxHeight + 8;

  drawFramedSection('Appareil déposé', [
    { label: 'Type / Marque / Modèle', value: [dep.applianceType, dep.brand, dep.model].filter(Boolean).join(' — ') },
    { label: 'Numéro de série', value: dep.serialNumber },
    { label: 'Panne déclarée par le client', value: dep.reportedIssue },
    { label: 'État constaté au dépôt', value: dep.conditionNotes },
    { label: 'Accessoires laissés', value: dep.accessoriesLeft },
  ]);

  if(company.storagePolicy){
    y += 2;
    ensureSpace(16);
    doc.setFont('helvetica','italic'); doc.setFontSize(8); doc.setTextColor(120,120,120);
    const lines = doc.splitTextToSize(company.storagePolicy, 210-marginX*2);
    doc.text(lines, marginX, y);
    y += lines.length*4 + 4;
  }

  // Photos jointes au dépôt (état constaté à l'arrivée) — continuent directement
  // à la suite si la place le permet, pour éviter une page inutile.
  if(dep.photos && dep.photos.length){
    ensureSpace(20);
    doc.setFont('helvetica','bold'); doc.setFontSize(13); doc.setTextColor(1,19,49);
    doc.text('Photos — état au dépôt ('+dep.photos.length+')', marginX, y);
    y += 10;
    const thumbW=80, thumbH=60, gap=6;
    let x = marginX;
    for(const p of dep.photos){
      let dataUrl;
      try{ dataUrl = p.dataUrl || await fetchPhotoDataUrl(p.id); }catch(e){ continue; }
      if(x + thumbW > 210-marginX){ x = marginX; y += thumbH+gap; }
      if(y + thumbH + gap > PAGE_BOTTOM){ newPage(); x = marginX; }
      try{ doc.addImage(dataUrl, 'JPEG', x, y, thumbW, thumbH); }catch(e){}
      x += thumbW + gap;
    }
    y += thumbH + gap;
  }

  // Signature de dépôt — continue directement à la suite si la place le permet.
  ensureSpace(40);
  doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor(1,19,49);
  doc.text('Signature du client — dépôt', marginX, y); y += 8;
  if(dep.depositSignature){
    try{ doc.addImage(dep.depositSignature, 'PNG', marginX, y, 70, 24); }catch(e){}
    doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(120,120,120);
    doc.text('Signé le '+fmtDateTime(dep.depositSignedAt), marginX, y+30);
    y += 38;
  } else {
    doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(150,150,150);
    doc.text('Non signé.', marginX, y); y += 14;
  }

  // Signature de restitution, si l'appareil a déjà été récupéré
  if(dep.status === 'Récupéré'){
    ensureSpace(46);
    doc.setDrawColor(46,204,143); doc.setFillColor(240,255,248);
    const boxH = 40;
    doc.rect(marginX, y, 210-marginX*2, boxH, 'FD');
    doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(20,140,90);
    doc.text('APPAREIL RÉCUPÉRÉ PAR LE CLIENT', marginX+4, y+7);
    doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(70,70,70);
    doc.text('Le '+fmtDateTime(dep.pickupSignedAt), marginX+4, y+13);
    doc.text('Paiement : '+(dep.pickupPaymentReceived?'Effectué':'Non réglé'), marginX+4, y+18);
    if(dep.pickupSignature){
      try{ doc.addImage(dep.pickupSignature, 'PNG', 210-marginX-48, y+5, 44, 20); }catch(e){}
    }
    y += boxH + 6;
  }

  addFooter();
  return doc;
}

function depositPdfFilename(dep){
  const clean = (s)=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  return (dep.depositNumber || dep.id)+'-'+(clean(dep.clientName)||'client')+'.pdf';
}

async function downloadDepositPdf(dep, company){
  showToast("Génération du PDF…");
  const doc = await buildDepositPdf(dep, company);
  if(!doc){ showToast("Le générateur PDF n'a pas pu se charger, réessayez."); return; }
  doc.save(depositPdfFilename(dep));
}

async function sendDepositToClient(dep, company){
  if(!dep.email){
    showToast("Aucune adresse email renseignée pour ce client.");
    return false;
  }
  showToast("Génération du PDF et envoi en cours…");
  const doc = await buildDepositPdf(dep, company);
  if(!doc){ showToast("Le générateur PDF n'a pas pu se charger, réessayez."); return false; }
  const filename = depositPdfFilename(dep);
  const pdfBase64 = doc.output('datauristring').split(',')[1];

  const subject = (dep.status==='Récupéré' ? 'Restitution de votre appareil — ' : 'Bon de dépôt — ')+(dep.depositNumber||'')+' — '+(company.name||'AC SERVICE');
  const text = 'Bonjour '+(dep.clientName||'')+',\n\nVeuillez trouver ci-joint '+(dep.status==='Récupéré' ? 'la confirmation de restitution de votre appareil' : 'votre bon de dépôt')+' ('+(dep.depositNumber||'')+'), signé et horodaté.\n\nCordialement,\n'+(company.name||'AC SERVICE')+(company.phone?'\n'+company.phone:'');

  let pdfUrl;
  try{
    pdfUrl = await uploadPdfToStorage(pdfBase64, filename);
  }catch(err){
    showToast("Échec de la préparation du PDF : "+err.message);
    return false;
  }
  const attachments = [
    { filename, path: pdfUrl },
    { filename: 'carte-de-visite-AC-Service.png', path: 'https://ac-service-application.vercel.app/carte-visite.png' }
  ];

  try{
    const res = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-session-token': getToken() },
      body: JSON.stringify({ to: dep.email, subject, text, attachments })
    });
    let data = {};
    try{ data = await res.json(); }catch(e){ data = { error: 'Réponse serveur invalide (HTTP '+res.status+')' }; }
    if(!res.ok || !data.ok){
      showToast("Échec de l'envoi (" + (data.error || ('erreur inconnue, HTTP '+res.status)) + "). Réessayez, ou utilisez le bouton Télécharger le PDF pour l'envoyer vous-même.");
      return false;
    }
    showToast("✅ Bon de dépôt envoyé à " + dep.email + ".");
    return true;
  }catch(err){
    showToast("Impossible de contacter le serveur d'envoi. Vérifiez votre connexion, ou utilisez le bouton Télécharger le PDF pour l'envoyer vous-même.");
    return false;
  }
}

function devisPdfFilename(devis){
  const clean = (s)=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  const name = [clean(devis.firstName), clean(devis.lastName)].filter(Boolean).join('-') || clean(devis.clientName) || 'client';
  return (devis.devisNumber || devis.id)+'-'+name+'.pdf';
}

async function downloadDevisPdf(devis, company){
  showToast("Génération du PDF…");
  const doc = await buildDevisPdf(devis, company);
  if(!doc){ showToast("Le générateur PDF n'a pas pu se charger, réessayez."); return; }
  doc.save(devisPdfFilename(devis));
}

async function sendDevisToClient(devis, company){
  if(!devis.email){
    showToast("Aucune adresse email renseignée pour ce client.");
    return false;
  }
  showToast("Génération du PDF et envoi en cours…");
  const doc = await buildDevisPdf(devis, company);
  if(!doc){ showToast("Le générateur PDF n'a pas pu se charger, réessayez."); return false; }
  const filename = devisPdfFilename(devis);
  const dataUri = doc.output('datauristring');
  const pdfBase64 = dataUri.split(',')[1];

  const signLink = window.location.origin + '/devis-signature.html?token=' + devis.publicToken;
  const subject = 'Votre devis ' + (devis.devisNumber||'') + ' — ' + (company.name || 'AC SERVICE');
  const text = 'Bonjour '+(devis.clientName||'')+',\n\nVeuillez trouver ci-joint votre devis '+(devis.devisNumber||'')+'.\n\nPour l\'accepter ou le refuser en ligne, cliquez sur ce lien :\n'+signLink+'\n\nCe devis est valable jusqu\'au '+fmtDate(devis.expiryDate)+'.\n\nCordialement,\n'+(company.name || 'AC SERVICE')+(company.phone ? '\n'+company.phone : '');

  let pdfUrl;
  try{
    pdfUrl = await uploadPdfToStorage(pdfBase64, filename);
  }catch(err){
    showToast("Échec de la préparation du PDF : "+err.message);
    return false;
  }
  const attachments = [
    { filename, path: pdfUrl },
    { filename: 'carte-de-visite-AC-Service.png', path: 'https://ac-service-application.vercel.app/carte-visite.png' }
  ];

  try{
    const res = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-session-token': getToken() },
      body: JSON.stringify({ to: devis.email, subject, text, attachments })
    });
    let data = {};
    try{ data = await res.json(); }catch(e){ data = { error: 'Réponse serveur invalide (HTTP '+res.status+')' }; }
    if(!res.ok || !data.ok){
      showToast("Échec de l'envoi (" + (data.error || ('erreur inconnue, HTTP '+res.status)) + "). Réessayez, ou utilisez le bouton Télécharger le PDF pour l'envoyer vous-même.");
      return false;
    }
    showToast("✅ Devis envoyé à " + devis.email + ".");
    return true;
  }catch(err){
    showToast("Impossible de contacter le serveur d'envoi. Vérifiez votre connexion, ou utilisez le bouton Télécharger le PDF pour l'envoyer vous-même.");
    return false;
  }
}

async function sendReportToClient(i, company, includeReviewRequest){
  company = company || {};
  if(!i.email){
    showToast("Aucune adresse email renseignée pour ce client — impossible d'envoyer automatiquement.");
    return;
  }
  showToast("Génération du PDF et envoi en cours…");
  const doc = await buildReportPdf(i, company);
  if(!doc){ showToast("Le générateur PDF n'a pas pu se charger, réessayez."); return; }
  const filename = reportPdfFilename(i);
  const dataUri = doc.output('datauristring');
  const pdfBase64 = dataUri.split(',')[1];

  const subject = 'Votre rapport d\'intervention — ' + (company.name || 'AC SERVICE');

  // Le ton du message dépend du résultat : les messages "n'hésitez pas..." /
  // "encore merci" ne sont pertinents que si la réparation est vraiment terminée
  // (1er ou 2nd passage — "Réparé au 1er passage" reste le seul libellé de succès,
  // quel que soit le nombre de passages réels). En cas d'appareil irréparable, on
  // s'excuse à la place. Si le sort est encore en attente (pièce commandée), on ne
  // force aucun des deux tons et on reste neutre.
  const devicesForOutcome = (i.devices && i.devices.length) ? i.devices : [i];
  const allRepaired = devicesForOutcome.length>0 && devicesForOutcome.every(d=>d.result==='Réparé au 1er passage' || d.result==='Réparé');
  const allIrreparable = devicesForOutcome.length>0 && devicesForOutcome.every(d=>(d.result||d.passageType)==='Irréparable');

  let closingText = '';
  let closingHtml = '';
  if(allRepaired){
    closingText = 'N\'hésitez pas à me recontacter si vous avez la moindre question.\n\nEncore merci, et à bientôt !';
    closingHtml = `<p>N'hésitez pas à me recontacter si vous avez la moindre question.</p>
      <p>Encore merci, et à bientôt !</p>`;
  } else if(allIrreparable){
    closingText = 'Je suis sincèrement désolé de ne pas avoir pu réparer votre appareil. Après un diagnostic approfondi, il s\'est malheureusement révélé irréparable, ou sa réparation n\'était pas économiquement justifiable.\n\nJe vous remercie pour votre confiance et reste à votre disposition pour toute future réparation ou tout autre besoin. N\'hésitez pas à faire de nouveau appel à mes services.';
    closingHtml = `<p>Je suis sincèrement désolé de ne pas avoir pu réparer votre appareil. Après un diagnostic approfondi, il s'est malheureusement révélé irréparable, ou sa réparation n'était pas économiquement justifiable.</p>
      <p>Je vous remercie pour votre confiance et reste à votre disposition pour toute future réparation ou tout autre besoin. N'hésitez pas à faire de nouveau appel à mes services.</p>`;
  }

  let text = 'Bonjour '+(i.firstName||i.clientName||'')+',\n\n'
    + 'Merci encore pour votre confiance ! Vous trouverez ci-joint le rapport de mon intervention chez vous.';
  if(closingText) text += '\n\n'+closingText;
  let reviewHtmlBlock = '';

  // La demande d'avis Google est intégrée au même email plutôt que d'en envoyer un
  // second — un seul message reçu par le client, pas de spam à sa boîte mail.
  // Le message encourage un avis sans jamais demander une note précise : Google
  // interdit de solliciter une note chiffrée, sous peine de suspension de la fiche.
  if(includeReviewRequest){
    const link = (company.googleReviewLink || '').trim();
    if(link){
      text += '\n\nSi vous êtes satisfait(e) de mes services, un petit avis sur Google me ferait très plaisir et m\'aiderait beaucoup à me faire connaître dans la région, afin d\'aider encore plus de personnes comme vous qui ont besoin d\'un dépannage :\n'+link;
      reviewHtmlBlock = `<p>Si vous êtes satisfait(e) de mes services, un petit avis sur Google me ferait très plaisir et m'aiderait beaucoup à me faire connaître dans la région, afin d'aider encore plus de personnes comme vous qui ont besoin d'un dépannage :</p>
        <p><a href="${link}" style="display:inline-block;background:#00b4d8;color:#ffffff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:bold;">Laisser un avis Google</a></p>`;
    }
  }

  text += '\n\nCordialement,\n'+(company.name || 'AC SERVICE')+(company.phone ? '\n'+company.phone : '')+(company.email ? '\n'+company.email : '');

  // Version HTML : évite tout risque que le lien "avale" le reste du texte, ce qui
  // peut arriver en texte brut selon la messagerie du destinataire (retours à la
  // ligne mal interprétés). Chaque paragraphe est explicite, le lien est un vrai
  // bouton cliquable isolé.
  const html = `
    <div style="font-family:Arial,sans-serif;font-size:15px;color:#222;line-height:1.5;">
      <p>Bonjour ${escapeHtml(i.firstName||i.clientName||'')},</p>
      <p>Merci encore pour votre confiance ! Vous trouverez ci-joint le rapport de mon intervention chez vous.</p>
      ${closingHtml}
      ${reviewHtmlBlock}
      <p>Cordialement,<br>${escapeHtml(company.name || 'AC SERVICE')}${company.phone ? '<br>'+escapeHtml(company.phone) : ''}${company.email ? '<br>'+escapeHtml(company.email) : ''}</p>
    </div>
  `;

  let pdfUrl;
  try{
    pdfUrl = await uploadPdfToStorage(pdfBase64, filename);
  }catch(err){
    showToast("Échec de la préparation du PDF : "+err.message);
    return;
  }
  const attachments = [
    { filename, path: pdfUrl },
    { filename: 'carte-de-visite-AC-Service.png', path: 'https://ac-service-application.vercel.app/carte-visite.png' }
  ];

  try{
    const res = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-session-token': getToken() },
      body: JSON.stringify({ to: i.email, subject, text, html, attachments })
    });
    let data = {};
    try{ data = await res.json(); }catch(e){ data = { error: 'Réponse serveur invalide (HTTP '+res.status+')' }; }
    if(!res.ok || !data.ok){
      showToast("Échec de l'envoi automatique (" + (data.error || ('erreur inconnue, HTTP '+res.status)) + "). Réessayez, ou utilisez le bouton Télécharger le PDF pour l'envoyer vous-même.");
      return;
    }
    showToast("✅ Email envoyé au client (" + i.email + ").");
  }catch(err){
    showToast("Impossible de contacter le serveur d'envoi. Vérifiez votre connexion, ou utilisez le bouton Télécharger le PDF pour l'envoyer vous-même.");
  }
}

/* ── numéro de dossier automatique : AC-AAAA-MM-XXX, remis à 001 chaque mois ──
   Calculé en scannant les dossiers déjà existants pour le mois en cours plutôt que
   via un compteur séparé : plus simple, et se corrige tout seul si jamais désynchronisé. */
function nextDossierNumber(state){
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth()+1).padStart(2,'0');
  const prefix = `ACS-${year}-${month}-`;
  let maxSeq = 0;
  const scan = (arr)=>{
    (arr||[]).forEach(x=>{
      if(x.dossierNumber && x.dossierNumber.indexOf(prefix)===0){
        const seq = parseInt(x.dossierNumber.slice(prefix.length), 10);
        if(!isNaN(seq) && seq > maxSeq) maxSeq = seq;
      }
    });
  };
  scan(state.appointments);
  scan(state.interventions);
  return prefix + String(maxSeq+1).padStart(3,'0');
}

/* ── ouverture Waze : lien universel (web, repli si l'appli n'est pas installée) ──
   utilisé sur ordinateur ou en dernier recours. Pas de "navigate=yes" : on ne fait
   que préremplir la recherche, le choix de lancer le guidage reste à l'utilisateur. */
// Fenêtre de signature à part : petite boîte centrée sur ordinateur, plein écran
// sur téléphone (avec un repère pour tourner l'appareil en paysage, plus confortable
// pour signer). N'écrase jamais la signature déjà enregistrée tant que "Valider"
// n'a pas été cliqué — fermer sans valider ne change rien.
function openSignatureCapture(existingSignature, onSave){
  const overlay = document.createElement('div');
  overlay.className = 'sig-capture-overlay';
  overlay.innerHTML = `
    <div class="sig-capture-box">
      <div class="sig-capture-header">
        <span>✍️ Signature du client</span>
        <button type="button" id="sigCaptureClose">×</button>
      </div>
      <div class="sig-capture-canvas-wrap">
        <canvas id="sigCaptureCanvas"></canvas>
      </div>
      <div class="sig-capture-rotate-hint">🔄 Tournez votre téléphone pour signer plus confortablement</div>
      <div class="sig-capture-actions">
        <button type="button" id="sigCaptureClear">Effacer</button>
        <button type="button" id="sigCaptureValidate">✅ Valider la signature</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const canvas = document.getElementById('sigCaptureCanvas');
  const ctx = canvas.getContext('2d');
  let drawing = false;
  let savedDataUrl = existingSignature || null;

  function fitCanvas(){
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, rect.width * ratio);
    canvas.height = Math.max(1, rect.height * ratio);
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#011331';
    if(savedDataUrl){
      const img = new Image();
      img.onload = ()=>{
        // Garde les proportions d'origine du tracé (ne l'étire jamais dans le nouveau
        // format), centré dans l'espace disponible — comme un ajustement "contenu"
        // d'image, pour ne jamais déformer la signature au changement d'orientation.
        const scale = Math.min(rect.width / img.width, rect.height / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        const x = (rect.width - w) / 2;
        const y = (rect.height - h) / 2;
        ctx.drawImage(img, x, y, w, h);
      };
      img.src = savedDataUrl;
    }
  }
  fitCanvas();

  function getPos(evt){
    const r = canvas.getBoundingClientRect();
    const point = evt.touches ? evt.touches[0] : evt;
    return { x: point.clientX - r.left, y: point.clientY - r.top };
  }
  let lastPoint = null;
  function start(evt){
    evt.preventDefault();
    drawing = true;
    const p = getPos(evt);
    lastPoint = p;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }
  function move(evt){
    if(!drawing) return;
    evt.preventDefault();
    const p = getPos(evt);
    // Courbe passant par le milieu entre l'ancien et le nouveau point, avec l'ancien
    // point comme point de contrôle : c'est ce qui donne un tracé lisse plutôt que
    // des segments droits qui se voient à chaque changement de direction.
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

  // Une rotation d'écran redimensionne le canevas : on sauvegarde le tracé juste
  // avant, pour ne pas le perdre au passage portrait -> paysage (ou l'inverse).
  function handleResize(){
    savedDataUrl = canvas.toDataURL('image/png');
    fitCanvas();
  }
  window.addEventListener('resize', handleResize);
  window.addEventListener('orientationchange', handleResize);

  function cleanup(){
    window.removeEventListener('mouseup', end);
    window.removeEventListener('resize', handleResize);
    window.removeEventListener('orientationchange', handleResize);
    overlay.remove();
  }

  document.getElementById('sigCaptureClose').onclick = cleanup;
  document.getElementById('sigCaptureClear').onclick = ()=>{
    savedDataUrl = null;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
  };
  document.getElementById('sigCaptureValidate').onclick = ()=>{
    const dataUrl = canvas.toDataURL('image/png');
    onSave(dataUrl);
    cleanup();
  };
}

// Recompose une adresse complète à partir des champs séparés (rue / code postal / ville),
// utilisée pour Waze, le PDF et les affichages — les trois champs restent stockés
// séparément, seule leur combinaison est calculée à la volée.
function fullAddress(obj){
  if(!obj) return '';
  const cityLine = [obj.postalCode, obj.city].filter(Boolean).join(' ');
  return [obj.address, cityLine].filter(Boolean).join(', ');
}

/* ── lien natif de l'appli mobile — format exact documenté par Waze : pas de
   segment "/ul" (celui-ci n'existe que dans le lien web). Ouvre directement
   l'appli si elle est installée, sans passer par le navigateur. ── */
function wazeAppUrl(address){
  return 'waze://?q='+encodeURIComponent(address);
}

function openWaze(address){
  if(!address) return;
  // Un vrai clic sur un lien <a href="..."> est ce qui déclenche le plus fiablement
  // l'ouverture native de l'appli sur mobile ; une redirection pilotée en JS
  // (location.href) est parfois traitée comme une simple navigation web par le
  // téléphone. On simule donc un vrai clic sur un lien créé à la volée.
  const a = document.createElement('a');
  a.href = wazeAppUrl(address);
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/* ── liens Waze : les adresses affichées dans les listes utilisent directement un
   href="..." vers wazeAppUrl() (pas d'interception JS), pour que le téléphone les
   traite comme un vrai lien et bascule fiablement vers l'appli Waze quand elle est
   installée. ── */

/* ── optimisation d'itinéraire ──
   Géolocalise les adresses (via /api/geocode, mis en cache côté serveur) puis calcule
   l'ordre de passage le plus court par plus-proche-voisin (à vol d'oiseau) : largement
   suffisant pour quelques rendez-vous par demi-journée, sans dépendre d'un service de
   routage payant. */
async function geocodeAddresses(addresses){
  const unique = Array.from(new Set(addresses.filter(Boolean)));
  if(!unique.length) return {};
  const res = await fetch('/api/geocode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-session-token': getToken() },
    body: JSON.stringify({ addresses: unique })
  });
  if(!res.ok){
    let msg = "Échec de la géolocalisation ("+res.status+")";
    try{ const d = await res.json(); if(d.error) msg = d.error; }catch(e){}
    throw new Error(msg);
  }
  const data = await res.json();
  return data.points || {};
}

function haversineKm(a, b){
  const R = 6371;
  const dLat = (b.lat-a.lat) * Math.PI/180;
  const dLon = (b.lon-a.lon) * Math.PI/180;
  const lat1 = a.lat * Math.PI/180, lat2 = b.lat * Math.PI/180;
  const h = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// stops : [{ id, address }]. startPoint : {lat,lon} optionnel (adresse de départ).
// Renvoie { order: [id,...] dans l'ordre optimisé, points: {address:{lat,lon}}, totalKm, unresolved:[address,...] }
async function optimizeRoute(stops, startAddress){
  const addressesToGeocode = stops.map(s=>s.address);
  if(startAddress) addressesToGeocode.push(startAddress);
  const points = await geocodeAddresses(addressesToGeocode);

  const resolvedStops = stops.filter(s=>points[s.address]);
  const unresolved = stops.filter(s=>!points[s.address]).map(s=>s.address);

  if(!resolvedStops.length){
    return { order: stops.map(s=>s.id), points, totalKm: 0, unresolved };
  }

  const remaining = resolvedStops.slice();
  const order = [];
  let current = (startAddress && points[startAddress]) ? points[startAddress] : points[remaining[0].address];
  let totalKm = 0;

  while(remaining.length){
    let bestIdx = 0, bestDist = Infinity;
    remaining.forEach((s, idx)=>{
      const d = haversineKm(current, points[s.address]);
      if(d < bestDist){ bestDist = d; bestIdx = idx; }
    });
    const next = remaining.splice(bestIdx, 1)[0];
    totalKm += bestDist;
    current = points[next.address];
    order.push(next.id);
  }

  // Les adresses non géolocalisées restent à la fin, dans leur ordre d'origine.
  stops.forEach(s=>{ if(!points[s.address] && !order.includes(s.id)) order.push(s.id); });

  return { order, points, totalKm: Math.round(totalKm*10)/10, unresolved };
}

function googleMapsMultiStopUrl(addressesInOrder){
  if(!addressesInOrder.length) return '';
  const origin = encodeURIComponent(addressesInOrder[0]);
  const destination = encodeURIComponent(addressesInOrder[addressesInOrder.length-1]);
  const waypoints = addressesInOrder.slice(1, -1).map(a=>encodeURIComponent(a)).join('|');
  let url = 'https://www.google.com/maps/dir/?api=1&origin='+origin+'&destination='+destination;
  if(waypoints) url += '&waypoints='+waypoints;
  return url;
}

/* ── registre de CA verrouillé ──
   Enregistre/actualise une ligne quand un rapport passe en "Facturé". Cette ligne
   n'est JAMAIS retirée automatiquement, même si le rapport est ensuite supprimé —
   seule une action manuelle dans Paramètres peut la corriger. Le tableau de bord se
   base sur ce registre, pas sur les rapports en direct, pour rester stable. */
function syncRevenueLedger(state, intervention){
  state.revenueLedger = state.revenueLedger || [];
  const idx = state.revenueLedger.findIndex(e=>e.interventionId===intervention.id);
  if(!intervention.paymentReceived){
    // Décoché avant suppression du rapport = correction volontaire, on retire la ligne.
    // Une fois le rapport supprimé, cette fonction n'est plus jamais rappelée : la
    // dernière ligne enregistrée reste alors verrouillée pour de bon.
    if(idx >= 0) state.revenueLedger.splice(idx, 1);
    return;
  }
  const entry = {
    interventionId: intervention.id,
    dossierNumber: intervention.dossierNumber || '',
    clientName: intervention.clientName || '',
    amount: Number(intervention.amount) || 0,
    date: intervention.date || todayISO(),
    lockedAt: new Date().toISOString()
  };
  if(idx >= 0) state.revenueLedger[idx] = entry;
  else state.revenueLedger.push(entry);
}

/* ── passerelle site web -> appli (voir api/rendezvous.js) ──
   Utilise la clé de LECTURE (state.settings.readApiKey), un mécanisme indépendant
   du login de l'appli : cette clé protège uniquement la file d'attente des RDV
   envoyés par le site public, jamais les données de l'appli elle-même. */
async function importFromGateway(state, onDone, opts){
  const silent = !!(opts && opts.silent);
  const key = (state.settings.readApiKey||'').trim();
  if(!key){
    if(!silent) showToast("Configurez d'abord la clé API de lecture dans Paramètres.");
    return;
  }
  try{
    const res = await fetch('/api/rendezvous', { headers: { 'x-api-key': key } });
    if(!res.ok){
      if(!silent) showToast(res.status===401 ? "Clé API refusée par le serveur." : "Erreur passerelle ("+res.status+").");
      return;
    }
    const data = await res.json();
    const items = data.items || [];
    if(!items.length){
      if(!silent) showToast("Aucune nouvelle demande depuis le site.");
      return;
    }
    items.forEach(it=>{
      const appt = {
        id: uid(),
        bookingId: it.id || null,
        dossierNumber: nextDossierNumber(state),
        firstName: it.firstName || '',
        lastName: it.lastName || '',
        clientName: it.clientName || ((it.firstName||'')+' '+(it.lastName||'')).trim(),
        phone: it.phone || '',
        email: it.email || '',
        address: it.address || '',
        postalCode: it.postalCode || '',
        city: it.city || '',
        date: it.date || todayISO(),
        time: it.slot === 'morning' ? 'Matin' : it.slot === 'afternoon' ? 'Après-midi' : (it.time || ''),
        applianceType: it.applianceType || (state.settings.applianceTypes[0]||''),
        brand: it.brand || '',
        model: it.model || '',
        referral: it.referral || '',
        issue: it.issue || '',
        photos: Array.isArray(it.photos) ? it.photos : [],
        // Même si une place a déjà été réservée côté site (système anti-survente),
        // le RDV atterrit d'abord dans "Demandes en attente" : la validation manuelle
        // reste nécessaire avant qu'il apparaisse dans le calendrier de Planning.
        status: 'Nouveau',
        source: 'Site web',
        requestType: it.requestType === 'depot' ? 'depot' : 'domicile'
      };
      state.appointments.push(appt);
      upsertClientFromContact(state, appt);
    });
    const ok = await saveState(state);
    if(!ok) return;
    // On vide la file côté serveur pour ne pas réimporter deux fois.
    await fetch('/api/rendezvous', { method:'DELETE', headers: { 'x-api-key': key } });
    showToast(items.length+" nouvelle(s) demande(s) importée(s) depuis le site.");
    if(onDone) onDone();
  }catch(e){
    if(!silent) showToast("Impossible de joindre la passerelle : "+e.message);
  }
}
