"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import FGLogo from "@/components/FGLogo";

interface ReclamoItem {
  id?: string;
  referencia: string;
  descripcion: string;
  talla: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  motivo: string;
}
interface Foto { id: string; storage_path: string; url: string; }
interface Seguimiento { id: string; nota: string; autor: string; created_at: string; }
interface Contacto { id: string; empresa: string; nombre: string; whatsapp: string; correo: string; }
interface Reclamo {
  id: string;
  nro_reclamo: string;
  empresa: string;
  proveedor: string;
  marca: string;
  nro_factura: string;
  nro_orden_compra: string;
  fecha_reclamo: string;
  estado: string;
  notas: string;
  created_at: string;
  updated_at: string;
  reclamo_items?: ReclamoItem[];
  reclamo_fotos?: Foto[];
  reclamo_seguimiento?: Seguimiento[];
}

const EMPRESAS_MAP: Record<string, { proveedor: string; marca: string }> = {
  "Vistana International": { proveedor: "American Designer Fashion", marca: "Calvin Klein" },
  "Fashion Wear": { proveedor: "American Fashion Wear", marca: "Tommy Hilfiger" },
  "Fashion Shoes": { proveedor: "American Fashion Wear", marca: "Tommy Hilfiger" },
  "Active Shoes": { proveedor: "Latin Fitness Group", marca: "Reebok" },
  "Active Wear": { proveedor: "Latin Fitness Group", marca: "Reebok" },
};
const MOTIVOS = ["Faltante de Mercancía", "Mercancía Dañada", "Mercancía Manchada", "Mercancía Incorrecta", "Sobrante de Mercancía", "Discrepancia de Precio", "Mercancía Defectuosa"];
const ESTADOS = ["Enviado", "En Revisión", "N/C Aprobada", "Aplicada"];
const ESTADO_COLORS: Record<string, string> = {
  "Enviado": "bg-blue-50 text-blue-700",
  "En Revisión": "bg-yellow-50 text-yellow-700",
  "N/C Aprobada": "bg-green-50 text-green-700",
  "Aplicada": "bg-gray-100 text-gray-500",
};

