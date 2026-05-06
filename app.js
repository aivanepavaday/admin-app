/**
 * app.js — Point d'entrée principal
 * Gère la navigation, le micro, l'assistant, et coordonne les modules
 */

import {
  initDB, addDocument, getAllDocuments, deleteDocument, updateCategory, updateDocument,
  getDocumentData, guessCategory, formatSize, formatDate, fileExt, escHtml,
  CATEGORIES, CAT_COLORS,
  getCustomFolders, saveCustomFolder, deleteCustomFolder,
  getAllCategories, getCategoryColor, reassignCategory
} from './modules/documents.js';

import { initAuth, getUser } from './modules/auth.js';
import {
  subscribeDocuments, addDocumentSync, deleteDocumentSync,
  updateDocumentSync, migrateFromLocal, isMigrated,
} from './modules/firestore-sync.js';

import { askStream, hasApiKey, clearHistory, analyzeAdminDocument, isAutoAnalyseEnabled } from './modules/assistant.js';
import { getUrgentCount, computeReminder, addRappel, getRappels } from './modules/medical.js';
import { renderDocCard, detectTemplateKey, getTemplate, renderDetailFields } from './modules/document-templates.js';

'use strict';

/* ── DOM refs globaux ───────────────────────────────────────────── */
const toast    = document.getElementById('toast');
const navBtns  = document.querySelectorAll('.nav-btn');

/* ── IDs des cartes actuellement dépliées (persist entre re-renders) ── */
const expandedCards = new Set();

/* ── Utilitaire toast ────────────────────────────────────────────── */
let toastTimer;
export function showToast(msg, duration = 3200) {
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), duration);
}

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

      const content  = document.getElementById('viewer-content');
      const dlBtn    = `<a href="${_viewerBlobUrl}" download="${escHtml(doc.name)}" class="viewer-download-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>Télécharger le document</a>`;

      if (fullDoc.mimeType === 'application/pdf') {
        content.innerHTML = `
          <div class="viewer-pdf-wrap">
            <iframe src="${_viewerBlobUrl}" title="${escHtml(doc.name)}"></iframe>
            <div class="viewer-pdf-footer">${dlBtn}</div>
          </div>`;
      } else if (fullDoc.mimeType && fullDoc.mimeType.startsWith('image/')) {
        content.innerHTML = `<img src="${_viewerBlobUrl}" alt="${escHtml(doc.name)}" />`;
      } else {
        content.innerHTML = `<div class="viewer-unsupported">
          <p>Aperçu non disponible pour ce type de fichier.</p>
          ${dlBtn}
        </div>`;
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
   NAVIGATION
   ═══════════════════════════════════════════════════════════════════ */
navBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    navBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.getElementById(btn.dataset.section).classList.add('active');
    _syncBottomNav(btn.dataset.section);
  });
});

function _syncBottomNav(sectionId) {
  document.querySelectorAll('#bottom-nav .bnav-tab[data-section]').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.section === sectionId);
  });
}

document.querySelectorAll('#bottom-nav .bnav-tab[data-section]').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelector(`.nav-btn[data-section="${tab.dataset.section}"]`)?.click();
  });
});

/* ═══════════════════════════════════════════════════════════════════
   ASSISTANT — Micro & Saisie texte
   ═══════════════════════════════════════════════════════════════════ */

const micBtn        = document.getElementById('mic-btn');
const questionInput = document.getElementById('question-input');
const sendBtn       = document.getElementById('send-btn');
const responseArea  = document.getElementById('response-area');
const convThread    = document.getElementById('conv-thread');
const clearBtn      = document.getElementById('clear-btn');

/* Enveloppe l'icône micro dans un wrapper (nécessaire pour le style CSS) */
const micIcon  = micBtn.querySelector('.mic-icon');
const micLabel = micBtn.querySelector('.mic-label');
const iconWrap = document.createElement('div');
iconWrap.className = 'mic-icon-wrap';
micIcon.parentNode.insertBefore(iconWrap, micIcon);
iconWrap.appendChild(micIcon);

/* ── Auto-resize du textarea ── */
questionInput.addEventListener('input', () => {
  questionInput.style.height = 'auto';
  questionInput.style.height = questionInput.scrollHeight + 'px';
});

questionInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
});

sendBtn.addEventListener('click', handleSend);
clearBtn.addEventListener('click', () => {
  clearHistory();
  convThread.innerHTML = '';
  responseArea.classList.add('hidden');
});

/* ── Reconnaissance vocale ── */
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition  = null;
let isListening  = false;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.lang            = 'fr-FR';
  recognition.interimResults  = true;
  recognition.maxAlternatives = 1;

  recognition.addEventListener('result', e => {
    const transcript = Array.from(e.results).map(r => r[0].transcript).join('');
    questionInput.value = transcript;
    questionInput.style.height = 'auto';
    questionInput.style.height = questionInput.scrollHeight + 'px';
  });

  recognition.addEventListener('end', () => {
    stopListening();
    if (questionInput.value.trim()) handleSend();
  });

  recognition.addEventListener('error', e => {
    stopListening();
    showToast('Erreur micro : ' + e.error);
  });
}

micBtn.addEventListener('click', () => {
  if (!SpeechRecognition) {
    showToast('Reconnaissance vocale non supportée dans ce navigateur');
    return;
  }
  isListening ? stopListening() : startListening();
});

function startListening() {
  isListening = true;
  micBtn.classList.add('listening');
  micLabel.textContent = 'Écoute en cours…';
  recognition.start();
}

function stopListening() {
  isListening = false;
  micBtn.classList.remove('listening');
  micLabel.textContent = 'Appuyer pour parler';
  try { recognition.stop(); } catch (_) {}
}

