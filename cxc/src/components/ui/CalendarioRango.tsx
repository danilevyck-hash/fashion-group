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
//
// ── 🔴 EL PRIMER TOQUE ES SIEMPRE EL DÍA EN QUE EMPIEZA (4-sep-2026) ─────────
//
// Daniel, textual: *«al hacer clic, selecciona la fecha que corta, no me está
// dejando seleccionar la fecha que empieza»*. Lo que lo producía era que el
// calendario PINTABA un rango que nadie había elegido —la pantalla decía «Elige
// el período» y abajo se veía la quincena en curso ya marcada—, así que el
// primer toque se leía como si estuviera CORTANDO ese rango en vez de empezando
// uno nuevo. Dos frenos, y los dos hacen falta:
//
//   · `vacio` = no se pinta NADA hasta que alguien elija. Un rango pintado es
//     una afirmación, y todavía no hay nada que afirmar.
//   · un rango que llega DE AFUERA borra cualquier elección a medias: si no,
//     un ancla vieja convertiría el toque siguiente en un FIN.
//
// ── 🔴 UN SOLO MES, también en escritorio (4-sep-2026) ──────────────────────
// Eran dos. Daniel pidió uno: el panel entra en cualquier pantalla, el mes que
// se está mirando es siempre el mismo y no hay que decidir en cuál de los dos
// tocar.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import { Calendar } from "./calendar";
import { aIso, deIso } from "./rango-fechas-iso";



export interface Props {
  desde: string;
  hasta: string;
  /** Días con alguna marcación; el resto se pinta en gris claro. */
  diasConDatos?: ReadonlySet<string> | null;
  /** 🔴 `true` = todavía NADIE eligió: no se pinta ningún rango. */
  vacio?: boolean;
  /**
   * El día que la pantalla RECOMIENDA como inicio (el siguiente al de la última
   * quincena cerrada). Se marca con un aro; **no se elige solo**.
   */
  sugerido?: string | null;
  /** Se llama SOLO cuando el rango queda cerrado. */
  onRango: (desde: string, hasta: string) => void;
  /** Para que el control de afuera pueda cambiar su encabezado. */
  onAncla?: (ancla: string | null) => void;
  onMesVisible?: (primerDia: string, ultimoDia: string) => void;
}

export default function CalendarioRango({
  desde, hasta, diasConDatos, vacio = false, sugerido, onRango, onAncla, onMesVisible,
}: Props) {
  /** El primer toque de un rango nuevo. `null` = hay un rango cerrado. */
  const [ancla, setAncla] = useState<string | null>(null);
  /** Solo desktop: el día bajo el mouse mientras hay ancla. */
  const [preview, setPreview] = useState<string | null>(null);

  // 🔴 UN RANGO QUE LLEGA DE AFUERA CIERRA LA ELECCIÓN A MEDIAS. Sin esto, un
  // ancla que quedó de antes hace que el toque siguiente se lea como el FIN —
  // que es exactamente lo que Daniel vio: «no me está dejando seleccionar la
  // fecha que empieza».
  useEffect(() => { setAncla(null); setPreview(null); }, [desde, hasta]);

  const seleccion: DateRange | undefined = useMemo(() => {
    if (ancla) {
      const fin = preview && preview !== ancla ? preview : null;
      if (!fin) return { from: deIso(ancla), to: undefined };
      const [a, b] = ancla <= fin ? [ancla, fin] : [fin, ancla];
      return { from: deIso(a), to: deIso(b) };
    }
    // 🔴 Nada pintado mientras nadie haya elegido: ver la nota de arriba.
    return !vacio && desde && hasta ? { from: deIso(desde), to: deIso(hasta) } : undefined;
  }, [ancla, preview, desde, hasta, vacio]);

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
  /** El inicio recomendado, mientras no haya nada elegido a medias. */
  const esSugerido = (d: Date) => !ancla && !!sugerido && aIso(d) === sugerido;

  return (
    <Calendar
      mode="range"
      selected={seleccion}
      defaultMonth={deIso(desde || aIso(new Date()))}
      numberOfMonths={1}
      onDayClick={tocar}
      // ⚠️ El preview es de DESKTOP. En un teléfono no hay hover: el dedo toca
      // y listo, así que `onDayMouseEnter` no se dispara y no hay nada que
      // apagar. No hace falta preguntar por el ancho.
      onDayMouseEnter={ancla ? (d) => setPreview(aIso(d)) : undefined}
      onDayMouseLeave={ancla ? () => setPreview(null) : undefined}
      onMonthChange={(m) => {
        const ini = new Date(m.getFullYear(), m.getMonth(), 1);
        const fin = new Date(m.getFullYear(), m.getMonth() + 1, 0);
        onMesVisible?.(aIso(ini), aIso(fin));
      }}
      modifiers={{ sinDatos, sugerido: esSugerido }}
      modifiersClassNames={{
        // Gris claro: se ve de un vistazo si el rango que se está por pedir
        // tiene datos o va a salir vacío.
        sinDatos: "[&>button]:text-gray-300",
        // Un aro, no un relleno: se ve dónde conviene empezar sin que parezca
        // que ya está elegido.
        sugerido: "[&>button]:ring-2 [&>button]:ring-blue-400 [&>button]:ring-offset-1",
      }}
    />
  );
}
