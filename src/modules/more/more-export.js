import { bindDateFields, dateFieldHtml } from "../../components/date-field.js";
import { getExcelExportData } from "../../services/supabase/export.js";
import { getActiveDomain } from "../../state/app-mode.js";
import { downloadExcelBuffer, writeExcelBuffer } from "../../utils/excel-write.js";
import { escapeHtml, friendlyError } from "../../utils/errors.js";
import { getPeriodRange, periodLabelFr, PERIODS } from "../../utils/periods.js";
import { emptyStateHtml, errorStateHtml, pageHeaderHtml, skeletonHtml } from "./more-ui.js";

let exportPeriod = PERIODS.month;
let exportFrom = "";
let exportTo = "";
let exportStatus = "idle";

export function renderExcelExport(root) {
  root.innerHTML = `
    <section class="page more-page" aria-labelledby="more-title">
      ${pageHeaderHtml({
        kicker: "Plus",
        title: "Exporter Excel",
        subtitle:
          getActiveDomain() === "church"
            ? "Export de la trésorerie de l’église uniquement."
            : "Export du commerce uniquement.",
        backHref: "/plus/rapport",
        backLabel: "Retour au rapport",
        titleId: "more-title",
      })}
      <div data-role="filters">${periodFiltersHtml()}</div>
      <div data-role="body">${exportBodyHtml()}</div>
    </section>
  `;
  bind(root);
}

function periodFiltersHtml() {
  const buttons = [
    [PERIODS.week, "Cette semaine"],
    [PERIODS.month, "Ce mois"],
    [PERIODS.year, "Cette année"],
    [PERIODS.custom, "Personnalisée"],
  ];
  return `
    <div class="filter-panel stack-sm">
      <p class="filter-legend">Période</p>
      <div class="filter-row" role="group" aria-label="Période à exporter">
        ${buttons
          .map(
            ([value, label]) => `
          <button
            type="button"
            class="filter-chip${exportPeriod === value ? " is-active" : ""}"
            data-period="${value}"
            aria-pressed="${exportPeriod === value}"
          >${escapeHtml(label)}</button>
        `,
          )
          .join("")}
      </div>
      <div class="custom-period${exportPeriod === PERIODS.custom ? "" : " is-hidden"}" data-role="custom-period">
        ${dateFieldHtml({ id: "export-from", name: "from", label: "Date de début", value: exportFrom, dataRole: "from", defaultToday: false })}
        ${dateFieldHtml({ id: "export-to", name: "to", label: "Date de fin", value: exportTo, dataRole: "to", defaultToday: false })}
      </div>
    </div>
  `;
}

function exportBodyHtml() {
  if (exportStatus === "loading") {
    return `
      ${skeletonHtml(2)}
      <p class="field-hint" role="status">Préparation du fichier Excel…</p>
    `;
  }
  if (exportStatus === "success") {
    return `
      <div class="success-panel" role="status">
        <p class="success-title">Fichier Excel prêt</p>
        <p>Le téléchargement a commencé. Stock, créances et dettes sont l’état actuel.</p>
      </div>
      <button type="button" class="btn btn-primary btn-block" data-action="export">Générer à nouveau</button>
    `;
  }
  if (exportStatus === "error") {
    return errorStateHtml("Impossible de générer le fichier Excel. Réessayez.");
  }

  const range = getPeriodRange(exportPeriod, { from: exportFrom, to: exportTo });
  if (exportPeriod === PERIODS.custom && (!range.from || !range.to)) {
    return emptyStateHtml({
      title: "Choisissez une période.",
      body: "Indiquez une date de début et une date de fin.",
    });
  }

  return `
    <article class="card">
      <p class="home-metric-label">Période</p>
      <p class="metric-plain">${escapeHtml(periodLabelFr(exportPeriod, { from: range.from, to: range.to }))}</p>
      <p class="field-hint">
        ${
          getActiveDomain() === "church"
            ? "Entrées, sorties et vérifications de caisse de cette période."
            : "Les mouvements respectent cette période. Stock, à recevoir et à payer sont l’état actuel."
        }
      </p>
    </article>
    <button type="button" class="btn btn-primary btn-block" data-action="export">Générer le fichier Excel</button>
  `;
}

function bind(root) {
  const filtersEl = root.querySelector('[data-role="filters"]');
  const body = root.querySelector('[data-role="body"]');
  if (!filtersEl || !body) return;
  bindDateFields(filtersEl);

  filtersEl.querySelectorAll("[data-period]").forEach((btn) => {
    btn.addEventListener("click", () => {
      exportPeriod = btn.getAttribute("data-period") || PERIODS.month;
      exportStatus = "idle";
      filtersEl.innerHTML = periodFiltersHtml();
      body.innerHTML = exportBodyHtml();
      bind(root);
    });
  });

  filtersEl.querySelector('[data-role="from"]')?.addEventListener("change", (event) => {
    exportFrom = event.target.value;
    exportStatus = "idle";
    body.innerHTML = exportBodyHtml();
    bindExportButton(root);
  });
  filtersEl.querySelector('[data-role="to"]')?.addEventListener("change", (event) => {
    exportTo = event.target.value;
    exportStatus = "idle";
    body.innerHTML = exportBodyHtml();
    bindExportButton(root);
  });

  bindExportButton(root);
}

function bindExportButton(root) {
  const body = root.querySelector('[data-role="body"]');
  body?.querySelector('[data-action="export"]')?.addEventListener("click", () => generate(root));
  body?.querySelector('[data-action="retry"]')?.addEventListener("click", () => generate(root));
}

async function generate(root) {
  const body = root.querySelector('[data-role="body"]');
  const range = getPeriodRange(exportPeriod, { from: exportFrom, to: exportTo });
  if (exportPeriod === PERIODS.custom && (!range.from || !range.to)) return;

  exportStatus = "loading";
  if (body) body.innerHTML = exportBodyHtml();

  try {
    const workbookData = await getExcelExportData({
      ...range,
      periodLabel: periodLabelFr(exportPeriod, { from: range.from, to: range.to }),
      domain: getActiveDomain(),
    });
    const file = await writeExcelBuffer(workbookData);
    downloadExcelBuffer(file);
    exportStatus = "success";
  } catch (err) {
    console.warn("[export] excel failed", err);
    exportStatus = "error";
    if (body) {
      body.innerHTML = errorStateHtml(
        friendlyError(err).includes("erreur")
          ? "Impossible de générer le fichier Excel. Réessayez."
          : friendlyError(err),
      );
      bindExportButton(root);
      return;
    }
  }

  if (body) {
    body.innerHTML = exportBodyHtml();
    bindExportButton(root);
  }
}