/* ── Envoi de question et appel API Claude ── */
async function handleSend() {
  const q = questionInput.value.trim();
  if (!q) return;

  questionInput.value = '';
  questionInput.style.height = 'auto';
  sendBtn.disabled = true;

  /* Afficher la section de conversation */
  responseArea.classList.remove('hidden');

  /* Bulle utilisateur */
  appendMessage('user', q);

  /* Vérifier la clé API */
  if (!hasApiKey()) {
    appendErrorBubble(
      'Clé API Anthropic non configurée. ' +
      '<a href="parametres.html" style="color:var(--accent)">→ Configurer dans les Paramètres</a>'
    );
    sendBtn.disabled = false;
    return;
  }

  /* Construire le contexte documents */
  const docs = await getAllDocuments();
  const docsContext = docs.length
    ? 'Documents dans la bibliothèque de l\'utilisateur :\n' +
      docs.map(d => `- ${d.name} (${d.category})`).join('\n')
    : '';

  /* Bulle assistant en cours de frappe */
  const bubble = createTypingBubble();

  try {
    let fullText = '';
    for await (const chunk of askStream(q, docsContext)) {
      fullText += chunk;
      bubble.innerHTML = renderMarkdown(fullText) + '<span class="typing-cursor">▍</span>';
      convThread.scrollTop = convThread.scrollHeight;
    }
    /* Supprimer le curseur clignotant une fois terminé */
    bubble.innerHTML = renderMarkdown(fullText);
    /* Rendre les noms de fichiers cliquables dans la réponse */
    linkifyDocRefs(bubble, docs);
  } catch (err) {
    bubble.innerHTML = `<span style="color:var(--danger)">${escHtml(err.message)}</span>` +
      (err.code === 'NO_KEY'
        ? ` <a href="parametres.html" style="color:var(--accent)">→ Paramètres</a>`
        : '');
  } finally {
    sendBtn.disabled = false;
    convThread.scrollTop = convThread.scrollHeight;
  }
}

/* ── Rendu Markdown minimal (sécurisé) ── */
function renderMarkdown(raw) {
  /* 1. Échapper le HTML */
  let s = raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  /* 2. **gras** */
  s = s.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  /* 3. Listes à tirets/puces */
  s = s.replace(/^[ \t]*[-•*] (.+)/gm, '<li>$1</li>');
  s = s.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
  /* Fusionner les <ul> adjacents */
  s = s.replace(/<\/ul>\s*<ul>/g, '');

  /* 4. Sauts de ligne */
  s = s.replace(/\n/g, '<br>');

  return s;
}

/* ── Rend les noms de fichiers cliquables dans une bulle IA ── */
/**
 * Cherche les noms de documents IndexedDB dans le HTML de la bulle et les
 * transforme en boutons inline qui ouvrent la visionneuse.
 * On travaille sur la chaîne HTML échappée (escHtml) pour éviter les faux positifs.
 */
function linkifyDocRefs(bubble, docs) {
  if (!docs || docs.length === 0) return;

  /* Trier par longueur décroissante : les noms longs d'abord
     (évite qu'un nom court devienne un sous-match d'un nom long) */
  const sorted = [...docs].sort((a, b) => b.name.length - a.name.length);

  let html = bubble.innerHTML;

  const replacements = [];
  for (const doc of sorted) {
    /* On cherche le nom tel qu'il apparaît dans le HTML échappé */
    const escaped = escHtml(doc.name);
    if (!html.includes(escaped)) continue;

    /* Placeholder unique pour éviter les remplacements en cascade */
    const placeholder = `\x00DOC${doc.id}\x00`;
    html = html.split(escaped).join(placeholder);
    replacements.push({ placeholder, doc });
  }

  /* Injecter les boutons */
  for (const { placeholder, doc } of replacements) {
    const btn =
      `<button class="doc-ref" data-doc-id="${doc.id}">` +
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">` +
      `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>` +
      `<polyline points="14 2 14 8 20 8"/>` +
      `</svg>${escHtml(doc.name)}</button>`;
    html = html.split(placeholder).join(btn);
  }

  bubble.innerHTML = html;

  /* Attacher les clics */
  bubble.querySelectorAll('.doc-ref').forEach(btn => {
    btn.addEventListener('click', () => {
      const id  = Number(btn.dataset.docId);
      const doc = docs.find(d => d.id === id);
      if (doc) openViewer(doc);
    });
  });
}

/* ── Helpers de construction des bulles ── */
function appendMessage(role, content) {
  const wrap = document.createElement('div');
  wrap.className = `msg msg-${role}`;
  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.innerHTML = role === 'user' ? escHtml(content) : renderMarkdown(content);
  wrap.appendChild(bubble);
  convThread.appendChild(wrap);
  convThread.scrollTop = convThread.scrollHeight;
}

function createTypingBubble() {
  const wrap = document.createElement('div');
  wrap.className = 'msg msg-assistant';
  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.innerHTML = '<span class="typing-cursor">▍</span>';
  wrap.appendChild(bubble);
  convThread.appendChild(wrap);
  convThread.scrollTop = convThread.scrollHeight;
  return bubble;
}

function appendErrorBubble(html) {
  const wrap = document.createElement('div');
  wrap.className = 'msg msg-assistant';
  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble msg-error';
  bubble.innerHTML = html;
  wrap.appendChild(bubble);
  convThread.appendChild(wrap);
  convThread.scrollTop = convThread.scrollHeight;
}

/* ═══════════════════════════════════════════════════════════════════
   MODULE DOCUMENTS
   ═══════════════════════════════════════════════════════════════════ */

const uploadBtn    = document.getElementById('upload-btn');
const fileInput    = document.getElementById('file-input');
const dropZone     = document.getElementById('drop-zone');
const dropOverlay  = document.getElementById('drop-overlay');
const docGrid      = document.getElementById('doc-grid');
const docCount     = document.getElementById('doc-count');
const navDocCount  = document.getElementById('nav-doc-count');
const catFilter    = document.getElementById('cat-filter');
const subcatFilter = document.getElementById('subcat-filter');

/* Catégorie filtrée actuellement ('': tous) */
let activeCat    = '';
/* Sous-catégorie filtrée actuellement ('': toutes) */
let activeSubCat = '';
/* Cache de tous les documents (mis à jour par renderGrid / _renderGridFromFirestore) */
let _allDocs     = [];

/* ── Rendu des pills de catégorie (défaut + custom) ── */
function renderCatFilter() {
  /* Supprimer les pills custom précédentes (pas les pills fixes ni le btn "+") */
  catFilter.querySelectorAll('.cat-pill.custom').forEach(p => p.remove());

  const addBtn = document.getElementById('add-folder-btn');

  getCustomFolders().forEach(({ name, color }) => {
    const pill = document.createElement('button');
    pill.className = 'cat-pill custom';
    pill.dataset.cat = name;

    /* Si la pill est active sur ce dossier, on la marque */
    if (activeCat === name) pill.classList.add('active');

    /* Fond coloré très léger pour les dossiers custom */
    pill.style.borderColor = color + '60';

    pill.innerHTML = `
      ${escHtml(name)}
      <button class="cat-pill-delete" title="Supprimer le dossier" tabindex="-1">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>`;

    /* Supprimer le dossier au clic sur "×" */
    pill.querySelector('.cat-pill-delete').addEventListener('click', async e => {
      e.stopPropagation();
      deleteCustomFolder(name);
      /* Réassigner les documents de ce dossier vers "Autres" */
      await reassignCategory(name, 'Autres');
      if (activeCat === name) activeCat = '';
      renderCatFilter();
      await renderGrid();
      showToast(`Dossier "${name}" supprimé — documents déplacés vers Autres`);
    });

    catFilter.insertBefore(pill, addBtn);
  });
}

