let state = null;

(async function(){
  state = await requireAuth();
  if(!state) return;
  renderNavbar('parametres', state);
  renderParams();
})();

const PARAM_TABS = [
  {group:'modification', label:'📝 Modification'},
  {group:'tarifs', label:'💶 Tarifs'},
  {group:'agenda', label:'📅 Agenda'},
  {group:'entreprise', label:'🏢 Entreprise'},
  {group:'mentions', label:'🏷️ Mentions'},
  {group:'itineraire', label:'🧭 Itinéraire'},
  {group:'comptabilite', label:'🧮 Comptabilité'},
  {group:'dashboard', label:'📊 Tableau de bord'},
  {group:'securite', label:'🔒 Sécurité &amp; accès'},
];

function renderParams(){
  if(!state.settings.mentions) state.settings.mentions = [];
  const main = document.getElementById('pageContent');
  main.innerHTML = `
    <div class="page-head"><h2>Paramè<span>tres</span></h2></div>

    <div class="tabs" id="paramsSubNav" style="margin-bottom:1.4rem;">
      ${PARAM_TABS.map((t,idx)=>`<button type="button" class="tab-btn ${idx===0?'active':''}" data-group="${t.group}">${t.label}</button>`).join('')}
    </div>
    <select id="paramsSubNavMobile" class="params-subnav-mobile">
      ${PARAM_TABS.map(t=>`<option value="${t.group}">${t.label}</option>`).join('')}
    </select>

    <div class="params-group" data-group="modification">
      <div class="section-block">
        <h3>Types d'appareils</h3>
        <div class="tag-list" id="tagApplianceTypes"></div>
        <div class="add-inline"><input id="addApplianceType" placeholder="Nouveau type d'appareil"><button class="btn btn-ghost btn-small" id="btnAddApplianceType">Ajouter</button></div>
      </div>

      <div class="section-block">
        <h3>Marques</h3>
        <div class="tag-list" id="tagBrands"></div>
        <div class="add-inline"><input id="addBrand" placeholder="Nouvelle marque"><button class="btn btn-ghost btn-small" id="btnAddBrand">Ajouter</button></div>
      </div>

      <div class="section-block">
        <h3>Catégories de pièces</h3>
        <div class="tag-list" id="tagPartCategories"></div>
        <div class="add-inline"><input id="addPartCategory" placeholder="Nouvelle catégorie"><button class="btn btn-ghost btn-small" id="btnAddPartCategory">Ajouter</button></div>
      </div>

      <div class="section-block">
        <h3>Origines de rendez-vous</h3>
        <div class="tag-list" id="tagRdvSources"></div>
        <div class="add-inline"><input id="addRdvSource" placeholder="Nouvelle origine"><button class="btn btn-ghost btn-small" id="btnAddRdvSource">Ajouter</button></div>
      </div>
    </div>

    <div class="params-group" data-group="tarifs" style="display:none;">
      <div class="section-block">
        <h3>Marges tarifaires (prix de vente automatique)</h3>
        <p style="font-size:.85rem;color:var(--text-light);margin-bottom:.8rem;">
          Dans l'onglet Stock, le prix de vente se calcule automatiquement à partir du prix d'achat, selon ces paliers (le premier palier dont le prix d'achat ne dépasse pas "Jusqu'à" s'applique). Laissez "Jusqu'à" vide pour un palier illimité (généralement le dernier).
        </p>
        <div id="tiersList"></div>
        <div style="display:flex;gap:.6rem;margin-top:.8rem;flex-wrap:wrap;">
          <button class="btn btn-ghost btn-small" id="btnAddTier">+ Ajouter un palier</button>
          <button class="btn btn-ghost btn-small" id="btnSaveTiers">Enregistrer les paliers</button>
        </div>
      </div>

      <div class="section-block">
        <h3>Forfaits (utilisés dans les devis)</h3>
        <p style="font-size:.85rem;color:var(--text-light);margin-bottom:.8rem;">
          La liste de forfaits proposée à la création d'un devis. Le libellé s'affiche tel quel sur le PDF.
        </p>
        <div id="forfaitsList"></div>
        <div style="display:flex;gap:.6rem;margin-top:.8rem;flex-wrap:wrap;">
          <button class="btn btn-ghost btn-small" id="btnAddForfait">+ Ajouter un forfait</button>
          <button class="btn btn-ghost btn-small" id="btnSaveForfaits">Enregistrer les forfaits</button>
        </div>
      </div>

      <div class="section-block">
        <h3>Association appareil → forfait</h3>
        <p style="font-size:.85rem;color:var(--text-light);margin-bottom:.8rem;">
          Glissez un type d'appareil dans le forfait qui doit s'appliquer automatiquement à la création d'un devis. Sur téléphone/tablette : touchez l'appareil puis touchez le forfait de destination. Chaque changement est enregistré immédiatement.
        </p>
        <div id="applianceForfaitMapList" style="display:flex;flex-direction:column;gap:.9rem;"></div>
      </div>
    </div>

    <div class="params-group" data-group="agenda" style="display:none;">
      <div class="section-block">
        <h3>Agenda &amp; créneaux (site public)</h3>
        <p style="font-size:.85rem;color:var(--text-light);margin-bottom:1rem;">
          Contrôle le calendrier de prise de rendez-vous sur <code>acservicepro.fr/rdv.html</code>. Toute modification ici est appliquée immédiatement sur le site, sans redéploiement.
        </p>
        <div class="modal-row">
          <div class="field"><label>Horaire du matin</label>
            <div style="display:flex;gap:.5rem;align-items:center;">
              <input type="time" id="schedMorningStart" value="${state.settings.schedule.morningStart}">
              <span style="color:var(--text-light);">à</span>
              <input type="time" id="schedMorningEnd" value="${state.settings.schedule.morningEnd}">
            </div>
          </div>
          <div class="field"><label>Places le matin</label><input type="number" min="0" id="schedMorningCap" value="${state.settings.schedule.morningCapacity}"></div>
        </div>
        <div class="modal-row">
          <div class="field"><label>Horaire de l'après-midi</label>
            <div style="display:flex;gap:.5rem;align-items:center;">
              <input type="time" id="schedAfternoonStart" value="${state.settings.schedule.afternoonStart}">
              <span style="color:var(--text-light);">à</span>
              <input type="time" id="schedAfternoonEnd" value="${state.settings.schedule.afternoonEnd}">
            </div>
          </div>
          <div class="field"><label>Places l'après-midi</label><input type="number" min="0" id="schedAfternoonCap" value="${state.settings.schedule.afternoonCapacity}"></div>
        </div>
        <div class="field"><label>Jours ouverts à la réservation</label>
          <div class="tag-list" id="schedOpenDays"></div>
        </div>
        <div class="field" style="max-width:220px;"><label>Réservable jusqu'à (jours à l'avance)</label><input type="number" min="1" id="schedHorizon" value="${state.settings.schedule.bookingHorizonDays}"></div>
        <button class="btn btn-ghost btn-small" id="btnSaveSchedule">Enregistrer l'agenda</button>

        <h3 style="margin-top:1.6rem;">Fermetures ponctuelles (congés, jours fériés…)</h3>
        <div id="closuresList"></div>
        <button class="btn btn-ghost btn-small" id="btnAddClosure" style="margin-top:.8rem;">+ Ajouter une fermeture</button>
      </div>
    </div>

    <div class="params-group" data-group="entreprise" style="display:none;">
      <div class="section-block">
        <h3>Entreprise &amp; technicien</h3>
        <p style="font-size:.85rem;color:var(--text-light);margin-bottom:.8rem;">
          Ces informations apparaissent sur la première page de chaque rapport PDF (page dédiée "Technicien"), ainsi qu'en pied de page.
        </p>
        <div class="modal-row">
          <div class="field"><label>Nom de l'entreprise</label><input id="companyName" value="${escapeHtml(state.settings.company.name||'')}"></div>
          <div class="field"><label>Nom du technicien</label><input id="companyTechnicianName" value="${escapeHtml(state.settings.company.technicianName||'')}"></div>
        </div>
        <div class="modal-row">
          <div class="field"><label>Téléphone</label><input id="companyPhone" value="${escapeHtml(state.settings.company.phone||'')}"></div>
          <div class="field"><label>Email</label><input id="companyEmail" value="${escapeHtml(state.settings.company.email||'')}"></div>
        </div>
        <div class="field"><label>SIRET</label><input id="companySiret" value="${escapeHtml(state.settings.company.siret||'')}"></div>
        <div class="field"><label>Adresse</label><input id="companyAddress" value="${escapeHtml(state.settings.company.address||'')}"></div>
        <div class="modal-row">
          <div class="field"><label>Code postal</label><input id="companyPostalCode" value="${escapeHtml(state.settings.company.postalCode||'')}"></div>
          <div class="field"><label>Ville</label><input id="companyCity" value="${escapeHtml(state.settings.company.city||'')}"></div>
        </div>
        <div class="modal-row">
          <div class="field"><label>Statut juridique</label><input id="companyLegalStatus" value="${escapeHtml(state.settings.company.legalStatus||'')}" placeholder="Ex : Entrepreneur individuel"></div>
          <div class="field"><label>Mention TVA (sur les devis)</label><input id="companyVatNote" value="${escapeHtml(state.settings.company.vatNote||'')}" placeholder="Ex : TVA non applicable - Article 293 B du CGI"></div>
        </div>
        <button class="btn btn-ghost btn-small" id="btnSaveCompany">Enregistrer les informations</button>
      </div>
    </div>

    <div class="params-group" data-group="mentions" style="display:none;">
      <div class="section-block">
        <h3>Vos mentions</h3>
        <p style="font-size:.85rem;color:var(--text-light);margin-bottom:1rem;">
          Une mention est un texte réutilisable (ex : conditions d'annulation, garantie pièces...) que tu associes à un ou plusieurs forfaits juste en dessous. Elle apparaît automatiquement sur le devis dès qu'un de ces forfaits est utilisé.
        </p>
        <div id="mentionsList"></div>
        <div class="modal-row" style="margin-top:1rem;align-items:flex-end;">
          <div class="field"><label>Nom de la mention</label><input id="newMentionLabel" placeholder="Ex : Annulation / absence"></div>
          <button class="btn btn-ghost btn-small" id="addMentionBtn" style="height:44px;">+ Ajouter une mention</button>
        </div>
      </div>

      <div class="section-block">
        <h3>Association mention → forfaits</h3>
        <p style="font-size:.85rem;color:var(--text-light);margin-bottom:1rem;">
          Une mention peut s'appliquer à plusieurs forfaits à la fois. Glissez une mention sur un forfait pour l'associer (sur téléphone/tablette : touchez la mention puis le forfait). Touchez une mention déjà associée dans un forfait pour la retirer de celui-ci.
        </p>
        <div id="mentionPalette" style="display:flex;flex-wrap:wrap;gap:.5rem;margin-bottom:1.2rem;"></div>
        <div id="mentionForfaitBoard" style="display:flex;flex-direction:column;gap:.9rem;"></div>
      </div>

      <div class="section-block">
        <h3>Clause de conservation (bons de dépôt)</h3>
        <textarea id="companyStoragePolicy" placeholder="Ex : Passé un délai de 3 mois sans nouvelles du client après notification, l'appareil pourra être considéré comme abandonné et mis au rebut, conformément à l'usage.">${escapeHtml(state.settings.company.storagePolicy||'')}</textarea>
        <button class="btn btn-ghost btn-small" id="btnSaveStoragePolicy" style="margin-top:.8rem;">Enregistrer la clause</button>
      </div>

      <div class="section-block">
        <h3>Lien "Laisser un avis" Google</h3>
        <input id="companyGoogleReviewLink" value="${escapeHtml(state.settings.company.googleReviewLink||'')}" placeholder="Ex : https://g.page/r/XXXXXXXX/review">
        <button class="btn btn-ghost btn-small" id="btnSaveReviewLink" style="margin-top:.8rem;">Enregistrer le lien</button>
      </div>
    </div>

    <div class="params-group" data-group="itineraire" style="display:none;">
      <div class="section-block">
        <h3>Optimisation d'itinéraire (Planning)</h3>
        <p style="font-size:.85rem;color:var(--text-light);margin-bottom:.8rem;">
          Adresse utilisée comme point de départ pour calculer l'ordre de passage le plus court dans l'onglet Planning (ex. votre domicile ou votre atelier). Laissez vide pour partir simplement du premier rendez-vous du groupe.
        </p>
        <div class="field"><label>Adresse de départ</label><input id="startAddress" value="${escapeHtml(state.settings.startAddress||'')}" placeholder="Ex : 12 rue Exemple, 59470 Esquelbecq"></div>
        <button class="btn btn-ghost btn-small" id="btnSaveStartAddress">Enregistrer l'adresse</button>
      </div>
    </div>

    <div class="params-group" data-group="comptabilite" style="display:none;">
      <div class="section-block">
        <h3>Taux de comptabilité</h3>
        <p style="font-size:.85rem;color:var(--text-light);margin-bottom:1rem;">
          Utilisés par la calculatrice de l'onglet 🧮 Comptabilité pour répartir votre chiffre d'affaires.
        </p>
        <div class="modal-row">
          <div class="field"><label>Cotisations URSSAF (%)</label><input type="number" step="0.01" id="acctUrssaf" value="${state.settings.accounting.urssafRate}"></div>
          <div class="field"><label>Impôts (%)</label><input type="number" step="0.01" id="acctTax" value="${state.settings.accounting.taxRate}"></div>
        </div>
        <div class="field" style="max-width:260px;"><label>Part à me verser (%)</label><input type="number" step="0.01" id="acctSelfPay" value="${state.settings.accounting.selfPayRate}"></div>
        <button class="btn btn-ghost btn-small" id="btnSaveAccounting">Enregistrer les taux</button>
      </div>
    </div>

    <div class="params-group" data-group="dashboard" style="display:none;">
      <div class="section-block">
        <h3>Corrections du tableau de bord</h3>
        <p style="font-size:.85rem;color:var(--text-light);margin-bottom:1rem;">
          Le CA affiché au tableau de bord vient de ce registre, verrouillé dès qu'un rapport a la case "Paiement effectué" cochée — il ne bouge plus tout seul, même si le rapport est ensuite supprimé. Utilisez cette liste uniquement pour corriger une erreur (montant mal saisi, doublon...).
        </p>
        <div id="ledgerList"></div>
      </div>
    </div>

    <div class="params-group" data-group="securite" style="display:none;">
      <div class="section-block">
        <h3>Sécurité</h3>
        <p style="font-size:.85rem;color:var(--text-light);margin-bottom:.8rem;">Email autorisé : <strong>${ALLOWED_EMAIL}</strong><br>Le mot de passe est haché côté serveur, jamais stocké ni transmis en clair.</p>
        <button class="btn btn-ghost btn-small" id="btnChangePwd">Changer le mot de passe</button>
      </div>

      <div class="section-block">
        <h3>Connexion avec le site acservicepro.fr</h3>
        <div class="gateway-box" style="margin-bottom:1rem;">
          <strong>Comment ça marche.</strong> La fonction <code>/api/rendezvous</code> (voir le <code>README.md</code>) reçoit les RDV envoyés par le site public. Deux clés distinctes :<br>
          · <strong>Clé d'écriture</strong> — utilisée uniquement côté site public pour envoyer un nouveau RDV. Elle ne donne aucun droit de lecture.<br>
          · <strong>Clé de lecture</strong> (ci-dessous) — reste privée, uniquement ici, permet de récupérer puis vider la file d'attente des demandes reçues.<br>
          Tant que ces clés ne sont pas configurées côté Vercel, le bouton "Importer depuis le site" (onglet Planning) ne renverra rien — la saisie manuelle reste le mode par défaut.
        </div>
        <div class="field"><label>Clé API de lecture (privée)</label><input id="readApiKey" type="password" value="${escapeHtml(state.settings.readApiKey||'')}" placeholder="Collez ici la valeur de RDV_READ_KEY"></div>
        <button class="btn btn-ghost btn-small" id="btnSaveApiKey">Enregistrer la clé</button>
      </div>
    </div>
  `;

  function switchParamsGroup(target){
    document.querySelectorAll('#paramsSubNav .tab-btn').forEach(b=>b.classList.toggle('active', b.dataset.group===target));
    document.getElementById('paramsSubNavMobile').value = target;
    document.querySelectorAll('.params-group').forEach(g=>{
      g.style.display = (g.dataset.group === target) ? 'block' : 'none';
    });
  }
  document.querySelectorAll('#paramsSubNav .tab-btn').forEach(btn=>{
    btn.onclick = ()=>switchParamsGroup(btn.dataset.group);
  });
  document.getElementById('paramsSubNavMobile').onchange = (e)=>switchParamsGroup(e.target.value);

  drawTags('applianceTypes','tagApplianceTypes');
  drawTags('brands','tagBrands');
  drawTags('partCategories','tagPartCategories');
  drawTags('rdvSources','tagRdvSources');
  drawTiers();
  drawForfaits();
  drawApplianceForfaitMap();
  drawMentionsList();
  drawMentionForfaitBoard();

  bindAddTag('applianceTypes','tagApplianceTypes','addApplianceType','btnAddApplianceType');
  bindAddTag('brands','tagBrands','addBrand','btnAddBrand');
  bindAddTag('partCategories','tagPartCategories','addPartCategory','btnAddPartCategory');
  bindAddTag('rdvSources','tagRdvSources','addRdvSource','btnAddRdvSource');
  drawOpenDays();
  drawClosures();
  drawLedgerList();

  document.getElementById('btnAddTier').onclick = ()=>{
    state.settings.marginTiers = state.settings.marginTiers || [];
    state.settings.marginTiers.push({ max: null, mult: 1 });
    drawTiers();
  };

  document.getElementById('btnSaveTiers').onclick = async ()=>{
    const maxes = document.querySelectorAll('.tierMax');
    const mults = document.querySelectorAll('.tierMult');
    const newTiers = [];
    maxes.forEach((inp, idx)=>{
      const maxVal = inp.value.trim();
      const multVal = Number(mults[idx].value) || 1;
      newTiers.push({ max: maxVal === '' ? null : Number(maxVal), mult: multVal });
    });
    const backup = state.settings.marginTiers;
    state.settings.marginTiers = newTiers;
    const ok = await saveState(state);
    if(!ok){ state.settings.marginTiers = backup; return; }
    showToast("Paliers de marge enregistrés.");
  };

  document.getElementById('btnAddForfait').onclick = ()=>{
    state.settings.forfaits = state.settings.forfaits || [];
    state.settings.forfaits.push({ label: 'Nouveau forfait — 0 € TTC', amount: 0 });
    drawForfaits();
  };

  document.getElementById('btnSaveForfaits').onclick = async ()=>{
    const labels = document.querySelectorAll('.forfaitLabel');
    const amounts = document.querySelectorAll('.forfaitAmount');
    const newForfaits = [];
    labels.forEach((inp, idx)=>{
      newForfaits.push({ label: inp.value.trim(), amount: Number(amounts[idx].value)||0 });
    });
    const backup = state.settings.forfaits;
    state.settings.forfaits = newForfaits;
    const ok = await saveState(state);
    if(!ok){ state.settings.forfaits = backup; return; }
    drawApplianceForfaitMap();
    drawMentionForfaitBoard();
    showToast("Forfaits enregistrés.");
  };

  document.getElementById('addMentionBtn').onclick = async ()=>{
    const label = document.getElementById('newMentionLabel').value.trim();
    if(!label){ showToast("Donne un nom à la mention avant de l'ajouter."); return; }
    if(!state.settings.mentions) state.settings.mentions = [];
    state.settings.mentions.push({ id: uid(), label, text: '', forfaits: [] });
    const ok = await saveState(state);
    if(!ok){ state.settings.mentions.pop(); return; }
    document.getElementById('newMentionLabel').value = '';
    drawMentionsList();
    drawMentionForfaitBoard();
    showToast("Mention ajoutée.");
  };

  document.getElementById('btnSaveStoragePolicy').onclick = async ()=>{
    const backup = state.settings.company.storagePolicy;
    state.settings.company.storagePolicy = document.getElementById('companyStoragePolicy').value.trim();
    const ok = await saveState(state);
    if(!ok){ state.settings.company.storagePolicy = backup; return; }
    showToast("Clause de conservation enregistrée.");
  };

  document.getElementById('btnSaveReviewLink').onclick = async ()=>{
    const backup = state.settings.company.googleReviewLink;
    state.settings.company.googleReviewLink = document.getElementById('companyGoogleReviewLink').value.trim();
    const ok = await saveState(state);
    if(!ok){ state.settings.company.googleReviewLink = backup; return; }
    showToast("Lien d'avis Google enregistré.");
  };

  document.getElementById('btnChangePwd').onclick = async ()=>{
    const cur = prompt("Mot de passe actuel :");
    if(cur === null) return;
    const np1 = prompt("Nouveau mot de passe (4 caractères min) :");
    if(np1 === null) return;
    if(np1.length < 4){ showToast("Trop court."); return; }
    const np2 = prompt("Confirmer le nouveau mot de passe :");
    if(np2 !== np1){ showToast("Les mots de passe ne correspondent pas."); return; }
    try{
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-session-token': getToken() },
        body: JSON.stringify({ action: 'changePassword', currentPassword: cur, newPassword: np1 })
      });
      const data = await res.json();
      if(!res.ok){ showToast(data.error || "Erreur."); return; }
      showToast("Mot de passe mis à jour.");
    }catch(e){
      showToast("Erreur : "+e.message);
    }
  };

  document.getElementById('btnSaveApiKey').onclick = async ()=>{
    const backup = state.settings.readApiKey;
    state.settings.readApiKey = document.getElementById('readApiKey').value.trim();
    const ok = await saveState(state);
    if(!ok){ state.settings.readApiKey = backup; return; }
    showToast("Clé API enregistrée.");
  };

  document.getElementById('btnSaveCompany').onclick = async ()=>{
    const backup = JSON.parse(JSON.stringify(state.settings.company));
    state.settings.company = {
      name: document.getElementById('companyName').value.trim(),
      technicianName: document.getElementById('companyTechnicianName').value.trim(),
      phone: document.getElementById('companyPhone').value.trim(),
      email: document.getElementById('companyEmail').value.trim(),
      siret: document.getElementById('companySiret').value.trim(),
      address: document.getElementById('companyAddress').value.trim(),
      postalCode: document.getElementById('companyPostalCode').value.trim(),
      city: document.getElementById('companyCity').value.trim(),
      legalStatus: document.getElementById('companyLegalStatus').value.trim(),
      vatNote: document.getElementById('companyVatNote').value.trim(),
      cancellationPolicy: state.settings.company.cancellationPolicy || '',
      storagePolicy: state.settings.company.storagePolicy || '',
      googleReviewLink: state.settings.company.googleReviewLink || ''
    };
    const ok = await saveState(state);
    if(!ok){ state.settings.company = backup; return; }
    showToast("Informations entreprise enregistrées.");
  };

  document.getElementById('btnSaveStartAddress').onclick = async ()=>{
    const backup = state.settings.startAddress;
    state.settings.startAddress = document.getElementById('startAddress').value.trim();
    const ok = await saveState(state);
    if(!ok){ state.settings.startAddress = backup; return; }
    showToast("Adresse de départ enregistrée.");
  };

  document.getElementById('btnSaveAccounting').onclick = async ()=>{
    const backup = JSON.parse(JSON.stringify(state.settings.accounting));
    state.settings.accounting.urssafRate = Number(document.getElementById('acctUrssaf').value) || 0;
    state.settings.accounting.taxRate = Number(document.getElementById('acctTax').value) || 0;
    state.settings.accounting.selfPayRate = Number(document.getElementById('acctSelfPay').value) || 0;
    const ok = await saveState(state);
    if(!ok){ state.settings.accounting = backup; return; }
    showToast("Taux de comptabilité enregistrés.");
  };

  document.getElementById('btnSaveSchedule').onclick = async ()=>{
    const backup = JSON.parse(JSON.stringify(state.settings.schedule));
    const checked = Array.from(document.querySelectorAll('.openDayCheck:checked')).map(c=>Number(c.value));
    state.settings.schedule.morningStart = document.getElementById('schedMorningStart').value || '09:00';
    state.settings.schedule.morningEnd = document.getElementById('schedMorningEnd').value || '12:00';
    state.settings.schedule.afternoonStart = document.getElementById('schedAfternoonStart').value || '12:00';
    state.settings.schedule.afternoonEnd = document.getElementById('schedAfternoonEnd').value || '17:00';
    state.settings.schedule.morningCapacity = Math.max(0, Number(document.getElementById('schedMorningCap').value)||0);
    state.settings.schedule.afternoonCapacity = Math.max(0, Number(document.getElementById('schedAfternoonCap').value)||0);
    state.settings.schedule.bookingHorizonDays = Math.max(1, Number(document.getElementById('schedHorizon').value)||14);
    state.settings.schedule.openDays = checked;
    const ok = await saveState(state);
    if(!ok){ state.settings.schedule = backup; return; }
    showToast("Agenda mis à jour — effectif immédiatement sur le site.");
  };

  document.getElementById('btnAddClosure').onclick = ()=>{
    state.settings.schedule.closures = state.settings.schedule.closures || [];
    state.settings.schedule.closures.push({ id: uid(), startDate: todayISO(), endDate: todayISO(), reason: '', message: '' });
    drawClosures();
  };
}

