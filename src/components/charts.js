import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  Legend,
  LinearScale,
  Tooltip,
} from "chart.js";
import { formatFcfa, formatFcfaCompact } from "../utils/money.js";
import { startOfWeekMonday } from "../utils/periods.js";
import { toIsoDate } from "../utils/dates.js";
import { escapeHtml } from "../utils/errors.js";
import { seriesHasActivity, valuesHaveActivity } from "../utils/charts-data.js";

Chart.register(
  BarController,
  BarElement,
  DoughnutController,
  ArcElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
);

const instances = new WeakMap();

function cssVar(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function palette() {
  return {
    accent: cssVar("--accent", "#F28C28"),
    accentSoft: cssVar("--accent-soft", "#FFF5EA"),
    success: cssVar("--success", "#25835A"),
    danger: cssVar("--danger", "#B83A3A"),
    info: cssVar("--info", "#5E63D8"),
    muted: cssVar("--text-secondary", "#6B6560"),
    grid: cssVar("--border", "#E8E2DA"),
    text: cssVar("--text-primary", "#1F1B16"),
  };
}

function reduceMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function destroyChart(canvas) {
  const existing = instances.get(canvas);
  if (existing) {
    existing.destroy();
    instances.delete(canvas);
  }
}

function commonOptions() {
  const colors = palette();
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: reduceMotion() ? false : { duration: 220 },
    plugins: {
      legend: {
        display: true,
        position: "bottom",
        labels: {
          color: colors.muted,
          boxWidth: 10,
          boxHeight: 10,
          usePointStyle: true,
          pointStyle: "rectRounded",
          font: { size: 13, family: "Inter, ui-sans-serif, system-ui, sans-serif" },
          padding: 16,
        },
      },
      tooltip: {
        backgroundColor: colors.text,
        titleColor: "#fff",
        bodyColor: "#fff",
        padding: 10,
        cornerRadius: 10,
        callbacks: {
          label(ctx) {
            const value = Number(ctx.parsed.y ?? ctx.parsed);
            return ` ${formatFcfa(value)}`;
          },
        },
      },
    },
  };
}

export { seriesHasActivity, valuesHaveActivity };

export function showChartEmpty(canvas, message = "Aucune activité sur cette période.") {
  if (!canvas) return;
  destroyChart(canvas);
  const frame = canvas.closest(".chart-frame") || canvas.parentElement;
  if (frame) {
    frame.innerHTML = `<p class="field-hint chart-empty">${escapeHtml(message)}</p>`;
  }
}

/**
 * @param {HTMLCanvasElement | null} canvas
 * @param {{ labels: string[], series: Array<{ label: string, values: number[], color?: string }> }} data
 */
export function renderGroupedBarChart(canvas, data) {
  if (!canvas) return null;
  if (!seriesHasActivity(data?.series)) {
    showChartEmpty(canvas);
    return null;
  }
  destroyChart(canvas);
  const colors = palette();
  const fallback = [colors.accent, colors.info, colors.success];
  const chart = new Chart(canvas, {
    type: "bar",
    data: {
      labels: data.labels,
      datasets: data.series.map((serie, index) => ({
        label: serie.label,
        data: serie.values,
        backgroundColor: serie.color || fallback[index % fallback.length],
        borderRadius: 8,
        borderSkipped: false,
        maxBarThickness: 28,
      })),
    },
    options: {
      ...commonOptions(),
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: colors.muted,
            font: { size: 12, family: "Inter, ui-sans-serif, system-ui, sans-serif" },
            maxRotation: 0,
          },
          border: { display: false },
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: colors.muted,
            font: { size: 12, family: "Inter, ui-sans-serif, system-ui, sans-serif" },
            maxTicksLimit: 5,
            callback: (value) => formatFcfaCompact(value),
          },
          grid: {
            color: colors.grid,
            lineWidth: 1,
          },
          border: { display: false },
        },
      },
    },
  });
  instances.set(canvas, chart);
  return chart;
}

/**
 * @param {HTMLCanvasElement | null} canvas
 * @param {{ labels: string[], values: number[], colors?: string[] }} data
 */
/**
 * Group already-loaded rows into the last N calendar weeks. Display helper only.
 * @param {Array} rows
 * @param {(row: object) => string | null} getDate
 * @param {(row: object) => number} getAmount
 * @param {number} [weeks]
 */
export function weeklySeriesFromRows(rows, getDate, getAmount, weeks = 4) {
  const buckets = [];
  const thisMonday = startOfWeekMonday();
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const start = new Date(thisMonday);
    start.setDate(thisMonday.getDate() - i * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    buckets.push({
      label: `${start.getDate()}/${start.getMonth() + 1}`,
      from: toIsoDate(start),
      to: toIsoDate(end),
      total: 0,
    });
  }
  for (const row of rows || []) {
    const date = getDate(row);
    if (!date) continue;
    const bucket = buckets.find((item) => date >= item.from && date <= item.to);
    if (bucket) bucket.total += Number(getAmount(row) || 0);
  }
  return {
    labels: buckets.map((item) => item.label),
    values: buckets.map((item) => item.total),
  };
}

export function renderDonutChart(canvas, data) {
  if (!canvas) return null;
  const values = data?.values || [];
  if (!valuesHaveActivity(values)) {
    showChartEmpty(canvas, "Aucun solde à répartir.");
    return null;
  }
  destroyChart(canvas);
  const colors = palette();
  const chart = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: data.labels,
      datasets: [
        {
          data: data.values,
          backgroundColor: data.colors || [colors.accent, colors.info, colors.success, colors.danger],
          borderWidth: 0,
          hoverOffset: 4,
        },
      ],
    },
    options: {
      ...commonOptions(),
      cutout: "68%",
      plugins: {
        ...commonOptions().plugins,
        tooltip: {
          ...commonOptions().plugins.tooltip,
          callbacks: {
            label(ctx) {
              return ` ${ctx.label}: ${formatFcfa(Number(ctx.parsed))}`;
            },
          },
        },
      },
    },
  });
  instances.set(canvas, chart);
  return chart;
}
