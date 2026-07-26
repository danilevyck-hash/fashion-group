"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmModal, ConfirmDeleteModal } from "@/components/ui";
import BulkDeletePedidosModal from "@/components/catalogo/BulkDeletePedidosModal";
import { getMarcaTheme, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";
import { precioTexto } from "@/lib/catalogo/precio";

// Pestaña Pedidos del admin — ÚNICA por marca (PR-2, antes gemelos ~83%
// idénticos). Fila de la vista unificada (presenciales + del link); el total
// ya viene recalculado por el endpoint /pedidos-unificado.
export interface UnifiedPedido {
  origen: "mio" | "link";
  id_natural: string;
  cliente: string;
  total: number;
  created_at: string;
  vendor: string | null;
  item_count: number;
  // Tabla física de origen. El badge usa `origen`; el routing del detalle y el
  // borrado usan `fuente` (una pública convertida vive en <marca>_orders pero se
  // muestra como "Del link").
  fuente?: "orders" | "publicos";
  // Cuándo confirmó el CLIENTE desde el link (null/ausente si no ha confirmado).
  confirmado_cliente_at?: string | null;
  // numero_interno del envío ACTIVO en Switch (null si nunca se envió). La
  // eliminación masiva lo usa para avisar "sigue en Switch — anúlalo allá".
  switch_numero?: string | null;
}

// Precio de catálogo: sin `.00` y sin redondear (`35`, `12.50`, `4,422`).
const fmtMoney = precioTexto;

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("es-PA", { day: "numeric", month: "short", year: "numeric" }).replace(".", "");
}

// Agrupación por MES (fecha local, igual que fmtDate).
function mesKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function mesLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-PA", { month: "long", year: "numeric" });
}

type OrigenFilter = "todos" | "link" | "mio";

