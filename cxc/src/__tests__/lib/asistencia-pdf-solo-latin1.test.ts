/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CANDADO — NINGÚN CARÁCTER RARO EN LOS DOS PDF DE ASISTENCIA.
 *
 * 🩸 LO QUE COSTÓ APRENDER ESTO: la línea de vacaciones de la Planilla salía
 * ILEGIBLE en el papel que se firma, y en pantalla y en el Excel se veía
 * perfecta. La culpa era UNA flecha.
 *
 * `textoRangos` armaba los rangos con «16 jul 2026 → 13 ago 2026». jsPDF
 * declara Helvetica con `WinAnsiEncoding`, que escribe UN byte por letra; en
 * cuanto la cadena trae un carácter que no entra en ese byte, jsPDF cambia SOLO
 * a UTF-16 —sin avisar, sin fallar el build, sin dejar rastro—. Pero la fuente
 * del PDF sigue declarada de un byte, así que el visor lee cada mitad de letra
 * como una letra: **no se pierde la flecha, se pierde LA LÍNEA ENTERA**.
 *
 * Medido el 1-sep-2026 sobre los bytes del PDF, con la flecha puesta:
 *   Planilla — 67 cadenas dibujadas, 1 en UTF-16, y era justo el aviso
 *   «3 vacaciones marcadas como «ya se le pagó»: esos días NO se pagaron…»,
 *   o sea el renglón que dice a quién y cuánto no se le pagó.
 *
 * ── DÓNDE ESTÁ LA RAYA, EXACTAMENTE ──────────────────────────────────────────
 *
 * No es «latin-1» a secas. Medido carácter por carácter contra jsPDF:
 *
 *   SE ESCRIBEN EN UN BYTE Y SE VEN BIEN (no molestan):
 *     · « » (0xb7, 0xab, 0xbb) y todas las vocales acentuadas y la ñ — latin-1;
 *     — – … “ ” ‘ ’ € (0x97, 0x96, 0x85, 0x93, 0x94, 0x91, 0x92, 0x80) — NO son
 *     latin-1, pero sí están en WinAnsi/cp1252 y jsPDF los mapea a su byte
 *     (`fromCharCode` en la tabla de `jspdf.node.js`, «Unicode characters to
 *     WinAnsiEncoding»). El PDF de la Planilla ya usa el guion largo en el
 *     subtítulo y en la fila TOTAL, y sale impreso perfecto.
 *
 *   ROMPEN LA LÍNEA ENTERA:
 *     → ≥ ≤ ✓ ✗ ⚠ y cualquier emoji — no están en WinAnsi, y el que aparezca
 *     uno arrastra a UTF-16 todo el string que lo contiene.
 *
 * Por eso este candado NO barre «lo que no es latin-1»: eso daría rojo sobre
 * texto que hoy se imprime bien y empujaría a arreglar lo que no está roto.
 * Barre **lo que jsPDF no puede escribir en un byte**, que es exactamente lo
 * que rompe el papel.
 *
 * ── CÓMO MIDE ────────────────────────────────────────────────────────────────
 *
 * No lee el código ni espía funciones: GENERA los dos PDF de verdad y les saca
 * del content stream cada string que dibujan. Una cadena que salió en UTF-16 se
 * reconoce sola —viene con un `\0` entre letra y letra—, así que el candado
 * mira EL SÍNTOMA, no una lista de caracteres que alguien tiene que mantener.
 * Un `→` nuevo en cualquier texto que llegue al papel se cae acá, venga de
 * donde venga.
 *
 * ⚠️ El fixture tiene que seguir encendiendo TODOS los avisos y las CUATRO
 * clases de línea. Un aviso apagado es un texto que el candado deja de mirar,
 * y el último test es el que vigila que el barrido no se quede mudo.
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, expect, it } from "vitest";
import jsPDF from "jspdf";
import { construirPdf } from "@/lib/asistencia/exportar";
import { construirPdfPlanilla, type DatosPlanillaExport } from "@/lib/asistencia/planilla-exportar";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import { TOTALES_CERO, type LineaPlanilla, type Quincena } from "@/lib/asistencia/planilla";
import type { PersonaReporte } from "@/lib/asistencia/reporte";
// Las MISMAS funciones que arman los avisos en producción: escribirlos a mano
// dejaría el candado midiendo frases que el sistema no genera, y el día que la
// frase de verdad cambie nadie se entera.
import { textoRangos, textoVacacionesNoPagadas } from "@/lib/asistencia/vacaciones";

// ── Sacarle al PDF lo que de verdad dibuja ───────────────────────────────────

/** El byte que delata el UTF-16: jsPDF escribe `\0` entre letra y letra. */
const NUL = "\u0000";

