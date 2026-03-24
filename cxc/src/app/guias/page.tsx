"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

interface GuiaItem {
  id?: string;
  orden: number;
  cliente: string;
  direccion: string;
  empresa: string;
  facturas: string;
  bultos: number;
  numero_guia_transp: string;
}

interface Guia {
  id: string;
  numero: number;
  fecha: string;
  transportista: string;
  placa: string;
  observaciones: string;
  total_bultos: number;
  item_count: number;
  guia_items?: GuiaItem[];
}

const TRANSPORTISTAS = ["Mojica", "Arias", "González", "Pérez", "Rodríguez", "Hernández", "Martínez", "López", "Otro"];
const EMPRESAS = ["Vistana International", "Fashion Shoes", "Fashion Wear", "Active Shoes", "Active Wear", "Confecciones Boston", "Joystep", "Otra"];

function emptyItem(orden: number): GuiaItem {
  return { orden, cliente: "", direccion: "", empresa: "", facturas: "", bultos: 0, numero_guia_transp: "" };
}

function fmtDate(d: string) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

type View = "list" | "form" | "print";

export default function GuiasPage() {
  const router = useRouter();
  const [view, setView] = useState<View>("list");
  const [guias, setGuias] = useState<Guia[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [transportista, setTransportista] = useState("");
  const [transportistaOtro, setTransportistaOtro] = useState("");
  const [placa, setPlaca] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [items, setItems] = useState<GuiaItem[]>([emptyItem(1)]);
  const [nextNumero, setNextNumero] = useState(1);
  const [saving, setSaving] = useState(false);

  // Print state
  const [printGuia, setPrintGuia] = useState<Guia | null>(null);

  useEffect(() => {
    const r = sessionStorage.getItem("cxc_role");
    if (r !== "admin" && r !== "director") {
      router.push("/");
      return;
    }
    loadGuias();
  }, [router]);

  const loadGuias = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/guias");
    if (res.ok) {
      const data = await res.json();
      setGuias(data);
      setNextNumero(data.length > 0 ? data[0].numero + 1 : 1);
    }
    setLoading(false);
  }, []);

  async function deleteGuia(id: string) {
    if (!confirm("¿Eliminar esta guía?")) return;
    await fetch(`/api/guias/${id}`, { method: "DELETE" });
    loadGuias();
  }

  async function viewGuia(id: string) {
    const res = await fetch(`/api/guias/${id}`);
    if (res.ok) {
      const data = await res.json();
      setPrintGuia(data);
      setView("print");
    }
  }

  function resetForm() {
    setFecha(new Date().toISOString().slice(0, 10));
    setTransportista("");
    setTransportistaOtro("");
    setPlaca("");
    setObservaciones("");
    setItems([emptyItem(1)]);
  }

  function addRow() {
    setItems([...items, emptyItem(items.length + 1)]);
  }

  function removeRow(idx: number) {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== idx).map((item, i) => ({ ...item, orden: i + 1 })));
  }

  function updateItem(idx: number, field: keyof GuiaItem, value: string | number) {
    setItems(items.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  }

  const totalBultos = items.reduce((s, i) => s + (i.bultos || 0), 0);

  async function saveGuia() {
    const transp = transportista === "Otro" ? transportistaOtro : transportista;
    if (!transp) { alert("Seleccione un transportista"); return; }

    setSaving(true);
    const res = await fetch("/api/guias", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fecha,
        transportista: transp,
        placa,
        observaciones,
        items: items.filter((i) => i.cliente || i.direccion || i.empresa || i.facturas || i.bultos > 0),
      }),
    });

    if (res.ok) {
      const guia = await res.json();
      // Load full guia with items for print
      const fullRes = await fetch(`/api/guias/${guia.id}`);
      if (fullRes.ok) {
        setPrintGuia(await fullRes.json());
      }
      resetForm();
      loadGuias();
      setView("print");
    } else {
      alert("Error al guardar");
    }
    setSaving(false);
  }

  // ── LIST VIEW ──
  if (view === "list") {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold">Guías de Transporte</h1>
            <p className="text-sm text-gray-500">Registro de despachos</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => { resetForm(); setView("form"); }}
              className="text-sm bg-black text-white px-4 py-2 rounded hover:bg-gray-800 transition">
              + Nueva Guía
            </button>
            <button onClick={() => router.push("/admin")} className="text-sm text-gray-500 hover:text-black">
              Panel CXC
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-gray-400 text-sm text-center py-12">Cargando...</p>
        ) : guias.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-12">No hay guías registradas</p>
        ) : (
          <div className="border border-gray-200 rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="text-left px-4 py-2 font-medium">N°</th>
                  <th className="text-left px-4 py-2 font-medium">Fecha</th>
                  <th className="text-left px-4 py-2 font-medium">Transportista</th>
                  <th className="text-right px-4 py-2 font-medium">Bultos</th>
                  <th className="text-right px-4 py-2 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {guias.map((g) => (
                  <tr key={g.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium">{g.numero}</td>
                    <td className="px-4 py-2.5">{fmtDate(g.fecha)}</td>
                    <td className="px-4 py-2.5">{g.transportista}</td>
                    <td className="px-4 py-2.5 text-right">{g.total_bultos}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => viewGuia(g.id)} className="text-xs text-blue-600 hover:underline mr-3">Ver</button>
                      <button onClick={() => deleteGuia(g.id)} className="text-xs text-red-500 hover:underline">🗑</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // ── FORM VIEW ──
  if (view === "form") {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <button onClick={() => setView("list")} className="text-sm text-gray-500 hover:text-black mb-4">
          ← Guías
        </button>
        <h1 className="text-xl font-bold mb-6">Nueva Guía de Transporte</h1>

        {/* Header card */}
        <div className="border border-gray-200 rounded p-4 mb-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wide font-medium">N° Guía</label>
              <input type="text" readOnly value={nextNumero} className="w-full border border-gray-200 rounded px-3 py-2 text-sm bg-gray-50 mt-1" />
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wide font-medium">Fecha</label>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-full border border-gray-200 rounded px-3 py-2 text-sm mt-1" />
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wide font-medium">Transportista</label>
              <select value={transportista} onChange={(e) => setTransportista(e.target.value)} className="w-full border border-gray-200 rounded px-3 py-2 text-sm mt-1">
                <option value="">Seleccionar...</option>
                {TRANSPORTISTAS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              {transportista === "Otro" && (
                <input type="text" placeholder="Nombre del transportista" value={transportistaOtro} onChange={(e) => setTransportistaOtro(e.target.value)}
                  className="w-full border border-gray-200 rounded px-3 py-2 text-sm mt-2" />
              )}
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wide font-medium">Placa / Vehículo</label>
              <input type="text" value={placa} onChange={(e) => setPlaca(e.target.value)} className="w-full border border-gray-200 rounded px-3 py-2 text-sm mt-1" />
            </div>
          </div>
        </div>

        {/* Items table */}
        <div className="border border-gray-200 rounded overflow-hidden mb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-2 py-2 font-medium w-10">#</th>
                <th className="px-2 py-2 font-medium text-left">Cliente</th>
                <th className="px-2 py-2 font-medium text-left">Dirección</th>
                <th className="px-2 py-2 font-medium text-left">Empresa</th>
                <th className="px-2 py-2 font-medium text-left">Factura(s)</th>
                <th className="px-2 py-2 font-medium w-20">Bultos</th>
                <th className="px-2 py-2 font-medium text-left">N° Guía Transp.</th>
                <th className="px-2 py-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={idx} className="border-t border-gray-100">
                  <td className="px-2 py-1 text-center text-gray-400">{idx + 1}</td>
                  <td className="px-1 py-1">
                    <input type="text" value={item.cliente} onChange={(e) => updateItem(idx, "cliente", e.target.value)}
                      className="w-full border border-gray-200 rounded px-2 py-1 text-sm" />
                  </td>
                  <td className="px-1 py-1">
                    <input type="text" value={item.direccion} onChange={(e) => updateItem(idx, "direccion", e.target.value)}
                      className="w-full border border-gray-200 rounded px-2 py-1 text-sm" />
                  </td>
                  <td className="px-1 py-1">
                    <select value={item.empresa} onChange={(e) => updateItem(idx, "empresa", e.target.value)}
                      className="w-full border border-gray-200 rounded px-2 py-1 text-sm">
                      <option value="">—</option>
                      {EMPRESAS.map((e) => <option key={e} value={e}>{e}</option>)}
                    </select>
                  </td>
                  <td className="px-1 py-1">
                    <input type="text" value={item.facturas} onChange={(e) => updateItem(idx, "facturas", e.target.value)}
                      className="w-full border border-gray-200 rounded px-2 py-1 text-sm" />
                  </td>
                  <td className="px-1 py-1">
                    <input type="number" min={0} value={item.bultos} onChange={(e) => updateItem(idx, "bultos", parseInt(e.target.value) || 0)}
                      className="w-full border border-gray-200 rounded px-2 py-1 text-sm text-center" />
                  </td>
                  <td className="px-1 py-1">
                    <input type="text" value={item.numero_guia_transp} onChange={(e) => updateItem(idx, "numero_guia_transp", e.target.value)}
                      className="w-full border border-gray-200 rounded px-2 py-1 text-sm" />
                  </td>
                  <td className="px-1 py-1 text-center">
                    {items.length > 1 && (
                      <button onClick={() => removeRow(idx)} className="text-red-400 hover:text-red-600 text-xs">×</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button onClick={addRow} className="text-sm text-blue-600 hover:underline mb-6">
          + Agregar fila
        </button>

        <div className="border border-gray-200 rounded p-4 mb-6">
          <div className="flex items-center gap-6 mb-4">
            <div>
              <span className="text-xs text-gray-500 uppercase tracking-wide font-medium">Total de bultos: </span>
              <span className="font-bold">{totalBultos}</span>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wide font-medium">Observaciones</label>
            <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)}
              rows={3} className="w-full border border-gray-200 rounded px-3 py-2 text-sm mt-1" />
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={saveGuia} disabled={saving}
            className="bg-black text-white px-5 py-2 rounded text-sm hover:bg-gray-800 transition disabled:opacity-50">
            {saving ? "Guardando..." : "Guardar y Ver Guía"}
          </button>
          <button onClick={() => setView("list")} className="text-sm text-gray-500 hover:text-black px-4 py-2">
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  // ── PRINT VIEW ──
  if (view === "print" && printGuia) {
    const g = printGuia;
    const guiaItems = g.guia_items || [];
    const bultos = guiaItems.reduce((s, i) => s + (i.bultos || 0), 0);

    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex gap-3 mb-6 no-print">
          <button onClick={() => setView("list")} className="text-sm text-gray-500 hover:text-black">← Volver</button>
          <button onClick={() => window.print()} className="text-sm bg-black text-white px-4 py-2 rounded hover:bg-gray-800">
            🖨 Imprimir
          </button>
        </div>

        <div id="print-document" className="border border-gray-200 rounded p-8" style={{ fontFamily: "-apple-system, sans-serif" }}>
          <h1 className="text-center text-lg font-bold mb-6 uppercase tracking-wide">Guía de Transporte Interior</h1>

          <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
            <div className="flex gap-2">
              <span className="font-medium">N° GUÍA:</span>
              <span className="border-b border-gray-300 flex-1 text-center">{g.numero}</span>
            </div>
            <div className="flex gap-2">
              <span className="font-medium">FECHA:</span>
              <span className="border-b border-gray-300 flex-1 text-center">{fmtDate(g.fecha)}</span>
            </div>
            <div className="flex gap-2">
              <span className="font-medium">TRANSPORTISTA:</span>
              <span className="border-b border-gray-300 flex-1 text-center">{g.transportista}</span>
            </div>
            <div className="flex gap-2">
              <span className="font-medium">PLACA / VEHÍCULO:</span>
              <span className="border-b border-gray-300 flex-1 text-center">{g.placa || ""}</span>
            </div>
          </div>

          <hr className="border-gray-300 mb-4" />

          <table className="w-full text-xs border-collapse mb-4">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 px-2 py-1.5 font-medium w-8">#</th>
                <th className="border border-gray-300 px-2 py-1.5 font-medium text-left">CLIENTE</th>
                <th className="border border-gray-300 px-2 py-1.5 font-medium text-left">DIRECCIÓN</th>
                <th className="border border-gray-300 px-2 py-1.5 font-medium text-left">EMPRESA</th>
                <th className="border border-gray-300 px-2 py-1.5 font-medium text-left">FACTURA(S)</th>
                <th className="border border-gray-300 px-2 py-1.5 font-medium w-16 text-center">BULTOS</th>
                <th className="border border-gray-300 px-2 py-1.5 font-medium text-left">N° GUÍA TRANSP.</th>
              </tr>
            </thead>
            <tbody>
              {guiaItems.map((item, i) => (
                <tr key={i}>
                  <td className="border border-gray-300 px-2 py-1 text-center">{i + 1}</td>
                  <td className="border border-gray-300 px-2 py-1">{item.cliente}</td>
                  <td className="border border-gray-300 px-2 py-1">{item.direccion}</td>
                  <td className="border border-gray-300 px-2 py-1">{item.empresa}</td>
                  <td className="border border-gray-300 px-2 py-1">{item.facturas}</td>
                  <td className="border border-gray-300 px-2 py-1 text-center">{item.bultos || ""}</td>
                  <td className="border border-gray-300 px-2 py-1">{item.numero_guia_transp}</td>
                </tr>
              ))}
              <tr className="font-bold bg-gray-50">
                <td colSpan={5} className="border border-gray-300 px-2 py-1.5 text-right uppercase text-xs">Total de bultos despachados</td>
                <td className="border border-gray-300 px-2 py-1.5 text-center">{bultos}</td>
                <td className="border border-gray-300"></td>
              </tr>
            </tbody>
          </table>

          {/* Observaciones */}
          <div className="mb-8 text-xs">
            <div className="font-medium uppercase mb-1">Observaciones Generales del Envío</div>
            <div className="border border-gray-300 rounded p-2 min-h-[40px] whitespace-pre-wrap">{g.observaciones || ""}</div>
          </div>

          {/* Signatures */}
          <div className="grid grid-cols-2 gap-12 mt-12 text-xs">
            <div>
              <div className="font-medium uppercase mb-6">Entregado por</div>
              <div className="mb-4">NOMBRE: <span className="border-b border-gray-400 inline-block w-48 ml-1">&nbsp;</span></div>
              <div>FIRMA: <span className="border-b border-gray-400 inline-block w-48 ml-1">&nbsp;</span></div>
              <div className="text-gray-400 mt-2 italic">Nombre y firma</div>
            </div>
            <div>
              <div className="font-medium uppercase mb-6">Recibido Conforme — Transportista</div>
              <div className="mb-4">NOMBRE: <span className="border-b border-gray-400 inline-block w-48 ml-1">&nbsp;</span></div>
              <div className="mb-4">CÉDULA: <span className="border-b border-gray-400 inline-block w-48 ml-1">&nbsp;</span></div>
              <div>FIRMA: <span className="border-b border-gray-400 inline-block w-48 ml-1">&nbsp;</span></div>
              <div className="text-gray-400 mt-2 italic">Nombre, cédula y firma</div>
            </div>
          </div>

          {/* Legal */}
          <div className="mt-8 pt-4 border-t border-gray-200 text-[9px] text-gray-400 text-center leading-relaxed">
            La firma del transportista constituye aceptación expresa de la mercancía detallada en este documento, en la cantidad y condición indicadas. Cualquier faltante o daño no reportado al momento de la recepción será responsabilidad exclusiva del transportista.
          </div>
        </div>
      </div>
    );
  }

  return null;
}
