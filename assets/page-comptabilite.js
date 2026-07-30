let state = null;
let periodType = 'mois'; // 'mois' | 'trimestre' | 'annee'
let periodYear, periodMonth, periodQuarter;

(async function(){
  state = await requireAuth();
  if(!state) return;
  renderNavbar('comptabilite', state);
  const now = new Date();
  periodYear = now.getFullYear();
  periodMonth = now.getMonth();
  periodQuarter = Math.floor(periodMonth/3);
  renderComptabilite();
})();

const MOIS_LONG = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

function periodRange(){
  if(periodType==='mois'){
    const from = periodYear+'-'+String(periodMonth+1).padStart(2,'0')+'-01';
    const to = periodYear+'-'+String(periodMonth+1).padStart(2,'0')+'-31';
    return { from, to, label: MOIS_LONG[periodMonth]+' '+periodYear };
  }
  if(periodType==='trimestre'){
    const startMonth = periodQuarter*3;
    const endMonth = startMonth+2;
    const from = periodYear+'-'+String(startMonth+1).padStart(2,'0')+'-01';
    const to = periodYear+'-'+String(endMonth+1).padStart(2,'0')+'-31';
    return { from, to, label: 'T'+(periodQuarter+1)+' '+periodYear+' ('+MOIS_LONG[startMonth]+' – '+MOIS_LONG[endMonth]+')' };
  }
  const from = periodYear+'-01-01';
  const to = periodYear+'-12-31';
  return { from, to, label: 'Année '+periodYear };
}

function computeCaFromLedger(){
  const { from, to } = periodRange();
  return (state.revenueLedger||[])
    .filter(e=>e.date >= from && e.date <= to)
    .reduce((s,e)=>s+(Number(e.amount)||0), 0);
}

function renderComptabilite(){
  const main = document.getElementById('pageContent');
  const auto = computeCaFromLedger();
  main.innerHTML = `
    <div class="page-head"><h2>Comptabi<span>lité</span></h2></div>

    <div class="section-block">
      <h3>Période</h3>
      <div style="display:flex;gap:.6rem;flex-wrap:wrap;align-items:center;margin-bottom:1rem;">
        <select id="periodType">
          <option value="mois">Mois</option>
          <option value="trimestre">Trimestre</option>
          <option value="annee">Année</option>
        </select>
        <button class="btn btn-ghost btn-small" id="periodPrev">‹</button>
        <strong id="periodLabel" style="font-family:'Rajdhani',sans-serif;font-size:1.05rem;text-transform:uppercase;letter-spacing:.03em;min-width:220px;text-align:center;"></strong>
        <button class="btn btn-ghost btn-small" id="periodNext">›</button>
      </div>
      <p style="font-size:.82rem;color:var(--text-light);">
        CA calculé automatiquement depuis vos rapports encaissés (case "Paiement effectué") sur cette période — vous pouvez le modifier ci-dessous pour simuler un autre montant.
      </p>
    </div>

    <div class="section-block">
      <h3>Chiffre d'affaires de la période</h3>
      <div class="field" style="max-width:260px;">
        <label>CA (€)</label>
        <input type="number" step="0.01" id="caInput" value="${auto.toFixed(2)}">
      </div>
      <button class="btn btn-ghost btn-small" id="btnResetCa">↺ Reprendre le CA automatique (${money(auto)})</button>
    </div>

    <div class="section-block">
      <h3>Répartition</h3>
      <div id="breakdownBox"></div>
      <p style="font-size:.78rem;color:var(--text-light);margin-top:1rem;">
        Taux utilisés : URSSAF ${state.settings.accounting.urssafRate}% · Impôts ${state.settings.accounting.taxRate}% · Part à me verser ${state.settings.accounting.selfPayRate}% — modifiables dans Paramètres → 🧮 Comptabilité.
      </p>
    </div>

    <div class="section-block">
      <h3>🧮 Calculatrice de prix de vente d'une pièce</h3>
      <p style="font-size:.85rem;color:var(--text-light);margin-bottom:1rem;">
        Calcule le prix de vente suggéré à partir des paliers de marge définis dans Paramètres → Tarifs, sans avoir besoin de créer la pièce dans le Stock — pratique pour un chiffrage rapide au téléphone.
      </p>
      <div class="field" style="max-width:220px;"><label>Prix d'achat (€)</label><input type="number" step="0.01" id="calcBuyPrice" placeholder="Ex : 25"></div>
      <div id="calcSellPriceResult" style="margin-top:1rem;"></div>
    </div>
  `;

  document.getElementById('periodType').value = periodType;
  document.getElementById('periodType').onchange = (e)=>{ periodType = e.target.value; refreshPeriod(); };
  document.getElementById('periodPrev').onclick = ()=>{ shiftPeriod(-1); };
  document.getElementById('periodNext').onclick = ()=>{ shiftPeriod(1); };
  document.getElementById('caInput').addEventListener('input', drawBreakdown);
  document.getElementById('btnResetCa').onclick = ()=>{
    document.getElementById('caInput').value = computeCaFromLedger().toFixed(2);
    drawBreakdown();
  };
  document.getElementById('calcBuyPrice').oninput = (e)=>{
    const resultEl = document.getElementById('calcSellPriceResult');
    const buyPrice = Number(e.target.value);
    if(!buyPrice || buyPrice <= 0){ resultEl.innerHTML = ''; return; }

    const tiers = state.settings.marginTiers || [];
    const list = (tiers.length ? tiers : [{max:null, mult:1}]);
    const sorted = [...list].sort((a,b)=>{
      const am = (a.max===null||a.max===undefined) ? Infinity : Number(a.max);
      const bm = (b.max===null||b.max===undefined) ? Infinity : Number(b.max);
      return am - bm;
    });
    let appliedTier = sorted[sorted.length-1];
    for(const t of sorted){
      const max = (t.max===null||t.max===undefined) ? Infinity : Number(t.max);
      if(buyPrice <= max){ appliedTier = t; break; }
    }
    const sellPrice = computeSellPrice(buyPrice, tiers);
    const margin = sellPrice - buyPrice;
    const tierLabel = (appliedTier.max===null||appliedTier.max===undefined)
      ? `palier illimité (x${appliedTier.mult})`
      : `palier jusqu'à ${money(appliedTier.max)} (x${appliedTier.mult})`;

    resultEl.innerHTML = `
      <div style="background:rgba(0,180,216,.08);border:1px solid rgba(0,180,216,.3);border-radius:10px;padding:1rem 1.2rem;">
        <div style="font-family:'Rajdhani',sans-serif;font-weight:700;font-size:1.4rem;color:var(--cyan);">Prix de vente suggéré : ${money(sellPrice)}</div>
        <div style="font-size:.85rem;color:var(--text-light);margin-top:.4rem;">Marge appliquée : ${tierLabel} · Bénéfice : +${money(margin)}</div>
      </div>
    `;
  };

  refreshPeriod();
}

