/**
 * rappels.js — Contrôleur de la page des rappels médicaux
 */

import { getRappels, dismissRappel, deleteRappel, getUrgentCount, daysUntil } from './modules/medical.js';
import { initAuth } from './modules/auth.js';

'use strict';

/* ── Toast ── */
const toast = document.getElementById('toast');
let toastTimer;
function showToast(msg, duration = 2800) {
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), duration);
}

/* ── Badge ── */
function updateBadge() {
  const badge = document.getElementById('rappels-badge');
  const n = getUrgentCount();
  badge.textContent = n;
  n > 0 ? badge.classList.remove('hidden') : badge.classList.add('hidden');
}

/* ═══════════════════════════════════════════════════════════════════
   RENDU
   ═══════════════════════════════════════════════════════════════════ */

function classifyRappel(r) {
  if (r.dismissed) return 'done';
  const days = daysUntil(r.rappelDate);
  if (days < 0)  return 'overdue';
  if (days <= 7) return 'soon';
  return 'later';
}

function statusChipLabel(status, days) {
  if (status === 'done')    return 'Rejeté';
  if (status === 'overdue') return `En retard de ${Math.abs(days)} jour${Math.abs(days) > 1 ? 's' : ''}`;
  if (status === 'soon')    return days === 0 ? 'Aujourd\'hui' : `Dans ${days} jour${days > 1 ? 's' : ''}`;
  return `Dans ${days} jours`;
}

function renderAll() {
  const list   = document.getElementById('rappels-list');
  const rappels = getRappels();

  updateBadge();

  /* Bouton "tout rejeter" visible si des rappels actifs */
  const active = rappels.filter(r => !r.dismissed);
  const clearBtn = document.getElementById('clear-all-btn');
  active.length > 0 ? clearBtn.classList.remove('hidden') : clearBtn.classList.add('hidden');

  if (rappels.length === 0) {
    list.innerHTML = `
      <div class="rappels-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        <p>Aucun rappel</p>
        <span>Importez une ordonnance ou une prise de sang dans la page Santé</span>
      </div>`;
    return;
  }

  /* Regrouper */
  const groups = {
    overdue: { label: 'En retard',      items: [] },
    soon:    { label: 'Cette semaine',  items: [] },
    later:   { label: 'Plus tard',      items: [] },
    done:    { label: 'Rejetés',        items: [] },
  };

  rappels.forEach(r => {
    const status = classifyRappel(r);
    groups[status].items.push({ r, status });
  });

  const html = Object.entries(groups)
    .filter(([, g]) => g.items.length > 0)
    .map(([, g]) => `
      <div class="rappel-group">
        <div class="rappel-group-label">${g.label}</div>
        <div class="rappel-group-items">
          ${g.items.map(({ r, status }) => renderCard(r, status)).join('')}
        </div>
      </div>`)
    .join('');

  list.innerHTML = html;

  /* Événements dismiss / delete */
  list.querySelectorAll('.rappel-dismiss-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      dismissRappel(btn.dataset.id);
      renderAll();
      showToast('Rappel rejeté');
    });
  });

  list.querySelectorAll('.rappel-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      deleteRappel(btn.dataset.id);
      renderAll();
      showToast('Rappel supprimé');
    });
  });
}

function renderCard(r, status) {
  const days     = daysUntil(r.rappelDate);
  const chipLabel = statusChipLabel(status, days);

  const rappelFmt = new Date(r.rappelDate).toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' });
  const expiryFmt = new Date(r.expiryDate).toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' });

  const typeLabel = r.type === 'ordonnance' ? 'Ordonnance'
                  : r.type === 'prise_de_sang' ? 'Prise de sang'
                  : 'Document médical';

  return `
    <div class="rappel-card ${r.dismissed ? 'dismissed' : ''}">
      <div class="rappel-dot ${status}"></div>
      <div class="rappel-content">
        <div class="rappel-label" title="${escHtml(r.label)}">${escHtml(r.label)}</div>
        <div class="rappel-dates">
          Rappel le ${escHtml(rappelFmt)} · Expiration le ${escHtml(expiryFmt)}
        </div>
        <span class="rappel-chip ${status}">${escHtml(chipLabel)}</span>
      </div>
      <div class="rappel-actions">
        ${!r.dismissed ? `<button class="rappel-dismiss-btn" data-id="${escHtml(r.id)}">Rejeter</button>` : ''}
        <button class="rappel-delete-btn" data-id="${escHtml(r.id)}">Supprimer</button>
      </div>
    </div>`;
}

function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ── Tout rejeter ── */
document.getElementById('clear-all-btn').addEventListener('click', () => {
  getRappels().filter(r => !r.dismissed).forEach(r => dismissRappel(r.id));
  renderAll();
  showToast('Tous les rappels rejetés');
});

/* ── Init ── */
renderAll();
initAuth();
