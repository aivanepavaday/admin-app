/**
 * modules/medical.js — Analyse IA des documents médicaux + gestion des rappels
 *
 * Fonctionnalités :
 * - Analyse d'ordonnances : extraction date + QSP → rappel 7 j avant expiration
 * - Analyse de prises de sang : extraction délai → rappel
 * - CRUD rappels dans localStorage
 */

'use strict';

import { getApiKey } from './assistant.js';

const API_URL    = 'https://api.anthropic.com/v1/messages';
const MODEL      = 'claude-sonnet-4-20250514';
const LS_RAPPELS = 'admin-app:rappels';

/* ═══════════════════════════════════════════════════════════════════
   PROMPT SYSTÈME MÉDICAL
   ═══════════════════════════════════════════════════════════════════ */

const MEDICAL_SYSTEM = `Tu es un assistant spécialisé dans l'analyse de documents médicaux français.
Analyse le document fourni et retourne UNIQUEMENT un objet JSON valide, sans markdown, sans explication.
Structure exacte attendue :
{
  "type": "ordonnance" | "prise_de_sang" | "autre",
  "date_document": "YYYY-MM-DD" | null,
  "qsp_jours": <entier> | null,
  "delai_prelevement_mois": <entier> | null,
  "medicaments": ["nom1", "nom2"]
}

Règles :
- type "ordonnance" : prescription médicale avec médicaments
- type "prise_de_sang" : demande ou résultat d'analyse sanguine
- type "autre" : tout autre document médical
- date_document : date de rédaction/émission du document au format YYYY-MM-DD, null si absente
- qsp_jours : la durée totale de la prescription en jours (ex: QSP 30 jours = 30, QSP 3 mois = 90), null si absent
- delai_prelevement_mois : si le document indique "réaliser dans X mois" ou équivalent, extraire X, sinon null
- medicaments : noms des médicaments (sans dosage), tableau vide si aucun`;

/* ═══════════════════════════════════════════════════════════════════
   ANALYSE CLAUDE — IMAGE (vision)
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Lit un File image et retourne { media_type, base64 }
 */
function readImageAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => {
      const b64 = reader.result.split(',')[1];
      resolve({ media_type: file.type, base64: b64 });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Lit un File PDF, rend la première page sur un canvas et retourne { media_type, base64 }
 * Utilise pdf.js chargé globalement via CDN dans medical.html
 */
async function readPdfAsBase64(file) {
  /* Attendre que pdf.js soit disponible (chargement async depuis CDN) */
  if (!window.pdfjsLib) {
    await new Promise((resolve, reject) => {
      let attempts = 0;
      const check = setInterval(() => {
        if (window.pdfjsLib) { clearInterval(check); resolve(); }
        else if (++attempts > 30) { clearInterval(check); reject(new Error('pdf.js non disponible — vérifiez votre connexion')); }
      }, 200);
    });
  }
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);

  const viewport = page.getViewport({ scale: 2.0 });
  const canvas   = document.createElement('canvas');
  canvas.width   = viewport.width;
  canvas.height  = viewport.height;
  const ctx      = canvas.getContext('2d');

  await page.render({ canvasContext: ctx, viewport }).promise;

  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  return { media_type: 'image/jpeg', base64: dataUrl.split(',')[1] };
}

/**
 * Analyse un document médical avec Claude Vision.
 * @param {File} file
 * @returns {Promise<object>} résultat JSON parsé
 */
