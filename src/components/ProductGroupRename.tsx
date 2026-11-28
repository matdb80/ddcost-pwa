import { useState } from "react";
import { Pencil } from "lucide-react";
import { trpc } from "@/providers/trpc";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
export type GroupRenameResult = {
  id: number;
  oldName: string;
  name: string;
  updatedQuotes: number;
  editToken?: string;
};
export default function ProductGroupRename({
  group,
  disabled,
  onRenamed,
  quoteId,
  quoteToken,
}: {
  group?: { id: number; name: string };
  disabled: boolean;
  onRenamed: (result: GroupRenameResult) => void;
  quoteId?: number;
  quoteToken?: string;
}) {
  const [open, setOpen] = useState(false),
    [name, setName] = useState(""),
    [error, setError] = useState("");
  const rename = trpc.productGroup.rename.useMutation();
  const utils = trpc.useUtils();
  if (!group) return null;
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        aria-label="Rinomina gruppo merceologico"
        title="Rinomina in tutti i preventivi"
        className="rounded p-1 text-sky-800 disabled:opacity-40"
        onClick={() => {
          setName(group.name);
          setError("");
          setOpen(true);
        }}
      >
        <Pencil size={16} />
      </button>
      <Dialog
        open={open}
        onOpenChange={value => {
          if (!rename.isPending) setOpen(value);
        }}
      >
        <DialogContent>
          <DialogTitle>Rinomina gruppo merceologico</DialogTitle>
          <DialogDescription>
            La modifica verrà applicata a tutti i preventivi, comprese bozze e
            revisioni storiche. Prezzi e costi rimarranno invariati.
          </DialogDescription>
          <label className="grid gap-1 text-sm">
            Nuovo nome
            <input
              aria-label="Nuovo nome gruppo"
              maxLength={120}
              disabled={rename.isPending}
              className="rounded border p-2"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </label>
          {error && (
            <p role="alert" className="text-red-700">
              {error}
            </p>
          )}
          <button
            type="button"
            className="rounded bg-emerald-700 p-2 text-white disabled:opacity-40"
            disabled={
              rename.isPending || name.trim().length < 2 || name === group.name
            }
            onClick={async () => {
              try {
                const result = await rename.mutateAsync({
                  id: group.id,
                  expectedName: group.name,
                  name,
                  confirmGlobal: true,
                  quoteId,
                  quoteToken,
                });
                onRenamed(result);
                setOpen(false);
                void utils.productGroup.list.invalidate();
                void utils.quote.list.invalidate();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            {rename.isPending
              ? "Aggiornamento…"
              : "Conferma modifica in tutti i preventivi"}
          </button>
        </DialogContent>
      </Dialog>
    </>
  );
}
