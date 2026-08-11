"use client";

// ============================================================================
// Inicio de Marketing — jerarquía por uso real (11-ago-2026)
//
// Daniel, textual: *"ya no quiero usar más eso, quisiera congelarlo y quitarlo
// del home de marketing, ponerlo arriba como archivado y ya. y hoy en día
// trabajar el módulo día a día"* · *"pon inmobiliario e impulsadoras más
// grandes porq son usables. y tiene que hacer sentido con el módulo, siento
// eso desorganizado"*.
//
// El orden de la pantalla ES el orden de uso:
//   1. Marcas — la puerta a los proyectos del día a día (lo que el módulo ES).
//   2. Herramientas — Mobiliario e Impulsadoras, tarjetas de verdad. Antes
//      eran dos textos perdidos en una fila con Reportes/Anulados/Exportar.
//   3. Consulta y archivo — enlaces chicos ARRIBA, fuera del camino:
//      Reportes · Exportar · Anulados · Multifashion · Gastos Tommy y Calvin.
//      **Nada se borró**: los dos buckets siguen abriendo la misma pantalla
//      con el mismo contenido.
//
// 🩸 LA TARJETA DE MARCA CUENTA TAMBIÉN LAS ENTREGAS DE MUEBLES. Hasta hoy se
// armaba SOLO desde las facturas, así que un proyecto sin facturas cuya única
// marca venía de una entrega no aparecía en ninguna parte (el caso "Nova Lux":
// $1.040 de muebles asignados a Calvin Klein, invisible). Ver
// lib/marketing/resumen-inicio.ts.
//
// 🔴 FACTURAS Y MUEBLES VAN EN LÍNEAS SEPARADAS, NO SUMADOS. Medido el
// 11-ago-2026: los muebles son $71.765 que NO se contaban en ninguna tarjeta.
// Sumarlos al mismo `$` habría llevado Tommy de $17.800 a $58.365 y Calvin de
// $4.800 a $34.460 — el número que Daniel ya conoce, triplicado, sin nada que
// lo explique. Además son cosas distintas: una factura es un gasto pagado a un
// proveedor; un mueble es mercancía que salió del inventario propio. El número
// que resuelve su problema es el CONTADOR DE PROYECTOS, y por eso va primero.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { saveAs } from "file-saver";
import type { MkMarca } from "@/lib/marketing/types";
import { formatearMonto } from "@/lib/marketing/normalizar";
import { useToast } from "@/components/ToastSystem";

interface Bucket {
  count: number;
  total: number;
}

interface Resumen {
  legacy: Bucket;
  /** Bucket independiente (fuera del grupo de marcas). */
  multifashion?: Bucket & { entregas?: number; muebles?: number };
  porMarca: Record<string, Bucket>;
  mueblesPorMarca?: Record<string, Bucket>;
  proyectosPorMarca?: Record<string, number>;
  mobiliario?: { entregas: number; total: number };
  impulsadoras?: { count: number | null; montoMensual: number | null };
}

interface Props {
  marcas: MkMarca[];
  onSelectMarca: (marcaId: string) => void;
  onSelectLegacy: () => void;
  onSelectMultifashion: () => void;
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

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

/** Enlace chico de la barra de arriba (consulta / archivo). 44 px de toque. */
function EnlaceBarra({
  onClick,
  children,
  tenue,
  disabled,
}: {
  onClick: () => void;
  children: React.ReactNode;
  tenue?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`transition min-h-[44px] inline-flex items-center disabled:opacity-50 disabled:cursor-not-allowed ${
        tenue
          ? "text-xs text-gray-400 hover:text-gray-700"
          : "text-sm text-gray-600 hover:text-black"
      }`}
    >
      {children}
    </button>
  );
}

function Separador() {
  return <span className="text-gray-300 select-none">·</span>;
}

/** Fila "Facturas $X · N" dentro de la tarjeta de marca. */
function LineaGasto({
  etiqueta,
  bucket,
  unidad,
  unidadPlural,
}: {
  etiqueta: string;
  bucket: Bucket;
  unidad: string;
  unidadPlural: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[12px] text-gray-500">
        {etiqueta}{" "}
        <span className="text-gray-400">
          · {plural(bucket.count, unidad, unidadPlural)}
        </span>
      </span>
      <span className="text-[13px] font-medium text-gray-900 tabular-nums">
        {formatearMonto(bucket.total)}
      </span>
    </div>
  );
}

