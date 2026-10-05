"use client";

// ─────────────────────────────────────────────────────────────────────────────
// EL PANEL DE PERÍODO — uno solo para Multifashion y Comisiones.
//
// Daniel, 5-oct-2026: «está muy larga la lista de mes-año». En vez de 57
// renglones: arriba ‹ 2026 › (sin años futuros), una grilla de 12 meses de 3×4
// (los meses futuros no aparecen) y debajo los chips que el módulo ofrezca
// («Todo el año» · «Últimos 3 meses» · «6» · «12»). Un toque aplica y cierra.
// En la computadora flota bajo el botón; en el celular, hoja desde abajo.
//
// Solo con CALENDARIO_SIMPLE_2026_10 (lo deciden `PeriodoSelect` y
// `ComisionesPeriodo`). Las flechas ‹ 2026 › solo MIRAN otro año: no aplican.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import DesplegableFlotante from "./DesplegableFlotante";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";
import { vidrioSobre, conVidrio, CLASE_VIDRIO, RADIO_VIDRIO } from "@/lib/ui/vidrio";

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const MESES_LARGOS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

export interface ChipPeriodo {
  clave: string;
  rotulo: string;
  activo: boolean;
  onElegir: () => void;
}

interface Props {
  /** Lo que dice el botón: «Octubre 2026». */
  rotulo: string;
  /** En el celular: «Oct 2026». */
  rotuloCorto?: string;
  /** Años elegibles, cualquier orden. Nunca uno futuro. */
  anios: number[];
  /** Los meses que existen en ese año (los futuros no se pasan). */
  mesesDe: (anio: number) => number[];
  /** El mes elegido, o `mes: null` si lo elegido no es un mes. */
  seleccion: { anio: number; mes: number | null };
  onMes: (anio: number, mes: number) => void;
  /** «Todo el año» del año que se está mirando. `activo` = el año elegido entero. */
  todoElAnio?: { activo: number | null; onElegir: (anio: number) => void };
  ventanas?: ChipPeriodo[];
  disabled?: boolean;
  botonClassName?: string;
}

export default function PanelPeriodo({
  rotulo, rotuloCorto, anios, mesesDe, seleccion, onMes, todoElAnio, ventanas = [], disabled, botonClassName = "",
}: Props) {
  const [abierto, setAbierto] = useState(false);
  const [verAnio, setVerAnio] = useState(seleccion.anio);
  const anclaRef = useRef<HTMLButtonElement>(null);
  useBodyScrollLock(abierto);

  const min = Math.min(...anios);
  const max = Math.max(...anios);

  useEffect(() => { if (abierto) setVerAnio(seleccion.anio); }, [abierto, seleccion.anio]);
  useEffect(() => {
    if (!abierto) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [abierto]);

  const aplicar = (f: () => void) => { f(); setAbierto(false); };
  const chip = (activo: boolean) =>
    `inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap rounded-full px-2.5 text-sm transition active:scale-[0.97] lg:min-h-9 ${
      activo ? "bg-gray-900 font-medium text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
    }`;

  const contenido = (
    <div data-panel-periodo>
      <div className="flex items-center justify-between px-1 pb-2">
        <button
          type="button"
          onClick={() => setVerAnio((a) => a - 1)}
          aria-label="Año anterior"
          className={`inline-flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-50 active:scale-[0.97] ${verAnio <= min ? "invisible" : ""}`}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold tabular-nums text-gray-900">{verAnio}</span>
        {/* Sin años futuros: la › no aparece en el año en curso. */}
        <button
          type="button"
          onClick={() => setVerAnio((a) => a + 1)}
          aria-label="Año siguiente"
          className={`inline-flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-50 active:scale-[0.97] ${verAnio >= max ? "invisible" : ""}`}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-1">
        {mesesDe(verAnio).map((m) => {
          const activo = seleccion.mes === m && seleccion.anio === verAnio;
          return (
            <button
              key={m}
              type="button"
              aria-pressed={activo}
              aria-label={`${MESES_LARGOS[m - 1]} ${verAnio}`}
              onClick={() => aplicar(() => onMes(verAnio, m))}
              className={`inline-flex min-h-[44px] items-center justify-center rounded-lg text-sm transition active:scale-[0.97] ${
                activo ? "bg-gray-900 font-medium text-white" : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              {MESES[m - 1]}
            </button>
          );
        })}
      </div>

      {(todoElAnio || ventanas.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1 border-t border-gray-100 pt-2" data-chips-periodo>
          {todoElAnio && (
            <button type="button" aria-pressed={todoElAnio.activo === verAnio}
              onClick={() => aplicar(() => todoElAnio.onElegir(verAnio))}
              className={chip(todoElAnio.activo === verAnio)}>
              Todo el año
            </button>
          )}
          {ventanas.map((v) => (
            <button key={v.clave} type="button" aria-pressed={v.activo}
              onClick={() => aplicar(v.onElegir)} className={chip(v.activo)}>
              {v.rotulo}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <>
      <button
        ref={anclaRef}
        type="button"
        disabled={disabled}
        onClick={() => setAbierto((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        aria-label={`Período: ${rotulo}`}
        className={`inline-flex min-h-[44px] items-center justify-between gap-1.5 rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-900 transition hover:border-gray-400 active:scale-[0.97] disabled:opacity-50 ${botonClassName}`}
      >
        {rotuloCorto ? (
          <><span className="whitespace-nowrap sm:hidden">{rotuloCorto}</span><span className="hidden whitespace-nowrap sm:inline">{rotulo}</span></>
        ) : <span className="whitespace-nowrap">{rotulo}</span>}
        <ChevronDown aria-hidden className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${abierto ? "rotate-180" : ""}`} />
      </button>

      {/* Computadora: bajo el botón. */}
      <DesplegableFlotante
        abierto={abierto && typeof window !== "undefined" && !!window.matchMedia?.("(min-width: 1024px)").matches}
        anclaRef={anclaRef}
        onCerrar={() => setAbierto(false)}
        ancho={336}
        altoDeseado={340}
        className={vidrioSobre("rounded-xl border border-gray-200 bg-white p-2 shadow-lg")}
      >
        {contenido}
      </DesplegableFlotante>

      {/* Celular: hoja desde abajo. */}
      {abierto && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Período">
          <div className="absolute inset-0 bg-black/40" onClick={() => setAbierto(false)} />
          <div className={conVidrio("absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col rounded-t-2xl bg-white shadow-xl", `absolute inset-x-2 bottom-2 flex max-h-[88vh] flex-col ${CLASE_VIDRIO} ${RADIO_VIDRIO}`)}>
            <div className="flex justify-end px-2 pt-1">
              <button type="button" onClick={() => setAbierto(false)} aria-label="Cerrar"
                className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-50">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-8">{contenido}</div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
