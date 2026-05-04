'use strict';

/* ═══════════════════════════════════════════════════════════════════
   modules/documents.js — Gestion des documents avec IndexedDB
   Stockage local persistant, catégorisation, CRUD complet
   ═══════════════════════════════════════════════════════════════════ */

const DB_NAME    = 'admin-app';
const DB_VERSION = 1;
const STORE_NAME = 'documents';

let db = null;

/* ── Catégories par défaut (non supprimables) ── */
export const CATEGORIES = [
  'Identité', 'Logement', 'Revenus', 'Impôts',
  'Assurance', 'Téléphone', 'Énergie', 'Autres',
  'Ordonnances', 'Prises de sang', 'Santé',
];

/* Couleur d'accent par catégorie par défaut */
export const CAT_COLORS = {
  'Identité':       '#6c6aff',
  'Logement':       '#3ecf8e',
  'Revenus':        '#f0a500',
  'Impôts':         '#ff4d6a',
  'Assurance':      '#0ea5e9',
  'Téléphone':      '#a855f7',
  'Énergie':        '#f97316',
  'Autres':         '#5a5a6a',
  'Ordonnances':    '#ec4899',
  'Prises de sang': '#ef4444',
  'Santé':          '#14b8a6',
};

/* Palette de couleurs pour les dossiers personnalisés (rotation cyclique) */
const CUSTOM_PALETTE = [
  '#ec4899', '#14b8a6', '#84cc16', '#eab308',
  '#06b6d4', '#f43f5e', '#a78bfa', '#10b981',
];

const LS_FOLDERS_KEY = 'admin-app:custom-folders';

/* ── Dossiers personnalisés (localStorage) ───────────────────────── */

/* Retourne la liste des dossiers custom : [{ name, color }, ...] */
export function getCustomFolders() {
  try {
    return JSON.parse(localStorage.getItem(LS_FOLDERS_KEY) || '[]');
  } catch { return []; }
}

/* Crée un nouveau dossier custom. Lance une Error si le nom existe déjà. */
export function saveCustomFolder(name) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Le nom ne peut pas être vide');

  const folders = getCustomFolders();

  /* Vérification de doublon (insensible à la casse, catégories par défaut incluses) */
  const allNames = [...CATEGORIES, ...folders.map(f => f.name)];
  if (allNames.some(n => n.toLowerCase() === trimmed.toLowerCase())) {
    throw new Error('Ce nom est déjà utilisé');
  }

  const color  = CUSTOM_PALETTE[folders.length % CUSTOM_PALETTE.length];
  const folder = { name: trimmed, color };
  folders.push(folder);
  localStorage.setItem(LS_FOLDERS_KEY, JSON.stringify(folders));
  return folder;
}

/* Supprime un dossier custom par son nom */
export function deleteCustomFolder(name) {
  const updated = getCustomFolders().filter(f => f.name !== name);
  localStorage.setItem(LS_FOLDERS_KEY, JSON.stringify(updated));
  return updated;
}

/* Retourne toutes les catégories disponibles (par défaut + custom) */
export function getAllCategories() {
  return [...CATEGORIES, ...getCustomFolders().map(f => f.name)];
}

/* Retourne la couleur d'une catégorie (défaut ou custom) */
export function getCategoryColor(name) {
  if (CAT_COLORS[name]) return CAT_COLORS[name];
  const custom = getCustomFolders().find(f => f.name === name);
  return custom?.color ?? '#5a5a6a';
}

/* Réassigne tous les documents d'une catégorie vers une autre */
export function reassignCategory(fromCat, toCat) {
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('category');
    const req   = index.openCursor(IDBKeyRange.only(fromCat));
    req.onsuccess = e => {
      const cursor = e.target.result;
      if (!cursor) { resolve(); return; }
      const doc = cursor.value;
      doc.category = toCat;
      cursor.update(doc);
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

/* ── Initialisation de la base de données ────────────────────────── */
export function initDB() {
  return new Promise((resolve, reject) => {
    if (db) { resolve(db); return; }

    const req = indexedDB.open(DB_NAME, DB_VERSION);

    /* Création du schéma (première ouverture ou mise à jour de version) */
    req.onupgradeneeded = e => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, {
          keyPath: 'id', autoIncrement: true
        });
        store.createIndex('category', 'category', { unique: false });
        store.createIndex('date',     'date',     { unique: false });
      }
    };

    req.onsuccess = e => { db = e.target.result; resolve(db); };
    req.onerror   = e => reject(e.target.error);
  });
}

