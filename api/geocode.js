// /api/geocode.js — géolocalise une liste d'adresses (lat/lon) via Nominatim
// (OpenStreetMap, gratuit, sans clé), avec mise en cache dans Supabase pour ne
// jamais re-géolocaliser deux fois la même adresse et respecter la politique
// d'usage de Nominatim (1 requête/seconde max, User-Agent obligatoire).
// Protégé par session : utilisé uniquement par l'appli de gestion (Planning).

import { supabase } from '../lib/supabase.js';

async function requireSession(req, res) {
  const token = req.headers['x-session-token'];
  if (!token) { res.status(401).json({ error: 'Session expirée, reconnectez-vous.' }); return false; }
  const { data, error } = await supabase.from('sessions').select('expires_at').eq('token', token).maybeSingle();
  if (error || !data || new Date(data.expires_at) < new Date()) {
    res.status(401).json({ error: 'Session expirée, reconnectez-vous.' });
    return false;
  }
  return true;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function geocodeOne(address) {
  const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(address);
  const res = await fetch(url, { headers: { 'User-Agent': 'ACServicePro-Gestion/1.0 (contact: ac.service59.pro@gmail.com)' } });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data || !data.length) return null;
  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
}

export default async function handler(req, res) {
  if (!(await requireSession(req, res))) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée.' });

  const addresses = Array.isArray((req.body || {}).addresses) ? req.body.addresses.filter(Boolean) : [];
  if (!addresses.length) return res.status(400).json({ error: 'Aucune adresse fournie.' });

  const results = {};
  const toGeocode = [];

  const { data: cached } = await supabase.from('geocode_cache').select('address, lat, lon').in('address', addresses);
  (cached || []).forEach(row => { results[row.address] = { lat: row.lat, lon: row.lon }; });
  addresses.forEach(a => { if (!results[a]) toGeocode.push(a); });

  for (let i = 0; i < toGeocode.length; i++) {
    const addr = toGeocode[i];
    try {
      const point = await geocodeOne(addr);
      if (point) {
        results[addr] = point;
        await supabase.from('geocode_cache').upsert({ address: addr, lat: point.lat, lon: point.lon, cached_at: new Date().toISOString() });
      } else {
        results[addr] = null;
      }
    } catch (e) {
      results[addr] = null;
    }
    if (i < toGeocode.length - 1) await sleep(1100); // politesse envers Nominatim (max 1 req/s)
  }

  return res.status(200).json({ points: results });
}
