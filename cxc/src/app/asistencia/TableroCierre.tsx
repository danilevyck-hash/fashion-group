"use client";

/* ─────────────────────────────────────────────────────────────────────────────
 * EL TABLERO DE CIERRE — una línea por empresa (19-sep-2026).
 *
 * 🩸 Con «Todas» elegido, la Planilla decía *«Elige una empresa arriba para
 * armar su planilla: con «Todas» no se paga nada»* y **no mostraba nada más**.
 * Para saber cómo venía la quincena había que entrar empresa por empresa,
 * generar y mirar — cuatro veces, seis veces al mes.
 *
 * Ahora «Todas» muestra **personas · neto · qué falta para cerrar · Cerrar**,
 * una línea por empresa.
 *
 * ── 🔴 LO QUE NO SE NEGOCIA ─────────────────────────────────────────────────
 *
 *   · **NUNCA UN TOTAL DEL GRUPO.** El tablero muestra ESTADO, no totales: no
 *     hay fila «Total», ni pie, ni un número que sume dos empresas. Sumar
 *     cuatro planillas produce un número que nadie paga. El módulo puro no
 *     tiene una operación de suma entre filas y hay candado que lo barre.
 *   · **Cada cierre es el de SU empresa, por su propia puerta.** El botón de
 *     una fila manda el MISMO `POST /api/asistencia/planilla-guardada` con
 *     `{ empresa, desde, hasta }` de esa empresa, uno por vez. No existe un
 *     «cerrar todas».
 *   · **Solo se cierran quincenas.** El tablero se arma con los mismos cuatro
 *     botones de quincena, y el servidor lo vuelve a frenar
 *     (`frenoSoloQuincenas`) antes de leer nada.
 *   · **El cuadro de cada empresa sale de su PROPIA lectura**: una petición por
 *     empresa a `/api/asistencia/planilla?empresa=K`, la MISMA ruta de siempre,
 *     que ya fuerza la empresa para David y recorta por el alcance.
 * ────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ToastSystem";
// 🔴 LA MISMA VENTANA DE CONFIRMACIÓN QUE LA PLANILLA: es donde se ven los
// números que se van a congelar, y dos versiones serían dos formas de mirar la
// misma plata antes de pagarla.
import { ModalCierre } from "./PlanillaTab";
import { etiquetaRango } from "@/lib/asistencia/planilla-guardada";
import { nombreCortoEmpresa } from "@/lib/empresa-mapping";
import { empresasQueVe, type AlcanceDeEmpresas } from "@/lib/asistencia/empresa-para-todo";
import { antesDeCerrarDelCuadro, type CuadroParaAvisos } from "@/lib/asistencia/antes-de-cerrar-del-cuadro";
import { PESTANA_FICHAS } from "@/lib/asistencia/persona-en-el-centro";
import { PLANILLA_UNIDA } from "@/lib/asistencia/planilla-unida";
import {
  POR_QUE_NO_HAY_TOTAL, encabezadoDelTablero, etiquetaCerrar, filaVacia,
  sePuedeCerrar, textoQueFalta, type FilaTablero,
} from "@/lib/asistencia/tablero-cierre";

const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function TableroCierre({
  rol, desde, hasta, corte, elegido, puedeCerrar, onCerrada,
}: {
  rol: string;
  desde: string;
  hasta: string;
  /** El corte del reloj, el mismo que el selector de arriba. "" = quincena entera. */
  corte: string;
  /** `false` = todavía no se eligió quincena: no se pide nada. */
  elegido: boolean;
  /** ¿Este rol cierra? El freno de verdad lo pone el servidor. */
  puedeCerrar: boolean;
  onCerrada: () => void;
}) {
  const { toast } = useToast();
  /** Las empresas que este rol puede mirar, según el SERVIDOR. */
  const [alcance, setAlcance] = useState<AlcanceDeEmpresas>(undefined);
  const [filas, setFilas] = useState<FilaTablero[]>([]);
  const [cerrando, setCerrando] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<FilaTablero | null>(null);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const r = await fetch("/api/asistencia/alcance", { cache: "no-store" });
        const j = r.ok ? ((await r.json()) as { empresas?: string[] | null }) : null;
        if (vivo) setAlcance(j && j.empresas !== undefined ? j.empresas : null);
      } catch {
        // 🔴 FALLA ABIERTA a lo del rol, como en todo el módulo: el servidor
        // recorta igual en cada lectura. Lo que NO puede pasar es quedarse
        // esperando para siempre con el tablero en blanco.
        if (vivo) setAlcance(null);
      }
    })();
    return () => { vivo = false; };
  }, []);

  const leer = useCallback(async () => {
    if (!elegido) { setFilas([]); return; }
    // 🔴 SE ESPERA AL ALCANCE ANTES DE LEER NADA. 🩸 Sin esto el tablero se
    // arma DOS veces —una con lo del rol y otra con lo que el servidor le
    // reconoce— y entre las dos vuelve a «Cargando…» delante de quien está
    // mirando. Peor: a David y a Julio les mostraría un instante empresas que
    // su rol no puede ver. `undefined` = todavía no contestó.
    if (alcance === undefined) return;
    const empresas = empresasQueVe(rol, alcance);
    setFilas(empresas.map((e) => filaVacia(e, nombreCortoEmpresa(e))));

    // 🔴 UNA PETICIÓN POR EMPRESA, a la MISMA ruta de siempre. No hay un
    // endpoint «de todas»: eso sería un segundo motor de planilla.
    await Promise.all(empresas.map(async (empresa) => {
      const etiqueta = nombreCortoEmpresa(empresa);
      const poner = (f: Partial<FilaTablero>) =>
        setFilas((prev) => prev.map((x) => (x.empresa === empresa ? { ...x, ...f } : x)));
      try {
        const p = new URLSearchParams({ desde, hasta, empresa });
        if (PLANILLA_UNIDA && corte) p.set("corte", corte);
        const [rCuadro, rCierre] = await Promise.all([
          fetch(`/api/asistencia/planilla?${p}`, { cache: "no-store" }),
          fetch(`/api/asistencia/planilla-guardada?${new URLSearchParams({ empresa, desde, hasta })}`,
            { cache: "no-store" }),
        ]);
        const cuadro = await rCuadro.json();
        if (!rCuadro.ok) throw new Error(cuadro.error ?? "No se pudo leer");
        const cierre = rCierre.ok ? await rCierre.json().catch(() => ({})) : {};

        const lineas = (cuadro.lineas ?? []) as unknown[];
        if (lineas.length === 0) {
          poner({ estado: "vacia", personas: 0, neto: 0, totales: null, arreglar: 0, primeroQueFalta: null });
          return;
        }
        // 🔴 La lista de «qué falta» sale del MISMO módulo que la dibuja en la
        // Planilla de una empresa: no hay una segunda idea de qué frena.
        const avisos = antesDeCerrarDelCuadro(
          cuadro as CuadroParaAvisos, { desde, hasta }, PLANILLA_UNIDA, PESTANA_FICHAS,
        );
        const yaCerrada = cierre?.estado === "cerrada" || cierre?.cabecera?.estado === "cerrada";
        poner({
          estado: yaCerrada ? "cerrada" : avisos.todoListo ? "lista" : "con-pendientes",
          personas: lineas.length,
          // 🔴 El neto de ESA empresa, y de ninguna otra.
          neto: Number(cuadro.totales?.netoPagar ?? 0),
          totales: cuadro.totales ?? null,
          arreglar: avisos.arreglar.length,
          primeroQueFalta: avisos.arreglar[0]
            ? `${avisos.arreglar[0].numero ?? ""} ${avisos.arreglar[0].texto}`.trim()
            : null,
          error: null,
        });
      } catch (e) {
        // 🩸 Una lectura caída se DICE, nunca se disfraza de «no hay nadie».
        poner({
          estado: "error", error: e instanceof Error ? e.message : "No se pudo leer",
          personas: 0, neto: 0, totales: null, arreglar: 0, primeroQueFalta: null,
        });
        void etiqueta;
      }
    }));
  }, [rol, alcance, desde, hasta, corte, elegido]);

  useEffect(() => { void leer(); }, [leer]);

  async function cerrar(fila: FilaTablero) {
    setCerrando(fila.empresa);
    try {
      // 🔴 LA MISMA PUERTA DE SIEMPRE, con SU empresa. El servidor vuelve a
      // frenar todo: que sea una quincena, los avisos que bloquean (409), el
      // solapamiento y el alcance del rol.
      const res = await fetch("/api/asistencia/planilla-guardada", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresa: fila.empresa, desde, hasta }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.ok === false) {
        const frenos = Array.isArray(j.frenos)
          ? (j.frenos as Array<{ texto?: string }>).map((f) => f.texto).filter(Boolean).join(" · ")
          : "";
        throw new Error(frenos || j.error || "No se pudo cerrar");
      }
      toast(`Listo, ${fila.etiqueta} quedó cerrada`, "success");
      onCerrada();
      await leer();
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo cerrar", "error");
    } finally {
      setCerrando(null);
      setConfirmar(null);
    }
  }

  if (!elegido) return null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 className="text-sm font-medium text-gray-900">Cómo va la quincena</h2>
        <span className="text-[12px] text-gray-500">{encabezadoDelTablero(filas)}</span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-[10.5px] uppercase tracking-wide text-gray-400">
              <th className="px-3 py-2.5 text-left font-medium">Empresa</th>
              {/* 🔴 «Colaboradores», nunca «Personas»: es la palabra del
                  módulo entero desde el 10-sep-2026 (Daniel: *«no lo llames
                  personas, sino colaboradores»*), y hay barrido que lo exige. */}
              <th className="px-2 py-2.5 text-right font-medium">Colabor.</th>
              <th className="px-2 py-2.5 text-right font-medium">Neto</th>
              <th className="px-2 py-2.5 text-left font-medium">Qué falta para cerrar</th>
              <th className="px-2 py-2.5 text-right font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.empresa} className="border-b border-gray-100 last:border-0">
                <td className="px-3 py-2.5 text-gray-900">{f.etiqueta}</td>
                <td className="px-2 py-2.5 text-right tabular-nums text-gray-700">
                  {f.personas || <span className="text-gray-300">—</span>}
                </td>
                <td className="px-2 py-2.5 text-right tabular-nums text-gray-900">
                  {f.personas ? money(f.neto) : <span className="text-gray-300">—</span>}
                </td>
                <td className={`px-2 py-2.5 text-[13px] ${
                  f.estado === "error" ? "text-red-700"
                    : f.estado === "con-pendientes" ? "text-amber-800"
                      : "text-gray-600"
                }`}>
                  {textoQueFalta(f)}
                </td>
                <td className="px-2 py-2.5 text-right">
                  {sePuedeCerrar(f, puedeCerrar) && (
                    <button
                      type="button"
                      onClick={() => setConfirmar(f)}
                      disabled={cerrando !== null}
                      aria-label={etiquetaCerrar(f)}
                      className="min-h-[44px] rounded-md bg-black px-3 text-sm font-medium text-white transition active:scale-[0.97] disabled:opacity-40"
                    >
                      {cerrando === f.empresa ? "Cerrando…" : "Cerrar"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* 🔴 POR QUÉ NO HAY UN TOTAL, dicho antes de que a alguien se le ocurra
          sumar los cuatro netos de la columna. */}
      <p className="text-[12px] text-gray-500">{POR_QUE_NO_HAY_TOTAL}</p>

      {confirmar?.totales && (
        <ModalCierre
          modo="cerrar"
          empresa={confirmar.etiqueta}
          rango={etiquetaRango({ desde, hasta })}
          totales={confirmar.totales}
          cerrada={null}
          trabajando={cerrando === confirmar.empresa}
          onConfirmar={() => { void cerrar(confirmar); }}
          onCerrar={() => { if (!cerrando) setConfirmar(null); }}
        />
      )}
    </div>
  );
}
