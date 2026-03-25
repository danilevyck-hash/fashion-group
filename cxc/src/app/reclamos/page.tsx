"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import FGLogo from "@/components/FGLogo";
import AppHeader from "@/components/AppHeader";

// ── Types ──
interface RItem { referencia: string; descripcion: string; talla: string; cantidad: number; precio_unitario: number; subtotal: number; motivo: string; nro_factura: string; nro_orden_compra: string; }
interface Seguimiento { id: string; nota: string; autor: string; created_at: string; }
interface Foto { id: string; storage_path: string; url: string; }
interface Contacto { id: string; empresa: string; nombre: string; whatsapp: string; correo: string; }
interface Reclamo {
  id: string; nro_reclamo: string; empresa: string; proveedor: string; marca: string;
  nro_factura: string; nro_orden_compra: string; fecha_reclamo: string; estado: string;
  notas: string; created_at: string; reclamo_items?: RItem[]; reclamo_seguimiento?: Seguimiento[];
  reclamo_fotos?: Foto[];
}

// ── Constants ──
const EMPRESAS_MAP: Record<string, { proveedor: string; marca: string }> = {
  "Vistana International": { proveedor: "American Designer Fashion", marca: "Calvin Klein" },
  "Fashion Wear": { proveedor: "American Fashion Wear", marca: "Tommy Hilfiger" },
  "Fashion Shoes": { proveedor: "American Fashion Wear", marca: "Tommy Hilfiger" },
  "Active Shoes": { proveedor: "Latin Fitness Group", marca: "Reebok" },
  "Active Wear": { proveedor: "Latin Fitness Group", marca: "Reebok" },
};
const EMPRESAS = Object.keys(EMPRESAS_MAP);
const MOTIVOS = ["Faltante de Mercancía", "Mercancía Dañada", "Mercancía Manchada", "Mercancía Incorrecta", "Sobrante de Mercancía", "Discrepancia de Precio", "Mercancía Defectuosa"];
const TALLAS = ["XS", "S", "M", "L", "XL", "XXL", "OS", "Otros"];
const ESTADOS = ["Enviado", "En Revisión", "N/C Aprobada", "Aplicada"];
const EC: Record<string, string> = { "Enviado": "bg-blue-50 text-blue-700", "En Revisión": "bg-yellow-50 text-yellow-700", "N/C Aprobada": "bg-green-50 text-green-700", "Aplicada": "bg-gray-100 text-gray-500" };

