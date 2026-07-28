// /api/devis-public.js — endpoint PUBLIC (aucune connexion requise) permettant au
// CLIENT de consulter et signer un devis via un lien unique et impossible à deviner
// (le "token"), envoyé uniquement par email au moment de l'envoi du devis.
//
// Sécurité : le token fait office de mot de passe à lui seul (assez long et aléatoire
// pour ne jamais être deviné/énuméré). Cet endpoint ne renvoie JAMAIS que les données
// du SEUL devis correspondant au token fourni — jamais le reste de vos données.
//
// La preuve de signature (date, IP, email, copie figée du devis) est calculée ici,
// côté serveur, jamais depuis les informations envoyées par le navigateur du client :
// impossible à falsifier depuis le poste du signataire.

import { supabase } from '../lib/supabase.js';
import { jsPDF } from 'jspdf';

const OWNER_NOTIFICATION_EMAIL = 'ac.service59.pro@gmail.com';
const SENDER = 'AC SERVICE <contact@acservicepro.fr>';

async function sendResendEmail({ to, subject, text, attachments }) {
  if (!process.env.RESEND_API_KEY) return; // Resend non configuré : on ignore silencieusement
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      body: JSON.stringify({ from: SENDER, to, subject, text, attachments: attachments || undefined }),
    });
  } catch (e) { /* notification best-effort : ne doit jamais faire échouer la signature du client */ }
}

