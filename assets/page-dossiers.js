let state = null;
let dossYear, dossMonth, dossSelectedDay = null;
let dossSelectionMode = false;
let dossSelectedKeys = new Set();

(async function(){
  state = await requireAuth();
  if(!state) return;
  renderNavbar('dossiers', state);
  const now = new Date();
  dossYear = now.getFullYear();
  dossMonth = now.getMonth();
  renderDossiers();
  startAutoRefresh(applyDossRefresh, 30000);
})();

const DOSS_DOW = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
const DOSS_MOIS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

// Appelé périodiquement par startAutoRefresh : notifie si un devis a été accepté
// ou refusé depuis le dernier chargement, puis ré-affiche avec les données fraîches.
function applyDossRefresh(newState){
  const prevDevisStatus = {};
  (state.devis||[]).forEach(d=>{ prevDevisStatus[d.id] = d.status; });

  state = newState;

  (state.devis||[]).forEach(d=>{
    const prev = prevDevisStatus[d.id];
    if(prev && prev!==d.status && (d.status==='Accepté' || d.status==='Refusé')){
      showToast((d.status==='Accepté'?'✅ Devis accepté par ':'❌ Devis refusé par ')+(d.clientName||'le client')+(d.devisNumber?(' ('+d.devisNumber+')'):''));
    }
  });

  renderDossGrid();
  drawDossList();
}

function renderDossiers(){
  const main = document.getElementById('pageContent');
  const yearOptions = [];
  const currentYear = new Date().getFullYear();
  for(let y=currentYear-2; y<=currentYear+1; y++) yearOptions.push(y);

  main.innerHTML = `
    <div class="page-head">
      <h2>Doss<span>iers</span></h2>
      <div style="display:flex;gap:.6rem;flex-wrap:wrap;">
        <button class="btn btn-ghost" id="dossSelectModeBtn">☑️ Sélectionner plusieurs</button>
        <button class="btn btn-primary" style="width:auto" id="newReportBtn">+ Nouveau rapport</button>
      </div>
    </div>
    <div id="dossSelectionBar" style="display:none;align-items:center;gap:.7rem;flex-wrap:wrap;background:rgba(0,180,216,.08);border:1px solid rgba(0,180,216,.3);border-radius:10px;padding:.7rem 1rem;margin-bottom:1rem;">
      <strong id="dossSelectionCount" style="font-family:'Rajdhani',sans-serif;color:var(--cyan);"></strong>
      <button class="btn btn-ghost btn-small" id="dossSelectAllBtn">Tout sélectionner (visible)</button>
      <button class="btn btn-danger btn-small" id="dossDeleteSelectedBtn">🗑️ Supprimer la sélection</button>
      <button class="btn btn-ghost btn-small" id="dossCancelSelectBtn">Annuler</button>
    </div>
    <p style="font-size:.85rem;color:var(--text-light);margin-bottom:1rem;">
      Un dossier apparaît dès qu'un rendez-vous est confirmé (même à venir), et se complète ensuite au fur et à mesure : devis, rapport(s)... Il disparaît si le rendez-vous repasse en attente ou est annulé.
    </p>

    <div class="section-block">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.6rem;margin-bottom:1rem;">
        <div style="display:flex;align-items:center;gap:.6rem;">
          <button class="btn btn-ghost btn-small" id="dossPrevMonth">‹</button>
          <strong id="dossMonthLabel" style="font-family:'Rajdhani',sans-serif;font-size:1.1rem;text-transform:uppercase;letter-spacing:.03em;min-width:160px;text-align:center;"></strong>
          <button class="btn btn-ghost btn-small" id="dossNextMonth">›</button>
        </div>
        <div style="display:flex;gap:.5rem;align-items:center;">
          <select id="dossMonthSelect">${DOSS_MOIS.map((m,idx)=>`<option value="${idx}">${m}</option>`).join('')}</select>
          <select id="dossYearSelect">${yearOptions.map(y=>`<option value="${y}">${y}</option>`).join('')}</select>
        </div>
      </div>
      <div class="cal-strip-wrapper">
        <div class="cal-strip" id="dossGrid"></div>
      </div>
      <div id="dossDayFilterNote" style="margin-top:.6rem;font-size:.82rem;color:var(--text-light);display:none;">
        Filtré sur <strong id="dossDayFilterLabel"></strong> — <a href="#" id="dossClearDayFilter" style="color:var(--cyan);">voir tout le mois ↺</a>
      </div>
    </div>

    <div class="filters">
      <select id="dossFilterKind">
        <option value="">Tous les dossiers</option>
        <option value="domicile">🏠 Dossiers à domicile</option>
        <option value="depot">📥 Dossiers de dépôt</option>
      </select>
      <select id="dossFilterType">
        <option value="">Tout afficher (RDV + rapport + devis)</option>
        <option value="rdv">N'afficher que le RDV</option>
        <option value="interv">N'afficher que le(s) rapport(s)</option>
        <option value="devis">N'afficher que le(s) devis</option>
        <option value="depot">N'afficher que le(s) dépôt(s)</option>
      </select>
      <input id="dossFilterSearch" placeholder="Rechercher un client...">
    </div>
    <div id="dossList"></div>
  `;

  document.getElementById('newReportBtn').onclick = ()=>{ window.location.href = 'planning.html?newReport=1'; };
  document.getElementById('dossPrevMonth').onclick = ()=>{ changeMonth(-1); };
  document.getElementById('dossNextMonth').onclick = ()=>{ changeMonth(1); };
  document.getElementById('dossMonthSelect').onchange = (e)=>{ dossMonth = Number(e.target.value); dossSelectedDay = null; refreshDossiers(); };
  document.getElementById('dossYearSelect').onchange = (e)=>{ dossYear = Number(e.target.value); dossSelectedDay = null; refreshDossiers(); };
  document.getElementById('dossFilterKind').onchange = drawDossList;
  document.getElementById('dossFilterType').onchange = drawDossList;
  document.getElementById('dossFilterSearch').oninput = drawDossList;
  document.getElementById('dossClearDayFilter').onclick = (e)=>{ e.preventDefault(); dossSelectedDay = null; refreshDossiers(); };
  document.getElementById('dossSelectModeBtn').onclick = toggleDossSelectionMode;
  document.getElementById('dossSelectAllBtn').onclick = selectAllVisibleDossiers;
  document.getElementById('dossDeleteSelectedBtn').onclick = deleteSelectedDossiers;
  document.getElementById('dossCancelSelectBtn').onclick = ()=>{ dossSelectionMode = false; dossSelectedKeys.clear(); updateDossSelectionUI(); drawDossList(); };

  refreshDossiers();
}