/* ── Ajoute un document ──────────────────────────────────────────── */
/* Lit le fichier comme ArrayBuffer et le persiste dans IndexedDB    */
/* docDate : date extraite par l'IA (chaîne DD/MM/YYYY), null sinon */
export function addDocument(file, category = 'Autres', customName = null, docDate = null, sous_categorie = null) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async e => {
      try {
        const doc = {
          name:          customName || file.name,
          size:          file.size,
          mimeType:      file.type,
          category,
          date:          Date.now(),
          docDate,       // date du document extraite par l'IA (DD/MM/YYYY)
          sous_categorie,
          data:          e.target.result, // ArrayBuffer — binaire complet
        };
        const id = await _writeDoc(doc);
        /* On retourne les métadonnées sans le binaire pour économiser la RAM */
        resolve({ id, name: doc.name, size: doc.size, mimeType: doc.mimeType,
                  category: doc.category, date: doc.date, docDate: doc.docDate,
                  sous_categorie: doc.sous_categorie });
      } catch (err) { reject(err); }
    };

    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

function _writeDoc(doc) {
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req   = store.add(doc);
    req.onsuccess = () => resolve(req.result); // retourne l'id auto-incrémenté
    req.onerror   = () => reject(req.error);
  });
}

/* ── Récupère tous les documents (métadonnées seulement) ─────────── */
export function getAllDocuments() {
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req   = store.getAll();
    req.onsuccess = () => {
      /* Exclure le binaire pour ne pas saturer la mémoire */
      const docs = req.result.map(({ data, ...meta }) => meta);
      /* Tri par date décroissante (les plus récents en premier) */
      docs.sort((a, b) => b.date - a.date);
      resolve(docs);
    };
    req.onerror = () => reject(req.error);
  });
}

/* ── Supprime un document par son id ─────────────────────────────── */
export function deleteDocument(id) {
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req   = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

/* ── Met à jour la catégorie d'un document ───────────────────────── */
export function updateCategory(id, category) {
  return new Promise((resolve, reject) => {
    const tx      = db.transaction(STORE_NAME, 'readwrite');
    const store   = tx.objectStore(STORE_NAME);
    const getReq  = store.get(id);
    getReq.onsuccess = () => {
      const doc = getReq.result;
      if (!doc) { reject(new Error('Document introuvable')); return; }
      doc.category = category;
      const putReq  = store.put(doc);
      putReq.onsuccess = () => resolve();
      putReq.onerror   = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

/* ── Met à jour le nom, la catégorie et la date d'un document ────── */
export function updateDocument(id, { name, category, docDate, sous_categorie }) {
  return new Promise((resolve, reject) => {
    const tx     = db.transaction(STORE_NAME, 'readwrite');
    const store  = tx.objectStore(STORE_NAME);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const doc = getReq.result;
      if (!doc) { reject(new Error('Document introuvable')); return; }
      if (name           !== undefined) doc.name           = name;
      if (category       !== undefined) doc.category       = category;
      if (docDate        !== undefined) doc.docDate        = docDate;
      if (sous_categorie !== undefined) doc.sous_categorie = sous_categorie;
      const putReq = store.put(doc);
      putReq.onsuccess = () => resolve();
      putReq.onerror   = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

/* ── Récupère le binaire d'un document pour l'ouvrir ────────────── */
export function getDocumentData(id) {
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req   = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

/* ── Détection automatique de catégorie à partir du nom ─────────── */
export function guessCategory(filename) {
  const n = filename.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/cni|passeport|identit|naissance|mariage|permis/.test(n))           return 'Identité';
  if (/loyer|quittance|bail|locati|habitation|proprio|hypotheque/.test(n)) return 'Logement';
  if (/salaire|bulletin|paie|revenus?|retraite|pension|virement/.test(n)) return 'Revenus';
  if (/impot|imposition|taxe|fisc|avis.?de.?situation|declaration/.test(n)) return 'Impôts';
  if (/assurance|mutuelle|garantie|sinistre|couverture/.test(n))           return 'Assurance';
  if (/sfr|orange|bouygues|free|tel|mobile|forfait|telecom|numero/.test(n)) return 'Téléphone';
  if (/edf|gaz|engie|electri|energie|eau|chauffage|kilowatt/.test(n))     return 'Énergie';
  if (/ordonnance|prescription|medicament|posologie|qsp|comprime/.test(n)) return 'Ordonnances';
  if (/prise.?de.?sang|analyse|bilan|labo|prelevement|hemato|glycem/.test(n)) return 'Prises de sang';
  if (/sante|medical|medecin|hopital|clinique|radiol|echograph|vaccin/.test(n)) return 'Santé';
  return 'Autres';
}

/* ── Utilitaires de formatage ────────────────────────────────────── */
export function formatSize(bytes) {
  if (bytes < 1024)         return bytes + ' o';
  if (bytes < 1024 * 1024)  return (bytes / 1024).toFixed(1) + ' Ko';
  return (bytes / (1024 * 1024)).toFixed(1) + ' Mo';
}

export function formatDate(ts) {
  return new Date(ts).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
}

export function fileExt(name) {
  return (name.split('.').pop() || '?').toUpperCase().slice(0, 4);
}

export function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
