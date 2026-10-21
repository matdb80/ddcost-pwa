/**
 * Hierarchical cycle assemblies. Legacy rows with parent_idx but without
 * assembly_auto retain the original "detail only" costing semantics.
 * Indices remain stable in persisted dataJson (no schema migration).
 */
import type { RigaCiclo } from "@/types/cycle";

export const MAX_ASSEMBLY_LEVELS = 4;

export function childrenOf(rows: RigaCiclo[], parent: number): number[] {
  return rows.flatMap((r,i)=>r.parent_idx === parent ? [i] : []);
}

export function rowDepth(rows: RigaCiclo[], index: number): number {
  const seen = new Set<number>();
  let current = index;
  let depth = 1;
  while (rows[current]?.parent_idx != null) {
    const parent = rows[current].parent_idx as number;
    if (!Number.isInteger(parent) || parent < 0 || parent >= rows.length || seen.has(parent) || parent === current)
      throw new Error("Gerarchia non valida o circolare: correggere le relazioni prima di modificare");
    seen.add(current);
    current = parent;
    depth++;
    if (depth > rows.length) throw new Error("Riferimenti circolari nella gerarchia");
  }
  return depth;
}

export function orderedHierarchy(rows: RigaCiclo[]): {index: number; depth:number}[] {
  const out: {index:number;depth:number}[] = [];
  const visited = new Set<number>();
  function visit(index:number,depth:number) {
    if (visited.has(index)) throw new Error("Relazioni circolari fra righe");
    visited.add(index);
    out.push({index,depth});
    for (const child of childrenOf(rows,index)) visit(child,depth+1);
  }
  for (let i=0;i<rows.length;i++) if (rows[i].parent_idx == null) visit(i,1);
  // Malformed source data must be shown (not silently dropped).
  for (let i=0;i<rows.length;i++) if (!visited.has(i)) out.push({index:i,depth:0});
  return out;
}

/** Assign 1, 1.1, 1.1.1 style labels using each row's position among siblings. */
export function hierarchyNumberLabels(rows: RigaCiclo[]): Map<number,string> {
  const labels=new Map<number,string>();
  const visited=new Set<number>();
  const visit=(index:number,path:number[])=>{
    if(visited.has(index))return;
    visited.add(index);
    labels.set(index,path.join("."));
    childrenOf(rows,index).forEach((child,position)=>visit(child,[...path,position+1]));
  };
  const roots=rows.flatMap((row,index)=>row.parent_idx==null?[index]:[]);
  roots.forEach((index,position)=>visit(index,[position+1]));
  // Preserve visibility and a stable label for malformed or orphaned rows.
  rows.forEach((_,index)=>{if(!visited.has(index))labels.set(index,String(index+1));});
  return labels;
}

/** Copy a row and its descendant rows as a new level-one branch at the end of
 * the cycle list. Parent references inside the copied subtree are remapped by
 * row identity so nested assemblies retain their own cost calculation.
 */
export function copyRowToEnd(rows:RigaCiclo[], index:number):RigaCiclo[] {
  if (!rows[index]) throw new Error("Selezionare una riga da copiare");

  const subtree:number[]=[];
  const visiting=new Set<number>();
  const collect=(current:number)=>{
    if(visiting.has(current)) throw new Error("Relazioni circolari fra righe");
    visiting.add(current);
    subtree.push(current);
    for(const child of childrenOf(rows,current)) collect(child);
    visiting.delete(current);
  };
  collect(index);

  const copiedIndexToNew=new Map(subtree.map((oldIndex,offset)=>[oldIndex,rows.length+offset]));
  const copies=subtree.map(oldIndex=>{
    const row={...rows[oldIndex]};
    if(oldIndex===index){
      if(row.parent_idx!=null)row.parent_idx=null;
    }else if(row.parent_idx!=null && copiedIndexToNew.has(row.parent_idx)){
      row.parent_idx=copiedIndexToNew.get(row.parent_idx);
    }else if(row.parent_idx!=null){
      throw new Error("Riferimento al padre non valido; correggere la gerarchia prima di copiare");
    }
    return row;
  });
  return [...rows.map(row=>({...row})),...copies];
}

function isDescendant(rows: RigaCiclo[], candidate: number, ancestor: number): boolean {
  const seen = new Set<number>();
  let current: number | null | undefined = candidate;
  while (current != null) {
    if (current === ancestor) return true;
    if (seen.has(current)) return true; // fail closed
    seen.add(current);
    current = rows[current]?.parent_idx;
  }
  return false;
}