function toggleDossSelectionMode(){
  dossSelectionMode = !dossSelectionMode;
  if(!dossSelectionMode) dossSelectedKeys.clear();
  updateDossSelectionUI();
  drawDossList();
}

function updateDossSelectionUI(){
  document.getElementById('dossSelectionBar').style.display = dossSelectionMode ? 'flex' : 'none';
  document.getElementById('dossSelectModeBtn').textContent = dossSelectionMode ? '✖️ Quitter la sélection' : '☑️ Sélectionner plusieurs';
  document.getElementById('dossSelectionCount').textContent = dossSelectedKeys.size+' dossier(s) sélectionné(s)';
}

function selectAllVisibleDossiers(){
  document.querySelectorAll('.dossSelectCheckbox').forEach(cb=>{ dossSelectedKeys.add(cb.dataset.key); cb.checked = true; });
  updateDossSelectionUI();
}

async function deleteSelectedDossiers(){
  if(!dossSelectedKeys.size){ showToast("Aucun dossier sélectionné."); return; }
  if(!confirm("Mettre à la corbeille les "+dossSelectedKeys.size+" dossier(s) sélectionné(s) (rapport(s) et devis liés) ? Le RDV reste dans Planning. Tu pourras restaurer depuis la Corbeille.")) return;

  const groups = buildAllDossierGroups().filter(g=>dossSelectedKeys.has(g.key));
  const intervBackup = state.interventions;
  const devisBackup = state.devis;
  const trashBackup = state.trash.slice();

  const intervIdsToDelete = new Set();
  const devisIdsToDelete = new Set();
  groups.forEach(g=>{
    g.interv.forEach(iv=>intervIdsToDelete.add(iv.id));
    g.devis.forEach(dv=>devisIdsToDelete.add(dv.id));
  });

  const deletedInterv = state.interventions.filter(iv=>intervIdsToDelete.has(iv.id));
  const deletedDevis = state.devis.filter(dv=>devisIdsToDelete.has(dv.id));

  state.interventions = state.interventions.filter(iv=>!intervIdsToDelete.has(iv.id));
  state.devis = (state.devis||[]).filter(dv=>!devisIdsToDelete.has(dv.id));

  deletedInterv.forEach(iv=>moveToTrash(state, 'rapport', (iv.dossierNumber?iv.dossierNumber+' — ':'')+(iv.clientName||''), iv));
  deletedDevis.forEach(dv=>moveToTrash(state, 'devis', (dv.devisNumber?dv.devisNumber+' — ':'')+(dv.clientName||''), dv));

  const ok = await saveState(state);
  if(!ok){ state.interventions = intervBackup; state.devis = devisBackup; state.trash = trashBackup; return; }

  const count = groups.length;
  dossSelectedKeys.clear();
  dossSelectionMode = false;
  updateDossSelectionUI();
  renderDossGrid();
  drawDossList();
  showToast(count+" dossier(s) déplacé(s) vers la corbeille.");
}

