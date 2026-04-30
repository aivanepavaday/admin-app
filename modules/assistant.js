/**
 * modules/assistant.js — Intégration Claude API (Anthropic)
 * Appels streaming, historique de conversation, clé API dans localStorage
 *
 * Note de sécurité : la clé API est stockée localement dans le navigateur.
 * Cette approche est acceptable pour un usage personnel et local.
 * Ne jamais déployer cette app publiquement avec une clé exposée côté client.
 */

'use strict';

const LS_KEY  = 'admin-app:anthropic-key';
const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL   = 'claude-sonnet-4-20250514';

/* Prompt système — définit le comportement de l'assistant */
const SYSTEM_PROMPT = `Tu es un assistant administratif français expert. Tu aides les utilisateurs à comprendre leurs démarches administratives, tu expliques le jargon en langage simple, tu listes les documents nécessaires pour chaque démarche, et tu vérifies quels documents l'utilisateur a déjà dans sa bibliothèque. Tu es concis, clair et bienveillant.

Règles de formatage :
- Utilise des listes à puces (- élément) pour les étapes et documents
- Mets en **gras** les points importants
- Réponds toujours en français
- Sois direct, évite les introductions inutiles`;

/* Historique de la conversation (maintenu en mémoire) */
let history = [];

/* ── Gestion de la clé API ────────────────────────────────────────── */

export function getApiKey() {
  return localStorage.getItem(LS_KEY) ?? '';
}

export function setApiKey(key) {
  localStorage.setItem(LS_KEY, key.trim());
}

export function clearApiKey() {
  localStorage.removeItem(LS_KEY);
}

export function hasApiKey() {
  return Boolean(getApiKey());
}

/* ── Historique ───────────────────────────────────────────────────── */

export function clearHistory() {
  history = [];
}

export function getHistory() {
  return [...history];
}

/* ── Construction du prompt système avec contexte documents ─────── */

function buildSystem(docsContext) {
  if (!docsContext) return SYSTEM_PROMPT;
  return SYSTEM_PROMPT + '\n\n' + docsContext;
}

/* ── Headers communs ── */

function makeHeaders(key) {
  return {
    'Content-Type': 'application/json',
    'x-api-key': key,
    'anthropic-version': '2023-06-01',
    /* Requis pour les appels directs depuis un navigateur */
    'anthropic-dangerous-direct-browser-access': 'true',
  };
}

/* ── Appel streaming (générateur async) ──────────────────────────── */
/**
 * Envoie un message et yield les morceaux de texte au fil du streaming.
 * @param {string} userMessage — question de l'utilisateur
 * @param {string} docsContext — contexte des documents (optionnel)
 * @yields {string} — fragment de texte reçu
 */
export async function* askStream(userMessage, docsContext = '') {
  const key = getApiKey();
  if (!key) throw Object.assign(new Error('Clé API non configurée'), { code: 'NO_KEY' });

  /* Ajouter le message utilisateur à l'historique */
  history.push({ role: 'user', content: userMessage });

  let response;
  try {
    response = await fetch(API_URL, {
      method: 'POST',
      headers: makeHeaders(key),
      body: JSON.stringify({
        model:      MODEL,
        max_tokens: 1024,
        system:     buildSystem(docsContext),
        messages:   history,
        stream:     true,
      }),
    });
  } catch (networkErr) {
    history.pop();
    throw Object.assign(new Error('Erreur réseau — vérifiez votre connexion'), { code: 'NETWORK' });
  }

  if (!response.ok) {
    history.pop();
    let errMsg = `Erreur ${response.status}`;
    try {
      const body = await response.json();
      errMsg = body.error?.message ?? errMsg;
      if (response.status === 401) errMsg = 'Clé API invalide ou expirée';
      if (response.status === 429) errMsg = 'Limite de requêtes atteinte — réessayez dans un moment';
    } catch { /* ignore parse error */ }
    throw Object.assign(new Error(errMsg), { code: `HTTP_${response.status}` });
  }

  /* Lecture du flux SSE */
  const reader  = response.body.getReader();
  const decoder = new TextDecoder();
  let   buffer  = '';
  let   fullText= '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      /* Traiter ligne par ligne */
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? ''; /* garder la ligne incomplète */

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (raw === '[DONE]') continue;
        try {
          const event = JSON.parse(raw);
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            fullText += event.delta.text;
            yield event.delta.text;
          }
        } catch { /* événement SSE malformé, on passe */ }
      }
    }
  } finally {
    reader.releaseLock();
  }

  /* Ajouter la réponse complète à l'historique */
  if (fullText) {
    history.push({ role: 'assistant', content: fullText });
  }
}

