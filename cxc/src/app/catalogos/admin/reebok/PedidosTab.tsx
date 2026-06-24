"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmModal } from "@/components/ui";

// Fila de la vista unificada (presenciales + del link). El total ya viene
// recalculado por el endpoint /pedidos-unificado.
export interface UnifiedPedido {
  origen: "mio" | "link";
  id_natural: string;
  cliente: string;
  total: number;
  created_at: string;
  vendor: string | null;
  item_count: number;
  // Tabla física de origen. El badge usa `origen`; el routing del detalle y el
  // borrado usan `fuente` (una pública convertida vive en reebok_orders pero se
  // muestra como "Del link").
  fuente?: "orders" | "publicos";
}

function fmtMoney(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("es-PA", { day: "numeric", month: "short", year: "numeric" }).replace(".", "");
}

type OrigenFilter = "todos" | "link" | "mio";

function OrigenBadge({ origen }: { origen: "mio" | "link" }) {
  if (origen === "link") {
    return (
      <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
        Del link
      </span>
    );
  }
  return (
    <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
      Mío
    </span>
  );
}

export default function PedidosTab({
  pedidos,
  onRefresh,
  showToast,
}: {
  pedidos: UnifiedPedido[];
  onRefresh: () => Promise<void>;
  showToast: (msg: string) => void;
}) {
  const router = useRouter();
  const [origenFilter, setOrigenFilter] = useState<OrigenFilter>("todos");
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<UnifiedPedido | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [converting, setConverting] = useState<string | null>(null);

  // "Editar del link": convierte la pública en reebok_orders (idempotente) y
  // redirige a la maquinaria de edición existente. El origen se conserva
  // (origen_original='link') — el pedido sigue mostrándose como "Del link".
  async function handleEditLink(p: UnifiedPedido) {
    if (converting) return;
    setConverting(p.id_natural);
    try {
      const res = await fetch(
        `/api/catalogo/reebok/pedidos-publicos/${p.id_natural}/convertir`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error("convert failed");
      const data = await res.json();
      if (!data?.order_id) throw new Error("sin order_id");
      router.push(`/catalogo/reebok/pedido/${data.order_id}`);
    } catch {
      showToast("No se pudo abrir el pedido para editar. Intenta de nuevo.");
      setConverting(null);
    }
  }

  async function handleExport() {
    if (exporting) return;
    setExporting(true);
    try {
      const res = await fetch("/api/catalogo/reebok/pedidos-export", { method: "POST" });
      if (!res.ok) throw new Error("export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Pedidos-Reebok-${new Date().toISOString().slice(0, 10)}.xlsx`;
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
      if (!p.cliente.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // El detalle se enruta por la tabla física (fuente), no por el badge: una
  // pública convertida vive en reebok_orders y se abre en el detalle interno.
  // Fallback por `origen` si la vista aún no expone `fuente`.
  function isOrdersRow(p: UnifiedPedido): boolean {
    return p.fuente ? p.fuente === "orders" : p.origen === "mio";
  }
  function detailHref(p: UnifiedPedido): string {
    return isOrdersRow(p)
      ? `/catalogo/reebok/pedido/${p.id_natural}`
      : `/pedido-reebok/${p.id_natural}`;
  }

  async function handleDelete() {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      // Borrar inline sólo aplica a pedidos del link (short_id en pedidos_publicos).
      const res = await fetch(
        `/api/catalogo/reebok/pedidos-publicos/${deleting.id_natural}`,
        { method: "DELETE" },
      );
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
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {filterTabs.map((ft) => {
          const active = origenFilter === ft.key;
          return (
            <button
              key={ft.key}
              onClick={() => setOrigenFilter(ft.key)}
              className={`px-3 py-2 text-sm font-medium -mb-px border-b-2 transition ${
                active
                  ? "text-[#1A2656] border-[#1A2656]"
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
          placeholder="Buscar por cliente..."
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:border-[#1A2656]/30 transition"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-400 text-sm">
            {search || origenFilter !== "todos" ? "Ningún pedido coincide" : "No hay pedidos aún"}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-500">Origen</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Cliente</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Total</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Fecha</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((pedido) => (
                <tr
                  key={`${pedido.fuente ?? pedido.origen}-${pedido.id_natural}`}
                  onClick={() => router.push(detailHref(pedido))}
                  className="hover:bg-gray-50 transition cursor-pointer"
                >
                  <td className="px-4 py-3">
                    <OrigenBadge origen={pedido.origen} />
                  </td>
                  <td className="px-4 py-3 text-gray-900">
                    {pedido.cliente === "Sin nombre" ? (
                      <span className="text-gray-300 italic">Sin nombre</span>
                    ) : (
                      pedido.cliente
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 tabular-nums">
                    ${fmtMoney(pedido.total)}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(pedido.created_at)}</td>
                  <td className="px-4 py-3 text-right">
                    {/* Editar/Borrar inline sólo para públicas NO convertidas
                        (viven en pedidos_publicos con short_id). Una convertida
                        ya es un reebok_orders: se edita abriéndola con clic. */}
                    {(pedido.fuente ? pedido.fuente === "publicos" : pedido.origen === "link") && (
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditLink(pedido);
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
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmModal
        open={!!deleting}
        onClose={() => !deleteLoading && setDeleting(null)}
        onConfirm={handleDelete}
        title="¿Eliminar pedido?"
        message={
          deleting
            ? `¿Eliminar el pedido de ${deleting.cliente === "Sin nombre" ? "cliente sin nombre" : deleting.cliente} por $${fmtMoney(deleting.total)}? Esta acción no se puede deshacer.`
            : ""
        }
        confirmLabel="Eliminar pedido"
        destructive
        loading={deleteLoading}
      />
    </div>
  );
}
