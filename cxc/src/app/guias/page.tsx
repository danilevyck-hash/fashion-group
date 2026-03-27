"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { hasModuleAccess } from "@/lib/auth-check";

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
  monto_total: number;
  estado: string;
  guia_items?: GuiaItem[];
}

const ESTADO_OPTIONS = ["Preparando", "En tránsito", "Entregada", "Con novedad"] as const;

function estadoBadge(estado: string) {
  const colors: Record<string, string> = {
    "Preparando": "bg-gray-100 text-gray-600",
    "En tránsito": "bg-blue-50 text-blue-600",
    "Entregada": "bg-green-50 text-green-600",
    "Con novedad": "bg-red-50 text-red-600",
  };
  return colors[estado] || "bg-gray-100 text-gray-600";
}

function clientesSummary(items: GuiaItem[]): string {
  if (!items || items.length === 0) return "";
  const uniqueClientes = [...new Set(items.map((i) => i.cliente).filter(Boolean))];
  if (uniqueClientes.length === 0) return "";
  if (uniqueClientes.length === 1) return uniqueClientes[0];
  return `${uniqueClientes[0]} y ${uniqueClientes.length - 1} más`;
}

function fmtMoney(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getMonthOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("es", { year: "numeric", month: "long" });
    options.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) });
  }
  return options;
}

// ── Default lists (merged with localStorage on load) ──

const DEFAULT_TRANSPORTISTAS = ["RedNblue", "Mojica", "Transporte Sol", "Sanjur"];
const DEFAULT_CLIENTES = ["City Mall", "La Frontera Duty Free", "Jerusalem de Panama", "Plaza Los Angeles", "Golden Mall", "Multi Fashion Holding", "Kheriddine", "Bouti S.A.", "Jerusalem Duty Free", "Outlet Duty Free N2", "Outlet Duty Free N3", "Sporting Shoes N4"];
const DEFAULT_DIRECCIONES = ["Paso Canoas", "David", "Santiago", "Guabito", "Changinola"];
const DEFAULT_EMPRESAS = ["MultiFashion Holding", "Vistana International", "Fashion Shoes", "Fashion Wear", "Active Shoes", "Active Wear", "Confecciones Boston", "Joystep"];

function loadList(key: string, defaults: string[]): string[] {
  if (typeof window === "undefined") return defaults;
  try {
    const stored = JSON.parse(localStorage.getItem(key) || "[]") as string[];
    const merged = [...defaults];
    for (const s of stored) {
      if (s && !merged.includes(s)) merged.push(s);
    }
    return merged;
  } catch { return defaults; }
}

function saveList(key: string, defaults: string[], list: string[]) {
  const custom = list.filter((s) => !defaults.includes(s));
  localStorage.setItem(key, JSON.stringify(custom));
}

function emptyItem(orden: number, empresa: string): GuiaItem {
  return { orden, cliente: "", direccion: "", empresa, facturas: "", bultos: 0, numero_guia_transp: "" };
}

function fmtDate(d: string) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

type View = "list" | "form" | "print";

// ── Inline "add new" component ──

function AddNewInline({ onAdd, placeholder }: { onAdd: (v: string) => void; placeholder: string }) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-gray-300 hover:text-gray-500 transition text-xs ml-1" title="Agregar nuevo">＋</button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 ml-1">
      <input type="text" value={val} onChange={(e) => setVal(e.target.value)} placeholder={placeholder}
        className="border-b border-gray-300 py-0.5 px-1 text-xs outline-none focus:border-black w-24" autoFocus />
      <button onClick={() => { if (val.trim()) { onAdd(val.trim()); setVal(""); setOpen(false); } }}
        className="text-xs text-gray-500 hover:text-black">OK</button>
      <button onClick={() => { setVal(""); setOpen(false); }} className="text-xs text-gray-300 hover:text-black">×</button>
    </span>
  );
}

