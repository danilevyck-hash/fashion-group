/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CANDADO — el pie de los PDF de asistencia tiene que CABER EN LA HOJA.
 *
 * `doc.text` de jsPDF no envuelve solo: dibuja el string en una recta y lo que
 * pasa del borde de la hoja no se ve. No avisa, no corta, no falla el build.
 *
 * 🩸 Medido el 1-sep-2026, sobre los bytes del PDF y no sobre el código:
 *   · Reporte — hoja útil 251,4 mm; el pie del caso base ya iba en 218,3 mm y
 *     con días corregidos + «trabajo fuera de la oficina» llegaba a 464,6 mm.
 *   · Planilla — hoja útil 335,6 mm; la línea de avisos llegaba a 491,4 mm.
 * Se perdía la mitad del aviso que dice que hay horas escritas a mano, y el que
 * dice que a alguien no se le pagaron sus horas extra. El papel se firma.
 *
 * ── CÓMO MIDE ESTE TEST ──────────────────────────────────────────────────────
 * No mira el código ni espía funciones: GENERA el PDF de verdad, le saca cada
 * string dibujado del content stream (dónde empieza, con qué fuente y a qué
 * tamaño) y lo vuelve a medir con `getTextWidth`, que es la misma métrica que
 * usó jsPDF para dibujarlo. Un `doc.text` largo sin partir se cae acá.
 *
 * Mide las DOS cosas, porque arreglar solo una rompe la otra:
 *   1. ANCHO — ninguna línea pasa del borde derecho.
 *   2. ALTO  — el pie crece hacia arriba, así que se verifica que no se meta
 *      adentro de la tabla ni se salga por abajo.
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, expect, it } from "vitest";
import jsPDF from "jspdf";
import { construirPdf } from "@/lib/asistencia/exportar";
import type { PersonaReporte } from "@/lib/asistencia/reporte";
import { construirPdfPlanilla, type DatosPlanillaExport } from "@/lib/asistencia/planilla-exportar";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import { PIE_ALTO_LINEA_MM, PIE_BASE_MM } from "@/lib/asistencia/pdf-pie";
import { TOTALES_CERO, type LineaPlanilla, type Quincena } from "@/lib/asistencia/planilla";
// La MISMA función que arma el aviso en producción: el peor caso del candado
// tiene que ser una frase que el sistema pueda generar de verdad.
import { textoVacacionesNoPagadas } from "@/lib/asistencia/vacaciones";

// ── Sacarle a un PDF lo que de verdad dibuja ─────────────────────────────────

/** PDF trabaja en puntos; los dos documentos están en milímetros. */
const PT_A_MM = 25.4 / 72;

interface Dibujo {
  texto: string;
  /** Dónde EMPIEZA el string, en mm desde el borde izquierdo. */
  xMm: number;
  /** Su línea base, en mm desde el borde de ABAJO (así crece el eje en PDF). */
  yDesdeAbajoMm: number;
  negrita: boolean;
  sizePt: number;
}

/**
 * Deshace el escapado de un string literal de PDF: `\(`, `\\` y octales.
 *
 * 🩸 Después hay que MIRAR SI VINO EN UTF-16. jsPDF cambia de codificación solo,
 * sin avisar, en cuanto el texto trae un carácter que no entra en latin-1 —el
 * `→` de los rangos de vacaciones, por ejemplo—: entonces cada letra ocupa dos
 * bytes. Leído como latin-1 ese string sale con un `\0` entre letra y letra, y
 * `getTextWidth` lo mide al DOBLE: 323 mm que caben se leen como 647 que no, y
 * el candado acusa un desborde que no existe. Costó una corrida entenderlo.
 */
function decodificar(s: string): string {
  if (!s.includes("\u0000")) return s;
  let out = "";
  for (let i = 0; i + 1 < s.length; i += 2) {
    out += String.fromCharCode((s.charCodeAt(i) << 8) | s.charCodeAt(i + 1));
  }
  return out;
}

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

/**
 * Cada string que el PDF dibuja, con su posición y su fuente.
 *
 * 🔑 Se lee del content stream sin comprimir (jsPDF no comprime salvo que se le
 * pida). Es el papel de verdad: si un aviso no está acá, no está en el papel.
 */
