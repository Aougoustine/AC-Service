let state = null;
let depFilterStatus = '';
let depFilterSearch = '';

(async function(){
  state = await requireAuth();
  if(!state) return;
  if(!state.deposits) state.deposits = [];
  if(!state.trash) state.trash = [];
  renderNavbar('depots', state);
  renderDepots();
  startAutoRefresh(applyDepotsRefresh, 30000);

  // Arrivée depuis le bouton "Créer un dépôt" d'une fiche RDV (Planning).
  const params = new URLSearchParams(window.location.search);
  const fromRdv = params.get('fromRdv');
  if(fromRdv){
    const a = state.appointments.find(x=>x.id===fromRdv);
    if(a) openDepositForm(a);
    // Nettoie l'URL pour ne pas rouvrir le formulaire à chaque rafraîchissement.
    window.history.replaceState({}, '', 'depots.html');
  }

  // Arrivée depuis Dossiers ("Ouvrir" sur la section Dépôt) : ouvre directement la
  // fiche détail du dépôt concerné.
  const openDepositId = params.get('openDeposit');
  if(openDepositId){
    openDepositDetail(openDepositId);
    window.history.replaceState({}, '', 'depots.html');
  }

  // Arrivée depuis un rapport terminé ("✅ Valider la remise") : ouvre directement
  // le formulaire de restitution du dépôt lié, sans étape intermédiaire.
  const openPickupId = params.get('openPickup');
  if(openPickupId){
    openPickupForm(openPickupId);
    window.history.replaceState({}, '', 'depots.html');
  }
})();

function applyDepotsRefresh(newState){
  state = newState;
  if(!state.deposits) state.deposits = [];
  drawDepRequestsList();
  drawDepotList();
}

function renderDepots(){
  const main = document.getElementById('pageContent');
  main.innerHTML = `
    <div class="page-head">
      <h2>Dép<span>ôts</span></h2>
      <button class="btn btn-primary" style="width:auto" id="newDepositBtn">+ Nouveau dépôt</button>
    </div>

    <div class="section-block" id="depRequestsBlock">
      <h3>📋 Demandes de dépôt</h3>
      <p style="font-size:.85rem;color:var(--text-light);margin-bottom:1rem;">
        Ces demandes n'apparaissent pas dans Planning — appelle le client pour convenir d'un jour, puis fais son devis et son bon de dépôt directement ici.
      </p>
      <div id="depRequestsList"></div>
    </div>

    <p style="font-size:.85rem;color:var(--text-light);margin-bottom:1rem;">
      Chaque dépôt nécessite la signature du client sur place pour être enregistré — c'est ce qui fait sa valeur de preuve en cas de litige sur l'état de l'appareil.
    </p>
    <div class="filters">
      <select id="depFilterStatus">
        <option value="">Tous les statuts</option>
        <option value="Déposé">Déposé</option>
        <option value="Récupéré">Récupéré</option>
      </select>
      <input id="depFilterSearch" placeholder="Rechercher un client...">
    </div>
    <div id="depotList"></div>
  `;
  document.getElementById('newDepositBtn').onclick = ()=>openDepositForm();
  document.getElementById('depFilterStatus').onchange = (e)=>{ depFilterStatus = e.target.value; drawDepotList(); };
  document.getElementById('depFilterSearch').oninput = (e)=>{ depFilterSearch = e.target.value; drawDepotList(); };
  drawDepRequestsList();
  drawDepotList();
}

