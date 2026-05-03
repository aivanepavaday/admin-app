/**
 * modules/auth.js — Authentification Google + gestion du profil nav
 * Crée l'overlay de connexion de façon dynamique sur chaque page.
 */

import { auth, googleProvider } from './firebase.js';
import {
  signInWithPopup,
  signOut as fbSignOut,
  onAuthStateChanged, setPersistence, browserLocalPersistence,
} from 'firebase/auth';

/* Utilisateur courant (null = non connecté) */
let _user = null;
export const getUser = () => _user;

/* Connexion Google — toujours par popup */
export async function signInWithGoogle() {
  await setPersistence(auth, browserLocalPersistence);
  return signInWithPopup(auth, googleProvider);
}

/* Déconnexion */
export function signOut() {
  return fbSignOut(auth);
}

/* ── Icône Google SVG ── */
const GOOGLE_SVG = `
  <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>`;

/* ── Injecte l'overlay de connexion dans le DOM ── */
function _injectOverlay() {
  if (document.getElementById('auth-overlay')) return;

  const el = document.createElement('div');
  el.id        = 'auth-overlay';
  el.className = 'auth-overlay hidden';
  el.innerHTML = `
    <div class="auth-card">
      <div class="auth-logo">⬡</div>
      <h1 class="auth-title">Assistant Admin</h1>
      <p class="auth-subtitle">
        Connectez-vous pour synchroniser vos documents entre tous vos appareils.
      </p>
      <button id="auth-google-btn" class="auth-google-btn">
        ${GOOGLE_SVG}
        Continuer avec Google
      </button>
      <p id="auth-err" class="auth-err hidden"></p>
      <p class="auth-note">
        Vos données sont privées et liées à votre compte Google.
      </p>
    </div>`;
  document.body.appendChild(el);

  document.getElementById('auth-google-btn').addEventListener('click', async () => {
    const btn = document.getElementById('auth-google-btn');
    const err = document.getElementById('auth-err');
    btn.disabled = true;
    btn.innerHTML = `<span class="auth-spinner"></span> Connexion…`;
    err.classList.add('hidden');
    try {
      await signInWithGoogle();
      /* onAuthStateChanged prend le relais et affiche l'app */
    } catch (e) {
      btn.disabled = false;
      btn.innerHTML = `${GOOGLE_SVG} Continuer avec Google`;
      if (e.code === 'auth/popup-blocked') {
        err.textContent = 'Veuillez autoriser les popups pour ce site dans votre navigateur';
      } else {
        err.textContent = 'Connexion échouée — ' + (e.code || e.message);
      }
      err.classList.remove('hidden');
    }
  });
}

/* ── Met à jour le profil utilisateur dans la nav ── */
function _updateNavProfile(user) {
  const el = document.getElementById('nav-user-profile');
  if (!el) return;
  if (!user) { el.innerHTML = ''; return; }
  const name   = user.displayName?.split(' ')[0] || user.email || 'Moi';
  const avatar = user.photoURL
    ? `<img class="nav-avatar" src="${user.photoURL}" alt="${name}" />`
    : `<span class="nav-avatar nav-avatar--initials">${name[0].toUpperCase()}</span>`;
  el.innerHTML = `${avatar}<span class="nav-user-name">${_esc(name)}</span>`;
}

function _esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ── Dot de synchronisation ── */
export function setSyncState(state) {
  const dot = document.querySelector('.sync-dot');
  if (!dot) return;
  dot.className = `sync-dot sync-${state}`;
  dot.title = { ok: 'Synchronisé', syncing: 'Synchronisation…',
                offline: 'Hors ligne', error: 'Erreur de sync' }[state] || '';
}

/* ── Helpers d'affichage ── */
function _showApp(user) {
  document.getElementById('auth-overlay')?.classList.add('hidden');
  _updateNavProfile(user);
  setSyncState(navigator.onLine ? 'ok' : 'offline');
}

function _showLogin() {
  document.getElementById('auth-overlay')?.classList.remove('hidden');
  _updateNavProfile(null);
}

/* ── Résolution de l'auth au chargement ── */
async function _resolveAuth() {
  await setPersistence(auth, browserLocalPersistence);

  return new Promise(resolve => {
    let resolved = false;

    function _resolveUser(user) {
      if (resolved) return;
      resolved = true;
      resolve(user);
    }

    /* Timeout 5s → afficher login si Firebase ne répond pas */
    const globalTimeout = setTimeout(() => {
      if (!resolved) _showLogin();
    }, 5000);

    onAuthStateChanged(auth, user => {
      _user = user;
      clearTimeout(globalTimeout);
      if (user) {
        _showApp(user);
        _resolveUser(user);
      } else {
        _showLogin();
      }
    });
  });
}

/* ── Point d'entrée principal ────────────────────────────────────────
   Retourne une Promise<FirebaseUser> qui se résout au premier login.
   L'overlay reste visible tant que l'utilisateur n'est pas connecté.
   ─────────────────────────────────────────────────────────────────── */
export function initAuth() {
  _injectOverlay();

  window.addEventListener('online',  () => setSyncState('ok'));
  window.addEventListener('offline', () => setSyncState('offline'));

  return _resolveAuth();
}
