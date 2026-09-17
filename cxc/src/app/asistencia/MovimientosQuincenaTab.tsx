"use client";

// ─────────────────────────────────────────────────────────────────────────────
// MOVIMIENTOS DE LA QUINCENA — la pantalla de LECTURA de Préstamos.
//
// Daniel, textual (17-sep-2026): *«quisiera que en préstamo tener como que un
// botón para ver el historial de las quincenas. Ya que para ver movimiento
// tengo que meterme a cada perfil. Pero para ver los movimientos de x
// quincena?»*
//
// 🔴 ACÁ NO SE ESCRIBE NADA. Ni un botón que guarde, ni un formulario, ni un
// POST. Lo que mueve plata sigue viviendo en «Quiénes deben» y en el cierre de
// la planilla.
//
// Dos bloques y un pie:
//   · **Descuentos** — lo que se le bajó a la gente.
//   · **Deudas nuevas** — lo que nació.
//   · el pie dice cuánto se prestó, cuánto se descontó y **cuánto creció o bajó
//     la deuda del grupo**, que es la línea que hoy no existe en ninguna pantalla.
//
// 🔴 La columna «Origen» es la razón de ser de todo esto: dice si el movimiento
// lo anotó el CIERRE o lo escribió alguien A MANO. La regla vive en
// `lib/asistencia/movimientos-quincena.ts`.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/ToastSystem";
import { useUrlState } from "@/lib/hooks/useUrlState";
import { hoyPanama } from "@/lib/fecha-panama";
import { fmt } from "@/lib/format";
import { capitalizarNombre } from "@/lib/nombre-en-pantalla";
import { quincenaDesdeClave, quincenasHasta, type Quincena } from "@/lib/asistencia/planilla";
import { rotuloQuincena } from "@/lib/asistencia/elegir-quincena";
import {
  etiquetaDeFiltro, filtrarPorEmpresa, nombreArchivoPorEmpresa,
} from "@/lib/asistencia/empresa-para-todo";
import {
  NOMBRE_BLOQUE,
  agruparMovimientos,
  rotuloDeLaVariacion,
  ventanaDeLaQuincena,
  type FilaMovimiento,
} from "@/lib/asistencia/movimientos-quincena";

/** El parámetro de la URL: la quincena que se mira se puede compartir. */
export const PARAM_QUINCENA = "quincena";

/**
 * Cuántas quincenas se ofrecen hacia atrás. Un año: la pregunta de Daniel es
 * «¿qué pasó en tal quincena?», y esa quincena puede ser la de hace ocho meses.
 */
export const CUANTAS_QUINCENAS = 24;

function money(n: number): string {
  return n < 0 ? `−$${fmt(-n)}` : `$${fmt(n)}`;
}