/* ── Filtre par catégorie ── */
catFilter.addEventListener('click', e => {
  const pill = e.target.closest('.cat-pill');
  if (!pill || e.target.closest('.cat-pill-delete')) return;
  catFilter.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
  pill.classList.add('active');
  activeCat    = pill.dataset.cat;
  activeSubCat = '';
  if (_firestoreDocs !== null) _renderGridFromFirestore(); else renderGrid();
});

/* ── Sous-catégories disponibles pour une catégorie ── */
function _getSubCatsForCat(cat) {
  return [...new Set(
    _allDocs.filter(d => d.category === cat && d.sous_categorie)
            .map(d => d.sous_categorie)
  )].sort();
}

/* ── Rendu du filtre par sous-catégorie ── */
function renderSubCatFilter(cat) {
  if (!cat) {
    subcatFilter.classList.add('hidden');
    subcatFilter.innerHTML = '';
    return;
  }
  const subs = _getSubCatsForCat(cat);
  if (subs.length === 0) {
    subcatFilter.classList.add('hidden');
    subcatFilter.innerHTML = '';
    return;
  }
  const allPill = `<button class="subcat-pill${!activeSubCat ? ' active' : ''}" data-subcat="">Tous</button>`;
  const subPills = subs.map(s =>
    `<button class="subcat-pill${activeSubCat === s ? ' active' : ''}" data-subcat="${escHtml(s)}">${escHtml(s)}</button>`
  ).join('');
  subcatFilter.innerHTML = allPill + subPills;
  subcatFilter.classList.remove('hidden');
}

/* ── Filtre par sous-catégorie ── */
subcatFilter.addEventListener('click', e => {
  const pill = e.target.closest('.subcat-pill');
  if (!pill) return;
  subcatFilter.querySelectorAll('.subcat-pill').forEach(p => p.classList.remove('active'));
  pill.classList.add('active');
  activeSubCat = pill.dataset.subcat;
  if (_firestoreDocs !== null) _renderGridFromFirestore(); else renderGrid();
});

/* ═══════════════════════════════════════════════════════════════════
   MODAL CRÉATION DE DOSSIER
   ═══════════════════════════════════════════════════════════════════ */

const addFolderBtn       = document.getElementById('add-folder-btn');
const folderModal        = document.getElementById('folder-modal');
const folderNameInput    = document.getElementById('folder-name-input');
const folderModalError   = document.getElementById('folder-modal-error');
const folderModalCancel  = document.getElementById('folder-modal-cancel');
const folderModalConfirm = document.getElementById('folder-modal-confirm');

function openFolderModal() {
  folderNameInput.value = '';
  folderNameInput.classList.remove('error');
  folderModalError.classList.add('hidden');
  folderModalError.textContent = '';
  folderModal.classList.remove('hidden');
  /* Focus automatique après l'animation d'ouverture */
  setTimeout(() => folderNameInput.focus(), 80);
}

function closeFolderModal() {
  folderModal.classList.add('hidden');
}

async function confirmFolderCreation() {
  const name = folderNameInput.value.trim();

  /* Validation */
  try {
    const folder = saveCustomFolder(name);
    closeFolderModal();
    renderCatFilter();
    /* Sélectionner automatiquement le nouveau dossier */
    activeCat = folder.name;
    catFilter.querySelectorAll('.cat-pill').forEach(p => {
      p.classList.toggle('active', p.dataset.cat === folder.name);
    });
    await renderGrid();
    showToast(`Dossier "${folder.name}" créé`);
  } catch (err) {
    /* Afficher l'erreur sous le champ */
    folderNameInput.classList.add('error');
    folderModalError.textContent = err.message;
    folderModalError.classList.remove('hidden');
    folderNameInput.select();
  }
}

addFolderBtn.addEventListener('click', openFolderModal);
folderModalCancel.addEventListener('click', closeFolderModal);
folderModalConfirm.addEventListener('click', confirmFolderCreation);

/* Fermer en cliquant sur le fond */
folderModal.addEventListener('click', e => {
  if (e.target === folderModal) closeFolderModal();
});

/* Valider avec Entrée, fermer avec Échap */
folderNameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter')  { e.preventDefault(); confirmFolderCreation(); }
  if (e.key === 'Escape') closeFolderModal();
});

/* Effacer l'erreur dès que l'utilisateur retape */
folderNameInput.addEventListener('input', () => {
  folderNameInput.classList.remove('error');
  folderModalError.classList.add('hidden');
});

/* ── Déclenchement de l'import ── */
uploadBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', e => {
  const files = Array.from(e.target.files);
  fileInput.value = '';
  if (!files.length) return;
  if (isAutoAnalyseEnabled() && hasApiKey()) {
    const entries = files.map(file => ({ file, category: guessCategory(file.name) }));
    processWithAnalysis(entries);
  } else {
    openImportPanel(files);
  }
});

/* ── Glisser-déposer ── */
let dragCounter = 0; // compteur pour éviter les faux dragleave

dropZone.addEventListener('dragenter', e => {
  e.preventDefault();
  dragCounter++;
  dropZone.classList.add('drag-over');
  dropOverlay.classList.remove('hidden');
});

dropZone.addEventListener('dragleave', () => {
  dragCounter--;
  if (dragCounter <= 0) {
    dragCounter = 0;
    dropZone.classList.remove('drag-over');
    dropOverlay.classList.add('hidden');
  }
});

dropZone.addEventListener('dragover', e => e.preventDefault());

dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dragCounter = 0;
  dropZone.classList.remove('drag-over');
  dropOverlay.classList.add('hidden');

  const files = Array.from(e.dataTransfer.files);
  if (!files.length) return;
  if (isAutoAnalyseEnabled() && hasApiKey()) {
    const entries = files.map(file => ({ file, category: guessCategory(file.name) }));
    processWithAnalysis(entries);
  } else {
    openImportPanel(files);
  }
});

/* ═══════════════════════════════════════════════════════════════════
   PANNEAU DE CONFIRMATION D'IMPORT
   ═══════════════════════════════════════════════════════════════════ */

