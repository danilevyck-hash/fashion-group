"use client";

// Página de Mobiliario (inventario de muebles). 4 cards de métricas, tabla de
// productos editable, tabla de reparto por tienda con expand para editar la
// entrega. Ruta de página: /marketing/mobiliario. La API interna sigue en
// /api/marketing/inventario/* (plomería, datos intactos).

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { useToast } from "@/components/ToastSystem";
import { ConfirmDeleteModal, ConfirmModal } from "@/components/ui";
import { formatearMonto } from "@/lib/marketing/normalizar";
import { resumirPorTienda } from "@/lib/marketing/inventario-resumen";
import EntregaForm from "@/components/marketing/EntregaForm";
import { useFormModalDismiss } from "@/lib/hooks/useModalDismiss";
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
  precioOriginal: number | null; // precio al abrir (para detectar cambio)
}

// Impacto de cambiar el precio (preview del endpoint impacto-precio).
interface ImpactoPrecio {
  entregasAfectadas: number;
  totalAntes: number;
  totalDespues: number;
  delta: number;
}

export default function MobiliarioPage() {
  const router = useRouter();
  const { authChecked, role } = useAuth({
    moduleKey: "marketing",
    allowedRoles: ["admin", "secretaria"],
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
  // Confirmación de precio vivo: impacto a mostrar antes de aplicar el cambio.
  const [confirmPrecio, setConfirmPrecio] = useState<ImpactoPrecio | null>(null);
  const [checkingPrecio, setCheckingPrecio] = useState(false);
  const [deleteProd, setDeleteProd] = useState<MkInventarioProducto | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

  const [editEntrega, setEditEntrega] = useState<EntregaConItems | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  // Clic fuera + Escape en el modal de producto. Si ya editó algún campo, no
  // cierra (se sale con Cancelar) para no perder lo escrito.
  const cerrarEditProd = useCallback(() => setEditProd(null), []);
  const editProdDismiss = useFormModalDismiss(
    editProd !== null,
    cerrarEditProd,
    !savingProd,
  );


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

      // Cargar proyectos relacionados (solo los que tienen entrega asignada,
      // necesarios para mostrar nombre de tienda en filas asignadas).
      const proyIds = Array.from(
        new Set(
          eData
            .map((e) => e.proyecto_id)
            .filter((id): id is string => id !== null),
        ),
      );
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

  // Agregado por tienda: 1 fila por tienda con total de paneles + monto (100%)
  // por marca. Toda entrega tiene proyecto_id (la tienda sale de proyecto.tienda).
  const { filas: resumenFilas, marcas: resumenMarcas } = useMemo(() => {
    const proyectos: MkProyecto[] = Array.from(proyectoById.values());
    return resumirPorTienda(entregas, proyectos, productos, marcas);
  }, [entregas, proyectoById, productos, marcas]);

  const totalResumen = useMemo(() => {
    const montoPorMarca: Record<string, number> = {};
    let totalPaneles = 0;
    let totalMonto = 0;
    for (const f of resumenFilas) {
      totalPaneles += f.totalPaneles;
      totalMonto += f.totalMonto;
      for (const [mid, m] of Object.entries(f.montoPorMarca)) {
        montoPorMarca[mid] = (montoPorMarca[mid] ?? 0) + m;
      }
    }
    for (const k of Object.keys(montoPorMarca)) {
      montoPorMarca[k] = Math.round(montoPorMarca[k] * 100) / 100;
    }
    return {
      totalPaneles,
      montoPorMarca,
      totalMonto: Math.round(totalMonto * 100) / 100,
    };
  }, [resumenFilas]);


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
    setEditProd({
      id: null,
      nombre: "",
      precio: "0",
      stockTotal: "0",
      precioOriginal: null,
    });
  };
  const abrirEditarProducto = (p: MkInventarioProducto) => {
    setEditProd({
      id: p.id,
      nombre: p.nombre,
      precio: String(p.precio),
      stockTotal: String(p.stock_total),
      precioOriginal: Number(p.precio),
    });
  };

  // Escribe el producto (POST/PATCH). El PATCH propaga el precio vivo a las
  // entregas; la confirmación previa (si aplica) ya la maneja guardarProducto.
  const aplicarGuardarProducto = async () => {
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
      const data = (await res.json().catch(() => null)) as {
        impacto?: ImpactoPrecio | null;
      } | null;
      const n = data?.impacto?.entregasAfectadas ?? 0;
      toast(
        !editProd.id
          ? "Producto creado"
          : n > 0
            ? `Precio actualizado · ${n} ${n === 1 ? "entrega recalculada" : "entregas recalculadas"}`
            : "Producto actualizado",
        "success",
      );
      setConfirmPrecio(null);
      setEditProd(null);
      cargar();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error", "error");
    } finally {
      setSavingProd(false);
    }
  };

  const guardarProducto = async () => {
    if (!editProd) return;
    // Si es edición y el precio cambió, consultar el impacto antes de aplicar
    // y pedir confirmación si hay entregas afectadas (precio vivo).
    const cambioPrecio =
      editProd.id !== null &&
      editProd.precioOriginal !== null &&
      Math.abs(Number(editProd.precio) - editProd.precioOriginal) > 0.005;
    if (cambioPrecio) {
      setCheckingPrecio(true);
      try {
        const res = await fetch(
          `/api/marketing/inventario/productos/${editProd.id}/impacto-precio?precio=${Number(editProd.precio)}`,
          { cache: "no-store" },
        );
        if (res.ok) {
          const imp = (await res.json()) as ImpactoPrecio;
          if (imp.entregasAfectadas > 0) {
            setConfirmPrecio(imp);
            return; // espera confirmación → aplicarGuardarProducto
          }
        }
      } catch {
        /* si el preview falla, seguimos al guardado normal */
      } finally {
        setCheckingPrecio(false);
      }
    }
    await aplicarGuardarProducto();
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
      link.download = m?.[1] ?? "mobiliario.xlsx";
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

  const breadcrumbs = [{ label: "Mobiliario" }];

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
              Mobiliario
            </h1>
          </div>
          <button
            type="button"
            onClick={() => descargarExcel()}
            disabled={downloading === "global"}
            className="rounded-md border border-gray-300 bg-white text-gray-700 px-3 py-2 text-sm hover:bg-gray-50 active:scale-[0.97] transition disabled:opacity-60"
          >
            {downloading === "global" ? "Generando…" : "Descargar Excel"}
          </button>
        </div>

        {/* Resumen sutil — sin cards grandes, solo línea de texto. */}
        <div className="text-xs text-gray-500 tabular-nums">
          Valor total: {formatearMonto(metricas.valor)} · Entregado:{" "}
          {formatearMonto(metricas.entregado)} · Disponible:{" "}
          <span className="text-emerald-700">
            {formatearMonto(metricas.disponible)}
          </span>{" "}
          · Tiendas: {metricas.tiendas}
        </div>

        {/* Tabla productos */}
        <section className="space-y-1.5">
          <div className="flex items-center justify-between">
            <h2 className="text-xs uppercase tracking-wide text-gray-500 font-medium">
              Productos
            </h2>
            <button
              type="button"
              onClick={abrirNuevoProducto}
              className="text-xs text-gray-500 hover:text-black underline"
            >
              + Agregar producto
            </button>
          </div>
          <div className="rounded-[10px] border border-gray-200 overflow-hidden bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-xs uppercase tracking-wide text-gray-500">
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

        {/* Resumen por tienda — formato changalo. Toma TODAS las entregas
            (incluidas pendientes), agrupa por tienda (proyecto.tienda o notas),
            y reparte Paneles + montos entre Fashion Wear y Vistana. */}
        <section className="space-y-1.5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xs uppercase tracking-wide text-gray-500 font-medium">
                Resumen por tienda
              </h2>
            </div>
            <button
              type="button"
              onClick={() => descargarExcel()}
              disabled={downloading === "global"}
              className="text-xs text-gray-500 hover:text-black underline disabled:opacity-60"
            >
              {downloading === "global" ? "Generando…" : "Descargar Excel"}
            </button>
          </div>
          <div className="rounded-[10px] border border-gray-200 overflow-hidden bg-white">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-gray-50">
                <tr className="text-xs uppercase tracking-wide text-gray-500">
                  <th className="text-left font-medium px-3 py-2">Cliente</th>
                  <th className="text-right font-medium px-3 py-2 w-28">
                    Total Paneles
                  </th>
                  {resumenMarcas.map((m) => (
                    <th
                      key={m.id}
                      className="text-right font-medium px-3 py-2 w-28"
                    >
                      $ {m.nombre}
                    </th>
                  ))}
                  <th className="text-right font-medium px-3 py-2 w-28">
                    Total $
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={resumenMarcas.length + 3}
                      className="px-3 py-6 text-center text-gray-400 text-sm"
                    >
                      Cargando…
                    </td>
                  </tr>
                ) : resumenFilas.length === 0 ? (
                  <tr>
                    <td
                      colSpan={resumenMarcas.length + 3}
                      className="px-3 py-6 text-center text-gray-400 text-sm"
                    >
                      Aún no hay entregas registradas.
                    </td>
                  </tr>
                ) : (
                  <>
                    {resumenFilas.map((f) => (
                      <tr
                        key={f.tienda}
                        className="border-t border-gray-100 hover:bg-gray-50 transition-colors"
                      >
                        <td className="px-3 py-2 text-gray-900">{f.tienda}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-700">
                          {f.totalPaneles > 0 ? (
                            f.totalPaneles
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        {resumenMarcas.map((m) => {
                          const monto = f.montoPorMarca[m.id] ?? 0;
                          return (
                            <td
                              key={m.id}
                              className="px-3 py-2 text-right font-mono tabular-nums"
                            >
                              {monto > 0 ? (
                                formatearMonto(monto)
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold text-gray-900">
                          {f.totalMonto > 0 ? (
                            formatearMonto(f.totalMonto)
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {/* Fila TOTAL — fondo oscuro para contraste con el módulo. */}
                    <tr className="border-t border-gray-300 bg-gray-900 text-white">
                      <td className="px-3 py-2.5 font-bold uppercase text-xs tracking-wide">
                        Total
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums font-bold">
                        {totalResumen.totalPaneles || (
                          <span className="opacity-50">—</span>
                        )}
                      </td>
                      {resumenMarcas.map((m) => {
                        const monto = totalResumen.montoPorMarca[m.id] ?? 0;
                        return (
                          <td
                            key={m.id}
                            className="px-3 py-2.5 text-right font-mono tabular-nums font-bold"
                          >
                            {monto > 0 ? formatearMonto(monto) : "—"}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums font-bold">
                        {totalResumen.totalMonto > 0
                          ? formatearMonto(totalResumen.totalMonto)
                          : "—"}
                      </td>
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
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            {...editProdDismiss.backdrop}
          />
          <div
            ref={editProdDismiss.panelRef}
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
                disabled={savingProd || checkingPrecio || !editProd.nombre.trim()}
                className="rounded-md bg-black text-white px-4 py-2 text-sm font-medium active:scale-[0.97] transition disabled:opacity-50"
              >
                {checkingPrecio
                  ? "Revisando…"
                  : savingProd
                    ? "Guardando…"
                    : "Guardar"}
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

      {/* Confirmación de precio vivo: el cambio recalcula entregas existentes. */}
      <ConfirmModal
        open={confirmPrecio !== null}
        title="Actualizar precio y entregas"
        message={
          confirmPrecio
            ? `Este precio se usa en ${confirmPrecio.entregasAfectadas} ${
                confirmPrecio.entregasAfectadas === 1 ? "entrega" : "entregas"
              }. Al cambiarlo, el total de muebles pasa de ${formatearMonto(
                confirmPrecio.totalAntes,
              )} a ${formatearMonto(confirmPrecio.totalDespues)} (${
                confirmPrecio.delta >= 0 ? "+" : "−"
              }${formatearMonto(Math.abs(confirmPrecio.delta))}). ¿Aplicar a todas?`
            : ""
        }
        confirmLabel="Sí, aplicar a todas"
        loading={savingProd}
        onConfirm={aplicarGuardarProducto}
        onClose={() => setConfirmPrecio(null)}
      />

      {/* Modal editar entrega — usa marcas asignadas al proyecto */}
      {editEntrega && (() => {
        const proy = editEntrega.proyecto_id
          ? proyectoConMarcasById.get(editEntrega.proyecto_id)
          : null;
        const marcasParaEntrega: MarcaConPorcentaje[] =
          proy?.marcas ?? [];
        const proyNombre = proy?.nombre || proy?.tienda || "Proyecto";
        return (
          <EntregaForm
            open={true}
            proyectoId={editEntrega.proyecto_id ?? ""}
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
      <div className="text-xs uppercase tracking-wide text-gray-500">
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