export async function analyzeDocument(file) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('Clé API manquante');

  /* Préparer l'image */
  let imageData;
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'pdf') {
    imageData = await readPdfAsBase64(file);
  } else if (['jpg','jpeg','png','webp','gif'].includes(ext)) {
    imageData = await readImageAsBase64(file);
  } else {
    throw new Error('Format non supporté pour l\'analyse médicale (PDF, JPG, PNG, WEBP uniquement)');
  }

  const body = {
    model: MODEL,
    max_tokens: 512,
    system: MEDICAL_SYSTEM,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: imageData.media_type,
            data: imageData.base64,
          },
        },
        {
          type: 'text',
          text: 'Analyse ce document médical et retourne le JSON demandé.',
        },
      ],
    }],
  };

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Erreur API ${res.status}`);
  }

  const data = await res.json();
  const raw  = data.content?.[0]?.text ?? '';
  return parseAnalysisResult(raw);
}

/* ═══════════════════════════════════════════════════════════════════
   PARSING DU RÉSULTAT
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Extrait et parse le JSON de la réponse Claude (gère les blocs ```json```)
 */
export function parseAnalysisResult(raw) {
  /* Retirer les blocs markdown si présents */
  const cleaned = raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  const jsonStart = cleaned.indexOf('{');
  const jsonEnd   = cleaned.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1) throw new Error('Aucun JSON trouvé dans la réponse');

  const parsed = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));

  /* Normaliser les champs */
  return {
    type:                    ['ordonnance','prise_de_sang','autre'].includes(parsed.type) ? parsed.type : 'autre',
    date_document:           parsed.date_document ?? null,
    qsp_jours:               typeof parsed.qsp_jours === 'number' ? parsed.qsp_jours : null,
    delai_prelevement_mois:  typeof parsed.delai_prelevement_mois === 'number' ? parsed.delai_prelevement_mois : null,
    medicaments:             Array.isArray(parsed.medicaments) ? parsed.medicaments : [],
  };
}

/* ═══════════════════════════════════════════════════════════════════
   CALCUL DU RAPPEL
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Calcule un rappel à partir du résultat d'analyse.
 * @param {object} analysis  résultat parsé
 * @param {string} fileName  nom du fichier source
 * @returns {{ rappelDate: string, expiryDate: string, label: string } | null}
 */
export function computeReminder(analysis, fileName) {
  const { type, date_document, qsp_jours, delai_prelevement_mois } = analysis;

  if (!date_document) return null;
  const base = new Date(date_document);
  if (isNaN(base.getTime())) return null;

  let expiryDate = null;

  if (type === 'ordonnance' && qsp_jours) {
    expiryDate = new Date(base);
    expiryDate.setDate(expiryDate.getDate() + qsp_jours);
  } else if (type === 'prise_de_sang' && delai_prelevement_mois) {
    expiryDate = new Date(base);
    expiryDate.setMonth(expiryDate.getMonth() + delai_prelevement_mois);
  } else {
    return null;
  }

  /* Rappel 7 jours avant l'expiration */
  const rappelDate = new Date(expiryDate);
  rappelDate.setDate(rappelDate.getDate() - 7);

  const label = type === 'ordonnance'
    ? `Ordonnance : ${analysis.medicaments.length ? analysis.medicaments.join(', ') : fileName}`
    : `Prise de sang à effectuer — ${fileName}`;

  return {
    rappelDate: rappelDate.toISOString().slice(0, 10),
    expiryDate: expiryDate.toISOString().slice(0, 10),
    label,
  };
}

/* ═══════════════════════════════════════════════════════════════════
   CRUD RAPPELS (localStorage)
   ═══════════════════════════════════════════════════════════════════ */

export function getRappels() {
  try {
    return JSON.parse(localStorage.getItem(LS_RAPPELS) || '[]');
  } catch { return []; }
}

function saveRappels(list) {
  localStorage.setItem(LS_RAPPELS, JSON.stringify(list));
}

/**
 * Ajoute un rappel et retourne l'objet avec son id.
 */
export function addRappel({ label, rappelDate, expiryDate, type, fileName, analysis }) {
  const rappel = {
    id:          Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    label,
    rappelDate,
    expiryDate,
    type,        /* ordonnance | prise_de_sang | autre */
    fileName,
    analysis,
    createdAt:   new Date().toISOString(),
    dismissed:   false,
  };
  const list = getRappels();
  list.push(rappel);
  saveRappels(list);
  return rappel;
}

export function dismissRappel(id) {
  const list = getRappels().map(r => r.id === id ? { ...r, dismissed: true } : r);
  saveRappels(list);
}

export function deleteRappel(id) {
  saveRappels(getRappels().filter(r => r.id !== id));
}

/**
 * Nombre de rappels actifs (non rejetés) dont la date de rappel est dans ≤ 7 jours.
 */
export function getUrgentCount() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const in7 = new Date(today);
  in7.setDate(in7.getDate() + 7);

  return getRappels().filter(r => {
    if (r.dismissed) return false;
    const d = new Date(r.rappelDate);
    return d <= in7;
  }).length;
}

/**
 * Nombre de jours restants jusqu'au rappelDate (négatif = dépassé).
 */
export function daysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  return Math.round((target - today) / 86400000);
}
