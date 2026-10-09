# Architecture

- `src/domain/` : types, valeurs par défaut datées, arithmétique décimale, calcul pur, workflow de préparation/révision et démonstration. Entrées monétaires en chaînes ; résultats finalisés en centimes.
- `src/lib/documents.ts` : PDF A4 avec Noto Sans embarquée, fusion, AcroForm AFC, CSV et XLSX. Les documents consomment les résultats conservés, sans recalcul alternatif.
- `src/lib/bridge.ts` : commandes natives et adaptateur web de démonstration IndexedDB. Aucun paiement réel ni réseau externe.
- `src/components/` : formulaires et panneaux ; `App.vue` coordonne les actions atomiques. Les écritures travaillent sur une copie, appliquée à l’UI après validation de la transaction SQLite. Les dialogs natifs sont dans Rust.
- `src-tauri/src/storage.rs` : schéma normalisé pour employés, règles, paies, révisions et exports ; JSON versionné pour les instantanés métier ; PDF de révisions en BLOB. Unicité employé/mois, clés étrangères, triggers de révisions immuables, transaction globale avec compteur optimiste. Un seul fichier ouvert par instance et verrou OS conservé tant que la base est ouverte.
- `src-tauri/migrations/` : migrations SQL numérotées. Version 1 = schéma initial ; toute autre version est refusée plutôt que modifiée implicitement. Pour introduire une migration ultérieure : valider la version source, faire une sauvegarde API SQLite avant migration, appliquer le SQL dans une transaction, contrôler les données, seulement ensuite remplacer la version. Les bases d’une version future ne doivent jamais être ouvertes en écriture par une version antérieure.

## Modèle de données V2

L’employé et l’entreprise sont les sources des informations communes. Les paies courantes conservent un cache de ces informations pour le calcul et l’export ; `refreshPayrolls` le met à jour et recalcule les mois dans l’ordre chronologique. `termOverrides` contient uniquement les exceptions explicites du mois. Les exceptions de cotisations d’un employé sont partielles par champ, les autres champs héritent de l’entreprise.

`upgradeState` reprend les anciennes données sans réécrire les révisions. Elle identifie les différences de contrat mensuelles par rapport au contrat d’origine, transforme les dates payées existantes en montants payés connus, retire les copies de cotisations identiques aux paramètres et actualise les informations communes. Le marqueur `company.modelVersion = 2` et les nouveaux champs sont sauvegardés dans les JSON existants. Le schéma SQLite demeure V1. La sauvegarde automatique native à l’ouverture précède la première écriture de cette adaptation.

Les changements globaux se répercutent sur les paies existantes. Les règles enregistrées concernent toute leur année ; pas de nouveau choix de mois d’effet. Les versions historiques préexistantes de contrats sont conservées, les champs modifiés dans le formulaire commun sont appliqués à leurs versions. Les exceptions mensuelles survivent aux changements communs. Les champs d’identité sont toujours ceux de la fiche employé actuelle.

Un paiement est un montant `paidAmount` en centimes et une date `paidDate`, indépendants du résultat. Une correction les conserve et calcule `paymentReview` lorsqu’un écart existe ou que le résultat est incomplet. Les remboursements explicitement identifiés restent hors salaire brut et bases de cotisations, mais augmentent le net payé et le coût.

Les révisions PDF et leurs instantanés sont immuables. Un changement des données du document rend la paie courante non émise, sans toucher aux originaux. Les mois suivants sont recalculés ; leurs PDF ne deviennent obsolètes que si leurs données changent. Les exports concernés sont signalés comme dépassés. Les données antérieures nécessaires aux cumuls doivent être complètes, mais leur PDF n’a pas besoin d’être émis pour produire le suivant.

L’annuel projette douze mois. Les prévisions sont des copies en mémoire, exclues des totaux enregistrés. Une édition, un paiement ou un PDF prépare le mois choisi et ses antécédents de calcul pour le seul employé concerné. Les années sans paramètres ne sont jamais assimilées à des taux zéro.

Les thèmes sont des variables CSS de couleurs, avec structure et interactions identiques. La préférence est locale à l’appareil, sans données salariales.


L’application sert ses ressources locales avec une CSP sans accès Internet et n’expose aucun plugin SQL, shell ou accès arbitraire au système de fichiers. Les sauvegardes et exports passent par des commandes spécifiques et des dialogues utilisateur. Un export ayant le même nom reçoit un suffixe, une sauvegarde existante est refusée.
