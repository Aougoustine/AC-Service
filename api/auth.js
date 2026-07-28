// /api/auth.js — authentification server-side, sur Supabase.
// Le mot de passe n'est JAMAIS stocké en clair (hash scrypt + sel), et n'est jamais
// renvoyé au navigateur. Une session valide = un jeton aléatoire stocké dans la table
// "sessions" avec expiration, envoyé ensuite via l'en-tête x-session-token.

import { supabase } from '../lib/supabase.js';
import { hashPassword, verifyPassword, generateToken } from '../lib/crypto.js';

// ⚠️ Doit rester identique à ALLOWED_EMAIL dans assets/app.js (celle-ci est la
// vraie vérification de sécurité ; l'autre ne sert qu'à l'affichage côté client).
const ALLOWED_EMAIL = 'ac.service59.pro@gmail.com';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h, puis reconnexion nécessaire

export default async function handler(req, res) {
  try {
  if (req.method === 'GET') {
    // Indique au formulaire de connexion s'il doit afficher "créer l'accès" ou "se connecter".
    const { data } = await supabase.from('auth_credentials').select('id').eq('id', 1).maybeSingle();
    return res.status(200).json({ hasPassword: !!data });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée.' });
  }

  const { action } = req.body || {};

  if (action === 'setup') {
    const { data: existing } = await supabase.from('auth_credentials').select('id').eq('id', 1).maybeSingle();
    if (existing) {
      return res.status(409).json({ error: 'Un accès existe déjà. Utilisez la connexion.' });
    }
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';
    if (email !== ALLOWED_EMAIL) {
      return res.status(403).json({ error: `Seule l'adresse ${ALLOWED_EMAIL} est autorisée.` });
    }
    if (password.length < 4) {
      return res.status(400).json({ error: 'Mot de passe trop court (4 caractères min).' });
    }
    const { error: insErr } = await supabase.from('auth_credentials').insert({
      id: 1, email: ALLOWED_EMAIL, password_hash: hashPassword(password)
    });
    if (insErr) return res.status(500).json({ error: "Échec de la création de l'accès : " + insErr.message });

    const token = generateToken();
    await supabase.from('sessions').insert({
      token, email: ALLOWED_EMAIL, expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString()
    });
    return res.status(201).json({ token });
  }

  if (action === 'login') {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';
    const { data: creds } = await supabase.from('auth_credentials').select('password_hash').eq('id', 1).maybeSingle();
    if (email !== ALLOWED_EMAIL || !creds || !verifyPassword(password, creds.password_hash)) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect.' });
    }
    const token = generateToken();
    await supabase.from('sessions').insert({
      token, email: ALLOWED_EMAIL, expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString()
    });
    return res.status(200).json({ token });
  }

  if (action === 'logout') {
    const token = req.headers['x-session-token'];
    if (token) await supabase.from('sessions').delete().eq('token', token);
    return res.status(200).json({ ok: true });
  }

  if (action === 'changePassword') {
    const token = req.headers['x-session-token'];
    if (!token) return res.status(401).json({ error: 'Session expirée, reconnectez-vous.' });
    const { data: session } = await supabase.from('sessions').select('token, expires_at').eq('token', token).maybeSingle();
    if (!session || new Date(session.expires_at) < new Date()) {
      return res.status(401).json({ error: 'Session expirée, reconnectez-vous.' });
    }
    const { data: creds } = await supabase.from('auth_credentials').select('password_hash').eq('id', 1).maybeSingle();
    const currentPassword = req.body.currentPassword || '';
    const newPassword = req.body.newPassword || '';
    if (!creds || !verifyPassword(currentPassword, creds.password_hash)) {
      return res.status(401).json({ error: 'Mot de passe actuel incorrect.' });
    }
    if (newPassword.length < 4) {
      return res.status(400).json({ error: 'Nouveau mot de passe trop court (4 caractères min).' });
    }
    await supabase.from('auth_credentials').update({
      password_hash: hashPassword(newPassword), updated_at: new Date().toISOString()
    }).eq('id', 1);
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: 'Action inconnue.' });
  } catch (err) {
    return res.status(500).json({ error: 'Erreur serveur inattendue : ' + (err && err.message ? err.message : String(err)) });
  }
}
