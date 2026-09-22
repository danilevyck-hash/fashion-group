/* ─────────────────────────────────────────────────────────────────────────────
 * CANDADO — EL COMPROBANTE DE PAGO SE LEE, Y NO SE LE MUEVE UN CENTAVO
 * (20-sep-2026).
 *
 * Medido sobre el archivo real bajado de producción el 20-sep-2026:
 * «Comprobantes de pago — Fashion Wear, 1–15 sep», OCHO hojas.
 *
 *   1. 🩸 DECÍA «EMPLEADO». Los otros cuatro papeles del módulo —Planilla,
 *      Reporte, Aprobaciones y Movimientos— dicen «Colaborador», que es la
 *      palabra que Daniel pidió para TODO el sistema. Éste era el único que
 *      seguía diciendo empleado, y es el que la persona firma.
 *
 *   2. 🩸 LE FALTABAN LOS ACENTOS: «RECIBI CONFORME», «CEDULA», «POSICION
 *      DESEMPEÑADA», «PRESTAMO», «DAÑO DE MERCANCIA». 🔑 No era la impresora
 *      ni la fuente: en ese MISMO papel «DESEMPEÑADA» ya llevaba ñ, y
 *      `asistencia-pdf-solo-latin1.test.ts` tiene medido carácter por carácter
 *      que jsPDF escribe bien las vocales acentuadas y la ñ.
 *
 *   3. 🩸 NINGUNA HOJA DECÍA DE CUÁL ERA. En una tanda de 34 que se imprime y
 *      se reparte, si una se cae al piso no hay forma de saberlo. Ahora lleva
 *      «Hoja N de M» al pie, como el PDF del CXC y el de Comisiones.
 *
 * 🔴 Y LO QUE NO PUEDE CAMBIAR: NI UN NÚMERO. Este papel lleva plata que se
 * paga. El primer bloque de abajo es la tanda REAL de Fashion Wear 1–15 sep
 * tal como salió impresa —los 8 colaboradores, sus 21 montos cada uno, en
 * orden— y se compara contra el PDF que genera el código de hoy. Si un rótulo
 * o un pie mueve un monto, esto se pone rojo antes que nadie firme nada.
 * ─────────────────────────────────────────────────────────────────────────── */

import { describe, expect, it } from "vitest";
import {
  CLAVES_RENGLON,
  armarComprobante,
  type Comprobante,
} from "@/lib/asistencia/comprobante";
import { construirPdfComprobantes } from "@/lib/asistencia/comprobante-pdf";
import type { AjusteDetalle } from "@/lib/asistencia/corte-quincena";
import type { DineroLinea, HorasPersona, LineaPlanilla } from "@/lib/asistencia/planilla";

// ── La tanda real: Fashion Wear, I quincena de septiembre de 2026 ────────────

const HORAS_CERO = {
  extraDiurnoMin: 0, extraNocturnoMin: 0, extraNoAprobadaMin: 0,
  extraNoAprobadaDiurnoMin: 0, extraNoAprobadaNocturnoMin: 0,
  excedenteMin: 0, domingoMin: 0, feriadoMin: 0,
  tardanzaMin: 0, tardanzaGraveMin: 0, tardanzaGraveDias: 0,
  ausenciaMin: 0, ausenciaDias: 0, ausenciaJustificadaDias: 0,
  vacacionesYaPagadasMin: 0, vacacionesYaPagadasDias: 0, vacacionesDias: 0,
  sabadoMin: 0, diasTrabajados: 0, diasARevisar: 0,
  tardanzaDeDiasARevisarMin: 0, jornadaDiariaMin: 480,
} as unknown as HorasPersona;

/** El ajuste de los días 29–31 ago que la quincena anterior pagó sin medir. */
const AJUSTE: AjusteDetalle = {
  desde: "2026-08-29",
  hasta: "2026-08-31",
  reparto: { extraDiurno: 1, extraNocturno: 1 },
};

interface Persona {
  nombre: string;
  posicion: string | null;
  cedula: string;
  rata: number;
  salario: number;
  extra125: number;
  extra150: number;
  salidaTemprana: number;
  bruto: number;
  conAjuste: boolean;
}

/**
 * 🔴 LOS OCHO, TAL COMO SALIERON IMPRESOS. Nada de esto se calcula acá: son
 * los números que la contadora ya entregó firmados.
 */