/* ── Test de la clé API ───────────────────────────────────────────── */
/**
 * Envoie un message minimal pour vérifier si la clé est valide.
 * @param {string} key — clé à tester
 * @returns {{ ok: boolean, error?: string, model?: string }}
 */
export async function testApiKey(key) {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: makeHeaders(key),
      body: JSON.stringify({
        model:      MODEL,
        max_tokens: 5,
        messages:   [{ role: 'user', content: 'Test' }],
      }),
    });

    if (response.ok) {
      const data = await response.json();
      return { ok: true, model: data.model ?? MODEL };
    }

    const body = await response.json().catch(() => ({}));
    let err = `Erreur ${response.status}`;
    if (response.status === 401) err = 'Clé invalide ou révoquée';
    if (response.status === 403) err = 'Accès refusé';
    if (response.status === 429) err = 'Quota dépassé';
    return { ok: false, error: body.error?.message ?? err };

  } catch (e) {
    return { ok: false, error: 'Erreur réseau — vérifiez votre connexion' };
  }
}

/* ═══════════════════════════════════════════════════════════════════
   PRÉFÉRENCE ANALYSE AUTOMATIQUE
   ═══════════════════════════════════════════════════════════════════ */

const LS_AUTO_ANALYSE = 'admin-app:auto-analyse';

/** Retourne true si l'analyse automatique est activée (défaut : true) */
export function isAutoAnalyseEnabled() {
  return localStorage.getItem(LS_AUTO_ANALYSE) !== 'false';
}

/** Active ou désactive l'analyse automatique */
export function setAutoAnalyse(enabled) {
  localStorage.setItem(LS_AUTO_ANALYSE, enabled ? 'true' : 'false');
}

/* ═══════════════════════════════════════════════════════════════════
   ANALYSE IA — DOCUMENTS ADMINISTRATIFS
   ═══════════════════════════════════════════════════════════════════ */

const ANALYSE_PROMPT = `Tu es un classificateur de documents administratifs français. Analyse ce document et réponds UNIQUEMENT en JSON valide, sans texte avant ou après.

CATÉGORIES STRICTES (utilise exactement ces valeurs, avec accents) :
"Santé" | "Logement" | "Revenus" | "Impôts" | "Assurance" | "Téléphone" | "Énergie" | "Autres"

DÉTECTION MÉDICALE — catégorie "Santé" si le document contient AU MOINS UN de ces éléments :
- Nom d'un médecin avec numéro RPPS
- Nom d'un médicament avec posologie
- Mention "ordonnance" ou "prescription"
- Mention "bilan", "prise de sang", "NFS", "prélèvement", "laboratoire"
- Mention "certificat médical" ou "arrêt de travail"
- En cas de doute entre "Santé" et "Autres" : choisir "Santé"

EXTRACTION MÉDICALE (si catégorie = "Santé") :
- sous_categorie = "Ordonnance" si c'est une prescription médicale avec médicaments
- sous_categorie = "Prise de sang" si c'est une demande ou résultat d'analyse sanguine
- qsp_jours : durée totale de prescription en jours (QSP 30 jours → 30, QSP 3 mois → 90), sinon null
- delai_prelevement_mois : délai indiqué pour réaliser le prélèvement, sinon null

AUTRES CATÉGORIES :
- "Logement" : quittance, loyer, bail, locataire, bailleur
- "Revenus" : bulletin de salaire, salaire brut, cotisations sociales, fiche de paie
- "Impôts" : Direction Générale des Finances Publiques, revenu fiscal, avis d'imposition
- "Assurance" : contrat d'assurance, mutuelle, garantie, prévoyance
- "Téléphone" : facture opérateur mobile (SFR, Free, Orange, Bouygues…)
- "Énergie" : facture EDF, Engie, gaz, électricité, eau

FORMAT DE RÉPONSE JSON OBLIGATOIRE :
{
  "categorie": "Santé|Logement|Revenus|Impôts|Assurance|Téléphone|Énergie|Autres",
  "sous_categorie": "Ordonnance|Prise de sang|Facture|Fiche de paie|Quittance|Contrat|Autre",
  "nom_suggere": "Type_Organisme_MMYYYY",
  "organisme": "nom de l'organisme ou médecin",
  "date": "DD/MM/YYYY ou null",
  "montant": "X.XX€ ou null",
  "qsp_jours": nombre entier ou null,
  "delai_prelevement_mois": nombre entier ou null,
  "confiance": "haute|moyenne|faible"
}`;