// Une "demande de dépôt" est un RDV comme un autre en coulisses (requestType:'depot'),
// mais jamais affiché dans Planning. Elle reste dans cette liste tant qu'aucun bon de
// dépôt n'a été créé pour elle ; une fois le bon de dépôt créé, elle bascule
// naturellement dans la liste des dépôts ci-dessous.
function drawDepRequestsList(){
  const block = document.getElementById('depRequestsBlock');
  const el = document.getElementById('depRequestsList');
  if(!block || !el) return;

  const depositedRdvIds = new Set((state.deposits||[]).map(d=>d.linkedRdvId).filter(Boolean));
  const requests = state.appointments.filter(a=>a.requestType==='depot' && !depositedRdvIds.has(a.id));

  if(!requests.length){
    el.innerHTML = `<div class="empty-state"><div class="mark">📥</div>Aucune demande de dépôt pour l'instant.</div>`;
    return;
  }

  el.innerHTML = requests.map(a=>{
    const linkedDevis = (state.devis||[]).filter(dv=>dv.linkedRdvId===a.id);
    const hasAccepted = linkedDevis.some(dv=>dv.status==='Accepté');
    const devisBadges = linkedDevis.map(dv=>{
      const icon = dv.status==='Accepté' ? '✅' : dv.status==='Refusé' ? '❌' : '⏳';
      return `<span style="font-size:.78rem;margin-right:.5rem;cursor:pointer;" class="depReqDevisLink" data-id="${dv.id}" title="Ouvrir ce devis">${icon} ${escapeHtml(dv.devisNumber||'')}</span>`;
    }).join('');
    const existingReport = state.interventions.find(iv=>iv.linkedRdvId===a.id);
    const reportBtn = existingReport
      ? `<button class="btn btn-ghost btn-small depReqReport" data-id="${existingReport.id}" data-mode="edit">✏️ Modifier le rapport</button>`
      : `<button class="btn btn-ghost btn-small depReqReport" data-id="${a.id}" data-mode="create">📝 Créer le rapport</button>`;
    return `
      <div class="item-row" data-id="${a.id}">
        <div class="item-main">
          <div class="title">${a.dossierNumber?`<span style="color:var(--cyan);">${escapeHtml(a.dossierNumber)}</span> — `:''}${escapeHtml(a.clientName||'—')} <span class="badge ${statusBadgeClass(a.status)}">${escapeHtml(a.status||'À faire')}</span></div>
          <div class="meta">${escapeHtml(a.phone||'—')} · ${escapeHtml([a.applianceType,a.brand,a.model].filter(Boolean).join(' — ')||'—')}</div>
          ${a.issue ? `<div class="meta" style="font-style:italic;">${escapeHtml(a.issue)}</div>` : ''}
          ${devisBadges ? `<div style="margin-top:.4rem;">${devisBadges}</div>` : ''}
        </div>
        <div class="item-actions">
          <button class="btn btn-ghost btn-small depReqCreateDevis" data-id="${a.id}">📋 ${linkedDevis.length?'Nouveau devis':'Créer le devis'}</button>
          ${hasAccepted ? `<button class="btn btn-primary btn-small depReqCreateDeposit" data-id="${a.id}">📥 Créer le bon de dépôt</button>` : ''}
          ${reportBtn}
          ${a.status!=='Annulé' ? `<button class="btn btn-danger btn-small depReqCancel" data-id="${a.id}">❌ Annuler</button>` : ''}
          <button class="btn btn-danger btn-small depReqDelete" data-id="${a.id}">🗑️ Supprimer</button>
        </div>
      </div>
    `;
  }).join('');

  el.querySelectorAll('.depReqCreateDevis').forEach(btn=>{
    btn.onclick = ()=>{ window.location.href = 'planning.html?createDevisForRdv='+btn.dataset.id; };
  });
  el.querySelectorAll('.depReqCreateDeposit').forEach(btn=>{
    btn.onclick = ()=>{ openDepositForm(state.appointments.find(a=>a.id===btn.dataset.id)); };
  });
  el.querySelectorAll('.depReqReport').forEach(btn=>{
    btn.onclick = ()=>{
      if(btn.dataset.mode==='edit'){ window.location.href = 'planning.html?editReport='+btn.dataset.id; }
      else { window.location.href = 'planning.html?newReportForRdv='+btn.dataset.id; }
    };
  });
  el.querySelectorAll('.depReqCancel').forEach(btn=>{
    btn.onclick = ()=>cancelDepositRequest(btn.dataset.id);
  });
  el.querySelectorAll('.depReqDevisLink').forEach(span=>{
    span.onclick = ()=>{ window.location.href = 'planning.html?editDevis='+span.dataset.id; };
  });
  el.querySelectorAll('.depReqDelete').forEach(btn=>{
    btn.onclick = ()=>deleteDepositRequest(btn.dataset.id);
  });
}

