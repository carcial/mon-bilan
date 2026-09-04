/**
 * Excel workbook structure — one domain per workbook.
 * Values are precomputed by canonical calc helpers; this file only layouts cells.
 */

import { formatNumericDateFr } from "./dates.js";
import {
  EMPTY_PERIOD_MESSAGE,
  TECHNICAL_ID_HEADER,
  excelFilename as buildExcelFilename,
  historyTypeLabel,
  mapArrivalExportRows,
  mapPayableExportRows,
  mapReceivableExportRows,
  mapSaleExportRows,
  mapStockExportRows,
  pickChurchFund,
  churchFundPeriodTotals,
  snapshotStateNote,
} from "./excel-export-map.js";
import { formatFcfa } from "./money.js";
import { toFcfaInteger } from "./money.js";

export const CHURCH_EXCEL_SHEETS = [
  "Résumé",
  "Entrées",
  "Sorties",
  "Caisses",
  "Vérifications de caisse",
  "Historique",
];

export const BUSINESS_EXCEL_SHEETS = [
  "Résumé",
  "Ventes",
  "Paiements clients",
  "Clients à recevoir",
  "Arrivages",
  "Paiements fournisseurs",
  "Fournisseurs à payer",
  "Dépenses",
  "Stock",
  "Clients",
  "Fournisseurs",
];

/** @deprecated Combined list kept for older tests; new exports are domain-scoped. */
export const EXCEL_SHEET_NAMES = [...CHURCH_EXCEL_SHEETS, ...BUSINESS_EXCEL_SHEETS.slice(1)];

export function moneyCell(value) {
  return { kind: "money", value: Number(value) || 0 };
}

export function textCell(value) {
  return { kind: "text", value: value == null || value === "" ? "—" : String(value) };
}

export function dateCell(value) {
  if (!value || value === "—") return { kind: "text", value: "—" };
  return { kind: "date", value: String(value).slice(0, 10) };
}

export function intCell(value) {
  return { kind: "int", value: Number(value) || 0 };
}

function optionalMoneyCell(value) {
  if (value == null || value === "") return textCell("—");
  return moneyCell(value);
}

function technicalIdCell(id) {
  if (id == null || id === "") return textCell("—");
  return { kind: "text", value: String(id) };
}

function withTechnicalId(headers, rows, totals, ids) {
  return {
    headers: [...headers, TECHNICAL_ID_HEADER],
    rows: rows.map((row, index) => [...row, technicalIdCell(ids[index])]),
    totals: totals ? [...totals, textCell("")] : null,
  };
}

function tableSheet(name, headers, rows, options = {}) {
  const empty = !rows.length;
  const ids = options.ids || [];
  const withIds = options.technicalIds === false
    ? { headers, rows, totals: options.totals || null }
    : withTechnicalId(headers, empty ? [] : rows, empty ? null : options.totals || null, ids);
  return {
    name,
    kind: "table",
    title: options.title || name,
    headers: withIds.headers,
    rows: empty ? [] : withIds.rows,
    emptyText: options.emptyText || EMPTY_PERIOD_MESSAGE,
    totals: empty ? null : withIds.totals,
    note: options.note || "",
    banner: options.banner || "",
    snapshot: Boolean(options.snapshot),
    hideTechnicalId: options.technicalIds !== false,
  };
}

function emptyDomainData() {
  return {
    church: {
      incomeTotal: 0,
      expenseTotal: 0,
      variation: 0,
      endingBalance: 0,
      lastReconciliationDifference: null,
      byFund: [],
    },
    business: {
      revenue: 0,
      cogs: 0,
      operatingExpenses: 0,
      estimatedProfit: 0,
      receivablesTotal: 0,
      payablesTotal: 0,
      stockUnits: 0,
    },
    churchIncome: [],
    churchExpense: [],
    churchFunds: [],
    churchReconciliations: [],
    churchHistory: [],
    sales: [],
    customerPayments: [],
    arrivals: [],
    supplierPayments: [],
    receivables: [],
    payables: [],
    customers: [],
    suppliers: [],
    expenses: [],
    stock: [],
    arrivalInventory: [],
    allArrivals: [],
  };
}

