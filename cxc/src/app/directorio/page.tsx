"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { Toast, SkeletonTable, EmptyState, ConfirmDeleteModal } from "@/components/ui";
import XLSX from "xlsx-js-style";

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
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Cliente>>({});
  const [showNew, setShowNew] = useState(false);
  const [newData, setNewData] = useState({ nombre: "", empresa: "", whatsapp: "", correo: "", contacto: "", notas: "" });
  const [toast, setToast] = useState<string | null>(null);
  const [savingNew, setSavingNew] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Cliente | null>(null);
  const [cxcClients, setCxcClients] = useState<Set<string>>(new Set());
  const [isDirty, setIsDirty] = useState(false);
  const [empresaFilter, setEmpresaFilter] = useState("");
  const [empresas, setEmpresas] = useState<string[]>([]);
  const importRef = useRef<HTMLInputElement>(null);

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
            if (!confirm(`Ya existe un contacto similar: ${match.nombre} en ${match.empresa || "(sin empresa)"}. ¿Crear de todos modos?`)) {
              setSavingNew(false);
              return;
            }
          }
        }
      } catch { /* proceed if dedup check fails */ }
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

  async function handleUpdate(id: string) {
    const res = await fetch(`/api/directorio/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editData),
    });
    if (res.ok) {
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
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/directorio/${id}`, { method: "DELETE" });
      if (res.ok) { setExpanded(null); showToast("Contacto eliminado"); loadClientes(debouncedSearch, page); }
      else showToast("Error al eliminar");
    } catch { showToast("Error de conexión"); }
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
      `}</style>
      <AppHeader module="Directorio de Clientes" />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-5" data-print-hide>
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
          {(role === "admin" || role === "secretaria") && (
          <button onClick={() => importRef.current?.click()} title="Formato: CSV separado por ; (punto y coma). Columnas: Nombre, Empresa, Teléfono, Celular, Correo, Contacto, Notas" className="text-sm text-gray-400 hover:text-black transition">
            Importar CSV
          </button>
          )}
          {(role === "admin" || role === "secretaria") && !showNew && (
            <span className="text-[10px] text-gray-300 hidden lg:inline">Formato: ; separado</span>
          )}
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
        </div>
      </div>

      {/* New contact form */}
      {showNew && ( /* data-print-hide applied via parent */
        <div className="border border-gray-200 rounded-lg p-6 mb-8">
          <div className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-4">Nuevo Contacto</div>
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
              className="text-sm bg-black text-white px-6 py-2.5 rounded-md font-medium hover:bg-gray-800 transition disabled:opacity-40">
              {savingNew ? "Guardando..." : "Guardar Cliente"}
            </button>
            <button onClick={() => setShowNew(false)} className="text-sm text-gray-400 hover:text-black transition">Cancelar</button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="flex items-end gap-4 mb-6" data-print-hide>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o empresa..."
          className="border-b border-gray-200 py-2 text-sm outline-none focus:border-black w-full max-w-sm"
        />
        <select
          value={empresaFilter}
          onChange={(e) => { setEmpresaFilter(e.target.value); setPage(1); }}
          className="border-b border-gray-200 py-2 text-sm outline-none focus:border-black bg-transparent"
        >
          <option value="">Todas las empresas</option>
          {empresas.map((emp) => (
            <option key={emp} value={emp}>{emp}</option>
          ))}
        </select>
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
          <div className="overflow-x-auto -mx-4 sm:mx-0">
          <div className="min-w-[600px] px-4 sm:px-0">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white z-10">
              <tr className="border-b border-gray-200">
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
                    <td colSpan={6} className="p-0">
                      {/* Main row */}
                      <div
                        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1 py-3 cursor-pointer"
                        onClick={() => {
                          if (isDirty && editing && editing !== c.id) {
                            if (!confirm("Tienes cambios sin guardar. ¿Salir sin guardar?")) return;
                            setEditing(null);
                            setIsDirty(false);
                          }
                          setExpanded(isExpanded ? null : c.id);
                        }}
                      >
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
                        <div className="text-right text-gray-300 text-xs">{isExpanded ? "▼" : "▶"}</div>
                      </div>

                      {/* Expanded detail */}
                      {isExpanded && !isEditing && (
                        <div className="bg-gray-50 px-4 py-3 mb-1 rounded-lg text-sm">
                          <div className="text-gray-500 mb-1">Teléfono: {c.telefono || <span className="text-gray-300">—</span>}</div>
                          <div className="text-gray-500 mb-1">Notas: {c.notas || <span className="text-gray-300">—</span>}</div>
                          <div className="text-gray-400 text-xs mb-3">Creado: {new Date(c.created_at).toLocaleDateString("es-PA")}</div>
                          <div className="flex gap-3">
                            {(role === "admin" || role === "secretaria") && (
                            <button onClick={(e) => { e.stopPropagation(); setEditing(c.id); setEditData(c); setIsDirty(false); }}
                              className="text-sm text-gray-400 hover:text-black transition py-2.5 sm:py-1.5">Editar</button>
                            )}
                            <button onClick={(e) => { e.stopPropagation(); router.push(`/admin?search=${encodeURIComponent(c.nombre)}`); }}
                              title="Ver deuda de este cliente en Cuentas por Cobrar" className="text-xs text-gray-400 hover:text-black transition py-2.5 sm:py-1.5">Ver en CXC →</button>
                            {role === "admin" && (
                              <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(c); }}
                                className="text-sm text-gray-400 hover:text-red-500 transition py-2.5 sm:py-1.5">Eliminar Contacto</button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Edit form */}
                      {isExpanded && isEditing && (role === "admin" || role === "secretaria") && (
                        <div className="bg-gray-50 px-4 py-3 mb-1 rounded-lg" onClick={(e) => e.stopPropagation()}>
                          <div className="grid grid-cols-2 gap-3">
                            {(["nombre", "empresa", "whatsapp", "correo", "contacto", "notas"] as const).map((field) => (
                              <div key={field}>
                                <label className="text-[10px] text-gray-400 uppercase tracking-widest block mb-1">{field}</label>
                                <input type="text" value={(editData as Record<string, string>)[field] || ""}
                                  onChange={(e) => { setEditData({ ...editData, [field]: e.target.value }); setIsDirty(true); }}
                                  className="w-full border-b border-gray-200 py-1 text-sm outline-none focus:border-black transition bg-transparent" />
                              </div>
                            ))}
                          </div>
                          <div className="flex gap-3 mt-4">
                            <button onClick={() => handleUpdate(c.id)}
                              className="text-sm bg-black text-white px-5 py-1.5 rounded-full hover:bg-gray-800 transition">Guardar Cliente</button>
                            <button onClick={() => { if (isDirty && !confirm("Tienes cambios sin guardar. ¿Salir sin guardar?")) return; setEditing(null); setIsDirty(false); }} className="text-sm text-gray-400 hover:text-black transition">Cancelar</button>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          </div>
          {clientes.length === 0 && search && (
            <p className="text-center text-gray-300 text-sm py-12">Sin resultados para &quot;{search}&quot;</p>
          )}
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-6" data-print-hide>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="text-sm border border-gray-200 px-4 py-2 rounded-md hover:border-gray-400 transition disabled:opacity-30 disabled:cursor-not-allowed">← Anterior</button>
              <span className="text-xs text-gray-400">Página {page} de {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="text-sm border border-gray-200 px-4 py-2 rounded-md hover:border-gray-400 transition disabled:opacity-30 disabled:cursor-not-allowed">Siguiente →</button>
            </div>
          )}
        </>
      )}

      <Toast message={toast} />
      <ConfirmDeleteModal
        open={!!deleteTarget}
        title={`¿Eliminar ${deleteTarget?.nombre || "contacto"}?`}
        description="Se eliminará el contacto y su información de la base de datos."
        onConfirm={() => { if (deleteTarget) { handleDelete(deleteTarget.id); setDeleteTarget(null); } }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
    </div>
  );
}
