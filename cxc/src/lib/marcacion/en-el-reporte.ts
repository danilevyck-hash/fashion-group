// ─────────────────────────────────────────────────────────────────────────────
// LO QUE VE LA CONTADORA (14-sep-2026) — módulo PURO.
//
// En Asistencia, en el día de esa persona: la selfie, el mapa, y UNA línea que
// dice de dónde salió la marca.
//
// 🔴 LA PALABRA «llegó» ESTÁ PROHIBIDA ACÁ. El mockup decía «Llegó a las
// 11:30» y Daniel avisó, textual, que la contadora iba a entender que llegó a
// TRABAJAR a esa hora — y no: a las 11:30 el teléfono recién encontró señal.
// La hora que cuenta (9:12) va GRANDE; esto va chico, en gris, y dice
// «envió». Hay candado que barre la palabra.
//
// 🔑 LAS MARCAS DEL TELÉFONO NO ENTRAN AL MOTOR DEL REPORTE. Para el cálculo
// son una marca más —la primera del día es la entrada y la última la salida,
// venga del reloj o del teléfono— y eso ya funciona sin tocar nada. Esto es
// una capa de ARRIBA: se lee aparte, se junta por (código, día) y se dibuja
// debajo del renglón. Así ni un minuto de la planilla depende de este archivo.
// ─────────────────────────────────────────────────────────────────────────────

import { diaPanamaDe, horaAmPm, horaCorta, textoParaLaContadora } from "./marcacion";

/** Una marca del teléfono, como la guarda la base. */
export interface MarcaTelefonoCruda {
  id: string;
  empleado_codigo: string | null;
  ocurrio_en: string;
  tipo: string | null;
  sin_senal: boolean | null;
  created_at: string | null;
  foto_path: string | null;
  lat: number | null;
  lng: number | null;
}

/** Una marca del teléfono, como la dibuja la pantalla. */
export interface MarcaTelefonoUI {
  id: string;
  /** «9:12» — la hora que CUENTA, la misma que muestra la columna de arriba. */
  hora: string;
  /** «9:12 a. m.» — como se lee en la línea. */
  horaLarga: string;
  /** «Marcada sin señal · el teléfono la envió 11:30». Nunca dice «llegó». */
  detalle: string;
  tieneFoto: boolean;
  lat: number | null;
  lng: number | null;
}

/** La llave del día de una persona. Código y NO nombre, como todo el sistema. */
export function llaveDelDia(codigo: string, fecha: string): string {
  return `${codigo}|${fecha}`;
}

/**
 * De las filas crudas a un mapa `codigo|fecha → marcas`, ordenadas por hora.
 * El día es el de PANAMÁ, el mismo con el que el reporte arma sus renglones:
 * con el día de UTC, todo lo marcado después de las 7 p.m. caería al renglón
 * del día siguiente.
 */
export function marcasPorDia(
  filas: readonly MarcaTelefonoCruda[],
): Record<string, MarcaTelefonoUI[]> {
  const salida: Record<string, MarcaTelefonoUI[]> = {};
  for (const f of filas) {
    const codigo = String(f.empleado_codigo ?? "").trim();
    if (!codigo || !f.ocurrio_en) continue;
    const llave = llaveDelDia(codigo, diaPanamaDe(f.ocurrio_en));
    (salida[llave] ??= []).push({
      id: String(f.id),
      hora: horaCorta(f.ocurrio_en),
      horaLarga: horaAmPm(f.ocurrio_en),
      detalle: textoParaLaContadora({
        sinSenal: Boolean(f.sin_senal),
        // Sin `created_at` no se puede decir a qué hora la envió el teléfono:
        // se cae a la hora de la marca, que es lo único que se sabe. Nunca se
        // inventa un instante.
        creadoEn: f.created_at ?? f.ocurrio_en,
      }),
      tieneFoto: Boolean(String(f.foto_path ?? "").trim()),
      lat: typeof f.lat === "number" ? f.lat : null,
      lng: typeof f.lng === "number" ? f.lng : null,
    });
  }
  for (const k of Object.keys(salida)) {
    salida[k].sort((a, b) => (a.hora < b.hora ? -1 : 1));
  }
  return salida;
}