function dibujosDelPdf(bytes: ArrayBuffer): Dibujo[] {
  const raw = Buffer.from(bytes).toString("latin1");

  // /F3 → "Helvetica-Bold". El pie va en normal; la tabla mezcla las dos, y
  // medir una negrita con la métrica de la normal daría de menos.
  const negritas = new Set<string>();
  for (const m of raw.matchAll(/\/BaseFont\s*\/([A-Za-z0-9,\-+]+)[\s\S]{0,400}?\/Name\s*\/(F\d+)/g)) {
    if (/bold/i.test(m[1])) negritas.add(m[2]);
  }

  const dibujos: Dibujo[] = [];
  for (const stream of raw.matchAll(/stream\n([\s\S]*?)\nendstream/g)) {
    const cuerpo = stream[1];
    if (!cuerpo.includes("BT")) continue;
    let fuente = "F1";
    let sizePt = 0;
    let x = 0;
    let y = 0;
    const tokens = cuerpo.matchAll(
      /\/(F\d+)\s+([\d.]+)\s+Tf|([-\d.]+)\s+([-\d.]+)\s+Td|\(((?:\\.|[^\\()])*)\)\s*Tj/g,
    );
    for (const t of tokens) {
      if (t[1] !== undefined) { fuente = t[1]; sizePt = parseFloat(t[2]); continue; }
      if (t[3] !== undefined) { x = parseFloat(t[3]); y = parseFloat(t[4]); continue; }
      dibujos.push({
        texto: decodificar(desescapar(t[5])),
        xMm: x * PT_A_MM,
        yDesdeAbajoMm: y * PT_A_MM,
        negrita: negritas.has(fuente),
        sizePt,
      });
    }
  }
  return dibujos;
}

/** Dónde TERMINA cada string, medido con la misma métrica con que se dibujó. */
function bordeDerecho(regla: jsPDF, d: Dibujo): number {
  regla.setFont("helvetica", d.negrita ? "bold" : "normal");
  regla.setFontSize(d.sizePt);
  return d.xMm + regla.getTextWidth(d.texto);
}

// ── Los datos del peor caso ──────────────────────────────────────────────────

const DESDE = "2026-08-01";
const HASTA = "2026-08-15";

/**
 * El peor caso del Reporte: nombre largo, días corregidos y días de trabajo
 * fuera de la oficina — los dos avisos que solo aparecen cuando hay algo que
 * avisar, que es exactamente cuando el pie se desbordaba.
 */
function persona(codigo: string, nombre: string): PersonaReporte {
  return {
    codigo,
    nombre,
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
  };
}

/** Gente de sobra para que la tabla llene páginas enteras y llegue a su piso. */
const MUCHA_GENTE: PersonaReporte[] = Array.from({ length: 90 }, (_, i) =>
  persona(String(100 + i), `BRICEIDA MONTERO DE LA ROSA ${i + 1}`));

const QUINCENA: Quincena = {
  anio: 2026, mes: 8, n: 1, desde: DESDE, hasta: HASTA,
  etiqueta: "1 al 15 de agosto de 2026", clave: "2026-08-1",
};

/**
 * Los seis avisos de la Planilla ENCENDIDOS a la vez. Es el peor caso REAL, y
 * no uno inventado: los avisos crecen con la gente —cada persona agrega su
 * nombre, su rango y su monto a la MISMA frase— así que una quincena con cinco
 * casos produce un párrafo de varios cientos de milímetros.
 *
 * 🔑 El de vacaciones se arma con `textoVacacionesNoPagadas`, la función de
 * producción: escribirlo a mano dejaría el candado midiendo una frase que el
 * sistema no genera, y el día que la frase de verdad crezca nadie se entera.
 */
const CINCO_PERSONAS = [
  "BRICEIDA MONTERO DE LA ROSA",
  "ANGELA MARIA GARCIA DE LOS SANTOS",
  "JUAN CARLOS PEREZ GONZALEZ",
  "MARIA ELENA RODRIGUEZ DE GOMEZ",
  "ROSA AMELIA CASTILLO DE JIMENEZ",
];

const AVISOS_PLANILLA = {
  periodoAbierto: {
    diasHabiles: 4,
    texto: "Este período todavía no termina: faltan 4 días hábiles, y los días que"
      + " no pasaron no se contaron ni como falta ni como presente.",
  },
  avisoSinFicha: "Marcaron en el reloj y no tienen ficha: 101, 102, 103, 104, 105.",
  avisoVacacionesNoPagadas: textoVacacionesNoPagadas(
    CINCO_PERSONAS.map((etiqueta, i) => ({
      codigo: String(300 + i),
      etiqueta,
      rangos: [{ desde: "2026-08-03", hasta: "2026-08-07" }],
      dias: 5,
      monto: 192.6,
    })),
  ),
  avisoExtraSinAprobar: `No se pagaron horas extra sin aprobar: ${CINCO_PERSONAS
    .map((n) => `${n} · 12,5 h · $75,15`).join(" — ")}`,
  avisoPrestamoSinAprobar: `Préstamos que no se descontaron porque nadie los aprobó: ${CINCO_PERSONAS
    .map((n) => `${n} · $120,00`).join(" — ")}`,
  avisoPrestamoSinAtar: "Hay 2 préstamos con saldo que no están atados a nadie de"
    + " esta planilla, así que no se le están descontando a ninguna persona: $700,00.",
};

