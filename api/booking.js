// /api/booking.js — libère un créneau réservé (table rdv_bookings) quand un RDV
// venant du site est annulé, replanifié ou supprimé dans l'appli, pour que la place
// redevienne immédiatement disponible sur le calendrier public.
// Protégé par session : usage interne à l'appli uniquement.

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

export default async function handler(req, res) {
  if (!(await requireSession(req, res))) return;
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Méthode non autorisée.' });

  const id = req.query && req.query.id;
  if (!id) return res.status(400).json({ error: 'Paramètre id manquant.' });

  const { error } = await supabase.from('rdv_bookings').delete().eq('id', id);
  if (error) return res.status(500).json({ error: 'Erreur lors de la libération du créneau.' });
  return res.status(200).json({ ok: true });
}
