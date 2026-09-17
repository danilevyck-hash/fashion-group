/* ─────────────────────────────────────────────────────────────────────────────
 * LOS DÍAS DE VACACIONES QUE LE CORRESPONDEN — el candado (17-sep-2026).
 *
 * ⚠️ ESTE ARCHIVO CAMBIÓ DE DIRECCIÓN, y por eso la nota va fechada. Era
 * `asistencia-saldo-vacaciones.test.ts` y sostenía la regla del SALDO INICIAL:
 * contabilidad escribía los días que le quedaban a cada quien con su fecha de
 * corte, y de ahí en adelante el sistema sumaba lo ganado y restaba lo cargado.
 *
 * 🩸 Medido el 17-sep-2026: de las 49 fichas NINGUNA tenía un número —47 con las
 * dos columnas vacías y 2 con un 0 escrito al guardar la ficha—. O sea
 * que la pantalla decía «Falta el saldo» para todo el mundo y el número que
 * Daniel quería ver no se veía nunca.
 *
 * Daniel, textual: *«las vacaciones no funciona por día, hay que cambiar eso,
 * funciona que por cada 11 meses trabajado, 1 mes de vacaciones»* · *«1. Un mes
 * son 30 días corridos. 2. La fecha de ingreso que tiene la ficha. 3. [las ya
 * tomadas] lo vemos después»* · *«Quita lo del saldo vacaciones»*.
 *
 * 🔴 LO QUE NO CAMBIÓ —y son los CONTROLES de este cambio de dirección—:
 *   · la regla de la ley: 30 días por cada 11 MESES, con el bloque en curso
 *     prorrateado y TRUNCADO a día entero;
 *   · los días se cuentan de CALENDARIO, domingos adentro;
 *   · las vacaciones «ya pagadas» TAMBIÉN restan, y se cuentan aparte;
 *   · sin el dato NO sale un número: ni cero, ni uno grande. Los 245 días de
 *     ANGELA siguen siendo el caso a no repetir.
 *
 * 🔴 LO QUE SE AGREGÓ:
 *   · el número NO es un saldo y no se llama así: «Le corresponden N días»;
 *   · va siempre con la línea que dice que no incluye lo tomado antes;
 *   · 🔴 NO entra a ningún cálculo de plata, y hay barrido que lo exige;
 *   · las dos columnas del saldo a mano se RETIRAN, no se dropean.
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

import {
  avisoSinFechaIngreso,
  COLS_SALDO_VACACIONES_RETIRADAS,
  COMO_SE_CALCULA,
  correspondenA,
  DIAS_POR_PERIODO,
  diasGanados,
  diasTomados,
  MESES_POR_PERIODO,
  mesesCumplidos,
  MIGRACION_RETIRO_SALDO_VACACIONES,
  NO_INCLUYE_ANTES,
  ROTULO_CORRESPONDEN,
  textoCorresponden,
  textoDetalle,
  textoDias,
} from "@/lib/asistencia/vacaciones-corresponden";
import type { Vacacion } from "@/lib/asistencia/vacaciones";

const raiz = join(__dirname, "..", "..", "..");
const leer = (p: string) => readFileSync(join(raiz, p), "utf8");

const vac = (codigo: string, desde: string, hasta: string, ya = false): Vacacion => ({
  empleado_codigo: codigo, desde, hasta, ya_pagadas: ya,
});

// ═════════════════════════════════════════════════════════════════════════════
describe("1. 🔑 CONTROL — LA LEY NO CAMBIÓ: 30 días por cada 11 MESES", () => {
  it("son 30 y 11, no 30 y 12", () => {
    expect(DIAS_POR_PERIODO).toBe(30);
    expect(MESES_POR_PERIODO).toBe(11);
  });

  it("el mes cierra el mismo día del mes, y nunca da negativo", () => {
    expect(mesesCumplidos("2026-02-16", "2026-03-16")).toBe(1);
    expect(mesesCumplidos("2026-02-16", "2026-03-15")).toBe(0);
    expect(mesesCumplidos("2026-02-16", "2025-01-01")).toBe(0);
    expect(mesesCumplidos("2019-02-16", "2026-08-25")).toBe(90);
  });

  it("11 meses cumplidos = 30 días; el bloque en curso se TRUNCA", () => {
    expect(diasGanados("2026-01-16", "2026-12-16")).toBe(30);
    // 12 meses: un bloque (30) + 1 mes del siguiente → ⌊1 × 30/11⌋ = 2.
    expect(diasGanados("2026-01-16", "2027-01-16")).toBe(32);
    // 5 meses sueltos → ⌊5 × 30/11⌋ = 13.
    expect(diasGanados("2026-01-16", "2026-06-16")).toBe(13);
  });

  // 🔑 SE TRUNCA HACIA ABAJO: un día de más es un día que alguien se va sin
  // haberlo ganado, y eso después se paga en plata.
  it("🔴 nunca redondea hacia arriba", () => {
    // 10 meses → ⌊10 × 30/11⌋ = 27 (27,27…), no 28.
    expect(diasGanados("2026-01-16", "2026-11-16")).toBe(27);
  });

  it("🔴 sin fecha de ingreso devuelve null, NUNCA 0", () => {
    for (const f of [null, undefined, "", "no-es-fecha", "2026-13-40"]) {
      expect(diasGanados(f, "2026-09-17"), String(f)).toBeNull();
    }
  });

  it("quien todavía no empezó tiene 0, y ese cero sí es real", () => {
    expect(diasGanados("2026-12-01", "2026-09-17")).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("2. 🔑 CONTROL — lo registrado: calendario, y las «ya pagadas» restan", () => {
  it("los días son de CALENDARIO, con sus domingos adentro", () => {
    // 1 al 10 de octubre son 10 días corridos, no 8 hábiles.
    expect(diasTomados([vac("7", "2026-10-01", "2026-10-10")], "7").tomados).toBe(10);
  });

  it("🔴 las «ya pagadas» se cuentan APARTE y también restan", () => {
    const d = diasTomados(
      [vac("7", "2026-10-01", "2026-10-10"), vac("7", "2026-11-01", "2026-11-03", true)],
      "7",
    );
    expect(d).toEqual({ tomados: 10, yaPagados: 3 });
  });

  it("no se mezclan las de otra persona", () => {
    expect(diasTomados([vac("29", "2026-10-01", "2026-10-10")], "7"))
      .toEqual({ tomados: 0, yaPagados: 0 });
  });

  // ⚠️ Sin recorte por fecha: la cuenta mira TODO lo registrado. Un filtro por
  // quincena haría que lo tomado en mayo desapareciera en junio.
  it("⚠️ no filtra por fecha: cuenta todo lo que se le pase", () => {
    const d = diasTomados(
      [vac("7", "2019-01-01", "2019-01-10"), vac("7", "2026-10-01", "2026-10-10")],
      "7",
    );
    expect(d.tomados).toBe(20);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("3. 🔴 LO QUE LE CORRESPONDE — ganados menos lo registrado", () => {
  it("ANGELA: 30 ganados − 10 tomados = 20", () => {
    const c = correspondenA("7", "ANGELA GARCIA", "2025-10-17", [vac("7", "2026-10-01", "2026-10-10")], "2026-09-17");
    // 11 meses cumplidos al 17-sep-2026 → 30 ganados.
    expect(c.ganados).toBe(30);
    expect(c.tomados).toBe(10);
    expect(c.dias).toBe(20);
    expect(c.faltaFechaIngreso).toBe(false);
  });

  // 🔴 SIN FECHA DE INGRESO NO SALE UN NÚMERO. Ni cero, ni un negativo
  // inventado de restarle lo tomado a una nada.
  it("🔴 sin fecha de ingreso: dias = null, y se dice cuál falta", () => {
    const c = correspondenA("22", "ALEJANDRA", null, [vac("22", "2026-10-01", "2026-10-10")], "2026-09-17");
    expect(c.dias).toBeNull();
    expect(c.ganados).toBeNull();
    expect(c.faltaFechaIngreso).toBe(true);
    // Lo registrado igual viaja: no se esconde.
    expect(c.tomados).toBe(10);
  });

  // 🔴 LAS «YA PAGADAS» TAMBIÉN BAJAN EL NÚMERO, y acá se prueba sobre la
  // cuenta final —no solo sobre el contador—: el derecho se consumió igual,
  // solo que se cobró en vez de disfrutarse. Dejarlas afuera regalaría esos
  // días dos veces.
  it("🔴 las «ya pagadas» restan de lo que le corresponde", () => {
    const c = correspondenA("7", "ANGELA", "2025-10-17",
      [vac("7", "2026-10-01", "2026-10-10"), vac("7", "2026-11-01", "2026-11-03", true)], "2026-09-17");
    expect(c.ganados).toBe(30);
    expect(c.tomados).toBe(10);
    expect(c.yaPagados).toBe(3);
    expect(c.dias).toBe(17);
  });

  // 🔑 PUEDE DAR NEGATIVO y se muestra negativo: se adelantan vacaciones, y
  // recortar a cero escondería justo el caso que hay que mirar.
  it("🔑 puede dar NEGATIVO y no se recorta", () => {
    const c = correspondenA("7", "ANGELA", "2026-01-17", [vac("7", "2026-01-01", "2026-03-01")], "2026-09-17");
    expect(c.dias).toBeLessThan(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("4. 🔴 NO ES UN SALDO, Y LOS TEXTOS LO DICEN", () => {
  it("🔴 se lee «Le corresponden N días», nunca «le quedan»", () => {
    const c = correspondenA("7", "ANGELA", "2025-10-17", [], "2026-09-17");
    expect(ROTULO_CORRESPONDEN).toBe("Le corresponden");
    expect(textoCorresponden(c)).toBe("Le corresponden 30 días");
    expect(textoCorresponden(c)).not.toMatch(/quedan|saldo/i);
  });

  it("el singular es SOLO para el 1 exacto", () => {
    const uno = correspondenA("7", "A", "2026-08-17", [], "2026-09-17");
    expect(uno.dias).toBe(2);
    expect(textoDias(12)).toBe("12");
    expect(textoDias(12.5)).toBe("12.5");
  });

  it("sin fecha de ingreso, la frase que dice qué hacer", () => {
    const c = correspondenA("22", "ALEJANDRA", null, [], "2026-09-17");
    expect(textoCorresponden(c)).toBe("Falta la fecha de ingreso");
    expect(textoDetalle(c)).toBeNull();
  });

  it("el detalle deja auditar el número sin abrir otra pantalla", () => {
    const c = correspondenA("7", "A", "2025-10-17",
      [vac("7", "2026-10-01", "2026-10-10"), vac("7", "2026-11-01", "2026-11-03", true)], "2026-09-17");
    expect(textoDetalle(c)).toBe("30 ganados · tomó 10 · ya pagados 3");
  });

  // 🔴 LA LÍNEA QUE NO SE PUEDE SACAR.
  it("🔴 la línea del «no incluye» nombra el 17 de septiembre de 2026", () => {
    expect(NO_INCLUYE_ANTES).toContain("17 de septiembre de 2026");
    expect(NO_INCLUYE_ANTES).toMatch(/[Nn]o incluye/);
  });

  it("la regla se dice en una línea", () => {
    expect(COMO_SE_CALCULA).toContain("30 días corridos");
    expect(COMO_SE_CALCULA).toContain("11 meses");
    expect(COMO_SE_CALCULA).toContain("fecha de ingreso");
  });

  it("el aviso de a cuántos no se les puede calcular; sin ninguno, null", () => {
    expect(avisoSinFechaIngreso(20)).toContain("20 colaboradores no tienen fecha de ingreso");
    expect(avisoSinFechaIngreso(1)).toContain("1 colaborador no tiene fecha de ingreso");
    expect(avisoSinFechaIngreso(0)).toBeNull();
  });

  // 🔴 Español neutro, tuteo. Nunca voseo.
  it("🔴 los textos no tienen voseo", () => {
    const todos = [NO_INCLUYE_ANTES, COMO_SE_CALCULA, ROTULO_CORRESPONDEN, avisoSinFechaIngreso(2)!].join(" ");
    expect(todos).not.toMatch(/\b(elegí|escribí|revisá|guardá|tocá|mirá|acá|tenés|podés|vos)\b/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("5. 🔴 EL NÚMERO NO ENTRA A NINGÚN CÁLCULO DE PLATA", () => {
  // 🩸 Es el punto entero: nadie sabe qué se tomó antes del 17-sep-2026. Si
  // alguien lo lee como saldo y le paga 45 días a quien ya se tomó 30, eso es
  // plata de verdad.
  const MOTOR = [
    "src/lib/asistencia/planilla.ts",
    "src/lib/asistencia/reporte.ts",
    "src/lib/asistencia/corte-quincena.ts",
    "src/lib/asistencia/neto-no-negativo.ts",
    "src/lib/asistencia/prestamos-planilla.ts",
    "src/lib/asistencia/comprobante.ts",
    "src/lib/asistencia/cierre-prestamo.ts",
  ];

  it("🔴 ningún módulo que decide dinero importa `vacaciones-corresponden`", () => {
    for (const f of MOTOR) {
      expect(leer(f), f).not.toMatch(/vacaciones-corresponden/);
    }
  });

  it("🔴 el módulo no sabe de dinero: ni rata, ni salario, ni centavos", () => {
    const src = leer("src/lib/asistencia/vacaciones-corresponden.ts");
    expect(src).not.toMatch(/rataHora|salarioMensual|centavos\(/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("6. 🔴 LAS DOS COLUMNAS SE RETIRAN, NO SE DROPEAN", () => {
  it("la migración existe y solo pone COMMENT", () => {
    const sql = leer(`supabase/migrations/${MIGRACION_RETIRO_SALDO_VACACIONES}`);
    for (const col of COLS_SALDO_VACACIONES_RETIRADAS) {
      expect(sql).toContain(`COMMENT ON COLUMN asistencia_personas.${col}`);
    }
    expect(sql).not.toMatch(/DROP\s+COLUMN/i);
  });

  // 🔴 EL BUILD SE PONE ROJO SI UNA MIGRACIÓN LAS BORRA. Patrón `mayor_lineas`:
  // lo que se retira se queda en la base.
  it("🔴 ninguna migración dropea las dos columnas", () => {
    const dir = join(raiz, "supabase/migrations");
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql"))) {
      const sql = readFileSync(join(dir, f), "utf8");
      for (const col of COLS_SALDO_VACACIONES_RETIRADAS) {
        expect(
          new RegExp(`DROP\\s+COLUMN[^;]*${col}`, "i").test(sql),
          `${f} dropea ${col}`,
        ).toBe(false);
      }
    }
  });

  // 🔴 Y NADIE LAS VUELVE A LEER NI A ESCRIBIR. Sin esto, el saldo a mano
  // volvería por la puerta de atrás y habría dos números para lo mismo.
  it("🔴 el código de la app no nombra las columnas retiradas", () => {
    const dirs = ["src/lib/asistencia", "src/app/api/asistencia", "src/app/asistencia"];
    const vistos: string[] = [];
    const recorrer = (d: string) => {
      for (const e of readdirSync(join(raiz, d), { withFileTypes: true })) {
        const rel = `${d}/${e.name}`;
        if (e.isDirectory()) { recorrer(rel); continue; }
        if (!/\.(ts|tsx)$/.test(e.name)) continue;
        // ⚠️ El módulo de la regla SÍ las nombra —en `COLS_SALDO_VACACIONES_
        // RETIRADAS`, que es justo la lista que este candado usa para
        // buscarlas—. Es el único lugar donde pueden aparecer.
        if (rel.endsWith("/vacaciones-corresponden.ts")) continue;
        const src = readFileSync(join(raiz, rel), "utf8")
          // Sin comentarios: la nota de por qué se fueron SÍ las nombra.
          .replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
          // Ni el JSX comentado, que es donde quedó la nota de la ficha.
          .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
        for (const col of COLS_SALDO_VACACIONES_RETIRADAS) {
          if (src.includes(col)) vistos.push(`${rel}: ${col}`);
        }
      }
    };
    for (const d of dirs) recorrer(d);
    expect(vistos, "las columnas retiradas no se leen ni se escriben").toEqual([]);
  });

  it("⛔ el módulo viejo del saldo a mano ya no existe", () => {
    expect(() => leer("src/lib/asistencia/saldo-vacaciones.ts")).toThrow();
  });
});
