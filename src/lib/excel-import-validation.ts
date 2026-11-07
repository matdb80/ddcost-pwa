import { CATEGORIE_RIGA } from "../types/cycle";
import type {
  ImportDraft,
  ImportProblem,
  ValidatedImportDraft,
} from "../types/excel-import";
import { materializeImportRows } from "./excel-import-hierarchy";
const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const positive = (v: unknown): v is number => finite(v) && v > 0;
const nonnegative = (v: unknown): v is number => finite(v) && v >= 0;
const text = (v: unknown) => typeof v === "string" && v.trim().length > 0;
export function validateImportDraft(draft: ImportDraft): {
  draft: ImportDraft;
  valid: boolean;
} {
  // Derived problems are recomputed, so editing a field can actually clear them.
  const problems: ImportProblem[] = draft.problems.filter(
    p => !p.id.startsWith("v2:")
  );
  const add = (
    code: string,
    message: string,
    key = "draft",
    productKey?: string,
    rowKey?: string
  ) =>
    problems.push({
      id: `v2:${key}:${code}`,
      code,
      message,
      severity: "error",
      resolved: false,
      productKey,
      rowKey,
    });
  problems.push(...(draft.templateMatch?.conflicts ?? []));
  const selected = draft.products.filter(p => p.selected);
  if (selected.length !== 1)
    add(
      "SINGLE_PRODUCT_REQUIRED",
      "Per questa anteprima selezionare un solo prodotto/variante"
    );
  for (const product of selected) {
    problems.push(...product.problems);
    if (!text(product.code))
      add(
        "CODE_REQUIRED",
        "Confermare il codice prodotto distinto dall'identificatore del blocco",
        product.key
      );
    if (!text(product.label))
      add(
        "PRODUCT_DESCRIPTION_REQUIRED",
        "Descrizione prodotto obbligatoria",
        product.key
      );
    if (!product.rows.some(r => r.included))
      add("ROWS_REQUIRED", "Nessuna riga di costo selezionata", product.key);
    for (const item of product.rows) {
      const costKind =
        !item.kind || item.kind === "cost" || item.kind === "setup";
      if (!item.included) {
        if (
          costKind &&
          !(product.options ?? []).some(
            o =>
              o.required === false &&
              !o.selected &&
              o.rowKeys.includes(item.key)
          )
        )
          add(
            "COST_ROW_EXCLUDED",
            "VAL-003: una voce di costo/setup del prodotto non può essere scartata",
            item.key,
            product.key,
            item.key
          );
        else if (!costKind && !text(item.exclusionReason))
          add(
            "EXCLUSION_REASON",
            "Classificare e motivare l'esclusione",
            item.key
          );
        continue;
      }
      const r = item.row;
      problems.push(...item.problems);
      const issue = (code: string, message: string) =>
        add(code, message, `${product.key}:${item.key}`, product.key, item.key);
      if (!costKind)
        issue(
          "NON_COST_INCLUDED",
          "Titoli, totali e note non sono costi da includere"
        );
      if (!text(r.descrizione))
        issue("DESCRIPTION_REQUIRED", "Descrizione riga obbligatoria");
      if (!r.categoria || !CATEGORIE_RIGA.includes(r.categoria))
        issue("CATEGORY_REQUIRED", "Categoria DDCost da confermare");
      if (r.considera === false)
        issue("INCLUSION_CONFLICT", "Riga inclusa ma disattivata nel calcolo");
      if (!positive(r.nr_componenti))
        issue("QUANTITY_REQUIRED", "Quantità positiva e finita obbligatoria");
      for (const [field, value] of Object.entries(r))
        if (typeof value === "number" && (!Number.isFinite(value) || value < 0))
          issue("INVALID_NUMBER", `Valore non valido: ${field}`);
      if (r.categoria === "LAVORAZIONE INTERNA") {
        if (r.confezionamento) {
          if (
            !Number.isSafeInteger(r.quantita_per_conf) ||
            !positive(r.quantita_per_conf) ||
            !positive(r.tempo_confezionamento_min)
          )
            issue(
              "PACKAGING_REQUIRED",
              "Quantità scatola e tempo scatola validi obbligatori"
            );
        } else if (
          !positive(r.colpi_min) &&
          !(item.kind === "setup" && nonnegative(r.attrezzaggio_min)) &&
          !positive(r.attrezzaggio_min)
        )
          issue(
            "TIME_REQUIRED",
            "Velocità positiva o minuti di attrezzaggio obbligatori"
          );
      } else if (!r.assembly_auto && !nonnegative(r.costo_unitario))
        issue(
          "UNIT_COST_REQUIRED",
          "Costo unitario mancante o non valido; zero deve essere esplicito"
        );
      if (
        [
          "MATERIA PRIMA DA TRASFORMARE",
          "LAVORAZIONE A PESO",
          "LAVORAZIONE TERZISTA A PESO",
        ].includes(r.categoria ?? "") &&
        !positive(r.peso_kg)
      )
        issue(
          "WEIGHT_REQUIRED",
          "Confermare il peso usato dal foglio prima del calcolo"
        );
      if (positive(r.costo_min))
        issue(
          "ROW_RATE_UNSUPPORTED",
          "La tariffa per riga non è un override: scegliere la tariffa unica del ciclo"
        );
      for (const [field, ref] of Object.entries(item.sources))
        for (const address of ref.addresses) {
          const decision = draft.mappings
            ?.find(m => m.productKey === product.key)
            ?.fields.find(
              f =>
                f.rowKey === item.key &&
                (f.target === field ||
                  (["peso_lordo", "peso_netto"].includes(field) &&
                    f.target === "peso_kg"))
            );
          if (
            decision?.validation === "valid" &&
            decision.decision === "overridden" &&
            (decision.binding === "constant" || decision.binding === "cell")
          )
            continue;
          const cell = draft.workbook.sheets.find(s => s.name === ref.sheet)
            ?.cells[address];
          if (cell?.error || (cell?.formula && cell.cached == null))
            issue(
              "SOURCE_ERROR",
              `Cella ${ref.sheet}!${address}: errore o formula senza risultato memorizzato`
            );
        }
    }
    try {
      materializeImportRows(product.rows);
    } catch (e) {
      add("HIERARCHY", String(e), product.key);
    }
    if (
      product.historicalDirectCostEur !== undefined &&
      !nonnegative(product.historicalDirectCostEur)
    )
      add("HISTORICAL_COST", "Costo storico in euro non valido", product.key);
  }
  const p = draft.economicPolicy;
  if (p.currency !== "EUR")
    add(
      "CURRENCY_REQUIRED",
      "Questo nucleo accetta solo valori monetari in EUR; completare la conversione ITL prima dell'anteprima"
    );
  if (!positive(p.labourEurPerMinute))
    add(
      "LABOUR_RATE_REQUIRED",
      "Tariffa lavoro positiva e finita obbligatoria"
    );
  if (!Number.isSafeInteger(p.lot) || !positive(p.lot))
    add("LOT_REQUIRED", "Lotto intero positivo obbligatorio");
  if (!nonnegative(p.overheadFraction))
    add(
      "OVERHEAD_REQUIRED",
      "Spese generali esplicite e non negative obbligatorie"
    );
  if (!nonnegative(p.marginFraction) || p.marginFraction >= 1)
    add("MARGIN_REQUIRED", "Margine esplicito compreso fra zero e uno escluso");
  const unique = [
    ...new Map(
      problems.map(p => [`${p.productKey ?? ""}:${p.rowKey ?? ""}:${p.id}`, p])
    ).values(),
  ];
  return {
    draft: { ...draft, problems: unique },
    valid: !unique.some(p => p.severity === "error" && !p.resolved),
  };
}
export function asValidatedDraft(draft: ImportDraft): ValidatedImportDraft {
  const result = validateImportDraft(draft);
  if (!result.valid)
    throw new Error(
      `La bozza contiene errori bloccanti: ${result.draft.problems
        .filter(p => p.severity === "error" && !p.resolved)
        .map(p => p.code)
        .join(", ")}`
    );
  return { ...result.draft, validated: true };
}
