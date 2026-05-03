/**
 * modules/firestore-sync.js — Synchronisation Firestore + Firebase Storage
 *
 * Architecture :
 *  - Firestore → source de vérité pour les métadonnées (documents, rappels, règles)
 *  - Firebase Storage → binaires des fichiers (PDF/images)
 *  - IndexedDB → cache local pour la lecture offline des binaires
 *  - onSnapshot → re-rendu automatique à chaque changement
 */

import { db, storage }               from './firebase.js';
import {
  collection, doc, addDoc, setDoc, deleteDoc, updateDoc,
  onSnapshot, serverTimestamp, query, orderBy, getDoc,
} from 'firebase/firestore';
import {
  ref as storageRef, uploadBytes, getDownloadURL, deleteObject,
} from 'firebase/storage';
import {
  initDB, getAllDocuments, getDocumentData, deleteDocument as deleteLocalDoc,
  addDocument as addLocalDoc,
} from './documents.js';
import { getRappels }  from './medical.js';
import { getRules, getSettings } from './gmail.js';
import { setSyncState } from './auth.js';

/* ═══════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════ */

function docsRef(uid)    { return collection(db, 'users', uid, 'documents'); }
function rappelsRef(uid) { return collection(db, 'users', uid, 'rappels'); }
function rulesRef(uid)   { return collection(db, 'users', uid, 'regles_gmail'); }
function docRef(uid, id) { return doc(db, 'users', uid, 'documents', id); }
function rapRef(uid, id) { return doc(db, 'users', uid, 'rappels', id); }
function ruleDocRef(uid, id){ return doc(db, 'users', uid, 'regles_gmail', id); }

function storagePath(uid, id, name) {
  const ext = name.includes('.') ? name.split('.').pop() : 'bin';
  return `users/${uid}/documents/${id}.${ext}`;
}

/* ═══════════════════════════════════════════════════════════════════
   DOCUMENTS — FIRESTORE + STORAGE
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Abonne un callback aux changements de documents Firestore.
 * Retourne la fonction de désabonnement.
 */
export function subscribeDocuments(uid, onChange) {
  const q = query(docsRef(uid), orderBy('date_import', 'desc'));
  return onSnapshot(q, snap => {
    console.log('Snapshot reçu :', snap.docs.length, 'documents');
    const docs = snap.docs.map(d => ({ firestoreId: d.id, ...d.data() }));
    onChange(docs);
  }, err => console.error('[Firestore] Documents :', err));
}

/**
 * Ajoute un document : upload Storage → Firestore → IndexedDB local.
 * Retourne les métadonnées Firestore enrichies.
 */
export async function addDocumentSync(uid, file, category, customName = null, docDate = null) {
  setSyncState('syncing');

  /* 1. Stocker localement en IndexedDB */
  const localMeta = await addLocalDoc(file, category, customName, docDate);
  const localId   = localMeta.id;
  console.log('Document sauvegardé localement :', localMeta.name);

  try {
    /* 2. Upload binaire vers Firebase Storage */
    const name    = customName || file.name;
    const path    = storagePath(uid, String(localId), name);
    const fileRef = storageRef(storage, path);
    await uploadBytes(fileRef, file);
    const downloadURL = await getDownloadURL(fileRef);
    console.log('Document uploadé sur Storage :', downloadURL);

    /* 3. Créer l'entrée Firestore */
    const docData = {
      id:           localId,          // référence IndexedDB locale
      name,
      category,
      docDate:      docDate ?? null,
      date_import:  serverTimestamp(),
      mimeType:     file.type,
      size:         file.size,
      storage_path: path,
      download_url: downloadURL,
    };
    await setDoc(docRef(uid, String(localId)), docData);
    console.log('Document sauvegardé sur Firestore :', String(localId));

    setSyncState('ok');
    return { ...localMeta, download_url: downloadURL, firestoreId: String(localId) };
  } catch (err) {
    console.error('[Firestore] Erreur upload document :', err);
    setSyncState('error');
    /* On garde quand même le doc local */
    return localMeta;
  }
}

