"use client";

// ─────────────────────────────────────────────────────────────────────────────
// LA TARJETA DE UNA META — "cómo vamos", que es lo que pidió Daniel.
//
// Contesta TRES preguntas, en este orden, porque es el orden en que se
// preguntan:
//
//   1. ¿Cuánto llevamos?      → el monto grande + la barra
//   2. ¿Cuánto falta?         → el número de al lado
//   3. ¿ASÍ COMO VAMOS, LLEGAMOS?  ← la que no se podía contestar antes
//
// ── 🔴 LA TERCERA ES TODO EL PUNTO, Y POR ESO SE EXPLICA EN LA TARJETA ──────
// La meta va de septiembre a diciembre, y **diciembre es el 58,8% de la
// temporada** (medido sobre sep-dic 2025). Al 31 de octubre habrá pasado la
// mitad del calendario y apenas la cuarta parte de la venta esperada: una barra
// en 24% con "van 2 de 4 meses" al lado se lee como un fracaso, y sería falso.
//
// Por eso la tarjeta NUNCA muestra la proyección sin decir de dónde sale. La
// línea "la cuenta toma en cuenta que diciembre es el mes fuerte" no es adorno:
// sin ella, el número de arriba parece magia y nadie le cree.
//
// ⚠️ Y cuando NO se puede proyectar, se dice — no se inventa. Al principio del
// período cualquier división amplifica el ruido, así que la tarjeta dice
// "todavía es muy pronto" en vez de un número con cara de dato.
//
// Anchos: 390 · 834 · 1440. Todo apila hacia abajo; la barra es la única cosa
// que ocupa el ancho y usa `w-full`. Sin controles adentro salvo el botón de
// editar, que va en 44 px.
// ─────────────────────────────────────────────────────────────────────────────

import { Pencil, Trophy, TrendingUp, TrendingDown, Clock } from "lucide-react";
import { fmtMoney } from "@/lib/ventas/format";
import { textoAporteNoAsignado } from "@/lib/multifashion/metas-clave";
import type { MetaConAvance } from "@/lib/multifashion/metas-lectura";

const FMT_FECHA = new Intl.DateTimeFormat("es-PA", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
  year: "numeric",
});

