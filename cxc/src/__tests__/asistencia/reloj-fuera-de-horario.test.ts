// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO — DE NOCHE Y EL FIN DE SEMANA, EL RELOJ APAGADO NO ES UNA AVERÍA
//    (25-sep-2026).
//
// 🩸 EL CASO: la pastilla de la fila de mandos decía «Los dos relojes sin
// responder · hace 16 h» en ámbar, todas las mañanas y todos los lunes. Daniel,
// textual: *«es normal que se apaguen de noche y fines de semana»*. La PC de la
// oficina, que es la que empuja las marcas de los dos relojes, se apaga al
// cerrar; a los 12 minutos de silencio la pantalla ya pinta ámbar.
//
// 🔴 LOS CUATRO CASOS QUE ESTE CANDADO SOSTIENE:
//   1. NOCHE, con la última lectura de hoy      → gris, «Reloj apagado · …».
//   2. FIN DE SEMANA, con la última del viernes → gris.
//   3. EN HORARIO HÁBIL y callado               → ÁMBAR, como siempre.
//   4. EN HORARIO HÁBIL y al día                → verde, como siempre.
//
// Y las dos que no se pueden aflojar:
//   · la última lectura MÁS VIEJA que el último día hábil avisa igual, sea la
//     hora que sea: eso ya no es «la tienda cerró»;
//   · «nunca instalado» y «no pudo leer el reloj» NO se callan nunca.
//
// 🔴 NINGÚN NÚMERO CAMBIA: acá solo se decide el color y las palabras de una
// línea. El umbral de «callado» sigue viviendo en `agente.ts`.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

import {
  ENTRADA_DE_SIEMPRE,
  HORARIO_POR_EMPRESA,
  SALIDA_DE_SIEMPRE,
  cuandoFueLaUltimaLectura,
  diaHabilAnterior,
  enHorarioHabil,
  enPanama,
  esApagadoPorHorario,
  minutosDeLaHora,
  textoRelojApagado,
  ventanaDelReloj,
} from "@/lib/asistencia/reloj-fuera-de-horario";
import { ENTRADA_DEFAULT, SALIDA_DEFAULT } from "@/lib/asistencia/reporte";
import { textoDeLaPastilla } from "@/lib/asistencia/relojes-en-la-fila";
import { DIAS_LABORABLES_DEFAULT } from "@/lib/asistencia/horario-configurable";

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

/** Un instante de Panamá, escrito como se lee. Panamá es UTC−5 todo el año. */
const pa = (s: string) => Date.parse(`${s}-05:00`);

const BOSTON = "reloj cboston";
const ACS = "reloj acs";

/** El reloj callado, con su última lectura donde se diga. */
const callado = (dispositivo: string, vistoEn: string) => ({
  dispositivo,
  salud: "callado" as const,
  vistoEn: new Date(pa(vistoEn)).toISOString(),
});

const alDia = (dispositivo: string, vistoEn: string) => ({
  dispositivo,
  salud: "al_dia" as const,
  vistoEn: new Date(pa(vistoEn)).toISOString(),
});

describe("la ventana de cada reloj", () => {
  it("🔑 las horas de siempre son ESPEJO de `reporte.ts` (mismo horario, un solo dato)", () => {
    expect(ENTRADA_DE_SIEMPRE).toBe(ENTRADA_DEFAULT);
    expect(SALIDA_DE_SIEMPRE).toBe(SALIDA_DEFAULT);
  });

  it("Multifashion trabaja de 10 a 18:30 y hasta el SÁBADO; las otras 8 a 17, lunes a viernes", () => {
    expect(HORARIO_POR_EMPRESA.american_classic).toEqual({ entrada: "10:00", salida: "18:30" });

    const acs = ventanaDelReloj(ACS);
    expect(acs.dias).toEqual([1, 2, 3, 4, 5, 6]);
    expect(acs.desde).toBe(minutosDeLaHora("10:00"));
    expect(acs.hasta).toBe(minutosDeLaHora("18:30"));

    const boston = ventanaDelReloj(BOSTON);
    expect(boston.dias).toEqual([...DIAS_LABORABLES_DEFAULT]);
    expect(boston.desde).toBe(minutosDeLaHora("08:00"));
    expect(boston.hasta).toBe(minutosDeLaHora("17:00"));
  });

  it("🔴 FALLA ABIERTA: un reloj desconocido usa lunes a viernes y las horas de siempre", () => {
    const v = ventanaDelReloj("reloj que nadie registró");
    expect(v.dias).toEqual([...DIAS_LABORABLES_DEFAULT]);
    expect(v.desde).toBe(minutosDeLaHora(ENTRADA_DE_SIEMPRE));
    expect(v.hasta).toBe(minutosDeLaHora(SALIDA_DE_SIEMPRE));
  });

  it("la hora se mide en PANAMÁ, no en UTC", () => {
    // 2026-09-24T23:00 de Panamá ya es el 25 en UTC: el día de negocio es el 24.
    expect(enPanama(pa("2026-09-24T23:00:00")).fecha).toBe("2026-09-24");
    expect(enPanama(pa("2026-09-24T23:00:00")).hhmm).toBe("23:00");
    // Jueves 24 de septiembre de 2026.
    expect(enPanama(pa("2026-09-24T09:00:00")).dia).toBe(4);
  });
});

