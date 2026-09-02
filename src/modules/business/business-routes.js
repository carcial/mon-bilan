export function matchBusinessRoute(path) {
  const pathname = String(path || "").split("?")[0];
  const parts = pathname.split("/").filter(Boolean);
  const rest = parts[0] === "commerce" ? parts.slice(1) : parts;
  if (rest.length === 0) return { name: "dashboard" };

  const [head, id, tail] = rest;

  if (head === "vente" && !id) return { name: "sale" };
  if (head === "vente" && id) return { name: "sale-detail", id };
  if (head === "arrivee") return { name: "arrival" };
  if (head === "succes" && id && tail) return { name: "success", kind: id, id: tail };
  if (head === "succes" && id) return { name: "success", kind: "operation", id };
  if (head === "clients" && id === "nouveau") return { name: "customer-new" };
  if (head === "clients" && id) return { name: "customer-detail", id };
  if (head === "clients") return { name: "customers" };
  if (head === "fournisseurs" && id === "nouveau") return { name: "supplier-new" };
  if (head === "fournisseurs" && id) return { name: "supplier-detail", id };
  if (head === "fournisseurs") return { name: "suppliers" };
  if (head === "produits" && id === "nouveau") return { name: "product-new" };
  if (head === "produits") return { name: "products" };
  if (head === "stock" && id === "ajustement") return { name: "adjustment" };
  if (head === "stock") return { name: "stock" };
  if (head === "depenses" && id === "nouvelle") return { name: "expense-new" };
  if (head === "depenses") return { name: "expenses" };
  if (head === "bordereaux") return { name: "bordereaux" };
  if (head === "bordereau" && id) return { name: "bordereau", id };
  if (head === "a-recevoir") return { name: "receivables" };
  if (head === "a-payer") return { name: "payables" };
  if (head === "historique") return { name: "history" };
  if (head === "rapport") return { name: "report" };

  return { name: "dashboard" };
}

export function businessSuccessPath(kind, id) {
  return `/commerce/succes/${kind}/${id}`;
}

export function businessSalePath(id) {
  return `/commerce/vente/${id}`;
}

export function businessBordereauPath(id) {
  return `/commerce/bordereau/${id}`;
}

export function businessCustomerPath(id) {
  return `/commerce/clients/${id}`;
}

export function businessSupplierPath(id) {
  return `/commerce/fournisseurs/${id}`;
}
