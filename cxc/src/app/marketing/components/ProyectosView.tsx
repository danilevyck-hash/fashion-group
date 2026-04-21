"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  EstadoProyecto,
  MarcaConPorcentaje,
  MkMarca,
  MkProyecto,
} from "@/lib/marketing/types";
import { EstadoBadge } from "@/components/marketing";
import { formatearFecha, formatearMonto } from "@/lib/marketing/normalizar";

type FilterKey = "all" | EstadoProyecto;

interface ProyectoListItem extends MkProyecto {
  marcas: MarcaConPorcentaje[];
  total_facturado: number;
  conteo_facturas: number;
  conteo_fotos: number;
}

interface Props {
  marca: MkMarca;
  onBack: () => void;
  onOpenProyecto: (id: string) => void;
  onOpenPapelera: () => void;
  onOpenReportes: () => void;
  onNuevoProyecto: () => void;
  refreshKey: number;
}

const PILL_ORDER: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "Todos" },
  { key: "abierto", label: "Abiertos" },
  { key: "por_cobrar", label: "Por cobrar" },
  { key: "enviado", label: "Enviados" },
  { key: "cobrado", label: "Cobrados" },
];

export default function ProyectosView({
  marca,
  onBack,
  onOpenProyecto,
  onOpenPapelera,
  onOpenReportes,
  onNuevoProyecto,
  refreshKey,
}: Props) {
  const [proyectos, setProyectos] = useState<ProyectoListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("all");

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/marketing/proyectos?marca_id=${marca.id}`,
      );
      if (!res.ok) throw new Error();
      const data = (await res.json()) as ProyectoListItem[];
      setProyectos(Array.isArray(data) ? data : []);
    } catch {
      setProyectos([]);
    } finally {
      setLoading(false);
    }
  }, [marca.id]);

  useEffect(() => {
    cargar();
  }, [cargar, refreshKey]);

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = {
      all: proyectos.length,
      abierto: 0,
      por_cobrar: 0,
      enviado: 0,
      cobrado: 0,
    };
    for (const p of proyectos) {
      if (p.estado in c) c[p.estado as EstadoProyecto] += 1;
    }
    return c;
  }, [proyectos]);

  const filtrados = useMemo(() => {
    if (filter === "all") return proyectos;
    return proyectos.filter((p) => p.estado === filter);
  }, [proyectos, filter]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-gray-600 hover:text-black transition inline-flex items-center gap-1"
        >
          ← Volver a marcas
        </button>
        <div className="flex items-center gap-3 text-sm">
          <button
            type="button"
            onClick={onOpenReportes}
            className="text-gray-600 hover:text-black transition"
          >
            Reportes
          </button>
          <span className="text-gray-300">·</span>
          <button
            type="button"
            onClick={onOpenPapelera}
            className="text-gray-600 hover:text-black transition"
          >
            Papelera
          </button>
        </div>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            Proyectos {marca.nombre}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {proyectos.length} en total
          </p>
        </div>
        <button
          type="button"
          onClick={onNuevoProyecto}
          className="rounded-md bg-black text-white px-3 py-2 text-sm active:scale-[0.97] transition shrink-0"
        >
          + Nuevo proyecto
        </button>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        {PILL_ORDER.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setFilter(p.key)}
            className={`text-xs px-3 py-1 rounded-full transition ${
              filter === p.key
                ? "bg-black text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {p.label}{" "}
            <span className="ml-1 opacity-60 tabular-nums">
              {counts[p.key]}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-24 rounded-lg bg-gray-100 animate-pulse"
            />
          ))}
        </div>
      ) : filtrados.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
          <div className="text-sm text-gray-600 mb-1">
            {filter === "all"
              ? "No hay proyectos todavía."
              : "No hay proyectos con este estado."}
          </div>
          {filter === "all" && (
            <button
              type="button"
              onClick={onNuevoProyecto}
              className="text-sm text-fuchsia-600 hover:text-fuchsia-800 mt-2"
            >
              Crear el primero
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2">
          {filtrados.map((p) => {
            const pct = p.marcas.find((m) => m.marca.id === marca.id)?.porcentaje ?? 0;
            const cobrable = (p.total_facturado * pct) / 100;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onOpenProyecto(p.id)}
                className="text-left rounded-lg border border-gray-200 bg-white p-3 hover:border-black transition"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-gray-900 truncate">
                      {p.tienda}
                    </div>
                    {p.nombre && (
                      <div className="text-sm text-gray-600 truncate">
                        {p.nombre}
                      </div>
                    )}
                  </div>
                  <EstadoBadge tipo="proyecto" estado={p.estado} />
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <div>
                    {p.conteo_facturas} facturas · {p.conteo_fotos} fotos
                  </div>
                  <div>{formatearFecha(p.fecha_inicio)}</div>
                </div>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                  <div className="text-xs text-gray-500">
                    Cobrable a {marca.nombre} ({pct}%)
                  </div>
                  <div className="text-sm font-mono tabular-nums text-gray-900">
                    {formatearMonto(cobrable)}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
