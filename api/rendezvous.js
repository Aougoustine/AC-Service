// /api/rendezvous.js — passerelle avec le site public, sur Supabase (table pending_rdv).
// Reçoit les demandes de RDV depuis le formulaire du site public (POST),
// et les met à disposition de l'appli de gestion (GET), qui les importe puis
// vide la file (DELETE).
//
// Variables d'environnement à définir dans Vercel > Project Settings > Environment Variables :
//   SUPABASE_URL        -> URL du projet Supabase (Project Settings > API)
//   SUPABASE_SECRET_KEY -> clé "Secret" (sb_secret_...), jamais exposée au navigateur
//   RDV_WRITE_KEY       -> clé utilisée par le FORMULAIRE DU SITE PUBLIC pour créer une demande.
//                          Cette clé finira dans le code JS visible du site : c'est normal et
//                          sans danger, elle ne permet QUE de créer une entrée dans la file.
//   RDV_READ_KEY        -> clé SECRÈTE utilisée uniquement par l'appli de gestion (Paramètres)
//                          pour lire puis vider la file. Ne jamais la mettre sur le site public.
//   ALLOWED_ORIGIN      -> ex. https://acservicepro.fr (seul domaine autorisé à faire un POST)

import { supabase } from '../lib/supabase.js';
import { randomUUID } from 'crypto';

const PHOTOS_BUCKET = 'photos';
const PHOTO_MAX_BYTES = 6 * 1024 * 1024; // ~6 Mo, cohérent avec api/photos.js

function genPhotoId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// Upload une photo envoyée par le formulaire public (déjà compressée côté navigateur)
// dans le même bucket Supabase Storage que les photos de rapports/dépôts. Échec
// silencieux (retourne null) : une photo manquante ne doit jamais faire échouer la
// création du RDV lui-même.
async function uploadGatewayPhoto(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return null;
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  const mime = match[1];
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > PHOTO_MAX_BYTES) return null;
  const ext = mime.split('/')[1] || 'jpg';
  const path = genPhotoId() + '.' + ext;
  const { error } = await supabase.storage.from(PHOTOS_BUCKET).upload(path, buffer, {
    contentType: mime, upsert: false
  });
  if (error) return null;
  return path;
}