async function cancelDepositRequest(id){
  const a = state.appointments.find(x=>x.id===id);
  if(!a) return;
  if(!confirm("Annuler cette demande de dépôt ? Elle restera visible avec le statut \"Annulé\".")) return;
  const backup = a.status;
  a.status = 'Annulé';
  const ok = await saveState(state);
  if(!ok){ a.status = backup; return; }
  renderNavbar('depots', state);
  drawDepRequestsList();
  showToast("Demande de dépôt annulée.");
}

async function deleteDepositRequest(id){
  if(!confirm("Mettre cette demande de dépôt à la corbeille ? Tu pourras la restaurer depuis la Corbeille.")) return;
  const backup = state.appointments;
  const a = state.appointments.find(x=>x.id===id);
  state.appointments = state.appointments.filter(x=>x.id!==id);
  if(a) moveToTrash(state, 'rdv', (a.dossierNumber?a.dossierNumber+' — ':'')+(a.clientName||''), a);
  const ok = await saveState(state);
  if(!ok){ state.appointments = backup; state.trash.pop(); return; }
  renderNavbar('depots', state);
  drawDepRequestsList();
  showToast("Demande déplacée vers la corbeille.");
}

function drawDepotList(){
  const el = document.getElementById('depotList');
  if(!el) return;
  let list = (state.deposits||[]).slice();
  if(depFilterStatus) list = list.filter(d=>d.status===depFilterStatus);
  if(depFilterSearch){
    const s = depFilterSearch.toLowerCase();
    list = list.filter(d=>(d.clientName||'').toLowerCase().includes(s));
  }
  list.sort((a,b)=>(b.depositDate||'').localeCompare(a.depositDate||''));

  if(!list.length){
    el.innerHTML = `<div class="empty-state"><div class="mark">📥</div>Aucun dépôt pour l'instant.</div>`;
    return;
  }

  el.innerHTML = list.map(d=>`
    <div class="item-row">
      <div class="item-main" style="cursor:pointer;" onclick="openDepositDetail('${d.id}')">
        <div class="title">${d.depositNumber?`<span style="color:var(--cyan);">${escapeHtml(d.depositNumber)}</span> — `:''}${escapeHtml(d.clientName||'—')}</div>
        <div class="meta">
          <div>${escapeHtml([d.applianceType,d.brand,d.model].filter(Boolean).join(' — ')||'—')}</div>
          <div>📅 Déposé le ${fmtDate(d.depositDate)}${d.status==='Récupéré'?(' · Récupéré le '+fmtDate(d.pickupDate)):''}</div>
        </div>
      </div>
      <span class="badge ${d.status==='Récupéré'?'badge-confirme':'badge-encours'}">${d.status}</span>
      <div class="item-actions">
        <button class="btn btn-ghost btn-small" onclick="downloadDepositPdf(state.deposits.find(x=>x.id==='${d.id}'), state.settings.company)">📄 PDF</button>
        ${d.status!=='Récupéré' ? `<button class="btn btn-ghost btn-small" onclick="openPickupForm('${d.id}')">✅ Marquer récupéré</button>` : ''}
        <button class="btn btn-danger btn-small" onclick="deleteDeposit('${d.id}')">🗑️ Supprimer</button>
      </div>
    </div>
  `).join('');
}

