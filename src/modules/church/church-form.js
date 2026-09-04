import { amountHtml } from "../../components/amount.js";
import { bindChoiceFields, choiceFieldHtml } from "../../components/choice-field.js";
import { confirmAndWrite } from "../../components/confirm-modal.js";
import { navigate, ROUTES } from "../../router.js";
import {
  createChurchTransaction,
  getChurchFundBalance,
  getChurchFunds,
  getChurchTransaction,
  updateChurchTransaction,
} from "../../services/supabase/church.js";
import { formatFcfa } from "../../utils/money.js";
import { bindDateFields, dateFieldHtml } from "../../components/date-field.js";
import { displayDateFr, todayIso } from "../../utils/dates.js";
import { friendlyError, escapeHtml } from "../../utils/errors.js";
import { createSubmitGuard } from "../../utils/submit-guard.js";
import {
  calculateExpectedBalance,
  validateChurchTransaction,
  wouldMakeNegativeBalance,
} from "../../utils/church-calc.js";
import {
  bindMoneyInput,
  clearFieldErrors,
  errorStateHtml,
  fundName,
  pageHeaderHtml,
  setFieldError,
  skeletonHtml,
} from "./church-ui.js";
import { churchSuccessPath } from "./church-routes.js";

/** @type {{ income: object | null, expense: object | null }} */
const drafts = { income: null, expense: null };

/**
 * @param {HTMLElement} root
 * @param {{
 *   type: 'income' | 'expense',
 *   mode?: 'create' | 'edit',
 *   id?: string,
 *   onChanged?: () => void,
 * }} ctx
 */
export function renderChurchForm(root, ctx) {
  const type = ctx.type === "expense" ? "expense" : "income";
  const mode = ctx.mode === "edit" ? "edit" : "create";
  const isExpense = type === "expense";
  const title =
    mode === "edit"
      ? "Modifier l'opération"
      : isExpense
        ? "Ajouter une sortie"
        : "Ajouter une entrée";

  root.innerHTML = `
    <section class="page church-page" aria-labelledby="church-title">
      ${pageHeaderHtml({
        kicker: "Église",
        title,
        backHref: mode === "edit" && ctx.id ? `/eglise/operation/${ctx.id}` : ROUTES.church,
        backLabel: mode === "edit" ? "Retour à l'opération" : "Retour à Église",
      })}
      <div data-role="body">${skeletonHtml(4)}</div>
    </section>
  `;

  const body = root.querySelector('[data-role="body"]');
  loadForm(body, { ...ctx, type, mode, isExpense, title });
}

async function loadForm(body, ctx) {
  if (!body) return;
  try {
    const funds = await getChurchFunds();
    let existing = null;
    if (ctx.mode === "edit" && ctx.id) {
      existing = await getChurchTransaction(ctx.id);
      if (!existing) {
        body.innerHTML = errorStateHtml("Cette opération est introuvable.");
        return;
      }
      const existingType = existing.transaction_type === "expense" ? "expense" : "income";
      ctx = {
        ...ctx,
        type: existingType,
        isExpense: existingType === "expense",
      };
    }

    const draft =
      ctx.mode === "create" ? drafts[ctx.type] : null;

    body.innerHTML = formHtml({ funds, existing, draft, ...ctx });
    bindForm(body, { funds, existing, ...ctx });
  } catch (err) {
    console.warn("[church] form load failed", err);
    body.innerHTML = errorStateHtml(friendlyError(err));
    body.querySelector('[data-action="retry"]')?.addEventListener("click", () => {
      body.innerHTML = skeletonHtml(4);
      loadForm(body, ctx);
    });
  }
}

