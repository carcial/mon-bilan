import { escapeHtml } from "../utils/errors.js";
import { choiceMode } from "../utils/choice-ui.js";
import { iconHtml } from "./icons.js";
import { openChoiceSheet } from "./filter-sheet.js";

/**
 * Select / readonly / empty-state field depending on how many options exist.
 */
export function choiceFieldHtml(props) {
  const {
    id,
    name,
    label,
    options = [],
    selectedId = "",
    valueKey = "id",
    labelFn,
    emptyTitle = "Aucune option disponible.",
    emptyBody = "",
    emptyHref = "",
    emptyLabel = "",
    placeholder = "Choisir",
    draftKey = "",
  } = props;

  const mode = choiceMode(options);
  const getLabel = labelFn || ((row) => row.name || row.label || "");

  if (mode === "empty") {
    return `
      <div class="field" data-choice="${escapeHtml(name)}" data-choice-mode="empty">
        <p class="field-label">${escapeHtml(label)}</p>
        <div class="empty-choice">
          <p>${escapeHtml(emptyTitle)}</p>
          ${emptyBody ? `<p class="field-hint">${escapeHtml(emptyBody)}</p>` : ""}
          ${
            emptyHref && emptyLabel
              ? `<a class="btn btn-secondary" href="#${emptyHref}">${escapeHtml(emptyLabel)}</a>`
              : ""
          }
        </div>
        <input type="hidden" name="${escapeHtml(name)}" value="" ${draftKey ? `data-draft="${escapeHtml(draftKey)}"` : ""} />
        <p class="field-error" data-error="${escapeHtml(name)}" hidden></p>
      </div>
    `;
  }

  if (mode === "single") {
    const only = options[0];
    const value = String(only[valueKey] ?? "");
    return `
      <div class="field" data-choice="${escapeHtml(name)}" data-choice-mode="single">
        <p class="field-label">${escapeHtml(label)}</p>
        <p class="readonly-value">${escapeHtml(getLabel(only))}</p>
        <input type="hidden" id="${escapeHtml(id)}" name="${escapeHtml(name)}" value="${escapeHtml(value)}" ${draftKey ? `data-draft="${escapeHtml(draftKey)}"` : ""} />
        <p class="field-error" data-error="${escapeHtml(name)}" hidden></p>
      </div>
    `;
  }

  const selected = selectedId && options.some((row) => String(row[valueKey]) === String(selectedId))
    ? String(selectedId)
    : "";
  const selectedRow = options.find((row) => String(row[valueKey]) === selected);
  const display = selectedRow ? getLabel(selectedRow) : placeholder;

  const encoded = escapeHtml(JSON.stringify(options.map((row) => ({
    id: String(row[valueKey] ?? ""),
    label: String(getLabel(row)),
  }))));

  return `
    <div class="field" data-choice="${escapeHtml(name)}" data-choice-mode="many">
      <label class="field-label" for="${escapeHtml(id)}">${escapeHtml(label)}</label>
      <button type="button" class="choice-trigger" id="${escapeHtml(id)}" data-role="choice-trigger" aria-haspopup="dialog">
        <span data-role="choice-label">${escapeHtml(display)}</span>
        ${iconHtml("caret-down", { weight: "bold", size: "sm" })}
      </button>
      <input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(selected)}" data-role="choice-value" data-choice-options="${encoded}" data-choice-title="${escapeHtml(label)}" data-choice-placeholder="${escapeHtml(placeholder)}" ${draftKey ? `data-draft="${escapeHtml(draftKey)}"` : ""} />
      <p class="field-error" data-error="${escapeHtml(name)}" hidden></p>
    </div>
  `;
}

export function meaningfulFilterFieldHtml({ id, name, draftKey, label, options, selectedId, allLabel, labelFn }) {
  if (!isShown(options)) return "";
  const rows = [{ id: "", name: allLabel }, ...(options || [])];
  return choiceFieldHtml({
    id,
    name: name || draftKey,
    label,
    options: rows,
    selectedId: selectedId || "",
    labelFn: (row) => (row.id ? (labelFn ? labelFn(row) : row.name) : allLabel),
    placeholder: allLabel,
    draftKey,
  });
}

export function bindChoiceFields(root) {
  if (!root) return;
  root.querySelectorAll('[data-choice-mode="many"] [data-role="choice-trigger"]').forEach((btn) => {
    if (btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", async () => {
      const field = btn.closest("[data-choice]");
      const hidden = field?.querySelector("[data-role=choice-value]");
      if (!hidden) return;
      let options = [];
      try {
        options = JSON.parse(hidden.getAttribute("data-choice-options") || "[]");
      } catch {
        options = [];
      }
      const result = await openChoiceSheet({
        title: hidden.getAttribute("data-choice-title") || "Choisir",
        options,
        selectedId: hidden.value,
      });
      if (result.status !== "apply") return;
      hidden.value = result.id || "";
      const picked = options.find((row) => String(row.id) === String(result.id));
      const labelEl = btn.querySelector("[data-role=choice-label]");
      if (labelEl) {
        labelEl.textContent = picked?.label || hidden.getAttribute("data-choice-placeholder") || "Choisir";
      }
      hidden.dispatchEvent(new Event("change", { bubbles: true }));
      field?.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });
}

function isShown(options) {
  return Array.isArray(options) && options.length > 1;
}
