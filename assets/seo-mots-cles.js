/* AC SERVICE — mots-clés pour le référencement (aucun affichage).
   Ce fichier complète les « données structurées » (JSON-LD) de la page d'accueil avec la
   liste complète des appareils, marques, pannes et communes desservies, pour que Google
   rattache le site à ces recherches. Il ne modifie rien de ce que voit le visiteur.
   Pour ajouter ou retirer un mot-clé : modifier les listes ci-dessous, rien d'autre. */
(function () {
  'use strict';

  /* ── Appareils (gros électroménager) ── */
  var GROS = [
    'Lave-linge', 'Machine à laver', 'Lave-linge hublot', 'Lave-linge top', 'Lave-linge séchant',
    'Lave-vaisselle', 'Sèche-linge', 'Sèche-linge à condensation', 'Sèche-linge pompe à chaleur',
    'Réfrigérateur', 'Frigo', 'Congélateur', 'Combiné frigo-congélateur', 'Frigo américain', 'Réfrigérateur multi-portes',
    'Cave à vin', 'Machine à glaçons', 'Mini-bar',
    'Four', 'Four encastrable', 'Four électrique', 'Four pyrolyse', 'Four à chaleur tournante',
    'Micro-ondes', 'Micro-ondes encastrable',
    'Plaque de cuisson', 'Plaque à induction', 'Plaque vitrocéramique', 'Table de cuisson électrique', 'Cuisinière électrique',
    'Hotte aspirante', 'Hotte de cuisine'
  ];

  /* ── Appareils (petit électroménager : tout sauf audiovisuel, consoles et gaz) ── */
  var PETIT = [
    'Machine à café', 'Machine à café expresso', 'Machine à café à grains', 'Machine à dosettes', 'Machine à capsules',
    'Nespresso', 'Senseo', 'Dolce Gusto', 'Cafetière', 'Cafetière filtre', 'Tireuse à bière',
    'Bouilloire', 'Théière électrique', 'Grille-pain',
    'Mixeur', 'Blender', 'Mixeur plongeant', 'Robot ménager', 'Robot pâtissier', 'Robot cuiseur', 'Thermomix', 'Cookeo', 'Multicuiseur',
    'Cuiseur vapeur', 'Cuiseur à riz', 'Autocuiseur électrique', 'Friteuse', 'Airfryer', 'Mini-four', 'Machine à pain', 'Yaourtière',
    'Gaufrier', 'Crêpière', 'Appareil à raclette', 'Fondue électrique', 'Plancha électrique', 'Grill électrique', 'Barbecue électrique',
    'Trancheuse', 'Hachoir', 'Centrifugeuse', 'Extracteur de jus', 'Presse-agrumes', 'Sorbetière', 'Machine à pâtes', 'Déshydrateur',
    'Aspirateur', 'Aspirateur traîneau', 'Aspirateur balai', 'Aspirateur sans fil', 'Robot aspirateur', 'Dyson',
    'Nettoyeur vapeur', 'Nettoyeur haute pression', 'Cireuse', 'Fer à repasser', 'Centrale vapeur', 'Défroisseur',
    'Radiateur d’appoint', 'Ventilateur', 'Déshumidificateur', 'Humidificateur', 'Purificateur d’air',
    'Sèche-cheveux', 'Lisseur', 'Tondeuse', 'Rasoir électrique', 'Brosse à dents électrique', 'Épilateur'
  ];

  /* ── Marques ── */
  var MARQUES = [
    'Bosch', 'Siemens', 'Miele', 'Whirlpool', 'Samsung', 'LG', 'Electrolux', 'AEG', 'Candy', 'Hoover', 'Beko', 'Indesit',
    'Brandt', 'De Dietrich', 'Sauter', 'Faure', 'Arthur Martin', 'Haier', 'Hotpoint', 'Zanussi', 'Smeg', 'Liebherr', 'Vedette',
    'Thomson', 'Sharp', 'Panasonic', 'Fagor', 'Ariston', 'Hisense', 'Teka', 'Gaggenau', 'Rosières', 'Scholtès', 'Whirlpool',
    'Tefal', 'Moulinex', 'SEB', 'Rowenta', 'Krups', 'DeLonghi', 'Philips', 'Magimix', 'KitchenAid', 'Kenwood', 'Vorwerk', 'Dyson', 'Nespresso'
  ];

  /* ── Métier et services ── */
  var METIER = [
    'Réparation électroménager', 'Dépannage électroménager', 'Dépannage électroménager à domicile',
    'Réparateur électroménager', 'Technicien électroménager', 'Réparateur indépendant', 'Artisan réparateur',
    'Réparation à domicile', 'Diagnostic de panne', 'Devis gratuit', 'Déplacement inclus', 'Intervention rapide',
    'Remplacement de pièce détachée', 'Réparation toutes marques', 'Réparation à l’atelier', 'Dépôt à l’atelier',
    'Réparation petit électroménager', 'Réparation gros électroménager'
  ];

  /* ── Pannes courantes (chaque panne devient une variante d'une prestation) ── */
  var PRESTATIONS = [
    ['Réparation lave-linge', ['Réparation machine à laver', 'Dépannage lave-linge', 'Lave-linge qui ne vidange plus', 'Lave-linge qui ne démarre plus', 'Lave-linge qui fuit', 'Lave-linge qui n’essore plus', 'Lave-linge qui fait du bruit', 'Lave-linge qui ne chauffe plus', 'Réparation lave-linge séchant']],
    ['Réparation lave-vaisselle', ['Dépannage lave-vaisselle', 'Lave-vaisselle qui ne vidange pas', 'Lave-vaisselle qui ne lave plus', 'Lave-vaisselle qui ne sèche pas', 'Lave-vaisselle qui fuit', 'Lave-vaisselle qui ne démarre pas']],
    ['Réparation sèche-linge', ['Dépannage sèche-linge', 'Sèche-linge qui ne chauffe plus', 'Sèche-linge qui ne sèche pas', 'Sèche-linge dont le tambour ne tourne plus']],
    ['Réparation four et micro-onde', ['Réparation four encastrable', 'Réparation four électrique', 'Réparation micro-ondes', 'Four qui ne chauffe plus', 'Micro-ondes qui ne chauffe plus', 'Plateau de micro-ondes qui ne tourne plus']],
    ['Réparation plaque de cuisson (hors gaz)', ['Réparation plaque à induction', 'Réparation plaque vitrocéramique', 'Plaque de cuisson qui ne chauffe plus', 'Plaque à induction avec code erreur']],
    ['Réparation réfrigérateur et congélateur', ['Réparation frigo', 'Réparation congélateur', 'Réparation frigo américain', 'Frigo qui ne refroidit plus', 'Congélateur qui ne congèle plus', 'Frigo qui fait du givre', 'Frigo qui fuit', 'Réparation cave à vin', 'Réparation machine à glaçons']],
    ['Réparation hotte aspirante', ['Dépannage hotte de cuisine']],
    ['Réparation petit électroménager (dépôt atelier)', ['Réparation centrale vapeur', 'Réparation aspirateur', 'Réparation robot aspirateur', 'Réparation machine à café', 'Réparation cafetière', 'Réparation tireuse à bière', 'Réparation robot de cuisine', 'Réparation friteuse', 'Réparation bouilloire', 'Réparation fer à repasser', 'Réparation sèche-cheveux', 'Réparation radiateur d’appoint']]
  ];

  /* ── Zone : rayon d'environ 40 km autour d'Esquelbecq (59470) ── */
  var COMMUNES = [
    'Esquelbecq', 'Wormhout', 'Herzeele', 'Arneke', 'Ledringhem', 'Zegerscappel', 'Rubrouck', 'Lederzeele', 'Volckerinckhove',
    'Dunkerque', 'Coudekerque-Branche', 'Coudekerque-Village', 'Saint-Pol-sur-Mer', 'Petite-Synthe', 'Grande-Synthe', 'Fort-Mardyck',
    'Loon-Plage', 'Gravelines', 'Bourbourg', 'Leffrinckoucke', 'Zuydcoote', 'Bray-Dunes', 'Ghyvelde', 'Téteghem', 'Uxem',
    'Armbouts-Cappel', 'Cappelle-la-Grande', 'Spycker', 'Bierne', 'Bergues', 'Hoymille', 'Hondschoote', 'Warhem', 'Quaëdypre', 'Socx',
    'Pitgam', 'Killem', 'Looberghe', 'Rexpoëde', 'Oost-Cappel', 'Bollezeele', 'Crochte', 'Steene',
    'Cassel', 'Bavinchove', 'Zuytpeene', 'Noordpeene', 'Oxelaëre', 'Hardifort', 'Sainte-Marie-Cappel', 'Hondeghem',
    'Steenvoorde', 'Eecke', 'Terdeghem', 'Oudezeele', 'Zermezeele', 'Boeschepe', 'Godewaersvelde', 'Houtkerque', 'Winnezeele',
    'Hazebrouck', 'Morbecque', 'Steenbecque', 'Borre', 'Pradelles', 'Strazeele', 'Caëstre', 'Wallon-Cappel', 'Staple', 'Sercus',
    'Ebblinghem', 'Renescure', 'Blaringhem', 'Bailleul', 'Steenwerck', 'Nieppe', 'Méteren', 'Vieux-Berquin', 'Merris', 'Flêtre',
    'Merville', 'Armentières', 'Aire-sur-la-Lys',
    'Saint-Omer', 'Arques', 'Longuenesse', 'Blendecques', 'Helfaut', 'Wizernes', 'Tilques', 'Saint-Martin-lez-Tatinghem',
    'Clairmarais', 'Moulle', 'Lumbres', 'Esquerdes', 'Setques', 'Elnes', 'Acquin-Westbécourt', 'Quelmes', 'Watten', 'Holque',
    'Saint-Momelin', 'Eperlecques', 'Nortkerque', 'Audruicq', 'Ruminghem', 'Nieurlet', 'Millam', 'Saint-Pierre-Brouck',
    'Brouckerque', 'Ardres'
  ];
  var REGIONS = ['Nord', 'Pas-de-Calais', 'Flandre', 'Flandre intérieure', 'Flandre maritime', 'Dunkerquois', 'Audomarois', 'Monts de Flandre', 'Hauts-de-France'];

  /* ── Fusion dans le JSON-LD de la page (jamais d'élément visible) ── */
  function uniq(list) {
    var seen = {}, out = [];
    list.forEach(function (x) { var k = String(x).toLowerCase(); if (!seen[k]) { seen[k] = 1; out.push(x); } });
    return out;
  }

  function enrichir() {
    var el = document.getElementById('localBusinessSchema');
    if (!el) return;
    var biz;
    try { biz = JSON.parse(el.textContent); } catch (e) { return; }

    biz.knowsAbout = uniq((biz.knowsAbout || []).concat(METIER, GROS, PETIT, MARQUES));

    var noms = {};
    biz.makesOffer = biz.makesOffer || [];
    biz.makesOffer.forEach(function (o) {
      var s = o && o.itemOffered; if (!s) return;
      noms[String(s.name).toLowerCase()] = s;
    });
    PRESTATIONS.forEach(function (p) {
      var existant = noms[p[0].toLowerCase()];
      if (existant) {
        existant.alternateName = uniq((existant.alternateName || []).concat(p[1]));
      } else {
        biz.makesOffer.push({ '@type': 'Offer', itemOffered: { '@type': 'Service', name: p[0], alternateName: p[1] } });
      }
    });

    var zone = [{
      '@type': 'GeoCircle',
      geoMidpoint: { '@type': 'GeoCoordinates', latitude: 50.867, longitude: 2.425 },
      geoRadius: '40000'
    }];
    COMMUNES.forEach(function (c) { zone.push({ '@type': 'City', name: c }); });
    REGIONS.forEach(function (r) { zone.push({ '@type': 'AdministrativeArea', name: r }); });
    biz.areaServed = zone;

    el.textContent = JSON.stringify(biz);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enrichir);
  else enrichir();
})();