/**
 * Supprime un document de Firestore, Storage et IndexedDB.
 */
export async function deleteDocumentSync(uid, localId) {
  setSyncState('syncing');
  try {
    /* Récupérer le storage_path depuis Firestore avant suppression */
    const snap = await getDoc(docRef(uid, String(localId)));
    if (snap.exists()) {
      const path = snap.data().storage_path;
      if (path) {
        try { await deleteObject(storageRef(storage, path)); } catch (_) {}
      }
      await deleteDoc(docRef(uid, String(localId)));
    }
    await deleteLocalDoc(localId);
    setSyncState('ok');
  } catch (err) {
    console.error('[Firestore] Erreur suppression :', err);
    setSyncState('error');
    await deleteLocalDoc(localId);
  }
}

/**
 * Met à jour les métadonnées d'un document (nom, catégorie, date).
 */
export async function updateDocumentSync(uid, localId, patch) {
  setSyncState('syncing');
  try {
    await updateDoc(docRef(uid, String(localId)), {
      ...(patch.name     !== undefined && { name:    patch.name }),
      ...(patch.category !== undefined && { category: patch.category }),
      ...(patch.docDate  !== undefined && { docDate:  patch.docDate }),
    });
    setSyncState('ok');
  } catch (err) {
    console.error('[Firestore] Erreur mise à jour :', err);
    setSyncState('error');
  }
}

/* ═══════════════════════════════════════════════════════════════════
   RAPPELS — FIRESTORE
   ═══════════════════════════════════════════════════════════════════ */

export function subscribeRappels(uid, onChange) {
  return onSnapshot(rappelsRef(uid), snap => {
    const rappels = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    onChange(rappels);
  });
}

export async function addRappelSync(uid, rappel) {
  setSyncState('syncing');
  try {
    const docSnap = await addDoc(rappelsRef(uid), {
      ...rappel,
      createdAt: serverTimestamp(),
    });
    setSyncState('ok');
    return docSnap.id;
  } catch (err) {
    console.error('[Firestore] Erreur rappel :', err);
    setSyncState('error');
    return null;
  }
}

export async function deleteRappelSync(uid, id) {
  setSyncState('syncing');
  try {
    await deleteDoc(rapRef(uid, id));
    setSyncState('ok');
  } catch (err) {
    console.error('[Firestore] Erreur suppression rappel :', err);
    setSyncState('error');
  }
}

export async function updateRappelSync(uid, id, patch) {
  setSyncState('syncing');
  try {
    await updateDoc(rapRef(uid, id), patch);
    setSyncState('ok');
  } catch (err) {
    setSyncState('error');
  }
}

/* ═══════════════════════════════════════════════════════════════════
   RÈGLES GMAIL — FIRESTORE
   ═══════════════════════════════════════════════════════════════════ */

export function subscribeGmailRules(uid, onChange) {
  return onSnapshot(rulesRef(uid), snap => {
    const rules = snap.docs.map(d => ({ firestoreId: d.id, ...d.data() }));
    onChange(rules);
  });
}

export async function addGmailRuleSync(uid, rule) {
  setSyncState('syncing');
  try {
    const snap = await addDoc(rulesRef(uid), {
      ...rule,
      createdAt: serverTimestamp(),
    });
    setSyncState('ok');
    return snap.id;
  } catch (err) {
    setSyncState('error');
    return null;
  }
}

export async function deleteGmailRuleSync(uid, firestoreId) {
  setSyncState('syncing');
  try {
    await deleteDoc(ruleDocRef(uid, firestoreId));
    setSyncState('ok');
  } catch (err) {
    setSyncState('error');
  }
}

export async function updateGmailRuleSync(uid, firestoreId, patch) {
  setSyncState('syncing');
  try {
    await updateDoc(ruleDocRef(uid, firestoreId), patch);
    setSyncState('ok');
  } catch (err) {
    setSyncState('error');
  }
}

/* ═══════════════════════════════════════════════════════════════════
   MIGRATION — localStorage / IndexedDB → Firebase
   ═══════════════════════════════════════════════════════════════════ */