export default function MovimientosQuincenaTab(props: { empresa?: string }) {
  const { toast } = useToast();
  const opciones = useMemo(() => quincenasHasta(hoyPanama(), CUANTAS_QUINCENAS), []);
  // Mismo nivel → `replace`: el Atrás del navegador no cicla por quincenas.
  const [claveUrl, setClave] = useUrlState(PARAM_QUINCENA, "");
  const quincena: Quincena = useMemo(() => {
    const q = quincenaDesdeClave(claveUrl);
    // Una clave rara (o vacía) cae en la quincena en curso, nunca en blanco.
    return q ?? opciones[0];
  }, [claveUrl, opciones]);

  const [filas, setFilas] = useState<FilaMovimiento[] | null>(null);
  const [error, setError] = useState(false);

  const cargar = useCallback(async () => {
    setFilas(null);
    setError(false);
    const { desde, hasta } = ventanaDeLaQuincena(quincena);
    try {
      const q = new URLSearchParams({ desde, hasta });
      const r = await fetch(`/api/asistencia/prestamos-movimientos?${q}`, { cache: "no-store" });
      const j = (await r.json()) as { filas?: FilaMovimiento[]; error?: string };
      if (!r.ok) throw new Error(j.error ?? "No se pudieron leer los movimientos");
      setFilas(j.filas ?? []);
    } catch {
      // 🔑 Una lectura caída se DICE; nunca se disfraza de «no hay nada».
      toast("No se pudieron leer los movimientos. Intenta de nuevo.", "error");
      setError(true);
      setFilas([]);
    }
  }, [quincena, toast]);

  useEffect(() => { void cargar(); }, [cargar]);

  // 🔴 El filtro de empresa de arriba recorta las filas ANTES de sumar: el pie
  // sigue a lo que se ve.
  const agrupado = useMemo(
    () => agruparMovimientos(filtrarPorEmpresa(filas ?? [], props.empresa)),
    [filas, props.empresa],
  );

  async function bajarExcel() {
    try {
      const [{ downloadWorkbook }, { construirExcelMovimientos }] = await Promise.all([
        import("@/lib/excel-export"),
        import("@/lib/asistencia/movimientos-excel"),
      ]);
      const { desde, hasta } = ventanaDeLaQuincena(quincena);
      downloadWorkbook(
        construirExcelMovimientos({
          agrupado,
          etiquetaQuincena: quincena.etiqueta,
          etiquetaEmpresa: etiquetaDeFiltro(props.empresa),
        }),
        nombreArchivoPorEmpresa("Movimientos-prestamos", props.empresa, desde, hasta, "xlsx"),
      );
      toast("Excel listo — revisa tu carpeta de descargas", "success");
    } catch {
      toast("No se pudo armar el Excel. Intenta de nuevo.", "error");
    }
  }

  const { descuentos, deudas, resumen } = agrupado;
  const hayAlgo = descuentos.length > 0 || deudas.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-gray-600">Quincena</span>
          <select
            aria-label="Quincena"
            value={quincena.clave}
            onChange={(e) => setClave(e.target.value)}
            className="min-h-[44px] rounded-lg border border-gray-200 px-3 text-base outline-none transition focus:border-black sm:text-sm"
          >
            {opciones.map((q) => (
              <option key={q.clave} value={q.clave}>
                {rotuloQuincena(q)} {q.anio}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void bajarExcel()}
          disabled={!hayAlgo}
          className="min-h-[44px] rounded-md border border-gray-300 px-4 text-sm text-gray-700 transition hover:border-black hover:text-black active:scale-[0.97] disabled:opacity-40"
        >
          Excel
        </button>
      </div>

      {filas === null && <p className="text-sm text-gray-500">Leyendo los movimientos…</p>}

      {filas !== null && error && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          No se pudieron leer los movimientos de esta quincena. Vuelve a intentarlo.
        </p>
      )}

      {filas !== null && !error && !hayAlgo && (
        // 🔑 Nunca un «$0.00» grande: se dice con palabras qué pasa.
        <p className="rounded-lg border border-gray-200 px-4 py-6 text-center text-sm text-gray-600">
          En esta quincena no se descontó ni se prestó nada.
        </p>
      )}

      {filas !== null && hayAlgo && (
        <>
          <Bloque titulo={NOMBRE_BLOQUE.descuento} filas={descuentos} total={resumen.descuentos.total} />
          <Bloque titulo={NOMBRE_BLOQUE.deuda} filas={deudas} total={resumen.deudas.total} />

          {/* 🔴 EL PIE: la línea que hoy no existe en ninguna pantalla. */}
          <div className="rounded-lg border border-gray-200 px-4 py-3">
            <div className="flex flex-wrap gap-x-8 gap-y-3">
              <Dato rotulo="Se prestó" valor={money(resumen.deudas.total)} />
              <Dato rotulo="Se descontó" valor={money(resumen.descuentos.total)} />
              <Dato
                rotulo={rotuloDeLaVariacion(resumen.variacion)}
                valor={money(Math.abs(resumen.variacion))}
              />
            </div>
          </div>
        </>
      )}

      {resumen.sinClasificar > 0 && (
        <p className="text-sm text-amber-800">
          {resumen.sinClasificar === 1
            ? "Hay 1 movimiento con un concepto que el sistema no sabe leer: no entra en ningún total."
            : `Hay ${resumen.sinClasificar} movimientos con un concepto que el sistema no sabe leer: no entran en ningún total.`}
        </p>
      )}

      <p className="text-sm text-gray-500">
        «Del cierre» quiere decir que lo anotó el cierre de la planilla de esa
        quincena. «A mano» quiere decir que alguien lo escribió en Préstamos.
      </p>
    </div>
  );
}

function Dato(props: { rotulo: string; valor: string }) {
  return (
    <div>
      <p className="text-sm text-gray-500">{props.rotulo}</p>
      <p className="text-lg font-medium tabular-nums text-gray-900">{props.valor}</p>
    </div>
  );
}

function Bloque(props: { titulo: string; filas: readonly FilaMovimiento[]; total: number }) {
  const { titulo, filas, total } = props;
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium text-gray-900">
          {titulo}
          <span className="text-gray-400"> · </span>
          <span className="text-gray-500">{filas.length}</span>
        </h2>
        <p className="text-sm tabular-nums font-medium text-gray-900">{money(total)}</p>
      </div>

      {filas.length === 0 ? (
        <p className="rounded-lg border border-gray-200 px-4 py-4 text-sm text-gray-500">
          {titulo === NOMBRE_BLOQUE.descuento
            ? "No se le descontó nada a nadie en esta quincena."
            : "No nació ninguna deuda en esta quincena."}
        </p>
      ) : (
        <>
          {/* El deslizamiento vive ADENTRO de la tabla, nunca en la página. */}
          <div className="hidden overflow-x-auto rounded-lg border border-gray-200 lg:block">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Colaborador</th>
                  <th className="px-3 py-2 font-medium">Concepto</th>
                  <th className="px-3 py-2 text-right font-medium">Monto</th>
                  <th className="px-3 py-2 text-right font-medium">Día</th>
                  <th className="px-3 py-2 font-medium">Origen</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-3 py-2 text-gray-900">{capitalizarNombre(f.nombre)}</td>
                    <td className="px-3 py-2 text-gray-600">{f.etiqueta}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-gray-900">{money(f.monto)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-600">{f.dia}</td>
                    <td className={`px-3 py-2 ${f.origen === "cierre" ? "text-emerald-700" : "text-gray-500"}`}>
                      {f.origenEtiqueta}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* En el celular, tarjetas: cinco columnas en 390 px no se leen. */}
          <div className="space-y-2 lg:hidden">
            {filas.map((f) => (
              <div key={f.id} className="rounded-lg border border-gray-200 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-gray-900">{capitalizarNombre(f.nombre)}</p>
                  <p className="text-sm tabular-nums font-medium text-gray-900">{money(f.monto)}</p>
                </div>
                <p className="mt-1 text-sm text-gray-500">
                  {f.etiqueta} · día {f.dia}
                  <span className="text-gray-400"> · </span>
                  <span className={f.origen === "cierre" ? "text-emerald-700" : "text-gray-500"}>
                    {f.origenEtiqueta}
                  </span>
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
