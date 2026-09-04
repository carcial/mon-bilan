import { escapeHtml } from "../utils/errors.js";
import {
  displayDateFr,
  parseNumericDateFr,
  todayIso,
} from "../utils/dates.js";
import { iconHtml } from "./icons.js";

export function dateFieldHtml({
  id,
  name,
  label,
  value = "",
  draftKey = "",
  defaultToday = true,
  dataRole = "",
} = {}) {
  const iso = value || (defaultToday ? todayIso() : "");
  return `
    <div class="field date-field">
      <label class="field-label" for="${escapeHtml(id)}-display">${escapeHtml(label)}</label>
      <div class="date-field-control">
        <input
          id="${escapeHtml(id)}-display"
          class="field-input"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          placeholder="JJ/MM/AAAA"
          value="${escapeHtml(iso ? displayDateFr(iso) : "")}"
          data-role="date-display"
        />
        <span class="date-field-icon" aria-hidden="true">${iconHtml("calendar-blank", { weight: "bold", size: "sm" })}</span>
        <input
          id="${escapeHtml(id)}"
          name="${escapeHtml(name)}"
          type="date"
          class="date-field-native"
          value="${escapeHtml(iso)}"
          data-role="${escapeHtml(dataRole || "date-native")}"
          ${draftKey ? `data-draft="${escapeHtml(draftKey)}"` : ""}
          tabindex="-1"
          aria-hidden="true"
        />
      </div>
      <p class="field-error" data-error="${escapeHtml(name)}" hidden></p>
    </div>
  `;
}

export function bindDateFields(root) {
  if (!root) return;
  root.querySelectorAll(".date-field").forEach((field) => {
    if (field.dataset.bound === "1") return;
    field.dataset.bound = "1";
    const display = field.querySelector("[data-role=date-display]");
    const native = field.querySelector(".date-field-native");
    if (!(display instanceof HTMLInputElement) || !(native instanceof HTMLInputElement)) return;

    const emit = () => native.dispatchEvent(new Event("change", { bubbles: true }));

    display.addEventListener("change", () => {
      const parsed = parseNumericDateFr(display.value);
      if (parsed) {
        native.value = parsed;
        display.value = displayDateFr(parsed);
        emit();
      }
    });
    display.addEventListener("blur", () => {
      if (native.value) display.value = displayDateFr(native.value);
    });
    native.addEventListener("change", () => {
      if (native.value) display.value = displayDateFr(native.value);
    });
    native.addEventListener("input", () => {
      if (native.value) display.value = displayDateFr(native.value);
    });
  });
}
