/**
 * DDCost Ciclo Calculator — replicates Python app formulas
 *
 * CORRECTED formulas after cross-check with original SQLite data:
 * - LAVORAZIONE INTERNA uses ciclo.costo_lavoro_min (NOT riga.costo_min)
 *   Formula: costo_lavoro_min / colpi_min * nr_componenti
 *   (colpi_min = pieces per minute; costo_lavoro_min = €/minute)
 * - Attrezzaggio: attrezzaggio_min * costo_lavoro_min, distributed over lotto_voce if present, else lotto
 * - MATERIA PRIMA: peso_kg * nr_componenti * costo_unitario * (1 + sfrido/100)
 *   If peso_kg==0 but dimensions exist, estimate weight = L*l*s*7.85e-6
 * - LAVORAZIONE A PESO / TERZISTA A PESO: peso_kg * nr_componenti * costo_unitario
 * - LAVORAZIONE A PEZZO / TERZISTA A PEZZO: nr_componenti * costo_unitario
 * - SPESA ATTREZZATURA DEDICATA: costo_unitario / lotto (only if explicitly considered)
 * - Rows with parent_idx are detail expansions — their cost is already in the parent
 */

import { emptyBreakdown, type CicloEditorModel, type RigaCiclo, type Breakdown, type SimulazioneLotto } from "@/types/cycle";

export const BREAKDOWN_KEYS = [
  "COMPONENTE/ASSIEME",
  "COMPONENTE",
  "MATERIA PRIMA DA TRASFORMARE",
  "LAVORAZIONE INTERNA",
  "LAVORAZIONE TERZISTA A PESO",
  "LAVORAZIONE A PESO",
  "LAVORAZIONE TERZISTA A PEZZO",
  "LAVORAZIONE A PEZZO",
  "SPESA ATTREZZATURA DEDICATA",
] as const;

export type BreakdownKey = (typeof BREAKDOWN_KEYS)[number];

/** Estimate weight from dimensions when peso_kg is not set (mm, density 7.85 g/cm³) */
export function stimaPesoDaDimensioni(r: RigaCiclo): number {
  const L = r.lunghezza || 0;
  const l = r.larghezza || 0;
  const s = r.spessore || 0;
  if (L <= 0 || l <= 0 || s <= 0) return 0;
  // Volume in mm³ * density in kg/mm³ (7.85 g/cm³ = 7.85e-6 kg/mm³)
  return L * l * s * 7.85e-6;
}

/** Whether a row should contribute to cost breakdown */
export function isRigaConsiderata(r: RigaCiclo): boolean {
  // Rows with parent_idx are detail expansions — skip them
  if (r.parent_idx != null) return false;

  // SPESA ATTREZZATURA DEDICATA is included ONLY if explicitly marked
  if (r.categoria === "SPESA ATTREZZATURA DEDICATA") {
    return r.considera === true;
  }

  // All other categories: included unless explicitly excluded
  return r.considera !== false;
}

export function calcolaCostoRiga(r: RigaCiclo, costoLavoroMin: number, lotto: number | string): number {
  if (!isRigaConsiderata(r)) return 0;
  const lot = typeof lotto === "string" ? parseFloat(lotto) || 100 : lotto;

  const nr = r.nr_componenti;
  const cu = r.costo_unitario;

  switch (r.categoria) {
    case "COMPONENTE":
    case "COMPONENTE/ASSIEME":
      return nr * cu;

    case "MATERIA PRIMA DA TRASFORMARE": {
      const peso = r.peso_kg > 0 ? r.peso_kg : stimaPesoDaDimensioni(r);
      const sfrido = r.sfrido || 0;
      return peso * nr * cu * (1 + sfrido / 100);
    }

    case "LAVORAZIONE INTERNA": {
      let costo = 0;
      if (r.colpi_min && r.colpi_min > 0) {
        // costo per componente = (€/min) / (pezzi/min) = €/pezzo
        costo += (costoLavoroMin / r.colpi_min) * nr;
      }
      if (r.attrezzaggio_min && r.attrezzaggio_min > 0) {
        const lottoAtt = r.lotto_voce && r.lotto_voce > 0 ? r.lotto_voce : lot;
        if (lottoAtt > 0) {
          costo += (r.attrezzaggio_min * costoLavoroMin) / lottoAtt;
        }
      }
      return costo;
    }

    case "LAVORAZIONE A PESO":
    case "LAVORAZIONE TERZISTA A PESO": {
      const peso = r.peso_kg > 0 ? r.peso_kg : stimaPesoDaDimensioni(r);
      return peso * nr * cu;
    }

    case "LAVORAZIONE A PEZZO":
    case "LAVORAZIONE TERZISTA A PEZZO":
      return nr * cu;

    case "SPESA ATTREZZATURA DEDICATA": {
      if (lot > 0) return cu / lot;
      return 0;
    }

    default:
      return 0;
  }
}

