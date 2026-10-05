"use client";

// ─────────────────────────────────────────────────────────────────────────────
// EL CAMPO DE UNA FECHA. Reemplaza a `<input type="date">` en todo el sistema.
//
// 🔴 CALENDARIO_SIMPLE_2026_10 = false → dibuja EXACTAMENTE el `<input
// type="date">` de antes, con las mismas props. Prendido: un botón con la fecha
// escrita («5 oct 2026») que abre UN mes; arriba «Toca el día» y los atajos Hoy
// · Ayer. Un toque elige, aplica y cierra. En el celular, hoja desde abajo con
// el vidrio de la casa.
//
// ponytail: `onChange` recibe un evento mínimo (`target.value`), que es lo
// único que leen los llamadores. Si alguien necesita el evento real, que use el
// input nativo o pase a `onValor`.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, type ChangeEvent, type InputHTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { CalendarDays } from "lucide-react";
import DesplegableFlotante from "./DesplegableFlotante";
import { ALTO_GUIA_Y_ATAJOS, Atajos } from "./AtajosFecha";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";
import { vidrioSobre, conVidrio, CLASE_VIDRIO, RADIO_VIDRIO } from "@/lib/ui/vidrio";
import { CALENDARIO_SIMPLE_2026_10, GUIA_UN_DIA } from "@/lib/ui/calendario-simple";

const CalendarioDia = dynamic(() => import("./CalendarioDia"), {
  ssr: false,
  loading: () => <div className="h-[320px] w-[300px] animate-pulse rounded-lg bg-gray-50" />,
});

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** «5 oct 2026». */
export function fechaEscrita(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  return a && m && d ? `${d} ${MESES[m - 1]} ${a}` : "";
}

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value"> & {
  type?: "date";
  value?: string;
  /** Lo que dice el botón en vez de la fecha (Planilla: «Reloj hasta 28 sep»). */
  rotulo?: ReactNode;
  /** Para pruebas y capturas: fuerza el modo nuevo aunque el interruptor esté apagado. */
  simple?: boolean;
};

export default function CampoFecha({ simple = CALENDARIO_SIMPLE_2026_10, rotulo, ...props }: Props) {
  if (!simple) return <input {...props} type="date" />;
  return <CampoFechaSimple {...props} rotulo={rotulo} />;
}

function CampoFechaSimple(props: Omit<Props, "simple">) {
  const { value = "", onChange, onBlur, min, max, disabled, className, style, placeholder, rotulo } = props;
  // El input nativo SE QUEDA, escondido: lleva el id, el rótulo, el valor y el
  // `required` del formulario (un <label htmlFor> sigue apuntando a él, y al
  // tocarlo abre el calendario). El botón solo dibuja.
  const { className: _c, style: _s, placeholder: _p, rotulo: _r, type: _t, ...nativo } = props;
  const [abierto, setAbierto] = useState(false);
  const anclaRef = useRef<HTMLButtonElement>(null);
  useBodyScrollLock(abierto);

  const cerrar = () => {
    setAbierto(false);
    // El `onBlur` de los llamadores guarda (Configuración de Asistencia).
    onBlur?.({ target: { value } } as never);
  };
  useEffect(() => {
    if (!abierto) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [abierto]);

  const elegir = (iso: string) => {
    onChange?.({ target: { value: iso }, currentTarget: { value: iso } } as ChangeEvent<HTMLInputElement>);
    setAbierto(false);
    onBlur?.({ target: { value: iso } } as never);
  };

  const enRango = (d: string) => (!min || d >= String(min)) && (!max || d <= String(max));
  const contenido = (
    <>
      <p className="px-1 pb-2 text-sm font-medium text-gray-900" data-guia-calendario>{GUIA_UN_DIA}</p>
      <Atajos claves={["hoy", "ayer"]} onElegir={(d) => elegir(d)} enRango={(d) => enRango(d)} />
      <div className="flex justify-center overflow-x-auto">
        <CalendarioDia valor={value} min={min ? String(min) : undefined} max={max ? String(max) : undefined} onDia={elegir} />
      </div>
    </>
  );

  return (
    <>
      <input
        {...nativo}
        type="date"
        value={value}
        tabIndex={-1}
        onFocus={() => { if (!disabled) setAbierto(true); }}
        className="sr-only"
      />
      <button
        ref={anclaRef}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        onClick={() => setAbierto((v) => !v)}
        style={style}
        className={`${className ?? ""} inline-flex items-center gap-2 text-left`}
      >
        <CalendarDays aria-hidden className="h-4 w-4 shrink-0 text-gray-500" />
        <span className={value ? "text-gray-900" : "text-gray-400"}>
          {rotulo ?? (value ? fechaEscrita(value) : (placeholder || "Elegir fecha"))}
        </span>
      </button>

      {/* Computadora: anclado al campo. */}
      <DesplegableFlotante
        abierto={abierto && typeof window !== "undefined" && !!window.matchMedia?.("(min-width: 1024px)").matches}
        anclaRef={anclaRef}
        onCerrar={cerrar}
        // El mismo ancho que el calendario de RangoFechas con atajos (7 × 44 + bordes + 48).
        ancho={398}
        altoDeseado={420 + ALTO_GUIA_Y_ATAJOS}
        className={vidrioSobre("rounded-xl border border-gray-200 bg-white p-3 shadow-lg")}
      >
        {contenido}
      </DesplegableFlotante>

      {/* Celular: hoja desde abajo. */}
      {abierto && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={cerrar} />
          <div className={conVidrio("absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col rounded-t-2xl bg-white shadow-xl", `absolute inset-x-2 bottom-2 flex max-h-[88vh] flex-col ${CLASE_VIDRIO} ${RADIO_VIDRIO}`)}>
            <div className="flex justify-end px-2 pt-1">
              <button type="button" onClick={cerrar} aria-label="Cerrar"
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
