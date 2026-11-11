import {isFixedPrice} from "./quote-series";
import { RAW_GEOMETRIES, RAW_MATERIALS, rawMaterialCalculation } from "./cycle-raw-material";
import { emptyRiga } from "../types/cycle";

/** Keep the historical generic inox density (AISI 316 nominal value). */
const MATERIAL_IDS = { ferro: "acciaio", inox: "inox316", ottone: "ottone", alluminio: "alluminio" } as const;
export type MaterialName = keyof typeof MATERIAL_IDS;
export const MATERIAL_DENSITY_G_CM3 = Object.fromEntries(
  Object.entries(MATERIAL_IDS).map(([name,id])=>[name,RAW_MATERIALS.find(m=>m.id===id)!.density/1000])
) as Record<MaterialName,number>;
export const QUOTE_MATERIAL_HELP = "Seleziona la geometria e inserisci le dimensioni del materiale e il costo al kg. Il sistema calcolerà il peso e il costo del materiale per pezzo.";
export const QUOTE_MATERIAL_GEOMETRIES = RAW_GEOMETRIES.map(g=>({
  ...g, label:g.id==="tondino"?"Tondo / tondino pieno":g.id==="tubo"?"Tubo tondo":g.label,
}));

export interface MaterialByWeight {
  material:MaterialName;
  /** Undefined means a saved rectangular blank from before geometry selection. */
  geometry?:string;
  lengthMm:number;
  widthMm?:number;
  thicknessMm?:number;
  diameterMm?:number;
  innerDiameterMm?:number;
  euroPerKg:number;
}
export interface MaterialWeightResult {
  densityGcm3:number;
  theoreticalWeightKg:number;
  materialCostPerPiece:number;
}
export function quoteMaterialGeometry(product:Record<string,unknown>):string {
  // Do not migrate historical records on read. An explicit empty choice stays missing.
  return product.geometria_materiale===undefined?"piatto":String(product.geometria_materiale??"");
}
export function quoteMaterialDimensionFields(product:Record<string,unknown>) {
  const geometry=quoteMaterialGeometry(product);
  if(!RAW_GEOMETRIES.some(g=>g.id===geometry))return [];
  return [
    {key:"lunghezza_mm",label:"Lunghezza (mm)"},
    ...((geometry==="piatto"||geometry==="nastro")?[
      {key:"larghezza_mm",label:"Larghezza (mm)"},
      {key:"spessore_mm",label:"Spessore (mm)"},
    ]:[{key:"diametro_mm",label:geometry==="tubo"?"Diametro esterno (mm)":"Diametro (mm)"}]),
    ...(geometry==="tubo"?[{key:"diametro_interno_mm",label:"Diametro interno (mm)"}]:[]),
  ];
}
export function calculateMaterialByWeight(v:MaterialByWeight):MaterialWeightResult {
  const geometry=v.geometry===undefined?"piatto":v.geometry;
  if(!RAW_GEOMETRIES.some(g=>g.id===geometry))throw new Error("Seleziona la geometria del materiale.");
  const materialId=MATERIAL_IDS[v.material];
  const density=MATERIAL_DENSITY_G_CM3[v.material];
  if(!materialId || !density)throw new Error("Seleziona ferro, inox, ottone oppure alluminio prima di calcolare il peso");
  const result=rawMaterialCalculation({
    ...emptyRiga(), categoria:"MATERIA PRIMA DA TRASFORMARE", materia_prima_versione:2,
    materiale_id:materialId, geometria_materia_prima:geometry as typeof RAW_GEOMETRIES[number]["id"],
    lunghezza:v.lengthMm, larghezza:v.widthMm??0, spessore:v.thicknessMm??0,
    diametro:v.diameterMm??0, diametro_interno:v.innerDiameterMm??0,
    peso_modalita:"automatico", unita_costo_materiale:"kg", nr_componenti:1, costo_unitario:v.euroPerKg,
  });
  if(result.errors.length)throw new Error(result.errors[0]);
  // Preserve the exact old order of operations for an unversioned rectangular blank.
  const theoreticalWeightKg=v.geometry===undefined
    ?v.lengthMm*(v.widthMm!)*(v.thicknessMm!)*density/1_000_000
    :result.weightKg!;
  const materialCostPerPiece=theoreticalWeightKg*v.euroPerKg;
  if(!Number.isFinite(theoreticalWeightKg)||theoreticalWeightKg<=0||!Number.isFinite(materialCostPerPiece))
    throw new Error("Peso o costo del materiale non valido");
  return {densityGcm3:density,theoreticalWeightKg,materialCostPerPiece};
}
export function calculateQuoteMaterial(product:Record<string,unknown>):MaterialWeightResult {
  return calculateMaterialByWeight({
    material:String(product.materiale_prodotto??"") as MaterialName,
    geometry:product.geometria_materiale===undefined?undefined:quoteMaterialGeometry(product),
    lengthMm:Number(product.lunghezza_mm), widthMm:Number(product.larghezza_mm),
    thicknessMm:Number(product.spessore_mm), diameterMm:Number(product.diametro_mm),
    innerDiameterMm:Number(product.diametro_interno_mm), euroPerKg:Number(product.costo_materiale_kg),
  });
}
export function quoteMaterialError(products:readonly Record<string,unknown>[]):string|null {
  for(const [index,product] of products.entries()){
    if(isFixedPrice(product)||product.costo_materiale_noto!==false)continue;
    try{calculateQuoteMaterial(product);}catch(error){
      return `Prodotto ${index+1}: ${error instanceof Error?error.message:"Materiale non valido"}`;
    }
  }
  return null;
}

export const MODIFICATION_OBJECTS=[
  "occhio","collo","zanca","lunghezza","spessore",
  "applicazione rinforzi saldati",
  "altre pieghe o variazioni alla geometria",
] as const;
export type ModificationObject=typeof MODIFICATION_OBJECTS[number];
export function toggleModificationObject(current:readonly string[]|unknown,option:string):string[]{
  const values=Array.isArray(current)?current.filter((v):v is string=>typeof v==="string"):[];
  return values.includes(option)?values.filter(v=>v!==option):[...values,option];
}