/** Tooling cost for a single row (in €, not per-piece) */
export function calcolaAttrezzaggioRiga(r: RigaCiclo, costoLavoroMin: number): number {
  if (r.categoria === "LAVORAZIONE INTERNA" && r.attrezzaggio_min > 0) {
    return r.attrezzaggio_min * costoLavoroMin;
  }
  return 0;
}

export function calcolaBreakdown(ciclo: CicloEditorModel): Breakdown {
  const bd = emptyBreakdown();
  const clm = ciclo.costo_lavoro_min;
  const lotto = ciclo.lotto;

  for (const r of ciclo.righe) {
    if (!isRigaConsiderata(r)) continue;

    const costo = calcolaCostoRiga(r, clm, lotto);
    switch (r.categoria) {
      case "COMPONENTE":
        bd.COMPONENTE += costo;
        break;
      case "COMPONENTE/ASSIEME":
        bd["COMPONENTE/ASSIEME"] += costo;
        break;
      case "MATERIA PRIMA DA TRASFORMARE":
        bd["MATERIA PRIMA DA TRASFORMARE"] += costo;
        break;
      case "LAVORAZIONE INTERNA":
        bd["LAVORAZIONE INTERNA"] += costo;
        break;
      case "LAVORAZIONE A PESO":
        bd["LAVORAZIONE A PESO"] += costo;
        break;
      case "LAVORAZIONE TERZISTA A PESO":
        bd["LAVORAZIONE TERZISTA A PESO"] += costo;
        break;
      case "LAVORAZIONE A PEZZO":
        bd["LAVORAZIONE A PEZZO"] += costo;
        break;
      case "LAVORAZIONE TERZISTA A PEZZO":
        bd["LAVORAZIONE TERZISTA A PEZZO"] += costo;
        break;
      case "SPESA ATTREZZATURA DEDICATA":
        bd["SPESA ATTREZZATURA DEDICATA"] += costo;
        break;
    }
  }

  return bd;
}

export function calcolaAttrezzaggioTotale(ciclo: CicloEditorModel): number {
  const clm = ciclo.costo_lavoro_min;
  return ciclo.righe.reduce((sum, r) => sum + calcolaAttrezzaggioRiga(r, clm), 0);
}

export function calcolaCostoStandard(bd: Breakdown): number {
  return BREAKDOWN_KEYS.reduce((sum, cat) => sum + (bd[cat] || 0), 0);
}

export function calcolaFullCost(costoStandard: number, ricaricoSpese: number): number {
  return costoStandard * (1 + ricaricoSpese);
}

export function calcolaPrezzoMinimo(fullCost: number, margineMinimo: number): number {
  if (margineMinimo >= 1) return fullCost;
  return fullCost / (1 - margineMinimo);
}