const importPanel      = document.getElementById('import-panel');
const importFileList   = document.getElementById('import-file-list');
const importConfirmBtn = document.getElementById('import-confirm-btn');
const importCancelBtn  = document.getElementById('import-cancel-btn');
const importHint       = document.getElementById('import-hint');

let pendingFiles = []; // fichiers en attente de confirmation

function openImportPanel(files) {
  pendingFiles = files;
  importFileList.innerHTML = '';

  files.forEach((file, i) => {
    const cat = guessCategory(file.name);
    /* getAllCategories() inclut les dossiers custom */
    const allCats = getAllCategories();

    /* Ligne de fichier avec sélecteur de catégorie */
    const row = document.createElement('div');
    row.className = 'import-row';
    row.innerHTML = `
      <span class="import-row-ext">${escHtml(fileExt(file.name))}</span>
      <div class="import-row-info">
        <span class="import-row-name">${escHtml(file.name)}</span>
        <span class="import-row-size">${formatSize(file.size)}</span>
      </div>
      <select class="import-cat-select" data-index="${i}">
        ${allCats.map(c =>
          `<option value="${escHtml(c)}" ${c === cat ? 'selected' : ''}>${escHtml(c)}</option>`
        ).join('')}
      </select>`;
    importFileList.appendChild(row);
  });

  importHint.textContent = `${files.length} fichier${files.length > 1 ? 's' : ''} sélectionné${files.length > 1 ? 's' : ''}`;
  importPanel.classList.remove('hidden');
}

function closeImportPanel() {
  importPanel.classList.add('hidden');
  pendingFiles = [];
}

importCancelBtn.addEventListener('click', closeImportPanel);

/* Fermer en cliquant sur le fond */
importPanel.addEventListener('click', e => {
  if (e.target === importPanel) closeImportPanel();
});

/* Confirmation : analyse IA si activée, sinon import direct */
importConfirmBtn.addEventListener('click', async () => {
  if (!pendingFiles.length) return;

  const selects = importFileList.querySelectorAll('.import-cat-select');
  const entries = pendingFiles.map((file, i) => ({
    file,
    category: selects[i]?.value || 'Autres',
  }));

  closeImportPanel();

  if (isAutoAnalyseEnabled() && hasApiKey()) {
    await processWithAnalysis(entries);
  } else {
    await importDirect(entries);
  }
});

/* Génère une miniature base64 (max 220×300 px) pour l'aperçu des cartes */
async function generateThumbnail(file) {
  try {
    const ext = file.name.split('.').pop().toLowerCase();
    const canvas = document.createElement('canvas');
    const ctx    = canvas.getContext('2d');
    const MAX_W  = 220;
    const MAX_H  = 300;

    if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
      const url = URL.createObjectURL(file);
      const img = await new Promise((res, rej) => {
        const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url;
      });
      URL.revokeObjectURL(url);
      const ratio  = Math.min(MAX_W / img.width, MAX_H / img.height, 1);
      canvas.width  = Math.round(img.width  * ratio);
      canvas.height = Math.round(img.height * ratio);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    } else if (ext === 'pdf') {
      if (!window.pdfjsLib) return null;
      const buf      = await file.arrayBuffer();
      const pdfDoc   = await window.pdfjsLib.getDocument({ data: buf }).promise;
      const page     = await pdfDoc.getPage(1);
      const native   = page.getViewport({ scale: 1 });
      const scale    = Math.min(MAX_W / native.width, MAX_H / native.height);
      const viewport = page.getViewport({ scale });
      canvas.width   = Math.round(viewport.width);
      canvas.height  = Math.round(viewport.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
    } else {
      return null;
    }
    return canvas.toDataURL('image/webp', 0.72);
  } catch {
    return null;
  }
}

/* Import direct sans analyse */
async function importDirect(entries) {
  let done = 0;
  const user = getUser();
  for (const { file, category } of entries) {
    try {
      const thumbnail = await generateThumbnail(file);
      if (user) {
        await addDocumentSync(user.uid, file, category, null, null, null, thumbnail, null);
      } else {
        await addDocument(file, category, null, null, null, thumbnail, null);
      }
      done++;
    } catch (err) {
      console.error('Erreur import :', err);
      showToast(`Erreur : ${file.name}`);
    }
  }
  if (!user) await renderGrid();
  showToast(`${done} document${done > 1 ? 's' : ''} importé${done > 1 ? 's' : ''}`);
}

/* Catégorie médicale unique — tout document Santé peut déclencher un rappel */
const MEDICAL_REMIND_CATS = new Set(['Santé']);

/**
 * Si la catégorie confirmée est médicale, crée un rappel à partir des données
 * de l'analyse admin (pas de second appel API — les champs qsp_jours /
 * delai_prelevement_mois sont déjà dans adminAnalysis).
 */
function maybeTriggerMedicalReminder(finalName, category, adminAnalysis) {
  if (!MEDICAL_REMIND_CATS.has(category)) {
    console.log('[Rappel] Catégorie non médicale, pas de rappel :', category);
    return;
  }

  console.log('[Rappel] Catégorie médicale détectée :', category);
  console.log('[Rappel] Données analyse :', adminAnalysis);

  try {
    const medAnalysis = adminToMedicalAnalysis(adminAnalysis);
    console.log('[Rappel] Analyse convertie au format médical :', medAnalysis);

    const reminder = computeReminder(medAnalysis, finalName);
    console.log('[Rappel] Rappel calculé :', reminder);

    if (reminder) {
      addRappel({
        label:      reminder.label,
        rappelDate: reminder.rappelDate,
        expiryDate: reminder.expiryDate,
        type:       medAnalysis.type,
        fileName:   finalName,
        analysis:   medAnalysis,
      });
      refreshHealthBadge();
      console.log('[Rappel] Rappel créé avec succès pour :', finalName);
      showToast('Document médical enregistré — rappel créé');
    } else {
      console.log('[Rappel] Données insuffisantes pour créer un rappel (date ou QSP manquant)');
    }
  } catch (err) {
    console.warn('[Rappel] Erreur lors de la création du rappel :', err);
  }
}

/** Met à jour le badge Santé dans la nav après ajout d'un rappel. */
function refreshHealthBadge() {
  const badge = document.getElementById('nav-health-badge');
  if (!badge) return;
  const n = getUrgentCount();
  badge.textContent = n;
  badge.classList.toggle('hidden', n === 0);
}

