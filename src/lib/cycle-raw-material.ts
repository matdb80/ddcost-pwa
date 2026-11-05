import type { RigaCiclo } from "@/types/cycle";

/** Nominal room-temperature densities. Sources and limits: docs/MATERIE_E_OFFERTE_2026-11-05.md. */
export const RAW_MATERIALS = [
  { id: "acciaio", label: "Ferro (acciaio)", density: 7850 },
  { id: "inox304", label: "Inox AISI 304", density: 7900 },
  { id: "inox316", label: "Inox AISI 316", density: 8000 },
  { id: "alluminio", label: "Alluminio", density: 2700 },
  { id: "ottone", label: "Ottone", density: 8500 },
] as const;

export const RAW_GEOMETRIES = [
  { id: "piatto", label: "Piatto" }, { id: "nastro", label: "Nastro" },
  { id: "tondino", label: "Tondino" }, { id: "tubo", label: "Tubo" },
] as const;

const positive = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;
const nonnegative = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;

export function rawMaterialCalculation(row: RigaCiclo) {
  const errors: string[] = [];
  const material = RAW_MATERIALS.find(m => m.id === row.materiale_id);
  const density = row.densita_kg_m3 ?? material?.density;
  const geometry = row.geometria_materia_prima;
  const lengthM = positive(row.lunghezza) ? row.lunghezza / 1000 : null;
  let volumeMm3: number | null = null;
  if (lengthM !== null) {
    if ((geometry === "piatto" || geometry === "nastro") && positive(row.larghezza) && positive(row.spessore)) {
      volumeMm3 = row.lunghezza * row.larghezza * row.spessore;
    } else if (geometry === "tondino" && positive(row.diametro)) {
      volumeMm3 = Math.PI * row.diametro ** 2 / 4 * row.lunghezza;
    } else if (geometry === "tubo" && positive(row.diametro) && positive(row.diametro_interno) && row.diametro_interno < row.diametro) {
      volumeMm3 = Math.PI * (row.diametro ** 2 - row.diametro_interno ** 2) / 4 * row.lunghezza;
    }
  }
  if (volumeMm3 !== null && !positive(volumeMm3)) volumeMm3 = null;
  const theoreticalWeight = volumeMm3 !== null && material && positive(density)
    ? volumeMm3 * density / 1e9 : null;
  const weightKg = row.peso_modalita === "manuale"
    ? positive(row.peso_kg) ? row.peso_kg : null
    : theoreticalWeight !== null && positive(theoreticalWeight) ? theoreticalWeight : null;
  if (row.peso_modalita === "manuale") {
    if (weightKg === null) errors.push("Inserisci un peso manuale maggiore di zero.");
  } else {
    if (!material || !positive(density)) errors.push("Seleziona il materiale per calcolare il peso.");
    if (!RAW_GEOMETRIES.some(g => g.id === geometry)) errors.push("Seleziona la geometria della materia prima.");
    if (lengthM === null) errors.push("Inserisci la lunghezza totale del materiale in mm.");
    if ((geometry === "piatto" || geometry === "nastro") && (!positive(row.larghezza) || !positive(row.spessore))) {
      errors.push("Inserisci larghezza e spessore maggiori di zero.");
    }
    if ((geometry === "tubo" || geometry === "tondino") && !positive(row.diametro)) errors.push("Inserisci il diametro esterno maggiore di zero.");
    if (geometry === "tubo" && (!positive(row.diametro_interno) || row.diametro_interno >= row.diametro)) {
      errors.push("Il diametro interno deve essere maggiore di zero e inferiore a quello esterno.");
    }
    if (errors.length === 0 && weightKg === null) errors.push("Le dimensioni non producono un peso valido.");
  }
  if (row.unita_costo_materiale !== "kg" && row.unita_costo_materiale !== "m") errors.push("Seleziona il costo in €/kg oppure €/metro.");
  if (row.unita_costo_materiale === "m" && lengthM === null && !errors.some(e => e.includes("lunghezza"))) errors.push("Per il costo al metro serve la lunghezza totale in mm.");
  if (!positive(row.nr_componenti)) errors.push("Il numero di componenti deve essere maggiore di zero.");
  if (!nonnegative(row.costo_unitario)) errors.push("Il costo unitario deve essere un numero non negativo.");
  const amount = row.unita_costo_materiale === "m" ? lengthM : weightKg;
  const value = amount === null ? null : amount * row.nr_componenti * row.costo_unitario;
  if (value !== null && !nonnegative(value)) errors.push("Il costo calcolato non è valido.");
  return { weightKg, volumeMm3, lengthM, density, errors, cost: errors.length || value === null ? null : value };
}

/** Existing rows are not migrated on read/recalculation. Opening their editor preserves
 * their effective weight, including the old allowance, until the user chooses geometry. */
export function prepareRawMaterialEditor(row: RigaCiclo, existing = true): RigaCiclo {
  if (row.materia_prima_versione === 2) return { ...row };
  const text = String(row.tipo_materiale ?? "").toLocaleLowerCase("it-IT");
  const material = text.includes("316") ? RAW_MATERIALS[2] : text.includes("304") ? RAW_MATERIALS[1]
    : text.includes("allumin") ? RAW_MATERIALS[3] : text.includes("otton") ? RAW_MATERIALS[4]
    : !text || text.includes("ferro") || (text.includes("acciaio") && !text.includes("inox")) ? RAW_MATERIALS[0] : undefined;
  const shape = String(row.tipo_materia_prima ?? "").toLocaleLowerCase("it-IT");
  const geometry = shape.includes("tubo") ? "tubo" : shape.includes("tond") ? "tondino" : shape.includes("nastro") ? "nastro" : "piatto";
  // Exactly the original formula, including its steel-density fallback.
  const oldWeight = row.peso_kg > 0 ? row.peso_kg
    : row.lunghezza > 0 && row.larghezza > 0 && row.spessore > 0 ? row.lunghezza * row.larghezza * row.spessore * 7.85e-6 : 0;
  const preservedWeight = oldWeight * (1 + (row.sfrido || 0) / 100);
  const preserve = existing && positive(preservedWeight);
  return {
    ...row, materia_prima_versione: 2, materiale_id: material?.id,
    tipo_materiale: material?.label ?? row.tipo_materiale,
    geometria_materia_prima: geometry, tipo_materia_prima: RAW_GEOMETRIES.find(g => g.id === geometry)!.label,
    densita_kg_m3: material?.density, diametro_interno: row.diametro_interno ?? 0,
    unita_costo_materiale: "kg", peso_modalita: preserve ? "manuale" : "automatico",
    peso_kg: preserve ? preservedWeight : 0, sfrido: 0, peso_storico_preservato: preserve,
  };
}

export function finalizeRawMaterialRow(row: RigaCiclo): RigaCiclo {
  const calculated = rawMaterialCalculation(row);
  if (calculated.errors.length) throw new Error(calculated.errors.join("\n"));
  return { ...row, materia_prima_versione: 2, sfrido: 0, peso_kg: calculated.weightKg! };
}
