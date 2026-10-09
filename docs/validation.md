# Validation locale — 8 octobre 2026

Environnement : macOS 27, Apple Silicon, Xcode 27, Rust 1.94.1, Node.js 26.10.0 et **pnpm 12.10.1**. Les versions JavaScript et les deux lockfiles sont conservés dans le projet.

## Vérifications exécutées

| Contrôle | Résultat |
| --- | --- |
| `pnpm typecheck` | TypeScript strict et composants Vue validés. |
| `pnpm test` | **36 tests réussis**, trois fichiers : calcul, workflow et documents. |
| `cargo test --manifest-path src-tauri/Cargo.toml` | **7 tests réussis** : persistance, verrou concurrent, transactions/rollback, unicité, versions incompatibles, révisions immuables, sauvegarde/restauration avec conservation des PDF et du logo, rétention de 30 sauvegardes par base, refus des fichiers corrompus. Plusieurs garanties sont regroupées dans un test. |
| `pnpm test:ui` | Parcours Playwright dans Google Chrome installé, profil temporaire : **1440 × 1000** et **390 × 844**, aucune erreur JavaScript de page. |
| `pnpm build` | Build frontend de production réussi. |
| `pnpm tauri build --bundles app` | Bundle natif macOS Apple Silicon construit : `src-tauri/target/release/bundle/macos/Easy Salaires.app`, environ 15 Mio. |

Le parcours UI couvre : premier écran, démonstration, saisie horaire 160,5 h + 2 h supplémentaires majorées de 25 %, émission, téléchargement du PDF original, paiement manuel, rechargement/persistance, export Excel, ajout d’employé, passage FR/EN sans changement du net de 4 659,58 CHF, absence de débordement horizontal et fermeture clavier. Les positions et dimensions du panneau mobile sont vérifiées.

Vérification croisée supplémentaire : extraction du texte du PDF réellement téléchargé et lecture ExcelJS du XLSX téléchargé. Le cas Alex Morel / octobre présente dans les deux documents un brut de **5 216,00**, des retenues de **556,42** et un net de **4 659,58 CHF**, identique au panneau testé.

Les tests métier couvrent notamment salaire réel à 60 %, distinction heures manquantes/zéro, assiettes AVS/AC/LAA, montants fixes LPP, plafond cumulé, prorata inclusif/février bissextile, absences, droits et paiements du 13e, départ, préparation idempotente, historique inchangé après modification, invalidation des mois suivants et du paiement après correction. Les tests documentaires vérifient des PDF déterministes avec police embarquée, fusion, pagination, cellules XLSX numériques, neutralisation des formules CSV et champs canoniques du formulaire AFC.

## Vérification native et visuelle

Application native lancée et utilisée sur macOS avec la base de démonstration SQLite : saisie d’heures, émission d’une révision, état payé et export de sauvegarde par le dialogue système. Une lecture SQLite indépendante du fichier exporté confirme `integrity_check = ok`, **30 fiches, 30 révisions et un paiement en octobre**. La restauration et la conservation des bytes PDF sont testées via le même stockage Rust ; le parcours complet des dialogues de restauration n’a pas été exécuté jusqu’au bout.

La reconstruction finale intègre les corrections issues des essais. La session native déjà ouverte est conservée ; la fermer et rouvrir le bundle charge ce dernier build.

Inspection effective des captures desktop/mobile, écran vide, tableau mensuel, employé, paramètres en anglais, fiche, erreurs de saisie et récapitulatif annuel. PDF rendus via Poppler puis inspectés : fiche française, anglaise, document long sur quatre pages avec accents et adresses longues, formulaire AFC prérempli. Le PDF officiel conserve ses champs éditables.

Les captures, PDF, export XLSX, résultat UI JSON et journal de compilation sont dans `output/qa/`, volontairement ignoré par Git. `pnpm test` et `pnpm test:ui` régénèrent les preuves documentaires et navigateur.

## Limites de validation et de livraison

- Windows : code et configuration communs, **ni compilé ni exécuté** ici. À construire/tester sur Windows avec WebView2 et les outils C++ indiqués dans le README.
- macOS 12 est la cible minimale configurée, pas un OS testé ici. Bundle local sans certificat de distribution Apple ni notarisation.
- Schéma SQLite V1 testé ; aucune ancienne version commerciale n’existe à migrer. Les versions inconnues sont refusées, sans conversion destructive.
- Aucun virement, télédéclaration ni envoi à une caisse effectué. Certificat AFC partiellement prérempli, cas complémentaires manuels décrits dans le README et l’interface.
- Aucun déploiement, publication, workflow CI/CD, commit ou push réalisé.