function changeMonth(delta){
  dossMonth += delta;
  if(dossMonth < 0){ dossMonth = 11; dossYear--; }
  if(dossMonth > 11){ dossMonth = 0; dossYear++; }
  dossSelectedDay = null;
  refreshDossiers();
}

function refreshDossiers(){
  document.getElementById('dossMonthSelect').value = String(dossMonth);
  document.getElementById('dossYearSelect').value = String(dossYear);
  document.getElementById('dossMonthLabel').textContent = DOSS_MOIS[dossMonth]+' '+dossYear;
  renderDossGrid();
  drawDossList();
}

// Construit TOUS les groupes-dossiers, tous mois confondus. Un rapport ou un devis
// ne disparaît jamais : même si le RDV lié est annulé, introuvable (supprimé), ou
// dans un statut inattendu, le groupe existe quand même (seule la section RDV de
// la carte reste vide dans ce cas). Chaque groupe garde la liste de toutes les
// dates pertinentes (RDV + rapports + devis) pour le filtre par mois.
function buildAllDossierGroups(){
  const groups = {};
  function ensureGroup(key, seed){
    if(!groups[key]) groups[key] = Object.assign({ key, dossierNumber:'', rdv:null, interv:[], devis:[], deposits:[], clientName:'', dates:[] }, seed||{});
    return groups[key];
  }

  state.appointments.forEach(a=>{
    if(!['À faire','Terminé'].includes(a.status)) return;
    const key = a.dossierNumber || ('__rdv_'+a.id);
    const g = ensureGroup(key, { dossierNumber: a.dossierNumber||'', clientName: a.clientName||'' });
    g.rdv = a;
    if(a.date) g.dates.push(a.date);
  });

  state.interventions.forEach(iv=>{
    let key, rdv = null;
    if(iv.linkedRdvId) rdv = state.appointments.find(a=>a.id===iv.linkedRdvId);
    if(rdv && rdv.dossierNumber) key = rdv.dossierNumber;
    else key = iv.dossierNumber || ('__iv_'+iv.id);
    const g = ensureGroup(key, { dossierNumber: iv.dossierNumber || (rdv?rdv.dossierNumber:'') || '', clientName: iv.clientName||(rdv?rdv.clientName:'')||'' });
    if(!g.clientName) g.clientName = iv.clientName || (rdv?rdv.clientName:'') || '';
    g.interv.push(iv);
    if(iv.date) g.dates.push(iv.date);
  });

  (state.devis||[]).forEach(dv=>{
    let key, rdv = null;
    if(dv.linkedRdvId) rdv = state.appointments.find(a=>a.id===dv.linkedRdvId);
    if(rdv && rdv.dossierNumber) key = rdv.dossierNumber;
    else key = dv.dossierNumber || ('__dv_'+dv.id);
    const g = ensureGroup(key, { dossierNumber: dv.dossierNumber || (rdv?rdv.dossierNumber:'') || '', clientName: dv.clientName||(rdv?rdv.clientName:'')||'' });
    if(!g.clientName) g.clientName = dv.clientName || (rdv?rdv.clientName:'') || '';
    g.devis.push(dv);
    if(dv.issueDate) g.dates.push(dv.issueDate);
  });

  (state.deposits||[]).forEach(dep=>{
    let key, rdv = null;
    if(dep.linkedRdvId) rdv = state.appointments.find(a=>a.id===dep.linkedRdvId);
    if(rdv && rdv.dossierNumber) key = rdv.dossierNumber;
    else key = dep.dossierNumber || ('__dep_'+dep.id);
    const g = ensureGroup(key, { dossierNumber: dep.dossierNumber || (rdv?rdv.dossierNumber:'') || '', clientName: dep.clientName||(rdv?rdv.clientName:'')||'' });
    if(!g.clientName) g.clientName = dep.clientName || (rdv?rdv.clientName:'') || '';
    g.deposits.push(dep);
    if(dep.depositDate) g.dates.push(dep.depositDate);
  });

  return Object.values(groups);
}

