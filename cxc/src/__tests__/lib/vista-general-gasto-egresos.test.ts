/**
 * 🔴 EL GASTO DE VISTA GENERAL SALE DE EGRESOS VARIOS, NO DEL MAYOR (13-ago-2026).
 *
 * Daniel, textual, cuando se le explicó que el tablero usaba el mayor y el
 * módulo "Gastos" usaba Egresos Varios: *"esto no entendi bien, no deberia de
 * ser egresos varios y ya?"*.
 *
 * Los números de este archivo son los MEDIDOS contra producción el 13-ago-2026
 * (`scripts/_diag-gasto-mayor-vs-egresos.ts`, solo lectura):
 *
 *   vistana        ene $11.862,74 · feb $8.352,17 · mar $37.404,28 · abr $19.113,71
 *                  may $15.405,66 · jun $13.338,34 · jul $13.276,86  = $118.753,76
 *   fashion_wear   hasta mayo · fashion_shoes y active_wear hasta abril
 *   active_shoes, joystep, Boston y Multifashion: sin un solo egreso
 *
 * 🩸 LO QUE MÁS IMPORTA, y es lo que prueba media mitad del archivo: **NO se
 * puede restar $0**. Con la fuente nueva hay DOS formas de que el gasto quede
 * corto y las dos se ven idénticas a un dato bueno:
 *   · el mes que todavía no se cargó (`sin_movimientos`), que es el caso de casi
 *     todas las empresas hoy; y
 *   · el mes que SÍ tiene movimientos pero donde NADA cayó en el grupo 6
 *     (`sin_gasto`) — no es teórico: `active_wear` abril-2026 tiene 1 renglón,
 *     $278,20 que salieron y **$0,00 de gasto**.
 * Restarle cero a la utilidad bruta deja la rentabilidad igual a la utilidad —o
 * sea, preciosa— y verde una empresa que puede estar perdiendo plata.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  gastoEgresosMostrable,
  textoSinGastoEgresos,
  ETIQUETA_SIN_GASTO_EGRESOS,
  type MotivoSinGastoEgresos,
} from "@/lib/egresos/gasto-mostrable";
import { resumirMesEgresos, centAUsd, type ResumenEgresosMes } from "@/lib/egresos/reglas";
import { rentabilidadEmpresa } from "@/lib/vista-general-calc";
import type { EgresoLinea } from "@/lib/egresos/parser";

const raiz = join(__dirname, "..", "..", "..");
const leer = (rel: string) => readFileSync(join(raiz, rel), "utf8");

const MES = "2026-07";
const COBERTURA = [{ desde: "2026-01-01", hasta: "2026-08-13" }];

let seq = 0;
function linea(p: { cuenta: string; total: number; mes?: string }): EgresoLinea {
  seq += 1;
  return {
    fecha: `${p.mes ?? MES}-15`,
    mes: p.mes ?? MES,
    nInterno: `N${seq}`,
    cuenta: p.cuenta,
    sucursal: "",
    proveedor: "",
    referencia: `ref-${seq}`,
    totalCent: Math.round(p.total * 100),
    linea: seq,
  };
}

const resumen = (lineas: EgresoLinea[], mes = MES): ResumenEgresosMes =>
  resumirMesEgresos(mes, lineas, COBERTURA);

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 sólo el GRUPO 6 es gasto — el criterio llega del módulo Gastos", () => {
  // Las proporciones REALES de vistana: de lo que sale, menos de la mitad es gasto.
  const MES_REAL = [
    linea({ cuenta: "6.03.07.00.00", total: 1000 }), // gasto
    linea({ cuenta: "6.01.01.00.00", total: 500 }), // gasto (salarios)
    linea({ cuenta: "1.01.02.00.00", total: 8000 }), // transferencia entre cuentas propias
    linea({ cuenta: "2.01.05.01.00", total: 3000 }), // planilla por pagar
    linea({ cuenta: "3.01.01.00.00", total: 200 }), // patrimonio
    linea({ cuenta: "5.03.01.00.00", total: 700 }), // costo
  ];

  it("el gasto es el grupo 6 y NADA más", () => {
    const r = resumen(MES_REAL);
    expect(centAUsd(r.totalGastoCent)).toBe(1500);
    // Lo que salió es MUCHO más: usarlo contaría un préstamo devuelto como gasto.
    expect(centAUsd(r.totalSalidaCent)).toBe(13400);
  });

  it("lo que viaja a Vista General es el GASTO, no la salida", () => {
    const g = gastoEgresosMostrable(resumen(MES_REAL), true);
    expect(g.usable).toBe(true);
    expect(centAUsd(g.totalCent!)).toBe(1500);
    expect(centAUsd(g.totalCent!)).not.toBe(13400);
  });

  it("un mes de PURAS transferencias no produce gasto: es `sin_gasto`", () => {
    const g = gastoEgresosMostrable(
      resumen([linea({ cuenta: "1.01.02.00.00", total: 8000 })]),
      true,
    );
    expect(g.usable).toBe(false);
    expect(g.totalCent).toBeNull();
    expect(g.motivo).toBe("sin_gasto");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🩸 NO se puede restar $0 — las dos formas de quedar corto", () => {
  it("el caso REAL de active_wear abril: salió plata, nada fue gasto", () => {
    // Medido: 1 renglón, $278,20 de salida, $0,00 de gasto.
    const r = resumen([linea({ cuenta: "1.01.02.00.00", total: 278.2 })], "2026-04");
    expect(r.estado).toBe("con_movimientos");
    expect(r.totalGastoCent).toBe(0);

    const g = gastoEgresosMostrable(r, true);
    expect(g.usable).toBe(false);
    expect(g.motivo).toBe("sin_gasto");

    // Y la rentabilidad de esa empresa NO se calcula.
    const rent = rentabilidadEmpresa({ ventas: 50_000, utilidad: 20_000, gasto: null });
    expect(rent).toBeNull();
  });

  it("el mes que no se cargó tampoco produce número", () => {
    const g = gastoEgresosMostrable(resumen([], "2026-08"), true);
    expect(g.usable).toBe(false);
    expect(g.totalCent).toBeNull();
    expect(g.motivo).toBe("sin_movimientos");
  });

  it("🩸 restar cero dejaría la rentabilidad IGUAL a la utilidad bruta", () => {
    // La demostración de por qué esto importa: el número "bonito" que no se muestra.
    const conCero = rentabilidadEmpresa({ ventas: 50_000, utilidad: 20_000, gasto: 0 });
    expect(conCero!.monto).toBe(20_000); // ← preciosa, y falsa
    const sinDato = rentabilidadEmpresa({ ventas: 50_000, utilidad: 20_000, gasto: null });
    expect(sinDato).toBeNull(); // ← lo que hace el sistema
  });

  it("un gasto NEGATIVO (reversos) SÍ se muestra: no es cero", () => {
    // Misma postura que el mayor desde su primer día: un reverso no es un error.
    const r = resumen([
      linea({ cuenta: "6.03.07.00.00", total: 100 }),
      linea({ cuenta: "6.03.07.00.00", total: -300 }),
    ]);
    const g = gastoEgresosMostrable(r, true);
    expect(g.usable).toBe(true);
    expect(centAUsd(g.totalCent!)).toBe(-200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 el vocabulario es el de la FUENTE NUEVA", () => {
  const VIEJOS = ["sin_cerrar", "parcial", "sin_planilla"];

  it("ningún motivo del MAYOR sobrevive", () => {
    const motivos: MotivoSinGastoEgresos[] = [
      "sin_movimientos", "sin_datos", "no_automatico", "sin_gasto",
    ];
    for (const m of motivos) expect(VIEJOS).not.toContain(m);
    expect(Object.keys(ETIQUETA_SIN_GASTO_EGRESOS).sort()).toEqual(motivos.slice().sort());
  });

  it("los textos NO hablan de cierres contables ni de planilla", () => {
    const motivos: MotivoSinGastoEgresos[] = [
      "sin_movimientos", "sin_datos", "no_automatico", "sin_gasto",
    ];
    for (const m of motivos) {
      for (const hasta of [null, "julio 2026"]) {
        const t = textoSinGastoEgresos(m, hasta);
        expect(t.length).toBeGreaterThan(20);
        expect(t.toLowerCase()).not.toContain("cerró");
        expect(t.toLowerCase()).not.toContain("cerrado");
        expect(t.toLowerCase()).not.toContain("planilla");
        expect(t.toLowerCase()).not.toContain("contadora");
      }
    }
  });

  it("el texto DICE hasta qué mes llegan los gastos de esa empresa", () => {
    expect(textoSinGastoEgresos("sin_movimientos", "julio 2026")).toBe(
      "Los gastos de esta empresa llegan hasta julio 2026.",
    );
    expect(textoSinGastoEgresos("sin_movimientos", null)).toBe(
      "Todavía no hay gastos registrados de esta empresa.",
    );
  });

  it("las cuatro etiquetas se distinguen entre sí", () => {
    const labels = Object.values(ETIQUETA_SIN_GASTO_EGRESOS);
    expect(new Set(labels).size).toBe(labels.length);
    for (const l of labels) expect(l.length).toBeLessThanOrEqual(16);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 Boston no se baja sola, y la pantalla lo DICE", () => {
  it("sin datos y sin descarga automática → `no_automatico`, no `sin_datos`", () => {
    // "Sin traer" haría creer que alguien se lo va a traer. Nadie lo va a hacer.
    const r = resumirMesEgresos(MES, [], []); // sin cobertura → sin_datos
    expect(r.estado).toBe("sin_datos");
    expect(gastoEgresosMostrable(r, false).motivo).toBe("no_automatico");
    expect(gastoEgresosMostrable(r, true).motivo).toBe("sin_datos");
  });

  it("🩸 si alguien la trajo A MANO, su gasto vale igual que el de cualquiera", () => {
    // La bandera cambia el MOTIVO, nunca el número: mirarla antes de decidir si
    // hay número dejaría a Boston sin rentabilidad aunque tenga los datos.
    const r = resumen([linea({ cuenta: "6.03.07.00.00", total: 4000 })]);
    const g = gastoEgresosMostrable(r, false);
    expect(g.usable).toBe(true);
    expect(centAUsd(g.totalCent!)).toBe(4000);
    expect(g.motivo).toBeNull();
  });

  it("su texto manda a la otra fuente sin prometer que va a llegar sola", () => {
    const t = textoSinGastoEgresos("no_automatico", "mayo 2026");
    expect(t).toContain("no se traen solos");
    expect(t).toContain("mayo 2026");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("la rentabilidad de vistana con los números REALES de julio", () => {
  it("utilidad bruta − gasto de caja = rentabilidad", () => {
    // Gasto medido en producción para vistana, julio-2026.
    const GASTO = 13_276.86;
    const r = resumen([linea({ cuenta: "6.03.07.00.00", total: GASTO })]);
    const g = gastoEgresosMostrable(r, true);
    expect(centAUsd(g.totalCent!)).toBe(GASTO);

    const rent = rentabilidadEmpresa({ ventas: 100_000, utilidad: 30_000, gasto: centAUsd(g.totalCent!) });
    expect(rent!.monto).toBeCloseTo(30_000 - GASTO, 2);
    expect(rent!.pct).toBeCloseTo((30_000 - GASTO) / 100_000, 6);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 🩸 EL CRITERIO NO SE ESCRIBE DOS VECES.
//
// El módulo "Gastos" ya decide qué mes autoriza a mostrar un monto
// (`muestraMontoEgresos`). Si Vista General escribiera su propia versión, el día
// que difirieran Daniel no dejaría de creerle a la que está mal: dejaría de
// creerle a las dos. Acá se exige que coincidan estado por estado.
// ─────────────────────────────────────────────────────────────────────────────
describe("🩸 coincide con el criterio del módulo Gastos, estado por estado", () => {
  it("los tres estados dan el mismo veredicto en las dos pantallas", async () => {
    const { muestraMontoEgresos } = await import(
      "@/app/gastos-contabilidad/components/ResumenEgresos"
    );
    const casos: Array<{ lineas: EgresoLinea[]; cobertura: typeof COBERTURA }> = [
      { lineas: [linea({ cuenta: "6.03.07.00.00", total: 900 })], cobertura: COBERTURA },
      { lineas: [], cobertura: COBERTURA }, // sin_movimientos
      { lineas: [], cobertura: [] }, // sin_datos
    ];
    for (const c of casos) {
      const r = resumirMesEgresos(MES, c.lineas, c.cobertura);
      const mio = gastoEgresosMostrable(r, true).usable;
      const suyo = muestraMontoEgresos(r.estado);
      // Vista General puede ser MÁS estricta (el caso `sin_gasto`), nunca más
      // permisiva: no puede mostrar un número que el módulo Gastos oculta.
      if (mio) expect(suyo, `estado ${r.estado}`).toBe(true);
    }
  });

  it("la única diferencia autorizada es `sin_gasto`, y es MÁS estricta", async () => {
    const { muestraMontoEgresos } = await import(
      "@/app/gastos-contabilidad/components/ResumenEgresos"
    );
    const r = resumen([linea({ cuenta: "1.01.02.00.00", total: 278.2 })]);
    expect(muestraMontoEgresos(r.estado)).toBe(true); // el módulo pinta $0,00
    expect(gastoEgresosMostrable(r, true).usable).toBe(false); // el tablero no resta cero
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("la ruta de Vista General ya no toca el MAYOR", () => {
  const RUTA = leer("src/app/api/dashboard/vista-general/route.ts");
  const sinComentarios = RUTA.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("no importa nada de `lib/mayor`", () => {
    expect(sinComentarios).not.toMatch(/from\s+["']@\/lib\/mayor\//);
    expect(sinComentarios).not.toContain("leerMayorMes");
    expect(sinComentarios).not.toContain("gastoMostrable(");
  });

  it("lee los egresos con la MISMA función que el módulo Gastos", () => {
    expect(sinComentarios).toContain("leerEgresosMes");
    expect(sinComentarios).toContain("gastoEgresosMostrable");
  });

  it("🔴 usa `totalGastoCent`, NUNCA `totalSalidaCent`", () => {
    // Lo segundo contaría transferencias y préstamos devueltos como gasto.
    expect(sinComentarios).not.toContain("totalSalidaCent");
  });

  it("`gastos.total` sigue sin existir (no volvió con el cambio de fuente)", () => {
    expect(sinComentarios).not.toMatch(/\btotal:\s*conGasto/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("⚠️ el MAYOR no se apagó: sigue vivo para el módulo Gastos", () => {
  it("`lib/mayor` conserva sus dos piezas", () => {
    expect(leer("src/lib/mayor/leer.ts")).toContain("export async function leerMayorMes");
    expect(leer("src/lib/mayor/gastos.ts")).toContain("export function gastoMostrable");
  });

  it("y el módulo Gastos lo sigue leyendo", () => {
    const resumen = leer("src/app/api/gastos-contabilidad/resumen/route.ts");
    expect(resumen).toContain("leerMayorMes");
  });
});
