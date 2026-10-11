import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertTriangle,
  Bug,
  Lightbulb,
  Sparkles,
  Search,
  Download,
  FileText,
  RefreshCw,
  Settings,
  Eye,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  Square,
} from "lucide-react";

const statusLabels: Record<string, string> = {
  nuova: "Nuova",
  da_pianificare: "Da pianificare",
  in_lavorazione: "In lavorazione",
  risolta_collaudo: "Risolta nel collaudo",
  rilasciata: "Rilasciata",
  duplicata: "Duplicata",
  non_riproducibile: "Non riproducibile",
};

const statusColors: Record<string, string> = {
  nuova: "bg-slate-100 text-slate-700",
  da_pianificare: "bg-blue-50 text-blue-700",
  in_lavorazione: "bg-amber-50 text-amber-700",
  risolta_collaudo: "bg-purple-50 text-purple-700",
  rilasciata: "bg-emerald-50 text-emerald-700",
  duplicata: "bg-gray-100 text-gray-500",
  non_riproducibile: "bg-gray-100 text-gray-500",
};

const typeIcons: Record<string, React.ReactNode> = {
  bug: <Bug className="w-4 h-4" />,
  miglioramento: <Lightbulb className="w-4 h-4" />,
  nuova_funzione: <Sparkles className="w-4 h-4" />,
};

