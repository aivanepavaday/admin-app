'use strict';

/* ═══════════════════════════════════════════════════════════════════
   modules/document-templates.js
   Config centrale des types de documents.
   Pour ajouter un nouveau type : ajouter une entrée dans DOCUMENT_TEMPLATES.
   ═══════════════════════════════════════════════════════════════════ */

import { escHtml, fileExt, getCategoryColor } from './documents.js';
import { getRappels } from './medical.js';

export const DOCUMENT_TEMPLATES = {
  ordonnance: {
    label: 'Ordonnance',
    categorie: 'Santé',
    champs: [
      { key: 'medecin',           label: 'Médecin' },
      { key: 'etablissement',     label: 'Établissement' },
      { key: 'date_prescription', label: 'Date prescription', type: 'date' },
      { key: 'qsp',               label: 'QSP' },
      { key: 'date_expiration',   label: 'Expire le', type: 'date', highlight: 'warning' },
    ],
  },
  facture: {
    label: 'Facture',
    champs: [
      { key: 'organisme',     label: 'Organisme' },
      { key: 'numero_ligne',  label: 'Numéro de ligne' },
      { key: 'montant_ttc',   label: 'Montant TTC',      type: 'currency', highlight: 'amount' },
      { key: 'date_emission', label: "Date d'émission",  type: 'date' },
      { key: 'date_echeance', label: "Date d'échéance",  type: 'date' },
    ],
  },
  fiche_paie: {
    label: 'Fiche de paie',
    categorie: 'Revenus',
    champs: [
      { key: 'employeur',          label: 'Employeur' },
      { key: 'periode',            label: 'Période' },
      { key: 'salaire_brut',       label: 'Salaire brut',       type: 'currency' },
      { key: 'salaire_net',        label: 'Salaire net',        type: 'currency', highlight: 'amount' },
      { key: 'heures_travaillees', label: 'Heures travaillées' },
    ],
  },
  prise_de_sang: {
    label: 'Prise de sang',
    categorie: 'Santé',
    champs: [
      { key: 'medecin',         label: 'Médecin prescripteur' },
      { key: 'laboratoire',     label: 'Laboratoire' },
      { key: 'type_analyse',    label: "Type d'analyse" },
      { key: 'date_a_realiser', label: 'À réaliser avant', type: 'date', highlight: 'warning' },
    ],
  },
  quittance_loyer: {
    label: 'Quittance de loyer',
    categorie: 'Logement',
    champs: [
      { key: 'bailleur',  label: 'Bailleur' },
      { key: 'locataire', label: 'Locataire' },
      { key: 'montant',   label: 'Montant',  type: 'currency', highlight: 'amount' },
      { key: 'periode',   label: 'Période' },
    ],
  },
  avis_imposition: {
    label: "Avis d'imposition",
    categorie: 'Impôts',
    champs: [
      { key: 'annee',         label: 'Année' },
      { key: 'revenu_fiscal', label: 'Revenu fiscal de référence', type: 'currency' },
      { key: 'nombre_parts',  label: 'Nombre de parts' },
      { key: 'montant_impot', label: "Montant de l'impôt", type: 'currency', highlight: 'amount' },
    ],
  },
};

const SUBCAT_TO_KEY = {
  'Ordonnance':        'ordonnance',
  'Prise de sang':     'prise_de_sang',
  'Facture':           'facture',
  'Fiche de paie':     'fiche_paie',
  'Quittance':         'quittance_loyer',
  "Avis d'imposition": 'avis_imposition',
};

export function getTemplate(key) {
  return DOCUMENT_TEMPLATES[key] ?? null;
}

export function detectTemplateKey(doc) {
  return SUBCAT_TO_KEY[doc.sous_categorie] ?? null;
}

/** HTML de la section détails (lecture seule sur la carte dépliée). */
export function renderDetailsHtml(templateKey, details) {
  const tpl = DOCUMENT_TEMPLATES[templateKey];
  if (!tpl)     return `<p class="detail-empty">Type de document non reconnu.</p>`;
  if (!details) return `<p class="detail-empty">Aucun détail extrait par l'IA.</p>`;

  const rows = tpl.champs
    .filter(c => details[c.key] != null && String(details[c.key]).trim() !== '')
    .map(c => {
      const cls = c.highlight === 'amount'  ? ' detail-amount'
                : c.highlight === 'warning' ? ' detail-warning'
                : '';
      return `<div class="detail-row">
        <span class="detail-label">${escHtml(c.label)}</span>
        <span class="detail-value${cls}">${escHtml(String(details[c.key]))}</span>
      </div>`;
    });

  return rows.length
    ? rows.join('')
    : `<p class="detail-empty">Aucun champ rempli.</p>`;
}

