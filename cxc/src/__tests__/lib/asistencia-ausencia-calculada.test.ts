// ─────────────────────────────────────────────────────────────────────────────
// «AUSENCIA» CALCULADA — el candado
//
// Daniel, 25-ago-2026, sobre la columna «Ausencia» que la contadora venía
// cargando A MANO:
//
//     de 1 minuto a 30  → Tardanza
//     más de 30 minutos → Ausencia
//
// 🔴 Y ELIGIÓ, ENTRE DOS OPCIONES, QUE NO CAMBIE EL DINERO: *"Los 45 minutos,
// igual que una tardanza. La columna «Ausencia» es solo para que lo veas."*
//
// LO QUE SE PRUEBA ACÁ, Y NINGUNA DE LAS TRES SE PUEDE PROBAR SOLA:
//   1. EL BRUTO Y EL NETO NO SE MUEVEN NI UN CENTAVO. Es la condición de este
//      PR entero: si mueve un centavo, está mal implementado.
//   2. LA SUMA DE LAS DOS COLUMNAS ES LA MISMA. No alcanza con que el neto dé
//      igual: `centavos(a) + centavos(b)` no es `centavos(a + b)`, y dos
//      columnas redondeadas por su lado se separarían un centavo del total.
//   3. EL UMBRAL SE MIDE POR DÍA, no sobre el total de la quincena. Tres días
//      de 15 minutos son tres tardanzas, no una ausencia de 45.
//
// ⚠️ Y una cuarta que es la que protege lo que ya existía: LA AUSENCIA DE DÍA
// COMPLETO NO SE TOCÓ. Quien no marcó ni una vez sigue costando
// `jornada × rata` y se sigue descontando solo, como hasta hoy.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  armarLinea,
  centavos,
  HORAS_CERO,
  MANUALES_CERO,
  medirHoras,
  minutosTardanzaMostrados,
  textoAusencias,
  textoTardanzas,
  type FichaPlanilla,
  type HorasPersona,
} from "@/lib/asistencia/planilla";
import { MINUTOS_TARDE_QUE_SON_AUSENCIA, REGLAS_DEFAULT } from "@/lib/asistencia/config";
import { armarReporte, type Marcacion } from "@/lib/asistencia/reporte";

// ── Ayudantes ────────────────────────────────────────────────────────────────

/** CARLOS NOE RUIZ (44, Boston): ficha real, 40 h, rata $3,02. */
const ficha = (over: Partial<FichaPlanilla> = {}): FichaPlanilla => ({
  codigo: "44",
  nombre: "CARLOS NOE RUIZ",
  salarioMensual: 523.47,
  jornadaSemanal: 40,
  empresa: "confecciones_boston",
  ...over,
});

const linea = (h: HorasPersona) => armarLinea(ficha(), h, MANUALES_CERO, REGLAS_DEFAULT);

/**
 * El MISMO total de minutos tarde, repartido de dos formas. Es la comparación
 * que importa: el motor viejo veía un solo número (`tardanzaMin`) y el nuevo
 * ve además cuánto de él es "grave".
 */
