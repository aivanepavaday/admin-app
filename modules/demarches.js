/**
 * modules/demarches.js — Données et logique des démarches administratives
 *
 * Champs réels des documents (confirmés depuis le code Firestore/IndexedDB) :
 *   category       — catégorie principale
 *   sous_categorie — sous-catégorie (tag IA)
 *   name           — nom du fichier
 *   docDate        — date du document "DD/MM/YYYY" (extraite par l'IA)
 *   date_import    — Firestore Timestamp (toMillis / .seconds)
 *   date           — IndexedDB timestamp numérique
 *   download_url   — URL Firebase Storage (Firestore uniquement)
 */

'use strict';

/* ══════════════════════════════════════════════════════════════
   RÈGLES OFFICIELLES PAR TYPE DE DOCUMENT
   ══════════════════════════════════════════════════════════════ */

export const DOCUMENT_RULES = {

  piece_identite: {
    label: "Pièce d'identité",
    ageMaxMois: null,
    checkValidite: true,
    categoriesAcceptees: ['Identité'],
    subcategoriesExclues: [],
    note: "Doit être en cours de validité",
  },

  photo_identite: {
    label: "Photo d'identité",
    ageMaxMois: 6,
    categoriesAcceptees: ['Identité'],
    subcategoriesRequises: ['Photo'],
    note: "Doit dater de moins de 6 mois",
  },

  justificatif_domicile_1an: {
    label: "Justificatif de domicile",
    ageMaxMois: 12,
    categoriesAcceptees: ['Logement', 'Énergie', 'Téléphone'],
    subcategoriesExclues: ['Ordonnance', 'Prise de sang',
                           'Fiche de paie', 'Bulletin de salaire',
                           'Salaire', 'Paie'],
    note: "Facture (eau, gaz, élec, téléphone) ou quittance de loyer — moins d'1 an",
  },

  justificatif_domicile_6mois: {
    label: "Justificatif de domicile",
    ageMaxMois: 6,
    categoriesAcceptees: ['Logement', 'Énergie', 'Téléphone'],
    subcategoriesExclues: ['Ordonnance', 'Prise de sang',
                           'Fiche de paie', 'Bulletin de salaire',
                           'Salaire', 'Paie'],
    note: "Facture ou quittance — moins de 6 mois",
  },

  acte_naissance: {
    label: "Acte de naissance",
    ageMaxMois: 3,
    categoriesAcceptees: ['Identité'],
    subcategoriesRequises: ['Acte de naissance', 'Naissance'],
    note: "Si demandé — moins de 3 mois",
  },

  rib: {
    label: "RIB",
    ageMaxMois: null,
    categoriesAcceptees: ['Revenus'],
    subcategoriesRequises: ['RIB', 'Rib', 'rib'],
    note: "RIB bancaire uniquement (pas une fiche de paie)",
    messageEchec: "RIB bancaire requis — pas trouvé dans vos documents",
  },

  avis_imposition: {
    label: "Avis d'imposition",
    ageMaxMois: 14,
    categoriesAcceptees: ['Impôts'],
    subcategoriesExclues: [],
    note: "Dernier avis d'imposition (N-1 accepté)",
  },

  bail_quittance: {
    label: "Bail / Quittance de loyer",
    ageMaxMois: 3,
    categoriesAcceptees: ['Logement'],
    subcategoriesExclues: [],
    note: "Bail en cours OU quittance de moins de 3 mois",
  },

  bulletin_salaire: {
    label: "Bulletin de salaire",
    ageMaxMois: 3,
    categoriesAcceptees: ['Revenus'],
    subcategoriesRequises: ['Fiche de paie', 'Bulletin de salaire', 'Salaire', 'Paie'],
    note: "Moins de 3 mois",
  },

  ordonnance: {
    label: "Ordonnance médicale",
    ageMaxMois: null,
    categoriesAcceptees: ['Santé'],
    subcategoriesRequises: ['Ordonnance'],
    note: null,
  },
};

/* ══════════════════════════════════════════════════════════════
   DONNÉES DES DÉMARCHES
   ══════════════════════════════════════════════════════════════ */

