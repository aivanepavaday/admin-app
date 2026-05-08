/**
 * modules/demarches.js — Données des démarches administratives (intégrées en dur)
 * Plus de fetch externe : les démarches sont définies directement ici.
 */

'use strict';

/* ── Règles centralisées de validation des documents ── */
export const DOCUMENT_RULES = {
  justificatif_domicile: {
    label: 'Justificatif de domicile',
    ageMaxMois: 3,
    categoriesAcceptees: ['Logement', 'Énergie', 'Téléphone'],
    subcategoriesExclues: ['Ordonnance', 'Prise de sang', 'Fiche de paie', 'Bulletin de salaire'],
    messageEchec: 'Doit dater de moins de 3 mois',
  },
  rib: {
    label: 'RIB',
    ageMaxMois: null,
    categoriesAcceptees: ['Revenus'],
    subcategoriesRequises: ['RIB', 'Rib', 'rib'],
    messageEchec: 'RIB bancaire requis (pas une fiche de paie)',
  },
  avis_imposition: {
    label: "Avis d'imposition",
    ageMaxMois: 14,
    categoriesAcceptees: ['Impôts'],
    subcategoriesExclues: [],
    messageEchec: "Avis d'imposition trop ancien",
  },
  justificatif_identite: {
    label: "Justificatif d'identité",
    ageMaxMois: null,
    categoriesAcceptees: ['Identité'],
    subcategoriesExclues: [],
    messageEchec: null,
  },
  bulletin_salaire: {
    label: 'Bulletin de salaire',
    ageMaxMois: 3,
    categoriesAcceptees: ['Revenus'],
    subcategoriesRequises: ['Fiche de paie', 'Bulletin de salaire', 'Salaire', 'Paie'],
    messageEchec: 'Doit dater de moins de 3 mois',
  },
  contrat_location: {
    label: 'Contrat de location / Quittance',
    ageMaxMois: 3,
    categoriesAcceptees: ['Logement'],
    subcategoriesExclues: [],
    messageEchec: 'Quittance trop ancienne (plus de 3 mois)',
  },
  justificatif_charges: {
    label: 'Justificatifs de charges déductibles',
    ageMaxMois: 14,
    categoriesAcceptees: ['Assurance', 'Santé'],
    subcategoriesExclues: [],
    messageEchec: null,
  },
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
      { id: 'doc1', label: 'Ancien passeport ou CNI',          type: 'justificatif_identite' },
      { id: 'doc2', label: 'Justificatif de domicile -3 mois', type: 'justificatif_domicile' },
      { id: 'doc3', label: "Photo d'identité récente",         type: 'justificatif_identite' },
      { id: 'doc4', label: 'Formulaire CERFA (à télécharger)', externe: true,
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
      { id: 'doc1', label: 'Ancienne CNI ou passeport',        type: 'justificatif_identite' },
      { id: 'doc2', label: 'Justificatif de domicile -3 mois', type: 'justificatif_domicile' },
      { id: 'doc3', label: "Photo d'identité récente",         type: 'justificatif_identite' },
    ],
  },
  {
    id: 'apl',
    titre: 'Demander les APL',
    icone: '🏠',
    categorie: 'Logement',
    delaiEstime: '1 à 2 mois',
    documents: [
      { id: 'doc1', label: "Avis d'imposition",                    type: 'avis_imposition' },
      { id: 'doc2', label: 'Contrat de location / Quittance',      type: 'contrat_location' },
      { id: 'doc3', label: 'RIB',                                   type: 'rib' },
      { id: 'doc4', label: "Justificatif d'identité (CNI/Passeport)", type: 'justificatif_identite' },
    ],
  },
  {
    id: 'declaration-impots',
    titre: "Déclaration d'impôts",
    icone: '📊',
    categorie: 'Impôts',
    delaiEstime: 'Avant mai chaque année',
    documents: [
      { id: 'doc1', label: "Avis d'imposition N-1",               type: 'avis_imposition' },
      { id: 'doc2', label: 'Bulletins de salaire',                 type: 'bulletin_salaire' },
      { id: 'doc3', label: 'Justificatifs de charges déductibles', type: 'justificatif_charges' },
    ],
  },
  {
    id: 'assurance-maladie',
    titre: 'Mise à jour carte Vitale',
    icone: '💊',
    categorie: 'Santé',
    delaiEstime: '2 à 4 semaines',
    documents: [
      { id: 'doc1', label: "Justificatif d'identité",  type: 'justificatif_identite' },
      { id: 'doc2', label: 'Justificatif de domicile', type: 'justificatif_domicile' },
      { id: 'doc3', label: "Photo d'identité récente", type: 'justificatif_identite' },
    ],
  },
  {
    id: 'caf',
    titre: 'Dossier CAF / Prestations sociales',
    icone: '👨‍👩‍👧',
    categorie: 'Revenus',
    delaiEstime: '1 à 3 mois',
    documents: [
      { id: 'doc1', label: "Avis d'imposition",        type: 'avis_imposition' },
      { id: 'doc2', label: 'Justificatif de domicile', type: 'justificatif_domicile' },
      { id: 'doc3', label: 'RIB',                       type: 'rib' },
      { id: 'doc4', label: "Justificatif d'identité",  type: 'justificatif_identite' },
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

/**
 * Retourne la date la plus significative d'un document.
 * Priorité : docDate (date réelle du doc, "DD/MM/YYYY") > date_import (Firestore Timestamp) > date (IndexedDB number)
 */
export function getDocDate(doc) {
  /* 1. docDate : date extraite par l'IA — "DD/MM/YYYY" */
  if (doc.docDate) {
    const parts = String(doc.docDate).split('/');
    if (parts.length === 3) {
      const [d, m, y] = parts.map(Number);
      const dt = new Date(y, m - 1, d);
      if (!isNaN(dt.getTime())) return dt;
    }
  }
  /* 2. date_import : Firestore Timestamp (objet avec .toMillis() ou .seconds) */
  if (doc.date_import) {
    const ts = doc.date_import;
    if (typeof ts.toMillis === 'function') return new Date(ts.toMillis());
    if (typeof ts.seconds === 'number')    return new Date(ts.seconds * 1000);
  }
  /* 3. date : timestamp IndexedDB (number) */
  if (typeof doc.date === 'number') return new Date(doc.date);
  return null;
}

/**
 * Valide un document requis contre les documents de l'utilisateur via une règle centralisée.
 * Retourne { status: 'valid'|'warning'|'missing', doc, message }
 *   valid   → document trouvé et conforme
 *   warning → document trouvé dans la bonne catégorie mais ne passe pas les filtres
 *   missing → aucun document dans les catégories acceptées
 */
export function validerDocument(regle, userDocuments) {
  const ageMois = date => {
    if (!date) return 999;
    const now = new Date();
    return (now.getFullYear() - date.getFullYear()) * 12
           + (now.getMonth() - date.getMonth());
  };

  const trierParDate = arr => [...arr].sort((a, b) => {
    const da = getDocDate(a) || new Date(0);
    const db = getDocDate(b) || new Date(0);
    return db - da;
  });

  /* 1. Filtrer par catégorie acceptée */
  const byCat = userDocuments.filter(doc =>
    regle.categoriesAcceptees.includes(doc.category || doc.categorie || '')
  );

  if (byCat.length === 0) {
    console.log(`[Démarches] Règle "${regle.label}": manquant`);
    return { status: 'missing', doc: null, message: null };
  }

  /* 2. Appliquer tous les filtres supplémentaires */
  let candidats = [...byCat];

  if (regle.subcategoriesExclues?.length > 0) {
    candidats = candidats.filter(doc => {
      const sub = (doc.sous_categorie || '').toLowerCase();
      return !regle.subcategoriesExclues.some(exclu =>
        sub.includes(exclu.toLowerCase())
      );
    });
  }

  if (regle.subcategoriesRequises?.length > 0) {
    candidats = candidats.filter(doc => {
      const sub = (doc.sous_categorie || '').toLowerCase();
      const nom = (doc.name || '').toLowerCase();
      return regle.subcategoriesRequises.some(requis =>
        sub.includes(requis.toLowerCase()) || nom.includes(requis.toLowerCase())
      );
    });
  }

  if (regle.ageMaxMois !== null) {
    candidats = candidats.filter(doc =>
      ageMois(getDocDate(doc)) <= regle.ageMaxMois
    );
  }

  if (candidats.length > 0) {
    const meilleur = trierParDate(candidats)[0];
    console.log(`[Démarches] Règle "${regle.label}": valide —`, meilleur.name);
    return { status: 'valid', doc: meilleur, message: null };
  }

  /* Des docs existent dans la bonne catégorie mais ne passent pas les règles */
  const plusRecent = trierParDate(byCat)[0];
  console.log(`[Démarches] Règle "${regle.label}": avertissement —`, plusRecent?.name, '—', regle.messageEchec);
  return { status: 'warning', doc: plusRecent, message: regle.messageEchec };
}

/** Vérifie si un document requis est valide (wrapper booléen pour getProgression). */
export function checkDocumentPresent(docRequis, userDocuments) {
  if (docRequis.externe) return false;
  const regle = DOCUMENT_RULES[docRequis.type];
  if (!regle) return false;
  return validerDocument(regle, userDocuments).status === 'valid';
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