const horas = (tardanzaMin: number, tardanzaGraveMin: number, tardanzaGraveDias: number,
  extra: Partial<HorasPersona> = {}): HorasPersona => ({
  ...HORAS_CERO, jornadaDiariaMin: 480,
  tardanzaMin, tardanzaGraveMin, tardanzaGraveDias, ...extra,
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 EL DINERO NO SE MUEVE — es la condición de este cambio", () => {
  it("el bruto, el neto y las deducciones son IDÉNTICOS con y sin el reparto", () => {
    // Mismo total de minutos tarde (45), y todo lo demás igual. La única
    // diferencia es que en el segundo caso esos 45 son de un día "grave".
    const comoAyer = linea(horas(45, 0, 0)).dinero!;
    const conReparto = linea(horas(45, 45, 1)).dinero!;

    for (const campo of [
      "rataHora", "valorMinuto", "salarioQuincenal", "extraDiurno", "extraNocturno",
      "excedente", "domingos", "feriados", "totalBruto", "seguroSocial",
      "seguroEducativo", "isr", "prestamo", "terceros", "mercancia",
      "totalDeducciones", "otrosServicios", "netoPagar",
    ] as const) {
      expect(conReparto[campo], `la columna ${campo} se movió`).toBe(comoAyer[campo]);
    }
  });

  it("🔴 la SUMA de las dos columnas es la misma, no solo el neto", () => {
    // 🩸 ESTE ES EL TEST QUE ATRAPA EL ERROR DE REDONDEO. `centavos(a) +
    // centavos(b)` NO es `centavos(a + b)`: calcular cada columna por su lado
    // separaría un centavo del total, y el bruto dejaría de cuadrar con la
    // resta que la contable hace con los ojos.
    // 🩸 `[45, 31]` NO ES UN CASO INVENTADO: con la rata $3,02 —la de siete
    // personas de Boston— calcular «Tardanzas» como `(total − grave) × valor
    // del minuto` da $0,70 donde el resto da $0,71. Un centavo. El bruto
    // dejaría de cuadrar con la resta que la contable hace con los ojos, y ése
    // es exactamente el motivo por el que la columna se calcula RESTANDO en vez
    // de calcularse sola. Se buscó el caso a propósito, barriendo las ratas
    // reales; hay decenas de miles.
    for (const [total, grave] of [
      [45, 31], [75, 31], [45, 45], [61.25, 61.25], [100, 61.25], [302.87, 302.87], [7.19, 0],
    ]) {
      const ayer = linea(horas(total, 0, 0)).dinero!;
      const hoy = linea(horas(total, grave, grave > 0 ? 1 : 0)).dinero!;
      expect(hoy.ausencias + hoy.tardanzas, `total ${total} / grave ${grave}`)
        .toBeCloseTo(ayer.ausencias + ayer.tardanzas, 10);
      expect(hoy.totalBruto).toBe(ayer.totalBruto);
    }
  });

  it("los minutos graves aparecen en «Ausencias» y salen de «Tardanzas»", () => {
    const d = linea(horas(60, 60, 1)).dinero!;
    expect(d.tardanzas).toBe(0);
    expect(d.ausencias).toBeGreaterThan(0);
    expect(d.ausenciaPorTardanza).toBe(d.ausencias);
    expect(d.ausenciaDeDiaCompleto).toBe(0);
  });

  it("una quincena mixta reparte las dos partes y las dos se pueden explicar", () => {
    // 8 horas de ausencia de día completo + 61,25 minutos de un día muy tarde.
    const d = linea(horas(70, 61.25, 1, { ausenciaMin: 480, ausenciaDias: 1 })).dinero!;
    expect(d.ausenciaDeDiaCompleto).toBe(centavos(8 * d.rataHora));
    expect(d.ausenciaPorTardanza).toBe(centavos(61.25 * d.valorMinuto));
    expect(d.ausencias).toBe(centavos(d.ausenciaDeDiaCompleto + d.ausenciaPorTardanza));
    // Y la tardanza que queda es SOLO la parte leve.
    expect(d.tardanzas).toBe(centavos(centavos(70 * d.valorMinuto) - d.ausenciaPorTardanza));
  });

  it("⚠️ LA AUSENCIA DE DÍA COMPLETO NO SE TOCÓ", () => {
    // Quien no marcó ni una vez sigue costando `jornada × rata`, sin pasar por
    // nada de lo nuevo. Es el comportamiento que Daniel dijo que no se toca:
    // *"el que no marca se le descuenta solo"*.
    const d = linea(horas(0, 0, 0, { ausenciaMin: 480, ausenciaDias: 1 })).dinero!;
    expect(d.ausencias).toBe(centavos(8 * d.rataHora));
    expect(d.ausenciaPorTardanza).toBe(0);
    expect(d.tardanzas).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 EL UMBRAL SE MIDE POR DÍA, no sobre el total de la quincena", () => {
  /** Un día con la entrada a la hora `hhmm`. Horario 8:00–16:30, almuerzo 30. */
  const dia = (fecha: string, hhmm: string): Marcacion[] => [
    { empleado_codigo: "44", empleado_nombre: null, ocurrio_en: `${fecha}T${hhmm}:00-05:00` },
    { empleado_codigo: "44", empleado_nombre: null, ocurrio_en: `${fecha}T12:00:00-05:00` },
    { empleado_codigo: "44", empleado_nombre: null, ocurrio_en: `${fecha}T12:30:00-05:00` },
    { empleado_codigo: "44", empleado_nombre: null, ocurrio_en: `${fecha}T16:30:00-05:00` },
  ];

  const medir = (marcaciones: Marcacion[]) => {
    const [p] = armarReporte({
      marcaciones,
      horarios: [{ empleado_codigo: "44", entrada: "08:00", salida: "16:30", almuerzo_minutos: 30 }],
      justificaciones: [], feriados: new Map(),
      desde: "2026-07-01", hasta: "2026-07-03",
      reglas: REGLAS_DEFAULT, nombres: new Map([["44", "CARLOS NOE RUIZ"]]),
      incluirNoHabiles: true,
    });
    return medirHoras(p, REGLAS_DEFAULT, 480);
  };

  it("🩸 tres días de 15 minutos son TRES TARDANZAS, no una ausencia de 45", () => {
    // Con tolerancia 10, entrar 8:25 son 25 minutos de tardanza: por debajo del
    // umbral. Sumar la quincena y comparar contra 30 convertiría a cualquiera
    // que llega un poco tarde todos los días en un ausente.
    const h = medir([...dia("2026-07-01", "08:25"), ...dia("2026-07-02", "08:25"), ...dia("2026-07-03", "08:25")]);
    expect(h.tardanzaMin).toBeGreaterThan(MINUTOS_TARDE_QUE_SON_AUSENCIA);
    expect(h.tardanzaGraveMin).toBe(0);
    expect(h.tardanzaGraveDias).toBe(0);
  });

  it("un solo día de más de 30 minutos SÍ es ausencia, y arrastra ese día entero", () => {
    const h = medir([...dia("2026-07-01", "08:25"), ...dia("2026-07-02", "08:45")]);
    expect(h.tardanzaGraveDias).toBe(1);
    // 🔑 El día grave aporta TODOS sus minutos, no solo los que pasan de 30:
    // es el día el que cambia de nombre, no una porción de él.
    expect(h.tardanzaGraveMin).toBeCloseTo(45, 6);
    expect(h.tardanzaMin).toBeCloseTo(25 + 45, 6);
  });

  it("justo 30 minutos sigue siendo TARDANZA — el borde es estricto", () => {
    // Daniel: «de 1 minuto a 30 → Tardanza». 30 está adentro de la tardanza.
    const h = medir(dia("2026-07-01", "08:30"));
    expect(h.tardanzaMin).toBeCloseTo(30, 6);
    expect(h.tardanzaGraveMin).toBe(0);
  });

  it("un minuto más ya es ausencia", () => {
    const h = medir(dia("2026-07-01", "08:31"));
    expect(h.tardanzaMin).toBeCloseTo(31, 6);
    expect(h.tardanzaGraveMin).toBeCloseTo(31, 6);
    expect(h.tardanzaGraveDias).toBe(1);
  });

  it("🩸 los días SIN MARCAS no cuentan como tardanza grave — se cobrarían dos veces", () => {
    // La persona vino puntual un día y no marcó los otros dos. Esos dos días
    // ya se cobran como ausencia de día completo (`ausenciaMin`); contarlos
    // también acá los cobraría DOS VECES sobre la misma persona.
    const h = medir(dia("2026-07-01", "08:00"));
    expect(h.ausenciaDias).toBeGreaterThan(0);
    expect(h.ausenciaMin).toBeGreaterThan(0);
    expect(h.tardanzaGraveMin).toBe(0);
    expect(h.tardanzaGraveDias).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("las etiquetas: los minutos tienen que cuadrar con los dólares", () => {
  it("«Tardanzas» muestra los minutos que de verdad valúa, NO el total", () => {
    // 🩸 Poner `tardanzaMin` en la etiqueta mientras el monto de al lado ya no
    // lo incluye es la contradicción más fácil de cometer y la más difícil de
    // ver: los minutos no cuadrarían con los dólares.
    const h = horas(70, 45, 1);
    expect(minutosTardanzaMostrados(h)).toBe(25);
    expect(textoTardanzas(h)).toBe("25 min");
  });

  it("«Ausencias» dice de dónde sale el monto cuando hay días de más de 30 min", () => {
    expect(textoAusencias(horas(70, 45, 1, { ausenciaDias: 1, ausenciaMin: 480 })))
      .toBe(`1 días · 8 h · 1 día(s) de más de ${MINUTOS_TARDE_QUE_SON_AUSENCIA} min tarde`);
    // Sin días graves, la etiqueta es la de siempre: no se agrega ruido.
    expect(textoAusencias(horas(20, 0, 0, { ausenciaDias: 1, ausenciaMin: 480 })))
      .toBe("1 días · 8 h");
  });

  it("nunca da minutos negativos, pase lo que pase con los datos", () => {
    expect(minutosTardanzaMostrados(horas(10, 45, 1))).toBe(0);
  });
});
