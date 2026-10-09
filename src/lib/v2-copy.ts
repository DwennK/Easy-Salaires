export const v2Copy: Record<string, [string, string]> = {
  reimbursements: ["Remboursements de frais", "Expense reimbursements"],
  previousMonthsIncomplete: [
    "Complétez les mois précédents pour calculer les cumuls.",
    "Complete earlier months to calculate cumulative amounts.",
  ],
  pdfOutdated: ["PDF à actualiser", "PDF needs updating"],
  salaries: ["Les salaires", "Payroll"],
  salariesSub: [
    "Un employé, toute son année. Modifiez les montants, le reste se calcule.",
    "One employee, the whole year. Edit amounts and calculations follow.",
  ],
  payrollWorkspace: ["Votre espace de paie", "Your payroll workspace"],
  employeeInformation: ["Informations de l’employé", "Employee information"],
  previousYear: ["Année précédente", "Previous year"],
  nextYear: ["Année suivante", "Next year"],
  yearOverview: ["Vue annuelle", "Annual view"],
  netRecorded: ["Net des mois enregistrés", "Net for saved months"],
  paidRecorded: ["Paiements enregistrés", "Recorded payments"],
  annualEditingHelp: [
    "Cliquez sur un montant pour le modifier ou sur un mois pour voir le détail.",
    "Click an amount to edit or a month for details.",
  ],
  editableCells: ["Champs modifiables", "Editable fields"],
  yearTable: ["Salaires des douze mois", "Twelve-month payroll"],
  baseSalary: ["Salaire de base", "Base salary"],
  extras: ["Compléments", "Extras"],
  paidAmount: ["Montant payé", "Amount paid"],
  actions: ["Actions", "Actions"],
  forecast: ["Prévu", "Forecast"],
  pdfCreated: ["PDF créé", "PDF created"],
  recordPaymentShort: ["Enregistrer", "Record"],
  paymentDifference: ["Écart :", "Difference:"],
  configureYearFirst: [
    "Configurez les cotisations de cette année dans les paramètres.",
    "Configure contributions for this year in settings.",
  ],
  recordedTotals: ["Total enregistré", "Saved total"],
  monthsRecorded: ["mois · hors prévisions", "months · excluding forecasts"],
  forecastHelp: [
    "Les mois « Prévu » reprennent le salaire habituel. Ils entrent dans les totaux dès leur enregistrement. Les mois antérieurs nécessaires au calcul sont enregistrés automatiquement.",
    "Forecast months use the usual salary. Totals include saved months only. Earlier months needed for calculations are saved automatically.",
  ],
  startWithEmployee: [
    "Votre première année commence ici",
    "Your first year starts here",
  ],
  startWithEmployeeHelp: [
    "Ajoutez un employé pour retrouver ses douze mois dans un seul tableau.",
    "Add an employee to see all twelve months in one table.",
  ],
  bonusAmount: [
    "Prime / ajustement brut (CHF)",
    "Gross bonus / adjustment (CHF)",
  ],
  expensesAmount: [
    "Remboursement de frais (CHF)",
    "Expense reimbursement (CHF)",
  ],
  extrasHelp: [
    "La prime est soumise aux cotisations. Les frais saisis ici sont remboursés sans cotisations. Vérifiez leur nature avant de les saisir.",
    "The bonus is subject to contributions. Expenses entered here are reimbursed without contributions. Check their nature before entering them.",
  ],
  otherElementsPreserved: [
    "Les allocations, le 13e salaire et les autres éléments du mois restent conservés.",
    "Allowances, the 13th salary and other monthly items are preserved.",
  ],
  allMonthDetails: [
    "Ouvrir tous les détails du mois",
    "Open all monthly details",
  ],
  applyFollowing: ["Appliquer aux mois suivants", "Apply to following months"],
  followingHelp: [
    "Ce montant remplacera le salaire de base de ce mois et des mois suivants de cette année, y compris leurs exceptions. Les paiements et les PDF déjà émis sont conservés.",
    "This amount replaces the base salary for this month and following months of this year, including their overrides. Payments and original PDFs are preserved.",
  ],
  restoreSalary: ["Salaire habituel", "Usual salary"],
  clearPayment: ["Effacer la saisie du paiement", "Clear payment entry"],
  paymentBothRequired: [
    "Renseignez le montant payé et sa date.",
    "Enter the payment amount and its date.",
  ],
  globalContractHelp: [
    "Ces informations sont communes à tous les mois. Les montants personnalisés dans un mois restent conservés.",
    "These details are shared across months. Monthly overrides are preserved.",
  ],
  globalRulesHelp: [
    "Ces taux s’appliquent à toute l’année. Les montants se recalculent ; les paiements et les PDF originaux sont conservés.",
    "These rates apply to the whole year. Amounts recalculate; payments and original PDFs are preserved.",
  ],
  overrideHelpV2: [
    "Personnalisez uniquement les montants qui diffèrent pour cet employé. Les autres valeurs suivent les paramètres de l’entreprise.",
    "Customize only the amounts that differ for this employee. Other values follow company settings.",
  ],
  customRate: ["Personnalisé", "Custom"],
  inheritedRate: ["Entreprise", "Company"],
  emptyInherits: [
    "Vide = taux de l’entreprise. Saisissez 0 pour ne rien retenir.",
    "Blank = company rate. Enter 0 for no contribution.",
  ],
  restoreDefault: ["Reprendre les taux de l’entreprise", "Use company rates"],
  theme: ["Couleurs", "Colours"],
  themeHelp: [
    "Même interface, autre palette. Votre choix est conservé sur cet appareil.",
    "Same interface, another palette. Your choice is saved on this device.",
  ],
  kiwi: ["Kiwi", "Kiwi"],
  ocean: ["Océan", "Ocean"],
  lavender: ["Lavande", "Lavender"],
  terracotta: ["Terracotta", "Terracotta"],
  earlierMissing: [
    "Complétez les données des mois précédents nécessaires aux cumuls. Leurs PDF ne sont pas obligatoires.",
    "Complete earlier months needed for cumulative calculations. Their PDFs are not required.",
  ],
  correctionHelp: [
    "Les anciens PDF restent disponibles dans l’historique. Les paiements enregistrés sont conservés.",
    "Original PDFs remain in history. Recorded payments are preserved.",
  ],
  correctionsNotice: [
    "Modifier cette fiche recalcule les mois suivants. Les PDF originaux et les paiements sont conservés ; un écart de paiement sera signalé si nécessaire.",
    "Editing recalculates following months. Original PDFs and payments are preserved; payment differences are highlighted when needed.",
  ],
  monthOnlyHelp: [
    "Les changements dans ce panneau concernent uniquement ce mois. Modifiez la fiche employé pour changer les valeurs communes.",
    "Changes in this panel apply to this month only. Edit the employee for shared values.",
  ],
  applyCurrentHelp: [
    "Reprendre les conditions communes pour ce mois efface ses exceptions de contrat. Les heures, compléments et paiements restent conservés.",
    "Using shared terms for this month resets its contract overrides. Hours, extras and payments are preserved.",
  ],
  paymentReview: [
    "Le montant payé diffère du nouveau net calculé, ou le calcul est incomplet. Le paiement enregistré reste conservé.",
    "The recorded payment differs from the new net or the calculation is incomplete. The recorded payment is preserved.",
  ],
  monthlySub: [
    "Les salaires et paiements de tous les employés pour le mois choisi.",
    "Payroll and payments for all employees in the selected month.",
  ],
  companyContactHelp: [
    "Ces coordonnées sont communes à toutes les fiches. Les PDF déjà émis restent dans l’historique.",
    "These details are shared across payslips. Previously issued PDFs stay in history.",
  ],
  issueHelp: [
    "Le PDF conserve les informations de cette version. Vous pourrez toujours créer une version corrigée.",
    "The PDF preserves this version. You can always create a corrected version.",
  ],
  paymentHelp: [
    "Indiquez le paiement que vous avez effectué. Cette action ne fait aucun virement.",
    "Record a payment you have made. This action does not transfer money.",
  ],
  conditions: ["Conditions de ce mois", "Terms for this month"],
  debit: ["Débit", "Debit"],
  credit: ["Crédit", "Credit"],
  accountingDescription: [
    "Libellé · comptes à attribuer",
    "Description · account codes to assign",
  ],
  accounting: ["Pièce comptable", "Accounting statement"],
  accountingSub: [
    "Le récapitulatif du mois, prêt à transmettre à votre comptabilité.",
    "The monthly summary, ready for your accountant.",
  ],
  accountingExport: [
    "Exporter la pièce comptable (CSV)",
    "Export accounting statement (CSV)",
  ],
};
