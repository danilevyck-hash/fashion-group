"use client";

// Nivel 1 del rediseño: cards por marca/compañía (fijas, patrón tipo Reclamos)
// + una card fija "Gastos Tommy y Calvin" que agrupa el archivo legacy (las
// facturas grupo_legacy=true). Al hacer clic se entra al home filtrado.

import { useCallback, useEffect, useState } from "react";
import { saveAs } from "file-saver";
import type { MkMarca } from "@/lib/marketing/types";
import { formatearMonto } from "@/lib/marketing/normalizar";
import { useToast } from "@/components/ToastSystem";

interface Resumen {
  legacy: { count: number; total: number };
  porMarca: Record<string, { count: number; total: number }>;
}

interface Props {
  marcas: MkMarca[];
  onSelectMarca: (marcaId: string) => void;
  onSelectLegacy: () => void;
  onNuevoProyecto: () => void;
  onOpenAnulados: () => void;
  onOpenReportes: () => void;
  onOpenImpulsadoras: () => void;
  onOpenInventario: () => void;
  refreshKey: number;
}

// Compañía del grupo por marca (empresa_codigo → etiqueta legible).
const EMPRESA_LABEL: Record<string, string> = {
  fashion_wear: "Fashion Wear",
  vistana: "Vistana",
  active_shoes: "Active Shoes",
  active_wear: "Active Wear",
  joystep: "Joystep",
};

// Orden fijo de las cards de marca.
const ORDEN_MARCA = ["TH", "CK", "RBK", "FC", "J", "OTR"];

function acentoMarca(codigo: string): string {
  if (codigo === "TH") return "border-red-200 hover:border-red-400";
  if (codigo === "CK") return "border-gray-300 hover:border-gray-500";
  if (codigo === "RBK") return "border-blue-200 hover:border-blue-400";
  if (codigo === "J") return "border-emerald-200 hover:border-emerald-400";
  if (codigo === "FC") return "border-fuchsia-200 hover:border-fuchsia-400";
  return "border-amber-200 hover:border-amber-400";
}

export default function MarcaSelector({
  marcas,
  onSelectMarca,
  onSelectLegacy,
  onNuevoProyecto,
  onOpenAnulados,
  onOpenReportes,
  onOpenImpulsadoras,
  onOpenInventario,
  refreshKey,
}: Props) {
  const { toast } = useToast();
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportando, setExportando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/marketing/marca-resumen", { cache: "no-store" });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as Resumen;
        if (!cancelado) setResumen(data);
      } catch {
        if (!cancelado) setResumen(null);
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [refreshKey]);

  // Export global (todas las marcas + legacy), sin filtro.
  const exportarZip = useCallback(async () => {
    if (exportando) return;
    setExportando(true);
    try {
      const res = await fetch("/api/marketing/export-zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        toast(
          res.status === 404
            ? "No hay gastos para exportar."
            : "No se pudo generar el ZIP. Intenta de nuevo en unos segundos.",
          "error",
        );
        return;
      }
      const blob = await res.blob();
      saveAs(blob, `Gastos-Marketing-${new Date().toISOString().slice(0, 10)}.zip`);
      toast("ZIP listo — revisa tu carpeta de descargas.", "success");
    } catch {
      toast("No se pudo generar el ZIP. Verifica tu conexión.", "error");
    } finally {
      setExportando(false);
    }
  }, [exportando, toast]);

  // Marcas ordenadas por ORDEN_MARCA (las desconocidas van al final).
  const marcasOrdenadas = [...marcas].sort((a, b) => {
    const ia = ORDEN_MARCA.indexOf(a.codigo);
    const ib = ORDEN_MARCA.indexOf(b.codigo);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  return (
    <div className="space-y-5">
      {/* Header — acciones globales del módulo */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Marketing</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Gastos de mercadeo por marca
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm w-full sm:w-auto sm:shrink-0">
          <button type="button" onClick={onOpenInventario} className="text-gray-600 hover:text-black transition">
            Mobiliario
          </button>
          <span className="text-gray-300">·</span>
          <button type="button" onClick={onOpenReportes} className="text-gray-600 hover:text-black transition">
            Reportes
          </button>
          <span className="text-gray-300">·</span>
          <button type="button" onClick={onOpenImpulsadoras} className="text-gray-600 hover:text-black transition">
            Impulsadoras
          </button>
          <span className="text-gray-300">·</span>
          <button type="button" onClick={onOpenAnulados} className="text-xs text-gray-400 hover:text-gray-700 transition">
            Anulados
          </button>
          <span className="text-gray-300">·</span>
          <button
            type="button"
            onClick={exportarZip}
            disabled={exportando}
            className="text-gray-600 hover:text-black transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exportando ? "Generando ZIP…" : "Exportar"}
          </button>
          <button
            type="button"
            onClick={onNuevoProyecto}
            className="rounded-md bg-black text-white px-3 py-2 text-sm active:scale-[0.97] transition ml-auto sm:ml-2"
          >
            + Nuevo proyecto
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-24 rounded-lg bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* Card legacy: archivo Tommy + Calvin (congelado) */}
          <button
            type="button"
            onClick={onSelectLegacy}
            className="w-full text-left rounded-xl border border-gray-300 bg-white p-4 hover:border-gray-500 hover:shadow-sm transition flex items-center justify-between gap-4"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-900">Gastos Tommy y Calvin</span>
                <span className="rounded bg-gray-100 text-gray-500 text-[11px] px-1.5 py-0.5">Archivo</span>
              </div>
              <div className="text-[12px] text-gray-500 mt-0.5">
                Gastos anteriores al rediseño · congelado
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="font-semibold text-gray-900 tabular-nums">
                {formatearMonto(resumen?.legacy.total ?? 0)}
              </div>
              <div className="text-[12px] text-gray-500">
                {resumen?.legacy.count ?? 0}{" "}
                {(resumen?.legacy.count ?? 0) === 1 ? "factura" : "facturas"}
              </div>
            </div>
          </button>

          {/* Cards por marca */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {marcasOrdenadas.map((m) => {
              const r = resumen?.porMarca[m.id];
              const empresa = EMPRESA_LABEL[m.empresa_codigo ?? ""] ?? "";
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onSelectMarca(m.id)}
                  className={`text-left rounded-xl border bg-white p-4 hover:shadow-sm transition ${acentoMarca(m.codigo)}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-900 truncate">{m.nombre}</div>
                      <div className="text-[12px] text-gray-500 mt-0.5">
                        {empresa || (m.tipo === "interna" ? "Interna" : "—")}
                      </div>
                    </div>
                    <span className="text-[11px] font-bold text-gray-400">{m.codigo}</span>
                  </div>
                  <div className="mt-3 flex items-baseline justify-between">
                    <span className="font-semibold text-gray-900 tabular-nums">
                      {formatearMonto(r?.total ?? 0)}
                    </span>
                    <span className="text-[12px] text-gray-500">
                      {r?.count ?? 0} {(r?.count ?? 0) === 1 ? "factura" : "facturas"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
