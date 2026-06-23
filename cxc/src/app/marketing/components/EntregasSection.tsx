"use client";

// Sección "Entregas de muebles" dentro del proyecto. Lista las entregas
// existentes con badge azul y permite expandir cada una para ver el detalle
// (productos consumidos + totales por marca). Botón "+ Entrega de muebles".

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ToastSystem";
import { formatearMonto } from "@/lib/marketing/normalizar";
import EntregaForm from "@/components/marketing/EntregaForm";
import type {
  EntregaConItems,
  MarcaConPorcentaje,
  MkInventarioProducto,
  MkMarca,
  ProyectoConMarcas,
} from "@/lib/marketing/types";

// Color de la marca externa (consistente con FacturaCard).
function colorParaMarca(codigo: string): string {
  if (codigo === "TH") return "bg-red-50 text-red-700 border-red-200";
  if (codigo === "CK") return "bg-gray-100 text-gray-800 border-gray-300";
  if (codigo === "RBK") return "bg-blue-50 text-blue-700 border-blue-200";
  if (codigo === "J") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  return "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200";
}

interface Props {
  proyecto: ProyectoConMarcas;
  marcasParaEntrega: MarcaConPorcentaje[];
  // Catálogo completo de marcas — para resolver el tag de marca de CUALQUIER
  // entrega, aunque su marca no esté entre las asignadas al proyecto.
  marcasCatalogo: MkMarca[];
  onChange?: () => void;
}