/* Import avec analyse IA — modale pour chaque fichier */
async function processWithAnalysis(entries) {
  let saved     = 0;
  let hasMedical = false;
  const user = getUser();

  for (const { file, category } of entries) {
    const result = await runAnalysisModal(file, category);
    if (result) {
      try {
        const docDate        = result.adminAnalysis?.date ?? null;
        const sous_categorie = result.sous_categorie ?? null;
        const details        = result.adminAnalysis?.details ?? null;
        const thumbnail      = await generateThumbnail(file);
        if (user) {
          await addDocumentSync(user.uid, file, result.category, result.name, docDate, sous_categorie, thumbnail, details);
        } else {
          await addDocument(file, result.category, result.name, docDate, sous_categorie, thumbnail, details);
        }
        saved++;

        if (result.category === 'Santé') {
          hasMedical = true;
          /* Créer le rappel à partir des données déjà extraites (pas de second appel API) */
          maybeTriggerMedicalReminder(result.name, result.category, result.adminAnalysis);
        }
      } catch (err) {
        console.error('Erreur enregistrement :', err);
        showToast(`Erreur lors de l'enregistrement de ${file.name}`);
      }
    }
  }

  if (!user) await renderGrid();

  if (hasMedical) {
    /* Informer l'utilisateur et rediriger vers l'espace Santé */
    showToast('Ce document médical a été ajouté à votre espace Santé', 2200);
    console.log('[Import] Document médical — redirection vers medical.html dans 2 s');
    setTimeout(() => { window.location.href = 'medical.html'; }, 2000);
  } else if (saved > 0) {
    showToast(`${saved} document${saved > 1 ? 's' : ''} enregistré${saved > 1 ? 's' : ''}`);
  }
}

/* ═══════════════════════════════════════════════════════════════════
   MODALE D'ANALYSE IA
   ═══════════════════════════════════════════════════════════════════ */

const analyseModal   = document.getElementById('analyse-modal');
const amLoadingEl    = document.getElementById('am-loading');
const amResultEl     = document.getElementById('am-result');
const amErrorEl      = document.getElementById('am-error');
const amLoadingName  = document.getElementById('am-loading-name');
const amNameInput    = document.getElementById('am-name-input');
const amCatSelect    = document.getElementById('am-cat-select');
const amSubCatInput  = document.getElementById('am-subcat-input');
const amSubCatList   = document.getElementById('am-subcat-list');
const amExtras       = document.getElementById('am-extras');
const amErrorMsg     = document.getElementById('am-error-msg');
const editDocSubCat  = document.getElementById('edit-doc-subcat');
const editSubCatList = document.getElementById('edit-subcat-list');

function amShowState(state) {
  amLoadingEl.classList.toggle('hidden', state !== 'loading');
  amResultEl.classList.toggle('hidden',  state !== 'result');
  amErrorEl.classList.toggle('hidden',   state !== 'error');
}

/** Extrait l'extension d'un nom de fichier (avec le point, ex: ".pdf") */
function fileExtDot(name) {
  const m = name.match(/(\.[^.]+)$/);
  return m ? m[1] : '';
}

/**
 * Mappe la catégorie + sous_categorie renvoyées par Claude vers une de nos catégories.
 * Gère en priorité les documents médicaux via sous_categorie, puis les autres par mots-clés.
 */
function determineMappedCat(analysis, fallback) {
  const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const cat  = norm(analysis.categorie ?? '');

  /* 1. Correspondance exacte avec nos catégories (le prompt retourne maintenant
        les accents corrects, donc 'Santé' → 'sante' correspondra directement) */
  const all   = getAllCategories();
  const exact = all.find(c => norm(c) === cat);
  if (exact) return exact;

  /* 2. Fallback mots-clés (sécurité si le modèle omet les accents) */
  if (cat === 'sante' || /medical|ordonnance|soin/.test(cat))            return 'Santé';
  if (/facture|quittance|loyer|bail|logement|locati/.test(cat))          return 'Logement';
  if (/salaire|paie|revenu|retraite|pension|employ/.test(cat))           return 'Revenus';
  if (/impot|fiscal|declaration|avis.?imposition|dgfip/.test(cat))      return 'Impôts';
  if (/assurance|mutuelle|garantie|prevoyance/.test(cat))                return 'Assurance';
  if (/telephone|mobile|telecom|sfr|free|orange|bouygues|forfait/.test(cat)) return 'Téléphone';
  if (/electricite|energie|gaz|eau|edf|engie|chauffage/.test(cat))      return 'Énergie';

  return fallback ?? 'Autres';
}

/**
 * Convertit la date DD/MM/YYYY (format prompt) → YYYY-MM-DD (format computeReminder).
 */
