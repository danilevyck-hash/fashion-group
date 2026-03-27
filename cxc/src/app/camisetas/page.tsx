"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";

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
function ColorDot({ color, size = "w-3 h-3" }: { color: string; size?: string }) {
  return <span className={`inline-block ${size} rounded-full border border-gray-300 flex-shrink-0`} style={{ background: COLOR_MAP[color] || "#ccc" }} />;
}
function GeneroBadge({ genero }: { genero: string }) {
  const colors: Record<string, string> = { HOMBRE: "bg-blue-50 text-blue-600", MUJER: "bg-pink-50 text-pink-600", NIÑO: "bg-amber-50 text-amber-600" };
  return <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${colors[genero] || "bg-gray-100 text-gray-500"}`}>{genero}</span>;
}

export default function CamisetasPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
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
    const r = sessionStorage.getItem("cxc_role");
    if (!r) { router.push("/"); return; }
    setAuthChecked(true);
  }, [router]);

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

  // Helpers
  function getPaq(cId: string, pId: string) { return pedidos.find(p => p.cliente_id === cId && p.producto_id === pId)?.paquetes || 0; }
  function clientTotal(cId: string) { return pedidos.filter(p => p.cliente_id === cId).reduce((s, p) => s + p.paquetes, 0); }
  function clientValor(cId: string) {
    return pedidos.filter(p => p.cliente_id === cId).reduce((s, p) => {
      const prod = productos.find(pr => pr.id === p.producto_id);
      return s + p.paquetes * PPQ * (prod?.precio_panama || 0);
    }, 0);
  }
  function prodTotalPaq(pId: string) { return pedidos.filter(p => p.producto_id === pId).reduce((s, p) => s + p.paquetes, 0); }

  const sortedClientes = [...clientes].sort((a, b) => clientTotal(b.id) - clientTotal(a.id));
  const sortedProductos = [...productos].sort((a, b) => GENERO_ORDER.indexOf(a.genero) - GENERO_ORDER.indexOf(b.genero) || a.color.localeCompare(b.color));

  // Global stats
  const globalPaq = pedidos.reduce((s, p) => s + p.paquetes, 0);
  const globalPzas = globalPaq * PPQ;
  const globalValor = pedidos.reduce((s, p) => { const pr = productos.find(x => x.id === p.producto_id); return s + p.paquetes * PPQ * (pr?.precio_panama || 0); }, 0);
  const sobrevendidos = sortedProductos.filter(p => { const ped = prodTotalPaq(p.id); const comp = Math.floor(p.stock_comprado / PPQ); return ped > comp; }).length;

  async function savePedido(cId: string, pId: string, paq: number) {
    await fetch("/api/camisetas/pedido", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cliente_id: cId, producto_id: pId, paquetes: paq }) });
    setEditCell(null); showToast("Guardado"); load();
  }
  async function addClient() {
    if (!newClientName.trim()) return;
    const res = await fetch("/api/camisetas/clientes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre: newClientName.trim() }) });
    if (res.ok) { setNewClientName(""); setShowNewClient(false); showToast("Cliente creado"); load(); } else showToast("Error");
  }

  // Stock sorted: overvendidos first
  const stockProducts = [...sortedProductos].sort((a, b) => {
    const da = Math.floor(a.stock_comprado / PPQ) - prodTotalPaq(a.id);
    const db = Math.floor(b.stock_comprado / PPQ) - prodTotalPaq(b.id);
    return da - db;
  });

  return (
    <div className="min-h-screen bg-white">
      <AppHeader module="Camisetas Selección" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-light">Camisetas Reebok</h1>
          <p className="text-sm text-gray-400">Selección Panamá</p>
        </div>

        {/* Summary bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="bg-gray-50 rounded-xl px-4 py-3">
            <div className="text-[10px] text-gray-400 uppercase">Pedidos</div>
            <div className="text-xl font-semibold tabular-nums">{globalPaq} <span className="text-xs font-normal text-gray-400">paq</span></div>
          </div>
          <div className="bg-gray-50 rounded-xl px-4 py-3">
            <div className="text-[10px] text-gray-400 uppercase">Piezas</div>
            <div className="text-xl font-semibold tabular-nums">{globalPzas.toLocaleString()}</div>
          </div>
          <div className={`rounded-xl px-4 py-3 ${sobrevendidos > 0 ? "bg-red-50" : "bg-green-50"}`}>
            <div className="text-[10px] text-gray-400 uppercase">Sobrevendidos</div>
            <div className={`text-xl font-semibold ${sobrevendidos > 0 ? "text-red-600" : "text-green-600"}`}>{sobrevendidos}</div>
          </div>
          <div className="bg-gray-50 rounded-xl px-4 py-3">
            <div className="text-[10px] text-gray-400 uppercase">Valor Total</div>
            <div className="text-xl font-semibold tabular-nums">{fmtK(globalValor)}</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 overflow-x-auto">
          {(["resumen", "cliente", "stock"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-5 py-2 rounded-full text-sm font-medium transition whitespace-nowrap ${tab === t ? "bg-black text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              {t === "resumen" ? "Resumen" : t === "cliente" ? "Por Cliente" : "Stock"}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />)}</div>
        ) : tab === "resumen" ? (
          /* ═══ TAB 1: RESUMEN ═══ */
          <div className="overflow-x-auto border border-gray-200 rounded-xl">
            <table className="text-xs border-collapse w-max min-w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2.5 text-left text-[10px] text-gray-400 font-normal min-w-[200px]">Producto</th>
                  {sortedClientes.map(c => (
                    <th key={c.id} className="px-2 py-2.5 text-[10px] text-gray-500 font-normal min-w-[55px] text-center whitespace-nowrap">
                      <button onClick={() => { setSelectedClient(c.id); setTab("cliente"); }} className="hover:text-black transition" title={c.nombre}>
                        {c.nombre}
                      </button>
                    </th>
                  ))}
                  <th className="px-3 py-2.5 text-[10px] text-gray-400 font-normal text-right bg-gray-100 border-l border-gray-200 min-w-[50px]">Paq</th>
                  <th className="px-3 py-2.5 text-[10px] text-gray-400 font-normal text-right bg-gray-100 min-w-[50px]">Pzas</th>
                  <th className="px-3 py-2.5 text-[10px] text-gray-400 font-normal text-right bg-gray-100 min-w-[70px]">Valor</th>
                </tr>
              </thead>
              <tbody>
                {GENERO_ORDER.map((gen, gi) => {
                  const genProds = sortedProductos.filter(p => p.genero === gen);
                  return [
                    gi > 0 && <tr key={`div-${gen}`}><td colSpan={sortedClientes.length + 4} className="h-px bg-gray-200" /></tr>,
                    ...genProds.map(prod => {
                      const totalPaq = prodTotalPaq(prod.id);
                      return (
                        <tr key={prod.id} className="border-b border-gray-50 hover:bg-blue-50/30 transition-colors">
                          <td className="sticky left-0 z-10 bg-white px-3 py-2">
                            <div className="flex items-center gap-2">
                              <ColorDot color={prod.color} />
                              <span className="font-medium">{prod.nombre}</span>
                              <GeneroBadge genero={prod.genero} />
                            </div>
                          </td>
                          {sortedClientes.map(c => {
                            const paq = getPaq(c.id, prod.id);
                            const isEditing = editCell?.cId === c.id && editCell?.pId === prod.id;
                            return (
                              <td key={c.id} className="px-1 py-1 text-center">
                                {isEditing ? (
                                  <input type="number" min={0} value={editVal} onChange={e => setEditVal(parseInt(e.target.value) || 0)}
                                    onBlur={() => savePedido(c.id, prod.id, editVal)}
                                    onKeyDown={e => { if (e.key === "Enter") savePedido(c.id, prod.id, editVal); if (e.key === "Escape") setEditCell(null); }}
                                    className="w-10 text-center border border-blue-400 rounded text-xs py-0.5 bg-blue-50" autoFocus />
                                ) : paq > 0 ? (
                                  <button onClick={() => { setEditCell({ cId: c.id, pId: prod.id }); setEditVal(paq); }}
                                    className="text-xs font-medium hover:bg-blue-100 rounded px-1.5 py-0.5 transition tabular-nums">{paq}</button>
                                ) : (
                                  <button onClick={() => { setEditCell({ cId: c.id, pId: prod.id }); setEditVal(0); }}
                                    className="text-gray-200 hover:text-gray-400 transition text-[10px]">—</button>
                                )}
                              </td>
                            );
                          })}
                          <td className="px-3 py-1 text-right font-semibold tabular-nums bg-gray-50/80 border-l border-gray-100">{totalPaq}</td>
                          <td className="px-3 py-1 text-right tabular-nums text-gray-500 bg-gray-50/80">{totalPaq * PPQ}</td>
                          <td className="px-3 py-1 text-right tabular-nums font-medium bg-gray-50/80">${fmt(totalPaq * PPQ * prod.precio_panama)}</td>
                        </tr>
                      );
                    }),
                  ];
                })}
                <tr className="border-t-2 border-gray-300 font-bold bg-gray-100">
                  <td className="sticky left-0 z-10 bg-gray-100 px-3 py-2.5">TOTAL</td>
                  {sortedClientes.map(c => {
                    const t = clientTotal(c.id);
                    return <td key={c.id} className="px-1 py-2.5 text-center tabular-nums text-[10px]">{t || ""}</td>;
                  })}
                  <td className="px-3 py-2.5 text-right tabular-nums border-l border-gray-200">{globalPaq}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{globalPzas}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">${fmt(globalValor)}</td>
                </tr>
              </tbody>
            </table>
          </div>

        ) : tab === "cliente" ? (
          /* ═══ TAB 2: POR CLIENTE ═══ */
          <div className="flex gap-6 flex-col sm:flex-row">
            <div className="w-full sm:w-56 flex-shrink-0">
              <button onClick={() => setShowNewClient(true)} className="w-full text-xs bg-black text-white px-3 py-2.5 rounded-lg mb-3 hover:bg-gray-800 transition font-medium">+ Nuevo Cliente</button>
              {showNewClient && (
                <div className="mb-3 flex gap-1">
                  <input value={newClientName} onChange={e => setNewClientName(e.target.value)} placeholder="Nombre" onKeyDown={e => { if (e.key === "Enter") addClient(); }}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-xs" autoFocus />
                  <button onClick={addClient} className="text-xs bg-black text-white px-3 py-2 rounded-lg">OK</button>
                </div>
              )}
              <input value={clientSearch} onChange={e => setClientSearch(e.target.value)} placeholder="Buscar cliente..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs mb-2 outline-none focus:ring-1 focus:ring-gray-300" />
              <div className="space-y-0.5 max-h-[60vh] overflow-y-auto">
                {sortedClientes.filter(c => !clientSearch || c.nombre.toLowerCase().includes(clientSearch.toLowerCase())).map(c => {
                  const isActive = selectedClient === c.id;
                  const total = clientTotal(c.id);
                  return (
                    <button key={c.id} onClick={() => setSelectedClient(c.id)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg text-xs transition ${isActive ? "bg-red-50 border-l-4 border-red-500" : "hover:bg-gray-50"}`}>
                      <div className="flex items-center justify-between">
                        <span className={`font-medium truncate ${isActive ? "text-red-700" : ""}`}>{c.nombre}</span>
                        {total > 0 && <span className="text-[9px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-medium ml-1 flex-shrink-0">{total}</span>}
                      </div>
                      <div className="text-[10px] text-gray-400 mt-0.5">${fmt(clientValor(c.id))}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex-1 min-w-0">
              {!selectedClient ? (
                <div className="text-center py-20">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1" className="mx-auto mb-3"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                  <p className="text-sm text-gray-400">Selecciona un cliente</p>
                </div>
              ) : (() => {
                const cl = clientes.find(c => c.id === selectedClient)!;
                const clientPedidos = pedidos.filter(p => p.cliente_id === selectedClient && p.paquetes > 0);
                const clientProducts = clientPedidos.map(p => ({ ...p, prod: productos.find(pr => pr.id === p.producto_id)! })).filter(p => p.prod);
                const totalPaq = clientProducts.reduce((s, p) => s + p.paquetes, 0);
                const totalVal = clientProducts.reduce((s, p) => s + p.paquetes * PPQ * p.prod.precio_panama, 0);

                return (
                  <div>
                    <h2 className="text-xl font-bold mb-1">{cl.nombre}</h2>
                    {/* Stat cards */}
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      <div className="bg-gray-50 rounded-lg px-3 py-2"><div className="text-[10px] text-gray-400">Paquetes</div><div className="text-lg font-semibold">{totalPaq}</div></div>
                      <div className="bg-gray-50 rounded-lg px-3 py-2"><div className="text-[10px] text-gray-400">Piezas</div><div className="text-lg font-semibold">{totalPaq * PPQ}</div></div>
                      <div className="bg-gray-50 rounded-lg px-3 py-2"><div className="text-[10px] text-gray-400">Valor</div><div className="text-lg font-semibold">${fmt(totalVal)}</div></div>
                    </div>
                    {clientProducts.length === 0 ? (
                      <p className="text-gray-400 text-sm py-8 text-center">Sin pedidos registrados</p>
                    ) : (
                      <div className="border border-gray-200 rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-gray-50 border-b border-gray-200">
                              <th className="text-left px-3 py-2 text-[11px] uppercase text-gray-400 font-normal">Producto</th>
                              <th className="text-center px-3 py-2 text-[11px] uppercase text-gray-400 font-normal w-16">Paq</th>
                              <th className="text-center px-3 py-2 text-[11px] uppercase text-gray-400 font-normal w-16">Pzas</th>
                              <th className="text-left px-3 py-2 text-[11px] uppercase text-gray-400 font-normal">Tallas</th>
                              <th className="text-right px-3 py-2 text-[11px] uppercase text-gray-400 font-normal w-20">Valor</th>
                            </tr>
                          </thead>
                          <tbody>
                            {GENERO_ORDER.map(gen => {
                              const genItems = clientProducts.filter(p => p.prod.genero === gen);
                              if (genItems.length === 0) return null;
                              return [
                                <tr key={`h-${gen}`}><td colSpan={5} className="px-3 pt-3 pb-1 text-[10px] uppercase text-gray-400 tracking-wider font-medium">{gen}</td></tr>,
                                ...genItems.map(({ prod, paquetes, producto_id }) => {
                                  const tallas = TALLAS[prod.genero] || {};
                                  const tallaStr = Object.entries(tallas).filter(([, v]) => v > 0).map(([k, v]) => `${k}:${v * paquetes}`).join(" ");
                                  return (
                                    <tr key={producto_id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                                      <td className="px-3 py-2 flex items-center gap-2"><ColorDot color={prod.color} /><span className="text-xs">{prod.nombre}</span></td>
                                      <td className="px-3 py-2 text-center">
                                        <input type="number" min={0} value={paquetes}
                                          onChange={e => savePedido(selectedClient, producto_id, parseInt(e.target.value) || 0)}
                                          className="w-12 text-center border border-gray-200 rounded px-1 py-0.5 text-xs" />
                                      </td>
                                      <td className="px-3 py-2 text-center text-xs text-gray-400">{paquetes * PPQ}</td>
                                      <td className="px-3 py-2 text-[10px] text-gray-400 font-mono">{tallaStr}</td>
                                      <td className="px-3 py-2 text-right tabular-nums text-xs font-medium">${fmt(paquetes * PPQ * prod.precio_panama)}</td>
                                    </tr>
                                  );
                                }),
                              ];
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>

        ) : (
          /* ═══ TAB 3: STOCK ═══ */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {stockProducts.map(prod => {
              const pedido = prodTotalPaq(prod.id);
              const comprado = Math.floor(prod.stock_comprado / PPQ);
              const disponible = comprado - pedido;
              const pct = comprado > 0 ? (pedido / comprado) * 100 : 0;
              const barColor = pct > 100 ? "bg-red-500" : pct > 80 ? "bg-amber-500" : "bg-green-500";
              const dispColor = disponible < 0 ? "text-red-600" : disponible < comprado * 0.2 ? "text-amber-600" : "text-green-600";

              return (
                <div key={prod.id} className={`border rounded-xl p-4 ${disponible < 0 ? "border-red-200 bg-red-50/30" : "border-gray-200"}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <ColorDot color={prod.color} size="w-5 h-5" />
                    <span className="font-medium text-sm flex-1">{prod.nombre}</span>
                    <GeneroBadge genero={prod.genero} />
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
                    <span>Panamá: <strong>${fmt(prod.precio_panama)}</strong></span>
                    <span className="text-gray-400">RRP: ${fmt(prod.rrp)}</span>
                  </div>
                  <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden mb-2">
                    <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                  <div className="text-xs text-gray-600 flex items-center justify-between">
                    <span>{pedido} pedidos</span>
                    <span>{comprado} comprados</span>
                    <span className={`font-bold ${dispColor}`}>{disponible} disp.</span>
                  </div>
                  <div className="text-[10px] text-gray-400 mt-1">
                    {pedido * PPQ} pzas pedidas · {prod.stock_comprado} pzas compradas
                  </div>
                  {disponible < 0 && (
                    <div className="mt-2 bg-red-100 border border-red-200 rounded-lg px-3 py-1.5 text-xs text-red-700 font-medium flex items-center gap-1">
                      ⚠ Sobrevendido {Math.abs(disponible)} paquetes ({Math.abs(disponible) * PPQ} piezas)
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-black text-white px-5 py-2.5 rounded-full text-sm z-50 shadow-lg">{toast}</div>}
    </div>
  );
}
