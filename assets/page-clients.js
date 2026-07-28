let state = null;
let clientsSearch = '';

(async function(){
  state = await requireAuth();
  if(!state) return;
  if(!state.clients) state.clients = [];
  if(!state.trash) state.trash = [];
  renderNavbar('clients', state);
  renderClients();
  startAutoRefresh(applyClientsRefresh, 30000);
})();

function applyClientsRefresh(newState){
  state = newState;
  if(!state.clients) state.clients = [];
  drawClientList();
}

function renderClients(){
  const main = document.getElementById('pageContent');
  main.innerHTML = `
    <div class="page-head">
      <h2>Clie<span>nts</span></h2>
      <button class="btn btn-primary" style="width:auto" id="newClientBtn">+ Ajouter un client</button>
    </div>
    <div class="filters">
      <input id="clientsSearchInput" placeholder="Rechercher un client (nom, téléphone, ville...)">
    </div>
    <div id="clientList"></div>
  `;
  document.getElementById('newClientBtn').onclick = ()=>openClientModal();
  document.getElementById('clientsSearchInput').oninput = (e)=>{ clientsSearch = e.target.value; drawClientList(); };
  drawClientList();
}

function drawClientList(){
  const el = document.getElementById('clientList');
  if(!el) return;
  const search = clientsSearch.toLowerCase();
  let list = buildClientDirectory();

  if(search){
    list = list.filter(c=>
      (c.clientName||'').toLowerCase().includes(search) ||
      (c.phone||'').toLowerCase().includes(search) ||
      (c.email||'').toLowerCase().includes(search) ||
      (c.city||'').toLowerCase().includes(search) ||
      c.dossierNumbers.some(d=>d.toLowerCase().includes(search))
    );
  }
  list.sort((a,b)=>(b.lastVisit||'').localeCompare(a.lastVisit||''));

  if(!list.length){
    el.innerHTML = `<div class="empty-state"><div class="mark">👤</div>Aucun client pour l'instant.</div>`;
    return;
  }

  el.innerHTML = list.map(c=>`
    <div class="item-row clientRow" data-key="${escapeHtml(c.key)}" style="cursor:pointer;">
      <div class="item-main">
        <div class="title">${escapeHtml(c.clientName||'—')} ${c.hasCompletedDossier ? `<span class="payment-pill payment-pill-paid">✅ Terminé</span>` : ''}</div>
        <div class="meta">
          ${c.phone ? `📞 ${escapeHtml(c.phone)}` : '📞 —'}
          ${c.email ? ` · ✉️ ${escapeHtml(c.email)}` : ''}
        </div>
      </div>
      <span style="color:var(--text-light);font-size:1.1rem;">›</span>
    </div>
  `).join('');

  document.querySelectorAll('.clientRow').forEach(row=>{
    row.onclick = ()=>openClientDetail(row.dataset.key);
  });
}

function openClientDetail(key){
  const c = buildClientDirectory().find(x=>x.key===key);
  if(!c) return;
  const modalRoot = document.getElementById('modalRoot');
  modalRoot.innerHTML = `
    <div class="modal-overlay" id="clientDetailOverlay">
      <div class="modal">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.2rem;gap:.6rem;">
          <h3 style="margin-bottom:0;">${escapeHtml(c.clientName||'—')} ${c.hasCompletedDossier ? `<span class="payment-pill payment-pill-paid" style="vertical-align:middle;">✅ Terminé</span>` : ''}</h3>
          <button id="clientDetailX" style="background:none;border:none;color:var(--text-light);font-size:1.4rem;cursor:pointer;line-height:1;">×</button>
        </div>

        <div style="display:flex;flex-direction:column;gap:.9rem;font-size:.92rem;">
          <div><span style="color:var(--text-light);font-size:.78rem;text-transform:uppercase;letter-spacing:.04em;">Téléphone</span><br>${c.phone ? `<a href="tel:${escapeHtml(c.phone)}" style="color:var(--cyan);text-decoration:none;">📞 ${escapeHtml(c.phone)}</a>` : '—'}</div>
          <div><span style="color:var(--text-light);font-size:.78rem;text-transform:uppercase;letter-spacing:.04em;">Email</span><br>${c.email ? `<a href="mailto:${escapeHtml(c.email)}" style="color:var(--cyan);text-decoration:none;">✉️ ${escapeHtml(c.email)}</a>` : '—'}</div>
          <div><span style="color:var(--text-light);font-size:.78rem;text-transform:uppercase;letter-spacing:.04em;">Adresse</span><br>${(c.address||c.city) ? `<a href="${wazeAppUrl(fullAddress(c))}" style="color:var(--cyan);text-decoration:none;">📍 ${escapeHtml(fullAddress(c)||'—')}</a>` : '—'}</div>
          <div><span style="color:var(--text-light);font-size:.78rem;text-transform:uppercase;letter-spacing:.04em;">Dossiers</span><br>${c.dossierNumbers.length
            ? c.dossierNumbers.map(d=>`<span style="color:var(--cyan);">${escapeHtml(d)}</span>`).join(', ') + (c.lastVisit ? ` · dernier passage le ${fmtDate(c.lastVisit)}` : '')
            : `<em style="color:var(--text-light);">Aucun dossier pour l'instant</em>`}</div>
          <div><span style="color:var(--text-light);font-size:.78rem;text-transform:uppercase;letter-spacing:.04em;">Commentaire</span><br>${c.comment ? escapeHtml(c.comment) : `<em style="color:var(--text-light);">Aucun commentaire</em>`}</div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-ghost" id="clientDetailClose">Fermer</button>
          ${c.manualId ? `<button class="btn btn-danger" id="clientDetailDelete">🗑️ Supprimer la fiche</button>` : ''}
          <button class="btn btn-primary" style="width:auto" id="clientDetailEdit">${c.manualId?'✏️ Modifier':'💬 Ajouter un commentaire'}</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('clientDetailClose').onclick = closeModal;
  document.getElementById('clientDetailX').onclick = closeModal;
  document.getElementById('clientDetailEdit').onclick = ()=>openClientModal(c.key);
  const deleteBtn = document.getElementById('clientDetailDelete');
  if(deleteBtn) deleteBtn.onclick = ()=>deleteManualClient(c.manualId);
}

