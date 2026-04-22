"use client";

// Vista "Anulados" del módulo Marketing.
// Lista proyectos y facturas anulados (soft delete). Permite:
//   - Restaurar (uno o varios)
//   - Eliminar permanentemente (uno o varios) con doble confirmación.
// Reemplazó a la antigua "Papelera" + sección "Limpieza anual DGI".

import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/ToastSystem";
import { ConfirmModal } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import type { AnuladoItem } from "@/lib/marketing/types";

type FiltroTipo = "todos" | "proyecto" | "factura";

const TIPO_LABEL: Record<AnuladoItem["tipo"], string> = {
  proyecto: "Proyecto",
  factura: "Factura",
};

const TIPO_BADGE: Record<AnuladoItem["tipo"], string> = {
  proyecto: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
  factura: "bg-blue-50 text-blue-700 border-blue-200",
};

interface AnuladosListaProps {
  esAdmin: boolean;
}

function keyDe(item: { tipo: AnuladoItem["tipo"]; id: string }): string {
  return `${item.tipo}::${item.id}`;
}

export function AnuladosLista({ esAdmin }: AnuladosListaProps) {
  const { toast } = useToast();
  const [items, setItems] = useState<AnuladoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<FiltroTipo>("todos");

  // Selección bulk (set de keys "tipo::id")
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());

  // Restaurar
  const [restaurando, setRestaurando] = useState<string | null>(null);
  const [confirmRestaurar, setConfirmRestaurar] = useState<AnuladoItem | null>(
    null,
  );
  const [bulkRestaurando, setBulkRestaurando] = useState(false);
  const [confirmBulkRestaurar, setConfirmBulkRestaurar] = useState(false);

  // Eliminar permanente (hard delete)
  const [confirmEliminarItem, setConfirmEliminarItem] =
    useState<AnuladoItem | null>(null);
  const [confirmBulkEliminar, setConfirmBulkEliminar] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [textoConfirm, setTextoConfirm] = useState("");

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/marketing/papelera", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status}: ${body.slice(0, 120)}`);
      }
      const json = (await res.json()) as unknown;
      const arr: AnuladoItem[] = Array.isArray(json)
        ? (json as AnuladoItem[])
        : Array.isArray((json as { items?: unknown }).items)
          ? ((json as { items: AnuladoItem[] }).items)
          : [];
      setItems(arr);
      // Limpiar selección de items que ya no existan
      setSeleccion((prev) => {
        const vivos = new Set(arr.map(keyDe));
        const next = new Set<string>();
        for (const k of prev) if (vivos.has(k)) next.add(k);
        return next;
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      console.error("Error cargando anulados:", msg);
      toast(`No se pudieron cargar los anulados: ${msg}`, "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const itemsFiltrados = useMemo(() => {
    if (filtro === "todos") return items;
    return items.filter((x) => x.tipo === filtro);
  }, [items, filtro]);

  const seleccionados = useMemo(
    () => items.filter((it) => seleccion.has(keyDe(it))),
    [items, seleccion],
  );
  const totalVisibleSeleccionado = useMemo(
    () => itemsFiltrados.filter((it) => seleccion.has(keyDe(it))).length,
    [itemsFiltrados, seleccion],
  );
  const allVisibleSelected =
    itemsFiltrados.length > 0 &&
    totalVisibleSeleccionado === itemsFiltrados.length;

  function toggleOne(item: AnuladoItem) {
    setSeleccion((prev) => {
      const next = new Set(prev);
      const k = keyDe(item);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  function toggleAllVisible() {
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const it of itemsFiltrados) next.delete(keyDe(it));
      } else {
        for (const it of itemsFiltrados) next.add(keyDe(it));
      }
      return next;
    });
  }

  function clearSeleccion() {
    setSeleccion(new Set());
  }

  async function doRestaurar(item: AnuladoItem) {
    setRestaurando(item.id);
    try {
      const res = await fetch("/api/marketing/papelera/restaurar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: item.tipo, id: item.id }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      toast(`${TIPO_LABEL[item.tipo]} restaurad${item.tipo === "factura" ? "a" : "o"}`, "success");
      setItems((prev) => prev.filter((x) => keyDe(x) !== keyDe(item)));
      setSeleccion((prev) => {
        const next = new Set(prev);
        next.delete(keyDe(item));
        return next;
      });
    } catch (err) {
      console.error("Error restaurando:", err);
      const msg = err instanceof Error ? err.message : "No se pudo restaurar";
      toast(msg, "error");
    } finally {
      setRestaurando(null);
      setConfirmRestaurar(null);
    }
  }

  async function doRestaurarBulk() {
    if (seleccionados.length === 0) return;
    setBulkRestaurando(true);
    let okCount = 0;
    const fallos: string[] = [];
    for (const it of seleccionados) {
      try {
        const res = await fetch("/api/marketing/papelera/restaurar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tipo: it.tipo, id: it.id }),
        });
        if (!res.ok) throw new Error();
        okCount += 1;
      } catch {
        fallos.push(it.nombre);
      }
    }
    setBulkRestaurando(false);
    setConfirmBulkRestaurar(false);
    if (okCount > 0) {
      toast(
        `${okCount} restaurad${okCount === 1 ? "o" : "os"}${fallos.length ? ` · ${fallos.length} fallaron` : ""}`,
        fallos.length ? "warning" : "success",
      );
    } else if (fallos.length > 0) {
      toast("No se pudo restaurar ninguno", "error");
    }
    await cargar();
  }

  async function doEliminarPermanente() {
    const items_payload =
      confirmEliminarItem !== null
        ? [{ tipo: confirmEliminarItem.tipo, id: confirmEliminarItem.id }]
        : seleccionados.map((it) => ({ tipo: it.tipo, id: it.id }));
    if (items_payload.length === 0) return;

    setEliminando(true);
    try {
      const res = await fetch("/api/marketing/anulados/eliminar-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: items_payload }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        eliminados: number;
        fallos: Array<{ tipo: string; id: string; error: string }>;
      };
      const okN = data.eliminados ?? 0;
      const failN = (data.fallos ?? []).length;
      if (okN > 0) {
        toast(
          `${okN} eliminad${okN === 1 ? "o" : "os"} permanentemente${failN ? ` · ${failN} fallaron` : ""}`,
          failN ? "warning" : "success",
        );
      } else if (failN > 0) {
        toast(
          `No se pudo eliminar: ${data.fallos[0]?.error ?? "error"}`,
          "error",
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error";
      toast(msg, "error");
    } finally {
      setEliminando(false);
      setConfirmEliminarItem(null);
      setConfirmBulkEliminar(false);
      setTextoConfirm("");
      await cargar();
    }
  }

  const contadoresPorTipo = useMemo(() => {
    const c: Record<FiltroTipo, number> = {
      todos: items.length,
      proyecto: 0,
      factura: 0,
    };
    for (const it of items) c[it.tipo] += 1;
    return c;
  }, [items]);

  // Cantidad y nombre que se eliminará — preview en el modal de confirmación.
  const targetEliminacion = confirmEliminarItem
    ? { count: 1, etiqueta: `"${confirmEliminarItem.nombre}"` }
    : { count: seleccionados.length, etiqueta: `${seleccionados.length} registro(s)` };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Anulados</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Proyectos y facturas anulados. Puedes restaurarlos o eliminarlos
          permanentemente.
        </p>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        {(["todos", "proyecto", "factura"] as FiltroTipo[]).map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`px-3 py-1.5 rounded-md text-sm border transition-all active:scale-[0.97] ${
              filtro === f
                ? "bg-black text-white border-black"
                : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
            }`}
          >
            {f === "todos"
              ? "Todos"
              : f === "proyecto"
                ? "Proyectos"
                : "Facturas"}{" "}
            <span
              className={`ml-1 text-xs ${filtro === f ? "text-white/70" : "text-gray-400"}`}
            >
              {contadoresPorTipo[f]}
            </span>
          </button>
        ))}
      </div>

      {/* Barra bulk cuando hay selección */}
      {seleccionados.length > 0 && (
        <div className="rounded-lg border border-gray-300 bg-gray-50 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm text-gray-700">
            <span className="font-semibold tabular-nums">
              {seleccionados.length}
            </span>{" "}
            seleccionado{seleccionados.length === 1 ? "" : "s"}
            <button
              type="button"
              onClick={clearSeleccion}
              className="ml-3 text-xs text-gray-500 hover:text-gray-800 underline"
            >
              Limpiar
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmBulkRestaurar(true)}
              disabled={bulkRestaurando}
              className="px-3 py-1.5 rounded-md text-sm font-medium border border-gray-300 bg-white hover:bg-gray-100 active:scale-[0.97] disabled:opacity-50"
            >
              Restaurar seleccionados
            </button>
            {esAdmin && (
              <button
                type="button"
                onClick={() => {
                  setTextoConfirm("");
                  setConfirmBulkEliminar(true);
                }}
                disabled={eliminando}
                className="px-3 py-1.5 rounded-md text-sm font-medium bg-red-600 text-white hover:bg-red-700 active:scale-[0.97] disabled:opacity-50"
              >
                Eliminar seleccionados
              </button>
            )}
          </div>
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="rounded-lg border border-gray-200 p-6 text-sm text-gray-500">
          Cargando anulados...
        </div>
      ) : itemsFiltrados.length === 0 ? (
        <div className="rounded-lg border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-600">No hay registros anulados.</p>
          <p className="text-xs text-gray-400 mt-1">
            Los proyectos y facturas anulados aparecerán aquí.
          </p>
        </div>
      ) : (
        <div className="rounded-[10px] border border-[#e5e5e5] overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-[11px] uppercase tracking-wider text-gray-500">
                <th className="px-[18px] py-2.5 w-10">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleAllVisible}
                    className="accent-black w-3.5 h-3.5"
                    title="Seleccionar todos"
                    aria-label="Seleccionar todos"
                  />
                </th>
                <th className="text-left font-medium px-[18px] py-2.5">
                  Registro
                </th>
                <th className="text-left font-medium px-[18px] py-2.5 w-[120px] hidden md:table-cell">
                  Anulado el
                </th>
                <th className="text-left font-medium px-[18px] py-2.5 hidden md:table-cell">
                  Motivo
                </th>
                <th className="text-right font-medium px-[18px] py-2.5 w-[180px]">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody>
              {itemsFiltrados.map((item) => {
                const k = keyDe(item);
                const checked = seleccion.has(k);
                return (
                  <tr
                    key={k}
                    className="border-t border-gray-100 hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-[18px] py-3 align-middle">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleOne(item)}
                        className="accent-black w-3.5 h-3.5"
                        aria-label={`Seleccionar ${item.nombre}`}
                      />
                    </td>
                    {/* Registro: tipo badge + nombre */}
                    <td className="px-[18px] py-3 align-middle">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`inline-flex items-center rounded-full border text-[10px] px-1.5 py-0.5 font-medium uppercase tracking-wider shrink-0 ${TIPO_BADGE[item.tipo]}`}
                        >
                          {TIPO_LABEL[item.tipo]}
                        </span>
                        <span className="text-gray-900 font-medium truncate">
                          {item.nombre}
                        </span>
                      </div>
                      {/* En mobile, motivo y fecha colapsan aquí debajo */}
                      <div className="md:hidden text-[11px] text-gray-500 mt-1 truncate">
                        Anulado {fmtDate(item.anulado_en.slice(0, 10))}
                        {item.anulado_motivo
                          ? ` · ${item.anulado_motivo}`
                          : ""}
                      </div>
                    </td>
                    {/* Anulado el */}
                    <td
                      className="px-[18px] py-3 align-middle text-[12px] text-gray-500 tabular-nums hidden md:table-cell"
                      title={item.anulado_en}
                    >
                      {fmtDate(item.anulado_en.slice(0, 10))}
                    </td>
                    {/* Motivo */}
                    <td className="px-[18px] py-3 align-middle text-[12px] text-gray-600 hidden md:table-cell">
                      {item.anulado_motivo ? (
                        <span
                          className="block max-w-[260px] truncate"
                          title={item.anulado_motivo}
                        >
                          {item.anulado_motivo}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    {/* Acciones */}
                    <td className="px-[18px] py-3 align-middle text-right">
                      <div className="inline-flex gap-1.5">
                        <button
                          onClick={() => setConfirmRestaurar(item)}
                          disabled={restaurando === item.id}
                          className="px-3 py-1.5 rounded-md text-xs font-medium border border-gray-200 bg-white hover:bg-gray-50 active:scale-[0.97] disabled:opacity-50"
                        >
                          {restaurando === item.id
                            ? "Restaurando..."
                            : "Restaurar"}
                        </button>
                        {esAdmin && (
                          <button
                            onClick={() => {
                              setTextoConfirm("");
                              setConfirmEliminarItem(item);
                            }}
                            disabled={eliminando}
                            className="px-3 py-1.5 rounded-md text-xs font-medium border border-red-200 bg-white text-red-600 hover:bg-red-50 active:scale-[0.97] disabled:opacity-50"
                          >
                            Eliminar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal restaurar (single) */}
      <ConfirmModal
        open={Boolean(confirmRestaurar)}
        title="Restaurar registro"
        message={
          confirmRestaurar
            ? `Se restaurará ${TIPO_LABEL[confirmRestaurar.tipo].toLowerCase()} "${confirmRestaurar.nombre}" y volverá al módulo.`
            : ""
        }
        confirmLabel="Restaurar"
        onClose={() => setConfirmRestaurar(null)}
        onConfirm={() => {
          if (confirmRestaurar) void doRestaurar(confirmRestaurar);
        }}
        loading={Boolean(restaurando)}
      />

      {/* Modal restaurar bulk */}
      <ConfirmModal
        open={confirmBulkRestaurar}
        title="Restaurar seleccionados"
        message={`Se restaurarán ${seleccionados.length} registro${seleccionados.length === 1 ? "" : "s"} y volverán al módulo.`}
        confirmLabel="Restaurar todos"
        onClose={() => !bulkRestaurando && setConfirmBulkRestaurar(false)}
        onConfirm={doRestaurarBulk}
        loading={bulkRestaurando}
      />

      {/* Modal eliminar permanente — doble confirmación tipeando ELIMINAR */}
      {(confirmEliminarItem || confirmBulkEliminar) && (
        <div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
          onClick={() => {
            if (eliminando) return;
            setConfirmEliminarItem(null);
            setConfirmBulkEliminar(false);
            setTextoConfirm("");
          }}
        >
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative bg-white sm:rounded-lg rounded-t-2xl p-6 max-w-md w-full mx-0 sm:mx-4 border border-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold mb-1 text-red-700">
              Eliminar permanentemente
            </h3>
            <p className="text-sm text-gray-700 mb-3">
              Vas a eliminar{" "}
              <strong>
                {targetEliminacion.count}{" "}
                {targetEliminacion.count === 1 ? "registro" : "registros"}
              </strong>
              {confirmEliminarItem ? `: ${targetEliminacion.etiqueta}` : ""}.
              Esta acción <strong>NO</strong> se puede deshacer.
            </p>
            <p className="text-xs text-gray-600 mb-2">
              Para confirmar, escribe{" "}
              <span className="font-mono font-semibold text-red-700">
                ELIMINAR
              </span>
              :
            </p>
            <input
              autoFocus
              type="text"
              value={textoConfirm}
              onChange={(e) => setTextoConfirm(e.target.value)}
              placeholder="ELIMINAR"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none mb-4 uppercase"
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setConfirmEliminarItem(null);
                  setConfirmBulkEliminar(false);
                  setTextoConfirm("");
                }}
                disabled={eliminando}
                className="flex-1 border border-gray-200 text-gray-600 px-4 py-2.5 rounded-md text-sm hover:bg-gray-50 transition disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={doEliminarPermanente}
                disabled={
                  eliminando || textoConfirm.trim().toUpperCase() !== "ELIMINAR"
                }
                className="flex-1 px-4 py-2.5 rounded-md text-sm font-medium bg-red-600 text-white hover:bg-red-700 active:scale-[0.97] disabled:opacity-50 transition"
              >
                {eliminando ? "Eliminando…" : "Eliminar permanentemente"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AnuladosLista;
