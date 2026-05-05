/**
 * medical.js — Contrôleur de la page Santé
 * Import de documents médicaux, analyse IA, gestion rappels
 */

import { initDB, addDocument, getAllDocuments, deleteDocument, getDocumentData, updateDocument } from './modules/documents.js';
import { analyzeDocument, computeReminder, addRappel, getRappels, deleteRappel, getUrgentCount } from './modules/medical.js';
import { hasApiKey } from './modules/assistant.js';
import { initAuth } from './modules/auth.js';
import { renderDocCard, detectTemplateKey, getTemplate, renderDetailFields } from './modules/document-templates.js';

'use strict';

/* ── Constantes ── */
const MEDICAL_CATS = ['Ordonnances', 'Prises de sang', 'Santé'];

const TYPE_META = {
  ordonnance:   { label: 'Ordonnance',       icon: '💊', color: '#ec4899', cat: 'Ordonnances' },
  prise_de_sang:{ label: 'Prise de sang',    icon: '🩸', color: '#ef4444', cat: 'Prises de sang' },
  autre:        { label: 'Document médical', icon: '🏥', color: '#14b8a6', cat: 'Santé' },
};

/* ── Utilitaires ── */
const esc = s => String(s)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;')
  .replace(/>/g,'&gt;').replace(/"/g,'&quot;');

const toast     = document.getElementById('toast');
let toastTimer;
function showToast(msg, duration = 3000) {
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), duration);
}

/* ── État ── */
let allDocs    = [];
let currentCat = '';
let pendingFile = null;
let pendingAnalysis = null;
let reminderAdded = false;

const expandedMedicalIds = new Set();

/* ═══════════════════════════════════════════════════════════════════
   BADGE RAPPELS
   ═══════════════════════════════════════════════════════════════════ */

function updateRappelsBadge() {
  const badge = document.getElementById('rappels-badge');
  if (!badge) return;
  const n = getUrgentCount();
  if (n > 0) {
    badge.textContent = n;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

/* ═══════════════════════════════════════════════════════════════════
   FILTRES
   ═══════════════════════════════════════════════════════════════════ */

document.getElementById('cat-filter').addEventListener('click', e => {
  const pill = e.target.closest('.cat-pill');
  if (!pill) return;
  document.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
  pill.classList.add('active');
  currentCat = pill.dataset.cat;
  renderGrid();
});

/* ═══════════════════════════════════════════════════════════════════
   GRILLE
   ═══════════════════════════════════════════════════════════════════ */

function renderGrid() {
  const grid = document.getElementById('doc-grid');

  let docs = allDocs.filter(d => MEDICAL_CATS.includes(d.category));
  if (currentCat) {
    const catMap = { ordonnance: 'Ordonnances', prise_de_sang: 'Prises de sang', autre: 'Santé' };
    docs = docs.filter(d => d.category === (catMap[currentCat] ?? currentCat));
  }

  if (docs.length === 0) {
    grid.innerHTML = `
      <div class="doc-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
          <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
          <rect x="9" y="3" width="6" height="4" rx="2"/>
          <line x1="9" y1="12" x2="15" y2="12"/>
          <line x1="9" y1="16" x2="13" y2="16"/>
        </svg>
        <p>Aucun document médical</p>
        <span>Glissez un fichier ici ou cliquez sur Importer</span>
      </div>`;
    return;
  }

  grid.innerHTML = docs.map(doc => renderDocCard(doc, expandedMedicalIds)).join('');

  grid.querySelectorAll('.doc-card').forEach(card => {
    const id  = Number(card.dataset.id);
    const doc = docs.find(d => d.id === id);
    if (!doc) return;

    /* Boutons Voir */
    card.querySelectorAll('.doc-view-btn, .doc-view-btn-full').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); openViewer(doc); });
    });

    /* Bouton Modifier */
    card.querySelector('.doc-card-edit')?.addEventListener('click', e => {
      e.stopPropagation();
      openEditModal(doc);
    });

    /* Bouton Supprimer */
    card.querySelector('.doc-card-remove')?.addEventListener('click', async e => {
      e.stopPropagation();
      try {
        await deleteDocument(id);
        getRappels()
          .filter(r => r.fileName === doc.name)
          .forEach(r => deleteRappel(r.id));
        expandedMedicalIds.delete(id);
        allDocs = await getAllDocuments();
        renderGrid();
        updateRappelsBadge();
        showToast('Document supprimé');
      } catch (err) {
        showToast('Erreur lors de la suppression');
      }
    });

    /* Clic sur la carte → déplier / replier */
    card.addEventListener('click', e => {
      if (e.target.closest('.doc-view-btn') ||
          e.target.closest('.doc-view-btn-full') ||
          e.target.closest('.doc-card-edit') ||
          e.target.closest('.doc-card-remove') ||
          e.target.closest('.cat-badge')) return;

      const toggle = card.querySelector('.doc-card-expand-toggle span');
      if (expandedMedicalIds.has(id)) {
        expandedMedicalIds.delete(id);
        card.classList.remove('expanded');
        if (toggle) toggle.textContent = 'Détails';
      } else {
        expandedMedicalIds.add(id);
        card.classList.add('expanded');
        if (toggle) toggle.textContent = 'Réduire';
      }
    });
  });
}