export default function GuiasPage() {
  const router = useRouter();
  const [, setRole] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [view, setView] = useState<View>("list");
  const [guias, setGuias] = useState<Guia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Set<string>>(new Set());

  // Dynamic lists
  const [transportistas, setTransportistas] = useState<string[]>(DEFAULT_TRANSPORTISTAS);
  const [clientes, setClientes] = useState<string[]>(DEFAULT_CLIENTES);
  const [direcciones, setDirecciones] = useState<string[]>(DEFAULT_DIRECCIONES);
  const [empresas, setEmpresas] = useState<string[]>(DEFAULT_EMPRESAS);

  // Form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [transportista, setTransportista] = useState("");
  const [transportistaOtro, setTransportistaOtro] = useState("");
  const [placa, setPlaca] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [items, setItems] = useState<GuiaItem[]>([emptyItem(1, DEFAULT_EMPRESAS[0])]);
  const [nextNumero, setNextNumero] = useState(1);
  const [formNumero, setFormNumero] = useState(1);
  const [saving, setSaving] = useState(false);

  // New fields
  const [montoTotal, setMontoTotal] = useState(0);
  const [estado, setEstado] = useState("Preparando");

  // Month filter
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [monthFilter, setMonthFilter] = useState(currentMonth);

  // Print state
  const [printGuia, setPrintGuia] = useState<Guia | null>(null);

  // Load dynamic lists from localStorage
  useEffect(() => {
    setTransportistas(loadList("fg_transportistas", DEFAULT_TRANSPORTISTAS));
    setClientes(loadList("fg_clientes", DEFAULT_CLIENTES));
    setDirecciones(loadList("fg_direcciones", DEFAULT_DIRECCIONES));
    setEmpresas(loadList("fg_empresas", DEFAULT_EMPRESAS));
  }, []);

  function addTransportista(name: string) {
    const updated = [...transportistas, name];
    setTransportistas(updated);
    saveList("fg_transportistas", DEFAULT_TRANSPORTISTAS, updated);
    setTransportista(name);
  }

  function addCliente(name: string) {
    const updated = [...clientes, name];
    setClientes(updated);
    saveList("fg_clientes", DEFAULT_CLIENTES, updated);
  }

  function addDireccion(name: string) {
    const updated = [...direcciones, name];
    setDirecciones(updated);
    saveList("fg_direcciones", DEFAULT_DIRECCIONES, updated);
  }

  function addEmpresa(name: string) {
    const updated = [...empresas, name];
    setEmpresas(updated);
    saveList("fg_empresas", DEFAULT_EMPRESAS, updated);
  }

  const loadGuias = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/guias");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setGuias(data);
      setNextNumero(data.length > 0 ? data[0].numero + 1 : 1);
    } catch {
      setError("Error al cargar guías");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const r = sessionStorage.getItem("cxc_role");
    if (!hasModuleAccess("guias", ["admin","upload","david","secretaria"])) {
      router.push("/");
    } else {
      setRole(r || "");
      setAuthChecked(true);
      loadGuias();
    }
  }, []);

  if (!authChecked) return null;

  const defaultEmpresa = empresas[0] || DEFAULT_EMPRESAS[0];

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

  async function startEdit(id: string) {
    const res = await fetch(`/api/guias/${id}`);
    if (!res.ok) return;
    const g = await res.json();
    setEditingId(g.id);
    setFormNumero(g.numero);
    setFecha(g.fecha);
    if (transportistas.includes(g.transportista)) {
      setTransportista(g.transportista);
      setTransportistaOtro("");
    } else {
      setTransportista("__other__");
      setTransportistaOtro(g.transportista);
    }
    setPlaca(g.placa || "");
    setObservaciones(g.observaciones || "");
    setMontoTotal(g.monto_total || 0);
    setEstado(g.estado || "Preparando");
    const guiaItems = (g.guia_items || []) as GuiaItem[];
    setItems(guiaItems.length > 0 ? guiaItems.map((item: GuiaItem, i: number) => ({ ...item, orden: i + 1 })) : [emptyItem(1, defaultEmpresa)]);
    setError(null);
    setValidationErrors(new Set());
    setView("form");
  }

  function resetForm() {
    setEditingId(null);
    setFecha(new Date().toISOString().slice(0, 10));
    setTransportista("");
    setTransportistaOtro("");
    setPlaca("");
    setObservaciones("");
    setMontoTotal(0);
    setEstado("Preparando");
    setItems([emptyItem(1, defaultEmpresa)]);
    setFormNumero(nextNumero);
    setValidationErrors(new Set());
  }

  function addRow() {
    setItems([...items, emptyItem(items.length + 1, defaultEmpresa)]);
  }

  function removeRow(idx: number) {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== idx).map((item, i) => ({ ...item, orden: i + 1 })));
  }

  function updateItem(idx: number, field: keyof GuiaItem, value: string | number) {
    setItems(items.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  }

  const totalBultos = items.reduce((s, i) => s + (i.bultos || 0), 0);

  function validate(): boolean {
    const errors = new Set<string>();
    const transp = transportista === "__other__" ? transportistaOtro : transportista;

    if (!fecha) errors.add("fecha");
    if (!transp) errors.add("transportista");

    const validItems = items.filter((i) => i.cliente || i.direccion || i.facturas || i.bultos > 0);
    if (validItems.length === 0) errors.add("items-empty");

    items.forEach((item, idx) => {
      const hasData = item.cliente || item.direccion || item.facturas || item.bultos > 0;
      if (!hasData) return;
      if (!item.cliente) errors.add(`item-${idx}-cliente`);
      if (!item.direccion) errors.add(`item-${idx}-direccion`);
      if (!item.facturas) errors.add(`item-${idx}-facturas`);
      if (!item.bultos || item.bultos <= 0) errors.add(`item-${idx}-bultos`);
    });

    setValidationErrors(errors);
    if (errors.size > 0) {
      setError("Completa todos los campos obligatorios antes de guardar.");
      return false;
    }
    return true;
  }

  function inputClass(key: string, base: string) {
    return `${base} ${validationErrors.has(key) ? "border-red-400" : ""}`;
  }

  async function saveGuia() {
    if (!validate()) return;

    const transp = transportista === "__other__" ? transportistaOtro : transportista;
    const validItems = items.filter((i) => i.cliente || i.direccion || i.facturas || i.bultos > 0);

    setSaving(true);

    const url = editingId ? `/api/guias/${editingId}` : "/api/guias";
    const method = editingId ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fecha,
        transportista: transp,
        placa,
        observaciones,
        monto_total: montoTotal,
        estado,
        items: validItems,
      }),
    });

    if (res.ok) {
      setError(null);
      const guia = await res.json();
      const guiaId = guia.id || editingId;
      const fullRes = await fetch(`/api/guias/${guiaId}`);
      if (fullRes.ok) setPrintGuia(await fullRes.json());
      resetForm();
      loadGuias();
      setView("print");
      setTimeout(() => window.print(), 600);
    } else {
      setError("Error al guardar. Verifica los datos.");
    }
    setSaving(false);
  }

  // ── LIST VIEW ──
  if (view === "list") {
    return (
      <div>
        <AppHeader module="Guías de Transporte" />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-end justify-between mb-10">
          <div>
            <h1 className="text-xl font-light tracking-tight">Guías de Transporte</h1>
            <p className="text-sm text-gray-400 mt-1">Registro de envíos con transportistas</p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <button onClick={() => { resetForm(); setFormNumero(nextNumero); setView("form"); }}
              className="text-sm bg-black text-white px-6 py-2.5 rounded-full font-medium hover:bg-gray-800 transition">
              Nueva Guía
            </button>
            <a href="/guias/nueva-movil" className="text-xs border border-gray-200 px-3 py-1.5 rounded-full hover:border-gray-400 transition flex items-center gap-1">📱 iPad</a>
            <button
              onClick={() => setShowHelp(!showHelp)}
              className="w-8 h-8 rounded-full bg-gray-50 text-gray-400 hover:bg-gray-100 text-sm flex items-center justify-center transition"
              title="Ayuda"
            >
              ?
            </button>
          </div>
        </div>

        {showHelp && (
          <div className="bg-gray-50 rounded-2xl p-6 mb-8 text-sm">
            <p className="font-medium mb-3">¿Cómo usar las Guías de Transporte?</p>
            <ol className="space-y-2 text-gray-500 list-decimal list-inside">
              <li>Haz clic en &quot;Nueva Guía&quot; para registrar un despacho</li>
              <li>Selecciona el transportista y la fecha del envío</li>
              <li>Agrega una fila por cada cliente que recibe mercancía</li>
              <li>Indica las facturas incluidas y la cantidad de bultos</li>
              <li>Guarda — se genera automáticamente el documento listo para imprimir</li>
              <li>Desde la lista puedes ver, editar, imprimir o eliminar cualquier guía</li>
            </ol>
          </div>
        )}

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        {loading ? (
          <div>{[...Array(5)].map((_, i) => <div key={i} className="flex gap-4 py-3 px-4 border-b border-gray-50"><div className="h-3 bg-gray-100 rounded animate-pulse w-1/6" /><div className="h-3 bg-gray-100 rounded animate-pulse w-1/5" /><div className="h-3 bg-gray-100 rounded animate-pulse w-1/4" /><div className="h-3 bg-gray-100 rounded animate-pulse w-1/6" /><div className="h-3 bg-gray-100 rounded animate-pulse w-1/6" /></div>)}</div>
        ) : guias.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-400">
                <rect x="1" y="3" width="15" height="13" rx="2"/>
                <path d="M16 8h4l3 5v3h-7V8z"/>
                <circle cx="5.5" cy="18.5" r="2.5"/>
                <circle cx="18.5" cy="18.5" r="2.5"/>
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-700 mb-1">No hay guías registradas</p>
            <p className="text-sm text-gray-400 mb-6">Crea tu primera guía para registrar un despacho</p>
            <button onClick={() => { resetForm(); setFormNumero(nextNumero); setView("form"); }}
              className="text-sm bg-black text-white px-6 py-2.5 rounded-full hover:bg-gray-800 transition">
              Crear primera guía
            </button>
          </div>
        ) : (<>
          <div className="flex items-end gap-6 mb-6">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por transportista, cliente o factura..."
              className="border-b border-gray-200 py-2 text-sm outline-none focus:border-black w-full max-w-sm"
            />
            <div className="flex items-center gap-2 shrink-0">
              <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400">Mes</label>
              <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)}
                className="border-b border-gray-200 py-2 text-sm outline-none bg-transparent focus:border-black transition appearance-none">
                {getMonthOptions().map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-[11px] uppercase tracking-[0.05em] text-gray-400">
                <th className="text-left py-3 px-4 font-normal">N°</th>
                <th className="text-left py-3 px-4 font-normal">Fecha</th>
                <th className="text-left py-3 px-4 font-normal">Transportista</th>
                <th className="text-left py-3 px-4 font-normal">Clientes</th>
                <th className="text-right py-3 px-4 font-normal">Bultos</th>
                <th className="text-right py-3 px-4 font-normal">Monto Total</th>
                <th className="text-left py-3 px-4 font-normal">Estado</th>
                <th className="text-right py-3 px-4 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const filtered = guias
                  .filter((g) => g.fecha && g.fecha.slice(0, 7) === monthFilter)
                  .filter((g) => { if (!search) return true; const q = search.toLowerCase(); return g.transportista.toLowerCase().includes(q) || (g.guia_items || []).some((item: GuiaItem) => (item.facturas || "").toLowerCase().includes(q) || (item.cliente || "").toLowerCase().includes(q)); });
                return (<>
                  {filtered.map((g) => (
                    <tr key={g.id} onClick={() => viewGuia(g.id)} className="border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer">
                      <td className="py-3 px-4 font-medium">{g.numero}</td>
                      <td className="py-3 px-4 text-gray-500">{fmtDate(g.fecha)}</td>
                      <td className="py-3 px-4">{g.transportista}</td>
                      <td className="py-3 px-4 text-gray-500 text-sm">{clientesSummary(g.guia_items || [])}</td>
                      <td className="py-3 px-4 text-right tabular-nums">{g.total_bultos}</td>
                      <td className="py-3 px-4 text-right tabular-nums">${fmtMoney(g.monto_total || 0)}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-block text-xs px-2.5 py-0.5 rounded-full font-medium ${estadoBadge(g.estado || "Preparando")}`}>
                          {g.estado || "Preparando"}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => startEdit(g.id)} className="text-sm text-gray-500 hover:text-black transition">Editar</button>
                        <span className="text-gray-200">·</span>
                        <button onClick={() => deleteGuia(g.id)} className="text-sm text-gray-300 hover:text-red-500 transition">Eliminar</button>
                      </td>
                    </tr>
                  ))}
                  {filtered.length > 0 && (
                    <tr className="border-t border-gray-300 bg-gray-50/60 font-medium">
                      <td className="py-3 px-4" colSpan={4}>
                        <span className="text-[11px] uppercase tracking-[0.05em] text-gray-400">Totales del mes</span>
                        <span className="ml-3 text-sm">{filtered.length} guía{filtered.length !== 1 ? "s" : ""}</span>
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums">{filtered.reduce((s, g) => s + (g.total_bultos || 0), 0)}</td>
                      <td className="py-3 px-4 text-right tabular-nums">${fmtMoney(filtered.reduce((s, g) => s + (g.monto_total || 0), 0))}</td>
                      <td colSpan={2}></td>
                    </tr>
                  )}
                </>);
              })()}
            </tbody>
          </table>
          </div>
        </>)}
      </div>
      </div>
    );
  }

  // ── FORM VIEW ──
  if (view === "form") {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
        <button onClick={() => { setView("list"); resetForm(); }} className="text-sm text-gray-400 hover:text-black transition mb-8 block">
          ← Guías
        </button>
        <div className="flex flex-wrap items-baseline gap-4 mb-10">
          <h1 className="text-xl font-light tracking-tight">
            {editingId ? "Editar" : "Nueva"} Guía de Transporte
          </h1>
          <span className="text-sm text-gray-400">N° {formNumero}</span>
        </div>

        {/* Header fields */}
        <div className="mb-10">
          <div className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-4">Información General</div>
          <div className="grid grid-cols-2 gap-x-12 gap-y-6">
            <div>
              <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-1 block">Fecha <span className="text-red-500">*</span></label>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
                className={inputClass("fecha", "w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition")} />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-1 block">
                Transportista <span className="text-red-500">*</span>
                <AddNewInline placeholder="Nombre" onAdd={addTransportista} />
              </label>
              <select value={transportista} onChange={(e) => setTransportista(e.target.value)}
                className={inputClass("transportista", "w-full border-b border-gray-200 py-2 text-sm outline-none bg-transparent focus:border-black transition appearance-none")}>
                <option value="">Seleccionar...</option>
                {transportistas.map((t) => <option key={t} value={t}>{t}</option>)}
                <option value="__other__">Otro...</option>
              </select>
              {transportista === "__other__" && (
                <input type="text" placeholder="Nombre del transportista" value={transportistaOtro}
                  onChange={(e) => setTransportistaOtro(e.target.value)}
                  className={inputClass("transportista", "w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition mt-3")} />
              )}
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-1 block">Placa / Vehículo</label>
              <input type="text" value={placa} onChange={(e) => setPlaca(e.target.value)}
                className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition" />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-1 block">Observaciones</label>
              <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)}
                rows={1} className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition resize-none" />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-1 block">Monto Total</label>
              <input type="number" min={0} step="0.01" value={montoTotal || ""} onChange={(e) => setMontoTotal(parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition" />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-1 block">Estado</label>
              <select value={estado} onChange={(e) => setEstado(e.target.value)}
                className="w-full border-b border-gray-200 py-2 text-sm outline-none bg-transparent focus:border-black transition appearance-none">
                {ESTADO_OPTIONS.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Items table */}
        <div className="mb-10">
          <div className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-4">Detalle de Envío</div>

          <datalist id="clientes-list">
            {clientes.map((c) => <option key={c} value={c} />)}
          </datalist>
          <datalist id="direcciones-list">
            {direcciones.map((d) => <option key={d} value={d} />)}
          </datalist>

          {validationErrors.has("items-empty") && (
            <p className="text-red-500 text-xs mb-3">Agrega al menos un envío con todos los campos completos.</p>
          )}

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-[11px] uppercase tracking-[0.05em] text-gray-400">
                <th className="py-3 px-4 font-normal w-10 text-left">#</th>
                <th className="py-3 px-4 font-normal text-left">
                  Cliente <span className="text-red-500">*</span>
                  <AddNewInline placeholder="Cliente" onAdd={(v) => { addCliente(v); }} />
                </th>
                <th className="py-3 px-4 font-normal text-left">
                  Dirección <span className="text-red-500">*</span>
                  <AddNewInline placeholder="Ciudad" onAdd={(v) => { addDireccion(v); }} />
                </th>
                <th className="py-3 px-4 font-normal text-left">
                  Empresa
                  <AddNewInline placeholder="Empresa" onAdd={(v) => { addEmpresa(v); }} />
                </th>
                <th className="py-3 px-4 font-normal text-left">Factura(s) <span className="text-red-500">*</span></th>
                <th className="py-3 px-4 font-normal w-20 text-center">Bultos <span className="text-red-500">*</span></th>
                <th className="py-3 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={idx} className="border-b border-gray-100">
                  <td className="py-2 text-gray-300">{idx + 1}</td>
                  <td className="py-2 pr-2">
                    <input list="clientes-list" type="text" value={item.cliente}
                      onChange={(e) => updateItem(idx, "cliente", e.target.value)}
                      className={inputClass(`item-${idx}-cliente`, "w-full border-b border-gray-100 py-1 text-sm outline-none focus:border-black transition")} />
                  </td>
                  <td className="py-2 pr-2">
                    <input list="direcciones-list" type="text" value={item.direccion}
                      onChange={(e) => updateItem(idx, "direccion", e.target.value)}
                      className={inputClass(`item-${idx}-direccion`, "w-full border-b border-gray-100 py-1 text-sm outline-none focus:border-black transition")} />
                  </td>
                  <td className="py-2 pr-2">
                    <select value={item.empresa} onChange={(e) => updateItem(idx, "empresa", e.target.value)}
                      className="w-full border-b border-gray-100 py-1 text-sm outline-none bg-transparent focus:border-black transition appearance-none">
                      {empresas.map((e) => <option key={e} value={e}>{e}</option>)}
                    </select>
                  </td>
                  <td className="py-2 pr-2">
                    <input type="text" value={item.facturas}
                      onChange={(e) => updateItem(idx, "facturas", e.target.value)}
                      className={inputClass(`item-${idx}-facturas`, "w-full border-b border-gray-100 py-1 text-sm outline-none focus:border-black transition")} />
                  </td>
                  <td className="py-2 pr-2">
                    <input type="number" min={0} value={item.bultos}
                      onChange={(e) => updateItem(idx, "bultos", parseInt(e.target.value) || 0)}
                      className={inputClass(`item-${idx}-bultos`, "w-full border-b border-gray-100 py-1 text-sm outline-none text-center focus:border-black transition")} />
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
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-[0.05em] text-gray-400">Total de bultos:</span>
            <span className="text-lg font-semibold tabular-nums">{totalBultos}</span>
          </div>
        </div>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
        <div className="flex flex-wrap items-center gap-6">
          <button onClick={saveGuia} disabled={saving || !items.some((i) => i.cliente)}
            className="bg-black text-white px-6 py-2.5 rounded-full text-sm font-medium hover:bg-gray-800 transition disabled:opacity-40">
            {saving ? "Guardando..." : editingId ? "Guardar Cambios" : "Guardar y Imprimir"}
          </button>
          <button onClick={() => { setView("list"); resetForm(); }} className="text-sm text-gray-400 hover:text-black transition">
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
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
        <div className="flex flex-wrap gap-4 mb-8 no-print">
          <button onClick={() => setView("list")} className="text-sm text-gray-400 hover:text-black transition">← Volver</button>
          <button onClick={() => window.print()} className="text-sm bg-black text-white px-6 py-2.5 rounded-full font-medium hover:bg-gray-800 transition">
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
              <span className="border-b border-gray-300 flex-1 text-center">{g.placa || "\u00A0"}</span>
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
                  <td className="border border-gray-300 px-2 py-1">&nbsp;</td>
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
