/**
 * modules/demarches.js — Gestion des démarches administratives
 * Chargement du JSON, recherche, comparaison avec la bibliothèque de documents
 */

'use strict';

/* ── Chargement du fichier JSON ──────────────────────────────────── */

let _cache = null;

/**
 * Charge et met en cache la liste des démarches depuis data/demarches.json.
 * @returns {Promise<Array>}
 */
export async function loadDemarches() {
  if (_cache) return _cache;
  const res = await fetch('./data/demarches.json');
  if (!res.ok) throw new Error(`Impossible de charger les démarches (${res.status})`);
  const json = await res.json();
  _cache = json.demarches;
  return _cache;
}

/**
 * Retourne une démarche par son id.
 * @param {string} id
 */
export async function getDemarche(id) {
  const all = await loadDemarches();
  return all.find(d => d.id === id) ?? null;
}

/* ── Recherche par mot-clé ───────────────────────────────────────── */

/**
 * Filtre les démarches selon une requête textuelle.
 * Cherche dans le label, fullLabel, description et les tags.
 * @param {string} query
 * @param {Array}  demarches — liste complète
 * @returns {Array}
 */
export function searchDemarches(query, demarches) {
  const q = normalise(query);
  if (!q) return demarches;
  return demarches.filter(d => {
    const haystack = normalise([
      d.label, d.fullLabel, d.description,
      d.category,
      ...(d.tags ?? []),
      ...d.documents.map(doc => doc.label),
    ].join(' '));
    return q.split(' ').every(word => haystack.includes(word));
  });
}

/* ── Comparaison des documents ───────────────────────────────────── */

/**
 * Compare les documents requis par une démarche avec la bibliothèque de l'utilisateur.
 *
 * @param {Array} requiredDocs — d.documents depuis le JSON
 * @param {Array} userDocs     — documents depuis getAllDocuments() (IndexedDB)
 * @returns {{ found: Array, missing: Array, total: number }}
 *   found   : [{ required: {label, keywords}, userDoc: {...} }]
 *   missing : [{ required: {label, keywords} }]
 *   total   : nombre de documents requis
 */
/* Catégories médicales : jamais des justificatifs administratifs */
const MEDICAL_CATEGORIES = ['Ordonnances', 'Prises de sang', 'Santé'];

export function matchDocuments(requiredDocs, userDocs, { excludeMedical = true } = {}) {
  /* Exclure les documents médicaux des démarches non-médicales */
  const filteredDocs = excludeMedical
    ? userDocs.filter(doc => !MEDICAL_CATEGORIES.includes(doc.category))
    : userDocs;

  /* Normaliser tous les textes des documents utilisateur une seule fois */
  const userNorm = filteredDocs.map(doc => ({
    doc,
    text: normalise(`${doc.name} ${doc.category}`),
  }));

  const found   = [];
  const missing = [];
  const usedIds = new Set(); /* éviter qu'un doc utilisateur soit compté deux fois */

  for (const req of requiredDocs) {
    const normKws = req.keywords.map(normalise);

    const match = userNorm.find(u =>
      !usedIds.has(u.doc.id) &&
      normKws.some(kw => u.text.includes(kw))
    );

    if (match) {
      usedIds.add(match.doc.id);
      found.push({ required: req, userDoc: match.doc });
    } else {
      missing.push({ required: req });
    }
  }

  return { found, missing, total: requiredDocs.length };
}

/**
 * Construit le message de synthèse des documents.
 * Ex : "Tu as 2 documents sur 5. Il te manque : RIB, Contrat de location."
 *
 * @param {{ found, missing, total }} result
 * @returns {string}
 */
export function buildSummary({ found, missing, total }) {
  const n = found.length;
  if (n === total) {
    return `Vous avez tous les documents requis (${total}/${total}). Votre dossier est complet.`;
  }
  if (n === 0) {
    return `Aucun document trouvé dans votre bibliothèque.\nIl vous manque : ${_join(missing)}.`;
  }
  return (
    `Vous avez ${n} document${n > 1 ? 's' : ''} sur ${total}. ` +
    `Il vous manque : ${_join(missing)}.`
  );
}

/**
 * Construit la question pré-remplie pour l'assistant IA.
 * @param {Object} demarche
 * @param {{ found, missing, total }} matchResult
 */
export function buildAssistantQuestion(demarche, matchResult) {
  const { found, missing, total } = matchResult;
  const n = found.length;

  let q = `Je veux faire une demande de ${demarche.fullLabel}. `;

  if (n === total) {
    q += `J'ai tous les documents requis (${total}/${total}). `;
    q += `Peux-tu me guider étape par étape pour cette démarche ?`;
  } else if (n === 0) {
    q += `Je n'ai encore aucun document dans ma bibliothèque. `;
    q += `Quels documents dois-je rassembler et comment procéder ?`;
  } else {
    const missingLabels = missing.map(m => m.required.label).join(', ');
    q += `J'ai ${n} document${n > 1 ? 's' : ''} sur ${total} dans ma bibliothèque. `;
    q += `Il me manque : ${missingLabels}. `;
    q += `Peux-tu m'expliquer comment obtenir ces documents et les étapes de la démarche ?`;
  }

  return q;
}

/* ── Utilitaires internes ────────────────────────────────────────── */

/** Normalise une chaîne : minuscules, sans accents, sans ponctuation. */
function normalise(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') /* supprimer les accents */
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function _join(items) {
  return items.map(m => m.required.label).join(', ');
}
