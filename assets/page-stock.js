let state = null;

(async function(){
  state = await requireAuth();
  if(!state) return;
  if(!state.trash) state.trash = [];
  renderNavbar('stock', state);
  renderStock();
})();

function renderStock(){
  const main = document.getElementById('pageContent');
  main.innerHTML = `
    <div class="page-head">
      <h2>Stock <span>embarqué</span></h2>
      <button class="btn btn-primary" style="width:auto" id="newStockBtn">+ Nouvelle pièce</button>
    </div>
    <div class="filters">
      <input id="stockSearch" placeholder="Rechercher une pièce ou référence...">
    </div>
    <div id="stockList"></div>
  `;
  document.getElementById('newStockBtn').onclick = ()=>openStockModal();
  document.getElementById('stockSearch').oninput = drawStockList;
  drawStockList();
}

function drawStockList(){
  const search = (document.getElementById('stockSearch').value||'').toLowerCase();
  let list = [...state.stock].sort((a,b)=>a.name.localeCompare(b.name));
  if(search) list = list.filter(s=>(s.name+' '+(s.ref||'')).toLowerCase().includes(search));
  const el = document.getElementById('stockList');
  if(!list.length){
    el.innerHTML = `<div class="empty-state"><div class="mark">📦</div>Stock vide. Ajoutez vos pièces embarquées.</div>`;
    return;
  }
  el.innerHTML = list.map(s=>{
    const low = Number(s.qty) <= Number(s.threshold);
    return `
    <div class="item-row">
      <div class="item-main">
        <div class="title">${escapeHtml(s.name)}</div>
        <div class="meta">Réf. ${escapeHtml(s.ref||'—')} · Catégorie: ${escapeHtml(s.category||'—')} · Achat: ${money(s.buyPrice)} · Vente: ${money(s.sellPrice)}</div>
      </div>
      <span class="badge ${low?'badge-lowstock':'badge-confirme'}">Qté: ${s.qty} ${low?'(bas)':''}</span>
      <div class="item-actions">
        <button class="btn btn-ghost btn-small" onclick="openStockModal('${s.id}')">Modifier</button>
        <button class="btn btn-danger btn-small" onclick="deleteStock('${s.id}')">Supprimer</button>
      </div>
    </div>
  `;}).join('');
}

function openStockModal(id){
  const editing = id ? state.stock.find(s=>s.id===id) : null;
  const s = editing || {id:uid(), name:'', ref:'', category:state.settings.partCategories[0]||'', qty:0, threshold:2, buyPrice:'', sellPrice:''};
  const modalRoot = document.getElementById('modalRoot');
  modalRoot.innerHTML = `
    <div class="modal-overlay" id="stockOverlay">
      <div class="modal">
        <h3>${editing?'Modifier la':'Nouvelle'} pièce</h3>
        <div class="field"><label>Désignation</label><input id="sName" value="${escapeHtml(s.name)}"></div>
        <div class="modal-row">
          <div class="field"><label>Référence (ex. ASWO)</label><input id="sRef" value="${escapeHtml(s.ref)}"></div>
          <div class="field"><label>Catégorie</label><select id="sCategory">${state.settings.partCategories.map(c=>`<option ${c===s.category?'selected':''}>${c}</option>`).join('')}</select></div>
        </div>
        <div class="modal-row">
          <div class="field"><label>Quantité en stock</label><input type="number" id="sQty" value="${s.qty}"></div>
          <div class="field"><label>Seuil d'alerte</label><input type="number" id="sThreshold" value="${s.threshold}"></div>
        </div>
        <div class="modal-row">
          <div class="field"><label>Prix d'achat (€)</label><input type="number" step="0.01" id="sBuy" value="${s.buyPrice}"></div>
          <div class="field"><label>Prix de vente (€)</label><input type="number" step="0.01" id="sSell" value="${s.sellPrice}"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" style="width:auto" id="sSave">Fermer</button>
        </div>
      </div>
    </div>
  `;

  // Calcul automatique du prix de vente à chaque changement du prix d'achat,
  // selon les paliers de marge configurés dans Paramètres. Reste modifiable ensuite.
  const buyInput = document.getElementById('sBuy');
  const sellInput = document.getElementById('sSell');
  buyInput.addEventListener('input', ()=>{
    const suggested = computeSellPrice(buyInput.value, state.settings.marginTiers);
    if(suggested !== '') sellInput.value = suggested;
  });

  document.getElementById('sSave').onclick = async ()=>{
    const name = document.getElementById('sName').value.trim();
    const hasContent = name
      || document.getElementById('sRef').value.trim()
      || Number(document.getElementById('sQty').value)>0
      || document.getElementById('sBuy').value
      || document.getElementById('sSell').value;
    if(!editing && !hasContent){ closeModal(); return; }
    if(!name){ showToast("La désignation est requise."); return; }
    s.name = name;
    s.ref = document.getElementById('sRef').value.trim();
    s.category = document.getElementById('sCategory').value;
    s.qty = Number(document.getElementById('sQty').value)||0;
    s.threshold = Number(document.getElementById('sThreshold').value)||0;
    s.buyPrice = document.getElementById('sBuy').value;
    s.sellPrice = document.getElementById('sSell').value;
    if(!editing) state.stock.push(s);
    const ok = await saveState(state);
    if(!ok) return;
    closeModal();
    renderNavbar('stock', state);
    drawStockList();
    showToast("Pièce enregistrée.");
  };
}

async function deleteStock(id){
  if(!confirm("Mettre cette pièce à la corbeille ? Tu pourras la restaurer depuis la Corbeille.")) return;
  const backup = state.stock;
  const s = state.stock.find(x=>x.id===id);
  state.stock = state.stock.filter(x=>x.id!==id);
  if(s) moveToTrash(state, 'stock', s.name||'—', s);
  const ok = await saveState(state);
  if(!ok){ state.stock = backup; state.trash.pop(); return; }
  renderNavbar('stock', state);
  drawStockList();
  showToast("Pièce déplacée vers la corbeille.");
}
