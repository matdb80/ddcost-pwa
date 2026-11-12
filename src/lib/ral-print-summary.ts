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
const money = (n: number) =>
  n.toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
/** Presentation of saved/calculated supplements only: never adds them to totals again. */
export function ralPrintSummary(
  summary: Summary | null | undefined,
  rows: PrintRalRow[] = summary?.rows ?? [],
  alternatives = false
): string {
  if (!summary) return "";
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
            ? " (già RAL)"
            : row.family === "qu"
              ? " (categoria esclusa)"
              : " (nylon)")
      );
      continue;
    }
    const family = row.family.toUpperCase(),
      name = RAL_FAMILY_NAMES[family] ?? `Altri articoli (${family})`;
    const label =
      name +
      ` (${row.stainless ? "Inox" : "Standard"})` +
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
  return `<section style="margin-top:18px;border:1px solid #aab5bd;border-radius:6px;padding:12px;break-inside:avoid"><h2 style="margin-top:0">Riepilogo supplementi RAL</h2>
    <p><strong>RAL ${esc(summary.color)}${color ? " — " + esc(color.name) : ""} · ${summary.textured ? "GOFFRATO" : "LISCIO"}</strong></p>
    ${alternatives ? "<p>I lotti sono alternativi: gli importi seguenti non vanno sommati fra loro.</p>" : ""}
    ${groups.size ? `<table><thead><tr><th>Categoria</th><th>Supplemento RAL</th><th>Importo</th></tr></thead><tbody>${[...groups.values()].map(g => `<tr><td>${esc(g.label)}</td><td>+${g.percent}%</td><td>${g.missing ? "Su richiesta" : "€ " + money(g.amount)}</td></tr>`).join("")}</tbody></table>` : ""}
    <p>Cambio colore (una volta per ordine): <strong>€ ${money(summary.fixed)}</strong></p>
    ${excluded.length ? `<p>Articoli esclusi dal supplemento, mantenuti al netto cliente: ${excluded.map(esc).join(", ")}.</p>` : ""}
    <p>I supplementi di verniciatura RAL sono calcolati sul netto cliente e hanno valore indicativo; l'importo definitivo è soggetto a conferma dell'ufficio.</p></section>`;
}
