"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import FGLogo from "@/components/FGLogo";

interface Cliente {
  id: string;
  nombre: string;
  empresa: string;
  telefono: string;
  celular: string;
  correo: string;
  contacto: string;
  notas: string;
  created_at: string;
}

export default function DirectorioPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [role, setRole] = useState("");
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Cliente>>({});
  const [showNew, setShowNew] = useState(false);
  const [newData, setNewData] = useState({ nombre: "", empresa: "", telefono: "", celular: "", correo: "", contacto: "", notas: "" });
  const [toast, setToast] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const r = sessionStorage.getItem("cxc_role");
    if (!r || (r !== "admin" && r !== "director" && r !== "upload")) {
      router.push("/");
    } else {
      setRole(r);
      setAuthChecked(true);
    }
  }, []);

  const loadClientes = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/directorio");
    if (res.ok) setClientes(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authChecked) loadClientes();
  }, [authChecked, loadClientes]);

  if (!authChecked) return null;

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function handleCreate() {
    if (!newData.nombre.trim()) return;
    const res = await fetch("/api/directorio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newData),
    });
    if (res.ok) {
      setNewData({ nombre: "", empresa: "", telefono: "", celular: "", correo: "", contacto: "", notas: "" });
      setShowNew(false);
      loadClientes();
    }
  }

  async function handleUpdate(id: string) {
    const res = await fetch(`/api/directorio/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editData),
    });
    if (res.ok) { setEditing(null); loadClientes(); }
  }

  async function handleDelete(id: string) {
    if (!confirm("¿Eliminar este contacto?")) return;
    const res = await fetch(`/api/directorio/${id}`, { method: "DELETE" });
    if (res.ok) { setExpanded(null); loadClientes(); }
  }

  async function handleImport(file: File) {
    const text = await file.text();
    const lines = text.split("\n").filter((l) => l.trim());
    let start = 0;
    if (lines[0] && lines[0].toLowerCase().startsWith("nombre")) start = 1;

    let count = 0;
    for (let i = start; i < lines.length; i++) {
      const parts = lines[i].split(";").map((s) => s.trim());
      if (!parts[0]) continue;
      const res = await fetch("/api/directorio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: parts[0] || "",
          empresa: parts[1] || "",
          telefono: parts[2] || "",
          celular: parts[3] || "",
          correo: parts[4] || "",
          contacto: parts[5] || "",
          notas: parts[6] || "",
        }),
      });
      if (res.ok) count++;
    }
    showToast(`${count} contactos importados`);
    loadClientes();
  }

  const filtered = clientes.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return c.nombre.toLowerCase().includes(q) || c.empresa.toLowerCase().includes(q);
  });

  return (
    <div>
      <AppHeader module="Directorio de Clientes" />
      <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-end justify-between mb-10">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Directorio</h1>
          <p className="text-sm text-gray-400 mt-1">Contactos del grupo</p>
        </div>
        <div className="flex items-center gap-3">
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
          <button onClick={() => importRef.current?.click()} className="text-sm text-gray-400 hover:text-black transition">
            Importar CSV
          </button>
          <button onClick={() => window.open("/api/directorio?format=csv")} className="text-sm text-gray-400 hover:text-black transition">
            Exportar CSV
          </button>
          <button onClick={() => setShowNew(true)}
            className="text-sm bg-black text-white px-6 py-2.5 rounded-full font-medium hover:bg-gray-800 transition">
            Nuevo Contacto
          </button>
        </div>
      </div>

      {/* New contact form */}
      {showNew && (
        <div className="border border-gray-100 rounded-2xl p-6 mb-8">
          <div className="text-xs uppercase tracking-widest text-gray-400 mb-4">Nuevo Contacto</div>
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
              <label className="text-[10px] text-gray-400 uppercase tracking-widest block mb-1">Teléfono</label>
              <input type="text" value={newData.telefono} onChange={(e) => setNewData({ ...newData, telefono: e.target.value })}
                className="w-full border-b border-gray-200 py-1.5 text-sm outline-none focus:border-black transition" />
            </div>
            <div>
              <label className="text-[10px] text-gray-400 uppercase tracking-widest block mb-1">Celular</label>
              <input type="text" value={newData.celular} onChange={(e) => setNewData({ ...newData, celular: e.target.value })}
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
            <button onClick={handleCreate}
              className="text-sm bg-black text-white px-6 py-2.5 rounded-full font-medium hover:bg-gray-800 transition">
              Guardar
            </button>
            <button onClick={() => setShowNew(false)} className="text-sm text-gray-400 hover:text-black transition">Cancelar</button>
          </div>
        </div>
      )}

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar por nombre o empresa..."
        className="border-b border-gray-200 py-2 text-sm outline-none focus:border-black w-full max-w-sm mb-6"
      />

      {/* Table */}
      {loading ? (
        <div>{[...Array(5)].map((_, i) => <div key={i} className="animate-pulse flex gap-4 py-3 border-b border-gray-100"><div className="h-3 bg-gray-100 rounded w-1/3" /><div className="h-3 bg-gray-100 rounded w-1/5 ml-auto" /><div className="h-3 bg-gray-100 rounded w-1/5" /></div>)}</div>
      ) : filtered.length === 0 && !search ? (
        <div className="text-center py-20">
          <p className="text-sm font-medium text-gray-700 mb-1">No hay contactos</p>
          <p className="text-sm text-gray-400 mb-6">Importa un CSV o agrega un contacto manualmente</p>
        </div>
      ) : (
        <>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-widest text-gray-400">
                <th className="text-left pb-3 font-medium">Nombre</th>
                <th className="text-left pb-3 font-medium">Empresa</th>
                <th className="text-left pb-3 font-medium">Teléfono</th>
                <th className="text-left pb-3 font-medium">Correo</th>
                <th className="text-left pb-3 font-medium">Contacto</th>
                <th className="text-right pb-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const isExpanded = expanded === c.id;
                const isEditing = editing === c.id;
                return (
                  <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition align-top">
                    <td colSpan={6} className="p-0">
                      {/* Main row */}
                      <div
                        className="grid grid-cols-6 py-3 cursor-pointer"
                        onClick={() => setExpanded(isExpanded ? null : c.id)}
                      >
                        <div className="font-medium">{c.nombre}</div>
                        <div className="text-gray-500">{c.empresa}</div>
                        <div className="text-gray-500">{c.telefono}</div>
                        <div className="text-gray-500">{c.correo}</div>
                        <div className="text-gray-500">{c.contacto}</div>
                        <div className="text-right text-gray-300 text-xs">{isExpanded ? "▼" : "▶"}</div>
                      </div>

                      {/* Expanded detail */}
                      {isExpanded && !isEditing && (
                        <div className="bg-gray-50 px-4 py-3 mb-1 rounded-lg text-sm">
                          {c.celular && <div className="text-gray-500 mb-1">Celular: {c.celular}</div>}
                          {c.notas && <div className="text-gray-500 mb-1">Notas: {c.notas}</div>}
                          <div className="text-gray-400 text-xs mb-3">Creado: {new Date(c.created_at).toLocaleDateString("es-PA")}</div>
                          <div className="flex gap-3">
                            <button onClick={(e) => { e.stopPropagation(); setEditing(c.id); setEditData(c); }}
                              className="text-sm text-gray-400 hover:text-black transition">Editar</button>
                            {role === "admin" && (
                              <button onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }}
                                className="text-sm text-gray-300 hover:text-red-500 transition">Eliminar</button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Edit form */}
                      {isExpanded && isEditing && (
                        <div className="bg-gray-50 px-4 py-3 mb-1 rounded-lg" onClick={(e) => e.stopPropagation()}>
                          <div className="grid grid-cols-2 gap-3">
                            {(["nombre", "empresa", "telefono", "celular", "correo", "contacto", "notas"] as const).map((field) => (
                              <div key={field}>
                                <label className="text-[10px] text-gray-400 uppercase tracking-widest block mb-1">{field}</label>
                                <input type="text" value={(editData as Record<string, string>)[field] || ""}
                                  onChange={(e) => setEditData({ ...editData, [field]: e.target.value })}
                                  className="w-full border-b border-gray-200 py-1 text-sm outline-none focus:border-black transition bg-transparent" />
                              </div>
                            ))}
                          </div>
                          <div className="flex gap-3 mt-4">
                            <button onClick={() => handleUpdate(c.id)}
                              className="text-sm bg-black text-white px-5 py-1.5 rounded-full hover:bg-gray-800 transition">Guardar</button>
                            <button onClick={() => setEditing(null)} className="text-sm text-gray-400 hover:text-black transition">Cancelar</button>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && search && (
            <p className="text-center text-gray-300 text-sm py-12">Sin resultados para &quot;{search}&quot;</p>
          )}
        </>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-black text-white px-4 py-2 rounded-full text-sm shadow-lg">
          {toast}
        </div>
      )}
    </div>
    </div>
  );
}
