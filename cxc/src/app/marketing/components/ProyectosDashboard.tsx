"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastSystem";
import { EstadoBadge, MarcaBadge } from "@/components/marketing";
import { SkeletonKPI } from "@/components/ui";
import { formatearFecha, formatearMonto } from "@/lib/marketing/normalizar";
import type {
  EstadoProyecto,
  MarcaConPorcentaje,
  MkProyecto,
} from "@/lib/marketing/types";

interface ProyectoListItem extends MkProyecto {
  marcas: MarcaConPorcentaje[];
  total_facturado: number;
  conteo_facturas: number;
  conteo_fotos: number;
}

type Tab = "todos" | EstadoProyecto;

const TAB_LABELS: Record<Tab, string> = {
  todos: "Todos",
  abierto: "Abiertos",
  listo_cobrar: "Listos para cobrar",
  cobrado: "Cobrados",
};

function mesActualLabel(): string {
  const meses = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
  ];
  const d = new Date();
  return `${meses[d.getMonth()]} ${d.getFullYear()}`;
}

function esMarcaConocida(c: string): c is "TH" | "CK" | "RBK" {
  return c === "TH" || c === "CK" || c === "RBK";
}

function TabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative px-3 py-1.5 text-sm rounded-md transition ${
        active
          ? "bg-gray-900 text-white"
          : "text-gray-700 hover:bg-gray-100"
      }`}
    >
      {label}
      <span
        className={`ml-1.5 text-xs tabular-nums ${
          active ? "text-gray-300" : "text-gray-400"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function ProyectoRow({
  p,
  onClick,
}: {
  p: ProyectoListItem;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-lg border border-gray-200 bg-white p-3 hover:border-black transition"
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-semibold text-sm text-gray-900 truncate">
              {p.tienda}
            </div>
            {p.nombre && (
              <div className="text-xs text-gray-500 truncate">{p.nombre}</div>
            )}
          </div>
          <div className="shrink-0">
            <EstadoBadge tipo="proyecto" estado={p.estado} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {p.marcas.map((m) => (
            <div key={m.marca.id} className="inline-flex items-center gap-1">
              {esMarcaConocida(m.marca.codigo) ? (
                <MarcaBadge codigo={m.marca.codigo} />
              ) : (
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
                  {m.marca.nombre}
                </span>
              )}
              <span className="text-xs text-gray-500 tabular-nums">
                {m.porcentaje}%
              </span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2 text-xs text-gray-500 pt-1 border-t border-gray-100">
          <div>
            <div className="text-gray-400">Inicio</div>
            <div className="text-gray-800">
              {formatearFecha(p.fecha_inicio)}
            </div>
          </div>
          <div>
            <div className="text-gray-400">Facturas</div>
            <div className="text-gray-800 tabular-nums">
              {p.conteo_facturas}{p.conteo_fotos > 0 ? ` · ${p.conteo_fotos} fotos` : ""}
            </div>
          </div>
          <div className="text-right">
            <div className="text-gray-400">Total facturado</div>
            <div className="text-gray-900 font-mono tabular-nums">
              {formatearMonto(p.total_facturado)}
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

export default function ProyectosDashboard() {
  const router = useRouter();
  const { toast } = useToast();
  const [proyectos, setProyectos] = useState<ProyectoListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("todos");

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/marketing/proyectos");
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "No se pudieron cargar los proyectos");
      }
      const data = (await res.json()) as ProyectoListItem[];
      setProyectos(Array.isArray(data) ? data : []);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Sin conexión. Verifica tu internet e intenta de nuevo.";
      toast(msg, "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = {
      todos: proyectos.length,
      abierto: 0,
      listo_cobrar: 0,
      cobrado: 0,
    };
    for (const p of proyectos) {
      c[p.estado]++;
    }
    return c;
  }, [proyectos]);

  const kpis = useMemo(() => {
    const ahora = new Date();
    const y = ahora.getFullYear();
    const m = ahora.getMonth();
    let facturadoMes = 0;
    let pendienteCobrar = 0;
    let proyectosAbiertos = 0;
    for (const p of proyectos) {
      if (p.estado === "abierto") proyectosAbiertos++;
      if (p.estado !== "cobrado") pendienteCobrar += p.total_facturado;
      // fecha_inicio viene como YYYY-MM-DD
      if (p.fecha_inicio) {
        const [py, pm] = p.fecha_inicio.split("-").map((n) => Number(n));
        if (py === y && pm - 1 === m) facturadoMes += p.total_facturado;
      }
    }
    return {
      proyectosAbiertos,
      facturadoMes: Number(facturadoMes.toFixed(2)),
      pendienteCobrar: Number(pendienteCobrar.toFixed(2)),
    };
  }, [proyectos]);

  const filtrados = useMemo(() => {
    if (tab === "todos") return proyectos;
    return proyectos.filter((p) => p.estado === tab);
  }, [proyectos, tab]);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      {loading ? (
        <SkeletonKPI count={3} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="text-xs uppercase tracking-wider text-gray-500">
              Proyectos abiertos
            </div>
            <div className="text-2xl font-semibold tabular-nums mt-1 text-gray-900">
              {kpis.proyectosAbiertos}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">
              En curso, todavía no cobrados
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="text-xs uppercase tracking-wider text-gray-500">
              Facturado este mes
            </div>
            <div className="text-2xl font-semibold tabular-nums mt-1 text-gray-900 font-mono">
              {formatearMonto(kpis.facturadoMes)}
            </div>
            <div className="text-xs text-gray-400 mt-0.5 capitalize">
              {mesActualLabel()}
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="text-xs uppercase tracking-wider text-gray-500">
              Pendiente por cobrar
            </div>
            <div className="text-2xl font-semibold tabular-nums mt-1 text-gray-900 font-mono">
              {formatearMonto(kpis.pendienteCobrar)}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">
              Facturado en proyectos no cerrados
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto -mx-1 px-1">
        {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
          <TabButton
            key={t}
            active={tab === t}
            onClick={() => setTab(t)}
            label={TAB_LABELS[t]}
            count={counts[t]}
          />
        ))}
      </div>

      {/* Lista */}
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
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center">
          <div className="text-sm font-medium text-gray-700 mb-1">
            No hay proyectos en esta vista
          </div>
          <div className="text-xs text-gray-500 mb-4">
            {tab === "todos"
              ? "Crea tu primer proyecto para empezar a repartir gastos."
              : "Cambia de pestaña o crea un nuevo proyecto."}
          </div>
          <button
            type="button"
            onClick={() => router.push("/marketing/proyectos/nuevo")}
            className="rounded-md bg-black text-white px-3 py-2 text-sm active:scale-[0.97] transition"
          >
            + Nuevo proyecto
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtrados.map((p) => (
            <ProyectoRow
              key={p.id}
              p={p}
              onClick={() => router.push(`/marketing/proyectos/${p.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
