"use client";

import { useState, useEffect, useCallback } from "react";
import AppHeader from "@/components/AppHeader";
import { fmt } from "@/lib/format";
import { useAuth } from "@/lib/hooks/useAuth";
import { Toast, SkeletonTable, EmptyState, ConfirmDeleteModal, StatusBadge, Modal } from "@/components/ui";

interface Producto { id: string; nombre: string; genero: string; color: string; precio_panama: number; rrp: number; stock_comprado: number; }
interface Cliente { id: string; nombre: string; estado?: string; }
interface Pedido { id: string; cliente_id: string; producto_id: string; paquetes: number; }

const PPQ = 13;
const TALLAS: Record<string, Record<string, number>> = {
  HOMBRE: { XS:0, S:2, M:4, L:4, XL:2, XXL:1, "3XL":0 },
  MUJER:  { XS:2, S:4, M:4, L:2, XL:1, XXL:0, "3XL":0 },
  NIÑO:   { "4":1,"6":1,"8":1,"10":2,"12":2,"14":2,"16":2,"18":2 },
};
const COLOR_MAP: Record<string, string> = { ROJA: "#CC0000", BLANCA: "#d4d4d4", "AZUL NAVY": "#001F5B" };
const GENERO_ORDER = ["HOMBRE", "MUJER", "NIÑO"];
const GENERO_BADGE: Record<string, string> = { HOMBRE: "bg-blue-100 text-blue-700", MUJER: "bg-pink-100 text-pink-700", NIÑO: "bg-amber-100 text-amber-700" };

function fmtK(n: number) { return n >= 1000 ? `$${(n/1000).toFixed(1)}k` : `$${fmt(n)}`; }
function Dot({ color, size = "sm" }: { color: string; size?: "sm" | "md" }) {
  const s = size === "md" ? "w-3 h-3" : "w-1.5 h-1.5";
  return <span className={`inline-block ${s} rounded-full flex-shrink-0`} style={{ background: COLOR_MAP[color] || "#ccc" }} />;
}

