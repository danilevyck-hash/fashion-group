"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  receptor_nombre?: string;
  cedula?: string;
  firma_base64?: string;
  guia_items?: GuiaItem[];
}

function clientesSummary(items: GuiaItem[]): string {
  if (!items || items.length === 0) return "";
  const uniqueClientes = [...new Set(items.map((i) => i.cliente).filter(Boolean))];
  if (uniqueClientes.length === 0) return "";
  if (uniqueClientes.length === 1) return uniqueClientes[0];
  return `${uniqueClientes[0]} y ${uniqueClientes.length - 1} más`;
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
  const [role, setRole] = useState<string>("");
  const [authChecked, setAuthChecked] = useState(false);
  const [view, setView] = useState<View>("list");
  const [guias, setGuias] = useState<Guia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [validationErrors, setValidationErrors] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);

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
  const [observaciones, setObservaciones] = useState("");
  const [items, setItems] = useState<GuiaItem[]>([emptyItem(1, DEFAULT_EMPRESAS[0])]);
  const [nextNumero, setNextNumero] = useState(1);
  const [formNumero, setFormNumero] = useState(1);
  const [saving, setSaving] = useState(false);

  // Month filter
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [monthFilter, setMonthFilter] = useState(currentMonth);

  // Print state
  const [printGuia, setPrintGuia] = useState<Guia | null>(null);

  // Bodega completion state
  const [bPlaca, setBPlaca] = useState("");
  const [bReceptor, setBReceptor] = useState("");
  const [bCedula, setBCedula] = useState("");
  const [bSaving, setBSaving] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

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
    if (!hasModuleAccess("guias", ["admin","upload","david","secretaria","bodega"])) {
      router.push("/");
    } else {
      setRole(r || "");
      setAuthChecked(true);
      loadGuias();
    }
  }, []);

  // Canvas drawing setup
  useEffect(() => {
    if (view !== "print" || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";

    function getPos(e: MouseEvent | TouchEvent) {
      const rect = canvas.getBoundingClientRect();
      if ("touches" in e) {
        return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
      }
      return { x: (e as MouseEvent).clientX - rect.left, y: (e as MouseEvent).clientY - rect.top };
    }

    function startDraw(e: MouseEvent | TouchEvent) {
      e.preventDefault();
      isDrawingRef.current = true;
      const pos = getPos(e);
      ctx!.beginPath();
      ctx!.moveTo(pos.x, pos.y);
    }
    function draw(e: MouseEvent | TouchEvent) {
      if (!isDrawingRef.current) return;
      e.preventDefault();
      const pos = getPos(e);
      ctx!.lineTo(pos.x, pos.y);
      ctx!.stroke();
    }
    function stopDraw() { isDrawingRef.current = false; }

    canvas.addEventListener("mousedown", startDraw);
    canvas.addEventListener("mousemove", draw);
    canvas.addEventListener("mouseup", stopDraw);
    canvas.addEventListener("mouseleave", stopDraw);
    canvas.addEventListener("touchstart", startDraw, { passive: false });
    canvas.addEventListener("touchmove", draw, { passive: false });
    canvas.addEventListener("touchend", stopDraw);

    return () => {
      canvas.removeEventListener("mousedown", startDraw);
      canvas.removeEventListener("mousemove", draw);
      canvas.removeEventListener("mouseup", stopDraw);
      canvas.removeEventListener("mouseleave", stopDraw);
      canvas.removeEventListener("touchstart", startDraw);
      canvas.removeEventListener("touchmove", draw);
      canvas.removeEventListener("touchend", stopDraw);
    };
  }, [view, printGuia]);

  function clearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function isCanvasBlank(): boolean {
    const canvas = canvasRef.current;
    if (!canvas) return true;
    const ctx = canvas.getContext("2d");
    if (!ctx) return true;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] !== 0) return false;
    }
    return true;
  }

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
      const g = await res.json();
      setPrintGuia(g);
      setBPlaca(g.placa || "");
      setBReceptor(g.receptor_nombre || "");
      setBCedula(g.cedula || "");
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
    setObservaciones(g.observaciones || "");
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
    setObservaciones("");
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
        observaciones,
        estado: "Pendiente Bodega",
        items: validItems,
      }),
    });

    if (res.ok) {
      setError(null);
      const guia = await res.json();

      // Send email notification for new guias
      if (!editingId) {
        const totalB = validItems.reduce((s: number, i: { bultos: number }) => s + (i.bultos || 0), 0);
        fetch("/api/guias/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject: `📦 Nueva Guía #${guia.numero} — Pendiente Bodega`,
            body: `<h2>Guía #${guia.numero}</h2><p><strong>Transportista:</strong> ${transp}</p><p><strong>Total bultos:</strong> ${totalB}</p><p>Pendiente de completar en bodega.</p>`,
          }),
        }).catch(() => {});
      }

      resetForm();
      loadGuias();
      setView("list");
    } else {
      setError("Error al guardar. Verifica los datos.");
    }
    setSaving(false);
  }

  async function confirmarDespacho() {
    if (!printGuia) return;
    if (!bPlaca.trim()) { showToast("Ingresa la placa del vehículo"); return; }
    if (!bReceptor.trim()) { showToast("Ingresa el nombre del receptor"); return; }
    if (!bCedula.trim()) { showToast("Ingresa la cédula del receptor"); return; }
    if (isCanvasBlank()) { showToast("Se requiere la firma del receptor"); return; }

    setBSaving(true);
    const firma_base64 = canvasRef.current?.toDataURL() || "";
    const res = await fetch(`/api/guias/${printGuia.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        placa: bPlaca.trim(),
        receptor_nombre: bReceptor.trim(),
        cedula: bCedula.trim(),
        firma_base64,
        estado: "Completada",
      }),
    });

    if (res.ok) {
      const bultos = (printGuia.guia_items || []).reduce((s, i) => s + (i.bultos || 0), 0);
      fetch("/api/guias/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: `✅ Guía #${printGuia.numero} completada — Lista para imprimir`,
          body: `<h2>Guía #${printGuia.numero}</h2><p><strong>Transportista:</strong> ${printGuia.transportista}</p><p><strong>Placa:</strong> ${bPlaca.trim()}</p><p><strong>Receptor:</strong> ${bReceptor.trim()}</p><p><strong>Total bultos:</strong> ${bultos}</p>`,
        }),
      }).catch(() => {});

      showToast("Despacho confirmado");
      const fullRes = await fetch(`/api/guias/${printGuia.id}`);
      if (fullRes.ok) {
        const updated = await fullRes.json();
        setPrintGuia(updated);
        setBPlaca(updated.placa || "");
        setBReceptor(updated.receptor_nombre || "");
        setBCedula(updated.cedula || "");
      }
      loadGuias();
    } else {
      showToast("Error al guardar");
    }
    setBSaving(false);
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
          </div>
        </div>

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
                      <td className="py-3 px-4 font-medium">
                        <span className={`inline-block w-2 h-2 rounded-full mr-2 ${g.placa ? "bg-green-500" : "bg-amber-400"}`} />
                        {g.numero}
                      </td>
                      <td className="py-3 px-4 text-gray-500">{fmtDate(g.fecha)}</td>
                      <td className="py-3 px-4">{g.transportista}</td>
                      <td className="py-3 px-4 text-gray-500 text-sm">{clientesSummary(g.guia_items || [])}</td>
                      <td className="py-3 px-4 text-right tabular-nums">{g.total_bultos}</td>
                      <td className="py-3 px-4 text-right flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => startEdit(g.id)} className="text-sm text-gray-500 hover:text-black transition">Editar</button>
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
                      <td></td>
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

        {/* Observaciones */}
        <div className="mb-10">
          <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-1 block">Observaciones (opcional)</label>
          <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)}
            rows={2} className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition resize-none" />
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
            {saving ? "Guardando..." : editingId ? "Guardar Cambios" : "Guardar Guía"}
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
    const canComplete = (role === "bodega" || role === "admin") && !g.placa;

    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
        <div className="flex flex-wrap gap-4 mb-8 no-print">
          <button onClick={() => setView("list")} className="text-sm text-gray-400 hover:text-black transition">← Volver</button>
          <button onClick={() => window.print()} className="text-sm bg-black text-white px-6 py-2.5 rounded-full font-medium hover:bg-gray-800 transition">
            Imprimir
          </button>
        </div>

        {/* Bodega completion section */}
        {canComplete && (
          <div className="no-print mb-8 border border-amber-200 bg-amber-50 rounded-2xl p-6">
            <h2 className="text-sm font-medium mb-4">Completar despacho — Bodega</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-1 block">Placa / Vehículo *</label>
                <input type="text" value={bPlaca} onChange={(e) => setBPlaca(e.target.value)}
                  className="w-full border-b border-gray-300 py-2 text-sm outline-none focus:border-black transition bg-transparent" />
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-1 block">Nombre del receptor *</label>
                <input type="text" value={bReceptor} onChange={(e) => setBReceptor(e.target.value)}
                  className="w-full border-b border-gray-300 py-2 text-sm outline-none focus:border-black transition bg-transparent" />
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-1 block">Cédula del receptor *</label>
                <input type="text" value={bCedula} onChange={(e) => setBCedula(e.target.value)}
                  className="w-full border-b border-gray-300 py-2 text-sm outline-none focus:border-black transition bg-transparent" />
              </div>
            </div>
            <div className="mb-4">
              <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-2 block">Firma del receptor *</label>
              <div className="relative inline-block">
                <canvas ref={canvasRef} width={300} height={150}
                  className="border border-gray-300 rounded bg-white touch-none" />
                <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-gray-300 text-sm pointer-events-none">Firme aquí</span>
              </div>
              <div>
                <button onClick={clearCanvas} className="text-xs text-gray-400 hover:text-black transition mt-1">Limpiar firma</button>
              </div>
            </div>
            <button onClick={confirmarDespacho} disabled={bSaving}
              className="bg-black text-white px-6 py-3 rounded-full text-sm font-medium hover:bg-gray-800 transition disabled:opacity-40 w-full sm:w-auto">
              {bSaving ? "Guardando..." : "Confirmar despacho"}
            </button>
          </div>
        )}

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
              {g.placa ? (<>
                <div className="mb-4">PLACA: <span className="ml-1 font-medium">{g.placa}</span></div>
                <div className="mb-4">NOMBRE: <span className="ml-1 font-medium">{g.receptor_nombre || ""}</span></div>
                <div className="mb-4">CÉDULA: <span className="ml-1 font-medium">{g.cedula || ""}</span></div>
                <div>FIRMA: {g.firma_base64 ? <img src={g.firma_base64} alt="Firma" style={{ height: 40 }} className="inline-block ml-1" /> : <span className="border-b border-gray-400 inline-block w-48 ml-1">&nbsp;</span>}</div>
              </>) : (<>
                <div className="mb-4">NOMBRE: <span className="border-b border-gray-400 inline-block w-48 ml-1">&nbsp;</span></div>
                <div className="mb-4">CÉDULA: <span className="border-b border-gray-400 inline-block w-48 ml-1">&nbsp;</span></div>
                <div>FIRMA: <span className="border-b border-gray-400 inline-block w-48 ml-1">&nbsp;</span></div>
              </>)}
              <div className="text-gray-400 mt-2 italic">Nombre, cédula y firma</div>
            </div>
          </div>

          <div className="mt-8 pt-4 border-t border-gray-200 text-[9px] text-gray-400 text-center leading-relaxed">
            La firma del transportista constituye aceptación expresa de la mercancía detallada en este documento, en la cantidad y condición indicadas. Cualquier faltante o daño no reportado al momento de la recepción será responsabilidad exclusiva del transportista.
          </div>
        </div>

        {/* Toast */}
        {toast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-black text-white px-5 py-2.5 rounded-full text-sm z-50 shadow-lg">
            {toast}
          </div>
        )}
      </div>
    );
  }

  return null;
}
