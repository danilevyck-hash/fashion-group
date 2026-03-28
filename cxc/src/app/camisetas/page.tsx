"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { hasModuleAccess } from "@/lib/auth-check";

interface Producto { id: string; nombre: string; genero: string; color: string; precio_panama: number; rrp: number; stock_comprado: number; }
interface Cliente { id: string; nombre: string; }
interface Pedido { id: string; cliente_id: string; producto_id: string; paquetes: number; }

const PPQ = 13;
const TALLAS: Record<string, Record<string, number>> = {
  HOMBRE: { XS:0, S:2, M:4, L:4, XL:2, XXL:1, "3XL":0 },
  MUJER:  { XS:2, S:4, M:4, L:2, XL:1, XXL:0, "3XL":0 },
  NIÑO:   { "4":1,"6":1,"8":1,"10":2,"12":2,"14":2,"16":2,"18":2 },
};
const COLOR_MAP: Record<string, string> = { ROJA: "#CC0000", BLANCA: "#d4d4d4", "AZUL NAVY": "#001F5B" };
const GENERO_ORDER = ["HOMBRE", "MUJER", "NIÑO"];

function fmt(n: number) { return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtK(n: number) { return n >= 1000 ? `$${(n/1000).toFixed(1)}k` : `$${fmt(n)}`; }
function Dot({ color }: { color: string }) {
  return <span className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: COLOR_MAP[color] || "#ccc" }} />;
}