export default function CamisetasPage() {
  const { authChecked, role } = useAuth({ moduleKey: "camisetas", allowedRoles: ["admin","vendedor"] });
  const [tab, setTab] = useState<"resumen" | "cliente" | "stock">("cliente");
  const [productos, setProductos] = useState<Producto[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [selectedClient, _setSelectedClient] = useState<string | null>(null);

  // Wrapper: sincroniza selectedClient con la URL para que el Back del browser
  // regrese a la lista en lugar de saltar a /home.
  const setSelectedClient = useCallback((id: string | null) => {
    _setSelectedClient(id);
    if (typeof window === "undefined") return;
    const url = id ? `/camisetas?cliente=${id}` : "/camisetas";
    if (window.location.pathname + window.location.search !== url) {
      window.history.pushState(null, "", url);
    }
  }, []);

  // Popstate listener: al Back/Forward, sincroniza el state con la URL.
  useEffect(() => {
    function onPopState() {
      const params = new URLSearchParams(window.location.search);
      _setSelectedClient(params.get("cliente"));
    }
    window.addEventListener("popstate", onPopState);
    // Init inicial desde URL (ej. usuario llega con /camisetas?cliente=X)
    const params = new URLSearchParams(window.location.search);
    const initial = params.get("cliente");
    if (initial) _setSelectedClient(initial);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  const [editCell, setEditCell] = useState<{ cId: string; pId: string } | null>(null);
  const [editVal, setEditVal] = useState("");
  const [pendingChanges, setPendingChanges] = useState<Record<string, number>>({});
  const [savingAll, setSavingAll] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [showNewClient, setShowNewClient] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Cliente | null>(null);
  const [showMatrix, setShowMatrix] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [infoTab, setInfoTab] = useState<"precios" | "tallas">("precios");
  const [editingStock, setEditingStock] = useState(false);
  const [stockEdits, setStockEdits] = useState<Record<string, number>>({});
  const [savingStock, setSavingStock] = useState(false);
  const [stockWarningDismissed, setStockWarningDismissed] = useState(false);
  const [addingClient, setAddingClient] = useState(false);

  // Nuevo Pedido modal
  const [showNuevo, setShowNuevo] = useState(false);
  const [nuevoStep, setNuevoStep] = useState<"cliente" | "productos">("cliente");
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoQtys, setNuevoQtys] = useState<Record<string, number>>({});
  const [nuevoSaving, setNuevoSaving] = useState(false);

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3000); };

  const isVendedor = role === "vendedor";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/camisetas");
      if (res.ok) { const d = await res.json(); setProductos(d.productos || []); setClientes(d.clientes || []); setPedidos(d.pedidos || []); setStockWarningDismissed(false); }
    } catch { setToast("Error de conexión. Verifica tu internet e intenta de nuevo."); setTimeout(() => setToast(null), 3000); }
    setLoading(false);
  }, []);

  useEffect(() => { if (authChecked) load(); }, [authChecked, load]);
  if (!authChecked) return null;

  function getPaq(cId: string, pId: string) { return pedidos.find(p => p.cliente_id === cId && p.producto_id === pId)?.paquetes || 0; }
  function clientTotal(cId: string) { return pedidos.filter(p => p.cliente_id === cId).reduce((s, p) => s + p.paquetes, 0); }
  function clientValor(cId: string) { return pedidos.filter(p => p.cliente_id === cId).reduce((s, p) => { const pr = productos.find(x => x.id === p.producto_id); return s + p.paquetes * PPQ * (pr?.precio_panama || 0); }, 0); }
  function prodTotalPaq(pId: string) { return pedidos.filter(p => p.producto_id === pId).reduce((s, p) => s + p.paquetes, 0); }

  const sortedClientes = [...clientes].sort((a, b) => clientTotal(b.id) - clientTotal(a.id));
  const sortedProductos = [...productos].sort((a, b) => GENERO_ORDER.indexOf(a.genero) - GENERO_ORDER.indexOf(b.genero) || a.color.localeCompare(b.color));
  const stockProducts = [...sortedProductos].sort((a, b) => (Math.floor(a.stock_comprado/PPQ) - prodTotalPaq(a.id)) - (Math.floor(b.stock_comprado/PPQ) - prodTotalPaq(b.id)));

  const gPaq = pedidos.reduce((s, p) => s + p.paquetes, 0);
  const gVal = pedidos.reduce((s, p) => { const pr = productos.find(x => x.id === p.producto_id); return s + p.paquetes * PPQ * (pr?.precio_panama || 0); }, 0);
  const sobrev = sortedProductos.filter(p => prodTotalPaq(p.id) > Math.floor(p.stock_comprado / PPQ)).length;
  const pendientesCount = clientes.filter(c => c.estado !== "Entregado").length;

  const filteredClients = sortedClientes
    .filter(c => !clientSearch || c.nombre.toLowerCase().includes(clientSearch.toLowerCase()))
    .sort((a, b) => {
      const aEnt = a.estado === "Entregado" ? 1 : 0;
      const bEnt = b.estado === "Entregado" ? 1 : 0;
      if (aEnt !== bEnt) return aEnt - bEnt;
      return clientTotal(b.id) - clientTotal(a.id);
    });

  function checkStockWarning(pId: string, extraPaq: number = 0) {
    const prod = productos.find(x => x.id === pId);
    if (!prod) return;
    const comp = Math.floor(prod.stock_comprado / PPQ);
    const totalPaq = prodTotalPaq(pId) + extraPaq;
    if (totalPaq > comp) {
      setToast(`⚠️ Stock insuficiente para ${prod.nombre}. Disponible: ${comp} paq, Pedido: ${totalPaq} paq`);
      setTimeout(() => setToast(null), 5000);
    }
  }

  function commitCell(cId: string, pId: string, val: string) {
    const paq = parseInt(val) || 0;
    const key = `${cId}::${pId}`;
    const prevPaq = getPaq(cId, pId);
    if (paq === prevPaq) {
      // No change, remove from pending if was there
      setPendingChanges(prev => { const n = { ...prev }; delete n[key]; return n; });
    } else {
      setPendingChanges(prev => ({ ...prev, [key]: paq }));
    }
    // Update local state optimistically for immediate visual feedback
    setPedidos(prev => {
      const idx = prev.findIndex(p => p.cliente_id === cId && p.producto_id === pId);
      if (paq <= 0) return idx >= 0 ? prev.filter((_, i) => i !== idx) : prev;
      if (idx >= 0) return prev.map((p, i) => i === idx ? { ...p, paquetes: paq } : p);
      return [...prev, { id: "", cliente_id: cId, producto_id: pId, paquetes: paq }];
    });
    setEditCell(null);
  }

  async function saveAllChanges() {
    const entries = Object.entries(pendingChanges);
    if (entries.length === 0) { showToast("No hay cambios para guardar"); return; }
    setSavingAll(true);
    let failures = 0;
    let lastError = "";
    for (const [key, paq] of entries) {
      const [cId, pId] = key.split("::");
      try {
        const res = await fetch("/api/camisetas/pedido", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cliente_id: cId, producto_id: pId, paquetes: paq }) });
        if (!res.ok) { failures++; const errData = await res.json().catch(() => ({})); lastError = errData.error || `HTTP ${res.status}`; }
      } catch (e) { failures++; lastError = e instanceof Error ? e.message : "Sin conexión"; }
    }
    if (failures === 0) {
      showToast(`${entries.length} cambio${entries.length > 1 ? "s" : ""} guardado${entries.length > 1 ? "s" : ""}`);
      setPendingChanges({});
      load();
    } else {
      showToast(`Error: ${lastError}. ${failures} de ${entries.length} fallaron.`);
      load();
    }
    setSavingAll(false);
  }
  async function addClient() {
    if (!newClientName.trim() || addingClient) return;
    setAddingClient(true);
    try {
      const res = await fetch("/api/camisetas/clientes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre: newClientName.trim() }) });
      if (res.ok) {
        const created = await res.json();
        setNewClientName(""); setShowNewClient(false); showToast("Cliente creado");
        await load();
        setSelectedClient(created.id);
      }
    } finally {
      setAddingClient(false);
    }
  }
  async function deleteClient(id: string) {
    const res = await fetch(`/api/camisetas/clientes/${id}`, { method: "DELETE" });
    if (res.ok) { setSelectedClient(null); showToast("Cliente eliminado"); load(); }
    else { const err = await res.json().catch(() => null); showToast(err?.error || "No se pudo eliminar. Intenta de nuevo."); }
  }

  async function toggleEstado(id: string) {
    const cl = clientes.find(c => c.id === id);
    if (!cl) return;
    const next = cl.estado === "Entregado" ? "Pendiente" : "Entregado";
    setClientes(prev => prev.map(c => c.id === id ? { ...c, estado: next } : c));
    const res = await fetch(`/api/camisetas/clientes/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ estado: next }) });
    if (res.ok) showToast(next === "Entregado" ? "Marcado como entregado" : "Marcado como pendiente");
    else { showToast("Ocurrió un error. Intenta de nuevo."); load(); }
  }

  async function downloadClientPDF(cId: string) {
    const cl = clientes.find(c => c.id === cId);
    if (!cl) return;
    showToast("Generando PDF...");
    const { jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");
    const doc = new jsPDF("portrait");

    doc.setFillColor(26, 26, 26);
    doc.rect(0, 0, 210, 18, "F");
    doc.setFontSize(10); doc.setTextColor(255); doc.setFont("helvetica", "bold");
    doc.text("Fashion Group — Camisetas de la Selección", 14, 12);
    doc.setFontSize(7); doc.setFont("helvetica", "normal");
    doc.text(new Date().toLocaleDateString("es-PA"), 196, 12, { align: "right" });

    doc.setTextColor(26); doc.setFontSize(16); doc.setFont("helvetica", "bold");
    doc.text(cl.nombre, 14, 30);

    const clientPedidos = sortedProductos
      .map(prod => ({ prod, paq: getPaq(cId, prod.id) }))
      .filter(x => x.paq > 0);

    const tPaq = clientPedidos.reduce((s, x) => s + x.paq, 0);
    const tVal = clientPedidos.reduce((s, x) => s + x.paq * PPQ * x.prod.precio_panama, 0);

    if (isVendedor) {
      const body = clientPedidos.map(({ prod, paq }) => {
        const tallas = TALLAS[prod.genero] || {};
        const tallaStr = Object.entries(tallas).filter(([, v]) => v > 0).map(([k, v]) => `${k}:${v * paq}`).join(" ");
        return [prod.nombre, prod.genero, String(paq), String(paq * PPQ), tallaStr];
      });
      autoTable(doc, {
        startY: 36, head: [["Producto", "Género", "Paq", "Pzas", "Tallas"]], body,
        foot: [["Total", "", String(tPaq), String(tPaq * PPQ), ""]],
        styles: { fontSize: 8, cellPadding: 2 }, headStyles: { fillColor: [26, 26, 26], textColor: [255, 255, 255] },
        footStyles: { fillColor: [245, 245, 245], textColor: [26, 26, 26], fontStyle: "bold" },
      });
    } else {
      const body = clientPedidos.map(({ prod, paq }) => {
        const tallas = TALLAS[prod.genero] || {};
        const tallaStr = Object.entries(tallas).filter(([, v]) => v > 0).map(([k, v]) => `${k}:${v * paq}`).join(" ");
        return [prod.nombre, prod.genero, String(paq), String(paq * PPQ), tallaStr, `$${fmt(prod.precio_panama)}`, `$${fmt(prod.rrp)}`, `$${fmt(paq * PPQ * prod.precio_panama)}`];
      });
      autoTable(doc, {
        startY: 36, head: [["Producto", "Género", "Paq", "Pzas", "Tallas", "Precio/u", "RRP", "Subtotal"]], body,
        foot: [["Total", "", String(tPaq), String(tPaq * PPQ), "", "", "", `$${fmt(tVal)}`]],
        styles: { fontSize: 8, cellPadding: 2 }, headStyles: { fillColor: [26, 26, 26], textColor: [255, 255, 255] },
        footStyles: { fillColor: [245, 245, 245], textColor: [26, 26, 26], fontStyle: "bold" },
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fy = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(7); doc.setTextColor(160); doc.setFont("helvetica", "normal");
    if (!isVendedor) doc.text("Precios en USD · Sujeto a disponibilidad", 14, fy);
    else doc.text("Sujeto a disponibilidad", 14, fy);

    doc.save(`Camisetas-${cl.nombre.replace(/\s+/g, "-")}.pdf`);
    showToast("PDF listo — revisa tu carpeta de descargas");
  }

  // ── Nuevo Pedido handlers ──
  function openNuevo() {
    setNuevoNombre(""); setNuevoQtys({}); setNuevoStep("cliente"); setShowNuevo(true);
  }
  const nuevoExisting = nuevoNombre.trim() ? clientes.find(c => c.nombre.toLowerCase() === nuevoNombre.trim().toLowerCase()) : null;
  const nuevoTotalPaq = Object.values(nuevoQtys).reduce((s, v) => s + v, 0);
  const nuevoTotalPzas = nuevoTotalPaq * PPQ;
  const nuevoTotalVal = sortedProductos.reduce((s, p) => s + (nuevoQtys[p.id] || 0) * PPQ * p.precio_panama, 0);

  async function saveNuevo() {
    if (nuevoTotalPaq === 0) return;
    setNuevoSaving(true);
    try {
      let clienteId = nuevoExisting?.id;
      if (!clienteId) {
        const res = await fetch("/api/camisetas/clientes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre: nuevoNombre.trim() }) });
        if (res.ok) { const c = await res.json(); clienteId = c.id; }
        else { showToast("No se pudo crear el cliente. Intenta de nuevo."); setNuevoSaving(false); return; }
      }
      if (clienteId) {
        let pedidoFails = 0;
        for (const [prodId, paq] of Object.entries(nuevoQtys)) {
          if (paq > 0) {
            try {
              const r = await fetch("/api/camisetas/pedido", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cliente_id: clienteId, producto_id: prodId, paquetes: paq }) });
              if (!r.ok) pedidoFails++;
            } catch { pedidoFails++; }
          }
        }
        if (pedidoFails > 0) showToast(`${pedidoFails} producto(s) no se pudieron guardar.`);
        await load();
        setShowNuevo(false);
        setTab("resumen");
        // Check for oversold products
        const warnings = sortedProductos.filter(prod => {
          const comp = Math.floor(prod.stock_comprado / PPQ);
          const totalAfter = prodTotalPaq(prod.id) + (nuevoQtys[prod.id] || 0);
          return totalAfter > comp;
        });
        if (warnings.length > 0) {
          showToast(`⚠️ Stock insuficiente: ${warnings.map(p => p.nombre).join(", ")}`);
          setTimeout(() => setToast(null), 5000);
        } else {
          showToast(`Pedido de ${nuevoNombre.trim()} guardado`);
        }
      }
    } catch { showToast("No se pudo guardar. Intenta de nuevo."); }
    setNuevoSaving(false);
  }

  async function saveStock() {
    if (savingStock) return;
    setSavingStock(true);
    try {
      let fails = 0;
      for (const [id, stock_comprado] of Object.entries(stockEdits)) {
        const prod = productos.find(p => p.id === id);
        if (prod && prod.stock_comprado !== stock_comprado) {
          try {
            const res = await fetch(`/api/camisetas/productos/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stock_comprado }) });
            if (!res.ok) fails++;
          } catch { fails++; }
        }
      }
      if (fails > 0) showToast(`${fails} producto(s) no se pudieron actualizar.`);
      else showToast("Stock actualizado");
      setEditingStock(false);
      setStockEdits({});
      load();
    } finally {
      setSavingStock(false);
    }
  }

  const tabs = [
    { key: "resumen" as const, label: "Resumen", subtitle: "Totales por producto" },
    { key: "cliente" as const, label: "Por Cliente", subtitle: "Pedidos individuales" },
    { key: "stock" as const, label: "Stock", subtitle: "Disponibilidad" },
  ];

  return (
    <div className="min-h-screen bg-white">
      <AppHeader module="Camisetas" />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">

        {/* Title + Actions */}
        <div className="flex items-start justify-between mt-4 mb-2">
          <div>
            <h1 className="text-xl font-light tracking-tight">Camisetas Selección</h1>
            <p className="text-sm text-gray-400 mt-1">Pre-órdenes Selección Panamá</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { setShowInfo(true); setInfoTab("precios"); }} className="text-gray-400 hover:text-black transition flex-shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center" title="Info de productos">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            </button>
            <button onClick={openNuevo} className="bg-black text-white px-5 py-2.5 rounded-md text-sm font-medium hover:bg-gray-800 transition flex-shrink-0 min-h-[44px]">
              + Nuevo Pedido
            </button>
          </div>
        </div>

        {/* Stats cards */}
        {!loading && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="border border-amber-200 bg-amber-50 rounded-lg p-3">
              <div className="text-[10px] text-amber-600 uppercase tracking-widest">Pendientes</div>
              <div className="text-xl font-semibold text-amber-700 mt-1">{pendientesCount}</div>
              <div className="text-[10px] text-amber-500">de entrega</div>
            </div>
            <div className="border border-gray-200 rounded-lg p-3">
              <div className="text-[10px] text-gray-400 uppercase tracking-widest">Paquetes</div>
              <div className="text-xl font-semibold mt-1">{gPaq.toLocaleString()}</div>
              <div className="text-[10px] text-gray-400">{(gPaq * PPQ).toLocaleString()} piezas</div>
              <div className="text-[10px] text-gray-400 mt-0.5">1 paquete = 13 piezas</div>
            </div>
            {!isVendedor ? (
              <div className="border border-gray-200 rounded-lg p-3">
                <div className="text-[10px] text-gray-400 uppercase tracking-widest">Monto Total</div>
                <div className="text-xl font-semibold mt-1">{fmtK(gVal)}</div>
              </div>
            ) : (
              <div className="border border-gray-200 rounded-lg p-3">
                <div className="text-[10px] text-gray-400 uppercase tracking-widest">Desglose</div>
                <div className="text-sm mt-1 space-y-0.5">
                  {GENERO_ORDER.map(gen => {
                    const genPaq = sortedProductos.filter(p => p.genero === gen).reduce((s, p) => s + prodTotalPaq(p.id), 0);
                    return genPaq > 0 ? <div key={gen} className="flex justify-between"><span className="text-gray-500">{gen}</span><span className="font-medium tabular-nums">{genPaq} paq</span></div> : null;
                  })}
                </div>
              </div>
            )}
            {sobrev > 0 && (
              <div className="border border-red-200 bg-red-50 rounded-lg p-3">
                <div className="text-[10px] text-red-600 uppercase tracking-widest">Sobrevendidos</div>
                <div className="text-xl font-semibold text-red-600 mt-1">{sobrev}</div>
                <div className="text-[10px] text-red-500">productos</div>
              </div>
            )}
          </div>
        )}

        {/* Persistent stock warning banner */}
        {!loading && sobrev > 0 && !stockWarningDismissed && (
          <div className="mb-4 flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-red-600 text-sm font-medium">
                {sobrev} producto{sobrev > 1 ? "s" : ""} con stock insuficiente
              </span>
              <button onClick={() => setTab("stock")} className="text-xs text-red-500 underline hover:text-red-700 transition">
                Ver stock
              </button>
            </div>
            <button onClick={() => setStockWarningDismissed(true)} className="text-red-400 hover:text-red-600 transition p-1 min-w-[44px] min-h-[44px] flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-6 border-b border-gray-200">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`pb-3 text-left transition ${tab === t.key ? "text-black border-b-2 border-black" : "text-gray-400 hover:text-gray-600"}`}>
              <span className={`text-sm ${tab === t.key ? "font-medium" : ""}`}>{t.label}</span>
              <span className="block text-[10px] text-gray-400 font-normal">{t.subtitle}</span>
            </button>
          ))}
        </div>

        <div className="mt-6">
          {loading ? (
            <SkeletonTable rows={6} cols={4} />

          ) : tab === "resumen" ? (
            /* ═══ RESUMEN ═══ */
            <div>
              {/* Product summary cards */}
              <p className="text-xs text-gray-400 mb-3">Catálogo fijo — 9 productos de la Selección Panamá</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
                {sortedProductos.map(prod => {
                  const tPaq = prodTotalPaq(prod.id);
                  const comp = Math.floor(prod.stock_comprado / PPQ);
                  const disp = comp - tPaq;
                  return (
                    <div key={prod.id} className={`border rounded-lg p-4 ${disp < 0 ? "border-red-200 border-l-4 border-l-red-400" : "border-gray-200"}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <Dot color={prod.color} size="md" />
                        <span className="text-sm font-medium">{prod.nombre}</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${GENERO_BADGE[prod.genero]}`}>{prod.genero}</span>
                        {disp < 0 && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">Sobrevendido</span>}
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div><div className="text-lg font-semibold">{tPaq}</div><div className="text-[10px] text-gray-400">vendidos</div></div>
                        <div><div className="text-lg font-semibold">{comp}</div><div className="text-[10px] text-gray-400">comprados</div></div>
                        <div><div className={`text-lg font-semibold ${disp < 0 ? "text-red-600" : ""}`}>{disp}</div><div className="text-[10px] text-gray-400">disponible</div></div>
                      </div>
                      {!isVendedor && <div className="text-xs text-gray-600 mt-2 text-center">${fmt(tPaq * PPQ * prod.precio_panama)}</div>}
                      {isVendedor && <div className="text-xs text-gray-400 mt-2 text-center">{tPaq} paq · {tPaq * PPQ} pzas</div>}
                    </div>
                  );
                })}
              </div>

              {/* Collapsible detailed matrix */}
              <div className="sm:hidden bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-500 mb-4">
                Vista Resumen no disponible en móvil. Usa la pestaña <button onClick={() => setTab("cliente")} className="font-medium text-black underline">Por Cliente</button>.
              </div>
              <div className="hidden sm:block">
                <button onClick={() => setShowMatrix(!showMatrix)} className="text-sm text-gray-400 hover:text-black transition flex items-center gap-1.5 mb-3">
                  <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${showMatrix ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  Matriz de pedidos
                  <span className="text-[10px] text-gray-300 font-normal ml-1">productos vs clientes</span>
                </button>
                {showMatrix && (
                  <div className="overflow-x-auto -mx-6 px-6">
                    <p className="text-[10px] text-gray-400 mb-3">Haz click en cualquier celda para editar</p>
                    <table className="text-xs w-max min-w-full border-collapse">
                      <thead className="sticky top-0 bg-white z-10">
                        <tr>
                          <th className="sticky left-0 z-10 bg-white text-left py-3 pr-4 text-[10px] uppercase tracking-widest text-gray-400 font-normal min-w-[180px] border-b border-gray-200">Producto</th>
                          {sortedClientes.map(c => {
                            const cVal = clientValor(c.id);
                            const isEntregado = c.estado === "Entregado";
                            return (
                              <th key={c.id} className={`py-1 px-1 text-[10px] text-gray-400 font-normal text-center min-w-[44px] border-b border-gray-200 ${isEntregado ? "opacity-40" : ""}`} style={{ height: 70 }}>
                                <button onClick={() => { setSelectedClient(c.id); setTab("cliente"); }}
                                  className="hover:text-black transition whitespace-nowrap inline-block"
                                  style={{ transform: "rotate(-45deg)", transformOrigin: "center", fontSize: "9px" }}>{c.nombre}</button>
                                <div className="flex flex-col items-center gap-0.5 mt-0.5">
                                  <span className={`text-[8px] px-1 py-0 rounded-full ${isEntregado ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                                    {isEntregado ? "✓" : "○"}
                                  </span>
                                  {!isVendedor && cVal > 0 && <span className="text-[8px] text-gray-400 tabular-nums">${(cVal/1000).toFixed(1)}k</span>}
                                </div>
                              </th>
                            );
                          })}
                          <th className="py-3 px-3 text-[10px] uppercase tracking-widest text-gray-400 font-normal text-right border-l border-gray-200 border-b border-gray-200 bg-gray-50">Paq</th>
                          <th className="py-3 px-3 text-[10px] uppercase tracking-widest text-gray-400 font-normal text-right border-b border-gray-200 bg-gray-50">Pzas</th>
                          {!isVendedor && <th className="py-3 px-3 text-[10px] uppercase tracking-widest text-gray-400 font-normal text-right border-b border-gray-200 bg-gray-50">Valor</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {GENERO_ORDER.map((gen, gi) => {
                          const genProds = sortedProductos.filter(p => p.genero === gen);
                          return [
                            gi > 0 && <tr key={`s-${gen}`}><td colSpan={sortedClientes.length + (isVendedor ? 3 : 4)} className="h-1" /></tr>,
                            ...genProds.map((prod, pi) => {
                              const tPaq = prodTotalPaq(prod.id);
                              const isOdd = pi % 2 === 1;
                              return (
                                <tr key={prod.id} className={`${isOdd ? "bg-gray-50/60" : ""} hover:bg-blue-50/40 transition-colors`}>
                                  <td className={`sticky left-0 z-10 ${isOdd ? "bg-gray-50" : "bg-white"} py-2 pr-4 border-b border-gray-200`}>
                                    <span className="flex items-center gap-2">
                                      <Dot color={prod.color} />
                                      <span className="font-medium">{prod.nombre}</span>
                                      <span className="text-[9px] text-gray-400">{prod.genero}</span>
                                    </span>
                                  </td>
                                  {sortedClientes.map(c => {
                                    const paq = getPaq(c.id, prod.id);
                                    const editing = editCell?.cId === c.id && editCell?.pId === prod.id;
                                    return (
                                      <td key={c.id} className="py-1 px-0.5 text-center border-b border-gray-200 hover:bg-gray-50 transition">
                                        {editing ? (
                                          <input type="text" inputMode="numeric" value={editVal}
                                            onChange={e => setEditVal(e.target.value.replace(/\D/g, ""))}
                                            onBlur={() => commitCell(c.id, prod.id, editVal)}
                                            onKeyDown={e => { if (e.key === "Enter") { commitCell(c.id, prod.id, editVal); } if (e.key === "Escape") setEditCell(null); }}
                                            placeholder="#"
                                            className="w-10 text-center border border-black rounded text-xs py-0.5 outline-none bg-white" autoFocus />
                                        ) : paq > 0 ? (
                                          <button onClick={() => { setEditCell({ cId: c.id, pId: prod.id }); setEditVal(String(paq)); }}
                                            title="Click para editar"
                                            className={`inline-block rounded px-1.5 py-0.5 text-[10px] tabular-nums font-medium transition min-w-[22px] ${pendingChanges[`${c.id}::${prod.id}`] !== undefined ? "bg-amber-500 text-white" : "bg-gray-800 text-white hover:bg-gray-600"}`}>{paq}</button>
                                        ) : (
                                          <button onClick={() => { setEditCell({ cId: c.id, pId: prod.id }); setEditVal(""); }}
                                            title="Click para editar"
                                            className={`text-[10px] cursor-pointer hover:bg-gray-100 transition ${pendingChanges[`${c.id}::${prod.id}`] !== undefined ? "text-amber-500 font-bold" : "text-gray-200 hover:text-gray-400"}`}>—</button>
                                        )}
                                      </td>
                                    );
                                  })}
                                  <td className="py-2 px-3 text-right tabular-nums font-semibold border-l border-gray-200 border-b border-gray-200 bg-gray-50/60">{tPaq}</td>
                                  <td className="py-2 px-3 text-right tabular-nums text-gray-500 border-b border-gray-200 bg-gray-50/60">{tPaq * PPQ}</td>
                                  {!isVendedor && <td className="py-2 px-3 text-right tabular-nums border-b border-gray-200 bg-gray-50/60">${fmt(tPaq * PPQ * prod.precio_panama)}</td>}
                                </tr>
                              );
                            }),
                          ];
                        })}
                        <tr className="border-t-2 border-gray-300">
                          <td className="sticky left-0 z-10 bg-white py-3 pr-4 font-semibold">Total</td>
                          {sortedClientes.map(c => { const t = clientTotal(c.id); return <td key={c.id} className="py-3 px-1 text-center tabular-nums text-[10px] font-medium text-gray-500">{t || ""}</td>; })}
                          <td className="py-3 px-3 text-right tabular-nums font-bold border-l border-gray-200 bg-gray-50">{gPaq}</td>
                          <td className="py-3 px-3 text-right tabular-nums text-gray-500 font-medium bg-gray-50">{gPaq * PPQ}</td>
                          {!isVendedor && <td className="py-3 px-3 text-right tabular-nums font-bold bg-gray-50">${fmt(gVal)}</td>}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

          ) : tab === "cliente" ? (
            /* ═══ POR CLIENTE ═══ */
            <div>
              {!selectedClient ? (
                <div>
                  <div className="flex items-center justify-between mb-4 gap-3">
                    <input value={clientSearch} onChange={e => setClientSearch(e.target.value)}
                      placeholder="Buscar cliente..."
                      className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition min-h-[44px]" />
                    <button onClick={() => setShowNewClient(!showNewClient)} className="text-gray-400 hover:text-black transition text-sm flex-shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center">+ Nuevo</button>
                  </div>
                  {showNewClient && (
                    <div className="flex gap-2 mb-4">
                      <input value={newClientName} onChange={e => setNewClientName(e.target.value)} placeholder="Nombre del cliente" onKeyDown={e => { if (e.key === "Enter") addClient(); }}
                        className="flex-1 border-b border-gray-200 py-2 text-sm outline-none focus:border-black min-h-[44px]" autoFocus />
                      <button onClick={addClient} disabled={addingClient} className="text-sm text-gray-500 hover:text-black px-3 min-h-[44px] min-w-[44px] disabled:opacity-50">{addingClient ? "..." : "OK"}</button>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {filteredClients.map(c => {
                      const tPaq = clientTotal(c.id);
                      const tVal = clientValor(c.id);
                      const isEntregado = c.estado === "Entregado";
                      return (
                        <div key={c.id} onClick={() => setSelectedClient(c.id)}
                          className={`border rounded-lg p-4 cursor-pointer hover:border-gray-300 transition active:scale-[0.98] ${isEntregado ? "opacity-60 border-gray-200" : "border-gray-200"}`}>
                          <div className="flex items-start justify-between mb-2">
                            <h3 className="text-sm font-medium">{c.nombre}</h3>
                            <StatusBadge estado={isEntregado ? "Entregado" : "Pendiente"} />
                          </div>
                          <div className="flex gap-4 text-xs text-gray-500">
                            <span>{tPaq} paq</span>
                            <span>{tPaq * PPQ} pzas</span>
                            {!isVendedor && <span className="font-medium">${fmt(tVal)}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (() => {
                const cl = clientes.find(c => c.id === selectedClient);
                if (!cl) return null;
                const tPaq = pedidos.filter(p => p.cliente_id === selectedClient).reduce((s, p) => s + p.paquetes, 0);
                const tVal = pedidos.filter(p => p.cliente_id === selectedClient).reduce((s, p) => { const pr = productos.find(x => x.id === p.producto_id); return s + p.paquetes * PPQ * (pr?.precio_panama || 0); }, 0);
                const isEntregado = cl.estado === "Entregado";

                return (
                  <div>
                    {/* Back button */}
                    <button onClick={() => setSelectedClient(null)} className="text-sm text-gray-400 hover:text-black transition mb-4 min-h-[44px] flex items-center">
                      ← Clientes
                    </button>

                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-2xl font-light">{cl.nombre}</h2>
                        <p className="text-sm text-gray-500 mt-1">{tPaq} paq · {tPaq * PPQ} pzas{!isVendedor && <> · ${fmt(tVal)}</>}</p>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-wrap items-center gap-2 mt-4">
                      <button onClick={() => toggleEstado(cl.id)}
                        className={`px-4 py-2.5 rounded-md text-sm transition min-h-[44px] ${isEntregado ? "border border-gray-200 text-gray-600 hover:border-gray-400" : "bg-green-600 text-white hover:bg-green-700"}`}>
                        {isEntregado ? "Marcar como Pendiente" : "Marcar como Entregado"}
                      </button>
                      {tPaq > 0 && (
                        <button onClick={() => downloadClientPDF(selectedClient)} className="border border-gray-200 px-4 py-2.5 rounded-md text-sm hover:border-gray-400 transition min-h-[44px]">
                          Imprimir Pedido
                        </button>
                      )}
                      <div className="relative group ml-auto">
                        <button className="text-gray-300 hover:text-gray-600 transition min-h-[44px] min-w-[44px] flex items-center justify-center text-lg" title="Más opciones">···</button>
                        <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 hidden group-hover:block z-20 min-w-[200px]">
                          <button onClick={() => setDeleteTarget(cl)} className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition">
                            Eliminar cliente y pedidos
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="mt-6">
                      {GENERO_ORDER.map(gen => {
                        const genProds = sortedProductos.filter(p => p.genero === gen);
                        if (genProds.length === 0) return null;
                        return (
                          <div key={gen} className="mb-4">
                            <div className="text-[10px] uppercase tracking-widest text-gray-400 py-2">{gen}</div>
                            {genProds.map(prod => {
                              const paq = getPaq(selectedClient, prod.id);
                              const tallas = TALLAS[prod.genero] || {};
                              const tallaStr = paq > 0 ? Object.entries(tallas).filter(([, v]) => v > 0).map(([k, v]) => `${k}:${v * paq}`).join(" ") : "";
                              const prodComp = Math.floor(prod.stock_comprado / PPQ);
                              const prodPedido = prodTotalPaq(prod.id);
                              const isOversold = prodPedido > prodComp;
                              return (
                                <div key={prod.id} className={`flex items-center py-2.5 border-b border-gray-200 gap-3 ${paq === 0 ? "opacity-40" : ""} ${isOversold && paq > 0 ? "border-l-4 border-l-red-400 pl-2" : ""}`}>
                                  <Dot color={prod.color} />
                                  <span className="text-sm flex-1">{prod.nombre}</span>
                                  <input type="number" min={0} step={1} defaultValue={paq} key={`${selectedClient}-${prod.id}-${paq}`}
                                    inputMode="numeric"
                                    onBlur={e => {
                                      const v = parseInt(e.target.value) || 0;
                                      if (v !== paq && selectedClient) commitCell(selectedClient, prod.id, String(v));
                                    }}
                                    onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                    className="w-14 text-center border border-gray-200 rounded-lg text-sm py-2 outline-none focus:border-black tabular-nums min-h-[44px]" />
                                  <span className="text-xs text-gray-400 tabular-nums w-10">{paq > 0 ? `${paq * PPQ}pz` : "— pz"}</span>
                                  <span className="text-[10px] text-gray-400 font-mono w-32 hidden sm:block">{tallaStr || "—"}</span>
                                  {!isVendedor && <span className="text-xs tabular-nums w-16 text-right">{paq > 0 ? `$${fmt(paq * PPQ * prod.precio_panama)}` : "—"}</span>}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>

          ) : (
            /* ═══ STOCK ═══ */
            <div>
              {!isVendedor && (
                <div className="flex justify-end mb-4 gap-2">
                  {editingStock ? (<>
                    <button onClick={() => { setEditingStock(false); setStockEdits({}); }} className="border border-gray-200 px-4 py-2.5 rounded-md text-sm hover:border-gray-400 transition min-h-[44px]">Cancelar</button>
                    <button onClick={saveStock} disabled={savingStock} className="bg-black text-white px-4 py-2.5 rounded-md text-sm hover:bg-gray-800 transition disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]">{savingStock ? "Guardando..." : "Guardar Stock"}</button>
                  </>) : (
                    <button onClick={() => { setEditingStock(true); const edits: Record<string, number> = {}; productos.forEach(p => { edits[p.id] = p.stock_comprado; }); setStockEdits(edits); }} className="border border-gray-200 px-4 py-2.5 rounded-md text-sm hover:border-gray-400 transition min-h-[44px]">Editar Stock</button>
                  )}
                </div>
              )}
              {stockProducts.map(prod => {
                const ped = prodTotalPaq(prod.id);
                const comp = Math.floor(prod.stock_comprado / PPQ);
                const disp = comp - ped;
                const pct = comp > 0 ? Math.min((ped / comp) * 100, 100) : 0;
                const barColor = disp < 0 ? "bg-red-500" : disp < comp * 0.2 ? "bg-amber-400" : "bg-gray-900";

                return (
                  <div key={prod.id} className={`flex items-center py-3 border-b border-gray-200 gap-4 ${disp < 0 ? "border-l-4 border-l-red-400 pl-2 bg-red-50/30" : ""}`}>
                    <div className="flex items-center gap-2 w-48 flex-shrink-0">
                      <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ background: COLOR_MAP[prod.color] || "#ccc" }} />
                      <div>
                        <span className="text-sm">{prod.nombre}</span>
                        <span className="text-[10px] text-gray-400 ml-1">{prod.genero}</span>
                        {!isVendedor && <div className="text-[10px] text-gray-600">${fmt(prod.precio_panama)} · RRP ${fmt(prod.rrp)}</div>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-1">
                      <div className="w-32 h-1 bg-gray-200 rounded-full overflow-hidden flex-shrink-0">
                        <div className={`h-full ${barColor} rounded-full`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[10px] text-gray-400 tabular-nums w-16">{ped}/{comp} paq</span>
                    </div>
                    {editingStock && (
                      <div className="flex items-center gap-1 w-28 flex-shrink-0">
                        <input type="number" min={0} value={stockEdits[prod.id] ?? prod.stock_comprado}
                          inputMode="numeric"
                          onChange={e => setStockEdits(prev => ({ ...prev, [prod.id]: parseInt(e.target.value) || 0 }))}
                          className="w-20 text-center border border-gray-200 rounded py-2 text-xs outline-none focus:border-black tabular-nums min-h-[44px]" />
                        <span className="text-[10px] text-gray-400">pzas</span>
                      </div>
                    )}
                    <div className="text-right w-24 flex-shrink-0">
                      <span className={`text-sm font-medium tabular-nums ${disp < 0 ? "text-red-600" : "text-black"}`}>{disp}</span>
                      <span className="text-xs text-gray-400 ml-1">disponibles</span>
                      {disp < 0 && <span className="text-[10px] text-red-500 block">⚠ −{Math.abs(disp)} paq</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ═══ NUEVO PEDIDO MODAL ═══ */}
      {showNuevo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowNuevo(false)}>
          <div className="bg-white rounded-lg p-5 sm:p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* Step indicator */}
            <div className="flex items-center justify-center gap-3 mb-5">
              <div className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${nuevoStep === "cliente" ? "bg-black text-white" : "bg-green-600 text-white"}`}>
                  {nuevoStep === "cliente" ? "1" : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                </div>
                <span className={`text-xs ${nuevoStep === "cliente" ? "text-black font-medium" : "text-gray-400"}`}>Cliente</span>
              </div>
              <div className={`w-8 h-px ${nuevoStep === "productos" ? "bg-black" : "bg-gray-200"}`} />
              <div className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${nuevoStep === "productos" ? "bg-black text-white" : "bg-gray-200 text-gray-400"}`}>
                  2
                </div>
                <span className={`text-xs ${nuevoStep === "productos" ? "text-black font-medium" : "text-gray-400"}`}>Cantidades</span>
              </div>
            </div>

            {nuevoStep === "cliente" ? (<>
              <h2 className="text-lg font-medium mb-1">Nuevo Pedido</h2>
              <p className="text-xs text-gray-400 mb-4">Paso 1 de 2: Selecciona cliente</p>
              <div>
                <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-1 block">Nombre del cliente</label>
                <input value={nuevoNombre} onChange={e => setNuevoNombre(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && nuevoNombre.trim()) setNuevoStep("productos"); }}
                  placeholder="Ej: City Mall" autoFocus
                  inputMode="text"
                  className="w-full border-b border-gray-200 py-3 text-lg outline-none focus:border-black transition min-h-[44px]" />
              </div>
              {nuevoExisting && (
                <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
                  Este cliente ya existe — se agregarán productos a su pedido
                </div>
              )}
              {nuevoNombre.trim() && !nuevoExisting && clientes.filter(c => c.nombre.toLowerCase().includes(nuevoNombre.trim().toLowerCase())).length > 0 && (
                <div className="mt-2 space-y-1">
                  {clientes.filter(c => c.nombre.toLowerCase().includes(nuevoNombre.trim().toLowerCase())).slice(0, 3).map(c => (
                    <button key={c.id} onClick={() => setNuevoNombre(c.nombre)} className="block w-full text-left text-xs text-gray-500 hover:text-black py-2 px-2 rounded hover:bg-gray-50 transition min-h-[44px]">
                      {c.nombre}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-2 mt-6">
                <button onClick={() => setShowNuevo(false)} className="flex-1 py-3 border border-gray-200 rounded-full text-sm hover:border-gray-400 transition min-h-[44px]">Cancelar</button>
                <button onClick={() => setNuevoStep("productos")} disabled={!nuevoNombre.trim()}
                  className="flex-1 py-3 bg-black text-white rounded-full text-sm hover:bg-gray-800 transition disabled:opacity-50 min-h-[44px]">
                  Continuar
                </button>
              </div>
            </>) : (<>
              <div className="flex items-center gap-2 mb-1">
                <button onClick={() => setNuevoStep("cliente")} className="text-gray-400 hover:text-black transition min-w-[44px] min-h-[44px] flex items-center justify-center -ml-2">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <h2 className="text-lg font-medium">Pedido para {nuevoNombre.trim()}</h2>
              </div>
              <p className="text-xs text-gray-400 mb-4 ml-10">Paso 2 de 2: Cantidades por producto</p>

              {/* Mobile: list view */}
              <div className="block sm:hidden space-y-2">
                {GENERO_ORDER.map(gen => {
                  const genProds = sortedProductos.filter(p => p.genero === gen);
                  if (genProds.length === 0) return null;
                  return (
                    <div key={gen}>
                      <div className="text-[10px] uppercase tracking-widest text-gray-400 py-2">{gen}</div>
                      {genProds.map(prod => {
                        const q = nuevoQtys[prod.id] || 0;
                        return (
                          <div key={prod.id} className={`flex items-center gap-3 py-2.5 border-b border-gray-100 ${q > 0 ? "bg-gray-50/50" : ""}`}>
                            <Dot color={prod.color} size="md" />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">{prod.nombre}</div>
                              {!isVendedor && <div className="text-[10px] text-gray-500">${fmt(prod.precio_panama)}/u</div>}
                            </div>
                            <input type="number" min={0} step={1} value={q}
                              inputMode="numeric"
                              onChange={e => setNuevoQtys(prev => ({ ...prev, [prod.id]: parseInt(e.target.value) || 0 }))}
                              className="w-16 text-center border border-gray-200 rounded-lg py-2 text-sm outline-none focus:border-black transition tabular-nums min-h-[44px]" />
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>

              {/* Tablet/Desktop: card grid */}
              <div className="hidden sm:grid sm:grid-cols-3 gap-3">
                {sortedProductos.map(prod => {
                  const q = nuevoQtys[prod.id] || 0;
                  return (
                    <div key={prod.id} className={`border rounded-lg p-3 transition ${q > 0 ? "border-black bg-gray-50" : "border-gray-200"}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <Dot color={prod.color} size="md" />
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{prod.nombre}</div>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${GENERO_BADGE[prod.genero] || "bg-gray-100 text-gray-600"}`}>{prod.genero}</span>
                        </div>
                      </div>
                      {!isVendedor && <div className="text-[10px] text-gray-600 mb-2">${fmt(prod.precio_panama)}/u</div>}
                      <input type="number" min={0} step={1} value={q}
                        inputMode="numeric"
                        onChange={e => setNuevoQtys(prev => ({ ...prev, [prod.id]: parseInt(e.target.value) || 0 }))}
                        className="w-full text-center border border-gray-200 rounded-lg py-2 text-sm outline-none focus:border-black transition tabular-nums min-h-[44px]" />
                    </div>
                  );
                })}
              </div>
              {/* Running total */}
              <div className="mt-4 bg-gray-50 rounded-lg px-4 py-3 text-sm">
                <span className="font-medium">{nuevoTotalPaq}</span> paq · <span>{nuevoTotalPzas}</span> pzas
                {!isVendedor && <> · <span className="font-medium">${fmt(nuevoTotalVal)}</span></>}
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={() => setShowNuevo(false)} className="flex-1 py-3 border border-gray-200 rounded-full text-sm hover:border-gray-400 transition min-h-[44px]">Cancelar</button>
                <button onClick={saveNuevo} disabled={nuevoSaving || nuevoTotalPaq === 0}
                  className="flex-1 py-3 bg-black text-white rounded-full text-sm hover:bg-gray-800 transition disabled:opacity-50 min-h-[44px]">
                  {nuevoSaving ? "Guardando..." : "Guardar Pedido"}
                </button>
              </div>
            </>)}
          </div>
        </div>
      )}

      {/* Info Producto Modal */}
      <Modal open={showInfo} onClose={() => setShowInfo(false)} title="Info del Producto" maxWidth="max-w-lg">
        <div className="flex gap-4 border-b border-gray-200 mb-4">
          <button onClick={() => setInfoTab("precios")} className={`pb-2 text-sm transition ${infoTab === "precios" ? "text-black font-medium border-b-2 border-black" : "text-gray-400"}`}>Precios</button>
          <button onClick={() => setInfoTab("tallas")} className={`pb-2 text-sm transition ${infoTab === "tallas" ? "text-black font-medium border-b-2 border-black" : "text-gray-400"}`}>Curvas de Tallas</button>
        </div>
        {infoTab === "precios" ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white z-10"><tr className="border-b border-gray-200 text-[10px] uppercase tracking-widest text-gray-400">
                <th className="text-left pb-2 font-medium">Item</th>
                <th className="text-left pb-2 font-medium">Género</th>
                <th className="text-right pb-2 font-medium">Precio Panamá</th>
                <th className="text-right pb-2 font-medium">Precio Sugerido</th>
              </tr></thead>
              <tbody>
                {GENERO_ORDER.flatMap(gen =>
                  sortedProductos.filter(p => p.genero === gen).map(p => (
                    <tr key={p.id} className="border-b border-gray-200">
                      <td className="py-2 flex items-center gap-2"><Dot color={p.color} />{p.nombre}</td>
                      <td className="py-2"><span className={`text-[10px] px-1.5 py-0.5 rounded-full ${GENERO_BADGE[p.genero]}`}>{p.genero}</span></td>
                      <td className="py-2 text-right tabular-nums">${fmt(p.precio_panama)}</td>
                      <td className="py-2 text-right tabular-nums">${fmt(p.rrp)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="space-y-4">
            {GENERO_ORDER.map(gen => (
              <div key={gen}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${GENERO_BADGE[gen]}`}>{gen}</span>
                  <span className="text-xs text-gray-400">{PPQ} piezas por paquete</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(TALLAS[gen]).map(([talla, qty]) => (
                    <div key={talla} className={`border rounded-lg px-3 py-2 text-center min-w-[48px] ${qty > 0 ? "border-gray-200" : "border-gray-200 opacity-40"}`}>
                      <div className="text-xs font-medium">{talla}</div>
                      <div className="text-lg font-semibold tabular-nums">{qty}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <button onClick={() => setShowInfo(false)} className="mt-4 w-full py-2.5 border rounded-md text-sm hover:bg-gray-50 transition">Cerrar</button>
      </Modal>

      {/* Sticky save bar when there are pending changes */}
      {Object.keys(pendingChanges).length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-amber-50 border-t-2 border-amber-400 px-4 py-3 flex items-center justify-between z-40 safe-bottom">
          <span className="text-sm font-semibold text-amber-800">⚠ {Object.keys(pendingChanges).length} cambio{Object.keys(pendingChanges).length > 1 ? "s" : ""} sin guardar</span>
          <div className="flex gap-2">
            <button onClick={() => { setPendingChanges({}); load(); }} className="text-sm text-gray-400 hover:text-gray-600 px-3 py-2 transition">Descartar</button>
            <button onClick={saveAllChanges} disabled={savingAll}
              className="bg-black text-white text-sm font-medium px-6 py-2 rounded-md hover:bg-gray-800 active:scale-[0.97] transition disabled:opacity-50 min-h-[44px]">
              {savingAll ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        </div>
      )}

      <Toast message={toast} />
      <ConfirmDeleteModal
        open={!!deleteTarget}
        title={`¿Eliminar cliente ${deleteTarget?.nombre || ""}?`}
        description="Se cancelará el pedido de este cliente. Los datos se preservan internamente."
        onConfirm={() => { if (deleteTarget) { deleteClient(deleteTarget.id); setDeleteTarget(null); } }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