/* ── Formulaire de création d'un dépôt ── */
function openDepositForm(linkedRdv){
  const seed = {
    firstName: linkedRdv?.firstName||'', lastName: linkedRdv?.lastName||'',
    phone: linkedRdv?.phone||'', email: linkedRdv?.email||'',
    address: linkedRdv?.address||'', postalCode: linkedRdv?.postalCode||'', city: linkedRdv?.city||'',
    applianceType: linkedRdv?.applianceType||(state.settings.applianceTypes[0]||''),
    brand: linkedRdv?.brand||'', model: linkedRdv?.model||'',
    reportedIssue: linkedRdv?.issue||''
  };
  let photos = [];
  let signatureDataUrl = null;

  const modalRoot = document.getElementById('modalRoot');
  modalRoot.innerHTML = `
    <div class="modal-overlay" id="depositFormOverlay">
      <div class="modal">
        <h3>+ Nouveau dépôt</h3>
        ${linkedRdv ? `<p style="font-size:.82rem;color:var(--text-light);margin-bottom:1rem;">Pré-rempli depuis le RDV ${linkedRdv.dossierNumber?escapeHtml(linkedRdv.dossierNumber):''} — ${escapeHtml(linkedRdv.clientName||'')}</p>` : `
          <div class="field" style="position:relative;">
            <label>Reprendre un client existant (optionnel)</label>
            <input id="depClientSearch" placeholder="Cliquez pour voir vos clients, ou tapez un nom..." autocomplete="off">
            <div id="depClientSearchResults" style="display:none;position:absolute;z-index:60;background:#02132f;border:1px solid var(--border);border-radius:8px;max-height:230px;overflow-y:auto;width:100%;margin-top:.2rem;box-shadow:0 12px 26px rgba(0,0,0,.5);"></div>
          </div>
        `}

        <div class="modal-row">
          <div class="field"><label>Prénom</label><input id="depFirstName" value="${escapeHtml(seed.firstName)}"></div>
          <div class="field"><label>Nom</label><input id="depLastName" value="${escapeHtml(seed.lastName)}"></div>
        </div>
        <div class="modal-row">
          <div class="field"><label>Téléphone</label><input id="depPhone" value="${escapeHtml(seed.phone)}"></div>
          <div class="field"><label>Email</label><input id="depEmail" value="${escapeHtml(seed.email)}"></div>
        </div>
        <div class="field"><label>Adresse</label><input id="depAddress" value="${escapeHtml(seed.address)}"></div>
        <div class="modal-row">
          <div class="field"><label>Code postal</label><input id="depPostalCode" value="${escapeHtml(seed.postalCode)}"></div>
          <div class="field"><label>Ville</label><input id="depCity" value="${escapeHtml(seed.city)}"></div>
        </div>
        <div class="modal-row">
          <div class="field"><label>Type d'appareil</label>
            <select id="depApplianceType">${state.settings.applianceTypes.map(t=>`<option ${t===seed.applianceType?'selected':''}>${t}</option>`).join('')}</select>
          </div>
          <div class="field"><label>Marque</label><input id="depBrand" value="${escapeHtml(seed.brand)}"></div>
        </div>
        <div class="modal-row">
          <div class="field"><label>Modèle</label><input id="depModel" value="${escapeHtml(seed.model)}"></div>
          <div class="field"><label>N° de série</label><input id="depSerialNumber"></div>
        </div>
        <div class="field"><label>Panne déclarée par le client</label><textarea id="depReportedIssue" rows="2">${escapeHtml(seed.reportedIssue)}</textarea></div>
        <div class="field"><label>État constaté au dépôt</label>
          <textarea id="depConditionNotes" rows="3" placeholder="Ex : légère rayure sur le dessus, façade propre, ne s'allume pas..."></textarea>
        </div>
        <div class="field"><label>Accessoires laissés</label><input id="depAccessoriesLeft" placeholder="Ex : câble secteur, télécommande, filtre..."></div>
        <div class="field"><label>Photos de l'état au dépôt</label>
          <div style="display:flex;gap:.6rem;flex-wrap:wrap;margin-bottom:.6rem;">
            <label class="btn btn-ghost btn-small" style="cursor:pointer;flex:1;text-align:center;">📷 Prendre une photo<input type="file" accept="image/*" capture="environment" id="depPhotoCamera" style="display:none;"></label>
            <label class="btn btn-ghost btn-small" style="cursor:pointer;flex:1;text-align:center;">🖼️ Depuis la galerie<input type="file" accept="image/*" multiple id="depPhotoGalleryInput" style="display:none;"></label>
          </div>
          <div id="depPhotoGallery" style="display:flex;flex-wrap:wrap;gap:.6rem;"><span style="color:var(--text-light);font-size:.82rem;">Aucune photo ajoutée.</span></div>
        </div>

        ${state.settings.company.storagePolicy ? `<p style="font-size:.78rem;color:var(--text-light);font-style:italic;margin-top:.8rem;">${escapeHtml(state.settings.company.storagePolicy)}</p>` : ''}

        <div style="margin-top:1.2rem;padding:.9rem;border:1px solid var(--border);border-radius:10px;display:flex;align-items:center;justify-content:space-between;gap:.8rem;flex-wrap:wrap;">
          <span style="font-size:.88rem;">La signature du client confirme qu'il est d'accord avec l'état et les accessoires notés ci-dessus.</span>
          <div style="display:flex;align-items:center;gap:.6rem;">
            <span id="depSigSignedPill" class="payment-pill payment-pill-paid" style="display:none;">✅ Signé</span>
            <button class="btn btn-ghost btn-small" id="depSigBtn" style="white-space:nowrap;">✍️ Recueillir la signature</button>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-primary" style="width:auto" id="depFormSave">Fermer</button>
        </div>
      </div>
    </div>
  `;

  if(document.getElementById('depClientSearch')){
    wireClientSearchInput('depClientSearch', 'depClientSearchResults', (picked)=>{
      document.getElementById('depFirstName').value = picked.firstName||'';
      document.getElementById('depLastName').value = picked.lastName||'';
      document.getElementById('depPhone').value = picked.phone||'';
      document.getElementById('depEmail').value = picked.email||'';
      document.getElementById('depAddress').value = picked.address||'';
      document.getElementById('depPostalCode').value = picked.postalCode||'';
      document.getElementById('depCity').value = picked.city||'';
    });
  }

  function renderDepPhotoGallery(){
    const gallery = document.getElementById('depPhotoGallery');
    if(!photos.length){
      gallery.innerHTML = '<span style="color:var(--text-light);font-size:.82rem;">Aucune photo ajoutée.</span>';
      return;
    }
    gallery.innerHTML = photos.map(p=>`
      <div style="position:relative;width:84px;height:84px;border-radius:8px;overflow:hidden;border:1px solid var(--border);background:rgba(255,255,255,.04);display:flex;align-items:center;justify-content:center;" data-photo-id="${p.id}">
        ${p.uploading ? '<span style="font-size:.68rem;color:var(--text-light);">Envoi…</span>' :
          (p.dataUrl ? `<img src="${p.dataUrl}" style="width:100%;height:100%;object-fit:cover;">` : '<span style="font-size:.68rem;color:var(--text-light);">…</span>')}
        ${!p.uploading ? `<button type="button" onclick="removeDepFormPhoto('${p.id}')" style="position:absolute;top:2px;right:2px;background:rgba(0,0,0,.6);border:none;color:#fff;border-radius:50%;width:20px;height:20px;font-size:.7rem;cursor:pointer;line-height:1;">✕</button>` : ''}
      </div>
    `).join('');
  }

  async function handleDepPhotoFiles(fileList){
    const files = Array.from(fileList || []);
    for(const file of files){
      if(!file.type.startsWith('image/')) continue;
      const placeholderId = 'tmp-'+uid();
      photos.push({ id: placeholderId, name: file.name, uploading: true });
      renderDepPhotoGallery();
      try{
        const dataUrl = await compressImageFile(file);
        const uploadedId = await uploadPhoto(dataUrl);
        const entry = photos.find(p=>p.id===placeholderId);
        if(entry){ entry.id = uploadedId; entry.uploading = false; entry.dataUrl = dataUrl; }
        renderDepPhotoGallery();
      }catch(err){
        photos = photos.filter(p=>p.id!==placeholderId);
        renderDepPhotoGallery();
        showToast("Échec de l'envoi d'une photo : "+err.message);
      }
    }
  }
  document.getElementById('depPhotoCamera').onchange = (e)=>{
    handleDepPhotoFiles(e.target.files);
    e.target.value = ''; // permet de reprendre une autre photo juste après
  };
  document.getElementById('depPhotoGalleryInput').onchange = (e)=>{
    handleDepPhotoFiles(e.target.files);
    e.target.value = '';
  };
  window.removeDepFormPhoto = function(photoId){
    photos = photos.filter(p=>p.id!==photoId);
    deletePhotoById(photoId);
    renderDepPhotoGallery();
  };

  document.getElementById('depSigBtn').onclick = ()=>{
    openSignatureCapture(signatureDataUrl, (dataUrl)=>{
      signatureDataUrl = dataUrl;
      document.getElementById('depSigBtn').textContent = dataUrl ? '✍️ Modifier' : '✍️ Recueillir la signature';
      const pill = document.getElementById('depSigSignedPill');
      if(pill) pill.style.display = dataUrl ? 'inline-flex' : 'none';
    });
  };

  document.getElementById('depFormSave').onclick = async ()=>{
    const firstName = document.getElementById('depFirstName').value.trim();
    const lastName = document.getElementById('depLastName').value.trim();
    const hasContent = firstName || lastName
      || document.getElementById('depReportedIssue').value.trim()
      || document.getElementById('depConditionNotes').value.trim()
      || photos.length || signatureDataUrl;
    if(!hasContent){
      photos.forEach(p=>{ if(!p.uploading) deletePhotoById(p.id); });
      closeModal();
      return;
    }
    if(!firstName && !lastName){ showToast("Merci d'indiquer au moins un nom."); return; }
    if(!signatureDataUrl){ showToast("La signature du client est obligatoire pour enregistrer le dépôt."); return; }
    if(photos.some(p=>p.uploading)){ showToast("Attends la fin de l'envoi des photos avant d'enregistrer."); return; }

    const dep = {
      id: uid(),
      depositNumber: nextDepositNumber(state),
      linkedRdvId: linkedRdv ? linkedRdv.id : null,
      dossierNumber: linkedRdv ? (linkedRdv.dossierNumber||'') : nextDossierNumber(state),
      firstName, lastName,
      clientName: (firstName+' '+lastName).trim(),
      phone: document.getElementById('depPhone').value.trim(),
      email: document.getElementById('depEmail').value.trim(),
      address: document.getElementById('depAddress').value.trim(),
      postalCode: document.getElementById('depPostalCode').value.trim(),
      city: document.getElementById('depCity').value.trim(),
      applianceType: document.getElementById('depApplianceType').value,
      brand: document.getElementById('depBrand').value.trim(),
      model: document.getElementById('depModel').value.trim(),
      serialNumber: document.getElementById('depSerialNumber').value.trim(),
      reportedIssue: document.getElementById('depReportedIssue').value.trim(),
      conditionNotes: document.getElementById('depConditionNotes').value.trim(),
      accessoriesLeft: document.getElementById('depAccessoriesLeft').value.trim(),
      photos: photos.filter(p=>!p.uploading).map(p=>({ id:p.id, name:p.name })),
      depositDate: todayISO(),
      depositSignature: signatureDataUrl,
      depositSignedAt: new Date().toISOString(),
      status: 'Déposé',
      pickupDate: null, pickupSignature: null, pickupSignedAt: null, pickupPaymentReceived: false
    };

    if(!state.deposits) state.deposits = [];
    state.deposits.push(dep);
    upsertClientFromContact(state, dep);
    const ok = await saveState(state);
    if(!ok){ state.deposits.pop(); return; }
    closeModal();
    drawDepotList();
    showToast("✅ Dépôt enregistré et signé.");
    if(dep.email && confirm("Envoyer une copie du bon de dépôt signé par email au client maintenant ?")){
      await sendDepositToClient(dep, state.settings.company);
    }
  };

  renderDepPhotoGallery();
}

