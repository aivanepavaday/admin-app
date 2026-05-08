# Admin-App — Assistant Administratif IA

## Description du projet
Application web minimaliste qui aide l'utilisateur à gérer ses démarches administratives. Elle agit comme un copilote administratif intelligent : elle organise les documents, explique les démarches, guide étape par étape, et surveille automatiquement la boite Gmail pour classer les documents entrants.

## Stack technique
- HTML, CSS, JavaScript vanilla (pas de framework)
- API Claude (Anthropic) pour l'assistant IA
- API Gmail (OAuth) pour la surveillance et l'import automatique des emails
- Stockage local via localStorage et IndexedDB pour les documents
- API Web Speech pour la reconnaissance vocale (Chrome uniquement)
- Tesseract.js pour l'OCR (lecture de texte dans les documents)

## Design
- Fond sombre : #0a0a0b
- Accent violet : #6c6aff
- Typographie système
- Minimaliste, anti-administratif, intuitif
- Mobile-friendly

## Structure des fichiers
admin-app/
├── index.html          # Page principale
├── style.css           # Styles globaux
├── app.js              # Logique principale
├── modules/
│   ├── gmail.js        # Intégration Gmail API
│   ├── documents.js    # Gestion des documents
│   ├── assistant.js    # Intégration Claude API
│   ├── ocr.js          # Lecture de texte (Tesseract.js)
│   └── demarches.js    # Base de données des démarches
├── data/
│   └── demarches.json  # Base de démarches courantes
└── CLAUDE.md

## Fonctionnalités à construire dans cet ordre

### 1. Interface principale (déjà fait)
- Bouton micro central avec animation pulsation
- Champ texte pour poser des questions
- Section documents

### 2. Gestion des documents
- Import par glisser-déposer ou clic (PDF, images)
- Catégories : Identité, Logement, Revenus, Impôts, Assurance, Téléphone, Énergie, Autres
- Stockage local via IndexedDB
- Affichage en grille avec nom, type, date, taille
- Suppression individuelle
- OCR automatique à l'import (Tesseract.js) pour extraire nom, date, montant, organisme

### 3. Surveillance Gmail automatique
- Connexion OAuth Gmail
- Vérification automatique toutes les 15 minutes
- Règles configurables par l'utilisateur :
  Exemple : "facture@redbysfr.fr → dossier Téléphone"
  Exemple : "edf → dossier Énergie"
- Détection automatique des pièces jointes (PDF, images)
- Import et classification automatique dans le bon dossier
- Notification discrète quand un nouveau document est importé
- Recherche manuelle possible : "trouve ma dernière facture SFR"

### 4. Assistant IA (Claude API)
- Réponse aux questions sur les démarches administratives
- Vérification intelligente des documents :
  "Tu as 2 documents sur 3. Il te manque une quittance de loyer."
- Explication du jargon administratif en langage simple
- Aide contextuelle sur les formulaires
- Interface vocale via Web Speech API

### 5. Base de démarches (demarches.json)
Démarches à inclure : APL, Passeport, Carte d'identité, Permis de conduire, Mise à jour carte Vitale
Pour chaque démarche : liste des documents nécessaires, étapes, explications simplifiées, liens officiels

### 6. Écran de configuration des règles Gmail
- Interface pour créer/modifier/supprimer des règles d'import automatique
- Format : expéditeur ou mot-clé → catégorie de destination
- Toggle pour activer/désactiver la surveillance automatique

## Règles de développement
- Toujours valider les changements avant de passer à la suite
- Un module à la fois, dans l'ordre défini ci-dessus
- Commenter le code en français
- Garder le design sombre et minimaliste sur toutes les nouvelles pages
- Tester chaque feature avant de passer à la suivante
- Ne jamais envoyer de données personnelles vers des serveurs externes (sauf appels API nécessaires)

## État actuel du projet
- index.html, style.css, app.js créés
- Interface de base en place (étape 1 ✓)
- modules/documents.js créé — IndexedDB, CRUD, catégories, guessCategory (étape 2 ✓)
- app.js converti en ES module (type="module")
- Fonctionnalités documents opérationnelles :
  - Import par clic ou glisser-déposer avec panneau de confirmation
  - Détection automatique de catégorie par nom de fichier
  - Stockage complet (binaire ArrayBuffer) dans IndexedDB
  - Grille de cartes avec filtres par catégorie
  - Suppression et changement de catégorie par clic
  - Compteur de documents dans la nav
- Prochaine étape : surveillance Gmail automatique (étape 3)