function drawTags(settingsKey, elId){
  const el = document.getElementById(elId);
  const items = state.settings[settingsKey];
  el.innerHTML = items.map((v,idx)=>`
    <span class="tag">${escapeHtml(v)}<button onclick="removeTag('${settingsKey}',${idx})">✕</button></span>
  `).join('') || '<span style="color:var(--text-light);font-size:.85rem;">Aucun élément</span>';
}

function drawTiers(){
  const el = document.getElementById('tiersList');
  const tiers = state.settings.marginTiers || [];
  el.innerHTML = tiers.map((t, idx)=>`
    <div class="item-row" style="align-items:flex-end;">
      <div class="item-main" style="display:flex;gap:.8rem;flex-wrap:wrap;">
        <div class="field" style="margin-bottom:0;min-width:150px;">
          <label>Jusqu'à (€)</label>
          <input type="number" step="0.01" class="tierMax" value="${t.max===null||t.max===undefined?'':t.max}" placeholder="illimité">
        </div>
        <div class="field" style="margin-bottom:0;min-width:130px;">
          <label>Multiplicateur (x)</label>
          <input type="number" step="0.01" class="tierMult" value="${t.mult}">
        </div>
      </div>
      <button class="btn btn-danger btn-small" onclick="removeTier(${idx})">Supprimer</button>
    </div>
  `).join('') || '<span style="color:var(--text-light);font-size:.85rem;">Aucun palier — le prix de vente ne sera pas calculé automatiquement.</span>';
}