// Accepte l'origine du site autorisé, avec ou sans le préfixe "www." — une simple
// égalité de chaînes entre ALLOWED_ORIGIN et l'en-tête Origin envoyé par le navigateur
// est trop fragile (acservicepro.fr et www.acservicepro.fr sont deux origines distinctes
// du point de vue CORS, même si c'est le même site pour un visiteur).
function resolveAllowedOrigin(req) {
  const origin = req.headers.origin || '';
  const configured = process.env.ALLOWED_ORIGIN || '';
  if (!origin || !configured) return configured || '*';
  const bareHost = (h) => h.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
  return bareHost(origin) === bareHost(configured) ? origin : configured;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', resolveAllowedOrigin(req));
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const apiKey = req.headers['x-api-key'];

  // ── Le site public envoie un nouveau RDV ──
  if (req.method === 'POST') {
    if (!process.env.RDV_WRITE_KEY || apiKey !== process.env.RDV_WRITE_KEY) {
      return res.status(401).json({ error: 'Clé API invalide.' });
    }
    const body = req.body || {};
    if (!body.clientName) {
      return res.status(400).json({ error: 'Le champ clientName est requis.' });
    }
    const isDepositRequest = body.requestType === 'depot';

    // Une demande de dépôt n'a pas de créneau à réserver (pas de calendrier, pas de
    // places limitées — le rendez-vous de dépôt se convient ensuite par téléphone),
    // donc pas de date/créneau à valider dans ce cas.
    let bookingDate = '', slot = '';
    if (!isDepositRequest) {
      bookingDate = String(body.date || '').slice(0, 10);
      slot = String(body.slot || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(bookingDate) || !['morning', 'afternoon'].includes(slot)) {
        return res.status(400).json({ error: 'Date ou créneau invalide.' });
      }
    }
    const payload = {
      clientName: String(body.clientName).slice(0, 200),
      firstName: String(body.firstName || '').slice(0, 100),
      lastName: String(body.lastName || '').slice(0, 100),
      phone: String(body.phone || '').slice(0, 50),
      email: String(body.email || '').slice(0, 200),
      address: String(body.address || '').slice(0, 300),
      postalCode: String(body.postalCode || '').slice(0, 10),
      city: String(body.city || '').slice(0, 150),
      applianceType: String(body.applianceType || '').slice(0, 100),
      brand: String(body.brand || '').slice(0, 150),
      model: String(body.model || '').slice(0, 150),
      referral: String(body.referral || '').slice(0, 150),
      issue: String(body.issue || '').slice(0, 1000),
      receivedAt: new Date().toISOString(),
      requestType: isDepositRequest ? 'depot' : 'domicile',
    };

    // Photos jointes par le client (déjà compressées côté navigateur) : uploadées
    // dans le même bucket que les photos de rapports/dépôts. Échec silencieux —
    // ne bloque jamais la création du RDV si l'upload d'une photo échoue.
    const photos = [];
    const photoAppareilId = await uploadGatewayPhoto(body.photoAppareilDataUrl);
    if (photoAppareilId) photos.push({ id: photoAppareilId, name: "Photo de l'appareil" });
    const photoPlaqueId = await uploadGatewayPhoto(body.photoPlaqueDataUrl);
    if (photoPlaqueId) photos.push({ id: photoPlaqueId, name: 'Photo de la plaque signalétique' });
    if (photos.length) payload.photos = photos;

    if (isDepositRequest) {
      // Pas de créneau, pas de places limitées : on enregistre directement la
      // demande, elle atterrira dans "Demandes de dépôt en attente" côté appli.
      const { data: inserted, error: insertError } = await supabase
        .from('pending_rdv')
        .insert({ id: randomUUID(), payload })
        .select('id')
        .single();
      if (insertError) return res.status(500).json({ error: "Échec de l'enregistrement de la demande : " + insertError.message });
      return res.status(201).json({ ok: true, id: inserted.id });
    }

    const { data, error } = await supabase.rpc('book_slot', {
      p_date: bookingDate,
      p_slot: slot,
      p_payload: payload
    });
    if (error) return res.status(500).json({ error: "Échec de l'enregistrement de la demande : " + error.message });

    if (!data || !data.ok) {
      const reason = data ? data.error : 'unknown';
      const messages = {
        full: 'Ce créneau est complet, merci de choisir un autre jour ou créneau.',
        closed_day: "Nous sommes fermés ce jour-là.",
        closed_period: (data && data.message) || 'Fermé sur cette période.',
        out_of_range: 'Cette date est trop éloignée pour une réservation en ligne.',
        invalid_slot: 'Créneau invalide.',
        not_configured: "L'agenda n'est pas encore configuré.",
        slot_passed: "Ce créneau est déjà passé pour aujourd'hui, merci de choisir un autre horaire."
      };
      return res.status(409).json({ error: messages[reason] || 'Impossible de réserver ce créneau.', reason });
    }

    return res.status(201).json({ ok: true, id: data.id });
  }

  // ── L'appli de gestion récupère les demandes en attente ──
  if (req.method === 'GET') {
    if (!process.env.RDV_READ_KEY || apiKey !== process.env.RDV_READ_KEY) {
      return res.status(401).json({ error: 'Clé API invalide.' });
    }
    const { data, error } = await supabase
      .from('pending_rdv')
      .select('payload')
      .order('created_at', { ascending: true });
    if (error) return res.status(500).json({ error: 'Erreur de lecture de la file.' });
    return res.status(200).json({ items: (data || []).map(r => r.payload) });
  }

  // ── L'appli de gestion vide la file après import ──
  if (req.method === 'DELETE') {
    if (!process.env.RDV_READ_KEY || apiKey !== process.env.RDV_READ_KEY) {
      return res.status(401).json({ error: 'Clé API invalide.' });
    }
    const { error } = await supabase.from('pending_rdv').delete().gte('created_at', '1970-01-01');
    if (error) return res.status(500).json({ error: 'Erreur lors du vidage de la file.' });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Méthode non autorisée.' });
}
