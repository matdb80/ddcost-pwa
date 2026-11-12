import { ralPrintSwatch } from "./ral-print-swatch";
import { printLocale, type PrintLanguage } from "./quote-print-language";
import { ralColors, type calculateRal } from "./ral-pricing";
export const RAL_FAMILY_NAMES: Record<string, string> = {
  AS: "Aste",
  FP: "Fermaimposte",
  SP: "Spagnolette",
  VB: "Viteria",
  CA: "Cardini",
  BC: "Bandelle o cerniere",
  MA: "Maniglie",
  CR: "Cremonesi",
  CS: "Catenacci o spranghe",
  RN: "Rondelle",
  AP: "Accessori persiana vari",
  AM: "Accessori per mobili",
  AA: "Accessori d’arredo",
};
const ENGLISH_FAMILIES: Record<string, string> = {
  AS: "Rods",
  FP: "Shutter stops",
  SP: "Espagnolette hardware",
  VB: "Fasteners",
  CA: "Pintles",
  BC: "Strap hinges or hinges",
  MA: "Handles",
  CR: "Cremone bolts",
  CS: "Bolts or bars",
  RN: "Washers",
  AP: "Miscellaneous shutter accessories",
  AM: "Furniture accessories",
  AA: "Decorative accessories",
};
type Summary = ReturnType<typeof calculateRal>;
export type PrintRalRow = Summary["rows"][number] & { context?: string };
const esc = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!
  );
const money = (n: number, language: PrintLanguage) =>
  n.toLocaleString(printLocale(language), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
/** Presentation of saved/calculated supplements only: never adds them to totals again. */
export function ralPrintSummary(
  summary: Summary | null | undefined,
  rows: PrintRalRow[] = summary?.rows ?? [],
  alternatives = false,
  language: PrintLanguage = "it"
): string {
  if (!summary) return "";
  const en = language === "en";
  const text = en
    ? {
        title: "RAL surcharge summary",
        category: "Category",
        surcharge: "RAL surcharge",
        amount: "Amount",
        request: "On request",
        fixed: "Colour change (once per order)",
        excluded:
          "Items excluded from the surcharge, kept at the net customer price",
        already: " (already RAL)",
        excludedCategory: " (excluded category)",
        inox: "Stainless steel",
        standard: "Standard",
        alternatives:
          "The batches are alternatives: the amounts below must not be added together.",
      }
    : {
        title: "Riepilogo supplementi RAL",
        category: "Categoria",
        surcharge: "Supplemento RAL",
        amount: "Importo",
        request: "Su richiesta",
        fixed: "Cambio colore (una volta per ordine)",
        excluded:
          "Articoli esclusi dal supplemento, mantenuti al netto cliente",
        already: " (già RAL)",
        excludedCategory: " (categoria esclusa)",
        inox: "Inox",
        standard: "Standard",
        alternatives:
          "I lotti sono alternativi: gli importi seguenti non vanno sommati fra loro.",
      };
  const groups = new Map<
    string,
    { label: string; percent: number; amount: number; missing: boolean }
  >();
  const excluded: string[] = [];
  for (const row of rows) {
    if (!row.paintable) {
      excluded.push(
        row.code +
          (row.context ? " — " + row.context : "") +
          (/O\d{4}$/.test(row.code)
            ? text.already
            : row.family === "qu"
              ? text.excludedCategory
              : " (nylon)")
      );
      continue;
    }
    const family = row.family.toUpperCase(),
      name =
        (en ? ENGLISH_FAMILIES : RAL_FAMILY_NAMES)[family] ??
        `${en ? "Other items" : "Altri articoli"} (${family})`;
    const label =
      name +
      ` (${row.stainless ? text.inox : text.standard})` +
      (row.context ? " — " + row.context : "");
    const key = label + "|" + row.percent;
    const group = groups.get(key) ?? {
      label,
      percent: row.percent,
      amount: 0,
      missing: false,
    };
    group.amount += (row.surcharge ?? 0) * row.quantity;
    group.missing ||= row.surcharge == null;
    groups.set(key, group);
  }
  const color = ralColors.find(c => c.code === summary.color);
  return `<section style="margin-top:18px;border:1px solid #aab5bd;border-radius:6px;padding:12px;break-inside:avoid"><h2 style="margin-top:0">${text.title}</h2>
    <p><strong>RAL ${esc(summary.color)}${color ? " — " + esc(en ? color.english : color.name) : ""} · ${en ? (summary.textured ? "TEXTURED" : "SMOOTH") : summary.textured ? "GOFFRATO" : "LISCIO"}</strong>${ralPrintSwatch(summary.color)}</p>
    ${alternatives ? `<p>${text.alternatives}</p>` : ""}
    ${groups.size ? `<table><thead><tr><th>${text.category}</th><th>${text.surcharge}</th><th>${text.amount}</th></tr></thead><tbody>${[...groups.values()].map(g => `<tr><td>${esc(g.label)}</td><td>+${g.percent}%</td><td>${g.missing ? text.request : "€ " + money(g.amount, language)}</td></tr>`).join("")}</tbody></table>` : ""}
    <p>${text.fixed}: <strong>€ ${money(summary.fixed, language)}</strong></p>
    ${excluded.length ? `<p>${text.excluded}: ${excluded.map(esc).join(", ")}.</p>` : ""}
    </section>`;
}