function removeTier(idx){
  state.settings.marginTiers.splice(idx, 1);
  drawTiers();
}

function drawForfaits(){
  const el = document.getElementById('forfaitsList');
  const forfaits = state.settings.forfaits || [];
  el.innerHTML = forfaits.map((f, idx)=>`
    <div class="item-row" style="align-items:flex-end;">
      <div class="item-main" style="display:flex;gap:.8rem;flex-wrap:wrap;">
        <div class="field" style="margin-bottom:0;min-width:260px;flex:1;">
          <label>Libellé (affiché sur le devis)</label>
          <input class="forfaitLabel" value="${escapeHtml(f.label)}">
        </div>
        <div class="field" style="margin-bottom:0;min-width:130px;">
          <label>Montant (€)</label>
          <input type="number" step="0.01" class="forfaitAmount" value="${f.amount}">
        </div>
      </div>
      <button class="btn btn-danger btn-small" onclick="removeForfait(${idx})">Supprimer</button>
    </div>
  `).join('') || '<span style="color:var(--text-light);font-size:.85rem;">Aucun forfait — ajoutez-en un pour pouvoir créer des devis.</span>';
}

function removeForfait(idx){
  state.settings.forfaits.splice(idx, 1);
  drawForfaits();
}

let selectedApplianceChip = null;

