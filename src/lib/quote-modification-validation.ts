import {isFixedPrice} from "./quote-series";
/** Drafts may be incomplete; completed writes require a real selection on every row. */
export function modificationObjectError(value:unknown):string|null {
  return Array.isArray(value) && value.some(item=>typeof item==="string" && item.trim().length>0)
    ? null
    : "Seleziona almeno una voce in Oggetto della modifica.";
}

export function quoteModificationError(products:readonly Record<string,unknown>[]):string|null {
  for(let i=0;i<products.length;i++){
    if(isFixedPrice(products[i]))continue;
    const error=modificationObjectError(products[i]?.oggetto_modifica);
    if(error)return `Prodotto ${i+1}: ${error}`;
  }
  return null;
}
