let state = null;
let planSelectedDate = null;
let planYear, planMonth;

(async function(){
  state = await requireAuth();
  if(!state) return;
  if(!state.trash) state.trash = [];
  renderNavbar('planning', state);
  planSelectedDate = todayISO();
  const now = new Date();
  planYear = now.getFullYear();
  planMonth = now.getMonth();
  renderPlanning();
  startAutoRefresh(applyPlanRefresh, 30000);
  // Import automatique et silencieux des demandes du site à l'ouverture de la page
  // (elles arrivent déjà confirmées, donc directement visibles dans le calendrier).
  importFromGateway(state, ()=>{ renderNavbar('planning', state); renderPlanGrid(); renderDayDetail(planSelectedDate); }, {silent:true});

  // Arrivée depuis Dossiers ("Modifier" ou "+ Nouveau rapport") : ouvre directement
  // le rapport concerné, sans avoir à le rechercher dans le calendrier.
  const params = new URLSearchParams(window.location.search);
  const editReportId = params.get('editReport');
  const wantsNewReport = params.get('newReport');
  const editDevisId = params.get('editDevis');
  const createDevisForRdv = params.get('createDevisForRdv');
  const newReportForRdv = params.get('newReportForRdv');
  if(editReportId && state.interventions.some(iv=>iv.id===editReportId)){
    openIntervModal(editReportId, null, true);
    history.replaceState(null, '', 'planning.html');
  } else if(wantsNewReport){
    openIntervModal();
    history.replaceState(null, '', 'planning.html');
  } else if(editDevisId && state.devis.some(d=>d.id===editDevisId)){
    openDevisModal(editDevisId);
    history.replaceState(null, '', 'planning.html');
  } else if(createDevisForRdv && state.appointments.some(a=>a.id===createDevisForRdv)){
    openDevisModal(null, createDevisForRdv);
    history.replaceState(null, '', 'planning.html');
  } else if(newReportForRdv && state.appointments.some(a=>a.id===newReportForRdv)){
    // Toujours vérifier d'abord si un rapport existe déjà pour ce RDV — sinon,
    // rouvrir ce lien créait systématiquement un nouveau rapport en double.
    const existingForRdv = state.interventions.find(iv=>iv.linkedRdvId===newReportForRdv);
    if(existingForRdv){
      openIntervModal(existingForRdv.id);
    } else {
      openIntervModal(null, newReportForRdv);
    }
    history.replaceState(null, '', 'planning.html');
  } else if(params.get('newReportDossier')){
    // Dépôt créé sans RDV lié : on vérifie d'abord si un rapport existe déjà pour
    // ce numéro de dossier (même logique que ci-dessus, pour éviter les doublons),
    // sinon on ouvre un rapport vierge en pré-remplissant directement son numéro
    // de dossier (plus besoin de le reporter manuellement).
    const dossierNum = params.get('newReportDossier');
    const existingForDossier = state.interventions.find(iv=>iv.dossierNumber===dossierNum);
    if(existingForDossier){
      openIntervModal(existingForDossier.id);
    } else {
      openIntervModal(null, null, false, dossierNum);
    }
    history.replaceState(null, '', 'planning.html');
  }
})();

const PLAN_DOW_SHORT = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
const PLAN_MOIS_SHORT = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
const PLAN_DOW_LONG = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
const PLAN_MOIS_LONG = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

function parseDateStr(dateStr){
  const p = dateStr.split('-');
  return new Date(parseInt(p[0]), parseInt(p[1])-1, parseInt(p[2]));
}

function confirmedForDate(dateStr){
  return state.appointments.filter(a=>a.date===dateStr && a.requestType!=='depot');
}

// Tous les RDV (site ou manuel) apparaissent désormais directement dans le calendrier
// à leur date/créneau choisi — plus d'étape de validation intermédiaire.
function dayViewAppointments(dateStr){
  return confirmedForDate(dateStr);
}

/* ═══════════ Vue d'ensemble de la page (bande de jours + calendrier) ═══════════ */
function renderPlanning(){
  const main = document.getElementById('pageContent');
  const planYearOptions = [];
  const currentYear = new Date().getFullYear();
  for(let y=currentYear-2; y<=currentYear+1; y++) planYearOptions.push(y);
  main.innerHTML = `
    <div class="page-head">
      <h2>Plann<span>ing</span></h2>
      <div style="display:flex;gap:.6rem;flex-wrap:wrap;">
        <button class="btn btn-ghost" id="importBtn">↻ Importer depuis le site</button>
        <button class="btn btn-primary" style="width:auto" id="newRdvBtn">+ Nouveau RDV</button>
      </div>
    </div>
    <div class="page-head" style="margin-top:.6rem;"><h2>Calend<span>rier</span></h2></div>
    <div class="section-block">
      <p style="font-size:.85rem;color:var(--text-light);margin-bottom:1rem;">
        Tous les rendez-vous (site ou manuel) apparaissent ici automatiquement à leur date et créneau. Naviguez mois par mois, ou revenez à aujourd'hui en un clic.
      </p>
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.6rem;margin-bottom:1rem;">
        <div style="display:flex;align-items:center;gap:.6rem;">
          <button class="btn btn-ghost btn-small" id="planPrevMonth">‹</button>
          <strong id="planMonthLabel" style="font-family:'Rajdhani',sans-serif;font-size:1.1rem;text-transform:uppercase;letter-spacing:.03em;min-width:160px;text-align:center;"></strong>
          <button class="btn btn-ghost btn-small" id="planNextMonth">›</button>
        </div>
        <div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;">
          <select id="planMonthSelect">${PLAN_MOIS_LONG.map((m,idx)=>`<option value="${idx}">${m}</option>`).join('')}</select>
          <select id="planYearSelect">${planYearOptions.map(y=>`<option value="${y}">${y}</option>`).join('')}</select>
          <button class="btn btn-ghost btn-small" id="planJumpToday" style="white-space:nowrap;">📍 Aujourd'hui</button>
        </div>
      </div>
      <div class="cal-strip-wrapper" id="planStripWrapper">
        <div class="cal-strip" id="planStrip"></div>
      </div>
    </div>
    <div id="planDayDetail"></div>
  `;
  document.getElementById('newRdvBtn').onclick = ()=>openRdvModal();
  document.getElementById('importBtn').onclick = ()=>importFromGateway(state, ()=>{ renderNavbar('planning', state); renderPlanGrid(); renderDayDetail(planSelectedDate); });
  document.getElementById('planPrevMonth').onclick = ()=>{ changePlanMonth(-1); };
  document.getElementById('planNextMonth').onclick = ()=>{ changePlanMonth(1); };
  document.getElementById('planMonthSelect').onchange = (e)=>{ planMonth = Number(e.target.value); refreshPlanCalendar(); };
  document.getElementById('planYearSelect').onchange = (e)=>{ planYear = Number(e.target.value); refreshPlanCalendar(); };
  document.getElementById('planJumpToday').onclick = ()=>{
    const t = new Date();
    planYear = t.getFullYear();
    planMonth = t.getMonth();
    planSelectedDate = todayISO();
    refreshPlanCalendar();
    renderDayDetail(planSelectedDate);
  };
  refreshPlanCalendar();
  renderDayDetail(planSelectedDate);
}

function changePlanMonth(delta){
  planMonth += delta;
  if(planMonth < 0){ planMonth = 11; planYear--; }
  if(planMonth > 11){ planMonth = 0; planYear++; }
  refreshPlanCalendar();
}

function refreshPlanCalendar(){
  document.getElementById('planMonthSelect').value = String(planMonth);
  document.getElementById('planYearSelect').value = String(planYear);
  document.getElementById('planMonthLabel').textContent = PLAN_MOIS_LONG[planMonth]+' '+planYear;
  renderPlanGrid();

  const today = new Date();
  let targetDay = null;
  if(planYear===today.getFullYear() && planMonth===today.getMonth()){
    targetDay = today.getDate();
  } else if(planSelectedDate){
    const sel = parseDateStr(planSelectedDate);
    if(sel.getFullYear()===planYear && sel.getMonth()===planMonth) targetDay = sel.getDate();
  }
  if(targetDay) centerPlanGridOnDay(targetDay);
}

// Centre la bande de calendrier sur un jour donné du mois affiché (ex: aujourd'hui).
function centerPlanGridOnDay(dayNumber){
  requestAnimationFrame(()=>{
    const wrapper = document.getElementById('planStripWrapper');
    const grid = document.getElementById('planStrip');
    if(!wrapper || !grid) return;
    const card = grid.children[dayNumber-1];
    if(!card) return;
    wrapper.scrollLeft = Math.max(0, card.offsetLeft - (wrapper.clientWidth/2) + (card.clientWidth/2));
  });
}

// Appelé périodiquement par startAutoRefresh : compare l'ancien et le nouvel état
// pour détecter un nouveau RDV en attente ou un devis accepté/refusé, notifie si
// besoin, puis ré-affiche tout avec les données fraîches.
function applyPlanRefresh(newState){
  const prevCount = state.appointments.length;
  const prevDevisStatus = {};
  (state.devis||[]).forEach(d=>{ prevDevisStatus[d.id] = d.status; });

  state = newState;

  const newCount = state.appointments.length;
  if(newCount > prevCount){
    showToast('📥 '+(newCount-prevCount)+' nouveau(x) rendez-vous reçu(s).');
  }
  (state.devis||[]).forEach(d=>{
    const prev = prevDevisStatus[d.id];
    if(prev && prev!==d.status && (d.status==='Accepté' || d.status==='Refusé')){
      showToast((d.status==='Accepté'?'✅ Devis accepté par ':'❌ Devis refusé par ')+(d.clientName||'le client')+(d.devisNumber?(' ('+d.devisNumber+')'):''));
    }
  });

  renderNavbar('planning', state);
  refreshPlanCalendar();
  renderDayDetail(planSelectedDate);
}

async function deleteRdv(id){
  if(!confirm("Mettre ce rendez-vous à la corbeille ? Tu pourras le restaurer depuis la Corbeille.")) return;
  const backup = state.appointments;
  const a = state.appointments.find(x=>x.id===id);
  state.appointments = state.appointments.filter(x=>x.id!==id);
  if(a) moveToTrash(state, 'rdv', (a.dossierNumber?a.dossierNumber+' — ':'')+(a.clientName||''), a);
  const ok = await saveState(state);
  if(!ok){ state.appointments = backup; state.trash.pop(); return; }
  // Le créneau site est libéré tout de suite (pas d'attente de la suppression
  // définitive) pour ne pas bloquer indéfiniment une disponibilité pendant qu'un
  // RDV traîne à la corbeille.
  if(a) releaseBookingSlot(a.bookingId);
  renderNavbar('planning', state);
  renderPlanGrid();
  renderDayDetail(planSelectedDate);
  showToast("Rendez-vous déplacé vers la corbeille.");
}

