// /api/availability.js — endpoint PUBLIC (pas de session, pas de clé API) : renvoie
// les horaires configurés et les places restantes par jour/créneau, pour que le
// formulaire de RDV du site public puisse afficher un vrai calendrier de dispos.
// Aucune donnée sensible exposée : juste des compteurs et des horaires.

import { supabase } from '../lib/supabase.js';

function resolveAllowedOrigin(req) {
  const origin = req.headers.origin || '';
  const configured = process.env.ALLOWED_ORIGIN || '';
  if (!origin || !configured) return configured || '*';
  const bareHost = (h) => h.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
  return bareHost(origin) === bareHost(configured) ? origin : configured;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysISO(iso, days) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', resolveAllowedOrigin(req));
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Méthode non autorisée.' });

  try {
    const { data: stateRow, error: stateErr } = await supabase
      .from('app_state').select('data').eq('id', 1).maybeSingle();
    if (stateErr) return res.status(500).json({ error: 'Erreur de lecture des réglages.' });

    const schedule = (stateRow && stateRow.data && stateRow.data.settings && stateRow.data.settings.schedule) || {
      morningStart: "09:00", morningEnd: "12:00", afternoonStart: "12:00", afternoonEnd: "17:00",
      morningCapacity: 2, afternoonCapacity: 2, openDays: [1,2,3,4,5,6], bookingHorizonDays: 14, closures: []
    };

    const from = todayISO();
    const to = addDaysISO(from, schedule.bookingHorizonDays || 14);

    const { data: rows, error: availErr } = await supabase.rpc('get_availability', { p_from: from, p_to: to });
    if (availErr) return res.status(500).json({ error: 'Erreur de calcul des disponibilités : ' + availErr.message });

    const byDay = {};
    (rows || []).forEach(r => {
      const key = r.day;
      if (!byDay[key]) byDay[key] = { date: key, isOpen: r.is_open, closureMessage: r.closure_message || null };
      if (r.slot === 'morning') { byDay[key].morningRemaining = r.remaining; byDay[key].morningCapacity = r.capacity; }
      if (r.slot === 'afternoon') { byDay[key].afternoonRemaining = r.remaining; byDay[key].afternoonCapacity = r.capacity; }
    });

    const days = Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date));

    return res.status(200).json({ schedule, days });
  } catch (err) {
    return res.status(500).json({ error: 'Erreur serveur inattendue : ' + (err && err.message ? err.message : String(err)) });
  }
}