function archivedDossiersForMonth(){
  const prefix = dossYear+'-'+String(dossMonth+1).padStart(2,'0');
  return buildAllDossierGroups()
    .filter(g=>g.dates.some(d=>d && d.startsWith(prefix)))
    .map(g=>{
      const inMonth = g.dates.filter(d=>d && d.startsWith(prefix)).sort();
      const displayDate = inMonth.length ? inMonth[inMonth.length-1] : (g.dates.sort().slice(-1)[0] || '');
      return Object.assign({}, g, { date: displayDate });
    });
}

function renderDossGrid(){
  const grid = document.getElementById('dossGrid');
  grid.innerHTML = '';
  const groups = archivedDossiersForMonth();
  const countByDay = {};
  groups.forEach(g=>{ countByDay[g.date] = (countByDay[g.date]||0)+1; });

  const daysInMonth = new Date(dossYear, dossMonth+1, 0).getDate();

  for(let d=1; d<=daysInMonth; d++){
    const dateStr = dossYear+'-'+String(dossMonth+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
    const date = new Date(dossYear, dossMonth, d);
    const count = countByDay[dateStr] || 0;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'day-card' + (dossSelectedDay===dateStr ? ' day-active' : '');
    card.innerHTML = '<span class="dow">'+DOSS_DOW[(date.getDay()+6)%7]+'</span>'
      + '<span class="num">'+d+'</span>'
      + (count ? '<span class="day-count">'+count+'</span>' : '');
    card.addEventListener('click', ()=>{
      dossSelectedDay = (dossSelectedDay===dateStr) ? null : dateStr;
      renderDossGrid();
      drawDossList();
    });
    grid.appendChild(card);
  }
}

function dossierDeviceSummary(interv){
  const devices = interv.devices || [];
  if(!devices.length) return { title: [interv.applianceType, interv.brand, interv.model].filter(Boolean).join(' ') || '—', work: interv.workDone || '' };
  const title = [devices[0].applianceType, devices[0].brand, devices[0].model].filter(Boolean).join(' ')
    + (devices.length>1 ? ` (+${devices.length-1} autre${devices.length>2?'s':''})` : '');
  const work = devices.map(d=>d.workDone).filter(Boolean).join(' · ');
  return { title, work };
}

function isDepotDossier(g){
  return (g.deposits && g.deposits.length>0) || !!(g.rdv && g.rdv.requestType==='depot');
}

function drawDossList(){
  const kind = document.getElementById('dossFilterKind').value;
  const type = document.getElementById('dossFilterType').value;
  const search = document.getElementById('dossFilterSearch').value.toLowerCase();
  const note = document.getElementById('dossDayFilterNote');

  let groups;
  if(search){
    // La recherche par client ignore le mois/jour sélectionné et cherche partout —
    // évite de devoir deviner dans quel mois se trouve un dossier.
    note.style.display = 'none';
    groups = buildAllDossierGroups()
      .filter(g=>(g.clientName||'').toLowerCase().includes(search))
      .map(g=>{
        const sorted = g.dates.filter(Boolean).sort();
        return Object.assign({}, g, { date: sorted.length ? sorted[sorted.length-1] : '' });
      });
  } else {
    if(dossSelectedDay){
      note.style.display = 'block';
      document.getElementById('dossDayFilterLabel').textContent = fmtDate(dossSelectedDay);
    } else {
      note.style.display = 'none';
    }
    groups = archivedDossiersForMonth();
    if(dossSelectedDay) groups = groups.filter(g=>g.date===dossSelectedDay);
  }
  if(kind) groups = groups.filter(g=>kind==='depot' ? isDepotDossier(g) : !isDepotDossier(g));
  groups.sort((a,b)=>(b.date||'').localeCompare(a.date||''));

  const el = document.getElementById('dossList');
  if(!groups.length){
    el.innerHTML = `<div class="empty-state"><div class="mark">🗂️</div>Aucun dossier pour cette période.</div>`;
    return;
  }

  const showRdv = !type || type==='rdv';
  const showInterv = !type || type==='interv';
  const showDevis = !type || type==='devis';
  const showDeposit = !type || type==='depot';

  el.innerHTML = groups.map(g=>{
    const hasInterv = g.interv.length>0;
    const totalAmount = g.interv.reduce((s,iv)=>s+(Number(iv.amount)||0), 0);
    const unpaidAmount = g.interv.reduce((s,iv)=>s+interventionUnpaidAmount(iv), 0);
    const anyUnpaid = unpaidAmount > 0.001;
    const deviceLabel = g.interv[0] ? dossierDeviceSummary(g.interv[0]).title : (g.rdv ? (g.rdv.applianceType||'') : '');
    const kindBadge = isDepotDossier(g) ? '📥' : '🏠';
    // Le statut affiché vient toujours du rendez-vous lui-même (À faire/Terminé/Annulé),
    // jamais du statut interne du rapport — cohérent avec Planning et Dépôts.
    const rdvStatus = g.rdv ? g.rdv.status : 'À faire';

    return `
      <div style="display:flex;align-items:flex-start;gap:.6rem;">
        ${dossSelectionMode ? `<input type="checkbox" class="dossSelectCheckbox" data-key="${escapeHtml(g.key)}" ${dossSelectedKeys.has(g.key)?'checked':''} style="margin-top:1.3rem;width:18px;height:18px;flex:0 0 auto;">` : ''}
        <details class="dossier-card" style="flex:1;min-width:0;">
        <summary class="dossier-summary">
          <div class="item-main">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:.8rem;flex-wrap:wrap;">
              <div>
                <div class="title">${kindBadge} ${g.dossierNumber ? `<span style="color:var(--cyan);">${escapeHtml(g.dossierNumber)}</span> — `:''}${escapeHtml(g.clientName||'—')}</div>
                <div class="meta">${fmtDate(g.date)}${g.rdv&&g.rdv.city?(' · '+escapeHtml(g.rdv.city)):(g.rdv&&g.rdv.address?(' · '+escapeHtml(g.rdv.address)):'')}</div>
              </div>
              ${totalAmount>0 ? (anyUnpaid
                ? `<div style="font-family:'Rajdhani',sans-serif;font-weight:700;font-size:1.25rem;color:var(--danger);white-space:nowrap;">Reste à payer : ${money(unpaidAmount)}</div>`
                : `<div style="font-family:'Rajdhani',sans-serif;font-weight:700;font-size:1.25rem;color:var(--cyan);white-space:nowrap;">${money(totalAmount)}</div>`
              ) : ''}
            </div>
            ${deviceLabel ? `<div class="tag-list" style="margin-top:.6rem;"><span class="tag">${escapeHtml(deviceLabel)}</span></div>` : ''}
            <div style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;margin-top:.7rem;">
              <span class="badge ${statusBadgeClass(rdvStatus)}">${rdvStatus==='Terminé'?'✅ ':rdvStatus==='Annulé'?'❌ ':'🔵 '}${escapeHtml(rdvStatus)}</span>
              ${hasInterv ? `<span class="payment-pill ${anyUnpaid?'payment-pill-unpaid':'payment-pill-paid'}">${anyUnpaid?'📃 Non facturé':'✅ Facturé'}</span>` : ''}
              ${anyUnpaid ? `<span class="payment-pill payment-pill-unpaid">Reste ${money(unpaidAmount)}</span>` : ''}
            </div>
          </div>
        </summary>
        <div class="dossier-body">
          ${showRdv && g.rdv ? renderDossRdvSection(g.rdv) : ''}
          ${showInterv ? g.interv.map(renderDossIntervSection).join('') : ''}
          ${showDevis ? g.devis.map(renderDossDevisSection).join('') : ''}
          ${showDeposit ? (g.deposits||[]).map(renderDossDepositSection).join('') : ''}
        </div>
      </details>
      </div>
    `;
  }).join('');

  document.querySelectorAll('.dossSelectCheckbox').forEach(cb=>{
    cb.onchange = ()=>{
      if(cb.checked) dossSelectedKeys.add(cb.dataset.key);
      else dossSelectedKeys.delete(cb.dataset.key);
      updateDossSelectionUI();
    };
  });
  if(dossSelectionMode) updateDossSelectionUI();
}

function renderDossRdvSection(a){
  return `
    <div class="dossier-section-label">📅 Rendez-vous</div>
    <div class="item-row">
      <div class="item-main">
        <div class="title">${escapeHtml(a.clientName)} · ${escapeHtml(a.applianceType||'')}</div>
        <div class="meta">${fmtDate(a.date)}${a.time?(' à '+a.time):''} · 📍 ${escapeHtml(a.address||'—')} · 📞 ${escapeHtml(a.phone||'—')}<br>
        ${escapeHtml(a.issue||'')}</div>
      </div>
      <span class="badge ${statusBadgeClass(a.status)}">${a.status}</span>
    </div>
  `;
}

function renderDossIntervSection(iv){
  const { title } = dossierDeviceSummary(iv);
  return `
    <div class="dossier-section-label">🧾 Rapport</div>
    <div class="item-row">
      <div class="item-main" style="cursor:pointer;" onclick="openReportDetail('${iv.id}')">
        <div class="title">${escapeHtml(iv.clientName||'—')} · ${escapeHtml(title)}</div>
        <div class="meta">${fmtDate(iv.date)} · ${money(iv.amount)}</div>
      </div>
      <span class="badge ${statusBadgeClass(iv.status)}">${iv.status}</span>
      <span class="payment-pill ${iv.paymentReceived?'payment-pill-paid':'payment-pill-unpaid'}">${iv.paymentReceived?'✅ Payé':'❌ Impayé'}</span>
      <div class="item-actions">
        <button class="btn btn-ghost btn-small" onclick="window.location.href='planning.html?editReport=${iv.id}'">✏️ Modifier</button>
        <button class="btn btn-ghost btn-small" onclick="downloadReportPdf(state.interventions.find(x=>x.id==='${iv.id}'), state.settings.company)">📄 PDF</button>
        <button class="btn btn-danger btn-small" onclick="deleteDossInterv('${iv.id}')">🗑️ Supprimer</button>
      </div>
    </div>
  `;
}

function renderDossDevisSection(dv){
  return `
    <div class="dossier-section-label">📄 Devis</div>
    <div class="item-row">
      <div class="item-main" style="cursor:pointer;" onclick="window.location.href='planning.html?editDevis=${dv.id}'">
        <div class="title">${dv.devisNumber?`<span style="color:var(--cyan);">${escapeHtml(dv.devisNumber)}</span> — `:''}${escapeHtml(dv.clientName||'—')}</div>
        <div class="meta">${fmtDate(dv.issueDate)} · ${money(dv.totalTTC)} · expire le ${fmtDate(dv.expiryDate)}</div>
      </div>
      <span class="badge ${statusBadgeClass(dv.status)}">${dv.status}</span>
      <div class="item-actions">
        <button class="btn btn-ghost btn-small" onclick="window.location.href='planning.html?editDevis=${dv.id}'">✏️ Ouvrir</button>
        <button class="btn btn-ghost btn-small" onclick="downloadDevisPdf(state.devis.find(x=>x.id==='${dv.id}'), state.settings.company)">📄 PDF</button>
        <button class="btn btn-danger btn-small" onclick="deleteDossDevis('${dv.id}')">🗑️ Supprimer</button>
      </div>
    </div>
  `;
}

function renderDossDepositSection(dep){
  return `
    <div class="dossier-section-label">📥 Dépôt</div>
    <div class="item-row">
      <div class="item-main" style="cursor:pointer;" onclick="window.location.href='depots.html?openDeposit=${dep.id}'">
        <div class="title">${dep.depositNumber?`<span style="color:var(--cyan);">${escapeHtml(dep.depositNumber)}</span> — `:''}${escapeHtml(dep.clientName||'—')}</div>
        <div class="meta">${escapeHtml([dep.applianceType,dep.brand,dep.model].filter(Boolean).join(' — ')||'—')} · Déposé le ${fmtDate(dep.depositDate)}${dep.status==='Récupéré'?(' · Récupéré le '+fmtDate(dep.pickupDate)):''}</div>
      </div>
      <span class="badge ${dep.status==='Récupéré'?'badge-confirme':'badge-encours'}">${dep.status}</span>
      <div class="item-actions">
        <button class="btn btn-ghost btn-small" onclick="window.location.href='depots.html?openDeposit=${dep.id}'">✏️ Ouvrir</button>
        <button class="btn btn-ghost btn-small" onclick="downloadDepositPdf(state.deposits.find(x=>x.id==='${dep.id}'), state.settings.company)">📄 PDF</button>
        <button class="btn btn-danger btn-small" onclick="deleteDossDeposit('${dep.id}')">🗑️ Supprimer</button>
      </div>
    </div>
  `;
}

async function deleteDossDeposit(id){
  if(!confirm("Mettre ce dépôt à la corbeille ? Tu pourras le restaurer depuis la Corbeille.")) return;
  const backup = state.deposits;
  const dep = (state.deposits||[]).find(x=>x.id===id);
  state.deposits = (state.deposits||[]).filter(x=>x.id!==id);
  if(dep) moveToTrash(state, 'depot', (dep.depositNumber?dep.depositNumber+' — ':'')+(dep.clientName||''), dep);
  const ok = await saveState(state);
  if(!ok){ state.deposits = backup; state.trash.pop(); return; }
  renderDossGrid();
  drawDossList();
  showToast("Dépôt déplacé vers la corbeille.");
}

function openReportDetail(id){
  const iv = state.interventions.find(x=>x.id===id);
  if(!iv) return;
  const devices = (iv.devices && iv.devices.length) ? iv.devices : [iv];
  const subtotal = devices.reduce((s,d)=>s+(Number(d.amount)||0), 0);
  const modalRoot = document.getElementById('modalRoot');
  modalRoot.innerHTML = `
    <div class="modal-overlay" id="reportDetailOverlay">
      <div class="modal">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.2rem;">
          <h3 style="margin-bottom:0;">🧾 ${iv.dossierNumber ? escapeHtml(iv.dossierNumber) : 'Rapport'}</h3>
          <button id="reportDetailX" style="background:none;border:none;color:var(--text-light);font-size:1.4rem;cursor:pointer;line-height:1;">×</button>
        </div>

        <div style="display:flex;flex-direction:column;gap:.9rem;font-size:.92rem;">
          <div><span style="color:var(--text-light);font-size:.78rem;text-transform:uppercase;letter-spacing:.04em;">Client</span><br><strong>${escapeHtml(iv.clientName||'—')}</strong></div>
          <div><span style="color:var(--text-light);font-size:.78rem;text-transform:uppercase;letter-spacing:.04em;">Téléphone</span><br>${iv.phone ? `<a href="tel:${escapeHtml(iv.phone)}" style="color:var(--cyan);text-decoration:none;">📞 ${escapeHtml(iv.phone)}</a>` : '—'}</div>
          <div><span style="color:var(--text-light);font-size:.78rem;text-transform:uppercase;letter-spacing:.04em;">Adresse</span><br>${iv.address ? `<a href="${wazeAppUrl(fullAddress(iv))}" style="color:var(--cyan);text-decoration:none;">📍 ${escapeHtml(fullAddress(iv))}</a>` : '—'}</div>
          <div><span style="color:var(--text-light);font-size:.78rem;text-transform:uppercase;letter-spacing:.04em;">Date</span><br>${fmtDate(iv.date)}</div>
        </div>

        <div style="margin-top:1.2rem;border-top:1px solid var(--border);padding-top:1rem;">
          ${devices.length>1 ? `
            <select id="reportDetailDeviceSelector" style="margin-bottom:1rem;">
              ${devices.map((d,idx)=>`<option value="${idx}">Appareil ${idx+1}${d.applianceType?' — '+escapeHtml(d.applianceType):''}</option>`).join('')}
            </select>
          ` : ''}
          <div id="reportDetailDeviceBody"></div>
        </div>

        <div style="margin-top:1.2rem;background:rgba(0,180,216,.08);border:1px solid rgba(0,180,216,.3);border-radius:10px;padding:1rem 1.2rem;">
          ${iv.discount && Number(iv.discount)>0 ? `
            <div style="display:flex;justify-content:space-between;font-size:.88rem;color:var(--text-light);margin-bottom:.3rem;"><span>Sous-total</span><span>${money(subtotal)}</span></div>
            <div style="display:flex;justify-content:space-between;font-size:.88rem;color:var(--text-light);margin-bottom:.6rem;"><span>Remise</span><span>- ${money(iv.discount)}</span></div>
          ` : ''}
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-family:'Rajdhani',sans-serif;font-weight:700;text-transform:uppercase;font-size:1.05rem;">Total facturé</span>
            <span style="font-family:'Rajdhani',sans-serif;font-weight:700;font-size:1.4rem;color:var(--cyan);">${money(iv.amount||subtotal)}</span>
          </div>
        </div>

        <div style="display:flex;gap:.6rem;flex-wrap:wrap;margin-top:1rem;">
          <span class="badge ${statusBadgeClass(iv.status)}">${iv.status}</span>
          <span class="payment-pill ${iv.paymentReceived?'payment-pill-paid':'payment-pill-unpaid'}">${iv.paymentReceived?'✅ Payé':'❌ Impayé'}</span>
        </div>

        <div class="modal-footer">
          <button class="btn btn-ghost" id="reportDetailClose">Fermer</button>
          <button class="btn btn-ghost" onclick="downloadReportPdf(state.interventions.find(x=>x.id==='${iv.id}'), state.settings.company)">📄 PDF</button>
          <button class="btn btn-primary" style="width:auto" id="reportDetailEdit">✏️ Modifier</button>
        </div>
      </div>
    </div>
  `;

  function renderDeviceBody(idx){
    const d = devices[idx] || devices[0];
    const fields = [
      { label: 'N° de série', value: d.serialNumber },
      { label: 'Symptôme client', value: d.clientSymptom },
      { label: 'Diagnostic', value: d.diagnosis },
      { label: 'Réparation effectuée', value: d.workDone },
      { label: 'Pièces à commander', value: d.partsNeeded },
      { label: 'Résultat', value: deviceResultLabel(d) },
      { label: 'Commentaire assurance', value: d.insuranceComment },
    ];
    document.getElementById('reportDetailDeviceBody').innerHTML = `
      <div style="color:var(--cyan);font-family:'Rajdhani',sans-serif;font-weight:700;font-size:.9rem;text-transform:uppercase;letter-spacing:.03em;margin-bottom:.7rem;">Appareil ${(devices.indexOf(d)>-1?devices.indexOf(d):idx)+1}</div>
      <div style="font-size:1.05rem;font-weight:700;margin-bottom:1rem;">${escapeHtml([d.applianceType,d.brand,d.model].filter(Boolean).join(' — ')||'—')}</div>
      <div style="display:flex;flex-direction:column;gap:.8rem;">
        ${fields.filter(f=>f.value).map(f=>`
          <div style="background:rgba(255,255,255,.03);border:1px solid var(--border);border-left:3px solid var(--cyan);border-radius:8px;padding:.7rem .9rem;">
            <div style="color:var(--text-light);font-size:.72rem;text-transform:uppercase;letter-spacing:.05em;margin-bottom:.3rem;">${f.label}</div>
            <div style="font-size:.9rem;line-height:1.55;">${escapeHtml(f.value)}</div>
          </div>
        `).join('')}
        ${d.amount ? `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:.5rem .1rem 0;">
            <span style="color:var(--text-light);font-size:.85rem;">Montant de cet appareil</span>
            <strong style="font-size:1rem;">${money(d.amount)}</strong>
          </div>
        ` : ''}
      </div>
    `;
  }
  renderDeviceBody(0);
  const deviceSelectorEl = document.getElementById('reportDetailDeviceSelector');
  if(deviceSelectorEl){
    deviceSelectorEl.onchange = (e)=>renderDeviceBody(Number(e.target.value));
  }

  document.getElementById('reportDetailClose').onclick = closeModal;
  document.getElementById('reportDetailX').onclick = closeModal;
  document.getElementById('reportDetailEdit').onclick = ()=>{ window.location.href = 'planning.html?editReport='+iv.id; };
  // Le clic en dehors ne ferme plus la fiche — seul "Fermer" le fait.
}

async function deleteDossDevis(id){
  if(!confirm("Mettre ce devis à la corbeille ? Tu pourras le restaurer depuis la Corbeille.")) return;
  const backup = state.devis;
  const dv = state.devis.find(d=>d.id===id);
  state.devis = (state.devis||[]).filter(d=>d.id!==id);
  if(dv) moveToTrash(state, 'devis', (dv.devisNumber?dv.devisNumber+' — ':'')+(dv.clientName||''), dv);
  const ok = await saveState(state);
  if(!ok){ state.devis = backup; state.trash.pop(); return; }
  renderDossGrid();
  drawDossList();
  showToast("Devis déplacé vers la corbeille.");
}

async function deleteDossInterv(id){
  if(!confirm("Mettre ce rapport à la corbeille ? Tu pourras le restaurer depuis la Corbeille (les pièces ne seront recréditées qu'en cas de suppression définitive).")) return;
  const intervBackup = state.interventions;
  const interv = state.interventions.find(iv=>iv.id===id);
  state.interventions = state.interventions.filter(iv=>iv.id!==id);
  if(interv) moveToTrash(state, 'rapport', (interv.dossierNumber?interv.dossierNumber+' — ':'')+(interv.clientName||''), interv);
  const ok = await saveState(state);
  if(!ok){ state.interventions = intervBackup; state.trash.pop(); return; }
  renderDossGrid();
  drawDossList();
  showToast("Rapport déplacé vers la corbeille.");
}
