/**
 * Read-only pie breakdown for TKT-20261013-12060003.
 *
 * Buckets intentionally follow business classification:
 * - terzisti: explicit subcontractor cost categories, regardless of supplier;
 * - interne: LAVORAZIONE INTERNA, regardless of supplier;
 * - fornitori: any remaining cost row with a nonblank fornitore;
 * - unclassified: other costs without supplier, reported separately.
 *
 * Dedicated tooling is NEVER counted. The three pie percentages are relative
 * only to costs in the three requested categories; unclassified costs are shown
 * explicitly so the chart cannot be mistaken for the full industrial cost.
 *
 * New calculated assemblies are traversed recursively with quantity factors.
 * Manual historical assemblies count as one parent; their parent_idx details
 * do not get counted again. Never mutates the source model.
 */
import type { CicloEditorModel, RigaCiclo } from "@/types/cycle";
import { calcolaCostoRiga } from "@/lib/cycle-calculator";
import { rowDepth } from "@/lib/cycle-hierarchy";

export type PieCostBucket = "terzisti" | "interne" | "fornitori";

export interface CyclePieCosts {
  terzisti: number;
  interne: number;
  fornitori: number;
  nonClassificati: number;
  esclusiAttrezzatura: number;
  totaleClassificato: number;
  totaleSenzaAttrezzatura: number;
}

const isTerzista = (r: RigaCiclo): boolean =>
  r.categoria === "LAVORAZIONE TERZISTA A PESO" ||
  r.categoria === "LAVORAZIONE TERZISTA A PEZZO";

export function calculateCyclePieCosts(cycle: CicloEditorModel): CyclePieCosts {
  const sums = {
    terzisti: 0,
    interne: 0,
    fornitori: 0,
    nonClassificati: 0,
    esclusiAttrezzatura: 0,
  };
  const righe = cycle.righe;
  // Validate also rows excluded in a temporary simulation. A disabled parent
  // must not make its valid descendants look like broken references.
  for (let i = 0; i < righe.length; i++) {
    if (righe[i].parent_idx != null) {
      const p = righe[i].parent_idx;
      if (!Number.isInteger(p) || p! < 0 || p! >= righe.length) throw new Error("Riferimento componente non valido");
      rowDepth(righe,i);
    }
  }

  const visit = (index: number, multiplier: number, depth: number, stack: Set<number>): void => {
    if (depth > 4 || stack.has(index)) throw new Error("Gerarchia degli assiemi non valida");
    const r = righe[index];
    if (!r || !Number.isFinite(multiplier) || multiplier < 0) throw new Error("Riga o quantità non valida");
    if (r.considera === false) return;
    if (r.categoria === "SPESA ATTREZZATURA DEDICATA" && r.considera !== true) return;
    if (r.assembly_auto) {
      if (r.categoria !== "COMPONENTE/ASSIEME") throw new Error("Categoria assieme non valida");
      const n = Number(r.nr_componenti);
      if (!Number.isFinite(n) || n < 0) throw new Error("Quantità assieme non valida");
      const nextStack = new Set(stack);
      nextStack.add(index);
      for (let i = 0; i < righe.length; i++) {
        if (righe[i].parent_idx === index) {
          visit(i, multiplier * n, depth + 1, nextStack);
        }
      }
      return;
    }
    // A leaf within an automatic assembly is a real cost. Legacy
    // parent_idx expansions aren't traversed (only auto assemblies recurse).
    const cost = multiplier * calcolaCostoRiga({ ...r, parent_idx: null }, cycle.costo_lavoro_min, cycle.lotto);
    if (!Number.isFinite(cost) || cost < 0) throw new Error("Costo negativo/non valido: impossibile rappresentarlo nella torta");
    if (r.categoria === "SPESA ATTREZZATURA DEDICATA") {
      sums.esclusiAttrezzatura += cost;
    } else if (isTerzista(r)) {
      sums.terzisti += cost;
    } else if (r.categoria === "LAVORAZIONE INTERNA") {
      sums.interne += cost;
    } else if (String(r.fornitore ?? "").trim()) {
      sums.fornitori += cost;
    } else {
      sums.nonClassificati += cost;
    }
  };

  for (let index = 0; index < righe.length; index++) {
    if (righe[index].parent_idx == null) {
      visit(index, 1, 1, new Set());
    }
  }

  return {
    ...sums,
    totaleClassificato: sums.terzisti + sums.interne + sums.fornitori,
    totaleSenzaAttrezzatura: sums.terzisti + sums.interne + sums.fornitori + sums.nonClassificati,
  };
}
