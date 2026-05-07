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

/** Détecte le template en scorant le recouvrement entre les clés de details et chaque template. */
function _detectTemplateFromDetails(details) {
  const keys = Object.keys(details).filter(k => details[k] != null && String(details[k]).trim() !== '');
  if (keys.length === 0) return null;
  let bestKey = null, bestScore = 0;
  for (const [tplKey, tpl] of Object.entries(DOCUMENT_TEMPLATES)) {
    const tplKeys = new Set(tpl.champs.map(c => c.key));
    const score = keys.filter(k => tplKeys.has(k)).length;
    if (score > bestScore) { bestScore = score; bestKey = tplKey; }
  }
  return bestKey;
}

/**
 * Génère le HTML d'une carte document avec animation flip 3D.
 * @param {object} doc        — métadonnées (id, name, category, sous_categorie, docDate, date, details…)
 * @param {Set}    expandedIds — IDs des cartes actuellement retournées
 */
export function renderDocCard(doc, expandedIds = new Set()) {
  const color     = getCategoryColor(doc.category);
  const isFlipped = expandedIds.has(doc.id);
  const tplKey    = detectTemplateKey(doc);
  const ext       = fileExt(doc.name);

  /* Badges */
  const bg  = color + '1a';
  const bdr = color + '4d';
  const catBadge = `<span class="cat-badge" data-cat="${escHtml(doc.category)}"
    title="Cliquer pour changer de catégorie"
    style="background:${bg};color:${color};border:1px solid ${bdr}"
  >${escHtml(doc.category)}</span>`;
  const subcatBadge = doc.sous_categorie
    ? `<span class="subcat-badge">${escHtml(doc.sous_categorie)}</span>` : '';

  /* Dates */
  const importDateStr = new Date(doc.date).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
  const dateHtml = doc.docDate
    ? `<span class="doc-card-date">${escHtml(doc.docDate)}</span>
       <span class="doc-card-date doc-card-date--import">Importé ${importDateStr}</span>`
    : `<span class="doc-card-date doc-card-date--import">Importé ${importDateStr}</span>`;

  /* Rappel actif */
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

  /* Verso : titre et détails */
  // Résoudre le template : depuis sous_categorie (SUBCAT_TO_KEY), puis depuis les clés de détails
  let resolvedTplKey = tplKey;
  if (!resolvedTplKey && doc.details && typeof doc.details === 'object') {
    resolvedTplKey = _detectTemplateFromDetails(doc.details);
  }

  const detailKeys = doc.details
    ? Object.keys(doc.details).filter(k => doc.details[k] != null && String(doc.details[k]).trim() !== '')
    : [];

  console.log(`[Verso] Document : ${doc.name}`);
  console.log(`[Verso] Type détecté : ${resolvedTplKey ?? 'aucun'} (sous_categorie: ${doc.sous_categorie ?? 'non définie'})`);
  console.log(`[Verso] Champs disponibles : ${detailKeys.length ? detailKeys.join(', ') : 'aucun'}`);

  const tpl      = resolvedTplKey ? DOCUMENT_TEMPLATES[resolvedTplKey] : null;
  const backTitle = tpl ? tpl.label : doc.category;
  const detailsInner = resolvedTplKey
    ? renderDetailsHtml(resolvedTplKey, doc.details)
    : detailKeys.length > 0
      ? detailKeys.map(k => `<div class="detail-row">
          <span class="detail-label">${escHtml(k.replace(/_/g, ' '))}</span>
          <span class="detail-value">${escHtml(String(doc.details[k]))}</span>
        </div>`).join('')
      : `<p class="detail-empty">Importez via l'analyse IA pour extraire les détails.</p>`;

  return `
    <div class="doc-card-wrap">
      <div class="doc-card${isFlipped ? ' is-flipped' : ''}" data-id="${doc.id}" style="--cat-color:${color}">

        <!-- RECTO -->
        <div class="doc-card-front">
          <div class="doc-card-front-top">
            <span class="doc-ext-tag">
              <span class="cat-dot" style="background:${color}"></span>
              ${escHtml(ext)}
            </span>
          </div>
          <div class="doc-card-name">${escHtml(doc.name)}</div>
          <div class="doc-card-badges">${catBadge}${subcatBadge}</div>
          <div class="doc-card-dates-wrap">${dateHtml}</div>
          ${reminderHtml}
          <div class="doc-card-flip-hint">Tap ↻</div>
        </div>

        <!-- VERSO -->
        <div class="doc-card-back">
          <div class="doc-back-header">
            <span class="doc-back-title" style="color:${color}">${escHtml(backTitle)}</span>
          </div>
          <div class="doc-back-details">${detailsInner}</div>
          <div class="doc-back-actions">
            <button class="doc-view-btn-full" type="button">Voir</button>
            <button class="doc-card-edit"     type="button">Modifier</button>
            <button class="doc-share-btn"     type="button">Partager</button>
            <button class="doc-card-remove"   type="button">×</button>
          </div>
        </div>

      </div>
    </div>`;
}
