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

import {
  diaPanamaDe,
  horaAmPm,
  horaCorta,
  textoParaLaContadora,
  textoRelojCorrido,
} from "./marcacion";

/** Una marca del teléfono, como la guarda la base. */
export interface MarcaTelefonoCruda {
  id: string;
  empleado_codigo: string | null;
  ocurrio_en: string;
  tipo: string | null;
  sin_senal: boolean | null;
  created_at: string | null;
  /** La hora que tenía el teléfono al tomar la selfie. Con señal es solo
   *  testigo — y ese testigo es lo que delata un reloj corrido. */
  hora_telefono: string | null;
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
  /** «el reloj de su teléfono está corrido 2 h», o `null` si está en hora.
   *  No cambia ningún cálculo: la hora que cuenta es la del servidor. */
  relojCorrido: string | null;
  /** La persona la deshizo desde su teléfono: NO cuenta. La fila sigue en la
   *  base — se ve tachada, nunca se esconde. */
  quitada: boolean;
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
      // 🔴 EL RELOJ CORRIDO SE DICE AUNQUE HAYA HABIDO SEÑAL (14-sep-2026).
      // Con señal la hora que entra es la del servidor y no pasa nada; pero el
      // día que esa misma persona marque SIN señal, la que entra es la de su
      // teléfono. Saberlo antes vale.
      relojCorrido: textoRelojCorrido(f.ocurrio_en, f.hora_telefono),
      quitada: false,
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

/**
 * Señala las marcas que se DESHICIERON, por `id` y nunca por hora.
 *
 * 🔴 SE SEÑALAN, NO SE ESCONDEN. La marca existió y la fila sigue en la base:
 * taparla sería descartar un dato en silencio, que es justo lo que esta casa no
 * hace. El motor ya dejó de contarla (`aplicarCorrecciones`); acá solo se dice.
 *
 * Devuelve un mapa NUEVO: no muta el que recibe.
 */
export function senalarQuitadas(
  porDia: Readonly<Record<string, MarcaTelefonoUI[]>>,
  idsQuitadas: ReadonlySet<string>,
): Record<string, MarcaTelefonoUI[]> {
  if (idsQuitadas.size === 0) return porDia as Record<string, MarcaTelefonoUI[]>;
  const salida: Record<string, MarcaTelefonoUI[]> = {};
  for (const [k, lista] of Object.entries(porDia)) {
    salida[k] = lista.map((m) =>
      idsQuitadas.has(m.id)
        ? {
            ...m,
            quitada: true,
            detalle: textoParaLaContadora({ sinSenal: false, creadoEn: m.hora, quitada: true }),
          }
        : m,
    );
  }
  return salida;
}
