// /lib/supabase.js — client Supabase partagé par toutes les fonctions serverless (/api/*).
// Placé hors du dossier /api pour ne pas être déployé comme une route à part entière.
//
// Utilise la clé "Secret" de Supabase (sb_secret_..., remplace l'ancienne "service_role") :
// accès complet à la base, contourne les policies RLS. Ne JAMAIS utiliser cette clé
// côté navigateur — elle ne doit exister que dans les variables d'environnement Vercel.

import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false } }
);
