let state = null;

(async function(){
  state = await requireAuth();
  if(!state) return;
  renderNavbar('dashboard', state);
  renderDashboard();
})();

function renderDashboard(){
  const main = document.getElementById('pageContent');
  const today = todayISO();
  const rdvToday = state.appointments.filter(a=>a.date===today && a.status!=='Annulé');
  const rdvUpcoming = state.appointments.filter(a=>a.date>today && a.status!=='Annulé' && a.status!=='Terminé');
  const thisMonth = today.slice(0,7);
  const monthInterv = state.interventions.filter(i=>i.date && i.date.slice(0,7)===thisMonth);
  // Le CA facturé ne se recalcule plus depuis les rapports en direct : il vient du
  // registre verrouillé (state.revenueLedger), qui ne bouge plus une fois une ligne
  // enregistrée — même si le rapport correspondant est ensuite supprimé. Voir
  // Paramètres > Corrections du tableau de bord pour une correction manuelle.
  const monthLedger = (state.revenueLedger||[]).filter(e=>e.date && e.date.slice(0,7)===thisMonth);
  const monthRevenue = monthLedger.reduce((s,e)=>s+(Number(e.amount)||0),0);
  const lowStock = state.stock.filter(s=>Number(s.qty) <= Number(s.threshold));

  // ── Statistiques ──
  const devisAnswered = (state.devis||[]).filter(d=>d.status==='Accepté' || d.status==='Refusé');
  const devisAccepted = devisAnswered.filter(d=>d.status==='Accepté').length;
  const devisRefused = devisAnswered.length - devisAccepted;
  const acceptanceRate = devisAnswered.length ? Math.round((devisAccepted/devisAnswered.length)*100) : null;

  const applianceCounts = {};
  const brandCounts = {};
  (state.interventions||[]).forEach(iv=>{
    (iv.devices && iv.devices.length ? iv.devices : [iv]).forEach(d=>{
      if(d.applianceType) applianceCounts[d.applianceType] = (applianceCounts[d.applianceType]||0)+1;
      if(d.brand) brandCounts[d.brand] = (brandCounts[d.brand]||0)+1;
    });
  });
  const topAppliances = Object.entries(applianceCounts).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const topBrands = Object.entries(brandCounts).sort((a,b)=>b[1]-a[1]).slice(0,5);

  main.innerHTML = `
    <div class="page-head"><h2>Tableau de <span>bord</span></h2></div>
    <div class="stat-grid">
      <div class="stat-card"><div class="num">${rdvToday.length}</div><div class="lbl">RDV aujourd'hui</div></div>
      <div class="stat-card"><div class="num">${rdvUpcoming.length}</div><div class="lbl">RDV à venir</div></div>
      <div class="stat-card"><div class="num">${monthInterv.length}</div><div class="lbl">Interventions ce mois</div></div>
      <div class="stat-card"><div class="num">${money(monthRevenue)}</div><div class="lbl">CA facturé ce mois</div></div>
      <div class="stat-card ${lowStock.length?'warn':''}"><div class="num">${lowStock.length}</div><div class="lbl">Pièces en stock bas</div></div>
    </div>

    <div class="section-block">
      <h3>Prochains rendez-vous</h3>
      <div id="dashRdvList"></div>
    </div>

    ${lowStock.length ? `
    <div class="section-block">
      <h3>⚠️ Alertes stock</h3>
      <div id="dashStockList"></div>
    </div>` : ''}

    <div class="section-block">
      <h3>📊 Statistiques</h3>
      <div class="stat-grid" style="margin-bottom:1.2rem;">
        <div class="stat-card"><div class="num">${acceptanceRate!==null?acceptanceRate+'%':'—'}</div><div class="lbl">Taux d'acceptation des devis${devisAnswered.length?` (${devisAccepted}/${devisAnswered.length})`:''}</div></div>
      </div>
      <div class="modal-row">
        <div>
          <h4 style="font-family:'Rajdhani',sans-serif;font-size:.9rem;text-transform:uppercase;color:var(--text-light);letter-spacing:.03em;margin-bottom:.6rem;">Appareils les plus fréquents</h4>
          ${topAppliances.length ? topAppliances.map(([name,count])=>`
            <div style="display:flex;justify-content:space-between;padding:.4rem 0;border-bottom:1px solid var(--border);font-size:.9rem;">
              <span>${escapeHtml(name)}</span><strong>${count}</strong>
            </div>
          `).join('') : '<span style="color:var(--text-light);font-size:.85rem;">Pas encore assez de données.</span>'}
        </div>
        <div>
          <h4 style="font-family:'Rajdhani',sans-serif;font-size:.9rem;text-transform:uppercase;color:var(--text-light);letter-spacing:.03em;margin-bottom:.6rem;">Marques les plus fréquentes</h4>
          ${topBrands.length ? topBrands.map(([name,count])=>`
            <div style="display:flex;justify-content:space-between;padding:.4rem 0;border-bottom:1px solid var(--border);font-size:.9rem;">
              <span>${escapeHtml(name)}</span><strong>${count}</strong>
            </div>
          `).join('') : '<span style="color:var(--text-light);font-size:.85rem;">Pas encore assez de données.</span>'}
        </div>
      </div>
    </div>
  `;

  const list = [...rdvToday, ...rdvUpcoming].sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time)).slice(0,6);
  const dashRdv = document.getElementById('dashRdvList');
  if(!list.length){
    dashRdv.innerHTML = `<div class="empty-state"><div class="mark">📅</div>Aucun rendez-vous à venir</div>`;
  } else {
    dashRdv.innerHTML = list.map(a=>`
      <div class="item-row">
        <div class="item-main">
          <div class="title">${escapeHtml(a.clientName)} — ${escapeHtml(a.applianceType||'')}</div>
          <div class="meta">${fmtDate(a.date)} ${a.time?('à '+a.time):''} · ${escapeHtml(a.address||'')}</div>
        </div>
        <span class="badge ${statusBadgeClass(a.status)}">${a.status}</span>
      </div>
    `).join('');
  }

  if(lowStock.length){
    document.getElementById('dashStockList').innerHTML = lowStock.map(s=>`
      <div class="item-row">
        <div class="item-main">
          <div class="title">${escapeHtml(s.name)}</div>
          <div class="meta">Réf. ${escapeHtml(s.ref||'—')} · Stock: ${s.qty} (seuil: ${s.threshold})</div>
        </div>
        <span class="badge badge-lowstock">Stock bas</span>
      </div>
    `).join('');
  }
}