function emptyItem(): RItem { return { referencia: "", descripcion: "", talla: "", cantidad: 1, precio_unitario: 0, subtotal: 0, motivo: "", nro_factura: "", nro_orden_compra: "" }; }
function fmt(n: number | undefined | null) { return (n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtDate(d: string) { if (!d) return ""; const [y, m, day] = d.split("-"); return `${day}/${m}/${y}`; }
function daysSince(d: string) { if (!d) return 0; return Math.floor((Date.now() - new Date(d).getTime()) / 86400000); }
function calcSub(items: RItem[]) { return items.reduce((s, i) => s + (Number(i.cantidad) || 0) * (Number(i.precio_unitario) || 0), 0); }

const SUPA_URL = typeof window !== "undefined" ? (process.env.NEXT_PUBLIC_SUPABASE_URL || "") : "";

// ── Component ──
export default function ReclamosPage() {
  const router = useRouter();

  // ALL hooks first
  const [authChecked, setAuthChecked] = useState(false);
  const [role, setRole] = useState("");
  const [view, setView] = useState<"list" | "form" | "detail">("list");
  const [reclamos, setReclamos] = useState<Reclamo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<Reclamo | null>(null);
  const [saving, setSaving] = useState(false);

  // List: empresa view
  const [activeEmpresa, setActiveEmpresa] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showEmailPanel, setShowEmailPanel] = useState(false);
  const [search, setSearch] = useState("");
  const [filterEstado, setFilterEstado] = useState("all");

  // Form
  const [fEmpresa, setFEmpresa] = useState("");
  const [fFecha, setFFecha] = useState(new Date().toISOString().slice(0, 10));
  const [fNotas, setFNotas] = useState("");
  const [fItems, setFItems] = useState<RItem[]>([emptyItem()]);
  const [savedReclamoId, setSavedReclamoId] = useState<string | null>(null);
  const [savedNroReclamo, setSavedNroReclamo] = useState("");
  const [formFotos, setFormFotos] = useState<Foto[]>([]);
  const [uploadingFormFoto, setUploadingFormFoto] = useState(false);
  const formFotoRef = useRef<HTMLInputElement>(null);

  // Detail
  const [nota, setNota] = useState("");
  const [sending, setSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const fotoRef = useRef<HTMLInputElement>(null);

  // Contactos
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [showContactos, setShowContactos] = useState(false);
  const [editContactId, setEditContactId] = useState<string | null>(null);
  const [editContact, setEditContact] = useState<Partial<Contacto>>({});

  // List email panel
  const [listEmailPara, setListEmailPara] = useState("");
  const [listEmailAsunto, setListEmailAsunto] = useState("");
  const [listEmailCuerpo, setListEmailCuerpo] = useState("");
  const [listCopied, setListCopied] = useState(false);

  // Auth
  useEffect(() => {
    const r = sessionStorage.getItem("cxc_role") || "";
    if (!r) { router.push("/"); return; }
    setRole(r); setAuthChecked(true);
  }, [router]);

  const loadReclamos = useCallback(async () => {
    setLoading(true);
    try { const res = await fetch("/api/reclamos"); if (res.ok) { const d = await res.json(); setReclamos(Array.isArray(d) ? d : []); } }
    catch { /* */ } setLoading(false);
  }, []);

  const loadContactos = useCallback(async () => {
    try { const res = await fetch("/api/reclamos/contactos"); if (res.ok) setContactos(await res.json()); } catch { /* */ }
  }, []);

  useEffect(() => { if (authChecked) { loadReclamos(); loadContactos(); } }, [authChecked, loadReclamos, loadContactos]);

  if (!authChecked) return null;

  // ── Helpers ──
  const empInfo = fEmpresa ? EMPRESAS_MAP[fEmpresa] : null;
  const fSubtotal = fItems.reduce((s, i) => s + (i.subtotal || 0), 0);
  const pendientes = reclamos.filter((r) => r.estado !== "Aplicada");
  const totalPendiente = pendientes.reduce((s, r) => s + calcSub(r.reclamo_items ?? []) * 1.177, 0);
  const alertas = pendientes.filter((r) => daysSince(r.fecha_reclamo) > 45).length;

  function getC(empresa: string) { return contactos.find((c) => c.empresa === empresa) || null; }

  function resetForm() { setFEmpresa(""); setFFecha(new Date().toISOString().slice(0, 10)); setFNotas(""); setFItems([emptyItem()]); setError(null); setSavedReclamoId(null); setSavedNroReclamo(""); setFormFotos([]); }

  function updateItem(idx: number, field: string, val: string | number) {
    setFItems((prev) => prev.map((item, i) => { if (i !== idx) return item; const u = { ...item, [field]: val }; u.subtotal = (u.cantidad || 0) * (u.precio_unitario || 0); return u; }));
  }

  async function loadDetail(id: string) {
    try { const res = await fetch(`/api/reclamos/${id}`); if (res.ok) { const d = await res.json(); if (d?.id) { setCurrent(d); setView("detail"); } } } catch { /* */ }
  }

  async function saveReclamo() {
    if (!fEmpresa || !fFecha) { setError("Completa empresa y fecha."); return; }
    const items = fItems.filter((i) => i.referencia || i.cantidad > 0);
    if (!items.length) { setError("Agrega al menos un ítem."); return; }
    const mainFactura = items.find((i) => i.nro_factura)?.nro_factura || "—";
    setSaving(true); setError(null);
    try {
      const res = await fetch("/api/reclamos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ empresa: fEmpresa, proveedor: empInfo?.proveedor || "", marca: empInfo?.marca || "", nro_factura: mainFactura, nro_orden_compra: "", fecha_reclamo: fFecha, notas: fNotas, items }) });
      if (res.ok) { const saved = await res.json(); if (saved.id) { setSavedReclamoId(saved.id); setSavedNroReclamo(saved.nro_reclamo || ""); setFormFotos([]); loadReclamos(); } }
      else { const err = await res.json().catch(() => null); setError(err?.error || "Error al guardar."); }
    } catch { setError("Error de conexión."); } setSaving(false);
  }

  async function addNota() { if (!current || !nota.trim()) return; await fetch(`/api/reclamos/${current.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seguimiento_nota: nota, autor: role }) }); setNota(""); await loadDetail(current.id); }
  async function changeEstado(e: string) { if (!current || current.estado === e) return; if (!confirm(`¿Cambiar estado a "${e}"?`)) return; await fetch(`/api/reclamos/${current.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ estado: e }) }); await loadDetail(current.id); loadReclamos(); }
  async function deleteReclamo(id: string) { if (!confirm("¿Eliminar este reclamo?")) return; await fetch(`/api/reclamos/${id}`, { method: "DELETE" }); setCurrent(null); setView("list"); loadReclamos(); }

  async function sendEmail(reclamoId: string) {
    setSending(true); setSendSuccess(false);
    const res = await fetch(`/api/reclamos/${reclamoId}/send-email`, { method: "POST" });
    const data = await res.json();
    if (res.ok) { setSendSuccess(true); setTimeout(() => setSendSuccess(false), 4000); if (current) await loadDetail(current.id); }
    else { alert(data.error || "Error al enviar correo."); }
    setSending(false);
  }

  async function uploadFoto(file: File) { if (!current) return; const fd = new FormData(); fd.append("file", file); await fetch(`/api/reclamos/${current.id}/fotos`, { method: "POST", body: fd }); await loadDetail(current.id); }
  async function deleteFoto(fotoId: string, path: string) { if (!current) return; await fetch(`/api/reclamos/${current.id}/fotos`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ foto_id: fotoId, storage_path: path }) }); await loadDetail(current.id); }

  async function saveContact() {
    if (editContactId === "new") await fetch("/api/reclamos/contactos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editContact) });
    else if (editContactId) await fetch("/api/reclamos/contactos", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editContactId, ...editContact }) });
    setEditContactId(null); setEditContact({}); loadContactos();
  }

  function toggleSelect(id: string) { setSelectedIds((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]); }

  function sendSelectedWA() {
    if (!activeEmpresa) return;
    const c = getC(activeEmpresa);
    if (!c?.whatsapp) { alert("No hay contacto con WhatsApp para esta empresa."); return; }
    const sel = reclamos.filter((r) => selectedIds.includes(r.id));
    const lines = sel.map((r) => `• ${r.nro_reclamo} | Factura ${r.nro_factura} | $${fmt(calcSub(r.reclamo_items ?? []) * 1.177)} | Hace ${daysSince(r.fecha_reclamo)} días`).join("\n");
    const msg = `Hola ${c.nombre}, buenos días. Le escribo de parte de Fashion Group para dar seguimiento:\n\n${lines}\n\n¿Nos puede confirmar el estado? Gracias.`;
    window.open(`https://wa.me/${(c.whatsapp || "").replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`, "_blank");
  }

  function prepareSelectedEmail() {
    if (!activeEmpresa) return;
    const c = getC(activeEmpresa);
    const sel = reclamos.filter((r) => selectedIds.includes(r.id));
    const lines = sel.map((r) => `• ${r.nro_reclamo} — Factura ${r.nro_factura} — $${fmt(calcSub(r.reclamo_items ?? []) * 1.177)} — ${r.estado}`).join("\n");
    setListEmailPara(c?.correo || "");
    setListEmailAsunto(`Seguimiento Reclamos Pendientes — ${activeEmpresa}`);
    setListEmailCuerpo(`Estimado/a ${c?.nombre || ""},\n\nResumen de reclamos pendientes de ${activeEmpresa}:\n\n${lines}\n\nQuedamos en espera de su confirmación.\n\nSaludos,\nFashion Group`);
    setShowEmailPanel(true);
  }

  // ── LIST VIEW ──
  if (view === "list") {
    // Sub-view A: company selector
    if (!activeEmpresa) {
      return (
        <div>
          <AppHeader module="Reclamos a Proveedores" />
          <div className="max-w-5xl mx-auto px-6 py-8">
          <div className="flex items-end justify-between mb-8">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Reclamos</h1>
              <p className="text-sm text-gray-400 mt-1">Selecciona una empresa</p>
            </div>
            <button onClick={() => { resetForm(); setView("form"); }} className="text-sm bg-black text-white px-6 py-2.5 rounded-full font-medium hover:bg-gray-800 transition">Nuevo Reclamo</button>
          </div>

          {role === "admin" && (
            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="border border-gray-100 rounded-xl p-4"><div className="text-xs text-gray-400 uppercase tracking-widest">Total Pendiente</div><div className="text-xl font-semibold mt-1 tabular-nums">${fmt(totalPendiente)}</div></div>
              <div className="border border-gray-100 rounded-xl p-4"><div className="text-xs text-gray-400 uppercase tracking-widest">Reclamos Abiertos</div><div className="text-xl font-semibold mt-1">{pendientes.length}</div></div>
              <div className={`border rounded-xl p-4 ${alertas > 0 ? "border-red-200 bg-red-50" : "border-gray-100"}`}><div className="text-xs text-gray-400 uppercase tracking-widest">Alertas +45 días</div><div className={`text-xl font-semibold mt-1 ${alertas > 0 ? "text-red-600" : ""}`}>{alertas}</div></div>
            </div>
          )}

          {loading ? <div>{[...Array(3)].map((_, i) => <div key={i} className="animate-pulse h-24 bg-gray-50 rounded-2xl mb-4" />)}</div> : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {EMPRESAS.map((empresa) => {
                const ers = reclamos.filter((r) => r.empresa === empresa);
                const open = ers.filter((r) => r.estado !== "Aplicada");
                const tot = open.reduce((s, r) => s + calcSub(r.reclamo_items ?? []) * 1.177, 0);
                const hasAlert = open.some((r) => daysSince(r.fecha_reclamo) > 45);
                const c = getC(empresa);
                return (
                  <div key={empresa} onClick={() => { setActiveEmpresa(empresa); setSelectionMode(false); setSelectedIds([]); setShowEmailPanel(false); setSearch(""); setFilterEstado("all"); }}
                    className="border border-gray-100 rounded-2xl p-6 cursor-pointer hover:border-gray-300 transition">
                    <div className="flex items-start justify-between mb-4">
                      <div><p className="text-sm font-semibold">{empresa}</p><p className="text-xs text-gray-400 mt-0.5">{c?.nombre || "Sin contacto"}</p></div>
                      {hasAlert && <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full">Alerta</span>}
                    </div>
                    <div className="flex gap-6">
                      <div><p className="text-2xl font-semibold tabular-nums">{open.length}</p><p className="text-xs text-gray-400 mt-0.5">facturas</p></div>
                      <div><p className="text-2xl font-semibold tabular-nums">${fmt(tot)}</p><p className="text-xs text-gray-400 mt-0.5">pendiente</p></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Contactos panel */}
          {showContactos && (
            <div className="fixed inset-0 bg-black/20 z-50 flex justify-end" onClick={() => setShowContactos(false)}>
              <div className="bg-white w-full max-w-md h-full overflow-y-auto p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-6"><h2 className="text-lg font-semibold">Contactos</h2><button onClick={() => setShowContactos(false)} className="text-gray-400 hover:text-black text-lg">×</button></div>
                {contactos.map((c) => (
                  <div key={c.id} className="border-b border-gray-100 py-3">
                    {editContactId === c.id ? (
                      <div className="space-y-2">{(["empresa", "nombre", "whatsapp", "correo"] as const).map((f) => <input key={f} type="text" placeholder={f} value={(editContact as Record<string, string>)[f] || ""} onChange={(e) => setEditContact({ ...editContact, [f]: e.target.value })} className="w-full border-b border-gray-200 py-1 text-sm outline-none" />)}<div className="flex gap-2 mt-2"><button onClick={saveContact} className="text-xs bg-black text-white px-3 py-1 rounded-full">Guardar</button><button onClick={() => setEditContactId(null)} className="text-xs text-gray-400">Cancelar</button></div></div>
                    ) : (<div><div className="font-medium text-sm">{c.empresa}</div><div className="text-xs text-gray-500">{c.nombre} | {c.whatsapp} | {c.correo}</div><button onClick={() => { setEditContactId(c.id); setEditContact(c); }} className="text-xs text-gray-400 hover:text-black mt-1">Editar</button></div>)}
                  </div>
                ))}
                <button onClick={() => { setEditContactId("new"); setEditContact({}); }} className="text-sm text-gray-400 hover:text-black mt-4">+ Nuevo contacto</button>
                {editContactId === "new" && <div className="mt-3 space-y-2">{(["empresa", "nombre", "whatsapp", "correo"] as const).map((f) => <input key={f} type="text" placeholder={f} value={(editContact as Record<string, string>)[f] || ""} onChange={(e) => setEditContact({ ...editContact, [f]: e.target.value })} className="w-full border-b border-gray-200 py-1 text-sm outline-none" />)}<button onClick={saveContact} className="text-xs bg-black text-white px-3 py-1 rounded-full mt-2">Guardar</button></div>}
              </div>
            </div>
          )}
        </div>
        </div>
      );
    }

    // Sub-view B: reclamos of selected empresa
    const empresaRecs = reclamos.filter((r) => r.empresa === activeEmpresa).filter((r) => {
      if (filterEstado !== "all" && r.estado !== filterEstado) return false;
      if (search) { const q = search.toLowerCase(); if (!(r.nro_reclamo || "").toLowerCase().includes(q) && !(r.nro_factura || "").toLowerCase().includes(q)) return false; }
      return true;
    });
    const c = getC(activeEmpresa);

    return (
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="flex items-end justify-between mb-8">
          <div>
            <button onClick={() => { setActiveEmpresa(null); setSelectionMode(false); setSelectedIds([]); setShowEmailPanel(false); }} className="text-sm text-gray-400 hover:text-black transition mb-2 block">← Empresas</button>
            <h1 className="text-2xl font-semibold tracking-tight">{activeEmpresa}</h1>
            {c && <p className="text-xs text-gray-400 mt-1">Contacto: {c.nombre} | {c.correo}</p>}
          </div>
          <div className="flex items-center gap-3">
            {selectionMode ? (<>
              <span className="text-sm text-gray-400">{selectedIds.length} seleccionados</span>
              {selectedIds.length > 0 && <button onClick={sendSelectedWA} className="text-sm bg-black text-white px-5 py-2 rounded-full hover:bg-gray-800 transition">WhatsApp</button>}
              {selectedIds.length > 0 && <button onClick={prepareSelectedEmail} className="text-sm bg-black text-white px-5 py-2 rounded-full hover:bg-gray-800 transition">Correo</button>}
              <button onClick={() => { setSelectionMode(false); setSelectedIds([]); setShowEmailPanel(false); }} className="text-sm text-gray-400 hover:text-black transition">Cancelar</button>
            </>) : (<>
              <button onClick={() => { setSelectionMode(true); setSelectedIds([]); }} className="text-sm text-gray-400 hover:text-black transition">Seleccionar</button>
              <button onClick={() => { resetForm(); setFEmpresa(activeEmpresa); setView("form"); }} className="text-sm bg-black text-white px-6 py-2.5 rounded-full font-medium hover:bg-gray-800 transition">Nuevo Reclamo</button>
            </>)}
          </div>
        </div>

        <div className="flex gap-3 mb-6">
          <select value={filterEstado} onChange={(e) => setFilterEstado(e.target.value)} className="border-b border-gray-200 py-2 text-sm outline-none bg-transparent"><option value="all">Todos los estados</option>{ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}</select>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..." className="border-b border-gray-200 py-2 text-sm outline-none flex-1 max-w-xs" />
        </div>

        {empresaRecs.length === 0 ? <p className="text-center text-gray-300 text-sm py-20">Sin reclamos</p> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-200 text-xs uppercase tracking-widest text-gray-400">
              {selectionMode && <th className="pb-3 w-8"></th>}
              <th className="text-left pb-3 font-medium">Factura</th><th className="text-left pb-3 font-medium">N° Reclamo</th><th className="text-left pb-3 font-medium">Fecha</th><th className="text-right pb-3 font-medium">Días</th><th className="text-left pb-3 font-medium">Estado</th><th className="text-right pb-3 font-medium">Total</th><th className="text-right pb-3 font-medium"></th>
            </tr></thead>
            <tbody>{empresaRecs.map((r) => { const days = daysSince(r.fecha_reclamo); const total = calcSub(r.reclamo_items ?? []) * 1.177; const canSelect = r.estado !== "Aplicada"; return (
              <tr key={r.id} onClick={() => !selectionMode && loadDetail(r.id)} className="border-b border-gray-100 hover:bg-gray-50/80 transition cursor-pointer">
                {selectionMode && <td className="py-3" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedIds.includes(r.id)} onChange={() => toggleSelect(r.id)} disabled={!canSelect} className="accent-black disabled:opacity-30" /></td>}
                <td className="py-3 font-medium">{r.nro_factura}</td><td className="py-3"><span className="text-gray-500 text-xs">{r.nro_reclamo}</span></td><td className="py-3 text-gray-500">{fmtDate(r.fecha_reclamo)}</td>
                <td className={`py-3 text-right tabular-nums ${days > 60 && canSelect ? "text-red-600 font-medium" : "text-gray-400"}`}>{days}</td>
                <td className="py-3"><span className={`text-[11px] px-2 py-0.5 rounded-full ${EC[r.estado] || "bg-gray-100 text-gray-500"}`}>{r.estado}</span></td>
                <td className="py-3 text-right tabular-nums">${fmt(total)}</td>
                <td className="py-3 text-right" onClick={(e) => e.stopPropagation()}>{role === "admin" && <button onClick={() => deleteReclamo(r.id)} className="text-sm text-gray-300 hover:text-black transition">Eliminar</button>}</td>
              </tr>); })}</tbody>
          </table>
        )}

        {/* Email panel for selection */}
        {showEmailPanel && (
          <div className="mt-6 border border-gray-200 rounded-2xl p-6">
            <p className="text-sm font-medium mb-4">Correo — {selectedIds.length} reclamos seleccionados</p>
            <div className="space-y-3">
              <div><label className="text-[10px] text-gray-400 uppercase">Para</label><input type="text" value={listEmailPara} onChange={(e) => setListEmailPara(e.target.value)} className="w-full border-b border-gray-200 py-1.5 text-sm outline-none" /></div>
              <div><label className="text-[10px] text-gray-400 uppercase">Asunto</label><input type="text" value={listEmailAsunto} onChange={(e) => setListEmailAsunto(e.target.value)} className="w-full border-b border-gray-200 py-1.5 text-sm outline-none" /></div>
              <div><label className="text-[10px] text-gray-400 uppercase">Cuerpo</label><textarea value={listEmailCuerpo} onChange={(e) => setListEmailCuerpo(e.target.value)} rows={8} className="w-full border border-gray-200 rounded-lg p-3 text-sm outline-none resize-none mt-1" /></div>
              <div className="flex gap-3">
                <button onClick={() => { navigator.clipboard.writeText(listEmailCuerpo); setListCopied(true); setTimeout(() => setListCopied(false), 2000); }} className="text-sm text-gray-400 hover:text-black transition">{listCopied ? "¡Copiado!" : "Copiar cuerpo"}</button>
                <button onClick={() => window.open(`mailto:${listEmailPara}?subject=${encodeURIComponent(listEmailAsunto)}&body=${encodeURIComponent(listEmailCuerpo)}`)} className="text-sm bg-black text-white px-5 py-2 rounded-full hover:bg-gray-800 transition">Abrir en Mail</button>
                <button onClick={() => setShowEmailPanel(false)} className="text-sm text-gray-400 hover:text-black transition">Cerrar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── FORM VIEW ──
  if (view === "form") {
    return (
      <div className="max-w-6xl mx-auto px-6 py-12">
        <button onClick={() => setView("list")} className="text-sm text-gray-400 hover:text-black transition mb-8 block">← Reclamos</button>
        <h1 className="text-2xl font-semibold tracking-tight mb-10">Nuevo Reclamo</h1>
        <div className="mb-10">
          <div className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-4">Información General</div>
          <div className="grid grid-cols-3 gap-x-12 gap-y-5">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400">Empresa *</label>
              <select value={fEmpresa} onChange={(e) => setFEmpresa(e.target.value)} className="border-b border-gray-200 py-1.5 text-sm text-black outline-none bg-transparent"><option value="">Seleccionar...</option>{EMPRESAS.map((e) => <option key={e} value={e}>{e}</option>)}</select>
              {empInfo && <p className="text-xs text-gray-400 mt-1">Proveedor: {empInfo.proveedor} | Marca: {empInfo.marca}</p>}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400">Fecha *</label>
              <input type="date" value={fFecha} onChange={(e) => setFFecha(e.target.value)} className="border-b border-gray-200 py-1.5 text-sm text-black outline-none" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400">Notas</label>
              <textarea value={fNotas} onChange={(e) => setFNotas(e.target.value)} rows={1} className="border-b border-gray-200 py-1.5 text-sm text-black outline-none resize-none" />
            </div>
          </div>
        </div>
        <div className="mb-10">
          <div className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-4">Ítems del Reclamo</div>
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-200 text-[10px] uppercase tracking-[0.05em] text-gray-400">
              <th className="pb-2 font-medium text-left">Código</th>
              <th className="pb-2 font-medium text-left">Descripción</th>
              <th className="pb-2 font-medium text-left" style={{minWidth:70}}>Talla</th>
              <th className="pb-2 font-medium text-center" style={{minWidth:60}}>Cant.</th>
              <th className="pb-2 font-medium text-right" style={{minWidth:80}}>Precio U.</th>
              <th className="pb-2 font-medium text-left">Motivo</th>
              <th className="pb-2 font-medium text-left" style={{minWidth:90}}>N° Factura</th>
              <th className="pb-2 font-medium text-left" style={{minWidth:80}}>N° PO</th>
              <th className="pb-2 font-medium text-right" style={{minWidth:80}}>Subtotal</th>
              <th className="pb-2 w-6"></th>
            </tr></thead>
            <tbody>{fItems.map((item, idx) => (
              <tr key={idx} className="border-b border-gray-100">
                <td className="py-2 pr-1"><input type="text" value={item.referencia} onChange={(e) => updateItem(idx, "referencia", e.target.value)} className="w-full border-b border-gray-100 py-1 text-sm outline-none" /></td>
                <td className="py-2 pr-1"><input type="text" value={item.descripcion} onChange={(e) => updateItem(idx, "descripcion", e.target.value)} className="w-full border-b border-gray-100 py-1 text-sm outline-none" /></td>
                <td className="py-2 pr-1">
                  {(!TALLAS.includes(item.talla) && item.talla !== "") ? (
                    <div className="flex items-center gap-1">
                      <input type="text" value={item.talla} onChange={(e) => updateItem(idx, "talla", e.target.value)} placeholder="Talla" className="w-full border-b border-gray-100 py-1 text-sm outline-none" style={{minWidth:50}} />
                      <button onClick={() => updateItem(idx, "talla", "")} className="text-gray-300 hover:text-black text-xs">×</button>
                    </div>
                  ) : (
                    <select value={item.talla} onChange={(e) => { if (e.target.value === "Otros") updateItem(idx, "talla", " "); else updateItem(idx, "talla", e.target.value); }} className="border-b border-gray-100 py-1 text-sm outline-none bg-transparent" style={{minWidth:60}}>
                      <option value="">—</option>
                      {TALLAS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  )}
                </td>
                <td className="py-2 pr-1"><input type="number" min={0} value={item.cantidad} onChange={(e) => updateItem(idx, "cantidad", parseInt(e.target.value) || 0)} className="w-full border-b border-gray-100 py-1 text-sm outline-none text-center" /></td>
                <td className="py-2 pr-1"><input type="number" step="0.01" min={0} value={item.precio_unitario} onChange={(e) => updateItem(idx, "precio_unitario", parseFloat(e.target.value) || 0)} className="w-full border-b border-gray-100 py-1 text-sm outline-none text-right" /></td>
                <td className="py-2 pr-1"><select value={item.motivo} onChange={(e) => updateItem(idx, "motivo", e.target.value)} className="w-full border-b border-gray-100 py-1 text-sm outline-none bg-transparent"><option value="">—</option>{MOTIVOS.map((m) => <option key={m} value={m}>{m}</option>)}</select></td>
                <td className="py-2 pr-1"><input type="text" value={item.nro_factura} onChange={(e) => updateItem(idx, "nro_factura", e.target.value)} placeholder="Factura" className="w-full border-b border-gray-100 py-1 text-sm outline-none" /></td>
                <td className="py-2 pr-1"><input type="text" value={item.nro_orden_compra} onChange={(e) => updateItem(idx, "nro_orden_compra", e.target.value)} placeholder="PO" className="w-full border-b border-gray-100 py-1 text-sm outline-none" /></td>
                <td className="py-2 text-right tabular-nums text-gray-500 text-xs">${fmt((item.cantidad || 0) * (item.precio_unitario || 0))}</td>
                <td className="py-2 text-center">{fItems.length > 1 && <button onClick={() => setFItems((p) => p.filter((_, i) => i !== idx))} className="text-gray-300 hover:text-black text-sm">×</button>}</td>
              </tr>))}</tbody>
          </table>
          </div>
          <button onClick={() => setFItems((p) => [...p, emptyItem()])} className="text-sm text-gray-400 hover:text-black transition mt-3">+ Agregar fila</button>
          <div className="mt-6 text-right text-sm space-y-1">
            <div>Subtotal: <span className="tabular-nums font-medium">${fmt(fSubtotal)}</span></div>
            <div className="text-gray-400">Importación (10%): ${fmt(fSubtotal * 0.10)}</div>
            <div className="text-gray-400">ITBMS (7% s/imp.): ${fmt(fSubtotal * 0.077)}</div>
            <div className="text-lg font-semibold">Total: ${fmt(fSubtotal * 1.177)}</div>
          </div>
        </div>
        {savedReclamoId ? (
          <div className="mt-8 border-t border-gray-100 pt-6">
            <div className="flex items-center gap-3 mb-6 p-4 bg-gray-50 rounded-xl">
              <div className="w-5 h-5 rounded-full bg-black flex items-center justify-center flex-shrink-0">
                <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </div>
              <div><p className="text-sm font-medium">{savedNroReclamo} guardado</p><p className="text-xs text-gray-400">Agrega fotos de evidencia (opcional)</p></div>
            </div>
            <div className="mb-6">
              <div className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-3">Fotos de evidencia</div>
              {formFotos.length > 0 && (
                <div className="flex gap-3 flex-wrap mb-3">
                  {formFotos.map((f) => (
                    <div key={f.id} className="relative">
                      <img src={f.url || `${SUPA_URL}/storage/v1/object/public/reclamo-fotos/${f.storage_path}`} alt="" className="w-20 h-20 object-cover rounded-xl border border-gray-100" />
                      <button onClick={async () => { await fetch(`/api/reclamos/${savedReclamoId}/fotos`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ foto_id: f.id, storage_path: f.storage_path }) }); setFormFotos((p) => p.filter((x) => x.id !== f.id)); }}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-black text-white rounded-full text-xs flex items-center justify-center">×</button>
                    </div>
                  ))}
                </div>
              )}
              {formFotos.length < 3 && (<>
                <input ref={formFotoRef} type="file" accept="image/*" className="hidden" onChange={async (e) => {
                  const file = e.target.files?.[0]; if (!file || !savedReclamoId) return;
                  setUploadingFormFoto(true);
                  const fd = new FormData(); fd.append("file", file);
                  const res = await fetch(`/api/reclamos/${savedReclamoId}/fotos`, { method: "POST", body: fd });
                  if (res.ok) { const data = await res.json(); setFormFotos((p) => [...p, data]); }
                  setUploadingFormFoto(false);
                  if (formFotoRef.current) formFotoRef.current.value = "";
                }} />
                <button onClick={() => formFotoRef.current?.click()} disabled={uploadingFormFoto} className="text-sm text-gray-400 hover:text-black transition disabled:opacity-40">{uploadingFormFoto ? "Subiendo..." : "+ Agregar foto"}</button>
              </>)}
            </div>
            <button onClick={() => { const id = savedReclamoId; resetForm(); loadReclamos(); if (id) loadDetail(id); }}
              className="bg-black text-white px-6 py-2.5 rounded-full text-sm font-medium hover:bg-gray-800 transition">Ver reclamo →</button>
            <button onClick={() => sendEmail(savedReclamoId!)} disabled={sending}
              className="text-sm text-gray-400 hover:text-black transition disabled:opacity-40 mt-3 block">
              {sending ? "Enviando..." : sendSuccess ? "✓ Correo enviado" : "Enviar por correo"}
            </button>
          </div>
        ) : (
          <div className="mt-8">
            <div className="border-t border-gray-100 pt-6 mb-6">
              <div className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-3">Fotos de evidencia</div>
              <p className="text-[12px] text-gray-400 italic">Podrás agregar fotos después de guardar.</p>
            </div>
            {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
            <div className="flex items-center gap-6">
              <button onClick={saveReclamo} disabled={saving} className="bg-black text-white px-6 py-2.5 rounded-full text-sm font-medium hover:bg-gray-800 transition disabled:opacity-40">{saving ? "Guardando..." : "Guardar Reclamo"}</button>
              <button onClick={() => { resetForm(); setView("list"); }} className="text-sm text-gray-400 hover:text-black transition">Cancelar</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── DETAIL VIEW ──
  if (!current) return null;
  const items = current.reclamo_items ?? [];
  const seg = current.reclamo_seguimiento ?? [];
  const fotos = current.reclamo_fotos ?? [];
  const sub = calcSub(items);
  const days = daysSince(current.fecha_reclamo);

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <button onClick={() => { setCurrent(null); setView("list"); }} className="text-sm text-gray-400 hover:text-black transition mb-8 block">← Reclamos</button>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{current.nro_reclamo}</h1>
          <p className="text-sm text-gray-400 mt-1">{current.empresa} — {current.marca} — {current.proveedor}</p>
          <p className="text-sm text-gray-400">Factura: {current.nro_factura}{current.nro_orden_compra ? ` | PO: ${current.nro_orden_compra}` : ""}</p>
          <p className="text-sm text-gray-400">{fmtDate(current.fecha_reclamo)} — {days} días</p>
        </div>
        <span className={`text-xs px-3 py-1 rounded-full ${EC[current.estado] || "bg-gray-100 text-gray-500"}`}>{current.estado}</span>
      </div>

      <div className="flex gap-1 mb-8">{ESTADOS.map((e, i) => <button key={e} onClick={() => changeEstado(e)} className={`flex-1 py-2 text-xs text-center rounded transition ${ESTADOS.indexOf(current.estado) >= i ? "bg-black text-white" : "bg-gray-100 text-gray-400 hover:bg-gray-200"}`}>{e}</button>)}</div>

      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="border border-gray-100 rounded-xl p-3 text-center"><div className="text-[10px] text-gray-400 uppercase">Subtotal</div><div className="text-sm font-semibold tabular-nums mt-1">${fmt(sub)}</div></div>
        <div className="border border-gray-100 rounded-xl p-3 text-center"><div className="text-[10px] text-gray-400 uppercase">Import. 10%</div><div className="text-sm font-semibold tabular-nums mt-1">${fmt(sub * 0.10)}</div></div>
        <div className="border border-gray-100 rounded-xl p-3 text-center"><div className="text-[10px] text-gray-400 uppercase">ITBMS</div><div className="text-sm font-semibold tabular-nums mt-1">${fmt(sub * 0.077)}</div></div>
        <div className="border border-gray-100 rounded-xl p-3 text-center"><div className="text-[10px] text-gray-400 uppercase">Total</div><div className="text-base font-bold tabular-nums mt-1">${fmt(sub * 1.177)}</div></div>
      </div>

      {items.length > 0 && (
        <div className="mb-8">
          <div className="text-xs uppercase tracking-widest text-gray-400 mb-3">Ítems</div>
          <div className="overflow-x-auto">
          <table className="w-full text-sm"><thead><tr className="border-b border-gray-200 text-[10px] uppercase tracking-[0.05em] text-gray-400">
            <th className="text-left pb-2 font-medium">Código</th><th className="text-left pb-2 font-medium">Descripción</th><th className="text-left pb-2 font-medium">Talla</th><th className="text-right pb-2 font-medium">Cant.</th><th className="text-right pb-2 font-medium">Precio</th><th className="text-right pb-2 font-medium">Subtotal</th><th className="text-left pb-2 font-medium">Motivo</th><th className="text-left pb-2 font-medium">Factura</th><th className="text-left pb-2 font-medium">PO</th>
          </tr></thead>
            <tbody>{items.map((item, i) => (
              <tr key={i} className="border-b border-gray-100"><td className="py-2">{item.referencia}</td><td className="py-2 text-gray-500">{item.descripcion}</td><td className="py-2 text-gray-500">{item.talla}</td><td className="py-2 text-right tabular-nums">{Number(item.cantidad) || 0}</td><td className="py-2 text-right tabular-nums">${fmt(item.precio_unitario)}</td><td className="py-2 text-right tabular-nums font-medium">${fmt((Number(item.cantidad) || 0) * (Number(item.precio_unitario) || 0))}</td><td className="py-2 text-gray-500 text-xs">{item.motivo}</td><td className="py-2 text-gray-500 text-xs">{item.nro_factura}</td><td className="py-2 text-gray-500 text-xs">{item.nro_orden_compra}</td></tr>
            ))}</tbody></table>
          </div>
        </div>
      )}

      {/* Fotos */}
      <div className="mb-8">
        <div className="text-xs uppercase tracking-widest text-gray-400 mb-3">Fotos de Evidencia</div>
        {fotos.length === 0 ? <p className="text-[12px] text-gray-400 italic">Sin fotos adjuntas</p> : (
          <div className="flex gap-3 flex-wrap">
            {fotos.map((f) => (
              <div key={f.id} className="relative">
                <img src={f.url || `${SUPA_URL}/storage/v1/object/public/reclamo-fotos/${f.storage_path}`} alt="" className="w-24 h-24 object-cover rounded-xl border border-gray-100" />
                <button onClick={() => deleteFoto(f.id, f.storage_path)} className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-black text-white rounded-full text-xs flex items-center justify-center">×</button>
              </div>
            ))}
          </div>
        )}
        {fotos.length < 3 && (<>
          <input ref={fotoRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFoto(f); if (fotoRef.current) fotoRef.current.value = ""; }} />
          <button onClick={() => fotoRef.current?.click()} className="text-sm text-gray-400 hover:text-black transition mt-2">+ Agregar foto</button>
        </>)}
      </div>

      {current.notas && <p className="text-sm text-gray-400 mb-6">Notas: {current.notas}</p>}

      <div className="mb-8">
        <div className="text-xs uppercase tracking-widest text-gray-400 mb-3">Seguimiento</div>
        <div className="flex gap-2 mb-3"><input type="text" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Agregar nota..." className="flex-1 border-b border-gray-200 py-1.5 text-sm outline-none" /><button onClick={addNota} disabled={!nota.trim()} className="text-sm bg-black text-white px-4 py-1.5 rounded-full hover:bg-gray-800 transition disabled:opacity-40">Agregar</button></div>
        {seg.map((s) => <div key={s.id} className="border-b border-gray-50 py-2"><p className="text-sm">{s.nota}</p><p className="text-[10px] text-gray-400 mt-0.5">{new Date(s.created_at).toLocaleString("es-PA")} — {s.autor}</p></div>)}
      </div>

      <div className="flex gap-3 flex-wrap mb-4">
        <button onClick={() => sendEmail(current.id)} disabled={sending}
          className="text-sm bg-black text-white px-5 py-2 rounded-full hover:bg-gray-800 transition disabled:opacity-40">
          {sending ? "Enviando..." : sendSuccess ? "✓ Enviado" : "Enviar por Correo"}
        </button>
        <button onClick={() => window.open(`/api/reclamos/${current.id}/excel`)} className="text-sm text-gray-400 hover:text-black transition">Descargar Excel</button>
        {role === "admin" && <button onClick={() => deleteReclamo(current.id)} className="text-sm text-gray-300 hover:text-red-500 transition ml-auto">Eliminar</button>}
      </div>
    </div>
  );
}