export default function MarcaSelector({
  marcas,
  onSelectMarca,
  onSelectLegacy,
  onSelectMultifashion,
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

  const mobiliario = resumen?.mobiliario;
  const impulsadoras = resumen?.impulsadoras;

  return (
    <div className="space-y-6">
      {/* ---------------------------------------------------------------- */}
      {/* Encabezado: título + la única acción principal del módulo.        */}
      {/* ---------------------------------------------------------------- */}
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-semibold text-gray-900">Marketing</h1>
          <button
            type="button"
            onClick={onNuevoProyecto}
            className="rounded-md bg-black text-white px-3 min-h-[44px] inline-flex items-center justify-center text-sm active:scale-[0.97] transition shrink-0"
          >
            + Nuevo proyecto
          </button>
        </div>

        {/* Consulta y archivo — chiquitos, arriba, fuera del camino.
            "Gastos Tommy y Calvin" y "Multifashion" bajaron de tarjeta grande
            a enlace por pedido de Daniel. NO se borró nada: los dos abren la
            misma pantalla con su contenido intacto. */}
        {/* Dos grupos que NO se parten por dentro: si los separadores
            estuvieran todos en el mismo flex-wrap, a 390 px la línea corta
            justo después de un "·" y queda un punto colgando. */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-0 -my-1">
          <div className="flex items-center gap-x-3">
            <EnlaceBarra onClick={onOpenReportes}>Reportes</EnlaceBarra>
            <Separador />
            <EnlaceBarra onClick={exportarZip} disabled={exportando}>
              {exportando ? "Generando ZIP…" : "Exportar"}
            </EnlaceBarra>
            <Separador />
            <EnlaceBarra onClick={onOpenAnulados} tenue>
              Anulados
            </EnlaceBarra>
          </div>
          <div className="flex items-center gap-x-3">
            <EnlaceBarra onClick={onSelectMultifashion} tenue>
              Multifashion
            </EnlaceBarra>
            <Separador />
            <EnlaceBarra onClick={onSelectLegacy} tenue>
              Gastos Tommy y Calvin
              {/* 12 px es el piso de la casa (candado iphone-targets): nada
                  más chico, ni en una etiqueta decorativa. */}
              <span className="ml-1.5 rounded bg-gray-100 text-gray-500 text-[12px] px-1.5 py-0.5">
                Archivo
              </span>
            </EnlaceBarra>
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* 1. Marcas — la puerta a los proyectos del día a día.              */}
      {/* ---------------------------------------------------------------- */}
      <section className="space-y-2">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">
            Proyectos por marca
          </h2>
          <p className="text-[12px] text-gray-500">
            Un proyecto es de un cliente y puede trabajar varias marcas. Si
            trabaja dos, aparece en las dos tarjetas — no está duplicado.
          </p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-32 rounded-lg bg-gray-100 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {marcasOrdenadas.map((m) => {
              const facturas = resumen?.porMarca[m.id] ?? { count: 0, total: 0 };
              const muebles =
                resumen?.mueblesPorMarca?.[m.id] ?? { count: 0, total: 0 };
              const proyectos = resumen?.proyectosPorMarca?.[m.id] ?? 0;
              const empresa = EMPRESA_LABEL[m.empresa_codigo ?? ""] ?? "";
              const vacia = facturas.count === 0 && muebles.count === 0;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onSelectMarca(m.id)}
                  className={`text-left rounded-xl border bg-white p-4 hover:shadow-sm transition flex flex-col ${acentoMarca(m.codigo)}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-900 truncate">
                        {m.nombre}
                      </div>
                      <div className="text-[12px] text-gray-500 mt-0.5">
                        {empresa || (m.tipo === "interna" ? "Interna" : "—")}
                      </div>
                    </div>
                    <span className="text-xs font-bold text-gray-400">
                      {m.codigo}
                    </span>
                  </div>

                  {/* El contador de proyectos es LO que Daniel vino a buscar
                      ("no veo nova lux, dónde lo encuentro?"): va grande. */}
                  <div className="mt-3 text-[15px] font-semibold text-gray-900">
                    {vacia && proyectos === 0
                      ? "Sin proyectos todavía"
                      : plural(proyectos, "proyecto", "proyectos")}
                  </div>

                  {!vacia && (
                    <div className="mt-2 pt-2 border-t border-gray-100 space-y-1">
                      {facturas.count > 0 && (
                        <LineaGasto
                          etiqueta="Facturas"
                          bucket={facturas}
                          unidad="factura"
                          unidadPlural="facturas"
                        />
                      )}
                      {muebles.count > 0 && (
                        <LineaGasto
                          etiqueta="Muebles"
                          bucket={muebles}
                          unidad="entrega"
                          unidadPlural="entregas"
                        />
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 2. Herramientas del día a día — antes eran dos textos sueltos.    */}
      {/* ---------------------------------------------------------------- */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-900">Herramientas</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onOpenInventario}
            className="text-left rounded-xl border border-teal-200 bg-white p-4 hover:border-teal-400 hover:shadow-sm transition flex items-center gap-3 min-h-[76px]"
          >
            <span
              aria-hidden="true"
              className="shrink-0 w-10 h-10 rounded-lg bg-teal-50 text-teal-700 inline-flex items-center justify-center"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M16.5 9.4l-9-5.19" />
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <path d="M3.27 6.96L12 12.01l8.73-5.05" />
                <path d="M12 22.08V12" />
              </svg>
            </span>
            <span className="min-w-0">
              <span className="block font-semibold text-gray-900">Mobiliario</span>
              <span className="block text-[12px] text-gray-500">
                {mobiliario
                  ? `${plural(mobiliario.entregas, "entrega", "entregas")} · ${formatearMonto(mobiliario.total)} entregados`
                  : "Inventario y entregas de muebles"}
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenImpulsadoras}
            className="text-left rounded-xl border border-violet-200 bg-white p-4 hover:border-violet-400 hover:shadow-sm transition flex items-center gap-3 min-h-[76px]"
          >
            <span
              aria-hidden="true"
              className="shrink-0 w-10 h-10 rounded-lg bg-violet-50 text-violet-700 inline-flex items-center justify-center"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </span>
            <span className="min-w-0">
              <span className="block font-semibold text-gray-900">
                Impulsadoras
              </span>
              <span className="block text-[12px] text-gray-500">
                {impulsadoras && impulsadoras.count !== null
                  ? `${plural(impulsadoras.count, "impulsadora", "impulsadoras")}${
                      impulsadoras.montoMensual
                        ? ` · ${formatearMonto(impulsadoras.montoMensual)} al mes`
                        : ""
                    }`
                  : "Pagos mensuales por marca"}
              </span>
            </span>
          </button>
        </div>
      </section>
    </div>
  );
}