/**
 * Una línea de la planilla que sí se pudo calcular.
 *
 * ⚠️ Va por `as unknown as LineaPlanilla` a propósito: el PDF solo lee la
 * etiqueta, el código y `dinero`, y llenar las veinte columnas de `horas` —que
 * este candado no mira— solo agregaría números que después nadie mantiene.
 * Lo que se está midiendo acá es geometría, no planilla.
 */
function lineaPlanilla(i: number): LineaPlanilla {
  return {
    codigo: String(200 + i),
    etiqueta: `MARIA ELENA RODRIGUEZ DE GONZALEZ ${i + 1}`,
    nombre: `MARIA ELENA RODRIGUEZ DE GONZALEZ ${i + 1}`,
    empresa: "confecciones_boston",
    empresaEtiqueta: "Confecciones Boston",
    salarioMensual: 1000,
    jornadaSemanal: 48,
    horas: {} as LineaPlanilla["horas"],
    faltaConfigurar: [],
    fueraDePlanilla: false,
    pagaSeguros: true,
    baseSeguros: null,
    noMarcaReloj: false,
    parte: null,
    decidirAMano: null,
    quincenalReferencia: null,
    dinero: {
      rataHora: 4.81, valorMinuto: 0.08, salarioQuincenal: 500,
      extraDiurno: 12.34, extraNocturno: 0, excedente: 0, domingos: 0, feriados: 0,
      ausencias: 38.48, ausenciaPorTardanza: 8.12, tardanzas: 3.21,
      totalBruto: 470.65, baseSeguros: null, seguroSocial: 46.83,
      seguroEducativo: 6.12, isr: 0, prestamo: 25, terceros: 0, mercancia: 0,
      totalDeducciones: 77.95, otrosServicios: 0, netoPagar: 392.7,
    } as LineaPlanilla["dinero"],
  } as unknown as LineaPlanilla;
}

function planillaPeorCaso(): DatosPlanillaExport {
  return {
    lineas: Array.from({ length: 90 }, (_, i) => lineaPlanilla(i)),
    totales: { ...TOTALES_CERO, personas: 90 },
    quincena: QUINCENA,
    empresaEtiqueta: "Confecciones Boston",
    reglas: REGLAS_DEFAULT,
    ...AVISOS_PLANILLA,
  };
}

// ── Las dos mediciones, iguales para los dos papeles ─────────────────────────

interface Papel {
  nombre: string;
  bytes: ArrayBuffer;
  /** El formato con el que se hizo, para que la regla mida con la misma hoja. */
  formato: "letter" | "legal";
  margenMm: number;
}

function papeles(): Papel[] {
  const reporte = construirPdf({ personas: MUCHA_GENTE, desde: DESDE, hasta: HASTA });
  const planilla = construirPdfPlanilla(planillaPeorCaso());
  return [
    {
      nombre: "Reporte de asistencia",
      bytes: reporte.output("arraybuffer") as ArrayBuffer,
      formato: "letter",
      margenMm: 14,
    },
    {
      nombre: "Planilla quincenal",
      bytes: planilla.output("arraybuffer") as ArrayBuffer,
      formato: "legal",
      margenMm: 10,
    },
  ];
}

