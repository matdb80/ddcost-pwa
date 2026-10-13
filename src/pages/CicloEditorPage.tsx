import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams, useLocation } from "react-router";
import { trpc } from "@/providers/trpc";
import Layout from "@/components/Layout";
import {
  ArrowLeft,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Save,
  Calculator,
  Copy,
  Pencil,
  X,
  EyeOff,
  Eye,
  GripVertical,
  CornerDownRight,
  RotateCcw,
} from "lucide-react";
import type { RigaCiclo, CicloEditorModel } from "@/types/cycle";
import {
  CATEGORIE_RIGA,
  emptyRiga,
  emptyCicloEditorModel,
  parseCycleRow,
  serializeCycleDataJson,
} from "@/types/cycle";
import { ricalcolaCiclo, calcolaCostoRiga, costoRigaGerarchico } from "@/lib/cycle-calculator";
import { attachToAssembly, detachFromAssembly, orderedHierarchy, removeLeaf, swapRows, childrenOf } from "@/lib/cycle-hierarchy";

/** Canonical snapshot of cost-related inputs; legacy JSON lotto is numeric, DB lot is text. */
function economicSignature(m: CicloEditorModel): string {
  return JSON.stringify({
    righe: m.righe,
    costo_lavoro_min: Number(m.costo_lavoro_min),
    ricarico_spese: Number(m.ricarico_spese),
    margine_minimo: Number(m.margine_minimo),
    lotto: m.lotto === "" ? null : Number(m.lotto),
    lotti: (m.lotti_personalizzati ?? m.simulazioni.map(s => s.lotto)).map(Number),
  });
}