export default function EntregasSection({
  proyecto,
  marcasParaEntrega,
  marcasCatalogo,
  onChange,
}: Props) {
  const { toast } = useToast();
  const [entregas, setEntregas] = useState<EntregaConItems[]>([]);
  const [productos, setProductos] = useState<MkInventarioProducto[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editando, setEditando] = useState<EntregaConItems | null>(null);
  const [creando, setCreando] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [eRes, pRes] = await Promise.all([
        fetch(
          `/api/marketing/inventario/entregas?proyecto_id=${proyecto.id}`,
          { cache: "no-store" },
        ),
        fetch(`/api/marketing/inventario/productos`, { cache: "no-store" }),
      ]);
      if (!eRes.ok) throw new Error("No se pudieron cargar las entregas");
      const eData = (await eRes.json()) as EntregaConItems[];
      setEntregas(Array.isArray(eData) ? eData : []);
      if (pRes.ok) {
        const pData = (await pRes.json()) as MkInventarioProducto[];
        setProductos(Array.isArray(pData) ? pData : []);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error";
      toast(msg, "error");
    } finally {
      setLoading(false);
    }
  }, [proyecto.id, toast]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const productoById = new Map(productos.map((p) => [p.id, p]));
  // Resolver marca desde el catálogo completo (+ las del proyecto como respaldo),
  // para que el tag SIEMPRE aparezca aunque la marca de la entrega no esté
  // asignada al proyecto.
  const marcaById = new Map<string, MkMarca>();
  for (const m of marcasParaEntrega) marcaById.set(m.marca.id, m.marca);
  for (const m of marcasCatalogo) marcaById.set(m.id, m);

  const proyectoNombre = proyecto.nombre || proyecto.tienda;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            Entregas de muebles
          </h2>
          <p className="text-xs text-gray-500">
            {entregas.length}{" "}
            {entregas.length === 1 ? "entrega" : "entregas"}
            {entregas.length > 0 && (
              <>
                {" · "}
                Total{" "}
                {formatearMonto(
                  entregas.reduce((s, e) => s + Number(e.total ?? 0), 0),
                )}
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreando(true)}
          className="rounded-md bg-black text-white px-3 py-2 text-sm active:scale-[0.97] transition"
        >
          + Entrega de muebles
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-16 rounded-lg bg-gray-100 animate-pulse"
            />
          ))}
        </div>
      ) : entregas.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center">
          <div className="text-sm text-gray-600">
            Todavía no hay entregas de muebles en este proyecto.
          </div>
          <div className="text-xs text-gray-400 mt-1">
            Registra una entrega para repartir el costo entre marcas.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2">
          {entregas.map((e) => {
            const expandida = expandedId === e.id;
            return (
              <div
                key={e.id}
                className="rounded-lg border border-gray-200 bg-white overflow-hidden"
              >
                {/* Fila principal: clickeable para expandir.
                    Una pill por marca con el monto (100%) atribuido a esa marca. */}
                <button
                  type="button"
                  onClick={() =>
                    setExpandedId((prev) => (prev === e.id ? null : e.id))
                  }
                  className="w-full text-left px-3 py-3 flex items-center gap-3 hover:bg-gray-50 transition"
                >
                  <span className="text-xs uppercase tracking-wide px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-semibold shrink-0">
                    Entrega
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {e.notas?.trim() || "Entrega de muebles"}
                    </div>
                    <div className="flex flex-wrap items-center gap-1 mt-1">
                      {Object.entries(e.total_por_marca ?? {}).length === 0 ? (
                        <span className="text-xs text-gray-500">
                          Sin reparto
                        </span>
                      ) : (
                        Object.entries(e.total_por_marca ?? {}).map(
                          ([marcaId, monto]) => {
                            const marca = marcaById.get(marcaId);
                            if (!marca) return null;
                            const inicial = (
                              marca.nombre || marca.codigo || "?"
                            )
                              .charAt(0)
                              .toUpperCase();
                            return (
                              <span
                                key={marcaId}
                                className={`inline-flex items-center gap-1.5 border rounded-md px-1.5 py-0.5 text-xs ${colorParaMarca(marca.codigo)}`}
                              >
                                <span className="font-semibold">
                                  [{inicial}]
                                </span>
                                <span className="font-medium">
                                  {marca.nombre}
                                </span>
                                <span className="text-gray-400">→</span>
                                <span className="font-mono tabular-nums font-semibold">
                                  {formatearMonto(Number(monto ?? 0))}
                                </span>
                              </span>
                            );
                          },
                        )
                      )}
                    </div>
                  </div>
                  <div className="text-sm font-mono tabular-nums text-gray-900 font-semibold shrink-0">
                    {formatearMonto(e.total)}
                  </div>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`text-gray-400 transition-transform ${expandida ? "rotate-180" : ""}`}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {/* Detalle expandido */}
                {expandida && (
                  <div className="border-t border-gray-100 px-3 py-3 bg-gray-50/40 space-y-3">
                    {/* Cards por marca (monto al 100%) */}
                    {Object.entries(e.total_por_marca ?? {}).length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {Object.entries(e.total_por_marca ?? {}).map(
                          ([marcaId, monto]) => {
                            const marca = marcaById.get(marcaId);
                            return (
                              <div
                                key={marcaId}
                                className="rounded-md border border-gray-200 bg-white p-2"
                              >
                                <div className="text-xs text-gray-500">
                                  {marca?.nombre ?? "Marca"}
                                </div>
                                <div className="text-sm font-mono tabular-nums text-gray-900 font-semibold">
                                  {formatearMonto(Number(monto ?? 0))}
                                </div>
                              </div>
                            );
                          },
                        )}
                      </div>
                    )}

                    {/* Tabla de productos */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                            <th className="text-left font-medium px-2 py-1.5">
                              Producto
                            </th>
                            <th className="text-right font-medium px-2 py-1.5">
                              Precio
                            </th>
                            <th className="text-right font-medium px-2 py-1.5">
                              Cantidad
                            </th>
                            <th className="text-right font-medium px-2 py-1.5">
                              Total línea
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {e.items.map((it) => {
                            const prod = productoById.get(it.producto_id);
                            let unidadesTotales = 0;
                            for (const v of Object.values(
                              it.cantidad_por_marca ?? {},
                            )) {
                              unidadesTotales += Number(v ?? 0);
                            }
                            const totalLinea =
                              Number(it.precio_unitario ?? 0) * unidadesTotales;
                            return (
                              <tr
                                key={it.id}
                                className="border-b border-gray-100"
                              >
                                <td className="px-2 py-1.5 text-gray-800">
                                  {prod?.nombre ?? "—"}
                                </td>
                                <td className="px-2 py-1.5 text-right tabular-nums text-gray-600">
                                  {formatearMonto(it.precio_unitario)}
                                </td>
                                <td className="px-2 py-1.5 text-right tabular-nums text-gray-700">
                                  {unidadesTotales}
                                </td>
                                <td className="px-2 py-1.5 text-right font-mono tabular-nums text-gray-900">
                                  {formatearMonto(totalLinea)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setEditando(e);
                        }}
                        className="text-xs text-gray-700 hover:text-black underline"
                      >
                        Editar entrega
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <EntregaForm
        open={creando}
        proyectoId={proyecto.id}
        proyectoNombre={proyectoNombre}
        marcasProyecto={marcasParaEntrega}
        productos={productos}
        initial={null}
        onClose={() => setCreando(false)}
        onSaved={() => {
          setCreando(false);
          cargar();
          onChange?.();
        }}
      />
      <EntregaForm
        open={editando !== null}
        proyectoId={proyecto.id}
        proyectoNombre={proyectoNombre}
        marcasProyecto={marcasParaEntrega}
        productos={productos}
        initial={editando}
        onClose={() => setEditando(null)}
        onSaved={() => {
          setEditando(null);
          cargar();
          onChange?.();
        }}
      />
    </section>
  );
}
