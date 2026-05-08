/**
 * modules/demarches.js — Données des démarches administratives (intégrées en dur)
 * Plus de fetch externe : les démarches sont définies directement ici.
 */

'use strict';

/* ── Priorités par type de document : ordre décroissant de préférence ── */
const PRIORITES_DOCUMENTS = {
  justificatif_domicile: ['Logement', 'Énergie', 'Téléphone'],
  identite:              ['Identité'],
  revenus:               ['Revenus'],
  impots:                ['Impôts'],
  rib:                   ['Revenus'],
  assurance:             ['Assurance', 'Santé'],
  logement:              ['Logement'],
};

/* ── Données ── */
const DEMARCHES_DATA = [
  {
    id: 'passeport',
    titre: 'Renouveler son passeport',
    icone: '🛂',
    categorie: 'Identité',
    delaiEstime: '3 à 6 semaines',
    documents: [
      { id: 'doc1', label: 'Ancien passeport ou CNI',          type: 'identite',             categories: ['Identité'] },
      { id: 'doc2', label: 'Justificatif de domicile -3 mois', type: 'justificatif_domicile', categories: ['Logement', 'Énergie', 'Téléphone'] },
      { id: 'doc3', label: "Photo d'identité récente",         type: 'identite',             categories: ['Identité'] },
      { id: 'doc4', label: 'Formulaire CERFA (à télécharger)', categories: [], externe: true,
        url: 'https://www.service-public.fr/particuliers/vosdroits/R11403' },
    ],
  },
  {
    id: 'cni',
    titre: "Renouveler sa carte d'identité",
    icone: '🪪',
    categorie: 'Identité',
    delaiEstime: '3 à 6 semaines',
    documents: [
      { id: 'doc1', label: 'Ancienne CNI ou passeport',        type: 'identite',             categories: ['Identité'] },
      { id: 'doc2', label: 'Justificatif de domicile -3 mois', type: 'justificatif_domicile', categories: ['Logement', 'Énergie', 'Téléphone'] },
      { id: 'doc3', label: "Photo d'identité récente",         type: 'identite',             categories: ['Identité'] },
    ],
  },
  {
    id: 'apl',
    titre: 'Demander les APL',
    icone: '🏠',
    categorie: 'Logement',
    delaiEstime: '1 à 2 mois',
    documents: [
      { id: 'doc1', label: "Avis d'imposition",                    type: 'impots',   categories: ['Impôts'] },
      { id: 'doc2', label: 'Contrat de location / Quittance',      type: 'logement', categories: ['Logement'] },
      { id: 'doc3', label: 'RIB',                                   type: 'rib',      categories: ['Revenus'] },
      { id: 'doc4', label: "Justificatif d'identité (CNI/Passeport)", type: 'identite', categories: ['Identité'] },
    ],
  },
  {
    id: 'declaration-impots',
    titre: "Déclaration d'impôts",
    icone: '📊',
    categorie: 'Impôts',
    delaiEstime: 'Avant mai chaque année',
    documents: [
      { id: 'doc1', label: "Avis d'imposition N-1",               type: 'impots',    categories: ['Impôts'] },
      { id: 'doc2', label: 'Bulletins de salaire',                 type: 'revenus',   categories: ['Revenus'] },
      { id: 'doc3', label: 'Justificatifs de charges déductibles', type: 'assurance', categories: ['Assurance', 'Santé'] },
    ],
  },
  {
    id: 'assurance-maladie',
    titre: 'Mise à jour carte Vitale',
    icone: '💊',
    categorie: 'Santé',
    delaiEstime: '2 à 4 semaines',
    documents: [
      { id: 'doc1', label: "Justificatif d'identité",  type: 'identite',             categories: ['Identité'] },
      { id: 'doc2', label: 'Justificatif de domicile', type: 'justificatif_domicile', categories: ['Logement', 'Énergie', 'Téléphone'] },
      { id: 'doc3', label: "Photo d'identité récente", type: 'identite',             categories: [] },
    ],
  },
  {
    id: 'caf',
    titre: 'Dossier CAF / Prestations sociales',
    icone: '👨‍👩‍👧',
    categorie: 'Revenus',
    delaiEstime: '1 à 3 mois',
    documents: [
      { id: 'doc1', label: "Avis d'imposition",        type: 'impots',               categories: ['Impôts'] },
      { id: 'doc2', label: 'Justificatif de domicile', type: 'justificatif_domicile', categories: ['Logement', 'Énergie'] },
      { id: 'doc3', label: 'RIB',                       type: 'rib',                  categories: ['Revenus'] },
      { id: 'doc4', label: "Justificatif d'identité",  type: 'identite',             categories: ['Identité'] },
    ],
  },
];