Le profil Cargo conserve les symboles des dépendances de compilation pour éviter une anomalie de stripping Mach-O avec l’éditeur de liens de macOS 27. Cela concerne les outils de build, pas des bibliothèques de développement expédiées dans le bundle.


## Refonte du parcours guidé — 8 octobre 2026

- Paramètres séparés en deux onglets, aides sur les bases de calcul, montants manquants distincts de zéro, sélection de l’année et enregistrement d’une année non vérifiée sans autoriser l’émission.
- Création d’un employé en quatre étapes, LPP visible, erreurs AVS/IBAN près des champs, récapitulatif et protection des saisies lors des sorties.
- Guide de démarrage dérivé des informations enregistrées, prochaine action par fiche, confirmation de correction, paiement manuel expliqué et exports nommés selon leur usage.
- 40 tests TypeScript réussis (dont 4 tests de progression/readiness), 7 tests Rust réussis, typecheck et build frontend réussis.
- `pnpm test:ui` : démonstration, heures et heures supplémentaires, génération PDF, paiement, persistance, export Excel, création employé, FR/EN, desktop 1440 × 1000 et mobile 390 × 844 ; aucune erreur JavaScript.
- `pnpm test:ux` : entreprise vide jusqu’à sa première fiche, navigation clavier entre onglets, conservation croisée des saisies des paramètres, erreurs de formulaire, montants à zéro, LPP, annulation d’une correction, année future sauvegardée en brouillon et conservation des révisions ; aucune erreur JavaScript. Le serveur de test peut être choisi via `UI_URL`.
- macOS : bundle de contrôle `Easy Salaires QA.app`, profil indépendant `ch.easysalaires.uxqa`. Démonstration ouverte, onglets et cotisations inspectés, sauvegarde native exportée et dernière sauvegarde affichée. Lecture indépendante : `integrity_check = ok`, 3 employés, 30 fiches et 29 révisions. Les données de l’entreprise réelle n’ont pas été utilisées.
- Bundle final `Easy Salaires.app` reconstruit avec l’identifiant habituel `ch.easysalaires.desktop`. La session réelle déjà ouverte n’a pas été fermée ou relancée ; enregistrer la saisie puis relancer pour charger la refonte.
- Preuves : `output/qa/ux/` (captures, résultats JSON, diff avant/après) et `output/qa/ui-result.json`. Sauvegarde des sources avant modification : `/tmp/easy-salaires-before-ux-20261008/`.

Le schéma et les formules de paie restent inchangés. La date de la dernière sauvegarde **exportée** est mémorisée dans les préférences, par fichier entreprise, et n’est affichée que si le fichier exporté existe encore. Les limites Windows, signature et notarisation restent celles décrites ci-dessus. Une vraie séance de prise en main avec un nouvel utilisateur reste à réaliser.


## Sprint V2 — 9 octobre 2026

Cette section remplace les comportements historiques décrits plus haut pour les données communes, les paiements et les corrections.

- Tableau annuel par employé avec douze mois, prévisions, saisie du salaire/des heures, compléments et frais, application aux mois suivants, paiement partiel et PDF direct.
- Identité et entreprise communes ; salaire habituel et cotisations hérités avec exceptions limitées aux champs explicitement modifiés. Recalcul chronologique des mois concernés, sans date d’effet à saisir. Les paiements réels restent indépendants du nouveau net ; les révisions PDF archivées sont conservées.
- Mise à niveau du modèle JSON des anciens dossiers, sans changement de schéma SQLite : détection des exceptions mensuelles et des anciennes copies de cotisations, reprise du montant des paiements existants, marqueur persistant dans l’entreprise.
- Interface V2 inspirée de Kiiwi, menu gauche, quatre palettes uniquement chromatiques : Kiwi, Océan, Lavande et Terracotta. Préférence mémorisée localement.
- `pnpm check` réussi : TypeScript, **53 tests dans cinq fichiers**, build de production. `cargo test --manifest-path src-tauri/Cargo.toml` : **7 tests réussis**.
- `pnpm test:v2` réussi dans Chrome avec profil isolé, desktop **1440 × 1050** et mobile **390 × 844** : renommage global, conservation des PDF/paiements, exception mensuelle, frais et prime, paiement partiel, régénération du PDF, application aux mois suivants, quatre palettes et persistance, autres pages, absence de débordement du document et d’erreur JavaScript.
- `pnpm test:ui` et `pnpm test:ux` réussis après adaptation de la navigation : calcul horaire, PDF, Excel, création employé, FR/EN, configuration d’une nouvelle entreprise, onglets/clavier, erreurs, année non vérifiée et protections des saisies.
- Contrôle natif sur le bundle indépendant `Easy Salaires V2 QA.app` (`ch.easysalaires.v2qa`) : démonstration, tableau annuel, thème Océan et renommage d’un employé. Lecture SQLite indépendante après fermeture : `integrity_check = ok`, marqueur modèle 2, **10 fiches portant le nouveau nom**, **9 paiements conservés**, **29 révisions PDF présentes** ; les 10 révisions de cette personne gardent l’ancien nom. Les données réelles n’ont pas été utilisées.
- Bundle final **Easy Salaires.app** reconstruit avec l’identifiant habituel `ch.easysalaires.desktop`, 14,60 Mio. La session réelle déjà ouverte n’a pas été remplacée : enregistrer puis quitter et rouvrir le bundle final pour utiliser la V2.
- Preuves : `output/playwright/v2/` (captures des palettes, mobile, pages, capture native et `result.json`) ; anciennes suites dans `output/qa/`. Source avant V2 copiée dans `/tmp/easy-salaires-before-v2-20261009/`.