describe("¿es horario hábil?", () => {
  it("un jueves a las 9 de la mañana, sí (Boston abre a las 8)", () => {
    expect(enHorarioHabil(BOSTON, pa("2026-09-24T09:00:00"))).toBe(true);
  });

  it("un jueves a las 9 de la mañana en Multifashion, NO: abre a las 10", () => {
    expect(enHorarioHabil(ACS, pa("2026-09-24T09:00:00"))).toBe(false);
    expect(enHorarioHabil(ACS, pa("2026-09-24T10:00:00"))).toBe(true);
    expect(enHorarioHabil(ACS, pa("2026-09-24T18:30:00"))).toBe(true);
    expect(enHorarioHabil(ACS, pa("2026-09-24T18:31:00"))).toBe(false);
  });

  it("de noche y el domingo, nunca", () => {
    expect(enHorarioHabil(BOSTON, pa("2026-09-24T21:00:00"))).toBe(false);
    // Domingo 27 de septiembre de 2026.
    expect(enHorarioHabil(BOSTON, pa("2026-09-27T11:00:00"))).toBe(false);
    expect(enHorarioHabil(ACS, pa("2026-09-27T11:00:00"))).toBe(false);
  });

  it("🔑 el SÁBADO es día de trabajo para Multifashion y no para las otras", () => {
    // Sábado 26 de septiembre de 2026, a las 11.
    expect(enHorarioHabil(ACS, pa("2026-09-26T11:00:00"))).toBe(true);
    expect(enHorarioHabil(BOSTON, pa("2026-09-26T11:00:00"))).toBe(false);
  });
});

describe("el último día hábil", () => {
  it("el de un lunes es el viernes (lunes a viernes) y el sábado en Multifashion", () => {
    expect(diaHabilAnterior("2026-09-28", DIAS_LABORABLES_DEFAULT)).toBe("2026-09-25");
    expect(diaHabilAnterior("2026-09-28", [1, 2, 3, 4, 5, 6])).toBe("2026-09-26");
  });

  it("el de un jueves es el miércoles", () => {
    expect(diaHabilAnterior("2026-09-24", DIAS_LABORABLES_DEFAULT)).toBe("2026-09-23");
  });
});

describe("🔴 los cuatro casos", () => {
  it("1 · DE NOCHE, con la última lectura de hoy → gris, sin ámbar", () => {
    const ahora = pa("2026-09-24T22:30:00"); // jueves, 10:30 de la noche
    const relojes = [callado(BOSTON, "2026-09-24T18:32:00"), callado(ACS, "2026-09-24T18:32:00")];
    expect(relojes.every((r) => esApagadoPorHorario(r, ahora))).toBe(true);
    expect(textoRelojApagado(relojes, ahora)).toBe("Relojes apagados · última lectura hoy 18:32");
  });

  it("1b · y a la mañana siguiente, antes de abrir, dice «ayer 18:32»", () => {
    const ahora = pa("2026-09-25T07:10:00"); // viernes, antes de las 8
    const relojes = [callado(BOSTON, "2026-09-24T18:32:00")];
    expect(textoRelojApagado(relojes, ahora)).toBe("Reloj apagado · última lectura ayer 18:32");
  });

  it("2 · FIN DE SEMANA, con la última del viernes → gris", () => {
    const ahora = pa("2026-09-27T11:00:00"); // domingo
    const relojes = [callado(BOSTON, "2026-09-25T18:00:00")];
    expect(esApagadoPorHorario(relojes[0], ahora)).toBe(true);
    expect(textoRelojApagado(relojes, ahora)).toContain("Reloj apagado · última lectura");
  });

  it("3 · EN HORARIO HÁBIL y callado → ÁMBAR: manda `textoDeLaPastilla`", () => {
    const ahora = pa("2026-09-24T11:00:00"); // jueves, media mañana
    const reloj = { ...callado(BOSTON, "2026-09-24T09:00:00"), minutosSinNoticias: 120 };
    expect(esApagadoPorHorario(reloj, ahora)).toBe(false);
    expect(textoRelojApagado([reloj], ahora)).toBeNull();
    expect(textoDeLaPastilla([reloj])).toBe("Reloj de Boston sin señal hace 2 horas");
  });

  it("4 · EN HORARIO HÁBIL y al día → verde, y nada de esto opina", () => {
    const ahora = pa("2026-09-24T11:00:00");
    const relojes = [
      { ...alDia(BOSTON, "2026-09-24T10:57:00"), minutosSinNoticias: 3 },
      { ...alDia(ACS, "2026-09-24T10:57:00"), minutosSinNoticias: 3 },
    ];
    expect(textoRelojApagado(relojes, ahora)).toBeNull();
    expect(textoDeLaPastilla(relojes)).toBe("Relojes al día · hace 3 minutos");
  });
});

