let state = null;
let trashFilterType = '';
let trashFilterSearch = '';
let trashSelectionMode = false;
let trashSelectedIds = new Set();

(async function(){
  state = await requireAuth();
  if(!state) return;
  if(!state.trash) state.trash = [];
  renderNavbar('corbeille', state);
  renderCorbeille();
  startAutoRefresh(applyTrashRefresh, 30000);
})();

function applyTrashRefresh(newState){
  state = newState;
  if(!state.trash) state.trash = [];
  drawTrashList();
}

function renderCorbeille(){
  const main = document.getElementById('pageContent');
  main.innerHTML = `
    <div class="page-head">
      <h2>Corb<span>eille</span></h2>
      <div style="display:flex;gap:.6rem;flex-wrap:wrap;">
        <button class="btn btn-ghost" id="trashSelectModeBtn">☑️ Sélectionner plusieurs</button>
        <button class="btn btn-danger" id="emptyTrashBtn">🗑️ Vider la corbeille</button>
      </div>
    </div>
    <p style="font-size:.85rem;color:var(--text-light);margin-bottom:1rem;">
      Toute suppression dans l'appli atterrit ici — rien n'est perdu tant que ce n'est pas supprimé définitivement depuis cette page. Pas de purge automatique : c'est toi qui décides.
    </p>
    <div id="trashSelectionBar" style="display:none;align-items:center;gap:.7rem;flex-wrap:wrap;background:rgba(0,180,216,.08);border:1px solid rgba(0,180,216,.3);border-radius:10px;padding:.7rem 1rem;margin-bottom:1rem;">
      <strong id="trashSelectionCount" style="font-family:'Rajdhani',sans-serif;color:var(--cyan);"></strong>
      <button class="btn btn-ghost btn-small" id="trashSelectAllBtn">Tout sélectionner (visible)</button>
      <button class="btn btn-danger btn-small" id="trashDeleteSelectedBtn">🗑️ Supprimer la sélection</button>
      <button class="btn btn-ghost btn-small" id="trashCancelSelectBtn">Annuler</button>
    </div>
    <div class="filters">
      <select id="trashFilterType">
        <option value="">Tous les types</option>
        <option value="rapport">🧾 Rapports</option>
        <option value="devis">📄 Devis</option>
        <option value="depot">📥 Dépôts</option>
        <option value="client">👤 Clients</option>
        <option value="rdv">📅 RDV</option>
        <option value="stock">📦 Stock</option>
      </select>
      <input id="trashFilterSearch" placeholder="Rechercher...">
    </div>
    <div id="trashList"></div>
  `;
  document.getElementById('trashSelectModeBtn').onclick = toggleTrashSelectionMode;
  document.getElementById('emptyTrashBtn').onclick = emptyTrash;
  document.getElementById('trashSelectAllBtn').onclick = selectAllVisibleTrash;
  document.getElementById('trashDeleteSelectedBtn').onclick = deleteSelectedTrash;
  document.getElementById('trashCancelSelectBtn').onclick = ()=>{ trashSelectionMode=false; trashSelectedIds.clear(); updateTrashSelectionUI(); drawTrashList(); };
  document.getElementById('trashFilterType').onchange = (e)=>{ trashFilterType = e.target.value; drawTrashList(); };
  document.getElementById('trashFilterSearch').oninput = (e)=>{ trashFilterSearch = e.target.value; drawTrashList(); };
  drawTrashList();
}

function toggleTrashSelectionMode(){
  trashSelectionMode = !trashSelectionMode;
  if(!trashSelectionMode) trashSelectedIds.clear();
  updateTrashSelectionUI();
  drawTrashList();
}
function updateTrashSelectionUI(){
  document.getElementById('trashSelectionBar').style.display = trashSelectionMode ? 'flex' : 'none';
  document.getElementById('trashSelectModeBtn').textContent = trashSelectionMode ? '✖️ Quitter la sélection' : '☑️ Sélectionner plusieurs';
  document.getElementById('trashSelectionCount').textContent = trashSelectedIds.size+' élément(s) sélectionné(s)';
}
function selectAllVisibleTrash(){
  document.querySelectorAll('.trashSelectCheckbox').forEach(cb=>{ trashSelectedIds.add(cb.dataset.id); cb.checked = true; });
  updateTrashSelectionUI();
}

function drawTrashList(){
  const el = document.getElementById('trashList');
  if(!el) return;
  let list = (state.trash||[]).slice();
  if(trashFilterType) list = list.filter(x=>x.type===trashFilterType);
  if(trashFilterSearch){
    const s = trashFilterSearch.toLowerCase();
    list = list.filter(x=>(x.label||'').toLowerCase().includes(s));
  }
  list.sort((a,b)=>(b.deletedAt||'').localeCompare(a.deletedAt||''));

  if(!list.length){
    el.innerHTML = `<div class="empty-state"><div class="mark">🗑️</div>La corbeille est vide.</div>`;
    return;
  }

  el.innerHTML = list.map(x=>`
    <div style="display:flex;align-items:flex-start;gap:.6rem;">
      ${trashSelectionMode ? `<input type="checkbox" class="trashSelectCheckbox" data-id="${escapeHtml(x.id)}" style="margin-top:1.1rem;width:18px;height:18px;flex:0 0 auto;">` : ''}
      <div class="item-row" style="flex:1;min-width:0;">
        <div class="item-main">
          <div class="title">${TRASH_TYPE_LABELS[x.type]||x.type} — ${escapeHtml(x.label||'—')}</div>
          <div class="meta">Supprimé le ${fmtDateTime(x.deletedAt)}</div>
        </div>
        <div class="item-actions">
          <button class="btn btn-ghost btn-small trashRestoreBtn" data-id="${escapeHtml(x.id)}">♻️ Restaurer</button>
          <button class="btn btn-danger btn-small trashPurgeBtn" data-id="${escapeHtml(x.id)}">🗑️ Supprimer définitivement</button>
        </div>
      </div>
    </div>
  `).join('');

  document.querySelectorAll('.trashSelectCheckbox').forEach(cb=>{
    cb.onchange = ()=>{
      if(cb.checked) trashSelectedIds.add(cb.dataset.id);
      else trashSelectedIds.delete(cb.dataset.id);
      updateTrashSelectionUI();
    };
  });
  document.querySelectorAll('.trashRestoreBtn').forEach(btn=>{ btn.onclick = ()=>restoreTrashItem(btn.dataset.id); });
  document.querySelectorAll('.trashPurgeBtn').forEach(btn=>{ btn.onclick = ()=>purgeTrashItem(btn.dataset.id, true); });
  if(trashSelectionMode) updateTrashSelectionUI();
}

