"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import FGLogo from "@/components/FGLogo";

// ── Types ──

interface RItem {
  referencia: string;
  descripcion: string;
  talla: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  motivo: string;
}

interface Seguimiento {
  id: string;
  nota: string;
  autor: string;
  created_at: string;
}

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
  reclamo_items?: RItem[];
  reclamo_seguimiento?: Seguimiento[];
}

// ── Constants ──

const EMPRESAS_MAP: Record<string, { proveedor: string; marca: string }> = {
  "Vistana International": { proveedor: "American Designer Fashion", marca: "Calvin Klein" },
  "Fashion Wear": { proveedor: "American Fashion Wear", marca: "Tommy Hilfiger" },
  "Fashion Shoes": { proveedor: "American Fashion Wear", marca: "Tommy Hilfiger" },
  "Active Shoes": { proveedor: "Latin Fitness Group", marca: "Reebok" },
  "Active Wear": { proveedor: "Latin Fitness Group", marca: "Reebok" },
};

const MOTIVOS = [
  "Faltante de Mercancía", "Mercancía Dañada", "Mercancía Manchada",
  "Mercancía Incorrecta", "Sobrante de Mercancía", "Discrepancia de Precio",
  "Mercancía Defectuosa",
];

const ESTADOS = ["Enviado", "En Revisión", "N/C Aprobada", "Aplicada"];

const ESTADO_COLORS: Record<string, string> = {
  "Enviado": "bg-blue-50 text-blue-700",
  "En Revisión": "bg-yellow-50 text-yellow-700",
  "N/C Aprobada": "bg-green-50 text-green-700",
  "Aplicada": "bg-gray-100 text-gray-500",
};

function emptyItem(): RItem {
  return { referencia: "", descripcion: "", talla: "", cantidad: 1, precio_unitario: 0, subtotal: 0, motivo: "" };
}

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function daysSince(d: string) {
  if (!d) return 0;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
}

// ── Component ──