export default function FeedbackAdminPage() {
  const { user, isLoading } = useAuth({ redirectOnUnauthenticated: false });

  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [search, setSearch] = useState("");
  const [detailId, setDetailId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newThreshold, setNewThreshold] = useState(10);

  const statsQuery = trpc.feedback.getStats.useQuery();
  const listQuery = trpc.feedback.listAdmin.useQuery({
    page,
    pageSize,
    status: (statusFilter || undefined) as "nuova" | "da_pianificare" | "in_lavorazione" | "risolta_collaudo" | "rilasciata" | "duplicata" | "non_riproducibile" | undefined,
    type: (typeFilter || undefined) as "bug" | "miglioramento" | "nuova_funzione" | undefined,
    severity: (severityFilter || undefined) as "normale" | "bloccante" | undefined,
    search: search || undefined,
  });
  const detailQuery = trpc.feedback.getById.useQuery(
    { id: detailId! },
    { enabled: detailId !== null }
  );
  const settingsQuery = trpc.feedback.getSettings.useQuery();

  const utils = trpc.useUtils();
  const updateMutation = trpc.feedback.updateStatus.useMutation({
    onSuccess: () => {
      utils.feedback.listAdmin.invalidate();
      utils.feedback.getStats.invalidate();
      utils.feedback.getById.invalidate();
    },
  });
  const updateSettingsMutation = trpc.feedback.updateSettings.useMutation({
    onSuccess: () => {
      utils.feedback.getSettings.invalidate();
      utils.feedback.getStats.invalidate();
      setSettingsOpen(false);
    },
  });

  const exportMutation = trpc.feedback.export.useMutation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
      </div>
    );
  }

  if (!user || user.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  const stats = statsQuery.data;
  const threshold = settingsQuery.data?.releaseThreshold ?? 10;
  const pending = stats?.pendingForRelease ?? 0;
  const thresholdReached = pending >= threshold;

  const toggleSelect = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    const items = listQuery.data?.items ?? [];
    const allOnPage = items.length > 0 && items.every(i => selectedIds.has(i.id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      for (const item of items) {
        if (allOnPage) next.delete(item.id);
        else next.add(item.id);
      }
      return next;
    });
  };

  const handleExport = async (format: "markdown" | "json") => {
    const ids = selectedIds.size > 0 ? Array.from(selectedIds) : undefined;
    const result = await exportMutation.mutateAsync({ ids, format });
    const blob = new Blob([result.content], { type: format === "json" ? "application/json" : "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `segnalazioni.${format === "json" ? "json" : "md"}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleUpdateStatus = (id: number, status: string) => {
    updateMutation.mutate({ id, status: status as any });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Registro Segnalazioni</h1>
          <p className="text-sm text-slate-500">Gestione ticket di bug, miglioramenti e nuove funzioni</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => { setNewThreshold(threshold); setSettingsOpen(true); }}>
            <Settings className="w-4 h-4 mr-1" />
            Soglia: {threshold}
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport("markdown")}>
            <FileText className="w-4 h-4 mr-1" />
            Esporta MD
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport("json")}>
            <Download className="w-4 h-4 mr-1" />
            Esporta JSON
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-sm text-slate-500">Totale segnalazioni</p>
          <p className="text-2xl font-bold text-slate-800">{stats?.total ?? 0}</p>
        </div>
        <div className={`rounded-xl border p-4 ${thresholdReached ? "bg-amber-50 border-amber-200" : "bg-white border-slate-200"}`}>
          <p className="text-sm text-slate-500">Per prossima revisione</p>
          <div className="flex items-center gap-2">
            <p className={`text-2xl font-bold ${thresholdReached ? "text-amber-700" : "text-slate-800"}`}>
              {pending}
            </p>
            <span className="text-sm text-slate-400">/ {threshold}</span>
            {thresholdReached && <AlertTriangle className="w-5 h-5 text-amber-600" />}
          </div>
          {thresholdReached && (
            <p className="text-xs text-amber-700 mt-1">Soglia raggiunta! Pronti per revisione cumulativa.</p>
          )}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-sm text-slate-500">Bug bloccanti</p>
          <p className="text-2xl font-bold text-red-600">{stats?.blocking ?? 0}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-sm text-slate-500">Selezionati</p>
          <p className="text-2xl font-bold text-slate-800">{selectedIds.size}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Cerca..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter || "all"} onValueChange={(v) => { setStatusFilter(v === "all" ? "" : v); setPage(1); }}>
            <SelectTrigger>
              <SelectValue placeholder="Stato" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti gli stati</SelectItem>
              {Object.entries(statusLabels).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter || "all"} onValueChange={(v) => { setTypeFilter(v === "all" ? "" : v); setPage(1); }}>
            <SelectTrigger>
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti i tipi</SelectItem>
              <SelectItem value="bug">Bug</SelectItem>
              <SelectItem value="miglioramento">Miglioramento</SelectItem>
              <SelectItem value="nuova_funzione">Nuova funzione</SelectItem>
            </SelectContent>
          </Select>
          <Select value={severityFilter || "all"} onValueChange={(v) => { setSeverityFilter(v === "all" ? "" : v); setPage(1); }}>
            <SelectTrigger>
              <SelectValue placeholder="Gravità" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutta la gravità</SelectItem>
              <SelectItem value="normale">Normale</SelectItem>
              <SelectItem value="bloccante">Bloccante</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => { setStatusFilter(""); setTypeFilter(""); setSeverityFilter(""); setSearch(""); setPage(1); }}>
            <RefreshCw className="w-4 h-4 mr-1" />
            Reset
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <button onClick={toggleSelectAll}>
                  {selectedIds.size === (listQuery.data?.items.length ?? 0) && (listQuery.data?.items.length ?? 0) > 0 ? (
                    <CheckSquare className="w-4 h-4" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                </button>
              </TableHead>
              <TableHead>Ticket</TableHead>
              <TableHead>Titolo</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Gravità</TableHead>
              <TableHead>Stato</TableHead>
              <TableHead>Utente</TableHead>
              <TableHead>Data</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {listQuery.isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600 mx-auto" />
                </TableCell>
              </TableRow>
            ) : listQuery.data?.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-slate-400">
                  Nessuna segnalazione trovata
                </TableCell>
              </TableRow>
            ) : (
              listQuery.data?.items.map((item) => (
                <TableRow key={item.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setDetailId(item.id)}>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedIds.has(item.id)}
                      onCheckedChange={() => toggleSelect(item.id)}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-sm">{item.ticketNumber}</TableCell>
                  <TableCell className="font-medium max-w-xs truncate">{item.title}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-slate-600">
                      {typeIcons[item.type]}
                      <span className="text-xs capitalize">{item.type.replace("_", " ")}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {item.severity === "bloccante" ? (
                      <span className="flex items-center gap-1 text-red-600 text-xs font-semibold">
                        <AlertTriangle className="w-3 h-3" />
                        Bloccante
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500">Normale</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge className={`${statusColors[item.status] ?? "bg-slate-100"} text-xs`}>
                      {statusLabels[item.status] ?? item.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-slate-600">{item.userName ?? "N/D"}</TableCell>
                  <TableCell className="text-sm text-slate-400">
                    {item.createdAt ? new Date(item.createdAt).toLocaleDateString("it-IT") : "N/D"}
                  </TableCell>
                  <TableCell>
                    <Eye className="w-4 h-4 text-slate-400" />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        {listQuery.data && listQuery.data.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200">
            <p className="text-sm text-slate-500">
              Pagina {page} di {listQuery.data.totalPages} ({listQuery.data.total} totali)
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" disabled={page >= listQuery.data.totalPages} onClick={() => setPage(page + 1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Dialog */}
      <Dialog open={detailId !== null} onOpenChange={(o) => { if (!o) setDetailId(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Dettaglio segnalazione</DialogTitle>
          </DialogHeader>
          {detailQuery.data?.ticket && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-lg font-bold">{detailQuery.data.ticket.ticketNumber}</span>
                <Badge className={statusColors[detailQuery.data.ticket.status] ?? ""}>
                  {statusLabels[detailQuery.data.ticket.status]}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-slate-500">Tipo:</span> {detailQuery.data.ticket.type}</div>
                <div><span className="text-slate-500">Gravità:</span> {detailQuery.data.ticket.severity}</div>
                <div><span className="text-slate-500">Utente:</span> {detailQuery.data.ticket.userName} ({detailQuery.data.ticket.userEmail})</div>
                <div><span className="text-slate-500">Data:</span> {new Date(detailQuery.data.ticket.createdAt).toLocaleString("it-IT")}</div>
                <div><span className="text-slate-500">Pagina:</span> {detailQuery.data.ticket.pageRoute ?? "N/D"}</div>
                <div><span className="text-slate-500">Build:</span> {detailQuery.data.ticket.buildVersion ?? "N/D"}</div>
                {detailQuery.data.ticket.cycleId && (
                  <div><span className="text-slate-500">Ciclo:</span> {detailQuery.data.ticket.cycleId} {detailQuery.data.ticket.cycleRev ? `(rev ${detailQuery.data.ticket.cycleRev})` : ""}</div>
                )}
              </div>

              <div className="bg-slate-50 p-3 rounded-lg">
                <p className="text-sm font-semibold text-slate-700 mb-1">{detailQuery.data.ticket.title}</p>
                <p className="text-sm text-slate-600 whitespace-pre-wrap">{detailQuery.data.ticket.description}</p>
              </div>

              {detailQuery.data.ticket.technicalNote && (
                <div className="bg-amber-50 p-3 rounded-lg border border-amber-200">
                  <p className="text-xs font-semibold text-amber-700 mb-1">Nota tecnica</p>
                  <p className="text-sm text-amber-800">{detailQuery.data.ticket.technicalNote}</p>
                </div>
              )}

              {detailQuery.data.attachments.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-slate-700 mb-2">Screenshot</p>
                  {detailQuery.data.attachments.map((att) => (
                    <img
                      key={att.id}
                      src={`data:${att.mimeType};base64,${att.dataBase64}`}
                      alt={att.fileName ?? "Screenshot"}
                      className="max-h-48 rounded border border-slate-200 object-contain"
                    />
                  ))}
                </div>
              )}

              {/* Admin actions */}
              <div className="border-t border-slate-200 pt-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Cambia stato</Label>
                    <Select
                      value={detailQuery.data.ticket.status}
                      onValueChange={(v) => handleUpdateStatus(detailQuery.data.ticket!.id, v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(statusLabels).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Conta per release</Label>
                    <Select
                      value={detailQuery.data.ticket.includeInReleaseCount === 1 ? "true" : "false"}
                      onValueChange={(v) =>
                        updateMutation.mutate({
                          id: detailQuery.data.ticket!.id,
                          status: detailQuery.data.ticket!.status,
                          includeInReleaseCount: v === "true",
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">Sì</SelectItem>
                        <SelectItem value="false">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Nota tecnica</Label>
                  <Textarea
                    defaultValue={detailQuery.data.ticket.technicalNote ?? ""}
                    onBlur={(e) => {
                      if (e.target.value !== (detailQuery.data.ticket!.technicalNote ?? "")) {
                        updateMutation.mutate({
                          id: detailQuery.data.ticket!.id,
                          status: detailQuery.data.ticket!.status,
                          technicalNote: e.target.value,
                        });
                      }
                    }}
                    rows={2}
                    placeholder="Aggiungi nota tecnica..."
                  />
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Configurazione soglia release</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Segnalazioni per prossima revisione</Label>
              <Input
                type="number"
                min={1}
                max={1000}
                value={newThreshold}
                onChange={(e) => setNewThreshold(parseInt(e.target.value) || 10)}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSettingsOpen(false)}>Annulla</Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => updateSettingsMutation.mutate({ releaseThreshold: newThreshold })}
                disabled={updateSettingsMutation.isPending}
              >
                Salva
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
