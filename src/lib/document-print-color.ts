import {validRal,ralColors,isNaturalTemporaryCode} from "./ral-pricing";

/** A distributor copy carries the selected colour in its consolidated summary,
 * because its already-painted prices must not receive the surcharge twice. */
function basePrintColor(document:Record<string,unknown>,language:"it"|"en"="it"):string {
  if(document.verniciatura_ral){
    if(!validRal(document.verniciatura_ral))throw new Error("Seleziona un colore RAL valido prima di esportare il PDF");
    return "RAL "+document.verniciatura_ral.color;
  }
  const summary=document.ral_riepilogo as {color?:unknown}|null|undefined;
  if(document.ral_consolidato===true && ralColors.some(c=>c.code===summary?.color))return "RAL "+summary!.color;
  return language==="en"?"BLACK RAL 9005":"NERO RAL 9005";
}
const naturalLabel=(language:"it"|"en")=>language==="en"?"UNFINISHED / NATURAL":"GREZZO / NATURALE";
export function documentPrintColor(document:Record<string,unknown>,language:"it"|"en"="it"):string {
  const color=basePrintColor(document,language);
  const rows=(document.prodotti??document.righe) as Array<Record<string,unknown>>|undefined;
  const active=Array.isArray(rows)?rows.filter(r=>r.a_forfait!==true):[];
  if(active.some(r=>isNaturalTemporaryCode(r.codice)))
    return active.every(r=>isNaturalTemporaryCode(r.codice))?naturalLabel(language):language==="en"?"Finishes as specified for each item":"Finiture indicate nelle singole posizioni";
  return color;
}

export function documentPrintFinish(document:Record<string,unknown>,row:Record<string,unknown>,language:"it"|"en"="it"):string {
  if(isNaturalTemporaryCode(row.codice))return naturalLabel(language);
  const color=basePrintColor(document,language);
  const summary=document.ral_riepilogo as {textured?:unknown}|null|undefined;
  const textured=validRal(document.verniciatura_ral)?document.verniciatura_ral.textured
    :document.ral_consolidato===true?summary?.textured===true:row.nero_standard_goffrato===true;
  return color+" · "+(language==="en"?(textured?"TEXTURED":"SMOOTH"):(textured?"GOFFRATO":"LISCIO"));
}
