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

const TRANSPORTISTAS = ["RedNblue", "Mojica", "Transporte Sol", "Sanjur", "Otro"];
const EMPRESAS = ["Vistana International", "Fashion Shoes", "Fashion Wear", "Active Shoes", "Active Wear", "Confecciones Boston", "Joystep", "Otra"];
const CLIENTES = ["City Mall", "La Frontera Duty Free", "Jerusalem de Panama", "Plaza Los Angeles", "Golden Mall", "Multi Fashion Holding", "Kheriddine", "Bouti S.A.", "Jerusalem Duty Free", "Outlet Duty Free N2", "Outlet Duty Free N3", "Sporting Shoes N4"];
const DIRECCIONES = ["Paso Canoas", "David", "Santiago", "Guabito", "Changinola"];

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
      setPrintGuia(await res.json());
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
      const fullRes = await fetch(`/api/guias/${guia.id}`);
      if (fullRes.ok) setPrintGuia(await fullRes.json());
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
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="flex items-end justify-between mb-10">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Guías de Transporte</h1>
            <p className="text-sm text-gray-400 mt-1">Registro de despachos</p>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => { resetForm(); setView("form"); }}
              className="text-sm bg-black text-white px-6 py-2 rounded-full hover:bg-gray-800 transition">
              Nueva Guía
            </button>
            <button onClick={() => router.push("/admin")} className="text-sm text-gray-400 hover:text-black transition">
              Panel CXC
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-gray-300 text-sm text-center py-20">Cargando...</p>
        ) : guias.length === 0 ? (
          <p className="text-gray-300 text-sm text-center py-20">No hay guías registradas</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-widest text-gray-400">
                <th className="text-left pb-3 font-medium">N°</th>
                <th className="text-left pb-3 font-medium">Fecha</th>
                <th className="text-left pb-3 font-medium">Transportista</th>
                <th className="text-right pb-3 font-medium">Bultos</th>
                <th className="text-right pb-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {guias.map((g) => (
                <tr key={g.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition">
                  <td className="py-3.5 font-medium">{g.numero}</td>
                  <td className="py-3.5 text-gray-500">{fmtDate(g.fecha)}</td>
                  <td className="py-3.5">{g.transportista}</td>
                  <td className="py-3.5 text-right tabular-nums">{g.total_bultos}</td>
                  <td className="py-3.5 text-right">
                    <button onClick={() => viewGuia(g.id)} className="text-sm text-gray-400 hover:text-black transition mr-4">Ver</button>
                    <button onClick={() => deleteGuia(g.id)} className="text-sm text-gray-300 hover:text-black transition">Eliminar</button>
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
          ← Guías
        </button>
        <h1 className="text-2xl font-semibold tracking-tight mb-10">Nueva Guía de Transporte</h1>

        {/* Header fields */}
        <div className="mb-10">
          <div className="text-xs uppercase tracking-widest text-gray-400 mb-4">Información General</div>
          <div className="grid grid-cols-2 gap-x-12 gap-y-6">
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-widest block mb-2">N° Guía</label>
              <input type="text" readOnly value={nextNumero}
                className="w-full border-b border-gray-200 bg-gray-50/50 py-2 text-sm outline-none" />
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-widest block mb-2">Fecha</label>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
                className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition" />
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-widest block mb-2">Transportista</label>
              <select value={transportista} onChange={(e) => setTransportista(e.target.value)}
                className="w-full border-b border-gray-200 py-2 text-sm outline-none bg-transparent focus:border-black transition appearance-none">
                <option value="">Seleccionar...</option>
                {TRANSPORTISTAS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              {transportista === "Otro" && (
                <input type="text" placeholder="Nombre del transportista" value={transportistaOtro}
                  onChange={(e) => setTransportistaOtro(e.target.value)}
                  className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition mt-3" />
              )}
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-widest block mb-2">Placa / Vehículo</label>
              <input type="text" value={placa} onChange={(e) => setPlaca(e.target.value)}
                className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition" />
            </div>
          </div>
        </div>

        {/* Items table */}
        <div className="mb-10">
          <div className="text-xs uppercase tracking-widest text-gray-400 mb-4">Detalle de Envío</div>

          {/* Datalists */}
          <datalist id="clientes-list">
            {CLIENTES.map((c) => <option key={c} value={c} />)}
          </datalist>
          <datalist id="direcciones-list">
            {DIRECCIONES.map((d) => <option key={d} value={d} />)}
          </datalist>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-widest text-gray-400">
                <th className="pb-3 font-medium w-10 text-left">#</th>
                <th className="pb-3 font-medium text-left">Cliente</th>
                <th className="pb-3 font-medium text-left">Dirección</th>
                <th className="pb-3 font-medium text-left">Empresa</th>
                <th className="pb-3 font-medium text-left">Factura(s)</th>
                <th className="pb-3 font-medium w-20 text-center">Bultos</th>
                <th className="pb-3 font-medium text-left">N° Guía Transp.</th>
                <th className="pb-3 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={idx} className="border-b border-gray-100">
                  <td className="py-2 text-gray-300">{idx + 1}</td>
                  <td className="py-2 pr-2">
                    <input list="clientes-list" type="text" value={item.cliente}
                      onChange={(e) => updateItem(idx, "cliente", e.target.value)}
                      className="w-full border-b border-gray-100 py-1 text-sm outline-none focus:border-black transition" />
                  </td>
                  <td className="py-2 pr-2">
                    <input list="direcciones-list" type="text" value={item.direccion}
                      onChange={(e) => updateItem(idx, "direccion", e.target.value)}
                      className="w-full border-b border-gray-100 py-1 text-sm outline-none focus:border-black transition" />
                  </td>
                  <td className="py-2 pr-2">
                    <select value={item.empresa} onChange={(e) => updateItem(idx, "empresa", e.target.value)}
                      className="w-full border-b border-gray-100 py-1 text-sm outline-none bg-transparent focus:border-black transition appearance-none">
                      <option value="">—</option>
                      {EMPRESAS.map((e) => <option key={e} value={e}>{e}</option>)}
                    </select>
                  </td>
                  <td className="py-2 pr-2">
                    <input type="text" value={item.facturas}
                      onChange={(e) => updateItem(idx, "facturas", e.target.value)}
                      className="w-full border-b border-gray-100 py-1 text-sm outline-none focus:border-black transition" />
                  </td>
                  <td className="py-2 pr-2">
                    <input type="number" min={0} value={item.bultos}
                      onChange={(e) => updateItem(idx, "bultos", parseInt(e.target.value) || 0)}
                      className="w-full border-b border-gray-100 py-1 text-sm outline-none text-center focus:border-black transition" />
                  </td>
                  <td className="py-2 pr-2">
                    <input type="text" value={item.numero_guia_transp}
                      onChange={(e) => updateItem(idx, "numero_guia_transp", e.target.value)}
                      className="w-full border-b border-gray-100 py-1 text-sm outline-none focus:border-black transition" />
                  </td>
                  <td className="py-2 text-center">
                    {items.length > 1 && (
                      <button onClick={() => removeRow(idx)} className="text-gray-300 hover:text-black transition text-sm">×</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={addRow} className="text-sm text-gray-400 hover:text-black transition mt-3">
            + Agregar fila
          </button>
        </div>

        {/* Footer */}
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-6">
            <span className="text-xs uppercase tracking-widest text-gray-400">Total de bultos:</span>
            <span className="text-lg font-semibold tabular-nums">{totalBultos}</span>
          </div>
          <div>
            <label className="text-xs uppercase tracking-widest text-gray-400 block mb-2">Observaciones</label>
            <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)}
              rows={3} className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition resize-none" />
          </div>
        </div>

        <div className="flex items-center gap-6">
          <button onClick={saveGuia} disabled={saving}
            className="bg-black text-white px-6 py-2 rounded-full text-sm hover:bg-gray-800 transition disabled:opacity-40">
            {saving ? "Guardando..." : "Guardar y Ver Guía"}
          </button>
          <button onClick={() => setView("list")} className="text-sm text-gray-400 hover:text-black transition">
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
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="flex gap-4 mb-8 no-print">
          <button onClick={() => setView("list")} className="text-sm text-gray-400 hover:text-black transition">← Volver</button>
          <button onClick={() => window.print()} className="text-sm bg-black text-white px-6 py-2 rounded-full hover:bg-gray-800 transition">
            Imprimir
          </button>
        </div>

        <div id="print-document" className="border border-gray-200 rounded-lg p-8" style={{ fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>
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

          <div className="mb-8 text-xs">
            <div className="font-medium uppercase mb-1">Observaciones Generales del Envío</div>
            <div className="border border-gray-300 rounded p-2 min-h-[40px] whitespace-pre-wrap">{g.observaciones || ""}</div>
          </div>

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

          <div className="mt-8 pt-4 border-t border-gray-200 text-[9px] text-gray-400 text-center leading-relaxed">
            La firma del transportista constituye aceptación expresa de la mercancía detallada en este documento, en la cantidad y condición indicadas. Cualquier faltante o daño no reportado al momento de la recepción será responsabilidad exclusiva del transportista.
          </div>
        </div>
      </div>
    );
  }

  return null;
}
