// /api/send-email.js — envoie un email au client (rapport, devis, ou bon de dépôt),
// avec pièce(s) jointe(s) — PDF via lien Supabase Storage, carte de visite via son
// adresse publique — le tout transmis à Resend (domaine acservicepro.fr vérifié :
// SPF/DKIM/DMARC). Un seul fichier générique pour les trois usages : ils étaient
// quasi identiques, et le plan gratuit de Vercel limite le nombre de fonctions
// serverless par déploiement.
//
// Variable d'environnement à définir dans Vercel > Project Settings > Environment Variables :
//   RESEND_API_KEY
//
// Protégé par session : seule l'appli connectée peut déclencher un envoi.

import { supabase } from '../lib/supabase.js';

const SENDER = 'AC SERVICE <contact@acservicepro.fr>';

async function requireSession(req, res) {
  const token = req.headers['x-session-token'];
  if (!token) { res.status(401).json({ error: 'Session expirée, reconnectez-vous.' }); return false; }
  const { data } = await supabase.from('sessions').select('expires_at').eq('token', token).maybeSingle();
  if (!data || new Date(data.expires_at) < new Date()) {
    res.status(401).json({ error: 'Session expirée, reconnectez-vous.' });
    return false;
  }
  return true;
}

export default async function handler(req, res) {
  if (!(await requireSession(req, res))) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée.' });

  const { to, subject, text, html, attachments } = req.body || {};
  if (!to) return res.status(400).json({ error: 'Adresse email du client manquante.' });
  if (!attachments || !attachments.length) return res.status(400).json({ error: 'Pièce jointe manquante.' });

  if (!process.env.RESEND_API_KEY) {
    return res.status(500).json({ error: "Envoi non configuré côté serveur (variable RESEND_API_KEY manquante)." });
  }

  try {
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: SENDER,
        to: String(to).slice(0, 200),
        subject: (subject || 'AC SERVICE').slice(0, 200),
        text: (text || '').slice(0, 5000),
        ...(html ? { html: String(html).slice(0, 20000) } : {}),
        attachments,
      }),
    });

    if (!resendRes.ok) {
      const errBody = await resendRes.json().catch(() => ({}));
      return res.status(500).json({ error: "Échec de l'envoi : " + (errBody.message || resendRes.statusText) });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Échec de l'envoi : " + (err && err.message ? err.message : String(err)) });
  }
}