function drawApplianceForfaitMap(){
  const el = document.getElementById('applianceForfaitMapList');
  const types = state.settings.applianceTypes || [];
  const forfaits = state.settings.forfaits || [];
  const map = state.settings.applianceForfaitMap || {};
  if(!forfaits.length){
    el.innerHTML = '<span style="color:var(--text-light);font-size:.85rem;">Ajoutez d\'abord au moins un forfait ci-dessus.</span>';
    return;
  }
  selectedApplianceChip = null;

  const buckets = forfaits.map(f=>({ key: f.label, label: f.label })).concat([{ key:'', label:'Non assigné' }]);

  el.innerHTML = buckets.map(b=>{
    const items = types.filter(t=>(map[t]||'')===b.key);
    return `
      <div class="dnd-bucket" data-forfait="${escapeHtml(b.key)}" style="border:1px dashed var(--border);border-radius:10px;padding:.8rem;min-height:56px;transition:border-color .15s;">
        <div style="font-family:'Rajdhani',sans-serif;font-weight:700;text-transform:uppercase;font-size:.8rem;letter-spacing:.03em;color:${b.key?'var(--cyan)':'var(--text-light)'};margin-bottom:.5rem;">${escapeHtml(b.label)}</div>
        <div class="dnd-chip-zone" style="display:flex;flex-wrap:wrap;gap:.5rem;min-height:1.6rem;">
          ${items.map(t=>`<div class="dnd-chip" draggable="true" data-appliance="${escapeHtml(t)}" style="cursor:grab;background:rgba(0,180,216,.1);border:1px solid rgba(0,180,216,.3);border-radius:20px;padding:.35rem .8rem;font-size:.85rem;user-select:none;">${escapeHtml(t)}</div>`).join('')}
          ${!items.length ? '<span style="color:var(--text-light);font-size:.78rem;">Glissez (ou touchez) un appareil ici</span>' : ''}
        </div>
      </div>
    `;
  }).join('');

  async function moveApplianceTo(appliance, forfaitKey){
    const backup = JSON.parse(JSON.stringify(state.settings.applianceForfaitMap||{}));
    if(!state.settings.applianceForfaitMap) state.settings.applianceForfaitMap = {};
    if(forfaitKey) state.settings.applianceForfaitMap[appliance] = forfaitKey;
    else delete state.settings.applianceForfaitMap[appliance];
    drawApplianceForfaitMap();
    const ok = await saveState(state);
    if(!ok){ state.settings.applianceForfaitMap = backup; drawApplianceForfaitMap(); return; }
    showToast(`${appliance} → ${forfaitKey || 'non assigné'}`);
  }

  el.querySelectorAll('.dnd-chip').forEach(chip=>{
    // Glisser-déposer (souris, ordinateur)
    chip.addEventListener('dragstart', (e)=>{
      e.dataTransfer.setData('text/plain', chip.dataset.appliance);
      setTimeout(()=>{ chip.style.opacity = '0.35'; }, 0);
    });
    chip.addEventListener('dragend', ()=>{ chip.style.opacity = '1'; });
    // Tap-to-move (mobile/tablette) : toucher l'appareil le sélectionne, toucher un
    // forfait ensuite le déplace là — pas besoin de faire glisser au doigt.
    chip.addEventListener('click', ()=>{
      if(selectedApplianceChip === chip.dataset.appliance){
        selectedApplianceChip = null;
        chip.style.boxShadow = '';
      } else {
        el.querySelectorAll('.dnd-chip').forEach(c=>c.style.boxShadow='');
        selectedApplianceChip = chip.dataset.appliance;
        chip.style.boxShadow = '0 0 0 2px var(--cyan)';
      }
    });
  });

  el.querySelectorAll('.dnd-bucket').forEach(bucket=>{
    bucket.addEventListener('dragover', (e)=>{ e.preventDefault(); bucket.style.borderColor = 'var(--cyan)'; });
    bucket.addEventListener('dragleave', ()=>{ bucket.style.borderColor = 'var(--border)'; });
    bucket.addEventListener('drop', (e)=>{
      e.preventDefault();
      bucket.style.borderColor = 'var(--border)';
      const appliance = e.dataTransfer.getData('text/plain');
      if(appliance) moveApplianceTo(appliance, bucket.dataset.forfait);
    });
    // Clic/tap sur la zone du forfait (hors d'une puce) : déplace l'appareil sélectionné.
    bucket.addEventListener('click', (e)=>{
      if(e.target.closest('.dnd-chip')) return;
      if(selectedApplianceChip) moveApplianceTo(selectedApplianceChip, bucket.dataset.forfait);
    });
  });
}