/**
 * Los caracteres de más de un byte que jsPDF SÍ sabe bajar a un byte solo.
 * Copiados de la tabla «Unicode characters to WinAnsiEncoding» de
 * `node_modules/jspdf/dist/jspdf.node.js`. Si jsPDF cambia esa tabla, este
 * candado se pone conservador (acusa de más), nunca permisivo.
 */
const WINANSI_DE_DOS_BYTES = new Set([
  402, 8211, 8212, 8216, 8217, 8218, 8220, 8221, 8222, 8224, 8225, 8226, 8230,
  8364, 8240, 8249, 8250, 710, 8482, 338, 339, 732, 352, 353, 376, 381, 382,
]);

function seEscribeEnUnByte(ch: string): boolean {
  const c = ch.charCodeAt(0);
  return c <= 255 || WINANSI_DE_DOS_BYTES.has(c);
}

/** Deshace el escapado de un string literal de PDF: `\(`, `\\` y octales. */
function desescapar(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== "\\") { out += s[i]; continue; }
    const sig = s[i + 1];
    if (sig >= "0" && sig <= "7") {
      out += String.fromCharCode(parseInt(s.slice(i + 1, i + 4), 8));
      i += 3;
    } else {
      out += sig;
      i += 1;
    }
  }
  return out;
}

/** Un string que vino en UTF-16, leído de vuelta para poder mostrarlo. */
function desdeUtf16(s: string): string {
  let out = "";
  for (let i = 0; i + 1 < s.length; i += 2) {
    out += String.fromCharCode((s.charCodeAt(i) << 8) | s.charCodeAt(i + 1));
  }
  return out;
}

interface Cadena {
  /** Tal como quedó en el papel, ya desescapada y con el UTF-16 deshecho. */
  texto: string;
  /** `true` = jsPDF cambió de codificación: esta línea sale ilegible. */
  enUtf16: boolean;
}

/**
 * Cada string que el PDF dibuja. Se lee del content stream sin comprimir
 * (jsPDF no comprime salvo que se le pida): es el papel de verdad, no el
 * código que lo produjo.
 */
function cadenasDelPdf(bytes: ArrayBuffer): Cadena[] {
  const raw = Buffer.from(bytes).toString("latin1");
  const cadenas: Cadena[] = [];
  for (const stream of raw.matchAll(/stream\n([\s\S]*?)\nendstream/g)) {
    const cuerpo = stream[1];
    if (!cuerpo.includes("BT")) continue;
    for (const t of cuerpo.matchAll(/\(((?:\\.|[^\\()])*)\)\s*Tj/g)) {
      const crudo = desescapar(t[1]);
      const enUtf16 = crudo.includes(NUL);
      cadenas.push({ texto: enUtf16 ? desdeUtf16(crudo) : crudo, enUtf16 });
    }
  }
  return cadenas;
}

/** El renglón de la protesta: qué línea se rompió y cuál fue el carácter. */
function acusar(c: Cadena): string {
  const culpables = [...new Set([...c.texto].filter((ch) => !seEscribeEnUnByte(ch)))];
  const cuales = culpables
    .map((ch) => `«${ch}» (U+${ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")})`)
    .join(", ");
  return `  ${cuales || "(carácter no identificado)"}  en  «${c.texto.slice(0, 110)}»`;
}

function protestar(papel: string, malas: Cadena[]): string {
  return (
    `\n\n${malas.length} línea(s) del PDF «${papel}» salen ILEGIBLES en el papel.\n\n` +
    `jsPDF escribe con WinAnsiEncoding —un byte por letra— y ante un carácter\n` +
    `que no entra ahí cambia SOLO a UTF-16: no se pierde ese carácter, se pierde\n` +
    `la LÍNEA COMPLETA. En pantalla y en el Excel se sigue viendo bien.\n\n` +
    `Cambia el carácter por uno que se escriba en un byte:\n` +
    `  «→» → « a »   «≥» → «al menos»   «✓» → «Sí»   «⚠» → (nada: la fila ya va en rojo)\n` +
    `Sí se pueden usar: · « » — – … “ ” y todas las vocales acentuadas.\n\n` +
    malas.map(acusar).join("\n") + "\n"
  );
}

// ── El peor caso, con TODO encendido ─────────────────────────────────────────

const DESDE = "2026-08-01";
const HASTA = "2026-08-15";

const QUINCENA: Quincena = {
  anio: 2026, mes: 8, n: 1, desde: DESDE, hasta: HASTA,
  etiqueta: "1 al 15 de agosto de 2026", clave: "2026-08-1",
};

/**
 * Una persona del Reporte con días corregidos y días de trabajo fuera de la
 * oficina: los dos avisos del pie que SOLO aparecen cuando hay algo que avisar.
 */