export function attachToAssembly(rows:RigaCiclo[], source:number, target:number): RigaCiclo[] {
  if (!rows[source] || !rows[target] || source===target) throw new Error("Selezionare due righe diverse");
  if (!["COMPONENTE","COMPONENTE/ASSIEME"].includes(rows[target].categoria))
    throw new Error("Trascina la riga su una riga di categoria COMPONENTE o COMPONENTE/ASSIEME");
  if (isDescendant(rows,target,source)) throw new Error("Non puoi inserire un assieme in se stesso o in un suo componente");
  if (rows[target].parent_idx != null && !rows[rows[target].parent_idx]?.assembly_auto)
    throw new Error("La riga di destinazione appartiene a un dettaglio storico: prima separala dal gruppo");
  // Don't convert old detail-expansion parent and accidentally count its historical children.
  if (!rows[target].assembly_auto && childrenOf(rows,target).length)
    throw new Error("Questa riga contiene già dettagli storici: non è possibile convertirla automaticamente");
  const next=rows.map(r=>({...r}));
  next[source].parent_idx=target;
  next[target].categoria="COMPONENTE/ASSIEME";
  next[target].assembly_auto=true;
  const subtree=(root:number):number[]=>[root,...childrenOf(next,root).flatMap(subtree)];
  const descendants=subtree(source);
  const maxSubtreeDepth=Math.max(...descendants.map(i=>rowDepth(next,i)));
  if (maxSubtreeDepth>MAX_ASSEMBLY_LEVELS)
    throw new Error("È consentita una gerarchia fino a quattro livelli inclusi");
  // The entire hierarchy must be valid, even if pre-existing rows were malformed.
  for(let i=0;i<next.length;i++) if(next[i].parent_idx!=null) rowDepth(next,i);
  return next;
}

/** A single + control can create direct children without drag/drop.
 * Accept only up to four levels; don't reinterpret old detail groups.
 */
export function canAddChild(rows:RigaCiclo[], parentIndex:number): boolean {
  const parent = rows[parentIndex];
  if (!parent || !["COMPONENTE","COMPONENTE/ASSIEME"].includes(parent.categoria)) return false;
  try {
    if (rowDepth(rows,parentIndex) >= MAX_ASSEMBLY_LEVELS) return false;
    if (parent.parent_idx != null && !rows[parent.parent_idx]?.assembly_auto) return false;
    if (!parent.assembly_auto && childrenOf(rows,parentIndex).length > 0) return false;
    return true;
  } catch { return false; }
}

export function appendChildToAssembly(rows:RigaCiclo[],parentIndex:number,child:RigaCiclo):RigaCiclo[] {
  if (!canAddChild(rows,parentIndex))
    throw new Error("Impossibile aggiungere un componente: assieme non valido o già al quarto livello");
  if (child.parent_idx != null || child.assembly_auto)
    throw new Error("Un nuovo componente non può avere parentela o assiemi preesistenti");
  const next=rows.map(r=>({...r}));
  next[parentIndex].categoria="COMPONENTE/ASSIEME";
  next[parentIndex].assembly_auto=true;
  next.push({...child,parent_idx:parentIndex});
  if(rowDepth(next,next.length-1)>MAX_ASSEMBLY_LEVELS)
    throw new Error("Gerarchia oltre i quattro livelli");
  return next;
}

export function detachFromAssembly(rows:RigaCiclo[], index:number): RigaCiclo[] {
  if (!rows[index] || rows[index].parent_idx == null) return rows;
  const next=rows.map(r=>({...r}));
  next[index].parent_idx=null;
  return next;
}

/** Adjacent move preserving all parent_idx links by identity. */
export function swapRows(rows:RigaCiclo[], a:number,b:number):RigaCiclo[] {
  if (a<0 || b<0 || a>=rows.length || b>=rows.length) return rows;
  if (a===b) return rows;
  const oldIndices=rows.map((_,i)=>i);
  [oldIndices[a],oldIndices[b]]=[oldIndices[b],oldIndices[a]];
  const newIndexForOld=new Map(oldIndices.map((oldIdx,newIdx)=>[oldIdx,newIdx]));
  return oldIndices.map(oldIdx=>{
    const r=rows[oldIdx];
    return {...r,parent_idx:r.parent_idx==null?r.parent_idx:newIndexForOld.get(r.parent_idx)!};
  });
}

/** Get the nearest previous/next sibling. Same level alone is not enough:
 * they must have the same direct parent, otherwise moving could change group.
 * The UI uses physical indices, while tree display is derived from parent_idx.
 */
export function adjacentSibling(rows:RigaCiclo[], index:number, direction:-1|1):number|null {
  if (!rows[index]) return null;
  const parent=rows[index].parent_idx??null;
  const siblings=rows.flatMap((r,i)=>r.parent_idx==null&&parent===null || r.parent_idx===parent&&parent!==null ? [i] : []);
  const at=siblings.indexOf(index);
  if(at<0) return null;
  return siblings[at+direction]??null;
}

export function moveRowAmongSiblings(rows:RigaCiclo[],index:number,direction:-1|1):RigaCiclo[] {
  const neighbor=adjacentSibling(rows,index,direction);
  if(neighbor===null)return rows;
  // Swap row identities and rewrite every parent reference, including whole
  // subtrees. This changes presentation order, NEVER membership or prices.
  const moved=swapRows(rows,index,neighbor);
  for(let i=0;i<moved.length;i++)if(moved[i].parent_idx!=null)rowDepth(moved,i);
  return moved;
}

export function removeLeaf(rows:RigaCiclo[],index:number):RigaCiclo[] {
  if (childrenOf(rows,index).length) throw new Error("Prima sgancia o elimina i componenti dell'assieme");
  return rows.filter((_,i)=>i!==index).map(r=>({
    ...r,
    parent_idx:r.parent_idx==null?r.parent_idx:r.parent_idx>index?r.parent_idx-1:r.parent_idx,
  }));
}