function drawMentionsList(){
  const el = document.getElementById('mentionsList');
  const mentions = state.settings.mentions || [];
  if(!mentions.length){
    el.innerHTML = '<span style="color:var(--text-light);font-size:.85rem;">Aucune mention créée pour l\'instant.</span>';
    return;
  }
  el.innerHTML = mentions.map(m=>`
    <div class="section-block" style="margin-bottom:.9rem;">
      <div class="modal-row" style="align-items:flex-end;">
        <div class="field"><label>Nom</label><input class="mentionLabelInput" data-id="${m.id}" value="${escapeHtml(m.label||'')}"></div>
        <button class="btn btn-danger btn-small" onclick="removeMention('${m.id}')" style="height:44px;">🗑️ Supprimer</button>
      </div>
      <div class="field" style="margin-top:.6rem;"><label>Texte de la mention</label><textarea class="mentionTextInput" data-id="${m.id}" rows="2" placeholder="Ex : En cas d'annulation moins de 24h avant le rendez-vous, des frais de déplacement pourront être appliqués.">${escapeHtml(m.text||'')}</textarea></div>
    </div>
  `).join('');

  el.querySelectorAll('.mentionLabelInput').forEach(inp=>{
    inp.oninput = async (e)=>{
      const m = (state.settings.mentions||[]).find(x=>x.id===e.target.dataset.id);
      if(m) m.label = e.target.value;
    };
    inp.onblur = async (e)=>{ await saveState(state); drawMentionForfaitBoard(); };
  });
  el.querySelectorAll('.mentionTextInput').forEach(inp=>{
    inp.oninput = (e)=>{
      const m = (state.settings.mentions||[]).find(x=>x.id===e.target.dataset.id);
      if(m) m.text = e.target.value;
    };
    inp.onblur = async ()=>{ await saveState(state); };
  });
}

