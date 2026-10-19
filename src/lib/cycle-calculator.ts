/**
 * DDCost Ciclo Calculator — replicates Python app formulas
 *
 * CORRECTED formulas after cross-check with original SQLite data:
 * - LAVORAZIONE INTERNA uses ciclo.costo_lavoro_min (NOT riga.costo_min)
 *   Standard: costo_lavoro_min / colpi_min * nr_componenti. Packaging:
 *   tempo_confezionamento_min / quantita_per_conf * costo_lavoro_min.
 * - Attrezzaggio is distributed over the larger of lotto_voce and the
 *   cycle/simulation lot; the preview can explicitly force lotto_voce
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

export type SetupLotMode = "max" | "row";

function getSetupLot(r: RigaCiclo, lottoSimulazione: number, mode: SetupLotMode = "max"): number {
  const lottoVoce = Number(r.lotto_voce) || 0;
  if (mode === "row" && lottoVoce > 0) return lottoVoce;
  return Math.max(lottoVoce, Number(lottoSimulazione) || 0);
}

function costoLavoroInternoPerPezzo(r: RigaCiclo, costoLavoroMin: number): number {
  if (r.confezionamento === true) {
    const pezziPerConfezione = Number(r.quantita_per_conf) || 0;
    const minutiPerConfezione = Number(r.tempo_confezionamento_min) || 0;
    if (pezziPerConfezione <= 0 || minutiPerConfezione <= 0) return 0;
    return (minutiPerConfezione / pezziPerConfezione) * costoLavoroMin;
  }
  if (r.colpi_min > 0) return costoLavoroMin / r.colpi_min * r.nr_componenti;
  return 0;
}

export function calcolaCostoRiga(
  r: RigaCiclo,
  costoLavoroMin: number,
  lotto: number | string,
  setupLotMode: SetupLotMode = "max",
): number {
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
      // Packaging time is per finished product; standard operations remain based on pieces/min.
      let costo = costoLavoroInternoPerPezzo(r, costoLavoroMin);
      if (r.attrezzaggio_min && r.attrezzaggio_min > 0) {
        const lottoAtt = getSetupLot(r, lot, setupLotMode);
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

/** Price per final item of an auto-assembly, using its direct and nested components.
 * Legacy detail expansions (parent_idx only) remain excluded from regular totals.
 */
export function costoRigaGerarchico(
  righe: RigaCiclo[],
  index: number,
  clm: number,
  lotto: number | string,
  setupLotMode: SetupLotMode = "max",
): number {
  const active=new Set<number>();
  function evalAt(i:number,depth:number):number {
    if(depth>4) throw new Error("Assieme oltre quattro livelli");
    if(active.has(i)) throw new Error("Ciclo di parentela negli assiemi");
    const r=righe[i];
    if(!r) throw new Error("Riga assieme non trovata");
    if(r.considera === false) return 0;
    active.add(i);
    try {
      if(r.assembly_auto === true) {
        if(r.categoria!=="COMPONENTE/ASSIEME") throw new Error("Categoria assieme non coerente");
        const children=righe.flatMap((c,k)=>c.parent_idx===i?[k]:[]);
        const amount=children.reduce((sum,k)=>sum+evalAt(k,depth+1),0);
        return amount * (Number(r.nr_componenti)||0);
      }
      // Omit parent_idx only for computing the raw detail value, not for
      // top-level accounting; the caller decides which rows are top level.
      return calcolaCostoRiga({...r,parent_idx:null},clm,lotto,setupLotMode);
    } finally { active.delete(i); }
  }
  return evalAt(index,1);
}

/** Tooling cost for a single row (in €, not per-piece) */
export function calcolaAttrezzaggioRiga(r: RigaCiclo, costoLavoroMin: number): number {
  if (r.categoria === "LAVORAZIONE INTERNA" && r.attrezzaggio_min > 0) {
    return r.attrezzaggio_min * costoLavoroMin;
  }
  return 0;
}

