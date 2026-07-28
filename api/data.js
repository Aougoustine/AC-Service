// /api/data.js — stocke et renvoie l'intégralité des données de l'appli
// (paramètres, rendez-vous, interventions, stock) dans Supabase, table app_state,
// une seule ligne avec une colonne JSON — même logique qu'avec Redis auparavant.
// Accès protégé : nécessite un jeton de session valide (voir /api/auth.js).

import { supabase } from '../lib/supabase.js';

function defaultState() {
  return {
    settings: {
      applianceTypes: ["Lave-linge", "Lave-vaisselle", "Four", "Réfrigérateur", "Sèche-linge", "Plaque de cuisson", "Autres"],
      brands: ["Bosch", "Whirlpool", "Samsung", "LG", "Electrolux", "Beko", "Indesit", "Siemens", "Candy", "Brandt", "De Dietrich", "Miele"],
      partCategories: ["Électronique", "Moteur", "Chauffe", "Étanchéité", "Mécanique", "Autre"],
      rdvSources: ["Site web", "Téléphone", "WhatsApp", "Manuel"],
      readApiKey: "",
      marginTiers: [
        { max: 10.99, mult: 4 },
        { max: 50.99, mult: 2 },
        { max: 100.99, mult: 1.5 },
        { max: 150.99, mult: 1.25 },
        { max: null, mult: 1.15 }
      ],
      schedule: {
        morningStart: "09:00",
        morningEnd: "12:00",
        afternoonStart: "12:00",
        afternoonEnd: "17:00",
        morningCapacity: 2,
        afternoonCapacity: 2,
        openDays: [1, 2, 3, 4, 5, 6],
        bookingHorizonDays: 14,
        closures: []
      },
      startAddress: "",
      accounting: {
        urssafRate: 10.60,
        taxRate: 1.70,
        selfPayRate: 30
      },
      company: {
        name: "AC SERVICE",
        technicianName: "",
        phone: "07 44 85 98 95",
        email: "ac.service59.pro@gmail.com",
        siret: "10464449700018",
        address: "",
        postalCode: "",
        city: "",
        legalStatus: "Entrepreneur individuel",
        vatNote: "TVA non applicable - Article 293 B du CGI",
        cancellationPolicy: "Toute absence au rendez-vous non signalée au moins 24h à l'avance entraînera des frais de déplacement de 30€ TTC."
      },
      devisValidityDays: 30,
      forfaits: [
        { label: "Forfait cuisson — 60 € TTC", amount: 60 },
        { label: "Forfait lavage / séchage — 65 € TTC", amount: 65 },
        { label: "Forfait froid — 70 € TTC", amount: 70 },
        { label: "Autres appareils — 50 € TTC", amount: 50 }
      ],
      applianceForfaitMap: {
        "Lave-linge": "Forfait lavage / séchage — 65 € TTC",
        "Lave-vaisselle": "Forfait lavage / séchage — 65 € TTC",
        "Sèche-linge": "Forfait lavage / séchage — 65 € TTC",
        "Four": "Forfait cuisson — 60 € TTC",
        "Plaque de cuisson": "Forfait cuisson — 60 € TTC",
        "Réfrigérateur": "Forfait froid — 70 € TTC",
        "Autres": "Autres appareils — 50 € TTC"
      },
      forfaits: [
        { id: "f-cuisson", label: "Forfait cuisson — 60 € TTC", amount: 60 },
        { id: "f-lavage", label: "Forfait lavage / séchage — 65 € TTC", amount: 65 },
        { id: "f-froid", label: "Forfait froid — 70 € TTC", amount: 70 },
        { id: "f-autres", label: "Autres appareils — 50 € TTC", amount: 50 }
      ],
      applianceForfaitMap: {
        "Lave-linge": "f-lavage",
        "Sèche-linge": "f-lavage",
        "Lave-vaisselle": "f-lavage",
        "Four": "f-cuisson",
        "Plaque de cuisson": "f-cuisson",
        "Réfrigérateur": "f-froid",
        "Autres": "f-autres"
      }
    },
    appointments: [],
    devis: [],
    interventions: [],
    stock: [],
    revenueLedger: [],
    clients: [],
    deposits: [],
    trash: []
  };
}

async function requireSession(req, res) {
  const token = req.headers['x-session-token'];
  if (!token) {
    res.status(401).json({ error: 'Session expirée, reconnectez-vous.' });
    return false;
  }
  const { data } = await supabase.from('sessions').select('expires_at').eq('token', token).maybeSingle();
  if (!data || new Date(data.expires_at) < new Date()) {
    res.status(401).json({ error: 'Session expirée, reconnectez-vous.' });
    return false;
  }
  return true;
}

export default async function handler(req, res) {
  if (!(await requireSession(req, res))) return;

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('app_state').select('data').eq('id', 1).maybeSingle();
    if (error) return res.status(500).json({ error: 'Erreur de lecture des données.' });
    const d = defaultState();
    const parsed = data ? data.data : null;
    let mergedSettings = null;
    if(parsed){
      mergedSettings = Object.assign({}, d.settings, parsed.settings || {});
      // Fusion en profondeur des sous-objets : sinon, un compte qui avait déjà
      // enregistré des réglages "company"/"schedule"/"accounting" AVANT l'ajout de
      // nouveaux champs (ex. vatNote, adresse) perdrait ces nouveaux champs, la
      // fusion au premier niveau remplaçant l'objet entier plutôt que de le compléter.
      mergedSettings.company = Object.assign({}, d.settings.company, (parsed.settings && parsed.settings.company) || {});
      mergedSettings.schedule = Object.assign({}, d.settings.schedule, (parsed.settings && parsed.settings.schedule) || {});
      mergedSettings.accounting = Object.assign({}, d.settings.accounting, (parsed.settings && parsed.settings.accounting) || {});
      mergedSettings.applianceForfaitMap = Object.assign({}, d.settings.applianceForfaitMap, (parsed.settings && parsed.settings.applianceForfaitMap) || {});
    }
    const state = parsed ? {
      settings: mergedSettings,
      appointments: parsed.appointments || [],
      devis: parsed.devis || [],
      interventions: parsed.interventions || [],
      stock: parsed.stock || [],
      revenueLedger: parsed.revenueLedger || [],
      clients: parsed.clients || [],
      deposits: parsed.deposits || [],
      trash: parsed.trash || []
    } : d;
    return res.status(200).json({ state });
  }

  if (req.method === 'PUT') {
    const { state } = req.body || {};
    if (!state) {
      return res.status(400).json({ error: 'Corps de requête invalide.' });
    }
    const { error } = await supabase.from('app_state').upsert({
      id: 1, data: state, updated_at: new Date().toISOString()
    });
    if (error) return res.status(500).json({ error: "Échec de l'enregistrement." });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Méthode non autorisée.' });
}
