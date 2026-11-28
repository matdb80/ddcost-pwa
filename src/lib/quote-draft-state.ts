/**
 * Drafts may lack commercial information but must still be structurally valid.
 * Only the dedicated authenticated saveDraft API is allowed to persist them.
 */
export function parseIncompleteQuote(raw:string):Record<string,unknown>{
  let value:unknown;
  try{value=JSON.parse(raw);}catch{throw new Error("JSON bozza non valido");}
  if(!value || typeof value!=="object" || Array.isArray(value))
    throw new Error("Documento bozza non valido");
  const result=value as Record<string,unknown>;
  if(!Array.isArray(result.prodotti) || result.prodotti.length===0 ||
    result.prodotti.some(p=>!p || typeof p!=="object" || Array.isArray(p)))
    throw new Error("Una bozza deve contenere almeno una riga, anche incompleta");
  return result;
}
export function quoteIsDraft(raw:string|null|undefined):boolean {
  if(!raw)return false;
  try{
    const parsed=JSON.parse(raw) as unknown;
    return Boolean(parsed && typeof parsed==="object" && !Array.isArray(parsed) &&
      (parsed as Record<string,unknown>).stato_preventivo==="bozza");
  }catch{return false;}
}