export function calcolaSimulazioni(ciclo: CicloEditorModel): SimulazioneLotto[] {
  const lotti = ciclo.lotti_personalizzati?.length
    ? ciclo.lotti_personalizzati
    : [25, 50, 100, 250, 500, 1000];

  const clm = ciclo.costo_lavoro_min;
  const attrezzaggioTotale = calcolaAttrezzaggioTotale(ciclo);

  return lotti.map((lotto) => {
    const bd = emptyBreakdown();

    for (const r of ciclo.righe) {
      if (!isRigaConsiderata(r)) continue;

      const nr = r.nr_componenti;
      const cu = r.costo_unitario;

      switch (r.categoria) {
        case "COMPONENTE":
        case "COMPONENTE/ASSIEME": {
          const costo = nr * cu;
          if (r.categoria === "COMPONENTE") bd.COMPONENTE += costo;
          else bd["COMPONENTE/ASSIEME"] += costo;
          break;
        }
        case "MATERIA PRIMA DA TRASFORMARE": {
          const peso = r.peso_kg > 0 ? r.peso_kg : stimaPesoDaDimensioni(r);
          const sfrido = r.sfrido || 0;
          const costo = peso * nr * cu * (1 + sfrido / 100);
          bd["MATERIA PRIMA DA TRASFORMARE"] += costo;
          break;
        }
        case "LAVORAZIONE INTERNA": {
          let costo = 0;
          if (r.colpi_min && r.colpi_min > 0) {
            costo += (clm / r.colpi_min) * nr;
          }
          if (r.attrezzaggio_min && r.attrezzaggio_min > 0) {
            const lottoAtt = r.lotto_voce && r.lotto_voce > 0 ? r.lotto_voce : lotto;
            if (lottoAtt > 0) {
              costo += (r.attrezzaggio_min * clm) / lottoAtt;
            }
          }
          bd["LAVORAZIONE INTERNA"] += costo;
          break;
        }
        case "LAVORAZIONE A PESO":
        case "LAVORAZIONE TERZISTA A PESO": {
          const peso = r.peso_kg > 0 ? r.peso_kg : stimaPesoDaDimensioni(r);
          const costo = peso * nr * cu;
          if (r.categoria === "LAVORAZIONE A PESO") bd["LAVORAZIONE A PESO"] += costo;
          else bd["LAVORAZIONE TERZISTA A PESO"] += costo;
          break;
        }
        case "LAVORAZIONE A PEZZO":
        case "LAVORAZIONE TERZISTA A PEZZO": {
          const costo = nr * cu;
          if (r.categoria === "LAVORAZIONE A PEZZO") bd["LAVORAZIONE A PEZZO"] += costo;
          else bd["LAVORAZIONE TERZISTA A PEZZO"] += costo;
          break;
        }
        case "SPESA ATTREZZATURA DEDICATA": {
          if (lotto > 0) {
            bd["SPESA ATTREZZATURA DEDICATA"] += cu / lotto;
          }
          break;
        }
      }
    }

    const costoStandard = calcolaCostoStandard(bd);
    const fullCost = calcolaFullCost(costoStandard, ciclo.ricarico_spese);
    const prezzoMinimo = calcolaPrezzoMinimo(fullCost, ciclo.margine_minimo);
    const attrezzaggioPz = lotto > 0 ? attrezzaggioTotale / lotto : 0;

    return {
      lotto,
      breakdown: bd,
      costo_standard: costoStandard,
      full_cost: fullCost,
      prezzo_minimo: prezzoMinimo,
      attrezzaggio_pz: attrezzaggioPz,
    };
  });
}

export function ricalcolaCiclo(ciclo: CicloEditorModel): CicloEditorModel {
  const bd = calcolaBreakdown(ciclo);
  const costoStandard = calcolaCostoStandard(bd);
  const fullCost = calcolaFullCost(costoStandard, ciclo.ricarico_spese);
  const prezzoMinimo = calcolaPrezzoMinimo(fullCost, ciclo.margine_minimo);
  const simulazioni = calcolaSimulazioni(ciclo);

  return {
    ...ciclo,
    breakdown: bd,
    costo_standard: costoStandard,
    full_cost: fullCost,
    prezzo_minimo: prezzoMinimo,
    simulazioni,
  };
}