const DEMARCHES_DATA = [
  {
    id: 'carte-identite',
    titre: "Renouveler sa carte d'identité",
    icone: '🪪',
    categorie: 'Identité',
    delaiEstime: '3 à 6 semaines',
    lienOfficiel: 'https://www.service-public.fr/particuliers/vosdroits/F21089',
    documents: [
      { id: 'd1', label: "Ancienne carte d'identité", rule: 'piece_identite',            optionnel: false },
      { id: 'd2', label: "Photo d'identité récente",  rule: 'photo_identite',            optionnel: false },
      { id: 'd3', label: "Justificatif de domicile",  rule: 'justificatif_domicile_1an', optionnel: false },
      { id: 'd4', label: "Acte de naissance",         rule: 'acte_naissance',            optionnel: true,
        note: "Si demandé par la mairie" },
    ],
  },
  {
    id: 'passeport',
    titre: "Renouveler son passeport",
    icone: '🛂',
    categorie: 'Identité',
    delaiEstime: '3 à 6 semaines',
    lienOfficiel: 'https://passeport.ants.gouv.fr',
    documents: [
      { id: 'd1', label: "Ancien passeport ou CNI",  rule: 'piece_identite',            optionnel: false },
      { id: 'd2', label: "Photo d'identité récente", rule: 'photo_identite',            optionnel: false },
      { id: 'd3', label: "Justificatif de domicile", rule: 'justificatif_domicile_1an', optionnel: false },
      { id: 'd4', label: "Acte de naissance",        rule: 'acte_naissance',            optionnel: true,
        note: "Si demandé" },
    ],
  },
  {
    id: 'apl',
    titre: "Demander les APL",
    icone: '🏠',
    categorie: 'Logement',
    delaiEstime: '1 à 2 mois',
    lienOfficiel: 'https://www.caf.fr',
    documents: [
      { id: 'd1', label: "Pièce d'identité",         rule: 'piece_identite',  optionnel: false },
      { id: 'd2', label: "Bail / Quittance de loyer", rule: 'bail_quittance',  optionnel: false,
        note: "Doit correspondre au logement actuel" },
      { id: 'd3', label: "RIB",                      rule: 'rib',             optionnel: false },
      { id: 'd4', label: "Avis d'imposition",        rule: 'avis_imposition', optionnel: false },
    ],
  },
  {
    id: 'carte-vitale',
    titre: "Mise à jour carte Vitale",
    icone: '💊',
    categorie: 'Santé',
    delaiEstime: '2 à 4 semaines',
    lienOfficiel: 'https://www.service-public.fr/particuliers/vosdroits/F265',
    documents: [
      { id: 'd1', label: "Pièce d'identité en cours de validité", rule: 'piece_identite', optionnel: false },
      { id: 'd2', label: "Photo d'identité récente",              rule: 'photo_identite', optionnel: true,
        note: "Conseillée selon formulaire" },
      { id: 'd3', label: "Justificatif de droits Ameli",         rule: null,             optionnel: true,
        labelManuel: "À télécharger sur ameli.fr",
        lien: 'https://assure.ameli.fr' },
    ],
  },
  {
    id: 'permis-conduire',
    titre: "Renouveler son permis de conduire",
    icone: '🚗',
    categorie: 'Identité',
    delaiEstime: '2 à 4 semaines',
    lienOfficiel: 'https://permisdeconduire.ants.gouv.fr',
    documents: [
      { id: 'd1', label: "Pièce d'identité en cours de validité", rule: 'piece_identite',             optionnel: false },
      { id: 'd2', label: "Justificatif de domicile",              rule: 'justificatif_domicile_6mois', optionnel: false,
        note: "Moins de 6 mois obligatoire" },
      { id: 'd3', label: "Photo-signature numérique ANTS",        rule: null,                          optionnel: false,
        labelManuel: "Via photographe ou cabine agréée ANTS",
        lien: 'https://ants.gouv.fr' },
      { id: 'd4', label: "Ancien permis de conduire",             rule: 'piece_identite',              optionnel: false },
    ],
  },
];

/* ── Couleurs par catégorie ── */
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

/* ══════════════════════════════════════════════════════════════
   UTILITAIRES DE DATE
   ══════════════════════════════════════════════════════════════ */