function persona(i: number): PersonaReporte {
  return {
    codigo: String(100 + i),
    nombre: `BRICEIDA MONTERO DE LA ROSA ${i}`,
    salida: "17:00",
    almuerzoMin: 30,
    dias: [],
    resumen: {
      diasTrabajados: 10, ausenciasSinJustificar: 1, ausenciasJustificadas: 0,
      diasTrabajandoFuera: 2, diasVacaciones: 0, diasVacacionesYaPagadas: 0,
      vecesTarde: 3, minutosTarde: 45.5, minutosTardeDeDiasARevisar: 10,
      diasConPermiso: 0, minutosPerdonadosPorPermiso: 0,
      excesoAlmuerzoMin: 12, salidaTempranaMin: 5, extraMin: 30,
      diasARevisar: 2, diasEnCurso: 0, tiempoNoTrabajadoMin: 62.5,
      diasCorregidos: 4, correcciones: 6,
    },
  } as unknown as PersonaReporte;
}

/**
 * Las CUATRO clases de línea de la Planilla, porque cada una escribe un texto
 * distinto en la columna 2: la calculada (números), la de «Tú decides» (el
 * motivo + el quincenal de referencia), la de servicio profesional y la que
 * tiene un dato sin configurar.
 *
 * ⚠️ Va por `as unknown as LineaPlanilla` a propósito: el PDF lee la etiqueta,
 * el código y `dinero`; llenar las veinte columnas de `horas` —que este candado
 * no mira— solo agregaría números que después nadie mantiene.
 */
function linea(i: number, tipo: "ok" | "decidir" | "fuera" | "falta"): LineaPlanilla {
  return {
    codigo: String(200 + i),
    etiqueta: `MARIA ELENA RODRIGUEZ DE GONZALEZ ${i}`,
    nombre: `MARIA ELENA RODRIGUEZ DE GONZALEZ ${i}`,
    empresa: "confecciones_boston",
    empresaEtiqueta: "Confecciones Boston",
    salarioMensual: 1000,
    jornadaSemanal: 48,
    horas: {} as LineaPlanilla["horas"],
    faltaConfigurar: tipo === "falta" ? ["salario", "jornada semanal"] : [],
    fueraDePlanilla: tipo === "fuera",
    parte: null,
    // El motivo se arma con la función de producción: es el texto que traía la
    // flecha, y es el que tiene que seguir llegando al papel.
    decidirAMano: tipo === "decidir"
      ? `Vacaciones del ${textoRangos([{ desde: "2026-07-16", hasta: "2026-08-13" }])}`
      : null,
    quincenalReferencia: tipo === "decidir" ? 500 : null,
    dinero: tipo === "ok" ? {
      rataHora: 4.81, valorMinuto: 0.08, salarioQuincenal: 500,
      extraDiurno: 12.34, extraNocturno: 0, excedente: 0, domingos: 0, feriados: 0,
      ausencias: 38.48, ausenciaPorTardanza: 8.12, tardanzas: 3.21,
      totalBruto: 470.65, baseSeguros: null, seguroSocial: 46.83,
      seguroEducativo: 6.12, isr: 0, prestamo: 25, terceros: 0, mercancia: 0,
      totalDeducciones: 77.95, otrosServicios: 0, netoPagar: 392.7,
    } : null,
  } as unknown as LineaPlanilla;
}

const CINCO_PERSONAS = [
  "BRICEIDA MONTERO DE LA ROSA",
  "ANGELA MARIA GARCIA DE LOS SANTOS",
  "JUAN CARLOS PEREZ GONZALEZ",
  "MARIA ELENA RODRIGUEZ DE GOMEZ",
  "ROSA AMELIA CASTILLO DE JIMENEZ",
];

/** El aviso que traía la flecha, armado por la función de producción. */
const AVISO_VACACIONES = textoVacacionesNoPagadas(
  CINCO_PERSONAS.map((etiqueta, i) => ({
    codigo: String(300 + i),
    etiqueta,
    rangos: [{ desde: "2026-08-03", hasta: "2026-08-07" }],
    dias: 5,
    monto: 192.6,
  })),
);

function datosPlanilla(): DatosPlanillaExport {
  return {
    lineas: [linea(1, "ok"), linea(2, "decidir"), linea(3, "fuera"), linea(4, "falta")],
    totales: { ...TOTALES_CERO, personas: 4 },
    quincena: QUINCENA,
    empresaEtiqueta: "Confecciones Boston",
    reglas: REGLAS_DEFAULT,
    // Los seis avisos del pie ENCENDIDOS a la vez.
    periodoAbierto: {
      diasHabiles: 4,
      texto: "Este período todavía no termina: faltan 4 días hábiles, y los días"
        + " que no pasaron no se contaron ni como falta ni como presente.",
    },
    avisoSinFicha: "Marcaron en el reloj y no tienen ficha: 101, 102, 103.",
    avisoVacacionesNoPagadas: AVISO_VACACIONES,
    avisoExtraSinAprobar: `No se pagaron horas extra sin aprobar: ${CINCO_PERSONAS
      .map((n) => `${n} · 12,5 h · $75,15`).join(" — ")}`,
    avisoPrestamoSinAprobar: `Préstamos que no se descontaron porque nadie los aprobó: ${CINCO_PERSONAS
      .map((n) => `${n} · $120,00`).join(" — ")}`,
    avisoPrestamoSinAtar: "Hay 2 préstamos con saldo que no están atados a nadie"
      + " de esta planilla: $700,00.",
  } as unknown as DatosPlanillaExport;
}

