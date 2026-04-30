/**
 * surveillance.js — Logique de la page de surveillance Gmail
 * Navigation entre vues, wizard par template, CRUD des règles
 */

import {
  TEMPLATES, TEMPLATE_COLORS,
  getRules, saveRule, deleteRule, toggleRuleEnabled,
  getSettings, saveSettings,
  formatLastCheck, frequencyLabel,
} from './modules/gmail.js';
import { initAuth } from './modules/auth.js';

'use strict';

/* ── Utilitaire HTML ── */
const esc = s => String(s)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;')
  .replace(/>/g,'&gt;').replace(/"/g,'&quot;');

/* ── Toast ── */
const toast = document.getElementById('toast');
let toastTimer;
function showToast(msg, duration = 3000) {
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), duration);
}

/* ═══════════════════════════════════════════════════════════════════
   NAVIGATION ENTRE VUES
   ═══════════════════════════════════════════════════════════════════ */

const views = {
  list:    document.getElementById('view-list'),
  add:     document.getElementById('view-add'),
  wizard:  document.getElementById('view-wizard'),
  success: document.getElementById('view-success'),
};

function showView(name) {
  Object.values(views).forEach(v => v.classList.remove('active'));
  views[name].classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.getElementById('back-to-list').addEventListener('click', () => { showView('list'); renderRuleList(); });
document.getElementById('back-to-add').addEventListener('click',  () => showView('add'));
document.getElementById('add-rule-btn').addEventListener('click', () => { renderTemplateGrid(); showView('add'); });

/* ═══════════════════════════════════════════════════════════════════
   VUE 1 — LISTE DES RÈGLES
   ═══════════════════════════════════════════════════════════════════ */

const globalToggle    = document.getElementById('global-toggle');
const globalToggleLabel = document.getElementById('global-toggle-label');
const globalFreq      = document.getElementById('global-freq');
const lastCheckText   = document.getElementById('last-check-text');
const checkNowBtn     = document.getElementById('check-now-btn');
const rulesList       = document.getElementById('rules-list');

/* ── Charger les paramètres globaux ── */
function loadSettings() {
  const s = getSettings();
  globalToggle.checked = s.enabled;
  globalToggleLabel.textContent = s.enabled ? 'Active' : 'Pausée';
  globalFreq.value  = s.frequency;
  lastCheckText.textContent = formatLastCheck(s.lastCheck);
}

globalToggle.addEventListener('change', () => {
  const s = saveSettings({ enabled: globalToggle.checked });
  globalToggleLabel.textContent = s.enabled ? 'Active' : 'Pausée';
  showToast(s.enabled ? 'Surveillance activée' : 'Surveillance mise en pause');
});

globalFreq.addEventListener('change', () => {
  saveSettings({ frequency: globalFreq.value });
  showToast(`Fréquence : ${frequencyLabel(globalFreq.value)}`);
});

/* Vérifier maintenant (simulation — pas encore de vrai appel Gmail) */
checkNowBtn.addEventListener('click', () => {
  checkNowBtn.textContent = 'Vérification…';
  checkNowBtn.classList.add('spinning');
  setTimeout(() => {
    const now = Date.now();
    saveSettings({ lastCheck: now });
    lastCheckText.textContent = formatLastCheck(now);
    checkNowBtn.textContent = 'Vérifier maintenant';
    checkNowBtn.classList.remove('spinning');
    showToast('Vérification terminée — aucun nouveau document');
  }, 1800);
});

/* ── Rendu de la liste des règles ── */
function renderRuleList() {
  const rules = getRules();

  if (rules.length === 0) {
    rulesList.innerHTML = `
      <div class="rules-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
          <polyline points="22,6 12,13 2,6"/>
        </svg>
        <p>Aucune règle configurée</p>
        <span>Ajoutez votre première règle pour commencer</span>
      </div>`;
    return;
  }

  rulesList.innerHTML = rules.map(rule => {
    const color = TEMPLATE_COLORS[rule.templateId] ?? '#5a5a6a';
    const emailDisplay = rule.email
      ? esc(rule.email)
      : '<em style="opacity:.5">tout expéditeur</em>';

    return `
      <div class="rule-card ${rule.enabled ? '' : 'disabled'}" data-id="${esc(rule.id)}">
        <span class="rule-dot" style="background:${color}"></span>
        <div class="rule-body">
          <div class="rule-label">${esc(rule.label)}</div>
          <div class="rule-meta">
            <span>${emailDisplay}</span>
            <span class="rule-arrow">→</span>
            <span class="rule-folder">${esc(rule.folder)}</span>
            <span style="margin-left:.25rem;opacity:.4">·</span>
            <span>${frequencyLabel(rule.frequency ?? '15min')}</span>
          </div>
        </div>
        <div class="rule-actions">
          <label class="toggle-switch" title="${rule.enabled ? 'Désactiver' : 'Activer'}">
            <input type="checkbox" class="rule-toggle" data-id="${esc(rule.id)}" ${rule.enabled ? 'checked' : ''} />
            <span class="toggle-track"></span>
          </label>
          <button class="rule-delete" data-id="${esc(rule.id)}" title="Supprimer la règle">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14H6L5 6"/>
              <path d="M10 11v6M14 11v6"/>
              <path d="M9 6V4h6v2"/>
            </svg>
          </button>
        </div>
      </div>`;
  }).join('');

  /* Événements après insertion */
  rulesList.querySelectorAll('.rule-toggle').forEach(chk => {
    chk.addEventListener('change', () => {
      const rule = toggleRuleEnabled(chk.dataset.id);
      renderRuleList();
      showToast(`Règle "${rule.label}" ${rule.enabled ? 'activée' : 'désactivée'}`);
    });
  });

  rulesList.querySelectorAll('.rule-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const card  = btn.closest('.rule-card');
      const label = card.querySelector('.rule-label').textContent;
      deleteRule(btn.dataset.id);
      renderRuleList();
      showToast(`Règle "${label}" supprimée`);
    });
  });
}

