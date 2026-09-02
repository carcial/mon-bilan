import { amountHtml } from "../../components/amount.js";
import { navigate, ROUTES } from "../../router.js";
import { getArrival, getSale, saleTotal } from "../../services/supabase/business.js";
import { friendlyError } from "../../utils/errors.js";
import {
  BUSINESS_LINKS,
  errorStateHtml,
  pageHeaderHtml,
  skeletonHtml,
} from "./business-ui.js";
import { businessBordereauPath, businessSalePath } from "./business-routes.js";

export function renderBusinessSuccess(root, ctx) {
  root.innerHTML = `
    <section class="page business-page" aria-labelledby="business-title">
      ${pageHeaderHtml({ title: "Enregistré", backHref: ROUTES.business })}
      <div data-role="body">${skeletonHtml(2)}</div>
    </section>
  `;
  load(root.querySelector('[data-role="body"]'), ctx);
}

async function load(body, ctx) {
  if (!body) return;
  try {
    if (ctx.kind === "arrivage") {
      const arrival = await getArrival(ctx.id);
      body.innerHTML = successHtml({
        title: "Arrivage enregistré",
        amount: (arrival?.quantity_received || 0) * (arrival?.supplier_unit_price_fcfa || 0),
        home: BUSINESS_LINKS.home,
        detail: businessBordereauPath(ctx.id),
        detailLabel: "Voir le bordereau",
      });
    } else {
      const sale = await getSale(ctx.id);
      body.innerHTML = successHtml({
        title: "Vente enregistrée",
        amount: sale ? saleTotal(sale) : 0,
        home: BUSINESS_LINKS.home,
        detail: businessSalePath(ctx.id),
        detailLabel: "Voir la vente",
      });
    }
    body.querySelectorAll("a[href^='#']").forEach((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        navigate((link.getAttribute("href") || "#/").slice(1));
      });
    });
  } catch (err) {
    body.innerHTML = errorStateHtml(friendlyError(err));
  }
}

function successHtml({ title, amount, home, detail, detailLabel }) {
  return `
    <div class="success-panel">
      <p class="success-title"><span aria-hidden="true">✓</span> ${title}</p>
      <div>${amountHtml(amount)}</div>
    </div>
    <div class="stack">
      <a class="btn btn-primary btn-block" href="#${home}">Retour au commerce</a>
      <a class="btn btn-ghost btn-block" href="#${detail}">${detailLabel}</a>
    </div>
  `;
}
