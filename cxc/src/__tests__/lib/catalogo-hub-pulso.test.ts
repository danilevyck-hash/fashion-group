// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CADA TARJETA DEL HUB DICE SU PULSO (22-sep-2026)
//
// 🩸 QUÉ PASABA. La tarjeta solo contaba productos. **Joybees llevaba 29 días
// sin un comprobante y nada en la pantalla lo decía.** Medido contra producción
// el 22-sep-2026, con los comprobantes VIVOS:
//
//     Tommy    44 · $326.686,00 · hace  3 días   (último 19-sep)
//     Reebok   14 ·  $79.968,00 · hace 13 días   (último  9-sep)
//     Calvin    6 ·  $17.658,00 · hace  8 días   (último 14-sep)
//     Joybees   4 ·   $4.020,00 · hace 29 días   (último 24-ago)
//
// 🔴 LA VENTANA ES LA DE LA LISTA DE COMPROBANTES: 90 DÍAS, importados de
// `comprobantes-ventana.ts`. Medido: hoy los 90 días dan lo MISMO que toda la
// historia (el vivo más viejo es del 4-jul-2026, 80 días). «Este mes» se
// descartó midiendo — dejaba a Joybees en CERO, justo la marca cuyo silencio
// hay que ver, y a Calvin en 4 de 6.
//
// 🔴 LO QUE ESTE CANDADO PROTEGE:
//   1. La ventana es UNA, importada, nunca un 90 escrito otra vez.
//   2. El «hoy» llega por parámetro: el módulo es PURO y no pregunta la hora.
//      El de verdad es el de Panamá y lo pone la ruta.
//   3. Una marca sin comprobantes NO escribe «$0.00».
//   4. El «último» no lleva ventana.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  DIAS_PULSO,
  diasEntre,
  resumirPulso,
  textoPulso,
  type FilaDeComprobante,
} from "@/lib/catalogo/pulso-pedidos";
import { DIAS_VENTANA_COMPROBANTES } from "@/lib/catalogo/comprobantes-ventana";

const RAIZ = path.resolve(__dirname, "..", "..", "..");
const leer = (p: string) => readFileSync(path.join(RAIZ, p), "utf8");
const FUENTE_PULSO = leer("src/lib/catalogo/pulso-pedidos.ts");

/** Un comprobante creado a las 10 de la mañana de Panamá de ese día. */
const c = (dia: string, total: number): FilaDeComprobante => ({
  created_at: `${dia}T15:00:00.000Z`,
  total,
});

const HOY = "2026-09-22"; // el día en que se midió todo lo de arriba

describe("la ventana es la de la lista, no un número nuevo", () => {
  it("`DIAS_PULSO` ES `DIAS_VENTANA_COMPROBANTES`", () => {
    // 🔴 MUTACIÓN QUE SE CAZA: escribir `export const DIAS_PULSO = 90`. El día
    // que la lista cambie su horizonte, la tarjeta tiene que cambiar con ella.
    expect(DIAS_PULSO).toBe(DIAS_VENTANA_COMPROBANTES);
    expect(FUENTE_PULSO).toContain("DIAS_PULSO = DIAS_VENTANA_COMPROBANTES");
    expect(FUENTE_PULSO).not.toMatch(/DIAS_PULSO\s*=\s*\d/);
  });
});

describe("el módulo es PURO: el «hoy» entra por parámetro", () => {
  it("no hay un solo `new Date()` sin argumentos adentro", () => {
    // 🔴 MUTACIÓN QUE SE CAZA: preguntar la hora acá. Sería la hora del
    // SERVIDOR (Vercel corre en UTC) o la del NAVEGADOR, y entre las 19:00 y la
    // medianoche de Panamá el día ya es otro allá.
    const codigo = FUENTE_PULSO.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    expect(codigo).not.toContain("new Date()");
    expect(codigo).not.toContain("hoyPanama(");
    expect(codigo).not.toContain("Date.now(");
  });

  it("dos «hoy» distintos dan dos respuestas distintas", () => {
    const filas = [c("2026-08-24", 4020)];
    expect(resumirPulso(filas, "2026-09-22").diasDesdeElUltimo).toBe(29);
    expect(resumirPulso(filas, "2026-09-23").diasDesdeElUltimo).toBe(30);
  });
});