/**
 * @param {object} data
 * @param {'church'|'business'} [domain]
 */
export function buildExcelWorkbookData(data, domain = "business") {
  const merged = { ...emptyDomainData(), ...data };
  if (data?.church) {
    merged.church = { ...emptyDomainData().church, ...data.church };
  }
  if (data?.business) {
    merged.business = { ...emptyDomainData().business, ...data.business };
  }
  const rangeLabel =
    merged.periodLabel ||
    (merged.range?.from && merged.range?.to
      ? `${formatNumericDateFr(merged.range.from)} → ${formatNumericDateFr(merged.range.to)}`
      : "");
  return {
    filename: buildExcelFilename(
      merged.range?.from,
      merged.range?.to,
      domain,
      merged.periodKind || merged.period || "",
    ),
    domain,
    sheets:
      domain === "church"
        ? churchSheets(merged, rangeLabel)
        : businessSheets(merged, rangeLabel),
  };
}

function summaryItem(label, cell, emphasize = false) {
  return { label, cell, emphasize };
}

function summaryRowsFromSections(sections) {
  return sections.flatMap((section) =>
    section.items.map((item) => [textCell(item.label), item.cell]),
  );
}

function churchSheets(data, rangeLabel) {
  const byFund = data.church.byFund || [];
  const ordinary = churchFundPeriodTotals(
    pickChurchFund(byFund, /ordinaire|ordinary|principale/i) || data.church.ordinary,
  );
  const works = churchFundPeriodTotals(
    pickChurchFund(byFund, /travaux|works|œuvre|oeuvre/i) || data.church.works,
  );

  const sections = [
    {
      title: "Ordinaire",
      items: [
        summaryItem("Ordinaire — Entrées", moneyCell(ordinary.incomeTotal)),
        summaryItem("Ordinaire — Sorties", moneyCell(ordinary.expenseTotal)),
        summaryItem("Ordinaire — Solde", moneyCell(ordinary.endingBalance), true),
      ],
    },
    {
      title: "Travaux",
      items: [
        summaryItem("Travaux — Entrées", moneyCell(works.incomeTotal)),
        summaryItem("Travaux — Sorties", moneyCell(works.expenseTotal)),
        summaryItem("Travaux — Solde", moneyCell(works.endingBalance), true),
      ],
    },
    {
      title: "Ensemble de l’église",
      items: [
        summaryItem("Entrées", moneyCell(data.church.incomeTotal), true),
        summaryItem("Sorties", moneyCell(data.church.expenseTotal), true),
        summaryItem("Variation", moneyCell(data.church.variation)),
        summaryItem("Solde", moneyCell(data.church.endingBalance), true),
        data.church.lastReconciliationDifference == null
          ? summaryItem("Dernier écart de caisse", textCell("Aucune vérification"))
          : summaryItem(
              "Dernier écart de caisse",
              moneyCell(data.church.lastReconciliationDifference),
            ),
      ],
    },
  ];

  const incomeRows = (data.churchIncome || []).map((row) => [
    dateCell(row.transaction_date),
    textCell(row.church_funds?.name || row.fundName),
    moneyCell(row.amount_fcfa ?? row.amount),
    textCell(row.reason),
    textCell(row.note),
    textCell(row.reference || shortOrDash(row.id)),
  ]);
  const expenseRows = (data.churchExpense || []).map((row) => [
    dateCell(row.transaction_date),
    textCell(row.church_funds?.name || row.fundName),
    moneyCell(row.amount_fcfa ?? row.amount),
    textCell(row.reason),
    textCell(row.note),
    textCell(row.reference || shortOrDash(row.id)),
  ]);
  const fundRows = (data.churchFunds || []).map((row) => [
    textCell(row.name || row.fund?.name),
    textCell(row.code || row.fund?.code),
    moneyCell(row.opening_balance_fcfa ?? row.openingBalance),
    moneyCell(row.incomeTotal),
    moneyCell(row.expenseTotal),
    moneyCell(row.endingBalance ?? row.balance),
    textCell(row.reference || shortOrDash(row.id || row.fund?.id)),
  ]);
  const reconRows = (data.churchReconciliations || []).map((row) => [
    dateCell(String(row.reconciled_at || "").slice(0, 10)),
    textCell(row.church_funds?.name || row.fundName || "Toutes les caisses"),
    moneyCell(row.theoretical_balance_fcfa),
    moneyCell(row.actual_cash_fcfa),
    moneyCell(row.difference_fcfa),
    textCell(row.note),
    textCell(row.reference || shortOrDash(row.id)),
  ]);
  const historyRows = (data.churchHistory || []).map((row) => [
    dateCell(row.date),
    textCell(historyTypeLabel(row.type) || row.typeLabel),
    textCell(row.subtitle || row.fundName),
    row.amount == null ? textCell("—") : moneyCell(row.amount),
    textCell(row.title || row.reason),
    textCell(row.note),
    textCell(row.reference || shortOrDash(row.sourceId || row.id)),
  ]);

  return [
    {
      name: "Résumé",
      kind: "summary",
      headers: ["Libellé", "Valeur"],
      workbookTitle: "Mon Bilan",
      reportTitle: "Rapport église",
      periodLabel: rangeLabel,
      generatedAt: data.generatedAt,
      sections,
      rows: summaryRowsFromSections(sections),
    },
    tableSheet(
      "Entrées",
      ["Date", "Caisse", "Montant FCFA", "Motif", "Note", "Référence"],
      incomeRows,
      {
        ids: (data.churchIncome || []).map((row) => row.id),
        totals: incomeRows.length
          ? [
              textCell("TOTAL ENTRÉES"),
              textCell(""),
              moneyCell(sumMoney(incomeRows, 2)),
              textCell(""),
              textCell(""),
              textCell(""),
            ]
          : null,
      },
    ),
    tableSheet(
      "Sorties",
      ["Date", "Caisse", "Montant FCFA", "Motif", "Note", "Référence"],
      expenseRows,
      {
        ids: (data.churchExpense || []).map((row) => row.id),
        totals: expenseRows.length
          ? [
              textCell("TOTAL SORTIES"),
              textCell(""),
              moneyCell(sumMoney(expenseRows, 2)),
              textCell(""),
              textCell(""),
              textCell(""),
            ]
          : null,
      },
    ),
    tableSheet(
      "Caisses",
      ["Caisse", "Code", "Solde d’ouverture", "Entrées période", "Sorties période", "Solde", "Référence"],
      fundRows,
      {
        ids: (data.churchFunds || []).map((row) => row.id || row.fund?.id),
        emptyText: "Aucune caisse enregistrée.",
        snapshot: true,
        note: "Soldes de fin de période — calcul canonique des caisses.",
      },
    ),
    tableSheet(
      "Vérifications de caisse",
      ["Date", "Caisse", "Théorique", "Compté", "Écart", "Note", "Référence"],
      reconRows,
      {
        ids: (data.churchReconciliations || []).map((row) => row.id),
      },
    ),
    tableSheet(
      "Historique",
      ["Date", "Type", "Caisse", "Montant FCFA", "Libellé", "Note", "Référence"],
      historyRows,
      {
        ids: (data.churchHistory || []).map((row) => row.sourceId || row.id),
      },
    ),
  ];
}

