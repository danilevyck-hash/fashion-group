"use client";

// Form modal para crear/editar una entrega de muebles.
// Tabla con una fila por producto del inventario y una columna por cada marca
// asignada al proyecto. Cada celda es un input de cantidad. Total en vivo.
// No bloquea si supera stock — muestra warning naranja.

import { useEffect, useMemo, useState } from "react";
import type {
  EntregaConItems,
  EntregaItemInput,
  MarcaConPorcentaje,
  MkInventarioProducto,
} from "@/lib/marketing/types";
import { useToast } from "@/components/ToastSystem";
import { formatearMonto } from "@/lib/marketing/normalizar";

interface Props {
  open: boolean;
  proyectoId: string;
  proyectoNombre: string;
  marcasProyecto: MarcaConPorcentaje[];
  productos: MkInventarioProducto[];
  initial?: EntregaConItems | null;
  onClose: () => void;
  onSaved: () => void;
}

interface CeldaState {
  // {producto_id × marca_id} → cantidad como string (para input controlado)
  [key: string]: string;
}

function keyCell(productoId: string, marcaId: string): string {
  return `${productoId}::${marcaId}`;
}

function getCant(state: CeldaState, productoId: string, marcaId: string): number {
  const v = state[keyCell(productoId, marcaId)];
  if (v === undefined || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

export default function EntregaForm({
  open,
  proyectoId,
  proyectoNombre,
  marcasProyecto,
  productos,
  initial,
  onClose,
  onSaved,
}: Props) {
  const { toast } = useToast();
  const [cantidades, setCantidades] = useState<CeldaState>({});
  const [guardando, setGuardando] = useState(false);

  // Inicializar cantidades cuando se abre o cambia `initial`.
  useEffect(() => {
    if (!open) return;
    const next: CeldaState = {};
    if (initial?.items) {
      for (const it of initial.items) {
        for (const [marcaId, cant] of Object.entries(it.cantidad_por_marca ?? {})) {
          const n = Number(cant);
          if (Number.isFinite(n) && n > 0) {
            next[keyCell(it.producto_id, marcaId)] = String(n);
          }
        }
      }
    }
    setCantidades(next);
  }, [open, initial]);

  const setCelda = (productoId: string, marcaId: string, value: string) => {
    setCantidades((prev) => {
      const next = { ...prev };
      const clean = value.replace(/[^0-9]/g, "");
      if (clean === "" || clean === "0") {
        delete next[keyCell(productoId, marcaId)];
      } else {
        next[keyCell(productoId, marcaId)] = clean;
      }
      return next;
    });
  };

  // Cantidades previas por producto en esta misma entrega (para warning de stock)
  const previasPorProducto = useMemo<Map<string, number>>(() => {
    const out = new Map<string, number>();
    if (!initial?.items) return out;
    for (const it of initial.items) {
      let total = 0;
      for (const v of Object.values(it.cantidad_por_marca ?? {})) {
        total += Number(v ?? 0);
      }
      out.set(it.producto_id, total);
    }
    return out;
  }, [initial]);

  const productoById = useMemo(
    () => new Map(productos.map((p) => [p.id, p])),
    [productos],
  );

  // Totales por marca y total general (en vivo).
  const totalPorMarca = useMemo<Record<string, number>>(() => {
    const out: Record<string, number> = {};
    for (const p of productos) {
      for (const m of marcasProyecto) {
        const c = getCant(cantidades, p.id, m.marca.id);
        if (c <= 0) continue;
        out[m.marca.id] = (out[m.marca.id] ?? 0) + p.precio * c;
      }
    }
    for (const k of Object.keys(out)) {
      out[k] = Math.round(out[k] * 100) / 100;
    }
    return out;
  }, [cantidades, productos, marcasProyecto]);

  const totalGeneral = useMemo(() => {
    let t = 0;
    for (const v of Object.values(totalPorMarca)) t += v;
    return Math.round(t * 100) / 100;
  }, [totalPorMarca]);

  // Cantidades por producto (para warning de stock vs disponible)
  const cantPorProducto = useMemo<Map<string, number>>(() => {
    const out = new Map<string, number>();
    for (const p of productos) {
      let total = 0;
      for (const m of marcasProyecto) {
        total += getCant(cantidades, p.id, m.marca.id);
      }
      if (total > 0) out.set(p.id, total);
    }
    return out;
  }, [cantidades, productos, marcasProyecto]);

  const tieneAlgo = useMemo(
    () => Array.from(cantPorProducto.values()).some((v) => v > 0),
    [cantPorProducto],
  );

  const handleGuardar = async () => {
    if (!tieneAlgo) {
      toast("Agrega al menos una cantidad para guardar la entrega", "warning");
      return;
    }
    setGuardando(true);
    try {
      // Construir items: una fila por producto con cantidades > 0 en alguna marca.
      const items: EntregaItemInput[] = [];
      for (const p of productos) {
        const cantidadPorMarca: Record<string, number> = {};
        for (const m of marcasProyecto) {
          const c = getCant(cantidades, p.id, m.marca.id);
          if (c > 0) cantidadPorMarca[m.marca.id] = c;
        }
        if (Object.keys(cantidadPorMarca).length > 0) {
          items.push({ productoId: p.id, cantidadPorMarca });
        }
      }

      const url = initial
        ? `/api/marketing/inventario/entregas/${initial.id}`
        : "/api/marketing/inventario/entregas";
      const method = initial ? "PATCH" : "POST";
      const body = initial ? { items } : { proyectoId, items };
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "No se pudo guardar la entrega");
      }
      toast(initial ? "Entrega actualizada" : "Entrega registrada", "success");
      onSaved();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error", "error");
    } finally {
      setGuardando(false);
    }
  };

  const handleEliminar = async () => {
    if (!initial) return;
    if (!window.confirm("¿Eliminar esta entrega? El stock se devolverá al inventario.")) {
      return;
    }
    setGuardando(true);
    try {
      const res = await fetch(
        `/api/marketing/inventario/entregas/${initial.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "No se pudo eliminar");
      }
      toast("Entrega eliminada", "success");
      onSaved();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error", "error");
    } finally {
      setGuardando(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => !guardando && onClose()}
      />
      <div
        className="relative bg-white sm:rounded-lg rounded-t-2xl max-w-3xl w-full mx-0 sm:mx-4 border border-gray-200 max-h-[95vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              {initial ? "Editar entrega" : "Nueva entrega de muebles"}
            </h3>
            <p className="text-xs text-gray-500 truncate">{proyectoNombre}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={guardando}
            className="text-sm text-gray-500 hover:text-black transition disabled:opacity-50"
          >
            Cerrar
          </button>
        </div>

        <div className="p-6 space-y-4">
          {marcasProyecto.length === 0 ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Este proyecto no tiene marcas asignadas. Asigna marcas al proyecto
              antes de registrar una entrega.
            </div>
          ) : productos.length === 0 ? (
            <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
              No hay productos en el inventario. Agrega productos en{" "}
              <span className="underline">/marketing/inventario</span> primero.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-200">
                      <th className="text-left font-medium px-3 py-2">Producto</th>
                      <th className="text-right font-medium px-3 py-2 w-20">
                        Precio
                      </th>
                      {marcasProyecto.map((m) => (
                        <th
                          key={m.marca.id}
                          className="text-center font-medium px-3 py-2 w-28"
                          title={m.marca.nombre}
                        >
                          {m.marca.nombre}
                        </th>
                      ))}
                      <th className="text-right font-medium px-3 py-2 w-24">
                        Costo línea
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {productos.map((p) => {
                      const cantTotal = cantPorProducto.get(p.id) ?? 0;
                      const previa = previasPorProducto.get(p.id) ?? 0;
                      const efectivo = (p.stock_total ?? 0) + previa;
                      const supera = cantTotal > efectivo;
                      const costoLinea = p.precio * cantTotal;
                      return (
                        <tr
                          key={p.id}
                          className="border-b border-gray-100 hover:bg-gray-50/50"
                        >
                          <td className="px-3 py-2">
                            <div className="text-sm text-gray-900">{p.nombre}</div>
                            <div className="text-[11px] text-gray-400">
                              Stock disponible:{" "}
                              <span className={supera ? "text-orange-600 font-medium" : ""}>
                                {efectivo}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                            {formatearMonto(p.precio)}
                          </td>
                          {marcasProyecto.map((m) => {
                            const v = cantidades[keyCell(p.id, m.marca.id)] ?? "";
                            return (
                              <td key={m.marca.id} className="px-2 py-2">
                                <input
                                  type="number"
                                  min={0}
                                  step={1}
                                  value={v}
                                  onChange={(e) =>
                                    setCelda(p.id, m.marca.id, e.target.value)
                                  }
                                  disabled={guardando}
                                  className="w-full text-center rounded-md border border-gray-300 px-2 py-1.5 text-sm tabular-nums focus:border-black focus:outline-none disabled:bg-gray-50"
                                  placeholder="0"
                                />
                              </td>
                            );
                          })}
                          <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-900">
                            {costoLinea > 0 ? formatearMonto(costoLinea) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Warnings de stock */}
              {productos.some((p) => {
                const cantTotal = cantPorProducto.get(p.id) ?? 0;
                const previa = previasPorProducto.get(p.id) ?? 0;
                const efectivo = (p.stock_total ?? 0) + previa;
                return cantTotal > efectivo && cantTotal > 0;
              }) && (
                <div className="rounded-md border border-orange-200 bg-orange-50 p-3 text-xs text-orange-900">
                  ⚠ Algunos productos superan el stock disponible. Puedes guardar
                  igual; el stock quedará negativo hasta que registres la próxima
                  compra.
                </div>
              )}

              {/* Footer totales */}
              <div className="rounded-md border border-gray-200 bg-gray-50/50 p-3">
                <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">
                  Totales en vivo
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {marcasProyecto.map((m) => (
                    <div key={m.marca.id}>
                      <div className="text-[11px] text-gray-500">{m.marca.nombre}</div>
                      <div className="text-sm font-mono tabular-nums text-gray-900">
                        {formatearMonto(totalPorMarca[m.marca.id] ?? 0)}
                      </div>
                    </div>
                  ))}
                  <div className="border-l border-gray-200 pl-3">
                    <div className="text-[11px] text-gray-500">Total general</div>
                    <div className="text-sm font-semibold font-mono tabular-nums text-gray-900">
                      {formatearMonto(totalGeneral)}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          <div className="flex items-center justify-between gap-3 pt-2">
            {initial ? (
              <button
                type="button"
                onClick={handleEliminar}
                disabled={guardando}
                className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
              >
                Eliminar entrega
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={guardando}
                className="rounded-md border border-gray-300 bg-white text-gray-700 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleGuardar}
                disabled={guardando || marcasProyecto.length === 0 || productos.length === 0}
                className="rounded-md bg-black text-white px-4 py-2 text-sm font-medium active:scale-[0.97] transition disabled:opacity-50"
              >
                {guardando ? "Guardando…" : initial ? "Guardar cambios" : "Registrar entrega"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