const LS_MIGRATED_KEY = 'admin-app:firebase-migrated';

export function isMigrated() {
  return localStorage.getItem(LS_MIGRATED_KEY) === '1';
}

/**
 * Migre les données locales vers Firebase lors du premier login.
 * Affiche une barre de progression.
 */
export async function migrateFromLocal(uid) {
  if (isMigrated()) return;

  /* ── Compter les éléments à migrer ── */
  await initDB();
  const localDocs   = await getAllDocuments();
  const localRappels = getRappels();
  const localRules   = getRules();
  const total = localDocs.length + localRappels.length + localRules.length;

  if (total === 0) {
    localStorage.setItem(LS_MIGRATED_KEY, '1');
    return;
  }

  /* ── Afficher la barre de progression ── */
  const bar = _showMigrationBar(total);
  let done  = 0;

  /* ── 1. Documents ── */
  for (const meta of localDocs) {
    try {
      const full = await getDocumentData(meta.id);
      if (full?.data) {
        const blob = new Blob([full.data], { type: meta.mimeType || 'application/octet-stream' });
        const file = new File([blob], meta.name, { type: meta.mimeType });

        const path = storagePath(uid, String(meta.id), meta.name);
        const sRef = storageRef(storage, path);
        await uploadBytes(sRef, file);
        const downloadURL = await getDownloadURL(sRef);

        await setDoc(docRef(uid, String(meta.id)), {
          id:           meta.id,
          name:         meta.name,
          category:     meta.category,
          docDate:      meta.docDate ?? null,
          date_import:  serverTimestamp(),
          mimeType:     meta.mimeType,
          size:         meta.size,
          storage_path: path,
          download_url: downloadURL,
        });
      }
    } catch (e) {
      console.warn('[Migration] Document ignoré :', meta.name, e);
    }
    bar.update(++done, total);
  }

  /* ── 2. Rappels ── */
  for (const r of localRappels) {
    try {
      await addDoc(rappelsRef(uid), {
        label:      r.label,
        rappelDate: r.rappelDate,
        expiryDate: r.expiryDate ?? null,
        type:       r.type,
        fileName:   r.fileName,
        dismissed:  r.dismissed ?? false,
        createdAt:  serverTimestamp(),
      });
    } catch (e) {}
    bar.update(++done, total);
  }

  /* ── 3. Règles Gmail ── */
  for (const rule of localRules) {
    try {
      await addDoc(rulesRef(uid), {
        label:               rule.label || '',
        expediteur:          rule.email || rule.expediteur || '',
        mots_cles:           rule.keywords || rule.mots_cles || [],
        dossier_destination: rule.folder || rule.dossier_destination || 'Autres',
        actif:               rule.enabled ?? true,
        createdAt:           serverTimestamp(),
      });
    } catch (e) {}
    bar.update(++done, total);
  }

  /* ── Marquer la migration comme faite ── */
  localStorage.setItem(LS_MIGRATED_KEY, '1');
  bar.finish();
}

/* ── Barre de progression de migration ── */
function _showMigrationBar(total) {
  const el = document.createElement('div');
  el.id = 'migration-bar';
  el.className = 'migration-bar';
  el.innerHTML = `
    <div class="migration-bar-inner">
      <span class="migration-bar-label">Migration vers Firebase…</span>
      <div class="migration-bar-track">
        <div class="migration-bar-fill" style="width:0%"></div>
      </div>
      <span class="migration-bar-pct">0%</span>
    </div>`;
  document.body.appendChild(el);

  return {
    update(done, t) {
      const pct = Math.round((done / t) * 100);
      el.querySelector('.migration-bar-fill').style.width = pct + '%';
      el.querySelector('.migration-bar-pct').textContent = pct + '%';
    },
    finish() {
      el.querySelector('.migration-bar-label').textContent = 'Migration terminée ✓';
      el.querySelector('.migration-bar-fill').style.width = '100%';
      el.querySelector('.migration-bar-pct').textContent = '100%';
      setTimeout(() => el.remove(), 2000);
    },
  };
}
