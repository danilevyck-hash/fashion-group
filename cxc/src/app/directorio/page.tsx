"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { Toast, SkeletonTable, EmptyState, ConfirmDeleteModal, ConfirmModal, AccordionContent, Modal, ScrollableTable } from "@/components/ui";
import UndoToast from "@/components/UndoToast";
import { useUndoAction } from "@/lib/hooks/useUndoAction";
import { fmtDate } from "@/lib/format";
import XLSX from "xlsx-js-style";
import { usePersistedState, usePersistedScroll } from "@/lib/hooks/usePersistedState";

interface Cliente {
  id: string;
  nombre: string;
  empresa: string;
  telefono: string;
  celular: string;
  whatsapp: string;
  correo: string;
  contacto: string;
  notas: string;
  created_at: string;
}

export default function DirectorioPage() {
  const router = useRouter();
  const { authChecked, role } = useAuth({ moduleKey: "directorio", allowedRoles: ["admin","secretaria","director","vendedor"] });
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;
  const [expanded, setExpanded] = usePersistedState<string | null>("directorio", "expanded", null);
  usePersistedScroll("directorio", !loading && clientes.length > 0);
  const [editing, setEditing] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Cliente>>({});
  const [showNew, setShowNew] = useState(false);
  const [newData, setNewData] = useState({ nombre: "", empresa: "", whatsapp: "", correo: "", contacto: "", notas: "" });
  const [toast, setToast] = useState<string | null>(null);
  const { pendingUndo: pendingUndoDir, scheduleAction: scheduleUndoDir, undoAction: undoActionDir } = useUndoAction();
  const [savingNew, setSavingNew] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Cliente | null>(null);
  const [cxcClients, setCxcClients] = useState<Set<string>>(new Set());
  const [isDirty, setIsDirty] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"" | "saving" | "saved">("");
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [empresaFilter, setEmpresaFilter] = useState("");
  const [empresas, setEmpresas] = useState<string[]>([]);
  const importRef = useRef<HTMLInputElement>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [confirmBatchDelete, setConfirmBatchDelete] = useState(false);
  const [empresaSearch, setEmpresaSearch] = useState("");
  const [empresaDropdownOpen, setEmpresaDropdownOpen] = useState(false);
  const [mobileContactId, setMobileContactId] = useState<string | null>(null);
  const [confirmDupCreate, setConfirmDupCreate] = useState<{ match: Cliente } | null>(null);
  const [confirmUnsavedTarget, setConfirmUnsavedTarget] = useState<{ action: () => void } | null>(null);

  const loadClientes = useCallback(async (searchTerm: string, pg: number, empFilter?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ search: searchTerm, page: String(pg), limit: String(PAGE_SIZE) });
      if ((empFilter ?? empresaFilter) ) params.set("empresa", (empFilter ?? empresaFilter));
      const res = await fetch(`/api/directorio?${params}`);
      if (res.ok) {
        const result = await res.json();
        setClientes(result.data || []);
        setTotal(result.total || 0);
      } else {
        showToast("No se pudieron cargar los contactos. Recarga la pagina.");
      }
    } catch {
      showToast("Error de conexion al cargar contactos.");
    }
    setLoading(false);
  }, []);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // Load on search/page/empresa change
  useEffect(() => {
    if (authChecked) loadClientes(debouncedSearch, page, empresaFilter);
  }, [authChecked, debouncedSearch, page, empresaFilter, loadClientes]);

  // Load CXC clients for badge
  useEffect(() => {
    if (authChecked) {
      fetch("/api/clients").then(r => r.ok ? r.json() : []).then(d => {
        const names = new Set<string>((d || []).map((r: {nombre_normalized: string}) => r.nombre_normalized));
        setCxcClients(names);
      }).catch(() => {});
    }
  }, [authChecked]);

  // Load unique empresas on mount
  useEffect(() => {
    if (authChecked) {
      fetch("/api/directorio").then(r => r.ok ? r.json() : []).then(d => {
        const list = (Array.isArray(d) ? d : d.data || [])
          .map((r: { empresa: string }) => (r.empresa || "").trim())
          .filter(Boolean);
        setEmpresas([...new Set(list as string[])].sort());
      }).catch(() => {});
    }
  }, [authChecked]);

  // Warn on unsaved changes (beforeunload)
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  if (!authChecked) return null;

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  function detectDelimiter(text: string): string {
    const firstLine = text.split("\n")[0] || "";
    const semicolons = (firstLine.match(/;/g) || []).length;
    const commas = (firstLine.match(/,/g) || []).length;
    return semicolons >= commas ? ";" : ",";
  }

  async function doCreateContact() {
    setSavingNew(true);
    try {
      const res = await fetch("/api/directorio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newData),
      });
      if (res.ok) {
        setNewData({ nombre: "", empresa: "", whatsapp: "", correo: "", contacto: "", notas: "" });
        setShowNew(false);
        loadClientes(debouncedSearch, page);
        setToast("Contacto creado");
      } else { setToast("No se pudo crear el contacto. Intenta de nuevo."); }
    } catch { setToast("Error de conexión. Intenta de nuevo."); }
    setSavingNew(false);
  }

  async function handleCreate() {
    if (!newData.nombre.trim()) return;
    setSavingNew(true);
    try {
      // Duplicate detection
      try {
        const dupRes = await fetch(`/api/directorio?search=${encodeURIComponent(newData.nombre.trim())}&page=1&limit=50`);
        if (dupRes.ok) {
          const dupResult = await dupRes.json();
          const matches = (dupResult.data || []).filter((c: Cliente) =>
            c.nombre.toLowerCase().trim() === newData.nombre.toLowerCase().trim() &&
            c.empresa.toLowerCase().trim() === (newData.empresa || "").toLowerCase().trim()
          );
          if (matches.length > 0) {
            const match = matches[0];
            setConfirmDupCreate({ match });
            setSavingNew(false);
            return;
          }
        }
      } catch { /* proceed if dedup check fails */ }
      await doCreateContact();
    } catch { setToast("Error de conexión. Intenta de nuevo."); setSavingNew(false); }
  }

  async function handleUpdate(id: string) {
    try {
      const res = await fetch(`/api/directorio/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editData),
      });
      if (!res.ok) { showToast("Error al actualizar contacto"); return; }
      setEditing(null);
      setIsDirty(false);
      showToast("Contacto actualizado");
      loadClientes(debouncedSearch, page);
      // Sync to CXC overrides
      const cliente = editData as Partial<Cliente>;
      if (cliente.nombre) {
        const normalized = cliente.nombre.toUpperCase().trim().replace(/\s+/g, " ");
        await fetch("/api/overrides", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nombre_normalized: normalized,
            correo: cliente.correo || "",
            telefono: cliente.telefono || "",
            celular: cliente.celular || "",
            contacto: cliente.contacto || "",
          }),
        }).catch(() => {}); // Don't fail if CXC override doesn't exist
      }
    } catch { showToast("Error al actualizar contacto"); }
  }

  function handleDelete(id: string) {
    const contacto = clientes.find(c => c.id === id);
    const nombre = contacto?.nombre || "contacto";
    setClientes(prev => prev.filter(c => c.id !== id));
    setExpanded(null);
    setDeleteTarget(null);
    scheduleUndoDir({
      id: `delete-contacto-${id}`,
      message: `${nombre} eliminado`,
      execute: async () => {
        try {
          const res = await fetch(`/api/directorio/${id}`, { method: "DELETE" });
          if (!res.ok) { showToast("No se pudo eliminar. Intenta de nuevo."); loadClientes(debouncedSearch, page); }
        } catch { showToast("Sin conexion. Intenta de nuevo."); loadClientes(debouncedSearch, page); }
      },
      onRevert: () => loadClientes(debouncedSearch, page),
    });
  }

  async function handleImport(file: File) {
    const text = await file.text();
    const lines = text.split("\n").filter((l) => l.trim());
    const delimiter = detectDelimiter(text);
    let start = 0;
    if (lines[0] && lines[0].toLowerCase().startsWith("nombre")) start = 1;

    // Parse all rows
    const rows = [];
    for (let i = start; i < lines.length; i++) {
      const parts = lines[i].split(delimiter).map((s) => s.trim());
      if (!parts[0]) continue;
      rows.push({
        nombre: parts[0] || "", empresa: parts[1] || "", telefono: parts[2] || "",
        celular: parts[3] || "", correo: parts[4] || "", contacto: parts[5] || "", notas: parts[6] || "",
      });
    }

    // Check for duplicates
    const names = rows.map(r => r.nombre);
    let dupSet = new Set<string>();
    try {
      const res = await fetch("/api/directorio", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names }),
      });
      if (res.ok) {
        const { duplicates } = await res.json();
        dupSet = new Set((duplicates || []).map((d: string) => d.toLowerCase().trim()));
      }
    } catch { /* proceed without dedup */ }

    const newRows = rows.filter(r => !dupSet.has(r.nombre.toLowerCase().trim()));
    const dupCount = rows.length - newRows.length;

    let count = 0;
    for (const row of newRows) {
      const res = await fetch("/api/directorio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(row),
      });
      if (res.ok) count++;
    }
    showToast(`${count} importados${dupCount > 0 ? `, ${dupCount} duplicados omitidos` : ""}`);
    loadClientes(debouncedSearch, page);
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function exportSelectedExcel() {
    if (selectedIds.size === 0) return;
    const selected = clientes.filter(c => selectedIds.has(c.id));
    const rows: string[][] = [["FASHION GROUP — Directorio Seleccionados"], [], ["Nombre", "Empresa", "Teléfono", "Celular", "WhatsApp", "Correo", "Contacto", "Notas"]];
    for (const c of selected) rows.push([c.nombre, c.empresa, c.telefono, c.celular, c.whatsapp, c.correo, c.contacto, c.notas]);
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 32 }, { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 28 }, { wch: 20 }, { wch: 20 }];
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Directorio");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `Directorio-seleccionados-${new Date().toISOString().slice(0, 10)}.xlsx`; a.click(); URL.revokeObjectURL(url);
  }

  async function doBatchDelete() {
    if (selectedIds.size === 0) return;
    setBatchDeleting(true);
    setConfirmBatchDelete(false);
    const ids = Array.from(selectedIds);
    let deleted = 0;
    for (const id of ids) {
      try {
        const res = await fetch(`/api/directorio/${id}`, { method: "DELETE" });
        if (res.ok) deleted++;
      } catch { /* continue */ }
    }
    showToast(`${deleted} contacto${deleted !== 1 ? "s" : ""} eliminado${deleted !== 1 ? "s" : ""}`);
    setSelectedIds(new Set());
    setSelectionMode(false);
    setBatchDeleting(false);
    loadClientes(debouncedSearch, page);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <style jsx global>{`
        @media print {
          nav, [data-print-hide] { display: none !important; }
          body { font-size: 11px; color: #000; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border-bottom: 1px solid #ccc; padding: 4px 8px; text-align: left; }
          th { font-weight: 600; border-bottom: 2px solid #000; }
          .max-w-6xl { max-width: 100% !important; padding: 0 !important; }
        }
        @keyframes slide-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .animate-slide-up {
          animation: slide-up 250ms cubic-bezier(0.16, 1, 0.3, 1);
        }
      `}</style>
      <AppHeader module="Directorio de Clientes" />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3" data-print-hide>
        <h1 className="text-xl font-light tracking-tight">Directorio</h1>
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={importRef}
            type="file"
            accept=".csv,.txt"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImport(f);
              if (importRef.current) importRef.current.value = "";
            }}
          />
          {selectionMode ? (
            <>
              <span className="text-sm text-gray-400">{selectedIds.size} seleccionado{selectedIds.size !== 1 ? "s" : ""}</span>
              {selectedIds.size > 0 && (
                <>
                  <button onClick={exportSelectedExcel} className="text-sm text-gray-400 hover:text-black border border-gray-200 px-4 py-2 rounded-md active:bg-gray-100 transition-all">Exportar seleccionados</button>
                  {role === "admin" && (
                    <button onClick={() => setConfirmBatchDelete(true)} disabled={batchDeleting} className="text-sm text-red-500 hover:text-red-700 border border-red-200 px-4 py-2 rounded-md active:bg-red-50 transition-all disabled:opacity-50">
                      {batchDeleting ? "Eliminando..." : "Eliminar seleccionados"}
                    </button>
                  )}
                </>
              )}
              <button onClick={() => { setSelectionMode(false); setSelectedIds(new Set()); }} className="text-sm text-gray-400 hover:text-black transition">Cancelar</button>
            </>
          ) : (
            <>
              {(role === "admin" || role === "secretaria") && (
              <>
              <button onClick={() => importRef.current?.click()} title="Formato: CSV separado por ; (punto y coma). Columnas: Nombre, Empresa, Teléfono, Celular, Correo, Contacto, Notas" className="text-sm text-gray-600 hover:text-black border border-gray-300 hover:border-gray-400 px-4 py-2.5 sm:py-2 rounded-md transition inline-flex items-center gap-1.5 min-h-[44px]">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                Importar
              </button>
              <button onClick={() => {
                const headers = "Nombre;Empresa;Teléfono;Celular;Correo;Contacto;Notas";
                const blob = new Blob([headers + "\n"], { type: "text/csv;charset=utf-8;" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "plantilla-directorio.csv";
                a.click();
                URL.revokeObjectURL(url);
              }} className="text-sm text-gray-400 hover:text-black transition">
                Descargar plantilla
              </button>
              </>
              )}
              <button onClick={() => { setSelectionMode(true); setSelectedIds(new Set()); }} className="text-sm text-gray-400 hover:text-black border border-gray-200 px-4 py-2 rounded-md transition">Seleccionar</button>
              <button onClick={() => window.open("/api/directorio?format=csv")} className="text-sm text-gray-400 hover:text-black transition">
                Exportar CSV
              </button>
              <button onClick={() => window.print()} className="text-sm text-gray-400 hover:text-black transition">
                Imprimir
              </button>
              <button onClick={async () => {
                const allRes = await fetch("/api/directorio");
                const allClientes = allRes.ok ? await allRes.json() : [];
                const rows: string[][] = [["FASHION GROUP — Directorio de Clientes"], [], ["Nombre", "Empresa", "Teléfono", "Celular", "Correo", "Contacto", "Notas"]];
                for (const c of allClientes) rows.push([c.nombre, c.empresa, c.telefono, c.celular, c.correo, c.contacto, c.notas]);
                const ws = XLSX.utils.aoa_to_sheet(rows);
                ws["!cols"] = [{ wch: 32 }, { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 28 }, { wch: 20 }, { wch: 20 }];
                ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }];
                const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Directorio");
                const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
                const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
                const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `Directorio-${new Date().toISOString().slice(0, 10)}.xlsx`; a.click(); URL.revokeObjectURL(url);
              }} title="Exportar a Excel" className="text-sm text-gray-400 hover:text-black border border-gray-200 px-3 py-2.5 sm:py-1.5 rounded-full transition">↓ Excel</button>
              {(role === "admin" || role === "secretaria") && (
              <button onClick={() => setShowNew(true)}
                className="text-sm bg-black text-white px-6 py-2.5 rounded-md font-medium hover:bg-gray-800 transition">
                Nuevo Contacto
              </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* New contact modal */}
      <Modal open={showNew} onClose={() => setShowNew(false)} title="Nuevo Contacto" maxWidth="max-w-lg">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] text-gray-400 uppercase tracking-widest block mb-1">Nombre *</label>
            <input type="text" value={newData.nombre} onChange={(e) => setNewData({ ...newData, nombre: e.target.value })}
              className="w-full border-b border-gray-200 py-1.5 text-sm outline-none focus:border-black transition" />
          </div>
          <div>
            <label className="text-[10px] text-gray-400 uppercase tracking-widest block mb-1">Empresa</label>
            <input type="text" value={newData.empresa} onChange={(e) => setNewData({ ...newData, empresa: e.target.value })}
              className="w-full border-b border-gray-200 py-1.5 text-sm outline-none focus:border-black transition" />
          </div>
          <div>
            <label className="text-[10px] text-gray-400 uppercase tracking-widest block mb-1">WhatsApp</label>
            <input type="text" value={newData.whatsapp} onChange={(e) => setNewData({ ...newData, whatsapp: e.target.value })}
              placeholder="+507 6000-0000"
              className="w-full border-b border-gray-200 py-1.5 text-sm outline-none focus:border-black transition" />
          </div>
          <div>
            <label className="text-[10px] text-gray-400 uppercase tracking-widest block mb-1">Correo</label>
            <input type="text" value={newData.correo} onChange={(e) => setNewData({ ...newData, correo: e.target.value })}
              className="w-full border-b border-gray-200 py-1.5 text-sm outline-none focus:border-black transition" />
          </div>
          <div>
            <label className="text-[10px] text-gray-400 uppercase tracking-widest block mb-1">Contacto</label>
            <input type="text" value={newData.contacto} onChange={(e) => setNewData({ ...newData, contacto: e.target.value })}
              className="w-full border-b border-gray-200 py-1.5 text-sm outline-none focus:border-black transition" />
          </div>
          <div className="col-span-2">
            <label className="text-[10px] text-gray-400 uppercase tracking-widest block mb-1">Notas</label>
            <input type="text" value={newData.notas} onChange={(e) => setNewData({ ...newData, notas: e.target.value })}
              className="w-full border-b border-gray-200 py-1.5 text-sm outline-none focus:border-black transition" />
          </div>
        </div>
        <div className="flex items-center gap-4 mt-6">
          <button onClick={handleCreate} disabled={savingNew}
            className="text-sm bg-black text-white px-6 py-2.5 rounded-md font-medium hover:bg-gray-800 transition disabled:opacity-50">
            {savingNew ? "Guardando..." : "Guardar Cliente"}
          </button>
          <button onClick={() => setShowNew(false)} className="text-sm text-gray-400 hover:text-black transition">Cancelar</button>
        </div>
      </Modal>

      {/* Search */}
      <div className="flex items-end gap-4 mb-6" data-print-hide>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o empresa..."
          className="border-b border-gray-200 py-2 text-sm outline-none focus:border-black w-full max-w-sm"
        />
        <div className="relative">
          <div className="flex items-center">
            <svg className="absolute left-0 text-gray-300 pointer-events-none" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              type="text"
              value={empresaFilter ? empresaFilter : empresaSearch}
              onChange={(e) => {
                setEmpresaSearch(e.target.value);
                setEmpresaDropdownOpen(true);
                if (!e.target.value) { setEmpresaFilter(""); setPage(1); }
              }}
              onFocus={() => setEmpresaDropdownOpen(true)}
              onBlur={() => setTimeout(() => setEmpresaDropdownOpen(false), 200)}
              placeholder="Filtrar empresa..."
              className="border-b border-gray-200 py-2 pl-6 text-sm outline-none focus:border-black bg-transparent w-44"
            />
            {empresaFilter && (
              <button
                onClick={() => { setEmpresaFilter(""); setEmpresaSearch(""); setPage(1); }}
                className="text-gray-400 hover:text-black ml-1 text-xs min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                &times;
              </button>
            )}
          </div>
          {empresaDropdownOpen && (
            <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-50 mt-1 max-h-48 overflow-y-auto">
              <button
                type="button"
                onMouseDown={() => { setEmpresaFilter(""); setEmpresaSearch(""); setEmpresaDropdownOpen(false); setPage(1); }}
                className="block w-full text-left px-3 py-2.5 text-sm text-gray-400 hover:bg-gray-50 transition min-h-[44px]"
              >
                Todas las empresas
              </button>
              {empresas
                .filter((emp) => !empresaSearch || emp.toLowerCase().includes(empresaSearch.toLowerCase()))
                .map((emp) => (
                  <button
                    key={emp}
                    type="button"
                    onMouseDown={() => { setEmpresaFilter(emp); setEmpresaSearch(""); setEmpresaDropdownOpen(false); setPage(1); }}
                    className="block w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 transition min-h-[44px]"
                  >
                    {emp}
                  </button>
                ))}
            </div>
          )}
        </div>
        <span className="text-xs text-gray-400 pb-2">{total} contacto{total !== 1 ? "s" : ""}</span>
      </div>

      {/* Table */}
      {loading ? (
        <SkeletonTable rows={5} cols={5} />
      ) : clientes.length === 0 && !search ? (
        <EmptyState
          title="Directorio vacío"
          subtitle="Agrega tu primer cliente al directorio"
          actionLabel="+ Nuevo Cliente"
          onAction={() => setShowNew(true)}
        />
      ) : (
        <>
          <ScrollableTable minWidth={600}>
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white z-10">
              <tr className="border-b border-gray-200">
                {selectionMode && (
                  <th className="py-3 px-2 w-8">
                    <input type="checkbox" checked={clientes.length > 0 && clientes.every(c => selectedIds.has(c.id))} onChange={() => { const allIds = clientes.map(c => c.id); const allSel = allIds.length > 0 && allIds.every(id => selectedIds.has(id)); if (allSel) setSelectedIds(new Set()); else setSelectedIds(new Set(allIds)); }} className="accent-black" title="Seleccionar todos" />
                  </th>
                )}
                <th className="text-left py-3 px-4 text-[11px] uppercase tracking-[0.05em] text-gray-400 font-normal">Nombre</th>
                <th className="text-left py-3 px-4 text-[11px] uppercase tracking-[0.05em] text-gray-400 font-normal">Empresa</th>
                <th className="text-left py-3 px-4 text-[11px] uppercase tracking-[0.05em] text-gray-400 font-normal">WhatsApp</th>
                <th className="text-left py-3 px-4 text-[11px] uppercase tracking-[0.05em] text-gray-400 font-normal">Correo</th>
                <th className="text-left py-3 px-4 text-[11px] uppercase tracking-[0.05em] text-gray-400 font-normal">Contacto</th>
                <th className="text-right py-3 px-4 text-[11px] uppercase tracking-[0.05em] text-gray-400 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => {
                const isExpanded = expanded === c.id;
                const isEditing = editing === c.id;
                return (
                  <tr key={c.id} className="border-b border-gray-200 hover:bg-gray-50 transition-colors align-top">
                    <td colSpan={selectionMode ? 7 : 6} className="p-0">
                      {/* Main row */}
                      <div
                        className={`grid gap-1 py-3 cursor-pointer ${selectionMode ? "grid-cols-[auto_1fr_1fr] sm:grid-cols-[auto_1fr_1fr_1fr] lg:grid-cols-[auto_1fr_1fr_1fr_1fr_1fr_auto]" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"}`}
                        onClick={() => {
                          if (selectionMode) { toggleSelect(c.id); return; }
                          if (isDirty && editing && editing !== c.id) {
                            setConfirmUnsavedTarget({ action: () => { setEditing(null); setIsDirty(false); if (window.innerWidth < 768) { setMobileContactId(c.id); setExpanded(null); } else { setExpanded(expanded === c.id ? null : c.id); } } });
                            return;
                          }
                          // On mobile, open bottom sheet; on tablet/desktop, expand inline
                          if (window.innerWidth < 768) {
                            setMobileContactId(isExpanded ? null : c.id);
                            setExpanded(null);
                          } else {
                            setExpanded(isExpanded ? null : c.id);
                          }
                        }}
                        onDoubleClick={(e) => {
                          e.preventDefault();
                          if (role !== "admin" && role !== "secretaria") return;
                          if (isDirty && editing && editing !== c.id) {
                            setConfirmUnsavedTarget({ action: () => { setEditing(c.id); setEditData(c); setIsDirty(false); setExpanded(c.id); } });
                            return;
                          }
                          setExpanded(c.id);
                          setEditing(c.id);
                          setEditData(c);
                          setIsDirty(false);
                        }}
                      >
                        {selectionMode && (
                          <div className="flex items-center px-2" onClick={(e) => { e.stopPropagation(); toggleSelect(c.id); }}>
                            <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSelect(c.id)} className="accent-black" />
                          </div>
                        )}
                        <div className="font-medium">{c.nombre}{cxcClients.has(c.nombre.toUpperCase().trim().replace(/\s+/g, " ")) && (
                          <span className="text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full ml-1" title="Este contacto también aparece en Cuentas por Cobrar">En CxC</span>
                        )}</div>
                        <div className="text-gray-500">{c.empresa || <span className="text-gray-300">—</span>}</div>
                        <div className="text-gray-500">{c.whatsapp ? (
                          <a href={`https://wa.me/${(c.whatsapp).replace(/[^0-9]/g, "")}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-800">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a3.04 3.04 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/></svg>
                            {c.whatsapp}
                          </a>
                        ) : <span className="text-gray-300">—</span>}</div>
                        <div className="text-gray-500">{c.correo ? (
                          <a href={`mailto:${c.correo}`} onClick={(e) => e.stopPropagation()} className="text-gray-600 hover:text-black underline underline-offset-2">{c.correo}</a>
                        ) : <span className="text-gray-300">—</span>}</div>
                        <div className="text-gray-500">{c.contacto || <span className="text-gray-300">—</span>}</div>
                        <div className="flex items-center justify-end pr-2">
                          <svg className={`w-4 h-4 text-gray-300 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        </div>
                      </div>

                      {/* Expanded detail / Edit form */}
                      <AccordionContent open={isExpanded}>
                        {isExpanded && !isEditing && (
                          <div className="bg-gray-50 px-4 py-3 mb-1 rounded-lg text-sm">
                            <div className="text-gray-500 mb-1">Teléfono: {c.telefono || <span className="text-gray-300">—</span>}</div>
                            <div className="text-gray-500 mb-1">Notas: {c.notas || <span className="text-gray-300">—</span>}</div>
                            <div className="text-gray-400 text-xs mb-3">Creado: {fmtDate(c.created_at.slice(0, 10))}</div>
                            <div className="flex gap-3">
                              {(role === "admin" || role === "secretaria") && (
                              <button onClick={(e) => { e.stopPropagation(); setEditing(c.id); setEditData(c); setIsDirty(false); }}
                                className="text-sm text-gray-400 hover:text-black transition py-2.5 sm:py-1.5 min-h-[44px]">Editar</button>
                              )}
                              <button onClick={(e) => { e.stopPropagation(); router.push(`/admin?search=${encodeURIComponent(c.nombre)}`); }}
                                title="Ver deuda de este cliente en Cuentas por Cobrar" className="text-xs text-gray-400 hover:text-black transition py-2.5 sm:py-1.5 min-h-[44px]">Ver en CXC →</button>
                              {role === "admin" && (
                                <button onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }}
                                  className="text-sm text-gray-400 hover:text-red-500 transition py-2.5 sm:py-1.5 min-h-[44px]">Eliminar Contacto</button>
                              )}
                            </div>
                          </div>
                        )}

                        {isExpanded && isEditing && (role === "admin" || role === "secretaria") && (
                          <div className="bg-gray-50 px-4 py-3 mb-1 rounded-lg" onClick={(e) => e.stopPropagation()}>
                            <div className="grid grid-cols-2 gap-3">
                              {(["nombre", "empresa", "whatsapp", "correo", "contacto", "notas"] as const).map((field) => (
                                <div key={field}>
                                  <label className="text-[10px] text-gray-400 uppercase tracking-widest block mb-1">{field}</label>
                                  <input type="text" value={(editData as Record<string, string>)[field] || ""}
                                    onChange={(e) => {
                                      const next = { ...editData, [field]: e.target.value };
                                      setEditData(next);
                                      setIsDirty(true);
                                      if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
                                      autoSaveRef.current = setTimeout(async () => {
                                        setAutoSaveStatus("saving");
                                        try {
                                          const res = await fetch(`/api/directorio/${c.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
                                          if (res.ok) {
                                            setIsDirty(false);
                                            setAutoSaveStatus("saved");
                                            setTimeout(() => setAutoSaveStatus(""), 2000);
                                            loadClientes(debouncedSearch, page);
                                            // Sync to CXC overrides
                                            const nombre = (next as Partial<Cliente>).nombre;
                                            if (nombre) {
                                              const normalized = nombre.toUpperCase().trim().replace(/\s+/g, " ");
                                              fetch("/api/overrides", {
                                                method: "POST",
                                                headers: { "Content-Type": "application/json" },
                                                body: JSON.stringify({
                                                  nombre_normalized: normalized,
                                                  correo: (next as Partial<Cliente>).correo || "",
                                                  telefono: (next as Partial<Cliente>).telefono || "",
                                                  celular: (next as Partial<Cliente>).celular || "",
                                                  contacto: (next as Partial<Cliente>).contacto || "",
                                                }),
                                              }).catch(() => {});
                                            }
                                          } else { setAutoSaveStatus(""); }
                                        } catch { setAutoSaveStatus(""); }
                                      }, 2000);
                                    }}
                                    className="w-full border-b border-gray-200 py-1 text-sm outline-none focus:border-black transition bg-transparent" />
                                </div>
                              ))}
                            </div>
                            <div className="flex items-center gap-3 mt-4">
                              <button onClick={() => { if (autoSaveRef.current) clearTimeout(autoSaveRef.current); if (isDirty) { setConfirmUnsavedTarget({ action: () => { setEditing(null); setIsDirty(false); setAutoSaveStatus(""); } }); return; } setEditing(null); setIsDirty(false); setAutoSaveStatus(""); }} className="text-sm text-gray-400 hover:text-black transition">Cerrar edición</button>
                              {autoSaveStatus === "saving" && <span className="text-xs text-gray-400">Guardando...</span>}
                              {autoSaveStatus === "saved" && <span className="text-xs text-green-600">Listo, guardado</span>}
                              {autoSaveStatus === "" && !isDirty && <span className="text-xs text-gray-400">Guardado automáticamente</span>}
                            </div>
                          </div>
                        )}
                      </AccordionContent>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </ScrollableTable>
          {clientes.length === 0 && search && (
            <p className="text-center text-gray-300 text-sm py-12">No encontramos nada para &quot;{search}&quot;. Intenta con otro termino.</p>
          )}
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-6" data-print-hide>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="text-sm border border-gray-200 px-4 py-2 rounded-md hover:border-gray-400 transition disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]">← Anterior</button>
              <span className="text-xs text-gray-400">Página {page} de {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="text-sm border border-gray-200 px-4 py-2 rounded-md hover:border-gray-400 transition disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]">Siguiente →</button>
            </div>
          )}
        </>
      )}

      {/* Mobile contact detail modal (iPhone) */}
      {mobileContactId && (() => {
        const mc = clientes.find(c => c.id === mobileContactId);
        if (!mc) return null;
        return (
          <div className="md:hidden fixed inset-0 z-50 bg-black/40" onClick={() => setMobileContactId(null)}>
            <div
              className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl max-h-[90vh] overflow-y-auto animate-slide-up"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Drag handle */}
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-10 h-1 rounded-full bg-gray-300" />
              </div>

              <div className="px-5 pb-8">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-semibold">{mc.nombre}</h2>
                    {mc.empresa && <p className="text-sm text-gray-500">{mc.empresa}</p>}
                  </div>
                  <button
                    onClick={() => setMobileContactId(null)}
                    className="text-gray-400 hover:text-black min-h-[44px] min-w-[44px] flex items-center justify-center -mr-2"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>

                {/* Quick action buttons */}
                <div className="grid grid-cols-3 gap-3 mb-6">
                  {mc.whatsapp ? (
                    <a
                      href={`https://wa.me/${mc.whatsapp.replace(/[^0-9]/g, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex flex-col items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-xl py-4 min-h-[76px] text-emerald-700 hover:bg-emerald-100 active:scale-[0.97] transition-all"
                    >
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a3.04 3.04 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/></svg>
                      <span className="text-xs font-medium">WhatsApp</span>
                    </a>
                  ) : (
                    <div className="flex flex-col items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-xl py-4 min-h-[76px] text-gray-300">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a3.04 3.04 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/></svg>
                      <span className="text-xs">WhatsApp</span>
                    </div>
                  )}
                  {(mc.telefono || mc.celular) ? (
                    <a
                      href={`tel:${(mc.celular || mc.telefono).replace(/[^0-9+]/g, "")}`}
                      className="flex flex-col items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-xl py-4 min-h-[76px] text-blue-700 hover:bg-blue-100 active:scale-[0.97] transition-all"
                    >
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                      <span className="text-xs font-medium">Llamar</span>
                    </a>
                  ) : (
                    <div className="flex flex-col items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-xl py-4 min-h-[76px] text-gray-300">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                      <span className="text-xs">Llamar</span>
                    </div>
                  )}
                  {mc.correo ? (
                    <a
                      href={`mailto:${mc.correo}`}
                      className="flex flex-col items-center gap-1.5 bg-violet-50 border border-violet-200 rounded-xl py-4 min-h-[76px] text-violet-700 hover:bg-violet-100 active:scale-[0.97] transition-all"
                    >
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                      <span className="text-xs font-medium">Email</span>
                    </a>
                  ) : (
                    <div className="flex flex-col items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-xl py-4 min-h-[76px] text-gray-300">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                      <span className="text-xs">Email</span>
                    </div>
                  )}
                </div>

                {/* Contact details */}
                <div className="space-y-3">
                  {mc.whatsapp && (
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-0.5">WhatsApp</p>
                      <p className="text-sm">{mc.whatsapp}</p>
                    </div>
                  )}
                  {mc.telefono && (
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-0.5">Teléfono</p>
                      <p className="text-sm">{mc.telefono}</p>
                    </div>
                  )}
                  {mc.celular && (
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-0.5">Celular</p>
                      <p className="text-sm">{mc.celular}</p>
                    </div>
                  )}
                  {mc.correo && (
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-0.5">Correo</p>
                      <p className="text-sm">{mc.correo}</p>
                    </div>
                  )}
                  {mc.contacto && (
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-0.5">Contacto</p>
                      <p className="text-sm">{mc.contacto}</p>
                    </div>
                  )}
                  {mc.notas && (
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-0.5">Notas</p>
                      <p className="text-sm text-gray-600">{mc.notas}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-0.5">Creado</p>
                    <p className="text-sm text-gray-500">{fmtDate(mc.created_at.slice(0, 10))}</p>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap gap-3 mt-6 pt-4 border-t border-gray-100">
                  {(role === "admin" || role === "secretaria") && (
                    <button
                      onClick={() => { setMobileContactId(null); setExpanded(mc.id); setEditing(mc.id); setEditData(mc); setIsDirty(false); }}
                      className="text-sm text-gray-500 hover:text-black transition min-h-[44px] px-4"
                    >
                      Editar
                    </button>
                  )}
                  <button
                    onClick={() => { setMobileContactId(null); router.push(`/admin?search=${encodeURIComponent(mc.nombre)}`); }}
                    className="text-sm text-gray-500 hover:text-black transition min-h-[44px] px-4"
                  >
                    Ver en CXC
                  </button>
                  {role === "admin" && (
                    <button
                      onClick={() => { setMobileContactId(null); handleDelete(mc.id); }}
                      className="text-sm text-gray-400 hover:text-red-500 transition min-h-[44px] px-4"
                    >
                      Eliminar
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      <ConfirmDeleteModal
        open={confirmBatchDelete}
        onCancel={() => setConfirmBatchDelete(false)}
        onConfirm={doBatchDelete}
        title="Eliminar contactos"
        description={`¿Seguro que deseas eliminar ${selectedIds.size} contacto${selectedIds.size !== 1 ? "s" : ""}? Esta acción no se puede deshacer.`}
      />
      <ConfirmModal
        open={!!confirmDupCreate}
        onClose={() => setConfirmDupCreate(null)}
        onConfirm={() => { setConfirmDupCreate(null); doCreateContact(); }}
        title="Contacto similar encontrado"
        message={confirmDupCreate ? `Ya existe un contacto similar: ${confirmDupCreate.match.nombre} en ${confirmDupCreate.match.empresa || "(sin empresa)"}. ¿Crear de todos modos?` : ""}
        confirmLabel="Crear de todos modos"
      />
      <ConfirmModal
        open={!!confirmUnsavedTarget}
        onClose={() => setConfirmUnsavedTarget(null)}
        onConfirm={() => { const action = confirmUnsavedTarget?.action; setConfirmUnsavedTarget(null); if (action) action(); }}
        title="Cambios sin guardar"
        message="Tienes cambios sin guardar. ¿Salir sin guardar?"
        confirmLabel="Salir sin guardar"
      />
      <Toast message={toast} />
      {pendingUndoDir && <UndoToast message={pendingUndoDir.message} startedAt={pendingUndoDir.startedAt} onUndo={undoActionDir} />}
    </div>
    </div>
  );
}