function formHtml({ funds, existing, draft, type, isExpense }) {
  const amountValue =
    draft?.amountDisplay ??
    (existing ? formatFcfa(existing.amount_fcfa, { showCurrency: false }) : "");
  const amountRaw =
    draft?.amount ??
    (existing ? String(existing.amount_fcfa) : "");
  const fundId = draft?.fundId ?? existing?.fund_id ?? funds[0]?.id ?? "";
  const date = draft?.date ?? existing?.transaction_date ?? todayIso();
  const reason = draft?.reason ?? existing?.reason ?? "";
  const note = draft?.note ?? existing?.note ?? "";

  return `
    <form class="church-form stack" data-role="form" novalidate>
      ${choiceFieldHtml({
        id: "church-fund",
        name: "fundId",
        label: "Caisse",
        options: funds,
        selectedId: fundId,
        placeholder: "Choisir une caisse",
        labelFn: (fund) => fundName(fund),
        emptyTitle: "Aucune caisse disponible.",
      })}

      <div class="field">
        <label class="field-label" for="church-amount">Montant</label>
        <input
          id="church-amount"
          name="amount"
          class="field-input field-input-amount"
          inputmode="numeric"
          autocomplete="off"
          enterkeyhint="next"
          placeholder="Ex. 150 000"
          value="${escapeHtml(amountValue)}"
          data-amount="${escapeHtml(amountRaw)}"
          aria-describedby="church-amount-hint"
          required
        />
        <p class="field-hint" id="church-amount-hint">Montant entier en FCFA, sans décimales.</p>
        <p class="field-error" data-error="amount" hidden></p>
      </div>

      ${dateFieldHtml({ id: "church-date", name: "date", label: "Date", value: date })}

      <div class="field">
        <label class="field-label" for="church-reason">Motif</label>
        <input
          id="church-reason"
          name="reason"
          class="field-input"
          type="text"
          maxlength="200"
          value="${escapeHtml(reason)}"
          placeholder="${isExpense ? "Ex. Achat de ciment" : "Ex. Offrandes dimanche"}"
          required
        />
        <p class="field-error" data-error="reason" hidden></p>
      </div>

      <div class="field">
        <label class="field-label" for="church-note">Note <span class="field-optional">(facultatif)</span></label>
        <textarea
          id="church-note"
          name="note"
          class="field-input field-textarea"
          rows="3"
          maxlength="500"
          placeholder="Ex. Paiement prévu vendredi"
        >${escapeHtml(note)}</textarea>
      </div>

      <p class="form-alert" data-role="form-error" hidden></p>

      <button type="submit" class="btn btn-primary btn-block" data-role="submit">
        ${ctxModeLabel(type)}
      </button>
    </form>
  `;
}

function ctxModeLabel(type) {
  return type === "expense" ? "Continuer" : "Continuer";
}

function readForm(form) {
  const amountInput = form.elements.namedItem("amount");
  const amount =
    amountInput instanceof HTMLInputElement
      ? amountInput.dataset.amount || amountInput.value
      : "";
  return {
    fundId: String(form.elements.namedItem("fundId")?.value || ""),
    amount,
    date: String(form.elements.namedItem("date")?.value || ""),
    reason: String(form.elements.namedItem("reason")?.value || ""),
    note: String(form.elements.namedItem("note")?.value || ""),
  };
}

function persistDraft(type, form) {
  const amountInput = form.elements.namedItem("amount");
  drafts[type] = {
    ...readForm(form),
    amountDisplay: amountInput instanceof HTMLInputElement ? amountInput.value : "",
  };
}

function bindForm(body, ctx) {
  const form = body.querySelector('[data-role="form"]');
  const amountInput = form?.querySelector("#church-amount");
  if (!form || !(amountInput instanceof HTMLInputElement)) return;

  bindMoneyInput(amountInput);
  bindChoiceFields(form);
  bindDateFields(form);
  const guard = createSubmitGuard();

  form.addEventListener("input", () => {
    if (ctx.mode === "create") persistDraft(ctx.type, form);
  });
  form.addEventListener("change", () => {
    if (ctx.mode === "create") persistDraft(ctx.type, form);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (guard.isLocked()) return;

    await guard.run(async () => {
      await handleSubmit(form, ctx);
    });
  });
}

