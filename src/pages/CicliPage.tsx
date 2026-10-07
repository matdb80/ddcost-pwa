import Layout from "@/components/Layout";
import { trpc } from "@/providers/trpc";
import { useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";

export default function CicliPage() {
  const [search, setSearch] = useState("");
  const { data: cycles, refetch } = trpc.cycle.list.useQuery({ search, limit: 100 });
  const createCycle = trpc.cycle.create.useMutation({ onSuccess: () => refetch() });
  const deleteCycle = trpc.cycle.delete.useMutation({ onSuccess: () => refetch() });

  const handleCreate = () => {
    createCycle.mutate({
      code: "NUOVO",
      description: "Nuovo ciclo",
      dataJson: JSON.stringify({ items: [] }),
    });
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="relative w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Cerca ciclo..."
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Nuovo Ciclo
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600">ID</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Codice</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Descrizione</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Cliente</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Rev.</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Costo Std.</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Prezzo Min.</th>
                <th className="text-center px-4 py-3 font-medium text-slate-600">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {cycles?.map((c) => (
                <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-500">{c.id}</td>
                  <td className="px-4 py-3 font-medium text-slate-800">{c.code}</td>
                  <td className="px-4 py-3 text-slate-600">{c.description}</td>
                  <td className="px-4 py-3 text-slate-600">{c.client}</td>
                  <td className="px-4 py-3 text-slate-500">{c.rev}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-700">
                    {c.standardCost ? `€ ${c.standardCost}` : "-"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-700">
                    {c.minimumPrice ? `€ ${c.minimumPrice}` : "-"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => c.id && deleteCycle.mutate({ id: c.id })}
                      className="text-red-500 hover:text-red-700 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {(!cycles || cycles.length === 0) && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    Nessun ciclo trovato. Crea il tuo primo ciclo con il pulsante in alto.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
