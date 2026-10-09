# Règles de paie — Easy Salaires

Préréglage embarqué : **2026, entreprise ordinaire affiliée à la CCNC, Neuchâtel, hors agriculture**. Vérification : **8 octobre 2026**. Les URL, l’année et la date de vérification sont également stockées dans chaque version de règles et chaque instantané de paie. Les valeurs d’assurance de la démonstration sont fictives.

## Sources primaires et valeurs

| Domaine | Règles utilisées | Source |
|---|---|---|
| AVS/AI/APG 2026 | 5,30 % employé et 5,30 % employeur. Dès le 1er janvier suivant le 17e anniversaire. Allocations familiales réglementaires hors assiette. Après l’âge de référence : statut explicite et franchise mensuelle de 1 400 CHF, ou renonciation. | [Centre AVS/AI, mémento 2.01, état au 01.01.2026](https://www.ahv-iv.ch/p/2.01.f), ch. 1, 3, 11, 14–17 |
| AC, applicable en 2026 | 1,10 % pour chaque partie ; plafond annuel 148 200 CHF. Plafond proportionnel à la durée d’emploi, base 360 jours, 30 jours/mois. Pas d’AC après l’âge de référence. | [Centre AVS/AI, mémento 2.08, état au 01.01.2025, réimpression novembre 2025](https://www.ahv-iv.ch/p/2.08.f), ch. 1–6 |
| CCNC 2026 | Employeur : AF 1,80 %, LFAPP 0,507 %, LAE 0,18 %, sur le salaire AVS. Administration : 1,80 % du **total des cotisations AVS/AI/APG**, pas du salaire. Ces taux ne sont pas universels pour toutes les caisses. | [CCNC, employeurs et salariés](https://www.caisseavsne.ch/fr/Assurances/AVS-Cotisations/Employeurs-et-salarie-e-s/Employeurs-et-salarie-e-s.html), [changement AF 2026](https://www.caisseavsne.ch/fr/Actualites/Assurances-sociales-ce-qui-va-changer-en-2026.html) |
| LAA | Taux contractuels à saisir. AAP à la charge de l’employeur dans le préréglage. AANP activée à partir de 8 h hebdomadaires chez le même employeur ; répartition financière configurable. Plafond 148 200 CHF/an. | [Suva, assurance LAA](https://www.suva.ch/fr-ch/assurance/assurance-accidents/assurance-accidents-laa), [Suva, prestations](https://www.suva.ch/fr-ch/accident/prestations-de-la-suva/prestations-en-especes) |
| Assiettes LAA et calendrier d’assurance | Les salaires des jeunes et la franchise AVS des retraités restent soumis LAA. Assiette propre, différente de l’AVS. Plafonds cumulés 30/360 ; les 31 et les 28/29 février d’entrée/sortie sont ramenés au 30. | [Zurich, instructions LAA](https://www.zurich.ch/-/media/zurich-site/content/services/firmen/deklaration/dokumente/wegleitung-deklaration-uvg.pdf?sc_lang=fr), [Swissdec, directives ELM 5.0 actualisées le 12.03.2024](https://swissdec.ch/document/share/359/54dddb6c-ed5e-4a56-ab1c-8d0db2817501), §7.12 |
| Vacances | Paiement avec le salaire horaire seulement lorsque les conditions contractuelles et jurisprudentielles le permettent ; mention séparée sur le contrat et la fiche. Aucun taux ajouté automatiquement. | [SECO, FAQ vacances](https://www.seco.admin.ch/fr/faq-vacances) |
| Jours fériés | Pour les horaires, ne pas supposer un taux universel ou un droit identique pour tous les jours. Vérifier contrat/CCT ; le 1er août a un régime légal particulier. | [SECO, congés et jours fériés](https://www.seco.admin.ch/fr/faq-conge-et-jours-ferie) |
| Certificat | Modèle officiel formulaire 11, FR/DE/EN, version interne 01.21, distribué par l’AFC le 09.10.2023. Guide à partir de 2026, publié le 15.01.2026. | [Page officielle AFC](https://www.estv.admin.ch/fr/certificat-de-salaire-et-attestation-de-rentes), [modèle](https://www.estv.admin.ch/dam/fr/sd-web/ZHHPweebOHYN/dbst-form-11lohna-rechts-dfe-fr.pdf), [guide 2026](https://www.estv.admin.ch/dam/fr/sd-web/afP1GDFr8gE3/dbst-form-lohna-wegleitung-2026-fr.pdf) |

## Calcul et conventions du produit

Le moteur pur `src/domain/payroll.ts` alimente les fiches, leurs aperçus, les PDF et les exports. Aucune formule salariale alternative dans le stockage ou les vues.

- Entrées décimales sous forme de chaînes, calculs avec Decimal.js (32 chiffres de précision). Arrondi commercial au centime **par ligne**, puis sommes de centimes entiers sûrs. Les droits au 13e restent à 12 décimales jusqu’au versement. Aucune règle d’arrondi cash à 0,05.
- Un montant fixe de 3 000 CHF à 60 % reste 3 000 CHF. Le taux d’activité est informatif ; le salaire dû est explicite.
- Prorata de salaire fixe : jours calendaires sous contrat / jours du mois, dates incluses. C’est une **convention du produit, pas une règle légale universelle**. Un ratio manuel exige un motif. Le calendrier du prorata salarial est distinct du calendrier des plafonds d’assurance.
- Heures normales réellement saisies × taux ; heures supplémentaires séparées avec majoration explicite, y compris 0. Les absences payées ne modifient pas les montants. Une retenue non payée est saisie ou proposée avec heures/jours contractuels et reste ajustable. Le moteur ne simule jamais une indemnité de maladie.
- Vacances : base normale, ou normale + jours fériés. Jours fériés : normale, ou normale + heures supplémentaires. Les options, taux et bases sont contractuels, désactivés initialement.
- Allocations familiales : montant réglementaire saisi, inclus dans le brut payable et fiscal, exclu AVS/AC/LAA. Aucune détermination automatique d’éligibilité ou de supplément dépassant les limites légales.
- LPP : montants fixes du décompte de caisse, sans prorata automatique. L’adéquation du contrat, l’éligibilité et la répartition sont à confirmer avec la caisse.
- IJM : activation et parts contractuelles ; assiette configurable. Aucun plafond IJM universel n’est présumé ; utiliser un montant fixe issu du décompte lorsque le contrat ne correspond pas à une assiette prise en charge.
- AC/LAA : base cumulée plafonnée moins bases déjà comptées. Les cotisations mensuelles peuvent ainsi régulariser les écarts antérieurs. Les mois précédents doivent avoir un calcul complet, sans nécessiter l’émission de leur PDF. La V2 recalcule chronologiquement les mois enregistrés après une modification commune ou mensuelle ; les PDF déjà émis restent archivés et sont signalés à actualiser.
- 13e : droit sur salaire de base ajusté par absences et lignes explicitement marquées, ou sur toutes les rémunérations hors allocations/13e. Versement mensuel, mois choisi (décembre par défaut), ou solde à la sortie. Déduction des droits déjà payés ; jamais de droit sur le 13e lui-même. Un solde négatif de récupération est signalé.
- Les remboursements de frais explicitement identifiés sont ajoutés au net, hors brut salarial, bases de cotisations et droit au 13e. Leur traitement dans le certificat reste à compléter manuellement.
- Coût employeur = brut + remboursements de frais + parts employeur ; les retenues employé ne sont pas ajoutées de nouveau. Il s’agit du coût de paie avant remboursements éventuels des caisses.
- Les fiches incomplètes n’entrent pas dans les totaux affichés et ont des cellules vides dans les exports. Les fiches complètes non émises restent explicitement provisoires.

## Certificat officiel

Les champs AcroForm du modèle AFC sont conservés, avec une police locale et des apparences mises à jour. Les valeurs canoniques sont testées après réouverture du PDF. Il reste possible de compléter le fichier dans un lecteur PDF.

Mapping des cas ordinaires : salaire courant, 13e contractuel et allocations versées par l’employeur au **ch. 1** (guide Cm 13–15), total au **ch. 8** (Cm 41), seules parts employé AVS/AI/APG/AC/AANP au **ch. 9** (Cm 42), LPP ordinaire au **ch. 10.1** (Cm 44), différence au **ch. 11**. Les cotisations IJM ne diminuent pas le net fiscal. Montants en francs entiers sur le formulaire ; arrondi commercial selon la convention documentée dans les directives Swissdec §8.1. Le modèle officiel n’est pas redessiné et aucune certification/transmission Swissdec n’est revendiquée.

La revue permet F (transport), G (repas) et ch. 15 (observations). Les autres prestations, participations, voiture, frais, rachats LPP et situations fiscales particulières se complètent **manuellement dans le formulaire officiel**, à l’aide du récapitulatif et du guide embarqués. L’application n’automatise pas leur qualification. Une année incomplète bloque le préremplissage final ; le formulaire vierge reste accessible.

## Paramètres à confirmer et limites

L’utilisateur confirme l’affiliation CCNC, les assurances AAP/AANP/IJM, la LPP, les horaires et conditions du contrat. Une valeur vide n’est jamais un zéro. Les taux sont communs à l’année. Des exceptions indépendantes par personne et par mois peuvent remplacer uniquement les champs concernés. Les anciennes dates d’effet restent conservées en interne pour lire les dossiers existants. Une année sans préréglage demande des valeurs et sources explicitement vérifiées ; elle n’hérite pas d’un ancien millésime officiel.

Pas d’impôt à la source, procédure de décompte simplifiée, indépendants, agriculture, détachement, salaire en nature, emploi simultané chez plusieurs employeurs au-delà des plafonds, correction rétroactive d’un changement d’assureur/couverture, salaire différé relatif à une autre année, ni calcul actuariel LPP. Les indemnités d’assurances à assiettes spécifiques peuvent être saisies comme ajustements documentés seulement après validation du traitement, sinon traitement externe. Les exonérations et l’atteinte de l’âge de référence sont explicites et motivées ; le rôle « Patron » n’y change rien. Pour les salaires minimes, le régime ordinaire est appliqué jusqu’à configuration explicite d’une exonération conforme au cas.

Ces frontières restent des limites de la V2. Les paramètres spécifiques doivent être confirmés avec la caisse/assureur et le contrat ; les valeurs de démonstration ne constituent pas un conseil de paie.