function OrigenBadge({ marca, origen, confirmadoCliente }: { marca: MarcaUiKey; origen: "mio" | "link"; confirmadoCliente?: boolean }) {
  const theme = getMarcaTheme(marca)!;
  if (origen === "link") {
    return (
      <span
        title={confirmadoCliente ? "Del link · Confirmado por el cliente" : undefined}
        className={theme.admin.pedidos.linkBadge}
      >
        Del link
        {confirmadoCliente && (
          <svg className={theme.admin.pedidos.linkBadgeCheck} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
      Mío
    </span>
  );
}

// Header de mes colapsable (patrón TimeGroupHeader). Mes actual abierto por
// defecto; los demás cerrados. Controlado por el padre: la selección masiva
// necesita saber qué meses están expandidos ("Seleccionar todos" solo toma
// filas visibles — un mes colapsado no aporta).
function MesGroup({
  label,
  count,
  open,
  onToggle,
  children,
}: {
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-1 py-2 text-left"
      >
        <svg
          className={`w-3 h-3 text-gray-400 transition-transform shrink-0 ${open ? "rotate-90" : ""}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M6 4l8 6-8 6V4z" />
        </svg>
        <span className="text-sm font-semibold text-gray-700 capitalize">{label}</span>
        <span className="text-xs text-gray-400 tabular-nums">
          ({count} {count === 1 ? "pedido" : "pedidos"})
        </span>
      </button>
      {open && children}
    </div>
  );
}

export default function PedidosTab({
  marca,
  pedidos,
  onRefresh,
  showToast,
}: {
  marca: MarcaUiKey;
  pedidos: UnifiedPedido[];
  onRefresh: () => Promise<void>;
  showToast: (msg: string) => void;
}) {
  const theme = getMarcaTheme(marca)!;
  const router = useRouter();
  const [origenFilter, setOrigenFilter] = useState<OrigenFilter>("todos");
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<UnifiedPedido | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [converting, setConverting] = useState<string | null>(null);
  // Selección masiva. `selected` guarda keys fuente-id; qué cuenta de verdad
  // es la intersección con las filas VISIBLES (filtro actual + mes expandido)
  // — lo que no se ve nunca se elimina. `openMeses` controla los MesGroup
  // (default: solo el mes actual abierto).
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openMeses, setOpenMeses] = useState<Record<string, boolean>>({});
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);

  // "Editar del link": convierte la pública en <marca>_orders (idempotente) y
  // redirige a la maquinaria de edición existente. El origen se conserva —
  // el pedido sigue mostrándose como "Del link".
  async function handleEditLink(p: UnifiedPedido) {
    if (converting) return;
    setConverting(p.id_natural);
    try {
      const res = await fetch(
        `${theme.api}/pedidos-publicos/${p.id_natural}/convertir`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error("convert failed");
      const data = await res.json();
      if (!data?.order_id) throw new Error("sin order_id");
      router.push(`/catalogo/${marca}/pedido/${data.order_id}`);
    } catch {
      showToast("No se pudo abrir el pedido para editar. Intenta de nuevo.");
      setConverting(null);
    }
  }

  async function handleExport() {
    if (exporting) return;
    setExporting(true);
    try {
      const res = await fetch(`${theme.api}/pedidos-export`, { method: "POST" });
      if (!res.ok) throw new Error("export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${theme.admin.pedidos.exportFilename}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Excel listo — revisa tu carpeta de descargas");
    } catch {
      showToast("No se pudo generar el Excel. Intenta de nuevo.");
    } finally {
      setExporting(false);
    }
  }

  const counts = {
    todos: pedidos.length,
    link: pedidos.filter((p) => p.origen === "link").length,
    mio: pedidos.filter((p) => p.origen === "mio").length,
  };

  const filtered = pedidos.filter((p) => {
    if (origenFilter !== "todos" && p.origen !== origenFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!(p.cliente || "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // El detalle se enruta por la tabla física (fuente), no por el badge: una
  // pública convertida vive en <marca>_orders y se abre en el detalle interno.
  // Fallback por `origen` si la vista aún no expone `fuente`.
  function isOrdersRow(p: UnifiedPedido): boolean {
    return p.fuente ? p.fuente === "orders" : p.origen === "mio";
  }
  function detailHref(p: UnifiedPedido): string {
    return isOrdersRow(p)
      ? `/catalogo/${marca}/pedido/${p.id_natural}`
      : `${theme.pedidoPublicoBase}/${p.id_natural}`;
  }

  // Abrir el editor de un pedido. Del link (público sin convertir) → convierte y
  // redirige (handleEditLink); interno/orders → abre su detalle directo.
  function handleEdit(p: UnifiedPedido) {
    if (isOrdersRow(p)) {
      router.push(`/catalogo/${marca}/pedido/${p.id_natural}`);
    } else {
      handleEditLink(p);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      // Borrado SOFT por tabla física (fuente): orders → <marca>_orders,
      // publicos → <marca>_pedidos_publicos. Ninguno toca Switch.
      const url = isOrdersRow(deleting)
        ? `${theme.api}/orders/${deleting.id_natural}`
        : `${theme.api}/pedidos-publicos/${deleting.id_natural}`;
      const res = await fetch(url, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      showToast("Pedido borrado");
      setDeleting(null);
      await onRefresh();
    } catch {
      showToast("No se pudo borrar el pedido");
    } finally {
      setDeleteLoading(false);
    }
  }

  const filterTabs: { key: OrigenFilter; label: string }[] = [
    { key: "todos", label: `Todos (${counts.todos})` },
    { key: "link", label: `Del link (${counts.link})` },
    { key: "mio", label: `Míos (${counts.mio})` },
  ];

  // Agrupar por mes (el API ya viene ordenado por fecha desc → los grupos salen
  // en orden descendente). Mes actual expandido, los demás colapsados.
  const grupos: { key: string; label: string; items: UnifiedPedido[] }[] = [];
  for (const p of filtered) {
    const k = mesKey(p.created_at);
    const last = grupos[grupos.length - 1];
    if (last && last.key === k) last.items.push(p);
    else grupos.push({ key: k, label: mesLabel(p.created_at), items: [p] });
  }
  const mesActual = mesKey(new Date().toISOString());

  const isMesOpen = (k: string) => openMeses[k] ?? (k === mesActual);
  const rowKey = (p: UnifiedPedido) => `${p.fuente ?? p.origen}-${p.id_natural}`;
  const clienteLabel = (p: UnifiedPedido) =>
    p.cliente === "Sin nombre" || !p.cliente?.trim() ? "Sin nombre" : p.cliente;

  // Filas elegibles para selección masiva = las VISIBLES ahora mismo: pasan el
  // filtro/búsqueda actual Y su mes está expandido. Cambiar filtro o colapsar
  // un mes las saca de la selección efectiva automáticamente.
  const visibleRows = grupos.filter((g) => isMesOpen(g.key)).flatMap((g) => g.items);
  const selectedRows = visibleRows.filter((p) => selected.has(rowKey(p)));
  const allSelected = visibleRows.length > 0 && selectedRows.length === visibleRows.length;
  const selEnviados = selectedRows.filter((p) => !!p.switch_numero);
  const selSinEnviar = selectedRows.length - selEnviados.length;

  function toggleRow(p: UnifiedPedido) {
    const k = rowKey(p);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(visibleRows.map(rowKey)));
  }

  // Eliminación masiva: soft-delete por fuente en un solo POST. Igual que el
  // individual, NUNCA toca Switch — los ya enviados solo se ocultan.
  async function handleBulkDelete() {
    if (bulkLoading || selectedRows.length === 0) return;
    setBulkLoading(true);
    try {
      const res = await fetch(`${theme.api}/orders/bulk-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pedidos: selectedRows.map((p) => ({
            id: p.id_natural,
            fuente: isOrdersRow(p) ? "orders" : "publicos",
          })),
        }),
      });
      if (!res.ok) throw new Error("bulk delete failed");
      const data = await res.json();
      const n = Number(data?.eliminados) || 0;
      const f = Number(data?.fallidos) || 0;
      showToast(
        f > 0
          ? `${n} ${n === 1 ? "pedido eliminado" : "pedidos eliminados"} — ${f} no se ${f === 1 ? "pudo" : "pudieron"} eliminar`
          : `${n} ${n === 1 ? "pedido eliminado" : "pedidos eliminados"}`,
      );
      setBulkOpen(false);
      setSelected(new Set());
      await onRefresh();
    } catch {
      showToast("No se pudieron eliminar los pedidos. Intenta de nuevo.");
    } finally {
      setBulkLoading(false);
    }
  }

  const deleteMsg = deleting
    ? `¿Eliminar el pedido de ${clienteLabel(deleting) === "Sin nombre" ? "cliente sin nombre" : deleting.cliente} por $${fmtMoney(deleting.total)}? Desaparecerá de la lista. No se envía nada a Switch.`
    : "";

  return (
    <div>
      {/* Acciones */}
      <div className="flex justify-end mb-4">
        <button
          onClick={handleExport}
          disabled={exporting || pedidos.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border border-gray-200 text-gray-700 hover:bg-gray-50 active:scale-[0.97] transition disabled:opacity-50"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          {exporting ? "Generando..." : "Exportar Excel"}
        </button>
      </div>

      {/* Filtros por origen */}
      <div className="flex gap-1 mb-4 border-b border-gray-200 overflow-x-auto">
        {filterTabs.map((ft) => {
          const active = origenFilter === ft.key;
          return (
            <button
              key={ft.key}
              onClick={() => setOrigenFilter(ft.key)}
              className={`px-3 py-2 text-sm font-medium -mb-px border-b-2 whitespace-nowrap transition ${
                active
                  ? theme.admin.pedidos.filterActive
                  : "text-gray-400 border-transparent hover:text-gray-600"
              }`}
            >
              {ft.label}
            </button>
          );
        })}
      </div>

      {/* Buscador por cliente */}
      <div className="relative mb-4">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por cliente…"
          className={theme.admin.pedidos.searchFocus}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-400 text-sm">
            {search || origenFilter !== "todos" ? "Ningún pedido coincide" : "No hay pedidos aún"}
          </p>
        </div>
      ) : (
        <>
        {/* Selección masiva: "todos" = filas visibles (filtro actual + meses
            expandidos). El botón rojo aparece solo con selección. */}
        <div className="flex items-center justify-between gap-3 mb-3 min-h-[38px]">
          <label className="inline-flex items-center gap-2 px-1 text-sm text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="w-4 h-4 accent-black cursor-pointer"
            />
            Seleccionar todos
          </label>
          {selectedRows.length > 0 && (
            <button
              onClick={() => setBulkOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-red-600 text-white hover:bg-red-700 active:scale-[0.97] transition"
            >
              Eliminar seleccionados ({selectedRows.length})
            </button>
          )}
        </div>
        {grupos.map((grupo) => (
        <MesGroup
          key={grupo.key}
          label={grupo.label}
          count={grupo.items.length}
          open={isMesOpen(grupo.key)}
          onToggle={() => setOpenMeses((prev) => ({ ...prev, [grupo.key]: !isMesOpen(grupo.key) }))}
        >
        <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="w-8 pl-4 pr-1 py-3"></th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Origen</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Cliente</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Total</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Fecha</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {grupo.items.map((pedido) => (
                <tr
                  key={`${pedido.fuente ?? pedido.origen}-${pedido.id_natural}`}
                  onClick={() => router.push(detailHref(pedido))}
                  className="hover:bg-gray-50 transition cursor-pointer"
                >
                  <td className="w-8 pl-4 pr-1 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(rowKey(pedido))}
                      onChange={() => toggleRow(pedido)}
                      className="w-4 h-4 accent-black cursor-pointer align-middle"
                      aria-label={`Seleccionar pedido de ${clienteLabel(pedido)}`}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <OrigenBadge marca={marca} origen={pedido.origen} confirmadoCliente={!!pedido.confirmado_cliente_at} />
                  </td>
                  <td className="px-4 py-3 text-gray-900">
                    {clienteLabel(pedido) === "Sin nombre" ? (
                      <span className="text-gray-300 italic">Sin nombre</span>
                    ) : (
                      pedido.cliente
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 tabular-nums">
                    ${fmtMoney(pedido.total)}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{fmtDate(pedido.created_at)}</td>
                  <td className="px-4 py-3 text-right">
                    {/* Editar/Eliminar en TODAS las filas (Mío y Del link).
                        Editar: orders → abre su detalle; público sin convertir →
                        convierte y abre. Eliminar: soft-delete por fuente. */}
                    <div className="inline-flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEdit(pedido);
                        }}
                        disabled={converting === pedido.id_natural}
                        className="px-2.5 py-1 rounded-md border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
                      >
                        {converting === pedido.id_natural ? "Abriendo..." : "Editar"}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleting(pedido);
                        }}
                        className="px-2.5 py-1 rounded-md border border-red-200 text-xs text-red-600 hover:bg-red-50 transition"
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </MesGroup>
        ))}
        </>
      )}

      <BulkDeletePedidosModal
        open={bulkOpen}
        sinEnviar={selSinEnviar}
        enviados={selEnviados.map((p) => ({
          key: rowKey(p),
          cliente: clienteLabel(p),
          numero: p.switch_numero as string,
        }))}
        onConfirm={handleBulkDelete}
        onCancel={() => !bulkLoading && setBulkOpen(false)}
        loading={bulkLoading}
      />

      {/* Modal de borrado individual — estilo por marca (quirk heredado):
          Reebok usa ConfirmModal; Joybees ConfirmDeleteModal (delay 1s). */}
      {theme.admin.pedidos.deleteModal === "confirm" ? (
        <ConfirmModal
          open={!!deleting}
          onClose={() => !deleteLoading && setDeleting(null)}
          onConfirm={handleDelete}
          title="¿Eliminar pedido?"
          message={deleteMsg}
          confirmLabel="Eliminar pedido"
          destructive
          loading={deleteLoading}
        />
      ) : (
        <ConfirmDeleteModal
          open={!!deleting}
          onCancel={() => !deleteLoading && setDeleting(null)}
          onConfirm={handleDelete}
          title="¿Eliminar pedido?"
          description={deleteMsg}
          loading={deleteLoading}
        />
      )}
    </div>
  );
}