function fmt(n: number) { return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtDate(d: string) { if (!d) return ""; const [y, m, day] = d.split("-"); return `${day}/${m}/${y}`; }
function daysBetween(d: string) { return Math.floor((Date.now() - new Date(d).getTime()) / 86400000); }

type View = "list" | "form" | "detail";

export default function ReclamosPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [role, setRole] = useState("");
  const [view, setView] = useState<View>("list");
  const [reclamos, setReclamos] = useState<Reclamo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<Reclamo | null>(null);

  // List filters
  const [filterEmpresa, setFilterEmpresa] = useState("all");
  const [filterEstado, setFilterEstado] = useState("all");
  const [search, setSearch] = useState("");

  // Form state
  const [fEmpresa, setFEmpresa] = useState("");
  const [fFecha, setFFecha] = useState(new Date().toISOString().slice(0, 10));
  const [fFactura, setFFactura] = useState("");
  const [fOrden, setFOrden] = useState("");
  const [fNotas, setFNotas] = useState("");
  const [fItems, setFItems] = useState<ReclamoItem[]>([{ referencia: "", descripcion: "", talla: "", cantidad: 0, precio_unitario: 0, subtotal: 0, motivo: "" }]);
  const [fPhotos, setFPhotos] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);

  // Detail state
  const [newNote, setNewNote] = useState("");
  const [showContactos, setShowContactos] = useState(false);
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [editContactId, setEditContactId] = useState<string | null>(null);
  const [editContact, setEditContact] = useState<Partial<Contacto>>({});

  useEffect(() => {
    if (typeof window === "undefined") return;
    const r = sessionStorage.getItem("cxc_role");
    if (!r || (r !== "admin" && r !== "upload")) { router.push("/"); }
    else { setRole(r); setAuthChecked(true); }
  }, []);

  const loadReclamos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/reclamos");
      if (res.ok) setReclamos(await res.json());
    } catch { setError("Error al cargar reclamos"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (authChecked) loadReclamos(); }, [authChecked, loadReclamos]);

  if (!authChecked) return null;

  const info = fEmpresa ? EMPRESAS_MAP[fEmpresa] : null;

  async function loadDetail(id: string) {
    const res = await fetch(`/api/reclamos/${id}`);
    if (res.ok) { setCurrent(await res.json()); setView("detail"); }
  }

  async function deleteReclamo(id: string) {
    if (!confirm("¿Eliminar este reclamo y todas sus fotos?")) return;
    await fetch(`/api/reclamos/${id}`, { method: "DELETE" });
    loadReclamos();
    if (current?.id === id) { setCurrent(null); setView("list"); }
  }

  function resetForm() {
    setFEmpresa(""); setFFecha(new Date().toISOString().slice(0, 10));
    setFFactura(""); setFOrden(""); setFNotas("");
    setFItems([{ referencia: "", descripcion: "", talla: "", cantidad: 0, precio_unitario: 0, subtotal: 0, motivo: "" }]);
    setFPhotos([]);
  }

  function updateFItem(idx: number, field: string, value: string | number) {
    setFItems((prev) => prev.map((item, i) => {
      if (i !== idx) return item;
      const updated = { ...item, [field]: value };
      updated.subtotal = (updated.cantidad || 0) * (updated.precio_unitario || 0);
      return updated;
    }));
  }

  const fSubtotal = fItems.reduce((s, i) => s + i.subtotal, 0);
  const fImportacion = fSubtotal * 0.10;
  const fItbms = fSubtotal * 0.07;
  const fTotal = fSubtotal + fImportacion + fItbms;

  async function saveReclamo() {
    if (!fEmpresa || !fFecha || !fFactura) { setError("Completa empresa, fecha y factura."); return; }
    const validItems = fItems.filter((i) => i.referencia || i.cantidad > 0);
    if (validItems.length === 0) { setError("Agrega al menos un ítem con referencia o cantidad."); return; }

    setSaving(true); setError(null);
    const res = await fetch("/api/reclamos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        empresa: fEmpresa, proveedor: info?.proveedor || "", marca: info?.marca || "",
        nro_factura: fFactura, nro_orden_compra: fOrden, fecha_reclamo: fFecha,
        notas: fNotas, items: validItems,
      }),
    });

    if (res.ok) {
      const reclamo = await res.json();
      const warning = reclamo.items_warning;
      // Upload photos (best effort)
      for (const photo of fPhotos) {
        try {
          const fd = new FormData(); fd.append("file", photo);
          await fetch(`/api/reclamos/${reclamo.id}/fotos`, { method: "POST", body: fd });
        } catch { /* photo upload is optional */ }
      }
      resetForm(); loadReclamos(); await loadDetail(reclamo.id);
      if (warning) {
        setError("Reclamo guardado, pero los ítems no se pudieron guardar: " + warning);
        alert("Advertencia: Los ítems no se guardaron. " + warning);
      }
    } else {
      const errData = await res.json().catch(() => null);
      setError(errData?.error || "Error al guardar.");
    }
    setSaving(false);
  }

  async function changeEstado(estado: string) {
    if (!current) return;
    if (!confirm(`¿Cambiar estado a "${estado}"?`)) return;
    await fetch(`/api/reclamos/${current.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado }),
    });
    await loadDetail(current.id); loadReclamos();
  }

  async function addNote() {
    if (!current || !newNote.trim()) return;
    await fetch(`/api/reclamos/${current.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seguimiento_nota: newNote, autor: role }),
    });
    setNewNote(""); await loadDetail(current.id);
  }

  async function loadContactos() {
    const res = await fetch("/api/reclamos/contactos");
    if (res.ok) setContactos(await res.json());
    setShowContactos(true);
  }

  async function saveContact() {
    if (!editContact.id) {
      await fetch("/api/reclamos/contactos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editContact) });
    } else {
      await fetch("/api/reclamos/contactos", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editContact) });
    }
    setEditContactId(null); setEditContact({});
    const res = await fetch("/api/reclamos/contactos"); if (res.ok) setContactos(await res.json());
  }

  // Filtered list
  const filtered = reclamos.filter((r) => {
    if (filterEmpresa !== "all" && r.empresa !== filterEmpresa) return false;
    if (filterEstado !== "all" && r.estado !== filterEstado) return false;
    if (search) { const q = search.toLowerCase(); if (!r.nro_reclamo.toLowerCase().includes(q) && !r.nro_factura.toLowerCase().includes(q)) return false; }
    return true;
  });

  // KPIs
  const pendientes = reclamos.filter((r) => r.estado !== "Aplicada");
  const totalPendiente = pendientes.reduce((s, r) => {
    const sub = (r.reclamo_items || []).reduce((ss, i) => ss + (i.subtotal || 0), 0);
    return s + sub * 1.17;
  }, 0);
  const alertas = pendientes.filter((r) => daysBetween(r.fecha_reclamo) > 45).length;

  // ── LIST VIEW ──
  if (view === "list") {
    return (
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="flex items-end justify-between mb-8">
          <div>
            <FGLogo variant="horizontal" theme="light" size={32} />
            <p className="text-sm text-gray-400 mt-2">Reclamos a Proveedores</p>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => { resetForm(); setView("form"); }} className="text-sm bg-black text-white px-6 py-2.5 rounded-full font-medium hover:bg-gray-800 transition">Nuevo Reclamo</button>
            <button onClick={() => window.open(`/api/reclamos/export?empresa=${filterEmpresa !== "all" ? filterEmpresa : ""}&estado=${filterEstado !== "all" ? filterEstado : ""}`)} className="text-sm text-gray-400 hover:text-black transition">Exportar CSV</button>
            <button onClick={loadContactos} className="text-sm text-gray-400 hover:text-black transition">Contactos</button>
            <button onClick={() => router.push("/plantillas")} className="text-sm text-gray-400 hover:text-black transition">Plantillas</button>
          </div>
        </div>

        {/* KPIs */}
        {role === "admin" && (
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="border border-gray-100 rounded-xl p-4">
              <div className="text-xs text-gray-400 uppercase tracking-widest">Total Pendiente</div>
              <div className="text-xl font-semibold mt-1 tabular-nums">${fmt(totalPendiente)}</div>
            </div>
            <div className="border border-gray-100 rounded-xl p-4">
              <div className="text-xs text-gray-400 uppercase tracking-widest">Reclamos Abiertos</div>
              <div className="text-xl font-semibold mt-1">{pendientes.length}</div>
            </div>
            <div className={`border rounded-xl p-4 ${alertas > 0 ? "border-red-200 bg-red-50" : "border-gray-100"}`}>
              <div className="text-xs text-gray-400 uppercase tracking-widest">Alertas (+45 días)</div>
              <div className={`text-xl font-semibold mt-1 ${alertas > 0 ? "text-red-600" : ""}`}>{alertas}</div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-3 mb-6 flex-wrap">
          <select value={filterEmpresa} onChange={(e) => setFilterEmpresa(e.target.value)} className="border-b border-gray-200 py-2 text-sm outline-none bg-transparent">
            <option value="all">Todas las empresas</option>
            {Object.keys(EMPRESAS_MAP).map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
          <select value={filterEstado} onChange={(e) => setFilterEstado(e.target.value)} className="border-b border-gray-200 py-2 text-sm outline-none bg-transparent">
            <option value="all">Todos los estados</option>
            {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar N° reclamo o factura..." className="border-b border-gray-200 py-2 text-sm outline-none flex-1 max-w-xs" />
        </div>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        {loading ? (
          <div>{[...Array(5)].map((_, i) => <div key={i} className="animate-pulse flex gap-4 py-3 border-b border-gray-100"><div className="h-3 bg-gray-100 rounded w-1/4" /><div className="h-3 bg-gray-100 rounded w-1/6 ml-auto" /><div className="h-3 bg-gray-100 rounded w-1/6" /></div>)}</div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-gray-300 text-sm py-20">No hay reclamos registrados</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-widest text-gray-400">
                <th className="text-left pb-3 font-medium">N° Reclamo</th>
                <th className="text-left pb-3 font-medium">Empresa</th>
                <th className="text-left pb-3 font-medium">Factura</th>
                <th className="text-left pb-3 font-medium">Fecha</th>
                <th className="text-right pb-3 font-medium">Días</th>
                <th className="text-left pb-3 font-medium">Estado</th>
                <th className="text-right pb-3 font-medium">Total</th>
                <th className="text-right pb-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const days = daysBetween(r.fecha_reclamo);
                const sub = (r.reclamo_items || []).reduce((s, i) => s + (i.subtotal || 0), 0);
                return (
                  <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition">
                    <td className="py-3 font-medium">{r.nro_reclamo}</td>
                    <td className="py-3 text-gray-500">{r.empresa}</td>
                    <td className="py-3 text-gray-500">{r.nro_factura}</td>
                    <td className="py-3 text-gray-500">{fmtDate(r.fecha_reclamo)}</td>
                    <td className={`py-3 text-right tabular-nums ${days > 60 && r.estado !== "Aplicada" ? "text-red-600 font-medium" : "text-gray-400"}`}>{days}</td>
                    <td className="py-3"><span className={`text-[11px] px-2 py-0.5 rounded-full ${ESTADO_COLORS[r.estado] || "bg-gray-100 text-gray-500"}`}>{r.estado}</span></td>
                    <td className="py-3 text-right tabular-nums">${fmt(sub * 1.17)}</td>
                    <td className="py-3 text-right">
                      <button onClick={() => loadDetail(r.id)} className="text-sm text-gray-400 hover:text-black transition mr-3">Ver</button>
                      {role === "admin" && <button onClick={() => deleteReclamo(r.id)} className="text-sm text-gray-300 hover:text-black transition">Eliminar</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Contactos panel */}
        {showContactos && (
          <div className="fixed inset-0 bg-black/20 z-50 flex justify-end" onClick={() => setShowContactos(false)}>
            <div className="bg-white w-full max-w-md h-full overflow-y-auto p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold">Contactos Proveedores</h2>
                <button onClick={() => setShowContactos(false)} className="text-gray-400 hover:text-black">×</button>
              </div>
              {contactos.map((c) => (
                <div key={c.id} className="border-b border-gray-100 py-3">
                  {editContactId === c.id ? (
                    <div className="space-y-2">
                      {(["empresa", "nombre", "whatsapp", "correo"] as const).map((f) => (
                        <input key={f} type="text" placeholder={f} value={(editContact as Record<string, string>)[f] || ""} onChange={(e) => setEditContact({ ...editContact, [f]: e.target.value })}
                          className="w-full border-b border-gray-200 py-1 text-sm outline-none" />
                      ))}
                      <div className="flex gap-2 mt-2">
                        <button onClick={saveContact} className="text-xs bg-black text-white px-3 py-1 rounded-full">Guardar</button>
                        <button onClick={() => setEditContactId(null)} className="text-xs text-gray-400">Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="font-medium text-sm">{c.empresa}</div>
                      <div className="text-xs text-gray-500">{c.nombre} | {c.whatsapp} | {c.correo}</div>
                      <button onClick={() => { setEditContactId(c.id); setEditContact(c); }} className="text-xs text-gray-400 hover:text-black mt-1">Editar</button>
                    </div>
                  )}
                </div>
              ))}
              <button onClick={() => { setEditContactId("new"); setEditContact({ empresa: "", nombre: "", whatsapp: "", correo: "" }); }}
                className="text-sm text-gray-400 hover:text-black mt-4">+ Nuevo contacto</button>
              {editContactId === "new" && (
                <div className="mt-3 space-y-2">
                  {(["empresa", "nombre", "whatsapp", "correo"] as const).map((f) => (
                    <input key={f} type="text" placeholder={f} value={(editContact as Record<string, string>)[f] || ""} onChange={(e) => setEditContact({ ...editContact, [f]: e.target.value })}
                      className="w-full border-b border-gray-200 py-1 text-sm outline-none" />
                  ))}
                  <button onClick={saveContact} className="text-xs bg-black text-white px-3 py-1 rounded-full mt-2">Guardar</button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── FORM VIEW ──
  if (view === "form") {
    return (
      <div className="max-w-5xl mx-auto px-6 py-12">
        <button onClick={() => setView("list")} className="text-sm text-gray-400 hover:text-black transition mb-8 block">← Reclamos</button>
        <h1 className="text-2xl font-semibold tracking-tight mb-10">Nuevo Reclamo</h1>

        <div className="mb-10">
          <div className="text-xs uppercase tracking-widest text-gray-400 mb-4">Información General</div>
          <div className="grid grid-cols-2 gap-x-12 gap-y-6">
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-widest block mb-2">Empresa *</label>
              <select value={fEmpresa} onChange={(e) => setFEmpresa(e.target.value)} className="w-full border-b border-gray-200 py-2 text-sm outline-none bg-transparent">
                <option value="">Seleccionar...</option>
                {Object.keys(EMPRESAS_MAP).map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
              {info && <p className="text-xs text-gray-400 mt-2">Proveedor: {info.proveedor} | Marca: {info.marca}</p>}
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-widest block mb-2">Fecha *</label>
              <input type="date" value={fFecha} onChange={(e) => setFFecha(e.target.value)} className="w-full border-b border-gray-200 py-2 text-sm outline-none" />
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-widest block mb-2">N° Factura *</label>
              <input type="text" value={fFactura} onChange={(e) => setFFactura(e.target.value)} className="w-full border-b border-gray-200 py-2 text-sm outline-none" />
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-widest block mb-2">N° Orden de Compra</label>
              <input type="text" value={fOrden} onChange={(e) => setFOrden(e.target.value)} className="w-full border-b border-gray-200 py-2 text-sm outline-none" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-400 uppercase tracking-widest block mb-2">Notas</label>
              <textarea value={fNotas} onChange={(e) => setFNotas(e.target.value)} rows={2} className="w-full border-b border-gray-200 py-2 text-sm outline-none resize-none" />
            </div>
          </div>
        </div>

        <div className="mb-10">
          <div className="text-xs uppercase tracking-widest text-gray-400 mb-4">Ítems del Reclamo</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-widest text-gray-400">
                <th className="pb-3 font-medium text-left">Referencia</th>
                <th className="pb-3 font-medium text-left">Descripción</th>
                <th className="pb-3 font-medium text-left w-20">Talla</th>
                <th className="pb-3 font-medium w-20 text-center">Cant.</th>
                <th className="pb-3 font-medium w-24 text-right">Precio U.</th>
                <th className="pb-3 font-medium text-left">Motivo</th>
                <th className="pb-3 font-medium w-24 text-right">Subtotal</th>
                <th className="pb-3 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {fItems.map((item, idx) => (
                <tr key={idx} className="border-b border-gray-100">
                  <td className="py-2 pr-2"><input type="text" value={item.referencia} onChange={(e) => updateFItem(idx, "referencia", e.target.value)} className="w-full border-b border-gray-100 py-1 text-sm outline-none" /></td>
                  <td className="py-2 pr-2"><input type="text" value={item.descripcion} onChange={(e) => updateFItem(idx, "descripcion", e.target.value)} className="w-full border-b border-gray-100 py-1 text-sm outline-none" /></td>
                  <td className="py-2 pr-2"><input type="text" value={item.talla} onChange={(e) => updateFItem(idx, "talla", e.target.value)} className="w-full border-b border-gray-100 py-1 text-sm outline-none" /></td>
                  <td className="py-2 pr-2"><input type="number" min={0} value={item.cantidad} onChange={(e) => updateFItem(idx, "cantidad", parseInt(e.target.value) || 0)} className="w-full border-b border-gray-100 py-1 text-sm outline-none text-center" /></td>
                  <td className="py-2 pr-2"><input type="number" step="0.01" min={0} value={item.precio_unitario} onChange={(e) => updateFItem(idx, "precio_unitario", parseFloat(e.target.value) || 0)} className="w-full border-b border-gray-100 py-1 text-sm outline-none text-right" /></td>
                  <td className="py-2 pr-2">
                    <select value={item.motivo} onChange={(e) => updateFItem(idx, "motivo", e.target.value)} className="w-full border-b border-gray-100 py-1 text-sm outline-none bg-transparent">
                      <option value="">—</option>
                      {MOTIVOS.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </td>
                  <td className="py-2 text-right tabular-nums text-gray-500">${fmt(item.subtotal)}</td>
                  <td className="py-2 text-center">{fItems.length > 1 && <button onClick={() => setFItems(fItems.filter((_, i) => i !== idx))} className="text-gray-300 hover:text-black">×</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={() => setFItems([...fItems, { referencia: "", descripcion: "", talla: "", cantidad: 0, precio_unitario: 0, subtotal: 0, motivo: "" }])} className="text-sm text-gray-400 hover:text-black transition mt-3">+ Agregar ítem</button>

          <div className="mt-6 text-right text-sm space-y-1">
            <div>Subtotal: <span className="tabular-nums font-medium">${fmt(fSubtotal)}</span></div>
            <div className="text-gray-400">Importación (10%): ${fmt(fImportacion)}</div>
            <div className="text-gray-400">ITBMS (7%): ${fmt(fItbms)}</div>
            <div className="text-lg font-semibold">Total: ${fmt(fTotal)}</div>
          </div>
        </div>

        <div className="mb-10">
          <div className="text-xs uppercase tracking-widest text-gray-400 mb-4">Fotos (opcional, máx 3)</div>
          <input ref={photoRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => {
            const files = Array.from(e.target.files || []).slice(0, 3 - fPhotos.length);
            setFPhotos([...fPhotos, ...files].slice(0, 3));
          }} />
          <button onClick={() => photoRef.current?.click()} disabled={fPhotos.length >= 3} className="text-sm text-gray-400 hover:text-black transition disabled:opacity-40">+ Seleccionar fotos</button>
          {fPhotos.length > 0 && (
            <div className="flex gap-2 mt-2">
              {fPhotos.map((f, i) => (
                <div key={i} className="text-xs bg-gray-50 px-2 py-1 rounded flex items-center gap-1">
                  {f.name.slice(0, 20)}
                  <button onClick={() => setFPhotos(fPhotos.filter((_, j) => j !== i))} className="text-gray-300 hover:text-black">×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
        <div className="flex items-center gap-6">
          <button onClick={saveReclamo} disabled={saving} className="bg-black text-white px-6 py-2.5 rounded-full text-sm font-medium hover:bg-gray-800 transition disabled:opacity-40">
            {saving ? "Guardando..." : "Guardar Reclamo"}
          </button>
          <button onClick={() => setView("list")} className="text-sm text-gray-400 hover:text-black transition">Cancelar</button>
        </div>
      </div>
    );
  }

  // ── DETAIL VIEW ──
  if (view === "detail" && current) {
    const items = current.reclamo_items || [];
    const fotos = current.reclamo_fotos || [];
    const seguimiento = current.reclamo_seguimiento || [];
    const sub = items.reduce((s, i) => s + (i.subtotal || 0), 0);
    const days = daysBetween(current.fecha_reclamo);
    const contacto = contactos.length > 0 ? contactos.find((c) => c.empresa === current.empresa) : null;

    return (
      <div className="max-w-5xl mx-auto px-6 py-12">
        <button onClick={() => setView("list")} className="text-sm text-gray-400 hover:text-black transition mb-8 block">← Reclamos</button>

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{current.nro_reclamo}</h1>
            <p className="text-sm text-gray-400 mt-1">{current.empresa} — {current.marca} — {current.proveedor}</p>
            <p className="text-sm text-gray-400">Factura: {current.nro_factura} {current.nro_orden_compra && `| PO: ${current.nro_orden_compra}`}</p>
            <p className="text-sm text-gray-400">{fmtDate(current.fecha_reclamo)} — {days} días</p>
          </div>
          <span className={`text-xs px-3 py-1 rounded-full ${ESTADO_COLORS[current.estado] || "bg-gray-100 text-gray-500"}`}>{current.estado}</span>
        </div>

        {/* Pipeline */}
        <div className="flex gap-1 mb-8">
          {ESTADOS.map((e, i) => {
            const isActive = ESTADOS.indexOf(current.estado) >= i;
            return (
              <button key={e} onClick={() => changeEstado(e)}
                className={`flex-1 py-2 text-xs text-center rounded transition ${isActive ? "bg-black text-white" : "bg-gray-100 text-gray-400 hover:bg-gray-200"}`}>
                {e}
              </button>
            );
          })}
        </div>

        {/* Totals */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="border border-gray-100 rounded-xl p-3 text-center">
            <div className="text-[10px] text-gray-400 uppercase">Subtotal</div>
            <div className="text-sm font-semibold tabular-nums mt-1">${fmt(sub)}</div>
          </div>
          <div className="border border-gray-100 rounded-xl p-3 text-center">
            <div className="text-[10px] text-gray-400 uppercase">Import. 10%</div>
            <div className="text-sm font-semibold tabular-nums mt-1">${fmt(sub * 0.10)}</div>
          </div>
          <div className="border border-gray-100 rounded-xl p-3 text-center">
            <div className="text-[10px] text-gray-400 uppercase">ITBMS 7%</div>
            <div className="text-sm font-semibold tabular-nums mt-1">${fmt(sub * 0.07)}</div>
          </div>
          <div className="border border-gray-100 rounded-xl p-3 text-center">
            <div className="text-[10px] text-gray-400 uppercase">Total</div>
            <div className="text-base font-bold tabular-nums mt-1">${fmt(sub * 1.17)}</div>
          </div>
        </div>

        {/* Items */}
        <div className="mb-8">
          <div className="text-xs uppercase tracking-widest text-gray-400 mb-3">Ítems</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-widest text-gray-400">
                <th className="text-left pb-2 font-medium">Ref.</th>
                <th className="text-left pb-2 font-medium">Descripción</th>
                <th className="text-left pb-2 font-medium">Talla</th>
                <th className="text-right pb-2 font-medium">Cant.</th>
                <th className="text-right pb-2 font-medium">Precio</th>
                <th className="text-right pb-2 font-medium">Subtotal</th>
                <th className="text-left pb-2 font-medium">Motivo</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-2">{item.referencia}</td>
                  <td className="py-2 text-gray-500">{item.descripcion}</td>
                  <td className="py-2 text-gray-500">{item.talla}</td>
                  <td className="py-2 text-right tabular-nums">{item.cantidad}</td>
                  <td className="py-2 text-right tabular-nums">${fmt(item.precio_unitario)}</td>
                  <td className="py-2 text-right tabular-nums font-medium">${fmt(item.subtotal)}</td>
                  <td className="py-2 text-gray-500 text-xs">{item.motivo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Photos */}
        {fotos.length > 0 && (
          <div className="mb-8">
            <div className="text-xs uppercase tracking-widest text-gray-400 mb-3">Fotos</div>
            <div className="flex gap-3">
              {fotos.map((f) => (
                <div key={f.id} className="relative">
                  <img src={f.url} alt="" className="w-20 h-20 object-cover rounded-lg border border-gray-100" />
                  {role === "admin" && (
                    <button onClick={async () => {
                      await fetch(`/api/reclamos/${current.id}/fotos`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ foto_id: f.id, storage_path: f.storage_path }) });
                      await loadDetail(current.id);
                    }} className="absolute -top-1 -right-1 w-5 h-5 bg-white border border-gray-200 rounded-full text-xs text-gray-400 hover:text-black flex items-center justify-center">×</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Seguimiento */}
        <div className="mb-8">
          <div className="text-xs uppercase tracking-widest text-gray-400 mb-3">Seguimiento</div>
          <div className="flex gap-2 mb-3">
            <input type="text" value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="Agregar nota..." className="flex-1 border-b border-gray-200 py-1.5 text-sm outline-none" />
            <button onClick={addNote} disabled={!newNote.trim()} className="text-sm bg-black text-white px-4 py-1.5 rounded-full hover:bg-gray-800 transition disabled:opacity-40">Agregar</button>
          </div>
          {seguimiento.map((s) => (
            <div key={s.id} className="border-b border-gray-50 py-2">
              <p className="text-sm">{s.nota}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{new Date(s.created_at).toLocaleString("es-PA")} — {s.autor}</p>
            </div>
          ))}
        </div>

        {/* Actions */}
        {current.notas && <p className="text-sm text-gray-400 mb-6">Notas: {current.notas}</p>}
        <div className="flex gap-3 flex-wrap">
          {contacto?.whatsapp && (
            <button onClick={() => {
              const msg = encodeURIComponent(`Hola ${contacto.nombre}, le escribo de parte de Fashion Group.\nReclamo ${current.nro_reclamo} — ${current.empresa}\nFactura: ${current.nro_factura}${current.nro_orden_compra ? ` | PO: ${current.nro_orden_compra}` : ""}\nTotal: $${fmt(sub * 1.17)}\nEstado actual: ${current.estado}\nPor favor confirmar el estado de este reclamo. Gracias.`);
              window.open(`https://wa.me/${contacto.whatsapp}?text=${msg}`, "_blank");
            }} className="text-sm border border-green-600 text-green-700 px-4 py-2 rounded-full hover:bg-green-50 transition">WhatsApp</button>
          )}
          {contacto?.correo && (
            <button onClick={() => {
              const subject = encodeURIComponent(`Reclamo ${current.nro_reclamo} — ${current.empresa} — Factura ${current.nro_factura}`);
              const body = encodeURIComponent(`Estimados,\n\nLe escribimos de Fashion Group referente al reclamo ${current.nro_reclamo}.\n\nEmpresa: ${current.empresa}\nProveedor: ${current.proveedor}\nMarca: ${current.marca}\nFactura: ${current.nro_factura}\nOrden de Compra: ${current.nro_orden_compra || "N/A"}\nFecha: ${fmtDate(current.fecha_reclamo)}\nEstado: ${current.estado}\nTotal: $${fmt(sub * 1.17)}\n\nQuedamos a la espera de su respuesta.\n\nAtentamente,\nFashion Group`);
              window.open(`mailto:${contacto.correo}?subject=${subject}&body=${body}`, "_blank");
            }} className="text-sm border border-gray-300 text-gray-600 px-4 py-2 rounded-full hover:bg-gray-50 transition">Correo</button>
          )}
          {role === "admin" && (
            <button onClick={() => deleteReclamo(current.id)} className="text-sm text-gray-300 hover:text-red-500 transition ml-auto">Eliminar reclamo</button>
          )}
        </div>
      </div>
    );
  }

  return null;
}