window.removeMention = async function(id){
  if(!confirm("Supprimer définitivement cette mention (et son association aux forfaits) ?")) return;
  const backup = JSON.parse(JSON.stringify(state.settings.mentions||[]));
  state.settings.mentions = (state.settings.mentions||[]).filter(m=>m.id!==id);
  const ok = await saveState(state);
  if(!ok){ state.settings.mentions = backup; return; }
  drawMentionsList();
  drawMentionForfaitBoard();
  showToast("Mention supprimée.");
};

let selectedMentionId = null;

// Association many-to-many : une mention peut s'appliquer à plusieurs forfaits, et
// un forfait peut avoir plusieurs mentions. La palette du haut liste toutes les
// mentions (toujours visibles, quel que soit leur nombre d'associations) ; chaque
// forfait ci-dessous affiche les mentions qui lui sont actuellement associées.
function drawMentionForfaitBoard(){
  const palette = document.getElementById('mentionPalette');
  const board = document.getElementById('mentionForfaitBoard');
  const mentions = state.settings.mentions || [];
  const forfaits = state.settings.forfaits || [];

  if(!mentions.length){
    palette.innerHTML = '<span style="color:var(--text-light);font-size:.85rem;">Crée d\'abord au moins une mention ci-dessus.</span>';
    board.innerHTML = '';
    return;
  }
  if(!forfaits.length){
    palette.innerHTML = '';
    board.innerHTML = '<span style="color:var(--text-light);font-size:.85rem;">Ajoute d\'abord au moins un forfait dans l\'onglet Tarifs.</span>';
    return;
  }

  palette.innerHTML = mentions.map(m=>`
    <div class="dnd-chip mentionChip" draggable="true" data-mention-id="${m.id}" style="cursor:grab;background:rgba(0,180,216,.1);border:1px solid rgba(0,180,216,.3);border-radius:20px;padding:.35rem .8rem;font-size:.85rem;user-select:none;${selectedMentionId===m.id?'box-shadow:0 0 0 2px var(--cyan);':''}">${escapeHtml(m.label||'(sans nom)')}</div>
  `).join('');

  board.innerHTML = forfaits.map(f=>{
    const assigned = mentions.filter(m=>(m.forfaits||[]).includes(f.label));
    return `
      <div class="dnd-bucket mentionBucket" data-forfait="${escapeHtml(f.label)}" style="border:1px dashed var(--border);border-radius:10px;padding:.8rem;min-height:56px;transition:border-color .15s;">
        <div style="font-family:'Rajdhani',sans-serif;font-weight:700;text-transform:uppercase;font-size:.8rem;letter-spacing:.03em;color:var(--cyan);margin-bottom:.5rem;">${escapeHtml(f.label)}</div>
        <div style="display:flex;flex-wrap:wrap;gap:.5rem;min-height:1.6rem;">
          ${assigned.map(m=>`<div class="dnd-chip mentionAssignedChip" data-mention-id="${m.id}" data-forfait="${escapeHtml(f.label)}" title="Cliquer pour retirer" style="cursor:pointer;background:rgba(46,204,143,.12);border:1px solid rgba(46,204,143,.35);border-radius:20px;padding:.35rem .8rem;font-size:.85rem;user-select:none;">${escapeHtml(m.label||'(sans nom)')} ✕</div>`).join('')}
          ${!assigned.length ? '<span style="color:var(--text-light);font-size:.78rem;">Glissez (ou touchez) une mention ici</span>' : ''}
        </div>
      </div>
    `;
  }).join('');

  async function toggleAssignment(mentionId, forfaitLabel, forceState){
    const m = mentions.find(x=>x.id===mentionId);
    if(!m) return;
    if(!m.forfaits) m.forfaits = [];
    const already = m.forfaits.includes(forfaitLabel);
    const shouldAssign = (forceState !== undefined) ? forceState : !already;
    const backup = JSON.parse(JSON.stringify(state.settings.mentions));
    if(shouldAssign && !already) m.forfaits.push(forfaitLabel);
    else if(!shouldAssign && already) m.forfaits = m.forfaits.filter(f=>f!==forfaitLabel);
    else return;
    drawMentionForfaitBoard();
    const ok = await saveState(state);
    if(!ok){ state.settings.mentions = backup; drawMentionForfaitBoard(); return; }
    showToast(shouldAssign ? `"${m.label}" associée à "${forfaitLabel}"` : `"${m.label}" retirée de "${forfaitLabel}"`);
  }

  palette.querySelectorAll('.mentionChip').forEach(chip=>{
    chip.addEventListener('dragstart', (e)=>{
      e.dataTransfer.setData('text/plain', chip.dataset.mentionId);
      setTimeout(()=>{ chip.style.opacity = '0.35'; }, 0);
    });
    chip.addEventListener('dragend', ()=>{ chip.style.opacity = '1'; });
    chip.addEventListener('click', ()=>{
      selectedMentionId = (selectedMentionId === chip.dataset.mentionId) ? null : chip.dataset.mentionId;
      drawMentionForfaitBoard();
    });
  });

  board.querySelectorAll('.mentionAssignedChip').forEach(chip=>{
    chip.addEventListener('click', (e)=>{
      e.stopPropagation();
      toggleAssignment(chip.dataset.mentionId, chip.dataset.forfait, false);
    });
  });

  board.querySelectorAll('.mentionBucket').forEach(bucket=>{
    bucket.addEventListener('dragover', (e)=>{ e.preventDefault(); bucket.style.borderColor = 'var(--cyan)'; });
    bucket.addEventListener('dragleave', ()=>{ bucket.style.borderColor = 'var(--border)'; });
    bucket.addEventListener('drop', (e)=>{
      e.preventDefault();
      bucket.style.borderColor = 'var(--border)';
      const mentionId = e.dataTransfer.getData('text/plain');
      if(mentionId) toggleAssignment(mentionId, bucket.dataset.forfait, true);
    });
    bucket.addEventListener('click', (e)=>{
      if(e.target.closest('.mentionAssignedChip')) return;
      if(selectedMentionId) toggleAssignment(selectedMentionId, bucket.dataset.forfait, true);
    });
  });
}

