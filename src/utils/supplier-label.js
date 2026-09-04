/**
 * Show the stored supplier name. Never invent labels.
 * When code and name are the same (SOA / DJS / SO), show that value once.
 */
export function supplierDisplayLabel(supplier) {
  const code = String(supplier?.code || "").trim();
  const name = String(supplier?.name || "").trim();
  if (code && name) {
    if (code.toLowerCase() === name.toLowerCase()) return name;
    return name;
  }
  return name || code;
}

export function customerDisplayLabel(customer) {
  return String(customer?.name || "").trim();
}
