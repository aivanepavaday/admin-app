/**
 * demarches.js — Contrôleur de la page des démarches administratives
 * Navigation entre vues, rendu des cartes, détail avec vérification des documents
 */

import { loadDemarches, searchDemarches, matchDocuments, buildSummary, buildAssistantQuestion } from './modules/demarches.js';
import { initDB, getAllDocuments } from './modules/documents.js';
import { initAuth } from './modules/auth.js';

'use strict';

/* ── Utilitaires ── */
const esc = s => String(s)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;')
  .replace(/>/g,'&gt;').replace(/"/g,'&quot;');

const toast = document.getElementById('toast');
let toastTimer;
function showToast(msg, duration = 3000) {
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), duration);
}

/* ── Navigation ── */
const viewList   = document.getElementById('view-list');
const viewDetail = document.getElementById('view-detail');

function showView(name) {
  viewList.classList.toggle('active',   name === 'list');
  viewDetail.classList.toggle('active', name === 'detail');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.getElementById('back-btn').addEventListener('click', () => showView('list'));

/* ── État global ── */
let allDemarches = [];
let userDocs     = [];
let matchCache   = {};          /* { demar.id: matchResult } */
let currentQuery = '';

/* ═══════════════════════════════════════════════════════════════════
   VUE LISTE
   ═══════════════════════════════════════════════════════════════════ */

const searchInput  = document.getElementById('search-input');
const searchClear  = document.getElementById('search-clear');
const deGrid       = document.getElementById('demarche-grid');
const emptySearch  = document.getElementById('empty-search');
const emptyQuery   = document.getElementById('empty-query');

/* Recherche */
searchInput.addEventListener('input', () => {
  currentQuery = searchInput.value.trim();
  searchClear.classList.toggle('hidden', !currentQuery);
  renderGrid(searchDemarches(currentQuery, allDemarches));
});

searchClear.addEventListener('click', () => {
  searchInput.value = '';
  currentQuery = '';
  searchClear.classList.add('hidden');
  searchInput.focus();
  renderGrid(allDemarches);
});

/* Rendu de la grille */
function renderGrid(demarches) {
  emptySearch.classList.add('hidden');

  if (demarches.length === 0) {
    deGrid.innerHTML = '';
    emptySearch.classList.remove('hidden');
    emptyQuery.textContent = currentQuery ? `pour « ${esc(currentQuery)} »` : '';
    return;
  }

  deGrid.innerHTML = demarches.map(d => {
    const result = matchCache[d.id];
    return renderCard(d, result);
  }).join('');

  /* Attacher les événements de clic */
  deGrid.querySelectorAll('.demarche-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.id;
      const d  = allDemarches.find(x => x.id === id);
      if (d) renderDetail(d);
    });
  });
}

/* Carte de démarche */
function renderCard(d, matchResult) {
  const color = d.color;
  const n     = matchResult?.found.length  ?? null;
  const total = matchResult?.total         ?? d.documents.length;

  /* Progression */
  let progressHTML = '';
  if (matchResult !== undefined) {
    const pct       = total > 0 ? Math.round((n / total) * 100) : 0;
    const scoreClass = n === total ? 'complete' : n === 0 ? 'empty' : 'partial';
    progressHTML = `
      <div class="card-progress">
        <div class="progress-track">
          <div class="progress-fill" style="width:${pct}%"></div>
        </div>
        <div class="progress-label">
          <span>Documents</span>
          <span class="progress-score ${scoreClass}">${n}/${total}</span>
        </div>
      </div>`;
  } else {
    progressHTML = `
      <div class="card-progress">
        <div class="progress-track">
          <div class="progress-fill" style="width:0%"></div>
        </div>
        <div class="progress-label">
          <span>Documents</span>
          <span class="progress-score empty">—/${total}</span>
        </div>
      </div>`;
  }

  return `
    <div class="demarche-card" data-id="${esc(d.id)}" style="--card-color:${color}">
      <div class="card-top">
        <span class="card-dot" style="background:${color}"></span>
        <div class="card-labels">
          <div class="card-label">${esc(d.label)}</div>
          <div class="card-sublabel">${esc(d.fullLabel)}</div>
        </div>
        <span class="card-arrow">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </span>
      </div>
      <p class="card-desc">${esc(d.description)}</p>
      ${progressHTML}
    </div>`;
}

/* ═══════════════════════════════════════════════════════════════════
   VUE DÉTAIL
   ═══════════════════════════════════════════════════════════════════ */

