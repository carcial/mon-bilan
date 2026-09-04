/**
 * Browser / Node Excel writer using ExcelJS (loaded only when exporting).
 */

import { parseLocalDate } from "./dates.js";

async function loadExcelJS() {
  const mod = await import("exceljs");
  return mod.default || mod.ExcelJS || mod;
}

const COLORS = {
  orange: "FFF28C28",
  orangeStrong: "FFE07B18",
  orangeSoft: "FFFFF5EA",
  orangeTint: "FFFFE8CC",
  zebra: "FFFFF9F3",
  white: "FFFFFFFF",
  text: "FF1F1B16",
  muted: "FF6B6560",
  border: "FFE8E2DA",
  borderStrong: "FFD6CFC4",
};

const FONTS = {
  title: { name: "Calibri", size: 20, bold: true, color: { argb: COLORS.orange } },
  subtitle: { name: "Calibri", size: 14, bold: true, color: { argb: COLORS.text } },
  section: { name: "Calibri", size: 12, bold: true, color: { argb: COLORS.white } },
  label: { name: "Calibri", size: 11, color: { argb: COLORS.text } },
  emphasizeLabel: { name: "Calibri", size: 13, bold: true, color: { argb: COLORS.text } },
  emphasizeValue: { name: "Calibri", size: 14, bold: true, color: { argb: COLORS.text } },
  header: { name: "Calibri", size: 11, bold: true, color: { argb: COLORS.white } },
  body: { name: "Calibri", size: 11, color: { argb: COLORS.text } },
  total: { name: "Calibri", size: 11, bold: true, color: { argb: COLORS.text } },
  empty: { name: "Calibri", size: 11, italic: true, color: { argb: COLORS.muted } },
  note: { name: "Calibri", size: 10, italic: true, color: { argb: COLORS.muted } },
  meta: { name: "Calibri", size: 11, color: { argb: COLORS.muted } },
};

export const MONEY_FORMAT = '#,##0 "FCFA"';
export const DATE_FORMAT = "DD/MM/YYYY";
const INT_FORMAT = "0";

const thinBorder = {
  style: "thin",
  color: { argb: COLORS.borderStrong },
};

function boxBorder() {
  return {
    top: thinBorder,
    left: thinBorder,
    bottom: thinBorder,
    right: thinBorder,
  };
}

