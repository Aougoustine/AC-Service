# AC SERVICE — Appli de gestion interne

Appli privée de gestion quotidienne pour un réparateur électroménager à domicile : rendez-vous,
devis, rapports d'intervention, dépôts d'appareils à l'atelier, stock, comptabilité et clients.
Accès restreint à `ac.service59.pro@gmail.com` (mot de passe défini au premier lancement).

**Stockage centralisé** : toutes les données vivent dans une base **Supabase** (Postgres, un seul
blob JSONB `app_state`) + **Supabase Storage** pour les photos — accessible depuis n'importe quel
appareil (téléphone dans la camionnette, ordinateur à la maison), avec un vrai système de compte
protégé côté serveur (mot de passe haché, jamais stocké en clair).

## Structure

```
index.html                    connexion
dashboard.html                 tableau de bord (chiffre d'affaires, alertes stock, statistiques)
planning.html                   demandes de RDV en attente, calendrier mensuel, rapports, devis
dossiers.html                    archive des RDV confirmés, regroupés par numéro de dossier
clients.html                      annuaire client (auto + fiches manuelles)
depots.html                        bons de dépôt d'appareil à l'atelier, signés et horodatés
stock.html                          stock de pièces détachées
comptabilite.html                    calculette URSSAF/impôts + calculatrice prix de vente
corbeille.html                        corbeille commune à toutes les suppressions
parametres.html                        listes personnalisables, tarifs, entreprise, sécurité
devis-signature.html                    page PUBLIQUE de signature de devis à distance

assets/style.css               design partagé (identique au site public)
assets/app.js                    session, appels API, PDF, corbeille, envoi d'emails, aides communes
assets/page-*.js                  logique propre à chaque page ci-dessus

lib/supabase.js                 client Supabase partagé (hors /api pour ne pas devenir une route)
lib/crypto.js                     hachage de mot de passe (scrypt) + jetons de session

api/auth.js                       connexion / création de compte / changement de mot de passe
api/data.js                        lecture/écriture de l'état complet de l'appli (protégé par session)
api/photos.js                       upload/lecture/suppression des photos (Supabase Storage)
api/rendezvous.js                    passerelle avec le site public (RDV entrants)
api/devis-public.js                   signature/refus de devis à distance (PAS protégé par session,
                                       accessible via lien public envoyé au client par email)
api/send-devis-email.js               envoi du devis par email (Resend)
api/send-report-email.js               envoi du rapport d'intervention par email (Resend)
api/send-deposit-email.js              envoi du bon de dépôt / restitution par email (Resend)
api/send-review-email.js               non utilisé actuellement (demande d'avis fusionnée dans
                                        l'email du rapport) — laissé en place, sans risque

favicon.png                     logo (aussi utilisé comme en-tête des PDF)
carte-visite.png                 carte de visite, jointe automatiquement à tous les emails clients
package.json                      dépendances : @supabase/supabase-js, jspdf (PDF de dépôt signé
                                   généré côté serveur lors de la signature)
```

Chaque page est un fichier séparé pour rester légère ; elles partagent `assets/app.js` et
`assets/style.css`. Au chargement, chaque page vérifie la session puis récupère l'état complet
via `/api/data` ; chaque modification renvoie l'état complet au serveur (`saveState`).

## Fonctionnement clé à retenir

- **Un numéro de dossier unique** (`ACS-AAAA-MM-XXX`) relie RDV, rapport(s) et devis d'une même
  intervention ; **Dossiers** les regroupe automatiquement dès que le RDV est confirmé.
- **Devis signés à distance** : lien public envoyé par email, preuve horodatée (date, IP, email
  du signataire) ; l'acceptation valide automatiquement le RDV lié. Le refus marque le RDV en
  suivi "Devis refusé" et notifie le gérant par email.
- **Clients** : annuaire reconstruit automatiquement à partir de l'historique (RDV, rapports,
  dépôts) et des fiches manuelles ; deux fiches avec un nom différent mais un même téléphone
  fusionnent automatiquement (`buildClientDirectory` dans `app.js`).