function parseDateFR(dateStr) {
  if (!dateStr) return null;
  const m = String(dateStr).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/**
 * Adapte l'analyse admin au format attendu par computeReminder().
 */
function adminToMedicalAnalysis(adminAnalysis) {
  const typeMap = { 'Ordonnance': 'ordonnance', 'Prise de sang': 'prise_de_sang' };
  return {
    type:                    typeMap[adminAnalysis.sous_categorie] ?? 'autre',
    date_document:           parseDateFR(adminAnalysis.date),
    qsp_jours:               adminAnalysis.qsp_jours,
    delai_prelevement_mois:  adminAnalysis.delai_prelevement_mois,
    medicaments:             [],
  };
}

/**
 * Affiche la modale d'analyse pour un fichier et retourne
 * { name: string, category: string } ou null si l'utilisateur passe.
 */
function runAnalysisModal(file, fallbackCategory) {
  return new Promise(resolve => {
    /* --- Afficher l'état chargement --- */
    amLoadingName.textContent = file.name;
    amShowState('loading');
    analyseModal.classList.remove('hidden');

    /* AbortController : supprime tous les écouteurs d'un coup à la fermeture.
       Évite l'accumulation de handlers sur des appels multiples (import batch). */
    const ac  = new AbortController();
    const sig = { signal: ac.signal };

    /* Re-query des boutons à chaque appel pour toujours avoir les refs DOM actuelles */
    const confBtn    = document.getElementById('am-confirm-btn');
    const skipBtn    = document.getElementById('am-skip-btn');
    const saveBtn    = document.getElementById('am-save-btn');
    const closeBtn   = document.getElementById('am-close-btn');

    function closeModal() {
      ac.abort();
      analyseModal.classList.add('hidden');
    }

    /* Croix : annule l'import du fichier en cours */
    closeBtn.addEventListener('click', () => {
      closeModal();
      resolve(null);
    }, sig);

    /* --- Lancer l'analyse --- */
    console.log(`[Modal] Analyse démarrée pour "${file.name}"`);
    analyzeAdminDocument(file)
      .then(analysis => {
        console.log('[Modal] Analyse reçue :', analysis);

        /* Catégorie mappée (gère 'Sante' + sous_categorie pour les documents médicaux) */
        const mappedCat = determineMappedCat(analysis, fallbackCategory);
        console.log(`[Modal] Catégorie mappée : "${analysis.categorie}" → "${mappedCat}"`);

        /* Remplir les champs éditables */
        document.getElementById('am-result-origname').textContent = file.name;
        amNameInput.value    = analysis.nom_suggere;
        amSubCatInput.value  = '';

        /* Remplir le select catégorie */
        const allCats = getAllCategories();
        amCatSelect.innerHTML = allCats.map(c =>
          `<option value="${escHtml(c)}" ${c === mappedCat ? 'selected' : ''}>${escHtml(c)}</option>`
        ).join('');

        /* Datalist sous-catégorie — sous-cats existantes pour la catégorie sélectionnée */
        function _refreshAmSubCatList() {
          const subs = _getSubCatsForCat(amCatSelect.value);
          amSubCatList.innerHTML = subs.map(s => `<option value="${escHtml(s)}">`).join('');
        }
        _refreshAmSubCatList();
        amCatSelect.addEventListener('change', _refreshAmSubCatList, { signal: ac.signal });

        /* Infos complémentaires */
        amExtras.innerHTML = [
          analysis.organisme && `<div class="am-extra"><span>Organisme</span><span>${escHtml(analysis.organisme)}</span></div>`,
          analysis.date      && `<div class="am-extra"><span>Date</span><span>${escHtml(analysis.date)}</span></div>`,
          analysis.montant   && `<div class="am-extra"><span>Montant</span><span>${escHtml(analysis.montant)}</span></div>`,
          analysis.qsp_jours && `<div class="am-extra"><span>QSP</span><span>${escHtml(String(analysis.qsp_jours))} jours</span></div>`,
          analysis.delai_prelevement_mois && `<div class="am-extra"><span>Délai prélèvement</span><span>${escHtml(String(analysis.delai_prelevement_mois))} mois</span></div>`,
        ].filter(Boolean).join('');

        /* Avertissement si confiance faible */
        const warnEl = document.getElementById('am-confidence-warn');
        warnEl.classList.toggle('hidden', analysis.confiance !== 'faible');
        console.log(`[Modal] Confiance IA : ${analysis.confiance}`);

        amShowState('result');
        amNameInput.focus();

        /* Bouton Confirmer — passe l'analyse complète pour réutilisation (rappels) */
        confBtn.addEventListener('click', () => {
          const finalName      = amNameInput.value.trim() || analysis.nom_suggere;
          const finalCat       = amCatSelect.value;
          const sous_categorie = amSubCatInput.value.trim() || null;
          /* Conserver l'extension originale si le nom suggéré n'en a pas */
          const ext  = fileExtDot(file.name);
          const name = finalName.includes('.') ? finalName : finalName + ext;
          console.log(`[Modal] Confirmation — nom: "${name}", catégorie: "${finalCat}", sous-cat: "${sous_categorie}"`);
          closeModal();
          resolve({ name, category: finalCat, sous_categorie, adminAnalysis: analysis });
        }, sig);
      })
      .catch(err => {
        amErrorMsg.textContent = err.message;
        amShowState('error');

        /* Passer ce fichier */
        skipBtn.addEventListener('click', () => {
          closeModal();
          resolve(null);
        }, sig);

        /* Enregistrer quand même avec le nom original */
        saveBtn.addEventListener('click', () => {
          closeModal();
          resolve({ name: file.name, category: fallbackCategory });
        }, sig);
      });
  });
}

/* ═══════════════════════════════════════════════════════════════════
   RENDU DE LA GRILLE
   ═══════════════════════════════════════════════════════════════════ */

async function renderGrid() {
  let docs = await getAllDocuments();

  /* Mise à jour du cache global (pour les filtres sous-catégorie) */
  _allDocs = docs;

  /* Mise à jour des compteurs */
  const total = docs.length;
  docCount.textContent    = total;
  navDocCount.textContent = total;
  docCount.classList.toggle('hidden', total === 0);
  navDocCount.classList.toggle('hidden', total === 0);

  /* Filtrage par catégorie active */
  if (activeCat)    docs = docs.filter(d => d.category === activeCat);
  if (activeSubCat) docs = docs.filter(d => d.sous_categorie === activeSubCat);

  /* Mise à jour du filtre sous-catégorie */
  renderSubCatFilter(activeCat);

  /* État vide */
  if (docs.length === 0) {
    const emptyMsg = activeCat
      ? `Aucun document dans la catégorie "${activeCat}"`
      : 'Aucun document importé';
    const emptyHint = activeCat
      ? ''
      : '<span>Glissez des fichiers ici ou cliquez sur Importer</span>';

    docGrid.innerHTML = `
      <div class="doc-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="9" y1="13" x2="15" y2="13"/>
          <line x1="9" y1="17" x2="15" y2="17"/>
        </svg>
        <p>${escHtml(emptyMsg)}</p>
        ${emptyHint}
      </div>`;
    return;
  }

  /* Rendu des cartes via le système de templates */
  docGrid.innerHTML = docs.map(doc => renderDocCard(doc, expandedCards)).join('');

  /* Événements sur chaque carte */
  docGrid.querySelectorAll('.doc-card').forEach(card => {
    const id  = Number(card.dataset.id);
    const doc = docs.find(d => d.id === id);
    if (!doc) return;

    /* Voir */
    card.querySelector('.doc-view-btn-full')?.addEventListener('click', e => {
      e.stopPropagation(); openViewer(doc);
    });

    /* Badge catégorie → rotation */
    card.querySelector('.cat-badge')?.addEventListener('click', async e => {
      e.stopPropagation();
      await updateCategory(id, nextCategory(doc.category));
      await renderGrid();
    });

    /* Modifier */
    card.querySelector('.doc-card-edit')?.addEventListener('click', e => {
      e.stopPropagation(); openEditModal(doc);
    });

    /* Partager */
    card.querySelector('.doc-share-btn')?.addEventListener('click', e => {
      e.stopPropagation(); handleShare(doc);
    });

    /* Supprimer */
    card.querySelector('.doc-card-remove')?.addEventListener('click', async e => {
      e.stopPropagation();
      await deleteDocument(id);
      expandedCards.delete(id);
      await renderGrid();
      showToast('Document supprimé');
    });

    /* Retour (verso → recto) */
    card.querySelector('.doc-back-close')?.addEventListener('click', e => {
      e.stopPropagation();
      card.classList.remove('is-flipped');
      expandedCards.delete(id);
    });

    /* Clic sur le recto → flip verso */
    card.addEventListener('click', e => {
      if (e.target.closest('.doc-view-btn-full') ||
          e.target.closest('.doc-card-edit') ||
          e.target.closest('.doc-share-btn') ||
          e.target.closest('.doc-card-remove') ||
          e.target.closest('.doc-back-close') ||
          e.target.closest('.cat-badge')) return;
      if (!card.classList.contains('is-flipped')) {
        card.classList.add('is-flipped');
        expandedCards.add(id);
      }
    });
  });
}

/* Partage d'un document (mobile : Web Share API, desktop : téléchargement) */
async function handleShare(doc) {
  try {
    let blob;
    if (doc.download_url) {
      /* Document Firestore : partage de l'URL */
      if (navigator.share) {
        try { await navigator.share({ title: doc.name, url: doc.download_url }); showToast('Lien partagé'); return; }
        catch (err) { if (err.name === 'AbortError') return; }
      }
      try { await navigator.clipboard.writeText(doc.download_url); showToast('Lien copié dans le presse-papiers'); }
      catch { window.open(doc.download_url, '_blank'); }
      return;
    }
    /* Document local : lire le binaire depuis IndexedDB */
    const fullDoc = await getDocumentData(doc.id);
    blob = new Blob([fullDoc.data], { type: fullDoc.mimeType });

    if (navigator.share && navigator.canShare) {
      const file = new File([blob], doc.name, { type: fullDoc.mimeType });
      if (navigator.canShare({ files: [file] })) {
        try { await navigator.share({ title: doc.name, files: [file] }); showToast('Document partagé'); return; }
        catch (err) { if (err.name === 'AbortError') return; }
      }
    }
    /* Fallback : téléchargement direct */
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = doc.name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Téléchargement démarré');
  } catch {
    showToast('Erreur lors du partage');
  }
}

/* Passe à la catégorie suivante (rotation circulaire, toutes catégories incluses) */
function nextCategory(current) {
  const all = getAllCategories();
  const idx = all.indexOf(current);
  return all[(idx + 1) % all.length];
}

/* ═══════════════════════════════════════════════════════════════════
   MODALE DE MODIFICATION DE DOCUMENT
   ═══════════════════════════════════════════════════════════════════ */

const editDocModal  = document.getElementById('edit-doc-modal');
const editDocName   = document.getElementById('edit-doc-name');
const editDocCat    = document.getElementById('edit-doc-cat');
const editDocDate   = document.getElementById('edit-doc-date');
const editDocSave   = document.getElementById('edit-doc-save');
const editDocClose  = document.getElementById('edit-doc-close');

let editingDocId      = null;
let editingDocTplKey  = null;

function openEditModal(doc) {
  editingDocId     = doc.id;
  editingDocTplKey = detectTemplateKey(doc);

  editDocName.value   = doc.name;
  editDocDate.value   = doc.docDate || '';
  editDocSubCat.value = doc.sous_categorie || '';

  /* Remplir le select avec toutes les catégories disponibles */
  const allCats = getAllCategories();
  editDocCat.innerHTML = allCats.map(c =>
    `<option value="${escHtml(c)}" ${c === doc.category ? 'selected' : ''}>${escHtml(c)}</option>`
  ).join('');

  /* Datalist sous-catégorie */
  const editAc = new AbortController();
  function _refreshEditSubCatList() {
    const subs = _getSubCatsForCat(editDocCat.value);
    editSubCatList.innerHTML = subs.map(s => `<option value="${escHtml(s)}">`).join('');
  }
  _refreshEditSubCatList();
  editDocCat.addEventListener('change', _refreshEditSubCatList, { signal: editAc.signal });
  const _cleanEditAc = () => { editAc.abort(); editDocModal.removeEventListener('hide', _cleanEditAc); };
  editDocModal.addEventListener('hide', _cleanEditAc, { once: true });

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

  editDocModal.classList.remove('hidden');
  setTimeout(() => editDocName.focus(), 60);
}

function closeEditModal() {
  editDocModal.dispatchEvent(new Event('hide'));
  editDocModal.classList.add('hidden');
  editingDocId = null;
}

editDocClose.addEventListener('click', closeEditModal);
editDocModal.addEventListener('click', e => {
  if (e.target === editDocModal) closeEditModal();
});

editDocSave.addEventListener('click', async () => {
  if (!editingDocId) return;
  const name           = editDocName.value.trim();
  const category       = editDocCat.value;
  const docDate        = editDocDate.value.trim() || null;
  const sous_categorie = editDocSubCat.value.trim() || null;

  if (!name) { editDocName.focus(); return; }

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
    const user = getUser();
    if (user) {
      await updateDocumentSync(user.uid, editingDocId, { name, category, docDate, sous_categorie, details });
    } else {
      await updateDocument(editingDocId, { name, category, docDate, sous_categorie, details });
      await renderGrid();
    }
    closeEditModal();
    showToast('Document mis à jour');
  } catch (err) {
    showToast('Erreur : ' + err.message);
  }
});

