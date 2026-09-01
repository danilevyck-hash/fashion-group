"use client";

// ─────────────────────────────────────────────────────────────────────────────
// EL CALENDARIO DE RANGO — el interior del control. Se carga bajo demanda.
//
// 🩸 VIVE APARTE DE `RangoFechas` A PROPÓSITO. `react-day-picker` + `date-fns`
// pesan, y este calendario lo abre una fracción de las visitas. Separado, el
// `dynamic(() => import(...))` del control lo saca del bundle inicial de las
// seis pantallas; junto, lo arrastraría todo el mundo.
//
// 🔴 LA MÁQUINA DE ESTADOS DE LOS TOQUES, que es todo el diseño:
//   · sin ancla        → toque fija el ANCLA y el header pide el fin;
//   · con ancla        → toque CIERRA el rango, lo pinta y aplica;
//   · con rango cerrado→ toque empieza un ANCLA NUEVA. Sin botón de borrar.
//
// 🔑 Y SI ELIGEN AL REVÉS, SE ORDENA SOLO. Nadie quiere leer «la fecha inicial
// debe ser menor que la final»: quiso decir del 10 al 28, se entiende, se hace.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import { Calendar } from "./calendar";
import { aIso, deIso } from "./rango-fechas-iso";



export interface Props {
  desde: string;
  hasta: string;
  /** Días con alguna marcación; el resto se pinta en gris claro. */
  diasConDatos?: ReadonlySet<string> | null;
  /** Un solo mes (móvil) o dos (desktop). */
  meses: 1 | 2;
  /** Se llama SOLO cuando el rango queda cerrado. */
  onRango: (desde: string, hasta: string) => void;
  /** Para que el control de afuera pueda cambiar su encabezado. */
  onAncla?: (ancla: string | null) => void;
  onMesVisible?: (primerDia: string, ultimoDia: string) => void;
}

export default function CalendarioRango({
  desde, hasta, diasConDatos, meses, onRango, onAncla, onMesVisible,
}: Props) {
  /** El primer toque de un rango nuevo. `null` = hay un rango cerrado. */
  const [ancla, setAncla] = useState<string | null>(null);
  /** Solo desktop: el día bajo el mouse mientras hay ancla. */
  const [preview, setPreview] = useState<string | null>(null);

  const seleccion: DateRange | undefined = useMemo(() => {
    if (ancla) {
      const fin = preview && preview !== ancla ? preview : null;
      if (!fin) return { from: deIso(ancla), to: undefined };
      const [a, b] = ancla <= fin ? [ancla, fin] : [fin, ancla];
      return { from: deIso(a), to: deIso(b) };
    }
    return desde && hasta ? { from: deIso(desde), to: deIso(hasta) } : undefined;
  }, [ancla, preview, desde, hasta]);

  function tocar(d: Date) {
    const iso = aIso(d);
    if (!ancla) {
      setAncla(iso);
      setPreview(null);
      onAncla?.(iso);
      return;
    }
    // 🔑 Se ordena solo. Elegir del 10 al 28 y del 28 al 10 son lo mismo.
    const [a, b] = ancla <= iso ? [ancla, iso] : [iso, ancla];
    setAncla(null);
    setPreview(null);
    onAncla?.(null);
    onRango(a, b);
  }

  const sinDatos = (d: Date) => {
    if (!diasConDatos) return false;
    return !diasConDatos.has(aIso(d));
  };

  return (
    <Calendar
      mode="range"
      selected={seleccion}
      defaultMonth={deIso(desde || aIso(new Date()))}
      numberOfMonths={meses}
      onDayClick={tocar}
      // ⚠️ El preview es de DESKTOP. En un teléfono no hay hover: el dedo toca
      // y listo, así que `onDayMouseEnter` no se dispara y no hay nada que
      // apagar. No hace falta preguntar por el ancho.
      onDayMouseEnter={ancla ? (d) => setPreview(aIso(d)) : undefined}
      onDayMouseLeave={ancla ? () => setPreview(null) : undefined}
      onMonthChange={(m) => {
        const ini = new Date(m.getFullYear(), m.getMonth(), 1);
        const fin = new Date(m.getFullYear(), m.getMonth() + meses, 0);
        onMesVisible?.(aIso(ini), aIso(fin));
      }}
      modifiers={{ sinDatos }}
      modifiersClassNames={{
        // Gris claro: se ve de un vistazo si el rango que se está por pedir
        // tiene datos o va a salir vacío.
        sinDatos: "[&>button]:text-gray-300",
      }}
    />
  );
}
