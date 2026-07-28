// /lib/crypto.js — hachage de mot de passe (scrypt, module natif Node.js, aucune
// dépendance externe requise) et génération de jetons de session.

import crypto from 'crypto';

export function hashPassword(password){
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored){
  if(!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const check = crypto.scryptSync(password, salt, 64).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(check, 'hex');
  if(a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b); // comparaison en temps constant
}

export function generateToken(){
  return crypto.randomBytes(32).toString('hex');
}