editDocName.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeEditModal();
});

/* ═══════════════════════════════════════════════════════════════════
   INITIALISATION
   ═══════════════════════════════════════════════════════════════════ */

/* Navigation directe vers Documents via #docs — doit s'exécuter de façon
   synchrone AVANT les opérations async pour éviter le flash "Accueil" */
if (location.hash === '#docs') {
  navBtns.forEach(b => b.classList.remove('active'));
  document.querySelector('.nav-btn[data-section="docs"]')?.classList.add('active');
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById('docs')?.classList.add('active');
  history.replaceState(null, '', location.pathname);
}
_syncBottomNav(document.querySelector('.nav-btn.active')?.dataset.section ?? 'home');

/* ─── Abonnement Firestore actif (pour désabonnement) ─── */
let _unsubDocs = null;

/* ─── Données Firestore (quand connecté) ─── */
let _firestoreDocs = null; // null = pas encore chargé depuis Firestore

async function init() {
  try {
    await initDB();
    renderCatFilter();
    await renderGrid();

    /* Badge Santé — rappels urgents */
    const healthBadge = document.getElementById('nav-health-badge');
    if (healthBadge) {
      const n = getUrgentCount();
      if (n > 0) { healthBadge.textContent = n; healthBadge.classList.remove('hidden'); }
    }

    /* Question pré-remplie depuis demarches.html (?q=...) */
    const prefill = new URLSearchParams(location.search).get('q');
    if (prefill) {
      history.replaceState(null, '', location.pathname);
      navBtns.forEach(b => b.classList.remove('active'));
      navBtns[0]?.classList.add('active');
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      document.getElementById('home')?.classList.add('active');
      _syncBottomNav('home');
      questionInput.value = prefill;
      questionInput.style.height = 'auto';
      questionInput.style.height = questionInput.scrollHeight + 'px';
      await handleSend();
    }

    /* ── Authentification Firebase ── */
    const user = await initAuth();
    await _onFirebaseUserReady(user);

  } catch (err) {
    console.error('Erreur d\'initialisation :', err);
    showToast('Impossible d\'accéder au stockage local');
  }
}

