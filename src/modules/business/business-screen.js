import { matchBusinessRoute } from "./business-routes.js";
import { renderBusinessDashboard } from "./business-dashboard.js";
import { renderArrivalForm } from "./business-arrival.js";
import { renderSaleForm } from "./business-sale.js";
import { renderBusinessSuccess } from "./business-success.js";
import { renderBordereauDetail, renderBordereauList } from "./business-bordereau.js";
import { renderAdjustmentForm, renderStock } from "./business-inventory.js";
import {
  renderCustomerDetail,
  renderCustomerList,
  renderCustomerNew,
  renderProductList,
  renderProductNew,
  renderSupplierDetail,
  renderSupplierList,
  renderSupplierNew,
} from "./business-people.js";
import {
  renderBusinessHistory,
  renderBusinessReport,
  renderExpenseForm,
  renderExpenses,
  renderPayables,
  renderReceivables,
  renderSaleDetail,
} from "./business-ops.js";

/**
 * Business module dispatcher.
 * @param {HTMLElement} root
 * @param {{ path?: string, onChanged?: () => void }} [ctx]
 */
export function renderBusinessScreen(root, ctx = {}) {
  const route = matchBusinessRoute(ctx.path || "/commerce");
  const shared = { onChanged: ctx.onChanged };

  switch (route.name) {
    case "sale":
      renderSaleForm(root, shared);
      break;
    case "sale-detail":
      renderSaleDetail(root, { ...shared, id: route.id });
      break;
    case "arrival":
      renderArrivalForm(root, shared);
      break;
    case "success":
      renderBusinessSuccess(root, { kind: route.kind, id: route.id });
      break;
    case "customers":
      renderCustomerList(root);
      break;
    case "customer-new":
      renderCustomerNew(root, shared);
      break;
    case "customer-detail":
      renderCustomerDetail(root, { ...shared, id: route.id });
      break;
    case "suppliers":
      renderSupplierList(root);
      break;
    case "supplier-new":
      renderSupplierNew(root, shared);
      break;
    case "supplier-detail":
      renderSupplierDetail(root, { ...shared, id: route.id });
      break;
    case "products":
      renderProductList(root);
      break;
    case "product-new":
      renderProductNew(root, shared);
      break;
    case "stock":
      renderStock(root);
      break;
    case "adjustment":
      renderAdjustmentForm(root, shared);
      break;
    case "expenses":
      renderExpenses(root, shared);
      break;
    case "expense-new":
      renderExpenseForm(root, shared);
      break;
    case "bordereaux":
      renderBordereauList(root);
      break;
    case "bordereau":
      renderBordereauDetail(root, { id: route.id });
      break;
    case "receivables":
      renderReceivables(root);
      break;
    case "payables":
      renderPayables(root);
      break;
    case "history":
      renderBusinessHistory(root);
      break;
    case "report":
      renderBusinessReport(root);
      break;
    case "dashboard":
    default:
      renderBusinessDashboard(root);
      break;
  }
}

/** @deprecated Phase 1 name */
export function renderBusinessPlaceholder(root, ctx) {
  renderBusinessScreen(root, ctx);
}
