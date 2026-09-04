/**
 * Phosphor Icons helper — one icon system for the whole app.
 * Weights: regular (nav), bold (actions), fill (selected / status).
 */

const WEIGHT_CLASS = {
  regular: "ph",
  bold: "ph-bold",
  fill: "ph-fill",
  duotone: "ph-duotone",
};

/**
 * @param {string} name Phosphor icon name without prefix, e.g. "house"
 * @param {{ weight?: 'regular' | 'bold' | 'fill' | 'duotone', size?: 'sm' | 'md' | 'lg' | 'xl', className?: string }} [options]
 */
export function iconHtml(name, options = {}) {
  const weight = WEIGHT_CLASS[options.weight] || WEIGHT_CLASS.regular;
  const size = options.size ? ` icon-${options.size}` : "";
  const extra = options.className ? ` ${options.className}` : "";
  return `<i class="${weight} ph-${name} icon${size}${extra}" aria-hidden="true"></i>`;
}

export function backChevronHtml() {
  return iconHtml("caret-left", { weight: "bold", size: "md" });
}
