/**
 * parametres.js — Logique de la page de paramètres
 * Gestion de la clé API, test de connexion, affichage du statut
 */

import { getApiKey, setApiKey, clearApiKey, testApiKey, clearHistory, isAutoAnalyseEnabled, setAutoAnalyse } from './modules/assistant.js';
import { initAuth, signOut, getUser } from './modules/auth.js';

'use strict';

/* ── DOM ── */
const apiKeyInput      = document.getElementById('api-key-input');
const toggleVisibility = document.getElementById('toggle-visibility');
const eyeIcon          = document.getElementById('eye-icon');
const testBtn          = document.getElementById('test-btn');
const testLabel        = document.getElementById('test-label');
const testIcon         = document.getElementById('test-icon');
const saveBtn          = document.getElementById('save-btn');
const apiStatus        = document.getElementById('api-status');
const statusText       = document.getElementById('status-text');
const testResult       = document.getElementById('test-result');
const clearHistoryBtn  = document.getElementById('clear-history-btn');
const toast            = document.getElementById('toast');

/* ── Toast ── */
let toastTimer;
function showToast(msg, duration = 3000) {
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), duration);
}

/* ── Statut de la clé ── */
function setStatus(type, text) {
  apiStatus.className = `api-status status-${type}`;
  statusText.textContent = text;
}

/* ── Icône œil (montrer/masquer) ── */
const EYE_OPEN = `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`;
const EYE_CLOSED = `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>`;

let keyVisible = false;
toggleVisibility.addEventListener('click', () => {
  keyVisible = !keyVisible;
  apiKeyInput.type = keyVisible ? 'text' : 'password';
  eyeIcon.innerHTML = keyVisible ? EYE_CLOSED : EYE_OPEN;
});

/* ── Chargement initial ── */
function init() {
  const saved = getApiKey();
  if (saved) {
    apiKeyInput.value = saved;
    setStatus('ok', 'Clé enregistrée');
  } else {
    setStatus('unknown', 'Non configurée');
  }
  hideTestResult();
}

/* ── Tester la connexion ── */
testBtn.addEventListener('click', async () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    showTestResult('error', 'Entrez une clé API avant de tester');
    return;
  }

  setStatus('checking', 'Vérification…');
  testBtn.disabled = true;
  testBtn.classList.add('spinning');
  testLabel.textContent = 'Vérification…';
  testIcon.innerHTML = `<path d="M21 12a9 9 0 1 1-6.219-8.56"/>`; /* spinner arc */
  hideTestResult();

  const result = await testApiKey(key);

  testBtn.disabled = false;
  testBtn.classList.remove('spinning');
  testLabel.textContent = 'Tester la connexion';
  testIcon.innerHTML = `<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>`;

  if (result.ok) {
    setStatus('ok', 'Connexion réussie');
    showTestResult('ok', `Connexion réussie — modèle : ${result.model ?? 'claude-sonnet-4'}`);
  } else {
    setStatus('error', 'Clé invalide');
    showTestResult('error', result.error ?? 'Connexion échouée');
  }
});

/* ── Enregistrer ── */
saveBtn.addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    clearApiKey();
    setStatus('unknown', 'Non configurée');
    showToast('Clé API supprimée');
    return;
  }
  setApiKey(key);
  setStatus('ok', 'Clé enregistrée');
  showToast('Clé API enregistrée');
});

/* Sauvegarde auto à chaque frappe (dès qu'on quitte le champ) */
apiKeyInput.addEventListener('blur', () => {
  const key = apiKeyInput.value.trim();
  if (key) {
    setApiKey(key);
    setStatus('ok', 'Clé enregistrée');
  }
});

/* ── Effacer l'historique ── */
clearHistoryBtn.addEventListener('click', () => {
  clearHistory();
  showToast('Historique de conversation effacé');
});

/* ── Helpers ── */
function showTestResult(type, msg) {
  testResult.textContent = msg;
  testResult.className   = `test-result ${type}`;
  testResult.classList.remove('hidden');
}

function hideTestResult() {
  testResult.classList.add('hidden');
}

/* ── Toggle analyse automatique ── */
const autoAnalyseToggle = document.getElementById('auto-analyse-toggle');
if (autoAnalyseToggle) {
  autoAnalyseToggle.checked = isAutoAnalyseEnabled();
  autoAnalyseToggle.addEventListener('change', () => {
    setAutoAnalyse(autoAnalyseToggle.checked);
    showToast(autoAnalyseToggle.checked ? 'Analyse automatique activée' : 'Analyse automatique désactivée');
  });
}

init();

/* ── Firebase Auth ── */
const signoutBtn = document.getElementById('signout-btn');

function _esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function renderFirebaseUser(user) {
  const card      = document.getElementById('firebase-user-card');
  const nameEl    = document.getElementById('firebase-user-name');
  const emailEl   = document.getElementById('firebase-user-email');
  const avatarWrap = document.getElementById('firebase-user-avatar-wrap');

  if (!user) {
    card.classList.add('hidden');
    return;
  }

  const name   = user.displayName || user.email || 'Utilisateur';
  const avatar = user.photoURL
    ? `<img class="firebase-user-avatar" src="${_esc(user.photoURL)}" alt="${_esc(name)}" />`
    : `<span class="firebase-user-avatar firebase-user-avatar--initials">${_esc(name[0].toUpperCase())}</span>`;

  avatarWrap.innerHTML = avatar;
  nameEl.textContent   = name;
  emailEl.textContent  = user.email || '';
  card.classList.remove('hidden');
}

initAuth().then(user => {
  renderFirebaseUser(user);
});

signoutBtn?.addEventListener('click', async () => {
  await signOut();
  window.location.href = 'index.html';
});