function openRdvDetail(id){
  const a = state.appointments.find(x=>x.id===id);
  if(!a) return;
  // Un rapport lié avec au moins un appareil "Besoin de pièce" autorise la
  // reprogrammation du rendez-vous directement depuis sa fiche.
  const linkedIv = state.interventions.find(iv=>iv.linkedRdvId===a.id || (a.dossierNumber && iv.dossierNumber===a.dossierNumber));
  const needsPartRdv = !!(linkedIv && (linkedIv.devices||[]).some(d=>d.needsPart));
  const fields = [
    { label: 'Client', value: escapeHtml(a.clientName), strong:true },
    { label: 'Téléphone', value: a.phone ? `<div style="display:flex;gap:.4rem;align-items:flex-start;"><span>📞</span><a href="tel:${escapeHtml(a.phone)}" style="color:var(--cyan);text-decoration:none;word-break:break-word;">${escapeHtml(a.phone)}</a></div>` : null },
    { label: 'Email', value: a.email ? `<div style="display:flex;gap:.4rem;align-items:flex-start;"><span>✉️</span><a href="mailto:${escapeHtml(a.email)}" style="color:var(--cyan);text-decoration:none;word-break:break-word;">${escapeHtml(a.email)}</a></div>` : null },
    { label: 'Adresse', value: a.address ? `<div style="display:flex;gap:.4rem;align-items:flex-start;"><span>📍</span><a href="${wazeAppUrl(fullAddress(a))}" style="color:var(--cyan);text-decoration:none;word-break:break-word;">${escapeHtml(fullAddress(a))} — ouvrir dans Waze ↗</a></div>` : null },
    { label: 'Date & créneau', value: fmtDate(a.date)+(a.time?(' · '+a.time):'') },
    { label: 'Heure précise souhaitée', value: a.timeNote ? ('🕒 '+escapeHtml(a.timeNote)) : null },
    { label: 'Appareil', value: a.applianceType ? escapeHtml(a.applianceType) : null },
    { label: 'Marque / Modèle', value: (a.brand||a.model) ? escapeHtml([a.brand,a.model].filter(Boolean).join(' — ')) : null },
    { label: 'Description de la panne', value: a.issue ? escapeHtml(a.issue) : null },
    { label: 'Canal du RDV', value: a.source ? escapeHtml(a.source) : null },
    { label: 'Comment le client nous a trouvés', value: a.referral ? escapeHtml(a.referral) : null },
    { label: 'Note de replanification', value: a.rescheduleNote ? escapeHtml(a.rescheduleNote) : null },
  ];
  const modalRoot = document.getElementById('modalRoot');
  modalRoot.innerHTML = `
    <div class="modal-overlay" id="rdvDetailOverlay">
      <div class="modal">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.2rem;">
          <h3 style="margin-bottom:0;">${a.dossierNumber ? escapeHtml(a.dossierNumber) : 'Détail du rendez-vous'}</h3>
          <span class="badge ${statusBadgeClass(a.status)}">${a.status}</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:.8rem;">
          ${fields.filter(f=>f.value).map(f=>`
            <div style="background:rgba(255,255,255,.03);border:1px solid var(--border);border-left:3px solid var(--cyan);border-radius:8px;padding:.7rem .9rem;">
              <div style="color:var(--text-light);font-size:.72rem;text-transform:uppercase;letter-spacing:.05em;margin-bottom:.3rem;">${f.label}</div>
              <div style="font-size:.92rem;line-height:1.55;${f.strong?'font-weight:700;':''}">${f.value}</div>
            </div>
          `).join('')}
        </div>
        ${a.photos && a.photos.length ? `
          <div style="margin-top:1rem;">
            <div style="color:var(--text-light);font-size:.72rem;text-transform:uppercase;letter-spacing:.05em;margin-bottom:.5rem;">Photos jointes par le client</div>
            <div id="rdvDetailPhotoGallery" style="display:flex;flex-wrap:wrap;gap:.6rem;"><span style="color:var(--text-light);font-size:.82rem;">Chargement…</span></div>
          </div>
        ` : ''}
        <div class="modal-footer">
          <button class="btn btn-ghost" id="rdvDetailClose">Fermer</button>
          ${a.status==='Annulé' ? `<button class="btn btn-ghost" id="rdvDetailRedoDevis">🔁 Réactiver + refaire le devis</button>` : ''}
          ${needsPartRdv && a.status!=='Annulé' ? `<button class="btn btn-ghost" id="rdvDetailReplanify">🔁 Reprogrammer le rendez-vous</button>` : ''}
          <button class="btn btn-ghost" id="rdvDetailDeposit">📥 Créer un dépôt</button>
          <button class="btn btn-primary" style="width:auto" id="rdvDetailEdit">Modifier</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('rdvDetailClose').onclick = closeModal;
  document.getElementById('rdvDetailEdit').onclick = ()=>{ closeModal(); openRdvModal(a.id); };
  document.getElementById('rdvDetailDeposit').onclick = ()=>{ window.location.href = 'depots.html?fromRdv='+a.id; };
  const redoDevisBtn = document.getElementById('rdvDetailRedoDevis');
  if(redoDevisBtn) redoDevisBtn.onclick = async ()=>{ closeModal(); await redoRdvAndDevis(a.id); };
  const replanifyBtn = document.getElementById('rdvDetailReplanify');
  if(replanifyBtn) replanifyBtn.onclick = async ()=>{ closeModal(); await replanifyRdv(a.id); };

  if(a.photos && a.photos.length){
    const gallery = document.getElementById('rdvDetailPhotoGallery');
    gallery.innerHTML = a.photos.map(p=>`<div style="width:120px;" data-photo-id="${p.id}"><div style="width:120px;height:120px;border-radius:8px;overflow:hidden;border:1px solid var(--border);background:rgba(255,255,255,.04);display:flex;align-items:center;justify-content:center;"><span style="font-size:.68rem;color:var(--text-light);">…</span></div><div style="font-size:.72rem;color:var(--text-light);margin-top:.3rem;text-align:center;">${escapeHtml(p.name||'')}</div></div>`).join('');
    a.photos.forEach(async (p)=>{
      try{
        const dataUrl = await fetchPhotoDataUrl(p.id);
        const el = gallery.querySelector('[data-photo-id="'+p.id+'"] div');
        if(el){
          el.innerHTML = `<img src="${dataUrl}" style="width:100%;height:100%;object-fit:cover;cursor:pointer;">`;
          el.style.cursor = 'pointer';
          el.onclick = ()=>openPhotoLightbox(dataUrl, p.name||'photo.jpg');
        }
      }catch(e){ /* photo indisponible, on ignore */ }
    });
  }
  // Le clic en dehors de la fenêtre ne la ferme plus (évite une fermeture accidentelle) —
  // seul le bouton "Fermer" permet de quitter la fiche.
}

// Découpe un nom complet en prénom/nom pour les anciens dossiers qui n'avaient
// qu'un seul champ combiné : le premier mot devient le prénom, le reste le nom
// (repli raisonnable, largement suffisant pour l'immense majorité des cas français).
function splitName(fullName){
  const trimmed = (fullName||'').trim();
  if(!trimmed) return { firstName:'', lastName:'' };
  const parts = trimmed.split(/\s+/);
  if(parts.length === 1) return { firstName: parts[0], lastName:'' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function openRdvModal(id){
  const editing = id ? state.appointments.find(a=>a.id===id) : null;
  const a = editing || {id:uid(), firstName:'',lastName:'',clientName:'',phone:'',email:'',address:'',postalCode:'',city:'',date:todayISO(),time:'Matin',timeNote:'',applianceType:state.settings.applianceTypes[0]||'',brand:'',model:'',issue:'',status:'À faire',source:'Manuel',referral:''};
  // Récupération pour les RDV créés avant la séparation prénom/nom (ou dont ces champs
  // sont restés vides) : on retombe sur l'ancien nom complet, sans jamais rien perdre.
  if(editing && !a.firstName && !a.lastName && a.clientName){
    const split = splitName(a.clientName);
    a.firstName = split.firstName;
    a.lastName = split.lastName;
  }
  const modalRoot = document.getElementById('modalRoot');
  modalRoot.innerHTML = `
    <div class="modal-overlay" id="rdvOverlay">
      <div class="modal">
        <h3>${editing?'Modifier le':'Nouveau'} rendez-vous</h3>
        ${!editing ? `
          <div class="field">
            <label>Type de demande</label>
            <select id="mRequestType">
              <option value="domicile" ${(!a.requestType || a.requestType==='domicile')?'selected':''}>🏠 Intervention à domicile</option>
              <option value="depot" ${a.requestType==='depot'?'selected':''}>📥 Dépôt à l'atelier</option>
            </select>
          </div>
        ` : ''}
        ${editing ? `<div class="field"><label>Numéro de dossier</label><input id="mDossierNumber" value="${escapeHtml(a.dossierNumber||'')}" placeholder="Ex : ACS-2026-07-001"></div>` : ''}
        ${!editing ? `
          <div class="field" style="position:relative;">
            <label>Reprendre un client existant (optionnel)</label>
            <input id="mClientSearch" placeholder="Cliquez pour voir vos clients, ou tapez un nom..." autocomplete="off">
            <div id="mClientSearchResults" style="display:none;position:absolute;z-index:60;background:#02132f;border:1px solid var(--border);border-radius:8px;max-height:230px;overflow-y:auto;width:100%;margin-top:.2rem;box-shadow:0 12px 26px rgba(0,0,0,.5);"></div>
          </div>
        ` : ''}
        <div class="modal-row">
          <div class="field"><label>Prénom</label><input id="mFirstName" value="${escapeHtml(a.firstName||'')}"></div>
          <div class="field"><label>Nom</label><input id="mLastName" value="${escapeHtml(a.lastName||'')}"></div>
        </div>
        <div class="modal-row">
          <div class="field"><label>Téléphone</label><input id="mPhone" value="${escapeHtml(a.phone)}"></div>
          <div class="field"><label>Email</label><input type="email" id="mEmail" value="${escapeHtml(a.email||'')}"></div>
        </div>
        <div class="modal-row">
          <div class="field"><label>Adresse</label><input id="mAddress" value="${escapeHtml(a.address)}" style="grid-column:1/-1;"></div>
        </div>
        <div class="modal-row">
          <div class="field"><label>Code postal</label><input id="mPostalCode" value="${escapeHtml(a.postalCode||'')}"></div>
          <div class="field"><label>Ville</label><input id="mCity" value="${escapeHtml(a.city||'')}"></div>
        </div>
        <div class="modal-row" id="mDateSlotRow">
          <div class="field"><label>Date</label><input type="date" id="mDate" value="${a.date}"></div>
          <div class="field"><label>Créneau</label>
            <select id="mTimeSlot">
              <option value="Matin" ${a.time==='Matin'?'selected':''}>Matin</option>
              <option value="Après-midi" ${a.time==='Après-midi'?'selected':''}>Après-midi</option>
            </select>
          </div>
        </div>
        <div class="field"><label>Heure précise souhaitée par le client (optionnel)</label>
          <input id="mTimeNote" value="${escapeHtml((()=>{ if(a.timeNote) return a.timeNote; if(a.time && a.time!=='Matin' && a.time!=='Après-midi') return 'Horaire précédent : '+a.time; return ''; })())}" placeholder="Ex : de préférence après 14h">
        </div>
        <div class="field"><label>Type d'appareil</label>
          <select id="mAppliance">${state.settings.applianceTypes.map(t=>`<option ${t===a.applianceType?'selected':''}>${t}</option>`).join('')}</select>
        </div>
        <div class="modal-row">
          <div class="field"><label>Marque</label>
            <input id="mBrand" list="mBrandList" value="${escapeHtml(a.brand||'')}" placeholder="Ex : Bosch">
            <datalist id="mBrandList">${state.settings.brands.map(b=>`<option value="${escapeHtml(b)}">`).join('')}</datalist>
          </div>
          <div class="field"><label>Modèle</label><input id="mModel" value="${escapeHtml(a.model||'')}" placeholder="Ex : WAE24467FF"></div>
        </div>
        <div class="field"><label>Statut</label>
          <select id="mStatus">${RDV_STATUSES.map(s=>`<option ${s===a.status?'selected':''}>${s}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Description de la panne</label><textarea id="mIssue">${escapeHtml(a.issue)}</textarea></div>
        <div class="modal-row">
          <div class="field"><label>Canal du RDV</label>
            <select id="mSource">${state.settings.rdvSources.map(s=>`<option ${s===a.source?'selected':''}>${s}</option>`).join('')}</select>
          </div>
          <div class="field"><label>Comment le client nous a trouvés</label><input id="mReferral" value="${escapeHtml(a.referral||'')}" placeholder="Bouche à oreille, Google…"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" style="width:auto" id="mSave">Fermer</button>
        </div>
      </div>
    </div>
  `;
  const reqTypeSelect = document.getElementById('mRequestType');
  if(reqTypeSelect){
    const toggleDateSlot = ()=>{
      document.getElementById('mDateSlotRow').style.display = (reqTypeSelect.value==='depot') ? 'none' : 'grid';
    };
    reqTypeSelect.onchange = toggleDateSlot;
    toggleDateSlot();
  }
  if(document.getElementById('mClientSearch')){
    wireClientSearchInput('mClientSearch', 'mClientSearchResults', (picked)=>{
      document.getElementById('mFirstName').value = picked.firstName||'';
      document.getElementById('mLastName').value = picked.lastName||'';
      document.getElementById('mPhone').value = picked.phone||'';
      document.getElementById('mEmail').value = picked.email||'';
      document.getElementById('mAddress').value = picked.address||'';
      document.getElementById('mPostalCode').value = picked.postalCode||'';
      document.getElementById('mCity').value = picked.city||'';
    });
  }
  // Un seul bouton "Fermer" : il enregistre systématiquement (sauf si le
  // formulaire est resté totalement vide, auquel cas on ferme sans rien créer).
  document.getElementById('mSave').onclick = async ()=>{
    const firstName = document.getElementById('mFirstName').value.trim();
    const lastName = document.getElementById('mLastName').value.trim();
    const hasContent = firstName || lastName
      || document.getElementById('mPhone').value.trim()
      || document.getElementById('mEmail').value.trim()
      || document.getElementById('mAddress').value.trim()
      || document.getElementById('mIssue').value.trim()
      || document.getElementById('mBrand').value.trim()
      || document.getElementById('mModel').value.trim();
    if(!editing && !hasContent){ closeModal(); return; }
    if(!firstName && !lastName){ showToast("Le prénom ou le nom du client est requis."); return; }
    a.firstName = firstName;
    a.lastName = lastName;
    a.clientName = (firstName+' '+lastName).trim();
    a.phone = document.getElementById('mPhone').value.trim();
    a.email = document.getElementById('mEmail').value.trim();
    a.address = document.getElementById('mAddress').value.trim();
    a.postalCode = document.getElementById('mPostalCode').value.trim();
    a.city = document.getElementById('mCity').value.trim();
    a.date = document.getElementById('mDate').value;
    a.time = document.getElementById('mTimeSlot').value;
    a.timeNote = document.getElementById('mTimeNote').value.trim();
    a.applianceType = document.getElementById('mAppliance').value;
    a.brand = document.getElementById('mBrand').value.trim();
    a.model = document.getElementById('mModel').value.trim();
    a.status = document.getElementById('mStatus').value;
    a.issue = document.getElementById('mIssue').value.trim();
    a.source = document.getElementById('mSource').value;
    a.referral = document.getElementById('mReferral').value.trim();
    if(!editing){
      const reqTypeEl = document.getElementById('mRequestType');
      a.requestType = reqTypeEl ? reqTypeEl.value : 'domicile';
      a.dossierNumber = nextDossierNumber(state);
      state.appointments.push(a);
    } else {
      const editedDossier = document.getElementById('mDossierNumber').value.trim();
      if(editedDossier) a.dossierNumber = editedDossier;
    }
    upsertClientFromContact(state, a);
    const ok = await saveState(state);
    if(!ok) return;
    closeModal();
    if(!editing && a.requestType === 'depot'){
      showToast("Ajoutée aux demandes de dépôt.");
      window.location.href = 'depots.html';
      return;
    }
    renderNavbar('planning', state);
    renderPlanGrid();
    renderDayDetail(planSelectedDate);
    showToast("Rendez-vous enregistré.");
  };
}

// Remet un RDV annulé au statut "À faire" ET réinitialise le devis lié (même numéro, mais
// remis à l'état "Brouillon", signature effacée) pour permettre une nouvelle
// signature client. Ouvre directement le devis pour modification/renvoi.
async function redoRdvAndDevis(id){
  const a = state.appointments.find(x=>x.id===id);
  if(!a) return;
  const rdvBackup = { status: a.status, archivedAt: a.archivedAt, bookingId: a.bookingId };
  const linkedDevis = (state.devis||[]).find(d=>d.linkedRdvId===a.id);
  const devisBackup = linkedDevis ? JSON.parse(JSON.stringify(linkedDevis)) : null;

  a.status = 'À faire';
  a.archivedAt = null;

  if(linkedDevis){
    const validity = state.settings.devisValidityDays || 30;
    const today = todayISO();
    linkedDevis.status = 'Brouillon';
    linkedDevis.signature = null;
    linkedDevis.signedAt = null;
    linkedDevis.signedByEmail = null;
    linkedDevis.signedIp = null;
    linkedDevis.refusedAt = null;
    linkedDevis.publicToken = null;
    linkedDevis.issueDate = today;
    linkedDevis.expiryDate = addDaysISO(today, validity);
  }

  const ok = await saveState(state);
  if(!ok){
    Object.assign(a, rdvBackup);
    if(linkedDevis && devisBackup) Object.assign(linkedDevis, devisBackup);
    return;
  }
  releaseBookingSlot(a.bookingId);
  a.bookingId = null;
  renderNavbar('planning', state);
  renderPlanGrid();
  renderDayDetail(planSelectedDate);

  if(linkedDevis){
    showToast("Rendez-vous réactivé — devis réinitialisé, modifiez-le puis renvoyez-le.");
    openDevisModal(linkedDevis.id);
  } else {
    showToast("Rendez-vous réactivé — aucun devis existant pour ce dossier.");
  }
}

async function replanifyRdv(id){
  const a = state.appointments.find(x=>x.id===id);
  if(!a) return;
  const backup = { status: a.status, archivedAt: a.archivedAt };
  a.status = 'À faire';
  a.archivedAt = null;
  const ok = await saveState(state);
  if(!ok){ Object.assign(a, backup); return; }
  releaseBookingSlot(a.bookingId);
  a.bookingId = null;
  renderNavbar('planning', state);
  renderPlanGrid();
  renderDayDetail(planSelectedDate);
  showToast("Rendez-vous replanifié — la place a été libérée sur le site.");
  openReplanifyModal(a);
}

function openReplanifyModal(a){
  const modalRoot = document.getElementById('modalRoot');
  modalRoot.innerHTML = `
    <div class="modal-overlay" id="replanOverlay">
      <div class="modal">
        <h3>Replanifier le rendez-vous</h3>
        <div class="modal-row">
          <div class="field"><label>Nouvelle date</label><input type="date" id="replanDate" value="${a.date || todayISO()}"></div>
          <div class="field"><label>Créneau</label>
            <select id="replanSlot">
              <option value="Matin" ${a.time==='Matin'?'selected':''}>Matin</option>
              <option value="Après-midi" ${a.time==='Après-midi'?'selected':''}>Après-midi</option>
            </select>
          </div>
        </div>
        <div class="field"><label>Note (optionnel)</label>
          <textarea id="replanNote" placeholder="Ex : le client souhaite plutôt passer vers 14h">${escapeHtml(a.rescheduleNote||'')}</textarea>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="replanCancel">Fermer</button>
          <button class="btn btn-primary" style="width:auto" id="replanConfirm">Confirmer</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('replanCancel').onclick = closeModal;
  // Le clic en dehors ne ferme plus la fenêtre — seul "Fermer" ou "Confirmer" le fait.
  document.getElementById('replanConfirm').onclick = async ()=>{
    const newDate = document.getElementById('replanDate').value;
    if(!newDate){ showToast("Choisissez une date."); return; }
    const backup = { date:a.date, time:a.time, rescheduleNote:a.rescheduleNote };
    a.date = newDate;
    a.time = document.getElementById('replanSlot').value;
    a.rescheduleNote = document.getElementById('replanNote').value.trim();
    const ok = await saveState(state);
    if(!ok){ Object.assign(a, backup); return; }
    closeModal();
    renderNavbar('planning', state);
    renderPlanGrid();
  renderDayDetail(planSelectedDate);
    showToast("Rendez-vous replanifié — pensez à le valider à nouveau.");
  };
}

const PLAN_DOW_MON_FIRST = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];

function renderPlanGrid(){
  const grid = document.getElementById('planStrip');
  grid.innerHTML = '';
  const daysInMonth = new Date(planYear, planMonth+1, 0).getDate();

  for(let d=1; d<=daysInMonth; d++){
    const dateStr = planYear+'-'+String(planMonth+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
    const date = new Date(planYear, planMonth, d);
    const count = dayViewAppointments(dateStr).length;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'day-card' + (planSelectedDate===dateStr ? ' day-active' : '');
    card.innerHTML = '<span class="dow">'+PLAN_DOW_MON_FIRST[(date.getDay()+6)%7]+'</span>'
      + '<span class="num">'+d+'</span>'
      + (count ? '<span class="day-count">'+count+'</span>' : '');
    card.addEventListener('click', function(){
      planSelectedDate = dateStr;
      renderPlanGrid();
      renderDayDetail(dateStr);
    });
    grid.appendChild(card);
  }
}

function groupLabel(a){
  if(a.time === 'Matin') return 'Matin';
  if(a.time === 'Après-midi') return 'Après-midi';
  return a.time ? ('Horaire : '+a.time) : 'Sans horaire précis';
}

function renderDayDetail(dateStr){
  const container = document.getElementById('planDayDetail');
  const date = parseDateStr(dateStr);
  const list = dayViewAppointments(dateStr).sort((a,b)=>{
    const pa = (a.planOrder===undefined || a.planOrder===null) ? 999 : a.planOrder;
    const pb = (b.planOrder===undefined || b.planOrder===null) ? 999 : b.planOrder;
    if(pa !== pb) return pa - pb;
    return (a.dossierNumber||'').localeCompare(b.dossierNumber||'');
  });

  if(!list.length){
    container.innerHTML = `
      <div class="section-block">
        <h3>${PLAN_DOW_LONG[date.getDay()]} ${date.getDate()} ${PLAN_MOIS_LONG[date.getMonth()]}</h3>
        <div class="empty-state"><div class="mark">🗓️</div>Aucun rendez-vous validé ce jour-là.</div>
      </div>
    `;
    return;
  }

  const groups = { 'Matin': [], 'Après-midi': [] };
  list.forEach(a=>{
    const g = groupLabel(a);
    if(!groups[g]) groups[g] = [];
    groups[g].push(a);
  });
  const groupOrder = ['Matin','Après-midi'];
  const groupNames = Object.keys(groups).sort((a,b)=>{
    const ia = groupOrder.indexOf(a), ib = groupOrder.indexOf(b);
    if(ia===-1 && ib===-1) return a.localeCompare(b);
    if(ia===-1) return 1;
    if(ib===-1) return -1;
    return ia - ib;
  });

  container.innerHTML = `
    <div class="section-block">
      <h3>${PLAN_DOW_LONG[date.getDay()]} ${date.getDate()} ${PLAN_MOIS_LONG[date.getMonth()]} — ${list.length} rendez-vous</h3>
      ${groupNames.map(g=>renderGroupHtml(g, groups[g], dateStr)).join('')}
    </div>
  `;

  groupNames.forEach(g=>{
    const groupId = 'group-'+g.replace(/[^a-zA-Z0-9]/g,'');
    const optBtn = document.getElementById('opt-'+groupId);
    if(optBtn) optBtn.onclick = ()=>optimizeGroup(dateStr, g);
    const mapsBtn = document.getElementById('maps-'+groupId);
    if(mapsBtn) mapsBtn.onclick = ()=>{
      const addrs = groups[g].map(a=>a.address).filter(Boolean);
      if(addrs.length < 2){ showToast("Il faut au moins 2 adresses pour un itinéraire."); return; }
      window.open(googleMapsMultiStopUrl(addrs), '_blank');
    };
  });
}

function renderGroupHtml(groupName, items, dateStr){
  const groupId = 'group-'+groupName.replace(/[^a-zA-Z0-9]/g,'');
  if(!items.length){
    return `
      <div style="margin-bottom:1.3rem;">
        <h4 style="font-family:'Rajdhani',sans-serif;font-size:1rem;text-transform:uppercase;color:var(--cyan);letter-spacing:.03em;margin-bottom:.6rem;">${escapeHtml(groupName)} (0)</h4>
        <div style="font-size:.85rem;color:var(--text-light);">Aucun rendez-vous ${groupName==='Matin'?'le matin':groupName==='Après-midi'?"l'après-midi":'sur ce créneau'}.</div>
      </div>
    `;
  }
  return `
    <div style="margin-bottom:1.3rem;">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.6rem;margin-bottom:.6rem;">
        <h4 style="font-family:'Rajdhani',sans-serif;font-size:1rem;text-transform:uppercase;color:var(--cyan);letter-spacing:.03em;">${escapeHtml(groupName)} (${items.length})</h4>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap;">
          <button class="btn btn-ghost btn-small" id="opt-${groupId}">🧭 Optimiser l'itinéraire</button>
          <button class="btn btn-ghost btn-small" id="maps-${groupId}">🗺️ Ouvrir dans Google Maps</button>
        </div>
      </div>
      ${items.map((a,idx)=>{
        const existingReport = state.interventions.find(iv=>iv.linkedRdvId===a.id);
        const openReport = existingReport ? `openIntervModal('${existingReport.id}')` : `openIntervModal(null, '${a.id}')`;
        const isActive = a.status !== 'Annulé' && a.status !== 'Terminé';
        const metaParts = [
          a.address ? `<a href="${wazeAppUrl(fullAddress(a))}" style="color:var(--cyan);" onclick="event.stopPropagation();">📍 ${escapeHtml(fullAddress(a))}</a>` : null,
          a.phone ? `<a href="tel:${escapeHtml(a.phone)}" style="color:var(--cyan);text-decoration:none;" onclick="event.stopPropagation();">📞 ${escapeHtml(a.phone)}</a>` : null,
          a.email ? `<a href="mailto:${escapeHtml(a.email)}" style="color:var(--cyan);text-decoration:none;" onclick="event.stopPropagation();">✉️ ${escapeHtml(a.email)}</a>` : null,
        ].filter(Boolean);
        return `
        <div class="item-row">
          <div class="item-main" style="cursor:pointer;" onclick="${openReport}" title="${existingReport ? 'Modifier le rapport' : 'Créer le rapport'}">
            <div class="title">${a.dossierNumber?`<span style="color:var(--cyan);">${escapeHtml(a.dossierNumber)}</span> — `:''}${escapeHtml(a.clientName)} <span class="badge ${statusBadgeClass(a.status)}">${escapeHtml(a.status)}</span></div>
            ${metaParts.length ? `<div class="meta">${metaParts.join(' · ')}</div>` : ''}
          </div>
          <div class="item-actions" style="align-items:center;">
            ${isActive ? `
              <button class="btn btn-ghost btn-small" title="Monter" onclick="movePlanItem('${dateStr}','${escapeHtml(groupName)}',${idx},-1)" ${idx===0?'disabled':''}>▲</button>
              <button class="btn btn-ghost btn-small" title="Descendre" onclick="movePlanItem('${dateStr}','${escapeHtml(groupName)}',${idx},1)" ${idx===items.length-1?'disabled':''}>▼</button>
            ` : ''}
            <button class="btn btn-ghost btn-small" onclick="replanifyRdv('${a.id}')">🔁 Replanifier</button>
            <button class="btn btn-ghost btn-small" onclick="openDevisModal(null, '${a.id}')">📄 Créer un devis</button>
            ${isActive ? `<button class="btn btn-danger btn-small" onclick="cancelPlanItem('${a.id}')">❌ Annuler</button>` : ''}
            ${a.status==='Annulé' ? `<button class="btn btn-danger btn-small" onclick="deleteRdv('${a.id}')">🗑️ Supprimer</button>` : ''}
          </div>
        </div>
      `;}).join('')}
    </div>
  `;
}

async function movePlanItem(dateStr, groupName, idx, direction){
  const list = confirmedForDate(dateStr).sort((a,b)=>{
    const pa = (a.planOrder===undefined || a.planOrder===null) ? 999 : a.planOrder;
    const pb = (b.planOrder===undefined || b.planOrder===null) ? 999 : b.planOrder;
    if(pa !== pb) return pa - pb;
    return (a.dossierNumber||'').localeCompare(b.dossierNumber||'');
  }).filter(a=>groupLabel(a)===groupName);

  const targetIdx = idx + direction;
  if(targetIdx < 0 || targetIdx >= list.length) return;
  const tmp = list[idx];
  list[idx] = list[targetIdx];
  list[targetIdx] = tmp;

  const backup = state.appointments.map(a=>({id:a.id, planOrder:a.planOrder}));
  list.forEach((a, i)=>{ a.planOrder = i; });

  const ok = await saveState(state);
  if(!ok){
    backup.forEach(b=>{ const a = state.appointments.find(x=>x.id===b.id); if(a) a.planOrder = b.planOrder; });
    return;
  }
  renderDayDetail(dateStr);
}

// Purement informatif : ne touche jamais au statut du RDV ni à son archivage.
// Le rendez-vous reste dans le calendrier de Planning quelle que soit la valeur
// choisie ici (y compris "Terminé" ou "Rendez-vous annulé") — seul le rapport
// d'intervention passé en "Terminé" part dans Dossiers, et seul le bouton
// "❌ Annuler" retire réellement un RDV du calendrier.


// Annule le rendez-vous : passe son statut à "Annulé" (affiché en rouge), reste
// visible dans le calendrier à sa date d'origine. La place réservée côté site est
// libérée immédiatement pour redevenir disponible.
async function cancelPlanItem(id){
  const a = state.appointments.find(x=>x.id===id);
  if(!a) return;
  if(!confirm("Annuler ce rendez-vous ? Il restera visible dans le calendrier avec le statut \"Annulé\", et la place redeviendra disponible sur le site.")) return;
  const backup = { status: a.status, archivedAt: a.archivedAt, bookingId: a.bookingId };
  a.status = 'Annulé';
  const ok = await saveState(state);
  if(!ok){ Object.assign(a, backup); return; }
  releaseBookingSlot(a.bookingId);
  a.bookingId = null;
  renderNavbar('planning', state);
  renderPlanGrid();
  renderDayDetail(planSelectedDate);
  showToast("Rendez-vous annulé — la place est de nouveau disponible sur le site.");
}

async function optimizeGroup(dateStr, groupName){
  const items = confirmedForDate(dateStr).filter(a=>groupLabel(a)===groupName);
  if(items.length < 2){ showToast("Pas assez de rendez-vous dans ce groupe pour optimiser."); return; }
  showToast("Calcul de l'itinéraire le plus court…");
  try{
    const stops = items.map(a=>({ id:a.id, address:a.address })).filter(s=>s.address);
    if(stops.length < 2){ showToast("Adresses manquantes, impossible d'optimiser."); return; }
    const startAddress = (state.settings.startAddress||'').trim();
    const result = await optimizeRoute(stops, startAddress);
    result.order.forEach((id, idx)=>{
      const a = state.appointments.find(x=>x.id===id);
      if(a) a.planOrder = idx;
    });
    const ok = await saveState(state);
    if(!ok) return;
    renderDayDetail(dateStr);
    let msg = "Itinéraire optimisé (~"+result.totalKm+" km à vol d'oiseau).";
    if(result.unresolved.length) msg += " "+result.unresolved.length+" adresse(s) non localisée(s), laissée(s) en fin de liste.";
    showToast(msg);
  }catch(e){
    showToast("Erreur d'optimisation : "+e.message);
  }
}

/* ═══════════ Rapports d'intervention (fusionnés depuis l'ancien onglet Interventions) ═══════════ */

function deviceSummary(i){
  const devices = i.devices || [];
  if(!devices.length) return escapeHtml(i.applianceType||'');
  const first = devices[0];
  const label = [first.applianceType, first.brand, first.model].filter(Boolean).join(' ');
  return escapeHtml(label) + (devices.length>1 ? ` <span style="color:var(--text-light);">(+${devices.length-1} autre${devices.length>2?'s':''})</span>` : '');
}

function newDevice(){
  return { id:uid(), applianceType:state.settings.applianceTypes[0]||'', brand:'', model:'', serialNumber:'', clientSymptom:'', diagnosis:'', workDone:'', needsPart:false, irreparable:false, insuranceComment:'', forfaitPrice:'', forfaitPaid:false, partsPrices:[], amount:'', partsNeeded:'', photos:[], plateePhoto:null, plateePhotoSource:null };
}

/* ═══════════ Devis ═══════════ */

function newDevisItem(applianceType){
  const forfaits = state.settings.forfaits || [];
  let forfait = forfaits[0];
  if(applianceType && state.settings.applianceForfaitMap && state.settings.applianceForfaitMap[applianceType]){
    const mapped = forfaits.find(f=>f.label === state.settings.applianceForfaitMap[applianceType]);
    if(mapped) forfait = mapped;
  }
  return { id: uid(), description: forfait?forfait.label:'', detail: '', qty: 1, unitPrice: forfait?forfait.amount:0, tvaRate: 0 };
}

function computeDevisTotals(devis){
  let totalHT = 0;
  (devis.items||[]).forEach(it=>{ totalHT += (Number(it.unitPrice)||0) * (Number(it.qty)||1); });
  const afterDiscount = Math.max(0, totalHT - (Number(devis.discount)||0));
  let totalTVA = 0;
  (devis.items||[]).forEach(it=>{
    const lineHT = (Number(it.unitPrice)||0) * (Number(it.qty)||1);
    const share = totalHT > 0 ? lineHT / totalHT : 0;
    totalTVA += afterDiscount * share * ((Number(it.tvaRate)||0)/100);
  });
  return { totalHT, totalTVA, totalTTC: afterDiscount + totalTVA };
}

function openDevisModal(id, preLinkRdvId){
  const editing = id ? state.devis.find(d=>d.id===id) : null;
  let devis;
  if(editing){
    devis = JSON.parse(JSON.stringify(editing));
    if(!devis.items) devis.items = [];
    if(!devis.firstName && !devis.lastName && devis.clientName){
      const split = splitName(devis.clientName);
      devis.firstName = split.firstName;
      devis.lastName = split.lastName;
    }
  } else {
    const today = todayISO();
    const validity = state.settings.devisValidityDays || 30;
    const preRdv = preLinkRdvId ? state.appointments.find(a=>a.id===preLinkRdvId) : null;
    devis = {
      id: uid(), devisNumber: nextDevisNumber(state), linkedRdvId: null, dossierNumber: '',
      firstName:'', lastName:'', clientName:'', email:'', phone:'',
      address:'', postalCode:'', city:'',
      issueDate: today,
      expiryDate: addDaysISO(today, validity),
      items: [],
      discount: 0,
      comment: '',
      status: 'Brouillon',
      publicToken: null,
      vatNote: (state.settings.company && state.settings.company.vatNote) || '',
      signature:null, signedAt:null, signedByEmail:null, signedIp:null, refusedAt:null
    };
    if(preLinkRdvId){
      const rdv = state.appointments.find(a=>a.id===preLinkRdvId);
      if(rdv){
        devis.linkedRdvId = rdv.id;
        devis.dossierNumber = rdv.dossierNumber || '';
        if(rdv.firstName || rdv.lastName){
          devis.firstName = rdv.firstName || '';
          devis.lastName = rdv.lastName || '';
        } else {
          const split = splitName(rdv.clientName);
          devis.firstName = split.firstName;
          devis.lastName = split.lastName;
        }
        devis.clientName = rdv.clientName || '';
        devis.email = rdv.email || '';
        devis.phone = rdv.phone || '';
        devis.address = rdv.address || '';
        devis.postalCode = rdv.postalCode || '';
        devis.city = rdv.city || '';
        if((rdv.applianceType || rdv.brand || rdv.model) && devis.items[0]){
          devis.items[0].detail = [rdv.applianceType, rdv.brand, rdv.model].filter(Boolean).join(' — ');
        }
      }
    }
  }

  const modalRoot = document.getElementById('modalRoot');
  const readOnly = ['Accepté','Refusé'].includes(devis.status);

  function itemRowHtml(it, idx){
    return `
      <div class="item-row" data-item-id="${it.id}" style="align-items:flex-start;flex-wrap:wrap;">
        <div class="item-main" style="display:flex;gap:.6rem;flex-wrap:wrap;">
          <div class="field" style="min-width:220px;flex:2;"><label>Forfait / Description</label>
            <select class="devisItemForfait" data-idx="${idx}" ${readOnly?'disabled':''}>
              ${state.settings.forfaits.map(f=>`<option value="${escapeHtml(f.label)}" data-amount="${f.amount}" ${it.description===f.label?'selected':''}>${escapeHtml(f.label)}</option>`).join('')}
              <option value="__custom__" ${!state.settings.forfaits.some(f=>f.label===it.description)?'selected':''}>Personnalisé…</option>
            </select>
            <input class="devisItemDescCustom" data-idx="${idx}" value="${escapeHtml(it.description||'')}" placeholder="Description libre" style="margin-top:.4rem;display:${!state.settings.forfaits.some(f=>f.label===it.description)?'block':'none'};" ${readOnly?'disabled':''}>
          </div>
          <div class="field" style="min-width:160px;flex:1;"><label>Détail (appareil)</label><input class="devisItemDetail" data-idx="${idx}" value="${escapeHtml(it.detail||'')}" placeholder="Ex : Lave-vaisselle Whirlpool" ${readOnly?'disabled':''}></div>
          <div class="field" style="width:70px;"><label>Qté</label><input type="number" min="1" class="devisItemQty" data-idx="${idx}" value="${it.qty||1}" ${readOnly?'disabled':''}></div>
          <div class="field" style="width:100px;"><label>Prix U. (€)</label><input type="number" step="0.01" class="devisItemPrice" data-idx="${idx}" value="${it.unitPrice||0}" ${readOnly?'disabled':''}></div>
          <div class="field" style="width:80px;"><label>TVA (%)</label><input type="number" step="0.1" class="devisItemTva" data-idx="${idx}" value="${it.tvaRate||0}" ${readOnly?'disabled':''}></div>
        </div>
        ${!readOnly ? `<button type="button" class="btn btn-danger btn-small" onclick="removeDevisItem(${idx})">🗑️</button>` : ''}
      </div>
    `;
  }

  function renderItems(){
    document.getElementById('devisItemsList').innerHTML = devis.items.map((it,idx)=>itemRowHtml(it,idx)).join('');
    bindItemEvents();
    updateDevisTotalsDisplay();
  }

  function bindItemEvents(){
    document.querySelectorAll('.devisItemForfait').forEach(sel=>{
      sel.onchange = (e)=>{
        const idx = Number(e.target.dataset.idx);
        const opt = e.target.selectedOptions[0];
        const customInput = document.querySelector('.devisItemDescCustom[data-idx="'+idx+'"]');
        if(opt.value === '__custom__'){
          customInput.style.display = 'block';
          devis.items[idx].description = customInput.value.trim();
        } else {
          customInput.style.display = 'none';
          devis.items[idx].description = opt.value;
          devis.items[idx].unitPrice = Number(opt.dataset.amount)||0;
          document.querySelector('.devisItemPrice[data-idx="'+idx+'"]').value = devis.items[idx].unitPrice;
        }
        updateDevisTotalsDisplay();
      };
    });
    document.querySelectorAll('.devisItemDescCustom').forEach(inp=>{
      inp.oninput = (e)=>{ devis.items[Number(e.target.dataset.idx)].description = e.target.value.trim(); };
    });
    document.querySelectorAll('.devisItemDetail').forEach(inp=>{
      inp.oninput = (e)=>{ devis.items[Number(e.target.dataset.idx)].detail = e.target.value.trim(); };
    });
    document.querySelectorAll('.devisItemQty, .devisItemPrice, .devisItemTva').forEach(inp=>{
      inp.oninput = (e)=>{
        const idx = Number(e.target.dataset.idx);
        if(e.target.classList.contains('devisItemQty')) devis.items[idx].qty = Number(e.target.value)||1;
        if(e.target.classList.contains('devisItemPrice')) devis.items[idx].unitPrice = Number(e.target.value)||0;
        if(e.target.classList.contains('devisItemTva')) devis.items[idx].tvaRate = Number(e.target.value)||0;
        updateDevisTotalsDisplay();
      };
    });
  }

  window.removeDevisItem = function(idx){
    if(devis.items.length <= 1){ showToast("Il faut au moins une ligne."); return; }
    devis.items.splice(idx,1);
    renderItems();
  };

  function updateDevisTotalsDisplay(){
    const t = computeDevisTotals(devis);
    const box = document.getElementById('devisTotalsBox');
    if(!box) return;
    box.innerHTML = `
      <div style="display:flex;justify-content:space-between;font-size:.9rem;margin-bottom:.3rem;"><span>Total HT</span><span>${money(t.totalHT)}</span></div>
      ${devis.discount ? `<div style="display:flex;justify-content:space-between;font-size:.9rem;margin-bottom:.3rem;color:var(--text-light);"><span>Remise</span><span>- ${money(devis.discount)}</span></div>` : ''}
      <div style="display:flex;justify-content:space-between;font-size:.9rem;margin-bottom:.3rem;"><span>TVA</span><span>${money(t.totalTVA)}</span></div>
      <div style="display:flex;justify-content:space-between;align-items:center;"><span style="font-family:'Rajdhani',sans-serif;font-weight:700;text-transform:uppercase;">Total TTC</span><span style="font-family:'Rajdhani',sans-serif;font-weight:700;font-size:1.3rem;color:var(--cyan);">${money(t.totalTTC)}</span></div>
    `;
    const mentionsBox = document.getElementById('devisMentionsPreview');
    if(mentionsBox){
      const applicable = getApplicableMentions(devis.items);
      mentionsBox.innerHTML = applicable.length ? `
        <div style="font-size:.78rem;color:var(--text-light);text-transform:uppercase;letter-spacing:.03em;margin-bottom:.4rem;">Mentions qui apparaîtront sur ce devis</div>
        ${applicable.map(m=>`<div style="font-size:.85rem;margin-bottom:.4rem;"><strong>${escapeHtml(m.label||'')}</strong>${m.text?' — '+escapeHtml(m.text):''}</div>`).join('')}
      ` : '';
    }
  }

  modalRoot.innerHTML = `
    <div class="modal-overlay" id="devisOverlay">
      <div class="modal">
        <h3>${editing?'Modifier le':'Nouveau'} devis ${devis.devisNumber?`— <span style="color:var(--cyan);">${escapeHtml(devis.devisNumber)}</span>`:''}</h3>
        ${devis.status && devis.status!=='Brouillon' ? `<span class="badge ${statusBadgeClass(devis.status)}" style="margin-bottom:1rem;display:inline-block;">${devis.status}</span>` : ''}
        <div class="modal-row">
          <div class="field"><label>Prénom</label><input id="devFirstName" value="${escapeHtml(devis.firstName||'')}" ${readOnly?'disabled':''}></div>
          <div class="field"><label>Nom</label><input id="devLastName" value="${escapeHtml(devis.lastName||'')}" ${readOnly?'disabled':''}></div>
        </div>
        <div class="modal-row">
          <div class="field"><label>Email (obligatoire pour l'envoi)</label><input type="email" id="devEmail" value="${escapeHtml(devis.email||'')}" ${readOnly?'disabled':''}></div>
          <div class="field"><label>Téléphone</label><input id="devPhone" value="${escapeHtml(devis.phone||'')}" ${readOnly?'disabled':''}></div>
        </div>
        <div class="field"><label>Adresse</label><input id="devAddress" value="${escapeHtml(devis.address||'')}" ${readOnly?'disabled':''}></div>
        <div class="modal-row">
          <div class="field"><label>Code postal</label><input id="devPostalCode" value="${escapeHtml(devis.postalCode||'')}" ${readOnly?'disabled':''}></div>
          <div class="field"><label>Ville</label><input id="devCity" value="${escapeHtml(devis.city||'')}" ${readOnly?'disabled':''}></div>
        </div>
        <div class="modal-row">
          <div class="field"><label>Date d'émission</label><input type="date" id="devIssueDate" value="${devis.issueDate}" ${readOnly?'disabled':''}></div>
          <div class="field"><label>Date d'expiration</label><input type="date" id="devExpiryDate" value="${devis.expiryDate}" ${readOnly?'disabled':''}></div>
        </div>

        <label style="display:block;margin:1rem 0 .5rem;font-family:'Rajdhani',sans-serif;text-transform:uppercase;font-size:.85rem;color:var(--cyan);">Lignes du devis</label>
        <div id="devisItemsList"></div>
        ${!readOnly ? `
        <div style="display:flex;gap:.6rem;flex-wrap:wrap;align-items:center;margin-top:.6rem;">
          <button type="button" class="btn btn-ghost btn-small" id="addDevisItemBtn">+ Ajouter une ligne</button>
          <select id="addDevisStockPartSelect" style="max-width:260px;">
            <option value="">+ Ajouter une pièce du stock…</option>
            ${state.stock.map(s=>`<option value="${s.id}">${escapeHtml(s.name)}${s.ref?' ('+escapeHtml(s.ref)+')':''} — ${money(s.sellPrice)}</option>`).join('')}
          </select>
        </div>` : ''}

        <div class="field" style="max-width:200px;margin-top:1rem;"><label>Remise (€)</label><input type="number" step="0.01" id="devDiscount" value="${devis.discount||''}" placeholder="0" ${readOnly?'disabled':''}></div>
        <div class="field" style="margin-top:1rem;"><label>Commentaire (optionnel) — ex : remise prévue, condition particulière...</label><textarea id="devComment" rows="2" placeholder="Ex : remise de 10% prévue si paiement comptant" ${readOnly?'disabled':''}>${escapeHtml(devis.comment||'')}</textarea></div>
        <div id="devisMentionsPreview" style="margin-top:.8rem;"></div>

        <div id="devisTotalsBox" style="margin-top:1rem;background:rgba(0,180,216,.08);border:1px solid rgba(0,180,216,.3);border-radius:10px;padding:1rem 1.2rem;"></div>

        ${devis.status==='Accepté' ? `
          <div class="gateway-box" style="margin-top:1rem;">
            <strong>✅ Devis accepté et signé.</strong><br>
            Le ${fmtDate(devis.signedAt?devis.signedAt.slice(0,10):'')} à ${devis.signedAt?new Date(devis.signedAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):''} par ${escapeHtml(devis.signedByEmail||'')}${devis.signedIp?' (IP '+escapeHtml(devis.signedIp)+')':''}.
          </div>
        ` : ''}
        ${devis.status==='Refusé' ? `<div class="gateway-box" style="margin-top:1rem;"><strong>❌ Devis refusé</strong> le ${fmtDate(devis.refusedAt?devis.refusedAt.slice(0,10):'')}.</div>` : ''}

        <div class="modal-footer">
          <button class="btn btn-ghost" id="devPdfBtn">📄 Télécharger le PDF</button>
          ${!readOnly ? `<button class="btn btn-ghost" id="devSendBtn">✉️ Envoyer au client</button>` : ''}
          <button class="btn btn-primary" style="width:auto" id="devCancel">Fermer</button>
        </div>
      </div>
    </div>
  `;

  renderItems();

  if(!readOnly){
    document.getElementById('addDevisItemBtn').onclick = ()=>{ devis.items.push(newDevisItem()); renderItems(); };
    const stockPartSelect = document.getElementById('addDevisStockPartSelect');
    if(stockPartSelect){
      stockPartSelect.onchange = (e)=>{
        const stockId = e.target.value;
        if(!stockId) return;
        const part = state.stock.find(s=>s.id===stockId);
        if(part){
          devis.items.push({ id: uid(), description: part.name + (part.ref?' ('+part.ref+')':''), detail: 'Pièce', qty: 1, unitPrice: Number(part.sellPrice)||0, tvaRate: 0 });
          renderItems();
        }
        e.target.value = '';
      };
    }
    document.getElementById('devDiscount').oninput = (e)=>{ devis.discount = Number(e.target.value)||0; updateDevisTotalsDisplay(); };
  }

  function syncFormIntoDevis(){
    devis.firstName = document.getElementById('devFirstName').value.trim();
    devis.lastName = document.getElementById('devLastName').value.trim();
    devis.clientName = (devis.firstName+' '+devis.lastName).trim();
    devis.email = document.getElementById('devEmail').value.trim();
    devis.phone = document.getElementById('devPhone').value.trim();
    devis.address = document.getElementById('devAddress').value.trim();
    devis.postalCode = document.getElementById('devPostalCode').value.trim();
    devis.city = document.getElementById('devCity').value.trim();
    devis.issueDate = document.getElementById('devIssueDate').value;
    devis.expiryDate = document.getElementById('devExpiryDate').value;
    devis.discount = Number(document.getElementById('devDiscount').value)||0;
    devis.comment = document.getElementById('devComment').value.trim();
    const totals = computeDevisTotals(devis);
    devis.totalHT = totals.totalHT;
    devis.totalTVA = totals.totalTVA;
    devis.totalTTC = totals.totalTTC;
  }

  async function persistDevis(){
    if(!devis.devisNumber) devis.devisNumber = nextDevisNumber(state);
    syncFormIntoDevis();
    const backup = JSON.parse(JSON.stringify(state.devis));
    const idx = state.devis.findIndex(d=>d.id===devis.id);
    if(idx>=0) state.devis[idx] = JSON.parse(JSON.stringify(devis));
    else state.devis.push(JSON.parse(JSON.stringify(devis)));
    const ok = await saveState(state);
    if(!ok){ state.devis = backup; return false; }
    return true;
  }

  document.getElementById('devCancel').onclick = async ()=>{
    if(readOnly){ closeModal(); return; }
    syncFormIntoDevis();
    const firstName = document.getElementById('devFirstName').value.trim();
    const lastName = document.getElementById('devLastName').value.trim();
    const hasContent = firstName || lastName
      || (devis.comment||'').trim()
      || (devis.items||[]).some(it=>(it.description||'').trim() || Number(it.amount)>0);
    const isNew = !state.devis.some(d=>d.id===devis.id);
    if(isNew && !hasContent){ closeModal(); return; }
    if(!firstName && !lastName){ showToast("Le prénom ou le nom du client est requis."); return; }
    const ok = await persistDevis();
    if(!ok) return;
    closeModal();
    showToast("Devis enregistré.");
  };
  document.getElementById('devPdfBtn').onclick = async ()=>{
    syncFormIntoDevis();
    await downloadDevisPdf(devis, state.settings.company);
  };

  if(!readOnly){
    document.getElementById('devSendBtn').onclick = async ()=>{
      if(!document.getElementById('devEmail').value.trim()){
        showToast("Renseignez l'email du client avant d'envoyer.");
        return;
      }
      syncFormIntoDevis();
      if(!devis.publicToken){
        devis.publicToken = (crypto.randomUUID ? crypto.randomUUID() : uid()+uid()+uid()).replace(/-/g,'');
      }
      devis.status = 'Envoyé';
      const ok = await persistDevis();
      if(!ok) return;
      const sent = await sendDevisToClient(devis, state.settings.company);
      if(sent){
        closeModal();
      }
    };
  }
}


function openIntervModal(id, preLinkRdvId, returnToDossiers, presetDossierNumber){
  const editing = id ? state.interventions.find(i=>i.id===id) : null;
  let i;
  if(editing){
    i = JSON.parse(JSON.stringify(editing));
    // Migration silencieuse des rapports créés avant la gestion multi-appareils.
    if(!i.devices || !i.devices.length){
      i.devices = [{
        id: uid(), applianceType: i.applianceType||'', brand: i.brand||'', model: i.model||'', serialNumber:'',
        diagnosis: i.diagnosis||'', workDone: i.workDone||'', needsPart:false, irreparable: i.passageType==='Irréparable',
        insuranceComment:'', forfait: i.forfait||'', amount: i.amount||'', partsUsed: i.partsUsed||[],
        photos: i.photos || [], plateePhoto: null, plateePhotoSource: null
      }];
    } else if(i.photos && i.photos.length && !i.devices.some(d=>d.photos && d.photos.length)){
      // Rapports migrés une première fois avant l'ajout des photos par appareil :
      // les anciennes photos globales atterrissent sur le premier appareil.
      i.devices[0].photos = i.photos;
    }
    i.devices.forEach(d=>{ d.photos = d.photos || []; });
    if(!i.firstName && !i.lastName && i.clientName){
      const split = splitName(i.clientName);
      i.firstName = split.firstName;
      i.lastName = split.lastName;
    }
    migrateInterventionStatus(i);
    (i.devices||[]).forEach(d=>migrateDeviceResult(d, i.paymentReceived));
    if(i.paymentReceived===undefined) i.paymentReceived = false;
  } else {
    i = {
      id:uid(), firstName:'', lastName:'', clientName:'', phone:'', email:'', address:'', postalCode:'', city:'', date:todayISO(),
      status:'À faire', timeSpent:'', amount:'', discount:'', observations:'', devices:[newDevice()],
      signature:'', linkedRdvId:null, paymentReceived:false, dossierNumber: presetDossierNumber || ''
    };
  }
  let newlyUploadedIds = [];
  let activeDeviceIdx = 0;
  // État réellement déduit du stock à l'ouverture du formulaire (avant toute modification) :
  // sert de référence pour restituer proprement le stock au moment d'enregistrer, quel que
  // soit le nombre de fois où on a changé d'appareil dans le sélecteur entre-temps.
  const originalDevicesSnapshot = JSON.parse(JSON.stringify(i.devices||[]));
  let savedThisSession = false; // évite de nettoyer les photos si un enregistrement a déjà eu lieu
  const modalRoot = document.getElementById('modalRoot');
  modalRoot.innerHTML = `
    <div class="modal-overlay" id="intervOverlay">
      <div class="modal">
        <h3>${editing?'Modifier le':'Nouveau'} rapport d'intervention</h3>
        ${editing ? `<div class="field"><label>Numéro de dossier</label><input id="iDossierNumber" value="${escapeHtml(i.dossierNumber||'')}" placeholder="Ex : ACS-2026-07-001"></div>` : ''}
        ${!editing ? `
        <div class="field">
          <label>Lier à un rendez-vous existant (pré-remplit les coordonnées)</label>
          <select id="iLinkRdv">
            <option value="">— Aucun / saisie manuelle —</option>
            ${[...state.appointments].sort((a,b)=>b.date.localeCompare(a.date)).map(a=>`<option value="${a.id}">${fmtDate(a.date)} — ${escapeHtml(a.clientName)} (${escapeHtml(a.applianceType||'')})${a.dossierNumber?' — '+escapeHtml(a.dossierNumber):''}</option>`).join('')}
          </select>
        </div>` : ''}
        <div class="modal-row">
          <div class="field"><label>Prénom</label><input id="iFirstName" value="${escapeHtml(i.firstName||'')}"></div>
          <div class="field"><label>Nom</label><input id="iLastName" value="${escapeHtml(i.lastName||'')}"></div>
        </div>
        <div class="modal-row">
          <div class="field"><label>Téléphone</label><input id="iPhone" value="${escapeHtml(i.phone)}"></div>
          <div class="field"><label>Email</label><input type="email" id="iEmail" value="${escapeHtml(i.email||'')}"></div>
        </div>
        <div class="field"><label>Adresse d'intervention</label><input id="iAddress" value="${escapeHtml(i.address||'')}"></div>
        <div class="modal-row">
          <div class="field"><label>Code postal</label><input id="iPostalCode" value="${escapeHtml(i.postalCode||'')}"></div>
          <div class="field"><label>Ville</label><input id="iCity" value="${escapeHtml(i.city||'')}"></div>
        </div>
        <div class="field">
          <button type="button" class="btn btn-ghost btn-small" id="iWazeBtn">🧭 Ouvrir l'adresse dans Waze</button>
        </div>
        <div class="modal-row">
          <div class="field"><label>Date d'intervention</label><input type="date" id="iDate" value="${i.date}"></div>
          <div class="field"><label>Statut</label><select id="iStatus">${INTERV_STATUSES.map(s=>`<option ${s===i.status?'selected':''}>${s}</option>`).join('')}</select></div>
        </div>

        <h4 style="font-family:'Rajdhani',sans-serif;text-transform:uppercase;color:var(--cyan);margin:1.2rem 0 .6rem;">Appareils concernés</h4>
        <div style="display:flex;gap:.5rem;align-items:center;margin-bottom:.8rem;">
          <select id="deviceSelector" style="flex:1;"></select>
          <button type="button" class="btn btn-ghost btn-small" id="addDeviceBtn" title="Ajouter un appareil" style="white-space:nowrap;">+ Ajouter</button>
        </div>
        <div id="devicesContainer"></div>

        <div class="field"><label>Montant total</label><div id="iTotalDisplay" style="padding:.7rem .8rem;font-family:'Rajdhani',sans-serif;font-weight:700;font-size:1.1rem;"></div></div>
        <div class="field"><label>Signature du client</label>
          <div style="display:flex;align-items:center;gap:.8rem;flex-wrap:wrap;">
            <button type="button" class="btn btn-ghost" id="sigOpenBtn">${i.signature ? '✍️ Modifier la signature' : '✍️ Recueillir la signature'}</button>
            <span id="sigSignedPill" class="payment-pill payment-pill-paid" style="display:${i.signature?'inline-flex':'none'};">✅ Rapport signé par client</span>
          </div>
        </div>
        <label id="reviewRequestLabel" style="display:flex;align-items:center;gap:.5rem;font-size:.88rem;margin-top:.8rem;cursor:pointer;">
          <input type="checkbox" id="iSendReviewRequest"> Envoyer aussi une demande d'avis Google au client
        </label>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="iPdfBtn">📄 Télécharger le PDF</button>
          <button class="btn btn-ghost" id="iSendBtn">✉️ Envoyer au client</button>
          ${(i.status==='Terminé' && i.dossierNumber && state.deposits.some(dep=>dep.dossierNumber===i.dossierNumber && dep.status!=='Récupéré')) ? `<button class="btn btn-primary" style="width:auto" id="iValidatePickup">✅ Valider la remise</button>` : ''}
          ${(()=>{
            const needsPart = (i.devices||[]).some(d=>d.needsPart);
            if(!needsPart) return '';
            const existingDevis = i.dossierNumber ? (state.devis||[]).find(d=>d.dossierNumber===i.dossierNumber) : null;
            return existingDevis
              ? `<button type="button" class="btn btn-ghost" id="iOpenDevisBtn" data-devis-id="${existingDevis.id}">📄 Modifier le devis (pièce)</button>`
              : `<button type="button" class="btn btn-ghost" id="iOpenDevisBtn">📄 Créer un devis (pièce)</button>`;
          })()}
          <button class="btn btn-primary" style="width:auto" id="iCancel">Fermer</button>
        </div>
      </div>
    </div>
  `;

  function deviceCardHtml(d, idx){
    return `
      <div class="device-card" data-device-index="${idx}" style="border:1px solid var(--border);border-radius:10px;padding:1rem;margin-bottom:1rem;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.8rem;">
          <strong style="color:var(--cyan);">Appareil ${idx+1}</strong>
          ${i.devices.length>1 ? `<button type="button" class="btn btn-danger btn-small" onclick="removeDeviceCard(${idx})">Supprimer cet appareil</button>` : ''}
        </div>
        <div class="modal-row">
          <div class="field"><label>Type d'appareil</label><select class="devApplianceType" data-idx="${idx}">${state.settings.applianceTypes.map(t=>`<option ${t===d.applianceType?'selected':''}>${t}</option>`).join('')}</select></div>
          <div class="field"><label>Marque</label>
            <input class="devBrand" data-idx="${idx}" list="devBrandList${idx}" value="${escapeHtml(d.brand||'')}" placeholder="Ex : Bosch">
            <datalist id="devBrandList${idx}">${state.settings.brands.map(b=>`<option value="${escapeHtml(b)}">`).join('')}</datalist>
          </div>
        </div>
        <div class="modal-row">
          <div class="field"><label>Modèle</label><input class="devModel" data-idx="${idx}" value="${escapeHtml(d.model||'')}" placeholder="Ex : WAE24467FF"></div>
          <div class="field"><label>N° de série</label><input class="devSerial" data-idx="${idx}" value="${escapeHtml(d.serialNumber||'')}"></div>
        </div>
        <div class="field">
          <label>Photo de la plaque signalétique</label>
          <div class="devPlatePhotoBox" data-idx="${idx}" style="border:1px solid var(--border);border-radius:10px;padding:.9rem;"></div>
        </div>
        <div class="field"><label>Symptôme client</label><textarea class="devClientSymptom" data-idx="${idx}">${escapeHtml(d.clientSymptom||'')}</textarea></div>
        <div class="field"><label>Diagnostic</label><textarea class="devDiagnosis" data-idx="${idx}">${escapeHtml(d.diagnosis||'')}</textarea></div>
        <div class="field"><label>Réparation effectuée</label><textarea class="devWorkDone" data-idx="${idx}">${escapeHtml(d.workDone||'')}</textarea></div>
        <div class="field">
          <label style="display:flex;align-items:center;gap:.5rem;cursor:pointer;">
            <input type="checkbox" class="devNeedsPart" data-idx="${idx}" ${d.needsPart?'checked':''} style="width:auto;">
            Besoin de pièce
          </label>
        </div>
        <div class="field">
          <label style="display:flex;align-items:center;gap:.5rem;cursor:pointer;">
            <input type="checkbox" class="devIrreparable" data-idx="${idx}" ${d.irreparable?'checked':''} style="width:auto;">
            Irréparable
          </label>
        </div>
        <div class="field devInsuranceField" data-idx="${idx}" style="display:${d.irreparable?'block':'none'};">
          <label>Commentaire pour l'assurance</label>
          <textarea class="devInsuranceComment" data-idx="${idx}" placeholder="Motif détaillé de non-réparabilité (pièces indisponibles, coût disproportionné, dommage structurel…)">${escapeHtml(d.insuranceComment||'')}</textarea>
        </div>
        <div class="field">
          <label>Besoins en pièces à commander <span style="font-weight:400;font-size:.8em;color:var(--text-light);">(nom, référence, quantité...)</span></label>
          <textarea class="devPartsNeeded" data-idx="${idx}" placeholder="Ex : Pompe de vidange réf. XYZ123 x1, thermostat...">${escapeHtml(d.partsNeeded||'')}</textarea>
        </div>
        <div class="field"><label>Prix forfait (€)</label>
          <div style="display:flex;gap:.6rem;align-items:center;flex-wrap:wrap;">
            <input type="number" step="0.01" min="0" class="devForfaitPrice" data-idx="${idx}" value="${d.forfaitPrice||''}" placeholder="0" style="flex:1;min-width:100px;">
            <label style="display:flex;align-items:center;gap:.4rem;white-space:nowrap;cursor:pointer;">
              <input type="checkbox" class="devForfaitPaid" data-idx="${idx}" ${d.forfaitPaid?'checked':''} style="width:auto;"> Payé
            </label>
          </div>
        </div>
        <div class="field">
          <label>Prix pièces</label>
          <div class="dev-parts-prices" data-idx="${idx}">${partsPricesHtml(d, idx)}</div>
          <button type="button" class="btn btn-ghost btn-small devAddPartPrice" data-idx="${idx}">+ Ajouter un prix pièce</button>
        </div>
        <div class="field"><label>Photos de cet appareil</label>
          <input type="file" class="devPhotoInput" data-idx="${idx}" accept="image/*" multiple style="margin-bottom:.6rem;">
          <div class="devPhotoGallery" data-idx="${idx}" style="display:flex;flex-wrap:wrap;gap:.6rem;"></div>
        </div>
      </div>
    `;
  }

  function partsPricesHtml(d, idx){
    if(!(d.partsPrices||[]).length) return '';
    return d.partsPrices.map((p,pIdx)=>`
      <div class="part-price-row" data-idx="${idx}" data-pidx="${pIdx}" style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;margin-bottom:.5rem;">
        <input type="text" class="devPartPriceLabel" data-idx="${idx}" data-pidx="${pIdx}" placeholder="Ex : pompe de vidange" value="${escapeHtml(p.label||'')}" style="flex:2;min-width:140px;">
        <input type="number" step="0.01" min="0" class="devPartPriceAmount" data-idx="${idx}" data-pidx="${pIdx}" placeholder="0" value="${p.amount||''}" style="width:90px;flex:0 0 auto;">
        <label style="display:flex;align-items:center;gap:.3rem;white-space:nowrap;cursor:pointer;">
          <input type="checkbox" class="devPartPricePaid" data-idx="${idx}" data-pidx="${pIdx}" ${p.paid?'checked':''} style="width:auto;"> Payé
        </label>
        <button type="button" class="btn btn-danger btn-small devPartPriceRemove" data-idx="${idx}" data-pidx="${pIdx}">✕</button>
      </div>
    `).join('');
  }

  function findRdvPlatePhoto(){
    if(!i.linkedRdvId) return null;
    const rdv = state.appointments.find(a=>a.id===i.linkedRdvId);
    if(!rdv || !rdv.photos) return null;
    return rdv.photos.find(p=>p.name==='Photo de la plaque signalétique') || null;
  }

  function renderPlatePhotoBox(idx){
    const d = i.devices[idx];
    const box = document.querySelector('.devPlatePhotoBox[data-idx="'+idx+'"]');
    if(!d || !box) return;

    if(d.plateePhoto){
      box.innerHTML = `
        <div style="display:flex;align-items:center;gap:1rem;">
          <div class="devPlatePhotoThumb" style="width:70px;height:70px;border-radius:8px;overflow:hidden;background:rgba(255,255,255,.04);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:.68rem;color:var(--text-light);">…</div>
          <button type="button" class="btn btn-danger btn-small devPlatePhotoRemove">🗑️ Retirer</button>
        </div>
      `;
      fetchPhotoDataUrl(d.plateePhoto.id).then(url=>{
        const thumb = box.querySelector('.devPlatePhotoThumb');
        if(thumb){
          thumb.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover;cursor:pointer;">`;
          thumb.onclick = ()=>openPhotoLightbox(url, d.plateePhoto.name||'plaque-signaletique.jpg');
        }
      }).catch(()=>{});
      box.querySelector('.devPlatePhotoRemove').onclick = ()=>{
        d.plateePhoto = null;
        d.plateePhotoSource = null;
        renderPlatePhotoBox(idx);
      };
      return;
    }

    const rdvPhoto = findRdvPlatePhoto();
    box.innerHTML = `
      ${rdvPhoto ? `<button type="button" class="btn btn-ghost btn-small devPlatePhotoFromRdv" style="margin-bottom:.7rem;width:100%;">📥 Récupérer la photo envoyée par le client</button>` : `<div style="font-size:.8rem;color:var(--text-light);margin-bottom:.7rem;">Aucune photo transmise par le client pour ce RDV.</div>`}
      <div style="display:flex;gap:.6rem;flex-wrap:wrap;">
        <label class="btn btn-ghost btn-small" style="cursor:pointer;flex:1;text-align:center;">📷 Prendre une photo<input type="file" accept="image/*" capture="environment" class="devPlatePhotoCamera" style="display:none;"></label>
        <label class="btn btn-ghost btn-small" style="cursor:pointer;flex:1;text-align:center;">🖼️ Depuis la galerie<input type="file" accept="image/*" class="devPlatePhotoGallery" style="display:none;"></label>
      </div>
    `;
    const fromRdvBtn = box.querySelector('.devPlatePhotoFromRdv');
    if(fromRdvBtn) fromRdvBtn.onclick = ()=>{
      d.plateePhoto = { id: rdvPhoto.id, name: rdvPhoto.name };
      d.plateePhotoSource = 'rdv'; // photo partagée avec le RDV : ne jamais la supprimer du stockage depuis le rapport
      renderPlatePhotoBox(idx);
    };
    box.querySelectorAll('.devPlatePhotoCamera, .devPlatePhotoGallery').forEach(input=>{
      input.onchange = async ()=>{
        const file = input.files[0];
        if(!file) return;
        try{
          const dataUrl = await compressImageFile(file);
          const uploadedId = await uploadPhoto(dataUrl);
          d.plateePhoto = { id: uploadedId, name: file.name };
          d.plateePhotoSource = 'upload'; // propre à ce rapport : supprimable à la purge définitive
          renderPlatePhotoBox(idx);
        }catch(err){
          showToast("Échec de l'envoi de la photo : "+err.message);
        }
      };
    });
  }

  function renderDevicesSection(){
    if(activeDeviceIdx >= i.devices.length) activeDeviceIdx = i.devices.length - 1;
    if(activeDeviceIdx < 0) activeDeviceIdx = 0;

    const selector = document.getElementById('deviceSelector');
    selector.innerHTML = i.devices.map((d,idx)=>{
      const label = [d.applianceType, d.brand].filter(Boolean).join(' — ');
      return `<option value="${idx}" ${idx===activeDeviceIdx?'selected':''}>Appareil ${idx+1}${label?' — '+escapeHtml(label):''}</option>`;
    }).join('');

    document.getElementById('devicesContainer').innerHTML = i.devices.length ? deviceCardHtml(i.devices[activeDeviceIdx], activeDeviceIdx) : '';
    renderDevicePhotoGallery(activeDeviceIdx);
    renderPlatePhotoBox(activeDeviceIdx);
    updateTotalDisplay();
  }

  function updateTotalDisplay(){
    // Synchronise d'abord l'appareil actuellement affiché (les autres sont déjà à jour
    // dans i.devices depuis le dernier changement de sélection), puis somme sur les données.
    syncDevicesFromDOM();
    let total = 0;
    i.devices.forEach(d=>{ total += Number(d.amount)||0; });
    const unpaid = i.devices.reduce((s,d)=>s+computeDeviceUnpaid(d), 0);
    const el = document.getElementById('iTotalDisplay');
    if(!el) return;
    if(unpaid > 0.001){
      el.innerHTML = `${money(total)} <span style="color:var(--danger);">— Reste à payer : ${money(unpaid)}</span>`;
    } else {
      el.innerHTML = `<span style="color:var(--cyan);">${money(total)}</span>`;
    }
  }

  function syncDevicesFromDOM(){
    document.querySelectorAll('.device-card').forEach(card=>{
      const idx = Number(card.dataset.deviceIndex);
      const d = i.devices[idx];
      if(!d) return;
      d.applianceType = card.querySelector('.devApplianceType').value;
      d.brand = card.querySelector('.devBrand').value.trim();
      d.model = card.querySelector('.devModel').value.trim();
      d.serialNumber = card.querySelector('.devSerial').value.trim();
      d.clientSymptom = card.querySelector('.devClientSymptom').value.trim();
      d.diagnosis = card.querySelector('.devDiagnosis').value.trim();
      d.workDone = card.querySelector('.devWorkDone').value.trim();
      d.needsPart = card.querySelector('.devNeedsPart').checked;
      d.irreparable = card.querySelector('.devIrreparable').checked;
      const insEl = card.querySelector('.devInsuranceComment');
      d.insuranceComment = insEl ? insEl.value.trim() : (d.insuranceComment||'');
      const forfaitPriceEl = card.querySelector('.devForfaitPrice');
      d.forfaitPrice = forfaitPriceEl ? forfaitPriceEl.value : (d.forfaitPrice||'');
      const forfaitPaidEl = card.querySelector('.devForfaitPaid');
      d.forfaitPaid = forfaitPaidEl ? forfaitPaidEl.checked : !!d.forfaitPaid;
      d.partsPrices = (d.partsPrices||[]).map((p, pIdx)=>{
        const labelEl = card.querySelector('.devPartPriceLabel[data-pidx="'+pIdx+'"]');
        const amountEl = card.querySelector('.devPartPriceAmount[data-pidx="'+pIdx+'"]');
        const paidEl = card.querySelector('.devPartPricePaid[data-pidx="'+pIdx+'"]');
        return {
          id: p.id,
          label: labelEl ? labelEl.value.trim() : (p.label||''),
          amount: amountEl ? amountEl.value : (p.amount||''),
          paid: paidEl ? paidEl.checked : !!p.paid
        };
      });
      d.amount = computeDeviceAmount(d);
      const partsNeededEl = card.querySelector('.devPartsNeeded');
      d.partsNeeded = partsNeededEl ? partsNeededEl.value.trim() : (d.partsNeeded||'');
    });
  }

  renderDevicesSection();

  document.getElementById('deviceSelector').onchange = (e)=>{
    syncDevicesFromDOM();
    activeDeviceIdx = Number(e.target.value);
    renderDevicesSection();
  };

  document.getElementById('addDeviceBtn').onclick = ()=>{
    syncDevicesFromDOM();
    i.devices.push(newDevice());
    activeDeviceIdx = i.devices.length - 1;
    renderDevicesSection();
  };
  window.removeDeviceCard = function(idx){
    syncDevicesFromDOM();
    i.devices.splice(idx,1);
    renderDevicesSection();
  };

  // Délégation : gère le calcul auto du montant depuis le forfait, l'affichage du
  // commentaire assurance, et le total en direct — survit aux ajouts/suppressions
  // d'appareils puisque attachée une seule fois au conteneur, pas à chaque carte.
  document.getElementById('devicesContainer').addEventListener('change', (e)=>{
    if(e.target.classList.contains('devIrreparable')){
      const idx = e.target.dataset.idx;
      const field = document.querySelector('.devInsuranceField[data-idx="'+idx+'"]');
      if(field) field.style.display = e.target.checked ? 'block' : 'none';
    }
    if(e.target.classList.contains('devForfaitPaid') || e.target.classList.contains('devPartPricePaid')){
      updateTotalDisplay();
    }
  });
  document.getElementById('devicesContainer').addEventListener('input', (e)=>{
    if(e.target.classList.contains('devForfaitPrice') || e.target.classList.contains('devPartPriceAmount')) updateTotalDisplay();
  });
  document.getElementById('devicesContainer').addEventListener('click', (e)=>{
    if(e.target.classList.contains('devAddPartPrice')){
      syncDevicesFromDOM();
      const idx = Number(e.target.dataset.idx);
      const d = i.devices[idx];
      if(!d) return;
      d.partsPrices = d.partsPrices || [];
      d.partsPrices.push({ id: uid(), label:'', amount:'', paid:false });
      const box = document.querySelector('.dev-parts-prices[data-idx="'+idx+'"]');
      if(box) box.innerHTML = partsPricesHtml(d, idx);
    }
    if(e.target.classList.contains('devPartPriceRemove')){
      syncDevicesFromDOM();
      const idx = Number(e.target.dataset.idx);
      const pIdx = Number(e.target.dataset.pidx);
      const d = i.devices[idx];
      if(!d) return;
      d.partsPrices.splice(pIdx, 1);
      const box = document.querySelector('.dev-parts-prices[data-idx="'+idx+'"]');
      if(box) box.innerHTML = partsPricesHtml(d, idx);
      updateTotalDisplay();
    }
  });

  const linkSelect = document.getElementById('iLinkRdv');
  if(linkSelect){
    linkSelect.addEventListener('change', ()=>{
      const rdv = state.appointments.find(a=>a.id===linkSelect.value);
      if(!rdv){ i.linkedRdvId = null; i.dossierNumber = ''; return; }
      if(rdv.firstName || rdv.lastName){
        document.getElementById('iFirstName').value = rdv.firstName || '';
        document.getElementById('iLastName').value = rdv.lastName || '';
      } else {
        const split = splitName(rdv.clientName);
        document.getElementById('iFirstName').value = split.firstName;
        document.getElementById('iLastName').value = split.lastName;
      }
      document.getElementById('iPhone').value = rdv.phone || '';
      document.getElementById('iEmail').value = rdv.email || '';
      document.getElementById('iAddress').value = rdv.address || '';
      document.getElementById('iPostalCode').value = rdv.postalCode || '';
      document.getElementById('iCity').value = rdv.city || '';
      i.linkedRdvId = rdv.id;
      i.dossierNumber = rdv.dossierNumber || '';
      if(i.devices[0]){
        i.devices[0].applianceType = rdv.applianceType || i.devices[0].applianceType;
        i.devices[0].brand = rdv.brand || '';
        i.devices[0].model = rdv.model || '';
        i.devices[0].clientSymptom = rdv.issue || '';
        renderDevicesSection();
      }
    });
    if(preLinkRdvId){
      linkSelect.value = preLinkRdvId;
      linkSelect.dispatchEvent(new Event('change'));
    }
  }

  document.getElementById('iWazeBtn').onclick = ()=>{
    const addr = document.getElementById('iAddress').value.trim();
    const postal = document.getElementById('iPostalCode').value.trim();
    const city = document.getElementById('iCity').value.trim();
    if(!addr){ showToast("Renseignez d'abord une adresse."); return; }
    openWaze(fullAddress({address:addr, postalCode:postal, city:city}));
  };

  document.getElementById('devicesContainer').addEventListener('change', async (e)=>{
    if(e.target.classList.contains('devPhotoInput')){
      const idx = Number(e.target.dataset.idx);
      const d = i.devices[idx];
      if(!d) return;
      const files = Array.from(e.target.files || []);
      e.target.value = '';
      for(const file of files){
        if(!file.type.startsWith('image/')) continue;
        const placeholderId = 'tmp-'+uid();
        d.photos.push({ id: placeholderId, name: file.name, uploading: true });
        renderDevicePhotoGallery(idx);
        try{
          const dataUrl = await compressImageFile(file);
          const uploadedId = await uploadPhoto(dataUrl);
          newlyUploadedIds.push(uploadedId);
          const entry = d.photos.find(p=>p.id===placeholderId);
          if(entry){ entry.id = uploadedId; entry.uploading = false; entry.dataUrl = dataUrl; }
          renderDevicePhotoGallery(idx);
        }catch(err){
          d.photos = d.photos.filter(p=>p.id!==placeholderId);
          renderDevicePhotoGallery(idx);
          showToast("Échec de l'envoi d'une photo : "+err.message);
        }
      }
    }
  });

  window.removeDevicePhoto = function(idx, photoId){
    const d = i.devices[idx];
    if(!d) return;
    d.photos = d.photos.filter(p=>p.id!==photoId);
    deletePhotoById(photoId);
    newlyUploadedIds = newlyUploadedIds.filter(x=>x!==photoId);
    renderDevicePhotoGallery(idx);
  };

  function renderDevicePhotoGallery(idx){
    const gallery = document.querySelector('.devPhotoGallery[data-idx="'+idx+'"]');
    if(!gallery) return;
    const photos = (i.devices[idx] && i.devices[idx].photos) || [];
    if(!photos.length){
      gallery.innerHTML = '<span style="color:var(--text-light);font-size:.82rem;">Aucune photo ajoutée.</span>';
      return;
    }
    gallery.innerHTML = photos.map(p=>`
      <div style="position:relative;width:84px;height:84px;border-radius:8px;overflow:hidden;border:1px solid var(--border);background:rgba(255,255,255,.04);display:flex;align-items:center;justify-content:center;" data-photo-id="${p.id}">
        ${p.uploading ? '<span style="font-size:.68rem;color:var(--text-light);">Envoi…</span>' :
          (p.dataUrl ? `<img src="${p.dataUrl}" style="width:100%;height:100%;object-fit:cover;">` : '<span style="font-size:.68rem;color:var(--text-light);">…</span>')}
        ${!p.uploading ? `<button type="button" onclick="removeDevicePhoto(${idx},'${p.id}')" style="position:absolute;top:2px;right:2px;background:rgba(0,0,0,.6);border:none;color:#fff;border-radius:50%;width:20px;height:20px;font-size:.7rem;cursor:pointer;line-height:1;">✕</button>` : ''}
      </div>
    `).join('');
    photos.filter(p=>!p.uploading && !p.dataUrl).forEach(async (p)=>{
      try{
        const dataUrl = await fetchPhotoDataUrl(p.id);
        p.dataUrl = dataUrl;
        const el = gallery.querySelector('[data-photo-id="'+p.id+'"]');
        if(el) el.innerHTML = `<img src="${dataUrl}" style="width:100%;height:100%;object-fit:cover;"><button type="button" onclick="removeDevicePhoto(${idx},'${p.id}')" style="position:absolute;top:2px;right:2px;background:rgba(0,0,0,.6);border:none;color:#fff;border-radius:50%;width:20px;height:20px;font-size:.7rem;cursor:pointer;line-height:1;">✕</button>`;
      }catch(err){ /* vignette indisponible, on laisse le repère existant */ }
    });
  }

  // ── Pad de signature (souris + tactile) ──
  document.getElementById('sigOpenBtn').onclick = ()=>{
    openSignatureCapture(i.signature, (dataUrl)=>{
      i.signature = dataUrl;
      document.getElementById('sigOpenBtn').textContent = dataUrl ? '✍️ Modifier la signature' : '✍️ Recueillir la signature';
      const pill = document.getElementById('sigSignedPill');
      if(pill) pill.style.display = dataUrl ? 'inline-flex' : 'none';
    });
  };

  // Lit les champs du formulaire dans l'objet i, sans encore rien enregistrer.
  // Utilisé à la fois par le bouton "Fermer" (qui enregistre) et les boutons PDF,
  // pour que le PDF reflète toujours ce qui est actuellement saisi à l'écran.
  function readFormIntoI(){
    i.firstName = document.getElementById('iFirstName').value.trim();
    i.lastName = document.getElementById('iLastName').value.trim();
    i.clientName = (i.firstName+' '+i.lastName).trim();
    i.phone = document.getElementById('iPhone').value.trim();
    i.email = document.getElementById('iEmail').value.trim();
    i.address = document.getElementById('iAddress').value.trim();
    i.postalCode = document.getElementById('iPostalCode').value.trim();
    i.city = document.getElementById('iCity').value.trim();
    i.date = document.getElementById('iDate').value;
    i.status = document.getElementById('iStatus').value;

    // Synchronise l'appareil actuellement affiché (les autres sont déjà à jour dans
    // i.devices depuis les précédents changements de sélection).
    syncDevicesFromDOM();
    (i.devices||[]).forEach(d=>{
      d.photos = (d.photos||[]).filter(p=>!p.uploading).map(p=>({ id: p.id, name: p.name }));
    });

    i.paymentReceived = interventionUnpaidAmount(i) <= 0.001;
    i.amount = i.devices.reduce((s,d)=>s+(Number(d.amount)||0), 0);
    delete i.photos; // champ obsolète (les photos vivent maintenant par appareil)
  }

  async function persist(forcedStatus){
    readFormIntoI();
    if(forcedStatus) i.status = forcedStatus;
    const dossierInput = document.getElementById('iDossierNumber');
    if(dossierInput && dossierInput.value.trim()){
      i.dossierNumber = dossierInput.value.trim();
    } else if(!i.dossierNumber){
      i.dossierNumber = nextDossierNumber(state);
    }

    // Horodatage : sert à classer le dossier par date dans l'onglet Dossiers, et à
    // savoir s'il doit y apparaître (uniquement quand le statut est "Terminé" —
    // il en repart automatiquement si le statut change à nouveau).
    if(i.status === 'Terminé'){
      if(!i.archivedAt) i.archivedAt = new Date().toISOString();
    } else {
      i.archivedAt = null;
    }

    // Le statut du rendez-vous se pilote désormais entièrement depuis le rapport :
    // la pastille du RDV (planning, dossier...) suit à chaque enregistrement, sauf
    // s'il a été annulé indépendamment (on ne le réactive jamais depuis ici).
    if(i.linkedRdvId){
      const linkedRdv = state.appointments.find(a=>a.id===i.linkedRdvId);
      if(linkedRdv && linkedRdv.status!=='Annulé'){
        linkedRdv.status = i.status;
      }
    }

    // Registre de CA : verrouillé dès que "Paiement effectué" est coché. Reste
    // corrigeable tant que le rapport existe, mais jamais retiré automatiquement
    // si ce rapport est supprimé ensuite (voir syncRevenueLedger).
    syncRevenueLedger(state, i);

    const intervBackup = JSON.parse(JSON.stringify(state.interventions));
    const existingIdx = state.interventions.findIndex(x=>x.id===i.id);
    if(existingIdx >= 0){
      state.interventions[existingIdx] = JSON.parse(JSON.stringify(i));
    } else {
      state.interventions.push(JSON.parse(JSON.stringify(i)));
    }

    const ok = await saveState(state);
    if(!ok){
      state.interventions = intervBackup;
      return false;
    }
    savedThisSession = true;
    newlyUploadedIds = [];
    return true;
  }

  document.getElementById('iPdfBtn').onclick = async ()=>{
    readFormIntoI();
    await downloadReportPdf(i, state.settings.company);
  };
  document.getElementById('iSendBtn').onclick = async ()=>{
    readFormIntoI();
    if(!i.clientName){ showToast("Renseignez au moins le nom du client avant d'envoyer."); return; }
    const reviewCheckbox = document.getElementById('iSendReviewRequest');
    await sendReportToClient(i, state.settings.company, !!(reviewCheckbox && reviewCheckbox.checked));
  };

  // Un seul bouton "Fermer" : il enregistre systématiquement (nom du client
  // requis) ; si le formulaire est resté totalement vide (nouveau rapport
  // jamais touché), on ferme simplement sans rien créer et on nettoie les
  // photos déjà envoyées entre-temps.
  const validatePickupBtn = document.getElementById('iValidatePickup');
  if(validatePickupBtn) validatePickupBtn.onclick = ()=>{
    const dep = state.deposits.find(dep=>dep.dossierNumber===i.dossierNumber && dep.status!=='Récupéré');
    if(dep){ closeModal(); window.location.href = 'depots.html?openPickup='+dep.id; }
  };

  const openDevisBtn = document.getElementById('iOpenDevisBtn');
  if(openDevisBtn) openDevisBtn.onclick = ()=>{
    const devisId = openDevisBtn.dataset.devisId;
    closeModal();
    if(devisId){ openDevisModal(devisId); }
    else { openDevisModal(null, i.linkedRdvId || null); }
  };

  document.getElementById('iCancel').onclick = async ()=>{
    const firstName = document.getElementById('iFirstName').value.trim();
    const lastName = document.getElementById('iLastName').value.trim();
    const hasContent = firstName || lastName
      || i.devices.some(d=>d.diagnosis || d.workDone)
      || (i.photos && i.photos.length)
      || i.signature;
    if(!editing && !savedThisSession && !hasContent){
      newlyUploadedIds.forEach(pid=>deletePhotoById(pid));
      closeModal();
      if(returnToDossiers) window.location.href = 'dossiers.html';
      return;
    }
    if(!firstName && !lastName){ showToast("Le prénom ou le nom du client est requis."); return; }
    const ok = await persist();
    if(!ok) return;
    closeModal();
    if(returnToDossiers){ window.location.href = 'dossiers.html'; return; }
    renderPlanGrid();
    renderDayDetail(planSelectedDate);
    showToast("Rapport enregistré.");
  };

  // Le clic en dehors du rapport ne le ferme plus (évite de perdre une saisie par erreur) —
  // seul le bouton "Fermer" permet de quitter la fenêtre.
}

async function deleteInterv(id){
  if(!confirm("Supprimer ce rapport ? Les pièces utilisées seront recréditées au stock.")) return;
  const stockBackup = JSON.parse(JSON.stringify(state.stock));
  const intervBackup = state.interventions;
  const interv = state.interventions.find(i=>i.id===id);
  if(interv){
    (interv.devices||[]).forEach(d=>{
      (d.partsUsed||[]).forEach(p=>{
        const s = state.stock.find(x=>x.id===p.stockId);
        if(s) s.qty = Number(s.qty) + Number(p.qty);
      });
    });
  }
  state.interventions = state.interventions.filter(i=>i.id!==id);
  const ok = await saveState(state);
  if(!ok){ state.stock = stockBackup; state.interventions = intervBackup; return; }
  if(interv){
    (interv.devices||[]).forEach(d=>{ (d.photos||[]).forEach(p=>deletePhotoById(p.id)); });
  }
  renderPlanGrid();
  renderDayDetail(planSelectedDate);
  showToast("Rapport supprimé, pièces recréditées.");
}
