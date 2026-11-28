import { ralColors } from "./ral-pricing";
/** Use a vector shape so the sample also prints with browser backgrounds disabled. */
export function ralPrintSwatch(code: string): string {
  const color = ralColors.find(c => c.code === code);
  if (!color) return "";
  return `<svg xmlns="http://www.w3.org/2000/svg" class="ral-swatch" role="img" aria-label="RAL ${color.code}" width="32" height="18" viewBox="0 0 32 18" style="display:inline-block;vertical-align:middle;margin-left:6px;print-color-adjust:exact;-webkit-print-color-adjust:exact"><rect x="0.5" y="0.5" width="31" height="17" rx="2" fill="${color.hex}" stroke="#58636a" stroke-width="1"/></svg>`;
}