const DAY_LABELS = [
  { v: 1, l: 'Lun' }, { v: 2, l: 'Mar' }, { v: 3, l: 'Mer' }, { v: 4, l: 'Jeu' },
  { v: 5, l: 'Ven' }, { v: 6, l: 'Sam' }, { v: 7, l: 'Dim' }
];

function drawOpenDays(){
  const el = document.getElementById('schedOpenDays');
  const openDays = state.settings.schedule.openDays || [];
  el.innerHTML = DAY_LABELS.map(d=>`
    <label class="tag" style="cursor:pointer;">
      <input type="checkbox" class="openDayCheck" value="${d.v}" ${openDays.includes(d.v)?'checked':''} style="margin-right:.4rem;">
      ${d.l}
    </label>
  `).join('');
}

function drawClosures(){
  const el = document.getElementById('closuresList');
  const closures = state.settings.schedule.closures || [];
  if(!closures.length){
    el.innerHTML = '<span style="color:var(--text-light);font-size:.85rem;">Aucune fermeture ponctuelle programmée.</span>';
    return;
  }
  el.innerHTML = closures.map((c,idx)=>`
    <div class="item-row" style="align-items:flex-end;">
      <div class="item-main" style="display:flex;gap:.8rem;flex-wrap:wrap;">
        <div class="field" style="margin-bottom:0;min-width:140px;"><label>Du</label><input type="date" class="closureStart" data-idx="${idx}" value="${c.startDate}"></div>
        <div class="field" style="margin-bottom:0;min-width:140px;"><label>Au</label><input type="date" class="closureEnd" data-idx="${idx}" value="${c.endDate}"></div>
        <div class="field" style="margin-bottom:0;min-width:160px;"><label>Raison (interne)</label><input class="closureReason" data-idx="${idx}" value="${escapeHtml(c.reason||'')}" placeholder="Ex : Congés d'été"></div>
        <div class="field" style="margin-bottom:0;min-width:220px;flex:1;"><label>Message affiché au client</label><input class="closureMessage" data-idx="${idx}" value="${escapeHtml(c.message||'')}" placeholder="Ex : Fermé, retour le 21 août"></div>
      </div>
      <button class="btn btn-danger btn-small" onclick="removeClosure(${idx})">Supprimer</button>
    </div>
  `).join('') + `<button class="btn btn-ghost btn-small" id="btnSaveClosures" style="margin-top:.8rem;">Enregistrer les fermetures</button>`;

  document.getElementById('btnSaveClosures').onclick = async ()=>{
    const backup = JSON.parse(JSON.stringify(state.settings.schedule.closures));
    const starts = document.querySelectorAll('.closureStart');
    const ends = document.querySelectorAll('.closureEnd');
    const reasons = document.querySelectorAll('.closureReason');
    const messages = document.querySelectorAll('.closureMessage');
    const updated = closures.map((c, idx)=>({
      id: c.id,
      startDate: starts[idx].value,
      endDate: ends[idx].value,
      reason: reasons[idx].value.trim(),
      message: messages[idx].value.trim()
    }));
    state.settings.schedule.closures = updated;
    const ok = await saveState(state);
    if(!ok){ state.settings.schedule.closures = backup; return; }
    showToast("Fermetures enregistrées.");
  };
}