/** HTML des inputs pour la modale Modifier. */
export function renderDetailFields(templateKey, details) {
  const tpl = DOCUMENT_TEMPLATES[templateKey];
  if (!tpl) return '';
  return `
    <p class="edit-doc-section-title">${escHtml(tpl.label)}</p>
    ${tpl.champs.map(c => `
      <div class="edit-doc-field">
        <label class="edit-doc-label">${escHtml(c.label)}</label>
        <input
          class="edit-doc-input edit-detail-field"
          data-key="${escHtml(c.key)}"
          type="text"
          value="${escHtml(details?.[c.key] ?? '')}"
          placeholder="${c.type === 'date' ? 'JJ/MM/AAAA' : c.type === 'currency' ? '0,00 €' : ''}"
          autocomplete="off"
        />
      </div>`).join('')}`;
}

/**
 * Génère le HTML complet d'une carte document (fermée + dépliable).
 * @param {object} doc        — métadonnées (id, name, category, sous_categorie, docDate, date, thumbnail, details…)
 * @param {Set}    expandedIds — IDs des cartes actuellement dépliées
 */
export function renderDocCard(doc, expandedIds = new Set()) {
  const color      = getCategoryColor(doc.category);
  const isExpanded = expandedIds.has(doc.id);
  const tplKey     = detectTemplateKey(doc);

  /* Badges */
  const bg  = color + '1a';
  const bdr = color + '4d';
  const catBadge = `<span class="cat-badge" data-cat="${escHtml(doc.category)}"
    title="Cliquer pour changer de catégorie"
    style="background:${bg};color:${color};border:1px solid ${bdr}"
  >${escHtml(doc.category)}</span>`;
  const subcatBadge = doc.sous_categorie
    ? `<span class="subcat-badge">${escHtml(doc.sous_categorie)}</span>` : '';

  /* Date */
  const importDateStr = new Date(doc.date).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
  const dateHtml = doc.docDate
    ? `<div class="doc-card-date">${escHtml(doc.docDate)}</div>
       <div class="doc-card-date doc-card-date--import">Importé le ${importDateStr}</div>`
    : `<div class="doc-card-date doc-card-date--import">Importé le ${importDateStr}</div>`;

  /* Rappel */
  let reminderHtml = '';
  const rappel = getRappels().find(r => r.fileName === doc.name && !r.dismissed);
  if (rappel) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const rd    = new Date(rappel.rappelDate);
    const diff  = Math.ceil((rd - today) / 86400000);
    const dateFR = rd.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const daysText = diff > 0   ? `dans ${diff} jour${diff > 1 ? 's' : ''}`
                   : diff === 0 ? "aujourd'hui"
                   : `il y a ${Math.abs(diff)} jour${Math.abs(diff) > 1 ? 's' : ''}`;
    let cls = 'reminder-ok', badge = '';
    if      (diff < 7)  { cls = 'reminder-urgent'; badge = '<span class="reminder-badge">URGENT</span>'; }
    else if (diff < 30) { cls = 'reminder-soon'; }
    reminderHtml = `<div class="doc-card-reminder ${cls}">🔔 <span>${daysText} (${dateFR}) ${badge}</span></div>`;
  }

  /* Contenu de la section détails */
  const detailsInner = tplKey
    ? renderDetailsHtml(tplKey, doc.details ?? null)
    : `<p class="detail-empty">Importez via l'analyse IA pour extraire les détails.</p>`;

  const docIconSvg = `<svg class="doc-preview-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
  const toggleText = isExpanded ? '▴ Réduire' : '▾ Cliquer pour déplier';

  return `
    <div class="doc-card${isExpanded ? ' expanded' : ''}" data-id="${doc.id}" style="--cat-color:${color}">
      <div class="doc-card-preview">
        <span class="doc-ext-badge">${escHtml(fileExt(doc.name))}</span>
        ${docIconSvg}
      </div>
      <div class="doc-card-info">
        <div class="doc-card-name" title="${escHtml(doc.name)}">${escHtml(doc.name)}</div>
        <div class="doc-card-badges">${catBadge}${subcatBadge}</div>
        ${dateHtml}
        ${reminderHtml}
      </div>
      <button class="doc-card-expand-toggle" type="button">${toggleText}</button>
      <div class="doc-card-details">${detailsInner}</div>
      <div class="doc-card-actions-expanded">
        <button class="doc-view-btn-full" type="button">Voir</button>
        <button class="doc-card-edit"     type="button">Modifier</button>
        <button class="doc-card-remove"   type="button">Supprimer</button>
      </div>
    </div>`;
}
