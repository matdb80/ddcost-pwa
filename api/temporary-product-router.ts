import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { temporaryProductSequence, temporaryProductCodes } from "@db/schema";
import { getDb } from "./queries/connection";
import { createRouter, authedQuery } from "./middleware";
import { temporaryCode, temporaryCodeCopyOptions, validTemporarySuffix, TEMPORARY_FAMILIES } from "../src/lib/ral-pricing";
const family = z.enum(TEMPORARY_FAMILIES);
const requestKey = z.string().uuid();
export const temporaryProductRouter = createRouter({
  reserve: authedQuery.input(z.object({ requestKey, family })).mutation(async ({ ctx, input }) => {
    return getDb().transaction(async tx => {
      const [counter] = await tx.select().from(temporaryProductSequence).where(eq(temporaryProductSequence.id, 1)).limit(1).for("update");
      if (!counter) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Contatore codici temporanei non disponibile" });
      const [existing] = await tx.select().from(temporaryProductCodes).where(eq(temporaryProductCodes.requestKey, input.requestKey)).limit(1).for("update");
      if (existing) {
        if (existing.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        return { sequence: existing.sequence, requestKey: input.requestKey };
      }
      const sequence = counter.lastNumber + 1;
      if (sequence > 9999999) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Progressivi temporanei esauriti" });
      await tx.update(temporaryProductSequence).set({ lastNumber: sequence }).where(eq(temporaryProductSequence.id, 1));
      await tx.insert(temporaryProductCodes).values({ sequence, requestKey: input.requestKey, family: input.family, userId: ctx.user.id });
      return { sequence, requestKey: input.requestKey };
    });
  }),
  complete: authedQuery.input(z.object({ requestKey, family, material: z.enum(["I", "X", "6", "B", "A"]), color: z.string().regex(/^\d{4}$/).nullable(), natural:z.boolean().default(false), suffix:z.string().refine(validTemporarySuffix,"Inserisci un solo carattere finale, senza spazi").optional() })).mutation(async ({ ctx, input }) => {
    return getDb().transaction(async tx => {
      const [reservation] = await tx.select().from(temporaryProductCodes).where(eq(temporaryProductCodes.requestKey, input.requestKey)).limit(1).for("update");
      if (!reservation || reservation.userId !== ctx.user.id) throw new TRPCError({ code: "NOT_FOUND", message: "Prenotazione non trovata" });
      let code:string;
      try{code=temporaryCode(reservation.sequence,input.family,input.material,input.color,input.suffix,input.natural);}
      catch(error){throw new TRPCError({code:"BAD_REQUEST",message:error instanceof Error?error.message:"Codice non valido"});}
      if (reservation.code && reservation.code !== code) throw new TRPCError({ code: "CONFLICT", message: "Progressivo già assegnato: genera un nuovo codice" });
      if (!reservation.code) await tx.update(temporaryProductCodes).set({ family: input.family, material: input.material, color: input.color, code }).where(eq(temporaryProductCodes.id, reservation.id));
      return { sequence: reservation.sequence, family: input.family, material: input.material, color: input.color, code };
    });
  }),
  duplicate: authedQuery.input(z.object({requestKey,sourceCode:z.string().min(11).max(30),currentCode:z.string().min(11).max(30)})).mutation(async({ctx,input})=>{
    return getDb().transaction(async tx=>{
      const [counter]=await tx.select().from(temporaryProductSequence).where(eq(temporaryProductSequence.id,1)).limit(1).for("update");
      if(!counter)throw new TRPCError({code:"PRECONDITION_FAILED",message:"Contatore codici temporanei non disponibile"});
      const [source]=await tx.select().from(temporaryProductCodes).where(eq(temporaryProductCodes.code,input.sourceCode)).limit(1);
      if(!source?.code)throw new TRPCError({code:"NOT_FOUND",message:"Codice temporaneo originale non trovato: rigeneralo prima di copiare"});
      let options:ReturnType<typeof temporaryCodeCopyOptions>;
      try{options=temporaryCodeCopyOptions(source,input.currentCode);}
      catch(e){throw new TRPCError({code:"BAD_REQUEST",message:(e as Error).message});}
      const [existing]=await tx.select().from(temporaryProductCodes).where(eq(temporaryProductCodes.requestKey,input.requestKey)).limit(1).for("update");
      if(existing && existing.userId!==ctx.user.id)throw new TRPCError({code:"FORBIDDEN"});
      const sequence=existing?.sequence??counter.lastNumber+1;
      if(sequence>9999999)throw new TRPCError({code:"PRECONDITION_FAILED",message:"Progressivi temporanei esauriti"});
      const {family,material,color,suffix,natural}=options;
      const code=temporaryCode(sequence,family,material,color,suffix,natural);
      if(existing && existing.code!==code)throw new TRPCError({code:"CONFLICT",message:"Richiesta di copia già utilizzata: riprova"});
      if(!existing){
        await tx.update(temporaryProductSequence).set({lastNumber:sequence}).where(eq(temporaryProductSequence.id,1));
        await tx.insert(temporaryProductCodes).values({sequence,requestKey:input.requestKey,family,material,color,code,userId:ctx.user.id});
      }
      return {sequence,family,material,color,code};
    });
  }),
});