export default function CamisetasPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [role, setRole] = useState("");
  const [tab, setTab] = useState<"resumen" | "cliente" | "stock">("resumen");
  const [productos, setProductos] = useState<Producto[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [editCell, setEditCell] = useState<{ cId: string; pId: string } | null>(null);
  const [editVal, setEditVal] = useState(0);
  const [newClientName, setNewClientName] = useState("");
  const [showNewClient, setShowNewClient] = useState(false);
  const [clientSearch, setClientSearch] = useState("");

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2500); };

  useEffect(() => {
    const r = sessionStorage.getItem("cxc_role") || "";
    if (!hasModuleAccess("camisetas", ["admin","vendedor","secretaria"])) { router.push("/"); return; }
    setRole(r);
    setAuthChecked(true);
  }, [router]);

  const isVendedor = role === "vendedor";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/camisetas");
      if (res.ok) { const d = await res.json(); setProductos(d.productos || []); setClientes(d.clientes || []); setPedidos(d.pedidos || []); }
    } catch { /* */ }
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

  async function savePedido(cId: string, pId: string, paq: number) {
    // Update local state immediately
    setPedidos(prev => {
      const idx = prev.findIndex(p => p.cliente_id === cId && p.producto_id === pId);
      if (paq <= 0) {
        return idx >= 0 ? prev.filter((_, i) => i !== idx) : prev;
      }
      if (idx >= 0) return prev.map((p, i) => i === idx ? { ...p, paquetes: paq } : p);
      return [...prev, { id: "", cliente_id: cId, producto_id: pId, paquetes: paq }];
    });
    setEditCell(null);

    // Save to API
    const res = await fetch("/api/camisetas/pedido", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cliente_id: cId, producto_id: pId, paquetes: paq }) });
    if (res.ok) {
      showToast("Guardado");
    } else {
      showToast("Error al guardar");
      load(); // reload on error to restore correct state
    }
  }
  async function addClient() {
    if (!newClientName.trim()) return;
    const res = await fetch("/api/camisetas/clientes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre: newClientName.trim() }) });
    if (res.ok) {
      const created = await res.json();
      setNewClientName(""); setShowNewClient(false); showToast("Cliente creado");
      await load();
      setSelectedClient(created.id);
    }
  }
  async function deleteClient(id: string, nombre: string) {
    if (!confirm(`¿Eliminar ${nombre}? Se borrarán todos sus pedidos.`)) return;
    const res = await fetch(`/api/camisetas/clientes/${id}`, { method: "DELETE" });
    if (res.ok) { setSelectedClient(null); showToast("Cliente eliminado"); load(); }
    else showToast("Error al eliminar");
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
        startY: 36,
        head: [["Producto", "Género", "Paq", "Pzas", "Tallas"]],
        body,
        foot: [["Total", "", String(tPaq), String(tPaq * PPQ), ""]],
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [26, 26, 26], textColor: [255, 255, 255] },
        footStyles: { fillColor: [245, 245, 245], textColor: [26, 26, 26], fontStyle: "bold" },
      });
    } else {
      const body = clientPedidos.map(({ prod, paq }) => {
        const tallas = TALLAS[prod.genero] || {};
        const tallaStr = Object.entries(tallas).filter(([, v]) => v > 0).map(([k, v]) => `${k}:${v * paq}`).join(" ");
        return [prod.nombre, prod.genero, String(paq), String(paq * PPQ), tallaStr, `$${fmt(prod.precio_panama)}`, `$${fmt(paq * PPQ * prod.precio_panama)}`];
      });
      autoTable(doc, {
        startY: 36,
        head: [["Producto", "Género", "Paq", "Pzas", "Tallas", "Precio/u", "Subtotal"]],
        body,
        foot: [["Total", "", String(tPaq), String(tPaq * PPQ), "", "", `$${fmt(tVal)}`]],
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [26, 26, 26], textColor: [255, 255, 255] },
        footStyles: { fillColor: [245, 245, 245], textColor: [26, 26, 26], fontStyle: "bold" },
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fy = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(7); doc.setTextColor(160); doc.setFont("helvetica", "normal");
    if (!isVendedor) doc.text("Precios en USD · Sujeto a disponibilidad", 14, fy);
    else doc.text("Sujeto a disponibilidad", 14, fy);

    doc.save(`Camisetas-${cl.nombre.replace(/\s+/g, "-")}.pdf`);
    showToast("PDF descargado");
  }

  const tabs = [
    { key: "resumen" as const, label: "Resumen" },
    { key: "cliente" as const, label: "Por Cliente" },
    { key: "stock" as const, label: "Stock" },
  ];

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* Nav */}
        <Link href="/plantillas" className="text-xs text-gray-400 hover:text-gray-600 transition">← Inicio</Link>

        {/* Title */}
        <h1 className="text-3xl font-light tracking-tight mt-4">Camisetas Reebok</h1>
        <p className="text-sm text-gray-400 mt-1">Selección Panamá · {new Date().toLocaleDateString("es-PA")}</p>

        {/* Inline stats */}
        {!loading && (
          <p className="text-sm text-gray-500 mt-3">
            {gPaq.toLocaleString()} paq&ensp;·&ensp;{(gPaq * PPQ).toLocaleString()} pzas
            {!isVendedor && <>&ensp;·&ensp;{fmtK(gVal)}</>}
            {sobrev > 0 && <span className="text-red-600 ml-1">&ensp;·&ensp;{sobrev} sobrevendidos</span>}
          </p>
        )}

        {/* Tabs */}
        <div className="flex gap-8 mt-6 border-b border-gray-200">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`pb-3 text-sm transition ${tab === t.key ? "text-black border-b-2 border-red-600" : "text-gray-400 hover:text-gray-600"}`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-6">
          {loading ? (
            <div className="space-y-3 py-8">{[...Array(6)].map((_, i) => <div key={i} className="h-6 bg-gray-100 rounded animate-pulse" />)}</div>

          ) : tab === "resumen" ? (
            /* ═══ RESUMEN ═══ */
            <div className="overflow-x-auto -mx-6 px-6">
              <p className="text-[10px] text-gray-400 mb-2">Haz click en cualquier número para editar</p>
              <table className="text-xs w-max min-w-full">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-white text-left py-2 pr-4 text-[10px] uppercase tracking-widest text-gray-400 font-normal min-w-[180px]">Producto</th>
                    {sortedClientes.map(c => (
                      <th key={c.id} className="py-2 px-1 text-[10px] text-gray-400 font-normal text-center whitespace-nowrap min-w-[48px]">
                        <button onClick={() => { setSelectedClient(c.id); setTab("cliente"); }} className="hover:text-black transition">{c.nombre}</button>
                      </th>
                    ))}
                    <th className="py-2 px-3 text-[10px] uppercase tracking-widest text-gray-400 font-normal text-right border-l border-gray-100">Paq</th>
                    <th className="py-2 px-3 text-[10px] uppercase tracking-widest text-gray-400 font-normal text-right">Pzas</th>
                    {!isVendedor && <th className="py-2 px-3 text-[10px] uppercase tracking-widest text-gray-400 font-normal text-right">Valor</th>}
                  </tr>
                </thead>
                <tbody>
                  {GENERO_ORDER.map((gen, gi) => {
                    const genProds = sortedProductos.filter(p => p.genero === gen);
                    return [
                      gi > 0 && <tr key={`s-${gen}`}><td colSpan={sortedClientes.length + (isVendedor ? 3 : 4)} className="h-px bg-gray-100" /></tr>,
                      ...genProds.map(prod => {
                        const tPaq = prodTotalPaq(prod.id);
                        return (
                          <tr key={prod.id} className="hover:bg-gray-50 transition-colors">
                            <td className="sticky left-0 z-10 bg-white py-1.5 pr-4">
                              <span className="flex items-center gap-2">
                                <Dot color={prod.color} />
                                <span>{prod.nombre}</span>
                                <span className="text-[10px] text-gray-400">{prod.genero}</span>
                              </span>
                            </td>
                            {sortedClientes.map(c => {
                              const paq = getPaq(c.id, prod.id);
                              const editing = editCell?.cId === c.id && editCell?.pId === prod.id;
                              return (
                                <td key={c.id} className="py-1 px-1 text-center border-b border-gray-50">
                                  {editing ? (
                                    <input type="number" min={0} value={editVal} onChange={e => setEditVal(parseInt(e.target.value) || 0)}
                                      onBlur={() => savePedido(c.id, prod.id, editVal)}
                                      onKeyDown={e => { if (e.key === "Enter") savePedido(c.id, prod.id, editVal); if (e.key === "Escape") setEditCell(null); }}
                                      className="w-10 text-center border-b border-black text-xs py-0.5 outline-none bg-transparent" autoFocus />
                                  ) : paq > 0 ? (
                                    <button onClick={() => { setEditCell({ cId: c.id, pId: prod.id }); setEditVal(paq); }}
                                      className="tabular-nums hover:text-red-600 transition border-b border-dotted border-gray-300">{paq}</button>
                                  ) : (
                                    <button onClick={() => { setEditCell({ cId: c.id, pId: prod.id }); setEditVal(0); }}
                                      className="text-gray-300 hover:text-gray-500 hover:cursor-cell transition">—</button>
                                  )}
                                </td>
                              );
                            })}
                            <td className="py-1.5 px-3 text-right tabular-nums font-medium border-l border-gray-100">{tPaq}</td>
                            <td className="py-1.5 px-3 text-right tabular-nums text-gray-500">{tPaq * PPQ}</td>
                            {!isVendedor && <td className="py-1.5 px-3 text-right tabular-nums">${fmt(tPaq * PPQ * prod.precio_panama)}</td>}
                          </tr>
                        );
                      }),
                    ];
                  })}
                  <tr className="border-t border-gray-200">
                    <td className="sticky left-0 z-10 bg-white py-2 pr-4 font-medium">Total</td>
                    {sortedClientes.map(c => { const t = clientTotal(c.id); return <td key={c.id} className="py-2 px-1 text-center tabular-nums text-[10px] text-gray-500">{t || ""}</td>; })}
                    <td className="py-2 px-3 text-right tabular-nums font-medium border-l border-gray-100">{gPaq}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-gray-500">{gPaq * PPQ}</td>
                    {!isVendedor && <td className="py-2 px-3 text-right tabular-nums font-medium">${fmt(gVal)}</td>}
                  </tr>
                </tbody>
              </table>
            </div>

          ) : tab === "cliente" ? (
            /* ═══ POR CLIENTE ═══ */
            <div className="flex gap-8 flex-col sm:flex-row">
              <div className="w-full sm:w-48 flex-shrink-0">
                <div className="flex items-center justify-between mb-2">
                  <input value={clientSearch} onChange={e => setClientSearch(e.target.value)} placeholder="Buscar..."
                    className="border-b border-gray-200 py-1.5 text-xs outline-none focus:border-black transition w-full bg-transparent" />
                  <button onClick={() => setShowNewClient(!showNewClient)} className="text-gray-400 hover:text-black transition text-sm ml-2 flex-shrink-0">+</button>
                </div>
                {showNewClient && (
                  <div className="flex gap-1 mb-2">
                    <input value={newClientName} onChange={e => setNewClientName(e.target.value)} placeholder="Nombre" onKeyDown={e => { if (e.key === "Enter") addClient(); }}
                      className="flex-1 border-b border-gray-200 py-1 text-xs outline-none focus:border-black" autoFocus />
                    <button onClick={addClient} className="text-xs text-gray-500 hover:text-black">OK</button>
                  </div>
                )}
                <div className="space-y-0">
                  {sortedClientes.filter(c => !clientSearch || c.nombre.toLowerCase().includes(clientSearch.toLowerCase())).map(c => {
                    const active = selectedClient === c.id;
                    return (
                      <button key={c.id} onClick={() => setSelectedClient(c.id)}
                        className={`w-full text-left py-2 text-xs border-b border-gray-50 transition flex items-center justify-between ${active ? "border-l-2 border-l-red-600 pl-2" : "pl-0 hover:bg-gray-50"}`}>
                        <span className={active ? "text-black" : "text-gray-600"}>{c.nombre}</span>
                        <span className="text-gray-400 tabular-nums">{clientTotal(c.id) || ""}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex-1 min-w-0">
                {!selectedClient ? (
                  <p className="text-gray-400 text-sm py-20 text-center">Selecciona un cliente</p>
                ) : (() => {
                  const cl = clientes.find(c => c.id === selectedClient);
                  if (!cl) return null;
                  const tPaq = pedidos.filter(p => p.cliente_id === selectedClient).reduce((s, p) => s + p.paquetes, 0);
                  const tVal = pedidos.filter(p => p.cliente_id === selectedClient).reduce((s, p) => { const pr = productos.find(x => x.id === p.producto_id); return s + p.paquetes * PPQ * (pr?.precio_panama || 0); }, 0);

                  return (
                    <div>
                      <div className="flex items-center justify-between">
                        <div>
                          <h2 className="text-2xl font-light">{cl.nombre}</h2>
                          <p className="text-sm text-gray-500 mt-1">{tPaq} paq · {tPaq * PPQ} pzas{!isVendedor && <> · ${fmt(tVal)}</>}</p>
                        </div>
                        <button onClick={() => deleteClient(cl.id, cl.nombre)} className="text-xs text-gray-400 hover:text-red-500 transition">Eliminar cliente</button>
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
                                return (
                                  <div key={prod.id} className={`flex items-center py-2 border-b border-gray-100 gap-3 ${paq === 0 ? "opacity-40" : ""}`}>
                                    <Dot color={prod.color} />
                                    <span className="text-sm flex-1">{prod.nombre}</span>
                                    <input type="number" min={0} step={1} defaultValue={paq} key={`${selectedClient}-${prod.id}-${paq}`}
                                      onBlur={e => {
                                        const v = parseInt(e.target.value) || 0;
                                        if (v !== paq) savePedido(selectedClient, prod.id, v);
                                      }}
                                      onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                      className="w-12 text-center border-b border-gray-200 text-xs py-0.5 outline-none focus:border-black tabular-nums" />
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

                      {tPaq > 0 && (
                        <button onClick={() => downloadClientPDF(selectedClient)} className="mt-4 border border-gray-200 px-4 py-2 rounded-full text-sm hover:border-gray-400 transition">
                          Descargar PDF
                        </button>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>

          ) : (
            /* ═══ STOCK ═══ */
            <div>
              {stockProducts.map(prod => {
                const ped = prodTotalPaq(prod.id);
                const comp = Math.floor(prod.stock_comprado / PPQ);
                const disp = comp - ped;
                const pct = comp > 0 ? Math.min((ped / comp) * 100, 100) : 0;
                const barColor = disp < 0 ? "bg-red-500" : disp < comp * 0.2 ? "bg-amber-400" : "bg-gray-900";

                return (
                  <div key={prod.id} className="flex items-center py-3 border-b border-gray-100 gap-4">
                    <div className="flex items-center gap-2 w-48 flex-shrink-0">
                      <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ background: COLOR_MAP[prod.color] || "#ccc" }} />
                      <div>
                        <span className="text-sm">{prod.nombre}</span>
                        <span className="text-[10px] text-gray-400 ml-1">{prod.genero}</span>
                        {!isVendedor && <div className="text-[10px] text-gray-400">${fmt(prod.precio_panama)} · RRP ${fmt(prod.rrp)}</div>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-1">
                      <div className="w-32 h-1 bg-gray-200 rounded-full overflow-hidden flex-shrink-0">
                        <div className={`h-full ${barColor} rounded-full`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[10px] text-gray-400 tabular-nums w-16">{ped}/{comp} paq</span>
                    </div>
                    <div className="text-right w-24 flex-shrink-0">
                      <span className={`text-sm font-medium tabular-nums ${disp < 0 ? "text-red-600" : "text-black"}`}>{disp}</span>
                      <span className="text-xs text-gray-400 ml-1">disp.</span>
                      {disp < 0 && <span className="text-[10px] text-red-500 block">⚠ −{Math.abs(disp)} paq</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-black text-white px-5 py-2.5 rounded-full text-sm z-50">{toast}</div>}
    </div>
  );
}