function businessSheets(data, rangeLabel) {
  const currentStateNote = snapshotStateNote(data.generatedAt);
  const sales = mapSaleExportRows(data.sales || [], data.remainderBySaleId || new Map());
  const saleRows = sales.map((row) => [
    dateCell(row.sale_date),
    textCell(row.reference),
    textCell(row.customerName),
    textCell(row.productName),
    textCell(row.lotLabel),
    intCell(row.quantity),
    optionalMoneyCell(row.saleUnitPrice),
    moneyCell(row.total),
    optionalMoneyCell(row.supplierUnitPrice),
    moneyCell(row.supplierAmount),
    moneyCell(row.margin),
    textCell(row.paymentStatus),
    moneyCell(row.paidImmediately),
    moneyCell(row.remaining),
    textCell(row.paymentMethod),
    textCell(row.dueType),
    textCell(row.dueLabel),
    textCell(row.note),
  ]);

  const paymentRows = (data.customerPayments || []).map((row) => [
    dateCell(row.payment_date || row.date),
    textCell(row.customerName || row.customers?.name),
    moneyCell(row.amount_fcfa ?? row.amount),
    textCell(row.paymentMethodLabel || row.payment_method || "—"),
    textCell(row.saleReference || "—"),
    row.previousOutstanding == null ? textCell("—") : moneyCell(row.previousOutstanding),
    row.remainingAfter == null ? textCell("—") : moneyCell(row.remainingAfter),
    textCell(row.note),
    textCell(row.reference || shortOrDash(row.id)),
  ]);

  const receivables = mapReceivableExportRows(data.receivables || []);
  const receivableRows = receivables.map((row) => [
    textCell(row.name),
    moneyCell(row.purchases),
    moneyCell(row.paid),
    moneyCell(row.outstanding),
    dateCell(row.oldestUnpaidSale),
    textCell(row.dueLabel),
    textCell(row.dueStatus),
    textCell(row.phone),
    textCell(row.note),
  ]);

  const arrivals = mapArrivalExportRows(data.arrivals || [], data.supplierPaymentsAll || []);
  const arrivalRows = arrivals.map((row) => [
    dateCell(row.arrival_date),
    textCell(row.reference),
    textCell(row.supplierName),
    textCell(row.productName),
    intCell(row.quantity_received),
    moneyCell(row.supplier_unit_price_fcfa),
    moneyCell(row.merchandise),
    moneyCell(row.transport_fcfa),
    moneyCell(row.unloading_fcfa),
    moneyCell(row.other_expenses_fcfa),
    textCell(row.expensesOwedToSupplier ? "Oui" : "Non"),
    moneyCell(row.advance_paid_fcfa),
    moneyCell(row.remaining),
    textCell(row.note),
  ]);

  const supplierPaymentRows = (data.supplierPayments || []).map((row) => [
    dateCell(row.payment_date || row.date),
    textCell(row.supplierName || row.suppliers?.name),
    moneyCell(row.amount_fcfa ?? row.amount),
    textCell(row.paymentMethodLabel || row.payment_method || "—"),
    textCell(row.arrivalReference || "—"),
    textCell(row.note),
    textCell(row.reference || shortOrDash(row.id)),
  ]);

  const payables = mapPayableExportRows(data.payables || []);
  const payableRows = payables.map((row) => [
    textCell(row.name),
    moneyCell(row.merchandise),
    moneyCell(row.feesOwed),
    moneyCell(row.obligation),
    moneyCell(row.paid),
    moneyCell(row.outstanding),
    intCell(row.arrivalCount),
  ]);

  const expenseRows = (data.expenses || []).map((row) => [
    dateCell(row.date || row.expense_date),
    textCell(row.category),
    textCell(row.reason || row.description),
    moneyCell(row.amount ?? row.amount_fcfa),
    textCell(row.relatedLabel || "—"),
    textCell(row.note),
    textCell(row.reference || shortOrDash(row.id)),
  ]);

  const stockSource = (data.stock || []).some((row) => row.lotLabel || row.arrival_date)
    ? data.stock
    : mapStockExportRows(data.allArrivals || [], data.arrivalInventory || [], data.stock || []);
  const stockRows = stockSource.map((row) => [
    textCell(row.productName || row.product_name),
    textCell(row.lotLabel || "—"),
    textCell(row.supplierName || "—"),
    dateCell(row.arrival_date),
    intCell(row.quantity_received),
    intCell(row.quantity_sold),
    intCell(row.quantity_adjustments),
    intCell(row.quantity_available),
    optionalMoneyCell(row.supplier_unit_price_fcfa),
    textCell(row.unit_type || "sac"),
  ]);

  const customerRows = (data.customers || []).map((row) => [
    textCell(row.name),
    textCell(row.phone),
    textCell(row.note),
    moneyCell(row.purchases),
    moneyCell(row.paid),
    moneyCell(row.outstanding),
  ]);

  const supplierRows = (data.suppliers || []).map((row) => [
    textCell(row.name),
    textCell(row.phone),
    textCell(row.note),
    moneyCell(row.merchandise),
    moneyCell(row.paid),
    moneyCell(row.outstanding),
  ]);

  const biz = data.business;
  const sections = [
    {
      title: "Résultat de la période",
      items: [
        summaryItem("Chiffre d'affaires", moneyCell(biz.revenue), true),
        summaryItem("Montant fournisseur (quantité vendue)", moneyCell(biz.cogs)),
        summaryItem(
          "Marge estimée",
          moneyCell(biz.grossMargin ?? toFcfaInteger(biz.revenue) - toFcfaInteger(biz.cogs)),
          true,
        ),
        summaryItem("Dépenses", moneyCell(biz.operatingExpenses)),
        summaryItem("Bénéfice estimé", moneyCell(biz.estimatedProfit), true),
      ],
    },
    {
      title: "Encaissements et créances",
      items: [
        summaryItem("Paiements reçus", moneyCell(biz.cashCollected), true),
        summaryItem("À recevoir (état actuel)", moneyCell(biz.receivablesTotal), true),
      ],
    },
    {
      title: "Dettes et stock",
      items: [
        summaryItem("À payer (état actuel)", moneyCell(biz.payablesTotal), true),
        summaryItem("Stock (unités actuelles)", intCell(biz.stockUnits), true),
      ],
    },
  ];

  return [
    {
      name: "Résumé",
      kind: "summary",
      headers: ["Libellé", "Valeur"],
      workbookTitle: "Mon Bilan",
      reportTitle: "Rapport commerce",
      periodLabel: rangeLabel,
      generatedAt: data.generatedAt,
      sections,
      rows: summaryRowsFromSections(sections),
    },
    tableSheet(
      "Ventes",
      [
        "Date",
        "Référence",
        "Client",
        "Produit",
        "Lot / arrivage",
        "Quantité",
        "Prix de vente / unité",
        "Total vente",
        "Montant fournisseur / unité",
        "Montant fournisseur vendu",
        "Marge",
        "Statut paiement",
        "Payé immédiatement",
        "Reste dû",
        "Mode de paiement",
        "Type d’échéance",
        "Échéance",
        "Note",
      ],
      saleRows,
      {
        ids: sales.map((row) => row.id),
        totals: saleRows.length
          ? [
              textCell("TOTAL VENTES"),
              textCell(""),
              textCell(""),
              textCell(""),
              textCell(""),
              intCell(sales.reduce((sum, row) => sum + toFcfaInteger(row.quantity), 0)),
              textCell(""),
              moneyCell(sales.reduce((sum, row) => sum + toFcfaInteger(row.total), 0)),
              textCell(""),
              moneyCell(sales.reduce((sum, row) => sum + toFcfaInteger(row.supplierAmount), 0)),
              moneyCell(sales.reduce((sum, row) => sum + toFcfaInteger(row.margin), 0)),
              textCell(""),
              moneyCell(sales.reduce((sum, row) => sum + toFcfaInteger(row.paidImmediately), 0)),
              moneyCell(sales.reduce((sum, row) => sum + toFcfaInteger(row.remaining), 0)),
              textCell(""),
              textCell(""),
              textCell(""),
              textCell(""),
            ]
          : null,
      },
    ),
    tableSheet(
      "Paiements clients",
      [
        "Date",
        "Client",
        "Montant reçu",
        "Mode de paiement",
        "Vente liée",
        "Dû avant paiement",
        "Reste après paiement",
        "Note",
        "Référence",
      ],
      paymentRows,
      {
        ids: (data.customerPayments || []).map((row) => row.id),
        totals: paymentRows.length
          ? [
              textCell("TOTAL PAIEMENTS"),
              textCell(""),
              moneyCell(sumMoney(paymentRows, 2)),
              textCell(""),
              textCell(""),
              textCell(""),
              textCell(""),
              textCell(""),
              textCell(""),
            ]
          : null,
      },
    ),
    tableSheet(
      "Clients à recevoir",
      [
        "Client",
        "Total achats",
        "Total payé",
        "Reste dû",
        "Plus ancienne vente impayée",
        "Échéance prévue",
        "Statut d’échéance",
        "Téléphone",
        "Note",
      ],
      receivableRows,
      {
        ids: receivables.map((row) => row.id),
        snapshot: true,
        banner: currentStateNote,
        note: currentStateNote,
        emptyText: "Aucune créance client actuellement.",
        totals: receivableRows.length
          ? [
              textCell("TOTAL À RECEVOIR"),
              moneyCell(sumMoney(receivableRows, 1)),
              moneyCell(sumMoney(receivableRows, 2)),
              moneyCell(sumMoney(receivableRows, 3)),
              textCell(""),
              textCell(""),
              textCell(""),
              textCell(""),
              textCell(""),
            ]
          : null,
      },
    ),
    tableSheet(
      "Arrivages",
      [
        "Date",
        "Référence",
        "Fournisseur",
        "Produit",
        "Quantité reçue",
        "Montant fournisseur / unité",
        "Marchandise",
        "Transport",
        "Déchargement",
        "Autres frais",
        "Frais dus au fournisseur",
        "Avance versée",
        "Reste fournisseur",
        "Note",
      ],
      arrivalRows,
      {
        ids: arrivals.map((row) => row.id),
        totals: arrivalRows.length
          ? [
              textCell("TOTAL ARRIVAGES"),
              textCell(""),
              textCell(""),
              textCell(""),
              intCell(arrivals.reduce((sum, row) => sum + toFcfaInteger(row.quantity_received), 0)),
              textCell(""),
              moneyCell(arrivals.reduce((sum, row) => sum + toFcfaInteger(row.merchandise), 0)),
              moneyCell(arrivals.reduce((sum, row) => sum + toFcfaInteger(row.transport_fcfa), 0)),
              moneyCell(arrivals.reduce((sum, row) => sum + toFcfaInteger(row.unloading_fcfa), 0)),
              moneyCell(arrivals.reduce((sum, row) => sum + toFcfaInteger(row.other_expenses_fcfa), 0)),
              textCell(""),
              moneyCell(arrivals.reduce((sum, row) => sum + toFcfaInteger(row.advance_paid_fcfa), 0)),
              moneyCell(arrivals.reduce((sum, row) => sum + toFcfaInteger(row.remaining), 0)),
              textCell(""),
            ]
          : null,
      },
    ),
    tableSheet(
      "Paiements fournisseurs",
      ["Date", "Fournisseur", "Montant versé", "Mode de paiement", "Arrivage lié", "Note", "Référence"],
      supplierPaymentRows,
      {
        ids: (data.supplierPayments || []).map((row) => row.id),
        totals: supplierPaymentRows.length
          ? [
              textCell("TOTAL PAIEMENTS"),
              textCell(""),
              moneyCell(sumMoney(supplierPaymentRows, 2)),
              textCell(""),
              textCell(""),
              textCell(""),
              textCell(""),
            ]
          : null,
      },
    ),
    tableSheet(
      "Fournisseurs à payer",
      [
        "Fournisseur",
        "Marchandise reçue",
        "Frais dus au fournisseur",
        "Obligation totale",
        "Déjà payé",
        "Reste à payer",
        "Nombre d’arrivages",
      ],
      payableRows,
      {
        ids: payables.map((row) => row.id),
        snapshot: true,
        banner: currentStateNote,
        note: currentStateNote,
        emptyText: "Aucune dette fournisseur actuellement.",
        totals: payableRows.length
          ? [
              textCell("TOTAL À PAYER"),
              moneyCell(sumMoney(payableRows, 1)),
              moneyCell(sumMoney(payableRows, 2)),
              moneyCell(sumMoney(payableRows, 3)),
              moneyCell(sumMoney(payableRows, 4)),
              moneyCell(sumMoney(payableRows, 5)),
              textCell(""),
            ]
          : null,
      },
    ),
    tableSheet(
      "Dépenses",
      ["Date", "Catégorie", "Motif", "Montant FCFA", "Arrivage lié", "Note", "Référence"],
      expenseRows,
      {
        ids: (data.expenses || []).map((row) => row.id),
        totals: expenseRows.length
          ? [
              textCell("TOTAL DÉPENSES"),
              textCell(""),
              textCell(""),
              moneyCell(sumMoney(expenseRows, 3)),
              textCell(""),
              textCell(""),
              textCell(""),
            ]
          : null,
      },
    ),
    tableSheet(
      "Stock",
      [
        "Produit",
        "Arrivage / lot",
        "Fournisseur",
        "Date reçue",
        "Quantité reçue",
        "Quantité vendue",
        "Ajustements",
        "Disponible",
        "Montant fournisseur / unité",
        "Unité",
      ],
      stockRows,
      {
        ids: stockSource.map((row) => row.id),
        snapshot: true,
        banner: currentStateNote,
        note: currentStateNote,
        emptyText: "Aucun stock enregistré.",
      },
    ),
    tableSheet(
      "Clients",
      ["Nom", "Téléphone", "Note", "Total achats", "Total payé", "Reste dû"],
      customerRows,
      {
        ids: (data.customers || []).map((row) => row.id),
        snapshot: true,
        emptyText: "Aucun client enregistré.",
        note: "Fiche clients — utile comme sauvegarde manuelle.",
      },
    ),
    tableSheet(
      "Fournisseurs",
      ["Nom", "Téléphone", "Note", "Marchandise", "Total payé", "Reste dû"],
      supplierRows,
      {
        ids: (data.suppliers || []).map((row) => row.id),
        snapshot: true,
        emptyText: "Aucun fournisseur enregistré.",
        note: "Fiche fournisseurs — utile comme sauvegarde manuelle.",
      },
    ),
  ];
}

function sumMoney(rows, index) {
  return rows.reduce((sum, row) => {
    const cell = row[index];
    if (!cell || cell.kind !== "money") return sum;
    return sum + (Number(cell.value) || 0);
  }, 0);
}

function shortOrDash(id) {
  if (!id) return "—";
  const raw = String(id).replace(/-/g, "");
  return raw.length >= 8 ? raw.slice(0, 8).toUpperCase() : raw.toUpperCase();
}

export function excelFilename(from, to, domain = "business", periodKind = "") {
  return buildExcelFilename(from, to, domain, periodKind);
}

export function formatSheetMoneyPreview(value) {
  return formatFcfa(value);
}

export function summaryValue(workbook, label) {
  const resume = workbook?.sheets?.[0];
  const row = (resume?.rows || []).find((cells) => cells[0]?.value === label);
  return row?.[1]?.value;
}
