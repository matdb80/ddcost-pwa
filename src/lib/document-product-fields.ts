import {quoteInoxGrade} from "./quote-inox";
import {ralOutputCode,validRal,temporaryCodePrefix,temporaryCode,TEMPORARY_FAMILIES,TEMPORARY_MATERIALS} from "./ral-pricing";
import {isFixedPrice} from "./quote-series";
type Data=Record<string,any>;
const materialNames:Record<string,string>={ferro:"FERRO",inox:"INOX",ottone:"OTTONE",alluminio:"ALLUMINIO"};
const materialTypes:Record<string,string>={I:"ferro",X:"inox","6":"inox",B:"ottone",A:"alluminio"};
function legacyParts(code:string){
  const match=/^T([A-Z]{2})(\d{7})([IX6])$/.exec(code);
  if(!match || !TEMPORARY_FAMILIES.includes(match[1] as any) || Number(match[2])===0)return null;
  return {family:match[1],sequence:Number(match[2]),material:match[3]};
}
/** Complete only the missing fixed finish of the old temporary-code format.
 * Keep the original issuance metadata and sequence; never reserve a new code. */
export function documentProductCode(row:Data,document:Data):string {
  const code=String(row.codice??"").trim();
  if(validRal(document.verniciatura_ral)&&row.a_forfait!==true)return ralOutputCode(code,document.verniciatura_ral.color);
  if(document.ral_consolidato&&validRal(document.ral_riepilogo)&&row.a_forfait!==true)return ralOutputCode(code,document.ral_riepilogo.color);
  if(document.verniciatura_ral || document.ral_consolidato || isFixedPrice(row))return code;
  const parts=legacyParts(code);
  if(!parts)return code;
  const selected=String(row.materiale_prodotto??"").trim().toLowerCase();
  if(selected && selected!==materialTypes[parts.material])return code;
  const metadata=row.codice_temporaneo;
  if(metadata){
    if(metadata.code!==code || metadata.color!=null || metadata.family!==parts.family ||
      metadata.sequence!==parts.sequence || metadata.material!==parts.material)return code;
  }else if(!selected)return code; // No inference for an unclassified, manually entered SKU.
  return temporaryCode(parts.sequence,parts.family,parts.material,null);
}
export function normalizeDocumentTemporaryCodes<T extends Data>(document:T,rowKey:"prodotti"|"righe"):T {
  // Keep stored base codes for pricing; transform codes only when displaying them.
  if(document.verniciatura_ral||document.ral_consolidato||!Array.isArray(document[rowKey]))return document;
  return {...document,[rowKey]:document[rowKey].map((row:Data)=>{
    const code=documentProductCode(row,document);
    return code===String(row.codice??"").trim()?row:{...row,codice:code};
  })};
}
/** Material is appended for presentation only, outside the editable 60 characters. */
export function documentProductDescription(row:Data,language:"it"|"en"="it"):string {
  const description=String(row.descrizione??"").trim();
  if(isFixedPrice(row))return description;
  const selected=String(row.materiale_prodotto??"").trim().toLowerCase();
  let material=materialNames[selected]??"";
  const metadata=row.codice_temporaneo;
  if(metadata && (!selected || selected===materialTypes[metadata.material])){
    try{
      const prefix=temporaryCodePrefix(metadata.sequence,metadata.family,metadata.material);
      const code=String(row.codice??"").trim();
      if(typeof metadata.code==="string" && metadata.code.startsWith(prefix) &&
        (metadata.code===code || documentProductCode({...row,codice:metadata.code},{})===code))
        material=TEMPORARY_MATERIALS[metadata.material as keyof typeof TEMPORARY_MATERIALS].toUpperCase();
    }catch{/* Retain the explicitly selected generic material. */}
  }
  if(selected==="inox"&&quoteInoxGrade(row))material="INOX AISI "+quoteInoxGrade(row);
  if(!material || description.toUpperCase().endsWith(material))return description;
  if(language==="en")material=material.replace(/^FERRO$/, "IRON").replace(/^INOX/, "STAINLESS STEEL").replace(/^OTTONE$/, "BRASS").replace(/^ALLUMINIO$/, "ALUMINIUM");
  return [description,material].filter(Boolean).join(" — ");
}
