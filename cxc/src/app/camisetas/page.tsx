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
const COLOR_MAP: Record<string, string> = { ROJA: "#CC0000", BLANCA: "#e0e0e0", "AZUL NAVY": "#001F5B" };
const GENERO_ORDER = ["HOMBRE", "MUJER", "NIÑO"];

function fmt(n: number) { return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function ColorDot({ color }: { color: string }) {
  return <span className="inline-block w-3 h-3 rounded-full border border-gray-300 flex-shrink-0" style={{ background: COLOR_MAP[color] || "#ccc" }} />;
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
      if (res.ok) {
        const d = await res.json();
        setProductos(d.productos || []);
        setClientes(d.clientes || []);
        setPedidos(d.pedidos || []);
      }
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

  async function savePedido(cId: string, pId: string, paq: number) {
    await fetch("/api/camisetas/pedido", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cliente_id: cId, producto_id: pId, paquetes: paq }),
    });
    setEditCell(null);
    showToast("Guardado");
    load();
  }

  async function addClient() {
    if (!newClientName.trim()) return;
    const res = await fetch("/api/camisetas/clientes", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: newClientName.trim() }),
    });
    if (res.ok) { setNewClientName(""); setShowNewClient(false); showToast("Cliente creado"); load(); }
    else showToast("Error al crear cliente");
  }

  return (
    <div className="min-h-screen bg-white">
      <AppHeader module="Camisetas Selección" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Tabs */}
        <div className="flex gap-1 mb-6">
          {(["resumen", "cliente", "stock"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === t ? "bg-black text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              {t === "resumen" ? "Resumen" : t === "cliente" ? "Por Cliente" : "Stock"}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-20 text-gray-400 text-sm">Cargando...</div>
        ) : tab === "resumen" ? (
          /* ═══ TAB 1: RESUMEN ═══ */
          <div className="overflow-x-auto">
            <table className="text-xs border-collapse">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-white px-2 py-2 text-left text-[10px] text-gray-400 font-normal min-w-[180px]">Producto</th>
                  {sortedClientes.map(c => (
                    <th key={c.id} className="px-1 py-2 text-[9px] text-gray-500 font-normal min-w-[40px] text-center">
                      <button onClick={() => { setSelectedClient(c.id); setTab("cliente"); }} className="hover:text-black transition truncate block max-w-[60px]" title={c.nombre}>
                        {c.nombre.length > 8 ? c.nombre.slice(0, 7) + "…" : c.nombre}
                      </button>
                    </th>
                  ))}
                  <th className="px-2 py-2 text-[10px] text-gray-400 font-normal text-right bg-gray-50 sticky right-[120px] z-10">Paq.</th>
                  <th className="px-2 py-2 text-[10px] text-gray-400 font-normal text-right bg-gray-50 sticky right-[60px] z-10">Pzas.</th>
                  <th className="px-2 py-2 text-[10px] text-gray-400 font-normal text-right bg-gray-50 sticky right-0 z-10">Valor $</th>
                </tr>
              </thead>
              <tbody>
                {GENERO_ORDER.map((gen, gi) => {
                  const genProds = sortedProductos.filter(p => p.genero === gen);
                  return [
                    gi > 0 && <tr key={`div-${gen}`}><td colSpan={sortedClientes.length + 4} className="h-1 bg-gray-100" /></tr>,
                    ...genProds.map(prod => {
                      const totalPaq = prodTotalPaq(prod.id);
                      return (
                        <tr key={prod.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                          <td className="sticky left-0 z-10 bg-white px-2 py-1.5 flex items-center gap-1.5">
                            <ColorDot color={prod.color} />
                            <span className="font-medium">{prod.nombre}</span>
                            <span className="text-[9px] text-gray-400">{prod.genero}</span>
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
                                    className="w-10 text-center border border-blue-300 rounded text-xs py-0.5" autoFocus />
                                ) : paq > 0 ? (
                                  <button onClick={() => { setEditCell({ cId: c.id, pId: prod.id }); setEditVal(paq); }}
                                    className="text-xs font-medium hover:bg-blue-50 rounded px-1 py-0.5 transition tabular-nums">{paq}</button>
                                ) : (
                                  <button onClick={() => { setEditCell({ cId: c.id, pId: prod.id }); setEditVal(0); }}
                                    className="text-gray-200 hover:text-gray-400 transition">—</button>
                                )}
                              </td>
                            );
                          })}
                          <td className="px-2 py-1 text-right font-medium tabular-nums bg-gray-50 sticky right-[120px] z-10">{totalPaq}</td>
                          <td className="px-2 py-1 text-right tabular-nums text-gray-500 bg-gray-50 sticky right-[60px] z-10">{totalPaq * PPQ}</td>
                          <td className="px-2 py-1 text-right tabular-nums font-medium bg-gray-50 sticky right-0 z-10">${fmt(totalPaq * PPQ * prod.precio_panama)}</td>
                        </tr>
                      );
                    }),
                  ];
                })}
                {/* Totals row */}
                <tr className="border-t-2 border-gray-300 font-semibold bg-gray-50">
                  <td className="sticky left-0 z-10 bg-gray-50 px-2 py-2">TOTAL</td>
                  {sortedClientes.map(c => (
                    <td key={c.id} className="px-1 py-2 text-center tabular-nums text-[10px]">{clientTotal(c.id) || ""}</td>
                  ))}
                  <td className="px-2 py-2 text-right tabular-nums bg-gray-100 sticky right-[120px] z-10">{pedidos.reduce((s, p) => s + p.paquetes, 0)}</td>
                  <td className="px-2 py-2 text-right tabular-nums bg-gray-100 sticky right-[60px] z-10">{pedidos.reduce((s, p) => s + p.paquetes, 0) * PPQ}</td>
                  <td className="px-2 py-2 text-right tabular-nums bg-gray-100 sticky right-0 z-10">
                    ${fmt(pedidos.reduce((s, p) => { const pr = productos.find(x => x.id === p.producto_id); return s + p.paquetes * PPQ * (pr?.precio_panama || 0); }, 0))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

        ) : tab === "cliente" ? (
          /* ═══ TAB 2: POR CLIENTE ═══ */
          <div className="flex gap-6">
            {/* Left: client list */}
            <div className="w-48 flex-shrink-0">
              <button onClick={() => setShowNewClient(true)} className="w-full text-xs bg-black text-white px-3 py-2 rounded-lg mb-3 hover:bg-gray-800 transition">+ Nuevo Cliente</button>
              {showNewClient && (
                <div className="mb-3 flex gap-1">
                  <input value={newClientName} onChange={e => setNewClientName(e.target.value)} placeholder="Nombre" onKeyDown={e => { if (e.key === "Enter") addClient(); }}
                    className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs" autoFocus />
                  <button onClick={addClient} className="text-xs bg-black text-white px-2 py-1 rounded">OK</button>
                </div>
              )}
              <div className="space-y-1">
                {sortedClientes.map(c => (
                  <button key={c.id} onClick={() => setSelectedClient(c.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs transition ${selectedClient === c.id ? "bg-black text-white" : "hover:bg-gray-100"}`}>
                    <div className="font-medium truncate">{c.nombre}</div>
                    <div className={`text-[10px] ${selectedClient === c.id ? "text-gray-300" : "text-gray-400"}`}>
                      {clientTotal(c.id)} paq · ${fmt(clientValor(c.id))}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Right: client detail */}
            <div className="flex-1 min-w-0">
              {!selectedClient ? (
                <div className="text-center py-20 text-gray-400 text-sm">Selecciona un cliente</div>
              ) : (() => {
                const cl = clientes.find(c => c.id === selectedClient)!;
                const clientPedidos = pedidos.filter(p => p.cliente_id === selectedClient && p.paquetes > 0);
                const clientProducts = clientPedidos.map(p => ({ ...p, prod: productos.find(pr => pr.id === p.producto_id)! })).filter(p => p.prod);
                const totalPaq = clientProducts.reduce((s, p) => s + p.paquetes, 0);
                const totalVal = clientProducts.reduce((s, p) => s + p.paquetes * PPQ * p.prod.precio_panama, 0);

                return (
                  <div>
                    <h2 className="text-xl font-bold mb-4">{cl.nombre}</h2>
                    {clientProducts.length === 0 ? (
                      <p className="text-gray-400 text-sm">Sin pedidos registrados</p>
                    ) : (
                      <>
                        <div className="border border-gray-200 rounded-xl overflow-hidden mb-4">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-gray-50 border-b border-gray-200">
                                <th className="text-left px-3 py-2 text-[11px] uppercase text-gray-400 font-normal">Producto</th>
                                <th className="text-left px-3 py-2 text-[11px] uppercase text-gray-400 font-normal">Género</th>
                                <th className="text-center px-3 py-2 text-[11px] uppercase text-gray-400 font-normal">Paq.</th>
                                <th className="text-center px-3 py-2 text-[11px] uppercase text-gray-400 font-normal">Pzas.</th>
                                <th className="text-left px-3 py-2 text-[11px] uppercase text-gray-400 font-normal">Tallas</th>
                                <th className="text-right px-3 py-2 text-[11px] uppercase text-gray-400 font-normal">Precio</th>
                                <th className="text-right px-3 py-2 text-[11px] uppercase text-gray-400 font-normal">Subtotal</th>
                              </tr>
                            </thead>
                            <tbody>
                              {clientProducts.map(({ prod, paquetes, producto_id }) => {
                                const tallas = TALLAS[prod.genero] || {};
                                const tallaStr = Object.entries(tallas).filter(([, v]) => v > 0).map(([k, v]) => `${k}:${v * paquetes}`).join(" ");
                                return (
                                  <tr key={producto_id} className="border-b border-gray-50">
                                    <td className="px-3 py-2 flex items-center gap-1.5"><ColorDot color={prod.color} />{prod.nombre}</td>
                                    <td className="px-3 py-2 text-xs text-gray-500">{prod.genero}</td>
                                    <td className="px-3 py-2 text-center">
                                      <input type="number" min={0} value={paquetes}
                                        onChange={e => { const v = parseInt(e.target.value) || 0; savePedido(selectedClient, producto_id, v); }}
                                        className="w-12 text-center border border-gray-200 rounded px-1 py-0.5 text-xs" />
                                    </td>
                                    <td className="px-3 py-2 text-center text-xs text-gray-400">{paquetes * PPQ}</td>
                                    <td className="px-3 py-2 text-[10px] text-gray-400 font-mono">{tallaStr}</td>
                                    <td className="px-3 py-2 text-right tabular-nums">${fmt(prod.precio_panama)}</td>
                                    <td className="px-3 py-2 text-right tabular-nums font-medium">${fmt(paquetes * PPQ * prod.precio_panama)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        <div className="bg-gray-50 rounded-xl px-4 py-3 flex items-center justify-between">
                          <span className="text-sm text-gray-500">{totalPaq} paquetes · {totalPaq * PPQ} piezas</span>
                          <span className="text-lg font-bold">${fmt(totalVal)}</span>
                        </div>
                      </>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>

        ) : (
          /* ═══ TAB 3: STOCK ═══ */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedProductos.map(prod => {
              const pedido = prodTotalPaq(prod.id);
              const comprado = Math.floor(prod.stock_comprado / PPQ);
              const disponible = comprado - pedido;
              const pct = comprado > 0 ? (pedido / comprado) * 100 : 0;
              const barColor = pct > 100 ? "bg-red-500" : pct > 80 ? "bg-amber-500" : "bg-green-500";

              return (
                <div key={prod.id} className="border border-gray-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <ColorDot color={prod.color} />
                    <span className="font-medium text-sm">{prod.nombre}</span>
                    <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{prod.genero}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                    <span>Panamá: ${fmt(prod.precio_panama)}</span>
                    <span>RRP: ${fmt(prod.rrp)}</span>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden mb-2">
                    <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                  <div className="text-xs text-gray-600">
                    <span className="font-medium">{pedido}</span> paq pedidos · <span className="font-medium">{comprado}</span> comprados · <span className={`font-medium ${disponible < 0 ? "text-red-600" : "text-green-600"}`}>{disponible}</span> disponibles
                  </div>
                  <div className="text-[10px] text-gray-400 mt-1">
                    {pedido * PPQ} pzas pedidas · {prod.stock_comprado} pzas compradas
                  </div>
                  {disponible < 0 && (
                    <div className="mt-2 bg-red-50 border border-red-200 rounded px-2 py-1 text-[10px] text-red-600 font-medium">
                      Sobrevendido por {Math.abs(disponible)} paquetes ({Math.abs(disponible) * PPQ} piezas)
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