const TANDA: readonly Persona[] = [
  { nombre: "CARLOS BALTODANO", posicion: "Asistente de Bodega", cedula: "C02611278", rata: 3.02, salario: 261.74, extra125: 12.36, extra150: 2.04, salidaTemprana: 0, bruto: 276.14, conAjuste: true },
  { nombre: "ELOYN MENDOZA", posicion: "Asistente de Bodega", cedula: "8-1022-869", rata: 3.27, salario: 283.26, extra125: 3.65, extra150: 0, salidaTemprana: 8.81, bruto: 278.10, conAjuste: false },
  { nombre: "ESMER CRUZ", posicion: "Asistente de Bodega", cedula: "", rata: 3.02, salario: 261.74, extra125: 9.93, extra150: 2.06, salidaTemprana: 3.20, bruto: 270.53, conAjuste: true },
  { nombre: "JHONNY FLORES", posicion: "Asistente de Bodega", cedula: "C04104675", rata: 3.02, salario: 261.74, extra125: 9.67, extra150: 2.02, salidaTemprana: 0, bruto: 273.43, conAjuste: true },
  { nombre: "JULIO GUZMÁN", posicion: "Supervisor de Bodega", cedula: "E-8-221563", rata: 5.77, salario: 100.00, extra125: 64.55, extra150: 6.44, salidaTemprana: 0, bruto: 170.99, conAjuste: true },
  // Kevin Lubo no tiene cargo cargado: el papel escribe un guion, no lo inventa.
  { nombre: "KEVIN LUBO", posicion: null, cedula: "", rata: 3.02, salario: 261.74, extra125: 23.56, extra150: 3.18, salidaTemprana: 0, bruto: 288.48, conAjuste: true },
  { nombre: "LUIS PARAJON", posicion: "Asistente de Bodega", cedula: "P", rata: 3.02, salario: 261.74, extra125: 11.46, extra150: 2.06, salidaTemprana: 0, bruto: 275.26, conAjuste: true },
  { nombre: "SAMUEL ANTONIO GOMEZ ADAMES", posicion: "Asistente de Bodega", cedula: "3", rata: 3.02, salario: 261.74, extra125: 9.72, extra150: 2.04, salidaTemprana: 0, bruto: 273.50, conAjuste: true },
];

const PERIODO = {
  esQuincena: true, anio: 2026, mes: 9, n: 1 as const,
  etiqueta: "1 al 15 de septiembre de 2026",
};

function comprobanteDe(p: Persona): Comprobante {
  const dinero = {
    rataHora: p.rata, valorMinuto: p.rata / 60, salarioQuincenal: p.salario,
    extraDiurno: p.extra125, extraNocturno: p.extra150, excedente: 0,
    domingos: 0, feriados: 0, ausencias: 0,
    ausenciaPorTardanza: 0, ausenciaDeDiaCompleto: 0, vacacionesYaPagadas: 0,
    tardanzas: 0, salidaTemprana: p.salidaTemprana,
    totalBruto: p.bruto, baseSeguros: null,
    seguroSocial: 0, seguroEducativo: 0, isr: 0,
    prestamo: 0, terceros: 0, mercancia: 0,
    totalDeducciones: 0, otrosServicios: 0, netoPagar: p.bruto,
  } as unknown as DineroLinea;

  const linea = {
    codigo: p.nombre.slice(0, 4), etiqueta: p.nombre, nombre: p.nombre,
    empresa: "fashion_wear", empresaEtiqueta: "Fashion Wear",
    salarioMensual: p.salario * 2, jornadaSemanal: 48,
    horas: HORAS_CERO, faltaConfigurar: [], fueraDePlanilla: false,
    pagaSeguros: false, baseSeguros: null, noMarcaReloj: false,
    parte: null, decidirAMano: null, quincenalReferencia: null,
    extraMedido: null, extraNoAprobada: null, extraAprobada: true,
    dinero,
    manuales: { isr: 0, prestamo: 0, terceros: 0, mercancia: 0, otrosServicios: 0 },
    ...(p.conAjuste ? { ajusteDetalle: AJUSTE } : {}),
  } as unknown as LineaPlanilla;

  return armarComprobante({ linea, posicion: p.posicion, cedula: p.cedula }, PERIODO);
}

const COMPROBANTES = TANDA.map(comprobanteDe);

// ── Lo que el PDF de verdad dibuja, hoja por hoja ───────────────────────────

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

