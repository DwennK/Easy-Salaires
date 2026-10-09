# Architecture

- `src/domain/` : types, valeurs par défaut datées, arithmétique décimale, calcul pur, workflow de préparation/révision et démonstration. Entrées monétaires en chaînes ; résultats finalisés en centimes.
- `src/lib/documents.ts` : PDF A4 avec Noto Sans embarquée, fusion, AcroForm AFC, CSV et XLSX. Les documents consomment les résultats conservés, sans recalcul alternatif.
- `src/lib/bridge.ts` : commandes natives et adaptateur web de démonstration IndexedDB. Aucun paiement réel. Les contrôles et téléchargements de mises à jour passent uniquement par le plugin natif Tauri updater vers GitHub.
- `src/components/` : formulaires et panneaux ; `App.vue` coordonne les actions atomiques. Les écritures travaillent sur une copie, appliquée à l’UI après validation de la transaction SQLite. Les dialogs natifs sont dans Rust.
- `src-tauri/src/storage.rs` : schéma normalisé pour employés, règles, paies, révisions et exports ; JSON versionné pour les instantanés métier ; PDF de révisions en BLOB. Unicité employé/mois, clés étrangères, triggers de révisions immuables, transaction globale avec compteur optimiste. Un seul fichier ouvert par instance et verrou OS conservé tant que la base est ouverte.
- `src-tauri/migrations/` : migrations SQL numérotées, immuables et découvertes automatiquement à la compilation. V1 = schéma initial ; V2 = table `app_metadata` pour conserver la version JSON indépendamment du compteur d’écriture. L’ouverture valide d’abord le fichier en lecture seule, refuse les formats futurs, crée une sauvegarde SQLite vérifiée dans `before-migrations/`, puis applique toutes les étapes manquantes dans une transaction. Une erreur annule toutes les étapes et la version ; un échec de sauvegarde empêche la migration. Ces sauvegardes ne sont pas soumises à la rotation des 30 sauvegardes quotidiennes. Cela fonctionne également après installation manuelle et pour chaque autre dossier ouvert ultérieurement.
- La restauration lit la source en lecture seule, copie son état cohérent via SQLite (y compris le WAL), puis ouvre et migre uniquement la destination. Un fichier destination existant est refusé. La source reste dans son ancien format.

## Modèle de données V2

L’employé et l’entreprise sont les sources des informations communes. Les paies courantes conservent un cache de ces informations pour le calcul et l’export ; `refreshPayrolls` le met à jour et recalcule les mois dans l’ordre chronologique. `termOverrides` contient uniquement les exceptions explicites du mois. Les exceptions de cotisations d’un employé sont partielles par champ, les autres champs héritent de l’entreprise.

`upgradeState` reprend les anciennes données sans réécrire les révisions. Elle identifie les différences de contrat mensuelles par rapport au contrat d’origine, transforme les dates payées existantes en montants payés connus, retire les copies de cotisations identiques aux paramètres et actualise les informations communes. `data-format.json` déclare la version JSON courante (2), partagée entre Rust et TypeScript. Le marqueur historique `company.modelVersion` reste lu et contrôlé ; `app_metadata.data_model` conserve également `State.dataModel`. Un marqueur futur est refusé, même si l’autre marqueur indique une version reconnue. L’adaptation JSON se fait en mémoire ; avant sa première écriture native, une sauvegarde dédiée protège l’ancien modèle, puis les données et le marqueur sont enregistrés dans la même transaction. Le dossier de sauvegarde configuré est respecté. Une baisse de version est refusée.

## Contrat de compatibilité

`pnpm check` exécute le contrat (`pnpm check:data`), les tests métier, les tests SQLite (`pnpm test:storage`) et le build frontend. Le test SQLite compile le vrai module de stockage dans un petit harnais Rust temporaire, sans construire un installateur ni conserver ses intermédiaires. Le workflow de release conserve aussi les tests natifs Tauri sur les deux plateformes.

`tests/fixtures/data/` contient un schéma V1 et des données fictives historiques figées, avec paiement, exception mensuelle et PDF. Le contrat conserve les SHA-256 des migrations/fixtures et l’empreinte des types persistés. Une modification de ces types bloque la validation jusqu’à revue explicite de sa compatibilité et actualisation du contrat. La CI compare également les empreintes historiques au commit de base : les réécrire ne permet pas de modifier silencieusement une ancienne migration.

Pour évoluer : ajouter la prochaine migration SQL si nécessaire (elle est enregistrée automatiquement), ou la prochaine étape JSON si le sens/format change ; ajouter les tests et fixtures nécessaires ; documenter la décision dans le contrat puis lancer `pnpm check`. Ces contrôles détectent des oublis et des régressions, mais ne peuvent pas inventer le sens métier d’une transformation. `AGENTS.md` rend ce travail obligatoire pour les futures interventions.

Les changements globaux se répercutent sur les paies existantes. Les règles enregistrées concernent toute leur année ; pas de nouveau choix de mois d’effet. Les versions historiques préexistantes de contrats sont conservées, les champs modifiés dans le formulaire commun sont appliqués à leurs versions. Les exceptions mensuelles survivent aux changements communs. Les champs d’identité sont toujours ceux de la fiche employé actuelle.

Un paiement est un montant `paidAmount` en centimes et une date `paidDate`, indépendants du résultat. Une correction les conserve et calcule `paymentReview` lorsqu’un écart existe ou que le résultat est incomplet. Les remboursements explicitement identifiés restent hors salaire brut et bases de cotisations, mais augmentent le net payé et le coût.

Les révisions PDF et leurs instantanés sont immuables. Un changement des données du document rend la paie courante non émise, sans toucher aux originaux. Les mois suivants sont recalculés ; leurs PDF ne deviennent obsolètes que si leurs données changent. Les exports concernés sont signalés comme dépassés. Les données antérieures nécessaires aux cumuls doivent être complètes, mais leur PDF n’a pas besoin d’être émis pour produire le suivant.

L’annuel projette douze mois. Les prévisions sont des copies en mémoire, exclues des totaux enregistrés. Une édition, un paiement ou un PDF prépare le mois choisi et ses antécédents de calcul pour le seul employé concerné. Les années sans paramètres ne sont jamais assimilées à des taux zéro.

Les thèmes sont des variables CSS de couleurs, avec structure et interactions identiques. La préférence est locale à l’appareil, sans données salariales.


L’application sert ses ressources locales avec une CSP sans accès Internet depuis le frontend et n’expose aucun plugin SQL, shell ou accès arbitraire au système de fichiers. Les sauvegardes et exports passent par des commandes spécifiques et des dialogues utilisateur. Un export ayant le même nom reçoit un suffixe, une sauvegarde existante est refusée.

## Mises à jour desktop

`src/lib/updater.ts` gère la vérification, le téléchargement, l’installation et le redémarrage. Le composant `AppUpdater.vue` affiche l’état en bas du menu ; les erreurs réseau restent non bloquantes. Les écritures en cours et paramètres non enregistrés empêchent l’installation. La commande native `prepareUpdate` produit une sauvegarde SQLite cohérente du dossier ouvert avant le téléchargement. Les paquets et leur numéro de version sont vérifiés par la clé publique embarquée.

GitHub Releases sert un manifeste `latest.json` avec seulement `darwin-aarch64` et `windows-x86_64`. La clé privée est conservée hors dépôt et dans un secret GitHub ; elle ne fait jamais partie du bundle. Le plugin process ne reçoit que la permission de redémarrer. Aucune donnée salariale ne participe aux requêtes de mise à jour.
