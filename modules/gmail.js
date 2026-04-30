/**
 * modules/gmail.js — Gestion des règles de surveillance Gmail
 * Stockage dans localStorage, templates pré-définis, CRUD des règles
 */

'use strict';

const LS_RULES_KEY    = 'admin-app:gmail-rules';
const LS_SETTINGS_KEY = 'admin-app:gmail-settings';

/* ── Couleurs associées aux templates (cohérentes avec CAT_COLORS) ── */
export const TEMPLATE_COLORS = {
  loyer:     '#3ecf8e',
  operateur: '#a855f7',
  energie:   '#f97316',
  paie:      '#f0a500',
  impots:    '#ff4d6a',
  assurance: '#0ea5e9',
  custom:    '#6c6aff',
};

/* ── Définitions des 6 templates ────────────────────────────────── */
export const TEMPLATES = [
  {
    id:          'loyer',
    label:       'Quittance de loyer',
    description: 'Reçoit vos quittances depuis votre bailleur',
    folder:      'Logement/Quittances',
    keywords:    ['quittance', 'loyer', 'reçu', 'paiement'],
    fields:      ['email', 'name'],
    fieldLabels: { email: 'Email du bailleur', name: 'Nom du bailleur (optionnel)' },
  },
  {
    id:          'operateur',
    label:       'Facture opérateur',
    description: 'SFR, Orange, Free, Bouygues…',
    folder:      'Téléphone/Factures',
    keywords:    ['facture', 'mobile', 'forfait', 'abonnement'],
    fields:      ['email_shortcuts'],
    shortcuts:   [
      { label: 'SFR',      email: 'no-reply@sfr.fr' },
      { label: 'Orange',   email: 'facture@orange.fr' },
      { label: 'Free',     email: 'noreply@free.fr' },
      { label: 'Bouygues', email: 'ne-pas-repondre@bouyguestelecom.fr' },
    ],
  },
  {
    id:          'energie',
    label:       'Facture énergie',
    description: 'EDF, Engie, TotalEnergies…',
    folder:      'Énergie/Factures',
    keywords:    ['facture', 'électricité', 'gaz', 'consommation', 'compteur'],
    fields:      ['email_shortcuts'],
    shortcuts:   [
      { label: 'EDF',           email: 'ne-pas-repondre@edf.fr' },
      { label: 'Engie',         email: 'noreply@engie.com' },
      { label: 'TotalEnergies', email: 'noreply@totalenergies.com' },
    ],
  },
  {
    id:          'paie',
    label:       'Fiche de paie',
    description: 'Bulletin de salaire de votre employeur',
    folder:      'Revenus/Fiches de paie',
    keywords:    ['bulletin', 'salaire', 'paie', 'fiche de paie', 'rémunération'],
    fields:      ['email', 'company'],
    fieldLabels: { email: 'Email RH / employeur', company: 'Nom de l\'entreprise' },
  },
  {
    id:          'impots',
    label:       'Avis d\'imposition',
    description: 'Depuis impots.gouv.fr',
    folder:      'Impôts',
    keywords:    ['avis', 'imposition', 'impôts', 'déclaration', 'revenu'],
    fields:      ['email_prefilled'],
    defaultEmail:'ne-pas-repondre@impots.gouv.fr',
  },
  {
    id:          'assurance',
    label:       'Assurance',
    description: 'Contrats, attestations, avis d\'échéance',
    folder:      'Assurance',
    keywords:    ['assurance', 'contrat', 'attestation', 'échéance', 'sinistre'],
    fields:      ['email', 'company'],
    fieldLabels: { email: 'Email de l\'assureur', company: 'Nom de la compagnie' },
  },
];

/* ── CRUD des règles ─────────────────────────────────────────────── */

export function getRules() {
  try { return JSON.parse(localStorage.getItem(LS_RULES_KEY) || '[]'); }
  catch { return []; }
}

function persistRules(rules) {
  localStorage.setItem(LS_RULES_KEY, JSON.stringify(rules));
}

/* Crée et sauvegarde une règle, retourne la règle avec son id */
export function saveRule(rule) {
  const rules = getRules();
  const full  = { ...rule, id: _uid(), createdAt: Date.now(), lastCheck: null };
  rules.push(full);
  persistRules(rules);
  return full;
}

/* Supprime une règle par id */
export function deleteRule(id) {
  persistRules(getRules().filter(r => r.id !== id));
}

/* Active/désactive une règle individuelle */
export function toggleRuleEnabled(id) {
  const rules = getRules().map(r => r.id === id ? { ...r, enabled: !r.enabled } : r);
  persistRules(rules);
  return rules.find(r => r.id === id);
}

/* Met à jour la date de dernière vérification */
export function touchLastCheck(id) {
  const now   = Date.now();
  const rules = getRules().map(r => r.id === id ? { ...r, lastCheck: now } : r);
  persistRules(rules);
  return now;
}

/* ── Paramètres globaux ──────────────────────────────────────────── */

const DEFAULT_SETTINGS = { enabled: true, frequency: '15min', lastCheck: null };

export function getSettings() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(LS_SETTINGS_KEY) || '{}') }; }
  catch { return { ...DEFAULT_SETTINGS }; }
}

export function saveSettings(patch) {
  const current = getSettings();
  const updated = { ...current, ...patch };
  localStorage.setItem(LS_SETTINGS_KEY, JSON.stringify(updated));
  return updated;
}

/* ── Utilitaire ─────────────────────────────────────────────────── */

function _uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function formatLastCheck(ts) {
  if (!ts) return 'Jamais vérifiée';
  const diff = Date.now() - ts;
  const min  = Math.floor(diff / 60000);
  if (min < 1)   return 'À l\'instant';
  if (min < 60)  return `Il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24)    return `Il y a ${h} h`;
  return `Il y a ${Math.floor(h / 24)} j`;
}

export function frequencyLabel(freq) {
  return { '15min': '15 min', '1h': '1 heure', '1jour': '1 jour' }[freq] ?? freq;
}
