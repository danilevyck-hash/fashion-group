"use client";

// Lista de pedidos internos /catalogo/[marca]/pedidos — única para todas las
// marcas (los gemelos eran idénticos salvo rutas/API, que vienen del tema).
//
// ── DOS PESTAÑAS, Y LAS DECIDE EL NÚMERO DE SWITCH ──
//
// Daniel, 14-ago-2026, textual: *"Tienen q haber dos secciones. Borradores y
// pedidos a switch. Y en pedidos a switch tiene que estar el número de switch
// en el pedido para saber cuál es cuál."*
//
// Antes eran cuatro (Todos · Borrador · Confirmado · Enviado) y la de
// "Enviado" estaba SIEMPRE en cero: ese estado no lo escribe ni una línea del
// código (`enviado` es de otra tabla, `*_switch_envios`). 0 de 100 pedidos en
// toda la historia.
//
// 🩸 Y "Confirmado" NO quería decir "salió a Switch". Medido contra
// producción: 7 pedidos `confirmado` nunca llegaron (PED-001/002/003/004 y
// TOM-007/008/009 del 12-ago) y PED-018 decía `borrador` estando en Switch
// (#16-000000506). El estado se escribe ANTES de llamar a Switch y queda
// escrito aunque la llamada falle. Por eso la pestaña la decide `en_switch`
// —tener envío activo— y NO `status`. El número a la vista es la prueba: con
// él, la etiqueta no puede mentir. Ver `lib/catalogo/switch-lock.ts`.

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fmt } from "@/lib/format";
import { useToast } from "@/components/ToastSystem";
import { ConfirmDeleteModal, EmptyState } from "@/components/ui";
import DuplicarPedidoModal from "@/components/catalogo/DuplicarPedidoModal";
import type { ClienteSwitchOpcion } from "@/components/catalogo/ClienteSwitchPicker";
import { getMarcaTheme, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";

interface Order {
  id: string; order_number: string; client_name: string; vendor_name: string | null;
  status: string; total: number; item_count: number; created_at: string;
  /** ¿Tiene envío ACTIVO en Switch? Decide la pestaña. Lo calcula el GET
   *  /orders con el mismo criterio que el candado de edición. */
  en_switch?: boolean;
  /** El número que se PINTA en la fila. null con `en_switch` true = está en
   *  Switch pero se perdió el número (hoy 0 casos): se muestra como problema,
   *  nunca se esconde en Borradores. */
  switch_numero?: string | null;
}

type Pestana = "borradores" | "switch";

/** Está en Switch ⇔ tiene envío activo. NO se mira `status`: mentía en 8
 *  pedidos de 100 (ver la cabecera del archivo). */
const enSwitch = (o: Order) => o.en_switch === true;

export default function PedidosListClient({ marca }: { marca: MarcaUiKey }) {
  const theme = getMarcaTheme(marca)!;
  const router = useRouter();
  const { toast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [pestana, setPestana] = useState<Pestana>("borradores");
  const [dateFilter, setDateFilter] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Order | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Duplicar: el botón abre el mini-modal, se elige el cliente y el botón
  // "Usar este cliente" confirma — el POST /orders de siempre sale con ese
  // cliente y su nombre.
  const [dupTarget, setDupTarget] = useState<Order | null>(null);
  const [duplicating, setDuplicating] = useState(false);
  // El error se ve DENTRO del modal: tocar el cliente ya es la acción, así que
  // un fallo silencioso se sentiría como "no pasó nada".
  const [dupError, setDupError] = useState<string | null>(null);

  const [role, setRole] = useState("");

  useEffect(() => {
    const r = sessionStorage.getItem("cxc_role") || "";
    if (!r) { router.push("/"); return; }
    setRole(r);
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await fetch(`${theme.api}/orders`); if (r.ok) setOrders(await r.json()); } catch { /* */ }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  async function deleteOrder() {
    if (!deleteTarget) return;
    setDeleting(true);
    await fetch(`${theme.api}/orders/${deleteTarget.id}`, { method: "DELETE" });
    setDeleting(false);
    setDeleteTarget(null);
    load();
  }

  // Duplica copiando los items del original y creando un pedido NUEVO a nombre
  // del CLIENTE DE SWITCH que se eligió en el mini-modal. El cliente es siempre
  // una elección explícita (`null` = Contado); el VENDEDOR, en cambio, se
  // hereda del original y lo resuelve el servidor (ver `duplicar_de` abajo).
  async function duplicateOrder(order: Order, clientName: string, cliente: ClienteSwitchOpcion) {
    setDuplicating(true);
    setDupError(null);
    try {
      const res = await fetch(`${theme.api}/orders/${order.id}`);
      if (!res.ok) {
        toast("Error al cargar pedido", "error");
        setDupError("No se pudo leer el pedido original. Intenta de nuevo.");
        setDuplicating(false);
        return;
      }
      const full = await res.json();
      const items = (full[theme.itemsField] || []).map((i: { product_id: string; sku: string; name: string; image_url: string; quantity: number; unit_price: number }) => ({
        product_id: i.product_id, sku: i.sku, name: i.name, image_url: i.image_url, quantity: i.quantity, unit_price: i.unit_price,
      }));
      const createRes = await fetch(`${theme.api}/orders`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        // `duplicar_de` es el pedido del que se copia: el servidor lee de ESA
        // fila el vendedor y lo hereda (Daniel: *"el vendedor debe de ser el
        // mismo que el otro por default"*). El id del vendedor NO se manda
        // desde acá — de él depende la comisión.
        body: JSON.stringify({ client_name: clientName, vendor_name: typeof window !== 'undefined' ? sessionStorage.getItem('fg_user_name') || null : null, items, cliente_switch_id: cliente.id, duplicar_de: order.id }),
      });
      if (createRes.ok) {
        const newOrder = await createRes.json();
        setDupTarget(null);
        toast("Pedido duplicado");
        router.push(`/catalogo/${marca}/pedido/${newOrder.id}`);
      } else {
        toast("Error al duplicar", "error");
        setDupError("No se pudo duplicar el pedido. Intenta de nuevo.");
      }
    } catch {
      toast("Error al duplicar", "error");
      setDupError("Error de conexion. Intenta de nuevo.");
    }
    setDuplicating(false);
  }

  // Date filtering
  const now = new Date();
  const sevenDaysAgo = new Date(now); sevenDaysAgo.setDate(now.getDate() - 7);
  const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(now.getDate() - 30);

  const canDelete = role === "admin" || role === "secretaria";

  // Conteos de las DOS pestañas. Se suman a `orders.length` siempre: un
  // pedido está en Switch o no está, no hay tercer balde.
  const conteo = {
    borradores: orders.filter(o => !enSwitch(o)).length,
    switch: orders.filter(o => enSwitch(o)).length,
  };

  const filtered = orders
    .filter(o => {
      if (!search) return true;
      const s = search.toLowerCase();
      return o.client_name.toLowerCase().includes(s)
        || o.order_number.toLowerCase().includes(s)
        || (o.vendor_name || "").toLowerCase().includes(s);
    })
    .filter(o => (pestana === "switch" ? enSwitch(o) : !enSwitch(o)))
    .filter(o => {
      if (!dateFilter) return true;
      const d = new Date(o.created_at);
      if (dateFilter === "7") return d >= sevenDaysAgo;
      if (dateFilter === "30") return d >= thirtyDaysAgo;
      return true;
    });

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <Link href={theme.catalogoHref} className="text-xs text-gray-400 hover:text-gray-600 transition">← Catálogo</Link>
      <h1 className="text-2xl font-light mt-2 mb-6">Pedidos</h1>

      {/* DOS pestañas, y nada más: las decide tener número de Switch. */}
      <div className="flex flex-wrap items-center gap-4 mb-4">
        <div className="flex gap-4 flex-wrap">
          {([
            ["borradores", "Borradores", conteo.borradores],
            ["switch", "Pedidos a Switch", conteo.switch],
          ] as [Pestana, string, number][]).map(([key, label, count]) => (
            <button key={key} onClick={() => setPestana(key)}
              aria-pressed={pestana === key}
              className={`text-sm transition min-h-[44px] ${pestana === key ? "font-medium text-black" : "text-gray-400 hover:text-black"}`}>
              {label} <span className="text-xs text-gray-300 ml-1">{count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Search + date filter */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente, # pedido, vendedor..."
          className="text-sm border border-gray-200 rounded-full px-4 py-1.5 outline-none focus:border-black transition w-64" />
        <select value={dateFilter} onChange={e => setDateFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-full px-3 py-1.5 outline-none focus:border-black transition bg-transparent">
          <option value="">Todos los dias</option>
          <option value="7">Ultimos 7 dias</option>
          <option value="30">Ultimos 30 dias</option>
        </select>
        <span className="text-xs text-gray-400 ml-auto">{filtered.length} pedidos</span>
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={search || dateFilter ? "No encontramos pedidos" : pestana === "switch" ? "Todavía no hay pedidos en Switch" : "No hay borradores"}
          subtitle={search || dateFilter
            ? "Intenta con otros filtros o busqueda"
            : pestana === "switch"
              ? "Acá aparecen los pedidos ya mandados, con su número de Switch"
              : "Los pedidos aparecerán aquí al crearlos"} />
      ) : (
        <div className="space-y-2">
          {filtered.map(o => (
            <div key={o.id} data-pedido={o.order_number}
              onClick={() => router.push(`/catalogo/${marca}/pedido/${o.id}`)}
              className="flex items-center gap-3 px-4 py-3 border border-gray-200 rounded-lg hover:border-gray-300 transition cursor-pointer">
              <div className="flex-1 min-w-0">
                {/* El nombre se queda con la línea ENTERA. La píldora de
                    estado ("Confirmado") se fue: decía lo contrario de la
                    verdad en 8 pedidos de 100. */}
                <div className="text-sm font-medium truncate">{o.client_name}</div>
                {/* 🩸 EL NÚMERO VA EN LA SEGUNDA LÍNEA, Y NO ES COSMÉTICA.
                    Puesto al lado del nombre, medido a 390 px: el chip mide
                    168 px, el renglón 158, y el nombre del cliente quedaba
                    aplastado a 0 px de ancho — invisible — y la fila igual
                    desbordaba 18 px. Acá abajo entra entero (275 px de 358) y
                    el nombre recupera su línea. Tampoco dice "Switch #…": la
                    pestaña ya se llama "Pedidos a Switch". */}
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-xs text-gray-400 font-mono">{o.order_number}</span>
                  <span className="text-xs text-gray-300">·</span>
                  <span className="text-xs text-gray-400">{new Date(o.created_at).toLocaleDateString("es-PA", { day: "numeric", month: "short", year: "numeric" }).replace(".", "")}</span>
                  <span className="text-xs text-gray-300">·</span>
                  <span className="text-xs text-gray-400">{o.item_count} items</span>
                  {enSwitch(o) && (
                    o.switch_numero ? (
                      <>
                        <span className="text-xs text-gray-300">·</span>
                        <span className="text-xs font-medium text-green-700 font-mono whitespace-nowrap">
                          #{o.switch_numero}
                        </span>
                      </>
                    ) : (
                      /* Envío activo SIN número. Hoy: 0 casos en los 4
                         catálogos. No se esconde en Borradores —está en
                         Switch— pero tampoco se inventa un número. */
                      <>
                        <span className="text-xs text-gray-300">·</span>
                        <span className="text-xs font-medium text-amber-700 whitespace-nowrap">
                          en Switch, sin número
                        </span>
                      </>
                    )
                  )}
                </div>
              </div>
              <span className="text-sm font-semibold tabular-nums">${fmt(o.total)}</span>
              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                <button onClick={() => setDupTarget(o)} className="text-xs text-gray-300 hover:text-blue-500 hover:bg-gray-100 transition px-3 py-2 rounded" title="Duplicar">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                </button>
                {canDelete && (
                  <button onClick={() => setDeleteTarget(o)} className="text-xs text-gray-300 hover:text-red-500 hover:bg-gray-100 transition px-3 py-2 rounded" title="Eliminar">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {dupTarget && (
        <DuplicarPedidoModal
          orderNumber={dupTarget.order_number}
          api={theme.api}
          directorioLabel={theme.switchDirectorioLabel}
          duplicando={duplicating}
          error={dupError}
          onElegir={(nombre, cliente) => duplicateOrder(dupTarget, nombre, cliente)}
          onCancel={() => { setDupTarget(null); setDupError(null); }}
        />
      )}

      <ConfirmDeleteModal
        open={!!deleteTarget}
        title={`¿Eliminar pedido ${deleteTarget?.order_number || ""}?`}
        description={`Se eliminará el pedido de ${deleteTarget?.client_name || ""} con ${deleteTarget?.item_count || 0} items ($${fmt(deleteTarget?.total || 0)}). Esta acción no se puede deshacer.`}
        onConfirm={deleteOrder}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />
    </div>
  );
}