function openClientModal(key){
  const directory = key ? buildClientDirectory().find(c=>c.key===key) : null;
  const c = directory || { firstName:'', lastName:'', phone:'', email:'', address:'', postalCode:'', city:'', comment:'', manualId:null };

  const modalRoot = document.getElementById('modalRoot');
  modalRoot.innerHTML = `
    <div class="modal-overlay" id="clientModalOverlay">
      <div class="modal">
        <h3>${c.manualId ? '✏️ Modifier le client' : (directory ? '💬 Ajouter un commentaire' : '+ Nouveau client')}</h3>
        <div class="modal-row">
          <div class="field"><label>Prénom</label><input id="cmFirstName" value="${escapeHtml(c.firstName||'')}"></div>
          <div class="field"><label>Nom</label><input id="cmLastName" value="${escapeHtml(c.lastName||'')}"></div>
        </div>
        <div class="modal-row">
          <div class="field"><label>Téléphone</label><input id="cmPhone" value="${escapeHtml(c.phone||'')}"></div>
          <div class="field"><label>Email</label><input id="cmEmail" value="${escapeHtml(c.email||'')}"></div>
        </div>
        <div class="field"><label>Adresse</label><input id="cmAddress" value="${escapeHtml(c.address||'')}"></div>
        <div class="modal-row">
          <div class="field"><label>Code postal</label><input id="cmPostalCode" value="${escapeHtml(c.postalCode||'')}"></div>
          <div class="field"><label>Ville</label><input id="cmCity" value="${escapeHtml(c.city||'')}"></div>
        </div>
        <div class="field"><label>Commentaire</label><textarea id="cmComment" rows="3" placeholder="Ex : préfère être appelé le matin, a un chien, code portail 1234...">${escapeHtml(c.comment||'')}</textarea></div>

        ${directory && directory.dossierNumbers.length ? `
          <p style="font-size:.82rem;color:var(--text-light);margin-top:.8rem;">
            Dossiers existants : ${directory.dossierNumbers.map(d=>escapeHtml(d)).join(', ')} — ces coordonnées mettent à jour l'affichage mais ne modifient pas l'historique des dossiers.
          </p>
        ` : ''}

        <div class="modal-footer">
          <button class="btn btn-ghost" id="clientModalClose">Annuler</button>
          <button class="btn btn-primary" style="width:auto" id="clientModalSave">Enregistrer</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('clientModalClose').onclick = closeModal;
  document.getElementById('clientModalSave').onclick = async ()=>{
    const firstName = document.getElementById('cmFirstName').value.trim();
    const lastName = document.getElementById('cmLastName').value.trim();
    if(!firstName && !lastName){ showToast("Merci d'indiquer au moins un nom."); return; }

    if(!state.clients) state.clients = [];
    let mc = c.manualId ? state.clients.find(x=>x.id===c.manualId) : null;
    if(!mc){
      mc = { id: uid(), createdAt: todayISO() };
      state.clients.push(mc);
    }
    mc.firstName = firstName;
    mc.lastName = lastName;
    mc.phone = document.getElementById('cmPhone').value.trim();
    mc.email = document.getElementById('cmEmail').value.trim();
    mc.address = document.getElementById('cmAddress').value.trim();
    mc.postalCode = document.getElementById('cmPostalCode').value.trim();
    mc.city = document.getElementById('cmCity').value.trim();
    mc.comment = document.getElementById('cmComment').value.trim();

    const ok = await saveState(state);
    if(!ok) return;
    closeModal();
    drawClientList();
    showToast("Client enregistré.");
  };
}

async function deleteManualClient(manualId){
  if(!confirm("Mettre cette fiche client à la corbeille ? Si ce client a déjà des dossiers, il restera visible dans la liste (issu de son historique) le temps que la fiche soit dans la corbeille. Tu pourras la restaurer depuis la Corbeille.")) return;
  const backup = state.clients;
  const mc = state.clients.find(x=>x.id===manualId);
  state.clients = (state.clients||[]).filter(x=>x.id!==manualId);
  if(mc) moveToTrash(state, 'client', ((mc.firstName||'')+' '+(mc.lastName||'')).trim()||'—', mc);
  const ok = await saveState(state);
  if(!ok){ state.clients = backup; state.trash.pop(); return; }
  closeModal();
  drawClientList();
  showToast("Fiche client déplacée vers la corbeille.");
}