Pas de commit ni push : le dossier fourni n’est pas un dépôt Git. Les limites Windows, signature et notarisation restent celles indiquées plus haut.

## Distribution et mises à jour — 9 octobre 2026

Version publique publiée : [**0.1.0**](https://github.com/DwennK/Easy-Salaires/releases/tag/v0.1.0). Deux cibles seulement : Apple Silicon (`aarch64-apple-darwin`) et Windows x64 (`x86_64-pc-windows-msvc`). Le workflow crée d’abord un brouillon et ne publie le manifeste des mises à jour qu’après réussite des deux cibles et vérification des signatures.

- Local : `pnpm check` réussi, **66 tests TypeScript** ; **7 tests Rust** réussis. Workflow contrôlé avec `actionlint`.
- `pnpm test:updater` : Chrome isolé, **1440 × 1000** et **390 × 844**, zéro erreur JavaScript. IPC natif simulé pour les états disponible/à jour/hors ligne, progression, échec d’installation, reprise et blocage des paramètres non enregistrés. Les captures attendent la fin des animations.
- Signature réelle produite par Tauri : vérification Ed25519, commentaire signé et version ; un fichier modifié est rejeté. La version est aussi vérifiée avec des fichiers CRLF, pour couvrir le checkout Windows.
- Contrôle natif macOS 27 sur l’identifiant isolé `ch.easysalaires.updateqa`, avec une mise à jour locale signée **0.0.8 → 0.0.9**. La sauvegarde précède le téléchargement ; le paquet remplace l’application. Le nouveau processus porte bien la version 0.0.9. La base de démonstration et les sauvegardes ont `integrity_check = ok` et des exports SQL identiques à l’état initial, PDF compris.
- La réouverture de la fenêtre après le redémarrage automatique n’a pas pu être confirmée par Computer Use ; la fermeture puis réouverture explicite a affiché correctement 0.0.9 avec les données conservées. Un premier essai dans le dossier de compilation est resté bloqué dans le remplacement macOS (`renamex_np`) ; l’installation a réussi depuis un dossier temporaire. Le parcours de distribution demande de déplacer l’app dans Applications.
- Le serveur HTTP sur loopback et les versions 0.0.8/0.0.9 sont des fixtures de contrôle locales, ignorées par Git. La configuration publiée reste HTTPS, avec signature et version signée obligatoires.
- Les tests de paie et de stockage ont aussi réussi sur les runners GitHub macOS et Windows. Une première construction Windows a atteint l’installateur, puis le contrôle de version a révélé un problème de fins de ligne CRLF ; le parseur a été corrigé avant publication.

Preuves locales : `output/playwright/updater/` et `output/qa/updater/`. Les essais utilisent exclusivement la démonstration ; aucun dossier réel n’a été modifié. La validation interactive d’un installateur ou d’une mise à jour Windows reste à réaliser sur Windows. Les signatures Tauri ne remplacent pas les certificats de distribution Apple/Microsoft ni la notarisation Apple.

Publication confirmée par le [workflow GitHub réussi](https://github.com/DwennK/Easy-Salaires/actions/runs/37872769288). Les deux installateurs, les deux signatures et l’archive de mise à jour macOS sont présents. `node scripts/release.mjs verify v0.1.0` vérifie les signatures des fichiers téléchargés ; le manifeste public `latest.json` annonce exactement `darwin-aarch64` et `windows-x86_64`, version 0.1.0. Le binaire macOS téléchargé est ARM64 et sa signature ad hoc passe `codesign --verify --deep --strict`.

Après publication, le bouton de contrôle natif de la copie QA (0.0.9) a détecté la vraie release GitHub **0.1.0** et affiché « Installer et redémarrer ». Aucun paquet de production n’a été installé sur le dossier de test ni sur l’application habituelle pendant ce contrôle.