/* ── Couleurs par catégorie (même système que documents.js) ── */
const CAT_COLORS = {
  'Identité':  '#6c6aff',
  'Logement':  '#3ecf8e',
  'Revenus':   '#f0a500',
  'Impôts':    '#ff4d6a',
  'Assurance': '#0ea5e9',
  'Téléphone': '#a855f7',
  'Énergie':   '#f97316',
  'Autres':    '#5a5a6a',
  'Santé':     '#14b8a6',
};

/* ── API publique ── */

export function getDemarchesData() {
  return DEMARCHES_DATA;
}

export function getCatColor(cat) {
  return CAT_COLORS[cat] ?? '#5a5a6a';
}

export function getPriorityCategories(docRequis) {
  if (docRequis.type && PRIORITES_DOCUMENTS[docRequis.type]) {
    return PRIORITES_DOCUMENTS[docRequis.type];
  }
  return docRequis.categories ?? [];
}

/** Retourne la date la plus significative d'un document pour le tri. */
export function getDocDate(doc) {
  const raw = doc.documentDate ?? doc.uploadDate ?? doc.createdAt ?? doc.date ?? null;
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

/** Vérifie si un document requis est présent dans les docs de l'utilisateur. */
export function checkDocumentPresent(docRequis, userDocuments) {
  if (docRequis.externe) return false;
  const cats = getPriorityCategories(docRequis);
  if (!cats.length) return false;
  return userDocuments.some(doc => {
    const cat = doc.category || doc.categorie || '';
    return cats.includes(cat);
  });
}

/** Calcule la progression d'une démarche selon les docs de l'utilisateur. */
export function getProgression(demarche, userDocuments) {
  const total    = demarche.documents.length;
  const presents = demarche.documents.filter(d => checkDocumentPresent(d, userDocuments)).length;
  return {
    presents,
    total,
    pourcentage: total > 0 ? Math.round((presents / total) * 100) : 0,
  };
}

/** Filtre les démarches par mot-clé. */
export function searchDemarches(query, demarches) {
  const q = _norm(query);
  if (!q) return demarches;
  return demarches.filter(d => {
    const haystack = _norm([
      d.titre, d.categorie, d.delaiEstime,
      ...d.documents.map(doc => doc.label),
    ].join(' '));
    return q.split(' ').every(word => haystack.includes(word));
  });
}

/** Construit la question pré-remplie pour l'assistant IA. */
export function buildAssistantQuestion(demarche, progression) {
  const { presents, total } = progression;
  let q = `Je veux faire : ${demarche.titre}. `;
  if (presents === total) {
    q += `J'ai tous les documents requis (${total}/${total}). Peux-tu me guider étape par étape pour cette démarche ?`;
  } else if (presents === 0) {
    q += `Je n'ai encore aucun document dans ma bibliothèque. Quels documents dois-je rassembler et comment procéder ?`;
  } else {
    q += `J'ai ${presents} document${presents > 1 ? 's' : ''} sur ${total}. Peux-tu m'expliquer les étapes et comment obtenir les documents manquants ?`;
  }
  return q;
}

/* ── Utilitaire interne ── */
function _norm(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
