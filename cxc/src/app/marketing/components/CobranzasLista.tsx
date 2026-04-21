"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { EstadoBadge } from "@/components/marketing";
import { useToast } from "@/components/ToastSystem";
import { formatearMonto, formatearFecha } from "@/lib/marketing/normalizar";
import type {
  EstadoCobranza,
  MkMarca,
  MkCobranza,
  ProyectoConMarcas,
} from "@/lib/marketing/types";

// Fila enriquecida que devuelve GET /api/marketing/cobranzas
interface CobranzaRow extends MkCobranza {
  proyecto: Pick<ProyectoConMarcas, "id" | "nombre" | "tienda"> | null;
  marca: Pick<MkMarca, "id" | "nombre" | "codigo"> | null;
  total_pagado: number;
  saldo: number;
}

interface Filtros {
  marcaId: string;
  proyectoId: string;
  estado: string;
  desde: string;
  hasta: string;
}

const FILTROS_INICIALES: Filtros = {
  marcaId: "",
  proyectoId: "",
  estado: "",
  desde: "",
  hasta: "",
};

const ESTADO_ORDEN: EstadoCobranza[] = [
  "borrador",
  "enviada",
  "pagada_parcial",
  "pagada",
  "disputada",
];

export function CobranzasLista() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<CobranzaRow[]>([]);
  const [marcas, setMarcas] = useState<MkMarca[]>([]);
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_INICIALES);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/marketing/marcas", { cache: "no-store" });
        if (r.ok) {
          const data = (await r.json()) as MkMarca[];
          setMarcas(data);
        }
      } catch {
        // silencioso: filtro por marca simplemente no se puebla
      }
    })();
  }, []);

  const cargarCobranzas = useMemo(
    () => async (f: Filtros) => {
      setLoading(true);
      try {
        const qs = new URLSearchParams();
        if (f.marcaId) qs.set("marca_id", f.marcaId);
        if (f.proyectoId) qs.set("proyecto_id", f.proyectoId);
        if (f.estado) qs.set("estado", f.estado);
        if (f.desde) qs.set("desde", f.desde);
        if (f.hasta) qs.set("hasta", f.hasta);
        const res = await fetch(
          `/api/marketing/cobranzas?${qs.toString()}`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error("No se pudieron cargar las cobranzas");
        const data = (await res.json()) as CobranzaRow[];
        setRows(data);
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Error al cargar";
        toast(message, "error");
      } finally {
        setLoading(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    cargarCobranzas(filtros);
  }, [filtros, cargarCobranzas]);

  const counts = useMemo(() => {
    const acc: Record<EstadoCobranza, number> = {
      borrador: 0,
      enviada: 0,
      pagada_parcial: 0,
      pagada: 0,
      disputada: 0,
    };
    for (const r of rows) {
      if (acc[r.estado] !== undefined) acc[r.estado]++;
    }
    return acc;
  }, [rows]);

  const totalMonto = useMemo(
    () => rows.reduce((s, r) => s + Number(r.monto || 0), 0),
    [rows]
  );
  const totalPagado = useMemo(
    () => rows.reduce((s, r) => s + Number(r.total_pagado || 0), 0),
    [rows]
  );
  const totalSaldo = useMemo(
    () => rows.reduce((s, r) => s + Number(r.saldo || 0), 0),
    [rows]
  );

  const limpiarFiltros = () => setFiltros(FILTROS_INICIALES);
  const hayFiltros =
    filtros.marcaId ||
    filtros.proyectoId ||
    filtros.estado ||
    filtros.desde ||
    filtros.hasta;

  return (
    <div className="space-y-5">
      {/* Badge counts por estado */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {ESTADO_ORDEN.map((e) => (
          <button
            key={e}
            onClick={() =>
              setFiltros((f) => ({
                ...f,
                estado: f.estado === e ? "" : e,
              }))
            }
            className={`border rounded-lg p-3 text-left transition hover:border-gray-400 ${
              filtros.estado === e
                ? "border-fuchsia-400 bg-fuchsia-50"
                : "border-gray-200 bg-white"
            }`}
            aria-pressed={filtros.estado === e}
          >
            <div className="mb-1">
              <EstadoBadge tipo="cobranza" estado={e} />
            </div>
            <div className="text-2xl font-semibold tabular-nums">
              {counts[e]}
            </div>
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="border border-gray-200 rounded-lg p-4 bg-white">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Marca</label>
            <select
              value={filtros.marcaId}
              onChange={(e) =>
                setFiltros((f) => ({ ...f, marcaId: e.target.value }))
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm bg-white focus:border-black focus:outline-none"
            >
              <option value="">Todas las marcas</option>
              {marcas.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Estado</label>
            <select
              value={filtros.estado}
              onChange={(e) =>
                setFiltros((f) => ({ ...f, estado: e.target.value }))
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm bg-white focus:border-black focus:outline-none"
            >
              <option value="">Todos los estados</option>
              {ESTADO_ORDEN.map((e) => (
                <option key={e} value={e}>
                  {e.replace("_", " ")}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Desde</label>
            <input
              type="date"
              value={filtros.desde}
              onChange={(e) =>
                setFiltros((f) => ({ ...f, desde: e.target.value }))
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Hasta</label>
            <input
              type="date"
              value={filtros.hasta}
              onChange={(e) =>
                setFiltros((f) => ({ ...f, hasta: e.target.value }))
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
            />
          </div>
        </div>
        {hayFiltros && (
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={limpiarFiltros}
              className="text-sm text-gray-600 underline hover:text-black"
            >
              Limpiar filtros
            </button>
          </div>
        )}
      </div>

      {/* Totales */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="border border-gray-200 rounded-lg p-3">
          <div className="text-xs text-gray-500 uppercase tracking-wider">
            Total cobrado
          </div>
          <div className="text-lg font-semibold tabular-nums mt-1">
            {formatearMonto(totalMonto)}
          </div>
        </div>
        <div className="border border-gray-200 rounded-lg p-3">
          <div className="text-xs text-gray-500 uppercase tracking-wider">
            Total pagado
          </div>
          <div className="text-lg font-semibold tabular-nums mt-1 text-emerald-700">
            {formatearMonto(totalPagado)}
          </div>
        </div>
        <div className="border border-gray-200 rounded-lg p-3">
          <div className="text-xs text-gray-500 uppercase tracking-wider">
            Saldo pendiente
          </div>
          <div className="text-lg font-semibold tabular-nums mt-1 text-amber-700">
            {formatearMonto(totalSaldo)}
          </div>
        </div>
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-500">
          Cargando cobranzas…
        </div>
      ) : rows.length === 0 ? (
        <div className="border border-dashed border-gray-300 rounded-lg p-8 text-center">
          <div className="text-sm text-gray-700 font-medium mb-1">
            No hay cobranzas
          </div>
          <div className="text-xs text-gray-500">
            {hayFiltros
              ? "Probá limpiar los filtros o crear una nueva."
              : "Crea la primera desde el botón Nueva cobranza."}
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr className="text-left text-xs text-gray-600 uppercase tracking-wider">
                <th className="px-3 py-2">N°</th>
                <th className="px-3 py-2">Envío</th>
                <th className="px-3 py-2">Proyecto</th>
                <th className="px-3 py-2">Marca</th>
                <th className="px-3 py-2 text-right">Monto</th>
                <th className="px-3 py-2 text-right">Pagado</th>
                <th className="px-3 py-2 text-right">Saldo</th>
                <th className="px-3 py-2">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="hover:bg-fuchsia-50/40 transition"
                >
                  <td className="px-3 py-2 font-mono text-xs">
                    <Link
                      href={`/marketing/cobranzas/${r.id}`}
                      className="text-fuchsia-700 hover:underline"
                    >
                      {r.numero}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-gray-700">
                    {r.fecha_envio ? (
                      formatearFecha(r.fecha_envio)
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 truncate max-w-[18rem]">
                    {r.proyecto?.nombre || r.proyecto?.tienda || (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {r.marca?.nombre || (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatearMonto(r.monto)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-700">
                    {formatearMonto(r.total_pagado)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${
                      r.saldo > 0 ? "text-amber-700" : "text-gray-500"
                    }`}
                  >
                    {formatearMonto(r.saldo)}
                  </td>
                  <td className="px-3 py-2">
                    <EstadoBadge tipo="cobranza" estado={r.estado} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default CobranzasLista;
