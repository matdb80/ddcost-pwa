import Layout from "@/components/Layout";
import { useState } from "react";
import { Calculator, AlertCircle } from "lucide-react";

export default function BandelleVenetaPage() {
  const [macro, setMacro] = useState("");

  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">
          Bandelle alla veneta Giotto Plus
        </h2>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-amber-800 font-medium">
              Archivio dati richiesto
            </p>
            <p className="text-xs text-amber-700 mt-1">
              Verifica che nella cartella data sia presente il file giotto_veneta.xlsm.
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Calculator className="w-4 h-4 text-emerald-600" />
            Dati calcolo
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">
                Macro-categoria
              </label>
              <select
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                value={macro}
                onChange={(e) => setMacro(e.target.value)}
              >
                <option value="">Seleziona...</option>
                <option value="standard">Standard</option>
                <option value="personalizzato">Personalizzato</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">
                Quantità lotto
              </label>
              <input
                type="number"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                defaultValue={1}
              />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors">
              Calcola prezzo
            </button>
            <button className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors">
              Clear
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