function fmtDateTimeFr(iso) {
  if (!iso) return '—';
  const dt = new Date(iso);
  if (isNaN(dt)) return iso;
  return dt.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' à ' + dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

// Génère une copie PDF simplifiée du devis signé (détail + preuve de signature),
// pour la notification envoyée au gérant. Ce n'est pas le PDF stylé de l'appli
// (celui-ci reste généré côté navigateur), mais toutes les infos légales y sont.
function buildSignedDevisNotificationPdf(devis) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const marginX = 15;
  let y = 20;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(20, 20, 20);
  doc.text('DEVIS SIGNÉ — ' + (devis.devisNumber || ''), marginX, y); y += 10;

  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(60, 60, 60);
  doc.text('Client : ' + (devis.clientName || '—'), marginX, y); y += 6;
  const addressLine = [devis.address, [devis.postalCode, devis.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  if (addressLine) { doc.text('Adresse : ' + addressLine, marginX, y); y += 6; }
  if (devis.email) { doc.text('Email : ' + devis.email, marginX, y); y += 6; }
  y += 4;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(20, 20, 20);
  doc.text('Détail du devis', marginX, y); y += 7;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(60, 60, 60);
  (devis.items || []).forEach(it => {
    const qty = Number(it.qty) || 1;
    const lineTotal = (it.totalTTC != null) ? Number(it.totalTTC) : (Number(it.unitPrice) || 0) * qty;
    const label = (it.label || it.description || 'Ligne') + (qty > 1 ? (' x' + qty) : '');
    const lines = doc.splitTextToSize(label, 130);
    if (y + lines.length * 5 > 275) { doc.addPage(); y = 20; }
    doc.text(lines, marginX, y);
    doc.text(lineTotal.toFixed(2) + ' €', 195, y, { align: 'right' });
    y += Math.max(6, lines.length * 5);
  });

  y += 5;
  if (y > 270) { doc.addPage(); y = 20; }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(20, 20, 20);
  doc.text('Total TTC : ' + (Number(devis.totalTTC) || 0).toFixed(2) + ' €', marginX, y);
  y += 12;

  const boxH = 34;
  if (y + boxH > 280) { doc.addPage(); y = 20; }
  doc.setDrawColor(46, 204, 143); doc.setFillColor(240, 255, 248);
  doc.rect(marginX, y, 210 - marginX * 2, boxH, 'FD');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(20, 140, 90);
  doc.text('DEVIS ACCEPTÉ ÉLECTRONIQUEMENT', marginX + 4, y + 7);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(70, 70, 70);
  doc.text('Signé le ' + fmtDateTimeFr(devis.signedAt), marginX + 4, y + 13);
  doc.text('Par : ' + (devis.signedByEmail || '—'), marginX + 4, y + 18);
  doc.text('Adresse IP : ' + (devis.signedIp || '—'), marginX + 4, y + 23);
  try { if (devis.signature) doc.addImage(devis.signature, 'PNG', 210 - marginX - 48, y + 5, 44, 20); } catch (e) { /* pas bloquant */ }

  return doc.output('datauristring').split(',')[1];
}

function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : '';
}

async function loadState() {
  const { data, error } = await supabase.from('app_state').select('data').eq('id', 1).maybeSingle();
  if (error || !data) return null;
  return data.data;
}

async function saveState(state) {
  const { error } = await supabase.from('app_state').upsert({
    id: 1, data: state, updated_at: new Date().toISOString()
  });
  return !error;
}

function publicDevisView(devis) {
  // On ne renvoie que ce dont la page de signature a besoin, rien de plus.
  return {
    devisNumber: devis.devisNumber,
    issueDate: devis.issueDate,
    expiryDate: devis.expiryDate,
    company: devis.company || {},
    clientName: devis.clientName,
    address: devis.address, postalCode: devis.postalCode, city: devis.city,
    email: devis.email,
    items: devis.items || [],
    discount: devis.discount || 0,
    totalHT: devis.totalHT || 0,
    totalTVA: devis.totalTVA || 0,
    totalTTC: devis.totalTTC || 0,
    vatNote: devis.vatNote || '',
    status: devis.status,
    signedAt: devis.signedAt || null,
    refusedAt: devis.refusedAt || null,
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  const token = (req.query && req.query.token) || (req.body && req.body.token);
  if (!token) return res.status(400).json({ error: 'Lien invalide.' });

  const state = await loadState();
  if (!state) return res.status(500).json({ error: 'Erreur de lecture.' });

  const devis = (state.devis || []).find(d => d.publicToken === token);
  if (!devis) return res.status(404).json({ error: 'Devis introuvable. Le lien est peut-être incorrect.' });

  if (req.method === 'GET') {
    return res.status(200).json({ devis: publicDevisView(devis) });
  }

  if (req.method === 'POST') {
    const action = (req.body || {}).action;

    if (devis.status === 'Accepté' || devis.status === 'Refusé') {
      return res.status(409).json({ error: 'Ce devis a déjà reçu une réponse (' + devis.status + ').' });
    }
    if (devis.expiryDate && devis.expiryDate < new Date().toISOString().slice(0, 10)) {
      return res.status(409).json({ error: 'Ce devis a expiré.' });
    }

    if (action === 'sign') {
      const signature = (req.body || {}).signature;
      const acceptTerms = (req.body || {}).acceptTerms;
      if (!signature || !acceptTerms) {
        return res.status(400).json({ error: 'Signature ou confirmation manquante.' });
      }
      const now = new Date().toISOString();
      devis.status = 'Accepté';
      devis.signature = signature;
      devis.signedAt = now;
      devis.signedByEmail = devis.email || '';
      devis.signedIp = getClientIp(req);
      devis.signedUserAgent = String(req.headers['user-agent'] || '').slice(0, 300);
      // Copie figée : ce qui a été présenté et accepté, non modifiable après coup.
      devis.termsSnapshotAtSigning = publicDevisView(devis);

      // Valide automatiquement le RDV lié (le client a accepté le devis).
      if (devis.linkedRdvId) {
        const rdv = (state.appointments || []).find(a => a.id === devis.linkedRdvId);
        if (rdv) rdv.status = 'Confirmé';
      }

      const ok = await saveState(state);
      if (!ok) return res.status(500).json({ error: "Échec de l'enregistrement." });

      try {
        const pdfBase64 = buildSignedDevisNotificationPdf(devis);
        await sendResendEmail({
          to: OWNER_NOTIFICATION_EMAIL,
          subject: `✅ Devis ${devis.devisNumber || ''} accepté par ${devis.clientName || 'un client'}`,
          text: `Le devis ${devis.devisNumber || ''} a été signé électroniquement par ${devis.clientName || 'le client'} le ${fmtDateTimeFr(devis.signedAt)}.\n\nVous trouverez une copie signée et horodatée en pièce jointe.`,
          attachments: [{ filename: `devis-signe-${devis.devisNumber || 'X'}.pdf`, content: pdfBase64 }],
        });
      } catch (e) { /* la notification ne doit jamais faire échouer la signature du client */ }

      return res.status(200).json({ ok: true, status: 'Accepté' });
    }

    if (action === 'refuse') {
      devis.status = 'Refusé';
      devis.refusedAt = new Date().toISOString();
      devis.refusedIp = getClientIp(req);

      // Marque le RDV lié en suivi "Devis refusé" (statut informatif, visible dans
      // Planning), sans jamais le sortir du calendrier ni changer son statut principal.
      if (devis.linkedRdvId) {
        const rdv = (state.appointments || []).find(a => a.id === devis.linkedRdvId);
        if (rdv) rdv.followUp = 'Devis refusé';
      }

      const ok = await saveState(state);
      if (!ok) return res.status(500).json({ error: "Échec de l'enregistrement." });

      try {
        await sendResendEmail({
          to: OWNER_NOTIFICATION_EMAIL,
          subject: `❌ Devis ${devis.devisNumber || ''} refusé par ${devis.clientName || 'un client'}`,
          text: `Le devis ${devis.devisNumber || ''} a été refusé par ${devis.clientName || 'le client'} le ${fmtDateTimeFr(devis.refusedAt)}.`,
        });
      } catch (e) { /* idem : notification best-effort */ }

      return res.status(200).json({ ok: true, status: 'Refusé' });
    }

    return res.status(400).json({ error: 'Action invalide.' });
  }

  return res.status(405).json({ error: 'Méthode non autorisée.' });
}
