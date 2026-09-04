export function matchMoreRoute(path) {
  const pathname = String(path || "").split("?")[0];
  const parts = pathname.split("/").filter(Boolean);
  const rest = parts[0] === "plus" ? parts.slice(1) : parts;
  if (rest.length === 0) return { name: "menu" };

  const [head] = rest;
  if (head === "rapport") return { name: "report" };
  if (head === "export") return { name: "export" };
  if (head === "activite") return { name: "activity" };
  if (head === "rappels") return { name: "rappels" };
  return { name: "menu" };
}

export const MORE_PATHS = {
  menu: "/plus",
  report: "/plus/rapport",
  export: "/plus/export",
  activity: "/plus/activite",
  rappels: "/plus/rappels",
};

