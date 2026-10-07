import Layout from "@/components/Layout";
import { useState } from "react";
import { Calculator } from "lucide-react";

const AMBITI = [
  {
    id: "occhio-standard",
    title: "Occhio standard",
    desc: "Occhio centrale o decentrato standard",
    img: "/images/occhio standard.png",
  },
  {
    id: "occhio-misura",
    title: "Occhio decentrato a misura",
    desc: "Entratura a misura personalizzata",
    img: "/images/decentrato a misura.png",
  },
  {
    id: "zanca-filo",
    title: "Zanca a filo",
    desc: "Zancatura a filo con lama",
    img: "/images/zancata a filo.png",
  },
];

export default function BandelleTPage() {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <Layout>
      <div className="max-w-5xl mx-auto">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">
          Bandelle a T — Calcolo prezzi
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {AMBITI.map((amb) => (
            <button
              key={amb.id}
              onClick={() => setSelected(amb.id)}
              className={`text-left p-4 rounded-xl border-2 transition-all ${
                selected === amb.id
                  ? "border-emerald-500 bg-emerald-50"
                  : "border-slate-200 bg-white hover:border-emerald-300"
              }`}
            >
              <div className="h-24 bg-white rounded-lg border border-slate-100 mb-3 flex items-center justify-center overflow-hidden">
                <img
                  src={amb.img}
                  alt={amb.title}
                  className="max-h-full max-w-full object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
              <h3 className="font-semibold text-slate-800">{amb.title}</h3>
              <p className="text-xs text-slate-500 mt-1">{amb.desc}</p>
            </button>
          ))}
        </div>

        {selected && (
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <Calculator className="w-4 h-4 text-emerald-600" />
              Dati calcolo
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">
                  Quantità lotto
                </label>
                <input
                  type="number"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  defaultValue={20}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">
                  Collo C richiesto (mm)
                </label>
                <input
                  type="number"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  defaultValue={55}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">
                  Diametro occhio (mm)
                </label>
                <input
                  type="number"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  defaultValue={12}
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
        )}
      </div>
    </Layout>
  );
}