const PAPELES: Array<{ nombre: string; cadenas: Cadena[] }> = [
  {
    nombre: "Reporte de asistencia",
    cadenas: cadenasDelPdf(
      construirPdf({ personas: [persona(1), persona(2), persona(3)], desde: DESDE, hasta: HASTA })
        .output("arraybuffer") as ArrayBuffer,
    ),
  },
  {
    nombre: "Planilla quincenal",
    cadenas: cadenasDelPdf(
      construirPdfPlanilla(datosPlanilla()).output("arraybuffer") as ArrayBuffer,
    ),
  },
];

// ── Los candados ─────────────────────────────────────────────────────────────

describe("🔴 los dos PDF de asistencia se imprimen legibles", () => {
  for (const papel of PAPELES) {
    it(`${papel.nombre}: ninguna línea sale en UTF-16 (o sea, ilegible)`, () => {
      const malas = papel.cadenas.filter((c) => c.enUtf16);
      expect(malas, malas.length === 0 ? "" : protestar(papel.nombre, malas)).toEqual([]);
    });

    it(`${papel.nombre}: todo lo que se dibuja se escribe en un byte`, () => {
      // El mismo defecto visto del otro lado: acá no se pregunta cómo salió
      // codificado, se pregunta si el carácter existe en WinAnsi. Las dos
      // preguntas tienen que dar lo mismo; si alguna vez difieren, es que jsPDF
      // cambió de comportamiento y hay que volver a medir.
      const malas = papel.cadenas.filter((c) => [...c.texto].some((ch) => !seEscribeEnUnByte(ch)));
      expect(malas, malas.length === 0 ? "" : protestar(papel.nombre, malas)).toEqual([]);
    });
  }
});

describe("el barrido en sí: que no se quede mudo", () => {
  it("los dos papeles dibujaron texto de verdad", () => {
    // Si un refactor rompe el fixture o la lectura del content stream, el
    // candado pasaría vacío sin protestar. Medido el 1-sep-2026: 62 cadenas el
    // Reporte, 67 la Planilla.
    for (const papel of PAPELES) {
      expect(papel.cadenas.length, `${papel.nombre} no dibujó nada`).toBeGreaterThan(30);
    }
  });

  it("🩸 el aviso de vacaciones —el que se rompía— llega al papel de la Planilla", () => {
    // Si el fixture deja de encender este aviso, el candado sigue verde y ya no
    // está cuidando nada. El rango va con « a », nunca con una flecha.
    const planilla = PAPELES[1].cadenas.map((c) => c.texto).join(" ");
    expect(planilla).toContain("3 ago 2026 a 7 ago 2026");
  });

  it("🔴 detecta la flecha: un papel con «→» NO puede pasar", () => {
    // La mutación, hecha por el candado mismo. Sin esto, el día que jsPDF deje
    // de delatar el cambio de codificación este archivo quedaría de adorno.
    const doc = new jsPDF();
    doc.text("Vacaciones del 16 jul 2026 → 13 ago 2026", 10, 10);
    const cadenas = cadenasDelPdf(doc.output("arraybuffer") as ArrayBuffer);
    expect(cadenas.some((c) => c.enUtf16)).toBe(true);
    expect(cadenas.some((c) => [...c.texto].some((ch) => !seEscribeEnUnByte(ch)))).toBe(true);
  });

  it("no acusa a los que SÍ se escriben en un byte", () => {
    // El guion largo, el punto medio, las comillas angulares y las vocales
    // acentuadas ya están en los dos papeles y salen impresos bien. Un candado
    // que los acusara empujaría a arreglar lo que no está roto.
    const doc = new jsPDF();
    doc.text("Planilla — Confecciones Boston · «quincena» … “así” 1 día · $1,00", 10, 10);
    const cadenas = cadenasDelPdf(doc.output("arraybuffer") as ArrayBuffer);
    expect(cadenas.some((c) => c.enUtf16)).toBe(false);
    expect(cadenas.every((c) => [...c.texto].every(seEscribeEnUnByte))).toBe(true);
  });
});
