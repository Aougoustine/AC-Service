/* AC SERVICE — prix affichés sur les pages de prestations.
   Les montants écrits dans le HTML sont une valeur de secours ; ils sont remplacés par ceux réglés
   dans l'appli de gestion (Paramètres > Tarifs), comme sur la page d'accueil. Si l'appel échoue,
   le texte d'origine reste affiché tel quel. */
(function () {
  'use strict';
  var els = document.querySelectorAll('[data-forfait]');
  if (!els.length) return;
  fetch('https://ac-service-application.vercel.app/api/forfaits-public')
    .then(function (r) { if (!r.ok) throw new Error('statut'); return r.json(); })
    .then(function (data) {
      var f = data.forfaits || [];
      function montant(re) {
        for (var i = 0; i < f.length; i++) { if (re.test(f[i].label || '')) return Math.round(f[i].amount); }
        return null;
      }
      var prix = {
        cuisson: montant(/cuisson/i),
        lavage: montant(/lavage|séchage/i),
        froid: montant(/froid/i),
        depot: montant(/dépôt|depot|diagnostic/i),
        passage2: data.secondVisitFee != null ? Math.round(data.secondVisitFee) : null
      };
      els.forEach(function (el) {
        var v = prix[el.getAttribute('data-forfait')];
        if (v != null && !isNaN(v)) el.textContent = v;
      });
    })
    .catch(function () { /* garde les montants du HTML */ });
})();