describe("los cuatro números medidos en producción se reproducen", () => {
  it("Joybees: 4 comprobantes, $4.020, último hace 29 días", () => {
    const p = resumirPulso(
      [c("2026-07-08", 1000), c("2026-07-20", 756), c("2026-08-10", 1000), c("2026-08-24", 1264)],
      HOY,
    );
    expect(p).toEqual({ comprobantes: 4, monto: 4020, diasDesdeElUltimo: 29 });
    expect(textoPulso(p)).toBe("4 comprobantes · $4,020.00 · último hace 29 días");
  });

  it("Reebok: el borrador cuenta igual — son COMPROBANTES, no solo pedidos", () => {
    // Medido: 13 confirmados + 1 borrador = 14, $77.448 + $2.520 = $79.968.
    const filas = [...Array(13)].map(() => c("2026-09-09", 77448 / 13));
    filas.push(c("2026-07-21", 2520));
    const p = resumirPulso(filas, HOY);
    expect(p.comprobantes).toBe(14);
    expect(Math.round(p.monto)).toBe(79968);
    expect(p.diasDesdeElUltimo).toBe(13);
  });
});

describe("el «último» NO lleva ventana", () => {
  it("una marca dormida hace medio año sigue diciendo cuánto hace", () => {
    // 🔴 MUTACIÓN QUE SE CAZA: mirar solo las filas de la ventana para sacar el
    // último. Sería perder justo el número que más dice.
    const p = resumirPulso([c("2026-02-10", 500)], HOY);
    expect(p.comprobantes).toBe(0);
    expect(p.diasDesdeElUltimo).toBe(224);
    expect(textoPulso(p)).toBe("Sin comprobantes en 90 días");
  });

  it("el corte de la ventana es inclusivo al día número 90", () => {
    expect(resumirPulso([c("2026-06-24", 10)], HOY).comprobantes).toBe(1); // 90 días
    expect(resumirPulso([c("2026-06-23", 10)], HOY).comprobantes).toBe(0); // 91
  });
});

describe("nunca «$0.00» en grande", () => {
  it("sin comprobantes se dice con palabras", () => {
    expect(textoPulso({ comprobantes: 0, monto: 0, diasDesdeElUltimo: 200 }))
      .toBe("Sin comprobantes en 90 días");
    expect(textoPulso({ comprobantes: 0, monto: 0, diasDesdeElUltimo: null }))
      .toBe("Todavía sin comprobantes");
    for (const p of [
      { comprobantes: 0, monto: 0, diasDesdeElUltimo: 200 },
      { comprobantes: 0, monto: 0, diasDesdeElUltimo: null },
    ]) {
      expect(textoPulso(p)).not.toContain("$");
      expect(textoPulso(p)).not.toContain("0 comprobantes");
    }
  });

  it("uno solo va en singular, y el de hoy no dice «hace 0 días»", () => {
    expect(textoPulso({ comprobantes: 1, monto: 250.5, diasDesdeElUltimo: 0 }))
      .toBe("1 comprobante · $250.50 · último hoy");
    expect(textoPulso({ comprobantes: 2, monto: 12, diasDesdeElUltimo: 1 }))
      .toBe("2 comprobantes · $12.00 · último hace 1 día");
  });
});

describe("las fechas se leen en Panamá, no en UTC", () => {
  it("un comprobante de las 8 de la noche de Panamá es de ESE día", () => {
    // 20:00 de Panamá = 01:00 UTC del día siguiente. Contarlo por UTC lo
    // adelantaría un día y «hace 13 días» diría 12.
    const p = resumirPulso([{ created_at: "2026-09-10T01:00:00.000Z", total: 5 }], HOY);
    expect(p.diasDesdeElUltimo).toBe(13); // 9-sep en Panamá, no 10-sep
  });

  it("`diasEntre` nunca devuelve un negativo ni se rompe con basura", () => {
    expect(diasEntre("2026-09-30", HOY)).toBe(0);
    expect(diasEntre("", HOY)).toBe(0);
    expect(diasEntre("no-es-fecha", HOY)).toBe(0);
  });

  it("una fila sin fecha no arrastra a las demás", () => {
    const p = resumirPulso(
      [{ created_at: "", total: 999 }, c("2026-09-19", 100)],
      HOY,
    );
    expect(p).toEqual({ comprobantes: 1, monto: 100, diasDesdeElUltimo: 3 });
  });

  it("un `total` que no es número suma 0, nunca NaN", () => {
    // 🔴 MUTACIÓN QUE SE CAZA: `Number(f.total)` a secas. `Number(null)` da 0,
    // pero un `total` ausente o con formato (lo que devuelve PostgREST para un
    // numeric mal serializado) da NaN — y un solo NaN vuelve «$NaN» el total de
    // la marca entera.
    const filas: FilaDeComprobante[] = [
      { created_at: "2026-09-19T15:00:00Z", total: null },
      { created_at: "2026-09-19T15:00:00Z", total: "1,200.00" },
      { created_at: "2026-09-19T15:00:00Z", total: undefined as never },
      { created_at: "2026-09-19T15:00:00Z", total: 40 },
    ];
    const p = resumirPulso(filas, HOY);
    expect(Number.isNaN(p.monto)).toBe(false);
    expect(p.monto).toBe(40);
    expect(textoPulso(p)).toContain("$40.00");
  });
});