async function handleSubmit(form, ctx) {
  clearFieldErrors(form);
  const formError = form.querySelector('[data-role="form-error"]');
  if (formError) {
    formError.hidden = true;
    formError.textContent = "";
  }

  const values = readForm(form);
  const validated = validateChurchTransaction({
    ...values,
    type: ctx.type,
  });

  if (!validated.ok) {
    Object.entries(validated.errors).forEach(([key, message]) => {
      setFieldError(form, key, message);
    });
    return;
  }

  const funds = ctx.funds || [];
  const fund = funds.find((f) => f.id === values.fundId);
  const submitBtn = form.querySelector('[data-role="submit"]');
  if (submitBtn) submitBtn.disabled = true;

  try {
    let extraHtml = "";
    if (ctx.type === "expense") {
      const current = await getChurchFundBalance(values.fundId);
      if (wouldMakeNegativeBalance(current, validated.amount)) {
        const expected = calculateExpectedBalance(current, validated.amount, "expense");
        extraHtml = negativeWarningHtml({
          current,
          expense: validated.amount,
          expected,
        });
      }
    }

    const isEdit = ctx.mode === "edit";
    const rows = isEdit
      ? editRows(ctx.existing, { ...values, amount: validated.amount, fund })
      : [
          { label: "Caisse", value: fundName(fund) },
          { label: "Motif", value: validated.reason },
          { label: "Date", value: displayDateFr(values.date) },
          ...(values.note.trim()
            ? [{ label: "Note", value: values.note.trim() }]
            : []),
        ];

    const result = await confirmAndWrite(
      {
        title: confirmTitle(ctx.type, isEdit),
        amountHtml: amountHtml(validated.amount),
        extraHtml,
        rows,
        confirmLabel: "Confirmer",
        cancelLabel: "Modifier",
        cancelLabel: "Modifier",
      },
      async () => {
        const payload = {
          fundId: values.fundId,
          type: ctx.type,
          amountFcfa: validated.amount,
          date: values.date,
          reason: validated.reason,
          note: values.note.trim() || null,
        };
        if (isEdit) {
          return updateChurchTransaction(ctx.id, payload);
        }
        return createChurchTransaction(payload);
      },
    );

    if (result.status === "confirm" && result.data) {
      if (ctx.mode === "create") drafts[ctx.type] = null;
      ctx.onChanged?.();
      if (isEdit) {
        navigate(`/eglise/operation/${result.data.id}`);
      } else {
        navigate(churchSuccessPath(result.data.id));
      }
    }
  } catch (err) {
    if (formError) {
      formError.hidden = false;
      formError.textContent = friendlyError(err);
    }
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

function confirmTitle(type, isEdit) {
  if (isEdit) return "CONFIRMER LA MODIFICATION";
  return type === "expense" ? "CONFIRMER LA SORTIE" : "CONFIRMER L'ENTRÉE";
}

function negativeWarningHtml({ current, expense, expected }) {
  return `
    <div class="warning-box" role="alert">
      <p class="warning-box-title">Cette sortie rendra la caisse négative.</p>
      <p>Solde actuel : <strong>${escapeHtml(formatFcfa(current))}</strong></p>
      <p>Sortie : <strong>${escapeHtml(formatFcfa(expense))}</strong></p>
      <p>Solde prévu : <strong>${escapeHtml(formatFcfa(expected))}</strong></p>
    </div>
  `;
}

function editRows(existing, next) {
  const oldFund = existing?.church_funds;
  const pairs = [
    {
      label: "Montant",
      old: formatFcfa(existing?.amount_fcfa ?? 0),
      next: formatFcfa(next.amount),
    },
    {
      label: "Caisse",
      old: fundName(oldFund),
      next: fundName(next.fund),
    },
    {
      label: "Motif",
      old: existing?.reason ?? "",
      next: next.reason,
    },
    {
      label: "Date",
      old: displayDateFr(existing?.transaction_date),
      next: displayDateFr(next.date),
    },
    {
      label: "Note",
      old: existing?.note?.trim() || "—",
      next: next.note.trim() || "—",
    },
  ];

  return pairs.map((row) => ({
    label: row.label,
    value: row.old === row.next ? row.next : `${row.old} → ${row.next}`,
  }));
}
