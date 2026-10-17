/**
 * Theoretical full rectangular blank weight. All dimensions are millimetres;
 * densities are indicative g/cm3 (equivalently 1000 kg/m3).
 * Holes, cut-outs, profiles, bends and scrap must be estimated separately.
 * Used only if the user explicitly unchecks "Conosci il costo del materiale".
 */
export const MATERIAL_DENSITY_G_CM3 = {
  ferro: 7.85,
  inox: 8.00,
  ottone: 8.50,
} as const;
export type MaterialName=keyof typeof MATERIAL_DENSITY_G_CM3;
export interface MaterialByWeight {
  material:MaterialName;
  lengthMm:number;
  widthMm:number;
  thicknessMm:number;
  euroPerKg:number;
}
export interface MaterialWeightResult {
  densityGcm3:number;
  theoreticalWeightKg:number;
  materialCostPerPiece:number;
}
export function calculateMaterialByWeight(v:MaterialByWeight):MaterialWeightResult {
  const density=MATERIAL_DENSITY_G_CM3[v.material];
  if(!density)throw new Error("Seleziona ferro, inox oppure ottone prima di calcolare il peso");
  if(![v.lengthMm,v.widthMm,v.thicknessMm,v.euroPerKg].every(Number.isFinite) ||
     v.lengthMm<=0 || v.widthMm<=0 || v.thicknessMm<=0 ||
     v.euroPerKg<0)
     throw new Error("Per il materiale a peso, indica lunghezza, larghezza e spessore maggiori di zero e un costo €/kg non negativo");
  // Volume mm3 / 1000 -> cm3, multiply by g/cm3 and /1000 -> kg.
  const theoreticalWeightKg=v.lengthMm*v.widthMm*v.thicknessMm*density/1_000_000;
  if(!Number.isFinite(theoreticalWeightKg) || theoreticalWeightKg<=0)
    throw new Error("Peso teorico del materiale non valido");
  return {densityGcm3:density,theoreticalWeightKg,
    materialCostPerPiece:theoreticalWeightKg*v.euroPerKg};
}

export const MODIFICATION_OBJECTS=[
  "occhio","collo","zanca","lunghezza","spessore",
  "applicazione rinforzi saldati",
  "altre pieghe o variazioni alla geometria",
] as const;
export type ModificationObject=typeof MODIFICATION_OBJECTS[number];
export function toggleModificationObject(current:readonly string[]|unknown,option:ModificationObject):string[]{
  const values=Array.isArray(current)?current.filter((v):v is string=>typeof v==="string"):[];
  return values.includes(option)?values.filter(v=>v!==option):[...values,option];
}