function renderDetail(d) {
  const result = matchCache[d.id] ?? matchDocuments(d.documents, userDocs);
  const { found, missing, total } = result;
  const n = found.length;

  /* Classe de la carte de synthèse */
  const summaryClass = n === total ? 'complete' : n === 0 ? 'empty' : 'partial';
  const pct = total > 0 ? Math.round((n / total) * 100) : 0;
  const summaryText = buildSummary(result);

  /* Documents : trouvés + manquants */
  const docsHTML = [
    ...found.map(({ required, userDoc }) => `
      <div class="doc-check-item found">
        <span class="doc-check-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </span>
        <div class="doc-check-info">
          <div class="doc-check-label">${esc(required.label)}</div>
          <div class="doc-check-meta">${esc(userDoc.name)}</div>
        </div>
      </div>`),
    ...missing.map(({ required }) => `
      <div class="doc-check-item missing">
        <span class="doc-check-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </span>
        <div class="doc-check-info">
          <div class="doc-check-label">${esc(required.label)}</div>
          <div class="doc-check-meta" style="color:var(--danger);opacity:.7">Non trouvé dans votre bibliothèque</div>
        </div>
      </div>`),
  ].join('');

  /* Étapes */
  const etapesHTML = d.etapes.map((e, i) => `
    <div class="step-item">
      <span class="step-num">${i + 1}</span>
      <span class="step-text">${esc(e)}</span>
    </div>`).join('');

  /* Question pré-remplie pour l'assistant */
  const question = encodeURIComponent(buildAssistantQuestion(d, result));

  document.getElementById('detail-body').innerHTML = `
    <!-- En-tête -->
    <div class="detail-header">
      <span class="detail-dot" style="background:${d.color}"></span>
      <div class="detail-header-text">
        <div class="detail-label">${esc(d.fullLabel)}</div>
        <div class="detail-sublabel">${esc(d.description)}</div>
      </div>
    </div>

    <!-- Synthèse documents -->
    <div class="summary-card ${summaryClass}">
      <div class="summary-bar-wrap">
        <div class="summary-bar-row">
          <span class="summary-text">Vos documents</span>
          <span class="summary-score">${n}/${total}</span>
        </div>
        <div class="summary-bar">
          <div class="summary-bar-fill" style="width:${pct}%"></div>
        </div>
      </div>
      <p class="summary-text">${esc(summaryText)}</p>
    </div>

    <!-- Documents requis -->
    <div class="detail-section">
      <div class="detail-section-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        Documents requis
      </div>
      <div class="doc-check-list">${docsHTML}</div>
    </div>

    <!-- Étapes -->
    <div class="detail-section">
      <div class="detail-section-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="9 11 12 14 22 4"/>
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
        </svg>
        Étapes
      </div>
      <div class="steps-list">${etapesHTML}</div>
    </div>

    <!-- Lien officiel -->
    <div class="detail-section">
      <div class="detail-section-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
        </svg>
        Lien officiel
      </div>
      <a href="${esc(d.lien)}" target="_blank" rel="noopener" class="official-link">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
          <polyline points="15 3 21 3 21 9"/>
          <line x1="10" y1="14" x2="21" y2="3"/>
        </svg>
        ${esc(d.lienLabel)}
      </a>
    </div>

    <!-- Bouton assistant -->
    <a href="index.html?q=${question}" class="ask-assistant-btn">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
      Demander à l'assistant
    </a>`;

  showView('detail');
}

/* ═══════════════════════════════════════════════════════════════════
   INITIALISATION
   ═══════════════════════════════════════════════════════════════════ */

async function init() {
  try {
    /* Charger en parallèle : JSON des démarches + IndexedDB */
    await initDB();
    const [demarches, docs] = await Promise.all([
      loadDemarches(),
      getAllDocuments(),
    ]);

    allDemarches = demarches;
    userDocs     = docs;

    /* Pré-calculer le matching pour toutes les démarches */
    for (const d of allDemarches) {
      matchCache[d.id] = matchDocuments(d.documents, userDocs);
    }

    renderGrid(allDemarches);

  } catch (err) {
    console.error('Erreur init démarches :', err);
    deGrid.innerHTML = `
      <div class="loading-placeholder" style="color:var(--danger)">
        Impossible de charger les démarches.
      </div>`;
    showToast('Erreur de chargement');
  }
}

init();
initAuth();