function fillArgb(argb) {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function applyCell(excelCell, cell) {
  if (!cell) {
    excelCell.value = "";
    return;
  }
  if (cell.kind === "money") {
    excelCell.value = Number(cell.value) || 0;
    excelCell.numFmt = MONEY_FORMAT;
    return;
  }
  if (cell.kind === "int") {
    excelCell.value = Number(cell.value) || 0;
    excelCell.numFmt = INT_FORMAT;
    return;
  }
  if (cell.kind === "date") {
    const parsed = parseLocalDate(cell.value);
    if (parsed) {
      excelCell.value = parsed;
      excelCell.numFmt = DATE_FORMAT;
      return;
    }
    excelCell.value = cell.value || "—";
    return;
  }
  excelCell.value = cell.value;
}

function applyRangeBorder(sheet, startRow, endRow, startCol, endCol) {
  for (let r = startRow; r <= endRow; r += 1) {
    for (let c = startCol; c <= endCol; c += 1) {
      sheet.getCell(r, c).border = boxBorder();
    }
  }
}

function writeSummarySheet(sheet, spec) {
  sheet.views = [{ state: "frozen", ySplit: 2, showGridLines: false }];
  sheet.getColumn(1).width = 44;
  sheet.getColumn(2).width = 24;

  sheet.getCell("A1").value = spec.workbookTitle || "Mon Bilan";
  sheet.getCell("A1").font = FONTS.title;
  sheet.getRow(1).height = 28;

  sheet.getCell("A2").value = spec.reportTitle || spec.name;
  sheet.getCell("A2").font = FONTS.subtitle;
  sheet.getRow(2).height = 20;

  sheet.getCell("A4").value = "Période";
  sheet.getCell("A4").font = FONTS.meta;
  sheet.getCell("B4").value = spec.periodLabel || "—";
  sheet.getCell("B4").font = FONTS.body;

  sheet.getCell("A5").value = "Fichier généré le";
  sheet.getCell("A5").font = FONTS.meta;
  sheet.getCell("B5").value = spec.generatedAt || "—";
  sheet.getCell("B5").font = FONTS.body;

  let row = 7;
  for (const section of spec.sections || []) {
    const start = row;
    const titleCell = sheet.getCell(row, 1);
    titleCell.value = section.title;
    titleCell.font = FONTS.section;
    titleCell.fill = fillArgb(COLORS.orange);
    titleCell.alignment = { vertical: "middle" };
    sheet.getCell(row, 2).fill = fillArgb(COLORS.orange);
    sheet.getRow(row).height = 20;
    row += 1;

    for (const item of section.items || []) {
      const labelCell = sheet.getCell(row, 1);
      const valueCell = sheet.getCell(row, 2);
      labelCell.value = item.label;
      labelCell.font = item.emphasize ? FONTS.emphasizeLabel : FONTS.label;
      applyCell(valueCell, item.cell);
      valueCell.font = item.emphasize ? FONTS.emphasizeValue : FONTS.body;
      if (item.emphasize) {
        labelCell.fill = fillArgb(COLORS.orangeSoft);
        valueCell.fill = fillArgb(COLORS.orangeSoft);
      }
      sheet.getRow(row).height = item.emphasize ? 22 : 18;
      row += 1;
    }

    applyRangeBorder(sheet, start, row - 1, 1, 2);
    row += 1;
  }
}

function headerWidth(header) {
  const text = String(header || "");
  if (/note/i.test(text)) return 36;
  if (/identifiant technique/i.test(text)) return 38;
  if (/référence|reference/i.test(text)) return 14;
  if (/motif|libellé|produit|client|fournisseur|arrivage|échéance|lot/i.test(text)) return 26;
  if (/montant|marché|théorique|compté|reste|achats|payé|vente|obligation|marchandise/i.test(text)) {
    return 20;
  }
  if (/date/i.test(text)) return 14;
  if (/quantité|unité|nombre/i.test(text)) return 14;
  return 16;
}

function writeTableSheet(sheet, spec) {
  const hasTitle = Boolean(spec.title);
  const hasBanner = Boolean(spec.banner);
  let headerRowNumber = 1;
  if (hasTitle) headerRowNumber += 1;
  if (hasBanner) headerRowNumber += 1;
  sheet.views = [{ state: "frozen", ySplit: headerRowNumber, showGridLines: true }];

  if (hasTitle) {
    const titleRow = sheet.getRow(1);
    const titleCell = titleRow.getCell(1);
    titleCell.value = spec.title;
    titleCell.font = FONTS.subtitle;
    titleRow.height = 22;
  }

  if (hasBanner) {
    const bannerRowNumber = hasTitle ? 2 : 1;
    const bannerRow = sheet.getRow(bannerRowNumber);
    const bannerCell = bannerRow.getCell(1);
    bannerCell.value = spec.banner;
    bannerCell.font = FONTS.note;
    bannerCell.alignment = { wrapText: true, vertical: "middle" };
    bannerRow.height = 32;
  }

  const headerRow = sheet.getRow(headerRowNumber);
  spec.headers.forEach((header, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = header;
    cell.font = FONTS.header;
    cell.fill = fillArgb(COLORS.orange);
    cell.alignment = { vertical: "middle", wrapText: true };
    cell.border = boxBorder();
    sheet.getColumn(index + 1).width = headerWidth(header);
    if (/note/i.test(header)) {
      sheet.getColumn(index + 1).alignment = { wrapText: true, vertical: "top" };
    }
  });
  headerRow.height = 24;

  if (spec.hideTechnicalId && spec.headers.length) {
    sheet.getColumn(spec.headers.length).hidden = true;
  }

  let cursor = headerRowNumber + 1;
  if (!spec.rows?.length) {
    const emptyRow = sheet.getRow(cursor);
    emptyRow.getCell(1).value = spec.emptyText || "Aucune donnée pour cette période.";
    emptyRow.getCell(1).font = FONTS.empty;
    emptyRow.height = 20;
    cursor += 1;
  } else {
    spec.rows.forEach((row, rowIndex) => {
      const excelRow = sheet.getRow(cursor);
      row.forEach((cell, index) => {
        const excelCell = excelRow.getCell(index + 1);
        applyCell(excelCell, cell);
        excelCell.font = FONTS.body;
        excelCell.border = boxBorder();
        excelCell.alignment = {
          vertical: "middle",
          wrapText: /note/i.test(spec.headers[index] || ""),
        };
        if (rowIndex % 2 === 1) {
          excelCell.fill = fillArgb(COLORS.zebra);
        }
      });
      excelRow.height = 18;
      cursor += 1;
    });
  }

  if (spec.totals?.length && spec.rows?.length) {
    const totalRow = sheet.getRow(cursor);
    spec.totals.forEach((cell, index) => {
      const excelCell = totalRow.getCell(index + 1);
      applyCell(excelCell, cell);
      excelCell.font = FONTS.total;
      excelCell.fill = fillArgb(COLORS.orangeTint);
      excelCell.border = boxBorder();
    });
    totalRow.height = 20;
    cursor += 1;
  }

  if (spec.note) {
    cursor += 1;
    const noteRow = sheet.getRow(cursor);
    noteRow.getCell(1).value = spec.note;
    noteRow.getCell(1).font = FONTS.note;
  }

  if (spec.headers.length && spec.rows?.length) {
    sheet.autoFilter = {
      from: { row: headerRowNumber, column: 1 },
      to: { row: headerRowNumber, column: spec.headers.length },
    };
  }
}

/**
 * @param {{ filename: string, sheets: Array<object> }} workbookData
 * @returns {Promise<{ filename: string, buffer: ArrayBuffer }>}
 */
export async function writeExcelBuffer(workbookData) {
  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Mon Bilan";
  workbook.created = new Date();

  for (const spec of workbookData.sheets) {
    const sheet = workbook.addWorksheet(spec.name);
    if (spec.kind === "summary") {
      writeSummarySheet(sheet, spec);
    } else {
      writeTableSheet(sheet, spec);
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return {
    filename: workbookData.filename,
    buffer,
  };
}

function isAppleTouchDevice() {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/i.test(navigator.userAgent || "") ||
    (navigator.platform === "MacIntel" && Number(navigator.maxTouchPoints) > 1)
  );
}

function canShareExcelFile(filename, blob) {
  if (!isAppleTouchDevice()) return false;
  if (typeof navigator === "undefined" || typeof File === "undefined") return false;
  if (typeof navigator.share !== "function") return false;
  try {
    const file = new File([blob], filename, { type: blob.type });
    return navigator.canShare ? navigator.canShare({ files: [file] }) : false;
  } catch {
    return false;
  }
}

export async function downloadExcelBuffer({ filename, buffer }) {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  if (canShareExcelFile(filename, blob)) {
    try {
      const file = new File([blob], filename, { type: blob.type });
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
  }

  if (typeof document === "undefined") return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