/* Date réelle du document (extraite par l'IA, champ docDate "DD/MM/YYYY") */
const getDocumentDate = (doc) => {
  if (!doc.docDate) return null;
  const parts = String(doc.docDate).split('/');
  if (parts.length !== 3) return null;
  const [d, m, y] = parts.map(Number);
  const dt = new Date(y, m - 1, d);
  return isNaN(dt.getTime()) ? null : dt;
};

/* Date d'import : Firestore Timestamp ou timestamp IndexedDB */
const getImportDate = (doc) => {
  if (doc.date_import) {
    const ts = doc.date_import;
    if (typeof ts.toMillis === 'function') return new Date(ts.toMillis());
    if (typeof ts.seconds === 'number')    return new Date(ts.seconds * 1000);
  }
  if (typeof doc.date === 'number') return new Date(doc.date);
  return null;
};

const ageMoisDepuis = (date) => {
  if (!date) return 999;
  const now = new Date();
  return (now.getFullYear() - date.getFullYear()) * 12
       + (now.getMonth() - date.getMonth());
};

const documentValide = (doc, regle) => {
  if (!regle.ageMaxMois) return { valide: true, raison: null };
  const date = getDocumentDate(doc) || getImportDate(doc);
  const age  = ageMoisDepuis(date);
  if (age > regle.ageMaxMois) {
    return {
      valide: false,
      raison: `Document trop ancien (doit dater de moins de ${regle.ageMaxMois} mois)`,
    };
  }
  return { valide: true, raison: null };
};

/* ══════════════════════════════════════════════════════════════
   MATCHING PRINCIPAL
   ══════════════════════════════════════════════════════════════ */

/**
 * Cherche le meilleur document utilisateur pour un requis de démarche.
 * Retourne { doc, valide, raison } ou null si aucun candidat trouvé.
 */
export function trouverDocumentValide(docRequis, userDocuments) {
  if (!docRequis.rule) return null;

  const regle = DOCUMENT_RULES[docRequis.rule];
  if (!regle) return null;

  /* 1. Filtrer par catégorie acceptée */
  let candidats = userDocuments.filter(doc =>
    regle.categoriesAcceptees.includes(doc.category || '')
  );

  /* 2. Exclure les sous-catégories interdites */
  if (regle.subcategoriesExclues?.length > 0) {
    candidats = candidats.filter(doc => {
      const sub = (doc.sous_categorie || '').toLowerCase();
      return !regle.subcategoriesExclues.some(e => sub.includes(e.toLowerCase()));
    });
  }

  /* 3. Exiger une sous-catégorie précise */
  if (regle.subcategoriesRequises?.length > 0) {
    candidats = candidats.filter(doc => {
      const sub = (doc.sous_categorie || '').toLowerCase();
      return regle.subcategoriesRequises.some(r => sub.includes(r.toLowerCase()));
    });
  }

  /* 4. Trier par date décroissante — le plus récent en premier */
  candidats.sort((a, b) => {
    const da = getDocumentDate(a) || getImportDate(a) || new Date(0);
    const db = getDocumentDate(b) || getImportDate(b) || new Date(0);
    return db - da;
  });

  console.log(`[Démarches] "${regle.label}": ${candidats.length} candidat(s),`,
    `meilleur: ${candidats[0]?.name || 'aucun'}`);

  if (!candidats[0]) return null;

  /* 5. Vérifier la règle d'âge sur le meilleur candidat */
  const check = documentValide(candidats[0], regle);
  return { doc: candidats[0], valide: check.valide, raison: check.raison };
}

/* ══════════════════════════════════════════════════════════════
   API PUBLIQUE
   ══════════════════════════════════════════════════════════════ */

export function getDemarchesData() { return DEMARCHES_DATA; }
export function getCatColor(cat)   { return CAT_COLORS[cat] ?? '#5a5a6a'; }

/**
 * Calcule la progression d'une démarche.
 * Seuls les documents obligatoires non-externes comptent (optionnel: false, rule: non-null).
 */
export function getProgression(demarche, userDocuments) {
  const obligatoires = demarche.documents.filter(d => d.rule !== null && !d.optionnel);
  const total    = obligatoires.length;
  const presents = obligatoires.filter(d =>
    trouverDocumentValide(d, userDocuments)?.valide === true
  ).length;
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
  if (presents === total && total > 0) {
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