describe("🔴 lo que NO se calla nunca", () => {
  it("una lectura más vieja que el último día hábil avisa, sea la hora que sea", () => {
    const ahora = pa("2026-09-24T22:30:00"); // jueves de noche
    // La última fue el lunes: el martes y el miércoles no entró nada.
    const reloj = callado(BOSTON, "2026-09-21T18:00:00");
    expect(esApagadoPorHorario(reloj, ahora)).toBe(false);
    expect(textoRelojApagado([reloj], ahora)).toBeNull();
  });

  it("«nunca instalado» y «no pudo leer el reloj» siguen avisando de noche", () => {
    const ahora = pa("2026-09-24T22:30:00");
    const nunca = { dispositivo: BOSTON, salud: "nunca" as const, minutosSinNoticias: null };
    const error = { ...callado(BOSTON, "2026-09-24T22:20:00"), salud: "con_error" as const };
    expect(esApagadoPorHorario(nunca, ahora)).toBe(false);
    expect(esApagadoPorHorario(error, ahora)).toBe(false);
    expect(textoRelojApagado([nunca], ahora)).toBeNull();
    expect(textoRelojApagado([error], ahora)).toBeNull();
  });

  it("sin saber cuándo fue la última lectura, NO se calla", () => {
    const ahora = pa("2026-09-24T22:30:00");
    const sinFecha = { dispositivo: BOSTON, salud: "callado" as const };
    expect(esApagadoPorHorario(sinFecha, ahora)).toBe(false);
  });

  it("🔴 con UNO apagado y OTRO caído de verdad, la pastilla sigue en ámbar", () => {
    const ahora = pa("2026-09-24T22:30:00");
    const apagado = callado(ACS, "2026-09-24T18:32:00");
    const caido = callado(BOSTON, "2026-09-20T18:00:00"); // hace días
    expect(textoRelojApagado([apagado, caido], ahora)).toBeNull();
  });

  it("con uno apagado y el otro al día, se nombra al que está apagado", () => {
    const ahora = pa("2026-09-24T22:30:00");
    const relojes = [alDia(BOSTON, "2026-09-24T22:28:00"), callado(ACS, "2026-09-24T18:32:00")];
    expect(textoRelojApagado(relojes, ahora))
      .toBe("Reloj de Multifashion apagado · última lectura hoy 18:32");
  });
});

describe("cuándo fue la última lectura, en palabras", () => {
  const ahora = pa("2026-09-24T22:30:00"); // jueves
  it("hoy · ayer · el día de la semana · la fecha", () => {
    expect(cuandoFueLaUltimaLectura(callado(BOSTON, "2026-09-24T18:32:00"), ahora)).toBe("hoy 18:32");
    expect(cuandoFueLaUltimaLectura(callado(BOSTON, "2026-09-23T18:32:00"), ahora)).toBe("ayer 18:32");
    expect(cuandoFueLaUltimaLectura(callado(BOSTON, "2026-09-21T18:32:00"), ahora)).toBe("el lunes 18:32");
    expect(cuandoFueLaUltimaLectura(callado(BOSTON, "2026-09-10T08:05:00"), ahora)).toBe("el 10 sep 08:05");
  });

  it("sin última lectura, no se inventa una", () => {
    expect(cuandoFueLaUltimaLectura({ dispositivo: BOSTON, salud: "callado" }, ahora)).toBeNull();
  });
});

describe("la pantalla", () => {
  it("🔴 la pastilla usa la regla, y «Traer ahora» no se toca", () => {
    const pantalla = leer("src/app/asistencia/EstadoReloj.tsx");
    expect(pantalla).toContain("textoRelojApagado");
    expect(pantalla).toContain("TRAER_AHORA");
    // El gris sale de la misma caja blanca de «al día», no de un color nuevo.
    expect(pantalla).toContain("apagado ? COLOR.al_dia : COLOR[peor.salud]");
    expect(pantalla).toContain('apagado ? "bg-gray-300"');
  });

  it("🔑 la hora del último contacto viaja desde la ruta, no se estima", () => {
    expect(leer("src/app/api/asistencia/reloj/route.ts")).toContain("vistoEn: f.visto_en ?? null");
  });

  it("🔴 ningún número se mueve: el módulo no mira minutos ni plata", () => {
    // Sin los comentarios: el encabezado SÍ nombra a `new Date()` y al umbral
    // para contar de qué NO se ocupa este archivo.
    const regla = leer("src/lib/asistencia/reloj-fuera-de-horario.ts")
      .split("\n")
      .filter((l) => {
        const t = l.trim();
        return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
      })
      .join("\n");
    // Es PURO: ni `new Date()` sin argumento, ni `Date.now()`.
    expect(regla).not.toContain("Date.now()");
    expect(regla).not.toMatch(/new Date\(\)/);
    // Y no toca el umbral de «callado», que sigue siendo del servidor.
    expect(regla).not.toContain("MINUTOS_PARA_CALLADO");
  });
});