/* ═══════════════════════════════════════════════════════════════════
   IMPORT & ANALYSE
   ═══════════════════════════════════════════════════════════════════ */

const overlay   = document.getElementById('analysis-overlay');
const loadingEl = document.getElementById('analysis-loading');
const resultEl  = document.getElementById('analysis-result');
const errorEl   = document.getElementById('analysis-error');

function showOverlayState(state) {
  loadingEl.classList.add('hidden');
  resultEl.classList.add('hidden');
  errorEl.classList.add('hidden');
  overlay.classList.remove('hidden');
  if (state === 'loading') loadingEl.classList.remove('hidden');
  if (state === 'result')  resultEl.classList.remove('hidden');
  if (state === 'error')   errorEl.classList.remove('hidden');
}

function hideOverlay() {
  overlay.classList.add('hidden');
  pendingFile     = null;
  pendingAnalysis = null;
  reminderAdded   = false;
}

async function handleFile(file) {
  if (!hasApiKey()) {
    showToast('Configurez votre clé API dans Paramètres');
    return;
  }

  pendingFile     = file;
  pendingAnalysis = null;
  reminderAdded   = false;

  document.getElementById('analysis-filename').textContent = file.name;
  showOverlayState('loading');

  try {
    const analysis = await analyzeDocument(file);
    pendingAnalysis = analysis;
    renderResult(analysis, file.name);
    showOverlayState('result');
  } catch (err) {
    document.getElementById('analysis-error-msg').textContent = err.message;
    showOverlayState('error');
  }
}

function renderResult(analysis, fileName) {
  const meta = TYPE_META[analysis.type] || TYPE_META.autre;

  /* Pré-remplir les champs éditables */
  document.getElementById('result-name-input').value = fileName;
  document.getElementById('result-cat-select').value = meta.cat;

  /* En-tête */
  document.getElementById('result-type-icon').textContent  = meta.icon;
  document.getElementById('result-type-label').textContent = meta.label;
  document.getElementById('result-filename').textContent   = fileName;

  /* Champs */
  const fields = document.getElementById('result-fields');
  const rows = [];

  if (analysis.date_document) {
    const d = new Date(analysis.date_document).toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' });
    rows.push({ key: 'Date du document', value: d });
  }
  if (analysis.qsp_jours) {
    rows.push({ key: 'Durée prescription', value: `${analysis.qsp_jours} jours` });
  }
  if (analysis.delai_prelevement_mois) {
    rows.push({ key: 'Délai à effectuer', value: `dans ${analysis.delai_prelevement_mois} mois` });
  }

  fields.innerHTML = rows.map(r => `
    <div class="result-field">
      <span class="result-field-key">${esc(r.key)}</span>
      <span class="result-field-value">${esc(r.value)}</span>
    </div>`).join('');

  if (analysis.medicaments.length > 0) {
    fields.innerHTML += `
      <div class="result-meds">
        <div class="result-meds-label">Médicaments</div>
        <div class="result-meds-list">
          ${analysis.medicaments.map(m => `<span class="result-med-chip">${esc(m)}</span>`).join('')}
        </div>
      </div>`;
  }

  /* Proposition de rappel */
  const reminder = computeReminder(analysis, fileName);
  const reminderProp = document.getElementById('reminder-proposal');
  const addBtn       = document.getElementById('add-reminder-btn');
  addBtn.disabled = false;

  if (reminder) {
    const rappelFmt  = new Date(reminder.rappelDate).toLocaleDateString('fr-FR', { day:'2-digit', month:'long' });
    const expiryFmt  = new Date(reminder.expiryDate).toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' });
    const body = analysis.type === 'ordonnance'
      ? `Rappel le ${rappelFmt} — ordonnance expire le ${expiryFmt}`
      : `Rappel le ${rappelFmt} — prise de sang à faire avant le ${expiryFmt}`;
    document.getElementById('reminder-proposal-body').textContent = body;
    reminderProp.classList.remove('hidden');

    addBtn.onclick = () => {
      if (reminderAdded) return;
      addRappel({
        label:      reminder.label,
        rappelDate: reminder.rappelDate,
        expiryDate: reminder.expiryDate,
        type:       analysis.type,
        fileName,
        analysis,
      });
      reminderAdded = true;
      addBtn.textContent = '✓ Ajouté';
      addBtn.disabled    = true;
      updateRappelsBadge();
      showToast('Rappel créé');
    };
  } else {
    reminderProp.classList.add('hidden');
  }
}