function formatMoney(v: number) {
  return v.toLocaleString("it-IT", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

export default function CicloEditorPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id: string }>();
  const isNew = location.pathname === "/cicli/new";
  const numericId = isNew ? undefined : Number(id);

  const [model, setModel] = useState(emptyCicloEditorModel());
  const [originalJson, setOriginalJson] = useState<string>("");
  const [originalDbDataJson, setOriginalDbDataJson] = useState<string | null>(null);
  const [hasRecalculated, setHasRecalculated] = useState(false);
  const [lastRecalculatedSignature, setLastRecalculatedSignature] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [rigaEdit, setRigaEdit] = useState<RigaCiclo | null>(null);
  const [rigaIndex, setRigaIndex] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [isReadOnly, setIsReadOnly] = useState(!isNew);
  const [simulationExcluded, setSimulationExcluded] = useState<Set<number>>(new Set());
  const [draggingIndex, setDraggingIndex] = useState<number|null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number|null>(null);

  const getCycle = trpc.cycle.get.useQuery(
    { id: numericId! },
    { enabled: !isNew && !!numericId }
  );

  const createCycle = trpc.cycle.create.useMutation({
    onSuccess: () => navigate("/cicli"),
    onError: (err) => alert(`Errore creazione: ${err.message}`),
  });

  const createRevision = trpc.cycle.createRevision.useMutation({
    onSuccess: () => {
      setHasChanges(false);
      setSaveDialogOpen(false);
      alert("Nuova revisione creata con successo.");
      navigate("/cicli");
    },
    onError: (err) => alert(`Errore revisione: ${err.message}`),
  });

  // Load cycle data
  useEffect(() => {
    if (getCycle.data) {
      const m = parseCycleRow(getCycle.data);
      setModel(m);
      setOriginalJson(JSON.stringify(serializeCycleDataJson(m)));
      setOriginalDbDataJson(getCycle.data.dataJson ?? null);
      setHasRecalculated(false);
      setLastRecalculatedSignature(null);
      setHasChanges(false);
      setIsReadOnly(true);
      setSimulationExcluded(new Set());
      setDraggingIndex(null);
      setDragOverIndex(null);
    }
  }, [getCycle.data]);

  // Track changes by comparing serialized JSON
  useEffect(() => {
    if (isNew) {
      setHasChanges(true);
      return;
    }
    const current = JSON.stringify(serializeCycleDataJson(model));
    setHasChanges(current !== originalJson && originalJson !== "");
  }, [model, originalJson, isNew]);

  // An editor button must never create a revision from an untouched cycle.
  // Compute synchronously from the loaded baseline, not from delayed state.
  const isModified = isNew || (originalJson.length > 0 &&
    JSON.stringify(serializeCycleDataJson(model)) !== originalJson);
  // Ephemeral simulation: never modify model or dataJson. Switching all rows
  // back on restores the exact original values without creating a revision.
  const simulatedModel = useMemo(() => {
    if (simulationExcluded.size===0 && !model.righe.some(r=>r.assembly_auto)) return model;
    return ricalcolaCiclo({
      ...model,
      righe:model.righe.map((r,i)=>simulationExcluded.has(i)?{...r,considera:false}:r),
    });
  }, [model, simulationExcluded]);

  const treeOrder = useMemo(() => orderedHierarchy(model.righe), [model.righe]);
  const hasHierarchy = model.righe.some(r=>r.parent_idx!=null);

  const toggleSimulation = (i:number) => {
    const r=model.righe[i];
    // Legacy detail-only rows have never affected top-level cost; exclusion
    // must not misleadingly claim it changes a saved assembly's price.
    if (r.parent_idx!=null && !model.righe[r.parent_idx]?.assembly_auto) return;
    setSimulationExcluded(old=>{
      const next=new Set(old);
      if(next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  const handleDropAssemble = (source:number,target:number) => {
    setDraggingIndex(null);
    setDragOverIndex(null);
    if(isReadOnly && !isNew) return;
    try {
      const parent=model.righe[target];
      if (parent && !parent.assembly_auto && Number(parent.costo_unitario)>0) {
        if(!window.confirm("Creando l'assieme, il prezzo manuale della riga di destinazione resterà memorizzato ma NON sarà sommato ai componenti. Confermare?")) return;
      }
      const changedRows=attachToAssembly(model.righe,source,target);
      setModel(prev=>({...prev,righe:changedRows}));
      setHasRecalculated(false);
      setLastRecalculatedSignature(null);
      setSimulationExcluded(new Set());
    } catch(err) {
      window.alert(err instanceof Error?err.message:"Trascinamento non consentito");
    }
  };

  const detachRiga = (i:number) => {
    const next=detachFromAssembly(model.righe,i);
    if(next===model.righe)return;
    setModel(prev=>({...prev,righe:next}));
    setHasRecalculated(false);
    setLastRecalculatedSignature(null);
    setSimulationExcluded(new Set());
  };


  const handleChange = <K extends keyof typeof model>(
    field: K,
    value: (typeof model)[K]
  ) => {
    setModel((prev) => ({ ...prev, [field]: value }));
  };

  const handleRigaChange = <K extends keyof RigaCiclo>(
    field: K,
    value: RigaCiclo[K]
  ) => {
    if (!rigaEdit) return;
    setRigaEdit({ ...rigaEdit, [field]: value });
  };

  const openRigaDialog = (index?: number) => {
    if (isReadOnly && !isNew) return;
    if (index !== undefined) {
      setRigaEdit({ ...model.righe[index] });
      setRigaIndex(index);
    } else {
      setRigaEdit(emptyRiga());
      setRigaIndex(null);
    }
    setDialogOpen(true);
  };

  const saveRiga = () => {
    if (!rigaEdit) return;
    if(rigaIndex!=null && model.righe[rigaIndex]?.assembly_auto &&
       rigaEdit.categoria!=="COMPONENTE/ASSIEME") {
      alert("Per un assieme calcolato dai componenti la categoria deve rimanere COMPONENTE/ASSIEME. Sgancia prima i componenti.");
      return;
    }
    setModel((prev) => {
      const righe = [...prev.righe];
      if (rigaIndex !== null) {
        righe[rigaIndex] = rigaEdit;
      } else {
        righe.push(rigaEdit);
      }
      return { ...prev, righe };
    });
    setDialogOpen(false);
  };

  const deleteRiga = (index: number) => {
    if (isReadOnly && !isNew) return;
    if (childrenOf(model.righe,index).length) {
      alert("Questa riga contiene componenti. Sgancia i componenti prima di eliminarla.");
      return;
    }
    if (!confirm("Eliminare questa riga?")) return;
    setModel(prev=>({...prev,righe:removeLeaf(prev.righe,index)}));
    setSimulationExcluded(new Set());
    setHasRecalculated(false);
    setLastRecalculatedSignature(null);
  };

  const moveRiga = (index: number, direction: -1 | 1) => {
    if (isReadOnly && !isNew) return;
    if (hasHierarchy) return; // avoid visually misleading cross-level ordering
    const next=index+direction;
    if(next<0||next>=model.righe.length)return;
    setModel(prev=>({...prev,righe:swapRows(prev.righe,index,next)}));
    setSimulationExcluded(new Set());
    setHasRecalculated(false);
    setLastRecalculatedSignature(null);
  };

  const handleRicalcola = () => {
    setSimulationExcluded(new Set());
    setLastRecalculatedSignature(economicSignature(model));
    setModel((prev) => ricalcolaCiclo(prev));
    setHasRecalculated(true);
  };

  const handleSave = () => {
    if (isNew) {
      // Direct create for new cycles
      const dataJson = JSON.stringify(serializeCycleDataJson(ricalcolaCiclo(model)));
      const m = ricalcolaCiclo(model);
      createCycle.mutate({
        code: m.codice,
        description: m.descrizione,
        client: m.cliente,
        lot: m.lotto,
        standardCost: String(m.costo_standard),
        minimumPrice: String(m.prezzo_minimo),
        dataJson,
      });
    } else {
      if (!isModified) {
        alert("Nessuna modifica rilevata: revisione non creata.");
        return;
      }
      setSaveDialogOpen(true);
    }
  };

  const confirmSaveRevision = () => {
    if (!numericId || !getCycle.data || createRevision.isPending) return;
    if (!isModified) {
      setSaveDialogOpen(false);
      alert("Nessuna modifica rilevata: revisione non creata.");
      return;
    }

    // Block save if economic changes exist but user hasn't recalculated
    const economicChangedNow = !!getCycle.data &&
      economicSignature(model) !== economicSignature(parseCycleRow(getCycle.data));
    if ((economicChangedNow && !hasRecalculated) ||
        (hasRecalculated && lastRecalculatedSignature !== economicSignature(model))) {
      alert(
        "Hai modificato parametri economici (lavorazioni, costi, lotti) ma non hai eseguito il ricalcolo.\n\n" +
        "Il motore di calcolo non è ancora verificato su tutti i cicli storici.\n" +
        "Per evitare di introdurre costi errati, premi 'Ricalcola' prima di salvare, oppure annulla le modifiche economiche."
      );
      setSaveDialogOpen(false);
      return;
    }

    let dataJson: string;
    let standardCost: string;
    let minimumPrice: string;

    if (hasRecalculated) {
      // User explicitly recalculated: use new values
      const m = ricalcolaCiclo(model);
      dataJson = JSON.stringify(serializeCycleDataJson(m));
      standardCost = String(m.costo_standard);
      minimumPrice = String(m.prezzo_minimo);
    } else {
      // Preserve original economic values; update only anagrafic fields
      if (originalDbDataJson) {
        const base = JSON.parse(originalDbDataJson);
        base.codice = model.codice;
        base.descrizione = model.descrizione;
        base.cliente = model.cliente;
        base.lotto = model.lotto;
        dataJson = JSON.stringify(base);
      } else {
        dataJson = JSON.stringify(serializeCycleDataJson(model));
      }
      standardCost = String(getCycle.data?.standardCost ?? model.costo_standard);
      minimumPrice = String(getCycle.data?.minimumPrice ?? model.prezzo_minimo);
    }

    createRevision.mutate({
      sourceId: numericId,
      rootId: model.rootId ?? numericId,
      code: model.codice,
      description: model.descrizione,
      client: model.cliente,
      lot: model.lotto,
      standardCost,
      minimumPrice,
      dataJson,
    });
  };

  const enableEdit = () => {
    setIsReadOnly(false);
  };

  if (!isNew && getCycle.isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Unrecalculated warning */}
        {!isNew && !isReadOnly && !hasRecalculated && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800 flex items-center justify-between">
            <span>
              <strong>Attenzione:</strong> i costi non sono stati ricalcolati dopo le ultime modifiche.
              Salvando ora, i valori economici originali verranno preservati.
            </span>
            <button
              onClick={handleRicalcola}
              className="ml-4 px-3 py-1.5 bg-amber-100 hover:bg-amber-200 rounded-md text-xs font-medium whitespace-nowrap"
            >
              Ricalcola ora
            </button>
          </div>
        )}

        {!isReadOnly && model.righe.some(r=>r.assembly_auto) && !hasRecalculated && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-900">
            I costi degli assiemi sono aggiornati in anteprima. Per memorizzare una nuova revisione,
            verifica il risultato e premi <strong>Ricalcola</strong> prima di <strong>Salva</strong>.
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/cicli")}
              className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <h1 className="text-2xl font-bold text-slate-800">
              {isNew ? "Nuovo Ciclo Standard" : `Ciclo: ${model.codice}`}
            </h1>
            {hasChanges && (
              <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                Modificato
              </span>
            )}
            {!isNew && isReadOnly && (
              <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                Sola lettura
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!isNew && isReadOnly && (
              <button
                onClick={enableEdit}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700"
              >
                <Pencil className="h-4 w-4" />
                Modifica
              </button>
            )}
            {(!isReadOnly || isNew) && (
              <>
                <button
                  onClick={handleRicalcola}
                  className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-sm hover:bg-slate-50"
                >
                  <Calculator className="h-4 w-4" />
                  Ricalcola
                </button>
                <button
                  onClick={handleSave}
                  disabled={!isNew && (!isModified || createRevision.isPending)}
                  title={!isNew && !isModified ? "Nessuna modifica da salvare" : "Salva"}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Save className="h-4 w-4" />
                  Salva
                </button>
              </>
            )}
          </div>
        </div>

        {/* Anagrafica */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Dati Anagrafici</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Codice</label>
              <input
                type="text"
                value={model.codice}
                onChange={(e) => handleChange("codice", e.target.value)}
                disabled={isReadOnly && !isNew}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-500 mb-1">Descrizione</label>
              <input
                type="text"
                value={model.descrizione}
                onChange={(e) => handleChange("descrizione", e.target.value)}
                disabled={isReadOnly && !isNew}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Cliente</label>
              <input
                type="text"
                value={model.cliente}
                onChange={(e) => handleChange("cliente", e.target.value)}
                disabled={isReadOnly && !isNew}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Lotto default</label>
              <input
                type="text"
                value={model.lotto}
                onChange={(e) => handleChange("lotto", e.target.value)}
                disabled={isReadOnly && !isNew}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Ricarico Spese (es. 0,75 = 75%)
              </label>
              <input
                type="number"
                step="0.01"
                value={model.ricarico_spese}
                onChange={(e) => handleChange("ricarico_spese", parseFloat(e.target.value) || 0)}
                disabled={isReadOnly && !isNew}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Margine Minimo (es. 0,20 = 20%)
              </label>
              <input
                type="number"
                step="0.01"
                value={model.margine_minimo}
                onChange={(e) => handleChange("margine_minimo", parseFloat(e.target.value) || 0)}
                disabled={isReadOnly && !isNew}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Costo Lavoro €/min
              </label>
              <input
                type="number"
                step="0.01"
                value={model.costo_lavoro_min}
                onChange={(e) => handleChange("costo_lavoro_min", parseFloat(e.target.value) || 0)}
                disabled={isReadOnly && !isNew}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50"
              />
            </div>
          </div>
        </div>

        {/* Righe */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
            <h2 className="text-sm font-semibold text-slate-700">Righe di Lavorazione ({model.righe.length})</h2>
            {(!isReadOnly || isNew) && (
              <button
                type="button"
                onClick={() => openRigaDialog()}
                className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700"
              >
                <Plus className="h-4 w-4" />
                Aggiungi Riga
              </button>
            )}
          </div>
          <p className="mb-3 text-xs text-slate-500">Aggiungi una riga alla volta, senza limite a 10. Il contatore include anche i componenti degli assiemi. Per salvare le modifiche economiche premi Ricalcola.</p>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <p className="text-xs text-slate-600">
              {isReadOnly && !isNew
                ? "Usa l'icona occhio per simulare l'esclusione di una riga senza creare una revisione."
                : "Per creare un assieme, trascina una riga sull'altra (destinazione: COMPONENTE o COMPONENTE/ASSIEME). Massimo 4 livelli."}
            </p>
            {simulationExcluded.size > 0 && (
              <button type="button" onClick={() => setSimulationExcluded(new Set())}
                className="flex items-center gap-1.5 rounded-md bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-200">
                <RotateCcw className="h-3.5 w-3.5" />
                Ripristina tutte le righe ({simulationExcluded.size})
              </button>
            )}
          </div>
          {simulationExcluded.size > 0 && (
            <div role="status" className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <strong>Simulazione veloce attiva.</strong> I costi e le simulazioni qui visualizzati sono provvisori.
              Nessuna esclusione né costo simulato verrà salvato; disattivando le icone si ripristinano i dati originali.
              Per i cicli storici, il ricalcolo simulato può differire dai valori memorizzati.
            </div>
          )}
          {hasHierarchy && !isReadOnly && (
            <p className="mb-3 text-xs text-slate-500">Con assiemi presenti, i pulsanti su/giù sono disabilitati per evitare spostamenti involontari fra livelli.</p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-slate-600"># / Livello</th>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">Categoria</th>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">Codice</th>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">Descrizione</th>
                  <th className="text-right px-3 py-2 font-medium text-slate-600">Nr</th>
                  <th className="text-right px-3 py-2 font-medium text-slate-600">Costo</th>
                  <th className="text-center px-3 py-2 font-medium text-slate-600">Simula / Azioni</th>
                </tr>
              </thead>
              <tbody>
                {model.righe.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-slate-400">
                      Nessuna riga. Clicca "Aggiungi Riga".
                    </td>
                  </tr>
                )}
                {treeOrder.map(({index:i,depth}) => {
                  const r = model.righe[i];
                  const displayed=simulatedModel.righe;
                  const parentIndex=r.parent_idx;
                  const inAssembly = r.assembly_auto || (parentIndex!=null && model.righe[parentIndex]?.assembly_auto===true);
                  // If a parent is temporarily disabled, the entire subtree is ignored.
                  let disabledAncestor = false;
                  let ancestor = parentIndex;
                  const checked = new Set<number>();
                  while(ancestor!=null && !checked.has(ancestor)) {
                    checked.add(ancestor);
                    if(simulationExcluded.has(ancestor)) disabledAncestor = true;
                    ancestor=model.righe[ancestor]?.parent_idx;
                  }
                  const cost = (simulationExcluded.has(i) || disabledAncestor)
                    ? 0
                    : inAssembly
                      ? costoRigaGerarchico(displayed,i,simulatedModel.costo_lavoro_min,simulatedModel.lotto)
                      : calcolaCostoRiga(displayed[i],simulatedModel.costo_lavoro_min,simulatedModel.lotto);
                  const canSimulate = (parentIndex==null || model.righe[parentIndex]?.assembly_auto === true) && r.considera !== false && (r.categoria !== "SPESA ATTREZZATURA DEDICATA" || r.considera === true);
                  const canEdit = !isReadOnly || isNew;
                  return (
                    <tr
                      key={i}
                      draggable={canEdit}
                      onDragStart={(e)=>{
                        if(!canEdit)return;
                        e.dataTransfer.effectAllowed="move";
                        e.dataTransfer.setData("text/plain",String(i));
                        setDraggingIndex(i);
                      }}
                      onDragOver={(e)=>{if(canEdit && draggingIndex!==null && draggingIndex!==i){
                        e.preventDefault();e.dataTransfer.dropEffect="move";setDragOverIndex(i);
                      }}}
                      onDrop={(e)=>{
                        e.preventDefault();e.stopPropagation();
                        const src=Number(e.dataTransfer.getData("text/plain"));
                        if(!Number.isInteger(src) || src<0 || src>=model.righe.length)return;
                        handleDropAssemble(src,i);
                      }}
                      onDragEnd={()=>{setDraggingIndex(null);setDragOverIndex(null);}}
                      className={"border-b border-slate-100 "+(simulationExcluded.has(i)?"bg-amber-50 opacity-70 ":dragOverIndex===i?"bg-emerald-100 ":"hover:bg-slate-50 ")+(canEdit?"cursor-grab ":"")}
                      onClick={()=>{if(canEdit && draggingIndex===null)openRigaDialog(i);}}
                    >
                      <td className="px-3 py-2 text-slate-500 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1" style={{paddingLeft:Math.max(0,depth-1)*15}}>
                          {canEdit && <GripVertical className="w-3 h-3 text-slate-400" aria-hidden="true"/>}
                          {depth>1&&<CornerDownRight className="w-3 h-3 text-emerald-600" aria-hidden="true"/>}
                          {i+1} {depth>0&&<span className="text-xs">L{depth}</span>}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {r.categoria}{r.assembly_auto&&<span className="block font-semibold text-emerald-700">Assieme automatico</span>}
                      </td>
                      <td className="px-3 py-2 text-xs">{r.codice_articolo}</td>
                      <td className="px-3 py-2 text-xs max-w-xs truncate">{r.descrizione}</td>
                      <td className="px-3 py-2 text-right text-xs">{r.nr_componenti}</td>
                      <td className={"px-3 py-2 text-right text-xs font-mono "+(cost===0&&simulationExcluded.size?"text-amber-700":"")}>
                        {formatMoney(cost)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-center gap-1">
                          <button type="button"
                            onClick={e=>{e.stopPropagation();toggleSimulation(i);}}
                            disabled={!canSimulate}
                            aria-label={simulationExcluded.has(i)?"Riattiva riga nel calcolo":"Escludi riga costo dal calcolo"}
                            title={!canSimulate?"Riga già esclusa o dettaglio storico non conteggiato separatamente":simulationExcluded.has(i)?"Riattiva il costo della riga":"Escludi riga costo dal calcolo (solo simulazione)"}
                            className={"p-1.5 rounded disabled:opacity-30 "+(simulationExcluded.has(i)?"bg-amber-200 text-amber-900":"text-slate-500 hover:bg-amber-100")}>
                            {simulationExcluded.has(i)?<EyeOff className="h-4 w-4"/>:<Eye className="h-4 w-4"/>}
                          </button>
                          {canEdit && <>
                            {parentIndex!=null &&
                              <button type="button" title="Sgancia dal gruppo e porta al livello 1"
                                onClick={e=>{e.stopPropagation();detachRiga(i);}}
                                className="p-1.5 text-blue-700 hover:bg-blue-50 rounded">
                                <CornerDownRight className="h-4 w-4 rotate-180"/>
                              </button>}
                            <button type="button" disabled={hasHierarchy} title={hasHierarchy?"Non disponibile con assiemi":"Sposta su"}
                              onClick={e=>{e.stopPropagation();moveRiga(i,-1);}}
                              className="p-1 hover:bg-slate-100 rounded disabled:opacity-25"><ArrowUp className="h-3 w-3"/></button>
                            <button type="button" disabled={hasHierarchy} title={hasHierarchy?"Non disponibile con assiemi":"Sposta giù"}
                              onClick={e=>{e.stopPropagation();moveRiga(i,1);}}
                              className="p-1 hover:bg-slate-100 rounded disabled:opacity-25"><ArrowDown className="h-3 w-3"/></button>
                            <button type="button" title="Elimina riga"
                              onClick={e=>{e.stopPropagation();deleteRiga(i);}}
                              className="p-1 hover:bg-red-50 text-red-500 rounded"><Trash2 className="h-3 w-3"/></button>
                          </>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Breakdown & Costi */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-sm font-semibold text-slate-700 mb-4">Breakdown Costi</h2>
            <div className="space-y-2">
              {Object.entries(simulatedModel.breakdown).map(([cat, val]) => (
                <div key={cat} className="flex justify-between text-sm">
                  <span className="text-slate-500">{cat}</span>
                  <span className="font-mono">{formatMoney(val)}</span>
                </div>
              ))}
              <div className="border-t pt-2 flex justify-between font-semibold text-slate-800">
                <span>Totale</span>
                <span className="font-mono">{formatMoney(simulatedModel.costo_standard)}</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-sm font-semibold text-slate-700 mb-4">Prezzi</h2>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Costo Standard</span>
                <span className="font-mono">{formatMoney(simulatedModel.costo_standard)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Full Cost</span>
                <span className="font-mono">{formatMoney(simulatedModel.full_cost)}</span>
              </div>
              <div className="flex justify-between font-semibold text-slate-800">
                <span>Prezzo Minimo</span>
                <span className="font-mono">{formatMoney(simulatedModel.prezzo_minimo)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Lotti personalizzabili */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Lotti Simulazione</h2>
          <div className="flex items-center gap-2 flex-wrap">
            {(model.lotti_personalizzati ?? [25, 50, 100, 250, 500, 1000]).map((lotto, idx) => (
              <div key={idx} className="flex items-center gap-1">
                <input
                  type="number"
                  value={lotto}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 0;
                    const nuovi = [...(model.lotti_personalizzati ?? [25, 50, 100, 250, 500, 1000])];
                    nuovi[idx] = val;
                    setModel((prev) => ({ ...prev, lotti_personalizzati: nuovi }));
                  }}
                  disabled={isReadOnly && !isNew}
                  className="w-20 px-2 py-1 border border-slate-200 rounded text-sm text-center disabled:bg-slate-50"
                />
                {(!isReadOnly || isNew) && (model.lotti_personalizzati ?? []).length > 1 && (
                  <button
                    onClick={() => {
                      const nuovi = (model.lotti_personalizzati ?? []).filter((_, i) => i !== idx);
                      setModel((prev) => ({ ...prev, lotti_personalizzati: nuovi }));
                    }}
                    className="text-red-500 hover:text-red-700"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
            {(!isReadOnly || isNew) && (
              <button
                onClick={() =>
                  setModel((prev) => ({
                    ...prev,
                    lotti_personalizzati: [...(prev.lotti_personalizzati ?? [25, 50, 100, 250, 500, 1000]), 100],
                  }))
                }
                className="px-3 py-1 border border-slate-200 rounded text-sm hover:bg-slate-50"
              >
                + Lotto
              </button>
            )}
          </div>
        </div>

        {/* Simulazioni */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Simulazioni per Lotto</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">Lotto</th>
                  <th className="text-right px-3 py-2 font-medium text-slate-600">Costo Std</th>
                  <th className="text-right px-3 py-2 font-medium text-slate-600">Full Cost</th>
                  <th className="text-right px-3 py-2 font-medium text-slate-600">Prezzo Min</th>
                  <th className="text-right px-3 py-2 font-medium text-slate-600">Attrezz. pz</th>
                </tr>
              </thead>
              <tbody>
                {simulatedModel.simulazioni.map((s, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="px-3 py-2">{s.lotto}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatMoney(s.costo_standard)}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatMoney(s.full_cost)}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatMoney(s.prezzo_minimo)}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatMoney(s.attrezzaggio_pz)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Note */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Note Generali</h2>
          <textarea
            value={model.note_generali}
            onChange={(e) => handleChange("note_generali", e.target.value)}
            disabled={isReadOnly && !isNew}
            rows={4}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50"
          />
        </div>

        {/* Dialog Riga */}
        {dialogOpen && rigaEdit && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">
                  {rigaIndex !== null ? "Modifica Riga" : "Nuova Riga"}
                </h3>
                <button onClick={() => setDialogOpen(false)}>
                  <X className="h-5 w-5 text-slate-400" />
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="col-span-2 md:col-span-3">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Categoria</label>
                  <select
                    value={rigaEdit.categoria}
                    onChange={(e) =>
                      handleRigaChange("categoria", e.target.value as RigaCiclo["categoria"])
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  >
                    {CATEGORIE_RIGA.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Codice Articolo
                  </label>
                  <input
                    type="text"
                    value={rigaEdit.codice_articolo}
                    onChange={(e) => handleRigaChange("codice_articolo", e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Descrizione
                  </label>
                  <input
                    type="text"
                    value={rigaEdit.descrizione}
                    onChange={(e) => handleRigaChange("descrizione", e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
                {(["COMPONENTE", "COMPONENTE/ASSIEME", "LAVORAZIONE A PESO", "LAVORAZIONE A PEZZO", "LAVORAZIONE TERZISTA A PESO", "LAVORAZIONE TERZISTA A PEZZO"].includes(rigaEdit.categoria)) && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Fornitore</label>
                  <input
                    type="text"
                    value={rigaEdit.fornitore}
                    onChange={(e) => handleRigaChange("fornitore", e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
                )}
                {(rigaEdit.categoria === "MATERIA PRIMA DA TRASFORMARE") && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Tipo Materiale
                  </label>
                  <input
                    type="text"
                    value={rigaEdit.tipo_materiale}
                    onChange={(e) => handleRigaChange("tipo_materiale", e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
                )}
                {(rigaEdit.categoria === "MATERIA PRIMA DA TRASFORMARE") && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Tipo Materia Prima
                  </label>
                  <input
                    type="text"
                    value={rigaEdit.tipo_materia_prima}
                    onChange={(e) => handleRigaChange("tipo_materia_prima", e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
                )}
                {(rigaEdit.categoria === "MATERIA PRIMA DA TRASFORMARE") && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Lunghezza</label>
                  <input
                    type="number"
                    step="0.1"
                    value={rigaEdit.lunghezza}
                    onChange={(e) => handleRigaChange("lunghezza", parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
                )}
                {(rigaEdit.categoria === "MATERIA PRIMA DA TRASFORMARE") && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Larghezza</label>
                  <input
                    type="number"
                    step="0.1"
                    value={rigaEdit.larghezza}
                    onChange={(e) => handleRigaChange("larghezza", parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
                )}
                {(rigaEdit.categoria === "MATERIA PRIMA DA TRASFORMARE") && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Spessore</label>
                  <input
                    type="number"
                    step="0.1"
                    value={rigaEdit.spessore}
                    onChange={(e) => handleRigaChange("spessore", parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
                )}
                {(rigaEdit.categoria === "MATERIA PRIMA DA TRASFORMARE") && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Diametro</label>
                  <input
                    type="number"
                    step="0.1"
                    value={rigaEdit.diametro}
                    onChange={(e) => handleRigaChange("diametro", parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
                )}
                {(["MATERIA PRIMA DA TRASFORMARE", "LAVORAZIONE A PESO", "LAVORAZIONE TERZISTA A PESO"].includes(rigaEdit.categoria)) && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Peso Kg</label>
                  <input
                    type="number"
                    step="0.001"
                    value={rigaEdit.peso_kg}
                    onChange={(e) => handleRigaChange("peso_kg", parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Nr Componenti
                  </label>
                  <input
                    type="number"
                    value={rigaEdit.nr_componenti}
                    onChange={(e) =>
                      handleRigaChange("nr_componenti", parseFloat(e.target.value) || 0)
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
                {(rigaEdit.categoria === "LAVORAZIONE INTERNA") && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Colpi/min (pezzi/min)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={rigaEdit.colpi_min}
                    onChange={(e) => handleRigaChange("colpi_min", parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
                )}
                {(rigaEdit.categoria === "LAVORAZIONE INTERNA") && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Lotto Voce</label>
                  <input
                    type="number"
                    value={rigaEdit.lotto_voce}
                    onChange={(e) =>
                      handleRigaChange("lotto_voce", parseFloat(e.target.value) || 0)
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
                )}
                {(rigaEdit.categoria === "LAVORAZIONE INTERNA") && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Attrezzaggio min
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={rigaEdit.attrezzaggio_min}
                    onChange={(e) =>
                      handleRigaChange("attrezzaggio_min", parseFloat(e.target.value) || 0)
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
                )}
                {(rigaEdit.categoria !== "LAVORAZIONE INTERNA" && !rigaEdit.assembly_auto) && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Costo Unitario €
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={rigaEdit.costo_unitario}
                    onChange={(e) =>
                      handleRigaChange("costo_unitario", parseFloat(e.target.value) || 0)
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
                )}
                {rigaEdit.assembly_auto && (
                  <div className="col-span-2 md:col-span-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                    Costo assieme calcolato automaticamente dalla somma dei componenti (fino a 4 livelli).
                    Il costo unitario manuale precedente viene mantenuto nello storico ma non sommato.
                  </div>
                )}
                {(false) && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Costo/min €
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={rigaEdit.costo_min}
                    onChange={(e) => handleRigaChange("costo_min", parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
                )}
                {(rigaEdit.categoria === "MATERIA PRIMA DA TRASFORMARE") && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Sfrido %</label>
                  <input
                    type="number"
                    step="0.1"
                    value={rigaEdit.sfrido}
                    onChange={(e) => handleRigaChange("sfrido", parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
                )}
                {rigaEdit.categoria === "SPESA ATTREZZATURA DEDICATA" && (
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={rigaEdit.considera === true}
                      onChange={(e) => handleRigaChange("considera", e.target.checked)} />
                    Includi costo attrezzatura nel ciclo
                  </label>
                )}
                <div className="col-span-2 md:col-span-3">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Note</label>
                  <textarea
                    value={rigaEdit.note}
                    onChange={(e) => handleRigaChange("note", e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={() => setDialogOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-sm hover:bg-slate-50"
                >
                  Annulla
                </button>
                <button
                  onClick={saveRiga}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700"
                >
                  Salva Riga
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Save Revision Dialog */}
        {saveDialogOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl max-w-md w-full p-6">
              <div className="flex items-center gap-2 mb-4">
                <Copy className="h-5 w-5 text-emerald-600" />
                <h3 className="text-lg font-semibold">Crea Nuova Revisione</h3>
              </div>
              <p className="text-sm text-slate-600 mb-6">
                Verrà creata una nuova revisione del ciclo. La revisione precedente (rev. {model.rev}) rimarrà invariata.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setSaveDialogOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-sm hover:bg-slate-50"
                >
                  Annulla
                </button>
                <button
                  onClick={confirmSaveRevision}
                  disabled={!isModified || createRevision.isPending}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Crea Revisione
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