function removeClosure(idx){
  state.settings.schedule.closures.splice(idx, 1);
  drawClosures();
}

function drawLedgerList(){
  const el = document.getElementById('ledgerList');
  if(!el) return;
  const ledger = [...(state.revenueLedger||[])].sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  if(!ledger.length){
    el.innerHTML = '<span style="color:var(--text-light);font-size:.85rem;">Aucune ligne enregistrée pour l\'instant.</span>';
    return;
  }
  el.innerHTML = ledger.map(e=>`
    <div class="item-row">
      <div class="item-main">
        <div class="title">${e.dossierNumber?`<span style="color:var(--cyan);">${escapeHtml(e.dossierNumber)}</span> — `:''}${escapeHtml(e.clientName||'—')}</div>
        <div class="meta">${fmtDate(e.date)} · ${money(e.amount)}</div>
      </div>
      <button class="btn btn-danger btn-small" onclick="removeLedgerEntry('${e.interventionId}')">🗑️ Retirer</button>
    </div>
  `).join('');
}

async function removeLedgerEntry(interventionId){
  if(!confirm("Retirer cette ligne du registre de CA ? Ça ne supprime pas le rapport lui-même, juste son impact sur le tableau de bord.")) return;
  const backup = state.revenueLedger;
  state.revenueLedger = (state.revenueLedger||[]).filter(e=>e.interventionId!==interventionId);
  const ok = await saveState(state);
  if(!ok){ state.revenueLedger = backup; return; }
  drawLedgerList();
  showToast("Ligne retirée du registre.");
}

function bindAddTag(settingsKey, elId, inputId, btnId){
  document.getElementById(btnId).onclick = async ()=>{
    const input = document.getElementById(inputId);
    const v = input.value.trim();
    if(!v) return;
    if(state.settings[settingsKey].some(x=>x.toLowerCase()===v.toLowerCase())){ showToast("Déjà présent."); return; }
    const backup = [...state.settings[settingsKey]];
    state.settings[settingsKey].push(v);
    const ok = await saveState(state);
    if(!ok){ state.settings[settingsKey] = backup; return; }
    input.value = "";
    drawTags(settingsKey, elId);
    showToast("Ajouté.");
  };
}

async function removeTag(settingsKey, idx){
  const backup = [...state.settings[settingsKey]];
  state.settings[settingsKey].splice(idx,1);
  const ok = await saveState(state);
  if(!ok){ state.settings[settingsKey] = backup; return; }
  renderParams();
  showToast("Supprimé.");
}