describe("🔴 el pie de los PDF de asistencia cabe en la hoja", () => {
  for (const papel of papeles()) {
    describe(papel.nombre, () => {
      const regla = new jsPDF({ orientation: "landscape", unit: "mm", format: papel.formato });
      const anchoHoja = regla.internal.pageSize.getWidth();
      const altoHoja = regla.internal.pageSize.getHeight();
      const bordeDerechoMm = anchoHoja - papel.margenMm;
      const dibujos = dibujosDelPdf(papel.bytes);

      it("dibuja algo (si no, el resto de este candado no prueba nada)", () => {
        expect(dibujos.length).toBeGreaterThan(20);
      });

      it("🔴 NINGUNA línea pasa del borde derecho de la hoja", () => {
        const afuera = dibujos
          .map((d) => ({ d, fin: bordeDerecho(regla, d) }))
          // Medio milímetro de gracia: jsPDF redondea las coordenadas al
          // escribirlas y la métrica de la regla no es bit a bit la del papel.
          .filter(({ fin }) => fin > bordeDerechoMm + 0.5)
          .map(({ d, fin }) =>
            `  · termina en ${fin.toFixed(1)} mm (la hoja llega a ${bordeDerechoMm.toFixed(1)}): «${d.texto}»`);

        expect(
          afuera,
          `Hay texto que se sale de la hoja y NO SE VE en el papel impreso.\n`
          + `Un doc.text largo hay que partirlo con splitTextToSize (ver src/lib/asistencia/pdf-pie.ts).\n`
          + afuera.join("\n"),
        ).toEqual([]);
      });

      it("🔴 el pie no se sale por abajo ni se mete adentro de la tabla", () => {
        // El pie se reconoce por GEOMETRÍA, no por sus palabras: el «Página N»
        // marca el renglón de más abajo y desde ahí se sube de a un renglón
        // mientras siga habiendo texto. Así el candado no envejece cada vez que
        // alguien corrige la redacción de un aviso — y, sobre todo, un pie que
        // se desbordó hacia arriba se sigue contando como pie, que es justo lo
        // que hace que el choque con la tabla salte.
        const pagina = dibujos.find((d) => /^Página \d+$/.test(d.texto));
        expect(pagina, "el papel perdió el número de página").toBeDefined();
        expect(pagina!.yDesdeAbajoMm).toBeCloseTo(PIE_BASE_MM, 1);

        const enElRenglon = (y: number) =>
          dibujos.filter((d) => Math.abs(d.yDesdeAbajoMm - y) < 0.3);

        const pie: Dibujo[] = [];
        for (let k = 0; ; k++) {
          const renglon = enElRenglon(PIE_BASE_MM + k * PIE_ALTO_LINEA_MM);
          if (!renglon.length) break;
          pie.push(...renglon);
        }
        const tabla = dibujos.filter((d) => !pie.includes(d));
        expect(pie.length, "no se reconoció ninguna línea del pie").toBeGreaterThan(1);

        // Abajo: nada del pie queda por debajo del renglón del número de página.
        expect(Math.min(...pie.map((d) => d.yDesdeAbajoMm))).toBeCloseTo(PIE_BASE_MM, 1);

        // Arriba: entre el renglón más alto del pie y la fila más baja de la
        // tabla tiene que quedar, por lo menos, el alto de un renglón.
        const masAlta = Math.max(...pie.map((d) => d.yDesdeAbajoMm));
        const filaMasBaja = Math.min(...tabla.map((d) => d.yDesdeAbajoMm));
        expect(
          filaMasBaja,
          `El pie sube hasta ${masAlta.toFixed(1)} mm del borde de abajo y la tabla`
          + ` baja hasta ${filaMasBaja.toFixed(1)} mm: se pisan.`
          + ` Hay que reservarle más margen inferior a autoTable (ver reservaMm).`,
        ).toBeGreaterThan(masAlta + PIE_ALTO_LINEA_MM);

        // Y nada, del pie o de la tabla, puede quedar fuera de la hoja.
        for (const d of dibujos) {
          expect(d.yDesdeAbajoMm).toBeGreaterThan(0);
          expect(d.yDesdeAbajoMm).toBeLessThan(altoHoja);
        }
      });
    });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// El aviso completo tiene que ESTAR, no solo caber. Partirlo no puede volverse
// una excusa para recortarlo: lo que se perdía era justo lo que había que leer.

describe("🔴 partir el pie no le come palabras", () => {
  it("el Reporte conserva entero el aviso de los días corregidos", () => {
    const dibujos = dibujosDelPdf(
      construirPdf({ personas: MUCHA_GENTE, desde: DESDE, hasta: HASTA })
        .output("arraybuffer") as ArrayBuffer,
    );
    // Las líneas del pie, vueltas a pegar: `splitTextToSize` corta en espacios.
    const pie = dibujos.map((d) => d.texto).join(" ");
    expect(pie).toContain("días tienen una hora corregida a mano");
    expect(pie).toContain("el detalle está en el Excel");
    expect(pie).toContain("de trabajo fuera de la oficina");
    expect(pie).toContain("no se descuenta y no genera extras");
  });

  it("la Planilla conserva entero el último de sus seis avisos", () => {
    const dibujos = dibujosDelPdf(
      construirPdfPlanilla(planillaPeorCaso()).output("arraybuffer") as ArrayBuffer,
    );
    const pie = dibujos.map((d) => d.texto).join(" ");
    expect(pie).toContain("no se le están descontando a ninguna persona");
    expect(pie).toContain("En gris: no se le calcula pago");
  });
});