export function calcolaBreakdown(ciclo: CicloEditorModel, setupLotMode: SetupLotMode = "max"): Breakdown {
  const bd = emptyBreakdown();
  const clm = ciclo.costo_lavoro_min;
  const lotto = ciclo.lotto;

  for (const r of ciclo.righe) {
    if (!isRigaConsiderata(r)) continue;

    const index = ciclo.righe.indexOf(r);
    const costo = r.assembly_auto
      ? costoRigaGerarchico(ciclo.righe,index,clm,lotto,setupLotMode)
      : calcolaCostoRiga(r, clm, lotto,setupLotMode);
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
  if (!ciclo.righe.some(r=>r.assembly_auto)) {
    return ciclo.righe.reduce((sum, r) => sum + (r.considera === false ? 0 : calcolaAttrezzaggioRiga(r, clm)), 0);
  }
  const walk = (i:number,level:number):number => {
    const row=ciclo.righe[i];
    if(level>4 || !row || row.considera===false) return 0;
    if(row.assembly_auto) {
      return (Number(row.nr_componenti)||0) * ciclo.righe
        .reduce((sum,child,k)=>sum+(child.parent_idx===i?walk(k,level+1):0),0);
    }
    return calcolaAttrezzaggioRiga(row,clm);
  };
  return ciclo.righe.reduce((sum,r,i)=>sum+(r.parent_idx==null?walk(i,1):0),0);
}

/** Setup cost per item using the larger of row and simulation lots by default. */
export function calcolaAttrezzaggioPerPezzo(
  ciclo: CicloEditorModel,
  lotto: number,
  setupLotMode: SetupLotMode = "max",
): number {
  if (!(lotto > 0)) return 0;
  const active = new Set<number>();
  function setupAt(index: number, depth: number): number {
    if (depth > 4) throw new Error("Assieme oltre quattro livelli");
    if (active.has(index)) throw new Error("Ciclo di parentela negli assiemi");
    const row = ciclo.righe[index];
    if (!row || row.considera === false) return 0;
    active.add(index);
    try {
      if (row.assembly_auto === true) {
        const children = ciclo.righe.flatMap((child, childIndex) =>
          child.parent_idx === index ? [childIndex] : []
        );
        const quantity = Number(row.nr_componenti) || 0;
        return children.reduce((sum, childIndex) => sum + setupAt(childIndex, depth + 1), 0) * quantity;
      }
      if (row.categoria !== "LAVORAZIONE INTERNA" || !(row.attrezzaggio_min > 0)) return 0;
      const setupLot = getSetupLot(row, lotto, setupLotMode);
      return setupLot > 0 ? row.attrezzaggio_min * ciclo.costo_lavoro_min / setupLot : 0;
    } finally {
      active.delete(index);
    }
  }

  return ciclo.righe.reduce((sum, row, index) =>
    row.parent_idx == null ? sum + setupAt(index, 1) : sum, 0
  );
}

/** Fixed setup and dedicated-tooling cost per finished product at a given lot. */
export function calcolaCostoFissoPerPezzo(
  ciclo: CicloEditorModel,
  lotto: number,
  setupLotMode: SetupLotMode = "max",
): number {
  if (!(lotto > 0)) return 0;
  const active = new Set<number>();
  function fixedAt(index: number, depth: number): number {
    if (depth > 4) throw new Error("Assieme oltre quattro livelli");
    if (active.has(index)) throw new Error("Ciclo di parentela negli assiemi");
    const row = ciclo.righe[index];
    if (!row || row.considera === false) return 0;
    active.add(index);
    try {
      if (row.assembly_auto === true) {
        const children = ciclo.righe.flatMap((child, childIndex) =>
          child.parent_idx === index ? [childIndex] : []
        );
        const quantity = Number(row.nr_componenti) || 0;
        return children.reduce((sum, childIndex) => sum + fixedAt(childIndex, depth + 1), 0) * quantity;
      }
      if (row.categoria === "LAVORAZIONE INTERNA" && row.attrezzaggio_min > 0) {
        const setupLot = getSetupLot(row, lotto, setupLotMode);
        return setupLot > 0 ? row.attrezzaggio_min * ciclo.costo_lavoro_min / setupLot : 0;
      }
      if (row.categoria === "SPESA ATTREZZATURA DEDICATA" && row.considera === true) {
        return row.costo_unitario / lotto;
      }
      return 0;
    } finally {
      active.delete(index);
    }
  }

  return ciclo.righe.reduce((sum, row, index) =>
    row.parent_idx == null ? sum + fixedAt(index, 1) : sum, 0
  );
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

export function calcolaSimulazioni(
  ciclo: CicloEditorModel,
  setupLotMode: SetupLotMode = "max",
  forceCycleLotSimulationRows: ReadonlySet<number> = new Set(),
): SimulazioneLotto[] {
  const lotti = ciclo.lotti_personalizzati?.length
    ? ciclo.lotti_personalizzati
    : [25, 50, 100, 250, 500, 1000];

  const clm = ciclo.costo_lavoro_min;

  // Keep the legacy row aggregation for cycles without auto-assemblies;
  // only explicit assemblies need the recursive breakdown.
  if (ciclo.righe.some(r=>r.assembly_auto)) {
    return lotti.map((lotto, simulationIndex)=>{
      const rowSetupLotMode = forceCycleLotSimulationRows.has(simulationIndex) ? "row" : setupLotMode;
      const bd=calcolaBreakdown({...ciclo,lotto:String(lotto)},rowSetupLotMode);
      const costoStandard=calcolaCostoStandard(bd);
      const fullCost=calcolaFullCost(costoStandard,ciclo.ricarico_spese);
      return {
        lotto, breakdown:bd, costo_standard:costoStandard, full_cost:fullCost,
        prezzo_minimo:calcolaPrezzoMinimo(fullCost,ciclo.margine_minimo),
        attrezzaggio_pz: calcolaAttrezzaggioPerPezzo(ciclo, lotto, rowSetupLotMode),
      };
    });
  }
  return lotti.map((lotto, simulationIndex) => {
    const rowSetupLotMode = forceCycleLotSimulationRows.has(simulationIndex) ? "row" : setupLotMode;
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
          let costo = costoLavoroInternoPerPezzo(r, clm);
          if (r.attrezzaggio_min && r.attrezzaggio_min > 0) {
            const lottoAtt = getSetupLot(r, lotto, rowSetupLotMode);
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
    const attrezzaggioPz = calcolaAttrezzaggioPerPezzo(ciclo, lotto, rowSetupLotMode);

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

export function ricalcolaCiclo(
  ciclo: CicloEditorModel,
  setupLotMode: SetupLotMode = "max",
  forceCycleLotSimulationRows: ReadonlySet<number> = new Set(),
): CicloEditorModel {
  const bd = calcolaBreakdown(ciclo, setupLotMode);
  const costoStandard = calcolaCostoStandard(bd);
  const fullCost = calcolaFullCost(costoStandard, ciclo.ricarico_spese);
  const prezzoMinimo = calcolaPrezzoMinimo(fullCost, ciclo.margine_minimo);
  const simulazioni = calcolaSimulazioni(ciclo, setupLotMode, forceCycleLotSimulationRows);

  return {
    ...ciclo,
    breakdown: bd,
    costo_standard: costoStandard,
    full_cost: fullCost,
    prezzo_minimo: prezzoMinimo,
    simulazioni,
  };
}