/* ═══════════════════════════════════════════════════════════════════
   VUE 2 — CHOIX DU TEMPLATE
   ═══════════════════════════════════════════════════════════════════ */

/* Icônes SVG par template */
const ICONS = {
  loyer:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  operateur: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>`,
  energie:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  paie:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>`,
  impots:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>`,
  assurance: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  custom:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
};

function renderTemplateGrid() {
  const grid = document.getElementById('template-grid');

  const templateCards = TEMPLATES.map(tpl => {
    const color = TEMPLATE_COLORS[tpl.id];
    return `
      <button class="template-card" data-tpl="${esc(tpl.id)}">
        <div class="template-card-icon" style="background:${color}1a;color:${color}">
          ${ICONS[tpl.id] ?? ICONS.custom}
        </div>
        <div class="template-card-label">${esc(tpl.label)}</div>
        <div class="template-card-desc">${esc(tpl.description)}</div>
      </button>`;
  }).join('');

  const customCard = `
    <button class="template-card custom" data-tpl="custom">
      <div class="template-card-icon" style="background:rgba(108,106,255,.12);color:var(--accent)">
        ${ICONS.custom}
      </div>
      <div>
        <div class="template-card-label">Règle personnalisée</div>
        <div class="template-card-desc">Définissez votre propre expéditeur et vos mots-clés</div>
      </div>
    </button>`;

  grid.innerHTML = templateCards + customCard;

  grid.querySelectorAll('.template-card').forEach(card => {
    card.addEventListener('click', () => {
      const tplId = card.dataset.tpl;
      const tpl   = tplId === 'custom'
        ? { id: 'custom', label: 'Règle personnalisée', folder: 'Autres', keywords: [], fields: ['email', 'keywords_custom', 'folder_edit'] }
        : TEMPLATES.find(t => t.id === tplId);
      renderWizard(tpl);
      showView('wizard');
    });
  });
}

/* ═══════════════════════════════════════════════════════════════════
   VUE 3 — WIZARD PAR TEMPLATE
   ═══════════════════════════════════════════════════════════════════ */

function renderWizard(tpl) {
  const color   = TEMPLATE_COLORS[tpl.id] ?? '#6c6aff';
  const wizBody = document.getElementById('wizard-body');

  /* ── Tag du template ── */
  let html = `
    <div class="wizard-template-tag" style="background:${color}1a;color:${color};border:1px solid ${color}40">
      ${ICONS[tpl.id] ? `<span style="display:flex;align-items:center;width:14px;height:14px">${ICONS[tpl.id]}</span>` : ''}
      ${esc(tpl.label)}
    </div>`;

  /* ── Champs selon le type de template ── */

  /* Email avec raccourcis (opérateur / énergie) */
  if (tpl.fields.includes('email_shortcuts')) {
    const shortcuts = (tpl.shortcuts ?? []).map(s =>
      `<button type="button" class="shortcut-btn" data-email="${esc(s.email)}">${esc(s.label)}</button>`
    ).join('');
    html += `
      <div class="field">
        <label class="field-label">Fournisseur</label>
        <div class="shortcuts-row">${shortcuts}</div>
        <input id="f-email" class="field-input" type="email"
          placeholder="ou saisir un email manuellement…" autocomplete="off" />
        <span class="field-error hidden" id="f-email-err">Email requis</span>
      </div>`;
  }

  /* Email pré-rempli (impôts) */
  else if (tpl.fields.includes('email_prefilled')) {
    html += `
      <div class="field">
        <label class="field-label">Expéditeur</label>
        <input id="f-email" class="field-input" type="email"
          value="${esc(tpl.defaultEmail ?? '')}" readonly />
      </div>`;
  }

  /* Email libre */
  else if (tpl.fields.includes('email')) {
    const label = tpl.fieldLabels?.email ?? 'Email de l\'expéditeur';
    html += `
      <div class="field">
        <label class="field-label">${esc(label)}</label>
        <input id="f-email" class="field-input" type="email"
          placeholder="exemple@domaine.fr" autocomplete="off" />
        <span class="field-error hidden" id="f-email-err">Email requis</span>
      </div>`;
  }

  /* Champ nom/entreprise */
  if (tpl.fields.includes('name') || tpl.fields.includes('company')) {
    const key   = tpl.fields.includes('company') ? 'company' : 'name';
    const label = tpl.fieldLabels?.[key] ?? (key === 'company' ? 'Nom de l\'entreprise' : 'Nom');
    const req   = key === 'company';
    html += `
      <div class="field">
        <label class="field-label">
          ${esc(label)}
          ${!req ? '<span class="optional">(optionnel)</span>' : ''}
        </label>
        <input id="f-name" class="field-input" type="text"
          placeholder="${esc(label)}…" autocomplete="off"
          ${req ? 'required' : ''} />
        ${req ? `<span class="field-error hidden" id="f-name-err">Ce champ est requis</span>` : ''}
      </div>`;
  }

  /* Mots-clés cochables */
  if (tpl.keywords && tpl.keywords.length > 0) {
    const chips = tpl.keywords.map(kw => `
      <label class="keyword-chip checked">
        <input type="checkbox" name="kw" value="${esc(kw)}" checked />
        <span>${esc(kw)}</span>
      </label>`).join('');
    html += `
      <div class="keywords-section">
        <span class="keywords-label">Mots-clés détectés <span style="opacity:.5;font-weight:400">(décochez pour exclure)</span></span>
        <div class="keywords-chips" id="f-keywords">${chips}</div>
      </div>`;
  }

  /* Mots-clés libres (template custom) */
  if (tpl.fields.includes('keywords_custom')) {
    html += `
      <div class="field">
        <label class="field-label">Mots-clés <span class="optional">(séparés par des virgules)</span></label>
        <input id="f-keywords-custom" class="field-input" type="text"
          placeholder="facture, contrat, relevé…" autocomplete="off" />
      </div>`;
  }

  /* Dossier de destination */
  const folderEditable = tpl.fields.includes('folder_edit');
  html += `
    <div class="field" style="margin-bottom:1.5rem">
      <label class="field-label">Dossier de destination</label>
      ${folderEditable
        ? `<input id="f-folder" class="field-input" type="text" value="${esc(tpl.folder)}" placeholder="Ex: Logement/Quittances" />`
        : `<div class="folder-preview">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
            <span class="folder-preview-text" id="f-folder-display">${esc(tpl.folder)}</span>
            <button type="button" class="folder-preview-edit" id="f-folder-edit-btn">Modifier</button>
          </div>
          <input id="f-folder" class="field-input" type="text"
            value="${esc(tpl.folder)}" style="display:none;margin-top:.4rem" />`
      }
    </div>`;

  /* ── Bouton de soumission ── */
  html += `<button type="button" class="wizard-submit" id="wizard-submit">Créer la règle</button>`;

  wizBody.innerHTML = html;

  /* ── Comportement des raccourcis ── */
  wizBody.querySelectorAll('.shortcut-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      wizBody.querySelectorAll('.shortcut-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('f-email').value = btn.dataset.email;
    });
  });

  /* ── Toggle checkbox → classe CSS (fallback :has) ── */
  wizBody.querySelectorAll('.keyword-chip input').forEach(chk => {
    chk.addEventListener('change', () => {
      chk.closest('.keyword-chip').classList.toggle('checked', chk.checked);
    });
  });

  /* ── Modifier le dossier ── */
  const editBtn = document.getElementById('f-folder-edit-btn');
  if (editBtn) {
    editBtn.addEventListener('click', () => {
      document.getElementById('f-folder-display').closest('.folder-preview').style.display = 'none';
      document.getElementById('f-folder').style.display = 'block';
      document.getElementById('f-folder').focus();
    });
  }

  /* ── Soumission ── */
  document.getElementById('wizard-submit').addEventListener('click', () => {
    submitWizard(tpl);
  });
}

/* ── Validation et sauvegarde ── */
function submitWizard(tpl) {
  let valid = true;

  /* Email */
  const emailEl  = document.getElementById('f-email');
  const emailErr = document.getElementById('f-email-err');
  const email    = emailEl?.value.trim() ?? '';

  if (emailEl && !tpl.fields.includes('email_prefilled')) {
    const needsEmail = !tpl.fields.includes('email_shortcuts') || email !== '';
    if (tpl.fields.includes('email') && !email) {
      emailEl.classList.add('error');
      emailErr?.classList.remove('hidden');
      valid = false;
    } else {
      emailEl.classList.remove('error');
      emailErr?.classList.add('hidden');
    }
  }

  /* Nom / Entreprise */
  const nameEl  = document.getElementById('f-name');
  const nameErr = document.getElementById('f-name-err');
  if (nameEl?.required && !nameEl.value.trim()) {
    nameEl.classList.add('error');
    nameErr?.classList.remove('hidden');
    valid = false;
  } else {
    nameEl?.classList.remove('error');
    nameErr?.classList.add('hidden');
  }

  if (!valid) return;

  /* Mots-clés cochés */
  const checkedKws = [...document.querySelectorAll('#f-keywords input:checked')]
    .map(c => c.value);

  /* Mots-clés custom */
  const customKwEl = document.getElementById('f-keywords-custom');
  const customKws  = customKwEl
    ? customKwEl.value.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  const keywords = [...checkedKws, ...customKws];

  /* Dossier */
  const folder = document.getElementById('f-folder')?.value.trim() || tpl.folder;

  /* Construction du label affiché */
  const namePart = nameEl?.value.trim();
  const label    = namePart
    ? `${tpl.label} — ${namePart}`
    : tpl.label;

  const rule = saveRule({
    templateId: tpl.id,
    label,
    email:    email || (tpl.defaultEmail ?? ''),
    keywords,
    folder,
    enabled:  true,
    frequency: getSettings().frequency,
  });

  showSuccess(rule, tpl);
  showView('success');
}

/* ═══════════════════════════════════════════════════════════════════
   VUE 4 — SUCCÈS
   ═══════════════════════════════════════════════════════════════════ */

function showSuccess(rule, tpl) {
  const color      = TEMPLATE_COLORS[tpl.id] ?? '#6c6aff';
  const successBody = document.getElementById('success-body');

  const kwsDisplay = rule.keywords.length
    ? rule.keywords.join(', ')
    : 'Aucun mot-clé';

  successBody.innerHTML = `
    <div class="success-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    </div>

    <div>
      <h2 class="success-title">Règle créée</h2>
      <p class="success-subtitle">La surveillance est active</p>
    </div>

    <div class="success-rule-card">
      <div class="success-rule-row">
        <span class="success-rule-row-label">Règle</span>
        <span class="success-rule-row-value" style="color:${color}">${esc(rule.label)}</span>
      </div>
      <div class="success-rule-row">
        <span class="success-rule-row-label">Expéditeur</span>
        <span class="success-rule-row-value">${rule.email ? esc(rule.email) : 'Tous'}</span>
      </div>
      <div class="success-rule-row">
        <span class="success-rule-row-label">Mots-clés</span>
        <span class="success-rule-row-value" style="white-space:normal">${esc(kwsDisplay)}</span>
      </div>
      <div class="success-rule-row">
        <span class="success-rule-row-label">Dossier</span>
        <span class="success-rule-row-value">${esc(rule.folder)}</span>
      </div>
      <div class="success-rule-row">
        <span class="success-rule-row-label">Fréquence</span>
        <span class="success-rule-row-value">${frequencyLabel(rule.frequency)}</span>
      </div>
    </div>

    <div class="success-actions">
      <button class="success-btn-primary" id="success-go-list">Voir mes règles</button>
      <button class="success-btn-secondary" id="success-add-another">Ajouter une autre règle</button>
    </div>`;

  document.getElementById('success-go-list').addEventListener('click', () => {
    showView('list');
    renderRuleList();
  });

  document.getElementById('success-add-another').addEventListener('click', () => {
    renderTemplateGrid();
    showView('add');
  });
}

/* ═══════════════════════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════════════════════ */

loadSettings();
renderRuleList();
initAuth();