/* Confirmer et enregistrer dans la bibliothèque */
document.getElementById('analysis-save-btn').addEventListener('click', async () => {
  if (!pendingFile || !pendingAnalysis) return;

  const finalName = document.getElementById('result-name-input').value.trim() || pendingFile.name;
  const finalCat  = document.getElementById('result-cat-select').value;

  /* Convertir date_document (YYYY-MM-DD) → DD/MM/YYYY pour affichage sur la carte */
  const docDate = pendingAnalysis?.date_document
    ? new Date(pendingAnalysis.date_document).toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric' })
    : null;

  try {
    const details = pendingAnalysis?.details ?? null;
    await addDocument(pendingFile, finalCat, finalName, docDate, null, null, details);
    allDocs = await getAllDocuments();
    renderGrid();
    showToast('Document enregistré dans Santé');
    hideOverlay();
  } catch (err) {
    showToast('Erreur lors de l\'enregistrement : ' + err.message);
  }
});

document.getElementById('analysis-close-x').addEventListener('click', hideOverlay);
document.getElementById('analysis-error-close').addEventListener('click', hideOverlay);

/* Cliquer en dehors */
overlay.addEventListener('click', e => {
  if (e.target === overlay) hideOverlay();
});

/* ═══════════════════════════════════════════════════════════════════
   BOUTON IMPORT + DRAG & DROP
   ═══════════════════════════════════════════════════════════════════ */

const fileInput = document.getElementById('file-input');
document.getElementById('upload-btn').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  const f = fileInput.files[0];
  if (f) handleFile(f);
  fileInput.value = '';
});

const dropZone = document.getElementById('drop-zone');
const dropOverlay = document.getElementById('drop-overlay');
let dragCounter = 0;

dropZone.addEventListener('dragenter', e => { e.preventDefault(); dragCounter++; dropOverlay.classList.remove('hidden'); });
dropZone.addEventListener('dragleave', () => { dragCounter--; if (dragCounter === 0) dropOverlay.classList.add('hidden'); });
dropZone.addEventListener('dragover',  e => e.preventDefault());
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dragCounter = 0;
  dropOverlay.classList.add('hidden');
  const f = e.dataTransfer.files[0];
  if (f) handleFile(f);
});

/* ═══════════════════════════════════════════════════════════════════
   VISIONNEUSE DE DOCUMENT
   ═══════════════════════════════════════════════════════════════════ */

let _viewerBlobUrl = null;

