// Shared interface vocabulary. The payroll engine and its amounts are unchanged.
export const uiCopy: Record<string, [string, string]> = {
  rulesScope: [
    "Quelles fiches seront concernées par ces changements ?",
    "Which payslips will these changes affect?",
  ],
  rulesHelp: [
    "Préréglage 2026 · CCNC, hors agriculture. Vérifiez qu’il correspond à votre caisse.",
    "2026 preset · CCNC, excluding agriculture. Check that it matches your fund.",
  ],
  discardRules: [
    "Annuler les modifications des cotisations",
    "Discard contribution changes",
  ],
  employeeAddressHelp: [
    "Complétez les coordonnées de l’employé, puis reprenez les informations enregistrées dans les conditions de cette fiche.",
    "Complete employee details, then apply the saved information in this payslip’s terms.",
  ],
  editEmployee: [
    "Compléter le dossier de l’employé",
    "Complete employee details",
  ],
  completeConditions: [
    "Compléter les conditions de cette fiche",
    "Complete this payslip’s terms",
  ],

  monthly: ["Salaires du mois", "Monthly payroll"],
  settingsSub: [
    "Les informations de votre entreprise, les cotisations et les sauvegardes.",
    "Company details, contributions and backups.",
  ],
  rules: ["Cotisations et assurances", "Contributions and insurance"],
  open: ["Ouvrir une entreprise existante", "Open an existing company"],
  prepare: ["Préparer les fiches du mois", "Prepare monthly payslips"],
  exportMonth: ["Télécharger les fiches PDF", "Download payslip PDFs"],
  individualPdfs: ["Enregistrer les PDF séparément", "Save separate PDFs"],
  base: ["Calculée sur", "Calculated on"],
  calculationMode: ["Mode de calcul", "Calculation method"],
  employeePays: ["Retenu sur le salaire", "Deducted from salary"],
  employerPays: ["Payé par l’entreprise", "Paid by the company"],
  effective: ["À partir de quel mois ?", "From which month?"],
  thirteenBase: [
    "Quels éléments comptent pour le 13e salaire ?",
    "Which earnings count towards 13th salary?",
  ],
  correction: ["Créer une fiche corrigée", "Create a corrected payslip"],
  history: ["Versions précédentes", "Previous versions"],
  original: ["Télécharger le PDF", "Download PDF"],
  issue: ["Valider et générer le PDF", "Confirm and generate PDF"],
  saveDraft: ["Enregistrer le brouillon", "Save draft"],
  payment: ["Paiement", "Payment"],
  markPaid: ["Enregistrer le paiement effectué", "Record completed payment"],
  markUnpaid: ["Annuler le statut payé", "Remove paid status"],
  paymentHelp: [
    "Cette action enregistre un paiement déjà effectué. Elle ne déclenche aucun virement.",
    "This records a payment already made. It does not initiate a bank transfer.",
  ],
  issueHelp: [
    "La validation conserve une version de la fiche et son PDF. Vous pourrez ensuite télécharger le document ou créer une correction.",
    "Confirmation stores a payslip version and its PDF. You can then download the document or create a correction.",
  ],
  backup: ["Créer une sauvegarde", "Create a backup"],
  backupSuccess: ["Sauvegarde créée", "Backup created"],
  fileLocation: ["Fichier de cette entreprise", "Company file"],
  lastBackup: [
    "Dernière sauvegarde exportée connue",
    "Last known exported backup",
  ],
  backupUnknown: [
    "Aucune sauvegarde exportée enregistrée pour ce fichier.",
    "No exported backup recorded for this file.",
  ],
  backupManualHelp: [
    "Crée un fichier .db contenant l’entreprise, les employés et les documents. Conservez une copie sur un autre support.",
    "Creates a .db file with company details, employees and documents. Keep a copy on another drive.",
  ],
  restoreHelp: [
    "Choisissez une sauvegarde, puis un nouveau nom de fichier. L’entreprise actuelle sera conservée.",
    "Choose a backup, then a new file name. The current company is preserved.",
  ],
  savedCompany: [
    "Informations de l’entreprise enregistrées",
    "Company details saved",
  ],
  savedRules: ["Cotisations enregistrées", "Contributions saved"],
  saveCompany: [
    "Enregistrer les informations de l’entreprise",
    "Save company details",
  ],
  saveRules: ["Enregistrer les cotisations", "Save contributions"],
  unsaved: ["Modifications non enregistrées", "Unsaved changes"],
  savedState: ["Informations enregistrées", "Saved information"],
  leaveChanges: [
    "Quitter sans enregistrer les modifications ?",
    "Leave without saving changes?",
  ],
  leave: ["Quitter sans enregistrer", "Leave without saving"],
  stay: ["Continuer la saisie", "Keep editing"],
  companyContact: ["Coordonnées de l’entreprise", "Company contact details"],
  companyContactHelp: [
    "Ces coordonnées figurent sur les fiches de salaire.",
    "These details appear on payslips.",
  ],
  administration: ["Informations administratives", "Administrative details"],
  appearance: ["Apparence des fiches de salaire", "Payslip appearance"],
  uidHelp: [
    "Numéro d’identification de l’entreprise, au format CHE-123.456.789. Facultatif.",
    "Company identification number, e.g. CHE-123.456.789. Optional.",
  ],
  footer: ["Texte en bas des fiches", "Payslip footer text"],
  logo: ["Logo de l’entreprise", "Company logo"],
  chooseLogo: ["Choisir une image", "Choose an image"],
  logoHelp: ["PNG ou JPEG, maximum 2 Mo.", "PNG or JPEG, up to 2 MB."],
  previewAppearance: [
    "Aperçu de l’en-tête et du pied de page",
    "Header and footer preview",
  ],
  appearanceHelp: [
    "La disposition complète est visible dans l’aperçu d’une fiche de salaire.",
    "The full layout is available in the payslip preview.",
  ],
  requiredName: ["Indiquez le nom de l’entreprise.", "Enter the company name."],
  settingsTabs: ["Rubriques des paramètres", "Settings sections"],
  presetGroup: ["Cotisations préremplies", "Prefilled contributions"],
  presetHelp: [
    "Valeurs proposées par le préréglage. Vérifiez que votre caisse et votre situation correspondent.",
    "Values suggested by the preset. Check that your fund and situation match.",
  ],
  insuranceGroup: ["Assurances de l’entreprise", "Company insurance"],
  insuranceHelp: [
    "Reprenez les taux dans vos contrats ou décomptes d’assurance. Vous pouvez enregistrer et compléter plus tard.",
    "Copy the rates from your insurance contracts or statements. You can save and complete them later.",
  ],
  ratesMissing: ["taux à renseigner", "rates to enter"],
  ratesComplete: [
    "Tous les taux actifs sont renseignés",
    "All active rates are entered",
  ],
  zeroHelp: [
    "Vide = à renseigner. 0 = aucune cotisation pour cette part. Une cotisation désactivée ne sera pas calculée.",
    "Blank = missing. 0 = no contribution for that share. An inactive contribution is not calculated.",
  ],
  calculationDetails: [
    "Détails et réglages du calcul",
    "Calculation details and settings",
  ],
  calculationHelp: [
    "Le taux s’applique au montant indiqué ci-dessous, qui peut différer du salaire brut.",
    "The rate applies to the amount below, which may differ from gross pay.",
  ],
  calculationExample: [
    "Exemple illustratif : sur une base de 5’000 CHF, un taux de 1 % représente 50 CHF.",
    "Example: on a CHF 5,000 basis, a 1% rate amounts to CHF 50.",
  ],
  fixedHelp: [
    "Le montant en CHF est appliqué directement, sans pourcentage.",
    "The CHF amount is applied directly, without a percentage.",
  ],
  contributionInactive: ["Non appliquée", "Not applied"],
  contributionActive: ["Appliquée", "Applied"],
  provenance: ["Provenance du taux", "Rate source"],
  sourcePreset: ["Préréglage fourni", "Included preset"],
  calculation_avs: [
    "Salaire soumis aux cotisations AVS / AI / APG",
    "Earnings subject to OASI / DI / IC",
  ],
  calculation_ac: [
    "Salaire soumis à l’assurance-chômage, dans la limite du plafond",
    "Earnings subject to unemployment insurance, up to the cap",
  ],
  calculation_laa: [
    "Salaire assuré pour les accidents, dans la limite du plafond",
    "Accident-insured earnings, up to the cap",
  ],
  calculation_salary: [
    "Rémunération calculée, hors allocations familiales",
    "Calculated earnings, excluding family allowances",
  ],
  calculation_gross: ["Salaire brut total", "Total gross salary"],
  calculation_avsContributions: [
    "Total des cotisations AVS de l’employé et de l’entreprise",
    "Total employee and employer OASI contributions",
  ],
  rulesImpact: [
    "Ces règles serviront aux nouvelles fiches à partir du mois choisi. Les fiches déjà préparées restent inchangées ; ouvrez-les pour reprendre les paramètres si nécessaire.",
    "These rules apply to new payslips from the selected month. Existing payslips remain unchanged; open them to apply settings if needed.",
  ],
  companyImpact: [
    "Les nouvelles coordonnées seront utilisées pour les prochaines fiches. Les documents déjà enregistrés restent conservés.",
    "New details apply to future payslips. Previously stored documents are preserved.",
  ],
  rulesHistory: ["Historique des réglages", "Settings history"],
  yearDraft: [
    "Année à vérifier avant de générer des fiches",
    "Year must be verified before issuing payslips",
  ],
  yearAdvanced: [
    "Plafonds et vérification de l’année",
    "Annual caps and verification",
  ],
  nextYearHelp: [
    "Enregistrez ou annulez vos modifications avant de changer d’année.",
    "Save or discard your changes before switching years.",
  ],
  dateMonthError: [
    "Choisissez un mois de l’année sélectionnée.",
    "Choose a month in the selected year.",
  ],
  numberPositive: [
    "Saisissez un nombre positif ou zéro, avec un point ou une virgule.",
    "Enter a positive number or zero, with a decimal point or comma.",
  ],
  setupTitle: ["Préparer votre première fiche", "Prepare your first payslip"],
  setupHelp: [
    "Suivez ces étapes. Les informations enregistrées restent disponibles à votre prochaine ouverture.",
    "Follow these steps. Saved information is available next time you open the app.",
  ],
  setupCompany: ["Entreprise", "Company"],
  setupRules: ["Cotisations et assurances", "Contributions and insurance"],
  setupEmployee: ["Premier employé", "First employee"],
  setupPayroll: ["Première fiche", "First payslip"],
  setupCompanyHelp: [
    "Préparez le nom et l’adresse complète de l’entreprise.",
    "Have your company name and full address ready.",
  ],
  setupRulesHelp: [
    "Préparez les contrats d’assurance et les taux de votre caisse.",
    "Have your insurance contracts and fund rates ready.",
  ],
  setupEmployeeHelp: [
    "Préparez le contrat de travail et le décompte de prévoyance.",
    "Have the employment contract and pension statement ready.",
  ],
  setupPayrollHelp: [
    "Choisissez le premier mois à traiter et vérifiez les montants.",
    "Choose the first payroll month and review the amounts.",
  ],
  completed: ["Renseigné", "Entered"],
  toComplete: ["À compléter", "To complete"],
  continueSetup: ["Continuer la configuration", "Continue setup"],
  hideGuide: ["Réduire le guide", "Collapse guide"],
  showGuide: ["Afficher le guide de démarrage", "Show setup guide"],
  employeeTabs: ["Dossier de l’employé", "Employee record"],
  identityShort: ["Identité", "Identity"],
  contractShort: ["Contrat et salaire", "Contract and salary"],
  insuranceShort: ["Assurances", "Insurance"],
  summaryShort: ["Récapitulatif", "Summary"],
  next: ["Continuer", "Continue"],
  saveEmployee: ["Enregistrer l’employé", "Save employee"],
  employeeIdentityHelp: [
    "Les coordonnées seront reprises sur les documents de cette personne.",
    "These details will appear on this person’s documents.",
  ],
  optionalHelp: [
    "Les champs avec * sont nécessaires. Les autres peuvent être complétés plus tard.",
    "Fields marked * are required. Other fields can be completed later.",
  ],
  avsHelp: [
    "13 chiffres, à recopier depuis la carte d’assurance ou le certificat AVS. Facultatif à cette étape.",
    "13 digits from the insurance card or OASI certificate. Optional at this stage.",
  ],
  ibanHelp: [
    "Compte bancaire de l’employé. Aucun virement n’est effectué par le logiciel.",
    "Employee bank account. The app does not make transfers.",
  ],
  endHelp: [
    "Laissez vide si le contrat continue.",
    "Leave blank for ongoing employment.",
  ],
  contractHelp: [
    "Reprenez les informations du contrat de travail.",
    "Use the information in the employment contract.",
  ],
  salary: [
    "Salaire brut mensuel à ce taux d’activité (CHF)",
    "Monthly gross salary at this employment level (CHF)",
  ],
  salaryHelp: [
    "Indiquez le salaire réellement dû, et non le salaire équivalent à 100 %.",
    "Enter the salary actually due, not the full-time equivalent.",
  ],
  salaryConfirm: ["Salaire brut indiqué", "Entered gross salary"],
  perMonth: ["par mois", "per month"],
  perHour: ["par heure", "per hour"],
  atActivity: ["pour une activité à", "at an employment level of"],
  hours: ["Heures travaillées ce mois", "Hours worked this month"],
  hoursHelp: [
    "Saisissez 0 si aucune heure n’a été travaillée. Un champ vide signifie que les heures restent à renseigner.",
    "Enter 0 if no hours were worked. A blank field means hours are still missing.",
  ],
  insuranceEmployeeHelp: [
    "Les cotisations de l’entreprise s’appliquent par défaut. La prévoyance se renseigne pour chaque personne.",
    "Company contributions apply by default. Pension contributions are entered for each person.",
  ],
  pensionTitle: [
    "Prévoyance professionnelle (LPP)",
    "Occupational pension (LPP)",
  ],
  lppHelp: [
    "Recopiez les montants mensuels du décompte de la caisse de pension. Ils ne sont pas réduits automatiquement pour un mois incomplet.",
    "Copy monthly amounts from the pension fund statement. They are not automatically reduced for a partial month.",
  ],
  advanced: [
    "Situations particulières et exceptions",
    "Special cases and exceptions",
  ],
  futureTerms: [
    "Prévoir un changement de salaire ou de contrat",
    "Schedule a salary or contract change",
  ],
  futureHelp: [
    "Les anciennes conditions sont conservées. Choisissez un mois sans fiche déjà préparée.",
    "Previous terms are preserved. Choose a month without a prepared payslip.",
  ],
  summaryHelp: [
    "Vérifiez les informations avant d’enregistrer. Vous pourrez les compléter ensuite.",
    "Review the details before saving. You can complete them later.",
  ],
  insuranceMissing: [
    "La prévoyance est à compléter avant de valider une fiche. Vous pouvez enregistrer cet employé maintenant.",
    "Pension amounts must be completed before issuing a payslip. You can save this employee now.",
  ],
  addressMissing: [
    "Complétez l’adresse, le NPA et la localité avant de générer une fiche définitive.",
    "Complete the address, postcode and city before issuing a payslip.",
  ],
  notEntered: ["Non renseigné", "Not entered"],
  invalidAvs: [
    "Vérifiez les 13 chiffres du numéro AVS sur la carte d’assurance ou le certificat AVS. Le numéro saisi n’est pas valide.",
    "Check the 13-digit OASI number on the insurance card or certificate. The entered number is not valid.",
  ],
  invalidIban: [
    "Vérifiez l’IBAN sur les coordonnées bancaires de l’employé. Le numéro saisi n’est pas valide.",
    "Check the IBAN against the employee’s bank details. The entered number is not valid.",
  ],
  identityRequired: [
    "Renseignez le prénom, le nom et la date de naissance.",
    "Enter first name, last name and date of birth.",
  ],
  activityError: [
    "Le taux d’activité doit être supérieur à 0 et ne pas dépasser 100 %.",
    "Employment level must be above 0 and no more than 100%.",
  ],
  monthlyWorkflow: ["Le parcours du mois", "Monthly workflow"],
  workflowPrepare: ["Préparer", "Prepare"],
  workflowCheck: ["Compléter et vérifier", "Complete and review"],
  workflowPdf: ["Générer les PDF", "Generate PDFs"],
  workflowPay: ["Suivre les paiements", "Track payments"],
  enterHours: ["Saisir les heures", "Enter hours"],
  completePayslip: ["Compléter la fiche", "Complete payslip"],
  reviewPayslip: ["Vérifier la fiche", "Review payslip"],
  recordPayment: ["Enregistrer le paiement", "Record payment"],
  viewPayslip: ["Voir la fiche et le PDF", "View payslip and PDF"],
  previousMonths: ["Compléter les mois précédents", "Complete earlier months"],
  nextAction: ["Prochaine action", "Next action"],
  prepareHelp: [
    "Crée les fiches manquantes pour les personnes sous contrat ce mois. Les fiches existantes sont conservées.",
    "Creates missing payslips for people employed this month. Existing payslips are preserved.",
  ],
  noEmployeesMonth: [
    "Ajoutez votre premier employé pour préparer les salaires.",
    "Add your first employee to prepare payroll.",
  ],
  noEligible: [
    "Aucun employé à préparer pour ce mois. Vérifiez les dates du contrat et le début des conditions salariales.",
    "No employee to prepare for this month. Check employment dates and the start of salary terms.",
  ],
  exportBlocked: [
    "Les PDF seront disponibles lorsque toutes les fiches du mois seront validées et à jour.",
    "PDFs will be available when all payslips for this month are confirmed and up to date.",
  ],
  monthlyFirstHelp: [
    "Commencez par le premier mois travaillé de l’année. Les mois précédents doivent être validés pour calculer les cumuls.",
    "Start with the first month worked in the year. Earlier months must be confirmed for cumulative calculations.",
  ],
  resolveSettings: [
    "Ouvrir les réglages de l’entreprise",
    "Open company settings",
  ],
  earlierMissing: [
    "Pour calculer les cumuls, validez d’abord les fiches de ces mois :",
    "For cumulative calculations, confirm these earlier payslips first:",
  ],
  applyCurrent: [
    "Reprendre les informations et taux enregistrés",
    "Apply saved details and rates",
  ],
  annualSub: [
    "Consultez les totaux, exportez pour la comptabilité et préparez les certificats de salaire.",
    "Review totals, export for accounting and prepare salary certificates.",
  ],
  exportExcel: [
    "Exporter pour la comptabilité · Excel",
    "Export for accounting · Excel",
  ],
  certificate: [
    "Préparer un certificat de salaire",
    "Prepare a salary certificate",
  ],
  certificateSelect: [
    "Sélectionnez un employé pour préparer son certificat de salaire.",
    "Select an employee to prepare their salary certificate.",
  ],
  certificateReadyHelp: [
    "Vérifiez les mois et les mentions avant de générer le document.",
    "Review months and statements before generating the document.",
  ],
  annualNoData: [
    "Préparez les fiches mensuelles pour retrouver ici les totaux et les documents de l’année.",
    "Prepare monthly payslips to see annual totals and documents here.",
  ],
  correctionsNotice: [
    "Une correction conserve le PDF précédent. Après enregistrement, les mois suivants seront à revoir et tout paiement précédent sera à reconfirmer.",
    "A correction preserves the previous PDF. After saving, later months need review and any previous payment must be reconfirmed.",
  ],
  referenceAgeReview: [
    "Vérifiez le régime AVS dans Assurances → Situations particulières et exceptions.",
    "Review OASI status in Insurance → Special cases and exceptions.",
  ],
  savedDraftRules: [
    "Configuration enregistrée. Complétez et vérifiez les informations manquantes avant de valider des fiches.",
    "Configuration saved. Complete and verify missing details before issuing payslips.",
  ],
};
