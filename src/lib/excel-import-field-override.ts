import {CATEGORIE_RIGA} from '../types/cycle';
import type {ProductDraft,ImportProblem} from '../types/excel-import';

const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const positive=(value:unknown)=>finite(value)&&value>0;
const nonnegative=(value:unknown)=>finite(value)&&value>=0;
const nonempty=(value:unknown)=>typeof value==='string'&&value.trim().length>0;
const rules:Record<string,{prefix:string;valid:(value:unknown)=>boolean}>={
 nr_componenti:{prefix:'F3_QUANTITY_',valid:positive},
 colpi_min:{prefix:'F3_SPEED_',valid:positive},
 costo_unitario:{prefix:'F3_RATE_',valid:nonnegative},
 descrizione:{prefix:'F3_DESCRIPTION_',valid:nonempty},
 peso_kg:{prefix:'F3_WEIGHT_',valid:positive},
 lunghezza:{prefix:'F3_LENGTH_',valid:positive},
 larghezza:{prefix:'F3_WIDTH_',valid:positive},
 spessore:{prefix:'F3_THICKNESS_',valid:positive},
 attrezzaggio_min:{prefix:'F3_SETUP_',valid:nonnegative},
 categoria:{prefix:'F3_CATEGORY_',valid:value=>typeof value==='string'&&CATEGORIE_RIGA.some(category=>category===value)},
};

/** Resolve only the parse issue tied to the explicitly overridden field/row.
 * Keep source evidence and independent issues; the ordinary validator still
 * checks the complete model. This does not replace a serializable MappingDraft.
 */
export function applyF3FieldOverride(product:ProductDraft,rowKey:string,field:string,value:unknown):ProductDraft {
 const target=product.rows.find(row=>row.key===rowKey);
 if(!target)return product;
 const rule=rules[field];
 const ids=new Set(target.problems.filter(problem=>rule&&[`${rule.prefix}${target.excelRow}`,`${rule.prefix.replace('F3_', 'KGMIN_')}${target.excelRow}`].includes(problem.code)).map(problem=>problem.id));
 const resolve=(problem:ImportProblem):ImportProblem=>ids.has(problem.id)?{...problem,resolved:rule!.valid(value)}:problem;
 return {
  ...product,
  problems:product.problems.map(resolve),
  rows:product.rows.map(row=>row.key===rowKey?{...row,row:{...row.row,[field]:value},problems:row.problems.map(resolve)}:row),
 };
}