function shiftPeriod(delta){
  if(periodType==='mois'){
    periodMonth += delta;
    if(periodMonth<0){ periodMonth=11; periodYear--; }
    if(periodMonth>11){ periodMonth=0; periodYear++; }
  } else if(periodType==='trimestre'){
    periodQuarter += delta;
    if(periodQuarter<0){ periodQuarter=3; periodYear--; }
    if(periodQuarter>3){ periodQuarter=0; periodYear++; }
  } else {
    periodYear += delta;
  }
  refreshPeriod();
}

function refreshPeriod(){
  const { label } = periodRange();
  document.getElementById('periodLabel').textContent = label;
  const auto = computeCaFromLedger();
  document.getElementById('caInput').value = auto.toFixed(2);
  document.getElementById('btnResetCa').textContent = '↺ Reprendre le CA automatique ('+money(auto)+')';
  drawBreakdown();
}

function drawBreakdown(){
  const ca = Number(document.getElementById('caInput').value) || 0;
  const acc = state.settings.accounting;
  const urssaf = ca * (Number(acc.urssafRate)||0) / 100;
  const taxes = ca * (Number(acc.taxRate)||0) / 100;
  const selfPay = ca * (Number(acc.selfPayRate)||0) / 100;
  const remainder = Math.max(0, ca - urssaf - taxes - selfPay);

  document.getElementById('breakdownBox').innerHTML = `
    <div style="background:rgba(0,180,216,.08);border:1px solid rgba(0,180,216,.3);border-radius:10px;padding:1.2rem 1.4rem;display:flex;flex-direction:column;gap:.7rem;">
      <div style="display:flex;justify-content:space-between;font-size:.95rem;">
        <span>Cotisations URSSAF (${acc.urssafRate}%)</span>
        <strong>${money(urssaf)}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:.95rem;">
        <span>Impôts (${acc.taxRate}%)</span>
        <strong>${money(taxes)}</strong>
      </div>
      <div style="border-top:1px solid var(--border);margin:.2rem 0;"></div>
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span style="font-family:'Rajdhani',sans-serif;font-weight:700;text-transform:uppercase;font-size:1.05rem;color:var(--cyan);">À me verser (${acc.selfPayRate}%)</span>
        <span style="font-family:'Rajdhani',sans-serif;font-weight:700;font-size:1.4rem;color:var(--cyan);">${money(selfPay)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span style="font-family:'Rajdhani',sans-serif;font-weight:700;text-transform:uppercase;font-size:.95rem;">Carburant &amp; autres frais (reste)</span>
        <span style="font-family:'Rajdhani',sans-serif;font-weight:700;font-size:1.1rem;">${money(remainder)}</span>
      </div>
    </div>
  `;
}
