/**
 * demarches.js — Contrôleur de la page démarches
 * Données intégrées, progression automatique, cards expandables.
 */

import {
  getDemarchesData, getCatColor,
  checkDocumentPresent, getProgression,
  searchDemarches, buildAssistantQuestion,
} from './modules/demarches.js';
import { initDB, getAllDocuments } from './modules/documents.js';
import { initAuth }               from './modules/auth.js';
import { subscribeDocuments }     from './modules/firestore-sync.js';

'use strict';

/* ── Échappement HTML ── */
const esc = s => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ── Toast ── */
const toastEl = document.getElementById('toast');
let _toastTimer;
function showToast(msg, ms = 3000) {
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => toastEl.classList.add('hidden'), ms);
}

/* ── État global ── */
const allDemarches = getDemarchesData();
let userDocs       = [];
let currentQuery   = '';
const expandedIds  = new Set();

/* ── DOM ── */
const deGrid      = document.getElementById('demarche-grid');
const emptySearch = document.getElementById('empty-search');
const emptyQuery  = document.getElementById('empty-query');
const searchInput = document.getElementById('search-input');
const searchClear = document.getElementById('search-clear');

/* ── Couleur de la barre de progression ── */
function progressColor(pct) {
  if (pct === 100) return '#22c55e';
  if (pct > 0)     return '#f59e0b';
  return '#2a2a35';
}

/* ── Trouve le document utilisateur le plus récent correspondant ── */
function findMatchingDoc(docRequis) {
  if (docRequis.externe || !docRequis.categories?.length) return null;
  /* userDocs est déjà trié par date décroissante — première correspondance = plus récent */
  return userDocs.find(doc =>
    docRequis.categories.includes(doc.category || doc.categorie || '')
  ) ?? null;
}

function truncate(str, max = 28) {
  return str.length > max ? str.slice(0, max) + '…' : str;
}

/* ── Rendu d'une carte ── */
function renderCard(d) {
  const prog     = getProgression(d, userDocs);
  const { presents, total, pourcentage } = prog;
  const catColor = getCatColor(d.categorie);
  const barColor = progressColor(pourcentage);
  const isOpen   = expandedIds.has(d.id);

  let scoreHtml;
  if (pourcentage === 100) {
    scoreHtml = `<span style="color:#22c55e;font-weight:600">${presents}/${total} documents prêts ✓</span>`;
  } else if (pourcentage === 0) {
    scoreHtml = `<span style="color:var(--muted)">${presents}/${total} documents prêts</span>`;
  } else {
    scoreHtml = `<span style="color:#f59e0b;font-weight:600">${presents}/${total} documents prêts</span>`;
  }

  /* Liste des documents */
  const docsHtml = d.documents.map(doc => {
    if (doc.externe) {
      return `<div class="d-doc-item d-doc-external">
        <span class="d-doc-icon">🔗</span>
        <div class="d-doc-label">
          <a href="${esc(doc.url || '#')}" target="_blank" rel="noopener" class="d-ext-link">${esc(doc.label)}</a>
        </div>
      </div>`;
    }
    const matched = findMatchingDoc(doc);
    const matchSpan = matched
      ? `<span class="d-doc-match">→ ${esc(truncate(matched.name))}</span>`
      : '';
    return `<div class="d-doc-item ${matched ? 'd-doc-found' : 'd-doc-missing'}">
      <span class="d-doc-icon">${matched ? '✅' : '⬜'}</span>
      <div class="d-doc-label">
        <span class="d-doc-req">${esc(doc.label)}</span>${matchSpan}
      </div>
    </div>`;
  }).join('');

  const question = encodeURIComponent(buildAssistantQuestion(d, prog));

  return `
    <div class="demarche-card${isOpen ? ' d-open' : ''}" data-id="${esc(d.id)}">

      <!-- En-tête cliquable -->
      <div class="d-header">
        <div class="d-info">
          <div class="d-title">${esc(d.titre)}</div>
          <div class="d-meta">
            <span class="d-badge"
              style="background:${catColor}20;color:${catColor};border-color:${catColor}50">
              ${esc(d.categorie)}
            </span>
            <span class="d-delay">~${esc(d.delaiEstime)}</span>
          </div>
        </div>
        <span class="d-chevron${isOpen ? ' d-chevron-open' : ''}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
               stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </span>
      </div>

      <!-- Barre de progression -->
      <div class="d-progress">
        <div class="d-progress-track">
          <div class="d-progress-fill"
               style="width:${pourcentage}%;background:${barColor}"></div>
        </div>
        <div class="d-progress-label">${scoreHtml}</div>
      </div>

      <!-- Corps expandable -->
      <div class="d-body${isOpen ? '' : ' d-hidden'}">
        <div class="d-doc-list">${docsHtml}</div>
        <a href="index.html?q=${question}" class="d-ask-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          Demander à l'assistant
        </a>
      </div>
    </div>`;
}

/* ── Rendu de la grille ── */
function renderGrid() {
  const filtered = searchDemarches(currentQuery, allDemarches);

  /* Tri par progression décroissante */
  const sorted = [...filtered].sort((a, b) =>
    getProgression(b, userDocs).pourcentage - getProgression(a, userDocs).pourcentage
  );

  emptySearch.classList.add('hidden');

  if (sorted.length === 0) {
    deGrid.innerHTML = '';
    emptySearch.classList.remove('hidden');
    emptyQuery.textContent = currentQuery ? `pour « ${esc(currentQuery)} »` : '';
    return;
  }

  deGrid.innerHTML = sorted.map(renderCard).join('');

  /* Gestion expand/collapse sur chaque carte */
  deGrid.querySelectorAll('.demarche-card').forEach(card => {
    const id     = card.dataset.id;
    const header = card.querySelector('.d-header');
    const body   = card.querySelector('.d-body');
    const chev   = card.querySelector('.d-chevron');

    header.addEventListener('click', () => {
      if (expandedIds.has(id)) {
        expandedIds.delete(id);
        card.classList.remove('d-open');
        body.classList.add('d-hidden');
        chev.classList.remove('d-chevron-open');
      } else {
        expandedIds.add(id);
        card.classList.add('d-open');
        body.classList.remove('d-hidden');
        chev.classList.add('d-chevron-open');
      }
    });

    /* Les liens dans le corps ne propagent pas le clic vers le header */
    body.querySelectorAll('a').forEach(a => a.addEventListener('click', e => e.stopPropagation()));
  });
}

/* ── Recherche ── */
searchInput.addEventListener('input', () => {
  currentQuery = searchInput.value.trim();
  searchClear.classList.toggle('hidden', !currentQuery);
  renderGrid();
});

searchClear.addEventListener('click', () => {
  searchInput.value = '';
  currentQuery = '';
  searchClear.classList.add('hidden');
  searchInput.focus();
  renderGrid();
});

/* ── Initialisation ── */
async function init() {
  try {
    await initDB();
    userDocs = await getAllDocuments();
  } catch {
    /* IndexedDB non disponible — on continue sans docs locaux */
  }
  renderGrid();

  /* Abonnement Firestore après authentification */
  initAuth().then(user => {
    if (!user) return;
    subscribeDocuments(user.uid, docs => {
      userDocs = docs;
      renderGrid();
    });
  });
}

init();