function openViewer(doc) {
  document.getElementById('viewer-name').textContent = doc.name;
  document.getElementById('viewer-content').innerHTML =
    `<div class="viewer-unsupported">Chargement…</div>`;
  document.getElementById('viewer-modal').classList.remove('hidden');

  getDocumentData(doc.id)
    .then(fullDoc => {
      const blob = new Blob([fullDoc.data], { type: fullDoc.mimeType });
      if (_viewerBlobUrl) URL.revokeObjectURL(_viewerBlobUrl);
      _viewerBlobUrl = URL.createObjectURL(blob);

      const content = document.getElementById('viewer-content');
      const dlBtn   =
        `<a href="${_viewerBlobUrl}" download="${esc(doc.name)}" class="viewer-download-btn">` +
        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">` +
        `<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>` +
        `<polyline points="7 10 12 15 17 10"/>` +
        `<line x1="12" y1="3" x2="12" y2="15"/>` +
        `</svg>Télécharger le document</a>`;

      if (fullDoc.mimeType === 'application/pdf') {
        content.innerHTML = `
          <div class="viewer-pdf-wrap">
            <iframe src="${_viewerBlobUrl}" title="${esc(doc.name)}"></iframe>
            <div class="viewer-pdf-footer">${dlBtn}</div>
          </div>`;
      } else if (fullDoc.mimeType && fullDoc.mimeType.startsWith('image/')) {
        content.innerHTML = `<img src="${_viewerBlobUrl}" alt="${esc(doc.name)}" />`;
      } else {
        content.innerHTML = `<div class="viewer-unsupported"><p>Aperçu non disponible pour ce type de fichier.</p>${dlBtn}</div>`;
      }
    })
    .catch(() => {
      document.getElementById('viewer-content').innerHTML =
        `<div class="viewer-unsupported">Impossible de charger le document</div>`;
    });
}

function closeViewer() {
  document.getElementById('viewer-modal').classList.add('hidden');
  document.getElementById('viewer-content').innerHTML = '';
  if (_viewerBlobUrl) { URL.revokeObjectURL(_viewerBlobUrl); _viewerBlobUrl = null; }
}

document.getElementById('viewer-close').addEventListener('click', closeViewer);
document.getElementById('viewer-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('viewer-modal')) closeViewer();
});

/* ═══════════════════════════════════════════════════════════════════
   MODALE DE MODIFICATION DE DOCUMENT
   ═══════════════════════════════════════════════════════════════════ */

let editingDocId     = null;
let editingDocTplKey = null;

function openEditModal(doc) {
  editingDocId     = doc.id;
  editingDocTplKey = detectTemplateKey(doc);

  document.getElementById('edit-doc-name').value = doc.name;
  document.getElementById('edit-doc-date').value = doc.docDate || '';
  document.getElementById('edit-doc-cat').value  = doc.category;

  /* Section détails template */
  const detailsSection = document.getElementById('edit-doc-details-section');
  if (detailsSection) {
    const tpl = getTemplate(editingDocTplKey);
    if (tpl) {
      detailsSection.classList.remove('hidden');
      detailsSection.innerHTML = renderDetailFields(editingDocTplKey, doc.details);
    } else {
      detailsSection.classList.add('hidden');
      detailsSection.innerHTML = '';
    }
  }

  document.getElementById('edit-doc-modal').classList.remove('hidden');
  setTimeout(() => document.getElementById('edit-doc-name').focus(), 60);
}

function closeEditModal() {
  document.getElementById('edit-doc-modal').classList.add('hidden');
  editingDocId = null;
}

document.getElementById('edit-doc-close').addEventListener('click', closeEditModal);
document.getElementById('edit-doc-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('edit-doc-modal')) closeEditModal();
});

document.getElementById('edit-doc-save').addEventListener('click', async () => {
  if (!editingDocId) return;
  const name     = document.getElementById('edit-doc-name').value.trim();
  const category = document.getElementById('edit-doc-cat').value;
  const docDate  = document.getElementById('edit-doc-date').value.trim() || null;

  if (!name) { document.getElementById('edit-doc-name').focus(); return; }

  /* Collecte des champs template */
  let details = null;
  const detailInputs = document.querySelectorAll('.edit-detail-field');
  if (detailInputs.length > 0) {
    const obj = {};
    detailInputs.forEach(input => {
      const v = input.value.trim();
      if (v) obj[input.dataset.key] = v;
    });
    if (Object.keys(obj).length > 0) details = obj;
  }

  try {
    await updateDocument(editingDocId, { name, category, docDate, details });
    closeEditModal();
    allDocs = await getAllDocuments();
    renderGrid();
    showToast('Document mis à jour');
  } catch (err) {
    showToast('Erreur : ' + err.message);
  }
});

document.getElementById('edit-doc-name').addEventListener('keydown', e => {
  if (e.key === 'Escape') closeEditModal();
});

/* ═══════════════════════════════════════════════════════════════════
   INITIALISATION
   ═══════════════════════════════════════════════════════════════════ */

async function init() {
  try {
    await initDB();
    allDocs = await getAllDocuments();
    renderGrid();
    updateRappelsBadge();
  } catch (err) {
    console.error('Erreur init medical :', err);
    showToast('Erreur de chargement');
  }
}

init();
initAuth();
