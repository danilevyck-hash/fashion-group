"use client";

// Página de inventario de muebles. 4 cards de métricas, tabla de productos
// editable, tabla de reparto por tienda con expand para editar la entrega.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { useToast } from "@/components/ToastSystem";
import { ConfirmDeleteModal } from "@/components/ui";
import { formatearMonto } from "@/lib/marketing/normalizar";
import EntregaForm from "@/components/marketing/EntregaForm";
import type {
  EntregaConItems,
  MarcaConPorcentaje,
  MkInventarioProducto,
  MkMarca,
  MkProyecto,
  ProyectoConMarcas,
} from "@/lib/marketing/types";

interface ProductoEditState {
  id: string | null; // null = nuevo
  nombre: string;
  precio: string;
  stockTotal: string;
}

export default function InventarioPage() {
  const router = useRouter();
  const { authChecked, role } = useAuth({
    moduleKey: "marketing",
    allowedRoles: ["admin", "secretaria", "director"],
  });
  const { toast } = useToast();

  const [productos, setProductos] = useState<MkInventarioProducto[]>([]);
  const [entregas, setEntregas] = useState<EntregaConItems[]>([]);
  const [proyectoById, setProyectoById] = useState<Map<string, MkProyecto>>(
    new Map(),
  );
  const [proyectoConMarcasById, setProyectoConMarcasById] = useState<
    Map<string, ProyectoConMarcas>
  >(new Map());
  const [marcas, setMarcas] = useState<MkMarca[]>([]);
  const [loading, setLoading] = useState(true);

  const [editProd, setEditProd] = useState<ProductoEditState | null>(null);
  const [savingProd, setSavingProd] = useState(false);
  const [deleteProd, setDeleteProd] = useState<MkInventarioProducto | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

  const [editEntrega, setEditEntrega] = useState<EntregaConItems | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, eRes, mRes] = await Promise.all([
        fetch("/api/marketing/inventario/productos", { cache: "no-store" }),
        fetch("/api/marketing/inventario/entregas", { cache: "no-store" }),
        fetch("/api/marketing/marcas", { cache: "no-store" }),
      ]);
      if (!pRes.ok) throw new Error("No se pudieron cargar productos");
      if (!eRes.ok) throw new Error("No se pudieron cargar entregas");
      const pData = (await pRes.json()) as MkInventarioProducto[];
      const eData = (await eRes.json()) as EntregaConItems[];
      const mData = mRes.ok ? ((await mRes.json()) as MkMarca[]) : [];
      setProductos(pData);
      setEntregas(eData);
      setMarcas(mData);

      // Cargar proyectos relacionados
      const proyIds = Array.from(new Set(eData.map((e) => e.proyecto_id)));
      const entries = await Promise.all(
        proyIds.map(async (id) => {
          try {
            const r = await fetch(`/api/marketing/proyectos/${id}`, {
              cache: "no-store",
            });
            if (!r.ok) return null;
            return (await r.json()) as ProyectoConMarcas;
          } catch {
            return null;
          }
        }),
      );
      const mapBasic = new Map<string, MkProyecto>();
      const mapFull = new Map<string, ProyectoConMarcas>();
      for (const p of entries) {
        if (!p) continue;
        mapBasic.set(p.id, p);
        mapFull.set(p.id, p);
      }
      setProyectoById(mapBasic);
      setProyectoConMarcasById(mapFull);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error";
      toast(msg, "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (authChecked) cargar();
  }, [authChecked, cargar]);

  // Métricas
  const metricas = useMemo(() => {
    const valor = productos.reduce(
      (s, p) => s + Number(p.precio) * Number(p.stock_total),
      0,
    );
    const entregado = entregas.reduce((s, e) => s + Number(e.total ?? 0), 0);
    const tiendas = new Set(entregas.map((e) => e.proyecto_id)).size;
    return {
      valor: Number(valor.toFixed(2)),
      entregado: Number(entregado.toFixed(2)),
      // "Disponible" como valor de stock actual (precio × stock disponible).
      // No es valor − entregado, porque entregado puede haber sido a precios
      // distintos del precio actual.
      disponible: Number(valor.toFixed(2)),
      tiendas,
    };
  }, [productos, entregas]);

  // Entregado por producto (para columna "Entregado" en tabla)
  const entregadoPorProducto = useMemo(() => {
    const out = new Map<string, number>();
    for (const e of entregas) {
      for (const it of e.items) {
        let total = 0;
        for (const v of Object.values(it.cantidad_por_marca ?? {})) {
          total += Number(v ?? 0);
        }
        out.set(it.producto_id, (out.get(it.producto_id) ?? 0) + total);
      }
    }
    return out;
  }, [entregas]);

  // Handlers
  const abrirNuevoProducto = () => {
    setEditProd({ id: null, nombre: "", precio: "0", stockTotal: "0" });
  };
  const abrirEditarProducto = (p: MkInventarioProducto) => {
    setEditProd({
      id: p.id,
      nombre: p.nombre,
      precio: String(p.precio),
      stockTotal: String(p.stock_total),
    });
  };

  const guardarProducto = async () => {
    if (!editProd) return;
    setSavingProd(true);
    try {
      const body = {
        nombre: editProd.nombre.trim(),
        precio: Number(editProd.precio),
        stockTotal: Number(editProd.stockTotal),
      };
      const url = editProd.id
        ? `/api/marketing/inventario/productos/${editProd.id}`
        : "/api/marketing/inventario/productos";
      const method = editProd.id ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "No se pudo guardar");
      }
      toast(editProd.id ? "Producto actualizado" : "Producto creado", "success");
      setEditProd(null);
      cargar();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error", "error");
    } finally {
      setSavingProd(false);
    }
  };

  const ejecutarBorrarProducto = async () => {
    if (!deleteProd) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/marketing/inventario/productos/${deleteProd.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "No se pudo eliminar");
      }
      toast("Producto eliminado", "success");
      setDeleteProd(null);
      cargar();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error", "error");
    } finally {
      setDeleting(false);
    }
  };

  const descargarExcel = async (proyectoId?: string) => {
    const id = proyectoId ?? "global";
    setDownloading(id);
    try {
      const url = proyectoId
        ? `/api/marketing/inventario/export?proyecto_id=${proyectoId}`
        : "/api/marketing/inventario/export";
      const res = await fetch(url);
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "No se pudo generar Excel");
      }
      const blob = await res.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      const cd = res.headers.get("Content-Disposition") ?? "";
      const m = cd.match(/filename="?([^"]+)"?/);
      link.download = m?.[1] ?? "inventario.xlsx";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      toast("Excel listo — revisa tu carpeta de descargas", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error", "error");
    } finally {
      setDownloading(null);
    }
  };

  if (!authChecked) return null;

  const breadcrumbs = [{ label: "Inventario" }];

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader module="Marketing" breadcrumbs={breadcrumbs} />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <button
              type="button"
              onClick={() => router.push("/marketing")}
              className="text-sm text-gray-600 hover:text-black transition inline-flex items-center gap-1 mb-2"
            >
              ← Proyectos
            </button>
            <h1 className="text-xl font-semibold text-gray-900">
              Inventario de muebles
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Productos, entregas a tiendas y reparto por marca
            </p>
          </div>
          <button
            type="button"
            onClick={() => descargarExcel()}
            disabled={downloading === "global"}
            className="rounded-md bg-black text-white px-3 py-2 text-sm active:scale-[0.97] transition disabled:opacity-60"
          >
            {downloading === "global" ? "Generando…" : "Descargar Excel"}
          </button>
        </div>

        {/* Cards métricas */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard label="Valor inventario" value={formatearMonto(metricas.valor)} />
          <MetricCard label="Entregado" value={formatearMonto(metricas.entregado)} />
          <MetricCard
            label="Disponible"
            value={formatearMonto(metricas.disponible)}
            valueClassName="text-emerald-700"
          />
          <MetricCard label="Tiendas servidas" value={String(metricas.tiendas)} />
        </div>

        {/* Tabla productos */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Productos</h2>
            <button
              type="button"
              onClick={abrirNuevoProducto}
              className="text-xs rounded-md border border-gray-300 bg-white text-gray-700 px-3 py-1.5 hover:bg-gray-50 transition"
            >
              + Agregar producto
            </button>
          </div>
          <div className="rounded-[10px] border border-gray-200 overflow-hidden bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-[11px] uppercase tracking-wider text-gray-500">
                  <th className="text-left font-medium px-3 py-2">Producto</th>
                  <th className="text-right font-medium px-3 py-2 w-24">Precio</th>
                  <th className="text-right font-medium px-3 py-2 w-24">Comprado</th>
                  <th className="text-right font-medium px-3 py-2 w-24">Entregado</th>
                  <th className="text-right font-medium px-3 py-2 w-24">Disponible</th>
                  <th className="text-right font-medium px-3 py-2 w-28">Valor</th>
                  <th className="text-right font-medium px-3 py-2 w-28">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-gray-400 text-sm">
                      Cargando…
                    </td>
                  </tr>
                ) : productos.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-gray-400 text-sm">
                      No hay productos. Agrega el primero.
                    </td>
                  </tr>
                ) : (
                  <>
                    {productos.map((p) => {
                      const entregado = entregadoPorProducto.get(p.id) ?? 0;
                      const comprado = entregado + Number(p.stock_total);
                      const valor = Number(p.precio) * Number(p.stock_total);
                      return (
                        <tr key={p.id} className="border-t border-gray-100">
                          <td className="px-3 py-2 text-gray-900">{p.nombre}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatearMonto(p.precio)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                            {comprado}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                            {entregado}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium">
                            {p.stock_total}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatearMonto(valor)}
                          </td>
                          <td className="px-3 py-2 text-right space-x-2">
                            <button
                              type="button"
                              onClick={() => abrirEditarProducto(p)}
                              className="text-xs text-gray-700 hover:text-black underline"
                            >
                              Editar
                            </button>
                            {role === "admin" && (
                              <button
                                type="button"
                                onClick={() => setDeleteProd(p)}
                                className="text-xs text-red-600 hover:text-red-800 underline"
                              >
                                Borrar
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="border-t border-gray-200 bg-gray-50/50 font-semibold text-gray-900">
                      <td className="px-3 py-2">TOTAL</td>
                      <td />
                      <td className="px-3 py-2 text-right tabular-nums">
                        {productos.reduce(
                          (s, p) =>
                            s + (entregadoPorProducto.get(p.id) ?? 0) + p.stock_total,
                          0,
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {productos.reduce(
                          (s, p) => s + (entregadoPorProducto.get(p.id) ?? 0),
                          0,
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {productos.reduce((s, p) => s + p.stock_total, 0)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatearMonto(metricas.valor)}
                      </td>
                      <td />
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Tabla reparto por tienda */}
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-gray-900">Reparto por tienda</h2>
          <div className="rounded-[10px] border border-gray-200 overflow-hidden bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-[11px] uppercase tracking-wider text-gray-500">
                  <th className="text-left font-medium px-3 py-2">Tienda</th>
                  <th className="text-left font-medium px-3 py-2 w-[260px]">Por marca</th>
                  <th className="text-right font-medium px-3 py-2 w-32">Total</th>
                  <th className="text-right font-medium px-3 py-2 w-40">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-gray-400 text-sm">
                      Cargando…
                    </td>
                  </tr>
                ) : entregas.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-gray-400 text-sm">
                      Aún no hay entregas registradas.
                    </td>
                  </tr>
                ) : (
                  <>
                    {entregas.map((e) => {
                      const proy = proyectoById.get(e.proyecto_id);
                      const tienda =
                        proy?.tienda || proy?.nombre || "(proyecto borrado)";
                      const tpm = e.total_por_marca ?? {};
                      return (
                        <tr key={e.id} className="border-t border-gray-100">
                          <td className="px-3 py-2 text-gray-900">{tienda}</td>
                          <td className="px-3 py-2 text-xs text-gray-600 space-y-0.5">
                            {Object.entries(tpm).length === 0 ? (
                              <span className="text-gray-300">—</span>
                            ) : (
                              Object.entries(tpm).map(([marcaId, monto]) => {
                                const m = marcas.find((mm) => mm.id === marcaId);
                                return (
                                  <div
                                    key={marcaId}
                                    className="flex justify-between gap-3"
                                  >
                                    <span>{m?.nombre ?? "Marca"}</span>
                                    <span className="font-mono tabular-nums text-gray-800">
                                      {formatearMonto(Number(monto ?? 0))}
                                    </span>
                                  </div>
                                );
                              })
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold text-gray-900">
                            {formatearMonto(e.total)}
                          </td>
                          <td className="px-3 py-2 text-right space-x-2">
                            <button
                              type="button"
                              onClick={() => setEditEntrega(e)}
                              className="text-xs text-gray-700 hover:text-black underline"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => descargarExcel(e.proyecto_id)}
                              disabled={downloading === e.proyecto_id}
                              className="text-xs text-gray-700 hover:text-black underline disabled:opacity-60"
                            >
                              {downloading === e.proyecto_id ? "…" : "Excel"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="border-t border-gray-200 bg-gray-50/50 font-semibold text-gray-900">
                      <td className="px-3 py-2">TOTAL</td>
                      <td />
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatearMonto(metricas.entregado)}
                      </td>
                      <td />
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {/* Modal edit/nuevo producto */}
      {editProd && (
        <div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
          onClick={() => !savingProd && setEditProd(null)}
        >
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative bg-white sm:rounded-lg rounded-t-2xl p-6 max-w-md w-full mx-0 sm:mx-4 border border-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold mb-4">
              {editProd.id ? "Editar producto" : "Nuevo producto"}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  Nombre<span className="text-red-500 ml-0.5">*</span>
                </label>
                <input
                  type="text"
                  value={editProd.nombre}
                  onChange={(e) =>
                    setEditProd({ ...editProd, nombre: e.target.value })
                  }
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Precio</label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={editProd.precio}
                    onChange={(e) =>
                      setEditProd({ ...editProd, precio: e.target.value })
                    }
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm tabular-nums focus:border-black focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Stock total</label>
                  <input
                    type="number"
                    step="1"
                    value={editProd.stockTotal}
                    onChange={(e) =>
                      setEditProd({ ...editProd, stockTotal: e.target.value })
                    }
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm tabular-nums focus:border-black focus:outline-none"
                  />
                </div>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditProd(null)}
                disabled={savingProd}
                className="rounded-md border border-gray-300 bg-white text-gray-700 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={guardarProducto}
                disabled={savingProd || !editProd.nombre.trim()}
                className="rounded-md bg-black text-white px-4 py-2 text-sm font-medium active:scale-[0.97] transition disabled:opacity-50"
              >
                {savingProd ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDeleteModal
        open={deleteProd !== null}
        title={deleteProd ? `Eliminar ${deleteProd.nombre}` : "Eliminar producto"}
        description="Esta acción no se puede deshacer. Si el producto está en alguna entrega, no se podrá eliminar."
        onConfirm={ejecutarBorrarProducto}
        onCancel={() => setDeleteProd(null)}
        loading={deleting}
      />

      {/* Modal editar entrega — usa marcas asignadas al proyecto */}
      {editEntrega && (() => {
        const proy = proyectoConMarcasById.get(editEntrega.proyecto_id);
        const marcasParaEntrega: MarcaConPorcentaje[] =
          proy?.marcas ?? [];
        const proyNombre = proy?.nombre || proy?.tienda || "Proyecto";
        return (
          <EntregaForm
            open={true}
            proyectoId={editEntrega.proyecto_id}
            proyectoNombre={proyNombre}
            marcasProyecto={marcasParaEntrega}
            productos={productos}
            initial={editEntrega}
            onClose={() => setEditEntrega(null)}
            onSaved={() => {
              setEditEntrega(null);
              cargar();
            }}
          />
        );
      })()}
    </div>
  );
}

function MetricCard({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="text-[10px] uppercase tracking-wider text-gray-500">
        {label}
      </div>
      <div
        className={`text-base font-semibold font-mono tabular-nums mt-1 ${
          valueClassName ?? "text-gray-900"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
