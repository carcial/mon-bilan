/**
 * Chart data helpers — no Chart.js import, safe for unit tests.
 */

export function seriesHasActivity(series = []) {
  return (series || []).some((serie) =>
    (serie.values || []).some((value) => Number(value) !== 0),
  );
}

export function valuesHaveActivity(values = []) {
  return (values || []).some((value) => Number(value) !== 0);
}