// Restaure un élément : aucun effet de bord n'a jamais été appliqué à la mise à la
// corbeille (stock non recrédité, photos non supprimées), donc la restauration est
// toujours sans risque, quel que soit le type.
async function restoreTrashItem(id){
  const entry = state.trash.find(x=>x.id===id);
  if(!entry) return;
  const backup = JSON.parse(JSON.stringify(state.trash));
  const arrayByType = { rapport:'interventions', devis:'devis', depot:'deposits', client:'clients', rdv:'appointments', stock:'stock' };
  const target = arrayByType[entry.type];
  if(!target) return;
  if(!state[target]) state[target] = [];
  state[target].push(entry.data);
  state.trash = state.trash.filter(x=>x.id!==id);
  const ok = await saveState(state);
  if(!ok){ state.trash = backup; state[target] = state[target].filter(d=>d!==entry.data); return; }
  renderNavbar('corbeille', state);
  drawTrashList();
  showToast("Élément restauré.");
}

// Applique les effets de bord propres à chaque type UNIQUEMENT à la suppression
// définitive (recréditer le stock, supprimer les photos, libérer un créneau site).
function applyPurgeSideEffects(entry){
  if(entry.type === 'rapport'){
    (entry.data.devices||[]).forEach(d=>{
      (d.partsUsed||[]).forEach(p=>{
        const s = state.stock.find(x=>x.id===p.stockId);
        if(s) s.qty = Number(s.qty) + Number(p.qty);
      });
      (d.photos||[]).forEach(photo=>deletePhotoById(photo.id));
      // La photo de plaque signalétique n'est supprimée du stockage que si elle a
      // été ajoutée directement depuis le rapport ; si elle vient du RDV (photo
      // partagée), la supprimer casserait aussi sa galerie côté RDV.
      if(d.plateePhoto && d.plateePhotoSource === 'upload') deletePhotoById(d.plateePhoto.id);
    });
  } else if(entry.type === 'depot'){
    (entry.data.photos||[]).forEach(p=>deletePhotoById(p.id));
  } else if(entry.type === 'rdv'){
    releaseBookingSlot(entry.data.bookingId);
  }
}

async function purgeTrashItem(id, confirmFirst){
  const entry = state.trash.find(x=>x.id===id);
  if(!entry) return;
  if(confirmFirst && !confirm("Supprimer définitivement cet élément ? Cette action est irréversible.")) return;
  const backup = JSON.parse(JSON.stringify(state.trash));
  const stockBackup = JSON.parse(JSON.stringify(state.stock));
  applyPurgeSideEffects(entry);
  state.trash = state.trash.filter(x=>x.id!==id);
  const ok = await saveState(state);
  if(!ok){ state.trash = backup; state.stock = stockBackup; return; }
  renderNavbar('corbeille', state);
  drawTrashList();
  showToast("Élément supprimé définitivement.");
}

async function deleteSelectedTrash(){
  if(!trashSelectedIds.size){ showToast("Aucun élément sélectionné."); return; }
  if(!confirm("Supprimer définitivement les "+trashSelectedIds.size+" élément(s) sélectionné(s) ? Cette action est irréversible.")) return;
  const backup = JSON.parse(JSON.stringify(state.trash));
  const stockBackup = JSON.parse(JSON.stringify(state.stock));
  const entries = state.trash.filter(x=>trashSelectedIds.has(x.id));
  entries.forEach(applyPurgeSideEffects);
  state.trash = state.trash.filter(x=>!trashSelectedIds.has(x.id));
  const ok = await saveState(state);
  if(!ok){ state.trash = backup; state.stock = stockBackup; return; }
  const count = entries.length;
  trashSelectedIds.clear();
  trashSelectionMode = false;
  updateTrashSelectionUI();
  renderNavbar('corbeille', state);
  drawTrashList();
  showToast(count+" élément(s) supprimé(s) définitivement.");
}

async function emptyTrash(){
  if(!state.trash.length){ showToast("La corbeille est déjà vide."); return; }
  if(!confirm("Vider entièrement la corbeille (" + state.trash.length + " élément(s)) ? Cette action est irréversible.")) return;
  const backup = JSON.parse(JSON.stringify(state.trash));
  const stockBackup = JSON.parse(JSON.stringify(state.stock));
  state.trash.forEach(applyPurgeSideEffects);
  state.trash = [];
  const ok = await saveState(state);
  if(!ok){ state.trash = backup; state.stock = stockBackup; return; }
  renderNavbar('corbeille', state);
  drawTrashList();
  showToast("Corbeille vidée.");
}
