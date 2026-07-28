// /api/photos.js — stocke chaque photo dans Supabase Storage (bucket "photos", privé),
// plutôt que dans la base de données : plus adapté aux fichiers binaires, avec CDN intégré.
// Les intervention ne gardent qu'une référence (chemin) vers chaque photo.
//
// Compatibilité front-end : la réponse GET garde la clé "dataUrl" utilisée par
// assets/app.js, même si la valeur est désormais une URL signée temporaire (et non
// plus une data URI base64) — un <img src="..."> fonctionne identiquement dans les
// deux cas, donc aucune modification n'était nécessaire côté pages.

import { supabase } from '../lib/supabase.js';

const BUCKET = 'photos';
const MAX_BYTES = 6 * 1024 * 1024; // ~6 Mo (marge large, la photo est déjà compressée côté client)

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

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export default async function handler(req, res) {
  if (!(await requireSession(req, res))) return;

  if (req.method === 'POST') {
    // Action "createUploadUrl" : délivre une autorisation d'upload direct (utilisée
    // pour les PDF de rapports/devis/dépôts, envoyés directement à Supabase Storage
    // plutôt que via cette fonction — pour ne jamais buter sur la limite de requête
    // de 4,5 Mo de Vercel). Regroupé ici plutôt que dans un nouveau fichier séparé :
    // le plan Vercel gratuit limite le nombre total de fonctions serverless.
    if (req.body && req.body.action === 'createUploadUrl') {
      const ext = String(req.body.ext || '').replace(/[^a-z0-9]/gi, '') || 'pdf';
      const path = genId() + '.' + ext;
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
      if (error) return res.status(500).json({ error: "Impossible de préparer l'envoi du fichier : " + error.message });
      return res.status(200).json({ path: data.path, token: data.token, signedUrl: data.signedUrl });
    }

    const { dataUrl } = req.body || {};
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Image invalide.' });
    }
    const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) {
      return res.status(400).json({ error: 'Format image invalide.' });
    }
    const mime = match[1];
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length > MAX_BYTES) {
      return res.status(413).json({ error: 'Photo trop volumineuse, même après compression.' });
    }
    const ext = mime.split('/')[1] || 'jpg';
    const path = genId() + '.' + ext;
    const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
      contentType: mime, upsert: false
    });
    if (error) return res.status(500).json({ error: "Échec de l'envoi de la photo." });
    return res.status(201).json({ id: path });
  }

  if (req.method === 'GET') {
    const id = req.query && req.query.id;
    if (!id) return res.status(400).json({ error: 'Paramètre id manquant.' });
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(id, 600); // 10 min
    if (error || !data) return res.status(404).json({ error: 'Photo introuvable.' });
    return res.status(200).json({ dataUrl: data.signedUrl });
  }

  if (req.method === 'DELETE') {
    const id = req.query && req.query.id;
    if (!id) return res.status(400).json({ error: 'Paramètre id manquant.' });
    await supabase.storage.from(BUCKET).remove([id]);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Méthode non autorisée.' });
}