function fecha(iso: string): string {
  return FMT_FECHA.format(new Date(`${iso}T12:00:00Z`));
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

interface Props {
  meta: MetaConAvance;
  puedeEditar: boolean;
  onEditar: (meta: MetaConAvance) => void;
}

export function MetaAvanceCard({ meta, puedeEditar, onEditar }: Props) {
  const a = meta.avance;

  // El ancho de la barra se topa en 100% para que superar la meta no la haga
  // desbordar la tarjeta; el número de al lado sí muestra el porcentaje real.
  const anchoBarra = Math.min(100, Math.max(0, a.pctVendido * 100));

  const restoTexto = textoAporteNoAsignado(meta.aporteNoAsignado);

  const tono = a.cumplida
    ? "border-emerald-300 bg-emerald-50/70"
    : a.alcanza === false
      ? "border-amber-300 bg-amber-50/70"
      : "border-gray-200 bg-white";

  return (
    <section aria-label={`Meta ${meta.nombre}`} className={`w-full rounded-lg border ${tono} p-4 md:p-5`}>
      {/* ── Encabezado ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-gray-950 md:text-lg">{meta.nombre}</h3>
          <p className="mt-0.5 text-xs text-gray-600">
            Del {fecha(meta.desde)} al {fecha(meta.hasta)}
            {meta.tipo === "vendedora" && " · meta de cada vendedora"}
            {!meta.activa && " · pausada"}
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

      {/* ── 1. Cuánto llevamos ─────────────────────────────────────────── */}
      <div className="mt-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="font-mono text-3xl font-semibold tabular-nums tracking-tight text-gray-950 md:text-4xl">
          {fmtMoney(a.vendido)}
        </span>
        <span className="text-sm text-gray-600">
          de {fmtMoney(a.objetivo)}
        </span>
        <span className="font-mono text-sm font-medium tabular-nums text-gray-700">
          · {pct(a.pctVendido)}
        </span>
      </div>

      <div
        className="mt-2.5 h-2.5 w-full overflow-hidden rounded-full bg-gray-200"
        role="img"
        aria-label={`Llevan ${pct(a.pctVendido)} de la meta`}
      >
        <div
          className={`h-full rounded-full transition-all ${a.cumplida ? "bg-emerald-600" : "bg-teal-700"}`}
          style={{ width: `${anchoBarra}%` }}
        />
      </div>

      {/* ── 2. Cuánto falta ────────────────────────────────────────────── */}
      <p className="mt-2 text-sm text-gray-700">
        {a.cumplida ? (
          <span className="font-medium text-emerald-800">
            ¡Meta cumplida! Llevan {fmtMoney(a.vendido - a.objetivo)} de más.
          </span>
        ) : (
          <>
            Faltan <strong className="font-mono tabular-nums">{fmtMoney(a.falta)}</strong>
            {a.estado === "en-curso" && (
              <> y quedan <strong>{a.diasQueFaltan}</strong> {a.diasQueFaltan === 1 ? "día" : "días"}</>
            )}
            .
          </>
        )}
      </p>

      {/* ── 3. ¿Así como vamos, llegamos? ──────────────────────────────── */}
      <div className="mt-3 border-t border-gray-200/80 pt-3">
        {a.estado === "por-empezar" ? (
          <p className="flex items-start gap-1.5 text-sm text-gray-600">
            <Clock className="mt-0.5 h-4 w-4 shrink-0" />
            Esta meta todavía no empieza.
          </p>
        ) : a.motivoSinProyeccion === "muy-temprano" ? (
          // 🩸 Un número inventado con cara de dato es peor que no tener número.
          <p className="flex items-start gap-1.5 text-sm text-gray-600">
            <Clock className="mt-0.5 h-4 w-4 shrink-0" />
            Todavía es muy pronto para saber si el ritmo alcanza. Pasó muy poco del
            período y cualquier cuenta daría un número que engaña.
          </p>
        ) : a.proyeccion == null ? null : (
          <>
            <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
              {a.alcanza ? (
                <TrendingUp className="h-4 w-4 shrink-0 self-center text-emerald-700" />
              ) : (
                <TrendingDown className="h-4 w-4 shrink-0 self-center text-amber-700" />
              )}
              <span className="font-medium text-gray-900">
                {a.estado === "cerrada" ? "Cerraron en" : "Así como van, cierran en"}
              </span>
              <span className="font-mono text-lg font-semibold tabular-nums text-gray-950">
                {fmtMoney(a.proyeccion)}
              </span>
            </p>
            <p
              className={`mt-1 text-sm font-medium ${
                a.alcanza ? "text-emerald-800" : "text-amber-800"
              }`}
            >
              {a.alcanza
                ? `Alcanza — y sobran ${fmtMoney(Math.abs(a.brechaProyectada ?? 0))}.`
                : `Así no alcanza: faltarían ${fmtMoney(Math.abs(a.brechaProyectada ?? 0))}.`}
            </p>

            {/* 🔑 De dónde sale la cuenta. Sin esto el número parece magia. */}
            <p className="mt-1.5 text-xs leading-relaxed text-gray-500">
              {a.base === "temporada" ? (
                <>
                  La cuenta no va por días: toma en cuenta cómo se vendió el año pasado
                  en estos mismos meses, así que ya sabe que diciembre es el mes fuerte.
                  Del período ya pasó el <strong>{pct(a.fraccionTranscurrida)}</strong> de
                  la venta que se espera ({a.diasTranscurridos} de {a.diasTotales} días).
                </>
              ) : (
                <>
                  La cuenta va por días parejos ({a.diasTranscurridos} de {a.diasTotales}),
                  porque no hay ventas del año pasado en estos mismos meses para
                  comparar. Si unos meses venden más que otros, este número se queda
                  corto o se pasa.
                </>
              )}
            </p>
          </>
        )}
      </div>

      {/* ── El premio ──────────────────────────────────────────────────── */}
      {(meta.premio || meta.premioMonto != null) && (
        <p className="mt-3 flex flex-wrap items-center gap-1.5 text-sm text-gray-700">
          <Trophy className="h-4 w-4 shrink-0 text-amber-600" />
          <span className="font-medium">Premio:</span>
          {meta.premio}
          {meta.premioMonto != null && (
            <span className="font-mono tabular-nums">({fmtMoney(meta.premioMonto)})</span>
          )}
        </p>
      )}

      {/* ── Quiénes participan ─────────────────────────────────────────────
          🔴 DOS VISTAS DISTINTAS SEGÚN EL TIPO, y no da lo mismo.

          · Meta GRUPAL → cuánto APORTÓ cada una al avance. No hay meta
            personal y no se inventa ninguna: Daniel fue explícito en que una
            meta grupal NO genera metas individuales.
            🔴 Y la lista NO decide qué se mide: el avance es la TIENDA ENTERA,
            elegir participantes solo elige a quién se le muestra su aporte. Por
            eso los porcentajes suman ~96% y no 100%, y por eso hay una línea
            que lo explica al pie.
          · Meta POR VENDEDORA → la meta de cada una (la que él escribió a
            mano) y su avance contra ella.

          ⚠️ SIN PODIO NI MEDALLAS en la grupal, aunque vaya ordenada por
          aporte: el premio es colectivo ("el viaje es de todas o de ninguna"),
          y un ranking acá le daría dos mensajes contradictorios a la misma
          gente — "compitan" y "ayúdense". La competencia individual ya existe
          y vive FUERA de este módulo, en el bono de $50 a la mejor del mes. */}
      {meta.porVendedora.length > 0 && (
        <div className="mt-3 border-t border-gray-200/80 pt-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
            {meta.tipo === "vendedora" ? "La meta de cada una" : "Cuánto aportó cada una"}
          </p>
          {meta.tipo === "grupal" && (
            <p className="mb-2 text-xs leading-relaxed text-gray-500">
              La meta cuenta toda la venta de la tienda, no solo la de ellas.
            </p>
          )}
          <ul className="space-y-1.5">
            {meta.porVendedora.map((v) => (
              <li key={v.clave} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <span className="min-w-0 text-sm text-gray-800">{v.nombre}</span>
                <span className="font-mono text-sm tabular-nums text-gray-700">
                  {fmtMoney(v.vendido)}
                  {meta.tipo === "vendedora" && v.avance ? (
                    <span
                      className={`ml-2 font-medium ${
                        v.avance.cumplida ? "text-emerald-700" : "text-gray-500"
                      }`}
                    >
                      {pct(v.avance.pctVendido)} de {fmtMoney(v.avance.objetivo)}
                    </span>
                  ) : meta.tipo === "vendedora" ? (
                    // Participante de una meta individual a la que todavía no le
                    // escribieron su monto. Se dice; no se le inventa uno.
                    <span className="ml-2 text-gray-500">sin monto puesto</span>
                  ) : (
                    <span className="ml-2 text-gray-500">{pct(v.aporte)} del avance</span>
                  )}
                </span>
              </li>
            ))}
          </ul>

          {/* 🔴 LOS APORTES NO SUMAN 100%, Y LA PANTALLA DICE POR QUÉ.
              La meta mide la tienda entera, así que lo facturado con el código
              de gente que ya no trabaja acá está DENTRO del avance y no es de
              nadie de la lista. Sin esta línea, una lista que suma 96% se lee
              como un error del sistema y se deja de creer el número entero. El
              porcentaje sale del período de ESTA meta: no hay un 4% escrito a
              mano, y el día que esos códigos se cierren la línea desaparece. */}
          {meta.tipo === "grupal" && restoTexto != null && (
            <p className="mt-2 text-xs leading-relaxed text-gray-500">{restoTexto}</p>
          )}
        </div>
      )}
    </section>
  );
}