export default function ReclamosPage() {
  const router = useRouter();

  // ALL STATE HOOKS FIRST
  const [authChecked, setAuthChecked] = useState(false);
  const [role, setRole] = useState("");
  const [view, setView] = useState<"list" | "form" | "detail">("list");
  const [reclamos, setReclamos] = useState<Reclamo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<Reclamo | null>(null);
  const [saving, setSaving] = useState(false);

  // Form
  const [fEmpresa, setFEmpresa] = useState("");
  const [fFecha, setFFecha] = useState(new Date().toISOString().slice(0, 10));
  const [fFactura, setFFactura] = useState("");
  const [fOrden, setFOrden] = useState("");
  const [fNotas, setFNotas] = useState("");
  const [fItems, setFItems] = useState<RItem[]>([emptyItem()]);

  // Detail
  const [nota, setNota] = useState("");

  // Auth
  useEffect(() => {
    const r = sessionStorage.getItem("cxc_role") || "";
    if (!r) { router.push("/"); return; }
    setRole(r);
    setAuthChecked(true);
  }, [router]);

  // Load
  const loadReclamos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/reclamos");
      if (res.ok) {
        const data = await res.json();
        setReclamos(Array.isArray(data) ? data : []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authChecked) loadReclamos();
  }, [authChecked, loadReclamos]);

  // SINGLE early return — after ALL hooks
  if (!authChecked) return null;

  // ── Helpers ──

  const empInfo = fEmpresa ? EMPRESAS_MAP[fEmpresa] : null;

  function resetForm() {
    setFEmpresa("");
    setFFecha(new Date().toISOString().slice(0, 10));
    setFFactura("");
    setFOrden("");
    setFNotas("");
    setFItems([emptyItem()]);
    setError(null);
  }

  function updateItem(idx: number, field: string, val: string | number) {
    setFItems((prev) => prev.map((item, i) => {
      if (i !== idx) return item;
      const u = { ...item, [field]: val };
      u.subtotal = (u.cantidad || 0) * (u.precio_unitario || 0);
      return u;
    }));
  }

  async function loadDetail(id: string) {
    try {
      const res = await fetch(`/api/reclamos/${id}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.id) {
          setCurrent(data);
          setView("detail");
        }
      }
    } catch { /* ignore */ }
  }

  async function saveReclamo() {
    if (!fEmpresa || !fFecha || !fFactura) {
      setError("Completa empresa, fecha y factura.");
      return;
    }
    const items = fItems.filter((i) => i.referencia || i.cantidad > 0);
    if (items.length === 0) {
      setError("Agrega al menos un ítem.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/reclamos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa: fEmpresa,
          proveedor: empInfo?.proveedor || "",
          marca: empInfo?.marca || "",
          nro_factura: fFactura,
          nro_orden_compra: fOrden,
          fecha_reclamo: fFecha,
          notas: fNotas,
          items,
        }),
      });

      if (res.ok) {
        const saved = await res.json();
        resetForm();
        loadReclamos();
        if (saved.id) await loadDetail(saved.id);
      } else {
        const err = await res.json().catch(() => null);
        setError(err?.error || "Error al guardar.");
      }
    } catch {
      setError("Error de conexión.");
    }
    setSaving(false);
  }

  async function addNota() {
    if (!current || !nota.trim()) return;
    await fetch(`/api/reclamos/${current.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seguimiento_nota: nota, autor: role }),
    });
    setNota("");
    await loadDetail(current.id);
  }

  async function changeEstado(estado: string) {
    if (!current || current.estado === estado) return;
    if (!confirm(`¿Cambiar estado a "${estado}"?`)) return;
    await fetch(`/api/reclamos/${current.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado }),
    });
    await loadDetail(current.id);
    loadReclamos();
  }

  async function deleteReclamo(id: string) {
    if (!confirm("¿Eliminar este reclamo?")) return;
    await fetch(`/api/reclamos/${id}`, { method: "DELETE" });
    setCurrent(null);
    setView("list");
    loadReclamos();
  }

  const fSubtotal = fItems.reduce((s, i) => s + i.subtotal, 0);

  // ── LIST VIEW ──
  if (view === "list") {
    return (
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="flex items-end justify-between mb-10">
          <div>
            <FGLogo variant="horizontal" theme="light" size={32} />
            <p className="text-sm text-gray-400 mt-2">Reclamos a Proveedores</p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => { resetForm(); setView("form"); }}
              className="text-sm bg-black text-white px-6 py-2.5 rounded-full font-medium hover:bg-gray-800 transition"
            >
              Nuevo Reclamo
            </button>
            <button onClick={() => router.push("/plantillas")} className="text-sm text-gray-400 hover:text-black transition">
              Plantillas
            </button>
          </div>
        </div>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        {loading ? (
          <div>
            {[...Array(4)].map((_, i) => (
              <div key={i} className="animate-pulse flex gap-4 py-3 border-b border-gray-100">
                <div className="h-3 bg-gray-100 rounded w-1/4" />
                <div className="h-3 bg-gray-100 rounded w-1/6 ml-auto" />
              </div>
            ))}
          </div>
        ) : reclamos.length === 0 ? (
          <p className="text-center text-gray-300 text-sm py-20">No hay reclamos registrados</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-widest text-gray-400">
                <th className="text-left pb-3 font-medium">N°</th>
                <th className="text-left pb-3 font-medium">Empresa</th>
                <th className="text-left pb-3 font-medium">Factura</th>
                <th className="text-left pb-3 font-medium">Fecha</th>
                <th className="text-left pb-3 font-medium">Estado</th>
                <th className="text-right pb-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {reclamos.map((r) => (
                <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition">
                  <td className="py-3 font-medium">{r.nro_reclamo}</td>
                  <td className="py-3 text-gray-500">{r.empresa}</td>
                  <td className="py-3 text-gray-500">{r.nro_factura}</td>
                  <td className="py-3 text-gray-500">{fmtDate(r.fecha_reclamo)}</td>
                  <td className="py-3">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${ESTADO_COLORS[r.estado] || "bg-gray-100 text-gray-500"}`}>
                      {r.estado}
                    </span>
                  </td>
                  <td className="py-3 text-right">
                    <button onClick={() => loadDetail(r.id)} className="text-sm text-gray-400 hover:text-black transition mr-3">
                      Ver
                    </button>
                    {role === "admin" && (
                      <button onClick={() => deleteReclamo(r.id)} className="text-sm text-gray-300 hover:text-black transition">
                        Eliminar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  }

  // ── FORM VIEW ──
  if (view === "form") {
    return (
      <div className="max-w-5xl mx-auto px-6 py-12">
        <button onClick={() => setView("list")} className="text-sm text-gray-400 hover:text-black transition mb-8 block">
          ← Reclamos
        </button>
        <h1 className="text-2xl font-semibold tracking-tight mb-10">Nuevo Reclamo</h1>

        {/* General info */}
        <div className="mb-10">
          <div className="text-xs uppercase tracking-widest text-gray-400 mb-4">Información General</div>
          <div className="grid grid-cols-2 gap-x-12 gap-y-6">
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-widest block mb-2">Empresa *</label>
              <select
                value={fEmpresa}
                onChange={(e) => setFEmpresa(e.target.value)}
                className="w-full border-b border-gray-200 py-2 text-sm outline-none bg-transparent"
              >
                <option value="">Seleccionar...</option>
                {Object.keys(EMPRESAS_MAP).map((e) => (
                  <option key={e} value={e}>{e}</option>
                ))}
              </select>
              {empInfo && (
                <p className="text-xs text-gray-400 mt-2">
                  Proveedor: {empInfo.proveedor} | Marca: {empInfo.marca}
                </p>
              )}
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-widest block mb-2">Fecha *</label>
              <input type="date" value={fFecha} onChange={(e) => setFFecha(e.target.value)}
                className="w-full border-b border-gray-200 py-2 text-sm outline-none" />
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-widest block mb-2">N° Factura *</label>
              <input type="text" value={fFactura} onChange={(e) => setFFactura(e.target.value)}
                className="w-full border-b border-gray-200 py-2 text-sm outline-none" />
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-widest block mb-2">N° Orden de Compra</label>
              <input type="text" value={fOrden} onChange={(e) => setFOrden(e.target.value)}
                className="w-full border-b border-gray-200 py-2 text-sm outline-none" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-400 uppercase tracking-widest block mb-2">Notas</label>
              <textarea value={fNotas} onChange={(e) => setFNotas(e.target.value)} rows={2}
                className="w-full border-b border-gray-200 py-2 text-sm outline-none resize-none" />
            </div>
          </div>
        </div>

        {/* Items */}
        <div className="mb-10">
          <div className="text-xs uppercase tracking-widest text-gray-400 mb-4">Ítems del Reclamo</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-widest text-gray-400">
                <th className="pb-3 font-medium text-left">Ref.</th>
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
                  <td className="py-2 pr-2">
                    <input type="text" value={item.referencia} onChange={(e) => updateItem(idx, "referencia", e.target.value)}
                      className="w-full border-b border-gray-100 py-1 text-sm outline-none" />
                  </td>
                  <td className="py-2 pr-2">
                    <input type="text" value={item.descripcion} onChange={(e) => updateItem(idx, "descripcion", e.target.value)}
                      className="w-full border-b border-gray-100 py-1 text-sm outline-none" />
                  </td>
                  <td className="py-2 pr-2">
                    <input type="text" value={item.talla} onChange={(e) => updateItem(idx, "talla", e.target.value)}
                      className="w-full border-b border-gray-100 py-1 text-sm outline-none" />
                  </td>
                  <td className="py-2 pr-2">
                    <input type="number" min={0} value={item.cantidad}
                      onChange={(e) => updateItem(idx, "cantidad", parseInt(e.target.value) || 0)}
                      className="w-full border-b border-gray-100 py-1 text-sm outline-none text-center" />
                  </td>
                  <td className="py-2 pr-2">
                    <input type="number" step="0.01" min={0} value={item.precio_unitario}
                      onChange={(e) => updateItem(idx, "precio_unitario", parseFloat(e.target.value) || 0)}
                      className="w-full border-b border-gray-100 py-1 text-sm outline-none text-right" />
                  </td>
                  <td className="py-2 pr-2">
                    <select value={item.motivo} onChange={(e) => updateItem(idx, "motivo", e.target.value)}
                      className="w-full border-b border-gray-100 py-1 text-sm outline-none bg-transparent">
                      <option value="">—</option>
                      {MOTIVOS.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </td>
                  <td className="py-2 text-right tabular-nums text-gray-500">${fmt(item.subtotal)}</td>
                  <td className="py-2 text-center">
                    {fItems.length > 1 && (
                      <button
                        onClick={() => setFItems((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-gray-300 hover:text-black text-sm"
                      >
                        ×
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            onClick={() => setFItems((prev) => [...prev, emptyItem()])}
            className="text-sm text-gray-400 hover:text-black transition mt-3"
          >
            + Agregar fila
          </button>

          <div className="mt-6 text-right text-sm space-y-1">
            <div>Subtotal: <span className="tabular-nums font-medium">${fmt(fSubtotal)}</span></div>
            <div className="text-gray-400">Importación (10%): ${fmt(fSubtotal * 0.10)}</div>
            <div className="text-gray-400">ITBMS (7%): ${fmt(fSubtotal * 0.07)}</div>
            <div className="text-lg font-semibold">Total: ${fmt(fSubtotal * 1.17)}</div>
          </div>
        </div>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        <div className="flex items-center gap-6">
          <button
            onClick={saveReclamo}
            disabled={saving}
            className="bg-black text-white px-6 py-2.5 rounded-full text-sm font-medium hover:bg-gray-800 transition disabled:opacity-40"
          >
            {saving ? "Guardando..." : "Guardar Reclamo"}
          </button>
          <button onClick={() => setView("list")} className="text-sm text-gray-400 hover:text-black transition">
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  // ── DETAIL VIEW ──
  if (!current) return null;

  const items = current.reclamo_items ?? [];
  const seg = current.reclamo_seguimiento ?? [];
  const sub = items.reduce((s, i) => s + (i.subtotal || 0), 0);
  const days = daysSince(current.fecha_reclamo);

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <button onClick={() => { setCurrent(null); setView("list"); }}
        className="text-sm text-gray-400 hover:text-black transition mb-8 block">
        ← Reclamos
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{current.nro_reclamo}</h1>
          <p className="text-sm text-gray-400 mt-1">{current.empresa} — {current.marca} — {current.proveedor}</p>
          <p className="text-sm text-gray-400">Factura: {current.nro_factura}{current.nro_orden_compra ? ` | PO: ${current.nro_orden_compra}` : ""}</p>
          <p className="text-sm text-gray-400">{fmtDate(current.fecha_reclamo)} — {days} días</p>
        </div>
        <span className={`text-xs px-3 py-1 rounded-full ${ESTADO_COLORS[current.estado] || "bg-gray-100 text-gray-500"}`}>
          {current.estado}
        </span>
      </div>

      {/* Pipeline */}
      <div className="flex gap-1 mb-8">
        {ESTADOS.map((e, i) => {
          const active = ESTADOS.indexOf(current.estado) >= i;
          return (
            <button
              key={e}
              onClick={() => changeEstado(e)}
              className={`flex-1 py-2 text-xs text-center rounded transition ${active ? "bg-black text-white" : "bg-gray-100 text-gray-400 hover:bg-gray-200"}`}
            >
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

      {/* Items table */}
      {items.length > 0 && (
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
      )}

      {/* Notas */}
      {current.notas && (
        <p className="text-sm text-gray-400 mb-6">Notas: {current.notas}</p>
      )}

      {/* Seguimiento */}
      <div className="mb-8">
        <div className="text-xs uppercase tracking-widest text-gray-400 mb-3">Seguimiento</div>
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Agregar nota..."
            className="flex-1 border-b border-gray-200 py-1.5 text-sm outline-none"
          />
          <button
            onClick={addNota}
            disabled={!nota.trim()}
            className="text-sm bg-black text-white px-4 py-1.5 rounded-full hover:bg-gray-800 transition disabled:opacity-40"
          >
            Agregar
          </button>
        </div>
        {seg.map((s) => (
          <div key={s.id} className="border-b border-gray-50 py-2">
            <p className="text-sm">{s.nota}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">
              {new Date(s.created_at).toLocaleString("es-PA")} — {s.autor}
            </p>
          </div>
        ))}
      </div>

      {/* Actions */}
      {role === "admin" && (
        <button
          onClick={() => deleteReclamo(current.id)}
          className="text-sm text-gray-300 hover:text-red-500 transition"
        >
          Eliminar reclamo
        </button>
      )}
    </div>
  );
}
