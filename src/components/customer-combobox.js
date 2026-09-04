import { escapeHtml } from "../utils/errors.js";
import { iconHtml } from "./icons.js";
import { customerComboboxState, findCustomerByName, fitPanelToViewport } from "../utils/choice-ui.js";
import { customerDisplayLabel } from "../utils/supplier-label.js";

/**
 * @param {{
 *   id?: string,
 *   customers: object[],
 *   selectedId?: string,
 *   query?: string,
 *   hideLabel?: boolean,
 *   placeholder?: string,
 *   allowCreate?: boolean,
 *   metaFn?: (row: object) => string,
 * }} props
 */
export function customerComboboxHtml({
  id = "sale-customer-query",
  customers = [],
  selectedId = "",
  query = "",
  hideLabel = false,
  placeholder = "Rechercher ou saisir un client",
  allowCreate = true,
  metaFn,
} = {}) {
  const selected = (customers || []).find((row) => row.id === selectedId);
  const value = query || customerDisplayLabel(selected) || "";
  const labelClass = hideLabel ? "sr-only" : "field-label";
  return `
    <div class="field combobox" data-role="customer-combobox" data-allow-create="${allowCreate ? "1" : "0"}">
      <label class="${labelClass}" for="${escapeHtml(id)}">Client</label>
      <div class="combobox-control">
        <input
          id="${escapeHtml(id)}"
          name="customerQuery"
          class="field-input"
          type="text"
          autocomplete="off"
          autocapitalize="words"
          spellcheck="false"
          placeholder="${escapeHtml(placeholder)}"
          value="${escapeHtml(value)}"
          aria-label="Client"
          aria-autocomplete="list"
          aria-expanded="false"
          aria-controls="${escapeHtml(id)}-list"
          data-role="customer-query"
        />
        <input type="hidden" name="customerId" value="${escapeHtml(selectedId || "")}" data-role="customer-id" />
        <input type="hidden" name="newCustomerName" value="" data-role="customer-create" />
        <ul
          id="${escapeHtml(id)}-list"
          class="combobox-list"
          role="listbox"
          hidden
          data-role="customer-list"
        ></ul>
      </div>
      <p class="field-hint" data-role="customer-hint"></p>
      <p class="field-error" data-error="customerId" hidden></p>
    </div>
  `;
}

/**
 * @param {HTMLElement} root
 * @param {object[]} customers
 * @param {{ allowCreate?: boolean, metaFn?: (row: object) => string, onSelect?: (row: object | null) => void }} [options]
 */
export function bindCustomerCombobox(root, customers, options = {}) {
  const box = root.querySelector('[data-role="customer-combobox"]');
  if (!box) return;

  const allowCreate = options.allowCreate ?? box.getAttribute("data-allow-create") !== "0";
  const metaFn = options.metaFn;
  const onSelect = options.onSelect;

  const input = box.querySelector('[data-role="customer-query"]');
  const idInput = box.querySelector('[data-role="customer-id"]');
  const createInput = box.querySelector('[data-role="customer-create"]');
  const list = box.querySelector('[data-role="customer-list"]');
  const hint = box.querySelector('[data-role="customer-hint"]');
  if (!(input instanceof HTMLInputElement) || !idInput || !createInput || !list) return;

  const applyExisting = (customer) => {
    idInput.value = customer.id;
    createInput.value = "";
    input.value = customerDisplayLabel(customer);
    if (hint) {
      hint.textContent = allowCreate
        ? "Ce client existe déjà. Sélectionnez-le dans la liste."
        : "";
    }
    hideList();
    onSelect?.(customer);
  };

  const applyCreate = (name) => {
    idInput.value = "";
    createInput.value = name;
    input.value = name;
    if (hint) hint.textContent = `Nouveau client : ${name}`;
    hideList();
    onSelect?.(null);
  };

  const commitTyped = () => {
    const state = customerComboboxState(customers, input.value, { allowCreate });
    if (state.exact) {
      applyExisting(state.exact);
      return;
    }
    if (state.canCreate) {
      applyCreate(state.query);
      return;
    }
    idInput.value = "";
    createInput.value = "";
    if (hint) hint.textContent = "";
    onSelect?.(null);
  };

  const hideList = () => {
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
  };

  const renderList = () => {
    const state = customerComboboxState(customers, input.value, { allowCreate });
    const items = state.matches
      .map((row) => {
        const meta = metaFn ? metaFn(row) : "";
        return `
        <li>
          <button type="button" class="combobox-option" data-customer-id="${escapeHtml(row.id)}" role="option">
            <span class="combobox-option-main">${escapeHtml(customerDisplayLabel(row))}</span>
            ${meta ? `<span class="combobox-option-meta">${escapeHtml(meta)}</span>` : ""}
          </button>
        </li>
      `;
      })
      .join("");
    const create = state.canCreate
      ? `
        <li>
          <button type="button" class="combobox-option is-create" data-create="${escapeHtml(state.query)}" role="option">
            ${iconHtml("plus", { weight: "bold", size: "sm" })}
            ${escapeHtml(state.createLabel)}
          </button>
        </li>
      `
      : "";

    if (!items && !create) {
      hideList();
      return;
    }

    list.innerHTML = `${items}${create}`;
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    const control = box.querySelector(".combobox-control") || input;
    fitPanelToViewport(list, control);

    list.querySelectorAll("[data-customer-id]").forEach((btn) => {
      btn.addEventListener("mousedown", (event) => event.preventDefault());
      btn.addEventListener("click", () => {
        const customer = customers.find((row) => row.id === btn.getAttribute("data-customer-id"));
        if (customer) applyExisting(customer);
      });
    });
    list.querySelector("[data-create]")?.addEventListener("mousedown", (event) => event.preventDefault());
    list.querySelector("[data-create]")?.addEventListener("click", () => {
      applyCreate(list.querySelector("[data-create]")?.getAttribute("data-create") || state.query);
    });
  };

  input.addEventListener("focus", renderList);
  input.addEventListener("input", () => {
    const exact = findCustomerByName(customers, input.value);
    if (exact) {
      idInput.value = exact.id;
      createInput.value = "";
      if (hint && allowCreate) hint.textContent = "Ce client existe déjà. Sélectionnez-le dans la liste.";
    } else {
      idInput.value = "";
      createInput.value = allowCreate ? String(input.value || "").trim() : "";
      if (hint) hint.textContent = "";
      onSelect?.(null);
    }
    renderList();
  });
  input.addEventListener("blur", () => {
    window.setTimeout(commitTyped, 120);
  });
}
