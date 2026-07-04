"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDeleteModal } from "@/components/ui";

// Pedido tal como lo devuelve GET /api/catalogo/joybees/orders.
export interface JoybeesPedido {
  id: string;
  order_number: string;
  client_name: string;
  vendor_name: string | null;
  total: number;
  status: PedidoStatus;
  created_at: string;
  item_count: number;
}

type PedidoStatus = "borrador" | "enviado" | "confirmado";
type StatusFilter = "todos" | PedidoStatus;

function fmtMoney(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("es-PA", { day: "numeric", month: "short", year: "numeric" }).replace(".", "");
}

const STATUS_LABEL: Record<PedidoStatus, string> = {
  borrador: "Borrador",
  enviado: "Enviado",
  confirmado: "Confirmado",
};

function StatusBadge({ status }: { status: PedidoStatus }) {
  const styles: Record<PedidoStatus, string> = {
    borrador: "bg-gray-100 text-gray-600",
    enviado: "bg-blue-50 text-blue-700",
    confirmado: "bg-green-50 text-green-700",
  };
  return (
    <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${styles[status]}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export default function PedidosTab({ showToast }: { showToast: (msg: string) => void }) {
  const router = useRouter();
  const [pedidos, setPedidos] = useState<JoybeesPedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<JoybeesPedido | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const loadPedidos = useCallback(async () => {
    try {
      const res = await fetch("/api/catalogo/joybees/orders");
      if (res.ok) {
        const data = await res.json();
        setPedidos(Array.isArray(data) ? data : []);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadPedidos().finally(() => setLoading(false));
  }, [loadPedidos]);

  async function handleExport() {
    if (exporting) return;
    setExporting(true);
    try {
      const res = await fetch("/api/catalogo/joybees/pedidos-export", { method: "POST" });
      if (!res.ok) throw new Error("export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Pedidos-Joybees-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Excel listo — revisa tu carpeta de descargas");
    } catch {
      showToast("No se pudo generar el Excel. Intenta de nuevo.");
    } finally {
      setExporting(false);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/catalogo/joybees/orders/${deleting.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      showToast("Pedido borrado");
      setDeleting(null);
      await loadPedidos();
    } catch {
      showToast("No se pudo borrar el pedido");
    } finally {
      setDeleteLoading(false);
    }
  }

  const counts = {
    todos: pedidos.length,
    borrador: pedidos.filter((p) => p.status === "borrador").length,
    enviado: pedidos.filter((p) => p.status === "enviado").length,
    confirmado: pedidos.filter((p) => p.status === "confirmado").length,
  };

  const filtered = pedidos.filter((p) => {
    if (statusFilter !== "todos" && p.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const cliente = (p.client_name || "").toLowerCase();
      const vendedor = (p.vendor_name || "").toLowerCase();
      if (!cliente.includes(q) && !vendedor.includes(q)) return false;
    }
    return true;
  });

  const filterTabs: { key: StatusFilter; label: string }[] = [
    { key: "todos", label: `Todos (${counts.todos})` },
    { key: "borrador", label: `Borrador (${counts.borrador})` },
    { key: "enviado", label: `Enviado (${counts.enviado})` },
    { key: "confirmado", label: `Confirmado (${counts.confirmado})` },
  ];

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-2 border-[#FFE443] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

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

      {/* Filtros por estado */}
      <div className="flex gap-1 mb-4 border-b border-gray-200 overflow-x-auto">
        {filterTabs.map((ft) => {
          const active = statusFilter === ft.key;
          return (
            <button
              key={ft.key}
              onClick={() => setStatusFilter(ft.key)}
              className={`px-3 py-2 text-sm font-medium -mb-px border-b-2 whitespace-nowrap transition ${
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

      {/* Buscador por cliente o vendedor */}
      <div className="relative mb-4">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por cliente o vendedor..."
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:border-[#FFE443] transition"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-400 text-sm">
            {search || statusFilter !== "todos" ? "Ningún pedido coincide" : "No hay pedidos aún"}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-500">Pedido</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Cliente</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Vendedor</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Items</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Total</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Estado</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Fecha</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((pedido) => (
                <tr
                  key={pedido.id}
                  onClick={() => router.push(`/catalogo/joybees/pedido/${pedido.id}`)}
                  className="hover:bg-gray-50 transition cursor-pointer"
                >
                  <td className="px-4 py-3 font-mono text-xs text-gray-600 whitespace-nowrap">
                    {pedido.order_number}
                  </td>
                  <td className="px-4 py-3 text-gray-900">
                    {pedido.client_name?.trim() ? (
                      pedido.client_name
                    ) : (
                      <span className="text-gray-300 italic">Sin nombre</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {pedido.vendor_name?.trim() || <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500 tabular-nums">{pedido.item_count}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 tabular-nums">
                    ${fmtMoney(pedido.total)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={pedido.status} />
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{fmtDate(pedido.created_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleting(pedido);
                      }}
                      className="px-2.5 py-1 rounded-md border border-red-200 text-xs text-red-600 hover:bg-red-50 transition"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDeleteModal
        open={!!deleting}
        onCancel={() => !deleteLoading && setDeleting(null)}
        onConfirm={handleDelete}
        title="¿Eliminar pedido?"
        description={
          deleting
            ? `¿Eliminar el pedido ${deleting.order_number} de ${deleting.client_name?.trim() ? deleting.client_name : "cliente sin nombre"} por $${fmtMoney(deleting.total)}? Esta acción no se puede deshacer.`
            : ""
        }
        loading={deleteLoading}
      />
    </div>
  );
}