/** Cada hoja, con cada string que dibuja, en el orden en que se dibujó. */
function hojasDelPdf(): string[][] {
  const doc = construirPdfComprobantes(COMPROBANTES);
  const raw = Buffer.from(doc.output("arraybuffer")).toString("latin1");
  const hojas: string[][] = [];
  for (const stream of raw.matchAll(/stream\n([\s\S]*?)\nendstream/g)) {
    const cuerpo = stream[1];
    if (!cuerpo.includes("BT")) continue;
    const textos: string[] = [];
    for (const t of cuerpo.matchAll(/\(((?:\\.|[^\\()])*)\)\s*Tj/g)) textos.push(desescapar(t[1]));
    hojas.push(textos);
  }
  return hojas;
}

const HOJAS = hojasDelPdf();
const TODO = HOJAS.flat();

/** Los montos que una hoja dibuja, en orden. */
const montosDe = (hoja: readonly string[]) => hoja.filter((t) => /^-?[\d,]+\.\d\d$/.test(t));

// ─────────────────────────────────────────────────────────────────────────────
describe("A. 🔴 NI UN CENTAVO SE MUEVE — la tanda real de Fashion Wear, 1–15 sep", () => {
  it("son ocho hojas, una por colaborador, en el orden impreso", () => {
    expect(HOJAS).toHaveLength(8);
    HOJAS.forEach((hoja, i) => {
      const nombre = TANDA[i].nombre;
      const capitalizado = COMPROBANTES[i].empleado;
      expect(hoja).toContain(capitalizado);
      expect(capitalizado.toUpperCase()).toBe(nombre);
    });
  });

  it("cada hoja dibuja los MISMOS 22 montos que salieron impresos (rata + los 21 renglones)", () => {
    // 🔴 Medido del PDF de producción del 20-sep-2026, hoja por hoja.
    const ESPERADO: readonly (readonly string[])[] = TANDA.map((p) => [
      p.rata.toFixed(2),
      p.salario.toFixed(2),
      p.extra125.toFixed(2),
      p.extra150.toFixed(2),
      "0.00", // EXCEDENTE DE HORAS EXTRAS SEMANAL
      "0.00", // DOMINGO
      "0.00", // FERIADO
      "0.00", // AUSENCIA
      "0.00", // TARDANZAS
      p.salidaTemprana.toFixed(2),
      p.bruto.toFixed(2), // TOTAL DEVENGADO
      "0.00", // SEGURO SOCIAL
      "0.00", // SEGURO EDUCATIVO
      "0.00", // IMPUESTO SOBRE LA RENTA
      "0.00", // TOTAL DE DEDUCCIONES
      "0.00", // PRÉSTAMO
      "0.00", // DESCUENTO A TERCEROS
      "0.00", // DAÑO DE MERCANCÍA
      "0.00", // TOTAL DE DESCUENTOS
      "0.00", // OTROS SERVICIOS
      p.bruto.toFixed(2), // SALARIO A PAGAR
    ]);
    HOJAS.forEach((hoja, i) => {
      expect(montosDe(hoja)).toEqual([...ESPERADO[i]]);
    });
  });

  it("el neto de las ocho suma lo mismo que la planilla: $2.106,43", () => {
    const suma = TANDA.reduce((s, p) => s + p.bruto, 0);
    expect(Number(suma.toFixed(2))).toBe(2106.43);
    const netos = HOJAS.map((h) => Number(montosDe(h).at(-1)!.replace(/,/g, "")));
    expect(Number(netos.reduce((s, n) => s + n, 0).toFixed(2))).toBe(2106.43);
  });

  it("los 22 renglones siguen ahí, en su orden, con los rótulos del módulo", () => {
    for (const c of COMPROBANTES) {
      expect(c.renglones.map((r) => r.clave)).toEqual([...CLAVES_RENGLON]);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("B. «COLABORADOR», NO «EMPLEADO»", () => {
  it("la ficha del papel dice COLABORADOR", () => {
    expect(TODO).toContain("COLABORADOR");
  });

  it("la palabra «EMPLEADO» no se dibuja en ninguna hoja", () => {
    expect(TODO.filter((t) => /\bEMPLEADO\b/i.test(t))).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("C. 🔴 NINGÚN TEXTO SIN SU ACENTO", () => {
  /**
   * Lo que estaba escrito sin tilde en el papel de producción, con lo que
   * tiene que decir. El candado exige las DOS cosas: que la forma coja no
   * aparezca, y que la correcta sí.
   */
  const ACENTOS: readonly (readonly [string, string])[] = [
    ["RECIBI CONFORME", "RECIBÍ CONFORME"],
    ["CEDULA", "CÉDULA"],
    ["POSICION DESEMPEÑADA", "POSICIÓN DESEMPEÑADA"],
    ["PRESTAMO", "PRÉSTAMO"],
    ["DAÑO DE MERCANCIA", "DAÑO DE MERCANCÍA"],
  ];

  for (const [coja, buena] of ACENTOS) {
    it(`«${coja}» ya no se dibuja; dice «${buena}»`, () => {
      expect(TODO).not.toContain(coja);
      expect(TODO).toContain(buena);
    });
  }

  /**
   * 🔴 EL BARRIDO. No es una lista de cinco: toda palabra en mayúsculas que el
   * papel dibuje tiene que estar en este vocabulario. Un rótulo nuevo escrito
   * sin tilde no pasa, aunque nadie se acuerde de agregarlo a la lista de
   * arriba — para que pase hay que escribirlo acá, y ahí se ve el acento.
   *
   * ⚠️ Los datos de la persona (nombre, cargo, cédula) no entran: van en
   * minúscula o con dígitos, y son lo que la ficha tenga guardado.
   */
  const VOCABULARIO = new Set([
    // La cabeza
    "FASHION", "WEAR", "PLANILLA", "QUINCENAL", "COMPROBANTE", "DE", "PAGO",
    "QUINCENA", "SEPTIEMBRE", "DEL", "AL",
    // La ficha
    "COLABORADOR", "POSICIÓN", "DESEMPEÑADA", "RATA", "POR", "HORA",
    // Los renglones
    "SALARIO", "HORAS", "EXTRAS", "EXCEDENTE", "SEMANAL", "DOMINGO", "FERIADO",
    "AUSENCIA", "TARDANZAS", "SALIDA", "TEMPRANA", "TOTAL", "DEVENGADO",
    "DEDUCCIONES", "SEGURO", "SOCIAL", "EDUCATIVO", "IMPUESTO", "SOBRE", "LA",
    "RENTA", "DESCUENTOS", "PRÉSTAMO", "DESCUENTO", "A", "TERCEROS", "DAÑO",
    "MERCANCÍA", "OTROS", "SERVICIOS", "PAGAR",
    // El pie
    "RECIBÍ", "CONFORME", "CÉDULA", "FECHA",
  ]);

  it("toda palabra en mayúsculas del papel está en el vocabulario aprobado", () => {
    const sueltas = new Set<string>();
    for (const t of TODO) {
      for (const w of t.split(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+/)) {
        if (w.length < 2) continue;
        if (w !== w.toUpperCase()) continue; // los datos van capitalizados
        if (!VOCABULARIO.has(w)) sueltas.add(w);
      }
    }
    expect([...sueltas].sort()).toEqual([]);
  });

  it("y ninguna de esas palabras perdió su tilde por el camino", () => {
    const sinTilde = (s: string) => s.normalize("NFD").replace(/[̀-́̃̈]/g, "");
    const conTilde = [...VOCABULARIO].filter((w) => sinTilde(w) !== w);
    // Las cinco con tilde o ñ del papel: POSICIÓN · PRÉSTAMO · MERCANCÍA ·
    // RECIBÍ · CÉDULA · DESEMPEÑADA · DAÑO.
    expect(conTilde.sort()).toEqual([
      "CÉDULA", "DAÑO", "DESEMPEÑADA", "MERCANCÍA", "POSICIÓN", "PRÉSTAMO", "RECIBÍ",
    ]);
    for (const w of conTilde) expect(TODO.some((t) => t.includes(w))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("D. CADA HOJA DICE DE CUÁL ES", () => {
  it("las ocho llevan «Hoja N de 8» al pie", () => {
    HOJAS.forEach((hoja, i) => {
      expect(hoja).toContain(`Hoja ${i + 1} de 8`);
    });
  });

  it("una sola hoja dice «Hoja 1 de 1» — no se numera de más", () => {
    const doc = construirPdfComprobantes([COMPROBANTES[0]]);
    const raw = Buffer.from(doc.output("arraybuffer")).toString("latin1");
    expect(raw).toContain("Hoja 1 de 1");
  });

  it("el pie de la casa sigue en su lugar, en todas", () => {
    for (const hoja of HOJAS) expect(hoja).toContain("Confidencial · fashiongr.com");
  });
});