async function _onFirebaseUserReady(user) {
  /* Migration des données locales au premier login */
  if (!isMigrated()) {
    await migrateFromLocal(user.uid);
    showToast('Données synchronisées avec Firebase ✓', 4000);
  }

  /* Abonnement temps réel aux documents Firestore */
  if (_unsubDocs) _unsubDocs();
  _unsubDocs = subscribeDocuments(user.uid, firestoreDocs => {
    _firestoreDocs = firestoreDocs;
    _renderGridFromFirestore();
  });
}

/* Rendu à partir des données Firestore (quand connecté) */
function _renderGridFromFirestore() {
  if (_firestoreDocs === null) return;

  /* Mise à jour du cache global (pour les filtres sous-catégorie) */
  _allDocs = _firestoreDocs;

  const total = _firestoreDocs.length;
  docCount.textContent    = total;
  navDocCount.textContent = total;
  docCount.classList.toggle('hidden', total === 0);
  navDocCount.classList.toggle('hidden', total === 0);

  let docs = _firestoreDocs;
  if (activeCat)    docs = docs.filter(d => d.category === activeCat);
  if (activeSubCat) docs = docs.filter(d => d.sous_categorie === activeSubCat);

  /* Mise à jour du filtre sous-catégorie */
  renderSubCatFilter(activeCat);

  if (docs.length === 0) {
    const emptyMsg  = activeCat ? `Aucun document dans la catégorie "${activeCat}"` : 'Aucun document importé';
    const emptyHint = activeCat ? '' : '<span>Glissez des fichiers ici ou cliquez sur Importer</span>';
    docGrid.innerHTML = `
      <div class="doc-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="9" y1="13" x2="15" y2="13"/>
          <line x1="9" y1="17" x2="15" y2="17"/>
        </svg>
        <p>${escHtml(emptyMsg)}</p>${emptyHint}
      </div>`;
    return;
  }

  docGrid.innerHTML = docs.map(doc => renderDocCard(doc, expandedCards)).join('');
  _attachCardEvents(docs);
}

/* Attache les événements sur les cartes (Firestore ou local) */
function _attachCardEvents(docs) {
  docGrid.querySelectorAll('.doc-card').forEach(card => {
    const id  = Number(card.dataset.id);
    const doc = docs.find(d => d.id == id || d.firestoreId == id);
    if (!doc) return;
    const normalizedDoc = { ...doc, id: doc.id ?? Number(doc.firestoreId) };

    /* Voir */
    card.querySelector('.doc-view-btn-full')?.addEventListener('click', e => {
      e.stopPropagation();
      if (doc.download_url) _openViewerFromUrl(doc);
      else openViewer(normalizedDoc);
    });

    /* Badge catégorie */
    card.querySelector('.cat-badge')?.addEventListener('click', async e => {
      e.stopPropagation();
      const next = nextCategory(doc.category);
      const user = getUser();
      if (user) await updateDocumentSync(user.uid, id, { category: next });
      else { await updateCategory(id, next); await renderGrid(); }
    });

    /* Modifier */
    card.querySelector('.doc-card-edit')?.addEventListener('click', e => {
      e.stopPropagation();
      openEditModal(normalizedDoc);
    });

    /* Partager */
    card.querySelector('.doc-share-btn')?.addEventListener('click', e => {
      e.stopPropagation();
      handleShare(normalizedDoc);
    });

    /* Supprimer */
    card.querySelector('.doc-card-remove')?.addEventListener('click', async e => {
      e.stopPropagation();
      const user = getUser();
      if (user) await deleteDocumentSync(user.uid, id);
      else { await deleteDocument(id); await renderGrid(); }
      expandedCards.delete(id);
      showToast('Document supprimé');
    });

    /* Retour (verso → recto) */
    card.querySelector('.doc-back-close')?.addEventListener('click', e => {
      e.stopPropagation();
      card.classList.remove('is-flipped');
      expandedCards.delete(id);
    });

    /* Clic sur le recto → flip verso */
    card.addEventListener('click', e => {
      if (e.target.closest('.doc-view-btn-full') ||
          e.target.closest('.doc-card-edit') ||
          e.target.closest('.doc-share-btn') ||
          e.target.closest('.doc-card-remove') ||
          e.target.closest('.doc-back-close') ||
          e.target.closest('.cat-badge')) return;
      if (!card.classList.contains('is-flipped')) {
        card.classList.add('is-flipped');
        expandedCards.add(id);
      }
    });
  });
}

/* Ouvre la visionneuse depuis une URL Firebase Storage */
function _openViewerFromUrl(doc) {
  const name    = doc.name;
  const url     = doc.download_url;
  const modal   = document.getElementById('viewer-modal');
  const content = document.getElementById('viewer-content');

  document.getElementById('viewer-name').textContent = name;
  modal.classList.remove('hidden');

  const dlBtn = `<a href="${escHtml(url)}" download="${escHtml(name)}" target="_blank" class="viewer-download-btn">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>Télécharger le document</a>`;

  if (doc.mimeType === 'application/pdf') {
    content.innerHTML = `<div class="viewer-pdf-wrap">
      <iframe src="${escHtml(url)}" title="${escHtml(name)}"></iframe>
      <div class="viewer-pdf-footer">${dlBtn}</div>
    </div>`;
  } else if (doc.mimeType?.startsWith('image/')) {
    content.innerHTML = `<img src="${escHtml(url)}" alt="${escHtml(name)}" />`;
  } else {
    content.innerHTML = `<div class="viewer-unsupported"><p>Aperçu non disponible.</p>${dlBtn}</div>`;
  }
}

init();