/**
 * Convertit un fichier image en base64.
 */
function readImageBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve({ media_type: file.type || 'image/jpeg', base64: reader.result.split(',')[1] });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Rend la première page d'un PDF en image base64 via pdf.js (doit être chargé sur la page).
 */
async function readPdfBase64(file) {
  if (!window.pdfjsLib) throw new Error('pdf.js non disponible — rechargez la page');
  const buf      = await file.arrayBuffer();
  const pdf      = await window.pdfjsLib.getDocument({ data: buf }).promise;
  const page     = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 1.5 });
  const canvas   = document.createElement('canvas');
  canvas.width   = viewport.width;
  canvas.height  = viewport.height;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  return { media_type: 'image/jpeg', base64: canvas.toDataURL('image/jpeg', 0.85).split(',')[1] };
}

/**
 * Analyse un document administratif avec Claude Vision.
 * Retourne les champs enrichis incluant les données médicales si détectées.
 * @param {File} file
 * @returns {Promise<{categorie, sous_categorie, nom_suggere, organisme, date, montant, qsp_jours, delai_prelevement_mois, confiance}>}
 */
export async function analyzeAdminDocument(file) {
  const key = getApiKey();
  if (!key) throw new Error('Clé API non configurée — rendez-vous dans Paramètres');

  console.log(`[Analyse] Démarrage analyse — fichier : "${file.name}" (${file.type}, ${file.size} octets)`);

  const ext = file.name.split('.').pop().toLowerCase();
  let imageData;

  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
    console.log('[Analyse] Lecture image en base64...');
    imageData = await readImageBase64(file);
  } else if (ext === 'pdf') {
    console.log('[Analyse] Rendu PDF → image via pdf.js...');
    imageData = await readPdfBase64(file);
  } else {
    throw new Error('Format non supporté pour l\'analyse (PDF, JPG, PNG, WEBP uniquement)');
  }

  console.log('[Analyse] Envoi à Claude API...');
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: makeHeaders(key),
    body: JSON.stringify({
      model:      MODEL,
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: imageData.media_type, data: imageData.base64 } },
          { type: 'text',  text: ANALYSE_PROMPT },
        ],
      }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err?.error?.message ?? `Erreur API ${res.status}`;
    console.error('[Analyse] Erreur API :', msg);
    throw new Error(msg);
  }

  const data = await res.json();
  const raw  = data.content?.[0]?.text ?? '';
  console.log('[Analyse] Réponse brute Claude :', raw);

  /* Extraire le JSON de la réponse (tolère les blocs ```json```) */
  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const start   = cleaned.indexOf('{');
  const end     = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('Réponse JSON invalide');

  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  console.log('[Analyse] JSON parsé :', parsed);

  const result = {
    categorie:               String(parsed.categorie               ?? 'Autres'),
    sous_categorie:          String(parsed.sous_categorie          ?? 'Autre'),
    nom_suggere:             String(parsed.nom_suggere             ?? file.name.replace(/\.[^.]+$/, '')),
    organisme:               String(parsed.organisme               ?? ''),
    date:                    parsed.date    ? String(parsed.date)    : null,
    montant:                 parsed.montant ? String(parsed.montant) : null,
    qsp_jours:               typeof parsed.qsp_jours === 'number'              ? parsed.qsp_jours              : null,
    delai_prelevement_mois:  typeof parsed.delai_prelevement_mois === 'number' ? parsed.delai_prelevement_mois : null,
    confiance:               ['haute','moyenne','faible'].includes(parsed.confiance) ? parsed.confiance : 'moyenne',
  };

  console.log('[Analyse] Résultat final :', result);
  return result;
}
