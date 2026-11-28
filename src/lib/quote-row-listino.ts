import {seriesDiscount} from "./series-discount";
import {isFixedPrice} from "./quote-series";
import {documentProductCode} from "./document-product-fields";
type Data=Record<string,any>;
/** Inverse successive discounts; never change the quoted net price. */
export function buildRowListino(netto:number,sconto:string){
  const parsed=seriesDiscount(sconto);
  if(!parsed.label)return null;
  if(parsed.factor<=0)throw new Error("Lo sconto deve essere inferiore al 100% per generare il listino.");
  if(!Number.isFinite(netto)||netto<=0)throw new Error("Prezzo netto non valido");
  const listino=Math.ceil((netto/parsed.factor-1e-10)*100)/100;
  if(!Number.isFinite(listino))throw new Error("Listino fuori intervallo");
  return {listino,fattore:parsed.factor,nettoRicalcolato:listino*parsed.factor};
}
export function rowListinoDiscountLabel(sconto:string|null|undefined):string{
  return seriesDiscount(sconto).percentages.map(p=>String(p).replace(".",",")+"%").join(" + ");
}
export function rowListinoInputError(row:Data):string|null{
  if(isFixedPrice(row)||row.genera_listino!==true)return null;
  try{return buildRowListino(1,row.sconto_cliente)?null:"Inserire lo sconto cliente per generare il listino.";}
  catch(e){return (e as Error).message;}
}
/** Resolve legacy references without guessing among multiple matching rows. */
export function listinoProductIndex(doc:Data):number{
  const rows=doc.prodotti as Data[],reference=doc.listino;
  if(!reference||!Array.isArray(rows))return -1;
  const idx=reference.product_index_riferimento;
  if(Number.isInteger(idx)&&idx>=0&&idx<rows.length)return idx;
  const text=(v:unknown)=>String(v??"").trim(),code=text(reference.codice_riferimento);
  if(code){
    const matching=rows.map((p,i)=>text(p.codice)===code||documentProductCode({...p,codice:code},doc)===documentProductCode(p,doc)?i:-1).filter(i=>i>=0);
    if(matching.length===1)return matching[0];
  }
  const description=text(reference.descrizione_riferimento);
  if(description){
    const matching=rows.map((p,i)=>text(p.descrizione)===description?i:-1).filter(i=>i>=0);
    if(matching.length===1)return matching[0];
  }
  return rows.length===1?0:-1;
}
/** Explicit row choices override the legacy document-level snapshot. */
export function quoteRowListino(doc:Data,index:number):{listino:number;discount:string;historical:boolean}|null{
  const row=doc.prodotti?.[index];
  if(!row||isFixedPrice(row)||row.genera_listino===false)return null;
  if(row.genera_listino===true){
    const error=rowListinoInputError(row);if(error)throw new Error(error);
    if(row.listino_lordo==null||row.listino_lordo===""||!Number.isFinite(Number(row.listino_lordo))||Number(row.listino_lordo)<=0)
      throw new Error("Ricalcola e salva il listino del prodotto "+(index+1)+" prima di condividerlo.");
    return {listino:Number(row.listino_lordo),discount:String(row.sconto_cliente).trim(),historical:false};
  }
  const legacy=doc.listino;
  if(index!==listinoProductIndex(doc)||legacy?.prezzo_listino_generato==null||legacy.prezzo_listino_generato==="")return null;
  const listino=Number(legacy.prezzo_listino_generato);
  if(!Number.isFinite(listino)||listino<0)throw new Error("Listino storico non valido");
  return {listino,discount:String(legacy.sconto_riferimento??"").trim(),historical:true};
}