/* ── Fiche détail (lecture) ── */
function openDepositDetail(id){
  const d = state.deposits.find(x=>x.id===id);
  if(!d) return;
  const existingReport = (state.interventions||[]).find(iv=>
    (d.linkedRdvId && iv.linkedRdvId===d.linkedRdvId) || (d.dossierNumber && iv.dossierNumber===d.dossierNumber)
  );
  const fields = [
    { label: 'Client', value: escapeHtml(d.clientName), strong:true },
    { label: 'Téléphone', value: d.phone ? `<a href="tel:${escapeHtml(d.phone)}" style="color:var(--cyan);text-decoration:none;">📞 ${escapeHtml(d.phone)}</a>` : null },
    { label: 'Email', value: d.email ? `<a href="mailto:${escapeHtml(d.email)}" style="color:var(--cyan);text-decoration:none;">✉️ ${escapeHtml(d.email)}</a>` : null },
    { label: 'Adresse', value: (d.address||d.city) ? `<a href="${wazeAppUrl(fullAddress(d))}" style="color:var(--cyan);text-decoration:none;">📍 ${escapeHtml(fullAddress(d))}</a>` : null },
    { label: 'Appareil', value: escapeHtml([d.applianceType,d.brand,d.model].filter(Boolean).join(' — ')||'—') },
    { label: 'N° de série', value: d.serialNumber ? escapeHtml(d.serialNumber) : null },
    { label: 'Panne déclarée', value: d.reportedIssue ? escapeHtml(d.reportedIssue) : null },
    { label: 'État constaté au dépôt', value: d.conditionNotes ? escapeHtml(d.conditionNotes) : null },
    { label: 'Accessoires laissés', value: d.accessoriesLeft ? escapeHtml(d.accessoriesLeft) : null },
    { label: 'Déposé le', value: fmtDate(d.depositDate)+' — signé le '+fmtDateTime(d.depositSignedAt) },
    { label: 'Restitution', value: d.status==='Récupéré' ? ('Récupéré le '+fmtDate(d.pickupDate)+' — signé le '+fmtDateTime(d.pickupSignedAt)+' · Paiement '+(d.pickupPaymentReceived?'effectué':'non réglé')) : null },
  ];
  const modalRoot = document.getElementById('modalRoot');
  modalRoot.innerHTML = `
    <div class="modal-overlay" id="depositDetailOverlay">
      <div class="modal">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.2rem;">
          <h3 style="margin-bottom:0;">${d.depositNumber?escapeHtml(d.depositNumber):'Dépôt'}</h3>
          <span class="badge ${d.status==='Récupéré'?'badge-confirme':'badge-encours'}">${d.status}</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:.8rem;">
          ${fields.filter(f=>f.value).map(f=>`
            <div style="background:rgba(255,255,255,.03);border:1px solid var(--border);border-left:3px solid var(--cyan);border-radius:8px;padding:.7rem .9rem;">
              <div style="color:var(--text-light);font-size:.72rem;text-transform:uppercase;letter-spacing:.05em;margin-bottom:.3rem;">${f.label}</div>
              <div style="font-size:.92rem;line-height:1.55;${f.strong?'font-weight:700;':''}">${f.value}</div>
            </div>
          `).join('')}
        </div>
        ${d.photos && d.photos.length ? `
          <div style="margin-top:1rem;">
            <div style="color:var(--text-light);font-size:.72rem;text-transform:uppercase;letter-spacing:.05em;margin-bottom:.5rem;">Photos au dépôt</div>
            <div id="depDetailPhotoGallery" style="display:flex;flex-wrap:wrap;gap:.6rem;"><span style="color:var(--text-light);font-size:.82rem;">Chargement…</span></div>
          </div>
        ` : ''}
        <div class="modal-footer">
          <button class="btn btn-ghost" id="depDetailClose">Fermer</button>
          <button class="btn btn-ghost" onclick="downloadDepositPdf(state.deposits.find(x=>x.id==='${d.id}'), state.settings.company)">📄 PDF</button>
          ${d.email ? `<button class="btn btn-ghost" onclick="sendDepositToClient(state.deposits.find(x=>x.id==='${d.id}'), state.settings.company)">✉️ Envoyer</button>` : ''}
          ${d.status!=='Récupéré' ? `<button class="btn btn-primary" style="width:auto" id="depDetailPickup">✅ Marquer récupéré</button>` : ''}
          <button class="btn btn-ghost" id="depDetailCreateReport">${existingReport ? '✏️ Modifier le rapport' : '📝 Créer le rapport'}</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('depDetailClose').onclick = closeModal;
  const pickupBtn = document.getElementById('depDetailPickup');
  if(pickupBtn) pickupBtn.onclick = ()=>{ closeModal(); openPickupForm(d.id); };
  document.getElementById('depDetailCreateReport').onclick = ()=>{
    if(existingReport){ window.location.href = 'planning.html?editReport='+existingReport.id; return; }
    window.location.href = d.linkedRdvId
      ? 'planning.html?newReportForRdv='+d.linkedRdvId
      : 'planning.html?newReportDossier='+encodeURIComponent(d.dossierNumber||'');
  };

  if(d.photos && d.photos.length){
    const gallery = document.getElementById('depDetailPhotoGallery');
    gallery.innerHTML = d.photos.map(p=>`<div style="width:100px;height:100px;border-radius:8px;overflow:hidden;border:1px solid var(--border);background:rgba(255,255,255,.04);display:flex;align-items:center;justify-content:center;" data-photo-id="${p.id}"><span style="font-size:.68rem;color:var(--text-light);">…</span></div>`).join('');
    d.photos.forEach(async (p)=>{
      try{
        const dataUrl = await fetchPhotoDataUrl(p.id);
        const el = gallery.querySelector('[data-photo-id="'+p.id+'"]');
        if(el){
          el.innerHTML = `<img src="${dataUrl}" style="width:100%;height:100%;object-fit:cover;">`;
          el.style.cursor = 'pointer';
          el.onclick = ()=>openPhotoLightbox(dataUrl, p.name||'photo.jpg');
        }
      }catch(e){ /* photo indisponible, on ignore */ }
    });
  }
}

/* ── Restitution ── */
function openPickupForm(id){
  const d = state.deposits.find(x=>x.id===id);
  if(!d) return;
  let signatureDataUrl = null;

  const modalRoot = document.getElementById('modalRoot');
  modalRoot.innerHTML = `
    <div class="modal-overlay" id="pickupFormOverlay">
      <div class="modal">
        <h3>✅ Restitution — ${escapeHtml(d.clientName||'')}</h3>
        <p style="font-size:.85rem;color:var(--text-light);margin-bottom:1rem;">${escapeHtml([d.applianceType,d.brand,d.model].filter(Boolean).join(' — ')||'')}</p>
        <label style="display:flex;align-items:center;gap:.5rem;font-size:.9rem;margin-bottom:1rem;">
          <input type="checkbox" id="pickupPaymentReceived"> Paiement effectué à la restitution
        </label>
        <div style="padding:.9rem;border:1px solid var(--border);border-radius:10px;display:flex;align-items:center;justify-content:space-between;gap:.8rem;flex-wrap:wrap;">
          <span style="font-size:.88rem;">Signature du client confirmant la reprise de l'appareil.</span>
          <button class="btn btn-ghost btn-small" id="pickupSigBtn" style="white-space:nowrap;">✍️ Recueillir la signature</button>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="pickupFormCancel">Annuler</button>
          <button class="btn btn-primary" style="width:auto" id="pickupFormSave">💾 Confirmer la restitution</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('pickupSigBtn').onclick = ()=>{
    openSignatureCapture(null, (dataUrl)=>{
      signatureDataUrl = dataUrl;
      document.getElementById('pickupSigBtn').textContent = '✍️ Modifier';
    });
  };
  document.getElementById('pickupFormCancel').onclick = closeModal;
  document.getElementById('pickupFormSave').onclick = async ()=>{
    if(!signatureDataUrl){ showToast("La signature du client est obligatoire pour valider la restitution."); return; }
    d.status = 'Récupéré';
    d.pickupDate = todayISO();
    d.pickupSignature = signatureDataUrl;
    d.pickupSignedAt = new Date().toISOString();
    d.pickupPaymentReceived = document.getElementById('pickupPaymentReceived').checked;
    const ok = await saveState(state);
    if(!ok) return;
    closeModal();
    drawDepotList();
    showToast("✅ Restitution enregistrée.");
    if(d.email && confirm("Envoyer une confirmation de restitution signée par email au client maintenant ?")){
      await sendDepositToClient(d, state.settings.company);
    }
  };
}

async function deleteDeposit(id){
  if(!confirm("Mettre ce dépôt à la corbeille ? Tu pourras le restaurer depuis la Corbeille.")) return;
  const backup = state.deposits;
  const dep = state.deposits.find(x=>x.id===id);
  state.deposits = state.deposits.filter(x=>x.id!==id);
  if(dep) moveToTrash(state, 'depot', (dep.depositNumber?dep.depositNumber+' — ':'')+(dep.clientName||''), dep);
  const ok = await saveState(state);
  if(!ok){ state.deposits = backup; state.trash.pop(); return; }
  drawDepotList();
  showToast("Dépôt déplacé vers la corbeille.");
}