- **Dépôts** : signature du client obligatoire au dépôt ET à la restitution, photos de l'état à
  l'arrivée, PDF généré avec bloc de preuve, envoi par email.
- **Corbeille commune** : toute suppression (rapport, devis, dépôt, client, RDV, pièce de stock)
  passe par la corbeille (`moveToTrash` dans `app.js`) au lieu d'être immédiate. Les effets de
  bord (recréditer le stock, supprimer les photos, libérer un créneau site) ne s'appliquent qu'à
  la suppression définitive depuis la Corbeille, jamais à la simple mise à la corbeille — la
  restauration est donc toujours sans risque. Pas de purge automatique.
- **Rafraîchissement automatique** (`startAutoRefresh`, toutes les 30s) sur Planning, Dossiers et
  Clients : notifie les nouveaux RDV et les devis acceptés/refusés, en pause si une fenêtre
  modale est ouverte pour ne jamais écraser une saisie en cours.
- **Emails** : tous envoyés via l'API **Resend** (domaine `acservicepro.fr` vérifié SPF/DKIM/DMARC,
  expéditeur `contact@acservicepro.fr`), avec la carte de visite jointe systématiquement. Le
  rapport propose une case à cocher pour joindre une demande d'avis Google au même email (jamais
  un second email séparé, et le message n'insiste jamais sur une note précise — Google interdit
  de solliciter une note chiffrée).
- **Menu mobile** : bouton ☰ qui déroule les onglets en liste verticale sous la barre, uniquement
  en dessous de 680px de large ; au-dessus, les 9 onglets s'affichent en tuiles sur une ligne.

## 1. Déploiement

1. Dépôt GitHub privé → Vercel **New Project** → importe ce dépôt.
2. Déploie tel quel (aucune config de build nécessaire : HTML/JS statique + fonctions API).
3. URL du type `ac-service-application.vercel.app`, éventuellement un sous-domaine dédié via les
   DNS Hostinger.

### Recommandé : protéger l'accès au niveau de l'hébergement

Le mot de passe est vérifié côté serveur (haché avec sel). En complément, active dans Vercel :
**Project Settings > Deployment Protection > Password Protection**.

### RGPD

Données personnelles réelles de clients (nom, téléphone, adresse, photos) dans une base cloud —
choisis une région Supabase européenne. La page RGPD du site public devrait mentionner cet outil
interne et ses sous-traitants (Supabase, Vercel, Resend).

## 2. Variables d'environnement Vercel

| Variable | Rôle |
|---|---|
| `SUPABASE_URL` | URL du projet Supabase |
| `SUPABASE_SECRET_KEY` | Clé secrète Supabase (jamais la "Publishable key") |
| `RDV_WRITE_KEY` | Clé utilisée par le site public pour créer une demande de RDV |
| `RDV_READ_KEY` | Clé utilisée par l'appli pour importer les demandes (Paramètres) |
| `ALLOWED_ORIGIN` | `https://acservicepro.fr` — restreint qui peut appeler la passerelle |
| `RESEND_API_KEY` | Clé Resend, nécessaire à **tous** les envois d'email de l'appli |

Redéploie après tout ajout/changement de variable.

## 3. Base Supabase

Tables : `app_state` (blob JSONB unique — settings, appointments, devis, interventions, stock,
revenueLedger, clients, deposits, trash), `auth_credentials`, `sessions`, `pending_rdv` /
`rdv_bookings` (passerelle site → appli), `geocode_cache`. Bucket Storage `photos` (privé, URLs
signées).

## 4. Emails (Resend)

Domaine `acservicepro.fr` vérifié (SPF/DKIM/DMARC) dans le dashboard Resend. Expéditeur unique :
`contact@acservicepro.fr`. Aucune autre configuration nécessaire une fois `RESEND_API_KEY` posée.

## Fichiers obsolètes (ne plus recréer)

`lib/redis.js`, `nodemailer` (dépendance retirée du `package.json`, remplacée par Resend),
`vercel.json` (ancienne purge auto).
