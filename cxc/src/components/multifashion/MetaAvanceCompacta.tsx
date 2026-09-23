"use client";

// ─────────────────────────────────────────────────────────────────────────────
// LA TARJETA DE UNA META, COMPACTA (23-sep-2026, mockup aprobado).
//
// 🩸 En Vendedoras la meta se dibujaba DOS veces: la tarjeta grande
// (`MetaAvanceCard`, 9 datos) y debajo `MetasEnVendedoras` con las MISMAS
// cuatro filas, los MISMOS montos y la MISMA nota del 1 %. Queda UNA tarjeta
// con lo mismo en menos renglones:
//
//   Viaje playa                                             [Cambiar]
//   Del 1 sept al 31 dic 2026 · 🏆 Un viaje para todas
//   $31,834.45 de $420,000.00 · 8% · quedan 99 días
//   [barra]
//   ↘ Así como van, cierran en $388,326.47 · faltarían $31,673.53
//     (cuenta por temporada: ya sabe cuáles son los meses fuertes)
//   Sheynee Batista $11,320.43 · 36%  …
//   El 1% restante son ventas con el código de alguien que ya no está…
//
// ⚠️ MISMOS datos, MISMA cuenta (`avance` viene del servidor). La tarjeta de
// siempre sigue existiendo para el interruptor apagado.
// ─────────────────────────────────────────────────────────────────────────────

import { Pencil, TrendingDown, TrendingUp } from "lucide-react";
import { fmtMoney } from "@/lib/ventas/format";
import { textoAporteNoAsignado } from "@/lib/multifashion/metas-clave";
import type { MetaConAvance } from "@/lib/multifashion/metas-lectura";

const FMT_FECHA = new Intl.DateTimeFormat("es-PA", { timeZone: "UTC", day: "numeric", month: "short" });
const FMT_FECHA_ANIO = new Intl.DateTimeFormat("es-PA", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });

const fecha = (iso: string) => FMT_FECHA.format(new Date(`${iso}T12:00:00Z`));
const fechaAnio = (iso: string) => FMT_FECHA_ANIO.format(new Date(`${iso}T12:00:00Z`));
const pct = (n: number) => `${Math.round(n * 100)}%`;

interface Props {
  meta: MetaConAvance;
  puedeEditar: boolean;
  onEditar: (meta: MetaConAvance) => void;
}

export function MetaAvanceCompacta({ meta, puedeEditar, onEditar }: Props) {
  const a = meta.avance;
  const anchoBarra = Math.min(100, Math.max(0, a.pctVendido * 100));
  const restoTexto = textoAporteNoAsignado(meta.aporteNoAsignado);
  const tono = a.cumplida
    ? "border-emerald-300 bg-emerald-50/70"
    : a.alcanza === false ? "border-amber-300 bg-amber-50/70" : "border-gray-200 bg-white";

  return (
    <section aria-label={`Meta ${meta.nombre}`} data-elemento="meta" className={`w-full rounded-lg border ${tono} p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-gray-950">{meta.nombre}</h3>
          <p className="mt-0.5 text-xs text-gray-600">
            Del {fecha(meta.desde)} al {fechaAnio(meta.hasta)}
            {meta.tipo === "vendedora" && " · meta de cada vendedora"}
            {!meta.activa && " · pausada"}
            {(meta.premio || meta.premioMonto != null) && (
              <> · 🏆 {meta.premio}{meta.premioMonto != null && <span className="font-mono tabular-nums"> ({fmtMoney(meta.premioMonto)})</span>}</>
            )}
          </p>
        </div>
        {puedeEditar && (
          <button
            type="button"
            onClick={() => onEditar(meta)}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 transition active:scale-[0.97] hover:border-gray-300 hover:text-gray-900"
          >
            <Pencil className="h-3.5 w-3.5" /> Cambiar
          </button>
        )}
      </div>

      {/* Cuánto llevamos · cuánto falta, en UNA línea. */}
      <p className="mt-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="font-mono text-2xl font-semibold tabular-nums tracking-tight text-gray-950">{fmtMoney(a.vendido)}</span>
        <span className="text-sm text-gray-600">de {fmtMoney(a.objetivo)}</span>
        <span className="font-mono text-sm font-medium tabular-nums text-gray-700">· {pct(a.pctVendido)}</span>
        {a.estado === "en-curso" && !a.cumplida && (
          <span className="text-sm text-gray-600">· quedan {a.diasQueFaltan} {a.diasQueFaltan === 1 ? "día" : "días"}</span>
        )}
      </p>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-200" role="img" aria-label={`Llevan ${pct(a.pctVendido)} de la meta`}>
        <div className={`h-full rounded-full ${a.cumplida ? "bg-emerald-600" : "bg-teal-700"}`} style={{ width: `${anchoBarra}%` }} />
      </div>

      {/* ¿Así como vamos, llegamos? — una línea, y de dónde sale la cuenta. */}
      <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-sm">
        {a.cumplida ? (
          <span className="font-medium text-emerald-800">¡Meta cumplida! Llevan {fmtMoney(a.vendido - a.objetivo)} de más.</span>
        ) : a.estado === "por-empezar" ? (
          <span className="text-gray-600">Esta meta todavía no empieza.</span>
        ) : a.motivoSinProyeccion === "muy-temprano" || a.proyeccion == null ? (
          <span className="text-gray-600">Todavía es muy pronto para saber si el ritmo alcanza.</span>
        ) : (
          <>
            {a.alcanza ? <TrendingUp className="h-4 w-4 shrink-0 text-emerald-700" /> : <TrendingDown className="h-4 w-4 shrink-0 text-amber-700" />}
            <span className="font-medium text-gray-900">{a.estado === "cerrada" ? "Cerraron en" : "Así como van, cierran en"}</span>
            <span className="font-mono font-semibold tabular-nums text-gray-950">{fmtMoney(a.proyeccion)}</span>
            <span className={a.alcanza ? "text-emerald-800" : "text-amber-800"}>
              · {a.alcanza ? `sobran ${fmtMoney(Math.abs(a.brechaProyectada ?? 0))}` : `faltarían ${fmtMoney(Math.abs(a.brechaProyectada ?? 0))}`}
            </span>
            <span className="text-xs text-gray-500">
              {a.base === "temporada"
                ? "(cuenta por temporada: ya sabe cuáles son los meses fuertes)"
                : "(cuenta por días parejos: no hay año pasado para comparar)"}
            </span>
          </>
        )}
      </p>

      {/* Cuánto aportó cada una (grupal) · la meta de cada una (por vendedora).
          Sin podio ni medallas: el premio es de todas o de ninguna. */}
      {meta.porVendedora.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-gray-200/80 pt-3">
          {meta.porVendedora.map((v) => (
            <li key={v.clave} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span className="min-w-0 text-sm text-gray-800">{v.nombre}</span>
              <span className="font-mono text-sm tabular-nums text-gray-700">
                {fmtMoney(v.vendido)}
                {meta.tipo === "vendedora" && v.avance ? (
                  <span className={`ml-2 font-medium ${v.avance.cumplida ? "text-emerald-700" : "text-gray-500"}`}>
                    {pct(v.avance.pctVendido)} de {fmtMoney(v.avance.objetivo)}
                  </span>
                ) : meta.tipo === "vendedora" ? (
                  <span className="ml-2 text-gray-500">sin monto puesto</span>
                ) : (
                  <span className="ml-2 text-gray-500">· {pct(v.aporte)}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {meta.tipo === "grupal" && restoTexto != null && (
        <p className="mt-2 text-xs leading-relaxed text-gray-500">{restoTexto}</p>
      )}
    </section>
  );
}
