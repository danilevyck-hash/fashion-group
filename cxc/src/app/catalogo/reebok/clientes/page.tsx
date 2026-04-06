"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Toast, EmptyState } from "@/components/ui";

interface Cliente { id: string; nombre: string; empresa: string; correo: string; whatsapp: string; }

export default function ClientesPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fNombre, setFNombre] = useState("");
  const [fEmpresa, setFEmpresa] = useState("");
  const [fCorreo, setFCorreo] = useState("");
  const [fWhatsapp, setFWhatsapp] = useState("");
  const [saving, setSaving] = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  useEffect(() => {
    const r = sessionStorage.getItem("cxc_role") || "";
    if (r !== "admin" && r !== "vendedor") { router.push("/catalogo/reebok"); return; }
    setAuthChecked(true);
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/directorio");
      if (res.ok) setClientes(await res.json());
    } catch { /* */ }
    setLoading(false);
  }, []);

  useEffect(() => { if (authChecked) load(); }, [authChecked, load]);

  if (!authChecked) return null;

  const filtered = clientes.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return c.nombre?.toLowerCase().includes(q) || c.empresa?.toLowerCase().includes(q);
  });

  function openNew() {
    setEditingId(null); setFNombre(""); setFEmpresa(""); setFCorreo(""); setFWhatsapp("");
    setShowModal(true);
  }

  function openEdit(c: Cliente) {
    setEditingId(c.id); setFNombre(c.nombre); setFEmpresa(c.empresa || ""); setFCorreo(c.correo || ""); setFWhatsapp(c.whatsapp || "");
    setShowModal(true);
  }

  async function save() {
    if (!fNombre.trim()) { showToast("Nombre requerido"); return; }
    setSaving(true);
    const body = { nombre: fNombre.trim(), empresa: fEmpresa, correo: fCorreo, whatsapp: fWhatsapp, telefono: "", celular: "", contacto: "", notas: "" };
    try {
      const url = editingId ? `/api/directorio/${editingId}` : "/api/directorio";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) { showToast(editingId ? "Cliente actualizado" : "Cliente creado"); setShowModal(false); load(); }
      else showToast("Error al guardar");
    } catch { showToast("Sin conexión. Verifica tu internet e intenta de nuevo."); }
    setSaving(false);
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">Clientes</h1>
          <p className="text-sm text-gray-400">{clientes.length} contactos</p>
        </div>
        <button onClick={openNew} className="bg-reebok-red text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition">
          + Nuevo Cliente
        </button>
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre o empresa..."
        className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-gray-300 mb-4" />

      {loading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState title={search ? "No encontramos clientes" : "No hay clientes registrados"} subtitle={search ? `Intenta con otro termino en vez de "${search}"` : "Los clientes aparecerán aquí al crear pedidos"} />
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white z-10">
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 text-[11px] uppercase text-gray-400 font-normal">Nombre</th>
                <th className="text-left px-4 py-3 text-[11px] uppercase text-gray-400 font-normal">Empresa</th>
                <th className="text-left px-4 py-3 text-[11px] uppercase text-gray-400 font-normal">Correo</th>
                <th className="text-left px-4 py-3 text-[11px] uppercase text-gray-400 font-normal">WhatsApp</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium">{c.nombre}</td>
                  <td className="px-4 py-3 text-gray-500">{c.empresa || "—"}</td>
                  <td className="px-4 py-3 text-gray-500">{c.correo || "—"}</td>
                  <td className="px-4 py-3">
                    {c.whatsapp ? (
                      <a href={`https://wa.me/${c.whatsapp.replace(/[^0-9]/g, "")}`} target="_blank" rel="noopener noreferrer"
                        className="text-emerald-600 hover:underline text-xs">{c.whatsapp}</a>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => openEdit(c)} className="text-xs text-gray-400 hover:text-black transition">Editar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="font-medium mb-4">{editingId ? "Editar Cliente" : "Nuevo Cliente"}</h2>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-gray-400 uppercase block mb-1">Nombre *</label>
                <input value={fNombre} onChange={e => setFNombre(e.target.value)} className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition" />
              </div>
              <div>
                <label className="text-[11px] text-gray-400 uppercase block mb-1">Empresa</label>
                <input value={fEmpresa} onChange={e => setFEmpresa(e.target.value)} className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition" />
              </div>
              <div>
                <label className="text-[11px] text-gray-400 uppercase block mb-1">Correo</label>
                <input type="email" value={fCorreo} onChange={e => setFCorreo(e.target.value)} className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition" />
              </div>
              <div>
                <label className="text-[11px] text-gray-400 uppercase block mb-1">WhatsApp</label>
                <input value={fWhatsapp} onChange={e => setFWhatsapp(e.target.value)} placeholder="+507 6000-0000" className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition" />
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2 border border-gray-200 rounded-full text-sm hover:border-gray-400 transition">Cancelar</button>
              <button onClick={save} disabled={saving} className="flex-1 py-2 bg-reebok-red text-white rounded-full text-sm hover:bg-red-700 transition disabled:opacity-50">
                {saving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast message={toast} />
    </div>
  );
}
